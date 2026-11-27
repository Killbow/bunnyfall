// @ts-check
// A port's fishing boats. The fleet is drawn from the harbor key and the day, so every player in the port sees the
// same boats.
import { hash32 } from '../../world/spawnedDungeons.js';
import { mulberry32 } from '../../combat/bloodArt.js';
import { keyHash } from './quays.js';
import { footprintClear, berthSize, REACH_M } from './shipLife.js';
import { SWEEP_WAY } from './navalAI.js';

export const FISH_ROLL = Object.freeze([2, 4]);
export const FISH_SALT = 0xf15b;
export const FISH_SMACK_SHARE = 0.45;
export const FISH_ROADS_IN = Object.freeze([0.75, 0.5, 1, 0.25]);
export const FISH_SPACING = 30;
export const FISH_BERTH_CLEAR = 25;
export const FISH_GROUND_M = Object.freeze([450, 900]);
export const FISH_GROUND_SPREAD = Math.PI * 0.4;
export const FISH_TRIES = 10;
export const FISH_RING = 45;
export const FISH_STROKE = 0.4;
export const FISH_ANCHOR_M = 20;
export const FISH_CATCH = Object.freeze({ fishingSkiff: Object.freeze([2, 6]), fishingSmack: Object.freeze([5, 12]) });
export const FISH_KINDS = Object.freeze(['anchor', 'fish', 'home']);

const TAU = Math.PI * 2;
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function offSegment(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t);
}
export function clearOfBerths(p, harbour, length) {
  return harbour.berths.every((b) => {
    const fx = Math.sin(b.yaw) * length / 2, fz = Math.cos(b.yaw) * length / 2;
    return offSegment(p, [b.pos[0] - fx, b.pos[1] - fz], [b.pos[0] + fx, b.pos[1] + fz]) >= FISH_BERTH_CLEAR
      && offSegment(p, b.approach, b.pos) >= FISH_BERTH_CLEAR;
  });
}

const fishRng = (seed) => mulberry32(hash32(seed >>> 0, FISH_SALT));

/** @param {string} key @param {number} day */
export function fishersOf(key, day) {
  const r = mulberry32(hash32(keyHash(key), day >>> 0, FISH_SALT));
  const n = FISH_ROLL[0] + Math.floor(r() * (FISH_ROLL[1] - FISH_ROLL[0] + 1));
  const out = [];
  for (let i = 0; i < n; i++) {
    const seed = hash32(keyHash(key), day >>> 0, i, FISH_SALT);
    out.push({ i, seed, classId: fishRng(seed)() < FISH_SMACK_SHARE ? 'fishingSmack' : 'fishingSkiff' });
  }
  return out;
}

export function outwardOf(harbour) {
  let x = 0, z = 0;
  for (const b of harbour.berths) { x += b.pos[0]; z += b.pos[1]; }
  x /= harbour.berths.length; z /= harbour.berths.length;
  const dx = harbour.mouth[0] - x, dz = harbour.mouth[1] - z, d = Math.hypot(dx, dz);
  return d > 1 ? [dx / d, dz / d] : [...harbour.berths[0].normal];
}

export function berthSpan(harbour, n, u, length) {
  const m = harbour.mouth;
  const on = (p, w) => (p[0] - m[0]) * w[0] + (p[1] - m[1]) * w[1];
  let lo = Infinity, hi = -Infinity, depth = 0;
  for (const b of harbour.berths) {
    const fx = Math.sin(b.yaw) * length / 2, fz = Math.cos(b.yaw) * length / 2;
    for (const p of [[b.pos[0] - fx, b.pos[1] - fz], [b.pos[0] + fx, b.pos[1] + fz], b.approach]) { const a = on(p, u); lo = Math.min(lo, a); hi = Math.max(hi, a); }
    depth -= on(b.pos, n);
  }
  return { lo, hi, depth: depth / harbour.berths.length };
}

/**
 * @param {{ harbour: any, i: number, seed: number, hull: number, isWater: (x: number, z: number, hull: number) => boolean,
 *   grid: { clear: (a: number[], b: number[]) => boolean, path: (a: number[], b: number[]) => any } }} q
 */
export function fishingWaters({ harbour, i, seed, hull, isWater, grid }) {
  if (!harbour?.mouth || !harbour.berths?.length) return null;
  const m = harbour.mouth, n = outwardOf(harbour), u = [n[1], -n[0]], side = i % 2 ? -1 : 1, k = Math.floor(i / 2);
  const along = Math.atan2(u[0], u[1]);
  const water = (x, z) => !!isWater(x, z, hull);
  const length = (() => { const b = berthSize(harbour.hull ?? 4); return b.bowZ - b.aftZ; })();
  const span = berthSpan(harbour, n, u, length);
  const a = side > 0 ? span.hi + FISH_BERTH_CLEAR + k * FISH_SPACING : span.lo - FISH_BERTH_CLEAR - k * FISH_SPACING;
  let anchor = null;
  for (const share of FISH_ROADS_IN) {
    const d = span.depth * share;
    const p = [m[0] - n[0] * d + u[0] * a, m[1] - n[1] * d + u[1] * a];
    if (footprintClear(p, along, hull, isWater) && clearOfBerths(p, harbour, length) && grid.path(m, p)) { anchor = p; break; }
  }
  if (!anchor) return null;
  const r = fishRng(seed);
  // The first draw on this stream is the class (fishersOf), so skip it.
  r();
  let ground = null;
  for (let t = 0; t < FISH_TRIES && !ground; t++) {
    const a = Math.atan2(n[0], n[1]) + (r() * 2 - 1) * FISH_GROUND_SPREAD, d = FISH_GROUND_M[0] + r() * (FISH_GROUND_M[1] - FISH_GROUND_M[0]);
    const q = [m[0] + Math.sin(a) * d, m[1] + Math.cos(a) * d];
    if (water(q[0], q[1]) && grid.clear(m, q)) ground = q;
  }
  return ground ? { anchor, yaw: along, ground } : null;
}

/** @param {{ key: string, waters: { anchor: number[], yaw: number, ground: number[] }, lights: boolean }} q */
export function fishingErrand({ key, waters, lights }) {
  const errand = { kind: lights ? 'anchor' : 'fish', harbour: key, to: [...waters.anchor], at: [...waters.ground], yaw: waters.yaw, path: null, i: 0, ringing: false };
  return lights ? { errand, pos: [...waters.anchor], yaw: waters.yaw } : { errand, pos: [...waters.ground], yaw: waters.yaw + Math.PI };
}

export const fishingHeld = (e) => e?.kind === 'anchor' || (e?.kind === 'fish' && !!e.ringing);

export function stepFishing(ship, dt, ctx, { here, plan, way }) {
  const e = ship.errand;
  const lit = !!ctx.lights;
  const turn = (kind) => { e.kind = kind; e.path = null; e.i = 0; e.ringing = false; e.stall = 0; e.detour = null; };
  if (e.kind === 'anchor') {
    if (!lit) { turn('fish'); return stepFishing(ship, dt, ctx, { here, plan, way }); }
    if (dist2(here, e.to) > FISH_ANCHOR_M * 2) { turn('home'); return stepFishing(ship, dt, ctx, { here, plan, way }); }
    return { hold: { pos: [e.to[0], e.to[1]], yaw: e.yaw } };
  }
  if (e.kind === 'fish') {
    if (lit) { turn('home'); return stepFishing(ship, dt, ctx, { here, plan, way }); }
    if (e.ringing && !e.path) e.ringing = false;
    if (!e.ringing && dist2(here, e.at) <= FISH_RING + REACH_M) {
      e.ringing = true;
      e.path = [0, 1, 2, 3].map((k) => { const a = (k / 4) * TAU + (ship.seed % 360) * (Math.PI / 180); return [e.at[0] + Math.sin(a) * FISH_RING, e.at[1] + Math.cos(a) * FISH_RING]; });
      e.i = 0;
    }
    if (e.ringing) {
      if (dist2(here, e.path[e.i]) <= REACH_M) e.i = (e.i + 1) % e.path.length;
      return plan(e.path[e.i], FISH_STROKE);
    }
    const p = way(e.at);
    return p ? { ...plan(p, 0.8), sweeps: SWEEP_WAY, sailable: true } : (ship.errand = null);
  }
  if (e.kind === 'home') {
    if (!lit) { turn('fish'); return stepFishing(ship, dt, ctx, { here, plan, way }); }
    if (dist2(here, e.to) <= FISH_ANCHOR_M) { turn('anchor'); return { hold: { pos: [e.to[0], e.to[1]], yaw: e.yaw } }; }
    const p = way(e.to);
    if (!p) return (ship.errand = null);
    const left = dist2(here, e.to);
    return { ...plan(p, left > 120 ? 0.8 : Math.max(0.3, left / 150)), sweeps: SWEEP_WAY, sailable: true, berthing: !!e.path && e.i === e.path.length - 1 };
  }
  return (ship.errand = null);
}

export function fisherCatch(classId, seed) {
  const range = FISH_CATCH[/** @type {keyof typeof FISH_CATCH} */ (classId)] ?? FISH_CATCH.fishingSkiff;
  const r = fishRng(seed ^ 0xca7c);
  return { count: range[0] + Math.floor(r() * (range[1] - range[0] + 1)) };
}

// The errand never travels on the wire, so a boat taken over from another player is found again by her seed.
export function fisherPlace(seed, harbours, days) {
  for (const day of days) for (const h of harbours) {
    const f = fishersOf(h.key, day).find((x) => x.seed === (seed >>> 0));
    if (f) return { key: h.key, i: f.i, classId: f.classId, day };
  }
  return null;
}

