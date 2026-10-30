// @ts-check
// TAVERN-SOCIAL (2026-10-30, the owner: "toasts at the tavern, busking"): WHAT A ROUND AND A SONG ARE WORTH. Online, at
// any innkeeper: anyone may buy a round for the house, and everyone in the tavern drinks to it - a little luck for a few
// hours (A Round on the House, Luck +ROUND_LUCK). A Bards' College member who plays for the house is paid more for each
// other bard playing beside them (play together) and for each player listening (the crowd), and the crowd may tip.
//
// Pure but for the bundle it lays on an entity (effects.js assignModBundle, as a dish's is).

import { assignModBundle } from '../effects.js';
import { DISH_ICON } from '../../net/recipeLaw.js';
import { t } from '../textManager.js';
import { POSE_TIP_MAX } from '../../net/wire.js';

/** A round's name, its luck and how long it lasts (rounds: game minutes). */
export const ROUND_NAME = 'A Round on the House';
export const ROUND_LUCK = 5;
export const ROUND_ROUNDS = 180;
/** What a round costs: a base and a share for every other player in the tavern, up to the most. */
export const ROUND_BASE_GOLD = 20;
export const ROUND_EACH_GOLD = 10;
export const ROUND_GOLD_MAX = 150;
/** How near a player must stand to drink to a round, or to count as a bard beside you or as the crowd, metres. */
export const TAVERN_NEAR_M = 20;
/** A performance's pay: the share more for each other bard playing beside you (up to BUSK_TOGETHER_MAX), and for each
 *  player listening (up to BUSK_CROWD_MAX). */
export const BUSK_TOGETHER_SHARE = 0.25;
export const BUSK_TOGETHER_MAX = 3;
export const BUSK_CROWD_SHARE = 0.1;
export const BUSK_CROWD_MAX = 6;
/** A tip's gold: the choices the innkeeper offers. */
export const TIP_CHOICES = Object.freeze([5, 20, 50].filter((g) => g <= POSE_TIP_MAX));

/** A round's price with `others` other players in the tavern. */
export const roundPrice = (/** @type {number} */ others) => Math.min(ROUND_GOLD_MAX, ROUND_BASE_GOLD + ROUND_EACH_GOLD * Math.max(0, others | 0));
/** What a performance's pay is multiplied by, for `bards` other bards playing and `crowd` listening. */
export const buskShare = (/** @type {number} */ bards, /** @type {number} */ crowd) =>
  1 + BUSK_TOGETHER_SHARE * Math.min(BUSK_TOGETHER_MAX, Math.max(0, bards | 0)) + BUSK_CROWD_SHARE * Math.min(BUSK_CROWD_MAX, Math.max(0, crowd | 0));

/** Lays the round on `entity` - renewed, never stacked: a standing round of the house is taken off first. */
export function drinkRound(/** @type {any} */ entity, rolls = Math.random) {
  if (!entity) return null;
  const ids = new Set((entity.activeEffects ?? []).filter((a) => a.bundleName === ROUND_NAME && a.bundleId != null).map((a) => a.bundleId));
  if (ids.size) entity.activeEffects = entity.activeEffects.filter((a) => !ids.has(a.bundleId));
  const e = assignModBundle(entity, { name: ROUND_NAME, kind: 'fortifyAttribute', rounds: ROUND_ROUNDS, sinks: {}, rolls });
  Object.assign(e, { stat: 'luck', magnitude: ROUND_LUCK, bundleIcon: DISH_ICON });
  // BUNNYFALL: and the round is a drink - the thirst quenched whole, as a tavern drink does (survival/tavernMenu.js tavernDrink)
  const sv = entity.survival;
  Object.defineProperty(e, 'quenched', { value: !!sv && Number(sv.thirst) > 0, enumerable: false });   // said once, never saved
  if (sv && typeof sv === 'object') sv.thirst = 0;
  return e;
}

/** The words. */
export const tavernWords = {
  buy: (/** @type {number} */ gold) => t('tavern.round.buy', 'R - Buy a round for the house ({gold} gold)', { gold }),
  bought: () => t('tavern.round.bought', 'You buy a round for the house. Cups are raised all round.'),
  poor: () => t('tavern.round.poor', 'You cannot afford a round.'),
  heard: (/** @type {string} */ name) => t('tavern.round.heard', '{name} buys a round for the house! You raise your cup.', { name }),
  luck: () => t('tavern.round.luck', 'Luck +{n} for a few hours.', { n: ROUND_LUCK }),
  quenched: () => t('tavern.round.quenched', 'Your thirst is quenched.'),
  tip: (/** @type {string} */ name, /** @type {number} */ gold, /** @type {string} */ key) => t('tavern.tip.offer', '{key} - Tip {name} {gold} gold', { name, gold, key }),
  tipped: (/** @type {string} */ name, /** @type {number} */ gold) => t('tavern.tip.sent', 'You tip {name} {gold} gold.', { name, gold }),
  tipHeard: (/** @type {string} */ name, /** @type {number} */ gold) => t('tavern.tip.heard', '{name} tips you {gold} gold for your playing.', { name, gold }),
  together: (/** @type {number} */ n) => t('tavern.busk.together', 'Other bards played with you ({n}), so the house pays more.', { n }),
  crowd: (/** @type {number} */ n) => t('tavern.busk.crowd', 'Players were listening ({n}), so the house pays more.', { n }),
};
