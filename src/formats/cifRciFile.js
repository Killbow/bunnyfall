
import { BaseImageFile, COMPRESSION_FORMATS, emptyBitmap } from './baseImageFile.js';

const RECORD_TYPES = Object.freeze({
  MultiImage: 0,
  WeaponAnim: 1,
});

// Matches the fixed 64-record array in DFU. The weapon loop advances by the file's own TotalSize, so a TotalSize of
// 0 would loop forever without this bound.
const MAX_WEAPON_RECORDS = 64;

function rciDimensions(filename) {
  switch (filename) {
    case 'FACES.CIF':
    case 'CHLD00I0.RCI':
      return { width: 64, height: 64 };
    case 'TFAC00I0.RCI':
      return { width: 64, height: 64 };
    case 'BUTTONS.RCI':
      return { width: 32, height: 16 };
    case 'MPOP.RCI':
      return { width: 17, height: 17 };
    case 'NOTE.RCI':
      return { width: 44, height: 9 };
    case 'SPOP.RCI':
      return { width: 22, height: 22 };
    default:
      return null;
  }
}

export class CifRciFile extends BaseImageFile {
  constructor() {
    super();
    this._records = [];
  }

  get paletteName() {
    return 'ART_PAL.COL';
  }

  get recordCount() {
    return this._records.length;
  }

  get description() {
    if (this._fileName.endsWith('.CIF')) return 'CIF File';
    if (this._fileName.endsWith('.RCI')) return 'RCI File';
    return 'Unknown';
  }

  /**
   * @param {Uint8Array} bytes
   * @param {string} fileName
   * @param {import('./dfPalette.js').DFPalette} [palette]
   * @returns {boolean}
   */
  load(bytes, fileName, palette = null) {
    const upper = fileName.toUpperCase();
    if (!upper.endsWith('.CIF') && !upper.endsWith('.RCI')) return false;

    if (palette) this.palette = palette;
    this._setBytes(bytes, fileName);

    try {
      this._readRecords();
    } catch (e) {
      this._records.length = 0;
      return false;
    }

    return true;
  }

  getFrameCount(record) {
    if (record < 0 || record >= this._records.length) return 0;
    return this._records[record].header.frameCount;
  }

  getSize(record) {
    if (record < 0 || record >= this._records.length) return { width: 0, height: 0 };
    const r = this._records[record];
    if (r.header.frameCount > 1) return { width: r.animHeader.width, height: r.animHeader.height };
    return { width: r.header.width, height: r.header.height };
  }

  getOffset(record) {
    if (record < 0 || record >= this._records.length) return { x: 0, y: 0 };
    const r = this._records[record];
    if (r.header.frameCount > 1) return { x: 0, y: 0 };
    return { x: r.header.xOffset, y: r.header.yOffset };
  }

  getDFBitmap(record, frame) {
    if (record < 0 || record >= this._records.length || frame >= this.getFrameCount(record)) {
      return emptyBitmap();
    }
    if (!this._readImageData(record, frame)) return emptyBitmap();
    return this._records[record].frames[frame];
  }

  _readRecords() {
    const fn = this._fileName;

    if (fn.endsWith('.RCI') || fn === 'FACES.CIF') {
      this._readRci(fn);
      return;
    }

    if (fn.includes('WEAPO')) {
      this._readWeaponCif(fn);
      return;
    }

    let pos = 0;
    do {
      const header = this.readImgFileHeader(pos);
      this._records.push({
        header,
        animHeader: null,
        fileType: RECORD_TYPES.MultiImage,
        animPixelDataPosition: -1,
        frames: [null],
      });
      pos = header.dataPosition + header.pixelDataLength;
    } while (pos < this._bytes.byteLength);
  }

  _readRci(filename) {
    const sz = rciDimensions(filename);
    if (!sz) return;

    const count = Math.floor(this._bytes.byteLength / (sz.width * sz.height));

    let pos = 0;
    for (let i = 0; i < count; i++) {
      this._records.push({
        header: {
          position: pos,
          xOffset: 0,
          yOffset: 0,
          width: sz.width,
          height: sz.height,
          compression: COMPRESSION_FORMATS.Uncompressed,
          pixelDataLength: sz.width * sz.height,
          frameCount: 1,
          dataPosition: pos,
        },
        animHeader: null,
        fileType: RECORD_TYPES.MultiImage,
        animPixelDataPosition: -1,
        frames: [null],
      });
      pos += sz.width * sz.height;
    }
  }

  _readWeaponCif(filename) {
    const v = this._view;
    let pos = 0;

    if (filename !== 'WEAPON09.CIF') {
      const header = this.readImgFileHeader(pos);
      this._records.push({
        header,
        animHeader: null,
        fileType: RECORD_TYPES.MultiImage,
        animPixelDataPosition: -1,
        frames: [null],
      });
      pos = header.dataPosition + header.pixelDataLength;
    }

    do {
      if (this._records.length >= MAX_WEAPON_RECORDS) throw new Error('CifRciFile: record overflow');
      const animHeader = {
        position: pos,
        width: v.getUint16(pos, true),
        height: v.getUint16(pos + 2, true),
        lastFrameWidth: v.getUint16(pos + 4, true),
        xOffset: v.getInt16(pos + 6, true),
        lastFrameYOffset: v.getInt16(pos + 8, true),
        dataLength: v.getInt16(pos + 10, true),
        frameDataOffsetList: new Array(31),
        totalSize: 0,
      };
      pos += 12;

      let frameCount = 0;
      for (let i = 0; i < 31; i++) {
        animHeader.frameDataOffsetList[i] = v.getUint16(pos, true);
        if (animHeader.frameDataOffsetList[i] !== 0) frameCount++;
        pos += 2;
      }

      animHeader.totalSize = v.getUint16(pos, true);
      pos += 2;

      this._records.push({
        // DFU sets only the frame count on a weapon record header, so a single-frame weapon record reports a size
        // and offset of 0.
        header: { frameCount, width: 0, height: 0, xOffset: 0, yOffset: 0 },
        animHeader,
        fileType: RECORD_TYPES.WeaponAnim,
        animPixelDataPosition: pos,
        frames: new Array(frameCount).fill(null),
      });

      pos = animHeader.position + animHeader.totalSize;
    } while (pos < this._bytes.byteLength);
  }

  _readImageData(record, frame) {
    const rec = this._records[record];
    if (rec.frames[frame] !== null) return true;

    if (rec.fileType === RECORD_TYPES.WeaponAnim) return this._readWeaponImage(record, frame);

    switch (rec.header.compression) {
      case COMPRESSION_FORMATS.RleCompressed:
        return this._readRleImage(record, frame);
      case COMPRESSION_FORMATS.Uncompressed:
        return this._readImage(record, frame);
      default:
        return false;
    }
  }

  _readImage(record, frame) {
    const rec = this._records[record];
    const data = new Uint8Array(rec.header.pixelDataLength);
    data.set(
      this._bytes.subarray(rec.header.dataPosition, rec.header.dataPosition + data.length)
    );
    rec.frames[frame] = {
      width: rec.header.width,
      height: rec.header.height,
      data,
      palette: this.palette,
    };
    return true;
  }

  _readWeaponImage(record, frame) {
    const rec = this._records[record];
    const length = rec.animHeader.width * rec.animHeader.height;
    const data = new Uint8Array(length);
    const position = rec.animHeader.position + rec.animHeader.frameDataOffsetList[frame];
    this.readRleData(position, length, data);
    rec.frames[frame] = {
      width: rec.animHeader.width,
      height: rec.animHeader.height,
      data,
      palette: this.palette,
    };
    return true;
  }

  _readRleImage(record, frame) {
    const rec = this._records[record];
    const length = rec.header.width * rec.header.height;
    const data = new Uint8Array(length);
    this.readRleData(rec.header.dataPosition, length, data);
    rec.frames[frame] = {
      width: rec.header.width,
      height: rec.header.height,
      data,
      palette: this.palette,
    };
    return true;
  }
}
