const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../shared/db');
const { logAudit } = require('./audit');

const router = express.Router();

const ACCESS_TTL = '10m';
const SERVICE_TTL = '5m';
const REFRESH_TTL_MS = 24 * 60 * 60 * 1000; // 1 hari

// Refresh token disimpan sebagai hash, bukan teks asli
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Perbandingan secret yang tahan timing attack
function safeEqual(a, b) {
  const A = Buffer.from(String(a || ''));
  const B = Buffer.from(String(b || ''));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

function buatAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: ACCESS_TTL,
  });
}

// ---------- POST /auth/login ----------
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const device = req.headers['x-device-id'];
  const endpoint = 'POST /auth/login';

  // alasanAudit: detail untuk log. pesan: umum untuk client (cegah user enumeration)
  const deny = (status, alasanAudit, pesan) => {
    logAudit({ subjek: username, endpoint, device, hasil: 'deny', alasan: alasanAudit });
    return res.status(status).json({ error: pesan });
  };

  if (!username || !password) {
    return deny(400, 'username/password tidak diisi', 'username dan password wajib diisi');
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return deny(401, 'kredensial tidak valid', 'Kredensial tidak valid');
  }

  if (!device) {
    return deny(403, 'header X-Device-ID tidak ada', 'Device tidak terdaftar');
  }
  const dev = db
    .prepare('SELECT 1 FROM devices WHERE user_id = ? AND device_id = ?')
    .get(user.id, device);
  if (!dev) {
    return deny(403, 'device tidak terdaftar untuk user ini', 'Device tidak terdaftar');
  }

  // Terbitkan token
  const accessToken = buatAccessToken(user);
  const refreshToken = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS).toISOString();
  db.prepare(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?,?,?)'
  ).run(user.id, sha256(refreshToken), expiresAt);

  logAudit({ subjek: user.username, endpoint, device, hasil: 'allow', alasan: 'login berhasil' });
  res.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: 600,
  });
});

// ---------- POST /auth/refresh ----------
router.post('/refresh', (req, res) => {
  const { refresh_token } = req.body || {};
  const device = req.headers['x-device-id'];
  const endpoint = 'POST /auth/refresh';

  const deny = (status, alasan, subjek) => {
    logAudit({ subjek, endpoint, device, hasil: 'deny', alasan });
    return res.status(status).json({ error: alasan });
  };

  if (!refresh_token) return deny(400, 'refresh_token tidak diisi');

  const row = db
    .prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?')
    .get(sha256(refresh_token));
  if (!row) return deny(401, 'refresh token tidak dikenal');

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
  if (row.revoked) return deny(401, 'refresh token sudah dicabut', user.username);
  if (new Date(row.expires_at) < new Date()) {
    return deny(401, 'refresh token kedaluwarsa', user.username);
  }

  logAudit({ subjek: user.username, endpoint, device, hasil: 'allow', alasan: 'refresh berhasil' });
  res.json({ access_token: buatAccessToken(user), token_type: 'Bearer', expires_in: 600 });
});

// ---------- POST /auth/logout ----------
router.post('/logout', (req, res) => {
  const { refresh_token } = req.body || {};
  const device = req.headers['x-device-id'];
  const endpoint = 'POST /auth/logout';

  const row = refresh_token
    ? db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').get(sha256(refresh_token))
    : null;

  if (!row || row.revoked) {
    logAudit({ subjek: 'anonim', endpoint, device, hasil: 'deny', alasan: 'refresh token tidak valid atau sudah dicabut' });
    return res.status(401).json({ error: 'Refresh token tidak valid atau sudah dicabut' });
  }

  db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?').run(row.id);
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(row.user_id);
  logAudit({ subjek: user.username, endpoint, device, hasil: 'allow', alasan: 'logout, refresh token dicabut' });
  res.json({ message: 'Logout berhasil' });
});

// ---------- POST /auth/service ----------
router.post('/service', (req, res) => {
  const { client_id, client_secret } = req.body || {};
  const endpoint = 'POST /auth/service';

  const valid =
    safeEqual(client_id, process.env.SERVICE_CLIENT_ID) &&
    safeEqual(client_secret, process.env.SERVICE_CLIENT_SECRET);

  if (!valid) {
    logAudit({ subjek: client_id || 'anonim', endpoint, device: '-', hasil: 'deny', alasan: 'client id/secret tidak valid' });
    return res.status(401).json({ error: 'Client ID atau secret tidak valid' });
  }

  const token = jwt.sign({ sub: client_id, role: 'service' }, process.env.JWT_SECRET, {
    expiresIn: SERVICE_TTL,
  });
  logAudit({ subjek: client_id, endpoint, device: '-', hasil: 'allow', alasan: 'token service diterbitkan' });
  res.json({ access_token: token, token_type: 'Bearer', expires_in: 300 });
});

module.exports = router;