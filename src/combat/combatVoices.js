// Combat voice clips port the classic race and gender sound rules from Daggerfall Unity (MIT, Daggerfall Workshop).
import { RACES } from '../characters/races.js';
import { getBool } from '../platform/settings.js';

export const combatVoicesEnabled = () => getBool('Enhancements', 'CombatVoices');

export const ATTACK_VOICE_CHANCE = 20;
export const PAIN_VOICE_CHANCE = 40;

export const rollVoiceRace = (rolls = Math.random) => 1 + Math.floor(rolls() * 5);

const MALE_PAIN1 = Object.freeze({
  [RACES.Breton]: 390, [RACES.Redguard]: 393, [RACES.Nord]: 396,
  [RACES.DarkElf]: 399, [RACES.HighElf]: 402, [RACES.WoodElf]: 405,
  [RACES.Khajiit]: 408, [RACES.Argonian]: 411,
});

// Female voices share clips across races exactly as the classic tables do.
export function raceGenderAttackSound(race, gender, rolls = Math.random) {
  if (gender === 'male') return MALE_PAIN1[race] ?? -1;
  if (race === RACES.Breton || race === RACES.Redguard || race === RACES.Nord) {
    const r = Math.floor(rolls() * 3);
    return r === 0 ? 43 : r === 1 ? 44 : 53;
  }
  if (race === RACES.DarkElf || race === RACES.HighElf || race === RACES.WoodElf) {
    return Math.floor(rolls() * 2) === 0 ? 55 : 56;
  }
  if (race === RACES.Khajiit) return Math.floor(rolls() * 2) === 0 ? 61 : 62;
  if (race === RACES.Argonian) return Math.floor(rolls() * 2) === 0 ? 425 : 426;
  return -1;
}

export function raceGenderPainSound(race, gender, heavyDamage, rolls = Math.random) {
  if (gender === 'male') {
    const p1 = MALE_PAIN1[race];
    return p1 != null ? p1 + 1 : -1;
  }
  if (race === RACES.WoodElf || race === RACES.Khajiit) {
    return heavyDamage ? 59 : 58;
  }
  if (race === RACES.Breton || race === RACES.Redguard || race === RACES.Nord ||
      race === RACES.DarkElf || race === RACES.HighElf || race === RACES.Argonian) {
    if (heavyDamage) return 50;
    return Math.floor(rolls() * 2) === 0 ? 46 : 52;
  }
  return -1;
}

export function combatVoice({ race, gender, isAttack, heavyDamage = false, rolls = Math.random }) {
  let r = race;
  // Classic enemies voice a male High Elf as a Wood Elf. The player keeps their own race, so the player uses
  // playerVoice instead.
  if (gender === 'male' && r === RACES.HighElf) r = RACES.WoodElf;
  const clip = isAttack
    ? raceGenderAttackSound(r, gender, rolls)
    : raceGenderPainSound(r, gender, heavyDamage, rolls);
  return { clip, pitchLift: rolls() * 0.3 };
}

export const isHeavyDamage = (damage, maxHealth) => damage >= Math.trunc(maxHealth / 4);

export function playerVoice({ race, gender, isAttack, heavyDamage = false, rolls = Math.random }) {
  const clip = isAttack
    ? raceGenderAttackSound(race, gender, rolls)
    : raceGenderPainSound(race, gender, heavyDamage, rolls);
  return { clip, pitchLift: rolls() * 0.3 };
}
