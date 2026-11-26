import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparableRevs, compareRevisions, defaultPair } from '../src/poi/poiRevCompare.js';
import { diffText } from '../src/poi/poiText.js';
import { poiV2Example } from './poiV2Examples.mjs';

function history() {
  const r1 = poiV2Example();
  const r2 = structuredClone(r1);
  r2.name = 'Bridge Market East';
  r2.parts.push({ key: 'well', name: 'Well', arch3d: 2, t: [5, 0, 5], r: [0, 0, 0, 1], s: [1, 1, 1], collide: 'mesh', shadow: true });
  const r3 = structuredClone(r2);
  r3.trades = r3.trades.filter((x) => x.key !== 'nyra');
  r3.npcs[2] = { ...r3.npcs[2] };
  delete r3.npcs[2].trade;
  return { id: r1.id, liveRev: 2, revs: [
    { rev: 1, kind: 'doc', state: 'approved', author: 'a', at: 1, doc: r1 },
    { rev: 2, kind: 'doc', state: 'approved', author: 'a', at: 2, doc: r2 },
    { rev: 3, kind: 'rollback', state: 'approved', author: 'b', at: 3, base: 1, doc: null },
    { rev: 4, kind: 'doc', state: 'draft', author: 'a', at: 4, doc: r3 },
    { rev: 5, kind: 'retire', state: 'submitted', author: 'a', at: 5, doc: null },
  ] };
}

test('compare: lists all resolvable revisions and defaults to the newest two', () => {
  const h = history();
  assert.deepEqual(comparableRevs(h).map((x) => x.rev), [1, 2, 3, 4, 5]);
  assert.deepEqual(defaultPair(h), { from: 4, to: 5 });
  assert.equal(defaultPair({ revs: [h.revs[0]] }), null);
  const lost = { revs: [h.revs[0], { rev: 2, kind: 'rollback', state: 'approved', base: 9, doc: null }] };
  assert.deepEqual(comparableRevs(lost).map((x) => x.rev), [1]);
  assert.equal(compareRevisions(lost, 1, 2), null);
});

test('compare: a rollback resolves to the revision it restored, and a retirement resolves to no POI', () => {
  const h = history();
  assert.deepEqual(compareRevisions(h, 1, 3), [], 'revision 3 rolled back to revision 1');
  assert.deepEqual(compareRevisions(h, 2, 3).map(diffText), ['Renamed from "Bridge Market East" to "Bridge Market".', 'Part taken away: Well.']);
  assert.deepEqual(compareRevisions(h, 4, 5).map(diffText), ['Takes it out of the world.']);
  assert.match(diffText(compareRevisions(h, 5, 1)[0]), /^A new POI: 2 parts, 0 lights\.$/);
});

test('compare: describes the changes between two chosen revisions', () => {
  const h = history();
  assert.deepEqual(compareRevisions(h, 1, 2).map(diffText), ['Renamed from "Bridge Market" to "Bridge Market East".', 'Part added: Well.']);
  assert.deepEqual(compareRevisions(h, 2, 4).map(diffText), ['Person Alchemist Nyra changed: trade.', 'Trade taken away: Nyra\'s brew.']);
  assert.deepEqual(compareRevisions(h, 4, 1).map(diffText), ['Renamed from "Bridge Market East" to "Bridge Market".', 'Part taken away: Well.', 'Person Alchemist Nyra changed: trade.', 'Trade added: Nyra\'s brew.']);
  assert.deepEqual(compareRevisions(h, 2, 2), []);
});
