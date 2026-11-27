// @ts-check
// The item lists a character holds, read by the item judge and id ledger on the server and by the client hold check.
// Ground piles and world-filled lists (dungeon chests, bodies, and shop shelves) are never included.
import { deedsOf } from '../net/realmGoldLaw.js';

const lists = (/** @type {any[]} */ ...ls) => ls.filter(Array.isArray);
const arrayOf = (/** @type {unknown} */ x) => (Array.isArray(x) ? x : []);
const objectOf = (/** @type {unknown} */ x) => (x && typeof x === 'object' ? /** @type {Record<string, unknown>} */ (x) : {});

const CSA_VENDOR = 'come-sail-away', NAVAL_VENDOR = 'NavalCombat', REVENANT_VENDOR = 'Revenant';
// Must match the interior scene name in sceneCache.js and realmGoldLaw.js.
const interiorSceneName = (/** @type {unknown} */ mapId, /** @type {unknown} */ buildingKey) => `DaggerfallInterior [MapID=${mapId}, BuildingKey=${buildingKey}]`;

/** @param {any} save */
export function possessedItemLists(save) {
  const out = lists(save?.items, save?.wagonItems, save?.bagItems, save?.furnishings, save?.otherItems);
  const rooms = new Set(deedsOf(save).map((d) => d.room).filter(Boolean));
  const rented = new Set(arrayOf(save?.rentedRooms).map((r) => interiorSceneName(/** @type {any} */ (r)?.mapId, /** @type {any} */ (r)?.buildingKey)));
  for (const scene of arrayOf(save?.sceneCache?.scenes)) {
    const sc = /** @type {any} */ (scene);
    for (const piece of Object.values(objectOf(sc?.decorOwn))) if (piece && typeof piece === 'object') out.push([piece]);
    for (const held of Object.values(objectOf(sc?.decorItems))) out.push(...lists(held));
    if (rooms.has(sc) || rented.has(sc?.sceneName)) for (const c of arrayOf(sc?.lootContainers)) out.push(...lists(/** @type {any} */ (c)?.items));
  }
  const csa = save?.modData?.[CSA_VENDOR];
  for (const boat of arrayOf(csa?.placedBoats)) out.push(...lists(/** @type {any} */ (boat)?.Items));
  out.push(...lists(...Object.values(objectOf(csa?.packedCargoes))));
  for (const c of arrayOf(save?.modData?.[NAVAL_VENDOR]?.party?.party)) out.push(...lists(/** @type {any} */ (c)?.items));
  for (const r of arrayOf(save?.modData?.[REVENANT_VENDOR]?.list)) if (/** @type {any} */ (r)?.sworn && !/** @type {any} */ (r).defeated) out.push(...lists(/** @type {any} */ (r).companion?.items));
  for (const r of arrayOf(save?.modData?.[REVENANT_VENDOR]?.list)) if (/** @type {any} */ (r)?.sworn && !/** @type {any} */ (r).defeated) out.push(...lists(Object.values(objectOf(/** @type {any} */ (r).companion?.gear)).filter((it) => it && typeof it === 'object')));
  return out;
}

