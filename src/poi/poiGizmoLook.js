// @ts-check
// Handle geometry and screen-space hit-testing for the in-game editor; poiGizmo.js and poiGizmoBox.js compute drags,
// and line and ring hit-tests match render/poiGizmoPass.js. Sizes are in arms (`L` m = `GIZMO_ARM_PX` CSS px), and `F`
// is CSS px per meter at 1 m. Boxes near the pivot are hidden; `gizmoParts` and `gizmoDraw` reuse their return objects.

import { END_ON, EDGE_ON, POI_GIZMO_PICK_PX } from './poiGizmo.js';

export const GIZMO_ARM_PX = 100;
export const GIZMO_LINE_PX = Object.freeze({ shaft: 3, sizeShaft: 2, ring: 8, view: 8, edge: 1.5, guide: 1.5, ruler: 1.5, text: 1.5 });
export const GIZMO_DIM = 0.4;
export const GIZMO_REACH = Object.freeze({ arrow: 0.62, box: 0.62, plane: [0.4, 0.56] });
export const GIZMO_GROW = Object.freeze({ move: 1.3, turn: 1.05, size: 1.2 });
export const GIZMO_GROW_HALF_LIFE = 0.07;
export const GIZMO_BOX_PX = 10;
export const FACE_MIN = 0.3;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a); return l > 0 ? mul(a, 1 / l) : [0, 0, 0]; };
const v3 = () => [0.5, 0.5, 0.5];
const AX = { x: 0, y: 1, z: 2 };
const AXIS_NAME = ['x', 'y', 'z'];
const PLANE = { xy: [0, 1, 2], yz: [1, 2, 0], xz: [0, 2, 1] };
const PLANES = ['xy', 'yz', 'xz'];
const MODE_ID = { move: 1, turn: 2, size: 3 };
const CONE_SIDES = 32, RING_CHORDS = 96, RULER_CHORDS = 100, DISC_SECTORS = 48;
const FEATHER_PX = 1.5;
const GRAY = [0.7, 0.7, 0.7], WHITE = [1, 1, 1];
const GROW_KEYS = Object.freeze(['x', 'y', 'z', 'xy', 'yz', 'xz', 'view', 'all', 'x+', 'x-', 'y+', 'y-', 'z+', 'z-',
  'corner0', 'corner1', 'corner2', 'corner3', 'corner4', 'corner5', 'corner6', 'corner7']);

/**
 * @typedef {{ key: string, handle: string, kind: string, hidden: boolean, w: number, segs: number[][][],
 *   mesh: GizmoMesh | null, tris: number[][][], solid: boolean, tint?: string[], ring?: { n: number[], R: number } }} GizmoPart
 */

const sinCos = (n) => { const s = new Float64Array(n + 1), c = new Float64Array(n + 1); for (let k = 0; k <= n; k++) { s[k] = Math.sin((k / n) * 2 * Math.PI); c[k] = Math.cos((k / n) * 2 * Math.PI); } return { s, c }; };
const CONE_SC = sinCos(CONE_SIDES), RING_SC = sinCos(RING_CHORDS), RULER_SC = sinCos(RULER_CHORDS), DISC_SC = sinCos(DISC_SECTORS);

/** @typedef {{ v: number[][], f: number[][], edges: number[][] }} GizmoMesh */
function meshOf(nv, faces) {
  const v = [];
  for (let i = 0; i < nv; i++) v.push(v3());
  const f = faces.map((q) => q.slice()), edges = [], seen = new Map();
  f.forEach((q, i) => {
    for (let e = 0; e < 3; e++) {
      const i0 = q[e], i1 = q[(e + 1) % 3], key = Math.min(i0, i1) * 4096 + Math.max(i0, i1), was = seen.get(key);
      if (was) was[3] = i; else { const edge = [i0, i1, i, -1]; seen.set(key, edge); edges.push(edge); }
    }
  });
  return { v, f, edges };
}
const CONE_FACES = (() => {
  const f = [];
  for (let k = 0; k < CONE_SIDES; k++) f.push([k, (k + 1) % CONE_SIDES, CONE_SIDES], [CONE_SIDES + 1, (k + 1) % CONE_SIDES, k]);
  return f;
})();
const BOX_FACES = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]].flatMap(([a, b, e, d]) => [[a, b, e], [a, e, d]]);
const QUAD_FACES = [[0, 1, 2], [0, 2, 3]];

/** @returns {GizmoPart} */
function part(key, handle, kind, w, nSegs, mesh, solid, more = {}) {
  const segs = [];
  for (let i = 0; i < nSegs; i++) segs.push([v3(), v3()]);
  const tris = mesh ? mesh.f.map((q) => [mesh.v[q[0]], mesh.v[q[1]], mesh.v[q[2]]]) : [];
  return { key, handle, kind, hidden: false, w, segs, mesh, tris, solid, ...more };
}
function ringPart(key) {
  const pts = [];
  for (let k = 0; k < RING_CHORDS; k++) pts.push(v3());
  const p = part(key, key, 'ring', GIZMO_LINE_PX.ring, 0, null, false, { ring: { n: v3(), R: 0 } });
  for (let k = 0; k < RING_CHORDS; k++) p.segs.push([pts[k], pts[(k + 1) % RING_CHORDS]]);
  return p;
}

/** @type {Record<string, GizmoPart[]>} */
const SETS = {};
function setOf(name) {
  if (SETS[name]) return SETS[name];
  const W = GIZMO_LINE_PX, out = [];
  if (name === 'move') {
    for (const h of AXIS_NAME) for (let s = 0; s < 2; s++) out.push(part(h, h, 'arrow', W.shaft, 1, meshOf(CONE_SIDES + 2, CONE_FACES), true));
    for (const h of PLANES) out.push(part(h, h, 'plane', W.edge, 0, meshOf(4, QUAD_FACES), false, { tint: [AXIS_NAME[PLANE[h][0]], AXIS_NAME[PLANE[h][1]]] }));
    const view = part('view', 'view', 'view', W.edge, 0, meshOf(4, QUAD_FACES), false), sq = view.mesh?.v ?? [];
    view.segs.push([sq[0], sq[1]], [sq[1], sq[2]], [sq[2], sq[3]], [sq[3], sq[0]]);
    out.push(view);
  } else if (name === 'size-box') {
    for (const h of AXIS_NAME) for (const sg of ['+', '-']) out.push(part(`${h}${sg}`, h, 'face', W.edge, 0, meshOf(8, BOX_FACES), true));
    for (let n = 0; n < 8; n++) out.push(part(`corner${n}`, 'corner', 'corner', W.edge, 0, meshOf(8, BOX_FACES), true));
  } else if (name === 'size-arm') {
    for (const h of AXIS_NAME) for (let s = 0; s < 2; s++) out.push(part(h, h, 'box', W.sizeShaft, 1, meshOf(8, BOX_FACES), true));
    out.push(part('all', 'all', 'all', W.edge, 0, meshOf(8, BOX_FACES), true));
  } else {
    // Push the outer ring before the axis rings so axis rings draw over it where they overlap.
    const view = ringPart('view');
    view.w = W.view;
    out.push(view);
    for (const h of AXIS_NAME) out.push(ringPart(h));
  }
  SETS[name] = out;
  return out;
}

function outward(M, ctr) {
  const V = M.v, F = M.f;
  for (let i = 0; i < F.length; i++) {
    const f = F[i], a = V[f[0]], b = V[f[1]], c = V[f[2]];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const mx = (a[0] + b[0] + c[0]) / 3 - ctr[0], my = (a[1] + b[1] + c[1]) / 3 - ctr[1], mz = (a[2] + b[2] + c[2]) / 3 - ctr[2];
    if (nx * mx + ny * my + nz * mz < 0) { const t = f[0]; f[0] = f[2]; f[2] = t; }
  }
}
function retri(p) {
  const M = p.mesh;
  if (!M) return;
  for (let i = 0; i < M.f.length; i++) { const t = p.tris[i], f = M.f[i]; t[0] = M.v[f[0]]; t[1] = M.v[f[1]]; t[2] = M.v[f[2]]; }
}
// Float arguments to internal helpers go through `ARG` so non-inlined calls do not box numbers every frame.
const ARG = new Float64Array(4), GROW = new Float64Array(GROW_KEYS.length);
const GI = Object.freeze(Object.fromEntries(GROW_KEYS.map((k, i) => [k, i])));
const S_BASE = v3(), S_R = v3(), S_U = v3(), S_N = v3(), S_EYE = v3(), LO = new Float64Array(3), HI = new Float64Array(3);

function basisInto(r, u, n) {
  if (Math.abs(n[1]) < 0.99) { r[0] = -n[2]; r[1] = 0; r[2] = n[0]; } else { r[0] = 0; r[1] = n[2]; r[2] = -n[1]; }
  const l = Math.sqrt(r[0] * r[0] + r[1] * r[1] + r[2] * r[2]);
  if (l > 0) { r[0] /= l; r[1] /= l; r[2] /= l; }
  u[0] = n[1] * r[2] - n[2] * r[1]; u[1] = n[2] * r[0] - n[0] * r[2]; u[2] = n[0] * r[1] - n[1] * r[0];
}
function fillCone(p, c, a, u, v) {
  const V = p.mesh.v, B = S_BASE, b0 = ARG[0], hgt = ARG[1], r = ARG[2];
  B[0] = c[0] + a[0] * b0; B[1] = c[1] + a[1] * b0; B[2] = c[2] + a[2] * b0;
  for (let k = 0; k < CONE_SIDES; k++) {
    const cs = CONE_SC.c[k] * r, sn = CONE_SC.s[k] * r, q = V[k];
    q[0] = B[0] + u[0] * cs + v[0] * sn; q[1] = B[1] + u[1] * cs + v[1] * sn; q[2] = B[2] + u[2] * cs + v[2] * sn;
  }
  const T = V[CONE_SIDES], C = V[CONE_SIDES + 1];
  T[0] = B[0] + a[0] * hgt; T[1] = B[1] + a[1] * hgt; T[2] = B[2] + a[2] * hgt;
  C[0] = B[0]; C[1] = B[1]; C[2] = B[2];
  B[0] += a[0] * hgt / 3; B[1] += a[1] * hgt / 3; B[2] += a[2] * hgt / 3;
  outward(p.mesh, B);
  retri(p);
}
function fillBox(p, ctr, axes) {
  const k = ARG[0], V = p.mesh.v, a0 = axes[0], a1 = axes[1], a2 = axes[2];
  for (let i = 0; i < 8; i++) {
    const s0 = i & 1 ? k : -k, s1 = i & 2 ? k : -k, s2 = i & 4 ? k : -k, q = V[i];
    q[0] = ctr[0] + a0[0] * s0 + a1[0] * s1 + a2[0] * s2;
    q[1] = ctr[1] + a0[1] * s0 + a1[1] * s1 + a2[1] * s2;
    q[2] = ctr[2] + a0[2] * s0 + a1[2] * s1 + a2[2] * s2;
  }
  outward(p.mesh, ctr);
  retri(p);
}
function fillRing(p, c, n) {
  const R = ARG[0];
  basisInto(S_R, S_U, n);
  for (let k = 0; k < RING_CHORDS; k++) {
    const cs = RING_SC.c[k] * R, sn = RING_SC.s[k] * R, q = p.segs[k][0];
    q[0] = c[0] + S_R[0] * cs + S_U[0] * sn; q[1] = c[1] + S_R[1] * cs + S_U[1] * sn; q[2] = c[2] + S_R[2] * cs + S_U[2] * sn;
  }
  const rn = /** @type {{ n: number[], R: number }} */ (p.ring);
  rn.n[0] = n[0]; rn.n[1] = n[1]; rn.n[2] = n[2]; rn.R = R;
}
function fillMove(set, q) {
  const c = q.c, axes = q.axes, L = q.L, viewDir = q.viewDir, R = GIZMO_REACH;
  let n = 0;
  for (let i = 0; i < 3; i++) {
    const a = axes[i], u = axes[(i + 1) % 3], v = axes[(i + 2) % 3], g = GROW[i];
    const hidden = Math.abs(a[0] * viewDir[0] + a[1] * viewDir[1] + a[2] * viewDir[2]) > END_ON;
    for (let s = 0; s < 2; s++) {
      const sgn = s ? -1 : 1, p = set[n++], A = p.segs[0][0], B = p.segs[0][1];
      p.hidden = hidden;
      for (let j = 0; j < 3; j++) { A[j] = c[j] + a[j] * sgn * 0.14 * L; B[j] = c[j] + a[j] * sgn * 0.46 * L; }
      ARG[0] = sgn * 0.45 * L; ARG[1] = sgn * (R.arrow - 0.45) * L * g; ARG[2] = L * 0.055 * g;
      fillCone(p, c, a, u, v);
    }
  }
  const p0 = R.plane[0], p1 = R.plane[1];
  for (let h = 0; h < 3; h++) {
    const pl = PLANE[PLANES[h]], ai = axes[pl[0]], aj = axes[pl[1]], ak = axes[pl[2]], p = set[n++], V = p.mesh?.v ?? [];
    const su = ai[0] * viewDir[0] + ai[1] * viewDir[1] + ai[2] * viewDir[2] > 0 ? -L : L;
    const sv = aj[0] * viewDir[0] + aj[1] * viewDir[1] + aj[2] * viewDir[2] > 0 ? -L : L;
    const m = (p0 + p1) / 2, e = ((p1 - p0) / 2) * GROW[3 + h];
    for (let q = 0; q < 4; q++) {
      const s = q === 1 || q === 2 ? 1 : -1, t = q >= 2 ? 1 : -1, x = (m + s * e) * su, y = (m + t * e) * sv, P = V[q];
      P[0] = c[0] + ai[0] * x + aj[0] * y; P[1] = c[1] + ai[1] * x + aj[1] * y; P[2] = c[2] + ai[2] * x + aj[2] * y;
    }
    p.hidden = Math.abs(ak[0] * viewDir[0] + ak[1] * viewDir[1] + ak[2] * viewDir[2]) < EDGE_ON;
  }
  const p = set[n], V = p.mesh?.v ?? [], k = L * 0.05 * GROW[GI.view];
  basisInto(S_R, S_U, viewDir);
  for (let q = 0; q < 4; q++) {
    const s = (q === 1 || q === 2 ? 1 : -1) * k, t = (q >= 2 ? 1 : -1) * k, P = V[q];
    P[0] = c[0] + S_R[0] * s + S_U[0] * t; P[1] = c[1] + S_R[1] * s + S_U[1] * t; P[2] = c[2] + S_R[2] * s + S_U[2] * t;
  }
}
function fillSizeBox(set, q) {
  const c = q.c, axes = q.axes, L = q.L, viewDir = q.viewDir, bx = q.box, eye = q.eye ?? null, F = FACE_MIN * L;
  for (let i = 0; i < 3; i++) {
    const lo = bx.lo[i], hi = bx.hi[i], thin = Math.abs(lo) < F && Math.abs(hi) < F;
    LO[i] = thin ? -F : lo; HI[i] = thin ? F : hi;
  }
  const dc = eye ? Math.max(1e-6, (c[0] - eye[0]) * viewDir[0] + (c[1] - eye[1]) * viewDir[1] + (c[2] - eye[2]) * viewDir[2]) : 1;
  const half = (GIZMO_BOX_PX / 2) * (L / GIZMO_ARM_PX), at = S_BASE;
  for (let n = 0; n < 14; n++) {
    const p = set[n], face = n < 6, i = face ? n >> 1 : -1, sgn = face && n & 1 ? -1 : 1;
    let along = 0;
    for (let j = 0; j < 3; j++) {
      const s = face ? (j === i ? (sgn > 0 ? HI[j] : LO[j]) : (LO[j] + HI[j]) / 2) : (n - 6) & (1 << j) ? HI[j] : LO[j];
      if (j === 0) { at[0] = c[0]; at[1] = c[1]; at[2] = c[2]; }
      at[0] += axes[j][0] * s; at[1] += axes[j][1] * s; at[2] += axes[j][2] * s;
      if (j === i) along = s;
    }
    const ai = face ? axes[i] : null, wx = at[0] - c[0], wy = at[1] - c[1], wz = at[2] - c[2];
    const wv = wx * viewDir[0] + wy * viewDir[1] + wz * viewDir[2], rx = wx - viewDir[0] * wv, ry = wy - viewDir[1] * wv, rz = wz - viewDir[2] * wv;
    const zt = eye ? (at[0] - eye[0]) * viewDir[0] + (at[1] - eye[1]) * viewDir[1] + (at[2] - eye[2]) * viewDir[2] : dc, depth = eye ? Math.max(1e-6, zt) / dc : 1;
    p.hidden = ai ? Math.abs(ai[0] * viewDir[0] + ai[1] * viewDir[1] + ai[2] * viewDir[2]) > END_ON || Math.abs(along) < F : zt <= 1e-6 || rx * rx + ry * ry + rz * rz < F * F * depth * depth;
    ARG[0] = half * depth * GROW[GI[p.key]];
    fillBox(p, at, axes);
  }
}
function fillSizeArm(set, q) {
  const c = q.c, axes = q.axes, L = q.L, viewDir = q.viewDir, R = GIZMO_REACH, at = S_BASE;
  let n = 0;
  for (let i = 0; i < 3; i++) {
    const a = axes[i], hidden = Math.abs(a[0] * viewDir[0] + a[1] * viewDir[1] + a[2] * viewDir[2]) > END_ON, g = GROW[i];
    for (let s = 0; s < 2; s++) {
      const sgn = s ? -1 : 1, p = set[n++], A = p.segs[0][0], B = p.segs[0][1];
      p.hidden = hidden;
      for (let j = 0; j < 3; j++) { A[j] = c[j] + a[j] * sgn * 0.09 * L; B[j] = c[j] + a[j] * sgn * (R.box - 0.045) * L; at[j] = c[j] + a[j] * sgn * R.box * L; }
      ARG[0] = L * 0.045 * g;
      fillBox(p, at, axes);
    }
  }
  ARG[0] = L * 0.05 * GROW[GI.all];
  fillBox(set[n], c, axes);
}
function fillTurn(set, q) {
  const c = q.c, axes = q.axes, L = q.L, viewDir = q.viewDir;
  for (let i = 0; i < 3; i++) {
    const g = GROW[i], p = set[i + 1];
    ARG[0] = L * g;
    fillRing(p, c, axes[i]);
    p.w = GIZMO_LINE_PX.ring * g;
  }
  const g = GROW[GI.view], p = set[0], l = Math.sqrt(viewDir[0] * viewDir[0] + viewDir[1] * viewDir[1] + viewDir[2] * viewDir[2]) || 1;
  S_N[0] = -viewDir[0] / l; S_N[1] = -viewDir[1] / l; S_N[2] = -viewDir[2] / l;
  ARG[0] = L * (1 + GIZMO_LINE_PX.view / 2 / GIZMO_ARM_PX) * g;
  fillRing(p, c, S_N);
  p.w = GIZMO_LINE_PX.view * g;
}

const KEY_N = 2 + 3 + 9 + 3 + 7 + 4 + GROW_KEYS.length;
let keyLast = new Float64Array(KEY_N), keyNow = new Float64Array(KEY_N);
keyLast[0] = -1;
function keyChanged(q) {
  const K = keyNow, mode = q.mode, c = q.c, axes = q.axes, viewDir = q.viewDir, grow = q.grow ?? null, bx = q.box ?? null, eye = q.eye ?? null;
  let n = 0;
  K[n++] = MODE_ID[mode] * 2 + (bx ? 1 : 0); K[n++] = q.L;
  for (let j = 0; j < 3; j++) K[n++] = c[j];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) K[n++] = axes[i][j];
  for (let j = 0; j < 3; j++) K[n++] = viewDir[j];
  K[n++] = bx ? 1 : 0;
  for (let j = 0; j < 3; j++) { K[n++] = bx ? bx.lo[j] : 0; }
  for (let j = 0; j < 3; j++) { K[n++] = bx ? bx.hi[j] : 0; }
  const useEye = !!(bx && eye && mode === 'size');
  K[n++] = useEye ? 1 : 0;
  for (let j = 0; j < 3; j++) K[n++] = useEye && eye ? eye[j] : 0;
  for (let i = 0; i < GROW_KEYS.length; i++) { const v = grow ? grow[GROW_KEYS[i]] : undefined; K[n++] = v === undefined ? 1 : v; }
  let same = true;
  for (let i = 0; i < KEY_N; i++) if (K[i] !== keyLast[i]) { same = false; break; }
  if (same) return false;
  for (let i = 0; i < GROW_KEYS.length; i++) GROW[i] = K[KEY_N - GROW_KEYS.length + i];
  keyNow = keyLast; keyLast = K;
  return true;
}
/** @type {GizmoPart[]} */
let partsLast = [];
let partsVersion = 0;

/**
 * @param {'move' | 'turn' | 'size'} mode @param {number[]} c @param {number[][]} axes @param {number} L
 * @param {number[]} viewDir @param {{ grow?: Record<string, number> | null, box?: { lo: number[], hi: number[] } | null, eye?: number[] | null }} [opts] @returns {GizmoPart[]}
 */
export function gizmoParts(mode, c, axes, L, viewDir, opts) {
  return partsOf({ mode, c, axes, L, viewDir, grow: opts?.grow ?? null, box: opts?.box ?? null, eye: opts?.eye ?? null });
}
function partsOf(q) {
  if (!keyChanged(q)) return partsLast;
  /** @type {GizmoPart[]} */
  let set;
  if (q.mode === 'move') fillMove(set = setOf('move'), q);
  else if (q.mode === 'size' && q.box) fillSizeBox(set = setOf('size-box'), q);
  else if (q.mode === 'size') fillSizeArm(set = setOf('size-arm'), q);
  else fillTurn(set = setOf('turn'), q);
  partsLast = set;
  partsVersion++;
  return set;
}

export function createGizmoEase() {
  /** @type {Record<string, number>} */
  const grow = {};
  for (const k of GROW_KEYS) grow[k] = 1;
  let at = -1;
  return {
    grow,
    /** @param {string} mode @param {string | null} hot @param {number} now seconds */
    step(mode, hot, now) {
      const dt = at < 0 ? 0 : Math.min(0.25, Math.max(0, now - at));
      at = now;
      const k = 1 - Math.pow(0.5, dt / GIZMO_GROW_HALF_LIFE), top = GIZMO_GROW[mode] ?? 1;
      for (let i = 0; i < GROW_KEYS.length; i++) {
        const h = GROW_KEYS[i], want = h === hot ? top : 1;
        let g = grow[h] + (want - grow[h]) * k;
        if (Math.abs(g - want) < 1e-4) g = want;
        grow[h] = g;
      }
      return grow;
    },
  };
}

export function rayTriangle(o, d, t) {
  const a = t[0], b = t[1], c = t[2];
  const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2], e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
  const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x, det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return null;
  const sx = o[0] - a[0], sy = o[1] - a[1], sz = o[2] - a[2], u = (sx * px + sy * py + sz * pz) / det;
  if (u < 0 || u > 1) return null;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, v = (d[0] * qx + d[1] * qy + d[2] * qz) / det;
  if (v < 0 || u + v > 1) return null;
  const k = (e2x * qx + e2y * qy + e2z * qz) / det;
  return k >= 0 ? k : null;
}

function onScreen(p, eye, fwd, F) {
  const q = sub(p, eye), z = dot(q, fwd);
  return z > 1e-6 ? mul(sub(mul(q, 1 / z), fwd), F) : null;
}
function onScreenInto(p, eye, fwd, F, out) {
  const qx = p[0] - eye[0], qy = p[1] - eye[1], qz = p[2] - eye[2], z = qx * fwd[0] + qy * fwd[1] + qz * fwd[2];
  if (!(z > 1e-6)) return false;
  const iz = 1 / z;
  out[0] = (qx * iz - fwd[0]) * F; out[1] = (qy * iz - fwd[1]) * F; out[2] = (qz * iz - fwd[2]) * F;
  return true;
}
export function rayLine(o, d, a, b, w, eye, fwd, F) {
  const m = lineMeasure(o, d, a, b, w, eye, fwd, F);
  return m && m.out === 0 ? m.t : null;
}
// lineMeasure mutates and returns the shared MEASURE object; read its fields before calling lineMeasure again.
const MEASURE = { out: 0, center: 0, t: 0 }, L_A = v3(), L_B = v3(), L_P = v3(), L_N = v3(), QUAD = new Float64Array(10);
const QUAD_SIDE = [-1, 1, 1, -1], QUAD_FAR = [0, 0, 1, 1], Q_R = v3(), Q_U = v3();
const flatX = (v) => v[0] * Q_R[0] + v[1] * Q_R[1] + v[2] * Q_R[2], flatY = (v) => v[0] * Q_U[0] + v[1] * Q_U[1] + v[2] * Q_U[2];
function lineMeasure(o, d, a, b, w, eye, fwd, F, pa = null, nb = null, scIn = undefined) {
  const sc = scIn === undefined ? onScreen(add(o, d), eye, fwd, F) : scIn, sa = L_A, sb = L_B;
  if (!onScreenInto(a, eye, fwd, F, sa) || !onScreenInto(b, eye, fwd, F, sb) || !sc || dot(d, fwd) <= 1e-9) return null;
  const ux = sb[0] - sa[0], uy = sb[1] - sa[1], uz = sb[2] - sa[2], l = Math.hypot(ux, uy, uz);
  const qx = sc[0] - sa[0], qy = sc[1] - sa[1], qz = sc[2] - sa[2], h = w / 2;
  const along = l > 1e-9 ? (qx * ux + qy * uy + qz * uz) / l : 0;
  let across;
  if (l > 1e-9) { const f = along / l; across = Math.hypot(qx - ux * f, qy - uy * f, qz - uz * f); } else across = Math.hypot(qx, qy, qz);
  const dx = Math.max(0, -h - along, along - l - h), dy = Math.max(0, across - h);
  const k = l > 1e-9 ? Math.min(1, Math.max(0, along / l)) : 0;
  let out;
  if (pa && nb && l > 1e-9) {
    const f0 = fwd[0], f1 = fwd[1], f2 = fwd[2], side = Math.abs(f1) < 0.99;
    const cx = side ? f1 * 0 - f2 * 1 : f1 * 0 - f2 * 0, cy = side ? f2 * 0 - f0 * 0 : f2 * 1 - f0 * 0, cz = side ? f0 * 1 - f1 * 0 : f0 * 0 - f1 * 1;
    const cl = Math.hypot(cx, cy, cz), ci = cl > 0 ? 1 / cl : 0, rx = cl > 0 ? cx * ci : 0, ry = cl > 0 ? cy * ci : 0, rz = cl > 0 ? cz * ci : 0;
    Q_R[0] = rx; Q_R[1] = ry; Q_R[2] = rz; Q_U[0] = ry * f2 - rz * f1; Q_U[1] = rz * f0 - rx * f2; Q_U[2] = rx * f1 - ry * f0;
    const Q = QUAD, hasP = onScreenInto(pa, eye, fwd, F, L_P), hasN = onScreenInto(nb, eye, fwd, F, L_N), fx = flatX, fy = flatY;
    const ax = fx(sa), ay = fy(sa), bx = fx(sb), by = fy(sb), px = hasP ? fx(L_P) : 0, py = hasP ? fy(L_P) : 0, nx2 = hasN ? fx(L_N) : 0, ny2 = hasN ? fy(L_N) : 0;
    const ex = bx - ax, ey = by - ay, L = Math.hypot(ex, ey, 0), iL = 1 / L, ddx = ex * iL, ddy = ey * iL, nx = -ddy, ny = ddx;
    for (let c = 0; c < 4; c++) {
      const sd = QUAD_SIDE[c], far = QUAD_FAR[c], fs = far ? 1 : -1;
      let ox = (nx * sd + ddx * fs) * h, oy = (ny * sd + ddy * fs) * h;
      if (far ? hasN : hasP) {
        const dnx = far ? nx2 - bx : ax - px, dny = far ? ny2 - by : ay - py, ln = Math.hypot(dnx, dny, 0);
        if (ln > 1e-4) {
          const il = 1 / ln, ttx = ddx + dnx * il, tty = ddy + dny * il, tl = Math.hypot(ttx, tty, 0);
          if (tl * tl > 1e-6) { const it = 1 / tl, mx = -(tty * it), my = ttx * it, m = (sd * h) / Math.max(mx * nx + my * ny + 0 * 0, 0.25); ox = mx * m; oy = my * m; }
        }
      }
      Q[2 * c] = (far ? bx : ax) + ox; Q[2 * c + 1] = (far ? by : ay) + oy;
    }
    Q[8] = fx(sc); Q[9] = fy(sc);
    out = outOfQuad(Q);
  } else out = Math.hypot(dx, dy);
  const l2 = ux * ux + uy * uy + uz * uz, kc = l2 > 1e-18 ? Math.min(1, Math.max(0, ((sc[0] - sa[0]) * ux + (sc[1] - sa[1]) * uy + (sc[2] - sa[2]) * uz) / l2)) : 0;
  MEASURE.out = out;
  MEASURE.center = Math.hypot(sc[0] - (sa[0] + ux * kc), sc[1] - (sa[1] + uy * kc), sc[2] - (sa[2] + uz * kc));
  MEASURE.t = Math.max(0, (a[0] + (b[0] - a[0]) * k - o[0]) * d[0] + (a[1] + (b[1] - a[1]) * k - o[1]) * d[1] + (a[2] + (b[2] - a[2]) * k - o[2]) * d[2]);
  return MEASURE;
}
function outOfQuad(Q) {
  const sx = Q[8], sy = Q[9];
  let inside = true, sign = 0, best = Infinity;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, ax = Q[2 * i], ay = Q[2 * i + 1], bx = Q[2 * j], by = Q[2 * j + 1], c = (bx - ax) * (sy - ay) - (by - ay) * (sx - ax);
    if (Math.abs(c) > 1e-12) { const sg = Math.sign(c); if (sign && sg !== sign) inside = false; sign = sign || sg; }
    const ux = bx - ax, uy = by - ay, l2 = ux * ux + uy * uy + 0 * 0, k = l2 > 1e-18 ? Math.min(1, Math.max(0, ((sx - ax) * ux + (sy - ay) * uy + 0 * 0) / l2)) : 0;
    best = Math.min(best, Math.hypot(sx - (ax + ux * k), sy - (ay + uy * k), 0 - (0 + 0 * k)));
  }
  return inside ? 0 : Math.max(best, 1e-9);
}

const TRI_PX = [v3(), v3(), v3()];
/** @param {GizmoPart} p */
export function grabOf(p, o, d, eye, fwd, F, tol = POI_GIZMO_PICK_PX) {
  let gap = Infinity, t = Infinity, reach = false;
  const sc = onScreen(add(o, d), eye, fwd, F);
  for (const tri of p.tris) {
    const k = rayTriangle(o, d, tri);
    if (k !== null) { if (gap > 0 || k < t) t = k; gap = 0; reach = true; continue; }
    if (gap === 0) continue;
    if (!sc || !onScreenInto(tri[0], eye, fwd, F, TRI_PX[0]) || !onScreenInto(tri[1], eye, fwd, F, TRI_PX[1]) || !onScreenInto(tri[2], eye, fwd, F, TRI_PX[2])) continue;
    for (let e = 0; e < 3; e++) {
      const A = TRI_PX[e], B = TRI_PX[(e + 1) % 3];
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], l2 = ux * ux + uy * uy + uz * uz;
      const k = l2 > 1e-18 ? Math.min(1, Math.max(0, ((sc[0] - A[0]) * ux + (sc[1] - A[1]) * uy + (sc[2] - A[2]) * uz) / l2)) : 0;
      const dist = Math.hypot(sc[0] - (A[0] + ux * k), sc[1] - (A[1] + uy * k), sc[2] - (A[2] + uz * k));
      if (dist <= tol && dist < gap) { gap = dist; t = Math.max(0, dot(sub(add(tri[e], mul(sub(tri[(e + 1) % 3], tri[e]), k)), o), d)); reach = true; }
    }
  }
  const n = p.segs.length;
  for (let i = 0; i < n; i++) {
    const [a, b] = p.segs[i];
    const m = p.ring ? lineMeasure(o, d, a, b, p.w, eye, fwd, F, p.segs[(i + n - 1) % n][0], p.segs[(i + 1) % n][1], sc) : lineMeasure(o, d, a, b, p.w, eye, fwd, F, null, null, sc);
    if (!m || (m.out > 0 && m.center > tol)) continue;
    reach = true;
    if (m.out < gap || (m.out === gap && m.t < t)) { gap = m.out; t = m.t; }
  }
  return reach ? { drawn: gap === 0, gap, t } : null;
}

/**
 * @param {{ mode: 'move' | 'turn' | 'size', c: number[], axes: number[][], L: number, viewDir: number[], pxWorld: number,
 *   eye?: number[], fwd?: number[], F?: number, grow?: Record<string, number> | null, box?: { lo: number[], hi: number[] } | null }} g
 * @param {number[]} o @param {number[]} d
 */
export function pickGizmo(g, o, d) {
  const eye = g.eye ?? o, fwd = g.fwd ?? g.viewDir;
  const F = g.F ?? dot(sub(g.c, eye), fwd) / Math.max(1e-12, g.pxWorld);
  let best = null, bestScore = Infinity, bestT = Infinity;
  for (const p of partsOf(g)) {
    if (p.hidden) continue;
    const m = grabOf(p, o, d, eye, fwd, F);
    if (!m) continue;
    const facing = p.handle === 'view' || p.handle === 'all';
    const score = m.gap + (facing && !m.drawn ? POI_GIZMO_PICK_PX / 4 : facing && p.ring ? 1e-6 : 0);
    if (score < bestScore || (score === bestScore && m.t < bestT)) { best = p.key; bestScore = score; bestT = m.t; }
  }
  return best;
}

/**
 * @typedef {{ a: number[], b: number[], color: number[], w: number, feather: number, prev: number[] | null,
 *   next: number[] | null, pa: number[], nb: number[] }} GizmoLine
 * @typedef {{ a: number[], b: number[], c: number[], color: number[] }} GizmoTri
 */
const LINE_POOL = /** @type {GizmoLine[]} */ ([]), TRI_POOL = /** @type {GizmoTri[]} */ ([]);
const DRAW = { lines: /** @type {GizmoLine[]} */ ([]), tris: /** @type {GizmoTri[]} */ ([]), L: 0 };
let nLines = 0, nTris = 0;
function lineOf(a, b, col) {
  let r = LINE_POOL[nLines];
  if (!r) { r = { a: v3(), b: v3(), color: [0.5, 0.5, 0.5, 0.5], w: 1.5, feather: 0.5, prev: null, next: null, pa: v3(), nb: v3() }; LINE_POOL.push(r); }
  DRAW.lines[nLines++] = r;
  const A = r.a, B = r.b, C = r.color;
  A[0] = a[0]; A[1] = a[1]; A[2] = a[2]; B[0] = b[0]; B[1] = b[1]; B[2] = b[2];
  C[0] = col[0]; C[1] = col[1]; C[2] = col[2];
  r.prev = null; r.next = null;
  return r;
}
function triOf(a, b, c, col) {
  let r = TRI_POOL[nTris];
  if (!r) { r = { a: v3(), b: v3(), c: v3(), color: [0.5, 0.5, 0.5, 0.5] }; TRI_POOL.push(r); }
  DRAW.tris[nTris++] = r;
  const A = r.a, B = r.b, K = r.c, C = r.color;
  A[0] = a[0]; A[1] = a[1]; A[2] = a[2]; B[0] = b[0]; B[1] = b[1]; B[2] = b[2]; K[0] = c[0]; K[1] = c[1]; K[2] = c[2];
  C[0] = col[0]; C[1] = col[1]; C[2] = col[2];
  return r;
}

function partColor(out, p, colors, on, face) {
  const k = p.kind;
  if (k === 'arrow' || k === 'plane' || k === 'face' || k === 'box') {
    const c = colors[k === 'plane' && p.tint ? p.tint[face] : p.handle] ?? WHITE, dim = k === 'arrow' && !on ? 0.8 : 1;
    out[0] = c[0] * dim; out[1] = c[1] * dim; out[2] = c[2] * dim;
    out[3] = on ? 1 : k === 'arrow' || k === 'plane' ? 0.6 : 0.4;
  } else if (k === 'view') { const v = on ? 1 : 0.92; out[0] = v; out[1] = v; out[2] = v; out[3] = on ? 1 : 0.6; }
  else { const v = on ? 1 : GRAY[0]; out[0] = v; out[1] = v; out[2] = v; out[3] = on ? 1 : 0.6; }
}
const COL = [0.5, 0.5, 0.5, 0.5], COL2 = [0.5, 0.5, 0.5, 0.5];
let FRONT = new Uint8Array(64);

function meshDraw(p, colors, on, eye) {
  const M = /** @type {GizmoMesh} */ (p.mesh), V = M.v, Fc = M.f;
  if (FRONT.length < Fc.length) FRONT = new Uint8Array(Fc.length * 2);
  for (let i = 0; i < Fc.length; i++) {
    const f = Fc[i], a = V[f[0]], b = V[f[1]], c = V[f[2]];
    let front = 1;
    if (p.solid) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
      front = (uy * wz - uz * wy) * (eye[0] - a[0]) + (uz * wx - ux * wz) * (eye[1] - a[1]) + (ux * wy - uy * wx) * (eye[2] - a[2]) > 0 ? 1 : 0;
    }
    FRONT[i] = front;
    if (!front) continue;
    partColor(COL, p, colors, on, i);
    triOf(a, b, c, COL).color[3] = COL[3];
  }
  for (const e of M.edges) {
    const f0 = FRONT[e[2]], f1 = e[3] >= 0 ? FRONT[e[3]] : 0;
    if (f0 + f1 !== 1) continue;
    partColor(COL, p, colors, on, f0 ? e[2] : e[3]);
    const r = lineOf(V[e[0]], V[e[1]], COL);
    r.color[3] = COL[3]; r.w = FEATHER_PX; r.feather = 1;
  }
}

const SEGMENT = { a: [[0, 6], [4, 6]], b: [[4, 6], [4, 3]], c: [[4, 3], [4, 0]], d: [[0, 0], [4, 0]], e: [[0, 0], [0, 3]], f: [[0, 3], [0, 6]], g: [[0, 3], [4, 3]] };
const GLYPH = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'].map((s) => [...s].map((k) => SEGMENT[k]));
const MINUS = [SEGMENT.g];
const DEGREE = [[[0, 4.5], [1.5, 4.5]], [[1.5, 4.5], [1.5, 6]], [[1.5, 6], [0, 6]], [[0, 6], [0, 4.5]]];
const DIGITS = new Int8Array(12);
function digitsOf(n) {
  let m = Math.abs(n), k = 0;
  do { DIGITS[k++] = m % 10; m = Math.floor(m / 10); } while (m > 0 && k < 11);
  for (let i = 0; i < k >> 1; i++) { const t = DIGITS[i]; DIGITS[i] = DIGITS[k - 1 - i]; DIGITS[k - 1 - i] = t; }
  return k;
}
const S_RIGHT = v3(), S_UP = v3(), S_P = v3(), S_Q = v3();
/** Uses `Y × viewDir` for screen right (`basisInto` uses the opposite sign and would flip text). */
function screenInto(viewDir) {
  const v = viewDir, r = S_RIGHT;
  if (Math.abs(v[1]) < 0.99) { r[0] = v[2]; r[1] = 0; r[2] = -v[0]; } else { r[0] = -v[1]; r[1] = v[0]; r[2] = 0; }
  let l = Math.sqrt(r[0] * r[0] + r[1] * r[1] + r[2] * r[2]) || 1;
  r[0] /= l; r[1] /= l; r[2] /= l;
  const u = S_UP;
  u[0] = v[1] * r[2] - v[2] * r[1]; u[1] = v[2] * r[0] - v[0] * r[2]; u[2] = v[0] * r[1] - v[1] * r[0];
  l = Math.sqrt(u[0] * u[0] + u[1] * u[1] + u[2] * u[2]) || 1;
  u[0] /= l; u[1] /= l; u[2] /= l;
}
const SHADOW = [0, 0, 0], TEXT = [1, 1, 1];
function glyphLines(segs, at, shadow) {
  const R = S_RIGHT, U = S_UP, x = ARG[2], u = ARG[3];
  for (let s = 0; s < segs.length; s++) {
    const g = segs[s], x0 = (x + g[0][0]) * u, y0 = (g[0][1] - 3) * u, x1 = (x + g[1][0]) * u, y1 = (g[1][1] - 3) * u;
    for (let j = 0; j < 3; j++) { S_P[j] = at[j] + R[j] * x0 + U[j] * y0; S_Q[j] = at[j] + R[j] * x1 + U[j] * y1; }
    const r = lineOf(S_P, S_Q, shadow ? SHADOW : TEXT);
    r.color[3] = shadow ? 0.55 : 1; r.w = shadow ? GIZMO_LINE_PX.text + 2 : GIZMO_LINE_PX.text; r.feather = shadow ? 1 : 0.6;
  }
}
function numberLines(deg, at, g) {
  screenInto(g.viewDir);
  const n = Math.round(ARG[0]), u = (ARG[1] / 6) * (g.L / GIZMO_ARM_PX), k = digitsOf(n), neg = n < 0;
  const width = (k + (neg ? 1 : 0)) * 6 + (deg ? 3 : 0) - 2;
  ARG[3] = u;
  for (let pass = 0; pass < 2; pass++) {
    ARG[2] = -width / 2;
    if (neg) { glyphLines(MINUS, at, pass === 0); ARG[2] += 6; }
    for (let i = 0; i < k; i++) { glyphLines(GLYPH[DIGITS[i]], at, pass === 0); ARG[2] += 6; }
    if (deg) glyphLines(DEGREE, at, pass === 0);
  }
}

const DRAW_KEY_N = 22;
let drawLast = new Float64Array(DRAW_KEY_N), drawNow = new Float64Array(DRAW_KEY_N);
let drawHot = /** @type {string | null} */ (null), drawSweep = /** @type {string | null} */ (null), drawColors = /** @type {any} */ (null);
let drawVersion = -1;
function drawChanged(eye, o) {
  const K = drawNow, hot = o.hot ?? null, dragging = !!o.dragging, colors = o.colors, sweep = o.sweep ?? null, snapDeg = o.snapDeg ?? 0, guide = o.guide ?? null;
  for (let j = 0; j < 3; j++) {
    K[j] = eye[j];
    K[6 + j] = sweep ? sweep.from[j] : 0; K[9 + j] = sweep ? sweep.axis[j] : 0;
    K[14 + j] = guide ? guide.axis[j] : 0; K[17 + j] = guide ? guide.from[j] : 0;
  }
  K[3] = dragging ? 1 : 0; K[4] = snapDeg; K[5] = sweep ? 1 : 0; K[12] = sweep ? sweep.deg : 0; K[13] = guide ? 1 : 0;
  K[20] = guide ? guide.step : 0; K[21] = partsVersion;
  let same = drawVersion >= 0 && hot === drawHot && colors === drawColors && (sweep ? sweep.handle : null) === drawSweep;
  for (let i = 0; same && i < DRAW_KEY_N; i++) if (K[i] !== drawLast[i]) same = false;
  drawHot = hot; drawColors = colors; drawSweep = sweep ? sweep.handle : null; drawVersion = partsVersion;
  drawNow = drawLast; drawLast = K;
  return !same;
}
const ORDER = new Int32Array(32), DEPTH = new Float64Array(32);
const S_A = v3(), S_B = v3(), S_C = v3(), S_D = v3();

/**
 * @param {{ mode: 'move' | 'turn' | 'size', c: number[], axes: number[][], L: number, viewDir: number[], eye?: number[], grow?: Record<string, number> | null, box?: { lo: number[], hi: number[] } | null }} g
 * @param {{ hot?: string | null, dragging?: boolean, colors: Record<string, number[]>, sweep?: { handle: string, from: number[], axis: number[], deg: number } | null, snapDeg?: number, guide?: { axis: number[], from: number[], step: number } | null }} o
 */
export function gizmoDraw(g, o) {
  const parts = partsOf(g);
  // Keep `drawAll` separate so `gizmoDraw`'s cached fast path stays small and free of float math.
  if (!drawChanged(g.eye ?? eyeOf(g), o)) return DRAW;
  return drawAll(g, o, parts, g.eye ?? S_EYE);
}
function eyeOf(g) {
  const c = g.c, vd = g.viewDir, L = g.L;
  for (let j = 0; j < 3; j++) S_EYE[j] = c[j] - vd[j] * L * 10;
  return S_EYE;
}
function drawAll(g, o, parts, eye) {
  const c = g.c, vd = g.viewDir, L = g.L, hot = o.hot ?? null, dragging = !!o.dragging, colors = o.colors, sweep = o.sweep ?? null, guide = o.guide ?? null;
  nLines = 0; nTris = 0;
  DRAW.L = L;
  if (g.mode === 'turn' && !dragging) {
    basisInto(S_R, S_U, vd);
    for (let k = 0; k < DISC_SECTORS; k++) {
      for (let j = 0; j < 3; j++) {
        S_A[j] = c[j] + (S_R[j] * DISC_SC.c[k] + S_U[j] * DISC_SC.s[k]) * L;
        S_B[j] = c[j] + (S_R[j] * DISC_SC.c[k + 1] + S_U[j] * DISC_SC.s[k + 1]) * L;
      }
      triOf(c, S_A, S_B, GRAY).color[3] = 0.3;
    }
  }
  let nMesh = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.hidden || (dragging && p.key !== hot)) continue;
    const on = p.key === hot;
    if (p.mesh && nMesh < ORDER.length) {
      const q = p.tris[0][0];
      ORDER[nMesh] = i; DEPTH[nMesh++] = (q[0] - eye[0]) * vd[0] + (q[1] - eye[1]) * vd[1] + (q[2] - eye[2]) * vd[2];
    }
    if (p.ring) {
      const view = p.handle === 'view', col = view ? (on ? COL2 : GRAY) : (colors[p.handle] ?? WHITE);
      if (view) { COL2[0] = 0.8; COL2[1] = 0.8; COL2[2] = 0.8; }
      const front = view ? (on ? 0.8 : 0.6) : on ? 1 : 0.8, back = view ? front : dragging ? 0.3 : on ? 0.5 : 0.4;
      const n = p.segs.length;
      for (let k = 0; k < n; k++) {
        const a = p.segs[k][0], b = p.segs[k][1];
        const far = (a[0] + b[0] - 2 * c[0]) * vd[0] + (a[1] + b[1] - 2 * c[1]) * vd[1] + (a[2] + b[2] - 2 * c[2]) * vd[2] > 0;
        const r = lineOf(a, b, col);
        r.color[3] = far ? back : front; r.w = p.w; r.feather = 0;
        const pa = p.segs[(k + n - 1) % n][0], nb = p.segs[(k + 1) % n][1];
        r.pa[0] = pa[0]; r.pa[1] = pa[1]; r.pa[2] = pa[2]; r.nb[0] = nb[0]; r.nb[1] = nb[1]; r.nb[2] = nb[2];
        r.prev = r.pa; r.next = r.nb;
      }
    } else {
      for (let k = 0; k < p.segs.length; k++) {
        partColor(COL, p, colors, on, 0);
        const r = lineOf(p.segs[k][0], p.segs[k][1], COL);
        r.color[3] = COL[3]; r.w = p.w; r.feather = 0;
      }
    }
  }
  for (let i = 1; i < nMesh; i++) {
    const o = ORDER[i], d = DEPTH[i];
    let j = i - 1;
    while (j >= 0 && DEPTH[j] < d) { ORDER[j + 1] = ORDER[j]; DEPTH[j + 1] = DEPTH[j]; j--; }
    ORDER[j + 1] = o; DEPTH[j + 1] = d;
  }
  for (let i = 0; i < nMesh; i++) { const p = parts[ORDER[i]]; meshDraw(p, colors, p.key === hot, eye); }
  let ring = null;
  if (sweep) for (let i = 0; i < parts.length && !ring; i++) if (parts[i].key === sweep.handle && parts[i].ring) ring = parts[i];
  if (sweep && ring?.ring) sweepLines(g, sweep, ring.ring, colors[sweep.handle] ?? WHITE, o);
  if (guide) guideLines(g, guide, colors[hot ?? ''] ?? WHITE);
  DRAW.lines.length = nLines; DRAW.tris.length = nTris;
  return DRAW;
}

function onCircle(o, c, A, B) {
  const q = (ARG[0] * Math.PI) / 180, cs = Math.cos(q) * ARG[1], sn = Math.sin(q) * ARG[1];
  o[0] = c[0] + A[0] * cs + B[0] * sn; o[1] = c[1] + A[1] * cs + B[1] * sn; o[2] = c[2] + A[2] * cs + B[2] * sn;
  return o;
}
const SW_A = v3(), SW_B = v3(), SW_PREV = v3(), SW_FIRST = v3();
function sweepLines(g, sweep, ring, col, o) {
  const R = ring.R, snapDeg = o.snapDeg ?? 0, c = g.c, n = sweep.axis, f = sweep.from, fn = f[0] * n[0] + f[1] * n[1] + f[2] * n[2];
  const A = SW_A, B = SW_B;
  for (let j = 0; j < 3; j++) A[j] = f[j] - n[j] * fn;
  const al = Math.sqrt(A[0] * A[0] + A[1] * A[1] + A[2] * A[2]);
  if (al > 0) { A[0] /= al; A[1] /= al; A[2] /= al; }
  B[0] = n[1] * A[2] - n[2] * A[1]; B[1] = n[2] * A[0] - n[0] * A[2]; B[2] = n[0] * A[1] - n[1] * A[0];
  const steps = Math.max(1, Math.ceil(Math.abs(sweep.deg) / 5));
  for (let k = 0; k < steps; k++) {
    ARG[0] = (sweep.deg * k) / steps; ARG[1] = R; onCircle(S_C, c, A, B);
    ARG[0] = (sweep.deg * (k + 1)) / steps; onCircle(S_D, c, A, B);
    triOf(c, S_C, S_D, col).color[3] = 0.3;
  }
  ARG[0] = 0; ARG[1] = R;
  let r = lineOf(c, onCircle(S_C, c, A, B), col);
  r.color[3] = col[3] ?? 1; r.w = GIZMO_LINE_PX.edge; r.feather = 0;
  ARG[0] = sweep.deg;
  r = lineOf(c, onCircle(S_C, c, A, B), col);
  r.color[3] = col[3] ?? 1; r.w = GIZMO_LINE_PX.edge; r.feather = 0;
  if (snapDeg > 0) {
    const w = GIZMO_LINE_PX.ruler, R2 = R * 2;
    for (let k = 0; k < RULER_CHORDS; k++) {
      for (let j = 0; j < 3; j++) {
        S_C[j] = c[j] + (A[j] * RULER_SC.c[k] + B[j] * RULER_SC.s[k]) * R2;
        S_D[j] = c[j] + (A[j] * RULER_SC.c[k + 1] + B[j] * RULER_SC.s[k + 1]) * R2;
        SW_PREV[j] = c[j] + (A[j] * RULER_SC.c[(k + RULER_CHORDS - 1) % RULER_CHORDS] + B[j] * RULER_SC.s[(k + RULER_CHORDS - 1) % RULER_CHORDS]) * R2;
        SW_FIRST[j] = c[j] + (A[j] * RULER_SC.c[(k + 2) % RULER_CHORDS] + B[j] * RULER_SC.s[(k + 2) % RULER_CHORDS]) * R2;
      }
      r = lineOf(S_C, S_D, WHITE);
      r.color[3] = 0.85; r.w = w; r.feather = 0;
      r.pa[0] = SW_PREV[0]; r.pa[1] = SW_PREV[1]; r.pa[2] = SW_PREV[2]; r.nb[0] = SW_FIRST[0]; r.nb[1] = SW_FIRST[1]; r.nb[2] = SW_FIRST[2];
      r.prev = r.pa; r.next = r.nb;
    }
    const step = 360 / snapDeg <= 72 ? snapDeg : 5.625, count = Math.round(360 / step), fine = step === 5.625;
    for (let i = 0; i < count; i++) {
      const deg = i * step;
      const rank = Math.abs(deg % 90) < 1e-6 ? 2.8 : Math.abs(deg % 45) < 1e-6 ? 2.4 : !fine ? (i % 2 === 0 ? 2.2 : 2.1) : i % 4 === 0 ? 2.2 : i % 2 === 0 ? 2.1 : 2.05;
      ARG[0] = deg; ARG[1] = R2; onCircle(S_C, c, A, B);
      ARG[1] = R * rank; onCircle(S_D, c, A, B);
      r = lineOf(S_C, S_D, WHITE);
      r.color[3] = 0.85; r.w = w; r.feather = 0;
      if (rank === 2.8) { ARG[1] = R * 2.9; onCircle(S_C, c, A, B); ARG[0] = deg; ARG[1] = 10; numberLines(false, S_C, g); }
    }
  }
  ARG[0] = sweep.deg; ARG[1] = R * 1.3; onCircle(S_C, c, A, B);
  ARG[0] = sweep.deg; ARG[1] = 12; numberLines(true, S_C, g);
}

function guideLines(g, guide, col) {
  const G = g.L * 8, ax = guide.axis, from = guide.from, v = g.viewDir, sd = S_N;
  sd[0] = ax[1] * v[2] - ax[2] * v[1]; sd[1] = ax[2] * v[0] - ax[0] * v[2]; sd[2] = ax[0] * v[1] - ax[1] * v[0];
  const sl = Math.sqrt(sd[0] * sd[0] + sd[1] * sd[1] + sd[2] * sd[2]);
  if (!(sl > 0)) return;
  sd[0] /= sl; sd[1] /= sl; sd[2] /= sl;
  for (let j = 0; j < 3; j++) { S_C[j] = from[j] - ax[j] * G; S_D[j] = from[j] + ax[j] * G; }
  let r = lineOf(S_C, S_D, col);
  r.color[3] = 0.75; r.w = GIZMO_LINE_PX.guide; r.feather = 0;
  const s = guide.step > 0 && (guide.step / g.L) * GIZMO_ARM_PX >= 6 ? guide.step : 1;
  const n = Math.min(400, Math.floor(G / s));
  for (let k = -n; k <= n; k++) {
    const h = g.L * (k % 4 === 0 ? 0.07 : 0.035);
    for (let j = 0; j < 3; j++) { const p = from[j] + ax[j] * k * s; S_C[j] = p - sd[j] * h; S_D[j] = p + sd[j] * h; }
    r = lineOf(S_C, S_D, col);
    r.color[3] = 0.75; r.w = GIZMO_LINE_PX.ruler; r.feather = 0;
  }
}

export function viewForward(view, toward) {
  const f = norm([view[2], view[6], view[10]]);
  return dot(f, toward) < 0 ? mul(f, -1) : f;
}
