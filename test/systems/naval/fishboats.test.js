// FISH-BOATS (2026-10-27; bible/03-World/Naval-Combat.md, FISH-BOATS) - a port's fishing boats: the day's fleet off its
// harbour's key (systems/naval/fishingBoats.js), the water each keeps, her day sailed by the real captains (navalAI.js
// stepCaptain over shipLife.js stepErrand), stood by the real naval host over Come Sail Away's pool (test/navalSea.mjs)
// and in a room (test/navalRoom.mjs), her hold and her word - on SHIP-LIFE's own coast (shiplife.test.js's).
import '../../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  fishersOf, fishingWaters, fishingErrand, stepFishing, fisherCatch, fisherPlace, outwardOf, berthSpan, clearOfBerths, fishingHeld,
  FISH_ROLL, FISH_SMACK_SHARE, FISH_GROUND_M, FISH_GROUND_SPREAD, FISH_RING, FISH_ANCHOR_M, FISH_CATCH, FISH_BERTH_CLEAR, FISH_SPACING, FISH_STROKE,
} from '../../../src/systems/naval/fishingBoats.js';
import { findHarbour, createWaterGrid, footprintClear, berthSize, REACH_M } from '../../../src/systems/naval/shipLife.js';
import { createSeaShip, stepCaptain, WIND_RATED, rangeOfHull, SWEEP_WAY } from '../../../src/systems/naval/navalAI.js';
import { SHIP_CLASSES, HULL, classById, classFor, batteriesOf, shipNames, classLine, fisherNameOf, FISHER_WORDS, NAME_WORDS, FISH_OAR_MPS, LEGEND_LEVEL, FISHER_LEVEL } from '../../../src/systems/naval/navalShips.js';
import { encounterClasses } from '../../../src/systems/naval/navalDirector.js';
import { flotsamKeys } from '../../../src/systems/naval/navalPlunder.js';
import { navalWireRecord, validNavalRecord } from '../../../src/systems/naval/navalWire.js';
import { SHIP_STATES } from '../../../src/systems/naval/navalDamage.js';
import { HARBOUR_LEAVE, OWNER_SWEEP_S, SHIP_FADE_S } from '../../../src/scenes/naval/navalHost.js';
import { createFishingFleet } from '../../../src/scenes/naval/fishingFleet.js';
import { mulberry32 } from '../../../src/combat/blood/bloodArt.js';
import { sea } from '../../navalSea.mjs';
import { room } from '../../navalRoom.mjs';

/** SHIP-LIFE's coast: land north of z = 200, and a headland x 300-400 reaching south to z = -300. */
const coast = (x, z) => !(z > 200 || (x > 300 && x < 400 && z > -300));
const TOWN = { minX: -100, maxX: 100, minZ: 220, maxZ: 420 };
const PORT = { key: 'port:1', rect: TOWN };
const harbour = findHarbour({ rect: TOWN, isWater: coast });
const grids = new Map();
const grid = (h) => grids.get(h) ?? (grids.set(h, createWaterGrid({ isWater: coast, hull: h })), grids.get(h));
const watersOf = (f, h = harbour, isWater = coast) => fishingWaters({ harbour: h, i: f.i, seed: f.seed, hull: classById(f.classId).hull, isWater, grid: grid(classById(f.classId).hull) });
const NAVAL_HOST = readFileSync(new URL('../../../src/scenes/naval/navalHost.js', import.meta.url), 'utf8');

test('FISH-BOATS the fleet: a harbour\'s boats a day off its key and the day - the same for every player, FISH_ROLL of them, each a smack on FISH_SMACK_SHARE of her own seed\'s draw, else a skiff; another day, another fleet (mutants: the roll\'s top, the roll\'s floor, the smacks\' share, the day unread)', () => {
  assert.deepEqual(fishersOf('port:1', 7), fishersOf('port:1', 7), 'one fleet for every client');
  assert.notDeepEqual(fishersOf('port:1', 7).map((f) => f.seed), fishersOf('port:1', 8).map((f) => f.seed), 'a new day\'s');
  assert.notDeepEqual(fishersOf('port:1', 7).map((f) => f.seed), fishersOf('port:2', 7).map((f) => f.seed), 'another port\'s');
  const sizes = new Set(), kinds = { fishingSkiff: 0, fishingSmack: 0 };
  for (let day = 0; day < 400; day++) {
    const fleet = fishersOf('port:9', day);
    sizes.add(fleet.length);
    fleet.forEach((f, i) => { assert.equal(f.i, i); kinds[f.classId]++; });
    assert.equal(new Set(fleet.map((f) => f.seed)).size, fleet.length, 'each her own seed');
  }
  assert.deepEqual([...sizes].sort(), [FISH_ROLL[0], 3, FISH_ROLL[1]]);
  const share = kinds.fishingSmack / (kinds.fishingSmack + kinds.fishingSkiff);
  assert.ok(Math.abs(share - FISH_SMACK_SHARE) < 0.06, `smacks ${share.toFixed(3)}`);
});

test('FISH-BOATS the classes: a Fishing Skiff (Come Sail Away\'s Rowboat, two at her oars, no gun) and a Fishing Smack (the Large Boat under sail, her swivels) - lawful merchantmen never drawn by any level or weight, their names their own trade\'s, their range a sloop\'s so no hull\'s fighting range moves; a skiff\'s way her oars\' alone (mutants: the skiff given sails\' way, the skiff tacked, a fisher drawn by level, the name forms\' merchantmen)', () => {
  const skiff = classById('fishingSkiff'), smack = classById('fishingSmack');
  assert.deepEqual([skiff.hull, skiff.faction, skiff.fisher, skiff.weight, skiff.minLevel], [HULL.Rowboat, 'merchant', true, 0, FISHER_LEVEL]);
  assert.deepEqual([smack.hull, smack.faction, smack.fisher, smack.weight, smack.minLevel], [HULL.LargeBoat, 'merchant', true, 0, FISHER_LEVEL]);
  assert.equal(FISHER_LEVEL, LEGEND_LEVEL);
  assert.equal(batteriesOf(skiff.hull).length, 0, 'no gun in a rowboat');
  assert.ok(batteriesOf(smack.hull).length > 0, 'the Large Boat\'s swivels');
  assert.deepEqual([skiff.title, smack.title, classLine(skiff)], ['Fishing Skiff', 'Fishing Smack', 'Fishing Skiff']);
  assert.equal(rangeOfHull(HULL.Rowboat), 50); assert.equal(rangeOfHull(HULL.LargeBoat), 50);
  for (let level = 1; level <= 30; level += 1) {
    for (let k = 0; k < 40; k++) {
      const r = k / 40;
      assert.ok(!classFor('merchant', level, r).fisher, `classFor at ${level}`);
      const e = encounterClasses('plunder', level, mulberry32(level * 97 + k));
      assert.ok(!e?.quarry?.fisher, 'never a pirate\'s quarry the director launches');
    }
  }
  // her name: her trade's own forms, off her name's stream
  for (let seed = 1; seed < 200; seed++) {
    const n = shipNames(smack, seed).name;
    assert.match(n, /^The /);
    const words = n.slice(4).split(' ');
    assert.ok(words.some((w) => FISHER_WORDS.catches.includes(w) || FISHER_WORDS.gear.includes(w)), `${n}: a fishing boat's`);
    assert.ok(words.every((w) => [...FISHER_WORDS.catches, ...FISHER_WORDS.gear, ...NAME_WORDS.fair, ...NAME_WORDS.callings, ...NAME_WORDS.ports].includes(w)), n);
  }
  assert.equal(fisherNameOf(mulberry32(3)), fisherNameOf(mulberry32(3)));
  // a skiff pulled: the same way in every wind, and none with the oars shipped
  const ways = [];
  for (const wind of [[0, 0, WIND_RATED], [WIND_RATED, 0, 0], [0, 0, -WIND_RATED], [0, 0, 0]]) {
    const ship = createSeaShip({ id: 's', seed: 3, classId: 'fishingSkiff', pos: [0, 0, -400], yaw: 0 });
    ship.errand = { kind: 'fish', harbour: 'port:1', to: [0, 172], at: [0, -900], yaw: 0, path: [[0, -400], [0, -900]], i: 1, ringing: false };
    const life = { harbour: () => harbour, grid, free: () => true, harbours: () => [], lights: false };
    for (let t = 0; t < 30; t += 0.1) stepCaptain(ship, { now: t, dt: 0.1, seaY: 0, wind, isWater: () => true, contacts: [], random: () => 0.5, life });
    ways.push(+ship.speed.toFixed(3), +ship.pos[2].toFixed(1));
  }
  assert.ok(ways[0] > 1 && ways[0] <= Math.max(SWEEP_WAY, FISH_OAR_MPS) + 1e-6, `her way ${ways[0]}`);
  assert.deepEqual(ways.slice(2, 4), ways.slice(0, 2)); assert.deepEqual(ways.slice(4, 6), ways.slice(0, 2)); assert.deepEqual(ways.slice(6, 8), ways.slice(0, 2));
});

test('FISH-BOATS the water each keeps: her ANCHORAGE past the berths\' ends along the shore, a side a slot and FISH_SPACING on, FISH_BERTH_CLEAR off every berth\'s ship and her way in, her hull afloat and the water\'s way from the mouth to it; her GROUND off the mouth within FISH_GROUND_M, bearing within FISH_GROUND_SPREAD of the harbour\'s outward way, the open water from the mouth to it; none where the harbour keeps no room (mutants: the berths\' clearance, the side, the spacing, the ground\'s spread, the ground\'s reach)', () => {
  const n = outwardOf(harbour), u = [n[1], -n[0]];
  const length = berthSize(harbour.hull).bowZ - berthSize(harbour.hull).aftZ;
  const span = berthSpan(harbour, n, u, length);
  const on = (p) => (p[0] - harbour.mouth[0]) * u[0] + (p[1] - harbour.mouth[1]) * u[1];
  const seen = [];
  for (let i = 0; i < 4; i++) {
    for (const classId of ['fishingSkiff', 'fishingSmack']) {
      const hull = classById(classId).hull;
      const w = fishingWaters({ harbour, i, seed: 1000 + i, hull, isWater: coast, grid: grid(hull) });
      assert.ok(w, `slot ${i} ${classId}`);
      assert.ok(footprintClear(w.anchor, w.yaw, hull, coast), 'afloat at anchor');
      assert.ok(clearOfBerths(w.anchor, harbour, length), 'clear of the berths and their ways in');
      const a = on(w.anchor);
      if (i % 2 === 0) assert.ok(Math.abs(a - (span.hi + FISH_BERTH_CLEAR + Math.floor(i / 2) * FISH_SPACING)) < 1e-6, `slot ${i} past the berths on one side`);
      else assert.ok(Math.abs(a - (span.lo - FISH_BERTH_CLEAR - Math.floor(i / 2) * FISH_SPACING)) < 1e-6, `slot ${i} past them on the other`);
      assert.ok(grid(hull).path(harbour.mouth, w.anchor), 'the mouth reaches her anchorage');
      const d = Math.hypot(w.ground[0] - harbour.mouth[0], w.ground[1] - harbour.mouth[1]);
      assert.ok(d >= FISH_GROUND_M[0] - 1e-6 && d <= FISH_GROUND_M[1] + 1e-6, `her ground ${d.toFixed(0)} m off the mouth`);
      const b = Math.atan2(w.ground[0] - harbour.mouth[0], w.ground[1] - harbour.mouth[1]), out = Math.atan2(n[0], n[1]);
      assert.ok(Math.abs(Math.atan2(Math.sin(b - out), Math.cos(b - out))) <= FISH_GROUND_SPREAD + 1e-9, 'out to sea');
      assert.ok(grid(hull).clear(harbour.mouth, w.ground), 'open water to it');
      seen.push(w.anchor.map((x) => Math.round(x)).join(','));
    }
  }
  assert.equal(new Set(seen.filter((_, k) => k % 2 === 0)).size, 4, 'four slots, four anchorages');
  // a harbour whose shore past its berths is land - no room in the roads
  const inlet = (x, z) => coast(x, z) && x > -260 && x < 180;
  const tight = findHarbour({ rect: TOWN, isWater: inlet });
  assert.ok(tight?.berths?.length);
  const g = createWaterGrid({ isWater: inlet, hull: 0 });
  assert.equal(fishingWaters({ harbour: tight, i: 0, seed: 1, hull: 0, isWater: inlet, grid: g }), null);
  assert.equal(fishingWaters({ harbour: null, i: 0, seed: 1, hull: 0, isWater: inlet, grid: g }), null);
});

test('FISH-BOATS THE DAY, by the real captains: at anchor through the lanterns\' hours, held still; out when they go out to her ground, worked round its ring at FISH_STROKE; home when they are lit, and held at her anchorage again - in four winds, a smack under sail and on her sweeps, a skiff at her oars, never a stride over land; a fight that took her off her ring brings her back by the water\'s way (mutants: the day\'s turns, the ring, the sweeps home, the last leg\'s swing, the hold at anchor)', () => {
  for (const f of fishersOf('port:1', 1)) {
    const w = watersOf(f);
    for (const wind of [[0, 0, WIND_RATED], [WIND_RATED, 0, 0], [0, 0, -WIND_RATED], [0, 0, 0]]) {
      const life = { harbour: (k) => (k === 'port:1' ? harbour : null), grid, free: () => true, harbours: () => [{ key: 'port:1', harbour }], lights: true };
      const at = fishingErrand({ key: 'port:1', waters: w, lights: true });
      const ship = createSeaShip({ id: 's', seed: f.seed, classId: f.classId, pos: [at.pos[0], 0, at.pos[1]], yaw: at.yaw, errand: at.errand });
      const world = { now: 0, dt: 0.1, seaY: 0, wind, isWater: (x, z) => coast(x, z), contacts: [], random: () => 0.5, life };
      const seen = [];
      let worked = 0, ringMax = 0, held = null;
      for (let t = 0; t < 3000; t += 0.1) {
        world.now = t;
        life.lights = !(t >= 10 && t < 1800);
        stepCaptain(ship, world);
        assert.ok(coast(ship.pos[0], ship.pos[2]), `${f.classId} over land at ${ship.pos}`);
        const k = ship.errand?.kind;
        if (seen[seen.length - 1] !== k) seen.push(k);
        if (t < 10) assert.ok(Math.hypot(ship.pos[0] - w.anchor[0], ship.pos[2] - w.anchor[1]) < 0.5 && ship.speed === 0, 'held at anchor');
        if (k === 'fish' && ship.errand.ringing) { worked += 0.1; ringMax = Math.max(ringMax, Math.hypot(ship.pos[0] - w.ground[0], ship.pos[2] - w.ground[1])); }
        if (k === 'anchor' && t > 1800 && !held) held = t;
      }
      assert.deepEqual(seen, ['anchor', 'fish', 'home', 'anchor'], `${f.classId} in ${wind}: ${seen}`);
      assert.ok(worked > 600, `${f.classId} worked her ground ${worked.toFixed(0)} s`);
      assert.ok(ringMax < FISH_RING * 2 + REACH_M, `on her ring: ${ringMax.toFixed(0)} m`);
      assert.ok(Math.hypot(ship.pos[0] - w.anchor[0], ship.pos[2] - w.anchor[1]) < 0.5 && ship.speed === 0, 'home and held');
    }
  }
  // the pure law's own turns, and a ring a fight let go
  const e = { kind: 'fish', harbour: 'k', to: [0, 0], at: [0, -500], yaw: 0, path: null, i: 0, ringing: true };
  const ship = { seed: 1, errand: e };
  const tools = { here: [0, -480], plan: (g, s) => ({ goal: g, sails: s }), way: (to) => to };
  const p = stepFishing(ship, 0.1, { lights: false }, tools);
  assert.equal(e.ringing, true, 'near her ground: on her ring again');
  assert.equal(p.sails, FISH_STROKE);
  assert.equal(fishingHeld(e), true);
  assert.equal(fishingHeld({ kind: 'home' }), false);
  stepFishing(ship, 0.1, { lights: true }, tools);
  assert.equal(e.kind, 'home');
  const far = { seed: 1, errand: { kind: 'anchor', harbour: 'k', to: [0, 0], at: [0, -500], yaw: 0, path: null, i: 0 } };
  const r = stepFishing(far, 0.1, { lights: true }, { ...tools, here: [0, FISH_ANCHOR_M * 3] });
  assert.equal(far.errand.kind, 'home', 'moved off her anchorage: home');
  assert.equal(r.sweeps, SWEEP_WAY);
});

test('FISH-BOATS by the real host: ashore in a port, its day\'s boats stand where the day finds them - on their ground while the lanterns are out, at anchor with their canvas stowed in the lanterns\' hours - the same boats in the same water on another client; never the sea\'s traffic (the director counts none and lets none go); past HARBOUR_LEAVE they fade, and back they stand again the same; one sunk is not stood again today (mutants: the fleet unstood, the lights unread, the director counting them, the lost not kept)', async () => {
  const stand = async (where = {}) => {
    const h = await sea({ hull: null, water: coast, settings: { ShipsAtSea: 'few' }, where: { day: 1, ...where } });
    h.view.feet = [0, 0, 300];
    h.deps.harbourNear = () => PORT;
    return h;
  };
  const fleet = fishersOf('port:1', 1);
  const fishers = (h) => [...h.host._sea.values()].filter((e) => e.ship.cls.fisher);
  const h = await stand();
  h.run(1);
  assert.equal(fishers(h).length, fleet.length, 'the day\'s boats');
  for (const e of fishers(h)) {
    const f = fleet.find((x) => x.seed === e.ship.seed);
    assert.ok(f, 'one of the day\'s');
    assert.equal(e.ship.cls.id, f.classId);
    assert.equal(e.fisher, 'port:1');
    assert.equal(e.ship.errand.kind, 'fish');
    const w = watersOf(f);
    assert.ok(Math.hypot(e.ship.pos[0] - w.ground[0], e.ship.pos[2] - w.ground[1]) < FISH_RING + REACH_M + 5, 'on her ground');
  }
  const key = (hh) => fishers(hh).map((e) => `${e.ship.seed}:${e.ship.cls.id}:${e.ship.pos.map((v) => v.toFixed(1)).join(',')}`).sort().join('|');
  const other = await stand();
  other.run(1);
  assert.equal(key(other), key(h), 'another client stands the same boats in the same water');
  // the lanterns' hours: at anchor, canvas stowed
  const night = await stand({ cityLights: true });
  night.run(1);
  assert.equal(fishers(night).length, fleet.length);
  for (const e of fishers(night)) {
    const w = watersOf(fleet.find((x) => x.seed === e.ship.seed));
    assert.equal(e.ship.errand.kind, 'anchor');
    assert.ok(Math.hypot(e.ship.pos[0] - w.anchor[0], e.ship.pos[2] - w.anchor[1]) < 0.5 && e.ship.sails === 0, 'at anchor, sails stowed');
  }
  night.run(20);
  for (const e of fishers(night)) assert.equal(e.ship.speed, 0, 'held');
  // never the sea's traffic: a player on the water off the port meets the director's own as before
  const w = await sea({ hull: 2, water: coast, settings: { ShipsAtSea: 'few' }, where: { day: 1 } });
  w.boat.GameObject.position = [0, 0, -150]; w.view.feet = [0, 0, -150];
  w.deps.harbourNear = () => PORT;
  w.run(200);
  assert.equal(fishers(w).length, fleet.length, 'the boats kept - the director lets none go');
  const open = [...w.host._sea.values()].filter((e) => e.ship.errand?.kind !== 'moored' && !e.ship.cls.fisher && e.ship.damage.state === SHIP_STATES.afloat);
  assert.ok(open.length >= 1, `the sea's own traffic beside them: ${open.length}`);
  // far off and back
  const seeds = key(h).replace(/:[^|]*$/gm, '');
  h.view.feet = [0, 0, 300 + HARBOUR_LEAVE + 800];
  h.run(1 + SHIP_FADE_S);
  assert.equal(fishers(h).length, 0, 'gone once the port is far');
  h.view.feet = [0, 0, 300];
  h.run(1);
  assert.equal(fishers(h).length, fleet.length, 'stood again');
  // one sunk: not stood again today
  const first = fishers(h)[0];
  first.ship.damage.scuttle();   // she goes down (a pirate's fire, the player's)
  assert.notEqual(first.ship.damage.state, SHIP_STATES.afloat, 'she is lost');
  h.run(1);
  h.view.feet = [0, 0, 300 + HARBOUR_LEAVE + 800];
  h.run(1 + SHIP_FADE_S);
  for (const e of [...h.host._sea.values()]) if (e.ship.seed === first.ship.seed) h.host._sea.delete(e.id);
  h.view.feet = [0, 0, 300];
  h.run(1);
  assert.ok(!fishers(h).some((e) => e.ship.seed === first.ship.seed), 'not stood again the same day');
  assert.ok(seeds.length > 0);
});

test('FISH-BOATS A BOAT TAKEN OVER: her errand never rides the word - the heir who takes a departed stander\'s fishing boat finds her harbour and slot off her seed (fisherPlace) and draws her day again where she lies; the other client stands none of its own while the first stands them (mutants: the place unfound, the day\'s errand undrawn)', async () => {
  const r = await room([{ id: 'a', hull: null, water: coast, where: { day: 1 } }, { id: 'b', hull: null, water: coast, where: { day: 1 } }]);
  const A = r.get('a'), B = r.get('b');
  for (const c of [A, B]) { c.s.view.feet = [0, 0, 300]; c.s.deps.harbourNear = () => PORT; }
  r.run(3);
  const mine = [...A.s.host._sea.values()].filter((e) => e.ship.cls.fisher);
  assert.equal(mine.length, fishersOf('port:1', 1).length);
  assert.equal([...B.s.host._sea.values()].filter((e) => !e.owner && e.ship.cls.fisher).length, 0, 'b stands none of her own');
  A.present = false;
  r.run(OWNER_SWEEP_S + 1);
  const adopted = [...B.s.host._sea.values()].filter((e) => !e.owner && e.ship.cls.fisher);
  assert.equal(adopted.length, mine.length, 'b took every one over');
  for (const e of adopted) {
    const was = mine.find((x) => x.ship.seed === e.ship.seed);
    assert.equal(e.fisher, 'port:1', 'her harbour\'s still');
    assert.equal(e.ship.errand?.kind, 'fish');
    assert.deepEqual(e.ship.errand.at.map((v) => Math.round(v)), was.ship.errand.at.map((v) => Math.round(v)), 'her own ground');
    assert.deepEqual(e.ship.errand.to.map((v) => Math.round(v)), was.ship.errand.to.map((v) => Math.round(v)), 'her own anchorage');
  }
  B.s.view.feet = [0, 0, 300 + HARBOUR_LEAVE + 800];
  r.run(1 + SHIP_FADE_S);
  assert.equal([...B.s.host._sea.values()].filter((e) => !e.owner && e.ship.cls.fisher).length, 0, 'dropped past HARBOUR_LEAVE as her roller\'s were');
  // the place, pure: today's or yesterday's fleet
  const f = fishersOf('port:1', 4)[1];
  assert.deepEqual(fisherPlace(f.seed, [{ key: 'port:9' }, { key: 'port:1' }], [5, 4]), { key: 'port:1', i: 1, classId: f.classId, day: 4 });
  assert.equal(fisherPlace(12345, [{ key: 'port:1' }], [4]), null);
});

test('FISH-BOATS her hold is her catch: a fishing boat taken gives up fish - FISH_CATCH of them by her class, off her seed - and sunk, none of it floats free (her wreckage is still salvage); her word carries her class past the wire\'s older rows and reads back (mutants: the catch\'s range, the hold drawn as a merchantman\'s, a fisher\'s casks)', () => {
  const made = createFishingFleet({ sea: new Map(), harbours: new Map(), launch: () => null, retire() {}, adopt() {}, grid, isWater: coast, where: () => ({ day: 1 }), rolls: () => true, feet: () => [0, 0, 0], seaStates: SHIP_STATES, reach: { stand: 1, leave: 2 } });
  for (const id of ['fishingSkiff', 'fishingSmack']) {
    const counts = new Set();
    for (let seed = 1; seed < 300; seed++) {
      const { count } = fisherCatch(id, seed);
      assert.ok(count >= FISH_CATCH[id][0] && count <= FISH_CATCH[id][1]);
      counts.add(count);
    }
    assert.equal(counts.size, FISH_CATCH[id][1] - FISH_CATCH[id][0] + 1, `${id}: every catch in the range`);
    const items = made.catchOf(classById(id), 7);
    const total = items.reduce((s, it) => s + (it.stackCount ?? 1), 0);
    assert.equal(total, fisherCatch(id, 7).count);
    assert.ok(items.every((it) => /Fish/.test(it.name)), items.map((it) => it.name).join());
    assert.deepEqual(flotsamKeys(classById(id), 7), [], 'her catch goes down with her');
  }
  assert.ok(flotsamKeys(classById('merchantCoaster'), 7).length > 0, 'a merchantman\'s still floats');
  assert.match(NAVAL_HOST, /const holdOf = \(cls, seed, generate\) => \(cls\.fisher \? fishers\.catchOf\(cls, seed\) : drawHold\(cls, seed, generate\)\);/);
  assert.match(NAVAL_HOST, /entry\.prize = \{ hold: holdOf\(entry\.ship\.cls, entry\.ship\.seed,/);
  // the word: her class row the last two, read back
  const word = navalWireRecord({ ships: [{ n: 3, classId: 'fishingSmack', variant: 0, pos: [10, 0, 20], yaw: 0.5, speed: 1, sails: 0.4, hull: 1, sail: 1, crew: 1, state: 'afloat', heel: 0, seed: 77, fire: false, runOut: 0, gen: 0, region: 17 }] });
  assert.equal(word.s[0][1], SHIP_CLASSES.length - 1);
  assert.equal(validNavalRecord(JSON.parse(JSON.stringify(word))).ships[0].classId, 'fishingSmack');
});

test('FISH-BOATS by source: the naval host wires the fleet - built once over its own sea, stood each frame after the harbour\'s moored ships, the captains handed the lanterns\' hours, a boat taken over handed her day\'s errand, her hold her catch, the sea\'s clear forgetting the rolls', () => {
  assert.match(NAVAL_HOST, /const fishers = createFishingFleet\(\{ sea, harbours, launch, retire, adopt, grid: gridOf,/);
  assert.match(NAVAL_HOST, /harbourFrame\(seaY\);[^\n]*\n {4}fishers\.frame\(seaY\);/);
  assert.match(NAVAL_HOST, /life\.lights = !!where\(\)\.cityLights;/);
  assert.match(NAVAL_HOST, /if \(ship\.cls\.fisher\) return fishers\.errandOf\(ship\);/);
  assert.match(NAVAL_HOST, /for \(const x of ships\) \{ const f = sea\.get\(x\.id\); if \(f\?\.ship\.cls\.fisher\) \{ x\.berthed = true; x\.engaged \|\|= !!f\.fisher && !x\.theirs; \} \}/);
  assert.match(NAVAL_HOST, /if \(e\.ship\.cls\.fisher\) e\.fisher = e\.ship\.errand\?\.harbour \?\? null;/);
  assert.match(NAVAL_HOST, /rolled = new WeakSet\(\); grids = new Map\(\);[^\n]*\n {4}fishers\.clear\(\);/);
});
