// @ts-check
import { YARD_KINDS } from './merchantYards.js';

export const YARD_ARCHIVE = 38221;
export const YARD_REC = Object.freeze({
  wood: 0, plank: 1, shingle: 2, hay: 3, dirt: 4, gravel: 5, water: 6, iron: 7, signStable: 8, signTransport: 9,
  signCarpenter: 10, shavings: 11, endgrain: 12, bark: 13,
});
export const YARD_ART_SIZE = 64;
export const SIGN_ART_W = 224;
export const SIGN_ART_H = 96;

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
function noiseField(seed, n, W = YARD_ART_SIZE, H = W, m = n) {
  const r = rng(seed);
  const lat = Float32Array.from({ length: n * m }, () => r());
  const at = (i, j) => lat[((j % m + m) % m) * n + ((i % n + n) % n)];
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = (x / W) * n, fy = (y / H) * m;
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
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  img.colors[i] = rgb[0]; img.colors[i + 1] = rgb[1]; img.colors[i + 2] = rgb[2]; img.colors[i + 3] = 255;
};
/**
 * @param {{width:number, height:number, colors:Uint8Array}} img
 * @param {number} x
 * @param {number} y
 */
const get = (img, x, y) => { const i = (y * img.width + x) * 4; return [img.colors[i], img.colors[i + 1], img.colors[i + 2]]; };
/**
 * @param {ArrayLike<number>} a
 * @param {ArrayLike<number>} b
 * @param {number} t
 * @returns {number[]}
 */
const mix = (a, b, t) => { const k = Math.min(1, Math.max(0, t)); return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k)); };

export function yardWoodArt(seed = 0x7d01) {
  const S = YARD_ART_SIZE, img = image(S);
  const grain = noiseField(seed, 2, S, S, 16), blot = noiseField(seed + 1, 4), r = rng(seed + 2);
  const DARK = [78, 64, 50], LIGHT = [142, 126, 104];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let c = mix(DARK, LIGHT, 0.2 + 0.55 * grain(x, y) + 0.25 * (blot(x, y) - 0.5));
    if (r() < 0.03) c = mix(c, [52, 42, 32], 0.6);
    put(img, x, y, c);
  }
  return img;
}

export function yardPlankArt(seed = 0x91a7) {
  const S = YARD_ART_SIZE, img = image(S);
  const grain = noiseField(seed, 16, S, S, 2), r = rng(seed + 1);
  const shades = Array.from({ length: S / 8 }, () => 0.75 + 0.35 * r());
  const BASE = [118, 88, 58], LIGHT = [160, 124, 84];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const board = Math.floor(x / 8);
    let c = mix(BASE, LIGHT, (0.15 + 0.6 * grain(x, y)) * shades[board]);
    if (x % 8 === 0) c = [58, 40, 26];
    else if (x % 8 === 7) c = mix(c, [70, 50, 32], 0.5);
    put(img, x, y, c);
  }
  for (let k = 0; k < 5; k++) {
    const kx = Math.floor(r() * S), ky = Math.floor(r() * S);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = (kx + dx + S) % S, y = (ky + dy + S) % S;
      if (x % 8 !== 0) put(img, x, y, mix(get(img, x, y), [62, 42, 24], dx === 0 && dy === 0 ? 0.8 : 0.4));
    }
  }
  return img;
}

export function yardShingleArt(seed = 0x5a1e) {
  const S = YARD_ART_SIZE, img = image(S), r = rng(seed);
  const grain = noiseField(seed + 1, 32, S, S, 4);
  const DARK = [70, 58, 50], LIGHT = [138, 118, 98];
  for (let row = 0; row < S / 8; row++) {
    const cuts = [0];
    while (cuts[cuts.length - 1] < S - 11) cuts.push(cuts[cuts.length - 1] + 5 + Math.floor(r() * 7));
    const shift = Math.floor(r() * S), shade = cuts.map(() => 0.55 + 0.45 * r()), ragged = Array.from({ length: S }, () => (r() < 0.35 ? 1 : 0));
    for (let y = row * 8; y < row * 8 + 8; y++) for (let x0 = 0; x0 < S; x0++) {
      const x = (x0 + shift) % S;
      let k = 0;
      while (k + 1 < cuts.length && cuts[k + 1] <= x0) k++;
      let c = mix(DARK, LIGHT, shade[k] * (0.55 + 0.45 * grain(x, y)));
      const foot = row * 8 + 7 - ragged[x0];
      if (y >= foot) c = mix(c, [28, 22, 18], 0.75);
      else if (x0 === cuts[k]) c = mix(c, [36, 28, 22], 0.7);
      put(img, x, y, c);
    }
  }
  return img;
}

export function yardHayArt(seed = 0x4a77) {
  const S = YARD_ART_SIZE, img = image(S);
  const streak = noiseField(seed, 2, S, S, 32), blot = noiseField(seed + 1, 4);
  const DEEP = [150, 116, 48], PALE = [222, 194, 112];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) put(img, x, y, mix(DEEP, PALE, 0.25 + 0.6 * streak(x, y) + 0.2 * (blot(x, y) - 0.5)));
  return img;
}

export function yardDirtArt(seed = 0xd127) {
  const S = YARD_ART_SIZE, img = image(S);
  const n = noiseField(seed, 8), fine = noiseField(seed + 1, 32), r = rng(seed + 2);
  const DARK = [74, 56, 38], LIGHT = [122, 96, 66];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) put(img, x, y, mix(DARK, LIGHT, 0.3 + 0.45 * n(x, y) + 0.25 * (fine(x, y) - 0.5)));
  for (let k = 0; k < 40; k++) {
    let x = r() * S, y = r() * S;
    const a = r() * Math.PI, len = 3 + Math.floor(r() * 4);
    for (let i = 0; i < len; i++) { put(img, (Math.floor(x) + S) % S, (Math.floor(y) + S) % S, [196, 168, 92]); x += Math.cos(a); y += Math.sin(a); }
  }
  return img;
}

export function yardGravelArt(seed = 0x6a3e) {
  const S = YARD_ART_SIZE, img = image(S);
  const n = noiseField(seed, 8), r = rng(seed + 1);
  const DARK = [92, 88, 80], LIGHT = [140, 134, 122];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let c = mix(DARK, LIGHT, 0.3 + 0.5 * n(x, y));
    const g = r();
    if (g < 0.12) c = mix(c, [58, 54, 50], 0.6);
    else if (g > 0.9) c = mix(c, [176, 170, 158], 0.5);
    put(img, x, y, c);
  }
  return img;
}

export function yardWaterArt(seed = 0x3a7e) {
  const S = 32, img = image(S);
  const n = noiseField(seed, 4, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) put(img, x, y, mix([28, 40, 44], [74, 98, 102], 0.3 + 0.5 * n(x, y) * (0.6 + 0.4 * Math.sin(((x + y) / S) * Math.PI * 6))));
  return img;
}

const IRON_DARK = [40, 38, 38];
const IRON_LIGHT = [92, 88, 86];
export function yardIronArt(seed = 0x1207) {
  const S = 32, img = image(S);
  const n = noiseField(seed, 4, S), r = rng(seed + 1);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let c = mix(IRON_DARK, IRON_LIGHT, 0.3 + 0.5 * n(x, y));
    if (r() < 0.06) c = mix(c, [118, 62, 30], 0.5);
    put(img, x, y, c);
  }
  return img;
}

// Only the letters in the yard and port sign words have glyphs, and any other letter is skipped, so a new word
// needs its glyphs added here.
export const SIGN_GLYPHS = Object.freeze({
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '....#', '....#', '....#', '#...#', '#...#', '.###.'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
});
export const SIGN_GLYPH_W = 5;
export const SIGN_GLYPH_H = 7;
export const signGlyph = (ch) => SIGN_GLYPHS[ch] ?? null;
export const SIGN_LETTER_SCALE = 3;
export const SIGN_EMBLEM = 80;

const BOARD_DARK = [52, 34, 22];
const BOARD_LIGHT = [92, 62, 38];
const PAINT = [232, 214, 166];
const PAINT_SHADOW = [26, 16, 10];

function board(seed) {
  const W = SIGN_ART_W, H = SIGN_ART_H, img = image(W, H);
  const grain = noiseField(seed, 4, W, H, 24);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c = mix(BOARD_DARK, BOARD_LIGHT, 0.2 + 0.6 * grain(x, y));
    if (y % 24 === 0) c = [30, 20, 12];
    put(img, x, y, c);
  }
  const B = 4, IN = 7;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (d >= B && d < B + 2) put(img, x, y, PAINT);
    else if (d === IN) put(img, x, y, mix(PAINT, BOARD_DARK, 0.45));
  }
  return img;
}
function paintWord(img, word) {
  const s = SIGN_LETTER_SCALE, W = img.width, H = img.height;
  const width = (word.length * (SIGN_GLYPH_W + 1) - 1) * s;
  const left = SIGN_EMBLEM + Math.round((W - SIGN_EMBLEM - 8 - width) / 2), top = Math.round((H - SIGN_GLYPH_H * s) / 2);
  const cells = [];
  [...word].forEach((ch, k) => {
    const g = signGlyph(ch);
    if (!g) return;
    for (let gy = 0; gy < SIGN_GLYPH_H; gy++) for (let gx = 0; gx < SIGN_GLYPH_W; gx++) {
      if (g[gy][gx] !== '#') continue;
      for (let sy = 0; sy < s; sy++) for (let sx = 0; sx < s; sx++) cells.push([left + (k * (SIGN_GLYPH_W + 1) + gx) * s + sx, top + gy * s + sy]);
    }
  });
  for (const [x, y] of cells) put(img, x + 1, y + 1, PAINT_SHADOW);
  for (const [x, y] of cells) put(img, x, y, PAINT);
}
export const HORSESHOE_GAP = 0.62;
function paintHorseshoe(img) {
  const cx = SIGN_EMBLEM / 2 + 4, cy = SIGN_ART_H / 2 + 2, R0 = 17, R1 = 31;
  const shoe = (x, y) => {
    const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy);
    if (r < R0 || r > R1) return false;
    return Math.abs(Math.atan2(dx, -dy)) > HORSESHOE_GAP;
  };
  for (let y = 0; y < SIGN_ART_H; y++) for (let x = 0; x < SIGN_EMBLEM + 8; x++) {
    if (shoe(x, y)) continue;
    if (shoe(x - 1, y) || shoe(x + 1, y) || shoe(x, y - 1) || shoe(x, y + 1)) put(img, x, y, PAINT);
  }
  for (let y = 0; y < SIGN_ART_H; y++) for (let x = 0; x < SIGN_EMBLEM + 8; x++) {
    if (!shoe(x, y)) continue;
    const dx = x - cx, dy = y - cy, across = (Math.hypot(dx, dy) - R0) / (R1 - R0);
    put(img, x, y, mix([150, 146, 142], IRON_DARK, 0.25 + 0.45 * across + 0.25 * ((dx + dy) / (2 * R1) + 0.5)));
  }
  const MID = (R0 + R1) / 2;
  for (let k = 0; k < 8; k++) {
    const side = k < 4 ? -1 : 1, t = (k % 4) / 3;
    const a = side * (HORSESHOE_GAP + 0.45 + t * 1.55);
    const hx = Math.round(cx + Math.sin(a) * MID), hy = Math.round(cy - Math.cos(a) * MID);
    for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) put(img, hx + ox, hy + oy, [18, 16, 16]);
  }
}
function paintWheel(img) {
  const cx = SIGN_EMBLEM / 2 + 4, cy = SIGN_ART_H / 2, R = 32, TYRE = 3, FELLOE = 6, HUB = 8;
  const WOOD = [168, 120, 70], WOOD_DARK = [112, 76, 42];
  for (let y = 0; y < SIGN_ART_H; y++) for (let x = 0; x < SIGN_EMBLEM + 8; x++) {
    const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy);
    if (r > R) continue;
    if (r > R - TYRE) { put(img, x, y, mix(IRON_LIGHT, IRON_DARK, (r - (R - TYRE)) / TYRE)); continue; }
    if (r > R - TYRE - FELLOE) { put(img, x, y, mix(WOOD, WOOD_DARK, (dx + dy) / (2 * R) + 0.4)); continue; }
    if (r <= HUB) { put(img, x, y, r <= HUB - 3 ? IRON_LIGHT : IRON_DARK); continue; }
    const a = Math.atan2(dy, dx), spoke = (Math.abs(Math.sin(a * 4)) * r) / 4;
    if (spoke < 1.9) put(img, x, y, mix(WOOD, WOOD_DARK, spoke / 2.4));
  }
}

export const SAW_BLADE = Object.freeze({ x0: 28, x1: 78, back: 38, heelFoot: 60, toeFoot: 51, teeth: 3 });
function paintSaw(img) {
  const B = SAW_BLADE, WOOD = [168, 120, 70], WOOD_DARK = [112, 76, 42];
  const foot = (x) => B.heelFoot + ((B.toeFoot - B.heelFoot) * (x - B.x0)) / (B.x1 - B.x0);
  const blade = (x, y) => {
    if (x < B.x0 || x > B.x1 || y < B.back) return false;
    const f = foot(x);
    if (y <= f - B.teeth) return true;
    return y <= f && ((x - B.x0) % (B.teeth + 1)) <= f - y;
  };
  const H = Object.freeze({ x0: 14, x1: 31, y0: 32, y1: 66, hx0: 19, hx1: 25, hy0: 41, hy1: 57 });
  const handle = (x, y) => {
    if (x < H.x0 || x > H.x1 || y < H.y0 || y > H.y1) return false;
    if (x >= H.hx0 && x <= H.hx1 && y >= H.hy0 && y <= H.hy1) return false;
    const cx = x < H.x0 + 4 ? H.x0 + 4 : x > H.x1 - 4 ? H.x1 - 4 : x, cy = y < H.y0 + 4 ? H.y0 + 4 : y > H.y1 - 4 ? H.y1 - 4 : y;
    return (x - cx) ** 2 + (y - cy) ** 2 <= 16;
  };
  const any = (x, y) => blade(x, y) || handle(x, y);
  for (let y = 0; y < SIGN_ART_H; y++) for (let x = 0; x < SIGN_EMBLEM + 4; x++) {
    if (any(x, y)) continue;
    if (any(x - 1, y) || any(x + 1, y) || any(x, y - 1) || any(x, y + 1)) put(img, x, y, PAINT);
  }
  for (let y = 0; y < SIGN_ART_H; y++) for (let x = 0; x < SIGN_EMBLEM + 4; x++) {
    if (blade(x, y)) {
      const across = (y - B.back) / Math.max(1, foot(x) - B.back);
      put(img, x, y, y <= B.back + 1 ? [196, 194, 188] : mix([170, 168, 164], IRON_DARK, 0.15 + 0.55 * across));
    } else if (handle(x, y)) put(img, x, y, mix(WOOD, WOOD_DARK, (x - H.x0) / (H.x1 - H.x0) * 0.6 + (y - H.y0) / (H.y1 - H.y0) * 0.3));
  }
  for (const [rx, ry] of [[B.x0 + 3, B.back + 5], [B.x0 + 3, B.back + 14], [B.x0 + 8, B.back + 9.5]]) {
    for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) put(img, Math.round(rx) + ox, Math.round(ry) + oy, [206, 172, 92]);
  }
}

// Row 0 is the top of the board, matching the face UVs in merchantYardModels.js.
export function yardSignArt(kind) {
  const k = kind === 'transport' || kind === 'carpenter' ? kind : 'stable';
  const img = board(k === 'transport' ? 0x51a9 : k === 'carpenter' ? 0x51ab : 0x51a5);
  if (k === 'transport') paintWheel(img); else if (k === 'carpenter') paintSaw(img); else paintHorseshoe(img);
  paintWord(img, YARD_KINDS[k].sign);
  return img;
}

export function yardShavingsArt(seed = 0x5a3d) {
  const S = YARD_ART_SIZE, img = image(S);
  const n = noiseField(seed, 8), fine = noiseField(seed + 1, 32), r = rng(seed + 2);
  const DEEP = [132, 104, 66], PALE = [214, 186, 132];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) put(img, x, y, mix(DEEP, PALE, 0.35 + 0.4 * n(x, y) + 0.3 * (fine(x, y) - 0.5)));
  for (let k = 0; k < 24; k++) {
    let x = r() * S, y = r() * S, a = r() * Math.PI * 2;
    const len = 4 + Math.floor(r() * 4), turn = (r() - 0.5) * 0.9;
    for (let i = 0; i < len; i++) { put(img, (Math.floor(x) + S) % S, (Math.floor(y) + S) % S, [236, 214, 160]); x += Math.cos(a); y += Math.sin(a); a += turn; }
  }
  for (let k = 0; k < 30; k++) put(img, Math.floor(r() * S), Math.floor(r() * S), [88, 64, 40]);
  return img;
}
export function yardBarkArt(seed = 0xba4c) {
  const S = YARD_ART_SIZE, img = image(S);
  const furrow = noiseField(seed, 2, S, S, 12), blot = noiseField(seed + 1, 6), r = rng(seed + 2);
  const DARK = [46, 34, 24], LIGHT = [106, 82, 58];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let c = mix(DARK, LIGHT, 0.15 + 0.65 * furrow(x, y) ** 1.5 + 0.2 * (blot(x, y) - 0.5));
    if (r() < 0.04) c = mix(c, [30, 22, 16], 0.6);
    put(img, x, y, c);
  }
  return img;
}
// The rings center on the middle of the picture, because the log cap UVs in merchantYardModels.js center there.
export function yardEndGrainArt(seed = 0xe9d4) {
  const S = 32, img = image(S), c = (S - 1) / 2;
  const wob = noiseField(seed, 4, S), r = rng(seed + 1);
  const PALE = [206, 168, 112], RING = [150, 108, 64], EDGE = [92, 64, 40];
  const check = r() * Math.PI;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - c, dy = y - c, d = Math.sqrt(dx * dx + dy * dy) / c;
    let col = mix(PALE, RING, (Math.sin((d * 7 + wob(x, y) * 0.8) * Math.PI * 2) + 1) / 2 * 0.55);
    col = mix(col, EDGE, Math.max(0, d - 0.75) * 3);
    const across = Math.abs(dx * Math.sin(check) - dy * Math.cos(check));
    if (across < 0.6 && d > 0.15 && d < 0.8) col = mix(col, [70, 48, 30], 0.7);
    put(img, x, y, col);
  }
  return img;
}

/** @type {() => Array<[number, { width: number, height: number, colors: Uint8Array }]>} */
export const yardArt = () => [
  [YARD_REC.wood, yardWoodArt()],
  [YARD_REC.plank, yardPlankArt()],
  [YARD_REC.shingle, yardShingleArt()],
  [YARD_REC.hay, yardHayArt()],
  [YARD_REC.dirt, yardDirtArt()],
  [YARD_REC.gravel, yardGravelArt()],
  [YARD_REC.water, yardWaterArt()],
  [YARD_REC.iron, yardIronArt()],
  [YARD_REC.signStable, yardSignArt('stable')],
  [YARD_REC.signTransport, yardSignArt('transport')],
  [YARD_REC.signCarpenter, yardSignArt('carpenter')],
  [YARD_REC.shavings, yardShavingsArt()],
  [YARD_REC.endgrain, yardEndGrainArt()],
  [YARD_REC.bark, yardBarkArt()],
];

export const YARD_ART_KIT = Object.freeze({ rng, noiseField, image, put, get, mix, IRON_DARK, IRON_LIGHT, board, paintWord });
