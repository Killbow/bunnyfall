import { TEMPLATES } from './itemKinds.js';

import { clampArmorVariant, isPlate, plateMetal } from './armorMaterials.js';
import { conditionMultipliersByMaterial, valueMultipliersByMaterial, WEAPONS, WEAPON_CONDITION_POOL } from '../characters/weapons.js';
import { GROUP_TEMPLATE_INDICES } from './itemTemplatesData.js';
// wagonKinds.js imports TRANSPORT_SMALL_CART from this module, so read WAGON_KINDS at call time only.
import { WAGON_KINDS, wagonKindOf } from '../travel/wagonKinds.js';
import TEMPLATES_JSON from '../characters/itemTemplates.json' with { type: 'json' };
import { playerArchiveFor, resolvePaperdollRecord } from '../characters/paperdollArt.js';
import { itemDyeColor, itemDyeTarget } from './itemDye.js';
import { DYE_TARGETS } from '../characters/dyes.js';
import { customItemClass, rriVariantFields, rriStoredWeight, rriCustomItemsForGroup } from '../mods/rriItems.js';

export { GROUP_TEMPLATE_INDICES };

const _rows = new Array(288).fill(null);
for (const t of TEMPLATES_JSON) {
  _rows[t.index] = Object.freeze({
    ...t,
    weight: t.baseWeight,
    worldTexArchive: t.worldTextureArchive,
    worldTexRecord: t.worldTextureRecord,
  });
}
export const ITEM_TEMPLATES = Object.freeze(_rows);

const _custom = new Map();
export function registerCustomTemplates(rows) {
  for (const t of rows ?? []) {
    if (!Number.isFinite(t?.index) || t.index < ITEM_TEMPLATES.length) continue;
    _custom.set(t.index, Object.freeze({ custom: true, variants: 0, rarity: 1, enchantmentPoints: 0, playerTextureArchive: 0, playerTextureRecord: 0, isIngredient: false, ...t, weight: t.baseWeight, worldTexArchive: t.worldTextureArchive, worldTexRecord: t.worldTextureRecord }));
  }
  return _custom.size;
}
export const customTemplateCount = () => _custom.size;
export const customTemplateRows = () => [..._custom.values()];
const _overrides = new Map();
export function registerTemplateOverrides(rows) {
  _overrides.clear();
  for (const r of rows ?? []) {
    const base = ITEM_TEMPLATES[r?.index];
    if (!base) continue;
    const t = { ...base, ...r };
    _overrides.set(r.index, Object.freeze({ ...t, weight: t.baseWeight, worldTexArchive: t.worldTextureArchive, worldTexRecord: t.worldTextureRecord }));
  }
  return _overrides.size;
}
export const templateOverrideCount = () => _overrides.size;
export const templateByIndex = (i) => _overrides.get(i) ?? ITEM_TEMPLATES[i] ?? _custom.get(i) ?? null;

export function templateFor(group, groupIndex) {
  const idx = GROUP_TEMPLATE_INDICES[group]?.[groupIndex];
  return idx == null ? null : (_overrides.get(idx) ?? ITEM_TEMPLATES[idx]);
}

export function groupTemplates(group) {
  return (GROUP_TEMPLATE_INDICES[group] ?? []).map((i) => _overrides.get(i) ?? ITEM_TEMPLATES[i]);
}

export const isAmmunition = (item) => item?.templateIndex === WEAPONS.Arrow;

export const materialValue = (basePrice, material) => basePrice * 3 * (valueMultipliersByMaterial[material] ?? 1);

export function itemBaseValue(item, lookup = templateByIndex) {
  const t = lookup(item.templateIndex);
  if (!t) return 1;
  // Daggerfall Unity never applies the material multiplier to arrows.
  if (item.group === 'Weapons' && isAmmunition(item)) return t.basePrice;
  if (item.group === 'Weapons') return materialValue(t.basePrice, item.material ?? 0);
  if (item.group === 'Armor') {
    const m = item.material ?? 0;
    if (m === 0x0100) return t.basePrice * 2;
    if (isPlate(m)) return materialValue(t.basePrice, plateMetal(m));
    return t.basePrice;
  }
  return t.basePrice;
}

export function setItemFields(item) {
  const named = { ...item, name: item.name ?? templateByIndex(item.templateIndex)?.name };
  if (named.templateIndex === TEMPLATES.Lantern && !named.enchantments?.length && !named.customEnchantments?.length) {
    named.maxCondition = 0;
    named.currentCondition = 0;
  }
  // A custom class variant applies once at the mint; the rriVariant mark stops a second read from prefixing twice.
  const variant = named.rriVariant ? null : rriVariantFields(named);
  // A fur piece from a save without weightInKg gets the stored fold weight once, not the derived leather half.
  const legacyWeight = (named.rriVariant && !Number.isFinite(named.weightInKg)) ? rriStoredWeight(named) : null;
  return {
    ...named,
    ...(variant ? { ...variant, rriVariant: true } : {}),
    ...(legacyWeight != null ? { weightInKg: legacyWeight } : {}),
    // Daggerfall Unity prices armor before the fur fold to Leather, so a fur piece keeps the chain (x2) value.
    value: itemValueOf(named),
  };
}
const _valueLaws = new Map();
export function registerValueLaw(name, fn) { if (typeof fn === 'function') _valueLaws.set(name, fn); else _valueLaws.delete(name); }
const lawValue = (item) => { for (const fn of _valueLaws.values()) { const v = fn(item); if (Number.isFinite(v)) return v; } return null; };
export const itemValueOf = (item) => (_valueLaws.size && lawValue(item)) ?? (Number.isFinite(item?.value) ? item.value : itemBaseValue(item ?? {}));

const WORLD_TEXTURE_GROUPS = new Set(['UselessItems1', 'ReligiousItems', 'MiscItems']);
export const TRANSPORT_SMALL_CART = 93;
export const TRANSPORT_HORSE = 94;
// Small Cart and boat rows point at the Wine Rack art, so they get no inventory art. The Horse's art is its own.
const BORROWED_ART_INDICES = new Set((GROUP_TEMPLATE_INDICES.Transportation ?? []).filter((i) => i !== TRANSPORT_HORSE));

export function usesWorldTexture(item, template = templateByIndex(item.templateIndex)) {
  if (template?.custom) return true;
  if (WORLD_TEXTURE_GROUPS.has(item.group)) return true;
  if (template?.isIngredient) return true;
  if (item.group === 'Weapons' && item.templateIndex === WEAPONS.Arrow) return true;
  return false;
}

// A painting's message seeds its picture, descriptions, and artist, so every template mint must roll one.
export const PAINTING_MESSAGE_RANGE = 65536;
export const rollPaintingMessage = (rolls = Math.random) => Math.floor(rolls() * PAINTING_MESSAGE_RANGE);

export const conditionPercentage = (item) => ((item?.maxCondition ?? 0) > 0 ? Math.trunc(100 * (item.currentCondition ?? 0) / item.maxCondition) : 100);

export const conditionShare = (item) => item.currentCondition / item.maxCondition;
const wornFirst = (item) => (item.equipSlot != null ? 1 : 0);
export const mendOrder = (a, b) => wornFirst(b) - wornFirst(a) || conditionShare(a) - conditionShare(b);

const _customItemProviders = [rriCustomItemsForGroup];
export function registerCustomItemsForGroup(provider) {
  if (typeof provider === 'function' && !_customItemProviders.includes(provider)) _customItemProviders.push(provider);
}
export const customItemsForGroup = (group) => _customItemProviders.flatMap((p) => p(group) ?? []);

const _otherModItems = [];
const otherModItemsForGroup = (group) => _otherModItems.filter((r) => r.group === group && r.isOn()).map((r) => r.templateIndex);
export function registerCustomItemGroup(templateIndex, group, isOn = () => true) {
  if (_otherModItems.some((r) => r.templateIndex === templateIndex && r.group === group)) return;
  _otherModItems.push({ templateIndex, group, isOn });
  registerCustomItemsForGroup(otherModItemsForGroup);
}

const _useHandlers = new Map();
// profTemplates.js registers the kit dye here because it imports this module.
let _kitDye = null;
export function registerKitDye(fn) { _kitDye = typeof fn === 'function' ? fn : null; }
export function registerItemUseHandler(templateIndex, handler) { if (typeof handler === 'function') _useHandlers.set(templateIndex, handler); else _useHandlers.delete(templateIndex); }
export const itemUseHandler = (templateIndex) => _useHandlers.get(templateIndex) ?? null;

export function mintCondition(item) {
  if (item.maxCondition != null) return item;
  // Frozen pre-chargen stand-in weapons carry no condition.
  if (!Object.isExtensible(item)) return item;
  const t = templateByIndex(item.templateIndex);
  let max = t && item.group === 'Weapons' && !isAmmunition(item) ? WEAPON_CONDITION_POOL : (t?.hitPoints ?? 0);
  const mat = item.material;
  if (mat != null && max > 0) {
    if (item.group === 'Weapons') max = Math.trunc((max * (conditionMultipliersByMaterial[mat] ?? 4)) / 4);
    else if (item.group === 'Armor' && isPlate(mat)) max = Math.trunc((max * (conditionMultipliersByMaterial[plateMetal(mat)] ?? 4)) / 4);
  }
  item.maxCondition = max;
  item.currentCondition = max;
  return item;
}

export function inventoryItemModel(item) {
  if (item?.templateIndex === TRANSPORT_SMALL_CART) return WAGON_KINDS[wagonKindOf(item)].icon;
  return null;
}

const _ownImages = new Map();
export function registerOwnItemImage(templateIndex, fn) { if (typeof fn === 'function') _ownImages.set(templateIndex, fn); else _ownImages.delete(templateIndex); }
export function ownItemImage(item, { forPaperDoll = false } = {}) {
  const fn = _ownImages.get(item?.templateIndex);
  const r = fn ? fn(item, { forPaperDoll }) : null;
  return r && Number.isInteger(r.archive) && Number.isInteger(r.record) ? r : null;
}

const _templateLore = new Map();
export function registerTemplateLore(templateIndex, text) { if (typeof text === 'string' && text) _templateLore.set(templateIndex, text); else _templateLore.delete(templateIndex); }
export const templateLore = (item) => _templateLore.get(item?.templateIndex) ?? null;

export function inventoryItemImage(item, identity = undefined) {
  const t = templateByIndex(item.templateIndex);
  if (!t) return null;
  { const own = ownItemImage(item); if (own) return { archive: own.archive, record: own.record, dye: itemDyeColor(item), dyeTarget: itemDyeTarget(item) }; }
  if (BORROWED_ART_INDICES.has(item.templateIndex)) return null;
  const cls = customItemClass(item.templateIndex);
  if (cls) {
    const bodyArchive = playerArchiveFor(item, t, identity);
    const archive = cls.inventoryTextureArchive ?? bodyArchive;
    const record = cls.inventoryTextureRecord ? cls.inventoryTextureRecord(item, { playerTextureArchive: bodyArchive }) : t.playerTextureRecord;
    return { archive, record, dye: itemDyeColor(item), dyeTarget: itemDyeTarget(item) };
  }
  let archive, record;
  // The item's own texture fields win, since artifacts, potion recipes, and classic saves overwrite them.
  if (usesWorldTexture(item, t)) {
    archive = Number.isFinite(item.worldTextureArchive) ? item.worldTextureArchive : t.worldTextureArchive;
    record = Number.isFinite(item.worldTextureRecord) ? item.worldTextureRecord : t.worldTextureRecord;
  } else if (item.artifact && Number.isFinite(item.playerTextureRecord)) {
    archive = Number.isFinite(item.playerTextureArchive) ? item.playerTextureArchive : playerArchiveFor(item, t, identity);
    record = item.playerTextureRecord;
  } else {
    archive = playerArchiveFor(item, t, identity);
    if ((t.variants ?? 0) > 0) {
      const v = item.group === 'Armor'
        ? clampArmorVariant(item.templateIndex, item.material ?? 0, item.variant ?? 0)
        : Math.min(item.variant ?? 0, t.variants - 1);
      record = resolvePaperdollRecord(t, v);
    } else {
      record = t.playerTextureRecord;
    }
  }
  // As in Daggerfall Unity, Katana +1 and the world-texture fallback run after every arm above.
  if (item.group === 'Weapons' && item.templateIndex === WEAPONS.Katana) record += 1;
  if (archive === 0 && record === 0) { archive = t.worldTextureArchive; record = t.worldTextureRecord; }
  if (Number.isFinite(t.iconDye)) return { archive, record, dye: t.iconDye, dyeTarget: DYE_TARGETS.WeaponsAndArmor };
  if (t.kitDye && Number.isFinite(_kitDye?.(item))) return { archive, record, dye: _kitDye(item), dyeTarget: DYE_TARGETS.WeaponsAndArmor };
  return { archive, record, dye: itemDyeColor(item), dyeTarget: itemDyeTarget(item) };
}
