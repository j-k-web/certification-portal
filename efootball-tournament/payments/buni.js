// KCB Buni M-PESA STK push, ported from certification-portal/backend/server.js.
const axios = require('axios');
const User = require('../models/User');
const Entry = require('../models/Entry');

const TOKEN_URL = 'https://api.buni.kcbgroup.com/token?grant_type=client_credentials';
const STK_URL = 'https://api.buni.kcbgroup.com/mm/api/request/1.0.0/stkpush';
const FEE = Number(process.env.ENTRY_FEE || 200);

async function getToken() {
  const id = process.env.BUNI_CLIENT_ID;
  const secret = process.env.BUNI_CLIENT_SECRET;
  if (!id || !secret) throw new Error('KCB Buni credentials are not configured on the server.');
  const creds = Buffer.from(`${id}:${secret}`).toString('base64');
  const r = await axios.post(TOKEN_URL, {}, {
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000
  });
  return r.data.access_token;
}

// Sends the STK push and returns the CheckoutRequestID used to match the callback later.
async function startStkPush(userId, phone254) {
  const merchant = process.env.BUNI_MERCHANT_CODE;
  const callbackUrl = process.env.BUNI_CALLBACK_URL;
  if (!merchant || !callbackUrl) throw new Error('KCB Buni merchant code or callback URL is not configured.');

  const token = await getToken();
  const payload = {
    phoneNumber: phone254,
    amount: String(FEE),
    invoiceNumber: `${merchant}-EFB-${userId}-${Date.now()}`,
    sharedShortCode: true,
    orgShortCode: '',
    orgPassKey: '',
    callbackUrl,
    transactionDescription: 'Tournament entry fee'
  };
  const r = await axios.post(STK_URL, payload, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    timeout: 20000
  });
  const checkoutId = r.data?.response?.CheckoutRequestID;
  if (!checkoutId) throw new Error('KCB Buni did not return a payment reference. Try again.');
  return checkoutId;
}

// Only marks a player paid when the checkout ID matches a pending request we created
// and the amount paid is at least the entry fee.
async function handleCallback(body) {
  const stk = body?.Body?.stkCallback || body?.stkCallback || body || {};
  const resultCode = Number(stk.ResultCode ?? body?.ResultCode ?? body?.resultCode);
  const checkoutId = stk.CheckoutRequestID || body?.CheckoutRequestID;
  if (!checkoutId) return { ok: false, reason: 'missing checkout id' };

  const user = await User.findOne({ buniCheckoutId: checkoutId });
  if (!user) return { ok: false, reason: 'unknown checkout id' };

  if (resultCode !== 0) {
    await User.updateOne({ _id: user._id, paid: false }, { $set: { buniStatus: 'failed' } });
    return { ok: false, reason: `payment not completed (code ${resultCode})` };
  }

  const items = stk.CallbackMetadata?.Item || [];
  const amount = Number(items.find((i) => i.Name === 'Amount')?.Value);
  const receipt = items.find((i) => i.Name === 'MpesaReceiptNumber')?.Value;
  if (amount && amount < FEE) {
    await User.updateOne({ _id: user._id, paid: false }, { $set: { buniStatus: 'failed' } });
    return { ok: false, reason: `amount ${amount} is below the fee` };
  }

  if (!user.paid) {
    await User.updateOne({ _id: user._id }, {
      $set: {
        paid: true,
        paidAt: new Date(),
        paymentRef: String(receipt || checkoutId).toUpperCase(),
        buniStatus: 'paid'
      }
    });
    await Entry.updateOne(
      { user: user._id },
      { $setOnInsert: { stage: 'S1', groupNo: null, poolNo: null, status: 'active' } },
      { upsert: true }
    );
  }
  return { ok: true, userId: String(user._id) };
}

module.exports = { startStkPush, handleCallback };
