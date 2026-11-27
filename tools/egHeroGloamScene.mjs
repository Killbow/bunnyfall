// Writes the Gloam Thicket hero passage from numbers alone as an .fbx for tools/bakeEgHeroGloam.mjs.
// Run: node tools/egHeroGloamScene.mjs [--out=src/assets/egfrags/source/egheroGloam.fbx]
// Only exact arithmetic is used (see tools/egHeroKit.mjs), so every run writes the same bytes.
// It replaces egFragPassage('gloam') in src/net/eliteGates/egFragLaw.js, so its mouth and exits must match.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { refFragMesh, writeRefFragFbx } from './egRefFragScene.mjs';
import { RINGS, r4, unit, fbm2, hash01 } from './egHeroKit.mjs';
import { ROOT } from './shipBake.mjs';
import { isMain } from './lib/isMain.mjs';

export const GLOAM_FBX = 'src/assets/egfrags/source/egheroGloam.fbx';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
export const ease = (t) => { const u = t < 0 ? 0 : t > 1 ? 1 : t; return u * u * (3 - 2 * u); };
export function knots(ks) {
  return (x) => {
    if (x <= ks[0][0]) return ks[0][1];
    for (let k = 1; k < ks.length; k++) if (x <= ks[k][0]) { const [x0, y0] = ks[k - 1], [x1, y1] = ks[k]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
    return ks[ks.length - 1][1];
  };
}
export function bezier(p0, p1, p2, p3, n) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, s = 1 - t, a = s * s * s, b = 3 * s * s * t, c = 3 * s * t * t, d = t * t * t;
    out.push([0, 1, 2].map((q) => a * p0[q] + b * p1[q] + c * p2[q] + d * p3[q]));
  }
  return out;
}

export function sheet(m, cols, rows, at, mat, { flip = false, uv, skip = () => false }) {
  const P = [];
  for (let j = 0; j <= rows; j++) { const row = []; for (let i = 0; i <= cols; i++) row.push(at(i, j).map(r4)); P.push(row); }
  const N = P.map((row, j) => row.map((_, i) => {
    const n = unit(cross(sub(P[j][Math.min(cols, i + 1)], P[j][Math.max(0, i - 1)]), sub(P[Math.min(rows, j + 1)][i], P[Math.max(0, j - 1)][i])));
    return flip ? n.map((c) => -c + 0) : n;
  }));
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (skip(i, j)) continue;
      const q = flip ? [[i, j], [i, j + 1], [i + 1, j + 1], [i + 1, j]] : [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
      m.face(q.map(([a, b]) => P[b][a]), mat, q.map(([a, b]) => [N[b][a], uv(a, b, P[b][a]).map(r4)]));
    }
  }
  return m;
}

export function tube(m, path, radii, n, mat, { vScale = 0.5, uScale = 1, caps = true } = {}) {
  const ring = RINGS[n];
  const T = path.map((p, k) => unit(sub(path[Math.min(path.length - 1, k + 1)], path[Math.max(0, k - 1)])));
  const R = [], U = [];
  let right = unit(cross(T[0], Math.abs(T[0][2]) > 0.95 ? [1, 0, 0] : [0, 0, 1]));
  for (let k = 0; k < path.length; k++) {
    const t = T[k], d = dot(right, t);
    right = unit([right[0] - t[0] * d, right[1] - t[1] * d, right[2] - t[2] * d]);
    R.push(right); U.push(unit(cross(right, t)));
  }
  let s = 0;
  const vAt = path.map((p, k) => (k ? (s += len(sub(p, path[k - 1]))) : 0));
  const at = (k, i) => { const [c, sn] = ring[i % n], r = radii[k]; return [0, 1, 2].map((q) => path[k][q] + (R[k][q] * c + U[k][q] * sn) * r).map(r4); };
  const nAt = (k, i) => { const [c, sn] = ring[i % n]; return unit([0, 1, 2].map((q) => R[k][q] * c + U[k][q] * sn)); };
  for (let k = 0; k + 1 < path.length; k++) {
    for (let i = 0; i < n; i++) {
      const u0 = r4((uScale * i) / n), u1 = r4((uScale * (i + 1)) / n), v0 = r4(vAt[k] * vScale), v1 = r4(vAt[k + 1] * vScale);
      if (radii[k + 1] === 0) m.face([at(k, i + 1), at(k, i), at(k + 1, i)], mat, [[nAt(k, i + 1), [u1, v0]], [nAt(k, i), [u0, v0]], [unit(T[k + 1]), [r4((u0 + u1) / 2), v1]]]);
      else m.face([at(k, i + 1), at(k, i), at(k + 1, i), at(k + 1, i + 1)], mat, [[nAt(k, i + 1), [u1, v0]], [nAt(k, i), [u0, v0]], [nAt(k + 1, i), [u0, v1]], [nAt(k + 1, i + 1), [u1, v1]]]);
    }
  }
  if (caps && radii[0] > 0) m.face(Array.from({ length: n }, (_, i) => at(0, i)), mat);
  if (caps && radii[path.length - 1] > 0) m.face(Array.from({ length: n }, (_, i) => at(path.length - 1, i)).reverse(), mat);
  return m;
}

export function strip(m, a, b, w) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.sqrt(dx * dx + dy * dy), px = (-dy / l) * (w / 2), py = (dx / l) * (w / 2);
  return m.face([[a[0] - px, a[1] - py, a[2]], [b[0] - px, b[1] - py, b[2]], [b[0] + px, b[1] + py, b[2]], [a[0] + px, a[1] + py, a[2]]].map((p) => p.map(r4)));
}
export function levelPoly(m, poly, z, mat = 0, down = false) {
  const q = poly.map(([x, y]) => [x, y, z]);
  return m.face(down ? q.reverse() : q, mat);
}
export function wallsOf(m, poly, z0, z1, open = () => false) {
  for (let e = 0; e < poly.length; e++) {
    if (open(e)) continue;
    const p = poly[e], q = poly[(e + 1) % poly.length];
    m.face([[q[0], q[1], z0], [p[0], p[1], z0], [p[0], p[1], z1], [q[0], q[1], z1]]);
  }
  return m;
}
export const colBox = (m, x, y, h, z0, z1) => m.box(r4(x - h), r4(y - h), z0, r4(x + h), r4(y + h), z1);
export const cube = (out, name, x, y, z, s = 0.3) => out.push(refFragMesh(name).box(r4(x - s / 2), r4(y - s / 2), z, r4(x + s / 2), r4(y + s / 2), r4(z + s)));

export function moonMirror(m, x, y, facing) {
  m.face(RINGS[12].map(([c, s]) => [r4(x + 0.36 * c), r4(y + 0.36 * s), 0]).reverse(), 0);
  sheet(m, 12, 4, (i, j) => { const [c, s] = RINGS[12][i % 12], pr = [[0.36, 0], [0.24, 0.2], [0.17, 0.5], [0.16, 1.05], [0.3, 1.2]][j]; return [x + pr[0] * c, y + pr[0] * s, pr[1]]; }, 0, { uv: (i, j, p) => [i / 12, p[2] / 2] });
  m.face(RINGS[12].map(([c, s]) => [r4(x + 0.3 * c), r4(y + 0.3 * s), 1.2]), 0);
  const nrm = unit(facing), e1 = unit(cross([0, 0, 1], nrm)), e2 = cross(nrm, e1), cen = [x - nrm[0] * 0.06, y - nrm[1] * 0.06, 1.85];
  const rim = RINGS[16].map(([c, s]) => [0, 1, 2].map((q) => r4(cen[q] + (e1[q] * c + e2[q] * s) * 0.55)));
  const back = rim.map((p) => [0, 1, 2].map((q) => r4(p[q] - nrm[q] * 0.08)));
  m.face(rim, 1);
  m.face([...back].reverse(), 0);
  for (let i = 0; i < 16; i++) m.face([rim[(i + 1) % 16], rim[i], back[i], back[(i + 1) % 16]], 0);
  tube(m, [[x, y, 1.15], [cen[0] - nrm[0] * 0.2, cen[1] - nrm[1] * 0.2, cen[2] - 0.35]], [0.07, 0.06], 8, 1);
  return m;
}

export const GLOAM = Object.freeze({ len: 28, halfW: 3.5, height: 6.5, lipNear: 5.5, lipFar: 23 });
export const GLOAM_NEAR = Object.freeze([[-3.5, 0], [3.5, 0], [4.3, 1.4], [4.6, 3.6], [4, 5.5], [-4, 5.5], [-4.6, 4.4], [-4.6, 2.2], [-4.4, 1.2]].map((p) => Object.freeze(p)));
export const GLOAM_FAR = Object.freeze([[-4, 23], [4, 23], [4.6, 24.9], [4.3, 26.6], [3.5, 28], [-3.5, 28], [-4.2, 26.8], [-4.6, 25.4], [-4.5, 24.2]].map((p) => Object.freeze(p)));
export const GLOAM_BRANCHES = Object.freeze([
  Object.freeze({ label: 'b1', x: -1.3, w: 3, y0: 6.6, y1: 9.3, top: -0.3 }),
  Object.freeze({ label: 'b2', x: 0.7, w: 3, y0: 10.4, y1: 12.8, top: -0.2 }),
  Object.freeze({ label: 'b3', x: -1, w: 3, y0: 14.6, y1: 17.2, top: -0.5 }),
  Object.freeze({ label: 'b4', x: 0.8, w: 3, y0: 19, y1: 21.8, top: 0 }),
]);
export const GLOAM_MOON = Object.freeze({ ph: 2000, beat: 550 });
const HOLLOW = Object.freeze({ y0: 2.6, y1: 3.8, h: 2.5, back: 6.2 });
const MIRROR = Object.freeze({ x: 4.95, y: 2.3 });

const WALL_W = knots([[0, 3.5], [1.2, 4.4], [2.2, 4.6], [4.4, 4.6], [5.5, 4], [6.1, 4.6], [22.4, 4.6], [23, 4], [24.2, 4.5], [25.4, 4.6], [26.8, 4.2], [28, 3.5]]);
const WALL_E = knots([[0, 3.5], [1.4, 4.3], [3.6, 4.6], [5.5, 4], [6.1, 4.6], [22.4, 4.6], [23, 4], [24.9, 4.6], [26.6, 4.3], [28, 3.5]]);
const onLanding = (y) => y <= GLOAM.lipNear + 0.3 || y >= GLOAM.lipFar - 0.3;

const TRUNKS = Object.freeze([
  [-5.3, 1, 0.8, -8.5, 8.6, -0.6, 0.25, 12, 1], [5.2, 1, 0.8, -8.5, 8.2, 0.55, 0.2, 12, 1],
  [-5.4, 1.95, 0.7, -7, 7.6, -0.45, -0.3, 8, 0], [-5.35, 4.55, 0.65, -7, 7.2, -0.5, 0.4, 8, 0],
  [5.5, 4.6, 0.75, -7.5, 7.8, 0.6, 0.3, 8, 0],
  [-3.95, 7.9, 0.55, -9.2, 7.2, -0.35, 0.2, 8, 0], [4, 7, 0.42, -9.2, 6.6, 0.4, -0.2, 8, 0],
  [3.85, 11.6, 0.55, -9.2, 7.4, 0.35, 0.3, 8, 0], [-4.05, 12.1, 0.45, -9.2, 6.8, -0.4, 0.1, 8, 0],
  [-3.9, 15.9, 0.6, -9.2, 7.6, -0.35, -0.2, 8, 0], [4.05, 16.4, 0.45, -9.2, 7.0, 0.4, 0.2, 8, 0],
  [3.9, 20.4, 0.55, -9.2, 7.2, 0.4, -0.3, 8, 0], [-4.05, 20.9, 0.42, -9.2, 6.6, -0.4, 0.2, 8, 0],
  [-5.4, 24.3, 0.7, -7, 7.4, -0.5, 0.2, 8, 0], [5.5, 25, 0.75, -7.5, 7.8, 0.55, -0.3, 8, 0],
  [-5.3, 27, 0.8, -8.5, 8.4, -0.6, -0.25, 12, 1], [5.2, 27, 0.8, -8.5, 8.8, 0.55, -0.25, 12, 1],
].map((t) => Object.freeze(t)));
const inMere = (t) => Math.abs(t[0]) < 4.6;
function trunkAt(t, z) {
  const [x, y, r, z0, zc, lx, ly] = t, h = z <= 0 ? 0 : Math.min(1, z / zc), k = h * h, wob = (hash01(31, Math.round(x * 10), Math.round(y * 10), Math.round(z * 2)) - 0.5) * 0.08;
  const rad = z >= 0 ? r * (1.12 - 0.12 * ease(z / 1.2) - 0.38 * h)
    : inMere(t) ? r * (1 + 0.12 * ease(1 + z / 3) + 0.55 * ease((z0 + 1.4 - z) / 1.4))
      : r * (0.3 + 0.7 * ease((z - z0) / -z0) + 0.12 * ease(1 + z / 3));
  return { p: [x + lx * k + wob, y + ly * k, z], r: rad };
}
const BOUGHS = Object.freeze([[5, 0], [7, 1], [9, 2], [11, 3]].map((b) => Object.freeze(b)));
function limbsOf(t, ti, L) {
  const side = Math.sign(t[0]), c = trunkAt(t, t[4] - 0.3), p0 = c.p, h = (k) => hash01(53, ti, k);
  const clampY = (y) => Math.min(L - 0.5, Math.max(0.5, y));
  const out = [];
  const limb = (tip, c1, c2, r0, segs) => { const path = bezier(p0, c1, c2, tip, segs); out.push([path, path.map((_, k) => r4(r0 * (1 - k / segs)))]); };
  const gx = 0.9 + 0.8 * h(0), dyA = (h(1) - 0.5) * 3.2, riseA = 2.2 + 1.4 * h(2);
  const tipA = [-side * gx, clampY(p0[1] + dyA), t[4] + riseA];
  limb(tipA, [p0[0] - side * 0.5, p0[1] + dyA * 0.2, p0[2] + riseA * 0.95], [tipA[0] + side * 1.6, tipA[1], tipA[2] + 0.9], c.r * 0.62, 6);
  const tipB = [p0[0] + side * (0.3 + 0.6 * h(3)), clampY(p0[1] + (h(4) - 0.5) * 2.4), t[4] + 3.4 + 1.4 * h(5)];
  limb(tipB, [p0[0], p0[1], p0[2] + 1.6], [tipB[0] - side * 0.4, tipB[1], tipB[2] - 1.2], c.r * 0.55, 4);
  if (!inMere(t)) {
    const tipC = [side * Math.min(5.7, Math.abs(p0[0]) + 0.6 + 0.4 * h(6)), clampY(p0[1] + (h(7) - 0.5) * 3), t[4] + 1.2 + 0.8 * h(8)];
    limb(tipC, [p0[0] + side * 0.3, p0[1], p0[2] + 1.0], [tipC[0] - side * 0.3, tipC[1], tipC[2] + 0.4], c.r * 0.45, 3);
  }
  return out;
}

/** @returns {ReturnType<typeof refFragMesh>[]} */
export function gloamScene() {
  const out = [];
  const add = (m) => { out.push(m); return m; };
  const { len: L, halfW: HW, height: H, lipNear: A, lipFar: B } = GLOAM;

  const land = add(refFragMesh('Landings', ['floor', 'root']));
  levelPoly(land, GLOAM_NEAR, 0); levelPoly(land, GLOAM_FAR, 0);
  const under = (y, x0, x1, dir, seed) => sheet(land, 10, 5, (i, j) => {
    const x = x0 + ((x1 - x0) * i) / 10, t = j / 5, n = fbm2(seed, x * 0.6, j * 0.9);
    return [x * (1 - 0.18 * t * t), y + dir * (t === 0 ? 0 : 0.06 + 2.6 * t * t + 0.5 * n * t), -(t === 0 ? 0 : 0.45 + 4.2 * t + 1.2 * n * t)];
  }, 1, { flip: dir > 0, uv: (i, j) => [((x0 + ((x1 - x0) * i) / 10) / 4), j / 5.4] });
  under(A, -4, 4, -1, 11); under(0, -HW, HW, 1, 12); under(B, -4, 4, 1, 13); under(L, -HW, HW, -1, 14);

  const ys = [...new Set([0, 1.2, 1.4, 2.2, HOLLOW.y0, 3.6, HOLLOW.y1, 4.4, 5.5, 6.1, 22.4, 23, 24.2, 24.9, 25.4, 26.6, 26.8, 28, ...Array.from({ length: 32 }, (_, k) => r4(k * 0.9))])].sort((a, b) => a - b);
  const zs = [-9.4, -7, -4.6, -2.8, -1.6, -0.6, 0, 0.8, 1.7, 2.5, 3.5, 4.7, 5.9, 7, 8.2];
  for (const [side, W, seed] of [[-1, WALL_W, 21], [1, WALL_E, 22]]) {
    const wall = add(refFragMesh(side < 0 ? 'Thicket_West' : 'Thicket_East', ['cobble']));
    sheet(wall, ys.length - 1, zs.length - 1, (i, j) => {
      const y = ys[i], top = j === zs.length - 1, z = top ? 7.4 + 2.4 * fbm2(seed + 5, y * 0.45, 0.5) : zs[j];
      const floorish = onLanding(y) ? 0.2 + 0.8 * ease((z - 0.4) / 1.8) : 1;
      const push = (0.06 + 1.15 * fbm2(seed, y * 0.55, z * 0.45)) * floorish + (top ? 0.4 : 0);
      return [side * (W(y) + push), y, z];
    }, 0, {
      flip: side > 0,
      uv: (i, j, p) => [p[1] / 1.25, p[2] / 1.25],
      skip: (i, j) => (onLanding(ys[i]) && onLanding(ys[i + 1]) && zs[j + 1] <= -1.6) || (side < 0 && ys[i] >= HOLLOW.y0 - 0.01 && ys[i + 1] <= HOLLOW.y1 + 0.01 && zs[j + 1] <= HOLLOW.h && zs[j] >= -0.6),
    });
  }
  const hol = add(refFragMesh('Hollow', ['floor', 'pillar', 'root']));
  hol.level(-HOLLOW.back, HOLLOW.y0, -4.6, HOLLOW.y1, 0)
    .along(-HOLLOW.back, HOLLOW.y0, HOLLOW.y1, -0.6, HOLLOW.h, 1, true)
    .across(-HOLLOW.back, -4.62, HOLLOW.y0, -0.6, HOLLOW.h, 1, true)
    .across(-HOLLOW.back, -4.62, HOLLOW.y1, -0.6, HOLLOW.h, 1)
    .level(-HOLLOW.back, HOLLOW.y0, -4.62, HOLLOW.y1, HOLLOW.h, 2, true);

  const bark = add(refFragMesh('Trunks', ['floor']));
  const silver = add(refFragMesh('Silver', ['brass']));
  const levels = (t) => [...[t[3], r4(t[3] * 0.55), -1.6, -0.2, 1, 2.8, 4.7, 6.6].filter((z) => z < t[4] - 0.6), t[4], r4(t[4] + 0.9)];
  const leaf = (p, k) => {
    const a = hash01(71, k, 0), b = hash01(71, k, 1), d = RINGS[16][Math.floor(a * 16)], dx = d[0] * 0.22, dy = d[1] * 0.22;
    const q = [[p[0] - dx, p[1] - dy, p[2]], [p[0] + 0.05 * d[1], p[1] - 0.05 * d[0], p[2] - 0.12 - 0.1 * b], [p[0] + dx, p[1] + dy, p[2]], [p[0] - 0.05 * d[1], p[1] + 0.05 * d[0], p[2] + 0.1]].map((v) => v.map(r4));
    silver.face(q); silver.face([...q].reverse());
  };
  let leaves = 0;
  TRUNKS.forEach((t, ti) => {
    const at = levels(t).map((z) => trunkAt(t, z));
    tube(bark, at.map((q) => q.p), at.map((q, k) => (k === at.length - 1 ? 0 : q.r)), t[7], 0, { vScale: 0.09, uScale: 3 });
    if (t[8]) for (const zb of [2.1, 5.2]) { const a = trunkAt(t, zb), b = trunkAt(t, zb + 0.32); tube(silver, [a.p, b.p], [a.r * 1.06, b.r * 1.06], t[7], 0, { vScale: 1, caps: false }); }
    for (const [path, radii] of limbsOf(t, ti, L)) {
      tube(bark, path, radii, 8, 0, { vScale: 0.12, uScale: 2 });
      const tip = path[path.length - 1];
      for (let k = 0; k < 3; k++) leaf([Math.max(-5.9, Math.min(5.9, tip[0] + (hash01(72, leaves, 0) - 0.5) * 0.9)), Math.min(L - 0.3, Math.max(0.3, tip[1] + (hash01(72, leaves, 1) - 0.5) * 0.9)), tip[2] - 0.15 - 0.5 * hash01(72, leaves, 2)], leaves++);
    }
    if (!inMere(t)) for (const s2 of t[8] ? [-1, 1] : [ti % 2 ? 1 : -1]) {
      const side = Math.sign(t[0]), from = trunkAt(t, -1.6), tip = [from.p[0] + side * (0.4 + 0.5 * hash01(73, ti, s2 + 1)), Math.min(L - 0.4, Math.max(0.4, from.p[1] + s2 * 0.9)), t[3] + 1.2 + 1.5 * hash01(74, ti, s2 + 1)];
      const path = bezier(from.p, [from.p[0] + side * 0.4, from.p[1] + s2 * 0.5, -2.6], [tip[0], tip[1], tip[2] + 1.5], tip, 3);
      tube(bark, path, path.map((_, k) => r4(from.r * 0.42 * (1 - k / 3))), 8, 0, { vScale: 0.12, uScale: 2 });
    }
  });
  for (const [ti, bi] of BOUGHS) {
    const t = TRUNKS[ti], b = GLOAM_BRANCHES[bi], side = Math.sign(t[0]), ym = (b.y0 + b.y1) / 2;
    const end = [b.x + side * (b.w / 2 - 0.35), ym, b.top - 0.36], from = trunkAt(t, b.top - 3.2).p;
    const path = bezier(from, [from[0] - side * 0.2, from[1], b.top - 1.3], [end[0] + side * 0.9, ym, end[2] - 0.12], end, 7);
    tube(bark, path, path.map((_, k) => r4(0.44 - 0.24 * (k / 7))), 8, 0, { vScale: 0.12, uScale: 2 });
  }

  add(refFragMesh('Mere', ['molten'])).level(-4.6, A, 0, B, -9.2).level(0, A, 4.6, B, -9.2);

  moonMirror(add(refFragMesh('Moon_Mirror', ['pillar', 'brass'])), MIRROR.x, MIRROR.y, [-0.78, 0.55, 0.3]);

  const edge = add(refFragMesh('Edge_Lines', ['edge']));
  edge.level(-HW, 0, HW, 0.12, 0.01).level(-4, A - 0.12, 4, A, 0.01).level(-4, B, 4, B + 0.12, 0.01).level(-HW, L - 0.12, HW, L, 0.01);

  add(refFragMesh('socket.in')).across(-HW, HW, 0, 0, H);
  add(refFragMesh('socket.out.main')).across(-HW, HW, L, 0, H, 0, true);
  levelPoly(add(refFragMesh('floor.fight.near')), GLOAM_NEAR, 0);
  levelPoly(add(refFragMesh('floor.fight.far')), GLOAM_FAR, 0);
  add(refFragMesh('open.mouth')).box(-HW - 0.1, -0.05, -0.05, HW + 0.1, 0.05, 0.05);
  add(refFragMesh('open.lipnear')).box(-4.1, A - 0.05, -0.05, 4.1, A + 0.05, 0.05);
  add(refFragMesh('open.lipfar')).box(-4.1, B - 0.05, -0.05, 4.1, B + 0.05, 0.05);
  add(refFragMesh('open.exit')).box(-HW - 0.1, L - 0.05, -0.05, HW + 0.1, L, 0.05);
  for (const b of GLOAM_BRANCHES) add(refFragMesh(`course.moon.${b.label}.ph${GLOAM_MOON.ph}.beat${GLOAM_MOON.beat}`)).box(r4(b.x - b.w / 2), b.y0, r4(b.top - 0.6), r4(b.x + b.w / 2), b.y1, b.top);
  const N = { mouth: [0, 0.8], nw: [-2.5, 2.8], ne: [2.4, 2.6], lipnear: [0, 4.7], lipfar: [0, 23.8], fw: [-2.4, 25.4], fe: [2.5, 25.6], exit: [0, 27.2] };
  for (const [k, p] of Object.entries(N)) add(refFragMesh(`node.${k}`)).disc(p[0], p[1], 0, 0.5);
  for (const [a, b] of [['mouth', 'nw'], ['mouth', 'ne'], ['nw', 'ne'], ['nw', 'lipnear'], ['ne', 'lipnear'], ['lipfar', 'fw'], ['lipfar', 'fe'], ['fw', 'fe'], ['fw', 'exit'], ['fe', 'exit']]) strip(add(refFragMesh(`edge.${a}-${b}`)), [...N[a], 0], [...N[b], 0], 0.2);
  cube(out, 'anchor.lurker.near', 3.6, 3.2, 0);
  cube(out, 'anchor.lurker.far', -3.7, 25.6, 0);
  cube(out, 'anchor.caster.far', 3.2, 26.2, 0);
  cube(out, 'anchor.niche.far', -3.4, 24.4, 0);
  cube(out, 'anchor.engine.mirror', MIRROR.x, MIRROR.y, 0);
  add(refFragMesh('alcove.seam.shard.hollow')).box(-6, HOLLOW.y0 + 0.1, 0, -4.8, HOLLOW.y1 - 0.1, 2.2);
  cube(out, 'light.moon.near', 0, 2.8, 7, 0.2);
  cube(out, 'light.moon.chasm', 0, 14.2, 8, 0.2);
  cube(out, 'light.moon.far', 0, 25.4, 7, 0.2);
  const col = add(refFragMesh('collider.proxy'));
  levelPoly(col, GLOAM_NEAR, 0); levelPoly(col, GLOAM_FAR, 0);
  wallsOf(col, GLOAM_NEAR, 0, H, (e) => e === 0 || e === 4);
  wallsOf(col, GLOAM_FAR, 0, H, (e) => e === 0 || e === 4);
  for (const side of [-1, 1]) {
    const run = [[4, A], [4.6, 6.1], [4.6, 22.4], [4, B]].map(([x, y]) => [side * x, y]);
    for (let k = 0; k + 1 < run.length; k++) { const [p, q] = side < 0 ? [run[k], run[k + 1]] : [run[k + 1], run[k]]; col.face([[q[0], q[1], -9.2], [p[0], p[1], -9.2], [p[0], p[1], H], [q[0], q[1], H]]); }
  }
  col.across(-4, 4, A, -3, 0, 0, true).across(-4, 4, B, -3, 0);
  for (const t of TRUNKS) if (Math.abs(t[0]) < 4.6) colBox(col, t[0], t[1], t[2], -9.2, 9);
  return out;
}

export const writeGloamFbx = (scene = gloamScene()) => writeRefFragFbx(scene);

if (isMain(import.meta.url)) {
  const out = resolve(process.argv.slice(2).find((a) => a.startsWith('--out='))?.slice(6) ?? resolve(ROOT, GLOAM_FBX));
  const bytes = writeGloamFbx();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes);
  console.log(`${out}: ${gloamScene().length} objects, ${bytes.length} bytes`);
}
