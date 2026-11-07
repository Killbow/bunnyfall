// BUNNYFALL: THE CROSSBOW'S NUMBERS and nothing else, no imports (a leaf, as thunderlockIds.js is): characters/weapons.js,
// characters/equipTable.js and combat/fpsWeapon.js all ask them and cannot import the weapon's home without a cycle.

/** The custom template index (past the guns' 560-562, past DFU's 288). */
export const CROSSBOW_TEMPLATE = 563;

/** A crossbow is a bow that hits harder and cycles slower. Its damage is the Long Bow's span times DAMAGE_MULT (5-19
 *  becomes 8-30); its cooldown after a shot is the bow's times COOLDOWN_MULT. Turn these two to tune it. */
export const CROSSBOW_DAMAGE_MULT = 1.6;
export const CROSSBOW_COOLDOWN_MULT = 2;
export const CROSSBOW_SPAN = Object.freeze({ min: Math.round(5 * CROSSBOW_DAMAGE_MULT), max: Math.round(19 * CROSSBOW_DAMAGE_MULT) });
export const CROSSBOW_EQUIP_DELAY = 5000;

export const isCrossbowItem = (item) => item?.templateIndex === CROSSBOW_TEMPLATE;
