
import { BaseImageFile, COMPRESSION_FORMATS, emptyBitmap } from './baseImageFile.js';

export const UNSUPPORTED_IMG_FILENAMES = Object.freeze([
  'FMAP0I00.IMG',
  'FMAP0I01.IMG',
  'FMAP0I16.IMG',
]);

// A consumer of these six files must create its own DFPalette, since `_readPalette` writes into the palette it is
// given. For any other IMG, `paletteName` names a palette file the host has already loaded.
export const PALETTIZED_FILENAMES = Object.freeze([
  'CHGN00I0.IMG',
  'DIE_00I0.IMG',
  'PICK02I0.IMG',
  'PICK03I0.IMG',
  'PRIS00I0.IMG',
  'TITL00I0.IMG',
]);

export function getHeaderlessFileImageDimensions(length) {
  switch (length) {
    case 44: return { width: 22, height: 22 };
    case 289: return { width: 17, height: 17 };
    case 441: return { width: 49, height: 9 };
    case 512: return { width: 32, height: 16 };
    case 720: return { width: 9, height: 80 };
    case 990: return { width: 45, height: 22 };
    case 1720: return { width: 43, height: 40 };
    case 2140: return { width: 107, height: 20 };
    case 2916: return { width: 81, height: 36 };
    case 3200: return { width: 40, height: 80 };
    case 3938: return { width: 179, height: 22 };
    case 4280: return { width: 107, height: 40 };
    case 4508: return { width: 322, height: 14 };
    case 20480: return { width: 320, height: 64 };
    case 26496: return { width: 184, height: 144 };
    case 64000: return { width: 320, height: 200 };
    case 64768: return { width: 320, height: 200 };
    case 68800: return { width: 320, height: 215 };
    case 112128: return { width: 512, height: 219 };
    default: return { width: 0, height: 0 };
  }
}

export class ImgFile extends BaseImageFile {
  constructor() {
    super();
    this._header = null;
    this._imgRecord = emptyBitmap();
    this._isPalettized = false;
    this._imageDataPosition = -1;
    this._loaded = false;
  }

  get isPalettized() {
    return this._isPalettized;
  }

  get paletteName() {
    if (this._isPalettized) return '';
    const fn = this._fileName;
    if (fn.slice(0, 4) === 'FMAP') return 'FMAP_PAL.COL';
    if (fn.slice(0, 4) === 'NITE') return 'NIGHTSKY.COL';
    switch (fn) {
      case 'DANK02I0.IMG': return 'DANKBMAP.COL';
      case 'TMAP00I0.IMG': return 'MAP.PAL';
      default: return 'ART_PAL.COL';
    }
  }

  get recordCount() {
    return this._loaded ? 1 : 0;
  }

  get description() {
    return 'IMG File';
  }

  get imageOffset() {
    return { x: this._header.xOffset, y: this._header.yOffset };
  }

  isFilenameSupported(filename) {
    return !UNSUPPORTED_IMG_FILENAMES.includes(filename);
  }

  /**
   * @param {Uint8Array} bytes
   * @param {string} fileName
   * @param {import('./dfPalette.js').DFPalette} [palette]
   * @returns {boolean}
   */
  load(bytes, fileName, palette = null) {
    if (!fileName.toUpperCase().endsWith('.IMG')) return false;
    if (!this.isFilenameSupported(fileName)) return false;

    if (palette) this.palette = palette;
    this._setBytes(bytes, fileName);

    try {
      this._readHeader();
    } catch (e) {
      return false;
    }

    this._loaded = true;
    return true;
  }

  getDFBitmap(record = 0, frame = 0) {
    if (record !== 0 || frame !== 0) return emptyBitmap();
    if (!this._readImageData()) return emptyBitmap();
    return this._imgRecord;
  }

  getFrameCount(record) {
    if (record !== 0) return -1;
    if (!this._readImageData()) return -1;
    return 1;
  }

  getSize(record) {
    if (record !== 0) return { width: 0, height: 0 };
    return { width: this._imgRecord.width | 0, height: this._imgRecord.height | 0 };
  }

  _readHeader() {
    const sz = getHeaderlessFileImageDimensions(this._bytes.byteLength);
    if (sz.width === 0 && sz.height === 0) {
      this._header = this.readImgFileHeader(0);
    } else {
      this._header = {
        position: 0,
        xOffset: 0,
        yOffset: 0,
        width: sz.width,
        height: sz.height,
        compression: COMPRESSION_FORMATS.Uncompressed,
        pixelDataLength: sz.width * sz.height,
        frameCount: 1,
        dataPosition: 0,
      };
    }
    this._imageDataPosition = this._header.dataPosition;
  }

  _readImageData() {
    if (this._imgRecord.data !== null) return true;

    const h = this._header;
    const data = new Uint8Array(h.width * h.height);

    // Copies raw width * height bytes whatever the header compression field says, as DFU does.
    data.set(this._bytes.subarray(this._imageDataPosition, this._imageDataPosition + data.length));

    this._imgRecord = { width: h.width, height: h.height, data, palette: this.palette };

    this._readPalette(this._imageDataPosition + data.length);

    return true;
  }

  // Replaces the palette passed in. The embedded palette is stored dark, and DFU scales each channel by 4.
  _readPalette(position) {
    if (!PALETTIZED_FILENAMES.includes(this._fileName)) {
      this._isPalettized = false;
      return;
    }

    this.palette.readEmbedded(this._bytes, position);
    this._isPalettized = true;

    for (let i = 0; i < 256; i++) {
      const r = (this.palette.getRed(i) * 4) & 0xff;
      const g = (this.palette.getGreen(i) * 4) & 0xff;
      const b = (this.palette.getBlue(i) * 4) & 0xff;
      this.palette.set(i, r, g, b);
    }
  }
}
