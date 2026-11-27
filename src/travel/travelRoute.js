// @ts-check
// A step from pixel A to neighbour B is on a road only when A carries the edge toward B and B carries the edge
// back. This planner walks roads; `route()` in world/roadNetwork.js lays them. Both share `DIR_DELTA`.
import { DIR_DELTA, MAP_W, MAP_H } from '../world/roadNetwork.js';
import { inEtherLaw } from '../world/ethericSea.js';

export const ROUTE_COST = Object.freeze({ road: 1, track: 1.6, open: 3.5 });
// Keep every sea cost at or above `ROUTE_COST.road`, which the heuristic charges per step. `shore` is added on
// launch and landfall so routes do not hop in and out of the water.
export const SEA_COST = Object.freeze({ sea: 1.2, coast: 1.5, shore: 6 });
export const SEA_KINDS = Object.freeze(['sea', 'embark', 'landfall']);
// Must equal `ROADSTEAD_PX` in src/systems/naval/seaLanes.js, so a booked voyage lands at the port's own roadstead
// instead of a cheaper coast road.
export const VOYAGE_LANDFALL_PX = 3;
const ASHORE = 0, AFLOAT = 1, LEFT = 2;
export const TV_MOUNTAIN_CLIMATE = 226;
export const TV_STEEP_RISE = 16;
export function openStepBlocked(climateAt, heightAt, ax, ay, bx, by, leaving = false) {
  return false;
}

/**
 * @param {(x:number, y:number) => number} climateAt
 * @param {(x:number, y:number) => number} heightAt
 * @param {number} waterByte
 * @param {number} [width]
 * @param {number} [height]
 * @param {((x:number, y:number) => boolean)|null} [beyond]
 */
export function routeGround(climateAt, heightAt, waterByte, width = MAP_W, height = MAP_H, beyond = null) {
  const climate = new Uint8Array(width * height), heights = new Uint8Array(width * height);
  let rocks = null;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) { climate[y * width + x] = climateAt(x, y); heights[y * width + x] = heightAt(x, y); }
  }
  const climateOf = (x, y) => climate[y * width + x];
  const heightOf = (x, y) => heights[y * width + x];
  /** @type {Map<string, boolean>} */
  const dryBeyond = new Map();
  const beyondDry = (x, y) => {
    if (!beyond) return false;
    const k = `${x},${y}`;
    let dry = dryBeyond.get(k);
    if (dry === undefined) {
      if (dryBeyond.size >= BEYOND_CACHE_MAX) dryBeyond.clear();
      dry = !!beyond(x, y);
      dryBeyond.set(k, dry);
    }
    return dry;
  };
  const isWater = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? !beyondDry(x, y) : heights[y * width + x] <= waterByte);
  const openBlocked = () => false;
  const peak = (_x, _y) => false;
  // Two neighbours join only when an ordinary step goes from one that some step can enter to the other. A pixel no
  // step enters, such as the sea, joins nothing, so a one-pixel ridge does not link its two sides.
  let land = null;
  const pieces = (roads, tracks) => {
    if (land && land.roads === roads && land.tracks === tracks) return land.root;
    const n = width * height, out = new Uint8Array(n), entered = new Uint8Array(n), root = new Int32Array(n);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        for (let d = 0; d < 8; d++) {
          const bit = STEP_BIT[d], bx = x + STEP_DX[d], by = y + STEP_DY[d];
          if (bx < 0 || by < 0 || bx >= width || by >= height) continue;
          if (stepKind(x, y, bx, by, bit, width, height, roads, tracks, isWater, openBlocked, 0, false) < 0) continue;
          out[y * width + x] |= bit;
          entered[by * width + bx] = 1;
        }
      }
    }
    for (let i = 0; i < n; i++) root[i] = i;
    const find = (i) => { while (root[i] !== i) { root[i] = root[root[i]]; i = root[i]; } return i; };
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const a = y * width + x;
        for (let d = 0; d < HALF_BIT.length; d++) {
          const bit = HALF_BIT[d], bx = x + HALF_DX[d], by = y + HALF_DY[d];
          if (bx < 0 || by < 0 || bx >= width || by >= height) continue;
          const b = by * width + bx;
          if (!((entered[a] && (out[a] & bit)) || (entered[b] && (out[b] & BACK_BIT[bit])))) continue;
          const ra = find(a), rb = find(b);
          if (ra !== rb) root[ra] = rb;
        }
      }
    }
    for (let i = 0; i < n; i++) root[i] = find(i);
    land = { roads, tracks, root };
    return root;
  };
  const onTable = (p) => p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;
  return {
    isWater,
    peakAt: peak,
    openBlocked,
    setRocks(table) { if (table === rocks) return; rocks = table; land = null; },
    apart: (from, to, { roads = null, tracks = null } = {}) => {
      if (peak(from.x, from.y)) return false;
      if (!onTable(from) || !onTable(to)) return false;
      const root = pieces(roads, tracks);
      const about = (p) => {
        const set = new Set();
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const x = p.x + dx, y = p.y + dy;
            if (x >= 0 && y >= 0 && x < width && y < height) set.add(root[y * width + x]);
          }
        }
        return set;
      };
      const mine = about(from);
      for (const piece of about(to)) if (mine.has(piece)) return false;
      return true;
    },
  };
}

export const ROUTE_MARGINS = Object.freeze([6, 20, 60, MAP_W]);
export const ROUTE_MAX_EXPANSIONS = 200000;
export const BEYOND_CACHE_MAX = 1 << 16;

export const OPPOSITE_BIT = Object.freeze({ 128: 8, 64: 4, 32: 2, 16: 1, 8: 128, 4: 64, 2: 32, 1: 16 });

const BACK_BIT = new Uint8Array(256);
for (const [bit, back] of Object.entries(OPPOSITE_BIT)) BACK_BIT[Number(bit)] = back;
const STEP_BIT = DIR_DELTA.map(([bit]) => bit), STEP_DX = DIR_DELTA.map(([, dx]) => dx), STEP_DY = DIR_DELTA.map(([, , dy]) => dy);
const HALF_COMPASS = DIR_DELTA.filter(([, dx, dy]) => dy > 0 || (dy === 0 && dx > 0));
const HALF_BIT = HALF_COMPASS.map(([bit]) => bit), HALF_DX = HALF_COMPASS.map(([, dx]) => dx), HALF_DY = HALF_COMPASS.map(([, , dy]) => dy);
const KIND_NAMES = ['road', 'track', 'open'];
const STEP_NAMES = ['road', 'track', 'open', 'sea', 'embark', 'landfall'];
const KIND_COST = [ROUTE_COST.road, ROUTE_COST.track, ROUTE_COST.open];

function edgeKindAt(a, b, bit, roads, tracks) {
  const back = BACK_BIT[bit];
  if (roads && (roads[a] & bit) && (roads[b] & back)) return 0;
  if (tracks && (tracks[a] & bit) && (tracks[b] & back)) return 1;
  return 2;
}
/**
 * @param {ArrayLike<number>|null} roads
 * @param {ArrayLike<number>|null} tracks
 */
export function edgeKind(a, b, bit, roads, tracks) {
  return KIND_NAMES[edgeKindAt(a, b, bit, roads, tracks)];
}

// A road step onto a water pixel is allowed because the road data crosses causeways the heightmap marks as sea.
// Track steps are not, since tracks are painted as fords.
function pavedStep(ax, ay, bx, by, bit, width, height, roads) {
  if (!roads || ax < 0 || ay < 0 || bx < 0 || by < 0 || ax >= width || ay >= height || bx >= width || by >= height) return false;
  return edgeKindAt(ay * width + ax, by * width + bx, bit, roads, null) === 0;
}

// `goal` is 0 for an ordinary step, 1 for the step onto the goal (water allowed), and 2 onto an exempt goal
// (`openBlocked` skipped too). Returns -1 when the step is refused.
function stepKind(ax, ay, bx, by, bit, width, height, roads, tracks, isWater, openBlocked, goal, leaving) {
  if (goal === 0 && isWater(bx, by) && !pavedStep(ax, ay, bx, by, bit, width, height, roads)) return -1;
  if (ax !== bx && ay !== by && isWater(bx, ay) && isWater(ax, by) && !pavedStep(ax, ay, bx, by, bit, width, height, roads)) return -1;
  // Pixels past the table have no road byte, and indexing them would read a neighbouring row.
  const off = ax < 0 || ay < 0 || bx < 0 || by < 0 || ax >= width || ay >= height || bx >= width || by >= height;
  const kind = off ? 2 : edgeKindAt(ay * width + ax, by * width + bx, bit, roads, tracks);
  if (kind === 2 && goal !== 2 && openBlocked && openBlocked(ax, ay, bx, by, leaving)) return -1;
  return kind;
}

class Heap {
  constructor() { this.p = []; this.v = []; }
  get size() { return this.p.length; }
  clear() { this.p.length = 0; this.v.length = 0; }
  push(pri, val) {
    const p = this.p, v = this.v;
    let i = p.length;
    p.push(pri); v.push(val);
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (p[j] <= pri) break;
      p[i] = p[j]; v[i] = v[j]; i = j;
    }
    p[i] = pri; v[i] = val;
  }
  pop() {
    const p = this.p, v = this.v;
    const top = v[0];
    const lp = p.pop(), lv = v.pop();
    if (p.length) {
      let i = 0;
      const n = p.length;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mp = lp;
        if (l < n && p[l] < mp) { m = l; mp = p[l]; }
        if (r < n && p[r] < mp) { m = r; mp = p[r]; }
        if (m === i) break;
        p[i] = p[m]; v[i] = v[m]; i = m;
      }
      p[i] = lp; v[i] = lv;
    }
    return top;
  }
}

/**
 * @param {{x:number,y:number}} from
 * @param {{x:number,y:number}} to
 * @param {{ roads?: ArrayLike<number>|null, tracks?: ArrayLike<number>|null, isWater?: (x:number,y:number)=>boolean, width?: number, height?: number, margins?: readonly number[], maxExpansions?: number, openBlocked?: ((ax:number, ay:number, bx:number, by:number, leaving?:boolean) => boolean)|null, goalExempt?: boolean, peakAt?: ((x:number, y:number) => boolean)|null, apart?: ((from:{x:number,y:number}, to:{x:number,y:number}, net:{roads:any, tracks:any}) => boolean)|null, sea?: { start: 'land'|'sea', again?: boolean, goal?: 'land'|'sea', voyage?: boolean } | null }} [opts]
 * @returns {{ pixels: {x:number,y:number}[], cost: number, kinds: string[] } | null}
 */
export function planRoute(from, to, { roads = null, tracks = null, isWater = () => false, width = MAP_W, height = MAP_H, margins = ROUTE_MARGINS, maxExpansions = ROUTE_MAX_EXPANSIONS, openBlocked = null, goalExempt = true, peakAt = null, apart = null, sea = null } = {}) {
  if (!from || !to) return null;
  // Ends on opposite sides of the Eltheric Ocean boundary return null at once; a search across the gap exhausts
  // memory.
  if (inEtherLaw(from.x, from.y) !== inEtherLaw(to.x, to.y)) return null;
  if (from.x === to.x && from.y === to.y && !(sea && (sea.start === 'sea') !== (sea.goal === 'sea'))) return { pixels: [{ x: from.x, y: from.y }], cost: 0, kinds: [] };
  // A route found in a box is final only when it costs no more than any path leaving the box, `2 * (margin + 1)`
  // road steps. The bounds include both ends, which can lie past the map.
  const bounds = { x0: Math.min(0, from.x, to.x), x1: Math.max(width - 1, from.x, to.x), y0: Math.min(0, from.y, to.y), y1: Math.max(height - 1, from.y, to.y) };
  let best = null, box = '', asked = false;
  for (const margin of margins) {
    const key = `${Math.max(bounds.x0, Math.min(from.x, to.x) - margin)},${Math.min(bounds.x1, Math.max(from.x, to.x) + margin)},${Math.max(bounds.y0, Math.min(from.y, to.y) - margin)},${Math.min(bounds.y1, Math.max(from.y, to.y) + margin)}`;
    if (key === box) continue;
    if (box && !best && !asked && apart && !sea) { asked = true; if (apart(from, to, { roads, tracks })) return null; }
    box = key;
    // The full-bounds box runs uncapped, since no wider box follows and a cap would refuse a reachable trip.
    const cap = key === `${bounds.x0},${bounds.x1},${bounds.y0},${bounds.y1}` ? Infinity : maxExpansions;
    const r = search(from, to, { roads, tracks, isWater, width, height, bounds, margin, maxExpansions: cap, openBlocked, goalExempt, peakAt, sea });
    if (r && (!best || r.cost <= best.cost)) best = r;
    if (best && best.cost <= 2 * (margin + 1) * ROUTE_COST.road) return best;
  }
  return best;
}

const ROUTE_SCRATCH_STATES = 1 << 16;
let scratch = null, scratchBusy = false;
function searchArrays(states) {
  if (scratchBusy || states > ROUTE_SCRATCH_STATES) {
    return { g: new Float64Array(states).fill(Infinity), came: new Int32Array(states), via: new Uint8Array(states), closed: new Uint8Array(states), open: new Heap() };
  }
  const n = ROUTE_SCRATCH_STATES;
  scratch ??= { g: new Float64Array(n), came: new Int32Array(n), via: new Uint8Array(n), closed: new Uint8Array(n), open: new Heap() };
  scratch.g.fill(Infinity, 0, states);
  scratch.closed.fill(0, 0, states);
  scratch.open.clear();
  scratchBusy = true;
  return scratch;
}

function search(from, to, opts) {
  const held = scratchBusy;
  try {
    return searchBox(from, to, opts);
  } finally {
    if (!held) scratchBusy = false;
  }
}

function searchBox(from, to, { roads, tracks, isWater, width, height, bounds, margin, maxExpansions, openBlocked, goalExempt, peakAt, sea }) {
  const x0 = Math.max(bounds.x0, Math.min(from.x, to.x) - margin), x1 = Math.min(bounds.x1, Math.max(from.x, to.x) + margin);
  const y0 = Math.max(bounds.y0, Math.min(from.y, to.y) - margin), y1 = Math.min(bounds.y1, Math.max(from.y, to.y) + margin);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const local = (x, y) => (y - y0) * bw + (x - x0);
  const cells = bw * bh, layers = sea ? 3 : 1;
  // `came` and `via` are read only along the found path, so they are never reset between searches.
  const { g, came, via, closed, open } = searchArrays(cells * layers);
  const h = (x, y) => { const dx = Math.abs(x - to.x), dy = Math.abs(y - to.y); return (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)) * ROUTE_COST.road; };
  const goal = local(to.x, to.y), startCell = local(from.x, from.y);
  const startLayer = !sea ? 0 : sea.start === 'sea' ? AFLOAT : ASHORE;
  const seaGoal = !!sea && sea.goal === 'sea';
  const goalOk = (layer) => !sea || (seaGoal ? layer === AFLOAT : layer !== AFLOAT);
  const nearLand = (x, y) => {
    for (const [, dx, dy] of DIR_DELTA) if (!isWater(x + dx, y + dy)) return true;
    return false;
  };
  const mine = openBlocked && peakAt && peakAt(from.x, from.y) ? new Uint8Array(cells) : null;
  if (mine) {
    mine[startCell] = 1;
    const fill = [startCell];
    while (fill.length) {
      const c = fill.pop(), cx = x0 + (c % bw), cy = y0 + Math.floor(c / bw);
      for (const [, dx, dy] of DIR_DELTA) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
        const n = local(nx, ny);
        if (!mine[n] && peakAt(nx, ny)) { mine[n] = 1; fill.push(n); }
      }
    }
  }
  const start = startLayer * cells + startCell;
  g[start] = 0;
  came[start] = -1;
  open.push(h(from.x, from.y), start);
  let expanded = 0, reached = -1;
  while (open.size) {
    const c = open.pop();
    if (closed[c]) continue;
    closed[c] = 1;
    const layer = Math.floor(c / cells), cell = c - layer * cells;
    if (cell === goal && goalOk(layer)) { reached = c; break; }
    if (++expanded > maxExpansions) return null;
    const cx = x0 + (cell % bw), cy = y0 + Math.floor(cell / bw);
    const leaving = mine !== null && mine[cell] === 1;
    for (let d = 0; d < 8; d++) {
      const dx = STEP_DX[d], dy = STEP_DY[d], nx = cx + dx, ny = cy + dy;
      if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
      const n = local(nx, ny);
      const diag = dx && dy ? Math.SQRT2 : 1;
      const wet = sea ? isWater(nx, ny) || (seaGoal && n === goal) : false;
      let nl = layer, kindIx, step;
      if (sea && layer === AFLOAT) {
        if (wet) {
          if (dx && dy && !isWater(cx + dx, cy) && !isWater(cx, cy + dy)) continue;
          kindIx = 3; step = diag * (nearLand(nx, ny) ? SEA_COST.coast : SEA_COST.sea);
        } else {
          if (peakAt && peakAt(nx, ny) && !(n === goal && goalExempt)) continue;
          if (sea.voyage && Math.max(Math.abs(nx - to.x), Math.abs(ny - to.y)) > VOYAGE_LANDFALL_PX) continue;
          nl = sea.again ? ASHORE : LEFT; kindIx = 5; step = diag * ROUTE_COST.open + SEA_COST.shore;
        }
      } else if (wet && ((seaGoal && n === goal) || (n !== goal && !pavedStep(cx, cy, nx, ny, STEP_BIT[d], width, height, roads)))) {
        if (layer !== ASHORE) continue;
        nl = AFLOAT; kindIx = 4; step = diag * SEA_COST.sea + SEA_COST.shore;
      } else {
        const kind = stepKind(cx, cy, nx, ny, STEP_BIT[d], width, height, roads, tracks, isWater, openBlocked, n !== goal ? 0 : goalExempt ? 2 : 1, leaving);
        if (kind < 0) continue;
        kindIx = kind; step = diag * KIND_COST[kind];
      }
      const ns = nl * cells + n;
      if (closed[ns]) continue;
      const ng = g[c] + step;
      if (ng < g[ns]) { g[ns] = ng; came[ns] = c; via[ns] = kindIx; open.push(ng + h(nx, ny), ns); }
    }
  }
  if (reached < 0) return null;
  const pixels = [];
  const kinds = [];
  for (let c = reached; c !== -1; c = came[c]) {
    const cell = c % cells;
    pixels.push({ x: x0 + (cell % bw), y: y0 + Math.floor(cell / bw) });
    if (c !== start) kinds.push(STEP_NAMES[via[c]]);
  }
  pixels.reverse(); kinds.reverse();
  return { pixels, cost: g[reached], kinds };
}

/**
 * @param {{x:number,y:number}[]} pixels
 * @param {string[]} kinds
 * @param {{ ringAt?: ((x:number, y:number, from:number[]|{x:number,z:number}, to:number[]|{x:number,z:number}) => ({x:number, z:number}[]|null))|null, start?: {x:number,z:number}|null, end?: {x:number,z:number}|null }} [opts]
 * @param {[{x:number,z:number}, {x:number,z:number}]|null|false} [ends]
 * @returns {{ x:number, y:number, kind:string, at?:{x:number,z:number}, ring?:boolean }[]}
 */
export function routeLegs(pixels, kinds = [], { ringAt = null, start: start0 = null, end: end0 = null } = {}, ends = null) {
  const legs = [];
  const [start, end] = ends || [start0, end0];
  const n = pixels.length;
  const step = (i, j) => [pixels[j].x - pixels[i].x, pixels[j].y - pixels[i].y];
  const endRing = (i, from, to) => (ringAt && from && to ? ringAt(pixels[i].x, pixels[i].y, from, to) ?? [] : []);
  const ringStart = n > 1 && !['sea', 'landfall'].includes(kinds[0]) ? endRing(0, start, step(0, 1)) : [];
  const ringEnd = n > 1 && !['sea', 'embark'].includes(kinds[n - 2]) ? endRing(n - 1, step(n - 1, n - 2), end) : [];
  if (n === 1) {
    const only = endRing(0, start, end);
    return only.length ? [...only.map((at) => ({ x: pixels[0].x, y: pixels[0].y, kind: 'open', at: { x: at.x, z: at.z }, ring: true })),
      { x: pixels[0].x, y: pixels[0].y, kind: 'open', at: { x: end.x, z: end.z } }] : legs;
  }
  for (const at of ringStart) legs.push({ x: pixels[0].x, y: pixels[0].y, kind: kinds[0] === 'embark' ? 'open' : kinds[0] ?? 'open', at: { x: at.x, z: at.z }, ring: true });
  // A pixel counts as afloat only when the step into it is sailed or a launch. Launch and landfall pixels are land,
  // so they keep their town ring.
  const afloat = (i) => ['sea', 'embark'].includes(kinds[i - 1]);
  const ring = (i) => (ringAt && i < pixels.length - 1 && !afloat(i)
    ? ringAt(pixels[i].x, pixels[i].y, [pixels[i - 1].x - pixels[i].x, pixels[i - 1].y - pixels[i].y], [pixels[i + 1].x - pixels[i].x, pixels[i + 1].y - pixels[i].y])
    : null);
  const rings = pixels.map((_, i) => (i > 0 ? ring(i) : null));
  for (let i = 1; i < pixels.length; i++) {
    const dx = pixels[i].x - pixels[i - 1].x, dy = pixels[i].y - pixels[i - 1].y;
    const kind = kinds[i - 1] ?? 'open';
    const pts = rings[i];
    if (pts && pts.length) {
      for (const at of pts) legs.push({ x: pixels[i].x, y: pixels[i].y, kind, at: { x: at.x, z: at.z }, ring: true });
      continue;
    }
    if (i === n - 1 && ringEnd.length) {
      for (const at of ringEnd) legs.push({ x: pixels[i].x, y: pixels[i].y, kind, at: { x: at.x, z: at.z }, ring: true });
      legs.push({ x: pixels[i].x, y: pixels[i].y, kind, at: { x: end.x, z: end.z } });
      continue;
    }
    const next = pixels[i + 1];
    const same = next && !(rings[i + 1]?.length) && !(i + 1 === n - 1 && ringEnd.length) && next.x - pixels[i].x === dx && next.y - pixels[i].y === dy && (kinds[i] ?? 'open') === kind;
    if (!same) legs.push({ x: pixels[i].x, y: pixels[i].y, kind });
  }
  return legs;
}

/**
 * @param {{x:number,z:number}} me
 * @param {{x:number,z:number}} a
 * @param {{x:number,z:number}} b
 */
export function joinPoint(me, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz;
  if (!(L > 0)) return { x: a.x, z: a.z };
  const t = Math.max(0, Math.min(1, ((me.x - a.x) * dx + (me.z - a.z) * dz) / L));
  return { x: a.x + dx * t, z: a.z + dz * t };
}

/**
 * @param {{x:number,z:number}} me
 * @param {{x:number,y:number,at?:{x:number,z:number}}[]} legs
 * @param {{x:number,z:number}} end
 * @param {(leg: {x:number,y:number}) => number[]} centre
 */
export function routeDrawPoints(me, legs, end, centre, via = null) {
  return [[me.x, me.z], ...legs.slice(0, -1).map((l) => (l.at ? [l.at.x, l.at.z] : centre(l))), ...(via ? [[via.x, via.z]] : []), [end.x, end.z]];
}

export function wayStillToWalk(me, route, seg, natives) {
  const n = natives ?? [];
  if (!route || n.length < 2) return null;
  const points = [[me.x, me.z]], of = [];
  for (const q of (route.street?.pts ?? []).slice(Math.max(0, seg | 0))) { points.push([q.x, q.z]); of.push('street'); }
  if (route.join) { points.push([route.join.x, route.join.z]); of.push('join'); }
  const last = (route.legs?.length ?? 1) - 1;
  for (let k = Math.min(n.length - 1, (route.i ?? 0) + 1); k < n.length; k++) { points.push([n[k][0], n[k][1]]); of.push(Math.min(k - 1, last)); }
  return { points, of };
}

export function finalRoadVia(legs, end, mid, { place = false } = {}) {
  const last = legs?.[legs.length - 1], prev = legs?.[legs.length - 2];
  if (!last || !prev || !end || last.at || last.ring || (last.kind !== 'road' && last.kind !== 'track')) return null;
  const xz = (l) => { const v = l.at ?? mid(l); return Array.isArray(v) ? { x: v[0], z: v[1] } : { x: v.x, z: v.z }; };
  const b = xz({ ...last, at: null }), a = xz(prev);
  return place ? b : joinPoint(end, a, b);
}

export function roadShare(kinds) {
  if (!kinds?.length) return 0;
  return kinds.filter((k) => k === 'road' || k === 'track').length / kinds.length;
}
export function dryLine(a, b, isWater) {
  const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  for (let s = 1; s <= n; s++) if (isWater(Math.round(a.x + ((b.x - a.x) * s) / n), Math.round(a.y + ((b.y - a.y) * s) / n))) return false;
  return true;
}
export const crossesWater = (kinds) => !!kinds?.some((k) => SEA_KINDS.includes(k));
