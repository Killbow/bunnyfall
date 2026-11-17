// @ts-check
// CROMWARK COMBAT REWORK (2026-11-17): distinct monsters and dodgeable patterns
// replace blanket stat inflation, purple reskins, escalating haze damage and the
// old Greater Giants. Ordinary foes, elites and Unquiets remain supporting actors.
// Rings still govern geography and Dusk rewards. Camp, blight campaign and peaceful
// multiplayer remain. The Eltheric Ocean keeps its separate PvP and scaling laws.
// A leaf, shared by world, combat and relay code.

/** The switch: the mountains are Cromwark's reach (false - the old open PvP zone, every law as it was). */
export const CROMWARK_ON = true;
/** The mountains' kind (wildZone.js WILD_KIND - repeated here so this file imports nothing). */
export const CROMWARK_KIND = 'wroth';
/** Is the zone of this kind at peace between players (Cromwark's)? */
export const cromwarkPeace = (/** @type {string | null | undefined} */ kind) => CROMWARK_ON && kind === CROMWARK_KIND;

// ── THE HAZE'S COUNTER ──────────────────────────────────────────────────────────────────────────────────────────────
/** The ring the counter starts at (II, The Passes) - and the purple haze with it. */
export const HAZE_RING = 2;
/** Retired attrition counter; kept off while saved gear and camp rewards migrate. */
const HAZE_ENABLED = false;
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
      on = HAZE_ENABLED && ring >= HAZE_RING;
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
/** The counter's multiplier on the blows I take now - the world host's clock sets it each frame (scenes/cromwarkHost.js),
 *  the blows' tail reads it (combat/formulas.js, systems/effects.js). 1 outside the deep rings. */
let _hazeMult = 1, _inCromwark = false;
export const setCromwarkCombatHere = (on) => { _inCromwark = !!on; };
export const setHazeMult = (/** @type {number} */ m) => { _hazeMult = Number.isFinite(m) && m >= 1 ? m : 1; };
export const hazeMult = () => _hazeMult;

// ── RODNEY'S BLIGHT (net/blightLaw.js, systems/rodneyBlight.js) ─────────────────────────────────────────────────────
/** How much harder a foe strikes while the player stands in the blight (net/blightLaw.js BLIGHT_FOE_MULT - repeated
 *  here so this file stays a leaf). */
export const BLIGHT_FOE_MULT = 1.25;
/** The host's word on whether the player stands in the blight - asked at most every BLIGHT_PROBE_MS (it walks the edge). */
const BLIGHT_PROBE_MS = 500;
let _blightProbe = () => false, _blightAt = -Infinity, _blight = false;
export const setBlightProbe = (/** @type {() => boolean} */ fn) => { _blightProbe = typeof fn === 'function' ? fn : () => false; _blightAt = -Infinity; };
/** Whether the player stands in Rodney's blight now. */
export function blightHere() {
  const now = Date.now();
  if (now - _blightAt >= BLIGHT_PROBE_MS) { _blightAt = now; try { _blight = _blightProbe() === true; } catch { _blight = false; } }
  return _blight;
}
/** Every multiplier on a foe's blow at the player: the haze's counter, and the blight's. */
export const foeDamageMult = () => _inCromwark ? 1 : _hazeMult * (blightHere() ? BLIGHT_FOE_MULT : 1);
/** A foe's wash where the blight stands: Cromwark's purple on every hostile foe while the player is in it, or null. */
export const blightFoeTint = (/** @type {boolean} */ hostile) => (hostile && !_inCromwark && blightHere() ? CROMWARK_FOE_TINT : null);
/** The counter's words: "mm:ss" on it and the blows' share ("+75%"). */
export const hazeClockText = (/** @type {number} */ s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ── DUSK TOKENS ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** A kill's chance of a Dusk Token, by ring (I the Foothills to IV the Heart). */
export const NYX_COIN_CHANCE = Object.freeze([0.01, 0.03, 0.06, 0.12]);
/** Selantha's Ring: +1% on every ring. */
export const NYX_RING_LUCK = 0.01;
export const nyxCoinChance = (/** @type {number} */ ring, luck = 0) => (ring >= 1 ? (NYX_COIN_CHANCE[Math.min(4, ring | 0) - 1] ?? 0) + Math.max(0, luck) : 0);

// ── THE GUILD CAMP ──────────────────────────────────────────────────────────────────────────────────────────────────
/** The owner's spot ("put it like in this corner here on the road"): the zone's south-east tip, where the road leaves
 *  the border for the city below it - as fractions (u, v) of the Wrothgarian Mountains' own box (wildZone.js WILD_CUT's
 *  frame), just outside the cut. The camp stands on the nearest road outside the zone (cromwarkCamp.js). */
export const CROMWARK_CAMP_UV = Object.freeze([0.735, 0.552]);
