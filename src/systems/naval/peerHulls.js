// @ts-check
import { wildHere } from '../../world/wildZone.js';
import { hullOverlap } from './navalShips.js';
import { colliderPoses, invertAffine, boxColliderTriangles } from '../../world/prefabColliders.js';

// Another player's hull meets my helm only inside a PvP zone.
export const peerHullsMeet = () => wildHere();

/** @type {WeakMap<object, { root: any, variant: any, box: number[] | null }>} */
const _local = new WeakMap();

/**
 * @param {any} boat
 * @param {(c: any) => any} geometry
 */
export function hullPlan(boat, geometry) {
  const root = boat?.GameObject;
  if (!root?.activeSelf) return null;
  let k = _local.get(boat);
  if (!k || k.root !== root || k.variant !== boat.variant) {
    const inv = invertAffine(root.worldMatrix());
    const box = [Infinity, -Infinity, Infinity, -Infinity];
    for (const { collider: c, world: m } of inv ? colliderPoses(root) : []) {
      if (c.m_IsTrigger) continue;
      const tri = c.type === 'BoxCollider' ? boxColliderTriangles(c) : geometry?.(c);
      const p = tri?.positions;
      for (let i = 0; p && i + 2 < p.length; i += 3) {
        const w = [0, 1, 2].map((d) => m[d] * p[i] + m[4 + d] * p[i + 1] + m[8 + d] * p[i + 2] + m[12 + d]);
        const x = inv[0] * w[0] + inv[4] * w[1] + inv[8] * w[2] + inv[12], z = inv[2] * w[0] + inv[6] * w[1] + inv[10] * w[2] + inv[14];
        box[0] = Math.min(box[0], x); box[1] = Math.max(box[1], x); box[2] = Math.min(box[2], z); box[3] = Math.max(box[3], z);
      }
    }
    k = { root, variant: boat.variant, box: Number.isFinite(box[0]) ? box : null };
    _local.set(boat, k);
  }
  if (!k.box) return null;
  const m = root.worldMatrix();
  const rl = Math.hypot(m[0], m[2]) || 1, fl = Math.hypot(m[8], m[10]) || 1;
  const r = [m[0] / rl, m[2] / rl], f = [m[8] / fl, m[10] / fl];
  const cx = (k.box[0] + k.box[1]) / 2, cz = (k.box[2] + k.box[3]) / 2;
  return { c: [m[12] + m[0] * cx + m[8] * cz, m[14] + m[2] * cx + m[10] * cz], f, r, hl: (k.box[3] - k.box[2]) / 2, hw: (k.box[1] - k.box[0]) / 2 };
}
const within = (h, p) => {
  const d = [p[0] - h.c[0], p[1] - h.c[1]];
  return Math.abs(d[0] * h.f[0] + d[1] * h.f[1]) <= h.hl && Math.abs(d[0] * h.r[0] + d[1] * h.r[1]) <= h.hw;
};

let _latch = { deck: /** @type {any} */ (null), passing: /** @type {Set<any>} */ (new Set()) };
let _pressed = /** @type {{ boat: any, word: any } | null} */ (null);
export const resetHullLatch = () => { _latch = { deck: null, passing: new Set() }; _pressed = null; };
/** @param {any} boat */
export const deckPressed = (boat) => { _pressed = boat ? { boat, word: undefined } : null; };
export const hullPassesMyDeck = (boat) => _latch.passing.has(boat);

/**
 * @param {any} b
 * @param {Set<any>} mine
 */
const ownerOf = (b, mine) => { if (mine.has(b)) return mine; const k = b?.peerKey; return typeof k === 'string' && k.includes(':') ? k.slice(0, k.lastIndexOf(':')) : b; };

/**
 * @param {any} deck
 * @param {any[]} hulls
 * @param {(c: any) => any} geometry
 * @param {((b: any) => any) | null} [whose]
 */
export function hullsPassing(deck, hulls, geometry, whose = null) {
  const D = deck ? hullPlan(deck, geometry) : null;
  const over = new Set();
  if (D) for (const b of hulls) {
    // One owner's hulls never pass each other.
    if (b === deck || (whose && whose(b) === whose(deck))) continue;
    const P = hullPlan(b, geometry);
    if (P && hullOverlap(D, P)) over.add(b);
  }
  // Outside a PvP zone every overlapping hull passes. Inside one, only hulls already passing
  // this deck keep passing until they clear it, so hulls overlapping as the zone turns never jam.
  const passing = !peerHullsMeet() ? over : deck !== _latch.deck ? new Set() : new Set([..._latch.passing].filter((b) => over.has(b)));
  _latch = { deck, passing };
  return passing;
}

// A hull let through my helm would sail her deck through my body, so hulls overlapping my deck leave the collider.
/**
 * @param {any[]} boats
 * @param {any} deck
 * @param {number[] | null} feet
 * @param {any} pool
 * @param {(c: any) => any} geometry
 */
export function hullsStood(boats, deck, feet, pool, geometry) {
  const mine = new Set(pool?.boats ?? []), hulls = [...mine, ...(pool?.peerBoats ?? [])];
  const over = (b) => { const P = b && feet && hulls.includes(b) ? hullPlan(b, geometry) : null; return !!P && within(P, [feet[0], feet[2]]); };
  // The boat a ladder set me on is my deck while my feet stay over it and the host names the same deck.
  if (_pressed && _pressed.word === undefined) _pressed.word = deck;
  if (_pressed && (deck !== _pressed.word || !over(_pressed.boat))) _pressed = null;
  // The last deck holds through a jump while my feet stay over it.
  const on = _pressed?.boat ?? deck ?? (over(_latch.deck) ? _latch.deck : null);
  const passing = hullsPassing(on, hulls, geometry, (b) => ownerOf(b, mine));
  return passing.size ? boats.filter((b) => !passing.has(b)) : boats;
}

export function peerHullSweep(sweep, pool) {
  return (o, r, d, dist, opts = null) => {
    const hits = sweep(o, r, d, dist, opts);
    if (peerHullsMeet()) return hits;
    const peers = pool?.peerBoats;
    if (!peers?.length) return hits;
    return hits.filter((h) => !h.root || !peers.some((b) => b.GameObject === h.root));
  };
}
