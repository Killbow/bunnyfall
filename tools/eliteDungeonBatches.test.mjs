// BUNNYFALL (2026-11-19, the owner: "pick 3 to 5 every 2 hours"): the elite dungeons rise in BATCHES. Real SQLite with the real
// migration (0216), the real service code (server-account/src/eliteDungeons.js) over it.
//   node --test tools/eliteDungeonBatches.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { eliteDungeonsRead, eliteDungeonSummon, eliteDungeonClear } from '../server-account/src/eliteDungeons.js';
import {
  ED_BATCH_MIN, ED_BATCH_MAX, ED_BATCH_S, ED_BATCHES_PER_DAY, ED_ACTIVE_MAX, ED_FIGHT_MIN_S, edBatchOf, edBatchSize, edBatchSlot0, edKeyOf,
} from '../src/net/eliteDungeonLaw.js';

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../server-account/migrations/0216_elite_dungeons.sql', import.meta.url), 'utf8').replace(/--[^\n\r]*/g, ''));
  sql.exec("CREATE TABLE players (id TEXT PRIMARY KEY, handle TEXT, guest_name TEXT, nyx_found INTEGER NOT NULL DEFAULT 0); INSERT INTO players (id, handle) VALUES ('p1', 'Tester')");
  const prepare = (text, args = []) => ({
    bind: (...a) => prepare(text, a),
    first: async () => sql.prepare(text).get(...args) ?? null,
    all: async () => ({ results: sql.prepare(text).all(...args) }),
    run: async () => ({ meta: { changes: Number(sql.prepare(text).run(...args).changes) } }),
  });
  return { sql, db: { prepare } };
}
const T0 = Math.floor(1_800_000_000 / 86400) * 86400;   // a UTC midnight
const read = (f, nowS) => eliteDungeonsRead({ db: f.db, nowS });

test('the batch of a moment: two-hour windows, twelve a day, sizes three to five that vary', () => {
  assert.equal(ED_BATCHES_PER_DAY, 12);
  const a = edBatchOf(T0 + 10), b = edBatchOf(T0 + ED_BATCH_S - 1), c = edBatchOf(T0 + ED_BATCH_S);
  assert.equal(a.batch, b.batch, 'one window, one batch'); assert.equal(c.batch, a.batch + 1); assert.equal(a.inDay, 0); assert.equal(c.inDay, 1);
  assert.equal(edBatchOf(T0 + 86400 - 1).inDay, 11); assert.equal(edBatchOf(T0 + 86400).inDay, 0, 'a new day starts a new count');
  const sizes = new Set();
  for (let batch = 1000; batch < 1400; batch++) { const n = edBatchSize(batch, 12345); assert.ok(n >= ED_BATCH_MIN && n <= ED_BATCH_MAX); sizes.add(n); }
  assert.deepEqual([...sizes].sort(), [3, 4, 5], 'every size from three to five comes up');
  assert.ok(edBatchSlot0(11) + ED_BATCH_MAX <= 60, 'slots stay under sixty, a key stays day:slot');
});

test('each window raises its own three to five, once, never on a dungeon already standing', async () => {
  const f = fixture();
  const first = await read(f, T0 + 100);
  assert.ok(first.list.length >= ED_BATCH_MIN && first.list.length <= ED_BATCH_MAX, `the first batch: ${first.list.length}`);
  assert.deepEqual((await read(f, T0 + 5000)).list.map((e) => e.key), first.list.map((e) => e.key), 'a second read in the window adds none');
  let total = first.list.length;
  for (let w = 1; w < 6; w++) {
    const got = await read(f, T0 + w * ED_BATCH_S + 7);
    const added = got.list.length - total;
    assert.ok(added >= ED_BATCH_MIN && added <= ED_BATCH_MAX, `window ${w} raised ${added}`);
    total = got.list.length;
  }
  const rows = f.sql.prepare('SELECT * FROM elite_dungeons').all();
  assert.equal(new Set(rows.map((r) => r.site)).size, rows.length, 'no site is picked twice');
  for (const r of rows) { const k = edKeyOf(r.key); assert.ok(k, r.key); assert.equal(Number(r.slot), k.slot); }
  const w3 = rows.filter((r) => Number(r.slot) >= edBatchSlot0(3) && Number(r.slot) < edBatchSlot0(3) + ED_BATCH_MAX);
  assert.ok(w3.length >= ED_BATCH_MIN && w3.length <= ED_BATCH_MAX, 'window 3 keeps its own slots');
  f.sql.close();
});

test('they stay until cleansed; at the cap nothing rises; a cleansing lets an empty batch rise in its window', async () => {
  const f = fixture();
  let w = 0, n = 0;
  for (; w < 40 && n < ED_ACTIVE_MAX; w++) { n = (await read(f, T0 + w * ED_BATCH_S + 3)).list.length; assert.ok(n <= ED_ACTIVE_MAX, `never past the cap: ${n}`); }
  assert.ok(n >= ED_ACTIVE_MAX - ED_BATCH_MAX + 1, `the map fills: ${n}`);
  // fill it to the cap exactly with one more window, then a window that finds it full raises nothing
  for (; w < 60; w++) { const got = await read(f, T0 + w * ED_BATCH_S + 3); n = got.list.length; if (n === ED_ACTIVE_MAX) break; }
  assert.equal(n, ED_ACTIVE_MAX); w++;
  const full = await read(f, T0 + w * ED_BATCH_S + 3);
  assert.equal(full.list.length, ED_ACTIVE_MAX, 'a full map raises nothing');
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM elite_dungeons').get().n, ED_ACTIVE_MAX);
  // cleanse the oldest (as a player who asked for the summon, after the fight's least time)
  const key = full.list[0].key, now = T0 + w * ED_BATCH_S + 10;
  assert.ok((await eliteDungeonSummon({ db: f.db, nowS: now }, { id: 'p1' }, { key })).summon);
  const cleared = await eliteDungeonClear({ db: f.db, nowS: now + ED_FIGHT_MIN_S + 1 }, { id: 'p1' }, { key });
  assert.ok(cleared.cleansed && cleared.nyx === 50);
  const after = await read(f, now + ED_FIGHT_MIN_S + 2);
  assert.ok(after.list.length > ED_ACTIVE_MAX - 1 && after.list.length <= ED_ACTIVE_MAX, `the freed place is filled in the same window: ${after.list.length}`);
  assert.ok(!after.list.some((e) => e.key === key), 'a cleansed one is gone');
  assert.equal((await read(f, now + ED_FIGHT_MIN_S + 3)).list.length, after.list.length, 'and no more than that in the window');
  // the rest of the old batches stand on, days later: only the cleansed one left
  const standing = new Set(after.list.map((e) => e.key));
  for (const e of full.list) if (e.key !== key) assert.ok(standing.has(e.key), `${e.key} still stands`);
  f.sql.close();
});
