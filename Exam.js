const mongoose = require('mongoose');

// Exam questions per track (set by admin)
const examSchema = new mongoose.Schema({
  track: { type: String, required: true, unique: true },
  questions: [{
    question: String,
    options: [String],  // 4 options
    correctIndex: Number // 0-3
  }],
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Exam', examSchema);
