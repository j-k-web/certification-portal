require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs'); // Encrypts passwords before database entry
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const session = require('express-session');
const axios = require('axios');
const User = require('./models/User'); 

const app = express();

// Render Reverse Proxy Trust (Crucial for secure session cookies on Render)
app.set('trust proxy', 1);

// Middleware (Native Express body parsing tools)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Secure Session Handling
app.use(session({
  secret: process.env.SESSION_SECRET || 'a-solid-fallback-token-string',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // true if served over HTTPS on Render
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 2 // 2 Hours active session duration
  }
}));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Atlas connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// Root route → serve login page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Secure Registration Route
app.post('/register', async (req, res) => {
  const { fullname, phone, email, password, specialization } = req.body;
  try {
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

    // Validate the incoming password against the stored hash
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ success: false, message: '⚠️ Invalid credentials.' });

    req.session.user = {
      id: user._id,
      fullname: user.fullname,
      specialization: user.specialization,
      email: user.email,
      paid: false,
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

// 👑 STRICT ADMIN GUARD: Bound explicitly to your verified login details
const ADMIN_EMAIL = "joshuakalte088@gmail.com"; 
const ADMIN_PASSWORD = "464455Jo@";

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

// Helper Middleware: Generate KCB Buni OAuth access token (LIVE PRODUCTION)
async function generateBuniToken(req, res, next) {
  const clientId = process.env.BUNI_CLIENT_ID;
  const clientSecret = process.env.BUNI_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ success: false, message: "❌ Missing KCB Buni API credentials in environment variables." });
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    const response = await axios.post(
      'https://api.buni.kcbgroup.com/token?grant_type=client_credentials',
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

// KCB Buni STK Push Trigger (LIVE PRODUCTION)
app.post('/pay', ensureAuth, generateBuniToken, async (req, res) => {
  let { phone } = req.body;

  if (req.session.user.isAdmin) {
    req.session.user.paid = true;
    return res.json({ success: true, message: 'Admin access granted.' });
  }

  // Normalize phone to 254XXXXXXXXX for KCB Buni
  phone = phone.replace(/\D/g, '');
  if (phone.startsWith('0')) phone = '254' + phone.slice(1);
  if (phone.startsWith('7') || phone.startsWith('1')) phone = '254' + phone;
  console.log('📱 Sending STK Push to phone:', phone);

  const endpoint = 'https://api.buni.kcbgroup.com/mm/api/request/1.0.0/stkpush';
  const tillNumber = process.env.BUNI_MERCHANT_CODE || '8125462';
  const uniqueRef = `KALMOT${Date.now().toString().slice(-6)}`;

  const payload = {
    phoneNumber: phone,
    amount: '200',
    invoiceNumber: tillNumber + '-' + uniqueRef,
    callbackUrl: process.env.BUNI_CALLBACK_URL,
    merchantCode: tillNumber,
    remark: 'Certification Access Fee'
  };
  console.log('📦 KCB Buni Payload:', JSON.stringify(payload));

  try {
    await axios.post(endpoint, payload, {
      headers: {
        Authorization: `Bearer ${req.buniToken}`,
        'Content-Type': 'application/json'
      }
    });

    res.json({ success: true, message: "📲 KCB Buni STK Push sent. Check your phone and enter your PIN." });
  } catch (err) {
    console.error("KCB Buni STK Push Error: ", err.response?.data || err.message);
    res.status(500).json({ 
      success: false, 
      message: `❌ Payment initiation failed: ${err.response?.data?.message || err.message}` 
    });
  }
});

// KCB Buni Payment Callback Webhook
app.post('/buni-callback', async (req, res) => {
  const payload = req.body;
  console.log("💰 KCB Buni callback received:", JSON.stringify(payload));

  const resultCode = payload?.ResultCode || payload?.resultCode;
  if (resultCode === '0' || resultCode === 0) {
    const phone = payload?.CustomerMSISDN || payload?.MSISDN || payload?.PhoneNumber;
    console.log("✅ KCB Buni payment confirmed:", payload?.CheckoutRequestID || payload?.ReferenceCode, "Phone:", phone);

    if (phone) {
      try {
        // Normalize phone to match DB format
        let normalizedPhone = String(phone).replace(/\D/g, '');
        if (normalizedPhone.startsWith('254')) normalizedPhone = '0' + normalizedPhone.slice(3);

        const user = await User.findOneAndUpdate(
          { $or: [{ phone: normalizedPhone }, { phone: phone }] },
          { paid: true, paidAt: new Date() },
          { new: true }
        );
        if (user) {
          console.log(`✅ Marked user ${user.email} as paid in DB`);
        } else {
          console.log(`⚠️ No user found for phone ${phone} — payment confirmed but user not updated`);
        }
      } catch (err) {
        console.error("DB update error on callback:", err.message);
      }
    }
  } else {
    console.log(`❌ KCB Buni payment failed [Code ${resultCode}]`);
  }
  res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });
});

// Safe PDF Layout Generator Route
app.get('/certificate', (req, res) => {
  if (!req.session.user) return res.status(401).send("⚠️ Not logged in.");
  if (!req.session.user.paid && !req.session.user.isAdmin) return res.status(402).send("⚠️ Please pay Ksh 200 to unlock certificate."); 

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
    console.error("PDF Compiling Fault: ", pdfError);
    if (!res.headersSent) {
      res.status(500).send("❌ System failed to generate asset configurations.");
    }
  }
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

// Start Server Loop
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});