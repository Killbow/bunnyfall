// @ts-check
// infection.js reads this leaf: import only the switch and text core, never clanLaw.js, which imports infection.js.

import { contentOn } from '../../mods/contentOff.js';
import { t } from '../../ui/textManager.js';

// Restated from infection.js VAMPIRE_CLANS so this leaf imports nothing of the curse.
const CLAN_IDS = Object.freeze([150, 151, 152, 153, 154, 155, 156, 157, 158]);
export const isClanId = (/** @type {unknown} */ c) => typeof c === 'number' && CLAN_IDS.includes(c);

export const bloodlineChoiceOn = () => contentOn('vampireBlood');
/** @param {any} entry */
export function turnMayProceed(entry) {
  if (!bloodlineChoiceOn() || entry?.infection !== 'Vampirism-Infection') return true;
  return isClanId(entry.chosenClan);
}

/** @param {any} entity */
export function vampirismInfection(entity) {
  return (entity?.activeEffects ?? []).find((a) => a && a.infection === 'Vampirism-Infection' && !a.deployed && !a.ended) ?? null;
}
/** @param {any} entity @param {number} clan */
export function claimBloodline(entity, clan) {
  const entry = vampirismInfection(entity);
  if (!entry || !isClanId(clan)) return false;
  entry.chosenClan = clan;
  return true;
}

let _seatsWords = () => '';
let _say = (/** @type {string} */ _s) => {};
export function setBloodlineHost({ seatsWords = null, say = null } = {}) {
  if (typeof seatsWords === 'function') _seatsWords = seatsWords;
  if (typeof say === 'function') _say = say;
}

/** @param {any} entry @param {number} currentDay @param {boolean} turnDue */
export function bloodlineNag(entry, currentDay, turnDue) {
  if (turnMayProceed(entry) || !entry?.dreamPlayed || entry.clanNagDay === currentDay) return;
  entry.clanNagDay = currentDay;
  const where = _seatsWords();
  _say(turnDue
    ? t('bloodline.nag.due', 'The turning waits in your veins. No bloodline has claimed you yet, so the change cannot finish. Go by night to a clan\'s Court: {where}.', { where })
    : t('bloodline.nag.dream', 'Something old is waking in your blood, and it wants a master. By night, the vampire clans hold Court in the back rooms of taverns: {where}. Choose one before the fever ends.', { where }));
}
