require('dotenv').config();
const jwt = require('jsonwebtoken');

// Lapis 1: pastikan request datang dari gateway
function requireGatewaySecret(req, res, next) {
  if (req.headers['x-gateway-secret'] !== process.env.GATEWAY_SECRET) {
    return res.status(403).json({ error: 'Akses langsung ditolak: gateway secret tidak valid' });
  }
  next();
}

// Lapis 2: verifikasi ulang tanda tangan dan masa berlaku token
function requireToken(req, res, next) {
  const header = req.headers['authorization'] || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Token tidak ada' });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token tidak valid atau kedaluwarsa' });
  }
}

module.exports = { requireGatewaySecret, requireToken };