const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { connectDB } = require('./db');
const User = require('./models/User');
const Entry = require('./models/Entry');
const { signToken, setAuthCookie, clearAuthCookie, requireAuth, requireAdmin } = require('./auth');
const T = require('./tournament');
const { buni, normalizeMpesaPhone } = require('./payments');

const app = express();
const PORT = process.env.PORT || 3000;
const FEE = Number(process.env.ENTRY_FEE || 200);
const CAPACITY = Number(process.env.CAPACITY || 1000);
const STARTS_AT = process.env.TOURNAMENT_START || '2026-12-31T10:00:00+03:00';
const MPESA = {
  paybill: process.env.MPESA_PAYBILL || 'XXXXXX',
  account: process.env.MPESA_ACCOUNT || 'EFOOTBALL',
  name: process.env.MPESA_NAME || 'Tournament organiser'
};

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Wraps async route handlers so errors reach the error handler.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const idStr = (v) => String(v);

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// Player record in the shape the frontend expects.
async function playerView(userId) {
  const u = await User.findById(userId).lean();
  if (!u) return null;
  const e = await Entry.findOne({ user: u._id }).lean();
  return {
    id: idStr(u._id),
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    paid: u.paid,
    payment_ref: u.paymentRef,
    mpesa_phone: u.mpesaPhone,
    stage: e?.stage,
    group_no: e?.groupNo,
    pool_no: e?.poolNo,
    status: e?.status
  };
}

async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'admin@tournament.local').toLowerCase();
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) return console.warn('ADMIN_PASSWORD not set: no admin account created.');
  if (!(await User.exists({ email }))) {
    await User.create({
      name: 'Administrator',
      email,
      phone: '-',
      passwordHash: await bcrypt.hash(pass, 10),
      role: 'admin',
      paid: true
    });
    console.log('Admin account created for', email);
  }
}

/* ---------- config ---------- */
app.get('/api/config', ah(async (req, res) => {
  const registered = await User.countDocuments({ role: 'player' });
  res.json({ fee: FEE, capacity: CAPACITY, registered, startsAt: STARTS_AT, mpesa: MPESA });
}));

/* ---------- auth ---------- */
app.post('/api/auth/register', ah(async (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const phone = (req.body.phone || '').trim();
  const password = req.body.password || '';

  if (!name || !email || !phone || !password)
    return res.status(400).json({ error: 'All fields are required.' });
  if (!isEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  if ((await User.countDocuments({ role: 'player' })) >= CAPACITY)
    return res.status(400).json({ error: 'Registration is full.' });
  if (await User.exists({ email }))
    return res.status(409).json({ error: 'An account with this email already exists.' });

  const user = await User.create({ name, email, phone, passwordHash: await bcrypt.hash(password, 10) });
  setAuthCookie(res, signToken({ id: idStr(user._id), role: 'player', name }));
  res.status(201).json({ user: { id: idStr(user._id), name, paid: false }, fee: FEE });
}));

app.post('/api/auth/login', ah(async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    return res.status(401).json({ error: 'Incorrect email or password.' });

  setAuthCookie(res, signToken({ id: idStr(user._id), role: user.role, name: user.name }));
  res.json({ user: { id: idStr(user._id), name: user.name, role: user.role } });
}));

app.post('/api/auth/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, ah(async (req, res) => {
  const user = await playerView(req.user.id);
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  res.json({ user });
}));

/* ---------- manual M-Pesa code (backup) ---------- */
app.post('/api/payments/submit', requireAuth, ah(async (req, res) => {
  const ref = String(req.body.payment_ref || '').trim().toUpperCase();
  const phone = normalizeMpesaPhone(req.body.mpesa_phone);

  if (!phone)
    return res.status(400).json({ error: 'Enter a valid M-Pesa number: 07XX XXX XXX or 254 7XX XXX XXX.' });
  if (!/^[A-Z0-9]{6,20}$/.test(ref))
    return res.status(400).json({ error: 'Enter the M-Pesa confirmation code (6 to 20 letters or numbers).' });

  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  if (user.paid) return res.status(400).json({ error: 'Your payment is already confirmed.' });

  user.paymentRef = ref;
  user.mpesaPhone = phone;
  await user.save();
  res.json({ ok: true, payment_ref: ref, mpesa_phone: phone });
}));

/* ---------- KCB Buni STK push ---------- */
app.post('/api/payments/buni/start', requireAuth, ah(async (req, res) => {
  const phone = normalizeMpesaPhone(req.body.mpesa_phone);
  if (!phone)
    return res.status(400).json({ error: 'Enter a valid M-Pesa number: 07XX XXX XXX or 254 7XX XXX XXX.' });

  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  if (user.paid) return res.status(400).json({ error: 'Your payment is already confirmed.' });

  try {
    user.buniCheckoutId = await buni.startStkPush(idStr(user._id), phone);
    user.buniStatus = 'pending';
    user.mpesaPhone = phone;
    await user.save();
    res.json({ ok: true, mpesa_phone: phone });
  } catch (err) {
    console.error('KCB Buni STK push error:', err.response?.data || err.message);
    res.status(502).json({
      error: 'Could not send the M-Pesa prompt. Check the number and try again, or pay manually with the code below.'
    });
  }
}));

app.get('/api/payments/buni/status', requireAuth, ah(async (req, res) => {
  const user = await User.findById(req.user.id, 'paid buniStatus').lean();
  if (!user) return res.status(404).json({ error: 'Account not found.' });
  res.json({ paid: !!user.paid, status: user.buniStatus || null });
}));

// Called by KCB Buni. Always answers 200 so the gateway does not keep retrying.
app.post('/api/payments/buni/callback', ah(async (req, res) => {
  try {
    const result = await buni.handleCallback(req.body);
    if (!result.ok) console.log('KCB Buni callback not applied:', result.reason);
    else console.log('KCB Buni payment confirmed for user', result.userId);
  } catch (err) {
    console.error('KCB Buni callback error:', err.message);
  }
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
}));

/* ---------- public tournament ---------- */
app.get('/api/tournament', ah(async (req, res) => {
  res.json(await T.getView());
}));

/* ---------- admin ---------- */
app.get('/api/admin/users', requireAdmin, ah(async (req, res) => {
  const players = await User.find({ role: 'player' }).sort({ _id: -1 }).lean();
  const entries = await Entry.find({ user: { $in: players.map((p) => p._id) } }).lean();
  const byUser = new Map(entries.map((e) => [idStr(e.user), e]));

  res.json({
    users: players.map((u) => {
      const e = byUser.get(idStr(u._id));
      return {
        id: idStr(u._id),
        name: u.name,
        email: u.email,
        phone: u.phone,
        mpesa_phone: u.mpesaPhone,
        paid: u.paid,
        payment_ref: u.paymentRef,
        stage: e?.stage,
        group_no: e?.groupNo,
        pool_no: e?.poolNo,
        status: e?.status
      };
    })
  });
}));

app.post('/api/admin/users/:id/confirm-payment', requireAdmin, ah(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Player not found.' });
  const user = await User.findOne({ _id: req.params.id, role: 'player' });
  if (!user) return res.status(404).json({ error: 'Player not found.' });

  const ref = String(req.body.payment_ref || user.paymentRef || '').trim().toUpperCase();
  if (!ref) return res.status(400).json({ error: 'Enter the M-Pesa confirmation code.' });

  user.paid = true;
  user.paidAt = new Date();
  user.paymentRef = ref;
  await user.save();
  await Entry.updateOne(
    { user: user._id },
    { $setOnInsert: { stage: 'S1', groupNo: null, poolNo: null, status: 'active' } },
    { upsert: true }
  );
  res.json({ ok: true });
}));

app.post('/api/admin/advance', requireAdmin, ah(async (req, res) => {
  try {
    res.json({ message: await T.advance() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

app.post('/api/admin/matches/:id/result', requireAdmin, ah(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Match not found.' });
  const h = Number(req.body.home_score);
  const a = Number(req.body.away_score);
  if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0 || h > 99 || a > 99)
    return res.status(400).json({ error: 'Scores must be whole numbers between 0 and 99.' });
  try {
    await T.recordResult(req.params.id, h, a);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error. Please try again.' });
});

async function main() {
  await connectDB();
  await seedAdmin();
  app.listen(PORT, () => console.log(`Tournament site running on http://localhost:${PORT}`));
}

main().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
