// @ts-check
// Leaf module with no imports, so inventory.js and arrowFlight.js can both import it without a cycle.

/** @type {{ list: any[], shots: Map<number, number> } | null} */
let watching = null;

/** @param {any[] | null | undefined} list */
export function startShotTally(list) {
  watching = Array.isArray(list) ? { list, shots: new Map() } : null;
}

export function stopShotTally() {
  const w = watching;
  watching = null;
  return w ? w.shots : null;
}

export const shotTallyOpen = () => watching !== null;

/**
 * @param {any[] | null | undefined} list
 * @param {number} template
 */
export function noteShot(list, template) {
  if (watching && list === watching.list) watching.shots.set(template, (watching.shots.get(template) ?? 0) + 1);
}

/** @param {number} template */
export function noteShotRecoverable(template) {
  if (watching) watching.shots.set(template, Math.max(0, (watching.shots.get(template) ?? 0) - 1));
}
