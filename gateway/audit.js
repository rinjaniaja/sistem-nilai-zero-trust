const db = require('../shared/db');

const insert = db.prepare(`
  INSERT INTO audit_log (waktu, subjek, endpoint, device, hasil, alasan)
  VALUES (?,?,?,?,?,?)`);

// hasil: 'allow' | 'deny'
function logAudit({ subjek, endpoint, device, hasil, alasan }) {
  const waktu = new Date().toISOString();
  insert.run(waktu, subjek || 'anonim', endpoint, device || '-', hasil, alasan);
  console.log(`[AUDIT] ${waktu} | ${subjek || 'anonim'} | ${endpoint} | ${device || '-'} | ${hasil.toUpperCase()} | ${alasan}`);
}

module.exports = { logAudit };