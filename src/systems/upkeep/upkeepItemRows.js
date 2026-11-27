// @ts-check
import { registerCustomTemplates } from '../../items/itemTemplates.js';
import { ICON_STAFF } from '../../net/professionLaw.js';

export const UPKEEP_ITEM = Object.freeze({ Oats: 1710, WagonKit: 1711 });
export const UPKEEP_ITEM_GROUP = 'UselessItems2';
// Online shops sell these only while this is true; turn it off if an older client cannot read the templates.
export const UPKEEP_ITEMS_ONLINE = true;
export const upkeepItemsAvailable = (online) => !online || UPKEEP_ITEMS_ONLINE;

const row = (index, name, baseWeight, basePrice, icon, stackable) => Object.freeze({
  index, name, baseWeight, hitPoints: 1, capacityOrTarget: 0, basePrice, enchantmentPoints: 0, rarity: 20, variants: 0,
  drawOrderOrEffect: 0, isBluntWeapon: false, isLiquid: false, isOneHanded: false, isIngredient: false,
  worldTextureArchive: icon[0], worldTextureRecord: icon[1], playerTextureArchive: 0, playerTextureRecord: 0, stackable,
  isNotRepairable: true,
});
export const UPKEEP_ITEM_ROWS = Object.freeze([
  row(UPKEEP_ITEM.Oats, 'Sack of Oats', 1.0, 4, [205, 17], true),
  row(UPKEEP_ITEM.WagonKit, 'Wagon Repair Kit', 4.0, 60, ICON_STAFF, true),
]);
registerCustomTemplates(UPKEEP_ITEM_ROWS);

export const newUpkeepItem = (templateIndex, stackCount = 1) => ({ group: UPKEEP_ITEM_GROUP, templateIndex, ...(stackCount > 1 ? { stackCount } : {}) });
export const isOatsItem = (item) => item?.templateIndex === UPKEEP_ITEM.Oats;
export const isWagonKitItem = (item) => item?.templateIndex === UPKEEP_ITEM.WagonKit;
