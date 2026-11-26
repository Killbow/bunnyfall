// @ts-check
// The client groups tree slots around their first slot’s point.
// Each tree claims the nearest unused flat so clients with the same flats agree.

/** How many of a pixel's trees stand together: slots 0-5 are the first grove, 6-11 the second. */
export const GROVE_SIZE = 6;

/** The grove a tree slot belongs to. */
export const groveOf = (/** @type {number} */ slot) => Math.floor(slot / GROVE_SIZE);

/**
 * Where a tree should stand: the law point of its grove's first tree.
 * @param {Array<{ slot: number, u: number, v: number }>} law the day's trees, slot order
 * @param {{ slot: number, u: number, v: number }} tree
 * @returns {{ u: number, v: number }}
 */
export function groveHeart(law, tree) {
  const first = law.find((t) => groveOf(t.slot) === groveOf(tree.slot));
  return first ?? tree;
}
