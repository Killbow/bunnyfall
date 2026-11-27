// @ts-check
// The land traced from the player picture of Tamriel: land and province masks on a 320 x 200 grid.
// It also holds a distance-to-sea field and the fit of the Bay map on the picture.
// Without a trace it falls back to the authored shape. Pure: typed arrays in, results out.
import { provinceAt, coastDistance } from './tamrielGeography.js';
import { BAY_W, BAY_H, PICTURE_W, PICTURE_H } from './tamrielFrame.js';

export const PROVINCE_OF_ID = Object.freeze({
  1: 'HighRock', 2: 'Hammerfell', 3: 'Skyrim', 4: 'Morrowind', 5: 'Sumurset', 6: 'Valenwood', 7: 'Elsweyr', 8: 'BlackMarsh', 9: 'Imperial',
});
export const IMPERIAL_ID = 9;

/** @typedef {{ w: number, h: number, land: Uint8Array, province: Uint8Array, dist?: Float32Array }} TamrielTrace */

/** @type {TamrielTrace|null} */
let _trace = null;
let _version = 0;

export function seaDistanceField(land, w, h) {
  const BIG = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = land[i] ? BIG : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      let b = d[i];
      if (x > 0) b = Math.min(b, d[i - 1] + 3);
      if (y > 0) { b = Math.min(b, d[i - w] + 3); if (x > 0) b = Math.min(b, d[i - w - 1] + 4); if (x < w - 1) b = Math.min(b, d[i - w + 1] + 4); }
      d[i] = b;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      let b = d[i];
      if (x < w - 1) b = Math.min(b, d[i + 1] + 3);
      if (y < h - 1) { b = Math.min(b, d[i + w] + 3); if (x < w - 1) b = Math.min(b, d[i + w + 1] + 4); if (x > 0) b = Math.min(b, d[i + w - 1] + 4); }
      d[i] = b;
    }
  }
  for (let i = 0; i < d.length; i++) d[i] = d[i] >= BIG ? 0 : d[i] / 3;
  return d;
}

export function setTamrielTrace(trace) {
  if (!trace || !trace.land || !trace.province || trace.w * trace.h !== trace.land.length) { _trace = null; _version++; return; }
  _trace = { w: trace.w, h: trace.h, land: trace.land, province: trace.province, dist: trace.dist ?? seaDistanceField(trace.land, trace.w, trace.h) };
  _version++;
}
export const tamrielTrace = () => _trace;
export const tamrielLandVersion = () => _version;

export function provinceKeyAt(px, py) {
  if (_trace) {
    const x = Math.floor(px), y = Math.floor(py);
    if (x < 0 || y < 0 || x >= _trace.w || y >= _trace.h) return null;
    const i = y * _trace.w + x;
    return _trace.land[i] ? (PROVINCE_OF_ID[_trace.province[i]] ?? null) : null;
  }
  return provinceAt(px, py)?.key ?? null;
}
export function coastDistanceAt(px, py) {
  if (!_trace) return coastDistance(px, py);
  const { w, h, dist } = _trace;
  const cx = Math.min(w - 1, Math.max(0, px - 0.5)), cy = Math.min(h - 1, Math.max(0, py - 0.5));
  const x0 = Math.floor(cx), y0 = Math.floor(cy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  const fx = cx - x0, fy = cy - y0;
  const d = /** @type {Float32Array} */ (dist);
  return (d[y0 * w + x0] * (1 - fx) + d[y0 * w + x1] * fx) * (1 - fy) + (d[y1 * w + x0] * (1 - fx) + d[y1 * w + x1] * fx) * fy;
}

export const FIT_PPUS = Object.freeze(Array.from({ length: 25 }, (_, i) => 15 + i / 4));
export const FIT_AREA_WEIGHT = 0.25;

/** @param {number} x */
const popcount = (x) => {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
};

/**
 * @param {{ bayLand: (x: number, y: number) => boolean, trace: TamrielTrace, around?: {ox: number, oy: number},
 *   span?: number, ppus?: readonly number[] }} o
 */
export function fitBayToPicture({ bayLand, trace, around = { ox: 46, oy: 52 }, span = 24, ppus = FIT_PPUS }) {
  let best = null, bestValue = -Infinity;
  const { w, land } = trace;
  const words = (w + 31) >>> 5;
  const ones = new Uint32Array(words * trace.h + 1), zeros = new Uint32Array(words * trace.h + 1);
  for (let y = 0; y < trace.h; y++) {
    for (let x = 0; x < w; x++) {
      const v = land[y * w + x], bit = 1 << (x & 31), at = y * words + (x >>> 5);
      if (v === 1) ones[at] |= bit;
      else if (v === 0) zeros[at] |= bit;
    }
  }
  for (const ppu of ppus) {
    const cols = Math.floor(BAY_W / ppu), rows = Math.floor(BAY_H / ppu);
    const mask = new Uint8Array(cols * rows);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        let n = 0;
        for (const [dx, dy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) if (bayLand(Math.floor((i + dx) * ppu), Math.floor((j + dy) * ppu))) n++;
        mask[j * cols + i] = n >= 2 ? 1 : 0;
      }
    }
    const mw = (cols + 31) >>> 5, tail = cols & 31 ? 2 ** (cols & 31) - 1 : 0xffffffff;
    const bits = new Uint32Array(mw * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (mask[j * cols + i] === 1) bits[j * mw + (i >>> 5)] |= 1 << (i & 31);
    const edge = 2 * (cols + rows);
    for (let oy = around.oy - span; oy <= around.oy + span; oy++) {
      if (oy < 1 || oy + rows + 1 > trace.h) continue;
      for (let ox = around.ox - span; ox <= around.ox + span; ox++) {
        if (ox < 1 || ox + cols + 1 > w) continue;
        let score = 0;
        for (let j = 0; j < rows; j++) {
          const row = (oy + j) * words, mrow = j * mw;
          for (let k = 0; k < mw; k++) {
            const b = ox + (k << 5), at = row + (b >>> 5), s = b & 31;
            const one = s ? (ones[at] >>> s) | (ones[at + 1] << (32 - s)) : ones[at];
            const zero = s ? (zeros[at] >>> s) | (zeros[at + 1] << (32 - s)) : zeros[at];
            const m = bits[mrow + k];
            score += popcount((m & one) | (~m & zero & (k === mw - 1 ? tail : 0xffffffff)));
          }
        }
        let seam = 0;
        for (let i = 0; i < cols; i++) {
          if (mask[i] === land[(oy - 1) * w + ox + i]) seam++;
          if (mask[(rows - 1) * cols + i] === land[(oy + rows) * w + ox + i]) seam++;
        }
        for (let j = 0; j < rows; j++) {
          if (mask[j * cols] === land[(oy + j) * w + ox - 1]) seam++;
          if (mask[j * cols + cols - 1] === land[(oy + j) * w + ox + cols]) seam++;
        }
        const value = seam / edge + (FIT_AREA_WEIGHT * score) / (cols * rows);
        if (value > bestValue) { bestValue = value; best = { ox, oy, ppu, score, cells: cols * rows, seam, edge }; }
      }
    }
  }
  return best;
}
