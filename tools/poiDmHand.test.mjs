// Tests the POI hand-over (src/poi/poiDmRuntime.js): the player chooses the records before an event or trade runs;
// Cancel, the timeout, a dropped POI, a new revision, and close() hand over nothing; online, the chosen records leave
// the pack while the act is out and come back on a refusal.
//   node --test tools/poiDmHand.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { poiV2Example } from './poiV2Examples.mjs';
import { createPoiDm, mintStack, HAND_IDLE_S } from '../src/poi/poiDmRuntime.js';
import { handRecord } from '../src/poi/poiSettle.js';

const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const tick = () => new Promise((r) => setTimeout(r, 0));
const ZONE = { k: 'enter_area', interactive: 'ambush-zone' };
const SWORD = { template: 120, group: 'Weapons', count: 1 };
const iron = () => mintStack(SWORD);
const enchanted = () => ({ ...mintStack(SWORD), enchantments: [{ type: 1, param: 2 }] });

function setup(events, { items = [], gold = 0, act = null, edit = () => {}, ownPanel = false, cursor = undefined } = {}) {
  const doc = poiV2Example();
  doc.events = doc.events.filter((e) => e.key !== 'ambush-start').concat(events);
  edit(doc);
  const player = { items, goldPieces: gold };
  const said = [], hands = [];
  let feet = [500, 0, 500], clock = 0, trade = null, closed = 0, dialogues = 0;
  const panel = {
    dialogue: () => { dialogues++; }, trade: (n, rows, run) => { trade = run; }, close: () => { closed++; }, open: () => false,
    hand: (name, line, view, on) => { hands.push({ name, line, view, on }); },
  };
  const rt = createPoiDm({
    act, say: (l) => said.push(l), now: () => clock, character: () => null, panel: ownPanel ? undefined : panel, cursor,
    pack: () => player, give: (recs, g) => { player.items.push(...recs); player.goldPieces += g; }, feet: () => feet,
    store: { get: () => null, set: () => {} },
  });
  const s = { id: doc.id, rev: 1, doc, place: I, draft: false };
  const step = async (dt = 0.1) => { await tick(); clock += dt; rt.frame(s, [0, 0, 0], []); await tick(); await tick(); };
  const walkIn = async () => { feet = [500, 0, 500]; await step(); feet = [30, 0, 0]; await step(); await step(); };
  const walkOut = async () => { feet = [500, 0, 500]; await step(); };
  const last = () => hands.at(-1);
  return { doc, rt, s, player, said, hands, last, step, walkIn, walkOut, buy: (/** @type {string} */ k) => { rt.talk(doc.id, 'supplier'); trade?.(k); }, closed: () => closed, dialogues: () => dialogues };
}

function fakeDoc() {
  const node = (tag) => ({
    tag, style: {}, kids: [], attrs: {}, listeners: {}, textContent: '', disabled: false,
    setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; }, hasAttribute(k) { return k in this.attrs; },
    appendChild(c) { this.kids.push(c); return c; }, append(...c) { this.kids.push(...c); }, replaceChildren(...c) { this.kids = c; },
    remove() { const i = body.kids.indexOf(this); if (i >= 0) body.kids.splice(i, 1); }, addEventListener(type, fn) { this.listeners[type] = fn; },
  });
  const body = node('body');
  const find = (n, attr) => (n.attrs[attr] !== undefined ? n : n.kids.map((k) => find(k, attr)).find(Boolean));
  const byText = (n, text) => (n.tag === 'button' && n.textContent === text ? n : n.kids.map((k) => byText(k, text)).find(Boolean));
  return { createElement: node, body, find: (attr) => find(body, attr), button: (text) => byText(body, text), click: (n) => n.listeners.click({ stopPropagation() {} }) };
}

/** @param {any} h */
const plainRow = (h) => h.view.sections[0].rows.find((/** @type {any} */ r) => r.text === 'Iron Longsword (New)');

const toll = [{ key: 'toll', name: 'Toll', trigger: ZONE, then: [{ k: 'say', text: 'Before.' }, { k: 'take_item', item: SWORD }, { k: 'say', text: 'After.' }, { k: 'give_gold', amount: 3 }] }];

test('an event started by walking in asks first: none of it runs until the chosen record is handed over, and only that record leaves', async () => {
  const w = setup(toll, { items: [enchanted(), iron()] });
  await w.walkIn();
  assert.equal(w.hands.length, 1, 'the hand-over opened');
  const h = w.last();
  assert.equal(h.name, 'Bridge Market', 'a zone event\'s hand-over is titled with the POI\'s name');
  assert.equal(h.view.sections[0].rows.length, 2, 'two different longswords, two rows');
  assert.equal(h.view.ready, false, 'two different items: nothing is chosen for the player');
  assert.deepEqual(w.said, [], 'no line of the event before the hand-over');
  assert.equal(w.player.items.length, 2);
  const ironRow = plainRow(h);
  h.on.set(0, ironRow.g, 1);
  assert.equal(w.last().view.ready, true);
  w.last().on.give();
  await w.step();
  assert.deepEqual(w.said, ['Before.', 'After.'], 'the event runs in order after the hand-over');
  assert.equal(w.player.items.length, 1);
  assert.ok(w.player.items[0].enchantments, 'the enchanted one stays');
  assert.equal(w.player.goldPieces, 3);
});

test('Cancel and the timeout leave the pack as it was, and the next event runs after', async () => {
  const gift = { key: 'gift', name: 'Gift', trigger: ZONE, then: [{ k: 'give_gold', amount: 7 }] };
  const w = setup([...toll, gift], { items: [iron()] });
  await w.walkIn();
  assert.equal(w.last().view.ready, true, 'one item that fits: the section starts filled');
  w.last().on.cancel();
  await w.step(); await w.step();
  assert.equal(w.player.items.length, 1);
  assert.ok(w.said.includes('Nothing was handed over.'));
  assert.equal(w.player.goldPieces, 7, 'the gift waited behind the hand-over and ran after it');
  assert.ok(!w.said.includes('Before.'));
  await w.walkOut(); await w.walkIn();
  assert.equal(w.hands.length, 2, 'walking in again asks again');
  for (let t = 0; t < HAND_IDLE_S + 1; t += 1) await w.step(1);
  assert.equal(w.player.items.length, 1, 'the timeout hands over nothing');
  assert.equal(w.said.filter((l) => l === 'Nothing was handed over.').length, 2);
  await w.walkOut(); await w.walkIn();
  const h = w.last();
  for (let t = 0; t < HAND_IDLE_S - 10; t += 1) await w.step(1);
  h.on.set(0, h.view.sections[0].rows[0].g, 0);
  for (let t = 0; t < HAND_IDLE_S - 10; t += 1) await w.step(1);
  w.last().on.set(0, h.view.sections[0].rows[0].g, 1);
  w.last().on.give();
  await w.step();
  assert.equal(w.player.items.length, 0, 'handed over before its wait ran out');
});

test('dropping the POI, a new revision, and close() end an open hand-over, and an event fired twice asks once', async () => {
  const w = setup(toll, { items: [iron()] });
  await w.walkIn();
  await w.walkOut(); await w.walkIn();
  assert.equal(w.hands.length, 1, 'fired again while it asks: still one hand-over');
  w.last().on.give();
  await w.step(); await w.step();
  assert.equal(w.hands.length, 1, 'and not asked again after');
  assert.equal(w.player.items.length, 0);
  for (const end of ['drop', 'rev', 'close']) {
    const v = setup(toll, { items: [iron()] });
    await v.walkIn();
    assert.equal(v.hands.length, 1);
    if (end === 'drop') v.rt.drop(v.doc.id);
    else if (end === 'close') v.rt.close();
    else v.rt.frame({ ...v.s, rev: 2 }, [0, 0, 0], []);
    await tick();
    v.last().on.give();
    await tick();
    assert.equal(v.player.items.length, 1, `${end}: nothing handed over`);
  }
});

test('online, the act names the records and the branch, takes them out of the pack while it is out, and puts them back on a refusal', async () => {
  const sent = [];
  let answer = null, during = null;
  const act = async (path, body, o) => {
    if (o?.read) return { ok: true, data: { vars: {} } };
    sent.push({ path, body });
    const undo = o?.reserve?.() ?? null;
    during = player.items.map((r) => !!r.enchantments);
    const a = answer(body);
    if (!a.ok) undo?.();
    return a;
  };
  let player = null;
  const w = setup(toll, { items: [enchanted(), iron()], act });
  player = w.player;
  await w.step(); await w.step();
  answer = () => ({ ok: false, error: 'poi-hand' });
  await w.walkIn();
  const h = w.last();
  const ironRow = plainRow(h);
  h.on.set(0, ironRow.g, 1); w.last().on.give();
  await w.step(); await w.step();
  const b = sent.at(-1).body;
  assert.equal(b.branch, 'then');
  assert.deepEqual(b.hand, [[{ at: 1, n: 1, rec: handRecord(player.items[1]) }]]);
  assert.deepEqual(during, [true], 'the chosen record is out of the pack during the act');
  assert.deepEqual(player.items.map((r) => !!r.enchantments), [true, false], 'and came back on the refusal');
  assert.ok(w.said.includes('Your items changed. Nothing was handed over.'));
  answer = (body) => ({ ok: true, data: { branch: 'then', took: { items: [SWORD], gold: 0, picks: [{ at: body.hand[0][0].at, n: 1 }] }, gave: { items: [], gold: 3 }, vars: {} } });
  await w.walkOut(); await w.walkIn();
  w.last().on.set(0, ironRow.g, 1); w.last().on.give();
  await w.step(); await w.step();
  assert.deepEqual(player.items.map((r) => !!r.enchantments), [true]);
  assert.equal(player.goldPieces, 3);
  assert.ok(w.said.includes('After.'));
});

test('online, a service that answers no picks chose the records itself, and the pack follows it', async () => {
  let player = null;
  const act = async (path, body, o) => {
    if (o?.read) return { ok: true, data: { vars: {} } };
    o?.reserve?.();
    return { ok: true, data: { branch: 'then', took: { items: [SWORD], gold: 0 }, gave: { items: [], gold: 3 }, vars: {} } };
  };
  const w = setup(toll, { items: [enchanted(), iron()], act });
  player = w.player;
  await w.step(); await w.step();
  await w.walkIn();
  const h = w.last();
  const ironRow = plainRow(h);
  h.on.set(0, ironRow.g, 1); w.last().on.give();
  await w.step(); await w.step();
  assert.equal(player.items.length, 1, 'one longsword taken, not two');
  assert.equal(!!player.items[0].enchantments, false, 'the old service took the first one; the pack follows the service');
});

test('a trade that takes only gold asks too, and a trade whose only matching item is worn is refused before any hand-over', async () => {
  const w = setup([], {
    items: [{ ...iron(), equipSlot: 1 }, mintStack({ template: 71, count: 10 }), mintStack({ template: 72, count: 5 })], gold: 20,
    edit: (d) => { d.npcs.find((n) => n.key === 'supplier').trade = 'supplies'; d.trades[1].recipes.push({ key: 'fee', name: 'Pay a fee', requireItems: [], requireGold: 5, rewardItems: [], rewardGold: 0, limitMode: 'unlimited' }, { key: 'sword', name: 'Sell a sword', requireItems: [SWORD], requireGold: 0, rewardItems: [], rewardGold: 1, limitMode: 'unlimited' }); },
  });
  await w.step();
  w.buy('fee');
  await tick();
  assert.equal(w.hands.length, 1);
  assert.equal(w.last().view.gold, 5);
  assert.equal(w.last().view.ready, true, 'nothing to choose');
  assert.equal(w.player.goldPieces, 20, 'nothing moves before Hand over');
  w.last().on.give();
  await tick(); await tick();
  assert.equal(w.player.goldPieces, 15);
  w.buy('sword');
  await tick();
  assert.equal(w.hands.length, 1, 'a worn sword cannot be sold: refused before any hand-over');
  assert.ok(w.said.includes('missing items'));
});

test('a condition on the item an event takes counts only what can be handed over: a worn sword sends it to Otherwise', async () => {
  const ev = [{ key: 'toll', name: 'Toll', trigger: ZONE, when: { k: 'has_item', item: SWORD }, then: [{ k: 'take_item', item: SWORD }], else: [{ k: 'say', text: 'Bring a sword.' }] },
    { key: 'look', name: 'Look', trigger: ZONE, when: { k: 'has_item', item: SWORD }, then: [{ k: 'say', text: 'Nice sword.' }] }];
  const w = setup(ev, { items: [{ ...iron(), equipSlot: 1 }] });
  await w.walkIn(); await w.step();
  assert.equal(w.hands.length, 0, 'no hand-over for a sword that cannot leave');
  assert.ok(w.said.includes('Bring a sword.'));
  assert.ok(w.said.includes('Nice sword.'), 'a condition on an event that takes nothing still counts the worn sword');
});

test('a wagon that carries goods shows as Carrying goods and cannot be picked; an empty one can', async () => {
  const CART = { template: 93, group: 'Transportation', count: 1 };
  const sell = [{ key: 'cart', name: 'Cart', trigger: ZONE, then: [{ k: 'take_item', item: CART }] }];
  const loaded = setup(sell, { items: [mintStack(CART), mintStack(CART)] });
  loaded.player.wagonItems = [mintStack({ template: 71, count: 40 })];
  await loaded.walkIn();
  const driven = loaded.player.items[0];
  const rows = loaded.last()?.view.sections[0].rows.map((r) => [r.why, r.max]);
  assert.deepEqual(rows, [['Carrying goods', 0], [null, 1]], 'the driven cart is locked, the other may go');
  loaded.last().on.give();
  await loaded.step();
  assert.deepEqual(loaded.player.items, [driven], 'the cart that carries the goods stays');
});

test('another POI\'s talk opened during a hand-over is drawn once the hand-over ends', async () => {
  const w = setup(toll, { items: [iron()] });
  const doc2 = poiV2Example();
  doc2.id = 'poi-0123456789b2';
  doc2.events = [{ key: 'greet', name: 'Greet', trigger: ZONE, then: [{ k: 'open_dialogue', dialogue: doc2.dialogues[0].key }] }];
  const s2 = { id: doc2.id, rev: 1, doc: doc2, place: I, draft: false };
  const drawn = [];
  const both = async () => { await w.step(); w.rt.frame(s2, [0, 0, 0], []); await tick(); };
  await both();
  await w.walkIn(); await both(); await both();
  assert.equal(w.hands.length, 1, 'the toll asks');
  assert.ok(w.rt.modelOf(doc2.id).dialogue, 'the second POI opened its dialogue meanwhile');
  drawn.push(w.dialogues());
  w.last().on.cancel();
  await both(); await both();
  assert.equal(w.dialogues() > drawn[0], true, 'and it is drawn after the hand-over');
});

test('online, a shared variable another player changed is read again after a refusal, and the event runs its other branch', async () => {
  const forge = [{ key: 'forge', name: 'Forge', trigger: ZONE, when: { k: 'var', var: 'forge_level', op: 'lt', value: 3 },
    then: [{ k: 'take_item', item: SWORD }, { k: 'set_var', var: 'forge_level', add: 1 }], else: [{ k: 'say', text: 'The forge is finished.' }] }];
  let level = 2;
  const sent = [];
  const act = async (path, body, o) => {
    if (o?.read) return { ok: true, data: { vars: { forge_level: level } } };
    sent.push(body);
    const branch = level < 3 ? 'then' : 'else';
    if (body.branch !== branch) return { ok: false, error: 'poi-hand' };
    return { ok: true, data: { branch, took: { items: [], gold: 0, picks: [] }, gave: { items: [], gold: 0 }, vars: { forge_level: level } } };
  };
  const w = setup(forge, { items: [iron()], act, edit: (d) => d.variables.push({ key: 'forge_level', name: 'Forge level', type: 'number', scope: 'poi_global', initial: 0 }) });
  await w.step(); await w.step();
  level = 3;
  await w.walkIn();
  w.last().on.give();
  for (let i = 0; i < 4; i++) await w.step();
  assert.deepEqual(sent.map((b) => b.branch), ['then', 'else'], 'the second try names the branch the service reads');
  assert.ok(w.said.includes('The forge is finished.'));
  assert.ok(!w.said.includes('Your items changed. Nothing was handed over.'));
  assert.equal(w.player.items.length, 1, 'the sword stays');
});

test('online, a hand-over of more separate records than the service accepts asks for larger stacks and sends nothing', async () => {
  const ORE = { template: 71, count: 40 };
  const sent = [];
  const act = async (path, body, o) => (o?.read ? { ok: true, data: { vars: {} } } : (sent.push(body), { ok: false, error: 'poi-items' }));
  const w = setup([{ key: 'ore', name: 'Ore', trigger: ZONE, then: [{ k: 'take_item', item: ORE }] }], { items: Array.from({ length: 40 }, () => mintStack({ template: 71, count: 1 })), act });
  await w.step(); await w.step();
  await w.walkIn();
  assert.equal(w.last().view.ready, true);
  w.last().on.give();
  await w.step();
  assert.equal(w.last().view.note, 'Too many separate items. Choose larger stacks.');
  assert.deepEqual(sent, []);
  assert.equal(w.player.items.length, 40);
});

test('online, an event the service refuses because others changed a shared value at the same moment says so', async () => {
  const act = async (path, body, o) => (o?.read ? { ok: true, data: { vars: {} } } : { ok: false, error: 'poi-raced' });
  const w = setup([{ key: 'gift', name: 'Gift', trigger: ZONE, then: [{ k: 'give_gold', amount: 7 }] }], { act });
  await w.step(); await w.step();
  await w.walkIn(); await w.step();
  assert.ok(w.said.includes('Someone else is doing this right now. Try again.'), w.said.join(' | '));
  assert.equal(w.player.goldPieces, 0);
});

test('the hand-over frees the mouse while it is up and gives it back when it closes', async () => {
  const was = globalThis.document;
  const doc = fakeDoc();
  globalThis.document = doc;
  try {
    let held = 0, released = 0;
    const w = setup(toll, { items: [iron()], ownPanel: true, cursor: () => { held++; return () => { released++; }; } });
    await w.walkIn();
    assert.ok(doc.find('data-poi-hand'), 'the hand-over is drawn');
    assert.deepEqual([held, released], [1, 0]);
    doc.click(doc.find('data-hand-cancel'));
    await w.step();
    assert.deepEqual([held, released], [1, 1], 'Cancel gives the mouse back');
    await w.walkOut(); await w.walkIn();
    assert.deepEqual([held, released], [2, 1]);
    await w.step(HAND_IDLE_S);
    assert.equal(doc.find('data-poi-dm'), undefined, 'the timeout closes it');
    assert.deepEqual([held, released], [2, 2]);
  } finally { globalThis.document = was; }
});

test('a click on Hand over in the first half second after the hand-over appears does nothing (the second click of a double click)', async () => {
  const was = globalThis.document;
  const doc = fakeDoc();
  globalThis.document = doc;
  try {
    const w = setup(toll, { items: [iron()], ownPanel: true });
    await w.walkIn();
    const give = doc.find('data-hand-give');
    assert.equal(give.disabled, false, 'the only matching item is chosen already');
    doc.click(give);
    await w.step();
    assert.equal(w.player.items.length, 1, 'nothing handed over yet');
    await new Promise((r) => setTimeout(r, 550));
    doc.click(doc.find('data-hand-give'));
    await w.step();
    assert.equal(w.player.items.length, 0, 'handed over once the button is armed');
    assert.deepEqual(w.said, ['Before.', 'After.']);
  } finally { globalThis.document = was; }
});

test('a dialogue an event opens leaves the mouse to the player; a talk the player starts frees it until Leave', async () => {
  const was = globalThis.document;
  const doc = fakeDoc();
  globalThis.document = doc;
  try {
    let held = 0, released = 0;
    const greet = { key: 'greet', name: 'Greet', trigger: ZONE, then: [{ k: 'open_dialogue', dialogue: 'captain' }] };
    const w = setup([greet], { ownPanel: true, cursor: () => { held++; return () => { released++; }; }, edit: (d) => { d.npcs.find((n) => n.key === 'supplier').dialogue = 'captain'; } });
    await w.walkIn();
    assert.ok(doc.find('data-poi-dm'), 'the event opened the dialogue');
    assert.deepEqual([held, released], [0, 0], 'no hold for a dialogue the player did not start');
    doc.click(doc.button('Leave'));
    assert.equal(w.rt.talk(w.doc.id, 'supplier'), true);
    assert.ok(doc.find('data-poi-dm'));
    assert.deepEqual([held, released], [1, 0], 'Talk frees the mouse');
    doc.click(doc.button('Leave'));
    assert.deepEqual([held, released], [1, 1], 'Leave gives it back');
  } finally { globalThis.document = was; }
});

test('a dialogue the player opens by using a switch frees the mouse until Leave', async () => {
  const was = globalThis.document;
  const doc = fakeDoc();
  globalThis.document = doc;
  try {
    let held = 0, released = 0;
    const bell = { key: 'ring', name: 'Ring', trigger: { k: 'interact', interactive: 'bell' }, then: [{ k: 'open_dialogue', dialogue: 'captain' }] };
    const w = setup([bell], { ownPanel: true, cursor: () => { held++; return () => { released++; }; }, edit: (d) => {
      d.interactives.push({ key: 'bell', name: 'Bell', kind: 'switch', appearance: { k: 'none' }, t: [0, 0, 0], yaw: 0, radius: 3, state: 'inactive' });
    } });
    await w.step();
    w.rt.extras(w.doc.id).find((x) => x.key.endsWith(':bell')).activate();
    assert.ok(doc.find('data-poi-dm'), 'the switch opened the dialogue');
    assert.deepEqual([held, released], [1, 0], 'Use frees the mouse');
    doc.click(doc.button('Leave'));
    assert.deepEqual([held, released], [1, 1], 'Leave gives it back');
    w.rt.extras(w.doc.id).find((x) => x.key.endsWith(':bell')).activate();
    await w.step();
    assert.deepEqual([held, released], [2, 1], 'used again: the dialogue opens again and holds again');
  } finally { globalThis.document = was; }
});

test('a Use at one POI that opens nothing there leaves another POI\'s dialogue and its mouse hold as they are', async () => {
  const was = globalThis.document;
  const doc = fakeDoc();
  globalThis.document = doc;
  try {
    let held = 0, released = 0;
    const w = setup([], { ownPanel: true, cursor: () => { held++; return () => { released++; }; }, edit: (d) => { d.npcs.find((n) => n.key === 'supplier').dialogue = 'captain'; } });
    const other = structuredClone(w.doc);
    other.id = `${w.doc.id}b`;
    other.events = [];
    other.interactives.push({ key: 'shed', name: 'Shed door', kind: 'door', appearance: { k: 'none' }, t: [0, 0, 0], yaw: 0, radius: 3, state: 'closed' });
    const s2 = { ...w.s, id: other.id, doc: other };
    w.rt.frame(s2, [0, 0, 0], []);
    await w.step();
    assert.equal(w.rt.talk(w.doc.id, 'supplier'), true);
    assert.deepEqual([held, released], [1, 0]);
    w.rt.extras(other.id).find((x) => x.key.endsWith(':shed')).activate();
    await w.step();
    w.rt.frame(s2, [0, 0, 0], []);
    assert.ok(doc.find('data-poi-dm'), 'the first POI\'s dialogue is still up');
    assert.deepEqual([held, released], [1, 0], 'and the mouse stays free');
    doc.click(doc.button('Leave'));
    assert.deepEqual([held, released], [1, 1]);
  } finally { globalThis.document = was; }
});
