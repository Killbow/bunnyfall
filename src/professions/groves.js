// @ts-check
// CAVERNS-MINING-LOGGING (logging fix): THE DAY'S TREES STAND IN GROVES.
//
// A pixel's trees each had a law point anywhere in its 819 m square and stood at the forest flat nearest it, so the walk
// from one tree to the next was 250 to 400 m: leveling Logging was mostly walking. The law's points are unchanged (the
// service reads a tree's tier and material, never where it stands); the CLIENT now sends each run of GROVE_SIZE slots to
// the one point the run's first slot names, and every tree of the run takes the nearest unclaimed flat to that point.
// Every client holds the same flats and the same law, so every client stands the same groves.

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
