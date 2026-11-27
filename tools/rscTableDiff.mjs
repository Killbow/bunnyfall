#!/usr/bin/env node
// Lists TEXT.RSC records whose text differs between vendor/dfu-text/Internal_RSC.csv and a real ARENA2.
// Run: ARENA2_PATH=... node tools/rscTableDiff.mjs [record ...]

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextRsc } from '../src/formats/textRsc.js';
import { INTERNAL_RSC, parseRscMarkup, parseRscCsv } from '../src/formats/rscTable.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARENA2 = process.env.ARENA2_PATH;
if (!ARENA2 || !existsSync(join(ARENA2, 'TEXT.RSC'))) {
  console.error('ARENA2_PATH must name a folder holding TEXT.RSC');
  process.exit(2);
}

const table = parseRscCsv(readFileSync(join(ROOT, 'vendor/dfu-text/Internal_RSC.csv'), 'utf8'));
// Load the file alone so the census never reads the carried table rows back as the file's own.
const file = new TextRsc().load(new Uint8Array(readFileSync(join(ARENA2, 'TEXT.RSC'))), { table: null });

const norm = (vs) => vs.map((v) => v.replace(/[ \n]+$/g, '').replace(/^[ \n]+/g, ''));
const only = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
const ids = only.length ? only : [...new Set([...table.keys(), ...[...Array(20000).keys()].filter((i) => file.hasRecord(i))])].sort((a, b) => a - b);

let differ = 0, missingInFile = 0, missingInTable = 0, carried = 0;
for (const id of ids) {
  const t = table.has(id) ? norm(parseRscMarkup(table.get(id))) : null;
  const f = file.hasRecord(id) ? norm(file.plainText(id)) : null;
  if (!t) { missingInTable++; if (only.length) console.log(`${id}: not in the table`); continue; }
  if (!f) { missingInFile++; if (only.length) console.log(`${id}: not in TEXT.RSC`); continue; }
  const same = t.length === f.length && t.every((v, i) => v === f[i]);
  if (same && !only.length) continue;
  differ += same ? 0 : 1;
  const mark = INTERNAL_RSC[id] ? ' (carried)' : '';
  if (INTERNAL_RSC[id]) carried++;
  console.log(`${id}${mark}: ${same ? 'same' : `DIFFERS - table ${t.length} variant(s), file ${f.length}`}`);
  if (only.length || !same) {
    const n = Math.max(t.length, f.length);
    for (let i = 0; i < n; i++) {
      if (t[i] === f[i] && !only.length) continue;
      console.log(`    table[${i}]: ${JSON.stringify(t[i] ?? null)}`);
      console.log(`    file [${i}]: ${JSON.stringify(f[i] ?? null)}`);
    }
  }
}
console.log(`${differ} record(s) differ (${carried} carried), ${missingInFile} only in the table, ${missingInTable} only in TEXT.RSC`);
process.exit(differ > carried ? 1 : 0);
