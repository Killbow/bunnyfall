// @ts-check
import { BUILDING_TYPES } from '../../world/buildingNames.js';
import { WALK_FROM_H, WALK_TO_H, NATIVE_PER_M, NATIVE_PIXEL, partyAt, membersAt, TRADER_PACE_X } from './trips.js';

export const COUNTERS = Object.freeze({ merchant: BUILDING_TYPES.GeneralStore, carter: BUILDING_TYPES.GeneralStore, pedlar: BUILDING_TYPES.PawnShop });
/** @param {any} trip */
export const CARAVAN_QUALITY = (trip) => Math.max(1, Math.min(20, 6 + Math.floor((trip.from?.blocks | 0) / 4)));
export const PURSE_PER_QUALITY = 300;
export const FRIEND_DISCOUNT = 0.1;
export const ESCORT_OFFER_MIN = 18 * 60;
export const ESCORT_GOLD_DAY = 60;
export const ESCORT_GOLD_LEVEL = 15;
export const ESCORT_FIGHT = 100;
export const ESCORT_KEEP_M = 300;
export const ESCORT_LOST_MIN = 60;
export const ESCORT_SAMPLE_MIN = 5;

/**
 * @param {any} trip
 * @returns {{ buildingType: number, quality: number, name: string, purse: number } | null}
 */
export function counterOf(trip) {
  const buildingType = COUNTERS[/** @type {keyof typeof COUNTERS} */ (trip?.kind)];
  if (buildingType == null) return null;
  const quality = CARAVAN_QUALITY(trip);
  const name = trip.kind === 'merchant' ? `${trip.leader?.name ?? 'The'}'s caravan` : `${trip.leader?.name ?? 'The'}'s pack`;
  return { buildingType, quality, name, purse: purseOf(quality) };
}
/** @param {number} quality */
export const purseOf = (quality) => PURSE_PER_QUALITY * Math.max(1, quality);

/**
 * @param {any} trip
 * @param {any} res
 * @param {number} t
 */
export function keepsCounter(trip, res, t) {
  if (!counterOf(trip) || res?.id !== trip.leader?.id) return false;
  const at = partyAt(trip, t);
  if ((at.phase !== 'out' && at.phase !== 'back') || at.fight) return false;
  return membersAt(trip, t).some((m) => m.id === res.id);
}

/**
 * @param {any} trip
 * @param {number} t
 */
export const reportAt = (trip, t) => (t < trip.outT1 && !trip.turned && !trip.wild ? trip.outT1 : trip.backT1);

/**
 * Only the road's own fallen (no `hand`) leave the party here; members the player killed stay in, so the party
 * yields once its last guard is down.
 * @param {any} trip
 * @param {number} t
 * @param {(res: any) => boolean} [down]
 */
export function yields(trip, t, down = () => false) {
  const left = trip.party.filter((m) => !trip.fallen?.some((f) => f.res.id === m.id && f.t <= t && !f.hand));
  if (!left.some((m) => m.cls != null)) return false;
  const standing = left.filter((m) => !down(m));
  return !standing.some((m) => m.cls != null) && standing.some((m) => m.id === trip.leader?.id);
}

/**
 * Turned trips are still offered: fate is set when a trip is minted, so hiding them would reveal which caravans
 * meet trouble. A turned trip has `outT1` at its turn.
 * @param {any} trip
 * @param {number} t
 */
export function escortOffer(trip, t) {
  return trip?.kind === 'merchant' && !trip.sea && t >= trip.outT0 - ESCORT_OFFER_MIN && t < trip.outT1;
}

/**
 * @param {any} trip
 * @param {number} level
 * @param {number} foes
 * @param {number} [from]
 */
export function escortPay(trip, level, foes = 0, from = -Infinity) {
  const len = Math.max(0, trip.way.len - trip.trim0 - trip.trim1);
  // Pay uses the old trader pace (`TRADER_PACE_X`), so a faster caravan pays the same escort fee.
  const walk = (len / Math.max(1e-9, trip.pace)) * TRADER_PACE_X;
  const days = Math.max(1, Math.ceil(walk / ((WALK_TO_H - WALK_FROM_H) * 60)));
  const at = from > trip.outT0 ? partyAt(trip, from) : null;
  const ahead = at?.s != null ? Math.min(1, Math.max(0, trip.way.len - trip.trim1 - at.s) / Math.max(1e-9, len)) : 1;
  return Math.round(days * (ESCORT_GOLD_DAY + ESCORT_GOLD_LEVEL * Math.max(1, level | 0)) * ahead) + ESCORT_FIGHT * Math.max(0, foes | 0);
}

/**
 * @param {any} trip
 * @param {{ x: number, z: number } | null} here
 * @param {number} since
 * @param {number} t
 */
export function escortNear(trip, here, since, t) {
  if (!here || !Number.isFinite(t) || !Number.isFinite(since)) return since;
  // A lodged party sits up to a pixel off its inn, so it counts as near anyone on the inn map pixel.
  const near = (/** @type {number} */ m) => {
    const at = partyAt(trip, m);
    if (at.inn && Math.floor(here.x / NATIVE_PIXEL) === at.inn.px && 499 - Math.floor(here.z / NATIVE_PIXEL) === at.inn.py) return true;
    return at.x != null && Math.hypot(here.x - /** @type {number} */ (at.x), here.z - /** @type {number} */ (at.z)) / NATIVE_PER_M <= ESCORT_KEEP_M;
  };
  let last = since;
  for (let m = since; ; m = Math.min(t, m + ESCORT_SAMPLE_MIN)) {
    if (m - last > ESCORT_LOST_MIN) return last;
    if (near(m)) last = Math.max(last, m);
    if (m >= t) return last;
  }
}

export const WARE_KEY = '_lwWare';
