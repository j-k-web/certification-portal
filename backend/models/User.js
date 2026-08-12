const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullname: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  specialization: { type: String, required: true },
  paid: { type: Boolean, default: false },           // ← persists payment across sessions
  paidAt: { type: Date, default: null },             // ← timestamp of payment
  buniCheckoutID: { type: String, default: null },   // ← for KCB Buni reference
  resetPasswordToken: { type: String, default: null },
  resetPasswordExpires: { type: Date, default: null }
});

module.exports = mongoose.model('User', userSchema);
