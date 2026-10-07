const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullname: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  
  // Enrolled tracks: array of track IDs e.g. ['programming','webtech','cybersecurity','msoffice']
  enrolledTracks: [{ type: String }],
  isBundleStudent: { type: Boolean, default: false },

  // Payment per track
  payments: [{
    track: String,
    depositPaid: { type: Boolean, default: false },
    depositAmount: { type: Number, default: 0 },
    depositPaidAt: Date,
    depositMpesaCode: String,
    balancePaid: { type: Boolean, default: false },
    balanceAmount: { type: Number, default: 0 },
    balancePaidAt: Date,
    balanceMpesaCode: String,
    totalPaid: { type: Number, default: 0 }
  }],

  // Session tracking per track
  sessionLogs: [{
    track: String,
    date: String, // YYYY-MM-DD
    minutesUsed: { type: Number, default: 0 }
  }],

  // Exam results per track
  examResults: [{
    track: String,
    score: Number,
    total: Number,
    passed: Boolean,
    takenAt: Date,
    certificateUnlocked: { type: Boolean, default: false }
  }],

  // KCB Buni
  buniCheckoutID: { type: String, default: null },
  pendingPaymentTrack: { type: String, default: null },
  pendingPaymentType: { type: String, default: null }, // 'deposit' or 'balance'

  isAdmin: { type: Boolean, default: false },
  resetPasswordToken: { type: String, default: null },
  resetPasswordExpires: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
