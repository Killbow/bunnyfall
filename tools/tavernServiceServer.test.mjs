import { discordBotAction } from '../server-account/src/discordIntegration.js';
import { aurasHeld, auraWorn, auraRefusal } from '../server-account/src/titles.js';
import { EG_HONOUR } from '../server-account/src/egHonours.js';
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
  sql.exec(`CREATE TABLE realm_characters (id TEXT PRIMARY KEY, player TEXT, name TEXT DEFAULT 'Bard', dead_at INTEGER, seq INTEGER, lease TEXT, obj TEXT, prev TEXT, held TEXT,
    judged_seq INTEGER, clean_obj TEXT, clean_seq INTEGER, bytes INTEGER, updated_at INTEGER, witnessed INTEGER DEFAULT 0, svc_seq INTEGER);
    CREATE TABLE realm_tx_guard (moved INTEGER, expected INTEGER, CHECK(moved = expected));`);
  sql.exec(readFileSync(new URL('../server-account/migrations/0210_tavern_service.sql', import.meta.url), 'utf8'));
  for (const migration of ['0192_skins.sql', '0213_discord_integration.sql', '0214_discord_tavern_patrons.sql']) {
    sql.exec(readFileSync(new URL(`../server-account/migrations/${migration}`, import.meta.url), 'utf8'));
  }
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
  /** Start (or resume) the shift and pour the current order; the third dose puts the cup in hand. */
  async function pourOrder() {
    await call('start', { keeper: 'keeper', patrons: ['guest'] });
    const recipe = TAVERN_RECIPES.find((r) => r.id === tavernOrder(state).recipe);
    for (const ingredient of TAVERN_INGREDIENTS) for (let n = 0; n < recipe[ingredient]; n++) assert.equal((await call('pour', { ingredient })).r.ok, true);
    assert.equal(state.phase, 'carry');
    ctx.nowS += 21;
  }
  /** One whole drink: pour it, then a single serve pays for it. */
  async function prepare() { await pourOrder(); return call('serve', { target: 'guest' }); }
  return { ctx, sql, call, prepare, pourOrder, player, id, lease, blobs, get state() { return state; } };
}
test('serving pays into the realm record exactly once even when the acknowledgement is replayed', async () => {
  const f = fixture();
  const { r, body } = await f.prepare();
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.gold, 36); assert.equal(r.favor, 1); assert.equal(r.realm.seq, 2);
  const replay = await tavernServiceAct(f.ctx, f.player, body);
  assert.equal(replay.replayed, true); assert.equal(replay.version, r.version);
  const row = f.sql.prepare('SELECT seq, obj FROM realm_characters').get();
  const save = JSON.parse(f.blobs.get(row.obj));
  assert.equal(row.seq, 2); assert.equal(save.goldPieces, 36); assert.equal(save.modData.BunnyGuilds._marks.tavern.favor, 1);
  assert.equal((await f.call('serve', { target: 'guest' })).r.error, 'tavern-target');
});
test('the character lease, action revision and saved room are enforced', async () => {
  const f = fixture(); const { body } = await f.call('start', { keeper: 'keeper', patrons: ['guest'] });
  const req = { ...body, txn: 'another_request', op: 'pour', ingredient: 'wine' };
  assert.equal((await tavernServiceAct(f.ctx, f.player, { ...req, lease: 'c'.repeat(32) })).error, 'lease');
  assert.equal((await tavernServiceAct(f.ctx, f.player, req)).error, 'tavern-version');
  assert.equal((await f.call('pour', { ingredient: 'wine', buildingKey: 99 })).r.error, 'tavern-place');
  assert.equal((await tavernServiceAct(f.ctx, 'other-player', req)).error, 'no-realm-character');
});
test('concurrent serves with different request ids cannot double-pay', async () => {
  const f = fixture(); await f.pourOrder();
  // Both statements may read the old version; SQLite batch guards reject one after the other commits.
  const body = { id: f.id, lease: f.lease, seq: 1, version: 7, where: '17:42', buildingKey: 42, target: 'guest', op: 'serve' };
  // Read the real revision rather than assume how many preparation acts a recipe needed.
  body.version = f.sql.prepare('SELECT version FROM tavern_service').get().version;
  const results = await Promise.allSettled(['parallel_1', 'parallel_2'].map((txn) => tavernServiceAct(f.ctx, f.player, { ...body, txn })));
  assert.equal(results.filter((r) => r.status === 'fulfilled' && r.value.ok).length, 1, JSON.stringify(results));
  const row = f.sql.prepare('SELECT seq, obj FROM realm_characters').get();
  assert.equal(row.seq, 2); assert.equal(JSON.parse(f.blobs.get(row.obj)).goldPieces, 36);
});
test('a complete shift writes the Bards reputation into the same realm save as the final payment', async () => {
  const f = fixture(); let rep = 0;
  for (let n = 0; n < 6; n++) {
    const { r } = await f.prepare(); assert.equal(r.ok, true, JSON.stringify(r)); rep += r.rep;
    if (f.state.phase === 'done') break;
    f.ctx.nowS += 5;
    for (const c of f.state.chores.filter((c) => !c.done)) { const done = await f.call('chore', { target: c.id }); assert.equal(done.r.ok, true, JSON.stringify(done.r)); }
  }
  assert.equal(rep, 9, 'six clean drinks and a perfect shift'); assert.equal(f.state.phase, 'done');
  const row = f.sql.prepare('SELECT seq, obj FROM realm_characters').get();
  const save = JSON.parse(f.blobs.get(row.obj));
  assert.equal(row.seq, 12, 'six serves and five chores each write the save once'); assert.equal(save.goldPieces, f.state.earned, 'every wage, tip and chore landed once'); assert.equal(save.factionRep.rep[0], 9);
  assert.equal(save.modData.BunnyGuilds._marks.tavern.favor, 6);
  assert.equal(save.modData.BunnyGuilds._marks.tavern.cities['17'], 1);
  assert.equal(save.legalRep['17'], 1);
});
test('replaying a paid receipt after a later checkpoint never moves the realm sequence backwards', async () => {
  const f = fixture(); const { body } = await f.prepare();
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
    const account = { ...player, ...f.sql.prepare('SELECT insignia FROM players').get() };
    assert.equal(account.insignia, 'title:' + offer);
    assert.equal(aurasHeld(account, {}).includes('beaconlight'), offer === 'legendarybartender');
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
  assert.deepEqual(saved.room, r.state.room); assert.equal(saved.orders[saved.lastServed.index].roomChoice, choice);
  const next = await f.prepare(); assert.equal(next.r.ok, true, JSON.stringify(next.r));
});

test('the Heart’s Fire follows existing Legendary Bartender ownership and preserves legacy unlocks', () => {
  const bard = { handle: 'Bard', insignia: 'title:legendarybartender', aura: 'beaconlight' };
  assert.equal(aurasHeld(bard, {}).filter((a) => a === 'beaconlight').length, 1);
  assert.equal(auraRefusal('beaconlight', bard, {}), null);
  assert.equal(auraWorn(bard, {}), 'beaconlight');
  const legacy = { handle: 'Veteran', eg_honours: EG_HONOUR.kynbane, aura: 'beaconlight' };
  assert.equal(auraWorn(legacy, {}), 'beaconlight');
  assert.equal(aurasHeld({ ...bard, ...legacy }, {}).filter((a) => a === 'beaconlight').length, 1);
  assert.equal(aurasHeld({ ...bard, handle: null }, {}).includes('beaconlight'), false);
  assert.equal(aurasHeld({ handle: 'NewBard', insignia: 'title:barmaster' }, {}).includes('beaconlight'), false);
});

test('Favor supply bundles pay their listed price, deliver usable stacks and replay exactly once', async () => {
  for (const [offer, price, count] of [['shards', 10, 5], ['stamina', 5, 3], ['magicka', 5, 3]]) {
    const { f, body, player } = favorFixture(price); body.offer = offer;
    const r = await tavernFavorBuy(f.ctx, player, body);
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.progress.favor, 0); assert.equal(r.item.stackCount, count);
    assert.equal(r.title, null);
    if (offer === 'shards') assert.equal(r.item.templateIndex, 571); else assert.ok(r.item.potionRecipeKey);
    const retry = await tavernFavorBuy(f.ctx, player, body); assert.equal(retry.replayed, true);
    const row = f.sql.prepare('SELECT obj FROM realm_characters').get();
    const save = JSON.parse(f.blobs.get(row.obj)); assert.equal(save.items.length, 1); assert.equal(save.items[0].stackCount, count);
    assert.equal(f.sql.prepare('SELECT insignia FROM players').get().insignia, '');
  }
});

test('a served Discord patron posts once and each Discord account can tip once', async () => {
  const f = fixture();
  f.ctx.nowS = Math.floor(Date.now() / 1000);
  const channel = '111111111111111111';
  const first = '222222222222222222';
  const second = '333333333333333333';
  const message = '444444444444444444';
  const bot = (action, values) => discordBotAction({ ...f.ctx, primary: f.ctx.db }, {}, { action, ...values });
  await bot('setup', { channel });
  await bot('say', { channel, discordId: first, event: '555555555555555555', name: 'Discord Guest', text: 'Hello!' });
  await f.prepare();
  const { serves } = await bot('poll');
  assert.equal(serves.length, 1);
  assert.equal(serves[0].patron, 'Discord Guest');
  await bot('served-message', { id: serves[0].id, channel, message });
  assert.equal((await bot('tip', { channel, message, discordId: first })).tipped, true);
  assert.equal((await bot('tip', { channel, message, discordId: first })).tipped, false);
  assert.equal((await bot('tip', { channel, message, discordId: second })).tipped, true);
  const { r, body } = await f.call('discord-tips');
  assert.equal(r.discordGold, 10);
  assert.equal((await tavernServiceAct(f.ctx, f.player, body)).replayed, true);
  assert.equal((await f.call('discord-tips')).r.discordGold, 0);
  const row = f.sql.prepare('SELECT obj FROM realm_characters').get();
  assert.equal(JSON.parse(f.blobs.get(row.obj)).goldPieces, 36 + 10); // the served drink's pay, then the tips
});
