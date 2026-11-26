// @ts-check
import { mapPixelToWorldCoord, worldCoordToMapPixel } from '../../formats/mapsFile.js';
import { seededRng } from '../../weather/wind.js';
import { chaseWordOf, validChaseWord, BANDS_WIRE_MAX } from '../../travel/travelBands.js';

export { seededRng };

export const NATIVE_PIXEL = 32768;
export const RAIDER_CELL_PX = 6;
export const RAIDER_LIFE_MS = 20 * 60 * 1000;
export const RAIDER_CHANCE = 0.35;
export const RAIDER_SAIL_MPS = 3;
export const RAIDER_LEG_MS = 120000;
export const RAIDER_SIGHT_M = 1000;
export const RAIDER_SIGHT_NIGHT_M = 500;
export const RAIDER_CHASE_MPS = 4.2;
export const RAIDER_LEASH_M = 3000;
export const RAIDER_GIVE_UP_MS = 180000;
export const RAIDER_CONTACT_M = 60;
export const RAIDER_CONTACT_PLAY_M = 120;
export const RAIDER_REACH_PX = 12;
export const RAIDER_LABEL = 'Pirates';
const RAIDER_SEED = 0x52414944;
const M = NATIVE_PIXEL / 819.2;

export const nativeOfPixel = (px, py) => { const w = mapPixelToWorldCoord(px, py); return { x: w.x, z: w.y }; };
export const pixelOfNative = (x, z) => worldCoordToMapPixel(x, z);

// Shared by seed, never sent: a raider and its course depend only on its cell, its life, and the shared clock.
const seedOf = (cx, cy, life) => (Math.imul(cx + 1013, 73856093) ^ Math.imul(cy + 2029, 19349663) ^ Math.imul(life + 7, 83492791) ^ RAIDER_SEED) >>> 0;

/** @param {{ cx: number, cy: number, life: number, open: (px: number, py: number) => boolean }} q */
export function raiderOf({ cx, cy, life, open }) {
  const seed = seedOf(cx, cy, life);
  const r = seededRng(seed);
  if (r() >= RAIDER_CHANCE) return null;
  const px = cx * RAIDER_CELL_PX + Math.floor(r() * RAIDER_CELL_PX), py = cy * RAIDER_CELL_PX + Math.floor(r() * RAIDER_CELL_PX);
  if (!open(px, py)) return null;
  const o = nativeOfPixel(px, py);
  return { id: `r${cx}.${cy}.${life}`, cx, cy, life, seed, born: { x: o.x + r() * NATIVE_PIXEL, z: o.z + r() * NATIVE_PIXEL }, bornMs: life * RAIDER_LIFE_MS, heading0: r() * Math.PI * 2 };
}

export const RAIDER_LEG_PROBES = 16;

/** @returns {{ x: number, z: number, heading: number }} */
export function raiderAt(raider, ms, sea) {
  const r = seededRng(raider.seed ^ 0x9e3779b9);
  const t = Math.max(0, Math.min(RAIDER_LIFE_MS, ms - raider.bornMs));
  const legs = Math.floor(t / RAIDER_LEG_MS);
  let x = raider.born.x, z = raider.born.z, h = raider.heading0;
  const step = RAIDER_SAIL_MPS * M * (RAIDER_LEG_MS / 1000);
  // A leg's way is chosen by the whole leg, so a raider never flips mid-leg or cuts across a cape.
  const clear = (hd) => {
    for (let k = 1; k <= RAIDER_LEG_PROBES; k++) {
      const f = (step * k) / RAIDER_LEG_PROBES;
      if (!sea(x + Math.sin(hd) * f, z + Math.cos(hd) * f)) return false;
    }
    return true;
  };
  const sail = (frac) => {
    const way = clear(h) ? h : clear(h + Math.PI) ? h + Math.PI : null;
    if (way == null) return;
    h = way;
    x += Math.sin(h) * step * frac; z += Math.cos(h) * step * frac;
  };
  for (let k = 0; k < legs; k++) {
    sail(1);
    h += (r() - 0.5) * Math.PI;
  }
  sail((t - legs * RAIDER_LEG_MS) / RAIDER_LEG_MS);
  return { x, z, heading: h };
}

/** @param {{ at: {x:number,y:number}, ms: number, open: (px:number, py:number) => boolean, sea: (x:number, z:number) => boolean, reach?: number }} q */
export function raidersNear({ at, ms, open, sea, reach = RAIDER_REACH_PX }) {
  const life = Math.floor(ms / RAIDER_LIFE_MS);
  const c0x = Math.floor((at.x - reach) / RAIDER_CELL_PX), c1x = Math.floor((at.x + reach) / RAIDER_CELL_PX);
  const c0y = Math.floor((at.y - reach) / RAIDER_CELL_PX), c1y = Math.floor((at.y + reach) / RAIDER_CELL_PX);
  const out = [];
  for (let cy = c0y; cy <= c1y; cy++) {
    for (let cx = c0x; cx <= c1x; cx++) {
      const raider = raiderOf({ cx, cy, life, open });
      if (raider) out.push({ ...raider, ...raiderAt(raider, ms, sea) });
    }
  }
  return out;
}

export const raiderSight = (night) => (night ? RAIDER_SIGHT_NIGHT_M : RAIDER_SIGHT_M);

/**
 * @param {{ pos: {x:number,z:number}, quarry: {x:number,z:number}, dt: number, scale: number, contact: number, now: number,
 *   best: number, bestAt: number, sea: (x:number, z:number) => boolean }} q
 */
export function chaseStep({ pos, quarry, dt, scale, contact, now, best, bestAt, sea }) {
  const dx = quarry.x - pos.x, dz = quarry.z - pos.z;
  const dist = Math.hypot(dx, dz) / M;
  const move = Math.min(dist, RAIDER_CHASE_MPS * dt * Math.max(1, scale));
  const k = dist > 0 ? move / dist : 0;
  const next = { x: pos.x + dx * k, z: pos.z + dz * k };
  const left = dist - move;
  if (left <= contact) return { state: 'contact', pos: next, left, best: Math.min(best, left), bestAt: now };
  if (!sea(next.x, next.z)) return { state: 'lost', pos, left: dist, best, bestAt };
  const gained = left < best - 1;
  const b = gained ? left : best, at = gained ? now : bestAt;
  if (left > RAIDER_LEASH_M || now - at > RAIDER_GIVE_UP_MS) return { state: 'lost', pos: next, left, best: b, bestAt: at };
  return { state: 'chase', pos: next, left, best: b, bestAt: at };
}

// Matches the wire id raiderOf makes: r<cx>.<cy>.<life>.
export const RAIDER_ID_RE = /^r-?\d{1,4}\.-?\d{1,4}\.\d{1,9}$/;
export const RAIDERS_WIRE_MAX = BANDS_WIRE_MAX;
export const RAIDER_WORD_MS = 3000;
export const raiderWordOf = (chases, spent) => chaseWordOf(chases, spent);
export const validRaiderWord = (raw) => validChaseWord(raw, RAIDER_ID_RE);
export const raiderLifeOf = (id) => Number(String(id).slice(String(id).lastIndexOf('.') + 1));
export function raiderNearMe(id, at, life) {
  const m = /^r(-?\d+)\.(-?\d+)\.(\d+)$/.exec(String(id));
  if (!m) return false;
  const l = Number(m[3]);
  if (l !== life && l !== life - 1) return false;
  const reach = RAIDER_REACH_PX + RAIDER_CELL_PX;
  return Math.abs(Number(m[1]) * RAIDER_CELL_PX - at.x) <= reach && Math.abs(Number(m[2]) * RAIDER_CELL_PX - at.y) <= reach;
}
