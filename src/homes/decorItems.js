// @ts-check
// An online piece carries no free text: `item` holds the game numbers, so every visiting client names and dyes it
// from local data.

import { templateByIndex, inventoryItemImage } from '../items/itemTemplates.js';
import { itemLongName } from '../items/itemInfo.js';
import { getMagicItemTemplates, ITEM_GROUP_NAME_BY_CLASS } from '../items/loot.js';
import { getLocalizedMagicItemName } from '../ui/textManager.js';
import { TEMPLATES, isMap } from '../items/useItem.js';
import { isSummoned } from '../items/inventory.js';
import { isBagItem } from '../net/bagLaw.js';
import { isPackOnly } from '../items/itemBound.js';
import { decorFlatLight } from './decorCatalogue.js';
import { itemDyeColor, itemDyeTarget } from '../items/itemDye.js';
import { decorItemOf, decorIsMount, DECOR_ARCHIVE_MAX, DECOR_RECORD_MAX, DECOR_ARTIFACT_UNKNOWN, DECOR_OWN_KEPT_BACK } from '../net/decorLaw.js';
import { PROVENANCE_RE, MASTERWORK, makerMark, markedName } from '../net/recipeLaw.js';
import { TROPHY_TEMPLATE } from '../net/trophyLaw.js';
import { trophyItemName } from '../systems/hunt/trophies.js';

export const DECOR_OWN_NEVER_GROUPS = Object.freeze(new Set(['Weapons', 'Armor', 'Transportation', 'Currency', 'Deeds', 'QuestItems']));
// The kept-back list lives in net/decorLaw.js because the account service and the wild drop rule read it too.
export { DECOR_OWN_KEPT_BACK };

export function decorItemFlat(item) {
  const t = templateByIndex(item?.templateIndex);
  if (!t) return null;
  const own = Number.isSafeInteger(item.worldTextureArchive) && item.worldTextureArchive > 0 && Number.isSafeInteger(item.worldTextureRecord);
  const archive = own ? item.worldTextureArchive : t.worldTextureArchive;
  const record = own ? item.worldTextureRecord : t.worldTextureRecord;
  if (!Number.isSafeInteger(archive) || archive <= 0 || archive > DECOR_ARCHIVE_MAX) return null;
  if (!Number.isSafeInteger(record) || record < 0 || record > DECOR_RECORD_MAX) return null;
  return [archive, record];
}

export function decorDescriptorOf(item) {
  if (!item) return null;
  const g = ITEM_GROUP_NAME_BY_CLASS.indexOf(item.group);
  const bits = item.artifactIndexBitfield ?? 0;
  const a = item.artifact ? ((bits & 1) ? bits >> 1 : DECOR_ARTIFACT_UNKNOWN) : null;
  const p = (item.group === 'Paintings' || item.group === 'Books' || item.templateIndex === TROPHY_TEMPLATE) && Number.isSafeInteger(item.message) ? item.message : null;
  const pv = typeof item.provenance === 'string' && PROVENANCE_RE.test(item.provenance) ? item.provenance : null;
  const mk = pv && (item.marked === true || item.quality === MASTERWORK) ? makerMark(item.maker) : null;
  return decorItemOf({
    t: item.templateIndex, g: g >= 0 ? g : null,
    m: Number.isSafeInteger(item.material) && item.material > 0 ? item.material : null,
    v: Number.isSafeInteger(item.variant) && item.variant > 0 ? item.variant : null,
    a, p, pv, mk,
  });
}

export function decorStandOf(item) {
  if (!item || item.questItem || item.equipSlot != null || isSummoned(item) || isMap(item)) return null;
  if (DECOR_OWN_NEVER_GROUPS.has(item.group) || DECOR_OWN_KEPT_BACK.has(item.templateIndex)) return null;
  // Materials Bags and pack-only pieces are never placed: setting one down would strand the items it holds.
  if (isBagItem(item) || isPackOnly(item)) return null;
  if (item.templateIndex === TROPHY_TEMPLATE) return null;
  const flat = decorItemFlat(item);
  const descriptor = flat ? decorDescriptorOf(item) : null;
  if (!flat || !descriptor) return null;
  return { flat, light: decorFlatLight(flat), item: descriptor };
}

export function decorMountOf(item, identity = undefined) {
  if (!item || item.questItem || item.equipSlot != null || isSummoned(item)) return null;
  const descriptor = decorDescriptorOf(item);
  if (!descriptor) return null;
  const pic = inventoryItemImage(item, identity);
  const flat = pic ? [pic.archive, pic.record] : null;
  if (!flat || !decorIsMount({ model: null, flat, item: descriptor })) return null;
  if (!Number.isSafeInteger(flat[0]) || flat[0] <= 0 || flat[0] > DECOR_ARCHIVE_MAX) return null;
  if (!Number.isSafeInteger(flat[1]) || flat[1] < 0 || flat[1] > DECOR_RECORD_MAX) return null;
  return { flat, light: null, item: descriptor };
}

export function decorMountDye(d) {
  const own = decorItemOf(d);
  if (!own) return null;
  const group = own.g != null ? ITEM_GROUP_NAME_BY_CLASS[own.g] ?? null : null;
  return itemDyeColor({ templateIndex: own.t, group, material: own.m ?? 0, artifact: own.a != null });
}

export function decorMountItem(d) {
  const own = decorItemOf(d);
  if (!own) return null;
  const group = own.g != null ? ITEM_GROUP_NAME_BY_CLASS[own.g] ?? null : null;
  return { group, templateIndex: own.t, material: own.m ?? 0, variant: own.v ?? 0, artifact: own.a != null };
}

export function decorMountDyeTarget(d) {
  const own = decorItemOf(d);
  if (!own) return null;
  const group = own.g != null ? ITEM_GROUP_NAME_BY_CLASS[own.g] ?? null : null;
  return itemDyeTarget({ group, artifact: own.a != null });
}

export function decorItemName(d) {
  const own = decorItemOf(d);
  if (!own) return null;
  if (own.a != null) {
    const artifacts = (getMagicItemTemplates() ?? []).filter((m) => m.type === 1 || m.type === 2);
    const m = artifacts[own.a];
    if (m?.name) return getLocalizedMagicItemName(m.index, m.name);
  }
  const t = templateByIndex(own.t);
  if (!t) return null;
  if (own.t === TROPHY_TEMPLATE && own.p != null) return trophyItemName(own.p, own.v != null ? own.v - 1 : null);
  const group = own.g != null ? ITEM_GROUP_NAME_BY_CLASS[own.g] ?? null : null;
  const item = { templateIndex: own.t, group, material: own.m ?? 0, variant: own.v ?? 0, isIdentified: true, message: own.p ?? 0 };
  const name = itemLongName(item) || t.name;
  return own.mk ? markedName(own.mk, name) : name;
}

export function decorOwnEntry(item, index, identity = undefined) {
  const stands = decorStandOf(item);
  const hangs = stands ? null : decorMountOf(item, identity);
  const as = stands ?? hangs;
  if (!as) return null;
  const pic = inventoryItemImage(item, identity);
  return {
    key: `own:${index}`, kind: 'own', own: item, name: itemLongName(item), model: null, flat: as.flat,
    light: as.light, item: as.item, storage: false, count: item.stackCount ?? 1, mount: !!hangs,
    icon: pic && (pic.archive > 0 || pic.record > 0) ? pic : { archive: as.flat[0], record: as.flat[1], dye: null },
  };
}

export const decorOwnBackLine = (n) => (n === 1 ? 'One of your things that stood in it came back to your pack.'
  : `${n} of your things that stood in it came back to your pack.`);
