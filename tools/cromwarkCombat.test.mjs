import test from 'node:test';
import assert from 'node:assert/strict';
import { CROMWARK_ROSTER, cromwarkHealth, cromwarkSpecies, cromwarkPack, cromwarkTitanheart, cromwarkTitanDamage } from '../src/systems/wild/cromwarkRoster.js';
import { cromwarkPattern, inCromwarkMark, shotHits } from '../src/systems/wild/cromwarkPatterns.js';
import { createCromwarkCombat } from '../src/systems/wild/cromwarkCombat.js';
import { validFoeRecord } from '../src/net/wire.js';
import { foeStatsRefusal } from '../src/net/foeBounds.js';
import { setWildHere, applyWildFoe, setWildMask } from '../src/systems/wild/wildZone.js';
import { createHazeClock, foeDamageMult, setBlightProbe } from '../src/systems/wild/cromwark.js';
import { grantSpecies } from '../src/scenes/grantHost.js';

const origin = [0, 0, 0];
const foe = (id = 3138, puppet = null) => ({ mobileType: id, puppet, entity: { health: 100, eliteFoe: false },
  ai: { feet: [0, 0, 0], isHostile: true, detected: true, inSight: true, controllerHeight: 1.8 } });
function harness(wall = Infinity) {
  const hits = [], effects = [], drawn = [];
  const textures = new Set();
  const collider = { raycast: (_a, dir) => dir[1] < -.9 ? 2.5 : wall, move: (p, x, y, z) => { p[0] += x; p[1] += y; p[2] += z; } };
  const combat = createCromwarkCombat({ collider, hurt: (share, f) => hits.push({ share, f }), impact: (m) => effects.push(m),
    renderer: { textures, createBillboardBatch: () => ({}), destroyBatch: (b) => drawn.push(b) },
    getTexture: async () => ({ getSize: () => ({ width: 24, height: 24 }) }), uploadRecordFrame() { textures.add('9947_0#0'); } });
  const step = (foes, feet = [0, 0, 6], seconds = .05, disabled = false) => {
    const n = Math.round(seconds / .05);
    for (let i = 0; i < n; i++) { combat.begin(.05, foes); for (const f of foes) combat.frame(f, .05, feet, 1.8, disabled, true); }
  };
  return { combat, hits, effects, step };
}

test('all seven normal and elite patterns have warnings, finite lifetimes and bounded density', () => {
  for (const p of CROMWARK_ROSTER) for (const elite of [false, true]) {
    const a = cromwarkPattern(p.id, origin, .3, 2, elite);
    assert.ok(a.duration > 1 && a.duration < 12, p.name);
    assert.ok(a.marks.length + a.shots.length > 0);
    assert.ok(a.marks.every((m) => m.land - m.start >= .72 && m.damage <= .2));
    assert.ok(a.marks.length + a.shots.length < 70);
    assert.ok(cromwarkHealth(p.id, elite) <= 480);
  }
});
test('Judge volleys are evenly spaced shots and use swept capsule collision', () => {
  const shots = cromwarkPattern(3136, origin, 0).shots;
  const wave = shots.filter((s) => s.start === shots[0].start);
  for (let i = 1; i < wave.length; i++) assert.ok(Math.abs(wave[i].yaw - wave[i - 1].yaw - Math.PI * 2 / wave.length) < 1e-8);
  assert.equal(shotHits({ origin, yaw: 0, start: 0, speed: 4, r: .22 }, 0, 2, [0, 0, 4]), true);
  assert.equal(shotHits({ origin, yaw: 0, start: 0, speed: 4, r: .22 }, 0, 2, [2, 0, 4]), false);
  assert.equal(shotHits({ origin, yaw: 0, start: 0, speed: 4, r: .22 }, 0, 2, [0, 2, 4]), false);
});
test('Gazadar lane pierces multiple positions and has a usable side dodge', () => {
  const m = cromwarkPattern(3138, origin, 0).marks[0];
  for (const z of [2, 8, 20]) assert.equal(inCromwarkMark(m, [0, 0, z]), true);
  assert.equal(inCromwarkMark(m, [1.5, 0, 8]), false);
  assert.equal(inCromwarkMark(m, [0, 5, 8]), false);
});
test('Pain leaves safe wedges between spokes and a safe inner gap in its ring', () => {
  const p = cromwarkPattern(3141, origin, 0, 0);
  assert.equal(inCromwarkMark(p.marks[0], origin), false);
  const spokes = p.marks.filter((m) => m.kind === 'lunge');
  assert.equal(spokes.some((m) => inCromwarkMark(m, [4, 0, 4])), false);
  assert.equal(spokes.some((m) => inCromwarkMark(m, [0, 0, 7])), true);
});
test('Bishop and Frozen lock their first warning at the ranged target, not their own feet', () => {
  for (const id of [3140, 3142]) {
    const m = cromwarkPattern(id, origin, 0, 1, false, 18).marks[0];
    assert.deepEqual(m.origin, [0, 0, 18]);
    assert.equal(inCromwarkMark(m, [0, 0, 18]), true);
    assert.equal(inCromwarkMark(m, origin), false);
  }
});
test('normal support remains in the mix and outside-zone tables never change', () => {
  assert.equal(cromwarkSpecies(7, 0, () => 0), 7);
  assert.equal(cromwarkSpecies(7, 4, () => .8), 7);
  assert.equal(cromwarkSpecies(7, 4, () => 0), 3136);
  const seen = new Set();
  for (let n = 0; n < 7; n++) { let i = 0; seen.add(cromwarkSpecies(7, 4, () => i++ ? (n + .1) / 7 : 0)); }
  assert.equal(seen.size, 7);
});
test('seeded grants agree, retain ordinary support, and only alter Cromwark pixels', () => {
  const width = 4, depth = new Uint8Array(16); depth[5] = 4;
  setWildMask({ width, height: 4, depth, maxDepth: 4 });
  const seen = new Set();
  for (let s = 0; s < 200; s++) {
    const gr = { s, m: 720, l: 10, p: [1, 1] };
    const a = grantSpecies(gr, 0, 231, false);
    assert.equal(a, grantSpecies(gr, 0, 231, false)); seen.add(a);
    assert.equal(grantSpecies({ ...gr, p: [3, 3] }, 0, 231, false), grantSpecies({ s, m: 720, l: 10 }, 0, 231, false));
  }
  assert.ok([...seen].some((id) => id >= 3136));
  assert.ok([...seen].some((id) => id < 3136));
  setWildMask(null);
});
test('Cromwark removes blanket scaling and attrition; the ocean keeps its separate scaling', () => {
  const entity = () => ({ health: 100, maxHealth: 100, damageScale: 1 });
  setWildHere(true, 4, 'wroth'); const c = entity(); applyWildFoe(c, { own: true, ring: 4 });
  assert.equal(c.maxHealth, 100); assert.equal(c.damageScale, 1);
  setBlightProbe(() => true); assert.equal(foeDamageMult(), 1);
  const clock = createHazeClock(); for (let i = 0; i < 10000; i++) clock.frame(4, 1);
  assert.equal(clock.mult, 1); assert.equal(clock.on, false);
  setWildHere(true, 4, 'ether'); const sea = entity(); applyWildFoe(sea, { own: true, ring: 4 });
  assert.equal(sea.maxHealth, 800); assert.equal(sea.damageScale, 8);
  setWildHere(false); setBlightProbe(() => false);
});
test('no damage during a warning; exactly one hit at release; dodge avoids it', () => {
  const h = harness(), f = foe(); h.step([f], [0, 0, 6], 1.8); assert.equal(h.hits.length, 0);
  h.step([f], [0, 0, 6], 1); assert.equal(h.hits.length, 1);
  h.step([f], [0, 0, 6], .5); assert.equal(h.hits.length, 1);
  const d = harness(), g = foe(); d.step([g], [0, 0, 6], 1.1); d.step([g], [2, 0, 6], 1.9); assert.equal(d.hits.length, 0);
});
test('each reader takes a piercing hit at its own position, even when not the target', () => {
  const owner = harness(), a = foe(); owner.step([a], [0, 0, 4], 1.05);
  const wire = owner.combat.wire(a, (v) => v);
  assert.ok(validFoeRecord({ i: 1, t: a.mobileType, ...wire }));
  for (const z of [4, 12, 20]) {
    const reader = harness(), b = foe(3138, 'other'); reader.combat.hear(b, wire, wire.wo);
    reader.step([b], [0, 0, z], 1.6); assert.equal(reader.hits.length, 1, `reader at ${z}`);
  }
});
test('late join cannot replay a past hit; interrupted casts cannot restart from repeated records', () => {
  const h = harness(), f = foe(3138, 'other');
  const r = { wk: 24, wn: 2, wy: 0, wp: 1.5, wo: origin };
  h.combat.hear(f, r, origin); h.step([f], [0, 0, 4], 1); assert.equal(h.hits.length, 0);
  h.combat.hear(f, { ...r, wn: 3, wp: 0 }, origin); h.step([f], [0, 0, 4], .1, true);
  h.combat.hear(f, { ...r, wn: 3, wp: .1 }, origin); h.step([f], [0, 0, 4], 2); assert.equal(h.hits.length, 0);
});
test('walls clip a beam and block damage through terrain', () => {
  const h = harness(2), f = foe(); h.step([f], [0, 0, 6], 3);
  assert.equal(h.hits.length, 0);
  assert.ok(f._crom.pattern.marks[0].dim.len <= 2);
});
test('cast pressure prevents unlimited simultaneous major casters, permits Frozen support', () => {
  const h = harness(), foes = [foe(3141), foe(3142), foe(3140), foe(3136)];
  h.step(foes, [0, 0, 6], 1.1);
  assert.ok(foes[0]._crom); assert.ok(foes[1]._crom);
  assert.equal(foes[2]._crom, undefined); assert.equal(foes[3]._crom, undefined);
});
test('origin rebases move every locked hazard; death cancels them', () => {
  const h = harness(), f = foe(); h.step([f], [0, 0, 6], 1.1);
  h.combat.offset([100, 2, 100]);
  assert.deepEqual(f._crom.origin, [100, 2, 100]); assert.deepEqual(f._crom.pattern.marks[0].origin, [100, 2, 100]);
  f.dead = true; h.step([f], [100, 2, 106], 2); assert.equal(h.hits.length, 0); assert.equal(h.combat.marks().length, 0);
});
test('wire health bounds accept new elites and reject forged inflated health', () => {
  for (const p of CROMWARK_ROSTER) {
    const r = { t: p.id, z: 1, k: cromwarkHealth(p.id, true) };
    assert.equal(foeStatsRefusal(r), null); assert.ok(foeStatsRefusal({ ...r, k: r.k + 1 }));
  }
});
test('Hulk impacts push, Frozen impacts slow, and Mite advances through collision moves', () => {
  const h = harness(), hulk = foe(3139); h.step([hulk], [0, 0, 4], 3);
  assert.ok(h.effects.some((m) => m.push === 10));
  const f = harness(), ice = foe(3142); f.step([ice], [0, 0, 8], 3);
  assert.ok(f.effects.some((m) => m.slow === true));
  const m = harness(), mite = foe(3137); m.step([mite], [0, 0, 8], 4.5);
  assert.ok(mite.ai.feet[2] > 10 && mite.ai.feet[2] < 14);
});
test('a long render stall cannot replay damage, and paused frames do not advance a cast', () => {
  let clock = 0;
  const hits = [], f = foe(3138);
  const c = createCromwarkCombat({ collider: { raycast: () => Infinity }, hurt: () => hits.push(1),
    renderer: {}, getTexture: async () => ({}), uploadRecordFrame() {}, clock: () => clock });
  const tick = (dt, seconds) => { clock += seconds; c.begin(dt, [f]); c.frame(f, dt, [0, 0, 5], 1.8, false); };
  tick(.05, 1); // Starts, on its monotonic clock.
  tick(0, 10); assert.equal(f._crom.previous, 0); assert.equal(hits.length, 0);
  tick(.05, 1.3); // A hitch crossed the release, but the player did not see the intervening frames.
  assert.equal(hits.length, 0);
});
test('ranged target distance survives wire encoding and invalid remote origins are refused', () => {
  const h = harness(), bishop = foe(3140); h.step([bishop], [0, 0, 18], 1.1);
  const wire = h.combat.wire(bishop, (v) => v);
  const remote = harness(), puppet = foe(3140, 'other'); remote.combat.hear(puppet, wire, wire.wo);
  assert.deepEqual(puppet._crom.pattern.marks[0].origin, bishop._crom.pattern.marks[0].origin);
  remote.combat.hear(puppet, { ...wire, wn: 99 }, [100, 0, 100]); assert.equal(puppet._crom, null);
});
test('Judge creates visible projectile batches, hits through its live controller and cleans them up', async () => {
  const h = harness(), judge = foe(3136);
  h.step([judge], [0, 0, 6], 1.1);
  await Promise.resolve(); // The registered orb archive is ready before release.
  h.step([judge], [0, 0, 6], 2.5);
  assert.ok(h.combat.batches().length > 0);
  assert.ok(h.hits.length > 0);
  judge.dead = true; h.step([judge], [0, 0, 6], .1);
  assert.equal(h.combat.batches().length, 0);
  h.combat.destroy();
});
test('a missing projectile image cannot become an invisible damaging attack', async () => {
  const f = foe(3136), hits = [];
  const c = createCromwarkCombat({ collider: { raycast: () => Infinity }, hurt: () => hits.push(1),
    renderer: { textures: new Set() }, getTexture: async () => ({ getSize: () => ({ width: 1, height: 1 }) }), uploadRecordFrame() {} });
  for (let i = 0; i < 140; i++) { c.begin(.05, [f]); c.frame(f, .05, [0, 0, 6], 1.8, false); await Promise.resolve(); }
  assert.equal(hits.length, 0); assert.equal(c.batches().length, 0);
});

test('Cromwark packs fill to their target and Titanheart caps damage on variants', () => {
  assert.deepEqual(cromwarkPack([3136, 7, 3142], 5), [3136, 7, 3142, 3136, 7]);
  assert.deepEqual(cromwarkPack([], 20), []);
  const titan = { mobileType: 3136, eliteFoe: true, titanheart: true, maxHealth: 200 };
  assert.ok(cromwarkTitanheart(titan));
  assert.equal(cromwarkTitanheart({ ...titan, eliteFoe: false }), false);
  assert.equal(cromwarkTitanheart({ ...titan, mobileType: 7 }), false);
  assert.equal(cromwarkTitanDamage(titan, 100), 50);
  assert.equal(cromwarkTitanDamage(titan, 12), 12);
});
