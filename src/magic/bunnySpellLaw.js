// @ts-check
// Bunnyfall's own spell effect types and numbers. A leaf with no imports, so the enemy motor and the carried weight
// can read it without the spell system's import graph.

export const METEOR_TYPE = 47, SLOW_TYPE = 48, CLAIRVOYANCE_TYPE = 49, RESCUE_TYPE = 50;
export const FEATHERWEIGHT_TYPE = 51, WALL_TYPE = 52, DECOY_TYPE = 53, WELL_TYPE = 54;
export const BUNNY_EFFECT_KEYS = Object.freeze([47, 48, 49, 50, 51, 52, 53, 54].map((t) => `${t},255`));

export const spellHas = (/** @type {any} */ sp, /** @type {number} */ type) => (sp?.effects ?? []).some((e) => e && e.type === type);

export const METEOR_HEIGHT_M = 60;
export const METEOR_KNOCKBACK = 40;
export const SLOW_FACTOR = 0.5;
export const FEATHERWEIGHT_FACTOR = 0.5;
export const RESCUE_REACH_M = 60;
export const RESCUE_SET_DOWN_M = 1.5;
// How long a rescue call stays on the party pose. The receiver reads it for a change, as it does a Resurrect.
export const RESCUE_HOLD_MS = 4000;
export const WALL_REACH_M = 12;
export const WALL_SIZE = Object.freeze({ w: 5, h: 3, d: 0.6 });
export const DECOY_REACH_M = 15;
export const DECOY_LURE_M = 25;
export const WELL_RADIUS_M = 9;
// The pull is the walk speed of a Speed 70 enemy (enemyMotor.js enemyMoveSpeed), the most common monster Speed.
export const WELL_PULL = 5.5;

