// @ts-check
// Whether the ray straight down from a body can meet a boat hull: the hull collider's world box, grown by a margin.
// The full ray is cast only near a hull box, or when a box is unknown.

export const HULL_RAY_MARGIN = 0.5;

/**
 * @param {({ min: number[], max: number[] } | null)[]} boxes
 * @param {number[]} o
 * @param {number} reach
 */
export function downRayNearHull(boxes, o, reach, margin = HULL_RAY_MARGIN) {
  for (const b of boxes) {
    if (!b) return true;
    if (o[0] < b.min[0] - margin || o[0] > b.max[0] + margin) continue;
    if (o[2] < b.min[2] - margin || o[2] > b.max[2] + margin) continue;
    if (o[1] < b.min[1] - margin || o[1] - reach > b.max[1] + margin) continue;
    return true;
  }
  return false;
}
