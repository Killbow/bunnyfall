// @ts-check
import { modSetting } from '../../mods/modSettings.js';
import { LEGACY_MOD, MODELS } from './family.js';

export const TOLL_SHARES = Object.freeze([0.04, 0.06, 0.10]);

export const legacyOn = () => !!modSetting(LEGACY_MOD, 'Enabled');

export function legacySettings() {
  const toll = Math.max(0, Math.min(TOLL_SHARES.length - 1, modSetting(LEGACY_MOD, 'Legacy.Toll') | 0));
  return {
    descendants: modSetting(LEGACY_MOD, 'Family.Descendants') | 0,
    maxSiblings: modSetting(LEGACY_MOD, 'Family.Max Siblings') | 0,
    siblingChance: modSetting(LEGACY_MOD, 'Family.Siblings Probability') | 0,
    model: (modSetting(LEGACY_MOD, 'Legacy.Model') | 0) === 1 ? MODELS.bloodline : MODELS.enduring,
    tollShare: TOLL_SHARES[toll],
    heirloomChance: (modSetting(LEGACY_MOD, 'Legacy.Heirloom Chance') | 0) / 100,
    familyInWorld: !!modSetting(LEGACY_MOD, 'Legacy.Family In World'),
  };
}
