// @ts-check
// Pure geometry and drag math for the POI editor's move, turn, and size handles, in world meters around `c`.
// `gizmoSize` keeps the handles a constant CSS-pixel size. The in-game editor shares `END_ON` and `EDGE_ON`.

export const POI_GIZMO_PX = 110;
export const POI_GIZMO_PICK_PX = 9;
export const POI_SNAP_DEFAULT = Object.freeze({ move: 0.25, turn: 15, size: 0.1 });
export const GIZMO_HANDLES = Object.freeze({
  move: Object.freeze(['x', 'y', 'z', 'xy', 'yz', 'xz', 'view']),
  turn: Object.freeze(['x', 'y', 'z', 'view']),
  size: Object.freeze(['x', 'y', 'z', 'all']),
});

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a); return l > 0 ? mul(a, 1 / l) : [0, 0, 0]; };
const AX = { x: 0, y: 1, z: 2 };
const PLANE = { xy: [0, 1, 2], yz: [1, 2, 0], xz: [0, 2, 1] };
export const END_ON = 0.985, EDGE_ON = 0.035;

export function gizmoSize(eye, viewDir, origin, fovY, viewportH, px = POI_GIZMO_PX) {
  const d = Math.max(0.05, dot(sub(origin, eye), viewDir));
  return (px * 2 * d * Math.tan(fovY / 2)) / Math.max(1, viewportH);
}

export function rayPlane(o, d, p, n) {
  const den = dot(d, n);
  if (Math.abs(den) < 1e-9) return null;
  const t = dot(sub(p, o), n) / den;
  return t >= 0 ? t : null;
}
export function raySegment(o, d, a, b) {
  const u = sub(b, a), w = sub(o, a);
  const A = dot(d, d), B = dot(d, u), C = dot(u, u), D = dot(d, w), E = dot(u, w);
  const den = A * C - B * B;
  let t, s;
  if (den < 1e-12) { t = 0; s = C > 0 ? Math.min(1, Math.max(0, E / C)) : 0; }
  else {
    t = (B * E - C * D) / den; s = (A * E - B * D) / den;
    if (s < 0 || s > 1) { s = Math.min(1, Math.max(0, s)); t = Math.max(0, dot(d, sub(add(a, mul(u, s)), o)) / A); }
    if (t < 0) { t = 0; s = C > 0 ? Math.min(1, Math.max(0, E / C)) : 0; }
  }
  const pa = add(o, mul(d, t)), pb = add(a, mul(u, s));
  return { dist: len(sub(pa, pb)), t, s };
}

/**
 * @param {'move' | 'turn' | 'size'} mode
 * @param {number[]} c
 * @param {number[][]} axes
 * @param {number} L
 * @param {number[]} viewDir
 */
export function gizmoShape(mode, c, axes, L, viewDir) {
  const out = [];
  const seg = (a, b) => [a, b];
  if (mode === 'move' || mode === 'size') {
    for (const h of ['x', 'y', 'z']) {
      const a = axes[AX[h]];
      const tip = add(c, mul(a, L));
      const segs = [seg(add(c, mul(a, L * 0.12)), tip)];
      if (mode === 'size') {
        const k = L * 0.07, o = axes[(AX[h] + 1) % 3], q = axes[(AX[h] + 2) % 3];
        const corner = (i, j, l) => add(add(add(tip, mul(a, (i ? 1 : -1) * k)), mul(o, (j ? 1 : -1) * k)), mul(q, (l ? 1 : -1) * k));
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
          segs.push(seg(corner(0, i, j), corner(1, i, j)), seg(corner(i, 0, j), corner(i, 1, j)), seg(corner(i, j, 0), corner(i, j, 1)));
        }
      } else {
        const o = axes[(AX[h] + 1) % 3], q = axes[(AX[h] + 2) % 3], back = add(c, mul(a, L * 0.82));
        for (const f of [o, mul(o, -1), q, mul(q, -1)]) segs.push(seg(tip, add(back, mul(f, L * 0.06))));
      }
      out.push({ handle: h, kind: mode === 'size' ? 'box' : 'arrow', segs, hidden: Math.abs(dot(a, viewDir)) > END_ON });
    }
  }
  if (mode === 'move') {
    for (const h of ['xy', 'yz', 'xz']) {
      const [i, j] = PLANE[h], u = axes[i], v = axes[j];
      const p = (a, b) => add(add(c, mul(u, a * L)), mul(v, b * L));
      out.push({ handle: h, kind: 'square', segs: [seg(p(0.25, 0.25), p(0.45, 0.25)), seg(p(0.45, 0.25), p(0.45, 0.45)), seg(p(0.45, 0.45), p(0.25, 0.45)), seg(p(0.25, 0.45), p(0.25, 0.25))], hidden: Math.abs(dot(axes[PLANE[h][2]], viewDir)) < EDGE_ON });
    }
  }
  if (mode === 'move' || mode === 'size') {
    const r = norm(Math.abs(viewDir[1]) < 0.99 ? cross(viewDir, [0, 1, 0]) : cross(viewDir, [1, 0, 0])), u = norm(cross(r, viewDir)), k = L * 0.08;
    const p = (a, b) => add(add(c, mul(r, a * k)), mul(u, b * k));
    out.push({ handle: mode === 'size' ? 'all' : 'view', kind: 'square', segs: [seg(p(-1, -1), p(1, -1)), seg(p(1, -1), p(1, 1)), seg(p(1, 1), p(-1, 1)), seg(p(-1, 1), p(-1, -1))] });
  }
  if (mode === 'turn') {
    const ring = (n, R) => {
      const r = norm(Math.abs(n[1]) < 0.99 ? cross(n, [0, 1, 0]) : cross(n, [1, 0, 0])), u = cross(n, r), segs = [];
      for (let k = 0; k < 64; k++) {
        const a0 = (k / 64) * 2 * Math.PI, a1 = ((k + 1) / 64) * 2 * Math.PI;
        segs.push(seg(add(c, add(mul(r, Math.cos(a0) * R), mul(u, Math.sin(a0) * R))), add(c, add(mul(r, Math.cos(a1) * R), mul(u, Math.sin(a1) * R)))));
      }
      return segs;
    };
    for (const h of ['x', 'y', 'z']) out.push({ handle: h, kind: 'ring', segs: ring(axes[AX[h]], L) });
    out.push({ handle: 'view', kind: 'ring', segs: ring(norm(mul(viewDir, -1)), L * 1.18) });
  }
  return out;
}

/**
 * @param {{ mode: 'move' | 'turn' | 'size', c: number[], axes: number[][], L: number, viewDir: number[], pxWorld: number }} g
 * @param {number[]} o
 * @param {number[]} d
 */
export function pickHandle(g, o, d, pickPx = POI_GIZMO_PICK_PX) {
  const tol = g.pxWorld * pickPx;
  let best = null;
  for (const s of gizmoShape(g.mode, g.c, g.axes, g.L, g.viewDir)) {
    if (s.hidden) continue;
    let near = Infinity;
    if (s.kind === 'square') {
      const n = s.handle.length === 2 ? g.axes[PLANE[s.handle][2]] : g.viewDir;
      const t = rayPlane(o, d, s.segs[0][0], n);
      if (t !== null) {
        const p = add(o, mul(d, t)), q = s.segs.map((e) => e[0]);
        const e1 = sub(q[1], q[0]), e2 = sub(q[3], q[0]), w = sub(p, q[0]);
        const a = dot(w, e1) / dot(e1, e1), b = dot(w, e2) / dot(e2, e2);
        if (a >= 0 && a <= 1 && b >= 0 && b <= 1) near = 0;
      }
    }
    for (const [a, b] of s.segs) near = Math.min(near, raySegment(o, d, a, b).dist);
    const bias = s.handle === 'view' || s.handle === 'all' ? tol * 0.25 : 0;
    if (near <= tol && (!best || near + bias < best.near)) best = { handle: s.handle, near: near + bias };
  }
  return best ? best.handle : null;
}

function axisPlaneNormal(axis, viewDir) {
  const n = cross(axis, cross(viewDir, axis));
  return len(n) > 1e-6 ? norm(n) : norm(cross(axis, Math.abs(axis[1]) < 0.99 ? [0, 1, 0] : [1, 0, 0]));
}
const snapTo = (v, step) => (step > 0 ? Math.round(v / step) * step : v);

/**
 * @param {{ mode: 'move' | 'turn' | 'size', c: number[], axes: number[][], L: number, viewDir: number[] }} g
 * @param {string} handle
 * @param {number[]} o
 * @param {number[]} d
 */
export function beginGizmoDrag(g, handle, o, d) {
  const c = g.c;
  let plane, axis = null, along = null;
  if (g.mode === 'turn') {
    axis = handle === 'view' ? norm(mul(g.viewDir, -1)) : g.axes[AX[handle]];
    if (Math.abs(dot(axis, g.viewDir)) > EDGE_RING) plane = axis;
    else {
      plane = norm(g.viewDir);
      along = norm(cross(axis, mul(g.viewDir, -1)));
    }
  } else if (handle === 'view' || handle === 'all') plane = norm(g.viewDir);
  else if (handle.length === 2) plane = g.axes[PLANE[handle][2]];
  else { axis = g.axes[AX[handle]]; plane = axisPlaneNormal(axis, g.viewDir); }
  const t = rayPlane(o, d, c, plane);
  if (t === null) return null;
  const hit = add(o, mul(d, t));
  const screen = g.mode === 'size' && handle === 'all' ? screenBasis(g.viewDir) : null;
  return { mode: g.mode, handle, c, axes: g.axes, plane, axis, along, screen, hit0: hit, L: g.L };
}
const EDGE_RING = 0.08;
function screenBasis(viewDir) {
  const right = norm(Math.abs(viewDir[1]) < 0.99 ? cross([0, 1, 0], viewDir) : cross([0, 0, 1], viewDir));
  return { right, up: norm(cross(viewDir, right)) };
}

/**
 * @param {any} s
 * @param {number[]} o
 * @param {number[]} d
 * @param {{ move?: number, turn?: number, size?: number } | null} [snap]
 */
export function dragResult(s, o, d, snap = null) {
  if (!s) return null;
  const t = rayPlane(o, d, s.c, s.plane);
  if (t === null) return null;
  const hit = add(o, mul(d, t));
  if (s.mode === 'move') {
    if (s.axis) {
      const along = snapTo(dot(sub(hit, s.hit0), s.axis), snap?.move ?? 0);
      return { move: mul(s.axis, along) };
    }
    let delta = sub(hit, s.hit0);
    if (snap?.move) {
      const basis = s.handle.length === 2 ? PLANE[s.handle].slice(0, 2).map((i) => s.axes[i]) : [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      delta = basis.reduce((acc, a) => add(acc, mul(a, snapTo(dot(delta, a), snap.move))), [0, 0, 0]);
    }
    return { move: delta };
  }
  if (s.mode === 'turn' && s.along) {
    let deg = (dot(sub(hit, s.hit0), s.along) / Math.max(1e-9, s.L)) * 180 / Math.PI;
    if (snap?.turn) deg = snapTo(deg, snap.turn);
    return { turn: { axis: s.axis, deg: deg === 0 ? 0 : deg } };
  }
  if (s.mode === 'turn') {
    const v0 = sub(s.hit0, s.c), v1 = sub(hit, s.c);
    const flat = (v) => sub(v, mul(s.axis, dot(v, s.axis)));
    const a = flat(v0), b = flat(v1);
    if (len(a) < 1e-9 || len(b) < 1e-9) return { turn: { axis: s.axis, deg: 0 } };
    let deg = Math.atan2(dot(s.axis, cross(a, b)), dot(a, b)) * 180 / Math.PI;
    if (snap?.turn) deg = snapTo(deg, snap.turn);
    return { turn: { axis: s.axis, deg: deg === 0 ? 0 : deg } };
  }
  if (s.axis) {
    const s0 = dot(sub(s.hit0, s.c), s.axis), s1 = dot(sub(hit, s.c), s.axis);
    let f = Math.abs(s0) > 1e-9 ? s1 / s0 : 1;
    if (snap?.size) f = 1 + snapTo(f - 1, snap.size);
    f = Math.max(0.01, f);
    const i = s.axes.indexOf(s.axis);
    return { size: [0, 1, 2].map((k) => (k === i ? f : 1)) };
  }
  const travel = sub(hit, s.hit0);
  let f = 1 + (dot(travel, s.screen.right) + dot(travel, s.screen.up)) / Math.max(1e-9, s.L);
  if (snap?.size) f = 1 + snapTo(f - 1, snap.size);
  f = Math.max(0.01, f);
  return { size: [f, f, f] };
}
