#!/usr/bin/env node
// Measures gaps between faces in every dungeon block of ARENA2, with or without the seam patch.
// Usage: ARENA2_PATH=<dir> node tools/seamCensus.mjs [--patched] [--model <id>] [--limit <n>] [--all]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Arch3dFile } from '../src/formats/arch3dFile.js';
import { BlocksFile, BLOCK_TYPES } from '../src/formats/blocksFile.js';
import { layoutRdbBlock } from '../src/world/rdbLayout.js';
import { dfMeshToModel, GLOBAL_SCALE } from '../src/world/meshReader.js';
import { transformPoint } from '../src/world/mat4.js';
import { patchSeams } from '../src/world/arch3dSeams.js';
import { isMain } from './lib/isMain.mjs';

export const isArchitecture = (id) => id >= 50000 && id < 99000;
export const SEAM_HAIR = 0.0002;
// The reach (2.4 units) sits off the unit grid so float32 rounding cannot change whether a 2-unit slit counts.
export const SEAM_REACH = 0.06;
const CELL = 1;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function faceOf(points, meta) {
  const n = [0, 0, 0];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const l = Math.hypot(n[0], n[1], n[2]);
  if (!(l > 1e-12)) return null;
  const u = [n[0] / l, n[1] / l, n[2] / l];
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of points) for (let k = 0; k < 3; k++) { if (p[k] < lo[k]) lo[k] = p[k]; if (p[k] > hi[k]) hi[k] = p[k]; }
  return { points, n: u, d: dot(u, points[0]), lo, hi, ...meta };
}

function distToTri(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  let q;
  if (d1 <= 0 && d2 <= 0) q = a;
  else {
    const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
    if (d3 >= 0 && d4 <= d3) q = b;
    else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); q = [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v]; }
      else {
        const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
        if (d6 >= 0 && d5 <= d6) q = c;
        else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); q = [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w]; }
          else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
              const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
              q = [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w];
            } else {
              const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
              q = [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
            }
          }
        }
      }
    }
  }
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
function distToFace(p, f) {
  const pts = f.points;
  let best = Infinity;
  for (let k = 1; k + 1 < pts.length; k++) {
    const d = distToTri(p, pts[0], pts[k + 1], pts[k]);
    if (d < best) best = d;
  }
  return best;
}

export function modelFaces(dfMesh) {
  const out = [];
  for (const sm of dfMesh.subMeshes) {
    for (const plane of sm.planes) {
      const pts = plane.points.map((p) => [p.x * GLOBAL_SCALE, -p.y * GLOBAL_SCALE, p.z * GLOBAL_SCALE]);
      out.push({ pts, df: plane.points.map((p) => [p.x, p.y, p.z]), texture: [sm.textureArchive, sm.textureRecord] });
    }
  }
  return out;
}

export function blockSeams(placements, meshOf) {
  const faces = [];
  placements.forEach((pl, pi) => {
    const mesh = meshOf(pl.modelIdNum);
    if (!mesh) return;
    modelFaces(mesh).forEach((mf, fi) => {
      const pts = mf.pts.map((p) => transformPoint(pl.matrix, p[0], p[1], p[2]));
      const f = faceOf(pts, { model: pl.modelIdNum, placement: pi, face: fi, df: mf.df });
      if (f) faces.push(f);
    });
  });
  const grid = new Map();
  const key = (x, y, z) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`;
  faces.forEach((f, i) => {
    for (let x = Math.floor((f.lo[0] - SEAM_REACH) / CELL); x <= Math.floor((f.hi[0] + SEAM_REACH) / CELL); x++)
      for (let y = Math.floor((f.lo[1] - SEAM_REACH) / CELL); y <= Math.floor((f.hi[1] + SEAM_REACH) / CELL); y++)
        for (let z = Math.floor((f.lo[2] - SEAM_REACH) / CELL); z <= Math.floor((f.hi[2] + SEAM_REACH) / CELL); z++) {
          const k = `${x},${y},${z}`;
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(i);
        }
  });
  const seams = [];
  let edges = 0;
  faces.forEach((f, i) => {
    const pts = f.points;
    for (let e = 0; e < pts.length; e++) {
      const a = pts[e], b = pts[(e + 1) % pts.length];
      if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) < 1e-4) continue;
      edges++;
      let worst = 0, partner = -1;
      for (const t of [0.25, 0.5, 0.75]) {
        const s = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        let best = Infinity, bestJ = -1;
        for (const j of grid.get(key(s[0], s[1], s[2])) ?? []) {
          if (j === i) continue;
          const g = faces[j];
          if (s[0] < g.lo[0] - SEAM_REACH || s[0] > g.hi[0] + SEAM_REACH || s[1] < g.lo[1] - SEAM_REACH || s[1] > g.hi[1] + SEAM_REACH || s[2] < g.lo[2] - SEAM_REACH || s[2] > g.hi[2] + SEAM_REACH) continue;
          const d = distToFace(s, g);
          if (d < best) { best = d; bestJ = j; }
          if (best <= SEAM_HAIR) break;
        }
        if (best > worst) { worst = best; partner = bestJ; }
      }
      if (worst > SEAM_HAIR && worst <= SEAM_REACH) {
        const p = faces[partner];
        seams.push({ model: f.model, placement: f.placement, face: f.face, edge: [f.df[e], f.df[(e + 1) % f.df.length]], gap: worst, partner: p?.model ?? null, samePlacement: p?.placement === f.placement });
      }
    }
  });
  return { seams, edges, faces: faces.length };
}

export function blockLandings(placements, meshOf, rawOf) {
  const faces = [];
  placements.forEach((pl, pi) => {
    const mesh = meshOf(pl.modelIdNum);
    if (!mesh) return;
    const raw = modelFaces(rawOf(pl.modelIdNum) ?? mesh);
    modelFaces(mesh).forEach((mf, fi) => {
      const pts = mf.pts.map((p) => transformPoint(pl.matrix, p[0], p[1], p[2]));
      const f = faceOf(pts, { model: pl.modelIdNum, placement: pi, face: fi, df: mf.df, rawDf: raw[fi]?.df ?? mf.df });
      if (f) faces.push(f);
    });
  });
  const out = [];
  placements.forEach((pl, pi) => {
    const mesh = meshOf(pl.modelIdNum), raw = rawOf(pl.modelIdNum);
    if (!mesh || !raw || mesh === raw) return;
    const seen = new Set();
    mesh.subMeshes.forEach((sm, si) => sm.planes.forEach((plane, qi) => plane.points.forEach((p, k) => {
      const r = raw.subMeshes[si].planes[qi].points[k];
      if (p.x === r.x && p.y === r.y && p.z === r.z) return;
      const key = `${r.x},${r.y},${r.z}`;
      if (seen.has(key)) return;
      seen.add(key);
      const at = transformPoint(pl.matrix, p.x * GLOBAL_SCALE, -p.y * GLOBAL_SCALE, p.z * GLOBAL_SCALE);
      let gap = Infinity;
      for (const g of faces) {
        if (g.placement === pi && g.rawDf.some((q) => q[0] === r.x && q[1] === r.y && q[2] === r.z)) continue;
        if (at[0] < g.lo[0] - SEAM_REACH || at[0] > g.hi[0] + SEAM_REACH || at[1] < g.lo[1] - SEAM_REACH || at[1] > g.hi[1] + SEAM_REACH || at[2] < g.lo[2] - SEAM_REACH || at[2] > g.hi[2] + SEAM_REACH) continue;
        const d = distToFace(at, g);
        if (d < gap) gap = d;
      }
      out.push({ model: pl.modelIdNum, placement: pi, from: [r.x, r.y, r.z], to: [p.x, p.y, p.z], gap });
    })));
  });
  return out;
}

export function census(arena2, { patched = false, onlyModel = null, all = false, landings = false } = {}) {
  const arch = new Arch3dFile();
  arch.load(new Uint8Array(readFileSync(join(arena2, 'ARCH3D.BSA'))));
  const blocks = new BlocksFile();
  blocks.load(new Uint8Array(readFileSync(join(arena2, 'BLOCKS.BSA'))));
  const meshes = new Map();
  const meshOf = (id) => {
    if (!meshes.has(id)) {
      const index = arch.getRecordIndex(id);
      const raw = index === -1 ? null : arch.getMesh(index);
      meshes.set(id, raw && patched ? patchSeams(id, raw) : raw);
    }
    return meshes.get(id);
  };
  const pre = new Map();
  const getModelPre = (id) => {
    if (!pre.has(id)) { const m = meshOf(id); pre.set(id, m ? dfMeshToModel(m, () => ({ width: 1, height: 1 })) : { positions: new Float32Array(0), indices: new Uint32Array(0), subMeshes: [], doors: [] }); }
    return pre.get(id);
  };
  const rawOf = (id) => { const index = arch.getRecordIndex(id); return index === -1 ? null : arch.getMesh(index); };
  const byModel = new Map();
  const landed = [];
  let blocksSeen = 0, edges = 0, total = 0;
  for (let b = 0; b < blocks.count; b++) {
    if (blocks.getBlockType(b) !== BLOCK_TYPES.Rdb) continue;
    const block = blocks.getBlock(b);
    if (!block?.rdbBlock) continue;
    // Exit doors stay out because only a dungeon's starting block places one, so their seams go uncounted.
    const lay = layoutRdbBlock(block, 0, false, getModelPre);
    const statics = lay.placements.filter((p) => !p.action);
    if (onlyModel != null && !statics.some((p) => p.modelIdNum === onlyModel)) continue;
    blocksSeen++;
    if (landings) {
      for (const l of blockLandings(statics, meshOf, rawOf)) landed.push({ ...l, block: blocks.getBlockName(b) });
      continue;
    }
    const r = blockSeams(statics, meshOf);
    edges += r.edges;
    for (const s of r.seams) {
      if (!all && !(isArchitecture(s.model) && isArchitecture(s.partner))) continue;
      total++;
      const m = byModel.get(s.model) ?? { model: s.model, seams: 0, max: 0, blocks: new Set(), edges: new Map() };
      m.seams++; m.max = Math.max(m.max, s.gap); m.blocks.add(blocks.getBlockName(b));
      const ek = `${s.edge.map((p) => p.map((v) => +v.toFixed(3)).join(',')).join(' | ')}  ~ ${s.samePlacement ? 'itself' : s.partner}`;
      m.edges.set(ek, Math.max(m.edges.get(ek) ?? 0, s.gap));
      byModel.set(s.model, m);
    }
  }
  return { blocks: blocksSeen, edges, seams: total, byModel, landed };
}

if (isMain(import.meta.url)) {
  const arena2 = process.env.ARENA2_PATH;
  if (!arena2) { console.error('ARENA2_PATH, please'); process.exit(2); }
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
  const onlyModel = arg('--model') != null ? Number(arg('--model')) : null;
  const limit = Number(arg('--limit') ?? 40);
  const r = census(arena2, { patched: process.argv.includes('--patched'), onlyModel, all: process.argv.includes('--all') });
  console.log(`${r.blocks} blocks, ${r.edges} edges measured, ${r.seams} seams (${SEAM_HAIR * 1000} mm < gap <= ${SEAM_REACH * 100} cm)`);
  const rows = [...r.byModel.values()].filter((m) => onlyModel == null || m.model === onlyModel).sort((a, b) => b.seams * b.max - a.seams * a.max);
  for (const m of rows.slice(0, limit)) {
    console.log(`${m.model}\t${m.seams} seams in ${m.blocks.size} blocks\tmax ${(m.max * 1000).toFixed(1)} mm`);
    if (onlyModel != null) for (const [e, g] of [...m.edges].sort((x, y) => y[1] - x[1])) console.log(`    ${(g * 1000).toFixed(1)} mm  ${e}`);
  }
}
