// @ts-check
import { VG_WORD } from '../net/gateBrain.js';
import { t } from '../ui/textManager.js';

export const VANGUARD_TEXT = Object.freeze({
  rises: () => t('gate.vanguard.rises', 'His vanguard rises from the fire!'),
  clear: () => t('gate.vanguard.clear', 'The Bridgehead is clear.'),
  lord: () => t('gate.vanguard.lord', 'The Markynaz rises.'),
  broken: () => t('gate.vanguard.broken', 'The Vanguard is broken. The way to the Warden opens.'),
  patience: (boss) => t('gate.vanguard.patience', '{boss} tires of waiting.', { boss }),
});

// The literal 2 is `VG_STAGES.length` in `net/gateBrain.js`, the stage a broken Vanguard reaches.
export const vanguardOut = (s) => !!s?.vg && s.vg[0] < 2;

export function vanguardLine(w, boss) {
  if (!w) return null;
  switch (w.e) {
    case VG_WORD.wave: return w.s === 0 && w.w === 1 ? VANGUARD_TEXT.rises() : null;
    case VG_WORD.clear: return VANGUARD_TEXT.clear();
    case VG_WORD.lord: return VANGUARD_TEXT.lord();
    case VG_WORD.broken: return VANGUARD_TEXT.broken();
    case VG_WORD.patience: return VANGUARD_TEXT.patience(boss);
    default: return null;
  }
}
