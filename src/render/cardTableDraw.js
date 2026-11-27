// @ts-check
import { rankOf, suitOf, isCard } from '../net/cardLaw.js';
import { CARD_W, CARD_L, CARD_T, CHIP_R, CHIP_T, CHIP_VALUES } from '../world/cardMotion.js';
import { trs } from '../world/mat4.js';
import { toColor32 } from '../formats/color32Order.js';
import { paintFace, paintBack, STOCK } from './cardFaces.js';

// A string archive, so the renderer uploads the atlas without mipmaps.
export const CARD_ARCHIVE = 'cards';
export const CARD_RECORD = 'atlas';
export const CARD_CELL_W = 128;
export const CARD_CELL_H = 180;
export const CARD_ATLAS_COLS = 13;
export const CARD_ATLAS_ROWS = 5;
export const ATLAS_W = CARD_CELL_W * CARD_ATLAS_COLS;
export const ATLAS_H = CARD_CELL_H * CARD_ATLAS_ROWS;
export const CELL_BACK = Object.freeze([0, 4]);
export const CELL_STOCK = Object.freeze([1, 4]);
export const chipCell = (i) => [2 + i, 4];
export const CHIP_COLOURS = Object.freeze(['#6a2c8a', '#1a1a1a', '#1d6b2a', '#a51c1c', '#e8e2d0']);

export const atlasCell = (c) => (isCard(c) ? [rankOf(c), suitOf(c)] : CELL_BACK.slice());

// Each rectangle is inset half a texel against bleeding, with v up: the upload puts the picture's top at v = 1.
/** @param {readonly number[]} cell */
export function cellUv(cell) {
  const [col, row] = cell;
  const u0 = (col * CARD_CELL_W + 0.5) / ATLAS_W, u1 = ((col + 1) * CARD_CELL_W - 0.5) / ATLAS_W;
  const v1 = 1 - (row * CARD_CELL_H + 0.5) / ATLAS_H, v0 = 1 - ((row + 1) * CARD_CELL_H - 0.5) / ATLAS_H;
  return [u0, v0, u1, v1];
}

const onAtlas = (indices) => [{ textureArchive: CARD_ARCHIVE, textureRecord: CARD_RECORD, startIndex: 0, primitiveCount: indices.length / 3 }];

/** @param {readonly number[]} face */
export function cardModel(face) {
  return plateModel(cellUv(face), cellUv(CELL_BACK), cellUv(CELL_STOCK), onAtlas);
}

/**
 * @param {readonly number[]} faceUv @param {readonly number[]} backUv @param {readonly number[]} edgeUv
 * @param {(indices: number[]) => any[]} subMeshes
 */
export function plateModel(faceUv, backUv, edgeUv, subMeshes) {
  const w = CARD_W / 2, l = CARD_L / 2, t = CARD_T / 2;
  const positions = [], normals = [], uvs = [], indices = [];
  const quad = (corners, n, uv) => {
    const base = positions.length / 3;
    corners.forEach((c, i) => { positions.push(...c); normals.push(...n); uvs.push(...uv[i]); });
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  const [fu0, fv0, fu1, fv1] = faceUv, [bu0, bv0, bu1, bv1] = backUv, [su0, sv0, su1, sv1] = edgeUv;
  // The world has left-handed axes (mirrorProjectionX), so seen from above with +Z away, +X runs right.
  quad([[-w, t, -l], [w, t, -l], [w, t, l], [-w, t, l]], [0, 1, 0], [[fu0, fv0], [fu1, fv0], [fu1, fv1], [fu0, fv1]]);
  quad([[-w, -t, l], [w, -t, l], [w, -t, -l], [-w, -t, -l]], [0, -1, 0], [[bu0, bv1], [bu1, bv1], [bu1, bv0], [bu0, bv0]]);
  const s = [[su0, sv0], [su1, sv0], [su1, sv1], [su0, sv1]];
  quad([[w, -t, -l], [w, -t, l], [w, t, l], [w, t, -l]], [1, 0, 0], s);
  quad([[-w, -t, l], [-w, -t, -l], [-w, t, -l], [-w, t, l]], [-1, 0, 0], s);
  quad([[-w, -t, l], [-w, t, l], [w, t, l], [w, -t, l]], [0, 0, 1], s);
  quad([[w, -t, -l], [w, t, -l], [-w, t, -l], [-w, -t, -l]], [0, 0, -1], s);
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), indices: new Uint32Array(indices), subMeshes: subMeshes(indices) };
}

export const CHIP_SIDES = 16;

/** @param {number} valueIndex */
export function chipModel(valueIndex) {
  const [u0, v0, u1, v1] = cellUv(chipCell(valueIndex));
  const um = (u0 + u1) / 2, vBody = v0 + (v1 - v0) * 0.35, vBand = v0 + (v1 - v0) * 0.9;
  const positions = [], normals = [], uvs = [], indices = [];
  const h = CHIP_T / 2;
  const ring = (k) => [Math.cos((k / CHIP_SIDES) * 2 * Math.PI), Math.sin((k / CHIP_SIDES) * 2 * Math.PI)];
  for (const [y, ny] of [[h, 1], [-h, -1]]) {
    const c = positions.length / 3;
    positions.push(0, y, 0); normals.push(0, ny, 0); uvs.push(um, vBody);
    for (let k = 0; k < CHIP_SIDES; k++) { const [x, z] = ring(k); positions.push(x * CHIP_R, y, z * CHIP_R); normals.push(0, ny, 0); uvs.push(um + (u1 - um) * 0.6 * x, vBody); }
    for (let k = 0; k < CHIP_SIDES; k++) {
      const a = c + 1 + k, b = c + 1 + ((k + 1) % CHIP_SIDES);
      if (ny > 0) indices.push(c, b, a); else indices.push(c, a, b);
    }
  }
  for (let k = 0; k < CHIP_SIDES; k++) {
    const [x0, z0] = ring(k), [x1, z1] = ring(k + 1);
    const base = positions.length / 3;
    positions.push(x0 * CHIP_R, -h, z0 * CHIP_R, x1 * CHIP_R, -h, z1 * CHIP_R, x1 * CHIP_R, h, z1 * CHIP_R, x0 * CHIP_R, h, z0 * CHIP_R);
    normals.push(x0, 0, z0, x1, 0, z1, x1, 0, z1, x0, 0, z0);
    uvs.push(u0, vBand, u1, vBand, u1, v1, u0, v1);
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), indices: new Uint32Array(indices), subMeshes: onAtlas(indices) };
}

export const cardMatrix = (pos, yaw, roll = 0) => trs(pos[0], pos[1], pos[2], 0, (yaw * 180) / Math.PI, (roll * 180) / Math.PI);

/** @param {CanvasRenderingContext2D} ctx */
export function paintAtlas(ctx) {
  ctx.clearRect(0, 0, ATLAS_W, ATLAS_H);
  const cell = (col, row, paint) => { ctx.save(); ctx.translate(col * CARD_CELL_W, row * CARD_CELL_H); paint(); ctx.restore(); };
  const stock = () => { ctx.fillStyle = STOCK; ctx.fillRect(0, 0, CARD_CELL_W, CARD_CELL_H); };
  for (let c = 0; c < 52; c++) cell(rankOf(c), suitOf(c), () => paintFace(ctx, c, CARD_CELL_W, CARD_CELL_H));
  cell(CELL_BACK[0], CELL_BACK[1], () => paintBack(ctx, CARD_CELL_W, CARD_CELL_H));
  cell(CELL_STOCK[0], CELL_STOCK[1], stock);
  CHIP_VALUES.forEach((_, i) => {
    const [c, r] = chipCell(i);
    cell(c, r, () => {
      ctx.fillStyle = CHIP_COLOURS[i]; ctx.fillRect(0, 0, CARD_CELL_W, CARD_CELL_H);
      ctx.fillStyle = '#f2ead6'; ctx.fillRect(0, 0, CARD_CELL_W, CARD_CELL_H * 0.2);
      for (let k = 0; k < 4; k++) ctx.fillRect(k * CARD_CELL_W / 4 + CARD_CELL_W / 16, 0, CARD_CELL_W / 10, CARD_CELL_H * 0.2 + 2);
    });
  });
}

/**
 * @param {any} renderer
 * @param {{doc?: any}} [opts]
 */
export function createCardTableDraw(renderer, { doc = globalThis.document } = {}) {
  let faces = null, back = null, chips = null, alive = true;
  const build = () => {
    if (faces || !renderer?.createMesh || !doc?.createElement) return;
    const canvas = doc.createElement('canvas');
    canvas.width = ATLAS_W; canvas.height = ATLAS_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    paintAtlas(ctx);
    const img = ctx.getImageData(0, 0, ATLAS_W, ATLAS_H);
    renderer.uploadTexture(CARD_ARCHIVE, CARD_RECORD, toColor32({ width: ATLAS_W, height: ATLAS_H, data: new Uint8Array(img.data.buffer) }));
    faces = Array.from({ length: 52 }, (_, c) => renderer.createMesh(cardModel(atlasCell(c))));
    back = renderer.createMesh(cardModel(CELL_BACK));
    chips = CHIP_VALUES.map((_, i) => renderer.createMesh(chipModel(i)));
  };
  return {
    draw({ cards = [], chips: discs = [] } = {}) {
      if (!alive) return;
      build();
      if (!faces) return;
      for (const c of cards) renderer.drawMesh(isCard(c.card) ? faces[c.card] : back, c.matrix ?? cardMatrix(c.pos, c.yaw, c.roll), null, { noShadow: true });
      for (const d of discs) { const i = CHIP_VALUES.indexOf(d.value); if (i >= 0) renderer.drawMesh(chips[i], cardMatrix(d.pos, 0), null, { noShadow: true }); }
    },
    destroy() {
      if (!alive) return;
      alive = false;
      if (!faces) return;
      for (const m of [...faces, back, ...chips]) renderer.destroyMesh?.(m);
      renderer.releaseTexture?.(CARD_ARCHIVE, CARD_RECORD);
      faces = back = chips = null;
    },
  };
}
