// @ts-check
// The wallet item organizes the pack's letters of credit, Deadlands Embers, and Welkynd Shards into one sheet. The
// pieces stay in `entity.items`, so every reader and spender finds them where it always did.
import { registerCustomTemplates, setItemFields, mintCondition, registerItemUseHandler } from './itemTemplates.js';
import { addItem, itemWeight, LETTER_OF_CREDIT_TEMPLATE } from './inventory.js';
import { SIGIL_STONE_TEMPLATE, WELKYND_SHARD_TEMPLATE } from '../worldEvents/gateSpoils.js';
import { isEquipped } from '../characters/equip.js';

// Templates 570 to 572 belong to the gate, and 600 and up are reserved for professions.
export const WALLET_TEMPLATE = 580;
// Pack-only, because a wallet outside the pack would send its pieces back to the pack pages.
export const WALLET_ROW = Object.freeze({
  index: WALLET_TEMPLATE, name: 'Wallet', baseWeight: 0, hitPoints: 0, capacityOrTarget: 0, basePrice: 1,
  enchantmentPoints: 0, rarity: 20, variants: 0, drawOrderOrEffect: 0, isBluntWeapon: false, isLiquid: false,
  isOneHanded: false, isIngredient: false, worldTextureArchive: 205, worldTextureRecord: 18,
  playerTextureArchive: 0, playerTextureRecord: 0, stackable: false, hasNoEncumbrance: true,
  bound: true, packOnly: true,
});
registerCustomTemplates([WALLET_ROW]);

export const isWalletItem = (/** @type {any} */ item) => item?.templateIndex === WALLET_TEMPLATE && item?.group === 'UselessItems2';
export const hasWallet = (/** @type {any} */ items) => Array.isArray(items) && items.some(isWalletItem);

export const WALLET_HOLDS = Object.freeze([LETTER_OF_CREDIT_TEMPLATE, SIGIL_STONE_TEMPLATE, WELKYND_SHARD_TEMPLATE]);
export const walletHolds = (/** @type {any} */ item) => !!item && WALLET_HOLDS.includes(item.templateIndex);

export function mintWallet() {
  return mintCondition(setItemFields({ group: 'UselessItems2', templateIndex: WALLET_TEMPLATE }));
}
export function giveWallet(/** @type {any} */ entity) {
  if (!entity || typeof entity !== 'object') return 0;
  if (!Array.isArray(entity.items)) entity.items = [];
  if (hasWallet(entity.items)) return 0;
  addItem(entity.items, mintWallet());
  return 1;
}
// A save's `walletGift` mark records the gift, so a character from before the wallet gets one, once, on restore.
export const WALLET_GIFT = 1;
export function giveWalletGift(/** @type {any} */ entity) {
  if (!entity || typeof entity !== 'object') return 0;
  if ((Number.isSafeInteger(entity.walletGift) ? entity.walletGift : 0) >= WALLET_GIFT) return 0;
  entity.walletGift = WALLET_GIFT;
  return giveWallet(entity);
}

/** @type {(() => (number|null|false)) | null} */
let _silver = null;
/** @type {(() => any) | null} */
let _refresh = null;
/** @type {(() => (number|null|false)) | null} */
let _seals = null;
/** @type {(() => any) | null} */
let _sealsRefresh = null;
/** @type {Promise<void> | null} */
let _asking = null;
export function setWalletSilver(/** @type {any} */ read, /** @type {any} */ refresh = null) {
  _silver = typeof read === 'function' ? read : null;
  _refresh = typeof refresh === 'function' ? refresh : null;
  _asking = null;
}
export function setWalletPsijicSeals(/** @type {any} */ read, /** @type {any} */ refresh = null) {
  _seals = typeof read === 'function' ? read : null;
  _sealsRefresh = typeof refresh === 'function' ? refresh : null;
  _asking = null;
}
export function refreshWalletSilver() {
  if (_asking) return _asking;
  let ask;
  try {
    ask = Promise.all([
      Promise.resolve(_refresh?.()).then(() => undefined, () => undefined),
      Promise.resolve(_sealsRefresh?.()).then(() => undefined, () => undefined),
    ]).then(() => undefined, () => undefined);
  } catch { return Promise.resolve(); }
  const mine = ask.then(() => { if (_asking === mine) _asking = null; });
  _asking = mine;
  return mine;
}
export const walletSilverHere = () => _silver != null;
export const walletPsijicSealsHere = () => _seals != null;
export function walletSilver() {
  try {
    const n = _silver?.() ?? null;
    if (n === false) return false;
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  } catch { return null; }
}
export function walletPsijicSeals() {
  try {
    const n = _seals?.() ?? null;
    if (n === false) return false;
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  } catch { return null; }
}

/** @param {any[]} items @param {any} entity */
export function walletContents(items, entity, {
  silver = walletSilver(), here = walletSilverHere(),
  seals = walletPsijicSeals(), sealsHere = walletPsijicSealsHere(),
} = {}) {
  const held = (Array.isArray(items) ? items : []).filter((it) => walletHolds(it) && !isEquipped(it));
  const count = (t) => held.reduce((n, it) => n + (it.templateIndex === t ? Math.max(1, Math.trunc(Number(it.stackCount) || 1)) : 0), 0);
  const letters = held.filter((it) => it.templateIndex === LETTER_OF_CREDIT_TEMPLATE);
  const kg = (t) => held.reduce((w, it) => w + (it.templateIndex === t ? itemWeight(it) : 0), 0);
  const offlineSeals = Number.isSafeInteger(entity?.psijicSeals) ? Math.max(0, entity.psijicSeals) : 0;
  const liveSeals = sealsHere
    ? (typeof seals === 'number' && Number.isSafeInteger(seals) ? seals : null)
    : offlineSeals;
  return {
    gold: Math.max(0, Math.trunc(Number(entity?.goldPieces) || 0)),
    silver: typeof silver === 'number' && Number.isSafeInteger(silver) ? silver : null,
    silverWhy: Number.isSafeInteger(silver) ? null : !here ? 'offline' : silver === false ? 'none' : 'asking',
    seals: liveSeals,
    sealsWhy: Number.isSafeInteger(liveSeals) ? null : seals === false ? 'none' : 'asking',
    letters: { count: letters.length, gold: letters.reduce((g, it) => g + Math.max(0, Math.trunc(Number(it.value) || 0)), 0) },
    embers: count(SIGIL_STONE_TEMPLATE),
    shards: count(WELKYND_SHARD_TEMPLATE),
    weights: { letters: kg(LETTER_OF_CREDIT_TEMPLATE), embers: kg(SIGIL_STONE_TEMPLATE), shards: kg(WELKYND_SHARD_TEMPLATE) },
    weight: held.reduce((w, it) => w + itemWeight(it), 0),
    held,
  };
}

const num = (/** @type {number} */ n) => Number(n).toLocaleString('en-US');
export const walletKg = (/** @type {number} */ kg) => `${(Number(kg) || 0).toFixed(2)} kg`;
export const letterWorthGold = (/** @type {any} */ item) => (item?.templateIndex === LETTER_OF_CREDIT_TEMPLATE
  ? `${num(Math.max(0, Math.trunc(Number(item.value) || 0)))} gold` : null);
export const letterWorthLine = (/** @type {any} */ item) => { const g = letterWorthGold(item); return g == null ? null : `Worth ${g}`; };
export const SILVER_WHY = Object.freeze({ offline: 'held in your online account', asking: 'checking your account', none: 'none' });
/** @param {ReturnType<typeof walletContents>} c */
export function walletLedger(c) {
  const count = (/** @type {string} */ key, /** @type {string} */ label, /** @type {number} */ n, /** @type {number} */ kg, /** @type {string|null} */ note = null) =>
    ({ key, label, figure: n ? num(n) : 'none', none: !n, note: n ? note : null, weight: n ? walletKg(kg) : null });
  const silver = c.silver != null ? { key: 'silver', label: 'Imperial Argents', figure: num(c.silver), none: false, note: null, weight: null }
    : c.silverWhy === 'none' ? { key: 'silver', label: 'Imperial Argents', figure: 'none', none: true, note: null, weight: null }
      : { key: 'silver', label: 'Imperial Argents', figure: null, none: false, note: SILVER_WHY[c.silverWhy] ?? SILVER_WHY.offline, weight: null };
  const seals = c.seals != null ? { key: 'seals', label: 'Psijic Seals', figure: num(c.seals), none: false, note: null, weight: null }
    : c.sealsWhy === 'none' ? { key: 'seals', label: 'Psijic Seals', figure: 'none', none: true, note: null, weight: null }
      : { key: 'seals', label: 'Psijic Seals', figure: null, none: false, note: SILVER_WHY[c.sealsWhy] ?? SILVER_WHY.asking, weight: null };
  return [
    { head: 'Coin', rows: [{ key: 'gold', label: 'Gold', figure: num(c.gold), none: false, note: null, weight: null }, silver, seals] },
    { head: 'In the wallet', rows: [
      count('letters', 'Letters of credit', c.letters.count, c.weights.letters, `worth ${num(c.letters.gold)} gold`),
      count('embers', 'Deadlands Embers', c.embers, c.weights.embers),
      count('shards', 'Welkynd Shards', c.shards, c.weights.shards),
    ] },
  ];
}
export const walletLine = (/** @type {{label: string, figure: string|null, note: string|null}} */ r) =>
  `${r.label}: ${[r.figure, r.note].filter(Boolean).join(', ')}`;
export function walletLines(/** @type {ReturnType<typeof walletContents>} */ c) {
  return ['Your wallet holds:', ...walletLedger(c).flatMap((part) => part.rows.map(walletLine))];
}

export const WALLET_CARD_LINES = Object.freeze([
  'Holds your letters of credit, Deadlands Embers and Welkynd Shards,',
  'and counts your gold, Imperial Argents, and Psijic Seals.',
]);

registerItemUseHandler(WALLET_TEMPLATE, (item) => ({ kind: 'wallet', item }));

export function _resetWalletForTests() { _silver = null; _refresh = null; _seals = null; _sealsRefresh = null; _asking = null; }
