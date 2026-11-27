// @ts-check
// No imports, so clanLaw.js can read the hunts without the Courts' state, which masquerade.js writes.

/** @type {Set<number>} */
let _hunts = new Set();
/** @param {Iterable<number>} clans */
export function setHunts(clans) { _hunts = new Set(clans); }
/** @param {number} clan */
export const huntedBy = (clan) => _hunts.has(clan);
