// Endpoint interpolation truncates, as in ((2 * a + b) / 3), to match the common reference decoders. Unity stores
// block rows bottom-up, and the caller flips the result.

function rgb565(v) {
  const r = (v >>> 11) & 31;
  const g = (v >>> 5) & 63;
  const b = v & 31;
  return [(r << 3) | (r >>> 2), (g << 2) | (g >>> 4), (b << 3) | (b >>> 2)];
}

function colourBlock(src, off, out, width, height, x0, y0, dxt1) {
  const c0 = src[off] | (src[off + 1] << 8);
  const c1 = src[off + 2] | (src[off + 3] << 8);
  const p0 = rgb565(c0);
  const p1 = rgb565(c1);
  const pal = [p0, p1, [0, 0, 0], [0, 0, 0]];
  const alpha = [255, 255, 255, 255];
  if (!dxt1 || c0 > c1) {
    for (let i = 0; i < 3; i++) {
      pal[2][i] = Math.trunc((2 * p0[i] + p1[i]) / 3);
      pal[3][i] = Math.trunc((p0[i] + 2 * p1[i]) / 3);
    }
  } else {
    for (let i = 0; i < 3; i++) pal[2][i] = (p0[i] + p1[i]) >>> 1;
    alpha[3] = 0;
  }
  for (let y = 0; y < 4; y++) {
    const row = src[off + 4 + y];
    for (let x = 0; x < 4; x++) {
      const px = x0 + x;
      const py = y0 + y;
      if (px >= width || py >= height) continue;
      const sel = (row >>> (x * 2)) & 3;
      const o = (py * width + px) * 4;
      out[o] = pal[sel][0];
      out[o + 1] = pal[sel][1];
      out[o + 2] = pal[sel][2];
      out[o + 3] = alpha[sel];
    }
  }
}

function alphaBlock(src, off, out, width, height, x0, y0) {
  const a0 = src[off];
  const a1 = src[off + 1];
  const pal = new Array(8);
  pal[0] = a0;
  pal[1] = a1;
  if (a0 > a1) {
    for (let i = 1; i <= 6; i++) pal[i + 1] = Math.trunc(((7 - i) * a0 + i * a1) / 7);
  } else {
    for (let i = 1; i <= 4; i++) pal[i + 1] = Math.trunc(((5 - i) * a0 + i * a1) / 5);
    pal[6] = 0;
    pal[7] = 255;
  }
  const lo = src[off + 2] | (src[off + 3] << 8) | (src[off + 4] << 16);
  const hi = src[off + 5] | (src[off + 6] << 8) | (src[off + 7] << 16);
  for (let t = 0; t < 16; t++) {
    const sel = t < 8 ? (lo >>> (t * 3)) & 7 : (hi >>> ((t - 8) * 3)) & 7;
    const px = x0 + (t & 3);
    const py = y0 + (t >>> 2);
    if (px >= width || py >= height) continue;
    out[(py * width + px) * 4 + 3] = pal[sel];
  }
}

/**
 * @param {Uint8Array} src
 * @param {number} width
 * @param {number} height
 * @param {boolean} dxt5
 * @returns {Uint8Array}
 */
export function dxtDecode(src, width, height, dxt5) {
  const out = new Uint8Array(width * height * 4);
  const bw = (width + 3) >>> 2;
  const bh = (height + 3) >>> 2;
  const blockBytes = dxt5 ? 16 : 8;
  if (src.length < bw * bh * blockBytes) throw new Error(`dxt: ${src.length} bytes for ${bw}x${bh} blocks of ${blockBytes}`);
  let off = 0;
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      if (dxt5) {
        colourBlock(src, off + 8, out, width, height, bx * 4, by * 4, false);
        alphaBlock(src, off, out, width, height, bx * 4, by * 4);
      } else {
        colourBlock(src, off, out, width, height, bx * 4, by * 4, true);
      }
      off += blockBytes;
    }
  }
  return out;
}
