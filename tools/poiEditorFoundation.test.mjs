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

test('api: environments, sign-in, roles and a refused session', async () => {
  const { createApi, cleanBase, ENVIRONMENTS } = await import('./poi-editor/src/api.js');
  assert.equal(cleanBase('https://example.org/some/path?x=1'), 'https://example.org');
  assert.equal(cleanBase('javascript:alert(1)'), null);
  assert.equal(cleanBase('not a url'), null);
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const calls = [];
  let refuse = false;
  const fetch = async (url, init) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    const body = url.endsWith('/v1/auth/login') ? { secret: 'sek', id: 'a', name: 'n', kind: 'account', sessionId: 's' }
      : url.endsWith('/v1/poi/me') ? { handle: 'Killbunny', builder: true, approver: false } : {};
    if (url.endsWith('/v1/poi/me') && refuse) return { ok: false, status: 401, json: async () => ({ error: 'unauthorized' }) };
    return { ok: true, status: 200, headers: new Map(), json: async () => body };
  };
  const api = createApi({ storage, fetch });
  assert.equal(api.environment().base, ENVIRONMENTS[0].base);
  assert.equal(api.setEnvironment('custom', 'ftp://x'), false);
  assert.ok(api.setEnvironment('custom', 'https://stage.example.org/x'));
  assert.equal(api.environment().base, 'https://stage.example.org');
  const r = await api.signIn('Killbunny', 'password1');
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(api.me().builder, true);
  assert.ok(calls.some((c) => c.startsWith('POST https://stage.example.org/v1/auth/login')));
  const again = createApi({ storage, fetch });
  assert.ok(again.setEnvironment('custom', 'https://stage.example.org'));
  assert.equal(again.signedIn(), true);
  refuse = true;
  await again.refreshMe();
  assert.equal(again.signedIn(), false);
});

test('camera: east is right, north is up from above, rays hit what they aim at', async () => {
  const C = await import('./poi-editor/src/camera.js');
  const cam = C.createCamera();
  cam.mode = 'persp'; cam.yaw = Math.PI; cam.pitch = 0; cam.target = [0, 0, 0]; cam.dist = 10;
  const east = C.project(cam, 1, [3, 0, 0]);
  assert.ok(east && east.x > 0.05, `east x=${east?.x}`);
  const mid = C.project(cam, 1, [0, 0, 0]);
  assert.ok(Math.abs(mid.x) < 1e-6 && Math.abs(mid.y) < 1e-6);
  cam.mode = 'top';
  const north = C.project(cam, 1, [0, 0, 5]);
  assert.ok(north.y > 0.05, `north y=${north.y}`);
  assert.ok(C.project(cam, 1, [4, 0, 0]).x > 0);
  for (const mode of ['persp', 'top', 'front', 'side']) {
    cam.mode = mode; cam.yaw = 0.7; cam.pitch = 0.4; cam.target = [5, 2, -3];
    const p = [6, 1, -2];
    const s = C.project(cam, 1.5, p);
    const ray = C.rayAt(cam, 1.5, s.x, s.y);
    const v = [p[0] - ray.o[0], p[1] - ray.o[1], p[2] - ray.o[2]];
    const t = v[0] * ray.d[0] + v[1] * ray.d[1] + v[2] * ray.d[2];
    const off = Math.hypot(v[0] - ray.d[0] * t, v[1] - ray.d[1] * t, v[2] - ray.d[2] * t);
    assert.ok(off < 1e-3, `${mode} ray misses by ${off}`);
  }
  cam.mode = 'persp'; cam.pitch = 0.5; cam.target = [0, 0, 0];
  const g = C.groundAt(C.rayAt(cam, 1, 0, 0), 0);
  assert.ok(g && Math.hypot(...g) < 1e-3);
});

test('transforms: move, turn, size, reset, align and distribute; frozen nodes stay put', async () => {
  const T = await import('./poi-editor/src/transforms.js');
  const d = doc();
  const stall = find(d, 'part:stall').row;
  const t0 = [...stall.t];
  assert.equal(T.moveNodes(d, ['part:stall'], [1, 0, 2]), 1);
  assert.deepEqual(stall.t, [t0[0] + 1, t0[1], t0[2] + 2]);
  T.turnNodes(d, ['part:stall'], [0, 1, 0], 90, stall.t);
  assert.ok(Math.abs(stall.r[1] - Math.sin(Math.PI / 4)) < 1e-3, JSON.stringify(stall.r));
  T.sizeNodes(d, ['part:stall'], [2, 1, 1]);
  assert.deepEqual(stall.s, [2, 1, 1]);
  T.resetNodes(d, ['part:stall']);
  assert.deepEqual(stall.r, [0, 0, 0, 1]);
  assert.deepEqual(bad(d), []);
  setFlag(d, ['part:stall'], 'locked', true);
  assert.equal(T.moveNodes(d, ['part:stall'], [5, 5, 5]), 0);
  setFlag(d, ['part:stall'], 'locked', false);
  const g = T.alignNodes(d, ['part:stall', 'npc:merchant'], 0, 'max');
  assert.equal(g, 2);
  assert.equal(find(d, 'part:stall').row.t[0], find(d, 'npc:merchant').row.t[0]);
  assert.equal(T.snap(1.13, 0.25), 1.25);
  assert.equal(T.snap(1.13, 0), 1.13);
  assert.equal(T.setNumber(d, 'part:stall', 't.1', 3.14159), true);
  assert.equal(find(d, 'part:stall').row.t[1], 3.142);
});

test('transforms: a figure flat keeps scale 1 and a group moves its members', async () => {
  const T = await import('./poi-editor/src/transforms.js');
  const d = doc();
  d.flats = [{ key: 'person', name: 'P', kind: 'billboard', flat: [182, 0], t: [0, 0, 0], rot: [0, 0, 0], scale: 1, layer: 0, collide: false }];
  T.sizeNodes(d, ['flat:person'], [3, 3, 3]);
  assert.equal(d.flats[0].scale, 1);
  assert.deepEqual(bad(d), []);
  const before = [...find(d, 'part:stall').row.t];
  T.moveNodes(d, ['group:market'], [1, 0, 0]);
  assert.equal(find(d, 'part:stall').row.t[0], before[0] + 1);
});

test('placing: models, billboards and items become lawful rows; the rest say why not', async () => {
  const { placeAsset, whyNotPlaceable } = await import('./poi-editor/src/place.js');
  const file = new URL('./poi-editor/public/asset-catalogue.json', import.meta.url);
  if (!existsSync(file)) return;
  const cat = createCatalogue(JSON.parse(readFileSync(file, 'utf8')));
  const d = doc();
  const model = cat.get('df-arch3d:44010');
  assert.ok(placeAsset(d, model, [1, 0, 1], 'market').id);
  const flat = cat.get('df-flat:182.0');
  assert.ok(placeAsset(d, flat, [2, 0, 2]).id);
  const sword = cat.assets.find((a) => a.namespace === 'paperdoll-item' && a.category === 'Weapons');
  assert.ok(sword);
  const r = placeAsset(d, sword, [3, 0, 3]);
  assert.equal(d.flats.at(-1).kind, 'mount');
  const plant = cat.assets.find((a) => a.namespace === 'paperdoll-item' && a.category === 'PlantIngredients1');
  placeAsset(d, plant, [4, 0, 3]);
  assert.equal(d.flats.at(-1).kind, 'paperdoll');
  assert.ok(r.id);
  assert.deepEqual(bad(d), []);
  assert.ok(whyNotPlaceable(cat.get('df-flat:0.0')));
  assert.ok(placeAsset(d, cat.get('entity:foe-7'), [0, 0, 0]).refused);
  assert.ok(placeAsset(d, cat.assets.find((a) => a.namespace === 'repo-3d'), [0, 0, 0]).refused);
});

test('scene: moving to a group, refused cycles, renaming', async () => {
  const S = await import('./poi-editor/src/scene.js');
  const d = doc();
  S.groupNodes(d, ['part:stall'], 'Inner');
  const inner = d.groups.find((g) => g.name === 'Inner').key;
  assert.equal(S.moveToGroup(d, ['group:market'], inner).refused, 'cycle');
  assert.ok(S.moveToGroup(d, ['npc:merchant'], inner).ok);
  assert.equal(find(d, 'npc:merchant').row.group, inner);
  assert.ok(S.moveToGroup(d, ['npc:merchant'], null).ok);
  assert.equal(find(d, 'npc:merchant').row.group, undefined);
  assert.equal(S.moveToGroup(d, ['npc:merchant'], 'nope').refused, 'nogroup');
  assert.ok(S.renameNode(d, 'part:stall', '  Market   stall  '));
  assert.equal(find(d, 'part:stall').row.name, 'Market stall');
  assert.equal(S.renameNode(d, 'part:stall', '   '), false);
  assert.deepEqual(bad(d), []);
});

// ── the 2D canvas's edits (flat2d.js) ──
import { isMirrored, setMirrored, turnFlat, pivotAt, setPivot, layerStack, shiftLayer, layerEnd } from './poi-editor/src/flat2d.js';

const flatDoc = () => ({ flats: [
  { key: 'a', name: 'A', kind: 'billboard', flat: [200, 1], rot: [0, 0, 0], scale: 1, layer: 0, collide: false, t: [0, 0, 0] },
  { key: 'b', name: 'B', kind: 'billboard', flat: [200, 2], rot: [0, 0, 0], scale: 1, layer: 1, collide: false, t: [0, 0, 0] },
  { key: 'c', name: 'C', kind: 'mount', item: { t: 1, g: 3 }, rot: [0, 0, 0], scale: 1, layer: 1, collide: false, t: [0, 0, 0] },
], parts: [], lights: [], npcs: [], groups: [] });

test('mirroring follows the game rule: more than a quarter turn faces the other way, a mount never does', () => {
  const d = flatDoc();
  assert.equal(isMirrored(d.flats[0]), false);
  assert.equal(setMirrored(d.flats[0], true), true);
  assert.equal(isMirrored(d.flats[0]), true);
  assert.deepEqual(d.flats[0].rot, [180, 0, 0]);
  setMirrored(d.flats[0], false);
  assert.equal(isMirrored(d.flats[0]), false);
  assert.equal(setMirrored(d.flats[2], true), false);
  assert.equal(isMirrored(d.flats[2]), false);
  turnFlat(d.flats[0], 100);
  assert.equal(isMirrored(d.flats[0]), true);
});

test('a turn wraps, and a mount spins on its wall rather than about up', () => {
  const d = flatDoc();
  turnFlat(d.flats[0], 270); assert.equal(d.flats[0].rot[0], -90);
  turnFlat(d.flats[2], 90); assert.deepEqual(d.flats[2].rot, [0, 0, 90]);
});

test('the pivot comes from a point of the picture, snapped, and stays inside it', () => {
  const pic = { width: 40, height: 80 };
  assert.deepEqual(pivotAt(pic, 20, 80), [0.5, 1]);
  assert.deepEqual(pivotAt(pic, 21.4, 33.2, 'pixel'), [0.525, 0.413]);
  assert.deepEqual(pivotAt(pic, 19, 65, 'quarter'), [0.5, 0.75]);
  assert.deepEqual(pivotAt(pic, 18, 78, 'centre'), [0.5, 1]);
  assert.deepEqual(pivotAt(pic, -50, 500, 'off'), [0, 1]);
  const row = {};
  assert.equal(setPivot(row, [0.25, 1]), true); assert.deepEqual(row.pivot, [0.25, 1]);
  assert.equal(setPivot(row, [1.2, 0]), false);
});

test('layers reorder back to front and stay inside the law\'s range', () => {
  const d = flatDoc();
  assert.deepEqual(layerStack(d).map((s) => s.id), ['flat:a', 'flat:b', 'flat:c']);
  assert.equal(shiftLayer(d, 'flat:a', 1), true);
  assert.deepEqual(layerStack(d).map((s) => s.id), ['flat:b', 'flat:a', 'flat:c']);
  assert.equal(layerEnd(d, 'flat:b', true), true);
  assert.equal(layerStack(d).at(-1).id, 'flat:b');
  assert.equal(layerEnd(d, 'flat:b', false), true);
  assert.equal(layerStack(d)[0].id, 'flat:b');
  const e = flatDoc(); e.flats[0].layer = 100; e.flats.splice(1);
  assert.equal(shiftLayer(e, 'flat:a', 1), false);
  assert.equal(e.flats[0].layer, 100);
});

// ── interior decoration (interior.js) ──
import { interiorOf, setShell, hideBase, showBase, showAllBase, describeBase, setFlatLight, editFlatLight, lightSpot, rayBox, mountOnSurface } from './poi-editor/src/interior.js';
import { decorMountFrame } from '../src/net/decorLaw.js';

test('the room shell and the hidden built-in pieces follow the game\'s names and limits', () => {
  const d = {};
  assert.deepEqual(interiorOf(d), { shellModel: null, hiddenBaseKeys: [] });
  assert.ok(setShell(d, 0.5).refused); assert.ok(setShell(d, 0).refused); assert.ok(setShell(d, 1000000).refused);
  assert.equal(setShell(d, 4321).ok, true); assert.equal(d.interior.shellModel, 4321);
  assert.ok(hideBase(d, 'chair').refused); assert.ok(hideBase(d, 'm01:5').refused);
  assert.equal(hideBase(d, 'm12:456').ok, true); assert.equal(hideBase(d, 'f3:200.4').ok, true);
  assert.ok(hideBase(d, 'm12:456').refused);
  assert.deepEqual(describeBase('f3:200.4'), { kind: 'flat', archive: 200, record: 4 });
  assert.deepEqual(describeBase('m12:456'), { kind: 'model', model: 456 });
  assert.equal(describeBase('nope'), null);
  assert.equal(showBase(d, 'm12:456').ok, true); assert.ok(showBase(d, 'm12:456').refused);
  setShell(d, null); showAllBase(d);
  assert.equal('interior' in d, false);
  const many = {};
  let refused = 0;
  for (let i = 0; i < 205; i++) if (hideBase(many, `m${i}:${i + 1}`).refused) refused++;
  assert.ok(refused >= 5 && many.interior.hiddenBaseKeys.length <= 200);
});

test('a flat\'s light stays inside the law and hangs at the flame for a lantern on a chain', () => {
  const row = { kind: 'billboard', flat: [210, 24], t: [1, 0, 2], rot: [0, 0, 0] };
  assert.equal(setFlatLight(row, true), true);
  assert.deepEqual(Object.keys(row.light), ['color', 'radius', 'intensity', 'flicker']);
  assert.equal(editFlatLight(row, 'radius', 99), true); assert.equal(row.light.radius, 30);
  assert.equal(editFlatLight(row, 'intensity', -2), true); assert.equal(row.light.intensity, 0);
  assert.equal(editFlatLight(row, 'color', [2, 0.5, -1]), true); assert.deepEqual(row.light.color, [1, 0.5, 0]);
  assert.equal(editFlatLight(row, 'radius', NaN), false);
  const spot = lightSpot(row, 2);
  assert.ok(Math.abs(spot[1] - 0.2) < 1e-9 && spot[0] === 1 && spot[2] === 2, `${spot}`);
  assert.equal(lightSpot({ kind: 'billboard', flat: [200, 1], t: [0, 0, 0] }, 2)[1], 1);
  setFlatLight(row, false); assert.equal('light' in row, false);
});

test('a mount hangs on the face a ray hits, facing out and a hair off it', () => {
  const hit = rayBox([0, 1, -5], [0, 0, 1], [-1, 0, -1], [1, 3, 1]);
  assert.deepEqual(hit.normal, [0, 0, -1]); assert.ok(Math.abs(hit.dist - 4) < 1e-9);
  assert.equal(rayBox([0, 1, -5], [0, 0, -1], [-1, 0, -1], [1, 3, 1]), null);
  const m = mountOnSurface(hit.point, hit.normal);
  assert.deepEqual(m.rot, [180, 0, 0]);
  assert.ok(Math.abs(m.t[2] - (-1 - 0.02)) < 1e-9);
  const f = decorMountFrame(m.rot);
  assert.ok(Math.abs(f.normal[2] - -1) < 1e-9 && Math.abs(f.normal[0]) < 1e-9);
  const ceil = mountOnSurface([0, 3, 0], [0, -1, 0]); assert.equal(ceil.rot[1], -90);
});
