// @ts-check
// Meshes keep Unity's frame and winding; uv0 is used as is because textures upload bottom row first.
import { galleonPrefab, GALLEON_PREFAB_ID } from '../../world/galleonModel.js';
import { carrackPrefab, CARRACK_PREFAB_ID } from '../../world/carrackModel.js';
import { largeBoatPrefab, LARGE_BOAT_PREFAB_ID } from '../../world/largeBoatModel.js';

export const CSA_MODEL_URLS = Object.freeze({
  prefabs: new URL('../../../vendor/come-sail-away/Models/prefabs.json', import.meta.url).href,
  meshes: new URL('../../../vendor/come-sail-away/Models/meshes.json', import.meta.url).href,
  bin: new URL('../../../vendor/come-sail-away/Models/meshes.bin', import.meta.url).href,
  materials: new URL('../../../vendor/come-sail-away/Models/materials.json', import.meta.url).href,
  animation: new URL('../../../vendor/come-sail-away/Models/animation.json', import.meta.url).href,
});
export const GALLEON_MODEL_URL = new URL('../../assets/galleon/galleon.json', import.meta.url).href;
export const CARRACK_MODEL_URL = new URL('../../assets/ships/carrack.json', import.meta.url).href;
export const LARGE_BOAT_MODEL_URL = new URL('../../assets/ships/largeBoat.json', import.meta.url).href;
export const PORT_SHIPS = Object.freeze([
  Object.freeze({ key: 'galleon', hull: 2, id: GALLEON_PREFAB_ID, title: 'galleon', reads: Object.freeze([GALLEON_PREFAB_ID]), build: (bake, csa) => galleonPrefab(bake, csa) }),
  Object.freeze({ key: 'carrack', hull: 4, id: CARRACK_PREFAB_ID, title: 'carrack', reads: Object.freeze([CARRACK_PREFAB_ID, GALLEON_PREFAB_ID]), build: (bake, csa, base) => carrackPrefab(bake, csa, base) }),
  Object.freeze({ key: 'largeBoat', hull: 1, id: LARGE_BOAT_PREFAB_ID, title: 'large boat', reads: Object.freeze([LARGE_BOAT_PREFAB_ID, GALLEON_PREFAB_ID]), build: (bake, csa, base) => largeBoatPrefab(bake, csa, base) }),
]);
const MOD_TITLES = Object.freeze({ galleon: 'galleon', carrack: 'carrack', largeBoat: 'large boat' });

export const windWidgetFrameUrl = (/** @type {number} */ i) => new URL(`../../../vendor/come-sail-away/Textures/112395_1-${i}.png`, import.meta.url).href;
export const waveDerivedUrl = new URL('../../../vendor/come-sail-away/Textures/derived.json', import.meta.url).href;
export const wavePaintUrl = (/** @type {string} */ name) => new URL(`../../../vendor/come-sail-away/Textures/${name}`, import.meta.url).href;
export const soundUrl = (/** @type {string} */ name) => new URL(`../../../vendor/come-sail-away/Sounds/${name}.ogg`, import.meta.url).href;

/** @returns {Promise<ReturnType<typeof comeSailAwayModels> | null>} */
export async function loadComeSailAwayModels(fetchFn = globalThis.fetch, urls = CSA_MODEL_URLS, log = console, galleonUrl = GALLEON_MODEL_URL,
  shipUrls = { carrack: CARRACK_MODEL_URL, largeBoat: LARGE_BOAT_MODEL_URL }) {
  if (!fetchFn) return null;
  try {
    const get = async (/** @type {string} */ url, /** @type {boolean} */ binary) => {
      const r = await fetchFn(url);
      if (!r || !r.ok) throw new Error(`${url}: ${r?.status ?? 'no answer'}`);
      return binary ? new Uint8Array(await r.arrayBuffer()) : r.json();
    };
    const own = (url) => (url ? get(url, false).then((json) => ({ ok: true, json, error: null }), (error) => ({ ok: false, json: null, error })) : null);
    const shipAt = { galleon: galleonUrl, carrack: shipUrls?.carrack ?? null, largeBoat: shipUrls?.largeBoat ?? null };
    const [prefabs, meshes, bin, materials, animation, ...answers] = await Promise.all([
      get(urls.prefabs, false), get(urls.meshes, false), get(urls.bin, true), get(urls.materials, false), get(urls.animation, false),
      ...PORT_SHIPS.map((ship) => own(shipAt[ship.key])),
    ]);
    const ships = {};
    let base = prefabs.components.length;
    PORT_SHIPS.forEach((ship, k) => {
      const answer = answers[k];
      if (!answer) return;
      const standsAs = `hull ${ship.hull} stands as the mod's own ${MOD_TITLES[ship.key]}`;
      if (!answer.ok) { log?.warn?.(`[come-sail-away] the new ${ship.title} did not load - ${standsAs}`, answer.error); return; }
      try { base += shipBuilt(ship, answer.json, prefabs, base).components.length; ships[ship.key] = answer.json; } catch (e) {
        log?.warn?.(`[come-sail-away] the new ${ship.title} would not build - ${standsAs}`, e);
      }
    });
    return comeSailAwayModels({ prefabs, meshes, bin, materials, animation, ...ships });
  } catch (e) {
    log?.warn?.('[come-sail-away] the boats\' models did not load - no boat can stand', e);
    return null;
  }
}

/** @param {{ prefabs: { prefabs: Record<string, any>, components: any[] }, meshes: Record<string, any>, bin: Uint8Array, materials: Record<string, any>, animation: any, galleon?: any, carrack?: any, largeBoat?: any }} files */
export function comeSailAwayModels({ prefabs, meshes, bin, materials, animation, galleon = null, carrack = null, largeBoat = null }) {
  const decoded = new Map();
  let prefabTable = prefabs.prefabs, components = prefabs.components, meshTable = meshes, anim = animation;
  const bakes = { galleon, carrack, largeBoat };
  const standing = PORT_SHIPS.filter((ship) => bakes[ship.key]);
  if (standing.length) {
    prefabTable = { ...prefabs.prefabs };
    const added = [];
    meshTable = { ...meshes };
    anim = { ...animation, overrides: { ...animation.overrides }, clips: { ...animation.clips } };
    let base = prefabs.components.length;
    for (const ship of standing) {
      const g = shipBuilt(ship, bakes[ship.key], prefabs, base);
      prefabTable[String(ship.id)] = g.prefab;
      added.push(...g.components);
      base += g.components.length;
      for (const [key, geo] of Object.entries(g.meshes)) {
        meshTable[key] = ship.key === 'galleon' ? { vertexCount: geo.vertexCount, aabb: geo.aabb, galleon: true, port: ship.key } : { vertexCount: geo.vertexCount, aabb: geo.aabb, port: ship.key };
        decoded.set(key, geo);
      }
      Object.assign(anim.overrides, g.animation.overrides);
      Object.assign(anim.clips, g.animation.clips);
    }
    components = [...prefabs.components, ...added];
  }
  return {
    prefabs: prefabTable,
    components,
    meshes: meshTable,
    materials,
    animation: anim,
    galleon: !!galleon,
    carrack: !!carrack,
    largeBoat: !!largeBoat,
    prefab: (/** @type {number} */ id) => prefabTable[String(id)] ?? null,
    geometry(/** @type {string} */ key) {
      if (decoded.has(key)) return decoded.get(key);
      const entry = meshes[key];
      const g = entry ? decodeMeshGeometry(entry, bin) : null;
      decoded.set(key, g);
      return g;
    },
  };
}

// Built prefabs are cached per process and shared: boats copy them on instancing and never write to them.
const _built = new Map();
function shipBuilt(ship, json, prefabs, base) {
  const bake = JSON.stringify(json), old = JSON.stringify(ship.reads.map((id) => prefabs.prefabs[String(id)] ?? null));
  const was = _built.get(ship.key);
  if (was && was.sha256 === json.sha256 && was.bake === bake && was.base === base && was.old === old) return was.built;
  if (ship.key === 'galleon' && base !== prefabs.components.length) throw new Error('come-sail-away: the galleon\'s components come first');
  const built = ship.build(json, prefabs, base);
  _built.set(ship.key, { sha256: json.sha256, bake, base, old, built });
  return built;
}

/** @param {number[]} m */
export function matrixFromUnityRows(m) {
  const out = new Float32Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) out[c * 4 + r] = m[r * 4 + c];
  return out;
}

/**
 * @param {any} entry
 * @param {Uint8Array} bin
 */
export function decodeMeshGeometry(entry, bin) {
  const n = entry.vertexCount;
  const at = (/** @type {any} */ a, count) => new Float32Array(bin.buffer.slice(bin.byteOffset + a.offset, bin.byteOffset + a.offset + count * 4));
  const positions = at(entry.attributes.position, n * 3);
  const nd = entry.attributes.normal?.dim ?? 3;
  const rawNormals = entry.attributes.normal ? at(entry.attributes.normal, n * nd) : null;
  let normals = rawNormals;
  if (rawNormals && nd !== 3) {
    normals = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) for (let d = 0; d < 3; d++) normals[v * 3 + d] = rawNormals[v * nd + d];
  }
  if (!normals) normals = new Float32Array(n * 3);
  const uvs = entry.attributes.uv0 ? at(entry.attributes.uv0, n * 2) : new Float32Array(n * 2);
  const ix = entry.indices;
  const raw = ix.type === 'u32'
    ? new Uint32Array(bin.buffer.slice(bin.byteOffset + ix.offset, bin.byteOffset + ix.offset + ix.count * 4))
    : new Uint16Array(bin.buffer.slice(bin.byteOffset + ix.offset, bin.byteOffset + ix.offset + ix.count * 2));
  const indices = new Uint32Array(ix.count);
  const subMeshes = [];
  for (const s of entry.submeshes) {
    for (let i = s.start; i < s.start + s.count; i++) indices[i] = raw[i] + s.baseVertex;
    subMeshes.push({ startIndex: s.start, primitiveCount: s.count / 3 });
  }
  const bi = entry.attributes.blendIndices;
  const blendIndices = bi ? new Uint16Array(bin.buffer.slice(bin.byteOffset + bi.offset, bin.byteOffset + bi.offset + n * 2)) : null;
  return {
    vertexCount: n,
    positions, normals, uvs, indices, subMeshes,
    blendIndices,
    bindPoses: entry.bindPoses ? entry.bindPoses.map(matrixFromUnityRows) : null,
    aabb: entry.aabb,
  };
}

export function bundleSlots(renderer) {
  return (renderer.m_Materials ?? []).map((m) => (m && m.material ? { bundle: m.material } : null));
}
export const dfMaterial = (archive, record) => ({ archive, record });
export const isDfMaterial = (slot) => !!slot && Number.isInteger(slot.archive) && Number.isInteger(slot.record);

// As in the C#, an out-of-range entry drops all of that component's writes, yet it still counts as applied.
/**
 * @param {{ components: any[] }} node
 * @returns {number}
 */
export function applyRuntimeMaterials(node) {
  const renderer = node.components.find((c) => c.type === 'MeshRenderer');
  if (!renderer) return 0;
  renderer.materials ??= bundleSlots(renderer);
  let written = 0;
  for (const c of node.components) {
    if (c.type !== 'MonoBehaviour' || c.m_Script?.script !== 'RuntimeMaterials') continue;
    if (!c.Materials?.length || c.hasAppliedMaterials) continue;
    const materials = [...renderer.materials];
    let n = 0;
    let inRange = true;
    for (const m of c.Materials) {
      if (!(m.Index >= 0 && m.Index < materials.length)) { inRange = false; break; }
      materials[m.Index] = dfMaterial(m.Archive, m.Record);
      n++;
    }
    if (inRange) { renderer.materials = materials; written += n; }
    c.hasAppliedMaterials = 1;
  }
  return written;
}

// Mirrors Convert.ToInt32: surrounding spaces are allowed, and null is returned where the C# throws.
/** @param {string} name */
export function gameTextureFromName(name) {
  const i = name.indexOf('_');
  if (i < 0) return null;
  const toInt = (/** @type {string} */ s) => (/^\s*[+-]?\d+\s*$/.test(s) ? Number.parseInt(s.trim(), 10) : null);
  const archive = toInt(name.substring(0, i)), record = toInt(name.substring(i + 1));
  return archive == null || record == null ? null : dfMaterial(archive, record);
}

// Unity's rule: extra materials redraw the last submesh, and submeshes past the last material are not drawn.
/**
 * @param {ReturnType<typeof decodeMeshGeometry>} g
 * @param {any[]} slots
 */
export function rendererModel(g, slots) {
  if (!g || !slots?.length || !g.subMeshes.length) return null;
  const subMeshes = [];
  for (let k = 0; k < slots.length; k++) {
    const s = slots[k];
    if (!isDfMaterial(s)) continue;
    const sm = g.subMeshes[Math.min(k, g.subMeshes.length - 1)];
    if (!sm.primitiveCount) continue;
    subMeshes.push({ textureArchive: s.archive, textureRecord: s.record, startIndex: sm.startIndex, primitiveCount: sm.primitiveCount });
  }
  if (!subMeshes.length) return null;
  return { positions: g.positions, normals: g.normals, uvs: g.uvs, indices: g.indices, subMeshes, doors: [] };
}

export function rendererModelKey(meshKey, slots) {
  return `csa:${meshKey}|${(slots ?? []).map((s) => (isDfMaterial(s) ? `${s.archive}_${s.record}` : '-')).join(',')}`;
}
