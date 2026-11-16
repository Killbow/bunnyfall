// @ts-check
// The Spire's danger palettes (Elite-Gates.md section 25.7), kept apart from ui/eliteGates/egAccess.js so the swap
// worker can paint band art without loading the settings code. egAccess.js exports the same objects.
import { t } from '../../systems/textManager.js';

/** Each palette sets the danger edge, the safety gold, and the hazard color. `keyline` 2 asks for the double keyline
 *  and `hatch` 1 for the 45-degree hatch (world/eliteGates/egLook.js egPaletteBits). Standard uses the default
 *  telegraph colors (section 25.2). */
export const EG_DANGER_PALETTES = Object.freeze({
  standard: Object.freeze({ key: 'standard', get name() { return t('menu.spire.palette.standard', 'Standard'); }, danger: Object.freeze([1.0, 0.24, 0.28]), safety: Object.freeze([1.0, 0.82, 0.38]), hazard: Object.freeze([0.95, 0.95, 1.0]), keyline: 1, hatch: 0 }),
  contrast: Object.freeze({ key: 'contrast', get name() { return t('menu.spire.palette.contrast', 'High contrast'); }, danger: Object.freeze([1.0, 0.15, 0.75]), safety: Object.freeze([1.0, 0.95, 0.7]), hazard: Object.freeze([0.2, 0.95, 1.0]), keyline: 2, hatch: 1 }),
  deutan: Object.freeze({ key: 'deutan', get name() { return t('menu.spire.palette.deutan', 'Deutan-Protan'); }, danger: Object.freeze([0.62, 0.32, 1.0]), safety: Object.freeze([1.0, 0.86, 0.2]), hazard: Object.freeze([1.0, 1.0, 1.0]), keyline: 1, hatch: 0 }),
  tritan: Object.freeze({ key: 'tritan', get name() { return t('menu.spire.palette.tritan', 'Tritan'); }, danger: Object.freeze([1.0, 0.12, 0.2]), safety: Object.freeze([0.25, 0.9, 0.85]), hazard: Object.freeze([1.0, 1.0, 1.0]), keyline: 1, hatch: 0 }),
});
export const EG_DANGER_PALETTE_KEYS = Object.freeze(Object.keys(EG_DANGER_PALETTES));
/** The palette a key names (Standard for anything else). */
export const egPaletteOf = (key) => EG_DANGER_PALETTES[key] ?? EG_DANGER_PALETTES.standard;
