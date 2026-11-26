// @ts-check
export function ruinHash(...values) {
  let h = 2166136261;
  for (const v of values) { h = Math.imul(h ^ (v | 0), 16777619); h ^= h >>> 13; }
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function buildingRuinPlan(ring, locationId, blockX, blockY, record) {
  if (!(ring > 0)) return null;
  const seed = [locationId, blockX, blockY, record];
  const roll = ruinHash(...seed, 1);
  if (roll > .66 + Math.min(4, ring) * .065) return null;
  return { severity: roll < .24 ? 'collapsed' : roll < .58 ? 'breached' : 'roofless',
    angle: ruinHash(...seed, 2) * Math.PI * 2, seed: Math.floor(ruinHash(...seed, 3) * 0x7fffffff) };
}

const interpolate = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function clip(poly, field) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], fa = field(a), fb = field(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) out.push(interpolate(a, b, fa / (fa - fb)));
  }
  return out;
}

export function ruinBuildingMesh(cpu, plan) {
  if (!plan || !cpu?.normals || !cpu?.uvs || cpu.doors?.some((d) => d.type === 2 || d.type === 3)) return null;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < cpu.positions.length; i += 3) for (let a = 0; a < 3; a++) {
    lo[a] = Math.min(lo[a], cpu.positions[i + a]); hi[a] = Math.max(hi[a], cpu.positions[i + a]);
  }
  const height = hi[1] - lo[1], width = hi[0] - lo[0], depth = hi[2] - lo[2];
  if (!(height > 3 && height < 65 && width > 2.5 && depth > 2.5)) return null;
  const center = [(lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2];
  const p = [], n = [], uv = [], indices = [], subMeshes = [];
  const groups = cpu.subMeshes.map((s) => ({ ...s, tris: [] }));
  const emit = (g, a, b, c) => g.tris.push([a, b, c]);
  const vertex = (i) => [...cpu.positions.subarray(i * 3, i * 3 + 3), ...cpu.normals.subarray(i * 3, i * 3 + 3), ...cpu.uvs.subarray(i * 2, i * 2 + 2)];
  const doorCenters = (cpu.doors ?? []).map((d) => ({ x: (d.vert0.x + d.vert1.x + d.vert2.x) / 3,
    z: (d.vert0.z + d.vert1.z + d.vert2.z) / 3, top: Math.max(d.vert0.y, d.vert1.y, d.vert2.y) + .65 }));
  const fraction = plan.severity === 'collapsed' ? .22 : plan.severity === 'breached' ? .48 : .7;
  const field = (v) => {
    let ceiling = lo[1] + Math.max(1.1, height * fraction)
      + ((v[0] - center[0]) * Math.sin(plan.angle) + (v[2] - center[1]) * Math.cos(plan.angle)) * .22;
    ceiling += Math.sin(v[0] * 2.3 + plan.seed) * .5 + Math.cos(v[2] * 2.7) * .35;
    for (const d of doorCenters) if (Math.hypot(v[0] - d.x, v[2] - d.z) < 2.4) ceiling = Math.max(ceiling, d.top);
    return ceiling - v[1];
  };
  const keepPiece = (g, poly, isDoor) => {
    for (let k = 1; k + 1 < poly.length; k++) {
      emit(g, poly[0], poly[k], poly[k + 1]);
      if (Math.abs(poly[0][4]) < .65 && !isDoor) {
        const back = (v) => v.map((x, a) => a >= 3 && a < 6 ? -x : x);
        emit(g, back(poly[0]), back(poly[k + 1]), back(poly[k]));
      }
    }
  };
  const carve = (g, tri, depth = 0) => {
    const signs = tri.map(field);
    if (depth < 5 && signs.some((s) => s < 0) && signs.some((s) => s >= 0)) {
      let edge = 0, longest = 0;
      for (let i = 0; i < 3; i++) {
        const a = tri[i], b = tri[(i + 1) % 3], d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        if (d > longest) { longest = d; edge = i; }
      }
      if (longest > 2) {
        const a = tri[edge], b = tri[(edge + 1) % 3], c = tri[(edge + 2) % 3], m = interpolate(a, b, .5);
        carve(g, [a, m, c], depth + 1); carve(g, [m, b, c], depth + 1); return;
      }
    }
    keepPiece(g, clip(tri, field), false);
  };
  let removed = 0;
  for (let gi = 0; gi < groups.length; gi++) {
    const source = cpu.subMeshes[gi], g = groups[gi];
    const isDoor = source.textureArchive % 100 === 74;
    for (let j = source.startIndex; j < source.startIndex + source.primitiveCount * 3; j += 3) {
      const tri = [0, 1, 2].map((k) => vertex(cpu.indices[j + k]));
      if (!isDoor && tri.some((v) => field(v) < 0)) removed++;
      if (isDoor) keepPiece(g, tri, true); else carve(g, tri);
    }
  }
  if (!removed) return null;
  let masonry = groups.find((g) => g.textureArchive % 100 !== 74 && g.tris.length) ?? groups[0], roofScore = 0;
  for (let i = 0; i < cpu.subMeshes.length; i++) {
    const g = cpu.subMeshes[i]; if (g.textureArchive % 100 === 74) continue;
    let score = 0;
    for (let j = g.startIndex; j < g.startIndex + g.primitiveCount * 3; j += 3) {
      const k = cpu.indices[j];
      if (cpu.positions[k * 3 + 1] > lo[1] + height * .65 && cpu.normals[k * 3 + 1] > .35) score++;
    }
    if (score > roofScore) { roofScore = score; masonry = groups[i]; }
  }
  const shard = (x, z, w, d, h, turn) => {
    const cs = Math.cos(turn), sn = Math.sin(turn);
    const point = (a, y, b) => [x + a * cs - b * sn, lo[1] + y, z + a * sn + b * cs];
    const corners = [point(-w, .02, -d), point(w, .02, -d), point(w, .02, d), point(-w, .02, d), point(-w * .7, h, -d * .6), point(w * .6, h * .7, -d * .5), point(w * .5, h * .65, d * .7), point(-w * .6, h * .8, d * .5)];
    const face = (a, b, c) => {
      const A = corners[a], B = corners[b], C = corners[c], u = B.map((v, i) => v - A[i]), v = C.map((q, i) => q - A[i]);
      const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], len = Math.hypot(...normal) || 1;
      const N = normal.map((q) => -q / len);
      emit(masonry, [...A, ...N, 0, 0], [...C, ...N, w, d], [...B, ...N, w, 0]);
    };
    for (const q of [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7]]) { face(q[0], q[1], q[2]); face(q[0], q[2], q[3]); }
  };
  for (let i = 0; i < (plan.severity === 'collapsed' ? 12 : 7); i++) {
    const r = (k) => ruinHash(plan.seed, i, k);
    const x = lo[0] + width * (.1 + r(1) * .8), z = lo[2] + depth * (.1 + r(2) * .8);
    if (doorCenters.some((d) => Math.hypot(x - d.x, z - d.z) < 2.5)) continue;
    shard(x, z, .3 + r(3) * .8, .25 + r(4) * .6, .2 + r(5) * .7, r(6) * Math.PI);
  }
  for (const g of groups) {
    const startIndex = indices.length;
    for (const tri of g.tris) for (const v of tri) {
      indices.push(p.length / 3); p.push(...v.slice(0, 3));
      const len = Math.hypot(v[3], v[4], v[5]) || 1;
      n.push(v[3] / len, v[4] / len, v[5] / len); uv.push(v[6], v[7]);
    }
    if (indices.length > startIndex) subMeshes.push({ textureArchive: g.textureArchive, textureRecord: g.textureRecord, startIndex, primitiveCount: (indices.length - startIndex) / 3 });
  }
  return { positions: Float32Array.from(p), normals: Float32Array.from(n), uvs: Float32Array.from(uv),
    indices: Uint32Array.from(indices), subMeshes, doors: cpu.doors, ruin: plan.severity };
}
