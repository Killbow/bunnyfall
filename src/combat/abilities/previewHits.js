import { playerBody } from '../technique/techniqueBlow.js';
import { sparedByPlayer } from '../friendlyFire.js';
import { abilitiesEnabled, abilityLoad } from './progress.js';
import { sigilDueling } from '../../items/sigil.js';
import { PREVIEW_THRUST } from './milestones.js';
import { overreachOpen, windupHolds } from '../../ai/tactics.js';
import { healthShare } from '../healthShare.js';
import { clampFatigue, FATIGUE_MULTIPLIER } from '../../characters/statMods.js';
import { WEAPONS } from '../../characters/weapons.js';

const edgeRituals = new WeakMap();
const openings = new WeakMap();

function openingState(actor) {
  const load = abilityLoad(actor);
  let state = openings.get(actor);
  if (!state || state.load !== load) {
    state = { clock: 0, load, targets: new WeakMap(), bleeds: new Map() };
    openings.set(actor, state);
  }
  return state;
}

export const clearWeaponOpenings = actor => openings.delete(actor);

export function stepWeaponOpenings(actor, dt, hurtFoe) {
  if (!localAbilityActor(actor, abilityLoad(actor))) { clearWeaponOpenings(actor); return; }
  const state = openings.get(actor);
  if (!state || state.load !== abilityLoad(actor) || !Number.isFinite(dt)) return;
  state.clock += Math.max(0, Math.min(dt, .25));
  for (const [foe, bleed] of state.bleeds) {
    if (!abilityMayStrike(foe) || foe.entity.health <= 0) { state.bleeds.delete(foe); continue; }
    if (state.clock < bleed.next) continue;
    bleed.next += 1;
    if (--bleed.ticks === 0) state.bleeds.delete(foe);
    hurtFoe?.(foe, bleed.damage);
  }
}

export function weaponOpening(actor, foe, { opening, exploit, woundDamage = 0 } = {}) {
  if (!localAbilityActor(actor, abilityLoad(actor)) || !abilityMayStrike(foe)) return 0;
  const state = openingState(actor);
  let marks = state.targets.get(foe.entity);
  const mark = exploit && marks?.[exploit];
  let bonus = 0;
  if (mark) {
    if (mark.until > state.clock) bonus = mark.share;
    delete marks[exploit];
    if (exploit === 'rake') state.bleeds.delete(foe);
  }
  if (opening) {
    if (!marks) { marks = {}; state.targets.set(foe.entity, marks); }
    marks[opening.channel] = { share: opening.share, until: state.clock + opening.seconds };
    if (opening.channel === 'rake' && woundDamage > 0) {
      const damage = Math.max(1, Math.round(woundDamage * .13));
      const prior = state.bleeds.get(foe);
      if (prior) {
        prior.damage = Math.max(prior.damage, damage);
        prior.ticks = 3;
      } else state.bleeds.set(foe, { damage, next: state.clock + 1, ticks: 3 });
    }
  }
  return bonus;
}

export function beginEdgeRitual(entity, crouching) {
  edgeRituals.set(entity, { load: abilityLoad(entity), remaining: 8, strikes: 3, crouching });
}

export const clearEdgeRitual = entity => edgeRituals.delete(entity);

export function stepEdgeRitual(entity, dt) {
  const ritual = edgeRituals.get(entity);
  if (!ritual) return;
  if (Number.isFinite(dt)) ritual.remaining -= Math.max(0, Math.min(dt, .25));
  if (ritual.remaining <= 0 || !localAbilityActor(entity, ritual.load)) clearEdgeRitual(entity);
}

export function applyEdgeRitual(entity, weapon, foe, damage) {
  if (!(damage > 0) || weapon?.templateIndex !== WEAPONS.Tanto) return damage;
  const ritual = edgeRituals.get(entity);
  if (!ritual || !localAbilityActor(entity, ritual.load) || !abilityMayStrike(foe)) return damage;
  if (--ritual.strikes === 0) clearEdgeRitual(entity);
  if (!ritual.crouching) return Math.round(damage * 1.25);
  entity.fatigue = clampFatigue(entity, entity.fatigue + 2 * FATIGUE_MULTIPLIER);
  return damage;
}

export function localAbilityActor(entity, load) {
  return !!entity && abilitiesEnabled() && !sigilDueling() && !entity._online && !entity.peer
    && !entity.isInBeastForm && !entity._mentor && entity.health > 0 && abilityLoad(entity) === load;
}

export function abilityMayStrike(foe) {
  const entity = foe?.entity;
  return !!entity && !foe.dead && !foe.puppet && !entity.peer && !entity.isPlayer && !entity.bout
    && !entity.warded && !entity.relayHealth && !playerBody(foe) && !sparedByPlayer(foe)
    && foe.companion == null && foe.ai?.isHostile !== false && entity.team !== 'PlayerAlly'
    && !foe.yielded && !foe.executing && !foe.sparing && !foe.leaving && !foe.roaring;
}

/** Provisional preview rides the shared hit and mitigation roll. Potency is
 * split between animation beats, so another beat cannot duplicate the budget. */
export function previewDamage(blow, rolled, foe, { distance = 0, pos = null, secondary = false, splashShare = null, unaware = false } = {}) {
  if (rolled <= 0) return rolled;
  const damageScale = blow.damageScale ?? 1;
  let bonus = 0;
  if (blow.id === PREVIEW_THRUST && distance > 2.8) bonus = 0.15;
  if (blow.weakPointBonus && pos && foe.ai?.feet && Number.isFinite(foe.ai.height)
    && pos[1] - foe.ai.feet[1] >= foe.ai.height * 0.78) {
    bonus += blow.weakPointBonus;
    const execution = blow.execution;
    if (execution && distance >= execution.rangeM && 1 - (healthShare(foe.entity) ?? 1) >= execution.missingHealth) {
      bonus += execution.bonus;
    }
  }
  if (blow.counterBonus && (windupHolds(foe.ai) || overreachOpen(foe.ai))) bonus += blow.counterBonus;
  if (unaware && blow.unawareBonus) bonus += blow.unawareBonus * blow.beatShare;
  if (blow.rearBonus && Number.isFinite(foe.ai?.yaw) && foe.ai.feet) {
    const dx = blow.feet[0] - foe.ai.feet[0], dz = blow.feet[2] - foe.ai.feet[2];
    const facing = dx * Math.sin(foe.ai.yaw) + dz * Math.cos(foe.ai.yaw);
    if (facing < -0.5 * Math.max(.01, Math.hypot(dx, dz))) bonus += blow.rearBonus * blow.beatShare;
  }
  if (blow.lowHealthBonus && (healthShare(foe.entity) ?? 1) < .4) bonus += blow.lowHealthBonus * blow.beatShare;
  bonus += blow.markDamage?.(foe) ?? 0;
  if (blow.opening || blow.exploit) bonus += weaponOpening(blow.actor, foe, {
    opening: blow.opening, exploit: blow.exploit, woundDamage: rolled * blow.mult * damageScale,
  });
  const share = splashShare ?? (secondary ? 0.55 : 1);
  return Math.max(1, Math.round(rolled * (blow.mult + bonus) * share * damageScale));
}

export function abilityArrowAllowed(m, foe) {
  const ability = m?.technique;
  if (!ability?.ability) return true;
  return localAbilityActor(ability.actor, ability.load) && abilityMayStrike(foe)
    && !ability.targets.has(foe.entity)
    && (!ability.rainTargets || (ability.rainTargets.get(foe.entity) ?? 0) < ability.perTarget);
}

export function settleAbilityArrow(m, damage = 0, foe = null) {
  const technique = m?.technique;
  if (!technique?.onResolve) return;
  const resolve = technique.onResolve;
  technique.onResolve = null;
  resolve(damage, foe);
}

/** Cap flight at the configured path length. Ordinary projectile steps pass through. */
export function abilityFlightStep(m, distance) {
  const ability = m?.technique;
  if (!ability?.ability) return distance;
  if (!localAbilityActor(ability.actor, ability.load)) return 0;
  const length = Math.hypot(...m.dir) || 1;
  const travelled = m.abilityDistance ?? 0;
  if (ability.execution) m.abilityStepStart = travelled;
  const next = Math.min(distance, Math.max(0, ability.rangeM - travelled) / length);
  // Emit at the last confirmed position, after the previous frame's collision check.
  if (m.pos && travelled >= (m.nextTrailDistance ?? 1) && travelled <= 30) {
    ability.trail?.(m.pos);
    m.nextTrailDistance = travelled + 2;
  }
  m.abilityDistance = travelled + next * length;
  return next;
}
