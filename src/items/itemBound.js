// @ts-check
import { templateByIndex } from './itemTemplates.js';
import { t } from '../ui/textManager.js';

let _realmLocked = new Set();
export function setRealmLocked(/** @type {Iterable<string> | null | undefined} */ keys) { _realmLocked = new Set(keys ?? []); }
export const isRealmLocked = (/** @type {any} */ item) => _realmLocked.size > 0 && !!item
  && ((typeof item.provenance === 'string' && _realmLocked.has(item.provenance)) || (typeof item.uid === 'string' && _realmLocked.has(item.uid)));

export const isBoundByNature = (/** @type {any} */ item) => item?.bound === true || templateByIndex(item?.templateIndex)?.bound === true;
export const isBound = (/** @type {any} */ item) => isBoundByNature(item) || isRealmLocked(item);

// A world container belongs to the room once opened online, so only the wagon and the player's own storage
// take a bound piece.
export const BOUND_KEEPS = Object.freeze(['wagon', 'storage']);

export const isPackOnly = (/** @type {any} */ item) => templateByIndex(item?.templateIndex)?.packOnly === true;

export const boundRefusesPut = (/** @type {any} */ item, /** @type {string} */ kind) => isBound(item) && (isPackOnly(item) || !BOUND_KEEPS.includes(kind));

export const unbound = (/** @type {any[] | null} */ list) => (Array.isArray(list) ? list.filter((it) => !isBound(it)) : list);

export const BOUND_TRADE_TEXT = 'Bound items cannot be traded.';
export const boundTradeText = (/** @type {any} */ item = null) => (realmLockedOnly(item)
  ? t('realm.locked.trade', 'A piece the realm locked cannot be traded.') : BOUND_TRADE_TEXT);

const realmLockedOnly = (/** @type {any} */ item) => !!item && isRealmLocked(item) && !isBoundByNature(item);

export const boundText = (/** @type {string} */ name, /** @type {any} */ item = null) => (realmLockedOnly(item)
  ? t('realm.locked.refusal', '{name} is locked by the realm because the same piece was found somewhere else too. It stays with you and cannot be dropped, traded, sold or stored where others can take it.', { name })
  : `${name || 'That'} is bound to you. It cannot be dropped, traded or sold.`);

export const BOUND_LINE = 'Bound. It cannot be dropped, traded or sold.';
export const boundLine = (/** @type {any} */ item) => (!isBound(item) ? null : realmLockedOnly(item)
  ? t('realm.locked.line', 'Locked by the realm. It stays with you and cannot be dropped, traded, sold or stored where others can take it.') : BOUND_LINE);

export const packOnlyText = (/** @type {string} */ name) => `${name || 'That'} stays in your pack.`;
