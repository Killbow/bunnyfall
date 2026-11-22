// @ts-check
import { LEGENDARIES, applyRarity } from '../../items/lootRarity.js';
import { mintCondition, setItemFields } from '../../items/itemTemplates.js';

/** Roll a base-game legendary and a compatible template, never a Rare fallback. */
export function favorLegendary(roll = Math.random) {
  const pick = (xs) => xs[Math.min(xs.length - 1, Math.floor(roll() * xs.length))];
  const record = pick(LEGENDARIES.filter((x) => x.group === 'Weapons' || x.group === 'Armor'));
  const templates = record.templates ?? (record.group === 'Weapons' ? [113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130] : [102, 103, 104, 105, 106, 107, 108]);
  const item = mintCondition(setItemFields({ group: record.group, templateIndex: pick(templates), material: 5, flags: 0 }));
  applyRarity(item, 'legendary', roll, [record]);
  item.isIdentified = true;
  return item;
}
