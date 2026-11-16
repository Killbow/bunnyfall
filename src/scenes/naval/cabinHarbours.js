// @ts-check
// The harbors found before a sailing cabin visit, reused on the way out when the boat and the world have not moved.
// The street stays loaded while the player is in the cabin.

export const CABIN_BOAT_DRIFT_M = 1;

/**
 * @param {{ clear: () => void, place: (uid: any) => ({ pixel: number[], origin: number[], boat: number[] | null }) }} deps
 */
export function createCabinHarbours(deps) {
  let held = null;
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  return {
    /** @param {any} uid the boat whose cabin the player is entering */
    enter(uid) { held = { uid, at: deps.place(uid) }; },
    cancel() { held = null; },
    transition(door = null) {
      if (door === 'in' && held) return;
      const h = held;
      held = null;
      if (door === 'out' && h) {
        const now = deps.place(h.uid);
        const boatStill = !!(now.boat && h.at.boat) && Math.hypot(now.boat[0] - h.at.boat[0], now.boat[2] - h.at.boat[2]) <= CABIN_BOAT_DRIFT_M;
        if (boatStill && same(now.pixel, h.at.pixel) && same(now.origin, h.at.origin)) return;
      }
      deps.clear();
    },
  };
}
