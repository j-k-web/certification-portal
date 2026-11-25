require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs'); // Encrypts passwords before database entry
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const axios = require('axios');
const User = require('./models/User');
const { PROGRAMMES, findProgramme } = require('./data/programmes');
// Every unit across all programmes, without duplicates (admin preview)
const ALL_UNITS = [...new Map(PROGRAMMES.flatMap(p => p.units).map(u => [u.id, u])).values()];

const app = express();

// Exam paper PDFs live here, named <unit id>.pdf (see papers/README.txt)
const PAPERS_DIR = path.join(__dirname, 'papers');
const UNLOCK_FEE_KSH = 500;

// KCB Buni settings, read from Render. The older BUNI_* / KCB_BUNI_* names are still accepted as fallbacks.
const KCB_CONSUMER_KEY = process.env.KCB_CLIENT_ID || process.env.BUNI_CLIENT_ID || process.env.KCB_BUNI_CONSUMER_KEY;
const KCB_CONSUMER_SECRET = process.env.KCB_CLIENT_SECRET || process.env.BUNI_CLIENT_SECRET || process.env.KCB_BUNI_CONSUMER_SECRET;
const KCB_SHORTCODE = process.env.KCB_BUNI_MERCHANT_CODE || process.env.BUNI_MERCHANT_CODE || process.env.KCB_BUNI_SHORTCODE || '8125462';
const KCB_TOKEN_URL = process.env.KCB_TOKEN_URL || 'https://api.buni.kcbgroup.com/token?grant_type=client_credentials';
const KCB_STK_URL = process.env.KCB_STK_URL || 'https://api.buni.kcbgroup.com/mm/api/request/1.0.0/stkpush';
// KCB calls this after the student responds to the PIN prompt
const KCB_CALLBACK_URL = process.env.BUNI_CALLBACK_URL || process.env.KCB_BUNI_CALLBACK_URL
  || `${process.env.BASE_URL}/buni-callback`;

// Render Reverse Proxy Trust (Crucial for secure session cookies on Render)
app.set('trust proxy', 1);

// Middleware (Native Express body parsing tools)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Secure Session Handling. Sessions are stored in MongoDB so they survive
// Render restarts and redeploys.
app.use(session({
  secret: process.env.SESSION_SECRET || 'a-solid-fallback-token-string',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'sessions',
    ttl: 60 * 60 * 2 // seconds, matches cookie maxAge below
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production', // true if served over HTTPS on Render
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 2 // 2 Hours active session duration
  }
}));

// MongoDB Atlas connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// Root route → serve login page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Programme list for the registration dropdown
app.get('/api/programmes', (req, res) => {
  res.json({ success: true, data: PROGRAMMES.map(p => ({ id: p.id, name: p.name })) });
});

// Secure Registration Route
app.post('/register', async (req, res) => {
  const { fullname, phone, email, password, specialization } = req.body;
  try {
    if (!findProgramme(specialization)) {
      return res.status(400).json({ success: false, message: '⚠️ Please select a valid programme.' });
    }

    const sanitizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: sanitizedEmail });

    if (existingUser) {
      return res.status(400).json({ success: false, message: '⚠️ User already registered with this email.' });
    }

    // Securely hash incoming credentials
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      fullname,
      phone,
      email: sanitizedEmail,
      password: hashedPassword,
      specialization
    });
    await user.save();

    res.json({ success: true, message: "✅ Registration successful! Please login." });
  } catch (err) {
    console.error("Registration Error: ", err);
    res.status(500).json({ success: false, message: '❌ Error registering user.' });
  }
});

// Secure Login Route
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const sanitizedEmail = String(email || '').toLowerCase().trim();
    const normalizedAdminEmail = sanitizedEmail.replace(/\s+/g, '');
    const adminAlias = 'joshuakalte088@gmail';

    if (
      (normalizedAdminEmail === ADMIN_EMAIL || normalizedAdminEmail === adminAlias) &&
      password === ADMIN_PASSWORD
    ) {
      req.session.user = {
        id: 'admin',
        fullname: 'System Administrator',
        specialization: ADMIN_PREVIEW_PROGRAMME,
        email: ADMIN_EMAIL,
        paid: true,
        isAdmin: true
      };

      return res.json({
        success: true,
        message: '✅ Admin login successful',
        fullname: 'System Administrator',
        specialization: ADMIN_PREVIEW_PROGRAMME,
        isAdmin: true
      });
    }

    const user = await User.findOne({ email: sanitizedEmail });
    if (!user) return res.status(401).json({ success: false, message: '⚠️ Invalid credentials.' });

    // Validate the incoming password against the stored hash
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ success: false, message: '⚠️ Invalid credentials.' });

    req.session.user = {
      id: user._id,
      fullname: user.fullname,
      specialization: user.specialization,
      email: user.email,
      paid: !!user.paid,
      isAdmin: false
    };

    res.json({
      success: true,
      message: '✅ Login successful',
      fullname: user.fullname,
      specialization: user.specialization,
      isAdmin: false
    });
  } catch (err) {
    console.error('Login Error: ', err);
    res.status(500).json({ success: false, message: '❌ Error logging in.' });
  }
});

// Protection Route Guard Middleware (General Auth Check)
function ensureAuth(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/index.html');
}

// JSON version for API routes (returns 401 instead of redirecting)
function ensureAuthApi(req, res, next) {
  if (req.session.user) return next();
  res.status(401).json({ success: false, message: '⚠️ Please log in first.' });
}

// 👑 STRICT ADMIN GUARD: Bound explicitly to your verified login details
const ADMIN_EMAIL = "joshuakalte088@gmail.com";
const ADMIN_PASSWORD = "464455Jo@";
// Programme the admin account previews on the dashboard
const ADMIN_PREVIEW_PROGRAMME = 'Bachelor of Education (Arts, with I.T.) - History & Kiswahili';

function ensureAdmin(req, res, next) {
  if (req.session.user && (req.session.user.isAdmin || req.session.user.email === ADMIN_EMAIL)) {
    return next();
  }
  res.status(403).send("🚫 Access Denied: You do not have administrator permissions.");
}

// Protected Dashboard Page Route
app.get('/dashboard.html', ensureAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// 👥 Admin-Only Page Routing Rule: Only your email can load the file layout
app.get('/user.html', ensureAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'user.html'));
});

// Expose user session profile attributes back to scripts
app.get('/user-info', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Not logged in" });
  res.json(req.session.user);
});

// 📊 Admin-Only API Endpoint Route: Fetches registered system profiles for user.html
app.get('/api/admin/users', ensureAdmin, async (req, res) => {
  try {
    // Exclude password field hashes from returning to the browser layout for security
    const users = await User.find({}, '-password');
    res.json({ success: true, data: users });
  } catch (err) {
    console.error("Admin Fetch Error: ", err);
    res.status(500).json({ success: false, message: "❌ Failed to retrieve user registry metadata." });
  }
});

// 🗑️ Admin-Only Delete Record Route: Drops entries cleanly using database IDs
app.delete('/api/admin/users/:id', ensureAdmin, async (req, res) => {
  try {
    const deletedUser = await User.findByIdAndDelete(req.params.id);
    if (!deletedUser) {
      return res.status(404).json({ success: false, message: "⚠️ User record not found." });
    }
    return res.json({ success: true, message: "🗑️ Entry permanently removed from database." });
  } catch (err) {
    console.error("Delete Action Error: ", err);
    return res.status(500).json({ success: false, message: "❌ Failed to complete record removal." });
  }
});

// Helpers for unit downloads
function paperPath(unitId) {
  return path.join(PAPERS_DIR, `${unitId}.pdf`);
}

function downloadName(unit) {
  // Remove characters that are not allowed in file names
  return `${unit.code} ${unit.title}`.replace(/[\\/:*?"<>|]/g, '-') + '.pdf';
}

// Loads the logged-in student's paid status and programme from the database
// (admin accounts come from the session instead)
async function getAccess(sessionUser) {
  if (sessionUser.isAdmin) {
    return { paid: true, isAdmin: true, fullname: sessionUser.fullname, specialization: sessionUser.specialization };
  }
  const user = await User.findById(sessionUser.id);
  if (!user) return null;
  return { paid: !!user.paid, fullname: user.fullname, specialization: user.specialization };
}

// The student's dashboard data: programme name, and units only once paid
app.get('/api/programme', ensureAuthApi, async (req, res) => {
  try {
    const access = await getAccess(req.session.user);
    if (!access) return res.status(404).json({ success: false, message: '⚠️ Account not found.' });

    const programme = findProgramme(access.specialization);
    const unitList = access.isAdmin ? ALL_UNITS : (programme ? programme.units : []);
    const units = (access.paid ? unitList : []).map(u => ({
      id: u.id,
      code: u.code,
      title: u.title,
      filename: downloadName(u),
      available: fs.existsSync(paperPath(u.id)),
      url: `/papers/${u.id}`
    }));

    res.json({
      success: true,
      fullname: access.fullname,
      specialization: access.specialization,
      programme: access.isAdmin ? 'All programmes (admin view)' : (programme ? programme.name : null),
      paid: access.paid,
      unlockFee: UNLOCK_FEE_KSH,
      units
    });
  } catch (err) {
    console.error("Programme Fetch Error: ", err);
    res.status(500).json({ success: false, message: '❌ Could not load your units.' });
  }
});

// Download one exam paper as PDF (only for paid students, only their own programme's units)
app.get('/papers/:id', ensureAuthApi, async (req, res) => {
  try {
    const access = await getAccess(req.session.user);
    if (!access) return res.status(404).json({ success: false, message: '⚠️ Account not found.' });
    if (!access.paid) {
      return res.status(402).json({ success: false, message: `⚠️ Pay Ksh ${UNLOCK_FEE_KSH} to unlock your exam papers.` });
    }

    const programme = findProgramme(access.specialization);
    const unitList = access.isAdmin ? ALL_UNITS : (programme ? programme.units : []);
    const unit = unitList.find(u => u.id === req.params.id);
    if (!unit) {
      return res.status(404).json({ success: false, message: '⚠️ That unit is not in your programme.' });
    }

    const file = paperPath(unit.id);
    if (!fs.existsSync(file)) {
      return res.status(404).json({ success: false, message: '⚠️ This exam paper is not available yet.' });
    }

    res.download(file, downloadName(unit));
  } catch (err) {
    console.error("Paper Download Error: ", err);
    res.status(500).json({ success: false, message: '❌ Could not download the paper.' });
  }
});

// Helper Middleware: Generate KCB Buni OAuth access token (LIVE PRODUCTION)
async function generateBuniToken(req, res, next) {
  if (!KCB_CONSUMER_KEY || !KCB_CONSUMER_SECRET) {
    return res.status(500).json({ success: false, message: "❌ Missing KCB Buni API credentials in environment variables." });
  }

  const credentials = Buffer.from(`${KCB_CONSUMER_KEY}:${KCB_CONSUMER_SECRET}`).toString('base64');

  try {
    const response = await axios.post(
      KCB_TOKEN_URL,
      {},
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    req.buniToken = response.data.access_token;
    next();
  } catch (err) {
    console.error("KCB Buni Token Error: ", err.response?.data || err.message);
    res.status(500).json({ success: false, message: "❌ Failed to generate KCB Buni token." });
  }
}

// KCB Buni STK Push: Ksh 500 unlocks the student's exam papers
app.post('/pay', ensureAuth, generateBuniToken, async (req, res) => {
  if (req.session.user.isAdmin) {
    return res.json({ success: true, message: 'Admin access granted.' });
  }

  try {
    const user = await User.findById(req.session.user.id);
    if (!user) return res.status(404).json({ success: false, message: '⚠️ Account not found.' });
    if (user.paid) {
      return res.json({ success: true, message: 'already_paid' });
    }

    // Normalize phone to 254XXXXXXXXX for KCB Buni
    let phone = String(req.body.phone || '').replace(/\D/g, '');
    if (phone.startsWith('0')) phone = '254' + phone.slice(1);
    if (phone.startsWith('7') || phone.startsWith('1')) phone = '254' + phone;
    if (!/^254\d{9}$/.test(phone)) {
      return res.status(400).json({ success: false, message: '⚠️ Enter a valid Safaricom number, e.g. 0712345678.' });
    }
    console.log('📱 Sending STK Push to phone:', phone);

        const payload = {
      phoneNumber: phone,
      amount: String(UNLOCK_FEE_KSH),
      invoiceNumber: `${KCB_SHORTCODE}-TMU papers ${Date.now().toString().slice(-6)}`,
      sharedShortCode: true,
      orgShortCode: '',
      orgPassKey: '',
      callbackUrl: KCB_CALLBACK_URL,
      transactionDescription: 'Exam Papers Unlock Fee'
    };

    const stkRes = await axios.post(KCB_STK_URL, payload, {
      headers: {
        Authorization: `Bearer ${req.buniToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Save CheckoutRequestID to the user so the callback can match and unlock.
    // Paid status is set only when KCB confirms the payment (see /buni-callback).
    const checkoutID = stkRes.data?.response?.CheckoutRequestID;
    if (!checkoutID) {
      console.error("KCB STK Push returned no CheckoutRequestID: ", JSON.stringify(stkRes.data));
      return res.status(500).json({ success: false, message: '❌ Payment could not be started. Please try again.' });
    }
    await User.updateOne({ _id: user._id }, { $set: { buniCheckoutID: checkoutID } });

    res.json({ success: true, message: 'stk_sent' });
  } catch (err) {
    console.error("KCB Buni STK Push Error: ", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: `❌ Payment initiation failed: ${err.response?.data?.message || err.message}`
    });
  }
});

// KCB Buni Payment Callback: unlocks only the student whose saved CheckoutRequestID matches
app.post('/buni-callback', async (req, res) => {
  const payload = req.body;
  console.log('💰 KCB Buni callback received:', JSON.stringify(payload));

  const resultCode = payload?.Body?.stkCallback?.ResultCode ?? payload?.ResultCode ?? payload?.resultCode;
  const checkoutID = payload?.Body?.stkCallback?.CheckoutRequestID || payload?.CheckoutRequestID;

  if ((resultCode === 0 || resultCode === '0') && checkoutID) {
    try {
      const user = await User.findOneAndUpdate(
        { buniCheckoutID: checkoutID },
        { paid: true, paidAt: new Date() },
        { new: true }
      );
      if (user) console.log(`✅ Unlocked exam papers for ${user.email}`);
      else console.log(`⚠️ Payment confirmed but no user has CheckoutRequestID ${checkoutID}`);
    } catch (err) {
      console.error('DB update error on callback:', err.message);
    }
  } else {
    console.log(`❌ Payment failed or cancelled [ResultCode: ${resultCode}]`);
  }

  // Always acknowledge so KCB does not keep retrying
  res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });
});

// Password Reset Request Handler
app.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
    const sanitizedEmail = String(email || '').toLowerCase().trim();
    if (!sanitizedEmail) {
      return res.status(400).json({ success: false, message: '⚠️ Email is required.' });
    }

    const user = await User.findOne({ email: sanitizedEmail });
    if (!user) {
      return res.json({
        success: true,
        message: '✅ If an account exists for that email, a password reset link has been sent.'
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
    await user.save();

    const mailResult = await sendPasswordResetEmail(user.email, resetToken, req);

    return res.json({
      success: true,
      message: '✅ If an account exists for that email, a password reset link has been sent.',
      debugResetLink: mailResult.debugResetLink,
      emailConfigured: mailResult.success
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ success: false, message: '❌ Unable to process password reset request.' });
  }
});

// Password Reset Form Token Validation & New Password Submission
app.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;

  try {
    if (!token || !password) {
      return res.status(400).json({ success: false, message: '⚠️ Token and new password are required.' });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: '⚠️ Password reset token is invalid or has expired.' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return res.json({ success: true, message: '✅ Password reset successful. You can now login with your new password.' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ success: false, message: '❌ Failed to reset password.' });
  }
});

// Email transporter setup for password reset
function createEmailTransporter() {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    return null;
  }

  return nodemailer.createTransport({
    host: smtpHost,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });
}

// Password reset email sending function
async function sendPasswordResetEmail(userEmail, token, req) {
  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const resetUrl = `${baseUrl}/reset.html?token=${token}`;
  const transporter = createEmailTransporter();

  if (!transporter) {
    return {
      success: false,
      debugResetLink: resetUrl,
      message: 'SMTP email delivery is not configured yet. Use the debug reset link shown in the response during testing.'
    };
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: userEmail,
      subject: 'Password Reset Request',
      text: `Use this link to reset your password: ${resetUrl}`,
      html: `<p>Use this link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`
    });

    return { success: true, debugResetLink: resetUrl };
  } catch (err) {
    console.error('Email send error:', err);
    return {
      success: false,
      debugResetLink: resetUrl,
      message: 'Failed to send email. Please use the debug reset link shown during testing.'
    };
  }
}

// Session teardown route
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error("Error breaking active sessions down:", err);
    res.clearCookie('connect.sid');
    res.redirect('/index.html');
  });
});

// Serve static frontend files (after the protected routes above, so
// dashboard.html and user.html cannot be opened without the login checks)
app.use(express.static(path.join(__dirname, 'public')));

// Start Server Loop
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});
