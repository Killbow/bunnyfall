#!/usr/bin/env node
// AI-ROOMS: do a new room's doors meet its neighbours'? For real dungeons (the shipped rule: share and connectivity), at
// each of the 8 ports on each shared edge between two blocks, cast a floor ray just either side of the edge. A JOIN is
// good when both sides have floor at the same height (0.1 m). Counted for AI-room-to-classic, AI-to-AI and
// classic-to-classic pairs, so the new rooms are measured against Daggerfall's own. `ARENA2_PATH=<arena2> node tools/aiRoom/joins.mjs [dungeons=150]`
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData } from '../climbDungeonProbe.mjs';
import { layoutDungeon } from '../../src/world/dungeonLayout.js';
import { Collider } from '../../src/player/collider.js';
import { multiply } from '../../src/world/mat4.js';
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
const lawRoom = new Map(list.map((r) => [r.name, { ports: new Set(r.ports.map((p) => `${p[0]}:${p[1]}`)), joins: r.joins }]));
const lawCache = new Map();
const lawPorts = (name) => { if (lawRoom.has(name)) return lawRoom.get(name).ports; if (!lawCache.has(name)) lawCache.set(name, portsOfBlock(data.blocks.getBlock(data.blocks.getBlockIndex(name)))); return lawCache.get(name); };
const lawJoins = (name) => lawRoom.get(name)?.joins ?? true;
const isAi = (n) => /7\d{6}\.RDB$/.test(n);
const want = Number(process.argv[2] ?? 150);
const tally = { 'ai-classic': [0, 0], 'ai-ai': [0, 0], 'classic-classic': [0, 0] };
let seen = 0;
const floors = (col, x, z) => { const out = []; let y = 60; for (let n = 0; n < 10 && y > -20; n++) { const h = col.surfaceHit([x, y, z], [0, -1, 0], y + 20); if (!Number.isFinite(h.dist)) break; const fy = y - h.dist; if (h.normal && h.normal[1] > 0.7) out.push(fy); y = fy - 0.05; } return out; };
for (let r = 0; r < 62 && seen < want; r++) {
  const region = data.maps.getRegion?.(r); const count = region?.locationCount ?? 0;
  for (let l = 0; l < count && seen < want; l += 7) {
    const loc = data.maps.getLocation(r, l);
    if (!loc?.hasDungeon || isMainStoryDungeon(loc.mapTableData.mapId)) continue;
    const { blocks } = swapAiRooms(loc.dungeon.blocks, rooms, loc.mapTableData.mapId, { portsOf: lawPorts, joins: lawJoins });
    let laid; try { laid = layoutDungeon({ ...loc, dungeon: { ...loc.dungeon, blocks } }, data.blocks, getModel); } catch { continue; }
    seen++;
    const col = new Collider(() => -Infinity);
    for (const b of laid.blocks) { const om = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, b.originX, 0, b.originZ, 1]; for (const p of b.layout.placements) { const m = getModel(p.modelIdNum); if (m?.indices?.length) col.addMesh('dungeon', m.positions, m.indices, multiply(om, p.matrix)); } }
    const at = new Map(laid.blocks.map((b) => [`${Math.round(b.originX / 51.2)},${Math.round(b.originZ / 51.2)}`, b]));
    for (const b of laid.blocks) {
      const bx = Math.round(b.originX / 51.2), bz = Math.round(b.originZ / 51.2);
      for (const [dx, dz] of [[1, 0], [0, 1]]) {   // each shared edge once: east and south
        const nb = at.get(`${bx + dx},${bz + dz}`); if (!nb) continue;
        const kind = isAi(b.name) && isAi(nb.name) ? 'ai-ai' : isAi(b.name) || isAi(nb.name) ? 'ai-classic' : 'classic-classic';
        for (const p of [PORTS.A.at, PORTS.B.at]) {
          const ex = dx ? b.originX + 51.2 : b.originX + p, ez = dx ? b.originZ + p : b.originZ + 51.2;
          const a = floors(col, dx ? ex - 1.0 : ex, dx ? ez : ez - 1.0), c = floors(col, dx ? ex + 1.0 : ex, dx ? ez : ez + 1.0);
          if (!a.length && !c.length) continue;            // nothing on either side: no door there
          tally[kind][1]++; if (a.some((y) => c.some((z) => Math.abs(y - z) < 0.1))) tally[kind][0]++;
        }
      }
    }
  }
}
console.log(`${seen} dungeons`);
for (const [k, [good, all]] of Object.entries(tally)) console.log(`${k}: ${good} of ${all} ports meet floor to floor (${all ? ((100 * good) / all).toFixed(0) : '-'}%)`);
