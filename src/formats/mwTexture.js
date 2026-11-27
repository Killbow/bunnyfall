// Morrowind NIFs name .tga textures that the archives store as .dds, so every NIF texture path goes through
// `correctTexturePath`, which follows OpenMW's correctResourcePath and its four probes.

import { decodeDds } from './mwDdsFile.js';

// Matches OpenMW's VFS path normalization. A BSA index must be keyed the same way, because lookups are exact with
// no case-insensitive compare.
export function normalizeVfsPath(path) {
  let out = String(path ?? '').replace(/\\/g, '/').toLowerCase();
  out = out.replace(/\/{2,}/g, '/');
  if (out.startsWith('/')) out = out.slice(1);
  return out;
}

/** @returns */
export function findDirectory(path, directory) {
  const size = directory.length;
  let offset = 0;
  for (;;) {
    const pos = path.indexOf(directory, offset);
    if (pos < 0) return -1;
    if (pos + size >= path.length) return -1;
    if ((pos === 0 || path[pos - 1] === '/') && path[pos + size] === '/') return pos;
    offset = pos + size;
  }
}

/** @returns {{path:string, changed:boolean}} */
export function changeExtension(path, ext) {
  for (let i = path.length - 1; i >= 0; i--) {
    if (path[i] === '/') break;
    if (path[i] === '.') return { path: `${path.slice(0, i + 1)}${ext}`, changed: true };
  }
  return { path, changed: false };
}

const filename = (path) => {
  const at = path.lastIndexOf('/');
  return at < 0 ? path : path.slice(at + 1);
};

/**
 * When every probe misses, this returns the .dds candidate rather than the authored name, so the caller fails to
 * open it and shows the warning texture.
 * @param {string[]} topLevelDirectories
 * @param {string} resPath
 * @param {(p:string)=>boolean} exists
 * @param {string} ext
 * @returns {string}
 */
export function correctResourcePath(topLevelDirectories, resPath, exists, ext) {
  const path = normalizeVfsPath(resPath);
  let corrected = null;
  for (const dir of topLevelDirectories) {
    const at = findDirectory(path, dir);
    if (at >= 0) {
      corrected = path.slice(at);
      break;
    }
  }
  if (corrected === null) corrected = `${topLevelDirectories[0]}/${path}`;

  const origExt = corrected;
  const swapped = changeExtension(corrected, ext);
  corrected = swapped.path;
  const isExtChanged = swapped.changed;

  if (exists(corrected)) return corrected;
  if (isExtChanged && exists(origExt)) return origExt;
  const front = topLevelDirectories[0];
  const fallback = `${front}/${filename(corrected)}`;
  if (exists(fallback)) return fallback;
  if (isExtChanged) {
    const fallbackOrig = `${front}/${filename(origExt)}`;
    if (exists(fallbackOrig)) return fallbackOrig;
  }
  return corrected;
}

export const TEXTURE_TOP_LEVEL = Object.freeze(['textures', 'bookart']);

export const TEXTURE_EXT = 'dds';

export function correctTexturePath(resPath, exists) {
  return correctResourcePath(TEXTURE_TOP_LEVEL, resPath, exists, TEXTURE_EXT);
}

// Bit 0 is wrapT and bit 1 is wrapS, the reverse of the names. A set bit means repeat and a clear bit means clamp
// to edge.
export const GL_REPEAT = 0x2901;
export const GL_CLAMP_TO_EDGE = 0x812f;
export function wrapModes(clampMode) {
  const c = clampMode | 0;
  return {
    wrapS: (c & 2) ? GL_REPEAT : GL_CLAMP_TO_EDGE,
    wrapT: (c & 1) ? GL_REPEAT : GL_CLAMP_TO_EDGE,
  };
}

// Every texture load failure uses this magenta image, as OpenMW does, so a missing texture shows up instead of
// failing the draw.
export function warningImage() {
  const width = 8;
  const height = 8;
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = 255;
    rgba[i * 4 + 1] = 0;
    rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = 255;
  }
  return { width, height, mips: [{ width, height, rgba }] };
}

// Uses the x-prefixed name only when its .kf exists, as OpenMW does. The male first-person skeleton path already
// starts with x, so it keeps its original name.
export function correctActorModelPath(resPath, exists) {
  const path = normalizeVfsPath(resPath);
  const at = path.lastIndexOf('/');
  const xform = at < 0 ? `x${path}` : `${path.slice(0, at + 1)}x${path.slice(at + 1)}`;
  const dot = xform.lastIndexOf('.');
  const ext = dot > xform.lastIndexOf('/') ? xform.slice(dot + 1) : '';
  const probe = ext === 'nif' ? changeExtension(xform, 'kf').path : xform;
  return exists(probe) ? xform : path;
}

export function decodeTga(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 18) throw new Error('decodeTga: not a TGA file');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const idLength = bytes[0];
  const colorMapType = bytes[1];
  const imageType = bytes[2];
  const mapStart = dv.getUint16(3, true);
  const mapLength = dv.getUint16(5, true);
  const mapDepth = bytes[7];
  const width = dv.getUint16(12, true);
  const height = dv.getUint16(14, true);
  const depth = bytes[16];
  const descriptor = bytes[17];
  const baseType = imageType & 7;
  const rle = (imageType & 8) !== 0;
  if (baseType < 1 || baseType > 3 || !width || !height) throw new Error('decodeTga: unsupported image type');
  let off = 18 + idLength;
  const mapBpp = (mapDepth + 7) >> 3;
  const palette = colorMapType === 1 ? bytes.subarray(off, off + mapLength * mapBpp) : null;
  if (colorMapType === 1) off += mapLength * mapBpp;
  const bpp = (depth + 7) >> 3;
  const rgba = new Uint8Array(width * height * 4);
  const putBgr = (o, src, at, nb) => {
    if (nb === 1) { rgba[o] = rgba[o + 1] = rgba[o + 2] = src[at]; rgba[o + 3] = 255; return; }
    if (nb === 2) {
      const px = src[at] | (src[at + 1] << 8);
      rgba[o] = ((px >> 10) & 31) * 255 / 31;
      rgba[o + 1] = ((px >> 5) & 31) * 255 / 31;
      rgba[o + 2] = (px & 31) * 255 / 31;
      rgba[o + 3] = 255;
      return;
    }
    rgba[o] = src[at + 2]; rgba[o + 1] = src[at + 1]; rgba[o + 2] = src[at];
    rgba[o + 3] = nb === 4 ? src[at + 3] : 255;
  };
  const putPixel = (i, src, at) => {
    const x = i % width;
    const yRow = (i / width) | 0;
    const y = (descriptor & 0x20) ? yRow : height - 1 - yRow;
    const o = (y * width + x) * 4;
    if (baseType === 1) {
      const idx = (bpp === 2 ? (src[at] | (src[at + 1] << 8)) : src[at]) - mapStart;
      putBgr(o, palette, idx * mapBpp, mapBpp);
    } else if (baseType === 3) {
      rgba[o] = rgba[o + 1] = rgba[o + 2] = src[at];
      rgba[o + 3] = bpp >= 2 ? src[at + 1] : 255;
    } else putBgr(o, src, at, bpp);
  };
  const count = width * height;
  if (!rle) {
    for (let i = 0; i < count; i++) putPixel(i, bytes, off + i * bpp);
  } else {
    let i = 0;
    while (i < count && off < bytes.length) {
      const packet = bytes[off++];
      const n = (packet & 127) + 1;
      if (packet & 128) {
        for (let k = 0; k < n && i < count; k++) putPixel(i++, bytes, off);
        off += bpp;
      } else {
        for (let k = 0; k < n && i < count; k++) { putPixel(i++, bytes, off); off += bpp; }
      }
    }
  }
  return { width, height, mips: [{ width, height, rgba }] };
}

export function decodeBmp(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 54 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) {
    throw new Error('decodeBmp: not a BMP file');
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dataOff = dv.getUint32(10, true);
  const headerSize = dv.getUint32(14, true);
  const width = dv.getInt32(18, true);
  const rawH = dv.getInt32(22, true);
  const height = Math.abs(rawH);
  const bpp = dv.getUint16(28, true);
  const compression = dv.getUint32(30, true);
  if (compression !== 0 || (bpp !== 8 && bpp !== 24 && bpp !== 32) || !width || !height) {
    throw new Error('decodeBmp: unsupported BMP format');
  }
  const palOff = 14 + headerSize;
  const stride = ((width * bpp + 31) >> 5) << 2;
  const rgba = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    const y = rawH > 0 ? height - 1 - row : row;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (bpp === 8) {
        const p = palOff + bytes[dataOff + row * stride + x] * 4;
        rgba[o] = bytes[p + 2]; rgba[o + 1] = bytes[p + 1]; rgba[o + 2] = bytes[p]; rgba[o + 3] = 255;
      } else {
        const at = dataOff + row * stride + x * (bpp >> 3);
        rgba[o] = bytes[at + 2]; rgba[o + 1] = bytes[at + 1]; rgba[o + 2] = bytes[at];
        rgba[o + 3] = bpp === 32 ? bytes[at + 3] : 255;
      }
    }
  }
  return { width, height, mips: [{ width, height, rgba }] };
}

// `correctResourcePath` can return the authored .tga or .bmp path when no .dds exists, so the decoder is chosen by
// extension rather than assuming DDS.
export function decodeTextureImage(path, bytes, { levels = Infinity } = {}) {
  const p = String(path || '');
  const dot = p.lastIndexOf('.');
  let ext = dot >= 0 ? p.slice(dot + 1).toLowerCase() : '';
  if (ext === 'targa') ext = 'tga';
  if (ext === 'dds') return decodeDds(bytes, { levels });
  if (ext === 'tga') return decodeTga(bytes);
  if (ext === 'bmp') return decodeBmp(bytes);
  throw new Error(`no decoder for ".${ext}"`);
}
