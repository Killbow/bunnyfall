// @ts-check
import { seatSpots } from './cardTables.js';

export const CARD_TABLE_ARCHIVE = 'cardtable';
export const FELT_RECORD = 'felt';
export const WOOD_RECORD = 'wood';
export const GOLD_FELT_RECORD = 'feltgold';
export const CARD_TABLE_W = 1.5;
export const CARD_TABLE_D = 1;
export const CARD_TABLE_TOP = 0.8;
export const CARD_TABLE_SLAB = 0.06;
export const CARD_TABLE_RAIL = 0.04;
export const CARD_TABLE_FELT_LIFT = 0.002;
export const CARD_TABLE_LEG = 0.07;
export const CARD_TABLE_LEG_IN = 0.1;
// `STOOL_TOP` must stay under `SEAT_SURFACE_MAX` in cardTables.js so the seat probe treats the stool as something
// to sit over.
export const STOOL_W = 0.34;
export const STOOL_TOP = 0.48;
export const STOOL_SEAT = 0.04;
export const STOOL_LEG = 0.04;
export const STOOL_LEG_IN = 0.03;
export const WOOD_TILE_M = 0.5;
export const CARD_TABLE_TEX = 64;
export const FELT_RGB = Object.freeze([31, 90, 55]);
export const WOOD_RGB = Object.freeze([107, 66, 38]);
export const GOLD_FELT_RGB = Object.freeze([118, 26, 34]);

export const CARD_TABLE_BOX = Object.freeze({
  min: Object.freeze([-CARD_TABLE_W / 2, 0, -CARD_TABLE_D / 2]),
  max: Object.freeze([CARD_TABLE_W / 2, CARD_TABLE_TOP + CARD_TABLE_FELT_LIFT, CARD_TABLE_D / 2]),
});

export function cardTablePropModel({ felt: feltRecord = FELT_RECORD } = {}) {
  const positions = [], normals = [], uvs = [];
  const wood = [], felt = [];
  const quad = (out, corners, n, uv) => {
    const base = positions.length / 3;
    corners.forEach((c, i) => { positions.push(...c); normals.push(...n); uvs.push(...uv(c, i)); });
    out.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  const woodUv = (n, upright) => {
    const [u, v] = n[1] !== 0 ? [0, 2] : upright ? [1, n[0] !== 0 ? 2 : 0] : [n[0] !== 0 ? 2 : 0, 1];
    return (c) => [c[u] / WOOD_TILE_M, c[v] / WOOD_TILE_M];
  };
  const box = (x0, x1, y0, y1, z0, z1, { top = true, upright = false } = {}) => {
    const face = (corners, n) => quad(wood, corners, n, woodUv(n, upright));
    if (top) face([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0]);
    face([[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]], [0, -1, 0]);
    face([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], [1, 0, 0]);
    face([[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]], [-1, 0, 0]);
    face([[x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1]], [0, 0, 1]);
    face([[x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z0]], [0, 0, -1]);
  };
  const legs = (hx, hz, inset, l, under, ox = 0, oz = 0) => {
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const cx = ox + sx * (hx - inset - l / 2), cz = oz + sz * (hz - inset - l / 2);
      box(cx - l / 2, cx + l / 2, 0, under, cz - l / 2, cz + l / 2, { top: false, upright: true });
    }
  };
  const w = CARD_TABLE_W / 2, d = CARD_TABLE_D / 2, under = CARD_TABLE_TOP - CARD_TABLE_SLAB;
  box(-w, w, under, CARD_TABLE_TOP, -d, d);
  legs(w, d, CARD_TABLE_LEG_IN, CARD_TABLE_LEG, under);
  const sw = STOOL_W / 2, sUnder = STOOL_TOP - STOOL_SEAT;
  for (const s of seatSpots(CARD_TABLE_BOX)) {
    box(s.lx - sw, s.lx + sw, sUnder, STOOL_TOP, s.lz - sw, s.lz + sw);
    legs(sw, sw, STOOL_LEG_IN, STOOL_LEG, sUnder, s.lx, s.lz);
  }
  const fw = w - CARD_TABLE_RAIL, fd = d - CARD_TABLE_RAIL, fy = CARD_TABLE_TOP + CARD_TABLE_FELT_LIFT;
  const feltUv = [[0, 0], [1, 0], [1, 1], [0, 1]];
  quad(felt, [[-fw, fy, -fd], [fw, fy, -fd], [fw, fy, fd], [-fw, fy, fd]], [0, 1, 0], (_, i) => feltUv[i]);
  return {
    positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs),
    indices: new Uint32Array([...wood, ...felt]),
    subMeshes: [
      { textureArchive: CARD_TABLE_ARCHIVE, textureRecord: WOOD_RECORD, startIndex: 0, primitiveCount: wood.length / 3 },
      { textureArchive: CARD_TABLE_ARCHIVE, textureRecord: feltRecord, startIndex: wood.length, primitiveCount: felt.length / 3 },
    ],
  };
}

export function texelNoise(x, y, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function painted(rgb) {
  const n = CARD_TABLE_TEX, colors = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const [r, g, b] = rgb(x, y), o = (y * n + x) * 4;
    colors[o] = r; colors[o + 1] = g; colors[o + 2] = b; colors[o + 3] = 255;
  }
  return { width: n, height: n, colors };
}

export const paintFelt = (rgb = FELT_RGB) => painted((x, y) => {
  const k = 0.9 + 0.2 * texelNoise(x, y, 1);
  return rgb.map((c) => Math.round(c * k));
});

export function uploadCardTableArt(renderer, felt, rgb, { wood = true } = {}) {
  const art = /** @type {const} */ ([[WOOD_RECORD, wood, paintWood], [felt, true, () => paintFelt(rgb)]]);
  for (const [record, want, paint] of art) {
    if (want && !renderer.heldTexture?.(CARD_TABLE_ARCHIVE, record, { mips: true, opaque: true })) renderer.uploadTexture(CARD_TABLE_ARCHIVE, record, paint(), { mips: true, opaque: true });
  }
}

export const paintWood = () => painted((x, y) => {
  const k = 0.8 + 0.25 * texelNoise(0, y, 2) + 0.06 * texelNoise(x, y, 3);
  return WOOD_RGB.map((c) => Math.round(c * k));
});
