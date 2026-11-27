// @ts-check
// World of Daggerfall camps shared across the clients of a room.

export const WOD_SITE_RE = /^-?\d{1,5},-?\d{1,5}:(?:\d{1,10}(?:\.\d{1,3})?|hold|reach\.\d{1,9}\.[0-2]|rite\.\d{1,9}|star\.\d{1,10}\.[0-2](?:\.[mc])?)$/;
export const riteSiteId = (px, py, day) => `${px},${py}:rite.${day}`;
export const isRiteSite = (site) => typeof site === 'string' && /:rite(?:\.\d{1,9})?$/.test(site);
export const starSiteId = (px, py, n, k, part = '') => `${px},${py}:star.${n}.${k}${part ? `.${part}` : ''}`;
export const WOD_SITES_MAX = 64;
export const WOD_CAMP_PUPPETS_MAX = 16;
export const WOD_STAR_PUPPETS_MAX = 45;
export const isStarSite = (site) => typeof site === 'string' && /:star\.\d{1,10}\.[0-2](?:\.[mc])?$/.test(site);
export const WOD_CLAIM_WINDOW_MS = 5000;

export const WOD_AGE_MAX = 86400000;

/**
 * @param {number} px
 * @param {number} py
 * @param {number|string} oid
 * @param {number} [n]
 */
export const wodSiteId = (px, py, oid, n = 0) => `${px},${py}:${oid}${n > 0 ? `.${n}` : ''}`;

export function validSites(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [], seen = new Set();
  for (const e of raw) {
    if (out.length >= WOD_SITES_MAX) break;
    if (!Array.isArray(e) || e.length !== 2) continue;
    const [s, age] = e;
    if (typeof s !== 'string' || !WOD_SITE_RE.test(s) || seen.has(s) || !Number.isFinite(age)) continue;
    seen.add(s);
    out.push([s, Math.max(0, Math.min(WOD_AGE_MAX, age))]);
  }
  return out;
}

export function validSiteTags(raw) {
  const out = new Map();
  if (!Array.isArray(raw)) return out;
  for (const e of raw) {
    if (out.size >= WOD_SITES_MAX) break;
    if (!Array.isArray(e) || e.length !== 2) continue;
    const [i, s] = e;
    if (Number.isInteger(i) && i >= 0 && typeof s === 'string' && WOD_SITE_RE.test(s)) out.set(i, s);
  }
  return out;
}

/**
 * @param {string} mine
 * @param {string} theirs
 * @param {number} myAge
 * @param {?number} theirAge
 * @returns {boolean}
 */
export function yieldsTo(mine, theirs, myAge, theirAge) {
  if (typeof mine !== 'string' || typeof theirs !== 'string' || !mine || !theirs || mine === theirs) return false;
  if (!Number.isFinite(theirAge) || !Number.isFinite(myAge)) return false;
  if (Math.abs(myAge - theirAge) <= WOD_CLAIM_WINDOW_MS) return theirs < mine;
  return theirAge > myAge;
}
