// @ts-check
// The sun baby event sky: one fullscreen pass of flowers and a sun with phases, staged by `/event sunbaby`.
// SUNBABY_GLSL is generated from the tables below, so the JS and the GLSL cannot drift.
// The land wears SUNBABY_WEATHER while the event is up; the sim's own weather continues underneath.

import { seededRng } from '../weather/wind.js';
import { slotHash } from './dreadSky.js';

export const SUNBABY_EVENT = 'sunbaby';
export const SUNBABY_FADE_S = 8;
export const SUNBABY_WEATHER = 'sunny';

export const SUNBABY_ZENITH = Object.freeze([0.18, 0.52, 0.93]);
export const SUNBABY_HORIZON = Object.freeze([0.70, 0.88, 1.0]);
export const SUNBABY_PETALS = Object.freeze([
  Object.freeze([1.0, 0.56, 0.74]),
  Object.freeze([1.0, 0.90, 0.36]),
  Object.freeze([1.0, 0.98, 0.95]),
  Object.freeze([0.78, 0.60, 1.0]),
  Object.freeze([1.0, 0.36, 0.34]),
  Object.freeze([0.55, 0.80, 1.0]),
]);
export const SUNBABY_HEART = Object.freeze([1.0, 0.72, 0.16]);
export const SUNBABY_DENSITY = Object.freeze([0.72, 0.6]);

export const SUNBABY_SUN_RADIUS = 0.19;
export const SUNBABY_SUN_ELEV_DEG = 30;
export const SUNBABY_SUN_SET_DEG = -24;
export const SUNBABY_SUN_BEARING = 0.4;
export const SUNBABY_SKIN = Object.freeze([1.0, 0.84, 0.70]);
export const SUNBABY_RIM = Object.freeze([1.0, 0.80, 0.18]);
export const SUNBABY_RAY = Object.freeze([1.0, 0.86, 0.30]);
export const SUNBABY_BLUSH = Object.freeze([1.0, 0.52, 0.58]);
export const SUNBABY_MOUTH = Object.freeze([0.55, 0.12, 0.14]);
export const SUNBABY_TONGUE = Object.freeze([1.0, 0.45, 0.52]);
export const SUNBABY_EYE = Object.freeze([0.30, 0.16, 0.10]);

export const SUNBABY_AMBIENT = Object.freeze([0.95, 0.92, 0.84]);

export const SUNBABY_PHASES = Object.freeze([
  Object.freeze({ face: 'baby', s: 60 }),
  Object.freeze({ face: 'evil', s: 45 }),
  Object.freeze({ face: 'baby', s: 30 }),
  Object.freeze({ face: 'todd', s: 30 }),
]);
export const SUNBABY_CYCLE_S = SUNBABY_PHASES.reduce((a, p) => a + p.s, 0);
export const SUNBABY_MORPH_S = 1;
export const SUNBABY_FACE_LINES = Object.freeze({
  evil: 'The sun baby stops laughing. Its eyes burn, and fire rains on Daggerfall!',
  baby: 'The sun baby giggles again.',
  todd: 'The sun baby becomes Todd Howard. Sixteen times the flowers. It just works.',
});

export const SUNBABY_WRATH_ZENITH = Object.freeze([0.22, 0.02, 0.03]);
export const SUNBABY_WRATH_HORIZON = Object.freeze([0.92, 0.32, 0.10]);
export const SUNBABY_EMBERS = Object.freeze([Object.freeze([0.18, 0.03, 0.02]), Object.freeze([1.0, 0.42, 0.06])]);
export const SUNBABY_WRATH_HEART = Object.freeze([1.0, 0.86, 0.32]);
export const SUNBABY_WRATH_SKIN = Object.freeze([0.84, 0.18, 0.12]);
export const SUNBABY_WRATH_RIM = Object.freeze([0.45, 0.04, 0.03]);
export const SUNBABY_WRATH_RAY = Object.freeze([1.0, 0.34, 0.06]);
export const SUNBABY_WRATH_EYE = Object.freeze([1.0, 0.88, 0.22]);
export const SUNBABY_WRATH_DARK = Object.freeze([0.14, 0.01, 0.01]);
export const SUNBABY_WRATH_FIRE = Object.freeze([1.0, 0.48, 0.08]);
export const SUNBABY_WRATH_TOOTH = Object.freeze([1.0, 0.95, 0.82]);
export const SUNBABY_WRATH_HORN = Object.freeze([0.32, 0.05, 0.04]);
export const SUNBABY_WRATH_TINT = Object.freeze([1.0, 0.52, 0.40]);

export const SUNBABY_TODD_SKIN = Object.freeze([0.96, 0.78, 0.64]);
export const SUNBABY_TODD_HAIR = Object.freeze([0.25, 0.17, 0.11]);
export const SUNBABY_TODD_IRIS = Object.freeze([0.35, 0.24, 0.16]);
export const SUNBABY_TODD_LIP = Object.freeze([0.70, 0.36, 0.34]);
export const SUNBABY_TODD_TOOTH = Object.freeze([0.98, 0.97, 0.93]);
export const SUNBABY_TODD_DETAIL = 4;
export const SUNBABY_TODD_PHOTO_FIT = 0.9;

export const SUNBABY_FIRE_SLOT_MS = 250;
export const SUNBABY_FIRE_CHANCE = 0.7;
// A tab asleep through the wrath drops at most this many slots on waking.
export const SUNBABY_FIRE_SLOTS_MAX = 8;
export const SUNBABY_FIRE_SALT = 0x5b0b;
export const SUNBABY_FIRE_NEAR_M = 8;
export const SUNBABY_FIRE_SPLIT_M = 30;
export const SUNBABY_FIRE_FAR_M = 120;
export const SUNBABY_FIRE_NEAR_SHARE = 0.35;
export const SUNBABY_FIRE_SPREAD = 0.6;
export const SUNBABY_FIRE_ELEV_DEG = Object.freeze([58, 80]);
export const SUNBABY_FIRE_FALL_M = 90;

const clamp01 = (x) => Math.max(0, Math.min(1, Number(x) || 0));
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function createSunbaby() {
  let target = 0, weight = 0;
  let at = NaN, seen = null;
  return {
    set(ev, { live = false } = {}) {
      target = ev?.kind === SUNBABY_EVENT ? 1 : 0;
      if (!live) weight = target;
      if (target) at = Number(ev.at);
      seen = null;
    },
    frame(sharedMs) {
      const p = sunbabyPhase((sharedMs - at) / 1000);
      const line = target === 1 && seen !== null && p.face !== seen ? SUNBABY_FACE_LINES[p.face] : null;
      seen = target === 1 ? p.face : null;
      return { ...p, line };
    },
    tick(dt) {
      const step = Math.max(0, dt || 0) / SUNBABY_FADE_S;
      weight = weight < target ? Math.min(target, weight + step) : Math.max(target, weight - step);
      return weight;
    },
    get weight() { return weight; },
    get on() { return target === 1; },
  };
}

/** @param {number} sinceS */
export function sunbabyPhase(sinceS) {
  const n = SUNBABY_PHASES.length;
  const since = Number.isFinite(sinceS) && sinceS > 0 ? sinceS : 0;
  const t = since % SUNBABY_CYCLE_S;
  let start = 0, index = 0;
  while (index < n - 1 && t >= start + SUNBABY_PHASES[index].s) start += SUNBABY_PHASES[index++].s;
  const face = SUNBABY_PHASES[index].face;
  const from = index === 0 && since < SUNBABY_CYCLE_S ? face : SUNBABY_PHASES[(index + n - 1) % n].face;
  const x = clamp01((t - start) / SUNBABY_MORPH_S), k = x * x * (3 - 2 * x);
  const w = (f) => (from === f ? 1 - k : 0) + (face === f ? k : 0);
  return { index, face, evil: w('evil'), todd: w('todd'), fire: face === 'evil' && k === 1 };
}

/**
 * @param {number} fromMs
 * @param {number} toMs
 */
export function sunbabyFireballs(fromMs, toMs) {
  const out = [];
  if (!(toMs > fromMs)) return out;
  const last = Math.floor(toMs / SUNBABY_FIRE_SLOT_MS);
  const first = Math.max(Math.floor(fromMs / SUNBABY_FIRE_SLOT_MS), last - SUNBABY_FIRE_SLOTS_MAX + 1);
  const [e0, e1] = SUNBABY_FIRE_ELEV_DEG;
  for (let slot = first; slot <= last; slot++) {
    const seed = (slotHash(slot) ^ SUNBABY_FIRE_SALT) >>> 0;
    const r = seededRng(seed);
    if (r() >= SUNBABY_FIRE_CHANCE) continue;
    const atMs = (slot + r()) * SUNBABY_FIRE_SLOT_MS;
    if (atMs <= fromMs || atMs > toMs) continue;
    const near = r() < SUNBABY_FIRE_NEAR_SHARE;
    const distance = near ? SUNBABY_FIRE_NEAR_M + (SUNBABY_FIRE_SPLIT_M - SUNBABY_FIRE_NEAR_M) * r() : SUNBABY_FIRE_SPLIT_M + (SUNBABY_FIRE_FAR_M - SUNBABY_FIRE_SPLIT_M) * r();
    out.push({ atMs, seed, bearing: r() * 2 * Math.PI, distance, az: SUNBABY_SUN_BEARING + (r() - 0.5) * 2 * SUNBABY_FIRE_SPREAD, elev: (e0 + (e1 - e0) * r()) * Math.PI / 180 });
  }
  return out;
}

/**
 * @param {{seed: number, bearing: number, distance: number, az: number, elev: number}} s
 * @param {number[]} eye
 * @param {((x: number, z: number) => number) | null} [ground]
 */
export function sunbabyFireball(s, eye, ground = null) {
  const x = eye[0] + Math.sin(s.bearing) * s.distance, z = eye[2] + Math.cos(s.bearing) * s.distance;
  const g = ground ? ground(x, z) : NaN, y = Number.isFinite(g) ? g : eye[1];
  const c = Math.cos(s.elev), F = SUNBABY_FIRE_FALL_M;
  const up = [c * Math.cos(s.az), Math.sin(s.elev), c * Math.sin(s.az)];
  return { from: [x + up[0] * F, y + up[1] * F, z + up[2] * F], to: [x, y, z], seed: s.seed };
}

export function createSunbabyRain() {
  /** @type {number | null} */
  let lastMs = null;
  return {
    /** @param {{sharedMs: number, eye: number[], fire: boolean, ground?: ((x: number, z: number) => number) | null}} o */
    tick({ sharedMs, eye, fire, ground = null }) {
      const out = [];
      if (lastMs !== null && sharedMs < lastMs) lastMs = null;
      if (lastMs !== null && fire) for (const s of sunbabyFireballs(lastMs, sharedMs)) out.push(sunbabyFireball(s, eye, ground));
      lastMs = sharedMs;
      return out;
    },
    reset() { lastMs = null; },
  };
}

export function sunbabySunDir(w) {
  const k = clamp01(w), e = 1 - (1 - k) ** 3;
  const elev = (SUNBABY_SUN_SET_DEG + (SUNBABY_SUN_ELEV_DEG - SUNBABY_SUN_SET_DEG) * e) * Math.PI / 180;
  const c = Math.cos(elev);
  return [c * Math.cos(SUNBABY_SUN_BEARING), Math.sin(elev), c * Math.sin(SUNBABY_SUN_BEARING)];
}

export const sunbabyHaze = (rgb, w, evil = 0) => mix3(rgb, mix3(SUNBABY_HORIZON, SUNBABY_WRATH_HORIZON, clamp01(evil)), clamp01(w));

export function sunbabyLight(rgb, w, evil = 0) {
  const k = clamp01(w), e = clamp01(evil) * k;
  return new Float32Array([0, 1, 2].map((i) => (rgb[i] + Math.max(0, SUNBABY_AMBIENT[i] - rgb[i]) * k) * (1 + (SUNBABY_WRATH_TINT[i] - 1) * e)));
}

export function sunbabyKey(rgb, w, evil = 0) {
  const e = clamp01(evil) * clamp01(w);
  return new Float32Array([0, 1, 2].map((i) => rgb[i] * (1 + (SUNBABY_WRATH_TINT[i] - 1) * e)));
}

export const sunbabyWaterSky = (ws, w, evil = 0) => (clamp01(w) > 0 && ws
  ? { zenith: mix3(ws.zenith, mix3(SUNBABY_ZENITH, SUNBABY_WRATH_ZENITH, clamp01(evil)), clamp01(w)), horizon: mix3(ws.horizon, mix3(SUNBABY_HORIZON, SUNBABY_WRATH_HORIZON, clamp01(evil)), clamp01(w)) }
  : ws);

const f = (v) => v.toFixed(4);
const v3 = (c) => `vec3(${c.map(f).join(', ')})`;

export const SUNBABY_GLSL = `
const float SB_PI = 3.14159265;
float sbHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec2 sbHash2(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
vec3 sbPetal(float h) {
${SUNBABY_PETALS.map((c, i) => `  ${i < SUNBABY_PETALS.length - 1 ? `if (h < ${f((i + 1) / SUNBABY_PETALS.length)}) ` : ''}return ${v3(c)};`).join('\n')}
}
// One layer of flowers on the cell grid of p; px is p's footprint on screen (cells a pixel); evil chars and burns them.
// rgb, coverage.
vec4 sbFlowers(vec2 p, float px, float layer, float density, float t, float evil) {
  vec2 cell = floor(p);
  vec2 q = fract(p) - 0.5;
  float h = sbHash(cell + layer * 17.13);
  if (h > density) return vec4(0.0);
  q -= (sbHash2(cell + layer * 31.7) - 0.5) * 0.2;
  float size = 0.27 + 0.13 * sbHash(cell * 1.71 + layer * 5.3);
  float n = h < density * 0.5 ? 5.0 : 6.0;
  float rot = sbHash(cell + 7.7 + layer) * 6.2832 + t * (sbHash(cell + 3.1) - 0.5) * 0.5;
  float r = length(q) / size, aa = px / size + 1e-4;
  float a = atan(q.y, q.x) + rot;
  float petal = 0.5 + 0.5 * cos(n * a);
  float edge = 0.42 + 0.58 * sqrt(petal);
  float cover = 1.0 - smoothstep(edge - aa, edge + aa, r);
  vec3 pc = sbPetal(fract(h * 7.31 + layer * 0.37));
  pc = mix(pc, mix(${v3(SUNBABY_EMBERS[0])}, ${v3(SUNBABY_EMBERS[1])}, fract(h * 3.7 + layer * 0.5)), evil);
  vec3 col = mix(pc * 0.78, mix(pc, vec3(1.0), 0.3 * (1.0 - evil)), smoothstep(0.15, 0.95, r / edge));
  col *= 0.86 + 0.14 * smoothstep(0.02, 0.25, petal);
  float heart = 1.0 - smoothstep(0.27 - aa, 0.27 + aa, r);
  vec3 hc = mix(${v3(SUNBABY_HEART)}, ${v3(SUNBABY_WRATH_HEART)}, evil) * (0.88 + 0.12 * cos(r * 30.0 + evil * t * 6.0));
  col = mix(col, hc, heart);
  return vec4(col, cover);
}
float sbFill(float d, float px) { return 1.0 - smoothstep(-px, px, d); }
// The distance to an upper (up > 0) or lower (up < 0) half-ring of radius rr about c, round-capped, th thick.
float sbArc(vec2 p, vec2 c, float rr, float th, float up) {
  vec2 d = p - c;
  if (d.y * up >= 0.0) return abs(length(d) - rr) - th;
  return min(length(d - vec2(rr, 0.0)), length(d + vec2(rr, 0.0))) - th;
}
// The distance to the segment ab.
float sbSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
// The sun over col, the face's uv in face radii (1 the rim), px a pixel in the same units; evil and todd the faces'
// weights (SUNBABY2), the baby the rest; Todd's photograph (SUNBABY3) and whether it has loaded, duv uv's derivatives
// (taken before the branch this is called in).
vec3 sbSun(vec3 col, vec2 uv, float px, float t, float evil, float todd, sampler2D photo, float photoOn, vec4 duv) {
  float baby = clamp(1.0 - evil - todd, 0.0, 1.0), still = 1.0 - todd;
  // the giggle - a quicker cackle in the wrath; Todd holds still and grins: bursts of laughs, the head bobbing and
  // tilting with them
  float burst = smoothstep(-0.3, 0.5, sin(t * (0.9 + 0.5 * evil)));
  float giggle = (0.5 + 0.5 * sin(t * (11.0 + 7.0 * evil))) * burst * still;
  float tilt = 0.09 * sin(t * 1.3) * still;
  uv -= vec2(0.025 * sin(t * 1.7), 0.03 * sin(t * 2.3) + 0.025 * giggle) * still;
  uv += 0.012 * evil * vec2(sin(t * 37.0), cos(t * 41.0));   // and the wrath shudders
  uv = mat2(cos(tilt), sin(tilt), -sin(tilt), cos(tilt)) * uv;
  float r = length(uv);
  vec3 rayC = mix(${v3(SUNBABY_RAY)}, ${v3(SUNBABY_WRATH_RAY)}, evil), rimC = mix(${v3(SUNBABY_RIM)}, ${v3(SUNBABY_WRATH_RIM)}, evil);
  // the halo and the rays, turning slowly - faster and spikier in the wrath - stretching as it laughs
  col += rayC * 0.55 * exp(-max(r - 1.0, 0.0) * 2.2) * (0.85 + 0.15 * burst);
  float a = atan(uv.y, uv.x) + t * (0.12 + 0.3 * evil);
  float ray = pow(0.5 + 0.5 * cos(16.0 * a), 2.5 + 3.5 * evil);
  float reach = 1.18 + (0.58 + 0.08 * giggle + 0.3 * evil) * ray;
  col = mix(col, mix(rayC, rimC, clamp((r - 1.0) / 0.7, 0.0, 1.0)), sbFill(r - reach, px * 1.5));
  // the rim, then the face
  col = mix(col, rimC * (1.0 - 0.15 * smoothstep(0.9, 1.06, r)), sbFill(r - 1.06, px));
  vec3 skinC = ${v3(SUNBABY_SKIN)} * baby + ${v3(SUNBABY_WRATH_SKIN)} * evil + ${v3(SUNBABY_TODD_SKIN)} * todd;
  vec3 skin = skinC * (1.0 - 0.10 * pow(r / 0.9, 4.0)) + 0.06 * (1.0 - smoothstep(0.0, 0.5, length(uv - vec2(-0.25, 0.35))));
  skin *= 1.0 - 0.08 * todd * (1.0 - smoothstep(-0.6, -0.15, uv.y));   // Todd's five o'clock shadow
  col = mix(col, skin, sbFill(r - 0.9, px));
  // THE BABY: the blush, squeezed up by the laugh
  for (int s = -1; s <= 1; s += 2) {
    vec2 c = vec2(float(s) * 0.52, -0.1 + 0.04 * giggle);
    col = mix(col, ${v3(SUNBABY_BLUSH)}, 0.55 * baby * (1.0 - smoothstep(0.06, 0.18, length(uv - c))));
  }
  // the eyes: shut tight with laughing (^ ^), and the brows raised over them
  for (int s = -1; s <= 1; s += 2) {
    vec2 e = vec2(float(s) * 0.33, 0.14);
    vec2 pe = vec2(uv.x, e.y + (uv.y - e.y) / (1.0 - 0.3 * giggle));
    col = mix(col, ${v3(SUNBABY_EYE)}, baby * sbFill(sbArc(pe, e, 0.14, 0.04, 1.0), px));
    col = mix(col, ${v3(SUNBABY_EYE)} * 1.5, 0.8 * baby * sbFill(sbArc(uv, e + vec2(0.0, 0.17 + 0.03 * giggle), 0.13, 0.022, 1.0), px));
  }
  // the button nose (every face's)
  col = mix(col, skinC * 0.86, sbFill(length((uv - vec2(0.0, -0.03)) / vec2(1.0, 0.8)) - 0.065, px));
  col = mix(col, vec3(1.0), 0.5 * sbFill(length(uv - vec2(-0.02, -0.01)) - 0.02, px));
  // the laughing mouth: a wide D, opening with every giggle, its tongue at the bottom
  float mh = 0.2 + 0.13 * giggle;
  vec2 m = (uv - vec2(0.0, -0.24)) / vec2(0.32, mh);
  float mouth = max((length(m) - 1.0) * min(0.32, mh), uv.y - (-0.24 + 0.25 * uv.x * uv.x));
  float mf = sbFill(mouth, px);
  vec3 inner = ${v3(SUNBABY_MOUTH)};
  inner = mix(inner, ${v3(SUNBABY_TONGUE)}, sbFill(length((uv - vec2(0.0, -0.24 - mh * 0.95)) / vec2(1.3, 1.0)) - 0.16, px));
  col = mix(col, ${v3(SUNBABY_EYE)}, baby * sbFill(mouth - 0.025, px));
  col = mix(col, inner, baby * mf);
  // the one curl of hair on top
  col = mix(col, ${v3(SUNBABY_EYE)} * 1.3, baby * sbFill(max(sbArc(uv, vec2(0.05, 0.74), 0.09, 0.03, -1.0), -(uv.x - 0.05)), px));
  col = mix(col, ${v3(SUNBABY_EYE)} * 1.3, baby * sbFill(sbArc(uv, vec2(0.05, 0.74 + 0.045), 0.045, 0.03, 1.0), px));
  // THE WRATH: glaring slit eyes under brows that slant down to the nose, horns from the crown, and a wide jagged
  // grin over a furnace, cackling open
  if (evil > 0.0) {
    for (int s = -1; s <= 1; s += 2) {
      vec2 q = vec2(uv.x * float(s), uv.y);   // the face's outer side to +x
      vec2 eo = (q - vec2(0.31, 0.12)) / vec2(0.16, 0.10);
      float eye = max((length(eo) - 1.0) * 0.10, q.y - (0.06 + 0.40 * (q.x - 0.12)));
      col += ${v3(SUNBABY_WRATH_EYE)} * 0.45 * evil * exp(-max(eye, 0.0) * 22.0);
      col = mix(col, mix(${v3(SUNBABY_WRATH_EYE)}, vec3(1.0), 0.6 * (1.0 - smoothstep(0.0, 0.8, length(eo)))), evil * sbFill(eye, px));
      col = mix(col, ${v3(SUNBABY_WRATH_DARK)}, evil * sbFill(max(abs(q.x - 0.31) - 0.02, eye + 0.01), px));
      col = mix(col, ${v3(SUNBABY_WRATH_DARK)}, evil * sbFill(sbSeg(q, vec2(0.10, 0.22), vec2(0.52, 0.40)) - 0.045, px));
      vec2 h = q - vec2(0.40, 0.70);
      float hy = clamp(h.y / 0.46, 0.0, 1.0), hc = 0.20 * hy * hy;
      float horn = max(abs(h.x - hc) - 0.13 * (1.0 - hy), max(-h.y, h.y - 0.46));
      col = mix(col, ${v3(SUNBABY_WRATH_HORN)} * (0.8 + 0.5 * (1.0 - smoothstep(-0.05, 0.05, h.x - hc))), evil * sbFill(horn, px));
    }
    float x2 = uv.x * uv.x;
    float top = -0.20 + 0.55 * x2, bot = -0.40 - 0.10 * giggle + 0.95 * x2;
    float grin = max(uv.y - top, bot - uv.y);
    float deep = clamp((top - uv.y) / max(top - bot, 1e-3), 0.0, 1.0);
    vec3 pit = mix(${v3(SUNBABY_WRATH_DARK)}, ${v3(SUNBABY_WRATH_FIRE)}, deep * (0.75 + 0.25 * sin(t * 9.0)));
    float fang = max(uv.y - top, top - 0.085 * (1.0 - abs(fract(uv.x * 7.0) - 0.5) * 2.0) - uv.y);
    float tusk = max(bot - uv.y, uv.y - bot - 0.07 * (1.0 - abs(fract(uv.x * 7.0 + 0.5) - 0.5) * 2.0));
    col = mix(col, ${v3(SUNBABY_WRATH_DARK)}, evil * sbFill(grin - 0.03, px));
    float inside = evil * sbFill(grin, px);
    col = mix(col, pit, inside);
    col = mix(col, ${v3(SUNBABY_WRATH_TOOTH)}, inside * max(sbFill(fang, px), sbFill(tusk, px)));
  }
  // TODD (SUNBABY3): his photograph in the face's disk, square to the eye
  if (todd * photoOn > 0.0) {
    vec2 k = vec2(${f(0.5 / SUNBABY_TODD_PHOTO_FIT)}, -${f(0.5 / SUNBABY_TODD_PHOTO_FIT)});
    vec3 ph = textureGrad(photo, 0.5 + uv * k, duv.xy * k, duv.zw * k).rgb;
    col = mix(col, ph, todd * photoOn * sbFill(r - ${f(SUNBABY_TODD_PHOTO_FIT)}, px));
  }
  // ...and until it has loaded, the cartoon: short dark hair swept over a side part, friendly brows, open eyes with a
  // twinkle, and a sure toothy grin
  float cart = todd * (1.0 - photoOn);
  if (cart > 0.0) {
    float fringe = 0.36 + 0.16 * uv.x + 0.02 * sin(uv.x * 11.0 + 1.0);
    float hair = min(max(r - 0.95, fringe - uv.y), max(max(r - 0.93, 0.79 - abs(uv.x)), 0.12 - uv.y));
    col = mix(col, ${v3(SUNBABY_TODD_HAIR)} * (0.92 + 0.08 * sin(uv.x * 22.0 - uv.y * 30.0)), cart * sbFill(hair, px));
    for (int s = -1; s <= 1; s += 2) {
      vec2 q = vec2(uv.x * float(s), uv.y);
      col = mix(col, ${v3(SUNBABY_TODD_HAIR)}, cart * sbFill(sbSeg(q, vec2(0.17, 0.29), vec2(0.47, 0.32)) - 0.032, px));
      vec2 e = vec2(0.32, 0.15), ic = e + vec2(-0.01, -0.005);
      float white = (length((q - e) / vec2(0.11, 0.065)) - 1.0) * 0.065;
      col = mix(col, vec3(0.97, 0.96, 0.93), cart * sbFill(white, px));
      col = mix(col, ${v3(SUNBABY_TODD_IRIS)}, cart * sbFill(max(length(q - ic) - 0.05, white), px));
      col = mix(col, vec3(0.05), cart * sbFill(max(length(q - ic) - 0.022, white), px));
      col = mix(col, vec3(1.0), cart * sbFill(length(q - ic - vec2(0.015, 0.02)) - 0.012, px));
      col = mix(col, ${v3(SUNBABY_TODD_HAIR)} * 1.4, 0.7 * cart * sbFill(sbArc(q, e - vec2(0.0, 0.03), 0.12, 0.012, 1.0), px));
    }
    float x2 = uv.x * uv.x;
    float top = -0.25 + 0.32 * x2, bot = -0.38 + 0.80 * x2;
    float smile = max(uv.y - top, bot - uv.y);
    float open = clamp((top - uv.y) / max(top - bot, 1e-3), 0.0, 1.0);
    vec3 teeth = ${v3(SUNBABY_TODD_TOOTH)} * (1.0 - 0.25 * smoothstep(0.40, 0.5, abs(fract(uv.x * 9.0) - 0.5)));
    col = mix(col, ${v3(SUNBABY_TODD_LIP)}, cart * sbFill(smile - 0.03, px));
    col = mix(col, mix(teeth, vec3(0.25, 0.06, 0.06), smoothstep(0.55, 0.7, open)), cart * sbFill(smile, px));
  }
  return col;
}
vec3 sunbabySky(vec3 dir, vec3 sunDir, float t, vec2 face, sampler2D photo, float photoOn) {
  float evil = clamp(face.x, 0.0, 1.0), todd = clamp(face.y, 0.0, 1.0);
  // the dome: nursery blue over a pale horizon - blood over ember in the wrath - a little deeper below it where the
  // land will cover it
  float e = clamp(dir.y, 0.0, 1.0);
  vec3 zen = mix(${v3(SUNBABY_ZENITH)}, ${v3(SUNBABY_WRATH_ZENITH)}, evil), hor = mix(${v3(SUNBABY_HORIZON)}, ${v3(SUNBABY_WRATH_HORIZON)}, evil);
  vec3 col = mix(hor, zen, pow(e, 0.6));
  col = mix(col, hor * 0.9, clamp(-dir.y * 3.0, 0.0, 1.0));
  // the flowers, on a ceiling over the land (big overhead, small toward the horizon), drifting - Todd's grid
  // ${SUNBABY_TODD_DETAIL} times finer each way; px from the continuous ceiling coordinate, before any branch
  vec2 p = dir.xz * min(1.0 / (max(dir.y, 0.0) + 0.25), 4.0) * 7.0 * (1.0 + ${f(SUNBABY_TODD_DETAIL - 1)} * todd) + vec2(t * 0.045, t * 0.02);
  float px = length(fwidth(p));
  vec2 p2 = p * 0.8 + vec2(0.5, 0.37);
  float px2 = px * 0.8;
  float up = smoothstep(0.015, 0.14, dir.y);
  vec4 l1 = sbFlowers(p2, px2, 1.0, ${f(SUNBABY_DENSITY[1])}, t, evil);
  col = mix(col, l1.rgb, l1.a * up);
  vec4 l0 = sbFlowers(p, px, 0.0, ${f(SUNBABY_DENSITY[0])}, t, evil);
  col = mix(col, l0.rgb, l0.a * up);
  // the sun: the face's plane square to the eye, its up the world's
  vec3 ex = normalize(cross(vec3(0.0, 1.0, 0.0), sunDir));
  vec3 ey = cross(sunDir, ex);
  vec2 uv = vec2(dot(dir, ex), dot(dir, ey)) / ${f(SUNBABY_SUN_RADIUS)};
  float upx = length(fwidth(uv));
  vec4 duv = vec4(dFdx(uv), dFdy(uv));
  if (dot(dir, sunDir) > cos(${f(SUNBABY_SUN_RADIUS)} * 4.0)) col = sbSun(col, uv, upx, t, evil, todd, photo, photoOn, duv);
  return col;
}
`;
