require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const db = require('../shared/db');
const { requireGatewaySecret, requireToken } = require('../shared/verify');

const app = express();
app.use(express.json());
app.use(requireGatewaySecret);
app.use(requireToken);

// GET /transkrip/:nim
app.get('/transkrip/:nim', (req, res) => {
  const rows = db.prepare(`
    SELECT kode_mk, nama_mk, nilai_angka, created_at
    FROM transkrip WHERE nim = ?`).all(req.params.nim);
  res.json({ nim: req.params.nim, transkrip: rows });
});

// POST /transkrip/sinkron  (hanya token service, dicek di gateway dan di sini)
app.post('/transkrip/sinkron', (req, res) => {
  if (req.user.role !== 'service') {
    return res.status(403).json({ error: 'Hanya token service yang diizinkan' });
  }

  const { kelas_id, data } = req.body;
  if (!kelas_id || !Array.isArray(data)) {
    return res.status(400).json({ error: 'Body harus berisi kelas_id dan data[]' });
  }

  const kelas = db.prepare('SELECT kode, nama FROM kelas WHERE id = ?').get(kelas_id);
  if (!kelas) return res.status(404).json({ error: 'Kelas tidak ditemukan' });

  const upsert = db.prepare(`
    INSERT INTO transkrip (nim, kelas_id, kode_mk, nama_mk, nilai_angka)
    VALUES (?,?,?,?,?)
    ON CONFLICT (nim, kelas_id) DO UPDATE SET nilai_angka = excluded.nilai_angka`);

  const tx = db.transaction((items) => {
    for (const d of items) upsert.run(d.nim, kelas_id, kelas.kode, kelas.nama, d.nilai_angka);
  });
  tx(data);

  res.json({ message: 'Transkrip disinkronkan', jumlah: data.length });
});

app.listen(3002, () => console.log('Service Transkrip jalan di port 3002'));