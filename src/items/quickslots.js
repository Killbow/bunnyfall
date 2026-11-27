// Quickslot and hotbar model for the enhanced HUD. A slot holds an item kind (quickslotKey) and a name, never a
// record, because records carry no unique id and the pack reorders. A kind the pack lacks is a ghost that refills.
import { TEMPLATES } from './itemKinds.js';
import { ABILITIES, abilityById } from '../combat/abilities/registry.js';
import { abilitiesEnabled, learnedAbility } from '../combat/abilities/progress.js';
import { activeAbilityWeapon, abilityCooldown, abilityInHand, abilityPlayable, abilityRefusalText, requestHotbarAbility } from '../combat/abilities/rig.js';
import { utilityProfile } from '../combat/abilities/utilityProfiles.js';
import { requestUtility } from '../combat/abilities/utility.js';
import { isPotion, isDrug, isLightSource, useItem, USE_PENDING } from './useItem.js';
import { walletContents, walletLines, refreshWalletSilver } from './walletItem.js';
import { equipItem, equipTableOf, EQUIP_SLOTS, isBrokenItem, isForbiddenEquip, isEquipped, unequipSlot, oneEquipAct,
  getItemHands, ITEM_HANDS, getEquipSlot,
  equipDelaySnapshot, billEquipDelayOnClose, ITEM_BROKEN_TEXT_ID, FORBIDDEN_EQUIPMENT_TEXT_ID } from '../characters/equip.js';
import { isShieldTemplate } from './armorMaterials.js';
import { lanternAtWaist } from '../player/playerTorch.js';
import { itemLongName, conditionPercentage } from './itemInfo.js';
import { isEnchanted } from './inventory.js';
import { ENCHANTMENT_TYPES } from '../formats/magicDef.js';
import { isPower } from '../magic/enchantmentCatalogue.js';
import { shownSpellName } from './loot.js';
import { retiredItemKey, hookItemKey } from './retiredItems.js';
import { isGrappleItem } from '../characters/heavyGearIds.js';
import { isAmmunition } from './itemTemplates.js';

import { expandRowValues } from '../systems/quest/questMacros.js';
import { racialSuppressInventory, LYCANTHROPY_SPELL_TAG } from '../afflictions/lycanthropy.js';
import { BOOK_TEMPLATE } from './books.js';
import { hotbarInForce } from '../ui/uiSkin.js';
import { noteFirstUse } from '../ui/tutorials.js';
import { CAST_PRESS } from '../combat/twoHands/spellHand.js';
export const QUICKSLOTS = Object.freeze(['c1', 'c2', 'swap']);
const CONSUMABLE_SLOTS = Object.freeze(['c1', 'c2']);
const ARROW = 131;

export const QUICKSLOT_TEXT = Object.freeze({
  emptySlot: 'Nothing is in that slot.',
  readyWeapon: (key) => `Press ${key} to ready your weapon.`,
  noneLeft: (name) => `You have no ${name} left.`,
  noSwap: 'No weapon is set to swap to.',
  swapGone: (name) => `Your ${name} is not in your pack.`,
  swapHeld: (name) => `You are already holding your ${name}.`,
  swapped: (name) => `You ready your ${name}.`,
  putAway: (name) => `You put away your ${name}.`,
  handsEmpty: 'Your hands are already empty.',
  noLight: 'You have no light source.',
  noSpells: 'You know no spells.',
  spellGone: (name) => `You no longer know ${name}.`,
  unreadied: (name) => `You put away ${name}.`,
  cannotUse: (name) => `You cannot use your ${name}.`,
});

// Bare hands are a swap target, so a swap out of empty hands can swap back.
export const BARE_KEYS = Object.freeze({ R: 'bare:R', L: 'bare:L' });
export const BARE_NAME = 'Bare hands';
const bareHandOf = (key) => (key === BARE_KEYS.L ? 'L' : key === BARE_KEYS.R ? 'R' : null);

const state = { c1: null, c2: null, swap: null };
let spellState = null;

// Only plain records cache their key, because the item maker writes enchantments onto an existing record.
const _keys = new WeakMap();
const plain = (it) => !(it.enchantments?.length || it.customEnchantments?.length || it.affixes?.length);
export function quickslotKey(item) {
  if (!item || typeof item !== 'object') return null;
  if (!plain(item)) return computeKey(item);
  const had = _keys.get(item);
  if (had !== undefined) return had;
  const key = computeKey(item);
  _keys.set(item, key);
  return key;
}
function computeKey(item) {
  const ench = Array.isArray(item.enchantments) && item.enchantments.length
    ? JSON.stringify(item.enchantments) : '';
  const custom = Array.isArray(item.customEnchantments) && item.customEnchantments.length
    ? JSON.stringify(item.customEnchantments) : '';
  const affixes = Array.isArray(item.affixes) && item.affixes.length ? JSON.stringify(item.affixes) : '';
  return [item.group ?? '', item.templateIndex ?? '', item.material ?? '', item.potionRecipeKey ?? '',
    item.legendary ?? '', ench, custom, affixes, item.aetheric ?? ''].join('|')
    // Suffixes are added only when set, so keys in older saves still resolve.
    + (item.gilded ? `|g${item.gilded}` : '')
    + (item.potent ? `|p${item.potent}` : '')
    + (typeof item.card === 'string' ? `|c${item.card}` : '')
    + (item.templateIndex === BOOK_TEMPLATE && item.message != null ? `|m${item.message}` : '');
}

export const isQuickConsumable = (item) => isPotion(item) || isDrug(item);

export const canSwapTo = (item) => !!item && item.group === 'Weapons' && item.templateIndex !== ARROW && !isGrappleItem(item) && !isEquipped(item);

const assertSlot = (slot) => { if (!QUICKSLOTS.includes(slot)) throw new Error(`quickslots: no slot ${slot}`); };

export function assignQuickslot(slot, item) {
  assertSlot(slot);
  const ok = slot === 'swap' ? canSwapTo(item) : isQuickConsumable(item);
  if (!ok) return false;
  const key = quickslotKey(item);
  const name = itemLongName(item);
  if (slot !== 'swap') for (const s of CONSUMABLE_SLOTS) if (s !== slot && state[s]?.key === key) state[s] = null;
  state[slot] = { key, name };
  return true;
}

export function clearQuickslot(slot) { assertSlot(slot); state[slot] = null; }
export function clearQuickslots() { for (const s of QUICKSLOTS) state[s] = null; spellState = null; hotbar.fill(null); hotbarPresets.fill(null); hotbarPresetAt = 0; hotbarRev++; }

export function quickslotOf(item) {
  const key = quickslotKey(item);
  if (key == null) return null;
  for (const s of QUICKSLOTS) if (state[s]?.key === key) return s;
  return null;
}

export const quickslotEntry = (slot) => (assertSlot(slot), state[slot] ? { ...state[slot] } : null);

const packOf = (entity) => (Array.isArray(entity?.items) ? entity.items : []);

const spentCharges = (it) => (it.maxCondition ?? 0) > 0 && (it.currentCondition ?? 0) <= 0;
export function resolveConsumable(entity, slot) {
  const e = state[slot];
  if (!e) return null;
  let item = null; let count = 0;
  for (const it of packOf(entity)) {
    if (quickslotKey(it) !== e.key) continue;
    // A charged kind such as a Campfire resolves to a record with charges left.
    if (!item || (spentCharges(item) && !spentCharges(it))) item = it;
    count += Math.max(0, it.stackCount ?? 1);
  }
  // The lit light of the kind comes first, so pressing a burning kind puts it out.
  const lit = entity?.lightSource ?? null;
  if (lit && quickslotKey(lit) === e.key) { item = lit; count = Math.max(count, 1); }
  return { key: e.key, name: e.name, item, count };
}

export function resolveSwap(entity) {
  const e = state.swap;
  if (!e) return null;
  const bare = bareHandOf(e.key);
  if (bare) return { key: e.key, name: e.name, item: null, bare };
  const ofKind = packOf(entity).filter((it) => quickslotKey(it) === e.key);
  const matches = ofKind.filter((it) => !isEquipped(it));
  // Prefers a sound record, since condition is not part of the key.
  const item = matches.find((it) => !isBrokenItem(it)) ?? matches[0] ?? null;
  const held = item ? null : (ofKind.find((it) => isEquipped(it)) ?? null);
  return { key: e.key, name: e.name, item, held };
}

const cell = (item, extra = {}) => ({ item, name: itemLongName(item), condition: conditionPercentage(item), ...extra });

export function quickslotView(entity, { weapon = null, sheathed = false, readiedIndex = null } = {}) {
  const main = weapon ? cell(weapon, { sheathed: !!sheathed }) : null;
  let off;
  const lit = entity?.lightSource ?? null;
  const left = entity ? (equipTableOf(entity)[EQUIP_SLOTS.LeftHand] ?? null) : null;
  if (lit) off = cell(lit, { kind: 'torch', ...(lit.templateIndex === TEMPLATES.Lantern ? { condition: null } : {}) });
  else if (left && isShieldTemplate(left.templateIndex)) off = cell(left, { kind: 'shield' });
  else if (left) off = cell(left, { kind: 'weapon' });
  else if (state.swap) {
    const r = resolveSwap(entity);
    off = r.item ? cell(r.item, { kind: 'swap' })
      : r.bare ? { kind: 'swap', item: null, name: r.name, condition: null, bare: true }
        : r.held ? cell(r.held, { kind: 'swap', held: true })
          : { kind: 'swap', item: null, name: r.name, condition: null };
  } else off = { kind: 'empty', item: null, name: null, condition: null };
  const sp = resolveSpellQuickslot(entity);
  const spell = sp ? { ...sp, readied: readiedIndex != null && readiedIndex === sp.index } : null;
  return { main, off, spell, cycling: quickslotCycling(),
    c1: resolveConsumable(entity, 'c1'), c2: resolveConsumable(entity, 'c2') };
}

export const offHandOffersSwap = (entity) => quickslotView(entity).off.kind === 'swap';

// Each performer records its own result, because host doors return true whatever happened; hotbarPress reads it.
let _performed = null;
const REFUSED = new Set(['refused', 'empty', 'none', 'gone', 'held']);
const performedOk = (r) => !!r && !REFUSED.has(r.kind) && r.result?.kind !== 'empty';

export { hotbarInForce };

export function emptySlotLine({ weapon = null, sheathed = false, readyKey = null } = {}) {
  return weapon && sheathed && readyKey ? `${QUICKSLOT_TEXT.emptySlot} ${QUICKSLOT_TEXT.readyWeapon(readyKey)}` : QUICKSLOT_TEXT.emptySlot;
}

export function useQuickslot(slot, opts = {}) { noteFirstUse('quickslots'); return (_performed = useQuickslotNow(slot, opts)); }
function useQuickslotNow(slot, { entity = null, items = null, hooks = {}, say = null } = {}) {
  if (!CONSUMABLE_SLOTS.includes(slot)) throw new Error(`quickslots: ${slot} is not a consumable slot`);
  const sup = racialSuppressInventory(entity);
  if (sup) { say?.(sup.text); return { kind: 'refused' }; }
  const r = resolveConsumable(entity, slot);
  if (!r) { say?.(emptySlotLine(hooks.hand?.() ?? undefined)); return { kind: 'empty' }; }
  if (!r.item) { say?.(QUICKSLOT_TEXT.noneLeft(r.name)); return { kind: 'none', name: r.name }; }
  const pack = items ?? packOf(entity);
  const res = useItem(r.item, pack, {
    entity,
    localItems: pack,
    spellCount: () => entity?.spells?.length ?? 0,
    isEnchanted: hooks.isEnchanted ?? (() => false),
    nowMinute: hooks.nowMinute?.() ?? 0,
    revealMap: hooks.revealMap ?? null,
    drinkPotion: hooks.drinkPotion ?? null,
    getQuest: hooks.getQuest ?? null,
  });
  if (res?.kind === 'book' && typeof hooks.openBook === 'function') {
    const fail = res.failText ?? null;
    hooks.openBook(res.item ?? r.item, () => { if (fail) say?.(fail); });
    return { kind: 'used', name: r.name, result: res };
  }
  if (res?.kind === 'spellbook' && typeof hooks.openSpellbook === 'function') {
    hooks.openSpellbook();
    return { kind: 'used', name: r.name, result: res };
  }
  if ((res?.kind === 'pitchCamp' || res?.kind === 'placeFire') && typeof hooks.placeCamp === 'function') {
    if (hooks.placeCamp(res.item ?? r.item, pack) === false) return { kind: 'refused', name: r.name, result: res };
    return { kind: 'used', name: r.name, result: res };
  }
  if (res?.kind === 'openPortal' && typeof hooks.openPortal === 'function') {
    if (hooks.openPortal(res.item ?? r.item, pack) === false) return { kind: 'refused', name: r.name, result: res };
    return { kind: 'used', name: r.name, result: res };
  }
  if (res?.kind === 'wallet') {
    say?.(walletLines(walletContents(pack, entity)).slice(1).join(' · '));
    refreshWalletSilver();
    return { kind: 'used', name: r.name, result: res };
  }
  if ((res?.kind === 'book' || res?.kind === 'spellbook' || res?.kind === 'pitchCamp' || res?.kind === 'placeFire' || res?.kind === 'openPortal') && USE_PENDING[res.kind]) {
    say?.(USE_PENDING[res.kind]);
    return { kind: 'refused', name: r.name, result: res };
  }
  if (res?.refused) {
    if (res.text && !res.said) say?.(res.text);
    return { kind: 'refused', name: r.name, result: res };
  }
  if (res?.kind === 'none' && !res.enchanted && !res.questItem) {
    say?.(QUICKSLOT_TEXT.cannotUse(r.name));
    return { kind: 'refused', name: r.name, result: res };
  }
  const text = res.text
    ?? (res.textId && hooks.rows ? expandRowValues(hooks.rows(res.textId) ?? [], res.macros ?? null).map((row) => (typeof row === 'string' ? row : row?.text ?? '')).join(' ').trim() : null)
    ?? (res.pending ? (USE_PENDING[res.kind] ?? 'Nothing happens.') : null)
    ?? (res.enchanted ? USE_PENDING.enchanted : null);
  if (text) say?.(text);
  return { kind: 'used', name: r.name, result: res };
}

export function swapQuickslot(opts = {}) { return (_performed = swapQuickslotNow(opts)); }
function swapQuickslotNow({ entity = null, say = null, rows = null, hand = null } = {}) {
  const sup = racialSuppressInventory(entity);
  if (sup) { say?.(sup.text); return { kind: 'refused' }; }
  const r = resolveSwap(entity);
  if (!r) { say?.(QUICKSLOT_TEXT.noSwap); return { kind: 'none' }; }
  const table = equipTableOf(entity);
  // The swap bills the equip pause as closing the inventory window does, so a hotkey swap is not free.
  const snap = equipDelaySnapshot(entity);
  if (r.bare) {
    const hand = r.bare === 'L' ? EQUIP_SLOTS.LeftHand : EQUIP_SLOTS.RightHand;
    const held = table[hand] ?? null;
    if (!held) { say?.(QUICKSLOT_TEXT.handsEmpty); return { kind: 'none' }; }
    unequipSlot(entity, hand);
    billEquipDelayOnClose(entity, snap);
    state.swap = canSwapTo(held) ? { key: quickslotKey(held), name: itemLongName(held) } : null;
    say?.(QUICKSLOT_TEXT.putAway(itemLongName(held)));
    return { kind: 'swapped', name: r.name, item: null, previous: held };
  }
  if (!r.item) {
    if (r.held) { say?.(QUICKSLOT_TEXT.swapHeld(r.name)); return { kind: 'held', name: r.name }; }
    say?.(QUICKSLOT_TEXT.swapGone(r.name)); return { kind: 'gone', name: r.name };
  }
  const refuse = (id, kind) => {
    const text = rows ? expandRowValues(rows(id) ?? [], { it: itemLongName(r.item) }).map((row) => (typeof row === 'string' ? row : row?.text ?? '')).join(' ').trim() : '';
    if (text) say?.(text);
    return { kind, name: r.name };
  };
  if (isBrokenItem(r.item)) return refuse(ITEM_BROKEN_TEXT_ID, 'broken');
  if (isForbiddenEquip(entity?.career, r.item)) return refuse(FORBIDDEN_EQUIPMENT_TEXT_ID, 'forbidden');
  const hands = getItemHands(r.item);
  const leftOnly = hands === ITEM_HANDS.LeftOnly;
  const inUse = hand?.usingRightHand === false ? EQUIP_SLOTS.LeftHand : EQUIP_SLOTS.RightHand;
  const target = leftOnly ? EQUIP_SLOTS.LeftHand : hands === ITEM_HANDS.Both ? EQUIP_SLOTS.RightHand : inUse;
  const previous = table[target] ?? null;
  // Empties the target hand first, since equipItem alone puts an either-handed weapon in the first open hand.
  // The bump and the equip are one act, so equip listeners only see the settled hand.
  const un = oneEquipAct(() => {
    const bumped = previous && !leftOnly ? unequipSlot(entity, target) : null;
    const got = equipItem(entity, r.item);
    if (got === null && bumped) equipItem(entity, bumped);
    return got;
  });
  if (un === null) return { kind: 'refused', name: r.name };
  billEquipDelayOnClose(entity, snap);
  const landed = r.item.equipSlot ?? null;
  // The equip table can still place the weapon in the hand not in use, so the hand follows the weapon.
  if (hand && landed != null && landed !== inUse) hand.switchHand?.();
  const leaver = previous && !isEquipped(previous) ? previous : null;
  if (leaver && canSwapTo(leaver)) state.swap = { key: quickslotKey(leaver), name: itemLongName(leaver) };
  else if (!previous) state.swap = { key: r.item.equipSlot === EQUIP_SLOTS.LeftHand ? BARE_KEYS.L : BARE_KEYS.R, name: BARE_NAME };
  else state.swap = null;
  say?.(QUICKSLOT_TEXT.swapped(r.name));
  return { kind: 'swapped', name: r.name, item: r.item, previous: leaver };
}

export function offHandQuickslot(opts = {}) { return (_performed = offHandQuickslotNow(opts)); }
function offHandQuickslotNow({ entity = null, say = null, toggleLight = null, switchHand = null } = {}) {
  const kind = quickslotView(entity).off.kind;
  if (kind === 'swap') return { kind: 'swap' };
  const carries = !!entity?.lightSource || packOf(entity).some(isLightSource);
  const light = kind === 'torch' || (kind === 'empty' && carries);
  if (!light) {
    if (typeof switchHand !== 'function') { say?.(QUICKSLOT_TEXT.noLight); return { kind: 'none' }; }
    return switchHand() === true ? { kind: 'hand' } : { kind: 'refused' };
  }
  if (typeof toggleLight !== 'function') return { kind: 'none' };
  return toggleLight() === true ? { kind: 'light', lit: !!entity?.lightSource } : { kind: 'refused' };
}

const bookOf = (entity) => (Array.isArray(entity?.spells) ? entity.spells : []);
const keyedSpell = (sp) => !!sp && typeof sp === 'object' && Number.isFinite(sp.index);
const freeReady = (sp) => ({ free: sp?.tag === LYCANTHROPY_SPELL_TAG });

export const spellQuickslot = () => (spellState ? { ...spellState } : null);

export function setSpellQuickslot(sp) {
  if (!keyedSpell(sp)) return false;
  spellState = { index: sp.index, name: String(sp.name ?? '') };
  return true;
}

export function clearSpellQuickslot() { spellState = null; }

export function resolveSpellQuickslot(entity) {
  if (!spellState) return null;
  const spell = bookOf(entity).find((sp) => sp?.index === spellState.index) ?? null;
  return { index: spellState.index, name: shownSpellName(spell) || shownSpellName(spellState), spell };
}

export function spellQuickslotPress(opts = {}) { return (_performed = spellQuickslotPressNow(opts)); }
function spellQuickslotPressNow({ entity = null, magic = null, say = null } = {}) {
  let r = resolveSpellQuickslot(entity);
  if (!r) {
    const first = bookOf(entity).find(keyedSpell) ?? null;
    if (!first) { say?.(QUICKSLOT_TEXT.noSpells); return { kind: 'none' }; }
    setSpellQuickslot(first);
    r = resolveSpellQuickslot(entity);
  }
  if (!r.spell) { say?.(QUICKSLOT_TEXT.spellGone(r.name)); return { kind: 'gone', name: r.name }; }
  // A hotbar press casts rather than readies: the spell fires through the attack-click path with the live aim.
  if (hotbarCasting) {
    const took = magic?.readiedIndex?.() === r.index ? true : magic?.readySpell?.(r.spell, freeReady(r.spell));
    const armed = magic?.readiedIndex?.() === r.index;
    const fired = armed && magic?.interceptAttack?.(true, CAST_PRESS) === true;
    return { kind: fired ? 'cast' : took === false ? 'refused' : 'pressed', name: r.name, readied: armed };
  }
  if (magic?.readiedIndex?.() === r.index) {
    const put = magic.abortReadySpell?.() === true;
    if (put) say?.(QUICKSLOT_TEXT.unreadied(r.name));
    return { kind: put ? 'unreadied' : 'pressed', name: r.name, readied: !put };
  }
  magic?.readySpell?.(r.spell, freeReady(r.spell));
  return { kind: 'pressed', name: r.name, readied: magic?.readiedIndex?.() === r.index };
}

export function consumableCandidates(entity, slot) {
  const taken = CONSUMABLE_SLOTS.filter((s) => s !== slot).map((s) => state[s]?.key).filter((k) => k != null);
  const out = [];
  const seen = new Set();
  for (const it of packOf(entity)) {
    if (!isQuickConsumable(it)) continue;
    const key = quickslotKey(it);
    if (key == null || seen.has(key) || taken.includes(key)) continue;
    seen.add(key);
    out.push({ key, name: itemLongName(it), item: it });
  }
  return out;
}

// One entry per spell index, since some sources push a duplicate record into the book.
export const spellCandidates = (entity) => {
  const seen = new Set();
  return bookOf(entity).filter((sp) => keyedSpell(sp) && !seen.has(sp.index) && (seen.add(sp.index), true));
};

export const CYCLE_SLOTS = Object.freeze(['c1', 'c2', 'spell']);

export const QUICK_CYCLE_LINGER_MS = 1200;
let cycling = null;

export const quickslotCycling = () => (cycling ? cycling.slot : null);

export function cycleQuickslot(slot, { entity = null, dir = 1 } = {}) {
  const step = dir < 0 ? -1 : 1;
  if (slot === 'spell') {
    const list = spellCandidates(entity);
    if (!list.length) return null;
    const at = spellState ? list.findIndex((sp) => sp.index === spellState.index) : -1;
    const next = at < 0 ? (step > 0 ? 0 : list.length - 1) : (at + step + list.length) % list.length;
    setSpellQuickslot(list[next]);
    cycling = { slot, ms: QUICK_CYCLE_LINGER_MS };
    return { slot, index: list[next].index, name: shownSpellName(list[next]), spell: list[next] };
  }
  if (!CONSUMABLE_SLOTS.includes(slot)) throw new Error(`quickslots: ${slot} does not cycle`);
  const list = consumableCandidates(entity, slot);
  if (!list.length) return null;
  const at = state[slot] ? list.findIndex((c) => c.key === state[slot].key) : -1;
  const next = at < 0 ? (step > 0 ? 0 : list.length - 1) : (at + step + list.length) % list.length;
  state[slot] = { key: list[next].key, name: list[next].name };
  cycling = { slot, ms: QUICK_CYCLE_LINGER_MS };
  return { slot, key: list[next].key, name: list[next].name, item: list[next].item };
}

export const QUICK_HOLD_MS = 350;
export const QUICK_STEP_MS = 300;
const QUICK_TICK_MAX_MS = 250;
export const QUICK_GAP_MS = 1000;
let lastTickAt = 0;

export const CYCLE_ACTIONS = Object.freeze({ c1: 'QuickUse1', c2: 'QuickUse2', spell: 'QuickSpell' });

const holds = new Map();

export function resetQuickslotHolds() { holds.clear(); cycling = null; lastTickAt = 0; }

const disarm = () => ({ down: true, ms: 0, next: Infinity, cycled: true, disarmed: true });

export function tickQuickslotHold(dt, { isHeld = null, entity = null, onTap = null, onCycle = null, blocked = false } = {}) {
  const ms = Math.min(QUICK_TICK_MAX_MS, Math.max(0, (Number(dt) || 0) * 1000));
  if (cycling) { cycling.ms -= ms; if (cycling.ms <= 0) cycling = null; }
  const at = Date.now();
  const gap = lastTickAt ? at - lastTickAt : 0;
  lastTickAt = at;
  // A blocked frame or a long gap between frames disarms every hold instead of forgetting it.
  // A key held across an overlay or a background tab must come up and go down again before it acts.
  if (blocked || gap > QUICK_GAP_MS || typeof isHeld !== 'function' || hotbarInForce()) {
    for (const slot of CYCLE_SLOTS) holds.set(slot, disarm());
    return;
  }
  for (const slot of CYCLE_SLOTS) {
    const st = holds.get(slot) ?? { down: false, ms: 0, next: QUICK_HOLD_MS, cycled: false };
    const down = isHeld(CYCLE_ACTIONS[slot]) === true;
    if (down && !st.down) { st.down = true; st.ms = 0; st.next = QUICK_HOLD_MS; st.cycled = false; st.disarmed = false; }
    else if (down) {
      st.ms += ms;
      while (st.ms >= st.next) {
        st.next += QUICK_STEP_MS;
        st.cycled = true;
        onCycle?.(slot, cycleQuickslot(slot, { entity }));
      }
    } else if (st.down) {
      st.down = false;
      if (!st.cycled) onTap?.(slot);
      else if (!st.disarmed) cycling = { slot, ms: QUICK_CYCLE_LINGER_MS };
    }
    holds.set(slot, st);
  }
}

export function quickslotSaveData() {
  const out = {};
  for (const s of QUICKSLOTS) out[s] = state[s] ? { key: state[s].key, name: state[s].name } : null;
  out.spell = spellState ? { index: spellState.index, name: spellState.name } : null;
  out.hotbar = hotbar.map((e) => (e ? { ...e } : null));
  if (out.hotbar.slice(HOTBAR_SIZE).every((e) => !e)) out.hotbar.length = HOTBAR_SIZE;
  if (hotbarPresetAt !== 0 || hotbarPresets.some((p) => p)) {
    out.hotbarPreset = hotbarPresetAt;
    out.hotbarPresets = hotbarPresets.map((p) => (p ? p.map((e) => (e ? { ...e } : null)) : null));
  }
  return out;
}

export function restoreQuickslotSaveData(data) {
  clearQuickslots();
  if (!data || typeof data !== 'object') return;
  for (const s of QUICKSLOTS) {
    const e = data[s];
    if (e && typeof e.key === 'string' && !retiredItemKey(e.key) && !hookItemKey(e.key) && typeof e.name === 'string') state[s] = { key: e.key, name: e.name };
  }
  const sp = data.spell;
  if (sp && Number.isFinite(sp.index) && typeof sp.name === 'string') spellState = { index: sp.index, name: sp.name };
  if (Array.isArray(data.hotbar)) {
    data.hotbar.slice(0, HOTBAR_CAPACITY).forEach((e, i) => { hotbar[i] = savedHotbarEntry(e); });
  }
  if (Number.isInteger(data.hotbarPreset) && data.hotbarPreset >= 0 && data.hotbarPreset < HOTBAR_PRESETS) hotbarPresetAt = data.hotbarPreset;
  if (Array.isArray(data.hotbarPresets)) {
    data.hotbarPresets.slice(0, HOTBAR_PRESETS).forEach((p, k) => {
      if (k === hotbarPresetAt || !Array.isArray(p)) return;
      hotbarPresets[k] = p.slice(0, HOTBAR_CAPACITY).map(savedHotbarEntry);
    });
  }
  hotbarRev++;
}

// Slots 1 to 10 are the keyboard bar; slots 11 to 16 exist only on the gamepad crossbar.
export const HOTBAR_SIZE = 10;
export const HOTBAR_CAPACITY = 16;
const hotbar = new Array(HOTBAR_CAPACITY).fill(null);
let hotbarRev = 0;

function savedHotbarEntry(e) {
  if (!e || typeof e !== 'object' || typeof e.name !== 'string') return null;
  if (e.type === 'ability') return hotbarEntryForAbility(e.id);
  if (e.type === 'weapon-rank' || e.type === 'hand-ability') return hotbarEntryForWeaponRank(e.rank);
  if (e.type === 'spell' && Number.isFinite(e.index)) return { type: 'spell', index: e.index, name: e.name, ...iconOf(e) };
  if (e.type === 'item' && typeof e.key === 'string' && !retiredItemKey(e.key) && !hookItemKey(e.key) && HOTBAR_KINDS.includes(e.kind)) {
    if (OLD_BOOK_KEY.test(e.key)) _oldBookKeys = true;
    return { type: 'item', kind: e.kind, key: e.key, name: e.name };
  }
  return null;
}

export const HOTBAR_PRESETS = 4;
const hotbarPresets = new Array(HOTBAR_PRESETS).fill(null);
let hotbarPresetAt = 0;
export const hotbarPreset = () => hotbarPresetAt;
export function switchHotbarPreset(to = (hotbarPresetAt + 1) % HOTBAR_PRESETS) {
  if (!Number.isInteger(to) || to < 0 || to >= HOTBAR_PRESETS || to === hotbarPresetAt) return false;
  hotbarPresets[hotbarPresetAt] = hotbar.map((e) => (e ? { ...e } : null));
  const next = hotbarPresets[to];
  hotbar.fill(null);
  if (next) next.forEach((e, i) => { if (i < HOTBAR_CAPACITY) hotbar[i] = e ? { ...e } : null; });
  hotbarPresets[to] = null;
  hotbarPresetAt = to;
  hotbarRev++;
  return true;
}

export function hotbarPressInSet(k, i, opts = {}) {
  assertHot(i);
  if (!Number.isInteger(k) || k < 0 || k >= HOTBAR_PRESETS || k === hotbarPresetAt) return hotbarPress(i, opts);
  const lent = hotbarPresets[k]?.[i] ?? null;
  const keep = hotbar[i];
  hotbar[i] = lent ? { ...lent } : null;
  try { return hotbarPress(i, opts); } finally { hotbar[i] = keep; }
}

export const HOTBAR_TEXT = Object.freeze({
  emptySlot: 'That hotbar slot is empty.',
  offHandFull: 'Your off hand is full.',
  added: (name, n) => `${name} is on hotbar slot ${n}.`,
  removed: (name) => `${name} is off the hotbar.`,
  full: 'The hotbar is full. Drag onto a slot to replace what is there.',
  shieldOn: (name) => `You strap on your ${name}.`,
  shieldOff: (name) => `You take off your ${name}.`,
  shieldBroken: (name) => `Your ${name} is broken.`,
  shieldForbidden: (name) => `You cannot use your ${name}.`,
  shieldGone: (name) => `You have no ${name}.`,
  lightGone: (name) => `You have no ${name}.`,
  wearOn: (name) => `You put on your ${name}.`,
  wearOff: (name) => `You take off your ${name}.`,
  wearBroken: (name) => `Your ${name} is broken.`,
  wearForbidden: (name) => `You cannot wear your ${name}.`,
  wearGone: (name) => `You have no ${name}.`,
});

export const HOTBAR_KINDS = Object.freeze(['consumable', 'weapon', 'light', 'shield', 'wear', 'use']);

export function hotbarKindOf(item) {
  if (!item || typeof item !== 'object') return null;
  // The order matters: a lit torch that is also equippable must read as a light.
  if (isQuickConsumable(item)) return 'consumable';
  if (isLightSource(item)) return 'light';
  if (isShieldItem(item)) return 'shield';
  // The hook is thrown on its own key, never from the bar.
  if (isGrappleItem(item)) return null;
  if (item.group === 'Weapons' && item.templateIndex !== ARROW) return 'weapon';
  if (getEquipSlot({}, item) !== EQUIP_SLOTS.None) return castsWhenUsed(item) && !wornForMore(item) ? 'use' : 'wear';
  return 'use';
}

const castsWhenUsed = (item) => Array.isArray(item?.enchantments) && item.enchantments.some((e) => e?.type === ENCHANTMENT_TYPES.CastWhenUsed);
const ENCHANTMENT_NAME = Object.freeze(Object.fromEntries(Object.entries(ENCHANTMENT_TYPES).map(([name, type]) => [type, name])));
// Feather Weight works wherever the piece lies, so it does not make wearing the piece worthwhile.
const wornForMore = (item) => item?.group === 'Armor'
  || (Array.isArray(item?.enchantments) && item.enchantments.some((e) => e?.type !== ENCHANTMENT_TYPES.CastWhenUsed && e?.type !== ENCHANTMENT_TYPES.FeatherWeight && isPower(ENCHANTMENT_NAME[e?.type])));

const isShieldItem = (item) => item?.group === 'Armor' && isShieldTemplate(item?.templateIndex);

export function hotbarEntryForItem(item) {
  const kind = hotbarKindOf(item);
  if (!kind) return null;
  return { type: 'item', kind, key: quickslotKey(item), name: itemLongName(item) };
}

const iconOf = (sp) => (Number.isInteger(sp?.icon) && sp.icon >= 0 && sp.icon <= 255 ? { icon: sp.icon } : {});

export function hotbarEntryForSpell(sp) {
  if (!keyedSpell(sp)) return null;
  return { type: 'spell', index: sp.index, name: String(sp.name ?? ''), ...iconOf(sp) };
}

export function hotbarEntryForAbility(id) {
  const ability = abilityById(id);
  return ability ? { type: 'ability', id, name: ability.name } : null;
}

export function hotbarEntryForWeaponRank(rank) {
  if (![25, 50, 75, 100].includes(rank)) return null;
  return { type: 'weapon-rank', rank, key: 'weapon-rank:' + rank,
    name: rank === 100 ? 'Weapon Capstone' : 'Weapon Rank ' + rank };
}

function activeRankAbility(entity, entry) {
  if (!entity) return null;
  const active = activeAbilityWeapon(entity);
  const item = active === undefined ? equipTableOf(entity)[EQUIP_SLOTS.RightHand] : active;
  if (item && (item.group !== 'Weapons' || isBrokenItem(item))) return null;
  const template = item?.templateIndex ?? 'bare';
  return ABILITIES.find(ability => ability.category === 'weapon' && ability.rank === entry.rank
    && ability.templates.includes(template)) ?? null;
}

const sameEntry = (a, b) => !!a && !!b && a.type === b.type
  && (a.type === 'spell' ? a.index === b.index : a.type === 'ability' ? a.id === b.id : a.key === b.key);

const assertHot = (i) => { if (!Number.isInteger(i) || i < 0 || i >= HOTBAR_CAPACITY) throw new Error(`hotbar: no slot ${i}`); };

export const hotbarEntry = (i) => (assertHot(i), hotbar[i] ? { ...hotbar[i] } : null);
export const hotbarRevision = () => hotbarRev;

export function setHotbarSlot(i, entry) {
  assertHot(i);
  const record = savedHotbarEntry(entry);
  if (!record) return false;
  for (let j = 0; j < HOTBAR_CAPACITY; j++) if (j !== i && sameEntry(hotbar[j], record)) hotbar[j] = null;
  hotbar[i] = record;
  hotbarRev++;
  return true;
}

export function clearHotbarSlot(i) { assertHot(i); if (hotbar[i]) { hotbar[i] = null; hotbarRev++; } }
export function clearHotbar() { hotbar.fill(null); hotbarRev++; _oldBookKeys = false; }

export function swapHotbarSlots(a, b) {
  assertHot(a); assertHot(b);
  if (a === b) return;
  [hotbar[a], hotbar[b]] = [hotbar[b], hotbar[a]];
  hotbarRev++;
}

export function hotbarSlotOf(thing, { spell = false } = {}) {
  const probe = spell ? hotbarEntryForSpell(thing) : hotbarEntryForItem(thing);
  if (!probe) return -1;
  return hotbar.findIndex((e) => sameEntry(e, probe));
}

export const firstFreeHotbarSlot = (size = HOTBAR_SIZE) => { const i = hotbar.findIndex((e) => !e); return i >= 0 && i < size ? i : -1; };

// Books slotted before keys carried their text have bare keys; they are rekeyed once by title against the pack.
const OLD_BOOK_KEY = new RegExp(`^[^|]*\\|${BOOK_TEMPLATE}\\|{7}$`);
let _oldBookKeys = false;
function rekeyOldBooks(entity) {
  const pack = packOf(entity);
  if (!pack.length) return;
  _oldBookKeys = false;
  for (const e of hotbar) {
    if (e?.type !== 'item' || !OLD_BOOK_KEY.test(e.key)) continue;
    const it = pack.find((x) => x?.templateIndex === BOOK_TEMPLATE && itemLongName(x) === e.name && quickslotKey({ ...x, message: undefined }) === e.key);
    if (it) { e.key = quickslotKey(it); hotbarRev++; }
  }
}

export function hotbarView(entity, { readiedIndex = null, size = HOTBAR_CAPACITY } = {}) {
  if (_oldBookKeys) rekeyOldBooks(entity);
  const pack = packOf(entity);
  const book = bookOf(entity);
  const lit = entity?.lightSource ?? null;
  const want = new Set();
  for (const e of hotbar) if (e?.type === 'item') want.add(e.key);
  // Keys each pack record once per view, since keys for enchanted records are not cached.
  const byKey = new Map();
  if (want.size) {
    for (const it of pack) {
      const k = quickslotKey(it);
      if (!want.has(k)) continue;
      let b = byKey.get(k);
      if (!b) byKey.set(k, b = { item: it, count: 0, held: null });
      b.count += Math.max(0, it.stackCount ?? 1);
      if (!b.held && (isEquipped(it) || it === lit)) b.held = it;
    }
  }
  return hotbar.slice(0, size).map((e, i) => {
    if (!e) return { slot: i, empty: true };
    if (e.type === 'weapon-rank') {
      const ability = activeRankAbility(entity, e);
      const cooldown = ability ? Math.ceil(abilityCooldown(entity, ability.id) / 1000) : 0;
      return { slot: i, type: 'ability', id: ability?.id, name: ability?.name ?? e.name,
        rank: e.rank,
        count: cooldown || null, ghost: !ability || !abilitiesEnabled() || !learnedAbility(entity, ability.id) || cooldown > 0 };
    }
    if (e.type === 'ability') {
      const ability = abilityById(e.id);
      const cooldown = Math.ceil(abilityCooldown(entity, e.id) / 1000);
      const usable = abilitiesEnabled() && (abilityPlayable(e.id) || utilityProfile(e.id)) && learnedAbility(entity, e.id) && abilityInHand(entity, ability?.templates, e.id);
      return { slot: i, type: 'ability', id: e.id, name: e.name, count: cooldown || null, ghost: !usable || cooldown > 0 };
    }
    if (e.type === 'spell') {
      const spell = book.find((sp) => sp?.index === e.index) ?? null;
      return { slot: i, type: 'spell', name: shownSpellName(spell) || shownSpellName(e), index: e.index, spell,
        element: spell?.element ?? null, rangeType: spell?.rangeType ?? null,
        icon: spell?.noIcon ? null : iconOf(spell).icon ?? e.icon ?? null,
        noIcon: !!spell?.noIcon,
        ghost: !spell, active: readiedIndex != null && readiedIndex === e.index };
    }
    const b = byKey.get(e.key);
    let item = b?.item ?? null; let count = b?.count ?? 0; let held = b?.held ?? null;
    // A lit light can live on the entity alone, outside the pack array.
    if (!held && lit && quickslotKey(lit) === e.key) { held = lit; item ??= lit; count = Math.max(count, 1); }
    const shown = held ?? item;
    return { slot: i, type: 'item', kind: e.kind, name: shown ? itemLongName(shown) : e.name, key: e.key,
      item: shown, count: e.kind === 'consumable' ? count : (count > 1 ? count : null),
      condition: shown && showsWear(e.kind, shown) ? conditionPercentage(shown) : null,
      ghost: !shown, active: !!held };
  });
}

const showsWear = (kind, item) => !isAmmunition(item) && (kind === 'weapon' || kind === 'shield' || (kind === 'light' && item.templateIndex !== TEMPLATES.Lantern)
  || item.group === 'Armor' || isEnchanted(item));

let hotbarCasting = false;
// The hotbar reaches the host performers by pointing a diamond slot at its entry for one call. The finally
// restores it, so a throwing door never leaves the diamond pointing at the hotbar entry.
function withQuickslotOverride(slot, entry, fn) {
  const saved = slot === 'spell' ? spellState : state[slot];
  const savedCycle = cycling;
  if (slot === 'spell') spellState = entry;
  else state[slot] = entry;
  try { return fn(); } finally {
    if (slot === 'spell') spellState = saved;
    else state[slot] = saved;
    cycling = savedCycle;
  }
}

export function hotbarReady(entity, i) {
  const v = hotbarView(entity)[i];
  return !!v && !v.empty && !v.ghost;
}

export function hotbarPress(i, { entity = null, doors = {}, say = null } = {}) {
  assertHot(i);
  if (_oldBookKeys) rekeyOldBooks(entity);
  const e = hotbar[i];
  if (!e) { say?.(HOTBAR_TEXT.emptySlot); return { kind: 'empty' }; }
  if (e.type === 'weapon-rank') {
    const ability = activeRankAbility(entity, e);
    const result = ability && learnedAbility(entity, ability.id)
      ? requestHotbarAbility(entity, ability.id) : { ok: false, why: 'unavailable' };
    if (!result.ok) say?.(result.message ?? abilityRefusalText(result.why));
    return { kind: result.ok ? 'ability' : 'refused', name: ability?.name ?? e.name };
  }
  if (e.type === 'ability') {
    const result = utilityProfile(e.id) ? requestUtility(entity, e.id) : requestHotbarAbility(entity, e.id);
    if (!result.ok) say?.(result.message ?? abilityRefusalText(result.why));
    return { kind: result.ok ? 'ability' : 'refused', name: e.name };
  }
  const through = (slot, entry, door, done) => {
    _performed = null;
    withQuickslotOverride(slot, entry, door);
    const r = _performed; _performed = null;
    return r && !performedOk(r) ? { kind: 'refused', name: e.name, by: r.kind } : { kind: done, name: e.name };
  };
  if (e.type === 'spell') {
    if (typeof doors.quickSpell !== 'function') return { kind: 'none' };
    hotbarCasting = true;
    try { return through('spell', { index: e.index, name: e.name }, () => doors.quickSpell(), 'spell'); }
    finally { hotbarCasting = false; }
  }
  if (e.kind === 'consumable') {
    if (typeof doors.quickUse !== 'function') return { kind: 'none' };
    return through('c1', { key: e.key, name: e.name }, () => doors.quickUse(1), 'used');
  }
  if (e.kind === 'weapon') {
    if (typeof doors.quickSwap !== 'function') return { kind: 'none' };
    return through('swap', { key: e.key, name: e.name }, () => doors.quickSwap(), 'equipped');
  }
  const worn = e.kind === 'wear' ? hotbarView(entity)[i]?.item : null;
  if (castsWhenUsed(worn) && (!wornForMore(worn) || isEquipped(worn)) && typeof doors.quickUse === 'function') return through('c1', { key: e.key, name: e.name }, () => doors.quickUse(1), 'used');
  if (e.kind === 'shield' || e.kind === 'wear') return (_performed = hotbarWear(entity, e, say));
  if (e.kind === 'use') {
    if (typeof doors.quickUse !== 'function') return { kind: 'none' };
    return through('c1', { key: e.key, name: e.name }, () => doors.quickUse(1), 'used');
  }
  if (typeof doors.quickUse !== 'function') return { kind: 'none' };
  const view = quickslotView(entity);
  const atWaist = lanternAtWaist(hotbarView(entity)[i]?.item);
  if (view.off.kind === 'weapon' && !atWaist) { say?.(HOTBAR_TEXT.offHandFull); return { kind: 'refused' }; }
  if (view.off.kind === 'shield' && !atWaist) {
    const shield = view.off.item;
    if (hotbarView(entity)[i]?.ghost) { say?.(HOTBAR_TEXT.lightGone(e.name)); return { kind: 'refused', name: e.name }; }
    const snap = equipDelaySnapshot(entity);
    const before = entity?.equipCountdown ?? 0;
    if (!shield || oneEquipAct(() => unequipSlot(entity, EQUIP_SLOTS.LeftHand)) === null) { say?.(HOTBAR_TEXT.offHandFull); return { kind: 'refused' }; }
    billEquipDelayOnClose(entity, snap);
    const lit = entity?.lightSource ?? null;
    // Taking the shield off can make the torch mod raise this light itself, and a toggle now would put it out.
    if (lit && quickslotKey(lit) === e.key) return { kind: 'light', name: e.name };
    const r = through('c1', { key: e.key, name: e.name }, () => doors.quickUse(1), 'light');
    if (r.kind === 'refused' && !isEquipped(shield)) {
      oneEquipAct(() => equipItem(entity, shield));
      if (entity) entity.equipCountdown = before;
    }
    return r;
  }
  return through('c1', { key: e.key, name: e.name }, () => doors.quickUse(1), 'light');
}

function hotbarWear(entity, e, say) {
  const sup = racialSuppressInventory(entity);
  if (sup) { say?.(sup.text); return { kind: 'refused' }; }
  const shieldSlot = e.kind === 'shield';
  const pack = packOf(entity);
  const mine = pack.filter((it) => quickslotKey(it) === e.key);
  const worn = mine.find(isEquipped) ?? null;
  const snap = equipDelaySnapshot(entity);
  if (worn) {
    const slot = worn.equipSlot ?? (shieldSlot ? EQUIP_SLOTS.LeftHand : null);
    if (slot == null || oneEquipAct(() => unequipSlot(entity, slot)) === null) return { kind: 'refused' };
    billEquipDelayOnClose(entity, snap);
    say?.((shieldSlot ? HOTBAR_TEXT.shieldOff : HOTBAR_TEXT.wearOff)(itemLongName(worn)));
    return { kind: 'unequipped', name: e.name };
  }
  const piece = mine.find((it) => !isBrokenItem(it)) ?? mine[0] ?? null;
  if (!piece) { say?.((shieldSlot ? HOTBAR_TEXT.shieldGone : HOTBAR_TEXT.wearGone)(e.name)); return { kind: 'gone' }; }
  if (isBrokenItem(piece)) { say?.((shieldSlot ? HOTBAR_TEXT.shieldBroken : HOTBAR_TEXT.wearBroken)(itemLongName(piece))); return { kind: 'refused' }; }
  if (isForbiddenEquip(entity?.career, piece)) { say?.((shieldSlot ? HOTBAR_TEXT.shieldForbidden : HOTBAR_TEXT.wearForbidden)(itemLongName(piece))); return { kind: 'refused' }; }
  const got = oneEquipAct(() => equipItem(entity, piece));
  if (got === null) return { kind: 'refused' };
  billEquipDelayOnClose(entity, snap);
  say?.((shieldSlot ? HOTBAR_TEXT.shieldOn : HOTBAR_TEXT.wearOn)(itemLongName(piece)));
  return { kind: 'equipped', name: e.name };
}

export const hotbarCastingNow = () => hotbarCasting;
