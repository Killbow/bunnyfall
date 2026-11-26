// Found marks and own-mend credit on items. The client counter, the patron rules, and all code that writes
// the condition of a found piece read and write them here, and the account service bundles this module.
import { conditionPercentage } from './itemTemplates.js';

export const MEND_SALE_SHARE = 1 / 3;

/** @param {any} item */
export const isFoundMarked = (item) => Number.isInteger(item?.foundCondition);

/**
 * @param {any} item
 * @returns {number}
 */
export function foundSalePercentage(item) {
  const found = item?.foundCondition;
  const current = item?.currentCondition ?? 0;
  if (!Number.isInteger(found) || !(found < current)) return conditionPercentage(item);
  const own = Math.min(Number.isInteger(item.selfMended) ? item.selfMended : 0, current - found);
  return conditionPercentage({ currentCondition: found + Math.trunc(own * MEND_SALE_SHARE), maxCondition: item.maxCondition });
}

// Call before every rise in condition (an own mend, a paid repair): wear spends own mends first. A fall needs none.
/**
 * @param {any} item
 * @param {number} [at]
 * @returns {any}
 */
export function spendOwnMends(item, at = item?.currentCondition) {
  if (!isFoundMarked(item) || !Number.isInteger(item.selfMended)) return item;
  item.selfMended = Math.min(item.selfMended, Math.max(0, Math.trunc(at ?? 0) - item.foundCondition));
  return item;
}

// Only mends by the owner call this; a paid smith repair adds no sale credit.
/**
 * @param {any} item
 * @param {number} from
 * @returns {any}
 */
export function creditOwnMend(item, from) {
  if (!isFoundMarked(item)) return item;
  spendOwnMends(item, from);
  const above = (item.currentCondition ?? 0) - Math.max(from ?? 0, item.foundCondition);
  if (above > 0) {
    const room = Math.max(0, (item.maxCondition ?? 0) - item.foundCondition);
    item.selfMended = Math.min(room, (Number.isInteger(item.selfMended) ? item.selfMended : 0) + above);
  }
  return item;
}

/**
 * @param {any} item
 * @param {number} oldMax
 * @param {number} newMax
 */
export function scaleFoundMark(item, oldMax, newMax) {
  if (!(oldMax > 0) || oldMax === newMax) return;
  const share = (/** @type {number} */ n) => Math.round((n * newMax) / oldMax);
  if (isFoundMarked(item)) item.foundCondition = share(item.foundCondition);
  if (Number.isInteger(item.selfMended)) item.selfMended = share(item.selfMended);
}

/** @param {any} item */
export function dropFoundMark(item) {
  delete item.foundCondition;
  delete item.selfMended;
}

// Only books: arrows are never mended, so a mark on them buys nothing and a quiver must take every arrow.
const markedStack = (/** @type {any} */ it) => it?.group === 'Books';

/**
 * @param {any} a
 * @param {any} b
 * @returns {boolean}
 */
export const sameFoundMark = (a, b) => !markedStack(a) || (!isFoundMarked(a) && !isFoundMarked(b))
  || (a.foundCondition === b.foundCondition && a.currentCondition === b.currentCondition && (a.selfMended ?? 0) === (b.selfMended ?? 0));

// Classic Daggerfall mints a split-off part whole; a found book's part keeps its condition and mark instead.
/**
 * @param {any} stack
 * @param {any} picked
 */
export function carryFoundMark(stack, picked) {
  if (!markedStack(stack) || !isFoundMarked(stack)) return;
  picked.currentCondition = stack.currentCondition;
  picked.maxCondition = stack.maxCondition;
  picked.foundCondition = stack.foundCondition;
  if (Number.isInteger(stack.selfMended)) picked.selfMended = stack.selfMended;
}

/**
 * @param {any} item
 * @returns {any}
 */
export function markFound(item) {
  if (Number.isFinite(item?.currentCondition) && (item.maxCondition ?? 0) > 0) item.foundCondition = Math.max(0, Math.trunc(item.currentCondition));
  return item;
}
