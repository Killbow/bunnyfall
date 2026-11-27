// @ts-check
// Each realm checkpoint stamps a random id on every valuable piece that lacks one. The id stays with the piece
// through saves, the wire, and trades, so the ledger can spot a copy. Stacks never get one, since a split or merge
// would break the one-record-per-id rule.

import { ITEM_UID_RE, PROVENANCE_RE, lawTemplate } from './itemLaw.js';
import { LETTER_OF_CREDIT_TEMPLATE } from './inventory.js';
import { t } from '../ui/textManager.js';
import { TRADE_HELD_NOTICES, tradeHeldLawNotice, tradeHeldUntilNotice } from '../net/realmTradeLaw.js';
const VALUABLE_TIERS = Object.freeze(['magic', 'rare', 'legendary', 'aetheric', 'gilded']);

export function valuablePiece(/** @type {any} */ it) {
  if (!it || typeof it !== 'object' || it.bound === true || it.questItem === true) return false;
  if (Number.isInteger(it.stackCount) && it.stackCount > 1) return false;
  if (it.templateIndex === LETTER_OF_CREDIT_TEMPLATE) return true;
  return VALUABLE_TIERS.includes(it.rarity) || it.magic === true || it.artifact === true || typeof it.provenance === 'string';
}

export function ledgerKeyOf(/** @type {any} */ it) {
  if (!valuablePiece(it)) return null;
  if (typeof it.provenance === 'string' && PROVENANCE_RE.test(it.provenance)) return it.provenance;
  return typeof it.uid === 'string' && ITEM_UID_RE.test(it.uid) ? it.uid : null;
}

const ownLists = (/** @type {any} */ entity) => [entity?.items, entity?.wagonItems, entity?.bagItems, entity?.furnishings, entity?.otherItems].filter(Array.isArray);

export function carriedLedgerKeys(/** @type {any} */ entity) {
  const out = new Set();
  for (const list of ownLists(entity)) for (const it of list) { const k = ledgerKeyOf(it); if (k) out.add(k); }
  return out;
}

let _stowedKeys = () => /** @type {Iterable<string> | null} */ (null);
export function setStowedKeys(/** @type {() => Iterable<string> | null} */ fn) { _stowedKeys = typeof fn === 'function' ? fn : () => null; }

export const carriedPieces = (/** @type {any} */ entity) => ({ keys: carriedLedgerKeys(entity), stowed: new Set(_stowedKeys() ?? []), keyOf: ledgerKeyOf });

export function lockedPiecesOf(/** @type {any} */ entity, /** @type {string[]} */ keys) {
  const want = new Set(keys), found = new Set(), pieces = [];
  for (const list of ownLists(entity)) for (const it of list) { const k = ledgerKeyOf(it); if (k && want.has(k)) { pieces.push(it); found.add(k); } }
  return { pieces, unfound: want.size - found.size };
}

export function mintItemId(/** @type {((b: Uint8Array<ArrayBuffer>) => Uint8Array) | undefined} */ rand = undefined) {
  const bytes = new Uint8Array(8);
  return [...(rand ? rand(bytes) : globalThis.crypto.getRandomValues(bytes))].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {any} entity
 * @param {(b: Uint8Array<ArrayBuffer>) => Uint8Array} [rand]
 */
export function stampItemIds(entity, rand) {
  let n = 0;
  for (const list of ownLists(entity)) {
    for (const it of list) {
      if (!valuablePiece(it) || (typeof it.uid === 'string' && ITEM_UID_RE.test(it.uid)) || !Object.isExtensible(it)) continue;
      it.uid = mintItemId(rand);
      n++;
    }
  }
  return n;
}

export { TRADE_HELD_NOTICES, tradeHeldLawNotice };
export const TRADE_OPEN_NOTICE = 'This character\'s trading, gathering and crafting are open again.';
export function tradeHeldNotice(/** @type {string | null | undefined} */ prev, /** @type {string | null | undefined} */ now, /** @type {{ code?: string, t?: number | null, until?: number } | null} */ why = null) {
  if (now === undefined || (now === prev && why?.code !== 'until')) return null;
  if (now == null) return prev ? t('realm.held.open', TRADE_OPEN_NOTICE) : null;
  const name = now === 'law' && why ? lawTemplate(why.t)?.name : null;
  if (now === 'law' && why?.code === 'until' && Number.isSafeInteger(why.until)) return tradeHeldUntilNotice(/** @type {number} */ (why.until), typeof name === 'string' && name ? name : null);
  if (typeof name === 'string' && name) return tradeHeldLawNotice(name);
  return /** @type {any} */ (TRADE_HELD_NOTICES)[now] ?? TRADE_HELD_NOTICES.law;
}
