#!/usr/bin/env node
// Extracts Horse Cart and Cargo's text assets, assemblies, and embedded PNGs from its .dfmod bundle.
// Run: node tools/hccAssets.mjs "<path to>/horse cart and cargo.dfmod" [outDir] (default: the vendored mod folder).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readUnityBundle } from '../src/formats/unityBundle.js';
import { readManifestResources } from '../src/formats/dotnetResources.js';
import { isMain } from './lib/isMain.mjs';

export const HCC_ASSETS = Object.freeze({
  'horse-cart-and-cargo.dfmod': 'horse-cart-and-cargo.dfmod.json',
  'modsettings': 'modsettings.json',
  'textdatabase': 'textdatabase.csv',
  'TrailingWagon.dll': 'TrailingWagon.dll',
  'HorseCartUiCompatibility.bytes': 'HorseCartUiCompatibility.dll',
});
export const RESOURCE_PREFIX = 'TrailingWagon.Horse.';
export const texturePath = (resourceName) => `Textures/${resourceName.startsWith(RESOURCE_PREFIX) ? resourceName.slice(RESOURCE_PREFIX.length) : resourceName}`;

export function readHccAssets(bundleBytes) {
  const bundle = readUnityBundle(bundleBytes);
  const out = [];
  for (const t of bundle.textAssets) {
    const bytes = t.bytes ?? new TextEncoder().encode(t.text ?? '');
    out.push({ name: t.name, path: HCC_ASSETS[t.name] ?? null, bytes });
    if (t.name === 'TrailingWagon.dll') for (const r of readManifestResources(bytes)) if (r.bytes) out.push({ name: r.name, path: texturePath(r.name), bytes: r.bytes });
  }
  return out;
}

if (isMain(import.meta.url)) {
  const src = process.argv[2];
  if (!src) { console.error('usage: node tools/hccAssets.mjs "<horse cart and cargo.dfmod>" [outDir]'); process.exit(1); }
  const outDir = process.argv[3] ?? fileURLToPath(new URL('../vendor/horse-cart-and-cargo/', import.meta.url));
  for (const a of readHccAssets(new Uint8Array(readFileSync(src)))) {
    const sha = createHash('sha256').update(a.bytes).digest('hex');
    if (!a.path) { console.log(`  (unmapped) ${a.name}  ${a.bytes.length} bytes  ${sha}`); continue; }
    const dest = `${outDir.replace(/\/$/, '')}/${a.path}`;
    mkdirSync(dest.slice(0, dest.lastIndexOf('/')), { recursive: true });
    writeFileSync(dest, a.bytes);
    console.log(`  ${a.path}  ${a.bytes.length} bytes  ${sha}`);
  }
}
