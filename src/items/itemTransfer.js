import {
  addItem, canHoldAmount, packCanHoldAmount, effectiveUnitWeightInKg, totalWeight, isSummoned,
  splitStack, GOLD_PIECE_WEIGHT_KG, addGoldPieces, isGoldPieces, tellTaken,
  findExistingStack, goldStack,
} from './inventory.js';
import { LOOT_STACK_MAX } from './loot.js';
import { isRoomCarried } from './roomCarriedList.js';
import { isMap, isLightSource, isSpellbook } from './useItem.js';
import { cannotRemoveItemText } from './createItem.js';
import { entityMaxEncumbrance } from '../combat/formulas.js';
import { makeItemPermanent } from '../systems/quest/item.js';
import { getBool } from '../platform/settings.js';
import { setLightSource } from './lightSource.js';
import { localizedText, formatText, t } from '../ui/textManager.js';
import { REMAINS_LIST } from '../systems/legacy/heirloom.js';
import { BAG_WORDS, isBagItem, holdsOtherBag } from '../net/bagLaw.js';
import { SMALL_CART_KG } from '../travel/wagonKinds.js';
import { takenFromKeeping, returnedToKeeping, landedInKeeping } from '../justice/stolenGoods.js';

export const WAGON_KG_LIMIT = SMALL_CART_KG;
export const CANNOT_HOLD_TEXT = 'Your wagon cannot hold any more stuff.';
export const CANNOT_CARRY_TEXT = 'You cannot carry any more stuff.';
export const cannotHoldText = () => localizedText('cannotHoldAnymore', CANNOT_HOLD_TEXT);
export const cannotCarryText = () => localizedText('cannotCarryAnymore', CANNOT_CARRY_TEXT);

export const isKeptSpellbook = (item) => isSpellbook(item) && item.group === 'MiscItems' && !item.questItem;
export const SPELLBOOK_KEPT_TEXT = 'Your spellbook never leaves you.';

export const REFUSAL = Object.freeze({
  missing: { reason: 'missing', text: null },
  transport: { reason: 'transport', text: null },
  summoned: { reason: 'summoned', get text() { return cannotRemoveItemText(); } },
  questItem: { reason: 'questItem', get text() { return cannotRemoveItemText(); } },
  remains: { reason: 'remains', text: 'These are the remains of your blood. Carry them home, or leave them where they lie.' },
  spellbook: { reason: 'spellbook', text: SPELLBOOK_KEPT_TEXT },
  chooseOnePile: { reason: 'chooseOnePile', text: null },
  wagonFull: { reason: 'wagonFull', get text() { return cannotHoldText(); } },
  cannotCarry: { reason: 'cannotCarry', get text() { return cannotCarryText(); } },
  bagLoaded: { reason: 'bagLoaded', text: BAG_WORDS.notEmpty },
  secondBag: { reason: 'secondBag', text: BAG_WORDS.second },
  questTwin: { reason: 'questTwin', get text() { return t('items.refusal.questTwin', 'You already have this quest item.'); } },
  badAmount: { reason: 'badAmount', text: null },
  sharedGoldFull: { reason: 'sharedGoldFull', get text() { return sharedGoldFullText(); } },
});

export function sendQuestItemClick(item, getQuest = null) {
  if (!item?.questItem) return false;
  const questItem = getQuest?.(item.questUID)?.getItem?.(item.questSymbol) ?? null;
  if (!questItem) return false;
  questItem.setPlayerClicked();
  return true;
}

export function holdsQuestTwin(lists, item) {
  if (!item?.questItem) return false;
  const name = item.questSymbol?.name;
  return lists.some((l) => Array.isArray(l) && l.some((x) => x !== item && x?.questItem && x.questUID === item.questUID && x.questSymbol?.name === name));
}

export function keepsQuestItem(entity, res) {
  const uid = res?.parentQuest?.uid, name = res?.symbol?.name;
  return [entity?.items, entity?.wagonItems, entity?.bagItems, entity?.otherItems]
    .some((l) => Array.isArray(l) && l.some((it) => it?.questItem && it.questUID === uid && it.questSymbol?.name === name));
}

/**
 * @param {any[]} items
 * @param {any} dfItem
 * @param {{ clones?: boolean }} [opts]
 */
export function heldQuestRecordIndex(items, dfItem, { clones = false } = {}) {
  const list = Array.isArray(items) ? items : [];
  const direct = list.indexOf(dfItem);
  if (direct >= 0) return direct;
  if (!dfItem?.questItem) return -1;
  const same = (it) => !!it?.questItem && it.questUID === dfItem.questUID && it.questSymbol?.name === dfItem.questSymbol?.name;
  const own = list.findIndex((it) => same(it) && !it.questClone);
  return own >= 0 || !clones ? own : list.findIndex(same);
}

export function makeHeldQuestItemsPermanent(entity, uid, sym) {
  for (const it of entity?.items ?? []) {
    if (it.questItem && it.questUID === uid && it.questSymbol?.name === sym?.name) makeItemPermanent(it);
  }
}

export function questTransferRefused(item, { fromLocal, toWagon = false, getQuest = null, trade = false } = {}) {
  if (!item?.questItem) return false;
  const quest = getQuest?.(item.questUID) ?? null;
  const questItem = quest?.getItem?.(item.questSymbol) ?? null;
  if (!trade && fromLocal && quest?.shelvedAt != null && questItem && !questItem.madePermanent) return false;
  if (!getBool('GUI', 'CanDropQuestItems')) {
    if (questItem === null || (!questItem.allowDrop && fromLocal)) return true;
  }
  if (!questItem) return false;
  if (questItem.allowDrop && fromLocal && !toWagon) questItem.playerDropped = true;
  else if (!fromLocal) questItem.playerDropped = false;
  if (questItem.madePermanent) makeItemPermanent(item);
  return false;
}

export const wagonFullGoldText = (n) => formatText(localizedText('wagonFullGold', 'Your wagon could only hold {0} gold pieces.'), n);
export const packFullText = (name) => `${name || 'Your companion'} cannot carry any more.`;
export const packFullGoldText = (name, n) => `${name || 'Your companion'} could only carry ${n} gold pieces.`;
export const sharedGoldText = (n) => t('items.gold.sharedRoom', 'Only {n, number} more gold pieces fit here. Everyone here shares this container, and one pile of gold in it holds no more than {max, number}.', { n, max: LOOT_STACK_MAX });
export const sharedGoldFullText = () => t('items.gold.sharedFull', 'No more gold fits here. Everyone here shares this container, and one pile of gold in it holds no more than {max, number}.', { max: LOOT_STACK_MAX });
export function sharedGoldRoom(remote) {
  const onto = findExistingStack(remote, goldStack(1));
  return Math.max(0, LOOT_STACK_MAX - (onto ? (onto.stackCount ?? 1) : 0));
}
export const packGoneText = (name) => `${name || 'Your companion'} is no longer with you.`;
const packFull = (capacity) => (capacity?.gone ? { reason: 'packGone', text: packGoneText(capacity?.name) } : { reason: 'packFull', text: packFullText(capacity?.name) });
const packRefuses = (capacity, item, units, remote) => !!capacity.gone || canHoldAmount(units, effectiveUnitWeightInKg(item), capacity.kg, totalWeight(remote)) <= 0;

/** @returns {{ok:true, amount:number, notice:string|null} |{ok:false, refusal:object, notice:string|null}} */
export function planDropGold(text, { carried = 0, usingWagon = false, remote = [], shared = isRoomCarried(remote), groundRefusal = null, capacity = null, wagonKg = WAGON_KG_LIMIT } = {}) {
  if (groundRefusal && !usingWagon) return { ok: false, refusal: { reason: 'ground', text: groundRefusal }, notice: null };
  const asked = /^[0-9]+$/.test(String(text)) ? Number(text) : 0;
  if (asked < 1 || asked > carried) return { ok: false, refusal: REFUSAL.badAmount, notice: null };
  if (!usingWagon && capacity) {
    if (capacity.gone) { const r = packFull(capacity); return { ok: false, refusal: r, notice: r.text }; }
    const canCarry = canHoldAmount(carried, GOLD_PIECE_WEIGHT_KG, capacity.kg, totalWeight(remote));
    const notice = asked > canCarry ? packFullGoldText(capacity.name, Math.max(0, canCarry)) : null;
    const amount = Math.min(asked, canCarry);
    if (amount < 1) return { ok: false, refusal: packFull(capacity), notice };
    return { ok: true, amount, notice };
  }
  if (!usingWagon && shared) {
    const room = sharedGoldRoom(remote);
    const amount = Math.min(asked, room);
    if (amount < 1) return { ok: false, refusal: REFUSAL.sharedGoldFull, notice: sharedGoldFullText() };
    return { ok: true, amount, notice: asked > room ? sharedGoldText(room) : null };
  }
  if (!usingWagon) return { ok: true, amount: asked, notice: null };
  const canHold = canHoldAmount(carried, GOLD_PIECE_WEIGHT_KG, wagonKg, totalWeight(remote));
  const notice = asked > canHold ? wagonFullGoldText(canHold) : null;
  const amount = Math.min(asked, canHold);
  if (amount < 1) return { ok: false, refusal: REFUSAL.wagonFull, notice };
  return { ok: true, amount, notice };
}

/** @returns {{ok:false, refusal:object}|{ok:true, amount:number, sound:'click'}} */
export function planStore(item, {
  remote = [], usingWagon = false, chooseOne = null, getQuest = null, dryRun = false, groundRefusal = null, capacity = null, bagLoaded = false, wagonKg = WAGON_KG_LIMIT,
} = {}) {
  if (!item) return { ok: false, refusal: REFUSAL.missing };
  if (bagLoaded && isBagItem(item)) return { ok: false, refusal: REFUSAL.bagLoaded };
  if (groundRefusal) return { ok: false, refusal: { reason: 'ground', text: groundRefusal } };
  if (item.group === 'Transportation') return { ok: false, refusal: REFUSAL.transport };
  if (isKeptSpellbook(item) && !usingWagon) return { ok: false, refusal: REFUSAL.spellbook };
  if (isSummoned(item)) return { ok: false, refusal: REFUSAL.summoned };
  if (item.legacyRemains && !usingWagon && remote?.[REMAINS_LIST] !== item.legacyRemains.of) return { ok: false, refusal: REFUSAL.remains };
  if (isMap(item)) return { ok: true, map: true, amount: item.stackCount ?? 1 };
  if (capacity && !usingWagon && packRefuses(capacity, item, item.stackCount ?? 1, remote)) return { ok: false, refusal: packFull(capacity) };
  // The quest arm writes playerDropped, so a storage limit refuses above it and the wagon gate runs below it.
  if (!dryRun && questTransferRefused(item, { fromLocal: true, toWagon: usingWagon, getQuest })) {
    return { ok: false, refusal: REFUSAL.questItem };
  }
  if (chooseOne) return { ok: false, refusal: REFUSAL.chooseOnePile };
  const stack = item.stackCount ?? 1;
  if (usingWagon) {
    const canHold = canHoldAmount(stack, effectiveUnitWeightInKg(item), wagonKg, totalWeight(remote));
    if (canHold <= 0) return { ok: false, refusal: REFUSAL.wagonFull };
    return { ok: true, amount: Math.min(canHold, stack), sound: 'click' };
  }
  if (capacity) {
    const canHold = canHoldAmount(stack, effectiveUnitWeightInKg(item), capacity.kg, totalWeight(remote));
    if (capacity.gone || canHold <= 0) return { ok: false, refusal: packFull(capacity) };
    return { ok: true, amount: Math.min(canHold, stack), sound: 'click' };
  }
  return { ok: true, amount: stack, sound: 'click' };
}

/** @returns {{ok:false, refusal:object}|{ok:true, amount, sound, equip, claimsChoice}} */
export function planTake(item, {
  bag = [], entity = null, mode = 'remove', chooseOne = null, usingWagon = false,
  getQuest = null, dryRun = false,
} = {}) {
  if (!item) return { ok: false, refusal: REFUSAL.missing };
  if (isSummoned(item)) return { ok: false, refusal: REFUSAL.summoned };
  if (isMap(item)) return { ok: true, map: true, amount: item.stackCount ?? 1 };
  const ownWagon = Array.isArray(entity?.wagonItems) && entity.wagonItems.includes(item);
  if (isBagItem(item) && !ownWagon && holdsOtherBag([bag, entity?.wagonItems], item)) return { ok: false, refusal: REFUSAL.secondBag };
  if (holdsQuestTwin([bag, entity?.items, entity?.wagonItems, entity?.bagItems], item)) return { ok: false, refusal: REFUSAL.questTwin };
  if (!dryRun && questTransferRefused(item, { fromLocal: false, toWagon: usingWagon, getQuest })) {
    return { ok: false, refusal: REFUSAL.questItem };
  }
  const stack = item.stackCount ?? 1;
  const canCarry = entity
    ? packCanHoldAmount(entity, stack, effectiveUnitWeightInKg(item), entityMaxEncumbrance(entity), bag)
    : stack;
  if (canCarry <= 0) return { ok: false, refusal: REFUSAL.cannotCarry };
  return {
    ok: true,
    amount: Math.min(canCarry, stack),
    sound: isGoldPieces(item) ? 'gold' : 'click',
    equip: mode === 'equip',
    claimsChoice: !!chooseOne && !usingWagon,
  };
}

export const HOW_MANY_ITEMS = (max) => formatText(localizedText('howManyItems', 'Pick how many items (max {0})?'), max);
export const SPLIT_INPUT_MAX = 8;

export function parseSplitAmount(text, max) {
  const t = String(text ?? '').trim();
  if (!/^[+-]?\d+$/.test(t)) return null;
  const count = Number(t);
  return Number.isInteger(count) && count >= 1 && count <= max ? count : null;
}

export function splitRequired(item, amount, controlDown = false) {
  const stack = item?.stackCount ?? 1;
  return stack > 1 && (amount < stack || !!controlDown);
}

export function clearLightSourceOnLeave(item, entity, fromLocal) {
  if (fromLocal && entity && isLightSource(item) && entity.lightSource === item) setLightSource(entity, null);
}

export function applyTransfer(item, plan, from, to, { entity = null, fromLocal = false, toPlayer = false, rolls = Math.random, stolenFrom = null, returnTo = null } = {}) {
  if (Array.isArray(from) && !from.includes(item)) return null;
  clearLightSourceOnLeave(item, entity, fromLocal);
  // Gold into the pack goes to the purse and returns null; a list the service settles keeps its coin as a pile.
  if (toPlayer && isGoldPieces(item) && from?.pileCoins !== true) {
    const coin = _splitOff(item, plan, from, rolls);
    const at = from.indexOf(coin);
    if (at >= 0) from.splice(at, 1);
    takenFromKeeping(stolenFrom, item, coin);
    addGoldPieces(entity, coin.stackCount ?? 1);
    return null;
  }
  const landed = _applyTransfer(item, plan, from, to, rolls, (moved) => { takenFromKeeping(stolenFrom, item, moved); returnedToKeeping(returnTo, item, moved); },
    (moved, held) => landedInKeeping(returnTo, item, moved, held));
  if (toPlayer && landed) tellTaken(landed);
  return landed;
}
function _splitOff(item, plan, from, rolls) {
  const stack = item.stackCount ?? 1;
  if (plan.amount >= stack) return item;
  const minted = splitStack(from, item, plan.amount, { rolls });
  if (minted && minted !== item) return minted;
  item.stackCount = stack - plan.amount;
  return { ...item, stackCount: plan.amount };
}
function _applyTransfer(item, plan, from, to, rolls = Math.random, beforeLanding = null, afterLanding = null) {
  const moved = _splitOff(item, plan, from, rolls);
  const at = from.indexOf(moved);
  if (at >= 0) from.splice(at, 1);
  // The stolen mark is written before landing, because landing can merge the record into a stack.
  beforeLanding?.(moved);
  // A shared chest records each stack on its own; merging would add the count onto a pile the settle also stores.
  const held = to?.unstacked === true ? (to.push(moved), moved) : addItem(to, moved, moved?.questItem ? 'front' : 'dontCare');
  afterLanding?.(moved, held);
  return moved;
}
