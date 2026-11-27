#!/usr/bin/env node
// Checks that the stand-in structures, hill pads, and door approaches in the town packs' blocks bury nothing.
// Usage: ARENA2_PATH=<dir> node tools/townSolidsSweep.mjs [BLOCK.RMB ...]
import { join } from 'node:path';
import { isMain } from './lib/isMain.mjs';
import { openTownData, VENDORS } from './townQuestMarkers.mjs';
import { layoutRmbBlock } from '../src/world/rmbLayout.js';
import { RMBRP_HILLS, RMBRP_DOCKS, blockHillSeat, blockHillPatch, drawnHillStandIn, doorApproach, doorApproachPoints, HILL_PATCH_SINK, CITY_WALL_PIECE } from '../src/world/townStandIns.js';
import { hasCustomModel } from '../src/world/customModels.js';
import { blockFromJson } from '../src/formats/worldDataReplacement.js';
import { curateBlockPlacements } from '../src/world/curatedPlacements.js';

// Two classic units (5 cm) plus 1 cm of slack, since the author's own models overlap by that much.
export const TOUCH_M = 0.06;
export const APPROACH_FOOT_M = 0.1;
export const APPROACH_HEAD_M = 1.7;
export const APPROACH_STEP_M = 0.25;
export const RMBRP_STRUCTURES = Object.freeze([53160, 53170, ...Object.keys(RMBRP_DOCKS).map(Number), 53143, 53144, 53182, 53187, 53194, CITY_WALL_PIECE]);

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const at = (M, x, y, z) => [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]];

export function placedSolid(mesh, M) {
  const p = mesh.positions, w = [];
  for (let i = 0; i < p.length; i += 3) w.push(at(M, p[i], p[i + 1], p[i + 2]));
  const tris = [];
  for (let t = 0; t + 2 < mesh.indices.length; t += 3) tris.push([w[mesh.indices[t]], w[mesh.indices[t + 1]], w[mesh.indices[t + 2]]]);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const v of w) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k]); hi[k] = Math.max(hi[k], v[k]); }
  return { tris, lo, hi };
}
function winding(s, q) {
  let w = 0;
  for (const [A, B, C] of s.tris) {
    const a = sub(A, q), b = sub(B, q), c = sub(C, q), la = len(a), lb = len(b), lc = len(c);
    w += 2 * Math.atan2(dot(a, cross(b, c)), la * lb * lc + dot(a, b) * lc + dot(a, c) * lb + dot(b, c) * la);
  }
  return w / (4 * Math.PI);
}
function distanceToTriangle(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return len(ap);
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return len(bp);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return len(sub(p, [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v])); }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return len(cp);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return len(sub(p, [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w])); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); return len(sub(p, [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w])); }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return len(sub(p, [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]));
}
export function depthInside(s, q) {
  if (q[0] < s.lo[0] || q[1] < s.lo[1] || q[2] < s.lo[2] || q[0] > s.hi[0] || q[1] > s.hi[1] || q[2] > s.hi[2]) return 0;
  if (Math.abs(winding(s, q)) < 0.5) return 0;
  let d = Infinity;
  for (const [a, b, c] of s.tris) d = Math.min(d, distanceToTriangle(q, a, b, c));
  return d;
}

export function approachPoints(a) {
  const pts = [];
  for (const [x, z, k] of doorApproachPoints(a, APPROACH_STEP_M)) {
    for (let h = APPROACH_FOOT_M; h <= APPROACH_HEAD_M + 1e-9; h += APPROACH_STEP_M * 2) pts.push({ k, p: [x, a.foot[1] + h, z] });
  }
  return pts;
}

/** @returns {{held: Array<{standIn:number, index:number, other:number, otherIndex:number, vertices:number, depth:number}>, pads: Array<{model:number, index:number, vertices:number, over:number}>, approach: Array<{model:number, index:number, door:number, by:string, k:number, over:number}>, padTriangles:number}} */
export function sweepBlock(models, getModel, { drawn = drawnHillStandIn, pads = true } = {}) {
  const placed = models.map((m, index) => ({ index, id: m.modelIdNum, M: m.matrix, mesh: getModel(m.modelIdNum) })).filter((p) => p.mesh?.positions?.length && !RMBRP_HILLS[p.id]);
  const solidOf = new Map();
  const solid = (p) => { if (!solidOf.has(p)) solidOf.set(p, placedSolid(p.mesh, p.M)); return solidOf.get(p); };
  const held = [];
  for (const s of placed.filter((p) => RMBRP_STRUCTURES.includes(p.id))) {
    for (const o of placed) {
      if (o === s) continue;
      let vertices = 0, depth = 0;
      const p = o.mesh.positions;
      for (let i = 0; i < p.length; i += 3) {
        const d = depthInside(solid(s), at(o.M, p[i], p[i + 1], p[i + 2]));
        if (d > TOUCH_M) { vertices++; depth = Math.max(depth, d); }
      }
      if (vertices) held.push({ standIn: s.id, index: s.index, other: o.id, otherIndex: o.index, vertices, depth: +depth.toFixed(2) });
    }
  }
  const hills = blockHillSeat(models, drawn), seat = blockHillSeat(models, drawn);
  const patch = pads && seat ? blockHillPatch(seat, models, (m) => getModel(m.modelIdNum), drawn) : null;
  const padTop = patch ? blockHillSeat([{ modelIdNum: 1, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }], () => patch) : null;
  const padFindings = [];
  if (padTop) {
    for (const o of placed) {
      let vertices = 0, over = 0;
      const p = o.mesh.positions;
      for (let i = 0; i < p.length; i += 3) {
        const [x, y, z] = at(o.M, p[i], p[i + 1], p[i + 2]);
        if (y <= Math.max(hills.topAt(x, z) ?? 0, 0) + HILL_PATCH_SINK) continue;
        const t = padTop.topAt(x, z);
        if (t !== null && t > y - HILL_PATCH_SINK + 1e-4) { vertices++; over = Math.max(over, t - y); }
      }
      if (vertices) padFindings.push({ model: o.id, index: o.index, vertices, over: +over.toFixed(2) });
    }
  }
  const standIns = placed.filter((p) => hasCustomModel(p.id));
  const approach = [];
  for (const o of placed) {
    for (const [door, d] of (o.mesh.doors ?? []).entries()) {
      const worst = new Map();
      const note = (key, k, over) => { const w = worst.get(key); worst.set(key, { by: key, k: Math.min(w?.k ?? Infinity, k), over: Math.max(w?.over ?? 0, over) }); };
      for (const { k, p } of approachPoints(doorApproach(d, o.M))) {
        for (const s of standIns) { const depth = depthInside(solid(s), p); if (depth > TOUCH_M) note(`${s.id}#${s.index}`, k, depth); }
        const hill = hills?.topAt(p[0], p[2]) ?? null, pad = padTop?.topAt(p[0], p[2]) ?? null;
        if (hill !== null && hill - p[1] > TOUCH_M) note('a hill', k, hill - p[1]);
        if (pad !== null && pad - p[1] > TOUCH_M) note('a pad', k, pad - p[1]);
      }
      for (const w of worst.values()) approach.push({ model: o.id, index: o.index, door, by: w.by, k: w.k, over: +w.over.toFixed(2) });
    }
  }
  return { held, pads: padFindings, approach, padTriangles: patch ? patch.indices.length / 3 : 0 };
}

export function eachPackBlock(data, each, only = null) {
  for (const [vendor] of VENDORS) {
    const p = data.packs[vendor];
    for (const file of p.names()) {
      if (!file.endsWith('.RMB.json')) continue;
      const name = file.slice(0, -5);
      if (only && !only.has(name)) continue;
      const dfBlock = blockFromJson(p.rebuild(file, data.maps), data.blocks.getBlockIndex(name), name);
      curateBlockPlacements(dfBlock, vendor);
      each(vendor, name, layoutRmbBlock(dfBlock, { enhanced: true }).models);
    }
  }
}

export function sweepTownPacks(data, { only = null } = {}) {
  const out = { blocks: 0, doors: 0, padded: 0, held: [], pads: [], approach: [] };
  eachPackBlock(data, (vendor, name, models) => {
    const r = sweepBlock(models, data.getModel);
    out.blocks++;
    if (r.padTriangles) out.padded++;
    for (const m of models) out.doors += data.getModel(m.modelIdNum)?.doors?.length ?? 0;
    for (const h of r.held) out.held.push(`${vendor} ${name}: ${h.standIn}#${h.index} holds ${h.other}#${h.otherIndex} (${h.vertices} vertices, ${h.depth} m in)`);
    for (const p of r.pads) out.pads.push(`${vendor} ${name}: a pad over ${p.model}#${p.index} (${p.vertices} vertices, ${p.over} m)`);
    for (const a of r.approach) out.approach.push(`${vendor} ${name}: door ${a.door} of ${a.model}#${a.index} - ${a.by} ${a.over} m into it, ${a.k} m out`);
  }, only);
  return out;
}

if (isMain(import.meta.url)) {
  const arena2 = process.env.ARENA2_PATH;
  if (!arena2) { console.error('ARENA2_PATH not set'); process.exit(2); }
  const quiet = console.log;
  console.log = () => {};
  const data = await openTownData(join(arena2));
  const only = process.argv.length > 2 ? new Set(process.argv.slice(2)) : null;
  const r = sweepTownPacks(data, { only });
  console.log = quiet;
  console.log(`${r.blocks} blocks, ${r.doors} doors, ${r.padded} padded`);
  for (const law of ['held', 'pads', 'approach']) {
    console.log(`${law.toUpperCase()} (${r[law].length}):`);
    for (const l of r[law]) console.log(`  ${l}`);
  }
}
