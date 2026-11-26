// @ts-check
import { MOBILE_TYPES as M } from '../../characters/mobileTypes.js';

export const FESTIVAL_UNDEAD = Object.freeze([M.SkeletalWarrior, M.Zombie, M.Ghost, M.Mummy, M.Wraith, M.Vampire, M.VampireAncient, M.Lich, M.AncientLich]);
export const FESTIVAL_SUMMONED = Object.freeze([M.FrostDaedra, M.FireDaedra, M.Daedroth, M.DaedraSeducer, M.DaedraLord, M.FireAtronach, M.IronAtronach, M.FleshAtronach, M.IceAtronach]);
export const hallowedFoe = (/** @type {any} */ e) => FESTIVAL_UNDEAD.includes(e?.mobileType) || FESTIVAL_SUMMONED.includes(e?.mobileType);
/** @returns {string|null} */
export function foeFindSource(/** @type {any} */ e) {
  if (e?.worldBoss === true) return null;
  if (e?.eliteFoe === true || (typeof e?.champion === 'string' && e.champion !== '')) return 'elite';
  if (FESTIVAL_UNDEAD.includes(e?.mobileType)) return 'undead';
  if (FESTIVAL_SUMMONED.includes(e?.mobileType)) return 'daedra';
  return 'foe';
}
