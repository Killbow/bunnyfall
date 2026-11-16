// @ts-check
// What another player may place as a template in a home or a caravan, the limits, and a template's
// price. The account service (server-account/src/decorators.js, decoratorDrafts.js, caravanTemplates.js) and the
// client read the same rules. Pure: no clock, no DOM, no network.
import { decorPrice, DECOR_PRICE_MIN, DECOR_PRICE_MAX } from './decorLaw.js';

export const DECORATORS_MAX = 4;
export const CARAVAN_DECORATORS_MAX = 4;
export const DRAFT_TTL_S = 30 * 24 * 60 * 60;
export const TEMPLATE_TTL_S = 7 * 24 * 60 * 60;
export const TEMPLATE_BODY_BYTES = 20 * 1024;
export const TEMPLATE_RATE_MAX = 20;
export const TEMPLATE_RATE_WINDOW_S = 3600;

/** A catalog piece with no item, storage, station, or name. @param {any} p */
export const decoratorPieceOk = (p) => !!p && typeof p === 'object' && !p.item && p.storage !== true && !p.station && !p.name;

/**
 * Each piece priced by the law from its measured radius and its scale. Null while any piece cannot be measured.
 * @param {any[]} pieces @param {(piece: any) => (number | null | undefined)} radiusOf
 * @returns {{ total: number, paid: [string, number][] } | null}
 */
export function templatePrice(pieces, radiusOf) {
  /** @type {[string, number][]} */
  const paid = [];
  let total = 0;
  for (const p of pieces ?? []) {
    const gold = decorPrice(Number(radiusOf(p)), Number(p?.scale ?? 1));
    if (!(gold >= DECOR_PRICE_MIN && gold <= DECOR_PRICE_MAX)) return null;
    paid.push([p.id, gold]);
    total += gold;
  }
  return { total, paid };
}

/** A price list as the accept route takes it: every id once, each price between DECOR_PRICE_MIN and DECOR_PRICE_MAX.
 *  @param {unknown} raw */
export function templatePaidOf(raw) {
  if (!Array.isArray(raw)) return null;
  const out = new Map();
  for (const e of raw) {
    if (!Array.isArray(e) || e.length !== 2) return null;
    const [id, gold] = e;
    if (typeof id !== 'string' || out.has(id) || !Number.isSafeInteger(gold) || gold < DECOR_PRICE_MIN || gold > DECOR_PRICE_MAX) return null;
    out.set(id, gold);
  }
  return out;
}

/** An 8-hex FNV-1a hash of a text: a caravan template's base. @param {string} text */
export function templateBaseOf(text) {
  let h = 0x811c9dc5;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
export const TEMPLATE_BASE_RE = /^[0-9a-f]{8}$/;
