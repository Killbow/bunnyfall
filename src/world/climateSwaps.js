import { SEASONS, seasonValue, dateFromClassicMinutes } from './gameDate.js';

export const SEASON = { Summer: 0, Winter: 1, Rain: 2 };

// The calendar selects only Summer or Winter, as in DFU; `SEASON.Rain` is reachable only by hand.
export function climateSeasonFromDate(date) {
  return seasonValue(date) === SEASONS.Winter ? SEASON.Winter : SEASON.Summer;
}

export function climateSeasonFromMinutes(classicMinutes) {
  return climateSeasonFromDate(dateFromClassicMinutes(classicMinutes));
}

// DFU's `DaggerfallInterior` never assigns its season field, so interiors always use summer textures whatever the
// outside season.
export const INTERIOR_SEASON = SEASON.Summer;
const WEATHER_WINTER = 1;
const WEATHER_RAIN = 2;

const BASE = { Desert: 0, Mountain: 100, Temperate: 300, Swamp: 400 };

const SET = {
  None: -1,
  Exterior_Terrain: 2,
  Exterior_Ruins: 7,
  Exterior_Castle: 9,
  Exterior_CityA: 12,
  Exterior_CityB: 14,
  Exterior_CityWalls: 17,
  Exterior_Farm: 26,
  Exterior_Fences: 29,
  Exterior_MagesGuild: 35,
  Exterior_Manor: 38,
  Exterior_MerchantHomes: 42,
  Exterior_TavernExteriors: 58,
  Exterior_TempleExteriors: 61,
  Exterior_Village: 64,
  Exterior_Roofs: 69,
  Exterior_CitySpec: 79,
  Exterior_CitySpec_Snow: 80,
  Exterior_CitySpecB: 82,
  Exterior_CitySpecB_Snow: 83,
  Exterior_Doors: 74,
  Interior_CastleInt: 11,
  Interior_CityInt: 16,
  Interior_CryptA: 19,
  Interior_CryptB: 20,
  Interior_DungeonsA: 22,
  Interior_DungeonsB: 23,
  Interior_DungeonsC: 24,
  Interior_DungeonsNEWCs: 25,
  Interior_FarmInt: 28,
  Interior_MagesGuildInt: 37,
  Interior_ManorInt: 40,
  Interior_MarbleFloors: 41,
  Interior_MerchantHomesInt: 44,
  Interior_Mines: 45,
  Interior_Caves: 47,
  Interior_Paintings: 48,
  Interior_TavernInt: 60,
  Interior_TempleInt: 63,
  Interior_VillageInt: 66,
  Interior_Sewer: 68,
  Nature_RainForest: 500,
  Nature_SubTropical: 501,
  Nature_Swamp: 502,
  Nature_Desert: 503,
  Nature_TemperateWoodland: 504,
  Nature_WoodlandHills: 506,
  Nature_HauntedWoodlands: 508,
  Nature_Mountains: 510,
};

export const GROUP = { None: 0, Terrain: 1, Exterior: 2, Interior: 3, Nature: 4 };

const EXTERIOR_SETS = new Set([
  SET.Exterior_Ruins, SET.Exterior_Castle, SET.Exterior_CityA,
  SET.Exterior_CityB, SET.Exterior_CityWalls, SET.Exterior_Farm,
  SET.Exterior_Fences, SET.Exterior_MagesGuild, SET.Exterior_Manor,
  SET.Exterior_MerchantHomes, SET.Exterior_TavernExteriors,
  SET.Exterior_TempleExteriors, SET.Exterior_Village, SET.Exterior_Roofs,
  SET.Exterior_CitySpec, SET.Exterior_CitySpec_Snow,
  SET.Exterior_CitySpecB, SET.Exterior_CitySpecB_Snow,
]);
const INTERIOR_SETS = new Set([
  SET.Interior_CastleInt, SET.Interior_CityInt, SET.Interior_CryptA,
  SET.Interior_CryptB, SET.Interior_DungeonsA, SET.Interior_DungeonsB,
  SET.Interior_DungeonsC, SET.Interior_DungeonsNEWCs, SET.Interior_FarmInt,
  SET.Interior_MagesGuildInt, SET.Interior_ManorInt,
  SET.Interior_MarbleFloors, SET.Interior_MerchantHomesInt,
  SET.Interior_Mines, SET.Interior_Caves, SET.Interior_Paintings,
  SET.Interior_TavernInt, SET.Interior_TempleInt, SET.Interior_VillageInt,
  SET.Interior_Sewer,
]);
export const BUILDING_INTERIOR_SETS = Object.freeze(new Set([
  SET.Interior_CastleInt, SET.Interior_CityInt, SET.Interior_FarmInt, SET.Interior_MagesGuildInt,
  SET.Interior_ManorInt, SET.Interior_MerchantHomesInt, SET.Interior_TavernInt, SET.Interior_TempleInt,
  SET.Interior_VillageInt,
]));
const NATURE_WINTER_SETS = new Set([
  SET.Nature_TemperateWoodland, SET.Nature_WoodlandHills,
  SET.Nature_HauntedWoodlands, SET.Nature_Mountains,
]);
const NATURE_SETS = new Set([
  SET.Nature_RainForest, SET.Nature_SubTropical, SET.Nature_Swamp,
  SET.Nature_Desert, ...NATURE_WINTER_SETS,
]);

export function getClimateTextureInfo(archive) {
  const ci = { textureSet: SET.None, textureGroup: GROUP.None, supportsWinter: false, supportsRain: false };
  if (archive > 499) {
    if (NATURE_SETS.has(archive)) {
      ci.textureSet = archive;
      ci.textureGroup = GROUP.Nature;
      if (NATURE_WINTER_SETS.has(archive)) ci.supportsWinter = true;
    }
    return ci;
  }
  const set = archive - Math.trunc(archive / 100) * 100;
  if (set === SET.Exterior_Terrain) {
    ci.textureSet = set;
    ci.textureGroup = GROUP.Terrain;
    ci.supportsWinter = true;
    ci.supportsRain = true;
  } else if (EXTERIOR_SETS.has(set)) {
    ci.textureSet = set;
    ci.textureGroup = GROUP.Exterior;
    ci.supportsWinter = true;
  } else if (set === SET.Exterior_Doors) {
    ci.textureSet = set;
    ci.supportsWinter = false;
  } else if (INTERIOR_SETS.has(set)) {
    ci.textureSet = set;
    ci.textureGroup = GROUP.Interior;
  }
  return ci;
}

/**
 * @param {number} archive
 * @param {number} record
 * @param {number} climateBase
 * @param {number} season
 * @returns {number}
 */
export function applyClimate(archive, record, climateBase, season) {
  if (archive % 100 === 74 && record === 3) return archive;

  const ci = getClimateTextureInfo(archive);
  if (ci.textureSet === SET.None) return archive;

  if (climateBase === BASE.Swamp && ci.textureSet === SET.Interior_MarbleFloors) {
    return archive;
  }
  if (climateBase === BASE.Desert) ci.supportsWinter = false;
  // This matches the C# precedence: the castle clause applies in every climate, swamp or not.
  if ((climateBase === BASE.Swamp && ci.textureSet === SET.Exterior_MagesGuild) ||
      (ci.textureSet === SET.Exterior_Castle && record > 3)) {
    ci.supportsWinter = false;
  }
  if ((archive === 82 && record > 1) || archive === 77) {
    ci.supportsWinter = false;
  }

  let suppressClimateIndex = false;
  switch (archive) {
    case 75: case 76: case 77: case 79: case 80: case 82: case 83:
      suppressClimateIndex = true;
      break;
  }

  let climateIndex;
  if (archive < 500 && !suppressClimateIndex) {
    climateIndex = climateBase + ci.textureSet;
    if (season === SEASON.Winter && ci.supportsWinter) climateIndex += WEATHER_WINTER;
    else if (season === SEASON.Rain && ci.supportsRain) climateIndex += WEATHER_RAIN;
  } else {
    climateIndex = archive;
    if (season === SEASON.Winter && ci.supportsWinter) climateIndex += WEATHER_WINTER;
  }
  return climateIndex;
}

export function isExteriorWindow(archive, record) {
  if ((archive >= 375 && archive <= 379) || archive === 210 || archive === 280) {
    return false;
  }
  if ((archive === 36 && record === 2) ||
      (archive === 151 && record === 3) ||
      (archive === 154 && record === 3) ||
      (archive === 351 && record === 3) ||
      (archive === 171 && record === 2) ||
      (archive === 172 && record === 3) ||
      (archive === 173 && record === 3)) {
    return true;
  }
  archive = archive % 100;
  switch (archive) {
    case 9: case 10: case 12: case 13: case 14: case 15:
    case 26: case 27: case 35: case 36: case 38: case 39:
    case 42: case 43: case 58: case 59: case 61: case 62:
    case 64: case 65:
      if (record === 3) return true;
      break;
    case 75: case 76: case 77:
      return true;
    case 79: case 80:
      if (record === 0 || record === 2) return true;
      break;
    case 82: case 83:
      if (record === 0) return true;
      break;
  }
  return false;
}

export function getNatureArchive(baseNatureArchive, season) {
  let archive = NATURE_SETS.has(baseNatureArchive)
    ? baseNatureArchive
    : SET.Nature_TemperateWoodland;
  if (season === SEASON.Winter && NATURE_WINTER_SETS.has(archive)) archive += 1;
  return archive;
}

// The terrain keys on the climate's own `groundArchive` (MountainWoods is Temperate but uses 102), not
// `getGroundArchive`; Desert bases skip the winter +1 because archive 3 is no terrain tileset.
export function getTerrainGroundArchive(climateSettings, season) {
  return climateSettings.groundArchive + (groundIsSnowy(climateSettings, season) ? 1 : 0);
}

export function groundIsSnowy(climateSettings, season) {
  return climateSettings.climateType !== BASE.Desert && season === SEASON.Winter;
}

let _snowlessGround = null;
export function setSnowlessGround(fn) { _snowlessGround = typeof fn === 'function' ? fn : null; }
// Texture packs may draw a snowless set for the winter archive without moving the terrain off it, so weather code
// asks this instead of `groundIsSnowy`.
export function groundWearsSnow(climateSettings, season) {
  return groundIsSnowy(climateSettings, season) && !(_snowlessGround?.(climateSettings.groundArchive + 1) ?? false);
}

export function getGroundArchive(climateBase, season) {
  let archive;
  switch (climateBase) {
    case BASE.Desert: archive = 2; break;
    case BASE.Mountain: archive = 102; break;
    case BASE.Temperate: archive = 302; break;
    case BASE.Swamp: archive = 402; break;
    default: archive = 302; break;
  }
  if (season === SEASON.Winter) archive += 1;
  else if (season === SEASON.Rain) archive += 2;
  return archive;
}
