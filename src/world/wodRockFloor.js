// @ts-check
// World of Daggerfall builds its rock fields from ARCH3D pebbles that have no bottom face. Where the open
// bottom of a piece shows, the rock is see-through and hollow. This module closes each open rim loop with a
// floor, built once per model for both the drawn mesh and the collider.

import { WOD_ROCK_MODELS } from './wodRockUv.js';

const FLOORS = new WeakMap();

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const turn = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/**
 * @template {{positions: Float32Array, normals?: Float32Array, uvs?: Float32Array, indices: Uint32Array, subMeshes: Array<any>}} M
 * @param {M} cpu
 * @param {?number} modelId
 * @returns {M & {floorAt?: number}}
 */
export function wodRockFloor(cpu, modelId) {
  if (!cpu?.normals || !cpu.uvs || !WOD_ROCK_MODELS.has(modelId)) return cpu;
  let out = FLOORS.get(cpu);
  if (!out) FLOORS.set(cpu, out = withFloor(cpu));
  return out;
}

/** @param {any} cpu */
function withFloor(cpu) {
  const P = cpu.positions, N = cpu.normals, UV = cpu.uvs, I = cpu.indices;
  const pt = (v) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
  const key = (v) => `${P[v * 3]},${P[v * 3 + 1]},${P[v * 3 + 2]}`;
  const edge = (t, e) => { const a = key(I[t + e]), b = key(I[t + (e + 1) % 3]); return a < b ? `${a}|${b}` : `${b}|${a}`; };
  const uses = new Map();
  let facing = 0, area = 0, uvArea = 0;
  for (let t = 0; t + 2 < I.length; t += 3) {
    const [a, b, c] = [I[t], I[t + 1], I[t + 2]], g = cross(sub(pt(b), pt(a)), sub(pt(c), pt(a)));
    facing += dot(g, [N[a * 3], N[a * 3 + 1], N[a * 3 + 2]]);
    area += Math.hypot(g[0], g[1], g[2]);
    uvArea += Math.abs((UV[b * 2] - UV[a * 2]) * (UV[c * 2 + 1] - UV[a * 2 + 1]) - (UV[c * 2] - UV[a * 2]) * (UV[b * 2 + 1] - UV[a * 2 + 1]));
    for (let e = 0; e < 3; e++) uses.set(edge(t, e), (uses.get(edge(t, e)) ?? 0) + 1);
  }
  const next = new Map();
  for (let t = 0; t + 2 < I.length; t += 3) {
    for (let e = 0; e < 3; e++) if (uses.get(edge(t, e)) === 1) next.set(key(I[t + e]), { from: I[t + e], to: I[t + (e + 1) % 3], t });
  }
  const first = next.values().next().value?.t ?? 0;
  const sm = cpu.subMeshes.find((s) => first >= s.startIndex && first < s.startIndex + s.primitiveCount * 3) ?? cpu.subMeshes[0];
  const density = area > 0 ? Math.sqrt(uvArea / area) : 1, sign = facing < 0 ? -1 : 1;
  const pos = [], nrm = [], uv = [], idx = [];
  const done = new Set();
  for (const start of next.keys()) {
    const loop = [];
    let k = start;
    while (!done.has(k) && next.has(k)) { done.add(k); loop.push(next.get(k).from); k = key(next.get(k).to); }
    if (k !== start || loop.length < 3) continue;
    const sum = [0, 0, 0];
    loop.forEach((v, i) => {
      const p = pt(v), q = pt(loop[(i + 1) % loop.length]);
      sum[0] += (p[1] - q[1]) * (p[2] + q[2]); sum[1] += (p[2] - q[2]) * (p[0] + q[0]); sum[2] += (p[0] - q[0]) * (p[1] + q[1]);
    });
    const n = unit(sum);
    const u = unit(Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0])), w = cross(n, u);
    const q = loop.map((v) => [dot(pt(v), u), dot(pt(v), w)]);
    const tris = [];
    const ring = loop.map((_, i) => i);
    while (ring.length > 3) {
      const at = ring.findIndex((b, i) => {
        const a = ring[(i + ring.length - 1) % ring.length], c = ring[(i + 1) % ring.length];
        return turn(q[a], q[b], q[c]) > 0 && !ring.some((j) => j !== a && j !== b && j !== c
          && turn(q[a], q[b], q[j]) >= 0 && turn(q[b], q[c], q[j]) >= 0 && turn(q[c], q[a], q[j]) >= 0);
      });
      if (at < 0) break;
      // Wound against the rim edges, so the floor faces outward like the rest of the mesh and survives culling.
      tris.push(ring[(at + 1) % ring.length], ring[at], ring[(at + ring.length - 1) % ring.length]);
      ring.splice(at, 1);
    }
    if (ring.length > 3) continue;
    tris.push(ring[2], ring[1], ring[0]);
    const base = P.length / 3 + pos.length / 3;
    for (const v of loop) {
      pos.push(...pt(v));
      nrm.push(-sign * n[0], -sign * n[1], -sign * n[2]);
      uv.push(dot(pt(v), u) * density, dot(pt(v), w) * density);
    }
    for (const i of tris) idx.push(base + i);
  }
  if (!idx.length) return cpu;
  const grow = (a, extra, T) => { const out = new T(a.length + extra.length); out.set(a); out.set(extra, a.length); return out; };
  return {
    ...cpu,
    positions: grow(P, pos, Float32Array), normals: grow(N, nrm, Float32Array), uvs: grow(UV, uv, Float32Array),
    indices: grow(I, idx, Uint32Array),
    subMeshes: [...cpu.subMeshes,
      { textureArchive: sm.textureArchive, textureRecord: sm.textureRecord, startIndex: I.length, primitiveCount: idx.length / 3 }],
    floorAt: I.length,
  };
}
