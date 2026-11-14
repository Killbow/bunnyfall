// Tests the in-game POI editor's Test (src/poi/poiDmTest.js) and the DM runtime's preview mode
// (src/poi/poiDmRuntime.js): a draft's trades, gifts, takes, and settlements land on a throwaway purse and pack copied
// from the character's; the character's pack, `give`, the service's act, and the device's store are never used;
// persistent variables stay in memory; encounters spawn enemies from the pool, and stopping the test removes them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { poiV2Example } from './poiV2Examples.mjs';
import { createPoiDm, mintStack } from '../src/poi/poiDmRuntime.js';
import { createPoiTest, purseOf, testable } from '../src/poi/poiDmTest.js';
import { npcsOf } from '../src/poi/poiRuntime.js';
import { groundRefusalOf } from '../src/systems/inventorySession.js';
import { createPoiTestPanel } from '../src/ui/poi/poiTestPanel.js';

const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const tick = () => new Promise((r) => setTimeout(r, 0));
const supplies = () => [mintStack({ template: 71, count: 10 }), mintStack({ template: 72, count: 5 })];

/** Every door to the character a preview must leave alone, each a spy that records its use. */
function doors() {
  const used = [];
  return {
    used,
    act: async (path) => { used.push(`act ${path}`); return { ok: true, data: { took: { items: [], gold: 0 }, gave: { items: [], gold: 0 }, vars: {} } }; },
    store: { get: (k) => { used.push(`store.get ${k}`); return null; }, set: (k) => { used.push(`store.set ${k}`); } },
    give: () => { used.push('give'); },
  };
}
function handOver(name, line, view, on) {
  if (view.ready) { on.give(); return; }
  for (const [k, sec] of view.sections.entries()) {
    const r = sec.chosen < sec.count && sec.rows.find((x) => !x.why && x.n < x.max);
    if (r) { on.set(k, r.g, Math.min(r.max, r.n + sec.count - sec.chosen)); return; }
  }
}

/** Creates a mock panel that records what it shows and holds the last dialogue and trade callbacks. */
function panelRec() {
  const rec = { shown: [], pick: null, tradePick: null };
  rec.panel = { dialogue: (n, l, opts, pick) => { rec.shown.push(l); rec.pick = pick; }, trade: (n, rows, pick) => { rec.shown.push(`trade ${n}`); rec.tradePick = pick; }, hand: handOver, close: () => {} };
  return rec;
}
/** An enemy pool as scenes/exteriorFoes.js answers it. */
function poolRec() {
  const pool = { foes: [], spawned: 0 };
  pool.spawnFoe = async (foe) => { const f = { foe, ai: {}, corpse: false }; pool.foes.push(f); pool.spawned++; return f; };
  pool.removeFoe = (f) => { const i = pool.foes.indexOf(f); if (i >= 0) pool.foes.splice(i, 1); };
  return pool;
}

test('in preview a dialogue\'s trade settles on the throwaway purse; act, store, and the character\'s give are never used', async () => {
  const doc = poiV2Example();
  doc.npcs.find((n) => n.key === 'supplier').dialogue = 'captain';
  const d = doors(), rec = panelRec();
  const purse = { items: supplies(), goldPieces: 7 };
  const rt = createPoiDm({
    preview: true, act: d.act, store: d.store, say: () => {}, feet: () => [500, 0, 500], now: () => 0, panel: rec.panel,
    pack: () => purse, give: (records, gold) => { purse.items.push(...records); purse.goldPieces += gold; },
  });
  const s = { id: doc.id, rev: 0, doc, place: I, draft: true };
  for (let i = 0; i < 3; i++) { rt.frame(s, [0, 0, 0], npcsOf(doc, I)); await tick(); }
  assert.equal(rt.talk(doc.id, 'supplier'), true);
  // "I have brought the supplies."
  rec.pick(1);
  for (let i = 0; i < 6; i++) { await tick(); rt.frame(s, [0, 0, 0], npcsOf(doc, I)); }
  assert.equal(purse.goldPieces, 257, 'the reward lands in the throwaway purse');
  assert.equal(purse.items.length, 0, 'the supplies leave the throwaway pack');
  assert.deepEqual(d.used, [], 'no act, no store, no give of the character');
  const m = rt.modelOf(doc.id);
  assert.equal(m.vars.supplies_delivered, true, 'the success event ran');
  assert.ok(m.log.some((l) => l.k === 'trade' && l.gave.gold === 250), 'the trade is in the log');
});

test('in preview an event that takes and gives settles on the throwaway purse, and its persistent variable stays in memory', async () => {
  const doc = poiV2Example();
  doc.events.push({ key: 'toll', name: 'Toll', trigger: { k: 'enter_area', interactive: 'ambush-zone' }, then: [{ k: 'take_gold', amount: 5 }, { k: 'give_item', item: { template: 71, count: 1 } }, { k: 'set_var', var: 'supplies_delivered', to: true }] });
  doc.events = doc.events.filter((e) => e.key !== 'ambush-start');
  const d = doors(), rec = panelRec();
  const purse = { items: [], goldPieces: 20 };
  let feet = [500, 0, 500];
  const make = () => createPoiDm({
    preview: true, act: d.act, store: d.store, say: () => {}, feet: () => feet, now: () => 0, panel: rec.panel,
    pack: () => purse, give: (records, gold) => { purse.items.push(...records); purse.goldPieces += gold; },
  });
  const rt = make();
  const s = { id: doc.id, rev: 0, doc, place: I, draft: true };
  const step = async () => { rt.frame(s, [0, 0, 0], npcsOf(doc, I)); await tick(); };
  await step();
  feet = [30, 0, 0]; await step(); await step(); await step();
  assert.equal(purse.goldPieces, 15, 'the toll is taken from the throwaway purse');
  assert.equal(purse.items.length, 1, 'the gift is in the throwaway pack');
  assert.equal(rt.modelOf(doc.id).vars.supplies_delivered, true);
  assert.ok(rt.modelOf(doc.id).log.some((l) => l.k === 'take_gold'), 'the settle is in the log');
  assert.deepEqual(d.used, [], 'no act, no store, no give of the character');
  feet = [500, 0, 500];
  const again = make();
  again.frame(s, [0, 0, 0], npcsOf(doc, I)); await tick();
  assert.equal(again.modelOf(doc.id).vars.supplies_delivered, false, 'a new preview starts with the authored value');
});

test('the Test copies the character\'s purse, settles on the copy, stands real enemies, and takes them away on stop', async () => {
  const doc = poiV2Example();
  doc.npcs.find((n) => n.key === 'supplier').dialogue = 'captain';
  const character = { items: supplies(), goldPieces: 40, name: 'kept' };
  const before = JSON.stringify(character);
  const rec = panelRec(), pool = poolRec();
  let feet = [500, 0, 500], gone = null, ended = null, clock = 0;
  const session = createPoiTest({ pack: () => character, say: () => {}, feet: () => feet, pool, panel: rec.panel, now: () => clock, gone: () => gone, onEnd: (why) => { ended = why; } });
  await session.prepare();
  assert.equal(testable(doc), true);
  assert.equal(session.start(doc.id, doc), true);
  const rt = session.runtimeFor(doc.id);
  assert.ok(rt, 'the draft under test has a runtime');
  assert.equal(session.runtimeFor('poi-other0000000'), null, 'no other POI does');
  const s = { id: doc.id, rev: 0, doc, place: I, draft: true };
  const step = async () => { clock += 0.1; session.frame(); session.runtimeFor(doc.id)?.frame(s, [0, 0, 0], npcsOf(doc, I)); await tick(); };
  await step();
  rt.talk(doc.id, 'supplier'); rec.pick(1);
  for (let i = 0; i < 4; i++) await step();
  assert.equal(session.purse().now.goldPieces, 290, 'the copy gains the reward');
  assert.equal(session.purse().first.goldPieces, 40);
  feet = [30, 0, 0];
  for (let i = 0; i < 4; i++) await step();
  assert.equal(pool.spawned, 5, 'the encounter stands its five enemies in the pool');
  assert.equal(session.enemies(), 5);
  session.stop();
  assert.equal(pool.foes.length, 0, 'stopping the test takes its enemies away');
  assert.equal(session.active(), false);
  assert.equal(session.runtimeFor(doc.id), null);
  assert.equal(JSON.stringify(character), before, 'the character\'s pack and gold are as they were');
  session.start(doc.id, doc);
  gone = 'away'; await step();
  assert.equal(ended, 'away', 'a change of world ends the test');
  assert.equal(session.active(), false);
});

test('a reset copies the purse again and starts the run as authored', async () => {
  const doc = poiV2Example();
  const character = { items: [], goldPieces: 12 };
  const session = createPoiTest({ pack: () => character, say: () => {}, feet: () => null, panel: panelRec().panel });
  await session.prepare();
  session.start(doc.id, doc);
  session.setGold(500);
  assert.equal(session.addStack({ template: 71, count: 3 }), true);
  assert.equal(session.purse().now.goldPieces, 500);
  assert.equal(session.purse().now.items.length, 1);
  assert.equal(session.addStack({ template: 83, recipe: 'healTrue', count: 2 }), true, 'a potion by name');
  assert.deepEqual(session.purse().now.items[1], mintStack({ template: 83, recipe: 'healTrue', count: 2 }));
  assert.equal(session.purse().now.items[1].value, 100);
  assert.equal(session.addStack({ template: 83, recipe: 'nonsense', count: 1 }), false, 'a recipe the game does not know');
  session.reset();
  assert.deepEqual(session.purse().now, purseOf(character));
  assert.deepEqual(character, { items: [], goldPieces: 12 });
  session.stop();
});

test('in preview an event that only gives settles once, as the service claims it, and loading the POI again in the same test retains the claim in memory', async () => {
  const doc = poiV2Example();
  doc.events = doc.events.filter((e) => e.key !== 'ambush-start');
  doc.events.push({ key: 'gift', name: 'Gift', trigger: { k: 'enter_area', interactive: 'ambush-zone' }, then: [{ k: 'give_gold', amount: 25 }] });
  const purse = { items: [], goldPieces: 0 };
  let feet = [500, 0, 500];
  const rt = createPoiDm({ preview: true, say: () => {}, feet: () => feet, now: () => 0, panel: panelRec().panel, pack: () => purse, give: (r, g) => { purse.goldPieces += g; } });
  const s = { id: doc.id, rev: 0, doc, place: I, draft: true };
  const step = async () => { rt.frame(s, [0, 0, 0], npcsOf(doc, I)); await tick(); };
  for (let lap = 0; lap < 3; lap++) { feet = [500, 0, 500]; await step(); feet = [30, 0, 0]; await step(); await step(); await step(); }
  assert.equal(purse.goldPieces, 25, 'one gift, as on the service');
  assert.ok(rt.modelOf(doc.id).log.some((l) => l.k === 'refused' && l.why === 'limit'), 'the second walk in is logged as already done');
  rt.drop(doc.id);
  feet = [500, 0, 500]; await step(); feet = [30, 0, 0]; await step(); await step();
  assert.equal(purse.goldPieces, 25, 'reloading the POI in the same test retains its claims in memory');
});

test('the character is sealed at the start and put back at every ending but a load', async () => {
  const doc = poiV2Example();
  const character = { items: [], goldPieces: 12, health: 30 };
  const sealed = [], unsealed = [];
  let gone = null;
  const session = createPoiTest({ pack: () => character, say: () => {}, feet: () => null, panel: panelRec().panel, gone: () => gone,
    seal: () => { const snap = structuredClone(character); sealed.push(snap); return snap; }, unseal: (snap) => { unsealed.push(snap); Object.assign(character, structuredClone(snap)); } });
  await session.prepare();
  for (const end of ['stop', 'reset', 'door', 'away', 'load']) {
    session.start(doc.id, doc);
    character.goldPieces += 100; character.health = 1; character.items.push({ loot: true });
    const before = unsealed.length;
    if (end === 'stop') session.stop();
    else if (end === 'reset') { session.reset(); assert.equal(session.active(), true); session.stop(); }
    else if (end === 'door') session.end('door');
    else { gone = end; session.frame(); gone = null; }
    assert.equal(session.active(), false, end);
    if (end === 'load') assert.equal(unsealed.length, before, 'a load keeps the loaded character');
    else assert.deepEqual(character, { items: [], goldPieces: 12, health: 30 }, `${end}: the character is as it was`);
    Object.assign(character, { items: [], goldPieces: 12, health: 30 });
  }
});

test('the death guard is held from the start of every test, held again when something else sets the hook, and let go at the end', async () => {
  const doc = poiV2Example();
  let hook = () => 'stendarr';
  const setHook = (fn) => { const prev = hook; hook = fn; return prev; };
  let spared = 0;
  const session = createPoiTest({ pack: () => ({ items: [], goldPieces: 0 }), say: () => {}, feet: () => null, panel: panelRec().panel, deathHook: setHook, onSpared: () => { spared++; session.stop(); } });
  await session.prepare();
  for (let lap = 0; lap < 3; lap++) {
    const before = hook;
    session.start(doc.id, doc);
    assert.notEqual(hook, before, 'the guard is the hook in a test');
    // an interior frame sets its own
    hook = () => false;
    session.frame();
    assert.equal(hook(), true, 'held again: a death in the test is turned aside');
    await tick();
    assert.equal(spared, lap + 1, 'and the test ends as Stop test ends it');
    assert.equal(session.active(), false);
    assert.equal(hook(), false, 'the hook that stood is back after the test');
    hook = () => 'stendarr';
  }
});

test('a door after a load keeps the loaded character; a drop is refused while a test runs', async () => {
  const doc = poiV2Example();
  let gone = null, unsealed = 0;
  const ends = [];
  const session = createPoiTest({ pack: () => ({ items: [], goldPieces: 0 }), say: () => {}, feet: () => null, panel: panelRec().panel, gone: () => gone,
    seal: () => ({}), unseal: () => { unsealed++; }, onEnd: (w) => ends.push(w) });
  await session.prepare();
  session.start(doc.id, doc);
  assert.match(session.dropRefusal() ?? '', /cannot drop/);
  gone = 'load';
  session.end('door');
  assert.equal(unsealed, 0, 'the load\'s character is not put back over');
  assert.deepEqual(ends, ['load']);
  assert.equal(session.dropRefusal(), null);
  gone = null;
  session.start(doc.id, doc); session.end('door');
  assert.equal(unsealed, 1, 'a door with no load puts the character back');
});

test('a live runtime\'s close() ends every open dialogue and trade and puts its panel away', async () => {
  const doc = poiV2Example();
  doc.npcs.find((n) => n.key === 'supplier').dialogue = 'captain';
  const rec = panelRec();
  let closed = 0;
  rec.panel.close = () => { closed++; };
  const rt = createPoiDm({ say: () => {}, feet: () => [500, 0, 500], now: () => 0, panel: rec.panel, pack: () => ({ items: [], goldPieces: 0 }), give: () => {} });
  const s = { id: doc.id, rev: 1, doc, place: I, draft: false };
  rt.frame(s, [0, 0, 0], npcsOf(doc, I)); await tick();
  rt.talk(doc.id, 'supplier');
  assert.ok(rt.modelOf(doc.id).dialogue, 'the dialogue is open');
  rt.close();
  assert.equal(rt.modelOf(doc.id).dialogue, null);
  assert.equal(rt.modelOf(doc.id).trade, null);
  assert.ok(closed > 0, 'the panel is put away');
});

test('while a test runs, putting an item in a chest or a body that is not the player\'s is refused', async () => {
  const doc = poiV2Example();
  const session = createPoiTest({ pack: () => ({ items: [], goldPieces: 0 }), say: () => {}, feet: () => null, panel: panelRec().panel });
  await session.prepare();
  const hooks = { loot: { playerOwned: false }, storeRefusal: () => session.storeRefusal(), dropRefusal: () => session.dropRefusal() };
  assert.equal(groundRefusalOf(hooks, {}), null, 'outside a test a chest takes it');
  session.start(doc.id, doc);
  assert.match(groundRefusalOf(hooks, {}) ?? '', /container/);
  assert.match(groundRefusalOf({ ...hooks, loot: { playerOwned: true } }, {}) ?? '', /cannot drop/, 'the ground (or a pile of the player\'s) as before');
  assert.equal(groundRefusalOf(hooks, { usingWagon: true }), null, 'the wagon is the player\'s own');
  session.stop();
});

test('the Test panel\'s Start again restarts the test and redraws without throwing', async () => {
  const doc = poiV2Example();
  const session = createPoiTest({ pack: () => ({ items: [], goldPieces: 5 }), say: () => {}, feet: () => null, panel: panelRec().panel });
  await session.prepare();
  session.start(doc.id, doc);
  const buttons = new Map();
  const el = (tag, cls = '', text = null) => ({ tag, cls, text, kids: [], classList: { add() {} }, append(...k) { this.kids.push(...k); }, addEventListener() {} });
  const btn = (text, fn) => { buttons.set(text, fn); return el('button', '', text); };
  let redrawn = 0;
  createPoiTestPanel({ test: session, el, btn, redraw: () => { redrawn++; }, onStop: () => {} }).view();
  session.setGold(99);
  assert.doesNotThrow(() => buttons.get('Start again')());
  await tick();
  assert.equal(redrawn, 1);
  assert.equal(session.active(), true);
  assert.equal(session.purse().now.goldPieces, 5, 'the purse is copied again');
  session.stop();
});
