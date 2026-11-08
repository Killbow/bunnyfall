// @ts-check
// BUNNYFALL (2026-11-05, the owner: "another smaller event for lower level players, some sort of cannon being built in the
// empty area near Wayrest, this cannon requires metals and woods of multiple kinds and giving materials gives you coins
// (similar rate of the big combat area)"; asked: one shared build, ingots and planks, anyone, Nyx coins, and "it fires
// towards the Cromwark zone and then the build restarts"): THE GREAT CANNON'S LAW. Pure and shared: the game reads it to
// draw the build's window (scenes/cannonHost.js), the account service to keep the build and pay for it
// (server-account/src/cannon.js).

/** What one cannon takes: each kind of ingot and plank, and how many of it (material keys: net/nodeLaw.js). */
export const CANNON_NEED = Object.freeze({
  'ingot:iron': 300, 'ingot:steel': 200, 'ingot:silver': 100, 'ingot:dwarven': 50, 'ingot:mithril': 30, 'ingot:ebony': 15,
  'plank:pine': 300, 'plank:oak': 200, 'plank:cherry': 100, 'plank:teak': 50, 'plank:mahogany': 30, 'plank:ironwood': 15,
});
export const CANNON_KEYS = Object.freeze(Object.keys(CANNON_NEED));

/** What a unit of each is worth toward the Nyx coins: the material's own worth (net/nodeLaw.js `value`, 1 to 14). */
export const CANNON_VALUE = Object.freeze({
  'ingot:iron': 1, 'ingot:steel': 2, 'ingot:silver': 4, 'ingot:dwarven': 6, 'ingot:mithril': 9, 'ingot:ebony': 14,
  'plank:pine': 1, 'plank:oak': 2, 'plank:cherry': 4, 'plank:teak': 6, 'plank:mahogany': 9, 'plank:ironwood': 14,
});
/** A Nyx coin for every this much worth given (20 iron ingots, or under two of ebony): the reach's outer rings pay a coin
 *  in about a hundred kills, its heart in about ten, so a coin here costs about what a short hunt does. The rest is kept
 *  toward the next coin. */
export const CANNON_POINTS_PER_COIN = 20;
/** The most units one give may hand over. */
export const CANNON_GIVE_MAX = 100;
/** Each shot adds this to the realm's Nyx coin count (the owner's, 2026-11-06; server-account/src/nyx.js nyxTotal). */
export const CANNON_NYX_BONUS = 500;

/** The words for a key: 'Iron Ingots', 'Pine Planks'. */
export function cannonMaterialName(/** @type {string} */ key) {
  const [kind, wood] = String(key).split(':');
  const word = (wood ?? '').charAt(0).toUpperCase() + (wood ?? '').slice(1);
  return kind === 'ingot' ? `${word} Ingots` : kind === 'plank' ? `${word} Planks` : String(key);
}

/** A build's counts held to the law: every key, 0 to its need. */
export function cleanGot(/** @type {any} */ got) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const k of CANNON_KEYS) out[k] = Math.max(0, Math.min(CANNON_NEED[k], Math.trunc(Number(got?.[k]) || 0)));
  return out;
}
/** Is the build whole? */
export const cannonWhole = (/** @type {any} */ got) => CANNON_KEYS.every((k) => (Number(got?.[k]) || 0) >= CANNON_NEED[k]);
/** How far along, 0 to 1. */
export function cannonShare(/** @type {any} */ got) {
  let have = 0, need = 0;
  for (const k of CANNON_KEYS) { need += CANNON_NEED[k]; have += Math.min(CANNON_NEED[k], Number(got?.[k]) || 0); }
  return need ? have / need : 0;
}
/** The coins `points` of worth pay, with what is carried over: `{ coins, rest }`. */
export function cannonCoins(/** @type {number} */ points) {
  const p = Math.max(0, Math.trunc(points) || 0);
  return { coins: Math.floor(p / CANNON_POINTS_PER_COIN), rest: p % CANNON_POINTS_PER_COIN };
}
