#!/usr/bin/env node
// AI-ROOMS: the rooms through the GAME'S OWN dungeon layout, on the real game files. Registers the vendored blocks and
// models as the game does, then for real dungeons lays them out with `swapAiRooms` at a share of 1 (every ordinary
// block an AI room: the hardest case) and at the shipped share, and counts what comes out. Also counts, over every
// dungeon in MAPS.BSA, how many get at least one AI room. `ARENA2_PATH=<arena2> node tools/aiRoom/integrate.mjs`
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData, RECORD_DUNGEONS } from '../climbDungeonProbe.mjs';
import { layoutDungeon } from '../../src/world/dungeonLayout.js';
import { installWorldDataReplacement, registerPortBlock, bindWorldDataBlocks } from '../../src/formats/worldDataReplacement.js';
import { editorModelToModel, editorModelProblem } from '../../src/world/editorModels.js';
import { swapAiRooms, AI_ROOM_SHARE } from '../../src/world/aiRoomLaw.js';
import { isMainStoryDungeon } from '../../src/world/dungeonTextures.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'vendor', 'bunnyfall-ai-rooms');
const data = loadData(process.env.ARENA2_PATH);
installWorldDataReplacement(); bindWorldDataBlocks(data.blocks);
const list = JSON.parse(readFileSync(join(root, 'rooms.json'), 'utf8'));
for (const r of list) registerPortBlock(r.name, JSON.parse(readFileSync(join(root, 'Rooms', `${r.name}.json`), 'utf8')), r.index);
const custom = new Map();
for (const f of readdirSync(join(root, 'Models'))) { const j = JSON.parse(readFileSync(join(root, 'Models', f), 'utf8')); const p = editorModelProblem(j); if (p) throw new Error(`${f}: ${p}`); custom.set(j.id, editorModelToModel(j)); }
const getModel = (id) => custom.get(id) ?? data.getModel(id);
const rooms = list.map((r) => ({ name: r.name, kind: r.kind }));
let bad = 0;

// 1. real dungeons, every ordinary block an AI room
for (const [region, name] of RECORD_DUNGEONS.slice(0, 12)) {
  const loc = data.maps.getLocationByName(region, name);
  if (!loc?.hasDungeon || isMainStoryDungeon(loc.mapTableData.mapId)) continue;
  const { blocks, swapped } = swapAiRooms(loc.dungeon.blocks, rooms, loc.mapTableData.mapId, 1);
  const laid = layoutDungeon({ ...loc, dungeon: { ...loc.dungeon, blocks } }, data.blocks, getModel);
  const names = laid.blocks.map((b) => b.name), ai = names.filter((n) => /7\d{6}\.RDB$/.test(n)).length;
  const markers = laid.blocks.reduce((n, b) => n + b.layout.markers.length, 0), foes = laid.blocks.reduce((n, b) => n + b.layout.markers.filter((m) => m.flatRecord === 15 || m.record === 15).length, 0);
  console.log(`${region} / ${name}: ${blocks.length} blocks, ${swapped} swapped, ${laid.blocks.length} laid, ${ai} AI, start ${laid.startMarker ? 'ok' : 'MISSING'}, ${markers} markers`);
  if (!laid.startMarker || ai !== swapped) bad++;
}

// 2. the shipped share over every dungeon
let dungeons = 0, withAi = 0, ordinary = 0, swappedTotal = 0, main = 0;
for (let r = 0; r < 62; r++) {
  const region = data.maps.getRegion?.(r);
  const count = region?.locationCount ?? 0;
  for (let l = 0; l < count; l++) {
    const loc = data.maps.getLocation(r, l);
    if (!loc?.hasDungeon) continue;
    dungeons++;
    if (isMainStoryDungeon(loc.mapTableData.mapId)) { main++; continue; }
    const res = swapAiRooms(loc.dungeon.blocks, rooms, loc.mapTableData.mapId);
    ordinary += loc.dungeon.blocks.filter((b) => !b.isStartingBlock).length;
    if (res.swapped) withAi++;
    swappedTotal += res.swapped;
  }
}
console.log(`share ${AI_ROOM_SHARE}: ${dungeons} dungeons (${main} main story, untouched); ${withAi} of the rest get an AI room; ${swappedTotal} of ${ordinary} non-start blocks swapped (${((100 * swappedTotal) / ordinary).toFixed(1)}%)`);
process.exit(bad ? 1 : 0);
