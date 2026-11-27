#!/usr/bin/env node
// Extracts Eye Of The Beholder.dll from the shipped .dfmod bundle and lists the bundle's text assets.
// Run: node tools/eotbIl.mjs "<path to>/eye of the beholder.dfmod" [outDir].

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readUnityBundle } from '../src/formats/unityBundle.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [src, outDir = join(root, 'vendor/eye-of-the-beholder')] = process.argv.slice(2);
if (!src) {
  console.error('usage: node tools/eotbIl.mjs "<...>/Mods/eye of the beholder.dfmod" [outDir]');
  process.exit(2);
}
const bundle = readUnityBundle(new Uint8Array(readFileSync(src)));
console.log(`textures ${bundle.textures.length}, text assets ${bundle.textAssets.length}`);
mkdirSync(outDir, { recursive: true });
let dlls = 0;
for (const t of bundle.textAssets) {
  const isPe = t.bytes[0] === 0x4d && t.bytes[1] === 0x5a;
  if (isPe) {
    const out = join(outDir, `${t.name.replace(/\.dll$/i, '')}.dll`);
    writeFileSync(out, t.bytes);
    console.log(`PE  ${t.name} ${t.bytes.length} bytes -> ${out}`);
    dlls += 1;
  } else if (/dfmod|json|xml/i.test(t.name)) {
    console.log(`txt ${t.name} ${t.bytes.length} bytes`);
  }
}
if (!dlls) { console.error('no PE text asset in the bundle'); process.exit(1); }
