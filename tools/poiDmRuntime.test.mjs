// The game-side runtime (src/poi/poiDmRuntime.js) on the example POI, offline (no realm session): a trigger zone starts
// the ambush, the foes fall and the gate opens; the supplier's trade moves the real pack; a walker reports its waypoints.
// The encounters' lifecycle: enemies are taken away on a reset or a take-down through the outdoor pool's own removal; a
// passive encounter's enemies stand non-hostile.
import test from 'node:test';
import assert from 'node:assert/strict';
import { poiV2Example } from './poiV2Examples.mjs';
import * as dmRuntime from '../src/poi/poiDmRuntime.js';

const { createPoiDm, mintStack } = dmRuntime;
const poolFoes = (/** @type {any} */ pool) => dmRuntime.poolFoes(pool);

const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const fakePanel = () => { const seen = []; return { seen, dialogue: (n, l, o, pick) => seen.push({ k: 'd', l, o, pick }), trade: (n, rows, run) => seen.push({ k: 't', rows, run }), close: () => seen.push({ k: 'x' }), open: () => false }; };

function setup(edit = () => {}, { spawnFoe = null } = {}) {
  const doc = poiV2Example();
  edit(doc);
  const said = [], foes = [], removed = [];
  const player = { items: [mintStack({ template: 71, count: 10 }), mintStack({ template: 72, count: 5 })], goldPieces: 0 };
  let feet = [500, 0, 500], clock = 0;
  const panel = fakePanel();
  const rt = createPoiDm({
    say: (l) => said.push(l), pack: () => player, give: (recs, g) => { player.items.push(...recs); player.goldPieces += g; },
    feet: () => feet, now: () => clock, panel, store: null,
    spawnFoe: spawnFoe ?? (async (foe, at, o) => { const f = { foe, at, o, corpse: false }; foes.push(f); return f; }), isDown: (f) => f.corpse,
    removeFoe: (f) => removed.push(f),
  });
  const s = { id: doc.id, rev: 1, doc, place: I, draft: false };
  const step = async (dt = 0.1) => { clock += dt; rt.frame(s, [0, 0, 0], []); await new Promise((r) => setTimeout(r, 0)); };
  return { doc, rt, s, step, said, foes, removed, player, panel, at: (p) => { feet = p; } };
}

test('stepping into the zone starts the ambush; when its foes fall the gate opens', async () => {
  const w = setup();
  await w.step(); await w.step();
  w.at([30, 0, 0]);
  await w.step(); await w.step();
  assert.ok(w.foes.length > 0, 'foes stood');
  for (const f of w.foes) f.corpse = true;
  await w.step(); await w.step();
  const dm = w.rt.modelOf(w.doc.id);
  assert.equal(dm.states.gate, 'open');
  assert.ok(w.said.some((l) => /clear/.test(l)));
});

test('talking to the supplier with the goods opens the trade, and the trade moves the real pack', async () => {
  const w = setup();
  await w.step();
  assert.equal(w.rt.talk(w.doc.id, 'supplier'), true);
  const t = w.panel.seen.findLast((x) => x.k === 't');
  assert.ok(t, 'the trade window opened');
  t.run('delivery');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(w.player.goldPieces, 250);
  assert.equal(w.player.items.length, 0);
});

test('objects become targets the Use key reaches', async () => {
  const w = setup();
  await w.step();
  const xs = w.rt.extras(w.doc.id);
  assert.ok(xs.some((x) => x.key.endsWith(':gate')));
  assert.ok(!xs.some((x) => x.key.endsWith(':ambush-zone')), 'a trigger zone is no object');
});

/** Step into the ambush zone so the encounter spawns its enemies. @param {ReturnType<typeof setup>} w */
async function ambush(w) {
  await w.step(); await w.step();
  w.at([30, 0, 0]);
  await w.step(); await w.step();
}

test('an encounter ended by an event takes its standing enemies away', async () => {
  const w = setup();
  await ambush(w);
  assert.equal(w.foes.length, 5);
  // what end_encounter does
  w.rt.modelOf(w.doc.id).encounters.ambush = 'idle';
  await w.step();
  assert.deepEqual(w.removed, w.foes);
});

test('a POI taken down takes its encounter\'s enemies with it', async () => {
  const w = setup();
  await ambush(w);
  w.rt.drop(w.doc.id);
  assert.deepEqual(w.removed, w.foes);
});

test('an enemy that stands after its POI was taken down goes at once', async () => {
  const late = [];
  const w = setup(undefined, { spawnFoe: (foe) => new Promise((ok) => { late.push(() => ok({ foe, corpse: false })); }) });
  await ambush(w);
  w.rt.drop(w.doc.id);
  for (const go of late) go();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(w.removed.length, 5);
});

test('the outdoor pool stands a POI enemy placed and unsaved, and takes it away through its own removal', async () => {
  const asked = [], gone = [];
  const pool = { spawnFoe: async (foe, at, o) => { asked.push(o); return { foe, ai: { isHostile: true } }; }, removeFoe: (f) => gone.push(f) };
  const foes = poolFoes(pool);
  const f = await foes.spawnFoe(3, [0, 0, 0], { level: 4, hostile: true });
  assert.equal(asked[0].placed, true);
  assert.equal(asked[0].transient, true);
  assert.equal(asked[0].level, 4);
  foes.removeFoe(f);
  assert.deepEqual(gone, [f]);
});

test('a passive encounter stands its enemies not hostile; a hostile one keeps them hostile', async () => {
  for (const aggression of ['passive', 'hostile']) {
    const stood = [];
    const foes = poolFoes({ spawnFoe: async (foe) => { const f = { foe, ai: { isHostile: true } }; stood.push(f); return f; }, removeFoe: () => {} });
    const w = setup((d) => { d.encounters[0].aggression = aggression; }, { spawnFoe: foes.spawnFoe });
    await ambush(w);
    assert.equal(stood.length, 5);
    assert.ok(stood.every((f) => f.ai.isHostile === (aggression === 'hostile')), aggression);
  }
});

test('the feed reading the same revision again keeps the run and its fight', async () => {
  const w = setup();
  await ambush(w);
  const dm = w.rt.modelOf(w.doc.id);
  w.s.doc = JSON.parse(JSON.stringify(w.doc));
  await w.step();
  assert.equal(w.rt.modelOf(w.doc.id), dm);
  assert.equal(dm.encounters.ambush, 'active');
  assert.deepEqual(w.removed, []);
});

test('a won encounter leaves its living enemies; when it stands again they go first', async () => {
  const w = setup((d) => { d.encounters[0].respawn = 'on_reentry'; d.encounters[0].complete = { rule: 'timer_survived', seconds: 1 }; });
  await ambush(w);
  for (let i = 0; i < 12; i++) await w.step(0.1);
  const dm = w.rt.modelOf(w.doc.id);
  assert.equal(dm.encounters.ambush, 'idle', 'won, and ready to start again');
  assert.deepEqual(w.removed, [], 'winning takes no enemy away');
  const first = w.foes.slice();
  w.at([500, 0, 500]); await w.step();
  w.at([30, 0, 0]); await w.step(); await w.step();
  assert.equal(w.foes.length, 10);
  assert.deepEqual(w.removed, first, 'the last group goes before the next stands');
});
