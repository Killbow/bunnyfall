// @ts-check
import { LOCATION_TYPES } from '../formats/mapsFile.js';
import { ROAD_WEIGHT } from '../world/gothwayBoards.js';
import { WARDEN_ROAD_MS, WARDEN_LAND_REACH, WARDEN_TOWN_MAX, parkSpotOf } from '../net/wire.js';

export const WARDEN_VENDOR = 'WagonWarden';
export const WARDEN_TOWN_TYPES = Object.freeze([LOCATION_TYPES.TownCity, LOCATION_TYPES.TownHamlet, LOCATION_TYPES.TownVillage]);
export const isWardenTown = (/** @type {any} */ locationType) => WARDEN_TOWN_TYPES.includes(locationType);
export const WARDEN_LAND_PAST = 40;
export const WARDEN_LAND_SCATTER = 12;
export const WARDEN_ROAD_SHARE = 1 / 3;
export const WARDEN_FOOT_STEPS = 3;
// Wide because the drawn wagon and the saved axle anchor differ after the ground solve.
export const WARDEN_SAME_NATIVES = 400;
export const WARDEN_HORSE_BY_NATIVES = 480;
export const horseThrownWith = (/** @type {number[]|null} */ wagon, /** @type {number[]|null} */ horse) =>
  !!wagon && !!horse && Math.abs(horse[0] - wagon[0]) <= WARDEN_HORSE_BY_NATIVES && Math.abs(horse[1] - wagon[1]) <= WARDEN_HORSE_BY_NATIVES;
export const WARDEN_TEXT = Object.freeze({
  thrown: (/** @type {string} */ town) => `The town watch has thrown your wagon out of ${town || 'town'}!`,
  fetch: 'It lies past the edge of town. Walk out to it, or summon it.',
});

/**
 * @param {(gx: number, gy: number) => number} weightAt
 * @param {number} width
 * @param {number} height
 * @param {number} cell
 * @param {number[]} at
 * @param {number[]} forward
 * @param {number[]} half
 */
export function footprintRoadShare(weightAt, width, height, cell, at, forward, half) {
  const fl = Math.sqrt(forward[0] * forward[0] + forward[1] * forward[1]) || 1;
  const fx = forward[0] / fl, fz = forward[1] / fl;
  const n = WARDEN_FOOT_STEPS;
  let road = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const u = n > 1 ? (i / (n - 1)) * 2 - 1 : 0, v = n > 1 ? (j / (n - 1)) * 2 - 1 : 0;
      const x = at[0] + u * half[0] * fz + v * half[1] * fx, z = at[1] - u * half[0] * fx + v * half[1] * fz;
      const gx = Math.floor(x / cell), gy = Math.floor(z / cell);
      if (gx >= 0 && gy >= 0 && gx < width && gy < height && weightAt(gx, gy) === ROAD_WEIGHT) road++;
    }
  }
  return road / (n * n);
}

/**
 * @param {number[]} rect
 * @param {number[]} at
 * @param {number} [stray]
 */
export function landingsOf(rect, at, stray = 0) {
  const [x0, z0, x1, z1] = rect;
  const d = [at[0] - x0, x1 - at[0], at[1] - z0, z1 - at[1]];
  const s = Math.max(-1, Math.min(1, Number.isFinite(stray) ? stray : 0)) * WARDEN_LAND_SCATTER;
  const along = (/** @type {number} */ v, /** @type {number} */ lo, /** @type {number} */ hi) => Math.max(lo, Math.min(hi, v + s));
  const out = [[x0 - WARDEN_LAND_PAST, along(at[1], z0, z1)], [x1 + WARDEN_LAND_PAST, along(at[1], z0, z1)], [along(at[0], x0, x1), z0 - WARDEN_LAND_PAST], [along(at[0], x0, x1), z1 + WARDEN_LAND_PAST]];
  return [0, 1, 2, 3].sort((i, j) => d[i] - d[j] || i - j).map((i) => out[i]);
}
export const landingOf = (/** @type {number[]} */ rect, /** @type {number[]} */ at, stray = 0) => landingsOf(rect, at, stray)[0];
export function strayOf(/** @type {number[]} */ anchor) {
  let h = (Math.imul(anchor[0] | 0, 73856093) ^ Math.imul(anchor[1] | 0, 19349663)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = (h ^ (h >>> 12)) >>> 0;
  return (h / 0xffffffff) * 2 - 1;
}

/**
 * @param {number[]} a
 * @param {number} at
 * @param {number|null} [tw]
 * @param {boolean} [rd]
 * @param {number[]|null} [ly]
 */
export function wardenStamp(a, at, tw = null, rd = false, ly = null) {
  const town = tw !== null && Number.isInteger(tw) && tw >= 0 && tw <= WARDEN_TOWN_MAX && Array.isArray(ly);
  return { a: [a[0], a[1]], at, tw: town ? tw : null, rd: town && rd === true, ly: town && ly ? [ly[0], ly[1]] : null };
}
export function validWardenStamp(/** @type {any} */ s) {
  const pt = (/** @type {any} */ p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  if (!s || typeof s !== 'object' || !pt(s.a) || !Number.isFinite(s.at)) return null;
  return wardenStamp(s.a, s.at, Number.isInteger(s.tw) ? s.tw : null, s.rd === true, pt(s.ly) ? s.ly : null);
}
// Compares exactly, since a parked anchor never drifts.
export const stampFits = (/** @type {any} */ stamp, /** @type {number[]|null} */ anchor) => !!stamp && !!anchor && stamp.a[0] === anchor[0] && stamp.a[1] === anchor[1];
/**
 * @param {any} stamp
 * @param {number[]} anchor
 */
export function wardenWordOf(stamp, anchor) {
  if (!stampFits(stamp, anchor) || stamp.tw === null || !stamp.ly) return null;
  if (Math.abs(stamp.ly[0] - anchor[0]) > WARDEN_LAND_REACH || Math.abs(stamp.ly[1] - anchor[1]) > WARDEN_LAND_REACH) return null;
  return { ly: [stamp.ly[0], stamp.ly[1]], tw: stamp.tw, ...(stamp.rd ? { rd: 1 } : {}) };
}
export function offlineDue(/** @type {any} */ stamp, /** @type {number[]} */ anchor, /** @type {number} */ now) {
  return stampFits(stamp, anchor) && stamp.rd === true && !!stamp.ly && now - stamp.at >= WARDEN_ROAD_MS;
}
export function thrownRecord(/** @type {any} */ r) {
  const from = parkSpotOf(r), to = r?.ly;
  if (!Array.isArray(r?.w) || !from || !Array.isArray(to) || to.length !== 2 || !to.every(Number.isFinite)) return r;
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const out = { ...r, w: [...r.w] };
  out.w[1] += dx; out.w[3] += dz;
  if (Array.isArray(r.h) && horseThrownWith(from, [r.h[0], r.h[2]])) { out.h = [...r.h]; out.h[0] += dx; out.h[2] += dz; }
  return out;
}
export function thrownTo(/** @type {number[]} */ anchor, /** @type {number[]} */ from, /** @type {number[]} */ to) {
  if (Math.abs(anchor[0] - from[0]) > WARDEN_SAME_NATIVES || Math.abs(anchor[1] - from[1]) > WARDEN_SAME_NATIVES) return null;
  return [anchor[0] + to[0] - from[0], anchor[1] + to[1] - from[1]];
}
