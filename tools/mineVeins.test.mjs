import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { cveinKey, mineVeins, mineVeinOf, MINE_RESET_MAX, MINE_VEINS_PER_DAY, MINE_VEINS_MAX } from '../src/net/mine/mineVeins.js';
import { mineLayout, mineOresAt, mineIsRich, MINE_RICH_ORES } from '../src/net/mine/mineLayout.js';
import { parseNodeKey, NODE_KINDS } from '../src/net/nodeLaw.js';
import { minedMaterial } from '../src/net/professionLaw.js';
import { harvestNode } from '../server-account/src/profHarvest.js';

const MINES = [0, 1, 7, 12, 4242, 99999, 123456, 999999];
const RESETS = [0, 1, 3, 77, MINE_RESET_MAX];

test('a cave vein key round-trips in its one spelling', () => {
  assert.equal(NODE_KINDS.cvein, 6);
  const key = cveinKey({ mine: 12, reset: 3, slot: 4 });
  assert.equal(key, 'cvein:12:3:4');
  assert.deepEqual(parseNodeKey(key), { kind: 'cvein', mine: 12, reset: 3, slot: 4 });
  for (const bad of ['cvein:012:3:4', 'cvein:12:03:4', 'cvein:12:3:04', 'cvein:1000000:3:4', 'cvein:12:100000:4', 'cvein:12:3:100', 'cvein:12:3', 'cvein:-1:3:4']) {
    assert.equal(parseNodeKey(bad), null, bad);
  }
  assert.deepEqual(parseNodeKey(cveinKey({ mine: 999999, reset: MINE_RESET_MAX, slot: 99 })), { kind: 'cvein', mine: 999999, reset: MINE_RESET_MAX, slot: 99 });
  assert.equal(mineVeinOf(12, 3, 999), null);
  assert.equal(mineVeinOf(12, 3, -1), null);
});

test('veins stand by the walls, off the holes, with tiers from their ore', () => {
  for (const mine of MINES) for (const reset of RESETS) {
    const layout = mineLayout(mine, reset);
    const veins = mineVeins(layout);
    assert.deepEqual(mineVeins(layout), veins, 'deterministic');
    assert.ok(veins.length > 0 && veins.length <= MINE_VEINS_MAX);
    veins.forEach((v, i) => assert.equal(v.slot, i, 'one running order'));
    const chambers = new Map(layout.sections.flatMap((s) => s.chambers.map((c) => [c.id, c])));
    const perChamber = new Map();
    for (const v of veins) {
      const c = chambers.get(v.chamber);
      assert.ok(c, 'a vein belongs to a chamber');
      perChamber.set(v.chamber, (perChamber.get(v.chamber) ?? 0) + 1);
      assert.ok(c.walls.some((w) => Math.hypot(w.at[0] - v.at[0], w.at[1] - v.at[1], w.at[2] - v.at[2]) <= 1.5), 'within 1.5 m of a wall slot');
      for (const h of c.holes) assert.ok(Math.hypot(h.at[0] - v.at[0], h.at[2] - v.at[2]) >= 2, 'at least 2 m from a hole');
      assert.equal(v.tier, minedMaterial(v.material).tier);
      assert.equal(v.n[1], 0);
    }
    for (const n of perChamber.values()) assert.ok(n >= 3 && n <= 5 || veins.length === MINE_VEINS_MAX);
    const lastSection = layout.sections.length - 1;
    layout.sections.forEach((s, i) => {
      const allowed = mineIsRich(mine, reset) && i === lastSection ? [...mineOresAt(i), ...MINE_RICH_ORES] : mineOresAt(i);
      for (const v of veins) if (s.chambers.some((c) => c.id === v.chamber)) assert.ok(allowed.includes(v.material), `${v.material} in section ${i}`);
    });
  }
});

test('veins are drawn per mine and reset', () => {
  const a = mineVeins(mineLayout(12, 3)), b = mineVeins(mineLayout(12, 4));
  assert.notDeepEqual(a, b);
});

function fixture() {
  const sql = new DatabaseSync(':memory:');
  const dir = new URL('../server-account/migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) sql.exec(readFileSync(new URL(f, dir), 'utf8'));
  const prepare = (text, args = []) => ({ bind: (...a) => prepare(text, a),
    first: async () => sql.prepare(text).get(...args.map((v) => v ?? null)) ?? null,
    all: async () => ({ results: sql.prepare(text).all(...args.map((v) => v ?? null)) }),
    run: async () => ({ meta: { changes: Number(sql.prepare(text).run(...args.map((v) => v ?? null)).changes) } }),
  });
  const db = { prepare, async batch(steps) { const r = []; for (const s of steps) { const x = await s.all(); r.push({ results: x.results }); } return r; } };
  return { sql, db };
}

test('the service checks a cave vein: no-node for a forged slot, day-full past the day\'s count', async () => {
  const { sql, db } = fixture();
  const nowS = 20_000 * 86_400 + 3_600;
  const day = 20_000;
  sql.exec("PRAGMA foreign_keys = OFF");
  const player = { id: 'p1', handle: 'Tester', registered_at: 0 };
  const env = { PROFESSIONS_OPEN: 'on' };
  const ctx = { db, nowS, rand: () => 0.5 };
  const ask = (node, rid) => harvestNode(ctx, player, env, { character: 'char1', node, kind: 'ore', act: { glints: 0 }, at: nowS, rid });
  assert.deepEqual(await ask(cveinKey({ mine: 12, reset: 3, slot: 99 }), 'rid-forged-slot-1'), { error: 'no-node' });
  assert.deepEqual(await ask('cvein:012:3:4', 'rid-bad-spelling-1'), { error: 'bad-node' });
  const vein = mineVeinOf(12, 3, 0);
  assert.ok(vein);
  const fill = sql.prepare("INSERT INTO node_harvests (day, node, kind, player, char_id, profession, material, qty, xp, at, rid, n) VALUES (?1, ?2, 'ore', 'p1', 'other', 'mining', 'metal:iron', 1, 0, 0, ?3, 'n')");
  for (let i = 0; i < MINE_VEINS_PER_DAY; i++) fill.run(day, `cvein:1:1:${i % 90}x${i}`, `fill${i}`);
  assert.deepEqual(await ask(cveinKey({ mine: 12, reset: 3, slot: 0 }), 'rid-day-full-0001'), { error: 'day-full' });
  sql.prepare("DELETE FROM node_harvests WHERE rid = 'fill0'").run();
  const ok = await ask(cveinKey({ mine: 12, reset: 3, slot: 0 }), 'rid-day-ok-000001');
  assert.equal(ok.ok, true);
  assert.equal(ok.material, vein.material);
  assert.equal(ok.node, cveinKey({ mine: 12, reset: 3, slot: 0 }));
});
