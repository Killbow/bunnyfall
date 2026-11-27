#!/usr/bin/env node
// AI-ROOMS: does swapping rooms in keep a dungeon connected? For every dungeon in MAPS.BSA, the blocks reachable from the
// starting block through shared doors, before and after the swap (the shipped share). Each block's ports (which of the
// 8 are open on which floor: A 32.0 or B 12.8) are measured once from its own laid-out floors. A block is entered at one
// floor and left at another only if it joins them: every classic block is taken to (an optimistic guess, the same for
// both layouts), a new room only if it has a stair (`stairs` below). `ARENA2_PATH=<arena2> node tools/aiRoom/connect.mjs`
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData } from '../climbDungeonProbe.mjs';
import { layoutDungeon } from '../../src/world/dungeonLayout.js';
import { layoutRdbBlock } from '../../src/world/rdbLayout.js';
import { Collider } from '../../src/player/collider.js';
import { installWorldDataReplacement, registerPortBlock, bindWorldDataBlocks } from '../../src/formats/worldDataReplacement.js';
import { editorModelToModel } from '../../src/world/editorModels.js';
import { swapAiRooms, portsOfBlock } from '../../src/world/aiRoomLaw.js';
import { isMainStoryDungeon } from '../../src/world/dungeonTextures.js';
import { PORTS } from './shell.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'vendor', 'bunnyfall-ai-rooms');
const data = loadData(process.env.ARENA2_PATH);
installWorldDataReplacement(); bindWorldDataBlocks(data.blocks);
const list = JSON.parse(readFileSync(join(root, 'rooms.json'), 'utf8'));
for (const r of list) registerPortBlock(r.name, JSON.parse(readFileSync(join(root, 'Rooms', `${r.name}.json`), 'utf8')), r.index);
const custom = new Map();
for (const f of readdirSync(join(root, 'Models'))) { const j = JSON.parse(readFileSync(join(root, 'Models', f), 'utf8')); custom.set(j.id, editorModelToModel(j)); }
const getModel = (id) => custom.get(id) ?? data.getModel(id);
const rooms = list.map((r) => ({ name: r.name, kind: r.kind }));
// what the game's law sees: a room's doors from the list, a classic block's from its own door objects (portsOfBlock)
const lawRoom = new Map(list.map((r) => [r.name, { ports: new Set(r.ports.map((p) => `${p[0]}:${p[1]}`)), joins: r.joins }]));
const lawCache = new Map();
const lawPorts = (name) => { if (lawRoom.has(name)) return lawRoom.get(name).ports; if (!lawCache.has(name)) lawCache.set(name, portsOfBlock(data.blocks.getBlock(data.blocks.getBlockIndex(name)))); return lawCache.get(name); };
const lawJoins = (name) => lawRoom.get(name)?.joins ?? true;
const stairs = new Set(list.filter((r) => /Stair/.test(r.title)).map((r) => r.name));
const isAi = (n) => /7\d{6}\.RDB$/.test(n);
const LEVELS = { A: PORTS.A.floor, B: PORTS.B.floor };

const portCache = new Map();
/** { 'N:A': true, ... } for a block laid on its own. */
function portsOf(name) {
  if (portCache.has(name)) return portCache.get(name);
  const index = data.blocks.getBlockIndex(name), blk = data.blocks.getBlock(index);
  const lay = layoutRdbBlock(blk, index, false, getModel), col = new Collider(() => -Infinity);
  for (const p of lay.placements) { const m = getModel(p.modelIdNum); if (m?.indices?.length) col.addMesh('dungeon', m.positions, m.indices, p.matrix); }
  const has = (x, z) => { let y = 60; for (let n = 0; n < 10 && y > -20; n++) { const h = col.surfaceHit([x, y, z], [0, -1, 0], y + 20); if (!Number.isFinite(h.dist)) return []; const fy = y - h.dist; if (h.normal?.[1] > 0.7) { for (const [k, v] of Object.entries(LEVELS)) if (Math.abs(fy - v) < 0.15) return [k]; } y = fy - 0.05; } return []; };
  const out = {};
  for (const [k, port] of Object.entries(PORTS)) {
    const at = port.at, near = 1.0, far = 50.2;
    for (const [e, x, z] of [['N', at, near], ['S', at, far], ['W', near, at], ['E', far, at]]) if (has(x, z).includes(k)) out[`${e}:${k}`] = true;
  }
  portCache.set(name, out); return out;
}
const OPP = { N: 'S', S: 'N', W: 'E', E: 'W' }, STEP = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
/** Block names reachable from the starting block over the shared ports. */
function reach(blocks) {
  const at = new Map(blocks.map((b) => [`${b.x},${b.z}`, b])), start = blocks.find((b) => b.isStartingBlock) ?? blocks[0];
  const seen = new Set(), queue = [];
  const push = (b, L) => { const k = `${b.x},${b.z}:${L}`; if (!seen.has(k)) { seen.add(k); queue.push([b, L]); } };
  push(start, 'A'); push(start, 'B');
  while (queue.length) {
    const [b, L] = queue.pop(), ports = portsOf(b.blockName);
    if (!isAi(b.blockName) || stairs.has(b.blockName)) push(b, L === 'A' ? 'B' : 'A');   // the block joins its floors
    for (const e of 'NSWE') {
      if (!ports[`${e}:${L}`]) continue;
      const nb = at.get(`${b.x + STEP[e][0]},${b.z + STEP[e][1]}`);
      if (nb && portsOf(nb.blockName)[`${OPP[e]}:${L}`]) push(nb, L);
    }
  }
  return new Set([...seen].map((k) => k.split(':')[0]));
}
let baseUnreached = 0, baseBlocks = 0;
let dungeons = 0, hurt = 0, blocksLost = 0, strandedAi = 0, aiBlocks = 0, aiTotal = 0;
const worst = [];
for (let r = 0; r < 62; r++) {
  const region = data.maps.getRegion?.(r), count = region?.locationCount ?? 0;
  for (let l = 0; l < count; l++) {
    const loc = data.maps.getLocation(r, l);
    if (!loc?.hasDungeon || isMainStoryDungeon(loc.mapTableData.mapId)) continue;
    const before = loc.dungeon.blocks, { blocks: after, swapped } = swapAiRooms(before, rooms, loc.mapTableData.mapId, process.argv.includes('--unsafe') ? {} : { portsOf: lawPorts, joins: lawJoins });
    if (!swapped) continue;
    let rb, ra; try { rb = reach(before); ra = reach(after); } catch (e) { continue; }
    dungeons++;
    for (const b of before) if (!b.isStartingBlock) { baseBlocks++; if (!rb.has(`${b.x},${b.z}`)) baseUnreached++; }
    const classicAfter = after.filter((b) => !isAi(b.blockName)), lost = classicAfter.filter((b) => rb.has(`${b.x},${b.z}`) && !ra.has(`${b.x},${b.z}`)).length;
    const ai = after.filter((b) => isAi(b.blockName)), stranded = ai.filter((b) => !ra.has(`${b.x},${b.z}`)).length;
    aiTotal += ai.length; strandedAi += stranded;
    if (lost) { hurt++; blocksLost += lost; worst.push([lost, loc.name, after.length]); }
  }
}
worst.sort((a, b) => b[0] - a[0]);
console.log(`${process.argv.includes('--unsafe') ? 'UNSAFE (no connectivity rule): ' : ''}${dungeons} dungeons with rooms swapped in; baseline: ${baseUnreached} of ${baseBlocks} classic blocks (${((100 * baseUnreached) / baseBlocks).toFixed(1)}%) are not reachable from the start even before any swap`);
console.log(`${hurt} (${((100 * hurt) / dungeons).toFixed(1)}%) lose reach of at least one classic block that was reachable; ${blocksLost} blocks in all`);
console.log(`${strandedAi} of ${aiTotal} AI rooms (${((100 * strandedAi) / aiTotal).toFixed(1)}%) cannot be reached from the start`);
console.log('worst:', worst.slice(0, 5).map((w) => `${w[1]} (${w[0]} of ${w[2]})`).join('; '));
