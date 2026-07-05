const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Register
router.post('/register', async (req, res) => {
  const { fullname, phone, email, password, specialization } = req.body;

  // Prevent duplicate registration
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.send('⚠️ User already registered with this email.');
  }

  const user = new User({ fullname, phone, email, password, specialization });
  await user.save();
  res.redirect('/index.html'); // login page
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email, password });

  if (!user) {
    return res.status(401).send('⚠️ Invalid credentials.');
  }

  // Save session
  req.session.user = {
    fullname: user.fullname,
    specialization: user.specialization,
    email: user.email,
    paid: false
  };

  // Redirect to dashboard
  res.redirect('/dashboard.html');
});

module.exports = router;
