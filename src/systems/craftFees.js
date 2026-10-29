// @ts-check
// BUNNYFALL CRAFT FEES: a shop station asks a tenth of what you make, never more than its old flat fee (FORGE_FEE and
// the rest in professionLaw.js are the ceilings now). A home station asks nothing, as before. The fee is the client's
// to take (world.js deducts it; the account service never sees it), so this module only prices it.
import { recipeById } from '../net/recipeLaw.js';
import { potionById } from '../net/alchemyLaw.js';
import { materialOf } from '../net/professionLaw.js';
import { mintPiece } from './smithItems.js';
import { itemValueOf } from './item/itemTemplates.js';

/** The share of an item's value a shop station asks. */
export const FEE_SHARE = 0.1;
const PRICE_PROVENANCE = '0000000000000000';   // a stand-in: the piece is priced, never kept

/** A tenth of `value`, at least 1 gold and at most the station's ceiling. A station with no fee (a home's) asks 0. */
export function valueFee(value, ceiling) {
  if (!(ceiling > 0)) return 0;
  const v = Number(value);
  return Math.min(ceiling, Math.max(1, Math.round((Number.isFinite(v) && v > 0 ? v : 0) * FEE_SHARE)));
}

/** What a recipe's piece is worth at Standard quality, or 0 when it makes nothing that can be priced. */
export function recipeValue(recipeId) {
  if (!recipeById(recipeId)) return 0;
  try {
    const it = mintPiece({ recipe: recipeId, quality: 1, seed: 1 }, PRICE_PROVENANCE);
    return it ? itemValueOf(it) * Math.max(1, Number(it.stackCount) || 1) : 0;
  } catch { return 0; }
}

/** What a stored material is worth, times how many are made. */
export const materialValue = (key, count = 1) => (materialOf(key, () => 1)?.value ?? 0) * Math.max(1, Number(count) || 1);

/** A potion recipe's DFU price. */
export const potionValue = (potion) => potionById(potion)?.price ?? 0;

/** The station with its fee priced for this act: a copy whose `fee` is a tenth of `value`, its ceiling the station's own. */
export const pricedStation = (station, value) => (station ? { ...station, fee: valueFee(value, station.fee) } : station);

/** What a piece in the pack is worth (0 for none). */
export const itemFeeValue = (item) => (item ? itemValueOf(item) : 0);
