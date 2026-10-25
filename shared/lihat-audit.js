const db = require('./db');
console.table(
  db.prepare('SELECT waktu, subjek, endpoint, device, hasil, alasan FROM audit_log ORDER BY id DESC LIMIT 25').all()
);