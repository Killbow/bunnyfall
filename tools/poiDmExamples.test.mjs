// The four worked scenarios of the World Builder spec, built only through the editor's own functions (dm.js) on the
// game's real item and foe ids, and held to the document law and the item law. If the editor can build them and the law
// accepts them, the authoring side expresses them; the game runs them from Milestone 5.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { poiDocProblems } from '../src/poi/poiLaw.js';
import { poiTradeProblems } from '../src/poi/poiTradeLaw.js';
import { createCatalogue } from './poi-editor/src/catalogue.js';
import {
  addVariable, addRoute, addWaypoint, setWaitAll, addEncounter, addSpawn, setComplete, addInteractive, addDialogue, addNode, addOption, thenOf, addTrade, addRecipe, setLimit,
  addStack, addEvent, addAction, conditionOf, removeRow, removeWaypoint, removeRecipe, referrers, refsOf, eventGraph, actionText, conditionText, foeName, FOES, foeCount, removeNode, shiftWaypoint,
} from './poi-editor/src/dm.js';

const cat = createCatalogue(JSON.parse(fs.readFileSync(new URL('./poi-editor/public/asset-catalogue.json', import.meta.url), 'utf8')));
const item = (name) => { const a = cat.assets.find((x) => x.namespace === 'paperdoll-item' && x.name === name); assert.ok(a, `catalogue has ${name}`); return a.template; };
const base = () => ({
  v: 2, id: 'poi-0123456789ab', name: 'Bridge Market', about: '', tags: [],
  place: { px: 500, py: 250, x: 100, z: 100, y: 0, ground: 'snap', r: [0, 0, 0, 1], s: 1 },
  parts: [], lights: [], groups: [],
  npcs: ['merchant', 'captain', 'nyra', 'supplier'].map((k, i) => ({ key: k, name: { merchant: 'Wandering Merchant', captain: 'Guard Captain', nyra: 'Alchemist Nyra', supplier: 'Supply Merchant' }[k], t: [i * 3, 0, 0], yaw: 0, h: 1.8, look: { k: 'df', a: 182, r: 0 }, lines: [] })),
  marker: { show: true, label: 'Bridge Market' },
});
const problems = (d) => { const p = poiDocProblems(d); return p.length ? p : poiTradeProblems(d); };

test('scenario 1: the merchant patrol walks a loop, 15 s at each stop', () => {
  const d = base();
  const { row: route } = addRoute(d, 'Merchant Patrol', [0, 0, 0]);
  route.waypoints = [];
  addWaypoint(route, [0, 0, 0], 'Market Entrance'); addWaypoint(route, [10, 0, 10], 'Market Square'); addWaypoint(route, [20, 0, 10], 'Tavern'); addWaypoint(route, [0, 0, 0], 'Market Entrance');
  assert.equal(setWaitAll(route, 15), 4);
  d.npcs[0].route = route.key;
  assert.deepEqual(problems(d), []);
  assert.equal(route.mode, 'loop');
  assert.deepEqual(route.waypoints.map((w) => w.name), ['Market Entrance', 'Market Square', 'Tavern', 'Market Entrance']);
  assert.ok(route.waypoints.every((w) => w.waitS === 15));
  assert.equal(new Set(route.waypoints.map((w) => w.key)).size, 4, 'the two entrances get their own keys');
  // order can change, and a route someone walks cannot lose its last stop silently
  assert.equal(shiftWaypoint(route, route.waypoints[1].key, -1), true);
  assert.equal(removeRow(d, 'routes', route.key).ok, true, 'a person\'s route link is optional and is cleared');
  assert.equal('route' in d.npcs[0], false);
});

test('scenario 2: the guard captain\'s branching dialogue', () => {
  const d = base();
  addVariable(d, 'Supplies delivered', 'boolean', 'character', 'supplies_delivered');
  const { row: trade } = addTrade(d, 'Supply delivery');
  const rec = trade.recipes[0];
  rec.requireItems = []; rec.requireGold = 0; rec.rewardItems = []; rec.rewardGold = 250; setLimit(rec, 'once_per_char');
  addStack(rec, 'requireItems', item('Iron'), 10); addStack(rec, 'requireItems', item('Copper'), 5);
  const { row: dlg } = addDialogue(d, 'Guard Captain');
  const root = dlg.nodes[0];
  root.say = 'Halt. State your business.'; root.options = [];
  const { row: story } = addNode(dlg, 'Bandits took the bridge last week.');
  addOption(root, 'What happened here?', { k: 'goto', node: story.key });
  addOption(root, 'I have brought the supplies.', { k: 'run_trade_recipe', trade: trade.key, recipe: rec.key });
  addOption(root, 'I want to leave.', { k: 'close' });
  d.npcs[1].dialogue = dlg.key;
  assert.deepEqual(problems(d), []);
  assert.equal(root.options.length, 3);
  assert.deepEqual(referrers(d, 'trades', trade.key).map((r) => r.optional), [false]);
  assert.ok(removeRow(d, 'trades', trade.key).refused, 'the answer needs the trade');
  assert.ok(removeRecipe(d, trade.key, rec.key).refused);
  assert.ok(removeNode(dlg, story.key).refused, 'an answer leads there');
  assert.equal(thenOf(d, dlg, 'goto').node, 'root');
});

test('scenario 3: Nyra\'s exchange and the supply merchant\'s event branch', () => {
  const d = base();
  addVariable(d, 'Supplies delivered', 'boolean', 'character', 'supplies_delivered');
  const { row: nyra } = addTrade(d, 'Nyra brew');
  const brew = nyra.recipes[0];
  brew.requireItems = []; brew.requireGold = 0; brew.rewardItems = [];
  addStack(brew, 'requireItems', item('Red Berries'), 5); addStack(brew, 'requireItems', item("Troll's Blood"), 2); addStack(brew, 'rewardItems', item('Elixir Vitae'), 1);
  brew.limitMode = 'unlimited';
  d.npcs[2].trade = nyra.key;
  const { row: sup } = addTrade(d, 'Supplies');
  const del = sup.recipes[0];
  del.requireItems = []; del.requireGold = 0; del.rewardItems = []; del.rewardGold = 250; setLimit(del, 'once_per_char');
  addStack(del, 'requireItems', item('Iron'), 10); addStack(del, 'requireItems', item('Copper'), 5);
  const { row: done } = addEvent(d, 'Supplies delivered', 'chained');
  done.then = [{ k: 'set_var', var: 'supplies_delivered', to: true }];
  del.onSuccessEvent = done.key;
  const { row: talk } = addEvent(d, 'Supply merchant talks', 'npc_talk');
  talk.trigger.npc = 'supplier';
  talk.when = { k: 'all', of: [{ k: 'has_item', item: { template: item('Iron'), count: 10 } }, { k: 'has_item', item: { template: item('Copper'), count: 5 } }] };
  talk.then = []; addAction(talk, 'then', 'open_trade', d); talk.then[0].trade = sup.key;
  addAction(talk, 'else', 'say', d); talk.else[0].text = 'You are still missing supplies.';
  assert.deepEqual(problems(d), []);
  // a one-time recipe and a stock-limited one are both expressible
  setLimit(del, 'global_stock', 3); assert.equal(del.maxStock, 3); assert.deepEqual(problems(d), []);
  setLimit(del, 'once_per_account'); assert.equal('maxStock' in del, false);
  // the graph shows the person, the event they start, and the trade that sets the variable
  const g = eventGraph(d, cat);
  assert.ok(g.edges.some((e) => e.from === 'npc:supplier' && e.to === `event:${talk.key}`));
  assert.ok(g.edges.some((e) => e.from === `trade:${sup.key}.${del.key}` && e.to === `event:${done.key}`));
  assert.match(actionText(d, done.then[0], cat), /Supplies delivered to true/);
  assert.match(conditionText(d, talk.when, cat), /has 10 x Iron and has 5 x Copper/);
  // an invalid reward is caught by the item law, not saved quietly
  brew.rewardItems.push({ template: 9999, count: 1 });
  assert.ok(problems(d).length > 0);
  // a free, unlimited recipe is refused
  brew.rewardItems.pop(); const free = addRecipe(sup, 'Free'); free.row.requireGold = 0; free.row.requireItems = [];
  assert.ok(problems(d).some((p) => p.code === 'free-unlimited'));
});

test('scenario 4: the ambush spawns five hostiles, ends on all dead, unlocks the gate for good', () => {
  const d = base();
  addVariable(d, 'Bridge unlocked', 'boolean', 'poi_global', 'bridge_unlocked');
  const { row: gate } = addInteractive(d, 'door', 'Bridge gate', [40, 0, 0]); gate.state = 'locked';
  const { row: zone } = addInteractive(d, 'trigger', 'Ambush zone', [30, 0, 0]); zone.radius = 12;
  const { row: enc } = addEncounter(d, 'Ambush at the Bridge', [35, 0, 0]);
  enc.spawns = [];
  addSpawn(enc, 136, 3, [35, 0, 2], 'bandits'); addSpawn(enc, 141, 1, [38, 0, 4], 'archer'); addSpawn(enc, 143, 1, [36, 0, 6], 'leader');
  setComplete(enc, 'all_dead');
  const { row: start } = addEvent(d, 'Ambush starts', 'enter_area'); start.trigger.interactive = zone.key;
  start.then = []; addAction(start, 'then', 'start_encounter', d);
  const { row: end } = addEvent(d, 'Ambush ends', 'chained');
  end.then = []; addAction(end, 'then', 'say', d); end.then[0].text = 'The bridge is clear.';
  addAction(end, 'then', 'set_state', d); end.then[1].interactive = gate.key; end.then[1].state = 'open';
  addAction(end, 'then', 'set_var', d); end.then[2].var = 'bridge_unlocked'; end.then[2].to = true;
  enc.onComplete = end.key;
  assert.deepEqual(problems(d), []);
  assert.equal(foeCount(enc), 5);
  assert.equal(enc.aggression, 'hostile');
  assert.deepEqual(enc.spawns.map((s) => foeName(s.foe)), ['Rogue', 'Archer', 'Barbarian']);
  assert.equal(d.variables.find((v) => v.key === 'bridge_unlocked').scope, 'poi_global', 'persists for every visitor');
  // the leader rule names a spawn point, the timer rule a number
  setComplete(enc, 'leader_dead', 'leader'); assert.deepEqual(problems(d), []);
  setComplete(enc, 'timer_survived', 90); assert.deepEqual(problems(d), []);
  setComplete(enc, 'leader_dead', 'nobody'); assert.ok(problems(d).length > 0);
  // the gate is needed by the event: it cannot be deleted from under it
  assert.ok(removeRow(d, 'interactives', gate.key).refused);
  // deleting the encounter clears nothing the event needs: the event's action needs it
  assert.ok(removeRow(d, 'encounters', enc.key).refused);
  assert.ok(refsOf(d).length >= 5);
});

test('new rows start inside the law, and the limits say so in words', () => {
  const d = base();
  addVariable(d, 'v'); addRoute(d, 'Walk'); addEncounter(d, 'Fight'); addInteractive(d, 'chest', 'Chest'); addDialogue(d, 'Talk'); addTrade(d, 'Shop');
  addEvent(d, 'Go', 'chained');
  d.events[0].trigger = { k: 'enter_area', interactive: 'chest' };
  assert.ok(problems(d).some((p) => p.code === 'wrong-kind'), 'a chest is not a zone');
  d.events[0].trigger = { k: 'interact', interactive: 'chest' };
  assert.deepEqual(problems(d), []);
  assert.equal(FOES.length, 39 + 3 + 19 + 35 + 15);
  assert.equal(foeName(146), 'City Watch');
  assert.equal(conditionOf(d, 'var').var, 'v');
  const many = base();
  for (let i = 0; i < 33; i++) addRoute(many, `r${i}`);
  assert.equal(many.routes.length, 32);
  assert.match(addRoute(many, 'one more').refused, /at most 32/);
  const { row: r } = addRoute(d, 'Long');
  for (let i = 0; i < 130; i++) addWaypoint(r, [i, 0, 0]);
  assert.equal(r.waypoints.length, 128);
  assert.equal(removeWaypoint(d, r.key, r.waypoints[0].key).ok, true);
});
