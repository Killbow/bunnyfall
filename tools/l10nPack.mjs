#!/usr/bin/env node
// Checks every bundled translation pack under locales/<tag>/pack/: PACK.json, the license, and the allowed files.
// PACK.json needs name, authors, source, license, and terms.
// Run: node tools/l10nPack.mjs (exit 1 on a problem).
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStringTableCsv } from '../src/ui/textManager.js';
import { classifyPackFile, PACK_KIND } from '../src/ui/translationPacks.js';
import { isMain } from './lib/isMain.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOOSE = /^(PACK\.json|LICEN[CS]E(\.[a-z]+)?|COPYING(\.[a-z]+)?|README(\.[a-z]+)?|CREDITS(\.[a-z]+)?)$/i;

const walk = (d, out = []) => {
  for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p, out); else out.push(p); }
  return out;
};

export function packMetaProblems(meta) {
  const out = [];
  if (!meta || typeof meta !== 'object') return ['PACK.json is not an object'];
  for (const k of ['name', 'source', 'license', 'terms']) if (typeof meta[k] !== 'string' || !meta[k].trim()) out.push(`PACK.json has no ${k}`);
  if (!Array.isArray(meta.authors) || !meta.authors.length || !meta.authors.every((a) => typeof a === 'string' && a.trim())) out.push('PACK.json names no authors');
  return out;
}

export function readBundledPack(code, root = ROOT) {
  const dir = join(root, 'locales', code, 'pack');
  if (!existsSync(dir)) return null;
  const problems = [];
  let meta = null;
  try { meta = JSON.parse(readFileSync(join(dir, 'PACK.json'), 'utf8')); } catch { problems.push('no readable PACK.json'); }
  problems.push(...(meta ? packMetaProblems(meta) : []));
  const licenseFile = meta?.licenseFile ?? 'LICENSE';
  if (!existsSync(join(dir, licenseFile))) problems.push(`no ${licenseFile} - the pack's own licence text is bundled beside it`);
  const out = { meta: meta ?? {}, tables: {}, quests: 0, books: 0, fonts: 0, problems };
  for (const path of walk(dir)) {
    const rel = relative(dir, path).split('\\').join('/');
    if (!rel.includes('/') && LOOSE.test(rel)) continue;
    const f = classifyPackFile(rel);
    if (!f) { problems.push(`${rel}: not text the game reads (a pack's textures and videos are Bethesda's, never bundled)`); continue; }
    if (f.kind === PACK_KIND.TABLE) out.tables[f.name] = parseStringTableCsv(readFileSync(path, 'utf8')).length;
    else if (f.kind === PACK_KIND.QUEST) out.quests++;
    else if (f.kind === PACK_KIND.BOOK) out.books++;
    else if (f.kind === PACK_KIND.FONT) out.fonts++;
  }
  return out;
}

export function bundledPacks(root = ROOT) {
  const dir = join(root, 'locales');
  const out = {};
  for (const code of readdirSync(dir)) {
    if (!statSync(join(dir, code)).isDirectory()) continue;
    const p = readBundledPack(code, root);
    if (p) out[code] = p;
  }
  return out;
}

if (isMain(import.meta.url)) {
  const packs = bundledPacks();
  let bad = 0;
  for (const [code, p] of Object.entries(packs)) {
    console.log(`${code}: ${p.meta.name ?? '?'} (${p.meta.license ?? '?'}) - ${Object.keys(p.tables).length} tables, ${p.quests} quests, ${p.books} books, ${p.fonts} fonts`);
    for (const x of p.problems) { console.error(`  ${x}`); bad++; }
  }
  if (!Object.keys(packs).length) console.log('no bundled packs (locales/<tag>/pack/) - every pack is a player\'s own install');
  process.exit(bad ? 1 : 0);
}
