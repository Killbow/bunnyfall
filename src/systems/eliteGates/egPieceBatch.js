// @ts-check
import { sphereInPlanes } from '../../render/bounds.js';
import { meshKitBounds } from '../../world/eliteGates/meshKit.js';

// Hidden copies collapse to one point here, so their triangles are degenerate and cover no pixel.
export const EG_BATCH_HIDE_Y = -4000;
export const EG_BATCH_CULL_PAD = 0.5;
const TURN_AT = Object.freeze([0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14]);

/** @typedef {{ model: any, verts: number, centre: number[], r: number }} EgBatchModel */
/** @param {{ renderer?: any }} deps */
export function createEgPieceBatch({ renderer = null } = {}) {
  /** @type {Map<string, { models: EgBatchModel[], byModel: Map<any, number>, mi: number[], slots: any[], vo: Uint32Array, gpu: any, draw: any, pos: Float32Array|null, nrm: Float32Array|null, at: Float32Array, seen: Uint8Array, turns: boolean, remap: any, subs: number }>} */
  const kinds = new Map();
  let built = false, lastDrawn = 0, lastCulled = 0, lastHidden = 0;
  return {
    // A kind's `turns` comes from its first `add`, and adds after `build` are refused.
    add(key, model, slot, { turns = false } = {}) {
      if (built || !model || !slot) return false;
      let k = kinds.get(key);
      if (!k) kinds.set(key, k = { models: [], byModel: new Map(), mi: [], slots: [], vo: new Uint32Array(1), gpu: null, draw: null, pos: null, nrm: null, at: new Float32Array(0), seen: new Uint8Array(0), turns: !!turns, remap: null, subs: 0 });
      let m = k.byModel.get(model);
      if (m === undefined) { const b = meshKitBounds(model.positions); m = k.models.length; k.models.push({ model, verts: model.positions.length / 3, centre: b.centre, r: b.r }); k.byModel.set(model, m); }
      k.slots.push(slot); k.mi.push(m);
      return true;
    },
    remap(key, map) {
      const k = kinds.get(key);
      if (!k) return false;
      k.remap = map ?? null;
      if (k.draw) k.draw.texRemap = k.remap;
      return true;
    },
    build(draws) {
      if (built) return 0;
      built = true;
      let n = 0;
      for (const k of kinds.values()) {
        const c = k.slots.length, vo = new Uint32Array(c + 1);
        for (let i = 0; i < c; i++) vo[i + 1] = vo[i] + k.models[k.mi[i]].verts;
        const V = vo[c], positions = new Float32Array(V * 3), normals = new Float32Array(V * 3), uvs = new Float32Array(V * 2);
        /** @type {Map<string, { textureArchive: number, textureRecord: number, tris: number }>} */
        const recs = new Map();
        for (let i = 0; i < c; i++) for (const sm of k.models[k.mi[i]].model.subMeshes) {
          const id = `${sm.textureArchive}_${sm.textureRecord}`, q = recs.get(id);
          if (q) q.tris += sm.primitiveCount; else recs.set(id, { textureArchive: sm.textureArchive, textureRecord: sm.textureRecord, tris: sm.primitiveCount });
        }
        let acc = 0;
        /** @type {Map<string, { textureArchive: number, textureRecord: number, startIndex: number, primitiveCount: number }>} */
        const subOf = new Map();
        for (const [id, q] of recs) { subOf.set(id, { textureArchive: q.textureArchive, textureRecord: q.textureRecord, startIndex: acc, primitiveCount: q.tris }); acc += q.tris * 3; }
        const indices = new Uint32Array(acc), fill = new Map([...subOf].map(([id, s]) => [id, s.startIndex]));
        for (const id of recs.keys()) for (let i = 0; i < c; i++) {
          const m = k.models[k.mi[i]].model;
          for (const sm of m.subMeshes) {
            if (`${sm.textureArchive}_${sm.textureRecord}` !== id) continue;
            let at = fill.get(id);
            for (let q = 0; q < sm.primitiveCount * 3; q++) indices[at++] = m.indices[sm.startIndex + q] + vo[i];
            fill.set(id, at);
          }
        }
        for (let i = 0; i < c; i++) {
          const m = k.models[k.mi[i]].model;
          normals.set(m.normals, vo[i] * 3); uvs.set(m.uvs, vo[i] * 2);
          for (let p = vo[i]; p < vo[i + 1]; p++) { positions[p * 3] = 0; positions[p * 3 + 1] = EG_BATCH_HIDE_Y; positions[p * 3 + 2] = 0; }
        }
        const subMeshes = [...subOf.values()];
        k.vo = vo; k.pos = positions; k.nrm = normals; k.subs = subMeshes.length;
        k.at = new Float32Array(c * (k.turns ? TURN_AT.length : 3)).fill(NaN); k.seen = new Uint8Array(c);
        try { k.gpu = renderer?.createMesh ? renderer.createMesh({ positions, normals, uvs, indices, subMeshes }) : null; } catch (e) { console.warn('[eg] a batch would not build', e?.message ?? e); k.gpu = null; }
        if (k.gpu) { k.draw = { gpu: k.gpu, object: { matrix: IDENTITY }, noShadow: true, texRemap: null, hidden: true }; k.draw.texRemap = k.remap; draws?.push?.(k.draw); n++; }
      }
      return n;
    },
    cull(planes = null) {
      let drawn = 0, culled = 0, hidden = 0;
      for (const k of kinds.values()) {
        if (!k.pos) continue;
        let any = false, dirty = false;
        if (k.turns) { const q = cullTurning(k, planes); culled += q.culled; hidden += q.hidden; any = q.any; dirty = q.dirty; }
        else for (let i = 0; i < k.slots.length; i++) {
          const s = k.slots[i], M = s.object?.matrix, B = k.models[k.mi[i]];
          // A gone piece's pose writes a zero matrix, so `M[15] === 0` marks it hidden.
          let show = !s.hidden && !!M && M[15] !== 0;
          if (!show) hidden++;
          const x = show ? M[12] : 0, y = show ? M[13] : 0, z = show ? M[14] : 0;
          if (show && planes && !sphereInPlanes(planes, B.centre[0] + x, B.centre[1] + y, B.centre[2] + z, B.r + EG_BATCH_CULL_PAD)) { show = false; culled++; }
          if (show) any = true;
          const was = k.seen[i] === 1;
          if (show === was && (!show || (k.at[i * 3] === x && k.at[i * 3 + 1] === y && k.at[i * 3 + 2] === z))) continue;
          dirty = true;
          k.seen[i] = show ? 1 : 0;
          k.at[i * 3] = x; k.at[i * 3 + 1] = y; k.at[i * 3 + 2] = z;
          const o = k.vo[i] * 3, src = B.model.positions, V = B.verts;
          if (show) for (let p = 0; p < V; p++) { k.pos[o + p * 3] = src[p * 3] + x; k.pos[o + p * 3 + 1] = src[p * 3 + 1] + y; k.pos[o + p * 3 + 2] = src[p * 3 + 2] + z; }
          else for (let p = 0; p < V; p++) { k.pos[o + p * 3] = 0; k.pos[o + p * 3 + 1] = EG_BATCH_HIDE_Y; k.pos[o + p * 3 + 2] = 0; }
        }
        if (dirty && k.gpu) { try { renderer?.updateMeshVertices?.(k.gpu, k.pos, k.nrm); } catch (e) { console.warn('[eg] a batch would not move', e?.message ?? e); } }
        if (k.draw) k.draw.hidden = !any;
        if (any) drawn++;
      }
      lastDrawn = drawn; lastCulled = culled; lastHidden = hidden;
      return drawn;
    },
    stats() {
      let copies = 0, glDraws = 0, tris = 0, models = 0;
      for (const k of kinds.values()) {
        copies += k.slots.length; models += k.models.length;
        for (const m of k.mi) tris += k.models[m].model.indices.length / 3;
        if (k.draw && !k.draw.hidden) glDraws += k.subs;
      }
      return { kinds: kinds.size, copies, drawn: lastDrawn, culled: lastCulled, hidden: lastHidden, glDraws, tris, models };
    },
    copyVertex(key, i, p = 0) {
      const k = kinds.get(key);
      if (!k?.pos || i >= k.slots.length || p >= k.models[k.mi[i]].verts) return null;
      const o = (k.vo[i] + p) * 3;
      return [k.pos[o], k.pos[o + 1], k.pos[o + 2]];
    },
    copyAt(key, i) {
      const k = kinds.get(key);
      if (!k?.pos || i >= k.slots.length) return null;
      const o = k.vo[i] * 3, src = k.models[k.mi[i]].model.positions;
      return [k.pos[o] - src[0], k.pos[o + 1] - src[1], k.pos[o + 2] - src[2]];
    },
    kinds() { return [...kinds].map(([key, k]) => ({ key, copies: k.slots.length, models: k.models.length, subs: k.subs, turns: k.turns })); },
    clear() {
      for (const k of kinds.values()) { if (k.gpu) { try { renderer?.destroyMesh?.(k.gpu); } catch { } } k.gpu = null; k.draw = null; k.pos = null; }
      kinds.clear();
      built = false;
    },
  };
}
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const _turnCounts = { culled: 0, hidden: 0, any: false, dirty: false };
function cullTurning(k, planes) {
  const T = _turnCounts, A = TURN_AT.length;
  T.culled = 0; T.hidden = 0; T.any = false; T.dirty = false;
  for (let i = 0; i < k.slots.length; i++) {
    const s = k.slots[i], M = s.object?.matrix, B = k.models[k.mi[i]], c = B.centre;
    // A gone piece's pose writes a zero matrix, so `M[15] === 0` marks it hidden.
    let show = !s.hidden && M != null && M[15] !== 0;
    if (!show) T.hidden++;
    if (show && planes && !sphereInPlanes(planes, M[0] * c[0] + M[4] * c[1] + M[8] * c[2] + M[12], M[1] * c[0] + M[5] * c[1] + M[9] * c[2] + M[13], M[2] * c[0] + M[6] * c[1] + M[10] * c[2] + M[14], B.r + EG_BATCH_CULL_PAD)) { show = false; T.culled++; }
    if (show) T.any = true;
    const was = k.seen[i] === 1, o12 = i * A;
    if (show === was) {
      if (!show) continue;
      let same = true;
      for (let j = 0; j < A; j++) if (k.at[o12 + j] !== M[TURN_AT[j]]) { same = false; break; }
      if (same) continue;
    }
    T.dirty = true;
    k.seen[i] = show ? 1 : 0;
    const o = k.vo[i] * 3, V = B.verts, src = B.model.positions, sn = B.model.normals;
    if (!show) {
      k.at.fill(NaN, o12, o12 + A);
      for (let p = 0; p < V; p++) { k.pos[o + p * 3] = 0; k.pos[o + p * 3 + 1] = EG_BATCH_HIDE_Y; k.pos[o + p * 3 + 2] = 0; }
      continue;
    }
    for (let j = 0; j < A; j++) k.at[o12 + j] = M[TURN_AT[j]];
    const a0 = M[0], a1 = M[1], a2 = M[2], b0 = M[4], b1 = M[5], b2 = M[6], c0 = M[8], c1 = M[9], c2 = M[10], tx = M[12], ty = M[13], tz = M[14];
    for (let p = 0; p < V; p++) {
      const q = p * 3, x = src[q], y = src[q + 1], z = src[q + 2], nx = sn[q], ny = sn[q + 1], nz = sn[q + 2];
      k.pos[o + q] = a0 * x + b0 * y + c0 * z + tx; k.pos[o + q + 1] = a1 * x + b1 * y + c1 * z + ty; k.pos[o + q + 2] = a2 * x + b2 * y + c2 * z + tz;
      k.nrm[o + q] = a0 * nx + b0 * ny + c0 * nz; k.nrm[o + q + 1] = a1 * nx + b1 * ny + c1 * nz; k.nrm[o + q + 2] = a2 * nx + b2 * ny + c2 * nz;
    }
  }
  return T;
}
