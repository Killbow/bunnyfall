import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { timberGrade, sawGrades, TIMBER_PLANKS } from '../src/net/timberLaw.js';
import { smeltAtForge } from '../server-account/src/profCraft.js';

test('a felling’s grade is its chops: every one clean is prime, half or more sound, fewer knotty', () => {
  assert.equal(timberGrade(6, 6, true), 'prime');
  assert.equal(timberGrade(3, 6, false), 'sound');
  assert.equal(timberGrade(2, 6, false), 'knotty');
  assert.equal(timberGrade(0, 1, false), 'knotty');
  assert.equal(TIMBER_PLANKS.prime - TIMBER_PLANKS.knotty, 2);
});

test('a saw spends the others first, then its own logs prime first and knotty last', () => {
  assert.deepEqual(sawGrades({ count: 4, own: 5, other: 0, prime: 2, knotty: 1 }), { prime: 2, knotty: 0, extra: 2 });
  assert.deepEqual(sawGrades({ count: 5, own: 5, other: 0, prime: 2, knotty: 1 }), { prime: 2, knotty: 1, extra: 1 });
  assert.deepEqual(sawGrades({ count: 3, own: 5, other: 3, prime: 2, knotty: 1 }), { prime: 0, knotty: 0, extra: 0 });   // bought logs first
  assert.deepEqual(sawGrades({ count: 2, own: 1, other: 0, prime: 9, knotty: 9 }), { prime: 1, knotty: 0, extra: 1 });   // counts no higher than the logs
});

/** The whole account database over node's SQLite (every migration), as D1 hands it. */
function d1() {
  const sqlite = new DatabaseSync(':memory:');
  const dir = new URL('../server-account/migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL(f, dir), 'utf8'));
  const stmt = (sql, args = []) => {
    const st = sqlite.prepare(sql);
    // a batch's statement answers as D1's does: its rows (a SELECT's, a RETURNING's) and its changes
    const exec = () => { const results = st.all(...args); return { results, meta: { changes: sqlite.prepare('SELECT changes() AS c').get().c } }; };
    return { first: async () => st.get(...args) ?? null, all: async () => ({ results: st.all(...args) }), run: async () => ({ meta: st.run(...args) }), _run: exec };
  };
  const db = {
    prepare: (sql) => ({ bind: (...a) => stmt(sql, a), ...stmt(sql) }),
    batch: async (list) => { sqlite.exec('BEGIN'); try { const out = list.map((s) => s._run()); sqlite.exec('COMMIT'); return out; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } },
  };
  return { db, sqlite };
}

const ENV = { PROFESSIONS_OPEN: 'on' };
test('the workbench’s saw, on the real schema: prime logs saw to a plank more, the knotty to one less, their counts spent', async () => {
  const { db, sqlite } = d1();
  const P = { id: 'p1', handle: 'Feller' }, C = 'char-0001';
  sqlite.exec("INSERT INTO players (id, handle, guest_name, created_at, last_seen) VALUES ('p1', 'Feller', 'Feller', 1, 1)");
  sqlite.prepare("INSERT INTO prof_stores (player, char_id, material, origin, qty) VALUES ('p1', ?1, 'log:oak', 'own', 5)").run(C);
  sqlite.prepare("INSERT INTO prof_log_grades (player, char_id, material, prime, knotty) VALUES ('p1', ?1, 'log:oak', 2, 1)").run(C);
  let n = 0;
  const ctx = { db, nowS: 1_800_000_000, rand: () => ((n++ * 0.37) % 1) };
  const planks = () => sqlite.prepare("SELECT COALESCE(SUM(qty), 0) AS q FROM prof_stores WHERE material = 'plank:oak'").get().q;
  const a = await smeltAtForge(ctx, P, ENV, { character: C, recipe: 'saw:oak', count: 4, rid: 'rid-saw-00000001' });
  assert.equal(a.error, undefined, JSON.stringify(a));
  assert.equal(planks(), 2 * 4 + 2);   // two prime among the four
  assert.deepEqual({ ...sqlite.prepare('SELECT prime, knotty FROM prof_log_grades').get() }, { prime: 0, knotty: 1 });
  const b = await smeltAtForge(ctx, P, ENV, { character: C, recipe: 'saw:oak', count: 1, rid: 'rid-saw-00000002' });
  assert.equal(b.error, undefined, JSON.stringify(b));
  assert.equal(planks(), 10 + 1);   // the knotty last: one plank
  assert.deepEqual({ ...sqlite.prepare('SELECT prime, knotty FROM prof_log_grades').get() }, { prime: 0, knotty: 0 });
  const again = await smeltAtForge(ctx, P, ENV, { character: C, recipe: 'saw:oak', count: 1, rid: 'rid-saw-00000002' });
  assert.ok(again.repeat || again.error, 'the same request answers once');
  assert.equal(planks(), 11);
});

test('a felling on the real schema: its logs in the Stores, a prime felling’s counted beside them and said in the answer', async () => {
  const { harvestNode } = await import('../server-account/src/profHarvest.js');
  const { tree, nodeKey } = await import('../src/net/nodeLaw.js');
  const { CLIMATES } = await import('../src/formats/mapsTables.js');
  const { cutsMax } = await import('../src/net/professionLaw.js');
  const nowS = 1_800_000_000, day = Math.floor(nowS / 86400);
  let found = null;
  for (const climate of Object.values(CLIMATES)) for (let x = 100; x < 140 && !found; x++) for (let slot = 0; slot < 4 && !found; slot++) {
    const t = tree({ x, y: 200, day, slot, climate });
    if (t && t.tier === 1) found = { x, y: 200, slot, climate, t };
  }
  assert.ok(found, 'a tier-1 tree');
  const { db, sqlite } = d1();
  sqlite.exec("INSERT INTO players (id, handle, guest_name, created_at, last_seen) VALUES ('p1', 'Feller', 'Feller', 1, 1)");
  let n = 0;
  const ctx = { db, nowS, rand: () => ((n++ * 0.37) % 1) };
  const most = cutsMax(1, false);
  const fell = (slot, act, rid) => harvestNode(ctx, { id: 'p1', handle: 'Feller' }, ENV, {
    character: 'char-0001', node: nodeKey({ kind: 'tree', x: found.x, y: found.y, day, slot }), kind: 'logs', climate: found.climate, region: 0, act, at: nowS, rid,
  });
  const r = await fell(found.slot, { cuts: most, clean: true }, 'rid-fell-00000001');
  assert.equal(r.error, undefined, JSON.stringify(r));
  assert.equal(r.grade, 'prime');
  const logs = sqlite.prepare("SELECT qty FROM prof_stores WHERE material = ?1 AND origin = 'own'").get(found.t.material).qty;
  assert.ok(logs > 0);
  assert.deepEqual({ ...sqlite.prepare('SELECT prime, knotty FROM prof_log_grades WHERE material = ?1').get(found.t.material) }, { prime: logs, knotty: 0 });
});
