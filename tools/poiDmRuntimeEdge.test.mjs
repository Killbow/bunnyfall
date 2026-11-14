// Edge cases of the game-side POI runtime (src/poi/poiDmRuntime.js): online saved values and claims, encounters whose
// enemies rise or vanish, talks and trades when a POI unloads or the player talks to someone else, and log trimming.
//   node --test tools/poiDmRuntimeEdge.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { poiV2Example } from './poiV2Examples.mjs';
import { createPoiDm, mintStack } from '../src/poi/poiDmRuntime.js';

const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const tick = () => new Promise((r) => setTimeout(r, 0));
const ZONE = { k: 'enter_area', interactive: 'ambush-zone' };

function setup(events = [], { items = [], gold = 0, act = null, edit = () => {}, preview = false } = {}) {
  const doc = poiV2Example();
  doc.events = doc.events.filter((e) => e.key !== 'ambush-start').concat(events);
  edit(doc);
  const player = { items, goldPieces: gold };
  const said = [], seen = [], foes = [], removed = [];
  let feet = [500, 0, 500], clock = 0;
  const panel = {
    dialogue: (name, line, options, pick, leave) => seen.push({ k: 'd', name, line, options, pick, leave }),
    trade: (name, rows, run, leave) => seen.push({ k: 't', name, rows, run, leave }),
    hand: (name, line, view, on) => seen.push({ k: 'h', name, view, on }),
    close: () => seen.push({ k: 'x' }), open: () => false,
  };
  const rt = createPoiDm({
    act, preview, say: (l) => said.push(l), now: () => clock, character: () => null, panel,
    pack: () => player, give: (recs, g) => { player.items.push(...recs); player.goldPieces += g; }, feet: () => feet,
    store: { get: () => null, set: () => {} },
    spawnFoe: async (foe, at, o) => { const f = { foe, at, o, corpse: false }; foes.push(f); return f; },
    isDown: (f) => f.corpse, removeFoe: (f) => removed.push(f),
  });
  const s = { id: doc.id, rev: 1, doc, place: I, draft: false };
  const step = async (dt = 0.1, people = []) => { await tick(); clock += dt; rt.frame(s, [0, 0, 0], people); await tick(); await tick(); };
  const walkIn = async () => { feet = [500, 0, 500]; await step(); feet = [30, 0, 0]; await step(); await step(); };
  const walkOut = async () => { feet = [500, 0, 500]; await step(); };
  return { doc, rt, s, player, said, seen, foes, removed, step, walkIn, walkOut, at: (p) => { feet = p; }, last: (k) => seen.findLast((x) => x.k === k) };
}

const visits = (d) => { d.variables.push({ key: 'visits', name: 'Visits', type: 'number', scope: 'character', initial: 0 }); };

test('all dead: an enemy whose body got back up or vanished still counts as killed', async () => {
  const w = setup([{ key: 'start', name: 'Start', trigger: ZONE, then: [{ k: 'start_encounter', encounter: 'ambush' }] }],
    { edit: (d) => { d.encounters[0].spawns = [{ key: 'trolls', foe: 136, count: 2, at: [35, 0, 2], spread: 4 }]; } });
  await w.walkIn();
  assert.equal(w.foes.length, 2);
  const dm = w.rt.modelOf(w.doc.id);
  w.foes[1].corpse = true;
  await w.step();
  w.foes[1].corpse = false;
  await w.step();
  w.foes[0].corpse = true;
  await w.step();
  assert.equal(dm.encounters.ambush, 'done');
});

test('online, a gift already claimed is not asked of the realm again on every trigger', async () => {
  for (const first of [{ ok: false, error: 'poi-limit' }, { ok: true, data: { branch: 'then', took: { items: [], gold: 0, picks: [] }, gave: { items: [], gold: 15 }, vars: {} } }]) {
    let claims = 0;
    const act = async (path, body, o) => {
      if (o?.read) return { ok: true, data: { vars: {} } };
      claims++;
      return claims === 1 ? first : { ok: false, error: 'poi-limit' };
    };
    const w = setup([{ key: 'gift', name: 'Gift', trigger: ZONE, then: [{ k: 'give_gold', amount: 15 }] }], { act });
    await w.step(); await w.step();
    for (let i = 0; i < 3; i++) { await w.walkIn(); await w.walkOut(); }
    assert.equal(claims, 1, first.ok ? 'claimed once' : 'refused once');
    assert.deepEqual(w.said, []);
  }
});

const SWORD = { template: 120, group: 'Weapons', count: 1 };
const toll = [{ key: 'toll', name: 'Toll', trigger: ZONE, then: [{ k: 'take_item', item: SWORD }, { k: 'give_gold', amount: 3 }] }];
const otherPoi = (w) => {
  const doc = { ...JSON.parse(JSON.stringify(w.doc)), id: `${w.doc.id}-other` };
  const s = { ...w.s, id: doc.id, doc };
  w.rt.frame(s, [0, 0, 0], []);
  return s;
};

test('taking down another POI leaves this POI\'s hand-over, talk, or trade open', async () => {
  const w = setup(toll, { items: [mintStack(SWORD)] });
  await w.walkIn();
  assert.ok(w.last('h'), 'asked');
  w.rt.drop(otherPoi(w).id);
  assert.notEqual(w.seen.at(-1).k, 'x', 'the hand-over stays up');
  w.last('h').on.give();
  await w.step(); await w.step();
  assert.equal(w.player.goldPieces, 3);
  for (const who of ['captain', 'nyra']) {
    const v = setup();
    await v.step();
    v.rt.talk(v.doc.id, who);
    const shown = v.seen.length;
    v.rt.drop(otherPoi(v).id);
    assert.equal(v.seen.length, shown, `${who}: nothing closed`);
  }
});

/** @param {any} w */
async function handAll(w) {
  for (let h; (h = w.last('h')) && !h.done;) {
    if (h.view.ready) { h.done = true; h.on.give(); break; }
    const k = h.view.sections.findIndex((x) => x.chosen < x.count);
    const r = h.view.sections[k].rows.find((x) => !x.why && x.n < x.max);
    h.done = true;
    h.on.set(k, r.g, Math.min(r.max, r.n + h.view.sections[k].count - h.view.sections[k].chosen));
  }
  await tick();
}

test('a trade that settles after its POI is gone draws no panel, and its success event still goes to the realm', async () => {
  const sent = [];
  let answer = null;
  const act = (path, body, o) => {
    if (o?.read) return Promise.resolve({ ok: true, data: { vars: {} } });
    sent.push(body.event ?? body.recipe);
    o?.reserve?.();
    if (body.recipe) return new Promise((done) => { answer = done; });
    return Promise.resolve({ ok: true, data: { branch: 'then', took: { items: [], gold: 0, picks: [] }, gave: { items: [], gold: 0 }, vars: { supplies_delivered: true } } });
  };
  const w = setup([], { act, items: [mintStack({ template: 71, count: 10 }), mintStack({ template: 72, count: 5 })] });
  await w.step(); await w.step();
  w.rt.talk(w.doc.id, 'supplier');
  w.last('t').run('delivery');
  await handAll(w);
  assert.deepEqual(sent, ['delivery']);
  w.rt.drop(w.doc.id);
  const drawn = w.seen.length;
  answer({ ok: true, data: { took: { items: [], gold: 0, picks: [] }, gave: { items: [], gold: 250 } } });
  await tick(); await tick();
  assert.deepEqual(w.seen.slice(drawn).filter((x) => x.k !== 'x'), [], 'no panel for the POI that is gone');
  for (let i = 0; i < 3; i++) { w.rt.tick(); await tick(); await tick(); }
  assert.deepEqual(sent, ['delivery', 'supplies-done']);
  assert.ok(w.said.includes('Thank you. That is the last of them.'));
});

test('online, a trade picked while an event settles says to try again', async () => {
  const act = (path, body, o) => (o?.read ? Promise.resolve({ ok: true, data: { vars: {} } }) : new Promise(() => {}));
  const w = setup([{ key: 'count', name: 'Count', trigger: ZONE, then: [{ k: 'set_var', var: 'visits', add: 1 }] }],
    { act, edit: visits, items: [mintStack({ template: 71, count: 10 }), mintStack({ template: 72, count: 5 })] });
  await w.step(); await w.step();
  await w.walkIn();
  w.rt.talk(w.doc.id, 'supplier');
  w.last('t').run('delivery');
  await tick();
  assert.ok(w.said.includes('Your last dealing with the realm is still being settled. Try again in a moment.'));
});

test('talking to a second person while the first one\'s talk is open shows the second person\'s own talk or trade', async () => {
  const w = setup();
  await w.step();
  w.rt.talk(w.doc.id, 'captain');
  assert.equal(w.seen.at(-1).k, 'd');
  w.rt.talk(w.doc.id, 'nyra');
  assert.equal(w.seen.at(-1).k, 't');
  assert.equal(w.seen.at(-1).name, 'Nyra\'s brew');
  w.rt.talk(w.doc.id, 'captain');
  assert.equal(w.seen.at(-1).k, 'd');
  assert.equal(w.seen.at(-1).name, 'Guard Captain');
});

test('online, a read of the saved values the realm did not answer is asked again', async () => {
  const reads = [{ ok: false, error: 'offline', why: 'offline' }, { ok: false, error: 'busy' }, { ok: true, data: { vars: { visits: 3 } } }];
  const act = async (path, body, o) => (o?.read ? reads.shift() : new Promise(() => {}));
  const w = setup([], { act, edit: visits });
  for (let i = 0; i < 40; i++) await w.step(1);
  assert.equal(reads.length, 0);
  assert.equal(w.rt.modelOf(w.doc.id).vars.visits, 3);
});

test('outside a Test, the run\'s log keeps only its newest lines', async () => {
  const w = setup([{ key: 'hello', name: 'Hello', trigger: ZONE, then: [{ k: 'say', text: 'Hello.' }] }]);
  const merchant = { key: 'merchant', name: 'Wandering Merchant', at: [0, 0, 0] };
  for (let i = 0; i < 300; i++) { await w.walkIn(); await w.step(5, [merchant]); }
  assert.equal(w.said.length, 300);
  assert.ok(w.rt.modelOf(w.doc.id).log.length <= 400, `log holds ${w.rt.modelOf(w.doc.id).log.length}`);
});
