import test from 'node:test';
import assert from 'node:assert/strict';
import { createWayOut, walkedStep, trailCells } from '../src/player/wayOut.js';

// WAY BACK (cave tiles): a step the player walked is never asked of the wall rays.

const cave = () => {
  // a crooked cave passage walked cell by cell, every diagonal corner a waist ray would call a wall
  const trail = new Set();
  const pts = [];
  for (let i = 0; i < 40; i++) { pts.push([i, 0, i % 2 === 0 ? 0 : 1]); trail.add(`${i},0,${pts.at(-1)[2]}`); }
  return { trail, pts };
};

test('walkedStep: consecutive cells a step apart are walked, others are not', () => {
  const cells = trailCells(new Set(['0,0,0', '1,0,1', '5,0,5', '6,3,5']));
  assert.equal(walkedStep(cells, 0, 1), true);
  assert.equal(walkedStep(cells, 1, 2), false);   // a gap: carried, not walked
  assert.equal(walkedStep(cells, 2, 3), false);   // a climb past a step
  assert.equal(walkedStep(cells, 0, 2), false);   // not one after the other
});

test('a way home through a crooked cave stands though every ray says wall', () => {
  const { trail } = cave();
  const way = createWayOut({ clock: () => 0 });
  const walls = () => false;   // the rays cut every step the trail's own order does not vouch for
  const feet = [39.5, 0, 1.5];
  const sees = () => true;
  const aim = way.aim(trail, [], [0.5, 0, 0.5], feet, sees, 1, walls);
  assert.ok(aim, 'the compass has a way');
  assert.notDeepEqual(aim, [0.5, 0.5], 'not the crow line');
  const line = way.line(feet);
  assert.ok(line.length >= 12, `the ribbon runs ${line.length} cells`);
});

// The real dungeons (needs the game's files: ARENA2_PATH). A cave-style layout and a long classic one, each run by a real
// motor out to a far cell and walked home through the way out's own code.
const arena2 = process.env.ARENA2_PATH;
const real = arena2 ? test : test.skip;
real('real dungeons: every far-in walk finds its way back', async () => {
  const { loadData } = await import('./climbDungeonProbe.mjs');
  const { openCollider, runOne } = await import('./wayBackProbe.mjs');
  const data = loadData(arena2);
  const sites = [['Dragontail Mountains', 'The Demorgona Cavern'], ["Alik'r Desert", "Ruins of Old Rhoghti's Farm"], ["Alik'r Desert", 'Sekbith']];
  for (const [region, name] of sites) {
    const loc = data.maps.getLocationByName(region, name);
    const { col, d } = openCollider(data, loc);
    const r = runOne(data, { col, d }, { far: 2, walk: true, motor: true });
    assert.deepEqual(r.fails, [], `${name}: no route`);
    assert.equal(r.walk.bad, 0, `${name}: the ribbon broke ${r.walk.bad} times`);
    assert.equal(r.walk.crow, 0, `${name}: the compass fell back to the crow line`);
  }
});
