// Writes the Ossuary hero passage from numbers alone as an .fbx for tools/bakeEgHeroOssuary.mjs.
// Run: node tools/egHeroOssuaryScene.mjs [--out=src/assets/egfrags/source/egheroOssuary.fbx]
// Only exact arithmetic is used (see tools/egHeroKit.mjs), so every run writes the same bytes.
// It replaces egFragPassage('ossuary') in src/net/eliteGates/egFragLaw.js, so its mouth and exits must match.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { refFragMesh, writeRefFragFbx } from './egRefFragScene.mjs';
import { RINGS, r4, fbm2, hash01, grid, lathe, sweep, onSide, boxOn, faceTo, octahedron, cuts, walkStrip } from './egHeroKit.mjs';
import { ROOT } from './shipBake.mjs';
import { isMain } from './lib/isMain.mjs';

export const OSSUARY_FBX = 'src/assets/egfrags/source/egheroOssuary.fbx';

export const OSSUARY = Object.freeze({
  W: 3, LEN: 28, ZA: 9, ZB: 19, CEIL: 5.6, SPRING: 5.9, WALL: 3.05, PX: 3.6, BACK: 4.35, PLINTH: 0.9, SOFFIT: 3.95, DEEP: -9,
  PILLARS: Object.freeze([Object.freeze([0.6, 4.5, 8.4]), Object.freeze([19.6, 23.5, 27.4])]),
  BONES: Object.freeze([Object.freeze([9.7, 12.1]), Object.freeze([12.8, 15.2]), Object.freeze([15.9, 18.3])]), BONE_W: 2.6,
  HOLE: Object.freeze([10, 18]),
});
const { W, LEN, ZA, ZB, CEIL, SPRING, WALL, PX, BACK, PLINTH, SOFFIT, DEEP } = OSSUARY;
const [HOLE0, HOLE1] = OSSUARY.HOLE;

const R32 = RINGS[32];
const ARCH = Object.freeze(Array.from({ length: 13 }, (_, k) => R32[14 - k]));
const AR = WALL / R32[2][0];
const ZC = SPRING - AR * R32[2][1];
export const OSSUARY_CROWN = r4(ZC + AR);

const SLATE = ['root'], ASHLAR = ['pillar'], BONE = ['brass'], SOUL = ['molten'], GOLD = ['edge'];

const SEED = 0x0551;
function wallOut(y, z) {
  const g = z <= -0.8 ? 1 : z < 0 ? -z / 0.8 : z <= PLINTH ? 0 : z < PLINTH + 0.6 ? (z - PLINTH) / 0.6 : z <= SPRING - 0.6 ? 1 : z < SPRING ? (SPRING - z) / 0.6 : 0;
  const ends = Math.max(0, Math.min(1, y / 1.2, (LEN - y) / 1.2));
  return 0.38 * fbm2(SEED, y * 0.55, z * 0.7) * g * ends + (z < 0 ? -0.12 * z : 0);
}
const wallX = (y, z) => WALL + wallOut(y, z);
const vaultOut = (i, y) => (i === 0 || i === 12 ? 0 : 0.22 * fbm2(SEED + 7, y * 0.5, i * 0.9) * Math.max(0, Math.min(1, y / 1.5, (LEN - y) / 1.5, (Math.abs(y - HOLE0) - 0.9) / 0.6, (Math.abs(y - HOLE1) - 0.9) / 0.6)));
const brkVault = (k, e) => (k === 0 || k === 12 ? 0 : 0.85 * hash01(SEED + 41, k, e));
const brkRoof = (k, e) => (k < 4 || k > 8 ? 0 : 0.6 * hash01(SEED + 43, k, e));

const LOW = cuts([PLINTH, SOFFIT], 0.8);
const UP = cuts([SOFFIT, SPRING], 0.7);
const DOWN = cuts([DEEP - 0.3, -0.8, 0], 1.4);

function floorWalls(m, s, y0, y1, P) {
  const M = onSide(m, s), pa = P[0], pb = P[P.length - 1], s0 = y0 > 0 ? y0 : FAC, s1 = y1 < LEN ? y1 : LEN - FAC;
  M.face([[WALL, y1, 0], [WALL, y0, 0], [WALL, y0, PLINTH], [WALL, y1, PLINTH]], 0);
  M.face([[WALL, s0, PLINTH], [BACK + 0.45, s0, PLINTH], [BACK + 0.45, s1, PLINTH], [WALL, s1, PLINTH]], 0);
  const flank = (ya, yb) => { const ys = cuts([ya, yb], 0.5); grid(M, ys.length - 1, LOW.length - 1, (i, j) => [wallX(ys[i], LOW[j]), ys[i], LOW[j]], 0, { flip: true }); };
  if (pa > y0) flank(y0, pa);
  if (y1 > pb) flank(pb, y1);
  const ys = cuts([pa, pb], 0.5);
  grid(M, ys.length - 1, LOW.length - 1, (i, j) => [BACK + 0.4 * fbm2(SEED + 3, ys[i] * 0.8, LOW[j] * 0.8), ys[i], LOW[j]], 0, { flip: true });
  M.face([[BACK + 0.45, pa, PLINTH], [WALL, pa, PLINTH], [WALL, pa, SOFFIT], [BACK + 0.45, pa, SOFFIT]], 0);
  M.face([[WALL, pb, PLINTH], [BACK + 0.45, pb, PLINTH], [BACK + 0.45, pb, SOFFIT], [WALL, pb, SOFFIT]], 0);
  M.face([[WALL, pa, SOFFIT], [BACK + 0.45, pa, SOFFIT], [BACK + 0.45, pb, SOFFIT], [WALL, pb, SOFFIT]].reverse(), 0);
  const ya = cuts([y0, y1], 0.5);
  grid(M, ya.length - 1, UP.length - 1, (i, j) => [wallX(ya[i], UP[j]), ya[i], UP[j]], 0, { flip: true });
}

function skullPillar(m, x, y) {
  return lathe(m, x, y, [[0.56, PLINTH], [0.56, PLINTH + 0.3], [0.46, PLINTH + 0.42], [0.46, 1.85], [0.56, 2.15], [0.46, 2.45], [0.56, 2.75], [0.46, 3.05],
    [0.46, 4.55], [0.56, 4.75], [0.56, 5.15], [0.46, 5.3], [0.46, SPRING]], 8);
}
const skull = (m, x, y, z, k) => lathe(m, x, y, [[0.13, z], [0.09, z + 0.19]].map(([r, h]) => [r * (0.9 + 0.2 * k), h]), 8);
function skullRow(m, x, ya, yb, z, seed) {
  const n = Math.max(1, Math.floor((yb - ya) / 0.5));
  for (let k = 0; k < n; k++) { const h = hash01(seed, k); skull(m, r4(x + 0.06 * (h - 0.5)), r4(ya + ((k + 0.5) * (yb - ya)) / n), z, h); }
}

function soulBell(bone, x, y) {
  const top = SOFFIT - 0.25, h = 1.3;
  lathe(bone, x, y, [[0.55, top - h], [0.53, top - h + 0.1], [0.43, top - h + 0.32], [0.37, top - h + 0.7], [0.35, top - h + 1.0], [0.27, top - h + 1.2], [0.12, top]], 16, 0, { foot: true });
  boxOn(bone, x - 0.07, y - 0.5, top, x + 0.07, y + 0.5, SOFFIT, 0);
}

const FAC = 0.5, FRAME = 0.7, FD = 0.7, SX = 5.4, SBOT = -1.6, SROOF = 8.4, SHUMP = 0.9;
const FX = r4((AR + FRAME) * R32[2][0]);
const OPEN = [[WALL, -FD], ...ARCH.map((_, i) => ARCH[12 - i]).map(([c, sn]) => [AR * c, ZC + AR * sn]), [-WALL, -FD]];
const BAND = [[FX, -FD], ...ARCH.map((_, i) => ARCH[12 - i]).map(([c, sn]) => [(AR + FRAME) * c, ZC + (AR + FRAME) * sn]), [-FX, -FD]];
const roofAt = (k) => { const x = (SX * ARCH[k][0]) / R32[2][0]; return [x, SROOF + SHUMP * (1 - (x / SX) * (x / SX))]; };
const OUTLINE = [[SX, SBOT], ...ARCH.map((_, i) => roofAt(12 - i)), [-SX, SBOT]];
const ROOT_PROFILE = [[-SX, SBOT], [-5.35, -5], [-5.2, -9], [-4.7, -11.4], [-3.5, -13.2], [-1.8, -14.2], [0, -14.6], [1.8, -14.2], [3.5, -13.2], [4.7, -11.4], [5.2, -9], [5.35, -5], [SX, SBOT]];
const hump = (x) => SROOF + SHUMP * (1 - (x / SX) * (x / SX));
const jagEnd = (k, e) => (k < 4 || k > 8 ? 0 : -0.75 * hash01(SEED + 31, k, e));
const jagSide = (y, s) => -0.9 * fbm2(SEED + 33 + s, y * 0.9, 0.5) * Math.min(1, (y - HOLE0) * 2, (HOLE1 - y) * 2);
function blockOf(rock, face, bone) {
  const ys = cuts([FAC, LEN - FAC], 3.4), ends = (y) => Math.max(0, Math.min(1, (y - FAC) / 2, (LEN - FAC - y) / 2));
  const zs = cuts([SBOT, SROOF], 1.7);
  for (const s of [-1, 1]) grid(onSide(rock, s), ys.length - 1, zs.length - 1, (i, j) => [SX + (j === 0 || j === zs.length - 1 ? 0 : 0.55 * fbm2(SEED + 21, ys[i] * 0.4, zs[j] * 0.5) * ends(ys[i])), ys[i], zs[j]], 0);
  for (const [a, b, e] of [[FAC, HOLE0, 0], [HOLE1, LEN - FAC, 1]]) {
    const ry = cuts([a, b], 2.4), fade = (y) => Math.max(0, Math.min(1, (y - a) / 1.5, (b - y) / 1.5));
    const sgn = e === 0 ? -1 : 1, hole = e === 0 ? HOLE0 : HOLE1;
    grid(rock, 12, ry.length - 1, (i, j) => {
      const [x, z] = roofAt(i), edge = e === 0 ? j === ry.length - 1 : j === 0;
      return [x, edge ? hole + sgn * brkRoof(i, e) : ry[j], z + (edge ? jagEnd(i, e) : i === 0 || i === 12 ? 0 : 0.5 * fbm2(SEED + 23, x * 0.5, ry[j] * 0.4) * fade(ry[j]))];
    }, 0);
    const bot = (k) => [AR * ARCH[k][0], hole + sgn * brkVault(k, e), ZC + AR * ARCH[k][1]], top = (k) => { const [x, z] = roofAt(k); return [x, hole + sgn * brkRoof(k, e), z + jagEnd(k, e)]; };
    for (let k = 0; k < 12; k++) {
      faceTo(rock, [bot(k), bot(k + 1), top(k + 1)], [0, -sgn, 0], 0);
      faceTo(rock, [bot(k), top(k + 1), top(k)], [0, -sgn, 0], 0);
    }
  }
  const hy = cuts([HOLE0, HOLE1], 1.0);
  for (const s of [-1, 1]) {
    const M = onSide(rock, s), xs = [WALL, ...[9, 10, 11, 12].map((k) => roofAt(k)[0])];
    grid(M, xs.length - 1, hy.length - 1, (i, j) => {
      const ends2 = j === 0 || j === hy.length - 1, k = s > 0 ? 8 + i : 4 - i;
      return [xs[i], hy[j], hump(xs[i]) + (i === 0 ? jagSide(hy[j], s) : ends2 ? jagEnd(k, j === 0 ? 0 : 1) : 0)];
    }, 0);
    const top = (y) => hump(WALL) + jagSide(y, s), rows = [0, 0.25, 0.5, 0.75, 1];
    grid(M, hy.length - 1, rows.length - 1, (i, j) => [WALL, hy[i], SPRING + rows[j] * (top(hy[i]) - SPRING)], 0, { flip: true });
  }
  for (const P of OSSUARY.PILLARS) for (const y of P) for (const s of [-1, 1]) {
    const F = onSide(face, s);
    boxOn(F, SX - 0.1, y - 0.5, SBOT, SX + 0.95, y + 0.5, 3.2, 0);
    boxOn(F, SX - 0.1, y - 0.38, 3.2, SX + 0.55, y + 0.38, 7.7, 0);
  }
  const run = [0];
  for (let i = 1; i < ROOT_PROFILE.length; i++) { const a = ROOT_PROFILE[i - 1], b = ROOT_PROFILE[i]; run.push(run[i - 1] + Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]))); }
  const half = run[6];
  grid(rock, 12, ys.length - 1, (i, j) => {
    const [x, z] = ROOT_PROFILE[i], d = Math.sqrt(x * x + (z - SBOT + 3) * (z - SBOT + 3)), p = i === 0 || i === 12 ? 0 : 0.8 * fbm2(SEED + 25, x * 0.4 + ys[j] * 0.3, z * 0.3) * ends(ys[j]);
    return [x + (p * x) / d, ys[j], z + (p * (z - SBOT + 3)) / d];
  }, 1, { flip: true, uv: (i, j) => [r4(ys[j] / 7.25), r4(1 - Math.abs(run[i] - half) / half)] });
  for (const [y, yb, want] of [[0, FAC, -1], [LEN, LEN - FAC, 1]]) {
    for (let i = 0; i < 15; i++) {
      const j = (i + 1) % 15, a = BAND[i], b = BAND[j];
      faceTo(face, [[a[0], yb, a[1]], [OUTLINE[i][0], yb, OUTLINE[i][1]], [OUTLINE[j][0], yb, OUTLINE[j][1]], [b[0], yb, b[1]]], [0, want, 0], 0);
      faceTo(bone, [[a[0], y, a[1]], [a[0], yb, a[1]], [b[0], yb, b[1]], [b[0], y, b[1]]], [b[1] - a[1], 0, a[0] - b[0]], 0);
      if (i < 14) faceTo(bone, [[OPEN[i][0], y, OPEN[i][1]], [a[0], y, a[1]], [b[0], y, b[1]], [OPEN[j][0], y, OPEN[j][1]]], [0, want, 0], 0);
    }
    faceTo(rock, ROOT_PROFILE.map(([x, z]) => [x, yb, z]), [0, want, 0], 1);
    faceTo(face, [[-WALL, y, -FD], [WALL, y, -FD], [WALL, y, 0], [-WALL, y, 0]], [0, want, 0], 0);
  }
}

/** @returns {ReturnType<typeof refFragMesh>[]} */
export function ossuaryScene() {
  const out = [];
  const add = (m) => { out.push(m); return m; };

  const floors = add(refFragMesh('Floors', ['floor', 'cobble']));
  for (const [y0, y1] of [[0, ZA], [ZB, LEN]]) floors.level(-WALL, y0, -1, y1, 0, 0).level(-1, y0, 1, y1, 0, 1).level(1, y0, WALL, y1, 0, 0);
  const gold = add(refFragMesh('Edge_Lines', GOLD));
  for (const [a, b] of [[0, 0.15], [ZA - 0.15, ZA], [ZB, ZB + 0.15], [LEN - 0.15, LEN]]) gold.level(-WALL, a, WALL, b, 0.01);

  const walls = add(refFragMesh('Walls', [...ASHLAR, ...SLATE]));
  for (const s of [-1, 1]) {
    floorWalls(walls, s, 0, ZA, OSSUARY.PILLARS[0]);
    floorWalls(walls, s, ZB, LEN, OSSUARY.PILLARS[1]);
    const M = onSide(walls, s), ys = cuts([ZA, ZB], 1.0), yl = cuts([ZA - 1.6, ZA, ZB, ZB + 1.6], 1.0), up = [0, ...LOW, ...UP.slice(1)];
    grid(M, yl.length - 1, DOWN.length - 1, (i, j) => [wallX(yl[i], DOWN[j]), yl[i], DOWN[j]], 1, { flip: true, uv: (i, j) => [r4(yl[i] / 4.65), r4(Math.min(1, -DOWN[j] / (0.3 - DEEP)))] });
    grid(M, ys.length - 1, up.length - 1, (i, j) => [wallX(ys[i], up[j]), ys[i], up[j]], 0, { flip: true });
  }
  const lips = add(refFragMesh('Chasm', [...SLATE, ...SOUL]));
  for (const [y, dir] of [[ZA, -1], [ZB, 1]]) {
    const xs = cuts([-4.7, 4.7], 0.94), zs = cuts([DEEP - 0.3, -3, -1, 0], 1.2).reverse();
    grid(lips, xs.length - 1, zs.length - 1, (i, j) => [xs[i], y + dir * (0.1 * -zs[j] + 0.5 * fbm2(SEED + 11, xs[i] * 0.7, zs[j] * 0.6) * Math.min(1, -zs[j])), zs[j]], 0,
      { flip: dir > 0, uv: (i, j) => [r4(xs[i] / 4.65), r4(Math.min(1, -zs[j] / (0.3 - DEEP)))] });
  }
  lips.level(-4.7, ZA - 1.4, 4.7, ZB + 1.4, DEEP, 1);

  const vault = add(refFragMesh('Vault', ASHLAR));
  for (const [vy, e] of [[cuts([0, ZA, HOLE0], 1.0), 0], [cuts([HOLE1, ZB, LEN], 1.0), 1]]) {
    grid(vault, 12, vy.length - 1, (i, j) => {
      const y = e === 0 && j === vy.length - 1 ? HOLE0 - brkVault(i, 0) : e === 1 && j === 0 ? HOLE1 + brkVault(i, 1) : vy[j], r = AR + vaultOut(i, y);
      return [r * ARCH[i][0], y, ZC + r * ARCH[i][1]];
    }, 0, { flip: true });
  }
  const ribs = add(refFragMesh('Vault_Ribs', BONE));
  const RIB = [[0.18, -0.14], [0.18, 0.14], [-0.18, 0.14], [-0.18, -0.14]];
  for (const P of OSSUARY.PILLARS) for (const y of P) {
    const path = [[PX * -1, y, SPRING - 0.05], ...ARCH.map(([c, sn]) => [(AR - 0.12) * c, y, ZC + (AR - 0.12) * sn]), [PX, y, SPRING - 0.05]].map((p) => p.map(r4));
    sweep(ribs, path, RIB, 0);
  }
  const piers = add(refFragMesh('Skull_Pillars', BONE));
  for (const P of OSSUARY.PILLARS) for (const y of P) for (const s of [-1, 1]) skullPillar(onSide(piers, s), PX, y);

  const bays = add(refFragMesh('Bays', [...BONE, ...ASHLAR]));
  const souls = add(refFragMesh('Soul_Gems', SOUL));
  const HOLDS = { 'n-1-0': 'niche', 'n-1-1': 'gem', 'n1-0': 'gem', 'n1-1': 'skulls', 'f-1-0': 'gem', 'f-1-1': 'loculus', 'f1-0': 'bell', 'f1-1': 'gem' };
  OSSUARY.PILLARS.forEach((P, fi) => {
    for (const s of [-1, 1]) {
      const B = onSide(bays, s), G = onSide(souls, s);
      for (let k = 0; k + 1 < P.length; k++) {
        const ya = P[k] + 0.55, yb = P[k + 1] - 0.55, ym = (P[k] + P[k + 1]) / 2, what = HOLDS[`${fi ? 'f' : 'n'}${s}-${k}`], seed = fi * 100 + (s + 1) * 10 + k;
        if (what !== 'bell' && what !== 'loculus') skullRow(B, 3.5, ya, yb, PLINTH, seed);
        if (what === 'bell') { soulBell(B, 3.85, ym); continue; }
        boxOn(B, 3.3, ya - 0.1, 2.33, BACK + 0.45, yb + 0.1, 2.45, 1);
        if (what === 'gem') {
          octahedron(G, 3.85, ym, 2.78, 0.17, 0.3, 0);
          faceTo(G, RINGS[8].map(([c, sn]) => [4.3, ym + 0.46 * c, 2.95 + 0.46 * sn]), [-1, 0, 0], 0);
          skullRow(B, 3.62, ya, ym - 0.45, 2.45, seed + 5); skullRow(B, 3.62, ym + 0.45, yb, 2.45, seed + 6);
        } else if (what === 'loculus') {
          boxOn(B, 3.95, ym - 0.55, PLINTH, 4.3, ym + 0.55, 2.33, 1);
          skullRow(B, 3.62, ya, yb, 2.45, seed + 5);
        } else if (what === 'niche') {
          boxOn(B, 3.4, ym - 0.5, PLINTH, 4.2, ym + 0.5, 1.5, 1);
          skullRow(B, 3.62, ya, yb, 2.45, seed + 5);
        } else skullRow(B, 3.62, ya, yb, 2.45, seed + 5);
      }
    }
  });

  const cage = add(refFragMesh('Ribcage', BONE));
  const CAGE = [[3.6, -4.2], [3.15, -2.3], [2.85, -0.3], [2.62, 1.7], [2.45, 3.4], [2.22, 4.7], [1.8, 5.85], [1.05, 6.62], [0, 6.95]];
  const BAR = [[0.2, 0], [0.1, 0.12], [-0.1, 0.12], [-0.2, 0], [-0.1, -0.12], [0.1, -0.12]];
  for (let k = 0; k < 5; k++) {
    const y = ZA + 1.05 + k * 1.975, lean = 0.12 * (hash01(SEED, k) - 0.5);
    for (const s of [-1, 1]) sweep(onSide(cage, s), CAGE.map(([x, z], i) => [r4(x), r4(y + lean * (i / 8) - 0.85 * ((8 - i) / 8) * ((8 - i) / 8)), r4(z + (i > 5 ? 0.04 * k : 0))]), BAR, 0);
  }
  sweep(cage, [[0, ZA + 0.3, 7.02], [0, ZA + 3, 7.14], [0, ZB - 3, 7.18], [0, ZB - 0.9, 7.06]], [[0.24, 0], [0.13, 0.11], [-0.13, 0.11], [-0.24, 0], [-0.13, -0.13], [0.13, -0.13]], 0);

  blockOf(add(refFragMesh('Block', [...ASHLAR, ...SLATE])), add(refFragMesh('Facades', ASHLAR)), add(refFragMesh('Portals', BONE)));

  add(refFragMesh('socket.in')).across(-W, W, 0, 0, CEIL);
  add(refFragMesh('socket.out.main')).across(-W, W, LEN, 0, CEIL, 0, true);
  add(refFragMesh('floor.fight.near')).level(-W, 0, W, ZA, 0);
  add(refFragMesh('floor.fight.far')).level(-W, ZB, W, LEN, 0);
  add(refFragMesh('ceil.near')).level(-W, 0, W, ZA, CEIL, 0, true);
  add(refFragMesh('ceil.far')).level(-W, ZB, W, LEN, CEIL, 0, true);
  add(refFragMesh('open.mouth')).box(-W - 0.1, 0, -0.05, W + 0.1, 0.05, 0.05);
  add(refFragMesh('open.lipnear')).box(-W - 0.1, ZA - 0.05, -0.05, W + 0.1, ZA + 0.05, 0.05);
  add(refFragMesh('open.lipfar')).box(-W - 0.1, ZB - 0.05, -0.05, W + 0.1, ZB + 0.05, 0.05);
  add(refFragMesh('open.exit')).box(-W - 0.1, LEN - 0.05, -0.05, W + 0.1, LEN, 0.05);
  const N = { mouth: [0, 0.8, 0], nave: [0, 4.5, 0], lipnear: [0, 8.2, 0], westnear: [-2.2, 4.5, 0], eastnear: [2.2, 4.5, 0],
    lipfar: [0, 19.8, 0], navefar: [0, 23.5, 0], exit: [0, 27.2, 0], westfar: [-2.2, 23.5, 0], eastfar: [2.2, 23.5, 0] };
  for (const [k, p] of Object.entries(N)) add(refFragMesh(`node.${k}`)).disc(p[0], p[1], p[2], 0.5);
  for (const [k, a, b] of [['mouthnave', 'mouth', 'nave'], ['navelip', 'nave', 'lipnear'], ['westnave', 'westnear', 'nave'], ['naveeast', 'nave', 'eastnear'],
    ['lipnavefar', 'lipfar', 'navefar'], ['naveexit', 'navefar', 'exit'], ['westfar', 'westfar', 'navefar'], ['eastfar', 'navefar', 'eastfar']]) walkStrip(add(refFragMesh(`edge.${k}`)), N[a], N[b]);
  const cube = (name, x, y, z, s = 0.3) => add(refFragMesh(name)).box(x - s / 2, y - s / 2, z, x + s / 2, y + s / 2, z + s);
  cube('anchor.caster.gemnearwest', -2.4, 6.45, 0);
  cube('anchor.caster.gemneareast', 2.4, 2.55, 0);
  cube('anchor.caster.gemfarwest', -2.4, 21.55, 0);
  cube('anchor.caster.gemfareast', 2.4, 25.45, 0);
  cube('anchor.lurker.near', 2.5, 8.1, 0);
  cube('anchor.lurker.far', -2.5, 27.3, 0);
  cube('anchor.niche.bier', -2.4, 2.55, 0);
  cube('anchor.engine.soulbell', 2.3, 21.55, 0);
  cube('anchor.hazard.wispnear', 0, 4.5, 0.9);
  cube('anchor.hazard.wispfar', 0, 23.5, 0.9);
  add(refFragMesh('hazard.wisp.near.per9000.ph4500')).level(-2, 1.5, 2, 7.5, 1.2);
  add(refFragMesh('hazard.wisp.far.per11000.ph5500')).level(-2, 20.5, 2, 26.5, 1.2);
  ['a', 'b', 'c'].forEach((k, i) => { const [y0, y1] = OSSUARY.BONES[i]; add(refFragMesh(`course.bone.${k}`)).box(-OSSUARY.BONE_W / 2, y0, -0.6, OSSUARY.BONE_W / 2, y1, 0); });
  add(refFragMesh('alcove.seam.page.loculus')).box(-4.2, 24.95, PLINTH, -3.4, 25.95, 2.45);
  cube('light.band.near', 0, 4.5, 4.6, 0.2);
  cube('light.band.chasm', 0, 14, -3.2, 0.2);
  cube('light.band.far', 0, 23.5, 4.6, 0.2);
  const gab = 5.62, crown = 7.2;
  add(refFragMesh('collider.proxy'))
    .level(-W, 0, W, ZA, 0).level(-W, ZB, W, LEN, 0)
    .along(-W, 0, LEN, DEEP, gab, 0, true).along(W, 0, LEN, DEEP, gab)
    .across(-W, W, ZA, DEEP, 0, 0, true).across(-W, W, ZB, DEEP, 0)
    .face([[-W, 0, gab], [-W, HOLE0, gab], [0, HOLE0, crown], [0, 0, crown]]).face([[W, HOLE0, gab], [W, 0, gab], [0, 0, crown], [0, HOLE0, crown]])
    .face([[-W, HOLE1, gab], [-W, LEN, gab], [0, LEN, crown], [0, HOLE1, crown]]).face([[W, LEN, gab], [W, HOLE1, gab], [0, HOLE1, crown], [0, LEN, crown]]);
  return out;
}

export const writeOssuaryFbx = () => writeRefFragFbx(ossuaryScene());

if (isMain(import.meta.url)) {
  const out = resolve(process.argv.slice(2).find((a) => a.startsWith('--out='))?.slice(6) ?? resolve(ROOT, OSSUARY_FBX));
  const bytes = writeOssuaryFbx();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes);
  console.log(`${out}: ${ossuaryScene().length} objects, ${bytes.length} bytes`);
}
