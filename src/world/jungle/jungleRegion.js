// @ts-check
// Signed distance from the Bantha edge, read lazily per pixel and moved by integer-hashed noise, so the terrain
// worker and the main thread compute the same depth. A worker job carries only the 3x3 distances of a pixel.
import { ecoNoise, ecoOrigin } from '../ecotone.js';
import { banthaAreaHas } from './banthaArea.js';

export const JUNGLE_FIELD_REACH = 6;
const PIXEL_M = 819.2;
const TILE_M = 6.4;
export const JUNGLE_WANDER = Object.freeze({
  octaves: Object.freeze([Object.freeze({ cell: 64, amp: 150 }), Object.freeze({ cell: 8, amp: 40 })]),
  salt: 467,
});
export const JUNGLE_EDGE = Object.freeze({ out: 60, in: 480 });

const smoothstep = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** @param {{ width: number, height: number, insideAt?: (x: number, y: number) => boolean, reach?: number }} o */
export function jungleField({ width, height, insideAt = banthaAreaHas, reach = JUNGLE_FIELD_REACH }) {
  const side = new Uint8Array(width * height).fill(2);
  const dist = new Float32Array(width * height).fill(NaN);
  const far = reach + 0.5;
  const sideAt = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    const i = y * width + x;
    let v = side[i];
    if (v === 2) side[i] = v = insideAt(x, y) ? 1 : 0;
    return v;
  };
  const toOther = (me, x, y, dx, dy, best) => {
    if (sideAt(x + dx, y + dy) === me) return best;
    return Math.min(best, Math.hypot(Math.max(Math.abs(dx) - 0.5, 0), Math.max(Math.abs(dy) - 0.5, 0)));
  };
  return {
    width, height, reach,
    inside: sideAt,
    at(x, y) {
      if (x < 0 || y < 0 || x >= width || y >= height) return -far;
      const i = y * width + x;
      const known = dist[i];
      if (known === known) return known;
      const me = sideAt(x, y);
      let best = far;
      for (let r = 1; r <= reach && r - 0.5 < best; r++) {
        for (let k = -r; k <= r; k++) { best = toOther(me, x, y, k, -r, best); best = toOther(me, x, y, k, r, best); }
        for (let k = -r + 1; k <= r - 1; k++) { best = toOther(me, x, y, -r, k, best); best = toOther(me, x, y, r, k, best); }
      }
      dist[i] = me ? best : -best;
      // Return the stored float32 value so the first read matches every later read.
      return dist[i];
    },
  };
}

const _fields = new WeakMap();
/**
 * @param {object} maps
 * @param {number} width
 * @param {number} height
 * @param {(x: number, y: number) => boolean} [insideAt]
 */
export function jungleFieldOf(maps, width, height, insideAt = banthaAreaHas) {
  let f = _fields.get(maps);
  if (!f) { f = jungleField({ width, height, insideAt }); _fields.set(maps, f); }
  return f;
}

/**
 * @param {ReturnType<typeof jungleField>} field
 * @param {number} px
 * @param {number} py
 * @param {any[]} [out]
 */
export function jungleNine(field, px, py, out = new Array(9)) {
  if (!field) return null;
  const far = -(field.reach + 0.5);
  let any = false;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const v = field.at(px + dx, py - dz);
      out[(dz + 1) * 3 + dx + 1] = v;
      if (v > far) any = true;
    }
  }
  return any ? out : null;
}

/**
 * @param {ArrayLike<number>} nine
 * @param {number} x
 * @param {number} z
 */
export function jungleSignedAt(nine, x, z) {
  const u = x / PIXEL_M, v = z / PIXEL_M;
  const i = u < 0.5 ? -1 : 0, j = v < 0.5 ? -1 : 0;
  const fx = u - 0.5 - i, fz = v - 0.5 - j;
  const a = nine[(j + 1) * 3 + i + 1], b = nine[(j + 1) * 3 + i + 2], c = nine[(j + 2) * 3 + i + 1], e = nine[(j + 2) * 3 + i + 2];
  return ((a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + e * fx) * fz) * PIXEL_M;
}

/**
 * @param {number} px
 * @param {number} py
 * @param {ArrayLike<number>} nine
 * @param {number} x
 * @param {number} z
 */
export function jungleDepthAt(px, py, nine, x, z) {
  const origin = ecoOrigin(px, py), tx = x / TILE_M, tz = z / TILE_M;
  let w = 0;
  JUNGLE_WANDER.octaves.forEach((o, k) => { w += o.amp * (2 * ecoNoise(origin, tx, tz, o.cell, JUNGLE_WANDER.salt + k) - 1); });
  return jungleSignedAt(nine, x, z) + w;
}

export const jungleShare = (depth) => smoothstep(-JUNGLE_EDGE.out, JUNGLE_EDGE.in, depth);

export function jungleFloorDraw(wx, wz) {
  let h = (Math.imul(Math.round(wx * 8), 0x27d4eb2d) ^ Math.imul(Math.round(wz * 8), 0x165667b1) ^ 0x464c5252) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0; h ^= h >>> 15;
  return (h >>> 8) / 16777216;
}

export const JUNGLE_AIR_EDGE = Object.freeze({ out: 2000, in: 4000 });
export const jungleAirShare = (depth) => smoothstep(-JUNGLE_AIR_EDGE.out, JUNGLE_AIR_EDGE.in, depth);

export const JUNGLE_WANDER_MAX = JUNGLE_WANDER.octaves.reduce((s, o) => s + o.amp, 0);
