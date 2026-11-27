// @ts-check
// The enemy group switch shared by combat to-hit and by Detect, Dispel, and Pacify (world/nearbyObjects.js).
// Keep this module free of imports so pure readers can use it without loading combat/formulas.js.

export const ENEMY_GROUPS = Object.freeze({ None: -1, Undead: 0, Daedra: 1, Humanoid: 2, Animals: 3 });

// DFU's table by career index; careers 17 and 39 to 42 are grouped differently than in classic.
const ENEMY_GROUP_BY_CAREER = Object.freeze({
  0: 3, 3: 3, 4: 3, 5: 3, 6: 3, 11: 3, 20: 3, 34: 3, 39: 3, 40: 3,
  1: 2, 2: 2, 7: 2, 8: 2, 9: 2, 10: 2, 12: 2, 13: 2, 14: 2, 16: 2,
  21: 2, 22: 2, 24: 2, 41: 2, 42: 2,
  15: 0, 17: 0, 18: 0, 19: 0, 23: 0, 28: 0, 30: 0, 32: 0, 33: 0,
  25: 1, 26: 1, 27: 1, 29: 1, 31: 1,
});
const _groups = [];
/** @param {(careerIndex: number) => (number | null | undefined)} fn */
export function registerEnemyGroup(fn) {
  if (typeof fn !== 'function') throw new Error('registerEnemyGroup: a function of (careerIndex)');
  _groups.push(fn);
}
/** @param {number} careerIndex @returns {number} */
export function enemyEntityGroup(careerIndex) {
  for (const fn of _groups) {
    const g = fn(careerIndex);
    if (g != null) return g;
  }
  return ENEMY_GROUP_BY_CAREER[careerIndex] ?? ENEMY_GROUPS.None;
}
export function _resetEnemyGroups() { _groups.length = 0; }
