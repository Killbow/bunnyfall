// @ts-check
// BUNNY-SPELLS: THE LAW OF BUNNYFALL'S OWN EFFECTS - their types and their numbers. A leaf (it imports nothing), so the
// foe's motor and the carried weight read it without the spell system's import graph. What each effect does is told in
// systems/spell/bunnySpells.js.

export const METEOR_TYPE = 47, SLOW_TYPE = 48, CLAIRVOYANCE_TYPE = 49, RESCUE_TYPE = 50;
export const FEATHERWEIGHT_TYPE = 51, WALL_TYPE = 52, DECOY_TYPE = 53, WELL_TYPE = 54;
/** Every one of them, as their classic keys. */
export const BUNNY_EFFECT_KEYS = Object.freeze([47, 48, 49, 50, 51, 52, 53, 54].map((t) => `${t},255`));

/** Whether a spell carries an effect of `type`. */
export const spellHas = (/** @type {any} */ sp, /** @type {number} */ type) => (sp?.effects ?? []).some((e) => e && e.type === type);

/** Meteor: how high above the spot it falls from, metres, and how hard its burst throws a foe (classic knockback units). */
export const METEOR_HEIGHT_M = 28;
export const METEOR_KNOCKBACK = 40;
/** Slow: the share of its speed a slowed foe keeps. */
export const SLOW_FACTOR = 0.5;
/** Featherweight: the share of the carried weight that counts. */
export const FEATHERWEIGHT_FACTOR = 0.5;
/** Rescue: how far it reaches, metres, and how near the caster the rescued one is set down. */
export const RESCUE_REACH_M = 60;
export const RESCUE_SET_DOWN_M = 1.5;
/** How long a rescue call stands on the party pose (the receiver reads it for change, as a Resurrect's). */
export const RESCUE_HOLD_MS = 4000;
/** Wall of Earth: how far ahead it may rise, and its size (width across the aim, height, thickness), metres. */
export const WALL_REACH_M = 12;
export const WALL_SIZE = Object.freeze({ w: 5, h: 3, d: 0.6 });
/** Decoy: how far ahead it may stand, and how far about it the foes are drawn to it, metres. */
export const DECOY_REACH_M = 15;
export const DECOY_LURE_M = 25;
/** Gravity Well: how far it reaches, metres, and how hard it pulls (knockback units a frame, toward its centre). */
export const WELL_RADIUS_M = 9;
export const WELL_PULL = 6;

