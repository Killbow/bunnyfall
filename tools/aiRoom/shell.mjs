// AI-ROOMS: a room's SHELL - its floors, walls and ceilings - built from a grid of 1.6 m cells.
//
// A block is 51.2 m on a side, so 32 x 32 cells. A layer is 32 strings of 32 characters (row = z, column = x, north is
// row 0); a legend says what each character is:
//   { floor: 32.0, clear: 3.2, theme: 120 }            a flat floor `floor` metres up, `clear` metres of headroom
//   { ramp: '+x', clear: 3.2, theme: 120 }             a slope rising towards +x (or -x, +z, -z) between the floors at
//                                                       the two ends of its run of the same character
//   anything else (' ', '#', unlisted)                 solid
// `tex` ({ floor, wall, ceil } as 'archive_record') overrides a theme's pictures for that character.
//
// Walls are made where an open cell meets solid, or meets an open cell it cannot be walked or seen into (a riser, a
// lintel). Only the side facing the open cell is drawn, so a wall between two rooms is one solid cell (1.6 m) or more.
//
// DOORS: the classic ports (see PORTS) sit on every edge at 16.0 m (A, floor 32.0) and 35.2 m (B, floor 12.8), each a
// 1.2 m door in a 3.2 m corridor. A port the room uses gets a hole in the outer wall for its door.

import { Mesh } from './mesh.mjs';

export const CELL = 1.6, SIDE = 32;
export const THEMES = Object.freeze({
  120: { wall: '120_0', floor: '120_2', ceil: '120_3' },
  122: { wall: '122_0', floor: '122_2', ceil: '122_4' },
  123: { wall: '123_0', floor: '123_2', ceil: '123_3' },
  124: { wall: '124_0', floor: '124_2', ceil: '124_3' },
});
export const PORTS = Object.freeze({ A: { at: 16.0, floor: 32.0 }, B: { at: 35.2, floor: 12.8 } });
export const DOOR_W = 1.2, DOOR_H = 2.25, T = 3.2;
const SIDES = [   // N, E, S, W: this cell's corner indexes, the neighbour's, the step to it, the inward normal
  { name: 'N', a: 0, b: 1, na: 3, nb: 2, di: 0, dj: -1, n: [0, 0, 1] },
  { name: 'E', a: 1, b: 2, na: 0, nb: 3, di: 1, dj: 0, n: [-1, 0, 0] },
  { name: 'S', a: 2, b: 3, na: 1, nb: 0, di: 0, dj: 1, n: [0, 0, -1] },
  { name: 'W', a: 3, b: 0, na: 2, nb: 1, di: -1, dj: 0, n: [1, 0, 0] },
];
const DIRS = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };

/** The cells of one layer: null where solid, else { i, j, h: [4 floor heights NW NE SE SW], clear, tex, flat }. */
export function parseLayer(grid, legend) {
  if (grid.length !== SIDE || grid.some((r) => r.length !== SIDE)) throw new Error(`a layer is ${SIDE} rows of ${SIDE} characters`);
  const at = (i, j) => (i < 0 || j < 0 || i >= SIDE || j >= SIDE ? null : legend[grid[j][i]] ?? null);
  const cells = Array.from({ length: SIDE }, () => new Array(SIDE).fill(null));
  for (let j = 0; j < SIDE; j++) for (let i = 0; i < SIDE; i++) {
    const L = at(i, j), ch = grid[j][i];
    if (!L) continue;
    const theme = THEMES[L.theme ?? 120];
    if (!theme) throw new Error(`no theme ${L.theme}`);
    const tex = { ...theme, ...(L.tex ?? {}) };
    if (L.floor != null) { cells[j][i] = { i, j, h: [L.floor, L.floor, L.floor, L.floor], clear: L.clear ?? T, tex, flat: true, rail: !!L.rail, edgeRail: L.edge === 'rail', ends: L.ends ?? '' }; continue; }
    if (!L.ramp || !DIRS[L.ramp]) throw new Error(`legend '${ch}': a floor or a ramp`);
    const [di, dj] = DIRS[L.ramp];
    let lo = 0; while (grid[j - dj * (lo + 1)]?.[i - di * (lo + 1)] === ch) lo++;   // cells of the run below this one
    let hi = 0; while (grid[j + dj * (hi + 1)]?.[i + di * (hi + 1)] === ch) hi++;
    const n = lo + hi + 1, below = at(i - di * (lo + 1), j - dj * (lo + 1)), above = at(i + di * (hi + 1), j + dj * (hi + 1));
    if (below?.floor == null || above?.floor == null) throw new Error(`ramp '${ch}' at ${i},${j}: a flat floor at each end of its run`);
    const e0 = below.floor + ((above.floor - below.floor) * lo) / n, e1 = below.floor + ((above.floor - below.floor) * (lo + 1)) / n;
    // corners NW NE SE SW; the low edge is at the cell's -dir side
    const h = [0, 0, 0, 0];
    const setEdge = (cornerIdx, v) => { for (const c of cornerIdx) h[c] = v; };
    if (L.ramp === '+x') { setEdge([0, 3], e0); setEdge([1, 2], e1); }
    else if (L.ramp === '-x') { setEdge([1, 2], e0); setEdge([0, 3], e1); }
    else if (L.ramp === '+z') { setEdge([0, 1], e0); setEdge([2, 3], e1); }
    else setEdge([2, 3], e0), setEdge([0, 1], e1);
    cells[j][i] = { i, j, h, clear: L.clear ?? T, tex, flat: false, rail: !!L.rail, edgeRail: L.edge === 'rail', ends: L.ends ?? '' };
  }
  return cells;
}

const corner = (cell, k) => [(cell.i + (k === 1 || k === 2 ? 1 : 0)) * CELL, (cell.j + (k === 2 || k === 3 ? 1 : 0)) * CELL];
const portCells = (edge, port) => { const c = PORTS[port].at / CELL; return [c - 1, c]; };   // the two cells a 3.2 m port spans
/** Is cell (i,j) on the outer wall at `edge` one of port `port`'s cells? */
export const isPortCell = (edge, port, i, j) => {
  const [p, q] = portCells(edge, port);
  if (edge === 'N') return j === 0 && (i === p || i === q);
  if (edge === 'S') return j === SIDE - 1 && (i === p || i === q);
  if (edge === 'W') return i === 0 && (j === p || j === q);
  return i === SIDE - 1 && (j === p || j === q);
};

/** Layers -> a Mesh. `ports` is a list like ['NA','SB'] (edge + port) the room uses: each leaves a door hole. */
export function buildShell(layers, legend, ports = []) {
  const mesh = new Mesh(), parsed = layers.map((g) => parseLayer(g, legend));
  const holes = new Map();   // 'N' -> [{ at, floor }]
  for (const p of ports) { const [edge, port] = [p[0], p[1]]; (holes.get(edge) ?? holes.set(edge, []).get(edge)).push(PORTS[port]); }
  for (const [li, cells] of parsed.entries()) {
    // floors and ceilings: flat cells merge into rectangles, slopes stand alone
    const rectsOf = (keyOf) => {
      const done = new Set(), out = [];
      for (let j = 0; j < SIDE; j++) for (let i = 0; i < SIDE; i++) {
        const c = cells[j][i], k = c?.flat ? keyOf(c) : null;
        if (!k || done.has(`${i},${j}`)) continue;
        let w = 1; while (i + w < SIDE && cells[j][i + w]?.flat && keyOf(cells[j][i + w]) === k && !done.has(`${i + w},${j}`)) w++;
        let h = 1;
        grow: for (; j + h < SIDE; h++) { for (let x = 0; x < w; x++) { const d = cells[j + h][i + x]; if (!d?.flat || keyOf(d) !== k || done.has(`${i + x},${j + h}`)) break grow; } }
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) done.add(`${i + x},${j + y}`);
        out.push({ i, j, w, h, c });
      }
      return out;
    };
    for (const { i, j, w, h, c } of rectsOf((c) => `${c.tex.floor}|${c.h[0]}`)) {
      const x0 = i * CELL, x1 = (i + w) * CELL, z0 = j * CELL, z1 = (j + h) * CELL, y = c.h[0];
      mesh.quad(c.tex.floor, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [[x0 / T, -z0 / T], [x1 / T, -z0 / T], [x1 / T, -z1 / T], [x0 / T, -z1 / T]], [0, 1, 0]);
      if (li > 0) mesh.quad(c.tex.ceil, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [[x0 / T, -z0 / T], [x1 / T, -z0 / T], [x1 / T, -z1 / T], [x0 / T, -z1 / T]], [0, -1, 0]);   // a floor over another room is a ceiling to the one below
    }
    for (const { i, j, w, h, c } of rectsOf((c) => `${c.tex.ceil}|${c.h[0] + c.clear}`)) {
      const x0 = i * CELL, x1 = (i + w) * CELL, z0 = j * CELL, z1 = (j + h) * CELL, y = c.h[0] + c.clear;
      mesh.quad(c.tex.ceil, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [[x0 / T, -z0 / T], [x1 / T, -z0 / T], [x1 / T, -z1 / T], [x0 / T, -z1 / T]], [0, -1, 0]);
    }
    const walls = new Map();   // flat wall runs, merged: key -> [[a, b], ...] along the wall
    const flatWall = (side, line, y0, y1, a, b, tex, n) => { const k = `${side}|${line}|${y0}|${y1}|${tex}`; if (!walls.has(k)) walls.set(k, { side, line, y0, y1, tex, n, runs: [] }); walls.get(k).runs.push([a, b]); };
    for (let j = 0; j < SIDE; j++) for (let i = 0; i < SIDE; i++) {
      const c = cells[j][i];
      if (!c) continue;
      for (const s of SIDES) {
        const nb = cells[j + s.dj]?.[i + s.di] ?? null, outer = i + s.di < 0 || j + s.dj < 0 || i + s.di >= SIDE || j + s.dj >= SIDE;
        const pa = corner(c, s.a), pb = corner(c, s.b);
        const f = [c.h[s.a], c.h[s.b]], ce = [f[0] + c.clear, f[1] + c.clear];
        let lo = [ce[0], ce[1]], hi = [ce[0], ce[1]];   // solid across: the whole wall is the bottom region
        if (nb) {
          const g = [nb.h[s.na], nb.h[s.nb]], d = [g[0] + nb.clear, g[1] + nb.clear];
          lo = [Math.max(f[0], g[0]), Math.max(f[1], g[1])]; hi = [Math.min(ce[0], d[0]), Math.min(ce[1], d[1])];
          if (hi[0] - lo[0] < 1.0 || hi[1] - lo[1] < 1.0) { lo = [ce[0], ce[1]]; hi = [ce[0], ce[1]]; }   // too low to pass: a wall
        }
        if (!nb && !outer && c.ends.includes(s.name)) continue;   // a catwalk's end: nothing drawn, the way on
        if (!nb && !outer && c.edgeRail) {   // an open edge with nothing beyond (a catwalk's side): a parapet, not a wall
          const vert = s.name === 'N' || s.name === 'S', aA = vert ? pa[0] : pa[1], aB = vert ? pb[0] : pb[1], ln = vert ? pa[1] : pa[0];
          const at2 = (axis, y) => (vert ? [axis, y, ln] : [ln, y, axis]);
          for (const n2 of [s.n, s.n.map((q) => -q)]) mesh.quad(c.tex.wall, [at2(aA, f[0]), at2(aB, f[1]), at2(aB, f[1] + 1.1), at2(aA, f[0] + 1.1)], [[aA / T, -1.1 / T], [aB / T, -1.1 / T], [aB / T, 0], [aA / T, 0]], n2);
          continue;
        }
        // a RAIL: a low parapet along an open edge that drops away more than 1.5 m (so nothing walks or falls off by accident)
        if (c.rail && nb) {
          const g2 = [nb.h[s.na], nb.h[s.nb]];
          if (f[0] - g2[0] > 1.5 || f[1] - g2[1] > 1.5) {
            const vert = s.name === 'N' || s.name === 'S', aA = vert ? pa[0] : pa[1], aB = vert ? pb[0] : pb[1], ln = vert ? pa[1] : pa[0];
            const at2 = (axis, y) => (vert ? [axis, y, ln] : [ln, y, axis]);
            for (const n2 of [s.n, s.n.map((q) => -q)]) mesh.quad(c.tex.wall, [at2(aA, f[0]), at2(aB, f[1]), at2(aB, f[1] + 1.1), at2(aA, f[0] + 1.1)], [[aA / T, -1.1 / T], [aB / T, -1.1 / T], [aB / T, 0], [aA / T, 0]], n2);
          }
        }
        const regions = [];   // [y0 at a, y0 at b, y1 at a, y1 at b]
        if (lo[0] - f[0] > 0.02 || lo[1] - f[1] > 0.02) regions.push([f[0], f[1], lo[0], lo[1]]);
        if (ce[0] - hi[0] > 0.02 || ce[1] - hi[1] > 0.02) regions.push([hi[0], hi[1], ce[0], ce[1]]);
        const vertical = s.name === 'N' || s.name === 'S', axisA = vertical ? pa[0] : pa[1], axisB = vertical ? pb[0] : pb[1], line = vertical ? pa[1] : pa[0];
        const tex = c.tex.wall;
        for (const [a0, b0, a1, b1] of regions) {
          // a door hole: a port this room uses, in the outer wall, at this cell's floor
          const hs = outer && !nb ? (holes.get(s.name) ?? []).filter((p) => Math.min(axisA, axisB) < p.at + DOOR_W / 2 && Math.max(axisA, axisB) > p.at - DOOR_W / 2) : [];
          if (hs.length && c.flat && a0 === f[0] && Math.abs(f[0] - hs[0].floor) < 1e-6) {
            const lo2 = Math.min(axisA, axisB), hi2 = Math.max(axisA, axisB), p = hs[0], h0 = p.at - DOOR_W / 2, h1 = p.at + DOOR_W / 2;
            if (lo2 < h0) flatWall(s.name, line, a0, b1, lo2, Math.min(hi2, h0), tex, s.n);
            if (hi2 > h1) flatWall(s.name, line, a0, b1, Math.max(lo2, h1), hi2, tex, s.n);
            if (b1 > a0 + DOOR_H) flatWall(s.name, line, a0 + DOOR_H, b1, Math.max(lo2, h0), Math.min(hi2, h1), tex, s.n);
            continue;
          }
          if (a0 === b0 && a1 === b1) { flatWall(s.name, line, a0, a1, Math.min(axisA, axisB), Math.max(axisA, axisB), tex, s.n); continue; }
          const at = (axis, k) => (vertical ? [axis, k, line] : [line, k, axis]);
          mesh.quad(tex, [at(axisA, a0), at(axisB, b0), at(axisB, b1), at(axisA, a1)], [[axisA / T, (a0 - ce[0]) / T], [axisB / T, (b0 - ce[1]) / T], [axisB / T, (b1 - ce[1]) / T], [axisA / T, (a1 - ce[0]) / T]], s.n);
        }
      }
    }
    for (const w of walls.values()) {
      const vertical = w.side === 'N' || w.side === 'S', runs = w.runs.sort((p, q) => p[0] - q[0]), merged = [];
      for (const r of runs) { const last = merged[merged.length - 1]; if (last && r[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], r[1]); else merged.push([...r]); }
      for (const [a, b] of merged) {
        const at = (axis, y) => (vertical ? [axis, y, w.line] : [w.line, y, axis]);
        mesh.quad(w.tex, [at(a, w.y0), at(b, w.y0), at(b, w.y1), at(a, w.y1)], [[a / T, (w.y0 - w.y1) / T], [b / T, (w.y0 - w.y1) / T], [b / T, 0], [a / T, 0]], w.n);
      }
    }
    // sloped cells' floors and ceilings
    for (let j = 0; j < SIDE; j++) for (let i = 0; i < SIDE; i++) {
      const c = cells[j][i];
      if (!c || c.flat) continue;
      const P = (k, dy = 0) => { const [x, z] = corner(c, k); return [x, c.h[k] + dy, z]; }, uv = (k) => { const [x, z] = corner(c, k); return [x / T, -z / T]; };
      mesh.quad(c.tex.floor, [P(0), P(1), P(2), P(3)], [uv(0), uv(1), uv(2), uv(3)], [0, 1, 0]);
      if (li > 0) mesh.quad(c.tex.ceil, [P(0), P(1), P(2), P(3)], [uv(0), uv(1), uv(2), uv(3)], [0, -1, 0]);
      mesh.quad(c.tex.ceil, [P(0, c.clear), P(1, c.clear), P(2, c.clear), P(3, c.clear)], [uv(0), uv(1), uv(2), uv(3)], [0, -1, 0]);
    }
  }
  return { mesh, layers: parsed };
}
