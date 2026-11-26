import assert from 'node:assert/strict';
import test from 'node:test';
import { createMineMouths, mouthLocal, MOUTH_KEY } from '../src/systems/mine/mineMouths.js';
import { mineAt } from '../src/net/mine/mineSites.js';
import { CLIMATES } from '../src/formats/mapsTables.js';
import { mineDarkCorners, mineDarkModel } from '../src/world/mine/mineArt.js';

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

test("the owner's entrance stands in place of the flats: its rock on the collider, drawn at its pixel, entered at its portal", async () => {
  const p = minePixel();
  const entry = { px: p.px, py: p.py, batches: [] };
  const built = new Map([[`${p.px},${p.py}`, entry]]);
  const buckets = new Map(), draws = [], entered = [];
  const door = { at: [0, 0, 11.42], into: [1, 0, 0] };
  const E = { gpu: { id: 1 }, positions: new Float32Array(9), indices: new Uint32Array([0, 1, 2]), box: [0, 0, 0, 1, 1, 1], door, dark: { gpu: { id: 2 }, corners: mineDarkCorners(door) } };
  let feet = null, clock = 0;
  const mouths = createMineMouths({
    renderer: { createBillboardBatch: () => ({}) }, getTexture: async () => ({ recordCount: 40 }), uploadRecord: () => {},
    billboardSize: () => ({ w: 2, h: 3 }), built: () => built, climateAt: () => CLIMATES.Mountain, occupiedAt: () => false,
    pixelTranslation: (x, y, out) => { out[0] = 100; out[1] = 0; out[2] = 0; return out; }, feet: () => feet, outside: () => true,
    enter: (px, py) => entered.push([px, py]), sealedFor: () => 0, say: () => {}, nowMs: () => (clock += 1000),
    art: () => ({ state: 'ready', art: { entrance: E } }),
    collider: () => ({ addMesh: (k, pos, idx, m) => buckets.set(k, m), removeBucket: (k) => buckets.delete(k) }), riding: () => null,
  });
  mouths.frame();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(entry.batches.length, 0);
  assert.equal(buckets.size, 1);
  assert.equal(mouths.draw({ drawMesh: (g, m) => draws.push([g, m[12]]) }), 1);
  assert.equal(draws[0][0], E.gpu);
  assert.equal(draws[1][0], E.dark.gpu);   // the dark of its way in, drawn with it
  // the dark is pressable where it stands: Info names it, a press goes in
  const [tg] = mouths.targets();
  assert.equal(tg.key, `${MOUTH_KEY}${p.px},${p.py}`);
  assert.ok(tg.aabb.min[0] >= 100 && tg.aabb.max[1] - tg.aabb.min[1] > 2);
  assert.equal(mouths.hoverName(tg.key).title, 'Mine entrance');
  assert.equal(mouths.activate('nyx:camp'), false);
  assert.equal(mouths.activate(tg.key, 'info'), true);
  assert.equal(entered.length, 0);
  assert.equal(mouths.activate(tg.key, 'grab'), true);
  assert.deepEqual(entered, [[p.px, p.py]]);
  entered.length = 0;
  feet = [10000, 0, 10000]; mouths.frame();   // stepped well away: the walk-in armed again
  const at = mouths.stood()[0].local;   // the walk-in point, inside the portal
  feet = [at[0] + 100, at[1], at[2]];
  mouths.frame();
  assert.deepEqual(entered, [[p.px, p.py]]);
  built.clear();
  mouths.frame();
  assert.equal(buckets.size, 0);
});

test('the dark of the way in is one quad each side, behind the door and as wide as the portal', () => {
  const door = { at: [0, 0, 11.42], into: [1, 0, 0] };
  const c = mineDarkCorners(door);
  assert.ok(c.every((p) => p[0] > 0));   // behind the door, into the rock
  assert.ok(Math.abs(c[1][2] - c[0][2]) > 2);
  const m = mineDarkModel(door, 19);
  assert.equal(m.indices.length, 12);
  assert.equal(m.subMeshes[0].primitiveCount, 4);
  assert.equal(m.subMeshes[0].textureRecord, 19);
});

test('a spotted mouth is remembered for the world maps, across pages', async () => {
  const p = minePixel();
  const entry = { px: p.px, py: p.py, batches: [] };
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const make = () => createMineMouths({
    renderer: { createBillboardBatch: () => ({}) }, getTexture: async () => ({ recordCount: 40 }), uploadRecord: () => {},
    billboardSize: () => ({ w: 2, h: 3 }), built: () => new Map([[`${p.px},${p.py}`, entry]]), climateAt: () => CLIMATES.Mountain, occupiedAt: () => false,
    pixelTranslation: (x, y, out) => { out[0] = 0; out[1] = 0; out[2] = 0; return out; }, feet: () => [m[0] + 40, m[1], m[2]], outside: () => true,
    enter: () => {}, sealedFor: () => 0, say: () => {}, nowMs: () => 0, storage,
  });
  const m = mouthLocal(entry);
  const a = make();
  a.frame(); await new Promise((r) => setTimeout(r, 0)); a.frame();
  assert.deepEqual(a.mapMarks(), [{ px: p.px, py: p.py, label: 'Mine' }]);
  assert.deepEqual(make().mapMarks(), [{ px: p.px, py: p.py, label: 'Mine' }]);   // a new page remembers it
});
