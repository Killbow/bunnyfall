import assert from 'node:assert/strict';
import test from 'node:test';
import { mineOreModelOf, mineOreMatrix, mineOreDraws, MINE_ORE_RICH_FROM } from '../src/world/mine/mineOres.js';
import { mineLayout, MINE_RICH_ORES } from '../src/net/mine/mineLayout.js';
import { transformPoint } from '../src/world/mat4.js';

test('a rich seam wears a big cluster, a common ore a small one, the same on every page', () => {
  assert.ok(mineOreModelOf({ ore: MINE_RICH_ORES[0] }, 15) >= MINE_ORE_RICH_FROM);
  assert.ok(mineOreModelOf({ ore: 'metal:iron' }, 15) < MINE_ORE_RICH_FROM);
  assert.equal(mineOreModelOf({ ore: 'metal:iron' }, 15), mineOreModelOf({ ore: 'metal:iron' }, 15));
  assert.equal(mineOreModelOf({ ore: 'metal:iron' }, 0), -1);
});

test('an ore stands with its foot on its hole', () => {
  const box = [-3.3, 0.03, 0.82, -2.7, 0.52, 1.39];
  const m = mineOreMatrix({ at: [10, -4, 7], k: 2 }, box);
  const foot = transformPoint(m, -3.0, 0.03, 1.105);
  assert.ok(Math.hypot(foot[0] - 10, foot[1] + 4, foot[2] - 7) < 1e-6);
});

test('every hole of a mine gets a draw', () => {
  const L = mineLayout(398616, 0);
  const holes = L.sections.flatMap((s) => s.chambers.flatMap((c) => c.holes)).length;
  const ores = Array.from({ length: 15 }, (_, i) => ({ gpu: { i }, box: [0, 0, 0, 1, 1, 1] }));
  assert.equal(mineOreDraws(L, ores).length, holes);
});
