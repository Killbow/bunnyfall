// @ts-check

// How the in-game editor draws its move, turn, and size handles, and where each one can be grabbed. poiGizmo.js says
// what a drag on a handle does; this module says what the handle looks like: thick shafts with solid cone heads, filled
// squares between two axes, thick rings, and solid boxes. Each handle's grab area is exactly what is drawn: a line is
// grabbed inside its drawn width on screen (square caps included), and a solid or a filled square where a ray meets one
// of its drawn triangles. Sizes are in units of the arm `L` (poiGizmo.js gizmoSize), and line widths in CSS pixels, so
// the handles keep their size on screen at any distance and on a high-DPI screen. Pure: no DOM, no GL.

import { END_ON, EDGE_ON } from './poiGizmo.js';

export const GIZMO_LINE_PX = Object.freeze({ shaft: 5, ring: 5, view: 4, edge: 2, tick: 3 });
export const GIZMO_DIM = 0.4;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a); return l > 0 ? mul(a, 1 / l) : [0, 0, 0]; };
const AX = { x: 0, y: 1, z: 2 };
const PLANE = { xy: [0, 1, 2], yz: [1, 2, 0], xz: [0, 2, 1] };
const CONE_SIDES = 16, RING_CHORDS = 64;

/**
 * @typedef {{ handle: string, hidden: boolean, w: number, segs: number[][][], tris: number[][][], solid: boolean,
 *   ring?: { n: number[], R: number } }} GizmoPart
 */

function basisOf(n) {
  const r = norm(Math.abs(n[1]) < 0.99 ? cross(n, [0, 1, 0]) : cross(n, [1, 0, 0]));
  return [r, cross(n, r)];
}
function outward(tris, center) {
  for (const t of tris) {
    const n = cross(sub(t[1], t[0]), sub(t[2], t[0]));
    const m = mul(add(add(t[0], t[1]), t[2]), 1 / 3);
    if (dot(n, sub(m, center)) < 0) { const k = t[1]; t[1] = t[2]; t[2] = k; }
  }
  return tris;
}
function cone(base, tip, r, u, v) {
  const tris = [];
  for (let k = 0; k < CONE_SIDES; k++) {
    const a0 = (k / CONE_SIDES) * 2 * Math.PI, a1 = ((k + 1) / CONE_SIDES) * 2 * Math.PI;
    const p0 = add(base, add(mul(u, Math.cos(a0) * r), mul(v, Math.sin(a0) * r)));
    const p1 = add(base, add(mul(u, Math.cos(a1) * r), mul(v, Math.sin(a1) * r)));
    tris.push([p0, p1, tip], [base, p1, p0]);
  }
  return outward(tris, mul(add(base, tip), 0.5));
}
function box(c, axes, k) {
  const corner = (i, j, l) => add(add(add(c, mul(axes[0], i ? k : -k)), mul(axes[1], j ? k : -k)), mul(axes[2], l ? k : -k));
  const q = [];
  for (let i = 0; i < 8; i++) q.push(corner(i & 1, (i >> 1) & 1, (i >> 2) & 1));
  const faces = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]];
  const tris = [];
  for (const [a, b, e, d] of faces) tris.push([q[a], q[b], q[e]], [q[a], q[e], q[d]]);
  return outward(tris, c);
}
const quad = (p) => ({ segs: [[p[0], p[1]], [p[1], p[2]], [p[2], p[3]], [p[3], p[0]]], tris: [[p[0], p[1], p[2]], [p[0], p[2], p[3]]] });
function ringSegs(c, n, R) {
  const [r, u] = basisOf(n), segs = [];
  for (let k = 0; k < RING_CHORDS; k++) {
    const a0 = (k / RING_CHORDS) * 2 * Math.PI, a1 = ((k + 1) / RING_CHORDS) * 2 * Math.PI;
    segs.push([add(c, add(mul(r, Math.cos(a0) * R), mul(u, Math.sin(a0) * R))), add(c, add(mul(r, Math.cos(a1) * R), mul(u, Math.sin(a1) * R)))]);
  }
  return segs;
}

/**
 * @param {'move' | 'turn' | 'size'} mode @param {number[]} c @param {number[][]} axes @param {number} L @param {number[]} viewDir
 * @returns {GizmoPart[]}
 */
export function gizmoParts(mode, c, axes, L, viewDir) {
  /** @type {GizmoPart[]} */
  const out = [];
  const W = GIZMO_LINE_PX;
  if (mode === 'move' || mode === 'size') {
    for (const h of ['x', 'y', 'z']) {
      const i = AX[h], a = axes[i], u = axes[(i + 1) % 3], v = axes[(i + 2) % 3];
      const hidden = Math.abs(dot(a, viewDir)) > END_ON;
      if (mode === 'move') {
        const base = add(c, mul(a, L * 0.78));
        out.push({ handle: h, hidden, w: W.shaft, segs: [[add(c, mul(a, L * 0.15)), add(c, mul(a, L * 0.8))]], tris: cone(base, add(c, mul(a, L)), L * 0.07, u, v), solid: true });
      } else {
        out.push({ handle: h, hidden, w: W.shaft, segs: [[add(c, mul(a, L * 0.15)), add(c, mul(a, L * 0.93))]], tris: box(add(c, mul(a, L)), axes, L * 0.07), solid: true });
      }
    }
  }
  if (mode === 'move') {
    for (const h of ['xy', 'yz', 'xz']) {
      const [i, j, k] = PLANE[h], u = axes[i], v = axes[j];
      const p = (s, t) => add(add(c, mul(u, s * L)), mul(v, t * L));
      out.push({ handle: h, hidden: Math.abs(dot(axes[k], viewDir)) < EDGE_ON, w: W.edge, ...quad([p(0.25, 0.25), p(0.45, 0.25), p(0.45, 0.45), p(0.25, 0.45)]), solid: false });
    }
    const [r, u] = basisOf(viewDir), k = L * 0.08;
    const p = (s, t) => add(add(c, mul(r, s * k)), mul(u, t * k));
    out.push({ handle: 'view', hidden: false, w: W.edge, ...quad([p(-1, -1), p(1, -1), p(1, 1), p(-1, 1)]), solid: false });
  }
  if (mode === 'size') out.push({ handle: 'all', hidden: false, w: W.edge, segs: [], tris: box(c, axes, L * 0.08), solid: true });
  if (mode === 'turn') {
    for (const h of ['x', 'y', 'z']) out.push({ handle: h, hidden: false, w: W.ring, segs: ringSegs(c, axes[AX[h]], L), tris: [], solid: false, ring: { n: axes[AX[h]], R: L } });
    const n = norm(mul(viewDir, -1));
    out.push({ handle: 'view', hidden: false, w: W.view, segs: ringSegs(c, n, L * 1.18), tris: [], solid: false, ring: { n, R: L * 1.18 } });
  }
  return out;
}

export function rayTriangle(o, d, t) {
  const e1 = sub(t[1], t[0]), e2 = sub(t[2], t[0]), p = cross(d, e2), det = dot(e1, p);
  if (Math.abs(det) < 1e-12) return null;
  const s = sub(o, t[0]), u = dot(s, p) / det;
  if (u < 0 || u > 1) return null;
  const q = cross(s, e1), v = dot(d, q) / det;
  if (v < 0 || u + v > 1) return null;
  const k = dot(e2, q) / det;
  return k >= 0 ? k : null;
}

export function rayLine(o, d, a, b, w, eye, fwd, F) {
  const za = dot(sub(a, eye), fwd), zb = dot(sub(b, eye), fwd), zd = dot(d, fwd);
  if (za <= 1e-6 || zb <= 1e-6 || zd <= 1e-9) return null;
  // screen points as vectors across the view, in CSS pixels
  const sa = mul(sub(mul(sub(a, eye), 1 / za), fwd), F), sb = mul(sub(mul(sub(b, eye), 1 / zb), fwd), F);
  const sc = mul(sub(mul(add(sub(o, eye), d), 1 / dot(add(sub(o, eye), d), fwd)), fwd), F);
  const u = sub(sb, sa), l = len(u), q = sub(sc, sa), h = w / 2;
  const along = l > 1e-9 ? dot(q, u) / l : 0;
  const across = l > 1e-9 ? len(sub(q, mul(u, along / l))) : len(q);
  if (along < -h || along > l + h || across > h) return null;
  const s = l > 1e-9 ? Math.min(1, Math.max(0, along / l)) : 0;
  return Math.max(0, dot(sub(add(a, mul(sub(b, a), s)), o), d));
}

/**
 * @param {{ mode: 'move' | 'turn' | 'size', c: number[], axes: number[][], L: number, viewDir: number[], pxWorld: number,
 *   eye?: number[], fwd?: number[], F?: number }} g
 * @param {number[]} o @param {number[]} d
 */
export function pickGizmo(g, o, d) {
  const eye = g.eye ?? o, fwd = g.fwd ?? g.viewDir;
  const F = g.F ?? dot(sub(g.c, eye), fwd) / Math.max(1e-12, g.pxWorld);
  let best = null, bestT = Infinity, last = null, lastT = Infinity;
  for (const p of gizmoParts(g.mode, g.c, g.axes, g.L, g.viewDir)) {
    if (p.hidden) continue;
    let t = Infinity;
    for (const tri of p.tris) { const k = rayTriangle(o, d, tri); if (k !== null && k < t) t = k; }
    for (const [a, b] of p.segs) { const k = rayLine(o, d, a, b, p.w, eye, fwd, F); if (k !== null && k < t) t = k; }
    if (t === Infinity) continue;
    const facing = p.handle === 'view' || p.handle === 'all';
    if (facing) { if (t < lastT) { last = p.handle; lastT = t; } } else if (t < bestT) { best = p.handle; bestT = t; }
  }
  return best ?? last;
}

/**
 * @param {{ mode: 'move' | 'turn' | 'size', c: number[], axes: number[][], L: number, viewDir: number[], eye?: number[] }} g
 * @param {{ hot?: string | null, colors: Record<string, number[]>, sweep?: { handle: string, from: number[], axis: number[], deg: number } | null, snapDeg?: number }} o
 */
export function gizmoDraw(g, { hot = null, colors, sweep = null, snapDeg = 0 }) {
  /** @type {{ a: number[], b: number[], color: number[], w: number }[]} */
  const lines = [];
  /** @type {{ a: number[], b: number[], c: number[], color: number[] }[]} */
  const tris = [];
  const eye = g.eye ?? sub(g.c, mul(g.viewDir, g.L * 10));
  const light = norm(add(mul(g.viewDir, -1), [0, 0.8, 0]));
  const parts = gizmoParts(g.mode, g.c, g.axes, g.L, g.viewDir);
  const depth = (p) => (p.tris.length ? dot(sub(p.tris[0][0], eye), g.viewDir) : 0);
  const solids = parts.filter((p) => !p.hidden && p.tris.length).sort((p, q) => depth(q) - depth(p));
  for (const p of parts) {
    if (p.hidden) continue;
    const col = p.handle === hot ? colors.hover : colors[p.handle];
    for (const [a, b] of p.segs) {
      let color = col;
      if (p.ring && p.handle !== 'view' && dot(sub(mul(add(a, b), 0.5), g.c), g.viewDir) > 0) color = [col[0], col[1], col[2], col[3] * GIZMO_DIM];
      lines.push({ a, b, color, w: p.w });
    }
  }
  for (const p of solids) {
    const col = p.handle === hot ? colors.hover : colors[p.handle];
    for (const t of p.tris) {
      const n = norm(cross(sub(t[1], t[0]), sub(t[2], t[0])));
      if (p.solid) {
        if (dot(n, sub(eye, t[0])) <= 0) continue;
        const k = 0.6 + 0.4 * Math.max(0, dot(n, light));
        tris.push({ a: t[0], b: t[1], c: t[2], color: [col[0] * k, col[1] * k, col[2] * k, col[3]] });
      } else tris.push({ a: t[0], b: t[1], c: t[2], color: [col[0], col[1], col[2], col[3] * 0.45] });
    }
  }
  const ring = sweep ? parts.find((p) => p.handle === sweep.handle && p.ring) : null;
  if (sweep && ring?.ring) {
    const R = ring.ring.R, n = sweep.axis, a = norm(sub(sweep.from, mul(n, dot(sweep.from, n))));
    const b = cross(n, a), col = colors.hover;
    const at = (deg, r) => { const q = (deg * Math.PI) / 180; return add(g.c, mul(add(mul(a, Math.cos(q)), mul(b, Math.sin(q))), r)); };
    const steps = Math.max(1, Math.ceil(Math.abs(sweep.deg) / 5));
    for (let k = 0; k < steps; k++) tris.push({ a: g.c, b: at((sweep.deg * k) / steps, R), c: at((sweep.deg * (k + 1)) / steps, R), color: [col[0], col[1], col[2], 0.3] });
    lines.push({ a: g.c, b: at(0, R), color: col, w: GIZMO_LINE_PX.edge }, { a: g.c, b: at(sweep.deg, R), color: col, w: GIZMO_LINE_PX.edge });
    // a tick at each snap step from where the drag began, longer every quarter turn
    if (snapDeg > 0) for (let deg = 0; deg < 360 - 1e-6; deg += snapDeg) lines.push({ a: at(deg, R * 1.05), b: at(deg, R * (deg % 90 === 0 ? 1.2 : 1.13)), color: col, w: GIZMO_LINE_PX.tick });
  }
  return { lines, tris, L: g.L };
}

export function viewForward(view, toward) {
  const f = norm([view[2], view[6], view[10]]);
  return dot(f, toward) < 0 ? mul(f, -1) : f;
}
