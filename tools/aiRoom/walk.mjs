#!/usr/bin/env node
// AI-ROOMS: WALK each room with the game's own player controller (src/player/motor.js) over the game's own collider
// (src/player/collider.js), built from the room's laid-out models as scenes/dungeonContext.js builds it (doors left
// open). From the room's first door the walker follows the shortest cell path to every other door and to every foe,
// loot and quest marker; a leg that does not arrive (stuck against a prop, a step too high, a ramp too steep) is a
// failure. `ARENA2_PATH=<arena2> node tools/aiRoom/walk.mjs [--only <substring>] [--legs]`
import { loadKit } from './kit.mjs';
import { allRooms } from './all.mjs';
import { pieceModels } from './pieces.mjs';
import { parseLayer, SIDE, CELL, PORTS } from './shell.mjs';
import { passable, PROP_RADIUS } from './dsl.mjs';
import { Collider } from '../../src/player/collider.js';
import { PlayerMotor } from '../../src/player/motor.js';

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const kit = loadKit();
for (const m of pieceModels()) kit.addCustomModel(m);

/** Shortest cell path (BFS) between two cells, or null. */
function path(cells, from, to, blocked) {
  const key = (i, j) => j * SIDE + i, prev = new Map([[key(...from), null]]), queue = [from];
  while (queue.length) {
    const [i, j] = queue.shift();
    if (i === to[0] && j === to[1]) { const out = []; let k = key(i, j); while (k != null) { out.push([k % SIDE, Math.floor(k / SIDE)]); k = prev.get(k); } return out.reverse(); }
    for (const [si, sj] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const ni = i + si, nj = j + sj, d = cells[nj]?.[ni];
      if (d && !blocked.has(key(ni, nj)) && !prev.has(key(ni, nj)) && passable(cells[j][i], d, si, sj)) { prev.set(key(ni, nj), key(i, j)); queue.push([ni, nj]); }
    }
  }
  return null;
}
const centre = (cells, [i, j]) => { const c = cells[j][i]; return [(i + 0.5) * CELL, (c.h[0] + c.h[1] + c.h[2] + c.h[3]) / 4, (j + 0.5) * CELL]; };

function walkLeg(col, cells, route) {
  const pts = route.map((c) => centre(cells, c));
  const m = new PlayerMotor(col, { speed: 50, running: 30 }, {});
  m.spawn(pts[0][0], pts[0][1] + 0.05, pts[0][2]);
  let next = 1, lastD = Infinity, stuckT = 0;
  for (let step = 0; step < 60 * 120 && next < pts.length; step++) {
    const [tx, , tz] = pts[next], dx = tx - m.pos[0], dz = tz - m.pos[2], d = Math.hypot(dx, dz);
    if (d < 0.7) { next++; lastD = Infinity; stuckT = 0; continue; }
    m.update(1 / 60, { forward: 1, strafe: 0, run: false, jump: false, crouch: false }, Math.atan2(dx, dz));
    if (d < lastD - 0.002) { lastD = d; stuckT = 0; } else if ((stuckT += 1 / 60) > 3) return { ok: false, at: m.pos.map((v) => +v.toFixed(2)), toward: pts[next].map((v) => +v.toFixed(2)), cell: route[next] };
  }
  return next >= pts.length ? { ok: true } : { ok: false, at: m.pos.map((v) => +v.toFixed(2)), cell: route[next], timeout: true };
}

let bad = 0, legs = 0;
for (const { spec, blockName, shellId, index } of allRooms()) {
  if (arg('--only') && !(blockName + spec.name).toLowerCase().includes(arg('--only').toLowerCase())) continue;
  const res = spec.finish({ shellId, index, blockName });
  kit.addCustomModel(res.shell);
  const lay = kit.layoutJson(res.block, blockName);
  const col = new Collider(() => -Infinity);
  for (const p of lay.placements) { const m = kit.getModel(p.modelIdNum); if (m?.indices?.length) col.addMesh('dungeon', m.positions, m.indices, p.matrix); }
  const cells = parseLayer(spec.grid.map((r) => r.join('')), spec.legend);
  const portCell = (p) => { const c = PORTS[p[1]].at / CELL - 1; return p[0] === 'N' ? [c, 0] : p[0] === 'S' ? [c, SIDE - 1] : p[0] === 'W' ? [0, c] : [SIDE - 1, c]; };
  const start = portCell(spec.ports[0]);
  const targets = [...spec.ports.slice(1).map((p) => ({ what: `port ${p}`, to: portCell(p) })), ...spec.flats.filter((f) => ['enemy', 'loot', 'quest', 'questItem'].includes(f.kind)).map((f) => ({ what: `${f.kind} ${f.x},${f.z}`, to: [Math.floor(f.x), Math.floor(f.z)] }))];
  const blocked = new Set();   // cells a prop stands in: the walker goes round
  for (const p of spec.props) for (let j = 0; j < SIDE; j++) for (let i = 0; i < SIDE; i++) if (Math.hypot((i + 0.5 - p.x) * CELL, (j + 0.5 - p.z) * CELL) < (PROP_RADIUS[p.name] ?? 1)) blocked.add(j * SIDE + i);
  const fails = [];
  for (const t of targets) {
    const route = path(cells, start, t.to, blocked);
    legs++;
    if (!route) { fails.push(`${t.what}: no path`); continue; }
    const r = walkLeg(col, cells, route);
    if (!r.ok) fails.push(`${t.what}: stuck at ${JSON.stringify(r.at)} heading for cell ${r.cell}${r.timeout ? ' (timeout)' : ''}`);
  }
  console.log(`${blockName} ${spec.name}: ${targets.length - fails.length}/${targets.length} legs walked${fails.length ? '  FAILURES:' : ''}`);
  for (const f of fails) { console.log('   - ' + f); bad++; }
}
console.log(bad ? `${bad} leg(s) failed of ${legs}` : `all ${legs} legs walked`);
process.exit(bad ? 1 : 0);
