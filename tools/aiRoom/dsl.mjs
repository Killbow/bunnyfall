// AI-ROOMS: the room-authoring helpers. A RoomSpec is a 32 x 32 grid of 1.6 m cells (one layer), a list of props, and
// the ports the room opens. `finish()` turns it into the shell model, the block JSON and a report: the report is the
// room's own test (every used port walkable and reachable, every spawn and prop on open floor, nothing too tall).
import { buildShell, parseLayer, CELL, SIDE, PORTS, THEMES, isPortCell } from './shell.mjs';
import { RoomBlock, RAW } from './block.mjs';
import { PIECES, PIECE_ID } from './pieces.mjs';

export const A = 32.0, B = 12.8;   // the two port floors
const PIECE_HEIGHT = Object.fromEntries(PIECES.map((p) => [p.name, { 'pillar-square': 3.2, 'pillar-square-tall': 6.4, 'pillar-round': 3.2, 'pillar-round-tall': 6.4, arch: 3.2, 'barred-gate': 3.2 }[p.name] ?? 2.9]));
/** How far from a prop's middle (metres) a walker or a marker keeps: a prop is an obstacle this wide. */
export const PROP_RADIUS = Object.freeze({ 'pillar-square': 0.9, 'pillar-square-tall': 1.0, 'pillar-round': 0.8, 'pillar-round-tall': 0.9, 'pillar-broken': 1.5, arch: 0, 'barred-gate': 1.7, sarcophagus: 1.4, altar: 1.7, statue: 1.0, stalagmites: 1.0, stalactites: 0, rubble: 1.2, cage: 1.2, well: 1.6, throne: 1.5, 'stone-table': 1.4, 'bone-pile': 1.0, 'dais-step': 0, lectern: 0.8 });
const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!$%&*+=:;~';

/** A tiny seeded generator (mulberry32), so a room built twice is the same room. */
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }


/** May a walker step from cell `c` to its neighbour `d` (one step: si, sj)? The corner heights along the shared edge
 *  differ by at most 0.45 m (the step the controller climbs), with 1.8 m of headroom at both ends. */
export function passable(c, d, si, sj) {
  const idx = { '0,-1': [0, 1, 3, 2], '1,0': [1, 2, 0, 3], '0,1': [2, 3, 1, 0], '-1,0': [3, 0, 2, 1] }[`${si},${sj}`], g = [c.h[idx[0]], c.h[idx[1]]], e = [d.h[idx[2]], d.h[idx[3]]];
  return Math.max(Math.abs(g[0] - e[0]), Math.abs(g[1] - e[1])) <= 0.45 && Math.min(g[0] + c.clear, e[0] + d.clear) - Math.max(g[0], e[0]) >= 1.8 && Math.min(g[1] + c.clear, e[1] + d.clear) - Math.max(g[1], e[1]) >= 1.8;
}

export class RoomSpec {
  /** @param {{kind:'border'|'interior', theme?:number, note?:string, seed?:number}} opts */
  constructor(name, { kind = 'interior', theme = 120, note = '', seed = 1 } = {}) {
    this.name = name; this.kind = kind; this.theme = theme; this.note = note; this.rand = rng(seed);
    this.grid = Array.from({ length: SIDE }, () => new Array(SIDE).fill(' '));
    this.legend = {}; this.next = 0; this.ports = []; this.portSpecs = []; this.props = []; this.lights = []; this.flats = [];
  }
  /** A character for a floor/clear/theme combination (the same arguments give the same character). */
  floor(h, { clear = 3.2, theme = this.theme, tex = null } = {}) {
    const key = JSON.stringify([h, clear, theme, tex]);
    for (const [ch, L] of Object.entries(this.legend)) if (L.key === key) return ch;
    const ch = CHARS[this.next++]; this.legend[ch] = { floor: h, clear, theme, ...(tex ? { tex } : {}), key }; return ch;
  }
  /** A ramp run: its own character (two runs never share one), rising towards `dir`. */
  ramp(dir, { clear = 3.2, theme = this.theme } = {}) { const ch = CHARS[this.next++]; this.legend[ch] = { ramp: dir, clear, theme }; return ch; }
  set(i, j, ch) { if (i >= 0 && j >= 0 && i < SIDE && j < SIDE) this.grid[j][i] = ch; return this; }
  rect(i0, j0, i1, j1, ch) { for (let j = Math.min(j0, j1); j <= Math.max(j0, j1); j++) for (let i = Math.min(i0, i1); i <= Math.max(i0, i1); i++) this.set(i, j, ch); return this; }
  /** An ellipse of cells centred on (ci, cj), radii in cells. */
  disc(ci, cj, ri, rj, ch) { for (let j = 0; j < SIDE; j++) for (let i = 0; i < SIDE; i++) if (((i + 0.5 - ci) / ri) ** 2 + ((j + 0.5 - cj) / rj) ** 2 <= 1) this.set(i, j, ch); return this; }
  /** A ring: the cells between two ellipses. */
  annulus(ci, cj, ro, ri, ch) { for (let j = 0; j < SIDE; j++) for (let i = 0; i < SIDE; i++) { const d = Math.hypot(i + 0.5 - ci, j + 0.5 - cj); if (d <= ro && d > ri) this.set(i, j, ch); } return this; }
  /** An octagon of cells centred on (ci, cj): `rad` cells from the middle to a side, corners cut at 1.5 rad. */
  octagon(ci, cj, rad, ch) { for (let j = 0; j < SIDE; j++) for (let i = 0; i < SIDE; i++) { const dx = Math.abs(i + 0.5 - ci), dz = Math.abs(j + 0.5 - cj); if (dx <= rad && dz <= rad && dx + dz <= rad * 1.5) this.set(i, j, ch); } return this; }
  /** Rectangle outline, `t` cells thick. */
  frame(i0, j0, i1, j1, t, ch) { this.rect(i0, j0, i1, j0 + t - 1, ch).rect(i0, j1 - t + 1, i1, j1, ch).rect(i0, j0, i0 + t - 1, j1, ch).rect(i1 - t + 1, j0, i1, j1, ch); return this; }
  at(i, j) { return this.legend[this.grid[j]?.[i]] ?? null; }
  /** A port: its 2-cell corridor `len` cells in from the edge at the port's floor, and the door. Carved last (in
   *  finish), so no shape drawn after it can overwrite it. */
  port(edge, port, len = 4, ch = this.floor(PORTS[port].floor)) { this.portSpecs.push({ edge, port, len, ch }); this.ports.push(edge + port); return this; }
  _carvePorts() {
    for (const { edge, port, len, ch } of this.portSpecs) {
      const [p, q] = [PORTS[port].at / CELL - 1, PORTS[port].at / CELL];
      if (edge === 'N') this.rect(p, 0, q, len - 1, ch); if (edge === 'S') this.rect(p, SIDE - len, q, SIDE - 1, ch);
      if (edge === 'W') this.rect(0, p, len - 1, q, ch); if (edge === 'E') this.rect(SIDE - len, p, SIDE - 1, q, ch);
    }
  }
  /** Carve a corridor two cells wide between two cell positions (an L when they differ in both: along x first). */
  corridor(i0, j0, i1, j1, ch, w = 2) {
    const lo = (v) => v - Math.floor((w - 1) / 2), hi = (v) => v + Math.ceil((w - 1) / 2);
    this.rect(Math.min(i0, i1), lo(j0), Math.max(i0, i1), hi(j0), ch);
    this.rect(lo(i1), Math.min(j0, j1), hi(i1), Math.max(j0, j1), ch); return this;
  }
  floorAt(i, j) { const L = this.at(i, j); return L?.floor ?? null; }
  /** A prop at cell-space (x, z) (a cell's middle is i + 0.5), standing on the floor there. */
  prop(name, x, z, { rot = 0, up = 0 } = {}) { if (!PIECE_ID[name]) throw new Error(`no piece ${name}`); this.props.push({ name, x, z, rot, up }); return this; }
  light(x, z, { radius = 90, up = 2.3 } = {}) { this.lights.push({ x, z, radius, up }); return this; }
  flat(kind, x, z, { up = 0 } = {}) { this.flats.push({ kind, x, z, up }); return this; }
  /** Lights on a lattice over open floor (one per `step` cells), a torch standing by every other. */
  autoLights(step = 4, { radius = 90, torches = true } = {}) {
    let n = 0;
    for (let j = 1; j < SIDE; j += step) for (let i = 1; i < SIDE; i += step) {
      // the open cell nearest the lattice point, within a cell
      let best = null;
      for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1]]) if (this.floorAt(i + di, j + dj) != null) { best = [i + di, j + dj]; break; }
      if (!best) continue;
      this.light(best[0] + 0.5, best[1] + 0.5, { radius });
      if (torches && n++ % 2 === 0) this.flat(this.theme === 123 ? 'skullCandles' : 'torch', best[0] + 0.5, best[1] + 0.5);
    }
    return this;
  }
  /** Foes, loot and the quest markers on open floor, spread out and away from the doors. */
  populate({ enemies = 6, loot = 3, quest = 2, seed = 0 } = {}) {
    const rand = rng(seed + 977), open = [];
    for (let j = 0; j < SIDE; j++) for (let i = 0; i < SIDE; i++) if (this.floorAt(i, j) != null && !this.props.some((p) => Math.hypot((i + 0.5 - p.x) * CELL, (j + 0.5 - p.z) * CELL) < (PROP_RADIUS[p.name] ?? 1) + 0.4)) open.push([i, j]);
    const taken = [], far = (i, j, d) => taken.every(([a, b]) => Math.hypot(a - i, b - j) >= d) && this.ports.every((p) => { const e = p[0], c = PORTS[p[1]].at / CELL; const [pi, pj] = e === 'N' ? [c, 0] : e === 'S' ? [c, SIDE] : e === 'W' ? [0, c] : [SIDE, c]; return Math.hypot(pi - i, pj - j) >= 5; });
    const pick = (kind, count, minD) => { let tries = 0; while (count > 0 && tries++ < 4000) { const [i, j] = open[Math.floor(rand() * open.length)]; if (!far(i, j, minD)) continue; taken.push([i, j]); this.flat(kind, i + 0.5, j + 0.5, { up: kind === 'enemy' || kind === 'loot' || kind === 'quest' || kind === 'questItem' ? 0.6 : 0 }); count--; } };
    pick('quest', quest, 4); pick('questItem', 1, 4); pick('loot', loot, 3); pick('enemy', enemies, 3);
    return this;
  }
  /** Everything: the shell model JSON, the block JSON and a report. */
  finish({ shellId, index, blockName, position }) {
    this._carvePorts();
    const { mesh } = buildShell([this.grid.map((r) => r.join(''))], this.legend, this.ports);
    const shell = mesh.toModel(shellId);
    const blk = new RoomBlock({ name: blockName, index, position });
    blk.model(shellId, 0, 0, 0);
    for (const p of this.ports) blk.door(p[0], p[1]);
    const problems = [];
    const floorY = (x, z) => this.floorAt(Math.floor(x), Math.floor(z));
    for (const p of this.props) { const f = floorY(p.x, p.z); if (f == null) { problems.push(`prop ${p.name} at ${p.x},${p.z} is not on a flat floor`); continue; } if (this.at(Math.floor(p.x), Math.floor(p.z)).clear < PIECE_HEIGHT[p.name] - 1e-6 && !/stalactites/.test(p.name)) problems.push(`prop ${p.name} (${PIECE_HEIGHT[p.name]} m) is taller than the ceiling at ${Math.floor(p.x)},${Math.floor(p.z)}`); blk.model(PIECE_ID[p.name], p.x * CELL, f + p.up, p.z * CELL, p.rot); }
    for (const l of this.lights) { const f = floorY(l.x, l.z); if (f == null) { problems.push(`light at ${l.x},${l.z} is not over a flat floor`); continue; } blk.light(l.x * CELL, f + l.up, l.z * CELL, l.radius); }
    for (const f of this.flats) { const fl = floorY(f.x, f.z); if (fl == null) { problems.push(`flat ${f.kind} at ${f.x},${f.z} is not on a flat floor`); continue; } blk.flat(f.kind, f.x * CELL, fl + f.up, f.z * CELL); }
    // ports: each cell pair open and at the port's floor
    for (const p of this.ports) for (let j = 0; j < SIDE; j++) for (let i = 0; i < SIDE; i++) if (isPortCell(p[0], p[1], i, j) && this.floorAt(i, j) !== PORTS[p[1]].floor) problems.push(`port ${p} cell ${i},${j} is not floor ${PORTS[p[1]].floor}`);
    // walkability: flood from the first port; every port, foe, loot and marker must be in it
    const cells = parseLayer(this.grid.map((r) => r.join('')), this.legend), key = (i, j) => j * SIDE + i;
    const start = this.ports.length ? (() => { const p = this.ports[0], c = PORTS[p[1]].at / CELL - 1; return p[0] === 'N' ? [c, 0] : p[0] === 'S' ? [c, SIDE - 1] : p[0] === 'W' ? [0, c] : [SIDE - 1, c]; })() : (() => { for (let j = 0; j < SIDE; j++) for (let i = 0; i < SIDE; i++) if (cells[j][i]) return [i, j]; return [0, 0]; })();
    const seen = new Set([key(...start)]), queue = [start];
    while (queue.length) { const [i, j] = queue.pop(); for (const [si, sj] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) { const ni = i + si, nj = j + sj, d = cells[nj]?.[ni]; if (!d || seen.has(key(ni, nj)) || !passable(cells[j][i], d, si, sj)) continue; seen.add(key(ni, nj)); queue.push([ni, nj]); } }
    let open = 0; for (const row of cells) for (const c of row) if (c) open++;
    if (!seen.has(key(...start))) problems.push('no start cell');
    for (const p of this.ports) { const c = PORTS[p[1]].at / CELL - 1, [i, j] = p[0] === 'N' ? [c, 0] : p[0] === 'S' ? [c, SIDE - 1] : p[0] === 'W' ? [0, c] : [SIDE - 1, c]; if (!seen.has(key(i, j))) problems.push(`port ${p} is not reachable from ${this.ports[0]}`); }
    for (const f of this.flats) if (['enemy', 'loot', 'quest', 'questItem'].includes(f.kind) && !seen.has(key(Math.floor(f.x), Math.floor(f.z)))) problems.push(`${f.kind} at ${f.x},${f.z} is not reachable`);
    if (open - seen.size > 0) problems.push(`${open - seen.size} of ${open} open cells cannot be walked to`);
    if (!blk.counts.enemy) problems.push('no enemy marker');
    if (!blk.counts.quest) problems.push('no quest marker (a quest cannot use this room)');
    const bounds = shell.positions; for (let k = 0; k < bounds.length; k++) if (bounds[k] < -0.001 || ((k % 3 !== 1) && bounds[k] > 51.201)) { problems.push('the shell leaves the block'); break; }
    return { shell, block: blk.toJson(), problems, stats: { tris: shell.indices.length / 3, open, reached: seen.size, ports: this.ports.join(' '), ...blk.counts } };
  }
}

/** A room mirrored across its diagonal (x <-> z), BEFORE it is populated: the grid, the ramps' directions, the ports and
 *  the props follow (north <-> west, south <-> east). A new room in its own right: give it a name, a kind, a theme. */
export function transpose(src, name, { kind = src.kind, theme = src.theme, seed = 1, note = src.note } = {}) {
  const r = new RoomSpec(name, { kind, theme, seed, note });
  const flip = { '+x': '+z', '-x': '-z', '+z': '+x', '-z': '-x' }, edge = { N: 'W', W: 'N', S: 'E', E: 'S' };
  r.legend = Object.fromEntries(Object.entries(src.legend).map(([ch, L]) => [ch, L.ramp ? { ...L, ramp: flip[L.ramp] } : { ...L }]));
  r.next = src.next;
  r.grid = Array.from({ length: SIDE }, (_, j) => Array.from({ length: SIDE }, (_, i) => src.grid[i][j]));
  r.portSpecs = src.portSpecs.map((q) => ({ ...q, edge: edge[q.edge] })); r.ports = r.portSpecs.map((q) => q.edge + q.port);
  r.props = src.props.map((p) => ({ ...p, x: p.z, z: p.x, rot: (90 - p.rot + 360) % 360 }));
  return r;
}
