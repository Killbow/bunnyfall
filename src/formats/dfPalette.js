
export class DFPalette {
  constructor() {
    this._headerLength = 0;
    this._buffer = new Uint8Array(776);
    this.fill(0xff, 0, 0);
  }

  get paletteBuffer() {
    return this._buffer;
  }

  get headerLength() {
    return this._headerLength;
  }

  /**
   * @param {Uint8Array} bytes
   * @param {string} [fileName]
   * @returns {boolean}
   */
  load(bytes, fileName = '') {
    switch (bytes.byteLength) {
      case 768:
        this._headerLength = 0;
        break;
      case 776:
        this._headerLength = 8;
        break;
      default:
        return false;
    }

    this._buffer.fill(0);
    this._buffer.set(bytes, 0);

    // MAP.PAL stores 6-bit VGA values, so its channels scale by 4, keyed on the file name as in DFU.
    if (fileName === 'MAP.PAL') this.multiply(4);

    return true;
  }

  /** @returns {boolean} */
  readEmbedded(bytes, offset) {
    if (offset + 768 > bytes.byteLength) return false;
    this._buffer.set(bytes.subarray(offset, offset + 768), 8);
    this._headerLength = 8;
    return true;
  }

  fill(r, g, b) {
    let offset = this._headerLength;
    for (let i = 0; i < 256; i++) {
      this._buffer[offset++] = r;
      this._buffer[offset++] = g;
      this._buffer[offset++] = b;
    }
  }

  makeGrayscale() {
    let offset = this._headerLength;
    for (let i = 0; i < 256; i++) {
      this._buffer[offset++] = i;
      this._buffer[offset++] = i;
      this._buffer[offset++] = i;
    }
  }

  multiply(scale) {
    let offset = this._headerLength;
    for (let i = 0; i < 256; i++) {
      this._buffer[offset] = (this._buffer[offset] * scale) & 0xff;
      offset++;
      this._buffer[offset] = (this._buffer[offset] * scale) & 0xff;
      offset++;
      this._buffer[offset] = (this._buffer[offset] * scale) & 0xff;
      offset++;
    }
  }

  // Each AutoMap color index equals the BuildingTypes value plus 1.
  makeAutomap() {
    this.fill(69, 60, 40);

    this.set(12, 69, 125, 195);

    this.set(15, 69, 125, 195);

    this.set(16, 85, 117, 48);

    this.set(1, 190, 85, 24);
    this.set(3, 190, 85, 24);
    this.set(4, 190, 85, 24);
    this.set(6, 190, 85, 24);
    this.set(7, 190, 85, 24);
    this.set(8, 190, 85, 24);
    this.set(9, 190, 85, 24);
    this.set(10, 190, 85, 24);
    this.set(11, 190, 85, 24);
    this.set(13, 190, 85, 24);
    this.set(14, 190, 85, 24);

    this.set(0xfb, 0, 0, 0);
  }

  get(index) {
    const offset = this._headerLength + index * 3;
    return {
      r: this._buffer[offset],
      g: this._buffer[offset + 1],
      b: this._buffer[offset + 2],
    };
  }

  getRed(index) {
    return this._buffer[this._headerLength + index * 3];
  }

  getGreen(index) {
    return this._buffer[this._headerLength + index * 3 + 1];
  }

  getBlue(index) {
    return this._buffer[this._headerLength + index * 3 + 2];
  }

  set(index, r, g, b) {
    const offset = this._headerLength + index * 3;
    this._buffer[offset] = r;
    this._buffer[offset + 1] = g;
    this._buffer[offset + 2] = b;
  }

  /** @param {Uint8Array} data */
  setBuffer(data) {
    if (data.byteLength !== 768) {
      throw new Error('DFPalette: Invalid buffer length. Must be 768 bytes for direct set.');
    }
    this._headerLength = 0;
    this._buffer.set(data, 0);
  }

  find(r, g, b) {
    let offset = this._headerLength;
    for (let i = 0; i < 256; i++) {
      if (
        this._buffer[offset] === r &&
        this._buffer[offset + 1] === g &&
        this._buffer[offset + 2] === b
      ) {
        return i;
      }
      offset += 3;
    }
    return -1;
  }

  clone() {
    const p = new DFPalette();
    p._headerLength = this._headerLength;
    p._buffer.set(this._buffer);
    return p;
  }
}
