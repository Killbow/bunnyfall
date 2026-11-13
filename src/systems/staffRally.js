// @ts-check
// BUNNYFALL (2026-11-13, the owner: "having enemies head to the pillar instead of wandering at first so the players can
// find them"): A STAFF EVENT'S MONSTERS RALLY. A monster stood for a staff event walks to the event's pillar first (the
// motor's `follow` door, as the raid waves' camp is), and lets go of it - to fight, as any foe does - once a player is
// near it or it has come to the pillar. Pure but for the foes it is handed; the host brings the pillar's foot.

/** How near the pillar a rallying monster stops (m), and how near a player lets it go (m). */
export const RALLY_STOP_M = 8;
export const RALLY_NEAR_M = 28;
/** How far a monster may stray from its way before its route is made again (m) - the follow door's leash. */
export const RALLY_LEASH_M = 40;

/** Send `foe` to the pillar's foot (`footFn()`: [x, y, z] or null). A foe already following something is left to it. */
export function rallyFoe(/** @type {any} */ foe, /** @type {() => number[] | null} */ footFn) {
  const ai = foe?.ai;
  if (!ai || ai.follow || !footFn()) return false;
  ai.follow = { feet: () => footFn() ?? ai.feet, stop: RALLY_STOP_M, leash: RALLY_LEASH_M, rally: true };
  return true;
}

/** One look: each rallying foe is let go when it is dead, has come to the pillar, or a player stands within RALLY_NEAR_M.
 *  `players`: their feet, [x, y, z] each. Answers how many it let go. */
export function rallyStep(/** @type {Iterable<any>} */ foes, /** @type {number[][]} */ players) {
  let n = 0;
  for (const f of foes) {
    const fl = f?.ai?.follow;
    if (!fl?.rally) continue;
    const at = f.ai.feet, goal = fl.feet?.();
    const near = Array.isArray(at) && (players ?? []).some((p) => Array.isArray(p) && Math.hypot(p[0] - at[0], p[2] - at[2]) <= RALLY_NEAR_M);
    const arrived = Array.isArray(at) && Array.isArray(goal) && Math.hypot(goal[0] - at[0], goal[2] - at[2]) <= RALLY_STOP_M + 2;
    if (f.dead || near || arrived) { f.ai.follow = null; n++; }
  }
  return n;
}
