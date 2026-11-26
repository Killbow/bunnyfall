// @ts-check
// Daggerfall Unity's retro mode settings, target sizes, and viewport rects. render/retroPass.js draws it, and the
// renderer reads retroFrameConfig so it never imports the settings store.
// As in Daggerfall Unity, the world is projected at the target's aspect and stretched to the screen, and the aspect
// correction settings undo that stretch.
import { getInt, getBool } from '../platform/settings.js';

export const RETRO_TARGETS = Object.freeze({ 1: Object.freeze([320, 200]), 2: Object.freeze([640, 400]) });
// A docked large HUD gets a shorter target instead of a smaller viewport rect, as in Daggerfall Unity.
export const RETRO_TARGETS_HUD = Object.freeze({ 1: Object.freeze([320, 154]), 2: Object.freeze([640, 308]) });
export const RETRO_ASPECT = Object.freeze({ OFF: 0, FOUR_THREE: 1, SIXTEEN_TEN: 2 });
export const RETRO_POST = Object.freeze({ OFF: 0, POSTERIZE: 1, POSTERIZE_NO_SKY: 2, PALETTIZE: 3, PALETTIZE_NO_SKY: 4 });

export const retroRenderingMode = () => getInt('Video', 'RetroRenderingMode', 0, 2);
// Clamped here; Daggerfall Unity reads it unclamped, and an out-of-range value leaves a blank world.
export const retroPostProcessing = () => getInt('Video', 'PostProcessingInRetroMode', 0, 4);
export const retroUseMipMaps = () => getBool('Video', 'UseMipMapsInRetroMode');
export const retroAspectCorrection = () => getInt('Video', 'RetroModeAspectCorrection', 0, 2);
// Clamped here; Daggerfall Unity reads it unclamped, and a shift of 8 or more paints the world black.
export const palettizationLutShift = () => getInt('Video', 'PalettizationLUTShift', 0, 7);

export function retroTargetSize(mode, docked) {
  const t = (docked ? RETRO_TARGETS_HUD : RETRO_TARGETS)[mode];
  return t ? [t[0], t[1]] : null;
}

export function retroWorldAspect(mode, docked) {
  const t = retroTargetSize(mode, docked);
  return t ? t[0] / t[1] : null;
}

// Matches Daggerfall Unity's SetRetroAspectViewport, float32 rounding included, in bottom-left normalized space.
// It is not clamped, so the pillar goes negative on a window narrower than the target, as in Daggerfall Unity.
export function retroAspectViewportRect(screenW, screenH, aspect, hudPx = 0) {
  const pillarWidth = retroPillarWidth(screenW, screenH, aspect);
  const hudHeight = hudPx > 0 ? Math.fround(hudPx / screenH) : 0;
  const x = Math.fround(pillarWidth / screenW);
  return { x, y: hudHeight, w: Math.fround(1 - x * 2), h: Math.fround(1 - hudHeight) };
}

function retroPillarWidth(screenW, screenH, aspect) {
  const heightRatio = Math.fround(Math.fround(screenH / 6) / 200);
  const viewWidth = Math.trunc(Math.fround(Math.fround(320 * (aspect === RETRO_ASPECT.FOUR_THREE ? 5 : 6)) * heightRatio));
  return Math.trunc((screenW - viewWidth) / 2);
}

// Null when retro mode or its aspect correction is off, or when the window is narrower than the target, because a
// DOM inset cannot be negative.
export function retroScreenRect(screenW, screenH) {
  const aspect = retroRenderingMode() !== 0 ? retroAspectCorrection() : 0;
  if (!aspect || !(screenW > 0) || !(screenH > 0)) return null;
  const pillar = retroPillarWidth(screenW, screenH, aspect);
  return pillar > 0 ? { x: pillar, y: 0, w: screenW - pillar * 2, h: screenH } : null;
}

// Session state, never saved; it survives a mode change, as in Daggerfall Unity.
let _postprocessing = true;
export const retroPostprocessingEnabled = () => _postprocessing;
export function toggleRetroPostprocessing() {
  _postprocessing = !_postprocessing;
  return _postprocessing;
}
export function _resetRetroPostprocessing() { _postprocessing = true; }

export function retroFrameConfig() {
  const mode = retroRenderingMode();
  if (mode === 0) return null;
  const size = retroTargetSize(mode, false), hud = retroTargetSize(mode, true);
  if (!size || !hud) return null;
  return {
    width: size[0], height: size[1], hudWidth: hud[0], hudHeight: hud[1],
    post: _postprocessing ? retroPostProcessing() : RETRO_POST.OFF,
    lutShift: palettizationLutShift(),
    mipmaps: retroUseMipMaps(),
  };
}
