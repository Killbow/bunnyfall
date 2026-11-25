import assert from 'node:assert/strict';
import test from 'node:test';
import { mineLocation, isMine, mineBlocks, mineHit, MINE_BLOCK, MINE_BLOCK_INDEX } from '../src/world/mine/mineLocation.js';
import { mineLayout } from '../src/net/mine/mineLayout.js';
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
  assert.equal(objs.filter((o) => o.type === 0x02).length, chambers + 1);   // a lamp a chamber, and the mouth's
  const d = Math.hypot(markers[0].xPos / 40 - L.mouth.at[0], markers[0].zPos / 40 - L.mouth.at[2]);
  assert.ok(d > 1 && d < 2, `marker ${d.toFixed(2)} m from the mouth`);
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
