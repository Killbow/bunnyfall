// @ts-check
import { gateHash } from '../../net/gateLaw.js';
import { STAR_SALT } from '../../net/starfall/starfallLaw.js';
import { t, getLocalizedFactionName } from '../../ui/textManager.js';

/**
 * @typedef {{ id: string, region: number, location: string, place: string|null, factionId: number, witches: string,
 *   member: () => string }} StarCoven
 */
/** @param {StarCoven} c @returns {Readonly<StarCoven>} */
const coven = (c) => Object.freeze(c);

// FACTION.TXT's region field for a coven does not name the MAPS.BSA region it is in, so each pair is written here.
export const STAR_COVENS = Object.freeze([
  coven({ id: 'marsh', region: 0, location: 'Coven_in_the_Marsh', place: 'Coven_in_the_Marsh', factionId: 426, witches: 'The_Witches_of_the_Marsh', member: () => t('starfall.member.marsh', 'Witch of the Marsh') }),
  coven({ id: 'devilrock', region: 1, location: 'Devilrock_Coven', place: 'DevilRockCoven', factionId: 421, witches: 'The_Witches_of_Devilrock', member: () => t('starfall.member.devilrock', 'Witch of Devilrock') }),
  coven({ id: 'peaks', region: 1, location: 'Coven_of_the_Peaks', place: 'Coven_of_the_Peaks', factionId: 427, witches: 'The_Mountain_Witches', member: () => t('starfall.member.peaks', 'Mountain Witch') }),
  coven({ id: 'kykos', region: 11, location: 'Kykos_Coven', place: 'KykosCoven', factionId: 430, witches: 'The_Sisters_of_Kykos', member: () => t('starfall.member.kykos', 'Sister of Kykos') }),
  coven({ id: 'bluff', region: 17, location: 'Coven_on_the_Bluff', place: 'BluffCoven', factionId: 423, witches: 'The_Sisters_of_the_Bluff', member: () => t('starfall.member.bluff', 'Sister of the Bluff') }),
  coven({ id: 'tamarilyn', region: 33, location: 'Tamarilyn_Coven', place: 'TamarilynCoven', factionId: 422, witches: 'The_Tamarilyn_Witches', member: () => t('starfall.member.tamarilyn', 'Tamarilyn Witch') }),
  coven({ id: 'alcaire', region: 34, location: 'Alcaire_Coven', place: 'AlcaireCoven', factionId: 432, witches: 'The_Witches_of_Alcaire', member: () => t('starfall.member.alcaire', 'Witch of Alcaire') }),
  coven({ id: 'skeffington', region: 38, location: 'Skeffington_Coven', place: 'SkeffingtonCoven', factionId: 425, witches: 'The_Skeffington_Witches', member: () => t('starfall.member.skeffington', 'Skeffington Witch') }),
  coven({ id: 'beldama', region: 41, location: 'Beldama_Coven', place: 'BeldamaCoven', factionId: 429, witches: 'The_Beldama', member: () => t('starfall.member.beldama', 'Beldam') }),
  coven({ id: 'daggerfall', region: 42, location: 'Daggerfall_Coven', place: null, factionId: 428, witches: 'The_Daggerfall_Witches', member: () => t('starfall.member.daggerfall', 'Daggerfall Witch') }),
  coven({ id: 'tide', region: 46, location: 'Coven_of_the_Tide', place: 'MyrkwasaCoven', factionId: 431, witches: 'The_Tide_Witches', member: () => t('starfall.member.tide', 'Tide Witch') }),
  coven({ id: 'dust', region: 55, location: 'Coven_of_Dust', place: 'Coven_of_Dust', factionId: 420, witches: 'The_Dust_Witches', member: () => t('starfall.member.dust', 'Dust Witch') }),
]);
// Glenmoril serves Hircine alone, and Wroth is in the open zone, where no world event runs.
export const STAR_COVENS_APART = Object.freeze([
  Object.freeze({ id: 'glenmoril', region: 60, location: 'Glenmoril_Coven', place: 'GlenmorilCoven', factionId: 419, witches: 'The_Glenmoril_Witches' }),
  Object.freeze({ id: 'wroth', region: 16, location: 'Wroth_Coven', place: 'WrothCoven', factionId: 424, witches: 'The_Daughters_of_Wroth' }),
]);

const spoken = (name) => name.replace(/_/g, ' ');
export const covenLocation = (c) => spoken(c.location);
export const covenFactionName = (c) => spoken(c.witches);
export const covenWitches = (c) => getLocalizedFactionName(c.factionId, covenFactionName(c));

function bagRound(round, n) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = gateHash(STAR_SALT, round, 11, i) % (i + 1);
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}
// Every coven takes a night before any takes a second, and a round never opens on the coven the last one closed on.
// Every client names the same coven for a night with no message sent.
/**
 * @param {number} n
 * @returns {Readonly<StarCoven>}
 */
export function starCovenOf(n) {
  const len = STAR_COVENS.length;
  const round = Math.floor(n / len), at = n - round * len;
  const bag = bagRound(round, len);
  if (bag[0] === bagRound(round - 1, len)[len - 1]) { const tmp = bag[0]; bag[0] = bag[1]; bag[1] = tmp; }
  return STAR_COVENS[bag[at]];
}
