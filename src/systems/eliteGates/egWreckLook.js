// @ts-check
// The world shader has no instance attribute, so each wing is transformed on the CPU and uploaded through
// `renderer.updateMeshVertices`. Wings are re-laid `EG_WRECK_TURN_HZ` times a second of the shared clock, not every
// frame, so every client shows the same turn.
import { buildEgVista } from '../../world/eliteGates/egVista.js';

export const EG_WRECK_TURN_HZ = 12;

/** @param {Array<{ model: any, at: number[], court?: number[], spin: number, tilt: number }>} wings */
export function egWreckBatch(wings) {
  const recs = [...new Set(wings.flatMap((w) => w.model.subMeshes.map((s) => s.textureRecord)))].sort((a, b) => a - b);
  let n = 0;
  for (const w of wings) for (const s of w.model.subMeshes) n += s.primitiveCount * 3;
  const positions = new Float32Array(n * 3), normals = new Float32Array(n * 3), uvs = new Float32Array(n * 2), indices = new Uint32Array(n);
  const src = new Float32Array(n * 6), owner = new Uint16Array(n), subMeshes = [];
  let v = 0;
  for (const rec of recs) {
    const start = v;
    let archive = 0;
    wings.forEach((w, wi) => {
      const m = w.model;
      for (const s of m.subMeshes) {
        if (s.textureRecord !== rec) continue;
        archive = s.textureArchive;
        for (let i = s.startIndex; i < s.startIndex + s.primitiveCount * 3; i++, v++) {
          const j = m.indices[i];
          for (let k = 0; k < 3; k++) { src[v * 6 + k] = m.positions[j * 3 + k]; src[v * 6 + 3 + k] = m.normals[j * 3 + k]; }
          uvs[v * 2] = m.uvs[j * 2]; uvs[v * 2 + 1] = m.uvs[j * 2 + 1];
          owner[v] = wi; indices[v] = v;
        }
      }
    });
    subMeshes.push({ textureArchive: archive, textureRecord: rec, startIndex: start, primitiveCount: (v - start) / 3 });
  }
  const batch = {
    model: { positions, normals, uvs, indices, subMeshes }, src, owner, mats: new Float32Array(wings.length * 12),
    wings: wings.map((w) => ({ at: [w.at[0], w.at[1], w.at[2]], court: [...(w.court ?? w.at)], spin: w.spin || 0, tilt: w.tilt || 0 })), turns: wings.some((w) => (w.spin || 0) !== 0), court: false,
  };
  egWreckLay(batch, 0, false);
  return batch;
}

/**
 * @param {ReturnType<typeof egWreckBatch>} B
 * @param {number} t
 * @param {boolean} [court]
 */
export function egWreckLay(B, t, court = false) {
  const M = B.mats, W = B.wings;
  B.court = court;
  for (let w = 0; w < W.length; w++) {
    const r = W[w].spin * t, cy = Math.cos(r), sy = Math.sin(r), cx = Math.cos(W[w].tilt), sx = Math.sin(W[w].tilt), o = w * 12, at = court ? W[w].court : W[w].at;
    // Rows of `Ry(spin * t) * Rx(tilt)` in row-major order, unlike the column-major draw matrices, then the
    // translation.
    M[o] = cy; M[o + 1] = sy * sx; M[o + 2] = sy * cx;
    M[o + 3] = 0; M[o + 4] = cx; M[o + 5] = -sx;
    M[o + 6] = -sy; M[o + 7] = cy * sx; M[o + 8] = cy * cx;
    M[o + 9] = at[0]; M[o + 10] = at[1]; M[o + 11] = at[2];
  }
  const S = B.src, P = B.model.positions, N = B.model.normals, own = B.owner;
  for (let v = 0; v < own.length; v++) {
    const o = own[v] * 12, i = v * 6, j = v * 3, x = S[i], y = S[i + 1], z = S[i + 2], nx = S[i + 3], ny = S[i + 4], nz = S[i + 5];
    P[j] = M[o] * x + M[o + 1] * y + M[o + 2] * z + M[o + 9];
    P[j + 1] = M[o + 3] * x + M[o + 4] * y + M[o + 5] * z + M[o + 10];
    P[j + 2] = M[o + 6] * x + M[o + 7] * y + M[o + 8] * z + M[o + 11];
    N[j] = M[o] * nx + M[o + 1] * ny + M[o + 2] * nz;
    N[j + 1] = M[o + 3] * nx + M[o + 4] * ny + M[o + 5] * nz;
    N[j + 2] = M[o + 6] * nx + M[o + 7] * ny + M[o + 8] * nz;
  }
}

function moveTo(M, x, y, z, s = 1) {
  M.fill(0);
  M[0] = s; M[5] = s; M[10] = s; M[12] = x; M[13] = y; M[14] = z; M[15] = 1;
  return M;
}

/** @param {{ renderer?: any, lite?: boolean }} [deps] */
export function createEgWreckLook({ renderer = null, lite = false } = {}) {
  /** @type {null | { band: number, batch: any, wings: any, under: any, tick: number, tris: number }} */
  let held = null;
  const make = (model) => {
    if (!model || !renderer?.createMesh) return null;
    try { return renderer.createMesh(model); } catch (e) { console.warn('[eg] the wreck would not build', e?.message ?? e); return null; }
  };
  const free = (gpu) => { if (gpu) { try { renderer?.destroyMesh?.(gpu); } catch { } } };
  const drawOf = (gpu) => (gpu ? { gpu, object: { matrix: moveTo(new Float32Array(16), 0, 0, 0) }, noShadow: true, hidden: false } : null);
  const api = {
    lite,
    stand(band, built = null) {
      if (held?.band === band) return false;
      api.release();
      let v = built && built.band === band ? built : null;
      if (!v) { try { v = buildEgVista(band, { lite }); } catch (e) { console.warn('[eg] the wreck would not build', e?.message ?? e); v = null; } }
      const batch = v?.wings?.length ? egWreckBatch(v.wings) : null, gpu = batch ? make(batch.model) : null;
      const ug = v?.under ? make(v.under.model) : null;
      held = {
        band, tick: 0,
        batch, wings: gpu ? { gpu, draw: drawOf(gpu) } : null,
        under: ug ? { gpu: ug, draw: drawOf(ug), at: v.under.at, scale: v.under.scale ?? 1, recs: v.under.model.subMeshes.length } : null,
        tris: (batch ? batch.owner.length / 3 : 0) + (v?.under ? v.under.model.indices.length / 3 : 0),
      };
      return true;
    },
    draws() { return [held?.wings?.draw, held?.under?.draw].filter(Boolean); },
    frame(eye, cx, cy, cz, seconds = 0, court = false) {
      if (!held) return;
      const W = held.wings, B = held.batch, U = held.under;
      if (W) {
        moveTo(W.draw.object.matrix, cx, cy, cz);
        const tick = B.turns && Number.isFinite(seconds) ? Math.floor(seconds * EG_WRECK_TURN_HZ) : 0;
        if (tick !== held.tick || !!court !== B.court) {
          held.tick = tick;
          egWreckLay(B, tick / EG_WRECK_TURN_HZ, !!court);
          try { renderer?.updateMeshVertices?.(W.gpu, B.model.positions, B.model.normals); } catch (e) { console.warn('[eg] the wreck would not turn', e?.message ?? e); }
        }
      }
      if (U && eye) moveTo(U.draw.object.matrix, eye[0] + U.at[0], eye[1] + U.at[1], eye[2] + U.at[2], U.scale);
    },
    release() {
      const h = held;
      held = null;
      free(h?.wings?.gpu); free(h?.under?.gpu);
    },
    stats: () => ({
      band: held?.band ?? -1, wings: held?.batch?.wings.length ?? 0, under: !!held?.under,
      draws: (held?.wings ? held.batch.model.subMeshes.length : 0) + (held?.under?.recs ?? 0), tris: held?.tris ?? 0, turns: !!held?.batch?.turns,
    }),
  };
  return api;
}
