// @ts-check
import { rayTriangle } from '../maps/automapPick.js';

const UPRIGHT = 0.2;
const MIN_FACE_M2 = 0.05;
const NEAR_M = 12, SIGHT_RAYS = 16, SIGHT_EYE_M = 1.2, SIGHT_M = 40;
const facesCache = new WeakMap();

function uprightFaces(model) {
  const hit = facesCache.get(model);
  if (hit) return hit;
  const out = new Map();
  const { positions: p, uvs: uv, indices: ix } = model;
  for (const sm of model.subMeshes ?? []) {
    const key = `${sm.textureArchive}_${sm.textureRecord}`;
    for (let k = 0; k < sm.primitiveCount; k++) {
      const a = ix[sm.startIndex + k * 3], b = ix[sm.startIndex + k * 3 + 1], c = ix[sm.startIndex + k * 3 + 2];
      const e1 = [p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]];
      const e2 = [p[c * 3] - p[a * 3], p[c * 3 + 1] - p[a * 3 + 1], p[c * 3 + 2] - p[a * 3 + 2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const twice = Math.hypot(n[0], n[1], n[2]), area = twice / 2;
      if (area < MIN_FACE_M2 || Math.abs(n[1]) / twice >= UPRIGHT) continue;
      const perU = gradient(e1, e2, uv[b * 2] - uv[a * 2], uv[c * 2] - uv[a * 2]);
      const perV = gradient(e1, e2, uv[b * 2 + 1] - uv[a * 2 + 1], uv[c * 2 + 1] - uv[a * 2 + 1]);
      if (!(perU > 0 && perV > 0)) continue;
      if (!out.has(key)) out.set(key, { archive: sm.textureArchive, record: sm.textureRecord, faces: [] });
      out.get(key).faces.push({ area, perU, perV, c: [(p[a * 3] + p[b * 3] + p[c * 3]) / 3, (p[a * 3 + 1] + p[b * 3 + 1] + p[c * 3 + 1]) / 3, (p[a * 3 + 2] + p[b * 3 + 2] + p[c * 3 + 2]) / 3],
        v: [p[a * 3], p[a * 3 + 1], p[a * 3 + 2], p[b * 3], p[b * 3 + 1], p[b * 3 + 2], p[c * 3], p[c * 3 + 1], p[c * 3 + 2]] });
    }
  }
  facesCache.set(model, out);
  return out;
}

function gradient(e1, e2, d1, d2) {
  const a = e1[0] * e1[0] + e1[1] * e1[1] + e1[2] * e1[2], b = e1[0] * e2[0] + e1[1] * e2[1] + e1[2] * e2[2], c = e2[0] * e2[0] + e2[1] * e2[1] + e2[2] * e2[2];
  const det = a * c - b * b;
  if (!(det > 0)) return 0;
  const s = (d1 * c - d2 * b) / det, t = (d2 * a - d1 * b) / det;
  return Math.hypot(s * e1[0] + t * e2[0], s * e1[1] + t * e2[1], s * e1[2] + t * e2[2]);
}

function median(faces, rate) {
  const area = faces.reduce((s, f) => s + f.area, 0), sorted = [...faces].sort((x, y) => x[rate] - y[rate]);
  let acc = 0;
  for (const f of sorted) { acc += f.area; if (acc >= area / 2) return f[rate]; }
  return sorted[sorted.length - 1][rate];
}

function put(m, v, o) {
  const a = v[o], b = v[o + 1], c = v[o + 2];
  return [m[0] * a + m[4] * b + m[8] * c + m[12], m[1] * a + m[5] * b + m[9] * c + m[13], m[2] * a + m[6] * b + m[10] * c + m[14]];
}
const dist2 = (p, x, y, z) => (p[0] - x) ** 2 + (p[1] - y) ** 2 + (p[2] - z) ** 2;

/** @returns {{ archive: number, record: number, tile: number, tileV: number } | null} */
export function dungeonWallPicture(block, at, modelOf, resolve = (archive, record) => `${archive}_${record}`) {
  if (!block) return null;
  const x = at[0] - block.originX, y = at[1], z = at[2] - block.originZ, eye = [x, y + SIGHT_EYE_M, z];
  const dirs = Array.from({ length: SIGHT_RAYS }, (_, i) => [Math.cos((i * 2 * Math.PI) / SIGHT_RAYS), 0, Math.sin((i * 2 * Math.PI) / SIGHT_RAYS)]);
  const first = dirs.map(() => ({ t: SIGHT_M, key: '', face: null }));
  const near = new Map();
  for (const pl of block.layout?.placements ?? []) {
    const model = modelOf(pl.modelIdNum), m = pl.matrix;
    if (!model?.positions || !model.uvs || !model.indices || !m) continue;
    for (const set of uprightFaces(model).values()) {
      const key = resolve(set.archive, set.record);
      for (const f of set.faces) {
        const d2 = dist2(put(m, f.c, 0), x, y, z);
        if (d2 > (SIGHT_M + 10) ** 2) continue;
        if (d2 <= NEAR_M * NEAR_M) { if (!near.has(key)) near.set(key, []); near.get(key).push(f); }
        const a = put(m, f.v, 0), b = put(m, f.v, 3), c = put(m, f.v, 6);
        for (let i = 0; i < dirs.length; i++) {
          const t = rayTriangle(eye, dirs[i], a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
          if (t > 0.05 && t < first[i].t) first[i] = { t, key, face: f };
        }
      }
    }
  }
  const votes = new Map();
  for (const h of first) if (h.face) votes.set(h.key, (votes.get(h.key) ?? 0) + 1);
  let won = '', most = 0;
  for (const [key, n] of votes) if (n > most) { won = key; most = n; }
  if (!most) return null;
  const faces = near.get(won) ?? first.filter((h) => h.key === won).map((h) => h.face);
  const [archive, record] = won.split('_').map(Number);
  return { archive, record, tile: +(1 / median(faces, 'perU')).toFixed(3), tileV: +(1 / median(faces, 'perV')).toFixed(3) };
}
