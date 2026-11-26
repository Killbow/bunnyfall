// @ts-check
// BUNNYFALL (2026-11-25, caverns): A MINE AS THE DUNGEON HOST READS ONE - a made location (the Sky-Ketch's shape,
// world/ketch/ketchShip.js) with one empty block holding its start marker at the mouth. Its map id is the mine's own
// (net/mine/mineSites.js mineMapId), so its room is an ordinary dungeon room, `dungeon:m<mapId>`, and every player in a mine
// shares it (its foes, its poses, its `mn` frames).
import { mineLayout } from '../../net/mine/mineLayout.js';
import { mineMapId, mineRoomKey, mineIdOf, mineAt } from '../../net/mine/mineSites.js';

/** The made location's id and its one block's name and index - none another made level holds (the Hour 0x7ffff200, the
 *  court 0x7ffff000, the Spire 0x7ffff300 and 900300, the Ketch 0x7ffff400 and 900400). */
export const MINE_LOCATION_ID = 0x7ffff500;
export const MINE_BLOCK = 'MINE.RDB';
export const MINE_BLOCK_INDEX = 900500;
/** Daggerfall's natural cave dungeon type. */
export const MINE_DUNGEON_TYPE = 6;
/** A chamber's lamp: Daggerfall's standing torch (TEXTURE.210 record 6), and how far its light reaches (m). */
export const MINE_TORCH = Object.freeze({ archive: 210, record: 6 });
export const MINE_LAMP_M = 14;
/** How high over the mouth's floor the start marker stands (m): RDB y is flipped, and the dungeon stands a body's middle
 *  0.72 m under its marker - at 1.75 m the body stands on the floor. */
export const MINE_START_UP_M = 1.75;
/** Classic units a metre. */
const UNITS_PER_M = 40;

/**
 * THE MADE LOCATION.
 * @param {{ px: number, py: number, reset?: number, regionIndex?: number, regionName?: string, climate?: { worldClimate: number, climateType: number } }} o
 */
export function mineLocation({ px, py, reset = 0, regionIndex = -1, regionName = '', climate = { worldClimate: 226, climateType: 2 } }) {
  const id = mineIdOf(px, py), mapId = mineMapId(px, py);
  return {
    name: 'Mine', regionIndex, regionName, locationIndex: -1, hasDungeon: true,
    climate: { worldClimate: climate.worldClimate, climateType: climate.climateType },
    mapTableData: { mapId, locationType: -1, dungeonType: MINE_DUNGEON_TYPE, longitude: 0, latitude: 0 },
    exterior: { exteriorData: { locationId: MINE_LOCATION_ID } },
    dungeon: {
      recordElement: { header: { locationId: MINE_LOCATION_ID, unknown: 0 } },
      blocks: [{ x: 0, z: 0, blockName: MINE_BLOCK, isStartingBlock: true, blockIndex: 0, blockNumber: 0, blockNumberStartIndexBitfield: 0 }],
    },
    mine: { px, py, id, reset, key: mineRoomKey(px, py) },
  };
}

/** Is this location a mine? */
export const isMine = (/** @type {any} */ loc) => typeof loc?.mine?.key === 'string' && loc?.dungeon?.recordElement?.header?.locationId === MINE_LOCATION_ID;

/** THE EMPTY BLOCK: its start marker at the mouth, a step into the cave. */
export function mineBlock(/** @type {{ id: number, reset: number }} */ { id, reset }) {
  const L = mineLayout(id, reset), [x, , z] = L.mouth.at;
  const step = 1.5, fx = Math.cos(L.mouth.facing), fz = Math.sin(L.mouth.facing);
  const marker = {
    type: 0x03, position: 1, index: 0,
    xPos: Math.round((x + fx * step) * UNITS_PER_M), yPos: -Math.round(MINE_START_UP_M * UNITS_PER_M), zPos: Math.round((z + fz * step) * UNITS_PER_M),   // over the floor: the body stands 0.72 m under its marker
    resources: { flatResource: { textureArchive: 199, textureRecord: 10, flags: 0, magnitude: 0, soundIndex: 0, factionOrMobileId: 0, nextObjectOffset: -1, action: 0, position: 0 } },
  };
  // the lamps: a light over each chamber's floor (and one inside the mouth), its standing torch on the nearest wall slot -
  // RDB light and flat objects as the dungeon builder reads them (world/dungeonLights.js: y is flipped, range = radius x 3)
  const objs = [marker];
  const flat = (/** @type {number[]} */ p) => ({
    type: 0x03, position: 0, index: 0, xPos: Math.round(p[0] * UNITS_PER_M), yPos: Math.round(-p[1] * UNITS_PER_M), zPos: Math.round(p[2] * UNITS_PER_M),
    resources: { flatResource: { textureArchive: MINE_TORCH.archive, textureRecord: MINE_TORCH.record, flags: 0, magnitude: 0, soundIndex: 0, factionOrMobileId: 0, nextObjectOffset: -1, action: 0, position: 0 } },
  });
  const light = (/** @type {number[]} */ p, /** @type {number} */ up) => ({
    type: 0x02, position: 0, index: 0, xPos: Math.round(p[0] * UNITS_PER_M), yPos: Math.round(-(p[1] + up) * UNITS_PER_M), zPos: Math.round(p[2] * UNITS_PER_M),
    resources: { lightResource: { unknown1: 0, unknown2: 0, radius: Math.round(MINE_LAMP_M / (3 / UNITS_PER_M)) } },
  });
  objs.push(light([x + fx * 3, L.mouth.at[1], z + fz * 3], 2.5));
  for (const s of L.sections) for (const ch of s.chambers) {
    const w = ch.walls.find((q) => !q.weak) ?? ch.walls[0];
    const foot = w ? [w.at[0] + w.n[0] * 0.6, ch.c[1], w.at[2] + w.n[2] * 0.6] : [ch.c[0], ch.c[1], ch.c[2]];
    objs.push(flat(foot), light([foot[0], ch.c[1], foot[2]], 2.2));
  }
  return { name: MINE_BLOCK, position: 0, rdbBlock: { modelReferenceList: [], objectRootList: [{ rdbObjects: objs }] } };
}

/** THE BLOCKS FILE THE MINE IS LAID FROM: the real one, answering one name more. */
export function mineBlocks(/** @type {any} */ real, /** @type {{ id: number, reset: number }} */ mine) {
  const block = mineBlock(mine);
  return {
    getBlockIndex: (/** @type {string} */ name) => (name === MINE_BLOCK ? MINE_BLOCK_INDEX : real ? real.getBlockIndex(name) : -1),
    getBlock: (/** @type {number} */ i) => (i === MINE_BLOCK_INDEX ? block : real ? real.getBlock(i) : null),
  };
}

/**
 * THE DOOR IN: the dungeon host's transition record for a mine, or null where no mine stands.
 * `r` is { px, py, reset, site: { climateBase, season, climate, regionIndex, regionName } }.
 */
export function mineHit(/** @type {any} */ r, /** @type {any} */ blocks) {
  if (!r || !Number.isSafeInteger(r.px) || !Number.isSafeInteger(r.py)) return null;
  const site = r.site ?? null;
  if (!mineAt({ px: r.px, py: r.py, climate: site?.climate?.worldClimate ?? -1, occupied: false })) return null;
  const dfLocation = mineLocation({ px: r.px, py: r.py, reset: r.reset ?? 0, regionIndex: site?.regionIndex ?? -1, regionName: site?.regionName ?? '', climate: site?.climate ?? undefined });
  return { dfLocation, blocksFile: mineBlocks(blocks, dfLocation.mine), mine: dfLocation.mine, climateBase: site?.climateBase ?? 2, season: site?.season ?? 0, group: dfLocation.mine.key, door: null, dfBlock: null, recordIndex: -1 };
}
