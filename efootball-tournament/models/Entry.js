const mongoose = require('mongoose');

// One tournament entry per paid player. Stage, group and pool show where they are now.
const entrySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  stage: { type: String, default: 'S1' },
  groupNo: { type: Number, default: null },
  poolNo: { type: Number, default: null },
  status: { type: String, default: 'active' }
});

module.exports = mongoose.model('Entry', entrySchema);
