// Vendors the World Tooltips bundle's text assets (C# source, settings, and manifest) into vendor/world-tooltips.
// Run: node tools/worldTooltipsAssets.mjs <path>/"world tooltips.dfmod" [outDir].
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readUnityBundle } from '../src/formats/unityBundle.js';
import { isMain } from './lib/isMain.mjs';

export const WORLD_TOOLTIPS_ASSETS = Object.freeze({
  'Modded_HUDTooltipWindow.cs': 'Scripts/Modded_HUDTooltipWindow.cs',
  'modsettings': 'modsettings.json',
  'tooltip.dfmod': 'tooltip.dfmod.json',
});

export function readWorldTooltips(bytes) {
  const bundle = readUnityBundle(bytes);
  return bundle.textAssets.map((t) => ({
    name: t.name,
    path: WORLD_TOOLTIPS_ASSETS[t.name] ?? null,
    body: typeof t.text === 'string' ? t.text : Buffer.from(t.bytes ?? []).toString('utf8'),
  }));
}

if (isMain(import.meta.url)) {
  const src = process.argv[2];
  if (!src) { console.error('usage: node tools/worldTooltipsAssets.mjs <world tooltips.dfmod> [outDir]'); process.exit(1); }
  const outDir = process.argv[3] ?? fileURLToPath(new URL('../vendor/world-tooltips/', import.meta.url));
  const assets = readWorldTooltips(readFileSync(src));
  for (const a of assets) {
    const sha = createHash('sha256').update(a.body).digest('hex');
    if (!a.path) { console.log(`  (unmapped) ${a.name}  ${a.body.length} chars  ${sha}`); continue; }
    const dest = `${outDir.replace(/\/$/, '')}/${a.path}`;
    mkdirSync(dest.slice(0, dest.lastIndexOf('/')), { recursive: true });
    writeFileSync(dest, a.body);
    console.log(`  ${a.path}  ${a.body.length} chars  ${sha}`);
  }
}
