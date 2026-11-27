// @ts-check
// A berth's quay as a model: deck, jetty, ramp, piles, kerb, rails, bollards, lantern posts, and cargo.

import { MeshBuilder } from './detStandIns.js';
import { QUAY_DECK_T, PILE_R, BOLLARD_R, BOLLARD_H, LANTERN_UP, LANTERN_ARM, QUAY_KERB_W, QUAY_KERB_H, lanternHead, jettyLanternHead, BRACE_W, FENDER_W } from '../systems/naval/quays.js';

const WOOD = [67, 0];
const WOOD_DARK = [67, 8];
const IRON = [0, 79];
const GLOW = [0, 10];
const ROPE = [0, 77];

export const RAIL_UP = 1.0;
export const RAIL_STEP = 2;
export const JOIST_STEP = 1.2;
export const JOIST_H = 0.18;
export const RUNG_STEP = 0.3;
export const LADDER_GRAB = 0.6;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function beam(m, tex, a, b, w) {
  const u = unit(sub(b, a)), len = Math.hypot(...sub(b, a));
  const s = unit(cross(u, Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), t = unit(cross(s, u)), h = w / 2;
  const at = (p, i, j) => [p[0] + (s[0] * i + t[0] * j) * h, p[1] + (s[1] * i + t[1] * j) * h, p[2] + (s[2] * i + t[2] * j) * h];
  const uv = [[0, 0], [len, 0], [len, -w], [0, -w]];
  const neg = (v) => [-v[0], -v[1], -v[2]];
  for (const [i0, j0, i1, j1, n] of [[-1, -1, 1, -1, neg(t)], [1, -1, 1, 1, s], [1, 1, -1, 1, t], [-1, 1, -1, -1, neg(s)]]) {
    m.quad(tex, at(a, i0, j0), at(b, i0, j0), at(b, i1, j1), at(a, i1, j1), n, uv);
  }
  m.quad(tex, at(a, -1, -1), at(a, 1, -1), at(a, 1, 1), at(a, -1, 1), neg(u));
  m.quad(tex, at(b, -1, -1), at(b, -1, 1), at(b, 1, 1), at(b, 1, -1), u);
}
function hangLantern(m, x, y, z) {
  m.box(IRON, [x, y + 0.2, z], [0.24, 0.05, 0.24]);
  m.box(GLOW, [x, y, z], [0.17, 0.32, 0.17]);
  for (const [dx, dz] of [[-0.1, -0.1], [0.1, -0.1], [0.1, 0.1], [-0.1, 0.1]]) m.box(IRON, [x + dx, y, z + dz], [0.025, 0.34, 0.025]);
  m.box(IRON, [x, y - 0.19, z], [0.22, 0.05, 0.22]);
}

function slab(m, tex, xa, ya, xb, yb, z0, z1, t) {
  const len = Math.hypot(xb - xa, yb - ya) || 1;
  const n = [-(yb - ya) / len, (xb - xa) / len, 0];
  const P = (x, y, z) => [x, y, z];
  const uv = [[0, 0], [len * 0.5, 0], [len * 0.5, -(z1 - z0) * 0.5], [0, -(z1 - z0) * 0.5]];
  m.quad(tex, P(xa, ya, z0), P(xb, yb, z0), P(xb, yb, z1), P(xa, ya, z1), n, uv);
  m.quad(tex, P(xa, ya - t, z1), P(xb, yb - t, z1), P(xb, yb - t, z0), P(xa, ya - t, z0), [-n[0], -n[1], 0], uv);
  m.quad(tex, P(xa, ya - t, z0), P(xb, yb - t, z0), P(xb, yb, z0), P(xa, ya, z0), [0, 0, -1]);
  m.quad(tex, P(xb, yb - t, z1), P(xa, ya - t, z1), P(xa, ya, z1), P(xb, yb, z1), [0, 0, 1]);
  m.quad(tex, P(xb, yb - t, z0), P(xb, yb - t, z1), P(xb, yb, z1), P(xb, yb, z0), [1, 0, 0]);
  m.quad(tex, P(xa, ya - t, z1), P(xa, ya - t, z0), P(xa, ya, z0), P(xa, ya, z1), [-1, 0, 0]);
}

function railX(m, xa, xb, z, deck) {
  if (xb - xa < 0.5) return;
  const n = Math.max(1, Math.round((xb - xa) / RAIL_STEP));
  for (let k = 0; k <= n; k++) m.box(WOOD_DARK, [xa + ((xb - xa) * k) / n, deck + RAIL_UP / 2, z], [0.12, RAIL_UP, 0.12], 2);
  m.box(WOOD_DARK, [(xa + xb) / 2, deck + RAIL_UP, z], [xb - xa, 0.1, 0.1], 1);
}

/**
 * @param {any} plan
 */
export function buildQuayModel(plan) {
  const m = new MeshBuilder(), loose = new MeshBuilder();
  const { deck } = plan, q = plan.quay, t = QUAY_DECK_T;
  m.box(WOOD, [(q.x0 + q.x1) / 2, deck - t / 2, (q.z0 + q.z1) / 2], [q.x1 - q.x0, t, q.z1 - q.z0], 0.5);
  m.box(WOOD_DARK, [q.x0 + QUAY_KERB_W / 2, deck + QUAY_KERB_H / 2, (q.z0 + q.z1) / 2], [QUAY_KERB_W, QUAY_KERB_H, q.z1 - q.z0], 1);
  m.box(WOOD_DARK, [q.x0 + 0.12, deck - t - 0.2, (q.z0 + q.z1) / 2], [0.24, 0.4, q.z1 - q.z0], 1);
  const j = plan.jetty;
  if (j && j.x1 - j.x0 > 0.05) {
    m.box(WOOD, [(j.x0 + j.x1) / 2, deck - t / 2, (j.z0 + j.z1) / 2], [j.x1 - j.x0, t, j.z1 - j.z0], 0.5);
    railX(m, j.x0 + 0.3, j.x1 - (plan.ramp ? 0 : 1.5), j.z0 + 0.06, deck);
    railX(m, j.x0 + 0.3, j.x1 - (plan.ramp ? 0 : 1.5), j.z1 - 0.06, deck);
  }
  const r = plan.ramp;
  if (r) slab(m, WOOD, r.x0, r.y0, r.x1, r.y1, r.z0, r.z1, t);
  for (const [x, z, foot] of plan.piles) {
    const top = deck - t;
    if (top - foot > 0.05) m.cylinderY(WOOD_DARK, [x, foot, z], PILE_R, top - foot, 6, 1.2, false);
  }
  for (const [x, z] of plan.bollards) {
    m.cylinderY(IRON, [x, deck, z], BOLLARD_R, BOLLARD_H, 8, 0.5, true);
    m.cylinderY(IRON, [x, deck + BOLLARD_H, z], BOLLARD_R * 1.35, 0.08, 8, 0.5, true);
  }
  for (const [x, z] of plan.lanterns) {
    m.cylinderY(WOOD_DARK, [x, deck, z], 0.09, LANTERN_UP + 0.1, 6, 0.6, true);
    m.box(WOOD_DARK, [x - LANTERN_ARM / 2, deck + LANTERN_UP + 0.04, z], [LANTERN_ARM + 0.12, 0.08, 0.08], 4);
    const [hx, hy, hz] = lanternHead(x, z, deck);
    m.box(IRON, [hx, deck + LANTERN_UP - 0.04, hz], [0.03, 0.08, 0.03]);
    m.box(IRON, [hx, hy + 0.2, hz], [0.24, 0.05, 0.24]);
    m.box(GLOW, [hx, hy, hz], [0.18, 0.32, 0.18]);
    for (const [dx, dz] of [[-0.1, -0.1], [0.1, -0.1], [0.1, 0.1], [-0.1, 0.1]]) m.box(IRON, [hx + dx, hy, hz + dz], [0.025, 0.34, 0.025]);
    m.box(IRON, [hx, hy - 0.19, hz], [0.22, 0.05, 0.22]);
  }
  pierDress(m, loose, plan);
  for (const c of plan.cargo) {
    if (c.kind === 'crate') {
      for (let k = 0; k < c.stack; k++) m.box(WOOD_DARK, [c.x, deck + c.s / 2 + k * c.s, c.z + k * 0.08], [c.s, c.s, c.s], 1 / c.s);
    } else {
      m.cylinderY(WOOD_DARK, [c.x, deck, c.z], c.s, 0.95, 8, 0.95, true);
      m.cylinderY(IRON, [c.x, deck + 0.18, c.z], c.s + 0.015, 0.05, 8, 0.5, false);
      m.cylinderY(IRON, [c.x, deck + 0.72, c.z], c.s + 0.015, 0.05, 8, 0.5, false);
    }
  }
  return joinModels(m.build(), loose.build());
}
function joinModels(solid, loose) {
  const nv = solid.positions.length / 3, ni = solid.indices.length;
  const cat = (A, B) => { const out = new /** @type {any} */ (A.constructor)(A.length + B.length); out.set(A, 0); out.set(B, A.length); return out; };
  const indices = new Uint32Array(ni + loose.indices.length);
  indices.set(solid.indices, 0);
  for (let k = 0; k < loose.indices.length; k++) indices[ni + k] = loose.indices[k] + nv;
  const positions = cat(solid.positions, loose.positions);
  return {
    positions, normals: cat(solid.normals, loose.normals), uvs: cat(solid.uvs, loose.uvs), indices,
    subMeshes: [...solid.subMeshes, ...loose.subMeshes.map((s) => ({ ...s, startIndex: s.startIndex + ni }))], doors: [],
    collider: { positions: positions.subarray(0, solid.positions.length), indices: indices.subarray(0, ni) },
  };
}

/**
 * @param {MeshBuilder} m
 * @param {MeshBuilder} loose
 * @param {any} plan
 */
function pierDress(m, loose, plan) {
  const { deck } = plan, q = plan.quay, t = QUAY_DECK_T, under = deck - t;
  for (let z = q.z0 + 0.3; z <= q.z1 - 0.3 + 1e-6; z += JOIST_STEP) loose.box(WOOD_DARK, [(q.x0 + q.x1) / 2, under - JOIST_H / 2, z], [q.x1 - q.x0 - 0.5, JOIST_H, 0.12], 1);
  loose.box(WOOD_DARK, [q.x1 - 0.12, under - 0.2, (q.z0 + q.z1) / 2], [0.24, 0.4, q.z1 - q.z0], 1);
  const j = plan.jetty;
  if (j && j.x1 - j.x0 > 0.5) {
    for (let x = j.x0 + 0.6; x <= j.x1 - 0.3 + 1e-6; x += JOIST_STEP) loose.box(WOOD_DARK, [x, under - JOIST_H / 2, (j.z0 + j.z1) / 2], [0.12, JOIST_H, j.z1 - j.z0 - 0.1], 1);
    for (const z of [j.z0 + 0.12, j.z1 - 0.12]) loose.box(WOOD_DARK, [(j.x0 + j.x1) / 2, under - 0.16, z], [j.x1 - j.x0, 0.32, 0.2], 1);
  }
  for (const [a, b] of plan.braces ?? []) beam(loose, WOOD_DARK, a, b, BRACE_W);
  for (const [z, foot] of plan.fenders ?? []) {
    const top = deck - 0.04;
    if (top - foot < 0.1) continue;
    m.box(WOOD_DARK, [q.x0 - 0.11, (top + foot) / 2, z], [0.2, top - foot, FENDER_W - 0.02], 1);
    m.box(IRON, [q.x0 - 0.11, top - 0.04, z], [0.22, 0.06, FENDER_W], 1);
  }
  for (const [z, foot] of plan.ladders ?? []) {
    const lx = q.x0 - 0.1, top = deck + LADDER_GRAB;
    for (const dz of [-0.22, 0.22]) m.box(IRON, [lx, (top + foot) / 2, z + dz], [0.05, top - foot, 0.05], 1);
    m.box(IRON, [lx + 0.12, top, z], [0.29, 0.05, 0.49], 1);
    for (let y = deck - 0.25; y > foot + 0.1; y -= RUNG_STEP) m.box(IRON, [lx, y, z], [0.04, 0.04, 0.44], 1);
  }
  for (const [x, z] of plan.cleats ?? []) {
    loose.box(IRON, [x, deck + 0.04, z], [0.12, 0.08, 0.16], 1);
    loose.box(IRON, [x, deck + 0.11, z], [0.09, 0.06, 0.46], 1);
  }
  for (const [x, z, r] of plan.coils ?? []) {
    loose.cylinderY(ROPE, [x, deck, z], r, 0.07, 10, 0.3, true);
    loose.cylinderY(ROPE, [x, deck + 0.07, z], r * 0.8, 0.06, 10, 0.3, true);
  }
  const c = plan.crane;
  if (c) {
    const up = deck + c.up, end = c.z + c.dir * c.jib;
    m.box(WOOD_DARK, [c.x, deck + c.up / 2, c.z], [0.34, c.up, 0.34], 1);
    m.box(WOOD_DARK, [c.x, deck + 0.12, c.z], [0.9, 0.24, 0.9], 1);
    beam(m, WOOD_DARK, [c.x, up - 0.1, c.z - c.dir * 0.35], [c.x, up - 0.1, end + c.dir * 0.2], 0.24);
    beam(m, WOOD_DARK, [c.x, up - 1.9, c.z + c.dir * 0.17], [c.x, up - 0.22, c.z + c.dir * 1.9], 0.16);
    m.box(IRON, [c.x, up - 0.32, end], [0.3, 0.2, 0.1], 1);
    m.box(ROPE, [c.x, (up - 0.35 + deck + c.hook) / 2, end], [0.04, up - 0.35 - deck - c.hook, 0.04], 1);
    m.box(IRON, [c.x, deck + c.hook - 0.06, end], [0.12, 0.12, 0.12], 1);
    m.box(IRON, [c.x, deck + c.hook - 0.22, end + 0.04], [0.03, 0.2, 0.03], 1);
    m.box(IRON, [c.x, deck + c.hook - 0.33, end + 0.08], [0.03, 0.03, 0.1], 1);
    m.box(ROPE, [c.x, up / 2 + (deck + 1.1) / 2, c.z + c.dir * 0.2], [0.035, up - deck - 1.1, 0.035], 1);
    m.cylinderX(ROPE, [c.x - 0.3, deck + 1.0, c.z + c.dir * 0.42], 0.13, 0.6, 8);
    for (const dx of [-0.36, 0.36]) m.box(WOOD_DARK, [c.x + dx, deck + 0.55, c.z + c.dir * 0.42], [0.08, 1.1, 0.4], 1);
  }
  for (const [x, z, side] of plan.jettyLanterns ?? []) {
    m.cylinderY(WOOD_DARK, [x, deck, z], 0.09, LANTERN_UP + 0.1, 6, 0.6, true);
    m.box(WOOD_DARK, [x, deck + LANTERN_UP + 0.04, z + (side * LANTERN_ARM) / 2], [0.08, 0.08, LANTERN_ARM + 0.12], 4);
    const [hx, hy, hz] = jettyLanternHead(x, z, side, deck);
    m.box(IRON, [hx, deck + LANTERN_UP - 0.04, hz], [0.03, 0.08, 0.03]);
    hangLantern(m, hx, hy, hz);
  }
}

export function buildGangwayModel() {
  const m = new MeshBuilder();
  m.box(WOOD, [0, 0.04, 0.5], [0.9, 0.08, 1], 1);
  for (const x of [-0.42, 0.42]) m.box(ROPE, [x, 0.75, 0.5], [0.035, 0.035, 1], 1);
  for (let k = 0; k <= 4; k++) m.box(WOOD_DARK, [0, 0.09, k / 4 * 0.96 + 0.02], [0.86, 0.03, 0.04], 1);
  return m.build();
}
