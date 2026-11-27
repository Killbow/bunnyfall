// The caller supplies the ART_PAL.COL palette through `palette` or `load`, because the browser cannot read it from
// the texture's folder.

import { BaseImageFile, COMPRESSION_FORMATS, emptyBitmap } from './baseImageFile.js';

const SOLID_SIZE = 32;

export const SOLID_TYPES = Object.freeze({
  None: 0,
  SolidColoursA: 1,
  SolidColoursB: 2,
});

const ROW_ENCODING_RLE = 0x8000;

export const UNSUPPORTED_FILENAMES = Object.freeze([
  'TEXTURE.215',
  'TEXTURE.217',
  'TEXTURE.436',
]);

// Lives in this reader so scenes/shared.js and ui/textureCanvas.js can both import it without importing each other.
export const texName = (archive) => `TEXTURE.${String(archive).padStart(3, '0')}`;
export const LAST_CLASSIC_TEXTURE_ARCHIVE = 511;

export class TextureFile extends BaseImageFile {
  constructor() {
    super();
    this._solidType = SOLID_TYPES.None;
    this._recordCount = 0;
    this._description = '';
    this._recordHeaders = [];
    this._records = [];
  }

  static indexToFileName(archiveIndex) {
    return `TEXTURE.${String(archiveIndex).padStart(3, '0')}`;
  }

  static isSpectralArchive(archive) {
    // 273 is the ghost, 278 the wraith, and 473 Lysandus.
    return archive === 273 || archive === 278 || archive === 473;
  }

  isFilenameSupported(filename) {
    return !UNSUPPORTED_FILENAMES.includes(filename);
  }

  get description() {
    return this._description;
  }

  get paletteName() {
    return 'ART_PAL.COL';
  }

  get recordCount() {
    return this._recordCount;
  }

  get solidType() {
    return this._solidType;
  }

  /**
   * @param {Uint8Array} bytes
   * @param {string} fileName
   * @param {import('./dfPalette.js').DFPalette} [palette]
   * @returns {boolean}
   */
  load(bytes, fileName, palette = null) {
    if (!fileName.toUpperCase().startsWith('TEXTURE.')) return false;

    if (!this.isFilenameSupported(fileName)) return false;

    if (fileName === 'TEXTURE.000') this._solidType = SOLID_TYPES.SolidColoursA;
    else if (fileName === 'TEXTURE.001') this._solidType = SOLID_TYPES.SolidColoursB;
    else this._solidType = SOLID_TYPES.None;

    if (palette) this.palette = palette;
    this.archive = Number.parseInt(fileName.slice('TEXTURE.'.length), 10);
    this._setBytes(bytes, fileName);

    try {
      this._readHeader();
      this._readRecordHeaders();
      this._readRecords();
    } catch (e) {
      return false;
    }

    return true;
  }

  getFrameCount(record) {
    if (record < 0 || record >= this._recordCount) return -1;
    if (this._solidType !== SOLID_TYPES.None) return 1;
    return this._records[record].frameCount;
  }

  getSize(record) {
    if (record < 0 || record >= this._recordCount) return { width: 0, height: 0 };
    if (this._solidType !== SOLID_TYPES.None) return { width: SOLID_SIZE, height: SOLID_SIZE };
    const r = this._records[record];
    return { width: r.width, height: r.height };
  }

  // Each value is divided by 256 to get the scale factor applied to the image in the scene.
  getScale(record) {
    if (record < 0 || record >= this._recordCount) return { width: 0, height: 0 };
    const r = this._records[record];
    return { width: r.scaleX, height: r.scaleY };
  }

  getOffset(record) {
    if (record < 0 || record >= this._recordCount) return { x: 0, y: 0 };
    const r = this._records[record];
    return { x: r.offsetX, y: r.offsetY };
  }

  getWidth(record) {
    return this.getSize(record).width;
  }

  getHeight(record) {
    return this.getSize(record).height;
  }

  getDFBitmap(record, frame) {
    if (record < 0 || record >= this._recordCount || frame >= this.getFrameCount(record)) {
      return emptyBitmap();
    }
    if (!this._readImageData(record, frame)) return emptyBitmap();
    return this._records[record].frames[frame];
  }

  _readHeader() {
    const v = this._view;
    this._recordCount = v.getInt16(0, true);
    this._description = this._readCString(2).trim();
  }

  _readRecordHeaders() {
    const v = this._view;
    this._recordHeaders = [];
    let pos = 26;
    for (let r = 0; r < this._recordCount; r++) {
      this._recordHeaders.push({
        position: pos,
        type1: v.getInt16(pos, true),
        recordPosition: v.getInt32(pos + 2, true),
        type2: v.getInt16(pos + 6, true),
        unknown1: v.getInt32(pos + 8, true),
      });
      pos += 20;
    }
  }

  _readRecords() {
    const v = this._view;
    this._records = [];
    for (let r = 0; r < this._recordCount; r++) {
      const pos = this._recordHeaders[r].recordPosition;
      const rec = {
        position: pos,
        offsetX: v.getInt16(pos, true),
        offsetY: v.getInt16(pos + 2, true),
        width: v.getInt16(pos + 4, true),
        height: v.getInt16(pos + 6, true),
        compression: v.getInt16(pos + 8, true),
        recordSize: v.getUint32(pos + 10, true),
        dataOffset: v.getUint32(pos + 14, true),
        isNormal: v.getInt16(pos + 18, true) !== 0,
        frameCount: v.getUint16(pos + 20, true),
        unknown1: v.getInt16(pos + 22, true),
        scaleX: v.getInt16(pos + 24, true),
        scaleY: v.getInt16(pos + 26, true),
        frames: null,
      };
      if (this._solidType === SOLID_TYPES.None) {
        rec.frames = new Array(rec.frameCount).fill(null);
      } else {
        rec.width = SOLID_SIZE;
        rec.height = SOLID_SIZE;
        rec.frames = [null];
      }
      this._records.push(rec);
    }
  }

  _readImageData(record, frame) {
    const rec = this._records[record];
    if (rec.frames[frame] !== null) return true;

    if (this._solidType !== SOLID_TYPES.None) return this._readSolid(record);

    switch (rec.compression) {
      case COMPRESSION_FORMATS.RecordRle:
      case COMPRESSION_FORMATS.ImageRle:
        return this._readRle(record, frame);
      case COMPRESSION_FORMATS.Uncompressed:
      default:
        return this._readImage(record, frame);
    }
  }

  _readSolid(record) {
    const colourIndex =
      this._solidType === SOLID_TYPES.SolidColoursA ? record & 0xff : (128 + record) & 0xff;
    const data = new Uint8Array(SOLID_SIZE * SOLID_SIZE).fill(colourIndex);
    this._records[record].frames[0] = {
      width: SOLID_SIZE,
      height: SOLID_SIZE,
      data,
      palette: this.palette,
    };
    return true;
  }

  _readImage(record, frame) {
    const rec = this._records[record];
    const data = new Uint8Array(rec.width * rec.height);
    const fileBytes = this._bytes;
    const v = this._view;
    const position = rec.position + rec.dataOffset;

    if (rec.frameCount === 1) {
      let srcPos = position;
      let dstPos = 0;
      for (let y = 0; y < rec.height; y++) {
        data.set(fileBytes.subarray(srcPos, srcPos + rec.width), dstPos);
        srcPos += rec.width + (256 - rec.width);
        dstPos += rec.width;
      }
    } else if (rec.frameCount > 1) {
      const frameOffset = v.getInt32(position + frame * 4, true);
      let srcPos = position + frameOffset;
      const cx = v.getInt16(srcPos, true);
      const cy = v.getInt16(srcPos + 2, true);
      srcPos += 4;

      let dstPos = 0;
      for (let y = 0; y < cy; y++) {
        let x = 0;
        while (x < cx) {
          let pixel = fileBytes[srcPos++];
          let run = x + pixel;
          for (; x < run; x++) {
            data[dstPos++] = 0;
          }

          pixel = fileBytes[srcPos++];
          run = x + pixel;
          for (; x < run; x++) {
            pixel = fileBytes[srcPos++];
            data[dstPos++] = pixel;
          }
        }
      }
    } else {
      return false;
    }

    rec.frames[frame] = { width: rec.width, height: rec.height, data, palette: this.palette };
    return true;
  }

  _readRle(record, frame) {
    const rec = this._records[record];
    const data = new Uint8Array(rec.width * rec.height);
    const fileBytes = this._bytes;
    const v = this._view;

    let position = rec.position + rec.dataOffset + rec.height * frame * 4;
    const rowHeaders = [];
    for (let i = 0; i < rec.height; i++) {
      rowHeaders.push({
        rowOffset: v.getInt16(position, true),
        rowEncoding: v.getUint16(position + 2, true),
      });
      position += 4;
    }

    let dstPos = 0;
    for (const h of rowHeaders) {
      let srcPos = rec.position + h.rowOffset;
      if (h.rowEncoding === ROW_ENCODING_RLE) {
        const rowWidth = v.getUint16(srcPos, true);
        srcPos += 2;
        let rowPos = 0;
        do {
          const probe = v.getInt16(srcPos, true);
          srcPos += 2;
          if (probe < 0) {
            const run = -probe;
            const pixel = fileBytes[srcPos++];
            for (let i = 0; i < run; i++) {
              data[dstPos++] = pixel;
              rowPos++;
            }
          } else if (probe > 0) {
            data.set(fileBytes.subarray(srcPos, srcPos + probe), dstPos);
            srcPos += probe;
            dstPos += probe;
            rowPos += probe;
          }
        } while (rowPos < rowWidth);
      } else {
        data.set(fileBytes.subarray(srcPos, srcPos + rec.width), dstPos);
        dstPos += rec.width;
      }
    }

    rec.frames[frame] = { width: rec.width, height: rec.height, data, palette: this.palette };
    return true;
  }

  _readCString(offset) {
    let end = offset;
    while (end < this._bytes.byteLength && this._bytes[end] !== 0) end++;
    let s = '';
    for (let i = offset; i < end; i++) s += String.fromCharCode(this._bytes[i]);
    return s;
  }
}
