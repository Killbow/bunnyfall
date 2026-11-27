// @ts-check
// Where a port town's shipyard and lighthouse go, read off its layout and the map data alone.
// Distances are exact sums or Math.sqrt of one, never Math.hypot, so every engine agrees. Pure.
import { NAV_CELL, NAV_CELLS_PER_BLOCK, tileWeight } from './cityNavigation.js';
import { summed, frontStrip, closeSite, YARD_PAD_M, YARD_TURNS, NO_ROAD_COST } from './merchantYards/merchantYardSites.js';
import { PORT_SITE_ORDER, portPlaceName, portTownByData } from '../travel/portPlaces.js';
import { longitudeLatitudeToMapPixel } from '../formats/mapsFile.js';
import { SEA_RING, seaBears } from '../net/fortLaw.js';

export { SEA_RING, seaBears };

/**
 * @template {{ px: number, py: number }} P
 * @param {ReadonlyArray<P>} ports
 * @param {number} x
 * @param {number} y
 * @returns {P|null}
 */
export function boardPortAt(ports, x, y) {
  let port = null, best = Infinity;
  for (const q of ports) {
    const dx = q.px - x, dy = q.py - y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > SEA_RING) continue;
    const e = dx * dx + dy * dy;
    if (e < best) { best = e; port = q; }
  }
  return port;
}

export const PORT_FOOT = Object.freeze({
  shipyard: Object.freeze({ hx: 11, hz: 8 }),
  lighthouse: Object.freeze({ hx: 6.5, hz: 6.5 }),
});
export const SEA_CELLS_MIN = 48;
export const SEA_RING_WEIGHT = Object.freeze([0, 2, 1]);
export const LATERAL_K = 0.25;
export const FACE_K = 2;
export const LIGHT_APART_K = 0.5;
export const LIGHT_APART_CAP = 40;

export function portSpans(kind, turn) {
  const F = PORT_FOOT[kind];
  const sx = turn % 2 ? F.hz : F.hx, sz = turn % 2 ? F.hx : F.hz;
  return [Math.ceil((2 * sx) / NAV_CELL - 1e-9), Math.ceil((2 * sz) / NAV_CELL - 1e-9)];
}

/**
 * @param {{width: number, height: number, blocks: any[]}} loc
 * @param {number[]|null} [bearing]
 * @returns {{ width: number, height: number, sea: Uint8Array, cells: number }}
 */
export function townSeaOf(loc, bearing = null) {
  const N = NAV_CELLS_PER_BLOCK, W = (loc?.width | 0) * N, H = (loc?.height | 0) * N;
  const water = new Uint8Array(Math.max(0, W * H)), sea = new Uint8Array(Math.max(0, W * H));
  if (!(W > 0) || !(H > 0)) return { width: 0, height: 0, sea, cells: 0 };
  for (const b of loc.blocks ?? []) {
    const fld = b.dfBlock?.rmbBlock?.fldHeader;
    const auto = fld?.autoMapData, tiles = fld?.groundData?.groundTiles;
    if (!auto || !tiles) continue;
    for (let y = 0; y < N; y++) {
      const row = b.y * N + (N - 1 - y);
      for (let x = 0; x < N; x++) {
        if (auto[y * N + x] !== 0) continue;
        const rec = tiles[x >> 2]?.[y >> 2]?.textureRecord;
        if (Number.isInteger(rec) && tileWeight(rec & 0x3f, { enhancedWater: true }) === 0) water[row * W + b.x * N + x] = 1;
      }
    }
  }
  const seen = new Uint8Array(W * H), stack = [];
  let cells = 0;
  for (let i = 0; i < W * H; i++) {
    if (!water[i] || seen[i]) continue;
    const body = [];
    let edge = false;
    seen[i] = 1; stack.push(i);
    while (stack.length) {
      const c = /** @type {number} */ (stack.pop());
      body.push(c);
      const cx = c % W, cy = (c - cx) / W;
      if (cx === 0 || cy === 0 || cx === W - 1 || cy === H - 1) edge = true;
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (water[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    if (!edge || body.length < SEA_CELLS_MIN || againstBearing(body, W, H, bearing)) continue;
    for (const c of body) sea[c] = 1;
    cells += body.length;
  }
  return { width: W, height: H, sea, cells };
}

function againstBearing(body, W, H, bearing) {
  const sx = bearing?.[0] ?? 0, sz = bearing?.[1] ?? 0;
  if (!sx && !sz) return false;
  let along = 0;
  for (const c of body) { const cx = c % W, cy = (c - cx) / W; along += (2 * cx + 1 - W) * sx + (2 * cy + 1 - H) * sz; }
  return along < 0;
}

/**
 * @param {number} px
 * @param {number} py
 * @param {(x: number, y: number) => boolean} isSea
 */
export function seaBearing(px, py, isSea) {
  let sx = 0, sz = 0;
  for (let dy = -SEA_RING; dy <= SEA_RING; dy++) {
    for (let dx = -SEA_RING; dx <= SEA_RING; dx++) {
      const ring = Math.max(Math.abs(dx), Math.abs(dy));
      if (ring === 0 || !isSea(px + dx, py + dy)) continue;
      const w = SEA_RING_WEIGHT[ring] ?? 0;
      sx += dx * w; sz -= dy * w;
    }
  }
  return [sx, sz];
}

/**
 * @param {(x: number, y: number) => boolean} isWater
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array}
 */
export function openSeaOf(isWater, width, height) {
  const W = width | 0, H = height | 0, n = W > 0 && H > 0 ? W * H : 0;
  const wet = new Uint8Array(n), sea = new Uint8Array(n), stack = new Int32Array(n);
  if (!n) return sea;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isWater(x, y)) wet[y * W + x] = 1;
  let top = 0;
  const reach = (i) => { if (wet[i] && !sea[i]) { sea[i] = 1; stack[top++] = i; } };
  for (let x = 0; x < W; x++) { reach(x); reach((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { reach(y * W); reach(y * W + W - 1); }
  while (top > 0) {
    const c = stack[--top], cx = c % W, cy = (c - cx) / W;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H) reach(ny * W + nx);
      }
    }
  }
  return sea;
}

/**
 * @param {any} loc
 * @param {(mapId: number) => boolean} hasPort
 * @param {(x: number, y: number) => boolean} isSea
 */
export function portTownOnSea(loc, hasPort, isSea) {
  const t = loc?.mapTableData;
  if (!t || !portTownByData(loc, hasPort)) return false;
  const p = longitudeLatitudeToMapPixel(t.longitude, t.latitude);
  return seaBears(p.x, p.y, isSea);
}

/**
 * @param {number} W
 * @param {number} H
 * @param {{ sea: Uint8Array, cells: number }|null} townSea
 * @param {number[]} bearing
 */
export function seaField(W, H, townSea, bearing) {
  if (townSea && townSea.cells > 0) {
    const d = new Int32Array(W * H).fill(-1), queue = new Int32Array(W * H);
    let head = 0, tail = 0;
    for (let i = 0; i < W * H; i++) if (townSea.sea[i]) { d[i] = 0; queue[tail++] = i; }
    while (head < tail) {
      const c = queue[head++], cx = c % W, cy = (c - cx) / W;
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (d[n] < 0) { d[n] = d[c] + 1; queue[tail++] = n; }
      }
    }
    return { kind: 'water', at: (gx, gy) => d[Math.max(0, Math.min(H - 1, Math.floor(gy))) * W + Math.max(0, Math.min(W - 1, Math.floor(gx)))] };
  }
  const [sx, sz] = bearing ?? [0, 0];
  if (sx || sz) {
    const len = Math.sqrt(sx * sx + sz * sz);
    const along = (gx, gy) => (2 * gx + 1 - W) * sx + (2 * gy + 1 - H) * sz;
    const across = (gx, gy) => (2 * gx + 1 - W) * -sz + (2 * gy + 1 - H) * sx;
    const reach = Math.max(along(0, 0), along(W - 1, 0), along(0, H - 1), along(W - 1, H - 1));
    return { kind: 'bearing', at: (gx, gy) => ((reach - along(gx, gy)) + LATERAL_K * Math.abs(across(gx, gy))) / (2 * len) };
  }
  return { kind: 'middle', at: (gx, gy) => Math.sqrt((2 * gx + 1 - W) * (2 * gx + 1 - W) + (2 * gy + 1 - H) * (2 * gy + 1 - H)) / 2 };
}

export function backMiddle(gx, gy, nx, nz, turn) {
  if (turn === 0) return [gx + nx / 2, gy];
  if (turn === 1) return [gx, gy + nz / 2];
  if (turn === 2) return [gx + nx / 2, gy + nz - 1];
  return [gx + nx - 1, gy + nz / 2];
}
export function frontMiddle(gx, gy, nx, nz, turn) {
  if (turn === 0) return [gx + nx / 2, gy + nz - 1];
  if (turn === 1) return [gx + nx - 1, gy + nz / 2];
  if (turn === 2) return [gx + nx / 2, gy];
  return [gx, gy + nz / 2];
}

/**
 * @param {{width: number, height: number, blocked: Uint8Array, road: Uint8Array}} g
 * @param {string} kind
 * @param {{ at: (gx: number, gy: number) => number, kind?: string }} field
 * @param {number[]|null} [apart]
 */
export function portSite(g, kind, field, apart = null) {
  if (!g || !PORT_FOOT[kind]) return null;
  const { width: W, height: H } = g;
  const closed = summed(W, H, (x, y) => g.blocked[y * W + x]);
  const roads = summed(W, H, (x, y) => g.road[y * W + x]);
  const pad = Math.ceil(YARD_PAD_M / NAV_CELL - 1e-9);
  let best = null, bestScore = Infinity;
  for (let turn = 0; turn < 4; turn++) {
    const [nx, nz] = portSpans(kind, turn);
    for (let gy = pad; gy + nz + pad <= H; gy++) {
      for (let gx = pad; gx + nx + pad <= W; gx++) {
        const [bx, by] = backMiddle(gx, gy, nx, nz, turn), [fx, fy] = frontMiddle(gx, gy, nx, nz, turn);
        const back = field.at(bx, by), depth = (turn % 2 ? nx : nz) - 1;
        let score = field.kind === 'middle' ? 0 : FACE_K * Math.max(0, depth - (field.at(fx, fy) - back));
        if (kind === 'shipyard') score += back;
        else {
          const cx = gx + nx / 2, cy = gy + nz / 2;
          score += field.at(cx, cy);
          if (apart) score -= LIGHT_APART_K * Math.min(LIGHT_APART_CAP, Math.sqrt((cx - apart[0]) * (cx - apart[0]) + (cy - apart[1]) * (cy - apart[1])));
        }
        if (score > bestScore) continue;
        if (closed(gx - pad, gy - pad, gx + nx + pad, gy + nz + pad) !== 0) continue;
        if (roads(gx, gy, gx + nx, gy + nz) !== 0) continue;
        if (kind === 'shipyard') {
          const s = frontStrip(gx, gy, nx, nz, turn);
          if (roads(s[0], s[1], s[2], s[3]) === 0) score += NO_ROAD_COST;
        }
        if (score < bestScore || (score === bestScore && best && (gy < best.gy || (gy === best.gy && (gx < best.gx || (gx === best.gx && turn < best.turn)))))) {
          bestScore = score; best = { gx, gy, nx, nz, turn };
        }
      }
    }
  }
  if (!best) return null;
  return {
    kind, turn: best.turn, yaw: YARD_TURNS[best.turn],
    x: (best.gx + best.nx / 2) * NAV_CELL, z: (best.gy + best.nz / 2) * NAV_CELL,
    gx: best.gx, gy: best.gy, nx: best.nx, nz: best.nz, score: bestScore,
  };
}

/**
 * @param {{width: number, height: number, blocked: Uint8Array, road: Uint8Array}} g
 * @param {{ at: (gx: number, gy: number) => number }} field
 */
export function portSitesOn(g, field) {
  const out = [];
  let apart = null;
  for (const kind of PORT_SITE_ORDER) {
    const s = portSite(g, kind, field, apart);
    if (!s) continue;
    out.push(s);
    closeSite(g, s);
    if (kind === 'shipyard') apart = [s.gx + s.nx / 2, s.gy + s.nz / 2];
  }
  return out;
}

export function siteToLocation(site, lx, lz) {
  const a = ((site.yaw ?? 0) * Math.PI) / 180, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  return [site.x + lx * c + lz * s, site.z - lx * s + lz * c];
}
export const sceneToLocationXZ = (p, t, origin) => [p[0] - t[0] - origin[0], p[1] - t[2] - origin[2]];
export function portPlaceRows(sites, crewAt, docks, townName) {
  const out = [];
  for (const site of sites ?? []) {
    out.push({ kind: site.kind, x: site.x, z: site.z, name: site.name });
    if (site.kind === 'shipyard') { const [x, z] = siteToLocation(site, crewAt[0], crewAt[1]); out.push({ kind: 'crewhall', x, z, name: site.crewName }); }
  }
  if (docks) out.push({ kind: 'docks', x: docks[0], z: docks[1], name: portPlaceName('docks', { townName }) });
  return out;
}
