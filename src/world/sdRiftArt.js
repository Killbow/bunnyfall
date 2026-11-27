// @ts-check
// Paints the Rift and Return atlas (numeral faces, brass, plinth, claws, iris leaves, Return stone).
// Painted as lit, cold, red, and plate variants.
import { SD_RAMP, SD_LIGHT } from './sdLook.js';
import { image, putTexel, texelAt, blendRgb, scale, ramp, step, bevel, rivet, rng, noiseField, paletteOf, quantize } from './sdPixelKit.js';
import { SD_GLYPHS, SD_HOUR_NUMERALS } from './sdSkyArt.js';

export const SD_RIFT_RECORD = Object.freeze({ lit: 33, cold: 34, red: 35 });
export const SD_RIFT_PLATE_RECORD = 36;
export const SD_RIFT_ATLAS = Object.freeze({
  size: 128,
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`n${i}`, Object.freeze([(i % 4) * 32, Math.floor(i / 4) * 32, 32, 32])])),
  brass: Object.freeze([0, 96, 16, 16]),
  brassDark: Object.freeze([16, 96, 16, 16]),
  plinth: Object.freeze([32, 96, 16, 16]),
  claw: Object.freeze([48, 96, 16, 16]),
  leaf: Object.freeze([64, 96, 32, 32]),
  pale: Object.freeze([96, 96, 16, 16]),
  silver: Object.freeze([112, 96, 16, 16]),
  dial: Object.freeze([96, 112, 16, 16]),
  stone: Object.freeze([0, 112, 32, 16]),
  hand: Object.freeze([112, 112, 16, 16]),
});
const HAND_MASK = Object.freeze([
  '................',
  '................',
  '.......#........',
  '.....#.#.#......',
  '.....#.#.#.#....',
  '.....#.#.#.#....',
  '.....#.#.#.#....',
  '.....#######....',
  '..##.#######....',
  '...##########...',
  '....#########...',
  '.....#######....',
  '.....#######....',
  '......#####.....',
  '................',
  '................',
]);
const inHand = (x, y) => HAND_MASK[y]?.[x] === '#';

const { brass: Br, verdigris: Vg, pale: Pa, silver: Si } = SD_RAMP;
const gold = SD_LIGHT.gold.map((v) => Math.round(v * 255));
const red = SD_LIGHT.red.map((v) => Math.round(v * 255));

/**
 * @param {import('./sdPixelKit.js').Img} img
 * @param {ReadonlyArray<number>} cell
 * @param {(s: number, t: number, x: number, y: number) => number[]} fn
 */
function fill(img, cell, fn) {
  const [x0, y0, w, h] = cell;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) putTexel(img, x0 + x, y0 + y, fn((x + 0.5) / w, (y + 0.5) / h, x, y));
}

function paintLit(seed = 0x5d60) {
  const S = SD_RIFT_ATLAS.size, albedo = image(S), emission = image(S), r = rng(seed), A = SD_RIFT_ATLAS;
  const grain = noiseField(seed + 1, 16, S, S, 4);
  for (let i = 0; i < 12; i++) {
    const c = A[`n${i}`];
    fill(albedo, c, (s, t, x, y) => ramp(Br, 0.3 + 0.25 * grain(c[0] + x, c[1] + y), c[0] + x, c[1] + y));
    bevel(albedo, c[0], c[1], c[2], c[3], step(Br, 4), step(Br, 0));
    bevel(albedo, c[0] + 1, c[1] + 1, c[2] - 2, c[3] - 2, step(Br, 3), step(Br, 1));
    for (let y = 2; y < c[3] - 2; y++) { putTexel(emission, c[0], c[1] + y, scale(gold, 0.16)); putTexel(emission, c[0] + c[2] - 1, c[1] + y, scale(gold, 0.16)); }
    const s = SD_HOUR_NUMERALS[i], cells = [];
    let x = 0;
    for (const ch of s) { const g = SD_GLYPHS[ch]; for (let cx = 0; cx < g.w; cx++) for (let cy = 0; cy < 7; cy++) if ((g.rows[cy] >> (g.w - 1 - cx)) & 1) cells.push([x + cx, cy]); x += g.w + 1; }
    const W = x - 1, px = 2, gx = c[0] + Math.floor((c[2] - W * px) / 2), gy = c[1] + 5;
    for (const [cx, cy] of cells) {
      const X = gx + cx * px, Y = gy + (6 - cy) * px;
      for (let dx = 0; dx < px; dx++) for (let dy = 0; dy < px; dy++) {
        putTexel(albedo, X + dx, Y + dy, step(Br, dx === 0 && dy === px - 1 ? 5 : 4));
        putTexel(emission, X + dx, Y + dy, scale(gold, dx === 0 || dy === px - 1 ? 0.42 : 0.24));
      }
      putTexel(albedo, X + px, Y - 1, step(Br, 0));
    }
  }
  fill(albedo, A.brass, (s, t, x, y) => ramp(Br, 0.35 + 0.45 * grain(A.brass[0] + x * 4, A.brass[1] + y), A.brass[0] + x, A.brass[1] + y));
  for (let x = 0; x < 16; x++) { putTexel(albedo, A.brass[0] + x, A.brass[1], step(Br, 5)); putTexel(emission, A.brass[0] + x, A.brass[1], scale(step(Br, 5), 0.04)); }
  fill(albedo, A.brassDark, (s, t, x, y) => (r() < 0.06 ? step(Vg, 1) : ramp(Br, 0.12 + 0.3 * grain(A.brassDark[0] + x, A.brassDark[1] + y * 3), A.brassDark[0] + x, A.brassDark[1] + y)));
  fill(albedo, A.plinth, (s, t, x, y) => ramp(Br, 0.1 + 0.25 * grain(A.plinth[0] + x, A.plinth[1] + y), A.plinth[0] + x, A.plinth[1] + y));
  bevel(albedo, A.plinth[0], A.plinth[1], 16, 16, step(Br, 3), step(Br, 0));
  rivet(albedo, A.plinth[0] + 4, A.plinth[1] + 4, step(Br, 3), step(Br, 0), step(Br, 5));
  rivet(albedo, A.plinth[0] + 11, A.plinth[1] + 11, step(Br, 3), step(Br, 0), step(Br, 5));
  fill(albedo, A.claw, (s, t, x, y) => (x % 5 === 0 ? step(Br, 0) : x % 5 === 1 ? step(Br, 4) : ramp(Br, 0.3 + 0.3 * grain(A.claw[0] + x, A.claw[1] + y * 2), A.claw[0] + x, A.claw[1] + y)));
  fill(albedo, A.leaf, (s, t, x, y) => {
    const tick = y >= 28 && x % 3 === 0;
    return tick ? step(Br, 4) : ramp(Br, 0.15 + 0.28 * grain(A.leaf[0] + x, A.leaf[1] + y), A.leaf[0] + x, A.leaf[1] + y);
  });
  for (let x = 0; x < 32; x++) putTexel(albedo, A.leaf[0] + x, A.leaf[1] + 27, step(Br, 0));
  rivet(albedo, A.leaf[0] + 16, A.leaf[1] + 24, step(Br, 3), step(Br, 0), step(Br, 5));
  fill(albedo, A.pale, (s, t, x, y) => (y % 8 === 0 || (x + (y >> 3) * 8) % 16 === 0 ? step(Pa, 0) : ramp(Pa, 0.35 + 0.4 * grain(A.pale[0] + x, A.pale[1] + y), A.pale[0] + x, A.pale[1] + y)));
  fill(albedo, A.silver, (s, t, x, y) => (y === 0 ? step(Si, 4) : y === 15 ? step(Si, 0) : ramp(Si, 0.3 + 0.35 * grain(A.silver[0] + x * 3, A.silver[1] + y), A.silver[0] + x, A.silver[1] + y)));
  fill(albedo, A.dial, (s, t, x, y) => {
    const u = s * 2 - 1, v = t * 2 - 1, rr = Math.hypot(u, v), a = Math.atan2(u, v), h = ((a / (Math.PI * 2)) * 12 + 12) % 1;
    return rr > 0.85 ? step(Si, 1) : rr > 0.6 && (h < 0.12 || h > 0.88) ? step(Si, 0) : step(Si, 4);
  });
  fill(albedo, A.hand, (s, t, x, y) => (inHand(x, y) ? (!inHand(x - 1, y) || !inHand(x, y - 1) ? step(Si, 2) : step(Si, 1)) : ramp(Si, 0.55 + 0.25 * grain(A.hand[0] + x, A.hand[1] + y), A.hand[0] + x, A.hand[1] + y)));
  bevel(albedo, A.hand[0], A.hand[1], 16, 16, step(Si, 4), step(Si, 0));
  fill(albedo, A.stone, (s, t, x, y) => ramp(SD_RAMP.basalt, 0.3 + 0.4 * grain(A.stone[0] + x, A.stone[1] + y), A.stone[0] + x, A.stone[1] + y));
  quantize(albedo, paletteOf(Br, Vg, Pa, Si, SD_RAMP.basalt));
  return { albedo, emission };
}

export function sdRiftArt() {
  const lit = paintLit(), S = SD_RIFT_ATLAS.size, A = SD_RIFT_ATLAS;
  const cold = { albedo: image(S), emission: image(S) };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const c = texelAt(lit.albedo, x, y), l = (c[0] + c[1] + c[2]) / 3;
    putTexel(cold.albedo, x, y, blendRgb(scale(c, 0.62), [l * 0.55, l * 0.55, l * 0.55], 0.35));
    putTexel(cold.emission, x, y, [0, 0, 0]);
  }
  const redRec = { albedo: image(S), emission: image(S) };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { putTexel(redRec.albedo, x, y, texelAt(cold.albedo, x, y)); putTexel(redRec.emission, x, y, [0, 0, 0]); }
  const r = rng(0x5d61);
  for (const name of [...Array.from({ length: 12 }, (_, i) => `n${i}`), 'leaf']) {
    const c = A[name];
    let y = c[1] + c[3] * (0.3 + 0.4 * r());
    for (let x = c[0]; x < c[0] + c[2]; x++) {
      y += (r() - 0.5) * 2.2;
      const yy = Math.max(c[1] + 1, Math.min(c[1] + c[3] - 2, Math.round(y)));
      putTexel(redRec.albedo, x, yy, scale(red, 0.5)); putTexel(redRec.emission, x, yy, scale(red, 0.45));
      putTexel(redRec.albedo, x, yy + 1, [20, 8, 6]);
    }
  }
  const plate = { albedo: image(S), emission: image(S) }, H = A.hand, moon = SD_LIGHT.moon.map((v) => Math.round(v * 255));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { putTexel(plate.albedo, x, y, texelAt(lit.albedo, x, y)); putTexel(plate.emission, x, y, texelAt(lit.emission, x, y)); }
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const rim = x === 0 || y === 0 || x === 15 || y === 15;
    if (inHand(x, y)) { putTexel(plate.albedo, H[0] + x, H[1] + y, step(Si, 4)); putTexel(plate.emission, H[0] + x, H[1] + y, scale(moon, 0.9)); }
    else if (rim) putTexel(plate.emission, H[0] + x, H[1] + y, scale(moon, 0.3));
  }
  /** @type {Array<[number, { albedo: import('./sdPixelKit.js').Img, emission: import('./sdPixelKit.js').Img }]>} */
  const out = [[SD_RIFT_RECORD.lit, lit], [SD_RIFT_RECORD.cold, cold], [SD_RIFT_RECORD.red, redRec], [SD_RIFT_PLATE_RECORD, plate]];
  return out;
}
