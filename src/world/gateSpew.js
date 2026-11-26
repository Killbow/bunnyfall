// @ts-check
import { PROJECTILE, PROJECTILE_FIXED_DT } from '../items/droppedTorches.js';

export const SPEW_GAP_MS = 220;
export const SPEW_SPEED = Object.freeze({ min: 8, max: 13 });
export const SPEW_SPREAD = 1.6;
export const SPEW_SLOT_MARGIN = 0.15;
export const SPEW_RISE = Object.freeze({ min: 0.9, max: 1.5 });
export const SPEW_BOUNCE = 0.5;
// 0.05 matches the thrown torch drag (`0.05 * throwGravity`) at the Handheld Torches default gravity strength of
// 1.0.
export const SPEW_GRAVITY_DRAG = 0.05;
export const SPEW_FLIGHT_MAX_S = 6;

/**
 * @param {() => number} rolls
 * @param {number} n
 * @param {number} bearing
 */
export function spewLaunches(rolls, n, bearing) {
  const out = [];
  const slots = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rolls() * (i + 1)); const t = slots[i]; slots[i] = slots[j]; slots[j] = t; }
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? (slots[i] + SPEW_SLOT_MARGIN + rolls() * (1 - 2 * SPEW_SLOT_MARGIN)) / n : rolls();
    const a = bearing + (u * 2 - 1) * SPEW_SPREAD;
    const rise = SPEW_RISE.min + rolls() * (SPEW_RISE.max - SPEW_RISE.min);
    const l = Math.hypot(1, rise);
    const speed = SPEW_SPEED.min + rolls() * (SPEW_SPEED.max - SPEW_SPEED.min);
    out.push({ at: i * SPEW_GAP_MS, dir: [Math.sin(a) / l, rise / l, Math.cos(a) / l], speed });
  }
  return out;
}

export function spewPiece(from, launch) {
  return { pos: [...from], dirStart: [...launch.dir], speedStart: launch.speed, speedCurrent: launch.speed, gravity: [0, 0, 0], t: 0, acc: 0, rest: false, bounces: 0 };
}

/**
 * Mirrors `stepProjectile` in droppedTorches.js without the entity hit, so spoils fly and bounce like a thrown
 * torch; keep the two in step.
 * @param {ReturnType<typeof spewPiece>} p
 * @param {(from: number[], dir: number[], len: number) => ({dist: number, normal?: number[]}|null)} ray
 */
export function stepSpew(p, ray) {
  if (p.rest) return 'rest';
  p.t += PROJECTILE_FIXED_DT;
  p.gravity = [p.gravity[0], p.gravity[1] + PROJECTILE.gravityAccel * SPEW_GRAVITY_DRAG * PROJECTILE_FIXED_DT, p.gravity[2]];
  const step = [0, 1, 2].map((k) => p.dirStart[k] * p.speedCurrent * PROJECTILE_FIXED_DT + p.gravity[k]);
  const len = Math.hypot(step[0], step[1], step[2]);
  if (!(len > 0)) return 'fly';
  const dir = [step[0] / len, step[1] / len, step[2] / len];
  const hit = ray(p.pos, dir, len);
  if (hit && Number.isFinite(hit.dist)) {
    const point = [p.pos[0] + dir[0] * hit.dist, p.pos[1] + dir[1] * hit.dist, p.pos[2] + dir[2] * hit.dist];
    if (p.speedCurrent < p.speedStart * PROJECTILE.restFraction) { p.pos = point; p.rest = true; return 'rest'; }
    const n = hit.normal ?? [0, 1, 0];
    const v = [p.dirStart[0], p.gravity[1], p.dirStart[2]];
    const vn = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
    p.dirStart = [v[0] - 2 * vn * n[0], v[1] - 2 * vn * n[1], v[2] - 2 * vn * n[2]];
    p.speedCurrent *= SPEW_BOUNCE;
    p.gravity = [0, 0, 0];
    p.bounces++;
    p.pos = [point[0] + n[0] * 0.02, point[1] + n[1] * 0.02, point[2] + n[2] * 0.02];
    return 'bounce';
  }
  p.pos = [p.pos[0] + step[0], p.pos[1] + step[1], p.pos[2] + step[2]];
  if (p.t >= SPEW_FLIGHT_MAX_S) { p.rest = true; return 'rest'; }
  return 'fly';
}

export function flySpew(p, dt, ray) {
  let what = 'fly';
  p.acc += Math.max(0, dt);
  while (p.acc >= PROJECTILE_FIXED_DT && !p.rest) {
    p.acc -= PROJECTILE_FIXED_DT;
    const r = stepSpew(p, ray);
    if (r === 'rest') what = 'rest';
    else if (r === 'bounce' && what !== 'rest') what = 'bounce';
  }
  return what;
}

export const floorRayAt = (y) => (from, dir, len) => {
  if (!(dir[1] < 0)) return null;
  const d = (from[1] - y) / -dir[1];
  return d >= 0 && d <= len ? { dist: d, normal: [0, 1, 0] } : null;
};
export function restOf(from, launch, floorY) {
  const p = spewPiece(from, launch), ray = floorRayAt(floorY);
  for (let k = 0; k <= Math.ceil(SPEW_FLIGHT_MAX_S / PROJECTILE_FIXED_DT) && !p.rest; k++) stepSpew(p, ray);
  return p.pos;
}
export const SPEW_KEEP_TRIES = 10;
export const SPEW_KEEP_EASE = 0.84;
/**
 * @param {number[]} from
 * @param {{ at: number, dir: number[], speed: number }} launch
 * @param {{ centre: number[], r: number, floorY: number }|null} keep
 */
export function keepLaunch(from, launch, keep) {
  if (!keep || !Array.isArray(keep.centre) || !(keep.r > 0) || !Number.isFinite(keep.floorY)) return launch;
  const inside = (l) => { const p = restOf(from, l, keep.floorY); return Math.hypot(p[0] - keep.centre[0], p[2] - keep.centre[2]) <= keep.r; };
  if (inside(launch)) return launch;
  let speed = launch.speed;
  for (let k = 0; k < SPEW_KEEP_TRIES; k++) {
    speed *= SPEW_KEEP_EASE;
    const l = { at: launch.at, dir: launch.dir, speed };
    if (inside(l)) return l;
  }
  const dx = keep.centre[0] - from[0], dz = keep.centre[2] - from[2], h = Math.hypot(dx, dz), run = Math.hypot(launch.dir[0], launch.dir[2]);
  if (!(h > 1e-6)) return { at: launch.at, dir: launch.dir, speed };
  return { at: launch.at, dir: [(dx / h) * run, launch.dir[1], (dz / h) * run], speed };
}
