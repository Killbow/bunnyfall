// @ts-check
// BUNNYFALL (2026-11-05, the owner: "the area has to look desolated, dead trees the closer you get, massive chunks of burned
// land, basically its a warzone"): THE REACH'S WASTE. A leaf the pixel build reads for map pixels inside the zone: the ring
// (1 foothills to 4 the heart) says how much of the ground is burnt and how many of the trees stand dead. Seeded by the
// world's own coordinates, so every client builds the same waste and a burnt stretch runs on across the pixel seams.
import { cromwarkDesolateAt } from './cromwarkTowns.js';
import { wildRingAt, wildMaskOf } from './wildZone.js';

/** Share of the ground that is burnt, by ring. */
export const BURNT_SHARE = Object.freeze([0.18, 0.34, 0.52, 0.72]);
/** Share of the trees that stand dead, by ring. */
export const DEAD_TREE_SHARE = Object.freeze([0.3, 0.62, 0.9, 1]);

let _maps = null;
export const setWasteMaps = (/** @type {any} */ maps) => { _maps = maps ?? null; };

/** The waste's ring at map pixel (px, py): 1 to 4, or 0 outside the reach. */
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
/** Burn noise 0..1 at a world tile (gx, gy): wide scars with ragged edges. */
export function burnNoise(/** @type {number} */ gx, /** @type {number} */ gy) {
  return 0.55 * value(gx / 46, gy / 46) + 0.3 * value(gx / 17 + 31, gy / 17 + 7) + 0.15 * value(gx / 6 + 11, gy / 6 + 53);
}

/** Burn the pixel's grass in place: `bytes` the pixel's 128 x 128 tilemap (record << 2 | turn). Grass (record 2) in a scar
 *  turns to dirt (1), stone-flecked in the heart. Returns how many tiles it turned. */
export function burnTilemap(/** @type {Uint8Array} */ bytes, /** @type {number} */ px, /** @type {number} */ py, /** @type {number} */ ring, dim = 128) {
  if (ring < 1) return 0;
  const share = BURNT_SHARE[Math.min(4, ring) - 1];
  const cut = 1 - share;   // noise runs about 0.2..0.8, so the share is read off a stretched band
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

/** Does the tree at world position (x, z) in pixel (px, py) stand dead? Seeded by its place, never by the clock. */
export function treeStandsDead(/** @type {number} */ ring, /** @type {number} */ x, /** @type {number} */ z) {
  if (ring < 1) return false;
  return hash(Math.round(x * 4), Math.round(z * 4)) < DEAD_TREE_SHARE[Math.min(4, ring) - 1];
}
