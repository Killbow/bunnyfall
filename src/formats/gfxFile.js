
const IS_RLE_ENCODED = 0x8000;

export class GfxFile {
  load(bytes, fileName = '') {
    if (!fileName.toUpperCase().endsWith('.GFX')) return false;
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.frameCount = v.getInt16(0, true);
    this.width = v.getInt16(2, true);
    this.height = v.getInt16(4, true);
    this.pixelDataLength = v.getInt16(6, true);

    const rowCount = this.height * this.frameCount;
    const rows = new Array(rowCount);
    let o = 14;
    for (let i = 0; i < rowCount; i++, o += 4) {
      rows[i] = { offset: v.getUint16(o, true), rle: v.getUint16(o + 2, true) === IS_RLE_ENCODED };
    }

    this.frames = [];
    for (let frame = 0; frame < this.frameCount; frame++) {
      const data = new Uint8Array(this.pixelDataLength);
      let dst = 0;
      const rowStart = this.height * frame;
      for (let rowIndex = 0; rowIndex < this.height; rowIndex++) {
        const row = rows[rowStart + rowIndex];
        let p = row.offset;
        if (row.rle) {
          let rowPos = 0;
          const rowWidth = v.getUint16(p, true);
          p += 2;
          do {
            let probe = v.getInt16(p, true);
            p += 2;
            if (probe < 0) {
              probe = -probe;
              const pixel = bytes[p++];
              for (let i = 0; i < probe; i++) { data[dst++] = pixel; rowPos++; }
            } else if (probe > 0) {
              data.set(bytes.subarray(p, p + probe), dst);
              dst += probe; p += probe; rowPos += probe;
            }
          } while (rowPos < rowWidth);
        } else {
          data.set(bytes.subarray(p, p + this.width), dst);
          dst += this.width;
        }
      }
      this.frames.push({ width: this.width, height: this.height, data });
    }
    return true;
  }

  getFrameCount() { return this.frameCount; }
  getDFBitmap(record = 0, frame = 0) { return record === 0 ? this.frames[frame] : null; }
}
