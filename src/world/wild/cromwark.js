// @ts-check

export const CROMWARK_ON = true;
export const CROMWARK_KIND = 'wroth';
export const cromwarkPeace = (/** @type {string | null | undefined} */ kind) => CROMWARK_ON && kind === CROMWARK_KIND;

export const HAZE_RING = 2;
const HAZE_ENABLED = false;
export const HAZE_STEP = 0.25;
export const HAZE_STEP_S = 60;
export const HAZE_CSS = '#b46cff';
export const HAZE_RGBA = Object.freeze([0.71, 0.42, 1, 1]);
export const CROMWARK_BORDER_CSS = '#9b4dff';
export const CROMWARK_BORDER_RGBA = Object.freeze([0.61, 0.3, 1, 1]);

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
export const CROMWARK_FOE_TINT = Object.freeze([0.82, 0.56, 1]);
let _hazeMult = 1, _combatRing = 0;
export const setCromwarkCombatHere = (on, ring = 1) => { _combatRing = on ? ring : 0; };
export const cromwarkCombatRing = () => _combatRing;
export const setHazeMult = (/** @type {number} */ m) => { _hazeMult = Number.isFinite(m) && m >= 1 ? m : 1; };
export const hazeMult = () => _hazeMult;

export const BLIGHT_FOE_MULT = 1.25;
const BLIGHT_PROBE_MS = 500;
let _blightProbe = () => false, _blightAt = -Infinity, _blight = false;
export const setBlightProbe = (/** @type {() => boolean} */ fn) => { _blightProbe = typeof fn === 'function' ? fn : () => false; _blightAt = -Infinity; };
export function blightHere() {
  const now = Date.now();
  if (now - _blightAt >= BLIGHT_PROBE_MS) { _blightAt = now; try { _blight = _blightProbe() === true; } catch { _blight = false; } }
  return _blight;
}
export const CORRUPT_FOE_MULT = 1.15;
let _corruptProbe = () => false, _corruptAt = -Infinity, _corrupt = false, _edInside = false;
export const setCorruptProbe = (/** @type {() => boolean} */ fn) => { _corruptProbe = typeof fn === 'function' ? fn : () => false; _corruptAt = -Infinity; };
export const setEliteDungeonInside = (/** @type {boolean} */ on) => { _edInside = on === true; };
export function corruptHere() {
  const now = Date.now();
  if (now - _corruptAt >= BLIGHT_PROBE_MS) { _corruptAt = now; try { _corrupt = _corruptProbe() === true; } catch { _corrupt = false; } }
  return _corrupt;
}
export const foeDamageMult = () => _combatRing ? 1 : _hazeMult * (blightHere() ? BLIGHT_FOE_MULT : 1) * (corruptHere() ? CORRUPT_FOE_MULT : 1);
export const blightFoeTint = (/** @type {boolean} */ hostile) => (hostile && !_combatRing && (_edInside || blightHere() || corruptHere()) ? CROMWARK_FOE_TINT : null);
export const hazeClockText = (/** @type {number} */ s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export const NYX_COIN_CHANCE = Object.freeze([0.01, 0.03, 0.06, 0.12]);
export const NYX_RING_LUCK = 0.01;
export const nyxCoinChance = (/** @type {number} */ ring, luck = 0) => (ring >= 1 ? (NYX_COIN_CHANCE[Math.min(4, ring | 0) - 1] ?? 0) + Math.max(0, luck) : 0);

export const CROMWARK_CAMP_UV = Object.freeze([0.735, 0.552]);
