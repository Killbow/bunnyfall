// @ts-check
export const LEVEL_CAP = 45;

export const atLevelCap = (entity) => (entity?.level ?? 1) >= LEVEL_CAP;

/** @param {any} entity */
export function releaseCapLatch(entity) {
  if (!entity?.readyToLevelUp || entity.oghmaLevelUp || !atLevelCap(entity)) return false;
  entity.readyToLevelUp = false;
  entity.pendingLevel = null;
  entity.pendingBonusPool = null;
  return true;
}
