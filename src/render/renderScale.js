// @ts-check
// The player's render scale for world frames. Retro Picture Mode overrides it, and the 2D overlays are never scaled.
import { getPref } from '../ui/uiPrefs.js';
import { featureForControl } from '../mods/features.js';

export const RENDER_SCALES = Object.freeze(
  (/** @type {any} */ (featureForControl('prefs', 'renderScale'))?.control?.tiers ?? [[1, '100%']]).map(([v]) => Number(v)));

// Matches by string, as the Features tile does, so the game never runs at a scale the tile shows as 100%.
export function renderScaleOf(v) {
  if (v === null || v === undefined || v === '') return null;
  return RENDER_SCALES.find((t) => String(t) === String(v)) ?? null;
}

let _door;
function door() {
  if (_door === undefined) _door = renderScaleOf(new URLSearchParams(globalThis.location?.search ?? '').get('renderscale'));
  return _door;
}

export function renderScaleSetting() {
  return door() ?? renderScaleOf(getPref('renderScale')) ?? 1;
}

export function _resetRenderScaleDoor() { _door = undefined; }
