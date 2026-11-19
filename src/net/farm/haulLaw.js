// @ts-check
// BUNNYFALL FARM EXPANSION, PHASE 1 (docs/FARM-EXPANSION.md section 3.3): SACKS AND THE WAGON. A harvest still puts its
// crops into the Company Stores at once, as it always has - nothing waits on anyone. It also leaves the crops' SACKS at
// the bed, for SACK_LIFE: a member may carry them to the factor's wagon, which loads them as this week's CARGO (drawn on
// the cart, read by the order post and the ledger). Hauling is care work: a hauled sack's bed counts toward the day's
// chore as working it does. A sack nobody carries simply goes, its crops already in the Stores.
// Pure: both ends read it; the service commits it with the garden's revision (server-account/src/farmGardens.js).
import { farmWeek } from '../farmProgressLaw.js';
import { FARM_SEED_IDS } from './cropLaw.js';   // every crop's sacks, the climate crops' too

/** How long a sack waits at its bed, s. */
export const SACK_LIFE_S = 15 * 60;
/** The most sacks a farm keeps lying about; the oldest go first. */
export const SACKS_MAX = 64;
/** The most sacks one member carries at once. */
export const CARRY_MAX = 4;
/** How near a sack is picked up with the one clicked, m. */
export const SACK_GATHER_M = 2.2;

/** The sacks still lying at their beds at `nowS`. */
export const liveSacks = (garden, nowS) => (garden?.sacks ?? []).filter((s) => nowS - s.t < SACK_LIFE_S);

/** This week's cargo on the wagon: { week, grain, mushroom, herbs }, zero in a new week. */
export function wagonCargo(garden, nowS) {
  const c = garden?.cargo, week = farmWeek(nowS), zero = Object.fromEntries(FARM_SEED_IDS.map((k) => [k, 0]));
  return c && c.week === week ? { ...zero, ...c } : { week, ...zero };
}
export const cargoTotal = (cargo) => FARM_SEED_IDS.reduce((n, k) => n + (cargo[k] ?? 0), 0);

/** Whether a garden's sacks and cargo are well formed (absent is fine: older gardens have neither). */
export function validHaul(garden) {
  const int = (n, max) => Number.isSafeInteger(n) && n >= 0 && n <= max;
  if (garden.sacks !== undefined && !(Array.isArray(garden.sacks) && garden.sacks.length <= SACKS_MAX && garden.sacks.every((s) =>
    s && int(s.id, 2147483647) && FARM_SEED_IDS.includes(s.crop) && int(s.qty, 1000) && int(s.bed, 65535) && int(s.t, 2 ** 40)))) return false;
  if (garden.cargo !== undefined && !(garden.cargo && int(garden.cargo.week, 2 ** 31) && Object.keys(garden.cargo).every((k) => k === 'week' || (FARM_SEED_IDS.includes(k) && int(garden.cargo[k], 2147483647))))) return false;
  return garden.nextSack === undefined || int(garden.nextSack, 2147483647);
}

/** The harvest's sacks laid down on `next` (mutated): one a bed harvested, the oldest dropped past SACKS_MAX. */
export function laySacks(next, harvests, nowS) {
  if (!harvests.length) return;
  const sacks = liveSacks(next, nowS);
  let id = next.nextSack ?? 1;
  for (const h of harvests) { sacks.push({ id, crop: h.crop, qty: h.qty, bed: h.bed, t: nowS }); id = id >= 2147483647 ? 1 : id + 1; }
  next.sacks = sacks.slice(-SACKS_MAX); next.nextSack = id;
}

/**
 * HAUL: the sacks `ids` loaded onto the wagon. Each must still lie at its bed; at most CARRY_MAX. Answers the next
 * garden and the beds hauled from (care work), or an error.
 */
export function stepFarmHaul(garden, ids, nowS) {
  if (!Array.isArray(ids) || !ids.length || ids.length > CARRY_MAX || new Set(ids).size !== ids.length || !ids.every((i) => Number.isSafeInteger(i))) return { error: 'farm-haul-bad' };
  const live = liveSacks(garden, nowS), taken = live.filter((s) => ids.includes(s.id));
  if (taken.length !== ids.length) return { error: 'farm-haul-gone' };
  const next = structuredClone(garden), cargo = { ...wagonCargo(garden, nowS) };
  for (const s of taken) cargo[s.crop] = Math.min(2147483647, cargo[s.crop] + s.qty);
  next.sacks = live.filter((s) => !ids.includes(s.id)); next.cargo = cargo;
  return { garden: next, worked: [...new Set(taken.map((s) => s.bed))], hauled: taken.reduce((n, s) => n + s.qty, 0) };
}
