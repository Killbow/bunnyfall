// The game logic of a v2 POI (src/poi/poiDmCore.js) run on the four worked scenarios of tools/poiV2Examples.mjs, and the
// save-side rules (src/poi/poiSettle.js) the account service settles with.

import test from 'node:test';
import assert from 'node:assert/strict';
import { poiV2Example } from './poiV2Examples.mjs';
import { createDm, fire, runEvent, runRecipe, recipeBlock, completeEncounter, openDialogue, dialogueNow, choose, advance, claimRule, eventRule, evalWhen, createWalker, stepWalker, needsService, valueOf } from '../src/poi/poiDmCore.js';
import { takeStacks, takeGold, giveGoods, countOf } from '../src/poi/poiSettle.js';

const doc = () => poiV2Example();

test('the ambush: entering the zone starts the encounter, finishing it opens the gate and sets the variable', () => {
  const dm = createDm(doc());
  assert.deepEqual(fire(dm, { k: 'enter_area', interactive: 'ambush-zone' }), ['ambush-start']);
  assert.equal(dm.encounters.ambush, 'active');
  assert.equal(completeEncounter(dm, 'ambush'), true);
  assert.equal(dm.encounters.ambush, 'done');
  assert.equal(dm.states.gate, 'open');
  assert.equal(dm.vars.bridge_unlocked, true);
  assert.ok(dm.log.some((l) => l.k === 'say' && /clear/.test(l.text)));
  assert.equal(completeEncounter(dm, 'ambush'), false, 'a finished encounter is finished once');
});

test('the supplier: the else branch tells what is missing, the then branch opens the trade', () => {
  const dm = createDm(doc());
  assert.deepEqual(fire(dm, { k: 'npc_talk', npc: 'supplier' }), ['supplier-talk']);
  assert.equal(dm.trade, null);
  assert.ok(dm.log.some((l) => l.k === 'say' && /missing/.test(l.text)));
  const rich = createDm(doc(), { items: [{ template: 71, count: 10 }, { template: 72, count: 5 }] });
  fire(rich, { k: 'npc_talk', npc: 'supplier' });
  assert.equal(rich.trade, 'supplies');
});

test('the delivery recipe takes the goods, pays once per character and runs its event', () => {
  const dm = createDm(doc(), { items: [{ template: 71, count: 12 }, { template: 72, count: 5 }], gold: 5 });
  assert.equal(recipeBlock(dm, 'supplies', 'delivery'), null);
  assert.deepEqual(runRecipe(dm, 'supplies', 'delivery'), { ok: true });
  assert.equal(dm.gold, 255);
  assert.deepEqual(dm.items, [{ template: 71, count: 2 }]);
  assert.equal(dm.vars.supplies_delivered, true);
  assert.deepEqual(runRecipe(dm, 'supplies', 'delivery'), { ok: false, why: 'items' });
  dm.items.push({ template: 71, count: 10 }, { template: 72, count: 5 });
  assert.equal(recipeBlock(dm, 'supplies', 'delivery'), 'limit', 'once per character');
});

test('the brew: unlimited, needs every ingredient, gives the elixir', () => {
  const dm = createDm(doc(), { items: [{ template: 16, count: 10 }, { template: 42, count: 5 }] });
  assert.equal(runRecipe(dm, 'nyra', 'brew').ok, true);
  assert.equal(runRecipe(dm, 'nyra', 'brew').ok, true, 'unlimited with a price');
  assert.equal(runRecipe(dm, 'nyra', 'brew').why, 'items');
  assert.equal(dm.items.find((s) => s.template === 62).count, 2);
});

test('a dialogue walks its nodes, offers only the options that hold, and a pick runs its recipe', () => {
  const dm = createDm(doc(), { items: [{ template: 71, count: 10 }, { template: 72, count: 5 }] });
  assert.equal(openDialogue(dm, 'captain'), true);
  assert.equal(dialogueNow(dm).say, 'Halt. State your business.');
  choose(dm, 0);
  assert.equal(dialogueNow(dm).node, 'story');
  choose(dm, 0);
  choose(dm, 1);
  assert.equal(dm.gold, 250);
  assert.equal(choose(dm, 9), null, 'an option that is not offered is not taken');
});

test('a delayed event waits for the clock and a zero-delay chain is bounded', () => {
  const d = doc();
  d.events.push({ key: 'later', trigger: { k: 'chained' }, then: [{ k: 'say', text: 'later' }] });
  d.events[0].then.push({ k: 'trigger_event', event: 'later', delayS: 30 });
  const dm = createDm(d);
  fire(dm, { k: 'enter_area', interactive: 'ambush-zone' });
  assert.equal(dm.queue.length, 1);
  assert.deepEqual(advance(dm, 29), []);
  assert.deepEqual(advance(dm, 2), ['later']);
  const loop = { ...doc(), events: [{ key: 'a', trigger: { k: 'chained' }, then: [{ k: 'trigger_event', event: 'a', delayS: 0 }] }] };
  const dm2 = createDm(loop);
  assert.equal(runEvent(dm2, 'a').ran, true);
  assert.ok(dm2.log.some((l) => l.k === 'refused' && l.why === 'depth'));
});

test('events that give and take: refused whole when the visitor cannot pay, and a settled one only notes what moved', () => {
  const d = doc();
  d.events.push({ key: 'toll', trigger: { k: 'interact', interactive: 'gate' }, then: [{ k: 'take_gold', amount: 20 }, { k: 'give_item', item: { template: 16, count: 2 } }] });
  const poor = createDm(d, { gold: 5 });
  assert.deepEqual(runEvent(poor, 'toll'), { ran: false, why: 'gold' });
  assert.equal(poor.items.length, 0);
  const rich = createDm(d, { gold: 25 });
  assert.equal(runEvent(rich, 'toll').ran, true);
  assert.equal(rich.gold, 5);
  assert.equal(rich.items[0].count, 2);
  const settled = createDm(d, { gold: 25 });
  runEvent(settled, 'toll', { settled: true });
  assert.equal(settled.gold, 25, 'the service moved it, the model is told');
  assert.equal(needsService(d, d.events.at(-1).then), true);
  assert.deepEqual(valueOf(d.events.at(-1).then), { takeItems: [], giveItems: [{ template: 16, count: 2 }], takeGold: 20, giveGold: 0 });
});

test('limits: where each mode counts, and cooldown and daily reset', () => {
  const who = { char: 'c1', player: 'p1', nowS: 86400 * 3 + 5 };
  assert.deepEqual(claimRule({ limitMode: 'once_per_account' }, who), [{ scope: 'acct:p1', max: 1 }]);
  assert.deepEqual(claimRule({ limitMode: 'daily_per_char' }, who), [{ scope: 'day:c1:3', max: 1 }]);
  assert.deepEqual(claimRule({ limitMode: 'global_stock', maxStock: 7, cooldownS: 60 }, who).map((r) => r.scope), ['global', 'cool:c1']);
  assert.deepEqual(eventRule([{ k: 'give_gold', amount: 1 }], 'c1'), [{ scope: 'char:c1', max: 1 }]);
  assert.deepEqual(eventRule([{ k: 'give_gold', amount: 1 }, { k: 'take_gold', amount: 1 }], 'c1'), []);
  const d = doc();
  d.trades[0].recipes[0].cooldownS = 100;
  const dm = createDm(d, { items: [{ template: 16, count: 50 }, { template: 42, count: 20 }], now: 1000 });
  assert.equal(runRecipe(dm, 'nyra', 'brew').ok, true);
  assert.equal(recipeBlock(dm, 'nyra', 'brew'), 'cooldown');
  advance(dm, 101);
  assert.equal(recipeBlock(dm, 'nyra', 'brew'), null);
  d.trades[0].recipes[0].limitMode = 'daily_per_char';
  const day = createDm(d, { items: [{ template: 16, count: 50 }, { template: 42, count: 20 }], now: 1000 });
  runRecipe(day, 'nyra', 'brew');
  advance(day, 101);
  assert.equal(recipeBlock(day, 'nyra', 'brew'), 'limit');
  advance(day, 86400);
  assert.equal(recipeBlock(day, 'nyra', 'brew'), null);
});

test('a stock runs out for everyone', () => {
  const d = doc();
  d.trades[0].recipes[0].limitMode = 'global_stock';
  d.trades[0].recipes[0].maxStock = 1;
  const dm = createDm(d, { items: [{ template: 16, count: 50 }, { template: 42, count: 20 }] });
  runRecipe(dm, 'nyra', 'brew');
  assert.equal(recipeBlock(dm, 'nyra', 'brew'), 'stock');
});

test('conditions: trees, variables and items', () => {
  const ctx = { count: (s) => (s.template === 71 ? 3 : 0), gold: 10, getVar: (k) => ({ n: 4, s: 'x' })[k] };
  assert.equal(evalWhen(undefined, ctx), true);
  assert.equal(evalWhen({ k: 'all', of: [{ k: 'has_item', item: { template: 71, count: 3 } }, { k: 'has_gold', amount: 10 }] }, ctx), true);
  assert.equal(evalWhen({ k: 'any', of: [{ k: 'has_gold', amount: 11 }, { k: 'var', var: 'n', op: 'ge', value: 4 }] }, ctx), true);
  assert.equal(evalWhen({ k: 'var', var: 's', op: 'ne', value: 'x' }, ctx), false);
});

test('a patrol walks its loop, waits at each stop and reports the stops it reaches', () => {
  const route = { key: 'r', mode: 'loop', waypoints: [
    { key: 'a', t: [0, 0, 0], radius: 0.5, waitS: 2 }, { key: 'b', t: [14, 0, 0], radius: 0.5, waitS: 2 }, { key: 'c', t: [14, 0, 14], radius: 0.5, waitS: 0 } ] };
  const w = createWalker(route);
  const seen = [];
  for (let i = 0; i < 400; i++) seen.push(...stepWalker(w, 0.5));
  assert.deepEqual(seen.slice(0, 6), ['b', 'c', 'a', 'b', 'c', 'a'].slice(0, 6));
  const once = createWalker({ ...route, mode: 'once' });
  for (let i = 0; i < 400; i++) stepWalker(once, 0.5);
  assert.equal(once.done, true);
  const ping = createWalker({ ...route, mode: 'pingpong' });
  const p = [];
  for (let i = 0; i < 400; i++) p.push(...stepWalker(ping, 0.5));
  assert.deepEqual(p.slice(0, 4), ['b', 'c', 'b', 'a']);
});

test('settling on a save: items leave from records that may leave, the smallest stack first, and a short stack changes nothing', () => {
  const save = { items: [
    { templateIndex: 71, group: 'Gems', stackCount: 5 }, { templateIndex: 71, group: 'Gems', stackCount: 2 },
    { templateIndex: 71, group: 'Gems', stackCount: 9, questItem: true }, { templateIndex: 72, group: 'Gems', stackCount: 1, equipSlot: 3 } ], goldPieces: 30, lightSourceIndex: 0 };
  assert.equal(countOf(save, { template: 71, group: 'Gems', count: 1 }), 16);
  const before = JSON.stringify(save);
  assert.deepEqual(takeStacks(save, [{ template: 71, group: 'Gems', count: 8 }]), { ok: false, why: 'items' }, 'the quest stack cannot be given');
  assert.equal(JSON.stringify(save), before);
  assert.deepEqual(takeStacks(save, [{ template: 71, group: 'Gems', count: 6 }]), { ok: true });
  assert.deepEqual(save.items.map((r) => r.stackCount), [1, 9, 1]);
  assert.equal(save.lightSourceIndex, 0, 'the lit item moved with its record');
  assert.equal(takeStacks(save, [{ template: 72, group: 'Gems', count: 1 }]).ok, false, 'worn gear stays');
  assert.equal(takeGold(save, 31), false);
  assert.equal(takeGold(save, 30), true);
  giveGoods(save, [{ templateIndex: 16 }], 40);
  assert.equal(save.goldPieces, 40);
  assert.equal(save.items.at(-1).templateIndex, 16);
});
