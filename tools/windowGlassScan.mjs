#!/usr/bin/env node
// Prints the window wall of each interior building texture set and the glass texels the interior glass rule finds.
// Run: node tools/windowGlassScan.mjs /path/to/ARENA2 [--all]; --all also lists every record using the glass index.
// Reads the local ARENA2 files and writes nothing.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { isMain } from './lib/isMain.mjs';
import { TextureFile } from '../src/formats/textureFile.js';
import { isInteriorGlassArchive, interiorWindowOf, interiorGlassMask, GLASS_INDEX } from '../src/world/interiorGlass.js';

export function windowOfArchive(tf, archive) {
  const win = interiorWindowOf(archive);
  if (!win || win.record >= tf.recordCount) return null;
  const bm = tf.getDFBitmap(win.record, 0);
  const mask = interiorGlassMask(archive, win.record, bm, (r) => (r < tf.recordCount ? tf.getDFBitmap(r, 0) : null));
  let n = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  if (mask) for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) {
    if (mask.colors[(y * mask.width + x) * 4] < 128) continue;
    n++;
    // The mask rows run bottom-up, and the box uses the bitmap's top-down rows.
    const yy = mask.height - 1 - y;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy;
  }
  return { archive, record: win.record, twin: win.twin, width: bm.width, height: bm.height, glass: n, share: n / (bm.width * bm.height), box: n ? [x0, y0, x1, y1] : null };
}

export function glassIndexRecords(tf) {
  const out = [];
  for (let r = 0; r < tf.recordCount; r++) {
    const d = tf.getDFBitmap(r, 0)?.data;
    if (!d) continue;
    let n = 0;
    for (let i = 0; i < d.length; i++) if (d[i] === GLASS_INDEX) n++;
    if (n) out.push({ record: r, count: n });
  }
  return out;
}

if (isMain(import.meta.url)) {
  const dir = process.argv[2];
  const all = process.argv.includes('--all');
  if (!dir || !existsSync(dir)) {
    console.log('usage: node tools/windowGlassScan.mjs /path/to/ARENA2 [--all]');
    process.exit(2);
  }
  const archives = readdirSync(dir).map((f) => /^TEXTURE\.(\d{3})$/i.exec(f)).filter(Boolean).map((m) => Number(m[1])).filter(isInteriorGlassArchive).sort((a, b) => a - b);
  let found = 0;
  for (const archive of archives) {
    const tf = new TextureFile();
    const name = `TEXTURE.${String(archive).padStart(3, '0')}`;
    if (!tf.load(new Uint8Array(readFileSync(join(dir, name))), name)) { console.log(`${name}: did not load`); continue; }
    const w = windowOfArchive(tf, archive);
    if (!w) console.log(`${name}  no window wall in this set`);
    else {
      if (w.glass) found++;
      console.log(`${name} #${w.record} (twin #${w.twin})  ${w.width}x${w.height}  glass ${String(w.glass).padStart(5)} (${(w.share * 100).toFixed(1).padStart(5)}%)${w.box ? `  box ${w.box.join(',')}` : '  NONE FOUND'}`);
    }
    if (all) for (const g of glassIndexRecords(tf)) console.log(`    #${g.record} carries 0xff x${g.count}`);
  }
  console.log(`${found} of ${archives.length} building interior archive(s) have glass the rule finds`);
}
