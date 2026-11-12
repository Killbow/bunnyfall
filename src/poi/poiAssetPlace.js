// @ts-check
// How an asset browser entry is placed in a POI. Each entry names its placement mode (`placing` in
// poi/poiAssetCatalogue.js), and the module that handles that mode registers a placer here. The in-game editor panel
// registers 'upload' (a Daggerfall model uploaded as a mesh) and 'billboard', 'mount', and 'paperdoll' (flat pictures
// in ui/poi/poiFlatUi.js); modes without a registered placer are listed and previewed only. 'encounter' (an enemy) is
// chosen in a DM encounter, never placed directly from the browser.

import { t } from '../systems/textManager.js';

/**
 * `editor` is `scenes/poiEditorHost.js`, `edit` is `poi/poiEdit.js`, `at` is the drop point in CSS pixels (null for
 * Place or a double-click, when the asset follows the cursor until a ground click), and `say` writes to the status bar.
 * @typedef {{ editor: any, edit: any, at: { x: number, y: number } | null, say: (text: string, tone?: string) => void }} PoiPlaceContext
 */
/** `whyNot` returns null, or the reason the asset cannot be placed; `place` returns false if nothing was placed.
 *  @typedef {{ whyNot?: (asset: import('./poiAssetCatalogue.js').PoiAsset) => string | null, place: (asset: import('./poiAssetCatalogue.js').PoiAsset, ctx: PoiPlaceContext) => void | boolean | Promise<void | boolean> }} PoiAssetPlacer */

/** @type {Map<string, PoiAssetPlacer>} */
const placers = new Map();

/** Registers the placer for a `placing` mode and returns an unregister function that removes it if it has not been
 *  replaced. */
export function setPoiAssetPlacer(/** @type {string} */ placing, /** @type {PoiAssetPlacer} */ placer) {
  placers.set(placing, placer);
  return () => { if (placers.get(placing) === placer) placers.delete(placing); };
}

/** The placer for a placing, or null. */
export const poiAssetPlacer = (/** @type {string} */ placing) => placers.get(placing) ?? null;

/** Why an entry cannot be placed now, or null when it can. @param {import('./poiAssetCatalogue.js').PoiAsset} asset */
export function poiAssetWhyNot(asset) {
  if (asset.placing === 'encounter') return t('poi.assets.byEncounter', 'Creatures are chosen in a DM encounter.');
  const p = placers.get(asset.placing);
  if (!p) {
    return asset.placing === 'upload' ? t('poi.assets.noModels', 'Daggerfall models cannot be placed in this editor.')
      : t('poi.assets.later', 'Pictures and items cannot be placed in this editor yet.');
  }
  return p.whyNot?.(asset) ?? null;
}

/** Places an asset entry and returns true if it was placed, or false if placement is blocked or the placer reports
 *  no placement. */
export async function placePoiAsset(/** @type {import('./poiAssetCatalogue.js').PoiAsset} */ asset, /** @type {PoiPlaceContext} */ ctx) {
  if (poiAssetWhyNot(asset)) return false;
  return (await /** @type {PoiAssetPlacer} */ (placers.get(asset.placing)).place(asset, ctx)) !== false;
}
