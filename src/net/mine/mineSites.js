// @ts-check
// BUNNYFALL (2026-11-25, caverns): where mine mouths stand in the wilds.
// The one client-only law in src/net/mine that may import the spawned-dungeon laws (ruling R2): the relay reads a mine
// room's pixel back with arithmetic in mineWire.js instead.
import { hash32, spawnedMapId, spawnsDungeon, WORLD_SALT } from '../../world/spawnedDungeons.js';
import { CLIMATES } from '../../formats/mapsTables.js';

/** The mine's map-id salt (high 12 bits of its MapId), not used by any other spawned dungeon. */
export const MINE_SALT = 7;

/** Chance a free pixel holds a mine mouth, by climate. A climate not listed holds none. */
export const MINE_CHANCE = Object.freeze(/** @type {Record<number, number>} */ ({
  [CLIMATES.Mountain]: 0.04,
  [CLIMATES.MountainWoods]: 0.03,
  [CLIMATES.Desert]: 0.03,
  [CLIMATES.Desert2]: 0.03,
  [CLIMATES.HauntedWoodlands]: 0.02,
}));

/**
 * Does this map pixel hold a mine mouth? Never on an occupied pixel (a town, a dungeon of the map) nor where a
 * spawned dungeon stands.
 * @param {{ px: number, py: number, climate: number, occupied: boolean }} p
 * @returns {boolean}
 */
export function mineAt({ px, py, climate, occupied }) {
  if (occupied) return false;
  const chance = MINE_CHANCE[climate] ?? 0;
  if (!(chance > 0)) return false;
  if (spawnsDungeon(WORLD_SALT, px, py)) return false;
  return hash32(MINE_SALT, px, py, 1) / 4294967296 < chance;
}

/** The mine's MapId at a pixel. */
export const mineMapId = (/** @type {number} */ px, /** @type {number} */ py) => spawnedMapId(MINE_SALT, px, py);

/** The relay room key of the mine at a pixel. */
export const mineRoomKey = (/** @type {number} */ px, /** @type {number} */ py) => `dungeon:m${mineMapId(px, py)}`;

/** The pixel id (MapsFile.getMapPixelID) the mine's MapId carries in its low 20 bits. */
export const mineIdOf = (/** @type {number} */ px, /** @type {number} */ py) => py * 1000 + px;
