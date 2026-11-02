// Single entry point for all payment code.
const buni = require('./buni');
const { normalizeMpesaPhone } = require('./phone');

module.exports = { buni, normalizeMpesaPhone };
