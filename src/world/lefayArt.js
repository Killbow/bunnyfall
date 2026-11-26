// @ts-check
import { LEFAY_GRANITE, LEFAY_MARBLE, LEFAY_GILT, LEFAY_PLAQUE, LEFAY_BRONZE, LEFAY_TEXT } from './lefayMonument.js';

export const LEFAY_ART_SIZE = 64;
export const LEFAY_PLAQUE_W = 160;
export const LEFAY_PLAQUE_H = 128;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function noiseField(seed, n, S = LEFAY_ART_SIZE) {
  const r = rng(seed);
  const lat = Float32Array.from({ length: n * n }, () => r());
  const at = (i, j) => lat[((j % n + n) % n) * n + ((i % n + n) % n)];
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = (x / S) * n, fy = (y / S) * n;
    const i = Math.floor(fx), j = Math.floor(fy);
    const tx = smooth(fx - i), ty = smooth(fy - j);
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}
const image = (w, h = w) => ({ width: w, height: h, colors: new Uint8Array(w * h * 4) });
/**
 * @param {{width:number, height:number, colors:Uint8Array}} img
 * @param {number} x
 * @param {number} y
 * @param {ArrayLike<number>} rgb
 */
const put = (img, x, y, rgb) => {
  const i = (y * img.width + x) * 4;
  img.colors[i] = rgb[0]; img.colors[i + 1] = rgb[1]; img.colors[i + 2] = rgb[2]; img.colors[i + 3] = 255;
};
/**
 * @param {ArrayLike<number>} a
 * @param {ArrayLike<number>} b
 * @param {number} t
 * @returns {number[]}
 */
const mix = (a, b, t) => { const k = Math.min(1, Math.max(0, t)); return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k)); };

export function lefayGraniteArt(seed = 0x1e6a) {
  const S = LEFAY_ART_SIZE, img = image(S);
  const coarse = noiseField(seed, 8), r = rng(seed + 3);
  const DARK = [86, 88, 92], LIGHT = [148, 150, 152];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let c = mix(DARK, LIGHT, 0.25 + 0.6 * coarse(x, y));
    const g = r();
    if (g < 0.08) c = mix(c, [40, 40, 44], 0.7);
    else if (g > 0.95) c = mix(c, [210, 206, 200], 0.6);
    put(img, x, y, c);
  }
  return img;
}

export function lefayMarbleArt(seed = 0x3a7b) {
  const S = LEFAY_ART_SIZE, img = image(S);
  const cloud = noiseField(seed, 4), vein = noiseField(seed + 1, 8);
  const BASE = [214, 210, 200], SHADE = [186, 182, 174], VEIN = [128, 126, 124];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const c = mix(BASE, SHADE, cloud(x, y) * 0.8);
    const v = Math.abs(vein(x, y) - 0.5);
    put(img, x, y, v < 0.02 ? mix(c, VEIN, 0.45 - v * 10) : c);
  }
  return img;
}

export function lefayGiltArt(seed = 0x9117) {
  const S = 32, img = image(S);
  const n = noiseField(seed, 4, S);
  const DEEP = [150, 104, 30], BRIGHT = [244, 204, 96];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) put(img, x, y, mix(DEEP, BRIGHT, 0.5 + 0.35 * Math.sin((y / S) * Math.PI * 4) * 0.6 + 0.4 * (n(x, y) - 0.5)));
  return img;
}

const BRONZE_DARK = [70, 50, 26];
const BRONZE_LIGHT = [128, 94, 48];
export function lefayBronzeArt(seed = 0xb802) {
  const S = 32, img = image(S);
  const n = noiseField(seed, 4, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) put(img, x, y, mix(BRONZE_DARK, BRONZE_LIGHT, 0.35 + 0.5 * n(x, y)));
  return img;
}

// Only the characters in the inscription have glyphs, and any other character is skipped, so new plaque text needs
// its glyphs added here.
export const LEFAY_GLYPHS = Object.freeze({
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
});
export const GLYPH_W = 5;
export const GLYPH_H = 7;
export const lefayGlyph = (ch) => LEFAY_GLYPHS[ch] ?? null;
export const lineWidth = (text, scale) => (text.length * (GLYPH_W + 1) - 1) * scale;

export const PLAQUE_SCALES = Object.freeze([2, 2, 1, 1]);

// Row 0 is the top of the plaque, matching the face UVs that `plaque` in lefayMonument.js assigns.
export function lefayPlaqueArt(lines = LEFAY_TEXT.plaque, seed = 0x91a0) {
  const W = LEFAY_PLAQUE_W, H = LEFAY_PLAQUE_H, img = image(W, H);
  const n = noiseField(seed, 8, W);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(img, x, y, mix(BRONZE_DARK, BRONZE_LIGHT, 0.45 + 0.35 * n(x, y)));
  const BEVEL = 4, LIT = [176, 138, 76], SHADOW = [44, 30, 14];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (d >= BEVEL) continue;
    const lit = x < BEVEL && x <= y && x <= H - 1 - y ? true : y < BEVEL && y <= x && y <= W - 1 - x;
    put(img, x, y, lit ? LIT : SHADOW);
  }
  const heights = lines.map((_, i) => GLYPH_H * (PLAQUE_SCALES[i] ?? 1));
  const gaps = heights.slice(1).map((h, i) => Math.round(Math.max(h, heights[i]) / 2) + 2);
  const total = heights.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0);
  let top = Math.round((H - total) / 2);
  const cut = new Uint8Array(W * H);
  lines.forEach((text, i) => {
    const s = PLAQUE_SCALES[i] ?? 1, left = Math.round((W - lineWidth(text, s)) / 2);
    [...text].forEach((ch, k) => {
      const g = lefayGlyph(ch);
      if (!g) return;
      for (let gy = 0; gy < GLYPH_H; gy++) for (let gx = 0; gx < GLYPH_W; gx++) {
        if (g[gy][gx] !== '#') continue;
        for (let sy = 0; sy < s; sy++) for (let sx = 0; sx < s; sx++) {
          const x = left + (k * (GLYPH_W + 1) + gx) * s + sx, y = top + gy * s + sy;
          if (x >= 0 && y >= 0 && x < W && y < H) cut[y * W + x] = 1;
        }
      }
    });
    top += heights[i] + (gaps[i] ?? 0);
  });
  const FLOOR = [34, 22, 10], LIP = [196, 160, 92];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (cut[y * W + x]) put(img, x, y, FLOOR);
    else if ((x > 0 && cut[y * W + x - 1]) || (y > 0 && cut[(y - 1) * W + x])) put(img, x, y, LIP);
  }
  return img;
}

/** @type {() => Array<[number, { width: number, height: number, colors: Uint8Array }]>} */
export const lefayArt = () => [
  [LEFAY_GRANITE, lefayGraniteArt()],
  [LEFAY_MARBLE, lefayMarbleArt()],
  [LEFAY_GILT, lefayGiltArt()],
  [LEFAY_PLAQUE, lefayPlaqueArt()],
  [LEFAY_BRONZE, lefayBronzeArt()],
];
