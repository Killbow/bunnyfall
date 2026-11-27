// Crop fields follow RMBCropBillboardBatch. The grid lies in world axes around the batch and ignores its rotation,
// and plant offsets are seeded by position so a field is the same on every visit.

import { mulberry32 } from '../render/grassPixelArt.js';
import { CLIMATES } from '../formats/mapsTables.js';

const _fields = new Map();

export function registerFlatField(id, spec, isOn = () => true) { _fields.set(Number(id), { spec: Object.freeze({ ...spec }), isOn }); }
export function flatFieldFor(id) { const f = _fields.get(Number(id)); return f && f.isOn() ? f.spec : null; }
export function _resetFlatFields() { _fields.clear(); }

// Follows RMBCropBillboardBatch.AdjustRecordBasedOnClimate. Odd nature archives from 505 are winter sets, and
// `climateIndex` is the raw climate value because both deserts use nature archive 503.
export const CROP_ARCHIVE = 301;
export function cropRecordsFor(natureArchive, climateIndex = null) {
  if (natureArchive >= 505 && natureArchive % 2 === 1) return [511, [22]];
  if (climateIndex === CLIMATES.Desert2) return [CROP_ARCHIVE, [20]];
  switch (natureArchive) {
    case 510: return [CROP_ARCHIVE, [0, 1]];
    case 503: return [CROP_ARCHIVE, [2]];
    case 501: return [CROP_ARCHIVE, [3, 4]];
    case 500: case 502: return [CROP_ARCHIVE, [7, 8]];
    default: return [CROP_ARCHIVE, [19, 21]];
  }
}

export const CROP_OVERLAP_RADIUS = 1;

export function sowField(spec, natureArchive, x, y, z, { climateIndex = null, solid = null } = {}) {
  const [archive, all] = cropRecordsFor(natureArchive, climateIndex);
  const records = spec.firstRecordOnly && all.length > 1 ? all.slice(1) : all;
  const rnd = mulberry32(((Math.round(x * 40) * 73856093) ^ (Math.round(z * 40) * 19349663)) >>> 0);
  // Truncates like C# integer division, so an 85 m field runs from -42 to 42.
  const hx = Math.trunc(spec.rangeX / 2), hz = Math.trunc(spec.rangeZ / 2);
  const out = [];
  for (let u = -hx; u <= hx; u += spec.spacing) {
    for (let v = -hz; v <= hz; v += spec.spacing) {
      const px = x + u + (rnd() * 2 - 1) * spec.noise, pz = z + v + (rnd() * 2 - 1) * spec.noise;
      if (solid && solid(px, y, pz, CROP_OVERLAP_RADIUS)) continue;
      out.push({ archive, record: records[Math.floor(rnd() * records.length)], x: px, y, z: pz });
    }
  }
  return out;
}

function pointTriangleDist2(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  const at = (qx, qy, qz) => (px - qx) ** 2 + (py - qy) ** 2 + (pz - qz) ** 2;
  if (d1 <= 0 && d2 <= 0) return at(ax, ay, az);
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return at(bx, by, bz);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return at(ax + v * abx, ay + v * aby, az + v * abz); }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return at(cx, cy, cz);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return at(ax + w * acx, ay + w * acy, az + w * acz); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); return at(bx + w * (cx - bx), by + w * (cy - by), bz + w * (cz - bz)); }
  const denom = 1 / (va + vb + vc), v = vb * denom, w = vc * denom;
  return at(ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w);
}

/**
 * Matches a Unity mesh collider: only the surface counts, so a point deep inside a closed model and farther than
 * `r` from every face does not overlap.
 * @param {Iterable<{modelIdNum:number, matrix:ArrayLike<number>}>} models
 * @param {(placed:object) => ?{positions:ArrayLike<number>, indices:ArrayLike<number>}} meshOf
 * @returns {(x:number, y:number, z:number, r:number) => boolean}
 */
export function blockSolids(models, meshOf) {
  let solids = null;
  const lay = () => {
    solids = [];
    for (const placed of models ?? []) {
      const mesh = meshOf(placed);
      if (!mesh?.indices?.length) continue;
      const m = placed.matrix, p = mesh.positions, w = new Float64Array(p.length);
      const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (let i = 0; i < p.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          const v = m[k] * p[i] + m[4 + k] * p[i + 1] + m[8 + k] * p[i + 2] + m[12 + k];
          w[i + k] = v;
          if (v < box[k]) box[k] = v;
          if (v > box[3 + k]) box[3 + k] = v;
        }
      }
      const ix = mesh.indices, tris = new Float64Array((ix.length - (ix.length % 3)) * 3);
      for (let t = 0; t + 2 < ix.length; t += 3) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) tris[t * 3 + c * 3 + k] = w[ix[t + c] * 3 + k];
      solids.push({ box, tris });
    }
  };
  return (x, y, z, r) => {
    if (!solids) lay();
    const r2 = r * r;
    for (const { box, tris } of solids) {
      if (x < box[0] - r || x > box[3] + r || y < box[1] - r || y > box[4] + r || z < box[2] - r || z > box[5] + r) continue;
      for (let t = 0; t < tris.length; t += 9) {
        if (pointTriangleDist2(x, y, z, tris[t], tris[t + 1], tris[t + 2], tris[t + 3], tris[t + 4], tris[t + 5], tris[t + 6], tris[t + 7], tris[t + 8]) <= r2) return true;
      }
    }
    return false;
  };
}
