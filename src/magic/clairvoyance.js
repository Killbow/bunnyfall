// @ts-check
// Clairvoyance probe, a leaf so the quest guide can ask it without the spell system's import graph. The cast engine
// sets the answer.

let _clairvoyant = () => false;
export function setClairvoyanceProbe(/** @type {() => boolean} */ fn) { _clairvoyant = typeof fn === 'function' ? fn : () => false; }
export const clairvoyantNow = () => { try { return !!_clairvoyant(); } catch { return false; } };
