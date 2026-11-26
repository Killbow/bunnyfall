// BUNNYFALL (2026-11-25, caverns): the mine layout law.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mineLayout, mineIsRich, mineOresAt, MINE_SECTIONS, MINE_CHAMBERS, MINE_HOLES, MINE_DROP_M, MINE_TUNNEL_R,
  MINE_CHAMBER_R, MINE_POCKET_R, MINE_WEAK_SHARE, MINE_WALLS, MINE_ORES_BY_DEPTH, MINE_RICH_ORES,
} from '../src/net/mine/mineLayout.js';
import { minedMaterial } from '../src/net/professionLaw.js';

const IDS = Array.from({ length: 120 }, (_, i) => (i * 7919 + 13) % 1000000);
const layouts = IDS.map((id, i) => mineLayout(id, i % 5));
const chambersOf = (L) => L.sections.flatMap((s) => s.chambers);
const inEllipse = (c, p, pad = 0) => ((p[0] - c.c[0]) / c.rx) ** 2 + ((p[2] - c.c[2]) / c.rz) ** 2 <= 1 + pad;
const deepest = (L) => chambersOf(L).reduce((a, b) => (b.c[1] < a.c[1] ? b : a));

test('same inputs give the same layout; another reset gives other chambers', () => {
  const a = mineLayout(4321, 7), b = mineLayout(4321, 7), c = mineLayout(4321, 8);
  assert.deepEqual(a, b);
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.sections[0].chambers[0].c) && Object.isFrozen(a.tunnels[0].pts[0]));
  assert.notDeepEqual(chambersOf(a), chambersOf(c));
  assert.equal(a.mineId, 4321);
  assert.equal(a.reset, 7);
});

test('counts stay in their ranges', () => {
  for (const L of layouts) {
    assert.ok(L.sections.length >= MINE_SECTIONS[0] && L.sections.length <= MINE_SECTIONS[1]);
    L.sections.forEach((s, i) => {
      assert.equal(s.i, i);
      assert.ok(s.depth > 0);
      assert.ok(s.chambers.length >= MINE_CHAMBERS[0] && s.chambers.length <= MINE_CHAMBERS[1]);
      s.chambers.forEach((c, j) => {
        assert.equal(c.id, `s${i}c${j}`);
        assert.ok(c.holes.length >= MINE_HOLES[0] && c.holes.length <= MINE_HOLES[1]);
        assert.ok(c.walls.length >= MINE_WALLS[0] && c.walls.length <= MINE_WALLS[1], `${c.walls.length} walls`);
        const r = Math.max(c.rx, c.rz);
        assert.ok(r >= MINE_POCKET_R[0] && r <= MINE_CHAMBER_R[1]);
        assert.ok(c.h > 3);
      });
    });
    for (const t of L.tunnels) assert.ok(t.r >= MINE_TUNNEL_R[0] && t.r <= MINE_TUNNEL_R[1]);
  }
});

test('each section lies below the one before by at least the least drop', () => {
  for (const L of layouts) {
    for (let i = 1; i < L.sections.length; i++) {
      const above = Math.min(...L.sections[i - 1].chambers.map((c) => c.c[1]));
      const below = Math.max(...L.sections[i].chambers.map((c) => c.c[1]));
      assert.ok(above - below >= MINE_DROP_M[0] - 0.02, `${above} vs ${below}`);
    }
    assert.ok(Math.max(...L.sections[0].chambers.map((c) => c.c[1])) <= L.mouth.at[1] - MINE_DROP_M[0] + 0.02);
  }
});

test('no two chambers overlap', () => {
  for (const L of layouts) {
    const cs = chambersOf(L);
    for (let a = 0; a < cs.length; a++) for (let b = a + 1; b < cs.length; b++) {
      const d = Math.hypot(cs[a].c[0] - cs[b].c[0], cs[a].c[2] - cs[b].c[2]);
      assert.ok(d > Math.max(cs[a].rx, cs[a].rz) + Math.max(cs[b].rx, cs[b].rz) + 2, `${cs[a].id} ${cs[b].id} ${d}`);
    }
  }
});

test('the tunnels connect the mouth to every chamber, ends inside their chambers', () => {
  for (const L of layouts) {
    const byId = new Map(chambersOf(L).map((c) => [c.id, c]));
    const next = new Map([['mouth', []], ...[...byId.keys()].map((id) => [id, []])]);
    for (const t of L.tunnels) {
      next.get(t.from).push(t.to);
      next.get(t.to).push(t.from);
      const end = t.pts[t.pts.length - 1];
      assert.ok(inEllipse(byId.get(t.to), end), `${t.to} end`);
      assert.ok(Math.abs(end[1] - byId.get(t.to).c[1]) < 0.02);
      if (t.from === 'mouth') assert.deepEqual(t.pts[0], L.mouth.at);
      else {
        assert.ok(inEllipse(byId.get(t.from), t.pts[0]), `${t.from} start`);
        assert.ok(Math.abs(t.pts[0][1] - byId.get(t.from).c[1]) < 0.02);
      }
    }
    const seen = new Set(['mouth']), queue = ['mouth'];
    while (queue.length) for (const n of next.get(queue.shift())) if (!seen.has(n)) { seen.add(n); queue.push(n); }
    assert.equal(seen.size, byId.size + 1);
  }
});

test('no tunnel is steeper than 35 degrees and points stand about 2 m apart', () => {
  const most = Math.tan(35 * Math.PI / 180);
  for (const L of layouts) for (const t of L.tunnels) for (let i = 1; i < t.pts.length; i++) {
    const [a, b] = [t.pts[i - 1], t.pts[i]];
    const run = Math.hypot(b[0] - a[0], b[2] - a[2]);
    assert.ok(Math.abs(b[1] - a[1]) <= run * most, `${t.from}->${t.to} rise ${b[1] - a[1]} over ${run}`);
    assert.ok(run < 2.6, `step ${run}`);
  }
});

test('the rails run from the mouth to the deepest chamber', () => {
  for (const L of layouts) {
    assert.ok(Math.hypot(...L.rails[0].map((v, i) => v - L.mouth.at[i])) <= 3);
    assert.ok(inEllipse(deepest(L), L.rails[L.rails.length - 1]));
    for (let i = 1; i < L.rails.length; i++) assert.ok(Math.hypot(...L.rails[i].map((v, j) => v - L.rails[i - 1][j])) < 2.6);
  }
});

test('wall slots stand on the ellipse a metre up, facing in; holes keep off the walls', () => {
  for (const L of layouts) for (const c of chambersOf(L)) {
    for (const [k, w] of c.walls.entries()) {
      assert.equal(w.k, k);
      assert.ok(Math.abs(((w.at[0] - c.c[0]) / c.rx) ** 2 + ((w.at[2] - c.c[2]) / c.rz) ** 2 - 1) < 0.01);
      assert.ok(Math.abs(w.at[1] - (c.c[1] + 1)) < 0.02);
      assert.equal(w.n[1], 0);
      assert.ok(Math.abs(Math.hypot(w.n[0], w.n[2]) - 1) < 0.01);
      assert.ok(w.n[0] * (c.c[0] - w.at[0]) + w.n[2] * (c.c[2] - w.at[2]) > 0);
    }
    for (const [k, h] of c.holes.entries()) {
      assert.equal(h.k, k);
      assert.ok(inEllipse(c, h.at));
      assert.equal(h.at[1], c.c[1]);
      assert.ok(h.rich >= 1 && h.rich <= 3 && Number.isInteger(h.rich));
      assert.ok(minedMaterial(h.ore), h.ore);
      for (const w of c.walls) assert.ok(Math.hypot(w.at[0] - h.at[0], w.at[2] - h.at[2]) >= 2.5);
    }
  }
});

test('about 30 percent of wall slots are weak', () => {
  let weak = 0, all = 0;
  for (let i = 0; i < 200; i++) for (const c of chambersOf(mineLayout(100000 + i * 31, 3))) for (const w of c.walls) {
    all++;
    if (w.weak) weak++;
  }
  assert.ok(Math.abs(weak / all - MINE_WEAK_SHARE) < 0.05, `${weak / all}`);
});

test('ores follow depth; a rich mine keeps one rare ore in its deepest section', () => {
  for (const ore of [...MINE_ORES_BY_DEPTH.flat(), ...MINE_RICH_ORES]) assert.ok(minedMaterial(ore), ore);
  assert.deepEqual(mineOresAt(0), ['metal:iron', 'metal:copper', 'metal:tin']);
  assert.ok(mineOresAt(3).includes('metal:gold') && !mineOresAt(3).includes('metal:platinum'));
  assert.ok(mineOresAt(9).includes('metal:platinum'));
  let rich = 0;
  for (const L of layouts) {
    const isRich = mineIsRich(L.mineId, L.reset);
    if (isRich) rich++;
    const last = L.sections.length - 1;
    L.sections.forEach((s, i) => {
      for (const c of s.chambers) for (const h of c.holes) {
        if (isRich && i === last) assert.ok(MINE_RICH_ORES.includes(h.ore));
        else assert.ok(mineOresAt(i).includes(h.ore), `${h.ore} at ${i}`);
      }
    });
    if (isRich) assert.equal(new Set(L.sections[last].chambers.flatMap((c) => c.holes.map((h) => h.ore))).size, 1);
  }
  assert.ok(rich > 3 && rich < 35, `${rich} rich of ${layouts.length}`);
});

test('about half the sections hold a dead-end pocket', () => {
  let pockets = 0, sections = 0;
  for (const L of layouts) {
    const deg = new Map();
    for (const t of L.tunnels) for (const id of [t.from, t.to]) deg.set(id, (deg.get(id) ?? 0) + 1);
    const deep = deepest(L).id;
    for (const s of L.sections) {
      sections++;
      if (s.chambers.some((c) => c.id !== deep && deg.get(c.id) === 1)) pockets++;
    }
  }
  assert.ok(Math.abs(pockets / sections - 0.5) < 0.1, `${pockets / sections}`);
});

test('mouth facing points toward the first chamber', () => {
  for (const L of layouts) {
    const c = L.sections[0].chambers[0].c;
    const want = Math.atan2(c[2] - L.mouth.at[2], c[0] - L.mouth.at[0]);
    const d = Math.abs(((want - L.mouth.facing) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
    assert.ok(d < 0.01, `${d}`);
  }
});
