// BUNNYFALL (2026-11-25, caverns): where mine mouths stand in the wilds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MINE_SALT, MINE_CHANCE, mineAt, mineMapId, mineRoomKey, mineIdOf } from '../src/net/mine/mineSites.js';
import { spawnsDungeon, spawnedMapId, WORLD_SALT } from '../src/world/spawnedDungeons.js';
import { CLIMATES } from '../src/formats/mapsTables.js';

test('a mouth never stands on an occupied pixel or a spawned dungeon', () => {
  let sawFree = false;
  for (let px = 0; px < 200; px++) for (let py = 0; py < 200; py++) {
    assert.equal(mineAt({ px, py, climate: CLIMATES.Mountain, occupied: true }), false);
    if (spawnsDungeon(WORLD_SALT, px, py)) assert.equal(mineAt({ px, py, climate: CLIMATES.Mountain, occupied: false }), false);
    else sawFree = true;
  }
  assert.ok(sawFree);
});

test('Mountain share matches its chance over the free pixels', () => {
  let mines = 0, free = 0;
  for (let px = 0; px < 500; px++) for (let py = 0; py < 500; py++) {
    if (!spawnsDungeon(WORLD_SALT, px, py)) free++;
    if (mineAt({ px, py, climate: CLIMATES.Mountain, occupied: false })) mines++;
  }
  const want = MINE_CHANCE[CLIMATES.Mountain] * (free / 250000);
  assert.ok(Math.abs(mines / 250000 - want) < 0.01, `${mines / 250000} vs ${want}`);
  assert.ok(mines > 0);
});

test('Woodlands never holds a mouth', () => {
  for (let px = 0; px < 500; px++) for (let py = 0; py < 500; py++) assert.equal(mineAt({ px, py, climate: CLIMATES.Woodlands, occupied: false }), false);
});

test('ids and room keys', () => {
  assert.equal(MINE_SALT, 7);
  assert.match(mineRoomKey(10, 20), /^dungeon:m[1-9]\d{0,9}$/);
  assert.notEqual(mineRoomKey(10, 20), `dungeon:m${spawnedMapId(WORLD_SALT, 10, 20)}`);
  assert.equal(mineMapId(10, 20), spawnedMapId(MINE_SALT, 10, 20));
  assert.equal(mineIdOf(10, 20), 20010);
});

test('world map reveals distant mine entrances and omits occupied sites', async () => {
  const { createMineMapMarks } = await import('../src/ui/mineMapMark.js');
  const sites = [];
  for (let x = 900; x < 1000; x++) {
    if (mineAt({ px: x, py: 450, climate: CLIMATES.Mountain, occupied: false })) sites.push(x);
  }
  assert.ok(sites.length > 1);
  const locations = new Map([[sites[0] + ',450', {}]]);
  const marks = createMineMapMarks({
    getClimateIndex: (x, y) => y === 450 && x >= 900 ? CLIMATES.Mountain : -1,
  }, locations);
  const before = marks();
  assert.deepEqual(before.map(({ x, y }) => [x, y]), sites.slice(1).map((x) => [x, 450]));
  assert.equal(marks(), before);
  locations.delete(sites[0] + ',450');
  assert.deepEqual(marks().map(({ x }) => x), sites);
});

test('orange mine markers appear only in the near zoom band', async () => {
  const { paintInkOverlay, ZOOM_BANDS } = await import('../src/ui/inkMap.js');
  let dots = 0;
  const ctx = { setTransform() {}, save() {}, restore() {}, beginPath() {}, fill() {}, stroke() {}, arc() { dots++; } };
  const opts = { paperW: 200, paperH: 120, mines: [{ x: 2, y: 2 }] };
  const draw = (scale) => paintInkOverlay(ctx, { ox: 0, oy: 0, scale }, opts);
  const near = ZOOM_BANDS.find(({ name }) => name === 'near').min;
  draw(1);
  draw(near - 0.01);
  assert.equal(dots, 0);
  draw(near);
  assert.equal(dots, 1);
  draw(near - 0.01);
  assert.equal(dots, 1);
});
