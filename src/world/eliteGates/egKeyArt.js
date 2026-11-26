// @ts-check
import { image, putTexel, ramp, paletteOf, quantize } from '../sdPixelKit.js';
import { EG_BAND_RAMPS } from './egBandArt.js';
import { EG_ARCH_BLOCK } from './pseudoArchives.js';

export const WEIR_KEY_ART = Object.freeze({ archive: EG_ARCH_BLOCK.key, record: 0 });
export const EG_KEY_ART_SIZE = Object.freeze({ w: 32, h: 22 });
export const EG_KEY_OUTLINE = Object.freeze([40, 26, 10]);
const GOLD = EG_BAND_RAMPS[0].metal, BLUE = EG_BAND_RAMPS[0].accent;
const STONE_GLINT = Object.freeze([168, 196, 240]);

const BOW = Object.freeze({ x: 7.5, y: 10.5, r0: 7, r1: 3.6 });
const SHAFT = Object.freeze({ x0: 14, x1: 30, y0: 9, y1: 12 });
const COLLAR = Object.freeze({ x0: 14, x1: 16, y0: 7, y1: 14 });
const BIT = Object.freeze([Object.freeze({ x0: 22, x1: 25, y0: 12, y1: 16 }), Object.freeze({ x0: 26, x1: 30, y0: 12, y1: 19 })]);

export function egKeyTexel(x, y) {
  const cx = x + 0.5, cy = y + 0.5, d = Math.hypot(cx - BOW.x, cy - BOW.y);
  if (d <= BOW.r1) return 'stone';
  if (d <= BOW.r0) return 'gold';
  const inBox = (b) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1;
  if (inBox(SHAFT) || inBox(COLLAR) || BIT.some(inBox)) return 'gold';
  return null;
}

export function egKeyArt() {
  const { w, h } = EG_KEY_ART_SIZE;
  const img = image(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = egKeyTexel(x, y);
      if (k === 'stone') {
        const d = Math.hypot(x + 0.5 - (BOW.x - 0.8), y + 0.5 - (BOW.y - 0.8)) / BOW.r1;
        putTexel(img, x, y, d < 0.35 ? [...STONE_GLINT] : ramp(BLUE, 1 - d, x, y));
      } else if (k === 'gold') {
        const up = egKeyTexel(x, y - 1) == null, down = egKeyTexel(x, y + 1) == null, left = egKeyTexel(x - 1, y) == null;
        const t = up || left ? 0.95 : down ? 0.15 : 0.62 - (x / w) * 0.25;
        putTexel(img, x, y, ramp(GOLD, t, x, y));
      }
    }
  }
  const near = (x, y) => egKeyTexel(x - 1, y) || egKeyTexel(x + 1, y) || egKeyTexel(x, y - 1) || egKeyTexel(x, y + 1);
  const outline = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!egKeyTexel(x, y) && near(x, y)) outline.push([x, y]);
  for (const [x, y] of outline) putTexel(img, x, y, [...EG_KEY_OUTLINE]);
  quantize(img, paletteOf(GOLD, BLUE, [STONE_GLINT], [EG_KEY_OUTLINE]));
  // `quantize` recolors every texel, transparent ones included, so the background is reset after it.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!egKeyTexel(x, y) && !outline.some((p) => p[0] === x && p[1] === y)) { const i = (y * w + x) * 4; img.colors[i] = 0; img.colors[i + 1] = 0; img.colors[i + 2] = 0; }
  return img;
}

/** @param {(entries: any[]) => number} addVendorTextures */
let _registered = false;
export function registerWeirKeyArt(addVendorTextures) {
  if (_registered || typeof addVendorTextures !== 'function') return 0;
  _registered = true;
  return addVendorTextures([{
    archive: WEIR_KEY_ART.archive, record: WEIR_KEY_ART.record, frame: 0, standIn: true, fileName: `weir-key-${WEIR_KEY_ART.archive}_${WEIR_KEY_ART.record}`,
    build: async () => { const img = egKeyArt(); return { width: img.width, height: img.height, data: img.colors }; },
  }]);
}
export function _resetWeirKeyArt() { _registered = false; }
