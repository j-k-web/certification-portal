require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const session = require('express-session');
const axios = require('axios');
const User = require('./models/User');
const IntaSend = require('intasend-node');

const app = express();

// Render Reverse Proxy Trust
app.set('trust proxy', 1);

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Secure Session Handling
app.use(session({
  secret: process.env.SESSION_SECRET || 'a-solid-fallback-token-string',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 2 // 2 hours
  }
}));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Atlas connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// ============================================================
// 👑 ADMIN CONFIGURATION
// ============================================================
const ADMIN_EMAIL = "joshuakalte088@gmail.com";
const ADMIN_PASSWORD = "464455Jo@";

// ============================================================
// 💳 INTASEND CONFIGURATION
// ============================================================
// IntaSend: 2nd arg = secret key, 3rd arg = true means TEST/sandbox
const isTestMode = process.env.INTASEND_IS_TEST !== 'false';
const intasend = new IntaSend(
  process.env.INTASEND_PUBLISHABLE_KEY,
  process.env.INTASEND_SECRET_KEY,
  isTestMode
);

console.log(`💳 IntaSend running in ${isTestMode ? 'TEST/SANDBOX' : 'LIVE'} mode`);

// ============================================================
// ROOT ROUTE
// ============================================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// REGISTRATION
// ============================================================
app.post('/register', async (req, res) => {
  const { fullname, phone, email, password, specialization } = req.body;
  try {
    const sanitizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: sanitizedEmail });

    if (existingUser) {
      return res.status(400).json({ success: false, message: '⚠️ User already registered with this email.' });
    }

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
    console.error("Registration Error:", err);
    res.status(500).json({ success: false, message: '❌ Error registering user.' });
  }
});

// ============================================================
// LOGIN
// ============================================================
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
        specialization: 'Information Technology',
        email: ADMIN_EMAIL,
        paid: true,
        isAdmin: true
      };

      return res.json({
        success: true,
        message: '✅ Admin login successful',
        fullname: 'System Administrator',
        specialization: 'Information Technology',
        isAdmin: true
      });
    }

    const user = await User.findOne({ email: sanitizedEmail });
    if (!user) return res.status(401).json({ success: false, message: '⚠️ Invalid credentials.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ success: false, message: '⚠️ Invalid credentials.' });

    req.session.user = {
      id: user._id.toString(),
      fullname: user.fullname,
      specialization: user.specialization,
      email: user.email,
      paid: user.paid || false,
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
    console.error('Login Error:', err);
    res.status(500).json({ success: false, message: '❌ Error logging in.' });
  }
});

// ============================================================
// AUTH GUARDS
// ============================================================
function ensureAuth(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/index.html');
}

function ensureAdmin(req, res, next) {
  if (req.session.user && (req.session.user.isAdmin || req.session.user.email === ADMIN_EMAIL)) {
    return next();
  }
  res.status(403).send("🚫 Access Denied: You do not have administrator permissions.");
}

// ============================================================
// PROTECTED PAGES
// ============================================================
app.get('/dashboard.html', ensureAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/user.html', ensureAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'user.html'));
});

// ============================================================
// USER INFO API
// ============================================================
app.get('/user-info', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Not logged in" });
  res.json(req.session.user);
});

// ============================================================
// ADMIN APIs
// ============================================================
app.get('/api/admin/users', ensureAdmin, async (req, res) => {
  try {
    const users = await User.find({}, '-password');
    res.json({ success: true, data: users });
  } catch (err) {
    console.error("Admin Fetch Error:", err);
    res.status(500).json({ success: false, message: "❌ Failed to retrieve user registry." });
  }
});

app.delete('/api/admin/users/:id', ensureAdmin, async (req, res) => {
  try {
    const deletedUser = await User.findByIdAndDelete(req.params.id);
    if (!deletedUser) {
      return res.status(404).json({ success: false, message: "⚠️ User record not found." });
    }
    return res.json({ success: true, message: "🗑️ Entry permanently removed from database." });
  } catch (err) {
    console.error("Delete Error:", err);
    return res.status(500).json({ success: false, message: "❌ Failed to complete record removal." });
  }
});

// ============================================================
// 💳 INTASEND STK PUSH — INITIATE PAYMENT
// ============================================================
app.post('/pay', ensureAuth, async (req, res) => {
  // Admin bypasses payment
  if (req.session.user.isAdmin) {
    req.session.user.paid = true;
    return res.json({ success: true, message: '✅ Admin access — payment bypassed.' });
  }

  let { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ success: false, message: '⚠️ Phone number is required.' });
  }

  // Normalise to 254XXXXXXXXX format
  phone = phone.trim().replace(/\s+/g, '');
  if (phone.startsWith('0')) phone = '254' + phone.slice(1);
  if (phone.startsWith('+')) phone = phone.slice(1);

  // Basic validation: must be 12 digits starting with 254
  if (!/^254\d{9}$/.test(phone)) {
    return res.status(400).json({
      success: false,
      message: '⚠️ Invalid phone number. Use format: 0712345678 or 254712345678'
    });
  }

  try {
    const nameParts = req.session.user.fullname.split(' ');
    const firstName = nameParts[0] || 'Customer';
    const lastName = nameParts.slice(1).join(' ') || 'User';

    const collection = intasend.collection();
    const response = await collection.mpesaStkPush({
      first_name: firstName,
      last_name: lastName,
      email: req.session.user.email,
      amount: 200,
      phone_number: phone,
      api_ref: `CERT-${req.session.user.id}-${Date.now()}`,
      host: process.env.BASE_URL || `${req.protocol}://${req.get('host')}`
    });

    const invoiceId = response.invoice?.invoice_id || response.id;

    // Save the invoice ID in the session so we can poll for it
    req.session.pendingInvoiceId = invoiceId;

    console.log(`📲 STK Push sent to ${phone} — Invoice: ${invoiceId}`);

    res.json({
      success: true,
      message: "📲 M-Pesa STK Push sent. Please enter your PIN on your phone.",
      invoice_id: invoiceId
    });

  } catch (err) {
    console.error("IntaSend STK Push Error:", err);
    const errMsg = err?.response?.data?.detail || err.message || 'Unknown error';
    res.status(500).json({
      success: false,
      message: `❌ Payment initiation failed: ${errMsg}`
    });
  }
});

// ============================================================
// 🔍 POLL PAYMENT STATUS — Frontend polls this after STK push
// ============================================================
app.get('/pay/status', ensureAuth, async (req, res) => {
  // Admin is always paid
  if (req.session.user.isAdmin || req.session.user.paid) {
    return res.json({ success: true, paid: true });
  }

  const invoiceId = req.session.pendingInvoiceId;
  if (!invoiceId) {
    return res.json({ success: false, paid: false, message: 'No pending payment found.' });
  }

  try {
    const collection = intasend.collection();
    const status = await collection.status(invoiceId);

    console.log(`🔍 Payment status for ${invoiceId}:`, status.invoice?.state);

    if (status.invoice?.state === 'COMPLETE') {
      // Mark paid in session
      req.session.user.paid = true;
      delete req.session.pendingInvoiceId;

      // Also persist to database so it survives session restarts
      if (req.session.user.id !== 'admin') {
        await User.findByIdAndUpdate(req.session.user.id, { paid: true });
      }

      return res.json({ success: true, paid: true });
    } else if (status.invoice?.state === 'FAILED' || status.invoice?.state === 'CANCELLED') {
      delete req.session.pendingInvoiceId;
      return res.json({ success: false, paid: false, message: `Payment ${status.invoice.state.toLowerCase()}.` });
    } else {
      // PENDING or PROCESSING
      return res.json({ success: false, paid: false, message: 'Payment pending...' });
    }

  } catch (err) {
    console.error("Payment status check error:", err);
    return res.json({ success: false, paid: false, message: 'Could not verify payment.' });
  }
});

// ============================================================
// 🔔 INTASEND WEBHOOK — Called by IntaSend on payment events
//    Set this URL in your IntaSend dashboard:
//    https://your-app.onrender.com/intasend-callback
// ============================================================
app.post('/intasend-callback', async (req, res) => {
  try {
    const { invoice_id, state, api_ref } = req.body;
    console.log(`🔔 IntaSend webhook received — Invoice: ${invoice_id}, State: ${state}, Ref: ${api_ref}`);

    if (state === 'COMPLETE' && api_ref) {
      // api_ref format: CERT-<userId>-<timestamp>
      const parts = api_ref.split('-');
      if (parts.length >= 2 && parts[0] === 'CERT') {
        const userId = parts[1];
        if (userId && userId !== 'admin' && mongoose.Types.ObjectId.isValid(userId)) {
          await User.findByIdAndUpdate(userId, { paid: true });
          console.log(`✅ Webhook: Marked user ${userId} as paid (invoice ${invoice_id})`);
        }
      }
    } else {
      console.log(`ℹ️ Webhook: Payment not complete — state: ${state}`);
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(200).send("OK"); // Always 200 to prevent IntaSend retries flooding
  }
});

// ============================================================
// 📜 CERTIFICATE DOWNLOAD
// ============================================================
app.get('/certificate', async (req, res) => {
  if (!req.session.user) return res.status(401).send("⚠️ Not logged in.");

  // Re-check paid status from DB (in case session is stale)
  let isPaid = req.session.user.paid || req.session.user.isAdmin;

  if (!isPaid && req.session.user.id !== 'admin') {
    try {
      const user = await User.findById(req.session.user.id);
      if (user && user.paid) {
        req.session.user.paid = true;
        isPaid = true;
      }
    } catch (e) {
      console.error("Certificate DB check error:", e);
    }
  }

  if (!isPaid) {
    return res.status(402).send("⚠️ Please complete the Ksh 200 payment to unlock your certificate.");
  }

  const { fullname, specialization } = req.session.user;
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  try {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=certificate.pdf');
    doc.pipe(res);

    doc.image(path.join(__dirname, 'assets/certbackground.png'),
      0, 0, { width: doc.page.width, height: doc.page.height });

    doc.font('Times-Roman').fillColor('black');
    doc.fontSize(22).text(fullname, 0, 260, { align: 'center', underline: true });
    doc.fontSize(16).text("has successfully completed the training and assessment in", 0, 300, { align: 'center' });
    doc.fontSize(20).text(specialization.toUpperCase(), 0, 330, { align: 'center' });
    doc.fontSize(14).text("and attained a passing score of 50% or higher.", 0, 360, { align: 'center' });
    doc.fontSize(12).text(`Awarded this ${date}`, 0, 400, { align: 'center' });

    doc.end();
  } catch (pdfError) {
    console.error("PDF Generation Error:", pdfError);
    if (!res.headersSent) {
      res.status(500).send("❌ Failed to generate certificate.");
    }
  }
});

// ============================================================
// 🔑 PASSWORD RESET
// ============================================================
app.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const sanitizedEmail = String(email || '').toLowerCase().trim();
    if (!sanitizedEmail) {
      return res.status(400).json({ success: false, message: '⚠️ Email is required.' });
    }

    const user = await User.findOne({ email: sanitizedEmail });
    if (!user) {
      return res.json({ success: true, message: '✅ If an account exists, a reset link has been sent.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save();

    const mailResult = await sendPasswordResetEmail(user.email, resetToken, req);

    return res.json({
      success: true,
      message: '✅ If an account exists, a reset link has been sent.',
      debugResetLink: mailResult.debugResetLink,
      emailConfigured: mailResult.success
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ success: false, message: '❌ Unable to process request.' });
  }
});

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
      return res.status(400).json({ success: false, message: '⚠️ Token is invalid or has expired.' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return res.json({ success: true, message: '✅ Password reset successful. You can now login.' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ success: false, message: '❌ Failed to reset password.' });
  }
});

function createEmailTransporter() {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpHost || !smtpUser || !smtpPass) return null;
  return nodemailer.createTransport({
    host: smtpHost,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: { user: smtpUser, pass: smtpPass }
  });
}

async function sendPasswordResetEmail(userEmail, token, req) {
  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  const resetUrl = `${baseUrl}/reset.html?token=${token}`;
  const transporter = createEmailTransporter();

  if (!transporter) {
    return { success: false, debugResetLink: resetUrl, message: 'SMTP not configured.' };
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: userEmail,
      subject: 'Password Reset Request',
      text: `Reset your password: ${resetUrl}`,
      html: `<p>Click to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`
    });
    return { success: true, debugResetLink: resetUrl };
  } catch (err) {
    console.error('Email send error:', err);
    return { success: false, debugResetLink: resetUrl, message: 'Email failed.' };
  }
}

// ============================================================
// LOGOUT
// ============================================================
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error("Logout error:", err);
    res.clearCookie('connect.sid');
    res.redirect('/index.html');
  });
});

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📌 IntaSend Webhook URL: ${process.env.BASE_URL || 'http://localhost:' + PORT}/intasend-callback`);
});
