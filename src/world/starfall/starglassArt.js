// @ts-check
// Starglass's picture: a glass sliver painted in code under its own pseudo-archive, the same pixels every boot.
// It registers as a stand-in archive through addVendorTextures; nothing is read from the player's data.
import { image, putTexel, ramp, paletteOf, quantize } from '../sdPixelKit.js';
import { STAR_RAMPS } from './starArt.js';

export const STARGLASS_ARCHIVE = 38302;
export const STARGLASS_ART = Object.freeze({ archive: STARGLASS_ARCHIVE, record: 0 });
export const STARGLASS_ART_SIZE = Object.freeze({ w: 20, h: 22 });
export const STARGLASS_OUTLINE = Object.freeze([34, 22, 70]);
const SHARD = Object.freeze([[8, 1], [13, 3], [16, 9], [13, 17], [9, 21], [5, 15], [3, 7]]);
const VEIN = Object.freeze([[10, 4], [9, 9], [11, 13], [9, 18]]);

function inside(x, y) {
  let c = false;
  for (let i = 0, j = SHARD.length - 1; i < SHARD.length; j = i++) {
    const [xi, yi] = SHARD[i], [xj, yj] = SHARD[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function veinDist(x, y) {
  let best = Infinity;
  for (let i = 0; i + 1 < VEIN.length; i++) {
    const [ax, ay] = VEIN[i], [bx, by] = VEIN[i + 1], dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}
export function starglassTexel(x, y) {
  const cx = x + 0.5, cy = y + 0.5;
  if (!inside(cx, cy)) return null;
  return veinDist(cx, cy) < 0.75 ? 'vein' : 'glass';
}

export function starglassArt() {
  const { w, h } = STARGLASS_ART_SIZE;
  const img = image(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = starglassTexel(x, y);
      if (k === 'vein') putTexel(img, x, y, ramp(STAR_RAMPS.vein, 1 - veinDist(x + 0.5, y + 0.5) / 0.75, x, y));
      else if (k === 'glass') {
        const lit = starglassTexel(x - 1, y) == null || starglassTexel(x, y - 1) == null;
        putTexel(img, x, y, ramp(STAR_RAMPS.glass, lit ? 0.95 : 0.7 - (y / h) * 0.5, x, y));
      }
    }
  }
  const near = (x, y) => starglassTexel(x - 1, y) || starglassTexel(x + 1, y) || starglassTexel(x, y - 1) || starglassTexel(x, y + 1);
  const outline = new Set();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!starglassTexel(x, y) && near(x, y)) { outline.add(y * w + x); putTexel(img, x, y, [...STARGLASS_OUTLINE]); }
  quantize(img, paletteOf(STAR_RAMPS.glass, STAR_RAMPS.vein, [STARGLASS_OUTLINE]));
  // quantize recolors clear texels too, so zero their color again; their alpha stays 0.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!starglassTexel(x, y) && !outline.has(y * w + x)) { const i = (y * w + x) * 4; img.colors[i] = 0; img.colors[i + 1] = 0; img.colors[i + 2] = 0; }
  return img;
}

let _registered = false;
/** @param {(entries: any[]) => number} addVendorTextures */
export function registerStarglassArt(addVendorTextures) {
  if (_registered || typeof addVendorTextures !== 'function') return 0;
  _registered = true;
  return addVendorTextures([{
    archive: STARGLASS_ART.archive, record: STARGLASS_ART.record, frame: 0, standIn: true, fileName: `starglass-${STARGLASS_ART.archive}_${STARGLASS_ART.record}`,
    build: async () => { const img = starglassArt(); return { width: img.width, height: img.height, data: img.colors }; },
  }]);
}
export function _resetStarglassArt() { _registered = false; }
