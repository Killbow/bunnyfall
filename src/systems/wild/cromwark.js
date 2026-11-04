// @ts-check
// BUNNYFALL (2026-11-04, the owner's "first big world change"): THE SORCERER OF CROMWARK. The Wrothgarian Mountains stop
// being the open PvP zone (systems/wild/wildZone.js, WILD1) and become Rodney's ruined reach: the land about the castle
// that Nyxaratah's barrier seals, at the zone's very middle. The owner's words, asked:
//   - "removing the pvp aspect and instead changing how it works to be less of a resource farm area and more of a
//     dangerous place": no fights between players, no remains, no strangers, no loot bonus by ring; the rings keep their
//     foes' strength (four times, and the ring's share on top), so the heart is the hardest.
//   - "everyone still shares the area and dying sends you OUTSIDE of the zone".
//   - "once you get into the deeper zones a counter in purple appears on the screen, terrain and enemies in this are all
//     should have a purple haze, each minute the enemies deal more damage to you" - from ring II, +25% a minute, reset on
//     leaving the deep rings.
//   - "a 1% chance to drop a Nyx coin when killing enemies in there and the chance increases when going in the middle" -
//     1 / 3 / 6 / 12% by ring.
//   - "every village and settlement in the area is a desolated mess": no townsfolk, shops, guards or quest givers.
//   - "the border should be purple to reflect the change".
// The Eltheric Ocean's open sea (systems/wild/etherWild.js) is another ground and stays an open PvP zone: every law here
// reads the mountains' kind alone.
//
// A LEAF: no imports, so wildZone.js (itself a leaf) and every host can read it.

/** The switch: the mountains are Cromwark's reach (false - the old open PvP zone, every law as it was). */
export const CROMWARK_ON = true;
/** The mountains' kind (wildZone.js WILD_KIND - repeated here so this file imports nothing). */
export const CROMWARK_KIND = 'wroth';
/** Is the zone of this kind at peace between players (Cromwark's)? */
export const cromwarkPeace = (/** @type {string | null | undefined} */ kind) => CROMWARK_ON && kind === CROMWARK_KIND;

// ── THE HAZE'S COUNTER ──────────────────────────────────────────────────────────────────────────────────────────────
/** The ring the counter starts at (II, The Passes) - and the purple haze with it. */
export const HAZE_RING = 2;
/** Each whole minute on the counter, foes' blows on me grow by this much (+25%). */
export const HAZE_STEP = 0.25;
export const HAZE_STEP_S = 60;
/** The counter's purple (CSS and RGBA). */
export const HAZE_CSS = '#b46cff';
export const HAZE_RGBA = Object.freeze([0.71, 0.42, 1, 1]);
/** The border's purple on the maps (was the open zone's red). */
export const CROMWARK_BORDER_CSS = '#9b4dff';
export const CROMWARK_BORDER_RGBA = Object.freeze([0.61, 0.3, 1, 1]);

/** The counter's clock: `frame(ring, dt)` each frame with the ring I stand in (0 outside), `seconds` on it, `mult` the
 *  blows' multiplier now (1 outside the deep rings). Leaving the deep rings, or dying, resets it. */
export function createHazeClock() {
  let s = 0, on = false;
  return {
    frame(/** @type {number} */ ring, /** @type {number} */ dt) {
      on = ring >= HAZE_RING;
      if (!on) { s = 0; return; }
      if (dt > 0 && dt < 5) s += dt;
    },
    reset() { s = 0; },
    get on() { return on; },
    get seconds() { return s; },
    get minutes() { return Math.floor(s / HAZE_STEP_S); },
    get mult() { return on ? 1 + HAZE_STEP * Math.floor(s / HAZE_STEP_S) : 1; },
  };
}
/** "the monsters are the game base creatures but with a purple style": the wash a foe of the mountains is drawn in (a
 *  billboard batch's `tint`, a multiply - render/renderer.js uBatchTint). */
export const CROMWARK_FOE_TINT = Object.freeze([0.82, 0.56, 1]);
/** The wash for this foe (`kind` the zone the player stands in), or null. */
export const cromwarkFoeTint = (/** @type {any} */ entity, /** @type {string | null | undefined} */ kind) => (entity?.wildFoe && cromwarkPeace(kind) ? CROMWARK_FOE_TINT : null);
/** The counter's multiplier on the blows I take now - the world host's clock sets it each frame (scenes/cromwarkHost.js),
 *  the blows' tail reads it (combat/formulas.js, systems/effects.js). 1 outside the deep rings. */
let _hazeMult = 1;
export const setHazeMult = (/** @type {number} */ m) => { _hazeMult = Number.isFinite(m) && m >= 1 ? m : 1; };
export const hazeMult = () => _hazeMult;
/** The counter's words: "mm:ss" on it and the blows' share ("+75%"). */
export const hazeClockText = (/** @type {number} */ s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ── NYX COINS ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** A kill's chance of a Nyx coin, by ring (I the Foothills to IV the Heart). */
export const NYX_COIN_CHANCE = Object.freeze([0.01, 0.03, 0.06, 0.12]);
/** Selantha's Ring: +1% on every ring. */
export const NYX_RING_LUCK = 0.01;
export const nyxCoinChance = (/** @type {number} */ ring, luck = 0) => (ring >= 1 ? (NYX_COIN_CHANCE[Math.min(4, ring | 0) - 1] ?? 0) + Math.max(0, luck) : 0);

// ── THE GUILD CAMP ──────────────────────────────────────────────────────────────────────────────────────────────────
/** The owner's spot ("put it like in this corner here on the road"): the zone's south-east tip, where the road leaves
 *  the border for the city below it - as fractions (u, v) of the Wrothgarian Mountains' own box (wildZone.js WILD_CUT's
 *  frame), just outside the cut. The camp stands on the nearest road outside the zone (cromwarkCamp.js). */
export const CROMWARK_CAMP_UV = Object.freeze([0.735, 0.552]);
