// @ts-check
import { REGION_NAMES } from '../formats/mapsTables.js';
import { CityNavigation, NAV_CELL, HALF_CELL } from './cityNavigation.js';
import { THROWN_FLOWERS } from '../arena/arenaCrowd.js';
import { ROAD_WEIGHT } from './gothwayBoards.js';
import { locationStartMarkers } from './locationEntrance.js';
import { collectMiscFlats } from './rmbFlats.js';

export const LEFAY_TOWN = 'Privateer\'s Hold';
export const LEFAY_REGION = REGION_NAMES.indexOf('Daggerfall');
export const isLefayTown = (loc) => !!loc && loc.regionIndex === LEFAY_REGION && loc.name === LEFAY_TOWN;

export const LEFAY_TEXT = Object.freeze({
  title: 'Monument to Julian LeFay',
  years: '1965 - 2025',
  epithet: 'Father of The Elder Scrolls',
  plaque: Object.freeze(['JULIAN LEFAY', '1965 - 2025', 'FATHER OF', 'THE ELDER SCROLLS']),
  read: Object.freeze([
    'Julian LeFay, 1965 - 2025.',
    'Father of The Elder Scrolls, and one of the makers of Daggerfall.',
    'Travelers lay flowers at his stone.',
  ]),
  laid: 'You lay flowers for Julian LeFay.',
  steal: 'You leave the flowers where they lie.',
  count: (n) => `You have laid ${n} ${n === 1 ? 'flower' : 'flowers'} here`,
});
export const LEFAY_ROWS = Object.freeze([
  Object.freeze({ id: 'flowers', label: 'Throw flowers' }),
  Object.freeze({ id: 'read', label: 'Read the inscription' }),
]);
// The activation box and the collider bucket share this key, so the activation ray from a player on the steps hits
// the monument itself.
export const LEFAY_KEY = 'lefay:monument';

// Must exceed `MONUMENT_CARVE_M` by at least a cell, so walkers have a ring of open cells around the carved disc.
export const MONUMENT_CLEAR_M = 5.8;
export const MONUMENT_SEARCH_CELLS = 48;
export const MONUMENT_ROAD_COST = 0.3;
export const MONUMENT_CARVE_M = 3.6;
export const MONUMENT_LANDING_M = 3.2;
export const MONUMENT_DOOR_BACK_M = 4;
export const MONUMENT_WALK_M = 8;
export const MONUMENT_CAMP_KEEP_M = 4;
export const MONUMENT_RUIN_KEEP_M = 8;
export const isRuinModel = (modelId) => modelId >= 43500 && modelId < 43600;

export function discCells(m) {
  const r = Math.floor(m / NAV_CELL), out = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.hypot(dx, dy) * NAV_CELL <= m) out.push([dx, dy]);
  return out.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
}
const CLEAR_DISC = discCells(MONUMENT_CLEAR_M);
const CARVE_DISC = discCells(MONUMENT_CARVE_M);

/**
 * @param {{width: number, height: number, weightAt: (gx: number, gy: number) => number}} nav
 * @param {{gx: number, gy: number}|null} [from]
 */
export function lefaySpot(nav, from = null) {
  if (!nav || !(nav.width > 0) || !(nav.height > 0)) return null;
  const mx = from ? from.gx + 0.5 : nav.width / 2, my = from ? from.gy + 0.5 : nav.height / 2;
  let best = null, bestScore = Infinity;
  const y0 = Math.max(0, Math.floor(my - MONUMENT_SEARCH_CELLS)), y1 = Math.min(nav.height - 1, Math.ceil(my + MONUMENT_SEARCH_CELLS));
  const x0 = Math.max(0, Math.floor(mx - MONUMENT_SEARCH_CELLS)), x1 = Math.min(nav.width - 1, Math.ceil(mx + MONUMENT_SEARCH_CELLS));
  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      const d = Math.hypot(gx + 0.5 - mx, gy + 0.5 - my);
      if (d > MONUMENT_SEARCH_CELLS || d >= bestScore) continue;
      let open = true, roads = 0;
      for (const [dx, dy] of CLEAR_DISC) {
        const w = nav.weightAt(gx + dx, gy + dy);
        if (!(w > 0)) { open = false; break; }
        if (w === ROAD_WEIGHT) roads++;
      }
      if (!open) continue;
      const score = d + roads * MONUMENT_ROAD_COST;
      if (score < bestScore) { bestScore = score; best = { gx, gy }; }
    }
  }
  return best ? { gx: best.gx, gy: best.gy, x: best.gx * NAV_CELL + HALF_CELL, z: best.gy * NAV_CELL + HALF_CELL } : null;
}

function closeRound(nav, x, z, m) {
  const r = Math.ceil(m / NAV_CELL) + 1, [cx, cy] = [Math.floor(x / NAV_CELL), Math.floor(z / NAV_CELL)];
  for (let gy = cy - r; gy <= cy + r; gy++) {
    for (let gx = cx - r; gx <= cx + r; gx++) {
      if (nav.inBounds(gx, gy) && Math.hypot(gx * NAV_CELL + HALF_CELL - x, gy * NAV_CELL + HALF_CELL - z) <= m) nav.grid[gy * nav.width + gx] = 0;
    }
  }
}

/**
 * The carve always uses the enhanced water table, because the classic table treats some shallow water as open and
 * clients with different water settings would pick different spots.
 * @param {{width: number, height: number, blocks: any[]}} loc
 * @param {{camp?: {block: string, models: ReadonlyArray<{modelId: number, pos: ArrayLike<number>}>}|null, exit?: {x: number, z: number, nx: number, nz: number}|null}} [opts]
 */
export function lefaySpotOf(loc, { camp = null, exit = null } = {}) {
  if (!loc?.blocks?.length || !(loc.width > 0) || !(loc.height > 0)) return null;
  const nav = new CityNavigation(loc.width, loc.height);
  for (const b of loc.blocks) {
    const fld = b.dfBlock?.rmbBlock?.fldHeader;
    if (!fld?.autoMapData || !fld.groundData?.groundTiles) continue;
    const tiles = fld.groundData.groundTiles;
    nav.setBlockData(b.x, b.y, fld.autoMapData, (tx, ty) => tiles[tx][ty].textureRecord, { enhancedWater: true });
  }
  if (camp?.models?.length) {
    for (const b of loc.blocks) {
      if (b.blockName !== camp.block) continue;
      for (const m of camp.models) closeRound(nav, (b.originX ?? 0) + m.pos[0], (b.originZ ?? 0) + m.pos[2], isRuinModel(m.modelId) ? MONUMENT_RUIN_KEEP_M : MONUMENT_CAMP_KEEP_M);
    }
  }
  if (exit && [exit.x, exit.z, exit.nx, exit.nz].every(Number.isFinite)) {
    const l = Math.hypot(exit.nx, exit.nz) || 1, nx = exit.nx / l, nz = exit.nz / l;
    for (let t = -MONUMENT_DOOR_BACK_M; t <= MONUMENT_WALK_M + 1e-9; t += HALF_CELL) closeRound(nav, exit.x + nx * t, exit.z + nz * t, MONUMENT_LANDING_M);
    const at = nav.worldToNav(exit.x, exit.z);
    return lefaySpot(nav, { gx: at[0], gy: at[1] });
  }
  const markers = locationStartMarkers(loc.blocks.map((b) => ({
    originX: b.originX, originZ: b.originZ, flats: b.dfBlock?.rmbBlock?.miscFlatObjectRecords ? collectMiscFlats(b.dfBlock) : [],
  })));
  for (const [x, , z] of markers) closeRound(nav, x, z, MONUMENT_LANDING_M);
  const from = markers.length ? nav.worldToNav(markers[0][0], markers[0][2]) : null;
  return lefaySpot(nav, from && { gx: from[0], gy: from[1] });
}

export const lefayExitOf = (landing, origin = [0, 0, 0]) => (landing?.pos && landing?.normal
  ? { x: landing.pos[0] - origin[0], z: landing.pos[2] - origin[2], nx: landing.normal[0], nz: landing.normal[2] } : null);

export function carveLefay(nav, spot) {
  if (!nav?.grid || !spot) return 0;
  let n = 0;
  for (const [dx, dy] of CARVE_DISC) {
    const gx = spot.gx + dx, gy = spot.gy + dy;
    if (!nav.inBounds(gx, gy)) continue;
    const i = gy * nav.width + gx;
    if (nav.grid[i] !== 0) { nav.grid[i] = 0; n++; }
  }
  return n;
}

export const LEFAY_ARCHIVE = 38211;
export const LEFAY_GRANITE = 0;
export const LEFAY_MARBLE = 1;
export const LEFAY_GILT = 2;
export const LEFAY_PLAQUE = 3;
export const LEFAY_BRONZE = 4;
export const STONE_TILE_M = 1.6;
export const MONUMENT_FOOT = 0.4;
export const MONUMENT_STEPS = Object.freeze([
  Object.freeze({ r: 2.8, top: 0.3 }),
  Object.freeze({ r: 2.15, top: 0.6 }),
  Object.freeze({ r: 1.5, top: 0.9 }),
]);
export const PEDESTAL = Object.freeze({
  baseHalf: 0.82, baseTop: 1.05,
  dieHalf: 0.7, dieTop: 2.45,
  corniceHalf: 0.84, corniceTop: 2.65,
});
export const OBELISK = Object.freeze({ footHalf: 0.46, topHalf: 0.28, top: 6.4, apex: 6.95 });
export const PLAQUE = Object.freeze({ w: 1.0, h: 0.8, mid: 1.75, proud: 0.03 });
export const MONUMENT_BOXES = Object.freeze([
  Object.freeze([-MONUMENT_STEPS[0].r, 0, -MONUMENT_STEPS[0].r, MONUMENT_STEPS[0].r, MONUMENT_STEPS[2].top, MONUMENT_STEPS[0].r]),
  Object.freeze([-PEDESTAL.corniceHalf, 0, -PEDESTAL.corniceHalf, PEDESTAL.corniceHalf, OBELISK.apex, PEDESTAL.corniceHalf]),
]);

/**
 * @param {number[]} a
 * @param {number[]} b
 */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
/**
 * @param {number[]} a
 * @param {number[]} b
 */
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** @param {number[]} a */
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function faces() {
  /** @type {Map<number, {p: number[], n: number[], uv: number[]}>} */
  const byRec = new Map();
  const tri = (rec, a, b, c, ua, ub, uc) => {
    let g = byRec.get(rec);
    if (!g) byRec.set(rec, g = { p: [], n: [], uv: [] });
    const n = norm(cross(sub(b, a), sub(c, a)));
    for (const [v, u] of [[a, ua], [b, ub], [c, uc]]) { g.p.push(v[0], v[1], v[2]); g.n.push(n[0], n[1], n[2]); g.uv.push(u[0], u[1]); }
  };
  const quad = (rec, a, b, c, d, ua, ub, uc, ud) => { tri(rec, a, b, c, ua, ub, uc); tri(rec, a, c, d, ua, uc, ud); };
  return { tri, quad, byRec };
}

function frustum(f, rec, sides, r0, r1, y0, y1, { cap = true, capRec = rec, under = false } = {}) {
  const turn = Math.PI / sides;
  const at = (k, r, y) => { const a = (k / sides) * Math.PI * 2 - turn; return [Math.cos(a) * r, y, Math.sin(a) * r]; };
  const edge = 2 * Math.sin(Math.PI / sides);
  const v = (y1 - y0) / STONE_TILE_M;
  for (let k = 0; k < sides; k++) {
    const b0 = at(k, r0, y0), b1 = at(k + 1, r0, y0), t1 = at(k + 1, r1, y1), t0 = at(k, r1, y1);
    const u0 = (r0 * edge) / STONE_TILE_M, u1 = (r1 * edge) / STONE_TILE_M;
    if (r1 > 0) f.quad(rec, b0, t0, t1, b1, [0, v], [(u0 - u1) / 2, 0], [(u0 + u1) / 2, 0], [u0, v]);
    else f.tri(rec, b0, t0, b1, [0, v], [u0 / 2, 0], [u0, v]);
    const uv = (p) => [0.5 + p[0] / STONE_TILE_M, 0.5 + p[2] / STONE_TILE_M];
    if (cap && r1 > 0) { const c = [0, y1, 0]; f.tri(capRec, c, t1, t0, uv(c), uv(t1), uv(t0)); }
    if (under) { const c = [0, y0, 0]; f.tri(capRec, c, b0, b1, uv(c), uv(b0), uv(b1)); }
  }
}

const block = (f, rec, h, y0, y1, under = false) => frustum(f, rec, 4, h * Math.SQRT2, h * Math.SQRT2, y0, y1, { under });

function plaque(f, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const { w, h, mid, proud } = PLAQUE, d0 = PEDESTAL.dieHalf, d1 = d0 + proud;
  // The world is left-handed (world +x lands screen right), so seen from outside, `across` runs to the right and
  // the left edge of the picture is at -across.
  const P = (out, across, y) => [c * out - s * across, y, s * out + c * across];
  const y0 = mid - h / 2, y1 = mid + h / 2, hw = w / 2;
  f.quad(LEFAY_PLAQUE, P(d1, hw, y1), P(d1, hw, y0), P(d1, -hw, y0), P(d1, -hw, y1), [1, 0], [1, 1], [0, 1], [0, 0]);
  const e = [0, 0], g = [1, 0.1];
  f.quad(LEFAY_BRONZE, P(d0, hw, y1), P(d1, hw, y1), P(d1, -hw, y1), P(d0, -hw, y1), e, g, g, e);
  f.quad(LEFAY_BRONZE, P(d0, -hw, y0), P(d1, -hw, y0), P(d1, hw, y0), P(d0, hw, y0), e, g, g, e);
  f.quad(LEFAY_BRONZE, P(d0, hw, y0), P(d1, hw, y0), P(d1, hw, y1), P(d0, hw, y1), e, g, g, e);
  f.quad(LEFAY_BRONZE, P(d0, -hw, y1), P(d1, -hw, y1), P(d1, -hw, y0), P(d0, -hw, y0), e, g, g, e);
}

function assemble(f) {
  const recs = [...f.byRec.keys()].sort((a, b) => a - b);
  const count = recs.reduce((n, r) => n + f.byRec.get(r).p.length / 3, 0);
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), uvs = new Float32Array(count * 2);
  const indices = new Uint32Array(count);
  const subMeshes = [];
  let v = 0;
  for (const rec of recs) {
    const g = f.byRec.get(rec), n = g.p.length / 3;
    positions.set(g.p, v * 3); normals.set(g.n, v * 3); uvs.set(g.uv, v * 2);
    for (let i = 0; i < n; i++) indices[v + i] = v + i;
    subMeshes.push({ textureArchive: LEFAY_ARCHIVE, textureRecord: rec, startIndex: v, primitiveCount: n / 3 });
    v += n;
  }
  return { positions, normals, uvs, indices, subMeshes };
}

export function buildLefayModel() {
  const f = faces();
  let y = -MONUMENT_FOOT;
  for (const step of MONUMENT_STEPS) { frustum(f, LEFAY_GRANITE, 8, step.r, step.r, y, step.top); y = step.top; }
  const P = PEDESTAL;
  block(f, LEFAY_MARBLE, P.baseHalf, y, P.baseTop);
  block(f, LEFAY_MARBLE, P.dieHalf, P.baseTop, P.dieTop);
  block(f, LEFAY_MARBLE, P.corniceHalf, P.dieTop, P.corniceTop, true);
  const O = OBELISK;
  frustum(f, LEFAY_MARBLE, 4, O.footHalf * Math.SQRT2, O.topHalf * Math.SQRT2, P.corniceTop, O.top, { cap: false });
  frustum(f, LEFAY_GILT, 4, O.topHalf * Math.SQRT2, 0, O.top, O.apex, { cap: false });
  for (let k = 0; k < 4; k++) plaque(f, (k * Math.PI) / 2);
  return assemble(f);
}

export const LEFAY_FLOWERS = THROWN_FLOWERS;
export const FLOWER_SCALE = 0.55;
export const MONUMENT_FLOWERS_KEPT = 48;
export const TOSS_MS = 850;
export const TOSS_ARC = 0.9;
export const TOSS_EVERY_MS = 1200;
export const TOSS_SPREAD = 0.7;
export const FLOWER_RINGS = Object.freeze([
  Object.freeze({ y: MONUMENT_STEPS[2].top, r0: 1.22, r1: 1.32, share: 0.35 }),
  Object.freeze({ y: MONUMENT_STEPS[1].top, r0: 1.6, r1: 1.9, share: 0.3 }),
  Object.freeze({ y: MONUMENT_STEPS[0].top, r0: 2.25, r1: 2.5, share: 0.2 }),
  Object.freeze({ y: 0, r0: 2.95, r1: 3.3, share: 0.15 }),
]);

/**
 * The entry `[deg, kind, ring, across]` is the saved form: whole degrees, an index into `LEFAY_FLOWERS`, a ring
 * index, and a step from 0 to 9 across the ring.
 * @param {number} bearing
 * @param {() => number} rand
 */
export function tossRest(bearing, rand) {
  let pick = rand(), ring = FLOWER_RINGS.length - 1;
  for (let i = 0; i < FLOWER_RINGS.length; i++) { if (pick < FLOWER_RINGS[i].share) { ring = i; break; } pick -= FLOWER_RINGS[i].share; }
  const a = bearing + (rand() * 2 - 1) * TOSS_SPREAD;
  const deg = ((Math.round((a * 180) / Math.PI) % 360) + 360) % 360;
  const kind = Math.min(LEFAY_FLOWERS.length - 1, Math.floor(rand() * LEFAY_FLOWERS.length));
  const across = Math.min(9, Math.floor(rand() * 10));
  return [deg, kind, ring, across];
}

export function flowerPlace(entry) {
  const [deg, , ring, across] = entry;
  const R = FLOWER_RINGS[ring] ?? FLOWER_RINGS[FLOWER_RINGS.length - 1];
  const a = (deg * Math.PI) / 180, r = R.r0 + ((R.r1 - R.r0) * across) / 9;
  return [Math.sin(a) * r, R.y, Math.cos(a) * r];
}

export function tossPoint(from, to, k, out = [0, 0, 0]) {
  const t = Math.min(1, Math.max(0, k));
  const u = 1 - t;
  out[0] = from[0] * u + to[0] * t;
  out[1] = from[1] * u + to[1] * t + (t > 0 && t < 1 ? Math.sin(Math.PI * t) * TOSS_ARC : 0);
  out[2] = from[2] * u + to[2] * t;
  return out;
}

const normalEntry = (e) => {
  if (!Array.isArray(e) || e.length !== 4 || ![0, 1, 2, 3].every((i) => Number.isSafeInteger(e[i]))) return null;
  const [deg, kind, ring, across] = e;
  if (deg < 0 || deg >= 360 || kind < 0 || kind >= LEFAY_FLOWERS.length || ring < 0 || ring >= FLOWER_RINGS.length || across < 0 || across > 9) return null;
  return [deg, kind, ring, across];
};
export function normalTribute(t) {
  const laid = Array.isArray(t?.laid) ? t.laid.map(normalEntry).filter(Boolean).slice(-MONUMENT_FLOWERS_KEPT) : [];
  const count = Number.isSafeInteger(t?.count) && t.count > 0 ? t.count : 0;
  return { count: Math.max(count, laid.length), laid };
}
export function layFlower(t, entry) {
  const n = normalTribute(t), e = normalEntry(entry);
  if (!e) return n;
  return { count: n.count + 1, laid: [...n.laid, e].slice(-MONUMENT_FLOWERS_KEPT) };
}
