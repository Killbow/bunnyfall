// @ts-check
// BUNNYFALL VAMPIRE EXPANSION: THE BLOODLINE CHOSEN BEFORE THE TURN (the owner: "make it pickable before turning into a
// full on one"; asked, "At a Court, by night", "Must choose", existing vampires "One free re-pick").
//
// Daggerfall gives a new vampire the clan of the region they were bitten in (infection.js deployInfection's clanOf). Now
// an infected player - bitten, not yet turned - goes by night to a clan's Court (the back room of the taverns of its seat
// city: courtDoor.js, ui/vampire/courtWindow.js) and asks to be CLAIMED: the clan is written on the infection's entry
// (`chosenClan`) and the turn takes it. Until one is chosen the fourth day's death WAITS (infection.js infectionStep), and
// each new day after the dream says so, naming where the Courts meet (the host's `seatsWords`, world.js).
// With the expansion switched off (contentOff.js vampireBlood) Daggerfall's own rule stands and nothing waits.
//
// A LEAF beside infection.js (which reads it): it imports only the switch and the text core, so infection.js keeps its
// import graph - clanLaw.js imports infection.js, and so this must never import clanLaw.js.

import { contentOn } from '../../mods/contentOff.js';
import { t } from '../../ui/textManager.js';

/** The nine clans' faction ids (infection.js VAMPIRE_CLANS, restated so this leaf imports nothing of the curse). */
const CLAN_IDS = Object.freeze([150, 151, 152, 153, 154, 155, 156, 157, 158]);
export const isClanId = (/** @type {unknown} */ c) => typeof c === 'number' && CLAN_IDS.includes(c);

/** Whether the choice is asked at all (the expansion's switch). */
export const bloodlineChoiceOn = () => contentOn('vampireBlood');
/** Whether an infection's turn may go ahead: always for a lycanthrope or with the switch off; a vampirism infection once a
 *  clan has claimed it. @param {any} entry */
export function turnMayProceed(entry) {
  if (!bloodlineChoiceOn() || entry?.infection !== 'Vampirism-Infection') return true;
  return isClanId(entry.chosenClan);
}

/** The live vampirism infection on an entity (bitten, not yet turned), or null. @param {any} entity */
export function vampirismInfection(entity) {
  return (entity?.activeEffects ?? []).find((a) => a && a.infection === 'Vampirism-Infection' && !a.deployed && !a.ended) ?? null;
}
/** A Court claims the infected player. Answers whether it did. @param {any} entity @param {number} clan */
export function claimBloodline(entity, clan) {
  const entry = vampirismInfection(entity);
  if (!entry || !isClanId(clan)) return false;
  entry.chosenClan = clan;
  return true;
}

/** The host's words for where the Courts meet ("Daggerfall (Vraseth), Wayrest (Montalion), ..."), and its mouth. */
let _seatsWords = () => '';
let _say = (/** @type {string} */ _s) => {};
export function setBloodlineHost({ seatsWords = null, say = null } = {}) {
  if (typeof seatsWords === 'function') _seatsWords = seatsWords;
  if (typeof say === 'function') _say = say;
}

/** The day's reminder while no clan has claimed the infection (infection.js runInfections): once a day after the dream.
 *  @param {any} entry @param {number} currentDay @param {boolean} turnDue the fourth day has come */
export function bloodlineNag(entry, currentDay, turnDue) {
  if (turnMayProceed(entry) || !entry?.dreamPlayed || entry.clanNagDay === currentDay) return;
  entry.clanNagDay = currentDay;
  const where = _seatsWords();
  _say(turnDue
    ? t('bloodline.nag.due', 'The turning waits in your veins. No bloodline has claimed you, and none can finish what began. Go by night to a clan\'s Court: {where}.', { where })
    : t('bloodline.nag.dream', 'Something old is waking in your blood, and it wants a master. By night, the vampire clans hold Court in the back rooms of taverns: {where}. Choose one before the fever ends.', { where }));
}
