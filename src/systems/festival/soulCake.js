// @ts-check
import { registerCustomTemplates, setItemFields, mintCondition, registerItemUseHandler } from '../../items/itemTemplates.js';
import { addVendorTextures } from '../../render/textureReplacement.js';
import { FESTIVAL_ARCHIVE, FESTIVAL_ART, registerFestivalArt } from '../../world/festivalArt.js';
import { SOUL_CAKE_LAW_ROW, HEARTH_OFFERING_LAW_ROW } from './festivalRows.js';
import { SOUL_CAKE_TEMPLATE, HEARTH_OFFERING_TEMPLATE } from '../../net/festivalLaw.js';
import { t } from '../../ui/textManager.js';

export { SOUL_CAKE_TEMPLATE, HEARTH_OFFERING_TEMPLATE };
export const SOUL_CAKE_ROW = Object.freeze({ ...SOUL_CAKE_LAW_ROW, name: 'Soul Cake', worldTextureArchive: FESTIVAL_ARCHIVE, worldTextureRecord: FESTIVAL_ART.cake });
export const HEARTH_OFFERING_ROW = Object.freeze({ ...HEARTH_OFFERING_LAW_ROW, name: 'Hearth Offering', worldTextureArchive: FESTIVAL_ARCHIVE, worldTextureRecord: FESTIVAL_ART.offeringIcon });
registerCustomTemplates([SOUL_CAKE_ROW, HEARTH_OFFERING_ROW]);
registerFestivalArt(addVendorTextures);

export const SOUL_CAKE_TEXT = Object.freeze({
  cake: () => [t('festival.item.cake.what', 'A spiced cake set out for the restless dead.'), t('festival.item.cake.use', 'The Wyrd Sisters trade for them.')],
  offering: () => [t('festival.item.offering.what', 'A bowl for Soul Cakes, under a tallow lantern.'), t('festival.item.offering.use', 'Use it at your own door to set it out.')],
});

export const isSoulCake = (/** @type {any} */ item) => item?.templateIndex === SOUL_CAKE_TEMPLATE && item?.group === 'UselessItems2';
export const isHearthOffering = (/** @type {any} */ item) => item?.templateIndex === HEARTH_OFFERING_TEMPLATE && item?.group === 'UselessItems2';
export const isFestivalFace = (/** @type {any} */ item) => isSoulCake(item) || isHearthOffering(item);
export function soulCakes(n = 1) {
  return Object.assign(mintCondition(setItemFields({ group: 'UselessItems2', templateIndex: SOUL_CAKE_TEMPLATE })), { stackCount: Math.max(1, Math.trunc(Number(n) || 1)) });
}
export function hearthOffering(n = 1) {
  return Object.assign(mintCondition(setItemFields({ group: 'UselessItems2', templateIndex: HEARTH_OFFERING_TEMPLATE })), { stackCount: Math.max(1, Math.trunc(Number(n) || 1)) });
}
export const soulCakesHeld = (/** @type {any[]} */ items) => (Array.isArray(items) ? items.filter(isSoulCake).reduce((s, it) => s + Math.max(1, it.stackCount ?? 1), 0) : 0);
function restack(/** @type {any[]} */ items, /** @type {number} */ n, /** @type {(it: any) => boolean} */ is, /** @type {(n: number) => any} */ mint) {
  if (!Array.isArray(items) || !Number.isSafeInteger(n) || n < 0) return false;
  const held = items.filter(is);
  if (held.length === (n > 0 ? 1 : 0) && (n === 0 || (held[0].stackCount ?? 1) === n)) return false;
  for (const it of held) items.splice(items.indexOf(it), 1);
  if (n > 0) items.push(mint(n));
  return true;
}
/**
 * @param {any[]} items
 * @param {number} n
 */
export const restackSoulCakes = (/** @type {any[]} */ items, /** @type {number} */ n) => restack(items, n, isSoulCake, soulCakes);
export const restackHearthOfferings = (/** @type {any[]} */ items, /** @type {number} */ n) => restack(items, n, isHearthOffering, hearthOffering);

/**
 * Never pass the pack in `lists`; the account counts restack it on the next answer.
 * @param {any[][]} lists
 * @param {any[]} [records]
 */
export function foldStrayFaces(lists, records = []) {
  let n = 0;
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (let i = list.length - 1; i >= 0; i--) if (isFestivalFace(list[i])) n += Math.max(1, list.splice(i, 1)[0].stackCount ?? 1);
  }
  for (const r of records) {
    if (!r || typeof r !== 'object') continue;
    for (const [id, item] of Object.entries(r)) if (isFestivalFace(item)) { n += Math.max(1, item.stackCount ?? 1); delete r[id]; }
  }
  return n;
}

let _placer = null;
export function setOfferingPlacer(/** @type {((item: any) => string)|null} */ fn) { _placer = typeof fn === 'function' ? fn : null; }
export const offeringCold = () => t('festival.offering.cold', 'Set it out at your own door, while online.');
registerItemUseHandler(HEARTH_OFFERING_TEMPLATE, (/** @type {any} */ item) => {
  const text = _placer ? _placer(item) : offeringCold();
  return { kind: 'text', text, closesWindow: text === '' };
});
