import assert from 'node:assert/strict';
import test from 'node:test';
import { standMineFoes, mineFoesOf, MINE_FOE_BANDS } from '../src/systems/mine/mineFoes.js';
import { createMineClient } from '../src/systems/mine/mineClient.js';
import { mineLayout } from '../src/net/mine/mineLayout.js';
import { MOBILE_TYPES } from '../src/characters/mobileTypes.js';

const L = mineLayout(398616, 0);

test('a wave stands its creatures from its section’s band, about its chamber’s middle', () => {
  const asked = [];
  const n = standMineFoes(L, { s: 0, c: 0, n: 3 }, (t, feet, lo, hi) => asked.push({ t, feet, lo, hi }));
  assert.equal(n, 3);
  const ch = L.sections[0].chambers[0];
  assert.ok(asked.every((a) => MINE_FOE_BANDS[0].includes(a.t) && a.feet === ch.c && a.lo > 0 && a.hi <= Math.min(ch.rx, ch.rz)));
  assert.ok(mineFoesOf(5).includes(MOBILE_TYPES.SkeletalWarrior));
  assert.ok(MINE_FOE_BANDS.flat().every((t) => Number.isInteger(t)));
  assert.equal(standMineFoes(L, { s: 0, c: 99, n: 3 }, () => {}), 0);   // no such chamber
});

test('the page hears a wave (and says so) and a stray (quietly), and stands each', () => {
  const said = [], called = [];
  const c = createMineClient({ layout: L, say: (x) => said.push(x), send: () => true, planks: () => 0, spend: async () => true, shake: () => {}, fade: () => {}, closeWindows: () => {}, leave: () => {}, foes: (...a) => called.push(a) });
  const st = { reset: 0, sealedUntil: 0, born: 1, stab: [100], cap: [100], props: [] };
  c.heard({ k: 'st', st, ev: ['wave:1:2:4'] });
  c.heard({ k: 'st', st, ev: ['stray:0:1:1'] });
  assert.deepEqual(called, [['wave', 1, 2, 4], ['stray', 0, 1, 1]]);
  assert.equal(said.length, 1);
});
