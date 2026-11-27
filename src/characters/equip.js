import { mintCondition, templateByIndex } from '../items/itemTemplates.js';
import { repoolWeapon } from '../items/conditionRepair.js';
import { EQUIP_SLOTS } from './paperdoll.js';
import { ITEM_GROUPS, SLOT_RULES } from './equipRules.js';
import { customItemClass, rriNativeMaterialValue, rriEquipSound } from '../mods/rriItems.js';
import { SOUND } from '../audio/soundClips.js';
import { createEquipTable, getItemHands as handsOf, ITEM_HANDS } from './equipTable.js';
import { BODY_PARTS, NUMBER_BODY_PARTS, materialArmorValue, itemArmorValue, SHIELD_VALUES, SHIELD_PARTS, isShieldTemplate } from '../items/armorMaterials.js';
import { weaponSkillUsed, WEAPONS } from './weapons.js';
import { SKILLS, WEAPON_SKILL } from './skills.js';
import { EQUIP_DELAY_TIMES } from './weaponStates.js';
import { startingProvisions } from '../systems/survival/items.js';
import { survivalOn } from '../systems/survival/switch.js';
import { localizedText } from '../ui/textManager.js';
import { ARMOR_BITS_SHIFT } from './specialAdvantages.js';
import { isCrossbowItem, CROSSBOW_EQUIP_DELAY } from './crossbowIds.js';
import { isBallistaItem, BALLISTA_EQUIP_DELAY } from './heavyGearIds.js';

export { EQUIP_SLOTS, ITEM_HANDS };

const numeric = (item) => (typeof item.group === 'string' ? { ...item, group: ITEM_GROUPS[item.group] ?? ITEM_GROUPS.None } : item);
export const getItemHands = (item) => handsOf(numeric(item));

export const equipOf = (entity) => (entity.equip ??= createEquipTable());
export const equipTableOf = (entity) => equipOf(entity).slots;

export const getEquipSlot = (entity, item) => equipOf(entity).getEquipSlot(numeric(item));
export const wearableItem = (item) => !!item && createEquipTable().getEquipSlot(numeric(item)) !== EQUIP_SLOTS.None;

export function equipDelayFor(item) {
  if (isCrossbowItem(item)) return CROSSBOW_EQUIP_DELAY;
  if (isBallistaItem(item)) return BALLISTA_EQUIP_DELAY;

  const gi = customItemClass(item?.templateIndex)?.groupIndex
    ?? (item?.group === 'Weapons' ? item.templateIndex - 113
      : item?.group === 'Armor' ? item.templateIndex - 102 : -1);
  return (gi >= 0 && gi < EQUIP_DELAY_TIMES.length) ? EQUIP_DELAY_TIMES[gi] : 0;
}

export function equipDelaySnapshot(entity) {
  const slots = equipTableOf(entity);
  return { right: slots[EQUIP_SLOTS.RightHand] ?? null, left: slots[EQUIP_SLOTS.LeftHand] ?? null };
}

export function billEquipDelayOnClose(entity, snap) {
  if (!snap) return { delay: 0, equipping: [] };
  const slots = equipTableOf(entity);
  const current = { right: slots[EQUIP_SLOTS.RightHand] ?? null, left: slots[EQUIP_SLOTS.LeftHand] ?? null };
  let delay = 0;
  const equipping = [];
  for (const hand of ['right', 'left']) {
    if (snap[hand] !== current[hand]) {
      if (snap[hand]) delay += equipDelayFor(snap[hand]);
      if (current[hand]) delay += equipDelayFor(current[hand]);
      if (current[hand]) equipping.push(current[hand]);
    }
  }
  if (delay > 0) entity.equipCountdown = (entity.equipCountdown ?? 0) + delay;
  return { delay, equipping: delay > 0 ? equipping : [] };
}

export function unequipSlot(entity, slot) {
  const slots = equipTableOf(entity);
  const item = slots[slot];
  if (!item) return null;
  slots[slot] = null;
  delete item.equipSlot;
  updateEquippedArmorValues(entity, item, false);
  equipChanged(entity);
  _hooks.onItemUnequipped?.(entity, item);
  return item;
}

export function unequipItem(entity, item) {
  if (!entity || !item) return;
  const slots = equipTableOf(entity);
  for (let slot = 0; slot < slots.length; slot++) {
    if (slots[slot] === item) unequipSlot(entity, slot);
  }
}

export function isForbiddenEquip(career, item) {
  if (!career || !item) return false;
  const forbiddenArmors = (career.weaponArmorShieldsBitfield >>> ARMOR_BITS_SHIFT) & 0x07;
  const forbiddenShields = (career.weaponArmorShieldsBitfield >>> 9) & 0x0f;
  const forbiddenProficiencies = career.weaponArmorShieldsBitfield & 0x3f;
  const forbiddenMaterials = career.forbiddenMaterialsFlags ?? 0;
  if (item.group === 'Armor') {
    const shield = isShieldTemplate(item.templateIndex);
    if (shield && ((1 << (item.templateIndex - SHIELD_TEMPLATE_START)) & forbiddenShields) !== 0) return true;
    if (!shield && ((1 << (rriNativeMaterialValue(item) >> 8)) & forbiddenArmors) !== 0) return true;
    return (item.material >> 8) === 2 && ((1 << (item.material & 0xff)) & forbiddenMaterials) !== 0;
  }
  if (item.group === 'Weapons') {
    if ((weaponProficiencyFlag(item) & forbiddenProficiencies) !== 0) return true;
    return ((1 << item.material) & forbiddenMaterials) !== 0;
  }
  return false;
}

export function weaponProficiencyFlag(item) {
  const flag = PROFICIENCY_OF_SKILL[weaponSkillUsed(item?.templateIndex)];
  return flag ?? -1;
}
const PROFICIENCY_OF_SKILL = Object.freeze({
  [SKILLS.ShortBlade]: 1, [SKILLS.LongBlade]: 2, [SKILLS.HandToHand]: 4,
  [SKILLS.Axe]: 8, [SKILLS.BluntWeapon]: 16, [SKILLS.Archery]: 32,
});
const SHIELD_TEMPLATE_START = 109;

export const FORBIDDEN_EQUIPMENT_TEXT_ID = 1068;
export const ITEM_BROKEN_TEXT_ID = 29;
export const isBrokenItem = (item) => item?.currentCondition != null && item.currentCondition < 1;

export function equipItem(entity, item) {
  const slots = equipTableOf(entity);
  const slot = getEquipSlot(entity, item);
  if (slot === EQUIP_SLOTS.None) return null;
  if (item.group === 'Weapons' && item.templateIndex === WEAPONS.Arrow) return null;
  if ((item.stackCount ?? 1) > 1) {
    item.stackCount--;
    item = { ...item, stackCount: 1 };
    entity.items.push(item);
  }
  const unequipped = [];
  oneEquipAct(() => {
    for (const s of wearLeavers(entity, item, slot)) {
      const it = unequipSlot(entity, s); if (it) unequipped.push(it);
    }
    item.equipSlot = slot;
    slots[slot] = item;
    updateEquippedArmorValues(entity, item, true);
    equipChanged(entity);
  });
  { const clip = getEquipSound(item); if (clip != null) _equipSoundSink?.(clip); }
  _hooks.onItemEquipped?.(entity, item);
  return unequipped;
}

export const isEquipped = (item) => item.equipSlot != null;

export function canSwapHands(entity) {
  const slots = equipTableOf(entity);
  const R = slots[EQUIP_SLOTS.RightHand], L = slots[EQUIP_SLOTS.LeftHand];
  if (!R && !L) return { ok: false, why: 'Your hands are empty.' };
  const may = (item, to) => {
    const h = getItemHands(numeric(item));
    return h === ITEM_HANDS.Either || (to === EQUIP_SLOTS.LeftHand ? h === ITEM_HANDS.LeftOnly : h === ITEM_HANDS.RightOnly || h === ITEM_HANDS.Both);
  };
  if (R && !may(R, EQUIP_SLOTS.LeftHand)) return { ok: false, why: `${R.name ?? 'That'} can only be held in the right hand.` };
  if (L && !may(L, EQUIP_SLOTS.RightHand)) return { ok: false, why: `${L.name ?? 'That'} can only be held in the left hand.` };
  return { ok: true };
}
export function swapHands(entity) {
  const can = canSwapHands(entity);
  if (!can.ok) return can;
  const slots = equipTableOf(entity);
  const R = slots[EQUIP_SLOTS.RightHand], L = slots[EQUIP_SLOTS.LeftHand];
  oneEquipAct(() => {
    slots[EQUIP_SLOTS.RightHand] = L ?? null;
    slots[EQUIP_SLOTS.LeftHand] = R ?? null;
    if (L) L.equipSlot = EQUIP_SLOTS.RightHand;
    if (R) R.equipSlot = EQUIP_SLOTS.LeftHand;
    equipChanged(entity);
  });
  return { ok: true };
}

export function rebuildEquipState(entity) {
  const slots = fillEquipTable(equipTableOf(entity), entity.items);
  const av = armorValuesOf(entity);
  av.fill(100);
  for (const it of slots) if (it) updateEquippedArmorValues(entity, it, true);
  for (const fn of _equipListeners) fn(entity);
  return slots;
}

export function fillEquipTable(slots, items) {
  slots.fill(null);
  for (const it of items ?? []) {
    if (it.equipSlot == null) continue;
    if (slots[it.equipSlot]) { delete it.equipSlot; continue; }
    slots[it.equipSlot] = it;
  }
  return slots;
}

export function seedStartingEquipment(entity) {
  if (entity.equip || (entity.items ?? []).length) return;
  entity.items = entity.items ?? [];
  const dagger = mintCondition({ group: 'Weapons', templateIndex: 113, name: 'Dagger', material: 0, flags: 0, minDamage: 1, maxDamage: 6 });
  entity.items.push(dagger);
  equipItem(entity, dagger);
  if (survivalOn()) for (const it of startingProvisions(entity)) entity.items.push(it);
}

export function wearLeavers(entity, item, slot = getEquipSlot(entity, item)) {
  if (!item || slot === EQUIP_SLOTS.None) return [];
  const out = [];
  if (item.group === 'Weapons' && getItemHands(item) === ITEM_HANDS.Both) out.push(EQUIP_SLOTS.LeftHand, EQUIP_SLOTS.RightHand);
  if (getItemHands(item) === ITEM_HANDS.LeftOnly) {
    const right = equipTableOf(entity)[EQUIP_SLOTS.RightHand];
    if (right && getItemHands(right) === ITEM_HANDS.Both) out.push(EQUIP_SLOTS.RightHand);
  }
  out.push(slot);
  return out;
}

export { BODY_PARTS, NUMBER_BODY_PARTS, materialArmorValue, itemArmorValue };

const armorSlotRule = (templateIndex) => { const slot = customItemClass(templateIndex)?.equipSlot; return slot ? { slot } : SLOT_RULES.Armor[templateIndex]; };
const SLOT_BODY_PART = new Map([
  [EQUIP_SLOTS.Head, BODY_PARTS.Head], [EQUIP_SLOTS.RightArm, BODY_PARTS.RightArm],
  [EQUIP_SLOTS.LeftArm, BODY_PARTS.LeftArm], [EQUIP_SLOTS.ChestArmor, BODY_PARTS.Chest],
  [EQUIP_SLOTS.Gloves, BODY_PARTS.Hands], [EQUIP_SLOTS.LegsArmor, BODY_PARTS.Legs],
  [EQUIP_SLOTS.Feet, BODY_PARTS.Feet],
]);

export const armorValuesOf = (entity) => (entity.armorValues ??= new Array(NUMBER_BODY_PARTS).fill(100));

export function armorBodyParts(item) {
  if (!item || item.group !== 'Armor') return [];
  if (isShieldTemplate(item.templateIndex)) return SHIELD_PARTS.get(item.templateIndex) ?? [];
  const rule = armorSlotRule(item.templateIndex);
  const part = rule ? SLOT_BODY_PART.get(EQUIP_SLOTS[rule.slot]) : null;
  return part == null ? [] : [part];
}

export function updateEquippedArmorValues(entity, item, equipping) {
  const FOOTWEAR = item.group === 'MensClothing' ? [147, 148, 149]
    : item.group === 'WomensClothing' ? [186, 187, 188] : null;
  if (item.group !== 'Armor' && !(FOOTWEAR && FOOTWEAR.includes(item.templateIndex))) return;
  const av = armorValuesOf(entity);
  const sign = equipping ? -1 : 1;
  if (!isShieldTemplate(item.templateIndex)) {
    const rule = armorSlotRule(item.templateIndex);
    const part = rule ? SLOT_BODY_PART.get(EQUIP_SLOTS[rule.slot])
      : (FOOTWEAR ? BODY_PARTS.Feet : null);
    if (part == null) return;
    av[part] += sign * itemArmorValue(item) * 5;
  } else {
    const bonus = SHIELD_VALUES.get(item.templateIndex);
    for (const part of SHIELD_PARTS.get(item.templateIndex)) av[part] += sign * bonus * 5;
  }
}

const BODY_PART_SLOT = new Map([...SLOT_BODY_PART].map(([slot, part]) => [part, slot]));
export const slotForBodyPart = (part) => BODY_PART_SLOT.get(part) ?? EQUIP_SLOTS.None;
export const bodyPartForSlot = (slot) => SLOT_BODY_PART.get(slot) ?? -1;

const PLURAL_BREAK_TEMPLATES = new Set([103, 104, 108]);

export const CONDITION_WEAR_SCALE = 1;
let _wearScale = CONDITION_WEAR_SCALE;
export function _wearScaleForTests(scale = CONDITION_WEAR_SCALE) { _wearScale = scale; }

export const DFU_WEAR_MULTIPLE = 1;
let _dfuMultiple = DFU_WEAR_MULTIPLE;
export function _dfuWearMultipleForTests(m = DFU_WEAR_MULTIPLE) { _dfuMultiple = m; }
export const dfuBlowWear = (amount, rolls = Math.random) => (amount > 0 ? blowWear(amount * _dfuMultiple, rolls) : amount);

export function blowWear(amount, rolls = Math.random) {
  if (!(amount > 0)) return amount;
  const x = amount * _wearScale;
  const n = Math.floor(x);
  return x > n && rolls() < x - n ? n + 1 : n;
}

export function lowerCondition(item, amount, owner = null, say = null, removeFrom = null, nameOf = null) {
  mintCondition(item);
  repoolWeapon(item);
  if ((item.maxCondition ?? 0) <= 0) return false;
  item.currentCondition -= amount;
  if (item.currentCondition > 0) return false;
  item.currentCondition = 0;
  const name = nameOf?.(item) ?? item.name ?? templateByIndex(item.templateIndex)?.name ?? 'Item';
  say?.((PLURAL_BREAK_TEMPLATES.has(item.templateIndex) ? localizedText('itemHasBrokenPlural', '%s have broken.') : localizedText('itemHasBroken', '%s has broken.')).replace('%s', name));
  if (owner) unequipItem(owner, item);
  if (owner && owner.weapon === item) owner.weapon = null;
  if (removeFrom) { const i = removeFrom.indexOf(item); if (i >= 0) removeFrom.splice(i, 1); }
  _hooks.onItemBroken?.(item, owner, say);
  return true;
}

export function getEquipSound(item) {
  switch (item?.group) {
    case 'MensClothing':
    case 'WomensClothing':
      return 381;
    case 'Jewellery':
    case 'Gems':
      return 383;
    case 'Armor': {
      const own = rriEquipSound(item);
      if (own != null && SOUND[own] != null) return SOUND[own];
      if (isShieldTemplate(item.templateIndex) || item.templateIndex === 107) return 419;
      if (item.material === 0x0000) return 417;
      if (item.material === 0x0100) return 418;
      return 419;
    }
    case 'Weapons':
      switch (item.templateIndex) {
        case 127: case 128: return 415;
        case 118: case 120: case 119: case 121: return 378;
        case 122: case 123: return 379;
        case 113: case 114: case 117: case 116: return 377;
        case 125: return 414;
        case 124: case 126: return 413;
        case 115: return 380;
        case 129: case 130: case 563: case 564: return 416;
        default: return null;
      }
    default:
      return null;
  }
}

let _equipSoundSink = null;
export function setEquipSoundSink(fn) { _equipSoundSink = fn; }

const _hooks = { onEquipChange: null, onItemBroken: null, onItemEquipped: null, onItemUnequipped: null };
export function setEnchantmentHooks({ onEquipChange = null, onItemBroken = null, onItemEquipped = null, onItemUnequipped = null } = {}) {
  _hooks.onEquipChange = onEquipChange;
  _hooks.onItemBroken = onItemBroken;
  _hooks.onItemEquipped = onItemEquipped;
  _hooks.onItemUnequipped = onItemUnequipped;
}
const _equipListeners = [];
export function addEquipChangeListener(fn) { if (typeof fn === 'function' && !_equipListeners.includes(fn)) _equipListeners.push(fn); }
function fireEquipChange(entity) {
  _hooks.onEquipChange?.(entity);
  for (const fn of _equipListeners) fn(entity);
}
let _heldTellings = null;
function equipChanged(entity) {
  if (_heldTellings) _heldTellings.add(entity);
  else fireEquipChange(entity);
}
export function oneEquipAct(fn) {
  if (_heldTellings) return fn();
  const held = _heldTellings = new Set();
  try { return fn(); } finally {
    _heldTellings = null;
    for (const entity of held) fireEquipChange(entity);
  }
}
export const notifyEquipChange = (entity) => fireEquipChange(entity);
