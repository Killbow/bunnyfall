import {
  cubicInterpolator, generateSamples, getNoise,
  HEIGHTMAP_DIMENSION, MAX_TERRAIN_HEIGHT, SCALED_OCEAN_ELEVATION, BASE_HEIGHT_SCALE,
} from './terrainSampler.js';
import { calcAvgMaxHeight, blendLocationTerrain } from './terrainTiles.js';
import { MAP_WIDTH as MAP_W, MAP_HEIGHT as MAP_H } from '../formats/woodsFile.js';
import { roundToInt } from './mathf.js';

const f32 = Math.fround;

export const BAKE_MAGIC = 0x44574442;
export const BAKE_VERSION = 6;
export const BAKE_SUB = 8;
export const BAKE_SUB_FINE = 64;
export const BAKE_DISTANCE_SCALE_METERS = 16;
export const BAKE_CELL_METERS = 819.2 / BAKE_SUB;
export const BAKE_DISTANCE_CAP = 255;

export const WATER_THRESHOLD = f32(f32(SCALED_OCEAN_ELEVATION / MAX_TERRAIN_HEIGHT) + f32(1e-5));

const HDIM = HEIGHTMAP_DIMENSION;
const SPAN = HDIM - 1;
const DIV = SPAN / 3;
const NOISE_MAP_SCALE = 4;
const EXTRA_NOISE_SCALE = 10;
const MAX_MAP_PIXEL_Y = 500;

export const EXTRA_NOISE_MAX = EXTRA_NOISE_SCALE * 0.5 * 0.5;

export const PIXEL_LAND = 0;
export const PIXEL_SEA = 1;
export const PIXEL_MIXED = 2;

// `MARGIN` is far wider than float rounding near the threshold, so a sample settled without its Perlin term never
// lands on the wrong side.
const T_SCALED = WATER_THRESHOLD * MAX_TERRAIN_HEIGHT;
const MARGIN = 1e-4;

const cubicWeights = (f, out, o) => {
  const f2 = f * f, f3 = f2 * f;
  out[o] = -f3 + 2 * f2 - f; out[o + 1] = f3 - 2 * f2 + 1; out[o + 2] = -f3 + f2 + f; out[o + 3] = f3 - f2;
};
const YW = new Float64Array(HEIGHTMAP_DIMENSION * 4);
const YU = new Float64Array(HEIGHTMAP_DIMENSION * 4);
const CELL_OF = new Int8Array(HEIGHTMAP_DIMENSION);
for (let v = 0; v < HEIGHTMAP_DIMENSION; v++) {
  const i = Math.floor(v / (SPAN / 3));
  CELL_OF[v] = i;
  cubicWeights(v / SPAN, YW, v * 4);
  cubicWeights((v - i * (SPAN / 3)) / (SPAN / 3), YU, v * 4);
}

function cubicHi(lo0, hi1, hi2, lo3) {
  const M = hi1 > hi2 ? hi1 : hi2;
  const a = M - lo0 > 0 ? M - lo0 : 0, b = M - lo3 > 0 ? M - lo3 : 0;
  const s = (4 / 27) * (a + b), q = 0.25 * (a > b ? a : b);
  return M + (s < q ? s : q);
}
function cubicLo(hi0, lo1, lo2, hi3) {
  const m = lo1 < lo2 ? lo1 : lo2;
  const a = hi0 - m > 0 ? hi0 - m : 0, b = hi3 - m > 0 ? hi3 - m : 0;
  const s = (4 / 27) * (a + b), q = 0.25 * (a > b ? a : b);
  return m - (s < q ? s : q);
}

export const PLANE_KEEP_MAX = 4096;
export const PLANE_KEEP_RADIUS = 12;

function readLargeWindow(woods, mapPixelX, mapPixelY, out) {
  const raw = Object.prototype.hasOwnProperty.call(woods, '_bytes') || isValidMapPixel(mapPixelX, mapPixelY);
  const bytes = raw ? woods._bytes : null, offsets = raw ? woods.dataOffsets : null;
  if (!bytes || !offsets) {
    out.set(woods.getLargeHeightMapValuesRange(mapPixelX - 1, mapPixelY, 3));
    return out;
  }
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      let sx = mapPixelX - 1 + x, sy = mapPixelY - y;
      if (sx < 0) sx = 0;
      if (sx >= MAP_W - 1) sx = MAP_W - 1;
      if (sy < 0) sy = 0;
      if (sy >= MAP_H - 1) sy = MAP_H - 1;
      const pos = offsets[sy * MAP_W + sx] + 22;
      for (let iy = 1; iy <= 3; iy++) {
        for (let ix = 1; ix <= 3; ix++) {
          out[(y * 3 + iy - 1) * 9 + (x * 3 + ix - 1)] = bytes[pos + (4 - iy) * 5 + ix];
        }
      }
    }
  }
  return out;
}

const _shm = new Uint8Array(16);
const _lhm = new Uint8Array(81);
const _rowLo = new Float64Array(4), _rowHi = new Float64Array(4);
const _lRowLo = new Float64Array(28), _lRowHi = new Float64Array(28);

export function pixelHeightBounds(woods, mapPixelX, mapPixelY) {
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) _shm[r + c * 4] = woods.getHeightMapValue(mapPixelX - 2 + r, mapPixelY - 2 + c);
  for (let k = 0; k < 4; k++) {
    const c = 3 - k;
    const v0 = _shm[c * 4], v1 = _shm[1 + c * 4], v2 = _shm[2 + c * 4], v3 = _shm[3 + c * 4];
    _rowLo[k] = cubicLo(v0, v1, v2, v3);
    _rowHi[k] = cubicHi(v0, v1, v2, v3);
  }
  const bLo = cubicLo(_rowHi[0], _rowLo[1], _rowLo[2], _rowHi[3]) * BASE_HEIGHT_SCALE;
  const bHi = cubicHi(_rowLo[0], _rowHi[1], _rowHi[2], _rowLo[3]) * BASE_HEIGHT_SCALE;
  readLargeWindow(woods, mapPixelX, mapPixelY, _lhm);
  for (let R = 0; R < 7; R++) {
    for (let ix = 0; ix <= 3; ix++) {
      const b = R * 9 + ix;
      const v0 = _lhm[b], v1 = _lhm[b + 1], v2 = _lhm[b + 2], v3 = _lhm[b + 3];
      _lRowLo[R * 4 + ix] = cubicLo(v0, v1, v2, v3);
      _lRowHi[R * 4 + ix] = cubicHi(v0, v1, v2, v3);
    }
  }
  let nLo = Infinity, nHi = -Infinity;
  for (let iy = 0; iy <= 3; iy++) {
    for (let ix = 0; ix <= 3; ix++) {
      const a = iy * 4 + ix;
      const lo = cubicLo(_lRowHi[a], _lRowLo[a + 4], _lRowLo[a + 8], _lRowHi[a + 12]) * NOISE_MAP_SCALE;
      const hi = cubicHi(_lRowLo[a], _lRowHi[a + 4], _lRowHi[a + 8], _lRowLo[a + 12]) * NOISE_MAP_SCALE;
      if (lo < nLo) nLo = lo;
      if (hi > nHi) nHi = hi;
    }
  }
  let lo = bLo + nLo, hi = bHi + nHi + EXTRA_NOISE_MAX;
  if (lo < SCALED_OCEAN_ELEVATION) lo = SCALED_OCEAN_ELEVATION;
  if (hi < SCALED_OCEAN_ELEVATION) hi = SCALED_OCEAN_ELEVATION;
  return [lo, hi];
}

export function classifyPixel(woods, mapPixelX, mapPixelY) {
  const [lo, hi] = pixelHeightBounds(woods, mapPixelX, mapPixelY);
  if (lo > T_SCALED + MARGIN) return PIXEL_LAND;
  if (hi < T_SCALED - MARGIN) return PIXEL_SEA;
  return PIXEL_MIXED;
}

export function settleRange(lo, hi) {
  return lo > T_SCALED + MARGIN ? 0 : hi + EXTRA_NOISE_MAX < T_SCALED - MARGIN ? 1 : -1;
}

// `exact` makes the same calls in the same order as `sampleKernel`, so any sample that decides a cell matches the
// streamed terrain bit for bit.

/** @returns {{water: Function, quick: Function, exact: Function}} */
export function pixelWaterSampler(woods, mapPixelX, mapPixelY, locationRect = null) {
  if (locationRect) {
    const S = generateSamples(woods, mapPixelX, mapPixelY);
    const [avg] = calcAvgMaxHeight(S);
    blendLocationTerrain(S, avg, locationRect);
    const water = (x, y) => S[x * HDIM + y] <= WATER_THRESHOLD;
    return { water, quick: (x, y) => (water(x, y) ? 1 : 0), exact: water };
  }
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) _shm[r + c * 4] = woods.getHeightMapValue(mapPixelX - 2 + r, mapPixelY - 2 + c);
  const shm = _shm.slice();
  const lhm = readLargeWindow(woods, mapPixelX, mapPixelY, new Uint8Array(81));
  const baseX = new Float64Array(4 * HDIM);
  const noiseX = new Float64Array(7 * HDIM);
  for (let x = 0; x < HDIM; x++) {
    const sfracx = x / SPAN;
    for (let k = 0; k < 4; k++) {
      const c = 3 - k;
      baseX[k * HDIM + x] = cubicInterpolator(shm[c * 4], shm[1 + c * 4], shm[2 + c * 4], shm[3 + c * 4], sfracx);
    }
    const ix = Math.floor(x / DIV);
    const fracx = (x - ix * DIV) / DIV;
    for (let R = 0; R < 7; R++) {
      const b = R * 9 + ix;
      noiseX[R * HDIM + x] = cubicInterpolator(lhm[b], lhm[b + 1], lhm[b + 2], lhm[b + 3], fracx);
    }
  }
  const region = new Int8Array(16);
  const lo4 = new Float64Array(4), hi4 = new Float64Array(4);
  for (let rx = 0; rx < 4; rx++) {
    const x0 = rx === 3 ? SPAN : Math.ceil(rx * DIV), x1 = rx === 3 ? SPAN : Math.ceil((rx + 1) * DIV) - 1;
    for (let k = 0; k < 4; k++) {
      let mn = Infinity, mx = -Infinity;
      for (let x = x0; x <= x1; x++) { const v = baseX[k * HDIM + x]; if (v < mn) mn = v; if (v > mx) mx = v; }
      lo4[k] = mn; hi4[k] = mx;
    }
    const bLo = cubicLo(hi4[0], lo4[1], lo4[2], hi4[3]) * BASE_HEIGHT_SCALE;
    const bHi = cubicHi(lo4[0], hi4[1], hi4[2], lo4[3]) * BASE_HEIGHT_SCALE;
    for (let ry = 0; ry < 4; ry++) {
      for (let j = 0; j < 4; j++) {
        let mn = Infinity, mx = -Infinity;
        for (let x = x0; x <= x1; x++) { const v = noiseX[(ry + j) * HDIM + x]; if (v < mn) mn = v; if (v > mx) mx = v; }
        lo4[j] = mn; hi4[j] = mx;
      }
      const nLo = cubicLo(hi4[0], lo4[1], lo4[2], hi4[3]) * NOISE_MAP_SCALE;
      const nHi = cubicHi(lo4[0], hi4[1], hi4[2], lo4[3]) * NOISE_MAP_SCALE;
      region[ry * 4 + rx] = settleRange(bLo + nLo, bHi + nHi);
    }
  }
  const hiT = T_SCALED + MARGIN, loT = T_SCALED - EXTRA_NOISE_MAX - MARGIN;
  const nx0 = mapPixelX * SPAN, ny0 = (MAX_MAP_PIXEL_Y - mapPixelY) * SPAN;
  const h0 = (x, y) => {
    const iy = Math.floor(y / DIV);
    const sfracy = y / SPAN;
    const fracy = (y - iy * DIV) / DIV;
    const base = cubicInterpolator(baseX[x], baseX[HDIM + x], baseX[2 * HDIM + x], baseX[3 * HDIM + x], sfracy);
    const noise = cubicInterpolator(noiseX[iy * HDIM + x], noiseX[(iy + 1) * HDIM + x], noiseX[(iy + 2) * HDIM + x], noiseX[(iy + 3) * HDIM + x], fracy);
    let h = 0;
    h += base * BASE_HEIGHT_SCALE;
    h += noise * NOISE_MAP_SCALE;
    return h;
  };
  const quick = (x, y) => {
    const iy = CELL_OF[y];
    const settled = region[iy * 4 + CELL_OF[x]];
    if (settled >= 0) return settled;
    const w = y * 4, r = iy * HDIM + x;
    const base = YW[w] * baseX[x] + YW[w + 1] * baseX[HDIM + x] + YW[w + 2] * baseX[2 * HDIM + x] + YW[w + 3] * baseX[3 * HDIM + x];
    const noise = YU[w] * noiseX[r] + YU[w + 1] * noiseX[r + HDIM] + YU[w + 2] * noiseX[r + 2 * HDIM] + YU[w + 3] * noiseX[r + 3 * HDIM];
    const h = base * BASE_HEIGHT_SCALE + noise * NOISE_MAP_SCALE;
    return h > hiT ? 0 : h < loT ? 1 : -1;
  };
  // The sampler clamp to the ocean elevation is left out on purpose: it lifts a sample to a height under the
  // threshold, so it never changes the answer.
  const exact = (x, y) => {
    let h = h0(x, y);
    const nx = nx0 + x, ny = ny0 + y;
    h += (getNoise(nx, ny, 0.3, 0.5, 0.5, 1) * getNoise(nx, ny, 0.9, 0.5, 0.5, 1)) * EXTRA_NOISE_SCALE;
    return f32(Math.min(1, Math.max(0, h / MAX_TERRAIN_HEIGHT))) <= WATER_THRESHOLD;
  };
  return {
    quick, exact,
    water(x, y) { const q = quick(x, y); return q < 0 ? exact(x, y) : q === 1; },
  };
}

export function fineCellWater(sampler, fx, fy) {
  const x0 = 2 * fx, y0 = SPAN - 2 - 2 * fy;
  let open = 0;
  for (let a = 0; a <= 2; a++) {
    for (let b = 0; b <= 2; b++) {
      const q = sampler.quick(x0 + a, y0 + b);
      if (q === 1) return true;
      if (q < 0) open |= 1 << (a * 3 + b);
    }
  }
  for (let k = 0; k < 9; k++) if ((open >> k) & 1 && sampler.exact(x0 + Math.floor(k / 3), y0 + (k % 3))) return true;
  return false;
}

// A coarse cell is a candidate only when more than 32 of its 64 fine-cell center samples are water, so a tie counts
// as land, as in the mod file.
export function coarseCandidateBits(sampler) {
  const out = new Uint8Array(BAKE_SUB);
  const open = new Int32Array(64);
  for (let cy = 0; cy < BAKE_SUB; cy++) {
    for (let cx = 0; cx < BAKE_SUB; cx++) {
      let wet = 0, dry = 0, n = 0;
      for (let fy = 0; fy < 8; fy++) {
        for (let fx = 0; fx < 8; fx++) {
          const x = 2 * (cx * 8 + fx) + 1, y = SPAN - 1 - 2 * (cy * 8 + fy);
          const q = sampler.quick(x, y);
          if (q === 1) wet++; else if (q === 0) dry++; else open[n++] = x * 256 + y;
        }
      }
      for (let k = 0; k < n && wet <= 32 && dry < 32; k++) {
        if (sampler.exact(open[k] >> 8, open[k] & 255)) wet++; else dry++;
      }
      if (wet > 32) out[cy] |= 1 << cx;
    }
  }
  return out;
}

export function fineMaskBits(sampler) {
  const out = new Uint8Array(BAKE_SUB_FINE * BAKE_SUB_FINE / 8);
  for (let fy = 0; fy < BAKE_SUB_FINE; fy++) {
    for (let fx = 0; fx < BAKE_SUB_FINE; fx++) if (fineCellWater(sampler, fx, fy)) out[fy * 8 + (fx >> 3)] |= 1 << (fx & 7);
  }
  return out;
}

export function fullWaterBits(fine) {
  const out = new Uint8Array(BAKE_SUB);
  for (let cy = 0; cy < BAKE_SUB; cy++) {
    for (let cx = 0; cx < BAKE_SUB; cx++) {
      let all = true;
      for (let fy = 0; fy < 8 && all; fy++) if (fine[(cy * 8 + fy) * 8 + cx] !== 0xff) all = false;
      if (all) out[cy] |= 1 << cx;
    }
  }
  return out;
}

function floodInside(reached, cand) {
  let grew = true;
  while (grew) {
    grew = false;
    for (let r = 0; r < 8; r++) {
      const m = reached[r] | (r > 0 ? reached[r - 1] : 0) | (r < 7 ? reached[r + 1] : 0);
      const d = (m | ((m << 1) & 0xff) | (m >> 1)) & cand[r];
      if ((d | reached[r]) !== reached[r]) { reached[r] |= d; grew = true; }
    }
  }
}

const ALL8 = new Uint8Array(8).fill(0xff);
const NONE8 = new Uint8Array(8);

/**
 * @param {object} woods
 * @param {object} [opts]
 * @param {(px: number, py: number) => ?object} [opts.locationRectAt]
 * @param {(px: number, py: number) => number} [opts.classify]
 * @param {(px: number, py: number) => Uint8Array} [opts.candidates]
 * @returns {{state: Uint8Array, partialIndex: Int32Array, partialBits: Uint8Array, classes: Uint8Array, stats: object}}
 */
export function buildGlobal(woods, opts = {}) {
  const steps = buildGlobalSteps(woods, opts);
  let r = steps.next();
  while (!r.done) r = steps.next();
  return r.value;
}

export function* buildGlobalSteps(woods, {
  locationRectAt = () => null,
  classify = (px, py) => classifyPixel(woods, px, py),
  candidates = (px, py) => coarseCandidateBits(pixelWaterSampler(woods, px, py, locationRectAt(px, py))),
} = {}) {
  return yield* floodSteps(MAP_W, MAP_H, classify, candidates);
}

export function* floodSteps(FW, FH, classify, candidates) {
  const n = FW * FH;
  const classes = new Uint8Array(n);
  for (let py = 0; py < FH; py++) {
    for (let px = 0; px < FW; px++) classes[py * FW + px] = classify(px, py);
    yield;
  }
  const candIndex = new Int32Array(n).fill(-1);
  let mixed = 0;
  for (let i = 0; i < n; i++) if (classes[i] === PIXEL_MIXED) candIndex[i] = mixed++;
  const candBits = new Uint8Array(mixed * 8);
  for (let i = 0; i < n; i++) {
    if (classes[i] !== PIXEL_MIXED) continue;
    const px = i % FW, py = (i - px) / FW;
    candBits.set(candidates(px, py), candIndex[i] * 8);
    yield;
  }
  const cand = (i) => (classes[i] === PIXEL_SEA ? ALL8 : classes[i] === PIXEL_LAND ? NONE8 : candBits.subarray(candIndex[i] * 8, candIndex[i] * 8 + 8));
  const reached = new Uint8Array(n * 8);
  const queued = new Uint8Array(n);
  const queue = new Int32Array(n);
  let qh = 0, qt = 0, qn = 0;
  const push = (i) => { if (queued[i]) return; queued[i] = 1; queue[qt] = i; qt = (qt + 1) % n; qn++; };
  const pushAround = (px, py) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const x = px + dx, y = py + dy;
      if (x < 0 || y < 0 || x >= FW || y >= FH || classes[y * FW + x] === PIXEL_LAND) continue;
      push(y * FW + x);
    }
  };
  for (let py = 0; py < FH; py++) {
    for (let px = 0; px < FW; px++) {
      if (px !== 0 && py !== 0 && px !== FW - 1 && py !== FH - 1) continue;
      const i = py * FW + px, c = cand(i);
      if (c === NONE8) continue;
      const r = reached.subarray(i * 8, i * 8 + 8);
      for (let row = 0; row < 8; row++) {
        let edge = 0;
        if (px === 0) edge |= 1;
        if (px === FW - 1) edge |= 0x80;
        if (py === 0 && row === 0) edge |= 0xff;
        if (py === FH - 1 && row === 7) edge |= 0xff;
        r[row] |= edge & c[row];
      }
      floodInside(r, c);
      let any = 0;
      for (let row = 0; row < 8; row++) any |= r[row];
      if (any) pushAround(px, py);
    }
  }
  const inc = new Uint8Array(8);
  while (qn > 0) {
    const i = queue[qh]; qh = (qh + 1) % n; qn--; queued[i] = 0;
    const c = cand(i);
    if (c === NONE8) continue;
    const px = i % FW, py = (i - px) / FW;
    const r = reached.subarray(i * 8, i * 8 + 8);
    inc.fill(0);
    const nb = (dx, dy) => { const x = px + dx, y = py + dy; return (x < 0 || y < 0 || x >= FW || y >= FH) ? null : reached.subarray((y * FW + x) * 8, (y * FW + x) * 8 + 8); };
    const W = nb(-1, 0), E = nb(1, 0), N = nb(0, -1), S = nb(0, 1), NW = nb(-1, -1), NE = nb(1, -1), SW = nb(-1, 1), SE = nb(1, 1);
    for (let row = 0; row < 8; row++) {
      if (W) { const m = ((W[row] >> 7) & 1) | (row > 0 ? (W[row - 1] >> 7) & 1 : 0) | (row < 7 ? (W[row + 1] >> 7) & 1 : 0); if (m) inc[row] |= 1; }
      if (E) { const m = (E[row] & 1) | (row > 0 ? E[row - 1] & 1 : 0) | (row < 7 ? E[row + 1] & 1 : 0); if (m) inc[row] |= 0x80; }
    }
    if (N) { const m = N[7]; inc[0] |= m | ((m << 1) & 0xff) | (m >> 1); }
    if (S) { const m = S[0]; inc[7] |= m | ((m << 1) & 0xff) | (m >> 1); }
    if (NW && (NW[7] & 0x80)) inc[0] |= 1;
    if (NE && (NE[7] & 1)) inc[0] |= 0x80;
    if (SW && (SW[0] & 0x80)) inc[7] |= 1;
    if (SE && (SE[0] & 1)) inc[7] |= 0x80;
    let changed = false;
    for (let row = 0; row < 8; row++) {
      const add = inc[row] & c[row] & ~r[row];
      if (add) { r[row] |= add; changed = true; }
    }
    if (!changed) continue;
    floodInside(r, c);
    pushAround(px, py);
  }
  const state = new Uint8Array(n);
  const partial = [];
  for (let i = 0; i < n; i++) {
    const r = reached.subarray(i * 8, i * 8 + 8);
    let any = 0, all = 0xff;
    for (let row = 0; row < 8; row++) { any |= r[row]; all &= r[row]; }
    if (!any) continue;
    if (all === 0xff) { state[i] = 1; continue; }
    state[i] = 2;
    partial.push(i);
  }
  const partialIndex = Int32Array.from(partial);
  const partialBits = new Uint8Array(partial.length * 8);
  for (let k = 0; k < partial.length; k++) partialBits.set(reached.subarray(partial[k] * 8, partial[k] * 8 + 8), k * 8);
  let sea = 0, land = 0;
  for (let i = 0; i < n; i++) { if (classes[i] === PIXEL_SEA) sea++; else if (classes[i] === PIXEL_LAND) land++; }
  return { state, partialIndex, partialBits, classes, stats: { land, sea, mixed, partial: partial.length } };
}

// Five pixels each way decide every distance byte of the center pixel: the 255 x 16 m cap is 39.8 cells, and five
// pixels out is at least 41 cells.
const WINDOW_PIXELS = 5;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clampInt = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function isValidMapPixel(mapPixelX, mapPixelY) {
  return mapPixelX >= 0 && mapPixelY >= 0 && mapPixelX < MAP_W && mapPixelY < MAP_H;
}

export const BAY_FRAME = Object.freeze({ x0: 0, y0: 0, w: MAP_W, h: MAP_H });
export const inFrame = (f, px, py) => px >= f.x0 && py >= f.y0 && px < f.x0 + f.w && py < f.y0 + f.h;

export const bakedSouthFraction = (fracZ) => f32(1 - clamp01(f32(fracZ)));

export function distanceBytes(px, py, maskBits) {
  const R = WINDOW_PIXELS, side = (2 * R + 1) * BAKE_SUB;
  const D = new Float64Array(side * side);
  for (let wy = 0; wy < 2 * R + 1; wy++) {
    for (let wx = 0; wx < 2 * R + 1; wx++) {
      const bits = maskBits(px - R + wx, py - R + wy);
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const k = (wy * 8 + r) * side + wx * 8 + c;
          if (!bits) { D[k] = Infinity; continue; }
          D[k] = (bits[r] >> c) & 1 ? Infinity : 0;
        }
      }
    }
  }
  const S2 = Math.SQRT2;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const k = y * side + x;
      let d = D[k];
      if (d === 0) continue;
      if (x > 0 && D[k - 1] + 1 < d) d = D[k - 1] + 1;
      if (y > 0) {
        if (D[k - side] + 1 < d) d = D[k - side] + 1;
        if (x > 0 && D[k - side - 1] + S2 < d) d = D[k - side - 1] + S2;
        if (x < side - 1 && D[k - side + 1] + S2 < d) d = D[k - side + 1] + S2;
      }
      D[k] = d;
    }
  }
  for (let y = side - 1; y >= 0; y--) {
    for (let x = side - 1; x >= 0; x--) {
      const k = y * side + x;
      let d = D[k];
      if (d === 0) continue;
      if (x < side - 1 && D[k + 1] + 1 < d) d = D[k + 1] + 1;
      if (y < side - 1) {
        if (D[k + side] + 1 < d) d = D[k + side] + 1;
        if (x < side - 1 && D[k + side + 1] + S2 < d) d = D[k + side + 1] + S2;
        if (x > 0 && D[k + side - 1] + S2 < d) d = D[k + side - 1] + S2;
      }
      D[k] = d;
    }
  }
  const out = new Uint8Array(64);
  const o = R * BAKE_SUB;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const d = D[(o + r) * side + o + c];
      out[r * 8 + c] = d === 0 ? 0 : d === Infinity ? BAKE_DISTANCE_CAP : Math.min(BAKE_DISTANCE_CAP, Math.round(d * BAKE_CELL_METERS / BAKE_DISTANCE_SCALE_METERS));
    }
  }
  return out;
}

export class DeepWatersBake {
  /**
   * @param {object} deps
   * @param {object} deps.woods
   * @param {?object} deps.global
   * @param {(px: number, py: number) => ?object} [deps.locationRectAt]
   * @param {(px: number, py: number) => Uint8Array} [deps.fineAt]
   * @param {{ x0: number, y0: number, w: number, h: number }} [deps.frame]
   */
  constructor({ woods, global, locationRectAt = () => null, fineAt = null, frame = BAY_FRAME }) {
    this.woods = woods;
    this.frame = frame;
    this.state = global?.state ?? null;
    this.classes = global?.classes ?? null;
    this.locationRectAt = locationRectAt;
    this._fineAt = fineAt ?? ((px, py) => fineMaskBits(pixelWaterSampler(this.woods, px, py, this.locationRectAt(px, py))));
    this._partial = new Map();
    for (let k = 0; k < (global?.partialIndex.length ?? 0); k++) this._partial.set(global.partialIndex[k], global.partialBits.subarray(k * 8, k * 8 + 8));
    this._fine = new Map();
    this._full = new Map();
    this._dist = new Map();
    this._edge = new Map();
    this.subX = BAKE_SUB; this.subY = BAKE_SUB; this.subFine = BAKE_SUB_FINE;
    this.distanceScaleMeters = BAKE_DISTANCE_SCALE_METERS;
    this.widthCells = frame.w * BAKE_SUB; this.heightCells = frame.h * BAKE_SUB;
    this.widthCellsFine = frame.w * BAKE_SUB_FINE; this.heightCellsFine = frame.h * BAKE_SUB_FINE;
    this.loaded = true;
    this.hasFineWaterMask = true;
  }

  frameOf() { return this.frame; }
  inFrame(px, py) { return inFrame(this.frame, px, py); }
  _index(px, py) { return (py - this.frame.y0) * this.frame.w + (px - this.frame.x0); }
  _class(i, _px, _py) { return this.classes[i]; }
  _caches() { return [this._fine, this._full, this._dist, this._edge]; }

  seaBits(px, py) {
    if (!this.inFrame(px, py)) return null;
    const i = this._index(px, py), s = this.state[i];
    return s === 1 ? ALL8 : s === 2 ? this._partial.get(i) : NONE8;
  }

  fineBits(px, py) {
    const i = this._index(px, py);
    let f = this._fine.get(i);
    if (f) return f;
    const cls = this._class(i, px, py);
    if (cls === PIXEL_SEA) f = FINE_ALL;
    else if (cls === PIXEL_LAND) f = FINE_NONE;
    else f = this._fineAt(px, py);
    this._fine.set(i, f);
    return f;
  }

  fullBits(px, py) {
    if (!this.inFrame(px, py)) return null;
    const i = this._index(px, py);
    let b = this._full.get(i);
    if (b) return b;
    const cls = this._class(i, px, py);
    b = cls === PIXEL_SEA ? ALL8 : cls === PIXEL_LAND ? NONE8 : fullWaterBits(this.fineBits(px, py));
    this._full.set(i, b);
    return b;
  }

  _plane(plane, px, py) {
    const cache = plane === 'dist' ? this._dist : this._edge;
    const i = this._index(px, py);
    let b = cache.get(i);
    if (b) return b;
    b = distanceBytes(px, py, plane === 'dist' ? (x, y) => this.seaBits(x, y) : (x, y) => this.fullBits(x, y));
    cache.set(i, b);
    return b;
  }

  prepare(px, py) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = px + dx, y = py + dy;
      if (!this.inFrame(x, y)) continue;
      this._plane('dist', x, y);
      this._plane('edge', x, y);
      this.fineBits(x, y);
    }
  }

  /** @returns {Array<{i: number, fine: ?Uint8Array, dist: ?Uint8Array, edge: ?Uint8Array}>} */
  exportPlanes(px, py) {
    const rows = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = px + dx, y = py + dy;
      if (!this.inFrame(x, y)) continue;
      const i = this._index(x, y);
      const f = this._class(i, x, y) === PIXEL_MIXED ? this._fine.get(i) ?? null : null;
      const row = this._row(i, { i, fine: f ? f.slice() : null, dist: this._dist.get(i)?.slice() ?? null, edge: this._edge.get(i)?.slice() ?? null });
      if (row) rows.push(row);
    }
    return rows;
  }

  _row(_i, row) { return row.fine || row.dist || row.edge ? row : null; }

  adoptPlanes(rows) {
    let last = null;
    for (const r of rows ?? []) {
      if (!Number.isInteger(r?.i) || r.i < 0 || r.i >= this.frame.w * this.frame.h) continue;
      if (r.fine && r.fine.length === 512 && !this._fine.has(r.i)) this._fine.set(r.i, r.fine);
      if (r.dist && r.dist.length === 64 && !this._dist.has(r.i)) this._dist.set(r.i, r.dist);
      if (r.edge && r.edge.length === 64 && !this._edge.has(r.i)) this._edge.set(r.i, r.edge);
      last = r.i;
    }
    if (last !== null) this._keep((last % this.frame.w) + this.frame.x0, Math.floor(last / this.frame.w) + this.frame.y0);
  }

  _keep(px, py) {
    if (this._caches().some((c) => c.size > PLANE_KEEP_MAX)) this.evictOutside(px, py, PLANE_KEEP_RADIUS);
  }

  evictOutside(px, py, radius) {
    const { x0, y0, w } = this.frame;
    for (const cache of this._caches()) {
      for (const i of [...cache.keys()]) {
        const x = (i % w) + x0, y = Math.floor(i / w) + y0;
        if (Math.max(Math.abs(x - px), Math.abs(y - py)) > radius) cache.delete(i);
      }
    }
  }

  _byte(plane, x, y) {
    const px = (x >> 3) + this.frame.x0, py = (y >> 3) + this.frame.y0;
    return this._plane(plane, px, py)[(y & 7) * 8 + (x & 7)];
  }

  _coarseBit(x, y) {
    const b = this.seaBits((x >> 3) + this.frame.x0, (y >> 3) + this.frame.y0);
    return !!b && ((b[y & 7] >> (x & 7)) & 1) === 1;
  }

  _fineBit(fx, fy) {
    const f = this.fineBits((fx >> 6) + this.frame.x0, (fy >> 6) + this.frame.y0);
    const r = fy & 63, c = fx & 63;
    return ((f[r * 8 + (c >> 3)] >> (c & 7)) & 1) === 1;
  }

  sampleDistanceMeters(mapPixelX, mapPixelY, fracX, fracZ) {
    if (!this.loaded) return Number.MAX_VALUE;
    return this._bilinearSampleMeters('dist', mapPixelX, mapPixelY, fracX, fracZ);
  }

  sampleEdgeDistanceMeters(mapPixelX, mapPixelY, fracX, fracZ) {
    return this._bilinearSampleMeters('edge', mapPixelX, mapPixelY, fracX, fracZ);
  }

  // The local plane in the mod's file holds the same bytes as the edge plane, so both queries read `edge`.
  sampleLocalEdgeDistanceMeters(mapPixelX, mapPixelY, fracX, fracZ) {
    return this._bilinearSampleMeters('edge', mapPixelX, mapPixelY, fracX, fracZ);
  }

  _bilinearSampleMeters(plane, mapPixelX, mapPixelY, fracX, fracZ) {
    const num = f32(f32(f32((mapPixelX - this.frame.x0) * this.subX) + f32(clamp01(f32(fracX)) * this.subX)) - 0.5);
    const num2 = f32(f32(f32((mapPixelY - this.frame.y0) * this.subY) + f32(bakedSouthFraction(fracZ) * this.subY)) - 0.5);
    const num3 = clampInt(Math.floor(num), 0, this.widthCells - 1);
    const num4 = clampInt(Math.floor(num2), 0, this.heightCells - 1);
    const num5 = Math.min(num3 + 1, this.widthCells - 1);
    const num6 = Math.min(num4 + 1, this.heightCells - 1);
    const num7 = clamp01(f32(num - num3));
    const num8 = clamp01(f32(num2 - num4));
    const s = this.distanceScaleMeters;
    const num9 = f32(this._byte(plane, num3, num4) * s);
    const num10 = f32(this._byte(plane, num5, num4) * s);
    const num11 = f32(this._byte(plane, num3, num6) * s);
    const num12 = f32(this._byte(plane, num5, num6) * s);
    const num13 = f32(num9 + f32(f32(num10 - num9) * num7));
    const num14 = f32(num11 + f32(f32(num12 - num11) * num7));
    return f32(num13 + f32(f32(num14 - num13) * num8));
  }

  isWaterAt(mapPixelX, mapPixelY, fracX, fracZ) {
    if (!this.loaded) return false;
    const [x, y] = this._nearestCell(mapPixelX, mapPixelY, fracX, fracZ);
    return this._cellHasWater(x, y);
  }

  isCarvedWater(mapPixelX, mapPixelY, fracX, fracZ) {
    if (!this.loaded || !this.hasFineWaterMask || this.subFine <= 0) return false;
    const num = f32(f32(f32((mapPixelX - this.frame.x0) * this.subFine) + f32(clamp01(f32(fracX)) * this.subFine)) - 0.5);
    const num2 = f32(f32(f32((mapPixelY - this.frame.y0) * this.subFine) + f32(bakedSouthFraction(fracZ) * this.subFine)) - 0.5);
    const num3 = clampInt(roundToInt(num), 0, this.widthCellsFine - 1);
    const row = clampInt(roundToInt(num2), 0, this.heightCellsFine - 1);
    return this._fineBit(num3, row);
  }

  mapPixelHasFineWaterCells(mapPixelX, mapPixelY) {
    if (!this.loaded || !this.hasFineWaterMask || this.subFine <= 0) return false;
    if (!this.inFrame(mapPixelX, mapPixelY)) return false;
    const f = this.fineBits(mapPixelX, mapPixelY);
    for (let i = 0; i < f.length; i++) if (f[i]) return true;
    return false;
  }

  mapPixelHasWaterCells(mapPixelX, mapPixelY) { return this._mapPixelHasCoarseCell(mapPixelX, mapPixelY, true); }

  holdsSea(_px, _py) { return true; }

  mapPixelOrCardinalNeighborHasWaterCells(mapPixelX, mapPixelY) {
    if (!this.mapPixelHasWaterCells(mapPixelX, mapPixelY) && !this.mapPixelHasWaterCells(mapPixelX - 1, mapPixelY)
      && !this.mapPixelHasWaterCells(mapPixelX + 1, mapPixelY) && !this.mapPixelHasWaterCells(mapPixelX, mapPixelY - 1)) {
      return this.mapPixelHasWaterCells(mapPixelX, mapPixelY + 1);
    }
    return true;
  }

  mapPixelHasLandCells(mapPixelX, mapPixelY) { return this._mapPixelHasCoarseCell(mapPixelX, mapPixelY, false); }

  _mapPixelHasCoarseCell(mapPixelX, mapPixelY, water) {
    if (!this.loaded) return false;
    if (!this.inFrame(mapPixelX, mapPixelY)) return false;
    const b = this.seaBits(mapPixelX, mapPixelY);
    for (let r = 0; r < 8; r++) if (water ? b[r] !== 0 : b[r] !== 0xff) return true;
    return false;
  }

  _nearestCell(mapPixelX, mapPixelY, fracX, fracZ) {
    const num = f32(f32(f32((mapPixelX - this.frame.x0) * this.subX) + f32(clamp01(f32(fracX)) * this.subX)) - 0.5);
    const num2 = f32(f32(f32((mapPixelY - this.frame.y0) * this.subY) + f32(bakedSouthFraction(fracZ) * this.subY)) - 0.5);
    return [clampInt(roundToInt(num), 0, this.widthCells - 1), clampInt(roundToInt(num2), 0, this.heightCells - 1)];
  }

  _cellHasWater(x, y) {
    if (x < 0 || y < 0 || x >= this.widthCells || y >= this.heightCells) return false;
    return this._coarseBit(x, y);
  }
}

const FINE_ALL = new Uint8Array(512).fill(0xff);
const FINE_NONE = new Uint8Array(512);
