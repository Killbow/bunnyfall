// @ts-check
// Wilderness road encounters.

import { ENEMY_BASICS } from './enemyBasics.js';
import { SOLITARY_TYPES } from './mobileFactions.js';

/** @param {number} t */
const solitary = (t) => /** @type {Set<number>} */ (SOLITARY_TYPES).has(t);

export const TRIVIAL_LEVEL_RATIO = 3;
export const ROAD_COMPANY_LEVEL = 5;
export const ROAD_COMPANY_MAX = 3;
export const ROAD_PARTY_MAX = 4;

/**
 * @param {number} mobileType
 * @param {number} playerLevel
 */
export function trivialOnRoad(mobileType, playerLevel) {
  const lv = /** @type {any} */ (ENEMY_BASICS)[mobileType]?.level;
  if (!Number.isFinite(lv) || !Number.isFinite(playerLevel)) return false;
  return lv * TRIVIAL_LEVEL_RATIO <= playerLevel;
}

/**
 * @param {number} mobileType
 * @param {number} playerLevel
 * @param {number} roll01
 */
export function roadCompany(mobileType, playerLevel, roll01) {
  if (solitary(mobileType) || !(playerLevel >= ROAD_COMPANY_LEVEL)) return 0;
  const chance = Math.min(0.4, playerLevel / 50);
  if (!(roll01 < chance)) return 0;
  return Math.min(ROAD_COMPANY_MAX, 1 + Math.floor((playerLevel - ROAD_COMPANY_LEVEL) / 6));
}

/**
 * @param {number} mobileType
 * @param {number} partyExtra
 * @param {number} [company]
 */
export function wandererCount(mobileType, partyExtra, company = 0) {
  if (solitary(mobileType)) return 1;
  return Math.min(ROAD_PARTY_MAX, 1 + Math.max(0, partyExtra | 0) + Math.max(0, company | 0));
}
