const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Configuration. Every value is trimmed: stray spaces / \r in .env or in the
// Render dashboard are a classic cause of "invalid_client".
// ---------------------------------------------------------------------------
const env = (...names) => {
  for (const n of names) {
    const v = process.env[n];
    if (v !== undefined && String(v).trim() !== '') return String(v).trim().replace(/^["']|["']$/g, '');
  }
  return '';
};

const CONFIG = {
  clientId: env('KCB_CLIENT_ID', 'KCB_CONSUMER_KEY', 'KCB_BUNI_API_KEY'),
  clientSecret: env('KCB_CLIENT_SECRET', 'KCB_CONSUMER_SECRET', 'KCB_BUNI_API_SECRET'),
  merchantCode: env('KCB_MERCHANT_CODE', 'KCB_BUNI_MERCHANT_CODE'),
  // What KCB calls invoiceNumber: the KCB account / till the money settles to.
  invoiceNumber: env('KCB_INVOICE_NUMBER'),
  orgShortCode: env('KCB_ORG_SHORT_CODE') || '522522',
  orgPassKey: env('KCB_ORG_PASS_KEY'), // empty for the shared short code
  sharedShortCode: env('KCB_SHARED_SHORT_CODE') !== 'false',
  baseUrl: env('BASE_URL') || `http://localhost:${process.env.PORT || 3000}`,
  environment: env('ENVIRONMENT') || 'production'
};
CONFIG.invoiceNumber = CONFIG.invoiceNumber || CONFIG.merchantCode;

// KCB publishes the token endpoint and the API host together. Set both
// KCB_TOKEN_URL and KCB_STK_URL to pin them. If you don't, we try the known
// production pairs in order and remember the first one that accepts your keys.
const pinnedTarget = env('KCB_TOKEN_URL') && env('KCB_STK_URL')
  ? [{ name: 'configured', tokenUrl: env('KCB_TOKEN_URL'), stkUrl: env('KCB_STK_URL') }]
  : null;

const UAT = env('KCB_ENV') === 'uat' || CONFIG.environment === 'uat';
const TARGETS = pinnedTarget || (UAT
  ? [{ name: 'uat', tokenUrl: 'https://uat.buni.kcbgroup.com/token', stkUrl: 'https://uat.buni.kcbgroup.com/mm/api/request/1.0.0/stkpush' }]
  : [
      { name: 'production (buni.kcbgroup.com)', tokenUrl: 'https://buni.kcbgroup.com/token', stkUrl: 'https://buni.kcbgroup.com/mm/api/request/1.0.0/stkpush' },
      { name: 'production (api.buni.kcbgroup.com)', tokenUrl: 'https://api.buni.kcbgroup.com/token', stkUrl: 'https://api.buni.kcbgroup.com/mm/api/request/1.0.0/stkpush' },
      { name: 'production (oauth2)', tokenUrl: 'https://accounts.buni.kcbgroup.com/oauth2/token', stkUrl: 'https://buni.kcbgroup.com/mm/api/request/1.0.0/stkpush', form: true }
    ]);

console.log('KCB config check:', {
  clientId: CONFIG.clientId ? `loaded (${CONFIG.clientId.length} chars)` : 'MISSING',
  clientSecret: CONFIG.clientSecret ? `loaded (${CONFIG.clientSecret.length} chars)` : 'MISSING',
  invoiceNumber: CONFIG.invoiceNumber ? 'loaded' : 'MISSING',
  orgShortCode: CONFIG.orgShortCode,
  baseUrl: CONFIG.baseUrl
});

// ---------------------------------------------------------------------------
// OAuth token (Basic auth with key:secret, cached until shortly before expiry)
// ---------------------------------------------------------------------------
let tokenCache = { token: null, expiresAt: 0, target: null };

async function getAccessToken(force = false) {
  if (!force && tokenCache.token && Date.now() < tokenCache.expiresAt) {
    return tokenCache;
  }
  if (!CONFIG.clientId || !CONFIG.clientSecret) {
    throw new Error('KCB_CLIENT_ID / KCB_CLIENT_SECRET are not set on the server');
  }

  const basic = Buffer.from(`${CONFIG.clientId}:${CONFIG.clientSecret}`).toString('base64');
  // Try the target that worked last time first.
  const ordered = tokenCache.target
    ? [tokenCache.target, ...TARGETS.filter(t => t !== tokenCache.target)]
    : TARGETS;

  const failures = [];
  for (const target of ordered) {
    try {
      const res = await axios.post(
        target.tokenUrl,
        target.form ? 'grant_type=client_credentials' : null,
        {
          headers: {
            Authorization: `Basic ${basic}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 15000
        }
      );
      const token = res.data && res.data.access_token;
      if (!token) throw new Error('response had no access_token');
      const ttl = Number(res.data.expires_in) || 3600;
      tokenCache = { token, expiresAt: Date.now() + (ttl - 120) * 1000, target };
      console.log(`Token OK via ${target.name}`);
      return tokenCache;
    } catch (err) {
      const why = err.response
        ? `${err.response.status} ${JSON.stringify(err.response.data)}`
        : err.code || err.message;
      console.error(`Token failed via ${target.name}: ${why}`);
      failures.push({ target: target.name, why });
    }
  }
  const e = new Error('Could not get a KCB access token from any endpoint');
  e.failures = failures;
  throw e;
}

// ---------------------------------------------------------------------------
// Payments (in-memory; swap for a database if you need history across restarts)
// ---------------------------------------------------------------------------
const payments = new Map(); // CheckoutRequestID -> { status, amount, phone, receipt, message, createdAt }

function normalizePhone(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (/^254\d{9}$/.test(digits)) return digits;
  if (/^0\d{9}$/.test(digits)) return '254' + digits.slice(1);
  if (/^\d{9}$/.test(digits)) return '254' + digits;
  return null;
}

app.post('/api/pay', async (req, res) => {
  const phone = normalizePhone(req.body.phoneNumber);
  const amount = parseInt(req.body.amount, 10);

  if (!phone) return res.status(400).json({ error: 'Enter a valid phone number, e.g. 254712345678' });
  if (!Number.isInteger(amount) || amount < 1) return res.status(400).json({ error: 'Amount must be at least 1' });

  const orderRef = `ORD-${Date.now()}`;
  // Generate unique invoice number: timestamp + random suffix
  const uniqueInvoice = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  const body = {
    phoneNumber: phone,
    amount: String(amount),
    invoiceNumber: uniqueInvoice,
    sharedShortCode: CONFIG.sharedShortCode,
    orgShortCode: CONFIG.orgShortCode,
    orgPassKey: CONFIG.orgPassKey,
    callbackUrl: `${CONFIG.baseUrl}/api/kcb-callback`,
    transactionDescription: 'Payment' // M-PESA screen limit is ~13 chars
  };

  console.log('STK push request:', { ...body, invoiceNumber: body.invoiceNumber ? '***' : '' });

  const send = async (auth) =>
    axios.post(auth.target.stkUrl, body, {
      headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
      timeout: 20000
    });

  try {
    let auth = await getAccessToken();
    let kcb;
    try {
      kcb = await send(auth);
    } catch (err) {
      if (err.response && err.response.status === 401) {
        auth = await getAccessToken(true); // token expired early: refresh once
        kcb = await send(auth);
      } else throw err;
    }

    const r = kcb.data.response || {};
    const h = kcb.data.header || {};
    console.log('STK push response:', JSON.stringify(kcb.data));

    const ok = String(r.ResponseCode) === '0' && (h.statusCode === undefined || String(h.statusCode) === '0');
    if (!ok || !r.CheckoutRequestID) {
      return res.status(502).json({
        error: r.ResponseDescription || h.statusDescription || 'KCB did not accept the payment request'
      });
    }

    payments.set(r.CheckoutRequestID, { status: 'PENDING', amount, phone, orderRef, createdAt: Date.now() });
    res.json({
      success: true,
      checkoutRequestId: r.CheckoutRequestID,
      message: r.CustomerMessage || 'Check your phone and enter your M-PESA PIN'
    });
  } catch (err) {
    console.error('Payment error:', err.failures || err.response?.data || err.message);
    if (err.failures) {
      return res.status(502).json({
        error: 'Payment service could not authenticate with KCB. Check the server logs and /api/diagnose.'
      });
    }
    res.status(err.response?.status || 500).json({
      error: err.response?.data?.header?.statusDescription ||
             err.response?.data?.errorMessage ||
             err.response?.data?.message ||
             'Failed to initiate payment. Please try again.'
    });
  }
});

// Frontend polls this until the callback arrives
app.get('/api/payment-status/:id', (req, res) => {
  const p = payments.get(req.params.id);
  if (!p) return res.status(404).json({ status: 'UNKNOWN' });
  res.json({ status: p.status, receipt: p.receipt, message: p.message, amount: p.amount });
});

// KCB posts the final result here. Must be public HTTPS (your Render URL).
app.post('/api/kcb-callback', (req, res) => {
  try {
    console.log('KCB callback:', JSON.stringify(req.body));
    const cb = (req.body && req.body.Body && req.body.Body.stkCallback) || req.body.stkCallback || req.body || {};
    const id = cb.CheckoutRequestID;
    const code = String(cb.ResultCode);
    const items = (cb.CallbackMetadata && cb.CallbackMetadata.Item) || [];
    const meta = Object.fromEntries(items.map(i => [i.Name, i.Value]));

    const existing = payments.get(id) || {};
    const record = {
      ...existing,
      status: code === '0' ? 'SUCCESS' : 'FAILED',
      receipt: meta.MpesaReceiptNumber,
      message: cb.ResultDesc,
      paidAmount: meta.Amount,
      phone: meta.PhoneNumber || existing.phone,
      completedAt: Date.now()
    };
    if (id) payments.set(id, record);

    fs.appendFileSync(path.join(__dirname, 'transactions.log'),
      JSON.stringify({ id, ...record, at: new Date().toISOString() }) + '\n');
  } catch (err) {
    console.error('Callback processing error:', err);
  }
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' }); // always acknowledge
});

// Free sanity check: hits the token endpoint only, never sends a payment and
// never prints secrets. Visit /api/diagnose after deploying.
app.get('/api/diagnose', async (req, res) => {
  const info = {
    clientIdLength: CONFIG.clientId.length,
    clientSecretLength: CONFIG.clientSecret.length,
    clientIdHasWhitespace: /\s/.test(CONFIG.clientId),
    clientSecretHasWhitespace: /\s/.test(CONFIG.clientSecret),
    invoiceNumberSet: !!CONFIG.invoiceNumber,
    callbackUrl: `${CONFIG.baseUrl}/api/kcb-callback`,
    callbackIsPublicHttps: /^https:\/\//.test(CONFIG.baseUrl) && !/localhost|127\.0\.0\.1/.test(CONFIG.baseUrl)
  };
  try {
    const t = await getAccessToken(true);
    res.json({ ok: true, tokenFrom: t.target.name, ...info });
  } catch (err) {
    res.status(502).json({ ok: false, failures: err.failures || err.message, ...info });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`KCB Buni payment server running on port ${PORT}`));