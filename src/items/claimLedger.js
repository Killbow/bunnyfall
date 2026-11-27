// @ts-check
// Claims a player makes on shared loot: a taken piece leaves the pack until the authority for it grants it.
import { liftPiece, givePiece, ROOM_CLAIM_TIMEOUT_MS, ROOM_TAKEN_TEXT, ROOM_CLAIMS_MAX } from './roomLoot.js';

export const CLAIM_KEEP_MS = 300_000;
export const CLAIM_RESEND_MS = 1000;
export const CLAIM_RESEND_MAX_MS = 8000;
export const LEGACY_ASK_KEEP_MS = CLAIM_KEEP_MS;
export const CLAIMS_KEPT_MAX = 512;
const ASKS_KEPT_MAX = 256;

/**
 * @typedef {object} Claim
 * @property {string} id
 * @property {string} container
 * @property {number} [p]
 * @property {string} [sp]
 * @property {number} n
 * @property {any} item
 * @property {number} give
 * @property {number} at
 * @property {boolean} lapsed
 * @property {boolean} done
 * @property {number} wait
 * @property {number} nextAt
 * @property {string} [by]
 * @property {any} meta
 */

/**
 * @param {object} io
 * @param {any} io.entity
 * @param {(line: string) => void} [io.say]
 * @param {() => string} io.newId
 * @param {number} [io.keepMs]
 * @param {number} [io.lapseMs]
 * @param {number} [io.resendMs]
 * @param {number} [io.resendMax]
 */
export function createClaimLedger({ entity, say = () => {}, newId, keepMs = CLAIM_KEEP_MS, lapseMs = ROOM_CLAIM_TIMEOUT_MS, resendMs = CLAIM_RESEND_MS, resendMax = CLAIM_RESEND_MAX_MS }) {
  /** @type {Map<string, Claim>} */
  const claims = new Map();
  const won = new Set();
  /** @type {Map<string, number[]>} */
  const asks = new Map();

  const placeKey = (/** @type {Claim} */ c) => `${c.container}|${c.p ?? c.sp}`;
  const tell = (/** @type {string} */ line) => { try { say?.(line); } catch { } };

  function take(/** @type {string} */ container, /** @type {{ p?: number, sp?: string }} */ ref, /** @type {any} */ item, /** @type {number} */ n, /** @type {{ by?: string, [k: string]: any }} */ meta, /** @type {number} */ now) {
    const give = liftPiece(entity, item, n);
    const { by, ...rest } = meta ?? {};
    /** @type {Claim} */
    const c = { id: newId(), container, ...(ref.p !== undefined ? { p: ref.p } : { sp: ref.sp }), n, item, give, at: now, lapsed: false, done: false, wait: resendMs, nextAt: now + resendMs, ...(by !== undefined ? { by } : {}), meta: rest };
    claims.set(c.id, c);
    trim();
    return c;
  }

  function pending(/** @type {string} */ container) {
    /** @type {Map<number, number>} */ const places = new Map();
    /** @type {Map<string, number>} */ const stored = new Map();
    for (const c of claims.values()) {
      if (c.container !== container || c.done || c.lapsed) continue;
      if (c.p !== undefined) places.set(c.p, (places.get(c.p) ?? 0) + c.n);
      else if (c.sp !== undefined) stored.set(c.sp, (stored.get(c.sp) ?? 0) + c.n);
    }
    return { places, stored, puts: /** @type {any[]} */ ([]) };
  }

  function resolve(/** @type {string} */ id, /** @type {number} */ g, /** @type {{ from?: string, withdrawn?: boolean }} */ { from, withdrawn = false } = {}) {
    const c = claims.get(id);
    // Answered claims stay in the map for a while, so a duplicate verdict lands nothing.
    if (!c || c.done) return null;
    if (from !== undefined && c.by !== undefined && c.by !== from) return null;
    c.done = true;
    const key = placeKey(c);
    if (g > 0) {
      givePiece(entity, c.item, Math.min(g, c.give));
      won.add(key);
      while (won.size > ROOM_CLAIMS_MAX * 4) won.delete(/** @type {string} */ (won.values().next().value));
    } else if (!withdrawn && !won.has(key)) tell(ROOM_TAKEN_TEXT);
    return c;
  }

  // A re-sent claim keeps its id, so the authority answers it from its own ledger and never judges it twice.
  function due(/** @type {number} */ now) {
    /** @type {Claim[]} */ const lapsed = [], resay = [], expired = [];
    for (const c of [...claims.values()]) {
      if (now - c.at > keepMs) { claims.delete(c.id); if (!c.done) expired.push(c); continue; }
      if (c.done) continue;
      // A lapsed claim reads as back in the container, but a verdict inside the keep window still lands.
      if (!c.lapsed && now - c.at >= lapseMs) { c.lapsed = true; lapsed.push(c); }
      if (now >= c.nextAt) { c.wait = Math.min(resendMax, c.wait * 2); c.nextAt = now + c.wait; resay.push(c); }
    }
    return { lapsed, resay, expired };
  }

  // At the claimer's teardown, unlapsed claims give their piece and resolve, so a later verdict lands nothing.
  // The clock is checked here too, because a sleeping tab may not have run due() yet.
  function keep(/** @type {(c: Claim) => boolean} */ which = () => true, /** @type {number | null} */ now = null) {
    /** @type {Claim[]} */ const kept = [];
    for (const c of claims.values()) {
      if (c.done || c.lapsed || (now !== null && now - c.at >= lapseMs) || !which(c)) continue;
      c.done = true;
      givePiece(entity, c.item, c.give);
      kept.push(c);
    }
    return kept;
  }

  function open(/** @type {string | null} */ container = null) {
    return [...claims.values()].filter((c) => !c.done && (container === null || c.container === container));
  }
  const get = (/** @type {string} */ id) => claims.get(id) ?? null;

  function trim() {
    if (claims.size <= CLAIMS_KEPT_MAX) return;
    for (const c of [...claims.values()]) {
      if (claims.size <= CLAIMS_KEPT_MAX) break;
      if (c.done) claims.delete(c.id);
    }
  }

  function ask(/** @type {string} */ key, /** @type {number} */ now) {
    const list = asks.get(key) ?? [];
    list.push(now);
    asks.delete(key);
    asks.set(key, list);
    while (asks.size > ASKS_KEPT_MAX) asks.delete(/** @type {string} */ (asks.keys().next().value));
  }
  function askedWithin(/** @type {string} */ key, /** @type {number} */ now, /** @type {number} */ windowMs) {
    const list = asks.get(key);
    return !!list && list.some((t) => now - t <= windowMs);
  }
  function landAsk(/** @type {string} */ key, /** @type {number} */ now, keepFor = LEGACY_ASK_KEEP_MS) {
    const list = asks.get(key);
    if (!list) return false;
    while (list.length && now - list[0] > keepFor) list.shift();
    const had = list.length > 0;
    if (had) list.shift();
    if (!list.length) asks.delete(key);
    return had;
  }

  function clear() { claims.clear(); won.clear(); asks.clear(); }

  return { take, pending, resolve, due, keep, open, get, ask, askedWithin, landAsk, clear, get size() { return claims.size; } };
}
