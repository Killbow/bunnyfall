import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dockTops, fitPoiLayout, readPoiLayout, createPoiPrefs, readPoiPrefs, POI_LAYOUT_KEY, POI_PREFS_KEY, POI_LAYOUT_DEFAULTS, POI_LAYOUT_BOUNDS, POI_SNAP_KEPT_MAX } from '../src/ui/poi/poiLayout.js';

const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, m }; };
const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };

test('layout: reads saved sizes, clamps them to bounds, and fits them to the window', () => {
  const s = memory();
  assert.deepEqual(readPoiLayout(s), { ...POI_LAYOUT_DEFAULTS });
  assert.deepEqual(readPoiLayout(blocked), { ...POI_LAYOUT_DEFAULTS });
  s.setItem(POI_LAYOUT_KEY, '{"left":"wide","right":420,"dm":300}');
  assert.deepEqual(readPoiLayout(s), { left: 250, right: 420, dm: 300 });
  s.setItem(POI_LAYOUT_KEY, 'not json');
  assert.deepEqual(readPoiLayout(s), { ...POI_LAYOUT_DEFAULTS });
  assert.deepEqual(fitPoiLayout({ left: 10, right: 9999, dm: 10 }, 3000, 1200), { left: POI_LAYOUT_BOUNDS.left[0], right: POI_LAYOUT_BOUNDS.right[1], dm: POI_LAYOUT_BOUNDS.dm[0] });
  const f = fitPoiLayout({ left: 400, right: 600, dm: 900 }, 1280, 720);
  assert.ok(f.left + f.right <= 1280 - 32 - POI_LAYOUT_BOUNDS.gap, JSON.stringify(f));
  assert.equal(f.left, 400);
  assert.ok(f.dm <= 720 - 56 - 52 - 40, 'the DM panel leaves room above it');
  assert.ok(fitPoiLayout({ left: 250, right: 300, dm: 900 }, 1500, 900, 107).dm <= 900 - 107 - 52 - 40, 'and under a tall bar');
});

test('prefs: restores saved snap steps and camera speed and saves them when changed', () => {
  const editor = () => {
    let on = false, steps = { move: 0.25, turn: 15, size: 0.1 }, speed = 12;
    return { snapOn: () => on, setSnap(v, s = {}) { on = v; steps = { ...steps, ...s }; }, snapSteps: () => ({ ...steps }), eyeSpeed: () => speed, setEyeSpeed(v) { speed = v; } };
  };
  const s = memory();
  const a = editor(), p = createPoiPrefs({ storage: s });
  p.restore(a);
  p.note(a);
  assert.equal(s.getItem(POI_PREFS_KEY), null, 'nothing changed, nothing written');
  a.setSnap(false, { move: 0.5 }); a.setEyeSpeed(30);
  p.note(a);
  assert.deepEqual(readPoiPrefs(s), { snap: { move: 0.5, turn: 15, size: 0.1 }, speed: 30 });
  const b = editor();
  createPoiPrefs({ storage: s }).restore(b);
  assert.deepEqual(b.snapSteps(), { move: 0.5, turn: 15, size: 0.1 });
  assert.equal(b.eyeSpeed(), 30);
  assert.equal(b.snapOn(), false, 'snap itself is left as it was');
  const c = editor();
  createPoiPrefs({ storage: blocked }).restore(c);
  createPoiPrefs({ storage: blocked }).note(c);
  assert.equal(c.eyeSpeed(), 12, 'blocked storage leaves default settings unchanged');
});

test('layout: a dock widened under the top bar starts below it; at the default widths neither dock moves', () => {
  const bar = { left: 375, right: 1125, bottom: 99, height: 91 };
  assert.deepEqual(dockTops(bar, { left: 250, right: 300 }, 1500), { left: 56, right: 56, free: 107 });
  assert.deepEqual(dockTops(bar, { left: 250, right: 420 }, 1500), { left: 56, right: 107, free: 107 });
  assert.deepEqual(dockTops(bar, { left: 400, right: 300 }, 1500), { left: 107, right: 56, free: 107 });
  assert.deepEqual(dockTops(null, { left: 400, right: 420 }, 1500), { left: 56, right: 56, free: 56 }, 'the bar not drawn');
  assert.deepEqual(dockTops({ left: 0, right: 0, bottom: 0, height: 0 }, { left: 400, right: 420 }, 1500), { left: 56, right: 56, free: 56 });
});

test('prefs: ignores saved snap steps that are out of bounds', () => {
  const s = memory();
  s.setItem(POI_PREFS_KEY, JSON.stringify({ snap: { move: 1e300, turn: 15, size: -1 }, speed: 30 }));
  assert.deepEqual(readPoiPrefs(s), { snap: { turn: 15 }, speed: 30 });
  s.setItem(POI_PREFS_KEY, JSON.stringify({ snap: { move: POI_SNAP_KEPT_MAX.move, turn: 181, size: POI_SNAP_KEPT_MAX.size } }));
  assert.deepEqual(readPoiPrefs(s), { snap: { move: 100, size: 10 }, speed: null });
});

test('storage: pageStorage returns null and editor helpers initialize cleanly when localStorage throws', async () => {
  const { pageStorage } = await import('../src/ui/poi/poiStorage.js');
  const { createPoiSceneActs } = await import('../src/ui/poi/poiSceneActs.js');
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  try {
    assert.equal(pageStorage(), null);
    const edit = { selection: () => null, docOf: () => null };
    assert.doesNotThrow(() => createPoiSceneActs({ edit, say: () => {} }));
    assert.deepEqual(readPoiLayout(pageStorage()), { ...POI_LAYOUT_DEFAULTS });
    const p = createPoiPrefs();
    const ed = { snapOn: () => false, setSnap() {}, snapSteps: () => ({ move: 1, turn: 15, size: 0.1 }), eyeSpeed: () => 12, setEyeSpeed() {} };
    assert.doesNotThrow(() => { p.restore(ed); p.note(ed); });
  } finally {
    if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete globalThis.localStorage;
  }
});
