// Tests offline POI event and trade settlement (`src/poi/poiDmRuntime.js` with no realm session) against the server
// rules in `server-account/src/poiTrade.js` (`eventClaimPoi` and `tradePoi`). A gift-only event gives its reward once
// per character; every offline character is `local`, so offline that is once per device, across visits too (the claim
// is saved in device storage beside the persistent variables). Item and gold costs are refused when the player has too
// little and taken when the player has enough, counting all takes together and never a worn or quest item; conditions
// read the same inventory; a condition that reads a non-persistent variable is refused; a refused event or trade
// changes nothing; a missing or damaged saved claim counts as a gift not yet given; and an arrow reward is minted as on
// the server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { poiV2Example } from './poiV2Examples.mjs';
import { createPoiDm, mintStack, deviceClaims } from '../src/poi/poiDmRuntime.js';
import { createWeapon } from '../src/combat/enemyEquipment.js';
import { ARROW_TEMPLATE } from '../src/systems/inventory.js';
import { GOLD_INT_MAX } from '../src/systems/item/itemLaw.js';
import { mintGift } from '../server-account/src/staffGive.js';

const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const tick = () => new Promise((r) => setTimeout(r, 0));
const ZONE = { k: 'enter_area', interactive: 'ambush-zone' };

/** The example POI with its zone's events replaced by `events`, run offline over a pack holding `gold` and `items`. */
function setup(events, { gold = 0, items = [], store = new Map(), edit = () => {} } = {}) {
  const doc = poiV2Example();
  doc.events = doc.events.filter((e) => e.key !== 'ambush-start').concat(events);
  edit(doc);
  const player = { items: items.map((s) => (s.templateIndex !== undefined ? s : mintStack(s))), goldPieces: gold };
  const said = [];
  let feet = [500, 0, 500], clock = 0;
  let trade = null;
  const rt = createPoiDm({
    act: null, say: (l) => said.push(l), now: () => clock, character: () => null,
    panel: { dialogue: () => {}, trade: (n, rows, run) => { trade = run; }, close: () => {} },
    pack: () => player,
    give: (recs, g) => { player.items.push(...recs); player.goldPieces += g; },
    feet: () => feet,
    store: { get: (k) => (store.has(k) ? structuredClone(store.get(k)) : null), set: (k, v) => store.set(k, structuredClone(v)) },
  });
  const s = { id: doc.id, rev: 1, doc, place: I, draft: false };
  const step = async () => { clock += 0.1; rt.frame(s, [0, 0, 0], []); await tick(); };
  /** Simulates one visit: start outside the trigger zone, walk in, wait six ticks, and walk back out. */
  const visit = async () => {
    feet = [500, 0, 500];
    await step(); await step();
    feet = [30, 0, 0];
    for (let i = 0; i < 6; i++) await step();
    feet = [500, 0, 500];
    await step();
  };
  const count = (t) => player.items.filter((it) => it.templateIndex === t).reduce((n, it) => n + (it.stackCount ?? 1), 0);
  /** Talk to the supplier and run one of its recipes. @param {string} recipe */
  const buy = async (recipe) => { await step(); rt.talk(doc.id, 'supplier'); trade?.(recipe); await tick(); await tick(); };
  return { doc, rt, player, said, store, visit, count, buy, leave: () => rt.drop(doc.id) };
}

test('offline, a gift event gives the character its gold and item once, on this visit and the next', async () => {
  const w = setup([{ key: 'gift', name: 'Gift', trigger: ZONE, then: [{ k: 'give_gold', amount: 25 }, { k: 'give_item', item: { template: 71, count: 1 } }] }], { gold: 10 });
  await w.visit();
  assert.equal(w.player.goldPieces, 35, 'the gift reached the pack');
  assert.equal(w.count(71), 1);
  await w.visit();
  assert.equal(w.player.goldPieces, 35, 'walking in again on the same visit gives nothing');
  // unload the POI when the player leaves, then load a fresh run on the next visit
  w.leave();
  await w.visit();
  assert.equal(w.player.goldPieces, 35, 'nor on the next visit');
  assert.equal(w.count(71), 1);
  assert.ok([...w.store.keys()].some((k) => k.endsWith('.claims')), 'the claim is saved in the device store');
  assert.deepEqual(w.said, [], 'a gift already given is passed over in silence');
});

test('offline, an event that takes 5 gold is refused with 4 and taken with 5', async () => {
  const fee = [{ key: 'fee', name: 'Fee', trigger: ZONE, then: [{ k: 'take_gold', amount: 5 }, { k: 'say', text: 'Paid.' }] }];
  const poor = setup(fee, { gold: 4 });
  await poor.visit();
  assert.equal(poor.player.goldPieces, 4, 'nothing taken');
  assert.ok(poor.said.some((l) => /enough gold/.test(l)), 'the refusal says gold');
  assert.ok(!poor.said.includes('Paid.'), 'the refused event does not run');
  const rich = setup(fee, { gold: 5 });
  await rich.visit();
  assert.equal(rich.player.goldPieces, 0, 'the 5 gold were taken from the pack');
  assert.ok(rich.said.includes('Paid.'));
  await rich.visit();
  assert.equal(rich.player.goldPieces, 0, 'an exchange may run again; with no gold left it is refused');
});

test('offline, an event that takes items takes them from the pack, and is refused when the pack holds too few', async () => {
  const toll = [{ key: 'toll', name: 'Toll', trigger: ZONE, then: [{ k: 'take_item', item: { template: 72, count: 2 } }, { k: 'give_gold', amount: 3 }] }];
  const w = setup(toll, { items: [{ template: 72, count: 3 }] });
  await w.visit();
  assert.equal(w.count(72), 1);
  assert.equal(w.player.goldPieces, 3);
  await w.visit();
  assert.equal(w.count(72), 1, 'one left is too few');
  assert.equal(w.player.goldPieces, 3);
  assert.ok(w.said.some((l) => /missing items/.test(l)));
});

test('offline, an event\'s condition reads the same pack its takes come from', async () => {
  const ev = [{ key: 'pay', name: 'Pay', trigger: ZONE, when: { k: 'has_gold', amount: 50 }, then: [{ k: 'take_gold', amount: 50 }, { k: 'give_item', item: { template: 71, count: 1 } }], else: [{ k: 'say', text: 'Come back with 50 gold.' }] }];
  const poor = setup(ev, { gold: 49 });
  await poor.visit();
  assert.equal(poor.player.goldPieces, 49);
  assert.ok(poor.said.includes('Come back with 50 gold.'), 'the Otherwise branch ran');
  const rich = setup(ev, { gold: 60 });
  await rich.visit();
  assert.equal(rich.player.goldPieces, 10);
  assert.equal(rich.count(71), 1);
});

test('offline, an event the service would refuse moves nothing', async () => {
  // rejects a condition that reads a non-persistent variable
  const scoped = setup([{ key: 'g', name: 'G', trigger: ZONE, when: { k: 'var', var: 'step', op: 'eq', value: 0 }, then: [{ k: 'give_gold', amount: 7 }] }],
    { edit: (d) => d.variables.push({ key: 'step', name: 'Step', type: 'number', scope: 'instance', initial: 0 }) });
  await scoped.visit();
  assert.equal(scoped.player.goldPieces, 0);
  assert.ok(scoped.said.some((l) => /cannot be done/.test(l)), 'refused as the service refuses it');
  // if any reward item cannot be minted, the whole event is rejected and grants neither the valid item nor the gold
  const unlawful = setup([{ key: 'g', name: 'G', trigger: ZONE, then: [{ k: 'give_gold', amount: 7 }, { k: 'give_item', item: { template: 71, count: 1 } }, { k: 'give_item', item: { template: 99999, count: 1 } }] }]);
  await unlawful.visit();
  assert.equal(unlawful.player.goldPieces, 0);
  assert.equal(unlawful.count(71), 0);
  assert.ok(unlawful.said.some((l) => /cannot be done/.test(l)), 'refused as the service refuses it');
  // a purse that cannot hold the gold
  const full = setup([{ key: 'g', name: 'G', trigger: ZONE, then: [{ k: 'give_gold', amount: 10 }] }], { gold: GOLD_INT_MAX - 5 });
  await full.visit();
  assert.equal(full.player.goldPieces, GOLD_INT_MAX - 5);
  assert.ok(full.said.some((l) => /cannot be done/.test(l)), 'refused as the service refuses it');
  // a rejected gift event does not record a claim
  assert.equal(full.rt.modelOf(full.doc.id).claims['event/g|char:local'], undefined);
});

test('offline, a persistent variable set by an event is saved to device storage when the event settles', async () => {
  const w = setup([{ key: 'mark', name: 'Mark', trigger: ZONE, then: [{ k: 'give_gold', amount: 1 }, { k: 'set_var', var: 'supplies_delivered', to: true }] }]);
  await w.visit();
  assert.equal(w.player.goldPieces, 1);
  const kept = [...w.store.entries()].find(([k]) => !k.endsWith('.claims'))?.[1];
  assert.equal(kept?.supplies_delivered, true);
});

test('offline, a missing or damaged gift claim in the device store reads as not yet given', async () => {
  const gift = [{ key: 'gift', name: 'Gift', trigger: ZONE, then: [{ k: 'give_gold', amount: 25 }] }];
  const id = poiV2Example().id;
  const key = `bunnyfall.poi.${id}.local.claims`;
  const row = 'event/gift|char:local';
  for (const bad of [undefined, null, 'not an object', 7, [], [{ n: 1 }], { [row]: null }, { [row]: 'x' }, { [row]: { n: 'one' } }, { [row]: { n: 0 } }, { [row]: { n: -3 } }, { [row]: { n: 1.5 } }, { [row]: { n: Infinity } }, { 'trade/x|char:local': { n: 1 } }]) {
    const store = new Map();
    if (bad !== undefined) store.set(key, bad);
    const w = setup(gift, { store });
    await w.visit();
    assert.equal(w.player.goldPieces, 25, `given once with ${JSON.stringify(bad)}`);
    await w.visit();
    assert.equal(w.player.goldPieces, 25, `and only once with ${JSON.stringify(bad)}`);
    assert.equal(w.store.get(key)?.[row]?.n, 1, 'the claim is written whole');
  }
  const kept = new Map([[key, { [row]: { n: 1, last: 0 } }]]);
  const again = setup(gift, { store: kept });
  await again.visit();
  assert.equal(again.player.goldPieces, 0, 'a valid saved claim stops the gift from being given again');
});

test('offline, a take the service would refuse is refused: a worn item, a quest\'s item, or the same item taken twice', async () => {
  const swap = (takes) => [{ key: 'swap', name: 'Swap', trigger: ZONE, then: [...takes.map((item) => ({ k: 'take_item', item })), { k: 'give_gold', amount: 100 }, { k: 'say', text: 'Swapped.' }] }];
  const worn = setup(swap([{ template: 72, count: 1 }]), { items: [Object.assign(mintStack({ template: 72, count: 1 }), { equipSlot: 1 })] });
  const quest = setup(swap([{ template: 72, count: 1 }]), { items: [Object.assign(mintStack({ template: 72, count: 3 }), { questItem: true })] });
  const twice = setup(swap([{ template: 72, count: 3 }, { template: 72, count: 3 }]), { items: [{ template: 72, count: 5 }] });
  for (const [name, w, held] of [['worn', worn, 1], ['quest', quest, 3], ['twice', twice, 5]]) {
    await w.visit();
    assert.equal(w.player.goldPieces, 0, `${name}: no reward`);
    assert.equal(w.count(72), held, `${name}: the item stays`);
    assert.ok(!w.said.includes('Swapped.') && w.said.some((l) => /missing items/.test(l)), `${name}: refused as missing items`);
  }
  const ok = setup(swap([{ template: 72, count: 3 }, { template: 72, count: 2 }]), { items: [{ template: 72, count: 5 }] });
  await ok.visit();
  assert.equal(ok.count(72), 0, 'two takes that together fit are both taken');
  assert.equal(ok.player.goldPieces, 100);
});

test('offline, an arrow reward is minted as the service mints it, whatever material it names', async () => {
  for (const material of [undefined, 9]) {
    const w = setup([{ key: 'quiver', name: 'Quiver', trigger: ZONE, then: [{ k: 'give_item', item: { template: ARROW_TEMPLATE, count: 20, ...(material === undefined ? {} : { material }) } }] }]);
    await w.visit();
    const got = w.player.items.filter((it) => it.templateIndex === ARROW_TEMPLATE);
    assert.equal(got.length, 1);
    assert.deepEqual(got[0], { ...createWeapon(ARROW_TEMPLATE, 0, () => 0), stackCount: 20 }, `material ${material}`);
  }
});

test('offline, a trade the service would refuse moves nothing: a reward it cannot mint, or a purse that cannot hold the gold', async () => {
  // the supplier's delivery: 10 of item 71 and 5 of item 72 for its rewards
  const edit = (rewardItems, rewardGold) => (d) => { const r = d.trades.find((t) => t.key === 'supplies').recipes[0]; r.rewardItems = rewardItems; r.rewardGold = rewardGold; };
  const goods = [{ template: 71, count: 10 }, { template: 72, count: 5 }];
  const unmintable = setup([], { items: goods, edit: edit([{ template: 62, count: 1 }, { template: 99999, count: 1 }], 5) });
  await unmintable.buy('delivery');
  assert.equal(unmintable.player.goldPieces, 0, 'no gold');
  assert.deepEqual([unmintable.count(71), unmintable.count(72), unmintable.count(62)], [10, 5, 0], 'the goods stay, and no reward is given');
  assert.ok(unmintable.said.some((l) => /cannot be done/.test(l)), unmintable.said.join(' | '));
  const full = setup([], { items: goods, gold: GOLD_INT_MAX - 1, edit: edit([], 5) });
  await full.buy('delivery');
  assert.equal(full.player.goldPieces, GOLD_INT_MAX - 1);
  assert.deepEqual([full.count(71), full.count(72)], [10, 5]);
  assert.ok(full.said.some((l) => /cannot be done/.test(l)), full.said.join(' | '));
  const fine = setup([], { items: goods, edit: edit([{ template: 62, count: 1 }], 5) });
  await fine.buy('delivery');
  assert.deepEqual([fine.player.goldPieces, fine.count(71), fine.count(62)], [5, 0, 1], 'a lawful trade still settles');
});

test('offline, a trade whose condition reads a non-persistent variable is refused, as the server refuses it', async () => {
  const scoped = (scope) => (d) => {
    d.variables.push({ key: 'step', name: 'Step', type: 'number', scope, initial: 0 });
    d.trades.find((t) => t.key === 'supplies').recipes[0].when = { k: 'var', var: 'step', op: 'eq', value: 0 };
  };
  const goods = [{ template: 71, count: 10 }, { template: 72, count: 5 }];
  for (const scope of ['event', 'instance']) {
    const w = setup([], { items: goods, edit: scoped(scope) });
    await w.buy('delivery');
    assert.deepEqual([w.player.goldPieces, w.count(71), w.count(72)], [0, 10, 5], `${scope}: nothing moves`);
    assert.ok(w.said.some((l) => /cannot be done/.test(l)), `${scope}: ${w.said.join(' | ')}`);
  }
  const kept = setup([], { items: goods, edit: scoped('character') });
  await kept.buy('delivery');
  assert.equal(kept.player.goldPieces, 250, 'a condition on a persistent variable settles');
});

test('offline, a trade whose goods are worn is refused in the service\'s words', async () => {
  const w = setup([], { items: [Object.assign(mintStack({ template: 71, count: 10 }), { equipSlot: 1 }), { template: 72, count: 5 }] });
  await w.buy('delivery');
  assert.equal(w.player.goldPieces, 0);
  assert.equal(w.count(71), 10);
  assert.ok(w.said.includes('You are missing items.'), w.said.join(' | '));
});

const eventTrade = (d) => {
  d.trades.find((t) => t.key === 'supplies').key = 'event';
  for (const e of d.events) for (const a of e.then) if (a.trade === 'supplies') a.trade = 'event';
  for (const o of d.dialogues[0].nodes[0].options) if (o.then.trade === 'supplies') o.then.trade = 'event';
};
const deliveryGift = [{ key: 'delivery', name: 'Delivery gift', trigger: ZONE, then: [{ k: 'give_gold', amount: 25 }] }];
const supplies = [{ template: 71, count: 10 }, { template: 72, count: 5 }];

test('offline, a recipe in a trade keyed event and an event with the recipe\'s key count their limits separately', async () => {
  const w = setup(deliveryGift, { items: supplies, edit: eventTrade });
  await w.visit();
  assert.equal(w.player.goldPieces, 25, 'the gift event gives once');
  await w.buy('delivery');
  assert.equal(w.player.goldPieces, 275, 'the once-per-character recipe still runs after the event');
  const claims = w.rt.modelOf(w.doc.id).claims;
  assert.deepEqual(Object.keys(claims).sort(), ['event/delivery|char:local', 'trade/event/delivery|char:local']);
  const back = setup(deliveryGift, { items: supplies, edit: eventTrade });
  await back.buy('delivery');
  await back.visit();
  assert.equal(back.player.goldPieces, 275, 'the event still gives after the recipe');
});

test('offline, a claim saved on the device under the old name still limits the recipe, and is carried over only once', async () => {
  const key = `bunnyfall.poi.${poiV2Example().id}.local.claims`;
  const old = setup([], { items: supplies, edit: eventTrade, store: new Map([[key, { 'event/delivery|char:local': { n: 1, last: 0 } }]]) });
  await old.buy('delivery');
  assert.deepEqual([old.player.goldPieces, old.count(71)], [0, 10], 'the recipe used before the change stays used');
  assert.ok(old.said.some((l) => /already done/.test(l)), old.said.join(' | '));
  const now = setup([], { items: supplies, edit: eventTrade, store: new Map([[key, { names: 2, 'event/delivery|char:local': { n: 1, last: 0 } }]]) });
  await now.buy('delivery');
  assert.equal(now.player.goldPieces, 250, 'an event claim saved after the change does not limit the recipe');
  assert.equal(now.store.get(key).names, 2, 'the store is saved with its naming version');
  assert.equal(now.store.get(key)['trade/event/delivery|char:local'].n, 1);
});

test('device claims carry an old name over with the larger count and the later time, never a sum', () => {
  const got = deviceClaims({ 'event/a|global': { n: 2, last: 5 }, 'trade/event/a|global': { n: 1, last: 9 }, 'event/b|cool:local': { n: 1, last: 7 }, 'x/y|char:local': { n: 1, last: 1 } });
  assert.deepEqual(got['trade/event/a|global'], { n: 2, last: 9 });
  assert.deepEqual(got['event/a|global'], { n: 2, last: 5 }, 'the old row stays for the event');
  assert.deepEqual(got['trade/event/b|cool:local'], { n: 1, last: 7 });
  assert.equal(got['trade/x/y|char:local'], undefined, 'other names are not copied');
  assert.deepEqual(Object.keys(deviceClaims({ names: 2, 'event/a|global': { n: 2, last: 5 } })), ['event/a|global'], 'a store saved after the change is read as it is');
});

test('offline, a POI gives a named potion as the service mints it, and refuses a recipe the service refuses', async () => {
  const gift = (item) => [{ key: 'potion', name: 'Potion', trigger: ZONE, then: [{ k: 'give_item', item }, { k: 'give_gold', amount: 1 }] }];
  const w = setup(gift({ template: 83, recipe: 'healTrue', count: 2 }));
  await w.visit();
  const got = w.player.items.filter((it) => it.templateIndex === 83);
  assert.deepEqual(got, [mintGift({ template: 83, recipe: 'healTrue', count: 2 }).item], 'two Heal True potions, as the service makes them');
  assert.equal(got[0].value, 100);
  for (const item of [{ template: 83, recipe: 'nonsense', count: 1 }, { template: 71, recipe: 'healTrue', count: 1 }]) {
    const bad = setup(gift(item));
    await bad.visit();
    assert.deepEqual([bad.player.items.length, bad.player.goldPieces], [0, 0], `refused: ${JSON.stringify(item)}`);
    assert.equal(mintGift(item).error, 'staff-item-template', 'the service refuses it too');
  }
});

test('offline, a POI that takes a named potion takes only that potion, not empty bottles or other potions', async () => {
  const take = [{ key: 'drink', name: 'Drink', trigger: ZONE, then: [{ k: 'take_item', item: { template: 83, recipe: 'healTrue', count: 1 } }, { k: 'give_gold', amount: 5 }] }];
  const items = [mintStack({ template: 83, count: 3 }), mintStack({ template: 83, recipe: 'healing', count: 1 }), mintStack({ template: 83, recipe: 'healTrue', count: 2 })];
  const w = setup(take, { items });
  await w.visit();
  assert.equal(w.player.goldPieces, 5);
  assert.deepEqual(w.player.items.map((it) => [it.potionRecipeKey ?? 0, it.stackCount ?? 1]), [[0, 3], [items[1].potionRecipeKey, 1], [items[2].potionRecipeKey, 1]]);
});
