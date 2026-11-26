import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { unpackMineModel, loadMineArt, MINE_ART_ARCHIVE } from '../src/world/mine/mineArt.js';
import { PSEUDO_ARCHIVES } from '../src/world/eliteGates/pseudoArchives.js';

const manifest = JSON.parse(readFileSync(new URL('../public/art/bunnyfall-mine/mine-art.json', import.meta.url), 'utf8'));
const buf = readFileSync(new URL('../public/art/bunnyfall-mine/mine-art.bin', import.meta.url));
const bin = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

test('the baked entrance unpacks inside its box, its door on its front face, its sub-meshes covering its indices', () => {
  const { model, box } = unpackMineModel(manifest.entrance, bin);
  assert.equal(model.positions.length, manifest.entrance.vertices * 3);
  for (let i = 0; i < model.positions.length; i++) { const k = i % 3; assert.ok(model.positions[i] >= box[k] - 1e-3 && model.positions[i] <= box[k + 3] + 1e-3); }
  assert.equal(model.subMeshes.reduce((n, s) => n + s.primitiveCount * 3, 0), model.indices.length);
  assert.ok(model.indices.every((v) => v < manifest.entrance.vertices));
  assert.ok(model.subMeshes.every((s) => s.textureArchive === MINE_ART_ARCHIVE && s.textureRecord < manifest.textures.length));
  const d = manifest.entrance.door.at;
  assert.ok(d[0] >= box[0] - 1 && d[2] > box[2] && d[2] < box[5]);
});

test('every ore unpacks, and every texture fits the bin', () => {
  assert.equal(manifest.ores.length, 15);
  for (const o of manifest.ores) { const { model } = unpackMineModel(o, bin); assert.ok(model.indices.length > 0 && model.indices.every((v) => v < o.vertices)); }
  for (const t of manifest.textures) assert.equal(t.bytes, t.width * t.height * 4);
});

test('the loader uploads every texture under the registered archive and makes every mesh once', async () => {
  const uploads = [], meshes = [];
  const renderer = { uploadTexture: (a, r, p) => uploads.push([a, r, p.width]), createMesh: (m) => { meshes.push(m); return { id: meshes.length }; } };
  const art = await loadMineArt(renderer, { fetchBytes: async (f) => (f.endsWith('.json') ? new TextEncoder().encode(JSON.stringify(manifest)).buffer : bin) });
  assert.ok(art && art.entrance.gpu && art.ores.length === 15);
  assert.equal(uploads.length, manifest.textures.length);
  assert.ok(uploads.every(([a]) => a === MINE_ART_ARCHIVE));
  assert.equal(meshes.length, 16);
  assert.ok(PSEUDO_ARCHIVES.some((e) => e.archive === MINE_ART_ARCHIVE || e.from === MINE_ART_ARCHIVE || e.n === MINE_ART_ARCHIVE || JSON.stringify(e).includes('38341')));
});
