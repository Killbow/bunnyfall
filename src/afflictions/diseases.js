import { savingThrow, EFFECT_FLAGS } from '../magic/spellcast.js';
import { isEntityImmuneToDisease } from '../magic/effects.js';
import { INFECTION, startInfection } from './infection.js';
import { FATIGUE_MULTIPLIER } from '../characters/statMods.js';
import { dice100, formulaOverride } from '../combat/formulas.js';
import { MOBILE_TYPES } from '../characters/mobileTypes.js';
import { localizedText } from '../ui/textManager.js';
import { noteFirstUse } from '../ui/tutorials.js';

export const DISEASES = Object.freeze({
  None: -1,
  WitchesPox: 0, Plague: 1, YellowFever: 2, StomachRot: 3,
  Consumption: 4, BrainFever: 5, SwampRot: 6, CalironsCurse: 7,
  Cholera: 8, Leprosy: 9, WoundRot: 10, RedDeath: 11, BloodRot: 12,
  TyphoidFever: 13, Dementia: 14, Chrondiasis: 15, WizardFever: 16,
});

export const PERMANENT_DISEASE_VALUE = 0xff;
export const COMPLETED_DISEASE_VALUE = 0xfe;

const D = (STR, INT, WIL, AGI, END, PER, SPD, LUC, HEA, FAT, SPL, minDamage, maxDamage, daysOfSymptomsMin, daysOfSymptomsMax) =>
  Object.freeze({ STR, INT, WIL, AGI, END, PER, SPD, LUC, HEA, FAT, SPL, minDamage, maxDamage, daysOfSymptomsMin, daysOfSymptomsMax });
// One row per DISEASES id, in order, matching the classic Daggerfall disease table.
export const DISEASE_DATA = Object.freeze([
  D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 2, 10, 0xFF, 0xFF),
  D(1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 30, 0xFF, 0xFF),
  D(0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 5, 10, 0xFF, 0xFF),
  D(0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 5, 0xFF, 0xFF),
  D(1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 2, 10, 0xFF, 0xFF),
  D(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 5, 0xFF, 0xFF),
  D(1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 2, 10, 0xFF, 0xFF),
  D(1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 5, 10, 3, 18),
  D(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 5, 30, 0xFF, 0xFF),
  D(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 5, 30, 0xFF, 0xFF),
  D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 2, 4, 0xFF, 0xFF),
  D(0, 0, 0, 0, 1, 1, 0, 0, 0, 1, 0, 2, 10, 0xFF, 0xFF),
  D(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 5, 10, 3, 18),
  D(0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 2, 10, 0xFF, 0xFF),
  D(0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 2, 10, 0xFF, 0xFF),
  D(0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 5, 10, 0xFF, 0xFF),
  D(0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 4, 3, 18),
]);

export const isDiseasePermanent = (data) => data.daysOfSymptomsMin === PERMANENT_DISEASE_VALUE;

export const contractedMessageRecord = (diseaseType) => 100 + diseaseType;

export const DISEASE_NAMES = Object.freeze([
  "Witches' Pox", 'Plague', 'Yellow Fever', 'Stomach Rot', 'Consumption', 'Brain Fever', 'Swamp Rot', "Caliron's Curse",
  'Cholera', 'Leprosy', 'Wound Rot', 'Red Death', 'Blood Rot', 'Typhoid Fever', 'Dementia', 'Chrondiasis', 'Wizard Fever',
]);

export const YOU_FEEL_SOMEWHAT_BAD = 'You feel somewhat bad.';
export const youFeelSomewhatBadText = () => localizedText('youFeelSomewhatBad', YOU_FEEL_SOMEWHAT_BAD);

export const DISEASE_LIST_A = Object.freeze([DISEASES.Plague]);
export const DISEASE_LIST_B = Object.freeze([DISEASES.Plague, DISEASES.StomachRot, DISEASES.BrainFever]);
export const DISEASE_LIST_C = Object.freeze([
  DISEASES.Plague, DISEASES.YellowFever, DISEASES.StomachRot, DISEASES.Consumption,
  DISEASES.BrainFever, DISEASES.SwampRot, DISEASES.Cholera, DISEASES.Leprosy, DISEASES.RedDeath,
  DISEASES.TyphoidFever, DISEASES.Dementia,
]);

export const SPECIAL_INFECTION_CHANCE = 0.6;

export const SPIDER_TOUCH_SPELL_INDEX = 66;

export function startDisease(target, diseaseType, currentDay, rolls = Math.random, { specialInfection = false } = {}) {
  if (!specialInfection && isEntityImmuneToDisease(target)) return null;
  if (!target.isPlayer || (target.level ?? 0) < 2) return null;
  if (target.activeEffects?.some((a) => a.kind === 'disease' && a.disease === diseaseType && !a.ended)) return null;
  noteFirstUse('afflictions');
  const data = DISEASE_DATA[diseaseType];
  const entry = {
    kind: 'disease', disease: diseaseType, permanent: true,
    incubationOver: false, lastDay: currentDay, daysOfSymptomsLeft: 0,
    statMods: {},
  };
  if (!isDiseasePermanent(data)) {
    entry.daysOfSymptomsLeft = data.daysOfSymptomsMin + Math.floor(rolls() * (data.daysOfSymptomsMax + 1 - data.daysOfSymptomsMin));
  }
  target.activeEffects = target.activeEffects || [];
  target.activeEffects.push(entry);
  return entry;
}

export const diseaseCount = (entity) =>
  (entity?.activeEffects ?? []).filter((a) => a.kind === 'disease' && !a.ended).length;
export const diseaseIncubating = (a) => a?.kind === 'disease' && !a.ended && !a.incubationOver && a.disease != null;
export const curableDiseaseCount = (entity) => {
  const live = (entity?.activeEffects ?? []).filter((a) => a.kind === 'disease' && !a.ended);
  return live.filter((a) => !a.infection).length || live.length;
};

export function endDisease(entry) {
  entry.daysOfSymptomsLeft = COMPLETED_DISEASE_VALUE;
  entry.ended = true;
}

function incrementDailyDiseaseEffects(entry, sinks, rolls) {
  const data = DISEASE_DATA[entry.disease];
  const damageAmount = data.minDamage + Math.floor(rolls() * (data.maxDamage + 1 - data.minDamage));
  const mods = entry.statMods;
  const change = (stat, mult) => { if (mult) mods[stat] = (mods[stat] ?? 0) - mult * damageAmount; };
  change('strength', data.STR);
  change('intelligence', data.INT);
  change('willpower', data.WIL);
  change('agility', data.AGI);
  change('endurance', data.END);
  change('personality', data.PER);
  change('speed', data.SPD);
  change('luck', data.LUC);
  if (data.HEA && sinks.hurt) sinks.hurt(data.HEA * damageAmount);
  // The FAT column drains raw fatigue points without the x64 multiplier, as Daggerfall Unity does.
  if (data.FAT && sinks.drainFatigue) sinks.drainFatigue(data.FAT * damageAmount);
  if (data.SPL && sinks.drainMagicka) sinks.drainMagicka(data.SPL * damageAmount);
}

export function updateDiseaseEntry(entry, currentDay, sinks, rolls = Math.random, onAlert = null) {
  // Vampirism and lycanthropy infections have no disease data row; infection.js runs their whole lifecycle.
  if (entry.infection) return;
  if (entry.ended) return;
  const daysPast = currentDay - entry.lastDay;
  if (daysPast === 0 || entry.daysOfSymptomsLeft === COMPLETED_DISEASE_VALUE) return;
  if (!entry.incubationOver) entry.incubationOver = true;
  for (let i = 0; i < daysPast; i++) incrementDailyDiseaseEffects(entry, sinks, rolls);
  entry.lastDay = currentDay;
  const data = DISEASE_DATA[entry.disease];
  if (!isDiseasePermanent(data) && (entry.daysOfSymptomsLeft -= daysPast) <= 0) {
    entry.daysOfSymptomsLeft = 0;
    endDisease(entry);
  }
  if (onAlert) onAlert(youFeelSomewhatBadText());
}

// Call before tickActiveEffects so the final day of a disease applies and the same round then removes the entry.
export function updateDiseases(entity, currentDay, sinks, rolls = Math.random, onAlert = null) {
  for (const a of entity.activeEffects ?? []) {
    if (a.kind === 'disease') updateDiseaseEntry(a, currentDay, sinks, rolls, onAlert);
  }
}

export function inflictDisease(target, diseaseList, { rolls = Math.random, currentDay = 0, onContract = null } = {}) {
  if (!diseaseList || !diseaseList.length || !target.isPlayer) return null;
  // Immunity is checked later in startDisease so an immune target still consumes both rolls, keeping the RNG order.
  if (target.level === 1) return null;
  if (savingThrow(2, EFFECT_FLAGS.Disease, target, 0, rolls) === 0) return null;
  const diseaseType = diseaseList[Math.floor(rolls() * diseaseList.length)];
  const entry = startDisease(target, diseaseType, currentDay, rolls);
  if (entry && onContract) onContract(diseaseType, entry);
  return entry;
}

export function fatigueDamage(target, damage, sinks) {
  if (sinks?.drainFatigue) sinks.drainFatigue(damage * 2 * FATIGUE_MULTIPLIER);
}

export function onMonsterHit(attacker, target, damage, deps = {}) {
  const o = formulaOverride('onMonsterHit');
  if (o) { o(attacker, target, damage, deps); return; }
  runMonsterHitArm(CLASSIC_HIT_ARM[attacker.careerIndex] ?? 0, attacker, target, damage, deps);
}

export const CLASSIC_HIT_ARM = Object.freeze({
  [MOBILE_TYPES.Rat]: 1, [MOBILE_TYPES.GiantBat]: 2, [MOBILE_TYPES.Spider]: 3, [MOBILE_TYPES.GiantScorpion]: 3,
  [MOBILE_TYPES.Werewolf]: 4, [MOBILE_TYPES.Nymph]: 5, [MOBILE_TYPES.Lamia]: 5, [MOBILE_TYPES.Wereboar]: 6,
  [MOBILE_TYPES.Zombie]: 7, [MOBILE_TYPES.Mummy]: 8, [MOBILE_TYPES.Vampire]: 9, [MOBILE_TYPES.VampireAncient]: 9,
});
export const MONSTER_HIT_ARMS = 9;

export function runMonsterHitArm(arm, attacker, target, damage, deps = {}) {
  const { rolls = Math.random, currentDay = 0, sinks = null, onContract = null } = deps;
  const inflict = (list) => inflictDisease(target, list, { rolls, currentDay, onContract });
  switch (arm) {
    // Rats use list B instead of classic list A, as Daggerfall Unity does.
    case 1:
      if (dice100(5, rolls())) inflict(DISEASE_LIST_B);
      break;
    case 2:
      if (dice100(2, rolls())) inflict(DISEASE_LIST_B);
      break;
    case 3:
      if (!target.activeEffects?.some((a) => a.kind === 'paralyze')) deps.readySpell?.(SPIDER_TOUCH_SPELL_INDEX);
      break;
    case 4: {
      const random = rolls() * 100;
      if (random <= SPECIAL_INFECTION_CHANCE && target.isPlayer) {
        startInfection(target, INFECTION.Werewolf, { day: currentDay, regionIndex: deps.regionIndex ?? -1 });
      }
      break;
    }
    case 5:
      fatigueDamage(target, damage, sinks);
      break;
    case 6: {
      const random = rolls() * 100;
      if (random <= SPECIAL_INFECTION_CHANCE && target.isPlayer) {
        startInfection(target, INFECTION.Wereboar, { day: currentDay, regionIndex: deps.regionIndex ?? -1 });
      }
      break;
    }
    case 7:
      if (dice100(2, rolls())) inflict(DISEASE_LIST_C);
      break;
    case 8:
      if (dice100(5, rolls())) inflict(DISEASE_LIST_C);
      break;
    case 9: {
      const random = rolls() * 100;
      if (random <= SPECIAL_INFECTION_CHANCE && target.isPlayer) {
        startInfection(target, INFECTION.Vampirism, { day: currentDay, regionIndex: deps.regionIndex ?? -1 });
      } else if (random <= 2.0) {
        inflict(DISEASE_LIST_A);
      }
      break;
    }
    default:
      break;
  }
}
