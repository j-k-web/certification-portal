require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const session = require('express-session');
const axios = require('axios');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const fs = require('fs');

const User = require('./models/User');
const Content = require('./models/Content');
const Exam = require('./models/Exam');

const app = express();
app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'kalmot-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 4
  }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('MongoDB Error:', err));

// Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'));
  }
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

// ── Middleware ──
const ensureAuth = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ success: false, message: 'Please log in.' });
  next();
};
const ensureAdmin = (req, res, next) => {
  if (!req.session.user?.isAdmin) return res.status(403).json({ success: false, message: 'Admin only.' });
  next();
};

// ── Track config ──
const TRACKS = {
  programming: { name: 'Programming', price: 12000, deposit: 6000 },
  webtech: { name: 'Web Technologies', price: 12000, deposit: 6000 },
  cybersecurity: { name: 'Cybersecurity', price: 12000, deposit: 6000 },
  msoffice: { name: 'Microsoft Office Package', price: 12000, deposit: 6000 }
};
const BUNDLE_DEPOSIT = 24000;
const BUNDLE_BALANCE = 24000;

// ════════════════════════════════════════════
// AUTH ROUTES
// ════════════════════════════════════════════
app.post('/register', async (req, res) => {
  try {
    const { fullname, phone, email, password } = req.body;
    if (!fullname || !phone || !email || !password)
      return res.status(400).json({ success: false, message: 'All fields are required.' });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ success: false, message: 'Email already registered.' });

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ fullname, phone, email: email.toLowerCase(), password: hashed });
    await user.save();
    res.json({ success: true, message: 'Registration successful. Please log in.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ success: false, message: 'Invalid email or password.' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ success: false, message: 'Invalid email or password.' });

    req.session.user = {
      _id: user._id,
      email: user.email,
      fullname: user.fullname,
      phone: user.phone,
      isAdmin: user.email === process.env.ADMIN_EMAIL
    };
    res.json({ success: true, isAdmin: req.session.user.isAdmin });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/index.html');
});

app.get('/user-info', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  try {
    const user = await User.findOne({ email: req.session.user.email }, '-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      _id: user._id,
      email: user.email,
      fullname: user.fullname,
      phone: user.phone,
      enrolledTracks: user.enrolledTracks,
      isBundleStudent: user.isBundleStudent,
      payments: user.payments,
      examResults: user.examResults,
      isAdmin: req.session.user.isAdmin || false
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════
// ENROLLMENT
// ════════════════════════════════════════════
app.post('/enroll', ensureAuth, async (req, res) => {
  try {
    const { tracks, isBundle } = req.body;
    const user = await User.findOne({ email: req.session.user.email });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    const tracksToAdd = isBundle ? Object.keys(TRACKS) : (Array.isArray(tracks) ? tracks : [tracks]);

    for (const track of tracksToAdd) {
      if (!TRACKS[track]) continue;
      if (!user.enrolledTracks.includes(track)) {
        user.enrolledTracks.push(track);
        user.payments.push({
          track,
          depositPaid: false, depositAmount: 0,
          balancePaid: false, balanceAmount: 0,
          totalPaid: 0
        });
      }
    }
    if (isBundle) user.isBundleStudent = true;
    await user.save();
    res.json({ success: true, message: 'Enrolled successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════
// SESSION TIMER
// ════════════════════════════════════════════
app.post('/session/log', ensureAuth, async (req, res) => {
  try {
    const { track, minutes } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const user = await User.findOne({ email: req.session.user.email });
    if (!user) return res.status(404).json({ success: false });

    let log = user.sessionLogs.find(l => l.track === track && l.date === today);
    if (log) {
      log.minutesUsed += minutes;
    } else {
      user.sessionLogs.push({ track, date: today, minutesUsed: minutes });
    }
    await user.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.get('/session/today/:track', ensureAuth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const user = await User.findOne({ email: req.session.user.email });
    const log = user?.sessionLogs.find(l => l.track === req.params.track && l.date === today);
    res.json({ minutesUsed: log?.minutesUsed || 0 });
  } catch (err) {
    res.json({ minutesUsed: 0 });
  }
});

// ════════════════════════════════════════════
// KCB BUNI PAYMENT
// ════════════════════════════════════════════
const generateBuniToken = async (req, res, next) => {
  try {
    const creds = Buffer.from(`${process.env.BUNI_CLIENT_ID}:${process.env.BUNI_CLIENT_SECRET}`).toString('base64');
    const tokenRes = await axios.post(
      'https://api.buni.kcbgroup.com/token?grant_type=client_credentials',
      {}, { headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/json' } }
    );
    req.buniToken = tokenRes.data.access_token;
    next();
  } catch (err) {
    console.error('KCB Buni Token Error:', err.response?.data || err.message);
    return res.status(500).json({ success: false, message: 'Payment service unavailable.' });
  }
};

app.post('/pay', ensureAuth, generateBuniToken, async (req, res) => {
  try {
    let { phone, track, paymentType } = req.body; // paymentType: 'deposit' or 'balance'
    if (!phone || !track || !paymentType)
      return res.status(400).json({ success: false, message: 'Phone, track and payment type required.' });

    const user = await User.findOne({ email: req.session.user.email });
    const trackPayment = user.payments.find(p => p.track === track);
    if (!trackPayment) return res.status(400).json({ success: false, message: 'Not enrolled in this track.' });

    // Determine amount
    let amount;
    if (user.isBundleStudent) {
      amount = paymentType === 'deposit' ? BUNDLE_DEPOSIT : BUNDLE_BALANCE;
    } else {
      amount = paymentType === 'deposit' ? TRACKS[track].deposit : TRACKS[track].price - TRACKS[track].deposit;
    }

    phone = phone.replace(/\D/g, '');
    if (phone.startsWith('0')) phone = '254' + phone.slice(1);
    if (phone.startsWith('7') || phone.startsWith('1')) phone = '254' + phone;

    console.log(`📱 STK Push to ${phone} — ${track} ${paymentType} KES ${amount}`);

    const tillNumber = process.env.BUNI_MERCHANT_CODE || '8125462';
    const payload = {
      phoneNumber: phone,
      amount: String(amount),
      invoiceNumber: tillNumber + '-KALMOT-' + Date.now(),
      sharedShortCode: true,
      orgShortCode: '',
      orgPassKey: '',
      callbackUrl: process.env.BUNI_CALLBACK_URL,
      transactionDescription: `KALMOT ${track} ${paymentType}`
    };
    console.log('📦 Payload:', JSON.stringify(payload));

    const stkRes = await axios.post(
      'https://api.buni.kcbgroup.com/mm/api/request/1.0.0/stkpush',
      payload,
      { headers: { Authorization: `Bearer ${req.buniToken}`, 'Content-Type': 'application/json' } }
    );

    const checkoutID = stkRes.data?.response?.CheckoutRequestID;
    if (checkoutID) {
      await User.findOneAndUpdate(
        { email: req.session.user.email },
        { buniCheckoutID: checkoutID, pendingPaymentTrack: track, pendingPaymentType: paymentType }
      );
    }

    res.json({ success: true, message: 'stk_sent', amount });
  } catch (err) {
    console.error('KCB Buni STK Error:', err.response?.data || err.message);
    res.status(500).json({ success: false, message: 'Payment initiation failed.' });
  }
});

// KCB Buni Callback
app.post('/buni-callback', async (req, res) => {
  const payload = req.body;
  console.log('💰 Callback:', JSON.stringify(payload));

  const resultCode = payload?.Body?.stkCallback?.ResultCode ?? payload?.ResultCode ?? payload?.resultCode;
  const checkoutID = payload?.Body?.stkCallback?.CheckoutRequestID || payload?.CheckoutRequestID;

  if (resultCode === 0 || resultCode === '0') {
    try {
      const user = checkoutID ? await User.findOne({ buniCheckoutID: checkoutID }) : null;
      if (user) {
        const track = user.pendingPaymentTrack;
        const payType = user.pendingPaymentType;
        const trackPayment = user.payments.find(p => p.track === track);

        let amount;
        if (user.isBundleStudent) {
          amount = payType === 'deposit' ? BUNDLE_DEPOSIT : BUNDLE_BALANCE;
        } else {
          amount = payType === 'deposit' ? TRACKS[track]?.deposit : TRACKS[track]?.price - TRACKS[track]?.deposit;
        }

        if (trackPayment) {
          if (payType === 'deposit') {
            trackPayment.depositPaid = true;
            trackPayment.depositAmount = amount;
            trackPayment.depositPaidAt = new Date();
          } else {
            trackPayment.balancePaid = true;
            trackPayment.balanceAmount = amount;
            trackPayment.balancePaidAt = new Date();
          }
          trackPayment.totalPaid = (trackPayment.depositAmount || 0) + (trackPayment.balanceAmount || 0);
        }
        await user.save();
        console.log(`✅ Payment confirmed: ${user.email} — ${track} ${payType}`);
      }
    } catch (err) {
      console.error('Callback DB error:', err.message);
    }
  }
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Success' });
});

// Manual M-PESA code verification
app.post('/verify-mpesa', async (req, res) => {
  let { mpesaCode, phone, email: bodyEmail, track, paymentType } = req.body;
  const userEmail = req.session.user?.email || bodyEmail;
  if (!userEmail) return res.status(401).json({ success: false, message: 'Session expired. Please refresh.' });

  mpesaCode = mpesaCode?.trim().toUpperCase();
  if (!mpesaCode || !/^[A-Z0-9]{10}$/.test(mpesaCode))
    return res.status(400).json({ success: false, message: 'Invalid M-PESA code format (e.g. UHQDC4FLXC).' });

  try {
    const user = await User.findOne({ email: userEmail });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    // Check code not already used
    const codeUsed = user.payments.some(p => p.depositMpesaCode === mpesaCode || p.balanceMpesaCode === mpesaCode);
    if (codeUsed) return res.status(400).json({ success: false, message: 'This M-PESA code has already been used.' });

    const existingUser = await User.findOne({
      $or: [{ 'payments.depositMpesaCode': mpesaCode }, { 'payments.balanceMpesaCode': mpesaCode }]
    });
    if (existingUser) return res.status(400).json({ success: false, message: 'This M-PESA code has already been used by another user.' });

    // Phone check
    phone = String(phone).replace(/\D/g, '');
    if (phone.startsWith('254')) phone = '0' + phone.slice(3);
    let storedPhone = String(user.phone).replace(/\D/g, '');
    if (storedPhone.startsWith('254')) storedPhone = '0' + storedPhone.slice(3);
    if (phone !== storedPhone)
      return res.status(400).json({ success: false, message: `Phone mismatch. Your registered number is ${storedPhone}.` });

    const trackPayment = user.payments.find(p => p.track === track);
    if (!trackPayment) return res.status(400).json({ success: false, message: 'Not enrolled in this track.' });

    let amount;
    if (user.isBundleStudent) {
      amount = paymentType === 'deposit' ? BUNDLE_DEPOSIT : BUNDLE_BALANCE;
    } else {
      amount = paymentType === 'deposit' ? TRACKS[track]?.deposit : TRACKS[track]?.price - TRACKS[track]?.deposit;
    }

    if (paymentType === 'deposit') {
      trackPayment.depositPaid = true;
      trackPayment.depositAmount = amount;
      trackPayment.depositPaidAt = new Date();
      trackPayment.depositMpesaCode = mpesaCode;
    } else {
      trackPayment.balancePaid = true;
      trackPayment.balanceAmount = amount;
      trackPayment.balancePaidAt = new Date();
      trackPayment.balanceMpesaCode = mpesaCode;
    }
    trackPayment.totalPaid = (trackPayment.depositAmount || 0) + (trackPayment.balanceAmount || 0);
    await user.save();

    if (req.session.user) req.session.save(() => {});
    res.json({ success: true, message: '✅ Payment verified! Access unlocked.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Check payment status
app.get('/payment-status/:track', ensureAuth, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.session.user.email });
    const p = user?.payments.find(pay => pay.track === req.params.track);
    res.json({ depositPaid: p?.depositPaid || false, balancePaid: p?.balancePaid || false, totalPaid: p?.totalPaid || 0 });
  } catch (err) {
    res.json({ depositPaid: false, balancePaid: false });
  }
});

// ════════════════════════════════════════════
// CONTENT (Videos & Notes)
// ════════════════════════════════════════════
app.get('/content/:track/:week/:day', ensureAuth, async (req, res) => {
  try {
    const { track, week, day } = req.params;
    const user = await User.findOne({ email: req.session.user.email });
    const payment = user?.payments.find(p => p.track === track);

    if (!payment?.depositPaid && !req.session.user.isAdmin)
      return res.status(402).json({ success: false, message: 'Please pay deposit to access content.' });

    const weekNum = parseInt(week);
    if ((weekNum === 3 || weekNum === 4) && !payment?.balancePaid && !req.session.user.isAdmin)
      return res.status(402).json({ success: false, message: 'Please complete balance payment to access Weeks 3 & 4.' });

    const items = await Content.find({ track, week: weekNum, day: parseInt(day) }).sort({ type: 1 });
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: upload content
app.post('/admin/content/upload', ensureAdmin, upload.single('file'), async (req, res) => {
  try {
    const { track, week, day, title, type, youtubeUrl } = req.body;
    let contentUrl = '';
    let fileType = '';

    if (type === 'video') {
      if (youtubeUrl) {
        contentUrl = youtubeUrl;
        fileType = 'youtube';
      } else if (req.file) {
        contentUrl = '/uploads/' + req.file.filename;
        fileType = 'mp4';
      }
    } else if (type === 'notes') {
      if (req.file) {
        contentUrl = '/uploads/' + req.file.filename;
        fileType = req.file.mimetype === 'application/pdf' ? 'pdf' : 'file';
      } else {
        contentUrl = req.body.textContent || '';
        fileType = 'text';
      }
    }

    const content = new Content({ track, week: parseInt(week), day: parseInt(day), title, type, content: contentUrl, fileType });
    await content.save();
    res.json({ success: true, message: 'Content uploaded successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/admin/content/:id', ensureAdmin, async (req, res) => {
  try {
    await Content.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Content deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════
// EXAMS
// ════════════════════════════════════════════
app.get('/exam/:track', ensureAuth, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.session.user.email });
    const payment = user?.payments.find(p => p.track === req.params.track);
    if (!payment?.balancePaid && !req.session.user.isAdmin)
      return res.status(402).json({ success: false, message: 'Complete full payment to access the exam.' });

    const exam = await Exam.findOne({ track: req.params.track });
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not yet available.' });

    // Return questions without correct answers
    const questions = exam.questions.map(q => ({ question: q.question, options: q.options }));
    res.json({ success: true, data: questions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/exam/:track/submit', ensureAuth, async (req, res) => {
  try {
    const { answers } = req.body; // array of selected indices
    const exam = await Exam.findOne({ track: req.params.track });
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });

    let score = 0;
    exam.questions.forEach((q, i) => {
      if (answers[i] === q.correctIndex) score++;
    });
    const total = exam.questions.length;
    const passed = (score / total) >= 0.5;
    const percentage = Math.round((score / total) * 100);

    const user = await User.findOne({ email: req.session.user.email });
    const existing = user.examResults.find(r => r.track === req.params.track);
    if (existing) {
      existing.score = score; existing.total = total; existing.passed = passed; existing.takenAt = new Date();
      if (passed) existing.certificateUnlocked = true;
    } else {
      user.examResults.push({ track: req.params.track, score, total, passed, takenAt: new Date(), certificateUnlocked: passed });
    }
    await user.save();
    res.json({ success: true, score, total, percentage, passed });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: set exam questions
app.post('/admin/exam', ensureAdmin, async (req, res) => {
  try {
    const { track, questions } = req.body;
    await Exam.findOneAndUpdate({ track }, { track, questions, updatedAt: new Date() }, { upsert: true, new: true });
    res.json({ success: true, message: 'Exam saved.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════
// CERTIFICATE
// ════════════════════════════════════════════
app.get('/certificate/:track', ensureAuth, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.session.user.email });
    const result = user?.examResults.find(r => r.track === req.params.track && r.passed);
    if (!result && !req.session.user.isAdmin)
      return res.status(403).json({ success: false, message: 'Pass the exam to get your certificate.' });

    const trackInfo = TRACKS[req.params.track];
    const doc = new PDFDocument({ layout: 'landscape', size: 'A4', margin: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="KALMOT_Certificate_${req.params.track}.pdf"`);
    doc.pipe(res);

    const W = doc.page.width, H = doc.page.height;

    // Dark tech background
    doc.rect(0, 0, W, H).fill('#0a0a1a');

    // Grid lines (tech aesthetic)
    doc.strokeColor('#1a1a3a').lineWidth(0.5);
    for (let x = 0; x < W; x += 40) doc.moveTo(x, 0).lineTo(x, H).stroke();
    for (let y = 0; y < H; y += 40) doc.moveTo(0, y).lineTo(W, y).stroke();

    // Outer border — maroon
    doc.rect(15, 15, W-30, H-30).lineWidth(4).strokeColor('#800000').stroke();
    // Inner border — yellow
    doc.rect(25, 25, W-50, H-50).lineWidth(2).strokeColor('#FFD700').stroke();
    // Blue accent corners
    const cs = 30;
    [
      [25,25], [W-25-cs,25], [25,H-25-cs], [W-25-cs,H-25-cs]
    ].forEach(([x,y]) => doc.rect(x,y,cs,cs).fill('#003399'));

    // Top color bar
    doc.rect(25, 25, W-50, 8).fill('#003399');
    doc.rect(25, 33, W-50, 4).fill('#FFD700');
    doc.rect(25, 37, W-50, 4).fill('#006400');
    doc.rect(25, 41, W-50, 4).fill('#800000');

    // Bottom color bar
    doc.rect(25, H-49, W-50, 4).fill('#800000');
    doc.rect(25, H-45, W-50, 4).fill('#006400');
    doc.rect(25, H-41, W-50, 4).fill('#FFD700');
    doc.rect(25, H-37, W-50, 8).fill('#003399');

    // KALMOT Tech Academy header
    doc.fontSize(28).font('Helvetica-Bold').fillColor('#FFD700')
      .text('KALMOT TECH ACADEMY', 0, 60, { align: 'center' });

    doc.fontSize(12).font('Helvetica').fillColor('#00BFFF')
      .text('Online Technical Skills Certification Platform', 0, 92, { align: 'center' });

    // Divider
    doc.moveTo(100, 115).lineTo(W-100, 115).lineWidth(1).strokeColor('#FFD700').stroke();

    // Certificate title
    doc.fontSize(18).font('Helvetica').fillColor('#ffffff')
      .text('CERTIFICATE OF COMPLETION', 0, 128, { align: 'center' });

    // Presented to
    doc.fontSize(13).font('Helvetica').fillColor('#aaaaaa')
      .text('This is to certify that', 0, 165, { align: 'center' });

    // Student name
    doc.fontSize(30).font('Helvetica-Bold').fillColor('#FFD700')
      .text(user?.fullname?.toUpperCase() || 'STUDENT NAME', 0, 188, { align: 'center', underline: true });

    // Course
    doc.fontSize(13).font('Helvetica').fillColor('#ffffff')
      .text('has successfully completed the 1-Month Intensive Bootcamp in', 0, 232, { align: 'center' });

    doc.fontSize(22).font('Helvetica-Bold').fillColor('#00BFFF')
      .text(trackInfo?.name?.toUpperCase() || req.params.track.toUpperCase(), 0, 252, { align: 'center' });

    doc.fontSize(12).font('Helvetica').fillColor('#aaaaaa')
      .text('and demonstrated competency through assessment and practical evaluation', 0, 282, { align: 'center' });

    // Score
    if (result) {
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#00FF00')
        .text(`Exam Score: ${result.score}/${result.total} (${Math.round((result.score/result.total)*100)}%)`, 0, 305, { align: 'center' });
    }

    // Date
    const dateStr = new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.fontSize(11).font('Helvetica').fillColor('#aaaaaa')
      .text(`Awarded on ${dateStr}`, 0, 328, { align: 'center' });

    // Divider
    doc.moveTo(100, 350).lineTo(W-100, 350).lineWidth(0.5).strokeColor('#333366').stroke();

    // Signature block
    const sigX = W - 220, sigY = 360;
    doc.fontSize(24).font('Helvetica-BoldOblique').fillColor('#FFD700')
      .text('J. S. Maripet', sigX, sigY, { width: 180, align: 'center' });
    doc.moveTo(sigX, sigY+34).lineTo(sigX+180, sigY+34).lineWidth(1).strokeColor('#FFD700').stroke();
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#ffffff')
      .text('Joshua Santamo Maripet', sigX, sigY+38, { width: 180, align: 'center' });
    doc.fontSize(10).font('Helvetica').fillColor('#aaaaaa')
      .text('Director, KALMOT Tech Academy', sigX, sigY+52, { width: 180, align: 'center' });

    // Seal placeholder (left)
    const sealX = 80, sealY = 355;
    doc.circle(sealX+55, sealY+45, 52).lineWidth(3).strokeColor('#FFD700').stroke();
    doc.circle(sealX+55, sealY+45, 44).lineWidth(1).strokeColor('#003399').stroke();
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFD700')
      .text('KALMOT TECH ACADEMY', sealX, sealY+20, { width: 110, align: 'center' });
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#00BFFF')
      .text('✓', sealX+43, sealY+36);
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFD700')
      .text('CERTIFIED', sealX, sealY+54, { width: 110, align: 'center' });
    doc.fontSize(7).font('Helvetica').fillColor('#aaaaaa')
      .text('OFFICIAL SEAL', sealX, sealY+65, { width: 110, align: 'center' });

    // Certificate ID
    const certId = 'KTA-' + Date.now().toString(36).toUpperCase();
    doc.fontSize(8).font('Helvetica').fillColor('#555555')
      .text(`Certificate ID: ${certId}`, 0, H-28, { align: 'center' });

    doc.end();
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════
// ADMIN ROUTES
// ════════════════════════════════════════════
app.get('/api/admin/users', ensureAdmin, async (req, res) => {
  try {
    const users = await User.find({}, '-password').sort({ createdAt: -1 });
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/admin/users/:id', ensureAdmin, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'User deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/admin/content', ensureAdmin, async (req, res) => {
  try {
    const { track, week } = req.query;
    const filter = {};
    if (track) filter.track = track;
    if (week) filter.week = parseInt(week);
    const items = await Content.find(filter).sort({ track: 1, week: 1, day: 1, type: 1 });
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════
// START
// ════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 KALMOT Tech Academy running on port ${PORT}`));
