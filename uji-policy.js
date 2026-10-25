const BASE = 'http://localhost:3000';
const DEV = {
  admin1: 'DEV-ADMIN-001', dosen1: 'DEV-DOSEN-001', dosen2: 'DEV-DOSEN-002',
  mhs1: 'DEV-MHS-001', mhs2: 'DEV-MHS-002', mhs3: 'DEV-MHS-003',
};
const NIM = { mhs1: '2410001', mhs2: '2410002', mhs3: '2410003' };

async function login(u) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-ID': DEV[u] },
    body: JSON.stringify({ username: u, password: 'password123' }),
  });
  return (await r.json()).access_token;
}

async function tokenService() {
  const r = await fetch(`${BASE}/auth/service`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: 'service-nilai', client_secret: 'rahasia-service-ganti-ini' }),
  });
  return (await r.json()).access_token;
}

async function uji(label, harapan, method, path, token, device, body) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (device) headers['X-Device-ID'] = device;
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const teks = (await r.text()).replace(/\s+/g, ' ').slice(0, 80);
  console.log(`${r.status === harapan ? 'OK   ' : 'GAGAL'} | ${label} | harapan ${harapan}, dapat ${r.status} | ${teks}`);
}

(async () => {
  const t = {};
  for (const u of Object.keys(DEV)) t[u] = await login(u);
  const svc = await tokenService();

  console.log('--- Autentikasi dan device ---');
  await uji('tanpa token', 401, 'GET', '/nilai', null, null);
  await uji('mhs1 lihat nilai (device benar)', 200, 'GET', '/nilai', t.mhs1, DEV.mhs1);
  await uji('mhs1 tanpa X-Device-ID', 403, 'GET', '/nilai', t.mhs1, null);
  await uji('mhs1 pakai device milik mhs2', 403, 'GET', '/nilai', t.mhs1, DEV.mhs2);

  console.log('--- Role dan kepemilikan ---');
  await uji('dosen1 lihat nilai kelasnya', 200, 'GET', '/nilai', t.dosen1, DEV.dosen1);
  await uji('admin lihat nilai', 403, 'GET', '/nilai', t.admin1, DEV.admin1);
  await uji('mhs1 lihat transkrip sendiri', 200, 'GET', `/transkrip/${NIM.mhs1}`, t.mhs1, DEV.mhs1);
  await uji('mhs1 lihat transkrip mhs2', 403, 'GET', `/transkrip/${NIM.mhs2}`, t.mhs1, DEV.mhs1);
  await uji('admin lihat transkrip mhs2', 200, 'GET', `/transkrip/${NIM.mhs2}`, t.admin1, DEV.admin1);
  await uji('dosen1 lihat transkrip', 403, 'GET', `/transkrip/${NIM.mhs1}`, t.dosen1, DEV.dosen1);

  console.log('--- Ubah nilai ---');
  await uji('mhs1 ubah nilai', 403, 'PUT', '/nilai/1', t.mhs1, DEV.mhs1, { nilai_angka: 100 });
  await uji('dosen1 ubah nilai kelas sendiri', 200, 'PUT', '/nilai/1', t.dosen1, DEV.dosen1, { nilai_angka: 88 });
  await uji('dosen1 ubah nilai kelas dosen2', 403, 'PUT', '/nilai/2', t.dosen1, DEV.dosen1, { nilai_angka: 99 });
  await uji('dosen2 ubah nilai kelas sendiri', 200, 'PUT', '/nilai/2', t.dosen2, DEV.dosen2, { nilai_angka: 82 });

  console.log('--- Sinkron transkrip (hanya token service) ---');
  const sinkron = { kelas_id: 1, data: [{ nim: NIM.mhs1, nilai_angka: 88 }] };
  await uji('mhs1 sinkron', 403, 'POST', '/transkrip/sinkron', t.mhs1, DEV.mhs1, sinkron);
  await uji('admin sinkron', 403, 'POST', '/transkrip/sinkron', t.admin1, DEV.admin1, sinkron);
  await uji('dosen1 sinkron', 403, 'POST', '/transkrip/sinkron', t.dosen1, DEV.dosen1, sinkron);
  await uji('token service sinkron', 200, 'POST', '/transkrip/sinkron', svc, null, sinkron);
  await uji('token service akses /nilai', 403, 'GET', '/nilai', svc, null);

  console.log('--- Finalisasi ---');
  await uji('dosen2 finalisasi kelas dosen1', 403, 'POST', '/kelas/1/finalisasi', t.dosen2, DEV.dosen2);
  await uji('dosen1 finalisasi kelas sendiri', 200, 'POST', '/kelas/1/finalisasi', t.dosen1, DEV.dosen1);
  await uji('dosen1 ubah nilai yang sudah final', 409, 'PUT', '/nilai/1', t.dosen1, DEV.dosen1, { nilai_angka: 70 });
})();