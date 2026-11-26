// @ts-check

// Matches the 3 to 15 step light contrast between neighboring texels in classic TEXTURE.050, .054, and .067; half
// the jitter is per texel and half per 2 x 2 block.
export const DF_GRAIN = 10;

/** @type {{ getRed(i: number): number, getGreen(i: number): number, getBlue(i: number): number } | null} */
let _palette = null;
/** @type {Int16Array | null} */
let _lut = null;
/** @type {Uint8Array | null} */
let _rgb = null;
/** @type {Float32Array | null} */
let _lab = null;

export function setDfLookPalette(/** @type {any} */ palette) {
  if (palette === _palette) return;
  _palette = palette ?? null;
  _lut = null; _rgb = null; _lab = null;
  if (!_palette) return;
  _rgb = new Uint8Array(256 * 3); _lab = new Float32Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    _rgb[i * 3] = _palette.getRed(i); _rgb[i * 3 + 1] = _palette.getGreen(i); _rgb[i * 3 + 2] = _palette.getBlue(i);
    _lab.set(oklab(_rgb[i * 3], _rgb[i * 3 + 1], _rgb[i * 3 + 2]), i * 3);
  }
  _lut = new Int16Array(1 << 18).fill(-1);
}
export const dfLookOn = () => _palette != null;

export function oklab(r, g, b) {
  const lin = (/** @type {number} */ c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
// At 3, some cream canvas texels still snap to the pale mint palette entry; at 4, each hue stays on its own ramp.
export const HUE_WEIGHT = 4;
// Index 0 is the transparent texel of a classic record, so the search covers indices 1 to 255 only.
export function nearestIndex(/** @type {Float32Array} */ lab, r, g, b) {
  const [L, A, B] = oklab(r, g, b);
  let best = 1, bestD = Infinity;
  for (let i = 1; i < 256; i++) {
    const dl = L - lab[i * 3], da = A - lab[i * 3 + 1], db = B - lab[i * 3 + 2];
    const d = dl * dl + HUE_WEIGHT * HUE_WEIGHT * (da * da + db * db);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

export function texelGrain(seed, x, y) {
  let h = Math.imul(seed ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul(x + 1, 0xC2B2AE35) ^ Math.imul(y + 1, 0x27D4EB2F);
  h = Math.imul(h ^ (h >>> 15), 0x2C1B3C6D);
  h = Math.imul(h ^ (h >>> 12), 0x297A2D39);
  h ^= h >>> 15;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

export const lookSeed = (archive, record) => (Math.imul(archive | 0, 1000003) + (record | 0)) | 0;

/**
 * @template P
 * @param {P} pic
 * @param {number} seed
 * @returns {P}
 */
export function dfLook(pic, seed) {
  /** @type {{ width: number, height: number, data?: Uint8Array, colors?: Uint8Array }} */
  const p = /** @type {any} */ (pic);
  if (!_rgb || !_lut || !_lab || !p) return pic;
  const src = p.data ?? p.colors;
  if (!src) return pic;
  const out = new Uint8Array(src.length), rgb = _rgb, lab = _lab, lut = _lut, w = p.width;
  for (let i = 0, t = 0; i < src.length; i += 4, t++) {
    out[i + 3] = src[i + 3];
    if (src[i + 3] === 0) { out[i] = src[i]; out[i + 1] = src[i + 1]; out[i + 2] = src[i + 2]; continue; }
    const x = t % w, y = (t / w) | 0;
    const j = DF_GRAIN * 0.5 * (texelGrain(seed, x, y) + texelGrain(~seed, x >> 1, y >> 1));
    const r = Math.max(0, Math.min(255, src[i] + j)), g = Math.max(0, Math.min(255, src[i + 1] + j)), b = Math.max(0, Math.min(255, src[i + 2] + j));
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    let idx = lut[key];
    if (idx < 0) { idx = nearestIndex(lab, (r >> 2) * 4 + 2, (g >> 2) * 4 + 2, (b >> 2) * 4 + 2); lut[key] = idx; }
    out[i] = rgb[idx * 3]; out[i + 1] = rgb[idx * 3 + 1]; out[i + 2] = rgb[idx * 3 + 2];
  }
  return /** @type {P} */ (/** @type {any} */ (p.data ? { ...p, data: out } : { ...p, colors: out }));
}
