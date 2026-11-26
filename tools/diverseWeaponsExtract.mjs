// Writes Diverse Weapons' textures from the shipped bundle to public/art/diverse-weapons/ under DFU's names.
// Run: node tools/diverseWeaponsExtract.mjs "<path>/diverse weapons.dfmod".

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readUnityBundle } from '../src/formats/unityBundle.js';
import { readPng, writePng, writeIndexedPng } from './pngIO.mjs';
import { MANIFEST, manifestSpriteNames } from './diverseWeaponsIndex.mjs';
import { isMain } from './lib/isMain.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_DIR = 'public/art/diverse-weapons';

export function encodeSprite(img) {
  const indexed = writeIndexedPng(img);
  return { png: indexed ?? writePng(img), indexed: !!indexed };
}

export function sameOnScreen(a, b) {
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let p = 0; p < a.data.length; p += 4) {
    const hidden = a.data[p + 3] === 0;
    if (hidden !== (b.data[p + 3] === 0)) return false;
    if (hidden) continue;
    if (a.data[p] !== b.data[p] || a.data[p + 1] !== b.data[p + 1] || a.data[p + 2] !== b.data[p + 2] || a.data[p + 3] !== b.data[p + 3]) return false;
  }
  return true;
}

if (isMain(import.meta.url)) {
  const src = process.argv[2];
  if (!src) { console.error('usage: node tools/diverseWeaponsExtract.mjs "<diverse weapons.dfmod>"'); process.exit(2); }
  const t0 = Date.now();
  const bundle = readUnityBundle(new Uint8Array(readFileSync(src)));
  const manifest = bundle.textAssets.map((t) => { try { return JSON.parse(t.text); } catch { return null; } }).find((m) => m?.GUID);
  const vendored = JSON.parse(readFileSync(join(ROOT, MANIFEST), 'utf8'));
  if (manifest?.GUID !== vendored.GUID) throw new Error(`the bundle is ${manifest?.ModTitle} (${manifest?.GUID}); the port carries ${vendored.ModTitle} (${vendored.GUID})`);
  if (String(manifest.ModVersion) !== String(vendored.ModVersion)) console.warn(`the bundle is version ${manifest.ModVersion}; the vendored manifest is ${vendored.ModVersion} - vendor the new manifest and re-run tools/diverseWeaponsIndex.mjs`);
  console.log(`opened ${manifest.ModTitle} ${manifest.ModVersion}: ${bundle.textures.length} textures in ${Date.now() - t0} ms`);

  const allowed = new Set(manifestSpriteNames(readFileSync(join(ROOT, MANIFEST), 'utf8')));
  const out = join(ROOT, OUT_DIR);
  mkdirSync(out, { recursive: true });
  for (const f of readdirSync(out)) if (/\.png$/i.test(f)) unlinkSync(join(out, f));

  const written = new Set();
  const strangers = [];
  let bytes = 0, raw = 0, dups = 0, indexed = 0;
  for (const t of bundle.textures) {
    if (written.has(t.name)) { dups++; continue; }
    if (!allowed.has(t.name)) { strangers.push(t.name); continue; }
    const img = t.rgba();
    const { png, indexed: isIndexed } = encodeSprite(img);
    if (!sameOnScreen(img, readPng(png))) throw new Error(`${t.name}: the PNG read back differs from the texel`);
    writeFileSync(join(out, `${t.name}.png`), png);
    written.add(t.name);
    bytes += png.length; raw += img.data.length; indexed += isIndexed ? 1 : 0;
  }
  const missing = [...allowed].filter((n) => !written.has(n)).sort();
  console.log(`wrote ${written.size} PNGs (${indexed} indexed, ${written.size - indexed} RGBA): ${(raw / 1e6).toFixed(0)} MB of texels as ${(bytes / 1e6).toFixed(1)} MB on disk; ${dups} duplicate names skipped; ${Date.now() - t0} ms`);
  if (strangers.length) console.warn(`${strangers.length} textures the manifest does not name were NOT written:`, strangers.slice(0, 10).join(', '), strangers.length > 10 ? '...' : '');
  if (missing.length) console.warn(`${missing.length} manifest names the bundle does not carry (the door will 404 once each if asked):`, missing.slice(0, 10).join(', '), missing.length > 10 ? '...' : '');
}
