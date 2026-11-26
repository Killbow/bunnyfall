// Classic Daggerfall does not draw a concealed enemy, and the classic skin keeps that. The enhanced skin draws one
// with these looks; the concealment rules themselves are unchanged.
import { isEnhanced } from '../ui/uiSkin.js';
import { getPref } from '../ui/uiPrefs.js';
import { concealmentFlags, isMagicallyConcealed } from '../magic/effects.js';
import {
  BLEND_ALPHA, BLEND_SHIMMER, BLEND_HZ, SHADE_ALPHA, SHADE_DARK, REVEAL_SECONDS, REVEAL_ALPHA,
} from '../render/concealDraw.js';
import { pageParam } from '../platform/pageQuery.js';
import { crowdKinHidden } from '../net/gateCrowd.js';

// The constants live in render/concealDraw.js so the renderer can read them without this module's imports.
export {
  BLEND_ALPHA, BLEND_SHIMMER, BLEND_HZ, SHADE_ALPHA, SHADE_DARK, REVEAL_SECONDS, REVEAL_ALPHA,
};
export const CONCEAL_MODE = Object.freeze({ blend: 1, shade: 2, reveal: 3 });

export function combatVisualsOn(search = globalThis.location?.search ?? '', pref = getPref('enhancedCombatVisuals')) {
  if (pageParam('combatvisuals', search) === 'off') return false;
  return isEnhanced(search) && !!pref;
}

/**
 * @param {{invisible?: boolean, blending?: boolean, shade?: boolean}} flags
 * @param {{t: number, hitAt?: number, phase?: number}} clock
 * @returns {null | {mode: number, alpha: number, t: number, phase: number}}
 */
export function concealVisual(flags, { t, hitAt = -Infinity, phase = 0 }) {
  const { invisible = false, blending = false, shade = false } = flags ?? {};
  if (!invisible && !blending && !shade) return null;
  // The shader ripple puts t * 7 inside sin, so wrapping t to one turn keeps float32 precision without changing it.
  const tz = t % (2 * Math.PI);
  const since = t - hitAt;
  if (since >= 0 && since < REVEAL_SECONDS) {
    return { mode: CONCEAL_MODE.reveal, alpha: REVEAL_ALPHA * (1 - since / REVEAL_SECONDS), t: tz, phase };
  }
  if (invisible) return null;
  if (blending) {
    return { mode: CONCEAL_MODE.blend, alpha: BLEND_ALPHA + BLEND_SHIMMER * Math.sin(2 * Math.PI * BLEND_HZ * t + phase), t: tz, phase };
  }
  return { mode: CONCEAL_MODE.shade, alpha: SHADE_ALPHA, t: tz, phase };
}

/**
 * @param {{entity: object, _ecvHit?: number, _ecvPhase?: number}} foe
 * @returns {{kind: 'plain'} | {kind: 'hidden'} | {kind: 'conceal', visual: object}}
 */
export function foeDraw(foe, on, t) {
  if (crowdKinHidden(foe)) return HIDDEN;
  if (!isMagicallyConcealed(foe.entity)) return PLAIN;
  if (!on) return HIDDEN;
  const visual = concealVisual(concealmentFlags(foe.entity), { t, hitAt: foe._ecvHit ?? -Infinity, phase: foePhase(foe) });
  return visual ? { kind: 'conceal', visual } : HIDDEN;
}
const PLAIN = Object.freeze({ kind: 'plain' });
const HIDDEN = Object.freeze({ kind: 'hidden' });

export function markConcealedHit(foe, t) {
  foe._ecvHit = t;
}

export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
// Phases come from a counter on the golden angle so the classic lane's Math.random sequence is untouched.
let _phaseCount = 0;
export function foePhase(foe) {
  if (foe._ecvPhase === undefined) foe._ecvPhase = (_phaseCount++ * GOLDEN_ANGLE) % (2 * Math.PI);
  return foe._ecvPhase;
}

/**
 * @param {number} bits
 * @param {boolean} on
 * @param {number} t
 * @param {string} id
 * @returns {{kind: 'plain'} | {kind: 'hidden'} | {kind: 'conceal', visual: object}}
 */
export function peerDraw(bits, on, t, id) {
  const b = bits & 7;
  if (!b) return PLAIN;
  if (!on) return HIDDEN;
  // A peer's invisibility draws as the blend shimmer, while an invisible enemy stays hidden.
  return { kind: 'conceal', visual: concealVisual({ blending: (b & 3) !== 0, shade: (b & 4) !== 0 }, { t, phase: peerPhase(id) }) };
}

export function peerPhase(id) {
  const s = String(id ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return ((h >>> 0) * GOLDEN_ANGLE) % (2 * Math.PI);
}
