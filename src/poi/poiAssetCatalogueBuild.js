// @ts-check
// Builds the in-game POI editor's asset catalog (`poi/poiAssetCatalogue.js`) from the archive readers and file lists it
// is given; `tools/poiAssetCatalogue.mjs` loads the game files and writes `public/poi/asset-catalogue.json`. Includes
// every `ARCH3D` model and DET stand-in model with its game name where available, classic `TEXTURE` flats (excluding
// editor markers, with Iliac Puddle No More seafloor sprites categorized under `underwater`), mod and built-in sprites
// from `POI_MOD_FLAT_FAMILIES`, item templates, and spawnable DM encounter creatures, flagging duplicate IDs and
// missing asset references.

import { decorKey, collectDecor, decorCatalogue, addDecorNature, DECOR_FURNITURE_FIRST, DECOR_FURNITURE_LAST } from '../homes/decorCatalogue.js';
import { addDecorMods, decorModNaming, decorModFlatSource } from '../homes/decorMods.js';
import { dfModelCatalog, DF_MODEL_KINDS } from './dfModelImport.js';
import { HOUSE_CONTAINER_NAMES, ACTION_MODEL_NAMES } from '../ui/worldTooltips.js';
import { NPC_FLAT_ARCHIVES } from '../world/npcFlatArchives.js';
import { EDITOR_FLATS_ARCHIVE, isNatureArchive } from '../world/rmbFlats.js';
import { DET_MODELS, DET_TOWN_MODELS, DET_FLAT_STAND_INS, DET_FLAT_DRAWINGS, DET_TOWN_FLATS, DET_DOLPHIN_RECORDS } from '../world/detStandIns.js';
import { ITEM_GROUPS } from '../characters/equipRules.js';
import { DECOR_ARCHIVE_MAX, DECOR_RECORD_MAX, DECOR_WEAPONS_GROUP, DECOR_ARMOR_GROUP, DECOR_ARROW_TEMPLATE } from '../net/decorLaw.js';
import { TROPHY_TEMPLATE } from '../net/trophyLaw.js';
import { isNudeFlat } from '../characters/nudeFlats.js';
import { TOWN_GARDEN_ARCHIVE } from '../world/townStandIns.js';
import { FESTIVAL_ARCHIVE } from '../world/festivalArt.js';

/** The file format's version. */
export const POI_ASSET_CATALOGUE_VERSION = 1;

/** The house decorator's kinds as catalog categories. */
const DECOR_KIND_CATEGORY = Object.freeze({
  bed: 'furniture', storage: 'furniture', shelf: 'furniture', furniture: 'furniture', door: 'furniture', mods: 'furniture',
  light: 'lights', people: 'people', dungeon: 'dungeon', outdoor: 'outdoor', nature: 'nature',
  clothing: 'decor', boxes: 'decor', arms: 'decor', books: 'decor', misc: 'decor', treasure: 'decor', decor: 'decor',
});
/** The block kinds as tags, in American spelling; a block whose prefix names no kind is tagged "other town blocks". */
const KIND_TAG = Object.freeze(Object.fromEntries(Object.entries(DF_MODEL_KINDS).map(([k, v]) => [k, k === 'ARMR' ? 'armorers' : v.toLowerCase()])));
/** Display tags for item group names that cannot be derived by splitting camelCase and stripping trailing digits. */
const GROUP_TAG = Object.freeze({ Jewellery: 'jewelry', MensClothing: 'men\'s clothing', WomensClothing: 'women\'s clothing' });
/** Singular building names by town block prefix, used to name building models that have no house-decorator entry. */
const KIND_ONE = Object.freeze({
  RESI: 'House', TVRN: 'Tavern', GENR: 'General store', WEAP: 'Weaponsmith', ARMR: 'Armorer', ALCH: 'Alchemist',
  BANK: 'Bank', BOOK: 'Bookstore', CLOT: 'Clothier', FURN: 'Furniture store', GEMS: 'Gem store', LIBR: 'Library',
  PAWN: 'Pawnshop', TEMP: 'Temple', PALA: 'Palace', FARM: 'Farm', DUNG: 'Dungeon entrance', CAST: 'Castle',
  MANR: 'Manor', SHRI: 'Shrine', RUIN: 'Ruin', SHCK: 'Shack', GRVE: 'Graveyard', FILL: 'Town piece', MAGE: 'Mages Guild',
  THIE: 'Thieves Guild', DARK: 'Dark Brotherhood', FIGH: 'Fighters Guild', CUST: 'Custom building', WALL: 'Town wall',
  MARK: 'Market', SHIP: 'Ship', WITC: 'Witch coven', KNIG: 'Knightly order',
});
/** The modded picture families, by archive, as the browser tags them. */
export const POI_MOD_FLAT_FAMILIES = Object.freeze([
  { tag: 'roleplay-realism-items', name: 'Roleplay & Realism Items', test: (/** @type {number} */ a) => a >= 513 && a <= 526 },
  { tag: 'climates-calories', name: 'Climates & Calories', test: (/** @type {number} */ a) => a >= 532 && a <= 539 },
  { tag: 'detailed-ships', name: 'Detailed Ships', test: (/** @type {number} */ a) => a === 1210 || a === 1230 },
  { tag: 'det-stand-in', name: 'DET stand-ins', test: (/** @type {number} */ a) => a >= 10009 && a <= 10028 },
  { tag: 'temple-gardens', name: 'Temple gardens', test: (/** @type {number} */ a) => a === TOWN_GARDEN_ARCHIVE },
  { tag: 'witches-festival', name: 'Witches\' Festival', test: (/** @type {number} */ a) => a === FESTIVAL_ARCHIVE },
  { tag: 'foraging', name: 'Foraging', test: (/** @type {number} */ a) => a >= 11600 && a <= 11606 },
]);
const familyOf = (/** @type {number} */ a) => POI_MOD_FLAT_FAMILIES.find((f) => f.test(a)) ?? null;
/** Builds a map of DET flat archive and record numbers to descriptions of their built-in fallbacks. */
function detFlatRecords() {
  /** @type {Map<number, Map<number, string>>} */
  const out = new Map();
  const put = (/** @type {number} */ a, /** @type {number} */ r, /** @type {string} */ how) => { if (!out.has(a)) out.set(a, new Map()); if (!out.get(a)?.has(r)) out.get(a)?.set(r, how); };
  for (const [a, recs] of Object.entries(DET_FLAT_STAND_INS)) for (const [r, [sa, sr]] of Object.entries(recs)) put(+a, +r, `Daggerfall's picture ${sa}.${sr}`);
  for (const [a, recs] of Object.entries(DET_TOWN_FLATS)) for (const [r, [sa, sr]] of Object.entries(recs)) put(+a, +r, `Daggerfall's picture ${sa}.${sr}`);
  for (const [a, recs] of Object.entries(DET_FLAT_DRAWINGS)) for (const r of Object.keys(recs)) put(+a, +r, 'a custom drawing');
  for (const r of DET_DOLPHIN_RECORDS) put(10009, r, 'a custom drawing');
  return out;
}
const capital = (/** @type {string} */ s) => s.charAt(0).toUpperCase() + s.slice(1);
const words = (/** @type {string} */ name) => capital(name.replace(/([A-Z])/g, ' $1').toLowerCase().trim());

/**
 * Builds the asset catalog from the game archives, mod texture lists, item rows (with `group`), spawnable creatures,
 * built-in custom models and sprites, and seafloor mappings (`archive.record` to biome names).
 * @param {{ arch3d?: { count: number, getRecordId: (i: number) => number, getMesh?: (i: number) => any, discardRecord?: (i: number) => void } | null,
 *   textures?: Map<number, { recordCount: number }> | null, flatsCfg?: { caption: (a: number, r: number) => string | null } | null, blocks?: any,
 *   modFiles?: { source: string, files: string[] }[], items?: any[], creatures?: { id: number, name: string, texture?: number | null }[], customModels?: number[],
 *   ownFlats?: { archive: number, record: number, name: string, source: string }[], underwater?: Map<string, string[]> }} src
 */
export function buildPoiAssetCatalogue({ arch3d = null, textures = null, flatsCfg = null, blocks = null, modFiles = [], items = [], creatures = [], customModels = [], ownFlats = [], underwater = new Map() }) {
  /** @type {any[]} */
  const entries = [];
  /** @type {Map<string, any>} */
  const byId = new Map();
  /** @type {{ what: string, why: string }[]} */
  const missing = [];
  /** @type {string[]} */
  const duplicates = [];
  const add = (/** @type {any} */ e) => {
    if (byId.has(e.id)) { duplicates.push(e.id); byId.get(e.id).duplicate = true; return null; }
    byId.set(e.id, e);
    entries.push(e);
    return e;
  };
  const miss = (/** @type {any} */ e, /** @type {string} */ why) => { missing.push({ what: e.id, why }); e.missing ??= why; };

  // Collects house-decorator names for room, dungeon, and street props, climate foliage, and town-mod props
  // (`systems/decor/decorCatalogue.js`, matching `decorScan.js`).
  /** @type {Map<string, any>} */
  const decorNames = new Map();
  if (blocks) {
    const collected = new Map();
    for (let b = 0; b < (blocks.count ?? 0); b++) {
      try {
        const ty = blocks.getBlockName(b) ?? '';
        if (!/\.(RMB|RDB)$/i.test(ty)) continue;
        const blk = blocks.readClassicBlock ? blocks.readClassicBlock(b) : blocks.getBlock(b);
        if (blk) collectDecor([blk], collected);
      } catch { /* skip unreadable block */ }
    }
    for (const e of decorCatalogue(addDecorMods(addDecorNature(collected)))) decorNames.set(e.key, e);
  } else {
    for (const e of decorCatalogue(addDecorMods(addDecorNature(new Map())))) decorNames.set(e.key, e);
  }
  /** @type {Map<number, string[]>} */
  const blockKinds = new Map();
  if (blocks) for (const k of dfModelCatalog(blocks)) for (const id of k.ids) { if (!blockKinds.has(id)) blockKinds.set(id, []); blockKinds.get(id)?.push(k.kind); }

  // ── models ──
  const modelIds = [];
  if (arch3d) for (let i = 0; i < arch3d.count; i++) modelIds.push({ id: arch3d.getRecordId(i), i });
  const standIns = new Set([...Object.keys(DET_MODELS), ...Object.keys(DET_TOWN_MODELS)].map(Number));
  for (const id of customModels) standIns.add(id);
  const seenModel = new Set();
  /** @type {Map<string, any[]>} */
  const numbered = new Map();
  const modelEntry = (/** @type {number} */ id, /** @type {string} */ source, /** @type {string | null} */ standIn) => {
    const d = decorNames.get(decorKey({ model: id }));
    const kinds = blockKinds.get(id) ?? [];
    const tags = [];
    let category = 'models', name = null;
    if (d) {
      category = DECOR_KIND_CATEGORY[d.kind] ?? 'furniture';
      name = d.name;
      tags.push(d.kind);
      if (d.from === 'mod' || d.from === 'modstreet') tags.push('town-mod');
    } else if (ACTION_MODEL_NAMES[id]) { name = ACTION_MODEL_NAMES[id]; category = 'dungeon'; tags.push('action'); }
    else if (HOUSE_CONTAINER_NAMES[id]) { name = HOUSE_CONTAINER_NAMES[id]; category = 'furniture'; tags.push('storage'); }
    if (!d && standIn) { const n = decorModNaming({ model: id }).base; if (n) name = n; }
    if (kinds.length) {
      if (category === 'models') category = kinds.includes('SHIP') && kinds.length === 1 ? 'ships' : 'buildings';
      for (const k of kinds) tags.push(KIND_TAG[k] ?? 'other town blocks');
    }
    if (category === 'models' && id >= DECOR_FURNITURE_FIRST && id <= DECOR_FURNITURE_LAST) { category = 'furniture'; tags.push('furniture'); }
    if (category === 'models' && id >= 50000 && id <= 98999) { category = 'dungeon'; tags.push('architecture'); }
    if (standIn) tags.push('stand-in');
    const e = { id: `model:${id}`, name: name ?? '', category, tags: [...new Set(tags)], kind: 'model', placing: 'upload', source, model: id, ...(standIn ? { standIn } : {}) };
    if (!name) {
      // numbered within its first named block kind (stable for the same game data), else "Model <id>"
      const base = KIND_ONE[kinds.find((k) => KIND_ONE[k]) ?? ''] ?? null;
      if (!base) e.name = `Model ${id}`;
      else { if (!numbered.has(base)) numbered.set(base, []); numbered.get(base)?.push(e); }
    }
    return e;
  };
  for (const { id, i } of modelIds) {
    // a repeated id only marks the first record's entry: it takes no number of its own
    if (seenModel.has(id)) { duplicates.push(`model:${id}`); byId.get(`model:${id}`).duplicate = true; continue; }
    seenModel.add(id);
    const e = add(modelEntry(id, 'ARCH3D.BSA', null));
    if (!e) continue;
    if (arch3d?.getMesh) {
      try {
        const m = arch3d.getMesh(i);
        if (!m?.totalVertices) miss(e, 'empty model');
        else for (const a of new Set((m.subMeshes ?? []).map((/** @type {any} */ s) => s.textureArchive))) if (textures && !textures.has(a) && !familyOf(a)) miss(e, `texture archive ${a} absent`);
      } catch (err) { miss(e, `unreadable: ${String(/** @type {any} */ (err)?.message ?? err).slice(0, 60)}`); }
      finally { arch3d.discardRecord?.(i); }
    }
  }
  for (const id of [...standIns].sort((a, b) => a - b)) {
    if (seenModel.has(id)) continue;
    seenModel.add(id);
    add(modelEntry(id, 'src/world/detStandIns.js', 'a custom model for a DET piece'));
  }
  for (const [base, list] of numbered) {
    list.sort((a, b) => a.model - b.model);
    list.forEach((e, k) => { e.name = list.length === 1 ? base : `${base} ${k + 1}`; });
  }

  // ── classic flats ──
  const npc = new Set(NPC_FLAT_ARCHIVES);
  const flatTags = (/** @type {number} */ a, /** @type {number} */ r, /** @type {any} */ d) => {
    const tags = [];
    if (d) tags.push(d.kind);
    if (isNudeFlat(a, r)) tags.push('nude');
    return tags;
  };
  for (const a of [...(textures?.keys() ?? [])].sort((x, y) => x - y)) {
    // the level editor's markers, never drawn in the game
    if (a === EDITOR_FLATS_ARCHIVE) continue;
    const t = textures?.get(a);
    const n = Math.min(t?.recordCount ?? 0, DECOR_RECORD_MAX + 1);
    for (let r = 0; r < n; r++) {
      const d = decorNames.get(decorKey({ flat: [a, r] }));
      const caption = flatsCfg?.caption(a, r) ?? null;
      const category = npc.has(a) ? 'people' : a < 172 ? 'textures' : isNatureArchive(a) ? 'nature' : a === 210 ? 'lights' : d ? DECOR_KIND_CATEGORY[d.kind] ?? 'decor' : 'decor';
      const tags = flatTags(a, r, d);
      if (npc.has(a)) tags.push('scale-locked');
      if (a < 172) tags.push('texture');
      // Iliac Puddle No More's seafloor pieces: the classic record, or the mod's own picture while its replacements are on
      const sea = underwater.get(`${a}.${r}`);
      if (sea) tags.push('underwater', 'iliac-puddle-no-more', ...sea);
      add({
        id: `flat:${a}.${r}`, name: d?.name ?? (caption ? capital(caption) : `Picture ${a}.${r}`), category: sea ? 'underwater' : category, tags: [...new Set(tags)],
        kind: 'flat', placing: 'billboard', source: `TEXTURE.${String(a).padStart(3, '0')}`, flat: [a, r], ...(npc.has(a) ? { figure: true } : {}),
      });
    }
  }

  // ── the mods' pictures (archives past the classic 511, up to the decor law's limit) ──
  const det = detFlatRecords();
  /** @type {Map<string, string>} */
  const modFlat = new Map();
  for (const { source, files } of modFiles) {
    for (const f of files) {
      const m = /^(\d+)_(\d+)-0\.png$/i.exec(f);
      if (!m) continue;
      const a = +m[1], r = +m[2];
      if (a <= 511 || a > DECOR_ARCHIVE_MAX || r > DECOR_RECORD_MAX || !familyOf(a)) continue;
      if (!modFlat.has(`${a}.${r}`)) modFlat.set(`${a}.${r}`, source);
    }
  }
  for (const [a, recs] of det) for (const r of recs.keys()) if (!modFlat.has(`${a}.${r}`)) modFlat.set(`${a}.${r}`, 'src/world/detStandIns.js');
  /** names of the built-in custom sprites, keyed by `archive.record` */
  const ownName = new Map();
  for (const f of ownFlats) if (familyOf(f.archive)) { ownName.set(`${f.archive}.${f.record}`, f.name); if (!modFlat.has(`${f.archive}.${f.record}`)) modFlat.set(`${f.archive}.${f.record}`, f.source); }
  for (const k of decorNames.keys()) {
    const m = /^f(\d+)\.(\d+)$/.exec(k);
    if (m && +m[1] > 511 && familyOf(+m[1]) && !modFlat.has(`${m[1]}.${m[2]}`)) modFlat.set(`${m[1]}.${m[2]}`, 'src/systems/decor/decorMods.js');
  }
  const itemByPicture = new Map();
  for (const t of items) if (t?.playerTextureArchive > 511) itemByPicture.set(`${t.playerTextureArchive}.${t.playerTextureRecord}`, t.name);
  const modKeys = [...modFlat.keys()].map((k) => k.split('.').map(Number)).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  for (const [a, r] of modKeys) {
    const fam = /** @type {any} */ (familyOf(a));
    const d = decorNames.get(decorKey({ flat: [a, r] }));
    const own = decorModNaming({ flat: [a, r] }).base;
    const item = itemByPicture.get(`${a}.${r}`);
    const garden = a === TOWN_GARDEN_ARCHIVE ? decorModFlatSource(a, r) : null;
    const standIn = det.has(a) ? det.get(a)?.get(r) ?? null : garden ? `Daggerfall's picture ${garden[0]}.${garden[1]}` : null;
    add({
      id: `flat:${a}.${r}`, name: ownName.get(`${a}.${r}`) ?? d?.name ?? own ?? (item ? `${item} picture` : `${fam.name} picture ${a}.${r}`),
      category: a === FESTIVAL_ARCHIVE ? 'festival' : 'mod-flats',
      tags: [...new Set([fam.tag, ...flatTags(a, r, d), ...(standIn ? ['stand-in'] : [])])], kind: 'flat', placing: 'billboard',
      source: /** @type {string} */ (modFlat.get(`${a}.${r}`)), flat: [a, r],
      ...(standIn ? { standIn: det.has(a) ? `DET ${a} record ${r}: ${standIn}` : `temple garden record ${r}: ${standIn}` } : {}),
    });
  }

  // ── items ──
  const groupName = new Map(Object.entries(ITEM_GROUPS).map(([k, v]) => [v, k]));
  const flatKnown = (/** @type {number} */ a, /** @type {number} */ r) => byId.has(`flat:${a}.${r}`) || (!textures && a <= 511);
  for (const t of items) {
    if (!t || !Number.isSafeInteger(t.index)) continue;
    const g = Number.isSafeInteger(t.group) ? t.group : -1;
    const mount = t.index === TROPHY_TEMPLATE || (g === DECOR_WEAPONS_GROUP && t.index !== DECOR_ARROW_TEMPLATE) || g === DECOR_ARMOR_GROUP;
    const gname = groupName.get(g) ?? '';
    const category = t.index === TROPHY_TEMPLATE ? 'trophies' : g === DECOR_WEAPONS_GROUP ? 'weapons' : g === DECOR_ARMOR_GROUP ? 'armor' : /Clothing$/.test(gname) ? 'clothing' : 'items';
    const wa = t.worldTextureArchive ?? 0, wr = t.worldTextureRecord ?? 0;
    const tags = [...(g >= 0 && gname ? [GROUP_TAG[gname] ?? words(gname.replace(/\d+$/, '')).toLowerCase()] : []), ...(t.isIngredient ? ['ingredient'] : []), ...(t.source ? [t.source] : [])];
    const e = add({
      id: `item:${t.index}`, name: t.name, category, tags: [...new Set(tags)], kind: 'item', placing: mount ? 'mount' : 'paperdoll',
      source: t.sourcePath ?? 'src/systems/item/itemTemplatesData.js', template: t.index, group: g, ...(wa || wr ? { flat: [wa, wr] } : {}),
    });
    if (e && (wa || wr) && !flatKnown(wa, wr)) miss(e, `world picture ${wa}.${wr} absent`);
  }

  // ── creatures ──
  for (const c of creatures) {
    const e = add({
      id: `creature:${c.id}`, name: c.name, category: c.id >= 128 && c.id < 256 ? 'classes' : 'monsters', tags: ['encounter', ...(c.id >= 256 ? ['enemy-expansion'] : [])],
      kind: 'creature', placing: 'encounter', source: c.id >= 256 ? 'vendor/daggerfall-enemy-expansion' : 'src/characters/enemy/enemyBasics.js', creature: c.id,
      ...(Number.isSafeInteger(c.texture) && /** @type {number} */ (c.texture) > 0 ? { flat: [c.texture, 0] } : {}),
    });
    const tx = /** @type {number} */ (c.texture);
    // a classic creature's pictures are a TEXTURE archive; a mod's are the mod's files, some of them derived at run time
    // (systems/enemyExpansion/dexArt.js), so only the classic ones are checked
    if (e && textures && Number.isSafeInteger(tx) && tx > 0 && tx <= 511 && !textures.has(tx)) miss(e, `TEXTURE.${tx} absent`);
  }

  /** @type {Record<string, number>} */
  const counts = {};
  for (const e of entries) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
  return { version: POI_ASSET_CATALOGUE_VERSION, counts, missing, duplicates, entries };
}

/** Packs the catalog for JSON storage as `[id, name, category, tags, extra]` rows, omitting fields that
 *  `hydratePoiAssets` in `poi/poiAssetCatalogue.js` derives from `id`. @param {ReturnType<typeof
 *  buildPoiAssetCatalogue>} cat */
export function packPoiAssetCatalogue(cat) {
  const rows = cat.entries.map((e) => {
    const extra = {};
    for (const k of ['source', 'figure', 'group', 'standIn', 'duplicate', 'missing']) if (e[k] !== undefined) extra[k] = e[k];
    if (e.placing !== 'upload' && e.kind === 'model') extra.placing = e.placing;
    if (e.kind === 'item' || e.kind === 'creature') { if (e.flat) extra.flat = e.flat; extra.placing = e.placing; }
    return [e.id, e.name, e.category, e.tags, extra];
  });
  return { version: cat.version, counts: cat.counts, missing: cat.missing, duplicates: cat.duplicates, entries: rows };
}
