import assert from 'node:assert/strict';
import test from 'node:test';
import { mineLocation, isMine, mineBlocks, mineHit, MINE_BLOCK, MINE_BLOCK_INDEX, MINE_LAMP_M } from '../src/world/mine/mineLocation.js';
import { mineLayout } from '../src/net/mine/mineLayout.js';
import { mineColliderTris } from '../src/world/mine/mineModel.js';
import { mineAt, mineIdOf, mineRoomKey } from '../src/net/mine/mineSites.js';
import { CLIMATES } from '../src/formats/mapsTables.js';

/** The first Mountain pixel holding a mouth, and the first not holding one. */
function pixels() {
  let yes = null, no = null;
  for (let py = 100; py < 400 && !(yes && no); py++) for (let px = 100; px < 400 && !(yes && no); px++) {
    const at = mineAt({ px, py, climate: CLIMATES.Mountain, occupied: false });
    if (at && !yes) yes = { px, py };
    if (!at && !no) no = { px, py };
  }
  return { yes, no };
}

test('a mine location is a mine, keyed to its own room', () => {
  const loc = mineLocation({ px: 120, py: 140, reset: 2 });
  assert.equal(isMine(loc), true);
  assert.equal(loc.mine.key, mineRoomKey(120, 140));
  assert.equal(loc.mine.id, mineIdOf(120, 140));
  assert.equal(isMine({ ...loc, mine: null }), false);
});

test('its one block holds a start marker a step inside the mouth', () => {
  const loc = mineLocation({ px: 120, py: 140, reset: 2 });
  const blocks = mineBlocks(null, loc.mine);
  assert.equal(blocks.getBlockIndex(MINE_BLOCK), MINE_BLOCK_INDEX);
  const objs = blocks.getBlock(MINE_BLOCK_INDEX).rdbBlock.objectRootList[0].rdbObjects;
  const markers = objs.filter((o) => o.type === 0x03 && o.resources.flatResource.textureArchive === 199);
  assert.equal(markers.length, 1);
  const L = mineLayout(loc.mine.id, 2);
  const chambers = L.sections.reduce((n, s) => n + s.chambers.length, 0);
  const lights = objs.filter((o) => o.type === 0x02).map((o) => o.resources.lightResource.radius * 3 / 40);
  assert.equal(lights.length, chambers + 1);
  assert.ok(Math.abs(lights[0] - 5) < 0.05);
  assert.ok(lights.slice(1).every((range) => range === 3 && range < MINE_LAMP_M));
  const d = Math.hypot(markers[0].xPos / 40 - L.mouth.at[0], markers[0].zPos / 40 - L.mouth.at[2]);
  assert.ok(d > 1 && d < 3, `marker ${d.toFixed(2)} m from the mouth`);
  // the feet stand on the tunnel's floor under the marker, the roof well over it - never on the roof (the dungeon stands
  // a body's feet at its marker, onto the first floor below)
  const at = [markers[0].xPos / 40, -markers[0].yPos / 40, markers[0].zPos / 40];
  const tris = mineColliderTris(L);
  const ys = [];
  for (let i = 0; i < tris.length; i += 9) {
    const [ax, az, bx, bz, cx, cz] = [tris[i], tris[i + 2], tris[i + 3], tris[i + 5], tris[i + 6], tris[i + 8]];
    const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(den) < 1e-9) continue;
    const l1 = ((bz - cz) * (at[0] - cx) + (cx - bx) * (at[2] - cz)) / den, l2 = ((cz - az) * (at[0] - cx) + (ax - cx) * (at[2] - cz)) / den, l3 = 1 - l1 - l2;
    if (l1 >= 0 && l2 >= 0 && l3 >= 0) ys.push(l1 * tris[i + 1] + l2 * tris[i + 4] + l3 * tris[i + 7]);
  }
  const floor = Math.max(...ys.filter((y) => y <= at[1])), roof = Math.min(...ys.filter((y) => y > at[1]));
  assert.ok(at[1] - floor > 0 && at[1] - floor < 0.6, `the marker ${(at[1] - floor).toFixed(2)} m over the floor`);
  assert.ok(roof - floor > 2, `the roof ${(roof - floor).toFixed(2)} m over the floor`);
  assert.equal(blocks.getBlock(5), null);
});

test('the door in answers only where a mouth stands', () => {
  const { yes, no } = pixels();
  const site = { climate: { worldClimate: CLIMATES.Mountain, climateType: 2 }, regionIndex: 16, regionName: 'Wrothgarian Mountains' };
  assert.ok(yes && no);
  const hit = mineHit({ ...yes, reset: 0, site }, null);
  assert.ok(hit && isMine(hit.dfLocation));
  assert.equal(hit.group, mineRoomKey(yes.px, yes.py));
  assert.equal(mineHit({ ...no, reset: 0, site }, null), null);
});
