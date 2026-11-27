import { srand, randomRangeInclusive } from '../formats/dfRandom.js';
import { getInt } from '../platform/settings.js';

export const TABLE_LENGTH = 6;

export const DEFAULT_TEXTURE_TABLE = [119, 120, 122, 123, 124, 168];

const CLIMATE_INDICES = [0, 0, 0, 1, 2, 3, 4, 5, 5, 5];

const CLIMATE_OCEAN = 223;
const CLIMATE_DESERT = 224;
const CLIMATE_SWAMP = 228;
const INTERIOR_SEWER = 68;

/**
 * @param {number} seed
 * @param {number} worldClimate
 * @param {number} randomDungeonTextures
 * @returns {number[]}
 */
export function randomTextureTableClassic(seed, worldClimate, randomDungeonTextures = 0) {
  const climateTextureArchiveIndices = [0, 0, 1, 4, 4, 0, 3, 3, 3, 0];
  const climateTextureArchives = randomDungeonTextures === 0
    ? [19, 119, 319, 419, 119]
    : [19, 119, 119, 319, 419];

  let climate = worldClimate;
  if (climate === CLIMATE_OCEAN) climate = CLIMATE_SWAMP;

  const classicIndexValue = CLIMATE_INDICES[climate - CLIMATE_OCEAN];
  const climateBasedIndexValue = climate - CLIMATE_DESERT;

  const climateTextureArchiveIndex = randomDungeonTextures === 0
    ? climateTextureArchiveIndices[classicIndexValue]
    : climateTextureArchiveIndices[climateBasedIndexValue];

  srand(seed);
  const textureTable = new Array(TABLE_LENGTH);
  for (let i = 0; i < 5; i++) {
    let textureArchiveOffset = randomRangeInclusive(0, 4);
    // Classic treats offset 2 as invalid and uses 4 instead.
    if (textureArchiveOffset === 2) textureArchiveOffset = 4;
    textureTable[i] = climateTextureArchives[climateTextureArchiveIndex] + textureArchiveOffset;
  }
  textureTable[5] = INTERIOR_SEWER + 100 * climateTextureArchiveIndices[climateBasedIndexValue];
  return textureTable;
}

/**
 * @param {number} archive
 * @param {number[]} textureTable
 * @param {number} climateBaseType
 * @returns {number}
 */
export function applyTextureTable(archive, textureTable, climateBaseType) {
  switch (archive) {
    case 74: return archive + climateBaseType;
    case 119: return textureTable[0];
    case 120: return textureTable[1];
    case 122: return textureTable[2];
    case 123: return textureTable[3];
    case 124: return textureTable[4];
    case 168: return textureTable[5];
    default: return archive;
  }
}

export const PRIVATEERS_HOLD_MAP_ID = 187853213;
export const MAIN_STORY_DUNGEON_IDS = Object.freeze(new Set([
  PRIVATEERS_HOLD_MAP_ID,
  630439035,
  1291010263,
  6634853,
  19021260,
  728811286,
  701948302,
  83032363,
  1001,
  207828842,
  9570447,
  2352284,
  336619236,
  43196334,
]));
export const isMainStoryDungeon = (mapId) => MAIN_STORY_DUNGEON_IDS.has(mapId);

export const ALTERNATE_VALID_ARCHIVES = Object.freeze([
  19, 20, 22, 23, 24, 68,
  119, 120, 122, 123, 124, 168,
  319, 320, 322, 323, 324, 368,
  419, 420, 422, 423, 424, 468,
]);
const VALID_SEWER_ARCHIVES = Object.freeze([68, 168, 368, 468]);

// Deterministic per dungeon, but the sequence differs from the seeded Unity stream DFU uses, so alternate tables do
// not match DFU.
function makeSeededRng(seed) {
  let s = (seed >>> 0) || 1;
  return (min, maxExclusive) => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return min + (s % (maxExclusive - min));
  };
}

/** @param {number} seed */
export function randomTextureTableAlternate(seed, rng = makeSeededRng(seed)) {
  const textureTable = new Array(TABLE_LENGTH);
  for (let i = 0; i < TABLE_LENGTH; i++) {
    textureTable[i] = ALTERNATE_VALID_ARCHIVES[rng(0, ALTERNATE_VALID_ARCHIVES.length)];
  }
  if ((textureTable[5] % 100) !== 68) {
    textureTable[5] = VALID_SEWER_ARCHIVES[rng(0, VALID_SEWER_ARCHIVES.length)];
  }
  return textureTable;
}

export function dungeonTextureTable({ locationId, mapId, worldClimate,
  mode = getInt('Video', 'RandomDungeonTextures', 0, 4) } = {}) {
  if (isMainStoryDungeon(mapId) && mode !== 2 && mode !== 4) {
    return randomTextureTableClassic(locationId, worldClimate);
  }
  if (mode < 3) return randomTextureTableClassic(locationId, worldClimate, mode);
  return randomTextureTableAlternate(mapId);
}
