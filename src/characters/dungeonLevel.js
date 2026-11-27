// @ts-check
// The level a dungeon is built at: the party's effective level on the dungeon tier, fixed for the session,
// plus a Super dungeon floor.
import { effectiveLevel } from './mentorMode.js';
import { placeLevel, dungeonSessionLevel, adoptSessionLevel, endDungeonSession } from './encounterLevel.js';
import { dungeonRarityTier } from '../items/lootRarity.js';
import { superFoeLevel } from '../world/sdDungeon.js';

const sessionKey = (/** @type {any} */ dfLocation) => dfLocation?.dungeon?.recordElement?.header?.locationId ?? dfLocation?.name ?? 'dungeon';

/** @param {any} dfLocation @param {any} entity @param {boolean} superTier */
export function dungeonBuildLevel(dfLocation, entity, superTier) {
  const key = sessionKey(dfLocation);
  const fresh = placeLevel(effectiveLevel(entity), dungeonRarityTier(dfLocation?.mapTableData?.dungeonType));
  const level = dungeonSessionLevel(key, fresh);
  return superTier ? superFoeLevel(level) : level;
}

/** @param {any} dfLocation @param {number} level */
export const adoptDungeonSessionLevel = (dfLocation, level) => adoptSessionLevel(sessionKey(dfLocation), level);

/** @param {any} dfLocation */
export const endDungeonSessionFor = (dfLocation) => endDungeonSession(sessionKey(dfLocation));
