// Crossbow ids only, with no imports, so weapons.js, equip.js, fpsWeapon.js, and crossbow.js read them without a cycle.

export const CROSSBOW_TEMPLATE = 563;

export const CROSSBOW_DAMAGE_MULT = 1.6;
export const CROSSBOW_COOLDOWN_MULT = 2;
export const CROSSBOW_SPAN = Object.freeze({ min: Math.round(5 * CROSSBOW_DAMAGE_MULT), max: Math.round(19 * CROSSBOW_DAMAGE_MULT) });
export const CROSSBOW_EQUIP_DELAY = 5000;

export const isCrossbowItem = (item) => item?.templateIndex === CROSSBOW_TEMPLATE;
