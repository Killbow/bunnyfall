// @ts-check

import { registerCustomTemplates, mintCondition, setItemFields, registerItemUseHandler } from './itemTemplates.js';
import { registerUniqueFind } from './lootRarity.js';
import { isEnchanted } from './inventory.js';
import { equipTableOf } from '../characters/equip.js';
import { creditOwnMend } from './foundMark.js';

export const WELKYND_STONE_TEMPLATE = 573;
export const VARLA_STONE_TEMPLATE = 574;
export const WELKYND_STONE_TIER = 6;
export const VARLA_STONE_TIER = 10;
export const AYLEID_STONE_TEMPLATES = Object.freeze([
  Object.freeze({ index: WELKYND_STONE_TEMPLATE, name: 'Welkynd Stone', baseWeight: 0.5, hitPoints: 1000, basePrice: 1500, rarity: 20,
    worldTextureArchive: 254, worldTextureRecord: 5 }),
  Object.freeze({ index: VARLA_STONE_TEMPLATE, name: 'Varla Stone', baseWeight: 0.5, hitPoints: 1000, basePrice: 4000, rarity: 20,
    worldTextureArchive: 254, worldTextureRecord: 7 }),
]);
registerCustomTemplates(AYLEID_STONE_TEMPLATES);
export const isWelkyndStone = (/** @type {any} */ item) => item?.templateIndex === WELKYND_STONE_TEMPLATE;
export const isVarlaStone = (/** @type {any} */ item) => item?.templateIndex === VARLA_STONE_TEMPLATE;
export const welkyndStone = () => mintCondition(setItemFields({ group: 'UselessItems2', templateIndex: WELKYND_STONE_TEMPLATE }));
export const varlaStone = () => mintCondition(setItemFields({ group: 'UselessItems2', templateIndex: VARLA_STONE_TEMPLATE }));

// Late finds roll after the other finds, so adding them does not move any earlier seeded draw.
registerUniqueFind({ id: 'welkynd-stone', minTier: WELKYND_STONE_TIER, weight: 1, late: true, mint: () => [welkyndStone()] });
registerUniqueFind({ id: 'varla-stone', minTier: VARLA_STONE_TIER, weight: 1, late: true, mint: () => [varlaStone()] });

export const STONE_TEXT = Object.freeze({
  welkynd: 'The Welkynd Stone flares blue and is spent. Your magicka is full.',
  welkyndFull: 'Your magicka is already full. The stone would be wasted.',
  varla: (n) => `The Varla Stone flares and is spent. ${n === 1 ? 'An enchanted piece you wear is' : `${n} enchanted pieces you wear are`} whole again.`,
  varlaWhole: 'Every enchanted piece you wear is already whole. The stone would be wasted.',
  nobody: 'Nothing happens.',
});
function spend(item, list) {
  if ((item.stackCount ?? 1) > 1) { item.stackCount -= 1; return; }
  const i = Array.isArray(list) ? list.indexOf(item) : -1;
  if (i >= 0) list.splice(i, 1);
}
export function useWelkyndStone(item, list, entity) {
  if (!entity) return { kind: 'text', text: STONE_TEXT.nobody };
  const max = Number(entity.maxMagicka) || 0;
  if (!(max > 0) || (Number(entity.magicka) || 0) >= max) return { kind: 'text', text: STONE_TEXT.welkyndFull };
  entity.magicka = max;
  spend(item, list);
  return { kind: 'text', text: STONE_TEXT.welkynd };
}
export const varlaMends = (entity) => (entity ? equipTableOf(entity).filter((it) => it && isEnchanted(it) && Number.isFinite(it.maxCondition) && (it.currentCondition ?? it.maxCondition) < it.maxCondition) : []);
export function useVarlaStone(item, list, entity) {
  if (!entity) return { kind: 'text', text: STONE_TEXT.nobody };
  const pieces = varlaMends(entity);
  if (!pieces.length) return { kind: 'text', text: STONE_TEXT.varlaWhole };
  const was = pieces.map((it) => it.currentCondition);
  for (const it of pieces) it.currentCondition = it.maxCondition;
  pieces.forEach((it, i) => creditOwnMend(it, was[i]));
  spend(item, list);
  return { kind: 'text', text: STONE_TEXT.varla(pieces.length) };
}
registerItemUseHandler(WELKYND_STONE_TEMPLATE, (item, list, ctx) => useWelkyndStone(item, list, ctx?.entity ?? null));
registerItemUseHandler(VARLA_STONE_TEMPLATE, (item, list, ctx) => useVarlaStone(item, list, ctx?.entity ?? null));
