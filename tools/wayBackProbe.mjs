// WAYBACK PROBE - the way out (src/player/wayOut.js) on Daggerfall's real dungeons, offline.
// Builds a dungeon's collider as the dungeon host does (tools/climbDungeonProbe.mjs dungeonCollider), lands a body at the
// start marker as the host does, walks it over the floor (a one-metre grid, steps and slopes a body can walk, a waist
// ray clear) to far-in cells, lays the trail the held map would (automapTrailTick), and asks the way out's field whether
// the far cell has a walked way back to the entrance: the field's reach, with each blocked step named.
//
//   ARENA2_PATH=<arena2> node tools/wayBackProbe.mjs "Daggerfall" "Castle Kingwing"
//   ARENA2_PATH=<arena2> node tools/wayBackProbe.mjs --all [--far 6] [--limit 40] [--fails]
import { automapTrailTick, TRAIL_CELL } from '../src/maps/automap.js';
import { createWayOut, trailCells, nearestCell, wayField, stepHitCuts, walkedStep } from '../src/player/wayOut.js';
import { loadData } from './climbDungeonProbe.mjs';
import { PlayerMotor } from '../src/player/motor.js';
import { Collider } from '../src/player/collider.js';
import { multiply } from '../src/world/mat4.js';
import { layoutDungeon } from '../src/world/dungeonLayout.js';
import { readFileSync } from 'node:fs';
import { isMain } from './lib/isMain.mjs';

const VEIN = Object.freeze({ only: Object.freeze(['dungeon']) });
const EYE = 1.62;
/** The most a body climbs between two neighbouring one-metre cells (m): a stair tread, a cave slope. */
const WALK_DY = 0.75;

/** A dungeon's collider with its doors OPEN (a player opens them): every block's placed models alone. */
export function openCollider(data, loc) {
  const d = layoutDungeon(loc, data.blocks, data.getModel);
  const col = new Collider(() => -Infinity);
  for (const b of d.blocks) {
    const om = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, b.originX, 0, b.originZ, 1];
    for (const p of b.layout.placements) { const m = data.getModel(p.modelIdNum); if (m) col.addMesh('dungeon', m.positions, m.indices, multiply(om, p.matrix)); }
  }
  return { col, d };
}

/** The floors of a column, top first (surfaces a body stands on). */
function floorsAt(col, x, z) {
  const out = []; let y = 60;
  for (let n = 0; n < 12 && y > -120; n++) {
    const h = col.surfaceHit([x, y, z], [0, -1, 0], y + 120);
    if (!Number.isFinite(h.dist)) break;
    const fy = y - h.dist;
    if (h.normal && h.normal[1] > 0.6 && Number.isFinite(col.raycast([x, fy + 0.05, z], [0, 1, 0], 1.9)) === false) out.push(fy);
    y = fy - 0.05;
  }
  return out;
}

/** The walkable floor graph of every block's footprint, and where the body lands. */
export function floorGraph(col, d) {
  const nodes = [], at = new Map();
  const key = (gx, gz) => gx * 100000 + gz;
  const sx = d.startMarker ? d.startMarker.x : 0, sz = d.startMarker ? d.startMarker.z : 0;
  for (const b of d.blocks) {
    for (let gx = 0; gx < 51; gx++) for (let gz = 0; gz < 51; gz++) {
      const X = Math.floor(b.originX) + gx, Z = Math.floor(b.originZ) + gz;
      for (const fy of floorsAt(col, X + 0.5, Z + 0.5)) {
        const i = nodes.length;
        nodes.push([X + 0.5, fy, Z + 0.5]);
        const k = key(X, Z);
        const l = at.get(k); if (l) l.push(i); else at.set(k, [i]);
      }
    }
  }
  const adj = nodes.map(() => []);
  for (let i = 0; i < nodes.length; i++) {
    const [x, y, z] = nodes[i];
    const X = Math.floor(x), Z = Math.floor(z);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      for (const j of at.get(key(X + dx, Z + dz)) ?? []) {
        if (j < i) continue;
        const q = nodes[j], dy = q[1] - y;
        if (Math.abs(dy) > WALK_DY) continue;
        const len = Math.hypot(q[0] - x, dy, q[2] - z);
        const dir = [(q[0] - x) / len, dy / len, (q[2] - z) / len];
        const wall = col.raycast([x, y + 0.9, z], dir, len, VEIN);
        if (Number.isFinite(wall) && wall < len - 0.05) continue;
        // a body must really walk it, either way (the collider's own capsule move, not a ray)
        const walk = (a, b) => { const f = [a[0], a[1] + 0.02, a[2]]; col.move(f, b[0] - a[0], 0, b[2] - a[2]); return Math.hypot(f[0] - b[0], f[2] - b[2]) < 0.2 && Math.abs(f[1] - b[1]) < 0.35; };
        if (!walk(nodes[i], q) || !walk(q, nodes[i])) continue;
        adj[i].push(j); adj[j].push(i);
      }
    }
  }
  let from = -1, best = 1e9;
  if (d.startMarker) {
    const land = col.surfaceHit([sx, d.startMarker.y + 1.08, sz], [0, -1, 0], 40);
    const ly = Number.isFinite(land.dist) ? d.startMarker.y + 1.08 - land.dist : d.startMarker.y;
    nodes.forEach((n, i) => { const e = Math.hypot(n[0] - sx, n[1] - ly, n[2] - sz); if (e < best) { best = e; from = i; } });
  }
  return { nodes, adj, start: from, startGap: best };
}

function bfs(adj, s) {
  const dist = new Int32Array(adj.length).fill(-1), par = new Int32Array(adj.length).fill(-1);
  const q = [s]; dist[s] = 0;
  for (let h = 0; h < q.length; h++) for (const j of adj[q[h]]) if (dist[j] < 0) { dist[j] = dist[q[h]] + 1; par[j] = q[h]; q.push(j); }
  return { dist, par };
}


/** The trail a real body lays: a PlayerMotor runs `path` (node to node, at a run), and the held map's tick samples it at
 *  5 Hz exactly as the dungeon host does (eye, eye level, the fall under way). Returns the record and how far along it got. */
export function motorTrail(col, g, path, { dt = 1 / 60, sample = 0.2 } = {}) {
  const m = new PlayerMotor(col, { speed: 50, running: 30 }, {});
  const f0 = g.nodes[path[0]];
  m.spawn(f0[0], f0[1] + 0.05, f0[2]);
  const rec = { trail: new Set() };
  let k = 1, since = 0, stuck = 0, last = [...m.pos];
  automapTrailTick(rec, m.eye, m.eye[1] - m.pos[1], null);   // the host's first tick: the landing, stood still
  for (let step = 0; step < 60 * 400 && k < path.length; step++) {
    const n = g.nodes[path[k]];
    const dx = n[0] - m.pos[0], dz = n[2] - m.pos[2];
    if (Math.hypot(dx, dz) < 0.6 && Math.abs(n[1] - m.pos[1]) < 1.2) { k++; continue; }
    const yaw = Math.atan2(dx, dz);
    m.update(dt, { forward: 1, strafe: 0, run: true, jump: stuck > 90 && m.grounded, crouch: false }, yaw);
    since += dt;
    if (since >= sample) {
      since = 0;
      const eyeLevel = m.eye[1] - m.pos[1];
      automapTrailTick(rec, m.eye, eyeLevel, m.falling ? m.fallStart : null);
      stuck = Math.hypot(m.pos[0] - last[0], m.pos[2] - last[2]) < 0.3 ? stuck + 12 : 0;
      last = [...m.pos];
      if (stuck > 600) break;
    }
  }
  return { rec, reached: k, of: path.length, end: [...m.pos] };
}

/** The way back as the host runs it: a player walks `path` home at a run, the compass aiming four times a second and the
 *  ribbon asked every frame (createWayOut, its paced asks and all). A tick is BAD when the ribbon is shorter than the
 *  walk left (to 12 cells) - the line stopped short of where the walked way plainly goes. */
export function walkBack(col, g, path, rec, exitAt, { speed = 7, dt = 0.25 } = {}) {
  const way = createWayOut();
  const sees = (p) => { const eye = cur.eye; const dx = p[0] - eye[0], dy = p[1] + 1 - eye[1], dz = p[2] - eye[2], len = Math.hypot(dx, dy, dz); return !(len > 1e-3) || !(col.raycast(eye, [dx / len, dy / len, dz / len], len) < len - 0.1); };
  const stepClear = (p, q) => { const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], len = Math.hypot(dx, dy, dz); return !(len > 1e-3) || !stepHitCuts(col.raycast([p[0], p[1] + 0.9, p[2]], [dx / len, dy / len, dz / len], len, VEIN), len); };
  const back = [...path].reverse();
  const cur = { eye: [0, 0, 0] };
  let ticks = 0, bad = 0, crow = 0, empty = 0, walked = 0, k = 0, worst = null;
  for (let t = 0; k < back.length - 1; t += dt) {
    walked += speed * dt;
    while (k < back.length - 1 && walked > 1) { walked -= 1; k++; }
    const n = g.nodes[back[k]];
    const feet = [n[0], n[1], n[2]];
    cur.eye = [n[0], n[1] + EYE, n[2]];
    const left = back.length - 1 - k;
    if (left < 4) break;   // the door is in front of the player
    const aim = way.aim(rec.trail, [], exitAt, feet, sees, t, stepClear);
    const line = way.line(feet);
    ticks++;
    const want = Math.min(left - 3, 12);
    if (!aim) continue;
    if (line.length < want) { bad++; if (line.length < 2) empty++; if (!worst || line.length < worst.line) worst = { at: feet.map((v) => +v.toFixed(1)), left, line: line.length, t: +t.toFixed(1) }; }
    if (Math.abs(aim[0] - exitAt[0]) < 1e-6 && Math.abs(aim[1] - exitAt[2]) < 1e-6 && left > 8) crow++;
  }
  return { ticks, bad, empty, crow, worst, builds: way.builds() };
}

/** Probe one dungeon (layout: { col, d: { blocks, startMarker } }) with `far` far-in targets. */
export function runOne(data, layout, { far = 6, walk = false, motor = false } = {}) {
  const { col, d } = layout;
  const sm = d.startMarker;
  const out = { blocks: new Set(d.blocks.map((b) => b.name)).size, start: !!sm, targets: 0, ok: 0, fails: [] };
  if (!sm) { out.noStart = true; return out; }
  const g = floorGraph(col, d);
  out.startGap = +g.startGap.toFixed(2);
  if (g.start < 0) { out.noFloor = true; return out; }
  const { dist, par } = bfs(g.adj, g.start);
  const reach = []; for (let i = 0; i < dist.length; i++) if (dist[i] > 0) reach.push(i);
  out.reachable = reach.length;
  reach.sort((a, b) => dist[b] - dist[a]);
  const picks = [];
  for (let k = 0; k < far && reach.length; k++) picks.push(reach[Math.floor((k * reach.length) / far / 1.01)]);   // the farthest first, then down the range
  if (reach.length) picks.unshift(reach[0]);
  const clear = (cells) => (i, j) => {
    if (walkedStep(cells, i, j)) return true;
    const p = cells.pts[i], q = cells.pts[j];
    const a = [p[0], p[1] + 0.9, p[2]];
    const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], len = Math.hypot(dx, dy, dz);
    if (!(len > 1e-3)) return true;
    return !stepHitCuts(col.raycast(a, [dx / len, dy / len, dz / len], len, VEIN), len);
  };
  const exitAt = [sm.x, sm.y, sm.z];
  for (const target of new Set(picks)) {
    out.targets++;
    const path = []; for (let i = target; i >= 0; i = par[i]) path.push(i);
    path.reverse();
    let rec = { trail: new Set() };
    if (motor) {
      const mt = motorTrail(col, g, path);
      rec = mt.rec; out.motor ??= { runs: 0, short: 0 }; out.motor.runs++;
      if (mt.reached < mt.of - 1) { out.motor.short++; (out.motor.why ??= []).push({ reached: mt.reached, of: mt.of, end: mt.end.map((v) => +v.toFixed(1)), want: g.nodes[path[mt.reached]].map((v) => +v.toFixed(1)) }); continue; }   // the body could not run it: no trail to read (the probe's walker, not the way out's)
    } else for (const i of path) { const n = g.nodes[i]; automapTrailTick(rec, [n[0], n[1] + EYE, n[2]], EYE, null); }
    const cells = trailCells(rec.trail);
    const exit = nearestCell(cells, exitAt);
    const field = wayField(cells, exit, [], clear(cells));
    const n = g.nodes[target];
    const from = nearestCell(cells, [n[0], n[1], n[2]]);
    if (walk) { const w = walkBack(col, g, path, rec, exitAt); out.walk ??= { ticks: 0, bad: 0, empty: 0, crow: 0, worst: [] }; out.walk.ticks += w.ticks; out.walk.bad += w.bad; out.walk.empty += w.empty; out.walk.crow += w.crow; if (w.bad > w.ticks * 0.1) out.walk.worst.push({ path: path.length, ...w }); }
    const why = exit < 0 ? 'exit-not-on-trail' : from < 0 ? 'far-not-on-trail' : field.next[from] < 0 ? 'field-does-not-reach' : null;
    if (!why) { out.ok++; continue; }
    // where the field's reach from the entrance stops along the walked path: the first cell off the field
    let cut = -1;
    for (let k = 0; k < path.length; k++) { const nn = g.nodes[path[k]]; const c = nearestCell(cells, [nn[0], nn[1], nn[2]]); if (c >= 0 && field.next[c] < 0) { cut = k; break; } }
    const cn = cut >= 0 ? g.nodes[path[cut]] : null, pn = cut > 0 ? g.nodes[path[cut - 1]] : null;
    out.fails.push({ why, depth: dist[target], cells: cells.pts.length, markerY: +sm.y.toFixed(2), exit, cut: cn && pn ? { from: pn.map((v) => +v.toFixed(2)), to: cn.map((v) => +v.toFixed(2)), dy: +(cn[1] - pn[1]).toFixed(2) } : null });
  }
  return out;
}

export function everyDungeon(data) {
  const out = [];
  for (let r = 0; r < data.maps.regionCount; r++) {
    const region = data.maps.getRegionName(r);
    const reg = data.maps.getRegion(r);
    if (!reg) continue;
    for (const [name] of reg.mapNameLookup) out.push([region, name]);
  }
  return out;
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : d; };
  const flag = (k) => { const i = argv.indexOf(k); if (i >= 0) argv.splice(i, 1); return i >= 0; };
  const far = Number(opt('--far', 6)), limit = Number(opt('--limit', 1e9)), skip = Number(opt('--skip', 0));
  const only = opt('--only', null);   // a file of `Region / Name` lines
  const walk = flag('--walk'), motor = flag('--motor');
  const all = flag('--all') || !!only, showFails = flag('--fails');
  const arena2 = process.env.ARENA2_PATH;
  if (!arena2) { console.error('ARENA2_PATH is not set'); process.exit(2); }
  const data = loadData(arena2);
  let list = all ? everyDungeon(data).slice(skip) : [[argv[0], argv[1]]];
  const part = String(opt('--part', '0/1')).split('/').map(Number);   // `i/n`: every n-th dungeon from i, to share a sweep across processes
  list = list.filter((_, k) => k % part[1] === part[0]);
  if (only) { const want = new Set(readFileSync(only, 'utf8').split(/\r?\n/).filter(Boolean)); list = list.filter(([r, n]) => want.has(`${r} / ${n}`)); }
  let done = 0, bad = 0;
  const seenLayouts = new Set();
  for (const [region, name] of list) {
    if (done >= limit) break;
    let loc; try { loc = data.maps.getLocationByName(region, name); } catch { continue; }
    if (!loc?.hasDungeon) continue;
    done++;
    let r;
    try {
      const { col, d } = openCollider(data, loc);
      const sig = d.blocks.map((b) => `${b.name}@${b.originX},${b.originZ}`).join('|') + `|${d.startMarker?.x},${d.startMarker?.z}`;
      if (seenLayouts.has(sig)) { done--; continue; }   // many locations share one layout: probed once
      seenLayouts.add(sig);
      r = runOne(data, { col, d }, { far, walk, motor });
    } catch (e) { console.log(`${region} / ${name}: ERROR ${e.message}`); continue; }
    const failed = r.fails.length || r.noStart || r.noFloor || (r.walk && r.walk.worst.length);
    if (failed) bad++;
    console.log(`${failed ? 'FAIL' : 'ok  '} ${region} / ${name}: blocks ${r.blocks} reach ${r.reachable ?? 0} targets ${r.targets} ok ${r.ok}${r.noStart ? ' NO-START' : ''}${r.noFloor ? ' NO-FLOOR' : ''} gap ${r.startGap ?? '-'}`);
    if (r.motor) console.log(`   motor: runs ${r.motor.runs} short ${r.motor.short} ${JSON.stringify(r.motor.why ?? [])}`);
    if (r.walk) console.log(`   walk: ticks ${r.walk.ticks} bad ${r.walk.bad} empty ${r.walk.empty} crow ${r.walk.crow}`);
    if (showFails) for (const f of [...r.fails, ...(r.walk?.worst ?? [])]) console.log('   ' + JSON.stringify(f));
  }
  console.log(`dungeons ${done}, failing ${bad}`);
}
