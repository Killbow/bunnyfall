// Builds the World Builder's asset catalogue from the game files and the repo.
//   ARENA2_PATH=/path/to/arena2 node tools/poi-editor/scripts/buildAssetCatalogue.mjs
// Writes public/asset-catalogue.json, public/thumbs/flats-<archive>.png (32 px sprite atlases)
// and ASSET-AUDIT.md next to this folder. Without ARENA2_PATH the repo-only part is still built.
// Plain node, no dependencies beyond the repo's own modules.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const OUT = join(HERE, '..');
const SRC = (p) => join(ROOT, 'src', p);
const arena = process.env.ARENA2_PATH && existsSync(process.env.ARENA2_PATH) ? process.env.ARENA2_PATH : null;

const { Arch3dFile } = await import(SRC('formats/arch3dFile.js'));
const { GLOBAL_SCALE } = await import(SRC('world/meshReader.js'));   // a model's units to metres
const { TextureFile } = await import(SRC('formats/textureFile.js'));
const { DFPalette } = await import(SRC('formats/dfPalette.js'));
const { FlatsFile } = await import(SRC('formats/flatsFile.js'));
const { encodePng } = await import(SRC('poi/poiThumb.js'));
const { NPC_FLAT_ARCHIVES } = await import(SRC('world/npcFlatArchives.js'));
const { ITEM_TEMPLATES, GROUP_TEMPLATE_INDICES } = await import(SRC('systems/item/itemTemplates.js'));
const { ENEMY_BASICS, ENEMY_NAMES } = await import(SRC('characters/enemy/enemyBasics.js'));
const { DECOR_STATIONS } = await import(SRC('net/decorLaw.js'));

const entries = [];
const missing = [];
const ids = new Set();
const duplicates = [];
const add = (e) => {
  if (ids.has(e.id)) { duplicates.push(e.id); return; }
  ids.add(e.id);
  entries.push(e);
};
const THUMB = 32;
const rd = (f) => new Uint8Array(readFileSync(join(arena, f)));

// What the old in-game editor offered: the building models by block kind (dfModelCatalog) and the shelf.
// Billboards, paperdolls and entities were never placeable by it.
const OLD_EXPOSES = { 'df-arch3d': 'building models only', 'poi-shelf': 'yes' };

if (arena) {
  const pal = new DFPalette(); pal.load(rd('ART_PAL.COL'), 'ART_PAL.COL');
  const flatsCfg = new FlatsFile(); flatsCfg.load(rd('FLATS.CFG'));
  const npcSet = new Set(NPC_FLAT_ARCHIVES);

  // --- df-flat: every TEXTURE.nnn record, frame 0 as a 32 px thumbnail in one atlas per archive
  mkdirSync(join(OUT, 'public', 'thumbs'), { recursive: true });
  const textureArchives = new Set();
  for (const n of readdirSync(arena).filter((f) => /^TEXTURE\.\d{3}$/i.test(f)).sort()) {
    const archive = +n.split('.')[1];
    const t = new TextureFile();
    try { t.load(rd(n), n.toUpperCase(), pal); } catch (e) { missing.push({ what: `TEXTURE.${archive}`, why: String(e.message) }); continue; }
    if (!t.recordCount) continue;
    textureArchives.add(archive);
    const cols = 16, rows = Math.ceil(t.recordCount / cols);
    const atlas = new Uint8Array(cols * THUMB * rows * THUMB * 4);
    for (let r = 0; r < t.recordCount; r++) {
      const size = t.getSize(r);
      const flat = archive >= 172 ? flatsCfg.getFlatData(archive, r) : null;
      const kind = npcSet.has(archive) ? '2d-paperdoll-or-billboard' : archive >= 172 ? '2d-billboard' : 'texture';
      const bmp = t.getDFBitmap(r, 0);
      if (bmp?.data?.length) {
        const s = Math.min(1, THUMB / Math.max(bmp.width, bmp.height));
        const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
        const ox = (r % cols) * THUMB + ((THUMB - w) >> 1), oy = Math.floor(r / cols) * THUMB + ((THUMB - h) >> 1);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const p = bmp.data[Math.floor(y / s) * bmp.width + Math.floor(x / s)];
          if (!p) continue;
          const i = ((oy + y) * cols * THUMB + ox + x) * 4;
          const rgb = [pal.getRed(p), pal.getGreen(p), pal.getBlue(p)];
          atlas[i] = rgb[0]; atlas[i + 1] = rgb[1]; atlas[i + 2] = rgb[2]; atlas[i + 3] = 255;
        }
      }
      add({
        id: `df-flat:${archive}.${r}`, namespace: 'df-flat', name: flat?.caption || `Archive ${archive} record ${r}`,
        sourcePath: `TEXTURE.${String(archive).padStart(3, '0')}`, dimensionMode: archive < 172 ? 'texture' : npcSet.has(archive) ? '2d-billboard' : '2d-billboard',
        category: archive < 172 ? 'wall-and-ground textures' : npcSet.has(archive) ? 'people' : 'billboards',
        subcategory: String(archive), tags: [npcSet.has(archive) ? 'scale-locked' : 'scalable'].concat(flat?.caption ? ['captioned'] : []),
        dimensions: { px: [size.width, size.height], frames: t.getFrameCount(r) },
        preview: { atlas: `thumbs/flats-${archive}.png`, cell: [r % cols, Math.floor(r / cols)], size: THUMB },
        oldEditorExposes: 'no', runtime: npcSet.has(archive) ? 'figure scale fixed at 1 (poiLawV2)' : archive >= 172 ? 'billboard, mount or paperdoll by decor rules' : 'material only',
        archive, record: r, locked: npcSet.has(archive),
      });
    }
    writeFileSync(join(OUT, 'public', 'thumbs', `flats-${archive}.png`), encodePng({ width: cols * THUMB, height: rows * THUMB, data: atlas }));
  }

  // --- df-arch3d: every model, metadata only (the editor draws them on demand)
  const a = new Arch3dFile(); a.load(rd('ARCH3D.BSA'));
  for (let i = 0; i < a.count; i++) {
    const rid = a.getRecordId(i);
    let m = null;
    try { m = a.getMesh(i); } catch (e) { missing.push({ what: `ARCH3D ${rid}`, why: String(e.message).slice(0, 80) }); continue; } finally { a.discardRecord(i); }
    if (!m || !m.totalVertices) { missing.push({ what: `ARCH3D ${rid}`, why: 'empty mesh' }); continue; }
    const texRefs = [...new Set(m.subMeshes.map((s) => `${s.textureArchive}.${s.textureRecord}`))];
    for (const tr of texRefs) if (!textureArchives.has(+tr.split('.')[0])) missing.push({ what: `ARCH3D ${rid} texture`, why: `archive ${tr.split('.')[0]} absent` });
    add({
      id: `df-arch3d:${rid}`, namespace: 'df-arch3d', name: `Model ${rid}`, sourcePath: 'ARCH3D.BSA',
      dimensionMode: '3d', category: 'models', subcategory: String(Math.floor(rid / 100) * 100), tags: [],
      dimensions: { size: [m.size.x, m.size.y, m.size.z].map((v) => +(v * GLOBAL_SCALE).toFixed(3)), radius: +(m.radius * GLOBAL_SCALE).toFixed(3), vertices: m.totalVertices, triangles: m.totalTriangles },
      textures: texRefs, preview: null, oldEditorExposes: OLD_EXPOSES['df-arch3d'], runtime: 'arch3d part (v2) or a part mesh', modelId: rid,
    });
  }
}

// --- paperdoll-item: item templates, with the flat each one draws as in the world
const groupOf = new Map();
for (const [g, list] of Object.entries(GROUP_TEMPLATE_INDICES)) for (const i of list) groupOf.set(i, g);
for (const t of ITEM_TEMPLATES) {
  if (!t) continue;
  const worldRef = t.worldTexArchive ? `df-flat:${t.worldTexArchive}.${t.worldTexRecord}` : null;
  add({
    id: `paperdoll-item:${t.index}`, namespace: 'paperdoll-item', name: t.name, sourcePath: 'src/systems/item/itemTemplatesData.js',
    dimensionMode: '2d-paperdoll', category: groupOf.get(t.index) ?? 'unknown', subcategory: t.isIngredient ? 'ingredient' : '', tags: [t.isLiquid ? 'liquid' : null, t.isBluntWeapon ? 'blunt' : null].filter(Boolean),
    dimensions: { weight: t.weight, basePrice: t.basePrice }, preview: worldRef ? { ref: worldRef } : null, oldEditorExposes: 'no',
    runtime: 'item stack (templates, groups: poiTradeLaw)', template: t.index,
    worldTexture: worldRef, playerTexture: t.playerTextureArchive ? `${t.playerTextureArchive}.${t.playerTextureRecord}` : null,
  });
  if (arena && worldRef && !ids.has(worldRef) && !missing.some((m) => m.what === `item ${t.index}`)) missing.push({ what: `item ${t.index}`, why: `world texture ${t.worldTexArchive}.${t.worldTexRecord} not found` });
}

// --- entity: enemies and home stations
const rows = Array.isArray(ENEMY_BASICS) ? ENEMY_BASICS.map((r, i) => [i, r]) : Object.entries(ENEMY_BASICS).map(([k, r]) => [+k, r]);
for (const [id, r] of rows) {
  if (!r) continue;
  const name = ENEMY_NAMES[id] ?? `Enemy ${id}`;
  add({
    id: `entity:foe-${id}`, namespace: 'entity', name, sourcePath: 'src/characters/enemy/enemyBasics.js', dimensionMode: 'entity',
    category: id >= 128 ? 'class enemies' : 'monsters', subcategory: r.affinity ?? '', tags: [r.behaviour].filter(Boolean),
    dimensions: { level: r.level ?? null, health: r.minHealth != null ? [r.minHealth, r.maxHealth] : null }, preview: null,
    oldEditorExposes: 'no', runtime: 'encounter foe id (poiLawV2 ranges)', foeId: id, textures: [r.maleTexture, r.femaleTexture].filter((v) => v != null),
  });
  if (arena) for (const tx of [r.maleTexture, r.femaleTexture]) if (tx != null && !readdirSync(arena).some((f) => f.toUpperCase() === `TEXTURE.${String(tx).padStart(3, '0')}`) && tx < 512) missing.push({ what: `foe ${id}`, why: `TEXTURE.${tx} absent` });
}
for (const s of DECOR_STATIONS) {
  add({ id: `entity:station-${s}`, namespace: 'entity', name: `${s[0].toUpperCase()}${s.slice(1)} station`, sourcePath: 'src/net/decorLaw.js', dimensionMode: 'entity', category: 'stations', subcategory: '', tags: [], dimensions: null, preview: null, oldEditorExposes: 'no', runtime: 'house decor only, not wired to POIs' });
}

// --- repo-3d: the vendored low-poly trees
const trees = join(ROOT, 'vendor', 'low-poly-trees', 'Trees', 'trees.json');
if (existsSync(trees)) {
  const t = JSON.parse(readFileSync(trees, 'utf8'));
  t.meshes.forEach((m, i) => add({
    id: `repo-3d:trees-${i}`, namespace: 'repo-3d', name: m.name, sourcePath: 'vendor/low-poly-trees/Trees/trees.json', dimensionMode: '3d', category: 'trees', subcategory: '', tags: [],
    dimensions: { size: m.max.map((v, k) => +(v - m.min[k]).toFixed(3)), vertices: m.vertices }, preview: null, oldEditorExposes: 'no', runtime: 'needs a mesh import into the POI document',
  }));
}

const byNs = {};
for (const e of entries) byNs[e.namespace] = (byNs[e.namespace] ?? 0) + 1;
byNs['poi-shelf'] = 0;
// a field every entry of a namespace shares is written once, in `shared`
const shared = {};
for (const e of entries) {
  const sh = (shared[e.namespace] ??= { ...e });
  for (const k of Object.keys(sh)) if (JSON.stringify(sh[k]) !== JSON.stringify(e[k])) delete sh[k];
}
for (const e of entries) for (const k of Object.keys(shared[e.namespace])) delete e[k];
const out = { version: 1, generated: 'by tools/poi-editor/scripts/buildAssetCatalogue.mjs', arena2: !!arena, counts: byNs, shared, missingReferences: missing, duplicates, entries };
writeFileSync(join(OUT, 'public', 'asset-catalogue.json'), JSON.stringify(out));

const md = [
  '# Asset audit', '',
  `Generated by \`scripts/buildAssetCatalogue.mjs\`${arena ? '' : ' WITHOUT game files (ARENA2_PATH unset): only repo namespaces are listed'}.`, '',
  '| Namespace | Entries | Source | Old editor |', '|---|---|---|---|',
  ...Object.entries(byNs).map(([k, v]) => `| ${k} | ${v} | ${{ 'df-flat': 'TEXTURE.nnn', 'df-arch3d': 'ARCH3D.BSA', 'paperdoll-item': 'item templates', entity: 'enemyBasics, DECOR_STATIONS', 'repo-3d': 'vendor/low-poly-trees', 'poi-shelf': 'server shelf, none offline' }[k]} | ${OLD_EXPOSES[k] ?? 'no'} |`), '',
  `Duplicate ids: ${duplicates.length} (ARCH3D.BSA repeats a record id; the first record is kept: ${[...new Set(duplicates)].join(', ')}). Missing references: ${missing.length}.`, '',
  '## Missing references', '', ...(missing.length ? missing.slice(0, 80).map((m) => `- ${m.what}: ${m.why}`) : ['None.']),
  '## Not covered yet', '',
  '- Modded texture archives (513-526, 532-539, 1210, 1230, 10009-10027) come from vendor PNGs, not ARENA2, so they have no entries.',
  '- ARCH3D models have metadata only. The editor draws them on demand.',
  '- Other vendor meshes (ships, items, armour) use their own formats and are not listed. Only the low-poly trees are.',
  '- Item templates beyond the 288 built in (custom and mod rows) register at run time and are not listed.',
  '- The poi-shelf is server data, so it has no offline entries.', '',
  missing.length > 80 ? `- and ${missing.length - 80} more in the JSON` : '', '',
].join('\n');
writeFileSync(join(OUT, 'ASSET-AUDIT.md'), md);
console.log(byNs, 'missing', missing.length, 'dups', duplicates.length);
