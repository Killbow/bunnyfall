// IMAGE.RAW is a headerless 80x50 array of ART_PAL.COL indexes. The file bytes are used as they are, as in DFU, so
// a short or long file passes through untouched.

import { BaseImageFile, emptyBitmap } from './baseImageFile.js';

export const SAVE_IMAGE_FILENAME = 'IMAGE.RAW';
export const SAVE_IMAGE_WIDTH = 80;
export const SAVE_IMAGE_HEIGHT = 50;

export class SaveImage extends BaseImageFile {
  constructor() {
    super();
    this._loaded = false;
  }

  get description() {
    return SAVE_IMAGE_FILENAME;
  }

  get paletteName() {
    return 'ART_PAL.COL';
  }

  get recordCount() {
    return 1;
  }

  /**
   * @param {Uint8Array} bytes
   * @param {string} [fileName]
   * @param {import('./dfPalette.js').DFPalette} [palette]
   * @returns {boolean}
   */
  load(bytes, fileName = SAVE_IMAGE_FILENAME, palette = null) {
    if (fileName.toUpperCase() !== SAVE_IMAGE_FILENAME) return false;
    if (palette) this.palette = palette;
    this._setBytes(bytes, fileName);
    this._loaded = true;
    return true;
  }

  getFrameCount(record) {
    return record === 0 ? 1 : 0;
  }

  getSize(record) {
    if (record === 0) return { width: SAVE_IMAGE_WIDTH, height: SAVE_IMAGE_HEIGHT };
    return { width: 0, height: 0 };
  }

  getDFBitmap(record = 0, frame = 0) {
    if (record !== 0 || frame !== 0 || !this._loaded || this._bytes.length === 0)
      return emptyBitmap();
    return {
      width: SAVE_IMAGE_WIDTH,
      height: SAVE_IMAGE_HEIGHT,
      data: this._bytes,
      palette: this.palette,
    };
  }
}
