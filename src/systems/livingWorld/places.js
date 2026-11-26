// @ts-check
import { NAV_CELL, HALF_CELL } from '../../world/cityNavigation.js';
import { BUILDING_TYPES } from '../../world/buildingNames.js';
import { hasShopJob } from './census.js';

export const DOOR_REACH_M = [0.9, 1.6, 2.4, 3.2, 4.0];
export const DOOR_RING = 4;
export const SOCIAL_OUT = 4;
export const MARKET_OUT = 2;
export const SQUARE_WINDOW = 3;
export const SQUARE_STRIDE = 3;
export const SQUARE_REACH = 14;
export const SQUARE_GAP = 6;
export const SQUARE_OPEN = 0.75;
export const SQUARE_POINTS = 5;
export const CORNER_MARGIN = 6;
export const CORNER_OPEN = 0.6;
export const CORNER_GAP = 16;
// Matches `NAV_CELLS_PER_BLOCK` in cityNavigation.js.
const BLOCK_CELLS = 64;

/** @type {Set<number>} */
const SOCIAL_TYPES = new Set([BUILDING_TYPES.Tavern, BUILDING_TYPES.Temple, BUILDING_TYPES.GuildHall, BUILDING_TYPES.Palace]);

/**
 * @typedef {{ key: string, kind: 'door'|'social'|'square'|'corner'|'market'|'dock'|'exit', cell: number[], x: number, z: number, yaw: number, building?: number, side?: 'n'|'s'|'e'|'w' }} Spot
 * @typedef {{ doors: Map<number, Spot>, square: Spot|null, squares: Spot[], corners: Spot[], social: Spot[], market: Spot[], dock: Spot[], exits: Spot[], types: Map<number, number>, factions: Map<number, number>, net: Int32Array, netId: number }} Places
 */

/** @param {{ width: number, height: number, weightAt: (gx: number, gy: number) => number }} nav */
export function streetNet(nav) {
  const W = nav.width, H = nav.height;
  const label = new Int32Array(W * H);
  const stack = new Int32Array(W * H);
  // The nav grid stores each cell's walk weight in the high nibble of its byte (cityNavigation.js).
  const grid = /** @type {any} */ (nav).grid;
  const walk = new Uint8Array(W * H);
  if (grid instanceof Uint8Array && grid.length === W * H) for (let i = 0; i < W * H; i++) walk[i] = grid[i] >> 4 > 0 ? 1 : 0;
  else for (let i = 0; i < W * H; i++) walk[i] = nav.weightAt(i % W, (i / W) | 0) > 0 ? 1 : 0;
  let next = 0, best = 0, bestSize = 0;
  for (let i = 0; i < W * H; i++) {
    if (label[i] || !walk[i]) continue;
    const id = ++next;
    let sp = 0, size = 0;
    stack[sp++] = i; label[i] = id;
    while (sp > 0) {
      const c = stack[--sp];
      size++;
      const x = c % W, y = (c / W) | 0;
      if (x > 0 && !label[c - 1] && walk[c - 1]) { label[c - 1] = id; stack[sp++] = c - 1; }
      if (x < W - 1 && !label[c + 1] && walk[c + 1]) { label[c + 1] = id; stack[sp++] = c + 1; }
      if (y > 0 && !label[c - W] && walk[c - W]) { label[c - W] = id; stack[sp++] = c - W; }
      if (y < H - 1 && !label[c + W] && walk[c + W]) { label[c + W] = id; stack[sp++] = c + W; }
    }
    if (size > bestSize) { bestSize = size; best = id; }
  }
  return { label, id: best, size: bestSize };
}

/**
 * @param {{ width: number, height: number }} nav
 * @param {(i: number) => boolean} ok
 * @param {number} x
 * @param {number} z
 * @param {number} ring
 */
function nearestCell(nav, ok, x, z, ring) {
  const W = nav.width, H = nav.height;
  const gx = Math.floor(x / NAV_CELL), gy = Math.floor(z / NAV_CELL);
  for (let r = 0; r <= ring; r++) {
    let best = null, bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cx = gx + dx, cy = gy + dy;
        if (cx < 0 || cy < 0 || cx >= W || cy >= H || !ok(cy * W + cx)) continue;
        const d = Math.hypot(cx * NAV_CELL + HALF_CELL - x, cy * NAV_CELL + HALF_CELL - z);
        if (d < bestD) { bestD = d; best = [cx, cy]; }
      }
    }
    if (best) return best;
  }
  return null;
}

/**
 * @param {{ width: number, height: number }} nav
 * @param {Int32Array} net
 * @param {number} netId
 * @param {number} x
 * @param {number} z
 * @param {number} ring
 */
export function nearestNetCell(nav, net, netId, x, z, ring) {
  return nearestCell(nav, (i) => net[i] === netId, x, z, ring);
}

/**
 * Some door models have an inward normal, so the opposite direction is tried as well.
 * @param {{ width: number, height: number }} nav
 * @param {{ x: number, z: number, nx: number, nz: number }} d
 * @param {(i: number) => boolean} ok
 * @returns {{ cell: number[], nx: number, nz: number } | null}
 */
function doorCell(nav, d, ok) {
  const W = nav.width, H = nav.height;
  const nl = Math.hypot(d.nx, d.nz) || 1;
  const nx = d.nx / nl, nz = d.nz / nl;
  for (const sign of [1, -1]) {
    for (const m of DOOR_REACH_M) {
      const cx = Math.floor((d.x + sign * nx * m) / NAV_CELL), cy = Math.floor((d.z + sign * nz * m) / NAV_CELL);
      if (cx >= 0 && cy >= 0 && cx < W && cy < H && ok(cy * W + cx)) return { cell: [cx, cy], nx: nx * sign, nz: nz * sign };
    }
  }
  const cell = nearestCell(nav, ok, d.x + nx * 1.6, d.z + nz * 1.6, DOOR_RING);
  return cell ? { cell, nx, nz } : null;
}

/**
 * Gate models close a walled city's passages, so the fields outside are often the largest component; the street net
 * is the component most buildings' doors open onto.
 * @param {{ width: number, height: number }} nav
 * @param {readonly { key: number, x: number, z: number, nx: number, nz: number }[]} doors
 * @param {{ label: Int32Array, id: number }} streets
 * @returns {number}
 */
export function doorsNet(nav, doors, streets) {
  const { label } = streets;
  /** @type {Map<number, Set<number>>} */
  const opens = new Map();
  for (const d of doors) {
    const at = doorCell(nav, d, (i) => label[i] > 0);
    if (!at) continue;
    const id = label[at.cell[1] * nav.width + at.cell[0]];
    const keys = opens.get(id) ?? new Set();
    keys.add(d.key);
    opens.set(id, keys);
  }
  if (!opens.size) return streets.id;
  const size = new Map([...opens.keys()].map((id) => [id, 0]));
  for (let i = 0; i < label.length; i++) { const n = size.get(label[i]); if (n !== undefined) size.set(label[i], n + 1); }
  let best = 0, bestKeys = -1, bestSize = -1;
  for (const [id, keys] of [...opens].sort((a, b) => a[0] - b[0])) {
    const n = /** @type {number} */ (size.get(id));
    if (keys.size > bestKeys || (keys.size === bestKeys && n > bestSize)) { best = id; bestKeys = keys.size; bestSize = n; }
  }
  return best;
}

const centre = (c) => [c[0] * NAV_CELL + HALF_CELL, c[1] * NAV_CELL + HALF_CELL];
const yawTo = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz);

// A berth often lies 80 m or more off the shore, so the search ring is wide.
export const HARBOUR_RING = 120;

export const STAND_REACH_M = 0.4;

// Shrinks the grown cell bounds slightly so a body's own steps along a clear way are never refused for float
// rounding.
const STREET_SLACK = 1e-6;

/** @typedef {{ holds: (x: number, z: number) => boolean, reach: (ax: number, az: number, bx: number, bz: number) => number, clear: (ax: number, az: number, bx: number, bz: number) => boolean }} Street */

/**
 * Exact slab test against off-net cells grown by `reach`, so any part of a clear way is also clear and a walker
 * re-checking each step gets a stable answer.
 * @param {{ width: number, height: number }} nav
 * @param {{ net: Int32Array, netId: number }} places
 * @param {number} [reach]
 * @returns {Street}
 */
export function streetGeometry(nav, places, reach = STAND_REACH_M) {
  const W = nav.width, H = nav.height, C = NAV_CELL, net = places.net, id = places.netId;
  const r = reach - STREET_SLACK;
  const enter = (/** @type {number} */ ax, /** @type {number} */ az, /** @type {number} */ bx, /** @type {number} */ bz) => {
    const dx = bx - ax, dz = bz - az;
    const x0 = Math.floor((Math.min(ax, bx) - reach) / C), x1 = Math.floor((Math.max(ax, bx) + reach) / C);
    const y0 = Math.floor((Math.min(az, bz) - reach) / C), y1 = Math.floor((Math.max(az, bz) + reach) / C);
    let first = Infinity;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (cx >= 0 && cy >= 0 && cx < W && cy < H && net[cy * W + cx] === id) continue;
        let lo = 0, hi = 1;
        const lx = cx * C - r, hx = (cx + 1) * C + r, lz = cy * C - r, hz = (cy + 1) * C + r;
        if (dx === 0) { if (!(ax > lx && ax < hx)) continue; } else {
          const ta = (lx - ax) / dx, tb = (hx - ax) / dx;
          lo = Math.max(lo, Math.min(ta, tb)); hi = Math.min(hi, Math.max(ta, tb));
        }
        if (dz === 0) { if (!(az > lz && az < hz)) continue; } else {
          const ta = (lz - az) / dz, tb = (hz - az) / dz;
          lo = Math.max(lo, Math.min(ta, tb)); hi = Math.min(hi, Math.max(ta, tb));
        }
        if (lo < hi && lo < first) first = lo;
      }
    }
    return first;
  };
  return {
    holds: (x, z) => enter(x, z, x, z) === Infinity,
    reach: (ax, az, bx, bz) => Math.hypot(bx - ax, bz - az) * Math.min(1, enter(ax, az, bx, bz)),
    clear: (ax, az, bx, bz) => enter(ax, az, bx, bz) === Infinity,
  };
}

/**
 * @param {{ width: number, height: number }} nav
 * @param {{ net: Int32Array, netId: number }} places
 * @param {number} x
 * @param {number} z
 * @returns {Spot|null}
 */
export function harbourDock(nav, places, x, z) {
  const c = nearestNetCell(nav, places.net, places.netId, x, z, HARBOUR_RING);
  if (!c) return null;
  const [cx, cz] = centre(c);
  return { key: 'dharbour', kind: 'dock', cell: c, x: cx, z: cz, yaw: yawTo(cx, cz, x, z) };
}

/**
 * @param {{ width: number, height: number, weightAt: (gx: number, gy: number) => number }} nav
 * @param {readonly { key: number, x: number, z: number, nx: number, nz: number }[]} doors
 * @param {readonly { key: number, type: number, factionId?: number }[]} buildings
 * @returns {Places}
 */
export function townPlaces(nav, doors, buildings) {
  const W = nav.width, H = nav.height;
  const types = new Map((buildings ?? []).map((b) => [b.key, b.type]));
  const factions = new Map((buildings ?? []).map((b) => [b.key, b.factionId ?? 0]));
  const ordered = [...(doors ?? [])].filter((d) => Number.isFinite(d.x) && Number.isFinite(d.z)).sort((a, b) => a.key - b.key || a.x - b.x || a.z - b.z);
  const streets = streetNet(nav);
  const net = streets.label, netId = doorsNet(nav, ordered, streets);
  /** @type {Map<number, Spot>} */
  const doorSpots = new Map();
  /** @type {Map<number, { x: number, z: number, nx: number, nz: number }>} */
  const doorOf = new Map();
  for (const d of ordered) {
    if (doorSpots.has(d.key)) continue;
    const at = doorCell(nav, d, (i) => net[i] === netId);
    if (!at) continue;
    const [x, z] = centre(at.cell);
    doorSpots.set(d.key, { key: `d${d.key}`, kind: 'door', cell: at.cell, x, z, yaw: yawTo(x, z, d.x, d.z), building: d.key });
    doorOf.set(d.key, { x: d.x, z: d.z, nx: at.nx, nz: at.nz });
  }
  const before = (key, out, kind) => {
    const door = doorSpots.get(key), d = doorOf.get(key);
    if (!door || !d) return null;
    const c = nearestNetCell(nav, net, netId, door.x + d.nx * out * NAV_CELL, door.z + d.nz * out * NAV_CELL, 2) ?? door.cell;
    const [x, z] = centre(c);
    return /** @type {Spot} */ ({ key: `${kind[0]}${key}`, kind, cell: c, x, z, yaw: yawTo(x, z, door.x, door.z), building: key });
  };
  const social = [], market = [], dock = [];
  for (const key of [...doorSpots.keys()].sort((a, b) => a - b)) {
    const t = types.get(key);
    if (SOCIAL_TYPES.has(t)) { const s = before(key, SOCIAL_OUT, 'social'); if (s) social.push(s); }
    else if (hasShopJob(t)) { const s = before(key, MARKET_OUT, 'market'); if (s) market.push(s); }
    else if (t === BUILDING_TYPES.Ship) { const s = before(key, MARKET_OUT, 'dock'); if (s) dock.push(s); }
  }
  const W1 = W + 1, sums = new Int32Array(W1 * (H + 1));
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) { row += net[y * W + x] === netId ? 1 : 0; sums[(y + 1) * W1 + x + 1] = sums[y * W1 + x + 1] + row; }
  }
  const openIn = (x0, y0, x1, y1) => sums[(y1 + 1) * W1 + x1 + 1] - sums[y0 * W1 + x1 + 1] - sums[(y1 + 1) * W1 + x0] + sums[y0 * W1 + x0];
  let square = null, bestOpen = -1, bestD = Infinity;
  const mx = W / 2, my = H / 2, reach = Math.max(W, H) * 0.35;
  for (let y = SQUARE_WINDOW; y < H - SQUARE_WINDOW; y += SQUARE_STRIDE) {
    for (let x = SQUARE_WINDOW; x < W - SQUARE_WINDOW; x += SQUARE_STRIDE) {
      if (net[y * W + x] !== netId) continue;
      const d = Math.hypot(x - mx, y - my);
      if (d > reach) continue;
      const open = openIn(x - SQUARE_WINDOW, y - SQUARE_WINDOW, x + SQUARE_WINDOW, y + SQUARE_WINDOW);
      if (open > bestOpen || (open === bestOpen && d < bestD)) { bestOpen = open; bestD = d; square = [x, y]; }
    }
  }
  /** @type {Spot|null} */
  let squareSpot = null;
  /** @type {Spot[]} */
  const squares = [];
  if (square) {
    const [x, z] = centre(square);
    squareSpot = { key: 'sq', kind: 'square', cell: square, x, z, yaw: 0 };
    social.unshift(squareSpot);
    squares.push(squareSpot);
    const [sx, sy] = square;
    /** @type {{ x: number, y: number, open: number, d: number }[]} */
    const near = [];
    for (let y = Math.max(SQUARE_WINDOW, sy - SQUARE_REACH); y <= Math.min(H - 1 - SQUARE_WINDOW, sy + SQUARE_REACH); y++) {
      for (let cx = Math.max(SQUARE_WINDOW, sx - SQUARE_REACH); cx <= Math.min(W - 1 - SQUARE_WINDOW, sx + SQUARE_REACH); cx++) {
        const d = Math.hypot(cx - sx, y - sy);
        if (d > SQUARE_REACH || net[y * W + cx] !== netId) continue;
        const open = openIn(cx - SQUARE_WINDOW, y - SQUARE_WINDOW, cx + SQUARE_WINDOW, y + SQUARE_WINDOW);
        if (open >= SQUARE_OPEN * bestOpen) near.push({ x: cx, y, open, d });
      }
    }
    near.sort((a, b) => b.open - a.open || a.d - b.d || a.y - b.y || a.x - b.x);
    for (const c of near) {
      if (squares.length >= SQUARE_POINTS) break;
      if (squares.some((s) => Math.hypot(s.cell[0] - c.x, s.cell[1] - c.y) < SQUARE_GAP)) continue;
      if (!netLine(net, netId, W, square, [c.x, c.y])) continue;
      const [px, pz] = centre([c.x, c.y]);
      squares.push({ key: `sq${squares.length}`, kind: 'square', cell: [c.x, c.y], x: px, z: pz, yaw: 0 });
    }
  }
  /** @type {Spot[]} */
  const corners = [];
  if (square) {
    /** @type {{ x: number, y: number, open: number, bx: number, by: number }[]} */
    const best = [];
    for (let by = 0; by * BLOCK_CELLS < H; by++) {
      for (let bx = 0; bx * BLOCK_CELLS < W; bx++) {
        let top = null;
        for (let y = Math.max(SQUARE_WINDOW, by * BLOCK_CELLS + CORNER_MARGIN); y < Math.min(H - SQUARE_WINDOW, (by + 1) * BLOCK_CELLS - CORNER_MARGIN); y++) {
          for (let x = Math.max(SQUARE_WINDOW, bx * BLOCK_CELLS + CORNER_MARGIN); x < Math.min(W - SQUARE_WINDOW, (bx + 1) * BLOCK_CELLS - CORNER_MARGIN); x++) {
            if (net[y * W + x] !== netId) continue;
            const open = openIn(x - SQUARE_WINDOW, y - SQUARE_WINDOW, x + SQUARE_WINDOW, y + SQUARE_WINDOW);
            if (!top || open > top.open) top = { x, y, open, bx, by };
          }
        }
        if (top && top.open >= CORNER_OPEN * bestOpen) best.push(top);
      }
    }
    best.sort((a, b) => b.open - a.open || a.by - b.by || a.bx - b.bx);
    const taken = [...social, ...squares].map((s) => s.cell);
    for (const c of best) {
      if (taken.some((t) => Math.hypot(t[0] - c.x, t[1] - c.y) < CORNER_GAP)) continue;
      const [px, pz] = centre([c.x, c.y]);
      corners.push({ key: `c${c.bx}.${c.by}`, kind: 'corner', cell: [c.x, c.y], x: px, z: pz, yaw: 0 });
      taken.push([c.x, c.y]);
    }
  }
  const SIDES = /** @type {const} */ (['n', 's', 'e', 'w']);
  /**
   * @param {number} k
   * @param {number} i
   * @param {number} j
   */
  const cellOf = (k, i, j) => (k < 2 ? [j, i] : [i, j]);
  const exits = [];
  for (let k = 0; k < 4; k++) {
    const side = SIDES[k];
    const lines = k < 2 ? H : W, along = k < 2 ? W : H, half = k < 2 ? W / 2 : H / 2;
    let best = null;
    for (let n = 0; n < lines && !best; n++) {
      const i = k === 0 ? H - 1 - n : k === 1 ? n : k === 2 ? W - 1 - n : n;
      let bestMid = Infinity;
      for (let j = 0; j < along; j++) {
        const [x, y] = cellOf(k, i, j);
        if (net[y * W + x] !== netId) continue;
        const mid = Math.abs(j - half);
        if (mid < bestMid) { bestMid = mid; best = [x, y]; }
      }
    }
    if (!best) continue;
    const [x, z] = centre(best);
    const yaw = side === 'n' ? 0 : side === 's' ? Math.PI : side === 'e' ? Math.PI / 2 : -Math.PI / 2;
    exits.push(/** @type {Spot} */ ({ key: `x${side}`, kind: 'exit', cell: best, x, z, yaw, side }));
  }
  return { doors: doorSpots, square: squareSpot, squares, corners, social, market, dock, exits, types, factions, net, netId };
}

/**
 * @param {Int32Array} net
 * @param {number} netId
 * @param {number} W
 * @param {number[]} a
 * @param {number[]} b
 */
function netLine(net, netId, W, a, b) {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 4));
  for (let i = 0; i <= n; i++) {
    const x = Math.floor(a[0] + 0.5 + ((b[0] - a[0]) * i) / n), y = Math.floor(a[1] + 0.5 + ((b[1] - a[1]) * i) / n);
    if (net[y * W + x] !== netId) return false;
  }
  return true;
}

/**
 * @param {Places} places
 * @param {number} yaw
 */
export function exitToward(places, yaw) {
  let best = null, bestD = Infinity;
  for (const e of places.exits) {
    const d = Math.abs(Math.atan2(Math.sin(e.yaw - yaw), Math.cos(e.yaw - yaw)));
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

/**
 * @param {Places} places
 * @param {number[]} cell
 */
export function exitNearest(places, cell) {
  let best = null, bestD = Infinity;
  for (const e of places.exits) {
    const d = Math.abs(e.cell[0] - cell[0]) + Math.abs(e.cell[1] - cell[1]);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}
