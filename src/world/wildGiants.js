// @ts-check
import { CROMWARK_ON } from './wild/cromwark.js';
import { WILD_RINGS } from './wildZone.js';

export const WILD_GIANTS_PER_RING = 2;
export const WILD_GIANT_COUNT = WILD_GIANTS_PER_RING * WILD_RINGS;
export const WILD_GIANT_LEG_MS = 20 * 60_000;
export const WILD_GIANT_ROAM_PX = 5;
export const WILD_GIANT_RESPAWN_MS = 30 * 60_000;
export const WILD_GIANT_STAND_M = 320;
export const WILD_GIANT_FIELD_M = 160;
export const WILD_GIANT_CULL_M = WILD_GIANT_STAND_M + WILD_GIANT_FIELD_M + 40;
export const GIANT_CLEAR_R = 2.5;
export const GIANT_CLEAR_LIFT = 3;
/**
 * @param {{ sphereOverlaps?: (c: number[], r: number) => boolean, insideSolid?: (p: number[]) => boolean } | null} collider
 * @param {number} x
 * @param {number} h
 * @param {number} z
 */
export function giantGroundBlocked(collider, x, h, z) {
  if (!collider) return false;
  const c = [x, h + GIANT_CLEAR_LIFT, z];
  return !!(collider.sphereOverlaps?.(c, GIANT_CLEAR_R) || collider.insideSolid?.(c));
}
const DAY_MS = 24 * 3_600_000;

const mix = (a, b) => { let h = (a ^ Math.imul(b + 0x7f4a7c15, 0x9e3779b1)) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0; return (h ^ (h >>> 16)) >>> 0; };
const ringOf = (mask, i) => {
  const d = mask.depth?.[i] ?? 0;
  if (!d || !mask.maxDepth) return 0;
  return Math.max(1, Math.min(WILD_RINGS, Math.ceil((d / mask.maxDepth) * WILD_RINGS)));
};

export const wildGiantRing = (g) => Math.floor((g | 0) / WILD_GIANTS_PER_RING) + 1;

const _cells = new WeakMap();
export const WILD_GIANT_LOW_SHARE = 0.5;
function cellsOf(mask, free, heightAt = null) {
  let c = _cells.get(mask);
  if (c && c.free === free) return c;
  const box = mask.box ?? { x0: 0, y0: 0, x1: mask.width - 1, y1: mask.height - 1 };
  const all = Array.from({ length: WILD_RINGS + 1 }, () => []);
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const r = ringOf(mask, y * mask.width + x);
      if (r && free(x, y)) all[r].push({ x, y });
    }
  }
  if (heightAt) {
    for (let r = 1; r <= WILD_RINGS; r++) {
      const list = all[r];
      if (list.length < 8) continue;
      const hs = list.map((p) => heightAt(p.x, p.y)).sort((a, b) => a - b);
      const cut = hs[Math.floor((hs.length - 1) * WILD_GIANT_LOW_SHARE)];
      all[r] = list.filter((p) => heightAt(p.x, p.y) <= cut);
    }
  }
  c = { free, all, legs: new Map(), homes: new Map(), mask };
  _cells.set(mask, c);
  return c;
}

function homeOf(c, g, day) {
  const key = `${g}:${day}`;
  let h = c.homes.get(key);
  if (h !== undefined) return h;
  const list = c.all[wildGiantRing(g)];
  if (!list.length) { c.homes.set(key, null); return null; }
  h = list[mix(day * 31 + 7, g) % list.length];
  if (g % WILD_GIANTS_PER_RING === 1) {
    const first = homeOf(c, g - 1, day);
    for (let k = 1; k < 8 && first; k++) {
      const q = list[mix(day * 31 + 7 + k * 101, g) % list.length];
      if (Math.hypot(q.x - first.x, q.y - first.y) > Math.hypot(h.x - first.x, h.y - first.y)) h = q;
    }
  }
  c.homes.set(key, h);
  if (c.homes.size > 256) c.homes.delete(c.homes.keys().next().value);
  return h;
}

function waypointOf(c, g, leg) {
  const key = `${g}:${leg}`;
  let w = c.legs.get(key);
  if (w !== undefined) return w;
  const day = Math.floor((leg * WILD_GIANT_LEG_MS) / DAY_MS);
  const home = homeOf(c, g, day);
  if (!home) { c.legs.set(key, null); return null; }
  const first = Math.floor(((leg - 1) * WILD_GIANT_LEG_MS) / DAY_MS) !== day;
  const prev = first ? null : waypointOf(c, g, leg - 1);
  const near = c.all[wildGiantRing(g)].filter((p) => Math.abs(p.x - home.x) <= WILD_GIANT_ROAM_PX && Math.abs(p.y - home.y) <= WILD_GIANT_ROAM_PX && (!prev || lineInside(c.mask, prev, p)));
  w = first ? home : near.length ? near[mix(leg, g * 977 + 13) % near.length] : (prev ?? home);
  c.legs.set(key, w);
  if (c.legs.size > 4096) c.legs.delete(c.legs.keys().next().value);
  return w;
}
function lineInside(mask, a, b) {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 4));
  for (let k = 0; k <= n; k++) {
    const x = Math.floor(a.x + 0.5 + ((b.x - a.x) * k) / n), y = Math.floor(a.y + 0.5 + ((b.y - a.y) * k) / n);
    if (x < 0 || y < 0 || x >= mask.width || y >= mask.height || !ringOf(mask, y * mask.width + x)) return false;
  }
  return true;
}

/**
 * @param {{ width:number, height:number, depth:ArrayLike<number>, maxDepth:number, box?:object }} mask
 * @param {(x:number, y:number) => boolean} free
 * @param {number} now
 * @param {(g:number) => boolean} [dead]
 * @param {((x:number, y:number) => number)|null} [heightAt]
 */
export function wildGiantsAt(mask, free, now, dead = () => false, heightAt = null) {
  if (CROMWARK_ON || !mask?.depth || !mask.maxDepth) return [];
  const c = cellsOf(mask, free, heightAt);
  const out = [];
  for (let g = 0; g < WILD_GIANT_COUNT; g++) {
    if (dead(g)) continue;
    const t = now + g * 157_000;
    const leg = Math.floor(t / WILD_GIANT_LEG_MS);
    const f = (t - leg * WILD_GIANT_LEG_MS) / WILD_GIANT_LEG_MS;
    const a = waypointOf(c, g, leg), b = waypointOf(c, g, leg + 1);
    if (!a || !b) continue;
    let x = a.x + 0.5 + (b.x - a.x) * f, y = a.y + 0.5 + (b.y - a.y) * f;
    const xi = Math.floor(x), yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= mask.width || yi >= mask.height || !ringOf(mask, yi * mask.width + xi)) { const p = f < 0.5 ? a : b; x = p.x + 0.5; y = p.y + 0.5; }
    out.push({ g, ring: wildGiantRing(g), x, y, heading: Math.atan2(b.y - a.y, b.x - a.x) });
  }
  return out;
}
