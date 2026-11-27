// Writes the Eclipse Vault hero chamber from numbers alone as an .fbx for tools/bakeEgHeroEclipse.mjs.
// Run: node tools/egHeroEclipseScene.mjs [--out=src/assets/egfrags/source/egheroEclipse.fbx]
// Only exact arithmetic is used (see tools/egHeroKit.mjs), so every run writes the same bytes.
// It replaces egFragChamber('eclipse') in src/net/eliteGates/egFragLaw.js, so its mouth and exits must match.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { refFragMesh, writeRefFragFbx } from './egRefFragScene.mjs';
import { RINGS, r4, unit, fbm2, hash01, sweep } from './egHeroKit.mjs';
import { sheet, tube, strip, levelPoly, cube, moonMirror } from './egHeroGloamScene.mjs';
import { ROOT } from './shipBake.mjs';
import { isMain } from './lib/isMain.mjs';

export const ECLIPSE_FBX = 'src/assets/egfrags/source/egheroEclipse.fbx';

export const ECLIPSE = Object.freeze({ R: 16, cy: 20, len: 40, gateHW: 3, gateH: 7, up: 3.5, vault: 10, stairW: 3, ring: 9, slot0: 7, slot1: 11.2 });
const { R, cy: CY, len: LEN, gateHW: GW, gateH: GH, up: UP, vault: VAULT, stairW: SW } = ECLIPSE;
const RG = RINGS[24];
const sq = (v) => v * v;
const rim = (k, r = R) => { const [c, s] = RG[((k % 24) + 24) % 24]; return [r4(r * c), r4(CY + r * s)]; };
const turn = ([x, y, ...z]) => [-x + 0, r4(2 * CY - y), ...z];
const yG = (() => { const a = rim(17), b = rim(18), t = (-GW - a[0]) / (b[0] - a[0]); return r4(a[1] + (b[1] - a[1]) * t); })();

export const ECLIPSE_FLOOR = Object.freeze(Array.from({ length: 24 }, (_, k) => (k === 18 ? [[-GW, yG], [GW, yG]] : k === 6 ? [[GW, r4(2 * CY - yG)], [-GW, r4(2 * CY - yG)]] : k === 22 || k === 10 ? [] : [rim(k)])).flat().map((p) => Object.freeze(p)));
export const ECLIPSE_MOUTH = Object.freeze([[-GW, 0], [GW, 0], [GW, yG], [-GW, yG]].map((p) => Object.freeze(p)));
export const ECLIPSE_EXIT = Object.freeze(ECLIPSE_MOUTH.map((p) => Object.freeze(turn(p))));
const D = (() => { const a = rim(21), b = rim(23), l = Math.sqrt(sq(b[0] - a[0]) + sq(b[1] - a[1])); return { a, b, l, d: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] }; })();
const OUT = [D.d[1], -D.d[0]];
const st = (s, w) => [r4(D.a[0] + D.d[0] * s + OUT[0] * w), r4(D.a[1] + D.d[1] * s + OUT[1] * w)];
export const ECLIPSE_STAIR_E = Object.freeze([[...st(0, 0), 0], [...st(0, SW), 0], [...st(D.l, SW), UP], [...st(D.l, 0), UP]].map((p) => Object.freeze(p)));
export const ECLIPSE_STAIR_W = Object.freeze(ECLIPSE_STAIR_E.map((p) => Object.freeze(turn(p))));
export const ECLIPSE_GALLERY_E = Object.freeze([rim(23), st(D.l, SW), [19.4, 15.6], [19.4, 23.4], [17.6, 25.4], rim(1), rim(0)].map((p) => Object.freeze(p)));
export const ECLIPSE_GALLERY_W = Object.freeze(ECLIPSE_GALLERY_E.map((p) => Object.freeze(turn(p))));
const MIRROR_K = 4, ALCOVE_K = 14;

const PATH_E = Object.freeze([[GW, 0], [GW, yG], rim(19), rim(20), rim(21), st(0, SW), st(D.l, SW), [19.4, 15.6], [19.4, 23.4], [17.6, 25.4], rim(1), rim(2), rim(3), rim(4), rim(5), [GW, r4(2 * CY - yG)], [GW, LEN]]);
function wallColumns(path, recess) {
  const segN = path.slice(0, -1).map((p, i) => { const q = path[i + 1], l = Math.sqrt(sq(q[0] - p[0]) + sq(q[1] - p[1])); return [(q[1] - p[1]) / l, -(q[0] - p[0]) / l, l]; });
  const cols = [];
  let s = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const p = path[i], q = path[i + 1], [nx, ny, l] = segN[i], n = Math.max(1, Math.ceil(l / 1.6));
    const ts = Array.from({ length: n }, (_, k) => k / n);
    if (recess.some((r) => r[0] === p[0] && r[1] === p[1])) ts.push(1 / l);
    if (recess.some((r) => r[0] === q[0] && r[1] === q[1])) ts.push(1 - 1 / l);
    for (const t of [...new Set(ts)].sort((a, b) => a - b)) {
      const corner = t === 0 && i > 0, pn = corner ? segN[i - 1] : [nx, ny];
      const nn = unit([pn[0] + nx, pn[1] + ny, 0]);
      cols.push({ x: r4(p[0] + (q[0] - p[0]) * t), y: r4(p[1] + (q[1] - p[1]) * t), n: corner ? nn : [nx, ny, 0], s: r4(s + l * t) });
    }
    s += l;
  }
  const last = path[path.length - 1], [nx, ny] = segN[segN.length - 1];
  cols.push({ x: last[0], y: last[1], n: [nx, ny, 0], s: r4(s) });
  return cols;
}
const DOME_LOW = Object.freeze([[16.6, 10.6], [16.1, 12], [15.2, 13.4], [13.9, 14.6], [12.5, 15.5], [ECLIPSE.slot1, 16.1]].map((p) => Object.freeze(p)));
const DOME_CAP = Object.freeze([[ECLIPSE.slot0, 17.6], [5.6, 18.4], [4, 19], [2.2, 19.4], [0.9, 19.55]].map((p) => Object.freeze(p)));
const EXT_E = Object.freeze([[4.5, 0], rim(19, 18.1), rim(20, 18.1), st(0, SW + 1.5), st(D.l, SW + 1.5), [20.9, 15.2], [20.9, 23.8], [18.4, 26.6], rim(2, 18.1), rim(3, 18.1), rim(4, 18.1), rim(5, 18.1), [4.5, LEN]].map((p) => Object.freeze(p)));
const thick = (prof, k, t) => { const a = prof[Math.max(0, k - 1)], b = prof[Math.min(prof.length - 1, k + 1)], dr = b[0] - a[0], dz = b[1] - a[1], l = Math.sqrt(dr * dr + dz * dz); return [prof[k][0] + (dz / l) * t, prof[k][1] - (dr / l) * t]; };

/** @returns {ReturnType<typeof refFragMesh>[]} */
export function eclipseScene() {
  const out = [];
  const add = (m) => { out.push(m); return m; };
  const at24 = (k, r, z) => { const [c, s] = RG[((k % 24) + 24) % 24]; return [r4(r * c), r4(CY + r * s), z]; };

  const fl = add(refFragMesh('Floor', ['arena', 'brass', 'pillar', 'floor']));
  const ring = (r0, r1, mat) => sheet(fl, 24, 1, (i, j) => at24(i, j ? r0 : r1, 0), mat, { uv: (i, j) => [r4(i * 0.1309 * ((r0 + r1) / 2)), j ? 0 : r4((r1 - r0) / 2)] });
  levelPoly(fl, RG.map(([c, s]) => [r4(2.2 * c), r4(CY + 2.2 * s)]), 0, 2);
  for (const [r0, r1, mat] of [[2.2, 2.55, 1], [2.55, 5.6, 0], [5.6, 8.85, 0], [8.85, 9.15, 1], [9.15, 12.4, 0]]) ring(r0, r1, mat);
  const outer = (k) => (k === 18 ? [[-GW, yG], [GW, yG]] : k === 6 ? [[GW, r4(2 * CY - yG)], [-GW, r4(2 * CY - yG)]] : [rim(k)]);
  const ring12 = (k) => at24(k, 12.4, 0).slice(0, 2);
  for (let k = 0; k < 24; k++) {
    if (k === 22 || k === 10) continue;
    if (k === 21 || k === 9) { levelPoly(fl, [ring12(k), rim(k), rim(k + 2), ring12(k + 2), ring12(k + 1)], 0); continue; }
    const o1 = outer((k + 1) % 24), o0 = outer(k);
    levelPoly(fl, [ring12(k), o0[o0.length - 1], o1[0], ring12(k + 1)], 0);
    if (k + 1 === 18 || k + 1 === 6) levelPoly(fl, [o1[0], o1[1], ring12(k + 1)], 0);
  }
  levelPoly(fl, ECLIPSE_MOUTH, 0, 3); levelPoly(fl, ECLIPSE_EXIT, 0, 3);

  const gal = add(refFragMesh('Galleries', ['floor', 'pillar', 'cobble', 'brass']));
  const STEPS = 14, run = D.l / STEPS, rise = UP / STEPS;
  for (const [G, flip] of [[ECLIPSE_GALLERY_E, false], [ECLIPSE_GALLERY_W, true]]) {
    levelPoly(gal, G, UP);
    for (const [a, b] of [[G[5], G[6]], [G[6], G[0]]]) {
      gal.face([[a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], UP - 0.3], [a[0], a[1], UP - 0.3]].map((p) => p.map(r4)), 1);
      gal.face([[a[0], a[1], UP - 0.3], [b[0], b[1], UP - 0.3], [b[0], b[1], UP], [a[0], a[1], UP]].map((p) => p.map(r4)), 3);
    }
    const P = (s, w, z) => { const q = st(s, w), v = [...q, z]; return flip ? turn(v) : v; };
    for (let j = 0; j < STEPS; j++) {
      const s0 = j * run, s1 = (j + 1) * run, z = j * rise;
      gal.face([P(s0, 0, z), P(s0, SW, z), P(s1, SW, z), P(s1, 0, z)], 2);
      if (j) gal.face([P(s0, 0, z - rise), P(s0, SW, z - rise), P(s0, SW, z), P(s0, 0, z)], 1);
    }
    gal.face([P(D.l, 0, UP - rise), P(D.l, SW, UP - rise), P(D.l, SW, UP), P(D.l, 0, UP)], 1);
    for (let j = 1; j < STEPS; j++) gal.face([[j * run, 0], [(j + 1) * run, 0], [(j + 1) * run, j * rise], [j * run, j * rise]].map(([q, z]) => P(q, 0, r4(z))).reverse(), 1);
    const slope = (q) => (UP * q) / D.l;
    gal.face([[0.9, slope(0.9) - 0.32], [D.l, UP - 0.32], [D.l, UP - 0.02], [0.9, slope(0.9) - 0.02]].map(([q, z]) => P(q, -0.01, r4(z))).reverse(), 3);
  }

  const wall = add(refFragMesh('Walls', ['pillar', 'root']));
  const zs = [-0.6, 0, 1.1, 2.2, 3.2, 4.4, 5.6, 6.8, 8, 9.2, 10.6];
  for (const [path, recess, seed] of [[PATH_E, [rim(MIRROR_K)], 41], [PATH_E.map((p) => turn(p)), [rim(ALCOVE_K)], 42]]) {
    const cols = wallColumns(path, recess), holes = [];
    for (const r of recess) { const i = cols.findIndex((c) => c.x === r[0] && c.y === r[1]); if (i > 0) holes.push(i - 1, i); }
    sheet(wall, cols.length - 1, zs.length - 1, (i, j) => { const c = cols[i], z = zs[j], push = j < 2 ? 0.02 : 0.04 + 0.32 * fbm2(seed, c.s * 0.5, z * 0.45) + (j === zs.length - 1 ? 0.1 : 0); return [c.x + c.n[0] * push, c.y + c.n[1] * push, z]; }, 0, {
      flip: true, uv: (i, j) => [cols[i].s / 2, zs[j] / 2],
      skip: (i, j) => holes.includes(i) && zs[j + 1] <= 3.2,
    });
  }
  for (const flip of [false, true]) {
    const ext = EXT_E.map((p) => (flip ? turn(p) : p));
    let s0 = 0;
    const us = ext.map((p, i) => (i ? (s0 += Math.sqrt(sq(p[0] - ext[i - 1][0]) + sq(p[1] - ext[i - 1][1]))) : 0));
    sheet(wall, ext.length - 1, 1, (i, j) => [ext[i][0], ext[i][1], j ? 10.84 : -0.6], 0, { uv: (i, j) => [r4(us[i] / 2), j ? 5.72 : 0] });
  }
  const rec = add(refFragMesh('Recesses', ['floor', 'pillar', 'root']));
  for (const k of [MIRROR_K, ALCOVE_K]) {
    const [c, s] = RG[k], E = (r, t, z) => [r4(r * c - t * s), r4(CY + r * s + t * c), z];
    rec.face([E(16.02, -1, 0), E(17.9, -1, 0), E(17.9, 1, 0), E(16.02, 1, 0)], 0)
      .face([E(17.9, -1, -0.6), E(17.9, 1, -0.6), E(17.9, 1, 3.2), E(17.9, -1, 3.2)].reverse(), 1)
      .face([E(16.05, -1, -0.6), E(17.9, -1, -0.6), E(17.9, -1, 3.2), E(16.05, -1, 3.2)].reverse(), 1)
      .face([E(16.05, 1, -0.6), E(17.9, 1, -0.6), E(17.9, 1, 3.2), E(16.05, 1, 3.2)], 1)
      .face([E(16.05, -1, 3.2), E(17.9, -1, 3.2), E(17.9, 1, 3.2), E(16.05, 1, 3.2)].reverse(), 2);
  }

  const gate = add(refFragMesh('Gatehouses', ['pillar', 'root']));
  const ARCH = [[-GW, GH], [-2.6, 8], [-1.8, 8.9], [-0.9, 9.4], [0, 9.7], [0.9, 9.4], [1.8, 8.9], [2.6, 8], [GW, GH]];
  for (const flip of [false, true]) {
    const Pg = (x, y, z) => (flip ? turn([x, y, z]) : [x, y, z]);
    gate.face([[-4.5, -0.6], [-GW, -0.6], ...ARCH, [GW, -0.6], [4.5, -0.6], [4.5, 11.2], [-4.5, 11.2]].map(([x, z]) => Pg(x, 0, z)), 0);
    gate.face([...ARCH, [GW, 10.6], [-GW, 10.6]].map(([x, z]) => Pg(x, yG, z)).reverse(), 0);
    sheet(gate, ARCH.length - 1, 1, (i, j) => Pg(ARCH[i][0], j ? yG : 0, ARCH[i][1]), 1, { flip: true, uv: (i, j) => [i / 4, j ? r4(yG / 2) : 0] });
    gate.face([[-4.5, 0], [4.5, 0], [4.5, yG + 0.6], [-4.5, yG + 0.6]].map(([x, y]) => Pg(x, y, 11.2)), 0);
  }
  for (const flip of [false, true]) {
    const T = (p) => (flip ? turn(p) : p);
    const bay = [rim(21), st(0, SW), st(D.l, SW), [19.4, 15.6], [19.4, 23.4], [17.6, 25.4], rim(1), rim(0), rim(23), rim(22)].map(T);
    levelPoly(gate, bay, 10.6, 1, true);
    levelPoly(gate, bay, 10.84, 0);
  }
  sheet(gate, 24, 1, (i, j) => at24(i, j ? 15.9 : 17.7, 10.55), 0, { flip: true, uv: (i, j) => [i / 2, j * 0.9] });
  sheet(gate, 24, 1, (i, j) => at24(i, j ? 17.1 : 18.2, 10.84), 0, { uv: (i, j) => [i / 2, j * 0.55] });

  const colm = add(refFragMesh('Columns', ['floor', 'brass']));
  const shaft = [[0.68, -0.6], [0.68, 0.35], [0.52, 0.5], [0.46, 0.7], [0.44, 9.4]], capital = [[0.44, 9.4], [0.52, 9.7], [0.7, 10.2], [0.74, 10.6]];
  const lathe12 = (x, y, prof, mat, sc) => sheet(colm, 12, prof.length - 1, (i, j) => { const [c, s] = RINGS[12][i % 12]; return [x + prof[j][0] * sc * c, y + prof[j][0] * sc * s, prof[j][1]]; }, mat, { uv: (i, j) => [(i * 3) / 12, prof[j][1] / 10] });
  const COLS = [19, 3, 5, 7, 15, 17].map((k) => at24(k, 16.72, 0)).concat([[3.62, 3.82], [-3.62, 3.82]].flatMap((p) => [p, turn(p)]));
  COLS.forEach((p, n) => { const sc = n < 6 ? 1 : 0.8; lathe12(p[0], p[1], shaft, 0, sc); lathe12(p[0], p[1], capital, 1, sc); });

  const dome = add(refFragMesh('Dome', ['root', 'brass', 'pillar']));
  const rev = (prof, mat, flip, thick0 = 0) => sheet(dome, 24, prof.length - 1, (i, j) => { const p = thick0 ? thick(prof, j, thick0) : prof[j]; return at24(i, p[0], p[1]); }, mat, { flip, uv: (i, j) => [(i * 6) / 24, j / (prof.length - 1)] });
  rev(DOME_LOW, 0, true); rev(DOME_CAP, 0, true);
  rev(DOME_LOW, 0, false, 0.7); rev(DOME_CAP, 0, false, 0.7);
  const lip = (prof, k, mat, flip) => sheet(dome, 24, 1, (i, j) => { const p = j ? thick(prof, k, 0.7) : prof[k]; return at24(i, p[0], p[1]); }, mat, { flip, uv: (i, j) => [(i * 6) / 24, j * 0.35] });
  lip(DOME_LOW, DOME_LOW.length - 1, 1, true); lip(DOME_CAP, 0, 1, false);
  levelPoly(dome, RG.map(([c, s]) => [r4(0.9 * c), r4(CY + 0.9 * s)]), 19.55, 0, true);
  { const [cr, cz] = thick(DOME_CAP, DOME_CAP.length - 1, 0.7); levelPoly(dome, RG.map(([c, s]) => [r4(cr * c), r4(CY + cr * s)]), r4(cz), 0); }
  for (let k = 0; k < 24; k++) {
    const h = hash01(81, k, 0), [x, y] = at24(k, ECLIPSE.slot1 + 0.15 + 0.2 * h, 0), z = 15.75 - 0.5 * hash01(81, k, 1), [c, s2] = RG[(k + 6) % 24];
    const q = [[x - 0.2 * c, y - 0.2 * s2, z], [x, y, z - 0.35], [x + 0.2 * c, y + 0.2 * s2, z], [x, y, z + 0.1]].map((v) => v.map(r4));
    dome.face(q, 1); dome.face([...q].reverse(), 1);
  }
  const RIB = [[-0.17, -0.22], [0.17, -0.22], [0.17, 0.22], [-0.17, 0.22]];
  for (let k = 1; k < 24; k += 2) {
    const prof = [...DOME_LOW.map((p, j) => thick(DOME_LOW, j, -0.22)), ...DOME_CAP.slice(0, 3).map((p, j) => thick(DOME_CAP, j, -0.22))];
    sweep(dome, prof.map(([r, z]) => at24(k, r, z)), RIB, 2);
  }

  const ecl = add(refFragMesh('Eclipse', ['pillar', 'brass']));
  const discAt = (r, z) => RG.map(([c, s]) => [r4(r * c), r4(CY + r * s), z]);
  ecl.face([...discAt(2.6, 14)].reverse(), 0).face(discAt(2.6, 14.25), 0);
  sheet(ecl, 24, 1, (i, j) => at24(i, j ? 2.6 : 3.5, 14.1), 1, { uv: (i, j) => [i / 4, j * 0.45] });
  sheet(ecl, 24, 1, (i, j) => at24(i, j ? 3.5 : 2.6, 14.14), 1, { uv: (i, j) => [i / 4, j * 0.45] });
  sheet(ecl, 24, 1, (i, j) => at24(i, 2.6, j ? 14.25 : 14), 0, { uv: (i, j) => [i / 4, j * 0.12] });
  for (const k of [6, 14, 22]) tube(ecl, [at24(k, 2.4, 14.2), at24(k, 2.3, 19.3)], [0.05, 0.05], 8, 1, { vScale: 1 });

  const und = add(refFragMesh('Underside', ['root']));
  const UNDER = [[18.1, -0.6], [16.4, -2.4], [13.4, -4.4], [9.8, -6.3], [5.6, -7.9], [1.9, -9.1]];
  sheet(und, 24, UNDER.length - 1, (i, j) => { const n = j && j < UNDER.length - 1 ? fbm2(43, i * 0.7, j * 0.9) : 0, r = UNDER[j][0] * (1 + 0.08 * n), z = UNDER[j][1] - 0.9 * n; return at24(i, r, z); }, 0, { flip: true, uv: (i, j) => [(i * 6) / 24, j / 5.4] });
  levelPoly(und, RG.map(([c, s]) => [r4(1.9 * c), r4(CY + 1.9 * s)]), -9.1, 0, true);
  for (const flip of [false, true]) {
    const T = (p) => (flip ? turn(p) : p);
    levelPoly(und, [rim(20, 18.1), st(0, SW + 1.5), st(D.l, SW + 1.5), [20.9, 15.2], [20.9, 23.8], [18.4, 26.6], rim(2, 18.1), rim(1, 18.1), rim(0, 18.1), rim(23, 18.1), rim(22, 18.1), rim(21, 18.1)].map(T), -0.6, 0, true);
    levelPoly(und, [[-4.5, 0], [4.5, 0], rim(19, 18.1), rim(18, 18.1), rim(17, 18.1)].map(T), -0.6, 0, true);
  }

  { const [c, s] = RG[MIRROR_K]; moonMirror(add(refFragMesh('Moon_Mirror', ['pillar', 'brass'])), r4(17.05 * c), r4(CY + 17.05 * s), [-c * 0.8, -s * 0.8, 0.5]); }

  const edge = add(refFragMesh('Edge_Lines', ['edge']));
  edge.level(-GW, 0, GW, 0.12, 0.01).level(-GW, LEN - 0.12, GW, LEN, 0.01);
  for (const [G, flip] of [[ECLIPSE_GALLERY_E, false], [ECLIPSE_GALLERY_W, true]]) {
    for (const [a, b] of [[G[5], G[6]], [G[6], G[0]]]) {
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.sqrt(dx * dx + dy * dy), nx = (-dy / l) * 0.12, ny = (dx / l) * 0.12;
      edge.face([[a[0], a[1], UP + 0.01], [b[0], b[1], UP + 0.01], [b[0] + nx, b[1] + ny, UP + 0.01], [a[0] + nx, a[1] + ny, UP + 0.01]].map((p) => p.map(r4)));
    }
    const P = (s, w, z) => { const v = [...st(s, w), z]; return flip ? turn(v) : v; };
    for (let j = 0; j < STEPS; j++) edge.face([P(j * run, 0, j * rise + 0.01), P(j * run, 0.12, j * rise + 0.01), P((j + 1) * run, 0.12, j * rise + 0.01), P((j + 1) * run, 0, j * rise + 0.01)].map((p) => p.map(r4)));
  }

  add(refFragMesh('socket.in')).across(-GW, GW, 0, 0, GH);
  add(refFragMesh('socket.out.main')).across(-GW, GW, LEN, 0, GH, 0, true);
  levelPoly(add(refFragMesh('floor.fight.vault')), ECLIPSE_FLOOR, 0);
  levelPoly(add(refFragMesh('floor.fight.east')), ECLIPSE_GALLERY_E, UP);
  levelPoly(add(refFragMesh('floor.fight.west')), ECLIPSE_GALLERY_W, UP);
  levelPoly(add(refFragMesh('floor.mouth')), ECLIPSE_MOUTH, 0);
  levelPoly(add(refFragMesh('floor.exit')), ECLIPSE_EXIT, 0);
  add(refFragMesh('ramp.east')).face(ECLIPSE_STAIR_E.map((p) => [...p]));
  add(refFragMesh('ramp.west')).face(ECLIPSE_STAIR_W.map((p) => [...p]));
  add(refFragMesh('ceil.vault')).level(-20, yG, 20, r4(2 * CY - yG), VAULT, 0, true);
  add(refFragMesh('ceil.mouth')).level(-GW, 0, GW, yG, GH, 0, true);
  add(refFragMesh('ceil.exit')).level(-GW, r4(2 * CY - yG), GW, LEN, GH, 0, true);
  const box = (name, pts, z) => { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); add(refFragMesh(name)).box(r4(Math.min(...xs) - 0.05), r4(Math.min(...ys) - 0.05), r4(z - 0.05), r4(Math.max(...xs) + 0.05), r4(Math.max(...ys) + 0.05), r4(z + 0.05)); };
  box('open.mouth', [[-GW, 0], [GW, 0]], 0);
  box('open.exit', [[-GW, LEN], [GW, LEN]], 0);
  for (const [tag, G, S] of [['east', ECLIPSE_GALLERY_E, ECLIPSE_STAIR_E], ['west', ECLIPSE_GALLERY_W, ECLIPSE_STAIR_W]]) {
    box(`open.${tag}front1`, [G[5], G[6]], UP);
    box(`open.${tag}front2`, [G[6], G[0]], UP);
    box(`open.${tag}stairhead`, [G[0], G[1]], UP);
    box(`open.${tag}stairfoot`, [S[0], S[3]], 0);
  }
  add(refFragMesh('hazard.eclipse.moon.ph12000')).disc(0, CY, 0, ECLIPSE.ring);
  const N = { mid: [0, CY, 0], mouth: [0, 2.2, 0], exit: [0, r4(LEN - 2.2), 0] };
  for (let q = 0; q < 8; q++) { const [x, y] = at24(q * 3, 11); N[`r${q}`] = [x, y, 0]; }
  const sFoot = at24(21, 14.4, 0), s1 = [...st(2.4, SW / 2), r4((UP * 2.4) / D.l)], s2 = [...st(6.4, SW / 2), r4((UP * 6.4) / D.l)], sTop = [17.8, 19, UP];
  Object.assign(N, { efoot: sFoot, eflight: s1, eflight2: s2, egal: sTop, wfoot: turn(sFoot), wflight: turn(s1), wflight2: turn(s2), wgal: turn(sTop) });
  for (const [k, p] of Object.entries(N)) add(refFragMesh(`node.${k}`)).disc(p[0], p[1], p[2], 0.5);
  const E = [['mouth', 'r6'], ['exit', 'r2'], ...Array.from({ length: 8 }, (_, q) => [`r${q}`, `r${(q + 1) % 8}`]), ...[0, 2, 4, 6].map((q) => ['mid', `r${q}`]), ['efoot', 'r7'], ['efoot', 'r6'], ['efoot', 'eflight'], ['eflight', 'eflight2'], ['eflight2', 'egal'], ['wfoot', 'r3'], ['wfoot', 'r2'], ['wfoot', 'wflight'], ['wflight', 'wflight2'], ['wflight2', 'wgal']];
  for (const [a, b] of E) strip(add(refFragMesh(`edge.${a}-${b}`)), N[a], N[b], 0.2);
  for (const [k, n] of [[2, 'ne'], [8, 'nw'], [16, 'sw'], [20, 'se']]) { const [x, y] = at24(k, 15.55, 0); cube(out, `anchor.rift.${n}`, x, y, 1); }
  for (const [k, n] of [[5, 'north'], [17, 'south']]) { const [x, y] = at24(k, 14.4, 0); cube(out, `anchor.lurker.${n}`, x, y, 0); }
  cube(out, 'anchor.caster.east', 18.2, CY, UP);
  cube(out, 'anchor.caster.west', -18.2, CY, UP);
  { const [x, y] = at24(0, 14.6, 0); cube(out, 'anchor.niche.mage', x, y, 0); }
  { const [c, s] = RG[MIRROR_K]; cube(out, 'anchor.engine.mirror', r4(17.05 * c), r4(CY + 17.05 * s), 0); }
  { const [c, s] = RG[ALCOVE_K]; add(refFragMesh('alcove.seam.page.annals')).box(r4(17.0 * c - 0.5), r4(CY + 17.0 * s - 0.5), 0, r4(17.0 * c + 0.5), r4(CY + 17.0 * s + 0.5), 2.2); }
  for (const [k, n] of [[6, 'north'], [14, 'west'], [22, 'east']]) { const [x, y] = at24(k, ECLIPSE.ring, 0); cube(out, `light.moon.${n}`, x, y, 8.4, 0.2); }
  cube(out, 'light.band.eclipse', 0, CY, 12.4, 0.2);
  const col = add(refFragMesh('collider.proxy'));
  levelPoly(col, ECLIPSE_FLOOR, 0); levelPoly(col, ECLIPSE_MOUTH, 0); levelPoly(col, ECLIPSE_EXIT, 0);
  levelPoly(col, ECLIPSE_GALLERY_E, UP); levelPoly(col, ECLIPSE_GALLERY_W, UP);
  col.face(ECLIPSE_STAIR_E.map((p) => [...p])); col.face(ECLIPSE_STAIR_W.map((p) => [...p]));
  for (const path of [PATH_E, PATH_E.map((p) => turn(p))]) for (let i = 0; i + 1 < path.length; i++) { const p = path[i], q = path[i + 1]; col.face([[q[0], q[1], 0], [p[0], p[1], 0], [p[0], p[1], VAULT], [q[0], q[1], VAULT]]); }
  for (const G of [ECLIPSE_GALLERY_E, ECLIPSE_GALLERY_W]) for (const [a, b] of [[G[5], G[6]], [G[6], G[0]]]) col.face([[a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], UP], [a[0], a[1], UP]]);
  for (const S of [ECLIPSE_STAIR_E, ECLIPSE_STAIR_W]) col.face([[S[0][0], S[0][1], 0], [S[3][0], S[3][1], UP], [S[3][0], S[3][1], 0]]);
  col.level(-20, yG, 20, r4(2 * CY - yG), VAULT, 0, true).level(-GW, 0, GW, yG, GH, 0, true).level(-GW, r4(2 * CY - yG), GW, LEN, GH, 0, true);
  return out;
}

export const writeEclipseFbx = (scene = eclipseScene()) => writeRefFragFbx(scene);

if (isMain(import.meta.url)) {
  const out = resolve(process.argv.slice(2).find((a) => a.startsWith('--out='))?.slice(6) ?? resolve(ROOT, ECLIPSE_FBX));
  const bytes = writeEclipseFbx();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes);
  console.log(`${out}: ${eclipseScene().length} objects, ${bytes.length} bytes`);
}
