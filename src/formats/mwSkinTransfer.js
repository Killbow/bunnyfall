
import { GRAPH_ROOT } from './mwSkin.js';

const IDENT_TRANSFORM = Object.freeze({ rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [0, 0, 0], scale: 1 });

export function sourceSkin(batch, { attachRef = null, mirrored = false, boneOffset = null } = {}) {
  if (batch.skinned && batch.skin) return batch;
  const n = batch.positions.length / 3;
  const a = Float32Array.from([mirrored ? -1 : 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const t = boneOffset ? [boneOffset[0], boneOffset[1], boneOffset[2]] : [0, 0, 0];
  return {
    ...batch,
    skinned: true,
    skin: {
      skeletonRoot: GRAPH_ROOT, rootBone: GRAPH_ROOT, transform: IDENT_TRANSFORM, shapeTransform: null,
      bones: [{ ref: attachRef, name: '', invBind: { a, t }, indices: Array.from({ length: n }, (_, i) => i), weights: new Array(n).fill(1) }],
    },
  };
}

// Measures the anchors after skinning them in `ctx.pose`, because a retail body part's raw vertices are part-local
// and sit far from the body.
export function fitLift(garments, anchors, ctx) {
  let top = -Infinity;
  for (const g of garments) for (let i = 2; i < g.positions.length; i += 3) top = Math.max(top, g.positions[i]);
  let anchorTop = -Infinity;
  for (const a of anchors) {
    const p = new Float32Array(a.positions.length);
    ctx.skinBatch(a, ctx.skeleton, ctx.pose, ctx.mats, p, null);
    for (let i = 2; i < p.length; i += 3) anchorTop = Math.max(anchorTop, p[i]);
  }
  if (!Number.isFinite(top) || !Number.isFinite(anchorTop)) return null;
  return { lift: anchorTop - top, top, anchorTop };
}

export function liftBatch(batch, lift) {
  const positions = Float32Array.from(batch.positions);
  for (let i = 2; i < positions.length; i += 3) positions[i] += lift;
  return { ...batch, positions };
}

function influencesOf(skin, n) {
  const out = Array.from({ length: n }, () => []);
  skin.bones.forEach((b, bi) => {
    for (let k = 0; k < b.indices.length; k++) out[b.indices[k]]?.push([bi, b.weights[k]]);
  });
  return out;
}

function invert33(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!(Math.abs(det) > 1e-12)) return null;
  const k = 1 / det;
  return [A * k, -(b * i - c * h) * k, (b * f - c * e) * k,
    B * k, (a * i - c * g) * k, -(a * f - c * d) * k,
    C * k, -(a * h - b * g) * k, (a * e - b * d) * k];
}

// Measures each affine by skinning four probe vertices through `skinBatch` itself, so the solve uses exactly the
// arithmetic that draws the garment.
function measureAffines(src, js, { skeleton, pose, mats, skinBatch }) {
  const infl = src.infl;
  const bones = src.batch.skin.bones.map((b) => ({ ref: b.ref, name: b.name, invBind: b.invBind, indices: [], weights: [] }));
  const positions = new Float32Array(js.length * 12);
  js.forEach((j, q) => {
    positions.set([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], q * 12);
    for (const [bi, w] of infl[j]) for (let c = 0; c < 4; c++) { bones[bi].indices.push(q * 4 + c); bones[bi].weights.push(w); }
  });
  const probe = { skin: { ...src.batch.skin, bones }, positions, normals: null };
  const out = new Float32Array(positions.length);
  skinBatch(probe, skeleton, pose, mats, out, null);
  const res = new Map();
  js.forEach((j, q) => {
    const o = q * 12;
    const t = [out[o], out[o + 1], out[o + 2]];
    const col = (k) => [out[o + k * 3] - t[0], out[o + k * 3 + 1] - t[1], out[o + k * 3 + 2] - t[2]];
    const [cx, cy, cz] = [col(1), col(2), col(3)];
    res.set(j, { a: [cx[0], cy[0], cz[0], cx[1], cy[1], cz[1], cx[2], cy[2], cz[2]], t });
  });
  return res;
}

export function transferSkin(garment, sources, ctx) {
  if (!sources.length) return [];
  const src = sources.map((batch) => {
    const n = batch.positions.length / 3;
    const p = new Float32Array(batch.positions.length);
    ctx.skinBatch(batch, ctx.skeleton, ctx.pose, ctx.mats, p, null);
    return { batch, n, p, infl: influencesOf(batch.skin, n) };
  });
  const G = garment.positions;
  const gn = G.length / 3;
  const nearestIn = (s, v) => {
    const { p, n } = src[s];
    const x = G[v * 3], y = G[v * 3 + 1], z = G[v * 3 + 2];
    let best = -1; let bd = Infinity;
    for (let j = 0; j < n; j++) {
      const dx = p[j * 3] - x, dy = p[j * 3 + 1] - y, dz = p[j * 3 + 2] - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) { bd = d; best = j; }
    }
    return { j: best, d: bd };
  };
  const cache = new Map();
  const nearest = (s, v) => { const k = s * gn + v; let r = cache.get(k); if (!r) { r = nearestIn(s, v); cache.set(k, r); } return r; };
  const overall = (v) => { let bs = 0; let bd = Infinity; for (let s = 0; s < src.length; s++) { const r = nearest(s, v); if (r.d < bd) { bd = r.d; bs = s; } } return bs; };

  const subs = src.map(() => ({ map: new Map(), verts: [], indices: [] }));
  const I = garment.indices;
  for (let t = 0; t < I.length; t += 3) {
    const tri = [I[t], I[t + 1], I[t + 2]];
    const votes = tri.map(overall);
    const s = votes.find((x) => votes.filter((y) => y === x).length >= 2) ?? votes[0];
    const sub = subs[s];
    for (const v of tri) {
      let at = sub.map.get(v);
      if (at === undefined) { at = sub.verts.length; sub.map.set(v, at); sub.verts.push({ v, j: nearest(s, v).j }); }
      sub.indices.push(at);
    }
  }

  const out = [];
  subs.forEach((sub, s) => {
    if (!sub.indices.length) return;
    const { batch, infl } = src[s];
    const js = [...new Set(sub.verts.map((x) => x.j))];
    const aff = measureAffines(src[s], js, ctx);
    const bones = batch.skin.bones.map((b) => ({ ref: b.ref, name: b.name, invBind: b.invBind, indices: [], weights: [] }));
    const positions = new Float32Array(sub.verts.length * 3);
    const uvs = garment.uvs ? new Float32Array(sub.verts.length * 2) : null;
    const N = garment.normals && garment.normals.length === G.length ? garment.normals : null;
    const normals = N ? new Float32Array(sub.verts.length * 3) : null;
    sub.verts.forEach(({ v, j }, k) => {
      const m = aff.get(j);
      const inv = invert33(m.a);
      const gx = G[v * 3] - m.t[0], gy = G[v * 3 + 1] - m.t[1], gz = G[v * 3 + 2] - m.t[2];
      if (inv) {
        positions[k * 3] = inv[0] * gx + inv[1] * gy + inv[2] * gz;
        positions[k * 3 + 1] = inv[3] * gx + inv[4] * gy + inv[5] * gz;
        positions[k * 3 + 2] = inv[6] * gx + inv[7] * gy + inv[8] * gz;
      } else {
        positions.set([G[v * 3], G[v * 3 + 1], G[v * 3 + 2]], k * 3);
      }
      if (normals) {
        const nx = N[v * 3], ny = N[v * 3 + 1], nz = N[v * 3 + 2];
        const ox = inv ? inv[0] * nx + inv[1] * ny + inv[2] * nz : nx;
        const oy = inv ? inv[3] * nx + inv[4] * ny + inv[5] * nz : ny;
        const oz = inv ? inv[6] * nx + inv[7] * ny + inv[8] * nz : nz;
        const len = Math.hypot(ox, oy, oz) || 1;
        normals[k * 3] = ox / len; normals[k * 3 + 1] = oy / len; normals[k * 3 + 2] = oz / len;
      }
      for (const [bi, w] of infl[j]) { bones[bi].indices.push(k); bones[bi].weights.push(w); }
      if (uvs) { uvs[k * 2] = garment.uvs[v * 2]; uvs[k * 2 + 1] = garment.uvs[v * 2 + 1]; }
    });
    out.push({
      name: garment.name || '', skinned: true,
      skin: { ...batch.skin, bones: bones.filter((b) => b.indices.length) },
      positions, normals, uvs, colors: null, material: garment.material ?? null,
      indices: Uint16Array.from(sub.indices),
    });
  });
  return out;
}
