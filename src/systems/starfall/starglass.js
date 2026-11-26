// @ts-check
import { registerCustomTemplates, setItemFields, mintCondition } from '../../items/itemTemplates.js';
import { t } from '../../ui/textManager.js';
import { addVendorTextures } from '../../render/textureReplacement.js';
import { STARGLASS_ART, registerStarglassArt } from '../../world/starfall/starglassArt.js';
import { STARGLASS_TEMPLATE, STARGLASS_LAW_ROW } from './starglassRow.js';
export { STARGLASS_TEMPLATE };

// Named Starfall Glass, never Starglass, which is the name of a naval trade good.
export const STARGLASS_ROW = Object.freeze({
  ...STARGLASS_LAW_ROW, name: 'Starfall Glass', worldTextureArchive: STARGLASS_ART.archive, worldTextureRecord: STARGLASS_ART.record,
});
// Importing this module registers the row and its picture.
registerCustomTemplates([STARGLASS_ROW]);
registerStarglassArt(addVendorTextures);
export const STARGLASS_TEXT = Object.freeze({
  glass: () => [t('starfall.item.glass.what', 'Pale glass from a fallen star, still holding some of its light.'), t('starfall.item.glass.use', 'Any merchant pays well for it.')],
});
// Miscellany, never Gems: every Gems piece is a crystal a socket takes.
export const isStarglass = (/** @type {any} */ item) => item?.templateIndex === STARGLASS_TEMPLATE && item?.group === 'UselessItems2';
export function starglass(n = 1) {
  return Object.assign(mintCondition(setItemFields({ group: 'UselessItems2', templateIndex: STARGLASS_TEMPLATE })), { stackCount: Math.max(1, Math.trunc(Number(n) || 1)) });
}
