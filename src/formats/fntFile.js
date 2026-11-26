// Glyph 0 is ASCII 33 ('!'), and codes below that advance as spaces, as in DaggerfallFont.

export const FNT_GLYPH_COUNT = 240;
export const FNT_GLYPH_BYTES = 32;
export const FNT_GLYPH_DIM = 16;
export const FNT_ASCII_START = 33;
export const FNT_GLYPH_SPACING = 1;

export class FntFile {
  load(bytes) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.fixedWidth = v.getUint16(0, true);
    this.fixedHeight = v.getUint16(2, true);
    this.glyphs = [];
    let o = 4;
    for (let i = 0; i < FNT_GLYPH_COUNT; i++) {
      const dataOffset = v.getUint16(o, true);
      const width = v.getUint16(o + 2, true);
      o += 4;
      this.glyphs.push({ width, data: bytes.subarray(dataOffset, dataOffset + FNT_GLYPH_BYTES) });
    }
    return this;
  }

  getGlyphPixels(index, colorIndex = 127) {
    if (index < 0 || index >= FNT_GLYPH_COUNT) return null;
    const g = this.glyphs[index];
    const out = new Uint8Array(FNT_GLYPH_DIM * FNT_GLYPH_DIM);
    const expand = (byte, row, off) => {
      let bit = 1;
      for (let i = 7; i >= 0; i--) {
        if (byte & bit) out[row * FNT_GLYPH_DIM + off + i] = colorIndex;
        bit <<= 1;
      }
    };
    for (let y = 0; y < FNT_GLYPH_DIM; y++) {
      // Each row takes its left 8 pixels from the odd byte and its right 8 from the even byte, as in DFU.
      expand(g.data[y * 2 + 1], y, 0);
      expand(g.data[y * 2], y, 8);
    }
    return out;
  }

  glyphWidth(index) {
    return index >= 0 && index < FNT_GLYPH_COUNT ? this.glyphs[index].width : 0;
  }
}
