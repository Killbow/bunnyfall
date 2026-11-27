// AI-ROOMS: the node-side kit for reading Daggerfall's rooms (RDB blocks) out of the player's own ARENA2, laying one
// out, and drawing it top-down. Used by the room generator's checks and previews. Nothing here is shipped.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { Arch3dFile } from '../../src/formats/arch3dFile.js';
import { BlocksFile } from '../../src/formats/blocksFile.js';
import { blockToDfuJson } from '../../src/formats/worldDataJson.js';
import { blockFromJson } from '../../src/formats/worldDataReplacement.js';
import { layoutRdbBlock, RDB_SIDE } from '../../src/world/rdbLayout.js';
import { dfMeshToModel } from '../../src/world/meshReader.js';
import { editorModelToModel } from '../../src/world/editorModels.js';
import { transformPoint } from '../../src/world/mat4.js';

export { RDB_SIDE, blockFromJson };

/** @param {string} arena2 the folder holding ARCH3D.BSA and BLOCKS.BSA */
export function loadKit(arena2 = process.env.ARENA2_PATH) {
  if (!arena2) throw new Error('ARENA2_PATH, please');
  const arch = new Arch3dFile();
  arch.load(new Uint8Array(readFileSync(join(arena2, 'ARCH3D.BSA'))));
  const blocks = new BlocksFile();
  blocks.load(new Uint8Array(readFileSync(join(arena2, 'BLOCKS.BSA'))));
  const custom = new Map();   // id -> registry model, for the new pieces
  const cache = new Map();
  const empty = () => ({ positions: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0), subMeshes: [], doors: [] });
  const getModel = (id) => {
    if (custom.has(id)) return custom.get(id);
    if (!cache.has(id)) {
      const index = arch.getRecordIndex(id);
      const raw = index === -1 ? null : arch.getMesh(index);
      cache.set(id, raw ? dfMeshToModel(raw, () => ({ width: 64, height: 64 })) : null);
    }
    return cache.get(id) ?? empty();
  };
  return {
    arch, blocks, getModel,
    modelExists: (id) => custom.has(id) || arch.getRecordIndex(id) !== -1,
    addCustomModel(json) { custom.set(json.id, editorModelToModel(json)); },
    classicJson: (name) => blockToDfuJson(blocks.readClassicBlock(blocks.getBlockIndex(name))),
    classicNames: () => { const out = []; for (let i = 0; i < blocks.count; i++) { const n = blocks.getBlockName(i); if (n?.endsWith('.RDB')) out.push(n); } return out; },
    layoutJson(json, name = 'ZAI00000.RDB') { return layoutRdbBlock(blockFromJson(json, 900000, name), 900000, false, getModel); },
  };
}

// ---- a tiny PNG writer -------------------------------------------------------------------------------------------
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function writePng(path, width, height, rgba) {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1); }
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

/**
 * Top-down plan of a laid-out block: the highest upward-facing surface at each pixel, shaded by height, with walls
 * (vertical faces) drawn over it in black. `ppm` pixels per metre. Returns { width, height, rgba, floorAt }.
 */
export function planOf(layout, getModel, ppm = 10) {
  const size = Math.ceil(RDB_SIDE * ppm), top = new Float32Array(size * size).fill(-1e9), wall = new Uint8Array(size * size);
  const rgba = new Uint8Array(size * size * 4);
  for (const p of layout.placements) {
    const m = getModel(p.modelIdNum);
    if (!m?.indices?.length) continue;
    const pts = new Array(m.positions.length / 3);
    for (let i = 0; i < pts.length; i++) pts[i] = transformPoint(p.matrix, m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]);
    for (let t = 0; t < m.indices.length; t += 3) {
      const a = pts[m.indices[t]], b = pts[m.indices[t + 1]], c = pts[m.indices[t + 2]];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nl = Math.hypot(nx, ny, nz) || 1;
      const isWall = Math.abs(ny / nl) < 0.3;
      const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]) * ppm)), maxX = Math.min(size - 1, Math.ceil(Math.max(a[0], b[0], c[0]) * ppm));
      const minZ = Math.max(0, Math.floor(Math.min(a[2], b[2], c[2]) * ppm)), maxZ = Math.min(size - 1, Math.ceil(Math.max(a[2], b[2], c[2]) * ppm));
      if (isWall) {   // a wall's footprint: the segment, drawn thin
        const segs = [[a, b], [b, c], [c, a]];
        for (const [s, e] of segs) { const n = Math.ceil(Math.hypot(e[0] - s[0], e[2] - s[2]) * ppm * 2) + 1; for (let k = 0; k <= n; k++) { const f = k / n, x = Math.floor((s[0] + (e[0] - s[0]) * f) * ppm), z = Math.floor((s[2] + (e[2] - s[2]) * f) * ppm); if (x >= 0 && z >= 0 && x < size && z < size) wall[z * size + x] = 1; } }
        continue;
      }
      if (ny / nl < 0.3) continue;   // a ceiling
      const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
      if (Math.abs(d) < 1e-9) continue;
      for (let z = minZ; z <= maxZ; z++) for (let x = minX; x <= maxX; x++) {
        const px = (x + 0.5) / ppm, pz = (z + 0.5) / ppm;
        const l1 = ((b[2] - c[2]) * (px - c[0]) + (c[0] - b[0]) * (pz - c[2])) / d, l2 = ((c[2] - a[2]) * (px - c[0]) + (a[0] - c[0]) * (pz - c[2])) / d, l3 = 1 - l1 - l2;
        if (l1 < -0.001 || l2 < -0.001 || l3 < -0.001) continue;
        const y = l1 * a[1] + l2 * b[1] + l3 * c[1];
        if (y > top[z * size + x]) top[z * size + x] = y;
      }
    }
  }
  for (let i = 0; i < size * size; i++) {
    const o = i * 4;
    if (wall[i]) { rgba[o] = 20; rgba[o + 1] = 20; rgba[o + 2] = 30; rgba[o + 3] = 255; continue; }
    if (top[i] < -1e8) { rgba[o] = 235; rgba[o + 1] = 235; rgba[o + 2] = 235; rgba[o + 3] = 255; continue; }
    const g = Math.max(60, Math.min(220, 150 + top[i] * 12));
    rgba[o] = g * 0.6; rgba[o + 1] = g * 0.8; rgba[o + 2] = g; rgba[o + 3] = 255;
  }
  // the 4x4 cell grid and the block's edge, faint
  for (let k = 0; k <= 4; k++) { const p = Math.min(size - 1, Math.floor((k * size) / 4)); for (let q = 0; q < size; q++) { for (const i of [q * size + p, p * size + q]) { const o = i * 4; rgba[o] = 230; rgba[o + 1] = 60; rgba[o + 2] = 60; } } }
  return { width: size, height: size, rgba, top, wall, size, ppm };
}
