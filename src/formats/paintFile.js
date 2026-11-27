// PAINT.DAT is a flat array of 40-byte records with no header or index. Each record holds four 10-byte slots of
// TEXT.RSC record offsets, ended by 0xFF when a slot has fewer than ten.

export const PAINT_RECORD_LENGTH = 40;

export class PaintFile {
  constructor(bytes = null) {
    this.data = null;
    if (bytes) this.load(bytes);
  }

  load(bytes) {
    this.data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    return true;
  }

  // Returns a copy because the painting reader in itemInfo.js patches the record it receives.
  read(recordIndex) {
    if (!this.data) return null;
    const at = recordIndex * PAINT_RECORD_LENGTH;
    if (at < 0 || at + PAINT_RECORD_LENGTH > this.data.length) return null;
    return this.data.slice(at, at + PAINT_RECORD_LENGTH);
  }
}
