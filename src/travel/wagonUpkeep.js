// @ts-check
// Wear lowers only `currentCondition`; item validation holds a marked wagon's value at its kind's `floor`.
// Functions that charge take the tier's rules, and a call that omits them runs Hard.

import { isWagonItem, wagonKindOf, WAGON_KINDS } from './wagonKinds.js';
import { templateByIndex, mintCondition, TRANSPORT_SMALL_CART } from '../items/itemTemplates.js';
import { WAGON_UPKEEP_HARD } from '../systems/upkeep/upkeepTiers.js';
import { t } from '../ui/textManager.js';

export const wagonConditionMax = (item) => (Number.isInteger(item?.maxCondition) && item.maxCondition > 0 ? item.maxCondition : (templateByIndex(TRANSPORT_SMALL_CART)?.hitPoints ?? 1400));
export const wagonCondition = (item) => (Number.isInteger(item?.currentCondition) ? Math.max(0, Math.min(wagonConditionMax(item), item.currentCondition)) : wagonConditionMax(item));
export const wagonSoundness = (item) => wagonCondition(item) / wagonConditionMax(item);

export const WAGON_STATES = Object.freeze([
  Object.freeze({ key: 'sound', min: 0.6, name: 'Sound', tone: '', pace: 1 }),
  Object.freeze({ key: 'worn', min: 0.3, name: 'Worn', tone: '', pace: 1 }),
  Object.freeze({ key: 'rickety', min: 0.1, name: 'Rickety', tone: 'is-hurt', pace: 0.85 }),
  Object.freeze({ key: 'failing', min: 0, name: 'Failing', tone: 'is-hurt', pace: 0.7 }),
]);
export function wagonState(item) {
  const s = wagonSoundness(item);
  return WAGON_STATES.find((w) => s >= w.min) ?? WAGON_STATES[WAGON_STATES.length - 1];
}

export const WEAR_A_KM = 0.01;
export const OFFROAD = 2.5;
export const LOAD_WEAR = 0.75;
export const KIND_WEAR = Object.freeze({ cart: 1, openWagon: 0.85, caravan: 0.7 });
export const JOURNEY_WEAR_A_DAY = 0.01;
export const JOURNEY_WEAR_MAX = 0.2;
export const THROWN_WEAR = 0.1;
export const WEAR_FLOOR = 1;

export function rollWear(metres, { kind = 'cart', road = true, load = 0 } = {}) {
  if (!(metres > 0)) return 0;
  const l = Math.max(0, Math.min(1, Number(load) || 0));
  return (metres / 1000) * WEAR_A_KM * (road ? 1 : OFFROAD) * (1 + LOAD_WEAR * l) * (KIND_WEAR[kind] ?? 1);
}
export const journeyWear = (days) => Math.min(JOURNEY_WEAR_MAX, Math.max(0, Number(days) || 0) * JOURNEY_WEAR_A_DAY);

/**
 * @param {any} item
 * @param {number} share
 */
export function wearWagon(item, share) {
  if (!isWagonItem(item) || !(share > 0)) return null;
  mintCondition(item);
  const before = wagonState(item), max = wagonConditionMax(item), now = wagonCondition(item);
  const after = Math.max(Math.min(now, WEAR_FLOOR), Math.round(now - share * max));
  if (after === now) return null;
  item.currentCondition = after;
  return { before, after: wagonState(item) };
}

export function createWearAccount() {
  /** @type {WeakMap<object, number>} */
  const owed = new WeakMap();
  return {
    add(item, share) {
      if (!isWagonItem(item) || !(share > 0)) return null;
      const max = wagonConditionMax(item);
      const total = (owed.get(item) ?? 0) + share * max;
      const whole = Math.floor(total);
      owed.set(item, total - whole);
      return whole > 0 ? wearWagon(item, whole / max) : null;
    },
    owed: (item) => owed.get(item) ?? 0,
  };
}

export const MEND_SHARE = 0.12;
export const MEND_LEAST = 40;
export const MEND_FETCH = 0.5;
export const KIT_MEND = 0.25;
export const WAGON_KIT_CEILING = 0.6;
export const KIT_MINUTES = 60;

export function mendPrice(item, { away = false } = {}) {
  if (!isWagonItem(item)) return 0;
  const lacks = 1 - wagonSoundness(item);
  if (lacks <= 0) return 0;
  const whole = Math.max(MEND_LEAST, Math.round(MEND_SHARE * (WAGON_KINDS[wagonKindOf(item)]?.value ?? 150)));
  return Math.max(1, Math.round(whole * lacks * (away ? 1 + MEND_FETCH : 1)));
}

export const WAGON_UPKEEP_TEXT = Object.freeze({
  failing: (name) => `Your ${name} is falling apart and slow. A Wagon Yard or a Wagon Repair Kit will mend it.`,
  rickety: (name) => `Your ${name} is rickety and slow. A Wagon Yard can mend it.`,
  noWagon: 'You do not own a wagon.',
  whole: (name) => `Your ${name} needs no mending.`,
  mended: (name, price) => `Your ${name} is mended${price ? ` for ${price} gold` : ''}.`,
  poor: (price) => `The wright asks ${price} gold. You don't have enough.`,
  kitCeiling: (name) => `A kit will do no more for your ${name}. A Wagon Yard can make it whole.`,
  kitNotNear: (name) => `Your ${name} is not here to mend.`,
  kitDone: (name, pct) => `You spend an hour mending your ${name}. It is ${pct}% sound.`,
  smith: 'A smith does not mend wagons. A town’s Wagon Yard does.',
  failingBoons: (name) => t('wagon.upkeep.boons.failing', 'Your {name} is falling apart. A Wagon Yard or a Wagon Repair Kit will mend it.', { name }),
  ricketyBoons: (name) => t('wagon.upkeep.boons.rickety', 'Your {name} is rickety. A Wagon Yard can mend it.', { name }),
});
export const wagonWord = (item) => WAGON_KINDS[wagonKindOf(item)]?.name ?? 'wagon';

export function mendWagon(item) {
  if (!isWagonItem(item)) return null;
  mintCondition(item);
  const had = wagonCondition(item);
  item.currentCondition = wagonConditionMax(item);
  return had;
}
export function kitMendWagon(item) {
  if (!isWagonItem(item)) return { ok: false, text: WAGON_UPKEEP_TEXT.noWagon };
  mintCondition(item);
  const max = wagonConditionMax(item), now = wagonCondition(item), top = Math.round(WAGON_KIT_CEILING * max);
  if (now >= top) return { ok: false, text: WAGON_UPKEEP_TEXT.kitCeiling(wagonWord(item)) };
  item.currentCondition = Math.min(top, now + Math.round(KIT_MEND * max));
  return { ok: true, text: WAGON_UPKEEP_TEXT.kitDone(wagonWord(item), Math.round(wagonSoundness(item) * 100)) };
}

export function wagonPace(item, rules = WAGON_UPKEEP_HARD) {
  if (!isWagonItem(item)) return 1;
  const s = wagonState(item);
  return (rules.wearSlows ? s.pace : 1) * (s.key === 'sound' ? rules.soundPace : 1);
}
// Passing `null` (tier Off) sells the wagon whole, while omitting `rules` runs Hard.
export const wagonSoldWhole = (item, rules = WAGON_UPKEEP_HARD) => isWagonItem(item) && !rules?.wearPrices;
