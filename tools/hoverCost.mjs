// Times the hover's pure halves (ray pick, target list build, and plaque model) on synthetic scenes.
// Run: node tools/hoverCost.mjs.

import { performance } from 'node:perf_hooks';
import {
  pickActivatableHit, liveFoeTargets, foeAabb, rayAabb,
  RAY_DISTANCE, DEFAULT_ACTIVATION_DISTANCE,
} from '../src/player/activate.js';
import { resolveHover, frameSignature, composeNamer, composeContents } from '../src/player/worldHover.js';
import { raceWinner } from '../src/player/activationRace.js';

const OPEN = { raycast: () => Infinity };
const box = (z) => ({ min: [-0.5, 0, z], max: [0.5, 2, z + 1] });

const targets = (n, prefix = 'door') => Array.from({ length: n }, (_, i) => ({
  key: `${prefix}:${i}`, aabb: box(2 + i * 0.7), distance: RAY_DISTANCE, reach: DEFAULT_ACTIVATION_DISTANCE,
}));

const foes = (n) => Array.from({ length: n }, (_, i) => ({
  entity: {}, mobileType: (i % 40) + 1, ai: { feet: [0, 0, 2 + i * 0.7], height: 1.9, isHostile: i % 3 === 0 },
}));

function bench(label, fn, { iters = 2000, warm = 500 } = {}) {
  for (let i = 0; i < warm; i++) fn();
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) fn();
  const us = ((performance.now() - t0) / iters) * 1000;
  return { label, us };
}

function scale() {
  const a = box(2);
  return bench('rayAabb x1000', () => { for (let i = 0; i < 1000; i++) rayAabb([0, 0, 0], [0, 0, 1], a); }, { iters: 200, warm: 50 }).us;
}

const rows = [];
const eye = [0, 0, 0], dir = [0, 0, 1];

for (const n of [18, 60, 150, 300]) {
  const t = targets(n);
  rows.push(bench(`pick over ${String(n).padStart(3)} held targets`, () => pickActivatableHit(eye, dir, t, OPEN)));
}

for (const n of [20, 60, 150]) {
  const pool = foes(n);
  rows.push(bench(`build ${String(n).padStart(3)} live-foe targets`, () => liveFoeTargets(pool, 'mobileFoe')));
}
rows.push(bench('one foeAabb', () => foeAabb({ ai: { feet: [0, 0, 3], height: 1.9 } }), { iters: 20000, warm: 2000 }));

const pick = { key: 'loot:3', distance: 2, reach: 3.2 };
const items = Array.from({ length: 6 }, (_, i) => ({ name: `Item ${i}`, stackCount: i % 3 }));
const name = composeNamer([() => null, () => null, () => ({ title: 'Loot Pile' })]);
const contents = composeContents([() => null, () => items]);
rows.push(bench('raceWinner over 8 picks', () => raceWinner({
  camp: null, water: { key: 'water:0', distance: 9 }, wagon: null, torch: { key: 't', distance: 5 },
  corpse: { key: 'c', distance: 4 }, pile: null, ground: pick, person: { key: 'p', distance: 6 }, foe: null,
}), { iters: 20000, warm: 2000 }));
rows.push(bench('resolveHover, 6-row pile', () => resolveHover(pick, { name, contents })));
const frame = resolveHover(pick, { name, contents });
rows.push(bench('frameSignature, 6 rows', () => frameSignature(frame), { iters: 20000, warm: 2000 }));

const s = scale();
const FRAME_MS = 16.7;
console.log(`\nWORLD-HOVER cost, ${new Date().toISOString().slice(0, 10)}`);
console.log(`machine scale: ${s.toFixed(1)} us / 1000 rayAabb  (divide by this to compare runs)\n`);
for (const r of rows) {
  const pct = (r.us / 1000 / FRAME_MS) * 100;
  console.log(`  ${r.label.padEnd(34)} ${r.us.toFixed(3).padStart(9)} us   ${pct.toFixed(4).padStart(8)}% of a 16.7 ms frame`);
}
console.log('\nNOT measured here (each needs a browser or a built scene, and the record');
console.log('carries Lane E\'s numbers for them): the DOM paint, buildingUnderRay over a');
console.log('built city, and the interior/dungeon list builds (worldAabb per container,');
console.log('objectAabb per action object - 0.018-0.117 ms and 0.068-0.582 ms normalized).\n');
