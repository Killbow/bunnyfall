import assert from 'node:assert/strict';
import test from 'node:test';
import { validMineIn, validMineOut, mineRoomOf, MINE_WIRE_SALT, MINE_WIRE_WOODS, MINE_WIRE_MAX, MINE_RELAY_MIN } from '../src/net/mine/mineWire.js';
import { MINE_SALT, mineRoomKey, mineIdOf } from '../src/net/mine/mineSites.js';
import { MINE_WOOD_STRENGTH, MINE_PROPS_MAX, createMineState, stepMine } from '../src/net/mine/mineBrain.js';
import { MINE_SECTIONS, MINE_CHAMBERS, MINE_WALLS, mineLayout } from '../src/net/mine/mineLayout.js';
import { MINE_RESET_MAX } from '../src/net/mine/mineVeins.js';
import { RELAY_VERSION, parseClient } from '../src/net/wire.js';

test('the wire pins the laws it does not import', () => {
  assert.equal(MINE_WIRE_SALT, MINE_SALT);
  assert.deepEqual([...MINE_WIRE_WOODS].sort(), Object.keys(MINE_WOOD_STRENGTH).sort());
  assert.ok(MINE_WIRE_MAX.s >= MINE_SECTIONS[1] && MINE_WIRE_MAX.c >= MINE_CHAMBERS[1] && MINE_WIRE_MAX.w >= MINE_WALLS[1]);
  assert.equal(MINE_WIRE_MAX.reset, MINE_RESET_MAX);
  assert.equal(MINE_WIRE_MAX.props, MINE_PROPS_MAX);
  assert.equal(RELAY_VERSION, MINE_RELAY_MIN);
});

test('a mine room reads back its pixel, with or without its size tag; another room reads as none', () => {
  const key = mineRoomKey(616, 398);
  assert.deepEqual(mineRoomOf(key), { px: 616, py: 398, id: mineIdOf(616, 398) });
  assert.deepEqual(mineRoomOf(`${key}.s`), { px: 616, py: 398, id: mineIdOf(616, 398) });
  assert.equal(mineRoomOf(`dungeon:m${(1 << 20) | 398616}`), null);   // a spawned dungeon's (salt 1)
  assert.equal(mineRoomOf('interior:m5.3'), null);
  assert.equal(mineRoomOf('dungeon:m007'), null);
});

test('a client word is projected, and one out of shape is refused', () => {
  assert.deepEqual(validMineIn({ t: 'mn', k: 'hi', r: 3 }), { k: 'hi', r: 3 });
  assert.deepEqual(validMineIn({ t: 'mn', k: 'strike', s: 2, c: 1, extra: 1 }), { k: 'strike', s: 2, c: 1 });
  assert.deepEqual(validMineIn({ t: 'mn', k: 'prop', s: 0, c: 0, w: 4, wood: 'oak' }), { k: 'prop', s: 0, c: 0, w: 4, wood: 'oak' });
  for (const bad of [
    { t: 'mn', k: 'strike', s: 9, c: 0 }, { t: 'mn', k: 'prop', s: 0, c: 0, w: -1, wood: 'oak' }, { t: 'mn', k: 'prop', s: 0, c: 0, w: 1, wood: 'balsa' },
    { t: 'mn', k: 'hi', r: -1 }, { t: 'mn', k: 'dance' }, { t: 'kt', k: 'strike', s: 0, c: 0 }, null,
  ]) assert.equal(validMineIn(bad), null);
  assert.deepEqual(parseClient(JSON.stringify({ t: 'mn', k: 'strike', s: 1, c: 2 }), { hasHello: true }), { t: 'mn', k: 'strike', s: 1, c: 2 });
  assert.ok(parseClient(JSON.stringify({ t: 'mn', k: 'strike', s: 1, c: 99 }), { hasHello: true }).error);
});

test('a relay word carries a real mine state and its events', () => {
  const st = createMineState(mineLayout(398616, 2), 1_800_000_000);
  assert.ok(validMineOut({ t: 'mn', k: 'st', st }));
  const r = stepMine(st, { op: 'prop', s: 0, c: 0, w: 0, wood: 'teak', by: 'a' }, 1_800_000_001);
  assert.ok(validMineOut({ t: 'mn', k: 'st', st: r.state, ev: r.events }));
  assert.ok(validMineOut({ t: 'mn', k: 'no', e: 'taken' }));
  assert.equal(validMineOut({ t: 'mn', k: 'st', st: { ...st, stab: [] } }), null);
  assert.equal(validMineOut({ t: 'mn', k: 'st', st: { ...st, props: [{ s: 0, c: 0, w: 0, wood: 'balsa' }] } }), null);
});
