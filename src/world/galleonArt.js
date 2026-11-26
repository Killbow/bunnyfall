// @ts-check
// Paints the galleon's textures from fixed seeds so every client draws the same ship. Each picture is 64 x 64 RGBA,
// top-down. The hull, castle, and stern liveries are cut into 64-row slices by height, and galleonModel.js cuts
// faces at the same heights.
import { mulberry32 } from '../combat/bloodArt.js';
import { dfLook, lookSeed } from './dfLook.js';

// A pseudo-archive above every classic archive. It must match its row in `eliteGates/pseudoArchives.js`.
export const GALLEON_ARCHIVE = 38131;
export const GALLEON_TEX_SIZE = 64;
export const TEX = Object.freeze({
  hullSide0: 0, hullBottom: 1, hullInner: 2, deck: 3, trim: 4, castle0: 5, sternWindows0: 6, spar: 7, iron: 8,
  canvas: 9, rope: 10, gilt: 11, grate: 12, lid: 13, door: 14, beams: 15, dark: 16,
  hullSide1: 17, hullSide2: 18, hullSide3: 19, castle1: 20, sternWindows1: 21, underDeck: 22,
});
export const HULL_SIDE_Y0 = -4.2;
export const HULL_SIDE_Y1 = 7.4;
export const CASTLE_Y0 = 5.7;
export const CASTLE_Y1 = 12.3;
export const BANDS = Object.freeze({
  hullSide: Object.freeze({ y0: HULL_SIDE_Y0, y1: HULL_SIDE_Y1, recs: Object.freeze([TEX.hullSide0, TEX.hullSide1, TEX.hullSide2, TEX.hullSide3]) }),
  castle: Object.freeze({ y0: CASTLE_Y0, y1: CASTLE_Y1, recs: Object.freeze([TEX.castle0, TEX.castle1]) }),
  sternWindows: Object.freeze({ y0: CASTLE_Y0, y1: CASTLE_Y1, recs: Object.freeze([TEX.sternWindows0, TEX.sternWindows1]) }),
});
export const GALLEON_TILE = Object.freeze({
  hullSide: [2.8, 0], hullBottom: [2, 2], hullInner: [2, 2], deck: [2, 2], trim: [2, 2], castle: [2.6, 0], sternWindows: [2.6, 0],
  spar: [2, 2], iron: [2, 2], canvas: [0, 0], rope: [0, 0.5], gilt: [1, 1], grate: [1, 1], lid: [0, 0], door: [0, 0],
  beams: [2, 2], dark: [2, 2], underDeck: [2, 2],
});

export const C = Object.freeze({
  tar: [30, 27, 24], weed: [44, 54, 34], tallow: [184, 172, 140], wale: [30, 25, 22], waleLit: [64, 54, 44],
  oxblood: [118, 34, 27], oxbloodLit: [146, 50, 38], gilt: [196, 152, 62], giltDark: [128, 92, 36], giltLit: [236, 200, 110],
  oak: [104, 72, 44], oakDark: [70, 47, 29], oakLit: [132, 96, 60], seam: [36, 25, 17],
  pine: [148, 120, 86], pineGrey: [128, 112, 92], pineDark: [96, 76, 54],
  inner: [112, 80, 52], innerDark: [74, 52, 33], beam: [62, 42, 26],
  spar: [128, 94, 58], sparDark: [92, 64, 38], hoop: [42, 41, 44], hoopLit: [86, 84, 86],
  iron: [44, 44, 48], ironLit: [74, 74, 80], rust: [96, 54, 32],
  canvas: [214, 205, 180], canvasSeam: [176, 164, 136], canvasDirt: [170, 158, 128],
  rope: [152, 122, 78], ropeDark: [96, 74, 44],
  glass: [34, 48, 58], glassLit: [92, 124, 136], lead: [26, 26, 28],
  black: [20, 18, 17],
});

/**
 * @param {number} w
 * @param {number} h
 */
export const picture = (w, h) => ({ width: w, height: h, data: new Uint8Array(w * h * 4) });
/**
 * @param {{width:number,height:number,data:Uint8Array}} img
 * @param {number} x
 * @param {number} y
 * @param {ArrayLike<number>} rgb
 */
export const put = (img, x, y, rgb) => {
  const w = img.width, h = img.height;
  const i = ((((y % h) + h) % h) * w + (((x % w) + w) % w)) * 4;
  img.data[i] = clamp8(rgb[0]); img.data[i + 1] = clamp8(rgb[1]); img.data[i + 2] = clamp8(rgb[2]); img.data[i + 3] = 255;
};
/**
 * @param {{width:number,height:number,data:Uint8Array}} img
 * @param {number} x
 * @param {number} y
 */
export const get = (img, x, y) => {
  const w = img.width, h = img.height;
  const i = ((((y % h) + h) % h) * w + (((x % w) + w) % w)) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};
const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));
/**
 * @param {ArrayLike<number>} a
 * @param {ArrayLike<number>} b
 * @param {number} t
 */
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/**
 * @param {ArrayLike<number>} c
 * @param {number} k
 */
export const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

function noise(seed, w, h, cx, cy) {
  const r = mulberry32(seed);
  const lat = Float32Array.from({ length: cx * cy }, () => r());
  const at = (i, j) => lat[(((j % cy) + cy) % cy) * cx + (((i % cx) + cx) % cx)];
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = (x / w) * cx, fy = (y / h) * cy;
    const i = Math.floor(fx), j = Math.floor(fy);
    const tx = sm(fx - i), ty = sm(fy - j);
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

export function planks(img, { y0 = 0, y1 = img.height, ph = 8, lenMin = 24, lenMax = 48, seed = 1, base, seamCol = C.seam, tone = 0.12, grain = 0.10, trenail = null, vertical = false }) {
  const W = vertical ? img.height : img.width;
  const r = mulberry32(seed);
  const g = noise(seed + 11, W, 64, 4, 16);
  const rows = Math.max(1, Math.round((y1 - y0) / ph));
  for (let row = 0; row < rows; row++) {
    const ya = y0 + Math.round((row * (y1 - y0)) / rows), yb = y0 + Math.round(((row + 1) * (y1 - y0)) / rows);
    const butts = [];
    let x = Math.floor(r() * lenMax);
    const start = x;
    while (x < start + W) { butts.push(x % W); x += lenMin + Math.floor(r() * (lenMax - lenMin + 1)); }
    const tones = butts.map(() => 1 + (r() * 2 - 1) * tone);
    for (let yy = ya; yy < yb; yy++) {
      for (let xx = 0; xx < W; xx++) {
        let k = 0;
        for (let b = 0; b < butts.length; b++) if (((xx - butts[b]) % W + W) % W < ((xx - butts[k]) % W + W) % W) k = b;
        const isButt = butts.includes(xx);
        const isSeam = yy === yb - 1;
        let col;
        if (isSeam || isButt) col = seamCol;
        else {
          const gr = g(xx, (yy - ya) * 4 + row * 7);
          col = shade(base(xx, yy), tones[k] * (1 - grain + 2 * grain * gr));
          if (yy === ya) col = mix(col, [255, 255, 255], 0.06);
          if (trenail && (((xx - butts[k]) % W + W) % W === 2) && yy === ya + Math.floor((yb - ya) / 2)) col = trenail;
        }
        if (vertical) put(img, yy, xx, col); else put(img, xx, yy, col);
      }
    }
  }
}

function sliceOf(img, k) {
  const S = GALLEON_TEX_SIZE, out = picture(S, S);
  out.data.set(img.data.subarray(k * S * S * 4, (k + 1) * S * S * 4));
  return out;
}

function band(img, y0, y1, col, seed, amp = 0.06) {
  const n = noise(seed, img.width, img.height, 8, 8);
  for (let y = y0; y < y1; y++) for (let x = 0; x < img.width; x++) put(img, x, y, shade(col, 1 - amp + 2 * amp * n(x, y)));
}
export { noise as paintNoise, band as paintBand, sliceOf as liverySlice };

export function hullSideLivery() {
  const W = 64, H = 64 * BANDS.hullSide.recs.length;
  const img = picture(W, H);
  const rowOf = (y) => Math.round(((HULL_SIDE_Y1 - y) / (HULL_SIDE_Y1 - HULL_SIDE_Y0)) * H);
  const n = noise(0x5a1, W, H, 8, 32);
  const wl = rowOf(0);
  planks(img, { y0: rowOf(-0.05), y1: H, ph: 7, seed: 0x5a2, base: (x, y) => mix(C.tar, C.weed, Math.max(0, 1 - (y - wl) / 40) * 0.8 * n(x, y)), tone: 0.08, seamCol: [18, 16, 14] });
  band(img, rowOf(0.25), rowOf(-0.05), C.tallow, 0x5a3, 0.05);
  planks(img, { y0: rowOf(0.95), y1: rowOf(0.25), ph: 7, seed: 0x5a4, base: () => mix(C.oakDark, C.tar, 0.35), tone: 0.1, trenail: C.seam });
  const wy0 = rowOf(1.32), wy1 = rowOf(0.95);
  band(img, wy0, wy1, C.wale, 0x5a5, 0.05);
  for (let x = 0; x < W; x++) { put(img, x, wy0, C.waleLit); put(img, x, wy0 + 1, mix(C.wale, C.waleLit, 0.5)); put(img, x, wy1 - 1, [16, 14, 12]); }
  const sy0 = rowOf(3.12), sy1 = rowOf(1.32);
  planks(img, { y0: sy0 + 2, y1: sy1 - 2, ph: 7, seed: 0x5a6, base: (x, y) => mix(C.oxblood, C.oxbloodLit, 0.3 * n(x, y)), tone: 0.07, seamCol: [70, 20, 16], trenail: [80, 24, 18] });
  for (let x = 0; x < W; x++) { put(img, x, sy0, C.giltDark); put(img, x, sy0 + 1, C.gilt); put(img, x, sy1 - 2, C.gilt); put(img, x, sy1 - 1, C.giltDark); }
  const uy0 = rowOf(3.45), uy1 = sy0;
  band(img, uy0, uy1, C.wale, 0x5a7, 0.05);
  for (let x = 0; x < W; x++) put(img, x, uy0, C.waleLit);
  const ty0 = rowOf(6.85), ty1 = uy0;
  planks(img, { y0: ty0, y1: ty1, ph: 7, seed: 0x5a8, base: (x, y) => mix(C.oak, C.oakLit, 0.4 * n(x, y)), tone: 0.12, trenail: C.oakDark });
  const ly = rowOf(5.2);
  for (let x = 0; x < W; x++) { put(img, x, ly, C.oxblood); put(img, x, ly + 1, C.oxblood); put(img, x, ly - 1, C.gilt); }
  band(img, 0, ty0, mix(C.oakDark, C.wale, 0.4), 0x5a9, 0.05);
  for (let x = 0; x < W; x++) { put(img, x, ty0 - 1, C.giltDark); put(img, x, ty0, C.gilt); put(img, x, 0, C.waleLit); }
  return img;
}

export const hullSideArt = (k) => sliceOf(hullSideLivery(), k);

export function hullBottomArt() {
  const img = picture(64, 64);
  const n = noise(0xb07, 64, 64, 8, 8);
  planks(img, { ph: 8, seed: 0xb01, base: (x, y) => mix(C.tar, C.weed, 0.6 * n(x, y)), tone: 0.08, seamCol: [16, 14, 12] });
  const r = mulberry32(0xb02);
  for (let k = 0; k < 40; k++) { const x = Math.floor(r() * 64), y = Math.floor(r() * 64); put(img, x, y, [120, 118, 104]); put(img, x + 1, y, [92, 90, 80]); }
  return img;
}

export function hullInnerArt() {
  const img = picture(64, 64);
  const n = noise(0x1a1, 64, 64, 8, 8);
  planks(img, { ph: 8, seed: 0x1a2, base: (x, y) => mix(C.inner, C.oakLit, 0.3 * n(x, y)), tone: 0.1, trenail: C.innerDark });
  for (const x0 of [0, 32]) for (let y = 0; y < 64; y++) {
    put(img, x0, y, C.innerDark); put(img, x0 + 1, y, mix(C.innerDark, C.inner, 0.4)); put(img, x0 + 2, y, mix(C.innerDark, C.inner, 0.7));
  }
  return img;
}

export function deckArt() {
  const img = picture(64, 64);
  const n = noise(0xdec, 64, 64, 8, 8);
  planks(img, { ph: 8, lenMin: 28, lenMax: 60, seed: 0xde1, base: (x, y) => mix(C.pine, C.pineGrey, 0.6 * n(x, y)), tone: 0.1, grain: 0.12, seamCol: [44, 34, 26], trenail: C.pineDark });
  return img;
}

export function trimArt() {
  const img = picture(64, 64);
  const n = noise(0x7a1, 64, 64, 4, 16);
  planks(img, { ph: 16, lenMin: 64, lenMax: 64, seed: 0x7a2, base: (x, y) => mix(C.oakDark, C.oak, 0.5 * n(x, y)), tone: 0.06, grain: 0.14, seamCol: [40, 27, 18] });
  return img;
}

export function castleLivery() {
  const W = 64, H = 64 * BANDS.castle.recs.length;
  const img = picture(W, H);
  const rowOf = (y) => Math.round(((CASTLE_Y1 - y) / (CASTLE_Y1 - CASTLE_Y0)) * H);
  const n = noise(0xca1, W, H, 8, 16);
  const deck = rowOf(6.2), roof = rowOf(11.02);
  band(img, deck, H, C.wale, 0xca2, 0.05);
  planks(img, { y0: roof + 6, y1: deck - 4, ph: 8, seed: 0xca3, base: (x, y) => mix(C.oxblood, C.oxbloodLit, 0.35 * n(x, y)), tone: 0.05, seamCol: [82, 24, 19] });
  for (const px of [0, 32]) {
    const x0 = px + 3, x1 = px + 28, y0 = roof + 10, y1 = deck - 9;
    for (let x = x0; x <= x1; x++) { put(img, x, y0, C.gilt); put(img, x, y1, C.giltDark); }
    for (let y = y0; y <= y1; y++) { put(img, x0, y, C.gilt); put(img, x1, y, C.giltDark); }
    for (let x = x0 + 2; x <= x1 - 2; x++) { put(img, x, y0 + 2, C.giltDark); put(img, x, y1 - 2, C.gilt); }
    for (let y = y0 + 2; y <= y1 - 2; y++) { put(img, x0 + 2, y, C.giltDark); put(img, x1 - 2, y, C.gilt); }
    const cx = (x0 + x1) >> 1, cy = (y0 + y1) >> 1;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) put(img, cx + dx, cy + dy, dx || dy ? C.gilt : C.giltLit);
    for (const [dx, dy] of [[2, 2], [-2, 2], [2, -2], [-2, -2]]) put(img, cx + dx, cy + dy, C.giltDark);
  }
  for (let y = deck - 4; y < deck; y++) for (let x = 0; x < W; x++) put(img, x, y, y === deck - 4 ? C.waleLit : C.wale);
  for (let y = roof; y < roof + 6; y++) for (let x = 0; x < W; x++) put(img, x, y, y === roof || y === roof + 5 ? C.giltDark : mix(C.gilt, C.giltLit, ((x + y) % 4 === 0) ? 0.6 : 0));
  band(img, 0, roof, C.wale, 0xca4, 0.04);
  for (let x = 0; x < W; x++) { put(img, x, 0, C.waleLit); put(img, x, 1, C.oakDark); put(img, x, 2, C.oakDark); put(img, x, roof - 1, C.oakDark); put(img, x, roof - 2, C.oakDark); }
  for (let bx = 2; bx < W; bx += 8) {
    for (let y = 3; y < roof - 2; y++) {
      const t = (y - 3) / Math.max(1, roof - 5);
      const half = t < 0.2 || t > 0.8 ? 1 : t < 0.5 ? 2 : 1.5;
      for (let dx = -Math.floor(half); dx <= Math.ceil(half) - 1; dx++) put(img, bx + 2 + dx, y, dx < 0 ? C.oakLit : C.oak);
    }
  }
  return img;
}

export const castleArt = (k) => sliceOf(castleLivery(), k);

export function sternWindowsLivery() {
  const img = castleLivery();
  const H = img.height;
  const rowOf = (y) => Math.round(((CASTLE_Y1 - y) / (CASTLE_Y1 - CASTLE_Y0)) * H);
  const top = rowOf(10.2), bot = rowOf(8.4);
  for (const px of [0, 32]) {
    const x0 = px + 6, x1 = px + 25;
    for (let y = top; y <= bot; y++) for (let x = x0; x <= x1; x++) {
      const frame = x === x0 || x === x1 || y === top || y === bot;
      const lead = !frame && ((x - x0) % 5 === 0 || (y - top) % 6 === 0);
      const glint = !frame && !lead && (x - x0) % 5 === 1 && (y - top) % 6 === 1;
      put(img, x, y, frame ? C.gilt : lead ? C.lead : glint ? C.glassLit : C.glass);
    }
    for (let x = x0; x <= x1; x++) {
      const t = (x - x0) / (x1 - x0) * 2 - 1;
      const yy = top - 1 - Math.round(3 * Math.sqrt(Math.max(0, 1 - t * t)));
      put(img, x, yy, C.giltLit);
    }
  }
  return img;
}

export const sternWindowsArt = (k) => sliceOf(sternWindowsLivery(), k);

export function sternWindowsGlowLivery() {
  const img = sternWindowsLivery();
  const out = picture(img.width, img.height);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const c = get(img, x, y);
    const glassy = (c[0] === C.glass[0] && c[1] === C.glass[1]) || (c[0] === C.glassLit[0] && c[1] === C.glassLit[1]);
    put(out, x, y, glassy ? [255, 186, 96] : [0, 0, 0]);
  }
  return out;
}

export function sparArt() {
  const S = GALLEON_TEX_SIZE, img = picture(S, S);
  const n = noise(0x5b1, S, S, 32, 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) put(img, x, y, mix(C.sparDark, C.spar, 0.35 + 0.65 * n(x, y)));
  for (let y = 12; y < 15; y++) for (let x = 0; x < S; x++) put(img, x, y, y === 12 ? C.hoopLit : C.hoop);
  return img;
}

export function ironArt() {
  const S = GALLEON_TEX_SIZE, img = picture(S, S);
  const n = noise(0x1e1, S, S, 16, 16);
  const r = mulberry32(0x1e2);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let c = mix(C.iron, C.ironLit, 0.5 * n(x, y));
    if (r() < 0.04) c = C.rust;
    put(img, x, y, c);
  }
  return img;
}

export function canvasArt() {
  const S = GALLEON_TEX_SIZE, img = picture(S, S);
  const n = noise(0xca9, S, S, 8, 8);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let c = mix(C.canvas, C.canvasDirt, 0.25 * n(x, y) + 0.25 * (y / S));
    if (x % 8 === 0) c = C.canvasSeam;
    if (x < 1 || x > S - 2 || y < 1 || y > S - 2) c = C.canvasSeam;
    put(img, x, y, c);
  }
  for (let x = 1; x < S - 1; x++) put(img, x, 15, C.canvasSeam);
  for (let x = 3; x < S - 2; x += 4) { put(img, x, 16, C.ropeDark); put(img, x, 17, C.rope); }
  return img;
}

export function ropeArt() {
  const S = GALLEON_TEX_SIZE, img = picture(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const t = ((x / 2 + y) % 16) / 16;
    put(img, x, y, t < 0.15 ? C.ropeDark : mix(C.rope, C.ropeDark, 0.45 * Math.abs(t - 0.55)));
  }
  return img;
}

export function giltArt() {
  const S = GALLEON_TEX_SIZE, img = picture(S, S);
  const n = noise(0x611, S, S, 16, 16);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = n(x, y);
    put(img, x, y, v > 0.7 ? C.giltLit : v < 0.3 ? C.giltDark : C.gilt);
  }
  return img;
}

export function grateArt() {
  const img = picture(64, 64);
  const n = noise(0x6a1, 64, 64, 8, 8);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const bx = x % 8, by = y % 8;
    const onX = bx < 3, onY = by < 3;
    let c = [18, 15, 12];
    if (onX || onY) c = mix(C.oakDark, C.oak, 0.5 + 0.5 * n(x, y));
    if (onX && !onY) c = shade(c, 0.85);
    if (onY && by === 0) c = mix(c, [255, 255, 255], 0.08);
    put(img, x, y, c);
  }
  return img;
}

export function lidArt(base = C.oxblood, seam = [70, 20, 16]) {
  const S = GALLEON_TEX_SIZE, img = picture(S, S);
  planks(img, { ph: 8, lenMin: S, lenMax: S, seed: 0x11d, base: () => base, tone: 0.06, seamCol: seam, vertical: false });
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (x < 4 || x > S - 5 || y < 2 || y > S - 3) put(img, x, y, C.wale);
  for (const sx of [12, 44]) for (let y = 2; y < 30; y++) for (let x = sx; x < sx + 8; x++) put(img, x, y, x === sx ? C.hoopLit : C.hoop);
  return img;
}

export function doorArt() {
  const S = GALLEON_TEX_SIZE, img = picture(S, S);
  const n = noise(0xd00, S, S, 4, 8);
  planks(img, { ph: 16, lenMin: S, lenMax: S, seed: 0xd01, base: (x, y) => mix(C.oakDark, C.oak, 0.4 * n(x, y)), tone: 0.08, grain: 0.15, seamCol: C.seam, vertical: true });
  for (const hy of [10, 51]) for (let y = hy; y < hy + 3; y++) for (let x = 4; x < 52; x++) put(img, x, y, y === hy ? C.hoopLit : C.hoop);
  for (let k = 0; k < 360; k += 15) { const a = (k * Math.PI) / 180; put(img, 52 + Math.round(Math.cos(a) * 4), 33 + Math.round(Math.sin(a) * 3), C.hoopLit); }
  for (let y = 0; y < S; y++) { put(img, 0, y, C.wale); put(img, S - 1, y, C.wale); }
  return img;
}

export function beamsArt() {
  const img = picture(64, 64);
  planks(img, { ph: 8, seed: 0xbe1, base: () => C.innerDark, tone: 0.1, trenail: C.beam });
  for (const x0 of [0, 32]) for (let x = x0; x < x0 + 6; x++) for (let y = 0; y < 64; y++) put(img, x, y, x === x0 + 5 ? [30, 20, 13] : x === x0 ? mix(C.beam, C.oak, 0.3) : C.beam);
  return img;
}

export function underDeckArt() {
  const img = picture(64, 64);
  planks(img, { ph: 8, seed: 0xbe1, base: () => C.innerDark, tone: 0.1, trenail: C.beam });
  return img;
}

export function darkArt(base = C.oxblood, lit = C.oxbloodLit, seam = [44, 13, 10], nail = [62, 19, 15]) {
  const S = GALLEON_TEX_SIZE, img = picture(S, S);
  const n = noise(0xd4c, S, S, 8, 8);
  planks(img, { ph: 8, lenMin: 20, lenMax: 44, seed: 0xd4b, base: (x, y) => shade(mix(base, lit, 0.25 * n(x, y)), 0.72), tone: 0.08, grain: 0.1, seamCol: seam, trenail: nail });
  return img;
}

export function galleonArt() {
  const hull = hullSideLivery(), castle = castleLivery(), stern = sternWindowsLivery();
  const cut = (band, livery) => band.recs.map((rec, k) => [rec, sliceOf(livery, k)]);
  return [
    ...cut(BANDS.hullSide, hull), [TEX.hullBottom, hullBottomArt()], [TEX.hullInner, hullInnerArt()], [TEX.deck, deckArt()],
    [TEX.trim, trimArt()], ...cut(BANDS.castle, castle), ...cut(BANDS.sternWindows, stern), [TEX.spar, sparArt()],
    [TEX.iron, ironArt()], [TEX.canvas, canvasArt()], [TEX.rope, ropeArt()], [TEX.gilt, giltArt()], [TEX.grate, grateArt()],
    [TEX.lid, lidArt()], [TEX.door, doorArt()], [TEX.beams, beamsArt()], [TEX.dark, darkArt()], [TEX.underDeck, underDeckArt()],
  ].sort((x, y) => x[0] - y[0]);
}

// A see-through window's night twin is this many records past it. The pool draws the twin at night because the day
// record's glass is a hole, and a hole draws no glow.
export const NIGHT_RECORD_OFFSET = 100;
export const GALLEON_NIGHT = Object.freeze(Object.fromEntries(BANDS.sternWindows.recs.map((r) => [r, r + NIGHT_RECORD_OFFSET])));

export function cutGlass(pic, glow) {
  const data = pic.data.slice();
  for (let i = 0; i < data.length; i += 4) if (glow.data[i] > 0) data[i + 3] = 0;
  return { width: pic.width, height: pic.height, data };
}

let _glow = null;
export function galleonGlow(record) {
  const k = BANDS.sternWindows.recs.indexOf(record >= NIGHT_RECORD_OFFSET ? record - NIGHT_RECORD_OFFSET : record);
  if (k < 0) return null;
  _glow ??= (() => { const g = sternWindowsGlowLivery(); return BANDS.sternWindows.recs.map((_, i) => sliceOf(g, i)); })();
  return _glow[k];
}
export const galleonCut = (record) => Object.hasOwn(GALLEON_NIGHT, record);

export function shipStandIns({ archive, name, records, art, night, glow }) {
  const dayOf = new Map(Object.entries(night).map(([day, twin]) => [twin, Number(day)]));
  const built = (record) => {
    if (dayOf.has(record)) return art(dayOf.get(record));
    const p = art(record);
    return p && Object.hasOwn(night, record) ? cutGlass(p, glow(record)) : p;
  };
  return [...records, ...dayOf.keys()].map((record) => ({
    archive, record, frame: 0, standIn: true, fileName: `${name}-${archive}_${record}`,
    build: async () => { const p = built(record); return p && dfLook(p, lookSeed(archive, dayOf.get(record) ?? record)); },
  }));
}

let _registered = false;
/**
 * Registers once and returns 0 on later calls. A loose pack file `38131_<record>-0.png` overrides a picture like
 * any other record.
 * @param {(entries: any[]) => number} addVendorTextures
 */
export function registerGalleonArt(addVendorTextures) {
  if (_registered) return 0;
  _registered = true;
  const made = new Map();
  const art = (record) => { if (!made.size) for (const [r, p] of galleonArt()) made.set(r, p); return made.get(record) ?? null; };
  return addVendorTextures(shipStandIns({ archive: GALLEON_ARCHIVE, name: 'galleon', records: Object.values(TEX), art, night: GALLEON_NIGHT, glow: galleonGlow }));
}
export function _resetGalleonArt() { _registered = false; _glow = null; }
export const _galleonGlowMade = () => _glow != null;
