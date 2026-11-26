
import { BaseImageFile } from './baseImageFile.js';

export const CFA_HEADER_SIZE = 14;

export class CfaFile extends BaseImageFile {
  constructor() {
    super();
    this.header = null;
    this.imageData = null;
  }

  load(bytes, fileName, palette = null) {
    this._setBytes(bytes, fileName);
    if (palette) this.palette = palette;
    this._readHeader();
    this._readImageData();
    return this;
  }

  _readHeader() {
    const v = this._view;
    this.header = {
      widthUncompressed: v.getInt16(0, true),
      height: v.getInt16(2, true),
      widthCompressed: v.getInt16(4, true),
      unknown1: v.getInt16(6, true),
      unknown2: v.getInt16(8, true),
      bitsPerPixel: this._bytes[10],
      frameCount: this._bytes[11],
      headerSize: v.getInt16(12, true),
    };
  }

  // The RLE input length counts compressed row widths, while the decoded buffer uses the uncompressed width.
  _readImageData() {
    const h = this.header;
    this.imageData = new Uint8Array(h.widthUncompressed * h.height * h.frameCount);
    this.readRleData(h.headerSize, h.widthCompressed * h.height * h.frameCount, this.imageData);
  }

  get recordCount() { return 1; }

  getFrameCount(record = 0) {
    if (record < 0 || record >= this.recordCount) return -1;
    return this.header?.frameCount ?? 0;
  }

  getSize(record = 0) {
    if (record < 0 || record >= this.recordCount) return { width: 0, height: 0 };
    return { width: this.header.widthUncompressed, height: this.header.height };
  }

  getDFBitmap(record = 0, frame = 0) {
    if (record < 0 || record >= this.recordCount || frame < 0 || frame >= this.getFrameCount(record) || !this.imageData) {
      return { width: 0, height: 0, data: null, palette: null };
    }
    const { widthUncompressed: width, height } = this.header;
    const offset = width * height * frame;
    return {
      width, height,
      data: this.imageData.subarray(offset, offset + width * height),
      palette: this.palette,
    };
  }
}
