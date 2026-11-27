// @ts-check
// Reads and writes POI packs (.zip), checked against the POI rules before anything is fetched or trusted.

import { zipStore } from '../saves/saveTransfer.js';
import { poiDocProblems, poiShelfProblems, poiAssetsOf, poiAssetProblems, poiDocBytesOf } from './poiLaw.js';
import { decodePoiMesh, poiMeshFacts, POI_MESH_LIMITS } from './poiMesh.js';
import { poiImageMetaOf, POI_IMAGE_LIMITS } from './poiImage.js';
import { poiSha256 } from './poiService.js';

export const POI_PACK_VERSION = 1;
export const POI_PACK_KIND = 'poi-pack';
const MAX_POIS = 500, MAX_SHELF = 2000;
export const POI_PACK_LIMITS = Object.freeze({
  pois: MAX_POIS, shelf: MAX_SHELF, files: 20000,
  headBytes: MAX_POIS * poiDocBytesOf(2) + MAX_SHELF * poiDocBytesOf(1) + 65536, bytes: 1024 * 1024 * 1024,
});
const EXT = { png: 'png', jpeg: 'jpg', webp: 'webp' };
const ASSET_RE = /^assets\/([0-9a-f]{64})\.(mesh|png|jpg|webp)$/;
const bytesOf = (d) => /** @type {Uint8Array} */ (d instanceof Uint8Array ? d : new Uint8Array(d));

export function packAssetName(sha, bytes) {
  const im = poiImageMetaOf(bytes);
  return `assets/${sha}.${'error' in im ? 'mesh' : EXT[im.format]}`;
}

/**
 * @param {{ pois?: any[], shelf?: any[] }} what
 */
export function packRefusal({ pois = [], shelf = [] }) {
  if (pois.length > POI_PACK_LIMITS.pois || shelf.length > POI_PACK_LIMITS.shelf) return { code: 'pack-too-large' };
  for (const [i, d] of pois.entries()) { const ps = poiDocProblems(d); if (ps.length) return { code: 'pack-bad-poi', index: i, name: String(d?.name ?? ''), problem: ps[0], problems: ps }; }
  for (const [i, d] of shelf.entries()) { const ps = poiShelfProblems(d); if (ps.length) return { code: 'pack-bad-entry', index: i, name: String(d?.name ?? ''), problem: ps[0], problems: ps }; }
  const twice = (/** @type {any[]} */ list, /** @type {string} */ code) => {
    const seen = new Set();
    for (const [i, d] of list.entries()) { if (seen.has(d.id)) return { code, index: i, id: d.id, name: String(d.name) }; seen.add(d.id); }
    return null;
  };
  return twice(pois, 'pack-poi-twice') ?? twice(shelf, 'pack-entry-twice');
}

function wornRefusal(pois, shelf, factsOf) {
  const worn = (/** @type {any[]} */ list, /** @type {string} */ code) => {
    for (const [i, d] of list.entries()) { const ps = poiAssetProblems(d, factsOf); if (ps.length) return { code, index: i, name: String(d.name), problem: ps[0], problems: ps }; }
    return null;
  };
  return worn(pois, 'pack-bad-poi') ?? worn(shelf, 'pack-bad-entry');
}
function factsOfBytes(bytes) {
  const im = poiImageMetaOf(bytes);
  if (!('error' in im)) return { kind: 'texture', w: im.w, h: im.h };
  const d = decodePoiMesh(bytes);
  return 'error' in d ? null : { kind: 'mesh', submeshes: d.mesh.submeshes.length };
}

/**
 * @param {{ pois?: any[], shelf?: any[], assets: Map<string, Uint8Array> }} p
 * @returns {{ ok: true, bytes: Uint8Array } | { ok: false, code: string, [arg: string]: any }}
 */
export function writePack({ pois = [], shelf = [], assets }) {
  const refused = packRefusal({ pois, shelf });
  if (refused) return { ok: false, ...refused };
  const named = new Set();
  for (const d of [...pois, ...shelf]) { const { meshes, textures } = poiAssetsOf(d); for (const s of [...meshes, ...textures]) named.add(s); }
  if (named.size + 1 > POI_PACK_LIMITS.files) return { ok: false, code: 'pack-too-large' };
  const head = new TextEncoder().encode(JSON.stringify({ v: POI_PACK_VERSION, kind: POI_PACK_KIND, pois, shelf }));
  const order = [...named].sort();
  let total = head.byteLength;
  for (const sha of order) {
    const bytes = assets.get(sha);
    if (!bytes) return { ok: false, code: 'pack-missing-asset', sha };
    total += bytes.byteLength;
  }
  if (total > POI_PACK_LIMITS.bytes) return { ok: false, code: 'pack-too-large' };
  /** @type {{ name: string, data: Uint8Array }[]} */
  const files = [{ name: 'pack.json', data: head }];
  const facts = new Map();
  for (const sha of order) {
    const bytes = assets.get(sha), f = factsOfBytes(bytes);
    if (!f) return { ok: false, code: 'pack-asset-bad', sha };
    facts.set(sha, f);
    files.push({ name: packAssetName(sha, bytes), data: bytes });
  }
  const worn = wornRefusal(pois, shelf, (sha) => facts.get(sha) ?? null);
  if (worn) return { ok: false, ...worn };
  return { ok: true, bytes: zipStore(files) };
}

/**
 * @param {string[]} names
 */
export function packRoot(names) {
  const real = names.filter((n) => !n.startsWith('__MACOSX/'));
  if (real.includes('pack.json')) return '';
  const top = /^[^/]+\//.exec(real[0] ?? '')?.[0];
  return top && real.every((n) => n.startsWith(top)) && real.includes(`${top}pack.json`) ? top : null;
}
function namedAssets(docs) {
  const named = new Map();
  for (const d of docs) {
    const { meshes, textures } = poiAssetsOf(d);
    for (const s of meshes) named.set(s, 'mesh');
    for (const s of textures) if (!named.has(s)) named.set(s, 'texture');
  }
  return named;
}

function readHead(bytes) {
  let pack;
  try { pack = JSON.parse(new TextDecoder().decode(bytes)); } catch { return { ok: false, code: 'pack-not-a-pack' }; }
  if (pack?.kind !== POI_PACK_KIND) return { ok: false, code: 'pack-not-a-pack' };
  if (pack.v !== POI_PACK_VERSION) return { ok: false, code: 'pack-version', v: pack.v };
  const pois = Array.isArray(pack.pois) ? pack.pois : [], shelf = Array.isArray(pack.shelf) ? pack.shelf : [];
  const refused = packRefusal({ pois, shelf });
  return refused ? { ok: false, ...refused } : { ok: true, pois, shelf };
}

/**
 * @param {{ name: string, data: ArrayBuffer | Uint8Array }[]} entries
 */
export async function readPack(entries, subtle = globalThis.crypto.subtle) {
  if (entries.length > POI_PACK_LIMITS.files) return { ok: false, code: 'pack-too-large' };
  const root = packRoot(entries.map((e) => e.name));
  const top = root == null ? null : entries.find((e) => e.name === `${root}pack.json`);
  if (!top) return { ok: false, code: 'pack-not-a-pack' };
  const h = readHead(bytesOf(top.data));
  if (!h.ok) return h;
  const { pois, shelf } = h;
  const named = namedAssets([...pois, ...shelf]);
  const assets = new Map();
  for (const e of entries) {
    const m = e.name.startsWith(root) ? ASSET_RE.exec(e.name.slice(root.length)) : null;
    if (!m || !named.has(m[1])) continue;
    const bytes = bytesOf(e.data);
    if ((await poiSha256(bytes, subtle)) !== m[1]) return { ok: false, code: 'pack-asset-hash', sha: m[1] };
    if (m[2] === 'mesh') {
      const d = decodePoiMesh(bytes);
      if ('error' in d) return { ok: false, code: 'pack-asset-bad', sha: m[1] };
      assets.set(m[1], { kind: 'mesh', bytes, ...poiMeshFacts(d.mesh) });
    } else {
      const im = poiImageMetaOf(bytes);
      if ('error' in im) return { ok: false, code: 'pack-asset-bad', sha: m[1] };
      assets.set(m[1], { kind: 'texture', bytes, w: im.w, h: im.h });
    }
  }
  for (const d of [...pois, ...shelf]) {
    const { meshes, textures } = poiAssetsOf(d);
    for (const s of meshes) if (assets.get(s)?.kind !== 'mesh') return { ok: false, code: 'pack-missing-asset', sha: s, name: String(d.name) };
    for (const s of textures) if (assets.get(s)?.kind !== 'texture') return { ok: false, code: 'pack-missing-asset', sha: s, name: String(d.name) };
  }
  const worn = wornRefusal(pois, shelf, (sha) => assets.get(sha) ?? null);
  if (worn) return { ok: false, ...worn };
  return { ok: true, pois, shelf, assets };
}

/**
 * @param {Uint8Array} bytes
 */
export async function readPackBytes(bytes, subtle = globalThis.crypto.subtle) {
  const { readZipEntries } = await import('../scenes/dataSource.js');
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const file = { arrayBuffer: async () => buf };
  try {
    let count = 0, root = null;
    const heads = await readZipEntries(file, {
      pick: (names) => { count = names.length; root = packRoot(names); return root == null || count > POI_PACK_LIMITS.files ? [] : [`${root}pack.json`]; },
      limit: () => POI_PACK_LIMITS.headBytes,
    });
    if (count > POI_PACK_LIMITS.files) return { ok: false, code: 'pack-too-large' };
    if (!heads.length) return { ok: false, code: 'pack-not-a-pack' };
    const h = readHead(bytesOf(heads[0].data));
    if (!h.ok) return h;
    const named = namedAssets([...h.pois, ...h.shelf]);
    const wanted = (n) => { const m = n.startsWith(root) ? ASSET_RE.exec(n.slice(root.length)) : null; return !!m && named.get(m[1]) === (m[2] === 'mesh' ? 'mesh' : 'texture'); };
    let room = POI_PACK_LIMITS.bytes - heads[0].data.byteLength;
    const assets = await readZipEntries(file, {
      pick: (names) => names.filter(wanted),
      limit: (name, size) => { const max = Math.min(name.endsWith('.mesh') ? POI_MESH_LIMITS.bytes : POI_IMAGE_LIMITS.bytes, room); room -= size; return max; },
    });
    return await readPack([...heads, ...assets], subtle);
  } catch (e) {
    return { ok: false, code: e?.code === 'zip-too-large' ? 'pack-too-large' : 'pack-not-a-pack' };
  }
}
