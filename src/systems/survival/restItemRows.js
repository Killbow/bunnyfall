// @ts-check
// Rest supply item rows, kept apart from restItems.js so the account service's item validation can load them.

import { ICON_TWIGS } from '../../net/professionLaw.js';

export const REST_ITEM = Object.freeze({ Bedroll: 1700, EmberJar: 1701, Firewood: 1702, Tonic: 1703, Candle: 1704, Salts: 1705, Draught: 1706 });
export const isRestItem = (item) => !!item && Object.values(REST_ITEM).includes(item.templateIndex);
export const REST_ITEM_GROUP = 'UselessItems2';
export const BEDROLL_NIGHTS = 10;
export const CANDLE_USES = 3;
export const SALTS_USES = 3;

const row = (index, name, baseWeight, hitPoints, basePrice, rarity, icon, stackable) => Object.freeze({
  index, name, baseWeight, hitPoints, capacityOrTarget: 0, basePrice, enchantmentPoints: 0, rarity, variants: 0,
  drawOrderOrEffect: 0, isBluntWeapon: false, isLiquid: false, isOneHanded: false, isIngredient: false,
  worldTextureArchive: icon[0], worldTextureRecord: icon[1], playerTextureArchive: 0, playerTextureRecord: 0, stackable,
  isNotRepairable: !stackable,
});
export const REST_ITEM_ROWS = Object.freeze([
  row(REST_ITEM.Bedroll, 'Bedroll', 2.5, BEDROLL_NIGHTS, 80, 1, [204, 8], false),
  row(REST_ITEM.EmberJar, 'Ember Jar', 0.5, 1, 15, 1, [218, 0], true),
  row(REST_ITEM.Firewood, 'Firewood', 1.5, 1, 8, 1, ICON_TWIGS, true),
  row(REST_ITEM.Tonic, 'Restorative Tonic', 0.2, 1, 30, 2, [205, 11], true),
  row(REST_ITEM.Candle, 'Meditation Candle', 0.3, CANDLE_USES, 35, 3, [210, 3], false),
  row(REST_ITEM.Salts, 'Waking Salts', 0.1, SALTS_USES, 40, 3, [205, 3], false),
  row(REST_ITEM.Draught, 'Sleeping Draught', 0.2, 1, 45, 3, [211, 49], true),
]);
