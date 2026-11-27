// Physical Combat and Armor Overhaul v1.44, ported from the shipped mod's decompiled C#.
// Each FormulaHelper override reads its module switch live and returns undefined when off, so the stock one runs.
// Kept as in the C#: Mathf.Round rounds half to even, every float is a float32, and integer division truncates.
// The C# discards several Mathf.Clamp results; only the hit chance clamp is applied, a recorded departure.
import { modSetting, modSettingIfDeclared } from '../mods/modSettings.js';
import { liveStat } from '../characters/statMods.js';
import { skillValue, SKILLS } from '../characters/skills.js';
import { RACES } from '../characters/races.js';
import { previewRacialModifiers } from './abilities/racialIdentity.js';
import { SPECIAL_ABILITY_BITS } from '../characters/specialAdvantages.js';
import { WEAPONS, weaponMinDamage, weaponMaxDamage, weaponSkillUsed, itemMinDamage, itemMaxDamage } from '../characters/weapons.js';
import { equipTableOf, lowerCondition, blowWear, slotForBodyPart, EQUIP_SLOTS, weaponProficiencyFlag } from '../characters/equip.js';
import { SHIELD_PARTS, isShieldTemplate, itemArmorValue } from '../items/armorMaterials.js';
import { conditionPercentage, itemLongName, shownItemName } from '../items/itemInfo.js';
import { effectiveUnitWeightInKg } from '../items/inventory.js';
import { templateByIndex } from '../items/itemTemplates.js';
import { enchantChanceToHitMod, isEnchantedItem, entityImprovedAdrenalineRush } from '../magic/enchantments.js';
import { stampedTier } from '../items/rarityTier.js';
import { armorPierceShare } from './armorPierce.js';
import { entityEnchantArmorMod, entityArmorPoints, weaponDamageMods, weaponBlowMods } from '../characters/entityMods.js';
import { getItemHands, ITEM_HANDS } from '../characters/equipTable.js';
import { createWeapon } from './enemyEquipment.js';
import { clawMetalDamage } from './clawMetal.js';
import {
  registerFormulaOverride, handToHandMinDamage, handToHandMaxDamage,
  WEAPON_MATERIAL_MODIFIER, enemyEntityGroup, careerAttackModifier, ENEMY_GROUPS, dice100,
  materialIneffectiveText, successfulBackstabText,
  damageEquipment,
  silverDoubles,
} from './formulas.js';
import { meanerMonstersOn } from './pcaaoMeanerMonsters.js';
import { RR_VENDOR, rrAdjustWeaponHitChanceMod, rrAdjustWeaponAttackDamage } from '../mods/rrRealism.js';

export { MEANER_MONSTERS, meanerMonstersRow, meanerMonstersOn } from './pcaaoMeanerMonsters.js';

export const PCAAO_VENDOR = 'pcaao';
export const PCAAO_VERSION = '1.44';

export function unityRound(x) {
  const f = Math.floor(x);
  const d = x - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}
const F = Math.fround;
const int = (x) => Math.trunc(x);
const range = (min, max, rolls) => min + Math.floor(rolls() * (max + 1 - min));
// Random.Range(0, n) excludes n, and Unity answers the minimum when n <= 0.
const rangeExclusive = (n, rolls) => (n <= 0 ? 0 : Math.floor(rolls() * n));

// InitMod's dependency ladder: fading needs enhanced equipment damage; the critical, condition, and soft-material
// modules need the redone armor formula.
export function pcaaoModules(read = (k) => modSetting(PCAAO_VENDOR, k), other = modSettingIfDeclared) {
  const enabled = !!read('Enabled');
  const on = (k) => enabled && !!read(k);
  const equipmentDamageEnhanced = on('equipmentDamageEnhanced');
  const armorHitFormulaRedone = on('armorHitFormulaRedone');
  return Object.freeze({
    enabled,
    equipmentDamageEnhanced,
    fadingEnchantedItems: equipmentDamageEnhanced && on('fadingEnchantedItems'),
    fixedStrengthDamageModifier: on('fixedStrengthDamageModifier'),
    armorHitFormulaRedone,
    criticalStrikesIncreaseDamage: armorHitFormulaRedone && on('criticalStrikesIncreaseDamage'),
    conditionBasedEffectiveness: armorHitFormulaRedone && on('conditionBasedEffectiveness'),
    softMaterialRequirements: armorHitFormulaRedone && on('softMaterialRequirements'),
    // Other mods are read through their own switches; a mod that is not vendored reads as not loaded.
    rolePlayRealismArchery: enabled && !!other(RR_VENDOR, 'Enabled') && !!other(RR_VENDOR, 'advancedArchery'),
    meanerMonsters: enabled && meanerMonstersOn(read, other),
  });
}

const isPlayer = (e) => !!e?.isPlayer;
const isMonster = (e) => !!e && !e.isPlayer && e.isClass === false;
const isClassEnemy = (e) => !!e && !e.isPlayer && e.isClass === true;
const stat = (e, k) => liveStat(e, k);
const skill = (e, id) => skillValue(e, id);
const hasAbility = (career, flag) => ((career?.abilityFlagsAndSpellPointsBitfield ?? 0) & flag) === flag;
const struckSlotItem = (e, part) => {
  const slot = slotForBodyPart(part);
  return slot !== EQUIP_SLOTS.None ? (equipTableOf(e)[slot] ?? null) : null;
};
const isShield = (item) => item?.group === 'Armor' && isShieldTemplate(item?.templateIndex);
// A departure: the C# takes whatever the left hand holds; only a shield counts here.
const leftHandShield = (e) => { const it = equipTableOf(e)[EQUIP_SLOTS.LeftHand] ?? null; return isShield(it) ? it : null; };
const isArmorGroup = (item) => item?.group === 'Armor';
const nativeMaterial = (item) => item?.material ?? 0;
const weaponSkillOf = (weapon) => weaponSkillUsed(weapon?.templateIndex) ?? SKILLS.HandToHand;
const materialModifier = (weapon) => WEAPON_MATERIAL_MODIFIER[weapon?.material] ?? 0;
const shortName = (item) => shownItemName(item) ?? templateByIndex(item?.templateIndex)?.name ?? 'Item';

// Module state: the overhaul's CalculateAttackDamage (or DamageEquipment with the overhaul off) writes it, and the
// reductions that follow read it.
let shieldBlockSuccess = false;
export const _shieldBlockSuccess = () => shieldBlockSuccess;

export const pcaaoDamageModifier = (strength) => Math.floor((strength - 50) / 10);

export function pcaaoProficiencyModifiers(attacker, weapon) {
  const mods = { damageMod: 0, toHitMod: 0 };
  const expert = ((attacker.career?.weaponArmorShieldsBitfield ?? 0) >>> 16) & 0x3f;
  const S = (k) => stat(attacker, k);
  if (weapon) {
    if ((expert & weaponProficiencyFlag(weapon)) !== 0) {
      switch (weaponSkillOf(weapon)) {
        case SKILLS.Archery:
          mods.damageMod = int(S('strength') / 25) + int(S('agility') / 25) + 1;
          mods.toHitMod = int(S('agility') / 8) + int(S('speed') / 20) + int(S('luck') / 20);
          break;
        case SKILLS.Axe:
          mods.damageMod = int(S('strength') / 20) + int(S('agility') / 33) + 1;
          mods.toHitMod = int(S('strength') / 11) + int(S('agility') / 11) + int(S('luck') / 22);
          break;
        case SKILLS.BluntWeapon:
          mods.damageMod = int(S('strength') / 20) + int(S('endurance') / 33) + 1;
          mods.toHitMod = int(S('strength') / 10) + int(S('agility') / 16) + int(S('luck') / 16);
          break;
        case SKILLS.LongBlade:
          mods.damageMod = int(S('agility') / 20) + int(S('strength') / 33) + 1;
          mods.toHitMod = int(S('agility') / 8) + int(S('speed') / 20) + int(S('luck') / 20);
          break;
        case SKILLS.ShortBlade:
          mods.damageMod = int(S('agility') / 25) + int(S('speed') / 25) + 1;
          mods.toHitMod = int(S('agility') / 10) + int(S('speed') / 14) + int(S('luck') / 18);
          break;
        default: break;
      }
    }
  } else if ((expert & 4) !== 0) {
    mods.damageMod = int(S('strength') / 50) + int(S('endurance') / 50) + int(S('agility') / 50) + int(S('speed') / 50) + 1;
    mods.toHitMod = int(S('agility') / 22) + int(S('speed') / 22) + int(S('strength') / 22) + int(S('endurance') / 22) + int(S('luck') / 22);
  }
  return mods;
}

export function pcaaoRacialModifiers(attacker, weapon, player) {
  const preview = previewRacialModifiers(attacker, weapon);
  if (preview) return preview;
  const mods = { damageMod: 0, toHitMod: 0 };
  const S = (k) => stat(attacker, k);
  const race = player?.raceId ?? attacker.raceId;
  if (weapon) {
    const ws = weaponSkillOf(weapon);
    switch (race) {
      case RACES.Argonian:
        if (ws === SKILLS.ShortBlade) {
          mods.damageMod = int(S('agility') / 33) + int(S('speed') / 33);
          mods.toHitMod = int(S('agility') / 16) + int(S('speed') / 33) + int(S('luck') / 33);
        }
        break;
      case RACES.DarkElf:
        if (ws === SKILLS.LongBlade) {
          mods.damageMod = int(S('agility') / 25) + int(S('strength') / 25);
          mods.toHitMod = int(S('agility') / 25) + int(S('speed') / 33) + int(S('luck') / 33);
        } else if (ws === SKILLS.ShortBlade) {
          mods.damageMod = int(S('agility') / 50) + int(S('speed') / 50);
          mods.toHitMod = int(S('agility') / 33) + int(S('speed') / 33) + int(S('luck') / 33);
        }
        break;
      case RACES.Khajiit:
        if (ws === SKILLS.ShortBlade) {
          mods.damageMod = int(S('agility') / 33) + int(S('speed') / 50);
          mods.toHitMod = int(S('agility') / 20) + int(S('speed') / 33) + int(S('luck') / 50);
        }
        break;
      case RACES.Nord:
        if (ws === SKILLS.Axe) {
          mods.damageMod = int(S('strength') / 16) + int(S('agility') / 33);
          mods.toHitMod = int(S('strength') / 33) + int(S('agility') / 33) + int(S('luck') / 33);
        } else if (ws === SKILLS.BluntWeapon) {
          mods.damageMod = int(S('strength') / 25) + int(S('endurance') / 25);
          mods.toHitMod = int(S('strength') / 25) + int(S('agility') / 33) + int(S('luck') / 33);
        }
        break;
      case RACES.Redguard:
        if (ws === SKILLS.LongBlade) {
          mods.damageMod = int(S('agility') / 33) + int(S('strength') / 50);
          mods.toHitMod = int(S('agility') / 10) + int(S('speed') / 25) + int(S('luck') / 25);
        } else if (ws === SKILLS.BluntWeapon) {
          mods.damageMod = int(S('strength') / 33) + int(S('endurance') / 33);
          mods.toHitMod = int(S('strength') / 20) + int(S('agility') / 25) + int(S('luck') / 33);
        } else if (ws === SKILLS.Axe) {
          mods.damageMod = int(S('strength') / 16) + int(S('agility') / 33);
          mods.toHitMod = int(S('strength') / 33) + int(S('agility') / 33) + int(S('luck') / 33);
        } else if (ws === SKILLS.Archery) {
          mods.damageMod = int(S('strength') / 50) + int(S('agility') / 50);
          mods.toHitMod = int(S('agility') / 25) + int(S('speed') / 33) + int(S('luck') / 33);
        }
        break;
      case RACES.WoodElf:
        if (ws === SKILLS.ShortBlade) {
          mods.damageMod = int(S('agility') / 33) + int(S('speed') / 50);
          mods.toHitMod = int(S('agility') / 20) + int(S('speed') / 33) + int(S('luck') / 50);
        } else if (ws === SKILLS.Archery) {
          mods.damageMod = int(S('strength') / 25) + int(S('agility') / 25);
          mods.toHitMod = int(S('agility') / 10) + int(S('speed') / 25) + int(S('luck') / 25);
        }
        break;
      default: break;
    }
  } else if (race === RACES.Khajiit) {
    mods.damageMod = int(S('strength') / 33) + int(S('endurance') / 33) + int(S('agility') / 50) + int(S('speed') / 50);
    mods.toHitMod = int(S('agility') / 25) + int(S('speed') / 50) + int(S('strength') / 50) + int(S('endurance') / 50) + int(S('luck') / 50);
  } else if (race === RACES.Nord) {
    mods.damageMod = int(S('strength') / 33) + int(S('endurance') / 50);
  }
  return mods;
}

export const pcaaoWeaponToHit = (weapon) => materialModifier(weapon) * 2 + 2;

export function pcaaoArmorToHit(target, struckBodyPart) {
  let result = 0;
  const values = target.armorValues ?? [];
  if (struckBodyPart <= values.length) result = values[struckBodyPart] ?? 0;
  if (isPlayer(target)) result = 100 - entityEnchantArmorMod(target) - entityArmorPoints(target, struckBodyPart);
  else if (isClassEnemy(target)) result = 60;
  return result;
}

export function pcaaoAdrenalineRushToHit(attacker, target) {
  let mod = 0;
  const rushing = (e) => hasAbility(e.career, SPECIAL_ABILITY_BITS.adrenalineRush) && (e.health ?? 0) < int((e.maxHealth ?? 0) / 6);
  if (rushing(attacker)) mod += entityImprovedAdrenalineRush(attacker) ? 12 : 8;
  if (rushing(target)) mod -= entityImprovedAdrenalineRush(target) ? 12 : 8;
  return mod;
}

export function pcaaoStatDiffsToHit(attacker, target) {
  return int((stat(attacker, 'luck') - stat(target, 'luck')) / 10)
    + int((stat(attacker, 'agility') - stat(target, 'agility')) / 4)
    + int((stat(attacker, 'speed') - stat(target, 'speed')) / 8)
    - unityRound(F((stat(target, 'luck') - 50) / 10));
}

export function pcaaoSkillsToHit(attacker, target, rolls, modules, notes = null) {
  let mod = -int(skill(target, SKILLS.Dodging) / 2);
  if (!modules.criticalStrikesIncreaseDamage) {
    const crit = skill(attacker, SKILLS.CriticalStrike);
    // A departure: every striker rolls the crit chance the player rolls.
    if (dice100(int(crit / 3), rolls())) { mod += int(crit / 3); if (notes) notes.critical = true; }
  }
  return mod;
}

export function pcaaoAdjustmentsToHit(target) {
  let mod = 0;
  if (isPlayer(target)) mod -= (target.biographyAvoidHitMod ?? 0);
  if (isMonster(target)) mod += 50;
  return mod - 50;
}

// A departure: the C# computes this clamp and never assigns it, so a low total always missed. It applies both ways.
export const PCAAO_HIT_CHANCE_MIN = 3;
export const PCAAO_HIT_CHANCE_MAX = 97;
export function pcaaoSuccessfulHit(attacker, target, chanceToHitMod, struckBodyPart, rolls, modules, notes = null) {
  if (!attacker || !target) return false;
  const chance = chanceToHitMod
    + pcaaoArmorToHit(target, struckBodyPart)
    + pcaaoAdrenalineRushToHit(attacker, target)
    + enchantChanceToHitMod(attacker)
    + pcaaoStatDiffsToHit(attacker, target)
    + pcaaoSkillsToHit(attacker, target, rolls, modules, notes)
    + pcaaoAdjustmentsToHit(target);
  return dice100(Math.max(PCAAO_HIT_CHANCE_MIN, Math.min(PCAAO_HIT_CHANCE_MAX, chance)), rolls());
}

export const PCAAO_BODY_PARTS = Object.freeze([0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 5, 5, 5, 6, 6]);
export const pcaaoStruckBodyPart = (roll01) => PCAAO_BODY_PARTS[Math.floor(roll01 * PCAAO_BODY_PARTS.length)];

export function pcaaoBackstabDamage(damage, backstabbingLevel, rolls, say) {
  if (backstabbingLevel > 1 && dice100(backstabbingLevel, rolls())) {
    say?.(successfulBackstabText());
    return damage * 3;
  }
  return damage;
}

export function pcaaoCriticalStrike(attacker, rolls) {
  const luckTerm = Math.floor(F((stat(attacker, 'luck') - 50) / 25));
  const crit = skill(attacker, SKILLS.CriticalStrike);
  // The C# clamps the luck term to -2..2 and discards it. A departure: every striker rolls crit / (4 - luckTerm).
  return dice100(int(crit / (4 - luckTerm)), rolls());
}

export function pcaaoBonusOrPenaltyByEnemyType(attacker, target, rolls) {
  if (!attacker || !target) return 0;
  const flags = attacker.attackModifierFlags ?? attacker.career?.attackModifierFlags ?? null;
  let bonus = 0, penalty = 0;
  const will = int((stat(attacker, 'willpower') - 50) / 5);
  const aLevel = attacker.level ?? 1, tLevel = target.level ?? 1;
  if (isPlayer(attacker)) {
    bonus = Math.max(10 + will - int(tLevel / 2), 0);
    penalty = Math.max(int(tLevel / 2) - will, 0);
  } else {
    bonus = Math.max(5 + will + int(aLevel / 4), 0);
    penalty = Math.max(tLevel - (aLevel + will), 0);
  }
  bonus = rangeExclusive(bonus, rolls);
  let group = ENEMY_GROUPS.None;
  if (isPlayer(target)) group = ENEMY_GROUPS.Humanoid;
  else group = enemyEntityGroup(target.careerIndex);
  if (flags == null || group === ENEMY_GROUPS.None) return 0;
  const decoded = careerAttackModifier(flags, group);
  let result = 0;
  if (decoded === 1) result += bonus;
  if (decoded === -1) result -= penalty;
  return result;
}

export function pcaaoHandToHandAttackDamage(attacker, target, damageModifier, player, rolls, info = undefined) {
  let damage = 0;
  if (player) {
    const h2h = skill(attacker, SKILLS.HandToHand);
    damage = range(handToHandMinDamage(h2h), handToHandMaxDamage(h2h), rolls);
    damage += damageModifier;
    damage += pcaaoDamageModifier(stat(attacker, 'strength'));
    damage += clawMetalDamage(attacker);
  } else {
    damage += damageModifier;
  }
  if (damage < 1) damage = 0;
  if (damage >= 1) damage += pcaaoBonusOrPenaltyByEnemyType(attacker, target, rolls);
  if (player && !attacker.isInBeastForm) damage = weaponBlowMods(null, damage, attacker, target, info);
  return damage;
}

export const SILVER_DOUBLED_CAREERS = Object.freeze([9, 18, 23, 28, 19, 14]);
const SKELETAL_WARRIOR = 15;

export function pcaaoWeaponAttackDamage(attacker, target, damageModifier, weaponAnimTime, weapon, rolls, modules, info = undefined) {
  // The game's weapon and blow modifiers apply under this core too, at the same two places as in the stock formula.
  let damage = weaponDamageMods(weapon, range(itemMinDamage(weapon), itemMaxDamage(weapon), rolls), attacker) + damageModifier;
  if (!isPlayer(target)) {
    if (target.careerIndex === SKELETAL_WARRIOR) {
      if (((weapon.flags ?? 0) & 0x10) === 0) damage = int(damage / 2);
      if (weapon.material === 2 && silverDoubles(target)) damage *= 2;
    } else if (SILVER_DOUBLED_CAREERS.includes(target.careerIndex) && weapon.material === 2 && silverDoubles(target)) {
      damage *= 2;
    }
  }
  const bow = weapon.templateIndex === WEAPONS.Short_Bow || weapon.templateIndex === WEAPONS.Long_Bow;
  // A bow takes the two-handed strength term even when BowLeftHandWithSwitching makes it LeftOnly.
  const twoHanded = getItemHands(weapon) === ITEM_HANDS.Both && !bow;
  damage += (bow || twoHanded) ? pcaaoDamageModifier(stat(attacker, 'strength')) * 2 : pcaaoDamageModifier(stat(attacker, 'strength'));
  damage += materialModifier(weapon);
  if (damage < 1) damage = 0;
  if (damage >= 1) damage += pcaaoBonusOrPenaltyByEnemyType(attacker, target, rolls);
  damage = weaponBlowMods(weapon, damage, attacker, target, info);
  if (modules.rolePlayRealismArchery) damage = rrAdjustWeaponAttackDamage(damage, weaponAnimTime, weapon);
  return damage;
}

export function pcaaoAlterDamageBasedOnWepCondition(damage, bluntWep, weapon, sharpEdge = true) {
  const pct = conditionPercentage(weapon);
  const r = (m) => unityRound(F(damage * F(m)));
  // A departure: the bonus bands over 75% apply only while the mod's own wear module is on.
  if (pct >= 76 && !sharpEdge) return damage;
  if (bluntWep) {
    if (pct >= 92) return r(1.1);
    if (pct >= 76) return damage;
    if (pct >= 61) return damage;
    if (pct >= 41) return r(0.9);
    if (pct >= 16) return r(0.8);
    if (pct >= 6) return r(0.65);
    if (pct > 5) return damage;
    return r(0.5);
  }
  if (pct >= 92) return r(1.3);
  if (pct >= 76) return r(1.1);
  if (pct >= 61) return damage;
  if (pct >= 41) return r(0.85);
  if (pct >= 16) return r(0.7);
  if (pct >= 6) return r(0.45);
  if (pct > 5) return damage;
  return r(0.25);
}
export function pcaaoAlterArmorReducBasedOnItemCondition(armor, sharpEdge = true) {
  if (!armor) return 1;
  const pct = conditionPercentage(armor);
  if (pct >= 76 && !sharpEdge) return 1;
  if (pct >= 92) return F(0.85);
  if (pct >= 76) return F(0.95);
  if (pct >= 61) return 1;
  if (pct >= 41) return F(1.1);
  if (pct >= 16) return F(1.2);
  if (pct >= 6) return F(1.35);
  if (pct <= 5) return F(1.5);
  return 1;
}

export function pcaaoArmorMaterialIdentifier(armor) {
  if (!armor) return 1;
  if (!isShield(armor)) return int(itemArmorValue(armor) / 2);
  switch (nativeMaterial(armor)) {
    case 0: return 1;
    case 256: case 259: return 2;
    case 512: return 3;
    case 513: case 514: return 4;
    case 515: return 5;
    case 516: return 6;
    case 517: case 518: return 7;
    case 519: return 8;
    case 520: return 9;
    case 521: return 10;
    default: return 1;
  }
}
export function pcaaoArmorMaterialModifierFinder(armor) {
  switch (nativeMaterial(armor)) {
    case 0: return 1;
    case 256: case 259: case 512: return 2;
    case 513: case 514: return 3;
    case 515: return 4;
    case 516: case 517: case 518: return 5;
    case 519: return 6;
    case 520: return 7;
    case 521: return 8;
    default: return 1;
  }
}
export function pcaaoEqualizeMaterialConditions(item) {
  const m = nativeMaterial(item);
  if (m <= 9 && m >= 0) {
    switch (m) {
      case 0: case 1: case 2: return 1;
      case 3: return 2;
      case 4: return 3;
      case 5: return 4;
      case 6: return 5;
      case 7: return 6;
      case 8: return 7;
      case 9: return 8;
      default: return 1;
    }
  }
  if (m <= 521 && m >= 256) {
    switch (m) {
      case 256: case 259: case 512: case 513: case 514: return 1;
      case 515: return 2;
      case 516: return 3;
      case 517: return 4;
      case 518: return 5;
      case 519: return 6;
      case 520: return 7;
      case 521: return 8;
      default: return 1;
    }
  }
  return 1;
}
export function pcaaoSpecificWeaponConditionDamage(weapon, damageWep, materialValue) {
  if (weapon.templateIndex === WEAPONS.Long_Bow) return materialValue === 1 ? 1 : materialValue === 2 ? 2 : 3;
  if (weapon.templateIndex === WEAPONS.Short_Bow) return materialValue === 1 ? 1 : 2;
  return damageWep;
}

// A piece that rolled a rarity tier is not one of the mod's enchanted items: it breaks and stays, repairable.
export const pcaaoFades = (item) => isEnchantedItem(item) && !stampedTier(item);

function wear(item, owner, amount, modules, say, rolls = Math.random) {
  const removeFrom = modules.fadingEnchantedItems && isPlayer(owner) && pcaaoFades(item) ? (owner.items ?? null) : null;
  lowerCondition(item, blowWear(amount, rolls), owner, say, removeFrom, shownItemName);
}
export function pcaaoApplyConditionDamageThroughWeaponDamage(item, owner, damage, bluntWep, shtbladeWep, missileWep, wepEqualize, modules, rolls, say) {
  if (isArmorGroup(item)) {
    wear(item, owner, isShield(item) ? damage : damage * 2, modules, say, rolls);
    return;
  }
  let amount = int(10 * damage / 50);
  if (amount === 0 && dice100(40, rolls())) amount = 1;
  if (missileWep) amount = pcaaoSpecificWeaponConditionDamage(item, amount, wepEqualize);
  wear(item, owner, amount, modules, say, rolls);
}
export function pcaaoApplyConditionDamageThroughUnarmedDamage(item, owner, damage, modules, say, rolls = Math.random) {
  if (!isArmorGroup(item)) return;
  wear(item, owner, isShield(item) ? int(damage / 2) : damage, modules, say, rolls);
}

export function pcaaoWarningMessagePlayerEquipmentCondition(item, startItemCondPer, say) {
  const pct = conditionPercentage(item);
  const lost = startItemCondPer - pct;
  if (pct > 49 && lost < 15) return;
  let a, b, c;
  if (isEnchantedItem(item)) {
    const n = item.customMagic != null ? shortName(item) : itemLongName(item);
    a = `My ${n} Is Flickering Slightly`;
    b = `My ${n} Is Going In And Out Of Existence`;
    c = `My ${n} Was Drained Significantly By That`;
  } else {
    const n = shortName(item);
    switch (item.templateIndex) {
      case 103: case 104: case 108: case 516: case 519:
        a = `My ${n} Are In Rough Shape`; b = `My ${n} Are Falling Apart`; c = `My ${n} Were Shredded Heavily By That`; break;
      case 113: case 114: case 116: case 117: case 118: case 119: case 120: case 121: case 122: case 123: case 127: case 128: case 513:
        a = `My ${n} Could Use A Sharpening`; b = `My ${n} Looks As Dull As A Butter Knife`; c = `My ${n} Lost A lot Of Edge From That Swipe`; break;
      case 115: case 124: case 125: case 126: case 514:
        a = `My ${n}'s Shaft Has Some Small Cracks`; b = `My ${n}'s Shaft Is Nearly Split In Two`; c = `My ${n} Shaft Was Cracked By That Swing`; break;
      case 129: case 130:
        a = `The Bowstring On My ${n} Is Losing Its Twang`; b = `The Bowstring On My ${n} Looks Ready To Snap`; c = `The Bowstring On My ${n} Nearly Snapped From That`; break;
      default:
        a = `My ${n} Is In Rough Shape`; b = `My ${n} Is Falling Apart`; c = `My ${n} Was Shredded Heavily By That`; break;
    }
  }
  if (pct === 48) say?.(a, 2);
  else if (pct === 15) say?.(b, 2);
  else if (lost >= 15) say?.(c, 2);
}

export function pcaaoMaterialDifferenceDamageCalculation(item, matDifference, atkStrength, damage, bluntWep, wepWeight, shieldCheck) {
  const m = nativeMaterial(item);
  let d = damage, s = atkStrength, diff = matDifference;
  if (bluntWep) {
    if (shieldCheck) d *= 2;
    if (m === 0) d = int(d / 4);
    else if (m === 256 || m === 259) d *= 2;
    if (wepWeight >= 7 && wepWeight <= 9) { s = int(s / 5); d = d * 3 + s; return int(d / 3); }
    if (wepWeight >= 4 && wepWeight <= 6) { s = int(s / 5); d = d * 2 + s; return int(d / 3); }
    if (wepWeight >= 10 && wepWeight <= 12) { s = int(s / 5); d = d * 4 + s; return int(d / 3); }
    if (wepWeight >= 1 && wepWeight <= 3) { s = int(s / 5); d += s; return int(d / 4); }
    if (wepWeight >= 13 && wepWeight <= 35) { s = int(s / 5); d = d * 5 + s; return int(d / 3); }
    if (wepWeight >= 36) { s = int(s / 5); d = d * 7 + s; return int(d / 3); }
    s = int(s / 20); d = int(d / 2) + s; return int(d / 5);
  }
  if (shieldCheck) d = int(d / 3);
  if (m === 256 || m === 259) d = int(d / 2);
  if (diff < 0) { diff = -diff; diff++; s = int(s / 10); d = d * diff + s; return int(d / 2); }
  if (diff === 0) { s = int(s / 10); d += s; return int(d / 2); }
  s = int(s / 10); d = int(d / diff) + s; return int(d / 3);
}

export function pcaaoDamageEquipment(attacker, target, damage, weapon, struckBodyPart, { rolls = Math.random, say = null, modules = pcaaoModules() } = {}) {
  let liveStrength = stat(attacker, 'strength');
  let matDifference = 0;
  let bluntWep = false, shtbladeWep = false, missileWep = false;
  let wepEqualize = 1, wepWeight = 1;
  let startItemCondPer = 0;
  if (!modules.armorHitFormulaRedone) {
    const shield = leftHandShield(target);
    shieldBlockSuccess = false;
    if (shield) {
      for (const part of SHIELD_PARTS.get(shield.templateIndex) ?? []) {
        if (shieldBlockSuccess) break;
        if (part === struckBodyPart) shieldBlockSuccess = true;
      }
    }
  }
  if (weapon && damage > 0) {
    const wepMatModifier = materialModifier(weapon) + 2;
    let wepDamage = damage;
    wepEqualize = pcaaoEqualizeMaterialConditions(weapon);
    wepDamage *= wepEqualize;
    const ws = weaponSkillOf(weapon);
    if (ws === SKILLS.BluntWeapon) {
      wepDamage += int(liveStrength / 10);
      const wepMatDiv = F(F(wepEqualize * F(0.2)) + 1);
      wepDamage = Math.ceil(F(wepDamage / wepMatDiv));
      bluntWep = true;
      wepWeight = Math.ceil(effectiveUnitWeightInKg(weapon));
      startItemCondPer = conditionPercentage(weapon);
      pcaaoApplyConditionDamageThroughWeaponDamage(weapon, attacker, wepDamage, bluntWep, shtbladeWep, missileWep, wepEqualize, modules, rolls, say);
    } else if (ws === SKILLS.ShortBlade) {
      const heavy = weapon.templateIndex === WEAPONS.Dagger || weapon.templateIndex === WEAPONS.Tanto;
      wepDamage += int(liveStrength / 30);
      const wepMatDiv = F(F(wepEqualize * F(heavy ? 0.9 : 0.3)) + 1);
      wepDamage = Math.ceil(F(wepDamage / wepMatDiv));
      shtbladeWep = true;
      startItemCondPer = conditionPercentage(weapon);
      pcaaoApplyConditionDamageThroughWeaponDamage(weapon, attacker, wepDamage, bluntWep, shtbladeWep, missileWep, wepEqualize, modules, rolls, say);
    } else if (ws === SKILLS.Archery) {
      missileWep = true;
      startItemCondPer = conditionPercentage(weapon);
      pcaaoApplyConditionDamageThroughWeaponDamage(weapon, attacker, wepDamage, bluntWep, shtbladeWep, missileWep, wepEqualize, modules, rolls, say);
    } else {
      wepDamage += int(liveStrength / 10);
      const wepMatDiv = F(F(wepEqualize * F(0.2)) + 1);
      wepDamage = Math.ceil(F(wepDamage / wepMatDiv));
      startItemCondPer = conditionPercentage(weapon);
      pcaaoApplyConditionDamageThroughWeaponDamage(weapon, attacker, wepDamage, bluntWep, shtbladeWep, missileWep, wepEqualize, modules, rolls, say);
    }
    if (isPlayer(attacker)) pcaaoWarningMessagePlayerEquipmentCondition(weapon, startItemCondPer, say);
    const struck = shieldBlockSuccess ? leftHandShield(target) : struckSlotItem(target, struckBodyPart);
    if (struck) {
      let d = damage * pcaaoEqualizeMaterialConditions(struck);
      matDifference = pcaaoArmorMaterialModifierFinder(struck) - wepMatModifier;
      d = pcaaoMaterialDifferenceDamageCalculation(struck, matDifference, liveStrength, d, bluntWep, wepWeight, shieldBlockSuccess);
      startItemCondPer = conditionPercentage(struck);
      pcaaoApplyConditionDamageThroughWeaponDamage(struck, target, d, bluntWep, shtbladeWep, missileWep, wepEqualize, modules, rolls, say);
      if (isPlayer(target)) pcaaoWarningMessagePlayerEquipmentCondition(struck, startItemCondPer, say);
    }
    return false;
  }
  if (!weapon && damage > 0) {
    const struck = shieldBlockSuccess ? leftHandShield(target) : struckSlotItem(target, struckBodyPart);
    if (struck) {
      let d = damage * pcaaoEqualizeMaterialConditions(struck);
      const armorMod = pcaaoArmorMaterialModifierFinder(struck);
      liveStrength = int(liveStrength / 5);
      const div = F(F(armorMod * F(shieldBlockSuccess ? 0.4 : 0.2)) + 1);
      d = Math.ceil(F((d + liveStrength) / div));
      startItemCondPer = conditionPercentage(struck);
      pcaaoApplyConditionDamageThroughUnarmedDamage(struck, target, d, modules, say, rolls);
      if (isPlayer(target)) pcaaoWarningMessagePlayerEquipmentCondition(struck, startItemCondPer, say);
    }
    return false;
  }
  return false;
}

const reduce = (damage, base, cap, cond, nat) => unityRound(F(damage * F(F(Math.min(F(base * cond), F(cap))) - nat)));
const table = (rows, material, damage, cond, nat) => {
  const row = rows[material];
  return row ? reduce(damage, row[0], row[1], cond, nat) : reduce(damage, 1, 1, cond, nat);
};
const UNARMED_ROWS = { 1: [0.9, 0.95], 2: [0.84, 0.95], 3: [0.8, 0.92], 4: [0.72, 0.89], 5: [0.66, 0.86], 6: [0.58, 0.83], 7: [0.52, 0.8], 8: [0.46, 0.76], 9: [0.36, 0.7], 10: [0.3, 0.65] };
const BLUNT_ROWS = { 1: [0.72, 0.89], 2: [0.88, 0.95], 3: [0.92, 0.95], 4: [0.84, 0.93], 5: [0.8, 0.9], 6: [0.72, 0.87], 7: [0.64, 0.84], 8: [0.56, 0.78], 9: [0.48, 0.7], 10: [0.4, 0.58] };
const EDGED_ROWS = { 1: [0.88, 0.95], 2: [0.72, 0.89], 3: [0.86, 0.9], 4: [0.78, 0.88], 5: [0.74, 0.85], 6: [0.66, 0.82], 7: [0.58, 0.78], 8: [0.5, 0.73], 9: [0.42, 0.56], 10: [0.34, 0.46] };
const SHIELD_UNARMED_ROWS = { 1: [0.59, 0.79], 2: [0.55, 0.75], 3: [0.49, 0.69], 4: [0.45, 0.65], 5: [0.43, 0.63], 6: [0.39, 0.59], 7: [0.35, 0.55], 8: [0.33, 0.44], 9: [0.29, 0.37], 10: [0.25, 0.31] };
const SHIELD_BLUNT_ROWS = { 1: [0.74, 0.84], 2: [0.7, 0.8], 3: [0.64, 0.72], 4: [0.58, 0.68], 5: [0.54, 0.64], 6: [0.5, 0.6], 7: [0.46, 0.56], 8: [0.42, 0.5], 9: [0.38, 0.45], 10: [0.34, 0.39] };
const SHIELD_EDGED_ROWS = { 1: [0.7, 0.8], 2: [0.66, 0.76], 3: [0.6, 0.68], 4: [0.54, 0.64], 5: [0.5, 0.6], 6: [0.46, 0.56], 7: [0.42, 0.52], 8: [0.38, 0.46], 9: [0.34, 0.41], 10: [0.3, 0.36] };
const AVERAGE_SHIELD_ROWS = { 1: [0.68, 0.81], 2: [0.64, 0.77], 3: [0.58, 0.7], 4: [0.52, 0.66], 5: [0.49, 0.62], 6: [0.45, 0.61], 7: [0.41, 0.54], 8: [0.38, 0.47], 9: [0.34, 0.41], 10: [0.3, 0.35] };
const AVERAGE_ARMOR_ROWS = { 1: [0.83, 0.93], 2: [0.81, 0.93], 3: [0.86, 0.92], 4: [0.78, 0.9], 5: [0.73, 0.87], 6: [0.65, 0.84], 7: [0.58, 0.81], 8: [0.51, 0.76], 9: [0.42, 0.65], 10: [0.35, 0.56] };
export const PCAAO_REDUCTION_ROWS = Object.freeze({ UNARMED_ROWS, BLUNT_ROWS, EDGED_ROWS, SHIELD_UNARMED_ROWS, SHIELD_BLUNT_ROWS, SHIELD_EDGED_ROWS, AVERAGE_SHIELD_ROWS, AVERAGE_ARMOR_ROWS });

const condOf = (item, modules) => (modules.conditionBasedEffectiveness ? pcaaoAlterArmorReducBasedOnItemCondition(item, modules.equipmentDamageEnhanced) : 1);

export function pcaaoShieldDamageReductionCalculation(shield, shieldMaterial, atkStrength, damage, bluntWep, wepWeight, unarmedCheck, naturalDamResist, modules) {
  const cond = condOf(shield, modules);
  const rows = unarmedCheck ? SHIELD_UNARMED_ROWS : bluntWep ? SHIELD_BLUNT_ROWS : SHIELD_EDGED_ROWS;
  return table(rows, shieldMaterial, damage, cond, naturalDamResist);
}
export function pcaaoPercentageReductionCalculationWithUnarmed(item, armorMaterial, atkStrength, damage, shieldCheck, naturalDamResist, modules) {
  if (shieldCheck) return pcaaoShieldDamageReductionCalculation(item, armorMaterial, atkStrength, damage, false, 1, true, naturalDamResist, modules);
  return table(UNARMED_ROWS, armorMaterial, damage, condOf(item, modules), naturalDamResist);
}
export function pcaaoPercentageReductionCalculationWithWeapon(item, armorMaterial, atkStrength, damage, bluntWep, wepWeight, shieldCheck, naturalDamResist, modules) {
  if (shieldCheck) return pcaaoShieldDamageReductionCalculation(item, armorMaterial, atkStrength, damage, bluntWep, wepWeight, false, naturalDamResist, modules);
  return table(bluntWep ? BLUNT_ROWS : EDGED_ROWS, armorMaterial, damage, condOf(item, modules), naturalDamResist);
}
export function pcaaoPercentageReductionAverage(item, armorMaterial, damage, naturalDamResist, shieldQuickCheck, modules) {
  return table(shieldQuickCheck ? AVERAGE_SHIELD_ROWS : AVERAGE_ARMOR_ROWS, armorMaterial, damage, condOf(item, modules), naturalDamResist);
}
export function pcaaoArmorDamageReductionWithWeapon(attacker, target, damage, weapon, struckBodyPart, naturalDamResist, modules) {
  const liveStrength = stat(attacker, 'strength');
  let bluntWep = false, wepWeight = 1;
  if (weaponSkillOf(weapon) === SKILLS.BluntWeapon) { bluntWep = true; wepWeight = Math.ceil(effectiveUnitWeightInKg(weapon)); }
  if (shieldBlockSuccess) {
    const shield = leftHandShield(target);
    return pcaaoPercentageReductionCalculationWithWeapon(shield, pcaaoArmorMaterialIdentifier(shield), liveStrength, damage, bluntWep, wepWeight, true, naturalDamResist, modules);
  }
  const armor = struckSlotItem(target, struckBodyPart);
  if (armor) return pcaaoPercentageReductionCalculationWithWeapon(armor, pcaaoArmorMaterialIdentifier(armor), liveStrength, damage, bluntWep, wepWeight, false, naturalDamResist, modules);
  return unityRound(F(damage * F(1 - naturalDamResist)));
}
export function pcaaoArmorDamageReductionWithUnarmed(attacker, target, damage, struckBodyPart, naturalDamResist, modules) {
  const liveStrength = stat(attacker, 'strength');
  if (shieldBlockSuccess) {
    const shield = leftHandShield(target);
    return pcaaoPercentageReductionCalculationWithUnarmed(shield, pcaaoArmorMaterialIdentifier(shield), liveStrength, damage, true, naturalDamResist, modules);
  }
  const armor = struckSlotItem(target, struckBodyPart);
  if (armor) return pcaaoPercentageReductionCalculationWithUnarmed(armor, pcaaoArmorMaterialIdentifier(armor), liveStrength, damage, false, naturalDamResist, modules);
  return unityRound(F(damage * F(1 - naturalDamResist)));
}

export function pcaaoPercentageReductionCalculationForMonsters(attacker, target, damage, bluntWep, naturalDamResist) {
  const r = (m) => unityRound(F(damage * F(F(m) - naturalDamResist)));
  const c = target.careerIndex;
  switch (enemyEntityGroup(c)) {
    case ENEMY_GROUPS.Animals: return r(1);
    case ENEMY_GROUPS.Undead: return c === 15 ? r(0.8) : r(1);
    case ENEMY_GROUPS.Humanoid:
      if (c === 22) return bluntWep ? r(1.21) : r(0.71);
      if (c === 2) return bluntWep ? r(0.66) : r(1.26);
      return r(1);
    case ENEMY_GROUPS.Daedra:
      if (c === 27) return r(0.95);
      if (c === 26) return r(1);
      if (c === 25) return bluntWep ? r(1.04) : r(0.84);
      if (c === 31) return r(0.95);
      return r(1);
    case ENEMY_GROUPS.None:
      if (c === 38) return bluntWep ? r(1.4) : r(1);
      if (c === 36) return bluntWep ? r(0.6) : r(0.9);
      return r(1);
    default: return r(1);
  }
}

export const MONSTER_WEAPON = Object.freeze({
  15: [128, 1], 7: [119, 1], 12: [127, 4], 24: [127, 8], 27: [127, 8],
  21: [115, 6], 32: [115, 6], 33: [115, 6], 8: [122, 3], 16: [126, 1],
  22: [125, 1], 36: [124, 1], 38: [121, 3], 23: [119, 5], 25: [126, 9],
  26: [118, 9], 31: [118, 9],
});
export const SPECIAL_WEAPON_MONSTERS = Object.freeze([7, 8, 12, 15, 16, 21, 22, 23, 24, 25, 26, 27, 31, 32, 33, 36, 38]);
export const pcaaoSpecialWeaponCheckForMonsters = (attacker) => SPECIAL_WEAPON_MONSTERS.includes(attacker?.careerIndex);
export function pcaaoMonsterWeaponAssign(attacker, rolls = Math.random) {
  const row = MONSTER_WEAPON[attacker?.careerIndex];
  return row ? createWeapon(row[0], row[1], rolls) : null;
}

export function pcaaoArmorStruckVerification(target, struckBodyPart) {
  if (shieldBlockSuccess) return true;
  return !!struckSlotItem(target, struckBodyPart);
}

// The C# computes both clamps (7..95 and 0..50) and discards them; an unknown shield template reads 40/0.
export function pcaaoShieldBlockChanceCalculation(target, shieldStrongSpot, shield, rolls) {
  let strong = 0, weak = 0;
  const d = (k) => stat(target, k) - 50;
  const agi = d('agility'), spd = d('speed'), str = d('strength'), end = d('endurance'), wil = d('willpower'), luk = d('luck');
  switch (shield.templateIndex) {
    case 109: strong = 30; weak = 20; break;
    case 110: strong = 35; weak = 10; break;
    case 111: strong = 45; weak = 5; break;
    case 112: strong = 55; weak = -5; break;
    default: strong = 40; weak = 0; break;
  }
  if (shieldStrongSpot) {
    let n = F(strong);
    n = F(n + F(agi * F(0.3))); n = F(n + F(spd * F(0.3))); n = F(n + F(str * F(0.3)));
    n = F(n + F(end * F(0.2))); n = F(n + F(wil * F(0.1))); n = F(n + F(luk * F(0.1)));
    return dice100(unityRound(n), rolls());
  }
  let n = F(weak);
  n = F(n + F(agi * F(0.3))); n = F(n + F(spd * F(0.2))); n = F(n + F(str * F(0.2)));
  n = F(n + F(end * F(0.1))); n = F(n + F(wil * F(0.1))); n = F(n + F(luk * F(0.1)));
  return dice100(unityRound(n), rolls());
}
export function pcaaoCompareShieldToUnderArmor(target, struckBodyPart, naturalDamResist, modules) {
  const shield = leftHandShield(target);
  const shieldReduced = pcaaoPercentageReductionAverage(shield, pcaaoArmorMaterialIdentifier(shield), 100, naturalDamResist, true, modules);
  const under = struckSlotItem(target, struckBodyPart);
  const underReduced = under
    ? pcaaoPercentageReductionAverage(under, pcaaoArmorMaterialIdentifier(under), 100, naturalDamResist, false, modules)
    : unityRound(F(100 * F(1 - naturalDamResist)));
  return shieldReduced <= underReduced;
}

// The C# computes a -0.2..0.2 clamp here and discards it.
export function pcaaoNaturalDamageResistance(target) {
  let n = F((stat(target, 'endurance') - 50) * F(0.002));
  n = F(n + F((stat(target, 'strength') - 50) * F(0.001)));
  n = F(n + F((stat(target, 'willpower') - 50) * F(0.001)));
  return n;
}

export function pcaaoAttackDamage(attacker, target, {
  weapon: weaponIn = null, damageMod = 0, toHitMod = 0, backstabChance = 0, weaponAnimTime = 0,
  rolls = Math.random, dfRand = () => Math.floor(Math.random() * 32768), onMonsterHit = null, onInflictPoison = null,
  say = null, playerReflexes = null, notes = null, modules = pcaaoModules(), unaware = false, onStruck = null,
  blowShare = null, armorPierce = 0,
} = {}) {
  if (!attacker || !target) return 0;
  let weapon = weaponIn;
  let damageModifiers = 0, damage = 0, chanceToHitMod = 0, backstab = 0;
  let skillID = 0;
  let unarmedAttack = false, weaponAttack = false, bluntWep = false, critSuccess = false;
  let critDamMulti = F(1), critHitAddi = 0, matReqDamMulti = F(1);
  const AITarget = isPlayer(target) ? null : target;
  const AIAttacker = isPlayer(attacker) ? null : attacker;
  if (AIAttacker && weapon) {
    // An enemy's weapon loses to its own natural attack when that averages higher.
    const wepAvg = int((itemMinDamage(weapon) + itemMaxDamage(weapon)) / 2);
    const b = AIAttacker.basics ?? {};
    if (int(((b.minDamage ?? 0) + (b.maxDamage ?? 0)) / 2) > wepAvg) weapon = null;
  }
  const struckWith = weapon;
  if (weapon) {
    if (modules.softMaterialRequirements) {
      if ((target.minMetalToHit ?? -1) > weapon.material) {
        let m = F((target.minMetalToHit ?? -1) - weapon.material);
        m = m <= 0 ? F(1) : F(F(Math.min(F(m * F(0.2)), F(0.9)) - 1) * -1);
        matReqDamMulti = m;
      }
      skillID = weaponSkillOf(weapon);
      if (skillID === SKILLS.BluntWeapon) bluntWep = true;
    } else {
      if ((target.minMetalToHit ?? -1) > weapon.material) {
        if (isPlayer(attacker)) say?.(materialIneffectiveText());
        if (notes) notes.ineffective = true;
        return 0;
      }
      skillID = weaponSkillOf(weapon);
      if (skillID === SKILLS.BluntWeapon) bluntWep = true;
    }
  } else {
    skillID = SKILLS.HandToHand;
  }
  // A departure: one skill-to-hit rule for every striker. The player's flat armor term of 100 stays, as in the mod.
  chanceToHitMod = Math.ceil(F(skill(attacker, skillID) * F(1.5)));
  if (modules.criticalStrikesIncreaseDamage) {
    critSuccess = pcaaoCriticalStrike(attacker, rolls);
    if (critSuccess) {
      const crit = skill(attacker, SKILLS.CriticalStrike);
      critDamMulti = F(F(int(crit / 5) * F(0.05)) + 1);
      critHitAddi = int(crit / 4);
      chanceToHitMod += critHitAddi;
      if (notes) notes.critical = true;
    }
  }
  if (isPlayer(attacker)) {
    damageModifiers += damageMod;
    chanceToHitMod += toHitMod;
    const prof = pcaaoProficiencyModifiers(attacker, weapon);
    damageModifiers += prof.damageMod; chanceToHitMod += prof.toHitMod;
    const racial = pcaaoRacialModifiers(attacker, weapon, attacker);
    damageModifiers += racial.damageMod; chanceToHitMod += racial.toHitMod;
    backstab = backstabChance;
    chanceToHitMod += backstab;
  }
  const struckBodyPart = pcaaoStruckBodyPart(rolls());
  onStruck?.(struckBodyPart);
  const backstabbed = (before, after) => { if (notes && before > 0 && after === before * 3) notes.backstab = true; };
  if (skillID === SKILLS.HandToHand) {
    unarmedAttack = true;
    if (isPlayer(attacker) || isClassEnemy(AIAttacker)) {
      if (pcaaoSuccessfulHit(attacker, target, chanceToHitMod, struckBodyPart, rolls, modules, notes)) {
        if (notes) notes.hit = true;
        damage = pcaaoHandToHandAttackDamage(attacker, target, damageModifiers, isPlayer(attacker), rolls, { unaware: !!unaware });
        const before = damage;
        damage = pcaaoBackstabDamage(damage, backstab, rolls, say);
        backstabbed(before, damage);
      }
    } else if (AIAttacker) {
      if (pcaaoSpecialWeaponCheckForMonsters(attacker)) {
        unarmedAttack = false;
        weaponAttack = true;
        weapon = pcaaoMonsterWeaponAssign(attacker, rolls);
        skillID = weaponSkillOf(weapon);
        if (skillID === SKILLS.BluntWeapon) bluntWep = true;
      }
      const b = AIAttacker.basics ?? {};
      const spans = [[b.minDamage ?? 0, b.maxDamage ?? 0], [b.minDamage2 ?? 0, b.maxDamage2 ?? 0], [b.minDamage3 ?? 0, b.maxDamage3 ?? 0]];
      const reflexes = playerReflexes ?? (isPlayer(target) ? target.reflexes : null) ?? 2;
      const reflexesChance = 50 - 10 * (reflexes - 2);
      for (const [min, max] of spans) {
        if (dfRand() % 100 < reflexesChance && min > 0 && pcaaoSuccessfulHit(attacker, target, chanceToHitMod, struckBodyPart, rolls, modules, notes)) {
          if (notes) notes.hit = true;
          const hit = range(min, max, rolls);
          if (hit > 0 && onMonsterHit) onMonsterHit(attacker, target, hit);
          damage += hit;
        }
      }
      if (damage >= 1) damage = pcaaoHandToHandAttackDamage(attacker, target, damage, false, rolls);
    }
  } else if (weapon) {
    weaponAttack = true;
    chanceToHitMod += pcaaoWeaponToHit(weapon);
    if (modules.rolePlayRealismArchery) chanceToHitMod = rrAdjustWeaponHitChanceMod(chanceToHitMod, weaponAnimTime, weapon);
    if (pcaaoSuccessfulHit(attacker, target, chanceToHitMod, struckBodyPart, rolls, modules, notes)) {
      if (notes) notes.hit = true;
      damage = pcaaoWeaponAttackDamage(attacker, target, damageModifiers, weaponAnimTime, weapon, rolls, modules, { unaware: !!unaware });
      const before = damage;
      damage = pcaaoBackstabDamage(damage, backstab, rolls, say);
      backstabbed(before, damage);
    }
    if (damage > 0 && (weapon.poisonType ?? -1) !== -1) {
      if (onInflictPoison) onInflictPoison(attacker, target, weapon.poisonType);
      weapon.poisonType = -1;
    }
  }
  damage = Math.max(0, damage);
  if (critSuccess) damage = unityRound(F(damage * critDamMulti));
  const preMatReq = F(damage);
  damage = unityRound(F(damage * matReqDamMulti));
  const postMatReq = F(damage);
  if (modules.softMaterialRequirements && isPlayer(attacker) && preMatReq > 0 && F(postMatReq / preMatReq) <= F(0.45)) {
    say?.('This Weapon Is Not Very Effective Against This Creature.', 1);
  }
  const naturalDamResist = pcaaoNaturalDamageResistance(target);
  const shield = leftHandShield(target);
  let shieldStrongSpot = false;
  shieldBlockSuccess = false;
  if (shield) {
    for (const part of SHIELD_PARTS.get(shield.templateIndex) ?? []) {
      if (shieldStrongSpot) break;
      if (part === struckBodyPart) shieldStrongSpot = true;
    }
    shieldBlockSuccess = pcaaoShieldBlockChanceCalculation(target, shieldStrongSpot, shield, rolls);
    if (shieldBlockSuccess) shieldBlockSuccess = pcaaoCompareShieldToUnderArmor(target, struckBodyPart, naturalDamResist, modules);
  }
  if (modules.conditionBasedEffectiveness && isPlayer(attacker) && weapon) {
    damage = pcaaoAlterDamageBasedOnWepCondition(damage, bluntWep, weapon, modules.equipmentDamageEnhanced);
  }
  if (damage < 1) return damage;
  // The off hand's share applies before either wear; notes.shared stops the formula tail from sharing it twice.
  const shared = (d) => (blowShare && d > 0 ? blowShare(d) : d);
  if (blowShare && notes) notes.shared = true;
  // With the wear module on, gear wears the mod's way before the reduction.
  if (modules.equipmentDamageEnhanced) pcaaoDamageEquipment(attacker, target, shared(damage), weapon, struckBodyPart, { rolls, say, modules });
  const unreduced = damage;
  if (AITarget && isMonster(AITarget)) {
    if (!pcaaoArmorStruckVerification(target, struckBodyPart)) damage = pcaaoPercentageReductionCalculationForMonsters(attacker, target, damage, bluntWep, naturalDamResist);
    else if (unarmedAttack) damage = pcaaoArmorDamageReductionWithUnarmed(attacker, target, damage, struckBodyPart, naturalDamResist, modules);
    else if (weaponAttack) damage = pcaaoArmorDamageReductionWithWeapon(attacker, target, damage, weapon, struckBodyPart, naturalDamResist, modules);
  } else if (unarmedAttack) {
    damage = pcaaoArmorDamageReductionWithUnarmed(attacker, target, damage, struckBodyPart, naturalDamResist, modules);
  } else if (weaponAttack) {
    damage = pcaaoArmorDamageReductionWithWeapon(attacker, target, damage, weapon, struckBodyPart, naturalDamResist, modules);
  }
  if (weaponAttack && damage < unreduced) {
    const basePierce = armorPierceShare(attacker, target, weapon);
    const p = shieldBlockSuccess ? basePierce : basePierce + (1 - basePierce) * armorPierce;
    if (p > 0) damage = Math.round(damage + (unreduced - damage) * p);
  }
  damage = shared(damage);
  // With the wear module off, DFU's DamageEquipment wears gear by the damage after the reduction, and a monster's
  // stand-in weapon wears no armor.
  if (!modules.equipmentDamageEnhanced) damageEquipment(attacker, target, damage, struckWith, struckBodyPart, { rolls, say });
  return damage;
}

export function installPcaao({ read = null, other = null } = {}) {
  const modules = () => pcaaoModules(read ?? undefined, other ?? undefined);
  registerFormulaOverride('damageModifier', (strength) => (modules().fixedStrengthDamageModifier ? pcaaoDamageModifier(strength) : undefined));
  registerFormulaOverride('damageEquipment', (attacker, target, damage, weapon, struckBodyPart, opts = {}) => {
    const m = modules();
    if (!m.equipmentDamageEnhanced) return undefined;
    pcaaoDamageEquipment(attacker, target, damage, weapon, struckBodyPart, { ...opts, modules: m });
    return false;
  });
  registerFormulaOverride('calculateAttackDamage', (attacker, target, opts = {}) => {
    const m = modules();
    if (!m.armorHitFormulaRedone) return undefined;
    return pcaaoAttackDamage(attacker, target, { ...opts, modules: m });
  });
  registerFormulaOverride('struckBodyPartTable', () => (modules().armorHitFormulaRedone ? PCAAO_BODY_PARTS : undefined));
  // InitMod registers the archery pair whatever the armor module says, so the stock formula bends bow shots too.
  registerFormulaOverride('adjustWeaponHitChanceMod', (attacker, target, hitChanceMod, weaponAnimTime, weapon) =>
    (modules().rolePlayRealismArchery ? rrAdjustWeaponHitChanceMod(hitChanceMod, weaponAnimTime, weapon) : undefined));
  registerFormulaOverride('adjustWeaponAttackDamage', (attacker, target, damage, weaponAnimTime, weapon) =>
    (modules().rolePlayRealismArchery ? rrAdjustWeaponAttackDamage(damage, weaponAnimTime, weapon) : undefined));
  return true;
}
export function uninstallPcaao() {
  registerFormulaOverride('damageModifier', null);
  registerFormulaOverride('damageEquipment', null);
  registerFormulaOverride('calculateAttackDamage', null);
  registerFormulaOverride('struckBodyPartTable', null);
  registerFormulaOverride('adjustWeaponHitChanceMod', null);
  registerFormulaOverride('adjustWeaponAttackDamage', null);
}
