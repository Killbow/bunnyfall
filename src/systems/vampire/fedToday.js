// @ts-check
// Who a vampire has fed on today, saved on the curse entry as the optional `fedToday: { day, ids }`. A save without it,
// or with a bad value or an earlier day, reads as nobody fed today.

import { liveVampirism } from '../../afflictions/racialLive.js';
import { MINUTES_PER_DAY } from '../../world/gameDate.js';

export const FED_TODAY_MAX = 200;
const ID_CHARS_MAX = 120;

/** @param {any} raw @param {number} day @returns {string[]} */
export function decodeFedToday(raw, day) {
  if (!raw || typeof raw !== 'object' || Number(raw.day) !== day || !Array.isArray(raw.ids)) return [];
  const ids = raw.ids.filter((id) => (typeof id === 'string' || typeof id === 'number') && String(id) !== '').map((id) => String(id).slice(0, ID_CHARS_MAX));
  return [...new Set(ids)].slice(-FED_TODAY_MAX);
}

/** @param {number} day @param {string[]} ids */
export const encodeFedToday = (day, ids) => ({ day, ids: ids.slice(-FED_TODAY_MAX) });

const dayOf = (/** @type {number} */ now) => Math.floor(now / MINUTES_PER_DAY);

/** @param {any} entity @param {string} id @param {number} now */
export function fedToday(entity, id, now) {
  const entry = liveVampirism(entity);
  return !!entry && decodeFedToday(entry.fedToday, dayOf(now)).includes(String(id).slice(0, ID_CHARS_MAX));
}

/** @param {any} entity @param {string} id @param {number} now */
export function markFedToday(entity, id, now) {
  const entry = liveVampirism(entity);
  if (!entry) return;
  const day = dayOf(now), ids = decodeFedToday(entry.fedToday, day), key = String(id).slice(0, ID_CHARS_MAX);
  if (!ids.includes(key)) ids.push(key);
  entry.fedToday = encodeFedToday(day, ids);
}

/** On load: keeps only today's valid entries, and drops the field when none are left.
 *  @param {any} entity @param {number} now */
export function normalizeFedToday(entity, now) {
  for (const a of entity?.activeEffects ?? []) {
    if (a?.kind !== 'racialOverride' || !('fedToday' in a)) continue;
    const day = dayOf(Number(now) || 0), ids = decodeFedToday(a.fedToday, day);
    if (ids.length) a.fedToday = encodeFedToday(day, ids);
    else delete a.fedToday;
  }
}
