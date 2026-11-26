// Roleplay & Realism 1.8 (Hazelnut, MIT): the rules InitMod registers, hooks, or replaces
// under each module switch, one function per C# member.

import { modSetting } from './modSettings.js';
import { WEAPONS, weaponMaterialModifier } from '../characters/weapons.js';
import { MOBILE_TYPES } from '../characters/mobileTypes.js';
import { swingFrameSeconds, swingHandling, swingHeft } from '../characters/weaponStates.js';

export const RR_VENDOR = 'roleplay-realism';
export const RR_MOD = Object.freeze({ title: 'RoleplayRealism', version: '1.8', guid: 'd828b782-46e9-40e7-8ae6-19cde308032e' });
export const rrEnabled = () => modSetting(RR_VENDOR, 'Enabled') === true;
export const rrModule = (key) => rrEnabled() && modSetting(RR_VENDOR, key) === true;
export const rrSetting = (key) => modSetting(RR_VENDOR, key);

export const ENC_EFFECT_SCALE_FACTOR = 2;
export const LOAN_VALUES = Object.freeze([2000, 4000, 6000, 8000, 10000, 20000, 30000, 40000, 50000]);
export const BED_MODELS = Object.freeze([41000, 41001, 41002]);

const isBow = (weapon) => weapon?.templateIndex === WEAPONS.Short_Bow || weapon?.templateIndex === WEAPONS.Long_Bow;
export function rrAdjustWeaponHitChanceMod(hitChanceMod, weaponAnimTime, weapon) {
  if (!(weaponAnimTime > 0 && isBow(weapon))) return hitChanceMod;
  let adjusted = hitChanceMod;
  if (weaponAnimTime < 200) adjusted -= 40;
  else if (weaponAnimTime < 500) adjusted -= 10;
  else if (weaponAnimTime < 1000) adjusted = hitChanceMod;
  else if (weaponAnimTime < 2000) adjusted += 10;
  else if (weaponAnimTime > 5000) adjusted -= 10;
  else if (weaponAnimTime > 8000) adjusted -= 20;
  return adjusted;
}
export function rrAdjustWeaponAttackDamage(damage, weaponAnimTime, weapon) {
  if (!(weaponAnimTime > 0 && isBow(weapon))) return damage;
  let adjusted = damage;
  if (weaponAnimTime < 800) adjusted *= weaponAnimTime / 800;
  else if (weaponAnimTime < 5000) adjusted = damage;
  else if (weaponAnimTime < 6000) adjusted *= 0.85;
  else if (weaponAnimTime < 8000) adjusted *= 0.75;
  else if (weaponAnimTime < 9000) adjusted *= 0.5;
  else if (weaponAnimTime >= 9000) adjusted *= 0.25;
  return Math.trunc(adjusted);
}

export const NO_CLIMB_HOLDING_WEAPON = "You can't climb whilst holding your weapon.";
export function rrParkourRefusal({ weaponDrawn = false, weaponMelee = true } = {}) {
  return weaponDrawn && !weaponMelee ? NO_CLIMB_HOLDING_WEAPON : null;
}
export function rrClimbingChance(base, { climbing = 0, luck = 0, khajiit = false, enhanced = false, weaponDrawn = false, weaponMelee = true, say = null } = {}) {
  if (weaponDrawn && !weaponMelee) { say?.(NO_CLIMB_HOLDING_WEAPON); return 0; }
  let skill = climbing + (khajiit ? 30 : 0);
  if (enhanced) skill *= 2;
  skill = Math.min(95, Math.max(5, skill));
  const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));
  const luckFactor = lerp(0, 10, luck * 0.01);
  return Math.trunc(lerp(base, 100, skill * 0.01) + luckFactor);
}

export function rrMeleeWeaponAnimTime({ liveSpeed, liveStrength, weaponType = -1, hands = 'One', weight = 0, shortBlade = false }) {
  let spdRatio = 0.8, strRatio = 0.2, capRatio = 0.08;
  if (hands === 'Both') { spdRatio = 0.5; strRatio = 0.5; capRatio = 0.15; }
  else if (shortBlade || weaponType === 4 || weaponType === 5) { spdRatio = 0.9; strRatio = 0.1; capRatio = 0.03; }
  else if (weaponType === 15) { spdRatio = 1; strRatio = 0; capRatio = 0; }
  if (liveSpeed > 70) spdRatio -= capRatio;
  if (liveStrength > 70) strRatio -= capRatio;
  const blend = (liveSpeed * spdRatio) + (liveStrength * strRatio);
  return swingFrameSeconds(blend, { heft: swingHeft(weight, liveStrength), handling: swingHandling(weaponType, hands === 'Both', shortBlade) });
}

export const rrWeaponToHit = (weapon) => weaponMaterialModifier(weapon?.material ?? 0) * 3;

export function rrConditionDamageThroughPhysicalHit(item, damage, lower) {
  if (item?.group !== 'Armor') return false;
  lower(item, damage * 5);
  return true;
}

export const rrDamageModifierClassic = (strength) => Math.floor((strength - 50) / 10);

export const rrLoanMaxPerLevel = () => LOAN_VALUES[rrSetting('loanAmountPerLevel') ?? 4] ?? LOAN_VALUES[4];
export const rrMaxBankLoan = (level) => (rrEnabled() ? (level | 0) * rrLoanMaxPerLevel() : null);

export function rrShipAvailable({ onShip = false, locationLoaded = false, portTown = null, ownsShip = false } = {}) {
  if (!rrModule('shipPorts')) return null;
  if (onShip) return true;
  if (locationLoaded) {
    if (portTown == null) return null;
    return portTown && ownsShip;
  }
  return false;
}

export function rrEncumbranceEffect({ carriedWeight = 0, maxEncumbrance = 1, liveSpeed = 50, permanentSpeed = 50, currentFatigue = 0 } = {}) {
  const encPc = Math.fround(Math.min(maxEncumbrance > 0 ? Math.fround(carriedWeight / maxEncumbrance) : 0, 1.2));
  const encOver = Math.fround(Math.fround(Math.max(Math.fround(encPc - 0.75), 0)) * ENC_EFFECT_SCALE_FACTOR);
  if (!(encOver > 0)) return null;
  const speedEffect = Math.min(liveSpeed - 2, Math.trunc(Math.fround(permanentSpeed * encOver)));
  const fatigueEffect = Math.min(currentFatigue - 100, Math.trunc(Math.fround(encOver * 100)));
  return { encPc, encOver, speedEffect, fatigueEffect };
}

export const rrBandageHeal = (medical, maxHealth) => Math.trunc(Math.min(Math.trunc(medical / 2), maxHealth * 0.4));

export function rrDouseOnDungeonExit(entity, { isDay = false } = {}) {
  if (!rrModule('autoExtinguishLight') || !entity?.lightSource || !isDay) return null;
  const item = entity.lightSource;
  entity.lightSource = null;
  return item;
}

export const RR_POTION_RECIPES = Object.freeze([
  Object.freeze({ name: 'cureDisease', price: 100, ingredients: [31, 56, 62], effect: '3,0', displayName: 'Cure Disease', textureRecord: 35, settings: { chanceMod: 10 } }),
  Object.freeze({ name: 'purification', price: 500, ingredients: [3, 31, 39, 49, 56, 60, 62, 63], effect: '3,0', displayName: 'Purification', textureRecord: 35, settings: { chanceMod: 10, magnitudeBaseLow: 5, magnitudeBaseHigh: 5, magnitudeLevelBase: 19, magnitudeLevelHigh: 19 }, secondary: ['10,8', '3,1'] }),
]);

export const RR_ENEMY_APPEARANCE = Object.freeze({
  [MOBILE_TYPES.Sorcerer]: Object.freeze({
    maleTexture: 476, femaleTexture: 475, hasRangedAttack1: false, castsMagic: true,
    primaryAttackAnimFrames: [0, 1, -1, 2, 3, 4, 5], chanceForAttack2: 33, primaryAttackAnimFrames2: [5, 4, 3, -1, 2, 1, 0],
    chanceForAttack3: 33, primaryAttackAnimFrames3: [0, 1, -1, 2, 2, 1, 0], hasSpellAnimation: true, spellAnimFrames: [0, 1, 2, 3, 3],
  }),
  [MOBILE_TYPES.Bard]: Object.freeze({
    maleTexture: 482, femaleTexture: 481, primaryAttackAnimFrames: [0, 1, -1, 2, 3, 4, -1, 5],
    chanceForAttack2: 50, primaryAttackAnimFrames2: [3, 4, -1, 5, 0], chanceForAttack3: 0,
  }),
  [MOBILE_TYPES.Rogue]: Object.freeze({
    maleTexture: 488, femaleTexture: 487, primaryAttackAnimFrames: [0, 0, 1, -1, 2, 2, 1, 0],
    primaryAttackAnimFrames2: [0, 1, -1, 2, 3, 4, 5], primaryAttackAnimFrames3: [5, 5, 3, -1, 2, 1, 0],
  }),
  [MOBILE_TYPES.Archer]: Object.freeze({
    maleTexture: 480, femaleTexture: 479, primaryAttackAnimFrames: [0, 1, -1, 2, 3, 4, -1, 5, 0],
    chanceForAttack2: 33, primaryAttackAnimFrames2: [4, 4, -1, 5, 0, 0], chanceForAttack3: 33, primaryAttackAnimFrames3: [4, -1, 5, 0, 0, 1, -1, 2, 3, 4, -1, 5, 0],
  }),
  [MOBILE_TYPES.Ranger]: Object.freeze({
    maleTexture: 480, femaleTexture: 479, primaryAttackAnimFrames: [0, 1, -1, 2, 3, 4, -1, 5, 0],
    chanceForAttack2: 33, primaryAttackAnimFrames2: [4, 4, -1, 5, 0, 0], chanceForAttack3: 33, primaryAttackAnimFrames3: [4, -1, 5, 0, 0, 1, -1, 2, 3, 4, -1, 5, 0],
  }),
  [MOBILE_TYPES.Barbarian]: Object.freeze({
    maleTexture: 482, femaleTexture: 481, primaryAttackAnimFrames: [0, 1, -1, 2, 3, 4, -1, 5],
    chanceForAttack2: 50, primaryAttackAnimFrames2: [3, 4, -1, 5, 0], chanceForAttack3: 0,
  }),
  [MOBILE_TYPES.Warrior]: Object.freeze({
    maleTexture: 478, femaleTexture: 477, primaryAttackAnimFrames: [0, 1, 2, -1, 3, 4, 5],
    chanceForAttack2: 50, primaryAttackAnimFrames2: [4, 5, -1, 3, 2, 1, 0], chanceForAttack3: 0,
  }),
  [MOBILE_TYPES.Knight]: Object.freeze({
    maleTexture: 478, femaleTexture: 477, primaryAttackAnimFrames: [0, 1, 2, -1, 3, 4, 5],
    chanceForAttack2: 50, primaryAttackAnimFrames2: [4, 5, -1, 3, 2, 1, 0], chanceForAttack3: 0,
  }),
});
const _appearanceOriginals = new Map();
export function applyEnemyAppearance(basics) {
  if (_appearanceOriginals.size) return 0;
  let n = 0;
  for (const [id, row] of Object.entries(RR_ENEMY_APPEARANCE)) {
    const target = basics?.[id];
    if (!target || Object.isFrozen(target)) { if (target) console.warn(`[rr] enemyAppearance: ENEMY_BASICS row ${id} is frozen - the mod's appearance cannot be written`); continue; }
    const saved = {};
    for (const k of Object.keys(row)) saved[k] = Object.hasOwn(target, k) ? target[k] : undefined;
    _appearanceOriginals.set(id, saved);
    for (const [k, v] of Object.entries(row)) target[k] = Array.isArray(v) ? [...v] : v;
    n++;
  }
  return n;
}
export function revertEnemyAppearance(basics) {
  for (const [id, saved] of _appearanceOriginals) {
    const target = basics?.[id];
    if (!target) continue;
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete target[k]; else target[k] = v; }
  }
  _appearanceOriginals.clear();
}
export const enemyAppearanceApplied = () => _appearanceOriginals.size > 0;

export const RR_UNDERWORLD = Object.freeze({
  ThievesGuild: Object.freeze({
    joinReputationFloor: 2,
    squad: (level) => [{ mobileType: MOBILE_TYPES.Rogue, count: 4 + Math.trunc(level / 1.5), minDistance: 1, maxDistance: 8 }, { mobileType: MOBILE_TYPES.Thief, count: 4 + Math.trunc(level / 1.5), minDistance: 1, maxDistance: 4 }],
    expulsion: Object.freeze([
      "%pcn, you've disappointed us yet again with your bleedin'",
      'shoddy work and our patience has run as dry as a desert.',
      "An' without bringing in nearly enough dough or gaining",
      'powerful connections, is not sufficient to save your skin.',
      '',
      "You're bloody done as a thief, get 'em lads!",
    ]),
  }),
  DarkBrotherhood: Object.freeze({
    joinReputationFloor: 2,
    squad: (level) => [{ mobileType: MOBILE_TYPES.Assassin, count: 4 + Math.trunc(level / 2), minDistance: 1, maxDistance: 5 }, { mobileType: MOBILE_TYPES.Nightblade, count: 4 + Math.trunc(level / 2), minDistance: 4, maxDistance: 16 }],
    expulsion: Object.freeze([
      "%pcn, you have disappointed us yet again, and you've not",
      'made powerful enough connections to save your reputation.',
      '',
      "Our patience is limited and it's worn thin. Now your",
      'membership, and by extension your life, is forfeit!',
    ]),
  }),
});
export const rrUnderworldRule = (guildName) => (rrModule('underworldExpulsion') ? RR_UNDERWORLD[guildName] ?? null : null);


export const isBedModel = (modelIdNum) => BED_MODELS.includes(modelIdNum);
export const bedSleepingOn = () => rrModule('bedSleeping');


export const RR_RIDING = Object.freeze({
  lookPitchRatio: 2.6,
  extX: 0.06, extW: 0.78,
  samples: 16,
  pitchMaxOffset: 18,
  chargeKnockback: 100,
  chargeFatigueMultiplier: 15,
});
export const rrRidingOn = () => rrEnabled() && rrSetting('EnhancedRiding.enhancedRiding') === true;
export const rrRidingSetting = (key) => rrSetting(`EnhancedRiding.${key}`);
export function rrCanRunRiding({ mode = 'Foot', riding = false, inTown = false, gallopingInTowns = false } = {}) {
  const inTownNoGallop = inTown && !gallopingInTowns;
  return !((mode === 'Cart' || inTownNoGallop) && riding);
}
export function rrRidingInputLimits({ riding = false, mode = 'Foot' } = {}) {
  if (!riding) return { negVertical: 1, negHorizontal: 1, posHorizontal: 1 };
  const cart = mode === 'Cart';
  return { negVertical: cart ? 0.2 : 0.5, negHorizontal: cart ? 0.1 : 0.4, posHorizontal: cart ? 0.1 : 0.4 };
}
export const rrTerrainAngle = (hereY, aheadY) => Math.atan2(hereY - aheadY, 1) * 100;
export function rrTerrainFollow(samples, softenFollow = 0, following = true) {
  if (!following || !samples?.length) return 0;
  let sum = 0;
  for (const a of samples) sum += a;
  return sum / (samples.length + softenFollow);
}
export const rrRidingYAdj = (pitchDegrees, terrainAngle) => (pitchDegrees - terrainAngle - 10) * RR_RIDING.lookPitchRatio;
export function rrRidingNeckBand(yAdj) {
  const yAdjNeck = yAdj / 100;
  return { u0: RR_RIDING.extX, u1: RR_RIDING.extX + RR_RIDING.extW, v0: 0.8, v1: 0.8 + yAdjNeck, widthTrim: 14 };
}
export function rrChargeDamage({ minBase = 1, maxBase = 1, agility = 50, willpower = 50, roll = 0 } = {}) {
  let damage = minBase + Math.floor(roll * (maxBase + 1 - minBase));
  damage += Math.trunc(agility / 10);
  damage += Math.trunc(willpower / 10);
  return damage;
}
export function rrTrampleOutcome({ isGuard = false, female = false } = {}) {
  return isGuard
    ? { chargeGuard: true, spawnGuards: false, blood: false, clip: null, crime: 'Assault', remove: true }
    : { chargeGuard: false, spawnGuards: true, blood: true, clip: female ? 'BretonFemalePain3' : 'BretonMalePain3', crime: 'Assault', remove: true };
}

export const RR_WEEK_BUTTON = 21;
export const RR_INTENSIVE_DAYS = 4;
export const RR_INTENSIVE_SKILL_POINTS = 4;
export const rrRefinedTrainingOn = () => rrEnabled() && rrSetting('RefinedTraining.refinedTraining') === true;
export function rrTrainingCost(baseCost, skillValue, trainingMax, variable = true) {
  if (!variable || !(trainingMax > 0)) return baseCost;
  const skillOfMax = Math.fround(1 - Math.fround(skillValue / trainingMax));
  return baseCost - Math.trunc(Math.fround(baseCost * skillOfMax / 2));
}
export const rrIntensiveCost = (trainingCost, level) => (trainingCost + level * 8 + 72) * 5;
export const rrIntensiveOffered = (intensive, skillValue, trainingMax) => !!intensive && skillValue < trainingMax - 4;
export const RR_TRAINING_LINES = Object.freeze({
  trainingSkill1: 'Training your {0} skill will cost %a gold for a single session.',
  trainingSkill2: 'You can also pay extra to train intensively for five days if you wish,',
  trainingSkill3: 'with a training session each day, this will cost {0} gold in total.',
  trainingSkill4: 'So, would you like to train your {0} skill with me?',
  trainingSkillIntense1: 'You have spent the last 4 days intensively training your ',
  trainingSkillIntense2: '{0} skill, and have improved it significantly.',
  trainingSkillIntense3: "Now it's time to begin your fifth and final session...",
});
