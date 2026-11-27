// @ts-check

import { lootRarityOn, isCursed, isDamned } from './lootRarity.js';
import { itemBaseValue } from './itemTemplates.js';
import { isEquipped } from '../characters/equip.js';
import { totalGoldAmount, deductGold } from '../justice/court.js';
import { itemIsIdentified } from '../trade/tradeModes.js';
import { makerLaid } from '../magic/enchanting.js';

export const LIFT_FLOOR = 300;
export const LIFT_SHARE = 0.25;
export function liftPrice(item) {
  if (!isCursed(item)) return null;
  const value = Number.isFinite(item.value) ? item.value : itemBaseValue(item);
  return Math.max(LIFT_FLOOR, Math.round(value * LIFT_SHARE));
}
export const cursedKnown = (items) => (Array.isArray(items) ? items : []).filter((it) => isCursed(it) && itemIsIdentified(it));
export function liftRefusal(item, player) {
  if (!lootRarityOn()) return 'off';
  if (!isCursed(item)) return 'not';
  if (!itemIsIdentified(item)) return 'unknown';
  // Check identification before damnation so a refusal never reveals a curse the player has not identified.
  if (isDamned(item)) return 'damned';
  if (isEquipped(item)) return 'worn';
  if (totalGoldAmount(player) < /** @type {number} */ (liftPrice(item))) return 'gold';
  return null;
}
export function liftCurse(item, player) {
  if (!player || !Array.isArray(player.items) || !player.items.includes(item)) return { ok: false, reason: 'gone' };
  const why = liftRefusal(item, player);
  if (why) return { ok: false, reason: why };
  const price = /** @type {number} */ (liftPrice(item));
  const c = item.cursed;
  const list = Array.isArray(item.enchantments) ? item.enchantments : [];
  let at = -1;
  // Remove the last matching row no item maker laid, since a bound soul can add a forced row of the same kind.
  for (let i = list.length - 1; i >= 0 && at < 0; i--) if (!makerLaid(list[i]) && list[i]?.type === c.type && list[i]?.param === c.param) at = i;
  item.enchantments = list.filter((_, i) => i !== at);
  delete item.cursed;
  deductGold(player, price);
  return { ok: true, price };
}
