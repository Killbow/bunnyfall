// @ts-check
// Builds the Brass Remnant, its Echoes, and the Reset Hearts as meshes in their own frames.
// Pure: the scene uploads them and places them with remnantMatrix.
import { faces } from './gateModel.js';
import { packRealmFaces, SD_REALM_BRASS_RECORD, SD_REALM_ROOT_RECORD } from './sdRealm.js';
import { SD_HALL_GLOW_RECORD } from './sdHallArt.js';
import { SD_REMNANT_GOLD_RECORD, SD_REMNANT_SILVER_RECORD, SD_REMNANT_ENDING_RECORD, SD_REMNANT_ARCHIVE, SD_REMNANT_TELL_RECORD, SD_REMNANT_DIAL_RECORD, SD_REMNANT_HAND_RECORD, SD_REMNANT_LAMP_RECORD, SD_REMNANT_RIM_RECORD, SD_TELL_REGION, SD_TELL_ART_SIZE, SD_LAMP_ART } from './sdRemnantArt.js';
import { SD_REM, SD_ECHO, SD_HEART } from '../net/sdRemnant.js';

export const SD_REMNANT_BODY = Object.freeze({
  legX: 0.85, legW: 0.95, legD: 1.05, legH: 3.0,
  hipH: 0.6, hipW: 2.5, hipD: 1.35,
  cageH: 2.3, cageRX: 1.15, cageRZ: 0.75, bars: 8, bar: 0.13,
  heartY: 4.75, heartR: 0.55,
  shoulderH: 0.6, shoulderW: 3.0, shoulderD: 1.1,
  armX: 1.95, armW: 0.64, armD: 0.64, armBot: 3.1,
  headW: 0.95, headD: 0.95, eyeY: 0.36, eyeX: 0.15, eyeW: 0.18, eyeH: 0.06,
});
export const SD_REMNANT_KIT = Object.freeze({
  sides: 10,
  knee: Object.freeze({ y: 1.6, r: 0.42, root: 0.33, teeth: 10, d: 0.14, out: 0.44 }),
  elbow: Object.freeze({ y: 4.62, r: 0.36, root: 0.28, teeth: 9, d: 0.14, out: 0.36 }),
  bell: Object.freeze({ x: 1.8, top: 6.78, mouth: 5.85, r: 0.6 }),
  helm: Object.freeze({ r: 0.5, top: 7.08 }),
  crown: Object.freeze({ n: 7, base: 0.3, y: 7.0, reach: 0.78, w: 0.07 }),
  blade: Object.freeze({ root: 4.5, w0: 0.36, w1: 0.18, spade: 3.62, spadeW: 0.5, d: 0.12 }),
  pipes: Object.freeze([[-0.52, 5.95], [-0.26, 6.3], [0.26, 6.42], [0.52, 6.1]]),
});
export const SD_REMNANT_WEAR = Object.freeze({
  brass: Object.freeze({ metal: SD_REALM_BRASS_RECORD, joint: SD_REALM_ROOT_RECORD, tell: SD_REMNANT_TELL_RECORD.brass[0], dial: SD_REMNANT_DIAL_RECORD.brass, rim: SD_REMNANT_RIM_RECORD.brass }),
  gold: Object.freeze({ metal: SD_REMNANT_GOLD_RECORD, joint: SD_REMNANT_GOLD_RECORD, tell: SD_REMNANT_TELL_RECORD.gold[0], dial: SD_REMNANT_DIAL_RECORD.gold, rim: SD_REMNANT_RIM_RECORD.gold }),
  silver: Object.freeze({ metal: SD_REMNANT_SILVER_RECORD, joint: SD_REMNANT_SILVER_RECORD, tell: SD_REMNANT_TELL_RECORD.silver[0], dial: SD_REMNANT_DIAL_RECORD.silver, rim: SD_REMNANT_RIM_RECORD.silver }),
});
export const SD_REMNANT_DIAL = Object.freeze({
  y: 6.75, z: -1.32, r: 2.2, rim: 2.06, ring: 1.55, d: 0.1, teeth: 40, seg: 48, hub: 0.3, spokeW: 0.16,
  hand: Object.freeze({ hz: 0.05, len: 2.0, tail: 0.5, w: 0.12, d: 0.04 }),
});
export const SD_RIB_LAMP = Object.freeze({ r: 0.1, out: 0.08 });
export const SD_REMNANT_HEART_RECORD = SD_HALL_GLOW_RECORD.mantella;
export const SD_REMNANT_EYE_RECORD = SD_HALL_GLOW_RECORD.brass;
export const remnantScale = (echo) => (echo ? SD_ECHO.h / SD_REM.h : 1);

function box(f, rec, cx, y0, cz, w, h, d) {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
  const c = [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]];
  const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (const [a, b, e, g] of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) f.quad(rec, c[a], c[b], c[e], c[g], ...uv);
}
function shard(f, rec, cx, cz, lo, wy, hi, r) {
  const ring = [[cx + r, wy, cz], [cx, wy, cz + r], [cx - r, wy, cz], [cx, wy, cz - r]];
  const top = [cx, hi, cz], bot = [cx, lo, cz];
  for (let k = 0; k < 4; k++) {
    const a = ring[k], b = ring[(k + 1) % 4];
    f.tri(rec, top, b, a, [0.5, 1], [1, 0], [0, 0]);
    f.tri(rec, bot, a, b, [0.5, 0], [0, 1], [1, 1]);
  }
}

export const SD_REMNANT_PARTS = Object.freeze(['pelvis', 'legR', 'legL', 'torso', 'head', 'armR', 'armL']);
export const heartRecordOf = (ending) => SD_REMNANT_ENDING_RECORD[ending] ?? SD_REMNANT_HEART_RECORD;
export const eyeRecordOf = (ending) => SD_REMNANT_ENDING_RECORD[ending] ?? SD_REMNANT_EYE_RECORD;
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vlen = (a) => Math.hypot(a[0], a[1], a[2]);
function plate(f, rec, a, b, c, d, ref) {
  const n = vcross(vsub(b, a), vsub(c, a)), mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
  const u = vlen(vsub(b, a)), v = vlen(vsub(d, a));
  if (vdot(n, vsub(mid, ref)) >= 0) f.quad(rec, a, b, c, d, [0, 0], [u, 0], [u, v], [0, v]);
  else f.quad(rec, d, c, b, a, [0, v], [u, v], [u, 0], [0, 0]);
}
function facet(f, rec, a, b, c, ref) {
  const n = vcross(vsub(b, a), vsub(c, a)), mid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
  if (vdot(n, vsub(mid, ref)) >= 0) f.tri(rec, a, b, c, [0, 0], [1, 0], [0.5, 1]);
  else f.tri(rec, c, b, a, [0.5, 1], [1, 0], [0, 0]);
}
function lathe(f, rec, cx, cz, profile, n, sz = 1, sx = 1) {
  const at = (r, y, a) => [cx + Math.cos(a) * r * sx, y, cz + Math.sin(a) * r * sz];
  for (let i = 0; i + 1 < profile.length; i++) {
    const [r0, y0] = profile[i], [r1, y1] = profile[i + 1], ym = (y0 + y1) / 2;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2, ref = [cx, ym, cz];
      if (r0 === 0) facet(f, rec, at(0, y0, a0), at(r1, y1, a0), at(r1, y1, a1), ref);
      else if (r1 === 0) facet(f, rec, at(r0, y0, a0), at(r0, y0, a1), at(0, y1, a0), ref);
      else plate(f, rec, at(r0, y0, a0), at(r0, y0, a1), at(r1, y1, a1), at(r1, y1, a0), ref);
    }
  }
}
function rod(f, rec, a, b, r0, n = 6, r1 = r0) {
  const t = vsub(b, a), l = vlen(t), d = [t[0] / l, t[1] / l, t[2] / l];
  const up = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let e1 = vcross(d, up); const l1 = vlen(e1); e1 = [e1[0] / l1, e1[1] / l1, e1[2] / l1];
  const e2 = vcross(d, e1);
  const ring = (c, r, k) => { const g = (k / n) * Math.PI * 2; return [c[0] + (e1[0] * Math.cos(g) + e2[0] * Math.sin(g)) * r, c[1] + (e1[1] * Math.cos(g) + e2[1] * Math.sin(g)) * r, c[2] + (e1[2] * Math.cos(g) + e2[2] * Math.sin(g)) * r]; };
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  for (let k = 0; k < n; k++) {
    plate(f, rec, ring(a, r0, k), ring(a, r0, k + 1), ring(b, r1, k + 1), ring(b, r1, k), mid);
    facet(f, rec, a, ring(a, r0, k), ring(a, r0, k + 1), mid);
    facet(f, rec, b, ring(b, r1, k + 1), ring(b, r1, k), mid);
  }
}
function rib(f, rec, path, w) {
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1], t = vsub(b, a), h = w / 2;
    let n1 = vcross(t, [0, 1, 0]); const l = vlen(n1); n1 = [n1[0] / l * h, n1[1] / l * h, n1[2] / l * h];
    const n2 = [0, h, 0], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const c = (p, s1, s2) => [p[0] + n1[0] * s1 + n2[0] * s2, p[1] + n1[1] * s1 + n2[1] * s2, p[2] + n1[2] * s1 + n2[2] * s2];
    for (const [s1, s2, s3, s4] of [[1, 1, 1, -1], [1, -1, -1, -1], [-1, -1, -1, 1], [-1, 1, 1, 1]]) plate(f, rec, c(a, s1, s2), c(b, s1, s2), c(b, s3, s4), c(a, s3, s4), mid);
    if (i === 0) plate(f, rec, c(a, 1, 1), c(a, 1, -1), c(a, -1, -1), c(a, -1, 1), b);
    if (i + 2 === path.length) plate(f, rec, c(b, 1, 1), c(b, -1, 1), c(b, -1, -1), c(b, 1, -1), a);
  }
}
function gearX(f, rec, c, G) {
  const n = G.teeth * 2, x0 = c[0] - G.d / 2, x1 = c[0] + G.d / 2, hub = G.root * 0.35;
  const p = (a, rr, x) => [x, c[1] + Math.sin(a) * rr, c[2] + Math.cos(a) * rr];
  const both = (a, b, e, g) => { f.quad(rec, a, b, e, g, [0, 0], [1, 0], [1, 1], [0, 1]); f.quad(rec, g, e, b, a, [0, 1], [1, 1], [1, 0], [0, 0]); };
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, r = i % 2 ? G.root : G.r;
    both(p(a0, hub, x1), p(a1, hub, x1), p(a1, r, x1), p(a0, r, x1));
    both(p(a0, r, x0), p(a1, r, x0), p(a1, hub, x0), p(a0, hub, x0));
    both(p(a0, r, x0), p(a0, r, x1), p(a1, r, x1), p(a1, r, x0));
    const r1 = i % 2 ? G.r : G.root;
    both(p(a1, r, x0), p(a1, r1, x0), p(a1, r1, x1), p(a1, r, x1));
  }
}
function slab(f, rec, cx, y0, cz, w, h, d, under = null) {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h, ref = [cx, y0 + h / 2, cz];
  const c = [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]];
  for (const [a, b, e, g] of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) {
    if (under && a === 4) plate(under.f, under.rec, c[a], c[b], c[e], c[g], ref);
    else plate(f, rec, c[a], c[b], c[e], c[g], ref);
  }
}
function uvRegion(f, R, su, sv) {
  const S = SD_TELL_ART_SIZE, [x0, y0, w, h] = R;
  const at = (q) => [(x0 + 0.5 + Math.max(0, Math.min(1, q[0] / su)) * (w - 1)) / S, (y0 + 0.5 + Math.max(0, Math.min(1, q[1] / sv)) * (h - 1)) / S];
  return { tri: (rec, a, b, c, ua, ub, uc) => f.tri(rec, a, b, c, at(ua), at(ub), at(uc)), quad: (rec, a, b, c, d, ua, ub, uc, ud) => f.quad(rec, a, b, c, d, at(ua), at(ub), at(uc), at(ud)) };
}
function placeRegion(f, R, lo, hi, along) {
  const S = SD_TELL_ART_SIZE, [x0, y0, w, h] = R, k = (p, a) => Math.max(0, Math.min(1, (p[a] - lo[a]) / (hi[a] - lo[a])));
  const across = (a, b, c) => {
    const n = vcross(vsub(b, a), vsub(c, a)), m = [Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])];
    const d = m[0] >= m[1] && m[0] >= m[2] ? 0 : m[1] >= m[2] ? 1 : 2;
    return d === along ? (along === 2 ? 0 : 2) : 3 - d - along;
  };
  const at = (p, q) => [(x0 + 0.5 + k(p, along) * (w - 1)) / S, (y0 + 0.5 + k(p, q) * (h - 1)) / S];
  const tri = (rec, a, b, c) => { const q = across(a, b, c); f.tri(rec, a, b, c, at(a, q), at(b, q), at(c, q)); };
  return { tri, quad: (rec, a, b, c, d) => { const q = across(a, b, c); f.tri(rec, a, b, c, at(a, q), at(b, q), at(c, q)); f.tri(rec, a, c, d, at(a, q), at(c, q), at(d, q)); } };
}
function quadUV(f, rec, a, b, c, d, ua, ub, uc, ud, ref) {
  const n = vcross(vsub(b, a), vsub(c, a)), mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
  if (vdot(n, vsub(mid, ref)) >= 0) f.quad(rec, a, b, c, d, ua, ub, uc, ud);
  else f.quad(rec, d, c, b, a, ud, uc, ub, ua);
}
function cut(f, rec, cx, pts, d) {
  const x0 = cx - d / 2, x1 = cx + d / 2, m = pts.reduce((o, q) => [o[0] + q[0] / pts.length, o[1] + q[1] / pts.length], [0, 0]), ref = [cx, m[1], m[0]];
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k], b = pts[(k + 1) % pts.length];
    plate(f, rec, [x0, a[1], a[0]], [x0, b[1], b[0]], [x1, b[1], b[0]], [x1, a[1], a[0]], ref);
    facet(f, rec, [x1, m[1], m[0]], [x1, a[1], a[0]], [x1, b[1], b[0]], ref);
    facet(f, rec, [x0, m[1], m[0]], [x0, b[1], b[0]], [x0, a[1], a[0]], ref);
  }
}

export function ribPath(s, k) {
  const B = SD_REMNANT_BODY, yr = B.legH + B.hipH + 0.5 + k * 0.4, path = [];
  for (let i = 0; i <= 4; i++) {
    const g = (-80 + (148 * i) / 4) * (Math.PI / 180);
    path.push([s * Math.cos(g) * B.cageRX, yr + 0.08 - 0.23 * (i / 4), Math.sin(g) * B.cageRZ]);
  }
  return path;
}
export function packRemnantFaces(f) {
  const m = packRealmFaces(f);
  for (const sm of m.subMeshes) if (sm.textureRecord >= 100) sm.textureArchive = SD_REMNANT_ARCHIVE;
  return m;
}

function emitRemnant(metal, into, ending = null) {
  const B = SD_REMNANT_BODY, K = SD_REMNANT_KIT, W = SD_REMNANT_WEAR[metal], N = K.sides;
  // The right side is at +x: the camera mirror in world/mat4.js shows +x as the body's own right.
  for (const s of [-1, 1]) {
    const f = into(s > 0 ? 'legR' : 'legL'), x = s * B.legX;
    slab(f, W.metal, x, 0, 0.16, B.legW, 0.32, 1.45, { f: uvRegion(f, SD_TELL_REGION.sole, B.legW, 1.45), rec: W.tell });
    lathe(f, W.joint, x, 0, [[0.34, 0.32], [0.36, 0.5]], 8);
    lathe(f, W.metal, x, 0.02, [[0.36, 0.5], [0.46, 0.9], [0.5, 1.4], [0.44, 1.48]], N, 0.92);
    slab(f, W.joint, x, 1.4, 0.4, 0.58, 0.42, 0.3);
    gearX(f, W.joint, [x + s * K.knee.out, K.knee.y, 0], K.knee);
    lathe(f, W.metal, x, 0, [[0.44, 1.48], [0.52, 1.85], [0.58, 2.6], [0.55, B.legH]], N, 0.9);
    for (const [y0, z] of [[2.48, 0.6], [2.1, 0.66]]) slab(f, W.metal, x + s * 0.06, y0, z, 0.86, 0.48, 0.08);
  }
  let f = into('pelvis');
  lathe(f, W.joint, 0, 0, [[0, B.legH], [1.18, B.legH], [1.25, B.legH + 0.12], [1.25, B.legH + B.hipH - 0.12], [1.12, B.legH + B.hipH], [0, B.legH + B.hipH]], 12, 0.62);
  slab(f, W.metal, 0, B.legH + 0.08, 0.76, 0.6, 0.44, 0.08);
  f = into('torso');
  const cy0 = B.legH + B.hipH, sy = cy0 + B.cageH, ny = sy + B.shoulderH;
  lathe(f, W.joint, 0, 0, [[0, cy0], [0.8, cy0], [0.86, cy0 + 0.45], [0, cy0 + 0.45]], N, 0.62);
  slab(f, W.metal, 0, cy0 + 0.3, -0.62, 0.38, 2.2, 0.32);
  slab(f, W.metal, 0, cy0 + 0.7, -0.8, 1.6, 1.6, 0.12);
  const ribs = uvRegion(f, SD_TELL_REGION.rib, 0.6, B.bar);
  for (const s of [-1, 1]) for (let k = 0; k < B.bars / 2; k++) rib(ribs, W.tell, ribPath(s, k), B.bar);
  const H = B.heartY, R = B.heartR;
  lathe(f, heartRecordOf(ending), 0, 0, [[0, H - R], [R, H + 0.1], [R * 0.68, H + 0.36], [0, H + 0.44]], 8);
  lathe(f, W.joint, 0, 0, [[0, sy - 0.35], [1.0, sy - 0.35], [1.1, sy], [0, sy]], 12, 0.62);
  slab(f, W.metal, 0, sy, 0, B.shoulderW, B.shoulderH - 0.05, B.shoulderD);
  slab(f, W.joint, 0, cy0 + 1.3, -0.95, 1.3, 0.22, 0.22);
  for (const [x, top] of K.pipes) rod(f, W.joint, [x, cy0 + 1.4, -0.98], [x, Math.min(top, ny - 0.05), -0.98], 0.09, 6);
  f = into('head');
  lathe(f, W.joint, 0, 0, [[0, ny], [0.3, ny], [0.3, ny + 0.1], [0, ny + 0.1]], 8);
  lathe(f, W.metal, 0, 0, [[0, ny + 0.1], [0.42, ny + 0.1], [K.helm.r, ny + 0.26], [K.helm.r, ny + 0.42], [0.42, ny + 0.52], [0.24, ny + 0.57], [0, K.helm.top]], N);
  slab(f, W.joint, 0, ny + 0.17, 0.48, 0.62, 0.36, 0.08);
  for (const s of [-1, 1]) {
    const ex = s * B.eyeX, ey = ny + B.eyeY, ez = 0.525;
    f.quad(eyeRecordOf(ending), [ex - B.eyeW / 2, ey, ez], [ex + B.eyeW / 2, ey, ez], [ex + B.eyeW / 2, ey + B.eyeH, ez], [ex - B.eyeW / 2, ey + B.eyeH, ez], [0, 0], [1, 0], [1, 1], [0, 1]);
  }
  for (let k = 0; k < K.crown.n; k++) {
    const g = ((k - (K.crown.n - 1) / 2) / K.crown.n) * Math.PI * 1.5 + Math.PI, out = [Math.sin(g), 0, Math.cos(g)];
    const reach = K.crown.reach * (k % 2 ? 0.55 : 1), tipY = k % 2 ? K.crown.y + 0.12 : SD_REM.h;
    const base = [out[0] * K.crown.base, K.crown.y, out[2] * K.crown.base], tip = [out[0] * (K.crown.base + reach), tipY, out[2] * (K.crown.base + reach)];
    rod(f, W.metal, base, tip, K.crown.w, 4, k % 2 ? K.crown.w : 1e-5);
  }
  for (const s of [-1, 1]) {
    f = into(s > 0 ? 'armR' : 'armL');
    const x = s * B.armX, top = sy + B.shoulderH;
    lathe(f, W.metal, s * K.bell.x, 0, [[0, K.bell.top], [0.36, K.bell.top - 0.05], [0.5, 6.5], [0.57, 6.12], [K.bell.r, K.bell.mouth], [K.bell.r - 0.06, K.bell.mouth]], N);
    lathe(f, W.joint, x, 0, [[0, top - 0.1], [0.3, top - 0.1], [0.32, K.elbow.y + 0.1], [0, K.elbow.y + 0.1]], 8);
    gearX(f, W.joint, [x + s * K.elbow.out, K.elbow.y, 0], K.elbow);
    if (s < 0) {
      lathe(f, W.metal, x, 0, [[0, K.elbow.y], [0.3, K.elbow.y], [0.27, B.armBot + 0.62], [0, B.armBot + 0.62]], 8);
      const fist = uvRegion(f, SD_TELL_REGION.fist, 0.72, 0.62);
      slab(fist, W.tell, x, B.armBot, 0.04, B.armW, 0.62, 0.72);
      for (let k = 0; k < 4; k++) rod(fist, W.tell, [x - 0.27, B.armBot + 0.5 - k * 0.13, 0.42], [x + 0.27, B.armBot + 0.5 - k * 0.13, 0.42], 0.065, 6);
    } else {
      const L = K.blade, blade = placeRegion(f, SD_TELL_REGION.blade, [x - 1, B.armBot, -1], [x + 1, L.root, 1], 1);
      lathe(f, W.joint, x, 0, [[0, K.elbow.y], [0.22, K.elbow.y], [0.2, L.root], [0, L.root]], 8);
      cut(blade, W.tell, x, [[-L.w0 / 2, L.root], [L.w0 / 2, L.root], [L.w1 / 2, L.spade], [-L.w1 / 2, L.spade]], L.d);
      cut(blade, W.tell, x, [[0, L.spade + 0.14], [L.spadeW / 2, (L.spade + B.armBot) / 2 + 0.05], [0, B.armBot], [-L.spadeW / 2, (L.spade + B.armBot) / 2 + 0.05]], L.d);
    }
  }
}
export function buildRemnantModel(metal = 'brass', ending = null) {
  const f = faces();
  emitRemnant(metal, () => f, ending);
  return packRemnantFaces(f);
}
export function buildRemnantParts(metal = 'brass', ending = null) {
  const fs = Object.fromEntries(SD_REMNANT_PARTS.map((n) => [n, faces()]));
  emitRemnant(metal, (n) => fs[n], ending);
  return SD_REMNANT_PARTS.map((n) => packRemnantFaces(fs[n]));
}

export function buildBackDialModel(metal = 'brass') {
  const f = faces(), D = SD_REMNANT_DIAL, W = SD_REMNANT_WEAR[metal], N = D.seg, z0 = D.z - D.d / 2, z1 = D.z + D.d / 2;
  const at = (a, r, z) => [Math.sin(a) * r, D.y + Math.cos(a) * r, z];
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2, rm = (D.ring + D.rim) / 2, ref = [Math.sin((a0 + a1) / 2) * rm, D.y + Math.cos((a0 + a1) / 2) * rm, D.z];
    const u0 = k / N, u1 = (k + 1) / N;
    quadUV(f, W.dial, at(a0, D.ring, z0), at(a1, D.ring, z0), at(a1, D.rim, z0), at(a0, D.rim, z0), [u0, 0], [u1, 0], [u1, 1], [u0, 1], ref);
    plate(f, W.metal, at(a0, D.ring, z1), at(a1, D.ring, z1), at(a1, D.rim, z1), at(a0, D.rim, z1), ref);
    plate(f, W.metal, at(a0, D.ring, z0), at(a1, D.ring, z0), at(a1, D.ring, z1), at(a0, D.ring, z1), [0, D.y, D.z]);
  }
  for (let k = 0; k < D.teeth * 2; k++) {
    const a0 = (k / (D.teeth * 2)) * Math.PI * 2, a1 = ((k + 1) / (D.teeth * 2)) * Math.PI * 2, r = k % 2 ? D.rim : D.r, mid = (a0 + a1) / 2;
    const ref = [Math.sin(mid) * (D.rim - 0.05), D.y + Math.cos(mid) * (D.rim - 0.05), D.z];
    if (r > D.rim) for (const z of [z0, z1]) plate(f, z === z1 ? W.rim : W.metal, at(a0, D.rim, z), at(a1, D.rim, z), at(a1, r, z), at(a0, r, z), ref);
    plate(f, W.rim, at(a0, r, z0), at(a1, r, z0), at(a1, r, z1), at(a0, r, z1), ref);
    const r1 = k % 2 ? D.r : D.rim;
    plate(f, W.metal, at(a1, r, z0), at(a1, r1, z0), at(a1, r1, z1), at(a1, r, z1), [Math.sin(a1 + (k % 2 ? 0.02 : -0.02)) * (D.rim + 0.05), D.y + Math.cos(a1 + (k % 2 ? 0.02 : -0.02)) * (D.rim + 0.05), D.z]);
  }
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, s = Math.sin(a), c = Math.cos(a), w = D.spokeW / 2;
    const p = (r, e, z) => [s * r + c * e, D.y + c * r - s * e, z], ref = [s * (D.ring / 2), D.y + c * (D.ring / 2), D.z];
    const q = [[p(D.hub, -w, z0), p(D.ring + 0.02, -w, z0), p(D.ring + 0.02, w, z0), p(D.hub, w, z0)], [p(D.hub, -w, z1), p(D.ring + 0.02, -w, z1), p(D.ring + 0.02, w, z1), p(D.hub, w, z1)]];
    plate(f, W.metal, ...q[0], ref); plate(f, W.metal, ...q[1], ref);
    plate(f, W.metal, q[0][0], q[0][1], q[1][1], q[1][0], ref); plate(f, W.metal, q[0][3], q[0][2], q[1][2], q[1][3], ref);
  }
  rod(f, W.joint, [0, D.y, z1 + 0.02], [0, D.y, z0 - 0.08], D.hub, 10);
  return packRemnantFaces(f);
}
export function buildDialHandModel() {
  const f = faces(), D = SD_REMNANT_DIAL, H = D.hand, rec = SD_REMNANT_HAND_RECORD.cold, z = D.z - D.d / 2 - H.hz, y = D.y;
  const outline = [[0, y + H.len], [H.w * 1.6, y + H.len - 0.32], [H.w / 2, y + H.len - 0.3], [H.w / 2, y - H.tail + 0.12], [H.w * 1.2, y - H.tail], [-H.w * 1.2, y - H.tail], [-H.w / 2, y - H.tail + 0.12], [-H.w / 2, y + H.len - 0.3], [-H.w * 1.6, y + H.len - 0.32]];
  const cz = [z - H.d / 2, z + H.d / 2];
  for (let k = 0; k < outline.length; k++) {
    const a = outline[k], b = outline[(k + 1) % outline.length], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const inside = [(a[0] + b[0]) / 2 + (dy / l) * 0.01, (a[1] + b[1]) / 2 - (dx / l) * 0.01, z];
    facet(f, rec, [0, y, cz[0]], [a[0], a[1], cz[0]], [b[0], b[1], cz[0]], [0, y, z]);
    facet(f, rec, [0, y, cz[1]], [a[0], a[1], cz[1]], [b[0], b[1], cz[1]], [0, y, z]);
    plate(f, rec, [a[0], a[1], cz[0]], [b[0], b[1], cz[0]], [b[0], b[1], cz[1]], [a[0], a[1], cz[1]], inside);
  }
  return packRemnantFaces(f);
}
export const ribLampAt = (n) => {
  const p = ribPath(n % 2 ? 1 : -1, Math.floor(n / 2))[4];
  return [p[0], p[1], p[2] + SD_RIB_LAMP.out];
};
export function buildRibLampsModel() {
  const f = faces(), r = SD_RIB_LAMP.r, rec = SD_REMNANT_LAMP_RECORD[0], { w: W, h: H } = SD_LAMP_ART;
  for (let n = 0; n < 8; n++) {
    const c = ribLampAt(n), cell = uvCell(f, n, W, H);
    const P = [[c[0] + r, c[1], c[2]], [c[0], c[1], c[2] + r], [c[0] - r, c[1], c[2]], [c[0], c[1], c[2] - r * 0.4]], top = [c[0], c[1] + r * 1.3, c[2]], bot = [c[0], c[1] - r * 1.3, c[2]];
    for (let k = 0; k < 4; k++) { facet(cell, rec, top, P[k], P[(k + 1) % 4], c); facet(cell, rec, bot, P[(k + 1) % 4], P[k], c); }
  }
  return packRemnantFaces(f);
}
function uvCell(f, n, W, H) {
  const at = (q) => [(n * (W / 8) + 0.5 + q[0] * (W / 8 - 1)) / W, (0.5 + q[1] * (H - 1)) / H];
  return { tri: (rec, a, b, c, ua, ub, uc) => f.tri(rec, a, b, c, at(ua), at(ub), at(uc)), quad: (rec, a, b, c, d, ua, ub, uc, ud) => f.quad(rec, a, b, c, d, at(ua), at(ub), at(uc), at(ud)) };
}
export function buildTornHeartModel(ending = null) {
  const f = faces(), R = SD_REMNANT_BODY.heartR;
  lathe(f, heartRecordOf(ending), 0, 0, [[0, -R], [R, 0.1], [R * 0.68, 0.36], [0, 0.44]], 8);
  return packRemnantFaces(f);
}
export const SD_GEAR = Object.freeze({ r: 0.62, root: 0.46, hub: 0.16, teeth: 9, d: 0.2 });
export function buildGearModel() {
  const f = faces(), G = SD_GEAR, n = G.teeth * 2, z0 = -G.d / 2, z1 = G.d / 2, rec = SD_REALM_BRASS_RECORD;
  const ring = Array.from({ length: n }, (_, i) => { const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, r = i % 2 ? G.root : G.r; return [a0, a1, r]; });
  const both = (a, b, c, d) => { f.quad(rec, a, b, c, d, [0, 0], [1, 0], [1, 1], [0, 1]); f.quad(rec, d, c, b, a, [0, 1], [1, 1], [1, 0], [0, 0]); };
  for (const [a0, a1, r] of ring) {
    const p = (a, rr, z) => [Math.cos(a) * rr, Math.sin(a) * rr, z];
    both(p(a0, G.hub, z1), p(a1, G.hub, z1), p(a1, r, z1), p(a0, r, z1));
    both(p(a0, r, z0), p(a1, r, z0), p(a1, G.hub, z0), p(a0, G.hub, z0));
    both(p(a0, r, z0), p(a0, r, z1), p(a1, r, z1), p(a1, r, z0));
  }
  for (let i = 0; i < n; i++) {
    const a = ((i + 1) / n) * Math.PI * 2, r0 = i % 2 ? G.root : G.r, r1 = i % 2 ? G.r : G.root, p = (rr, z) => [Math.cos(a) * rr, Math.sin(a) * rr, z];
    both(p(r0, z0), p(r1, z0), p(r1, z1), p(r0, z1));
  }
  return packRealmFaces(f);
}
export function buildHeartModel(ending = null) {
  const f = faces();
  shard(f, heartRecordOf(ending), 0, 0, 0, SD_HEART.h * 0.35, SD_HEART.h, SD_HEART.r);
  return packRealmFaces(f);
}

export function remnantMatrix(x, y, z, yw, scale = 1, out = new Float32Array(16)) {
  const c = Math.cos(yw) * scale, s = Math.sin(yw) * scale;
  out[0] = c; out[1] = 0; out[2] = -s; out[3] = 0;
  out[4] = 0; out[5] = scale; out[6] = 0; out[7] = 0;
  out[8] = s; out[9] = 0; out[10] = c; out[11] = 0;
  out[12] = x; out[13] = y; out[14] = z; out[15] = 1;
  return out;
}
