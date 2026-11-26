import test from 'node:test';
import assert from 'node:assert/strict';
import { poiFlatPiece, poiFlatPicture, flatYawThrough, mountRotThrough, createPoiFlats } from '../src/poi/poiFlats.js';
import { createPoiHost } from '../src/poi/poiHost.js';
import { createPoiFeed } from '../src/poi/poiFeed.js';
import { newPoiDoc } from '../src/poi/poiEdit.js';
import { poiDocProblems } from '../src/poi/poiLaw.js';
import { decorMountFrame, decorFlatMirrored, decorIsMount } from '../src/net/decorLaw.js';
import { decorStandsOwn } from '../src/homes/decorRoom.js';
import { quatAngleAxis, quatMultiply, quatRotate } from '../src/world/quat.js';

const near = (a, b, eps = 1e-3) => a.every((v, i) => Math.abs(v - b[i]) < eps);
const close = (a, b, msg) => assert.ok(near(a, b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const TURNED = quatAngleAxis(180, [0, 1, 0]);
const TILTED = quatMultiply(quatAngleAxis(30, [0, 1, 0]), quatAngleAxis(40, [1, 0, 0]));

const billboard = { key: 'lamp', kind: 'billboard', flat: [210, 1], t: [2, 0, 1], rot: [0, 0, 0], scale: 1.5, layer: 0, collide: false, light: { color: [1, 0.8, 0.6], radius: 6, intensity: 1.2, flicker: true } };
const figure = { key: 'guard', kind: 'billboard', flat: [184, 3], t: [0, 0, 3], rot: [0, 0, 0], scale: 1, layer: 0, collide: false };
const robe = { key: 'robe', kind: 'paperdoll', item: { t: 200 }, t: [-1, 0, 0], rot: [0, 0, 0], scale: 1, layer: 0, collide: false };
const dagger = { key: 'dagger', kind: 'mount', item: { t: 113, g: 3 }, t: [0, 1.5, -0.5], rot: [0, 0, 20], scale: 1, layer: 0, collide: false };

test('fixture rows are valid in a v2 POI', () => {
  const d = newPoiDoc({ id: 'poi-f1a700000001', px: 600, py: 250, x: 10, z: 10, name: 'Flats' });
  d.flats = [billboard, figure, robe, dagger];
  assert.deepEqual(poiDocProblems(d), []);
});

test('billboard row transforms position and scales size and light by the POI scale', () => {
  const p = poiFlatPiece(billboard, { r: [0, 0, 0, 1], s: 2 });
  assert.deepEqual(p.flat, [210, 1]);
  close(p.pos, [4, 0, 2], 'spot');
  assert.equal(p.scale, 3);
  assert.deepEqual(p.light, { range: 12, intensity: 1.2, color: [1, 0.8, 0.6], flicker: true });
  assert.equal(p.item, undefined, 'a billboard carries no item');
  assert.equal(decorFlatMirrored(p), false);
});

test('rotating a POI 180 degrees rotates the position and mirrors the billboard', () => {
  const p = poiFlatPiece(billboard, { r: TURNED, s: 1 });
  close(p.pos, [-2, 0, -1], 'spot');
  assert.equal(Math.abs(p.rot[0]), 180);
  assert.equal(decorFlatMirrored(p), true);
  const back = poiFlatPiece({ ...billboard, rot: [180, 0, 0] }, { r: TURNED, s: 1 });
  assert.equal(back.rot[0], 0);
  assert.equal(decorFlatMirrored(back), false);
  assert.equal(flatYawThrough(quatAngleAxis(90, [0, 1, 0]), 0), 90);
});

test('a figure sprite keeps its own scale regardless of the POI scale', () => {
  const p = poiFlatPiece(figure, { r: [0, 0, 0, 1], s: 2.5 });
  assert.equal(p.scale, 1);
  close(p.pos, [0, 0, 7.5], 'spot');
});

test('a paperdoll row without a flat property uses its item\'s world sprite', () => {
  assert.deepEqual(poiFlatPicture(robe), [204, 0]);
  const p = poiFlatPiece(robe, { r: [0, 0, 0, 1], s: 1 });
  assert.deepEqual(p.flat, [204, 0]);
  assert.deepEqual(p.item, { t: 200 });
  assert.equal(decorStandsOwn(p), true, 'marked as a placed paperdoll item for the decor room');
  assert.deepEqual(poiFlatPicture({ ...robe, flat: [204, 3] }), [204, 3]);
  assert.equal(poiFlatPiece({ ...robe, item: { t: 220 } }, { r: [0, 0, 0, 1], s: 1 }), null);
});

test('a mount row uses its inventory sprite and rotates by its own angles', () => {
  const p = poiFlatPiece(dagger, { r: [0, 0, 0, 1], s: 1 });
  assert.deepEqual(p.flat, [234, 5]);
  assert.equal(decorIsMount(p), true);
  const f = decorMountFrame(p.rot), g = decorMountFrame(dagger.rot);
  close(f.normal, g.normal, 'normal'); close(f.right, g.right, 'right'); close(f.up, g.up, 'up');
});

test('a tilted POI tilts a mount\'s frame with it', () => {
  for (const rot of [[0, 0, 20], [35, -10, 0], [-120, 60, 90], [10, 90, 0]]) {
    const own = decorMountFrame(rot);
    const turned = decorMountFrame(mountRotThrough(TILTED, rot));
    close(turned.normal, quatRotate(TILTED, own.normal), `normal ${rot}`);
    close(turned.right, quatRotate(TILTED, own.right), `right ${rot}`);
    close(turned.up, quatRotate(TILTED, own.up), `up ${rot}`);
  }
  const p = poiFlatPiece(dagger, { r: TILTED, s: 1 });
  close(p.pos, quatRotate(TILTED, dagger.t), 'spot');
});

function countingRenderer() {
  const n = { billboards: 0, destroyed: 0, decals: 0, decalsGone: 0, decalDraws: 0 };
  const textures = new Map();
  const r = {
    n,
    textures: { get: (k) => textures.get(k) ?? { k } },
    createBillboardBatch: (archive, record, size, spots) => { n.billboards++; return { archive, record, size, _quads: spots.length, origin: [0, 0, 0], spots }; },
    destroyBillboardBatch: () => { n.destroyed++; },
    createDecalBatch: () => { n.decals++; return { decal: true }; },
    writeDecalSlot: () => {},
    destroyDecalBatch: () => { n.decalsGone++; },
    drawDecalPicture: () => { n.decalDraws++; },
    drawMesh: () => {}, createMesh: () => ({}), destroyMesh: () => {}, releaseTexture: () => {}, uploadTexture: () => ({}),
  };
  return r;
}
const textureFile = { recordCount: 512, getSize: () => ({ width: 32, height: 64 }), getScale: () => ({ width: 0, height: 0 }), getFrameCount: () => 1 };
const settle = () => new Promise((res) => setTimeout(res, 5));

test('the POI host renders a POI\'s flats through a single decor room', async () => {
  const d = newPoiDoc({ id: 'poi-f1a700000002', px: 600, py: 250, x: 10, z: 10, name: 'Flats' });
  d.flats = [structuredClone(billboard), structuredClone(figure), structuredClone(robe), structuredClone(dagger)];
  const fetch = async (u) => {
    const path = new URL(String(u)).pathname;
    if (path === '/v1/poi/live') return new Response(JSON.stringify({ v: 1, pois: [{ id: d.id, rev: 1, doc: d }] }), { headers: { etag: '"poi-1"' } });
    return new Response('{}', { status: 404 });
  };
  const feed = createPoiFeed({ base: () => 'http://store.invalid', fetch, cache: null, log: null });
  await feed.refresh();
  const renderer = countingRenderer();
  const uploads = [];
  const host = createPoiHost({
    renderer, feed, decodeImage: async () => ({ width: 1, height: 1, data: new Uint8Array(4) }),
    pixels: () => [{ px: 600, py: 250 }], translation: (px, py, out = [0, 0, 0]) => { out[0] = 100; out[1] = 0; out[2] = 200; return out; },
    groundAt: () => 5, clock: () => 0, now: () => 1_000_000, log: null,
    getTexture: async () => textureFile, uploadRecord: (a, r) => { uploads.push(`${a}.${r}`); return ''; }, uploadRecordFrame: () => null,
  });
  for (let i = 0; i < 4; i++) { host.frame(); await settle(); }
  host.frame();
  assert.equal(renderer.n.billboards, 3, 'the billboard, the person, and the robe are billboards');
  assert.equal(renderer.n.decals, 1, 'the dagger hangs on the decal pass');
  const batches = host.batches();
  assert.equal(batches.length, 3);
  assert.ok(batches.some((b) => b.archive === 210 && b.record === 1));
  assert.ok(batches.some((b) => b.archive === 204 && b.record === 0), 'the robe as its item\'s world picture');
  const lamp = batches.find((b) => b.archive === 210);
  close(lamp.spots[0], [100 + 10 + 2, 5 + 0, 200 + 10 + 1], 'the lamp in the scene');
  assert.equal(host.drawMounts(renderer), 1);
  const lights = host.lights([]);
  assert.equal(lights.length, 1, 'the lamp\'s light among the POI\'s lights');
  assert.ok(lights[0].color instanceof Float32Array);
  const made = renderer.n.billboards;
  host.frame(); await settle();
  assert.equal(renderer.n.billboards, made);
  assert.strictEqual(host.batches(), batches, 'one list, refilled');
  const hit = host.pick([112, 5.5, 190], [0, 0, 1]);
  assert.equal(hit?.kind, 'flat');
  assert.equal(hit?.key, 'lamp');
  assert.notEqual(host.flatBox(d.id, 'lamp'), null);
  const moved = structuredClone(d);
  moved.flats[0].t = [3, 0, 1];
  feed.setOverlay(new Map([[d.id, { doc: moved, rev: 0 }]]));
  for (let i = 0; i < 3; i++) { host.frame(); await settle(); }
  const lamp2 = host.batches().find((b) => b.archive === 210);
  close(lamp2.spots[0], [113, 5, 211], 'the lamp moved');
  feed.setOverlay(new Map([[d.id, null]]));
  host.destroyAll();
  host.frame();
  assert.equal(host.batches().length, 0);
  assert.ok(renderer.n.decalsGone >= 1 && renderer.n.destroyed >= 3);
});

test('a POI with no flats does not create a decor room', () => {
  const flats = createPoiFlats({ renderer: countingRenderer() });
  flats.frame();
  flats.sync({ id: 'poi-x', px: 1, py: 1, y: 0, doc: { place: { x: 0, z: 0, r: [0, 0, 0, 1], s: 1 }, flats: [] } }, [0, 0, 0]);
  assert.deepEqual(flats.standing(), []);
});

test('the editor builds valid flat rows for a billboard, a paperdoll item, and a mounted item', async () => {
  const { newFlat } = await import('../src/poi/poiFlatRows.js');
  const d = newPoiDoc({ id: 'poi-f1a700000003', px: 600, py: 250, x: 10, z: 10, name: 'Flats' });
  d.flats = [];
  d.flats.push(newFlat(d, { flat: [210, 1], t: [1, 0, 0], light: { color: [1, 0.9, 0.7], radius: 5, intensity: 1, flicker: true } }));
  d.flats.push(newFlat(d, { kind: 'item', item: { t: 200 }, flat: [204, 0], t: [2, 0, 0] }));
  d.flats.push(newFlat(d, { kind: 'item', item: { t: 113, g: 3 }, flat: [234, 5], t: [3, 1, 0] }));
  d.flats.push(newFlat(d, { flat: [210, 1], t: [4, 0, 0] }));
  assert.deepEqual(d.flats.map((f) => f.kind), ['billboard', 'paperdoll', 'mount', 'billboard']);
  assert.equal(new Set(d.flats.map((f) => f.key)).size, 4, 'each its own key');
  assert.deepEqual(poiDocProblems(d), []);
});

test('the gizmo rotates and scales a flat row; a figure keeps its scale; mirroring follows the POI\'s rotation', async () => {
  const { applyMulti } = await import('../src/poi/poiMulti.js');
  const { setFlatMirrored, flatMirrored } = await import('../src/poi/poiFlatRows.js');
  const d = newPoiDoc({ id: 'poi-f1a700000004', px: 600, py: 250, x: 10, z: 10, name: 'Flats' });
  d.flats = [structuredClone(billboard), structuredClone(dagger), structuredClone(figure)];
  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  applyMulti(d, ['flat:lamp'], { turn: { axis: [0, 1, 0], deg: 90 } }, { pivot: billboard.t, axes });
  assert.equal(d.flats[0].rot[0], 90);
  close(d.flats[0].t, billboard.t, 'turned about its own spot');
  applyMulti(d, ['flat:dagger'], { turn: { axis: [0, 1, 0], deg: 90 } }, { pivot: dagger.t, axes });
  const f = decorMountFrame(d.flats[1].rot), g = decorMountFrame(dagger.rot), q = quatAngleAxis(90, [0, 1, 0]);
  close(f.normal, quatRotate(q, g.normal), 'the mount\'s normal'); close(f.right, quatRotate(q, g.right), 'the mount\'s right side');
  applyMulti(d, ['flat:lamp', 'flat:guard'], { size: [2, 2, 2] }, { pivot: [0, 0, 0], axes });
  assert.equal(d.flats[0].scale, 3);
  assert.equal(d.flats[2].scale, 1, 'a person\'s picture keeps its own size');
  assert.deepEqual(poiDocProblems(d), []);
  d.place.r = TURNED;
  d.flats[0].rot = [0, 0, 0];
  assert.equal(flatMirrored(d.flats[0], d.place), true);
  setFlatMirrored(d.place, d.flats[0], false);
  assert.equal(flatMirrored(d.flats[0], d.place), false);
  assert.equal(decorFlatMirrored(poiFlatPiece(d.flats[0], d.place)), false, 'the game agrees');
  assert.equal(setFlatMirrored(d.place, d.flats[1], true), false, 'a mount never mirrors');
});

test('a trophy resolves to its beast plaque sprite or null without a beast; a billboard of any archive uses its own archive and record', async () => {
  const { trophyArchiveOf } = await import('../src/systems/hunt/trophies.js');
  assert.equal(poiFlatPicture({ kind: 'mount', item: { t: 601 } }), null);
  assert.deepEqual(poiFlatPicture({ kind: 'mount', item: { t: 601, p: 3 } }), [trophyArchiveOf(3), 0]);
  assert.notEqual(trophyArchiveOf(3), 0);
  assert.deepEqual(poiFlatPicture({ kind: 'billboard', flat: [105, 3] }), [105, 3], 'a seafloor plant');
  assert.deepEqual(poiFlatPicture({ kind: 'billboard', flat: [172, 0] }), [172, 0]);
});

test('a flat and a mount moved every frame, and a recenter, are drawn in every frame', async () => {
  const renderer = countingRenderer();
  const flats = createPoiFlats({ renderer, getTexture: async () => textureFile, uploadRecord: () => '' });
  const d = newPoiDoc({ id: 'poi-f1a700000005', px: 600, py: 250, x: 10, z: 10, name: 'Dragged' });
  d.flats = [structuredClone(billboard), structuredClone(dagger)];
  const s = { id: d.id, px: 600, py: 250, y: 5, doc: d };
  const t = [0, 0, 0];
  flats.frame(); flats.sync(s, t); await settle();
  let drawn = 0, hung = 0;
  const pass = { drawDecalPicture: () => { hung++; } };
  for (let i = 1; i <= 20; i++) {
    const moved = structuredClone(s.doc);
    moved.flats[0].t = [2 + i * 0.1, 0, 1];
    moved.flats[1].t = [0, 1.5, -0.5 + i * 0.1];
    s.doc = moved;
    if (i % 5 === 0) t[0] += 100;
    flats.frame(); flats.sync(s, t);
    if (flats.batches().some((b) => b.archive === 210 && !b.gone)) drawn++;
    flats.drawMounts(pass);
  }
  assert.equal(drawn, 20, 'the dragged billboard is on the billboard pass in every frame');
  assert.equal(hung, 20, 'the dragged mount is on the decal pass in every frame');
});
