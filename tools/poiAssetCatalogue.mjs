// Writes the in-game POI editor's asset catalog, public/poi/asset-catalogue.json, from the game files and the repo.
//   ARENA2_PATH=/path/to/arena2 node tools/poiAssetCatalogue.mjs [--check] [--out <file>]
// The game files are required: without ARENA2_PATH the catalog would list no models or classic flats, so the tool
// stops. --check builds the catalog and compares it with the file on disk (exit 1 when they differ) without writing.
// The entries are built by src/poi/poiAssetCatalogueBuild.js; the editor reads them with src/poi/poiAssetCatalogue.js.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => import(pathToFileURL(join(ROOT, 'src', p)).href);
const args = process.argv.slice(2);
const check = args.includes('--check');
const outAt = args.indexOf('--out');
const OUT = outAt >= 0 ? args[outAt + 1] : join(ROOT, 'public', 'poi', 'asset-catalogue.json');
const arena = process.env.ARENA2_PATH;
if (!arena || !existsSync(arena)) {
  console.error('ARENA2_PATH is not set to the game files (ARENA2). The catalog lists the game\'s models and flats, so it needs them.');
  process.exit(2);
}
const names = readdirSync(arena);
const fileOf = (n) => names.find((f) => f.toUpperCase() === n.toUpperCase());
const rd = (n) => { const f = fileOf(n); return f ? new Uint8Array(readFileSync(join(arena, f))) : null; };

const { Arch3dFile } = await src('formats/arch3dFile.js');
const { TextureFile } = await src('formats/textureFile.js');
const { FlatsFile } = await src('formats/flatsFile.js');
const { BlocksFile } = await src('formats/blocksFile.js');
const { ITEM_TEMPLATES, GROUP_TEMPLATE_INDICES } = await src('systems/item/itemTemplates.js');
const { ITEM_GROUPS } = await src('characters/equipRules.js');
const { RRI_TEMPLATES, RRI_CLASSES } = await src('systems/roleplayRealismItems/rriItems.js');
const { TROPHY_ROW } = await src('net/trophyLaw.js');
const { ENEMY_BASICS, enemyDisplayName } = await src('characters/enemy/enemyBasics.js');
const { installEnemyExpansion } = await src('systems/enemyExpansion/dexInstall.js');
const { buildPoiAssetCatalogue, packPoiAssetCatalogue } = await src('poi/poiAssetCatalogueBuild.js');
const { FESTIVAL_ARCHIVE, FESTIVAL_ART } = await src('world/festivalArt.js');
const { SOUL_CAKE_ROW, HEARTH_OFFERING_ROW } = await src('systems/festival/soulCake.js');
const { DECORATION_POOLS, WATER_BIOME } = await src('world/underwater/underwaterDecorations.js');

// the files
const arch3d = new Arch3dFile(); arch3d.load(rd('ARCH3D.BSA'));
const flatsCfg = new FlatsFile(); flatsCfg.load(rd('FLATS.CFG'));
const blocks = new BlocksFile(); blocks.load(rd('BLOCKS.BSA'), 'BLOCKS.BSA');
const textures = new Map();
for (const n of names.filter((f) => /^TEXTURE\.\d{3}$/i.test(f))) {
  const t = new TextureFile();
  try { t.load(new Uint8Array(readFileSync(join(arena, n))), n.toUpperCase()); } catch { continue; }
  if (t.recordCount > 0) textures.set(Number(n.split('.')[1]), t);
}
const pngs = (dir) => (existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)).filter((f) => /\.png$/i.test(f)) : []);
const modFiles = ['public/art/roleplay-realism-items', 'vendor/climates-calories/Textures', 'vendor/detailed-ships/Textures', 'vendor/foraging/Textures']
  .map((dir) => ({ source: dir, files: pngs(dir) }));

// the items: the classic templates with their groups, then the mods' own rows, the trophy, and the Witches' Festival
// items
const groupOf = new Map();
for (const [g, list] of Object.entries(GROUP_TEMPLATE_INDICES)) for (const i of list) groupOf.set(i, ITEM_GROUPS[g] ?? -1);
const items = ITEM_TEMPLATES.filter(Boolean).map((t) => ({ ...t, group: groupOf.get(t.index) ?? -1 }));
for (const t of RRI_TEMPLATES) items.push({ ...t, group: ITEM_GROUPS[RRI_CLASSES[t.index]?.group] ?? -1, source: 'roleplay-realism-items', sourcePath: 'src/systems/roleplayRealismItems/rriItems.js' });
const cc = JSON.parse(readFileSync(join(ROOT, 'vendor/climates-calories/ItemTemplates.json'), 'utf8'));
for (const t of cc) if (t.index > 511 && t.name && !items.some((x) => x.index === t.index)) items.push({ ...t, group: -1, source: 'climates-calories', sourcePath: 'vendor/climates-calories/ItemTemplates.json' });
items.push({ ...TROPHY_ROW, group: -1, sourcePath: 'src/net/trophyLaw.js' });
for (const t of [SOUL_CAKE_ROW, HEARTH_OFFERING_ROW]) items.push({ ...t, group: -1, source: 'witches-festival', sourcePath: 'src/systems/festival/soulCake.js' });

// the Witches' Festival's painted pictures (world/festivalArt.js), and Iliac Puddle No More's seafloor pieces by water biome
const FESTIVAL_NAMES = { cake: 'Soul Cake', offeringIcon: 'Hearth Offering (in a pack)', offering: 'Hearth Offering', turnip: 'Turnip lantern', effigy: 'Straw effigy', wardStaff: 'Ward-staff' };
const ownFlats = Object.entries(FESTIVAL_ART).map(([k, r]) => ({ archive: FESTIVAL_ARCHIVE, record: r, name: FESTIVAL_NAMES[k] ?? k, source: 'src/world/festivalArt.js' }));
const biomeWords = (k) => k.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
const underwater = new Map();
for (const [biome, pool] of Object.entries(DECORATION_POOLS)) {
  const word = biomeWords(Object.keys(WATER_BIOME).find((k) => WATER_BIOME[k] === Number(biome)) ?? 'open ocean');
  for (const p of pool) { const k = `${p.archive}.${p.record}`; if (!underwater.has(k)) underwater.set(k, []); if (!underwater.get(k).includes(word)) underwater.get(k).push(word); }
}

// the creatures: every spawnable encounter enemy ID (`FOES` in `poiDmEdit.js`), after registering Enemy Expansion names
installEnemyExpansion({ on: true, meaner: false, log: () => {} });
const { FOES } = await src('poi/poiDmEdit.js');
const creatures = FOES.map((f) => ({ id: f.id, name: enemyDisplayName(f.id) || f.name, texture: ENEMY_BASICS[f.id]?.maleTexture ?? null }));

const cat = buildPoiAssetCatalogue({ arch3d, textures, flatsCfg, blocks, modFiles, items, creatures, ownFlats, underwater });
const text = `${JSON.stringify(packPoiAssetCatalogue(cat))}\n`;
const summary = `${cat.entries.length} entries (${Object.entries(cat.counts).map(([k, v]) => `${k} ${v}`).join(', ')}), ${cat.duplicates.length} duplicate ids, ${cat.missing.length} missing references, ${Buffer.byteLength(text)} bytes`;
if (check) {
  const had = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  console.log(had === text ? `up to date: ${summary}` : `differs from ${OUT}: ${summary}`);
  process.exit(had === text ? 0 : 1);
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, text);
console.log(`wrote ${OUT}: ${summary}`);
