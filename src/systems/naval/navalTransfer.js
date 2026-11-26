import { addItem, isGoldPieces, addGoldPieces } from '../../items/inventory.js';
import { itemValueOf } from '../../items/itemTemplates.js';
import { planTake, applyTransfer } from '../../items/itemTransfer.js';

export function giveNavalItems(items, boat, entity, { force = false } = {}) {
  if (boat?.Cargo?.Items) {
    for (const item of items) addItem(boat.Cargo.Items, item);
    return { left: [], over: 0 };
  }
  entity.items ||= [];
  const left = [];
  let over = 0;
  for (const item of items) {
    if (isGoldPieces(item)) { addGoldPieces(entity, item.stackCount ?? 1); continue; }
    const plan = planTake(item, { bag: entity.items, entity, dryRun: true });
    if (force && (!plan.ok || plan.amount < (item.stackCount ?? 1))) {
      addItem(entity.items, item);
      over++;
    } else if (plan.ok) {
      const source = [item];
      applyTransfer(item, plan, source, entity.items, { entity, toPlayer: true });
      left.push(...source);
    } else left.push(item);
  }
  return { left, over };
}

export function navalLootWorth(items) {
  let worth = 0;
  for (const it of items ?? []) {
    if (!it) continue;
    const n = Math.max(1, it.stackCount | 0 || 1);
    worth += isGoldPieces(it) ? n : Math.max(0, Number(itemValueOf(it)) || 0) * n;
  }
  return Math.round(worth);
}
