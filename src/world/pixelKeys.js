export const PIXEL_KEY_SPAN = 4096;
export const PIXEL_KEYS_KEPT = 8192;

const _kept = new Map();

/**
 * @param {number} px
 * @param {number} py
 * @returns {string}
 */
export function pixelKeyText(px, py) {
  if (!(Number.isInteger(px) && Number.isInteger(py) && Math.abs(px) < PIXEL_KEY_SPAN && Math.abs(py) < PIXEL_KEY_SPAN)) return `${px},${py}`;
  const n = (px + PIXEL_KEY_SPAN) * (2 * PIXEL_KEY_SPAN) + (py + PIXEL_KEY_SPAN);
  let k = _kept.get(n);
  if (k === undefined) {
    if (_kept.size >= PIXEL_KEYS_KEPT) _kept.clear();
    k = `${px},${py}`;
    _kept.set(n, k);
  }
  return k;
}
