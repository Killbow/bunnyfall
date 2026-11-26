import { enhancedSoundsOn } from '../../audio/enhancedSounds.js';
import { SOUND } from '../../audio/soundClips.js';
import { showAbilityArt } from './abilityArt.js';
import { strikeMotionKind, strikeMotionPath } from './strikeMotion.js';
import { ABILITY_REFUSAL, createAbilityEngine } from './engine.js';
import { abilitiesEnabled, abilityLoad, syncAbilityUnlocks } from './progress.js';
import { abilityMayStrike, beginEdgeRitual, clearEdgeRitual, clearWeaponOpenings, localAbilityActor,
  stepEdgeRitual, stepWeaponOpenings } from './previewHits.js';
import { abilityPlayable as weaponAbilityPlayable, DAGGER_MILESTONES, milestoneDelivery, milestoneShotSpeedScale } from './milestones.js';
import { FATIGUE_MULTIPLIER } from '../../characters/statMods.js';
import { SWING_FATIGUE_COST, tallySwingSkills } from '../hostCombat.js';
import { sigilDueling } from '../../items/sigil.js';
import { ammoCountFor, spendAmmoFor } from '../../items/inventory.js';
import { techniqueCue } from '../technique/techniqueFx.js';
import { aimFor, launchTo, techniqueFlightRefusal } from '../techniques.js';
import { abilityLook, capstonePower, skyfallPattern } from './capstones.js';
import { utilityProfile } from './utilityProfiles.js';
import { stepUtilityTimers, utilityCooldown } from './utility.js';
import { abilityById } from './registry.js';
import { combinationDelivery, combinationPlayable } from './combinations.js';
import { skillValue } from '../../characters/skills.js';
import { racialDelivery, racialKey } from './racialProfiles.js';
import { clearRacialAccuracy, noteRacialReadiness, setRacialAccuracy, stepRacialAccuracy } from './racialIdentity.js';
import { playerDoor } from '../../player/playerDoor.js';
import { assignModBundle, hasActiveEffect } from '../../magic/effects.js';
import { bodyRadius } from '../technique/techniqueBlow.js';
import { AUTOAIM, advanceReach, autoaimFoe, camToward, huntableFoes, lockedLanding, lockedReach, sideHop, sideOf,
  yawToward } from './autoaim.js';
import { meleeBeatMult, shotMult } from './damage.js';
import { withBuffDuration } from './buffDuration.js';
import { playAbilitySfx } from '../../audio/abilitySfx.js';
import { offsetWayfarerLantern } from './wayfarerLantern.js';

export { PREVIEW_THRUST } from './milestones.js';
export const abilityPlayable = id => weaponAbilityPlayable(id) || combinationPlayable(id) || !!racialDelivery(id);

const rigs = new WeakMap();
const sessions = new WeakMap();

function cue(recipe, moment, door, place) {
  try { techniqueCue(recipe, moment, door, place); }
  catch (error) { console.warn('[ability] cue failed', error); }
}

function deliveryFor(id, ctx) {
  const profile = withBuffDuration(abilityById(id), milestoneDelivery(id) ?? combinationDelivery(id, ctx?.weapon) ?? racialDelivery(id));
  if (!profile) return null;
  const spend = profile.spend * FATIGUE_MULTIPLIER;
  const swings = profile.kind === 'self' ? 0 : (profile.beats ?? 1);
  return { ...profile, spend, fatigue: spend + SWING_FATIGUE_COST * swings + 1, impactsMs: [] };
}

function markers(cast, entity) {
  return { id: cast.ability.id, ability: true, actor: entity, load: abilityLoad(entity), weapon: cast.weapon };
}

function canPlant(tc) {
  const move = tc.cam?.move;
  return !!tc.cam && move?.grounded !== false && !move?.swimming && !move?.riding && !move?.climbing && !move?.levitating;
}

function holdsStance(stance, tc) {
  if (!canPlant(tc)) return false;
  const { cam } = tc;
  const drift = Math.hypot(...cam.feet.map((v, i) => v - stance.feet[i]));
  if (drift > stance.driftM) return false;
  if (stance.aimRad == null) return true;
  const yaw = cam.yaw - stance.yaw;
  return Math.hypot(Math.atan2(Math.sin(yaw), Math.cos(yaw)), (cam.pitch ?? 0) - stance.pitch) <= stance.aimRad;
}

function startMelee(chain, { rig, tc, entity }) {
  const { cast, next } = chain;
  const { pw, cam } = tc;
  const profile = cast.delivery;
  const stage = profile.stages?.[next] ?? profile;
  const final = next === profile.beats - 1;
  if (!cam || pw.techniqueBlow || pw.restingWeapon !== cast.weapon) return false;
  const offhand = (profile.alternateHands && (next + (profile.openOffhand ? 1 : 0)) % 2) ? pw.pairedShortBlade : null;
  const feet = [...cam.feet];
  // Autoaim: a swing turns to the enemy it already struck, else the enemy nearest the crosshair, and reaches a little
  // farther for it. A swing that follows a dash keeps the dash's lane.
  let { yaw } = cam;
  let reach = stage.rangeM;
  if (!chain.lane) {
    const struck = chain.target ? huntableFoes(foe => foe.entity === chain.target)[0] : null;
    const lock = (struck && flatTo(feet, struck) - 0.5 <= stage.rangeM + AUTOAIM.meleeSlackM ? struck : null)
      ?? autoaimFoe(cam, tc.collider, stage.rangeM + AUTOAIM.meleeSlackM);
    if (lock) {
      yaw = yawToward(feet, lock);
      tc.door?.face?.(lock.ai.feet, feet);
      reach = lockedReach(cam, lock, stage.rangeM);
    }
  }
  const blow = {
    ...markers(cast, entity), weapon: offhand ?? cast.weapon, chain,
    mult: meleeBeatMult(cast.ability, profile.potency, stage.share ?? (1 / profile.beats), cast.standBonus ?? 0),
    reach: Math.max(reach, chain.reach ?? 0), arc: stage.arcRad ?? 'view', single: !stage.targetCap, feet, yaw,
    control: (final && stage.finishControl) || stage.control, counterBonus: stage.counterBonus,
    targetCap: stage.targetCap, redirect: profile.redirect || !!stage.targetCap, damageMod: cast.power, tempo: stage.tempo,
    hitFx: (final && stage.finishFx) || stage.fx || (profile.beats > 1 ? 'haymaker' : null),
    unawareBonus: stage.unawareBonus, rearBonus: stage.rearBonus, lowHealthBonus: stage.lowHealthBonus,
    beatShare: stage.share ?? (1 / profile.beats),
    armorPierce: stage.armorPierce, toHit: stage.toHit, opening: stage.opening, exploit: stage.exploit,
  };
  let sounded = false;
  blow.noteDamage = foe => {
    if (!sounded && (final || next === 0) && enhancedSoundsOn()) {
      sounded = true;
      tc.door?.sound?.(final ? SOUND.Hit4 : SOUND.Hit2, final ? .7 : .45, final ? .78 : .95);
    }
    playAbilitySfx(cast.ability.id, 'impact');
    const feet = foe.ai?.feet;
    if (feet) showAbilityArt(tc.door, cast.ability.id, 'impact',
      [feet[0], feet[1] + (foe.ai.height ?? 1.6) * .55, feet[2]], { yaw });
    if (profile.takedownCooldownMs) rig.takedown = { foe, id: cast.ability.id, ms: profile.takedownCooldownMs };
  };
  if (profile.targetMark) {
    blow.markDamage = (foe) => {
      rig.daggerMark = { target: foe.entity, remaining: profile.targetMark.seconds, bonus: profile.targetMark.bonus };
      const at = foe.ai?.feet;
      if (at) cue('markTarget', 'hit', tc.door, { at, ground: at[1] });
      return 0;
    };
  } else if (DAGGER_MILESTONES.includes(cast.ability.id)) {
    blow.markDamage = (foe) => {
      if (chain.markedTarget === foe.entity) return chain.markBonus * blow.beatShare;
      if (rig.daggerMark?.target !== foe.entity) return 0;
      chain.markedTarget = foe.entity;
      chain.markBonus = rig.daggerMark.bonus;
      rig.daggerMark = null;
      return chain.markBonus * blow.beatShare;
    };
  }
  if (chain.lane) {
    blow.lane = chain.lane;
    blow.feet = chain.origin;
    chain.lane = null;
  } else if (stage.halfWidthM) {
    blow.lane = { from: [feet[0], feet[2]], dir: [Math.sin(yaw), Math.cos(yaw)], len: blow.reach, halfW: stage.halfWidthM };
  }
  chain.reach = 0;
  if (blow.targetCap) blow.struck = new Set();
  pw.techniqueBlow = blow;
  const strike = profile.stages?.[next]?.strike ?? profile.strikes?.[next] ?? stage.strike;
  if (!tc.startSwing(strike, !!offhand)) {
    pw.techniqueBlow = null;
    return false;
  }
  const timing = pw.strikeSchedule?.();
  blow.motion = { kind: strikeMotionKind(cast.ability.id, stage, strike, cast.weapon),
    path: strikeMotionPath(cast.ability.id, next, final && profile.beats > 1),
    side: strike?.includes('Left') ? -1 : 1, start: pw.machine.now,
    hit: timing?.hitAt ?? .2, duration: timing?.seconds ?? .5 };
  rig.blow = blow;
  cue(blow.hitFx ?? 'pierce', 'release', tc.door, { at: feet, ground: feet[1], yaw });
  chain.next++;
  rig.follow = chain.next < profile.beats ? chain : null;
  return true;
}

const flatTo = (feet, foe) => Math.hypot(foe.ai.feet[0] - feet[0], foe.ai.feet[2] - feet[2]);

/** Where a dash or leap lands: at the locked enemy, beside it for a side hop, else where the plain aim says.
 *  Hops and targeted advances keep the enemy the chain struck; lane advances lock the one in the crosshair. */
function advanceAim(cast, chain, advance, { cam, collider }) {
  const foes = huntableFoes(foe => !cast.link || foe.entity === cast.link.target);
  const range = advanceReach(advance) + AUTOAIM.leapSlackM;
  const held = chain.target && advance.aim !== 'lane'
    ? foes.find(foe => foe.entity === chain.target && flatTo(cam.feet, foe) <= range) : null;
  const lock = held ?? autoaimFoe(cam, collider, range, foes);
  if (advance.aim === 'side') {
    const side = sideOf(advance, chain.next);
    const toward = chain.hop?.foe === lock ? chain.hop.toward : null;
    const landed = lock ? lockedLanding(advance, cam, collider, lock, side, toward) : null;
    if (!landed?.ok) return sideHop(advance, cam, collider, side);
    chain.hop = { foe: lock, toward: landed.toward };
    // The strike resolves from where the hop lands, not along a lane from the take-off.
    return { ...landed, lane: null };
  }
  if (!lock) return aimFor(advance, cam, collider, advance.aim === 'lane' ? undefined : foes);
  if (advance.aim === 'lane') {
    const landed = lockedLanding(advance, cam, collider, lock);
    return landed.ok ? landed : aimFor(advance, cam, collider);
  }
  const locked = aimFor(advance, camToward(cam, lock), collider, [lock]);
  return locked.ok ? locked : aimFor(advance, cam, collider, foes);
}

function startAdvance(cast, { rig, tc }, chain, advance) {
  const motor = tc.door?.motor?.();
  const refusal = techniqueFlightRefusal(motor);
  if (refusal) { tc.say?.(refusal); return false; }
  if (!tc.cam || !tc.collider) return false;
  const targeted = advance.aim === 'target' || advance.aim === 'foe';
  const { ok, point, apex, lane, foe, why } = advanceAim(cast, chain, advance, tc);
  if (!ok || (targeted && !foe)) { tc.say?.(targeted && !foe ? 'Aim at a nearby enemy' : why); return false; }
  const origin = [...tc.cam.feet];
  const flight = launchTo(origin, point, apex);
  if (!motor.techniqueLaunch(flight.dir, flight.along, flight.up)) return false;
  rig.advance = { cast, chain, lane, origin, motor, foe, point, elapsed: 0, timeout: flight.time + 0.75,
    reach: (cast.delivery.stages?.[chain.next] ?? cast.delivery).rangeM ?? 2.25 };
  const dx = point[0] - origin[0], dz = point[2] - origin[2];
  showAbilityArt(tc.door, cast.ability.id, 'stroke', [origin[0],origin[1]+.7,origin[2]],
    { yaw: Math.atan2(dx,dz), len: Math.hypot(dx,dz) });
  rig.follow = null;
  cue(cast.delivery.fx ?? 'lunge', 'release', tc.door,
    { at: origin, ground: origin[1], yaw: tc.cam.yaw });
  return true;
}

function stepAdvance(dt, ctx, canStart) {
  const advance = ctx.rig.advance;
  if (!advance) return;
  const { motor, lane, chain, origin, foe, point } = advance;
  advance.elapsed += dt;
  if (advance.elapsed >= advance.timeout || (!motor.grounded && !motor.techFlight)) {
    ctx.rig.advance = null;
    return;
  }
  if (!motor.grounded) return;
  ctx.rig.advance = null;
  playAbilitySfx(chain.cast.ability.id, 'land');
  if (!canStart || !ctx.tc.cam) return;
  const feet = ctx.tc.cam.feet;
  // A locked enemy takes the strike wherever it moved during the flight, as long as it is within reach.
  const target = foe?.ai?.feet;
  if (target && abilityMayStrike(foe) && flatTo(feet, foe) - bodyRadius(foe) <= advance.reach + AUTOAIM.landReachM) {
    ctx.tc.door?.face?.(target, feet);
    const yaw = yawToward(feet, foe);
    chain.target = foe.entity;
    const cam = { ...ctx.tc.cam, yaw };
    const dx = target[0] - origin[0], dz = target[2] - origin[2], d = Math.hypot(dx, dz);
    if (lane && d > .3) {
      chain.lane = { ...lane, dir: [dx / d, dz / d], len: d + bodyRadius(foe) + .3 };
      chain.origin = origin;
    } else chain.reach = lockedReach(cam, foe, advance.reach, AUTOAIM.landReachM);
    startMelee(chain, { ...ctx, tc: { ...ctx.tc, cam } });
    if (chain.origin === origin) cue('lunge', 'hit', ctx.tc.door, { at: origin, to: [...feet], ground: origin[1], yaw });
    return;
  }
  if (!lane) {
    if (Math.hypot(feet[0] - point[0], feet[2] - point[2]) <= 1.5) startMelee(chain, ctx);
    return;
  }
  const len = Math.min(lane.len, (feet[0] - origin[0]) * lane.dir[0] + (feet[2] - origin[2]) * lane.dir[1]);
  if (len < 0.25) return;
  chain.lane = { ...lane, len, halfW: (lane.halfW ?? .55) + .25 };
  chain.origin = origin;
  startMelee(chain, ctx);
  cue('lunge', 'hit', ctx.tc.door, { at: origin, to: [...feet], ground: origin[1], yaw: lane.yaw });
}

function canRepeat(id, ctx) {
  const { rig } = ctx;
  if (rig?.rhythm?.id === id && rig.rhythm.left > 0 && !rig.rhythm.pending) return true;
  return rig?.link?.id === id && combinationDelivery(id, ctx.weapon)?.requiresLink === true
    && abilityById(id).templates.includes(ctx.weapon?.templateIndex ?? 'bare');
}

function finishRhythmShot(rig, rhythm, damage) {
  if (!rhythm || rig.rhythm !== rhythm) return;
  if (!rhythm.left) { rig.rhythm = null; return; }
  rhythm.pending = false;
  rhythm.streak = damage > 0 ? rhythm.streak + 1 : 0;
}

function release(cast, ctx) {
  const delivery = cast.delivery;
  const crouching = !!ctx.tc.cam?.move?.crouching;
  const effect = delivery.selfEffect ?? (crouching ? delivery.crouchEffect : null);
  const effects = Array.isArray(effect) ? effect : effect ? [effect] : [];
  if (!crouching) cast.standBonus = delivery.standPotency;
  const door = effects.length ? playerDoor() : null;
  if (effects.length && (!door?.castOnPlayer || door.player?.() !== ctx.entity)) return false;
  const applyEffect = () => {
    if (!effects.length) return;
    const cam = ctx.tc.cam;
    const placement = effects.some(effect => effect.placed) && cam ? { eye: cam.pos, dir: abilityLook(cam) } : undefined;
    const payload = effects.map(effect => ({
      type: effect.type, subType: effect.subType, durationBase: effect.rounds, durationMod: 0, durationPerLevel: 1,
      ...(effect.magnitude == null ? {} : {
        magnitudeBaseLow: effect.magnitude, magnitudeBaseHigh: effect.magnitude,
        magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 1,
      }),
    }));
    door.castOnPlayer({ name: cast.ability.name, element: 4, rangeType: 0, effects: payload },
      { placement, companionRange: effects[0].companionRange });
  };
  if (delivery.kind === 'self') {
    if (delivery.accuracy) setRacialAccuracy(ctx.entity, delivery.accuracy);
    if (delivery.edgeRitual) beginEdgeRitual(ctx.entity, crouching, delivery.edgeRitualSeconds);
    applyEffect();
    const feet = ctx.tc.cam?.feet;
    if (feet) cue(delivery.fx === 'rally' ? 'rally' : 'markTarget', 'hit', ctx.tc.door, { at: [...feet], ground: feet[1] });
    ctx.tc.say?.(delivery.edgeRitual ? (crouching ? 'Edge Ritual · Fatigue recovery' : 'Edge Ritual · Bonus damage') : cast.ability.name);
    return true;
  }
  if (delivery.capstone) {
    const skill = cast.ability.skills.reduce((lower, id) => skillValue(ctx.entity, id) < skillValue(ctx.entity, lower) ? id : lower);
    cast.power = capstonePower(delivery.capstone, ctx.entity, skill, cast.weapon);
  }
  if (delivery.requiresLink && cast.link !== ctx.rig.link) return false;
  if (delivery.kind === 'melee') {
    const chain = { cast, target: cast.link?.target ?? null, next: 0 };
    const advance = delivery.stages?.[0]?.advance ?? delivery.advance;
    const started = advance ? startAdvance(cast, ctx, chain, advance) : startMelee(chain, ctx);
    if (started && cast.link) ctx.rig.link = null;
    if (started) applyEffect();
    return started;
  }
  const { rig, tc } = ctx;
  if (cast.continuingRhythm && cast.continuingRhythm !== rig.rhythm) return false;
  // Arrow rain centers on the enemy under the crosshair (its feet), else on the ground the look meets.
  const rainLock = delivery.rain && tc.cam ? autoaimFoe(tc.cam, tc.collider, Math.min(delivery.rangeM, AUTOAIM.rangedM)) : null;
  const rain = delivery.rain ? (rainLock && skyfallPattern(camToward(tc.cam, rainLock, 0), tc.collider, delivery))
    || skyfallPattern(tc.cam, tc.collider, delivery) : null;
  if (delivery.rain && !rain) { tc.say?.('Aim at visible ground in range'); return false; }
  if (!tc.door?.fireArrow || !tc.cam || !tc.pw.machine.isBow || !tc.startSwing(cast.delivery.strike)) return false;
  applyEffect();
  rig.shot = { cast, load: abilityLoad(ctx.entity), rain };
  const profile = cast.delivery.rhythm;
  if (profile) {
    const rhythm = rig.rhythm ??= { id: cast.ability.id, weapon: cast.weapon, left: profile.shots, remaining: profile.windowMs, streak: 0, pending: false };
    rhythm.pending = true;
    rhythm.left--;
    rig.shot.rhythm = rhythm;
  }
  cue(delivery.fx ?? (delivery.burstCap || delivery.ammo > 1 ? 'volley' : 'pierce'), 'release', tc.door);
  return true;
}

function stateFor(entity) {
  let state = sessions.get(entity);
  const load = abilityLoad(entity);
  if (state?.load === load) return state;
  clearRacialAccuracy(entity);
  clearEdgeRitual(entity);
  clearWeaponOpenings(entity);
  if (state?.rig) {
    cancelDelivery(state.rig);
    state.rig.link = null;
    state.rig.daggerMark = null;
  }
  state = { rig: null, ctx: null, load, lastSkills: null, stance: null, engine: createAbilityEngine({
    deliveryFor,
    reserve: ({ spend }, { entity }) => {
      entity.fatigue -= spend;
      return () => { entity.fatigue += spend; };
    },
    release,
    canRepeat,
    event: (moment, cast) => {
      if (moment === 'wind-up') playAbilitySfx(cast.ability.id, 'wind-up');
      if (moment === 'release') playAbilitySfx(cast.ability.id, cast.delivery.kind === 'self' ? 'self' : 'release');
      if (moment === 'wind-up' || (moment === 'release' && cast.delivery.kind === 'self')) {
        const { cam, door } = state.ctx.tc;
        if (cam?.feet) showAbilityArt(door, cast.ability.id, moment === 'release' ? 'self' : 'wind-up',
          [cam.feet[0],cam.feet[1]+1.1,cam.feet[2]], { yaw: cam.yaw });
      }
      if (moment === 'release' && cast.delivery.capstone) {
        const { cam, door } = state.ctx.tc;
        if (cam?.feet) door?.fx?.('capstone-bloom', cam.feet, { ground: cam.feet[1], yaw: cam.yaw, r: 1.8 });
      }
      if (moment === 'wind-up' && cast.delivery.fx) {
        const { cam, door } = state.ctx.tc;
        if (cam) cue(cast.delivery.fx, 'wind-up', door, { at: [...cam.feet], ground: cam.feet[1], yaw: cam.yaw });
      }
      if (moment === 'wind-up' && cast.delivery.rhythm) cast.continuingRhythm = state.rig.rhythm;
      if (moment === 'wind-up' && cast.delivery.requiresLink) cast.link = state.rig.link;
      if (moment !== 'wind-up' || !cast.delivery.stance) {
        state.stance = null;
        return;
      }
      const { feet, yaw, pitch = 0 } = state.ctx.tc.cam;
      cast.stance = { ...cast.delivery.stance, feet: [...feet], yaw, pitch };
      state.stance = cast.stance;
    },
  }) };
  sessions.set(entity, state);
  return state;
}

function cancelDelivery(rig) {
  if (rig.blow) rig.blow.cancelled = true;
  if (rig.shot) rig.shot.cancelled = true;
  rig.follow = null;
  rig.advance = null;
  rig.rhythm = null;
  rig.takedown = null;
}

const occupied = (state) => state.engine.busy() || !!(state.rig?.blow || state.rig?.shot || state.rig?.follow || state.rig?.advance);

/** The stepping scene owns the cast. Old rigs cannot deliver queued intent. */
export function stepAbilityRig(dt, tc) {
  const { entity, pw } = tc;
  if (!entity) return false;
  stepUtilityTimers(entity, dt);
  noteRacialReadiness(entity, pw.restingWeapon, pw.sheathed, tc.spellReadied);
  if (!abilitiesEnabled()) {
    const state = sessions.get(entity);
    if (state?.rig) cancelDelivery(state.rig);
    if (state?.rig) state.rig.link = null;
    if (state?.rig) state.rig.daggerMark = null;
    state?.engine.cancel();
    clearRacialAccuracy(entity);
    clearEdgeRitual(entity);
    clearWeaponOpenings(entity);
    return false;
  }
  const state = stateFor(entity);
  let rig = rigs.get(tc.rig);
  if (!rig) { rig = { blow: null, shot: null, follow: null, advance: null, rhythm: null, link: null }; rigs.set(tc.rig, rig); }
  if (state.rig && state.rig !== rig) {
    cancelDelivery(state.rig);
    state.rig.link = null;
    state.rig.daggerMark = null;
    state.engine.cancel();
    clearRacialAccuracy(entity);
    clearEdgeRitual(entity);
    clearWeaponOpenings(entity);
  }
  stepEdgeRitual(entity, dt);
  stepWeaponOpenings(entity, dt, playerDoor()?.hurtFoe);
  if (rig.takedown) {
    const { foe, id, ms } = rig.takedown;
    if (localAbilityActor(entity, state.load) && (foe.dead || foe.entity.health <= 0)) state.engine.shortenCooldown(id, ms);
    rig.takedown = null;
  }
  if (localAbilityActor(entity, state.load)) stepRacialAccuracy(entity, dt);
  else clearRacialAccuracy(entity);
  const skills = (racialKey(entity) ?? '') + ':' + (entity.skills?.join?.(',') ?? '');
  if (skills !== state.lastSkills) {
    const utilities = syncAbilityUnlocks(entity).filter(utilityProfile);
    if (utilities.length) tc.say?.('Spellbook → Abilities: ' + utilities.map(id => abilityById(id).name).join(', '));
    state.lastSkills = skills;
  }
  const weapon = pw.restingWeapon;
  if (rig.daggerMark) {
    rig.daggerMark.remaining -= Math.min(.25, Math.max(0, dt));
    if (rig.daggerMark.remaining <= 0 || rig.daggerMark.target.health <= 0 || !localAbilityActor(entity, state.load)) rig.daggerMark = null;
  }
  if (rig.link) {
    rig.link.remaining -= Math.min(250, Math.max(0, dt * 1000));
    if (rig.link.remaining <= 0 || rig.link.target.health <= 0 || !localAbilityActor(entity, state.load)) rig.link = null;
  }
  const deliveryWeapon = rig.blow?.chain.cast.weapon ?? rig.shot?.cast.weapon ?? rig.follow?.cast.weapon ?? rig.advance?.cast.weapon;
  if (rig.rhythm) {
    rig.rhythm.remaining -= Math.min(250, Math.max(0, dt * 1000));
    if (rig.rhythm.weapon !== weapon || rig.rhythm.remaining <= 0) rig.rhythm = null;
  }
  const stance = state.stance ?? (!rig.shot?.cancelled ? rig.shot?.cast.stance : null);
  const stanceLost = !!stance && !holdsStance(stance, tc);
  const interrupted = tc.paralyzed || tc.cancel || tc.blocked || pw.sheathed
    || stanceLost || !localAbilityActor(entity, state.load) || (deliveryWeapon != null && deliveryWeapon !== weapon)
    || (rig.follow && rig.follow.cast.weapon !== weapon);
  if (stanceLost && !tc.blocked) tc.say?.(ABILITY_REFUSAL.stance);
  if (interrupted) cancelDelivery(rig);
  if (pw.machine.state === 'Idle') {
    if (pw.techniqueBlow === rig.blow) pw.techniqueBlow = null;
    rig.blow = null;
    // A bow still playing its release in the arm holds the 'hit' event.
    if (!tc.holding && rig.shot) {
      finishRhythmShot(rig, rig.shot.rhythm, 0);
      rig.shot = null;
    }
  }
  const canStart = tc.ready && !tc.blocked && !tc.legacyBusy && pw.machine.state === 'Idle'
    && pw.machine.now >= pw.machine.cooldownUntil && !pw.techniqueBlow && !rig.shot;
  const ctx = {
    enabled: true, entity, owner: rig, rig, tc, ready: canStart && !rig.follow && !rig.advance, interrupted,
    online: entity._online === true, duel: sigilDueling(), weapon, fatigue: entity.fatigue,
    ammo: pw.machine.isBow ? ammoCountFor(entity.items, weapon, { usableOnly: true }) : 0,
    canPlant: canPlant(tc), ranged: !!pw.machine.isBow,
  };
  state.rig = rig;
  state.ctx = ctx;
  if (rig.follow && canStart && !interrupted) {
    const chain = rig.follow;
    const advance = chain.cast.delivery.stages?.[chain.next]?.advance;
    if (!(advance ? startAdvance(chain.cast, ctx, chain, advance) : startMelee(chain, ctx))) cancelDelivery(rig);
  }
  if (!interrupted) stepAdvance(dt, ctx, canStart);
  state.engine.step(dt * 1000, ctx);
  return occupied(state);
}

/** An ability owns its bow's hit event and spends one arrow per projectile. */
export function claimAbilityEvents(events, tc) {
  const rig = tc && rigs.get(tc.rig);
  const shot = rig?.shot;
  if (!events.includes('hit')) return events;
  if (rig?.blow?.cancelled) return events.filter(event => event !== 'hit');
  if (rig?.blow?.motion && tc.cam) {
    const { feet } = tc.cam;
    const yaw = rig.blow.yaw ?? tc.cam.yaw;
    const { motion, reach } = rig.blow;
    motion.contact = Math.max(.001, tc.pw.machine.now - motion.start);
    const origin = [feet[0],feet[1]+1.1,feet[2]];
    const lane = rig.blow.lane?.dir ?? [Math.sin(yaw),Math.cos(yaw)];
    const direction = [lane[0],0,lane[1]];
    const wall = tc.collider?.raycast?.(origin,direction,reach) ?? Infinity;
    showAbilityArt(tc.door, rig.blow.id, 'stroke', origin, { dir: direction, yaw, spin: motion.side, len: Math.min(wall,reach) });
  }
  if (rig?.blow?.hitFx && tc.cam) {
    const blow = rig.blow;
    const { feet } = tc.cam;
    const yaw = blow.yaw ?? tc.cam.yaw;
    const r = Math.min(blow.reach, 1.05);
    const at = [feet[0] + Math.sin(yaw) * r, feet[1] + 1.1, feet[2] + Math.cos(yaw) * r];
    const dir = [Math.sin(yaw), 0, Math.cos(yaw)];
    const wall = blow.hitFx === 'measureFinish' ? tc.collider?.raycast?.(at, dir, blow.reach) : Infinity;
    const len = Math.max(0, Math.min(wall ?? Infinity, blow.reach - r));
    cue(blow.hitFx, 'hit', tc.door, { at: blow.hitFx === 'measure' ? [...feet] : at, from: feet, dir, len, ground: feet[1], yaw });
  }
  if (!shot) {
    if (tc?.pw.machine.isBow && rig) rig.rhythm = null;
    return events;
  }
  rig.shot = null;
  const { cast } = shot;
  const { cam, entity, pw, door } = tc;
  const profile = cast.delivery;
  const weapon = cast.weapon;
  const rhythm = shot.rhythm;
  const count = shot.rain?.shots.length ?? profile.ammo;
  let marked = false;
  const resolveGameplay = rhythm ? (damage) => finishRhythmShot(rig, rhythm, damage)
    : profile.linkMs || profile.impactFx || profile.slow ? (damage, foe) => {
      if (!(damage > 0) || !foe || foe.dead || foe.entity.health <= 0
        || sessions.get(entity)?.rig !== rig || !localAbilityActor(entity, shot.load)) return;
      if (profile.linkMs && !marked) {
        marked = true;
        rig.link = { id: cast.ability.id, target: foe.entity, remaining: profile.linkMs };
        const ready = profile.switchTo === 'empty hands' ? 'Ready your empty hands' : 'Equip ' + profile.switchTo;
        tc.say?.('Target marked. ' + ready + ' and use ' + cast.ability.name + ' again.');
      }
      if (profile.slow && abilityMayStrike(foe) && !hasActiveEffect(foe.entity, 'slowed')) {
        assignModBundle(foe.entity, { name: cast.ability.name, kind: 'slowed', rounds: profile.slow });
      }
      if (foe.ai?.feet) cue(profile.impactFx ?? 'markTarget', 'hit', door, { at: [...foe.ai.feet], ground: foe.ai.feet[1] });
    } : null;
  const onResolve = (damage, foe) => {
    resolveGameplay?.(damage, foe);
    if (damage > 0) playAbilitySfx(cast.ability.id, 'impact');
    if (damage > 0 && foe?.ai?.feet) {
      const [x,y,z] = foe.ai.feet;
      showAbilityArt(door, cast.ability.id, 'impact', [x,y+(foe.ai.height ?? 1.6)*.55,z], { yaw: cam.yaw });
    }
  };
  if (!shot.cancelled && cam && abilityLoad(entity) === shot.load && localAbilityActor(entity, shot.load)
      && (!rhythm || rig.rhythm === rhythm)
      && pw.restingWeapon === weapon && (!cast.stance || holdsStance(cast.stance, tc))
      && ammoCountFor(entity.items, weapon, { usableOnly: true }) >= count) {
    // Autoaim: the shot bends toward the enemy nearest the crosshair, in sight and in range.
    const lock = shot.rain ? null : autoaimFoe(cam, tc.collider, Math.min(profile.rangeM, AUTOAIM.rangedM));
    const aim = lock ? camToward(cam, lock) : cam;
    const look = abilityLook(aim);
    showAbilityArt(door, cast.ability.id, 'stroke', cam.pos, { dir: look, yaw: aim.yaw, len: 2.4 });
    const trail = pos => showAbilityArt(door, cast.ability.id, 'flight', pos);
    const rainTargets = shot.rain ? new Map() : null;
    for (let i = 0; i < count; i++) {
      if (!spendAmmoFor(entity.items, weapon, shot)) break;
      const spread = (i - (profile.ammo - 1) / 2) * (profile.spreadRad ?? 0);
      const shaft = shot.rain?.shots[i];
      door.fireArrow(shaft?.from ?? cam.pos, shaft?.dir ?? (spread ? abilityLook(aim, aim.yaw + spread) : look), {
        sky: !!shaft, weapon, summoned: shot.summoned, speedScale: milestoneShotSpeedScale(profile),
        technique: {
          ...markers(cast, entity), mult: shotMult(cast.ability, profile.potency + (rhythm?.streak ?? 0) * (profile.rhythm?.bonus ?? 0), profile.ammo),
          rangeM: shaft?.rangeM ?? profile.rangeM, weakPointBonus: profile.weakPointBonus, armorPierce: profile.armorPierce,
          linearRadius: profile.linearRadius, control: profile.control, onResolve, trail, damageMod: cast.power,
          execution: profile.execution, projectileScale: profile.projectileScale,
          beatShare: 1 / profile.ammo, unawareBonus: profile.unawareBonus, opening: profile.opening, exploit: profile.exploit,
          burstRadius: profile.burstRadius, burstScale: profile.burstScale, rainTargets, perTarget: profile.rain?.perTarget,
          pierce: profile.pierce ?? 1, burstCap: profile.burstCap ?? 0, targets: new Set(),
        },
      });
      if (shaft) cue('skyfall', 'shaft', door, { at: shaft.from, dir: shaft.dir, len: shaft.rangeM });
    }
    door.drainFatigue?.(SWING_FATIGUE_COST);
    tallySwingSkills(entity, weapon);
    tc.noteShot?.(cast.weapon);
    const wall = tc.collider?.raycast?.(cam.pos, look, profile.rangeM);
    const len = Number.isFinite(wall) ? Math.max(0, Math.min(wall, profile.rangeM)) : profile.rangeM;
    cue(profile.fx ?? (profile.burstCap || profile.ammo > 1 ? 'volley' : 'pierce'), 'loose', door,
      { at: shot.rain?.centre ?? cam.pos, dir: look, len, ground: shot.rain?.centre[1], r: profile.rain?.radius });
  } else onResolve?.(0);
  return events.filter(event => event !== 'hit');
}

export function offsetAbilities(offset, entity) {
  if (!offset || !entity) return;
  offsetWayfarerLantern(entity, offset);
  const state = sessions.get(entity), rig = state?.rig;
  const moved = new Set();
  const move = (p, flat = false) => {
    if (!p || moved.has(p)) return;
    moved.add(p);
    p[0] += offset[0];
    if (flat) p[1] += offset[2];
    else { p[1] += offset[1]; p[2] += offset[2]; }
  };
  move(state?.stance?.feet);
  if (!rig) return;
  const { advance, blow, shot } = rig;
  move(advance?.origin); move(advance?.point); move(advance?.lane?.from, true);
  for (const chain of [advance?.chain, blow?.chain, rig.follow]) { move(chain?.origin); move(chain?.lane?.from, true); }
  move(blow?.feet); move(blow?.lane?.from, true);
  move(shot?.cast.stance?.feet); move(shot?.rain?.centre);
  for (const shaft of shot?.rain?.shots ?? []) move(shaft.from);
}

export function abilityRigBusy(entity, owner) {
  const state = sessions.get(entity);
  return !!state && state.rig === rigs.get(owner) && occupied(state);
}

export function activeAbilityWeapon(entity) {
  const state = sessions.get(entity);
  return state?.ctx && state.load === abilityLoad(entity) ? state.ctx.tc.pw.restingWeapon ?? null : undefined;
}

export function requestHotbarAbility(entity, id) {
  if (!abilitiesEnabled() || entity?._online) return { ok: false, why: 'unavailable' };
  const state = sessions.get(entity);
  if (!state?.ctx || state.load !== abilityLoad(entity)) return { ok: false, why: 'busy' };
  const result = state.engine.request(id, state.ctx);
  if (result.ok && state.rig.rhythm?.id !== id) state.rig.rhythm = null;
  return result;
}

export function abilityCooldown(entity, id) {
  if (utilityProfile(id)) return utilityCooldown(entity, id);
  const state = sessions.get(entity);
  return state?.load === abilityLoad(entity) && state.ctx && !canRepeat(id, state.ctx) ? state.engine.cooldown(id) : 0;
}
export const abilityRefusalText = (why) => ABILITY_REFUSAL[why] ?? ABILITY_REFUSAL.unavailable;

export function abilityInHand(entity, templates, id) {
  const ctx = sessions.get(entity)?.ctx;
  const race = abilityById(id)?.race;
  const required = race && racialDelivery(id)?.equipment;
  if (race && race !== racialKey(entity)) return false;
  if (required && (required === 'ranged') !== ctx?.ranged) return false;
  return !templates || templates.includes(ctx?.weapon?.templateIndex ?? 'bare');
}
