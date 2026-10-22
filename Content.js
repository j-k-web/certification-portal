const mongoose = require('mongoose');

// Stores video/notes uploaded by admin per track per week per day
const contentSchema = new mongoose.Schema({
  track: { type: String, required: true },    // e.g. 'programming'
  week: { type: Number, required: true },      // 1-4
  day: { type: Number, required: true },       // 1-5
  title: { type: String, required: true },
  type: { type: String, enum: ['video', 'notes'], required: true },
  // For video: a URL (YouTube embed or uploaded file URL)
  // For notes: text content or file URL
  content: { type: String, required: true },  // URL or text
  fileType: { type: String },                  // 'youtube', 'mp4', 'pdf', 'text'
  uploadedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Content', contentSchema);
