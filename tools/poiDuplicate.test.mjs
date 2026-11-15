// Duplicate a whole POI (the in-game editor's inspector): a new id, a copy name, fresh keys, and every reference pointed
// at the copy. Run: node --test tools/poiDuplicate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poiDocProblems } from '../src/poi/poiLaw.js';
import { poiPayProblems } from '../src/poi/poiTradeLaw.js';
import * as Edit from '../src/poi/poiEdit.js';
import { duplicatePoiDoc, duplicateName, POI_KEYED, POI_DUPLICATE_SHIFT_M } from '../src/poi/poiDuplicate.js';
import { poiV2Example } from './poiV2Examples.mjs';

const law = (d) => poiPayProblems(d, poiDocProblems(d));

/** Builds a v2 POI fixture containing every kind of key reference validated by the v2 schema: nested groups, grouped
 *  lights and flats, NPC visibility conditions, waypoint events, spawn routes, encounter events, interactive state
 *  variables, dialogue and trade conditions, and event triggers and actions. */
function richDoc() {
  const d = poiV2Example();
  d.groups.push({ key: 'stalls', name: 'Stalls', parent: 'market', visible: true, locked: false });
  d.parts[0].group = 'stalls';
  d.lights = [{ t: [0, 2, 0], color: [1, 0.85, 0.6], radius: 5, intensity: 1, flicker: false, group: 'market' }];
  d.flats = [{ key: 'sign', name: 'Sign', kind: 'billboard', flat: [210, 0], t: [1, 0, 1], rot: [0, 0, 0], scale: 1, layer: 0, collide: false, group: 'stalls' }];
  d.variables.push({ key: 'gate_state', name: 'Gate state', type: 'string', scope: 'poi_global', initial: 'locked' });
  d.variables.push({ key: 'visits', name: 'Visits', type: 'number', scope: 'character', initial: 0 });
  d.npcs[3].showWhen = { k: 'var', var: 'supplies_delivered', op: 'eq', value: false };
  d.routes[0].waypoints[1].onArriveEvent = 'square-reached';
  d.encounters[0].spawns[0].route = 'patrol';
  d.encounters[0].onStart = 'ambush-begins';
  d.interactives[0].stateVar = 'gate_state';
  d.dialogues[0].nodes[0].options[0].when = { k: 'any', of: [{ k: 'var', var: 'visits', op: 'ge', value: 0 }] };
  d.dialogues[0].nodes[1].options.push({ text: 'Tell me more.', then: { k: 'trigger_event', event: 'captain-more' } });
  d.trades[0].recipes[0].when = { k: 'var', var: 'bridge_unlocked', op: 'eq', value: true };
  d.events.push(
    { key: 'square-reached', name: 'At the square', trigger: { k: 'chained' }, then: [{ k: 'set_var', var: 'visits', add: 1 }] },
    { key: 'ambush-begins', name: 'Ambush begins', trigger: { k: 'chained' }, then: [{ k: 'say', text: 'Bandits!' }] },
    { key: 'captain-more', name: 'Captain says more', trigger: { k: 'chained' }, then: [{ k: 'open_dialogue', dialogue: 'captain' }] },
    { key: 'walk', name: 'Walk the patrol', trigger: { k: 'waypoint_reached', route: 'patrol', waypoint: 'tavern' },
      when: { k: 'var', var: 'visits', op: 'gt', value: 2 },
      then: [{ k: 'start_route', npc: 'merchant', route: 'patrol' }, { k: 'trigger_event', event: 'square-reached', delayS: 5 }],
      else: [{ k: 'stop_route', npc: 'merchant' }, { k: 'open_trade', trade: 'nyra' }] },
    { key: 'gate-used', name: 'Gate used', trigger: { k: 'interact', interactive: 'gate' }, then: [{ k: 'end_encounter', encounter: 'ambush' }, { k: 'despawn_npc', npc: 'supplier' }] },
  );
  return d;
}

/** Every key a document's top-level rows hold, by collection. */
const keysOf = (d) => Object.fromEntries(POI_KEYED.map((k) => [k, (d[k] ?? []).map((r) => r.key)]));

test('duplicate: the source fixture passes schema and trade validation', () => {
  assert.deepEqual(law(richDoc()), []);
});

test('duplicate: assigns a new id, a copy name, and fresh keys in every collection, and every reference still resolves', () => {
  const src = richDoc();
  const before = JSON.stringify(src);
  const c = duplicatePoiDoc(src, { id: 'poi-aaaaaaaaaaaa', name: 'Bridge Market (copy)' });
  assert.equal(JSON.stringify(src), before, 'the original is left as it was');
  assert.equal(c.id, 'poi-aaaaaaaaaaaa');
  assert.equal(c.name, 'Bridge Market (copy)');
  const was = keysOf(src), now = keysOf(c);
  for (const kind of POI_KEYED) {
    assert.equal(now[kind].length, was[kind].length, `${kind}: every row comes along`);
    for (const k of now[kind]) assert.ok(!was[kind].includes(k), `${kind}: ${k} is a fresh key`);
    assert.equal(new Set(now[kind]).size, now[kind].length, `${kind}: each key once`);
  }
  // an old key left anywhere would be a reference to a row the copy does not hold: the law says "ref-missing"
  assert.deepEqual(law(c), []);
  assert.equal(c.lights.length, 1);
  assert.deepEqual(c.lights[0].color, src.lights[0].color);
  assert.equal(c.place.x, src.place.x + POI_DUPLICATE_SHIFT_M, 'placed east of the original');
  assert.equal(c.place.px, src.place.px);
});

test('duplicate: each reference points at the copy\'s row that the original\'s pointed at', () => {
  const src = richDoc();
  const c = duplicatePoiDoc(src, { id: 'poi-aaaaaaaaaaaa', name: 'Copy' });
  const key = (kind, i) => c[kind][i].key;
  const at = (kind, oldKey) => c[kind][src[kind].findIndex((r) => r.key === oldKey)].key;
  assert.equal(c.groups[2].parent, key('groups', 0));
  assert.equal(c.parts[0].group, at('groups', 'stalls'));
  assert.equal(c.lights[0].group, at('groups', 'market'));
  assert.equal(c.flats[0].group, at('groups', 'stalls'));
  assert.equal(c.npcs[0].route, at('routes', 'patrol'));
  assert.equal(c.npcs[1].dialogue, at('dialogues', 'captain'));
  assert.equal(c.npcs[2].trade, at('trades', 'nyra'));
  assert.equal(c.npcs[3].showWhen.var, at('variables', 'supplies_delivered'));
  assert.equal(c.routes[0].waypoints[1].onArriveEvent, at('events', 'square-reached'));
  assert.equal(c.routes[0].waypoints[1].key, 'square', 'a waypoint keeps its key inside its route');
  assert.equal(c.encounters[0].spawns[0].route, at('routes', 'patrol'));
  assert.equal(c.encounters[0].onStart, at('events', 'ambush-begins'));
  assert.equal(c.encounters[0].onComplete, at('events', 'ambush-done'));
  assert.equal(c.interactives[0].appearance.key, at('parts', 'span'));
  assert.equal(c.interactives[0].stateVar, at('variables', 'gate_state'));
  const opts = c.dialogues[0].nodes;
  assert.equal(opts[0].options[0].when.of[0].var, at('variables', 'visits'));
  assert.deepEqual(opts[0].options[1].then, { k: 'run_trade_recipe', trade: at('trades', 'supplies'), recipe: 'delivery' });
  assert.deepEqual(opts[0].options[0].then, { k: 'goto', node: 'story' }, 'a node keeps its key inside its dialogue');
  assert.equal(opts[1].options.at(-1).then.event, at('events', 'captain-more'));
  assert.equal(c.trades[0].recipes[0].when.var, at('variables', 'bridge_unlocked'));
  assert.equal(c.trades[1].recipes[0].onSuccessEvent, at('events', 'supplies-done'));
  const ev = (k) => c.events[src.events.findIndex((e) => e.key === k)];
  assert.equal(ev('ambush-start').trigger.interactive, at('interactives', 'ambush-zone'));
  assert.equal(ev('ambush-start').then[0].encounter, at('encounters', 'ambush'));
  assert.equal(ev('ambush-done').then[1].interactive, at('interactives', 'gate'));
  assert.equal(ev('ambush-done').then[2].var, at('variables', 'bridge_unlocked'));
  assert.equal(ev('supplier-talk').trigger.npc, at('npcs', 'supplier'));
  assert.equal(ev('supplier-talk').then[0].trade, at('trades', 'supplies'));
  assert.deepEqual(ev('supplier-talk').when.of[0].item, { template: 71, count: 10 }, 'an item stack is left alone');
  assert.deepEqual(ev('walk').trigger, { k: 'waypoint_reached', route: at('routes', 'patrol'), waypoint: 'tavern' });
  assert.equal(ev('walk').when.var, at('variables', 'visits'));
  assert.deepEqual(ev('walk').then[0], { k: 'start_route', npc: at('npcs', 'merchant'), route: at('routes', 'patrol') });
  assert.equal(ev('walk').then[1].event, at('events', 'square-reached'));
  assert.equal(ev('walk').else[0].npc, at('npcs', 'merchant'));
  assert.equal(ev('walk').else[1].trade, at('trades', 'nyra'));
  assert.equal(ev('gate-used').trigger.interactive, at('interactives', 'gate'));
  assert.equal(ev('gate-used').then[1].npc, at('npcs', 'supplier'));
  assert.equal(ev('captain-more').then[0].dialogue, at('dialogues', 'captain'));
});

test('duplicate: through the editor, one undo step creates a new, valid, unsaved draft', () => {
  let n = 0;
  const rand = (b) => { for (let i = 0; i < b.length; i++) b[i] = (n++ * 37 + 11) & 255; return b; };
  const edit = Edit.createPoiEdit({ rand });
  const src = richDoc();
  edit.open(src.id, { doc: src, state: 'live' });
  const name = duplicateName(src.name, (b) => `${b} (copy)`);
  const { px, py, x, z, y } = src.place;
  const id = edit.create({ px, py, x, z, y, name }, (doc) => { const c = duplicatePoiDoc(src, { id: doc.id, name }); for (const k of Object.keys(doc)) delete doc[k]; Object.assign(doc, c); });
  assert.notEqual(id, src.id);
  assert.equal(edit.docOf(id).id, id);
  assert.equal(edit.docOf(id).name, 'Bridge Market (copy)');
  assert.equal(edit.entryOf(id).state, 'new');
  assert.ok(edit.dirty(id), 'a new draft to save');
  assert.deepEqual(law(edit.docOf(id)), []);
  assert.equal(edit.selection().id, id, 'the copy is selected');
  assert.deepEqual(edit.selection().items, []);
  assert.equal(edit.undoLabel(), 'create');
  edit.undo();
  assert.ok(!edit.has(id), 'one undo takes the copy away');
  assert.ok(edit.has(src.id));
});

test('duplicate: trims long copy names to the schema limit and shifts west near the map-square east edge', () => {
  const long = 'N'.repeat(64);
  const name = duplicateName(long, (b) => `${b} (copy)`);
  assert.equal(name.length, 64);
  assert.ok(name.endsWith(' (copy)'));
  const d = richDoc();
  d.place.x = 815;
  assert.equal(duplicatePoiDoc(d, { id: 'poi-bbbbbbbbbbbb', name: 'x' }).place.x, 815 - POI_DUPLICATE_SHIFT_M);
  // a 32-character key gets a fresh key that passes validation
  d.parts[1].key = 'k'.repeat(32);
  d.interactives[0].appearance.key = d.parts[1].key;
  const c = duplicatePoiDoc(d, { id: 'poi-bbbbbbbbbbbb', name: 'x' });
  assert.notEqual(c.parts[1].key, d.parts[1].key);
  assert.equal(c.interactives[0].appearance.key, c.parts[1].key);
  assert.deepEqual(law(c), []);
});
