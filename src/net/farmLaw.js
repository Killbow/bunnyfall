// @ts-check
// BUNNYFALL COMPANIES (2026-11-12): COMPANY FARMS - the map's own farm locations (MAPS.BSA's HomeFarms) a Company buys
// inside its territory and works for the Company Stores.
//
// Asked: farms "inside its territory"; worked "Passive + chores"; producing "Food", "Herbs", "Hides and wool" and
// "Timber"; "Up to 3, bought with gold".
//
//   - BOUGHT by a Captain or an Officer with FARM_PRICE gold from the treasury, FARMS_MAX a Company, one owner a farm,
//     at a farm inside the Company's or its Charter's territory (the client's measure - the service knows no map).
//   - A CROP: food, herbs, hides and wool, or timber - changed at any time by a Captain or an Officer.
//   - EVERY FINISHED UTC DAY the farm puts its crop's yield into the Company Stores; each member who did that day's
//     chore at the farm (standing at it) adds CHORE_BONUS of it again.
//   - LOST when the territory no longer reaches it: the members' clients see it and say so (no gold back).
//
// Pure: no clock, no DOM, no network. Both ends read it; every number is balance.
import { HERB_TABLES } from './nodeLaw.js';
import { herbKey } from './professionLaw.js';

export const FARMS_MAX = 3;
export const FARM_PRICE = 6000;
/** Each member's chore adds this share of the day's yield again. */
export const CHORE_BONUS = 0.5;
/** The days a farm is reckoned at once, at most (its granary holds no more). */
export const FARM_DAYS_MAX = 7;

/** The crops: what a day yields with nobody there, and what it yields - by the day, so the Stores get a spread. */
export const CROPS = Object.freeze([
  Object.freeze({ key: 'food', name: 'Food', base: 6, note: 'Apples, eggs, meat and mushrooms' }),
  Object.freeze({ key: 'herbs', name: 'Herbs', base: 3, note: 'The common herbs of its land' }),
  Object.freeze({ key: 'hides', name: 'Hides and wool', base: 2, note: 'Wool bolts and cured leather' }),
  Object.freeze({ key: 'timber', name: 'Timber', base: 4, note: 'Pine and oak logs' }),
]);
export const CROP_KEYS = Object.freeze(CROPS.map((c) => c.key));
export const cropOf = (k) => CROPS.find((c) => c.key === k) ?? null;

const FOODS = Object.freeze(['food:apple', 'food:egg', 'food:meat', 'food:mushroom']);
const HIDES = Object.freeze(['cloth:wool', 'leather:cured']);
const WOODS = Object.freeze(['log:pine', 'log:oak']);

/** The material a farm's crop yields on `day` (UTC days) - `climate` and `region` the farm's, for its herbs. */
export function cropMaterial(crop, day, climate, region) {
  const pick = (list) => list[((day % list.length) + list.length) % list.length];
  if (crop === 'food') return pick(FOODS);
  if (crop === 'hides') return pick(HIDES);
  if (crop === 'timber') return pick(WOODS);
  if (crop === 'herbs') {
    const common = HERB_TABLES[climate]?.[0] ?? HERB_TABLES[Object.keys(HERB_TABLES)[0]][0];
    return herbKey(pick(common), region) ?? null;
  }
  return null;
}

/** A day's yield for a crop with `chores` members' chores done. */
export const dayYield = (crop, chores) => Math.round((cropOf(crop)?.base ?? 0) * (1 + CHORE_BONUS * Math.max(0, Math.min(6, chores | 0))));

/** What a refusal says, by its error. */
export const FARM_WORDS = Object.freeze({
  'farm-rank': 'Only the Captain and the Officers buy farms and choose their crops.',
  'farm-full': `A Company holds at most ${FARMS_MAX} farms.`,
  'farm-taken': 'Another Company already holds that farm.',
  'farm-gold': 'Your Company\'s treasury does not hold enough gold.',
  'farm-not-ours': 'That farm is not your Company\'s.',
  'farm-chore-done': 'You already did today\'s chore at this farm.',
  'farm-bad': 'That farm request was not understood.',
});
export const farmWordText = (error) => FARM_WORDS[error] ?? 'The farm could not be changed just now.';
