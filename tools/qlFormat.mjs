#!/usr/bin/env node
// Rewrites the questline sheet and patch files under src/systems/questlines/ in their one-entry-per-line form.
// Run: node tools/qlFormat.mjs, or node tools/qlFormat.mjs --file <path> for one file.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './lib/isMain.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'systems', 'questlines');
export function formatFamily(data, key) {
  const head = `{\n  "family": ${JSON.stringify(data.family)},\n  "${key}": `;
  if (key === 'sheets') {
    const rows = data.sheets.map((s) => `    ${JSON.stringify(s)}`);
    return `${head}${rows.length ? `[\n${rows.join(',\n')}\n  ]` : '[]'}\n}\n`;
  }
  const rows = Object.entries(data.patches).map(([q, list]) => `    ${JSON.stringify(q)}: ${JSON.stringify(list)}`);
  return `${head}${rows.length ? `{\n${rows.join(',\n')}\n  }` : '{}'}\n}\n`;
}
export function formatAll() {
  for (const [dir, key] of [['sheets', 'sheets'], ['patches', 'patches']]) {
    for (const f of readdirSync(join(ROOT, dir))) {
      if (!f.endsWith('.json')) continue;
      const p = join(ROOT, dir, f);
    writeFileSync(p, formatFamily(JSON.parse(readFileSync(p, 'utf8')), key));
    }
  }
}
export function formatFile(path) {
  const key = /[\\/]patches[\\/]/.test(path) ? 'patches' : 'sheets';
  writeFileSync(path, formatFamily(JSON.parse(readFileSync(path, 'utf8')), key));
}
if (isMain(import.meta.url)) {
  const i = process.argv.indexOf('--file');
  if (i >= 0) formatFile(process.argv[i + 1]); else formatAll();
}
