// @ts-check
// Daggerfall creatures matched to Morrowind creatures. Each creature mobile maps to an ordered list of CREA ids,
// the first one the attached masters carry, or to a declared miss that keeps its Daggerfall sprite.
import { MOBILE_TYPES as M } from './mobileTypes.js';
import { ENEMY_BASICS, isClassEnemyId } from './enemyBasics.js';
import { BaseImageFile } from '../formats/baseImageFile.js';

/**
 * @type {Readonly<Record<number, { creature?: string[], miss?: string, veil?: boolean, flies?: boolean }>>}
 */
export const CREATURE_MATCH = Object.freeze({
  [M.Rat]: { creature: ['rat'] },
  [M.Imp]: { miss: 'a flyer - Morrowind\'s scamp walks, and no imp flies there' },
  [M.Spriggan]: { creature: ['bm_spriggan'] },
  [M.GiantBat]: { miss: 'no bat walks Morrowind' },
  [M.GrizzlyBear]: { creature: ['bm_bear_black'] },
  [M.SabertoothTiger]: { miss: 'no great cat' },
  [M.Spider]: { miss: 'no giant spider (the centurion spider is a Dwemer machine)' },
  [M.Orc]: { miss: 'an orc is a person - Morrowind\'s Orc (MWNPC12, foeBodies.js isPersonFoe), never a creature' },
  [M.Centaur]: { miss: 'no centaur' },
  [M.Werewolf]: { miss: 'a werewolf is a person in its beast form - Bloodmoon\'s wolf (MWNPC15, foeBodies.js isPersonFoe), never a creature' },
  [M.Nymph]: { miss: 'no nymph' },
  [M.Slaughterfish]: { miss: 'a water creature - the swimming groups are not driven yet' },
  [M.OrcSergeant]: { miss: 'an orc is a person' },
  [M.Harpy]: { miss: 'no harpy' },
  [M.Wereboar]: { miss: 'no wereboar' },
  [M.SkeletalWarrior]: { creature: ['skeleton warrior', 'skeleton'] },
  [M.Giant]: { creature: ['bm_frost_giant'] },
  [M.Zombie]: { creature: ['bonewalker'] },
  [M.Ghost]: { creature: ['ancestor_ghost'], veil: true },
  [M.Mummy]: { creature: ['draugr'] },
  [M.GiantScorpion]: { miss: 'no giant scorpion' },
  [M.OrcShaman]: { miss: 'an orc is a person' },
  [M.Gargoyle]: { miss: 'no gargoyle' },
  [M.Wraith]: { creature: ['ancestor_ghost'], veil: true },
  [M.OrcWarlord]: { miss: 'an orc is a person' },
  [M.FrostDaedra]: { creature: ['atronach_frost'] },
  [M.FireDaedra]: { creature: ['atronach_flame'] },
  [M.Daedroth]: { creature: ['daedroth'] },
  [M.Vampire]: { miss: 'a vampire is a person - its race\'s vampire head (MWNPC14, foeBodies.js isPersonFoe), never a creature' },
  [M.DaedraSeducer]: { creature: ['winged twilight'], flies: true },
  [M.VampireAncient]: { miss: 'a vampire is a person' },
  [M.DaedraLord]: { creature: ['dremora_lord'] },
  [M.Lich]: { creature: ['lich'] },
  [M.AncientLich]: { creature: ['lich'] },
  [M.Dragonling]: { miss: 'no dragon' },
  [M.FireAtronach]: { creature: ['atronach_flame'] },
  [M.IronAtronach]: { creature: ['atronach_storm'] },
  [M.FleshAtronach]: { miss: 'no flesh atronach' },
  [M.IceAtronach]: { creature: ['atronach_frost'] },
  [M.Horse_Invalid]: { miss: 'not a foe' },
  [M.Dragonling_Alternate]: { miss: 'no dragon' },
  [M.Dreugh]: { miss: 'a water creature - the swimming groups are not driven yet' },
  [M.Lamia]: { miss: 'no lamia' },
});

export const SPECTRAL_VEIL = Object.freeze({ mode: 3, alpha: BaseImageFile.SPECTRAL_ALPHA / 255, t: 0, phase: 0 });

const lookOf = (m) => Object.freeze({ creature: Object.freeze([...m.creature]), ...(m.veil ? { veil: SPECTRAL_VEIL } : {}), ...(m.flies ? { flies: true } : {}) });
const LOOKS = new Map(Object.entries(CREATURE_MATCH).filter(([, m]) => m.creature).map(([t, m]) => [Number(t), lookOf(m)]));

/**
 * @type {Map<number, Readonly<{ creature?: string[], miss?: string, veil?: boolean, flies?: boolean }>>}
 */
const _modMatch = new Map();
export function registerCreatureMatches(rows) {
  for (const [t, m] of rows) {
    if (!Number.isInteger(t) || t in CREATURE_MATCH || _modMatch.has(t)) throw new Error(`registerCreatureMatches: mobile ${t} is already named`);
    if (isClassEnemyId(t)) throw new Error(`registerCreatureMatches: mobile ${t} is a class - a person (foeBodies.js registerPersonFoes), never a creature`);
    if (!!m.creature === !!m.miss) throw new Error(`registerCreatureMatches: mobile ${t} is a match or a miss, never both`);
    if (m.creature && !(m.creature.length && m.creature.every((id) => typeof id === 'string' && id === id.toLowerCase() && id.trim() === id))) throw new Error(`registerCreatureMatches: mobile ${t}'s ids as the reader keeps them (lower case, trimmed)`);
    if (m.miss && !(String(m.miss).length > 4)) throw new Error(`registerCreatureMatches: mobile ${t}'s miss says why`);
    const b = ENEMY_BASICS[t]?.behaviour ?? 'General';
    if (m.creature && (b === 'Aquatic' || (b === 'Flying' && !m.flies))) throw new Error(`registerCreatureMatches: mobile ${t} (${b}) needs a Morrowind creature that moves as it does`);
    _modMatch.set(t, Object.freeze({ ...m, ...(m.creature ? { creature: Object.freeze([...m.creature]) } : {}) }));
    if (m.creature) LOOKS.set(t, lookOf(m));
  }
}
export const creatureMatch = (t) => CREATURE_MATCH[t] ?? _modMatch.get(t) ?? null;
export function _resetCreatureMatches() {
  for (const t of _modMatch.keys()) LOOKS.delete(t);
  _modMatch.clear();
}

/**
 * @param {any} f
 */
export function creatureLook(f) {
  const look = (f && LOOKS.get(f.mobileType)) ?? null;
  // The Daedra Seducer in her mortal guise keeps her sprite: the match is the winged daedra she becomes.
  if (f?.mobileType === M.DaedraSeducer && f.mobile && !f.mobile.specialTransformationCompleted) return null;
  if (look?.veil) {
    const a = f.mobileArchive ?? f.archive, b = ENEMY_BASICS[f.mobileType];
    if (a != null && b && a !== b.maleTexture && a !== b.femaleTexture) return null;
  }
  return look;
}
