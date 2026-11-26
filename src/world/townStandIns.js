// Stand-ins for pieces that Beautiful Villages and Beautiful Cities borrow from peer mods this game does not carry.
// Each piece is built here from placements and catalog names, never copied from a peer file.
// All of it sits behind the town mods' own load and costs a game with neither mod nothing.

import { registerCustomModel, registerModelAlias, customModelFor } from './customModels.js';
import { addVendorTextures } from '../render/textureReplacement.js';
import { buildDerivedPicture } from '../formats/derivedTexture.js';
import { installDetStandIns, MeshBuilder } from './detStandIns.js';
import { TOWN_PICTURE_ARCHIVE, PICTURE } from './townPictures.js';
import { registerFlatField } from './flatFields.js';
import { RMBRP_HILL_SHAPES, SHAPE_BEARINGS, SHAPE_RINGS } from './rmbrpHillShapes.js';
import { wrapAngle } from './mat4.js';
import { DOOR_APPROACH_M } from './curatedPlacements.js';
import { shareDetailedShipsArt } from '../systems/naval/detailedShips.js';

const U = 0.025;

export const TOWN_BED_FIRST = 42069;
export const TOWN_BED_COUNT = 18;
export const TOWN_BED_ARCHIVE = 38201;
export const TOWN_BED_MODELS = Object.freeze([41000, 41001, 41002]);
export const TOWN_BEDCLOTHS = Object.freeze([5, 6, 7]);
export const TOWN_BED_COLOURS = Object.freeze([
  Object.freeze({ name: 'blue', hue: 213.6, sat: 1.758, val: 1.536 }),
  Object.freeze({ name: 'brown', hue: 28.3, sat: 2.505, val: 1.144 }),
  Object.freeze({ name: 'grey', hue: 0, sat: 0, val: 0.969 }),
  Object.freeze({ name: 'orange', hue: 15.1, sat: 2.596, val: 1.818 }),
  Object.freeze({ name: 'purple', hue: 315.7, sat: 1.023, val: 1.138 }),
  Object.freeze({ name: 'yellow', hue: 50.6, sat: 2.788, val: 1.425 }),
]);
export function townBedOf(id) {
  const k = Number(id) - TOWN_BED_FIRST;
  if (!Number.isInteger(k) || k < 0 || k >= TOWN_BED_COUNT) return null;
  return { model: TOWN_BED_MODELS[k % 3], colour: Math.floor(k / 3) };
}
export const bedclothRecord = (colour, cloth) => colour * 3 + cloth;

const hsvOf = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx ? d / mx : 0, mx];
};
const rgbOf = (h, s, v) => {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
};
export const isBedclothGreen = (h, s) => s > 0.18 && h > 70 && h < 170;
export function recolourBedcloth(src, colour) {
  const out = new Uint8Array(src.width * src.height * 4);
  for (let i = 0; i < src.width * src.height * 4; i += 4) {
    let r = src.data[i], g = src.data[i + 1], b = src.data[i + 2];
    const [h, s, v] = hsvOf(r, g, b);
    if (isBedclothGreen(h, s)) [r, g, b] = rgbOf(colour.hue, Math.min(1, s * colour.sat), Math.min(1, v * colour.val));
    out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255;
  }
  return { width: src.width, height: src.height, data: out };
}
const bedRemap = (colour) => Object.fromEntries(TOWN_BEDCLOTHS.map((rec, cloth) => [`90_${rec}`, [TOWN_BED_ARCHIVE, bedclothRecord(colour, cloth)]]));

export const CLASSIC_PAINTINGS = Object.freeze([[0, 50, 31], [1, 45, 37], [2, 38, 27], [3, 41, 30], [4, 23, 26], [5, 21, 22]]);
export const TOWN_PAINTINGS = Object.freeze(Object.fromEntries([
  ...[69424, 69426, 69428, 69429, 69431, 69432, 69435, 69436, 69437, 69440, 69441, 69444, 69445, 69446, 69447, 69448, 69449, 69450,
    69451, 69452, 69453, 69454, 69455, 69456, 69457, 69458, 69459, 69460, 69461, 69463, 69464,
    79014, 79016, 79018, 79019, 79021, 79025, 79026, 79027, 79028, 79029, 79030].map((id) => [id, 'V']),
  ...[69420, 69421, 69422, 69423, 69425, 69427, 79010, 79012, 79013, 79015, 79017].map((id) => [id, 'Y']),
  [79011, 'Yup'],
  ...[69430, 69433, 69434, 69462, 79020, 79022, 79023, 79024].map((id) => [id, 'H']),
].sort((a, b) => a[0] - b[0]).map(([id, hang], k) => [id, Object.freeze({ hang, picture: k % 6, mirror: Math.floor(k / 6) % 2 === 1 })])));

const FRAME_BACK = [0, 46];
export function paintingModel({ hang, picture, mirror }) {
  const [record, pw, ph] = CLASSIC_PAINTINGS[picture];
  const w = pw * U, h = ph * U, back = 2 * U, m = new MeshBuilder(), tex = [48, record];
  const u0 = mirror ? 1 : 0, u1 = mirror ? 0 : 1;
  const face = [[w / 2, h / 2, 0], [-w / 2, h / 2, 0], [-w / 2, -h / 2, 0], [w / 2, -h / 2, 0]];
  const uvs = [[u0, 0], [u1, 0], [u1, -1], [u0, -1]];
  const lay = hang === 'V' ? (p) => p
    : hang === 'Yup' ? ([x, y, z]) => [-z, y, x]
    : hang === 'Y' ? ([x, y, z]) => [-z, -x, y]
    : ([x, y, z]) => [x, -z, y];
  const n = lay([0, 0, 1]);
  const P = face.map(lay);
  m.quad(tex, P[0], P[1], P[2], P[3], n, uvs);
  const off = (p) => lay([p[0], p[1], -back]);
  const B = face.map(off);
  for (let i = 0; i < 4; i++) {
    const a = P[i], b = P[(i + 1) % 4], c = B[(i + 1) % 4], d = B[i];
    const mid = lay([(face[i][0] + face[(i + 1) % 4][0]) / 2, (face[i][1] + face[(i + 1) % 4][1]) / 2, 0]), l = Math.hypot(...mid) || 1;
    m.quad(FRAME_BACK, a, b, c, d, [mid[0] / l, mid[1] / l, mid[2] / l]);
  }
  m.quad(FRAME_BACK, B[3], B[2], B[1], B[0], [-n[0], -n[1], -n[2]]);
  return m.build();
}

export const ROSYS_PICTURES = Object.freeze({
  69467: PICTURE.smallHanging(0), 69468: PICTURE.smallHanging(1), 69469: PICTURE.smallHanging(2), 69471: PICTURE.rug(2), 69472: PICTURE.rug(3),
});
function smallHanging(record) {
  const m = new MeshBuilder(), tex = [TOWN_PICTURE_ARCHIVE, record], w = 0.4, h = 0.6, z = 0.004;
  for (const side of [1, -1]) {
    const L = (w / 2) * side, n = [0, 0, side];
    m.quad(tex, [L, 0, z * side], [-L, 0, z * side], [-L, -h, z * side], [L, -h, z * side], n, [[0, 0], [1, 0], [1, -1], [0, -1]]);
  }
  m.cylinderX([67, 0], [-w / 2 - 0.03, 0, 0], 0.012, w + 0.06, 6);
  return m.build();
}
function rug(record) {
  const m = new MeshBuilder(), tex = [TOWN_PICTURE_ARCHIVE, record], hw = 0.8, hd = 0.5, t = 0.012;
  m.quad(tex, [hw, t, -hd], [-hw, t, -hd], [-hw, t, hd], [hw, t, hd], [0, 1, 0], [[0, 0], [1, 0], [1, -1], [0, -1]]);
  m.quad([0, 45], [hw, 0, hd], [-hw, 0, hd], [-hw, 0, -hd], [hw, 0, -hd], [0, -1, 0]);
  return m.build();
}
export const ROSYS_PIECES = Object.freeze({
  69467: () => smallHanging(ROSYS_PICTURES[69467]), 69468: () => smallHanging(ROSYS_PICTURES[69468]), 69469: () => smallHanging(ROSYS_PICTURES[69469]),
  69471: () => rug(ROSYS_PICTURES[69471]), 69472: () => rug(ROSYS_PICTURES[69472]),
});

export const TOWN_CROP_FIELDS = Object.freeze({
  53211: Object.freeze({ rangeX: 85, rangeZ: 85, spacing: 4, noise: 0.5 }),
  53212: Object.freeze({ rangeX: 35, rangeZ: 85, spacing: 4, noise: 0.5 }),
  53213: Object.freeze({ rangeX: 85, rangeZ: 35, spacing: 4, noise: 0.5 }),
  53214: Object.freeze({ rangeX: 35, rangeZ: 35, spacing: 4, noise: 0.5 }),
});

export const RMBRP_ROCKS = Object.freeze({
  53006: [-0.273, 0.263, 0.123, 0.327, -0.308, 0.286], 53012: [-0.431, 0.416, 0.13, 0.278, -0.282, 0.26], 53014: [-0.475, 0.636, 0.001, 0.349, -0.421, 0.561],
  53017: [-0.228, 0.356, 0.003, 0.639, -0.382, 0.483], 53020: [-0.738, 0.82, 0.004, 0.961, -0.562, 0.734], 53023: [-0.814, 0.555, 0.255, 0.523, -0.619, 0.576],
  53029: [-0.356, 0.224, 0.092, 0.167, -0.319, 0.234], 53030: [-0.343, 0.215, 0.069, 0.167, -0.221, 0.203], 53031: [-0.307, 0.219, 0.085, 0.176, -0.236, 0.223],
  53032: [-0.504, 0.506, 0.124, 0.224, -0.553, 0.501], 53033: [-0.333, 0.325, 0.102, 0.119, -0.36, 0.286], 53035: [-0.349, 0.415, 0.09, 0.496, -0.414, 0.404],
  53036: [-0.335, 0.35, 0.103, 0.541, -0.294, 0.318], 53037: [-0.898, 1.076, 0.141, 0.715, -0.788, 0.945], 53038: [-0.93, 0.891, 0.176, 0.468, -0.618, 0.872],
  53039: [-1.194, 1.095, 0.164, 0.658, -0.875, 0.726], 53040: [-1.005, 1.212, 0.189, 0.523, -1.161, 1.346], 53042: [-0.99, 1.04, 0.114, 0.224, -1.176, 1.041],
  53054: [-0.387, 0.505, 0, 0.133, -0.316, 0.252], 53064: [-0.397, 0.396, 0, 0.367, -0.45, 0.401], 53083: [-0.387, 0.387, 0, 0.133, -0.252, 0.252],
  53085: [-0.255, 0.403, 0, 0.136, -0.405, 0.236], 53086: [-1.305, 0.891, 0, 0.56, -0.611, 0.65],
});
export const RMBRP_ROCK_SCALE = Object.freeze({
  53006: 6, 53012: 5, 53014: 4, 53017: 6, 53020: 4, 53023: 2, 53029: 6, 53030: 8, 53031: 6, 53032: 3, 53033: 4, 53035: 4,
  53036: 6, 53037: 4, 53038: 4, 53039: 4, 53040: 3, 53042: 4, 53054: 8, 53064: 6, 53083: 6, 53085: 8, 53086: 4,
});
const ROCK = [302, 3], GRASS = [302, 2];
export function rockMesh(id) {
  const [x0, x1, down, up, z0, z1] = RMBRP_ROCKS[id].map((v) => v * RMBRP_ROCK_SCALE[id]);
  return boulderMesh(x1 - x0, up, down, z1 - z0, Number(id), (x0 + x1) / 2, (z0 + z1) / 2);
}
export const boulderUv = (p, n) => {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  if (ay >= ax && ay >= az) return [p[0], -p[2]];
  return ax >= az ? [p[2], -p[1]] : [p[0], -p[1]];
};
export function boulderMesh(w, up, down, l, seed, cx = 0, cz = 0) {
  const m = new MeshBuilder(), N = 8;
  let h = seed >>> 0;
  const rnd = () => { h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return (h & 0xffff) / 0xffff; };
  const ring = (y, k) => Array.from({ length: N }, (_, i) => { const a = (i / N) * Math.PI * 2, r = k * (0.82 + rnd() * 0.18); return [cx + Math.cos(a) * (w / 2) * r, y, cz + Math.sin(a) * (l / 2) * r]; });
  const base = ring(-Math.max(down, 0.05), 0.92), mid = ring(up * 0.45, 1), top = ring(up * 0.85, 0.62), crown = [cx, up, cz], foot = [cx, -Math.max(down, 0.05), cz];
  const face = (a, b, c) => { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const g = [(a[0] + b[0] + c[0]) / 3 - cx, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3 - cz]; const l2 = (n[0] * g[0] + n[1] * g[1] + n[2] * g[2] < 0 ? -1 : 1) * (Math.hypot(...n) || 1), nn = [n[0] / l2, n[1] / l2, n[2] / l2]; m.tri(ROCK, a, b, c, nn, boulderUv(a, nn), boulderUv(b, nn), boulderUv(c, nn)); };
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    for (const [lo, hi] of [[base, mid], [mid, top]]) { face(lo[i], hi[j], hi[i]); face(lo[i], lo[j], hi[j]); }
    face(top[i], crown, top[j]);
    face(base[j], base[i], foot);
  }
  return m.build();
}
export const RMBRP_HILLS = Object.freeze({
  52012: 'grass', 52018: 'grass', 52022: 'grass', 52025: 'grass', 52028: 'grass', 52035: 'grass', 52058: 'grass', 52458: 'grass',
  52463: 'rock', 52508: 'grass', 52543: 'rock', 52548: 'grass', 52599: 'rock', 52613: 'rock', 52638: 'grass', 52663: 'rock',
  52683: 'rock', 52703: 'rock', 52713: 'rock', 52725: 'grass', 52758: 'grass', 52816: 'rock', 52973: 'rock',
});
const hillPlanUv = (x, z) => [x / 4, -z / 4];
export function hillMesh(shape, surface) {
  const m = new MeshBuilder(), tex = surface === 'rock' ? ROCK : GRASS, K = SHAPE_BEARINGS, N = SHAPE_RINGS;
  const [cx, cz] = shape.c;
  const P = (k, j) => {
    if (j === 0) return [cx, shape.top, cz];
    const b = k % K, a = (b / K) * Math.PI * 2, r = (shape.reach[b] * j) / N;
    return [cx + Math.cos(a) * r, shape.rings[b][j - 1], cz + Math.sin(a) * r];
  };
  const uv = (p) => hillPlanUv(p[0], p[2]);
  const face = (a, b, c) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n) || 1, sgn = n[1] < 0 ? -1 : 1;
    m.tri(tex, a, b, c, [(sgn * n[0]) / l, (sgn * n[1]) / l, (sgn * n[2]) / l], uv(a), uv(b), uv(c));
  };
  for (let j = 1; j <= N; j++) for (let k = 0; k < K; k++) {
    const a = P(k, j), b = P(k + 1, j), c = P(k + 1, j - 1), d = P(k, j - 1);
    if (j === 1) face(a, b, d);
    else { face(a, b, c); face(a, c, d); }
  }
  return m.build();
}

export const drawnHillStandIn = (id) => (RMBRP_HILLS[id] ? customModelFor(id) : null);

/**
 * @param {Iterable<{modelIdNum:number, matrix:ArrayLike<number>}>} models
 * @param {(id:number) => ?{positions:ArrayLike<number>, indices:ArrayLike<number>}} [drawn]
 * @returns {?{topAt: (x:number, z:number) => ?number, lay: (mesh:{positions:ArrayLike<number>, indices:ArrayLike<number>}) => void, trianglesIn: (x0:number, z0:number, x1:number, z1:number) => number[][]}}
 */
export function blockHillSeat(models, drawn = drawnHillStandIn) {
  const tris = [];
  for (const placed of models ?? []) {
    const mesh = drawn(placed.modelIdNum);
    if (!mesh) continue;
    const m = placed.matrix, p = mesh.positions, w = new Float64Array(p.length);
    for (let i = 0; i < p.length; i += 3) {
      w[i] = m[0] * p[i] + m[4] * p[i + 1] + m[8] * p[i + 2] + m[12];
      w[i + 1] = m[1] * p[i] + m[5] * p[i + 1] + m[9] * p[i + 2] + m[13];
      w[i + 2] = m[2] * p[i] + m[6] * p[i + 1] + m[10] * p[i + 2] + m[14];
    }
    const ix = mesh.indices;
    for (let t = 0; t + 2 < ix.length; t += 3) {
      const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
      tris.push(w[a], w[a + 1], w[a + 2], w[b], w[b + 1], w[b + 2], w[c], w[c + 1], w[c + 2],
        Math.min(w[a], w[b], w[c]), Math.max(w[a], w[b], w[c]), Math.min(w[a + 2], w[b + 2], w[c + 2]), Math.max(w[a + 2], w[b + 2], w[c + 2]));
    }
  }
  const CELL = 2, NONE = [];
  let cells = null, gx = 0, gz = 0, nz = 0;
  const near = (x, z) => {
    if (!cells) {
      gx = Infinity; gz = Infinity;
      let x1 = -Infinity, z1 = -Infinity;
      for (let k = 0; k < tris.length; k += 13) { gx = Math.min(gx, tris[k + 9]); x1 = Math.max(x1, tris[k + 10]); gz = Math.min(gz, tris[k + 11]); z1 = Math.max(z1, tris[k + 12]); }
      nz = Math.floor((z1 - gz) / CELL) + 1;
      cells = new Array((Math.floor((x1 - gx) / CELL) + 1) * nz);
      for (let k = 0; k < tris.length; k += 13) {
        const i1 = Math.floor((tris[k + 10] - gx) / CELL), j0 = Math.floor((tris[k + 11] - gz) / CELL), j1 = Math.floor((tris[k + 12] - gz) / CELL);
        for (let i = Math.floor((tris[k + 9] - gx) / CELL); i <= i1; i++) for (let j = j0; j <= j1; j++) (cells[i * nz + j] ??= []).push(k);
      }
    }
    const i = Math.floor((x - gx) / CELL), j = Math.floor((z - gz) / CELL);
    return i < 0 || j < 0 || j >= nz ? NONE : cells[i * nz + j] ?? NONE;
  };
  if (!tris.length) return null;
  return {
    topAt(x, z) {
      let top = null;
      for (const k of near(x, z)) {
        if (x < tris[k + 9] || x > tris[k + 10] || z < tris[k + 11] || z > tris[k + 12]) continue;
        const ax = tris[k], az = tris[k + 2], bx = tris[k + 3], bz = tris[k + 5], cx = tris[k + 6], cz = tris[k + 8];
        const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(d) < 1e-12) continue;
        const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l3 = 1 - l1 - l2;
        if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
        const y = l1 * tris[k + 1] + l2 * tris[k + 4] + l3 * tris[k + 7];
        if (top === null || y > top) top = y;
      }
      return top;
    },
    lay(mesh) {
      const p = mesh.positions, ix = mesh.indices;
      for (let t = 0; t + 2 < ix.length; t += 3) {
        const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
        tris.push(p[a], p[a + 1], p[a + 2], p[b], p[b + 1], p[b + 2], p[c], p[c + 1], p[c + 2],
          Math.min(p[a], p[b], p[c]), Math.max(p[a], p[b], p[c]), Math.min(p[a + 2], p[b + 2], p[c + 2]), Math.max(p[a + 2], p[b + 2], p[c + 2]));
      }
      cells = null;
    },
    trianglesIn(x0, z0, x1, z1) {
      const out = [];
      for (let k = 0; k < tris.length; k += 13) {
        if (tris[k + 10] < x0 || tris[k + 9] > x1 || tris[k + 12] < z0 || tris[k + 11] > z1) continue;
        out.push([tris[k], tris[k + 2], tris[k + 3], tris[k + 5], tris[k + 6], tris[k + 8]]);
      }
      return out;
    },
  };
}

export function seatNatureFlat(seat, x, z, groundY) {
  const top = seat ? seat.topAt(x, z) : null;
  return top !== null && top > groundY ? top : groundY;
}

// A block that places a model on a drawn hill lays a pad under it, because the drawn profile falls away at the
// plateau edge.

export const HILL_SEAT_TOLERANCE = 0.15;
export const HILL_SEAT_PLANE = 0.5;
export const HILL_SEAT_STAND = 1;
export const HILL_PATCH_SINK = HILL_SEAT_TOLERANCE / 3;
const HILL_PATCH_MARGIN = 0.25;
const HILL_PATCH_SLOPE = 1;
const HILL_PATCH_TOE = 0.25;
const HILL_PATCH_STEP = 0.25;
const HILL_PATCH_GRID = 1;
const HILL_PATCH_RAY = 1;
const HILL_PATCH_FAN = Math.PI / 6;
const HILL_PATCH_STEEPEST = 8;
const HILL_PATCH_ROUNDS = 8;

function hullXZ(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) {
    while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], q) <= 1e-9) lower.pop();
    lower.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], p[i]) <= 1e-9) upper.pop();
    upper.push(p[i]);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
function inHull(h, x, z) {
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length];
    if ((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]) < -1e-9) return false;
  }
  return true;
}
function modelFootprint(positions, m) {
  let base = Infinity;
  const pts = [];
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    base = Math.min(base, m[1] * x + m[5] * y + m[9] * z + m[13]);
    pts.push([m[0] * x + m[4] * y + m[8] * z + m[12], m[2] * x + m[6] * y + m[10] * z + m[14]]);
  }
  return { base, hull: hullXZ(pts) };
}
function footprintSamples(seat, hull) {
  const out = hull.slice(), n = hull.length;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of hull) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  for (const t of seat.trianglesIn(x0, z0, x1, z1)) {
    for (let v = 0; v < 6; v += 2) {
      const px = t[v], pz = t[v + 1], rx = t[(v + 2) % 6] - px, rz = t[(v + 3) % 6] - pz;
      if (inHull(hull, px, pz)) out.push([px, pz]);
      for (let i = 0; i < n; i++) {
        const [ax, az] = hull[i], sx = hull[(i + 1) % n][0] - ax, sz = hull[(i + 1) % n][1] - az;
        const den = rx * sz - rz * sx;
        if (Math.abs(den) < 1e-12) continue;
        const s = ((ax - px) * sz - (az - pz) * sx) / den, u = ((ax - px) * rz - (az - pz) * rx) / den;
        if (s >= 0 && s <= 1 && u >= 0 && u <= 1) out.push([px + rx * s, pz + rz * s]);
      }
    }
  }
  for (let x = x0 + HILL_PATCH_GRID / 2; x < x1; x += HILL_PATCH_GRID) for (let z = z0 + HILL_PATCH_GRID / 2; z < z1; z += HILL_PATCH_GRID) if (inHull(hull, x, z)) out.push([x, z]);
  return out;
}
function hillUvAt(m) {
  const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g) || 1;
  return (p) => {
    const x = p[0] - m[12], y = p[1] - m[13], z = p[2] - m[14];
    return hillPlanUv(((e * i - f * h) * x + (c * h - b * i) * y + (b * f - c * e) * z) / det, ((d * h - e * g) * x + (b * g - a * h) * y + (a * e - b * d) * z) / det);
  };
}
function outsideHull(h, x, z) {
  if (inHull(h, x, z)) return 0;
  let best = Infinity;
  for (let i = 0; i < h.length; i++) best = Math.min(best, segmentDistance(x, z, h[i], h[(i + 1) % h.length]));
  return best;
}
function segmentDistance(x, z, a, b) {
  const ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez;
  const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / l2)) : 0;
  return Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t);
}

export function doorApproach(door, m) {
  const at = (x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
  const v0 = door.vert0, v2 = door.vert2, footY = Math.min(v0.y, door.vert1.y, v2.y);
  const cx = (v0.x + v2.x) / 2, cz = (v0.z + v2.z) / 2;
  const foot = at(cx, footY, cz), tip = at(cx + door.normal.x, footY, cz + door.normal.z);
  const ox = tip[0] - foot[0], oz = tip[2] - foot[2], l = Math.hypot(ox, oz) || 1;
  const a = at(v0.x, footY, v0.z), b = at(v2.x, footY, v2.z);
  return { foot, out: [ox / l, 0, oz / l], half: Math.hypot(b[0] - a[0], b[2] - a[2]) / 2 };
}
export function doorApproachPoints({ foot, out, half }, step = HILL_PATCH_STEP) {
  const side = Math.max(half - 0.1, 0), pts = [];
  for (let k = 0; k <= DOOR_APPROACH_M + 1e-9; k += step) {
    for (const s of side ? [-side, 0, side] : [0]) pts.push([foot[0] + out[0] * k - out[2] * s, foot[2] + out[2] * k + out[0] * s, k]);
  }
  return pts;
}

function openPoints(seat, models, meshOf, drawn) {
  const cells = new Map(), key = (i, j) => `${i},${j}`;
  const add = (x, y, z, owner) => {
    const k = key(Math.floor(x), Math.floor(z));
    let c = cells.get(k);
    if (!c) cells.set(k, (c = []));
    c.push([x, y, z, owner]);
  };
  for (const [owner, placed] of [...(models ?? [])].entries()) {
    if (drawn(placed.modelIdNum)) continue;
    const mesh = meshOf(placed), m = placed.matrix;
    if (!mesh?.positions?.length) continue;
    const p = mesh.positions;
    for (let i = 0; i < p.length; i += 3) {
      const x = m[0] * p[i] + m[4] * p[i + 1] + m[8] * p[i + 2] + m[12], y = m[1] * p[i] + m[5] * p[i + 1] + m[9] * p[i + 2] + m[13], z = m[2] * p[i] + m[6] * p[i + 1] + m[10] * p[i + 2] + m[14];
      if (y > Math.max(seat.topAt(x, z) ?? 0, 0) + HILL_PATCH_SINK) add(x, y, z, owner);
    }
    for (const door of mesh.doors ?? []) {
      const a = doorApproach(door, m);
      for (const [x, z] of doorApproachPoints(a)) add(x, a.foot[1], z, -1);
    }
  }
  return {
    near(x0, z0, x1, z1, owner) {
      const out = [];
      for (let i = Math.floor(x0); i <= Math.floor(x1); i++) for (let j = Math.floor(z0); j <= Math.floor(z1); j++) {
        for (const q of cells.get(key(i, j)) ?? []) if (q[3] !== owner && q[0] >= x0 && q[0] <= x1 && q[2] >= z0 && q[2] <= z1) out.push(q);
      }
      return out;
    },
  };
}

function hillPad(mb, seat, hull, top, tex, uvOf, open, owner) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of hull) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  for (const q of open.near(x0 - HILL_PATCH_MARGIN, z0 - HILL_PATCH_MARGIN, x1 + HILL_PATCH_MARGIN, z1 + HILL_PATCH_MARGIN, owner)) {
    if (q[1] - top < HILL_PATCH_SINK - 1e-4 && outsideHull(hull, q[0], q[2]) <= HILL_PATCH_MARGIN) return false;
  }
  const n = hull.length, rays = [];
  const outward = (i) => {
    const [ax, az] = hull[i], [bx, bz] = hull[(i + 1) % n];
    return Math.atan2(ax - bx, bz - az);
  };
  for (let i = 0; i < n; i++) {
    const [ax, az] = hull[i], [bx, bz] = hull[(i + 1) % n];
    const a0 = outward((i + n - 1) % n);
    const a1 = a0 + wrapAngle(outward(i) - a0);
    const fan = Math.max(1, Math.ceil((a1 - a0) / HILL_PATCH_FAN));
    for (let k = a1 > a0 ? 0 : fan; k <= fan; k++) rays.push([ax, az, a0 + ((a1 - a0) * k) / fan]);
    const along = Math.ceil(Math.hypot(bx - ax, bz - az) / HILL_PATCH_RAY);
    for (let k = 1; k < along; k++) rays.push([ax + ((bx - ax) * k) / along, az + ((bz - az) * k) / along, a1]);
  }
  const under = (x, z) => Math.max(seat.topAt(x, z) ?? 0, 0);
  const slopes = rays.map(() => HILL_PATCH_SLOPE);
  const rayOf = ([px, pz, a], s) => {
    const dx = Math.cos(a), dz = Math.sin(a), cx = px + dx * HILL_PATCH_MARGIN, cz = pz + dz * HILL_PATCH_MARGIN;
    const reach = (top + HILL_PATCH_TOE) / s;
    let d = HILL_PATCH_STEP;
    while (d < reach && top - s * d > under(cx + dx * d, cz + dz * d) - HILL_PATCH_TOE) d += HILL_PATCH_STEP;
    d = Math.min(d, reach);
    return { crest: [cx, top, cz], toe: [cx + dx * d, top - s * d, cz + dz * d] };
  };
  let ring = rays.map((r, i) => rayOf(r, slopes[i]));
  for (let round = 0; ; round++) {
    let steeper = false;
    for (let i = 0; i < ring.length; i++) {
      const j = (i + 1) % ring.length, a = ring[i], b = ring[j];
      for (const [p, q, r] of [[a.crest, b.crest, b.toe], [a.crest, b.toe, a.toe]]) {
        const tx0 = Math.min(p[0], q[0], r[0]), tx1 = Math.max(p[0], q[0], r[0]), tz0 = Math.min(p[2], q[2], r[2]), tz1 = Math.max(p[2], q[2], r[2]);
        const det = (q[2] - r[2]) * (p[0] - r[0]) + (r[0] - q[0]) * (p[2] - r[2]);
        if (Math.abs(det) < 1e-12) continue;
        for (const [x, y, z] of open.near(tx0, tz0, tx1, tz1, owner)) {
          const l1 = ((q[2] - r[2]) * (x - r[0]) + (r[0] - q[0]) * (z - r[2])) / det, l2 = ((r[2] - p[2]) * (x - r[0]) + (p[0] - r[0]) * (z - r[2])) / det;
          if (l1 < -1e-9 || l2 < -1e-9 || l1 + l2 > 1 + 1e-9) continue;
          if (l1 * p[1] + l2 * q[1] + (1 - l1 - l2) * r[1] <= y - HILL_PATCH_SINK) continue;
          const d = segmentDistance(x, z, [a.crest[0], a.crest[2]], [b.crest[0], b.crest[2]]);
          const need = (top - (y - HILL_PATCH_SINK)) / Math.max(d, 1e-6) * 1.01;
          if (d < HILL_PATCH_STEP || need > HILL_PATCH_STEEPEST) return false;
          slopes[i] = Math.max(slopes[i], need); slopes[j] = Math.max(slopes[j], need);
          steeper = true;
        }
      }
    }
    if (!steeper) break;
    if (round >= HILL_PATCH_ROUNDS) return false;
    ring = rays.map((r, i) => rayOf(r, slopes[i]));
  }
  const bank = (p, q, r) => {
    const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], v = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
    const c = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(c[0], c[1], c[2]);
    if (len < 1e-9) return;
    const s = c[1] < 0 ? -len : len;
    mb.tri(tex, p, q, r, [c[0] / s, c[1] / s, c[2] / s], uvOf(p), uvOf(q), uvOf(r));
  };
  let mx = 0, mz = 0;
  for (const { crest } of ring) { mx += crest[0]; mz += crest[2]; }
  const mid = [mx / ring.length, top, mz / ring.length];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    mb.tri(tex, mid, a.crest, b.crest, [0, 1, 0], uvOf(mid), uvOf(a.crest), uvOf(b.crest));
    bank(a.crest, b.crest, b.toe);
    bank(a.crest, b.toe, a.toe);
  }
  return true;
}

/**
 * @param {?ReturnType<typeof blockHillSeat>} seat
 * @param {Iterable<{modelIdNum:number, matrix:ArrayLike<number>}>} models
 * @param {(placed:{modelIdNum:number, matrix:ArrayLike<number>}) => ?{positions:ArrayLike<number>, doors?:Array<any>}} meshOf
 * @param {(id:number) => ?{positions:ArrayLike<number>, indices:ArrayLike<number>, subMeshes?:Array<{textureArchive:number, textureRecord:number}>}} [drawn]
 * @returns {?{positions:Float32Array, normals:Float32Array, uvs:Float32Array, indices:Uint32Array, subMeshes:Array, doors:Array}}
 */
export function blockHillPatch(seat, models, meshOf, drawn = drawnHillStandIn) {
  if (!seat) return null;
  const hills = [];
  for (const placed of models ?? []) {
    const mesh = drawn(placed.modelIdNum);
    if (mesh) hills.push({ placed, mesh, seat: null });
  }
  const mb = new MeshBuilder(), all = [...(models ?? [])];
  let pads = 0, open = null;
  for (const [owner, placed] of all.entries()) {
    if (drawn(placed.modelIdNum)) continue;
    const mesh = meshOf(placed);
    if (!mesh?.positions?.length) continue;
    const { base, hull } = modelFootprint(mesh.positions, placed.matrix);
    if (hull.length < 3 || base < HILL_SEAT_PLANE) continue;
    let mx = 0, mz = 0;
    for (const [x, z] of hull) { mx += x / hull.length; mz += z / hull.length; }
    if (seat.topAt(mx, mz) === null) continue;
    let high = -Infinity, gap = -Infinity;
    for (const [x, z] of footprintSamples(seat, hull)) {
      const t = seat.topAt(x, z);
      if (t !== null && t > high) high = t;
      gap = Math.max(gap, base - Math.max(t ?? 0, 0));
    }
    if (base - high > HILL_SEAT_STAND || gap <= HILL_PATCH_SINK) continue;
    let on = null, onTop = -Infinity;
    for (const h of hills) {
      const t = (h.seat ??= blockHillSeat([h.placed], drawn))?.topAt(mx, mz) ?? null;
      if (t !== null && t > onTop) { on = h; onTop = t; }
    }
    if (!on) continue;
    const sm = on.mesh.subMeshes?.[0];
    open ??= openPoints(seat, all, meshOf, drawn);
    if (hillPad(mb, seat, hull, base - HILL_PATCH_SINK, sm ? [sm.textureArchive, sm.textureRecord] : GRASS, hillUvAt(on.placed.matrix), open, owner)) pads++;
  }
  if (!pads) return null;
  const patch = mb.build();
  seat.lay(patch);
  return patch;
}
export const RMBRP_STALLS = Object.freeze({
  53100: [49, 5], 53101: [449, 1], 53102: [449, 2], 53103: [449, 3], 53104: [49, 0], 53106: [49, 2], 53107: [49, 3], 53108: [49, 4],
  53109: [49, 5], 53113: [49, 5], 53115: [449, 2], 53117: [49, 0], 53118: [49, 1], 53121: [49, 4], 53122: [49, 5], 53123: [49, 6], 53124: [49, 8],
});
export const RMBRP_STALL_SCALE = 0.75;
export const RMBRP_STALL_FRAME = Object.freeze({
  back: Object.freeze([-2.75, -2.382]), front: Object.freeze([-0.257, 0.118]),
  sides: Object.freeze([Object.freeze([-2.48, -2.105]), Object.freeze([2.02, 2.4])]), tops: Object.freeze([4.4, 3.638]),
  beam: Object.freeze([3.76, 4.138]), lintel: Object.freeze([3.01, 3.388]), valance: 0.5,
  counter: Object.freeze({ x: Object.freeze([-1.07, 0.4]), z: Object.freeze([-1.792, 1.708]), top: 1.388 }),
});
export const RMBRP_STALL_OPEN_FIRST = 53113;
export const RMBRP_STALL_OPEN_SHIFT = Object.freeze([-0.2, 0.206, 0.066]);
const STALL_WOOD = [67, 1], STALL_FRINGE = [49, 9];
function stall(cloth, open = false) {
  const F = RMBRP_STALL_FRAME, [dx, dy, dz] = open ? RMBRP_STALL_OPEN_SHIFT : [0, 0, 0], m = new MeshBuilder();
  const X = (v) => v + dx, Y = (v) => v + dy, Z = (v) => v + dz;
  const block = (tex, [x0, x1], [y0, y1], [z0, z1]) => m.box(tex, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [x1 - x0, y1 - y0, z1 - z0], 0.5);
  for (const side of F.sides) {
    block(STALL_WOOD, F.back.map(X), [0, Y(F.tops[0])], side.map(Z));
    block(STALL_WOOD, F.front.map(X), [0, Y(F.tops[1])], side.map(Z));
  }
  const near = Z(F.sides[0][0]), far = Z(F.sides[1][1]), inner = [Z(F.sides[0][1]), Z(F.sides[1][0])], v = F.valance;
  const [bx, fx, by, fy] = [X(F.back[1]), X(F.front[0]), Y(F.beam[1]), Y(F.lintel[1])], run = Math.hypot(fx - bx, fy - by);
  block(STALL_WOOD, [X(F.back[0]) + 0.01, bx], F.beam.map(Y), inner);
  block(STALL_WOOD, [fx, X(F.front[1]) - 0.005], F.lintel.map(Y), inner);
  const across = inner[1] - inner[0], hem = [[0, 0], [0, -across], [1, -across], [1, 0]];
  for (const [x, top, nx] of [[X(F.back[0]), by, -1], [X(F.front[1]), fy, 1]]) {
    m.sheet(STALL_FRINGE, [x, top - v, inner[0]], [x, top - v, inner[1]], [x, top, inner[1]], [x, top, inner[0]], [nx, 0, 0], hem);
  }
  m.sheet(cloth, [bx, by, near], [bx, by, far], [fx, fy, far], [fx, fy, near], [(by - fy) / run, (fx - bx) / run, 0], [[0, 0], [(far - near) / 2, 0], [(far - near) / 2, -run / 2], [0, -run / 2]]);
  for (const [z, nz] of [[near, -1], [far, 1]]) m.sheet(STALL_FRINGE, [bx, by - v, z], [fx, fy - v, z], [fx, fy, z], [bx, by, z], [0, 0, nz], [[0, 0], [0, -run], [1, -run], [1, 0]]);
  if (!open) block(STALL_WOOD, F.counter.x, [0, F.counter.top], F.counter.z);
  const built = m.build();
  for (let i = 0; i < built.positions.length; i++) built.positions[i] *= RMBRP_STALL_SCALE;
  return built;
}
export const RMBRP_BLOCK_CM = Object.freeze([320, 160, 320]);
export const RMBRP_BLOCK_SCALE = Object.freeze({ 53160: 1, 53170: 2 });
const rmbrpBlock = (id, tex) => () => {
  const m = new MeshBuilder(), k = RMBRP_BLOCK_SCALE[id] / 100;
  m.box(tex, [0, 0, 0], RMBRP_BLOCK_CM.map((c) => c * k), 0.5);
  return m.build();
};
const platform = rmbrpBlock(53160, [361, 1]);
const foundation = rmbrpBlock(53170, [317, 0]);
export const DOME_UNIT = 0.01 * 4.6875;
export const DOME_PROFILE = Object.freeze([[102.4, 1.15], [102.4, 77.4], [94.6, 116.6], [72.4, 149.8], [39.2, 172], [19.7, 175.9], [6.4, 179.8]]);
export const DOME_SPIRE = Object.freeze([[4.8, 205.4], [0, 229.4]]);
export const DOME_BANDS = Object.freeze([116.6, 179.8]);
function domeModel({ low, high, spire = null }) {
  const m = new MeshBuilder(), N = 8, crown = DOME_PROFILE[DOME_PROFILE.length - 1][1];
  const prof = spire ? [...DOME_PROFILE, ...DOME_SPIRE] : [...DOME_PROFILE, [0, crown]];
  const P = (r, y, a) => [Math.cos(a) * r * DOME_UNIT, y * DOME_UNIT, Math.sin(a) * r * DOME_UNIT];
  for (let k = 0; k + 1 < prof.length; k++) {
    const [r0, y0] = prof[k], [r1, y1] = prof[k + 1];
    const tex = y1 <= DOME_BANDS[0] ? low : y1 <= DOME_BANDS[1] ? high : spire;
    const dr = r1 - r0, dy = y1 - y0, l = Math.hypot(dr, dy);
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2, am = (a0 + a1) / 2;
      const n = [(Math.cos(am) * dy) / l, -dr / l, (Math.sin(am) * dy) / l];
      const v0 = -y0 * DOME_UNIT / 2, v1 = -y1 * DOME_UNIT / 2, u0 = i / 2, u1 = (i + 1) / 2;
      if (r1 === 0) m.tri(tex, P(r0, y0, a0), P(r0, y0, a1), P(0, y1, 0), n, [u0, v0], [u1, v0], [(u0 + u1) / 2, v1]);
      else m.quad(tex, P(r0, y0, a0), P(r0, y0, a1), P(r1, y1, a1), P(r1, y1, a0), n, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
    }
  }
  return m.build();
}
export const DOCK_SCALE = 2;
const DOCK_PLANK = [67, 7], DOCK_PILE = [67, 2];
export const RMBRP_DOCKS = Object.freeze({
  53140: Object.freeze({ decks: [[-1, 1, 1, 5]], piles: [[-1, 1], [1, 1], [-1, 5], [1, 5]] }),
  53141: Object.freeze({ decks: [[-1, 1, 0, 5]], piles: [[-1, 0.1], [1, 0.1], [-1, 2.635], [1, 2.635], [-1, 5], [1, 5]] }),
  53142: Object.freeze({
    decks: [[-1, 1, 0, 5], [-3.5, -1, 3.5, 5], [1, 3.5, 3.5, 5]],
    piles: [[-1, 0.1], [1, 0.1], [-1, 3.5], [1, 3.5], [-1, 5], [1, 5], [-3.5, 3.5], [3.5, 3.5], [-3.5, 5], [3.5, 5]],
  }),
});
const dockPoint = (x, y, z) => [-x * DOCK_SCALE, y * DOCK_SCALE, z * DOCK_SCALE];
function dock({ decks, piles }) {
  const m = new MeshBuilder(), S = DOCK_SCALE;
  for (const [x0, x1, z0, z1] of decks) m.box(DOCK_PLANK, dockPoint((x0 + x1) / 2, -0.05, (z0 + z1) / 2), [(x1 - x0) * S, 0.1 * S, (z1 - z0) * S], 0.5);
  for (const [x, z] of piles) m.cylinderY(DOCK_PILE, dockPoint(x, -2.5, z), 0.15 * S, 3 * S, 5, 1);
  return m.build();
}
export function prismZ(m, tex, corners, z0, z1) {
  let area = 0;
  for (let i = 0; i < corners.length; i++) { const a = corners[i], b = corners[(i + 1) % corners.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const pts = area < 0 ? [...corners].reverse() : corners;
  const at = (p, z) => [p[0], p[1], z];
  m.quad(tex, ...pts.map((p) => at(p, z1)), [0, 0, 1]);
  m.quad(tex, ...[...pts].reverse().map((p) => at(p, z0)), [0, 0, -1]);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], d = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(...d) || 1;
    m.quad(tex, at(a, z0), at(b, z0), at(b, z1), at(a, z1), [d[1] / l, -d[0] / l, 0]);
  }
}
function dockRamp() {
  const m = new MeshBuilder(), S = DOCK_SCALE;
  const [ax, ay] = dockPoint(0, 0, 0), [bx, by] = dockPoint(0, -0.2, 0), [cx, cy] = dockPoint(-2, -0.7, 0), [dx, dy] = dockPoint(-2, -0.5, 0);
  prismZ(m, DOCK_PLANK, [[ax, ay], [bx, by], [cx, cy], [dx, dy]].reverse(), -2 * S, 0);
  return m.build();
}
function dockSteps() {
  const m = new MeshBuilder(), S = DOCK_SCALE;
  for (let k = 0; k < 5; k++) m.box(DOCK_PLANK, dockPoint(-0.3 * (k + 0.5), -0.1 * k - 0.025, -1), [0.3 * S, 0.05 * S, 2 * S], 0.5);
  for (const [z0, z1] of [[-1.9, -1.7], [-0.3, -0.1]]) {
    const pts = [[0, -0.05], [-1.5, -0.55], [-1.5, -0.6], [0, -0.1]].map(([x, y]) => dockPoint(x, y, 0).slice(0, 2));
    prismZ(m, DOCK_PLANK, pts, z0 * S, z1 * S);
  }
  return m.build();
}

export const RMBRP_PIECES = Object.freeze({
  ...Object.fromEntries(Object.keys(RMBRP_ROCKS).map((id) => [id, () => rockMesh(id)])),
  ...Object.fromEntries(Object.entries(RMBRP_HILLS).map(([id, surface]) => [id, () => hillMesh(RMBRP_HILL_SHAPES[id], surface)])),
  ...Object.fromEntries(Object.entries(RMBRP_STALLS).map(([id, cloth]) => [id, () => stall(cloth, Number(id) >= RMBRP_STALL_OPEN_FIRST)])),
  53160: platform,
  53170: foundation,
  53182: () => domeModel({ low: [12, 1], high: [6, 2], spire: [6, 3] }), 53187: () => domeModel({ low: [38, 1], high: [38, 1] }),
  53194: () => domeModel({ low: [12, 1], high: [6, 3], spire: [6, 3] }),
  ...Object.fromEntries(Object.entries(RMBRP_DOCKS).map(([id, spec]) => [id, () => dock(spec)])),
  53143: dockRamp, 53144: dockSteps,
});

export const CITY_WALL_PIECE = 53210;
export const CITY_WALL_MODEL = 445;
export const CITY_WALL_FILL = Object.freeze({ x: 128, z: 128, length: 128, lift: 1 });

// Float32 positions put a face meant for x = 1.6 m at 1.600000023841858, a hair outside the slab.
const SLICE_ON_PLANE_M = 1e-5;
export function sliceModelX(model, x0, x1) {
  const { positions: P, normals: N, uvs: T, indices: I } = model;
  const vert = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2], N[i * 3], N[i * 3 + 1], N[i * 3 + 2], T[i * 2], T[i * 2 + 1]];
  const snap = (d) => (Math.abs(d) <= SLICE_ON_PLANE_M ? 0 : d);
  const below = (v) => snap(v[0] - x0), above = (v) => snap(x1 - v[0]);
  const clip = (poly, side) => {
    const out = [];
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length], da = side(a), db = side(b);
      if (da >= 0) out.push(a);
      if ((da > 0 && db < 0) || (da < 0 && db > 0)) { const s = da / (da - db); out.push(a.map((v, j) => v + (b[j] - v) * s)); }
    }
    return out;
  };
  const pos = [], nrm = [], uv = [], idx = [], subMeshes = [];
  const push = (v) => {
    const l = Math.hypot(v[3], v[4], v[5]) || 1;
    pos.push(v[0], v[1], v[2]); nrm.push(v[3] / l, v[4] / l, v[5] / l); uv.push(v[6], v[7]);
    return pos.length / 3 - 1;
  };
  const area2 = (a, b, c) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    return Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]);
  };
  for (const sm of model.subMeshes) {
    const start = idx.length;
    for (let t = sm.startIndex; t < sm.startIndex + sm.primitiveCount * 3; t += 3) {
      const tri = [vert(I[t]), vert(I[t + 1]), vert(I[t + 2])];
      if (tri.every((v) => below(v) === 0) && !(tri[0][3] < 0)) continue;
      if (tri.every((v) => above(v) === 0) && !(tri[0][3] > 0)) continue;
      const poly = clip(clip(tri, below), above);
      for (let k = 1; k < poly.length - 1; k++) {
        if (area2(poly[0], poly[k], poly[k + 1]) < 1e-12) continue;
        idx.push(push(poly[0]), push(poly[k]), push(poly[k + 1]));
      }
    }
    const count = (idx.length - start) / 3;
    if (count) subMeshes.push({ textureArchive: sm.textureArchive, textureRecord: sm.textureRecord, startIndex: start, primitiveCount: count });
  }
  if (!idx.length) return null;
  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), uvs: new Float32Array(uv), indices: new Uint32Array(idx), subMeshes, doors: [] };
}

export function cityWallFillModel(wall) {
  if (!wall?.positions?.length) return null;
  const half = (CITY_WALL_FILL.length / 2) * U;
  const cut = sliceModelX(wall, -half, half);
  if (!cut) return null;
  const d = [CITY_WALL_FILL.x * U, CITY_WALL_FILL.lift * U, CITY_WALL_FILL.z * U];
  for (let i = 0; i < cut.positions.length; i++) cut.positions[i] += d[i % 3];
  return cut;
}

export const TOWN_CLUTTER = Object.freeze({
  1: [200, 1], 2: [205, 12], 3: [209, 3], 7: [200, 0], 16: [205, 9], 18: [209, 7], 19: [205, 11], 20: [200, 3],
  21: [205, 14], 22: [205, 1], 23: [209, 5], 24: [205, 15], 25: [200, 2],
  4: [209, 0], 5: [205, 4], 8: [205, 2], 9: [209, 6], 10: [205, 31], 11: [209, 1], 12: [205, 3], 13: [205, 7], 14: [209, 2],
});
export const TOWN_CLUTTER_ARCHIVE = 56790;

export const TOWN_GARDEN = Object.freeze({ 1: [301, 18], 2: [301, 12], 3: [301, 15], 4: [301, 16], 5: [301, 13], 6: [301, 14], 7: [301, 17] });
export const TOWN_GARDEN_ARCHIVE = 10035;

let _installed = false;
export function installTownStandIns(isOn = () => true) {
  if (_installed) return 0;
  _installed = true;
  let n = installDetStandIns(isOn);
  shareDetailedShipsArt(isOn);
  for (let k = 0; k < TOWN_BED_COUNT; k++) {
    const { model, colour } = townBedOf(TOWN_BED_FIRST + k);
    registerModelAlias(TOWN_BED_FIRST + k, { model, remap: bedRemap(colour) }, isOn);
  }
  for (const [id, spec] of Object.entries(TOWN_PAINTINGS)) registerCustomModel(Number(id), () => paintingModel(spec), isOn);
  for (const [id, build] of Object.entries(ROSYS_PIECES)) registerCustomModel(Number(id), build, isOn);
  for (const [id, spec] of Object.entries(TOWN_CROP_FIELDS)) registerFlatField(Number(id), spec, isOn);
  for (const [id, build] of Object.entries(RMBRP_PIECES)) registerCustomModel(Number(id), build, isOn);
  registerCustomModel(CITY_WALL_PIECE, (ctx) => cityWallFillModel(ctx?.classicModel?.(CITY_WALL_MODEL)), isOn, { needs: [CITY_WALL_MODEL] });
  const cloths = [];
  for (const [colour, c] of TOWN_BED_COLOURS.entries()) {
    for (const [cloth, rec] of TOWN_BEDCLOTHS.entries()) {
      cloths.push({
        archive: TOWN_BED_ARCHIVE, record: bedclothRecord(colour, cloth), fileName: `town-bedcloth-${c.name}-90_${rec}`, standIn: true, gate: isOn,
        build: async (ctx) => recolourBedcloth(await ctx.classicRgba(90, rec), c),
      });
    }
  }
  n += addVendorTextures(cloths.map((e) => ({ ...e, yields: true })));
  const classicPicture = (archive, name) => ([record, from]) => ({
    archive, record: Number(record), fileName: `town-${name}-${archive}_${record}`, standIn: true, gate: isOn,
    build: async (ctx) => ({ ...(await buildDerivedPicture({ from }, ctx.classicRgba)), scale: (await ctx.classicScale?.(from[0], from[1])) ?? null }),
  });
  n += addVendorTextures(Object.entries(TOWN_CLUTTER).map(classicPicture(TOWN_CLUTTER_ARCHIVE, 'clutter')).map((e) => ({ ...e, yields: true })));
  n += addVendorTextures(Object.entries(TOWN_GARDEN).map(classicPicture(TOWN_GARDEN_ARCHIVE, 'garden')).map((e) => ({ ...e, yields: true })));
  return n;
}
export function _resetTownStandIns() { _installed = false; }
