const BASE = 'http://localhost:3000';
const j = { 'Content-Type': 'application/json' };
const NIM_MHS1 = '2410001';

async function login(u, dev) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { ...j, 'X-Device-ID': dev },
    body: JSON.stringify({ username: u, password: 'password123' }),
  });
  return (await r.json()).access_token;
}

const get = async (path, token, dev) => {
  const r = await fetch(BASE + path, {
    headers: { Authorization: `Bearer ${token}`, 'X-Device-ID': dev },
  });
  return `${r.status} ${await r.text()}`;
};

(async () => {
  const dosen1 = await login('dosen1', 'DEV-DOSEN-001');
  const mhs1 = await login('mhs1', 'DEV-MHS-001');

  console.log('Transkrip mhs1 SEBELUM finalisasi:');
  console.log(await get(`/transkrip/${NIM_MHS1}`, mhs1, 'DEV-MHS-001'));

  const r = await fetch(`${BASE}/kelas/1/finalisasi`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${dosen1}`, 'X-Device-ID': 'DEV-DOSEN-001' },
  });
  console.log('\nFinalisasi kelas 1 oleh dosen1:', r.status, await r.text());

  console.log('\nTranskrip mhs1 SESUDAH finalisasi:');
  console.log(await get(`/transkrip/${NIM_MHS1}`, mhs1, 'DEV-MHS-001'));
})();