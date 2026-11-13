// @ts-check
// Bounding-box size handles for the in-game editor (drawn by poiGizmoLook.js): face handles use poiGizmo.js's
// single-axis drag rule, corner handles scale all three axes uniformly here, and point-like selections (<= 1 cm)
// return null so the editor falls back to arm handles.

import { beginGizmoDrag, dragResult, rayPlane } from './poiGizmo.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const snapTo = (v, step) => (step > 0 ? Math.round(v / step) * step : v);

export const handleOf = (/** @type {string} */ key) => (key.startsWith('corner') ? 'corner' : key.length === 2 && /[+-]$/.test(key) ? key[0] : key);

export function cornersOf(min, max, m) {
  const out = [];
  for (let i = 0; i < 8; i++) {
    const p = [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]];
    out.push([0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]));
  }
  return out;
}

/** @param {number[]} c @param {number[][]} axes @param {number[][]} points */
export function boxAlong(c, axes, points) {
  if (!points.length) return null;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of points) for (let i = 0; i < 3; i++) { const s = dot(sub(p, c), axes[i]); if (s < lo[i]) lo[i] = s; if (s > hi[i]) hi[i] = s; }
  return [0, 1, 2].some((i) => hi[i] - lo[i] > 0.01) ? { lo, hi } : null;
}

/**
 * @param {{ mode: 'move' | 'turn' | 'size', c: number[], axes: number[][], L: number, viewDir: number[] }} g
 * @param {string} key @param {number[]} o @param {number[]} d
 */
export function beginHandleDrag(g, key, o, d) {
  if (handleOf(key) !== 'corner') return beginGizmoDrag(g, handleOf(key), o, d);
  const plane = g.viewDir, t = rayPlane(o, d, g.c, plane);
  if (t === null) return null;
  const hit0 = add(o, mul(d, t)), r0 = len(sub(hit0, g.c));
  if (r0 < 1e-9) return null;
  return { mode: 'size', handle: 'corner', corner: true, c: g.c, axes: g.axes, plane, axis: null, along: null, screen: null, hit0, out: mul(sub(hit0, g.c), 1 / r0), r0, L: g.L };
}

/**
 * @param {any} s the state from beginHandleDrag @param {number[]} o @param {number[]} d
 * @param {{ move?: number, turn?: number, size?: number } | null} [snap]
 */
export function handleDragResult(s, o, d, snap = null) {
  if (!s?.corner) return dragResult(s, o, d, snap);
  const t = rayPlane(o, d, s.c, s.plane);
  if (t === null) return null;
  let f = dot(sub(add(o, mul(d, t)), s.c), s.out) / s.r0;
  if (snap?.size) f = 1 + snapTo(f - 1, snap.size);
  f = Math.max(0.01, f);
  return { size: [f, f, f] };
}
