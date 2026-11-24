import { showAbilityArt } from './abilityArt.js';
import { abilityById } from './registry.js';
import { abilityMayStrike, localAbilityActor } from './previewHits.js';
import { abilityLoad, learnedAbility } from './progress.js';
import { utilityProfile } from './utilityProfiles.js';
import { playerDoor } from '../../player/playerDoor.js';
import { removeBundleNamed } from '../../magic/effects.js';

const timers = new WeakMap();
const trailName = abilityById('utility.trailblazer').name;

function hostileNearby(door) {
  const feet = door?.feet?.();
  return !!feet && (door.foes?.() ?? []).some(foe =>
    abilityMayStrike(foe) && foe.ai?.feet && Math.hypot(...foe.ai.feet.map((n, i) => n - feet[i])) <= 15);
}

export function utilityCooldown(entity, id) {
  const state = timers.get(entity);
  return state?.load === abilityLoad(entity) ? state.left.get(id) ?? 0 : 0;
}

export function stepUtilityTimers(entity, dt) {
  if (localAbilityActor(entity, abilityLoad(entity)) && entity.activeEffects?.some(effect => effect.bundleName === trailName)) {
    const door = playerDoor();
    if (door?.player?.() === entity && hostileNearby(door)) removeBundleNamed(entity, trailName);
  }
  const state = timers.get(entity);
  if (!state) return;
  if (state.load !== abilityLoad(entity) || !localAbilityActor(entity, state.load)) { timers.delete(entity); return; }
  if (!Number.isFinite(dt) || dt <= 0) return;
  for (const [id, duration] of state.left) {
    const remaining = duration - Math.min(250, dt * 1000);
    if (remaining > 0) state.left.set(id, remaining);
    else state.left.delete(id);
  }
}

function startCooldown(entity, id, duration) {
  if (!duration) return;
  const load = abilityLoad(entity);
  let state = timers.get(entity);
  if (state?.load !== load) { state = { load, left: new Map() }; timers.set(entity, state); }
  state.left.set(id, duration);
  return state;
}

function effectOf({ effect, subType = 255, rounds = 1, magnitude }, fixed) {
  return {
    type: effect, subType, durationBase: rounds, durationMod: fixed ? 0 : 1, durationPerLevel: 5,
    chanceBase: 100, chanceMod: 0, chancePerLevel: 1,
    ...(magnitude == null ? {} : { magnitudeBaseLow: magnitude, magnitudeBaseHigh: magnitude,
      magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 1 }),
  };
}

export function requestUtility(entity, id, door = playerDoor()) {
  const profile = utilityProfile(id);
  if (!profile || !localAbilityActor(entity, abilityLoad(entity)) || door?.player?.() !== entity) {
    return { ok: false, why: 'unavailable' };
  }
  if (!learnedAbility(entity, id)) return { ok: false, why: 'locked' };
  if (utilityCooldown(entity, id)) return { ok: false, why: 'cooldown' };
  if (profile.travel) {
    if (profile.travel === 'recall' && !entity.wayfarerAnchor) return { ok: false, why: 'anchor' };
    if (!door.utilityTravel) return { ok: false, why: 'unavailable' };
    const result = door.utilityTravel(profile.travel);
    if (result === false) return { ok: false, why: 'unavailable' };
    const state = startCooldown(entity, id, profile.cooldownMs);
    const travelArt = () => {
      const at = door.feet?.();
      if (at) showAbilityArt(door, id, 'self', [at[0],at[1]+1,at[2]], { yaw: door.facingYaw?.() ?? 0 });
    };
    if (result?.then) {
      Promise.resolve(result).then(completed => {
        if (completed === false || (profile.travel === 'recall' && entity.wayfarerAnchor)) state?.left.delete(id);
        else travelArt();
      }).catch(() => {
        state?.left.delete(id);
        door.say?.('The way to your anchor could not be opened.');
      });
    } else travelArt();
    return { ok: true };
  }
  if (!door.castOnPlayer) return { ok: false, why: 'unavailable' };
  const name = abilityById(id).name;
  const feet = door.feet?.();
  if (profile.safePace && (!feet || hostileNearby(door))) {
    return { ok: false, why: 'combat' };
  }
  const bundle = { name, rangeType: 0, element: 4, effects: (profile.effects ?? [profile]).map(effect => effectOf(effect, !!profile.effects)) };
  const refusal = door.previewUtilityRefusal?.(bundle);
  if (refusal) return { ok: false, why: 'unavailable', message: refusal };
  door.castOnPlayer(bundle);
  startCooldown(entity, id, profile.cooldownMs);
  if (feet) showAbilityArt(door, id, 'self', [feet[0],feet[1]+1,feet[2]], { yaw: door.facingYaw?.() ?? 0 });
  if (profile.effect !== 17) door.say?.(name);
  return { ok: true };
}
