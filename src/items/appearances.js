// @ts-check
// Collected looks and the Wardrobe. A worn piece takes a collected look of its kind for gold, or its own back free.
// The `appearance` field is a receiver mark, stripped when the piece changes hands. Looks are cosmetic only.
import {
  ALL_LOOKS, LOOK_KIND_ORDER, lookCode, lookOfKey, lookOfPiece, appearanceOf, pieceKind, lookVariants, groupOfTemplate,
} from '../net/appearanceLaw.js';
import { BUILDING_TYPES } from '../world/buildingNames.js';
import { itemBaseValue } from './itemTemplates.js';
import { lookNameParts } from './itemInfo.js';
import { equipTableOf, EQUIP_SLOTS } from '../characters/equip.js';
import { totalGoldAmount, deductGold } from '../justice/court.js';
import { t } from '../ui/textManager.js';

export const WARDROBE_SHOPS = Object.freeze(/** @type {number[]} */ ([BUILDING_TYPES.ClothingStore, BUILDING_TYPES.Armorer, BUILDING_TYPES.WeaponSmith]));
export const isWardrobeShop = (/** @type {unknown} */ buildingType) => WARDROBE_SHOPS.includes(/** @type {number} */ (buildingType));

export const WARDROBE_FEE_SHARE = 20;
export const WARDROBE_FEE_MIN = 25;
export const lookStub = (/** @type {{ t: number, m: number, v: number }} */ look) => ({ group: groupOfTemplate(look.t), templateIndex: look.t, material: look.m, variant: look.v });
export const wardrobeFee = (/** @type {{ t: number, m: number, v: number }} */ look) => Math.max(WARDROBE_FEE_MIN, Math.round(itemBaseValue(lookStub(look)) / WARDROBE_FEE_SHARE));

/** @type {WeakMap<object, { arr: any, set: Set<string> }>} */
const _sets = new WeakMap();
export function appearancesOf(entity) {
  if (!entity || typeof entity !== 'object') return new Set();
  const arr = entity.appearances;
  const memo = _sets.get(entity);
  if (memo && memo.arr === arr) return memo.set;
  const set = new Set(Array.isArray(arr) ? arr.filter((k) => lookOfKey(k)) : []);
  _sets.set(entity, { arr, set });
  return set;
}
export const holdsLook = (entity, /** @type {{ t: number, m: number, v: number }} */ look) => !!look && appearancesOf(entity).has(lookCode(look));

/** @type {WeakMap<object, string>} */
const _read = new WeakMap();
const readSig = (/** @type {any} */ it) => `${it.group}|${it.templateIndex}|${it.material}|${it.variant}|${it.artifact}|${it.rarity}`;
// The list is replaced, never pushed to, because a save's copy may share the array.
/** @returns {number} */
export function noteHeldLooks(entity) {
  if (!entity || typeof entity !== 'object') return 0;
  /** @type {string[]} */
  const fresh = [];
  for (const list of [entity.items, entity.wagonItems, entity.bagItems]) {
    if (!Array.isArray(list)) continue;
    for (const it of list) {
      if (!it || typeof it !== 'object' || (it.group !== 'Armor' && it.group !== 'Weapons')) continue;
      const sig = readSig(it);
      if (_read.get(it) === sig) continue;
      _read.set(it, sig);
      const look = lookOfPiece(it);
      if (look) fresh.push(lookCode(look));
    }
  }
  if (!fresh.length) return 0;
  const have = appearancesOf(entity);
  const add = fresh.filter((k) => !have.has(k));
  if (!add.length) return 0;
  const all = new Set([...have, ...add]);
  entity.appearances = ALL_LOOKS.map(lookCode).filter((k) => all.has(k));
  return new Set(add).size;
}

export function lookGroups(entity) {
  const have = appearancesOf(entity);
  return LOOK_KIND_ORDER.map((kind) => {
    const looks = ALL_LOOKS.filter((a) => a.kind === kind).map((look) => ({ look, held: have.has(lookCode(look)) }));
    return { kind, held: looks.filter((l) => l.held).length, total: looks.length, looks };
  });
}
export const looksCount = (entity) => ({ held: [...appearancesOf(entity)].length, total: ALL_LOOKS.length });

export function kindName(/** @type {string} */ kind) {
  switch (kind) {
    case 'head': return t('looks.kind.head', 'Head');
    case 'rightArm': return t('looks.kind.rightArm', 'Right arm');
    case 'leftArm': return t('looks.kind.leftArm', 'Left arm');
    case 'chest': return t('looks.kind.chest', 'Chest');
    case 'hands': return t('looks.kind.hands', 'Hands');
    case 'legs': return t('looks.kind.legs', 'Legs');
    case 'feet': return t('looks.kind.feet', 'Feet');
    case 'shield': return t('looks.kind.shield', 'Shields');
    case 'dagger': return t('looks.kind.dagger', 'Daggers');
    case 'shortBlade': return t('looks.kind.shortBlade', 'Short blades');
    case 'longBlade': return t('looks.kind.longBlade', 'Long blades');
    case 'greatBlade': return t('looks.kind.greatBlade', 'Two-handed blades');
    case 'axe': return t('looks.kind.axe', 'One-handed axes');
    case 'greatAxe': return t('looks.kind.greatAxe', 'Two-handed axes');
    case 'mace': return t('looks.kind.mace', 'Maces');
    case 'flail': return t('looks.kind.flail', 'Flails');
    case 'warhammer': return t('looks.kind.warhammer', 'Warhammers');
    case 'staff': return t('looks.kind.staff', 'Staves');
    case 'bow': return t('looks.kind.bow', 'Bows');
    default: return kind;
  }
}
export function lookStyle(/** @type {{ t: number, m: number, v: number }} */ look) {
  const vs = lookVariants(look.t, look.m);
  return vs.length > 1 ? vs.indexOf(look.v) + 1 : 0;
}
export function lookName(/** @type {{ t: number, m: number, v: number }} */ look) {
  const { material, name } = lookNameParts(lookStub(look));
  const whole = material ? t('looks.name', '{material} {name}', { material, name }) : name;
  const style = lookStyle(look);
  return style ? t('looks.styled', '{name}, style {n}', { name: whole, n: style }) : whole;
}

export function lookLine(item) {
  const a = appearanceOf(item);
  return a ? t('wardrobe.wearing', 'Looks like {name}', { name: lookName(a) }) : '';
}

export function wardrobePieces(entity) {
  let table = [];
  try { table = equipTableOf(entity) ?? []; } catch { table = []; }
  const out = [];
  for (const [slot, item] of table.entries()) {
    const kind = item ? pieceKind(item) : null;
    if (kind && LOOK_KIND_ORDER.includes(kind)) out.push({ slot, item, kind });
  }
  return out.sort((a, b) => LOOK_KIND_ORDER.indexOf(a.kind) - LOOK_KIND_ORDER.indexOf(b.kind) || a.slot - b.slot);
}
export function looksForPiece(entity, item) {
  const kind = pieceKind(item);
  if (!kind) return [];
  const own = lookOfPiece(item);
  const have = appearancesOf(entity);
  return ALL_LOOKS.filter((a) => a.kind === kind && a !== own && have.has(lookCode(a)));
}
const isWorn = (entity, item) => { try { return (equipTableOf(entity) ?? []).includes(item); } catch { return false; } };

export function wearRefusal(entity, item, look) {
  const a = look ? lookOfKey(lookCode(look)) : null;
  if (!a) return 'look';
  if (!isWorn(entity, item)) return 'worn';
  if (pieceKind(item) !== a.kind) return 'kind';
  if (lookOfPiece(item) === a) return 'own';
  if (!holdsLook(entity, a)) return 'uncollected';
  if (appearanceOf(item) === a) return 'same';
  if (totalGoldAmount(entity) < wardrobeFee(a)) return 'gold';
  return null;
}
export function wearAppearance(entity, item, look) {
  const reason = wearRefusal(entity, item, look);
  if (reason) return { ok: false, reason, fee: 0 };
  const a = /** @type {{ t: number, m: number, v: number }} */ (lookOfKey(lookCode(look)));
  const fee = wardrobeFee(a);
  deductGold(entity, fee);
  item.appearance = { t: a.t, m: a.m, v: a.v };
  return { ok: true, reason: null, fee };
}
// A stand-in that differs from the character only in its equip table. Neither the piece nor the character changes.
export function previewWearer(entity, item, look) {
  let table = [];
  try { table = equipTableOf(entity) ?? []; } catch { table = []; }
  const slots = table.map((it) => (it && it === item ? previewPiece(item, look) : it));
  return Object.create(entity, { equip: { value: { slots }, enumerable: true } });
}
function previewPiece(item, look) {
  const { appearance, ...own } = item;
  void appearance;
  return look ? { ...own, appearance: { t: look.t, m: look.m, v: look.v } } : own;
}
export function clearAppearance(entity, item) {
  if (!isWorn(entity, item)) return { ok: false, reason: 'worn' };
  if (!item.appearance) return { ok: false, reason: 'none' };
  delete item.appearance;
  return { ok: true, reason: null };
}
export function slotName(/** @type {number} */ slot) {
  const S = EQUIP_SLOTS;
  switch (slot) {
    case S.Head: return kindName('head');
    case S.RightArm: return kindName('rightArm');
    case S.LeftArm: return kindName('leftArm');
    case S.ChestArmor: return kindName('chest');
    case S.Gloves: return kindName('hands');
    case S.LegsArmor: return kindName('legs');
    case S.Feet: return kindName('feet');
    case S.RightHand: return t('looks.slot.rightHand', 'Right hand');
    case S.LeftHand: return t('looks.slot.leftHand', 'Left hand');
    default: return '';
  }
}
