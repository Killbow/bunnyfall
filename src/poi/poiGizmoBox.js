// @ts-check
// Bounding-box size handles for the in-game editor, drawn by poiGizmoLook.js.
// Point-like selections (<= 1 cm) return null so the editor falls back to arm handles.

import { beginGizmoDrag, dragResult, rayPlane } from './poiGizmo.js';
import { FACE_MIN } from './poiGizmoLook.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const AX = { x: 0, y: 1, z: 2 };
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

/**
 * @param {number[]} c
 * @param {number[][]} axes
 * @param {number[][]} points
 */
export function boxAlong(c, axes, points) {
  if (!points.length) return null;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of points) for (let i = 0; i < 3; i++) { const s = dot(sub(p, c), axes[i]); if (s < lo[i]) lo[i] = s; if (s > hi[i]) hi[i] = s; }
  return [0, 1, 2].some((i) => hi[i] - lo[i] > 0.01) ? { lo, hi } : null;
}

function spotOf(g, key) {
  const F = FACE_MIN * g.L, lo = g.box.lo, hi = g.box.hi;
  const end = (j, up) => (Math.abs(lo[j]) < F && Math.abs(hi[j]) < F ? (up ? F : -F) : up ? hi[j] : lo[j]);
  const face = !key.startsWith('corner'), i = face ? AX[key[0]] : -1, n = face ? 0 : Number(key.slice(6));
  let at = g.c, along = 0;
  for (let j = 0; j < 3; j++) {
    const s = face ? (j === i ? end(j, key[1] === '+') : (end(j, false) + end(j, true)) / 2) : end(j, (n & (1 << j)) !== 0);
    at = add(at, mul(g.axes[j], s));
    if (j === i) along = s;
  }
  return { at, along, i };
}

/**
 * @param {{ mode: 'move' | 'turn' | 'size', c: number[], axes: number[][], L: number, viewDir: number[], box?: { lo: number[], hi: number[] } | null, eye?: number[] | null }} g
 * @param {string} key
 * @param {number[]} o
 * @param {number[]} d
 */
export function beginHandleDrag(g, key, o, d) {
  if (g.box && /^[xyz][+-]$/.test(key)) {
    const { at, along, i } = spotOf(g, key), axis = g.axes[i], n = cross(axis, cross(g.viewDir, axis)), nl = len(n);
    if (nl < 1e-6 || Math.abs(along) < 1e-9) return null;
    const plane = mul(n, 1 / nl), t = rayPlane(o, d, at, plane);
    if (t === null) return null;
    return { mode: 'size', handle: key[0], face: true, c: g.c, axes: g.axes, plane, at, axis, i, along, screen: null, hit0: add(o, mul(d, t)), L: g.L };
  }
  if (handleOf(key) !== 'corner') return beginGizmoDrag(g, handleOf(key), o, d);
  const { at } = spotOf(g, key), w = sub(at, g.c), r = sub(w, mul(g.viewDir, dot(w, g.viewDir))), r0 = len(r);
  const depth = g.eye ? dot(sub(at, g.eye), g.viewDir) / dot(sub(g.c, g.eye), g.viewDir) : 1;
  const plane = g.viewDir, t = rayPlane(o, d, at, plane);
  if (t === null || !(depth > 1e-9) || r0 < FACE_MIN * g.L * depth) return null;
  return { mode: 'size', handle: 'corner', corner: true, c: g.c, axes: g.axes, plane, at, axis: null, along: null, screen: null, hit0: add(o, mul(d, t)), out: mul(r, 1 / r0), r0, L: g.L };
}

/**
 * @param {any} s
 * @param {number[]} o
 * @param {number[]} d
 * @param {{ move?: number, turn?: number, size?: number } | null} [snap]
 */
export function handleDragResult(s, o, d, snap = null) {
  if (s?.face) {
    const t = rayPlane(o, d, s.at, s.plane);
    if (t === null) return null;
    let f = (s.along + dot(sub(add(o, mul(d, t)), s.hit0), s.axis)) / s.along;
    if (snap?.size) f = 1 + snapTo(f - 1, snap.size);
    f = Math.max(0.01, f);
    return { size: [0, 1, 2].map((k) => (k === s.i ? f : 1)) };
  }
  if (!s?.corner) return dragResult(s, o, d, snap);
  const t = rayPlane(o, d, s.at, s.plane);
  if (t === null) return null;
  let f = 1 + dot(sub(add(o, mul(d, t)), s.hit0), s.out) / s.r0;
  if (snap?.size) f = 1 + snapTo(f - 1, snap.size);
  f = Math.max(0.01, f);
  return { size: [f, f, f] };
}
