// @ts-check
// Each town pair is planned once with the lower `mapId` first and the reverse is derived from it, so every client
// walks the same line out and home. A change of road network clears the book and bumps `generation`.
import { planRoute } from '../../travel/travelRoute.js';

export const WAYS_PER_FRAME = 2;
export const WAYS_MS_PER_FRAME = 2;
// Caps pairs per frame because a coarse browser clock can read a plan as 0 ms and never use up the time budget.
export const WAYS_MAX_PER_FRAME = 32;

/**
 * @typedef {{ pixels: { x: number, y: number }[], kinds?: string[] }} WayPlan
 * @param {{ roads: () => ({ roads: any, tracks: any } | null), ground: () => object, plan?: typeof planRoute, now?: () => number }} deps
 */
export function createWayBook({ roads, ground, plan = planRoute, now = () => performance.now() }) {
  /** @type {Map<string, WayPlan|null>} */
  const book = new Map();
  /** @type {Map<string, WayPlan>} */
  const back = new Map();
  let budget = WAYS_PER_FRAME;
  let asked = 0, spent = 0, spendMs = WAYS_MS_PER_FRAME;
  let net = null, generation = 0;
  return {
    /**
     * Returns null when no route exists and undefined while the network is not built or the frame budget is spent,
     * so callers retry on undefined.
     * @param {{ mapId: number, px: number, py: number }} a
     * @param {{ mapId: number, px: number, py: number }} b
     * @returns {WayPlan|null|undefined}
     */
    wayOf(a, b) {
      const raw = roads();
      if (!raw) return undefined;
      if (raw.roads !== net) { if (net !== null) { book.clear(); back.clear(); generation++; } net = raw.roads; }
      const flip = a.mapId > b.mapId;
      const p = flip ? b : a, q = flip ? a : b;
      const key = `${p.mapId}>${q.mapId}`;
      let way = book.get(key);
      if (way === undefined) {
        if (budget <= 0 && !(spent < spendMs && asked < WAYS_MAX_PER_FRAME)) return undefined;
        budget--; asked++;
        const t0 = now();
        way = plan({ x: p.px, y: p.py }, { x: q.px, y: q.py }, { roads: raw.roads ?? null, tracks: raw.tracks ?? null, ...ground() }) ?? null;
        spent += now() - t0;
        book.set(key, way);
      }
      if (!way || !flip) return way;
      let rev = back.get(key);
      if (!rev) { rev = { pixels: [...way.pixels].reverse(), kinds: [...(way.kinds ?? [])].reverse() }; back.set(key, rev); }
      return rev;
    },
    frame(n = WAYS_PER_FRAME, ms = WAYS_MS_PER_FRAME) { budget = n; asked = 0; spent = 0; spendMs = ms; },
    get generation() { return generation; },
    get size() { return book.size; },
  };
}
