// `getColor32` and the emission builders write rows bottom-up, as Daggerfall Unity does for Unity textures; callers
// decide how to upload them.

import { DFPalette } from './dfPalette.js';

export const COMPRESSION_FORMATS = Object.freeze({
  Uncompressed: 0x0000,
  RleCompressed: 0x0002,
  ImageRle: 0x0108,
  RecordRle: 0x1108,
});

/**
 * Matches Unity's Color to Color32 conversion: a single-precision product, then rounding half to even.
 * @param {ArrayLike<number>} c
 * @returns {number[]}
 */
export function unityColor32(c) {
  const ch = (v) => {
    const x = Math.fround(Math.fround(Math.min(1, Math.max(0, Math.fround(v)))) * Math.fround(255));
    const f = Math.floor(x), d = x - f;
    return (d > 0.5 || (d === 0.5 && f % 2 === 1) ? f + 1 : f) & 0xff;
  };
  return [ch(c[0]), ch(c[1]), ch(c[2]), ch(c.length > 3 ? c[3] : 1)];
}
/**
 * Matches Unity's `Color32.Lerp` in single precision; the byte cast truncates rather than rounds.
 * @param {number} a
 * @param {number} b
 * @param {number} t
 */
export function unityColor32Lerp(a, b, t) {
  const tt = Math.fround(Math.min(1, Math.max(0, Math.fround(t))));
  return Math.trunc(Math.fround(a + Math.fround((b - a) * tt))) & 0xff;
}

/**
 * Index 0xFF is the classic mask (the halo around a helm) and draws as a black box if left in. Returns a copy, so
 * cached record data is untouched.
 * @param {{width:number,height:number,data:Uint8Array,palette?:any}} srcBitmap
 * @param {number} [replaceWith]
 */
export function changeMask(srcBitmap, replaceWith = 0) {
  if (!srcBitmap?.data) return emptyBitmap();
  const data = new Uint8Array(srcBitmap.data.length);
  for (let i = 0; i < data.length; i++) {
    const index = srcBitmap.data[i];
    data[i] = index === 0xff ? replaceWith : index;
  }
  return { ...srcBitmap, data };
}

export function emptyBitmap() {
  return { width: 0, height: 0, data: null, palette: null };
}

export class BaseImageFile {
  constructor() {
    this.palette = new DFPalette();
    /** @type {Uint8Array|null} */
    this._bytes = null;
    /** @type {DataView|null} */
    this._view = null;
    this._fileName = '';
  }

  get fileName() {
    return this._fileName;
  }

  _setBytes(bytes, fileName) {
    this._bytes = bytes;
    this._view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this._fileName = fileName;
  }

  /** @returns {{position:number,xOffset:number,yOffset:number,width:number,height:number,compression:number,pixelDataLength:number,frameCount:number,dataPosition:number}} */
  readImgFileHeader(position) {
    const v = this._view;
    return {
      position,
      xOffset: v.getInt16(position, true),
      yOffset: v.getInt16(position + 2, true),
      width: v.getInt16(position + 4, true),
      height: v.getInt16(position + 6, true),
      compression: v.getUint16(position + 8, true),
      pixelDataLength: v.getUint16(position + 10, true),
      frameCount: 1,
      dataPosition: position + 12,
    };
  }

  readRleData(srcPos, length, dst, dstPos = 0) {
    const src = this._bytes;
    let pos = 0;
    do {
      const code = src[srcPos++];
      if (code > 127) {
        const pixel = src[srcPos++];
        for (let i = 0; i < code - 127; i++) {
          dst[dstPos++] = pixel;
          pos++;
        }
      } else {
        for (let i = 0; i < code + 1; i++) {
          dst[dstPos++] = src[srcPos++];
        }
        pos += code + 1;
      }
    } while (pos < length);
    return srcPos;
  }

  /**
   * @param {{width:number,height:number,data:Uint8Array}} srcBitmap
   * @param {number} [alphaIndex]
   * @param {number} [border]
   * @param {number} [emissionIndex]
   * @param {number} [customAlphaValue]
   * @returns {{colors:Uint8ClampedArray,width:number,height:number}}
   */
  getColor32(srcBitmap, alphaIndex = -1, border = 0, emissionIndex = -1, customAlphaValue = 255) {
    const srcWidth = srcBitmap.width;
    const srcHeight = srcBitmap.height;
    const dstWidth = srcWidth + border * 2;
    const dstHeight = srcHeight + border * 2;

    const colors = new Uint8ClampedArray(dstWidth * dstHeight * 4);
    const paletteData = this.palette.paletteBuffer;
    const headerLength = this.palette.headerLength;

    for (let y = 0; y < srcHeight; y++) {
      const srcRow = y * srcWidth;
      const dstRow = (dstHeight - 1 - border - y) * dstWidth;
      for (let x = 0; x < srcWidth; x++) {
        const index = srcBitmap.data[srcRow + x];
        const offset = headerLength + index * 3;
        let a = alphaIndex === index ? 0 : customAlphaValue;
        a = emissionIndex === index ? 255 : a;
        const dst = (dstRow + border + x) * 4;
        colors[dst] = paletteData[offset];
        colors[dst + 1] = paletteData[offset + 1];
        colors[dst + 2] = paletteData[offset + 2];
        colors[dst + 3] = a;
      }
    }

    return { colors, width: dstWidth, height: dstHeight };
  }

  static get SPECTRAL_EYES_RESERVED() { return 14; }
  static get SPECTRAL_EYES_PATCHED() { return 247; }
  static get SPECTRAL_GRAY_START() { return 96; }
  static get SPECTRAL_ALPHA() { return 180; }

  setSpectral(srcBitmap) {
    const d = srcBitmap.data;
    for (let i = 0; i < d.length; i++) {
      const index = d[i];
      if (index === BaseImageFile.SPECTRAL_EYES_RESERVED) d[i] = BaseImageFile.SPECTRAL_EYES_PATCHED;
      else if (index > 0) d[i] = (BaseImageFile.SPECTRAL_GRAY_START - index) & 0xff;
    }
  }

  getSpectralEmissionColors32(srcBitmap, albedo, border, eyesEmissionIndex, eyeEmission, otherEmission) {
    const srcWidth = srcBitmap.width, srcHeight = srcBitmap.height;
    const dstWidth = srcWidth + border * 2, dstHeight = srcHeight + border * 2;
    const out = new Uint8ClampedArray(dstWidth * dstHeight * 4);
    const A = albedo.colors;
    const oa = otherEmission.length > 3 ? otherEmission[3] : 255;
    for (let y = 0; y < srcHeight; y++) {
      const srcRow = y * srcWidth;
      const dstRow = (dstHeight - 1 - border - y) * dstWidth;
      for (let x = 0; x < srcWidth; x++) {
        const index = srcBitmap.data[srcRow + x];
        const dst = (dstRow + border + x) * 4;
        if (index === eyesEmissionIndex) {
          out[dst] = eyeEmission[0]; out[dst + 1] = eyeEmission[1]; out[dst + 2] = eyeEmission[2]; out[dst + 3] = 255;
        } else {
          const r = A[dst], g = A[dst + 1], b = A[dst + 2];
          const V = Math.max(r, g, b) / 255;
          const t = Math.min(1, Math.max(0, Math.pow(V, 1.9)));
          out[dst] = Math.round(otherEmission[0] + (r - otherEmission[0]) * t);
          out[dst + 1] = Math.round(otherEmission[1] + (g - otherEmission[1]) * t);
          out[dst + 2] = Math.round(otherEmission[2] + (b - otherEmission[2]) * t);
          out[dst + 3] = Math.round(oa + (A[dst + 3] - oa) * t);
        }
      }
    }
    return { colors: out, width: dstWidth, height: dstHeight };
  }

  /**
   * @param {ArrayLike<number>} srcColors
   * @param {number} width
   * @param {number} height
   * @param {ArrayLike<number>} neutralColor
   * @param {number} scale
   * @returns {{colors:Uint8ClampedArray,width:number,height:number}}
   */
  getFireWallColors32(srcColors, width, height, neutralColor, scale) {
    const n = unityColor32(neutralColor);
    const out = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const o = i * 4;
      for (let c = 0; c < 4; c++) out[o + c] = unityColor32Lerp(n[c], srcColors[o + c] ?? 0, scale);
    }
    return { colors: out, width, height };
  }

  /** @returns {{colors:Uint8ClampedArray,width:number,height:number}} */
  getWindowColors32(srcBitmap, emissionIndex = 0xff) {
    const { width, height } = srcBitmap;
    const colors = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      const srcRow = y * width;
      const dstRow = (height - 1 - y) * width;
      for (let x = 0; x < width; x++) {
        if (srcBitmap.data[srcRow + x] === emissionIndex) {
          const dst = (dstRow + x) * 4;
          colors[dst] = 255;
          colors[dst + 1] = 255;
          colors[dst + 2] = 255;
          colors[dst + 3] = 255;
        }
      }
    }
    return { colors, width, height };
  }
}
