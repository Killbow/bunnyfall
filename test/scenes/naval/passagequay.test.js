// PASSAGE-QUAY (2026-10-27; bible/03-World/Passage.md, PASSAGE-QUAY) - A BOOKED SHIP COMES IN TO HER PORT'S QUAY: the tow
// (scenes/naval/passageQuay.js) over the real naval host and Come Sail Away's pool on SHIP-LIFE's coast (test/navalSea.mjs -
// quays.test.js's dockSea, the warp seam laid on her as the mod lays it), and the passage's half (scenes/naval/passageHost.js)
// over stand-ins for the sea and the journey.
import '../../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sea } from '../../navalSea.mjs';
import { findHarbour, alongside } from '../../../src/systems/naval/shipLife.js';
import { FAST_M, FAST_DEG } from '../../../src/systems/naval/quays.js';
import { quatOfYaw } from '../../../src/systems/naval/navalAI.js';
import { hullBuild } from '../../../src/systems/naval/navalShips.js';
import { Boat } from '../../../src/systems/comeSailAway/comeSailAwayBoat.js';
import { BRING_IN_M, TOW_WAY, TOW_FOUL_S, TOW_FOUL_M } from '../../../src/scenes/naval/passageQuay.js';
import { createPassageHost } from '../../../src/scenes/naval/passageHost.js';
import { PASSAGE_TEXT, PASSAGE_RESUME_S } from '../../../src/systems/naval/passage.js';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
/** SHIP-LIFE's coast: land north of z = 200, and a headland x 300-400 reaching south to z = -300. */
const coast = (x, z) => !(z > 200 || (x > 300 && x < 400 && z > -300));
const TOWN = { minX: -100, maxX: 100, minZ: 220, maxZ: 420 };
const HARBOUR = findHarbour({ rect: TOWN, isWater: coast });
const DEG = Math.PI / 180;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const yawOf = (q) => { const x = 2 * (q[0] * q[2] + q[3] * q[1]), z = 1 - 2 * (q[0] * q[0] + q[1] * q[1]); return Math.atan2(x, z); };
const RECORD = { to: { name: 'Holwych', px: 1, py: 1 }, ship: 'The Fair Silk', captain: 'Ana Rhea', fare: 50 };

/** The real naval host over the coast, my booked ship (`hull`) at the helm `at` off the mouth, the port near. */
async function tow(o = {}) {
  const h = await sea({ hull: o.hull ?? 2, water: coast, settings: { ShipsAtSea: 'off' } });
  h.deps.harbourNear = () => ({ key: 'port:1', name: o.port ?? 'Holwych', rect: TOWN });
  h.deps.shipName = () => 'The Fair Silk';
  h.boat.charter = o.record ?? RECORD;
  h.boat.GameObject.position = o.at ?? [HARBOUR.mouth[0], 0, HARBOUR.mouth[1] - 400];
  h.boat.GameObject.rotation = quatOfYaw(0);
  h.view.feet = [...h.boat.GameObject.position];
  h.run(0.2);
  return h;
}
/** Come Sail Away's half: the host's warp laid on her for `seconds` (quays.test.js's warpFor), what she passed through kept. */
function warpFor(h, seconds, seen = { land: 0, path: [], steps: 0 }, untilFast = true) {
  for (let t = 0; t < seconds; t += 0.1) {
    const w = h.host.warp(h.boat, { struck: true, oars: false, dt: 0.1 });
    if (!w) return seen;
    seen.steps++;
    h.boat.GameObject.position = [w.pos[0], h.boat.GameObject.position[1], w.pos[1]];
    h.boat.GameObject.rotation = w.rotation;
    h.view.feet = [...h.boat.GameObject.position];
    const p = h.boat.GameObject.position, y = yawOf(w.rotation), b = hullBuild(h.boat.hull);
    for (const z of [b.bowZ, 0, b.aftZ]) if (!coast(p[0] + Math.sin(y) * z, p[2] + Math.cos(y) * z)) seen.land++;
    seen.path.push([p[0], p[2]]);
    if (untilFast && h.host.berthing(h.boat) === 'fast') return seen;
  }
  return seen;
}

test('PASSAGE-QUAY THE TOW, by the real naval host: a booked ship within BRING_IN_M of her port\'s harbour, a berth free there - brought in along the water\'s way to the berth\'s approach and in along the shore, never her stem nor her stern over land, at no more than TOW_WAY; made fast alongside the quay by QUAYS\' own warp, her gangway run out (mutants: the reach, the way unplanned, the way\'s pace, the dock not asked, the quay\'s gangway)', async () => {
  for (const hull of [2, 1, 4]) {
    const h = await tow({ hull });
    assert.equal(h.host.bringIn(h.boat), true, `hull ${hull}: brought in`);
    assert.equal(h.host.berthing(h.boat), 'in');
    const seen = warpFor(h, 900);
    assert.equal(h.host.berthing(h.boat), 'fast', `hull ${hull}: made fast`);
    assert.equal(seen.land, 0, `hull ${hull}: never over land`);
    for (let i = 1; i < seen.path.length; i++) assert.ok(Math.hypot(seen.path[i][0] - seen.path[i - 1][0], seen.path[i][1] - seen.path[i - 1][1]) <= TOW_WAY * 0.1 + 1e-3, 'her way at TOW_WAY at most');   // a float32 place (Come Sail Away's own)
    // alongside the berth she was given, along its line
    const p = h.boat.GameObject.position, y = yawOf(h.boat.GameObject.rotation);
    const at = HARBOUR.berths.map((b, i) => ({ i, b, d: Math.hypot(alongside(b, hull, HARBOUR.hull)[0] - p[0], alongside(b, hull, HARBOUR.hull)[1] - p[2]) })).sort((a, b) => a.d - b.d)[0];
    assert.ok(at.d <= FAST_M, `alongside her berth: ${at.d.toFixed(2)} m`);
    assert.ok(Math.min(Math.abs(wrap(y - at.b.yaw)), Math.abs(wrap(y - at.b.yaw - Math.PI))) <= FAST_DEG * DEG, 'along its line');
    const g = h.host.gangways().find((x) => x.boat === h.boat);
    assert.ok(g, `hull ${hull}: her gangway run out to the quay`);
    // made fast she is held there while she stands at the helm - QUAYS' warp settling her the last of FAST_M first
    warpFor(h, 30, undefined, false);
    const held = [...h.boat.GameObject.position];
    warpFor(h, 5, undefined, false);
    assert.ok(Math.hypot(h.boat.GameObject.position[0] - held[0], h.boat.GameObject.position[2] - held[2]) < 0.05, 'held made fast');
    // her passage over: no tow
    h.host.forgetBoat(h.boat.uid);
    assert.equal(h.host.berthing(h.boat), null);
  }
});

test('PASSAGE-QUAY NEVER: a boat of mine (no charter), a passage to another port, her port\'s harbour past BRING_IN_M, the sea fight switched off - none is brought in, and the warp seam is QUAYS\' own for them (mutants: the charter unread, the port unmatched, the reach unread, the switch unread)', async () => {
  const mine = await tow({ record: null });
  mine.boat.charter = undefined;
  assert.equal(mine.host.bringIn(mine.boat), false, 'a boat of mine');
  const other = await tow({ record: { ...RECORD, to: { ...RECORD.to, name: 'Wayrest' } } });
  assert.equal(other.host.bringIn(other.boat), false, 'another port\'s passage');
  const far = await tow({ at: [HARBOUR.mouth[0], 0, HARBOUR.mouth[1] - BRING_IN_M - 50] });
  assert.equal(far.host.bringIn(far.boat), false, 'past BRING_IN_M');
  const near = await tow({ at: [HARBOUR.mouth[0], 0, HARBOUR.mouth[1] - BRING_IN_M + 50] });
  assert.equal(near.host.bringIn(near.boat), true, 'within it');
  const off = await tow();
  off.host.setEnabled(false);
  assert.equal(off.host.bringIn(off.boat), false, 'the sea fight off');
  assert.equal(off.host.berthing(off.boat), null);
});

test('PASSAGE-QUAY A FOUL WAY: a hull lying across her way within TOW_FOUL_M of her stem holds her where she lies; held TOW_FOUL_S her master gives the quay up - said once as foul, never asked again of that harbour for her passage, and the warp seam is QUAYS\' own again (mutants: the hull unread, the hold, the refusal kept)', async () => {
  const h = await tow();
  assert.equal(h.host.bringIn(h.boat), true);
  // a peer's galleon lying across her way, a hull's length ahead of her stem
  const peer = h.pool.spawnPeerNow(new Boat(2, 0));
  const p = h.boat.GameObject.position, bow = hullBuild(2).bowZ;
  peer.GameObject.position = [p[0], 0, p[2] + bow + TOW_FOUL_M * 0.6];
  peer.GameObject.rotation = quatOfYaw(Math.PI / 2);
  h.deps.peerBoats = () => [{ id: 'p', pos: [...peer.GameObject.position], vel: [0, 0, 0], speed: 0, hull: 2, yaw: Math.PI / 2, boat: peer }];
  const before = [...h.boat.GameObject.position];
  warpFor(h, 5);
  assert.ok(Math.hypot(h.boat.GameObject.position[0] - before[0], h.boat.GameObject.position[2] - before[2]) < 1, 'held where she lies');
  assert.equal(h.host.berthing(h.boat), 'in');
  warpFor(h, TOW_FOUL_S);
  assert.equal(h.host.berthing(h.boat), 'foul', 'given up - said once');
  assert.equal(h.host.berthing(h.boat), null);
  assert.equal(h.host.bringIn(h.boat), false, 'that harbour never asked again for her passage');
});

/** The passage's half over stand-ins: the naval host's quay (`quay` its state, `bring` what bringIn answers), Come Sail
 *  Away's helm, the journey and the words. */
function passage(o = {}) {
  const log = { say: [], stopped: 0, routed: [], stopSail: 0, asked: 0 };
  const boat = { uid: 9001, hull: 2, charter: RECORD, GameObject: { position: [0, 0, 0] }, Cargo: { Items: [] }, packable: false };
  const w = { live: true, quay: null, bring: o.bring ?? true, log, boat };
  const rt = { AllBoats: [boat], state: { CurrentBoat: boat }, sailing: true, isSailing() { return this.sailing; }, StopSailing() { this.sailing = false; this.state.CurrentBoat = null; log.stopSail++; }, StartSailing() {} };
  const naval = { boatInPlay: () => null, bringIn: (b) => { log.asked++; if (b === boat && w.bring) { w.quay = 'in'; return true; } return false; }, berthing: (b) => (b === boat ? w.quay : null), forgetBoat() {} };
  w.host = createPassageHost({
    naval: () => naval, csa: () => rt, ports: () => [], here: () => null, pixel: () => ({ x: 0, y: 0 }), ether: () => false,
    place: (p) => ({ name: p.name, pixel: { x: p.px, y: p.py } }), canGo: () => true,
    travel: () => ({ get isTravelActive() { return w.live; }, clearTravelDestination() { log.stopped++; w.live = false; } }),
    route: (s) => { log.routed.push(s.name); w.live = true; return true; },
    journeyTo: () => (w.live ? { x: RECORD.to.px, y: RECORD.to.py } : null), busy: () => false, standsOn: () => true,
    player: { transportMode: 'foot', feetAt: () => [0, 0, 0], spawn() {} }, gold: () => 0, pay() {}, pack: () => [],
    talk: { say: (t) => log.say.push(t), showOverlay() {} },
  });
  w.rt = rt;
  return w;
}

test('PASSAGE-QUAY THE PASSAGE\'S HALF: under way, her port\'s quay in reach - the journey ends there and her master brings her in, said once; while she comes in no try of his is made; made fast, the helm is let go and the gangway named once; her way in given up, said once and the landfall sailed on at his next try; no quay in reach, the voyage sails on (mutants: the bring-in unasked, the journey not ended, a try made while she comes in, the helm kept, the gangway unsaid, the foul unsaid)', () => {
  const w = passage();
  w.host.frame(0.1);
  assert.equal(w.log.asked, 1);
  assert.equal(w.log.stopped, 1, 'the journey ended');
  assert.deepEqual(w.log.say, [PASSAGE_TEXT.comesIn(RECORD.ship, RECORD.to.name)]);
  for (let t = 0; t < PASSAGE_RESUME_S * 3; t += 0.5) w.host.frame(0.5);
  assert.deepEqual(w.log.routed, [], 'no try while she comes in');
  w.quay = 'fast';
  w.host.frame(0.1); w.host.frame(0.1);
  assert.equal(w.log.stopSail, 1, 'the helm let go');
  assert.deepEqual(w.log.say.slice(1), [PASSAGE_TEXT.madeFast(RECORD.ship, RECORD.to.name)], 'the gangway named once');
  for (let t = 0; t < PASSAGE_RESUME_S * 3; t += 0.5) w.host.frame(0.5);
  assert.deepEqual(w.log.routed, [], 'made fast at her port: no voyage on');
  // given up: said, and the landfall's way sailed on
  const f = passage();
  f.host.frame(0.1);
  f.quay = 'foul';
  f.host.frame(0.1);
  f.quay = null;
  assert.ok(f.log.say.includes(PASSAGE_TEXT.quayFoul));
  for (let t = 0; t < PASSAGE_RESUME_S + 1; t += 0.5) f.host.frame(0.5);
  assert.deepEqual(f.log.routed, ['Holwych'], 'her master sails on for the landfall');
  // no quay in reach: the voyage goes on
  const n = passage({ bring: false });
  n.host.frame(0.1);
  assert.equal(n.log.stopped, 0);
  assert.deepEqual(n.log.say, []);
  // by source: the naval host wires the quay over the warp seam
  const host = read('src/scenes/naval/navalHost.js');
  assert.match(host, /const towed = enabled && boat \? quay\.step\(boat, dt\) : null;/);
  assert.match(host, /bringIn: quay\.begin, berthing: quay\.state,/);
  assert.match(host, /quay\.offset\(o\);/);
});
