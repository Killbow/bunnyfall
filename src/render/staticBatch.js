// @ts-check
// Merges a streamed pixel's static models into one vertex array, grouped by texture, so the pixel draws one call
// per texture. Models that move (swapping gates, turning mill rotors) must stay out of the batch. Pure: no GL here.

import { boundsOf, boundsSteps } from './bounds.js';

function rotateNormal(m, x, y, z, out, o) {
  const nx = m[0] * x + m[4] * y + m[8] * z;
  const ny = m[1] * x + m[5] * y + m[9] * z;
  const nz = m[2] * x + m[6] * y + m[10] * z;
  const l = Math.hypot(nx, ny, nz) || 1;
  out[o] = nx / l; out[o + 1] = ny / l; out[o + 2] = nz / l;
}

function det3(m) {
  return m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
}

// Unity lights an unevenly scaled model through the inverse transpose. Null when the columns share one length.
export function unevenScaleNormalMatrix(m) {
  const l0 = m[0] * m[0] + m[1] * m[1] + m[2] * m[2];
  const l1 = m[4] * m[4] + m[5] * m[5] + m[6] * m[6];
  const l2 = m[8] * m[8] + m[9] * m[9] + m[10] * m[10];
  const hi = Math.max(l0, l1, l2), lo = Math.min(l0, l1, l2);
  if (!(lo > 0) || hi - lo <= hi * 1e-6) return null;
  const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
  // Cofactors carry the determinant's sign, so a mirror must not turn the normals inward.
  const s = det3(m) < 0 ? -1 : 1;
  // prettier-ignore
  return new Float32Array([
    s * (e * i - f * h), -s * (b * i - c * h), s * (b * f - c * e), 0,
    -s * (d * i - f * g), s * (a * i - c * g), -s * (a * f - c * d), 0,
    s * (d * h - e * g), -s * (a * h - b * g), s * (a * e - b * d), 0,
    0, 0, 0, 1,
  ]);
}

// A depth face reads no texture, so a second index buffer holds the same triangles sorted by centroid grid cell for
// shadow culling, and the lit buffer is unchanged. Cells run y, then z, then x, so x neighbors draw as one run.
/**
 * @param {Float32Array} positions
 * @param {Uint32Array} indices
 * @param {number} size
 * @returns {{ indices: Uint32Array, cells: Array<{ startIndex: number, primitiveCount: number }> }}
 */
export function shadowCells(positions, indices, size) {
  const tris = indices.length / 3;
  const key = new Float64Array(tris);
  const at = new Int32Array(tris * 3);
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let t = 0; t < tris; t++) {
    const a = indices[t * 3] * 3, b = indices[t * 3 + 1] * 3, c = indices[t * 3 + 2] * 3;
    const x = Math.floor((positions[a] + positions[b] + positions[c]) / (3 * size));
    const y = Math.floor((positions[a + 1] + positions[b + 1] + positions[c + 1]) / (3 * size));
    const z = Math.floor((positions[a + 2] + positions[b + 2] + positions[c + 2]) / (3 * size));
    at[t * 3] = x; at[t * 3 + 1] = y; at[t * 3 + 2] = z;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const nx = maxX - minX + 1, nz = maxZ - minZ + 1;
  const count = new Map();
  for (let t = 0; t < tris; t++) {
    const k = ((at[t * 3 + 1] - minY) * nz + (at[t * 3 + 2] - minZ)) * nx + (at[t * 3] - minX);
    key[t] = k;
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  const next = new Map(), cells = [];
  let start = 0;
  for (const k of [...count.keys()].sort((p, q) => p - q)) {
    const n = /** @type {number} */ (count.get(k));
    next.set(k, start);
    cells.push({ startIndex: start * 3, primitiveCount: n });
    start += n;
  }
  const out = new Uint32Array(indices.length);
  for (let t = 0; t < tris; t++) {
    const s = /** @type {number} */ (next.get(key[t]));
    next.set(key[t], s + 1);
    out[s * 3] = indices[t * 3]; out[s * 3 + 1] = indices[t * 3 + 1]; out[s * 3 + 2] = indices[t * 3 + 2];
  }
  return { indices: out, cells };
}

export const SHADOW_CELL_SIZE = 16;

export class StaticBatchBuilder {
  /** @param {{ shadowCell?: number, pieces?: boolean }} [opts] */
  constructor({ shadowCell = 0, pieces = false } = {}) {
    this.pieces = !!pieces;
    this.chunks = [];
    this.groups = new Map();
    this.vertexCount = 0;
    this.triangles = 0;
    this.models = 0;
    this.shadowCell = shadowCell;
  }

  /**
   * @param {{positions:Float32Array, normals:Float32Array, uvs:Float32Array, indices:Uint32Array, subMeshes:Array}} cpu
   * @param {Float32Array} local
   * @param {(archive:number, record:number) => string} resolveKey
   * @param {?Float32Array} [normalMatrix]
   */
  add(cpu, local, resolveKey, normalMatrix = null) {
    const nm = normalMatrix ?? unevenScaleNormalMatrix(local) ?? local;
    const n = cpu.positions.length / 3;
    if (!n || !cpu.subMeshes?.length) return;
    // A mirrored model (negative determinant) flips its triangle winding, and the renderer culls by winding. As
    // Unity reverses culling for a negative scale, the merge swaps each triangle's last two corners.
    const mirrored = det3(local) < 0;
    const base = this.vertexCount;
    const positions = new Float32Array(n * 3), normals = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = cpu.positions[i * 3], y = cpu.positions[i * 3 + 1], z = cpu.positions[i * 3 + 2];
      positions[i * 3] = local[0] * x + local[4] * y + local[8] * z + local[12];
      positions[i * 3 + 1] = local[1] * x + local[5] * y + local[9] * z + local[13];
      positions[i * 3 + 2] = local[2] * x + local[6] * y + local[10] * z + local[14];
      rotateNormal(nm, cpu.normals[i * 3], cpu.normals[i * 3 + 1], cpu.normals[i * 3 + 2], normals, i * 3);
    }
    this.chunks.push({ positions, normals, uvs: cpu.uvs });
    for (const sm of cpu.subMeshes) {
      const count = sm.primitiveCount * 3;
      if (!count) continue;
      const run = new Uint32Array(count);
      for (let i = 0; i < count; i++) run[i] = cpu.indices[sm.startIndex + i] + base;
      if (mirrored) for (let i = 0; i + 2 < count; i += 3) { const t = run[i + 1]; run[i + 1] = run[i + 2]; run[i + 2] = t; }
      const key = resolveKey(sm.textureArchive, sm.textureRecord);
      let g = this.groups.get(key);
      if (!g) { g = []; this.groups.set(key, g); }
      g.push(run);
      this.triangles += sm.primitiveCount;
    }
    this.vertexCount += n;
    this.models++;
  }

  finish() {
    const it = this._merge(false);
    let r = it.next();
    while (!r.done) r = it.next();
    return r.value;
  }

  // Yields between units so no unit runs much over 0.6 ms; the result matches finish() and createMesh exactly.
  /** @param {() => Promise<void>} breathe */
  async finishSliced(breathe) {
    const it = this._merge(true);
    for (let r = it.next(); ; r = it.next()) {
      if (r.done) return r.value;
      await breathe();
    }
  }

  *_merge(withBounds) {
    if (!this.vertexCount || !this.triangles) return null;
    const positions = new Float32Array(this.vertexCount * 3);
    const normals = new Float32Array(this.vertexCount * 3);
    const uvs = new Float32Array(this.vertexCount * 2);
    let v = 0;
    for (const c of this.chunks) {
      positions.set(c.positions, v * 3); normals.set(c.normals, v * 3); uvs.set(c.uvs, v * 2);
      v += c.positions.length / 3;
      yield;
    }
    const whole = withBounds ? yield* boundsSteps(positions) : null;
    const indices = new Uint32Array(this.triangles * 3);
    yield;
    const subMeshes = [];
    const subs = [];
    let at = 0;
    for (const [key, runs] of this.groups) {
      const start = at;
      for (const run of runs) { indices.set(run, at); at += run.length; }
      // The resolved key is archive_record, spelled as drawMesh spells it.
      const [archive, record] = key.split('_').map(Number);
      const sub = { textureArchive: archive, textureRecord: record, startIndex: start, primitiveCount: (at - start) / 3 };
      if (this.pieces) {
        const pieces = new Float32Array(runs.length * 4);
        runs.forEach((run, i) => pieces.set(boundsOf(positions, run), i * 4));
        sub.pieces = pieces;
      }
      subMeshes.push(sub);
      if (withBounds) { subs.push(boundsOf(positions, indices, start, at - start)); yield; }
    }
    const merged = /** @type {any} */ ({ positions, normals, uvs, indices, subMeshes, vertexCount: this.vertexCount, triangles: this.triangles, models: this.models });
    if (withBounds) merged.bounds = { whole, subs };
    if (this.shadowCell > 0) {
      yield;
      const c = shadowCells(positions, indices, this.shadowCell);
      merged.shadowIndices = c.indices; merged.shadowCells = c.cells;
    }
    this._spend();
    return merged;
  }

  // Releases the per-model arrays, since a builder can outlive its merge; a second finish() then returns null.
  _spend() {
    this.chunks = [];
    this.groups = new Map();
    this.vertexCount = 0;
    this.triangles = 0;
    this.models = 0;
  }
}

export const keyResolver = (texRemap) => (archive, record) => {
  const key = `${archive}_${record}`;
  return texRemap && texRemap.has(key) ? texRemap.get(key) : key;
};
