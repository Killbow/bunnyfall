// @ts-check
// Placement depends only on the town layout, so every client places each yard on the same spot. The navgrid always
// uses the enhanced water table, as the monument does.
import { CityNavigation, NAV_CELL, NAV_CELLS_PER_BLOCK } from '../cityNavigation.js';
import { trs, multiply } from '../mat4.js';
import { staticBuildingBox, staticBuildingWorldAabb } from '../staticBuildings.js';
import { localAabb, transformedAabb } from '../../render/frustum.js';
import { ROAD_WEIGHT } from '../gothwayBoards.js';
import { YARD_KIND_ORDER, CRAFT_YARD_ORDER } from './merchantYards.js';

export const YARD_FOOT = Object.freeze({
  stable: Object.freeze({ hx: 7, hz: 5.75 }),
  transport: Object.freeze({ hx: 9, hz: 6.75 }),
  carpenter: Object.freeze({ hx: 7, hz: 6 }),
});
export const YARD_PAD_M = NAV_CELL;
export const BUILDING_CLEAR_M = 6;
export const PROP_CLEAR_M = 1;
export const FLAT_CLEAR_M = 0.8;
export const YARD_GAP_M = 3;
export const FRONT_ROAD_CELLS = 2;
export const NO_ROAD_COST = 12;
export const MONUMENT_KEEP_M = 8;

export const YARD_TURNS = Object.freeze([0, 90, 180, 270]);

export function summed(w, h, at) {
  const S = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += at(x, y); S[(y + 1) * (w + 1) + x + 1] = S[y * (w + 1) + x + 1] + row; }
  }
  return (x0, y0, x1, y1) => {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(w, x1); y1 = Math.min(h, y1);
    if (x1 <= x0 || y1 <= y0) return 0;
    return S[y1 * (w + 1) + x1] - S[y0 * (w + 1) + x1] - S[y1 * (w + 1) + x0] + S[y0 * (w + 1) + x0];
  };
}

export function yardSpans(kind, turn) {
  const F = YARD_FOOT[kind];
  const sx = turn % 2 ? F.hz : F.hx, sz = turn % 2 ? F.hx : F.hz;
  return [Math.ceil((2 * sx) / NAV_CELL - 1e-9), Math.ceil((2 * sz) / NAV_CELL - 1e-9)];
}

/**
 * @param {{width: number, height: number, weightAt: (gx: number, gy: number) => number}} nav
 * @param {{buildings?: number[][], props?: number[][], flats?: number[][], closedBlocks?: number[][], keep?: number[][]}} [o]
 */
export function yardGround(nav, { buildings = [], props = [], flats = [], closedBlocks = [], keep = [] } = {}) {
  const W = nav.width, H = nav.height;
  const blocked = new Uint8Array(W * H), road = new Uint8Array(W * H);
  for (let gy = 0; gy < H; gy++) for (let gx = 0; gx < W; gx++) {
    const w = nav.weightAt(gx, gy), i = gy * W + gx;
    if (!(w > 0)) blocked[i] = 1;
    else if (w === ROAD_WEIGHT) road[i] = 1;
  }
  const closeBox = (b, pad) => {
    if (!Array.isArray(b) || b.length < 4 || !b.every(Number.isFinite)) return;
    const gx0 = Math.max(0, Math.ceil((b[0] - pad) / NAV_CELL - 0.5)), gx1 = Math.min(W - 1, Math.floor((b[2] + pad) / NAV_CELL - 0.5));
    const gy0 = Math.max(0, Math.ceil((b[1] - pad) / NAV_CELL - 0.5)), gy1 = Math.min(H - 1, Math.floor((b[3] + pad) / NAV_CELL - 0.5));
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) blocked[gy * W + gx] = 1;
  };
  const closeDisc = (x, z, r) => {
    if (![x, z, r].every(Number.isFinite)) return;
    const gx0 = Math.max(0, Math.floor((x - r) / NAV_CELL)), gx1 = Math.min(W - 1, Math.floor((x + r) / NAV_CELL));
    const gy0 = Math.max(0, Math.floor((z - r) / NAV_CELL)), gy1 = Math.min(H - 1, Math.floor((z + r) / NAV_CELL));
    const reach = (r + NAV_CELL / 2) ** 2;
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
      // Compares squared distances and never `Math.hypot`, which engines may approximate differently, so every
      // client closes the same cells.
      const dx = (gx + 0.5) * NAV_CELL - x, dz = (gy + 0.5) * NAV_CELL - z;
      if (dx * dx + dz * dz <= reach) blocked[gy * W + gx] = 1;
    }
  };
  for (const b of buildings) closeBox(b, BUILDING_CLEAR_M);
  for (const b of props) closeBox(b, PROP_CLEAR_M);
  for (const f of flats) closeDisc(f[0], f[1], FLAT_CLEAR_M);
  for (const k of keep) closeDisc(k[0], k[1], k[2]);
  for (const [bx, by] of closedBlocks) {
    closeBox([bx * NAV_CELLS_PER_BLOCK * NAV_CELL, by * NAV_CELLS_PER_BLOCK * NAV_CELL, (bx + 1) * NAV_CELLS_PER_BLOCK * NAV_CELL, (by + 1) * NAV_CELLS_PER_BLOCK * NAV_CELL], 0);
  }
  return { width: W, height: H, blocked, road };
}

export function frontStrip(gx, gy, nx, nz, turn) {
  const d = FRONT_ROAD_CELLS;
  if (turn === 0) return [gx, gy + nz, gx + nx, gy + nz + d];
  if (turn === 1) return [gx + nx, gy, gx + nx + d, gy + nz];
  if (turn === 2) return [gx, gy - d, gx + nx, gy];
  return [gx - d, gy, gx, gy + nz];
}

/**
 * @param {{width: number, height: number, blocked: Uint8Array, road: Uint8Array}} g
 * @param {string} kind
 */
export function yardSite(g, kind) {
  if (!g || !YARD_FOOT[kind]) return null;
  const { width: W, height: H } = g;
  const closed = summed(W, H, (x, y) => g.blocked[y * W + x]);
  const roads = summed(W, H, (x, y) => g.road[y * W + x]);
  const pad = Math.ceil(YARD_PAD_M / NAV_CELL - 1e-9);
  const mx = W / 2, my = H / 2;
  let best = null, bestScore = Infinity;
  for (let turn = 0; turn < 4; turn++) {
    const [nx, nz] = yardSpans(kind, turn);
    for (let gy = pad; gy + nz + pad <= H; gy++) {
      for (let gx = pad; gx + nx + pad <= W; gx++) {
        const cx = gx + nx / 2, cy = gy + nz / 2;
        // `Math.sqrt` of an exact sum gives the same result on every engine; `Math.hypot` does not, and would split
        // exact ties across browsers.
        const d = Math.sqrt((cx - mx) * (cx - mx) + (cy - my) * (cy - my));
        if (d > bestScore) continue;
        if (closed(gx - pad, gy - pad, gx + nx + pad, gy + nz + pad) !== 0) continue;
        if (roads(gx, gy, gx + nx, gy + nz) !== 0) continue;
        const s = frontStrip(gx, gy, nx, nz, turn);
        const score = d + (roads(s[0], s[1], s[2], s[3]) > 0 ? 0 : NO_ROAD_COST);
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
    gx: best.gx, gy: best.gy, nx: best.nx, nz: best.nz,
  };
}

export function closeSite(g, s) {
  const gap = Math.ceil(YARD_GAP_M / NAV_CELL - 1e-9);
  for (let gy = Math.max(0, s.gy - gap); gy < Math.min(g.height, s.gy + s.nz + gap); gy++) {
    for (let gx = Math.max(0, s.gx - gap); gx < Math.min(g.width, s.gx + s.nx + gap); gx++) g.blocked[gy * g.width + gx] = 1;
  }
}

export function yardSitesOn(g) {
  const out = [];
  for (const kind of YARD_KIND_ORDER) {
    const s = yardSite(g, kind);
    if (!s) continue;
    out.push(s);
    closeSite(g, s);
  }
  return out;
}

// Placed after the two yards and the port places (`townPlacesFor` in townPlacesWorld.js), so these yards never move
// any of those.
export function craftYardSitesOn(g) {
  const out = [];
  for (const kind of CRAFT_YARD_ORDER) {
    const s = yardSite(g, kind);
    if (!s) continue;
    out.push(s);
    closeSite(g, s);
  }
  return out;
}

/**
 * @param {{width: number, height: number, blocks: any[]}} loc
 * @param {Parameters<typeof yardGround>[1]} [measures]
 */
export function yardSitesOf(loc, measures = {}) {
  const g = townGroundOf(loc, measures);
  return g ? yardSitesOn(g) : [];
}
/**
 * @param {{width: number, height: number, blocks: any[]}} loc
 * @param {Parameters<typeof yardGround>[1]} [measures]
 */
export function townGroundOf(loc, measures = {}) {
  if (!loc?.blocks?.length || !(loc.width > 0) || !(loc.height > 0)) return null;
  const nav = new CityNavigation(loc.width, loc.height);
  for (const b of loc.blocks) {
    const fld = b.dfBlock?.rmbBlock?.fldHeader;
    if (!fld?.autoMapData || !fld.groundData?.groundTiles) continue;
    const tiles = fld.groundData.groundTiles;
    nav.setBlockData(b.x, b.y, fld.autoMapData, (tx, ty) => tiles[tx][ty].textureRecord, { enhancedWater: true });
  }
  return yardGround(nav, measures);
}

/**
 * @param {any} yl
 * @param {{boxOf?: (id: number, at: ArrayLike<number>) => (number[]|null), fieldOf?: (id: number) => any, millBox?: (at: ArrayLike<number>) => (number[]|null), flatsOf?: (block: any) => any[], closedBlock?: (block: any) => boolean}} [measure]
 */
export function yardMeasuresOf(yl, { boxOf = () => null, fieldOf = () => null, millBox = () => null, flatsOf = () => [], closedBlock = () => false } = {}) {
  const buildings = [], props = [], flats = [], closedBlocks = [];
  for (const b of yl?.blocks ?? []) {
    const origin = trs(b.originX, 0, b.originZ, 0, 0, 0);
    if (closedBlock(b)) closedBlocks.push([b.x, b.y]);
    for (const m of b.layout?.models ?? []) {
      const at = multiply(origin, m.matrix);
      const field = fieldOf(m.modelIdNum);
      if (field) { props.push(fieldRect(field, at)); continue; }
      const box = boxOf(m.modelIdNum, at);
      if (box) (m.recordIndex != null ? buildings : props).push(box);
    }
    for (const w of b.layout?.windmills ?? []) { const box = millBox(multiply(origin, w.matrix)); if (box) buildings.push(box); }
    for (const fl of flatsOf(b) ?? []) flats.push([b.originX + fl.x, b.originZ + fl.z]);
  }
  return { buildings, props, flats, closedBlocks };
}
/**
 * @param {any} spec
 * @param {ArrayLike<number>} at
 */
export function fieldRect(spec, at) {
  const n = Number.isFinite(spec?.noise) ? spec.noise : 0;
  const hx = Math.trunc((spec?.rangeX ?? 0) / 2) + n, hz = Math.trunc((spec?.rangeZ ?? 0) / 2) + n;
  return [at[12] - hx, at[14] - hz, at[12] + hx, at[14] + hz];
}
/**
 * @param {number} id
 * @param {ArrayLike<number>} at
 * @param {{custom?: (id: number) => (ArrayLike<number>|null), classic?: (id: number) => any, cache?: Map<number, number[]>|null}} [measure]
 */
export function placedModelBox(id, at, { custom = () => null, classic = () => null, cache = null } = {}) {
  const p = custom(id);
  if (p?.length) {
    let box = cache?.get(id);
    if (!box) { box = localAabb(p); cache?.set(id, box); }
    const w = transformedAabb(box, at);
    return [w[0], w[2], w[3], w[5]];
  }
  const sz = classic(id);
  if (!sz) return null;
  const { min, max } = staticBuildingWorldAabb(staticBuildingBox(sz), at);
  return [min[0], min[2], max[0], max[2]];
}

export function carveYards(nav, sites) {
  if (!nav?.grid) return 0;
  let n = 0;
  for (const s of sites ?? []) {
    for (let gy = s.gy; gy < s.gy + s.nz; gy++) for (let gx = s.gx; gx < s.gx + s.nx; gx++) {
      if (!nav.inBounds(gx, gy)) continue;
      const i = gy * nav.width + gx;
      if (nav.grid[i] !== 0) { nav.grid[i] = 0; n++; }
    }
  }
  return n;
}
