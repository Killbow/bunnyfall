// Must stay term-for-term identical to render/ecotoneGlsl.js. Shares depend only on world position, so both pixels
// that draw a point agree, and lattice cells divide the 128 tiles of a pixel so indices stay exact integers.

export const ECOTONE = Object.freeze({
  band: 96,
  warp: Object.freeze([Object.freeze({ cell: 64, amp: 48 }), Object.freeze({ cell: 8, amp: 16 })]),
  patch: Object.freeze([Object.freeze({ cell: 8, weight: 0.65 }), Object.freeze({ cell: 2, weight: 0.35 })]),
  stretch: 2,
  edge: 0.06,
  // Tile rows count from this map row north of the map, so every lattice index stays positive.
  row0: 512,
  saltX: 101,
  saltZ: 211,
});
const PIXEL_M = 819.2;
const TILE_M = 6.4;
const HALF_M = PIXEL_M / 2;
export const ECOTONE_REACH = ECOTONE.band + ECOTONE.warp.reduce((s, o) => s + o.amp, 0);

export function ecoHash(ix, iz, salt) {
  let h = (Math.imul(ix, 0x8da6b343) ^ Math.imul(iz, 0xd8163841) ^ Math.imul(salt, 0xcb1ab31f)) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h >>> 8) / 16777216;
}

export const ecoOrigin = (px, py) => [px * 128, (ECOTONE.row0 - py) * 128];

/** @param {number[]} origin */
export function ecoNoise(origin, tx, tz, cell, salt) {
  const qx = tx / cell, qz = tz / cell;
  const fx0 = Math.floor(qx), fz0 = Math.floor(qz);
  const ix = origin[0] / cell + fx0, iz = origin[1] / cell + fz0;
  const fx = qx - fx0, fz = qz - fz0;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = ecoHash(ix, iz, salt), b = ecoHash(ix + 1, iz, salt), c = ecoHash(ix, iz + 1, salt), d = ecoHash(ix + 1, iz + 1, salt);
  const top = a + (b - a) * ux, bot = c + (d - c) * ux;
  return top + (bot - top) * uz;
}

const smoothstep = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function ecoShare(origin, u, tx, tz, salt) {
  if (u <= -ECOTONE_REACH) return 0;
  if (u >= ECOTONE_REACH) return 1;
  const [w0, w1] = ECOTONE.warp, [p0, p1] = ECOTONE.patch, e = ECOTONE.edge;
  const d = u + w0.amp * (2 * ecoNoise(origin, tx, tz, w0.cell, salt) - 1) + w1.amp * (2 * ecoNoise(origin, tx, tz, w1.cell, salt + 1) - 1);
  const p = Math.min(1, Math.max(0, 0.5 + d / (2 * ECOTONE.band)));
  const n0 = p0.weight * ecoNoise(origin, tx, tz, p0.cell, salt + 2) + p1.weight * ecoNoise(origin, tx, tz, p1.cell, salt + 3);
  const n = Math.min(1, Math.max(0, (n0 - 0.5) * ECOTONE.stretch + 0.5));
  return smoothstep(-e, e, -e + (1 + 2 * e) * p - n);
}

/**
 * @param {number} px
 * @param {number} py
 * @param {number} x
 * @param {number} z
 * @param {{ sx: number, sz: number, own: number, nx: number, nz: number, nd: number }} [out]
 * @param {number} [axes]
 */
export function ecotoneShares(px, py, x, z, out = { sx: 0, sz: 0, own: 1, nx: 0, nz: 0, nd: 0 }, axes = 3) {
  const sx = x < HALF_M ? -1 : 1, sz = z < HALF_M ? -1 : 1;
  const ux = sx < 0 ? x : x - PIXEL_M, uz = sz < 0 ? z : z - PIXEL_M;
  const askX = (axes & 1) && Math.abs(ux) < ECOTONE_REACH, askZ = (axes & 2) && Math.abs(uz) < ECOTONE_REACH;
  let ox = 1, oz = 1;
  if (askX || askZ) {
    const origin = ecoOrigin(px, py), tx = x / TILE_M, tz = z / TILE_M;
    if (askX) { const s = ecoShare(origin, ux, tx, tz, ECOTONE.saltX); ox = sx < 0 ? s : 1 - s; }
    if (askZ) { const s = ecoShare(origin, uz, tx, tz, ECOTONE.saltZ); oz = sz < 0 ? s : 1 - s; }
  }
  out.sx = sx; out.sz = sz;
  out.own = ox * oz; out.nx = (1 - ox) * oz; out.nz = ox * (1 - oz); out.nd = (1 - ox) * (1 - oz);
  return out;
}

const _shares = { sx: 0, sz: 0, own: 1, nx: 0, nz: 0, nd: 0 };
/**
 * `key` must return the pixel climate itself for a neighbor off the map; a tie goes to the pixel climate.
 * @param {number} px
 * @param {number} py
 * @param {number} x
 * @param {number} z
 * @param {(dx: number, dz: number) => any} key
 */
export function ecotoneOwner(px, py, x, z, key) {
  const sx = x < HALF_M ? -1 : 1, sz = z < HALF_M ? -1 : 1;
  const k0 = key(0, 0), kx = key(sx, 0), kz = key(0, sz), kd = key(sx, sz);
  const axes = (kx === k0 && kd === kz ? 0 : 1) | (kz === k0 && kd === kx ? 0 : 2);
  if (!axes) return [0, 0];
  const s = ecotoneShares(px, py, x, z, _shares, axes);
  if (s.own >= 0.5) return [0, 0];
  const cands = [[0, 0, s.own], [s.sx, 0, s.nx], [0, s.sz, s.nz], [s.sx, s.sz, s.nd]];
  const sums = new Map();
  for (const [dx, dz, w] of cands) {
    const k = key(dx, dz);
    sums.set(k, (sums.get(k) ?? 0) + w);
  }
  const ownKey = key(0, 0);
  let best = ownKey, bestW = sums.get(ownKey);
  for (const [k, w] of sums) if (w > bestW) { best = k; bestW = w; }
  if (best === ownKey) return [0, 0];
  for (const [dx, dz] of cands) if (key(dx, dz) === best) return [dx, dz];
  return [0, 0];
}
