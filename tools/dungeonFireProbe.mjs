#!/usr/bin/env node
// Prints the campfire placements of a dungeon from the real game files, using the host models and collider.
// Run: ARENA2_PATH=/path/to/arena2 node tools/dungeonFireProbe.mjs <region> <dungeon> | --all.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMain } from './lib/isMain.mjs';
import { loadData, RECORD_DUNGEONS } from './climbDungeonProbe.mjs';
import { layoutDungeon } from '../src/world/dungeonLayout.js';
import { Collider } from '../src/player/collider.js';
import { trs, multiply } from '../src/world/mat4.js';
import { classifyPlacementAction } from '../src/world/actionSystem.js';
import { TextureFile, texName } from '../src/formats/textureFile.js';
import { classicBillboardSize } from '../src/world/rmbFlats.js';
import { dfMeshToModel } from '../src/world/meshReader.js';
import { patchSeams } from '../src/world/arch3dSeams.js';
import { colliderFireProbe, dungeonFirePlan, layoutFireCount, isBorderBlock, fireLayoutInputs } from '../src/world/dungeonFires.js';
import { isHearthFlat } from '../src/systems/survival/hearth.js';

export function hostModelReader(arch) {
  const cache = new Map();
  return (id) => {
    if (!cache.has(id)) {
      const index = arch.getRecordIndex(id);
      cache.set(id, index === -1 ? null : dfMeshToModel(patchSeams(id, arch.getMesh(index)), () => ({ width: 1, height: 1 })));
    }
    return cache.get(id);
  };
}

export function hostFireCollider(blocks, getModel) {
  const col = new Collider(() => -Infinity);
  let loose = 0;
  (blocks ?? []).forEach((b, bi) => {
    const om = trs(b.originX, 0, b.originZ, 0, 0, 0);
    for (const p of b.layout.placements ?? []) {
      const m = getModel(p.modelIdNum);
      if (!m) continue;
      const cls = p.action ? classifyPlacementAction(p.action.actionFlag, false) : null;
      col.addMesh(cls === 'move' || cls === 'specialDoor' ? `act:${bi}:${p.position}` : 'dungeon', m.positions, m.indices, multiply(om, p.matrix));
    }
    for (const d of b.layout.actionDoors ?? []) {
      if (d.disabled) continue;
      const m = getModel(d.modelIdNum);
      if (!m) continue;
      col.addMesh(d.position != null ? `act:${bi}:${d.position}` : `door:${loose++}`, m.positions, m.indices, multiply(om, d.matrix));
    }
  });
  return col;
}

export function layoutHearths(blocks, sizeOf = () => null) {
  return (blocks ?? []).flatMap((b) => (b.layout.flats ?? []).filter((f) => isHearthFlat(f.archive, f.record)).map((f) => {
    const size = sizeOf(f.archive, f.record);
    return { x: f.x + b.originX, y: f.y, z: f.z + b.originZ, foot: size ? f.y - size.h / 2 : undefined, w: size?.w, h: size?.h };
  }));
}

export function probeFires(col, blocks, { elite = false, seed = 0, sizeOf } = {}) {
  const probe = colliderFireProbe(col);
  const { doors, existing } = fireLayoutInputs(blocks, layoutHearths(blocks, sizeOf));
  const plan = dungeonFirePlan({ blocks, probe, doors, existing, seed, elite });
  const inner = blocks.filter((b) => !isBorderBlock(b.name)).length;
  return { inner, candidates: plan.candidates, valid: plan.valid, braziers: existing.length, wanted: layoutFireCount(blocks, elite), fires: plan.fires, doorFire: plan.doorFire };
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const all = argv.includes('--all');
  const arena2 = process.env.ARENA2_PATH;
  if (!arena2) { console.error('ARENA2_PATH is not set'); process.exit(2); }
  const data = loadData(arena2);
  const getModel = hostModelReader(data.arch);
  const textures = new Map();
  const sizeOf = (archive, record) => {
    if (!textures.has(archive)) {
      const t = new TextureFile();
      let ok = false;
      try { ok = t.load(new Uint8Array(readFileSync(join(arena2, texName(archive)))), texName(archive)); } catch { ok = false; }
      textures.set(archive, ok ? t : null);
    }
    const t = textures.get(archive);
    // The fire height uses the classic record's size, never a texture mod's, as the host does.
    return t && record < t.recordCount ? classicBillboardSize(t, record) : null;
  };
  const list = all ? RECORD_DUNGEONS : [[argv[0], argv[1]]];
  let short = 0;
  for (const [region, name] of list) {
    const loc = data.maps.getLocationByName(region, name);
    const { blocks } = layoutDungeon(loc, data.blocks, getModel);
    const col = hostFireCollider(blocks, getModel);
    const r = probeFires(col, blocks, { seed: loc?.dungeon?.recordElement?.header?.locationId ?? 0, sizeOf });
    const stood = r.fires.length + (r.doorFire ? 1 : 0);
    if (stood < r.wanted) short++;
    console.log(`${region} / ${name}: blocks ${r.inner}, candidates ${r.candidates}, valid ${r.valid}, braziers ${r.braziers}, fires ${r.fires.length}${r.doorFire ? ' and the door\'s brazier' : ''} of ${r.wanted}${stood < r.wanted ? ' (short)' : ''}`);
    if (r.doorFire) console.log(`  [${r.doorFire.map((v) => v.toFixed(1)).join(', ')}] the layout's, the entrance's`);
    for (const p of r.fires) console.log(`  [${p.map((v) => v.toFixed(1)).join(', ')}]`);
  }
  if (list.length > 1) console.log(`${list.length} dungeons, ${short} short of the count`);
}
