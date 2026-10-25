require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const db = require('../shared/db');
const { requireGatewaySecret, requireToken } = require('../shared/verify');

const app = express();

// ---------- Token service (di-cache sampai mendekati kedaluwarsa) ----------
const GATEWAY = 'http://localhost:3000';
let cache = { token: null, exp: 0 };

async function ambilTokenService() {
  if (cache.token && Date.now() < cache.exp - 30000) return cache.token;
  const r = await fetch(`${GATEWAY}/auth/service`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SERVICE_CLIENT_ID,
      client_secret: process.env.SERVICE_CLIENT_SECRET,
    }),
  });
  if (!r.ok) throw new Error('gagal mengambil token service');
  const d = await r.json();
  cache = { token: d.access_token, exp: Date.now() + d.expires_in * 1000 };
  return cache.token;
}

// ---------- Verifikasi dua lapis ----------
app.use(express.json());
app.use(requireGatewaySecret);
app.use(requireToken);

// GET /nilai
// Mahasiswa: hanya nilai miliknya. Dosen: hanya kelas yang diampu.
// (Keputusan allow/deny sudah dibuat gateway; di sini hanya memfilter data.)
app.get('/nilai', (req, res) => {
  const { sub, role } = req.user;

  if (role === 'mahasiswa') {
    const user = db.prepare('SELECT nim FROM users WHERE id = ?').get(sub);
    const rows = db.prepare(`
      SELECT n.id, n.kelas_id, k.nama AS kelas, n.nim, n.nilai_angka, n.status
      FROM nilai n JOIN kelas k ON k.id = n.kelas_id
      WHERE n.nim = ?`).all(user.nim);
    return res.json(rows);
  }

  if (role === 'dosen') {
    const rows = db.prepare(`
      SELECT n.id, n.kelas_id, k.nama AS kelas, n.nim, n.nilai_angka, n.status
      FROM nilai n JOIN kelas k ON k.id = n.kelas_id
      WHERE k.dosen_id = ?`).all(sub);
    return res.json(rows);
  }

  res.status(403).json({ error: 'Role tidak diizinkan' });
});

// PUT /nilai/:id  (ubah nilai, hanya jika belum final)
app.put('/nilai/:id', (req, res) => {
  const { nilai_angka } = req.body;
  if (typeof nilai_angka !== 'number' || nilai_angka < 0 || nilai_angka > 100) {
    return res.status(400).json({ error: 'nilai_angka harus angka 0-100' });
  }
  const row = db.prepare('SELECT status FROM nilai WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Nilai tidak ditemukan' });
  if (row.status === 'final') return res.status(409).json({ error: 'Nilai sudah final' });

  db.prepare('UPDATE nilai SET nilai_angka = ? WHERE id = ?').run(nilai_angka, req.params.id);
  res.json({ message: 'Nilai diperbarui', id: Number(req.params.id), nilai_angka });
});

// POST /kelas/:id/finalisasi
// Sinkron ke Service Transkrip LEWAT GATEWAY memakai token service.
app.post('/kelas/:id/finalisasi', async (req, res) => {
  const kelasId = req.params.id;
  const kelas = db.prepare('SELECT id FROM kelas WHERE id = ?').get(kelasId);
  if (!kelas) return res.status(404).json({ error: 'Kelas tidak ditemukan' });

  const rows = db
    .prepare('SELECT nim, nilai_angka FROM nilai WHERE kelas_id = ?')
    .all(kelasId);

  try {
    // Sinkron dulu; kalau gagal, status tidak diubah
    const token = await ambilTokenService();
    const r = await fetch(`${GATEWAY}/transkrip/sinkron`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ kelas_id: Number(kelasId), data: rows }),
    });
    if (!r.ok) {
      const err = await r.text();
      return res.status(502).json({ error: 'Sinkron transkrip gagal', detail: err });
    }
  } catch (e) {
    return res.status(502).json({ error: 'Sinkron transkrip gagal', detail: e.message });
  }

  db.prepare("UPDATE nilai SET status = 'final' WHERE kelas_id = ?").run(kelasId);
  res.json({ message: 'Kelas difinalisasi dan disinkronkan ke transkrip', jumlah: rows.length });
});

app.listen(3001, () => console.log('Service Nilai jalan di port 3001'));