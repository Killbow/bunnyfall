// Co-owners, transfer by character name, and the hand-over on delete, tested against the real migrations in SQLite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { homeOwners } from '../server-account/src/homeOwners.js';
import { homeTransfer } from '../server-account/src/homeTransfer.js';
import { deleteRealm } from '../server-account/src/realm.js';
import { homesInTown } from '../server-account/src/homes.js';

const DIR = new URL('../server-account/migrations/', import.meta.url);

function fixture(dir = DIR) {
  const sql = new DatabaseSync(':memory:');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    try { sql.exec(readFileSync(new URL(f, dir), 'utf8')); } catch (e) { throw new Error(`${f}: ${e.message}`); }
  }
  const prepare = (text, args = []) => ({
    bind: (...a) => prepare(text, a),
    first: async () => sql.prepare(text).get(...args) ?? null,
    all: async () => ({ results: sql.prepare(text).all(...args) }),
    run: async () => ({ meta: { changes: Number(sql.prepare(text).run(...args).changes) } }),
  });
  const db = { prepare, async batch(steps) {
    sql.exec('BEGIN');
    try {
      const out = [];
      for (const s of steps) out.push(await s.all());
      sql.exec('COMMIT');
      return out;
    } catch (e) { sql.exec('ROLLBACK'); throw e; }
  } };
  const objects = new Map();
  const bucket = { async get(k) { return objects.has(k) ? { body: objects.get(k) } : null; }, async put(k, v) { objects.set(k, v); }, async delete(k) { objects.delete(k); } };
  const ctx = { db, bucket, nowS: 1_000_000 };
  let n = 0;
  const hex = () => String(++n).padStart(20, '0');
  const f = {
    sql, db, bucket, ctx,
    acct(id, handle) { sql.prepare('INSERT INTO players (id, handle, handle_lc, guest_name, created_at, last_seen) VALUES (?, ?, ?, ?, 0, 0)').run(id, handle, handle.toLowerCase(), 'g' + id); return { id, handle }; },
    char(player, name, extra = {}) {
      const id = `r${hex()}`;
      const key = `o-${id}`;
      objects.set(key, new TextEncoder().encode(JSON.stringify({ sceneCache: { scenes: [] } })));
      sql.prepare('INSERT INTO realm_characters (id, player, name, seq, bytes, obj, created_at, updated_at, dead_at, judged_seq, origin_id, summary) VALUES (?, ?, ?, 1, ?, ?, 0, 0, ?, 1, ?, ?)')
        .run(id, player, name, extra.customs ? 0 : 10, key, extra.dead ?? null, extra.customs ? `o${id}` : null, extra.summary ?? null);
      return id;
    },
    home(player, charId, key = 1, extra = {}) {
      sql.prepare('INSERT INTO homes (map_id, building_key, player, char_id, owner_name, region, price, bought_at, deed, paid) VALUES (?, ?, ?, ?, ?, 1, 100, 5, ?, 0)')
        .run(extra.map ?? 10, key, player, charId, player, extra.deed ?? 0);
    },
    owners(key = 1, map = 10) { return sql.prepare('SELECT char_id FROM home_owners WHERE map_id = ? AND building_key = ? ORDER BY added_at, char_id').all(map, key).map((r) => r.char_id); },
    mainOf(key = 1, map = 10) { return sql.prepare('SELECT char_id FROM homes WHERE map_id = ? AND building_key = ?').get(map, key)?.char_id ?? null; },
  };
  return f;
}

const at = (ctx, nowS) => ({ ...ctx, nowS });
const base = { mapId: 10, buildingKey: 1 };

test('co-owners: main adds living characters of the same account, capped at 8', async () => {
  const f = fixture();
  const a = f.acct('a', 'Alpha'); const b = f.acct('b', 'Beta');
  const main = f.char('a', 'Main');
  const others = Array.from({ length: 9 }, (_, i) => f.char('a', `Alt ${i}`));
  const dead = f.char('a', 'Gone', { dead: 5 });
  const foreign = f.char('b', 'Stranger');
  f.home('a', main);
  const add = (character, char, ctx = f.ctx) => homeOwners(ctx, a, { op: 'add', ...base, character, char });
  assert.equal((await add(others[0], others[1])).error, 'home-not-main');
  assert.equal((await add(main, main)).error, 'home-owner-main');
  assert.equal((await add(main, dead)).error, 'home-owner-char');
  assert.equal((await add(main, foreign)).error, 'home-owner-char');
  const first = await add(main, others[0]);
  assert.equal(first.ok, true);
  assert.deepEqual(first.main, { char: main, name: 'Main' });
  assert.equal(first.owners[0].name, 'Alt 0');
  assert.equal((await add(main, others[0])).error, 'home-owner-listed');
  for (let i = 1; i < 8; i++) assert.equal((await add(main, others[i], at(f.ctx, 1_000_000 + i))).ok, true);
  assert.equal((await add(main, others[8])).error, 'home-owners-full');
  const list = await homeOwners(f.ctx, a, { op: 'list', ...base });
  assert.equal(list.owners.length, 8);
  assert.equal((await homeOwners(f.ctx, b, { op: 'list', ...base })).error, 'no-home');
});

test('co-owners: not on a deed home or a hall; remove by the main or by oneself', async () => {
  const f = fixture();
  const a = f.acct('a', 'Alpha');
  const main = f.char('a', 'Main'); const x = f.char('a', 'X'); const y = f.char('a', 'Y');
  f.home('a', main, 1, { deed: 1 });
  f.home('a', main, 2);
  assert.equal((await homeOwners(f.ctx, a, { op: 'add', mapId: 10, buildingKey: 1, character: main, char: x })).error, 'home-deed');
  const two = { mapId: 10, buildingKey: 2 };
  await homeOwners(f.ctx, a, { op: 'add', ...two, character: main, char: x });
  await homeOwners(f.ctx, a, { op: 'add', ...two, character: main, char: y });
  assert.equal((await homeOwners(f.ctx, a, { op: 'remove', ...two, character: x, char: y })).error, 'home-not-main');
  assert.equal((await homeOwners(f.ctx, a, { op: 'remove', ...two, character: x, char: x })).ok, true);
  assert.equal((await homeOwners(f.ctx, a, { op: 'remove', ...two, character: main, char: y })).ok, true);
  assert.equal((await homeOwners(f.ctx, a, { op: 'remove', ...two, character: main, char: y })).error, 'home-owner-none');
  assert.equal((await homeOwners(f.ctx, a, { op: 'remove', ...two, character: main, char: main })).error, 'home-owner-main');
  f.sql.exec(`INSERT INTO guilds (id, name, name_key, tag, ranks, founded_at) VALUES ('g', 'G', 'g', 'GG', '[]', 0)`);
  f.sql.exec(`UPDATE homes SET guild_id = 'g' WHERE building_key = 2`);
  assert.equal((await homeOwners(f.ctx, a, { op: 'add', ...two, character: main, char: x })).error, 'no-home');
});

test('transfer by name: none, one, several, toChar', async () => {
  const f = fixture();
  const a = f.acct('a', 'Alpha'); f.acct('b', 'Beta'); f.acct('c', 'Gamma');
  const main = f.char('a', 'Main');
  const t1 = f.char('b', 'Sir Bob'); const t2 = f.char('c', 'sir bob'); f.char('c', 'Dead Bob', { dead: 3 });
  f.home('a', main);
  const offer = (to, extra = {}) => homeTransfer(f.ctx, a, { op: 'offer', ...base, character: main, toName: to, price: 0, keepDecor: true, keepItems: true, ...extra });
  const old = await homeTransfer(f.ctx, a, { op: 'offer', ...base, character: main, to: 'Beta', price: 0, keepDecor: true, keepItems: true });
  assert.equal(old.error, 'home-update');   // an older build names an account; it is never read as a character's name
  assert.equal((await offer('Nobody')).error, 'home-no-char');
  assert.equal((await offer('Dead Bob')).error, 'home-no-char');
  f.sql.prepare("INSERT INTO players (id, handle, handle_lc, guest_name, created_at, last_seen) VALUES ('g', NULL, NULL, 'Guest One', 0, 0)").run();
  f.char('g', 'Guest Bob');
  // A guest account cannot accept an offer, so its characters never match.
  assert.equal((await offer('Guest Bob')).error, 'home-no-char');
  const pick = await offer('SIR BOB');
  assert.equal(pick.error, 'home-pick');
  assert.deepEqual(pick.matches.map((m) => [m.char, m.account]).sort(), [[t1, 'Beta'], [t2, 'Gamma']].sort());
  assert.equal((await offer('Sir Bob', { toChar: main })).error, 'home-no-char');
  const done = await offer('Sir Bob', { toChar: t2 });
  assert.equal(done.ok, true);
  const row = f.sql.prepare('SELECT buyer, buyer_char FROM home_offers WHERE id = ?').get(done.id);
  assert.deepEqual({ ...row }, { buyer: 'c', buyer_char: t2 });
  const one = f.char('b', 'Unique Name');
  f.sql.exec(`UPDATE home_offers SET state = 'cancelled'`);
  assert.equal((await offer('Unique Name')).ok, true);
  assert.equal(f.sql.prepare('SELECT buyer_char FROM home_offers WHERE state = ?').get('open').buyer_char, one);
});

test('transfer to a character of the same account moves the main at once', async () => {
  const f = fixture();
  const a = f.acct('a', 'Alpha');
  const main = f.char('a', 'Main'); const alt = f.char('a', 'Second');
  f.home('a', main, 1); f.home('a', alt, 2); f.home('a', alt, 3); f.home('a', alt, 4);
  await homeOwners(f.ctx, a, { op: 'add', ...base, character: main, char: alt }).catch(() => {});
  const move = (to) => homeTransfer(f.ctx, a, { op: 'offer', ...base, character: main, toName: to });
  assert.equal((await move('Second')).error, 'home-cap');
  assert.equal(f.mainOf(1), main);
  f.sql.exec('DELETE FROM homes WHERE building_key = 4');
  const r = await move('Second');
  assert.equal(r.ok, true); assert.equal(r.moved, true);
  assert.equal(f.mainOf(1), alt);
  assert.deepEqual(f.owners(1), [main]);   // the old main stays on as a co-owner
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM home_offers').get().n, 0);
});

test('cross-account offer: only the named character accepts, co-owners are cleared; old offers accept as before', async () => {
  const f = fixture();
  const a = f.acct('a', 'Alpha'); const b = f.acct('b', 'Beta');
  const main = f.char('a', 'Main'); const alt = f.char('a', 'Alt');
  const named = f.char('b', 'Buyer'); const other = f.char('b', 'Other');
  f.home('a', main, 1); f.home('a', main, 2);
  await homeOwners(f.ctx, a, { op: 'add', ...base, character: main, char: alt });
  const made = await homeTransfer(f.ctx, a, { op: 'offer', ...base, character: main, toName: 'Buyer', price: 0, keepDecor: true, keepItems: true });
  assert.equal(made.ok, true);
  assert.equal((await homeTransfer(f.ctx, b, { op: 'accept', id: made.id, character: other })).error, 'offer-wrong-char');
  assert.equal(f.mainOf(1), main);
  const got = await homeTransfer(f.ctx, b, { op: 'accept', id: made.id, character: named });
  assert.equal(got.ok, true, JSON.stringify(got));
  assert.equal(f.mainOf(1), named);
  assert.deepEqual(f.owners(1), []);
  // An offer made before the new column names no character.
  const id = '0'.repeat(32);
  f.sql.prepare(`INSERT INTO home_offers (id, map_id, building_key, seller, seller_char, buyer, price, keep_decor, keep_items, rev, state, at, until)
    VALUES (?, 10, 2, 'a', ?, 'b', 0, 1, 1, 0, 'open', 1, 9999999)`).run(id, main);
  assert.equal((await homeTransfer(f.ctx, b, { op: 'accept', id, character: other })).ok, true);
  assert.equal(f.mainOf(2), other);
});

test('delete: the earliest living co-owner takes the house; houses without one go', async () => {
  const f = fixture();
  const a = f.acct('a', 'Alpha');
  const main = f.char('a', 'Main'); const c1 = f.char('a', 'C1'); const c2 = f.char('a', 'C2'); const c3 = f.char('a', 'C3');
  f.home('a', main, 1); f.home('a', main, 2); f.home('a', main, 3);
  f.sql.prepare('INSERT INTO home_owners VALUES (10, 1, ?, ?, ?)').run(c3, 'a', 5);
  f.sql.prepare('INSERT INTO home_owners VALUES (10, 1, ?, ?, ?)').run(c2, 'a', 7);
  f.sql.prepare('INSERT INTO home_owners VALUES (10, 1, ?, ?, ?)').run(c1, 'a', 7);
  f.sql.prepare('INSERT INTO home_owners VALUES (10, 3, ?, ?, ?)').run(c1, 'a', 9);
  f.sql.exec(`UPDATE realm_characters SET dead_at = 3 WHERE id = '${c3}'`);   // a dead co-owner is skipped
  f.sql.prepare('INSERT INTO home_owners VALUES (10, 3, ?, ?, ?)').run(main, 'a', 1);
  const r = await deleteRealm(f.ctx, 'a', main);
  assert.equal(r.ok, true);
  assert.equal(f.mainOf(1), c1);   // tie at 7 goes to the lower id
  assert.deepEqual(f.owners(1), [c3, c2]);   // the dead co-owner's row stays listed, never promoted
  assert.equal(f.mainOf(3), c1);
  assert.deepEqual(f.owners(3), []);
  assert.equal(f.mainOf(2), null);
  assert.deepEqual(r.passed.map((p) => [p.buildingKey, p.char]), [[1, c1], [3, c1]]);
});

test('delete: a co-owner leaving only drops its rows; refusals ask after houses that die', async () => {
  const f = fixture();
  f.acct('a', 'Alpha'); f.acct('b', 'Beta');
  const main = f.char('a', 'Main'); const co = f.char('a', 'Co');
  f.home('a', main, 1);
  f.sql.prepare('INSERT INTO home_owners VALUES (10, 1, ?, ?, 5)').run(co, 'a');
  f.sql.exec(`INSERT INTO home_rooms (map_id, building_key, room, anchor, listed, price, tenant, tenant_char, until) VALUES (10, 1, 0, 'a', 0, 5, 'b', 'rx', 2000000)`);
  const r1 = await deleteRealm(f.ctx, 'a', main);
  assert.equal(r1.ok, true, JSON.stringify(r1));   // the tenancy runs on in a house that stays
  assert.equal(f.mainOf(1), co);
  const r2 = await deleteRealm(f.ctx, 'a', co);
  assert.equal(r2.error, 'home-tenants');   // now nobody takes it, so the tenancy holds the delete
  f.sql.exec('DELETE FROM home_rooms');
  const c2 = f.char('a', 'Another');
  f.sql.prepare('INSERT INTO home_owners VALUES (10, 1, ?, ?, 5)').run(c2, 'a');
  assert.equal((await deleteRealm(f.ctx, 'a', c2)).ok, true);
  assert.deepEqual(f.owners(1), []);
  assert.equal(f.mainOf(1), co);
});

test('town read tells the calling character whether it is the main or a co-owner', async () => {
  const f = fixture();
  const a = f.acct('a', 'Alpha');
  const main = f.char('a', 'Main'); const co = f.char('a', 'Co'); const free = f.char('a', 'Free');
  f.home('a', main, 1);
  f.sql.prepare('INSERT INTO home_owners VALUES (10, 1, ?, ?, 5)').run(co, 'a');
  const town = async (character) => (await homesInTown(f.ctx, a, { mapId: 10, character })).homes[0];
  assert.deepEqual([(await town(main)).main, (await town(main)).coOwner, (await town(main)).mainName], [true, false, 'Main']);
  assert.deepEqual([(await town(co)).main, (await town(co)).coOwner], [false, true]);
  assert.deepEqual([(await town(free)).main, (await town(free)).coOwner], [false, false]);
});

const seat = (f, key, co, at, map = 10) => f.sql.prepare('INSERT INTO home_owners VALUES (?, ?, ?, ?, ?)').run(map, key, co, 'a', at);

test('move: the old main is added last and the list stays within 8; a full list refuses', async () => {
  const f = fixture();
  const a = f.acct('a', 'Alpha');
  const main = f.char('a', 'Main'); const alt = f.char('a', 'Second'); const rest = Array.from({ length: 8 }, (_, i) => f.char('a', `Rest ${i}`));
  f.home('a', main, 1);
  seat(f, 1, alt, 5); seat(f, 1, rest[0], 6);
  const r = await homeTransfer(f.ctx, a, { op: 'offer', ...base, character: main, toName: 'Second' });
  assert.equal(r.moved, true);
  assert.deepEqual(f.owners(1), [rest[0], main]);
  assert.equal(f.sql.prepare('SELECT added_at FROM home_owners WHERE char_id = ?').get(main).added_at, 1_000_000);
  const g = fixture();
  g.acct('a', 'Alpha');
  const m2 = g.char('a', 'Main'); g.char('a', 'Second'); const full = Array.from({ length: 8 }, (_, i) => g.char('a', `Full ${i}`));
  g.home('a', m2, 1);
  full.forEach((c, i) => seat(g, 1, c, i + 1));
  const e = await homeTransfer(g.ctx, { id: 'a', handle: 'Alpha' }, { op: 'offer', ...base, character: m2, toName: 'Second' });
  assert.equal(e.error, 'home-owners-full');
  assert.equal(g.mainOf(1), m2);
});

test('move: a target that dies between the read and the write is refused', async () => {
  const f = fixture();
  const a = f.acct('a', 'Alpha');
  const main = f.char('a', 'Main'); const alt = f.char('a', 'Second');
  f.home('a', main, 1);
  const orig = f.db.batch;
  f.db.batch = async (steps) => { f.sql.exec(`UPDATE realm_characters SET dead_at = 9 WHERE id = '${alt}'`); return orig(steps); };
  const r = await homeTransfer(f.ctx, a, { op: 'offer', ...base, character: main, toName: 'Second' });
  assert.equal(r.error, 'home-no-char');
  assert.equal(f.mainOf(1), main);
});

test('customs characters whose first save has not landed are neither co-owners nor transfer targets', async () => {
  const f = fixture();
  const a = f.acct('a', 'Alpha'); f.acct('b', 'Beta');
  const main = f.char('a', 'Main'); const cust = f.char('a', 'Pending', { customs: true }); f.char('b', 'Pending2', { customs: true });
  f.home('a', main, 1);
  assert.equal((await homeOwners(f.ctx, a, { op: 'add', ...base, character: main, char: cust })).error, 'home-owner-char');
  const offer = (toName, extra = {}) => homeTransfer(f.ctx, a, { op: 'offer', ...base, character: main, toName, price: 0, keepDecor: true, keepItems: true, ...extra });
  assert.equal((await offer('Pending')).error, 'home-no-char');
  assert.equal((await offer('Pending2', { toChar: undefined })).error, 'home-no-char');
  assert.equal((await homeTransfer(f.ctx, a, { op: 'resolve', ...base, character: main, toName: 'Pending' })).error, 'home-no-char');
});

test('resolve: matches with an own flag and a note; guests, customs, the seller and nobody', async () => {
  const f = fixture();
  const a = f.acct('a', 'Alpha'); f.acct('b', 'Beta');
  const main = f.char('a', 'Bob', { summary: JSON.stringify({ level: 4, className: 'Mage' }) });
  const own1 = f.char('a', 'bob', { summary: JSON.stringify({ level: 7, className: 'Knight' }) });
  const own2 = f.char('a', 'BOB');
  const other = f.char('b', 'Bob', { summary: JSON.stringify({ level: 9, className: 'Thief' }) });
  f.sql.prepare("INSERT INTO players (id, handle, handle_lc, guest_name, created_at, last_seen) VALUES ('g', NULL, NULL, 'Guest', 0, 0)").run();
  f.char('g', 'Bob'); f.char('b', 'Bob', { customs: true });
  f.home('a', main, 1);
  const r = await homeTransfer(f.ctx, a, { op: 'resolve', ...base, character: main, toName: ' bob ' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.matches, [
    { char: own1, name: 'bob', account: 'Alpha', own: true, note: 'level 7 Knight' },
    { char: own2, name: 'BOB', account: 'Alpha', own: true, note: '' },
    { char: other, name: 'Bob', account: 'Beta', own: false, note: '' },
  ]);
  assert.equal((await homeTransfer(f.ctx, a, { op: 'resolve', ...base, character: main, toName: 'Nobody' })).error, 'home-no-char');
  assert.equal((await homeTransfer(f.ctx, a, { op: 'resolve', ...base, character: main })).error, 'home-update');
  assert.equal((await homeTransfer(f.ctx, a, { op: 'resolve', ...base, character: own1, toName: 'Bob' })).error, 'no-home');
  f.sql.exec('UPDATE homes SET deed = 1');
  assert.equal((await homeTransfer(f.ctx, a, { op: 'resolve', ...base, character: main, toName: 'Bob' })).error, 'home-deed');
});

test('resolve: at most 9 matches, and says there are more', async () => {
  const f = fixture();
  const a = f.acct('a', 'Alpha'); f.acct('b', 'Beta');
  const main = f.char('a', 'Main');
  for (let i = 0; i < 11; i++) f.char('b', 'Twin');
  f.home('a', main, 1);
  const r = await homeTransfer(f.ctx, a, { op: 'resolve', ...base, character: main, toName: 'Twin' });
  assert.equal(r.matches.length, 9);
  assert.equal(r.more, true);
});

test('delete: a co-owner at the cap is skipped for the next one', async () => {
  const f = fixture();
  f.acct('a', 'Alpha');
  const main = f.char('a', 'Main'); const full = f.char('a', 'Full'); const next = f.char('a', 'Next');
  f.home('a', main, 1);
  [11, 12, 13].forEach((k) => f.home('a', full, k));
  seat(f, 1, full, 1); seat(f, 1, next, 2);
  const r = await deleteRealm(f.ctx, 'a', main);
  assert.equal(r.ok, true);
  assert.equal(f.mainOf(1), next);
  assert.deepEqual(f.owners(1), [full]);
});

test('delete: every co-owner at the cap refuses the delete and changes nothing', async () => {
  const f = fixture();
  f.acct('a', 'Alpha');
  const main = f.char('a', 'Main'); const full = f.char('a', 'Full');
  f.home('a', main, 1); f.home('a', main, 2);
  [11, 12, 13].forEach((k) => f.home('a', full, k));
  seat(f, 1, full, 1);
  const r = await deleteRealm(f.ctx, 'a', main);
  assert.equal(r.error, 'home-heir-full');
  assert.equal(f.mainOf(1), main); assert.equal(f.mainOf(2), main);
  assert.ok(f.sql.prepare('SELECT 1 AS y FROM realm_characters WHERE id = ?').get(main));
  assert.deepEqual(f.owners(1), [full]);
});

test('delete: two houses for one heir with a single slot left refuse the delete', async () => {
  const f = fixture();
  f.acct('a', 'Alpha');
  const main = f.char('a', 'Main'); const heir = f.char('a', 'Heir');
  f.home('a', main, 1); f.home('a', main, 2); f.home('a', heir, 11); f.home('a', heir, 12);
  seat(f, 1, heir, 1); seat(f, 2, heir, 1);
  const r = await deleteRealm(f.ctx, 'a', main);
  assert.equal(r.error, 'home-heir-full');
  assert.equal(f.mainOf(1), main);
  assert.equal(f.mainOf(2), main);
  f.sql.exec('DELETE FROM homes WHERE building_key = 12');   // two slots now, one for each house
  const ok = await deleteRealm(f.ctx, 'a', main);
  assert.equal(ok.ok, true);
  assert.deepEqual([f.mainOf(1), f.mainOf(2)], [heir, heir]);
});

test('delete: a co-owner leaving between the plan and the batch cannot wipe a running tenancy', async () => {
  const f = fixture();
  f.acct('a', 'Alpha'); f.acct('b', 'Beta');
  const main = f.char('a', 'Main'); const co = f.char('a', 'Co');
  f.home('a', main, 1);
  seat(f, 1, co, 1);
  f.sql.exec(`INSERT INTO home_rooms (map_id, building_key, room, anchor, listed, price, tenant, tenant_char, until) VALUES (10, 1, 0, 'a', 0, 5, 'b', 'rx', 2000000)`);
  const orig = f.db.batch;
  let hooked = false;
  f.db.batch = async (steps) => {
    if (!hooked && steps.length > 20) { hooked = true; f.sql.exec('DELETE FROM home_owners'); }
    return orig(steps);
  };
  const r = await deleteRealm(f.ctx, 'a', main);
  assert.equal(hooked, true);
  assert.equal(r.error, 'home-tenants');
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM home_rooms').get().n, 1);
  assert.equal(f.mainOf(1), main);
  assert.ok(f.sql.prepare('SELECT 1 AS y FROM realm_characters WHERE id = ?').get(main));
});

test('delete: a house that changes under the plan refuses instead of looping', async () => {
  const f = fixture();
  f.acct('a', 'Alpha');
  const main = f.char('a', 'Main'); const co = f.char('a', 'Co');
  f.home('a', main, 1);
  seat(f, 1, co, 1);
  const orig = f.db.batch;
  let n = 0;
  f.db.batch = async (steps) => {
    if (steps.length > 20 && n++ < 2) { f.sql.exec(`UPDATE realm_characters SET dead_at = ${n} WHERE id = '${co}'`); f.sql.exec(`UPDATE realm_characters SET dead_at = NULL WHERE id = '${co}'`); f.sql.exec(`INSERT INTO home_rooms (map_id, building_key, room, anchor, listed, price) VALUES (10, 1, ${n}, 'a', 0, 5)`); f.sql.exec('DELETE FROM home_owners'); seat(f, 1, co, n + 1); f.sql.exec(`UPDATE homes SET price = price + 1`); f.sql.exec(`INSERT INTO homes (map_id, building_key, player, char_id, owner_name, region, price, bought_at, deed, paid) VALUES (11, ${n}, 'a', '${main}', 'a', 1, 1, 1, 0, 0)`); }
    return orig(steps);
  };
  const r = await deleteRealm(f.ctx, 'a', main);
  assert.equal(r.error, 'home-plan-changed');
  assert.ok(f.sql.prepare('SELECT 1 AS y FROM realm_characters WHERE id = ?').get(main));
});

test('delete: open offers by or to the character are cancelled; and a door shows an offer only to its named character', async () => {
  const f = fixture();
  const a = f.acct('a', 'Alpha'); const b = f.acct('b', 'Beta');
  const main = f.char('a', 'Main'); const co = f.char('a', 'Co'); const named = f.char('b', 'Buyer'); const other = f.char('b', 'Other');
  f.home('a', main, 1);
  seat(f, 1, co, 1);
  const made = await homeTransfer(f.ctx, a, { op: 'offer', ...base, character: main, toName: 'Buyer', price: 0, keepDecor: true, keepItems: true });
  const seen = async (character) => (await homesInTown(f.ctx, b, { mapId: 10, character })).homes[0].offer;
  assert.equal((await seen(named))?.id, made.id);
  assert.equal(await seen(other), undefined);
  assert.equal((await deleteRealm(f.ctx, 'a', main)).ok, true);
  assert.equal(f.sql.prepare('SELECT state FROM home_offers WHERE id = ?').get(made.id).state, 'cancelled');
});

// Runs `change` once, just before the delete's own batch, after the plan was made.
function beforeDeleteBatch(f, change) {
  const orig = f.db.batch;
  let fired = false;
  f.db.batch = async (steps) => {
    if (!fired && steps.length > 20) { fired = true; change(); }
    return orig(steps);
  };
  return () => fired;
}

test('delete: a house planned to go that gains a living co-owner before the batch passes to it instead', async () => {
  const f = fixture();
  f.acct('a', 'Alpha');
  const main = f.char('a', 'Main'); const late = f.char('a', 'Late');
  f.home('a', main, 1);
  const fired = beforeDeleteBatch(f, () => seat(f, 1, late, 5));
  const r = await deleteRealm(f.ctx, 'a', main);
  assert.equal(fired(), true);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(f.mainOf(1), late);   // the guard failed the first batch; the second plan passes the house on
  assert.deepEqual(r.passed.map((p) => [p.buildingKey, p.char]), [[1, late]]);
  assert.equal(r.moved, undefined);
});

for (const [name, expected, change] of [
  ['rent falls due', 'home-rent-due', (f) => f.sql.exec('UPDATE homes SET rent_due = 40 WHERE building_key = 1')],
  ['a tenant rents a room', 'home-tenants', (f) => f.sql.exec(`INSERT INTO home_rooms (map_id, building_key, room, anchor, listed, price, tenant, tenant_char, until)
    VALUES (10, 1, 0, 'a', 0, 5, 'b', 'rx', 2000000)`)],
  ['a listing opens at a trader', 'home-vendor-stocked', (f) => {
    f.sql.exec(`INSERT INTO home_decor (map_id, building_key, id, place, placed_at) VALUES (10, 1, 'v1', '{}', 0)`);
    f.sql.exec(`INSERT INTO market_listings (id, seller, char_id, region, kind, material, units, price, fee, at, expires_at, rid, n, vendor_map, vendor_id)
      VALUES ('l1', 'b', 'rx', 1, 'material', 'iron', 1, 5, 1, 0, 9000000, 'rid', 'n', 10, 'v1')`);
  }],
]) {
  test(`delete: a house planned to go refuses when ${name} before the batch`, async () => {
    const f = fixture();
    f.acct('a', 'Alpha'); f.acct('b', 'Beta');
    const main = f.char('a', 'Main');
    f.home('a', main, 1);
    const fired = beforeDeleteBatch(f, () => change(f));
    const r = await deleteRealm(f.ctx, 'a', main);
    assert.equal(fired(), true);
    assert.equal(r.error, expected);
    assert.equal(f.mainOf(1), main);
    assert.ok(f.sql.prepare('SELECT 1 AS y FROM realm_characters WHERE id = ?').get(main));
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM home_rooms').get().n, expected === 'home-tenants' ? 1 : 0);
  });
}

test('delete: a plan that changes again on the retry refuses with home-plan-changed and deletes nothing', async () => {
  const f = fixture();
  f.acct('a', 'Alpha');
  const main = f.char('a', 'Main'); const late = f.char('a', 'Late');
  f.home('a', main, 1);
  const orig = f.db.batch;
  let n = 0;
  f.db.batch = async (steps) => {
    if (steps.length > 20 && n < 2) {
      n++;
      if (n === 1) seat(f, 1, late, 5);
      else f.sql.exec('DELETE FROM home_owners');
    }
    return orig(steps);
  };
  const r = await deleteRealm(f.ctx, 'a', main);
  assert.equal(n, 2);
  assert.equal(r.error, 'home-plan-changed');
  assert.equal(f.mainOf(1), main);
  assert.ok(f.sql.prepare('SELECT 1 AS y FROM realm_characters WHERE id = ?').get(main));
});

test('delete: a batch fault with an unchanged plan is thrown, not answered as a house change', async () => {
  const f = fixture();
  f.acct('a', 'Alpha');
  const main = f.char('a', 'Main');
  f.home('a', main, 1);
  const orig = f.db.batch;
  f.db.batch = async (steps) => { if (steps.length > 20) throw new Error('storage fault'); return orig(steps); };
  await assert.rejects(deleteRealm(f.ctx, 'a', main), /storage fault/);
  assert.equal(f.mainOf(1), main);
});

test('delete: a house swapped for another between plan and batch is answered by the house that went', async () => {
  const f = fixture();
  f.acct('a', 'Alpha');
  const main = f.char('a', 'Main');
  f.home('a', main, 1);
  beforeDeleteBatch(f, () => { f.sql.exec('DELETE FROM homes WHERE building_key = 1'); f.home('a', main, 2); });
  const r = await deleteRealm(f.ctx, 'a', main);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.moved.flatMap((m) => m.off), [2]);
});
