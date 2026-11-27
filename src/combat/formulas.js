// Combat formulas, ported from Daggerfall Unity (MIT, Daggerfall Workshop).

import { foeDamageMult } from '../world/wild/cromwark.js';
import { MELEE_DISTANCE } from '../characters/enemyMotor.js';
import { CLASSIC_TO_UNITY_RATIO } from '../player/motor.js';
import { rand } from '../formats/dfRandom.js';
import { enchantChanceToHitMod, doItemEnchantmentPayloads, PAYLOAD, isEnchantedItem, entityImprovedAdrenalineRush } from '../magic/enchantments.js';
import { entityArmorMod, entityWeightMult, weaponDamageMods, weaponBlowMods } from '../characters/entityMods.js';
import { liveStat } from '../characters/statMods.js';
import { skillValue, SKILLS } from '../characters/skills.js';
import { noteSkillChallenge } from '../characters/skillSoftcap.js';
import { mentorArmorValue, mentorGearScale, mentorDamageTakenMult } from '../characters/mentorMode.js';
import { RACES } from '../characters/races.js';
import { previewPhysicalActor, previewRacialModifiers, racialGuardDamage } from './abilities/racialIdentity.js';
// specialAdvantages.js, not rest.js: rest.js imports this file, and the cycle would leave the binding undefined.
import { SPECIAL_ABILITY_BITS, PROFICIENCY_BITS } from '../characters/specialAdvantages.js';
import { weaponMinDamage, weaponMaxDamage, weaponSkillUsed, itemMinDamage, itemMaxDamage } from '../characters/weapons.js';
import { equipTableOf, lowerCondition, dfuBlowWear, slotForBodyPart, EQUIP_SLOTS, weaponProficiencyFlag } from '../characters/equip.js';
import { SHIELD_PARTS } from '../items/armorMaterials.js';
import { clawMetalDamage } from './clawMetal.js';
import { totalWeight } from '../items/inventory.js';
// racialLive.js, concealment.js, and blowTaken.js stay import-free; their fuller neighbors import this file.
import { liveVampirism } from '../afflictions/racialLive.js';
import { breakNormalPowerConcealment } from '../magic/concealment.js';
import { localizedText } from '../ui/textManager.js';
import { blowTaken } from './blowTaken.js';
import { ENEMY_GROUPS, enemyEntityGroup, _resetEnemyGroups } from './enemyGroups.js';

export const dice100 = (chance, roll01 = Math.random()) => Math.floor(roll01 * 100) < chance;

// A registered override returns undefined to decline, and the stock formula runs instead.
const _overrides = new Map();
export function registerFormulaOverride(name, fn) { if (fn) _overrides.set(name, fn); else _overrides.delete(name); }
export function _resetFormulaDoors() { _overrides.clear(); _resetEnemyGroups(); _languages.length = 0; _skeletal.length = 0; }
export const formulaOverride = (name) => _overrides.get(name) ?? null;

export function adjustWeaponHitChanceMod(attacker, target, hitChanceMod, weaponAnimTime, weapon) {
  const r = _overrides.get('adjustWeaponHitChanceMod')?.(attacker, target, hitChanceMod, weaponAnimTime, weapon);
  return r === undefined ? hitChanceMod : r;
}
export function adjustWeaponAttackDamage(attacker, target, damage, weaponAnimTime, weapon) {
  const r = _overrides.get('adjustWeaponAttackDamage')?.(attacker, target, damage, weaponAnimTime, weapon);
  return r === undefined ? damage : r;
}

export function damageModifier(strength) {
  const r = _overrides.get('damageModifier')?.(strength);
  return r === undefined ? Math.floor((strength - 50) / 5) : r;
}

export const maxEncumbrance = (strength) => Math.floor(strength * 1.5);
export const entityMaxEncumbrance = (entity) => {
  const amount = maxEncumbrance(liveStat(entity, 'strength'));
  const mult = entityWeightMult(entity);
  return mult > 0 ? amount + Math.trunc(amount * mult) : amount;
};
export const MATERIAL_INEFFECTIVE_TEXT = 'The material of the weapon you are using is ineffective.';
export const materialIneffectiveText = () => localizedText('materialIneffective', MATERIAL_INEFFECTIVE_TEXT);
export const spellPointsFor = (intelligence, multiplier) => Math.floor(intelligence * multiplier);
export const magicResist = (willpower) => Math.floor(willpower / 10);
export const toHitModifier = (agility) => Math.floor(agility / 10) - 5;
export const hitPointsModifier = (endurance) => Math.floor(endurance / 10) - 5;
// Follows DFU, which drops classic's +1 on a negative modifier.
export const healingRateModifier = (endurance) => Math.floor(endurance / 10) - 5;

export const handToHandMinDamage = (skill) => Math.floor(skill / 10) + 1;
export const handToHandMaxDamage = (skill) => Math.floor(skill / 5) + 1;

export const WEAPON_MIN_DAMAGE = Object.freeze({
  Dagger: 1, Tanto: 1, Wakazashi: 1, Shortsword: 1, Broadsword: 1, Staff: 1, Mace: 1,
  Longsword: 2, Claymore: 2, 'Battle Axe': 2, 'War Axe': 2, Flail: 2,
  Saber: 3, Katana: 3, 'Dai-Katana': 3, Warhammer: 3,
  // Bows deal 1 more minimum damage than DFU's table, a Bunnyfall balance change.
  'Short Bow': 5, 'Long Bow': 5,
});
export const WEAPON_MAX_DAMAGE = Object.freeze({
  Dagger: 6, Tanto: 8, Shortsword: 8, Staff: 8, Wakazashi: 10,
  Broadsword: 12, Saber: 12, 'Battle Axe': 12, Mace: 12, Flail: 14,
  Longsword: 16, Katana: 16, 'War Axe': 16, 'Short Bow': 17,
  Claymore: 18, Warhammer: 18, 'Long Bow': 19, 'Dai-Katana': 21,
});

export const baseDamageMin = (weapon) => itemMinDamage(weapon);
export const baseDamageMax = (weapon) => itemMaxDamage(weapon);

export const WEAPON_MATERIAL_MODIFIER = Object.freeze([-1, 0, 0, 1, 2, 3, 3, 4, 5, 6]);

export const STRUCK_BODY_PARTS = Object.freeze([0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 6]);
export const calculateStruckBodyPart = (roll01 = Math.random()) => STRUCK_BODY_PARTS[Math.floor(roll01 * STRUCK_BODY_PARTS.length)];

export { ENEMY_GROUPS, registerEnemyGroup, enemyEntityGroup } from './enemyGroups.js';
export const GROUP_BITS = Object.freeze([[0x01, 0x10], [0x02, 0x20], [0x04, 0x40], [0x08, 0x80]]);
// Bonus and phobia bits decode exclusively, bonus first, as in DFU: a custom class with both bits gets the bonus.
export function careerAttackModifier(attackModifierFlags, group) {
  const [bonus, phobia] = GROUP_BITS[group] ?? [];
  if (bonus == null) return 0;
  if ((attackModifierFlags & bonus) === bonus) return 1;
  if ((attackModifierFlags & phobia) === phobia) return -1;
  return 0;
}

export function bonusOrPenaltyByEnemyType(attacker, target) {
  if (!attacker || !target) return 0;
  const flags = attacker.attackModifierFlags ?? attacker.career?.attackModifierFlags ?? null;
  if (flags == null) return 0;
  let group = ENEMY_GROUPS.None;
  if (target.isPlayer) {
    group = liveVampirism(target) ? ENEMY_GROUPS.Undead : ENEMY_GROUPS.Humanoid;
  } else if (target.affinity === 'Human') {
    group = ENEMY_GROUPS.Humanoid;
  } else {
    const g = enemyEntityGroup(target.careerIndex);
    // DFU's ladder has no Humanoid arm here, so a humanoid enemy without Human affinity (an Orc) gets nothing.
    if (g === ENEMY_GROUPS.Undead || g === ENEMY_GROUPS.Daedra || g === ENEMY_GROUPS.Animals) group = g;
  }
  if (group === ENEMY_GROUPS.None) return 0;
  return careerAttackModifier(flags, group) * attacker.level;
}

// Expert weapon flags sit at bits 16 to 21 of the career field, the layout character creation writes.
// weaponProficiencyFlag returns -1 for an unlisted weapon, so any expert career gets the bonus, as in DFU.
export function proficiencyModifiers(attacker, weapon) {
  const mods = { damageMod: 0, toHitMod: 0 };
  const expert = ((attacker.career?.weaponArmorShieldsBitfield ?? 0) >>> 16) & 0x3f;
  const grant = () => {
    mods.damageMod = Math.trunc(attacker.level / 3) + 1;
    mods.toHitMod = attacker.level;
  };
  if (weapon) {
    if ((expert & weaponProficiencyFlag(weapon)) !== 0) grant();
  } else if ((expert & PROFICIENCY_BITS.handToHand) !== 0) grant();
  return mods;
}

// The else-if order is DFU's: a Dark Elf archer takes the Dark Elf bonus, and a Redguard archer gets none.
export function racialModifiers(attacker, weapon) {
  const preview = previewRacialModifiers(attacker, weapon);
  if (preview) return preview;
  const mods = { damageMod: 0, toHitMod: 0 };
  if (!weapon) return mods;
  const set = (n) => { mods.damageMod = n; mods.toHitMod = n; };
  if (attacker.raceId === RACES.DarkElf) set(Math.trunc(attacker.level / 4));
  else if (weaponSkillUsed(weapon.templateIndex) === SKILLS.Archery) {
    if (attacker.raceId === RACES.WoodElf) set(Math.trunc(attacker.level / 3));
  } else if (attacker.raceId === RACES.Redguard) set(Math.trunc(attacker.level / 3));
  return mods;
}

export const statsToHit = (a, t) =>
  Math.trunc((liveStat(a, 'luck') - liveStat(t, 'luck')) / 10) + Math.trunc((liveStat(a, 'agility') - liveStat(t, 'agility')) / 10);

export function skillsToHit(a, t, roll01 = Math.random(), notes = null) {
  let mod = -Math.floor(skillValue(t, SKILLS.Dodging) / 4);
  const crit = skillValue(a, SKILLS.CriticalStrike);
  if (dice100(crit, roll01)) { mod += Math.floor(crit / 10); if (notes) notes.critical = true; }
  return mod;
}

export function adjustmentsToHit(target) {
  let mod = 0;
  if (target.isPlayer) mod -= (target.biographyAvoidHitMod ?? 0);
  if (!target.isPlayer && target.isClass === false) mod += 40;
  mod -= 50;
  return mod;
}

export const ADRENALINE_RUSH_MODIFIER = 5;
export const IMPROVED_ADRENALINE_RUSH_MODIFIER = 8;
const hasAbility = (career, flag) => ((career?.abilityFlagsAndSpellPointsBitfield ?? 0) & flag) === flag;
const inAdrenalineRush = (e) => Boolean(e)
  && hasAbility(e.career, SPECIAL_ABILITY_BITS.adrenalineRush)
  && (e.health ?? 0) < Math.trunc((e.maxHealth ?? 0) / 8);
export function adrenalineRushToHit(attacker, target) {
  let mod = 0;
  if (inAdrenalineRush(attacker)) {
    mod += entityImprovedAdrenalineRush(attacker) ? IMPROVED_ADRENALINE_RUSH_MODIFIER : ADRENALINE_RUSH_MODIFIER;
  }
  if (inAdrenalineRush(target)) {
    mod -= entityImprovedAdrenalineRush(target) ? IMPROVED_ADRENALINE_RUSH_MODIFIER : ADRENALINE_RUSH_MODIFIER;
  }
  return mod;
}

export function calculateSuccessfulHit(attacker, target, chanceToHitMod, struckBodyPart, rolls = Math.random, notes = null, armorPierce = 0) {
  let chance = chanceToHitMod;
  const armor = mentorArmorValue(target, target.armorValues?.[struckBodyPart] ?? 0) + entityArmorMod(target, struckBodyPart);
  chance += armor + (armorPierce > 0 ? Math.max(0, 100 - armor) * armorPierce : 0);
  chance += adrenalineRushToHit(attacker, target);
  chance += enchantChanceToHitMod(attacker);
  chance += statsToHit(attacker, target);
  chance += skillsToHit(attacker, target, rolls(), notes);
  chance += adjustmentsToHit(target);
  chance = Math.max(3, Math.min(97, chance));
  return dice100(chance, rolls());
}

export function handToHandAttackDamage(attacker, target, damageMod, isPlayer, rolls = Math.random, info = undefined) {
  const h2h = skillValue(attacker, SKILLS.HandToHand);
  const min = handToHandMinDamage(h2h);
  const max = handToHandMaxDamage(h2h);
  let damage = min + Math.floor(rolls() * (max + 1 - min));
  damage += damageMod;
  if (isPlayer) damage += damageModifier(liveStat(attacker, 'strength'));
  // A Bunnyfall change: a beast form's claws add its gauntlets' metal where a weapon adds its material.
  if (isPlayer) damage += clawMetalDamage(attacker);
  damage += bonusOrPenaltyByEnemyType(attacker, target);
  if (isPlayer && !attacker.isInBeastForm) damage = weaponBlowMods(null, damage, attacker, target, info);
  return damage;
}

export const SKELETAL_WARRIOR_INDEX = 15;

// DFU checks the career index alone, so a Barbarian class enemy (career 15) also counts; a mod's test replaces it.
const _skeletal = [];
export function registerSkeletalTarget(fn) {
  if (typeof fn !== 'function') throw new Error('registerSkeletalTarget: a function of (target)');
  _skeletal.push(fn);
}
export const isSkeletalTarget = (target) => {
  for (const fn of _skeletal) { const a = fn(target); if (a != null) return a === true; }
  return target.careerIndex === SKELETAL_WARRIOR_INDEX;
};

const _silverVetoes = new Map();
export function registerSilverDoubleVeto(name, fn) { if (typeof fn === 'function') _silverVetoes.set(name, fn); else _silverVetoes.delete(name); }
export function silverDoubles(target) {
  for (const fn of _silverVetoes.values()) { try { if (fn(target) === true) return false; } catch { } }
  return true;
}

export function weaponAttackDamage(attacker, target, damageMod, weapon, rolls = Math.random, weaponAnimTime = 0, info = undefined) {
  const wMin = baseDamageMin(weapon), wMax = baseDamageMax(weapon);
  let damage = weaponDamageMods(weapon, wMin + Math.floor(rolls() * (wMax + 1 - wMin)), attacker) + damageMod;
  if (!target.isPlayer && isSkeletalTarget(target)) {
    if ((weapon.flags & 0x10) === 0) damage = Math.trunc(damage / 2);
    if (weapon.material === 2 && silverDoubles(target)) damage *= 2;
  }
  damage += damageModifier(liveStat(attacker, 'strength'));
  damage += WEAPON_MATERIAL_MODIFIER[weapon.material] ?? 0;
  if (damage < 1) damage = 0;
  damage += bonusOrPenaltyByEnemyType(attacker, target);
  // Before the mod hook, so a bow's draw scales the blow modifiers too.
  damage = weaponBlowMods(weapon, damage, attacker, target, info);
  damage = adjustWeaponAttackDamage(attacker, target, damage, weaponAnimTime, weapon);
  return damage;
}

export const SUCCESSFUL_BACKSTAB_TEXT = 'Successful backstab!';
export const successfulBackstabText = () => localizedText('successfulBackstab', SUCCESSFUL_BACKSTAB_TEXT);
// Rolls only when backstabbingLevel is above 1, as DFU short-circuits, so other swings draw no roll.
export function backstabDamage(damage, backstabbingLevel, rolls = Math.random, say = null) {
  if (backstabbingLevel > 1 && dice100(backstabbingLevel, rolls())) {
    say?.(successfulBackstabText());
    return damage * 3;
  }
  return damage;
}

export function chooseEnemyWeapon(weapon, basics) {
  if (!weapon) return null;
  const weaponAvg = Math.trunc((baseDamageMin(weapon) + baseDamageMax(weapon)) / 2);
  const noWeaponAvg = Math.trunc(((basics?.minDamage ?? 0) + (basics?.maxDamage ?? 0)) / 2);
  return noWeaponAvg > weaponAvg ? null : weapon;
}

export function dropWeaponIfTargetImmune(weapon, targetEntity) {
  if (!weapon || !targetEntity) return weapon ?? null;
  return (targetEntity.minMetalToHit ?? -1) > weapon.material ? null : weapon;
}

export function damageEquipment(attacker, target, damage, weapon, struckBodyPart, { rolls = Math.random, say = null } = {}) {
  // The gate boss's stand-in (spareGear) wears no gear: its fights take hundreds of blows.
  if (target?.spareGear) return;
  const o = _overrides.get('damageEquipment');
  if (o && o(attacker, target, damage, weapon, struckBodyPart, { rolls, say }) !== undefined) return;
  if (!weapon || damage <= 0) return;
  const hit = (item, owner) => {
    if (_overrides.get('applyConditionDamageThroughPhysicalHit')?.(item, owner, damage, { say, rolls }) === true) return;
    let amount = Math.trunc((10 * damage + 50) / 100);
    if (amount === 0 && dice100(20, rolls())) amount = 1;
    lowerCondition(item, dfuBlowWear(amount, rolls), owner, say);
  };
  hit(weapon, attacker);
  const slots = equipTableOf(target);
  const shield = slots[EQUIP_SLOTS.LeftHand];
  const covered = shield ? SHIELD_PARTS.get(shield.templateIndex) ?? [] : [];
  if (covered.includes(struckBodyPart)) hit(shield, target);
  else {
    const slot = slotForBodyPart(struckBodyPart);
    const armor = slot !== EQUIP_SLOTS.None ? slots[slot] : null;
    if (armor) hit(armor, target);
  }
}

export function calculateAttackDamage(attacker, target, { weapon = null, damageMod = 0, toHitMod = 0, backstabChance = 0, weaponAnimTime = 0, rolls = Math.random, dfRand = rand, onMonsterHit = null, onInflictPoison = null, say = null, enchantCtx = null, playerReflexes = null, unaware = false, blowInfo = null, blowShare = null, blowWeight = 1, armorPierce = 0 } = {}) {
  if (!attacker || !target) return 0;
  if (attacker.isPlayer && !attacker.peer) noteSkillChallenge(attacker, target);
  if (target.isPlayer && !target.peer) noteSkillChallenge(target, attacker);
  const notes = { critical: false, backstab: false, hit: false, ineffective: false };
  let struckPart = -1;
  const report = (damage) => {
    if (_playerAttackHook && attacker.isPlayer && !attacker.peer) {
      try { _playerAttackHook({ ...notes, damage, attacker, target, weapon }); } catch { }
    }
    if (_resolutionListeners.size) for (const fn of _resolutionListeners.values()) { try { fn({ ...notes, damage, attacker, target, weapon }); } catch { } }
    return damage;
  };
  // A registered core replaces the stock core below; the tail is work DFU does in its callers, so it runs for both.
  const core = _overrides.get('calculateAttackDamage');
  const overridden = core ? core(attacker, target, { weapon, damageMod, toHitMod, backstabChance, weaponAnimTime, rolls, dfRand, onMonsterHit, onInflictPoison, say, playerReflexes, notes, onStruck: (part) => (struckPart = part), unaware, blowShare, armorPierce }) : undefined;
  let damage = 0;
  // An off-hand blow's share applies before anything reads the damage; a core that applied it sets notes.shared.
  const shared = (d) => (blowShare && d > 0 ? blowShare(d) : d);
  if (overridden !== undefined) {
    damage = notes.shared ? overridden : shared(overridden);
  } else {
  if (weapon && (target.minMetalToHit ?? -1) > weapon.material) {
    if (attacker.isPlayer) say?.(materialIneffectiveText());
    notes.ineffective = true;
    return report(0);
  }
  const attackSkill = weapon ? (weaponSkillUsed(weapon.templateIndex) ?? SKILLS.HandToHand) : SKILLS.HandToHand;
  let chanceToHitMod = skillValue(attacker, attackSkill) + toHitMod;
  let damageModifiers = damageMod;
  if (attacker.isPlayer) {
    const prof = proficiencyModifiers(attacker, weapon);
    damageModifiers += prof.damageMod;
    chanceToHitMod += prof.toHitMod;
    const racial = racialModifiers(attacker, weapon);
    damageModifiers += racial.damageMod;
    chanceToHitMod += racial.toHitMod;
  }
  chanceToHitMod += backstabChance;
  if (weapon) chanceToHitMod += _overrides.get('calculateWeaponToHit')?.(weapon) ?? (WEAPON_MATERIAL_MODIFIER[weapon.material] ?? 0) * 10;
  if (weapon) chanceToHitMod = adjustWeaponHitChanceMod(attacker, target, chanceToHitMod, weaponAnimTime, weapon);
  const struck = calculateStruckBodyPart(rolls());
  struckPart = struck;
  if (!weapon) {
    if (!attacker.isPlayer && attacker.isClass === false && attacker.basics) {
      const b = attacker.basics;
      const spans = [
        [b.minDamage ?? 0, b.maxDamage ?? 0],
        [b.minDamage2 ?? 0, b.maxDamage2 ?? 0],
        [b.minDamage3 ?? 0, b.maxDamage3 ?? 0],
      ];
      // DFU reads the player's Reflexes setting whoever is bitten; enemy-vs-enemy strikes pass playerReflexes.
      const reflexes = playerReflexes ?? (target.isPlayer ? target.reflexes : null) ?? 2;
      const reflexesChance = 50 - 10 * (reflexes - 2);
      for (const [min, max] of spans) {
        let hitDamage = 0;
        if (dfRand() % 100 < reflexesChance && min > 0 &&
            calculateSuccessfulHit(attacker, target, chanceToHitMod, struck, rolls, notes)) {
          notes.hit = true;
          hitDamage = min + Math.floor(rolls() * (max + 1 - min));
          if (hitDamage > 0 && onMonsterHit) onMonsterHit(attacker, target, hitDamage);
          damage += hitDamage;
        }
        if (hitDamage > 0) damage += bonusOrPenaltyByEnemyType(attacker, target);
      }
    } else if (calculateSuccessfulHit(attacker, target, chanceToHitMod, struck, rolls, notes)) {
      notes.hit = true;
      damage = handToHandAttackDamage(attacker, target, damageModifiers, !!attacker.isPlayer, rolls, { unaware: !!unaware });
      // The backstab roll stays inside the hit, as in DFU, so a miss draws no roll.
      const before = damage;
      damage = backstabDamage(damage, backstabChance, rolls, say);
      if (before > 0 && damage === before * 3) notes.backstab = true;
    }
  } else {
    if (calculateSuccessfulHit(attacker, target, chanceToHitMod, struck, rolls, notes, armorPierce)) {
      notes.hit = true;
      damage = weaponAttackDamage(attacker, target, damageModifiers, weapon, rolls, weaponAnimTime, { unaware: !!unaware });
      const before = damage;
      damage = backstabDamage(damage, backstabChance, rolls, say);
      if (before > 0 && damage === before * 3) notes.backstab = true;
    }
  }
  if (weapon && damage > 0 && (weapon.poisonType ?? -1) !== -1) {
    if (onInflictPoison) onInflictPoison(attacker, target, weapon.poisonType);
    weapon.poisonType = -1;
  }
  damage = shared(Math.max(0, damage));
  damageEquipment(attacker, target, damage, weapon, struck, { rolls, say });
  }
  if (damage > 0 && !target.isPlayer && !target.peer && previewPhysicalActor(attacker)) {
    damage = Math.round(damage * 1.20);
  }
  if (!attacker.isPlayer && damage > 0 && Number.isFinite(attacker.damageScale) && attacker.damageScale !== 1) {
    damage = Math.max(1, Math.round(damage * attacker.damageScale));
  }
  if (!attacker.isPlayer && target?.isPlayer && damage > 0 && foeDamageMult() > 1) damage = Math.max(1, Math.round(damage * foeDamageMult()));
  if (damage > 0 && attacker.isPlayer && !attacker.peer) {
    const k = mentorGearScale(attacker);
    if (k < 1) damage = Math.max(1, Math.round(damage * k));
  }
  if (damage > 0 && target?.isPlayer && !target.peer && !attacker.isPlayer) {
    const m = mentorDamageTakenMult(target);
    if (m > 1) damage = Math.max(1, Math.round(damage * m));
  }
  const takenInfo = { kind: weapon && weaponSkillUsed(weapon.templateIndex) === SKILLS.Archery ? 'arrow' : 'melee', ...(blowInfo ?? {}) };
  damage = blowTaken(damage, attacker, target, weapon, takenInfo);
  damage = racialGuardDamage(damage, attacker, target, takenInfo.kind);
  if (damage > 0) breakNormalPowerConcealment(attacker);
  const whole = !(blowWeight < 1) || rolls() < blowWeight;
  // As in DFU, a player strike runs Strikes payloads even at 0 damage, and an enemy strike only above 0.
  if (weapon && isEnchantedItem(weapon) && (attacker.isPlayer || damage > 0) && whole) {
    damage = doItemEnchantmentPayloads(PAYLOAD.Strikes, weapon, {
      entity: attacker, target, damage,
      nowMinutes: enchantCtx?.nowMinutes ?? null, ctx: enchantCtx,
    });
  }
  // The struck hooks are registered, not imported: artifactEffects.js imports this file.
  if (target?.isPlayer && !attacker.isPlayer && damage > 0) {
    _playerStruckHook?.(attacker, target, damage);
    for (const fn of _playerStruckListeners.values()) { try { fn(attacker, target, damage); } catch { } }
  }
  // Not gated on damage: the Shield Widget's Recoil also reacts to misses and blocked blows.
  if (target?.isPlayer && !attacker.isPlayer) {
    _attackOnPlayerHook?.(attacker, target, damage, struckPart);
  }
  if (attacker.isPlayer && !attacker.peer && !target.isPlayer && damage > 0) {
    const info = { backstab: notes.backstab, blow: whole };
    for (const fn of _playerStrikeListeners.values()) { try { fn(attacker, target, damage, weapon, info); } catch { } }
  }
  return report(damage);
}

let _playerAttackHook = null;
const _resolutionListeners = new Map();
export function registerAttackResolutionListener(name, fn) { if (typeof fn === 'function') _resolutionListeners.set(name, fn); else _resolutionListeners.delete(name); }
export function setPlayerAttackHook(fn) { _playerAttackHook = fn ?? null; }
export function reportPlayerAttack(r) {
  if (!_playerAttackHook || !r) return;
  try { _playerAttackHook({ critical: false, backstab: false, ineffective: false, ...r }); } catch { }
}
let _playerStruckHook = null;
export function setPlayerStruckHook(fn) { _playerStruckHook = fn ?? null; }
const _playerStruckListeners = new Map();
export function registerPlayerStruckListener(name, fn) { if (typeof fn === 'function') _playerStruckListeners.set(name, fn); else _playerStruckListeners.delete(name); }
const _playerStrikeListeners = new Map();
export function registerPlayerStrikeListener(name, fn) { if (typeof fn === 'function') _playerStrikeListeners.set(name, fn); else _playerStrikeListeners.delete(name); }
let _attackOnPlayerHook = null;
export function setAttackOnPlayerHook(fn) { _attackOnPlayerHook = fn ?? null; }

const CLASS_STREETWISE = new Set([7, 8, 9, 10, 11, 5]);
const MONSTER_LANGUAGE = new Map([
  [7, SKILLS.Orcish], [12, SKILLS.Orcish], [21, SKILLS.Orcish], [24, SKILLS.Orcish],
  [13, SKILLS.Harpy],
  [16, SKILLS.Giantish], [22, SKILLS.Giantish],
  [34, SKILLS.Dragonish], [40, SKILLS.Dragonish],
  [10, SKILLS.Nymph], [42, SKILLS.Nymph],
  [25, SKILLS.Daedric], [26, SKILLS.Daedric], [27, SKILLS.Daedric], [29, SKILLS.Daedric], [31, SKILLS.Daedric],
  [2, SKILLS.Spriggan],
  [8, SKILLS.Centaurian],
  [1, SKILLS.Impish], [41, SKILLS.Impish],
  [28, SKILLS.Etiquette], [30, SKILLS.Etiquette], [32, SKILLS.Etiquette], [33, SKILLS.Etiquette],
]);
const _languages = [];
export function registerEnemyLanguage(fn) {
  if (typeof fn !== 'function') throw new Error('registerEnemyLanguage: a function of (entity)');
  _languages.push(fn);
}
export function enemyLanguageSkill(entity) {
  for (const fn of _languages) {
    const s = fn(entity);
    if (s != null) return s;
  }
  if (entity?.isClass) return CLASS_STREETWISE.has(entity.careerIndex) ? SKILLS.Streetwise : SKILLS.Etiquette;
  return MONSTER_LANGUAGE.get(entity?.careerIndex) ?? -1;
}

// comprehendBonus is passed in because importing effects.js here would cycle (effects, spellcast, then this file).
export function calculateEnemyPacification(player, languageSkill, sheathed, roll01 = Math.random(), comprehendBonus = 0) {
  let chance = 0;
  if (languageSkill === SKILLS.Etiquette || languageSkill === SKILLS.Streetwise) {
    chance += Math.trunc(skillValue(player, languageSkill) / 10);
    chance += Math.trunc(liveStat(player, 'personality') / 5);
  } else {
    chance += skillValue(player, languageSkill);
    chance += Math.trunc(liveStat(player, 'personality') / 10);
  }
  chance += sheathed ? 10 : -25;
  chance += comprehendBonus;
  return Math.floor(roll01 * 200) < chance;
}

export const MELEE_HIT_YAW_DEG = 35.156;
export function meleeHitConnects(dist, inSight, withinHitYaw) {
  return inSight && (dist <= 0.25 || (dist <= MELEE_DISTANCE && withinHitYaw));
}

export const KB_UNIT = CLASSIC_TO_UNITY_RATIO / 10;

export function enemyWeightClassicUnits(isClass, gender, mobileWeight, items = null) {
  const itemWeightsClassic = Math.trunc(totalWeight(items ?? []) * 4);
  const baseWeight = !isClass ? (mobileWeight ?? 0) : (gender === 'female' ? 240 : 350);
  return itemWeightsClassic + baseWeight;
}

export function calculateShopliftingChance(pickpocketSkill, shopQuality, weightAndNumItems) {
  const chance = (100 - pickpocketSkill) + shopQuality + weightAndNumItems;
  return Math.max(5, Math.min(95, chance));
}

export function calculatePickpocketingChance(pickpocketSkill, playerLevel, targetLevel = null) {
  let chance = pickpocketSkill;
  if (targetLevel != null) chance += 5 * (playerLevel - targetLevel);
  return Math.max(5, Math.min(95, chance));
}

// DFU's condition has no parentheses: (slow and class) or weighted, so weighted monsters take knockback every hit.
export function weaponKnockbackApplies(knockbackSpeed, isClass, mobileWeight) {
  return (knockbackSpeed <= 5 / KB_UNIT && !!isClass) || (mobileWeight ?? 0) > 0;
}

// Unlike the player's gate, DFU parenthesizes this one, and its class test names the attacker, not the target.
export function enemyKnockbackApplies(knockbackSpeed, attackerIsClass, targetMobileWeight) {
  return knockbackSpeed <= 5 / KB_UNIT && (!!attackerIsClass || (targetMobileWeight ?? 0) > 0);
}

export function weaponKnockbackSpeed(damage, weightClassic) {
  const ten = damage * 10, two = damage * 2;
  const kb = ((ten - weightClassic) * 256) / (weightClassic + ten) * two;
  let ks = (ten / weightClassic) * (two - kb / 256);
  ks /= KB_UNIT;
  const floor = 15 / KB_UNIT;
  return ks < floor ? floor : ks;
}

export const struckBodyPartTable = () => _overrides.get('struckBodyPartTable')?.() ?? STRUCK_BODY_PARTS;
