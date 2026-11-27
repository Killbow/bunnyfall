// @ts-check

import { POI_MESH_LIMITS } from './poiMesh.js';
import { POI_LIMITS } from './poiLaw.js';
import { linearToSrgb } from '../weather/dynamicSkies.js';

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

export const GLTF_SUPPORTED_EXTENSIONS = Object.freeze([
  'KHR_texture_transform', 'KHR_materials_emissive_strength', 'KHR_materials_unlit', 'EXT_texture_webp', 'KHR_mesh_quantization',
]);

const GLTF_QUIET_EXTENSIONS = Object.freeze([
  'KHR_lights_punctual', 'KHR_materials_anisotropy', 'KHR_materials_clearcoat', 'KHR_materials_diffuse_transmission',
  'KHR_materials_dispersion', 'KHR_materials_ior', 'KHR_materials_iridescence', 'KHR_materials_sheen', 'KHR_materials_specular',
  'KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_variants', 'KHR_texture_basisu', 'EXT_texture_avif',
  'KHR_xmp_json_ld', 'KHR_animation_pointer',
]);

export const GLTF_READ_LIMITS = Object.freeze({ accessor: POI_MESH_LIMITS.indices, total: 8 * POI_MESH_LIMITS.indices });

const COMPONENT = {
  5120: { array: Int8Array, size: 1, norm: (v) => Math.max(v / 127, -1) },
  5121: { array: Uint8Array, size: 1, norm: (v) => v / 255 },
  5122: { array: Int16Array, size: 2, norm: (v) => Math.max(v / 32767, -1) },
  5123: { array: Uint16Array, size: 2, norm: (v) => v / 65535 },
  5125: { array: Uint32Array, size: 4, norm: (v) => v / 4294967295 },
  5126: { array: Float32Array, size: 4, norm: (v) => v },
};
const INDEX_COMPONENTS = [5121, 5123, 5125];
const TYPE_SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const WRAP = { 33071: 'clamp', 33648: 'mirror', 10497: 'repeat' };

class GltfError extends Error {
  /**
   * @param {string} code
   * @param {Record<string, any>} [args]
   * @param {unknown} [cause]
   */
  constructor(code, args = {}, cause = undefined) { super(code, cause === undefined ? undefined : { cause }); this.code = code; this.args = args; }
}
/**
 * @param {string} code
 * @param {Record<string, any>} [args]
 * @returns {never}
 */
const fail = (code, args = {}) => { throw new GltfError(code, args); };
const gltfErrorOf = (e) => (e instanceof GltfError ? e : new GltfError('malformed', {}, e));
const whole = (v) => Number.isInteger(v) && v >= 0;

const B64 = new Int16Array(128).fill(-1);
for (let i = 0; i < 64; i++) B64['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.charCodeAt(i)] = i;
B64['-'.charCodeAt(0)] = 62; B64['_'.charCodeAt(0)] = 63;
/** @param {string} text */
function base64Bytes(text) {
  const out = new Uint8Array(Math.floor(text.length * 3 / 4) + 3);
  let n = 0, acc = 0, bits = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const v = c < 128 ? B64[c] : -1;
    if (v < 0) { if (text[i] === '=' || /\s/.test(text[i])) continue; fail('data-uri'); }
    acc = (acc << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out[n++] = (acc >> bits) & 255; }
  }
  return out.slice(0, n);
}

/** @param {string} uri */
function dataUriBytes(uri) {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(uri);
  if (!m) fail('data-uri');
  if (m[2]) return { bytes: base64Bytes(m[3]), mime: m[1] || null };
  let text;
  try { text = decodeURIComponent(m[3]); } catch { fail('data-uri'); }
  return { bytes: new TextEncoder().encode(text), mime: m[1] || null };
}

function fileOf(uri, files) {
  const tries = [uri, (() => { try { return decodeURIComponent(uri); } catch { return uri; } })()];
  for (const t of [...tries]) tries.push(t.split('/').pop());
  for (const t of tries) if (files.has(t)) return files.get(t);
  return fail('file-missing', { uri });
}

/** @param {Uint8Array} bytes */
function containerOf(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength >= 12 && dv.getUint32(0, true) === GLB_MAGIC) {
    if (dv.getUint32(4, true) !== 2) fail('not-gltf2');
    const total = Math.min(dv.getUint32(8, true), bytes.byteLength);
    let at = 12, json = null, bin = null;
    while (at + 8 <= total) {
      const len = dv.getUint32(at, true), type = dv.getUint32(at + 4, true);
      const body = bytes.subarray(at + 8, at + 8 + len);
      if (body.byteLength !== len) fail('glb-chunk');
      if (type === CHUNK_JSON && !json) {
        try { json = JSON.parse(new TextDecoder().decode(body)); } catch { fail('glb-chunk'); }
      } else if (type === CHUNK_BIN && !bin) bin = body;
      at += 8 + len + ((4 - (len % 4)) % 4);
    }
    if (!json) fail('glb-no-json');
    return { json, bin };
  }
  let json;
  try { json = JSON.parse(new TextDecoder().decode(bytes)); } catch { fail('not-gltf'); }
  return { json, bin: null };
}

/**
 * @param {Uint8Array} input
 * @param {{ files?: Map<string, Uint8Array> }} [opts]
 */
export function readGltf(input, opts = {}) {
  try { return readModel(input, opts); } catch (e) { throw gltfErrorOf(e); }
}

/**
 * @param {Uint8Array} input
 * @param {{ files?: Map<string, Uint8Array> }} [opts]
 */
function readModel(input, { files = new Map() } = {}) {
  /** @type {{ code: string, [arg: string]: any }[]} */
  const warnings = [];
  const said = new Set();
  const warn = (code, args = {}) => { const w = { code, ...args }, key = JSON.stringify(w); if (!said.has(key)) { said.add(key); warnings.push(w); } };
  const { json: g, bin } = containerOf(input);
  if (!g || typeof g !== 'object' || !g.asset || !String(g.asset.version ?? '').startsWith('2.')) fail('not-gltf2');
  for (const ext of g.extensionsRequired ?? []) {
    if (!GLTF_SUPPORTED_EXTENSIONS.includes(ext)) {
      if (ext === 'KHR_draco_mesh_compression' || ext === 'EXT_meshopt_compression') fail('compressed', { ext });
      fail('extension', { ext });
    }
  }
  for (const ext of g.extensionsUsed ?? []) {
    if (GLTF_SUPPORTED_EXTENSIONS.includes(ext) || GLTF_QUIET_EXTENSIONS.includes(ext)) continue;
    if (ext === 'EXT_mesh_gpu_instancing') warn('instancing');
    else warn('extension-ignored', { ext: String(ext) });
  }

  const buffers = (g.buffers ?? []).map((b, i) => {
    if (b.uri === undefined) {
      if (!bin) fail('glb-no-bin', { buffer: i });
      return bin;
    }
    return b.uri.startsWith('data:') ? dataUriBytes(b.uri).bytes : fileOf(b.uri, files);
  });
  const viewBytes = (vi) => {
    const v = g.bufferViews?.[vi] ?? fail('missing', { what: 'bufferView', index: vi });
    const buf = buffers[v.buffer] ?? fail('missing', { what: 'buffer', index: v.buffer });
    const off = v.byteOffset ?? 0;
    if (!whole(off) || !whole(v.byteLength) || (v.byteStride !== undefined && !whole(v.byteStride))) fail('malformed', { what: 'bufferView', index: vi });
    if (off + v.byteLength > buf.byteLength) fail('past-end', { what: 'bufferView', index: vi });
    return { bytes: buf.subarray(off, off + v.byteLength), stride: v.byteStride ?? 0 };
  };
  const accCache = new Map();
  let held = 0;
  const accessor = (ai, { asFloat = true } = {}) => {
    const key = `${ai}:${asFloat}`;
    if (accCache.has(key)) return accCache.get(key);
    const a = g.accessors?.[ai] ?? fail('missing', { what: 'accessor', index: ai });
    const comp = COMPONENT[a.componentType] ?? fail('accessor-type', { index: ai });
    const size = TYPE_SIZE[a.type] ?? fail('accessor-type', { index: ai });
    const n = a.count;
    if (!whole(n)) fail('malformed', { what: 'accessor', index: ai });
    if (n * size > GLTF_READ_LIMITS.accessor) fail('too-large', { what: 'accessor', index: ai });
    if ((held += n * size) > GLTF_READ_LIMITS.total) fail('too-large', { what: 'model' });
    const conv = a.normalized && asFloat ? comp.norm : (v) => v;
    let src = null;
    if (a.bufferView !== undefined) {
      const { bytes, stride } = viewBytes(a.bufferView);
      const elem = comp.size * size;
      if ((a.type === 'MAT2' || a.type === 'MAT3') && comp.size < 4) fail('accessor-type', { index: ai });
      if (stride && stride < elem) fail('accessor-type', { index: ai });
      const step = stride || elem;
      const base = a.byteOffset ?? 0;
      if (!whole(base)) fail('malformed', { what: 'accessor', index: ai });
      if (n > 0 && base + (n - 1) * step + elem > bytes.byteLength) fail('past-end', { what: 'accessor', index: ai });
      src = { bytes, step, base };
    }
    let sparse = null;
    if (a.sparse) {
      const sp = a.sparse;
      const idx = sp.indices ?? fail('malformed', { what: 'accessor', index: ai }), val = sp.values ?? fail('malformed', { what: 'accessor', index: ai });
      if (!INDEX_COMPONENTS.includes(idx.componentType)) fail('accessor-type', { index: ai });
      const iComp = COMPONENT[idx.componentType];
      if (!whole(sp.count) || sp.count > n || !whole(idx.byteOffset ?? 0) || !whole(val.byteOffset ?? 0)) fail('malformed', { what: 'accessor', index: ai });
      const iv = viewBytes(idx.bufferView), vv = viewBytes(val.bufferView);
      if ((idx.byteOffset ?? 0) + sp.count * iComp.size > iv.bytes.byteLength || (val.byteOffset ?? 0) + sp.count * size * comp.size > vv.bytes.byteLength) fail('past-end', { what: 'accessor', index: ai });
      sparse = { sp, idx, val, iComp, iv, vv };
    }
    const out = new Float64Array(n * size);
    if (src) {
      const { bytes, step, base } = src;
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const read = { 1: (o) => (comp.array === Int8Array ? dv.getInt8(o) : dv.getUint8(o)), 2: (o) => (comp.array === Int16Array ? dv.getInt16(o, true) : dv.getUint16(o, true)), 4: (o) => (comp.array === Float32Array ? dv.getFloat32(o, true) : dv.getUint32(o, true)) }[comp.size];
      for (let i = 0; i < n; i++) {
        const o = base + i * step;
        for (let k = 0; k < size; k++) out[i * size + k] = conv(read(o + k * comp.size));
      }
    }
    if (sparse) {
      const { sp, idx, val, iComp, iv, vv } = sparse;
      const idv = new DataView(iv.bytes.buffer, iv.bytes.byteOffset, iv.bytes.byteLength);
      const vdv = new DataView(vv.bytes.buffer, vv.bytes.byteOffset, vv.bytes.byteLength);
      const readI = (o) => (iComp.size === 1 ? idv.getUint8(o) : iComp.size === 2 ? idv.getUint16(o, true) : idv.getUint32(o, true));
      const readV = (o) => ({ 1: () => (comp.array === Int8Array ? vdv.getInt8(o) : vdv.getUint8(o)), 2: () => (comp.array === Int16Array ? vdv.getInt16(o, true) : vdv.getUint16(o, true)), 4: () => (comp.array === Float32Array ? vdv.getFloat32(o, true) : vdv.getUint32(o, true)) }[comp.size]());
      for (let s = 0; s < sp.count; s++) {
        const target = readI((idx.byteOffset ?? 0) + s * iComp.size);
        if (target >= n) fail('past-end', { what: 'accessor', index: ai });
        for (let k = 0; k < size; k++) out[target * size + k] = conv(readV((val.byteOffset ?? 0) + (s * size + k) * comp.size));
      }
    }
    const r = { data: out, n, size };
    accCache.set(key, r);
    return r;
  };
  const attribute = (ai, size, n, opts = {}) => {
    const a = accessor(ai, opts);
    if (a.size !== size) fail('accessor-type', { index: ai });
    if (n !== null && a.n !== n) fail('malformed', { what: 'accessor', index: ai });
    return a;
  };

  const images = (g.images ?? []).map((im, i) => {
    let bytes, mime = im.mimeType ?? null;
    if (im.bufferView !== undefined) bytes = viewBytes(im.bufferView).bytes;
    else if (typeof im.uri === 'string' && im.uri.startsWith('data:')) { const d = dataUriBytes(im.uri); bytes = d.bytes; mime = mime ?? d.mime; }
    else if (typeof im.uri === 'string') bytes = fileOf(im.uri, files);
    else fail('missing', { what: 'image', index: i });
    return { name: im.name ?? `image${i}`, bytes, mime };
  });
  const texRef = (ref, what) => {
    if (!ref) return null;
    const tex = g.textures?.[ref.index] ?? fail('missing', { what: 'texture', index: ref.index });
    const source = tex.extensions?.EXT_texture_webp?.source ?? tex.source;
    if (source === undefined) { warn('image-format', { material: what }); return null; }
    const sampler = tex.sampler !== undefined ? g.samplers?.[tex.sampler] ?? {} : {};
    const tt = ref.extensions?.KHR_texture_transform;
    return {
      image: source,
      texCoord: tt?.texCoord ?? ref.texCoord ?? 0,
      wrap: [WRAP[sampler.wrapS] ?? 'repeat', WRAP[sampler.wrapT] ?? 'repeat'],
      filter: sampler.magFilter === 9728 ? 'nearest' : 'linear',
      transform: tt ? { offset: tt.offset ?? [0, 0], rotation: tt.rotation ?? 0, scale: tt.scale ?? [1, 1] } : null,
    };
  };
  const materials = (g.materials ?? []).map((m, i) => {
    const pbr = m.pbrMetallicRoughness ?? {};
    if (m.normalTexture || m.occlusionTexture || pbr.metallicRoughnessTexture) warn('maps');
    const name = m.name ?? `material${i}`;
    const base = texRef(pbr.baseColorTexture, m.name ?? String(i)), emissive = texRef(m.emissiveTexture, m.name ?? String(i));
    if (base && emissive && !samePlacement(base, emissive)) warn('emission-transform', { material: name });
    return {
      name,
      color: [...(pbr.baseColorFactor ?? [1, 1, 1, 1])],
      base,
      emissive,
      emissiveFactor: [...(m.emissiveFactor ?? [0, 0, 0])],
      emissiveStrength: m.extensions?.KHR_materials_emissive_strength?.emissiveStrength ?? 1,
      alpha: m.alphaMode === 'MASK' ? 'cutout' : m.alphaMode === 'BLEND' ? 'blend' : 'opaque',
      cutoff: m.alphaCutoff ?? 0.5,
      twoSided: m.doubleSided === true,
    };
  });

  const nodes = g.nodes ?? [];
  const parentOf = new Map();
  nodes.forEach((n, i) => { for (const c of n?.children ?? []) if (!parentOf.has(c)) parentOf.set(c, i); });
  const sceneIndex = g.scene ?? 0;
  const roots = g.scenes?.[sceneIndex]?.nodes ?? nodes.map((_, i) => i).filter((i) => !parentOf.has(i));
  const localOf = (node) => (node.matrix ? Float64Array.from(node.matrix) : trs(node.translation ?? [0, 0, 0], node.rotation ?? [0, 0, 0, 1], node.scale ?? [1, 1, 1]));
  const instances = [], lights = [];
  const worldOf = new Map();
  const reached = new Set(), onPath = new Set();
  const stack = [];
  for (let r = roots.length - 1; r >= 0; r--) stack.push({ ni: roots[r], parent: identity(), leave: false });
  while (stack.length) {
    const { ni, parent, leave } = /** @type {{ ni: any, parent: Float64Array, leave: boolean }} */ (stack.pop());
    if (leave) { onPath.delete(ni); continue; }
    if (!Number.isInteger(ni)) fail('missing', { what: 'node', index: ni });
    if (onPath.has(ni)) fail('node-cycle', { index: ni });
    if (reached.has(ni)) fail('node-parents', { index: ni });
    reached.add(ni); onPath.add(ni);
    const node = nodes[ni] ?? fail('missing', { what: 'node', index: ni });
    const local = localOf(node);
    const world = mul(parent, local);
    worldOf.set(ni, world);
    const name = node.name ?? g.meshes?.[node.mesh]?.name ?? `node${ni}`;
    if (node.skin !== undefined) warn('skin');
    if (node.camera !== undefined) warn('camera-light');
    if (node.extensions?.EXT_mesh_gpu_instancing) warn('instancing');
    if (node.extensions?.KHR_lights_punctual) {
      const def = g.extensions?.KHR_lights_punctual?.lights?.[node.extensions.KHR_lights_punctual.light];
      if (def?.type === 'point') lights.push({ name: def.name ?? node.name ?? `light${lights.length + 1}`, at: [world[12], world[13], world[14]], color: def.color ?? [1, 1, 1], intensity: def.intensity ?? 1, range: def.range ?? null, poi: def.extras?.poi ?? null });
      else warn('camera-light');
    }
    if (node.mesh !== undefined) instances.push({ name, mesh: node.mesh, matrix: node.skin !== undefined ? identity() : world, skin: node.skin ?? null, weights: node.weights ?? null });
    stack.push({ ni, parent, leave: true });
    const children = node.children ?? [];
    for (let c = children.length - 1; c >= 0; c--) stack.push({ ni: children[c], parent: world, leave: false });
  }
  if ((g.animations ?? []).length) warn('animation');

  const globalOf = (ni) => {
    if (worldOf.has(ni)) return worldOf.get(ni);
    const chain = [], seenUp = new Set();
    for (let at = ni; at !== undefined && !worldOf.has(at); at = parentOf.get(at)) {
      if (!Number.isInteger(at) || !nodes[at]) fail('missing', { what: 'node', index: at });
      if (seenUp.has(at)) fail('node-cycle', { index: at });
      seenUp.add(at); chain.push(at);
    }
    const top = parentOf.get(chain[chain.length - 1]);
    let m = top !== undefined && worldOf.has(top) ? worldOf.get(top) : identity();
    for (let k = chain.length - 1; k >= 0; k--) { m = mul(m, localOf(nodes[chain[k]])); worldOf.set(chain[k], m); }
    return m;
  };
  const skins = [];
  for (const inst of instances) {
    if (inst.skin === null || skins[inst.skin]) continue;
    const skin = g.skins?.[inst.skin] ?? fail('missing', { what: 'skin', index: inst.skin });
    const joints = skin.joints ?? fail('malformed', { what: 'skin', index: inst.skin });
    const ibm = skin.inverseBindMatrices !== undefined ? accessor(skin.inverseBindMatrices) : null;
    if (ibm && (ibm.size !== 16 || ibm.n < joints.length)) fail('accessor-type', { index: skin.inverseBindMatrices });
    skins[inst.skin] = joints.map((j, k) => mul(globalOf(j), ibm ? ibm.data.subarray(k * 16, k * 16 + 16) : identity()));
  }

  const meshes = (g.meshes ?? []).map((mesh, mi) => ({
    name: mesh.name ?? `mesh${mi}`,
    weights: mesh.weights ?? null,
    primitives: (mesh.primitives ?? []).map((p) => {
      const mode = p.mode ?? 4;
      if (mode < 4) { warn('points-lines'); return null; }
      if (p.attributes?.POSITION === undefined) { warn('no-positions'); return null; }
      if (p.attributes.COLOR_0 !== undefined) warn('vertex-colours');
      const pos = attribute(p.attributes.POSITION, 3, null);
      const nrm = p.attributes.NORMAL !== undefined ? attribute(p.attributes.NORMAL, 3, pos.n) : null;
      const mat = p.material !== undefined ? materials[p.material] : null;
      const tex = mat ? mat.base ?? mat.emissive : null;
      const set = tex?.texCoord ?? 0;
      if (mat?.emissive && mat.base && mat.emissive.texCoord !== mat.base.texCoord) warn('emission-uv-set', { material: mat.name });
      const uvAttr = p.attributes[`TEXCOORD_${set}`];
      const uv = uvAttr !== undefined ? attribute(uvAttr, 2, pos.n) : null;
      if (tex && !uv) warn('no-uvs', { material: mat.name });
      let idx = p.indices !== undefined ? Array.from(accessor(p.indices, { asFloat: false }).data) : Array.from({ length: pos.n }, (_, i) => i);
      for (let k = 0; k < idx.length; k++) if (!(Number.isInteger(idx[k]) && idx[k] < pos.n)) fail('missing', { what: 'vertex', index: idx[k] });
      if (mode === 5) idx = stripToList(idx);
      else if (mode === 6) idx = fanToList(idx);
      if (idx.length % 3) idx = idx.slice(0, idx.length - (idx.length % 3));
      const targets = (p.targets ?? []).map((t) => ({ pos: t.POSITION !== undefined ? attribute(t.POSITION, 3, pos.n) : null, nrm: t.NORMAL !== undefined ? attribute(t.NORMAL, 3, pos.n) : null }));
      const skin = [];
      for (let k = 0; p.attributes[`JOINTS_${k}`] !== undefined && p.attributes[`WEIGHTS_${k}`] !== undefined; k++) {
        skin.push({ joints: attribute(p.attributes[`JOINTS_${k}`], 4, pos.n, { asFloat: false }), weights: attribute(p.attributes[`WEIGHTS_${k}`], 4, pos.n) });
      }
      return { pos, nrm, uv, idx, material: p.material ?? -1, targets, skin };
    }).filter(Boolean),
  }));

  return { name: g.asset?.extras?.title ?? g.scenes?.[sceneIndex]?.name ?? 'model', instances, meshes, materials, images, skins, lights, warnings, generator: g.asset.generator ?? null };
}

function samePlacement(a, b) {
  const t = (r) => [...(r.transform?.offset ?? [0, 0]), r.transform?.rotation ?? 0, ...(r.transform?.scale ?? [1, 1])];
  const ta = t(a), tb = t(b);
  return ta.every((v, k) => v === tb[k]) && a.wrap[0] === b.wrap[0] && a.wrap[1] === b.wrap[1] && a.filter === b.filter;
}

function usedVertices(prim) {
  const slot = new Int32Array(prim.pos.n).fill(-1);
  for (let k = 0; k < prim.idx.length; k++) slot[prim.idx[k]] = -2;
  const list = [];
  for (let v = 0; v < slot.length; v++) if (slot[v] === -2) { slot[v] = list.length; list.push(v); }
  return { list, slot };
}

function skinMatrix(joints, sets, vi) {
  const m = new Float64Array(16);
  let sum = 0, first = null;
  for (const { joints: J, weights: W } of sets) {
    for (let k = 0; k < 4; k++) {
      const w = W.data[vi * 4 + k], j = J.data[vi * 4 + k];
      first ??= j;
      if (!(w > 0)) continue;
      const jm = joints[j] ?? fail('missing', { what: 'joint', index: j });
      for (let i = 0; i < 16; i++) m[i] += w * jm[i];
      sum += w;
    }
  }
  if (!(sum > 0)) return joints[first] ?? fail('missing', { what: 'joint', index: first });
  if (sum !== 1) for (let i = 0; i < 16; i++) m[i] /= sum;
  return m;
}

/**
 * @param {ReturnType<typeof readGltf>} model
 * @param {{ split?: 'whole' | 'nodes' }} [opts]
 */
export function bakeGltf(model, opts = {}) {
  try { return bakeModel(model, opts); } catch (e) { throw gltfErrorOf(e); }
}

/**
 * @param {ReturnType<typeof readGltf>} model
 * @param {{ split?: 'whole' | 'nodes' }} [opts]
 */
function bakeModel(model, { split = 'whole' } = {}) {
  if (split === 'nodes' && model.instances.length > POI_LIMITS.parts) fail('too-many-parts', { n: model.instances.length, max: POI_LIMITS.parts });
  const groups = split === 'nodes' ? model.instances.map((inst) => [inst]) : [model.instances];
  const used = new Map();
  const parts = [];
  for (const insts of groups) {
    const byMaterial = new Map();
    const order = [];
    let vertices = 0, corners = 0, refused = null;
    for (const inst of insts) {
      const mesh = model.meshes[inst.mesh];
      if (!mesh || refused) continue;
      const M = split === 'nodes' ? linearOf(inst.matrix) : inst.matrix;
      const mirrored = det3(M) < 0;
      const N = normalMatrix(M);
      const joints = inst.skin !== null && inst.skin !== undefined ? model.skins?.[inst.skin] ?? null : null;
      const weights = inst.weights ?? mesh.weights ?? null;
      for (const prim of mesh.primitives) {
        const flat = !prim.nrm;
        if (!flat && !used.has(prim)) used.set(prim, usedVertices(prim));
        const { list, slot } = flat ? { list: prim.idx, slot: null } : used.get(prim);
        if ((vertices += list.length) > POI_MESH_LIMITS.vertices) { refused = 'too-many-vertices'; break; }
        if ((corners += prim.idx.length) > POI_MESH_LIMITS.indices) { refused = 'too-many-indices'; break; }
        if (!byMaterial.has(prim.material)) { byMaterial.set(prim.material, { positions: [], normals: [], uvs: [], indices: [] }); order.push(prim.material); }
        const out = byMaterial.get(prim.material);
        const mat = prim.material >= 0 ? model.materials[prim.material] : null;
        const tt = (mat?.base ?? mat?.emissive)?.transform ?? null;
        const skinned = joints && prim.skin?.length ? prim.skin : null;
        const turned = skinned ? new Uint8Array(list.length) : null;
        const base = out.positions.length / 3;
        for (let e = 0; e < list.length; e++) {
          const vi = list[e];
          let p = [prim.pos.data[vi * 3], prim.pos.data[vi * 3 + 1], prim.pos.data[vi * 3 + 2]];
          let n = prim.nrm ? [prim.nrm.data[vi * 3], prim.nrm.data[vi * 3 + 1], prim.nrm.data[vi * 3 + 2]] : [0, 0, 0];
          if (weights) prim.targets.forEach((t, k) => {
            const w = weights[k] ?? 0;
            if (!w) return;
            if (t.pos) p = p.map((c, j) => c + w * t.pos.data[vi * 3 + j]);
            if (t.nrm) n = n.map((c, j) => c + w * t.nrm.data[vi * 3 + j]);
          });
          let Mv = M, Nv = N;
          if (skinned) { Mv = skinMatrix(joints, skinned, vi); Nv = normalMatrix(Mv); if (det3(Mv) < 0) turned[e] = 1; }
          p = xform(Mv, p);
          out.positions.push(-p[0] + 0, p[1], p[2]);
          if (!flat) {
            n = norm3(xformDir(Nv, n));
            out.normals.push(-n[0] + 0, n[1], n[2]);
          }
          let u = prim.uv ? prim.uv.data[vi * 2] : 0, v = prim.uv ? prim.uv.data[vi * 2 + 1] : 0;
          if (tt) [u, v] = applyTextureTransform(tt, u, v);
          out.uvs.push(u, v);
        }
        const flip = !mirrored;
        for (let t = 0; t + 2 < prim.idx.length; t += 3) {
          const [a, b, c] = flat ? [t, t + 1, t + 2] : [slot[prim.idx[t]], slot[prim.idx[t + 1]], slot[prim.idx[t + 2]]];
          const f = turned ? !turned[a] : flip;
          if (f) out.indices.push(base + a, base + c, base + b);
          else out.indices.push(base + a, base + b, base + c);
          if (flat) {
            const at = (k) => [out.positions[(base + k) * 3], out.positions[(base + k) * 3 + 1], out.positions[(base + k) * 3 + 2]];
            const e0 = at(t), e1 = at(f ? t + 2 : t + 1), e2 = at(f ? t + 1 : t + 2);
            const fn = norm3(cross(sub(e1, e0), sub(e2, e0)));
            out.normals.push(fn[0], fn[1], fn[2], fn[0], fn[1], fn[2], fn[0], fn[1], fn[2]);
          }
        }
      }
    }
    const name = split === 'nodes' ? insts[0].name : model.name;
    const position = split === 'nodes' ? [-insts[0].matrix[12] + 0, insts[0].matrix[13], insts[0].matrix[14]] : [0, 0, 0];
    if (refused) { parts.push({ name, position, refused, mesh: null, materials: [] }); continue; }
    if (!order.length) continue;
    let V = 0, I = 0;
    for (const mi of order) { const run = byMaterial.get(mi); V += run.positions.length / 3; I += run.indices.length; }
    const positions = new Float32Array(V * 3), normals = new Float32Array(V * 3), uvs = new Float32Array(V * 2);
    const indices = V > 65535 ? new Uint32Array(I) : new Uint16Array(I);
    const submeshes = [], materials = [];
    let v0 = 0, i0 = 0;
    for (const mi of order) {
      const run = byMaterial.get(mi);
      positions.set(run.positions, v0 * 3); normals.set(run.normals, v0 * 3); uvs.set(run.uvs, v0 * 2);
      submeshes.push({ start: i0, count: run.indices.length });
      for (let k = 0; k < run.indices.length; k++) indices[i0++] = run.indices[k] + v0;
      v0 += run.positions.length / 3;
      materials.push(mi);
    }
    parts.push({ name, position, mesh: { positions, normals, uvs, indices, submeshes }, materials });
  }
  return parts;
}

const round6 = (v) => Math.round(v * 1e6) / 1e6 + 0;

export function poiMaterialOf(m) {
  const tex = m?.base ?? m?.emissive ?? null;
  const strength = Math.max(Number(m?.emissiveStrength ?? 1) || 0, 0);
  const color = m?.color ?? [1, 1, 1, 1];
  return {
    texture: m?.base ? m.base.image : null,
    color: [0, 1, 2].map((k) => round6(linearToSrgb(clamp01(color[k])))).concat(clamp01(color[3] ?? 1)),
    emissive: m?.emissive ? m.emissive.image : null,
    emissiveColor: (m?.emissiveFactor ?? [0, 0, 0]).map((c) => Math.min(Math.max(round6(linearToSrgb(clamp01(c)) * strength), 0), 16)),
    alpha: m?.alpha ?? 'opaque',
    cutoff: clamp01(m?.cutoff ?? 0.5),
    twoSided: !!m?.twoSided,
    wrap: tex?.wrap ?? ['repeat', 'repeat'],
    filter: tex?.filter ?? 'linear',
    uv: { offset: [0, 0], scale: [1, 1], rotation: 0 },
  };
}

/**
 * @param {{ at: number[], color: number[], intensity: number, range: number | null, poi?: any }} l
 * @param {{ radius: number, flicker: boolean }} fresh
 */
export function poiLightOf(l, fresh) {
  const t = [round6(-l.at[0]), round6(l.at[1]), round6(l.at[2])];
  const color = [0, 1, 2].map((k) => round6(linearToSrgb(clamp01(l.color?.[k] ?? 1))));
  const intensity = round6((Number(l.intensity) || 0) / Math.PI);
  const radius = l.range ?? fresh.radius;
  const own = l.poi && typeof l.poi === 'object' ? l.poi : null;
  const flicker = typeof own?.flicker === 'boolean' ? own.flicker : fresh.flicker;
  const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-4 * Math.max(1, Math.abs(b));
  const ownColor = Array.isArray(own?.color) && own.color.length === 3 && own.color.every((c, k) => near(c, color[k])) ? [...own.color] : color;
  return { t, color: ownColor, radius: near(own?.radius, radius) ? own.radius : radius, intensity: near(own?.intensity, intensity) ? own.intensity : intensity, flicker };
}

export { GltfError };


function identity() { const m = new Float64Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; }
function trs(t, r, s) {
  const [x, y, z, w] = r;
  const m = new Float64Array(16);
  m[0] = (1 - 2 * (y * y + z * z)) * s[0]; m[1] = 2 * (x * y + z * w) * s[0]; m[2] = 2 * (x * z - y * w) * s[0];
  m[4] = 2 * (x * y - z * w) * s[1]; m[5] = (1 - 2 * (x * x + z * z)) * s[1]; m[6] = 2 * (y * z + x * w) * s[1];
  m[8] = 2 * (x * z + y * w) * s[2]; m[9] = 2 * (y * z - x * w) * s[2]; m[10] = (1 - 2 * (x * x + y * y)) * s[2];
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1;
  return m;
}
function mul(a, b) {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let v = 0;
    for (let k = 0; k < 4; k++) v += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = v;
  }
  return o;
}
function xform(m, p) {
  return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
}
function xformDir(m3, d) { return [m3[0] * d[0] + m3[3] * d[1] + m3[6] * d[2], m3[1] * d[0] + m3[4] * d[1] + m3[7] * d[2], m3[2] * d[0] + m3[5] * d[1] + m3[8] * d[2]]; }
function det3(m) {
  return m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
}
function normalMatrix(m) {
  const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
  const c00 = e * i - f * h, c01 = -(d * i - f * g), c02 = d * h - e * g;
  const c10 = -(b * i - c * h), c11 = a * i - c * g, c12 = -(a * h - b * g);
  const c20 = b * f - c * e, c21 = -(a * f - c * d), c22 = a * e - b * d;
  const det = a * c00 + b * c01 + c * c02 || 1;
  return [c00 / det, c10 / det, c20 / det, c01 / det, c11 / det, c21 / det, c02 / det, c12 / det, c22 / det];
}
function linearOf(m) { const o = Float64Array.from(m); o[12] = o[13] = o[14] = 0; return o; }
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]); return l > 0 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 1, 0]; }
const clamp01 = (v) => Math.min(Math.max(Number(v) || 0, 0), 1);

export function applyTextureTransform(tt, u, v) {
  const [sx, sy] = tt.scale ?? [1, 1], r = tt.rotation ?? 0, [ox, oy] = tt.offset ?? [0, 0];
  const c = Math.cos(r), s = Math.sin(r);
  const x = u * sx, y = v * sy;
  return [c * x + s * y + ox, -s * x + c * y + oy];
}

function stripToList(idx) {
  const out = [];
  for (let i = 0; i + 2 < idx.length; i++) {
    if (i % 2 === 0) out.push(idx[i], idx[i + 1], idx[i + 2]);
    else out.push(idx[i + 1], idx[i], idx[i + 2]);
  }
  return out;
}
function fanToList(idx) {
  const out = [];
  for (let i = 1; i + 1 < idx.length; i++) out.push(idx[0], idx[i], idx[i + 1]);
  return out;
}
