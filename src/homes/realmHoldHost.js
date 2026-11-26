// @ts-check
import { tradeHeldNotice, lockedPiecesOf, ledgerKeyOf, setStowedKeys, carriedPieces } from '../items/itemIds.js';
import { itemLongName } from '../items/itemInfo.js';
import { setRealmLocked } from '../items/itemBound.js';
import { possessedItemLists } from '../items/possessedItems.js';
import { setCarriedFilter } from '../net/peerWord.js';
import { withoutCarried } from '../world/interiorShared.js';
import { t } from '../ui/textManager.js';
import { setTradeHeldSaid } from '../net/realmTradeLaw.js';

const NAMED_MAX = 3;

export function piecesLockedNotice(/** @type {string[]} */ names, /** @type {number} */ count) {
  if (!(count > 0)) return null;
  if (count === 1) {
    return names[0]
      ? t('realm.locked.named', 'The realm has locked your {name}: it found the same piece somewhere else too. It stays with you and cannot be traded, sold, dropped or stored where others can take it. Your other pieces and your trading are not affected.', { name: names[0] })
      : t('realm.locked.one', 'The realm has locked one of your pieces: it found the same piece somewhere else too. It stays with you and cannot be traded, sold, dropped or stored where others can take it. Your other pieces and your trading are not affected.');
  }
  const shown = names.slice(0, NAMED_MAX);
  if (!shown.length) return t('realm.locked.many', 'The realm has locked {n, number} of your pieces: it found the same pieces somewhere else too. They stay with you and cannot be traded, sold, dropped or stored where others can take them. Your other pieces and your trading are not affected.', { n: count });
  const more = count - shown.length;
  const list = more > 0 ? t('realm.locked.listMore', '{names} and {n, number} more', { names: shown.join(', '), n: more }) : shown.join(', ');
  return t('realm.locked.manyNamed', 'The realm has locked {n, number} of your pieces ({list}): it found the same pieces somewhere else too. They stay with you and cannot be traded, sold, dropped or stored where others can take them. Your other pieces and your trading are not affected.', { n: count, list });
}

export function stowedKeysOf(/** @type {any} */ save) {
  const stowed = new Set();
  if (!save || typeof save !== 'object') return stowed;
  const away = { ...save, items: [], wagonItems: [], bagItems: [], furnishings: [], otherItems: [] };
  for (const list of possessedItemLists(away)) for (const it of list) { const k = ledgerKeyOf(it); if (k) stowed.add(k); }
  return stowed;
}

function stowedReader(/** @type {any} */ session) {
  /** @type {string | null} */ let text = null;
  /** @type {Set<string> | null} */ let keys = null;
  return () => {
    const now = session?.landedText ?? null;
    if (now !== text) { text = now; keys = null; }
    if (keys == null) {
      try { keys = text ? stowedKeysOf(JSON.parse(text)) : new Set(); } catch { keys = new Set(); }
    }
    return keys;
  };
}

/**
 * @param {any} session
 * @param {{ say: (text: string) => void, entity: any }} deps
 */
export function wireRealmHolds(session, { say, entity }) {
  setRealmLocked(session?.lockedKeys ?? []);
  setStowedKeys(session ? stowedReader(session) : () => null);
  setCarriedFilter(session ? (list) => withoutCarried(list, carriedPieces(entity)) : null);
  setTradeHeldSaid(session ? () => tradeHeldNotice(null, session.tradeHeld, session.tradeHeldWhy) : null);
  if (!session) return;
  session.onTradeHeld = (/** @type {string | null} */ prev, /** @type {string | null} */ now, /** @type {any} */ why) => { const text = tradeHeldNotice(prev, now, why); if (text) say(text); };
  session.onLockedKeys = (/** @type {string[]} */ keys) => setRealmLocked(keys);
  session.onPiecesLocked = (/** @type {string[]} */ keys) => {
    const { pieces, unfound } = lockedPiecesOf(entity, keys);
    const text = piecesLockedNotice(pieces.map((it) => itemLongName(it)), pieces.length + unfound);
    if (text) say(text);
  };
}
