require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const jwt = require('jsonwebtoken');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { logAudit } = require('./audit');
const { putuskan } = require('./policy');
const authRouter = require('./auth');

const app = express();

// /auth ditangani gateway sendiri; express.json() hanya dipasang di sini
app.use('/auth', express.json(), authRouter);

// ---------- PEP: periksa setiap request sebelum diteruskan ----------
function enforce(req, res, next) {
  const path = req.originalUrl.split('?')[0];
  const endpoint = `${req.method} ${path}`;
  const device = req.headers['x-device-id'];

  const tolakToken = (alasan) => {
    logAudit({ subjek: 'anonim', endpoint, device, hasil: 'deny', alasan });
    return res.status(401).json({ error: alasan });
  };

  // 1. Verifikasi access token
  const [scheme, token] = (req.headers['authorization'] || '').split(' ');
  if (scheme !== 'Bearer' || !token) return tolakToken('token tidak ada');

  let claims;
  try {
    claims = jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    return tolakToken('token tidak valid atau kedaluwarsa');
  }

  // 2. Minta keputusan ke Policy Engine (gagal = tolak / fail closed)
  let keputusan;
  try {
    keputusan = putuskan({ method: req.method, path, claims, device });
  } catch (e) {
    console.error(e);
    keputusan = { allow: false, status: 500, subjek: 'anonim', alasan: 'kesalahan internal policy engine (fail closed)' };
  }

  // 3. Catat audit log
  logAudit({
    subjek: keputusan.subjek,
    endpoint,
    device,
    hasil: keputusan.allow ? 'allow' : 'deny',
    alasan: keputusan.alasan,
  });

  // 4. Tolak atau teruskan
  if (!keputusan.allow) return res.status(keputusan.status).json({ error: keputusan.alasan });
  next();
}

app.use(['/nilai', '/kelas', '/transkrip'], enforce);

// ---------- Proxy ke service (menambahkan X-Gateway-Secret) ----------
function buatProxy(target, pathFilter) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathFilter,
    on: {
      proxyReq: (proxyReq) => {
        proxyReq.setHeader('X-Gateway-Secret', process.env.GATEWAY_SECRET);
      },
      error: (err, req, res) => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Service tidak dapat dihubungi' }));
      },
    },
  });
}

app.use(buatProxy('http://localhost:3001', ['/nilai', '/kelas']));
app.use(buatProxy('http://localhost:3002', ['/transkrip']));

// Route lain: tolak
app.use((req, res) => {
  logAudit({
    subjek: 'anonim',
    endpoint: `${req.method} ${req.originalUrl}`,
    device: req.headers['x-device-id'],
    hasil: 'deny',
    alasan: 'endpoint tidak dikenal',
  });
  res.status(404).json({ error: 'Endpoint tidak ditemukan' });
});

app.listen(3000, () => console.log('API Gateway jalan di port 3000'));