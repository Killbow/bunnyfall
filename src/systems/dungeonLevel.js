// @ts-check
// ENCOUNTER-LEVEL: the level a dungeon is built at. The party's level (mentorMode.js effectiveLevel) placed on this
// dungeon's tier (lootRarity.js DUNGEON_RARITY_TIER: a cemetery 3 .. a dragon's den 18), fixed for the session
// (encounterLevel.js dungeonSessionLevel: a join, a leave or a level-up after the first build changes nothing), and a
// Super dungeon's floor on top (sdDungeon.js superFoeLevel). One answer for the build, the rest spawns and the elites.
import { effectiveLevel } from './mentorMode.js';
import { placeLevel, dungeonSessionLevel, adoptSessionLevel } from './encounterLevel.js';
import { dungeonRarityTier } from './loot/lootRarity.js';
import { superFoeLevel } from '../world/superDungeon/sdDungeon.js';

const sessionKey = (/** @type {any} */ dfLocation) => dfLocation?.dungeon?.recordElement?.header?.locationId ?? dfLocation?.name ?? 'dungeon';

/** @param {any} dfLocation @param {any} entity @param {boolean} superTier */
export function dungeonBuildLevel(dfLocation, entity, superTier) {
  const key = sessionKey(dfLocation);
  const fresh = placeLevel(effectiveLevel(entity), dungeonRarityTier(dfLocation?.mapTableData?.dungeonType));
  const level = dungeonSessionLevel(key, fresh);
  return superTier ? superFoeLevel(level) : level;
}

/** A joiner takes the host's session level for this dungeon (the host's full frame says it). @param {any} dfLocation @param {number} level */
export const adoptDungeonSessionLevel = (dfLocation, level) => adoptSessionLevel(sessionKey(dfLocation), level);
