import assert from 'node:assert/strict';
import test from 'node:test';
import { mineOreModelOf, mineOreMatrix, mineOreDraws, mineOreCluster, MINE_ORE_RICH_FROM, MINE_ORE_CLUSTER } from '../src/world/mine/mineOres.js';
import { tintPicture, MINE_ORE_TINT } from '../src/world/mine/mineArt.js';
import { mineLayout, MINE_RICH_ORES } from '../src/net/mine/mineLayout.js';
import { transformPoint } from '../src/world/mat4.js';

test('a rich seam wears a big cluster, a common ore a small one, the same on every page', () => {
  assert.ok(mineOreModelOf({ ore: MINE_RICH_ORES[0] }, 15) >= MINE_ORE_RICH_FROM);
  assert.ok(mineOreModelOf({ ore: 'metal:iron' }, 15) < MINE_ORE_RICH_FROM);
  assert.equal(mineOreModelOf({ ore: 'metal:iron' }, 15), mineOreModelOf({ ore: 'metal:iron' }, 15));
  assert.equal(mineOreModelOf({ ore: 'metal:iron' }, 0), -1);
});

test('a piece stands with its foot where it is put', () => {
  const box = [-3.3, 0.03, 0.82, -2.7, 0.52, 1.39];
  const foot = transformPoint(mineOreMatrix([10, -4, 7], box, 40, 3), -3.0, 0.03, 1.105);
  assert.ok(Math.hypot(foot[0] - 10, foot[1] + 4, foot[2] - 7) < 1e-6);
});

test('every hole stands a cluster of 3 to 6 big pieces round it, the same each time, in its ore colours', () => {
  const L = mineLayout(398616, 0);
  const holes = L.sections.flatMap((s) => s.chambers.flatMap((c) => c.holes));
  for (const h of holes) {
    const c = mineOreCluster(h, 15);
    assert.ok(c.length >= MINE_ORE_CLUSTER.min && c.length <= MINE_ORE_CLUSTER.min + MINE_ORE_CLUSTER.more);
    assert.deepEqual(c, mineOreCluster(h, 15));
    assert.ok(c.every((p) => Math.hypot(p.at[0] - h.at[0], p.at[2] - h.at[2]) <= MINE_ORE_CLUSTER.ring[1] + 1e-9 && p.tall >= 0.5 && p.tall <= 1.6));
  }
  const ores = Array.from({ length: 15 }, (_, i) => ({ gpu: { i }, box: [0, 0, 0, 1, 1, 1] }));
  const asked = [];
  const draws = mineOreDraws(L, ores, (i, ore) => { asked.push(ore); return { i, ore }; });
  assert.equal(draws.length, holes.reduce((n, h) => n + mineOreCluster(h, 15).length, 0));
  assert.ok(asked.includes(holes[0].ore));
});

test('iron is gray: a tinted picture keeps its light and takes the ore hue', () => {
  const p = { width: 1, height: 1, colors: new Uint8Array([40, 200, 60, 255]) };
  const { picture } = tintPicture(p, MINE_ORE_TINT['metal:iron']);
  const [r, g, b] = picture.colors;
  assert.ok(Math.abs(r - g) < 6 && Math.abs(g - b) < 10 && r > 100);   // the green crystal's light, in iron's gray
});
