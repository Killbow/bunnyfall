// Prices the Identify effect alone through the cast's own cost formula, so the same cost modifiers apply.
// The identify window charges this price; the cast engine refunds at most what the release spent.

import { calculateCastCost } from './spellcost.js';

export const IDENTIFY_REFUND_FLOOR = 5;

/**
 * @param {object} spell
 * @param {object} identifyEffect
 * @param {object} casterEntity
 * @returns {number}
 */
export function identifyRefund(spell, identifyEffect, casterEntity) {
  const identifyAlone = { ...spell, effects: [identifyEffect] };
  const { sp } = calculateCastCost(identifyAlone, casterEntity);
  return Math.max(IDENTIFY_REFUND_FLOOR, sp);
}
