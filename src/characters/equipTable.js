import { EQUIP_SLOTS } from './paperdoll.js';
import { ITEM_GROUPS, SLOT_RULES, WEAPON_HANDS, SHIELD_INDICES } from './equipRules.js';
import { getBool } from '../platform/settings.js';
import { customItemClass } from '../mods/rriItems.js';
import { GRAPPLE_TEMPLATE } from './heavyGearIds.js';

export const ITEM_HANDS = Object.freeze({ None: 0, RightOnly: 1, LeftOnly: 2, Either: 3, Both: 4 });
export const BOW_HAND_TEMPLATES = Object.freeze([129, 130, 563, 564]);
const GROUP_NAME = { [ITEM_GROUPS.Armor]: 'Armor', [ITEM_GROUPS.Jewellery]: 'Jewellery', [ITEM_GROUPS.MensClothing]: 'MensClothing', [ITEM_GROUPS.WomensClothing]: 'WomensClothing' };

export function getItemHands(item, { bowLeftHand = getBool('Enhancements', 'BowLeftHandWithSwitching') } = {}) {
  const group = typeof item.group === 'string' ? (ITEM_GROUPS[item.group] ?? ITEM_GROUPS.None) : item.group;
  if (group !== ITEM_GROUPS.Weapons && group !== ITEM_GROUPS.Armor) {
    return ITEM_HANDS.None;
  }
  if (group === ITEM_GROUPS.Weapons && BOW_HAND_TEMPLATES.includes(item.templateIndex)) {
    return bowLeftHand ? ITEM_HANDS.LeftOnly : ITEM_HANDS.Both;
  }
  const cls = customItemClass(item.templateIndex);
  if (cls?.itemHands) return ITEM_HANDS[cls.itemHands];
  const w = WEAPON_HANDS[item.templateIndex];
  if (w) return ITEM_HANDS[w];
  if (SHIELD_INDICES.includes(item.templateIndex)) return ITEM_HANDS.LeftOnly;
  return ITEM_HANDS.None;
}

export function createEquipTable() {
  const slots = new Array(27).fill(null);

  const isSlotOpen = (slot) => slot !== EQUIP_SLOTS.None && slots[slot] === null;
  const getFirstSlot = (a, b) => (isSlotOpen(a) ? a : isSlotOpen(b) ? b : a);

  const resolveRule = (rule) => {
    if (!rule) return EQUIP_SLOTS.None;
    if (rule.slot) return EQUIP_SLOTS[rule.slot];
    return getFirstSlot(EQUIP_SLOTS[rule.pair[0]], EQUIP_SLOTS[rule.pair[1]]);
  };

  const getEquipSlot = (item) => {
    const cls = item.group === ITEM_GROUPS.Armor ? customItemClass(item.templateIndex) : null;
    if (cls?.equipSlot) return EQUIP_SLOTS[cls.equipSlot];
    switch (item.group) {
      case ITEM_GROUPS.Gems:
        return getFirstSlot(EQUIP_SLOTS.Crystal0, EQUIP_SLOTS.Crystal1);
      case ITEM_GROUPS.Jewellery:
      case ITEM_GROUPS.Armor:
      case ITEM_GROUPS.MensClothing:
      case ITEM_GROUPS.WomensClothing:
        return resolveRule(SLOT_RULES[GROUP_NAME[item.group]][item.templateIndex]);
      case ITEM_GROUPS.Weapons: {
        // The hook has no hand, but the two-hander rule below would still give it the right hand.
        if (item.templateIndex === GRAPPLE_TEMPLATE) return EQUIP_SLOTS.None;
        const right = slots[EQUIP_SLOTS.RightHand];
        if (right && getItemHands(right) === ITEM_HANDS.Both
          && getItemHands(item) !== ITEM_HANDS.LeftOnly) {
          return EQUIP_SLOTS.RightHand;
        }
        switch (getItemHands(item)) {
          case ITEM_HANDS.RightOnly:
          case ITEM_HANDS.Both:
            return EQUIP_SLOTS.RightHand;
          case ITEM_HANDS.LeftOnly:
            return EQUIP_SLOTS.LeftHand;
          case ITEM_HANDS.Either:
            return getFirstSlot(EQUIP_SLOTS.RightHand, EQUIP_SLOTS.LeftHand);
          default:
            return EQUIP_SLOTS.None;
        }
      }
      default:
        return EQUIP_SLOTS.None;
    }
  };

  return { slots, isSlotOpen, getFirstSlot, getEquipSlot };
}
