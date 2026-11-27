// @ts-check
import { MOBILE_TYPES as M } from '../../characters/mobileTypes.js';
import { enemyDisplayName } from '../../characters/enemyBasics.js';
import { starRoll, STAR_WAVES } from '../../net/starfall/starfallLaw.js';
import { getLocalizedEnemyName, t } from '../../ui/textManager.js';

export const STAR_MEMBERS = Object.freeze([M.Mage, M.Sorcerer, M.Battlemage, M.Nightblade]);
export const MEMBER = -1;
// Classic monsters have fixed levels and some need a metal to hit, so a band spawns only enemies its players hurt.
export const STAR_ROSTERS = Object.freeze({
  1: Object.freeze([
    Object.freeze([MEMBER]),
    Object.freeze([M.Spider, M.Spriggan, M.GiantBat]),
    Object.freeze([M.Spider, M.Spriggan, MEMBER]),
    Object.freeze([M.Nightblade, M.Spider]),
  ]),
  2: Object.freeze([
    Object.freeze([MEMBER]),
    Object.freeze([M.Spider, M.SkeletalWarrior, M.Zombie, M.Spriggan]),
    Object.freeze([M.FireAtronach, M.IceAtronach, M.SkeletalWarrior, MEMBER]),
    Object.freeze([M.Nightblade, M.Assassin, M.Spider]),
  ]),
  3: Object.freeze([
    Object.freeze([MEMBER]),
    Object.freeze([M.SkeletalWarrior, M.Wraith, M.IronAtronach, M.FleshAtronach]),
    Object.freeze([M.FireAtronach, M.IceAtronach, M.Daedroth, MEMBER]),
    Object.freeze([M.DaedraSeducer, M.Assassin, M.FireDaedra, M.FrostDaedra]),
  ]),
});

// As in classic, a witches' coven's people are always female.
export const covenFemale = (career) => STAR_MEMBERS.includes(career) || career === M.DaedraSeducer;
const bandOk = (b) => Math.max(1, Math.min(3, b | 0));
const pick = (roster, r) => { const c = roster[r % roster.length]; return c === MEMBER ? STAR_MEMBERS[(r >>> 8) % STAR_MEMBERS.length] : c; };

// Every pick is the star's own roll, so any owner spawns the same enemies.
/**
 * @param {number} n
 * @param {number} k
 * @param {number} w
 * @param {number} size
 * @param {number} band
 * @returns {number[]}
 */
export function starWaveFoes(n, k, w, size, band) {
  const roster = STAR_ROSTERS[bandOk(band)][Math.max(1, Math.min(STAR_WAVES, w | 0)) - 1];
  return Array.from({ length: Math.max(0, size | 0) }, (_, i) => pick(roster, starRoll(n, k, 300 + w * 32 + i)));
}

export const STAR_MASTERS = Object.freeze({
  mother: Object.freeze({ id: 'mother', career: M.Sorcerer, female: true, name: () => t('starfall.master.mother', 'The Coven Mother'), call: () => t('starfall.master.mother.call', 'The Coven Mother comes for the star!'), circle: () => t('starfall.master.mother.circle', 'The Coven Mother calls her circle. Break it!') }),
  flesh: Object.freeze({ id: 'flesh', career: M.FleshAtronach, female: false, name: () => getLocalizedEnemyName(M.FleshAtronach, enemyDisplayName(M.FleshAtronach)), call: () => t('starfall.master.flesh.call', 'A Flesh Atronach rises from the crater!'), circle: () => t('starfall.master.flesh.circle', 'The Flesh Atronach calls its circle. Break it!') }),
  lord: Object.freeze({ id: 'lord', career: M.DaedraLord, female: false, name: () => getLocalizedEnemyName(M.DaedraLord, enemyDisplayName(M.DaedraLord)), call: () => t('starfall.master.lord.call', 'A Daedra Lord answers the coven!'), circle: () => t('starfall.master.lord.circle', 'The Daedra Lord calls its circle. Break it!') }),
  seducer: Object.freeze({ id: 'seducer', career: M.DaedraSeducer, female: true, name: () => getLocalizedEnemyName(M.DaedraSeducer, enemyDisplayName(M.DaedraSeducer)), call: () => t('starfall.master.seducer.call', 'Mephala sends a Daedra Seducer!'), circle: () => t('starfall.master.seducer.circle', 'The Daedra Seducer calls her circle. Break it!') }),
  lich: Object.freeze({ id: 'lich', career: M.AncientLich, female: false, name: () => getLocalizedEnemyName(M.AncientLich, enemyDisplayName(M.AncientLich)), call: () => t('starfall.master.lich.call', 'The chant wakes an Ancient Lich!'), circle: () => t('starfall.master.lich.circle', 'The Ancient Lich calls its circle. Break it!') }),
});
export const STAR_MASTER_TABLE = Object.freeze({
  1: Object.freeze(['mother', 'mother', 'mother']),
  2: Object.freeze(['mother', 'flesh', 'mother']),
  3: Object.freeze(['lord', 'seducer', 'lich']),
});
export const starMasterOf = (band, k) => STAR_MASTERS[STAR_MASTER_TABLE[bandOk(band)][Math.max(0, Math.min(2, k | 0))]];
export function starCircleFoes(n, k, call, size, band) {
  const roster = STAR_ROSTERS[bandOk(band)][STAR_WAVES - 1];
  return Array.from({ length: Math.max(0, size | 0) }, (_, i) => pick(roster, starRoll(n, k, 500 + call * 16 + i)));
}
