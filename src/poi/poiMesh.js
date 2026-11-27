// @ts-check
// Binary encoding and checks for a builder's POI mesh.

export const POI_MESH_MAGIC = 0x4d494f50;
export const POI_MESH_VERSION = 1;
const HEADER_BYTES = 44;
const FLAG_U32 = 1;

export const POI_MESH_LIMITS = Object.freeze({
  vertices: 262_144,
  indices: 3 * 1_048_576,
  submeshes: 64,
  extent: 2048,
  bytes: 24 * 1024 * 1024,
});

/**
 * @typedef {{ start: number, count: number }} PoiSubmesh
 * @typedef {{ positions: Float32Array, normals: Float32Array, uvs: Float32Array, indices: Uint16Array | Uint32Array,
 *   submeshes: PoiSubmesh[], boundsMin?: number[], boundsMax?: number[] }} PoiMesh
 */

export const POI_MESH_STEP = 1 << 17;
/**
 * @template T
 * @param {Generator<void, T>} g
 * @returns {T}
 */
function whole(g) { for (;;) { const r = g.next(); if (r.done) return r.value; } }

/** @param {Float32Array} p */
export function meshBoxOf(p) { return whole(meshBoxSteps(p)); }
/**
 * @param {Float32Array} p
 * @returns {Generator<void, number[][]>}
 */
function* meshBoxSteps(p) {
  if (!p.length) return [[0, 0, 0], [0, 0, 0]];
  const min = [p[0], p[1], p[2]], max = [p[0], p[1], p[2]];
  for (let from = 3; from < p.length; from += POI_MESH_STEP) {
    const to = Math.min(p.length, from + POI_MESH_STEP);
    for (let i = from; i < to; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = p[i + k];
        if (v < min[k]) min[k] = v;
        if (v > max[k]) max[k] = v;
      }
    }
    if (to < p.length) yield;
  }
  return [min, max];
}

/**
 * @param {PoiMesh} m
 * @returns {string | null}
 */
export function poiMeshError(m) { return whole(poiMeshErrorSteps(m)); }
/**
 * @param {PoiMesh} m
 * @returns {Generator<void, string | null>}
 */
export function* poiMeshErrorSteps(m) {
  if (!m || !(m.positions instanceof Float32Array) || !(m.normals instanceof Float32Array) || !(m.uvs instanceof Float32Array)) return 'arrays';
  if (!(m.indices instanceof Uint16Array || m.indices instanceof Uint32Array)) return 'arrays';
  const V = m.positions.length / 3;
  if (!Number.isInteger(V) || V < 3) return 'vertices';
  if (V > POI_MESH_LIMITS.vertices) return 'too-many-vertices';
  if (m.normals.length !== V * 3 || m.uvs.length !== V * 2) return 'attribute-length';
  const I = m.indices.length;
  if (I < 3 || I % 3) return 'indices';
  if (I > POI_MESH_LIMITS.indices) return 'too-many-indices';
  if (!Array.isArray(m.submeshes) || !m.submeshes.length) return 'submeshes';
  if (m.submeshes.length > POI_MESH_LIMITS.submeshes) return 'too-many-submeshes';
  let at = 0;
  for (const s of m.submeshes) {
    if (!s || !Number.isInteger(s.start) || !Number.isInteger(s.count) || s.start !== at || s.count <= 0 || s.count % 3) return 'submesh-run';
    at += s.count;
  }
  if (at !== I) return 'submesh-run';
  for (const arr of [m.positions, m.normals, m.uvs]) {
    for (let from = 0; from < arr.length; from += POI_MESH_STEP) {
      const to = Math.min(arr.length, from + POI_MESH_STEP);
      for (let i = from; i < to; i++) if (!Number.isFinite(arr[i])) return 'not-finite';
      yield;
    }
  }
  const P = m.positions, X = POI_MESH_LIMITS.extent;
  for (let from = 0; from < P.length; from += POI_MESH_STEP) {
    const to = Math.min(P.length, from + POI_MESH_STEP);
    for (let i = from; i < to; i++) if (Math.abs(P[i]) > X) return 'too-large';
    yield;
  }
  const ix = m.indices;
  for (let from = 0; from < I; from += POI_MESH_STEP) {
    const to = Math.min(I, from + POI_MESH_STEP);
    for (let i = from; i < to; i++) if (ix[i] >= V) return 'index-range';
    yield;
  }
  return null;
}

/** @param {PoiMesh} m */
export function encodePoiMesh(m) {
  const why = poiMeshError(m);
  if (why) throw new Error(`poi mesh: ${why}`);
  const V = m.positions.length / 3, I = m.indices.length, S = m.submeshes.length;
  const wide = V > 65535 || m.indices instanceof Uint32Array;
  const indexBytes = I * (wide ? 4 : 2);
  const size = HEADER_BYTES + S * 8 + V * (3 + 3 + 2) * 4 + indexBytes + ((4 - (indexBytes % 4)) % 4);
  if (size > POI_MESH_LIMITS.bytes) throw new Error('poi mesh: too-many-bytes');
  const buf = new ArrayBuffer(size);
  const dv = new DataView(buf);
  const [min, max] = meshBoxOf(m.positions);
  dv.setUint32(0, POI_MESH_MAGIC, true);
  dv.setUint16(4, POI_MESH_VERSION, true);
  dv.setUint16(6, wide ? FLAG_U32 : 0, true);
  dv.setUint32(8, V, true);
  dv.setUint32(12, I, true);
  dv.setUint16(16, S, true);
  dv.setUint16(18, 0, true);
  for (let k = 0; k < 3; k++) { dv.setFloat32(20 + k * 4, min[k], true); dv.setFloat32(32 + k * 4, max[k], true); }
  let at = HEADER_BYTES;
  for (const s of m.submeshes) { dv.setUint32(at, s.start, true); dv.setUint32(at + 4, s.count, true); at += 8; }
  const bytes = new Uint8Array(buf);
  const put = (/** @type {ArrayBufferView} */ a) => { bytes.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), at); at += a.byteLength; };
  put(Float32Array.from(m.positions));
  put(Float32Array.from(m.normals));
  put(Float32Array.from(m.uvs));
  put(wide ? Uint32Array.from(m.indices) : Uint16Array.from(m.indices));
  return bytes;
}

/**
 * @param {ArrayBuffer | Uint8Array} input
 * @returns {{ mesh: PoiMesh & { boundsMin: number[], boundsMax: number[] } } | { error: string }}
 */
export function decodePoiMesh(input) { return whole(decodePoiMeshSteps(input)); }
/**
 * @param {ArrayBuffer | Uint8Array} input
 * @returns {Generator<void, { mesh: PoiMesh & { boundsMin: number[], boundsMax: number[] } } | { error: string }>}
 */
export function* decodePoiMeshSteps(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < HEADER_BYTES) return { error: 'short' };
  if (bytes.byteLength > POI_MESH_LIMITS.bytes) return { error: 'too-many-bytes' };
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== POI_MESH_MAGIC) return { error: 'magic' };
  if (dv.getUint16(4, true) !== POI_MESH_VERSION) return { error: 'version' };
  const flags = dv.getUint16(6, true);
  if (flags & ~FLAG_U32) return { error: 'flags' };
  const V = dv.getUint32(8, true), I = dv.getUint32(12, true), S = dv.getUint16(16, true);
  if (V > POI_MESH_LIMITS.vertices) return { error: 'too-many-vertices' };
  if (I > POI_MESH_LIMITS.indices) return { error: 'too-many-indices' };
  if (S > POI_MESH_LIMITS.submeshes) return { error: 'too-many-submeshes' };
  const wide = (flags & FLAG_U32) !== 0;
  const indexBytes = I * (wide ? 4 : 2);
  const want = HEADER_BYTES + S * 8 + V * 32 + indexBytes + ((4 - (indexBytes % 4)) % 4);
  if (bytes.byteLength !== want) return { error: 'length' };
  const boundsMin = [0, 1, 2].map((k) => dv.getFloat32(20 + k * 4, true));
  const boundsMax = [0, 1, 2].map((k) => dv.getFloat32(32 + k * 4, true));
  let at = HEADER_BYTES;
  const submeshes = [];
  for (let s = 0; s < S; s++) { submeshes.push({ start: dv.getUint32(at, true), count: dv.getUint32(at + 4, true) }); at += 8; }
  const take = (/** @type {number} */ n) => { const out = bytes.slice(at, at + n); at += n; return out.buffer; };
  const positions = new Float32Array(take(V * 12));
  yield;
  const normals = new Float32Array(take(V * 12));
  const uvs = new Float32Array(take(V * 8));
  yield;
  const indices = wide ? new Uint32Array(take(I * 4)) : new Uint16Array(take(I * 2));
  const mesh = { positions, normals, uvs, indices, submeshes, boundsMin, boundsMax };
  yield;
  const why = yield* poiMeshErrorSteps(mesh);
  if (why) return { error: why };
  const [min, max] = yield* meshBoxSteps(positions);
  // Compare as agreement: a NaN in the header bounds would pass a differs-by test.
  for (let k = 0; k < 3; k++) if (!(Math.abs(min[k] - boundsMin[k]) <= 1e-3 && Math.abs(max[k] - boundsMax[k]) <= 1e-3)) return { error: 'bounds' };
  return { mesh };
}

/**
 * @param {PoiMesh & { boundsMin: number[], boundsMax: number[] }} m
 */
export const poiMeshFacts = (m) => ({ submeshes: m.submeshes.length, vertices: m.positions.length / 3, triangles: m.indices.length / 3, min: m.boundsMin, max: m.boundsMax });
