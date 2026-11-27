// @ts-check
import { NEWS_DAYS } from './trips.js';
import { DAY_MIN } from './dayPlan.js';
import { FRIEND_AT, ENEMY_AT } from './relations.js';
import { CARRIED_SHARE } from './lines.js';
export { CARRIED_SHARE };

export const REPUTE = Object.freeze({ saved: 4, helped: 2, routed: 5, slain: -8, robbed: -5 });
export const REPUTE_MAX = FRIEND_AT - 1;
export const REPUTE_MIN = ENEMY_AT + 1;
export const HEARD_SHARE = 0.5;

/** @param {any} item */
export const carriedKey = (item) => item.key ?? (item.id ? `trip:${item.id}` : `${item.kind}|${item.who}|${item.t}`);

/**
 * @param {readonly any[]} visits
 * @param {number} t
 * @param {{ own?: readonly any[], deedsAt?: (town: any, minute: number) => readonly any[], here?: number | null }} [o]
 */
export function carriedNews(visits, t, { own = [], deedsAt = () => [], here = null } = {}) {
  const ownKeys = new Set(own.map(carriedKey));
  /** @param {any} w */
  const toldAt = (w) => [...(w.news ?? []), ...deedsAt(w.from, w.outT0)].filter((it) => it.t <= w.outT0);
  /** @type {Map<string, any>} */
  const best = new Map();
  for (const v of visits ?? []) {
    if (!(v.inT <= t && t - v.inT < NEWS_DAYS * DAY_MIN)) continue;
    const items = toldAt(v);
    if (v.courier) {
      for (const r of v.relay ?? []) {
        if (!(r.inT <= v.outT0 && v.outT0 - r.inT < NEWS_DAYS * DAY_MIN)) continue;
        // A courier relay of word from this town is its own news coming back, so it is never told as carried.
        if (here != null && (r.from?.mapId ?? null) === here) continue;
        for (const it of toldAt(r)) items.push({ ...it, key: carriedKey(it), from: it.from || (r.from?.name ?? ''), t: r.inT });
      }
    }
    for (const it of items) {
      const key = carriedKey(it);
      if (ownKeys.has(key) || (best.get(key)?.t ?? Infinity) <= v.inT) continue;
      best.set(key, { ...it, key, carried: true, from: it.from || (v.from?.name ?? ''), t: v.inT });
    }
  }
  return [...best.values()].sort((a, b) => b.t - a.t || (a.key < b.key ? -1 : 1));
}

/**
 * @param {any} item
 * @returns {keyof typeof REPUTE | null}
 */
export function reputeKind(item) {
  if (!item || item.kin) return null;
  if (item.kind === 'home') return 'saved';
  if (item.kind === 'routed') return 'routed';
  if (item.kind === 'held') return 'robbed';
  if (item.kind === 'slain') return item.seen ? 'slain' : null;
  return item.helped ? 'helped' : null;
}

/**
 * @param {readonly any[]} items
 * @returns {{ regard: number, deeds: any[] }}
 */
export function reputeOf(items) {
  let sum = 0;
  const deeds = [];
  for (const it of items ?? []) {
    const k = reputeKind(it);
    if (!k) continue;
    sum += REPUTE[k];
    deeds.push(it);
  }
  return { regard: Math.max(REPUTE_MIN, Math.min(REPUTE_MAX, sum)), deeds: deeds.sort((a, b) => b.t - a.t) };
}

/**
 * @param {boolean} known
 * @param {number} own
 * @param {number} repute
 */
export const regardWithRepute = (known, own, repute) => (known ? own : repute);

/**
 * @param {readonly any[]} deeds
 * @param {number} seed
 * @returns {any | null}
 */
export function heardOf(deeds, seed) {
  if (!deeds?.length || ((seed >>> 0) % 1000) / 1000 >= HEARD_SHARE) return null;
  return deeds[Math.floor((seed >>> 0) / 1000) % deeds.length];
}
