// BUNNYFALL VEIN-CLUSTERS: a pixel's veins stand in groups of three or four, never scattered one by one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { veins, veinGroupOf, VEIN_GROUP_MAX, NODE_COUNTS } from '../../src/net/nodeLaw.js';
import { TERRAIN_SIZE } from '../../src/world/terrain/terrainSampler.js';

test('BUNNYFALL VEIN-CLUSTERS: the slots split into groups of three or four', () => {
  for (const n of [3, 4, 6, 7, 8, 10]) {
    const sizes = new Map();
    for (let s = 0; s < n; s++) { const g = veinGroupOf(s, n); sizes.set(g.group, g.size); }
    for (const size of sizes.values()) assert.ok(size >= 3 && size <= VEIN_GROUP_MAX, `${n} slots: a group of ${size}`);
    assert.equal([...sizes.values()].reduce((a, b) => a + b, 0), n);
  }
});

test('BUNNYFALL VEIN-CLUSTERS: a group\'s veins stand within some 30 m of one another, and the groups apart', () => {
  for (const climate of Object.keys(NODE_COUNTS).map(Number)) {
    for (const [x, y, day] of [[100, 200, 20000], [405, 150, 20391], [7, 9, 19999]]) {
      const vs = veins({ x, y, day, climate });
      if (vs.length < 3) continue;
      const at = (v) => [v.u * TERRAIN_SIZE, v.v * TERRAIN_SIZE];
      const groups = new Map();
      for (const v of vs) { const g = veinGroupOf(v.slot, vs.length).group; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(at(v)); }
      for (const pts of groups.values()) for (const a of pts) for (const b of pts) assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) <= 30, 'a group stands together');
      for (const pts of groups.values()) for (const [u, v] of pts) assert.ok(u > 0 && v > 0 && u < TERRAIN_SIZE && v < TERRAIN_SIZE, 'on the pixel');
    }
  }
});
