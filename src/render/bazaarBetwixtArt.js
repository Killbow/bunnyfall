// @ts-check
// Procedural moonlit Ceporah alabaster, deep astral slate, golden ley-seams, Artaeum cliffs, and Psijic vestments.

import { dfLook, lookSeed } from '../world/dfLook.js';
import { billboardSize } from '../world/rmbFlats.js';
import { APP_ROOT } from '../platform/appRoot.js';
import { toColor32 } from '../formats/color32Order.js';
import { decodePng } from './textureReplacement.js';

export const BAZAAR_NPC_ARCHIVE = 38351;
export const BAZAAR_ROOM_ARCHIVE = 38352;

export const BAZAAR_TEX = Object.freeze({
  marbleWall: 0,
  marblePier: 1,
  astralSlate: 2,
  chancelSun: 3,
  domeCoffer: 4,
  leyGold: 5,
  balustrade: 6,
  artaeumCliff: 7,
  stasisCascade: 8,
  invisibleDeck: 9,
  vistaWindow: 10,
  vistaMarble: 11,
});

const clamp8 = (/** @type {number} */ v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const clamp01 = (/** @type {number} */ v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ t) => a + (b - a) * t;
const smooth = (/** @type {number} */ t) => t * t * (3 - 2 * t);

function hash2(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function vnoise2(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ periodX, /** @type {number} */ periodY, /** @type {number} */ seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth(x - ix), fy = smooth(y - iy);
  const wx0 = ((ix % periodX) + periodX) % periodX, wx1 = (wx0 + 1) % periodX;
  const wy0 = ((iy % periodY) + periodY) % periodY, wy1 = (wy0 + 1) % periodY;
  const a = lerp(hash2(wx0, wy0, seed), hash2(wx1, wy0, seed), fx);
  const b = lerp(hash2(wx0, wy1, seed), hash2(wx1, wy1, seed), fx);
  return lerp(a, b, fy);
}

function packEmission(/** @type {{ width: number, height: number, colors: Uint8Array }} */ looked, /** @type {Float32Array} */ emitMask) {
  const { width: w, height: h } = looked;
  const emission = new Uint8Array(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const k = emitMask[p], o = p * 4;
    emission[o] = clamp8(Math.round(looked.colors[o] * k));
    emission[o + 1] = clamp8(Math.round(looked.colors[o + 1] * k));
    emission[o + 2] = clamp8(Math.round(looked.colors[o + 2] * k));
    emission[o + 3] = 255;
  }
  return { albedo: looked, emission: { width: w, height: h, colors: emission } };
}

function buildMoonAlabasterWall(w = 128, h = 128) {
  const colors = new Uint8Array(w * h * 4);
  const emitMask = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const v = y / h;
    const row = Math.floor(v * 5);
    const rowFrac = (v * 5) % 1;
    const leyBand = v >= 0.79 && v <= 0.88;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const stag = (row & 1) * 0.5;
      const col = Math.floor(u * 2.5 + stag);
      const colFrac = (u * 2.5 + stag) % 1;
      const vein = vnoise2(u * 6 + v * 2, v * 6, 6, 6, 701);
      const cloud = vnoise2(u * 4, v * 4, 4, 4, 709);
      const veinLine = Math.max(0, 1 - Math.abs(vein - 0.5) * 10);
      let r = 172 + 22 * (cloud - 0.5) - 28 * veinLine;
      let g = 176 + 22 * (cloud - 0.5) - 24 * veinLine;
      let b = 188 + 24 * (cloud - 0.5) - 14 * veinLine;
      const blockTint = (hash2(col, row, 719) - 0.5) * 12;
      r += blockTint; g += blockTint; b += blockTint;
      let em = 0.04;

      if (leyBand) {
        const bv = (v - 0.79) / 0.09;
        const border = bv < 0.18 || bv > 0.82;
        const runeStep = ((x + Math.floor(bv * 6)) % 12 < 3) || Math.abs(bv - 0.5) < 0.14;
        if (runeStep && !border) {
          r = 228; g = 198; b = 128;
          em = 0.82;
        } else if (border) {
          r = 184; g = 162; b = 114;
          em = 0.34;
        } else {
          r = 28; g = 36; b = 56;
          em = 0.08;
        }
      } else {
        const seamY = rowFrac < 0.045 || rowFrac > 0.965;
        const seamX = colFrac < 0.025 || colFrac > 0.980;
        if (seamY || seamX) {
          r -= 48; g -= 46; b -= 40;
        } else if (rowFrac > 0.91 || colFrac < 0.055) {
          r += 14; g += 14; b += 16;
        } else if (rowFrac < 0.085) {
          r -= 15; g -= 15; b -= 12;
        }
      }
      const p = y * w + x, o = p * 4;
      colors[o] = clamp8(r); colors[o + 1] = clamp8(g); colors[o + 2] = clamp8(b); colors[o + 3] = 255;
      emitMask[p] = em;
    }
  }
  const looked = dfLook({ width: w, height: h, colors }, lookSeed(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.marbleWall));
  return packEmission(looked, emitMask);
}

function buildCeporahPier(w = 64, h = 128) {
  const colors = new Uint8Array(w * h * 4);
  const emitMask = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const vein = vnoise2(u * 4, v * 8, 4, 8, 733);
      let r = 178 + (vein - 0.5) * 18;
      let g = 182 + (vein - 0.5) * 18;
      let b = 194 + (vein - 0.5) * 20;
      let em = 0.05;

      const goldCollar = (v >= 0.04 && v <= 0.085) || (v >= 0.905 && v <= 0.955) || (v >= 0.485 && v <= 0.515);
      if (goldCollar) {
        r = 216; g = 186; b = 118;
        em = 0.62;
      } else {
        const fluteU = (u * 8) % 1;
        if (fluteU > 0.16 && fluteU < 0.84) {
          const fn = ((fluteU - 0.16) / 0.68) * 2 - 1;
          const shade = -30 * (1 - fn * fn) + 10 * fn;
          r += shade; g += shade * 0.96; b += shade * 0.90;
        } else {
          r += 12; g += 12; b += 14;
        }
        if (Math.abs((v * 5) % 1) < 0.018) { r -= 36; g -= 35; b -= 30; }
      }
      const p = y * w + x, o = p * 4;
      colors[o] = clamp8(r); colors[o + 1] = clamp8(g); colors[o + 2] = clamp8(b); colors[o + 3] = 255;
      emitMask[p] = em;
    }
  }
  const looked = dfLook({ width: w, height: h, colors }, lookSeed(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.marblePier));
  return packEmission(looked, emitMask);
}

function buildAstralSlateFloor(w = 128, h = 128) {
  const colors = new Uint8Array(w * h * 4);
  const emitMask = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const fu = (u * 2) % 1, fv = (v * 2) % 1;
      const tx = Math.floor(u * 2), ty = Math.floor(v * 2);
      const n = vnoise2(u * 8, v * 8, 8, 8, 751);
      const fine = vnoise2(u * 16 + 1.7, v * 16, 16, 16, 757);
      const joint = fu < 0.026 || fu > 0.974 || fv < 0.026 || fv > 0.974;
      const bevelHi = !joint && (fu < 0.052 || fv < 0.052);
      const bevelLo = !joint && (fu > 0.948 || fv > 0.948);
      const diag = Math.abs(Math.abs(fu - 0.5) + Math.abs(fv - 0.5) - 0.36) < 0.016;
      const alt = (tx + ty) & 1;

      let r = (alt ? 27 : 33) + (n - 0.5) * 14 + (fine - 0.5) * 8;
      let g = (alt ? 34 : 41) + (n - 0.5) * 15 + (fine - 0.5) * 8;
      let b = (alt ? 52 : 62) + (n - 0.5) * 18 + (fine - 0.5) * 10;
      let em = 0.06;

      if (diag) {
        r = 166 + (n - 0.5) * 16;
        g = 144 + (n - 0.5) * 14;
        b = 98 + (n - 0.5) * 12;
        em = 0.36;
      } else if (joint) {
        r = 14; g = 18; b = 28;
        em = 0.02;
      } else if (bevelHi) {
        r += 16; g += 18; b += 24;
      } else if (bevelLo) {
        r -= 9; g -= 9; b -= 11;
      }

      const p = y * w + x, o = p * 4;
      colors[o] = clamp8(r); colors[o + 1] = clamp8(g); colors[o + 2] = clamp8(b); colors[o + 3] = 255;
      emitMask[p] = em;
    }
  }
  const looked = dfLook({ width: w, height: h, colors }, lookSeed(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.astralSlate));
  return packEmission(looked, emitMask);
}

function buildChancelSun(w = 256, h = 256) {
  const colors = new Uint8Array(w * h * 4);
  const emitMask = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const ny = ((y + 0.5) / h) * 2 - 1;
    for (let x = 0; x < w; x++) {
      const nx = ((x + 0.5) / w) * 2 - 1;
      const rad = Math.hypot(nx, ny);
      const ang = Math.atan2(ny, nx);
      const n = vnoise2((nx + 1) * 4, (ny + 1) * 4, 8, 8, 769);

      const ringOuter = Math.abs(rad - 0.90) < 0.024;
      const ringMid = Math.abs(rad - 0.62) < 0.020;
      const ringInner = Math.abs(rad - 0.34) < 0.022;
      const core = rad < 0.13;
      const rays12 = Math.abs(Math.sin(ang * 6.0)) < 0.024 / Math.max(0.16, rad) && rad > 0.13 && rad < 0.90;
      const offCircleA = Math.abs(Math.hypot(nx - 0.15, ny + 0.08) - 0.44) < 0.015;
      const offCircleB = Math.abs(Math.hypot(nx + 0.13, ny - 0.10) - 0.41) < 0.015;

      let r, g, b, em = 0.08;
      if (core) {
        const t = 1 - rad / 0.13;
        r = 196 + t * 54; g = 176 + t * 62; b = 122 + t * 88;
        em = 0.92;
      } else if (ringOuter || ringMid || ringInner || rays12 || offCircleA || offCircleB) {
        r = 216 + (n - 0.5) * 14; g = 186 + (n - 0.5) * 12; b = 118 + (n - 0.5) * 10;
        em = 0.68;
      } else if (rad < 0.62) {
        r = 26 + (n - 0.5) * 10; g = 34 + (n - 0.5) * 12; b = 54 + (n - 0.5) * 14;
        em = 0.12;
      } else {
        r = 170 + (n - 0.5) * 16; g = 174 + (n - 0.5) * 16; b = 186 + (n - 0.5) * 16;
      }
      const p = y * w + x, o = p * 4;
      colors[o] = clamp8(r); colors[o + 1] = clamp8(g); colors[o + 2] = clamp8(b); colors[o + 3] = 255;
      emitMask[p] = em;
    }
  }
  const looked = dfLook({ width: w, height: h, colors }, lookSeed(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.chancelSun));
  return packEmission(looked, emitMask);
}

function buildDomeCoffer(w = 128, h = 128) {
  const colors = new Uint8Array(w * h * 4);
  const emitMask = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const cu = (u * 2) % 1, cv = (v * 2) % 1;
      const d = Math.max(Math.abs(cu - 0.5), Math.abs(cv - 0.5)) * 2;
      const rad = Math.hypot(cu - 0.5, cv - 0.5) * 2;
      const n = vnoise2(u * 8, v * 8, 8, 8, 787);
      let r, g, b, em = 0.06;
      if (d > 0.78) {
        r = 174 + (n - 0.5) * 14; g = 178 + (n - 0.5) * 14; b = 190 + (n - 0.5) * 14;
        if (d > 0.94) { r -= 28; g -= 27; b -= 24; }
      } else if (d > 0.68) {
        r = 212 + (n - 0.5) * 12; g = 182 + (n - 0.5) * 10; b = 116 + (n - 0.5) * 10;
        em = 0.54;
      } else if (rad < 0.14) {
        r = 236; g = 208; b = 142;
        em = 0.88;
      } else if (rad < 0.22) {
        r = 184; g = 158; b = 104;
        em = 0.45;
      } else {
        const step = d > 0.48 ? 0.82 : 1.0;
        r = (24 + (n - 0.5) * 10) * step;
        g = (32 + (n - 0.5) * 10) * step;
        b = (52 + (n - 0.5) * 12) * step;
        em = 0.10;
      }
      const p = y * w + x, o = p * 4;
      colors[o] = clamp8(r); colors[o + 1] = clamp8(g); colors[o + 2] = clamp8(b); colors[o + 3] = 255;
      emitMask[p] = em;
    }
  }
  const looked = dfLook({ width: w, height: h, colors }, lookSeed(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.domeCoffer));
  return packEmission(looked, emitMask);
}

function buildLeyGold(w = 64, h = 64) {
  const colors = new Uint8Array(w * h * 4);
  const emitMask = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    const prof = Math.sin(v * Math.PI);
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const n = vnoise2(u * 6, v * 6, 6, 6, 809);
      const leyPulse = v > 0.36 && v < 0.64;
      const glyph = leyPulse && ((x % 12 < 3) || Math.abs(v - 0.5) < 0.06);
      let r = 168 + 54 * prof + (n - 0.5) * 12;
      let g = 142 + 48 * prof + (n - 0.5) * 11;
      let b = 88 + 38 * prof + (n - 0.5) * 10;
      let em = 0.48 + 0.24 * prof;
      if (glyph) {
        r = 246; g = 226; b = 168;
        em = 0.96;
      }
      const p = y * w + x, o = p * 4;
      colors[o] = clamp8(r); colors[o + 1] = clamp8(g); colors[o + 2] = clamp8(b); colors[o + 3] = 255;
      emitMask[p] = em;
    }
  }
  const looked = dfLook({ width: w, height: h, colors }, lookSeed(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.leyGold));
  return packEmission(looked, emitMask);
}

function buildBalustrade(w = 128, h = 64) {
  const colors = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const n = vnoise2(u * 8, v * 4, 8, 4, 827);
      const cellU = (u * 6) % 1;
      const du = Math.abs(cellU - 0.5) * 2;
      const vaseW = 0.22 + 0.26 * Math.sin(clamp01((v - 0.16) / 0.68) * Math.PI);
      const isPlinth = v < 0.18 || v > 0.82;
      const isGoldLip = (v >= 0.14 && v <= 0.19) || (v >= 0.81 && v <= 0.86);
      const isBaluster = v >= 0.18 && v <= 0.82 && du <= vaseW;
      if (!isPlinth && !isBaluster) continue;

      let r = 174 + (n - 0.5) * 14;
      let g = 178 + (n - 0.5) * 14;
      let b = 190 + (n - 0.5) * 14;
      if (isGoldLip) {
        r = 208; g = 180; b = 116;
      } else if (isBaluster) {
        const cyl = Math.sqrt(Math.max(0, 1 - (du / Math.max(0.05, vaseW)) ** 2));
        r = 142 + 46 * cyl;
        g = 146 + 46 * cyl;
        b = 158 + 46 * cyl;
      }
      const o = (y * w + x) * 4;
      colors[o] = clamp8(r); colors[o + 1] = clamp8(g); colors[o + 2] = clamp8(b); colors[o + 3] = 255;
    }
  }
  return dfLook({ width: w, height: h, colors }, lookSeed(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.balustrade));
}

function buildArtaeumCliff(w = 128, h = 128) {
  const colors = new Uint8Array(w * h * 4);
  const emitMask = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    const band = 0.5 + 0.5 * Math.sin(v * Math.PI * 6);
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const strata = vnoise2(u * 4, v * 8, 4, 8, 863);
      const crag = vnoise2(u * 8 + strata * 1.2, v * 8, 8, 8, 877);
      const ridge = Math.abs(((u * 4 + strata * 0.5) % 1) - 0.5) * 2;
      const fissure = Math.abs(v * 6 - Math.round(v * 6) + (strata - 0.5) * 0.35) < 0.065;
      const goldVein = Math.abs(crag - 0.52) < 0.016 && strata > 0.48;
      let r = 56 + 34 * ridge + 14 * band + (crag - 0.5) * 20;
      let g = 64 + 36 * ridge + 16 * band + (crag - 0.5) * 20;
      let b = 86 + 44 * ridge + 20 * band + (crag - 0.5) * 24;
      let em = 0.06;
      if (fissure) {
        r *= 0.62; g *= 0.64; b *= 0.68;
      } else if (goldVein) {
        r = 186; g = 166; b = 114;
        em = 0.38;
      }
      const p = y * w + x, o = p * 4;
      colors[o] = clamp8(r); colors[o + 1] = clamp8(g); colors[o + 2] = clamp8(b); colors[o + 3] = 255;
      emitMask[p] = em;
    }
  }
  const looked = dfLook({ width: w, height: h, colors }, lookSeed(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.artaeumCliff));
  return packEmission(looked, emitMask);
}

function buildStasisCascade(w = 64, h = 128) {
  const colors = new Uint8Array(w * h * 4);
  const emitMask = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const streak = vnoise2(u * 16, v * 4, 16, 4, 907);
      const foam = vnoise2(u * 8, v * 12, 8, 12, 919);
      const crest = Math.pow(clamp01(streak * 0.72 + foam * 0.48), 1.6);
      const glint = hash2(x >> 1, y >> 2, 929) > 0.92 ? 1 : 0;
      const r = 74 + 148 * crest + 32 * glint;
      const g = 148 + 94 * crest + 16 * glint;
      const b = 196 + 56 * crest + 8 * glint;
      const p = y * w + x, o = p * 4;
      colors[o] = clamp8(r); colors[o + 1] = clamp8(g); colors[o + 2] = clamp8(b); colors[o + 3] = 255;
      emitMask[p] = clamp01(0.62 + 0.36 * crest);
    }
  }
  const looked = dfLook({ width: w, height: h, colors }, lookSeed(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.stasisCascade));
  return packEmission(looked, emitMask);
}

function buildInvisibleDeck(w = 16, h = 16) {
  return { width: w, height: h, colors: new Uint8Array(w * h * 4) };
}

function buildVistaWindow(w = 128, h = 128) {
  const colors = new Uint8Array(w * h * 4);
  const emitMask = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    const archT = clamp01((v - 0.62) / 0.28);
    const paneHalfW = v < 0.11 || v > 0.90 ? -1 : v <= 0.62 ? 0.31 : 0.31 * Math.pow(Math.max(0, 1 - archT), 0.72);
    const revealHalfW = v < 0.06 || v > 0.94 ? -1 : v <= 0.62 ? 0.40 : 0.40 * Math.pow(Math.max(0, 1 - clamp01((v - 0.62) / 0.32)), 0.72);
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const du = Math.abs(u - 0.5);
      const n = vnoise2(u * 6, v * 8, 6, 8, 941);
      let r = 166 + (n - 0.5) * 16;
      let g = 171 + (n - 0.5) * 16;
      let b = 184 + (n - 0.5) * 18;
      let em = 0.05;

      if (paneHalfW > 0 && du <= paneHalfW) {
        const mullionV = du < 0.020 && v < 0.74;
        const transom = Math.abs(v - 0.36) < 0.015 || Math.abs(v - 0.58) < 0.015;
        const rosette = Math.abs(Math.hypot(du, (v - 0.73) * 0.92) - 0.082) < 0.016;
        if (mullionV || transom || rosette) {
          r = 34; g = 40; b = 62;
          em = 0.14;
        } else {
          const core = clamp01(1 - du / Math.max(0.05, paneHalfW));
          const cyanMix = clamp01((v - 0.42) * 1.15) * 0.55;
          const warmR = 236 + 16 * core, warmG = 198 + 26 * core, warmB = 118 + 34 * core;
          const starR = 136 + 64 * core, starG = 206 + 38 * core, starB = 242 + 12 * core;
          const shimmer = (n - 0.5) * 14;
          r = lerp(warmR, starR, cyanMix) + shimmer;
          g = lerp(warmG, starG, cyanMix) + shimmer;
          b = lerp(warmB, starB, cyanMix) + shimmer;
          em = 0.85;
        }
      } else if (revealHalfW > 0 && du <= revealHalfW) {
        const goldTrim = du >= revealHalfW - 0.032 || (v >= 0.06 && v <= 0.105);
        if (goldTrim) {
          r = 208 + (n - 0.5) * 12;
          g = 178 + (n - 0.5) * 10;
          b = 112 + (n - 0.5) * 10;
          em = 0.48;
        } else {
          r = 24 + (n - 0.5) * 8;
          g = 31 + (n - 0.5) * 9;
          b = 52 + (n - 0.5) * 12;
          em = 0.06;
        }
      } else if (Math.abs((v * 5) % 1) < 0.028) {
        r -= 32; g -= 31; b -= 26;
      }

      const p = y * w + x, o = p * 4;
      colors[o] = clamp8(r); colors[o + 1] = clamp8(g); colors[o + 2] = clamp8(b); colors[o + 3] = 255;
      emitMask[p] = em;
    }
  }
  const looked = dfLook({ width: w, height: h, colors }, lookSeed(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.vistaWindow));
  return packEmission(looked, emitMask);
}

function buildVistaMarble(w = 128, h = 128) {
  const base = buildMoonAlabasterWall(w, h);
  const emitMask = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const o = p * 4;
    const origEm = base.emission.colors[o] / Math.max(1, base.albedo.colors[o]);
    emitMask[p] = Math.max(0.36, origEm);
  }
  return packEmission(base.albedo, emitMask);
}

const CELARUS_PAD_X = 7;
const CELARUS_STUD_ANGLES = Object.freeze([
  Math.PI * 0.05, Math.PI * 0.19, Math.PI * 0.33,
  Math.PI * 0.67, Math.PI * 0.81, Math.PI * 0.95,
  -Math.PI * 0.12, -Math.PI * 0.28,
  -Math.PI * 0.72, -Math.PI * 0.88,
]);

/**
 * Build Master Celarus on a 49x93 bottom-up RGBA8 frame from Mages Guild Daedra Summoner 177_4 (35x93).
 * @param {Uint8Array} srcColors
 * @param {Uint8Array} base0Colors
 * @param {number} w
 * @param {number} h
 * @param {number} seed
 */
function buildCelarusSummonerFrame(srcColors, base0Colors, w, h, seed) {
  const padX = CELARUS_PAD_X;
  const outW = w + padX * 2;
  const outH = h;
  const raw = new Uint8Array(outW * outH * 4);

  const setPx = (/** @type {number} */ ox, /** @type {number} */ oy, /** @type {number} */ r, /** @type {number} */ g, /** @type {number} */ b) => {
    if (ox < 0 || ox >= outW || oy < 0 || oy >= outH) return;
    const o = (oy * outW + ox) * 4;
    raw[o] = clamp8(Math.round(r));
    raw[o + 1] = clamp8(Math.round(g));
    raw[o + 2] = clamp8(Math.round(b));
    raw[o + 3] = 255;
  };

  const b0Alpha = (/** @type {number} */ x, /** @type {number} */ y) => (x < 0 || x >= w || y < 0 || y >= h ? 0 : base0Colors[(y * w + x) * 4 + 3]);
  const isGreen0 = (/** @type {number} */ x, /** @type {number} */ y) => {
    if (b0Alpha(x, y) < 128) return false;
    const i = (y * w + x) * 4;
    return base0Colors[i + 1] > base0Colors[i] + 7 && base0Colors[i + 1] > base0Colors[i + 2] + 5;
  };
  const isDark0 = (/** @type {number} */ x, /** @type {number} */ y) => {
    if (b0Alpha(x, y) < 128) return false;
    const i = (y * w + x) * 4;
    return base0Colors[i] < 54 && base0Colors[i + 1] < 58 && base0Colors[i + 2] < 58;
  };

  const cx = padX + 17.5;
  const cy = 74.6;
  const outerRx = 19.6, outerRy = 9.8;
  const innerRx = 15.0, innerRy = 6.3;
  const midRx = (outerRx + innerRx) * 0.5;
  const midRy = (outerRy + innerRy) * 0.5;
  const wingLift = (/** @type {number} */ dx) => 0.0075 * dx * dx;
  const studs = CELARUS_STUD_ANGLES.map((a) => {
    const dx = Math.cos(a) * midRx;
    return [cx + dx, cy + Math.sin(a) * midRy + wingLift(dx)];
  });

  const paintHaloArc = (/** @type {boolean} */ frontPass) => {
    for (let oy = 65; oy <= Math.min(outH - 1, 88); oy++) {
      for (let ox = 1; ox < outW - 1; ox++) {
        const dx = ox - cx;
        const dy = (oy - wingLift(dx)) - cy;
        if (!frontPass && dy <= -1.2) continue;
        if (frontPass && dy > -1.2) continue;
        if (!frontPass && dy > 6.8 && Math.abs(dx) < 8.5) continue;

        const dOut = (dx * dx) / (outerRx * outerRx) + (dy * dy) / (outerRy * outerRy);
        const dIn = (dx * dx) / (innerRx * innerRx) + (dy * dy) / (innerRy * innerRy);
        if (dOut > 1.0 || dIn < 1.0) continue;

        const rOut = Math.sqrt(dOut);
        const rim = dOut > 0.85 || dIn < 1.18;
        const light = clamp01(0.56 - dx * 0.012 + dy * 0.026);

        let minStud = 99;
        for (const [sx, sy] of studs) {
          const md = Math.abs(ox - sx) + Math.abs(oy - sy) * 1.12;
          if (md < minStud) minStud = md;
        }

        if (minStud < 1.35 && !rim) {
          const hi = minStud < 0.65;
          setPx(ox, oy, hi ? 76 : 36, hi ? 116 : 64, hi ? 202 : 148);
        } else if (rim) {
          setPx(ox, oy, lerp(68, 114, light), lerp(52, 90, light), lerp(24, 42, light));
        } else {
          const crown = 1 - Math.abs(((rOut - 0.78) / 0.22) - 0.5) * 0.5;
          const k = clamp01(light * crown);
          setPx(ox, oy, lerp(122, 198, k), lerp(96, 162, k), lerp(44, 82, k));
        }
      }
    }
  };

  paintHaloArc(false);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (b0Alpha(x, y) < 128) continue;
      const ox = x + padX;
      const i0 = (y * w + x) * 4;
      const r0 = base0Colors[i0], g0 = base0Colors[i0 + 1], b0 = base0Colors[i0 + 2];
      const rf = srcColors[i0], gf = srcColors[i0 + 1], bf = srcColors[i0 + 2];

      const centerDist = Math.abs(x - 17.5);
      const isCloakGreen = isGreen0(x, y);
      const isStaffShaft = (x === 17 || x === 18 || x === 19) && y <= 69
        && r0 > b0 + 12 && !(y >= 61 && y <= 65 && r0 > 110);
      const isHands = y >= 59 && y <= 67 && x >= 12 && x <= 23 && r0 > b0 + 24 && r0 > 82 && !(x >= 17 && x <= 18 && y >= 66);
      const isBaseEye = y >= 81 && y <= 85 && x >= 14 && x <= 21 && (b0 > r0 + 10 || g0 > r0 + 10) && !isCloakGreen;
      const isHoodInterior = y >= 75 && y <= 87 && x >= 10 && x <= 24 && !isCloakGreen && !isBaseEye;
      const isCentralTunic = y >= 2 && y <= 65 && x >= 8 && x <= 26 && !isCloakGreen && !isHands && !isStaffShaft;
      const isOuterCloakShadow = !isCloakGreen && !isBaseEye && !isHands && !isStaffShaft && !isHoodInterior && !isCentralTunic;

      let r = r0, g = g0, b = b0;

      if (isBaseEye) {
        const k = clamp01((Math.max(g0, b0) - 45) / 90);
        r = lerp(58, 224, k);
        g = lerp(74, 228, k);
        b = lerp(96, 236, k);
      } else if (isHands) {
        r = r0 * 0.96;
        g = g0 * 0.92;
        b = b0 * 0.88;
      } else if (isStaffShaft || (y <= 69 && (x === 18 || x === 19) && !isHands)) {
        const leftLit = x === 18;
        const ringBand = (y % 12 === 0) || y === 68 || y === 69 || y <= 2;
        r = ringBand ? (leftLit ? 208 : 156) : (leftLit ? 170 : 114);
        g = ringBand ? (leftLit ? 174 : 126) : (leftLit ? 136 : 88);
        b = ringBand ? (leftLit ? 92 : 58) : (leftLit ? 64 : 38);
      } else if (isCloakGreen || isOuterCloakShadow) {
        const lum = clamp01((g0 - 16) / 148);
        const touchesHoodDark = y >= 75 && y <= 88 && isCloakGreen && (
          isDark0(x - 1, y) || isDark0(x + 1, y) || isDark0(x, y - 1)
        );
        const isInnerStole = isCloakGreen && y >= 3 && y <= 58 && x >= 9 && x <= 25 && centerDist > 2.2;
        const isStoleGoldBorder = isInnerStole && (!isGreen0(x - 1, y) || !isGreen0(x + 1, y) || y <= 5);
        const isBottomHem = (y <= 2) || (b0Alpha(x, y - 1) < 128 && y <= 7);

        if (touchesHoodDark || isStoleGoldBorder || isBottomHem) {
          r = lerp(98, 198, lum);
          g = lerp(76, 162, lum);
          b = lerp(34, 78, lum);
        } else if (isInnerStole) {
          r = lerp(32, 74, lum);
          g = lerp(44, 94, lum);
          b = lerp(84, 152, lum);
        } else {
          r = lerp(46, 194, lum);
          g = lerp(42, 184, lum);
          b = lerp(34, 160, lum);
        }
      } else if (isHoodInterior) {
        if (y >= 76 && y <= 78 && x >= 16 && x <= 18) {
          r = 76; g = 56; b = 40;
        } else {
          r = r0 * 0.65 + 8;
          g = g0 * 0.68 + 10;
          b = b0 * 0.80 + 18;
        }
      } else if (isCentralTunic) {
        const shade = clamp01(1 - Math.abs(x - 17.5) / 10);
        const base = (r0 + g0 + b0) / (3 * 52);
        const k = clamp01(0.40 * shade + 0.60 * base);
        r = lerp(24, 58, k);
        g = lerp(36, 78, k);
        b = lerp(72, 132, k);
      }

      if (y >= 81 && y <= 87 && x >= 12 && x <= 23) {
        const lum0 = 0.299 * r0 + 0.587 * g0 + 0.114 * b0;
        const lumF = 0.299 * rf + 0.587 * gf + 0.114 * bf;
        const delta = lumF - lum0;
        if (delta > 4) {
          const boost = clamp01(delta / 165);
          r = lerp(r, 248, boost * 0.92);
          g = lerp(g, 244, boost * 0.94);
          b = lerp(b, 212, boost * 0.86);
        }
      }

      setPx(ox, y, r, g, b);
    }
  }

  paintHaloArc(true);

  const medCx = padX + 18.0;
  const medCy = 69.2;
  const medR = 3.8;
  for (let oy = 65; oy <= 74; oy++) {
    for (let ox = 20; ox <= 30; ox++) {
      const dx = ox - medCx, dy = oy - medCy;
      const dist = Math.hypot(dx, dy);
      if (dist > medR) continue;
      const ang = Math.atan2(dy, dx);
      const spiralPhase = (dist / medR) * 2.1 - (ang / (Math.PI * 2));
      const spiralDist = Math.abs(spiralPhase - Math.round(spiralPhase));
      if (dist < 0.95 || spiralDist < 0.24) {
        setPx(ox, oy, 214, 182, 98);
      } else if (dist >= medR - 1.05) {
        const hi = dy > 0 || dx < 0;
        setPx(ox, oy, hi ? 186 : 114, hi ? 150 : 88, hi ? 74 : 38);
      } else {
        setPx(ox, oy, 30, 44, 92);
      }
    }
  }

  const looked = dfLook({ width: outW, height: outH, colors: raw }, seed);
  return { albedo: looked, emission: null };
}

/** @param {Uint8Array} srcColors @param {number} w @param {number} h @param {'envoy' | 'ritemaster'} role @param {number} seed @param {Uint8Array} [base0Colors] */
export function buildPsijicVestmentFrame(srcColors, w, h, role, seed, base0Colors = srcColors) {
  if (role === 'ritemaster' && w === 35 && h === 93) {
    return buildCelarusSummonerFrame(srcColors, base0Colors, w, h, seed);
  }
  const raw = new Uint8Array(srcColors.length);

  for (let y = 0; y < h; y++) {
    const v = y / Math.max(1, h - 1);
    for (let x = 0; x < w; x++) {
      const p = y * w + x, o = p * 4;
      const a = base0Colors[o + 3];
      if (a < 128) continue;
      let r = base0Colors[o], g = base0Colors[o + 1], b = base0Colors[o + 2];
      const rf = srcColors[o], gf = srcColors[o + 1], bf = srcColors[o + 2];

      const centerDist = Math.abs((x + 0.5) / w - 0.5) * 2;
      const isHoodEye = v > 0.86 && v < 0.93 && centerDist < 0.28 && (g > r + 10 || b > r + 10) && !(g > r + 7 && g > b + 5);
      const isGreenCloak = !isHoodEye && g > r + 7 && g > b + 5;
      const isDarkTunic = r < 46 && g < 46 && b < 46 && v < 0.72 && centerDist < 0.48;

      if (isHoodEye) {
        const k = clamp01((Math.max(g, b) - 45) / 90);
        r = lerp(58, 220, k);
        g = lerp(74, 226, k);
        b = lerp(96, 236, k);
      } else if (isGreenCloak) {
        const lum = clamp01((g - 24) / 118);
        const stoleBand = v < 0.66 && centerDist > 0.12 && centerDist < 0.27;
        const stoleGoldEdge = v < 0.66 && (Math.abs(centerDist - 0.12) < 0.028 || Math.abs(centerDist - 0.27) < 0.028);
        const hemTrim = v < 0.065 || (v > 0.66 && v < 0.72 && centerDist < 0.30);
        if (hemTrim || stoleGoldEdge) {
          r = lerp(94, 188, lum);
          g = lerp(70, 150, lum);
          b = lerp(30, 70, lum);
        } else if (stoleBand) {
          r = lerp(78, 188, lum);
          g = lerp(72, 174, lum);
          b = lerp(58, 144, lum);
        } else {
          r = lerp(24, 66, lum);
          g = lerp(32, 82, lum);
          b = lerp(62, 134, lum);
        }
      } else if (isDarkTunic && centerDist < 0.14 && v > 0.10 && v < 0.56) {
        const brassThread = (y % 5 === 0) || Math.abs(centerDist - 0.10) < 0.035;
        if (brassThread) {
          r = 148; g = 112; b = 48;
        } else {
          r = 24; g = 32; b = 64;
        }
      }

      if (v > 0.86 && v < 0.95 && centerDist < 0.38) {
        const lum0 = 0.299 * base0Colors[o] + 0.587 * base0Colors[o + 1] + 0.114 * base0Colors[o + 2];
        const lumF = 0.299 * rf + 0.587 * gf + 0.114 * bf;
        const delta = lumF - lum0;
        if (delta > 4) {
          const boost = clamp01(delta / 165);
          r = lerp(r, 244, boost * 0.90);
          g = lerp(g, 240, boost * 0.92);
          b = lerp(b, 214, boost * 0.86);
        }
      }

      raw[o] = clamp8(r);
      raw[o + 1] = clamp8(g);
      raw[o + 2] = clamp8(b);
      raw[o + 3] = 255;
    }
  }

  const looked = dfLook({ width: w, height: h, colors: raw }, seed);
  return { albedo: looked, emission: null };
}

const _uploadedRenderers = new WeakSet();
const _uploadedNpcRenderers = new WeakMap();
const _resolvedNpcArt = new WeakMap();
/** @type {any} */
let _cpuArtCache = null;
const CLASSIC_NPC_PX_PER_M = 80;
/** @type {Map<string, Promise<{ fw: number, h: number, rawFrames: Uint8Array[], ratio: number } | null>>} */
const _customNpcJobs = new Map();

/** @param {string} relPath */
function loadCustomNpcRaw(relPath) {
  const cached = _customNpcJobs.get(relPath);
  if (cached) return cached;
  const job = (async () => {
    try {
      const base = APP_ROOT ?? globalThis.document?.baseURI ?? 'http://localhost/';
      const res = await fetch(new URL(relPath, base).href);
      if (!res.ok) return null;
      const decoded = await decodePng(new Uint8Array(await res.arrayBuffer()));
      if (!decoded?.width || !decoded?.height || !decoded?.data) return null;
      const { width: w, height: h, data } = decoded;
      const frameCount = w >= h * 1.5 && w % 4 === 0 ? 4 : 1;
      const fw = Math.floor(w / frameCount);
      const rawFrames = [];
      for (let f = 0; f < frameCount; f++) {
        const slice = new Uint8Array(fw * h * 4);
        for (let y = 0; y < h; y++) {
          const srcOff = (y * w + f * fw) * 4;
          slice.set(data.subarray(srcOff, srcOff + fw * 4), y * fw * 4);
        }
        rawFrames.push(slice);
      }
      return { fw, h, rawFrames, ratio: fw / h };
    } catch {
      return null;
    }
  })();
  _customNpcJobs.set(relPath, job);
  return job;
}

/** @param {{ fw: number, h: number, rawFrames: Uint8Array[], ratio: number } | null} rawPic @param {number} seedBase */
function buildCustomNpcFrames(rawPic, seedBase) {
  if (!rawPic?.rawFrames?.length) return null;
  const { fw, h, rawFrames, ratio } = rawPic;
  const frames = rawFrames.map((slice, f) => {
    const finalRgba = h > 220
      ? slice
      : (dfLook({ width: fw, height: h, colors: slice }, lookSeed(BAZAAR_NPC_ARCHIVE, seedBase + f)).colors ?? slice);
    return toColor32({ width: fw, height: h, data: finalRgba });
  });
  const dreamH = Math.max(2.05, Math.min(2.30, h / (CLASSIC_NPC_PX_PER_M * 3)));
  const worldSize = h <= 220
    ? { w: fw / CLASSIC_NPC_PX_PER_M, h: h / CLASSIC_NPC_PX_PER_M }
    : { w: dreamH * ratio, h: dreamH };
  return { frames, worldSize };
}

/** @param {any} renderer */
export function getBazaarNpcArtSync(renderer) {
  return renderer ? (_resolvedNpcArt.get(renderer) ?? null) : null;
}

/** @param {any} renderer */
export function ensureBazaarArt(renderer) {
  if (!renderer?.uploadTexture || _uploadedRenderers.has(renderer)) return;
  _uploadedRenderers.add(renderer);

  if (!_cpuArtCache) {
    _cpuArtCache = {
      wall: buildMoonAlabasterWall(),
      pier: buildCeporahPier(),
      slate: buildAstralSlateFloor(),
      sun: buildChancelSun(),
      coffer: buildDomeCoffer(),
      leyGold: buildLeyGold(),
      balustrade: buildBalustrade(),
      cliff: buildArtaeumCliff(),
      cascade: buildStasisCascade(),
      invisible: buildInvisibleDeck(),
      vistaWindow: buildVistaWindow(),
      vistaMarble: buildVistaMarble(),
    };
  }
  const { wall, pier, slate, sun, coffer, leyGold, balustrade, cliff, cascade, invisible, vistaWindow, vistaMarble } = _cpuArtCache;

  renderer.uploadTexture(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.marbleWall, wall.albedo, { opaque: true });
  renderer.uploadEmissionTexture?.(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.marbleWall, wall.emission, { white: true });
  renderer.uploadTexture(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.marblePier, pier.albedo, { opaque: true });
  renderer.uploadEmissionTexture?.(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.marblePier, pier.emission, { white: true });
  renderer.uploadTexture(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.astralSlate, slate.albedo, { opaque: true });
  renderer.uploadEmissionTexture?.(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.astralSlate, slate.emission, { white: true });
  renderer.uploadTexture(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.chancelSun, sun.albedo, { opaque: true });
  renderer.uploadEmissionTexture?.(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.chancelSun, sun.emission, { white: true });
  renderer.uploadTexture(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.domeCoffer, coffer.albedo, { opaque: true });
  renderer.uploadEmissionTexture?.(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.domeCoffer, coffer.emission, { white: true });
  renderer.uploadTexture(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.leyGold, leyGold.albedo, { opaque: true });
  renderer.uploadEmissionTexture?.(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.leyGold, leyGold.emission, { white: true });
  renderer.uploadTexture(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.balustrade, balustrade, { cutout: true });
  renderer.uploadTexture(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.artaeumCliff, cliff.albedo, { opaque: true });
  renderer.uploadEmissionTexture?.(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.artaeumCliff, cliff.emission, { white: true });
  renderer.uploadTexture(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.stasisCascade, cascade.albedo, { opaque: true });
  renderer.uploadEmissionTexture?.(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.stasisCascade, cascade.emission, { white: true });
  renderer.uploadTexture(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.invisibleDeck, invisible, { cutout: true });
  renderer.uploadTexture(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.vistaWindow, vistaWindow.albedo, { opaque: true });
  renderer.uploadEmissionTexture?.(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.vistaWindow, vistaWindow.emission, { white: true });
  renderer.uploadTexture(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.vistaMarble, vistaMarble.albedo, { opaque: true });
  renderer.uploadEmissionTexture?.(BAZAAR_ROOM_ARCHIVE, BAZAAR_TEX.vistaMarble, vistaMarble.emission, { white: true });
}

/**
 * Release uploaded Bazaar room and NPC GPU textures when leaving Gothway Garden.
 * @param {any} renderer
 */
export function releaseBazaarArt(renderer) {
  if (!renderer) return;
  for (const rec of Object.values(BAZAAR_TEX)) {
    renderer.releaseTexture?.(BAZAAR_ROOM_ARCHIVE, rec);
  }
  const npcInfo = _resolvedNpcArt.get(renderer);
  const maxFrames = Math.max(11, npcInfo?.frames ?? 11, npcInfo?.celarusFrames ?? 11);
  for (const rec of [0, 1]) {
    renderer.releaseTexture?.(BAZAAR_NPC_ARCHIVE, rec);
    for (let f = 0; f < maxFrames; f++) renderer.releaseTexture?.(BAZAAR_NPC_ARCHIVE, `${rec}#${f}`);
  }
  _uploadedRenderers.delete(renderer);
  _uploadedNpcRenderers.delete(renderer);
  _resolvedNpcArt.delete(renderer);
}

/** @param {any} renderer @param {(archive: number) => Promise<any>} getTexture */
export function ensureBazaarNpcArt(renderer, getTexture) {
  if (!renderer?.uploadTexture || typeof getTexture !== 'function') return Promise.resolve(null);
  const existing = _uploadedNpcRenderers.get(renderer);
  if (existing) return existing;

  const job = Promise.all([
    Promise.resolve(getTexture(177)).catch(() => null),
    loadCustomNpcRaw('./art/bunnyfall-npcs/valenis.png'),
    loadCustomNpcRaw('./art/bunnyfall-npcs/celarus.png'),
  ]).then(([tex, valenisRaw, celarusRaw]) => {
    const valenisPic = buildCustomNpcFrames(valenisRaw, 64);
    const celarusPic = buildCustomNpcFrames(celarusRaw, 100);
    const hasTex = Boolean(tex && !tex.vendor && tex.recordCount > 4);
    if (!hasTex && !valenisPic?.frames?.length && !celarusPic?.frames?.length) {
      _uploadedNpcRenderers.delete(renderer);
      return null;
    }

    const baseFrames = hasTex ? Math.max(1, tex.getFrameCount?.(4) ?? 1) : 1;
    const baseSz = hasTex ? billboardSize(tex, 4) : { w: 0.875, h: 2.325 };
    const bm0 = hasTex ? tex.getDFBitmap(4, 0) : null;
    const c0 = bm0?.width ? tex.getColor32(bm0, 0) : null;

    let envoySize = { w: baseSz.w, h: baseSz.h };
    let envoyFrames = baseFrames;
    let celarusSize = { w: baseSz.w, h: baseSz.h };
    let celarusFrames = baseFrames;

    if ((!valenisPic?.frames?.length || !celarusPic?.frames?.length) && c0?.colors) {
      for (let f = 0; f < baseFrames; f++) {
        const bm = f === 0 ? bm0 : tex.getDFBitmap(4, f);
        const c32 = f === 0 ? c0 : (bm?.width ? tex.getColor32(bm, 0) : null);
        if (!c32?.colors) continue;
        if (!valenisPic?.frames?.length) {
          const envoyDressed = buildPsijicVestmentFrame(c32.colors, c32.width, c32.height, 'envoy', lookSeed(BAZAAR_NPC_ARCHIVE, f), c0.colors);
          renderer.uploadTexture(BAZAAR_NPC_ARCHIVE, `0#${f}`, envoyDressed.albedo);
          if (f === 0) renderer.uploadTexture(BAZAAR_NPC_ARCHIVE, 0, envoyDressed.albedo);
        }
        if (!celarusPic?.frames?.length) {
          const celDressed = buildPsijicVestmentFrame(c32.colors, c32.width, c32.height, 'ritemaster', lookSeed(BAZAAR_NPC_ARCHIVE, 16 + f), c0.colors);
          renderer.uploadTexture(BAZAAR_NPC_ARCHIVE, `1#${f}`, celDressed.albedo);
          if (f === 0) {
            renderer.uploadTexture(BAZAAR_NPC_ARCHIVE, 1, celDressed.albedo);
            if (c32.width > 0 && celDressed.albedo?.width) {
              celarusSize = { w: baseSz.w * (celDressed.albedo.width / c32.width), h: baseSz.h };
            }
          }
        }
      }
    }

    if (valenisPic?.frames?.length) {
      envoySize = valenisPic.worldSize;
      envoyFrames = valenisPic.frames.length;
      for (let f = 0; f < envoyFrames; f++) renderer.uploadTexture(BAZAAR_NPC_ARCHIVE, `0#${f}`, valenisPic.frames[f]);
      renderer.uploadTexture(BAZAAR_NPC_ARCHIVE, 0, valenisPic.frames[0]);
    }

    if (celarusPic?.frames?.length) {
      celarusSize = celarusPic.worldSize;
      celarusFrames = celarusPic.frames.length;
      for (let f = 0; f < celarusFrames; f++) renderer.uploadTexture(BAZAAR_NPC_ARCHIVE, `1#${f}`, celarusPic.frames[f]);
      renderer.uploadTexture(BAZAAR_NPC_ARCHIVE, 1, celarusPic.frames[0]);
    }

    const info = { w: envoySize.w, h: envoySize.h, frames: envoyFrames, celarusFrames, celarusSize };
    _resolvedNpcArt.set(renderer, info);
    return info;
  }).catch((e) => {
    _uploadedNpcRenderers.delete(renderer);
    console.warn('[bazaar betwixt] psijic npc art failed', e?.message ?? e);
    return null;
  });

  _uploadedNpcRenderers.set(renderer, job);
  return job;
}
