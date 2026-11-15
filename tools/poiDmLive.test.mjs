// Tests the DM fields offered by the in-game DM panel in the live runtime (src/poi/poiDmRuntime.js on poiDmCore.js's
// rules, POI people in scenes/poiNpcs.js, and the POI host's parts): an encounter starting when the player walks into
// its area and, when set to come back, again on the next walk in; a person's talk range and "shown only when"
// condition; an object's look, reach, door and chest behavior, key item, and state taken from a persistent variable;
// and `event` variables resetting on each event run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { poiV2Example } from './poiV2Examples.mjs';
import { createPoiDm, mintStack } from '../src/poi/poiDmRuntime.js';
import { createDm, fire, runEvent } from '../src/poi/poiDmCore.js';
import { npcsOf } from '../src/poi/poiRuntime.js';
import { createPoiNpcs } from '../src/scenes/poiNpcs.js';

const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const tick = () => new Promise((r) => setTimeout(r, 0));

function handOver(name, line, view, on) {
  if (view.ready) { on.give(); return; }
  for (const [k, sec] of view.sections.entries()) {
    const r = sec.chosen < sec.count && sec.rows.find((x) => !x.why && x.n < x.max);
    if (r) { on.set(k, r.g, Math.min(r.max, r.n + sec.count - sec.chosen)); return; }
  }
}

function setup(edit = () => {}, { items = [], store = null } = {}) {
  const doc = poiV2Example();
  edit(doc);
  const said = [], foes = [], shown = [];
  const player = { items: items.map((s) => mintStack(s)), goldPieces: 0 };
  let feet = [500, 0, 500], clock = 0;
  let last = null;
  const panel = { dialogue: (n, l, opts, pick) => { shown.push(l); last = { opts, pick }; }, trade: (n) => shown.push(`trade ${n}`), hand: handOver, close: () => {}, open: () => false };
  const rt = createPoiDm({
    say: (l) => said.push(l), pack: () => player, give: (recs, g) => { player.items.push(...recs); player.goldPieces += g; },
    feet: () => feet, now: () => clock, panel, store,
    spawnFoe: async (foe, at, o) => { const f = { foe, at, o, corpse: false }; foes.push(f); return f; }, isDown: (f) => f.corpse, removeFoe: () => {},
  });
  const s = { id: doc.id, rev: 1, doc, place: I, draft: false };
  let people = [];
  const step = async (dt = 0.1) => { clock += dt; people = rt.frame(s, [0, 0, 0], npcsOf(doc, I)) ?? []; await tick(); };
  return { doc, rt, s, step, said, foes, shown, player, at: (p) => { feet = p; }, people: () => people.map((p) => p.key), dm: () => rt.modelOf(doc.id), last: () => last };
}
const noZoneEvent = (d) => { d.events = d.events.filter((e) => e.key !== 'ambush-start'); };

test('walking into an encounter\'s area starts it with no event', async () => {
  const w = setup(noZoneEvent);
  await w.step(); await w.step();
  assert.equal(w.dm().encounters.ambush, 'idle');
  // inside its 20 m round [35, 0, 0], outside the zone
  w.at([50, 0, 0]);
  await w.step(); await w.step();
  assert.equal(w.dm().encounters.ambush, 'active');
  assert.equal(w.foes.length, 5);
});

test('an encounter set to come back starts again on the next walk in; one set to never does not', async () => {
  for (const respawn of ['on_reentry', 'never']) {
    const w = setup((d) => { noZoneEvent(d); d.encounters[0].respawn = respawn; });
    await w.step();
    w.at([50, 0, 0]); await w.step(); await w.step();
    for (const f of w.foes) f.corpse = true;
    await w.step(); await w.step();
    assert.equal(w.dm().encounters.ambush, respawn === 'never' ? 'done' : 'idle', respawn);
    await w.step();
    assert.equal(w.dm().encounters.ambush, respawn === 'never' ? 'done' : 'idle', `${respawn}: not again while still inside`);
    w.at([500, 0, 500]); await w.step();
    w.at([50, 0, 0]); await w.step(); await w.step();
    assert.equal(w.dm().encounters.ambush, respawn === 'never' ? 'done' : 'active', `${respawn}: on the next walk in`);
  }
});

test('a person shown only when a variable holds stands only while it does', async () => {
  const w = setup((d) => { d.npcs[1].showWhen = { k: 'var', var: 'bridge_unlocked', op: 'eq', value: true }; });
  await w.step(); await w.step();
  assert.ok(!w.people().includes('captain'));
  w.dm().vars.bridge_unlocked = true;
  await w.step();
  assert.ok(w.people().includes('captain'));
});

test('a person\'s talk range is how near the player must be to talk', () => {
  const doc = poiV2Example();
  const rows = npcsOf(doc, I);
  assert.equal(rows.find((n) => n.key === 'captain').reach, 4);
  doc.npcs[1].radius = 12;
  const tex = { recordCount: 1, getSize: () => ({ width: 32, height: 64 }), getScale: () => ({ width: 0, height: 0 }) };
  const npcs = createPoiNpcs({ renderer: { createBillboardBatch: () => ({}), textures: new Set(['x']) }, getTexture: () => tex, feet: () => [0, 0, 0] });
  const sync = () => npcs.sync(doc.id, npcsOf(doc, I), [0, 0, 0]);
  sync();
  return tick().then(() => {
    sync(); npcs.frame();
    const tgt = (key) => npcs.targets().find((x) => x.key === `poinpc:${doc.id}|${key}`);
    assert.equal(tgt('captain').reach, 12);
    assert.equal(tgt('nyra').reach, 4, 'no talk range: the people\'s own');
  });
});

test('a door opens and shuts when used; open, its look\'s part is left out; a locked chest opens with its key only', async () => {
  const w = setup((d) => {
    d.interactives[0].state = 'closed';
    d.interactives.push({ key: 'chest', name: 'Chest', kind: 'chest', appearance: { k: 'part', key: 'stall' }, t: [0, 0, 0], yaw: 0, radius: 6, state: 'locked', keyItem: { template: 72, count: 1 } });
  });
  await w.step(); await w.step();
  const use = (key) => w.rt.extras(w.doc.id).find((x) => x.key.endsWith(`:${key}`)).activate();
  use('gate');
  assert.equal(w.dm().states.gate, 'open');
  await w.step();
  assert.ok(w.rt.off(w.doc.id).has('span'), 'the open gate\'s part is left out');
  use('gate');
  await w.step();
  assert.equal(w.dm().states.gate, 'closed');
  assert.ok(!w.rt.off(w.doc.id).has('span'));
  use('chest');
  assert.equal(w.dm().states.chest, 'locked');
  assert.ok(w.said.some((l) => /Chest is locked/.test(l)));
  const chest = w.rt.extras(w.doc.id).find((x) => x.key.endsWith(':chest'));
  assert.equal(chest.reach, 6, 'used from its own reach');
  assert.deepEqual([...chest.at], [0, 0, 0], 'used where its part stands');
  w.player.items.push(mintStack({ template: 72, count: 1 }));
  use('chest');
  assert.equal(w.dm().states.chest, 'open');
});

test('an object whose state comes from a persistent variable takes it when the POI loads and when an event sets it', async () => {
  const kept = new Map();
  const store = { get: (k) => kept.get(k), set: (k, v) => kept.set(k, v) };
  const edit = (d) => {
    d.variables.push({ key: 'gate-state', name: 'Gate state', type: 'string', scope: 'poi_global', initial: 'locked' });
    d.interactives[0].stateVar = 'gate-state';
    d.events.push({ key: 'open-it', name: 'Open it', trigger: { k: 'chained' }, then: [{ k: 'set_var', var: 'gate-state', to: 'open' }] });
  };
  const w = setup(edit, { store });
  await w.step(); await w.step();
  assert.equal(w.dm().states.gate, 'locked');
  runEvent(w.dm(), 'open-it');
  await w.step(); await w.step();
  assert.equal(w.dm().states.gate, 'open');
  // the next visit (a new run on this device) stands it open
  const w2 = setup(edit, { store });
  await w2.step(); await w2.step();
  assert.equal(w2.dm().states.gate, 'open');
});

test('an event variable starts again from its value at each event run', () => {
  const doc = poiV2Example();
  doc.variables.push({ key: 'tries', name: 'Tries', type: 'number', scope: 'event', initial: 0 });
  doc.events.push({ key: 'count', name: 'Count', trigger: { k: 'interact', interactive: 'gate' }, then: [{ k: 'set_var', var: 'tries', add: 1 }, { k: 'trigger_event', event: 'count2' }] });
  doc.events.push({ key: 'count2', name: 'Count again', trigger: { k: 'chained' }, then: [{ k: 'set_var', var: 'tries', add: 1 }] });
  const dm = createDm(doc);
  fire(dm, { k: 'interact', interactive: 'gate' });
  assert.equal(dm.vars.tries, 2, 'an event another runs at once shares its run');
  fire(dm, { k: 'interact', interactive: 'gate' });
  assert.equal(dm.vars.tries, 2, 'the next run starts again');
});

test('a dialogue an event opens from a zone is shown', async () => {
  const w = setup((d) => { d.events.find((e) => e.key === 'ambush-start').then.push({ k: 'open_dialogue', dialogue: 'captain' }); });
  await w.step(); await w.step();
  w.at([30, 0, 0]);
  await w.step(); await w.step();
  assert.ok(w.shown.length > 0, 'the dialogue was put on the screen');
});

test('a lever starts off, is offered, and flips on or off with each use; a keyed one works only for a holder of the key; an inactive quest object is not offered', async () => {
  const w = setup((d) => {
    d.interactives.push({ key: 'lever', name: 'Lever', kind: 'switch', appearance: { k: 'none' }, t: [6, 0, 6], yaw: 0, radius: 2, state: 'inactive' });
    d.interactives.push({ key: 'crank', name: 'Crank', kind: 'switch', appearance: { k: 'none' }, t: [7, 0, 6], yaw: 0, radius: 2, state: 'inactive', keyItem: { template: 72, count: 1 } });
    d.interactives.push({ key: 'idol', name: 'Idol', kind: 'quest_object', appearance: { k: 'none' }, t: [8, 0, 6], yaw: 0, radius: 2, state: 'inactive' });
    d.events.push({ key: 'pull', name: 'Pull', trigger: { k: 'interact', interactive: 'lever' }, then: [{ k: 'say', text: 'lever pulled' }] });
    d.events.push({ key: 'turn', name: 'Turn', trigger: { k: 'interact', interactive: 'crank' }, then: [{ k: 'say', text: 'crank turned' }] });
  });
  await w.step(); await w.step();
  const target = (k) => w.rt.extras(w.doc.id).find((x) => x.key.endsWith(`:${k}`));
  assert.ok(target('lever'), 'a lever made off is offered');
  target('lever').activate();
  assert.equal(w.dm().states.lever, 'active');
  assert.ok(w.said.includes('lever pulled'));
  target('lever').activate();
  assert.equal(w.dm().states.lever, 'inactive', 'the next use flips it off');
  target('crank').activate();
  assert.equal(w.dm().states.crank, 'inactive', 'no key: it does not flip');
  assert.ok(!w.said.includes('crank turned') && w.said.some((l) => /Crank is locked/.test(l)));
  w.player.items.push(mintStack({ template: 72, count: 1 }));
  target('crank').activate();
  assert.equal(w.dm().states.crank, 'active');
  assert.ok(w.said.includes('crank turned'));
  assert.equal(target('idol'), undefined, 'an inactive quest object is not offered');
});

test('an encounter started by walking in runs its start event as a run of its own', async () => {
  const w = setup((d) => {
    noZoneEvent(d);
    d.encounters[0].respawn = 'on_reentry';
    d.variables.push({ key: 'seen', name: 'Seen', type: 'string', scope: 'event', initial: 'fresh' });
    d.events.push({ key: 'enc-start', name: 'Start', trigger: { k: 'chained' }, then: [{ k: 'say', text: 'start' }, { k: 'set_var', var: 'seen', to: 'stale' }] });
    d.encounters[0].onStart = 'enc-start';
  });
  const seen = [];
  await w.step();
  for (let round = 0; round < 2; round++) {
    w.at([50, 0, 0]); await w.step(); await w.step();
    seen.push(w.dm().log.filter((l) => l.k === 'set_var' && l.var === 'seen').at(-1)?.was);
    for (const f of w.foes) f.corpse = true;
    await w.step(); await w.step();
    w.at([500, 0, 500]); await w.step();
  }
  assert.deepEqual(seen, ['fresh', 'fresh']);
});

test('talking draws the dialogue once', async () => {
  const shown = [];
  const w = setup();
  await w.step();
  const n0 = w.shown.length;
  w.rt.talk(w.doc.id, 'captain');
  await w.step(); await w.step();
  shown.push(w.shown.length - n0);
  assert.deepEqual(shown, [1], 'the dialogue is drawn once');
});

test('a dialogue answer that opens a trade ends the talk, so the trade shows', async () => {
  const w = setup((d) => { d.dialogues.find((x) => x.key === 'captain').nodes[0].options.push({ text: 'Show me your wares.', then: { k: 'open_trade', trade: 'nyra' } }); });
  await w.step();
  w.rt.talk(w.doc.id, 'captain');
  const dm = w.dm();
  const { choose, dialogueNow } = await import('../src/poi/poiDmCore.js');
  const i = dialogueNow(dm).options.find((o) => o.text === 'Show me your wares.').i;
  choose(dm, i, { run: false });
  assert.equal(dm.dialogue, null);
  assert.equal(dm.trade, 'nyra');
});

test('an answer that opens a trade, picked on the screen, draws the trade once', async () => {
  const w = setup((d) => { d.dialogues.find((x) => x.key === 'captain').nodes[0].options.push({ text: 'Wares?', then: { k: 'open_trade', trade: 'nyra' } }); });
  await w.step();
  w.rt.talk(w.doc.id, 'captain');
  await w.step();
  const d = w.last();
  d.pick(d.opts.find((o) => o.text === 'Wares?').i);
  await w.step(); await w.step();
  assert.equal(w.shown.filter((x) => /^trade /.test(x)).length, 1);
});
