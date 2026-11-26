import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyGarden, stepFarmGarden, stepFarmGardenAction, gardenGrowth, gardenStage, validGarden, FARM_WATER_S } from '../src/net/farmGardenLaw.js';
import { FARM_UPGRADES, FARM_SOIL, FARM_TOOL_AREAS, farmToolArea, stepFarmUpgrade, emptyFarmProgress } from '../src/net/farmProgressLaw.js';
import { farmToolBeds } from '../src/net/farm/toolRange.js';
import { farmSeed } from '../src/net/farm/cropLaw.js';

const shipped = (n, upgrades) => { const g = emptyGarden(); g.progress = emptyFarmProgress(); for (const c of ['grain', 'mushroom', 'herbs']) { g.progress.harvested[c] = n; g.progress.delivered[c] = n; } Object.assign(g.progress.upgrades, upgrades); return g; };

test('tools and soil each have a third tier at 26,000 of every crop, like irrigation', () => {
  for (const k of ['tools', 'soil']) { assert.equal(FARM_UPGRADES[k].length, 3); assert.equal(FARM_UPGRADES[k][2].delivered, 26000); }
  assert.equal(FARM_UPGRADES.irrigation[1].delivered, 26000);
  assert.deepEqual(FARM_TOOL_AREAS, [1, 3, 5, 9]);
  assert.deepEqual(FARM_SOIL.map(s => s.extra), [0, 1, 2, 3]);
  assert.deepEqual(FARM_SOIL.map(s => s.rate), [1, 1, 1.25, 1.5]);
});

test('the third tier needs the second and 26,000 shipped of every crop', () => {
  assert.equal(stepFarmUpgrade(shipped(25999, { tools: 2 }), 'tools').error, 'farm-upgrade-goal');
  const done = stepFarmUpgrade(shipped(26000, { tools: 2, soil: 2 }), 'tools');
  assert.equal(done.garden.progress.upgrades.tools, 3);
  assert.equal(farmToolArea(done.garden), 9);
  assert.equal(stepFarmUpgrade(shipped(26000, { soil: 2 }), 'soil').garden.progress.upgrades.soil, 3);
  assert.equal(stepFarmUpgrade(shipped(99999, { tools: 3 }), 'tools').error, 'farm-upgrade-max');
  // a farm that shipped a lot but bought nothing keeps its progress and still buys in order
  const old = shipped(40000, {}); assert.equal(stepFarmUpgrade(old, 'tools').garden.progress.upgrades.tools, 1);
  assert.equal(validGarden(done.garden), true);
  assert.equal(validGarden(shipped(1, { tools: 4 })), false);
});

test('maximum soil gives three extra items and grows 50% faster; lower soil is unchanged', () => {
  const T = 1e6, base = farmSeed('grain');
  const run = (soil) => { let g = shipped(0, { soil, irrigation: 1 }); g = stepFarmGarden(g, { op: 'hoe', bed: 0 }, T).garden; g = stepFarmGarden(g, { op: 'plant', bed: 0, crop: 'grain' }, T).garden; return g; };
  for (const [soil, extra, rate] of [[0, 0, 1], [1, 1, 1], [2, 2, 1.25], [3, 3, 1.5]]) {
    const g = run(soil), bed = g.beds[0];
    assert.equal(bed.rate, rate); assert.equal(bed.quality, extra);
    assert.equal(gardenGrowth(bed, T + 1000), 1000 * rate);
    const ripe = T + Math.ceil(base.seconds / rate) + 1;
    assert.equal(gardenStage(bed, ripe), 'ripe');
    assert.equal(stepFarmGarden(g, { op: 'harvest', bed: 0 }, ripe).harvest.qty, base.yield + extra);
  }
  assert.ok(FARM_WATER_S > 0);
});

// a 3x3 block of beds two metres apart, ids 0..8 row by row
const grid = (n = 3, gap = []) => { const out = []; for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) out.push(gap.includes(out.length) ? null : [x * 2, 0, z * 2]); return out; };

test('with the best tools the middle bed of a 3x3 block gathers all nine', () => {
  const beds = grid(), feet = [2, 0, 2];
  assert.deepEqual(farmToolBeds(beds, 4, 9, feet).sort(), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(farmToolBeds(beds, 4, 9, feet)[0], 4, 'the bed aimed at comes first');
  assert.deepEqual(farmToolBeds(beds, 4, 5, feet).sort(), [1, 3, 4, 5, 7], 'area 5 stays a plus shape');
  assert.equal(farmToolBeds(beds, 4, 3, feet).length, 3);
  assert.deepEqual(farmToolBeds(beds, 4, 1, feet), [4]);
});

test('the 3x3 block respects farm edges, gaps, reach and obstruction', () => {
  const beds = grid(4), feet = [1, 0, 1];
  assert.deepEqual(farmToolBeds(beds, 0, 9, feet).sort((a, b) => a - b), [0, 1, 4, 5], 'a corner bed has only three neighbours');
  assert.deepEqual(farmToolBeds(grid(3, [2, 6]), 4, 9, [2, 0, 2]).sort((a, b) => a - b), [0, 1, 3, 4, 5, 7, 8], 'gaps are skipped');
  assert.equal(farmToolBeds(grid(5), 12, 9, [4, 0, 4]).length, 9, 'a bigger field still works only the block around the aim');
  assert.deepEqual(farmToolBeds(grid(), 4, 9, [2, 0, 2], (i) => i !== 0 && i !== 8).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7], 'blocked beds are left out');
  assert.equal(farmToolBeds(grid(), 4, 9, [40, 0, 40]).length, 1, 'out of reach, only the aimed bed');
  assert.equal(farmToolBeds([[0, 0, 0], [20, 0, 0]], 0, 9, [0, 0, 0]).length, 1, 'separate fields are not joined');
});

test('a nine-bed harvest by the service gathers each bed at three extra items', () => {
  const T = 1e6, seed = farmSeed('grain');
  let g = shipped(0, { tools: 3, soil: 3, irrigation: 1 });
  const ids = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  g = stepFarmGardenAction(g, { op: 'hoe', beds: ids }, T).garden;
  g = stepFarmGardenAction(g, { op: 'plant', beds: ids, crop: 'grain' }, T).garden;
  assert.equal(stepFarmGardenAction(g, { op: 'hoe', beds: [...ids, 9] }, T).error, 'farm-bed-bad', 'ten beds is too many');
  const ripe = T + Math.ceil(seed.seconds / 1.5) + 1;
  const r = stepFarmGardenAction(g, { op: 'harvest', beds: ids, mapId: 1 }, ripe);
  assert.equal(r.harvests.length, 9);
  for (const h of r.harvests) assert.equal(h.qty, seed.yield + 3);
});
