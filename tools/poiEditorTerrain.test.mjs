import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createTerrain, pixelSpot, groundInFrame, surfaceGrid, dropOnGround, originHeight } from './poi-editor/src/terrain.js';
import { quatAngleAxis } from '../src/world/quat.js';

const DIR = process.env.ARENA2_PATH || '/home/claude/gamefiles/arena2';
const wld = path.join(DIR, 'WOODS.WLD');
const have = fs.existsSync(wld);
const place = (o = {}) => ({ px: 500, py: 250, x: 400, z: 400, y: 0, ground: 'snap', r: [0, 0, 0, 1], s: 1, ...o });

test('a turn about up carries a POI point to the pixel frame', () => {
  const p = place({ r: quatAngleAxis(90, [0, 1, 0]) });
  const [x, z] = pixelSpot(p, 0, 1);
  assert.ok(Math.abs(x - 401) < 1e-9 && Math.abs(z - 400) < 1e-9, `${x},${z}`);
  assert.deepEqual(pixelSpot(place({ s: 2 }), 3, 4).map((v) => Math.round(v)), [406, 408]);
});

test('without WOODS.WLD there is no ground, and nothing is invented', async () => {
  const t = createTerrain(async () => { throw new Error('404'); });
  assert.equal(await t.open(), false);
  assert.equal(t.state(), 'missing');
  assert.equal(t.groundAt(500, 250, 10, 10), null);
  assert.equal(groundInFrame(t, place(), 0, 0), null);
  assert.equal(surfaceGrid(t, place()), null);
  const rows = [{ t: [1, 5, 2] }];
  assert.equal(dropOnGround(t, place(), rows), 0);
  assert.deepEqual(rows[0].t, [1, 5, 2]);
  assert.equal(originHeight(t, place({ ground: 'absolute', y: 7 })), 7);
});

test('with WOODS.WLD the ground is the game\'s base terrain', { skip: !have }, async () => {
  const t = createTerrain(async (n) => new Uint8Array(fs.readFileSync(path.join(DIR, n))));
  assert.equal(await t.open(), true);
  const g = t.groundAt(500, 250, 400, 400);
  assert.ok(Number.isFinite(g) && g >= 0 && g < 1539 * 1.25);
  // continuity over a pixel edge: x = 819.2 of one pixel is x = 0 of the next
  const east = t.groundAt(500, 250, 819.2 - 1e-6, 300), next = t.groundAt(501, 250, 0, 300);
  assert.ok(Math.abs(east - next) < 0.05, `${east} vs ${next}`);
  // north is py - 1
  const north = t.groundAt(500, 250, 300, 819.2 - 1e-6), up = t.groundAt(500, 249, 300, 0);
  assert.ok(Math.abs(north - up) < 0.05, `${north} vs ${up}`);
  // off the map
  assert.equal(t.groundAt(0, 250, -5, 10), null);
  // snap stands y above the ground: the POI origin's own ground in its frame is 0 - y
  const p = place({ y: 2 });
  assert.ok(Math.abs(groundInFrame(t, p, 0, 0) - -2) < 1e-6);
  const grid = surfaceGrid(t, p, 12, 6);
  assert.equal(grid.n, 5);
  const rows = [{ t: [6, 50, 6] }];
  assert.equal(dropOnGround(t, p, rows, 0.5), 1);
  assert.ok(Math.abs(rows[0].t[1] - (groundInFrame(t, p, 6, 6) + 0.5)) < 0.002);
});
