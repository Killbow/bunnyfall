// @ts-check

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const UNDERWATER_MURK = 0.55;
export const WATER_REFRACTION = 1.333;
export const BODY_KEEP = Object.freeze([0.66, 0.86, 0.88]);
export const BODY_KEEP_DEEP = Object.freeze([0.26, 0.48, 0.55]);
export const BODY_DEEP_M = 40;
export const BODY_COLOR = Object.freeze([0.016, 0.075, 0.085]);
export const NIGHT_BODY_SHARE = 0.2;
export const SHAFT_STRENGTH = 0.9;
export const SHAFT_TINT = Object.freeze([0.72, 0.96, 0.92]);
export const SHAFT_FADE_M = 28;
export const SHAFT_REACH_M = 24;

/**
 * @param {ArrayLike<number>} toSun
 * @param {number[]} [out]
 * @returns {number[]|null}
 */
export function refractedSun(toSun, out = [0, 0, 0]) {
  const y = toSun[1];
  if (!(y > 0)) return null;
  const h = Math.hypot(toSun[0], toSun[2]);
  const sinW = Math.min(1, h) / WATER_REFRACTION;
  const s = h > 1e-6 ? sinW / h : 0;
  out[0] = toSun[0] * s; out[1] = Math.sqrt(1 - sinW * sinW); out[2] = toSun[2] * s;
  return out;
}

/**
 * @param {{depth: number, daylight: number, toSun: ArrayLike<number>, sunColor: ArrayLike<number>, sunScale: number}} f
 * @param {{keep: number[], body: number[], sunW: number[], shaft: number[]}} [out]
 * @returns {{keep: number[], body: number[], sunW: number[], shaft: number[]}}
 */
export function underwaterLookUniforms({ depth, daylight, toSun, sunColor, sunScale }, out = { keep: [0, 0, 0], body: [0, 0, 0], sunW: [0, 0, 0], shaft: [0, 0, 0] }) {
  const d = Math.max(0, depth);
  const deep = clamp01(d / BODY_DEEP_M);
  const day = clamp01(daylight);
  const night = NIGHT_BODY_SHARE + (1 - NIGHT_BODY_SHARE) * day;
  const sun = refractedSun(toSun, out.sunW);
  if (!sun) { out.sunW[0] = 0; out.sunW[1] = 1; out.sunW[2] = 0; }
  const lit = sun ? SHAFT_STRENGTH * Math.max(0, sunScale) * day * Math.exp(-d / SHAFT_FADE_M) : 0;
  for (let i = 0; i < 3; i++) {
    out.keep[i] = (BODY_KEEP[i] + (BODY_KEEP_DEEP[i] - BODY_KEEP[i]) * deep) * (0.85 + 0.15 * day);
    out.body[i] = BODY_COLOR[i] * night * (1 - 0.6 * deep);
    out.shaft[i] = (sunColor[i] ?? 1) * SHAFT_TINT[i] * lit;
  }
  return out;
}
