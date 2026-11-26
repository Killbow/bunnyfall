// @ts-check
import { KG_COLS, KG_ROWS, KG_ROSTER, KG_TILE, KG_LAYOUTS, KG_OPEN_FIELD } from '../net/kingsGambit.js';
import { plateModel } from './cardTableDraw.js';
import { paintIliacCard, paintIliacBack } from './iliacCardFaces.js';
import { paintFace, RANK_KING } from './cardFaces.js';
import { cardById } from '../net/iliacCards.js';
import { FOE_CARDS } from '../cards/cardSources.js';
import { CARD_W, CARD_L, CARD_T, ARC_HEIGHT } from '../world/cardMotion.js';
import { toColor32 } from '../formats/color32Order.js';
import {
  gambitCardYaw, GAMBIT_CARD_SHARE, GAMBIT_MAT_LIFT, GAMBIT_WALL_H, GAMBIT_PILLAR_H, GAMBIT_PILLAR_R, GAMBIT_WATER_DROP,
  GAMBIT_DISC_SHARE, GAMBIT_DISC_H, GAMBIT_SELECT_LIFT, GAMBIT_CARD_FOOT, gambitCardHeight,
} from '../world/gambitCloth.js';
import { gambitPileStep } from '../world/gambitMotion.js';

export { GAMBIT_CARD_SHARE };

export const GAMBIT_ARCHIVE = 'kings-gambit';
export const GAMBIT_ATLAS = 'atlas';
export const GAMBIT_ATLAS_HURT = 'atlas-hurt';
export const GAMBIT_ATLAS_GLOW = 'atlas-glow';
export const GAMBIT_MAT = 'mat';
export const GAMBIT_FX = 'fx';
export const GAMBIT_CELL_W = 64;
export const GAMBIT_CELL_H = 90;
export const GAMBIT_ATLAS_COLS = 10;
export const GAMBIT_ATLAS_KEYS = Object.freeze([...KG_ROSTER.map((u) => `u${u.id}`), 'k0', 'k1', 'k2', 'k3', 'back']);
export const GAMBIT_ATLAS_W = GAMBIT_CELL_W * GAMBIT_ATLAS_COLS;
export const GAMBIT_ATLAS_H = GAMBIT_CELL_H * Math.ceil(GAMBIT_ATLAS_KEYS.length / GAMBIT_ATLAS_COLS);
export const GAMBIT_MAT_CELL_PX = 32;
export const GAMBIT_INKS = Object.freeze({ outline: '#050608', bone: '#e9e4d9', stone: '#2b2a2e', brass: '#f3cf86', brassLo: '#c9a24a', blood: '#b83a2e' });
export const GAMBIT_BAR_GAP = 0.006;
export const GAMBIT_BAR_H = 0.08;
export const GAMBIT_HURT_TINT = Object.freeze(['#d0281e', 0.5]);
export const GAMBIT_GLOW_TINT = Object.freeze(['#46d25a', 0.45]);
export const GAMBIT_REMAP_HURT = new Map([[`${GAMBIT_ARCHIVE}_${GAMBIT_ATLAS}`, `${GAMBIT_ARCHIVE}_${GAMBIT_ATLAS_HURT}`]]);
export const GAMBIT_REMAP_GLOW = new Map([[`${GAMBIT_ARCHIVE}_${GAMBIT_ATLAS}`, `${GAMBIT_ARCHIVE}_${GAMBIT_ATLAS_GLOW}`]]);

export const gambitAtlasCell = (/** @type {string} */ key) => { const i = Math.max(0, GAMBIT_ATLAS_KEYS.indexOf(key)); return [i % GAMBIT_ATLAS_COLS, Math.floor(i / GAMBIT_ATLAS_COLS)]; };
export function gambitCellUv(/** @type {number[]} */ [col, row]) {
  const u0 = (col * GAMBIT_CELL_W + 0.5) / GAMBIT_ATLAS_W, u1 = ((col + 1) * GAMBIT_CELL_W - 0.5) / GAMBIT_ATLAS_W;
  const v1 = 1 - (row * GAMBIT_CELL_H + 0.5) / GAMBIT_ATLAS_H, v0 = 1 - ((row + 1) * GAMBIT_CELL_H - 0.5) / GAMBIT_ATLAS_H;
  return [u0, v0, u1, v1];
}
/** @param {{king: boolean, side: number, unit: number}} p @param {number[]} crowns */
export const pieceAtlasKey = (p, crowns) => (p.king ? `k${crowns[p.side]}` : `u${p.unit}`);

export function paintGambitAtlas(/** @type {any} */ ctx) {
  ctx.clearRect(0, 0, GAMBIT_ATLAS_W, GAMBIT_ATLAS_H);
  const cell = (/** @type {string} */ key, /** @type {() => void} */ paint) => {
    const [c, r] = gambitAtlasCell(key);
    ctx.save(); ctx.translate(c * GAMBIT_CELL_W, r * GAMBIT_CELL_H); paint(); ctx.restore();
  };
  for (const u of KG_ROSTER) cell(`u${u.id}`, () => paintIliacCard(ctx, cardById(FOE_CARDS[u.id]), GAMBIT_CELL_W, GAMBIT_CELL_H, undefined, { picture: true }));
  for (let k = 0; k < 4; k++) cell(`k${k}`, () => paintFace(ctx, k * 13 + RANK_KING, GAMBIT_CELL_W, GAMBIT_CELL_H));
  cell('back', () => paintIliacBack(ctx, GAMBIT_CELL_W, GAMBIT_CELL_H));
}
/**
 * @param {any} ctx
 * @param {readonly [string, number]} tint
 */
export function tintGambitAtlas(ctx, [ink, share]) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = share;
  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, GAMBIT_ATLAS_W, GAMBIT_ATLAS_H);
  ctx.restore();
}

const rgb = (/** @type {readonly number[]} */ c) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;

/**
 * @param {any} ctx
 * @param {any} look
 */
export function paintGambitMat(ctx, look) {
  const S = GAMBIT_MAT_CELL_PX, I = GAMBIT_INKS;
  const L = KG_LAYOUTS.find((x) => x.key === look.layout) ?? KG_OPEN_FIELD;
  const box = (/** @type {number} */ c, /** @type {number} */ r) => [c * S, r * S];
  for (let r = 0; r < KG_ROWS; r++) for (let c = 0; c < KG_COLS; c++) {
    const [x, y] = box(c, r);
    ctx.fillStyle = rgb(L.floor[(c + r) % 2]); ctx.fillRect(x, y, S, S);
  }
  for (let r = 0; r < KG_ROWS; r++) for (let c = 0; c < KG_COLS; c++) {
    const t = look.tiles[r * KG_COLS + c], [x, y] = box(c, r);
    if (t === KG_TILE.wall) {
      ctx.fillStyle = '#4a4640'; ctx.fillRect(x, y, S, S);
      ctx.fillStyle = '#6e6960'; ctx.fillRect(x, y, S, 3);
      ctx.strokeStyle = '#2e2b27'; ctx.lineWidth = 1;
      for (const yy of [S / 3, (2 * S) / 3]) { ctx.beginPath(); ctx.moveTo(x, y + yy); ctx.lineTo(x + S, y + yy); ctx.stroke(); }
    } else if (t === KG_TILE.pillar) {
      ctx.fillStyle = '#3a3733'; ctx.beginPath(); ctx.arc(x + S / 2, y + S / 2, S * 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5c5850'; ctx.beginPath(); ctx.arc(x + S / 2, y + S / 2, S * 0.32, 0, Math.PI * 2); ctx.fill();
    } else if (t === KG_TILE.water) {
      ctx.fillStyle = '#1f3d5c'; ctx.fillRect(x, y, S, S);
      ctx.strokeStyle = '#4f7aa5'; ctx.lineWidth = 1.5;
      for (const yy of [S * 0.35, S * 0.68]) { ctx.beginPath(); ctx.moveTo(x + 3, y + yy); ctx.quadraticCurveTo(x + S / 2, y + yy - 4, x + S - 3, y + yy); ctx.stroke(); }
    }
  }
  for (const h of look.hazards ?? []) {
    const [x, y] = box(h.col, h.row), cx = x + S / 2, cy = y + S / 2;
    const tone = h.kind === 'fire' ? '#e2702a' : h.kind === 'spikes' ? '#b9b4a8' : '#5fae4a';
    if (h.active) {
      ctx.fillStyle = tone;
      if (h.kind === 'fire') {
        for (const [dx, hh] of [[-7, 13], [0, 18], [7, 12]]) { ctx.beginPath(); ctx.moveTo(cx + dx - 5, cy + 10); ctx.quadraticCurveTo(cx + dx - 6, cy + 10 - hh * 0.6, cx + dx, cy + 10 - hh); ctx.quadraticCurveTo(cx + dx + 6, cy + 10 - hh * 0.6, cx + dx + 5, cy + 10); ctx.closePath(); ctx.fill(); }
      } else if (h.kind === 'spikes') {
        for (let k = 0; k < 6; k++) { const sx = x + 4 + (k % 3) * 9, sy = y + 6 + Math.floor(k / 3) * 12; ctx.beginPath(); ctx.moveTo(sx, sy + 10); ctx.lineTo(sx + 4, sy); ctx.lineTo(sx + 8, sy + 10); ctx.closePath(); ctx.fill(); }
      } else {
        for (const [dx, dy, rr] of [[-6, 4, 5], [5, 2, 4], [0, -6, 3.5]]) { ctx.beginPath(); ctx.arc(cx + dx, cy + dy, rr, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.strokeStyle = I.outline; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, S - 2, S - 2);
    } else {
      ctx.setLineDash?.([4, 3]); ctx.strokeStyle = I.outline; ctx.lineWidth = 3; ctx.strokeRect(x + 3, y + 3, S - 6, S - 6);
      ctx.strokeStyle = tone; ctx.lineWidth = 1.5; ctx.strokeRect(x + 3, y + 3, S - 6, S - 6); ctx.setLineDash?.([]);
      ctx.fillStyle = I.outline; ctx.fillRect(cx - 3, cy - 10, 6, 13); ctx.fillRect(cx - 3, cy + 6, 6, 5);
      ctx.fillStyle = tone; ctx.fillRect(cx - 1.5, cy - 9, 3, 11); ctx.fillRect(cx - 1.5, cy + 7, 3, 3);
    }
  }
  const ring = (/** @type {number} */ c, /** @type {number} */ r, /** @type {string} */ ink, /** @type {number} */ inset, /** @type {number} */ w, notch = false, dash = false) => {
    const [x, y] = box(c, r), a = x + inset, b = y + inset, s = S - 2 * inset;
    const path = () => {
      ctx.beginPath();
      if (notch) { const n = s * 0.22; ctx.moveTo(a + n, b); ctx.lineTo(a + s - n, b); ctx.moveTo(a + s, b + n); ctx.lineTo(a + s, b + s - n); ctx.moveTo(a + s - n, b + s); ctx.lineTo(a + n, b + s); ctx.moveTo(a, b + s - n); ctx.lineTo(a, b + n); }
      else ctx.rect(a, b, s, s);
    };
    if (dash) ctx.setLineDash?.([5, 3]);
    ctx.strokeStyle = I.outline; ctx.lineWidth = w + 2; path(); ctx.stroke();
    ctx.strokeStyle = ink; ctx.lineWidth = w; path(); ctx.stroke();
    if (dash) ctx.setLineDash?.([]);
  };
  const wash = (/** @type {number} */ c, /** @type {number} */ r, /** @type {string} */ ink, /** @type {number} */ alpha) => {
    const [x, y] = box(c, r);
    ctx.globalAlpha = alpha; ctx.fillStyle = ink; ctx.fillRect(x + 2, y + 2, S - 4, S - 4); ctx.globalAlpha = 1;
  };
  for (const [c, r] of look.range ?? []) ring(c, r, I.bone, 5, 1.5);
  for (const [c, r] of look.lit ?? []) { wash(c, r, I.bone, 0.32); ring(c, r, I.bone, 2, 1); }
  for (const p of look.pieces ?? []) ring(p.col, p.row, p.side === 0 ? I.bone : I.stone, 1.5, 2, p.side === 1);
  for (const p of look.pieces ?? []) {
    if (!(look.targets ?? []).includes(p.id)) continue;
    ring(p.col, p.row, I.blood, 1, 3);
    const [x, y] = box(p.col, p.row);
    ctx.fillStyle = I.outline; ctx.fillRect(x + S - 9, y + 3, 6, 14);
    ctx.fillStyle = I.blood; ctx.fillRect(x + S - 7.5, y + 4, 3, 10); ctx.fillRect(x + S - 9.5, y + 12, 7, 2);
  }
  const sel = (look.pieces ?? []).find((/** @type {any} */ p) => p.id === look.selected);
  if (sel) ring(sel.col, sel.row, I.brass, 0.5, 3);
  if (look.staged) { wash(look.staged.col, look.staged.row, I.brass, 0.4); ring(look.staged.col, look.staged.row, I.brass, 1, 3); }
  if (look.cursor) ring(look.cursor[0], look.cursor[1], I.brassLo, 3, 2, false, true);
}

export const GAMBIT_FX_PX = 32;
export const GAMBIT_FX_COLS = 8;
export const GAMBIT_FX_ROWS = 4;
export const GAMBIT_FX_KEYS = Object.freeze([
  '0', '1', '2', '3', '4', '5', '6', '7',
  '8', '9', '+', '-', 'flame', 'bubble', 'bang', 'shot',
  'ripple', 'steel', 'ring', 'well', 'fill', 'stone-top', 'stone-side', 'brass',
  'stand-0', 'stand-1', 'stand-k0', 'stand-k1', 'stand-0-on', 'stand-1-on', 'stand-k0-on', 'stand-k1-on',
]);
export const standKey = (/** @type {{side: number, king: boolean}} */ p, /** @type {boolean} */ on) => `stand-${p.king ? 'k' : ''}${p.side}${on ? '-on' : ''}`;
export const GAMBIT_GLYPHS = Object.freeze({
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'], '+': ['000', '010', '111', '010', '000'], '-': ['000', '000', '111', '000', '000'],
});
export const gambitFxCell = (/** @type {string} */ key) => { const i = Math.max(0, GAMBIT_FX_KEYS.indexOf(key)); return [i % GAMBIT_FX_COLS, Math.floor(i / GAMBIT_FX_COLS)]; };
export function gambitFxUv(/** @type {string} */ key, inset = 0) {
  const [col, row] = gambitFxCell(key), W = GAMBIT_FX_PX * GAMBIT_FX_COLS, H = GAMBIT_FX_PX * GAMBIT_FX_ROWS, d = inset * GAMBIT_FX_PX;
  return [(col * GAMBIT_FX_PX + 0.5 + d) / W, 1 - ((row + 1) * GAMBIT_FX_PX - 0.5 - d) / H, ((col + 1) * GAMBIT_FX_PX - 0.5 - d) / W, 1 - (row * GAMBIT_FX_PX + 0.5 + d) / H];
}

/** @param {any} ctx */
export function paintGambitFx(ctx) {
  const P = GAMBIT_FX_PX, I = GAMBIT_INKS;
  ctx.clearRect(0, 0, P * GAMBIT_FX_COLS, P * GAMBIT_FX_ROWS);
  const cell = (/** @type {string} */ key, /** @type {() => void} */ paint) => {
    const [c, r] = gambitFxCell(key);
    ctx.save(); ctx.translate(c * P, r * P); paint(); ctx.restore();
  };
  for (const [ch, rows] of Object.entries(GAMBIT_GLYPHS)) cell(ch, () => {
    const px = 5, ox = (P - 3 * px) / 2, oy = (P - 5 * px) / 2;
    const lit = (/** @type {number} */ x, /** @type {number} */ y) => rows[y]?.[x] === '1';
    ctx.fillStyle = I.outline;
    for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (lit(x, y)) ctx.fillRect(ox + x * px - 2, oy + y * px - 2, px + 4, px + 4);
    ctx.fillStyle = I.bone;
    for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (lit(x, y)) ctx.fillRect(ox + x * px, oy + y * px, px, px);
  });
  cell('flame', () => {
    const tongue = (/** @type {string} */ ink, /** @type {number} */ s) => {
      ctx.fillStyle = ink; ctx.beginPath(); ctx.moveTo(P / 2 - 12 * s, P); ctx.quadraticCurveTo(P / 2 - 14 * s, P - 18 * s, P / 2, P - 31 * s);
      ctx.quadraticCurveTo(P / 2 + 14 * s, P - 18 * s, P / 2 + 12 * s, P); ctx.closePath(); ctx.fill();
    };
    tongue('#c2401c', 1); tongue('#e2702a', 0.78); tongue('#f6c65a', 0.5);
  });
  cell('bubble', () => {
    ctx.fillStyle = I.outline; ctx.beginPath(); ctx.arc(P / 2, P / 2, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5fae4a'; ctx.beginPath(); ctx.arc(P / 2, P / 2, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b6e39c'; ctx.beginPath(); ctx.arc(P / 2 - 4, P / 2 - 4, 3.5, 0, Math.PI * 2); ctx.fill();
  });
  cell('bang', () => {
    ctx.fillStyle = I.outline; ctx.fillRect(P / 2 - 5, 2, 10, 20); ctx.fillRect(P / 2 - 5, 24, 10, 7);
    ctx.fillStyle = I.brass; ctx.fillRect(P / 2 - 3, 4, 6, 16); ctx.fillRect(P / 2 - 3, 26, 6, 3);
  });
  cell('shot', () => { ctx.fillStyle = I.outline; ctx.fillRect(4, 4, P - 8, P - 8); ctx.fillStyle = '#fff6d8'; ctx.fillRect(8, 8, P - 16, P - 16); });
  cell('ripple', () => {
    ctx.strokeStyle = '#8fb6d9'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(2, P * 0.7); ctx.quadraticCurveTo(P / 2, P * 0.3, P - 2, P * 0.7); ctx.stroke();
  });
  cell('steel', () => { ctx.fillStyle = '#b9b4a8'; ctx.fillRect(0, 0, P, P); ctx.fillStyle = '#e4e0d4'; ctx.fillRect(0, 0, P / 2, P); });
  cell('ring', () => {
    for (const [r, w, ink] of [[13, 6, I.outline], [13, 3, I.brass]]) { ctx.strokeStyle = ink; ctx.lineWidth = /** @type {number} */ (w); ctx.beginPath(); ctx.arc(P / 2, P / 2, /** @type {number} */ (r), 0, Math.PI * 2); ctx.stroke(); }
  });
  cell('well', () => { ctx.fillStyle = I.outline; ctx.fillRect(0, 0, P, P); ctx.fillStyle = '#1b1a1d'; ctx.fillRect(2, 2, P - 4, P - 4); });
  cell('fill', () => {
    ctx.fillStyle = '#d8cfae'; ctx.fillRect(0, 0, P, P);
    ctx.fillStyle = '#f4ecd2'; ctx.fillRect(0, 0, P, 7);
    ctx.fillStyle = '#8f8670'; ctx.fillRect(0, P - 7, P, 7);
    ctx.fillStyle = '#fbf6e6'; ctx.fillRect(P - 4, 0, 4, P);
  });
  cell('stone-top', () => {
    ctx.fillStyle = '#6e6960'; ctx.fillRect(0, 0, P, P);
    ctx.fillStyle = '#8a857a'; ctx.fillRect(0, 0, P, 4); ctx.fillRect(0, 0, 4, P);
    ctx.fillStyle = '#4a4640'; ctx.fillRect(0, P - 3, P, 3); ctx.fillRect(P - 3, 0, 3, P);
  });
  cell('stone-side', () => {
    ctx.fillStyle = '#4a4640'; ctx.fillRect(0, 0, P, P);
    ctx.fillStyle = '#6e6960'; ctx.fillRect(0, 0, P, 3);
    ctx.fillStyle = '#2e2b27';
    for (const y of [P / 3, (2 * P) / 3]) ctx.fillRect(0, y - 1, P, 2);
    for (const [x, y0, y1] of [[P / 2, 0, P / 3], [P / 4, P / 3, (2 * P) / 3], [(3 * P) / 4, P / 3, (2 * P) / 3], [P / 2, (2 * P) / 3, P]]) ctx.fillRect(x - 1, y0, 2, y1 - y0);
  });
  cell('brass', () => { ctx.fillStyle = I.brass; ctx.fillRect(0, 0, P, P); ctx.fillStyle = I.brassLo; ctx.fillRect(0, P / 2, P, P / 2); });
  for (const king of [false, true]) for (const side of [0, 1]) for (const on of [false, true]) cell(standKey({ side, king }, on), () => {
    const tone = side === 0 ? I.bone : I.stone, c = P / 2;
    ctx.fillStyle = tone; ctx.fillRect(0, 0, P, P);
    ctx.fillStyle = I.outline; ctx.fillRect(0, 0, P, 2); ctx.fillRect(0, P - 2, P, 2);
    ctx.fillStyle = I.outline; ctx.beginPath(); ctx.arc(c, c, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = on ? I.brass : I.bone; ctx.beginPath(); ctx.arc(c, c, 13.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = I.outline; ctx.beginPath(); ctx.arc(c, c, on ? 10.5 : 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = king ? I.brass : tone; ctx.beginPath(); ctx.arc(c, c, on ? 9.5 : 11, 0, Math.PI * 2); ctx.fill();
    if (king) { ctx.strokeStyle = tone; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(c, c, 6.5, 0, Math.PI * 2); ctx.stroke(); }
    if (side === 1) {
      ctx.fillStyle = I.outline;
      for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; ctx.save(); ctx.translate(c + Math.cos(a) * 13, c + Math.sin(a) * 13); ctx.rotate(a); ctx.fillRect(-2.5, -1.5, 5, 3); ctx.restore(); }
    }
  });
}

const modelOf = (/** @type {number[]} */ positions, /** @type {number[]} */ normals, /** @type {number[]} */ uvs, /** @type {number[]} */ indices, /** @type {string} */ record) => ({
  positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), indices: new Uint32Array(indices),
  subMeshes: [{ textureArchive: GAMBIT_ARCHIVE, textureRecord: record, startIndex: 0, primitiveCount: indices.length / 3 }],
});
// `quad` winds each quad so cross(b - a, c - a) runs along `n` (the renderer's front face), whatever its corner order.
function builder() {
  /** @type {number[]} */ const positions = [], normals = [], uvs = [], indices = [];
  const quad = (/** @type {number[][]} */ P, /** @type {number[]} */ n, /** @type {number[][]} */ uv) => {
    const base = positions.length / 3;
    P.forEach((p, i) => { positions.push(p[0], p[1], p[2]); normals.push(n[0], n[1], n[2]); uvs.push(uv[i][0], uv[i][1]); });
    const [a, b, c] = P;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] >= 0) indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  return { positions, normals, uvs, indices, quad };
}

/**
 * @param {{corners: number[][], at: (c: number, r: number) => number[], top: number, right: number[], toHost: number[]}} places
 * @param {number[]|null} [tiles]
 */
export function matModel(places, tiles = null) {
  const B = builder(), top = places.top, felt = top - GAMBIT_MAT_LIFT;
  const water = (/** @type {number} */ c, /** @type {number} */ r) => !!tiles && c >= 0 && c < KG_COLS && r >= 0 && r < KG_ROWS && tiles[r * KG_COLS + c] === KG_TILE.water;
  const pt = (/** @type {number} */ ce, /** @type {number} */ re, /** @type {number} */ y) => { const p = places.at(ce - 0.5, re - 0.5); return [p[0], y, p[2]]; };
  const uv = (/** @type {number} */ ce, /** @type {number} */ re) => [ce / KG_COLS, 1 - re / KG_ROWS];
  const up = [0, 1, 0];
  for (let r = 0; r < KG_ROWS; r++) for (let c = 0; c < KG_COLS; c++) {
    const y = water(c, r) ? top - GAMBIT_WATER_DROP : top;
    B.quad([pt(c, r + 1, y), pt(c + 1, r + 1, y), pt(c + 1, r, y), pt(c, r, y)], up, [uv(c, r + 1), uv(c + 1, r + 1), uv(c + 1, r), uv(c, r)]);
    if (!water(c, r)) continue;
    const mid = [(c + 0.5) / KG_COLS, 1 - (r + 0.5) / KG_ROWS];
    for (const [dc, dr, a, b] of /** @type {[number, number, number[], number[]][]} */ ([[1, 0, [c + 1, r], [c + 1, r + 1]], [-1, 0, [c, r], [c, r + 1]], [0, 1, [c, r + 1], [c + 1, r + 1]], [0, -1, [c, r], [c + 1, r]]])) {
      if (water(c + dc, r + dr)) continue;
      const n = [-(places.right[0] * dc + places.toHost[0] * dr), 0, -(places.right[1] * dc + places.toHost[1] * dr)];
      B.quad([pt(a[0], a[1], y), pt(b[0], b[1], y), pt(b[0], b[1], top), pt(a[0], a[1], top)], n, [mid, mid, mid, mid]);
    }
  }
  const edges = /** @type {[number[], number[], number[]][]} */ ([
    [[0, KG_ROWS], [KG_COLS, KG_ROWS], [places.toHost[0], 0, places.toHost[1]]],
    [[KG_COLS, 0], [0, 0], [-places.toHost[0], 0, -places.toHost[1]]],
    [[KG_COLS, KG_ROWS], [KG_COLS, 0], [places.right[0], 0, places.right[1]]],
    [[0, 0], [0, KG_ROWS], [-places.right[0], 0, -places.right[1]]],
  ]);
  for (const [a, b, n] of edges) B.quad([pt(a[0], a[1], felt), pt(b[0], b[1], felt), pt(b[0], b[1], top), pt(a[0], a[1], top)], n, [uv(a[0], a[1]), uv(b[0], b[1]), uv(b[0], b[1]), uv(a[0], a[1])]);
  return modelOf(B.positions, B.normals, B.uvs, B.indices, GAMBIT_MAT);
}

export const GAMBIT_PILLAR_SIDES = 12;
/**
 * @param {{at: (c: number, r: number) => number[], top: number, right: number[], toHost: number[], cell: number}} places
 * @param {number[]} tiles
 */
export function stoneModel(places, tiles) {
  const B = builder(), top = places.top, ut = gambitFxUv('stone-top', 0.05), us = gambitFxUv('stone-side', 0.05);
  const R = [places.right[0], 0, places.right[1]], T = [places.toHost[0], 0, places.toHost[1]];
  const at = (/** @type {number} */ c, /** @type {number} */ r, /** @type {number} */ du, /** @type {number} */ dv, /** @type {number} */ y) => {
    const o = places.at(c, r);
    return [o[0] + (R[0] * du + T[0] * dv) * places.cell, y, o[2] + (R[2] * du + T[2] * dv) * places.cell];
  };
  const sideUv = [[us[0], us[1]], [us[2], us[1]], [us[2], us[3]], [us[0], us[3]]];
  const topUv = [[ut[0], ut[1]], [ut[2], ut[1]], [ut[2], ut[3]], [ut[0], ut[3]]];
  let any = false;
  for (let r = 0; r < KG_ROWS; r++) for (let c = 0; c < KG_COLS; c++) {
    const t = tiles[r * KG_COLS + c];
    if (t === KG_TILE.wall) {
      any = true;
      const h = top + GAMBIT_WALL_H, e = 0.5;
      B.quad([at(c, r, -e, e, h), at(c, r, e, e, h), at(c, r, e, -e, h), at(c, r, -e, -e, h)], [0, 1, 0], topUv);
      for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = [R[0] * du + T[0] * dv, 0, R[2] * du + T[2] * dv];
        const a = du !== 0 ? [du * e, -e] : [-e, dv * e], b = du !== 0 ? [du * e, e] : [e, dv * e];
        B.quad([at(c, r, a[0], a[1], top), at(c, r, b[0], b[1], top), at(c, r, b[0], b[1], h), at(c, r, a[0], a[1], h)], n, sideUv);
      }
    } else if (t === KG_TILE.pillar) {
      any = true;
      const h = top + GAMBIT_PILLAR_H, rad = GAMBIT_PILLAR_R, N = GAMBIT_PILLAR_SIDES;
      const ring = (/** @type {number} */ k) => [Math.cos((k / N) * 2 * Math.PI) * rad, Math.sin((k / N) * 2 * Math.PI) * rad];
      const centre = at(c, r, 0, 0, h), mu = (ut[0] + ut[2]) / 2, mv = (ut[1] + ut[3]) / 2;
      for (let k = 0; k < N; k++) {
        const [x0, z0] = ring(k), [x1, z1] = ring(k + 1), [xm, zm] = ring(k + 0.5);
        const n = [R[0] * xm + T[0] * zm, 0, R[2] * xm + T[2] * zm];
        const u0 = us[0] + ((us[2] - us[0]) * k) / N, u1 = us[0] + ((us[2] - us[0]) * (k + 1)) / N;
        B.quad([at(c, r, x0, z0, top), at(c, r, x1, z1, top), at(c, r, x1, z1, h), at(c, r, x0, z0, h)], n, [[u0, us[1]], [u1, us[1]], [u1, us[3]], [u0, us[3]]]);
        B.quad([centre, at(c, r, x0, z0, h), at(c, r, x1, z1, h), centre], [0, 1, 0], [[mu, mv], [ut[0], ut[1]], [ut[2], ut[1]], [mu, mv]]);
      }
    }
  }
  return any ? modelOf(B.positions, B.normals, B.uvs, B.indices, GAMBIT_FX) : null;
}

export const GAMBIT_DISC_SIDES = 20;
/** @param {string} key */
export function discModel(key) {
  const B = builder(), uv = gambitFxUv(key, 0.02), N = GAMBIT_DISC_SIDES;
  const mu = (uv[0] + uv[2]) / 2, mv = (uv[1] + uv[3]) / 2, ru = (uv[2] - uv[0]) / 2, rv = (uv[3] - uv[1]) / 2;
  const band = [uv[0], uv[3] - (uv[3] - uv[1]) * 0.06];
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * 2 * Math.PI, a1 = ((k + 1) / N) * 2 * Math.PI, am = (a0 + a1) / 2;
    const p0 = [Math.cos(a0), Math.sin(a0)], p1 = [Math.cos(a1), Math.sin(a1)];
    B.quad([[p0[0], 0, p0[1]], [p1[0], 0, p1[1]], [p1[0], 1, p1[1]], [p0[0], 1, p0[1]]], [Math.cos(am), 0, Math.sin(am)], [band, band, band, band]);
    B.quad([[0, 1, 0], [p0[0], 1, p0[1]], [p1[0], 1, p1[1]], [0, 1, 0]], [0, 1, 0], [[mu, mv], [mu + p0[0] * ru, mv + p0[1] * rv], [mu + p1[0] * ru, mv + p1[1] * rv], [mu, mv]]);
  }
  return modelOf(B.positions, B.normals, B.uvs, B.indices, GAMBIT_FX);
}

/**
 * @param {string} key
 * @param {boolean} [flat]
 */
export function fxQuadModel(key, flat = false) {
  const B = builder(), [u0, v0, u1, v1] = gambitFxUv(key);
  if (flat) B.quad([[-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 0, -0.5], [-0.5, 0, -0.5]], [0, 1, 0], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
  else B.quad([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], [0, 0, 1], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
  return modelOf(B.positions, B.normals, B.uvs, B.indices, GAMBIT_FX);
}

export function spikesModel() {
  const B = builder(), [u0, v0, u1, v1] = gambitFxUv('steel', 0.1);
  for (let k = 0; k < 6; k++) {
    const cx = -0.28 + (k % 3) * 0.28, cz = -0.18 + Math.floor(k / 3) * 0.36, w = 0.1;
    const apex = [cx, 1, cz];
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const a = [cx + (dx - dz) * w, 0, cz + (dz + dx) * w], b = [cx + (dx + dz) * w, 0, cz + (dz - dx) * w];
      B.quad([a, b, apex, apex], [dx, 0.4, dz], [[u0, v0], [u1, v0], [(u0 + u1) / 2, v1], [(u0 + u1) / 2, v1]]);
    }
  }
  return modelOf(B.positions, B.normals, B.uvs, B.indices, GAMBIT_FX);
}

const onAtlas = (/** @type {number[]} */ indices) => [{ textureArchive: GAMBIT_ARCHIVE, textureRecord: GAMBIT_ATLAS, startIndex: 0, primitiveCount: indices.length / 3 }];
// The back quad lays u from -X to +X, which reads mirrored from behind, so its u range is swapped.
export const gambitPlateModel = (/** @type {string} */ key) => {
  const [u0, v0, u1, v1] = gambitCellUv(gambitAtlasCell(key));
  return plateModel([u0, v0, u1, v1], [u1, v0, u0, v1], gambitCellUv(gambitAtlasCell('back')), onAtlas);
};

const norm = (/** @type {number[]} */ v) => { const m = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / m, v[1] / m, v[2] / m]; };
const cross = (/** @type {number[]} */ a, /** @type {number[]} */ b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (/** @type {number[]} */ a, /** @type {number[]} */ b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// Column-major; a rotation only when Y = Z x X.
export const basisMatrix = (/** @type {number[]} */ X, /** @type {number[]} */ Y, /** @type {number[]} */ Z, /** @type {number[]} */ t, sx = 1, sy = 1, sz = 1) => new Float32Array([
  X[0] * sx, X[1] * sx, X[2] * sx, 0, Y[0] * sy, Y[1] * sy, Y[2] * sy, 0, Z[0] * sz, Z[1] * sz, Z[2] * sz, 0, t[0], t[1], t[2], 1,
]);
const onBoard = (/** @type {any} */ places, /** @type {number[]} */ d) => [(places.right[0] * d[0] + places.toHost[0] * d[1]) * places.cell, 0, (places.right[1] * d[0] + places.toHost[1] * d[1]) * places.cell];
const at3 = (/** @type {any} */ places, /** @type {number[]} */ cr) => places.at(cr[0], cr[1]);
const smooth = (/** @type {number} */ k) => k * k * (3 - 2 * k);

// The plate's +Y (its face) runs along the owner's view and +Z (its top) up, so X x Y = Z as the renderer expects.
/**
 * @param {any} places
 * @param {number} side
 * @param {number[]} foot
 * @param {number[]} upAxis
 */
export function standingMatrix(places, side, foot, upAxis) {
  const s = (GAMBIT_CARD_SHARE * places.cell) / CARD_W;
  const yaw = gambitCardYaw(places, side);
  const across = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const Z = norm(upAxis), X = norm([across[0] - Z[0] * dot(across, Z), across[1] - Z[1] * dot(across, Z), across[2] - Z[2] * dot(across, Z)]);
  const Y = cross(Z, X);
  const H = gambitCardHeight(places.cell);
  return basisMatrix(X, Y, Z, [foot[0] + Z[0] * H / 2, foot[1] + Z[1] * H / 2, foot[2] + Z[2] * H / 2], s, 1, s);
}
export function lyingMatrix(/** @type {any} */ places, /** @type {number} */ side, /** @type {number[]} */ pos, spin = 0) {
  const s = (GAMBIT_CARD_SHARE * places.cell) / CARD_W, yaw = gambitCardYaw(places, side) + spin;
  const X = [Math.cos(yaw), 0, -Math.sin(yaw)], Z = [Math.sin(yaw), 0, Math.cos(yaw)];
  return basisMatrix(X, [0, 1, 0], Z, pos, s, 1, s);
}

/**
 * @param {any} places
 * @param {any[]} poses
 * @param {{selected?: number|null}} [marks]
 */
export function gambitPieceDraws(places, poses, { selected = null } = {}) {
  const H = gambitCardHeight(places.cell), up = [0, 1, 0], felt = places.top - GAMBIT_MAT_LIFT;
  return poses.map((p) => {
    const base = at3(places, p.at), shake = onBoard(places, p.shake ?? [0, 0]);
    const foot = [base[0] + shake[0], places.top + GAMBIT_CARD_FOOT + (p.id === selected ? GAMBIT_SELECT_LIFT : 0), base[2] + shake[2]];
    let plate, disc = null, bar = null;
    const remap = p.flash ? GAMBIT_REMAP_HURT : p.glow ? GAMBIT_REMAP_GLOW : null;
    if (p.pile) {
      const step = gambitPileStep(places.end, p.side);
      const spot = at3(places, [p.pile.at[0] + step[0] * p.pile.index, p.pile.at[1] + step[1] * p.pile.index]);
      const restY = felt + CARD_T * (p.pile.index + 1);
      const k = smooth(p.pile.k);
      plate = lyingMatrix(places, p.side, [foot[0] + (spot[0] - foot[0]) * k, foot[1] + (restY - foot[1]) * k, foot[2] + (spot[2] - foot[2]) * k]);
    } else if (p.fall) {
      const away = Math.hypot(p.fall.dir[0], p.fall.dir[1]) > 0 ? norm(onBoard(places, p.fall.dir)) : norm(onBoard(places, [0, p.side === 0 ? -1 : 1]));
      const th = (smooth(p.fall.k) * Math.PI) / 2;
      plate = standingMatrix(places, p.side, foot, [Math.sin(th) * away[0], Math.cos(th), Math.sin(th) * away[2]]);
      disc = foot;
    } else if (p.thrown) {
      const from = at3(places, p.thrown.from), k = smooth(p.thrown.k);
      const pos = [from[0] + (foot[0] - from[0]) * k, foot[1] + (from[1] - foot[1]) * (1 - k) + Math.sin(Math.PI * p.thrown.k) * ARC_HEIGHT, from[2] + (foot[2] - from[2]) * k];
      const rise = Math.max(0, (p.thrown.k - 0.7) / 0.3);
      if (rise <= 0) plate = lyingMatrix(places, p.side, pos, (1 - p.thrown.k) * 0.6);
      else {
        const back = onBoard(places, [0, p.side === 0 ? -1 : 1]);
        const lying = norm(back), th = smooth(rise) * (Math.PI / 2);
        plate = standingMatrix(places, p.side, pos, [lying[0] * Math.cos(th), Math.sin(th), lying[2] * Math.cos(th)]);
      }
    } else {
      const tip = onBoard(places, p.tip ?? [0, 0]);
      plate = standingMatrix(places, p.side, foot, [tip[0], H, tip[2]]);
      disc = foot;
      const top = [foot[0] + tip[0], foot[1] + H + GAMBIT_BAR_GAP, foot[2] + tip[2]];
      bar = { at: top, width: GAMBIT_CARD_SHARE * places.cell, share: Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxHp))) };
    }
    return { piece: p, plate, disc: disc ? [base[0] + shake[0], places.top, base[2] + shake[2]] : null, bar, remap };
  });
}

/**
 * @param {number[]} at
 * @param {number[]} eye
 * @param {number} w
 * @param {number} h
 */
export function facingMatrix(at, eye, w, h, left = false) {
  const to = norm([eye[0] - at[0], 0, eye[2] - at[2]]);
  const Z = Math.hypot(to[0], to[2]) > 1e-6 ? to : [0, 0, 1], Y = [0, 1, 0], X = cross(Y, Z);
  const o = left ? at : [at[0] - X[0] * w / 2, at[1], at[2] - X[2] * w / 2];
  return basisMatrix(X, Y, Z, o, w, h, 1);
}

/**
 * @param {any} renderer
 * @param {{doc?: any}} [opts]
 */
export function createGambitTableDraw(renderer, { doc = globalThis.document } = {}) {
  let alive = true, atlasReady = false, fxReady = false, mat = null, matKey = null, matPlaces = null, matTiles = null, stone = null, stoneKey = null;
  const plates = new Map(), meshes = new Map();
  const canvasOf = (/** @type {number} */ w, /** @type {number} */ h) => {
    const cv = doc?.createElement?.('canvas');
    if (!cv) return null;
    cv.width = w; cv.height = h;
    const ctx = cv.getContext?.('2d');
    return ctx ? { cv, ctx } : null;
  };
  const upload = (/** @type {string} */ record, /** @type {any} */ ctx, /** @type {number} */ w, /** @type {number} */ h, /** @type {any} */ opts = undefined) => {
    const img = ctx.getImageData(0, 0, w, h);
    renderer.uploadTexture(GAMBIT_ARCHIVE, record, toColor32({ width: w, height: h, data: new Uint8Array(img.data.buffer) }), opts);
  };
  const buildAtlas = () => {
    if (atlasReady || !renderer?.createMesh) return;
    const c = canvasOf(GAMBIT_ATLAS_W, GAMBIT_ATLAS_H);
    if (!c) return;
    paintGambitAtlas(c.ctx);
    upload(GAMBIT_ATLAS, c.ctx, GAMBIT_ATLAS_W, GAMBIT_ATLAS_H);
    for (const [record, tint] of /** @type {[string, readonly [string, number]][]} */ ([[GAMBIT_ATLAS_HURT, GAMBIT_HURT_TINT], [GAMBIT_ATLAS_GLOW, GAMBIT_GLOW_TINT]])) {
      const t = canvasOf(GAMBIT_ATLAS_W, GAMBIT_ATLAS_H);
      if (!t) continue;
      paintGambitAtlas(t.ctx); tintGambitAtlas(t.ctx, tint);
      upload(record, t.ctx, GAMBIT_ATLAS_W, GAMBIT_ATLAS_H);
    }
    atlasReady = true;
  };
  const buildFx = () => {
    if (fxReady || !renderer?.createMesh) return;
    const W = GAMBIT_FX_PX * GAMBIT_FX_COLS, H = GAMBIT_FX_PX * GAMBIT_FX_ROWS, c = canvasOf(W, H);
    if (!c) return;
    paintGambitFx(c.ctx);
    upload(GAMBIT_FX, c.ctx, W, H, { cutout: true });
    fxReady = true;
  };
  const paintMat = (/** @type {any} */ places, /** @type {any} */ look) => {
    const key = JSON.stringify(look);
    if (mat && key === matKey && places === matPlaces && look.tiles === matTiles) return;
    if (key !== matKey || !mat) {
      const W = KG_COLS * GAMBIT_MAT_CELL_PX, H = KG_ROWS * GAMBIT_MAT_CELL_PX;
      const c = canvasOf(W, H);
      if (!c) return;
      paintGambitMat(c.ctx, look);
      // The texture cache keeps a key's first picture, so a new look must release the old upload first.
      if (matKey !== null) renderer.releaseTexture?.(GAMBIT_ARCHIVE, GAMBIT_MAT);
      upload(GAMBIT_MAT, c.ctx, W, H);
      matKey = key;
    }
    const tilesKey = look.tiles ? look.tiles.join('') : '';
    if (!mat || places !== matPlaces || tilesKey !== stoneKey) {
      for (const m of [mat, stone]) if (m) renderer.destroyMesh?.(m);
      mat = renderer.createMesh(matModel(places, look.tiles ?? null));
      const sm = look.tiles ? stoneModel(places, look.tiles) : null;
      stone = sm ? renderer.createMesh(sm) : null;
      matPlaces = places; stoneKey = tilesKey;
    }
    matTiles = look.tiles;
  };
  const plateOf = (/** @type {string} */ key) => {
    let m = plates.get(key);
    if (!m) { m = renderer.createMesh(gambitPlateModel(key)); plates.set(key, m); }
    return m;
  };
  const meshOf = (/** @type {string} */ key, /** @type {() => any} */ model) => {
    let m = meshes.get(key);
    if (!m) { m = renderer.createMesh(model()); meshes.set(key, m); }
    return m;
  };
  const NO_SHADOW = { noShadow: true };
  return {
    /** @param {{places: any, look: any, crowns: number[], poses?: any, eye?: number[], now?: number}} scene */
    draw(scene) {
      if (!alive || !renderer?.createMesh || !scene?.places || !scene.look) return;
      buildAtlas(); buildFx();
      if (!atlasReady) return;
      const P = scene.places, look = scene.look, cell = P.cell, t = (scene.now ?? 0) / 1000;
      const eye = scene.eye ?? [P.at(7, KG_ROWS + 6)[0], P.top + 0.6, P.at(7, KG_ROWS + 6)[2]];
      paintMat(P, look);
      const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      if (mat) renderer.drawMesh(mat, I, null, NO_SHADOW);
      if (stone && fxReady) renderer.drawMesh(stone, I, null, NO_SHADOW);
      const poses = scene.poses?.pieces ?? (look.pieces ?? []).map((/** @type {any} */ p) => ({ ...p, at: [p.col, p.row], hp: p.hp ?? 1, maxHp: p.maxHp ?? 1 }));
      const disc = cell * GAMBIT_DISC_SHARE / 2;
      for (const d of gambitPieceDraws(P, poses, { selected: look.selected })) {
        renderer.drawMesh(plateOf(pieceAtlasKey(d.piece, scene.crowns)), d.plate, d.remap, NO_SHADOW);
        if (!fxReady) continue;
        if (d.disc) {
          const key = standKey(d.piece, d.piece.id === look.selected);
          renderer.drawMesh(meshOf(key, () => discModel(key)), basisMatrix([1, 0, 0], [0, 1, 0], [0, 0, 1], d.disc, disc, GAMBIT_DISC_H, disc), null, NO_SHADOW);
        }
        if (d.bar) {
          const h = cell * GAMBIT_BAR_H;
          renderer.drawMesh(meshOf('well', () => fxQuadModel('well')), facingMatrix(d.bar.at, eye, d.bar.width, h), null, NO_SHADOW);
          if (d.bar.share > 0) {
            const m = facingMatrix(d.bar.at, eye, d.bar.width, h);
            const X = [m[0] / d.bar.width, m[1] / d.bar.width, m[2] / d.bar.width], Z = [m[8], m[9], m[10]];
            const o = [m[12] + Z[0] * 0.0008, m[13], m[14] + Z[2] * 0.0008];
            renderer.drawMesh(meshOf('fill', () => fxQuadModel('fill')), basisMatrix(X, [0, 1, 0], Z, o, d.bar.width * d.bar.share, h, 1), null, NO_SHADOW);
          }
        }
      }
      if (!fxReady) return;
      for (const h of look.hazards ?? []) {
        const o = P.at(h.col, h.row), ph = (h.col * 7 + h.row * 13) % 10;
        if (!h.active) {
          const pulse = 1 + 0.12 * Math.sin(t * 6 + ph);
          renderer.drawMesh(meshOf('ring', () => fxQuadModel('ring', true)), basisMatrix([1, 0, 0], [0, 1, 0], [0, 0, 1], [o[0], P.top + 0.0008, o[2]], cell * 0.9 * pulse, 1, cell * 0.9 * pulse), null, NO_SHADOW);
          const bob = cell * (0.2 + 0.05 * Math.sin(t * 4 + ph));
          renderer.drawMesh(meshOf('bang', () => fxQuadModel('bang')), facingMatrix([o[0], P.top + bob, o[2]], eye, cell * 0.36 * pulse, cell * 0.36 * pulse), null, NO_SHADOW);
        } else if (h.kind === 'fire') {
          [-0.22, 0, 0.22].forEach((dx, i) => {
            const flick = 0.85 + 0.2 * Math.sin(t * 9 + i * 2.1 + ph) + 0.08 * Math.sin(t * 23 + i);
            const a = [o[0] + P.right[0] * dx * cell, P.top, o[2] + P.right[1] * dx * cell];
            renderer.drawMesh(meshOf('flame', () => fxQuadModel('flame')), facingMatrix(a, eye, cell * 0.3, cell * [0.42, 0.6, 0.4][i] * flick), null, NO_SHADOW);
          });
        } else if (h.kind === 'spikes') {
          const R = [P.right[0], 0, P.right[1]], T = [P.toHost[0], 0, P.toHost[1]];
          renderer.drawMesh(meshOf('spikes', spikesModel), basisMatrix(R, [0, 1, 0], T, [o[0], P.top, o[2]], cell, cell * 0.32, cell), null, NO_SHADOW);
        } else {
          [-0.2, 0.16, 0].forEach((dx, i) => {
            const k = (t / 1.4 + i / 3 + ph / 10) % 1, s = cell * 0.16 * (1 - 0.35 * k);
            const a = [o[0] + P.right[0] * dx * cell, P.top + k * cell * 0.55, o[2] + P.right[1] * dx * cell];
            renderer.drawMesh(meshOf('bubble', () => fxQuadModel('bubble')), facingMatrix(a, eye, s, s), null, NO_SHADOW);
          });
        }
      }
      for (let r = 0; r < KG_ROWS; r++) for (let c = 0; c < KG_COLS; c++) {
        if (look.tiles?.[r * KG_COLS + c] !== KG_TILE.water) continue;
        [0.35, 0.68].forEach((v, i) => {
          const drift = 0.1 * Math.sin(t * 0.8 + c * 1.3 + r * 0.7 + i * 2);
          const o = P.at(c + drift, r + v - 0.5);
          const R = [P.right[0], 0, P.right[1]], T = [P.toHost[0], 0, P.toHost[1]];
          renderer.drawMesh(meshOf('ripple', () => fxQuadModel('ripple', true)), basisMatrix(R, [0, 1, 0], T, [o[0], P.top - GAMBIT_WATER_DROP + 0.0005, o[2]], cell * 0.7, 1, cell * 0.2), null, NO_SHADOW);
        });
      }
      const H = gambitCardHeight(cell), gw = cell * 0.2, gh = cell * 0.3;
      for (const f of scene.poses?.floats ?? []) {
        const o = at3(P, f.at), glyphs = String(f.text).split('').filter((ch) => ch in GAMBIT_GLYPHS);
        const base = [o[0], P.top + H * 0.9 + f.rise * cell, o[2]];
        const to = norm([eye[0] - base[0], 0, eye[2] - base[2]]), X = cross([0, 1, 0], to);
        glyphs.forEach((ch, i) => {
          const off = (i - (glyphs.length - 1) / 2) * gw * 0.95;
          renderer.drawMesh(meshOf(ch, () => fxQuadModel(ch)), facingMatrix([base[0] + X[0] * off, base[1], base[2] + X[2] * off], eye, gw, gh), null, NO_SHADOW);
        });
      }
      for (const s of scene.poses?.shots ?? []) {
        for (let k = 0; k < 4; k++) {
          const q = Math.max(0, s.k - k * 0.07), c2 = [s.from[0] + (s.to[0] - s.from[0]) * q, s.from[1] + (s.to[1] - s.from[1]) * q];
          const o = at3(P, c2), sz = cell * (0.14 - k * 0.02);
          renderer.drawMesh(meshOf('shot', () => fxQuadModel('shot')), facingMatrix([o[0], P.top + GAMBIT_CARD_FOOT + H / 2 - sz / 2, o[2]], eye, sz, sz), null, NO_SHADOW);
        }
      }
    },
    meshCount: () => plates.size + meshes.size + (mat ? 1 : 0) + (stone ? 1 : 0),
    destroy() {
      if (!alive) return;
      alive = false;
      for (const m of [...plates.values(), ...meshes.values(), mat, stone]) if (m) renderer.destroyMesh?.(m);
      if (atlasReady) for (const r of [GAMBIT_ATLAS, GAMBIT_ATLAS_HURT, GAMBIT_ATLAS_GLOW]) renderer.releaseTexture?.(GAMBIT_ARCHIVE, r);
      if (fxReady) renderer.releaseTexture?.(GAMBIT_ARCHIVE, GAMBIT_FX);
      if (matKey !== null) renderer.releaseTexture?.(GAMBIT_ARCHIVE, GAMBIT_MAT);
      plates.clear(); meshes.clear(); mat = null; stone = null; matKey = null; atlasReady = false; fxReady = false;
    },
  };
}
