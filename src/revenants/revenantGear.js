// @ts-check

import { EQUIP_SLOTS, getItemHands, ITEM_HANDS, equipTableOf, getEquipSlot, wearableItem } from '../characters/equip.js';
import { WEAPONS } from '../characters/weapons.js';
import { equipmentVariantFor, enemyArmorValues } from '../combat/enemyEquipment.js';
import { plateMetal, SHIELD_VALUES } from '../items/armorMaterials.js';
import { rarityOf } from '../items/lootRarity.js';
import { computeEntityMods } from '../characters/entityMods.js';
import { t } from '../ui/textManager.js';
import { isClassEnemyId } from '../characters/enemyBasics.js';

export const GEAR_SLOTS = Object.freeze([
  Object.freeze({ key: 'weapon', get label() { return t('rvn.gear.slot.weapon', 'Weapon'); }, slot: EQUIP_SLOTS.RightHand }),
  Object.freeze({ key: 'shield', get label() { return t('rvn.gear.slot.shield', 'Shield'); }, slot: EQUIP_SLOTS.LeftHand }),
  Object.freeze({ key: 'head', get label() { return t('rvn.gear.slot.head', 'Helm'); }, slot: EQUIP_SLOTS.Head }),
  Object.freeze({ key: 'rightArm', get label() { return t('rvn.gear.slot.rightArm', 'Right pauldron'); }, slot: EQUIP_SLOTS.RightArm }),
  Object.freeze({ key: 'leftArm', get label() { return t('rvn.gear.slot.leftArm', 'Left pauldron'); }, slot: EQUIP_SLOTS.LeftArm }),
  Object.freeze({ key: 'body', get label() { return t('rvn.gear.slot.body', 'Cuirass'); }, slot: EQUIP_SLOTS.ChestArmor }),
  Object.freeze({ key: 'hands', get label() { return t('rvn.gear.slot.hands', 'Gauntlets'); }, slot: EQUIP_SLOTS.Gloves }),
  Object.freeze({ key: 'legs', get label() { return t('rvn.gear.slot.legs', 'Greaves'); }, slot: EQUIP_SLOTS.LegsArmor }),
  Object.freeze({ key: 'feet', get label() { return t('rvn.gear.slot.feet', 'Boots'); }, slot: EQUIP_SLOTS.Feet }),
  Object.freeze({ key: 'charm', get label() { return t('rvn.gear.slot.charm', 'Charm'); }, slot: null }),
]);
export const GEAR_KEYS = Object.freeze(GEAR_SLOTS.map((s) => s.key));
const KEY_SET = new Set(/** @type {readonly string[]} */ (GEAR_KEYS));
const KEY_OF_SLOT = new Map(GEAR_SLOTS.filter((s) => s.slot != null).map((s) => [s.slot, s.key]));
/** @type {Map<string, number|null>} */
const SLOT_OF_KEY = new Map(GEAR_SLOTS.map((s) => [s.key, s.slot]));
export const gearLabel = (key) => GEAR_SLOTS.find((s) => s.key === key)?.label ?? key;

// Caps are indexed by rank 1 to 5: METAL_CAP is the best material (Iron 0 to Daedric 9), and RARITY_CAP is the best
// tier (common 0 to legendary 3).
export const GEAR = Object.freeze({
  METAL_CAP: Object.freeze([0, 2, 4, 6, 8, 9]),
  RARITY_CAP: Object.freeze([0, 1, 2, 2, 3, 3]),
  POWER_PIECE: 0.05,
  POWER_TIER: Object.freeze([0, 0.1, 0.2, 0.35]),
  POWER_MAX: 2,
});
export function metalName(i) {
  switch (i) {
    case 0: return t('rvn.gear.metal.iron', 'Iron');
    case 1: return t('rvn.gear.metal.steel', 'Steel');
    case 2: return t('rvn.gear.metal.silver', 'Silver');
    case 3: return t('rvn.gear.metal.elven', 'Elven');
    case 4: return t('rvn.gear.metal.dwarven', 'Dwarven');
    case 5: return t('rvn.gear.metal.mithril', 'Mithril');
    case 6: return t('rvn.gear.metal.adamantium', 'Adamantium');
    case 7: return t('rvn.gear.metal.ebony', 'Ebony');
    case 8: return t('rvn.gear.metal.orcish', 'Orcish');
    default: return t('rvn.gear.metal.daedric', 'Daedric');
  }
}
const TIERS = Object.freeze(['common', 'magic', 'rare', 'legendary']);
export function tierWord(i) {
  if (i <= 0) return t('rvn.gear.tier.common', 'Common');
  if (i === 1) return t('rvn.gear.tier.magic', 'Magic');
  return i === 2 ? t('rvn.gear.tier.rare', 'Rare') : t('rvn.gear.tier.legendary', 'Legendary');
}
const ROMAN = Object.freeze(['', 'I', 'II', 'III', 'IV', 'V']);

export function armedKind(mobileType) {
  if (!Number.isInteger(mobileType)) return false;
  const isClass = isClassEnemyId(mobileType);
  return equipmentVariantFor(isClass ? mobileType - 128 : mobileType, isClass, () => 0) !== null;
}
// Enemy archery comes from the kind flags, not the weapon, so the weapon slot takes melee weapons only.
export const meleeWeapon = (item) => item?.group === 'Weapons' && Number.isInteger(item.templateIndex) && item.templateIndex >= WEAPONS.Dagger && item.templateIndex <= WEAPONS.War_Axe;
export const needsBothHands = (item) => !!item && item.group === 'Weapons' && getItemHands(item) === ITEM_HANDS.Both;
export function gearKeyOf(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.group === 'Weapons') return meleeWeapon(item) ? 'weapon' : null;
  if (item.group === 'Jewellery') return wearableItem(item) ? 'charm' : null;
  if (item.group !== 'Armor') return null;
  let slot = EQUIP_SLOTS.None;
  try { slot = getEquipSlot({}, item); } catch { slot = EQUIP_SLOTS.None; }
  return KEY_OF_SLOT.get(slot) ?? null;
}
export function gearMetal(item) {
  if (item?.group === 'Weapons') return Number.isInteger(item.material) ? Math.max(0, Math.min(9, item.material)) : 0;
  if (item?.group === 'Armor') return plateMetal(item.material) ?? 0;
  return 0;
}
// 4 means past Legendary (an artifact, an Aetheric, or a Gilded piece), which answers to the player alone.
export function gearTier(item) {
  const i = TIERS.indexOf(rarityOf(item));
  return i < 0 ? 4 : i;
}
export function gearRankNeeded(item) {
  const m = gearMetal(item), t = gearTier(item);
  for (let rank = 1; rank <= 5; rank++) if (m <= GEAR.METAL_CAP[rank] && t <= GEAR.RARITY_CAP[rank]) return rank;
  return null;
}

export const brokenPiece = (item) => !!item && Number.isFinite(item.currentCondition) && item.currentCondition <= 0;
const holdsShield = (gear) => !!gear?.weapon && !brokenPiece(gear.weapon) && !needsBothHands(gear.weapon);
export function gearRefusal(r, item, { gear = r?.companion?.gear ?? {}, kindName = null } = {}) {
  if (!r?.sworn) return t('rvn.sworn.gone', 'It is no longer sworn to you.');
  if (r.companion?.state === 'errand') return t('rvn.gear.no.abroad', 'You cannot change its gear while it is abroad.');
  const key = gearKeyOf(item);
  if (!key) return t('rvn.gear.no.use', 'It can only use a melee weapon, armor, or a charm.');
  if (item.questItem) return t('rvn.gear.no.quest', 'A quest item stays with you.');
  if ((item.timeForItemToDisappear ?? 0) !== 0) return t('rvn.gear.no.summoned', 'Only you can use summoned gear.');
  if (gearTier(item) > 3) return t('rvn.gear.no.yours', 'Only you can equip gear of this rarity.');
  if (key !== 'charm' && !armedKind(r.mobileType)) return t('rvn.gear.no.kind', '{kind} cannot use weapons or armor, only charms.', { kind: kindName ?? t('rvn.gear.itsKind', 'Its kind') });
  if (brokenPiece(item)) return t('rvn.gear.no.broken', 'This item is broken.');
  const rank = Math.max(1, Math.min(5, r.rank | 0));
  const m = gearMetal(item), tier = gearTier(item);
  const overMetal = m > GEAR.METAL_CAP[rank], overTier = tier > GEAR.RARITY_CAP[rank];
  const need = ROMAN[gearRankNeeded(item) ?? 5];
  if (overMetal && overTier) return t('rvn.gear.no.both', 'It must reach Rank {rank} to equip {tier} {metal} gear.', { rank: need, tier: tierWord(tier), metal: metalName(m) });
  if (overMetal) return t('rvn.gear.no.metal', 'It must reach Rank {rank} to equip {metal} gear.', { rank: need, metal: metalName(m) });
  if (overTier) return t('rvn.gear.no.tier', 'It must reach Rank {rank} to equip {tier} gear.', { rank: need, tier: tierWord(tier) });
  if (key === 'shield' && (!gear.weapon || brokenPiece(gear.weapon))) return t('rvn.gear.no.shieldAlone', 'Give it a one-handed weapon first.');
  if (key === 'shield' && needsBothHands(gear.weapon)) return t('rvn.gear.no.shieldTwoHanded', 'Its weapon needs both hands.');
  if (key === 'weapon' && needsBothHands(item) && gear.shield) return t('rvn.gear.no.twoHandedShield', 'Take back its shield first.');
  return null;
}

export function sanitizeGear(g) {
  /** @type {Record<string, any>} */
  const out = {};
  if (!g || typeof g !== 'object') return out;
  for (const key of GEAR_KEYS) {
    const it = g[key];
    if (it && typeof it === 'object' && Number.isInteger(it.templateIndex)) out[key] = it;
  }
  return out;
}
export const gearItems = (gear) => (gear && typeof gear === 'object' ? GEAR_KEYS.map((k) => gear[k]).filter((it) => it && typeof it === 'object') : []);
export const isGearKey = (k) => typeof k === 'string' && KEY_SET.has(k);

export function wornGear(r) {
  const gear = r?.companion?.gear;
  if (!gear || !r?.sworn) return [];
  const armed = armedKind(r.mobileType);
  const out = [];
  for (const key of GEAR_KEYS) {
    const it = gear[key];
    if (!it || typeof it !== 'object') continue;
    if (key !== 'charm' && !armed) continue;
    if (brokenPiece(it)) continue;
    if (key === 'shield' && !holdsShield(gear)) continue;
    out.push([key, it]);
  }
  return out;
}
export function gearPower(r) {
  let p = 0;
  for (const [, it] of wornGear(r)) p += GEAR.POWER_PIECE + GEAR.POWER_TIER[Math.min(3, gearTier(it))];
  return Math.min(GEAR.POWER_MAX, Math.round(p * 1000) / 1000);
}

function armourPieces(slots) {
  const out = [];
  for (const s of [EQUIP_SLOTS.Head, EQUIP_SLOTS.RightArm, EQUIP_SLOTS.LeftArm, EQUIP_SLOTS.ChestArmor, EQUIP_SLOTS.Gloves, EQUIP_SLOTS.LegsArmor, EQUIP_SLOTS.Feet]) {
    const it = slots[s];
    if (it && Number.isInteger(it.templateIndex)) out.push({ piece: it.templateIndex, item: it });
  }
  const left = slots[EQUIP_SLOTS.LeftHand];
  if (left && SHIELD_VALUES.has(left.templateIndex)) out.push({ piece: left.templateIndex, shield: true });
  return out;
}
/** @param {any} entity @param {any} r @param {{ taken?: any[] }} [o] */
export function applySwornGear(entity, r, { taken = [] } = {}) {
  if (!entity || !r) return 0;
  const kit = wornGear(r);
  if (!kit.length && !taken.length) return 0;
  const slots = equipTableOf(entity);
  // Taken pieces come off by identity, because a slot may hold a rolled piece in place of a broken one.
  for (const it of taken) {
    if (!it || typeof it !== 'object') continue;
    for (let s = 0; s < slots.length; s++) if (slots[s] === it) slots[s] = null;
    if (entity.weapon === it) entity.weapon = null;
    if (entity._gearCharmSlot != null && !slots[entity._gearCharmSlot]) entity._gearCharmSlot = null;
  }
  for (const [key, it] of kit) {
    let s = SLOT_OF_KEY.get(key);
    if (key === 'charm') {
      s = entity._gearCharmSlot ?? EQUIP_SLOTS.None;
      if (s === EQUIP_SLOTS.None) { try { s = getEquipSlot(entity, it); } catch { s = EQUIP_SLOTS.None; } }
      if (s == null || s === EQUIP_SLOTS.None) continue;
      entity._gearCharmSlot = s;
    }
    if (key === 'weapon') {
      if (needsBothHands(it)) slots[EQUIP_SLOTS.LeftHand] = null;
      entity.weapon = it;
    }
    slots[s] = it;
  }
  entity.armorValues = enemyArmorValues(entity, armourPieces(slots));
  try { computeEntityMods(entity); } catch { }
  return kit.length;
}
