// @ts-check
import { FRIEND_AT, EVENTS } from '../livingWorld/relations.js';
import { AFFECTION_MAX, courtable, spouseOf, residentInHouse, betrothedElsewhere } from './marriage.js';
import { t } from '../../ui/textManager.js';

export const DEEDS = Object.freeze(['compliment', 'gift', 'embrace', 'kiss']);
export const DEED_AFFECTION = Object.freeze({ compliment: 3, gift: 6, embrace: 5, kiss: 8 });
export const COMPLIMENT_TASTE = 1;
export const KISS_AT = 34;
export const GIFT_GOLD = 50;

/**
 * @param {any} family
 * @param {any} member
 * @param {{ id: string }} res
 */
export function deedsFor(family, member, res) {
  if (!family || !member || !res?.id) return [];
  const spouse = spouseOf(family, member);
  if (spouse?.residentId === res.id) return [...DEEDS];
  if (!courtable(res) || residentInHouse(family, res.id) || betrothedElsewhere(family, member, res.id)) return [];
  return spouse ? DEEDS.filter((k) => k !== 'kiss') : [...DEEDS];
}

/** @param {string} kind */
export function deedLabel(kind) {
  if (kind === 'compliment') return t('legacy.deed.compliment', 'Pay a compliment');
  if (kind === 'gift') return t('legacy.deed.gift', 'Give a gift ({gold, number} gold)', { gold: GIFT_GOLD });
  if (kind === 'embrace') return t('legacy.deed.embrace', 'Hug');
  return t('legacy.deed.kiss', 'Kiss');
}

/**
 * @param {string} kind
 * @param {number} [tone]
 */
export function deedQuestion(kind, tone = 1) {
  const i = Math.max(0, Math.min(2, tone | 0));
  if (kind === 'compliment') return [t('legacy.deed.complimentPolite', 'May I say, you look very well today.'), t('legacy.deed.complimentNormal', 'You look good today.'), t('legacy.deed.complimentBlunt', 'You look great.')][i];
  if (kind === 'gift') return t('legacy.deed.giftAsk', 'I brought you something.');
  if (kind === 'embrace') return t('legacy.deed.embraceAsk', 'Come here.');
  return t('legacy.deed.kissAsk', 'You lean in for a kiss.');
}

/**
 * @param {string} kind
 * @param {{ regard: number, courtship?: any, spouse?: boolean }} o
 */
export function deedRefusal(kind, { regard, courtship = null, spouse = false }) {
  if (spouse) return null;
  if (kind === 'embrace' && !courtship && !(regard >= FRIEND_AT)) return 'friend';
  if (kind === 'kiss' && !(courtship && (courtship.betrothed || courtship.affection >= KISS_AT))) return 'court';
  return null;
}

/**
 * @param {string} kind
 * @param {number} taste
 */
export function deedAffection(kind, taste = 0) {
  if (kind === 'compliment') return taste < 0 ? 0 : DEED_AFFECTION.compliment + (taste > 0 ? COMPLIMENT_TASTE : 0);
  return DEED_AFFECTION[/** @type {keyof typeof DEED_AFFECTION} */ (kind)] ?? 0;
}

/**
 * @param {string} kind
 * @param {number} taste
 */
export const deedRegard = (kind, taste = 0) => (kind === 'compliment' && taste < 0 ? 0 : EVENTS[/** @type {keyof typeof EVENTS} */ (kind)] ?? 0);

/** @param {{ regard: number, gained: number, affection?: number | null, warmed?: number }} o */
export function deedTally({ regard, gained, affection = null, warmed = 0 }) {
  const r = Math.trunc(regard);
  const said = t('legacy.deed.tallyRegard', 'Regard {gained}, now {regard}.', { gained: `${gained >= 0 ? '+' : ''}${Math.trunc(gained)}`, regard: `${r > 0 ? '+' : ''}${r}` });
  if (affection == null) return `(${said})`;
  return `(${said} ${t('legacy.deed.tallyCourt', 'Courtship {warmed}, now {affection, number} of {max, number}.', { warmed: `+${warmed}`, affection, max: AFFECTION_MAX })})`;
}

export const DEED_TEXT = Object.freeze({
  compliment: (name) => t('legacy.deed.complimented', '{name} smiles. "Flatterer. Say it again tomorrow."', { name }),
  flat: (name) => t('legacy.deed.flat', '{name} frowns. "Is that meant to be a compliment?"', { name }),
  gift: (name) => t('legacy.deed.gifted', '{name} turns the gift over in their hands. "For me? Thank you."', { name }),
  poor: (name) => t('legacy.deed.poor', 'You haven\'t the {gold, number} gold for a gift worthy of {name}.', { name, gold: GIFT_GOLD }),
  embrace: (name) => t('legacy.deed.embraced', '{name} holds you close for a moment.', { name }),
  kiss: (name) => t('legacy.deed.kissed', '{name} kisses you back.', { name }),
  again: (name) => t('legacy.deed.again', '{name} laughs. "Once a day is plenty. Tomorrow."', { name }),
  notFriend: (name) => t('legacy.deed.notFriend', '{name} steps back. "We hardly know each other." (A hug needs them to count you a friend: regard +{at, number}.)', { name, at: FRIEND_AT }),
  notCourting: (name) => t('legacy.deed.notCourting', '{name} turns their cheek. "Not yet." (A kiss needs a courtship of {at, number} or more. Ask about Courtship once you’re friends.)', { name, at: KISS_AT }),
});
