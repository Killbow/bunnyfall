// BUNNYFALL FARM EXPANSION (docs/FARM-EXPANSION.md): A CONTACT SHEET of Daggerfall's sprite archives, so the farm's art
// can be chosen by eye. Each record's first frame is drawn on a grid, labelled with its record number and its frame
// count, one PNG per archive. Colours come from ART_PAL.COL in the same folder; without it the sheet is drawn in grey
// (index brightness), which is enough to tell shapes apart.
//
//   node tools/farmArtSheet.mjs <arena2 dir> <out dir> [archive ...]
//   node tools/farmArtSheet.mjs $ARENA2_PATH /tmp/sheets 201 205 211 213 214
//
// The game's files are read, never copied: the sheets are for looking at and stay out of the repo.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { TextureFile, texName } from '../src/formats/textureFile.js';
import { DFPalette } from '../src/formats/dfPalette.js';

const [dir, out = '.', ...wanted] = process.argv.slice(2);
if (!dir) { console.log('usage: node tools/farmArtSheet.mjs <arena2 dir> <out dir> [archive ...]'); process.exit(1); }
const archives = wanted.length ? wanted.map(Number) : [201, 205, 211, 212, 213, 214, 254, 301, 302];
mkdirSync(out, { recursive: true });

let palette = null;
const palPath = join(dir, 'ART_PAL.COL');
if (existsSync(palPath)) { palette = new DFPalette(); palette.load(new Uint8Array(readFileSync(palPath)), 'ART_PAL.COL'); }
const rgbOf = (i) => {
  if (!palette) return [i, i, i];
  const b = palette.paletteBuffer, o = palette.headerLength + i * 3;
  return [b[o], b[o + 1], b[o + 2]];
};

// A 3x5 digit font for the labels.
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
  '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
const CELL = 140, LABEL = 9, SCALE_MAX = 2;

function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

for (const archive of archives) {
  const name = texName(archive), path = join(dir, name);
  if (!existsSync(path)) { console.log(`${name}: not found, skipped`); continue; }
  const tex = new TextureFile();
  if (!tex.load(new Uint8Array(readFileSync(path)), name, palette)) { console.log(`${name}: could not be read`); continue; }
  const n = tex.recordCount, cols = Math.min(8, n), rows = Math.ceil(n / cols);
  const W = cols * CELL, H = rows * (CELL + LABEL), img = Buffer.alloc(W * H * 3, 0);
  for (let i = 0; i < img.length; i += 3) { img[i] = 255; img[i + 1] = 0; img[i + 2] = 255; }   // magenta ground: transparent
  const put = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 3; img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; };
  const text = (s, x, y) => { for (const ch of s) { const d = DIGITS[Number(ch)]; if (d) for (let p = 0; p < 15; p++) if (d[p] === '1') put(x + (p % 3), y + Math.floor(p / 3), [255, 255, 255]); x += ch === ' ' ? 3 : 4; } };
  const lines = [];
  for (let r = 0; r < n; r++) {
    const bmp = tex.getDFBitmap(r, 0), frames = tex.getFrameCount(r);
    const cx = (r % cols) * CELL, cy = Math.floor(r / cols) * (CELL + LABEL);
    for (let x = cx; x < cx + CELL; x++) for (let y = cy; y < cy + LABEL; y++) put(x, y, [40, 40, 40]);
    text(`${r} ${frames}`, cx + 2, cy + 2);
    lines.push(`${archive}:${r} ${bmp.width}x${bmp.height} frames ${frames}`);
    if (!bmp.data || !bmp.width) continue;
    const s = Math.max(1, Math.min(SCALE_MAX, Math.floor((CELL - 4) / Math.max(bmp.width, bmp.height)))) || 1;
    const fit = Math.min(1, (CELL - 4) / (Math.max(bmp.width, bmp.height) * s));
    for (let y = 0; y < CELL - 4; y++) for (let x = 0; x < CELL - 4; x++) {
      const sx = Math.floor(x / (s * fit)), sy = Math.floor(y / (s * fit));
      if (sx >= bmp.width || sy >= bmp.height) continue;
      const idx = bmp.data[sy * bmp.width + sx];
      if (idx === 0) continue;
      put(cx + 2 + x, cy + LABEL + 2 + y, rgbOf(idx));
    }
  }
  writeFileSync(join(out, `${archive}.png`), png(W, H, img));
  writeFileSync(join(out, `${archive}.txt`), lines.join('\n') + '\n');
  console.log(`${name}: ${n} records -> ${join(out, `${archive}.png`)}`);
}
if (!palette) console.log('ART_PAL.COL not found: drawn in grey.');
