// @ts-check
import { ecoHash } from '../ecotone.js';
import { fogFactor } from '../weather.js';

export const JUNGLE_HAZE = Object.freeze({
  edge: Object.freeze({ out: 320, in: 760 }),
  density: 0.0055,
  layer: 28,
  falloff: 90,
  start: 8,
  day: Object.freeze([
    Object.freeze([0, 1.25]), Object.freeze([4.5, 1.35]), Object.freeze([6.5, 1.65]), Object.freeze([9, 1.15]),
    Object.freeze([13, 0.82]), Object.freeze([16, 0.9]), Object.freeze([18.5, 1.08]), Object.freeze([21, 1.2]), Object.freeze([24, 1.25]),
  ]),
  weather: Object.freeze({ sunny: 1, cloudy: 1.05, overcast: 1.12, fog: 1.4, rain: 1.3, thunder: 1.42, snow: 1.15, sandstorm: 1 }),
  drift: Object.freeze({ cell: 540, amp: 0.24, speed: 1.6, still: 0.35, salt: 811 }),
  lag: Object.freeze({ share: 1.4, density: 2.5, floor: 3.5 }),
  jump: 250,
  grey: 0.42,
  tint: Object.freeze([0.88, 1.0, 0.85]),
  weighAt: 300,
  cull: 1 / 512,
});

const smoothstep = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const hazeShare = (depth) => smoothstep(-JUNGLE_HAZE.edge.out, JUNGLE_HAZE.edge.in, depth);

export function hazeDayFactor(hour) {
  const h = ((hour % 24) + 24) % 24, k = JUNGLE_HAZE.day;
  for (let i = 1; i < k.length; i++) {
    if (h <= k[i][0]) {
      const t = (h - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
      return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * t;
    }
  }
  return k[k.length - 1][1];
}

export const hazeWeatherFactor = (weather) => (Object.hasOwn(JUNGLE_HAZE.weather, weather) ? JUNGLE_HAZE.weather[weather] : 1);

// `x` and `z` are absolute world meters, so the caller adds the floating-origin shift. `wind` sets only the drift
// direction.
export function hazeDrift(x, z, t, wind = null) {
  const d = JUNGLE_HAZE.drift, wl = wind ? Math.hypot(wind[0], wind[1]) : 0;
  const wx = wl > 1e-6 ? (wind[0] / wl) * d.speed : d.still, wz = wl > 1e-6 ? (wind[1] / wl) * d.speed : 0;
  const qx = (x - wx * t) / d.cell, qz = (z - wz * t) / d.cell;
  const ix = Math.floor(qx), iz = Math.floor(qz), fx = qx - ix, fz = qz - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = ecoHash(ix, iz, d.salt), b = ecoHash(ix + 1, iz, d.salt), c = ecoHash(ix, iz + 1, d.salt), e = ecoHash(ix + 1, iz + 1, d.salt);
  const n = (a + (b - a) * ux) + ((c + (e - c) * ux) - (a + (b - a) * ux)) * uz;
  return 1 + d.amp * (2 * n - 1);
}

// Must match `hazeMean` in `render/hazeGlsl.js` term for term.
export function hazeMean(a, b) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  if (hi <= 0) return 1;
  const span = hi - lo;
  if (span < 1e-4) return Math.exp(-Math.max(lo, 0));
  const lo0 = Math.max(lo, 0);
  return ((lo0 - lo) + (Math.exp(-lo0) - Math.exp(-hi))) / span;
}

/**
 * Must match `hazeAt` in `render/hazeGlsl.js` term for term.
 * @param {ArrayLike<number>} u
 * @param {ArrayLike<number>} eye
 * @param {ArrayLike<number>} p
 */
export function hazeTransmittance(u, eye, p) {
  if (!(u[4] >= 0.5)) return 1;
  const run = Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]) - u[3];
  if (run <= 0) return 1;
  return Math.exp(-u[0] * run * hazeMean((eye[1] - u[1]) * u[2], (p[1] - u[1]) * u[2]));
}

export function createHazeState() {
  return { share: 0, density: 0, floor: 0, eye: null, primed: false };
}

/**
 * @param {ReturnType<typeof createHazeState>} s
 * @param {{ dt: number, eye: ArrayLike<number>, share: number, density: number, floor: number }} target
 */
export function stepHaze(s, { dt, eye, share, density, floor }) {
  const jumped = !s.primed || !s.eye || Math.hypot(eye[0] - s.eye[0], eye[2] - s.eye[2]) > JUNGLE_HAZE.jump;
  s.share = eased(jumped, s.share, share, dt, JUNGLE_HAZE.lag.share);
  s.density = eased(jumped, s.density, density, dt, JUNGLE_HAZE.lag.density);
  s.floor = eased(jumped, s.floor, floor, dt, JUNGLE_HAZE.lag.floor);
  const e = (s.eye ??= [0, 0, 0]);
  e[0] = eye[0]; e[1] = eye[1]; e[2] = eye[2];
  s.primed = true;
  return s;
}
const eased = (jumped, from, to, dt, lag) => (jumped ? to : from + (to - from) * (1 - Math.exp(-Math.max(0, dt) / lag)));

/**
 * Layout matches `uJungleHaze` in `render/hazeGlsl.js`: floor extinction, floor height, 1 / falloff, clear start,
 * then the on flag.
 * @param {ReturnType<typeof createHazeState>} s
 * @param {Float32Array} [out]
 */
export function hazeUniforms(s, out = new Float32Array(8)) {
  const k = s.share * s.density;
  out[0] = k; out[1] = s.floor; out[2] = 1 / JUNGLE_HAZE.falloff; out[3] = JUNGLE_HAZE.start;
  out[4] = k > 1e-7 ? 1 : 0; out[5] = 0; out[6] = 0; out[7] = 0;
  return out;
}

export const hazeDensityAt = (u, y) => (u[4] >= 0.5 ? u[0] * Math.exp(-Math.max(0, (y - u[1]) * u[2])) : 0);

export function hazeColumn(u, y) {
  if (!(u[4] >= 0.5)) return 0;
  const under = Math.max(0, u[1] - y);
  return u[0] * (under + Math.exp(-Math.max(0, (y - u[1]) * u[2])) / u[2]);
}

export function hazeColorOf(fog, out = new Float32Array(3)) {
  const lum = 0.299 * fog[0] + 0.587 * fog[1] + 0.114 * fog[2];
  const t = JUNGLE_HAZE.tint, tl = 0.299 * t[0] + 0.587 * t[1] + 0.114 * t[2];
  for (let c = 0; c < 3; c++) out[c] = Math.min(1, Math.max(0, (fog[c] + (lum - fog[c]) * JUNGLE_HAZE.grey) * (t[c] / tl)));
  return out;
}

/**
 * @param {ArrayLike<number>} fogColor
 * @param {any} fogRow
 * @param {ArrayLike<number>} u
 * @param {number} eyeY
 * @param {Float32Array} [out]
 */
const _hazeColour = new Float32Array(3);
export function fogColorWith(fogColor, fogRow, u, eyeY, out = new Float32Array(3)) {
  const th = hazeDensityAt(u, eyeY) * Math.max(0, JUNGLE_HAZE.weighAt - (u[3] ?? 0));
  if (!(th > 0)) { out[0] = fogColor[0]; out[1] = fogColor[1]; out[2] = fogColor[2]; return out; }
  const fw = fogRow ? fogFactor(fogRow, JUNGLE_HAZE.weighAt) : 1;
  const tw = -Math.log(Math.max(1e-4, Math.min(1, fw)));
  const h = hazeColorOf(fogColor, _hazeColour), w = th / (th + tw);
  for (let c = 0; c < 3; c++) out[c] = fogColor[c] + (h[c] - fogColor[c]) * w;
  return out;
}

export function hazeSkyUniform(color, u, eyeY, out = new Float32Array(4)) {
  out[0] = color[0]; out[1] = color[1]; out[2] = color[2]; out[3] = hazeColumn(u, eyeY);
  return out;
}

/**
 * A conservative bound: the top of the nearest box point crosses the thinnest haze of any ray into the box. Only
 * haze counts, because the sky shown instead has the same haze and no weather fog.
 * @param {ArrayLike<number>} u
 * @param {ArrayLike<number>} eye
 * @param {ArrayLike<number>} box
 * @param {ArrayLike<number>} [t]
 */
const ZERO3 = Object.freeze([0, 0, 0]);
export function hazeHides(u, eye, box, t = ZERO3) {
  if (!(u[4] >= 0.5)) return false;
  const nx = Math.max(box[0] + t[0] - eye[0], 0, eye[0] - (box[3] + t[0]));
  const ny = Math.max(box[1] + t[1] - eye[1], 0, eye[1] - (box[4] + t[1]));
  const nz = Math.max(box[2] + t[2] - eye[2], 0, eye[2] - (box[5] + t[2]));
  const d = Math.hypot(nx, ny, nz);
  const run = d - u[3];
  if (run <= 0) return false;
  return Math.exp(-u[0] * run * hazeMean((eye[1] - u[1]) * u[2], (box[4] + t[1] - u[1]) * u[2])) < JUNGLE_HAZE.cull;
}
