// @ts-check
import { ILIAC_CARDS, ILIAC_LOCATIONS, cardById } from '../net/iliacCards.js';
import { plateModel, cardMatrix } from './cardTableDraw.js';
import { paintIliacCard, paintIliacBack } from './iliacCardFaces.js';
import { toColor32 } from '../formats/color32Order.js';

export const ILIAC_ARCHIVE = 'iliac-cards';
export const ILIAC_RECORD = 'atlas';
export const ILIAC_CELL_W = 100;
export const ILIAC_CELL_H = 140;
export const ILIAC_CLOTH_CARDS = Object.freeze([...ILIAC_CARDS.map((c) => c.id), ...ILIAC_LOCATIONS.map((c) => c.id)]);
export const ILIAC_ATLAS_COLS = 10;
export const ILIAC_ATLAS_ROWS = Math.ceil(ILIAC_CLOTH_CARDS.length / ILIAC_ATLAS_COLS) + 1;
export const ILIAC_ATLAS_W = ILIAC_CELL_W * ILIAC_ATLAS_COLS;
export const ILIAC_ATLAS_H = ILIAC_CELL_H * ILIAC_ATLAS_ROWS;
const LAST_ROW = ILIAC_ATLAS_ROWS - 1;
export const ILIAC_CELL_BACK = Object.freeze([0, LAST_ROW]);
export const ILIAC_CELL_STOCK = Object.freeze([1, LAST_ROW]);
const INDEX = new Map(ILIAC_CLOTH_CARDS.map((id, i) => [id, i]));

export function iliacAtlasCell(/** @type {any} */ id) {
  const i = INDEX.get(id);
  return i === undefined ? ILIAC_CELL_BACK.slice() : [i % ILIAC_ATLAS_COLS, Math.floor(i / ILIAC_ATLAS_COLS)];
}
export function iliacCellUv(/** @type {readonly number[]} */ [col, row]) {
  const u0 = (col * ILIAC_CELL_W + 0.5) / ILIAC_ATLAS_W, u1 = ((col + 1) * ILIAC_CELL_W - 0.5) / ILIAC_ATLAS_W;
  const v1 = 1 - (row * ILIAC_CELL_H + 0.5) / ILIAC_ATLAS_H, v0 = 1 - ((row + 1) * ILIAC_CELL_H - 0.5) / ILIAC_ATLAS_H;
  return [u0, v0, u1, v1];
}
const onAtlas = (indices) => [{ textureArchive: ILIAC_ARCHIVE, textureRecord: ILIAC_RECORD, startIndex: 0, primitiveCount: indices.length / 3 }];
export const iliacCardModel = (/** @type {readonly number[]} */ cell) => plateModel(iliacCellUv(cell), iliacCellUv(ILIAC_CELL_BACK), iliacCellUv(ILIAC_CELL_STOCK), onAtlas);

export function paintIliacAtlas(/** @type {CanvasRenderingContext2D} */ ctx) {
  ctx.clearRect(0, 0, ILIAC_ATLAS_W, ILIAC_ATLAS_H);
  const cell = (/** @type {readonly number[]} */ [col, row], /** @type {() => void} */ paint) => { ctx.save(); ctx.translate(col * ILIAC_CELL_W, row * ILIAC_CELL_H); paint(); ctx.restore(); };
  ILIAC_CLOTH_CARDS.forEach((id) => cell(iliacAtlasCell(id), () => paintIliacCard(ctx, cardById(id), ILIAC_CELL_W, ILIAC_CELL_H)));
  cell(ILIAC_CELL_BACK, () => paintIliacBack(ctx, ILIAC_CELL_W, ILIAC_CELL_H));
  cell(ILIAC_CELL_STOCK, () => { ctx.fillStyle = '#efe6cf'; ctx.fillRect(0, 0, ILIAC_CELL_W, ILIAC_CELL_H); });
}

/**
 * @param {any} renderer
 * @param {{doc?: any}} [opts]
 */
export function createIliacTableDraw(renderer, { doc = globalThis.document } = {}) {
  let ready = false, alive = true, back = null;
  const meshes = new Map();
  const build = () => {
    if (ready || !renderer?.createMesh || !doc?.createElement) return;
    const canvas = doc.createElement('canvas');
    canvas.width = ILIAC_ATLAS_W; canvas.height = ILIAC_ATLAS_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    paintIliacAtlas(ctx);
    const img = ctx.getImageData(0, 0, ILIAC_ATLAS_W, ILIAC_ATLAS_H);
    renderer.uploadTexture(ILIAC_ARCHIVE, ILIAC_RECORD, toColor32({ width: ILIAC_ATLAS_W, height: ILIAC_ATLAS_H, data: new Uint8Array(img.data.buffer) }));
    back = renderer.createMesh(iliacCardModel(ILIAC_CELL_BACK));
    ready = true;
  };
  const meshOf = (id) => {
    if (!INDEX.has(id)) return back;
    let m = meshes.get(id);
    if (!m) { m = renderer.createMesh(iliacCardModel(iliacAtlasCell(id))); meshes.set(id, m); }
    return m;
  };
  return {
    draw(/** @type {any[]} */ cards = []) {
      if (!alive) return;
      build();
      if (!ready) return;
      for (const c of cards) renderer.drawMesh(meshOf(c.card), cardMatrix(c.pos, c.yaw, c.roll ?? 0), null, { noShadow: true });
    },
    meshCount: () => meshes.size + (back ? 1 : 0),
    destroy() {
      if (!alive) return;
      alive = false;
      if (!ready) return;
      for (const m of [...meshes.values(), back]) renderer.destroyMesh?.(m);
      renderer.releaseTexture?.(ILIAC_ARCHIVE, ILIAC_RECORD);
      meshes.clear();
      back = null;
      ready = false;
    },
  };
}
