// @ts-check
// A leaf with no imports: the blow shapes, the ground pass, and the relay bundle read it.

// A monster id (trunc(id / 128) is even), past the Enemy Expansion's ids and within STAFF_EVENT_KIND_MAX.
export const SIFRIT_ID = 3072;
export const SIFRIT_NAME = 'Sifrit the Forbidden One';
export const SIFRIT_MUMMY = 19;

export const SIFRIT_FIGHTERS = 4;
export const SIFRIT_REF_LEVEL = 30;
// The Tonal Warden's 600-second time to kill at a fighter's reference damage (5 + level), for four fighters.
export const SIFRIT_HP = SIFRIT_FIGHTERS * 600 * (5 + SIFRIT_REF_LEVEL);
// Her picture is 214 px tall, 5.35 m drawn whole, so 34% matches a player's 1.8 m.
export const SIFRIT_SIZE_PCT = 34;

/**
 * @param {any} entity
 * @param {number} damage
 */
export const sifritTitanDamage = (entity, damage) => entity?.sifrit && entity.maxHealth > 0 ? Math.min(damage, Math.max(1, Math.ceil(entity.maxHealth / 4))) : damage;

// A kill that is no blow, such as Disintegrate or a drained stat, does nothing to her.
export const SIFRIT_IMMUNE_TEXT = "That won't work.";
/** @param {any} entity @param {boolean} whole */
export const sifritImmuneToKill = (entity, whole) => !!whole && !!entity?.sifrit;

export const SIFRIT_PURPLE = Object.freeze([0.66, 0.22, 0.98]);
export const SIFRIT_BLOW_X = 2.5;

export const SIFRIT_BLOWS = Object.freeze({
  lunge: Object.freeze({ name: "Death's Lane", dim: Object.freeze({ len: 26, halfW: 2.4 }), windup: 1.7 }),
  sweep: Object.freeze({ name: 'Soul Lash', dim: Object.freeze({ r: 15, halfArc: (75 * Math.PI) / 180 }), windup: 1.6 }),
  ring: Object.freeze({ name: 'Grave Ring', dim: Object.freeze({ rIn: 5, rOut: 20 }), windup: 2.3 }),
});

export const SIFRIT_SUMMON_EVERY_S = 9;
export const SIFRIT_SUMMON_N = 2;
export const SIFRIT_SUMMONS_MAX = 8;
export const SIFRIT_SUMMON_RING = [4, 9];

// A stand-in archive no TEXTURE file carries; records 0 to 24 cover every pose the tables ask of a mobile.
export const SIFRIT_ARCHIVE = 1700;
export const SIFRIT_RECORDS = 25;
