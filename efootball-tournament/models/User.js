const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, required: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['player', 'admin'], default: 'player' },
  paid: { type: Boolean, default: false },
  paidAt: { type: Date, default: null },
  paymentRef: { type: String, default: null },
  mpesaPhone: { type: String, default: null },
  buniCheckoutId: { type: String, default: null, index: true },
  buniStatus: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
