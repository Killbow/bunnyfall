// The game's POI host (src/scenes/poiHost.js) standing documents served by its own feed (src/poi/poiFeed.js), with a
// stub renderer and an in-process store (no sockets): a v1 POI of uploaded models, a v2 POI that mixes an uploaded
// model with a Daggerfall model part from the World Builder, parts whose assets the store lacks, fails on, or refuses,
// parts whose bytes will not read, a new revision, and a builder's draft laid over the feed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createPoiFeed } from '../src/poi/poiFeed.js';
import { createPoiHost, POI_RETRY_MS } from '../src/scenes/poiHost.js';
import { newPoiDoc, newPart, newNpc } from '../src/poi/poiEdit.js';
import { poiDocProblems } from '../src/poi/poiLaw.js';
import { encodePoiMesh } from '../src/poi/poiMesh.js';
import { poiV2Example } from './poiV2Examples.mjs';
import { DECOR_DRAW } from '../src/scenes/decor/decorRoom.js';

const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const shaOf = async (b) => hex(await crypto.subtle.digest('SHA-256', b));
const meshOf = (k) => encodePoiMesh({
  positions: new Float32Array([0, 0, 0, k, 0, 0, 0, k, 0]), normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  uvs: new Float32Array([0, 0, 1, 0, 0, 1]), indices: new Uint16Array([0, 1, 2]), submeshes: [{ start: 0, count: 3 }],
});
const MESH = meshOf(1), MESH_SHA = await shaOf(MESH);
// the part whose answers each test sets
const ROOF = meshOf(2), ROOF_SHA = await shaOf(ROOF);
// served, but will not read
const JUNK = new TextEncoder().encode('not a model at all'), JUNK_SHA = await shaOf(JUNK);
const BAD_PICTURE = new TextEncoder().encode('not a picture'), BAD_PICTURE_SHA = await shaOf(BAD_PICTURE);
const PY = 250;

const v1Poi = (id, px) => {
  const d = newPoiDoc({ id, px, py: PY, x: 10, z: 10, name: 'Old shed' });
  d.parts.push(newPart(d, { mesh: MESH_SHA, submeshes: 1, name: 'shed' }));
  return d;
};
/** The v2 schema's worked example: its first part is an uploaded model, and its second is a Daggerfall model (as the
 *  World Builder writes). */
const mixedPoi = (id, px) => {
  const d = poiV2Example();
  d.id = id; d.place.px = px; d.place.py = PY;
  const [stall, span] = d.parts;
  d.parts = [{ ...newPart(d, { mesh: MESH_SHA, submeshes: 1, name: 'Stall' }), key: stall.key, group: stall.group }, { ...span, arch3d: 343 }];
  delete d.parts[1].mesh; delete d.parts[1].materials;
  return d;
};
const withPart = (d, key, mesh) => { d.parts.push({ ...newPart(d, { mesh, submeshes: 1, name: key }), key }); return d; };
const keeper = (d) => { d.npcs = [newNpc(d, { name: 'Keeper', t: [2, 0, 0], look: { k: 'df', a: 184, r: 0 } })]; return d; };

/**
 * A store, a feed, and a host over `docs` (live, rev `live.rev`) and `drafts` (laid over the feed). `roof(n)` answers
 * the n-th ask for ROOF_SHA: a Response, or it throws (a fetch that got no answer).
 */
async function rig({ docs = [], drafts = [], roof = () => new Response(ROOF), dmTest = null, dmHeld = undefined } = {}) {
  const live = { rev: 1, docs };
  const asked = new Map();
  const fetch = async (u) => {
    const path = new URL(String(u)).pathname;
    const sha = /\/asset\/([0-9a-f]{64})$/.exec(path)?.[1];
    if (sha) asked.set(sha, (asked.get(sha) ?? 0) + 1);
    if (path === '/v1/poi/live') return new Response(JSON.stringify({ v: live.rev, pois: live.docs.map((doc) => ({ id: doc.id, rev: live.rev, doc })) }), { headers: { etag: `"poi-${live.rev}"` } });
    if (sha === MESH_SHA) return new Response(MESH);
    if (sha === ROOF_SHA) return roof(asked.get(sha));
    if (sha === JUNK_SHA) return new Response(JUNK);
    if (sha === BAD_PICTURE_SHA) return new Response(BAD_PICTURE);
    return new Response('{}', { status: 404 });
  };
  const warnings = [];
  const log = { warn: (...a) => warnings.push(a.join(' ')) };
  const feed = createPoiFeed({ base: () => 'http://store.invalid', fetch, cache: null, log });
  await feed.refresh();
  // every ask the host makes of the feed, by sha (the feed answers a second ask from memory, without the store)
  const wanted = new Map();
  const asset = feed.asset;
  feed.asset = (sha, o) => { wanted.set(sha, (wanted.get(sha) ?? 0) + 1); return asset(sha, o); };
  if (drafts.length) feed.setOverlay(new Map(drafts.map((d) => [d.id, { doc: d, rev: 0 }])));
  const people = {}, dmFrames = {}, dmCloses = { n: 0 }, dmTicks = { n: 0 };
  const dm = () => Promise.resolve({
    frame: (s, t, shown) => { dmFrames[s.id] = (dmFrames[s.id] ?? 0) + 1; return shown; },
    extras: () => [], talk: () => false, drop: () => {}, close: () => { dmCloses.n++; }, tick: () => { dmTicks.n++; },
  });
  let clock = 1_000_000;
  const renderer = new Proxy({}, { get: (_, k) => (k === 'then' ? undefined : () => ({})) });
  const pixels = [...new Set([...docs, ...drafts].map((d) => d.place.px))].map((px) => ({ px, py: PY }));
  const decodeImage = async (bytes) => {
    if (await shaOf(bytes) === BAD_PICTURE_SHA) throw new Error('poi image: not a picture');
    return { width: 1, height: 1, data: new Uint8Array(4) };
  };
  const host = createPoiHost({
    renderer, feed, decodeImage,
    pixels: () => pixels, translation: (px, py, out = [0, 0, 0]) => { out[0] = 0; out[1] = 0; out[2] = 0; return out; },
    groundAt: () => 0, clock: () => 0, now: () => clock, dm, dmTest, dmHeld,
    getTexture: async () => null, uploadRecordFrame: () => null, log,
  });
  // the people each POI shows this frame, as the host hands them to its people pass
  const sync = host.npcs.sync;
  host.npcs.sync = (id, shown, t) => { people[id] = shown.length; return sync(id, shown, t); };
  const console0 = console.warn;
  // each frame as the world runs it: the host's frame, then its opaque draw, its translucent draw, and a pick, with the
  // view test checking every box it is handed (world.js yardCull)
  const cull = (b) => { if (![0, 1, 2, 3, 4, 5].every((k) => Number.isFinite(b[k]))) throw new Error('a box that is not one'); return DECOR_DRAW; };
  let translucentDrawn = 0;
  const frames = async (n = 60) => {
    console.warn = log.warn;
    try {
      for (let i = 0; i < n; i++) {
        host.frame();
        host.draw(renderer, cull);
        host.drawTranslucent({ drawMesh: () => { translucentDrawn++; } }, [0, 2, -5], cull);
        host.pick([0, 2, -5], [0, 0, 1]);
        await new Promise((r) => setTimeout(r, 2));
      }
    } finally { console.warn = console0; }
  };
  const of = (id) => host.standing().find((s) => s.id === id);
  /** A new revision of the live set: `change` applied to each document, the feed asked again. */
  const revise = async (change) => { live.docs = live.docs.map((d) => change(structuredClone(d))); live.rev++; await feed.refresh(); };
  return { host, feed, asked, wanted, warnings, translucent: () => translucentDrawn, people, dmFrames, dmCloses, dmTicks, frames, of, revise, later: (ms) => { clock += ms; } };
}

test('the fixtures are lawful POIs', () => {
  for (const d of [v1Poi('poi-111111111111', 500), mixedPoi('poi-222222222222', 501)]) assert.deepEqual(poiDocProblems(d), [], d.id);
});

test('a v1 POI of uploaded models stands ready', async () => {
  const r = await rig({ docs: [v1Poi('poi-111111111111', 500)] });
  await r.frames();
  assert.deepEqual(r.of('poi-111111111111'), { id: 'poi-111111111111', rev: 1, status: 'ready', visible: true, draft: false, parts: 1 });
  assert.deepEqual(r.warnings, []);
});

test('a v2 POI with a Daggerfall model part stands with its uploaded part, its people, and its DM content', async () => {
  const d = mixedPoi('poi-222222222222', 501);
  const r = await rig({ docs: [d] });
  await r.frames();
  const s = r.of(d.id);
  assert.equal(s.status, 'ready');
  assert.equal(s.visible, true);
  assert.equal(s.parts, 1, 'the uploaded part stands, the Daggerfall model part is left out');
  assert.ok(r.dmFrames[d.id] > 0, 'its DM runtime runs');
  assert.equal(r.people[d.id], d.npcs.length, 'its people stand');
  assert.notEqual(r.host.partOf(d.id, 'stall'), null);
  assert.equal(r.host.partOf(d.id, 'span'), null);
  const said = r.warnings.filter((w) => w.includes(d.id));
  assert.equal(said.length, 1, `one warning for the part left out: ${JSON.stringify(r.warnings)}`);
  assert.match(said[0], /stands without part span/);
});

for (const status of [404, 410]) {
  test(`a part the store does not have (${status}) is left out, the rest stands, and it is asked again after the wait`, async () => {
    const d = keeper(withPart(v1Poi('poi-333333333333', 502), 'roof', ROOF_SHA));
    const r = await rig({ docs: [d], roof: (n) => (n === 1 ? new Response('', { status }) : new Response(ROOF)) });
    await r.frames();
    assert.equal(r.of(d.id).status, 'ready');
    assert.equal(r.of(d.id).parts, 1);
    assert.equal(r.people[d.id], 1, 'its people stand meanwhile');
    assert.equal(r.host.partOf(d.id, 'roof'), null);
    assert.equal(r.warnings.filter((w) => w.includes(d.id)).length, 1);
    await r.frames(10);
    assert.equal(r.asked.get(ROOF_SHA), 1, 'not asked again before the wait');
    r.later(POI_RETRY_MS);
    await r.frames();
    assert.equal(r.asked.get(ROOF_SHA), 2);
    assert.equal(r.of(d.id).parts, 2, 'the part joins once the store has it');
    assert.notEqual(r.host.partOf(d.id, 'roof'), null);
    assert.equal(r.warnings.filter((w) => w.includes(d.id)).length, 1, 'no second warning');
  });
}

const noAnswer = (message) => () => { throw new TypeError(message); };
const answered = (status) => () => new Response('{"error":"x"}', { status });
for (const [what, first] of [
  ['no answer (Chrome)', noAnswer('Failed to fetch')], ['no answer (Safari)', noAnswer('Load failed')], ['no answer (any wording)', noAnswer('something else went wrong')],
  ['401', answered(401)], ['403', answered(403)], ['408', answered(408)], ['429', answered(429)], ['500', answered(500)], ['503', answered(503)],
]) {
  test(`a part the store could not be asked for (${what}) fails the POI, which stands whole after the wait`, async () => {
    const d = withPart(v1Poi('poi-444444444444', 503), 'roof', ROOF_SHA);
    const r = await rig({ docs: [d], roof: (n) => (n === 1 ? first() : new Response(ROOF)) });
    await r.frames();
    assert.equal(r.of(d.id).status, 'failed', 'never stood without the part');
    await r.frames(10);
    assert.equal(r.of(d.id).status, 'failed', 'not asked again before its wait');
    r.later(POI_RETRY_MS);
    await r.frames();
    assert.equal(r.of(d.id).status, 'ready');
    assert.equal(r.of(d.id).parts, 2);
  });
}

test('a see-through part the store did not have joins whole once it does: drawn, drawn see-through, and picked every frame', async () => {
  const d = v1Poi('poi-aaaaaaaaaaab', 509);
  d.parts.push({ ...newPart(d, { mesh: ROOF_SHA, submeshes: 1, name: 'glass' }), key: 'glass' });
  d.parts[1].materials[0].alpha = 'blend';
  d.parts[1].materials[0].color = [1, 1, 1, 0.5];
  assert.deepEqual(poiDocProblems(d), []);
  let have = false;
  const r = await rig({ docs: [d], roof: () => (have ? new Response(ROOF) : new Response('', { status: 404 })) });
  await r.frames();
  assert.equal(r.of(d.id).parts, 1);
  assert.equal(r.translucent(), 0);
  have = true;
  r.later(POI_RETRY_MS);
  // the re-ask, the join, and the frames after it, each drawn and picked
  await r.frames();
  assert.equal(r.of(d.id).parts, 2);
  assert.ok(r.translucent() > 0, 'the see-through part is drawn');
  const glass = r.host.partOf(d.id, 'glass');
  assert.ok(glass?.box?.every((c) => Number.isFinite(c)), 'it joined with a box');
});

test('a part whose model will not read is left out for the revision, and a new revision asks again', async () => {
  const d = keeper(withPart(v1Poi('poi-555555555555', 504), 'junk', JUNK_SHA));
  const r = await rig({ docs: [d] });
  await r.frames();
  assert.equal(r.of(d.id).status, 'ready');
  assert.equal(r.of(d.id).parts, 1);
  assert.equal(r.people[d.id], 1);
  r.later(POI_RETRY_MS);
  await r.frames();
  assert.equal(r.wanted.get(JUNK_SHA), 1, 'bytes that will not read are not asked again within the revision');
  // the same build: the stand is kept
  await r.revise((x) => ({ ...x, name: 'Renamed shed' }));
  await r.frames();
  assert.equal(r.of(d.id).rev, 2);
  assert.equal(r.wanted.get(JUNK_SHA), 2, 'a new revision asks again');
  assert.equal(r.of(d.id).parts, 1);
});

test('a part whose picture will not read is left out and the rest stands', async () => {
  const d = v1Poi('poi-666666666666', 505);
  d.parts.push({ ...newPart(d, { mesh: ROOF_SHA, submeshes: 1, name: 'sign' }), key: 'sign' });
  d.parts[1].materials[0].texture = BAD_PICTURE_SHA;
  const r = await rig({ docs: [d] });
  await r.frames();
  assert.equal(r.of(d.id).status, 'ready');
  assert.equal(r.of(d.id).parts, 1);
  assert.equal(r.host.partOf(d.id, 'sign'), null);
});

test('a part the store does not have is asked again at once by a new revision of the same build', async () => {
  const d = withPart(v1Poi('poi-777777777777', 506), 'roof', ROOF_SHA);
  let have = false;
  const r = await rig({ docs: [d], roof: () => (have ? new Response(ROOF) : new Response('', { status: 404 })) });
  await r.frames();
  assert.equal(r.of(d.id).parts, 1);
  have = true;
  await r.revise((x) => ({ ...x, name: 'Shed with a roof' }));
  await r.frames();
  assert.equal(r.of(d.id).rev, 2);
  assert.equal(r.of(d.id).parts, 2, 'no wait: the skip did not survive the revision');
});

test('after a new revision, a part the store still does not have waits again before the next ask', async () => {
  const d = withPart(v1Poi('poi-aaaaaaaaaaad', 511), 'roof', ROOF_SHA);
  const r = await rig({ docs: [d], roof: () => new Response('', { status: 404 }) });
  await r.frames();
  assert.equal(r.asked.get(ROOF_SHA), 1);
  await r.revise((x) => ({ ...x, name: 'Renamed, roof still missing' }));
  await r.frames();
  assert.equal(r.asked.get(ROOF_SHA), 2, 'asked once right after the revision, and not again until the wait ends');
  r.later(POI_RETRY_MS);
  await r.frames();
  assert.equal(r.asked.get(ROOF_SHA), 3);
  assert.equal(r.of(d.id).parts, 1);
});

test('a revision that comes while a missing part is being asked for again still asks for it at once', async () => {
  const d = withPart(v1Poi('poi-aaaaaaaaaaac', 510), 'roof', ROOF_SHA);
  let release = null;
  const r = await rig({
    docs: [d],
    roof: (n) => (n === 1 ? new Response('', { status: 404 }) : n === 2 ? new Promise((res) => { release = () => res(new Response('', { status: 404 })); }) : new Response(ROOF)),
  });
  await r.frames();
  r.later(POI_RETRY_MS);
  await r.frames(5);
  assert.equal(r.asked.get(ROOF_SHA), 2, 'the re-ask is out');
  await r.revise((x) => ({ ...x, name: 'Renamed while asking' }));
  await r.frames(5);
  release();
  await r.frames();
  assert.equal(r.asked.get(ROOF_SHA), 3, 'asked again at once for the revision, with no wait');
  assert.equal(r.of(d.id).parts, 2);
});

test('a draft laid over the feed stands as a draft, with no DM runtime, and a Daggerfall model part left out', async () => {
  const live = v1Poi('poi-888888888888', 507);
  const draft = mixedPoi('poi-999999999999', 508);
  const moved = structuredClone(live); moved.parts[0].t = [3, 0, 0];
  const r = await rig({ docs: [live], drafts: [draft, moved] });
  await r.frames();
  assert.deepEqual(r.of(draft.id), { id: draft.id, rev: 0, status: 'ready', visible: true, draft: true, parts: 1 });
  assert.equal(r.dmFrames[draft.id], undefined, 'a draft runs no DM content');
  assert.equal(r.people[draft.id], draft.npcs.length);
  assert.deepEqual(r.of(live.id), { id: live.id, rev: 0, status: 'ready', visible: true, draft: true, parts: 1 }, 'the draft stands in place of the live one');
});

test('the draft under the editor\'s Test runs its preview runtime; other drafts run none, and live POIs stay on the game\'s runtime', async () => {
  const tested = mixedPoi('poi-aaaaaaaaaaa1', 509);
  const other = mixedPoi('poi-aaaaaaaaaaa2', 510);
  const live = mixedPoi('poi-aaaaaaaaaaa3', 511);
  const frames = {}, talks = [], drops = [];
  let on = true;
  const preview = {
    frame: (s, t, shown) => { frames[s.id] = (frames[s.id] ?? 0) + 1; return shown; },
    extras: () => [], off: () => null, talk: (id, key) => { talks.push(`${id} ${key}`); return true; }, drop: (id) => { drops.push(id); },
  };
  const r = await rig({ docs: [live], drafts: [tested, other], dmTest: (id) => (on && id === tested.id ? preview : null) });
  await r.frames();
  assert.ok(frames[tested.id] > 0, 'the draft under test runs on the preview runtime');
  assert.equal(frames[other.id], undefined, 'another draft runs nothing');
  assert.equal(r.dmFrames[tested.id], undefined, 'the game\'s runtime does not run the draft');
  assert.ok(r.dmFrames[live.id] > 0, 'a live POI runs on the game\'s runtime');
  assert.equal(frames[live.id], undefined, 'and never on the preview');
  assert.equal(r.host.npcs.activate(`poinpc:${tested.id}|${tested.npcs[0].key}`), true);
  assert.deepEqual(talks, [`${tested.id} ${tested.npcs[0].key}`], 'Talk to a person of the draft under test goes to the preview runtime');
  on = false;
  const before = frames[tested.id];
  await r.frames(5);
  assert.equal(frames[tested.id], before, 'once the test stops, the draft runs nothing');
  r.feed.setOverlay(new Map([[other.id, { doc: other, rev: 0 }]]));
  on = true;
  await r.frames(3);
  assert.deepEqual(drops, [tested.id], 'the draft under test taken down drops its preview run');
});

test('while a Test runs a live POI stands with no DM runtime, and its people\'s Talk reaches none; after it, the runtime runs again', async () => {
  const live = mixedPoi('poi-bbbbbbbbbbb1', 512);
  let held = true;
  const r = await rig({ docs: [live], dmTest: () => null, dmHeld: () => held });
  await r.frames();
  assert.equal(r.dmFrames[live.id], undefined, 'no live DM content runs in a Test');
  assert.equal(r.people[live.id], live.npcs.length, 'its people still stand');
  held = false;
  await r.frames(5);
  assert.ok(r.dmFrames[live.id] > 0, 'after the Test the live runtime runs again');
});

test('leaving the street closes the live and Test runtimes\' panels, since no frame runs indoors to time out a hand-over', async () => {
  const live = mixedPoi('poi-bbbbbbbbbbb3', 514);
  const draft = mixedPoi('poi-bbbbbbbbbbb4', 515);
  let testCloses = 0;
  const testRt = { frame: (s, t, shown) => shown, extras: () => [], talk: () => false, drop: () => {}, close: () => { testCloses++; } };
  const r = await rig({ docs: [live], drafts: [draft], dmTest: (id) => (id === draft.id ? testRt : null) });
  await r.frames(10);
  assert.equal(r.dmCloses.n, 0);
  r.host.standDown();
  assert.equal(r.dmCloses.n, 1);
  assert.equal(testCloses, 1);
});

test('as a Test\'s hold begins, the live runtime\'s open dialogue or trade is closed, once', async () => {
  const live = mixedPoi('poi-bbbbbbbbbbb2', 513);
  let held = false;
  const r = await rig({ docs: [live], dmTest: () => null, dmHeld: () => held });
  await r.frames(10);
  assert.equal(r.dmCloses.n, 0);
  held = true;
  await r.frames(5);
  assert.equal(r.dmCloses.n, 1, 'closed when the hold begins');
  held = false; await r.frames(3); held = true; await r.frames(3);
  assert.equal(r.dmCloses.n, 2, 'and again at the next test');
});

test('the live runtime settles what gone runs owe on every frame, but not while a Test holds it', async () => {
  const live = mixedPoi('poi-bbbbbbbbbbb3', 514);
  let held = false;
  const r = await rig({ docs: [live], dmTest: () => null, dmHeld: () => held });
  await r.frames(10);
  assert.ok(r.dmTicks.n > 0, 'ticked while no Test holds it');
  held = true;
  const before = r.dmTicks.n;
  await r.frames(5);
  assert.equal(r.dmTicks.n, before, 'no tick under a Test hold');
  held = false;
  await r.frames(3);
  assert.ok(r.dmTicks.n > before, 'ticked again after the Test');
});
