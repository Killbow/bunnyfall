import { isEnhanced } from '../../ui/uiSkin.js';
import { getPref } from '../../ui/uiPrefs.js';
import { horseCareTierOfStored, horseCareRulesForTier, wagonUpkeepTierOfStored, wagonUpkeepRulesForTier } from './upkeepTiers.js';

export const HORSE_CARE_PREF = 'horseCare';
export const WAGON_UPKEEP_PREF = 'wagonUpkeep';
export const horseCareRules = () => (isEnhanced() ? horseCareRulesForTier(horseCareTierOfStored(getPref(HORSE_CARE_PREF))) : null);
export const wagonUpkeepRules = () => (isEnhanced() ? wagonUpkeepRulesForTier(wagonUpkeepTierOfStored(getPref(WAGON_UPKEEP_PREF))) : null);
