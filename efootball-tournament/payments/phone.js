// Accepts 07XXXXXXXX, 01XXXXXXXX, 254XXXXXXXXX or +254XXXXXXXXX. Returns 254XXXXXXXXX or null.
function normalizeMpesaPhone(input) {
  let p = String(input || '').replace(/[\s-]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (/^0[17]\d{8}$/.test(p)) return '254' + p.slice(1);
  if (/^254[17]\d{8}$/.test(p)) return p;
  return null;
}

module.exports = { normalizeMpesaPhone };
