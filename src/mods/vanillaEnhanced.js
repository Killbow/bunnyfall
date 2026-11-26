import { attachedDfmods, setDfmodEnabled } from './dfmodTextures.js';
import { installVanillaEnhancedPack } from './vanillaEnhancedPack.js';
import { textureReplacementCount, textureReplacementEnabled } from '../render/textureReplacement.js';
import { isIilMod } from '../render/improvedInteriorLighting.js';
import { setValue, saveSettings } from '../platform/settings.js';
import { getPref, setPref } from '../ui/uiPrefs.js';
import { optionPath } from '../ui/settingsMap.js';

export const VE_BASE = 'vanilla enhanced - base';
export const VE_BASE_GUID = '1f124f8c-dd01-48ad-a5b9-0b4a0e4702d2';
export const VE_LINK = 'https://www.nexusmods.com/daggerfallunity/mods/273';
export const VE_ADDONS_PREF = 'veAddons';

export const isVeBase = (m) => !!m && (m.fileName === VE_BASE || m.guid === VE_BASE_GUID);
export const isVeFamily = (m) => isVeBase(m) || (m?.deps ?? []).includes(VE_BASE);
const doorMods = () => { installVanillaEnhancedPack(); return attachedDfmods(); };
export const textureMods = () => doorMods().filter((m) => !isIilMod(m));
export const veBase = () => doorMods().find(isVeBase) ?? null;
export const veAddons = () => textureMods().filter((m) => isVeFamily(m) && !isVeBase(m));

export const veWorn = () => textureReplacementEnabled() && veBase()?.enabled === true;
export const classicTexturesWorn = () => !textureReplacementEnabled() || (!textureMods().some((m) => m.enabled) && textureReplacementCount() === 0);

const keptAddons = () => { const v = getPref(VE_ADDONS_PREF); return Array.isArray(v) ? v.filter((k) => typeof k === 'string') : []; };
export const looseTexturesWorn = () => textureReplacementEnabled() && textureReplacementCount() > 0;
export const classicBlocked = () => (looseTexturesWorn()
  ? `A loose texture pack (a folder of pictures) is attached. Remove it on the Replacement packs card (${optionPath('card:packs')}) to use Classic.`
  : null);
export const customTextureNote = () => (looseTexturesWorn() && !textureMods().some((m) => m.enabled)
  ? `Custom: a loose texture pack (a folder of pictures) is attached. Remove it on the Replacement packs card (${optionPath('card:packs')}).`
  : `Custom: a mix of texture mods is switched on. The Replacement packs card (${optionPath('card:packs')}) lists them.`);

export function wearVanillaEnhanced() {
  if (!textureReplacementEnabled()) { setValue('Enhancements', 'AssetInjection', 'True'); saveSettings(); }
  const keep = new Set(keptAddons());
  const base = veBase();
  setDfmodEnabled([...(base ? [base.key] : []), ...veAddons().filter((m) => keep.has(m.key)).map((m) => m.key)], true);
}
export function setVeAddon(key, on) {
  const keep = new Set(keptAddons());
  if (on) keep.add(key); else keep.delete(key);
  setPref(VE_ADDONS_PREF, [...keep].sort());
  return setDfmodEnabled(key, on);
}
export function wearClassicTextures() {
  if (veWorn()) setPref(VE_ADDONS_PREF, veAddons().filter((m) => m.enabled).map((m) => m.key).sort());
  setDfmodEnabled(textureMods().map((m) => m.key), false);
}
