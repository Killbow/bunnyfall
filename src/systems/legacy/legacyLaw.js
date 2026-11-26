// @ts-check
// The account server imports this module to validate lineage copies, so it stays a leaf with no client-only
// imports. `family.js` and `heirloom.js` read their bounds from here.

import { SKILL_COUNT } from '../../characters/skills.js';

export const BLOOD_MAX = 3;
export const HEARTH_MAX = 3;
// `ESTATE_MAX` equals `REALM_BIRTH_WEALTH_MAX` minus `STARTING_GOLD`, restated here so this leaf imports no net
// code. Keep the three in sync.
export const ESTATE_SHARE = 0.25;
export const ESTATE_MAX = 9_900;
export const REMAINS_GOLD_SHARE = 0.1;
export const REMAINS_GOLD_MAX = 2_500;
export const BLOOD_KEYS_MAX = 8;

const whole = (/** @type {unknown} */ v, /** @type {number} */ max) => Number.isInteger(v) && /** @type {number} */ (v) >= 0 && /** @type {number} */ (v) <= max;
const isObject = (/** @type {unknown} */ v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * @param {any} record
 * @param {any} [stored]
 * @returns {string[]}
 */
export function lineageLawFindings(record, stored = null) {
  const out = new Set();
  const people = Array.isArray(record?.people) ? record.people : [];
  for (const p of people) {
    if (p?.blood !== undefined) {
      if (!isObject(p.blood) || Object.keys(p.blood).length > BLOOD_KEYS_MAX || !Object.values(p.blood).every((v) => whole(v, BLOOD_MAX))) out.add('blood');
    }
    if (p?.hearth !== undefined) {
      if (!isObject(p.hearth) || !Object.entries(p.hearth).every(([k, v]) => /^(0|[1-9]\d?)$/.test(k) && Number(k) < SKILL_COUNT && whole(v, HEARTH_MAX))) out.add('hearth');
    }
  }
  if (record?.pending != null && !whole(record.pending.estate ?? 0, ESTATE_MAX)) out.add('estate');
  if (stored && Array.isArray(stored.people)) {
    const byId = new Map(people.map((/** @type {any} */ p) => [p?.id, p]));
    for (const was of stored.people) {
      const now = byId.get(was?.id);
      if (!now) { out.add('member'); continue; }
      if (was.died && !now.died) out.add('death');
      if (was.retired != null && now.retired == null) out.add('retired');
    }
    const rows = new Set((Array.isArray(record?.remains) ? record.remains : []).map((/** @type {any} */ r) => r?.id));
    for (const r of Array.isArray(stored.remains) ? stored.remains : []) if (!rows.has(r?.id)) out.add('remains');
  }
  return [...out];
}
