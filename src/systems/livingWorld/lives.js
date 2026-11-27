// @ts-check
import { lwRoll } from './seed.js';

export const HAZARD = Object.freeze({ merchant: 0.006, mercenary: 0.01, adventurer: 0.012, pilgrim: 0.006, courier: 0.004, pedlar: 0.004 });
export const ROAD_HAZARD = Object.freeze({ carter: 0.003, hunter: 0.01, patrol: 0.008, noble: 0.004, retainer: 0.008, minstrel: 0.006 });
/** @param {string} job */
export const hazardOf = (job) => HAZARD[/** @type {keyof typeof HAZARD} */ (job)] ?? ROAD_HAZARD[/** @type {keyof typeof ROAD_HAZARD} */ (job)] ?? 0;
export const VACANT_CYCLES = 3;
const FATE = 0x46415445;

/** @typedef {{ spared?: Set<string>|null, fallen?: Set<string>|null, slain?: Map<string, { t: number }>|null, died?: Map<string, { t: number }>|null, killed?: Map<string, { t: number }>|null }} Turns */

/** @param {{ id: string }} res */
export const placeKeyOf = (res) => String(res.id).replace(/~\d+$/, '');
/**
 * @param {{ id: string }} res
 * @param {number} k
 */
export const turnKey = (res, k) => `${placeKeyOf(res)}@${k}`;

/**
 * @param {any} res
 * @param {number} k
 * @param {Turns} [turns]
 */
export function handDeath(res, k, turns) {
  const key = turnKey(res, k);
  const at = turns?.slain?.get(key) ?? turns?.died?.get(key) ?? turns?.killed?.get(key) ?? null;
  return at ? at.t : null;
}

/**
 * @param {any} res
 * @param {number} k
 * @param {Turns} [turns]
 */
export function roadHits(res, k, turns) {
  const key = turnKey(res, k);
  if (turns?.fallen?.has(key)) return true;
  if (turns?.spared?.has(key)) return false;
  const h = hazardOf(res.job);
  return h > 0 && lwRoll(res.town, res.slot, k, FATE) < h;
}

/**
 * @param {any} res
 * @param {number} k
 * @param {Turns} [turns]
 */
export const fateHits = (res, k, turns) => handDeath(res, k, turns) != null || roadHits(res, k, turns);

/**
 * @param {any} res
 * @param {number} k
 * @param {Turns} [turns]
 */
const quietBefore = (res, k, turns) => {
  for (let j = k - VACANT_CYCLES; j < k; j++) if (fateHits(res, j, turns)) return false;
  return true;
};

/**
 * @param {any} res
 * @param {number} k
 * @param {Turns} [turns]
 */
export function deathCounted(res, k, turns) {
  if (!fateHits(res, k, turns)) return false;
  return !!turns?.fallen?.has(turnKey(res, k)) || handDeath(res, k, turns) != null || quietBefore(res, k, turns);
}

/**
 * @param {any} res
 * @param {number} k
 * @param {Turns} [turns]
 * @returns {{ vacant: boolean, holder: number|null, dies: boolean, diced: boolean, since: number|null, hand: number|null }}
 */
export function placeAt(res, k, turns) {
  let last = null;
  // Scan back to cycle 0 rather than a fixed window, so an old death never reverts the place to the census
  // resident.
  for (let j = k - 1; j >= 0; j--) if (deathCounted(res, j, turns)) { last = j; break; }
  if (last != null && k - last <= VACANT_CYCLES) return { vacant: true, holder: null, dies: false, diced: false, since: last, hand: null };
  const quiet = quietBefore(res, k, turns);
  const dies = roadHits(res, k, turns) && (!!turns?.fallen?.has(turnKey(res, k)) || quiet);
  // `diced` ignores the turns of the character, because the trip and trouble of this cycle follow the raw dice.
  const h = hazardOf(res.job);
  const diced = h > 0 && lwRoll(res.town, res.slot, k, FATE) < h && quiet;
  return { vacant: false, holder: last, dies, diced, since: last, hand: handDeath(res, k, turns) };
}
