// @ts-check
// A spell in the free hand beside a one-handed weapon. Classic Daggerfall hides the weapon for a readied spell;
// here the weapon swings on the swing button, the spell casts on its own press, and the hands take turns.

import { dualEligible, otherHand, GUARD } from './handsLaw.js';
import { spellHandRects, RIGHT_HAND_UV } from '../fpsSpellCasting.js';
import { weaponOffsetHeight } from '../../ui/hudLarge.js';

/** @typedef {import('./handsLaw.js').HandDesc} HandDesc */

/**
 * @param {{ lead?: 'R'|'L', right?: HandDesc, left?: HandDesc, leftBusy?: boolean }} hands
 * @returns {{ weaponHand: 'R'|'L', spellHand: 'R'|'L' } | null}
 */
export function spellHandOf({ lead = 'R', right = null, left = null, leftBusy = false } = {}) {
  if (leftBusy) return null;
  const weaponHand = lead === 'L' ? 'L' : 'R', spellHand = otherHand(weaponHand);
  const weapon = weaponHand === 'R' ? right : left, free = spellHand === 'R' ? right : left;
  if (!dualEligible(weapon)) return null;
  if (free?.item) return null;
  return { weaponHand, spellHand };
}

// One record for the player's one pair of hands: whichever host's rig steps the frame writes it.
const live = { up: false, fits: false, busy: false, pending: false };
export const spellHandUp = () => live.up;
export const spellHandBusy = () => (live.up || live.fits) && live.busy;
// While a cast waits, the rig starts no new blow, so a held swing button never starves the cast.
export const castPending = () => live.pending;
export function tellSpellHand({ up = false, fits = false, busy = false } = {}) { live.up = !!up; live.fits = !!fits || !!up; live.busy = !!busy; }
// One shared frozen value, so no host adds its own entry for it.
export const CAST_PRESS = Object.freeze({ cast: true });
export function tellCastPending(on) { live.pending = !!on; }
export function _resetSpellHand() { live.up = false; live.fits = false; live.busy = false; live.pending = false; }

/**
 * @param {any} renderer
 * @param {{ width: number, height: number }} canvas
 * @param {any} art
 * @param {number} frameIndex
 * @param {{ side?: 'left'|'right', tint?: number[] | null, offsetHeight?: number, guard?: number }} [o]
 */
export function drawSpellHand(renderer, canvas, art, frameIndex, { side = 'left', tint = null, offsetHeight = weaponOffsetHeight(), guard = 0 } = {}) {
  if (!renderer || !canvas || !art || frameIndex < 0) return false;
  const rec = art.records[frameIndex];
  if (!rec || !rec.width || !rec.height) return false;
  const rects = spellHandRects(canvas, rec, { frameIndex, element: art.element, offsetHeight });
  const r = side === 'right' ? rects.right : rects.left;
  renderer.drawScreenQuad(rec.tex, { ...r, y: r.y + guardDrop(guard, r.h) }, side === 'right' ? RIGHT_HAND_UV : undefined, tint ?? undefined);
  return true;
}

// Uses GUARD.LOWER, the share a pair's resting weapon lowers by, so both hands lower alike.
export const guardDrop = (g, h) => (g > 0 && h > 0 ? g * GUARD.LOWER * h : 0);
