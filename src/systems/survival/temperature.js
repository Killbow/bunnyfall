import { EQUIP_SLOTS } from '../../characters/paperdoll.js';
import { CLIMATES } from '../../formats/mapsFile.js';
import { RACES } from '../../characters/races.js';
import { monthNames, DAWN_HOUR, DUSK_HOUR } from '../../world/gameDate.js';
import { precipitationForWeather } from '../../world/weather.js';

// Restated from spellcast.js so this module imports no combat module: equip mints the starting kit from here.
export const FLAG_FIRE = 8;
export const FLAG_FROST = 16;

export const CLIMATE_TEMP = Object.freeze({
  [CLIMATES.Ocean]: 0, [CLIMATES.Desert]: 40, [CLIMATES.Desert2]: 50, [CLIMATES.Mountain]: -40,
  [CLIMATES.Rainforest]: 20, [CLIMATES.Swamp]: 10, [CLIMATES.Subtropical]: 30,
  [CLIMATES.MountainWoods]: -30, [CLIMATES.Woodlands]: -10, [CLIMATES.HauntedWoodlands]: -20,
});
export const MONTH_TEMP = Object.freeze([-20, -15, -5, 0, 5, 10, 20, 15, 0, -5, -10, -15]);
export const NIGHT_MULT = Object.freeze({ [CLIMATES.Desert]: 3, [CLIMATES.Desert2]: 4, [CLIMATES.Mountain]: 2 });
export const WEATHER_TEMP = Object.freeze({
  sunny: 0, cloudy: 0, overcast: -8, fog: -5, rain: -10, thunder: -15, snow: -10, sandstorm: 5,
});
export const WEATHER_WET = Object.freeze({
  rain: [3, 1, 0], thunder: [5, 2, 1], snow: [1, 0, 0], fog: [1, 0, 0],
});
export const RACE_TEMP = Object.freeze({
  [RACES.Breton]: 5, [RACES.Redguard]: -5, [RACES.Nord]: 5, [RACES.DarkElf]: -5,
  [RACES.HighElf]: 0, [RACES.WoodElf]: 0, [RACES.Khajiit]: -5, [RACES.Argonian]: -10,
});
export const NAKED_OFFSET = -5;
export const WATER_COOLS = 10;
export const HOOD_SHADE = 10;
export const WET_MAX = 300;
export const WET_SUBMERGED = 300;
export const WET_WADING = 50;

export const CHEST_WARMTH = Object.freeze({
  141: 1, 142: 1, 143: 10, 144: 1, 145: 1, 146: 1,
  157: 12, 158: 8, 159: 12, 160: 8, 161: 12, 163: 12, 164: 12,
  165: 5, 166: 5, 167: 8, 168: 8, 169: 8, 170: 8, 171: 10, 172: 10, 173: 10,
  176: 12, 177: 1, 178: 8, 179: 8, 180: 1, 181: 1,
  182: 1, 183: 1, 184: 8, 185: 1, 194: 1, 195: 10, 196: 12, 197: 10, 198: 8,
  200: 12, 201: 12, 202: 5, 203: 5, 204: 8, 205: 8, 206: 8, 207: 8, 208: 10, 209: 12, 210: 10,
  214: 8, 215: 8, 216: 1,
});
export const LEGS_WARMTH = Object.freeze({
  151: 10, 152: 10, 153: 4, 156: 2, 162: 1, 174: 4, 175: 8,
  190: 10, 193: 2, 199: 1, 211: 4, 212: 8, 213: 4,
});
export const FEET_WARMTH = Object.freeze({ 147: 2, 148: 4, 149: 4, 150: 0, 186: 2, 187: 4, 188: 4, 189: 0 });
export const CLOAK_WARMTH = Object.freeze([4, 5, 3, 2, 1, 2]);
export const CASUAL_CLOAKS = Object.freeze(new Set([154, 191]));
export const FORMAL_CLOAKS = Object.freeze(new Set([155, 192]));
export const HOODED_CLOAK_VARIANTS = Object.freeze(new Set([1, 2, 5]));
export const HOODED_ROBES = Object.freeze(new Set([163, 200]));
export const COVERING_CHEST = Object.freeze(new Set([163, 164, 200, 201]));

export const ARMOR_WARMTH = Object.freeze({
  [EQUIP_SLOTS.ChestArmor]: Object.freeze({ warm: [3, 1, 3], metal: [1, 4] }),
  [EQUIP_SLOTS.LegsArmor]: Object.freeze({ warm: [2, 1, 2], metal: [1, 3] }),
  [EQUIP_SLOTS.Head]: Object.freeze({ warm: [1, 2, 1], metal: [1, 1] }),
  [EQUIP_SLOTS.RightArm]: Object.freeze({ warm: [1, 2, 1], metal: [0, 1] }),
  [EQUIP_SLOTS.LeftArm]: Object.freeze({ warm: [1, 2, 1], metal: [0, 1] }),
  [EQUIP_SLOTS.Gloves]: Object.freeze({ warm: [1, 0, 0], metal: [0, 0] }),
  [EQUIP_SLOTS.Feet]: Object.freeze({ warm: [2, 1, 2], metal: [1, 2] }),
});
export const armorMaterialClass = (material) => {
  const m = (material ?? 0) & 0x0f00;
  return m === 0 ? 0 : m === 0x0100 ? 1 : 2;
};

export function naturalTemperature({ climateIndex, month, hour, weather, insideBuilding = false, insideDungeon = false } = {}) {
  const climate = CLIMATE_TEMP[climateIndex] ?? 0;
  const season = MONTH_TEMP[((month ?? 0) % 12 + 12) % 12] ?? 0;
  if (insideBuilding) {
    // Indoors the street reading is clamped to the size of the roofed half and never crosses zero.
    const roofed = Math.trunc((climate + season) / 2);
    const street = climate + season + hourTemperature(hour, climateIndex) + (WEATHER_TEMP[weather] ?? 0);
    return Math.max(-Math.abs(roofed), Math.min(Math.abs(roofed), street)) || 0;
  }
  const day = insideDungeon ? 0 : hourTemperature(hour, climateIndex);
  const sky = insideDungeon ? 0 : (WEATHER_TEMP[weather] ?? 0);
  return climate + season + day + sky;
}

export function hourTemperature(hour, climateIndex) {
  // Hosts pass a fractional hour, so a minute takes the band of the whole hour it is in.
  const h = ((Math.floor(hour ?? 12)) % 24 + 24) % 24;
  const m = NIGHT_MULT[climateIndex] ?? 1;
  if (h >= 8 && h <= 15) return 0;
  if (h >= 16 && h <= 19) return -10 * m;
  if (h >= 4 && h <= 7) return -10 * m;
  return -20 * m;
}

export function sunlit({ hour = 12, weather = 'sunny', insideBuilding = false, insideDungeon = false, sheltered = false } = {}) {
  const h = ((Math.floor(hour ?? 12)) % 24 + 24) % 24;
  return !insideBuilding && !insideDungeon && !sheltered && h >= DAWN_HOUR && h < DUSK_HOUR && (weather === 'sunny' || weather === 'cloudy');
}

// Keep these bands in step with hourTemperature.
export function hourBand(hour) {
  const h = ((Math.floor(hour ?? 12)) % 24 + 24) % 24;
  if (h >= 8 && h <= 15) return 'day';
  if (h >= 16 && h <= 19) return 'evening';
  if (h >= 4 && h <= 7) return 'dawn';
  return 'night';
}
// The parts sum to naturalTemperature exactly; the roof's share is the remainder, so the roof rule lives there.
export function naturalParts(env = {}) {
  const { climateIndex, month, hour, weather } = env;
  const climate = CLIMATE_TEMP[climateIndex] ?? 0;
  const season = MONTH_TEMP[((month ?? 0) % 12 + 12) % 12] ?? 0;
  const day = hourTemperature(hour, climateIndex);
  const sky = WEATHER_TEMP[weather] ?? 0;
  const natural = naturalTemperature(env);
  if (natural === climate + season + day + sky) return { climate, season, hour: day, weather: sky, roof: 0, natural };
  return { climate, season, hour: 0, weather: 0, roof: natural - climate - season, natural };
}

export function weatherWetGain(weather, { cloak = false, hood = false, insideBuilding = false, insideDungeon = false, sheltered = false, fall = 1, snow = null } = {}) {
  if (insideBuilding || insideDungeon || sheltered) return 0;
  let row = WEATHER_WET[weather];
  if (!row) return 0;
  if (snow != null && (weather === 'rain' || weather === 'thunder' || weather === 'snow')) {
    const wet = WEATHER_WET[weather === 'snow' ? 'rain' : weather], white = WEATHER_WET.snow, k = Math.max(0, Math.min(1, snow));
    row = wet.map((v, i) => v + (white[i] - v) * k);
  }
  const k = precipitationForWeather(weather) ? Math.max(0, Math.min(1, Number.isFinite(fall) ? fall : 1)) : 1;
  return k * (cloak ? (hood ? row[2] : row[1]) : row[0]);
}

export const GEAR_DRY_MOST = 75;
// Garment degrees apply to the felt number alone, never to the frost and fire resistances.
export function wardrobeCtx(mods) {
  if (!mods) return {};
  return {
    gearWarmth: Number(mods.warmth) || 0, gearDry: Number(mods.dry) || 0,
    coldDegrees: Number(mods.coldDegrees) || 0, heatDegrees: Number(mods.heatDegrees) || 0,
  };
}
export const environmentWet = ({ submerged = false, wading = false } = {}) =>
  (submerged ? WET_SUBMERGED : 0) + (wading ? WET_WADING : 0);

export function resistTemperature(temp, ctx = {}) {
  if (temp === 0) return 0;
  const cold = temp < 0;
  const bit = cold ? FLAG_FROST : FLAG_FIRE;
  const rt = ctx.raceTemplate ?? {};
  let r = cold ? (ctx.frostResist ?? 0) : (ctx.fireResist ?? 0);
  if (((rt.resistanceFlags ?? 0) & bit) === bit) r += 25;
  if (((rt.immunityFlags ?? 0) & bit) === bit) r += 50;
  if (((rt.lowToleranceFlags ?? 0) & bit) === bit) r -= 25;
  if (((rt.criticalWeaknessFlags ?? 0) & bit) === bit) r -= 50;
  if (ctx.beastForm) r += cold ? 100 : 80;
  else if (ctx.lycanthrope) r += 10;
  if (cold && ctx.vampire) r += 25;
  return cold ? Math.min(temp + r, 0) : Math.max(temp - r, 0);
}

const at = (worn, slot) => (worn ? worn[slot] ?? null : null);

// The one hood rule: the vampire sun check reads it too.
export function cloakState(worn) {
  const cloaks = [at(worn, EQUIP_SLOTS.Cloak1), at(worn, EQUIP_SLOTS.Cloak2)].filter(Boolean);
  const cloak = cloaks.length > 0;
  let hood = cloaks.some((c) => HOODED_CLOAK_VARIANTS.has(c.variant ?? 0));
  const chest = at(worn, EQUIP_SLOTS.ChestClothes);
  if (!hood && chest && HOODED_ROBES.has(chest.templateIndex) && (chest.variant ?? 0) === 1) hood = true;
  return { cloak, hood, cloaks };
}

export const hoodCapable = (item) => CASUAL_CLOAKS.has(item?.templateIndex) || FORMAL_CLOAKS.has(item?.templateIndex)
  || HOODED_ROBES.has(item?.templateIndex);
export function hoodUp(item) {
  if (!hoodCapable(item)) return false;
  return cloakState({ [HOODED_ROBES.has(item.templateIndex) ? EQUIP_SLOTS.ChestClothes : EQUIP_SLOTS.Cloak1]: item }).hood;
}

// A deliberate departure from the mod: above this, clothes lose a degree of warmth per degree, down to half.
export const CLOTHES_BREATHE_ABOVE = 10;
export function clothingWarmth(worn, { wet = 0, natural = 0, inSunlight = false, gear = 0 } = {}) {
  const chest = at(worn, EQUIP_SLOTS.ChestClothes), legs = at(worn, EQUIP_SLOTS.LegsClothes), feet = at(worn, EQUIP_SLOTS.Feet);
  let warmth = (chest ? CHEST_WARMTH[chest.templateIndex] ?? 0 : 0)
    + (legs ? LEGS_WARMTH[legs.templateIndex] ?? 0 : 0)
    + (feet && feet.group !== 'Armor' ? FEET_WARMTH[feet.templateIndex] ?? 0 : 0)
    + Math.max(0, Number(gear) || 0);
  const { cloaks, hood } = cloakState(worn);
  for (const c of cloaks) {
    const v = CLOAK_WARMTH[c.variant ?? 0] ?? CLOAK_WARMTH[0];
    warmth += FORMAL_CLOAKS.has(c.templateIndex) ? 3 * v : CASUAL_CLOAKS.has(c.templateIndex) ? v : 0;
  }
  const shade = natural > 30 && inSunlight && hood ? Math.min(HOOD_SHADE, natural - 30) : 0;
  if (natural > CLOTHES_BREATHE_ABOVE) warmth = Math.max(Math.trunc(warmth / 2) - shade, warmth - (natural - CLOTHES_BREATHE_ABOVE));
  const pure = Math.max(0, warmth);
  warmth = Math.max(0, pure - Math.min(wet, WET_MAX));
  return { warmth, pure, hood };
}

export function armorWarmth(worn, { natural = 0, wet = 0, inSunlight = false } = {}) {
  let warm = 0, metal = 0;
  for (const [slot, row] of Object.entries(ARMOR_WARMTH)) {
    const item = at(worn, Number(slot));
    if (!item || item.group !== 'Armor') continue;
    const cls = armorMaterialClass(item.material);
    warm += row.warm[cls] ?? 0;
    if (cls > 0) metal += row.metal[cls - 1] ?? 0;
  }
  const chest = at(worn, EQUIP_SLOTS.ChestClothes);
  const covered = cloakState(worn).cloak || (chest ? COVERING_CHEST.has(chest.templateIndex) : false);
  const metalTemp = Math.trunc((metal * natural) / 20);
  let heat = 0;
  if (metalTemp > 0 && inSunlight && !covered) heat = metalTemp;
  else if (metalTemp < 0) heat = Math.trunc((metalTemp + 1) / 2);
  const warmth = warm > 0 ? Math.max(0, warm - Math.min(wet, WET_MAX)) : 0;
  return { warmth: warmth + heat, pieces: warm, metal: metalTemp, heat, covered };
}

export function dungeonTemperature(natTemp) {
  return natTemp > -20 ? Math.max(Math.trunc(natTemp / 2) - 30, -20) : Math.min(Math.trunc(natTemp / 2) + 30, -20);
}

/** @param {object} env @param {object} worn @param {object} ctx */
export function feltTemperature(env = {}, worn = null, ctx = {}) {
  const natural = naturalTemperature(env);
  // Whole wetness only: weatherproofing leaves fractions in the counter.
  const wet = Math.floor(Math.min(Math.max(0, Number(ctx.wet) || 0), WET_MAX));
  // Underground, the dungeon's air drives the clothes, the armor, the rot, and the drying, and the resistances turn
  // that air (the mod resists before the dungeon correction).
  const air = env.insideDungeon ? dungeonTemperature(natural) : natural;
  const natTemp = resistTemperature(air, ctx);
  const clothes = clothingWarmth(worn, { wet, natural: air, inSunlight: !!env.inSunlight, gear: ctx.gearWarmth });
  const armour = armorWarmth(worn, { natural: air, wet, inSunlight: !!env.inSunlight });
  const race = RACE_TEMP[ctx.raceId] ?? 0;
  const water = Math.trunc(wet / 20);
  const fire = env.byFire ? 15 : 0;
  // Resistances turn only the air toward zero, never the warmth the body carries.
  const own = race + clothes.warmth + armour.warmth + fire - water + NAKED_OFFSET;
  let felt = natTemp + own;
  const unwatered = felt;
  if (felt > 9 && ctx.hasWater && !ctx.vampire) felt = Math.max(felt - WATER_COOLS, 9);
  const watered = felt;
  const coldLess = Math.max(0, Number(ctx.coldDegrees) || 0), heatLess = Math.max(0, Number(ctx.heatDegrees) || 0);
  if (felt < 0) felt = Math.min(felt + coldLess, 0);
  else if (felt > 0) felt = Math.max(felt - heatLess, 0);
  return {
    natural, natTemp, own, felt, abs: Math.abs(felt), air,
    clothes: clothes.warmth, clothesDry: clothes.pure, armour: armour.warmth, metal: armour.heat, race, water, fire,
    cloak: cloakState(worn).cloak, hood: clothes.hood, wet,
    worldResist: natTemp - air, dungeon: air - natural, naked: NAKED_OFFSET, waterCools: watered - unwatered, degrees: felt - watered,
    wetGain: weatherWetGain(env.falling?.word ?? env.weather, { cloak: cloakState(worn).cloak, hood: clothes.hood, insideBuilding: env.insideBuilding, insideDungeon: env.insideDungeon, sheltered: !!env.sheltered, fall: env.falling?.level ?? 1, snow: env.falling?.snow ?? null })
        * (1 - Math.min(GEAR_DRY_MOST, Math.max(0, Number(ctx.gearDry) || 0)) / 100)
      + environmentWet(env),
  };
}

export function temperatureWord(felt) {
  if (felt > 50) return 'scorching';
  if (felt > 30) return 'hot';
  if (felt > 10) return 'warm';
  if (felt >= -10) return 'comfortable';
  if (felt >= -30) return 'cold';
  if (felt >= -50) return 'freezing';
  return 'deadly cold';
}

export const CLIMATE_NAMES = Object.freeze({
  [CLIMATES.Ocean]: 'Sea', [CLIMATES.Desert]: 'Desert', [CLIMATES.Desert2]: 'Deep desert', [CLIMATES.Mountain]: 'Mountains',
  [CLIMATES.Rainforest]: 'Rainforest', [CLIMATES.Swamp]: 'Swamp', [CLIMATES.Subtropical]: 'Subtropics',
  [CLIMATES.MountainWoods]: 'Mountain woods', [CLIMATES.Woodlands]: 'Woodlands', [CLIMATES.HauntedWoodlands]: 'Haunted woods',
});
export const WEATHER_NAMES = Object.freeze({
  sunny: 'Clear sky', cloudy: 'Cloudy', overcast: 'Overcast', fog: 'Fog', rain: 'Rain', thunder: 'Thunderstorm', snow: 'Snow', sandstorm: 'Sandstorm',
});
export const HOUR_NAMES = Object.freeze({ day: 'Daytime', evening: 'Evening', dawn: 'Dawn', night: 'Night' });

// Row values sum to `temp.felt` exactly.
export function temperatureBreakdown(env = {}, temp = null) {
  if (!temp) return [];
  const p = naturalParts(env);
  const out = [{ key: 'climate', label: CLIMATE_NAMES[env.climateIndex] ?? 'The land', value: p.climate }];
  const add = (key, label, value, note = null) => { if (value) out.push(note ? { key, label, value, note } : { key, label, value }); };
  add('season', monthNames()[((env.month ?? 0) % 12 + 12) % 12] ?? 'The season', p.season);
  add('hour', HOUR_NAMES[hourBand(env.hour)], p.hour);
  add('weather', WEATHER_NAMES[env.weather] ?? 'The weather', p.weather);
  add('roof', 'Shelter', p.roof);
  add('ground', env.castle ? 'Castle walls' : 'Underground', temp.dungeon);
  add('resist', 'Resistances', temp.worldResist);
  add('race', 'Your race', temp.race);
  add('clothes', 'Clothing', temp.clothes, temp.clothesDry > temp.clothes && temp.wet > 0 ? `${signedDegrees(temp.clothesDry)} dry` : null);
  add('armour', 'Armor', temp.armour, temp.metal > 0 ? 'hot metal' : temp.metal < 0 ? 'cold metal' : null);
  add('fire', 'A fire', temp.fire);
  add('wet', 'Wet through', -temp.water);
  add('skin', 'Heat loss', temp.naked);
  add('drink', 'Water to hand', temp.waterCools);
  add('garment', 'Enchanted garment', temp.degrees);
  return out;
}
export function signedDegrees(n) {
  const v = Math.round(Number(n) || 0);
  return `${v > 0 ? '+' : v < 0 ? '-' : ''}${Math.abs(v)}\u00b0`;
}

