import { SCALED_OCEAN_ELEVATION, SCALED_BEACH_ELEVATION, BASE_HEIGHT_SCALE, NOISE_MAP_SCALE, EXTRA_NOISE_SCALE, MAX_TERRAIN_HEIGHT, HEIGHTMAP_DIMENSION, TERRAIN_SIZE, STREAMING_TERRAIN_SCALE, kernelTerms, kernelWindows, sampleKernel, generateSamples, cubicInterpolator } from './terrainSampler.js';
import { BEACH_JITTER, WORLD_MAP_TILE_DIM, blendLocationTerrain, locationFootprintRect } from './terrainTiles.js';
import { DIR_DELTA, MAP_W, MAP_H } from './roadNetwork.js';
import { perlinNoise } from './perlin.js';
import { CLIMATES } from '../formats/mapsTables.js';
import { inEtherLaw, etherClimateAt } from './ethericSea.js';


export const LANDFORM_KNEE = SCALED_BEACH_ELEVATION + BEACH_JITTER;
// Half a unit over the knee so the tile classifier's float32 round trip never reads a cut sample as beach.
export const LANDFORM_FLOOR = LANDFORM_KNEE + 0.5;

export const LANDFORM_DIALS = Object.freeze({
  relief: Object.freeze({ from: 200, full: 900, gain: 0.9 }),
  stream: Object.freeze({ flat: 1, bank: 1.25, verge: 4, drop: 0.8 }),
  river: Object.freeze({ flat: 2, bank: 1.5, verge: 6, drop: 1.92 }),
  track: Object.freeze({ flat: 1.25, bank: 2, verge: 5, drop: 0 }),
  road: Object.freeze({ flat: 1.25, bank: 2.5, verge: 6, drop: 0 }),
  coast: 12,
  bankGrade: 0.5,
  cliff: Object.freeze({ from: 1, full: 3 }),
  hills: Object.freeze({ uplandAt: 700, coast: 1.25, region: 2400, warp: 80, warpScale: 520, scales: Object.freeze([300, 125, 50]), weights: Object.freeze([1, 0.36, 0.1]) }),
  lands: Object.freeze({
    woodlands: Object.freeze({ low: 4, high: 48, upland: 1.6, shape: 'rolling' }),
    mountainWoods: Object.freeze({ low: 8, high: 56, upland: 1.6, shape: 'foothills', peaks: Object.freeze({ cell: 380, fill: 0.34, high: 112 }) }),
    mountain: Object.freeze({ low: 16, high: 112, upland: 1.6, shape: 'ridged', peaks: Object.freeze({ cell: 360, fill: 0.5, high: 320, sharp: true }) }),
    desert: Object.freeze({ low: 6, high: 26, upland: 1.3, shape: 'desert', rockFrom: 0.3 }),
    desert2: Object.freeze({ low: 6, high: 30, upland: 1.3, shape: 'desert', rockFrom: -0.1 }),
    rainforest: Object.freeze({ low: 8, high: 50, upland: 1.4, shape: 'knolls', cell: 120, fill: 0.62, edge: 0.88, roll: 0.15 }),
    subtropical: Object.freeze({ low: 6, high: 44, upland: 1.4, shape: 'knolls', cell: 210, fill: 0.6, edge: 1, roll: 0.7 }),
    swamp: Object.freeze({ low: 2, high: 6, upland: 1, shape: 'hummocks' }),
    haunted: Object.freeze({ low: 6, high: 40, upland: 1.5, shape: 'broken' }),
    ocean: Object.freeze({ low: 2, high: 24, upland: 1.6, shape: 'rolling' }),
  }),
  valley: Object.freeze({ river: 120, stream: 96 }),
  ease: Object.freeze({ road: 40, track: 28, keep: 0.35 }),
  site: Object.freeze({ reach: 40, per: 3, most: 124, grid: 8 }),
});

const LAYERS = Object.freeze([
  Object.freeze({ key: 'streams', dial: LANDFORM_DIALS.stream, water: true }),
  Object.freeze({ key: 'rivers', dial: LANDFORM_DIALS.river, water: true }),
  Object.freeze({ key: 'tracks', dial: LANDFORM_DIALS.track, water: false, ford: true }),
  Object.freeze({ key: 'roads', dial: LANDFORM_DIALS.road, water: false }),
]);

const smooth01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const smoothstep = (a, b, v) => smooth01((v - a) / (b - a));

// Fades are stored in 1024ths so the kernel's cubic over them is exact and a pixel edge reads one number from both
// sides.
const CLIFF_FADE = (() => {
  const { from, full } = LANDFORM_DIALS.cliff;
  const out = new Float64Array(Math.floor(full * full) + 1);
  for (let d2 = 0; d2 < out.length; d2++) out[d2] = Math.round(smooth01((Math.sqrt(d2) - from) / (full - from)) * 1024) / 1024;
  return out;
})();
// farRing.js pads its byte window by this reach so the far ring fades the lift as the kernel does.
export const CLIFF_REACH = Math.ceil(LANDFORM_DIALS.cliff.full);

/**
 * @param {(x: number, y: number) => number} byteAt
 * @param {number} qx
 * @param {number} qy
 * @returns {number}
 */
export function cliffFadeAt(byteAt, qx, qy) {
  let best = CLIFF_FADE.length;
  for (let dy = -CLIFF_REACH; dy <= CLIFF_REACH; dy++) {
    for (let dx = -CLIFF_REACH; dx <= CLIFF_REACH; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 < best && byteAt(qx + dx, qy + dy) * BASE_HEIGHT_SCALE <= LANDFORM_KNEE) best = d2;
    }
  }
  return best < CLIFF_FADE.length ? CLIFF_FADE[best] : 1;
}

/**
 * @param {object} woods
 * @param {number} px
 * @param {number} py
 * @param {number} hDim
 * @returns {?(x: number, y: number) => number}
 */
function cliffFade(woods, px, py, hDim) {
  const x0 = px - 2 - CLIFF_REACH, y0 = py - 2 - CLIFF_REACH, side = 4 + 2 * CLIFF_REACH;
  const win = woods.getHeightMapValuesRange1Dim(x0, y0, side);
  const byteAt = (x, y) => win[(x - x0) + (y - y0) * side];
  const f = new Float64Array(16);
  let whole = true;
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      const v = cliffFadeAt(byteAt, px - 2 + r, py - 2 + c);
      f[r + c * 4] = v;
      if (v !== 1) whole = false;
    }
  }
  if (whole) return null;
  const at = (r, c) => f[r + c * 4];
  return (x, y) => {
    const sx = x / (hDim - 1), sy = y / (hDim - 1);
    const x1 = cubicInterpolator(at(0, 3), at(1, 3), at(2, 3), at(3, 3), sx);
    const x2 = cubicInterpolator(at(0, 2), at(1, 2), at(2, 2), at(3, 2), sx);
    const x3 = cubicInterpolator(at(0, 1), at(1, 1), at(2, 1), at(3, 1), sx);
    const x4 = cubicInterpolator(at(0, 0), at(1, 0), at(2, 0), at(3, 0), sx);
    const v = cubicInterpolator(x1, x2, x3, x4, sy);
    return v <= 0 ? 0 : v >= 1 ? 1 : v;
  };
}

/**
 * @param {{bank: number}} dial
 * @param {number} span
 */
const bankHold = (dial, span) => (LANDFORM_DIALS.bankGrade * (TERRAIN_SIZE / span / STREAMING_TERRAIN_SCALE) * dial.bank) / 1.5;

// WOODS.WLD small-heightmap bytes are 7-bit, and DFU's MAX_TERRAIN_HEIGHT is built on 127.
const LOW_TOP = 127 * BASE_HEIGHT_SCALE;

/**
 * @param {number} low
 * @returns {number}
 */
export function reliefLift(low) {
  const { from, full, gain } = LANDFORM_DIALS.relief;
  const e = (low < LOW_TOP ? low : LOW_TOP) - LANDFORM_KNEE;
  if (!(e > from)) return 0;
  return gain * e * smooth01((e - from) / (full - from));
}

const LAND_NAMES = Object.freeze(['woodlands', 'mountainWoods', 'mountain', 'desert', 'desert2', 'rainforest', 'subtropical', 'swamp', 'haunted', 'ocean']);
const LANDS = Object.freeze(LAND_NAMES.map((k) => LANDFORM_DIALS.lands[k]));
const LAND_OF_CLIMATE = (() => {
  const lut = new Uint8Array(256);
  const of = { [CLIMATES.Ocean]: 'ocean', [CLIMATES.Desert]: 'desert', [CLIMATES.Desert2]: 'desert2', [CLIMATES.Mountain]: 'mountain', [CLIMATES.Rainforest]: 'rainforest', [CLIMATES.Swamp]: 'swamp', [CLIMATES.Subtropical]: 'subtropical', [CLIMATES.MountainWoods]: 'mountainWoods', [CLIMATES.Woodlands]: 'woodlands', [CLIMATES.HauntedWoodlands]: 'haunted' };
  for (const [c, k] of Object.entries(of)) lut[Number(c)] = LAND_NAMES.indexOf(k);
  return lut;
})();
const landTop = (land) => land.high * land.upland + (land.peaks ? land.peaks.high : 0);
export function hillsTopOf(climate) {
  return landTop(LANDS[LAND_OF_CLIMATE[climate & 255]]);
}

export const HILLS_TOP = Math.max(...LANDS.map(landTop));

export const LANDFORM_CEILING = MAX_TERRAIN_HEIGHT + reliefLift(LOW_TOP) + HILLS_TOP;

const HILL_OFFSETS = Object.freeze([[11.3, 47.9], [83.1, 5.7], [29.5, 71.3]]);
const signed = (x, y) => 2 * perlinNoise(x, y) - 1;
const HILL_NODE = 16;
const NODE_VALUES = 4;
const ROCK_SCALE = 2600;

function hillNode(nx, ny, out, o) {
  const H = LANDFORM_DIALS.hills;
  const gx = nx * HILL_NODE, gy = ny * HILL_NODE;
  out[o] = smooth01((perlinNoise(gx / H.region + 31.7, gy / H.region + 57.3) - 0.3) / 0.4);
  out[o + 1] = H.warp * signed(gx / H.warpScale + 5.2, gy / H.warpScale + 1.3);
  out[o + 2] = H.warp * signed(gx / H.warpScale + 9.7, gy / H.warpScale + 3.1);
  out[o + 3] = signed(gx / ROCK_SCALE + 61.3, gy / ROCK_SCALE + 23.9);
}

/**
 * @param {number} x0
 * @param {number} y0
 * @param {number} size
 */
function hillLattice(x0, y0, size) {
  const nx0 = Math.floor(x0 / HILL_NODE), ny0 = Math.floor(y0 / HILL_NODE);
  const side = Math.ceil(size / HILL_NODE) + 2;
  const vals = new Float64Array(side * side * NODE_VALUES);
  for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) hillNode(nx0 + i, ny0 + j, vals, (j * side + i) * NODE_VALUES);
  return { nx0, ny0, side, vals };
}
const _node = new Float64Array(4 * NODE_VALUES);
const HILL_OCTAVES = LANDFORM_DIALS.hills.scales.length;
const HILL_WEIGHT = LANDFORM_DIALS.hills.weights.reduce((t, w) => t + w, 0);

// Series forms built only from correctly rounded operations, so ground heights match in every engine. Math.cos,
// Math.sin and Math.exp vary by engine.
export function cosPi(t) {
  let a = t < 0 ? -t : t, sign = 1;
  if (a > 0.5) { a = 1 - a; sign = -1; }
  const x = Math.PI * a, x2 = x * x;
  let p = 1;
  for (let k = 20; k >= 2; k -= 2) p = 1 - (x2 * p) / (k * (k - 1));
  return sign * p;
}

export function sinPi(t) {
  let a = t < 0 ? -t : t;
  if (a > 0.5) a = 1 - a;
  const x = Math.PI * a, x2 = x * x;
  let p = 1;
  for (let k = 21; k >= 3; k -= 2) p = 1 - (x2 * p) / (k * (k - 1));
  return t < 0 ? -x * p : x * p;
}

export function expNeg(t) {
  if (!(t < 40)) return 0;
  const n = Math.floor(t / Math.LN2), r = t - n * Math.LN2;
  let p = 1;
  for (let k = 18; k >= 1; k--) p = 1 - (r * p) / k;
  for (let i = 0; i < n; i++) p *= 0.5;
  return p;
}

const DUNE_WIND = 0.35, DUNE_COS = cosPi(DUNE_WIND / Math.PI), DUNE_SIN = sinPi(DUNE_WIND / Math.PI);
const DUNE_SPACING = 64, DUNE_WINDWARD = 0.72;

function rolling(wx, wy, sc) {
  const H = LANDFORM_DIALS.hills;
  let n = 0;
  for (let i = 0; i < HILL_OCTAVES; i++) n += signed(wx / (H.scales[i] * sc) + HILL_OFFSETS[i][0], wy / (H.scales[i] * sc) + HILL_OFFSETS[i][1]) * H.weights[i];
  return n / HILL_WEIGHT;
}

const softAbs = (x, k) => Math.sqrt(x * x + k * k) - k;

const RANGE_A = 0.6, RANGE_B = -0.55, RANGE_STRETCH = 2.2;
const RANGE_AC = cosPi(RANGE_A / Math.PI), RANGE_AS = sinPi(RANGE_A / Math.PI), RANGE_BC = cosPi(RANGE_B / Math.PI), RANGE_BS = sinPi(RANGE_B / Math.PI);

function ridgeline(wx, wy, cs, sn) {
  const u = (wx * cs + wy * sn) / RANGE_STRETCH, v = wy * cs - wx * sn;
  const a = 1 - softAbs(signed(u / 300 + 17.1, v / 300 + 3.9), 0.02);
  const b = 1 - softAbs(signed(u / 120 + 41.7, v / 120 + 66.2), 0.06);
  const c = 1 - softAbs(signed(wx / 55 + 7.3, wy / 55 + 91.4), 0.1);
  const r1 = a * a, r2 = b * b;
  return r1 + 0.45 * r1 * r2 + 0.16 * r1 * r2 * c * c;
}

const RIDGED_NORM = Object.freeze([0.958, 1.4]);

function ridged(wx, wy, rock) {
  const m = smooth01(0.5 + rock / 0.25);
  return (m < 1 ? (1 - m) * ridgeline(wx, wy, RANGE_AC, RANGE_AS) : 0) + (m > 0 ? m * ridgeline(wx, wy, RANGE_BC, RANGE_BS) : 0);
}

function dunes(wx, wy) {
  const u = wx * DUNE_COS + wy * DUNE_SIN, v = wy * DUNE_COS - wx * DUNE_SIN, L = DUNE_SPACING;
  const phase = u / L + 0.8 * signed(v / (L * 3.1) + 13.7, u / (L * 6.3) + 2.9) + 0.35 * signed(wx / (L * 1.7) + 37.1, wy / (L * 1.7) + 8.3);
  const f = phase - Math.floor(phase);
  const p = f < DUNE_WINDWARD ? 0.5 - 0.5 * cosPi(f / DUNE_WINDWARD) : 0.5 + 0.5 * cosPi((f - DUNE_WINDWARD) / (1 - DUNE_WINDWARD));
  return p * smooth01(0.55 + 1.3 * signed(v / (L * 5) + 71.9, u / (L * 5) + 44.1));
}

function mesas(wx, wy) {
  const n = 0.8 * signed(wx / 220 + 27.3, wy / 220 + 81.1) + 0.2 * signed(wx / 80 + 5.9, wy / 80 + 33.3);
  return 0.6 * smooth01((n - 0.08) / 0.17) + 0.4 * smooth01((n - 0.32) / 0.14);
}

function cellHash(ix, iy, k) {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ Math.imul(k, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function knollField(wx, wy, cell, fill, edge) {
  const fx = wx / cell, fy = wy / cell, cx = Math.floor(fx), cy = Math.floor(fy);
  // A knoll center lies 0.15..0.85 into its cell with radius at most 0.44, so only the near neighbor cells need a
  // check.
  const i0 = fx - cx < 0.3 ? -1 : 0, i1 = fx - cx > 0.7 ? 1 : 0, j0 = fy - cy < 0.3 ? -1 : 0, j1 = fy - cy > 0.7 ? 1 : 0;
  let best = 0;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const ix = cx + i, iy = cy + j;
      if (cellHash(ix, iy, 1) >= fill) continue;
      const kx = (ix + 0.15 + 0.7 * cellHash(ix, iy, 2)) * cell, ky = (iy + 0.15 + 0.7 * cellHash(ix, iy, 3)) * cell;
      const r = cell * (0.2 + 0.24 * cellHash(ix, iy, 4));
      if (!((wx - kx) * (wx - kx) + (wy - ky) * (wy - ky) < r * r)) continue;
      const turn = 2 * cellHash(ix, iy, 6), ang = turn > 1 ? turn - 2 : turn, lean = 1 + 0.6 * cellHash(ix, iy, 7);
      const ca = cosPi(ang), sa = sinPi(ang), dx = wx - kx, dy = wy - ky;
      const ru = dx * ca + dy * sa, rv = (dy * ca - dx * sa) * lean;
      const d = Math.sqrt(ru * ru + rv * rv);
      if (!(d < r)) continue;
      const q = d / r, tall = 0.35 + 0.4 * cellHash(ix, iy, 5) + 0.25 * (r / cell - 0.2) / 0.24;
      const v = tall * smooth01((1 - q) / edge) * (0.8 + 0.2 * (1 - q * q));
      if (v > best) best = v;
    }
  }
  return best;
}

function knolls(wx, wy, rock, land) {
  const gather = 0.25 + 0.75 * smooth01(0.5 + rock / 0.5);
  return gather * knollField(wx, wy, land.cell, land.fill, land.edge) + land.roll * rolling(wx, wy, land.cell / 110) + 0.05 * signed(wx / 90 + 63.7, wy / 90 + 29.1);
}

// The last factor is ln(1.4) / 0.4 written out, so ground math never calls an engine's own logarithm.
export const PEAK_MEAN = 0.725 * (0.5 - 2 / (Math.PI * Math.PI)) * Math.PI * (0.0576 + 0.0864 * 0.5 + 0.0324 / 3) * 0.8411805915530323;
export const PEAK_MEAN_SHARP = PEAK_MEAN / (6 * (0.5 - 2 / (Math.PI * Math.PI)));

export function peakField(wx, wy, cell, fill, sharp = false) {
  const fx = wx / cell, fy = wy / cell, cx = Math.floor(fx), cy = Math.floor(fy);
  // A peak center lies 0.15..0.85 into its cell with radius at most 0.42, so only the near neighbor cells need a
  // check.
  const i0 = fx - cx < 0.3 ? -1 : 0, i1 = fx - cx > 0.7 ? 1 : 0, j0 = fy - cy < 0.3 ? -1 : 0, j1 = fy - cy > 0.7 ? 1 : 0;
  let best = 0;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const ix = cx + i, iy = cy + j;
      if (cellHash(ix, iy, 11) >= fill) continue;
      const kx = (ix + 0.15 + 0.7 * cellHash(ix, iy, 12)) * cell, ky = (iy + 0.15 + 0.7 * cellHash(ix, iy, 13)) * cell;
      const r = cell * (0.24 + 0.18 * cellHash(ix, iy, 14));
      const dx = wx - kx, dy = wy - ky;
      if (!(dx * dx + dy * dy < r * r)) continue;
      const turn = 2 * cellHash(ix, iy, 15), ang = turn > 1 ? turn - 2 : turn, lean = 1 + 0.4 * cellHash(ix, iy, 16);
      const ca = cosPi(ang), sa = sinPi(ang);
      const ru = dx * ca + dy * sa, rv = (dy * ca - dx * sa) * lean;
      const q = Math.sqrt(ru * ru + rv * rv) / r;
      if (!(q < 1)) continue;
      const t = 1 - q;
      const v = (0.45 + 0.55 * cellHash(ix, iy, 17)) * (sharp ? t * t : 0.5 + 0.5 * cosPi(q));
      if (v > best) best = v;
    }
  }
  return best;
}

function hummocks(wx, wy) {
  return 0.55 * signed(wx / 380 + 12.1, wy / 380 + 70.3) + 0.3 * signed(wx / 95 + 93.9, wy / 95 + 41.5) + 0.15 * signed(wx / 34 + 2.7, wy / 34 + 61.9);
}

function broken(wx, wy, gx, gy) {
  const bx = 2 * wx - gx, by = 2 * wy - gy;
  const cut = 1 - softAbs(0.75 * signed(bx / 240 + 45.1, by / 240 + 9.7) + 0.25 * signed(bx / 90 + 77.7, by / 90 + 58.3), 0.015) / 0.35;
  const ravine = cut > 0 ? cut * cut * cut : 0;
  const crag = signed(bx / 60 + 31.3, by / 60 + 12.9);
  return rolling(wx, wy, 0.8) - 0.75 * ravine + 0.3 * (crag > 0.2 ? (crag - 0.2) * (crag - 0.2) * 3 : 0);
}

/** @returns {number} */
export function shapeRaw(shape, wx, wy, gx, gy, rock, land) {
  switch (shape) {
    case 'ridged': return ridged(wx, wy, rock);
    case 'foothills': return 0.55 * rolling(wx, wy, 1) + 0.45 * ((ridged(wx, wy, rock) - RIDGED_NORM[0]) * RIDGED_NORM[1]);
    case 'desert': {
      const r = smooth01(0.5 + (rock - land.rockFrom) / 0.35);
      const swell = 0.5 * signed(wx / 720 + 3.3, wy / 720 + 96.1) + 0.2 * signed(wx / 300 + 51.9, wy / 300 + 17.7);
      return (r < 1 ? (1 - r) * (0.65 * dunes(wx, wy) + 0.35 * swell) : 0) + (r > 0 ? r * (1.1 * mesas(wx, wy) + 0.15 * swell) : 0);
    }
    case 'knolls': return knolls(wx, wy, rock, land);
    case 'hummocks': return hummocks(wx, wy);
    case 'broken': return broken(wx, wy, gx, gy);
    default: return rolling(wx, wy, 1);
  }
}

const LAND_NORMS = Object.freeze({
  woodlands: Object.freeze([0, 1]), mountainWoods: Object.freeze([0, 1.9]), mountain: RIDGED_NORM,
  desert: Object.freeze([0.173, 1.55]), desert2: Object.freeze([0.17, 1.22]), rainforest: Object.freeze([0.025, 1.25]),
  subtropical: Object.freeze([0.02, 1.5]), swamp: Object.freeze([-0.005, 2.6]), haunted: Object.freeze([-0.256, 1.25]),
  ocean: Object.freeze([0, 1]),
});
const LAND_NORM = Object.freeze(LAND_NAMES.map((k) => LAND_NORMS[k]));
const LAND_TOP = Object.freeze(LANDS.map(landTop));

const SAT_KNEE = 0.6;
function saturate(v) {
  const a = v < 0 ? -v : v;
  if (a <= SAT_KNEE) return v;
  const o = SAT_KNEE + (1 - SAT_KNEE) * (1 - expNeg((a - SAT_KNEE) / (1 - SAT_KNEE)));
  return v < 0 ? -o : o;
}

function landShape(j, wx, wy, gx, gy, rock) {
  const land = LANDS[j], norm = LAND_NORM[j];
  return saturate((shapeRaw(land.shape, wx, wy, gx, gy, rock, land) - norm[0]) * norm[1]);
}

const _etherLand = new Map();
function etherLandAt(x, y, climates) {
  if (!inEtherLaw(x, y)) return LAND_OF_CLIMATE[climates[(y < 0 ? 0 : y >= MAP_H ? MAP_H - 1 : y) * MAP_W + (x < 0 ? 0 : x >= MAP_W ? MAP_W - 1 : x)]];
  const k = x * 65536 + y;
  let l = _etherLand.get(k);
  if (l === undefined) {
    if (_etherLand.size >= 64) _etherLand.clear();
    l = LAND_OF_CLIMATE[etherClimateAt(x, y)] ?? 0;
    _etherLand.set(k, l);
  }
  return l;
}
const _share = new Float64Array(LANDS.length);
function landShares(gx, gy, climates, span) {
  if (!climates) { _share[0] = 1; return 1; }
  const fx = gx / span - 0.5, fy = MAP_H + 0.5 - gy / span;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  let l00, l10, l01, l11;
  if (inEtherLaw(ix, iy) || inEtherLaw(ix + 1, iy + 1)) {
    l00 = etherLandAt(ix, iy, climates); l10 = etherLandAt(ix + 1, iy, climates); l01 = etherLandAt(ix, iy + 1, climates); l11 = etherLandAt(ix + 1, iy + 1, climates);
  } else {
    const x0 = ix < 0 ? 0 : ix >= MAP_W ? MAP_W - 1 : ix, x1 = ix + 1 < 0 ? 0 : ix + 1 >= MAP_W ? MAP_W - 1 : ix + 1;
    const r0 = (iy < 0 ? 0 : iy >= MAP_H ? MAP_H - 1 : iy) * MAP_W, r1 = (iy + 1 < 0 ? 0 : iy + 1 >= MAP_H ? MAP_H - 1 : iy + 1) * MAP_W;
    l00 = LAND_OF_CLIMATE[climates[r0 + x0]]; l10 = LAND_OF_CLIMATE[climates[r0 + x1]]; l01 = LAND_OF_CLIMATE[climates[r1 + x0]]; l11 = LAND_OF_CLIMATE[climates[r1 + x1]];
  }
  if (l00 === l10 && l00 === l01 && l00 === l11) { _share[l00] = 1; return 1 << l00; }
  const u = smooth01(fx - ix), v = smooth01(fy - iy);
  _share[l00] = 0; _share[l10] = 0; _share[l01] = 0; _share[l11] = 0;
  _share[l00] += (1 - u) * (1 - v); _share[l10] += u * (1 - v); _share[l01] += (1 - u) * v; _share[l11] += u * v;
  return (1 << l00) | (1 << l10) | (1 << l01) | (1 << l11);
}

/**
 * @param {number} gx
 * @param {number} gy
 * @param {number} macro
 * @param {number} low
 * @param {?ReturnType<typeof hillLattice>} [lattice]
 * @param {?Uint8Array} [climates]
 * @param {?Float64Array} [out]
 * @param {number} [span]
 * @returns {number}
 */
export function hillsAt(gx, gy, macro, low, lattice = null, climates = null, out = null, span = HEIGHTMAP_DIMENSION - 1) {
  const H = LANDFORM_DIALS.hills;
  const e = macro - LANDFORM_KNEE;
  if (out) out[0] = 0;
  if (!(e > 0)) return 0;
  const fx = gx / HILL_NODE, fy = gy / HILL_NODE, ix = Math.floor(fx), iy = Math.floor(fy), u = fx - ix, v = fy - iy;
  let vals = _node, i00 = 0, i10 = NODE_VALUES, i01 = 2 * NODE_VALUES, i11 = 3 * NODE_VALUES;
  const li = lattice ? ix - lattice.nx0 : -1, lj = lattice ? iy - lattice.ny0 : -1;
  if (lattice && li >= 0 && lj >= 0 && li + 1 < lattice.side && lj + 1 < lattice.side) {
    vals = lattice.vals;
    i00 = (lj * lattice.side + li) * NODE_VALUES; i10 = i00 + NODE_VALUES; i01 = i00 + lattice.side * NODE_VALUES; i11 = i01 + NODE_VALUES;
  } else {
    hillNode(ix, iy, _node, 0); hillNode(ix + 1, iy, _node, i10); hillNode(ix, iy + 1, _node, i01); hillNode(ix + 1, iy + 1, _node, i11);
  }
  const a = (1 - u) * (1 - v), b = u * (1 - v), c = (1 - u) * v, d = u * v;
  const region = vals[i00] * a + vals[i10] * b + vals[i01] * c + vals[i11] * d;
  const wx = gx + (vals[i00 + 1] * a + vals[i10 + 1] * b + vals[i01 + 1] * c + vals[i11 + 1] * d);
  const wy = gy + (vals[i00 + 2] * a + vals[i10 + 2] * b + vals[i01 + 2] * c + vals[i11 + 2] * d);
  const rock = vals[i00 + 3] * a + vals[i10 + 3] * b + vals[i01 + 3] * c + vals[i11 + 3] * d;
  const up = smooth01((low - LANDFORM_KNEE) / H.uplandAt);
  const mask = landShares(gx, gy, climates, span);
  let top = 0, sum = 0, deep = 0;
  for (let j = 0; j < LANDS.length; j++) {
    if (!(mask & (1 << j))) continue;
    const land = LANDS[j], w = _share[j];
    if (!(w > 0)) continue;
    top += w * LAND_TOP[j];
    const amp = w * (land.low + (land.high - land.low) * region) * (1 + (land.upland - 1) * up);
    deep += amp;
    sum += amp * landShape(j, wx, wy, gx, gy, rock);
    if (land.peaks) {
      const pa = w * land.peaks.high * (1 + (land.upland - 1) * up) / land.upland;
      const sharp = !!land.peaks.sharp;
      sum += pa * (peakField(wx, wy, land.peaks.cell, land.peaks.fill, sharp) - land.peaks.fill * (sharp ? PEAK_MEAN_SHARP : PEAK_MEAN));
      deep += pa;
    }
  }
  const ease = smooth01(e / (H.coast * top));
  if (out) out[0] = deep * ease;
  return sum * ease;
}

/**
 * @param {(x: number, y: number) => number} climateAt
 * @returns {Uint8Array}
 */
export function landformClimates(climateAt) {
  const out = new Uint8Array(MAP_W * MAP_H);
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) out[y * MAP_W + x] = climateAt(x, y) & 255;
  return out;
}

const NO_HILLS = () => 0;

const SITE_BIAS = 16;

/**
 * Built once on the main thread from the map rows of the game itself, never a mod addition or a spawn, so every
 * kernel reads the same sites.
 * @param {Iterable<{px: number, py: number, loc: object}>} rows
 * @returns {Uint8Array}
 */
export function landformSites(rows) {
  const out = new Uint8Array(4 * MAP_W * MAP_H);
  const b = (v) => Math.max(1, Math.min(255, v + SITE_BIAS));
  for (const { px, py, loc } of rows) {
    if (!loc?.exterior?.exteriorData || !loc.mapTableData || px < 0 || py < 0 || px >= MAP_W || py >= MAP_H) continue;
    const r = locationFootprintRect(loc);
    const i = 4 * (py * MAP_W + px);
    out[i] = b(r.xMin); out[i + 1] = b(r.xMax); out[i + 2] = b(r.yMin); out[i + 3] = b(r.yMax);
  }
  return out;
}

const _siteLevels = new WeakMap();
const NO_CLIMATES = Object.freeze({});
const SITE_LEVELS_KEPT = 4096;

/**
 * @param {object} woods
 * @param {number} sx
 * @param {number} sy
 * @param {number} hDim
 * @param {{hills: boolean, climates: ?Uint8Array}} ground
 * @returns {number}
 */
function siteLevel(woods, sx, sy, hDim, ground) {
  let byWorld = _siteLevels.get(woods);
  if (!byWorld) _siteLevels.set(woods, byWorld = new WeakMap());
  let kept = byWorld.get(ground.climates ?? NO_CLIMATES);
  if (!kept) byWorld.set(ground.climates ?? NO_CLIMATES, kept = new Map());
  const k = ((sy * MAP_W + sx) * 1024 + hDim) * 2 + (ground.hills ? 0 : 1);
  let level = kept.get(k);
  if (level !== undefined) return level;
  const span = hDim - 1, step = LANDFORM_DIALS.site.grid;
  const kernel = sampleKernel(woods, sx, sy, hDim, true, null);
  const { base, noise } = kernelTerms(woods, sx, sy, hDim);
  const cliff = cliffFade(woods, sx, sy, hDim);
  const ox = sx * span, oy = (MAP_H - sy) * span;
  const lattice = ground.hills ? hillLattice(ox, oy, span) : null;
  let sum = 0, n = 0, wet = 0, nw = 0;
  for (let x = 0; x <= span; x += step) {
    for (let y = 0; y <= span; y += step) {
      const h = kernel(x, y) * MAX_TERRAIN_HEIGHT;
      if (!(h > LANDFORM_KNEE)) { wet += h; nw++; continue; }
      n++;
      const low = base(x, y) * BASE_HEIGHT_SCALE;
      const macro = Math.min(Math.max(low + noise(x, y) * NOISE_MAP_SCALE, SCALED_OCEAN_ELEVATION), MAX_TERRAIN_HEIGHT);
      sum += h + (cliff ? reliefLift(low) * cliff(x, y) : reliefLift(low)) + (ground.hills ? hillsAt(ox + x, oy + y, macro, low, lattice, ground.climates, null, span) : 0);
    }
  }
  level = n ? sum / n : wet / nw;
  if (kept.size >= SITE_LEVELS_KEPT) kept.delete(kept.keys().next().value);
  kept.set(k, level);
  return level;
}

/**
 * Sites are listed in one global order, pixel row then column, so two pixels sharing a sample fold them in the same
 * order and get the same float.
 * @returns {Array<{x0: number, x1: number, y0: number, y1: number, reach: number, level: () => number}>}
 */
function sitesAbout(woods, sites, px, py, span, hDim, ground) {
  const out = [];
  if (!sites) return out;
  const { reach, per, most } = LANDFORM_DIALS.site;
  const scale = span / WORLD_MAP_TILE_DIM;
  for (let qy = py - 2; qy <= py + 2; qy++) {
    if (qy < 0 || qy >= MAP_H) continue;
    for (let qx = px - 2; qx <= px + 2; qx++) {
      if (qx < 0 || qx >= MAP_W) continue;
      const i = 4 * (qy * MAP_W + qx);
      if (!sites[i]) continue;
      const ox = qx * span, oy = (MAP_H - qy) * span;
      const x0 = ox + (sites[i] - SITE_BIAS) * scale, x1 = ox + (sites[i + 1] - SITE_BIAS) * scale;
      const y0 = oy + (sites[i + 2] - SITE_BIAS) * scale, y1 = oy + (sites[i + 3] - SITE_BIAS) * scale;
      let level;
      out.push({ x0, x1, y0, y1, reach: Math.min(most, reach + per * Math.max(x1 - x0, y1 - y0) / 2), level: () => (level ??= siteLevel(woods, qx, qy, hDim, ground)) });
    }
  }
  return out;
}

/**
 * @param {ReturnType<typeof sitesAbout>} list
 * @param {number} gx
 * @param {number} gy
 * @param {number} land
 * @param {Float64Array} out
 * @returns {number}
 */
function pullTo(list, gx, gy, land, out) {
  let keep = 1, ws = 0, wt = 0;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const dx = gx < s.x0 ? s.x0 - gx : gx > s.x1 ? gx - s.x1 : 0;
    const dy = gy < s.y0 ? s.y0 - gy : gy > s.y1 ? gy - s.y1 : 0;
    if (!(dx < s.reach && dy < s.reach)) continue;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (!(d < s.reach)) continue;
    const w = 1 - smooth01(d / s.reach);
    keep *= 1 - w;
    const w4 = w * w * w * w;
    ws += w4;
    wt += w4 * s.level();
  }
  if (keep === 1 || !(ws > 0)) { out[0] = 1; return land; }
  const level = wt / ws;
  const move = level > land ? (1 - keep) * smooth01((land - LANDFORM_KNEE) / (level - LANDFORM_KNEE)) : 1 - keep;
  out[0] = 1 - move;
  return land + (level - land) * move;
}

export function reliefByteHeight(byte, fade = 1) {
  const low = byte * BASE_HEIGHT_SCALE;
  return Math.max(low, SCALED_OCEAN_ELEVATION) + reliefLift(low) * fade;
}

/** @returns {(x: number, y: number) => number} */
export function meanGroundField(woods, px, py, landforms, hDim = HEIGHTMAP_DIMENSION) {
  const { base, noise } = kernelTerms(woods, px, py, hDim);
  const fade = landforms ? cliffFade(woods, px, py, hDim) : null;
  return (x, y) => {
    const low = base(x, y) * BASE_HEIGHT_SCALE;
    let h = low + noise(x, y) * NOISE_MAP_SCALE;
    h = h < SCALED_OCEAN_ELEVATION ? SCALED_OCEAN_ELEVATION : h > MAX_TERRAIN_HEIGHT ? MAX_TERRAIN_HEIGHT : h;
    return landforms ? h + reliefLift(low) * (fade ? fade(x, y) : 1) : h;
  };
}

function cubicBernstein(v0, v1, v2, v3, a, b, out, o = 0) {
  const A = (v3 - v2) - (v0 - v1), B = (v0 - v1) - A, C = v2 - v0, D = v1, w = b - a;
  const d = ((A * a + B) * a + C) * a + D, c = w * ((3 * A * a + 2 * B) * a + C), q = w * w * (3 * A * a + B), p = w * w * w * A;
  out[o] = d; out[o + 1] = d + c / 3; out[o + 2] = d + (2 * c + q) / 3; out[o + 3] = p + q + c + d;
}
const _rows = new Float64Array(16), _net = new Float64Array(4);
function bicubicNet(at, x0, x1, y0, y1, k, into) {
  for (let j = 0; j < 4; j++) cubicBernstein(at(0, j), at(1, j), at(2, j), at(3, j), x0, x1, _rows, j * 4);
  for (let i = 0; i < 4; i++) {
    cubicBernstein(_rows[i], _rows[4 + i], _rows[8 + i], _rows[12 + i], y0, y1, _net);
    for (let l = 0; l < 4; l++) into[l * 4 + i] += k * _net[l];
  }
}
const _sum = new Float64Array(16), _low = new Float64Array(16);
/**
 * An upper bound on the pixel's own ground, never a sample. Sites and paths reach into neighbor pixels, so bounding
 * one sample needs the 3x3 maximum.
 * @returns {number}
 */
export function groundTopOf(woods, px, py, landforms, climates = null, hDim = HEIGHTMAP_DIMENSION) {
  const { shmAt, lhmAt } = kernelWindows(woods, px, py);
  // Matches kernelTerms' `base`, whose rows run in reverse as the fraction runs north.
  const base = (i, j) => shmAt(i, 3 - j);
  let top = -Infinity, lowTop = -Infinity;
  _low.fill(0);
  bicubicNet(base, 0, 1, 0, 1, BASE_HEIGHT_SCALE, _low);
  for (let k = 0; k < 16; k++) if (_low[k] > lowTop) lowTop = _low[k];
  for (let iy = 0; iy < 3; iy++) {
    for (let ix = 0; ix < 3; ix++) {
      _sum.fill(0);
      bicubicNet(base, ix / 3, (ix + 1) / 3, iy / 3, (iy + 1) / 3, BASE_HEIGHT_SCALE, _sum);
      bicubicNet((i, j) => lhmAt(ix + i, iy + j), 0, 1, 0, 1, NOISE_MAP_SCALE, _sum);
      for (let k = 0; k < 16; k++) if (_sum[k] > top) top = _sum[k];
    }
  }
  let h = Math.min(MAX_TERRAIN_HEIGHT, Math.max(SCALED_OCEAN_ELEVATION, top + EXTRA_NOISE_SCALE));
  if (!landforms) return h;
  let hill = climates ? 0 : HILLS_TOP;
  if (climates) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) hill = Math.max(hill, LAND_TOP[etherLandAt(px + dx, py + dy, climates)]);
  return h + reliefLift(lowTop) + hill;
}

/**
 * @param {object} woods
 * @param {number} px
 * @param {number} py
 * @param {number} sx
 * @param {number} sy
 * @param {?{xMin: number, xMax: number, yMin: number, yMax: number}} [locationRect]
 * @param {number} [hDim]
 * @param {?object} [landforms]
 * @returns {number}
 */
export function landformLift(woods, px, py, sx, sy, locationRect = null, hDim = HEIGHTMAP_DIMENSION, landforms = null) {
  return landformLiftField(woods, px, py, locationRect, hDim, landforms)(sx, sy);
}

/** @returns {(sx: number, sy: number) => number} */
export function landformLiftField(woods, px, py, locationRect = null, hDim = HEIGHTMAP_DIMENSION, landforms = null) {
  const span = hDim - 1;
  const lf = landforms ?? createLandforms({ woods, hDim });
  let f;
  if (!locationRect) {
    const shaped = sampleKernel(woods, px, py, hDim, true, lf), plain = sampleKernel(woods, px, py, hDim, true, null);
    // Rounds each sample to float32 as generateSamples does, so the field matches the built ground.
    const memo = new Map();
    f = (x, y) => {
      const k = x * hDim + y;
      let v = memo.get(k);
      if (v === undefined) memo.set(k, v = (Math.fround(shaped(x, y)) - Math.fround(plain(x, y))) * MAX_TERRAIN_HEIGHT);
      return v;
    };
  } else {
    const field = new Float32Array(hDim * hDim);
    let sum = 0;
    const classic = new Float32Array(hDim * hDim), shaped = generateSamples(woods, px, py, hDim, lf, classic);
    for (let i = 0; i < field.length; i++) sum += (field[i] = (shaped[i] - classic[i]) * MAX_TERRAIN_HEIGHT);
    blendLocationTerrain(field, sum / field.length, locationRect, hDim);
    f = (x, y) => field[x * hDim + y];
  }
  // Bilinear between samples, matching the collider floor read in heightAt.
  return (sx, sy) => {
    const cx = Math.max(0, Math.min(span, sx)), cy = Math.max(0, Math.min(span, sy));
    const ix = Math.min(span - 1, Math.floor(cx)), iy = Math.min(span - 1, Math.floor(cy));
    const fx = cx - ix, fy = cy - iy;
    return f(ix, iy) * (1 - fx) * (1 - fy) + f(ix + 1, iy) * fx * (1 - fy) + f(ix, iy + 1) * (1 - fx) * fy + f(ix + 1, iy + 1) * fx * fy;
  };
}

/**
 * @param {object} o
 * @param {object} o.woods
 * @param {?{roads: Uint8Array, tracks: Uint8Array, rivers?: ?Uint8Array, streams?: ?Uint8Array, water?: boolean}} [o.roads]
 * @param {?Uint8Array} [o.sites]
 * @param {boolean} [o.hills]
 * @param {?Uint8Array} [o.climates]
 * @param {number} [o.hDim]
 * @returns {{ pixel: (px: number, py: number) => (x: number, y: number, h: number, low: number, g: number) => number, rivers: boolean }}
 */
export function createLandforms({ woods, roads = null, sites = null, hills = true, climates = null, hDim = HEIGHTMAP_DIMENSION } = {}) {
  const span = hDim - 1;
  const half = span / 2;
  const cutRivers = !!roads?.water;
  const nets = LAYERS.map((l) => (l.water && !cutRivers ? null : roads?.[l.key] ?? null));
  const hill = !hills ? NO_HILLS : (gx, gy, macro, low, lattice, out) => hillsAt(gx, gy, macro, low, lattice, climates, out, span);
  const ground = { hills: !!hills, climates };
  return { pixel: (px, py) => pixelShaper(woods, nets, hill, ground, sites, px, py, span, half, hDim), rivers: cutRivers };
}

function armsAbout(net, px, py, around, span, half) {
  const segs = [];
  for (let qy = py - around; qy <= py + around; qy++) {
    if (qy < 0 || qy >= MAP_H) continue;
    for (let qx = px - around; qx <= px + around; qx++) {
      if (qx < 0 || qx >= MAP_W) continue;
      const mask = net[qy * MAP_W + qx];
      if (!mask) continue;
      const cx = qx * span + half, cy = (MAP_H - qy) * span + half;
      for (const [bit, mdx, mdy] of DIR_DELTA) {
        if (!(mask & bit)) continue;
        const len = half * Math.sqrt(mdx * mdx + mdy * mdy);
        segs.push({ ax: cx, ay: cy, ux: (mdx * half) / len, uy: (-mdy * half) / len, len });
      }
    }
  }
  return segs;
}

function nearestD2(segs, gx, gy, r2) {
  let d2 = r2;
  for (let si = 0; si < segs.length; si++) {
    const sg = segs[si];
    const vx = gx - sg.ax, vy = gy - sg.ay;
    let t = vx * sg.ux + vy * sg.uy;
    if (t < 0) t = 0; else if (t > sg.len) t = sg.len;
    const qx = vx - sg.ux * t, qy = vy - sg.uy * t, q = qx * qx + qy * qy;
    if (q < d2) d2 = q;
  }
  return d2;
}

function pixelShaper(woods, nets, hill, ground, sites, px, py, span, half, hDim) {
  const ox = px * span;
  const oy = (MAP_H - py) * span;
  const cliff = cliffFade(woods, px, py, hDim);
  const around = sitesAbout(woods, sites, px, py, span, hDim, ground);
  const near = around.filter((s) => s.x1 + s.reach > ox && s.x0 - s.reach < ox + span && s.y1 + s.reach > oy && s.y0 - s.reach < oy + span);
  const kept = new Float64Array(1);
  const lattice = hill === NO_HILLS ? null : hillLattice(ox, oy, span);
  const valleys = [];
  if (hill !== NO_HILLS) {
    for (const [li, radius] of [[0, LANDFORM_DIALS.valley.stream], [1, LANDFORM_DIALS.valley.river]]) {
      const segs = nets[li] ? armsAbout(nets[li], px, py, 2, span, half) : [];
      if (segs.length) valleys.push({ segs, radius, r2: radius * radius });
    }
  }
  const easeways = [];
  if (hill !== NO_HILLS && LANDFORM_DIALS.ease.keep < 1) {
    for (const [li, radius] of [[2, LANDFORM_DIALS.ease.track], [3, LANDFORM_DIALS.ease.road]]) {
      const segs = nets[li] ? armsAbout(nets[li], px, py, 1, span, half) : [];
      if (segs.length) easeways.push({ segs, radius, r2: radius * radius });
    }
  }
  const easeAt = (gx, gy) => {
    let e = 1;
    for (let vi = 0; vi < easeways.length; vi++) {
      const v = easeways[vi], d2 = nearestD2(v.segs, gx, gy, v.r2);
      if (!(d2 < v.r2)) continue;
      const k = 1 - (1 - LANDFORM_DIALS.ease.keep) * (1 - smooth01(Math.sqrt(d2) / v.radius));
      if (k < e) e = k;
    }
    return e;
  };
  const carve = (gx, gy, h, deep) => {
    let out = h;
    for (let vi = 0; vi < valleys.length; vi++) {
      const v = valleys[vi], d2 = nearestD2(v.segs, gx, gy, v.r2);
      if (!(d2 < v.r2)) continue;
      const k = smooth01(Math.sqrt(d2) / v.radius);
      const c = h * k - deep * (1 - k);
      if (c < out) out = c;
    }
    return out;
  };
  const deepOut = new Float64Array(1);
  const landAt = (gx, gy, h, macro, low, fade, list) => {
    let hh = 0;
    if (hill !== NO_HILLS) {
      hh = hill(gx, gy, macro, low, lattice, deepOut);
      if (easeways.length) hh *= easeAt(gx, gy);
      if (valleys.length) hh = carve(gx, gy, hh, deepOut[0]);
    }
    const l = h + reliefLift(low) * fade + hh;
    if (!list.length) { kept[0] = 1; return l; }
    return pullTo(list, gx, gy, l, kept);
  };
  const terms = new Map();
  const termsOf = (qx, qy) => {
    const k = qy * MAP_W + qx;
    let t = terms.get(k);
    if (!t) terms.set(k, t = { ...kernelTerms(woods, qx, qy, hDim), cliff: cliffFade(woods, qx, qy, hDim) });
    return t;
  };
  // Segments are gathered in one global order (pixel row, column, then DIR_DELTA compass order), so both pixels on
  // a seam sum them alike and get the same float.
  const layers = [];
  for (let li = 0; li < LAYERS.length; li++) {
    const net = nets[li];
    if (!net) continue;
    const dial = LAYERS[li].dial;
    const reach = dial.flat + dial.bank + dial.verge;
    const segs = [];
    for (let qy = py - 1; qy <= py + 1; qy++) {
      if (qy < 0 || qy >= MAP_H) continue;
      for (let qx = px - 1; qx <= px + 1; qx++) {
        if (qx < 0 || qx >= MAP_W) continue;
        const mask = net[qy * MAP_W + qx];
        if (!mask) continue;
        const cx = qx * span + half;
        const cy = (MAP_H - qy) * span + half;
        for (const [bit, mdx, mdy] of DIR_DELTA) {
          if (!(mask & bit)) continue;
          // The compass map Y runs south and this frame's y runs north.
          const dx = mdx, dy = -mdy;
          const ex = cx + dx * half, ey = cy + dy * half;
          if (Math.max(cx, ex) < ox - reach || Math.min(cx, ex) > ox + span + reach
            || Math.max(cy, ey) < oy - reach || Math.min(cy, ey) > oy + span + reach) continue;
          const len = half * Math.sqrt(dx * dx + dy * dy);
          segs.push({ ax: cx, ay: cy, ux: (dx * half) / len, uy: (dy * half) / len, len, dx, dy, qx, qy, prof: null });
        }
      }
    }
    if (segs.length) layers.push({ dial, reach, segs, water: LAYERS[li].water, ford: !!LAYERS[li].ford, hold: LAYERS[li].water ? Infinity : bankHold(dial, span) });
  }
  const profileOf = (s) => {
    if (s.prof) return s.prof;
    const { base, noise, cliff } = termsOf(s.qx, s.qy);
    const prof = new Float64Array(half + 1);
    const sox = s.qx * span, soy = (MAP_H - s.qy) * span;
    for (let k = 0; k <= half; k++) {
      const lx = half + s.dx * k, ly = half + s.dy * k;
      const b = base(lx, ly);
      const low = b * BASE_HEIGHT_SCALE;
      const macro = Math.min(Math.max(low + noise(lx, ly) * NOISE_MAP_SCALE, SCALED_OCEAN_ELEVATION), MAX_TERRAIN_HEIGHT);
      prof[k] = macro > LANDFORM_KNEE ? landAt(sox + lx, soy + ly, macro, macro, low, cliff ? cliff(lx, ly) : 1, around) : macro;
    }
    return (s.prof = prof);
  };
  const graded = (s, t) => {
    const prof = profileOf(s);
    const f = (t / s.len) * half;
    const i = Math.min(half - 1, Math.floor(f));
    return prof[i] + (prof[i + 1] - prof[i]) * (f - i);
  };
  const targets = new Float64Array(LAYERS.length);
  const weights = new Float64Array(LAYERS.length);
  const dmins = new Float64Array(LAYERS.length);

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} h
   * @param {number} low
   * @param {number} g
   * @returns {number}
   */
  return (x, y, h, low, g) => {
    if (!(h > LANDFORM_KNEE)) return h;
    const gx = ox + x, gy = oy + y;
    const raw = h + (cliff ? reliefLift(low) * cliff(x, y) : reliefLift(low));
    const least = raw < LANDFORM_FLOOR ? raw : LANDFORM_FLOOR;
    let land = landAt(gx, gy, h, h - g, low, cliff ? cliff(x, y) : 1, near);
    if (land < least) land = least;
    const keep = kept[0];
    if (!layers.length) return land;
    let touched = false;
    for (let li = 0; li < layers.length; li++) {
      const { dial, reach, segs } = layers[li];
      let dmin = Infinity, ws = 0, wf = 0;
      for (let si = 0; si < segs.length; si++) {
        const s = segs[si];
        const vx = gx - s.ax, vy = gy - s.ay;
        let t = vx * s.ux + vy * s.uy;
        const past = t < 0 ? -t : t > s.len ? t - s.len : 0;
        if (t < 0) t = 0; else if (t > s.len) t = s.len;
        const qx = vx - s.ux * t, qy = vy - s.uy * t;
        const d = Math.sqrt(qx * qx + qy * qy);
        if (!(d < reach)) continue;
        if (d < dmin) dmin = d;
        // Squares are written as products, never with `**`, so no engine pow enters ground math.
        const q = d * d + 0.25, r = 1 - d / reach;
        const w = ((r * r) / (q * q)) * (1e-3 + 0.999 * (1 - smooth01(past)));
        ws += w;
        wf += w * graded(s, t);
      }
      dmins[li] = dmin;
      if (dmin === Infinity) { weights[li] = 0; continue; }
      touched = true;
      const floor = wf / ws - dial.drop;
      const smoothLand = land - g * keep;
      const top = dial.drop > 0 && !(smoothLand > floor + dial.drop) ? floor + dial.drop : smoothLand;
      const edge = dial.flat + dial.bank;
      targets[li] = dmin <= edge
        ? floor + (top - floor) * smoothstep(dial.flat, edge, dmin)
        : top + (land - top) * smoothstep(edge, reach, dmin);
      if (dmin <= edge) {
        const hold = layers[li].hold;
        if (targets[li] > smoothLand + hold) targets[li] = smoothLand + hold;
        else if (targets[li] < smoothLand - hold) targets[li] = smoothLand - hold;
      }
      weights[li] = 1 - smoothstep(edge, reach, dmin);
    }
    if (!touched) return land;
    const fade = smoothstep(LANDFORM_KNEE, LANDFORM_KNEE + LANDFORM_DIALS.coast, land);
    let chan = 0;
    for (let li = 0; li < layers.length; li++) {
      if (!layers[li].water || !(weights[li] > 0)) continue;
      const d = layers[li].dial, c = 1 - smoothstep(d.flat, d.flat + d.bank, dmins[li]);
      if (c > chan) chan = c;
    }
    let out = land;
    for (let li = 0; li < layers.length; li++) {
      let a = weights[li] * fade;
      if (chan > 0 && !layers[li].water && (layers[li].ford || dmins[li] > layers[li].dial.flat)) a *= 1 - chan;
      if (a > 0) out += (targets[li] - out) * a;
    }
    return out > least ? out : least;
  };
}
