// Keep this module import-light: item minters such as the starting kit import it.
import { getPref } from '../../ui/uiPrefs.js';
import { SURVIVAL_OFF, tierOfStored, rulesForTier } from './difficulty.js';
import { isOnlinePage } from '../../platform/onlineLane.js';

export const SURVIVAL_PREF = 'survival';
export const survivalTier = () => tierOfStored(getPref(SURVIVAL_PREF));
export const survivalOn = () => survivalTier() !== SURVIVAL_OFF;
export const survivalRules = () => rulesForTier(survivalTier());
// Online, corpse food is minted whatever this player's tier: the machine that raises a death mints the body,
// and any party member may loot it.
export const corpseFoodOn = (search) => survivalOn() || isOnlinePage(search);
