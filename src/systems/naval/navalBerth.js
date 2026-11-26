// @ts-check
export const BERTH_STILL = 0.5;

/**
 * @param {{ lies: (b: any) => boolean, ownWay: (b: any) => number, clear: () => boolean, event: (ev: any) => any }} deps
 */
export function createBerthWatch(deps) {
  let helm = /** @type {any} */ (null);
  return {
    step(/** @type {any} */ boat, /** @type {{ key: string } | null | undefined} */ port) {
      if (boat && port && deps.lies(boat)) deps.event({ type: 'berth', port: port.key, boat: boat.uid ?? null, still: deps.ownWay(boat) <= BERTH_STILL });
      // Letting go of the helm in port stops the boat at once, so it counts as a still berth.
      else if (!boat && helm && port && deps.clear()) deps.event({ type: 'berth', port: port.key, boat: helm.uid ?? null, still: true });
      helm = boat ?? null;
    },
  };
}
