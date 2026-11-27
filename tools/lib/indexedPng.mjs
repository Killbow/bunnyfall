// Writes an RGBA picture of at most 256 colors as an indexed PNG, which pngjs cannot write.
// The palette is the picture's colors in ascending RGBA order, so the file depends only on the pixels.

import zlib from 'node:zlib';

const crc32 = (b) => zlib.crc32(b) >>> 0;

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  Buffer.from(data.buffer, data.byteOffset, data.length).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** @returns {number[]} */
export function pictureColours({ width, height, data }) {
  const set = new Set();
  for (let i = 0; i < width * height * 4; i += 4) set.add(((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0);
  return [...set].sort((a, b) => a - b);
}

/** @param {number[]} [palette] */
export function encodeIndexedPng(pic, palette = pictureColours(pic)) {
  const { width, height, data } = pic;
  if (palette.length > 256) throw new Error(`indexed PNG: ${palette.length} colours (at most 256)`);
  const index = new Map(palette.map((c, i) => [c, i]));
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const c = ((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0;
      const k = index.get(c);
      if (k === undefined) throw new Error(`indexed PNG: the colour ${c.toString(16).padStart(8, '0')} at ${x},${y} is not in the palette`);
      raw[y * (width + 1) + 1 + x] = k;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 3; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const plte = Buffer.alloc(palette.length * 3);
  const trns = Buffer.alloc(palette.length);
  palette.forEach((c, i) => { plte[i * 3] = c >>> 24; plte[i * 3 + 1] = (c >>> 16) & 255; plte[i * 3 + 2] = (c >>> 8) & 255; trns[i] = c & 255; });
  let lastOpaque = trns.length;
  // tRNS may stop at the last entry that is not opaque.
  while (lastOpaque > 0 && trns[lastOpaque - 1] === 255) lastOpaque--;
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('PLTE', plte)];
  if (lastOpaque > 0) parts.push(chunk('tRNS', trns.subarray(0, lastOpaque)));
  parts.push(chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}
