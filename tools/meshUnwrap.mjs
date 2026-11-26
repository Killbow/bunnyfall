// Computes a UV unwrap: islands grown against each island's running average normal, planar projection,
// minimum-area rotation, and shelf packing at one global scale.
// Run: node tools/meshUnwrap.mjs <in.json> <out.json> [--angle=66] [--margin=4] [--size=512].
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { isMain } from './lib/isMain.mjs';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (v) => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

export function unwrapQuality(mesh) {
  const U = mesh.uvs; const I = mesh.indices;
  if (!U) return { hasUvs: false, coverage: 0, distinct: 0, verdict: 'no UVs at all' };
  let coverage = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = [U[I[t] * 2], U[I[t] * 2 + 1]];
    const b = [U[I[t + 1] * 2], U[I[t + 1] * 2 + 1]];
    const c = [U[I[t + 2] * 2], U[I[t + 2] * 2 + 1]];
    coverage += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
  }
  const distinct = new Set();
  for (let i = 0; i < U.length; i += 2) distinct.add(`${U[i].toFixed(5)},${U[i + 1].toFixed(5)}`);
  // 1.3 rather than 1.0: a real unwrap wastes some atlas, and a little overlap at a seam is normal.
  const overlapping = coverage > 1.3;
  return {
    hasUvs: true,
    coverage: +coverage.toFixed(3),
    distinct: distinct.size,
    vertices: U.length / 2,
    overlapping,
    verdict: overlapping
      ? `islands overlap: the triangles' UV areas total ${coverage.toFixed(2)}, and ${distinct.size} distinct coordinates over ${U.length / 2} vertices`
      : 'usable',
  };
}

export function islandsOf(mesh, angleDeg = 66) {
  const P = mesh.positions; const I = mesh.indices;
  // Weld first: adjacency follows the surface, not the vertices the exporter split for normals.
  const key = new Map();
  const posId = new Int32Array(P.length / 3);
  for (let v = 0; v < P.length / 3; v++) {
    const k = `${P[v * 3].toFixed(5)},${P[v * 3 + 1].toFixed(5)},${P[v * 3 + 2].toFixed(5)}`;
    if (!key.has(k)) key.set(k, key.size);
    posId[v] = key.get(k);
  }
  const faces = I.length / 3;
  const faceNormal = [];
  for (let f = 0; f < faces; f++) {
    const [a, b, c] = [I[f * 3], I[f * 3 + 1], I[f * 3 + 2]].map((v) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]);
    faceNormal.push(cross(sub(b, a), sub(c, a)));
  }
  const cosLimit = Math.cos((angleDeg * Math.PI) / 180);

  const edges = new Map();
  for (let f = 0; f < faces; f++) {
    for (let e = 0; e < 3; e++) {
      const a = posId[I[f * 3 + e]]; const b = posId[I[f * 3 + ((e + 1) % 3)]];
      if (a === b) continue;
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (!edges.has(k)) edges.set(k, []);
      edges.get(k).push(f);
    }
  }
  const neighbours = (f) => {
    const out = [];
    for (let e = 0; e < 3; e++) {
      const a = posId[I[f * 3 + e]]; const b = posId[I[f * 3 + ((e + 1) % 3)]];
      if (a === b) continue;
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      for (const g of edges.get(k) ?? []) if (g !== f) out.push(g);
    }
    return out;
  };

  const area2 = faceNormal.map((n) => Math.hypot(...n));
  const order = [...faceNormal.keys()].sort((a, b) => area2[b] - area2[a] || a - b);

  const island = new Int32Array(faces).fill(-1);
  const islands = [];
  for (const seed of order) {
    if (island[seed] >= 0) continue;
    const id = islands.length;
    const members = [seed];
    island[seed] = id;
    let acc = [...faceNormal[seed]];
    let avg = norm(acc);
    const queue = [seed];
    while (queue.length) {
      const f = queue.shift();
      for (const g of neighbours(f)) {
        if (island[g] >= 0) continue;
        if (dot(norm(faceNormal[g]), avg) < cosLimit) continue;
        island[g] = id;
        members.push(g);
        acc = [acc[0] + faceNormal[g][0], acc[1] + faceNormal[g][1], acc[2] + faceNormal[g][2]];
        // A ring that has come most of the way round can drive the sum to zero, so keep the last good plane.
        if (Math.hypot(...acc) > 1e-9) avg = norm(acc);
        queue.push(g);
      }
    }
    islands.push(members);
  }
  return { islands, faceNormal, posId };
}

export function bestAngle(points, steps = 90) {
  let best = { angle: 0, area: Infinity, w: 0, h: 0 };
  for (let s = 0; s < steps; s++) {
    const a = (s / steps) * (Math.PI / 2);
    const ca = Math.cos(a); const sa = Math.sin(a);
    let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
    for (const p of points) {
      const x = p[0] * ca - p[1] * sa; const y = p[0] * sa + p[1] * ca;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const w = x1 - x0; const h = y1 - y0;
    const area = w * h;
    if (area < best.area) best = { angle: a, area, w, h, x0, y0 };
  }
  return best;
}

function shelfPack(boxes, scale, margin) {
  const order = boxes.map((b, i) => ({ i, w: b.w * scale + margin, h: b.h * scale + margin }))
    .sort((a, b) => b.h - a.h || b.w - a.w);
  const placed = new Array(boxes.length);
  let shelfY = margin; let shelfH = 0; let x = margin;
  for (const box of order) {
    if (box.w > 1 - margin || box.h > 1 - margin) return null;
    if (x + box.w > 1 - margin) { shelfY += shelfH; shelfH = 0; x = margin; }
    if (shelfY + box.h > 1 - margin) return null;
    placed[box.i] = { x, y: shelfY };
    x += box.w;
    if (box.h > shelfH) shelfH = box.h;
  }
  return placed;
}

export function unwrap(mesh, { angle = 66, margin = 4, size = 512 } = {}) {
  const P = mesh.positions; const N = mesh.normals; const I = mesh.indices;
  const { islands, faceNormal } = islandsOf(mesh, angle);
  const marginUv = margin / size;

  const projected = islands.map((faces) => {
    let n = [0, 0, 0];
    for (const f of faces) n = [n[0] + faceNormal[f][0], n[1] + faceNormal[f][1], n[2] + faceNormal[f][2]];
    if (Math.hypot(...n) < 1e-12) n = [0, 0, 1];
    n = norm(n);
    const s = n[2] >= 0 ? 1 : -1;
    const a = -1 / (s + n[2]);
    const b = n[0] * n[1] * a;
    const tx = [1 + s * n[0] * n[0] * a, s * b, -s * n[0]];
    const ty = [b, s + n[1] * n[1] * a, -n[1]];
    const verts = new Set();
    for (const f of faces) for (let e = 0; e < 3; e++) verts.add(I[f * 3 + e]);
    const list = [...verts];
    const flat = list.map((v) => {
      const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
      return [dot(p, tx), dot(p, ty)];
    });
    const fit = bestAngle(flat);
    const ca = Math.cos(fit.angle); const sa = Math.sin(fit.angle);
    const turn = fit.h > fit.w;
    const local = new Map();
    list.forEach((v, k) => {
      const x = flat[k][0] * ca - flat[k][1] * sa - fit.x0;
      const y = flat[k][0] * sa + flat[k][1] * ca - fit.y0;
      local.set(v, turn ? [y, x] : [x, y]);
    });
    return { faces, local, w: turn ? fit.h : fit.w, h: turn ? fit.w : fit.h };
  });

  // Double the scale until it no longer fits, then bisect; a fixed upper bound would cap the result.
  let lo = 0; let hi = 1;
  while (shelfPack(projected, hi, marginUv) && hi < 1e6) { lo = hi; hi *= 2; }
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (shelfPack(projected, mid, marginUv)) lo = mid; else hi = mid;
  }
  const scale = lo;
  const places = shelfPack(projected, scale, marginUv);
  if (!places) throw new Error('nothing packs - the islands do not fit at any scale');

  const positions = []; const normals = []; const uvs = []; const indices = [];
  const remap = new Map();
  projected.forEach((island, ii) => {
    const at = places[ii];
    for (const f of island.faces) {
      for (let e = 0; e < 3; e++) {
        const v = I[f * 3 + e];
        const k = `${ii}:${v}`;
        let out = remap.get(k);
        if (out === undefined) {
          out = positions.length / 3;
          positions.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
          if (N) normals.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
          const [lx, ly] = island.local.get(v);
          uvs.push(at.x + lx * scale, at.y + ly * scale);
          remap.set(k, out);
        }
        indices.push(out);
      }
    }
  });

  const out = {
    ...mesh,
    positions: positions.map((v) => +v.toFixed(6)),
    normals: normals.length ? normals.map((v) => +v.toFixed(6)) : null,
    uvs: uvs.map((v) => +v.toFixed(6)),
    indices,
    unwrap: {
      tool: 'tools/meshUnwrap.mjs',
      replaced: unwrapQuality(mesh),
      islands: islands.length,
      angle,
      marginTexels: margin,
      atlasSize: size,
      scale: +scale.toFixed(6),
      vertices: positions.length / 3,
    },
  };
  out.unwrap.quality = unwrapQuality(out);
  return out;
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k, d) => Number(args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d);
  const files = args.filter((a) => !a.startsWith('--'));
  if (files.length !== 2) {
    console.error('usage: node tools/meshUnwrap.mjs <in.json> <out.json> [--angle=66] [--margin=4] [--size=512]');
    process.exit(2);
  }
  const mesh = JSON.parse(readFileSync(files[0], 'utf8'));
  const before = unwrapQuality(mesh);
  console.log(`${files[0]}: ${before.verdict}`);
  const out = unwrap(mesh, { angle: opt('angle', 66), margin: opt('margin', 4), size: opt('size', 512) });
  mkdirSync(dirname(files[1]), { recursive: true });
  writeFileSync(files[1], `${JSON.stringify(out)}\n`);
  const u = out.unwrap;
  console.log(`${files[1]}: ${u.islands} islands, ${mesh.positions.length / 3} -> ${u.vertices} vertices`);
  console.log(`  coverage ${before.coverage} -> ${u.quality.coverage} (1.0 fills the atlas exactly once)`);
  console.log(`  ${u.quality.distinct} distinct coordinates, ${u.quality.verdict}`);
}
