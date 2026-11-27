// The Roleplay & Realism install: what RoleplayRealism.Awake/InitMod registers, hooks, or replaces,
// done once at scene boot in InitMod's order.

import { registerFormulaOverride, formulaOverride, entityMaxEncumbrance } from '../combat/formulas.js';
import { registerClimbingChanceOverride } from '../player/climbing.js';
import { registerParkourGate } from '../player/parkour.js';
import { currentWeaponPose } from '../combat/playerWeapon.js';
import { WEAPON_TYPES } from '../combat/fpsWeapon.js';
import { registerMeleeWeaponAnimTime } from '../characters/weaponStates.js';
import { readSwing } from '../combat/swingLaw.js';
import { registerMaxBankLoan } from '../trade/banking.js';
import { setShipAvailable } from '../systems/naval/ship.js';
import { registerMagicRoundHook } from '../world/worldTick.js';
import { syntheticTimeIncrease } from '../magic/effectBroker.js';
import { registerEntityFold } from '../characters/entityMods.js';
import { overridePotionRecipes } from '../items/potions.js';
import { ENEMY_BASICS } from '../characters/enemyBasics.js';
import { setUnderworldRule, setGuildExpelledHook } from '../guilds/guilds.js';
import { registerMerchantService } from '../guilds/guildServices.js';
import { carriedWeight } from '../items/inventory.js';
import { liveStat, maxFatigue, FATIGUE_DRAIN_SCALE } from '../characters/statMods.js';
import { equipTableOf, EQUIP_SLOTS, lowerCondition, blowWear } from '../characters/equip.js';
import { getItemHands, ITEM_HANDS } from '../characters/equipTable.js';
import { rriAnimTimeOverride } from './rriKits.js';
import { rriModule } from './rriItems.js';
import { setCanRunOverride } from '../travel/transport.js';
import { setAxisLimitsProvider } from '../player/moveAxes.js';
import { installRoleplayRealismArt } from './rrVariants.js';
import { registerQuestList } from '../systems/quest/questLists.js';
import { addIntoQuestTables } from '../systems/quest/tables.js';
import { registerCustomFaction } from '../formats/factionFile.js';
import { RR_QUEST_LIST, RR_CUSTOM_FACTIONS, RR_PLACES_TABLE, RR_FACTIONS_TABLE, RR_FACTION_IDS, RR_TEXT, rrCustomArmorService } from './rrQuestLine.js';
import {
  rrEnabled, rrModule, rrAdjustWeaponHitChanceMod, rrAdjustWeaponAttackDamage, rrClimbingChance, rrParkourRefusal, rrMeleeWeaponAnimTime,
  rrWeaponToHit, rrConditionDamageThroughPhysicalHit, rrDamageModifierClassic, rrMaxBankLoan, rrShipAvailable,
  rrEncumbranceEffect, RR_POTION_RECIPES, applyEnemyAppearance, rrUnderworldRule,
  rrRidingOn, rrRidingSetting, rrCanRunRiding, rrRidingInputLimits,
} from './rrRealism.js';

const _host = { spawnFoe: null, inTown: null, transportMode: null, riding: null };
export const RR_SQUAD_PLACE_ATTEMPTS = 600;
export function setRrHostSeams(seams = {}) { Object.assign(_host, seams); }
export const rrHostSeams = () => _host;

let _installed = false;
export function installRoleplayRealism() {
  if (_installed) return false;
  _installed = true;

  const prevHit = formulaOverride('adjustWeaponHitChanceMod');
  const prevDamage = formulaOverride('adjustWeaponAttackDamage');
  registerFormulaOverride('adjustWeaponHitChanceMod', (attacker, target, hitChanceMod, weaponAnimTime, weapon) =>
    (rrModule('advancedArchery') ? rrAdjustWeaponHitChanceMod(hitChanceMod, weaponAnimTime, weapon) : prevHit?.(attacker, target, hitChanceMod, weaponAnimTime, weapon)));
  registerFormulaOverride('adjustWeaponAttackDamage', (attacker, target, damage, weaponAnimTime, weapon) =>
    (rrModule('advancedArchery') ? rrAdjustWeaponAttackDamage(damage, weaponAnimTime, weapon) : prevDamage?.(attacker, target, damage, weaponAnimTime, weapon)));

  registerMagicRoundHook('roleplay-realism-encumbrance', (entity, { sinks } = {}) => {
    const e = encumbranceOf(entity);
    if (!e) return;
    let cost = e.fatigueEffect;
    if (cost > 0) {
      const owed = cost * FATIGUE_DRAIN_SCALE + (entity._rrFatigueCarry ?? 0);
      cost = Math.floor(owed + 1e-9);
      entity._rrFatigueCarry = Math.max(0, owed - cost);
    }
    if (sinks?.drainFatigue && cost > 0) sinks.drainFatigue(cost);
    else entity.fatigue = Math.min(maxFatigue(entity), Math.max(0, (entity.fatigue ?? 0) - cost));
  });
  registerEntityFold('roleplay-realism-encumbrance', (entity) => {
    const e = encumbranceOf(entity);
    return e ? { stats: { speed: -e.speedEffect } } : null;
  });

  setShipAvailable((q) => rrShipAvailable(q));

  setUnderworldRule((guildName) => rrUnderworldRule(guildName));
  setGuildExpelledHook((guild, entity) => {
    const rule = rrUnderworldRule(guild?.name);
    if (!rule?.squad || !_host.spawnFoe) return;
    for (const wave of rule.squad(entity?.level ?? 1)) {
      for (let i = 0; i < wave.count; i++) _host.spawnFoe(wave.mobileType, { minDistance: wave.minDistance, maxDistance: wave.maxDistance, lineOfSightCheck: false, attempts: RR_SQUAD_PLACE_ATTEMPTS });
    }
  });

  registerClimbingChanceOverride((base, inputs) => {
    if (!rrModule('climbingRestriction')) return null;
    const pose = currentWeaponPose();
    return rrClimbingChance(base, { ...inputs, weaponDrawn: !!pose?.weaponDrawn, weaponMelee: pose == null || pose.weaponType === WEAPON_TYPES.Melee });
  });
  registerParkourGate(() => {
    if (!rrModule('climbingRestriction')) return null;
    const pose = currentWeaponPose();
    return rrParkourRefusal({ weaponDrawn: !!pose?.weaponDrawn, weaponMelee: pose == null || pose.weaponType === WEAPON_TYPES.Melee });
  });

  registerMeleeWeaponAnimTime((liveSpeed, ctx) => {
    const items = rriAnimTimeOverride(liveSpeed, ctx);
    if (items != null) return items;
    if (!rrModule('weaponSpeed') || rriModule('weaponBalance') || !ctx?.entity) return null;
    const slots = equipTableOf(ctx.entity);
    const weapon = slots?.[ctx.usingRightHand === false ? EQUIP_SLOTS.LeftHand : EQUIP_SLOTS.RightHand] ?? null;
    const hands = weapon ? getItemHands(weapon) : ITEM_HANDS.None;
    const w = readSwing(ctx);
    const weight = w?.weight ?? 0;
    return rrMeleeWeaponAnimTime({ liveSpeed, liveStrength: liveStat(ctx.entity, 'strength'), weaponType: ctx.weaponType, hands: hands === ITEM_HANDS.Both ? 'Both' : 'One', weight, shortBlade: !!w?.shortBlade });
  });

  registerFormulaOverride('calculateWeaponToHit', (weapon) => (rrModule('weaponMaterials') ? rrWeaponToHit(weapon) : undefined));

  registerFormulaOverride('applyConditionDamageThroughPhysicalHit', (item, owner, damage, { say = null, rolls = Math.random } = {}) =>
    (rrModule('equipDamage') ? rrConditionDamageThroughPhysicalHit(item, damage, (it, amount) => lowerCondition(it, blowWear(amount, rolls), owner, say)) : false));

  if (rrModule('enemyAppearance')) applyEnemyAppearance(ENEMY_BASICS);

  overridePotionRecipes(rrModule('purificationPotion') ? RR_POTION_RECIPES : []);

  const prevDamageModifier = formulaOverride('damageModifier');
  registerFormulaOverride('damageModifier', (strength) => (rrModule('classicStrengthDamageBonus') ? rrDamageModifierClassic(strength) : prevDamageModifier?.(strength)));

  registerMaxBankLoan((level) => rrMaxBankLoan(level));

  setCanRunOverride((mode) => (rrRidingOn()
    ? rrCanRunRiding({ mode, riding: !!_host.riding?.(), inTown: !!_host.inTown?.(), gallopingInTowns: rrRidingSetting('GallopingInTowns') === true })
    : null));
  setAxisLimitsProvider(() => (rrRidingOn() && rrRidingSetting('RealisticMovement') === true
    ? rrRidingInputLimits({ riding: !!_host.riding?.(), mode: _host.transportMode?.() ?? 'Foot' })
    : null));

  installRoleplayRealismArt();

  if (!registerQuestList(RR_QUEST_LIST, () => rrEnabled())) throw new Error('Quest list name is already in use, unable to register RoleplayRealism quest list.');
  if (rrEnabled()) for (const f of RR_CUSTOM_FACTIONS) registerCustomFaction(f.id, f);
  addIntoQuestTables({ places: [...RR_PLACES_TABLE], factions: [...RR_FACTIONS_TABLE] });
  registerMerchantService(RR_FACTION_IDS.OrthusDharjen, (window, entity) => rrCustomArmorService(window, entity), RR_TEXT.customArmor, () => rrEnabled());
  return true;
}

function encumbranceOf(entity) {
  if (!rrModule('encumbranceEffects') || !entity?.isPlayer || !entity?.stats || entity.isResting || !((entity.health ?? 0) > 0) || syntheticTimeIncrease()) return null;
  return rrEncumbranceEffect({
    carriedWeight: carriedWeight(entity),
    maxEncumbrance: entityMaxEncumbrance(entity),
    liveSpeed: liveStat(entity, 'speed', null, 'roleplay-realism-encumbrance'),
    permanentSpeed: entity.stats.speed ?? 50,
    currentFatigue: entity.fatigue ?? 0,
  });
}

export const roleplayRealismInstalled = () => _installed;
export { rrEnabled };
