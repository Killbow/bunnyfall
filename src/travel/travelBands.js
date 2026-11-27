// @ts-check
// Bands are a pure function of the map cell, the shared clock, and `BAND_SEED`, so every client computes the same
// bands with nothing sent. Only a chase goes on the wire.
import { seededRng } from '../weather/wind.js';
import { NATIVE_PER_M } from './travelDungeons.js';
import { worldPixelOk } from '../net/wire.js';

export const BAND_CELL_PX = 2;
export const BAND_LIFE_MS = 12 * 60 * 1000;
export const BAND_CHANCE_DAY = 0.75;
export const BAND_CHANCE_NIGHT = 0.9;
export const BAND_WANDER_MPS = 2;
export const BAND_LEG_MS = 50 * 1000;
export const BAND_SIZE_WEIGHTS = Object.freeze([12, 20, 24, 20, 14, 10]);
export const BAND_LEVEL_MAX = 16;
export const BAND_SIGHT_DAY_M = 320;
export const BAND_SIGHT_NIGHT_M = 190;
export const BAND_CHASE_MPS = 5.2;
export const BAND_LEASH_M = 900;
export const BAND_GIVE_UP_MS = 120 * 1000;
export const BAND_CONTACT_M = 30;
export const BAND_STAND_M = 140;
export const BAND_STAND_MIN_M = 18;
export const BAND_STAND_RETRY_MS = 1500;
export const BAND_STAND_TRIES = 5;
export const BAND_REACH_PX = 6;
const PIXEL_NATIVE = 32768;
const BAND_SEED = 0x42414e44;

const seedOf = (cx, cy, life) => (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663) ^ Math.imul(life, 83492791) ^ BAND_SEED) >>> 0;

/** @param {{ cx: number, cy: number, life: number, night: boolean, ok: (x: number, z: number) => boolean }} q */
export function bandOf({ cx, cy, life, night, ok }) {
  const seed = seedOf(cx, cy, life);
  const r = seededRng(seed);
  if (r() >= (night ? BAND_CHANCE_NIGHT : BAND_CHANCE_DAY)) return null;
  const span = BAND_CELL_PX * PIXEL_NATIVE;
  const x = cx * span + r() * span, z = cy * span + r() * span;
  if (!ok(x, z)) return null;
  return { id: `b${cx}.${cy}.${life}`, cx, cy, life, seed, night, born: { x, z }, bornMs: life * BAND_LIFE_MS };
}

// A separate stream from the birth seed, whose first draw is always under the spawn chance and would bias the make
// table roll.
export const bandMakeSeed = (band) => (band.seed ^ 0x4d414b45) >>> 0;

export function bandSizeOf(band) {
  const total = BAND_SIZE_WEIGHTS.reduce((a, w) => a + w, 0);
  let x = seededRng((band.seed ^ 0x53495a45) >>> 0)() * total;
  for (let i = 0; i < BAND_SIZE_WEIGHTS.length; i++) { x -= BAND_SIZE_WEIGHTS[i]; if (x < 0) return i + 1; }
  return BAND_SIZE_WEIGHTS.length;
}

export function bandLevelOf(band) {
  const u = seededRng((band.seed ^ 0x4c45564c) >>> 0)();
  return 1 + Math.floor(BAND_LEVEL_MAX * u ** 2.5);
}

/**
 * @param {any} band
 * @param {number} ms
 * @param {(x: number, z: number) => boolean} ok
 */
export function wanderAt(band, ms, ok) {
  const r = seededRng((band.seed ^ 0x5157) >>> 0);
  let x = band.born.x, z = band.born.z, heading = r() * Math.PI * 2;
  let t = Math.max(0, Math.min(BAND_LIFE_MS, ms - band.bornMs));
  const legNative = (dt) => (BAND_WANDER_MPS * dt / 1000) * NATIVE_PER_M;
  const full = legNative(BAND_LEG_MS);
  while (t > 0) {
    const dt = Math.min(t, BAND_LEG_MS);
    const d = legNative(dt);
    // The turn-back test uses the full leg end even for a partial leg, so the position stays continuous as `ms`
    // grows.
    let go = ok(x + Math.sin(heading) * full, z + Math.cos(heading) * full);
    if (!go) { heading += Math.PI; go = ok(x + Math.sin(heading) * full, z + Math.cos(heading) * full); }
    if (go) { x += Math.sin(heading) * d; z += Math.cos(heading) * d; }
    t -= dt;
    if (dt === BAND_LEG_MS) heading += (r() - 0.5) * Math.PI;
  }
  return { x, z, heading };
}

// Band cells run on native z, while map pixel y runs the other way, so the row flips as 499 - y.
export const bandPixelOf = (mapPixel) => ({ x: mapPixel.x, y: 499 - mapPixel.y });

/** @param {{ at: {x:number,y:number}, ms: number, night: boolean, ok: (x:number, z:number) => boolean, reach?: number }} q */
export function bandsNear({ at, ms, night, ok, reach = BAND_REACH_PX }) {
  const life = Math.floor(ms / BAND_LIFE_MS);
  const c0x = Math.floor((at.x - reach) / BAND_CELL_PX), c1x = Math.floor((at.x + reach) / BAND_CELL_PX);
  const c0y = Math.floor((at.y - reach) / BAND_CELL_PX), c1y = Math.floor((at.y + reach) / BAND_CELL_PX);
  const out = [];
  for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) {
    const b = bandOf({ cx, cy, life, night, ok });
    if (b) out.push(b);
  }
  return out;
}

export const bandSight = (night) => (night ? BAND_SIGHT_NIGHT_M : BAND_SIGHT_DAY_M);

/** @param {{ pos: {x:number,z:number}, feet: {x:number,z:number}, dt: number, scale?: number, contact: number, gainAt: number, now: number, best: number }} q */
export function bandChaseStep({ pos, feet, dt, scale = 1, contact, gainAt, now, best }) {
  const dx = feet.x - pos.x, dz = feet.z - pos.z;
  const dist = Math.hypot(dx, dz) / NATIVE_PER_M;
  const step = Math.min(Math.max(0, dist - contact), BAND_CHASE_MPS * dt * Math.max(1, scale));
  const k = dist > 1e-6 ? (step / dist) : 0;
  const np = { x: pos.x + dx * k, z: pos.z + dz * k };
  const left = dist - step;
  // Closing is measured against the nearest distance so far, in whole meters, so small per-frame gains add up.
  const gained = left < best - 1;
  const closer = gained ? left : best, at = gained ? now : gainAt;
  if (left <= contact) return { pos: np, dist: left, best: closer, gainAt: at, what: 'contact' };
  if (left > BAND_LEASH_M || now - at > BAND_GIVE_UP_MS) return { pos: np, dist: left, best: closer, gainAt: at, what: 'lost' };
  return { pos: np, dist: left, best: closer, gainAt: at, what: null };
}

export function bandLabel(kindName, n) {
  const k = String(kindName ?? '').trim();
  if (n === 1) return k || 'A lone foe';
  return k ? `${k}, ${n}` : `A band, ${n}`;
}

export const BAND_ID_RE = /^b-?\d{1,4}\.-?\d{1,4}\.\d{1,9}$/;
export const BANDS_WIRE_MAX = 8;
export const BAND_WORD_MS = 3000;
// Accepts any pixel the wire carries, including the Eltheric Ocean box where bands and raiders also spawn. Map rows
// count south as 499 - z.
const chaserPlaceOk = (x, z) => Number.isInteger(x) && Number.isInteger(z) && worldPixelOk(Math.floor(x / PIXEL_NATIVE)) && worldPixelOk(499 - Math.floor(z / PIXEL_NATIVE));

/**
 * @param {Map<string, {pos: {x:number, z:number}}>} chases
 * @param {string[]} spent
 */
export function chaseWordOf(chases, spent) {
  const out = [];
  for (const [id, c] of chases ?? []) { if (out.length >= BANDS_WIRE_MAX) break; out.push([id, Math.round(c.pos.x), Math.round(c.pos.z), 1]); }
  for (const id of spent ?? []) { if (out.length >= BANDS_WIRE_MAX) break; out.push([id, 0, 0, 2]); }
  return out;
}

export const bandWordOf = (chases, spent) => chaseWordOf(chases, spent);

/**
 * @param {unknown} raw
 * @param {RegExp} idRe
 */
export function validChaseWord(raw, idRe) {
  if (!Array.isArray(raw)) return [];
  const out = [], seen = new Set();
  for (const e of raw) {
    if (out.length >= BANDS_WIRE_MAX) break;
    if (!Array.isArray(e) || e.length !== 4) continue;
    const [id, x, z, flag] = e;
    if (typeof id !== 'string' || !idRe.test(id) || seen.has(id)) continue;
    if (flag !== 1 && flag !== 2) continue;
    if (flag === 1 && !chaserPlaceOk(x, z)) continue;
    seen.add(id);
    out.push([id, flag === 1 ? x : 0, flag === 1 ? z : 0, flag]);
  }
  return out;
}

export const validBandWord = (raw) => validChaseWord(raw, BAND_ID_RE);

// A peer word naming a band outside this or the previous life, or beyond the reach about this pixel, is dropped so
// a peer cannot grow the tables.
export const bandLifeOf = (id) => Number(String(id).slice(String(id).lastIndexOf('.') + 1));
export function bandNearMe(id, at, life) {
  const m = /^b(-?\d+)\.(-?\d+)\.(\d+)$/.exec(String(id));
  if (!m) return false;
  const l = Number(m[3]);
  if (l !== life && l !== life - 1) return false;
  const reach = BAND_REACH_PX + BAND_CELL_PX;
  return Math.abs(Number(m[1]) * BAND_CELL_PX - at.x) <= reach && Math.abs(Number(m[2]) * BAND_CELL_PX - at.y) <= reach;
}

// When two players chase one band, the lower player id keeps the chase, so every client resolves it alike.
export const chaseYields = (mine, theirs) => String(theirs) < String(mine);
