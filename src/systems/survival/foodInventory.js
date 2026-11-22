// @ts-check
import { TEMPLATE, removePutridFood } from './food.js';
import { addItem } from '../../items/inventory.js';
/** Run below index-based save relinks, so removed food cannot shift equipment references. */
export function tidyFoodInventory(list) {
  if (!Array.isArray(list)) return;
  removePutridFood(list);
  const meat = list.filter((it) => [TEMPLATE.Meat, TEMPLATE.RawMeat].includes(it.templateIndex));
  for (const item of meat) { const i = list.indexOf(item); if (i >= 0) list.splice(i, 1); }
  for (const item of meat) addItem(list, item);
}
