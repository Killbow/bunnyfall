// @ts-check

// 0.25 keeps 4 of the 16 thresholds of the renderer's 4x4 Bayer dither.
export const EG_OCCLUDE_KEEP = 0.25;
export const EG_OCCLUDE_FADE_S = 0.2;
// The ray stops short of the body so the floor under it and a wall beside it never count as occluders.
export const EG_OCCLUDE_BODY_M = 0.3;
export const EG_OCCLUDE_CHEST_M = 0.9;
export const EG_OCCLUDE_VIEWS_MAX = 64;
const NO_SHADOW = Object.freeze({ noShadow: true });
// One scratch serves every segment, which is safe only because `egOccludersHit` is synchronous.
const _dir = [0, 0, 0];

/**
 * @param {number[]} o
 * @param {number[]} d
 * @param {number} len
 * @param {Float32Array} T
 * @param {number} k
 */
export function egSegTri(o, d, len, T, k) {
  const i = k * 9;
  const e1x = T[i + 3] - T[i], e1y = T[i + 4] - T[i + 1], e1z = T[i + 5] - T[i + 2];
  const e2x = T[i + 6] - T[i], e2y = T[i + 7] - T[i + 1], e2z = T[i + 8] - T[i + 2];
  const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return false;
  const inv = 1 / det, sx = o[0] - T[i], sy = o[1] - T[i + 1], sz = o[2] - T[i + 2];
  const u = (sx * px + sy * py + sz * pz) * inv;
  if (u < 0 || u > 1) return false;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
  if (v < 0 || u + v > 1) return false;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t > 0 && t < len;
}
export function egSegBox(o, d, len, b) {
  let t0 = 0, t1 = len;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-12) { if (o[a] < b[a] || o[a] > b[a + 3]) return false; continue; }
    let ta = (b[a] - o[a]) / d[a], tb = (b[a + 3] - o[a]) / d[a];
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}
/**
 * @param {Array<{ b: number[], at: number, n: number }>} pieces
 * @param {Float32Array} T
 * @param {number[]} eye
 * @param {number[][]} points
 * @param {number[]} [out]
 * @param {Uint8Array|null} [seen]
 */
export function egOccludersHit(pieces, T, eye, points, out = [], seen = null) {
  out.length = 0;
  if (!eye || !points?.length) return out;
  if (!seen || seen.length < pieces.length) seen = new Uint8Array(pieces.length); else seen.fill(0, 0, pieces.length);
  const d = _dir;
  for (const p of points) {
    if (!p) continue;
    const dx = p[0] - eye[0], dy = p[1] - eye[1], dz = p[2] - eye[2], full = Math.hypot(dx, dy, dz), len = full - EG_OCCLUDE_BODY_M;
    if (!(len > 0)) continue;
    d[0] = dx / full; d[1] = dy / full; d[2] = dz / full;
    for (let i = 0; i < pieces.length; i++) {
      if (seen[i]) continue;
      const q = pieces[i];
      if (!egSegBox(eye, d, len, q.b)) continue;
      for (let k = q.at; k < q.at + q.n; k++) if (egSegTri(eye, d, len, T, k)) { seen[i] = 1; break; }
    }
  }
  for (let i = 0; i < pieces.length; i++) if (seen[i]) out.push(i);
  return out;
}
export function egOccludeEase(k, hit, dt) {
  const step = ((1 - EG_OCCLUDE_KEEP) * Math.max(0, Number(dt) || 0)) / EG_OCCLUDE_FADE_S;
  return hit ? Math.max(EG_OCCLUDE_KEEP, k - step) : Math.min(1, k + step);
}
/**
 * @param {any[]} subs
 * @param {Array<{ r: number[][] }>} pieces
 * @param {number[]} ids
 * @param {boolean} cut
 */
export function egOccludeRanges(subs, pieces, ids, cut) {
  const by = subs.map(() => /** @type {number[][]} */ ([]));
  for (const i of ids) for (const [s, at, n] of pieces[i].r) by[s].push([at, n * 3]);
  const out = [];
  const put = (s, at, len) => { if (len > 0) out.push({ textureArchive: subs[s].textureArchive, textureRecord: subs[s].textureRecord, startIndex: at, primitiveCount: len / 3 }); };
  for (let s = 0; s < subs.length; s++) {
    const runs = by[s].sort((a, b) => a[0] - b[0]), merged = [];
    for (const [at, len] of runs) { const m = merged[merged.length - 1]; if (m && m[0] + m[1] === at) m[1] += len; else merged.push([at, len]); }
    if (!cut) { for (const [at, len] of merged) put(s, at, len); continue; }
    let from = subs[s].startIndex;
    const end = from + subs[s].primitiveCount * 3;
    for (const [at, len] of merged) { put(s, from, at - from); from = at + len; }
    put(s, from, end - from);
  }
  return out;
}

/** @param {{ renderer?: any, shadow?: boolean }} deps */
export function createEgOccluders({ renderer = null, shadow = true } = {}) {
  /** @type {any} */
  let mesh = null, subs = /** @type {any[]} */ ([]), draw = null, hid = false, lastDraws = 0;
  /** @type {Array<{ b: number[], at: number, n: number, r: number[][] }>} */
  let pieces = [];
  let T = new Float32Array(0);
  const share = new Map();
  const _hits = [], _hitSet = new Set(), _act = [];
  let _seen = new Uint8Array(0);
  const views = new Map();
  const viewOf = (key, ids, cut) => {
    let v = views.get(key);
    if (v === undefined) {
      if (views.size >= EG_OCCLUDE_VIEWS_MAX) views.clear();
      v = renderer?.meshView?.(mesh, egOccludeRanges(subs, pieces, ids, cut)) ?? null;
      views.set(key, v);
    }
    return v;
  };
  const unhide = () => { if (draw && hid) draw.hidden = false; hid = false; };
  return {
    set(gpu, model) {
      unhide();
      mesh = gpu ?? null; subs = model?.subMeshes ?? []; share.clear(); views.clear();
      const occ = model?.occluders ?? [], P = model?.positions, I = model?.indices;
      let n = 0;
      for (const o of occ) for (const r of o.r) n += r[2];
      T = new Float32Array(P && I ? n * 9 : 0);
      pieces = [];
      let at = 0;
      if (P && I) for (const o of occ) {
        const first = at;
        for (const [, s, c] of o.r) for (let j = s; j < s + c * 3; j++) { const v = I[j] * 3; T[at * 3] = P[v]; T[at * 3 + 1] = P[v + 1]; T[at * 3 + 2] = P[v + 2]; at++; }
        pieces.push({ b: o.b, at: first / 3, n: (at - first) / 3, r: o.r });
      }
      return pieces.length;
    },
    stand(d) { unhide(); draw = d ?? null; share.clear(); },
    // Call before the circle mesh is freed: the views share its buffers and own none.
    clear() { unhide(); mesh = null; subs = []; pieces = []; T = new Float32Array(0); draw = null; lastDraws = 0; share.clear(); views.clear(); },
    /** @param {{ eye?: number[] | null, points?: number[][] | null, dt?: number }} f */
    frame({ eye = null, points = null, dt = 0 } = {}) {
      if (!share.size && (!mesh || !eye || !points?.length)) return 0;
      if (_seen.length < pieces.length) _seen = new Uint8Array(pieces.length);
      const hit = _hitSet;
      hit.clear();
      if (mesh) for (const i of egOccludersHit(pieces, T, eye, points, _hits, _seen)) hit.add(i);
      for (const i of hit) share.set(i, egOccludeEase(share.get(i) ?? 1, true, dt));
      for (const [i, k] of share) if (!hit.has(i)) { const v = egOccludeEase(k, false, dt); if (v >= 1) share.delete(i); else share.set(i, v); }
      let n = 0;
      for (const k of share.values()) if (k < 1) n++;
      return n;
    },
    /**
     * Call after `beginFrame` opens the shadow record and before the loop draws the list.
     * @param {any} [texRemap]
     */
    draw(texRemap = null) {
      lastDraws = 0;
      if (!share.size) { unhide(); return 0; }
      const act = _act;
      act.length = 0;
      for (const e of share) if (e[1] < 1) act.push(e);
      if (!act.length || !draw || !mesh || mesh._dead || !renderer?.meshView || !renderer.setDissolve) { unhide(); return 0; }
      const M = draw.object?.matrix, remap = draw.texRemap ?? texRemap;
      const ids = act.map(([i]) => i).sort((a, b) => a - b);
      const rest = viewOf(`r:${ids.join(',')}`, ids, true);
      if (!rest) { unhide(); return 0; }
      draw.hidden = true; hid = true;
      if (shadow) renderer.recordShadowMesh?.(mesh, M, remap);
      renderer.drawMesh(rest, M, remap, NO_SHADOW);
      lastDraws += rest.subMeshes.length;
      const byShare = new Map();
      for (const [i, k] of act) { const g = byShare.get(k); if (g) g.push(i); else byShare.set(k, [i]); }
      for (const [k, g] of byShare) {
        g.sort((a, b) => a - b);
        const v = viewOf(`d:${g.join(',')}`, g, false);
        if (!v) continue;
        renderer.setDissolve(k);
        renderer.drawMesh(v, M, remap, NO_SHADOW);
        lastDraws += v.subMeshes.length;
      }
      renderer.setDissolve(1);
      return lastDraws;
    },
    shares: () => [...share].filter(([, k]) => k < 1),
    stats: () => ({ pieces: pieces.length, tris: T.length / 9, dithering: [...share.values()].filter((k) => k < 1).length, glDraws: lastDraws, views: views.size, hidden: hid }),
  };
}
