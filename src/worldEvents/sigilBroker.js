// @ts-check
// The stock depends only on the shared-clock UTC day and fixed tables, never on mods or the player, so every player
// sees the same offers. Purchases are recorded in the character save, not on the device.

import { seededRng } from '../weather/wind.js';
import { gateHash } from '../net/gateLaw.js';
import { setItemFields, mintCondition } from '../items/itemTemplates.js';
import { ARMOR_MATERIAL } from '../items/armorMaterials.js';
import { WEAPON_MATERIALS } from '../characters/weapons.js';
import { createWeapon } from '../combat/enemyEquipment.js';
import { applyRarity, LEGENDARIES } from '../items/lootRarity.js';
import { SIGIL_BANDS } from '../items/sigil.js';
import { WORLD_SET_IDS, setById } from '../items/sigilSets.js';
import { REGALIA, mintAetheric } from '../items/aetheric.js';
import { SIGIL_STONE_TEMPLATE, isSigilStone, sigilStone } from './gateSpoils.js';
import { registerModSaveData } from '../saves/modSaveData.js';
import { isLocked } from '../items/itemLock.js';
import { addItem } from '../items/inventory.js';
import { isEquipped } from '../characters/equip.js';
import { EG_SINK_EMBERS, EG_PANOPLY_IDS } from '../net/eliteGates/egPay.js';
import { BROKER_RID_RE, mintBrokerRid, insigniaById } from '../net/insignia.js';
import { t } from '../ui/textManager.js';

export const BROKER_DAY_MS = 86_400_000;
const BROKER_SALT = 0x5349474c;
// Pass the shared relay clock, never the local clock, or players see different stock.
export const brokerDay = (nowMs) => Math.floor(Number(nowMs) / BROKER_DAY_MS);
export const brokerTurnsIn = (nowMs) => BROKER_DAY_MS - (((Number(nowMs) % BROKER_DAY_MS) + BROKER_DAY_MS) % BROKER_DAY_MS);

export const BROKER_PRICES = Object.freeze({ rare: 4, legendary: 6, weapon: 6, regalia: 12 });
export const BROKER_LEGENDARY_IN = 4;
export const BROKER_ARMOR_PLACES = Object.freeze([102, 103, 104, 105, 106, 107, 108, 'shield']);
export const BROKER_SHIELDS = Object.freeze([109, 110, 111, 112]);
export const BROKER_WEAPONS = Object.freeze([113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130]);
export const BROKER_ARMOR_MATERIALS = Object.freeze([ARMOR_MATERIAL.Dwarven, ARMOR_MATERIAL.Mithril, ARMOR_MATERIAL.Adamantium, ARMOR_MATERIAL.Ebony, ARMOR_MATERIAL.Orcish, ARMOR_MATERIAL.Daedric]);
export const BROKER_WEAPON_MATERIALS = Object.freeze([WEAPON_MATERIALS.Dwarven, WEAPON_MATERIALS.Mithril, WEAPON_MATERIALS.Adamantium, WEAPON_MATERIALS.Ebony, WEAPON_MATERIALS.Orcish, WEAPON_MATERIALS.Daedric]);

const pick = (list, rolls) => list[Math.min(list.length - 1, Math.floor(rolls() * list.length))];
// Uses only the base game Legendary records, since registered mod records differ by machine and would change the
// shared stock.
const baseLegendaries = (item) => LEGENDARIES.filter((l) => l.group === item.group && (!l.templates || l.templates.includes(item.templateIndex)));

function setArmour(set, rolls) {
  const place = pick(BROKER_ARMOR_PLACES, rolls);
  const templateIndex = place === 'shield' ? pick(BROKER_SHIELDS, rolls) : place;
  const item = mintCondition(setItemFields({ group: 'Armor', templateIndex, material: pick(BROKER_ARMOR_MATERIALS, rolls), flags: 0 }));
  const legendary = rolls() * BROKER_LEGENDARY_IN < 1 && baseLegendaries(item).length > 0;
  applyRarity(item, legendary ? 'legendary' : 'rare', rolls, legendary ? baseLegendaries(item) : null);
  item.isIdentified = true;
  item.sigil = { set, party: 1, xp: 0 };
  return item;
}
function setWeapon(set, rolls) {
  const item = createWeapon(pick(BROKER_WEAPONS, rolls), pick(BROKER_WEAPON_MATERIALS, rolls), rolls);
  applyRarity(item, 'rare', rolls);
  item.isIdentified = true;
  const [lo, hi] = SIGIL_BANDS.rare;
  item.sigil = { power: lo + Math.floor(rolls() * (hi + 1 - lo)), set, party: 1, xp: 0 };
  return item;
}

/** @param {number} day */
export function brokerStock(day) {
  const d = Math.trunc(Number(day)) || 0;
  const rolls = seededRng(gateHash(d >>> 0, BROKER_SALT));
  const offers = [];
  const offer = (kind, set, price, item) => { item.bound = true; item.stonesPaid = price; offers.push({ id: `${d}:${offers.length}`, day: d, slot: offers.length, kind, set, price, item }); };
  for (const set of WORLD_SET_IDS) {
    const item = setArmour(set, rolls);
    offer('armour', set, item.rarity === 'legendary' ? BROKER_PRICES.legendary : BROKER_PRICES.rare, item);
  }
  const wset = pick(WORLD_SET_IDS, rolls);
  offer('weapon', wset, BROKER_PRICES.weapon, setWeapon(wset, rolls));
  offer('regalia', 'ruhn', BROKER_PRICES.regalia, mintAetheric(pick(REGALIA, rolls)));
  return offers;
}

export const stonesIn = (items) => (Array.isArray(items) ? items.filter((it) => isSigilStone(it)) : []);
export const stoneCount = (items) => stonesIn(items).reduce((n, it) => n + Math.max(1, it.stackCount ?? 1), 0);
export function stonesToTake(items, price) {
  const take = [];
  let left = price;
  for (const item of stonesIn(items)) {
    if (left <= 0) break;
    const count = Math.min(left, Math.max(1, item.stackCount ?? 1));
    take.push({ item, count });
    left -= count;
  }
  return take;
}
export const spendableStonesIn = (items) => stonesIn(items).filter((it) => !isLocked(it));
export const lockedStonesIn = (items) => stonesIn(items).filter((it) => isLocked(it));

/**
 * @param {{ id: string, day: number, price: number } | null} offer
 * @param {{ items?: any[], bought?: Iterable<string>, day?: number }} state
 */
export function brokerOfferState(offer, { items = [], bought = [], day = null } = {}) {
  const have = stoneCount(items);
  if (!offer) return { ok: false, reason: 'gone', price: 0, have };
  const price = offer.price;
  if (day != null && offer.day !== day) return { ok: false, reason: 'gone', price, have };
  if (new Set(bought).has(offer.id)) return { ok: false, reason: 'bought', price, have };
  if (have < price) return { ok: false, reason: 'stones', price, have };
  return { ok: true, reason: null, price, have };
}

// Re-mints the piece from its day instead of handing over the displayed item, so the buyer's copy never shares
// state with the stock list.
export function brokerSale(offer, state) {
  const s = brokerOfferState(offer, state);
  if (!s.ok) return { ok: false, reason: s.reason };
  // Checks the offer id and price against the minted stock, so a hand-written offer cannot set its own price.
  const real = brokerStock(offer.day)[offer.slot] ?? null;
  if (!real || real.id !== offer.id || real.price !== offer.price) return { ok: false, reason: 'gone' };
  const give = real.item;
  return { ok: true, take: stonesToTake(state.items, offer.price), give };
}

/**
 * @param {any} offer
 * @param {{ items: any[], day: number, canCarry?: (item: any, rest: any[]) => boolean }} at
 */
export function makeBrokerSale(offer, { items, day, canCarry = () => true }) {
  if (!Array.isArray(items)) return { ok: false, reason: 'gone' };
  const sale = brokerSale(offer, { items: spendableStonesIn(items), bought: brokerBought(day), day });
  if (!sale.ok) return sale;
  const rest = [];
  for (const it of items) {
    const t = sale.take.find((e) => e.item === it);
    if (!t) rest.push(it);
    else if (t.count < Math.max(1, it.stackCount ?? 1)) rest.push({ ...it, stackCount: it.stackCount - t.count });
  }
  if (!canCarry(sale.give, rest)) return { ok: false, reason: 'heavy' };
  takeFromPack(items, sale.take);
  addItem(items, sale.give);
  markBrokerBought(offer);
  return { ok: true, item: sale.give };
}

/**
 * @param {any[]} items
 * @param {number} price
 */
export function spendStones(items, price) {
  if (!Array.isArray(items) || !(price > 0)) return false;
  const spendable = spendableStonesIn(items);
  if (stoneCount(spendable) < price) return false;
  takeFromPack(items, stonesToTake(spendable, price));
  return true;
}

/**
 * @param {any} entity
 * @param {() => void} [changed]
 */
export function emberHands(entity, changed = () => {}) {
  const items = () => (Array.isArray(entity?.items) ? entity.items : null);
  return Object.freeze({
    held: () => stoneCount(spendableStonesIn(items() ?? [])),
    take: (/** @type {number} */ n) => {
      const list = items();
      if (!list || !spendStones(list, n)) return { taken: 0, back: () => {} };
      changed();
      // `back` can be reached from several failure paths, so it refunds at most once.
      let given = false;
      return { taken: n, back: () => { if (given) return; given = true; addItem(list, Object.assign(sigilStone(), { stackCount: n })); changed(); } };
    },
  });
}

// No response, a 5xx, or offline may still have been written on the server. A 4xx or `no-session` means nothing was
// written.
export const insigniaUnheard = (r) => !r?.ok && r?.error !== 'no-session' && !(Number.isFinite(r?.status) && r.status < 500);

/**
 * Takes the stones before calling the service, so nothing spent during the request can leave the price untaken. A
 * held sale saves at once, and a lost answer is settled by its request id.
 * @param {{ id: string, price: number }} offer
 * @param {{ items: any[], buy: (id: string, rid: string) => Promise<any>, settle: (body: any) => Promise<any>, save: () => void, account: string|null, rid?: string }} io
 */
export async function insigniaSale(offer, { items, buy, settle, save, account, rid = mintBrokerRid() }) {
  if (_owed.length >= OWED_MAX) return { ok: false, error: 'unheard' };
  if (!spendStones(items, offer?.price)) return { ok: false, error: 'stones' };
  let r;
  try { r = await buy(offer.id, rid); } catch { r = { ok: false, error: 'offline' }; }
  if (insigniaUnheard(r)) {
    const s = await askAfter(settle, rid);
    if (!s) return oweSale({ kind: 'insignia', id: offer.id, embers: offer.price, rid, account }, items, save);
    if (s.held) r = { ok: true, data: s };
  }
  if (!r?.ok) {
    addItem(items, Object.assign(sigilStone(), { stackCount: offer.price }));
    return { ok: false, error: typeof r?.error === 'string' ? r.error : 'offline' };
  }
  save();
  return { ok: true, data: r.data };
}

/**
 * Mints the piece before taking embers, so a piece the host cannot make is never paid for. The piece drops
 * `stonesPaid`, so dismantling it refunds nothing.
 * @param {string} piece
 * @param {{ items: any[], buy: (piece: string, rid: string) => Promise<any>, settle: (body: any) => Promise<any>, mint: (piece: string) => any, save: () => void, account: string|null, rid?: string }} io
 */
export async function panoplySale(piece, { items, buy, settle, mint, save, account, rid = mintBrokerRid() }) {
  if (!EG_PANOPLY_IDS.includes(piece)) return { ok: false, error: 'piece' };
  if (_owed.length >= OWED_MAX) return { ok: false, error: 'unheard' };
  let item = null;
  try { item = mint(piece); } catch { item = null; }
  if (!item) return { ok: false, error: 'piece' };
  if (!spendStones(items, EG_SINK_EMBERS)) return { ok: false, error: 'stones' };
  let r;
  try { r = await buy(piece, rid); } catch { r = { ok: false, error: 'offline' }; }
  if (insigniaUnheard(r)) {
    const s = await askAfter(settle, rid);
    if (!s) return oweSale({ kind: 'panoply', id: piece, embers: EG_SINK_EMBERS, rid, account }, items, save);
    // The server gave this sale to a different ask (such as a reloaded save), so this page must not add the piece
    // again.
    if (s.held && !s.mine) return { ok: false, error: 'unheard' };
    if (s.held) r = { ok: true, data: { ok: true, piece, week: s.week } };
  }
  if (!r?.ok) {
    addItem(items, Object.assign(sigilStone(), { stackCount: EG_SINK_EMBERS }));
    return { ok: false, error: typeof r?.error === 'string' ? r.error : 'offline' };
  }
  delete item.stonesPaid;
  addItem(items, item);
  save();
  return { ok: true, data: r.data, item };
}

function takeFromPack(items, take) {
  for (const { item, count } of take) {
    const have = Math.max(1, item.stackCount ?? 1);
    if (count >= have) items.splice(items.indexOf(item), 1);
    else item.stackCount = have - count;
  }
}

// Each press carries a request id and is settled by that id alone: the server returns the sale that id wrote, or
// fences the id. Owed sales persist in the save under `SigilBrokerOwed`.
export const OWED_MAX = 8;
export const BROKER_OWED_VENDOR = 'SigilBrokerOwed';
export const BROKER_OWED_TEXT = 'No answer from the account service. Your embers are held, and the Broker settles the sale on your next visit.';
export const brokerOwedText = () => t('broker.owed', BROKER_OWED_TEXT);
let _owed = [];
const _asking = new Set();
// Keeps nonces from this page's lost settle asks, because any of them may be the first ask the server recorded.
const _lost = new Map();
const owedPrice = (kind, id) => (kind === 'panoply' ? (EG_PANOPLY_IDS.includes(id) ? EG_SINK_EMBERS : 0) : (insigniaById(id)?.price ?? 0));
const owedRow = (o) => ({ kind: o.kind, id: o.id, embers: o.embers, rid: o.rid, account: o.account });
const validOwedRow = (o) => !!o && typeof o === 'object' && (o.kind === 'insignia' || o.kind === 'panoply') && typeof o.id === 'string'
  && o.embers > 0 && o.embers === owedPrice(o.kind, o.id) && typeof o.rid === 'string' && BROKER_RID_RE.test(o.rid)
  && typeof o.account === 'string' && o.account.length > 0 && o.account.length <= 64;
// Rows are checked against current prices and deduplicated by request id, so an edited save cannot inflate a
// refund.
export function validOwed(r) {
  if (!Array.isArray(r)) return [];
  const seen = new Set();
  return r.filter((o) => validOwedRow(o) && !seen.has(o.rid) && seen.add(o.rid)).slice(-OWED_MAX).map(owedRow);
}
export const brokerOwed = () => _owed.map(owedRow);
registerModSaveData(BROKER_OWED_VENDOR, {
  newSaveData: () => [],
  getSaveData: () => brokerOwed(),
  restoreSaveData: (r) => { _owed = validOwed(r); },
});
function oweSale(row, items, save) {
  if (!row.account) { addItem(items, Object.assign(sigilStone(), { stackCount: row.embers })); return { ok: false, error: 'no-session' }; }
  _owed = [..._owed, row];
  save();
  return { ok: false, error: 'unheard' };
}
const lostAsk = (rid, nonce) => _lost.set(rid, [...(_lost.get(rid) ?? []), nonce].slice(-OWED_MAX));
async function askAfter(settle, rid) {
  const nonce = mintBrokerRid();
  let a = null;
  try { a = await settle({ rid, nonce }); } catch { a = null; }
  if (!a?.ok || typeof a.data?.held !== 'boolean') {
    if (insigniaUnheard(a)) lostAsk(rid, nonce);
    return null;
  }
  const mine = a.data.by === nonce || (_lost.get(rid) ?? []).includes(a.data.by);
  return { ...a.data, mine };
}
/**
 * Reads `items()` after each answer, so refunds land in the current pack even when a save loads while an ask is in
 * flight.
 * @param {{ settle: (body: any) => Promise<any>, account: () => string|null, items: () => any[], save: () => void, mint: (piece: string) => any }} io
 */
export async function settleOwedSales({ settle, account, items, save, mint }) {
  const me = account();
  for (const row of _owed.filter((o) => o.account === me && !_asking.has(o.rid))) {
    _asking.add(row.rid);
    try {
      const s = await askAfter(settle, row.rid);
      if (!s) continue;
      const live = _owed.find((o) => o.rid === row.rid);
      if (s.held && s.kind === 'panoply' && s.mine) {
        let it = null;
        try { it = live ? mint(live.id) : null; } catch { it = null; }
        if (!it) { lostAsk(row.rid, s.by); continue; }
        delete it.stonesPaid;
        addItem(items(), it);
      } else if (!s.held && live) addItem(items(), Object.assign(sigilStone(), { stackCount: live.embers }));
      if (!live) continue;
      _owed = _owed.filter((o) => o.rid !== row.rid);
      _lost.delete(row.rid);
      save();
    } finally { _asking.delete(row.rid); }
  }
}
/**
 * @param {{ items?: any[] }} entity
 * @param {{ changed: () => void }} saver
 * @param {(piece: string) => any} mint
 * @param {() => ({ account?: string|null } | null)} ioOf
 * @param {(io: any, body: any) => Promise<any>} settleDoor
 */
export function brokerOwedDoor(entity, saver, mint, ioOf, settleDoor) {
  const items = () => (entity.items ??= []);
  const save = () => saver.changed();
  const settle = (body) => settleDoor(ioOf(), body);
  const account = () => ioOf()?.account ?? null;
  return {
    insignia: (offer, buy) => insigniaSale(offer, { items: items(), buy, settle, save, account: account() }),
    panoply: (piece, buy) => panoplySale(piece, { items: items(), buy, settle, mint, save, account: account() }),
    settled: async (ask) => { await settleOwedSales({ settle, account, items, save, mint }); return ask(); },
  };
}
export function _resetOwed() { _owed = []; _asking.clear(); _lost.clear(); }

// Save slot name in modSaveData; renaming it drops the purchase record from existing saves.
export const BROKER_SAVE_VENDOR = 'SigilBroker';
const NO_RECORD = () => ({ day: -1, ids: [] });
let _bought = NO_RECORD();
export function validBrokerRecord(r) {
  if (!r || typeof r !== 'object' || !Number.isSafeInteger(r.day) || !Array.isArray(r.ids) || r.ids.length > 32) return NO_RECORD();
  if (!r.ids.every((x) => typeof x === 'string' && /^-?\d+:\d+$/.test(x))) return NO_RECORD();
  return { day: r.day, ids: [...new Set(r.ids)] };
}
export const brokerBought = (day) => (_bought.day === day ? [..._bought.ids] : []);
export function markBrokerBought(offer) {
  if (!offer) return;
  if (_bought.day !== offer.day) _bought = { day: offer.day, ids: [] };
  if (!_bought.ids.includes(offer.id)) _bought.ids.push(offer.id);
}
registerModSaveData(BROKER_SAVE_VENDOR, {
  newSaveData: NO_RECORD,
  getSaveData: () => ({ day: _bought.day, ids: [..._bought.ids] }),
  restoreSaveData: (r) => { _bought = validBrokerRecord(r); },
});

export const BROKER_DISMANTLE_SHARE = 0.5;
export const stonesText = (n) => `${n} Deadlands Ember${n === 1 ? '' : 's'}`;
// Pays only for bound pieces. Trades never deliver a bound piece, so a `stonesPaid` value a peer writes on its own
// item never pays out.
export function dismantleStones(item) {
  const paid = item?.stonesPaid;
  return item?.bound === true && Number.isSafeInteger(paid) && paid > 0 ? Math.max(1, Math.floor(paid * BROKER_DISMANTLE_SHARE)) : 0;
}
export function dismantleRefusal(item) {
  if (!dismantleStones(item)) return 'not';
  if (isEquipped(item)) return 'worn';
  if (isLocked(item)) return 'locked';
  return null;
}
/**
 * The day's purchase mark stays, so a dismantled ware cannot be bought again the same day.
 * @param {any} item
 * @param {{ items: any[] }} at
 */
export function dismantleWare(item, { items }) {
  if (!Array.isArray(items) || !items.includes(item)) return { ok: false, reason: 'gone' };
  const why = dismantleRefusal(item);
  if (why) return { ok: false, reason: why };
  const stones = dismantleStones(item);
  items.splice(items.indexOf(item), 1);
  addItem(items, Object.assign(sigilStone(), { stackCount: stones }));
  return { ok: true, stones };
}
// Appends the set name because a Legendary piece takes its base record's name, so offers from different sets can
// share a name.
export const wareName = (name, item) => { const set = setById(item?.sigil?.set)?.name; return set ? `${name} (${set})` : name; };
export const dismantleAsk = (name, n) => [`Dismantle ${name}?`, `You get ${stonesText(n)} back. This cannot be undone.`];
export const DISMANTLE_INSTEAD = (n) => `Dismantle it for ${stonesText(n)} instead?`;
export const DISMANTLE_WORN = (name) => `Take off ${name} before dismantling it.`;
export const DISMANTLED = (name, n) => `Dismantled: ${name}, for ${stonesText(n)}.`;

export const BROKER_REFUSALS = Object.freeze({ bought: 'You bought this one today. You can buy each piece once a day.', stones: 'Not enough Deadlands Embers', gone: 'No longer in stock', heavy: 'Too heavy to carry' });
export const offerSetName = (offer) => setById(offer?.set)?.name ?? '';
export { SIGIL_STONE_TEMPLATE };
export function _resetBrokerForTests() { _bought = NO_RECORD(); }
