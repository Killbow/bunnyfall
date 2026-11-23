// @ts-check
// BUNNY-SPELLS: CLAIRVOYANCE'S PROBE - a leaf, so the quest guide (systems/quest/questGuidance.js) can ask it without the
// spell system's import graph. The cast engine (scenes/hostMagic.js), which holds the player's entity, answers.

let _clairvoyant = () => false;
/** The cast engine's answer. */
export function setClairvoyanceProbe(/** @type {() => boolean} */ fn) { _clairvoyant = typeof fn === 'function' ? fn : () => false; }
/** Is the player clairvoyant now? */
export const clairvoyantNow = () => { try { return !!_clairvoyant(); } catch { return false; } };
