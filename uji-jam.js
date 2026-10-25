const BASE = 'http://localhost:3000';

(async () => {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-ID': 'DEV-DOSEN-001' },
    body: JSON.stringify({ username: 'dosen1', password: 'password123' }),
  });
  const token = (await r.json()).access_token;
  const h = { Authorization: `Bearer ${token}`, 'X-Device-ID': 'DEV-DOSEN-001', 'Content-Type': 'application/json' };

  const a = await fetch(`${BASE}/nilai/1`, { method: 'PUT', headers: h, body: JSON.stringify({ nilai_angka: 90 }) });
  console.log('Ubah nilai :', a.status, await a.text());

  const b = await fetch(`${BASE}/kelas/1/finalisasi`, { method: 'POST', headers: h });
  console.log('Finalisasi :', b.status, await b.text());

  const c = await fetch(`${BASE}/nilai`, { headers: h });
  console.log('Lihat nilai:', c.status, '(melihat nilai tidak dibatasi jam)');
})();