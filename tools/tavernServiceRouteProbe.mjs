// Runs the real HTTP route, authentication, realm checkpoint, D1 migration and R2-backed payment.
// BUNNYFALL_DATA must name disposable local test data. Never point this at a live server's data.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { TAVERN_RECIPES, TAVERN_INGREDIENTS, tavernOrder, TAVERN_ORDER_MIN_S } from '../src/net/tavernServiceLaw.js';

assert.ok(process.env.BUNNYFALL_DATA, 'Set BUNNYFALL_DATA to a disposable test directory.');
const root = fileURLToPath(new URL('..', import.meta.url));
const port = process.env.TAVERN_TEST_PORT || '19788';
const server = spawn(process.execPath, ['selfhost/start.mjs'], { cwd: root, env: { ...process.env,
  ACCOUNT_PORT: port, RELAY_PORT: String(Number(port) - 1), UPDATER_PORT: String(Number(port) + 1) }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stdout.on('data', (b) => { log += b; }); server.stderr.on('data', (b) => { log += b; });
let secret;
const base = `http://127.0.0.1:${port}`;
async function request(path, body, { method = 'POST', headers = {} } = {}) {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(secret ? { authorization: `Bearer ${secret}` } : {}), ...headers }, ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}) });
  const data = await r.json(); return { status: r.status, data };
}
try {
  const until = Date.now() + 90000;
  while (!log.includes('[bunnyfall] relay on')) {
    if (server.exitCode != null || Date.now() > until) throw new Error('Local service did not start: ' + log.slice(-1200));
    await wait(200);
  }
  const guest = await request('/v1/auth/guest', { terms: true, privacy: true });
  assert.equal(guest.status, 200, JSON.stringify(guest.data)); secret = guest.data.secret;
  assert.ok(secret, 'Guest authentication failed');
  const born = await request('/v1/realm/create', { name: 'Tavern Test' });
  assert.ok(born.data.id, JSON.stringify(born.data));
  const { id, lease } = born.data; let seq = 1, version = 0, state, serial = 0;
  const save = { v: 1, level: 1, goldPieces: 0, items: [], factionRep: { ids: [2002], rep: [0] }, modData: { BunnyGuilds: { bards: { rank: 3, joinedAt: 1 } } },
    interior: { building: { buildingType: 15, buildingKey: 42, regionIndex: 17, townMapId: 17 } } };
  const put = await request(`/v1/realm/${id}/data`, save, { method: 'PUT', headers: { 'x-realm-lease': lease, 'x-realm-seq': '1' } });
  assert.equal(put.status, 200, JSON.stringify(put.data));
  async function act(op, extra = {}) {
    const body = { op, id, lease, seq, version, txn: `probe_${++serial}_${Date.now()}`, where: '17:42', buildingKey: 42, target: 'keeper', ...extra };
    const r = await request('/v1/tavern/service', body);
    if (r.data.ok) { state = r.data.state; version = r.data.version; seq = r.data.realm?.seq ?? seq; }
    return { ...r, body };
  }
  assert.equal((await act('read')).status, 200);
  assert.equal((await act('start', { keeper: 'keeper', patrons: ['guest'] })).status, 200);
  const recipe = TAVERN_RECIPES.find((r) => r.id === tavernOrder(state).recipe);
  for (const ingredient of TAVERN_INGREDIENTS) for (let n = 0; n < recipe[ingredient]; n++) assert.equal((await act('pour', { ingredient })).status, 200);
  assert.equal((await act('carry')).status, 200);
  const early = await act('serve', { target: 'guest' });
  assert.equal(early.data.error, 'tavern-too-soon');
  const remainingMs = Math.max(0, (state.orderAt + TAVERN_ORDER_MIN_S + 1) * 1000 - Date.now());
  await wait(remainingMs);
  assert.equal((await act('serve', { target: 'guest' })).status, 200);
  assert.equal((await act('collect', { target: 'guest' })).status, 200);
  const paid = await act('return'); assert.equal(paid.data.gold, 24); assert.equal(paid.data.realm.seq, 2);
  const replay = await request('/v1/tavern/service', paid.body); assert.equal(replay.data.replayed, true);
  const saved = await request(`/v1/realm/${id}/data`, null, { method: 'GET' });
  assert.equal(saved.data.goldPieces, 24);
  const unauth = await fetch(base + '/v1/tavern/service', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(unauth.status, 401);
  console.log('PASS: real HTTP authentication, route, realm save, preparation, timing, delivery, payment and replay.');
} finally {
  server.kill('SIGTERM');
  await new Promise((r) => { if (server.exitCode != null) return r(); server.once('exit', r); setTimeout(() => { server.kill('SIGKILL'); r(); }, 5000).unref(); });
}
