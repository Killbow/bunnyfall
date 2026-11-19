// @ts-check
// BUNNYFALL FARM EXPANSION, PHASE 2 (docs/FARM-EXPANSION.md section 4.2): THE CROPS - which seeds a farm grows, by its
// climate, and how the seasons of the shared calendar speed or slow them.
//
//   - The first three (grain, mushrooms, herbs) grow anywhere and at the same pace all year, as they always have, so the
//     weekly orders built on them keep their balance.
//   - The new crops grow where their climate suits them (`climates`, MAPS.BSA's climate indices) - the service checks
//     the farm's own climate, never the client's word - and with the seasons: full pace in theirs, SEASON_OFF in the
//     others, SEASON_WINTER in winter. Never zero: a crop pauses only when dry, never dies.
//   - The season is the SHARED calendar's (net/wire.js sharedClassicMinutes, the online world's clock): twelve game
//     minutes a real minute, so a season lasts about seven and a half real days and every player sees the same one.
//     Growth over an interval is integrated across the season's boundaries (seasonGrowth), so it is exact.
// Pure: both ends read it.
import { sharedClassicMinutes, wallMsForClassicMinutes } from '../wire.js';
import { dateFromClassicMinutes, dateToClassicMinutes, seasonValue, SEASONS, MINUTES_PER_DAY, DAYS_PER_MONTH } from '../../systems/gameDate.js';

const C = Object.freeze({ Desert: 224, Desert2: 225, Mountain: 226, Rainforest: 227, Swamp: 228, Subtropical: 229, MountainWoods: 230, Woodlands: 231, HauntedWoodlands: 232 });
const { Fall, Spring, Summer } = SEASONS;

/** Every seed: its id, real seconds to ripen (at full pace), what it yields, and - for the new crops - where and when
 *  it grows best. `material` null: the farm's herbs (farmLaw.js cropMaterial).
 * @typedef {{ id: string, seconds: number, material: string|null, yield: number, climates?: readonly number[], seasons?: readonly number[] }} FarmSeed */
/** @type {ReadonlyArray<FarmSeed>} */
export const FARM_SEEDS = Object.freeze([
  Object.freeze({ id: 'grain', seconds: 6 * 3600, material: 'food:grain', yield: 2 }),
  Object.freeze({ id: 'mushroom', seconds: 12 * 3600, material: 'food:mushroom', yield: 3 }),
  Object.freeze({ id: 'herbs', seconds: 18 * 3600, material: null, yield: 2 }),
  Object.freeze({ id: 'corn', seconds: 8 * 3600, material: 'food:corn', yield: 2, climates: [C.Mountain, C.MountainWoods, C.Woodlands], seasons: [Summer, Fall] }),
  Object.freeze({ id: 'cabbage', seconds: 10 * 3600, material: 'food:cabbage', yield: 2, climates: [C.Woodlands, C.Mountain, C.MountainWoods, C.HauntedWoodlands], seasons: [Spring, Fall] }),
  Object.freeze({ id: 'tomato', seconds: 12 * 3600, material: 'food:tomato', yield: 3, climates: [C.Subtropical, C.Woodlands, C.Rainforest], seasons: [Summer] }),
  Object.freeze({ id: 'sunflower', seconds: 14 * 3600, material: 'food:sunseed', yield: 3, climates: [C.Subtropical, C.Woodlands, C.Desert2], seasons: [Summer] }),
  Object.freeze({ id: 'berries', seconds: 16 * 3600, material: 'food:berries', yield: 3, climates: [C.Woodlands, C.Mountain, C.MountainWoods, C.HauntedWoodlands, C.Swamp], seasons: [Summer, Fall] }),
  Object.freeze({ id: 'root', seconds: 16 * 3600, material: 'food:root', yield: 2, climates: [C.Desert, C.Desert2, C.Mountain], seasons: [Spring, Summer, Fall] }),
  Object.freeze({ id: 'flax', seconds: 20 * 3600, material: 'food:flax', yield: 2, climates: [C.Woodlands, C.Swamp, C.HauntedWoodlands, C.Rainforest], seasons: [Spring, Summer] }),
  Object.freeze({ id: 'gourd', seconds: 24 * 3600, material: 'food:gourd', yield: 2, climates: [C.Woodlands, C.Subtropical, C.Swamp], seasons: [Fall] }),
  Object.freeze({ id: 'grapes', seconds: 30 * 3600, material: 'food:grapes', yield: 4, climates: [C.Rainforest, C.Swamp, C.Subtropical], seasons: [Summer, Fall] }),
]);
/** @type {readonly string[]} */
export const FARM_SEED_IDS = Object.freeze(FARM_SEEDS.map((s) => s.id));
export const farmSeed = (id) => FARM_SEEDS.find((s) => s.id === id) ?? null;

/** Whether a seed grows outdoors in a farm's climate (the first three anywhere; a new crop where its `climates` say;
 *  a new crop never where the climate is unknown). */
export function seedGrowsIn(seed, climate) {
  if (!seed) return false;
  if (!seed.climates) return true;
  return Number.isFinite(climate) && seed.climates.includes(climate);
}
/** The seeds a farm of this climate grows, in table order. */
export const seedsFor = (climate) => FARM_SEEDS.filter((s) => seedGrowsIn(s, climate));

/** Pace off a crop's season, and in winter. */
export const SEASON_OFF = .7, SEASON_WINTER = .4;
/** A season's length in real seconds: three game months of the shared clock. */
const SEASON_CLASSIC_MIN = 3 * DAYS_PER_MONTH * MINUTES_PER_DAY;
const SEASON_REAL_S = SEASON_CLASSIC_MIN / 12;   // twelve classic minutes a real minute (wire.js ONLINE_MINUTES_PER_MS)

/** The shared calendar's season at real time `nowS` (gameDate.js SEASONS). */
export const farmSeason = (nowS) => seasonValue(dateFromClassicMinutes(Math.floor(sharedClassicMinutes(nowS * 1000))));
/** A seed's pace in a season: 1, SEASON_OFF or SEASON_WINTER (the first three: 1 always). */
export function seasonPace(seed, season) {
  if (!seed?.seasons) return 1;
  if (seed.seasons.includes(season)) return 1;
  return season === SEASONS.Winter ? SEASON_WINTER : SEASON_OFF;
}

/**
 * The growth a seed makes between real times `a` and `b` (seconds, `b` > `a`), its pace following the season at each
 * moment: the interval cut at every season's turn. Months are whole classic months, so a season's turn falls where the
 * classic minute count crosses a multiple of the month - found from `a` and stepped by SEASON_REAL_S.
 */
export function seasonGrowth(seed, a, b, hardy = false) {   // PHASE 2c: a hardy strain feels half the slowing
  if (!(b > a)) return 0;
  if (!seed?.seasons) return b - a;
  let t = a, grown = 0;
  for (let guard = 0; t < b && guard < 400; guard++) {
    // the season holds to the end of this month: the calendar's own next month's first minute, back in real time
    const d = dateFromClassicMinutes(Math.floor(sharedClassicMinutes(t * 1000)));
    const nextMonth = d.month >= 11 ? { year: d.year + 1, month: 0 } : { year: d.year, month: d.month + 1 };
    const end = Math.min(b, Math.max(t + 1, wallMsForClassicMinutes(dateToClassicMinutes({ ...nextMonth, day: 0, hour: 0, minute: 0 })) / 1000));
    const pace = seasonPace(seed, seasonValue(d));
    grown += (end - t) * (hardy ? 1 - (1 - pace) / 2 : pace);
    t = end;
  }
  return grown;
}
export { SEASON_REAL_S, SEASONS };
