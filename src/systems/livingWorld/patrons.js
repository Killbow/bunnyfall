// @ts-check
// The service sends only a seed and a minute for each sale (net/patronLaw.js). `patronOf` must stay deterministic
// over the census so every client deals the sale to the same resident.
import { DAY_MIN, PATRON_BROWSE_SHARE } from './dayPlan.js';
export { PATRON_BROWSE_SHARE };

export const PATRON_STAY_MIN = 25;

/**
 * @param {number} seed
 * @param {readonly any[]} residents
 * @returns {any | null}
 */
export function patronOf(seed, residents) {
  const pool = (residents ?? []).filter((r) => r && r.roll === 'h' && !r.guard).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return pool.length ? pool[(seed >>> 0) % pool.length] : null;
}

export const PATRON_OPEN_H = Object.freeze([9, 17]);
// Online a living day is one real hour and the service reports only whole past hours. A sale is walked two living
// days later so every client knows it in time.
export const PATRON_DELAY_DAYS = 2;

/**
 * @param {readonly { door: number, t: number, seed: number }[]} told
 * @param {number} day
 * @param {readonly any[]} residents
 */
export function patronVisits(told, day, residents) {
  const shift = PATRON_DELAY_DAYS * DAY_MIN;
  const D0 = day * DAY_MIN + 4 * 60 - shift, D1 = D0 + DAY_MIN;
  const open = PATRON_OPEN_H[0] * 60, span = (PATRON_OPEN_H[1] - PATRON_OPEN_H[0]) * 60;
  const out = [];
  for (const v of told ?? []) {
    if (!(v.t >= D0 && v.t < D1)) continue;
    const res = patronOf(v.seed, residents);
    const tod = v.t + shift - day * DAY_MIN;
    if (res) out.push({ resId: res.id, door: v.door, from: day * DAY_MIN + open + ((((tod - open) % span) + span) % span), dur: PATRON_STAY_MIN });
  }
  return out;
}

/**
 * @param {any} res
 * @param {string} town
 */
export const patronWords = (res, town) => (res?.name ? `${res.name}${town ? ` of ${town}` : ''}` : `a townsperson${town ? ` of ${town}` : ''}`);
