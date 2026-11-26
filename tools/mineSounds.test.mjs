import assert from 'node:assert/strict';
import test from 'node:test';
import { createMineSounds, MINE_SOUND } from '../src/systems/mine/mineSounds.js';
import { createMineClient } from '../src/systems/mine/mineClient.js';
import { mineLayout } from '../src/net/mine/mineLayout.js';

function bus() {
  const shots = [], loops = [];
  return { shots, loops, playOneShot: (c, v, p) => shots.push(c), loop3d: (c, at, v) => { const h = { c, at, stopped: false, stop() { this.stopped = true; } }; loops.push(h); return h; } };
}

test('a running drill grinds at its rig until it stops; leaving the mine stills every drill', () => {
  const a = bus(), s = createMineSounds({ audio: a });
  s.drills([{ key: '0:0:0', at: [1, 2, 3] }]);
  s.drills([{ key: '0:0:0', at: [1, 2, 3] }]);   // the same drill: one loop
  assert.equal(a.loops.length, 1);
  assert.equal(a.loops[0].c, MINE_SOUND.drill.clip);
  s.drills([]);
  assert.ok(a.loops[0].stopped);
  s.drills([{ key: '1:0:0', at: [0, 0, 0] }]);
  s.stop();
  assert.ok(a.loops[1].stopped);
});

test('a collapse runs falling rock under the moan; a page with no bus hears nothing and never throws', () => {
  const a = bus(), later = [];
  const s = createMineSounds({ audio: a, setTimeout: (fn) => later.push(fn) });
  assert.ok(s.say('collapse'));
  later.forEach((fn) => fn());
  assert.equal(a.shots.length, 1 + MINE_SOUND.collapse.run.length);
  assert.equal(createMineSounds().say('collapse'), false);
  assert.equal(createMineSounds().drills([{ key: 'x', at: [0, 0, 0] }]), 0);
});

test('the mine’s words are heard: warnings, a wave, a drill set, a lamp, the collapse', () => {
  const heard = [];
  const c = createMineClient({ layout: mineLayout(398616, 0), say: () => {}, send: () => true, planks: () => 0, spend: async () => true, shake: () => {}, fade: () => {}, closeWindows: () => {}, leave: () => {}, foes: () => {}, sound: (n) => heard.push(n) });
  const st = { reset: 0, sealedUntil: 0, born: 1, stab: [10], cap: [100], props: [] };
  c.heard({ k: 'st', st, ev: ['warn:dust', 'warn:creak', 'warn:rumble', 'wave:0:0:2', 'drill:0:0:0', 'lamp:0:0', 'stray:0:0:1', 'collapse'] });
  assert.deepEqual(heard, ['warn:dust', 'warn:creak', 'warn:rumble', 'wave', 'drillStart', 'lamp', 'collapse']);
});
