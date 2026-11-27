// @ts-check
import { t, intlLocale } from '../../ui/textManager.js';

export const festivalName = () => t('festival.name', "The Witches' Festival");
export const vendorOffice = () => t('festival.vendor.office', 'Wyrd Sister');
export const cakesText = (/** @type {number} */ n) => t('festival.cakes', '{n, plural, one {# Soul Cake} other {# Soul Cakes}}', { n });

const REFUSALS = Object.freeze({
  closed: () => t('festival.refusal.closed', 'The festival is not open.'),
  guest: () => t('festival.refusal.guest', 'Link an account to keep Soul Cakes.'),
  offline: () => t('festival.refusal.offline', 'The Wyrd cannot hear you right now.'),
  cakes: () => t('festival.refusal.cakes', 'You need more Soul Cakes.'),
  owned: () => t('festival.refusal.owned', 'You already own that.'),
  ware: () => t('festival.refusal.ware', 'The Wyrd Sister has no such thing.'),
  empty: () => t('festival.refusal.empty', 'The bowl is empty.'),
  taken: () => t('festival.refusal.taken', 'You already took a cake here today.'),
  own: () => t('festival.refusal.own', 'This offering is your own.'),
  full: () => t('festival.refusal.full', 'The bowl is full.'),
  home: () => t('festival.refusal.home', 'Set it out at your own home.'),
  set: () => t('festival.refusal.set', 'An offering already stands here.'),
  room: () => t('festival.refusal.room', 'There is no room for it by this door.'),
  none: () => t('festival.refusal.none', 'No offering of yours stands here.'),
  item: () => t('festival.refusal.item', 'You have no Hearth Offering.'),
  gone: () => t('festival.refusal.gone', 'This offering has been taken in.'),
  held: () => t('festival.refusal.held', 'Your account does not hold that.'),
  capped: () => t('festival.refusal.capped', 'You have found enough for today.'),
  rate: () => t('festival.refusal.rate', 'Too fast. Wait a moment.'),
});
export const isFestivalRefusal = (/** @type {unknown} */ code) => typeof code === 'string' && Object.hasOwn(REFUSALS, code);
export const festivalRefusalText = (/** @type {unknown} */ code) => (typeof code === 'string' && Object.hasOwn(REFUSALS, code) ? REFUSALS[/** @type {keyof typeof REFUSALS} */ (code)]() : REFUSALS.offline());

export const findsFullText = (/** @type {number} */ n, /** @type {number} */ resetMs) => t('festival.finds.full', 'You have found all {n, number} Soul Cakes a day allows. More can be found from {time}.', { n, time: clockText(resetMs) });
export const findsTodayText = (/** @type {number} */ n, /** @type {number} */ max) => t('festival.finds.today', 'Found today: {n, number} of {max, number} Soul Cakes.', { n, max });
export const findsTodayFullText = (/** @type {number} */ max, /** @type {number} */ resetMs) => t('festival.finds.todayFull', 'Found today: all {max, number} Soul Cakes. More from {time}.', { max, time: clockText(resetMs) });
function clockText(/** @type {number} */ ms) {
  try { return new Intl.DateTimeFormat(intlLocale(), { hour: 'numeric', minute: '2-digit' }).format(new Date(ms)); } catch { return ''; }
}
export const cakesFoundText = (/** @type {number} */ n) => t('festival.found', '+{n, plural, one {# Soul Cake} other {# Soul Cakes}}', { n });
// `toMs` is exclusive, so the last day is the UTC date of the millisecond before it.
export function lastDayText(/** @type {{ toMs: number } | null | undefined} */ f) {
  if (!f) return '';
  try { return new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(f.toMs - 1)); } catch { return ''; }
}
export const festivalNotice = (/** @type {string} */ last) => t('festival.notice', "The Witches' Festival: until {last}. Find a Wyrd Sister at any tavern.", { last });
export const festivalNightText = () => t('festival.night', 'The dead walk tonight. Soul Cake finds are doubled.');
export const HARVEST_TEXT = Object.freeze({
  name: () => t('festival.harvest.name', 'Soul Harvest'),
  proc: (/** @type {number} */ n) => t('festival.harvest.proc', 'Soul Harvest! +{n}% health and magicka.', { n }),
  ready: () => t('festival.harvest.ready', 'Soul Harvest is ready again.'),
});
