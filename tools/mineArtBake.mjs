// BUNNYFALL (2026-11-26, caverns): THE MINES' OWN MODELS, BAKED FOR THE GAME - the owner's two glTF models (the mine's
// entrance, and a set of ores and crystals) turned once into what the renderer takes, so the game reads no glTF and
// decodes no picture at run time:
//
//   public/art/bunnyfall-mine/mine-art.json   the manifest: each model's runs in the bin, its sub-meshes and their
//                                             records, its box, the entrance's door, each texture's size
//   public/art/bunnyfall-mine/mine-art.bin    the runs: positions (int16 across the model's box), normals (int8, x127),
//                                             uvs (float32, textured models alone), indices (uint32), and every
//                                             texture's color32 bytes
//
// Read and baked through the World Builder's own law (src/poi/gltfImport.js readGltf, bakeGltf, poiMaterialOf;
// src/poi/poiRuntime.js poiPartModels, bakeAlbedo), so the models stand exactly as that editor would stand them. Each
// picture is shrunk to MINE_ART_TEXELS on a side (a box filter): Daggerfall's own pictures are 64 texels. Untextured
// materials get a 4 x 4 picture of their colour.
//
// Usage: node tools/mineArtBake.mjs <entrance.glb> <ores.glb>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readGltf, bakeGltf, poiMaterialOf } from '../src/poi/gltfImport.js';
import { poiPartModels, bakeAlbedo } from '../src/poi/poiRuntime.js';
import { readPng } from './pngIO.mjs';

const MINE_ART_TEXELS = 64;
const OUT = fileURLToPath(new URL('../public/art/bunnyfall-mine/', import.meta.url));
/** The entrance's door, in its own frame: the timber portal's mouth (its front face's middle, on the ground), and the
 *  way it opens (-x). Measured from the model: its Wood runs x -0.47..3.41, z 9.58..13.26, y from -0.05. */
const ENTRANCE_DOOR = Object.freeze({ at: [0, 0, 11.42], into: [1, 0, 0] });

const [entrancePath, oresPath] = process.argv.slice(2);
if (!entrancePath || !oresPath) { console.error('Usage: node tools/mineArtBake.mjs <entrance.glb> <ores.glb>'); process.exit(1); }

/** A picture shrunk to at most `n` texels on a side (a box filter), RGBA, top row first. */
function shrink(img, n) {
  const s = Math.max(1, Math.ceil(Math.max(img.width, img.height) / n));
  const w = Math.max(1, Math.floor(img.width / s)), h = Math.max(1, Math.floor(img.height / s));
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const acc = [0, 0, 0, 0];
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) { const i = ((y * s + dy) * img.width + x * s + dx) * 4; for (let k = 0; k < 4; k++) acc[k] += img.data[i + k]; }
    for (let k = 0; k < 4; k++) out[(y * w + x) * 4 + k] = Math.round(acc[k] / (s * s));
  }
  return { width: w, height: h, data: out };
}

const runs = [];   // the bin's runs, in order
let offset = 0;
const put = (/** @type {ArrayBufferView} */ view) => { const at = offset; const b = Buffer.from(view.buffer, view.byteOffset, view.byteLength); runs.push(b); offset += b.length; const pad = (4 - (offset % 4)) % 4; if (pad) { runs.push(Buffer.alloc(pad)); offset += pad; } return { at, bytes: b.length }; };

const textures = [];   // { record, width, height, at, bytes }
/** A material's picture baked into the bin; answers its record. */
function textureOf(model, mat) {
  const raw = mat.texture !== null && mat.texture !== undefined ? model.images[mat.texture] : null;
  let img = null;
  if (raw && raw.mime === 'image/png') { const p = readPng(raw.bytes); img = shrink({ width: p.width, height: p.height, data: p.data }, MINE_ART_TEXELS); }
  const albedo = bakeAlbedo(img ?? { width: 4, height: 4, data: new Uint8Array(64).fill(255) }, mat);
  const record = textures.length;
  textures.push({ record, width: albedo.width, height: albedo.height, ...put(albedo.colors) });
  return record;
}

/** Positions as int16 across `box` ([minx, miny, minz, maxx, maxy, maxz]): q = (p - min) / (max - min) x 65535 - 32768. */
function quantize(p, box) {
  const q = new Int16Array(p.length);
  for (let i = 0; i < p.length; i++) { const k = i % 3, span = box[k + 3] - box[k] || 1; q[i] = Math.round(((p[i] - box[k]) / span) * 65535) - 32768; }
  return q;
}
/** A baked part as a model in the bin: its runs and its sub-meshes, each a record. */
function modelOf(model, part) {
  // every material drawn opaque: a crystal's glass would ask a translucent pass of its own, and opaque reads as Daggerfall's
  const mats = part.materials.map((i) => ({ ...poiMaterialOf(i >= 0 ? model.materials[i] : null), alpha: 'opaque', twoSided: false }));
  const records = mats.map((m) => textureOf(model, m));
  const textured = mats.some((m) => m.texture !== null && m.texture !== undefined);
  const { opaque } = poiPartModels(part.mesh, mats, (m) => records[mats.indexOf(m)]);
  if (!opaque) throw new Error(`${part.name}: no opaque model`);
  const normals = new Int8Array(opaque.normals.length);
  for (let i = 0; i < normals.length; i++) normals[i] = Math.round(Math.max(-1, Math.min(1, opaque.normals[i])) * 127);
  const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < opaque.positions.length; i += 3) for (let k = 0; k < 3; k++) { box[k] = Math.min(box[k], opaque.positions[i + k]); box[k + 3] = Math.max(box[k + 3], opaque.positions[i + k]); }
  return {
    name: part.name, vertices: opaque.positions.length / 3, indices: opaque.indices.length, box: box.map((v) => Math.round(v * 1000) / 1000),
    // positions as 16 bits across the box (a millimetre on a 13 m model), normals as 8; an untextured model keeps no uvs
    positions: put(quantize(opaque.positions, box)), normals: put(normals), uvs: textured ? put(new Float32Array(opaque.uvs)) : null, index: put(new Uint32Array(opaque.indices)),
    subMeshes: opaque.subMeshes.map((s) => ({ record: s.textureRecord, start: s.startIndex, count: s.primitiveCount })),
  };
}

const entranceModel = readGltf(new Uint8Array(readFileSync(entrancePath)));
const [entrancePart] = bakeGltf(entranceModel, { split: 'whole' });
const entrance = { ...modelOf(entranceModel, entrancePart), door: ENTRANCE_DOOR };

const oresModel = readGltf(new Uint8Array(readFileSync(oresPath)));
const ores = bakeGltf(oresModel, { split: 'nodes' }).filter((p) => p.mesh).map((p) => modelOf(oresModel, p));

mkdirSync(OUT, { recursive: true });
const manifest = { version: 1, texels: MINE_ART_TEXELS, entrance, ores, textures };
writeFileSync(OUT + 'mine-art.json', JSON.stringify(manifest));
writeFileSync(OUT + 'mine-art.bin', Buffer.concat(runs));
console.log(`entrance ${entrance.vertices} vertices, ${entrance.indices / 3} triangles; ${ores.length} ores; ${textures.length} textures; bin ${offset} bytes -> ${OUT}`);
