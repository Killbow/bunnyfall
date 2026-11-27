// @ts-check
import { cromwarkDesolateAt } from './cromwarkTowns.js';
import { wildRingAt, wildMaskOf } from '../wildZone.js';

export const BURNT_SHARE = Object.freeze([0.3, 0.48, 0.64, 0.8]);
export const SCORCH = Object.freeze([0.4, 0.6, 0.78, 0.92]);
export const wasteScorch = (/** @type {number} */ ring) => (ring >= 1 ? SCORCH[Math.min(4, ring) - 1] : 0);
export const DEAD_TREE_BASE = 508;
export const DEAD_TREE_RECORDS = Object.freeze([16, 18, 24, 25, 30]);

export const DEAD_TREE_SHARE = Object.freeze([0.3, 0.62, 0.9, 1]);

let _maps = null;
export const setWasteMaps = (/** @type {any} */ maps) => { _maps = maps ?? null; };

export function wasteRing(/** @type {any} */ maps, /** @type {number} */ px, /** @type {number} */ py) {
  const m = maps ?? _maps;
  if (!cromwarkDesolateAt(m, px, py)) return 0;
  return wildRingAt(px, py, wildMaskOf(m));
}

const hash = (/** @type {number} */ x, /** @type {number} */ y) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const smooth = (/** @type {number} */ t) => t * t * (3 - 2 * t);
function value(/** @type {number} */ x, /** @type {number} */ y) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = smooth(x - x0), fy = smooth(y - y0);
  const a = hash(x0, y0), b = hash(x0 + 1, y0), c = hash(x0, y0 + 1), d = hash(x0 + 1, y0 + 1);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
export function burnNoise(/** @type {number} */ gx, /** @type {number} */ gy) {
  return 0.55 * value(gx / 46, gy / 46) + 0.3 * value(gx / 17 + 31, gy / 17 + 7) + 0.15 * value(gx / 6 + 11, gy / 6 + 53);
}

export function wasteGroundCoverStands(ring, px, py, x, z) {
  if (!(ring > 0)) return true;
  return burnNoise(px * 128 + x / 6.4, (py + 1) * 128 - z / 6.4) < .55 - Math.min(4, ring) * .065;
}

export function burnTilemap(/** @type {Uint8Array} */ bytes, /** @type {number} */ px, /** @type {number} */ py, /** @type {number} */ ring, dim = 128) {
  if (ring < 1) return 0;
  const share = BURNT_SHARE[Math.min(4, ring) - 1];
  const cut = 1 - share;
  const lo = 0.28, hi = 0.72, thr = lo + (hi - lo) * cut;
  let n = 0;
  for (let cy = 0; cy < dim; cy++) {
    for (let cx = 0; cx < dim; cx++) {
      const i = cy * dim + cx, rec = bytes[i] >> 2;
      if (rec !== 2) continue;
      const gx = px * dim + cx, gy = py * dim + cy;
      if (burnNoise(gx, gy) < thr) continue;
      const stone = ring >= 3 && hash(gx, gy) < 0.1 * (ring - 2);
      bytes[i] = ((stone ? 3 : 1) << 2) | (bytes[i] & 3);
      n++;
    }
  }
  return n;
}

export function treeStandsDead(/** @type {number} */ ring, /** @type {number} */ x, /** @type {number} */ z) {
  if (ring < 1) return false;
  return hash(Math.round(x * 4), Math.round(z * 4)) < DEAD_TREE_SHARE[Math.min(4, ring) - 1];
}

export function deadTreeOf(/** @type {number} */ x, /** @type {number} */ z) {
  const i = Math.floor(hash(Math.round(z * 4) + 17, Math.round(x * 4) - 5) * DEAD_TREE_RECORDS.length);
  return { base: DEAD_TREE_BASE, record: DEAD_TREE_RECORDS[Math.min(DEAD_TREE_RECORDS.length - 1, i)] };
}
