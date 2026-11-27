// Extracts the Readied Spellcasting Hands source text assets from its .dfmod bundle into vendor/.
// Run: node tools/readiedHandsAssets.mjs <path>/"readied spellcasting hands.dfmod" [outDir]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readUnityBundle } from '../src/formats/unityBundle.js';
import { isMain } from './lib/isMain.mjs';

export const READIED_HANDS_ASSETS = Object.freeze({
  'Modded_FPSSpellCasting_Ready.cs': 'Scripts/Modded_FPSSpellCasting_Ready.cs',
  'ModLoader.cs': 'Scripts/ModLoader.cs',
  'readiedSpellCastHand.dfmod': 'readiedSpellCastHand.dfmod.json',
});

export function readReadiedHands(bytes) {
  const bundle = readUnityBundle(bytes);
  return bundle.textAssets.map((t) => ({
    name: t.name,
    path: READIED_HANDS_ASSETS[t.name] ?? null,
    // Keep the raw bytes: TextDecoder drops a byte-order mark, and the printed sha256 must hash the file's bytes.
    body: t.bytes ? Buffer.from(t.bytes) : Buffer.from(t.text ?? '', 'utf8'),
  }));
}

if (isMain(import.meta.url)) {
  const src = process.argv[2];
  if (!src) { console.error('usage: node tools/readiedHandsAssets.mjs <readied spellcasting hands.dfmod> [outDir]'); process.exit(1); }
  const outDir = process.argv[3] ?? fileURLToPath(new URL('../vendor/readied-spellcasting-hands/', import.meta.url));
  const assets = readReadiedHands(readFileSync(src));
  for (const a of assets) {
    const sha = createHash('sha256').update(a.body).digest('hex');
    if (!a.path) { console.log(`  (unmapped) ${a.name}  ${a.body.length} chars  ${sha}`); continue; }
    const dest = `${outDir.replace(/\/$/, '')}/${a.path}`;
    mkdirSync(dest.slice(0, dest.lastIndexOf('/')), { recursive: true });
    writeFileSync(dest, a.body);
    console.log(`  ${a.path}  ${a.body.length} chars  ${sha}`);
  }
}
