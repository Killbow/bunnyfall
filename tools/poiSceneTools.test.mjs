// The in-game editor's scene tools: the scene hierarchy (poiScene), the list selection in poiEdit and the gizmo over
// several things (poiMulti). Every document they leave passes the law.
// Run: node --test tools/poiSceneTools.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poiDocProblems } from '../src/poi/poiLaw.js';
import * as Edit from '../src/poi/poiEdit.js';
import * as Scene from '../src/poi/poiScene.js';
import { applyMulti, pivotOf, singleItem } from '../src/poi/poiMulti.js';

const SHA = 'a'.repeat(64), SHA2 = 'b'.repeat(64);
const rand = (b) => { b.fill(7); return b; };
const law = (d) => poiDocProblems(d).map((p) => `${p.path}: ${p.code}`);
const near = (a, b, eps = 1e-3) => a.every((x, i) => Math.abs(x - b[i]) < eps);

/** A v2 POI: three parts (one in a group), two lights, a person. */
function sceneDoc() {
  const d = Edit.newPoiDoc({ id: 'poi-0123456789ab', px: 500, py: 250, x: 10, z: 10, name: 'Yard' });
  for (const [name, t] of [['Crate', [0, 0, 0]], ['Barrel', [2, 0, 0]], ['Cart', [6, 0, 2]]]) d.parts.push(Edit.newPart(d, { mesh: SHA, submeshes: 1, name, t }));
  d.lights.push(Edit.newLight([0, 2, 0]), Edit.newLight([4, 2, 0]));
  d.npcs = [Edit.newNpc(d, { name: 'Guard', t: [1, 0, 1], look: { k: 'df', a: 182, r: 0 } })];
  d.groups = [{ key: 'stack', name: 'Stack', parent: null, visible: true, locked: false }];
  d.parts[0].group = 'stack';
  return d;
}

test('poiScene: the tree, marks, and what may move', () => {
  const d = sceneDoc();
  assert.deepEqual(law(d), []);
  const tree = Scene.buildTree(d);
  assert.deepEqual(tree.map((n) => n.id), ['group:stack', 'part:barrel', 'part:cart', 'light:0', 'light:1', 'npc:npc-1']);
  assert.deepEqual(tree[0].children.map((n) => n.id), ['part:crate']);
  d.groups[0].locked = true; d.parts[1].visible = false;
  const m = Scene.marksOf(d);
  assert.equal(m.get('part:crate').frozen, true, 'a locked group locks what is in it');
  assert.equal(m.get('part:barrel').hidden, true);
  assert.deepEqual(Scene.movable(d, ['group:stack', 'part:barrel', 'light:1']), ['part:barrel', 'light:1'], 'a locked row is not moved');
  assert.deepEqual(Scene.pickable(d, ['part:crate', 'part:barrel', 'part:cart']), ['part:cart']);
  const view = Scene.viewDoc(d);
  assert.deepEqual(view.parts.map((p) => p.key), ['crate', 'cart'], 'the editor does not draw a hidden row');
  assert.equal(d.parts.length, 3, 'the part stays in the document');
  assert.deepEqual(law(d), []);
});

test('poiScene: group, ungroup, regroup, reorder, rename, and delete', () => {
  const d = sceneDoc();
  const r = Scene.groupNodes(d, ['part:barrel', 'light:1', 'npc:npc-1'], 'Corner');
  assert.equal(r.key, 'corner');
  assert.deepEqual(law(d), []);
  assert.equal(d.npcs[0].group, 'corner');
  assert.deepEqual(Scene.moveToGroup(d, ['group:stack'], 'corner'), { ok: true });
  assert.equal(Scene.moveToGroup(d, ['group:corner'], 'stack').refused, 'cycle');
  assert.equal(Scene.renameNode(d, 'group:corner', 'The corner'), true);
  assert.equal(d.groups.find((g) => g.key === 'corner').name, 'The corner');
  assert.equal(Scene.reorderNode(d, 'part:cart', 'part:crate'), 'part:cart');
  assert.deepEqual(d.parts.map((p) => p.key), ['cart', 'crate', 'barrel']);
  assert.equal(Scene.reorderNode(d, 'light:1', 'light:0'), 'light:0');
  assert.deepEqual(d.lights.map((l) => l.t[0]), [4, 0]);
  assert.equal(Scene.ungroup(d, 'corner'), true);
  assert.deepEqual(law(d), []);
  assert.equal(d.groups.find((g) => g.key === 'stack').parent, null);
  Scene.setFlag(d, ['part:cart'], 'locked', true);
  Scene.setFlag(d, ['part:cart'], 'locked', false);
  assert.equal('locked' in d.parts[0], false, 'unlocked is written by leaving the mark out');
  assert.equal(Scene.removeNodes(d, ['group:stack']), 2, 'a group is deleted with what is in it');
  assert.deepEqual(d.parts.map((p) => p.key), ['cart', 'barrel']);
  assert.equal(d.groups, undefined);
  assert.deepEqual(law(d), []);
  // nine groups deep is past the law
  const deep = sceneDoc();
  let parent = 'stack';
  for (let i = 0; i < 7; i++) { const g = Scene.groupNodes(deep, [`group:${parent}`], `g${i}`); assert.ok(g.key, `level ${i + 2}`); parent = g.key; }
  assert.equal(Scene.groupNodes(deep, [`group:${parent}`], 'too').refused, 'depth');
  assert.deepEqual(law(deep), []);
});

test('poiScene: an interactive object in a group outlives the group; a person\'s name is capped at the law\'s label length', async () => {
  const { poiV2Example } = await import('./poiV2Examples.mjs');
  const d = poiV2Example();
  d.interactives[0].group = d.groups[0].key;
  const u = structuredClone(d);
  Scene.ungroup(u, d.groups[0].key);
  assert.deepEqual(law(u), [], 'ungrouped: it names no group that is gone');
  const r = structuredClone(d);
  Scene.removeNodes(r, [`group:${d.groups[0].key}`]);
  assert.equal(r.interactives.length, d.interactives.length, 'deleting the group leaves the object in place');
  assert.deepEqual(law(r), []);
  const p = sceneDoc();
  Scene.renameNode(p, 'npc:npc-1', 'N'.repeat(70));
  assert.equal(p.npcs[0].name.length, 48);
  assert.deepEqual(law(p), []);
});

test('poiEdit: the selection is a list, one selected thing reads as before', () => {
  const edit = Edit.createPoiEdit({ rand });
  const d = sceneDoc();
  edit.open(d.id, { doc: d });
  edit.select({ id: d.id, part: 'barrel' });
  assert.deepEqual(edit.selection(), { id: d.id, items: ['part:barrel'], part: 'barrel', light: null });
  edit.select({ id: d.id, part: null, light: 1 });
  assert.deepEqual(edit.selection(), { id: d.id, items: ['light:1'], part: null, light: 1 });
  edit.select({ id: d.id, part: null });
  assert.deepEqual(edit.selection(), { id: d.id, items: [], part: null, light: null });
  edit.select({ id: d.id, items: ['part:crate', 'npc:npc-1', 'part:cart', 'part:gone'] });
  assert.deepEqual(edit.selection(), { id: d.id, items: ['part:crate', 'npc:npc-1', 'part:cart'], part: 'cart', light: null }, 'the last is the primary; a row not there is dropped');
  // a step leaves its selection, and undo and redo bring each back
  edit.edit(d.id, 'delete', (x) => { Scene.removeNodes(x, ['part:crate', 'part:cart']); }, { id: d.id, items: [] });
  assert.deepEqual(edit.selection().items, []);
  edit.undo();
  assert.deepEqual(edit.selection().items, ['part:crate', 'npc:npc-1', 'part:cart']);
  edit.redo();
  assert.deepEqual(edit.selection().items, []);
  // a lazy selection: answered once the change has run
  edit.edit(d.id, 'paste', (x) => { x.parts.push(Edit.newPart(x, { mesh: SHA, submeshes: 1, name: 'Late' })); }, (x) => Edit.selectionOf(d.id, [`part:${x.parts.at(-1).key}`]));
  assert.equal(edit.selection().part, 'late');
  edit.undo(); edit.redo();
  assert.equal(edit.selection().part, 'late', 'redo selects what the step made');
});

test('poiMulti: the gizmo moves, turns, and sizes several things about their middle', () => {
  const d = sceneDoc();
  const ids = ['part:crate', 'part:barrel'];
  assert.equal(singleItem(['part:crate']), true);
  assert.equal(singleItem(['npc:npc-1']), false);
  const pivot = pivotOf(d, ids);
  assert.deepEqual(pivot, [1, 0, 0]);
  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const a = structuredClone(d);
  applyMulti(a, [...ids, 'npc:npc-1'], { move: [0, 0, 3] }, { pivot, axes });
  assert.deepEqual([a.parts[0].t, a.parts[1].t, a.npcs[0].t], [[0, 0, 3], [2, 0, 3], [1, 0, 4]]);
  const b = structuredClone(d);
  applyMulti(b, ids, { turn: { axis: [0, 1, 0], deg: 180 } }, { pivot, axes });
  assert.ok(near(b.parts[0].t, [2, 0, 0]) && near(b.parts[1].t, [0, 0, 0]), JSON.stringify(b.parts.map((p) => p.t)));
  assert.ok(near(Edit.eulerOfQuat(b.parts[0].r), [0, 180, 0]), 'each part turns with them');
  const c = structuredClone(d);
  applyMulti(c, ids, { size: [2, 1, 1] }, { pivot, axes });
  assert.deepEqual([c.parts[0].t, c.parts[1].t, c.parts[0].s], [[-1, 0, 0], [3, 0, 0], [2, 1, 1]]);
  // a POI turned a quarter: a world move east is the document's own +z (the place's turn is taken out)
  const e = structuredClone(d);
  e.place.r = Edit.quatOfEuler([0, 90, 0]);
  applyMulti(e, ids, { move: [1, 0, 0] }, { pivot, axes });
  assert.ok(near(e.parts[0].t, [0, 0, 1]), JSON.stringify(e.parts[0].t));
  for (const x of [a, b, c, e]) assert.deepEqual(law(x), []);
});
