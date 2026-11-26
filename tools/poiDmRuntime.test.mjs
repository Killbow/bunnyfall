// Tests the game-side POI runtime on the example POI, offline. Run: node --test tools/poiDmRuntime.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { poiV2Example } from './poiV2Examples.mjs';
import * as dmRuntime from '../src/poi/poiDmRuntime.js';
import { tryLanguagePacification } from '../src/combat/hostCombat.js';

const { createPoiDm, mintStack } = dmRuntime;
const poolFoes = (/** @type {any} */ pool) => dmRuntime.poolFoes(pool);

const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
function handOver(name, line, view, on) {
  if (view.ready) { on.give(); return; }
  for (const [k, sec] of view.sections.entries()) {
    const r = sec.chosen < sec.count && sec.rows.find((x) => !x.why && x.n < x.max);
    if (r) { on.set(k, r.g, Math.min(r.max, r.n + sec.count - sec.chosen)); return; }
  }
}

const fakePanel = () => { const seen = []; return { seen, dialogue: (n, l, o, pick) => seen.push({ k: 'd', l, o, pick }), trade: (n, rows, run) => seen.push({ k: 't', rows, run }), hand: (n, l, v, on) => { seen.push({ k: 'h', v }); handOver(n, l, v, on); }, close: () => seen.push({ k: 'x' }), open: () => false }; };

function setup(edit = () => {}, { spawnFoe = null, act = null } = {}) {
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
    removeFoe: (f) => removed.push(f), act,
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

/** @param {ReturnType<typeof setup>} w */
async function ambush(w) {
  await w.step(); await w.step();
  w.at([30, 0, 0]);
  await w.step(); await w.step();
}

test('an encounter ended by an event takes its standing enemies away', async () => {
  const w = setup();
  await ambush(w);
  assert.equal(w.foes.length, 5);
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

test('an encounter with pacifiable false spawns enemies that language skills cannot pacify; by default they can be', async () => {
  for (const pacifiable of [false, true, undefined]) {
    const stood = [];
    const foes = poolFoes({ spawnFoe: async (foe) => { const f = { foe, mobileType: foe, ai: { isHostile: true }, entity: {} }; stood.push(f); return f; }, removeFoe: () => {} });
    const w = setup((d) => { if (pacifiable !== undefined) d.encounters[0].pacifiable = pacifiable; }, { spawnFoe: foes.spawnFoe });
    await ambush(w);
    assert.equal(stood.length, 5);
    for (const f of stood) {
      f.ai.justEncountered = true;
      const got = tryLanguagePacification(f.ai, f.entity, f.mobileType, { skills: {} }, { enemyLanguageSkill: () => 1, calculateEnemyPacification: () => true });
      assert.equal(f.ai.isHostile, pacifiable === false, `pacifiable ${pacifiable}`);
      assert.equal(got?.pacified ?? false, pacifiable !== false);
      assert.equal(f.entity.pacifyImmune, pacifiable === false ? true : undefined);
    }
  }
});

test('all dead: a spawn the pool could not stand is not waited for', async () => {
  let n = 0;
  const stood = [];
  const w = setup(undefined, { spawnFoe: async (foe) => { if (n++ === 0) return null; const f = { foe, corpse: false }; stood.push(f); return f; } });
  await ambush(w);
  assert.equal(stood.length, 4);
  for (const f of stood) f.corpse = true;
  await w.step(); await w.step();
  const dm = w.rt.modelOf(w.doc.id);
  assert.equal(dm.encounters.ambush, 'done');
  assert.equal(dm.states.gate, 'open');
});

test('all dead: an encounter is not done while an enemy is still on its way; with no enemy stood it waits to start again', async () => {
  const late = [];
  const w = setup(undefined, { spawnFoe: (foe) => new Promise((ok) => { late.push(() => ok({ foe, corpse: true })); }) });
  await ambush(w);
  late.shift()();
  await w.step(); await w.step();
  assert.equal(w.rt.modelOf(w.doc.id).encounters.ambush, 'active', 'four still on their way');
  const none = setup(undefined, { spawnFoe: async () => null });
  await ambush(none);
  await none.step(); await none.step();
  assert.equal(none.rt.modelOf(none.doc.id).encounters.ambush, 'idle', 'nothing stood: it waits for its next start, unpaid');
  assert.equal(none.said.some((l) => /clear/.test(l)), false);
});

test('timer survived: the time counts only while the player is in the encounter\'s area', async () => {
  const w = setup((d) => { d.encounters[0].complete = { rule: 'timer_survived', seconds: 1 }; });
  await ambush(w);
  const dm = w.rt.modelOf(w.doc.id);
  w.at([5000, 0, 5000]);
  for (let i = 0; i < 10; i++) await w.step(0.5);
  assert.equal(dm.encounters.ambush, 'active', 'five seconds away from it count nothing');
  w.at([35, 0, 10]);
  await w.step(0.5);
  assert.equal(dm.encounters.ambush, 'active', 'half a second there');
  w.at([5000, 0, 5000]);
  await w.step(0.5);
  w.at([35, 0, 10]);
  await w.step(0.5); await w.step(0.1);
  assert.equal(dm.encounters.ambush, 'done', 'a second there in all');
});

test('online, a trade the realm did not settle is never said as done already', async () => {
  const answers = [];
  const act = async (path, body, o) => (o?.read ? { ok: true, data: { vars: {} } } : answers.shift());
  const w = setup(undefined, { act });
  await w.step();
  for (const [answer, words] of [[{ ok: false, error: 'offline', unknown: true }, /may or may not/], [{ ok: false, error: 'busy' }, /still being settled/], [{ ok: false, error: 'poi-limit' }, /already done/]]) {
    answers.push(answer);
    w.said.length = 0;
    w.rt.talk(w.doc.id, 'supplier');
    w.panel.seen.findLast((x) => x.k === 't').run('delivery');
    await new Promise((r) => setTimeout(r, 10));
    assert.match(w.said.join(' | '), words, answer.error);
    if (answer.error !== 'poi-limit') assert.doesNotMatch(w.said.join(' | '), /already done|Nothing was traded/);
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

test('online, an event that adds to a saved number ends on the realm\'s value, not twice the addition', async () => {
  let stored = 0;
  const act = async (path, body, o) => {
    if (o?.read) return { ok: true, data: { vars: { visits: stored } } };
    stored += 1;
    return { ok: true, data: { branch: 'then', took: { items: [], gold: 0, picks: [] }, gave: { items: [], gold: 0 }, vars: { visits: stored } } };
  };
  const w = setup((d) => {
    d.variables.push({ key: 'visits', name: 'Visits', type: 'number', scope: 'character', initial: 0 });
    d.events.push({ key: 'count', name: 'Count', trigger: { k: 'enter_area', interactive: 'ambush-zone' }, then: [{ k: 'set_var', var: 'visits', add: 1 }] });
  }, { act });
  await w.step(); await w.step();
  w.at([30, 0, 0]);
  for (let i = 0; i < 4; i++) await w.step();
  assert.equal(stored, 1);
  assert.equal(w.rt.modelOf(w.doc.id).vars.visits, 1);
});
