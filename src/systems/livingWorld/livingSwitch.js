// @ts-check
import { getPref } from '../../ui/uiPrefs.js';
import { isEnhanced } from '../../ui/uiSkin.js';

export const LIVING_WORLD_KEY = 'livingWorld';

export const LIVING_WORLD_TUNING = { override: /** @type {boolean|null} */ (null) };
export const livingWorldOn = () => LIVING_WORLD_TUNING.override ?? (isEnhanced() && getPref(LIVING_WORLD_KEY) !== false);
