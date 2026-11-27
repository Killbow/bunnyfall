// @ts-check

import { seededRng } from '../weather/wind.js';
import { thunderOf } from '../weather/distantStorms.js';

// Must match the `dread` entry in `LIVE_EVENTS` in net/wire.js.
export const DREAD_EVENT = 'dread';
export const DREAD_FADE_S = 12;

export const DREAD_DIM = 0.85;
export const DREAD_RAMP = Object.freeze([
  Object.freeze({ at: 0, color: Object.freeze([0.05, 0.004, 0.012]) }),
  Object.freeze({ at: 0.35, color: Object.freeze([0.55, 0.07, 0.03]) }),
  Object.freeze({ at: 0.8, color: Object.freeze([1.0, 0.42, 0.12]) }),
]);
const LUMA = [0.2126, 0.7152, 0.0722];

export function dreadRamp(l) {
  const [s0, s1, s2] = DREAD_RAMP;
  if (!(l > s0.at)) return [...s0.color];
  const [a, b, t] = l < s1.at ? [s0.color, s1.color, (l - s0.at) / (s1.at - s0.at)] : [s1.color, s2.color, Math.min(1, (l - s1.at) / (s2.at - s1.at))];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Returns a new array and never writes `rgb`, which is often a frozen palette row.
export function dreadGrade(rgb, w) {
  const k = Math.max(0, Math.min(1, w || 0));
  if (k === 0) return [rgb[0], rgb[1], rgb[2]];
  const g = dreadRamp((LUMA[0] * rgb[0] + LUMA[1] * rgb[1] + LUMA[2] * rgb[2]) * DREAD_DIM);
  return [rgb[0] + (g[0] - rgb[0]) * k, rgb[1] + (g[1] - rgb[1]) * k, rgb[2] + (g[2] - rgb[2]) * k];
}

const glslVec = (c) => `vec3(${c.map((v) => v.toFixed(4)).join(', ')})`;
export const DREAD_GLSL = (() => {
  const [s0, s1, s2] = DREAD_RAMP, f = (v) => v.toFixed(4);
  return `
vec3 dreadRamp(float l) {
  if (l < ${f(s1.at)}) return mix(${glslVec(s0.color)}, ${glslVec(s1.color)}, clamp((l - ${f(s0.at)}) / ${f(s1.at - s0.at)}, 0.0, 1.0));
  return mix(${glslVec(s1.color)}, ${glslVec(s2.color)}, clamp((l - ${f(s1.at)}) / ${f(s2.at - s1.at)}, 0.0, 1.0));
}
vec3 dreadGrade(vec3 c, float w) {
  if (w <= 0.0) return c;
  return mix(c, dreadRamp(dot(c, vec3(${LUMA.map(f).join(', ')})) * ${f(DREAD_DIM)}), clamp(w, 0.0, 1.0));
}
`;
})();

export function createDread() {
  let target = 0, weight = 0;
  return {
    set(ev, { live = false } = {}) {
      target = ev?.kind === DREAD_EVENT ? 1 : 0;
      if (!live) weight = target;
    },
    tick(dt) {
      const step = Math.max(0, dt || 0) / DREAD_FADE_S;
      weight = weight < target ? Math.min(target, weight + step) : Math.max(target, weight - step);
      return weight;
    },
    get weight() { return weight; },
    get on() { return target === 1; },
  };
}

export const DREAD_SLOT_MS = 900;
export const DREAD_STRIKE_CHANCE = 0.28;
export const DREAD_NEAR_M = 400;
export const DREAD_FAR_M = 6000;
export const DREAD_SPLIT_M = 1600;
export const DREAD_NEAR_SHARE = 0.35;
export const DREAD_CG_SHARE = 0.75;
export const DREAD_BOLT_COLOR = Object.freeze([1.0, 0.16, 0.07]);
export const DREAD_FLASH_COLOR = Object.freeze([1.0, 0.22, 0.1]);
// Caps the slots one call walks, so a tab that wakes after a long sleep does not fire the whole backlog of strikes.
export const DREAD_SLOTS_MAX = 8;

// Every client must compute the same hash for a slot; world/sunbabySky.js reads its fireball slots through it too.
export const slotHash = (slot) => { let h = Math.imul(slot | 0, 0x9e3779b1) ^ 0x7f4a7c15; h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };

/**
 * @param {number} fromMs
 * @param {number} toMs
 * @param {number} w
 * @param {{salt?: number, near?: number, split?: number, far?: number, nearShare?: number}} [ring]
 */
export function dreadStrikes(fromMs, toMs, w, { salt = 0, near: nearM = DREAD_NEAR_M, split = DREAD_SPLIT_M, far: farM = DREAD_FAR_M, nearShare = DREAD_NEAR_SHARE } = {}) {
  const out = [];
  if (!(w > 0) || !(toMs > fromMs)) return out;
  const last = Math.floor(toMs / DREAD_SLOT_MS);
  const first = Math.max(Math.floor(fromMs / DREAD_SLOT_MS), last - DREAD_SLOTS_MAX + 1);
  for (let slot = first; slot <= last; slot++) {
    const seed = (slotHash(slot) ^ salt) >>> 0;
    const r = seededRng(seed);
    if (r() >= DREAD_STRIKE_CHANCE * Math.min(1, w)) continue;
    const atMs = (slot + r()) * DREAD_SLOT_MS;
    if (atMs <= fromMs || atMs > toMs) continue;
    const near = r() < nearShare;
    const distance = near ? nearM + (split - nearM) * r() : split + (farM - split) * r();
    out.push({ atMs, seed, bearing: r() * 2 * Math.PI, distance, kind: r() < DREAD_CG_SHARE ? 'cg' : 'ic', strength: 0.8 + 0.2 * r() });
  }
  return out;
}

/** @param {{salt?: number, near?: number, split?: number, far?: number, nearShare?: number}} [ring] */
export function createDreadStorm(ring = undefined) {
  let lastMs = null;
  const thunder = [];
  return {
    tick({ sharedMs, eye, weight, centre = null }) {
      const strikes = [], sounds = [];
      // A new shared clock offset can move time backwards; restart from this tick instead of walking a reversed
      // range.
      if (lastMs !== null && sharedMs < lastMs) lastMs = null;
      if (lastMs !== null) {
        const c = centre ?? eye;
        for (const s of dreadStrikes(lastMs, sharedMs, weight, ring)) {
          const x = c[0] + Math.sin(s.bearing) * s.distance, z = c[2] + Math.cos(s.bearing) * s.distance;
          strikes.push({ x, z, seed: s.seed, kind: s.kind, strength: s.strength, color: DREAD_BOLT_COLOR });
          const t = thunderOf(centre ? Math.hypot(x - eye[0], z - eye[2]) : s.distance);
          if (t) thunder.push({ dueMs: s.atMs + t.delay * 1000, clip: t.clip, volume: t.volume, x, z });
        }
      }
      lastMs = sharedMs;
      for (let i = thunder.length - 1; i >= 0; i--) {
        if (thunder[i].dueMs > sharedMs) continue;
        const { clip, volume, x, z } = thunder[i];
        sounds.push({ clip, volume, x, z });
        thunder.splice(i, 1);
      }
      if (thunder.length > 32) thunder.splice(0, thunder.length - 32);
      return { strikes, sounds };
    },
    reset() { lastMs = null; thunder.length = 0; },
  };
}

export const DREAD_SKY_WORD = 'thunder';

export const DREAD_KEY_DIM = 0.45;
export const dreadLight = (rgb, w) => new Float32Array(dreadGrade(rgb, w));
export const DREAD_CLOUD_GLOW = 0.5;
// Dread bolts are matched by reference to `DREAD_BOLT_COLOR`, so weather/lightning.js must pass the strike color
// array through uncopied.
export function dreadCloudGlow(bolts) {
  let best = 0;
  for (const b of bolts ?? []) if (b.color === DREAD_BOLT_COLOR && b.bright > best) best = b.bright;
  return DREAD_CLOUD_GLOW * Math.min(1, best);
}
