// @ts-check
// Exports POIs to a pack and imports a pack onto the shelf and into the editor.

import { writeGlb } from './gltfExport.js';
import { writePack, packRefusal } from './poiPack.js';
import { poiAssetsOf, mintShelfId } from './poiLaw.js';
import { decodePoiMesh } from './poiMesh.js';
import { poiImageMetaOf } from './poiImage.js';
import { poiSha256 } from './poiService.js';

/** @param {string} name */
export const fileNameOf = (name, ext, fallback = 'poi') => `${String(name ?? '').replace(/[^\p{L}\p{N} _-]+/gu, '').trim().replace(/\s+/g, '-').slice(0, 64) || fallback}.${ext}`;

/**
 * @param {{ name: string, parts: any[], lights?: any[] }} model
 * @param {(sha: string) => Promise<Uint8Array>} fetchAsset
 */
export async function exportModel({ name, parts, lights = [] }, fetchAsset) {
  const pieces = [], pictures = new Map();
  for (const p of parts) {
    let bytes;
    try { bytes = await fetchAsset(p.mesh); } catch { return { ok: false, code: 'export-fetch', sha: p.mesh }; }
    const d = decodePoiMesh(bytes);
    if ('error' in d) return { ok: false, code: 'export-fetch', sha: p.mesh };
    pieces.push({ ...p, mesh: d.mesh });
    for (const m of p.materials) {
      for (const sha of [m.texture, m.emissive]) {
        if (!sha || pictures.has(sha)) continue;
        let pic;
        try { pic = await fetchAsset(sha); } catch { return { ok: false, code: 'export-fetch', sha }; }
        const im = poiImageMetaOf(pic);
        if ('error' in im) return { ok: false, code: 'export-fetch', sha };
        pictures.set(sha, { bytes: pic, format: im.format });
      }
    }
  }
  return { ok: true, bytes: writeGlb({ name, parts: pieces, lights, pictures }) };
}

/**
 * @param {{ pois?: any[], shelf?: any[] }} what
 * @param {(sha: string) => Promise<Uint8Array>} fetchAsset
 */
export async function exportPack({ pois = [], shelf = [] }, fetchAsset) {
  const refused = packRefusal({ pois, shelf });
  if (refused) return { ok: false, ...refused };
  const assets = new Map();
  for (const d of [...pois, ...shelf]) {
    const { meshes, textures } = poiAssetsOf(d);
    for (const sha of [...meshes, ...textures]) {
      if (assets.has(sha)) continue;
      try { assets.set(sha, await fetchAsset(sha)); } catch { return { ok: false, code: 'export-fetch', sha }; }
    }
  }
  return writePack({ pois, shelf, assets });
}

const contentOf = (entry) => JSON.stringify(inOrder({ ...entry, id: null }));
const inOrder = (v) => (Array.isArray(v) ? v.map(inOrder)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, inOrder(v[k])])) : v);
export const POI_COPY_IDS = 8;
export const copyIdOf = async (entry, k, content = contentOf(entry)) => `lib-${(await poiSha256(new TextEncoder().encode(`${entry.id}\n${k}\n${content}`))).slice(0, 12)}`;

async function shelveOne(entry, { shelfEntry, shelve, rand }) {
  const content = contentOf(entry);
  for (let k = -1; k <= POI_COPY_IDS; k++) {
    const id = k < 0 ? entry.id : k < POI_COPY_IDS ? await copyIdOf(entry, k, content) : mintShelfId(rand);
    const had = await shelfEntry(id);
    if (had.ok) { if (contentOf(had.data.item) === content) return { ok: true, id, copied: k >= 0, already: true }; continue; }
    // A 'poi-gone' id is skipped and never overwritten; the next id is tried.
    if (had.error === 'poi-gone') continue;
    if (had.error !== 'not-found') return had;
    const r = await shelve(k < 0 ? entry : { ...entry, id });
    if (r.ok) return { ok: true, id, copied: k >= 0, already: false };
    if (r.error !== 'poi-not-author' && r.error !== 'poi-gone') return r;
  }
  return { ok: false, error: 'poi-not-author' };
}

/**
 * @param {{ pois: any[], shelf: any[], assets: Map<string, { kind: string, bytes: Uint8Array }> }} pack
 * @param {{ putAsset: (bytes: Uint8Array, kind: any) => Promise<any>, history: (id: string) => Promise<any>,
 *   shelfEntry: (id: string) => Promise<any>, shelve: (item: any) => Promise<any>, rand: (b: Uint8Array) => Uint8Array,
 *   progress?: (done: number, of: number) => void }} io
 */
export async function importPack(pack, { putAsset, history, shelfEntry, shelve, rand, progress = () => {} }) {
  const total = pack.assets.size + pack.shelf.length + pack.pois.length;
  let done = 0, uploaded = 0, existed = 0, shelved = 0, copied = 0, already = 0;
  const refusal = (r, at) => ({ ok: false, error: r.error, at, ...(r.problems ? { problems: r.problems } : {}) });
  for (const [sha, a] of pack.assets) {
    const r = await putAsset(a.bytes, a.kind);
    if (!r.ok) return refusal(r, sha);
    if (r.data.existed) existed++; else uploaded++;
    progress(++done, total);
  }
  for (const entry of pack.shelf) {
    const r = await shelveOne(entry, { shelfEntry, shelve, rand });
    if (!r.ok) return refusal(r, entry.name);
    shelved++;
    if (r.copied) copied++;
    if (r.already) already++;
    progress(++done, total);
  }
  const open = [];
  for (const doc of pack.pois) {
    const h = await history(doc.id);
    if (h.ok) {
      const live = h.data.revs?.find((x) => x.rev === h.data.liveRev)?.doc ?? null;
      open.push({ id: doc.id, doc, saved: live, base: h.data.liveRev ?? null, state: h.data.liveRev ? 'live' : 'draft' });
    } else if (h.error === 'not-found') {
      open.push({ id: doc.id, doc, saved: null, base: null, state: 'new' });
    } else return refusal(h, doc.name);
    progress(++done, total);
  }
  return { ok: true, open, shelved, copied, already, uploaded, existed };
}
