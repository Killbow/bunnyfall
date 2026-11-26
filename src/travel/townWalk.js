// @ts-check
// The gates of a walled city are covered cells on the town grid. Each open gate passage is carved into a copy of
// the grid (`gatePassage`, `carveNav`), and a closed gate carves nothing. A search runs only inside the grid piece
// where the traveller stands (`componentsOf`).
import { findTownPath } from '../systems/livingWorld/townPaths.js';

export const TOWN_PACE_MAX = 5;
export const TOWN_SNAP_CELLS = 8;
export const TOWN_EXIT_TRIES = 6;
export const TOWN_WAY_H_WEIGHT = 1.5;
export const GATE_REACH_CELLS = 24;
// The run keeps clear by the 0.35 m body capsule (about a fifth of a 1.6 m cell) and a little more, so it never
// grazes a footprint corner.
export const TOWN_WAY_MARGIN = 0.3;

const inb = (nav, x, y) => x >= 0 && y >= 0 && x < nav.width && y < nav.height;
const open = (nav, x, y) => inb(nav, x, y) && nav.weightAt(x, y) > 0;

export function snapCell(nav, cell, radius = TOWN_SNAP_CELLS, ok = null) {
  const [cx, cy] = cell;
  const take = (x, y) => open(nav, x, y) && (!ok || ok(x, y));
  if (take(cx, cy)) return [cx, cy];
  for (let r = 1; r <= radius; r++) {
    let best = null, bd = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !take(cx + dx, cy + dy)) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = [cx + dx, cy + dy]; }
      }
    }
    if (best) return best;
  }
  return null;
}

export function exitCells(nav, toward, max = TOWN_EXIT_TRIES, ok = null) {
  const out = [];
  const W = nav.width, H = nav.height;
  const add = (x, y) => { if (open(nav, x, y) && (!ok || ok(x, y))) out.push([x, y, (x - toward[0]) ** 2 + (y - toward[1]) ** 2]); };
  for (let x = 0; x < W; x++) { add(x, 0); if (H > 1) add(x, H - 1); }
  for (let y = 1; y < H - 1; y++) { add(0, y); if (W > 1) add(W - 1, y); }
  out.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  return out.slice(0, Math.max(0, max)).map(([x, y]) => [x, y]);
}

function squareGap(a, b, cx, cy) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const toSeg = (px, py) => { const u = l2 > 0 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2)) : 0; return Math.hypot(px - (a[0] + dx * u), py - (a[1] + dy * u)); };
  const toSq = (px, py) => Math.hypot(Math.max(0, Math.abs(px - cx) - 0.5), Math.max(0, Math.abs(py - cy) - 0.5));
  return Math.min(toSeg(cx - 0.5, cy - 0.5), toSeg(cx + 0.5, cy - 0.5), toSeg(cx - 0.5, cy + 0.5), toSeg(cx + 0.5, cy + 0.5), toSq(a[0], a[1]), toSq(b[0], b[1]));
}
export function clearLine(nav, a, b, margin = 0) {
  let x = a[0], y = a[1];
  const dx = Math.abs(b[0] - x), dy = Math.abs(b[1] - y), sx = Math.sign(b[0] - x), sy = Math.sign(b[1] - y);
  if (!open(nav, x, y)) return false;
  const walked = margin > 0 ? [[x, y]] : null;
  let e = dx - dy;
  for (let n = dx + dy; n > 0; n--) {
    const e2 = 2 * e;
    if (e2 > -dy && e2 < dx) {
      if (!open(nav, x + sx, y) || !open(nav, x, y + sy)) return false;
      x += sx; y += sy; e += dx - dy; n--;
    } else if (e2 > -dy) { x += sx; e -= dy; }
    else { y += sy; e += dx; }
    if (!open(nav, x, y)) return false;
    walked?.push([x, y]);
  }
  if (walked) {
    for (const [wx, wy] of walked) {
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (!open(nav, wx + ox, wy + oy) && squareGap(a, b, wx + ox, wy + oy) < margin) return false;
        }
      }
    }
  }
  return true;
}

export function simplifyWay(nav, cells, margin = TOWN_WAY_MARGIN) {
  if (!cells || cells.length <= 2) return cells ? cells.map((c) => [c[0], c[1]]) : [];
  const out = [[cells[0][0], cells[0][1]]];
  let i = 0;
  while (i < cells.length - 1) {
    let j = cells.length - 1;
    while (j > i + 1 && !clearLine(nav, cells[i], cells[j], margin)) j--;
    out.push([cells[j][0], cells[j][1]]);
    i = j;
  }
  return out;
}

/** @type {WeakMap<object, Int32Array>} */
const piecesOf = new WeakMap();
export function componentsOf(nav) {
  let label = piecesOf.get(nav);
  if (label && label.length === nav.width * nav.height) return label;
  const W = nav.width, H = nav.height;
  label = new Int32Array(W * H);
  const stack = new Int32Array(W * H);
  let next = 0;
  for (let i = 0; i < W * H; i++) {
    if (label[i] || !open(nav, i % W, (i / W) | 0)) continue;
    next++;
    let top = 0;
    stack[top++] = i; label[i] = next;
    while (top) {
      const c = stack[--top], x = c % W, y = (c / W) | 0;
      if (x + 1 < W && !label[c + 1] && open(nav, x + 1, y)) { label[c + 1] = next; stack[top++] = c + 1; }
      if (x > 0 && !label[c - 1] && open(nav, x - 1, y)) { label[c - 1] = next; stack[top++] = c - 1; }
      if (y + 1 < H && !label[c + W] && open(nav, x, y + 1)) { label[c + W] = next; stack[top++] = c + W; }
      if (y > 0 && !label[c - W] && open(nav, x, y - 1)) { label[c - W] = next; stack[top++] = c - W; }
    }
  }
  piecesOf.set(nav, label);
  return label;
}

/** @type {WeakMap<object, { edge: Set<number>, all: number }>} */
const edgesOf = new WeakMap();
export function edgePieces(nav) {
  let got = edgesOf.get(nav);
  if (got) return got;
  const label = componentsOf(nav), W = nav.width, H = nav.height;
  const edge = new Set();
  for (let x = 0; x < W; x++) { if (label[x]) edge.add(label[x]); if (label[(H - 1) * W + x]) edge.add(label[(H - 1) * W + x]); }
  for (let y = 0; y < H; y++) { if (label[y * W]) edge.add(label[y * W]); if (label[y * W + W - 1]) edge.add(label[y * W + W - 1]); }
  let all = 0;
  for (let i = 0; i < label.length; i++) if (label[i] > all) all = label[i];
  got = { edge, all };
  edgesOf.set(nav, got);
  return got;
}

export function gatePassage(nav, gate, reach = GATE_REACH_CELLS) {
  let best = null;
  for (const [dx, dy] of [[1, 0], [0, 1]]) {
    const end = (s) => { for (let k = 0; k <= reach; k++) { const x = gate[0] + dx * s * k, y = gate[1] + dy * s * k; if (!inb(nav, x, y)) return null; if (open(nav, x, y)) return k; } return null; };
    const a = end(1), b = end(-1);
    if (a == null || b == null || (a === 0 && b === 0)) continue;
    if (best && a + b >= best.span) continue;
    const cells = [];
    for (let k = -b + 1; k < a; k++) cells.push([gate[0] + dx * k, gate[1] + dy * k]);
    best = { span: a + b, cells };
  }
  return best ? best.cells : null;
}

// The town grid itself is never written, because its residents path over it. With nothing to carve, the town grid
// is returned as is.
export function carveNav(nav, passages) {
  const cells = (passages ?? []).flat();
  if (!cells.length) return nav;
  const W = nav.width, H = nav.height;
  const grid = new Uint8Array(W * H);
  if (nav.grid instanceof Uint8Array && nav.grid.length === W * H) grid.set(nav.grid);
  else for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) grid[y * W + x] = (nav.weightAt(x, y) & 15) << 4;
  for (const [x, y] of cells) if (inb(nav, x, y)) grid[y * W + x] = 15 << 4;
  // The low bits hold the walkers' occupancy flags, which belong to the town grid, so the copy clears them.
  for (let i = 0; i < W * H; i++) grid[i] &= 0xf0;
  return { width: W, height: H, grid, weightAt: (x, y) => (inb(nav, x, y) ? grid[y * W + x] >> 4 : 0) };
}

function nearestIn(nav, label, id, to) {
  const W = nav.width;
  let best = null, bd = Infinity;
  for (let i = 0; i < label.length; i++) {
    if (id ? label[i] !== id : !label[i]) continue;
    const x = i % W, y = (i / W) | 0, d = (x - to[0]) ** 2 + (y - to[1]) ** 2;
    if (d < bd) { bd = d; best = [x, y]; }
  }
  return best;
}

/**
 * @param {{ width: number, height: number, weightAt: (gx: number, gy: number) => number, grid?: Uint8Array }} nav
 * @param {number[]} from
 * @param {number[]} to
 * @returns {{ cells: number[][], inside: boolean, reached: boolean } | null}
 */
export function townWayCells(nav, from, to, { maxExpansions = nav.width * nav.height, hWeight = TOWN_WAY_H_WEIGHT } = {}) {
  const a = snapCell(nav, from);
  if (!a) return null;
  const label = componentsOf(nav), W = nav.width, id = label[a[1] * W + a[0]];
  const mine = (x, y) => label[y * W + x] === id;
  if (inb(nav, to[0], to[1])) {
    const b = snapCell(nav, to, TOWN_SNAP_CELLS, mine) ?? nearestIn(nav, label, id, to);
    const path = b ? findTownPath(nav, a, b, { maxExpansions, hWeight }) : null;
    const own = snapCell(nav, to) ?? nearestIn(nav, label, 0, to);
    return path ? { cells: simplifyWay(nav, path), inside: true, reached: !!own && mine(own[0], own[1]) } : null;
  }
  for (const exit of exitCells(nav, to, TOWN_EXIT_TRIES, mine)) {
    const path = findTownPath(nav, a, exit, { maxExpansions, hWeight });
    if (path) return { cells: simplifyWay(nav, path), inside: false, reached: true };
  }
  return null;
}
