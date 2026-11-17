import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildingRuinPlan, ruinBuildingMesh } from '../src/systems/wild/cromwarkRuins.js';
import { burnTilemap, treeStandsDead, wasteGroundCoverStands, DEAD_TREE_RECORDS, deadTreeOf } from '../src/systems/wild/cromwarkWaste.js';
import { presetForExterior } from '../src/systems/ambientEffects.js';
import { wildVoicesFor, WILD } from '../src/systems/soundscape/worldAir.js';
import { Collider } from '../src/player/collider.js';
import { MapsFile } from '../src/formats/mapsFile.js';
import { BlocksFile } from '../src/formats/blocksFile.js';
import { Arch3dFile } from '../src/formats/arch3dFile.js';
import { dfMeshToModel } from '../src/world/meshReader.js';
import { layoutLocation } from '../src/world/locationLayout.js';

function house() {
  const p = [], n = [], uv = [], indices = [];
  const q = (vs, normal) => {
    const base = p.length / 3;
    for (let i = 0; i < 4; i++) { p.push(...vs[i]); n.push(...normal); uv.push(i & 1, i >> 1); }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  q([[-6, 0, -5], [-6, 10, -5], [6, 10, -5], [6, 0, -5]], [0, 0, -1]);
  q([[6, 0, 5], [6, 10, 5], [-6, 10, 5], [-6, 0, 5]], [0, 0, 1]);
  q([[-6, 0, 5], [-6, 10, 5], [-6, 10, -5], [-6, 0, -5]], [-1, 0, 0]);
  q([[6, 0, -5], [6, 10, -5], [6, 10, 5], [6, 0, 5]], [1, 0, 0]);
  q([[-6, 10, -5], [-6, 10, 5], [6, 10, 5], [6, 10, -5]], [0, 1, 0]);
  q([[-6, 0, 5], [-6, 0, -5], [6, 0, -5], [6, 0, 5]], [0, 1, 0]);
  const startIndex = indices.length;
  q([[-1, 0, -5.01], [-1, 2.2, -5.01], [1, 2.2, -5.01], [1, 0, -5.01]], [0, 0, -1]);
  return { positions: Float32Array.from(p), normals: Float32Array.from(n), uvs: Float32Array.from(uv), indices: Uint32Array.from(indices),
    subMeshes: [{ textureArchive: 12, textureRecord: 3, startIndex: 0, primitiveCount: startIndex / 3 }, { textureArchive: 74, textureRecord: 0, startIndex, primitiveCount: 2 }],
    doors: [{ type: 1, vert0: { x: -1, y: 0, z: -5.01 }, vert1: { x: -1, y: 2.2, z: -5.01 }, vert2: { x: 1, y: 2.2, z: -5.01 } }] };
}
const plan = { severity: 'collapsed', angle: .5, seed: 1234 };
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const validate = (m) => {
  assert.ok(m.positions.length > 0); assert.ok(m.positions.every(Number.isFinite));
  assert.equal(m.positions.length, m.normals.length); assert.equal(m.uvs.length / 2, m.positions.length / 3);
  assert.ok(m.normals.every(Number.isFinite)); assert.ok(m.uvs.every(Number.isFinite));
  assert.ok(m.indices.every((i) => i < m.positions.length / 3));
  assert.equal(m.subMeshes.reduce((s, g) => s + g.primitiveCount * 3, 0), m.indices.length);
};

test('building damage is stable by placed building, increases inward and leaves the rest of the world alone', () => {
  assert.equal(buildingRuinPlan(0, 1, 2, 3, 4), null);
  assert.deepEqual(buildingRuinPlan(4, 505449455, 2, 3, 4), buildingRuinPlan(4, 505449455, 2, 3, 4));
  let edge = 0, heart = 0;
  for (let i = 0; i < 1000; i++) { if (buildingRuinPlan(1, 1, 0, 0, i)) edge++; if (buildingRuinPlan(4, 1, 0, 0, i)) heart++; }
  assert.ok(heart > edge && heart > 800 && heart < 970);
});
test('ruin generation preserves source geometry, materials and entrances without shared-mesh mutation', () => {
  const source = house(), before = structuredClone(source), ruined = ruinBuildingMesh(source, plan);
  validate(ruined); assert.deepEqual(source, before);
  assert.deepEqual(ruined, ruinBuildingMesh(source, plan)); assert.equal(ruined.doors, source.doors);
  assert.ok(ruined.subMeshes.every((g) => source.subMeshes.some((s) => s.textureArchive === g.textureArchive && s.textureRecord === g.textureRecord)));
  assert.equal(ruined.subMeshes.find((s) => s.textureArchive === 74).primitiveCount, 2);
  assert.equal(ruinBuildingMesh(source, null), null);
});
test('rendered roof removal is also removed from the actual collision mesh', () => {
  const source = house(), ruined = ruinBuildingMesh(source, plan);
  const intact = new Collider(), damaged = new Collider();
  intact.addMesh('house', source.positions, source.indices, identity);
  damaged.addMesh('house', ruined.positions, ruined.indices, identity);
  const a = intact.raycast([0, 20, 0], [0, -1, 0], 30), b = damaged.raycast([0, 20, 0], [0, -1, 0], 30);
  assert.ok(Math.abs(a - 10) < .01); assert.ok(b > 16, `ruined roof still collides at ${b}`);
});
test('dungeon entrances and small props are protected', () => {
  const source = house(); source.doors[0].type = 2;
  assert.equal(ruinBuildingMesh(source, plan), null);
  const small = house(); small.positions = small.positions.map((v) => v * .1);
  assert.equal(ruinBuildingMesh(small, plan), null);
});
test('ground cover scars meet at pixel borders and become sparser toward the heart', () => {
  for (let z = 0; z <= 819.2; z += 6.4) {
    assert.equal(wasteGroundCoverStands(4, 823, 35, 819.2, z), wasteGroundCoverStands(4, 824, 35, 0, z));
  }
  let edge = 0, heart = 0;
  for (let x = 0; x < 128; x++) for (let z = 0; z < 128; z++) {
    if (wasteGroundCoverStands(1, 823, 35, x * 6.4, z * 6.4)) edge++;
    if (wasteGroundCoverStands(4, 823, 35, x * 6.4, z * 6.4)) heart++;
    assert.equal(wasteGroundCoverStands(0, 823, 35, x, z), true);
  }
  assert.ok(heart < edge * .4);
});
test('scars do not replace water or roads; dead trees follow stable world positions', () => {
  const tiles = Uint8Array.of(0, 4, 8, 12, 20, 255), before = tiles.slice();
  burnTilemap(tiles, 823, 35, 4, 2);
  for (let i = 0; i < tiles.length; i++) if (before[i] >> 2 !== 2) assert.equal(tiles[i], before[i]);
  assert.equal(treeStandsDead(0, 123, 456), false); assert.equal(treeStandsDead(4, 123, 456), true);
  assert.equal(DEAD_TREE_RECORDS.includes(13), false); assert.equal(DEAD_TREE_RECORDS.includes(15), false);
  for (let i = 0; i < 100; i++) assert.ok(DEAD_TREE_RECORDS.includes(deadTreeOf(i * 23, i * 41).record));
});
test('the desolate ambience removes healthy wildlife while preserving rain and storms', () => {
  assert.equal(presetForExterior('clear', false, true), 'none');
  assert.equal(presetForExterior('clear', true, true), 'none');
  assert.equal(presetForExterior('clear', false), 'sunnyDay');
  assert.equal(presetForExterior('clear', true), 'clearNight');
  assert.equal(presetForExterior('rain', false, true), 'rain');
  assert.equal(presetForExterior('thunder', true, true), 'storm');
  let healthy = 0;
  for (const c of Object.keys(WILD).map(Number)) for (const night of [false, true]) {
    const normal = { night, weather: 'clear', winter: false, inTown: false };
    healthy += wildVoicesFor(c, normal).length;
    assert.deepEqual(wildVoicesFor(c, { ...normal, desolate: true }), []);
  }
  assert.ok(healthy > 0);
});
test('real Cromwark buildings retain classic textures and doors while acquiring varied ruins', { skip: !process.env.ARENA2_PATH }, () => {
  const bytes = (n) => new Uint8Array(readFileSync(resolve(process.env.ARENA2_PATH, n)));
  const maps = new MapsFile(); maps.load(...['MAPS.BSA', 'CLIMATE.PAK', 'POLITIC.PAK'].map(bytes));
  const blocks = new BlocksFile(); blocks.load(bytes('BLOCKS.BSA'));
  const arch = new Arch3dFile(); arch.load(bytes('ARCH3D.BSA'));
  const location = maps.getLocationByName('Wrothgarian Mountains', 'Cromwark Hamlet');
  const layout = layoutLocation(location, maps, blocks, { enhanced: false, windmills: false });
  let changed = 0, eligible = 0; const kinds = new Set();
  for (const b of layout.blocks) for (const m of b.layout.models) {
    if (m.recordIndex == null) continue;
    const i = arch.getRecordIndex(m.modelIdNum); if (i < 0) continue;
    const source = dfMeshToModel(arch.getMesh(i), () => ({ width: 64, height: 64 })), original = source.positions.slice();
    const out = ruinBuildingMesh(source, buildingRuinPlan(4, location.mapTableData.mapId, b.x, b.y, m.recordIndex)); eligible++;
    assert.deepEqual(source.positions, original);
    if (!out) continue; changed++; kinds.add(out.ruin); validate(out);
    assert.equal(out.doors, source.doors);
  }
  assert.ok(changed > eligible / 2); assert.equal(kinds.size, 3);
});
