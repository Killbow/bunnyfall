// @ts-check
import { isEnchanted } from './inventory.js';
import { itemIsIdentified } from '../trade/tradeModes.js';
import { itemStatRows } from './itemInfo.js';
import { lootRarityOn, rarityLines } from './lootRarity.js';
import { magicPowersLines } from './itemPowers.js';
import { bardBuffLine } from '../net/bardServiceLaw.js';
import { isStolen, stolenLine } from '../justice/stolenGoods.js';

/**
 * @param {any} it
 * @returns {{ rows: string[], magic: string[], stolen: string | null } | null}
 */
export function itemLookRows(it) {
  if (!it || typeof it !== 'object') return null;
  let rows = [], magic = [];
  try { rows = itemStatRows(it).map((r) => (r.label ? `${r.label}: ${r.text}` : r.text)); } catch { rows = []; }
  try { magic = rarityLines(it, { sigil: true, set: true, lore: false }); } catch { magic = []; }
  try {
    if (!(it.rarity && lootRarityOn()) && isEnchanted(it)) {
      for (const t of magicPowersLines(it, { identified: itemIsIdentified(it) })) if (t && !magic.includes(t)) magic.push(t);
    }
  } catch { }
  const flourish = bardBuffLine(it);
  if (flourish && !magic.includes(flourish)) magic.push(flourish);
  return { rows, magic, stolen: isStolen(it) ? stolenLine() : null };
}
