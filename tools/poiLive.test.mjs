// The live view's game half: a draft is laid over the feed, a bad one is ignored, `go` moves the body, clear takes it down.
import assert from 'node:assert/strict';
import { createPoiLive, liveDraftOk } from '../src/scenes/poiLive.js';

const seen = []; const moves = [];
const feed = { setOverlay: (m) => seen.push([...m.keys()]) };
const posted = [];
const live = createPoiLive({ feed, goTo: (p) => moves.push(p), channel: { postMessage: (m) => posted.push(m), onmessage: null, close() {} } });
const doc = { v: 2, place: { px: 500, py: 250, x: 10, z: 20 }, parts: [] };
assert.equal(posted[0].type, 'ready');
live.take({ type: 'draft', id: 'poi-a', rev: 3, doc, auth: 'tok', go: true });
assert.deepEqual(seen.at(-1), ['poi-a']); assert.equal(moves.length, 1); assert.equal(live.auth(), 'tok');
live.take({ type: 'draft', id: 'poi-b', doc: { place: { px: 5000, py: 1, x: 0, z: 0 }, parts: [] } });   // off the map: ignored
assert.deepEqual(seen.at(-1), ['poi-a']);
assert.equal(liveDraftOk({ place: { px: 1, py: 1, x: 0, z: 0 } }), false);   // no parts
live.take({ type: 'go', place: { px: 1, py: 2, x: 3, z: 4 } }); assert.equal(moves.length, 2);
live.take({ type: 'clear', id: 'poi-a' }); assert.deepEqual(seen.at(-1), []);
console.log('poiLive: ok');
