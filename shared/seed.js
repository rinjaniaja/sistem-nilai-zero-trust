const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');

// 1. Buat ulang semua tabel
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// 2. Users (semua password: password123)
const hash = bcrypt.hashSync('password123', 10);
const insUser = db.prepare(
  'INSERT INTO users (username, password_hash, nama, role, nim) VALUES (?,?,?,?,?)'
);

const users = [
  ['admin1',  'Admin Prodi',       'admin',     null],
  ['dosen1',  'Dr. Reydinal',  'dosen',     null],
  ['dosen2',  'Dr. Bunga Denis',    'dosen',     null],
  ['mhs1',    'Suci Indah',      'mahasiswa', '2410001'],
  ['mhs2',    'Diaz Alfarizki',      'mahasiswa', '2410002'],
  ['mhs3',    'Briella',      'mahasiswa', '2410003'],
];
const id = {};
for (const [username, nama, role, nim] of users) {
  id[username] = insUser.run(username, hash, nama, role, nim).lastInsertRowid;
}

// 3. Device terdaftar (1 per user)
const insDev = db.prepare('INSERT INTO devices (user_id, device_id) VALUES (?,?)');
const devices = {
  admin1: 'DEV-ADMIN-001',
  dosen1: 'DEV-DOSEN-001',
  dosen2: 'DEV-DOSEN-002',
  mhs1:   'DEV-MHS-001',
  mhs2:   'DEV-MHS-002',
  mhs3:   'DEV-MHS-003',
};
for (const [username, dev] of Object.entries(devices)) {
  insDev.run(id[username], dev);
}

// 4. Kelas (diampu dosen berbeda)
const insKelas = db.prepare('INSERT INTO kelas (kode, nama, dosen_id) VALUES (?,?,?)');
const kelas1 = insKelas.run('KP70065004', 'Keamanan Informasi', id.dosen1).lastInsertRowid;
const kelas2 = insKelas.run('KP70065005', 'Basis Data',         id.dosen2).lastInsertRowid;

// 5. Nilai awal (draft) - tiap mahasiswa ikut kedua kelas
const insNilai = db.prepare(
  'INSERT INTO nilai (kelas_id, nim, nilai_angka, status) VALUES (?,?,?,?)'
);
const nim = ['2410001', '2410002', '2410003'];
const nilaiK1 = [85, 78, 90];
const nilaiK2 = [80, 88, 75];
nim.forEach((n, i) => {
  insNilai.run(kelas1, n, nilaiK1[i], 'draft');
  insNilai.run(kelas2, n, nilaiK2[i], 'draft');
});

console.log('Seed selesai.');
console.table(
  users.map(([username, nama, role, nim]) => ({
    username, role, nim: nim || '-', device: devices[username],
  }))
);