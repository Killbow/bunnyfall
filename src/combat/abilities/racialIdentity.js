import { abilitiesEnabled } from './progress.js';
import { RACIAL_TRAITS, racialKey } from './racialProfiles.js';
import { sigilDueling } from '../../items/sigilDuelState.js';
import { maxFatigue } from '../../characters/statMods.js';

const stance = new WeakMap();
const motors = new WeakMap();
const hands = new WeakMap();
const TRAIT_SHARE = .15;

export const previewPhysicalActor = entity => abilitiesEnabled() && entity?.isPlayer && !entity._online && !entity.peer
  && !entity._mentor && !entity.isInBeastForm && !sigilDueling();
const steady = entity => entity.maxHealth > 0 && entity.health >= entity.maxHealth * .5;

export function noteRacialReadiness(entity, weapon, sheathed, spell) {
  if (previewPhysicalActor(entity)) hands.set(entity, { weapon, sheathed, spell });
  else if (entity) hands.delete(entity);
}

function meets(condition, entity, motor, outdoors) {
  switch (condition) {
    case 'rested': {
      const max = maxFatigue(entity);
      return max > 0 && entity.fatigue >= max * .5;
    }
    case 'wounded': return entity.maxHealth > 0 && !steady(entity);
    case 'readied': {
      const hand = hands.get(entity);
      return !!hand?.spell || (hand?.sheathed === false && !!hand.weapon);
    }
    case 'spell': return !!hands.get(entity)?.spell;
    case 'sheathed': return hands.get(entity)?.sheathed === true && !hands.get(entity)?.spell;
    case 'unarmed': {
      const hand = hands.get(entity);
      return hand?.sheathed === false && !hand.spell && hand.weapon == null;
    }
    case 'outdoors': return outdoors;
    case 'sneaking': return !!motor?.isSneaking && !motor.swimming && !motor.isPlayerSwimming;
    case 'amphibious': return meets('swimming', entity, motor) || !!entity.activeEffects?.some(effect => !effect.ended && effect.kind === 'waterBreathing');
    case 'running': return !!motor?.isRunning && motor._pkPace > 0.5 && !motor.riding && !motor.swimming && !motor.isPlayerSwimming;
    case 'swimming': return !!(motor?.swimming || motor?.isPlayerSwimming) && !motor.waterWalking;
    case 'concealed': return !!entity.activeEffects?.some(effect =>
      !effect.ended && (effect.kind === 'chameleonNormal' || effect.kind === 'chameleonTrue' || effect.kind === 'decoy'));
    default: return condition == null;
  }
}

export function racialPace(entity, mode, motor, outdoors = false) {
  if (!previewPhysicalActor(entity)) return 1;
  motors.set(entity, motor);
  const trait = RACIAL_TRAITS[racialKey(entity)];
  return trait?.pace === mode && meets(trait.condition, entity, motor, outdoors) ? 1 + TRAIT_SHARE : 1;
}

export function racialGuardDamage(damage, attacker, target, kind) {
  if (!(damage > 0) || !previewPhysicalActor(target) || !attacker || attacker.isPlayer || attacker.peer) return damage;
  const trait = RACIAL_TRAITS[racialKey(target)];
  if (!trait?.guard) return damage;
  const matches = trait.guard === kind || (trait.guard === 'physical' && (kind === 'melee' || kind === 'arrow'));
  if (!matches || !meets(trait.guardCondition, target, motors.get(target))) return damage;
  return Math.max(1, Math.round(damage * (1 - (trait.guardShare ?? TRAIT_SHARE))));
}

export function setRacialAccuracy(entity, profile) {
  stance.set(entity, { remaining: profile.seconds, bonus: profile.bonus });
}

export function stepRacialAccuracy(entity, dt) {
  const active = stance.get(entity);
  if (!active || !Number.isFinite(dt)) return;
  active.remaining -= Math.max(0, Math.min(.25, dt));
  if (active.remaining <= 0) stance.delete(entity);
}

export const clearRacialAccuracy = entity => stance.delete(entity);

export function previewRacialModifiers(entity) {
  if (!previewPhysicalActor(entity)) return null;
  return { damageMod: 0, toHitMod: stance.get(entity)?.bonus ?? 0 };
}
