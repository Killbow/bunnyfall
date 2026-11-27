import { getPref } from '../ui/uiPrefs.js';
import { isEnhanced } from '../ui/uiSkin.js';

export const ENHANCED_SOUNDS_KEY = 'soundEnhancements';

export function enhancedSoundsOn() {
  return isEnhanced() && !!getPref(ENHANCED_SOUNDS_KEY);
}
