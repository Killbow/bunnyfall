// @ts-check
// BUNNYFALL VAMPIRE EXPANSION, PHASE 3: WHICH COURTS HUNT THE PLAYER - a leaf (no imports), so the clans' law
// (clanLaw.js) can ask it without pulling in the Courts' state (masquerade.js writes it).

/** @type {Set<number>} */
let _hunts = new Set();
/** The Courts (clan ids) whose Blood Hunt is on the player now. @param {Iterable<number>} clans */
export function setHunts(clans) { _hunts = new Set(clans); }
/** Whether a clan's Court hunts the player. @param {number} clan */
export const huntedBy = (clan) => _hunts.has(clan);
