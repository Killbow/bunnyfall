// A PAK file holds one u32 offset per row for 500 rows, each pointing at runs of {u16 count, u8 value} that expand
// to 1001 bytes.

export const PAK_WIDTH = 1001;
export const PAK_HEIGHT = 500;

export class PakFile {
  constructor() {
    this.buffer = new Uint8Array(PAK_WIDTH * PAK_HEIGHT);
    this._loaded = false;
  }

  get pakRowCount() {
    return PAK_HEIGHT;
  }

  get pakRowLength() {
    return PAK_WIDTH;
  }

  get loaded() {
    return this._loaded;
  }

  /**
   * @param {Uint8Array} bytes
   * @returns {boolean}
   */
  load(bytes) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let row = 0; row < PAK_HEIGHT; row++) {
      const offset = v.getUint32(row * 4, true);
      const bufferPos = PAK_WIDTH * row;
      let pos = offset;
      let rowPos = 0;
      while (rowPos < PAK_WIDTH) {
        const count = v.getUint16(pos, true);
        const value = bytes[pos + 2];
        pos += 3;
        for (let c = 0; c < count; c++) {
          this.buffer[bufferPos + rowPos++] = value;
        }
      }
    }
    this._loaded = true;
    return true;
  }

  getDFBitmap() {
    return { width: PAK_WIDTH, height: PAK_HEIGHT, data: this.buffer, palette: null };
  }

  getValue(x, y) {
    if (x < 0 || x >= PAK_WIDTH) return -1;
    if (y < 0 || y >= PAK_HEIGHT) return -1;
    return this.buffer[y * PAK_WIDTH + x];
  }

  setValue(x, y, value) {
    if (x < 0 || x >= PAK_WIDTH) return false;
    if (y < 0 || y >= PAK_HEIGHT) return false;
    this.buffer[y * PAK_WIDTH + x] = value;
    return true;
  }
}
