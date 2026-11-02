const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  stage: { type: String, required: true, index: true }, // S1, S2, S3, QF, SF, F
  groupNo: { type: Number, default: null },
  poolNo: { type: Number, default: null },
  slot: { type: Number, default: null },                  // knockout bracket position
  home: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  away: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  homeScore: { type: Number, default: null },
  awayScore: { type: Number, default: null },
  played: { type: Boolean, default: false }
});

module.exports = mongoose.model('Match', matchSchema);
