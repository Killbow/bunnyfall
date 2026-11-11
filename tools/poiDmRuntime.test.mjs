// The game-side runtime (src/poi/poiDmRuntime.js) on the example POI, offline (no realm session): a trigger zone starts
// the ambush, the foes fall and the gate opens; the supplier's trade moves the real pack; a walker reports its waypoints.
import test from 'node:test';
import assert from 'node:assert/strict';
import { poiV2Example } from './poiV2Examples.mjs';
import { createPoiDm, mintStack } from '../src/poi/poiDmRuntime.js';

const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const fakePanel = () => { const seen = []; return { seen, dialogue: (n, l, o, pick) => seen.push({ k: 'd', l, o, pick }), trade: (n, rows, run) => seen.push({ k: 't', rows, run }), close: () => seen.push({ k: 'x' }), open: () => false }; };

function setup() {
  const doc = poiV2Example();
  const said = [], foes = [];
  const player = { items: [mintStack({ template: 71, count: 10 }), mintStack({ template: 72, count: 5 })], goldPieces: 0 };
  let feet = [500, 0, 500], clock = 0;
  const panel = fakePanel();
  const rt = createPoiDm({
    say: (l) => said.push(l), pack: () => player, give: (recs, g) => { player.items.push(...recs); player.goldPieces += g; },
    feet: () => feet, now: () => clock, panel, store: null,
    spawnFoe: async (foe) => { const f = { foe, corpse: false }; foes.push(f); return f; }, isDown: (f) => f.corpse,
  });
  const s = { id: doc.id, rev: 1, doc, place: I, draft: false };
  const step = async (dt = 0.1) => { clock += dt; rt.frame(s, [0, 0, 0], []); await new Promise((r) => setTimeout(r, 0)); };
  return { doc, rt, s, step, said, foes, player, panel, at: (p) => { feet = p; } };
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
