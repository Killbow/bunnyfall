// @ts-check
// BUNNYFALL (2026-11-05, the owner: "a map editor for the overworld of daggerfall ... build new buildings", asked: the
// models from Daggerfall's own files): A DAGGERFALL MODEL AS AN IMPORT. The game's own model (ARCH3D.BSA through the data
// pipeline - scenes/dataPipeline.js getGpuMesh, its `cpuModels` the same arrays dfMeshToModel built) handed to the POI
// importer in the shape the glTF reader hands it (poi/poiImport.js prepareImport's `model` and `baked`): one part, its
// submeshes a run per picture, each picture the game's texture record as a PNG. Then the import goes the way a GLB does:
// held to the mesh law, uploaded by its hash, placed, approved and stood by the POI runtime.
//
// The frames agree: a POI mesh is in dfMeshToModel's frame (poi/poiMesh.js). Only V differs - a game model's V runs
// negative from the picture's bottom (world/meshReader.js), a POI's down from its top (glTF's) - so V' = 1 - V, and the
// picture's rows go top first (the game's Color32 rows run from the bottom).
// Also its catalogue: the building models Daggerfall's town blocks stand, by the kind of block (`dfModelCatalog`).
import { encodePng } from './poiThumb.js';
import { RMB_BLOCK_PREFIXES } from '../formats/mapsFile.js';

/** The block kinds, by BLOCKS.BSA's name prefix, as a builder reads them. */
export const DF_MODEL_KINDS = Object.freeze({
  RESI: 'Houses', TVRN: 'Taverns', GENR: 'General stores', WEAP: 'Weaponsmiths', ARMR: 'Armourers', ALCH: 'Alchemists',
  BANK: 'Banks', BOOK: 'Bookstores', CLOT: 'Clothiers', FURN: 'Furniture stores', GEMS: 'Gem stores', LIBR: 'Libraries',
  PAWN: 'Pawnshops', TEMP: 'Temples', PALA: 'Palaces', FARM: 'Farms', DUNG: 'Dungeon entrances', CAST: 'Castles',
  MANR: 'Manors', SHRI: 'Shrines', RUIN: 'Ruins', SHCK: 'Shacks', GRVE: 'Graveyards', FILL: 'Fillers', MAGE: 'Mages Guild',
  THIE: 'Thieves Guild', DARK: 'Dark Brotherhood', FIGH: 'Fighters Guild', CUST: 'Custom', WALL: 'Town walls',
  MARK: 'Markets', SHIP: 'Ships', WITC: 'Witch covens', KNIG: 'Knightly orders',
});
const kindOf = (/** @type {string} */ prefix) => (prefix.startsWith('K') && RMB_BLOCK_PREFIXES.includes(prefix) ? 'KNIG' : prefix);

/**
 * THE CATALOGUE: every model the town blocks stand as a building or a piece of a town, by kind - `[{ kind, name, ids }]`
 * (a model a kind of block stands is in that kind's list, whichever others stand it too). Read off BLOCKS.BSA (formats/blocksFile.js), once.
 * @param {any} blocks a loaded BlocksFile
 */
export function dfModelCatalog(blocks) {
  /** @type {Map<string, Set<number>>} */
  const byKind = new Map();
  for (let b = 0; b < (blocks?.count ?? 0); b++) {
    const name = blocks.getBlockName(b) ?? '';
    if (!/\.RMB$/i.test(name)) continue;
    const kind = kindOf(name.slice(0, 4).toUpperCase());
    let blk = null;
    try { blk = blocks.getBlock(b); } catch { continue; }
    const rmb = blk?.rmbBlock;
    if (!rmb) continue;
    const ids = byKind.get(kind) ?? new Set();
    for (const sub of rmb.subRecords ?? []) for (const o of sub?.exterior?.block3dObjectRecords ?? []) if (o?.modelIdNum > 0) ids.add(o.modelIdNum);
    for (const o of rmb.misc3dObjectRecords ?? []) if (o?.modelIdNum > 0) ids.add(o.modelIdNum);
    byKind.set(kind, ids);
  }
  const order = Object.keys(DF_MODEL_KINDS);
  return [...byKind.entries()].filter(([, ids]) => ids.size)
    .sort(([a], [b]) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
    .map(([kind, ids]) => ({ kind, name: DF_MODEL_KINDS[kind] ?? `Other (${kind})`, ids: [...ids].sort((x, y) => x - y) }));
}

/** A game texture record as a PNG and as its RGBA, rows top first: `{ png, rgba }`. Null when the archive or the record is not there. */
export async function dfTexturePng(/** @type {(a: number) => Promise<any>} */ getTexture, /** @type {number} */ archive, /** @type {number} */ record) {
  const t = await getTexture(archive);
  const bm = t?.getDFBitmap?.(record, 0);
  if (!bm) return null;
  const c = t.getColor32(bm, -1);
  const { width: w, height: h, colors } = c;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) data.set(colors.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  const rgba = { width: w, height: h, data };
  return { png: encodePng(rgba), rgba };
}

/**
 * THE IMPORT: model `id` as prepareImport takes a glTF's - `{ model, baked }`, or null when the game has no such model.
 * @param {number} id @param {{ getGpuMesh: (id: number) => any, cpuModels: Map<number, any>, getTexture: (a: number) => Promise<any> }} pipe
 */
export async function dfModelAsImport(id, { getGpuMesh, cpuModels, getTexture }) {
  try { await getGpuMesh(id); } catch { return null; }
  const m = cpuModels.get(id);
  if (!m?.positions?.length || !m.uvs || !m.normals) return null;
  // one picture a texture record, one material a picture
  const images = [], materials = [], matOf = new Map(), runs = [];
  for (const sm of m.subMeshes ?? []) {
    const key = `${sm.textureArchive}_${sm.textureRecord}`;
    let mi = matOf.get(key);
    if (mi == null) {
      const pic = await dfTexturePng(getTexture, sm.textureArchive, sm.textureRecord).catch(() => null);
      let image = null;
      if (pic) { image = images.length; images.push({ name: `TEXTURE.${String(sm.textureArchive).padStart(3, '0')} ${sm.textureRecord}`, bytes: pic.png, rgba: pic.rgba }); }
      mi = materials.length;
      materials.push({ name: key, base: image == null ? null : { image, wrap: ['repeat', 'repeat'], filter: 'nearest' }, color: [1, 1, 1, 1] });
      matOf.set(key, mi);
    }
    runs.push({ start: sm.startIndex, count: sm.primitiveCount * 3, mi });
  }
  // the indices reordered a run per material, in order
  const byMat = new Map();
  for (const r of runs) { const l = byMat.get(r.mi) ?? []; l.push(r); byMat.set(r.mi, l); }
  const idx = [], submeshes = [], mats = [];
  for (const [mi, list] of byMat) {
    const start = idx.length;
    for (const r of list) for (let i = 0; i < r.count; i++) idx.push(m.indices[r.start + i]);
    submeshes.push({ start, count: idx.length - start });
    mats.push(mi);
  }
  const uvs = new Float32Array(m.uvs.length);
  for (let i = 0; i < uvs.length; i += 2) { uvs[i] = m.uvs[i]; uvs[i + 1] = 1 - m.uvs[i + 1]; }
  const name = `Daggerfall model ${id}`;
  const mesh = { positions: Float32Array.from(m.positions), normals: Float32Array.from(m.normals), uvs, indices: Uint32Array.from(idx), submeshes };
  return {
    model: { name, images, materials, lights: [], warnings: [] },
    baked: [{ name, position: [0, 0, 0], mesh, materials: mats }],
    /** for poi/poiThumb.js renderThumb: the model with its pictures */
    thumb: [{ mesh, materials: mats.map((mi) => ({ picture: materials[mi].base ? images[materials[mi].base.image].rgba : null, wrap: ['repeat', 'repeat'] })) }],
  };
}
