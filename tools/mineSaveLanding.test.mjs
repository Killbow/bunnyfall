import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MINE_LOCATION_KEY, CORNER_PIXEL, mineSiteOfMapId, dungeonHomeOf, savedLanding } from '../src/saves/mineSaveLanding.js';
import { mineLocation, MINE_LOCATION_ID } from '../src/world/mine/mineLocation.js';
import { mineMapId } from '../src/net/mine/mineSites.js';
import { longitudeLatitudeToMapPixel } from '../src/formats/mapsFile.js';

const start = { x: 300, y: 200 };
const mineEnvelope = (px, py, over = {}) => {
  const loc = mineLocation({ px, py, reset: 2 });
  return { locationKey: `dungeon:${MINE_LOCATION_ID}`, position: [41.5, -3, 880.25], dungeon: dungeonHomeOf(loc, longitudeLatitudeToMapPixel), ...over };
};

test('the shared key is the made location id', () => { assert.equal(MINE_LOCATION_KEY, `dungeon:${MINE_LOCATION_ID}`); });

test('a mine map id gives its pixel back, and a stranger gives none', () => {
  assert.deepEqual(mineSiteOfMapId(mineMapId(412, 233)), { x: 412, y: 233 });
  assert.deepEqual(mineSiteOfMapId(mineMapId(0, 0)), { x: 0, y: 0 });
  assert.equal(mineSiteOfMapId(12345), null);
  assert.equal(mineSiteOfMapId(NaN), null);
  assert.equal(mineSiteOfMapId(null), null);
});

test('BUG: the old envelope of a mine named the corner of the world (longitude and latitude 0)', () => {
  const loc = mineLocation({ px: 412, py: 233 });
  const old = longitudeLatitudeToMapPixel(loc.mapTableData.longitude, loc.mapTableData.latitude);
  assert.deepEqual(old, CORNER_PIXEL);
});

test('a save taken inside a mine lands at the mouth pixel of that mine, never the corner', () => {
  const e = mineEnvelope(412, 233);
  assert.deepEqual(e.dungeon.pixel, { x: 412, y: 233 });
  assert.deepEqual(savedLanding(e, { startCell: start }), { pixel: { x: 412, y: 233 }, why: 'mine' });
});

test('the update-client case: a save from an older client (corner pixel, same map id) still lands at the mine', () => {
  const e = mineEnvelope(412, 233, { dungeon: { pixel: { ...CORNER_PIXEL }, mapId: mineMapId(412, 233) } });
  assert.deepEqual(savedLanding(e, { startCell: start }), { pixel: { x: 412, y: 233 }, why: 'mine' });
  const bare = mineEnvelope(412, 233, { dungeon: null });
  assert.deepEqual(savedLanding(bare, { startCell: start }), { pixel: start, why: 'lost-mine' });
});

test('a mine that cannot be read lands at the start cell', () => {
  const e = mineEnvelope(1, 1, { dungeon: { pixel: { ...CORNER_PIXEL }, mapId: 77 } });
  assert.deepEqual(savedLanding(e, { startCell: start }), { pixel: start, why: 'lost-mine' });
});

test('a character already stranded in the far corner is moved to the start cell', () => {
  const stranded = { locationKey: 'world', world: { pixel: { x: 0, y: 499 }, nativeX: 12, nativeZ: 9, y: 2 } };
  assert.deepEqual(savedLanding(stranded, { startCell: start }), { pixel: start, why: 'stranded' });
  const nan = { locationKey: 'world', world: { pixel: { x: 40, y: 40 }, nativeX: NaN, nativeZ: 9 } };
  assert.equal(savedLanding(nan, { startCell: start })?.why, 'stranded');
  const offMap = { locationKey: 'world', world: { pixel: { x: 4000, y: -7 }, nativeX: 1, nativeZ: 1 } };
  assert.equal(savedLanding(offMap, { startCell: start })?.why, 'stranded');
});

test('an ordinary world save, and an ordinary dungeon save, land where they stood', () => {
  assert.equal(savedLanding({ locationKey: 'world', world: { pixel: { x: 300, y: 200 }, nativeX: 5, nativeZ: 6 } }, { startCell: start }), null);
  assert.equal(savedLanding({ locationKey: 'dungeon:1234', dungeon: { pixel: { x: 300, y: 200 }, mapId: 4242 } }, { startCell: start }), null);
  assert.equal(savedLanding({ locationKey: 'world' }, { startCell: start }), null);
});
