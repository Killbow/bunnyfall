// @ts-check

// How the in-game editor draws its move, turn, and size handles, and where each one can be grabbed. poiGizmo.js says
// what a drag on a handle does; this module says what the handle looks like: lit cone arrowheads at both ends of each
// axis, small two-color squares for the planes, thick rings, and solid boxes. A handle is grabbed anywhere it is drawn
// and within POI_GIZMO_PICK_PX of its lines and edges; where two grab areas meet, the nearer drawing wins, so no handle
// takes another's drawn pixels. Sizes are in units of the arm `L` (poiGizmo.js gizmoSize) and line widths in CSS
// pixels, so the gizmo keeps its size on screen. Pure: no DOM, no GL.

import { END_ON, EDGE_ON, POI_GIZMO_PICK_PX, POI_GIZMO_PX } from './poiGizmo.js';

export const GIZMO_LINE_PX = Object.freeze({ shaft: 3, sizeShaft: 2, ring: 8, view: 3, edge: 1.5, tick: 2, guide: 1.5, ruler: 1.5 });
export const GIZMO_DIM = 0.4;
export const GIZMO_REACH = Object.freeze({ arrow: 0.62, box: 0.62, plane: [0.4, 0.56] });

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a); return l > 0 ? mul(a, 1 / l) : [0, 0, 0]; };
const AX = { x: 0, y: 1, z: 2 };
const AXIS_NAME = ['x', 'y', 'z'];
const PLANE = { xy: [0, 1, 2], yz: [1, 2, 0], xz: [0, 2, 1] };
const CONE_SIDES = 32, RING_CHORDS = 96;
const FEATHER_PX = 1.5;

/**
 * @typedef {{ handle: string, hidden: boolean, w: number, segs: number[][][], mesh: GizmoMesh | null,
 *   tris: number[][][], solid: boolean, tint?: string[], ring?: { n: number[], R: number } }} GizmoPart
 */

function basisOf(n) {
  const r = norm(Math.abs(n[1]) < 0.99 ? cross(n, [0, 1, 0]) : cross(n, [1, 0, 0]));
  return [r, cross(n, r)];
}
function outward(mesh, center) {
  mesh.f.forEach((f, i) => {
    const [a, b, c] = f.map((k) => mesh.v[k]);
    const n = cross(sub(b, a), sub(c, a));
    if (dot(n, sub(mul(add(add(a, b), c), 1 / 3), center)) < 0) { f.reverse(); mesh.fn[i].reverse(); }
  });
  return mesh;
}
/** @typedef {{ v: number[][], f: number[][], fn: number[][][] }} GizmoMesh */
const trisOf = (mesh) => (mesh ? mesh.f.map((f) => f.map((k) => mesh.v[k])) : []);
function cone(base, tip, r, u, v) {
  const axis = norm(sub(tip, base)), h = len(sub(tip, base));
  const ring = (a) => add(mul(u, Math.cos(a)), mul(v, Math.sin(a)));
  // a side normal leans back toward the base by the cone's slope, so the light runs smoothly round it
  const side = (a) => norm(add(mul(ring(a), h), mul(axis, r)));
  const V = [], f = [], fn = [];
  for (let k = 0; k < CONE_SIDES; k++) V.push(add(base, mul(ring((k / CONE_SIDES) * 2 * Math.PI), r)));
  const T = V.push(tip) - 1, C = V.push(base) - 1, back = mul(axis, -1);
  for (let k = 0; k < CONE_SIDES; k++) {
    const k1 = (k + 1) % CONE_SIDES, a0 = (k / CONE_SIDES) * 2 * Math.PI, a1 = ((k + 1) / CONE_SIDES) * 2 * Math.PI;
    f.push([k, k1, T]); fn.push([side(a0), side(a1), side((a0 + a1) / 2)]);
    f.push([C, k1, k]); fn.push([back, back, back]);
  }
  return outward({ v: V, f, fn }, add(base, mul(axis, h / 3)));
}
function box(c, axes, k) {
  const V = [];
  for (let i = 0; i < 8; i++) V.push(add(add(add(c, mul(axes[0], i & 1 ? k : -k)), mul(axes[1], i & 2 ? k : -k)), mul(axes[2], i & 4 ? k : -k)));
  const f = [], fn = [];
  for (const [a, b, e, d] of [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]]) {
    const n = norm(sub(mul(add(add(V[a], V[b]), add(V[e], V[d])), 0.25), c));
    f.push([a, b, e], [a, e, d]); fn.push([n, n, n], [n, n, n]);
  }
  return outward({ v: V, f, fn }, c);
}
function quad(p, n) {
  return { v: p, f: [[0, 1, 2], [0, 2, 3]], fn: [[n, n, n], [n, n, n]] };
}
function ringSegs(c, n, R) {
  const [r, u] = basisOf(n), segs = [];
  for (let k = 0; k < RING_CHORDS; k++) {
    const a0 = (k / RING_CHORDS) * 2 * Math.PI, a1 = ((k + 1) / RING_CHORDS) * 2 * Math.PI;
    segs.push([add(c, add(mul(r, Math.cos(a0) * R), mul(u, Math.sin(a0) * R))), add(c, add(mul(r, Math.cos(a1) * R), mul(u, Math.sin(a1) * R)))]);
  }
  return segs;
}
/**
 * The quarter of a plane its square sits in, as signs along its two axes `u` and `v`: the one that shows farthest on
 * screen from the line of the third axis `n`, whose arrows would cover it; of two that tie, the higher one (a POI on
 * the ground keeps its squares above it), then the one nearer the eye.
 */
function planeQuarter(u, v, n, viewDir) {
  const flat = (a) => sub(a, mul(viewDir, dot(a, viewDir))), ns = norm(flat(n));
  let best = [1, 1], far = -Infinity;
  for (const [su, sv] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const q = add(mul(u, su), mul(v, sv)), qs = flat(q);
    const off = len(sub(qs, mul(ns, dot(qs, ns)))) + 2e-3 * q[1] - 1e-3 * dot(q, viewDir);
    if (off > far + 1e-9) { far = off; best = [su, sv]; }
  }
  return best;
}
/** @returns {GizmoPart} */
const part = (handle, hidden, w, segs, mesh, solid, more = {}) => ({ handle, hidden, w, segs, mesh, tris: trisOf(mesh), solid, ...more });

/**
 * @param {'move' | 'turn' | 'size'} mode @param {number[]} c @param {number[][]} axes @param {number} L @param {number[]} viewDir
 * @returns {GizmoPart[]}
 */
export function gizmoParts(mode, c, axes, L, viewDir) {
  const key = [mode, L, ...c, ...axes[0], ...axes[1], ...axes[2], ...viewDir];
  if (last && last.key.length === key.length && last.key.every((k, i) => k === key[i])) return last.parts;
  /** @type {GizmoPart[]} */
  const out = [];
  const W = GIZMO_LINE_PX, R = GIZMO_REACH;
  if (mode === 'move' || mode === 'size') {
    for (const h of ['x', 'y', 'z']) {
      const i = AX[h], a = axes[i], u = axes[(i + 1) % 3], v = axes[(i + 2) % 3];
      const hidden = Math.abs(dot(a, viewDir)) > END_ON;
      const at = (s) => add(c, mul(a, s * L));
      for (const sgn of [1, -1]) {
        if (mode === 'move') {
          out.push(part(h, hidden, W.shaft, [[at(sgn * 0.14), at(sgn * 0.46)]], cone(at(sgn * 0.45), at(sgn * R.arrow), L * 0.055, u, v), true));
        } else {
          out.push(part(h, hidden, W.sizeShaft, [[at(sgn * 0.09), at(sgn * (R.box - 0.045))]], box(at(sgn * R.box), axes, L * 0.045), true));
        }
      }
    }
  }
  if (mode === 'move') {
    const [p0, p1] = R.plane;
    for (const h of ['xy', 'yz', 'xz']) {
      const [i, j, k] = PLANE[h];
      const [su, sv] = planeQuarter(axes[i], axes[j], axes[k], viewDir), u = mul(axes[i], su), v = mul(axes[j], sv);
      const p = (s, t) => add(add(c, mul(u, s * L)), mul(v, t * L));
      const hidden = Math.abs(dot(axes[k], viewDir)) < EDGE_ON;
      out.push(part(h, hidden, W.edge, [], quad([p(p0, p0), p(p1, p0), p(p1, p1), p(p0, p1)], axes[k]), false, { tint: [AXIS_NAME[i], AXIS_NAME[j]] }));
    }
    const [r, u] = basisOf(viewDir), k = L * 0.05;
    const p = (s, t) => add(add(c, mul(r, s * k)), mul(u, t * k));
    const sq = [p(-1, -1), p(1, -1), p(1, 1), p(-1, 1)];
    out.push(part('view', false, W.edge, [[sq[0], sq[1]], [sq[1], sq[2]], [sq[2], sq[3]], [sq[3], sq[0]]], quad(sq, mul(viewDir, -1)), false));
  }
  if (mode === 'size') out.push(part('all', false, W.edge, [], box(c, axes, L * 0.05), true));
  if (mode === 'turn') {
    for (const h of ['x', 'y', 'z']) out.push(part(h, false, W.ring, ringSegs(c, axes[AX[h]], L), null, false, { ring: { n: axes[AX[h]], R: L } }));
    const n = norm(mul(viewDir, -1));
    out.push(part('view', false, W.view, ringSegs(c, n, L * 1.15), null, false, { ring: { n, R: L * 1.15 } }));
  }
  last = { key, parts: out };
  return out;
}
/** gizmoParts's last answer and what it was asked. @type {{ key: any[], parts: GizmoPart[] } | null} */
let last = null;

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

function onScreen(p, eye, fwd, F) {
  const q = sub(p, eye), z = dot(q, fwd);
  return z > 1e-6 ? mul(sub(mul(q, 1 / z), fwd), F) : null;
}
function nearSeg(s, a, b) {
  const u = sub(b, a), l2 = dot(u, u), k = l2 > 1e-18 ? Math.min(1, Math.max(0, dot(sub(s, a), u) / l2)) : 0;
  return { dist: len(sub(s, add(a, mul(u, k)))), k };
}

export function rayLine(o, d, a, b, w, eye, fwd, F) {
  const m = lineMeasure(o, d, a, b, w, eye, fwd, F);
  return m && m.out === 0 ? m.t : null;
}
function lineMeasure(o, d, a, b, w, eye, fwd, F) {
  const sa = onScreen(a, eye, fwd, F), sb = onScreen(b, eye, fwd, F), sc = onScreen(add(o, d), eye, fwd, F);
  if (!sa || !sb || !sc || dot(d, fwd) <= 1e-9) return null;
  const u = sub(sb, sa), l = len(u), q = sub(sc, sa), h = w / 2;
  const along = l > 1e-9 ? dot(q, u) / l : 0;
  const across = l > 1e-9 ? len(sub(q, mul(u, along / l))) : len(q);
  const dx = Math.max(0, -h - along, along - l - h), dy = Math.max(0, across - h);
  const k = l > 1e-9 ? Math.min(1, Math.max(0, along / l)) : 0;
  return { out: Math.hypot(dx, dy), center: nearSeg(sc, sa, sb).dist, t: Math.max(0, dot(sub(add(a, mul(sub(b, a), k)), o), d)) };
}

/** @param {GizmoPart} p */
export function grabOf(p, o, d, eye, fwd, F, tol = POI_GIZMO_PICK_PX) {
  let gap = Infinity, t = Infinity, reach = false;
  for (const tri of p.tris) {
    const k = rayTriangle(o, d, tri);
    if (k !== null) { if (gap > 0 || k < t) t = k; gap = 0; reach = true; continue; }
    if (gap === 0) continue;
    const s = tri.map((q) => onScreen(q, eye, fwd, F)), sc = onScreen(add(o, d), eye, fwd, F);
    if (!sc || s.some((q) => !q)) continue;
    for (let e = 0; e < 3; e++) {
      const m = nearSeg(sc, s[e], s[(e + 1) % 3]);
      if (m.dist <= tol && m.dist < gap) { gap = m.dist; t = Math.max(0, dot(sub(add(tri[e], mul(sub(tri[(e + 1) % 3], tri[e]), m.k)), o), d)); reach = true; }
    }
  }
  for (const [a, b] of p.segs) {
    const m = lineMeasure(o, d, a, b, p.w, eye, fwd, F);
    if (!m || (m.out > 0 && m.center > tol)) continue;
    reach = true;
    if (m.out < gap || (m.out === gap && m.t < t)) { gap = m.out; t = m.t; }
  }
  return reach ? { drawn: gap === 0, gap, t } : null;
}

/**
 * @param {{ mode: 'move' | 'turn' | 'size', c: number[], axes: number[][], L: number, viewDir: number[], pxWorld: number,
 *   eye?: number[], fwd?: number[], F?: number }} g
 * @param {number[]} o @param {number[]} d
 */
export function pickGizmo(g, o, d) {
  const eye = g.eye ?? o, fwd = g.fwd ?? g.viewDir;
  const F = g.F ?? dot(sub(g.c, eye), fwd) / Math.max(1e-12, g.pxWorld);
  let best = null, bestScore = Infinity, bestT = Infinity;
  for (const p of gizmoParts(g.mode, g.c, g.axes, g.L, g.viewDir)) {
    if (p.hidden) continue;
    const m = grabOf(p, o, d, eye, fwd, F);
    if (!m) continue;
    const facing = p.handle === 'view' || p.handle === 'all';
    const score = m.gap + (facing && !m.drawn ? POI_GIZMO_PICK_PX / 4 : 0);
    if (score < bestScore || (score === bestScore && m.t < bestT)) { best = p.handle; bestScore = score; bestT = m.t; }
  }
  return best;
}

/** A light from above, to the left, and in front of the eye, and its half vector with the eye, for a view direction. */
function lightOf(viewDir) {
  const right = norm(Math.abs(viewDir[1]) < 0.99 ? cross([0, 1, 0], viewDir) : cross([0, 0, 1], viewDir));
  const up = cross(viewDir, right);
  const l = norm(add(add(mul(viewDir, -0.8), mul(up, 0.75)), mul(right, -0.45)));
  return { l, h: norm(add(l, mul(viewDir, -1))) };
}
/** A lit color: a dim base, diffuse light, and a small white highlight. */
function shade(col, n, lt) {
  const k = 0.34 + 0.66 * Math.max(0, dot(n, lt.l)), s = 0.32 * Math.pow(Math.max(0, dot(n, lt.h)), 28);
  return [Math.min(1, col[0] * k + s), Math.min(1, col[1] * k + s), Math.min(1, col[2] * k + s), col[3]];
}
const avg = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, (a[3] + b[3]) / 2];

function meshDraw(p, colorOf, eye, lt, tris, lines) {
  const M = /** @type {GizmoMesh} */ (p.mesh), front = M.f.map((f) => !p.solid || dot(cross(sub(M.v[f[1]], M.v[f[0]]), sub(M.v[f[2]], M.v[f[0]])), sub(eye, M.v[f[0]])) > 0);
  /** @type {Map<number, { n: number, a: number[], b: number[], ca: number[], cb: number[] }>} */
  const edges = new Map();
  M.f.forEach((f, i) => {
    if (!front[i]) return;
    const col = colorOf(i);
    const cs = p.solid ? M.fn[i].map((n) => shade(col, n, lt)) : [col, col, col];
    tris.push({ a: M.v[f[0]], b: M.v[f[1]], c: M.v[f[2]], color: cs[0], ca: cs[0], cb: cs[1], cc: cs[2] });
    for (let e = 0; e < 3; e++) {
      const i0 = f[e], i1 = f[(e + 1) % 3], key = Math.min(i0, i1) * 4096 + Math.max(i0, i1);
      const was = edges.get(key);
      if (was) was.n++;
      else edges.set(key, { n: 1, a: M.v[i0], b: M.v[i1], ca: cs[e], cb: cs[(e + 1) % 3] });
    }
  });
  for (const e of edges.values()) if (e.n === 1) lines.push({ a: e.a, b: e.b, color: avg(e.ca, e.cb), w: FEATHER_PX, feather: 1 });
}

/**
 * @param {{ mode: 'move' | 'turn' | 'size', c: number[], axes: number[][], L: number, viewDir: number[], eye?: number[] }} g
 * @param {{ hot?: string | null, colors: Record<string, number[]>, sweep?: { handle: string, from: number[], axis: number[], deg: number } | null,
 *   snapDeg?: number, guide?: { axis: number[], from: number[], step: number } | null }} o
 */
export function gizmoDraw(g, { hot = null, colors, sweep = null, snapDeg = 0, guide = null }) {
  /** @type {{ a: number[], b: number[], color: number[], w: number, feather?: number, tube?: boolean }[]} */
  const lines = [];
  /** @type {{ a: number[], b: number[], c: number[], color: number[], ca?: number[], cb?: number[], cc?: number[] }[]} */
  const tris = [];
  const eye = g.eye ?? sub(g.c, mul(g.viewDir, g.L * 10)), lt = lightOf(g.viewDir);
  const parts = gizmoParts(g.mode, g.c, g.axes, g.L, g.viewDir);
  for (const p of parts) {
    if (p.hidden) continue;
    const col = p.handle === hot ? colors.hover : colors[p.handle];
    for (const [a, b] of p.segs) {
      let color = col;
      if (p.ring && p.handle !== 'view' && dot(sub(mul(add(a, b), 0.5), g.c), g.viewDir) > 0) color = [col[0], col[1], col[2], col[3] * GIZMO_DIM];
      lines.push({ a, b, color, w: p.w, tube: !!p.ring && p.handle !== 'view' });
    }
  }
  const depth = (p) => dot(sub(p.tris[0][0], eye), g.viewDir);
  const shapes = parts.filter((p) => !p.hidden && p.mesh).sort((p, q) => depth(q) - depth(p));
  for (const p of shapes) {
    const hotNow = p.handle === hot;
    const colorOf = (i) => {
      const col = hotNow ? colors.hover : p.tint ? colors[p.tint[i]] : colors[p.handle];
      return p.solid ? col : [col[0], col[1], col[2], col[3] * (p.handle === 'view' ? 0.35 : 0.6)];
    };
    meshDraw(p, colorOf, eye, lt, tris, lines);
  }
  const hotCol = colors.hover;
  const ring = sweep ? parts.find((p) => p.handle === sweep.handle && p.ring) : null;
  if (sweep && ring?.ring) {
    const R = ring.ring.R, n = sweep.axis, a = norm(sub(sweep.from, mul(n, dot(sweep.from, n))));
    const b = cross(n, a);
    const at = (deg, r) => { const q = (deg * Math.PI) / 180; return add(g.c, mul(add(mul(a, Math.cos(q)), mul(b, Math.sin(q))), r)); };
    const steps = Math.max(1, Math.ceil(Math.abs(sweep.deg) / 5));
    for (let k = 0; k < steps; k++) tris.push({ a: g.c, b: at((sweep.deg * k) / steps, R), c: at((sweep.deg * (k + 1)) / steps, R), color: [hotCol[0], hotCol[1], hotCol[2], 0.3] });
    lines.push({ a: g.c, b: at(0, R), color: hotCol, w: GIZMO_LINE_PX.edge }, { a: g.c, b: at(sweep.deg, R), color: hotCol, w: GIZMO_LINE_PX.edge });
    // the degree ruler: a tick at each snap step from where the drag began, longer every quarter turn
    if (snapDeg > 0) for (let deg = 0; deg < 360 - 1e-6; deg += snapDeg) lines.push({ a: at(deg, R * 1.05), b: at(deg, R * (deg % 90 === 0 ? 1.2 : 1.13)), color: hotCol, w: GIZMO_LINE_PX.tick });
  }
  if (guide) guideLines(g, guide, hotCol, lines);
  return { lines, tris, L: g.L };
}

function guideLines(g, { axis, from, step }, col, lines) {
  const G = g.L * 8, side = norm(cross(axis, g.viewDir));
  if (len(side) < 0.5) return;
  const faint = [col[0], col[1], col[2], 0.75];
  lines.push({ a: sub(from, mul(axis, G)), b: add(from, mul(axis, G)), color: faint, w: GIZMO_LINE_PX.guide });
  const s = step > 0 && (step / g.L) * POI_GIZMO_PX >= 6 ? step : 1;
  const n = Math.min(400, Math.floor(G / s));
  for (let k = -n; k <= n; k++) {
    const p = add(from, mul(axis, k * s)), h = g.L * (k % 4 === 0 ? 0.07 : 0.035);
    lines.push({ a: sub(p, mul(side, h)), b: add(p, mul(side, h)), color: faint, w: GIZMO_LINE_PX.ruler });
  }
}

export function viewForward(view, toward) {
  const f = norm([view[2], view[6], view[10]]);
  return dot(f, toward) < 0 ? mul(f, -1) : f;
}
