// Tests the DM editing module that both POI editors use. Run: node --test tools/poiDmEdit.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { poiDocProblems } from '../src/poi/poiLaw.js';
import { poiTradeProblems } from '../src/poi/poiTradeLaw.js';
import * as DM from '../src/poi/poiDmEdit.js';
import { poiV2Example } from './poiV2Examples.mjs';

const blank = () => ({
  v: 2, id: 'poi-0123456789ab', name: 'Test', about: '', tags: [],
  place: { px: 500, py: 250, x: 100, z: 100, y: 0, ground: 'snap', r: [0, 0, 0, 1], s: 1 },
  parts: [], lights: [], npcs: [{ key: 'keeper', name: 'Keeper', t: [0, 0, 0], yaw: 0, h: 1.8, look: { k: 'df', a: 184, r: 0 }, lines: [] }],
});
const problems = (d) => { const p = poiDocProblems(d); return p.length ? p : poiTradeProblems(d); };

test('every kind of row it adds stands to the law as it is made', () => {
  const d = blank();
  DM.addVariable(d, 'Gate open', 'string', 'poi_global');
  DM.addRoute(d, 'Patrol', [1, 0, 1]);
  DM.addEncounter(d, 'Ambush', [5, 0, 5]);
  DM.addInteractive(d, 'door', 'Gate', [2, 0, 2]);
  DM.addInteractive(d, 'trigger', 'Zone', [3, 0, 3]);
  DM.addDialogue(d, 'Greeting');
  DM.addTrade(d, 'Shop');
  DM.addEvent(d, 'Opens', 'interact');
  assert.deepEqual(problems(d), []);
  assert.equal(d.routes[0].waypoints.length, 2);
  assert.equal(d.events[0].trigger.interactive, 'gate');
});

test('the item picker offers the game\'s items by group, without the currency, and materials for weapons and armor only', () => {
  const items = DM.itemChoices();
  const iron = items.find((x) => x.template === 71);
  assert.ok(iron && iron.name === 'Iron', 'iron is offered');
  assert.ok(!items.some((x) => x.group === 'Currency'));
  assert.ok(items.some((x) => x.group === 'Weapons') && items.some((x) => x.group === 'Armor'));
  assert.deepEqual(DM.materialChoices('Weapons').map(([v]) => v), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(DM.materialChoices('Armor').length, 12);
  assert.deepEqual(DM.materialChoices('MetalIngredients'), []);
});

test('the item picker offers the twenty potions by name, and no empty Glass Bottle or Potion Recipe sheet', () => {
  const items = DM.itemChoices();
  const potions = items.filter((x) => x.recipe !== undefined);
  assert.equal(potions.length, 20);
  assert.ok(potions.every((x) => x.template === 83 && x.group === 'Potions' && /^Potion of /.test(x.name)));
  assert.ok(potions.some((x) => x.recipe === 'healTrue' && x.name === 'Potion of Heal True'));
  assert.ok(!items.some((x) => x.recipe === undefined && (x.template === 83 || x.template === 278)), 'no empty bottle and no recipe sheet');
  assert.equal(DM.groupWord('Potions'), 'Potions');
  for (const x of items) assert.deepEqual(DM.choiceItem(DM.choiceValue(x)), x.recipe === undefined ? { template: x.template } : { template: x.template, recipe: x.recipe });
  assert.equal(new Set(items.map(DM.choiceValue)).size, items.length, 'every row has its own value');
});

test('picking a potion sets its recipe, picking another item drops it, and the law accepts each', () => {
  const d = blank();
  DM.addTrade(d, 'Apothecary');
  const s = d.trades[0].recipes[0].rewardItems[0];
  DM.setStackItem(s, DM.choiceItem('83:healTrue'));
  assert.deepEqual(s, { template: 83, recipe: 'healTrue', count: 1 });
  assert.equal(DM.itemName(null, s), '1 x Potion of Heal True');
  assert.deepEqual(problems(d), []);
  DM.setStackItem(s, DM.choiceItem('83:healing'));
  assert.equal(s.recipe, 'healing');
  DM.setStackItem(s, DM.choiceItem('71'));
  assert.deepEqual(s, { template: 71, count: 1 });
  assert.deepEqual(problems(d), []);
});

test('a POI that already names an empty Glass Bottle or a Potion Recipe sheet keeps them and their names', () => {
  const d = blank();
  DM.addTrade(d, 'Old shop');
  const rec = d.trades[0].recipes[0];
  rec.requireItems = [{ template: 83, count: 2 }];
  rec.rewardItems = [{ template: 278, count: 1 }];
  const before = structuredClone(d);
  assert.deepEqual(problems(d), []);
  assert.equal(DM.itemName(null, rec.requireItems[0]), '2 x Glass Bottle');
  assert.equal(DM.itemName(null, rec.rewardItems[0]), '1 x Potion Recipe');
  DM.setStackItem(rec.requireItems[0], { group: 'UselessItems1' });
  assert.deepEqual(d, before, 'setting the group changes nothing');
});

test('a stack includes a material only when its item takes one, and the law accepts what is left', () => {
  const d = blank();
  DM.addTrade(d, 'Smith');
  const rec = d.trades[0].recipes[0];
  const sword = DM.itemChoices().find((x) => x.group === 'Weapons');
  DM.setStackItem(rec.rewardItems[0], { template: sword.template, material: 9 });
  assert.equal(rec.rewardItems[0].material, 9);
  assert.deepEqual(problems(d), []);
  DM.setStackItem(rec.rewardItems[0], { template: 71 });
  assert.equal(rec.rewardItems[0].material, undefined, 'iron ore has no material');
  DM.setStackItem(rec.rewardItems[0], { material: 3 });
  assert.equal(rec.rewardItems[0].material, undefined);
  assert.deepEqual(problems(d), []);
});

test('an encounter is pacifiable unless set otherwise: turning it off writes the key, turning it on removes it', () => {
  const d = poiV2Example();
  const e = d.encounters[0];
  const before = JSON.stringify(d);
  DM.setPacifiable(e, true);
  assert.equal(JSON.stringify(d), before, 'turning it on, the default, writes nothing');
  DM.setPacifiable(e, false);
  assert.equal(e.pacifiable, false);
  assert.deepEqual(problems(d), []);
  DM.setPacifiable(e, true);
  assert.equal('pacifiable' in e, false);
  assert.equal(JSON.stringify(d), before, 'the document is as it was');
});

test('removing a row something needs is refused with who needs it; links that may go are dropped with it', () => {
  const d = poiV2Example();
  const r = DM.removeRow(structuredClone(d), 'encounters', 'ambush');
  assert.match(r.refused, /Still used by event "Ambush starts"/);
  const v = DM.addVariable(d, 'Gate state', 'string', 'poi_global').row;
  d.interactives[0].stateVar = v.key;
  assert.deepEqual(problems(d), []);
  const out = DM.removeRow(d, 'variables', v.key);
  assert.equal(out.ok, true);
  assert.equal(d.interactives[0].stateVar, undefined, 'the object no longer takes its state from it');
});

test('an object takes its state only from a persistent text variable', () => {
  const d = poiV2Example();
  d.interactives[0].stateVar = 'bridge_unlocked';
  assert.deepEqual(poiDocProblems(d).map((p) => [p.path, p.code]), [['interactives[0].stateVar', 'state-var']]);
  d.interactives[0].stateVar = 'nobody';
  assert.deepEqual(poiDocProblems(d).map((p) => p.code), ['ref-missing']);
});

test('it counts the DM fields the in-game panel does not offer', () => {
  const d = poiV2Example();
  assert.deepEqual(DM.dmHeldOf(d), { patrols: 0, facing: 0, flatLooks: 0 });
  d.encounters[0].spawns[0].route = 'patrol';
  d.interactives[0].yaw = 90;
  d.interactives[1].appearance = { k: 'flat', flat: [200, 0] };
  assert.deepEqual(DM.dmHeldOf(d), { patrols: 1, facing: 1, flatLooks: 1 });
});

test('the event graph and the plain words read the example', () => {
  const d = poiV2Example();
  const g = DM.eventGraph(d);
  assert.ok(g.nodes.some((n) => n.id === 'event:ambush-start'));
  assert.ok(g.edges.some((e) => e.to === 'event:ambush-start' && e.label === 'enters'));
  assert.equal(DM.actionText(d, { k: 'give_gold', amount: 250 }), 'give 250 gold');
  assert.equal(DM.actionText(d, { k: 'take_item', item: { template: 71, count: 10 } }), 'take 10 x Iron');
  assert.equal(DM.conditionText(d, { k: 'all', of: [{ k: 'has_gold', amount: 5 }, { k: 'has_item', item: { template: 72, count: 5 } }] }), 'all of (has 5 gold and has 5 x Copper)');
});

test('keys come from names, unique among those taken', () => {
  assert.equal(DM.freshKey('Gate Open', new Set()), 'gate-open');
  assert.equal(DM.freshKey('Gate Open', new Set(['gate-open'])), 'gate-open-2');
  assert.equal(DM.freshKey('', new Set()), 'item');
});

test('the editor says when an event that takes items or gold is started by a waypoint, a delay, or an encounter', () => {
  const take = [{ k: 'take_item', item: { template: 71, count: 1 } }];
  const doc = {
    routes: [{ key: 'r', waypoints: [{ key: 'a', onArriveEvent: 'arrive' }] }],
    encounters: [{ key: 'e', onComplete: 'won' }],
    events: [
      { key: 'arrive', trigger: { k: 'chained' }, then: take },
      { key: 'won', trigger: { k: 'chained' }, then: [{ k: 'take_gold', amount: 5 }] },
      { key: 'later', trigger: { k: 'chained' }, then: take },
      { key: 'soon', trigger: { k: 'chained' }, then: take },
      { key: 'walk', trigger: { k: 'waypoint_reached', route: 'r', waypoint: 'a' }, then: [], else: take },
      { key: 'zone', trigger: { k: 'enter_area', interactive: 'z' }, then: [...take, { k: 'trigger_event', event: 'later', delayS: 5 }, { k: 'trigger_event', event: 'soon' }] },
      { key: 'gift', trigger: { k: 'chained' }, then: [{ k: 'give_gold', amount: 1 }] },
    ],
  };
  doc.encounters[0].onStart = 'gift';
  const says = Object.fromEntries(doc.events.map((e) => [e.key, DM.asksAway(doc, e)]));
  assert.deepEqual(says, { arrive: true, won: true, later: true, soon: false, walk: true, zone: false, gift: false });
});
