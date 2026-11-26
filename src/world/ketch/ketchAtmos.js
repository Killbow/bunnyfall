// @ts-check
import { daylightScale, dayFraction } from '../worldClock.js';
import { KT_AIR_FOG, KT_BELOW_FOG, KT_LIGHT } from './ketchShip.js';

const f3 = (a, b, c) => Object.freeze([a, b, c]);
const grade = (adaptKey, adaptMax, bloom, vignette, contrast) => Object.freeze({ adaptKey, adaptMax, bloom, vignette, contrast });
const classic = (light, lamps) => Object.freeze({ light, lamps });

export const KT_HOURS = Object.freeze({
  dawn: Object.freeze({ from: 5, to: 7, ambient: f3(0.36, 0.33, 0.36), sun: f3(1.0, 0.72, 0.5), share: 0.6, fog: f3(0.66, 0.52, 0.5), density: 0.0020, lamps: 2.0, grade: grade(0.18, 1.6, 0.6, 0.24, 1.04), classic: classic(1.9, 1.9) }),
  day: Object.freeze({ ambient: KT_LIGHT.noon, sun: KT_LIGHT.sun, share: KT_LIGHT.sunScale, fog: KT_AIR_FOG.color, density: KT_AIR_FOG.density, lamps: 0.6, grade: grade(0.16, 1.5, 0.7, 0.26, 1.06), classic: classic(0.85, 1) }),
  dusk: Object.freeze({ from: 17, to: 19.5, ambient: f3(0.34, 0.28, 0.26), sun: f3(1.0, 0.62, 0.36), share: 0.7, fog: f3(0.62, 0.42, 0.36), density: 0.0022, lamps: 2.0, grade: grade(0.17, 1.7, 0.65, 0.26, 1.05), classic: classic(1.9, 1.9) }),
  night: Object.freeze({ ambient: f3(0.25, 0.27, 0.34), key: f3(0.18, 0.2, 0.28), share: 0, fog: f3(0.05, 0.07, 0.12), density: 0.0016, lamps: 1.6, grade: grade(0.16, 2.0, 0.7, 0.30, 1.06), classic: classic(1.1, 1.1) }),
  below: Object.freeze({ ambient: f3(0.26, 0.21, 0.16), ground: f3(0.3, 0.21, 0.12), share: 0, fog: KT_BELOW_FOG.color, density: KT_BELOW_FOG.density, lamps: 1.5, grade: grade(0.14, 1.5, 0.75, 0.34, 1.08), classic: classic(1.6, 1.6) }),
  cabin: Object.freeze({ ambientK: 0.7, lamps: 2.0, grade: grade(0.15, 1.6, 0.7, 0.30, 1.06), classic: classic(1.2, 3.8) }),
});
export const KT_DAY_FULL = 0.4;
export const KT_TRI = Object.freeze({ equator: 0.8, bounce: 0.35 });
export const KT_SUN_LOW = Object.freeze({ high: 12, low: 3, gold: f3(1.0, 0.72, 0.42), red: f3(0.95, 0.5, 0.3), rise: 6 });

const smooth = (k) => { const x = Math.max(0, Math.min(1, k)); return x * x * (3 - 2 * x); };
export function ketchSunColor(elev, out = [0, 0, 0]) {
  const S = KT_SUN_LOW, day = KT_HOURS.day.sun;
  if (elev >= S.high) { out[0] = day[0]; out[1] = day[1]; out[2] = day[2]; return out; }
  const a = elev >= S.low ? S.gold : S.red, b = elev >= S.low ? day : S.gold;
  const k = elev >= S.low ? smooth((elev - S.low) / (S.high - S.low)) : smooth(Math.max(0, elev) / S.low);
  for (let i = 0; i < 3; i++) out[i] = a[i] + (b[i] - a[i]) * k;
  return out;
}
export function ketchSunAt(minute, dir = [0, 1, 0]) {
  const t = dayFraction(minute), x = Math.PI * Math.max(0, Math.min(1, t));
  dir[0] = Math.cos(x); dir[1] = Math.sin(x); dir[2] = 0;
  return t >= 0 && t <= 1 ? (Math.min(x, Math.PI - x) * 180) / Math.PI : 0;
}
export function ketchHourWeights(minute, out = { day: 0, w: 0, row: 'dawn' }) {
  const noon = daylightScale(720), h = (((minute / 60) % 24) + 24) % 24;
  out.day = noon > 0 ? smooth(daylightScale(minute) / noon / KT_DAY_FULL) : 0;
  const R = h < 12 ? KT_HOURS.dawn : KT_HOURS.dusk, mid = (R.from + R.to) / 2, half = (R.to - R.from) / 2;
  out.w = Math.max(0, 1 - Math.abs(h - mid) / half);
  out.row = h < 12 ? 'dawn' : 'dusk';
  return out;
}

const _w = { day: 0, w: 0, row: 'dawn' }, _sun = [0, 0, 0];
// This form returns `b` exactly at k = 1, which `a + (b - a) * k` can miss by rounding.
const mix = (a, b, k) => a * (1 - k) + b * k;
const lerp3 = (out, a, b, k) => { for (let i = 0; i < 3; i++) out[i] = mix(a[i], b[i], k); return out; };
const GRADE_KEYS = Object.freeze(['adaptKey', 'adaptMax', 'bloom', 'vignette', 'contrast']), CLASSIC_KEYS = Object.freeze(['light', 'lamps']);
const lerpGrade = (out, a, b, k) => { for (const n of GRADE_KEYS) out[n] = mix(a[n], b[n], k); return out; };
export function ketchLightRecord() {
  return {
    ambient: [0, 0, 0], tri: { sky: [0, 0, 0], equator: [0, 0, 0], ground: [0, 0, 0] },
    sunColor: [0, 0, 0], sunScale: 0, sunDir: [0, 1, 0], key: { scale: 0, dir: [0, 1, 0], color: [0, 0, 0] },
    fog: { mode: 'exp', density: 0, color: [0, 0, 0] }, lamps: 1, grade: { adaptKey: 0, adaptMax: 0, bloom: 0, vignette: 0, contrast: 0 },
    classic: { light: 1, lamps: 1 },
  };
}
// `key.scale` is the night key share before the moon term, which the caller applies (none for a new, set, or
// clouded moon).
export function ketchHourLight(minute, zone, out = ketchLightRecord()) {
  const H = KT_HOURS, below = zone === 'below';
  const elev = ketchSunAt(minute, out.sunDir);
  if (below) {
    const B = H.below;
    for (let i = 0; i < 3; i++) { out.ambient[i] = B.ambient[i]; out.fog.color[i] = B.fog[i]; out.tri.ground[i] = B.ground[i]; out.sunColor[i] = 0; out.key.color[i] = 0; }
    out.sunScale = 0; out.key.scale = 0; out.fog.density = B.density; out.lamps = B.lamps;
    out.sunDir[0] = 0; out.sunDir[1] = 1; out.sunDir[2] = 0;
    Object.assign(out.grade, B.grade);
    Object.assign(out.classic, B.classic);
  } else {
    const W = ketchHourWeights(minute, _w), T = W.row === 'dawn' ? H.dawn : H.dusk, N = H.night, D = H.day;
    lerp3(lerp3(out.ambient, N.ambient, D.ambient, W.day), out.ambient, T.ambient, W.w);
    lerp3(lerp3(out.fog.color, N.fog, D.fog, W.day), out.fog.color, T.fog, W.w);
    out.fog.density = mix(mix(N.density, D.density, W.day), T.density, W.w);
    out.lamps = mix(mix(N.lamps, D.lamps, W.day), T.lamps, W.w);
    lerpGrade(lerpGrade(out.grade, N.grade, D.grade, W.day), out.grade, T.grade, W.w);
    for (const n of CLASSIC_KEYS) out.classic[n] = mix(mix(N.classic[n], D.classic[n], W.day), T.classic[n], W.w);
    lerp3(out.sunColor, ketchSunColor(elev, _sun), T.sun, W.w);
    const up = smooth(elev / KT_SUN_LOW.rise), share = D.share * W.day;
    out.sunScale = mix(share, T.share * up, W.w) * up;
    out.key.scale = (1 - up) * (1 - W.w);
    for (let i = 0; i < 3; i++) { out.key.color[i] = N.key[i]; out.tri.ground[i] = (out.sunColor[i] * out.sunScale + N.key[i] * out.key.scale) * KT_TRI.bounce; }
    if (zone === 'cabin') {
      for (let i = 0; i < 3; i++) out.ambient[i] *= H.cabin.ambientK;
      out.lamps = H.cabin.lamps;
      Object.assign(out.grade, H.cabin.grade);
      Object.assign(out.classic, H.cabin.classic);
    }
  }
  for (let i = 0; i < 3; i++) { out.tri.sky[i] = out.ambient[i]; out.tri.equator[i] = out.ambient[i] * KT_TRI.equator; }
  return out;
}
