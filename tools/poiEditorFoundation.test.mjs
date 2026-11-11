// Tests for the World Builder's pure foundation: scene tree, clipboard, catalogue search.
//   node --test tools/poiEditorFoundation.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { poiV2Example } from './poiV2Examples.mjs';
import { buildTree, find, groupNodes, ungroup, removeNodes, setFlag, rangeIds, pickable, flatOrder } from './poi-editor/src/scene.js';
import { copyNodes, pasteClip, readClip, clipText, duplicateNodes } from './poi-editor/src/clipboard.js';
import { createCatalogue, createAssetPrefs, visibleRows } from './poi-editor/src/catalogue.js';
import { poiDocProblems } from '../src/poi/poiLaw.js';

const doc = () => poiV2Example();
const bad = (d) => poiDocProblems(d).map((p) => `${p.path}:${p.code}`);

test('tree: the example nests parts and people under their group', () => {
  const t = buildTree(doc());
  assert.equal(t[0].kind, 'group');
  assert.ok(t[0].children.some((n) => n.id === 'part:stall'));
  assert.ok(t[0].children.some((n) => n.id === 'npc:merchant'));
});

test('tree: a hidden or locked group hides and freezes what is in it', () => {
  const d = doc();
  setFlag(d, ['group:market'], 'visible', false);
  setFlag(d, ['group:market'], 'locked', true);
  const kid = buildTree(d)[0].children.find((n) => n.id === 'part:stall');
  assert.equal(kid.hidden, true);
  assert.equal(kid.frozen, true);
  assert.deepEqual(pickable(d, ['part:stall']), []);
});

test('group and ungroup keep the document lawful', () => {
  const d = doc();
  const r = groupNodes(d, ['part:stall', 'npc:merchant'], 'Stall and seller');
  assert.ok(r.key);
  assert.equal(find(d, 'part:stall').row.group, r.key);
  assert.deepEqual(bad(d), []);
  assert.ok(ungroup(d, r.key));
  assert.equal(find(d, 'part:stall').row.group, 'market');
  assert.deepEqual(bad(d), []);
});

test('grouping is refused at the group limit and depth', () => {
  const d = doc();
  d.groups = Array.from({ length: 64 }, (_, i) => ({ key: `g${i}`, name: 'g', parent: null, visible: true, locked: false }));
  assert.equal(groupNodes(d, ['part:stall'], 'x').refused, 'groups');
  const e = doc();
  e.groups = Array.from({ length: 8 }, (_, i) => ({ key: `d${i}`, name: 'd', parent: i ? `d${i - 1}` : null, visible: true, locked: false }));
  e.parts[0].group = 'd7';
  assert.equal(groupNodes(e, ['part:stall'], 'deep').refused, 'depth');
});

test('removing a group removes what is inside it', () => {
  const d = doc();
  const n = removeNodes(d, ['group:market']);
  assert.ok(n >= 3);
  assert.equal(find(d, 'part:stall'), null);
  assert.equal(find(d, 'npc:merchant'), null);
});

test('shift range follows tree order', () => {
  const d = doc();
  const order = flatOrder(d);
  const r = rangeIds(d, order[0], order[2]);
  assert.deepEqual(r, order.slice(0, 3));
});

test('copy and paste: fresh keys, offset, same lawful document', () => {
  const d = doc();
  const clip = copyNodes(d, ['part:stall']);
  assert.equal(clip.parts.length, 1);
  assert.equal(clip.groups.length, 1);
  const before = d.parts.length;
  const out = pasteClip(d, clip, { offset: [2, 0, 3] });
  assert.equal(d.parts.length, before + 1);
  const added = d.parts[d.parts.length - 1];
  assert.notEqual(added.key, 'stall');
  assert.deepEqual(added.t, [2, 0, 3]);
  assert.deepEqual(out.missing, []);
  assert.deepEqual(bad(d), []);
});

test('paste into another document drops links it cannot keep', () => {
  const src = doc();
  const clip = copyNodes(src, ['npc:merchant']);
  assert.equal(clip.npcs[0].route, 'patrol');
  const dst = doc();
  dst.routes = []; dst.events = dst.events.filter((e) => !JSON.stringify(e).includes('patrol'));
  pasteClip(dst, clip);
  const got = dst.npcs.find((n) => n.key !== 'merchant' && n.name === 'Wandering Merchant');
  assert.equal(got.route, undefined);
});

test('paste leaves out assets the catalogue lacks and says so', () => {
  const d = doc();
  const clip = copyNodes(d, ['part:stall']);
  const out = pasteClip(d, clip, { has: () => false });
  assert.equal(out.missing.length, 1);
  assert.match(out.missing[0].why, /df-arch3d:1/);
});

test('paste stops at the collection limit', () => {
  const d = doc();
  while (d.parts.length < 128) d.parts.push({ ...structuredClone(d.parts[0]), key: `p${d.parts.length}` });
  const out = pasteClip(d, copyNodes(d, ['part:stall']));
  assert.equal(out.full.length, 1);
  assert.equal(d.parts.length, 128);
});

test('clip text round trips and refuses anything else', () => {
  const d = doc();
  const t = clipText(copyNodes(d, ['npc:merchant']));
  assert.ok(readClip(t));
  assert.equal(readClip('{"a":1}'), null);
  assert.equal(readClip('not json'), null);
  const dup = duplicateNodes(d, ['part:stall']);
  assert.equal(dup.ids.length, 1);
});

test('catalogue: search, filters, flags and the real file', () => {
  const cat = createCatalogue({
    shared: { a: { namespace: 'a', category: 'models', tags: [], dimensionMode: '3d' } },
    entries: [{ id: 'a:1', namespace: 'a', name: 'Iron Gate', tags: ['metal'] }, { id: 'a:2', namespace: 'a', name: 'Oak Door', category: 'wood', tags: [] }],
    duplicates: ['a:2'], missingReferences: [],
  });
  assert.equal(cat.search({ q: 'iron' }).length, 1);
  assert.equal(cat.search({ q: 'door wood' }).length, 1);
  assert.equal(cat.search({ category: 'models' }).length, 1);
  assert.equal(cat.search({ tag: 'metal' })[0].id, 'a:1');
  assert.equal(cat.flags(cat.get('a:2')).duplicate, true);
  const file = new URL('./poi-editor/public/asset-catalogue.json', import.meta.url);
  if (existsSync(file)) {
    const real = createCatalogue(JSON.parse(readFileSync(file, 'utf8')));
    assert.ok(real.assets.length > 10000);
    assert.ok(real.search({ q: 'orc' }).length >= 1);
    assert.ok(real.has('df-flat:334.0'));
  }
});

test('asset prefs: favourites, recents and collections persist', () => {
  const mem = new Map();
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const p = createAssetPrefs(store);
  assert.equal(p.toggleFavourite('a:1'), true);
  p.noteUsed('a:1'); p.noteUsed('a:2'); p.noteUsed('a:1');
  p.addToCollection('Market', 'a:2');
  const q = createAssetPrefs(store);
  assert.ok(q.isFavourite('a:1'));
  assert.deepEqual(q.recent(), ['a:1', 'a:2']);
  assert.ok(q.collection('Market').has('a:2'));
  assert.equal(createAssetPrefs({ getItem: () => '{broken', setItem() {} }).recent().length, 0);
});

test('virtual rows: only the visible slice is drawn', () => {
  const v = visibleRows(10000, 6, 100, 5000, 600, 1);
  assert.ok(v.to - v.from < 100);
  assert.equal(v.height, Math.ceil(10000 / 6) * 100);
});
