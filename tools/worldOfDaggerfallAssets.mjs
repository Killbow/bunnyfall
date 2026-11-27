// Vendors World of Daggerfall from its extracted archive. The bundle's C# sources, manifest, and prefabs copy
// byte for byte, each region folder becomes one pack, and locations.json lists every source file.
// Run: node tools/worldOfDaggerfallAssets.mjs <archive root> [outDir]; the root holds Mods/ and Locations/.
// The default outDir is vendor/world-of-daggerfall.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readUnityBundle } from '../src/formats/unityBundle.js';
import { loadLocationInstance, loadLocationPrefab, ntfsCompare } from '../src/world/wodLocationData.js';
import { encodeRegionPack, decodeRegionPack, WOD_PACK_VERSION } from '../src/world/wodLocationPack.js';
import { isMain } from './lib/isMain.mjs';

export const WOD_BUNDLE_ASSETS = Object.freeze({
  'LocationLoader.cs': 'Scripts/LocationLoader.cs',
  'LocationHelper.cs': 'Scripts/LocationHelper.cs',
  'LocationEnemySpawner.cs': 'Scripts/LocationEnemySpawner.cs',
  'LocationData.cs': 'Scripts/LocationData.cs',
  'LocationModLoader.cs': 'Scripts/LocationModLoader.cs',
  'DungeonExterior.cs': 'Scripts/DungeonExterior.cs',
  'MainQuestLocationOverhaul.cs': 'Scripts/MainQuestLocationOverhaul.cs',
  'PrivateersHold.cs': 'Scripts/PrivateersHold.cs',
  'worldofdaggerfall.dfmod': 'worldofdaggerfall.dfmod.json',
});

const sha256 = (b) => createHash('sha256').update(b).digest('hex');

// The body uses the TextAsset bytes because the decoded text drops a UTF-8 byte-order mark.
export function readWorldOfDaggerfallBundle(bytes) {
  const bundle = readUnityBundle(bytes);
  return bundle.textAssets.map((t) => ({
    name: t.name,
    path: WOD_BUNDLE_ASSETS[t.name] ?? null,
    body: t.bytes ? Buffer.from(t.bytes) : Buffer.from(t.text ?? '', 'utf8'),
  }));
}

// Files load in NTFS name order, the order Directory.GetFiles gives the mod's LocationLoader.
/** @returns {{files:Array<{file:string, instances:object[], bytes:number, sha256:string}>}} */
export function readRegionFolder(entries) {
  const files = [];
  for (const { name, bytes } of [...entries].sort((a, b) => ntfsCompare(a.name, b.name))) {
    if (!/^[\x20-\x7e]+$/.test(name)) throw new Error(`non-ASCII file name ${name}: NTFS order would need the upcase table`);
    if (!name.endsWith('.txt')) continue;
    const instances = loadLocationInstance(Buffer.from(bytes).toString('utf8'));
    if (instances == null) throw new Error(`${name}: no <locations> element`);
    files.push({ file: name, instances, bytes: bytes.length, sha256: sha256(bytes) });
  }
  return { files };
}

if (isMain(import.meta.url)) {
  const root = process.argv[2];
  if (!root) { console.error('usage: node tools/worldOfDaggerfallAssets.mjs <extracted archive root> [outDir]'); process.exit(1); }
  const outDir = (process.argv[3] ?? fileURLToPath(new URL('../vendor/world-of-daggerfall/', import.meta.url))).replace(/\/$/, '');
  const write = (rel, body) => {
    const dest = `${outDir}/${rel}`;
    mkdirSync(dest.slice(0, dest.lastIndexOf('/')), { recursive: true });
    writeFileSync(dest, body);
    return dest;
  };

  const dfmod = readFileSync(`${root}/Mods/world_of_daggerfall.dfmod`);
  console.log(`world_of_daggerfall.dfmod  ${dfmod.length} bytes  ${sha256(dfmod)}`);
  for (const a of readWorldOfDaggerfallBundle(dfmod)) {
    if (!a.path) { console.log(`  (unmapped) ${a.name}  ${a.body.length} bytes  ${sha256(a.body)}`); continue; }
    write(a.path, a.body);
    console.log(`  ${a.path}  ${a.body.length} bytes  ${sha256(a.body)}`);
  }

  const prefabDir = `${root}/Locations/LocationPrefab`;
  const prefabs = [];
  for (const name of readdirSync(prefabDir).sort(ntfsCompare)) {
    const bytes = readFileSync(`${prefabDir}/${name}`);
    const p = loadLocationPrefab(bytes.toString('utf8'));
    if (!p) throw new Error(`${name}: no <locationPrefab> element`);
    write(`LocationPrefab/${name}`, bytes);
    prefabs.push({ name, bytes: bytes.length, sha256: sha256(bytes), objects: p.obj.length });
  }
  console.log(`  LocationPrefab/  ${prefabs.length} files`);

  const regions = [];
  const folders = readdirSync(`${root}/Locations`).filter((d) => d !== 'LocationPrefab');
  for (const d of folders.sort((a, b) => Number(a) - Number(b))) {
    if (!/^\d+$/.test(d)) throw new Error(`unexpected folder Locations/${d}`);
    const dir = `${root}/Locations/${d}`;
    const { files } = readRegionFolder(readdirSync(dir).map((name) => ({ name, bytes: readFileSync(`${dir}/${name}`) })));
    const pack = encodeRegionPack(Number(d), files);
    const back = decodeRegionPack(pack);
    if (back.count !== files.reduce((n, f) => n + f.instances.length, 0)) throw new Error(`region ${d}: round trip`);
    write(`Locations/${d}.bin`, pack);
    regions.push({
      region: Number(d), pack: `Locations/${d}.bin`, bytes: pack.length, sha256: sha256(pack), count: back.count,
      files: files.map((f) => [f.file, f.bytes, f.instances.length, f.sha256]),
    });
    console.log(`  Locations/${d}.bin  ${pack.length} bytes  ${back.count} instances  ${files.length} files  ${sha256(pack)}`);
  }

  const manifest = {
    what: 'World of Daggerfall 2.0 (Kamer): the Locations tree, as tools/worldOfDaggerfallAssets.mjs read it',
    packVersion: WOD_PACK_VERSION,
    dfmod: { bytes: dfmod.length, sha256: sha256(dfmod) },
    prefabs,
    regions,
    totals: {
      prefabs: prefabs.length,
      prefabObjects: prefabs.reduce((n, p) => n + p.objects, 0),
      regions: regions.length,
      files: regions.reduce((n, r) => n + r.files.length, 0),
      instances: regions.reduce((n, r) => n + r.count, 0),
    },
  };
  // One source file per line: [name, bytes, instances, sha256].
  const json = JSON.stringify(manifest, null, 1)
    .replace(/\[\n\s+("[^"\n]*"),\n\s+(\d+),\n\s+(\d+),\n\s+("[0-9a-f]{64}")\n\s+\]/g, '[$1, $2, $3, $4]');
  write('locations.json', `${json}\n`);
  console.log(`  locations.json  ${JSON.stringify(manifest.totals)}`);
}
