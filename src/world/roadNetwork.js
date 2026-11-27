// The road network, derived at runtime from the player's own MAPS.BSA and WOODS.WLD.
// One byte per map pixel holds an 8-direction compass mask of the edges a path leaves through.

import { LOCATION_TYPES } from '../formats/mapsFile.js';
import { MAP_WIDTH, MAP_HEIGHT } from '../formats/woodsFile.js';

export { MAP_WIDTH as MAP_W, MAP_HEIGHT as MAP_H };

export const DIR = Object.freeze({
  N: 128, NE: 64, E: 32, SE: 16, S: 8, SW: 4, W: 2, NW: 1,
});
export const DIR_DELTA = Object.freeze([
  [DIR.N, 0, -1], [DIR.NE, 1, -1], [DIR.E, 1, 0], [DIR.SE, 1, 1],
  [DIR.S, 0, 1], [DIR.SW, -1, 1], [DIR.W, -1, 0], [DIR.NW, -1, -1],
]);
const OPPOSITE = Object.freeze({
  [DIR.N]: DIR.S, [DIR.NE]: DIR.SW, [DIR.E]: DIR.W, [DIR.SE]: DIR.NW,
  [DIR.S]: DIR.N, [DIR.SW]: DIR.NE, [DIR.W]: DIR.E, [DIR.NW]: DIR.SE,
});

export const ROAD_TYPES = Object.freeze(new Set([
  LOCATION_TYPES.TownCity, LOCATION_TYPES.TownHamlet,
]));
export const TRACK_TYPES = Object.freeze(new Set([
  LOCATION_TYPES.TownVillage, LOCATION_TYPES.Tavern, LOCATION_TYPES.ReligionTemple,
  LOCATION_TYPES.HomeWealthy, LOCATION_TYPES.ReligionCult, LOCATION_TYPES.Coven,
]));

export const ROAD_DIALS = Object.freeze({
  neighbours: 2,
  roadReach: 70,
  trackLink: 24,
  trackNeighbours: 2,
  trackReach: 20,
  climbCost: 80,
  descentCost: 10,
  highCost: 0.08,
  highAbove: 40,
  roadDiscount: 0.5,
  mergeNear: 3,
  joinAngle: 3,
  turnCost: 0.4,
});

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * @param {object} p
 * @param {Array<{x:number,y:number,type:number}>} p.locations
 * @param {(x:number,y:number)=>number} p.heightAt
 * @param {(x:number,y:number)=>boolean} p.isWater
 * @param {object} [p.dials]
 * @returns {{ roads: Uint8Array, tracks: Uint8Array, stats: object }}
 */
export function buildRoadNetwork({ locations, heightAt, isWater, dials = {} }) {
  const d = { ...ROAD_DIALS, ...dials };
  const roads = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
  const tracks = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);

  const roadNodes = locations.filter((l) => ROAD_TYPES.has(l.type) && inMap(l));
  const trackNodes = locations.filter((l) => TRACK_TYPES.has(l.type) && inMap(l));

  const occupied = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
  for (const l of locations) if (inMap(l) && !ROAD_TYPES.has(l.type)) occupied[l.y * MAP_WIDTH + l.x] = 1;

  const component = landComponents(isWater);
  const sameLand = (a, b) => component[a.y * MAP_WIDTH + a.x] === component[b.y * MAP_WIDTH + b.x];
  const towns = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
  for (const l of roadNodes) towns[l.y * MAP_WIDTH + l.x] = 1;

  const edges = new Map();
  const addEdge = (i, j) => { if (i !== j) edges.set(i < j ? `${i},${j}` : `${j},${i}`, i < j ? [i, j] : [j, i]); };
  for (let i = 0; i < roadNodes.length; i++) {
    const near = roadNodes.map((n, j) => ({ j, dd: dist(roadNodes[i], n) }))
      .filter((o) => o.j !== i && o.dd <= d.roadReach)
      .sort((a, b) => a.dd - b.dd).slice(0, d.neighbours);
    for (const o of near) addEdge(i, o.j);
  }
  for (const [i, j] of kruskal(roadNodes)) addEdge(i, j);

  const routed = [...edges.values()].sort((a, b) => dist(roadNodes[a[0]], roadNodes[a[1]]) - dist(roadNodes[b[0]], roadNodes[b[1]]));
  const stats = { roadNodes: roadNodes.length, trackNodes: trackNodes.length, roadEdges: routed.length, trackEdges: 0, unrouted: 0, unroutedPairs: [], islands: 0, trackLinks: 0 };
  const miss = (a, b) => { stats.unrouted++; stats.unroutedPairs.push([{ x: a.x, y: a.y, region: a.region, name: a.name ?? null }, { x: b.x, y: b.y, region: b.region, name: b.name ?? null }]); };
  for (const [i, j] of routed) {
    if (!sameLand(roadNodes[i], roadNodes[j])) { stats.islands++; miss(roadNodes[i], roadNodes[j]); continue; }
    const path = route(roadNodes[i], roadNodes[j], { heightAt, isWater, existing: roads, d, blocked: occupied, mergeNear: d.mergeNear, towns });
    if (path) stamp(roads, path); else miss(roadNodes[i], roadNodes[j]);
  }

  const paths = new Uint8Array(roads);
  const trackBlocked = new Uint8Array(occupied);
  for (const t of trackNodes) trackBlocked[t.y * MAP_WIDTH + t.x] = 0;
  const trackTowns = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
  for (const t of trackNodes) trackTowns[t.y * MAP_WIDTH + t.x] = 1;
  const links = [];
  for (let i = 0; i < trackNodes.length; i++) {
    const near = trackNodes.map((n, j) => ({ j, dd: dist(trackNodes[i], n) }))
      .filter((o) => o.j !== i && o.dd <= d.trackLink).sort((a, b) => a.dd - b.dd).slice(0, d.trackNeighbours);
    for (const o of near) links.push([Math.min(i, o.j), Math.max(i, o.j), o.dd]);
  }
  const seen = new Set();
  links.sort((a, b) => a[2] - b[2]);
  for (const [i, j] of links) {
    const key = i * trackNodes.length + j; if (seen.has(key)) continue; seen.add(key);
    const A = trackNodes[i], B = trackNodes[j];
    const path = route(A, B, { heightAt, isWater, existing: paths, d, stopOn: paths, blocked: trackBlocked, towns: trackTowns,
      stopIf: (x, y, h) => Math.hypot(x - B.x, y - B.y) < Math.hypot(x - A.x, y - A.y)
        && wideEnough(paths[y * MAP_WIDTH + x], DIR_DELTA[(h + 4) % 8][0], d) });
    if (path) { stamp(tracks, path); stamp(paths, path); stats.trackLinks++; }
  }
  for (const t of trackNodes) {
    const best = nearestPath(paths, t, d.trackReach);
    if (!best) continue;
    if (paths[t.y * MAP_WIDTH + t.x]) continue;
    const path = route(t, best, { heightAt, isWater, existing: paths, d, stopOn: paths, blocked: trackBlocked, towns: trackTowns });
    if (path) { stamp(tracks, path); stamp(paths, path); stats.trackEdges++; } else miss(t, { ...best, region: t.region, name: null });
  }
  return { roads, tracks, stats };
}

function wideEnough(have, bit, d) {
  if (!have || (have & bit)) return true;
  const bi = DIR_DELTA.findIndex(([b]) => b === bit);
  for (let j = 0; j < 8; j++) {
    if (!(have & DIR_DELTA[j][0])) continue;
    const dd = Math.abs(j - bi); if (Math.min(dd, 8 - dd) < d.joinAngle) return false;
  }
  return true;
}

export function landComponents(isWater) {
  const comp = new Int32Array(MAP_WIDTH * MAP_HEIGHT);
  const stack = new Int32Array(MAP_WIDTH * MAP_HEIGHT);
  let next = 0;
  for (let start = 0; start < comp.length; start++) {
    if (comp[start] || isWater(start % MAP_WIDTH, (start / MAP_WIDTH) | 0)) continue;
    next++; let sp = 0; stack[sp++] = start; comp[start] = next;
    while (sp) {
      const i = stack[--sp]; const x = i % MAP_WIDTH, y = (i / MAP_WIDTH) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;
        const j = ny * MAP_WIDTH + nx;
        if (comp[j] || isWater(nx, ny)) continue;
        comp[j] = next; stack[sp++] = j;
      }
    }
  }
  return comp;
}

function nearestPath(mask, at, reach) {
  let best = null; let bd = Infinity;
  const x0 = Math.max(0, at.x - reach), x1 = Math.min(MAP_WIDTH - 1, at.x + reach);
  const y0 = Math.max(0, at.y - reach), y1 = Math.min(MAP_HEIGHT - 1, at.y + reach);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!mask[y * MAP_WIDTH + x]) continue;
    const dd = Math.hypot(x - at.x, y - at.y);
    if (dd <= reach && dd < bd) { bd = dd; best = { x, y }; }
  }
  return best;
}

function inMap(l) { return l.x >= 0 && l.x < MAP_WIDTH && l.y >= 0 && l.y < MAP_HEIGHT; }

function kruskal(nodes) {
  const all = [];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) all.push([dist(nodes[i], nodes[j]), i, j]);
  all.sort((a, b) => a[0] - b[0]);
  const parent = nodes.map((_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const out = [];
  for (const [, i, j] of all) { const a = find(i), b = find(j); if (a !== b) { parent[a] = b; out.push([i, j]); } }
  return out;
}

export function stamp(mask, path) {
  for (let k = 0; k + 1 < path.length; k++) {
    const a = path[k], b = path[k + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const step = DIR_DELTA.find(([, ex, ey]) => ex === dx && ey === dy);
    if (!step) throw new Error(`stamp: non-adjacent step (${a.x},${a.y})->(${b.x},${b.y})`);
    mask[a.y * MAP_WIDTH + a.x] |= step[0];
    mask[b.y * MAP_WIDTH + b.x] |= OPPOSITE[step[0]];
  }
}

export function route(from, to, opts) {
  opts = { ...opts, d: { ...ROAD_DIALS, ...(opts.d ?? {}) } };
  for (const margin of [12, 40, 120]) {
    const p = routeInBox(from, to, opts, margin);
    if (p) return p;
  }
  if (opts.mergeNear || opts.d.joinAngle) return route(from, to, { ...opts, mergeNear: 0, d: { ...opts.d, joinAngle: 0 } });
  return null;
}

function routeInBox(from, to, { heightAt, isWater, existing, d, stopOn = null, stopIf = null, blocked = null, mergeNear = 0, towns = null }, margin) {
  const x0 = Math.max(0, Math.min(from.x, to.x) - margin), x1 = Math.min(MAP_WIDTH - 1, Math.max(from.x, to.x) + margin);
  const y0 = Math.max(0, Math.min(from.y, to.y) - margin), y1 = Math.min(MAP_HEIGHT - 1, Math.max(from.y, to.y) + margin);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const cells = bw * bh;
  const idx = (x, y) => (y - y0) * bw + (x - x0);
  const g = new Float32Array(cells * 8).fill(Infinity);
  const came = new Int32Array(cells * 8).fill(-1);
  const closed = new Uint8Array(cells * 8);
  const turnOf = (a, b) => (a < 0 ? 0 : Math.min((a - b + 8) % 8, (b - a + 8) % 8));
  const h = (x, y) => Math.hypot(x - to.x, y - to.y) * d.roadDiscount;
  const open = new MinHeap();
  const sc = idx(from.x, from.y);
  for (let k = 0; k < 8; k++) { g[sc * 8 + k] = 0; open.push(h(from.x, from.y), sc * 8 + k); }
  const goal = idx(to.x, to.y);
  let end = -1;
  while (open.size) {
    const cur = open.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cell = (cur / 8) | 0, heading = cur % 8;
    const cx = x0 + (cell % bw), cy = y0 + Math.floor(cell / bw);
    if (cell === goal || (stopOn && cell !== sc && stopOn[cy * MAP_WIDTH + cx] !== 0 && (!stopIf || stopIf(cx, cy, heading)))) { end = cur; break; }
    if (mergeNear && cell !== sc && existing[cy * MAP_WIDTH + cx] !== 0
      && Math.hypot(cx - to.x, cy - to.y) <= mergeNear) { end = cur; break; }
    const hc = heightAt(cx, cy);
    const atStart = cell === sc;
    for (let k = 0; k < 8; k++) {
      const [, dx, dy] = DIR_DELTA[k];
      const nx = cx + dx, ny = cy + dy;
      if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
      const ni = idx(nx, ny) * 8 + k;
      if (closed[ni] || isWater(nx, ny)) continue;
      if (d.joinAngle && towns) {
        if (towns[ny * MAP_WIDTH + nx] && !wideEnough(existing[ny * MAP_WIDTH + nx], OPPOSITE[DIR_DELTA[k][0]], d)) continue;
        if (towns[cy * MAP_WIDTH + cx] && !wideEnough(existing[cy * MAP_WIDTH + cx], DIR_DELTA[k][0], d)) continue;
      }
      const isBlockedAt = (bx, by) => (blocked && blocked[by * MAP_WIDTH + bx]) || isWater(bx, by);
      if (blocked && blocked[ny * MAP_WIDTH + nx] && idx(nx, ny) !== goal) continue;
      if (dx && dy && (isBlockedAt(cx + dx, cy) || isBlockedAt(cx, cy + dy))) continue;
      const hn = heightAt(nx, ny);
      const rise = hn - hc;
      let cost = (dx && dy) ? Math.SQRT2 : 1;
      cost *= 1 + (rise > 0 ? rise * d.climbCost : -rise * d.descentCost) * 0.01;
      if (hn > d.highAbove) cost *= 1 + (hn - d.highAbove) * d.highCost;
      if (existing[ny * MAP_WIDTH + nx]) cost *= d.roadDiscount;
      if (!atStart) { const t = turnOf(heading, k); cost += t * t * d.turnCost; }
      const ng = g[cur] + cost;
      if (ng < g[ni]) { g[ni] = ng; came[ni] = cur; open.push(ng + h(nx, ny), ni); }
    }
  }
  if (end < 0) return null;
  const path = [];
  for (let c = end; c >= 0; c = came[c]) {
    const cell = (c / 8) | 0;
    const pt = { x: x0 + (cell % bw), y: y0 + Math.floor(cell / bw) };
    if (!path.length || path[path.length - 1].x !== pt.x || path[path.length - 1].y !== pt.y) path.push(pt);
  }
  return path.reverse();
}

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v; k.push(key); v.push(val);
    let i = k.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= k[i]) break; [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]]; i = p; }
  }
  pop() {
    const k = this.k, v = this.v; const top = v[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      k[0] = lk; v[0] = lv; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]]; i = m;
      }
    }
    return top;
  }
}
