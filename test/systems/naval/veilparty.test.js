// VEIL-PARTY (2026-10-27, the SEA-OPEN slice; bible/03-World/Eltheric-Ocean.md VEIL-PARTY): a party crosses the Veil
// together - the captain's crossing no longer held back by her party aboard (comeSailAwayAboard.js passengersOn's skip,
// world.js crossRefusal), and a member aboard her follows her crossing (scenes/naval/veilParty.js) by the party's own
// journey, landing beside her captain. The picture is net/social.js's own SocialState. tools/mutants/seaopen.json (VEIL-).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVeilParty, veilJourney, VEIL_FOLLOW_MS, VEIL_PARTY_TEXT } from '../../../src/scenes/naval/veilParty.js';
import { createComeSailAwayAboard } from '../../../src/scenes/comeSailAway/comeSailAwayAboard.js';
import { CROSS_DAYS, CROSS_REFUSED, crossingTarget } from '../../../src/systems/naval/etherCrossing.js';
import { SocialState } from '../../../src/net/social.js';
import { hostText } from '../../hostText.mjs';

const ME = 'acct-me', CAPT = 'acct-capt', STRANGER = 'acct-x';
const LAND = crossingTarget('out', null);
/** The picture: me and the captain seated in one party, the captain's pose at pixel `p` in its open air. */
function picture(p) {
  const s = new SocialState({ acct: ME });
  s.acct = ME;
  s.party = { id: 'p1', leader: CAPT, members: [
    { acct: CAPT, name: 'Wren', online: true, peers: ['peer-capt'], p: { px: p.x, py: p.y, in: 0, wx: (p.x + 0.5) * 32768, wy: 2, wz: (499 - p.y + 0.5) * 32768 } },
    { acct: ME, name: 'Me', online: true, peers: ['peer-me'], p: { px: 150, py: 300, in: 0 } },
  ] };
  return s;
}
function rig({ aboard = 'peer-capt', ready = true } = {}) {
  const w = { now: 0, here: { x: 150, y: 300 }, capt: { x: 150, y: 300 }, aboard, ready, said: [], trips: [], went: true };
  let social = picture(w.capt);
  const vp = createVeilParty({
    social: () => social, aboard: () => (w.aboard ? { owner: w.aboard } : null), here: () => w.here,   // `across` left out: the module's own Veil law (world/ethericSea.js inEther) - PIN MOVED (the host's ceiling)
    ready: () => w.ready, now: () => w.now, say: (l) => w.said.push(l),
    travel: (pick, opts, computed) => { w.trips.push({ pick, opts, computed }); return Promise.resolve(w.went); },
  });
  return { w, vp, cross: (to = { x: LAND.px, y: LAND.py }) => { w.capt = to; w.aboard = null; social = picture(to); }, step: (ms = 100) => { w.now += ms; vp.step(); } };
}
const settle = () => new Promise((res) => setImmediate(res));

test('VEIL-PARTY the passenger: aboard a party member\'s ship when her captain crosses, I follow her by the party\'s own journey - to the captain\'s pixel, landing beside the captain, no fare, the crossing\'s days, past the Veil\'s refusal; once (mutants: the window, the side, the captain unread, the fare, the days)', async () => {
  const r = rig();
  r.step(); r.step();
  assert.deepEqual(r.w.trips, [], 'she has not crossed');
  r.cross();
  r.step(5000);
  assert.equal(r.w.trips.length, 1);
  const { pick, opts, computed } = r.w.trips[0];
  assert.deepEqual(pick.pixel, { x: LAND.px, y: LAND.py });
  assert.equal(pick.veil, true, 'the crossing carries me: the Veil\'s refusal is not mine');
  assert.deepEqual(computed, { minutes: CROSS_DAYS * 1440, totalCost: 0, piecesCost: 0, oceanPixels: 0 });
  assert.equal(opts.speedCautious, false);
  assert.deepEqual(pick.besideAt(), { x: (LAND.px + 0.5) * 32768, y: 2, z: (499 - LAND.py + 0.5) * 32768 }, 'beside her captain, as the far end reads them');
  assert.equal(pick.besideText, VEIL_PARTY_TEXT.landed('Wren'));
  assert.deepEqual(r.w.said, [VEIL_PARTY_TEXT.follow('Wren')]);
  r.step(); r.step();
  assert.equal(r.w.trips.length, 1, 'once');
  await settle();
  r.step();
  assert.equal(r.w.trips.length, 1, 'arrived: nothing more to follow');
});

test('VEIL-PARTY the passenger\'s refusals: a stranger\'s ship is no party\'s; her crossing heard past VEIL_FOLLOW_MS is not mine; a captain still this side sails nowhere; while I cannot travel I wait, then follow; a journey that failed says so (mutants: a stranger followed, the window\'s end, the wait)', async () => {
  const s = rig({ aboard: 'peer-x' });
  s.step(); s.cross(); s.step();
  assert.deepEqual(s.w.trips, [], 'a stranger\'s ship');
  const late = rig();
  late.step(); late.cross(); late.w.capt = { x: 150, y: 300 };
  late.step(VEIL_FOLLOW_MS + 1);
  late.cross(); late.step();
  assert.deepEqual(late.w.trips, [], 'long ashore since');
  const home = rig();
  home.step(); home.w.aboard = null; home.step(3000);
  assert.deepEqual(home.w.trips, [], 'her captain this side still');
  const wait = rig({ ready: false });
  wait.step(); wait.cross(); wait.step(); wait.step();
  assert.deepEqual(wait.w.trips, [], 'a journey moving me: not yet');
  wait.w.ready = true; wait.step();
  assert.equal(wait.w.trips.length, 1, 'then followed');
  const fail = rig();
  fail.w.went = false;
  fail.step(); fail.cross(); fail.step();
  await settle();
  assert.deepEqual(fail.w.said, [VEIL_PARTY_TEXT.follow('Wren'), VEIL_PARTY_TEXT.missed('Wren')]);
});

test('VEIL-PARTY the captain: a rider of her party is not counted against her crossing, a stranger still is - the aboard book\'s count with the party left out, and the world host\'s refusal asks it so (mutants: the skip unread, the kin unread)', () => {
  const aboard = createComeSailAwayAboard({ peers: { placeOf: () => null }, geometry: () => null, selfId: () => 'peer-capt' });
  for (const [id, slot] of [['peer-me', 0], ['peer-x', 0], ['peer-y', 1]]) assert.ok(aboard.applyRider(id, ['peer-capt', slot, 0, 1, 0], 0));
  assert.equal(aboard.passengersOn('peer-capt', 0), 2);
  assert.equal(aboard.passengersOn('peer-capt', 0, (id) => id === 'peer-me'), 1, 'my party left out');
  const r = rig();
  assert.equal(r.vp.kin('peer-capt'), true);
  assert.equal(r.vp.kin('peer-x'), false);
  assert.match(CROSS_REFUSED.passengers, /Only your party/);
  const w = hostText('src/scenes/world.js');
  assert.match(w, /const crossRefusal = \(\) => \(navalHostileNear\(\) \? 'hostile' : csaPassengersOn\(csaRuntime\?\.state\?\.CurrentBoat, veilParty\.kin\) > 0 \? 'passengers' : null\);/);
  assert.match(w, /if \(pick\?\.besideAt && \(wildTeleportRefused\(pick\.pixel \?\? null\) \|\| \(!pick\.veil && veilRefused\(pick\.pixel \?\? null\)\)\)\) return Promise\.resolve\(false\);/);
  assert.ok(STRANGER);
});

test('VEIL-PARTY the journey: veilJourney\'s pick lands beside the captain\'s row as the far end reads it, none when their pose stands elsewhere (mutants: the beside unread)', () => {
  let row = picture({ x: LAND.px, y: LAND.py }).party.members[0];
  const j = veilJourney({ x: LAND.px, y: LAND.py }, 'Wren', () => row);
  assert.ok(j.pick.besideAt());
  row = { ...row, p: { ...row.p, px: LAND.px + 1 } };
  assert.equal(j.pick.besideAt(), null);
  row = null;
  assert.equal(j.pick.besideAt(), null);
});
