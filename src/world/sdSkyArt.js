// @ts-check
// Samples the six Ending signs into a star strip for the sky and holds the Roman numeral glyphs as rows of bits.
// Pure.
import { SD_SIGNS } from './sdHallArt.js';

export const SD_SKY_SIGN_GRID = 11;
export function sdSkySigns() {
  const N = SD_SKY_SIGN_GRID, W = N * SD_SIGNS.length, data = new Uint8Array(W * N);
  SD_SIGNS.forEach((sign, i) => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = ((x + 0.5) / N) * 2 - 1, v = 1 - ((y + 0.5) / N) * 2;
      const m = sign(u / 0.9, v / 0.9);
      data[y * W + i * N + x] = m >= 1 ? 255 : m > 0 ? 128 : 0;
    }
  });
  return { width: W, height: N, data };
}

export const SD_GLYPHS = Object.freeze({
  I: Object.freeze({ w: 1, rows: Object.freeze([1, 1, 1, 1, 1, 1, 1]) }),
  V: Object.freeze({ w: 5, rows: Object.freeze([17, 17, 17, 10, 10, 4, 4]) }),
  X: Object.freeze({ w: 5, rows: Object.freeze([17, 17, 10, 4, 10, 17, 17]) }),
});
export const SD_HOUR_NUMERALS = Object.freeze(['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI']);
export const numeralWidth = (s) => [...s].reduce((n, ch) => n + SD_GLYPHS[ch].w, 0) + s.length - 1;
export function numeralCell(s, cx, cy) {
  if (cy < 0 || cy > 6) return false;
  let x = 0;
  for (const ch of s) {
    const g = SD_GLYPHS[ch];
    if (cx >= x && cx < x + g.w) return ((g.rows[cy] >> (g.w - 1 - (cx - x))) & 1) === 1;
    x += g.w + 1;
  }
  return false;
}
