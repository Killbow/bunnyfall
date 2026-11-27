// @ts-check

import { t } from '../ui/textManager.js';

/** @typedef {{ editor: any, edit: any, at: { x: number, y: number } | null, say: (text: string, tone?: string) => void }} PoiPlaceContext */
/** @typedef {{ whyNot?: (asset: import('./poiAssetCatalogue.js').PoiAsset) => string | null, place: (asset: import('./poiAssetCatalogue.js').PoiAsset, ctx: PoiPlaceContext) => void | boolean | Promise<void | boolean> }} PoiAssetPlacer */

/** @type {Map<string, PoiAssetPlacer>} */
const placers = new Map();

export function setPoiAssetPlacer(/** @type {string} */ placing, /** @type {PoiAssetPlacer} */ placer) {
  placers.set(placing, placer);
  return () => { if (placers.get(placing) === placer) placers.delete(placing); };
}

export const poiAssetPlacer = (/** @type {string} */ placing) => placers.get(placing) ?? null;

/** @param {import('./poiAssetCatalogue.js').PoiAsset} asset */
export function poiAssetWhyNot(asset) {
  if (asset.placing === 'encounter') return t('poi.assets.byEncounter', 'Creatures are chosen in a DM encounter.');
  const p = placers.get(asset.placing);
  if (!p) {
    return asset.placing === 'upload' ? t('poi.assets.noModels', 'Daggerfall models cannot be placed in this editor.')
      : t('poi.assets.later', 'Pictures and items cannot be placed in this editor yet.');
  }
  return p.whyNot?.(asset) ?? null;
}

export async function placePoiAsset(/** @type {import('./poiAssetCatalogue.js').PoiAsset} */ asset, /** @type {PoiPlaceContext} */ ctx) {
  if (poiAssetWhyNot(asset) || ctx.editor?.active?.() === false) return false;
  return (await /** @type {PoiAssetPlacer} */ (placers.get(asset.placing)).place(asset, ctx)) !== false;
}
