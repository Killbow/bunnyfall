// @ts-check
// The authored continent as the Bay's kind of data: height, climate, and province byte planes over the frame.
// Nothing in the game loop calls it; the held map draws the continent from the vector model.
import { PROVINCES } from './tamrielGeography.js';
import { tamrielSize, tamrielFit, BAY_W, BAY_H } from './tamrielFrame.js';
import { provinceKeyAt } from './tamrielLand.js';
import { authoredHeightByte, groundHash, SHORE_BYTE, INLAND_BYTE, SNOW_BYTE, PLAIN_REACH } from './tamrielGround.js';
import { CLIMATES } from '../formats/mapsTables.js';

export const PROVINCE_NONE = 255;
export { SHORE_BYTE, INLAND_BYTE, SNOW_BYTE, PLAIN_REACH };

export function rasterizeTamriel({ cell = 8 } = {}) {
  const size = tamrielSize();
  const width = Math.ceil(size.w / cell), height = Math.ceil(size.h / cell);
  const n = width * height;
  const province = new Uint8Array(n).fill(PROVINCE_NONE);
  const climate = new Uint8Array(n).fill(CLIMATES.Ocean);
  const heightBytes = new Uint8Array(n);
  const unit = tamrielFit().ppu / cell;
  const index = new Map(PROVINCES.map((p, i) => [p.key, i]));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const key = provinceKeyAt((x + 0.5) / unit, (y + 0.5) / unit);
      if (!key) continue;
      const p = index.get(key);
      if (p === undefined) continue;
      province[i] = p;
      climate[i] = PROVINCES[p].climate;
      heightBytes[i] = Math.max(SHORE_BYTE, authoredHeightByte((x + 0.5) / unit, (y + 0.5) / unit, (groundHash(x, y) - 0.5) * 4));
    }
  }
  return { width, height, cell, heightBytes, climate, province };
}

/**
 * @param {ReturnType<typeof rasterizeTamriel>} raster
 * @param {{ heightBytes: ArrayLike<number>, width?: number, climateAt?: (x: number, y: number) => number }} bay
 */
export function composeBay(raster, bay) {
  const bw = bay.width ?? BAY_W;
  let written = 0;
  const { ox, oy } = tamrielFit();
  const cx0 = Math.floor(ox / raster.cell), cx1 = Math.ceil((ox + BAY_W) / raster.cell);
  const cy0 = Math.floor(oy / raster.cell), cy1 = Math.ceil((oy + BAY_H) / raster.cell);
  for (let y = Math.max(0, cy0); y < Math.min(raster.height, cy1); y++) {
    for (let x = Math.max(0, cx0); x < Math.min(raster.width, cx1); x++) {
      const bx = Math.floor((x + 0.5) * raster.cell - ox), by = Math.floor((y + 0.5) * raster.cell - oy);
      if (bx < 0 || by < 0 || bx >= BAY_W || by >= BAY_H) continue;
      const i = y * raster.width + x;
      raster.heightBytes[i] = bay.heightBytes[by * bw + bx] ?? 0;
      const c = bay.climateAt?.(bx, by);
      if (typeof c === 'number' && c >= 0) raster.climate[i] = c;
      written++;
    }
  }
  return written;
}
