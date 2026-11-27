export const FAR_FLAT_RING = 2;

// World units: above the tallest walker (1.8) and below the shortest Daggerfall tree record.
export const TALL_FLAT_HEIGHT = 2.5;

/**
 * Takes positional arguments because the streaming host calls it for every flat batch every frame, and an object
 * argument allocates on each call.
 * @param {number} ring
 * @param {number} height
 * @param {boolean} [animated]
 */
export function farFlatVisibleAt(ring, height, animated = false) {
  if (ring < FAR_FLAT_RING) return true;
  if (animated) return true;
  return height >= TALL_FLAT_HEIGHT;
}

/** @param {{ring: number, height: number, animated?: boolean}} p */
export function farFlatVisible({ ring, height, animated = false }) {
  return farFlatVisibleAt(ring, height, animated);
}
