const db = require('../shared/db');

// Jam akses dibaca dari .env (JAM_MULAI, JAM_SELESAI) memakai jam komputer ini
function dalamJamAkses(sekarang = new Date()) {
  const mulai = Number(process.env.JAM_MULAI);
  const selesai = Number(process.env.JAM_SELESAI);
  const jam = sekarang.getHours() + sekarang.getMinutes() / 60;
  return jam >= mulai && jam < selesai;
}

// Mengembalikan { allow, status, subjek, alasan }
function putuskan({ method, path, claims, device }) {
  const rute = `${method} ${path}`;
  const izinkan = (subjek, alasan) => ({ allow: true, status: 200, subjek, alasan });
  const tolak = (subjek, status, alasan) => ({ allow: false, status, subjek, alasan });

  // ---------- Panggilan antar-service (token service) ----------
  if (claims.role === 'service') {
    const subjek = String(claims.sub);
    if (rute === 'POST /transkrip/sinkron') {
      return izinkan(subjek, 'token service valid untuk sinkron transkrip');
    }
    return tolak(subjek, 403, 'token service hanya boleh untuk POST /transkrip/sinkron');
  }

  // ---------- Request dari user ----------
  // Data user dibaca dari database, bukan dipercaya dari isi token
  const user = db
    .prepare('SELECT id, username, role, nim FROM users WHERE id = ?')
    .get(claims.sub);
  if (!user) return tolak('anonim', 401, 'user pada token tidak ditemukan');
  const s = user.username;

  // Verifikasi konteks 1: device terdaftar
  if (!device) return tolak(s, 403, 'header X-Device-ID tidak ada');
  const dev = db
    .prepare('SELECT 1 FROM devices WHERE user_id = ? AND device_id = ?')
    .get(user.id, device);
  if (!dev) return tolak(s, 403, 'device tidak terdaftar untuk user ini');

  // Endpoint khusus service: token user mana pun ditolak
  if (rute === 'POST /transkrip/sinkron') {
    return tolak(s, 403, 'hanya token service yang boleh sinkron transkrip');
  }

  // GET /nilai
  if (rute === 'GET /nilai') {
    if (user.role === 'mahasiswa' || user.role === 'dosen') {
      return izinkan(s, `${user.role} boleh melihat nilai (data difilter sesuai kepemilikan)`);
    }
    return tolak(s, 403, `role ${user.role} tidak boleh melihat nilai`);
  }

  // PUT /nilai/:id
  let m = path.match(/^\/nilai\/(\d+)$/);
  if (method === 'PUT' && m) {
    if (user.role !== 'dosen') return tolak(s, 403, 'hanya dosen yang boleh mengubah nilai');
    const row = db
      .prepare(`SELECT n.status, k.dosen_id FROM nilai n
                JOIN kelas k ON k.id = n.kelas_id WHERE n.id = ?`)
      .get(m[1]);
    if (!row) return tolak(s, 404, 'nilai tidak ditemukan');
    if (row.dosen_id !== user.id) return tolak(s, 403, 'bukan dosen pengampu kelas ini');
    if (row.status === 'final') return tolak(s, 409, 'nilai sudah final');
    if (!dalamJamAkses()) return tolak(s, 403, 'di luar jam akses');
    return izinkan(s, 'dosen pengampu, nilai belum final, dalam jam akses');
  }

  // POST /kelas/:id/finalisasi
  m = path.match(/^\/kelas\/(\d+)\/finalisasi$/);
  if (method === 'POST' && m) {
    if (user.role !== 'dosen') return tolak(s, 403, 'hanya dosen yang boleh finalisasi');
    const kelas = db.prepare('SELECT dosen_id FROM kelas WHERE id = ?').get(m[1]);
    if (!kelas) return tolak(s, 404, 'kelas tidak ditemukan');
    if (kelas.dosen_id !== user.id) return tolak(s, 403, 'bukan dosen pengampu kelas ini');
    if (!dalamJamAkses()) return tolak(s, 403, 'di luar jam akses');
    return izinkan(s, 'dosen pengampu, dalam jam akses');
  }

  // GET /transkrip/:nim
  m = path.match(/^\/transkrip\/([^/]+)$/);
  if (method === 'GET' && m) {
    if (user.role === 'admin') return izinkan(s, 'admin boleh melihat semua transkrip');
    if (user.role === 'mahasiswa') {
      if (user.nim === m[1]) return izinkan(s, 'mahasiswa melihat transkrip miliknya');
      return tolak(s, 403, 'mahasiswa hanya boleh melihat transkrip NIM sendiri');
    }
    return tolak(s, 403, `role ${user.role} tidak boleh melihat transkrip`);
  }

  // Tidak ada aturan yang cocok: default deny
  return tolak(s, 403, 'tidak ada kebijakan yang mengizinkan (default deny)');
}

module.exports = { putuskan };