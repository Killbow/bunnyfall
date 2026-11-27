// @ts-check
// Prepares a baked glTF model as a POI import, with parts held to the mesh rules, and uploads its
// meshes and images.

import { encodePoiMesh, poiMeshError } from './poiMesh.js';
import { poiImageMetaOf } from './poiImage.js';
import { poiMaterialOf, poiLightOf } from './gltfImport.js';
import { lawName, newLight } from './poiEdit.js';

/**
 * @param {any} model
 * @param {any[]} baked
 */
export function prepareImport(model, baked) {
  const warnings = [...(model.warnings ?? [])];
  const images = (model.images ?? []).map((im, i) => {
    const meta = poiImageMetaOf(im.bytes);
    if ('error' in meta) { warnings.push({ code: 'image-format', image: i, why: meta.error }); return null; }
    return { index: i, name: im.name, bytes: im.bytes, meta };
  });
  const parts = [], refused = [];
  for (const p of baked) {
    const code = p.refused ?? poiMeshError(p.mesh);
    if (code) { refused.push({ name: p.name, code }); continue; }
    const materials = p.materials.map((mi) => {
      const m = poiMaterialOf(model.materials?.[mi]);
      if (m.texture !== null && !images[m.texture]) m.texture = null;
      if (m.emissive !== null && !images[m.emissive]) m.emissive = null;
      return m;
    });
    parts.push({
      name: lawName(p.name) || lawName(model.name),
      position: [...p.position],
      bytes: encodePoiMesh(p.mesh),
      submeshes: p.mesh.submeshes.length,
      vertices: p.mesh.positions.length / 3,
      triangles: p.mesh.indices.length / 3,
      materials,
    });
  }
  const lights = (model.lights ?? []).map((l) => poiLightOf(l, newLight()));
  return { name: lawName(model.name), parts, lights, images, warnings, refused };
}

/**
 * @param {ReturnType<typeof prepareImport>} prep
 * @param {(bytes: Uint8Array, kind: 'mesh' | 'texture') => Promise<any>} put
 * @param {(done: number, of: number) => void} [progress]
 */
export async function uploadImport(prep, put, progress = () => {}) {
  const metas = new Map();
  const worn = new Set();
  for (const p of prep.parts) for (const m of p.materials) { if (m.texture !== null) worn.add(m.texture); if (m.emissive !== null) worn.add(m.emissive); }
  const total = worn.size + prep.parts.length;
  let done = 0;
  const shaOfImage = new Map();
  for (const i of worn) {
    const im = prep.images[i];
    const r = await put(im.bytes, 'texture');
    if (!r.ok) return { ok: false, error: r.error, ...(r.why ? { why: r.why } : {}), image: im.name };
    shaOfImage.set(i, r.data.sha);
    metas.set(r.data.sha, { kind: 'texture', ...r.data.meta, bytes: im.bytes.byteLength });
    progress(++done, total);
  }
  const parts = [];
  for (const p of prep.parts) {
    const r = await put(p.bytes, 'mesh');
    if (!r.ok) return { ok: false, error: r.error, ...(r.why ? { why: r.why } : {}), part: p.name };
    metas.set(r.data.sha, { kind: 'mesh', ...r.data.meta, bytes: p.bytes.byteLength });
    parts.push({
      name: p.name, mesh: r.data.sha, submeshes: p.submeshes, t: p.position,
      materials: p.materials.map((m) => ({ ...m, texture: m.texture === null ? null : shaOfImage.get(m.texture), emissive: m.emissive === null ? null : shaOfImage.get(m.emissive) })),
    });
    progress(++done, total);
  }
  return { ok: true, asset: { name: prep.name, parts, lights: structuredClone(prep.lights ?? []) }, metas };
}
