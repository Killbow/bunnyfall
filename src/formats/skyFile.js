
import { DFPalette } from './dfPalette.js';

export const SKY_FRAME_WIDTH = 512;
export const SKY_FRAME_HEIGHT = 220;
const FRAME_DATA_LENGTH = SKY_FRAME_WIDTH * SKY_FRAME_HEIGHT;
const PALETTE_DATA_POSITION = 0;
const IMAGE_DATA_POSITION = 549120;

export class SkyFile {
  constructor() {
    this._bytes = null;
    this._fileName = '';
    this._palettes = new Array(32).fill(null);
    this._bitmaps = new Array(64).fill(null);
  }

  get recordCount() {
    return this._bytes ? 2 : 0;
  }

  get description() {
    return 'SKY File';
  }

  /**
   * @param {Uint8Array} bytes
   * @param {string} fileName
   * @returns {boolean}
   */
  load(bytes, fileName) {
    const fn = fileName.toUpperCase();
    if (!fn.startsWith('SKY') && !fn.endsWith('.DAT')) return false;
    this._bytes = bytes;
    this._fileName = fileName;
    return true;
  }

  getDFPalette(frame) {
    if (frame < 0 || frame >= 32) return null;
    if (this._palettes[frame] === null) {
      const p = new DFPalette();
      p.readEmbedded(this._bytes, PALETTE_DATA_POSITION + 776 * frame + 8);
      this._palettes[frame] = p;
    }
    return this._palettes[frame];
  }

  // Record 0 is the east half of the sky and record 1 the west half; the file itself does not name them.
  getDFBitmap(record, frame) {
    if (record < 0 || record > 1 || frame < 0 || frame > 31) {
      return { width: 0, height: 0, data: new Uint8Array(0) };
    }
    const index = record * 32 + frame;
    if (this._bitmaps[index] === null) {
      const start = IMAGE_DATA_POSITION + FRAME_DATA_LENGTH * index;
      this._bitmaps[index] = {
        width: SKY_FRAME_WIDTH,
        height: SKY_FRAME_HEIGHT,
        data: this._bytes.subarray(start, start + FRAME_DATA_LENGTH),
      };
    }
    return this._bitmaps[index];
  }

  getFrameCount(record) {
    if (!this._bytes || record < 0 || record >= 2) return -1;
    return 32;
  }

  getSize(record) {
    if (!this._bytes || record < 0 || record >= 2) return { width: 0, height: 0 };
    return { width: SKY_FRAME_WIDTH, height: SKY_FRAME_HEIGHT };
  }

  /**
   * Output rows are bottom-up, so row 0 is the bottom (horizon) row of the source image.
   * @returns {{colors:Uint8ClampedArray,width:number,height:number}}
   */
  getColor32(record, frame) {
    const bitmap = this.getDFBitmap(record, frame);
    const palette = this.getDFPalette(frame);
    const pal = palette.paletteBuffer;
    const head = palette.headerLength;
    const { width, height, data } = bitmap;
    const colors = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      const srcRow = y * width;
      const dstRow = (height - 1 - y) * width;
      for (let x = 0; x < width; x++) {
        const offset = head + data[srcRow + x] * 3;
        const dst = (dstRow + x) * 4;
        colors[dst] = pal[offset];
        colors[dst + 1] = pal[offset + 1];
        colors[dst + 2] = pal[offset + 2];
        colors[dst + 3] = 255;
      }
    }
    return { colors, width, height };
  }

  static indexToFileName(skyIndex) {
    return `SKY${String(skyIndex).padStart(2, '0')}.DAT`;
  }
}
