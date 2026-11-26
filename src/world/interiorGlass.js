// @ts-check
// Building interior sets hold the same wall on records 0 and 1, a window wall on record 2, a floor, and a ceiling.
// Glass is window-wall art that differs from its twin in `GLASS_RAMP` indices. Set 11 has no window, and set 111
// has its window on record 1 with record 0 as its twin.

import { BUILDING_INTERIOR_SETS } from './climateSwaps.js';

// Palette index 0xff is the default glass index of `GetWindowColors32`, and the temple's stained glass uses it.
export const GLASS_INDEX = 0xff;
export const GLASS_RAMP = Object.freeze([96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 86, 216, 222, 223]);
const RAMP = new Set(GLASS_RAMP);
export const INTERIOR_WINDOW = Object.freeze({ record: 2, twin: 1 });
const WINDOW_EXCEPTIONS = new Map([[11, null], [111, Object.freeze({ record: 1, twin: 0 })]]);
// Interiors use only these climate bases, with no winter or rain variant. Archives 237 and 240 share set numbers
// but hold paperdoll clothing.
const INTERIOR_BASES = new Set([0, 1, 3, 4]);
export const GLASS_DENSE_RADIUS = 2;
export const GLASS_DENSE_SHARE = 0.8;
export const GLASS_CORE_NEIGHBOURS = 3;
export const GLASS_BRIDGE = 3;
export const GLASS_MIN_TEXELS = 24;

export function isInteriorGlassArchive(archive) {
  return Number.isInteger(archive) && archive >= 0 && archive < 500 && INTERIOR_BASES.has(Math.trunc(archive / 100)) && BUILDING_INTERIOR_SETS.has(archive % 100);
}

export function interiorWindowOf(archive) {
  if (!isInteriorGlassArchive(archive)) return null;
  return WINDOW_EXCEPTIONS.has(archive) ? WINDOW_EXCEPTIONS.get(archive) : INTERIOR_WINDOW;
}

export function glassTexelCount(mask) {
  const c = mask?.colors;
  if (!c) return 0;
  let n = 0;
  for (let i = 0; i < c.length; i += 4) if (c[i] > 127) n++;
  return n;
}

/**
 * @param {{ width: number, height: number, data: Uint8Array }} win
 * @param {{ width: number, height: number, data: Uint8Array } | null} twin
 */
export function windowGlassTexels(win, twin) {
  const W = win.width, H = win.height, d = win.data, n = W * H;
  const paired = !!twin && twin.width === W && twin.height === H;
  const fresh = new Uint8Array(n);
  if (paired) for (let i = 0; i < n; i++) fresh[i] = d[i] !== twin.data[i] ? 1 : 0;
  const R = GLASS_DENSE_RADIUS;
  const dense = (x, y) => {
    let k = 0, f = 0;
    for (let Y = Math.max(0, y - R); Y <= Math.min(H - 1, y + R); Y++) for (let X = Math.max(0, x - R); X <= Math.min(W - 1, x + R); X++) { k++; f += fresh[Y * W + X]; }
    return f >= GLASS_DENSE_SHARE * k;
  };
  const cand = new Uint8Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    cand[i] = d[i] === GLASS_INDEX || (fresh[i] && RAMP.has(d[i]) && dense(x, y)) ? 1 : 0;
  }
  const core = new Uint8Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!cand[y * W + x]) continue;
    let k = 0;
    for (let Y = Math.max(0, y - 1); Y <= Math.min(H - 1, y + 1); Y++) for (let X = Math.max(0, x - 1); X <= Math.min(W - 1, x + 1); X++) if ((X !== x || Y !== y) && cand[Y * W + X]) k++;
    core[y * W + x] = k >= GLASS_CORE_NEIGHBOURS ? 1 : 0;
  }
  const comp = new Int32Array(n).fill(-1), kept = [];
  for (let i0 = 0; i0 < n; i0++) {
    if (!core[i0] || comp[i0] >= 0) continue;
    const id = kept.length, stack = [i0];
    let size = 0;
    comp[i0] = id;
    while (stack.length) {
      const i = /** @type {number} */ (stack.pop()), x = i % W, y = (i - x) / W;
      size++;
      for (let Y = Math.max(0, y - GLASS_BRIDGE); Y <= Math.min(H - 1, y + GLASS_BRIDGE); Y++) for (let X = Math.max(0, x - GLASS_BRIDGE); X <= Math.min(W - 1, x + GLASS_BRIDGE); X++) {
        const j = Y * W + X;
        if (core[j] && comp[j] < 0) { comp[j] = id; stack.push(j); }
      }
    }
    kept.push(size >= GLASS_MIN_TEXELS);
  }
  const out = new Uint8Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!cand[y * W + x]) continue;
    for (let Y = Math.max(0, y - 1); Y <= Math.min(H - 1, y + 1) && !out[y * W + x]; Y++) for (let X = Math.max(0, x - 1); X <= Math.min(W - 1, x + 1); X++) {
      const j = Y * W + X;
      if (core[j] && kept[comp[j]]) { out[y * W + x] = 1; break; }
    }
  }
  return out;
}

// Returns a mask in the `GetWindowColors32` shape (rgba, white where glass, rows bottom-up), or null when the
// record has no glass.
export function interiorGlassMask(archive, record, bitmap, bitmapOf) {
  const win = interiorWindowOf(archive);
  if (!win || record !== win.record || !bitmap?.data) return null;
  const glass = windowGlassTexels(bitmap, bitmapOf(win.twin) ?? null);
  const { width, height } = bitmap;
  const colors = new Uint8ClampedArray(width * height * 4);
  let n = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!glass[y * width + x]) continue;
    n++;
    const o = ((height - 1 - y) * width + x) * 4;
    colors[o] = 255; colors[o + 1] = 255; colors[o + 2] = 255; colors[o + 3] = 255;
  }
  return n ? { colors, width, height } : null;
}

export function glassMaskFromAlpha(color32) {
  const src = color32.colors, out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    if (src[i + 3] < 128) { out[i] = 255; out[i + 1] = 255; out[i + 2] = 255; out[i + 3] = 255; }
  }
  return { colors: out, width: color32.width, height: color32.height };
}
