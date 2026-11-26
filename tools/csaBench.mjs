// Times Come Sail Away's ship pool frame and draw for a row of ships, with stand-in renderers.
// Run: node tools/csaBench.mjs [ships=12] [frames=600] (BOB=1 rocks each hull; ANIM=1 runs the animators).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createComeSailAwayPool } from '../src/systems/naval/comeSailAwayPool.js';
import { Boat, boatAnimators } from '../src/systems/naval/comeSailAwayBoat.js';

const fileFetch = async (url) => {
  const bytes = readFileSync(fileURLToPath(url));
  return { ok: true, json: async () => JSON.parse(bytes.toString('utf8')), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) };
};
const renderer = {
  createMesh: (m) => ({ model: m, buffers: [{}, {}], bounds: [0, 0, 0, 0], subMeshes: m.subMeshes.map((s) => ({ ...s, _bounds: [0, 0, 0, 0] })) }),
  drawMesh() {}, updateMeshVertices() {}, createBillboardBatch: (a, rec, size) => ({ a, rec, size }), destroyBillboardBatch() {}, destroyMesh() {},
};
const texture = () => ({ recordCount: 100, getSize: () => ({ width: 40, height: 64 }), getScale: () => ({ width: 0, height: 0 }) });
const pipeline = { textureFiles: new Map(), cpuModels: new Map(), gpuMeshes: new Map(), getTexture: async () => texture(), uploadRecord() {}, getGpuMesh: async (id) => ({ classic: id }) };

const SHIPS = Number(process.argv[2] || 12);
const FRAMES = Number(process.argv[3] || 600);
const pool = createComeSailAwayPool({ renderer, pipeline, fetchFn: fileFetch, log: { warn() {} } });
await pool.preload();
for (let i = 0; i < SHIPS; i++) { const b = pool.spawnSeaNow(new Boat(i % 5, 0)); b.GameObject.localPosition = [i * 30, 0, 0]; }
const world = { cityLightsOn: true, playerPosition: [0, 0, 0] };
for (let f = 0; f < 60; f++) { pool.frame(1 / 60, world); pool.draw(); }
await new Promise((res) => setTimeout(res, 50));
if (process.env.ANIM === '1') {
  const anims = pool.seaBoats.flatMap((b) => boatAnimators(b));
  for (let f = 0; f < 60; f++) for (const a of anims) a.update(1 / 60);
  const ta = performance.now();
  for (let f = 0; f < FRAMES; f++) for (const a of anims) a.update(1 / 60);
  console.log(`ships ${SHIPS} (${anims.length} animators): the animators' frame ${((performance.now() - ta) / FRAMES).toFixed(3)} ms`);
  process.exit(0);
}
const t0 = performance.now();
const BOB = process.env.BOB === '1';
const bob = (f) => { if (!BOB) return; for (const b of pool.seaBoats) if (b.MeshObject) { const a = Math.sin(f * 0.05) * 0.02, c = Math.cos(f * 0.07) * 0.03; b.MeshObject.localRotation = [Math.sin(a / 2), 0, Math.sin(c / 2), Math.cos(a / 2) * Math.cos(c / 2)]; } };
for (let f = 0; f < FRAMES; f++) { bob(f); pool.frame(1 / 60, world); pool.draw(); }
let objects = 0;
const count = (n) => { objects++; for (const c of n.children) count(c); };
for (const b of pool.seaBoats) count(b.GameObject);
console.log(`${BOB ? 'rocking ' : ''}ships ${SHIPS} (${objects} objects): the pool's frame ${((performance.now() - t0) / FRAMES).toFixed(3)} ms`);
