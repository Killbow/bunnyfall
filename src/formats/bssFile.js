// BSS layout: a 10-byte header of five Int16 fields, then frame-count raw palette-index frames back to back. The
// three compass files differ in frame size, so width and height always come from the header.

import { BaseImageFile, emptyBitmap } from './baseImageFile.js';

export const BSS_HEADER_BYTES = 10;

export class BssFile extends BaseImageFile {
  constructor() {
    super();
    this._loaded = false;
    this._header = { xPos: 0, yPos: 0, width: 0, height: 0, frameCount: 0 };
    /** @type {Array<object>} */
    this.frames = [];
  }

  get paletteName() {
    return 'ART_PAL.COL';
  }

  get description() {
    return 'BSS File';
  }

  get recordCount() {
    return this._loaded ? 1 : 0;
  }

  get screenPosition() {
    return { x: this._header.xPos, y: this._header.yPos };
  }

  /**
   * @param {Uint8Array} bytes
   * @param {string} fileName
   * @param {import('./dfPalette.js').DFPalette} [palette]
   * @returns {boolean}
   */
  load(bytes, fileName, palette = null) {
    if (!String(fileName).toUpperCase().endsWith('.BSS')) return false;
    if (palette) this.palette = palette;
    this._setBytes(bytes, fileName);
    try {
      this._readHeader();
      this._readImageData();
    } catch {
      this._loaded = false;
      return false;
    }
    this._loaded = true;
    return true;
  }

  getFrameCount(record = 0) {
    if (record < 0 || record >= this.recordCount) return -1;
    return this._header.frameCount;
  }

  getSize(record = 0) {
    if (record < 0 || record >= this.recordCount) return { width: 0, height: 0 };
    return { width: this._header.width, height: this._header.height };
  }

  getDFBitmap(record = 0, frame = 0) {
    if (record < 0 || record >= this.recordCount) return emptyBitmap();
    if (frame >= this.getFrameCount(record)) return emptyBitmap();
    return this.frames[frame] ?? emptyBitmap();
  }

  _readHeader() {
    const v = this._view;
    this._header = {
      xPos: v.getInt16(0, true),
      yPos: v.getInt16(2, true),
      width: v.getInt16(4, true),
      height: v.getInt16(6, true),
      frameCount: v.getInt16(8, true),
    };
  }

  _readImageData() {
    const { width, height, frameCount } = this._header;
    const stride = width * height;
    // Only a negative count or frame size fails, as in DFU. A truncated file still loads with short trailing
    // frames.
    if (frameCount < 0 || stride < 0) throw new Error('BssFile: negative header');
    this.frames = [];
    const end = this._bytes.byteLength;
    let pos = BSS_HEADER_BYTES;
    for (let i = 0; i < frameCount; i++) {
      this.frames.push({
        width, height,
        data: this._bytes.subarray(pos, Math.min(pos + stride, end)),
        palette: this.palette,
      });
      pos += stride;
    }
  }
}
