// @ts-check
// SIFRIT (2026-11-13, the owner: "a custom enemy that we can spawn in with the spawn command or the events called Sifrit
// the Forbidden One ... same hp and behave like the first phase of the ketch final boss ... themed after necromancy, with
// purple effects and constantly summoning mummies, boss bar on top of her", then "match her to about 4 players in that
// fight, she should be a tough opponent, the aoes should damage a lot more"): SIFRIT'S NUMBERS - a LEAF (imports nothing:
// ai/blowShapes.js, the ground's pass and the relay's bundle read it).
//
// WHAT SHE IS: a custom enemy (id SIFRIT_ID, a monster id past the Enemy Expansion's - systems/sifrit/sifritInstall.js puts
// her row, her sprite and her name in the tables), an elite mini boss of staff's own kind underneath (promoteStaffBoss:
// unshakeable, hard, her name her own), her outline PURPLE. She throws the Tonal Warden's first phase's three blows - the
// Keel-Strike's lane, the Steam Lash's cone, the Tonal Ring - as the overworld's own telegraphed blows (ai/foeBlows.js, each
// seen by every peer and judged on their own feet) in a necromancer's purple, far larger and far harder than a foe's, and
// calls mummies about her without end (systems/sifrit/sifritFight.js).
// Design: bible/12-Enhanced-AI/Sifrit.md.

/** Her MobileTypes number: a monster's (trunc(id / 128) even - characters/enemy/enemyBasics.js isMonsterId), past the
 *  Enemy Expansion's 256-290 and 384-398, inside the event law's STAFF_EVENT_KIND_MAX. */
export const SIFRIT_ID = 3072;
export const SIFRIT_NAME = 'Sifrit the Forbidden One';
/** The classic Mummy (MobileTypes 19): her career and corpse are its, and her summons. */
export const SIFRIT_MUMMY = 19;

/**
 * HER HEALTH: the Tonal Warden's whole - net/ketch/ketchWarden.js KW_TTK_S (600) seconds of a fighter's reference damage
 * (net/gate/gateBrain.js dpsRef: 5 + level) for each fighter - for FOUR fighters of level 30. A staff event's own `hp` or
 * `bh` never lowers it (she is made first).
 */
export const SIFRIT_FIGHTERS = 4;
export const SIFRIT_REF_LEVEL = 30;
export const SIFRIT_HP = SIFRIT_FIGHTERS * 600 * (5 + SIFRIT_REF_LEVEL);
/** Her size, percent of her sprite's (promoteStaffBoss clamps 150-300). */
export const SIFRIT_SIZE_PCT = 170;

/** The purple of her blows, her outline and her mummies' rising (RGB 0-1). */
export const SIFRIT_PURPLE = Object.freeze([0.66, 0.22, 0.98]);
/** Her blows' weight over a foe's own shape's (ai/blowShapes.js BLOW's mult): the owner's "aoes damage a lot more". */
export const SIFRIT_BLOW_X = 2.5;

/**
 * HER THREE BLOWS, by the shape they ride (ai/blowShapes.js): its new geometry (metres; `halfArc` radians), at least this
 * long a wind-up (seconds - a lane 26 m long wants room to be left), and its name. The Warden's phase one, rung for rung:
 *   lunge - the lane, 26 m down her facing (the Keel-Strike) - here DEATH'S LANE;
 *   sweep - a cone 150 degrees across (the Steam Lash) - here the SOUL LASH, 15 m;
 *   ring  - the disc about her and the wave rolling out of it to 20 m (the Tonal Ring) - here the GRAVE RING: safe at her
 *           feet inside 5 m and outside 20 m.
 */
export const SIFRIT_BLOWS = Object.freeze({
  lunge: Object.freeze({ name: "Death's Lane", dim: Object.freeze({ len: 26, halfW: 2.4 }), windup: 1.7 }),
  sweep: Object.freeze({ name: 'Soul Lash', dim: Object.freeze({ r: 15, halfArc: (75 * Math.PI) / 180 }), windup: 1.6 }),
  ring: Object.freeze({ name: 'Grave Ring', dim: Object.freeze({ rIn: 5, rOut: 20 }), windup: 2.3 }),
});

/** HER MUMMIES: every SIFRIT_SUMMON_EVERY_S seconds of a fight she calls SIFRIT_SUMMON_N of them about her, never more than
 *  SIFRIT_SUMMONS_MAX standing of hers at once (a quarter faster under half her health). They stand SIFRIT_SUMMON_RING m off. */
export const SIFRIT_SUMMON_EVERY_S = 9;
export const SIFRIT_SUMMON_N = 2;
export const SIFRIT_SUMMONS_MAX = 8;
export const SIFRIT_SUMMON_RING = [4, 9];

/** Where she is the sprite: its archive (a stand-in no TEXTURE file carries), records 0-24 (every pose the table asks of a
 *  mobile) of one frame each - the picture is the one she has. */
export const SIFRIT_ARCHIVE = 1700;
export const SIFRIT_RECORDS = 25;
