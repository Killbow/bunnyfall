// @ts-check
import { WILD_RINGS } from './wildZone.js';
import { WATER_SPECIES } from '../characters/dungeonEnemies.js';
import { isClassEnemyId } from '../characters/enemyBasics.js';

export const WILD_DUNGEONS_PER_RING = Object.freeze([10, 8, 6, 4]);
export const WILD_HALL_SPACING = 3;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ringOf = (mask, i) => {
  const d = mask.depth?.[i] ?? 0;
  if (!d || !mask.maxDepth) return 0;
  return Math.max(1, Math.min(WILD_RINGS, Math.ceil((d / mask.maxDepth) * WILD_RINGS)));
};
export function wildRingBorderDistance(mask) {
  const box = mask.box ?? { x0: 0, y0: 0, x1: mask.width - 1, y1: mask.height - 1 };
  const W = mask.width, dist = new Int16Array(mask.width * mask.height).fill(-1), queue = [];
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const i = y * W + x, r = ringOf(mask, i);
      if (!r) continue;
      for (const [dx, dy] of N4) {
        const nx = x + dx, ny = y + dy;
        const nr = nx >= 0 && ny >= 0 && nx < W && ny < mask.height ? ringOf(mask, ny * W + nx) : 0;
        if (nr !== r) { dist[i] = 1; queue.push(i); break; }
      }
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % W, y = (i - x) / W, r = ringOf(mask, i);
    for (const [dx, dy] of N4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= mask.height) continue;
      const j = ny * W + nx;
      if (dist[j] !== -1 || ringOf(mask, j) !== r) continue;
      dist[j] = dist[i] + 1;
      queue.push(j);
    }
  }
  return dist;
}

const _bd = new WeakMap();
const borderDist = (mask) => { let d = _bd.get(mask); if (!d) _bd.set(mask, d = wildRingBorderDistance(mask)); return d; };

/**
 * @param {{ width:number, height:number, depth:ArrayLike<number>, maxDepth:number, box?:{x0:number,y0:number,x1:number,y1:number} }} mask
 * @param {(x:number, y:number) => boolean} free
 * @param {number} day
 */
export function wildHallPicks(mask, free, day) {
  if (!mask?.depth || !mask.maxDepth) return [];
  const box = mask.box ?? { x0: 0, y0: 0, x1: mask.width - 1, y1: mask.height - 1 };
  const bd = borderDist(mask);
  const byRing = Array.from({ length: WILD_RINGS + 1 }, () => []);
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const i = y * mask.width + x;
      const ring = ringOf(mask, i);
      if (ring) byRing[ring].push({ x, y, ring, bd: bd[i], free: /** @type {boolean|undefined} */ (undefined) });
    }
  }
  const isFree = (p) => (p.free ??= !!free(p.x, p.y));
  const halls = [];
  const far = (p, also) => {
    let m = Infinity;
    for (const q of halls) m = Math.min(m, Math.hypot(p.x - q.x, p.y - q.y));
    for (const q of also) m = Math.min(m, Math.hypot(p.x - q.x, p.y - q.y));
    return m;
  };
  for (let ring = 1; ring <= WILD_RINGS; ring++) {
    const want = WILD_DUNGEONS_PER_RING[ring - 1] ?? 0;
    const ring_ = byRing[ring];
    if (!want) continue;
    const freeFrom = (min) => ring_.filter((p) => p.bd >= min && isFree(p));
    let _all = null;
    const all = () => (_all ??= ring_.filter(isFree));
    let deepest = -Infinity;
    for (const lv of [...new Set(ring_.map((p) => p.bd))].sort((a, b) => b - a)) if (ring_.some((p) => p.bd === lv && isFree(p))) { deepest = lv; break; }
    if (deepest === -Infinity) continue;
    const maxBd = Math.max(1, deepest);
    let floor = Math.max(1, Math.ceil(maxBd * 0.6));
    let pool = freeFrom(floor);
    while (pool.length < want * 3 && floor > 2) { floor -= 1; pool = freeFrom(floor); }
    if (pool.length < want) { const two = freeFrom(2); pool = two.length >= want ? two : all(); }
    const rand = rng(Math.imul(day + 1, 0x9e3779b1) ^ Math.imul(ring, 0x85ebca6b));
    const picked = [];
    for (const [spacing, fromOf] of /** @type {Array<[number, () => any[]]>} */ ([[WILD_HALL_SPACING, () => pool], [2, () => pool], [1, () => pool], [2, all], [1, all]])) {
      if (picked.length >= want) break;
      const from = fromOf();
      if (!picked.length) {
        const first = from.filter((p) => far(p, []) >= spacing);
        if (!first.length) continue;
        picked.push(first[Math.floor(rand() * first.length)]);
      }
      while (picked.length < want) {
        let best = [];
        for (const p of from) {
          if (picked.includes(p)) continue;
          const d = far(p, picked);
          if (d < spacing) continue;
          best.push({ p, score: d * (0.85 + 0.15 * Math.min(1, p.bd / maxBd)) });
        }
        if (!best.length) break;
        best.sort((a, b) => b.score - a.score);
        best = best.slice(0, 3);
        picked.push(best[Math.floor(rand() * best.length)].p);
      }
    }
    for (const p of picked) halls.push({ x: p.x, y: p.y, ring, key: `${p.x},${p.y}` });
  }
  return halls;
}

export const wildHallAt = (halls, x, y) => halls?.find((h) => h.x === x && h.y === y) ?? null;

export const wildHallTemplateOk = (loc) => loc?.mapTableData?.locationType !== 12 && loc?.mapTableData?.dungeonType !== 18 && !/cemetery|graveyard/i.test(String(loc?.name ?? ''));

export const WILD_HALL_FOES = Object.freeze({
  1: Object.freeze([9, 14, 19, 22, 24, 35, 36, 37, 38]),
  2: Object.freeze([9, 14, 19, 22, 23, 24, 25, 26, 27, 28, 36]),
  3: Object.freeze([22, 23, 25, 26, 27, 28, 29, 30, 32]),
  4: Object.freeze([25, 26, 27, 29, 30, 31, 32, 33]),
  water: Object.freeze([41, 42]),
});
const HIGH = new Set(Object.values(WILD_HALL_FOES).flat());
export const wildHallKeeps = (mobileType) => isClassEnemyId(mobileType) || HIGH.has(mobileType);
const mix = (a, b) => { let h = (a ^ Math.imul(b + 0x7f4a7c15, 0x9e3779b1)) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0; return (h ^ (h >>> 16)) >>> 0; };
export function wildHallFoes(enemies, ring, seed) {
  const pool = WILD_HALL_FOES[Math.max(1, Math.min(WILD_RINGS, ring | 0 || 1))];
  return (enemies ?? []).map((e, i) => {
    if (!e || wildHallKeeps(e.mobileType)) return e;
    const list = WATER_SPECIES.has(e.mobileType) ? WILD_HALL_FOES.water : pool;
    return { ...e, mobileType: list[mix(seed >>> 0, i) % list.length], gender: 'unspecified', wildSwapped: true };
  });
}
