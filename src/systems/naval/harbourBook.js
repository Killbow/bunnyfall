// @ts-check
// Harbors found near the player, one book for the quays and the naval host. The world host sounds them every
// exterior frame, whatever runs on the water, because a port's quays belong to its town.
import { findHarbour, offsetHarbour, HARBOUR_REACH } from './shipLife.js';
import { SEA_RING } from '../../world/portSites.js';
import { TERRAIN_SIZE, sampleKernel, HEIGHTMAP_DIMENSION } from '../../world/terrainSampler.js';
import { sampleHeight, isWaterHeight } from '../../world/terrainTiles.js';
import { locationWorldRect } from '../../world/streamingWorld.js';

// Terrain streams in nearest-first, so a port sounded on arrival can meet unbuilt water.
export const HARBOUR_RETRY_S = 10;

export const portRingReach = (rect) => (SEA_RING + 0.5) * TERRAIN_SIZE - Math.max(rect.maxX - rect.minX, rect.maxZ - rect.minZ) / 2;

// The 3 x 3 pixels first, in their original order so a port within a pixel stays the same one, then the ring band.
export const HARBOUR_TOWN_ORDER = Object.freeze((() => {
  const out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.push(Object.freeze([dx, dy]));
  for (let dy = -SEA_RING; dy <= SEA_RING; dy++) {
    for (let dx = -SEA_RING; dx <= SEA_RING; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) > 1) out.push(Object.freeze([dx, dy]));
  }
  return out;
})());

// Cached per pixel: the height map never changes during a session.
const DRY = new WeakMap();
/** @param {any} woods @param {number} px @param {number} py */
export function dryPixel(woods, px, py) {
  if (!woods || !(px >= 0 && py >= 0 && px < 1000 && py < 500)) return false;
  let memo = DRY.get(woods);
  if (!memo) DRY.set(woods, memo = new Map());
  const key = py * 1000 + px;
  let d = memo.get(key);
  if (d !== undefined) return d;
  // The kernel without ground noise is a lower bound of every sample, so if it stays above the ocean everywhere,
  // no build of this pixel can show water.
  const k = sampleKernel(woods, px, py, HEIGHTMAP_DIMENSION, false);
  d = true;
  for (let x = 0; x < HEIGHTMAP_DIMENSION && d; x++) for (let y = 0; y < HEIGHTMAP_DIMENSION && d; y++) d = !isWaterHeight(sampleHeight(Math.fround(k(x, y))));
  memo.set(key, d);
  return d;
}

// An unbuilt pixel reads as land, so a point counts as known only when its pixel is built or dry for certain.
/**
 * @param {(x: number, z: number) => any} built
 * @param {{ mapOrigin: { x: number, y: number }, compensation: number[] }} state
 * @param {any} woods
 * @param {number} x
 * @param {number} z
 */
export function harbourKnown(built, state, woods, x, z) {
  if (built(x, z)) return true;
  const c = state.compensation;
  return dryPixel(woods, state.mapOrigin.x + Math.floor((x - c[0]) / TERRAIN_SIZE), state.mapOrigin.y - Math.floor((z - c[2]) / TERRAIN_SIZE));
}

/**
 * @param {{ id: any, loc: any, x: number, y: number, name?: string|null, reach?: number }} t
 * @param {{ state: any, built: (x: number, z: number) => any, woods: any }} deps
 */
export const EDGE_IN = 0.01;
export function harbourOf(t, { state, built, woods }) {
  const r = locationWorldRect(t.loc, t.x, t.y);
  const [ax, az] = state.localFromWorld(r.minX, r.minZ), [bx, bz] = state.localFromWorld(r.maxX, r.maxZ);
  const rect = { minX: Math.min(ax, bx), maxX: Math.max(ax, bx), minZ: Math.min(az, bz), maxZ: Math.max(az, bz) };
  const reach = t.reach ?? HARBOUR_REACH;
  const ready = (r = reach) => {
    const x0 = rect.minX - r, z0 = rect.minZ - r, sx = rect.maxX - rect.minX + 2 * r, sz = rect.maxZ - rect.minZ + 2 * r;
    // Samples sit under 400 m apart, so no 819.2 m pixel lies between two of them. Far edges read a hair inside,
    // since a point on an edge reads as the next pixel.
    const nx = Math.ceil(sx / 400), nz = Math.ceil(sz / 400);
    for (let i = 0; i <= nx; i++) for (let k = 0; k <= nz; k++) if (!harbourKnown(built, state, woods, x0 + Math.min(sx * i / nx, sx - EDGE_IN), z0 + Math.min(sz * k / nz, sz - EDGE_IN))) return false;
    return true;
  };
  return { key: `port:${t.id}`, name: t.name ?? null, rect, ready, reach };
}

/**
 * @param {{
 *   harbourNear: () => ({ key: string, name?: string|null, rect: { minX: number, maxX: number, minZ: number, maxZ: number },
 *     ready?: (reach?: number) => boolean, reach?: number } | null),
 *   isWater: (x: number, z: number, hull: number) => boolean,
 * }} deps
 */
export function createHarbourBook(deps) {
  const book = new Map();

  function step(clock) {
    const near = deps.harbourNear() ?? null;
    if (!near) return;
    for (const one of Array.isArray(near) ? near : [near]) stepOne(one, clock);
  }
  function stepOne(near, clock) {
    const own = near.reach ?? HARBOUR_REACH;
    const sound = (reach = own, square = false) => findHarbour({ rect: near.rect, isWater: (x, z, h) => deps.isWater(x, z, h), reach, square });
    const h = book.get(near.key);
    if (!h) { if (near.ready?.() !== false) book.set(near.key, { key: near.key, name: near.name ?? null, harbour: sound(), at: clock }); }
    else if (!h.harbour && clock - h.at >= HARBOUR_RETRY_S && near.ready?.() !== false) { h.harbour = sound(); h.at = clock; }
    const e = book.get(near.key), far = own === HARBOUR_REACH ? portRingReach(near.rect) : 0;
    if (e && !e.harbour && !e.far && far > own && near.ready?.(far) !== false) { e.harbour = sound(far) ?? sound(far, true); e.far = true; }
  }
  function offsetAll(o) { for (const h of book.values()) offsetHarbour(h.harbour, o); }
  function clear() { book.clear(); }
  function list() {
    const out = [];
    for (const h of book.values()) if (h.harbour?.berths?.length) out.push({ key: h.key, name: h.name ?? null, harbour: h.harbour });
    return out;
  }
  return { step, offsetAll, clear, list, get: (key) => book.get(key), values: () => book.values() };
}
