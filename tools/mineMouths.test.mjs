import assert from 'node:assert/strict';
import test from 'node:test';
import { createMineMouths, mouthLocal } from '../src/systems/mine/mineMouths.js';
import { mineAt } from '../src/net/mine/mineSites.js';
import { CLIMATES } from '../src/formats/mapsTables.js';

/** A Mountain pixel that holds a mouth. */
function minePixel() {
  for (let py = 100; py < 400; py++) for (let px = 100; px < 400; px++) if (mineAt({ px, py, climate: CLIMATES.Mountain, occupied: false })) return { px, py };
  return null;
}

function rig({ occupied = false, sealed = 0 } = {}) {
  const p = minePixel();
  const entry = { px: p.px, py: p.py, batches: [] };
  const built = new Map([[`${p.px},${p.py}`, entry]]);
  const said = [], entered = [];
  let now = 0, feet = null;
  const mouths = createMineMouths({
    renderer: { createBillboardBatch: () => ({}) }, getTexture: async () => ({ recordCount: 40 }), uploadRecord: () => {},
    billboardSize: () => ({ w: 2, h: 3 }), built: () => built, climateAt: () => CLIMATES.Mountain, occupiedAt: () => occupied,
    pixelTranslation: (x, y, out) => { out[0] = 0; out[1] = 0; out[2] = 0; return out; }, feet: () => feet, outside: () => true,
    enter: (px, py) => entered.push([px, py]), sealedFor: () => sealed, say: (t) => said.push(t), nowMs: () => now,
  });
  const settle = async () => { mouths.frame(); await new Promise((r) => setTimeout(r, 0)); };
  return { p, entry, mouths, said, entered, settle, at: (f) => { feet = f; }, tick: (ms) => { now += ms; } };
}

test('a mouth never stands on an occupied pixel', async () => {
  const r = rig({ occupied: true });
  await r.settle();
  assert.equal(r.mouths.stood().length, 0);
  assert.equal(r.entry.batches.length, 0);
});

test('a mouth stands its arch, two boulders and a torch, and walking in enters once', async () => {
  const r = rig();
  await r.settle();
  assert.equal(r.mouths.stood().length, 1);
  assert.equal(r.entry.batches.length, 4);
  const m = mouthLocal(r.entry);
  r.at([m[0] + 30, m[1], m[2]]); r.mouths.frame();
  assert.equal(r.entered.length, 0);
  assert.equal(r.said.length, 1);   // spotted
  r.at([m[0] + 1, m[1], m[2]]); r.mouths.frame(); r.mouths.frame();
  assert.deepEqual(r.entered, [[r.p.px, r.p.py]]);
  r.at([m[0] + 20, m[1], m[2]]); r.mouths.frame();   // stepped away: armed again
  r.at([m[0], m[1], m[2] + 1]); r.mouths.frame();
  assert.equal(r.entered.length, 2);
});

test('a sealed mouth says how long it has left and lets nobody in', async () => {
  const r = rig({ sealed: 2400 });
  await r.settle();
  const m = mouthLocal(r.entry);
  r.at([m[0] + 1, m[1], m[2]]); r.mouths.frame();
  assert.equal(r.entered.length, 0);
  assert.ok(r.said.some((s) => s.includes('40')));
});
