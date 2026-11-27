
import { applyPortChannels } from '../world/portChannels.js';
export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 500;
const MAP_BUFFER_LENGTH = MAP_WIDTH * MAP_HEIGHT;

export class WoodsFile {
  static portChannels = false;

  constructor() {
    this.loaded = false;
    this.header = null;
    this.dataOffsets = null;
    this.heightMapBuffer = null;
    this._bytes = null;
    this._view = null;
  }

  /**
   * @param {Uint8Array} bytes
   * @returns {boolean}
   */
  load(bytes) {
    try {
      this._bytes = bytes;
      this._view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      this._readHeader();
      this._readDataOffsets();
      this._readHeightMap();
      if (WoodsFile.portChannels) applyPortChannels(this.heightMapBuffer);
      this.loaded = true;
      return true;
    } catch {
      this.loaded = false;
      return false;
    }
  }

  _readHeader() {
    const v = this._view;
    this.header = {
      offsetSize: v.getUint32(0, true),
      width: v.getUint32(4, true),
      height: v.getUint32(8, true),
      nullValue1: v.getUint32(12, true),
      dataSection1Offset: v.getUint32(16, true),
      unknown1: v.getUint32(20, true),
      unknown2: v.getUint32(24, true),
      heightMapOffset: v.getUint32(28, true),
    };
  }

  _readDataOffsets() {
    if (this.header.width * this.header.height !== MAP_BUFFER_LENGTH) {
      throw new Error('Invalid WOODS.WLD Width*Height result from Header.');
    }
    const v = this._view;
    const offsets = new Uint32Array(MAP_BUFFER_LENGTH);
    let pos = 32 + 28 * 4;
    for (let i = 0; i < MAP_BUFFER_LENGTH; i++, pos += 4) {
      offsets[i] = v.getUint32(pos, true);
    }
    this.dataOffsets = offsets;
  }

  _readHeightMap() {
    const start = this.header.heightMapOffset;
    this.heightMapBuffer = this._bytes.slice(start, start + MAP_BUFFER_LENGTH);
  }

  /**
   * `_readHeightMap` copies the height map, and the terrain workers build their own WoodsFile from the raw bytes. A
   * startup repair must be written back here or the two sample different heights.
   * @returns {boolean}
   */
  syncHeightMapBytes() {
    if (!this.loaded || !this._bytes || !this.heightMapBuffer) return false;
    this._bytes.set(this.heightMapBuffer, this.header.heightMapOffset);
    return true;
  }

  /**
   * @param {number} mapPixelX
   * @param {number} mapPixelY
   * @returns {number}
   */
  getHeightMapValue(mapPixelX, mapPixelY) {
    if (mapPixelX < 0) mapPixelX = 0;
    if (mapPixelX >= MAP_WIDTH - 1) mapPixelX = MAP_WIDTH - 1;
    if (mapPixelY < 0) mapPixelY = 0;
    if (mapPixelY >= MAP_HEIGHT - 1) mapPixelY = MAP_HEIGHT - 1;
    return this.heightMapBuffer[mapPixelY * MAP_WIDTH + mapPixelX];
  }

  getHeightMapValuesRange1Dim(mapPixelX, mapPixelY, dim) {
    const dst = new Uint8Array(dim * dim);
    for (let y = 0; y < dim; y++) {
      for (let x = 0; x < dim; x++) {
        dst[x + y * dim] = this.getHeightMapValue(mapPixelX + x, mapPixelY + y);
      }
    }
    return dst;
  }

  getLargeMapData(mapPixelX, mapPixelY) {
    if (mapPixelX < 0) mapPixelX = 0;
    if (mapPixelX >= MAP_WIDTH - 1) mapPixelX = MAP_WIDTH - 1;
    if (mapPixelY < 0) mapPixelY = 0;
    if (mapPixelY >= MAP_HEIGHT - 1) mapPixelY = MAP_HEIGHT - 1;
    const pos = this.dataOffsets[mapPixelY * MAP_WIDTH + mapPixelX] + 22;
    const data = [];
    for (let x = 0; x < 5; x++) data.push(new Uint8Array(5));
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        data[x][y] = this._bytes[pos + y * 5 + x];
      }
    }
    return data;
  }

  // DFU parity: each 5x5 cell is trimmed to its interior 3x3, sample Y is inverted (`4 - iy`), and source map Y
  // descends. Output is row-major over a `dim * 3` square.
  getLargeHeightMapValuesRange(mapPixelX, mapPixelY, dim) {
    const offsetx = 1;
    const offsety = 1;
    const len = 3;
    const side = dim * len;
    const dst = new Uint8Array(side * side);
    for (let y = 0; y < dim; y++) {
      for (let x = 0; x < dim; x++) {
        const src = this.getLargeMapData(mapPixelX + x, mapPixelY - y);
        const startX = x * len;
        const startY = y * len;
        for (let iy = offsety; iy < offsety + len; iy++) {
          for (let ix = offsetx; ix < offsetx + len; ix++) {
            dst[(startY + iy - offsety) * side + (startX + ix - offsetx)] = src[ix][4 - iy];
          }
        }
      }
    }
    return dst;
  }
}
