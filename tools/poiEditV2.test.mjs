// The in-game editor writes v2: a new POI is stamped v2, a v1 POI becomes v2 at its first change (and only then), every
// v2 key the editor does not edit is preserved through its edits, undo, and redo, and library entries stay v1.
// Run: node --test tools/poiEditV2.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Law from '../src/poi/poiLaw.js';
import * as Edit from '../src/poi/poiEdit.js';
import * as Shelf from '../src/poi/poiShelf.js';
import { poiDiff } from '../src/poi/poiDiff.js';
import { poiV2Example } from './poiV2Examples.mjs';

const SHA = 'a'.repeat(64);
const rand = (b) => { b.fill(7); return b; };
const v1Doc = () => {
  const d = Edit.newPoiDoc({ id: 'poi-0123456789ab', px: 500, py: 250, x: 10, z: 10, name: 'Old Mill' });
  d.v = 1;
  d.parts.push(Edit.newPart(d, { mesh: SHA, submeshes: 1, name: 'Mill' }));
  d.lights.push(Edit.newLight());
  return d;
};
const V2_KEYS = ['groups', 'interior', 'flats', 'routes', 'encounters', 'interactives', 'dialogues', 'trades', 'variables', 'events'];
// the v2 keys of the document and of the parts (by key) and lights (by place) it was opened with
const keptOf = (d, partKeys = d.parts.map((p) => p.key), lights = d.lights?.length ?? 0) => JSON.stringify({
  top: V2_KEYS.map((k) => d[k]),
  rows: [...partKeys.map((k) => d.parts.find((p) => p.key === k)), ...(d.lights ?? []).slice(0, lights)].map((o) => [o.group, o.visible, o.locked, o.arch3d]),
  people: (d.npcs ?? []).map((n) => [n.group, n.visible, n.locked, n.route, n.dialogue, n.trade, n.radius, n.showWhen]),
});

test('a POI is written as v2 and a library entry as v1', () => {
  assert.equal(Law.POI_DOC_VERSION, 2);
  assert.equal(Law.POI_SHELF_VERSION, 1);
  const edit = Edit.createPoiEdit({ rand });
  const id = edit.create({ px: 500, py: 250, x: 1, z: 1, name: 'New place' }, (d) => d.parts.push(Edit.newPart(d, { mesh: SHA, submeshes: 1 })));
  assert.equal(edit.docOf(id).v, 2);
  assert.deepEqual(Law.poiDocProblems(edit.docOf(id)), []);
  const entry = Shelf.shelfEntryOf({ id: 'lib-0123456789ab', name: 'Mill', parts: edit.docOf(id).parts, lights: [] });
  assert.equal(entry.v, 1);
  assert.deepEqual(Law.poiShelfProblems(entry), []);
});

test('every v1 POI is a valid v2 POI as it stands', () => {
  const d = v1Doc();
  assert.deepEqual(Law.poiDocProblems(d), []);
  assert.deepEqual(Law.poiDocProblems({ ...d, v: 2 }), []);
});

test('a v1 POI becomes v2 at its first change, and only then', () => {
  const edit = Edit.createPoiEdit({ rand });
  const d = v1Doc();
  edit.open(d.id, { doc: d });
  assert.equal(edit.docOf(d.id).v, 1, 'opening changes nothing');
  assert.equal(edit.dirty(d.id), false);
  assert.equal(edit.edit(d.id, 'nothing', () => {}), false);
  assert.equal(edit.docOf(d.id).v, 1, 'a step that changes nothing is no upgrade');
  assert.equal(edit.edit(d.id, 'rename', (x) => { x.name = 'New Mill'; }), true);
  assert.equal(edit.docOf(d.id).v, 2);
  assert.deepEqual(Law.poiDocProblems(edit.docOf(d.id)), []);
  edit.undo();
  assert.deepEqual(edit.docOf(d.id), d, 'undo puts back the v1 document exactly');
  assert.equal(edit.dirty(d.id), false);
  edit.redo();
  assert.equal(edit.docOf(d.id).v, 2);
  // "Put back as saved" writes the saved v1 document over the v2 one: it stays v1, and clean
  edit.edit(d.id, 'revert', (x) => { for (const k of Object.keys(x)) delete x[k]; Object.assign(x, structuredClone(d)); });
  assert.equal(edit.docOf(d.id).v, 1);
  assert.equal(edit.dirty(d.id), false);
});

test('"Put back as saved" on a v1 POI opened unlike its saved v1 gives the saved v1, clean, at one press', () => {
  // a pack's v1 POI over its live v1, or a past v1 revision opened over the live one
  const edit = Edit.createPoiEdit({ rand });
  const live = v1Doc();
  const other = { ...v1Doc(), name: 'Mill from a pack' };
  edit.open(live.id, { doc: other, saved: live, base: 1, state: 'live' });
  assert.equal(edit.dirty(live.id), true);
  const saved = edit.entryOf(live.id).saved;
  assert.equal(edit.edit(live.id, 'revert', (x) => { const s = JSON.parse(saved); for (const k of Object.keys(x)) delete x[k]; Object.assign(x, s); }), true);
  assert.deepEqual(edit.docOf(live.id), live);
  assert.equal(edit.dirty(live.id), false);
  edit.undo();
  assert.deepEqual(edit.docOf(live.id), other, 'undo gives back what was opened');
  assert.equal(edit.edit(live.id, 'rename', (x) => { x.name = 'New Mill'; }), true);
  assert.equal(edit.docOf(live.id).v, 2, 'a change that is not the saved document is still v2');
});

test('a drag upgrades a v1 POI only once it moves it', () => {
  const edit = Edit.createPoiEdit({ rand });
  const d = v1Doc();
  edit.open(d.id, { doc: d });
  edit.begin(d.id, 'move');
  edit.preview(() => {});
  assert.equal(edit.docOf(d.id).v, 1);
  assert.equal(edit.commit(), false);
  edit.begin(d.id, 'move');
  edit.preview((x) => { x.parts[0].t = [1, 0, 0]; });
  assert.equal(edit.docOf(d.id).v, 2);
  assert.equal(edit.commit(), true);
  edit.undo();
  assert.deepEqual(edit.docOf(d.id), d);
});

test('every v2 key the editor does not edit survives its edits, undo, and redo', () => {
  const edit = Edit.createPoiEdit({ rand });
  const d = poiV2Example();
  d.parts.push({ ...Edit.newPart(d, { mesh: SHA, submeshes: 1, name: 'Stall' }), group: d.groups[0].key, visible: false, locked: true });
  d.lights = [{ ...Edit.newLight(), group: d.groups[0].key, locked: true }];
  assert.deepEqual(Law.poiDocProblems(d), []);
  const kept = keptOf(d), partKeys = d.parts.map((p) => p.key), lights = d.lights.length;
  edit.open(d.id, { doc: d });
  const steps = [
    ['rename', (x) => { x.name = 'Bridge Fair'; }],
    ['move', (x) => { x.place.x += 1; }],
    ['move', (x) => { x.parts.at(-1).t = [3, 0, 3]; }],
    ['light', (x) => { x.lights[0].radius = 8; }],
    ['light', (x) => { x.lights.push(Edit.newLight()); }],
    ['person', (x) => { x.npcs[0].name = 'Ferryman'; }],
    ['paste', (x) => { x.parts.push({ ...structuredClone(x.parts.at(-1)), key: Edit.uniqueKey(x, x.parts.at(-1).key) }); }],
    ['remove part', (x) => { x.parts.pop(); }],
  ];
  for (const [label, fn] of steps) {
    assert.equal(edit.edit(d.id, label, fn), true, label);
    assert.equal(keptOf(edit.docOf(d.id), partKeys, lights), kept, `after ${label}`);
    assert.deepEqual(Law.poiDocProblems(edit.docOf(d.id)), [], `law after ${label}`);
  }
  while (edit.canUndo()) edit.undo();
  assert.deepEqual(edit.docOf(d.id), d);
  while (edit.canRedo()) edit.redo();
  assert.equal(keptOf(edit.docOf(d.id), partKeys, lights), kept);
});

test('the review reads a first change to a v1 POI as the upgrade and that change alone', () => {
  const edit = Edit.createPoiEdit({ rand });
  const live = v1Doc();
  edit.open(live.id, { doc: live });
  edit.edit(live.id, 'move', (x) => { x.parts[0].t = [2, 0, 0]; });
  assert.deepEqual(poiDiff(live, edit.docOf(live.id)).map((c) => c.code), ['upgraded', 'part-changed']);
  const v2 = poiV2Example();
  edit.open(v2.id, { doc: v2 });
  edit.edit(v2.id, 'rename', (x) => { x.name = 'Bridge Fair'; });
  assert.deepEqual(poiDiff(v2, edit.docOf(v2.id)).map((c) => c.code), ['name']);
});
