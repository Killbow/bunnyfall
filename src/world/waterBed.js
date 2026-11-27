// @ts-check
import { WATER_DRAW_MASK_TABLE, NO_BED_DEPTH, SHEET_NO_BED } from './waterCorners.js';
import { convertTile } from './terrainSurface.js';
import { tileDataAt, marchTile, sampleHeight } from './terrainTiles.js';
import { PUDDLE_RECORDS } from './puddleMask.js';

export const BED_DEPTH = 4.0;
export const BED_RAMP = 19.2;
export const TILE_UNITS = 6.4;
export { NO_BED_DEPTH, SHEET_NO_BED };

export const SHELF_CHAMFER = 4;

export const bedProfile = (t) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };

/**
 * @param {Uint8Array} bytes
 * @param {{stride?: number, tileDim?: number, width?: number, height?: number, table?: Uint8Array|number[], halo?: ?{tp: number, dim: number, bits: Uint8Array}}} [o]
 * @returns {Float32Array|null}
 */
export function waterBedDepths(bytes, o = {}) { return bedFields(bytes, o)?.depths ?? null; }

/**
 * @param {Uint8Array} bytes
 * @param {{stride?: number, tileDim?: number, width?: number, height?: number, table?: Uint8Array|number[], halo?: ?{tp: number, dim: number, bits: Uint8Array}}} [o]
 * @returns {Float32Array|null}
 */
export function waterBedCarve(bytes, o = {}) { return bedFields(bytes, o)?.carve ?? null; }

/**
 * @param {Uint8Array} bytes
 * @param {{stride?: number, tileDim?: number, width?: number, height?: number, table?: Uint8Array|number[], halo?: ?{tp: number, dim: number, bits: Uint8Array}}} [o]
 * @returns {{depths: Float32Array, carve: Float32Array}|null}
 */
export function bedFields(bytes, { stride = 1, tileDim = 128, width = tileDim, height = tileDim, table = WATER_DRAW_MASK_TABLE, halo = null } = {}) {
  if (halo && stride === 1) return haloBedDepths(bytes, tileDim, width, height, table, halo);
  const gx = width / stride + 1, gz = height / stride + 1;
  const n = gx * gz;
  const wet = new Uint8Array(n);
  let any = false;
  for (let vz = 0; vz < gz; vz++) {
    const cz = vz * stride, south = cz > 0, north = cz < height, rowS = (cz - 1) * tileDim, rowN = cz * tileDim;
    for (let vx = 0; vx < gx; vx++) {
      const cx = vx * stride, west = cx > 0, east = cx < width;
      if (south && west && !(table[bytes[rowS + cx - 1]] & 8)) continue;
      if (south && east && !(table[bytes[rowS + cx]] & 4)) continue;
      if (north && west && !(table[bytes[rowN + cx - 1]] & 2)) continue;
      if (north && east && !(table[bytes[rowN + cx]] & 1)) continue;
      if (!((south || north) && (west || east))) continue;
      wet[vz * gx + vx] = 1; any = true;
    }
  }
  if (!any) return null;
  const BIG = 1e9;
  const d = chamfer(wet, gx, gz);
  const unit = (stride * TILE_UNITS) / 3;
  const out = new Float32Array(n), carve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!wet[i]) continue;
    out[i] = BED_DEPTH * bedProfile(Math.min(d[i], BIG) * unit / BED_RAMP);
    carve[i] = carveAt(d[i], unit);
  }
  flushPuddles(carve, bytes, tileDim, width, height, stride, gx, gz, 0);
  return { depths: out, carve };
}

const carveAt = (d, unit) => BED_DEPTH * bedProfile(Math.min(d - SHELF_CHAMFER, 1e9) * unit / BED_RAMP);

function flushPuddles(carve, bytes, tileDim, width, height, stride, gx, gz, pad) {
  for (let tz = 0; tz < height; tz++) {
    for (let tx = 0; tx < width; tx++) {
      if (!PUDDLE_RECORDS.includes(bytes[tz * tileDim + tx] >> 2)) continue;
      const x0 = Math.floor(tx / stride) + pad, z0 = Math.floor(tz / stride) + pad;
      for (const [vx, vz] of [[x0, z0], [x0 + 1, z0], [x0, z0 + 1], [x0 + 1, z0 + 1]]) if (vx < gx && vz < gz) carve[vz * gx + vx] = 0;
    }
  }
}

export const BED_HALO_TILES = Math.ceil(BED_RAMP / TILE_UNITS) + 1;

/**
 * @param {(x: number, z: number) => number} ghost
 * @param {number} px
 * @param {number} py
 * @param {Uint8Array|number[]} [table]
 * @returns {{tp: number, dim: number, bits: Uint8Array}}
 */
export function bedHalo(ghost, px, py, table = WATER_DRAW_MASK_TABLE) {
  const tp = BED_HALO_TILES, side = 128, dim = side + 2 * tp;
  const bits = new Uint8Array(dim * dim);
  const memo = new Map();
  const corner = (x, z, dx, dz) => {
    const key = ((dx + 1) * 3 + (dz + 1)) * 1048576 + (x + 512) * 1024 + (z + 512);
    let v = memo.get(key);
    if (v === undefined) {
      v = tileDataAt(sampleHeight(Math.fround(ghost(x, z))), x - dx * side, z + dz * side, px + dx, py + dz);
      memo.set(key, v);
    }
    return v;
  };
  for (let tz = -tp; tz < side + tp; tz++) {
    const dz = tz < 0 ? 1 : tz >= side ? -1 : 0;
    for (let tx = -tp; tx < side + tp; tx++) {
      const dx = tx < 0 ? -1 : tx >= side ? 1 : 0;
      if (!dx && !dz) continue;
      const raw = marchTile(corner(tx, tz, dx, dz), corner(tx + 1, tz, dx, dz), corner(tx, tz + 1, dx, dz), corner(tx + 1, tz + 1, dx, dz));
      bits[(tz + tp) * dim + (tx + tp)] = table[convertTile(raw)];
    }
  }
  return { tp, dim, bits };
}

export function bedNearEdge(bytes, table = WATER_DRAW_MASK_TABLE, side = 128) {
  const reach = BED_HALO_TILES;
  for (let z = 0; z < side; z++) {
    const band = z < reach || z >= side - reach;
    for (let x = 0; x < side; x++) {
      if (!band && x === reach) x = side - reach;
      if (table[bytes[z * side + x]]) return true;
    }
  }
  return false;
}

function haloBedDepths(bytes, tileDim, width, height, table, halo) {
  const pad = halo.tp - 1, gx = width + 1, gz = height + 1, ex = gx + 2 * pad, ez = gz + 2 * pad;
  const bitsAt = (tx, tz) => (tx >= 0 && tz >= 0 && tx < width && tz < height
    ? table[bytes[tz * tileDim + tx]] : halo.bits[(tz + halo.tp) * halo.dim + (tx + halo.tp)]);
  const n = ex * ez;
  const wet = new Uint8Array(n);
  let any = false;
  for (let vz = 0; vz < ez; vz++) {
    const cz = vz - pad;
    for (let vx = 0; vx < ex; vx++) {
      const cx = vx - pad;
      if ((bitsAt(cx - 1, cz - 1) & 8) && (bitsAt(cx, cz - 1) & 4) && (bitsAt(cx - 1, cz) & 2) && (bitsAt(cx, cz) & 1)) {
        wet[vz * ex + vx] = 1;
        if (cx >= 0 && cz >= 0 && cx < gx && cz < gz) any = true;
      }
    }
  }
  if (!any) return null;
  const d = chamfer(wet, ex, ez);
  const unit = TILE_UNITS / 3;
  const out = new Float32Array(gx * gz), carve = new Float32Array(gx * gz);
  for (let z = 0; z < gz; z++) {
    for (let x = 0; x < gx; x++) {
      const i = (z + pad) * ex + (x + pad);
      if (!wet[i]) continue;
      out[z * gx + x] = BED_DEPTH * bedProfile(Math.min(d[i], 1e9) * unit / BED_RAMP);
      carve[z * gx + x] = carveAt(d[i], unit);
    }
  }
  flushPuddles(carve, bytes, tileDim, width, height, 1, gx, gz, 0);
  return { depths: out, carve };
}

function chamfer(wet, gx, gz) {
  const n = gx * gz, d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = wet[i] ? 1e9 : 0;
  for (let z = 0; z < gz; z++) {
    for (let x = 0; x < gx; x++) {
      const i = z * gx + x;
      if (!wet[i]) continue;
      let v = d[i];
      if (x > 0 && d[i - 1] + 3 < v) v = d[i - 1] + 3;
      if (z > 0) {
        if (d[i - gx] + 3 < v) v = d[i - gx] + 3;
        if (x > 0 && d[i - gx - 1] + 4 < v) v = d[i - gx - 1] + 4;
        if (x < gx - 1 && d[i - gx + 1] + 4 < v) v = d[i - gx + 1] + 4;
      }
      d[i] = v;
    }
  }
  for (let z = gz - 1; z >= 0; z--) {
    for (let x = gx - 1; x >= 0; x--) {
      const i = z * gx + x;
      if (!wet[i]) continue;
      let v = d[i];
      if (x < gx - 1 && d[i + 1] + 3 < v) v = d[i + 1] + 3;
      if (z < gz - 1) {
        if (d[i + gx] + 3 < v) v = d[i + gx] + 3;
        if (x < gx - 1 && d[i + gx + 1] + 4 < v) v = d[i + gx + 1] + 4;
        if (x > 0 && d[i + gx - 1] + 4 < v) v = d[i + gx - 1] + 4;
      }
      d[i] = v;
    }
  }
  return d;
}

/**
 * @param {Float32Array} positions
 * @param {Float32Array} normals
 * @param {Float32Array} depths
 * @param {number} gx
 * @param {number} gz
 * @returns {{positions: Float32Array, normals: Float32Array}}
 */
export function carveBed(positions, normals, depths, gx, gz) {
  const p = positions.slice(), nm = normals.slice();
  const g = gx * gz;
  for (let i = 0; i < g; i++) if (depths[i] > 0) p[i * 3 + 1] -= depths[i];
  if (positions.length > g * 3 && gx === gz) {
    const edges = [(i) => i, (i) => (gz - 1) * gx + i, (i) => i * gx, (i) => i * gx + (gx - 1)];
    let o = g;
    for (const edge of edges) for (let i = 0; i < gx; i++, o++) p[o * 3 + 1] -= depths[edge(i)];
  }
  const y = (x, z) => p[(Math.max(0, Math.min(gz - 1, z)) * gx + Math.max(0, Math.min(gx - 1, x))) * 3 + 1];
  const cellX = gx > 1 ? positions[3] - positions[0] : TILE_UNITS;
  const cellZ = gz > 1 ? positions[gx * 3 + 2] - positions[2] : TILE_UNITS;
  for (let z = 0; z < gz; z++) {
    for (let x = 0; x < gx; x++) {
      const i = z * gx + x;
      if (!(depths[i] > 0 || depths[z * gx + Math.max(0, x - 1)] > 0 || depths[z * gx + Math.min(gx - 1, x + 1)] > 0
        || depths[Math.max(0, z - 1) * gx + x] > 0 || depths[Math.min(gz - 1, z + 1) * gx + x] > 0)) continue;
      const nx = (y(x - 1, z) - y(x + 1, z)) / (2 * cellX), nz = (y(x, z - 1) - y(x, z + 1)) / (2 * cellZ);
      const l = Math.hypot(nx, 1, nz);
      nm[i * 3] = nx / l; nm[i * 3 + 1] = 1 / l; nm[i * 3 + 2] = nz / l;
    }
  }
  return { positions: p, normals: nm };
}

/**
 * @param {Float32Array} depths
 * @param {number} gx
 * @param {number} gz
 * @returns {Float32Array}
 */
export function sheetDepthsOf(depths, gx, gz) {
  const out = new Float32Array(depths.length);
  for (let z = 0; z < gz; z++) {
    for (let x = 0; x < gx; x++) {
      const i = z * gx + x;
      if (depths[i] > 0) { out[i] = depths[i]; continue; }
      let bank = false;
      for (let dz = -1; dz <= 1 && !bank; dz++) {
        const nz = z + dz;
        if (nz < 0 || nz >= gz) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < gx && depths[nz * gx + nx] > 0) { bank = true; break; }
        }
      }
      out[i] = bank ? 0 : SHEET_NO_BED;
    }
  }
  return out;
}

/**
 * @param {{positions: Float32Array, normals: Float32Array}} grid
 * @param {Uint8Array} bytes
 * @param {{stride?: number, tileDim?: number, width?: number, height?: number, halo?: ?{tp: number, dim: number, bits: Uint8Array}}} [o]
 */
export function waterBedOf(grid, bytes, o = {}) {
  const stride = o.stride ?? 1, tileDim = o.tileDim ?? 128;
  const width = o.width ?? tileDim, height = o.height ?? tileDim;
  const fields = bedFields(bytes, { stride, tileDim, width, height, halo: o.halo ?? null });
  if (!fields) return null;
  const gx = width / stride + 1, gz = height / stride + 1;
  const ground = carveBed(grid.positions, grid.normals, fields.carve, gx, gz);
  return { depths: fields.carve, sheetDepths: sheetDepthsOf(fields.depths, gx, gz), ground, sheet: grid.positions, gx, gz };
}

export function flatGrid(width, height, y, cell = TILE_UNITS) {
  const gx = width + 1, gz = height + 1;
  const positions = new Float32Array(gx * gz * 3), normals = new Float32Array(gx * gz * 3);
  for (let z = 0, o = 0; z < gz; z++) {
    for (let x = 0; x < gx; x++, o += 3) {
      positions[o] = x * cell; positions[o + 1] = y; positions[o + 2] = z * cell;
      normals[o + 1] = 1;
    }
  }
  const indices = new Uint32Array(width * height * 6);
  for (let z = 0, o = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const i0 = z * gx + x, i1 = i0 + 1, i2 = i0 + gx, i3 = i2 + 1;
      indices[o++] = i0; indices[o++] = i2; indices[o++] = i3;
      indices[o++] = i0; indices[o++] = i3; indices[o++] = i1;
    }
  }
  return { positions, normals, indices };
}
