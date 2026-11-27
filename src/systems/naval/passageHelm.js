// @ts-check
import { charterRecord } from './passage.js';
import { BOAT_ACTIONS } from './comeSailAwayActions.js';

// A passenger at a booked ship's helm keeps only these keys: stepping off and the time dial.
export const PASSENGER_KEYS = Object.freeze([BOAT_ACTIONS.disembark, 'Transport', BOAT_ACTIONS.timeScaleUp, BOAT_ACTIONS.timeScaleDown, BOAT_ACTIONS.timeScaleReset]);

export function createJourneyHand() {
  return { held: new Set(), row: false, edges: new Set(), live: false, press(action) { if (typeof action === 'string') this.edges.add(action); } };
}

/** @param {any} boat */
export const charterOf = (boat) => charterRecord(boat?.charter);
/**
 * @param {any} boat
 * @param {{ live?: boolean } | null | undefined} journey
 */
export const mastersHelm = (boat, journey) => !!charterOf(boat) && journey?.live === true;

/**
 * @param {any} input
 * @param {() => any} boat
 * @param {{ held: Set<string>, row: boolean, edges: Set<string>, live: boolean }} journey
 */
export function passengerHelm(input, boat, journey) {
  const passenger = () => mastersHelm(boat(), journey);
  const seam = Object.create(input);
  Object.defineProperties(seam, {
    has: { value: (/** @type {string} */ action) => (passenger() ? journey.held.has(action) : input.has(action)) },
    started: { value: (/** @type {string} */ action) => (passenger() && !PASSENGER_KEYS.includes(action) ? journey.edges.has(action) : input.started(action) || journey.edges.has(action)) },
    horizontal: { value: () => (passenger() ? 0 : input.horizontal()) },
    vertical: { value: () => (passenger() ? 0 : input.vertical()) },
    // The mod releases autorun on leaving the helm only if it reads it, so a passenger's autorun is released here.
    toggleAutorun: { get: () => { if (!passenger()) return input.toggleAutorun; if (input.toggleAutorun) input.toggleAutorun = false; return journey.row; }, set: (v) => { input.toggleAutorun = v; } },
  });
  return seam;
}

/**
 * @param {any} boat
 * @param {{ live?: boolean } | null | undefined} journey
 * @param {{ timeDial?: boolean, timeScale?: number, timeScaleIndex?: number, timeScaleMax?: number } | null} [helm]
 */
export function passengerCard(boat, journey, helm = null) {
  if (!mastersHelm(boat, journey)) return null;
  const c = /** @type {any} */ (charterOf(boat));
  return { hull: boat.hull, passage: { ship: c.ship, port: c.to.name },
    dial: helm ? { timeDial: helm.timeDial, timeScale: helm.timeScale, timeScaleIndex: helm.timeScaleIndex, timeScaleMax: helm.timeScaleMax } : null };
}
