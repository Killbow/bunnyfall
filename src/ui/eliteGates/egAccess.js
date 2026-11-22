// @ts-check
// EG-G1 (2026-10-12, Mac: "I said I want everything"; bible/11-Multiplayer/Elite-Gates.md section 25.7): THE SPIRE'S
// ACCESSIBILITY - three of the port's own rows on the prefs shelf (systems/uiPrefs.js), drawn under Settings >
// Accessibility (ui/settings/settingsMap.js), and the law that reads them - the one home of each (EG-G2's look reads them here):
//   `port:dangerPalette` - Standard, High contrast, Deutan-Protan, Tritan: the danger edge, the safety gold and the place's
//     white hazard each its preset's colour. High contrast draws the danger edge magenta ([1.0, 0.15, 0.75]) with a double
//     keyline and a hatch, safety a solid white-gold and the hazard cyan; the two colour-blind presets are pinned to
//     separate under simulation (`egCvd` - Machado, Oliveira and Fernandes 2009 at full severity, in linear light,
//     measured in CIELAB). The colours ride the Spire's telegraph stage's `uEdgeCol` and `uColor`, its keyline and hatch
//     the stage's style bit (render/gate/gateTelegraph.js TELEGRAPH_FS_SPIRE; world/eliteGates/egLook.js egPaletteBits), laid on each
//     frame's shapes by scenes/eliteGates/egFight.js egLookShapes;
//   `port:telegraphFill` - a danger fill's light, 50-100%: the stage's `uFillK`, the line left whole;
//   (`port:allyEffects` - Full or Quiet, THE QUIET COMPANY's allies' hit numbers - is not on the shelf: the port draws
//     only the player's own numbers (ui/hitNumbers.js), so the row would govern nothing);
//   `port:reducedMotion` - the system's `prefers-reduced-motion` or this row: the count chip's pulse, the gains' flight
//     and the arrival card's rise stand still (ui/eliteGates/egSpireHud.js), the gate's title cards with them - a lord's wake, its
//     FELLED, THE FALL's card, their rule's sweep (ui/gate/gateTitleCard.js, AUDIT EG V c L7-17) - and the stair is a plain
//     cut. The absent's ring still drains: it is a count, not a motion.
// The larger HUD is the port's own `--hud-scale` (port:hudScale), which every part of the Spire's HUD reads; the beats'
// words go to a polite live region for a screen reader.
//
// Not a DFU member. Ledger A (ELITE-GATES).
import { getPref } from '../uiPrefs.js';
import { EG_DANGER_PALETTES, EG_DANGER_PALETTE_KEYS, egPaletteOf } from '../../world/eliteGates/egDangerPalettes.js';

export { EG_DANGER_PALETTES, EG_DANGER_PALETTE_KEYS, egPaletteOf };

/** A danger fill's light at least, at most (section 25.7: 50-100%). */
export const EG_FILL_MIN = 0.5;
export const EG_FILL_MAX = 1;
/** The shelf's keys (systems/uiPrefs.js PREF_DEFAULTS). */
export const EG_ACCESS_PREFS = Object.freeze({ palette: 'dangerPalette', fill: 'telegraphFill', motion: 'reducedMotion' });
/** A fill's light, clamped to 50-100% (100% for anything not a number). */
export const egFillOf = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.min(EG_FILL_MAX, Math.max(EG_FILL_MIN, n)) : EG_FILL_MAX; };
/** Whether the screen should stand still: the row, or the system's setting (`win` a window-like - its query asked once
 *  and kept, the frame reading the kept answer). */
const motionQuery = new WeakMap();
export function egReducedMotion(win = globalThis.window, pref = getPref(EG_ACCESS_PREFS.motion)) {
  if (pref === true) return true;
  if (!win || typeof win !== 'object') return false;
  try {
    if (!motionQuery.has(win)) motionQuery.set(win, win.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null);
    return !!motionQuery.get(win)?.matches;
  } catch { return false; }
}
/** The three settings as the draws read them now: `{ palette, fill, still }`. */
export function egAccessNow(win = globalThis.window) {
  return { palette: egPaletteOf(getPref(EG_ACCESS_PREFS.palette)), fill: egFillOf(getPref(EG_ACCESS_PREFS.fill)), still: egReducedMotion(win) };
}

// ── EG-ZG: THE QUIET COMPANY'S ALLIES (section 25.4) ────────────────────────────────────────────────────────────
/** How this screen draws another player's spell effects now: `{ alpha, glow }` while the Spire's client says a trial quiets
 *  them (scenes/eliteGates/egClient.js - world/eliteGates/egLook.js egQuietCompany's 60% and no light of their own), or null - as they always
 *  were. The one seam the spell engine every host shares reads (scenes/hostMagic.js: a peer's casting effects, bolt,
 *  missile and flash at the share, none of its light); `port:allyEffects` governs allies' hit numbers alone, which the port
 *  never draws. */
let allyLookFn = null;
/** The Spire's client's word (null: none). */
export function egAllyLookSet(fn) { allyLookFn = typeof fn === 'function' ? fn : null; }
/** The quiet share now, or null (no word, or a word of nothing quieted - full and lit). */
export function egAllyLook() {
  let q = null;
  try { q = allyLookFn?.() ?? null; } catch { q = null; }
  return q && (q.alpha < 1 || q.glow < 1) ? q : null;
}

// ── the simulation the colour-blind presets are pinned under ──────────────────────────────────────────────────
/** Machado, Oliveira and Fernandes (2009), severity 1.0, on linear RGB. */
export const EG_CVD = Object.freeze({
  protan: Object.freeze([0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998]),
  deutan: Object.freeze([0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881]),
  tritan: Object.freeze([1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039]),
});
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** A display colour seen under `kind` (null: as it is), in CIELAB (D65). */
export function egCvd(rgb, kind = null) {
  let l = rgb.map(toLinear);
  const m = kind ? EG_CVD[kind] : null;
  if (m) l = [0, 1, 2].map((i) => Math.min(1, Math.max(0, m[i * 3] * l[0] + m[i * 3 + 1] * l[1] + m[i * 3 + 2] * l[2])));
  const X = 0.4124 * l[0] + 0.3576 * l[1] + 0.1805 * l[2], Y = 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2], Z = 0.0193 * l[0] + 0.1192 * l[1] + 0.9505 * l[2];
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const fx = f(X / 0.95047), fy = f(Y), fz = f(Z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
/** How far apart two colours stand under `kind` (CIE76 delta E). */
export const egCvdDistance = (a, b, kind = null) => { const A = egCvd(a, kind), B = egCvd(b, kind); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
