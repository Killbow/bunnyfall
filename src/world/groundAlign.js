// Ports the two ground aligns from DFU `GameObjectHelper`. A ray goes down from 0.2 above the center, and on a hit
// the center moves to the hit plus 0.52 of the height (a 2% lift off the ground). The height is the billboard
// `size.y` or the controller capsule height.

/**
 * @param {number} centreY
 * @param {?number} hitDist
 * @param {number} sizeY
 * @param {number} [distance]
 * @returns {number}
 */
export function alignBillboardToGround(centreY, hitDist, sizeY, distance = 2) {
  if (hitDist == null || !(hitDist <= distance)) return centreY;
  return centreY + 0.2 - hitDist + sizeY * 0.52;
}

/**
 * @param {number} centreY
 * @param {?number} hitDist
 * @param {number} controllerHeight
 * @param {number} [distance]
 * @returns {number}
 */
export function alignControllerToGround(centreY, hitDist, controllerHeight, distance = 3) {
  if (hitDist == null || !(hitDist <= distance)) return centreY;
  return centreY + 0.2 - hitDist + controllerHeight * 0.52;
}
