# Sistem Nilai: Zero Trust Security

Tugas Praktikum Individu, Keamanan Informasi (KP70065004), Informatika Universitas Siliwangi.

- **Nama:** Bunga Denis Rinjani
- **NPM:** 247006111064
- **Kelas:** CD
- **Video demo:** [Tonton di Google Drive](https://drive.google.com/file/d/1F59mYJMpHL2CcF8bKZGPChISfMTqMUUw/view?usp=drive_link)

## Arsitektur

```
Client (Postman/curl)
   |  Authorization: Bearer <token> + X-Device-ID
   v
API Gateway (PEP + Policy Engine)  :3000  --> Audit Log (tabel audit_log)
   |  + X-Gateway-Secret
   +--> Service Nilai      :3001
   +--> Service Transkrip  :3002
            |
         Database SQLite bersama (shared/sistem-nilai.db)
```

Panggilan antar-service (Service Nilai ke Service Transkrip saat finalisasi) juga lewat gateway memakai token service.

## Struktur Folder

| Path | Isi |
|---|---|
| `gateway/index.js` | PEP: verifikasi token, panggil Policy Engine, audit, proxy |
| `gateway/policy.js` | Policy Engine: keputusan allow/deny + alasan |
| `gateway/auth.js` | Login, refresh, logout, token service |
| `gateway/audit.js` | Penulisan audit log |
| `service-nilai/index.js` | Service Nilai (port 3001) |
| `service-transkrip/index.js` | Service Transkrip (port 3002) |
| `shared/verify.js` | Verifikasi gateway secret + JWT di service |
| `shared/schema.sql`, `seed.js`, `db.js` | Skema, data awal, koneksi database |
| `shared/lihat-audit.js` | Menampilkan audit log |
| `uji-policy.js`, `uji-finalisasi.js`, `uji-jam.js` | Skrip pengujian otomatis |

## Database

SQLite (better-sqlite3). File dibuat otomatis di `shared/sistem-nilai.db` oleh `node shared/seed.js`. Tidak perlu menginstal server database.

## Cara Menjalankan

Prasyarat: Node.js 18 atau lebih baru.

```
npm install
copy .env.example .env
node shared/seed.js
```

Jalankan tiga server, masing-masing di jendela terminal sendiri:

```
node service-nilai/index.js
node service-transkrip/index.js
node gateway/index.js
```

Semua request dari client hanya ke `http://localhost:3000`.

## Akun dan Device ID Data Awal

Semua password: `password123`

| Username | Role | NIM | Device ID |
|---|---|---|---|
| admin1 | admin | - | DEV-ADMIN-001 |
| dosen1 | dosen | - | DEV-DOSEN-001 |
| dosen2 | dosen | - | DEV-DOSEN-002 |
| mhs1 | mahasiswa | 2410001 | DEV-MHS-001 |
| mhs2 | mahasiswa | 2410002 | DEV-MHS-002 |
| mhs3 | mahasiswa | 2410003 | DEV-MHS-003 |

Kelas 1 (Keamanan Informasi) diampu dosen1. Kelas 2 (Basis Data) diampu dosen2.

Credential service: `client_id=service-nilai`, secret ada di `.env`.

## Konfigurasi

Jam akses ubah/finalisasi nilai diatur di `.env` (`JAM_MULAI`, `JAM_SELESAI`). Restart gateway setelah mengubahnya.

## Catatan Kebijakan GET /nilai

Policy Engine memutuskan kepemilikan dengan membaca database. Mahasiswa hanya dapat melihat nilai NIM sendiri (parameter `?nim=` opsional). Dosen wajib menyertakan `?kelas_id=` dan hanya diizinkan jika ia pengampu kelas tersebut.

## Contoh Pemanggilan (curl)

Login (header `X-Device-ID` wajib):

```
curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" -H "X-Device-ID: DEV-MHS-001" -d "{\"username\":\"mhs1\",\"password\":\"password123\"}"
```

Lihat nilai dengan access token hasil login:

```
curl http://localhost:3000/nilai -H "Authorization: Bearer <access_token>" -H "X-Device-ID: DEV-MHS-001"
```

Dosen melihat nilai kelasnya:

```
curl "http://localhost:3000/nilai?kelas_id=1" -H "Authorization: Bearer <access_token_dosen1>" -H "X-Device-ID: DEV-DOSEN-001"
```

## Pengujian

Reset data sebelum setiap pengujian: matikan server, `node shared/seed.js`, nyalakan lagi.

```
node uji-policy.js           # 25 skenario allow/deny
node uji-finalisasi.js       # alur finalisasi dan sinkron transkrip
node uji-jam.js              # penolakan di luar jam akses (set JAM_MULAI=1, JAM_SELESAI=2)
node shared/lihat-audit.js   # melihat audit log
```

## Ringkasan Pemenuhan Kebutuhan

| Kebutuhan | Lokasi kode |
|---|---|
| 4.1 Access token 10 menit, refresh token 1 hari di DB, logout mencabut | `gateway/auth.js` |
| 4.1 Token service 5 menit | `gateway/auth.js` (`/auth/service`) |
| 4.1 Gateway secret | `gateway/index.js` (proxyReq), `shared/verify.js` |
| 4.1 Verifikasi ulang JWT di service | `shared/verify.js` (`requireToken`) |
| 4.2 Kebijakan akses (Tabel 3), kepemilikan dibaca dari database | `gateway/policy.js` |
| 4.3 Device terdaftar, jam akses | `gateway/policy.js` |
| 4.4 Audit log | `gateway/audit.js`, tabel `audit_log` |