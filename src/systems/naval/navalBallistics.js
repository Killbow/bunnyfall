// @ts-check
// A shot is a point under gravity alone, so its flight is a closed form of its launch. Every client flies a volley
// from the same launches and seed, and only the shooter resolves hits. Each frame sweeps the segment since the last
// one, so no frame rate bends or tunnels a shot.

import { mulberry32 } from '../../combat/bloodArt.js';

export const SHOT_GRAVITY = 9.81;
const UP = Object.freeze([0, 1, 0]);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const DEG = Math.PI / 180;

/**
 * @param {number[]} dir
 * @param {number} elevation
 * @param {number} speed
 * @param {number[] | null} [carry]
 * @returns {number[]}
 */
export function launchVelocity(dir, elevation, speed, carry = null) {
  const l = Math.hypot(dir[0], dir[2]) || 1;
  const c = Math.cos(elevation) * speed / l, s = Math.sin(elevation) * speed;
  return [dir[0] * c + (carry?.[0] ?? 0), s + (carry?.[1] ?? 0), dir[2] * c + (carry?.[2] ?? 0)];
}

export function shotPosition(p0, v0, t, g = SHOT_GRAVITY, out = [0, 0, 0]) {
  out[0] = p0[0] + v0[0] * t;
  out[1] = p0[1] + v0[1] * t - 0.5 * g * t * t;
  out[2] = p0[2] + v0[2] * t;
  return out;
}
export function shotVelocity(v0, t, g = SHOT_GRAVITY, out = [0, 0, 0]) {
  out[0] = v0[0]; out[1] = v0[1] - g * t; out[2] = v0[2];
  return out;
}

export function timeToHeight(y0, vy, h, g = SHOT_GRAVITY) {
  const d = vy * vy + 2 * g * (y0 - h);
  if (d < 0) return null;
  const t = (vy + Math.sqrt(d)) / g;
  return t >= 0 ? t : null;
}

export function landing(p0, v0, h, g = SHOT_GRAVITY) {
  const t = timeToHeight(p0[1], v0[1], h, g);
  return t == null ? null : { t, point: shotPosition(p0, v0, t, g) };
}

export function rangeAt(elevation, speed, dy, g = SHOT_GRAVITY) {
  const t = timeToHeight(dy, Math.sin(elevation) * speed, 0, g);
  return t == null ? 0 : Math.cos(elevation) * speed * t;
}

// Past the gun's reach this returns `hi`, so the aim shows the volley falling short.
export function elevationForRange(range, speed, dy, lo, hi, g = SHOT_GRAVITY) {
  if (!(range > 0)) return lo;
  const v2 = speed * speed;
  const disc = v2 * v2 - g * (g * range * range - 2 * dy * v2);
  if (disc < 0) return hi;
  return clamp(Math.atan((v2 - Math.sqrt(disc)) / (g * range)), lo, hi);
}

export function maxRange(speed, dy, hi, g = SHOT_GRAVITY) {
  return rangeAt(Math.min(hi, 45 * DEG), speed, dy, g);
}

export function arcPoints(p0, v0, h, n, g = SHOT_GRAVITY) {
  const end = timeToHeight(p0[1], v0[1], h, g) ?? 1;
  const out = [];
  const k = Math.max(2, n | 0);
  for (let i = 0; i < k; i++) out.push(shotPosition(p0, v0, end * (i / (k - 1)), g, [0, 0, 0]));
  return out;
}

export function fallArc(p0, land, n) {
  const out = [];
  const k = Math.max(2, n | 0);
  for (let i = 0; i < k; i++) {
    const s = i / (k - 1);
    out.push([p0[0] + (land[0] - p0[0]) * s, p0[1] + (land[1] - p0[1]) * s * s, p0[2] + (land[2] - p0[2]) * s]);
  }
  return out;
}

/** @returns {{ c: number[], ax: number[], ay: number[], az: number[], h: number[] }} */
export function orientedBox(m, center, extent) {
  const col = (i) => [m[i * 4], m[i * 4 + 1], m[i * 4 + 2]];
  const cx = col(0), cy = col(1), cz = col(2);
  const lx = Math.hypot(...cx) || 1, ly = Math.hypot(...cy) || 1, lz = Math.hypot(...cz) || 1;
  const c = [
    m[0] * center[0] + m[4] * center[1] + m[8] * center[2] + m[12],
    m[1] * center[0] + m[5] * center[1] + m[9] * center[2] + m[13],
    m[2] * center[0] + m[6] * center[1] + m[10] * center[2] + m[14],
  ];
  return {
    c,
    ax: [cx[0] / lx, cx[1] / lx, cx[2] / lx], ay: [cy[0] / ly, cy[1] / ly, cy[2] / ly], az: [cz[0] / lz, cz[1] / lz, cz[2] / lz],
    h: [Math.abs(extent[0] * lx), Math.abs(extent[1] * ly), Math.abs(extent[2] * lz)],
  };
}

export function toBoxLocal(box, p) {
  const d = [p[0] - box.c[0], p[1] - box.c[1], p[2] - box.c[2]];
  const dot = (a) => a[0] * d[0] + a[1] * d[1] + a[2] * d[2];
  return [dot(box.ax), dot(box.ay), dot(box.az)];
}

export function segmentBoxEntry(a, b, box, radius = 0) {
  const la = toBoxLocal(box, a), lb = toBoxLocal(box, b);
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    const h = box.h[i] + radius, d = lb[i] - la[i];
    if (Math.abs(d) < 1e-9) {
      if (la[i] < -h || la[i] > h) return null;
      continue;
    }
    let u = (-h - la[i]) / d, w = (h - la[i]) / d;
    if (u > w) { const s = u; u = w; w = s; }
    if (u > t0) t0 = u;
    if (w < t1) t1 = w;
    if (t0 > t1) return null;
  }
  const point = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0, a[2] + (b[2] - a[2]) * t0];
  return { t: t0, point, local: [la[0] + (lb[0] - la[0]) * t0, la[1] + (lb[1] - la[1]) * t0, la[2] + (lb[2] - la[2]) * t0] };
}

export function segmentCrossesDown(a, b, h) {
  if (!(a[1] >= h && b[1] < h)) return null;
  return (a[1] - h) / (a[1] - b[1]);
}

export const volleyRandom = (seed) => mulberry32(seed >>> 0);

/** @param {number[]} dir @param {number} elevation @param {() => number} rand */
export function scatter(dir, elevation, yawSpreadDeg, pitchSpreadDeg, rand) {
  const tri = () => rand() + rand() - 1;
  const yaw = tri() * yawSpreadDeg * DEG;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { dir: [dir[0] * c + dir[2] * s, 0, -dir[0] * s + dir[2] * c], elevation: elevation + tri() * pitchSpreadDeg * DEG };
}

export function flatUnit(v) {
  const l = Math.hypot(v[0], v[2]);
  return l > 1e-9 ? [v[0] / l, 0, v[2] / l] : null;
}

export function raySeaHit(o, d, h) {
  if (!(d[1] < -1e-6)) return null;
  const s = (h - o[1]) / d[1];
  if (!(s >= 0)) return null;
  return { distance: s, point: [o[0] + d[0] * s, o[1] + d[1] * s, o[2] + d[2] * s] };
}

export { UP as NAVAL_UP, DEG as NAVAL_DEG };
