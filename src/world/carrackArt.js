// @ts-check
// Painted from fixed seeds so every client draws the same ship. Shared records keep the galleon's `TEX` numbers,
// and each livery is cut into 64-row slices at the `BANDS` heights where carrackModel.js cuts its faces.
import {
  C, picture, put, get, mix, paintNoise as noise, planks, paintBand as band, liverySlice as sliceOf, GALLEON_TEX_SIZE, TEX as GALLEON_TEX, GALLEON_TILE,
  hullBottomArt, hullInnerArt, deckArt, trimArt, sparArt, ironArt, canvasArt, ropeArt, giltArt, grateArt, lidArt, doorArt,
  beamsArt, darkArt, underDeckArt, NIGHT_RECORD_OFFSET, shipStandIns,
} from './galleonArt.js';

export const CARRACK_ARCHIVE = 38141;
export const TEX = Object.freeze({
  hullBottom: GALLEON_TEX.hullBottom, hullInner: GALLEON_TEX.hullInner, deck: GALLEON_TEX.deck, trim: GALLEON_TEX.trim,
  spar: GALLEON_TEX.spar, iron: GALLEON_TEX.iron, canvas: GALLEON_TEX.canvas, rope: GALLEON_TEX.rope, gilt: GALLEON_TEX.gilt,
  grate: GALLEON_TEX.grate, lid: GALLEON_TEX.lid, door: GALLEON_TEX.door, beams: GALLEON_TEX.beams, dark: GALLEON_TEX.dark,
  underDeck: GALLEON_TEX.underDeck,
  hullSide0: 0, hullSide1: 17, hullSide2: 18, hullSide3: 19, hullSide4: 23,
  transom0: 6, transom1: 21, house0: 5, quarterRail0: 20, roof: 24,
});
const SHARED = Object.freeze(['hullBottom', 'hullInner', 'deck', 'trim', 'spar', 'iron', 'canvas', 'rope', 'gilt', 'grate', 'door', 'beams', 'underDeck']);

const HULL_SIDE_Y0 = -4.7;
const HULL_SIDE_Y1 = 9.8;
export const BANDS = Object.freeze({
  hullSide: Object.freeze({ y0: HULL_SIDE_Y0, y1: HULL_SIDE_Y1, recs: Object.freeze([TEX.hullSide0, TEX.hullSide1, TEX.hullSide2, TEX.hullSide3, TEX.hullSide4]) }),
  transom: Object.freeze({ y0: 3.4, y1: 9.2, recs: Object.freeze([TEX.transom0, TEX.transom1]) }),
  house: Object.freeze({ y0: 7.6, y1: 11.0, recs: Object.freeze([TEX.house0]) }),
  quarterRail: Object.freeze({ y0: 7.9, y1: 9.6, recs: Object.freeze([TEX.quarterRail0]) }),
});
export const CARRACK_TILE = Object.freeze({
  ...GALLEON_TILE, hullSide: [2.8, 0], transom: [2.6, 0], house: [2.6, 0], quarterRail: [2.6, 0], roof: [2, 2],
});

const K = Object.freeze({
  blue: [46, 66, 94], blueLit: [66, 90, 124], blueDark: [30, 44, 64],
  ochre: [176, 128, 48], ochreLit: [214, 166, 78], ochreDark: [118, 82, 30],
  whiteLead: [198, 192, 172], black: [24, 22, 21], blackLit: [58, 54, 50],
});

const rowAt = (y, y0, y1, H) => Math.round(((y1 - y) / (y1 - y0)) * H);
const line = (img, y, col) => { for (let x = 0; x < img.width; x++) put(img, x, y, col); };

function hullSideLivery() {
  const W = 64, H = 64 * BANDS.hullSide.recs.length;
  const img = picture(W, H);
  const rowOf = (y) => rowAt(y, HULL_SIDE_Y0, HULL_SIDE_Y1, H);
  const n = (/** @type {number} */ seed) => noise1(seed, W, H);
  const weed = n(0xc51);
  const wl = rowOf(0);
  planks(img, { y0: rowOf(-0.05), y1: H, ph: 7, seed: 0xc52, base: (x, y) => mix(C.tar, C.weed, Math.max(0, 1 - (y - wl) / 44) * 0.8 * weed(x, y)), tone: 0.08, seamCol: [18, 16, 14] });
  band(img, rowOf(0.3), rowOf(-0.05), K.whiteLead, 0xc53, 0.04);
  planks(img, { y0: rowOf(2.25), y1: rowOf(0.3), ph: 7, seed: 0xc54, base: () => mix(C.oakDark, C.tar, 0.4), tone: 0.1, trenail: C.seam });
  const mw0 = rowOf(2.75), mw1 = rowOf(2.25);
  band(img, mw0, mw1, K.black, 0xc55, 0.05);
  line(img, mw0, K.blackLit); line(img, mw1 - 1, [14, 13, 12]);
  const s0 = rowOf(4.55), s1 = mw0;
  const sb = n(0xc56);
  planks(img, { y0: s0 + 2, y1: s1 - 2, ph: 7, seed: 0xc57, base: (x, y) => mix(K.blue, K.blueLit, 0.35 * sb(x, y)), tone: 0.07, seamCol: K.blueDark, trenail: K.blueDark });
  line(img, s0, K.ochreDark); line(img, s0 + 1, K.ochre); line(img, s1 - 2, K.ochre); line(img, s1 - 1, K.ochreDark);
  const uw0 = rowOf(5.0);
  band(img, uw0, s0, K.black, 0xc58, 0.05);
  line(img, uw0, K.blackLit);
  const t0 = rowOf(8.45);
  const ob = n(0xc59);
  planks(img, { y0: t0, y1: uw0, ph: 7, seed: 0xc5a, base: (x, y) => mix(C.oak, C.oakLit, 0.4 * ob(x, y)), tone: 0.12, trenail: C.oakDark });
  const bl = rowOf(6.9);
  line(img, bl - 1, K.ochre); line(img, bl, K.blue); line(img, bl + 1, K.blue); line(img, bl + 2, K.blueDark);
  band(img, 0, t0, K.black, 0xc5b, 0.05);
  line(img, t0 - 1, K.ochre); line(img, t0, K.ochreDark);
  for (const y of [8.95, 9.45]) line(img, rowOf(y), K.ochreDark);
  line(img, 0, K.blackLit);
  return img;
}

const noise1 = (seed, W, H) => noise(seed, W, H, 8, Math.max(8, H / 8));

const hullSideArt = (k) => sliceOf(hullSideLivery(), k);

export function transomLivery() {
  const { y0, y1, recs } = BANDS.transom;
  const W = 64, H = 64 * recs.length;
  const img = picture(W, H);
  const rowOf = (y) => rowAt(y, y0, y1, H);
  const sb = noise1(0xc61, W, H);
  planks(img, { ph: 7, seed: 0xc62, base: (x, y) => mix(K.blue, K.blueLit, 0.3 * sb(x, y)), tone: 0.06, seamCol: K.blueDark });
  band(img, rowOf(5.0), rowOf(4.55), K.black, 0xc63, 0.05);
  band(img, 0, rowOf(8.45), K.black, 0xc64, 0.05);
  line(img, rowOf(8.45) - 1, K.ochre);
  const top = rowOf(6.05), bot = rowOf(5.1);
  for (const px of [0, 32]) {
    const xa = px + 7, xb = px + 24;
    for (let y = top; y <= bot; y++) for (let x = xa; x <= xb; x++) {
      const frame = x === xa || x === xb || y === top || y === bot;
      const lead = !frame && ((x - xa) % 4 === 0 || (y - top) % 5 === 0);
      const glint = !frame && !lead && (x - xa) % 4 === 1 && (y - top) % 5 === 1;
      put(img, x, y, frame ? K.ochreLit : lead ? C.lead : glint ? C.glassLit : C.glass);
    }
    for (let x = xa; x <= xb; x++) {
      const t = ((x - xa) / (xb - xa)) * 2 - 1;
      put(img, x, top - 1 - Math.round(2 * Math.sqrt(Math.max(0, 1 - t * t))), K.ochre);
    }
  }
  const nb0 = rowOf(7.5), nb1 = rowOf(6.85);
  for (let y = nb0; y <= nb1; y++) for (let x = 0; x < W; x++) {
    const edge = y === nb0 || y === nb1;
    put(img, x, y, edge ? K.ochreDark : mix(K.ochre, K.ochreLit, ((x * 7 + y * 3) % 11) / 22));
  }
  const ly = (nb0 + nb1) >> 1;
  for (let x = 4; x < W - 4; x++) if (x % 6 !== 5 && ((x * 13) % 7) > 1) { put(img, x, ly, K.blueDark); if (x % 3 === 0) put(img, x, ly - 1, K.blueDark); }
  return img;
}
const transomArt = (k) => sliceOf(transomLivery(), k);

export function transomGlowLivery() {
  const img = transomLivery();
  const out = picture(img.width, img.height);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const c = get(img, x, y);
    const glassy = (c[0] === C.glass[0] && c[1] === C.glass[1]) || (c[0] === C.glassLit[0] && c[1] === C.glassLit[1]);
    put(out, x, y, glassy ? [255, 186, 96] : [0, 0, 0]);
  }
  return out;
}

export function houseArt() {
  const { y0, y1 } = BANDS.house;
  const S = GALLEON_TEX_SIZE, img = picture(S, S);
  const rowOf = (y) => rowAt(y, y0, y1, S);
  const n = noise1(0xc71, S, S);
  const sill = rowOf(7.95), fascia = rowOf(10.4);
  for (let y = fascia; y < sill; y++) {
    const k = (sill - 1 - y) % 5;
    for (let x = 0; x < S; x++) {
      let c = mix(C.oak, C.oakLit, 0.45 * n(x, y));
      if (k === 0) c = mix(c, [255, 255, 255], 0.1);
      if (k === 4) c = mix(c, C.seam, 0.55);
      put(img, x, y, c);
    }
  }
  band(img, sill, S, C.tar, 0xc72, 0.05);
  line(img, sill, C.oakDark);
  band(img, 0, fascia, K.blue, 0xc73, 0.05);
  line(img, fascia - 1, K.ochre); line(img, fascia - 2, K.ochreDark); line(img, 0, K.blueDark);
  for (let y = fascia; y < sill; y++) { put(img, 0, y, C.oakDark); put(img, S - 1, y, C.oakDark); }
  return img;
}

export function quarterRailArt() {
  const { y0, y1 } = BANDS.quarterRail;
  const S = GALLEON_TEX_SIZE, img = picture(S, S);
  const rowOf = (y) => rowAt(y, y0, y1, S);
  const sb = noise1(0xc81, S, S);
  const cap = rowOf(9.45), foot = rowOf(8.12);
  planks(img, { y0: cap, y1: foot, ph: 8, seed: 0xc82, base: (x, y) => mix(K.blue, K.blueLit, 0.3 * sb(x, y)), tone: 0.05, seamCol: K.blueDark });
  band(img, 0, cap, K.black, 0xc83, 0.04);
  band(img, foot, S, K.black, 0xc84, 0.04);
  line(img, 0, K.blackLit);
  for (const px of [0, 32]) {
    const xa = px + 3, xb = px + 28, ya = cap + 5, yb = foot - 5;
    for (let x = xa; x <= xb; x++) { put(img, x, ya, K.ochreLit); put(img, x, yb, K.ochreDark); }
    for (let y = ya; y <= yb; y++) { put(img, xa, y, K.ochreLit); put(img, xb, y, K.ochreDark); }
    for (let x = xa + 2; x <= xb - 2; x++) { put(img, x, ya + 2, K.ochreDark); put(img, x, yb - 2, K.ochre); }
    for (let y = ya + 2; y <= yb - 2; y++) { put(img, xa + 2, y, K.ochreDark); put(img, xb - 2, y, K.ochre); }
  }
  return img;
}

export function roofArt() {
  const S = GALLEON_TEX_SIZE, img = picture(S, S);
  const n = noise1(0xc91, S, S);
  planks(img, { ph: 8, lenMin: 30, lenMax: 60, seed: 0xc92, base: (x, y) => mix(C.tar, C.wale, 0.5 + 0.5 * n(x, y)), tone: 0.1, grain: 0.12, seamCol: [14, 12, 11], vertical: true });
  return img;
}

export function carrackArt() {
  const cut = (b, livery) => b.recs.map((rec, k) => [rec, sliceOf(livery, k)]);
  const shared = { hullBottom: hullBottomArt, hullInner: hullInnerArt, deck: deckArt, trim: trimArt, spar: sparArt, iron: ironArt, canvas: canvasArt, rope: ropeArt, gilt: giltArt, grate: grateArt, door: doorArt, beams: beamsArt, underDeck: underDeckArt };
  return [
    ...SHARED.map((key) => [TEX[key], shared[key]()]),
    [TEX.lid, lidArt(K.blue, K.blueDark)], [TEX.dark, darkArt(K.blue, K.blueLit, [18, 26, 38], [26, 36, 52])],
    ...cut(BANDS.hullSide, hullSideLivery()), ...cut(BANDS.transom, transomLivery()),
    [TEX.house0, houseArt()], [TEX.quarterRail0, quarterRailArt()], [TEX.roof, roofArt()],
  ].sort((x, y) => x[0] - y[0]);
}

export const CARRACK_NIGHT = Object.freeze(Object.fromEntries(BANDS.transom.recs.map((r) => [r, r + NIGHT_RECORD_OFFSET])));
export const carrackCut = (record) => Object.hasOwn(CARRACK_NIGHT, record);

let _glow = null;
export function carrackGlow(record) {
  const k = BANDS.transom.recs.indexOf(record >= NIGHT_RECORD_OFFSET ? record - NIGHT_RECORD_OFFSET : record);
  if (k < 0) return null;
  _glow ??= (() => { const g = transomGlowLivery(); return BANDS.transom.recs.map((_, i) => sliceOf(g, i)); })();
  return _glow[k];
}

let _registered = false;
/** @param {(entries: any[]) => number} addVendorTextures */
export function registerCarrackArt(addVendorTextures) {
  if (_registered) return 0;
  _registered = true;
  const made = new Map();
  const art = (record) => { if (!made.size) for (const [r, p] of carrackArt()) made.set(r, p); return made.get(record) ?? null; };
  return addVendorTextures(shipStandIns({ archive: CARRACK_ARCHIVE, name: 'carrack', records: Object.values(TEX), art, night: CARRACK_NIGHT, glow: carrackGlow }));
}
export function _resetCarrackArt() { _registered = false; _glow = null; }

export const CARRACK_PALETTE = K;
