import { tavernRoomEvent } from '../src/net/tavernRoomLaw.js';
import { tavernFavorBuy } from '../server-account/src/tavernFavor.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { tavernServiceAct } from '../server-account/src/tavernService.js';
import { TAVERN_RECIPES, TAVERN_INGREDIENTS, tavernOrder } from '../src/net/tavernServiceLaw.js';

// Real SQLite constraints/rollback, the actual service handler and actual realm record mutation.
export function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE realm_characters (id TEXT PRIMARY KEY, player TEXT, seq INTEGER, lease TEXT, obj TEXT, prev TEXT, held TEXT,
    judged_seq INTEGER, clean_obj TEXT, clean_seq INTEGER, bytes INTEGER, updated_at INTEGER, witnessed INTEGER DEFAULT 0, svc_seq INTEGER);
    CREATE TABLE realm_tx_guard (moved INTEGER, expected INTEGER, CHECK(moved = expected));`);
  sql.exec(readFileSync(new URL('../server-account/migrations/0210_tavern_service.sql', import.meta.url), 'utf8'));
  const stmt = (text, args = []) => ({
    bind: (...values) => stmt(text, values),
    first: async () => sql.prepare(text).get(...args) ?? null,
    all: async () => ({ results: sql.prepare(text).all(...args) }),
    run: async () => { const r = sql.prepare(text).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  });
  const db = { prepare: stmt, async batch(steps) {
    sql.exec('BEGIN'); try { const result = []; for (const s of steps) result.push(await s.run()); sql.exec('COMMIT'); return result; }
    catch (e) { sql.exec('ROLLBACK'); throw e; }
  } };
  const blobs = new Map();
  const bucket = { async get(key) { const text = blobs.get(key); return text == null ? null : { arrayBuffer: async () => new TextEncoder().encode(text).buffer, text: async () => text }; },
    async put(key, text) { blobs.set(key, text); }, async delete(keys) { for (const k of Array.isArray(keys) ? keys : [keys]) blobs.delete(k); } };
  const id = 'r' + 'a'.repeat(20), lease = 'b'.repeat(32), player = 'player';
  const save = { level: 1, goldPieces: 0, items: [], factionRep: { ids: [2002], rep: [0] }, modData: { BunnyGuilds: { bards: { rank: 3 } } },
    interior: { building: { buildingType: 15, buildingKey: 42, regionIndex: 17, townMapId: 17 } } };
  blobs.set('save', JSON.stringify(save));
  sql.prepare('INSERT INTO realm_characters (id, player, seq, lease, obj, witnessed, judged_seq) VALUES (?, ?, 1, ?, ?, 0, 1)').run(id, player, lease, 'save');
  const ctx = { db, bucket, nowS: 100, rand: (a) => crypto.getRandomValues(a) };
  let serial = 0, version = 0, seq = 1, state;
  async function call(op, extra = {}) {
    const body = { id, lease, seq, version, where: '17:42', buildingKey: 42, target: 'keeper', txn: `request_${++serial}`, op, ...extra };
    const r = await tavernServiceAct(ctx, player, body);
    if (r.ok) { version = r.version; state = r.state; seq = r.realm?.seq ?? seq; }
    return { r, body };
  }
  async function prepare() {
    await call('start', { keeper: 'keeper', patrons: ['guest'] });
    const recipe = TAVERN_RECIPES.find((r) => r.id === tavernOrder(state).recipe);
    for (const ingredient of TAVERN_INGREDIENTS) for (let n = 0; n < recipe[ingredient]; n++) assert.equal((await call('pour', { ingredient })).r.ok, true);
    await call('carry'); ctx.nowS += 21; await call('serve', { target: 'guest' }); await call('collect', { target: 'guest' });
  }
  return { ctx, sql, call, prepare, player, id, lease, blobs, get state() { return state; } };
}
test('service pays into the realm record exactly once even when the return acknowledgement is replayed', async () => {
  const f = fixture(); await f.prepare();
  const { r, body } = await f.call('return');
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.gold, 36); assert.equal(r.realm.seq, 2);
  const replay = await tavernServiceAct(f.ctx, f.player, body);
  assert.equal(replay.replayed, true); assert.equal(replay.version, r.version);
  const row = f.sql.prepare('SELECT seq, obj FROM realm_characters').get();
  const save = JSON.parse(f.blobs.get(row.obj));
  assert.equal(row.seq, 2); assert.equal(save.goldPieces, 36);
  assert.equal((await f.call('return')).r.error, 'tavern-action');
});
test('the character lease, action revision and saved room are enforced', async () => {
  const f = fixture(); const { body } = await f.call('start', { keeper: 'keeper', patrons: ['guest'] });
  const req = { ...body, txn: 'another_request', op: 'pour', ingredient: 'wine' };
  assert.equal((await tavernServiceAct(f.ctx, f.player, { ...req, lease: 'c'.repeat(32) })).error, 'lease');
  assert.equal((await tavernServiceAct(f.ctx, f.player, req)).error, 'tavern-version');
  assert.equal((await f.call('pour', { ingredient: 'wine', buildingKey: 99 })).r.error, 'tavern-place');
  assert.equal((await tavernServiceAct(f.ctx, 'other-player', req)).error, 'no-realm-character');
});
test('concurrent returns with different request ids cannot double-pay', async () => {
  const f = fixture(); await f.prepare();
  // Both statements may read the old version; SQLite batch guards reject one after the other commits.
  const body = { id: f.id, lease: f.lease, seq: 1, version: 7, where: '17:42', buildingKey: 42, target: 'keeper', op: 'return' };
  // Read the real revision rather than assume how many preparation acts a recipe needed.
  body.version = f.sql.prepare('SELECT version FROM tavern_service').get().version;
  const results = await Promise.allSettled(['parallel_1', 'parallel_2'].map((txn) => tavernServiceAct(f.ctx, f.player, { ...body, txn })));
  assert.equal(results.filter((r) => r.status === 'fulfilled' && r.value.ok).length, 1, JSON.stringify(results));
  const row = f.sql.prepare('SELECT seq, obj FROM realm_characters').get();
  assert.equal(row.seq, 2); assert.equal(JSON.parse(f.blobs.get(row.obj)).goldPieces, 36);
});
test('a complete shift writes the Bards reputation into the same realm save as the final payment', async () => {
  const f = fixture(); let rep = 0;
  for (let n = 0; n < 6; n++) { await f.prepare(); const { r } = await f.call('return'); assert.equal(r.ok, true, JSON.stringify(r)); rep += r.rep; }
  assert.equal(rep, 2); assert.equal(f.state.phase, 'done');
  const row = f.sql.prepare('SELECT seq, obj FROM realm_characters').get();
  const save = JSON.parse(f.blobs.get(row.obj));
  assert.equal(row.seq, 7); assert.equal(save.goldPieces, 327); assert.equal(save.factionRep.rep[0], 2);
  assert.equal(save.modData.BunnyGuilds._marks.tavern.favor, 1);
  assert.equal(save.modData.BunnyGuilds._marks.tavern.cities['17'], 1);
  assert.equal(save.legalRep['17'], 1);
});
test('replaying a paid receipt after a later checkpoint never moves the realm sequence backwards', async () => {
  const f = fixture(); await f.prepare(); const { body } = await f.call('return');
  f.sql.prepare('UPDATE realm_characters SET seq = 3').run();
  const replay = await tavernServiceAct(f.ctx, f.player, { ...body, seq: 3 });
  assert.equal(replay.replayed, true); assert.equal(replay.realm.seq, 3);
});

function favorFixture(favor = 25) {
  const f = fixture();
  f.sql.exec("CREATE TABLE players (id TEXT PRIMARY KEY, insignia TEXT); INSERT INTO players VALUES ('player', '')");
  const save = JSON.parse(f.blobs.get('save'));
  save.modData.BunnyGuilds._marks = { tavern: { favor, cities: {} } };
  f.blobs.set('save', JSON.stringify(save));
  const body = { id: f.id, lease: f.lease, seq: 1, txn: 'favor_purchase_1', offer: 'legendary' };
  return { f, body, player: { id: f.player, handle: 'Bard' } };
}
test('Favor legendary purchase debits and delivers once, including lost-acknowledgement retries', async () => {
  const { f, body, player } = favorFixture();
  const result = await tavernFavorBuy(f.ctx, player, body);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.item.rarity, 'legendary'); assert.equal(result.progress.favor, 0);
  const again = await tavernFavorBuy(f.ctx, player, body);
  assert.equal(again.replayed, true); assert.deepEqual(again.item, result.item);
  const row = f.sql.prepare('SELECT obj, seq FROM realm_characters').get();
  const save = JSON.parse(f.blobs.get(row.obj));
  assert.equal(save.items.length, 1); assert.equal(save.modData.BunnyGuilds._marks.tavern.favor, 0);
  f.sql.prepare('UPDATE realm_characters SET seq = seq + 1').run();
  const later = await tavernFavorBuy(f.ctx, player, { ...body, seq: row.seq + 1 });
  assert.equal(later.realm.seq, row.seq + 1);
});
test('Favor title prices are 100 and 500, account ownership blocks duplicate purchases', async () => {
  for (const [offer, price] of [['barmaster', 100], ['legendarybartender', 500]]) {
    const { f, body, player } = favorFixture(price + 10); body.offer = offer;
    const result = await tavernFavorBuy(f.ctx, player, body);
    assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.progress.favor, 10);
    assert.equal(f.sql.prepare('SELECT insignia FROM players').get().insignia, 'title:' + offer);
    const duplicate = await tavernFavorBuy(f.ctx, player, { ...body, seq: result.realm.seq, txn: 'second_purchase' });
    assert.equal(duplicate.error, 'owned');
  }
});
test('Favor shop refuses insufficient funds, nonmembers, guests and another character lease', async () => {
  const { f, body, player } = favorFixture(24);
  assert.equal((await tavernFavorBuy(f.ctx, player, body)).error, 'favor-short');
  assert.equal((await tavernFavorBuy(f.ctx, { ...player, handle: null }, body)).error, 'tavern-bad');
  assert.equal((await tavernFavorBuy(f.ctx, player, { ...body, lease: 'c'.repeat(32) })).error, 'lease');
  const save = JSON.parse(f.blobs.get('save')); delete save.modData.BunnyGuilds.bards;
  f.blobs.set('save', JSON.stringify(save));
  assert.equal((await tavernFavorBuy(f.ctx, player, body)).error, 'tavern-membership');
});

test('room choices persist and replay without granting extra money or repeating their effects', async () => {
  const f = fixture(); await f.prepare();
  const choice = tavernRoomEvent(f.state).choices[0].id;
  const { r, body } = await f.call('room', { target: 'guest', choice });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.gold, 0); assert.equal(r.roomResult.choice, choice);
  const replay = await tavernServiceAct(f.ctx, f.player, body);
  assert.equal(replay.replayed, true); assert.deepEqual(replay.state.room, r.state.room);
  assert.equal((await f.call('room', { target: 'guest', choice })).r.error, 'tavern-action');
  const saved = JSON.parse(f.sql.prepare('SELECT state FROM tavern_service').get().state);
  assert.deepEqual(saved.room, r.state.room); assert.equal(saved.orders[saved.index].roomChoice, choice);
  const result = await f.call('return'); assert.equal(result.r.ok, true);
});
