// @ts-check
// Meadow grass style. render/labGrass.js GRASSMEADOW_VS_EDITS builds the shader half from these numbers.
import { MEADOW_SPRITES, MEADOW_ALPHABET } from './meadowArt.js';
import { smoothstep } from '../world/mathf.js';

// A power of two, so every mip level halves the cells exactly.
export const MEADOW_SLOTS = 8;
export const MEADOW_CELL = 64;
export const MEADOW_CARDS = 3;
export const MEADOW_CARDS_FAR = 2;
export const MEADOW_NEAR_AT = 0.25;
export const MEADOW_NEAR_BAND = 0.05;
export const MEADOW_BLADES_PER_TUFT = 3;

export const MEADOW_VARIANTS = Object.freeze([
  Object.freeze({ name: 'tall', scale: 4 / 3, stiff: 1, sway: 1 }),
  Object.freeze({ name: 'short', scale: 4 / 3, stiff: 1, sway: 1 }),
  Object.freeze({ name: 'flowers', scale: 4 / 3, stiff: 1, sway: 1 }),
  Object.freeze({ name: 'dry', scale: 4 / 3, stiff: 1, sway: 1 }),
  Object.freeze({ name: 'bush', scale: 2.25, stiff: 0.3, sway: 0.6 }),
]);
export const MEADOW_BUSH = 4;
export const MEADOW_FLOWERS = 2;
export const MEADOW_DRY = 3;
export const MEADOW_SHORT = 1;
export const MEADOW_TALL = 0;
export const MEADOW_LUSH = Object.freeze([0.3, 0.7]);
export const MEADOW_SHARES = Object.freeze({
  bush: Object.freeze([0.008, 0.02]),
  flowers: Object.freeze([0.01, 0.14]),
  dry: Object.freeze([0.24, 0.02]),
  short: Object.freeze([0.62, 0.3]),
});
export const MEADOW_PATCH_SCALE = Object.freeze([0.8, 1.25]);
export const MEADOW_FACE = Object.freeze({ base: 0.72, span: 0.28, floor: 0.5 });
export function meadowSpriteMean(sprite) {
  const rgb = sprite.palette.map((hex) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  const sum = [0, 0, 0];
  let n = 0;
  for (const row of sprite.rows) {
    for (const ch of row) {
      if (ch === '.') continue;
      const c = rgb[MEADOW_ALPHABET.indexOf(ch)];
      sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2]; n++;
    }
  }
  return sum.map((v) => v / n / 255);
}
export const MEADOW_GREEN = Object.freeze(meadowSpriteMean(MEADOW_SPRITES[0]));
export const meadowArtGround = (tone, green = MEADOW_GREEN) => green.map((v, i) => v / tone[i]);
export const MEADOW_SHIFT = Object.freeze([0.5, 1.6]);
export const MEADOW_GREEN_EDGE = 12;
// JS twin of the fragment's color before the light; keep the two in step.
export function meadowTexel(art, ground, artGround, hue = 1) {
  const s = ground.map((g, i) => Math.min(MEADOW_SHIFT[1], Math.max(MEADOW_SHIFT[0], g / artGround[i])));
  const lum = s[0] * 0.299 + s[1] * 0.587 + s[2] * 0.114;
  const k = Math.min(1, Math.max(0, (art[1] - Math.max(art[0], art[2])) * MEADOW_GREEN_EDGE)) * hue;
  return art.map((a, i) => a * (lum + (s[i] - lum) * k));
}

export const meadowGrass = (style) => style !== 'smooth' && style !== 'pixel';

/**
 * @param {number} r
 * @param {number} tint
 * @returns {{ variant: number, scale: number, lush: number }}
 */
export function meadowPick(r, tint) {
  const lush = smoothstep(MEADOW_LUSH[0], MEADOW_LUSH[1], tint);
  // GLSL's own mix, term for term, so the two agree at every byte.
  const at = (pair) => pair[0] * (1 - lush) + pair[1] * lush;
  const b = at(MEADOW_SHARES.bush), f = at(MEADOW_SHARES.flowers), d = at(MEADOW_SHARES.dry);
  let variant;
  if (r < b) variant = MEADOW_BUSH;
  else if (r < b + f) variant = MEADOW_FLOWERS;
  else if (r < b + f + d) variant = MEADOW_DRY;
  else variant = (r - b - f - d) / (1 - b - f - d) < at(MEADOW_SHARES.short) ? MEADOW_SHORT : MEADOW_TALL;
  return { variant, scale: MEADOW_VARIANTS[variant].scale * at(MEADOW_PATCH_SCALE), lush };
}

/** @param {{ width: number, height: number, rows?: readonly string[], rgba?: Uint8Array }} sprite */
export function meadowSpriteBox(sprite) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const rows = sprite.rows ?? Array.from({ length: sprite.height }, (_, y) => Array.from({ length: sprite.width }, (__, x) => (sprite.rgba[(y * sprite.width + x) * 4 + 3] ? '#' : '.')).join(''));
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '.') continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  });
  if (x1 < x0) return { u0: 0.5, u1: 0.5, v0: 0, v1: 0 };
  return { u0: x0 / sprite.width, u1: (x1 + 1) / sprite.width, v0: (sprite.height - 1 - y1) / sprite.height, v1: (sprite.height - y0) / sprite.height };
}
export const MEADOW_BOXES = Object.freeze(MEADOW_SPRITES.map((s) => Object.freeze(meadowSpriteBox(s))));

// Seeds hash the cell-local position lane, which a floating-origin shift never touches; 64 keeps float32 fract
// exact (64 x 456.21 is under 2^15).
export const MEADOW_SEED = 64;

export const MEADOW_SLOPE_FLOOR = 0.3;

export const LAB_LEAN_PER_PUSH = 0.032;
export const LAB_GUST_MAX = 0.6 + 0.45;
const LEAN_MAX = Math.hypot(0.25, 0.25);

export function cardMeasures(variants, boxes) {
  const top = Math.max(...variants.map((v, i) => v.scale * MEADOW_PATCH_SCALE[1] * boxes[i].v1));
  const reach = Math.max(...variants.map((v, i) => {
    const b = boxes[i];
    return v.scale * MEADOW_PATCH_SCALE[1] * (Math.max(0.5 - b.u0, b.u1 - 0.5) + LEAN_MAX * v.stiff * b.v1 * b.v1);
  }));
  const windReach = Math.max(...variants.map((v, i) => v.scale * MEADOW_PATCH_SCALE[1] * LAB_LEAN_PER_PUSH * LAB_GUST_MAX * v.sway * boxes[i].v1 ** 2));
  return { top, reach, windReach };
}
const _meadowMeasures = cardMeasures(MEADOW_VARIANTS, MEADOW_BOXES);
export const MEADOW_TOP = _meadowMeasures.top;
export const MEADOW_REACH = _meadowMeasures.reach;
export const MEADOW_WIND_REACH = _meadowMeasures.windReach;

// Drawn indexed: both triangles end on slot 2, the shared corner, so it is the provoking vertex of both and the
// only one with `gl_VertexID % 3 == 2`. Slots 4 and 5 are never indexed.
export const MEADOW_CARD_SLOTS = 6;
export function meadowCardCorners(cards = MEADOW_CARDS, of = cards) {
  const out = new Float32Array(cards * MEADOW_CARD_SLOTS * 3);
  for (let k = 0; k < cards; k++) {
    const t = k / of + (k % 2);
    [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0], [0, 0]].forEach(([x, y], s) => out.set([x, y, t], (k * MEADOW_CARD_SLOTS + s) * 3));
  }
  return out;
}
export function meadowCardIndices(cards = MEADOW_CARDS) {
  const out = new Uint16Array(cards * 6);
  for (let k = 0; k < cards; k++) out.set([0, 1, 2, 3, 0, 2].map((s) => k * MEADOW_CARD_SLOTS + s), k * 6);
  return out;
}

/** @param {{ sprites?: readonly ({ name: string, width: number, height: number, palette?: readonly string[], rows?: readonly string[], rgba?: Uint8Array })[], cell?: number, slots?: number }} [o] */
export function buildMeadowAtlas({ sprites = MEADOW_SPRITES, cell = MEADOW_CELL, slots = MEADOW_SLOTS } = {}) {
  if (sprites.length > slots) throw new Error(`${sprites.length} sprites in an atlas of ${slots}`);
  const width = slots * cell, height = cell;
  const data = new Uint8Array(width * height * 4);
  sprites.forEach((s, v) => {
    if (s.width !== s.height || cell % s.width) throw new Error(`${s.name}: a ${s.width}x${s.height} sprite does not tile a ${cell} cell`);
    const k = cell / s.width;
    if (s.rgba) {
      for (let y = 0; y < cell; y++) {
        for (let x = 0; x < cell; x++) {
          const i = ((s.height - 1 - Math.floor(y / k)) * s.width + Math.floor(x / k)) * 4;
          if (!s.rgba[i + 3]) continue;
          const o = (y * width + v * cell + x) * 4;
          data[o] = s.rgba[i]; data[o + 1] = s.rgba[i + 1]; data[o + 2] = s.rgba[i + 2]; data[o + 3] = 255;
        }
      }
      return;
    }
    const rgb = s.palette.map((hex) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)));
    for (let y = 0; y < cell; y++) {
      const row = s.rows[s.height - 1 - Math.floor(y / k)];
      for (let x = 0; x < cell; x++) {
        const ch = row[Math.floor(x / k)];
        if (ch === '.') continue;
        const c = rgb[MEADOW_ALPHABET.indexOf(ch)];
        const o = (y * width + v * cell + x) * 4;
        data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
      }
    }
  });
  return { width, height, data, variants: sprites.length, slots, cell };
}

/**
 * @param {{ width: number, height: number, data: Uint8Array | Uint8ClampedArray }} picture
 * @param {string} name
 */
export function fitSprite(picture, name, cell = MEADOW_CELL) {
  const { width: w, height: h, data } = picture;
  const fit = Math.min(cell / w, cell / h), k = fit >= 1 ? Math.floor(fit) : fit;
  const fw = Math.max(1, Math.round(w * k)), fh = Math.max(1, Math.round(h * k)), x0 = Math.floor((cell - fw) / 2), y0 = cell - fh;
  const rgba = new Uint8Array(cell * cell * 4);
  for (let y = 0; y < fh; y++) {
    const sy = Math.min(h - 1, Math.floor((y + 0.5) / k));
    for (let x = 0; x < fw; x++) {
      const sx = Math.min(w - 1, Math.floor((x + 0.5) / k)), i = (sy * w + sx) * 4;
      if (data[i + 3] < 128) continue;
      const o = ((y0 + y) * cell + x0 + x) * 4;
      rgba[o] = data[i]; rgba[o + 1] = data[i + 1]; rgba[o + 2] = data[i + 2]; rgba[o + 3] = 255;
    }
  }
  return { name, width: cell, height: cell, rgba };
}

export function slotCoverage(level, slots = MEADOW_SLOTS) {
  const { width, height, data } = level;
  const cw = width / slots;
  const out = new Array(slots).fill(0);
  if (cw < 1) return out;
  for (let v = 0; v < slots; v++) {
    let n = 0;
    for (let y = 0; y < height; y++) for (let x = v * cw; x < (v + 1) * cw; x++) if (data[(y * width + x) * 4 + 3]) n++;
    out[v] = n / (cw * height);
  }
  return out;
}

export function downsampleMeadow(level, { targets, slots = MEADOW_SLOTS }) {
  const { width, height, data } = level;
  const w2 = Math.max(1, width >> 1), h2 = Math.max(1, height >> 1);
  const out = new Uint8Array(w2 * h2 * 4);
  const blocks = [];
  for (let y = 0; y < h2; y++) {
    for (let x = 0; x < w2; x++) {
      let n = 0, r = 0, g = 0, b = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const sx = Math.min(width - 1, x * 2 + dx), sy = Math.min(height - 1, y * 2 + dy);
          const i = (sy * width + sx) * 4;
          if (!data[i + 3]) continue;
          n++; r += data[i]; g += data[i + 1]; b += data[i + 2];
        }
      }
      const o = (y * w2 + x) * 4;
      if (n) { out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n); }
      blocks.push({ x, y, n, o });
    }
  }
  const cw = w2 / slots;
  if (cw < 1) {
    for (const bl of blocks) if (bl.n) out[bl.o + 3] = 255;
    return { width: w2, height: h2, data: out };
  }
  for (let v = 0; v < slots; v++) {
    const mine = blocks.filter((bl) => bl.n > 0 && bl.x >= v * cw && bl.x < (v + 1) * cw);
    if (!mine.length) continue;
    mine.sort((a, c) => c.n - a.n || c.y - a.y || a.x - c.x);
    const keep = Math.min(mine.length, Math.max(1, Math.round(targets[v] * cw * h2)));
    for (let k = 0; k < keep; k++) out[mine[k].o + 3] = 255;
  }
  return { width: w2, height: h2, data: out };
}

// Down to 1x1: a chain that stops short is an incomplete texture, which samples black.
export function buildMeadowMips(atlas = buildMeadowAtlas()) {
  /** @type {{ width: number, height: number, data: Uint8Array }[]} */
  const levels = [atlas];
  const slots = atlas.slots ?? MEADOW_SLOTS;
  const targets = slotCoverage(atlas, slots);
  while (levels[levels.length - 1].width > 1 || levels[levels.length - 1].height > 1) {
    levels.push(downsampleMeadow(levels[levels.length - 1], { targets, slots }));
  }
  return levels;
}
