// Enemy senses and pursuit: the classic (non-enhanced) DFU EnemyMotor, EnemySenses, and attack-range rules.
// Distances, timers, and rolls follow the source so random streams stay in step.

import { SLOW_FACTOR } from '../magic/bunnySpellLaw.js';
import { GLOBAL_SCALE } from '../world/meshReader.js';
import { dice100 } from '../combat/formulas.js';
import { CLASSIC_UPDATE_INTERVAL } from './weaponStates.js';
import { CAPSULE_HEIGHT, CAPSULE_RADIUS, DF_WALK_BASE } from '../player/motor.js';
export { CLASSIC_UPDATE_INTERVAL };
export const FOE_MAX_FRAME_DT = 3 * FIXED_DT;
const FOE_KEEPS_FLOOR = true;
const FLEE_AIM = 10;
export const FOLLOW_STOP = 3;
export const FOLLOW_SLACK = 1.5;
export const FOLLOW_LEASH = 20;
export const FOLLOW_SIGHT_S = 0.25;
export const FOLLOW_SIGHT_TRIES = 6;
export const FOLLOW_CRUMB_REACH = 0.8;
export const FOLLOW_SIGHT_RADIUS = 0.25;
export const FOLLOW_SIGHT_DY = 1.2;
export const FOLLOW_CRUMB_FAR = 50;
export const FOLLOW_YAW_GATE_DEG = 30;
export const FOLLOW_RUN_M = 8;
export const FOLLOW_RUN_PACE = 1.6;
export const foeFrameDt = (dt) => Math.min(dt, FOE_MAX_FRAME_DT);
export const GIVE_UP_TICKS = 200;
import { GRAVITY, FIXED_DT, MAX_FRAME_DT, CLASSIC_TO_UNITY_RATIO, FALL_DAMAGE_THRESHOLD } from '../player/motor.js';
import { wrapAngle } from '../world/mat4.js';
import { MOBILE_TYPES } from './mobileTypes.js';
import { coverDistance } from '../ai/cover.js';
import { groundHit } from '../player/groundRay.js';
import { tacticsStep, tacticsNow, breakWindup } from '../ai/tactics.js';

const KB = (v) => v / (CLASSIC_TO_UNITY_RATIO / 10);
export const KNOCKBACK_STORE_CAP = 40;
export const KNOCKBACK_MOTION_CAP = 25;
export const KNOCKBACK_HURT_THRESHOLD = 5;
export const KNOCKBACK_DECAY_PER_CLASSIC = 5;

export const SIGHT_RADIUS = 4096 * GLOBAL_SCALE;
export const HEARING_RADIUS = 25;
export const FIELD_OF_VIEW = 180;
export const MELEE_DISTANCE = 2.25;
export const CLASSIC_MELEE_DISTANCE_VS_AI = 1.5;
export const MIN_RANGED_DISTANCE = 240 * GLOBAL_SCALE;
export const MAX_RANGED_DISTANCE = 2048 * GLOBAL_SCALE;
export const LAST_HAD_LOS_TICKS = 200;
export const SEARCH_MULT_MAX = 10;
export const CLEAR_PATH_DEFAULT_DIST = 30;
export const CLASSIC_TURN_DEG = 20;
export { SYSTEM_TIMER_UPDATES_DIVISOR } from '../player/motor.js';
export const SENSES_INTERVAL_UNITS = 5;
export const MOVE_YAW_GATE_DEG = 5.625;
export const STOP_YAW_GATE_DEG = 22.5;
export { DF_WALK_BASE };
export const EYE_FRAC = 5 / 6;

export const enemyMoveSpeed = (liveSpeed) => (liveSpeed + DF_WALK_BASE) * GLOBAL_SCALE;

export function stealthChance(distance, liveStealth) {
  return 2 * ((Math.trunc(distance / GLOBAL_SCALE) * liveStealth) >> 10);
}
export const STEALTH_MAX_DISTANCE = 1024 * GLOBAL_SCALE;

export const CLASSIC_SPAWN_XZ_BY_TYPE = Object.freeze([1024, 384, 640, 768, 768, 768, 768].map((v) => v * GLOBAL_SCALE));
export const CLASSIC_SPAWN_Y_UPPER_BY_TYPE = Object.freeze([128, 128, 128, 384, 768, 128, 256].map((v) => v * GLOBAL_SCALE));
export const CLASSIC_SPAWN_Y_LOWER_BY_TYPE = Object.freeze([0, 0, 0, 0, -128, -768, 0].map((v) => v * GLOBAL_SCALE));
export const CLASSIC_DESPAWN_XZ_BY_TYPE = Object.freeze([1024, 1024, 1024, 1024, 768, 768, 768].map((v) => v * GLOBAL_SCALE));
export const CLASSIC_DESPAWN_Y_BY_TYPE = Object.freeze([384, 384, 384, 384, 768, 768, 768].map((v) => v * GLOBAL_SCALE));
export const CLASSIC_SPAWN_DESPAWN_EXTERIOR = 4096 * GLOBAL_SCALE;
export const CLASSIC_SPAWN_XZ = CLASSIC_SPAWN_XZ_BY_TYPE[0];
export const CLASSIC_SPAWN_Y_UPPER = CLASSIC_SPAWN_Y_UPPER_BY_TYPE[0];
export const CLASSIC_SPAWN_Y_LOWER = CLASSIC_SPAWN_Y_LOWER_BY_TYPE[0];
export const CLASSIC_DESPAWN_XZ = CLASSIC_DESPAWN_XZ_BY_TYPE[0];
export const CLASSIC_DESPAWN_Y = CLASSIC_DESPAWN_Y_BY_TYPE[0];

export function wouldBeSpawnedInClassic(distanceToPlayer, yDiff, already, distanceType = 0, playerInside = true) {
  if (distanceToPlayer >= 1094 * GLOBAL_SCALE) return false;
  const yAbs = Math.abs(yDiff);
  const xz = Math.sqrt(Math.max(0, distanceToPlayer * distanceToPlayer - yAbs * yAbs));
  if (!playerInside) return xz <= CLASSIC_SPAWN_DESPAWN_EXTERIOR;
  const row = distanceType >= 0 && distanceType < CLASSIC_SPAWN_XZ_BY_TYPE.length ? distanceType : -1;
  const band = (arr) => (row < 0 ? 0 : arr[row]);
  const upperXZ = already ? band(CLASSIC_DESPAWN_XZ_BY_TYPE) : band(CLASSIC_SPAWN_XZ_BY_TYPE);
  const upperY = already ? band(CLASSIC_DESPAWN_Y_BY_TYPE) : band(CLASSIC_SPAWN_Y_UPPER_BY_TYPE);
  const lowerY = already ? 0 : band(CLASSIC_SPAWN_Y_LOWER_BY_TYPE);
  if (xz > upperXZ) return false;
  if (lowerY === 0) {
    if (yAbs > upperY) return false;
  } else if (yDiff < lowerY || yDiff > upperY) {
    return false;
  }
  return true;
}

export function blockedByIllusionEffect(seesThrough, { invisible = false, blending = false, shade = false } = {}, rolls = Math.random) {
  if (seesThrough) return false;
  if (invisible) return true;
  if (!blending && !shade) return false;
  // The roll happens only for a concealed target; DFU draws no dice otherwise.
  const chance = blending ? 8 : 4;
  return !dice100(chance, rolls());
}

export function canHearTarget(collider, feet, height, targetFeet, dist, centreOffset = height / 2, targetCentreOffset = CAPSULE_HEIGHT / 2) {
  if (dist >= HEARING_RADIUS) return false;
  const center = [feet[0], feet[1] + centreOffset, feet[2]];
  const ex = targetFeet[0] - center[0], ey = targetFeet[1] + targetCentreOffset - center[1], ez = targetFeet[2] - center[2];
  const el = Math.hypot(ex, ey, ez) || 1;
  const hit = collider.raycast(center, [ex / el, ey / el, ez / el], el);
  return !Number.isFinite(hit) || hit >= el - 1e-3;
}

const DEG = Math.PI / 180;
const norm = wrapAngle;

export const yawOf = (dx, dz) => Math.atan2(dx, dz);

export function withinYaw(yaw, dx, dz, deg) {
  return Math.abs(norm(yawOf(dx, dz) - yaw)) <= deg * DEG;
}

export function turnTowards(yaw, dx, dz, maxDeg = CLASSIC_TURN_DEG) {
  const d = norm(yawOf(dx, dz) - yaw);
  const step = maxDeg * DEG;
  return norm(yaw + Math.max(-step, Math.min(step, d)));
}

export function canSeeTarget(collider, feet, yaw, height, targetFeet, targetHeight = CAPSULE_HEIGHT, blockerOut = null, distIn = null, sightRadius = SIGHT_RADIUS) {
  const dx = targetFeet[0] - feet[0], dz = targetFeet[2] - feet[2];
  const dist = distIn ?? Math.hypot(dx, (targetFeet[1] + targetHeight / 2) - (feet[1] + height / 2), dz);
  const radius = Number.isFinite(sightRadius) && sightRadius > 0 ? sightRadius : SIGHT_RADIUS;
  if (dist >= radius) return false;
  if (!withinYaw(yaw, dx, dz, FIELD_OF_VIEW / 2)) return false;
  const eye = [feet[0], feet[1] + height * EYE_FRAC, feet[2]];
  const tEye = [targetFeet[0], targetFeet[1] + targetHeight * EYE_FRAC, targetFeet[2]];
  const ex = tEye[0] - eye[0], ey = tEye[1] - eye[1], ez = tEye[2] - eye[2];
  const el = Math.hypot(ex, ey, ez) || 1;
  if (blockerOut && collider.raycastHit) {
    const h = collider.raycastHit(eye, [ex / el, ey / el, ez / el], Math.min(radius, el));
    const seen = !Number.isFinite(h.dist) || h.dist >= el - 1e-3;
    if (!seen) blockerOut.key = h.key;
    return seen && !coveredSight(collider, eye, ex / el, ey / el, ez / el, el);
  }
  const hit = collider.raycast(eye, [ex / el, ey / el, ez / el], Math.min(radius, el));
  return (!Number.isFinite(hit) || hit >= el - 1e-3) && !coveredSight(collider, eye, ex / el, ey / el, ez / el, el);
}

function coveredSight(collider, eye, ux, uy, uz, el) {
  return coverDistance(collider, eye, [ux, uy, uz], el, true) < el - 1e-3;
}

export const OPEN_DOOR_DISTANCE = 2;

export function openDoorsStep(feet, canOpenDoors, door, toggleDoor) {
  if (!canOpenDoors || !door) return false;
  if (door.state === 'end') return false;
  if ((door.currentLockValue ?? 0) > 0) return false;
  const d = Math.hypot(door.center[0] - feet[0], door.center[1] - feet[1], door.center[2] - feet[2]);
  if (d >= OPEN_DOOR_DISTANCE) return false;
  return !!toggleDoor(door);
}

export function isBackFacing(foeYaw, foeFeet, viewerPos) {
  const dx = viewerPos[0] - foeFeet[0], dz = viewerPos[2] - foeFeet[2];
  const a = Math.atan2(dx, dz) - foeYaw;
  const deg = Math.abs(((a * 180 / Math.PI + 540) % 360) - 180);
  const r = deg / 45;
  const base = Math.floor(r), frac = r - base;
  const orientation = frac > 0.5 ? base + 1 : frac < 0.5 ? base : (base % 2 === 0 ? base : base + 1);
  const record = orientation > 4 ? 8 - orientation : orientation;
  return record % 5 > 2;
}

export const MOBILE_SLAUGHTERFISH_ID = MOBILE_TYPES.Slaughterfish;
export const WATER_HEAD_MARGIN = 100 * GLOBAL_SCALE;
export const FLYER_FLOOR_CLEARANCE = 1;
export const FLYER_FLOOR_LIFT = 0.1;

export const OBSTACLE_CHECK_DISTANCE = CAPSULE_RADIUS / Math.SQRT2;
export const OBSTACLE_CAST_RADIUS = CAPSULE_RADIUS / 2;
export const OBSTACLE_P1_BELOW_CENTRE = 0.1388;
export const DOOR_CROUCHING_HEIGHT = 1.65;
export const HEIGHT_CHANGE_SECONDS = 0.5;
export const OBSTACLE_SLOPE_P1_BELOW_CENTRE = 0.25;
export const OBSTACLE_SLOPE_P2_ABOVE_P1 = 0.75;
export const FALL_CHECK_AHEAD = 1;
export const FALL_CHECK_DROP = 1.5;
export const DETOUR_VERTICAL_DODGE = 0.3;
export const DETOUR_UNSTUCK_RESET = 2;
export const DETOUR_CLOCKWISE_TIMER = 5;
export const DETOUR_SWEEP_STEP_DEG = 45;
export const DETOUR_SWEEP_MAX_TRIES = 7;
export const DETOUR_REACH = 2;
export const DETOUR_TIMER = 0.75;
export const DETOUR_ARRIVAL = 0.3;
export const DETOUR_BOXED_WAIT = 4 * CLASSIC_UPDATE_INTERVAL;

export const WALK_ARRIVE_M = 0.35;

export class EnemyAI {
  constructor(collider, feet, yawRad, { liveSpeed = 50, isHostile = true, height = CAPSULE_HEIGHT, seesThroughInvisibility = false, behaviour = 'General', mobileId = -1, waterSurfaceY = null, spawnDistanceType = 0, playerInside = true, isActionDoor = null, rolls = Math.random, hasBowAttack = false, canCastRangedSpell = null, hasMagickaToCast = null, centreOffset = null, vitals = null } = {}) {
    this.collider = collider;
    this.isActionDoor = isActionDoor ?? (() => false);
    this.rolls = rolls;
    this.levitating = false;
    this.feet = [feet[0], feet[1], feet[2]];
    this.yaw = yawRad;
    this.height = height;
    this.centreOffset = centreOffset ?? height / 2;
    this._playerHeight = CAPSULE_HEIGHT;
    this.lastGroundedY = feet[1];
    this.landedFall = 0;
    this._airborne = false;
    this._restGrounded = false;
    this.isGrounded = false;
    this.controllerHeight = height;
    this.collidedSides = false;
    this._resetHeight = false;
    this._heightChangeTimer = 0;
    this._liveSpeed = typeof liveSpeed === 'function' ? liveSpeed : () => liveSpeed;
    this.seesThroughInvisibility = seesThroughInvisibility;
    this.spawnDistanceType = spawnDistanceType;
    this.playerInside = playerInside;
    this.giveUpTimer = 0;
    this.target = null;
    this.secondaryTarget = null;
    this.classicTargetUpdateTimer = 0;
    this.targetSenses = null;
    this.sawSecondaryTarget = false;
    this._armedTargeting = false;
    this._targetCandidate = null;
    this.obstacleDetected = false;
    this.fallDetected = false;
    this.foundUpwardSlope = false;
    this.foundDoor = false;
    this.avoidObstaclesTimer = 0;
    this.detourDestination = [feet[0], feet[1], feet[2]];
    this.destination = [feet[0], feet[1], feet[2]];
    this.checkingClockwise = false;
    this.checkingClockwiseTimer = 0;
    this.didClockwiseCheck = false;
    this.lastTimeWasStuck = -Infinity;
    this._boxedUntil = -Infinity;
    this._clock = 0;
    this._steps = 0;
    this._sightBlocker = { key: null };
    this._rayAt = -1; this._rayTarget = null; this._raySeen = false; this._rayDoor = null; this._rayHeard = null;
    this.lastKnownTargetPos = null;
    this.oldLastKnownTargetPos = null;
    this.predictedTargetPos = null;
    this.lastPositionDiff = [0, 0, 0];
    this._predictedTargetPosWithoutLead = null;
    this._targetPosPredictTimer = 0;
    this.awareOfTargetForLastPrediction = false;
    this.lastHadLOSTimer = 0;
    this.searchMult = 0;
    this.hasBowAttack = hasBowAttack;
    this.canCastRangedSpell = canCastRangedSpell ?? (() => false);
    this.hasMagickaToCast = hasMagickaToCast ?? (() => false);
    this.flies = behaviour === 'Flying' || behaviour === 'Spectral';
    this.swims = behaviour === 'Aquatic';
    this.isFaceAimingSwimmer = this.swims && mobileId === MOBILE_SLAUGHTERFISH_ID;
    this.waterSurfaceY = waterSurfaceY;
    this.velY = 0;
    this.detected = false;
    this.inSight = false;
    this.isHostile = isHostile;
    this.vitals = vitals;
    /** @type {number[]|null} */
    this._tacDir = null;
    this._tacSpeed = 1;
    this.fleeLeft = 0;
    this.fleeFrom = null;
    this.fleePace = 1;
    /** @type {{ feet: () => (number[]|null), stop?: number, leash?: number, trail?: () => (number[][]|null) }|null} */
    this.follow = null;
    this._following = false;
    this._followWalking = false;
    this._followPace = 1;
    this._crumb = null; this._trailMode = null; this._trailT = 0;
    this._returning = false;
    this.stopDistance = MELEE_DISTANCE;
    this.justEncountered = false;
    this.moving = false;
    this._classicTimer = 0;
    this._acc = 0;
    this.knockbackSpeed = 0;
    this.knockbackDir = null;
    this.hurtKnock = false;
    this.staggerUntil = 0;
    this.staggered = false;
    this.overreachUntil = 0;
    this.overreached = false;
    this.roarUntil = 0;
    this._dist = Infinity;
    this.hasEncounteredPlayer = false;
    this.wouldBeSpawned = false;
    this._blocked = false;
    this._lastStealthMinute = -1;
  }

  get speed() { return enemyMoveSpeed(this._liveSpeed() + this._edgeSpeed()) * (this.slowed ? SLOW_FACTOR : 1); }
  _edgeSpeed() {
    const e = this.vitals?.()?.revenant?.edge;
    return e?.farSpeed > 0 && this._dist > e.farAt ? e.farSpeed : 0;
  }

  _classicSenses(playerFeet, senses = null) {
    if (!senses) return;
    const dxp = playerFeet[0] - this.feet[0], dzp = playerFeet[2] - this.feet[2];
    const yDiff = (this.feet[1] + this.centreOffset) - (playerFeet[1] + this._playerHeight / 2);
    const dist = Math.hypot(dxp, yDiff, dzp);
    this._distLocal = dist;
    this.wouldBeSpawned = wouldBeSpawnedInClassic(
      dist, yDiff, this.wouldBeSpawned, this.spawnDistanceType, this.playerInside);
  }

  _classicPostTarget(senses) {
    if (this.lastHadLOSTimer > 0) this.lastHadLOSTimer--;
    if (!senses) return;
    const notLocal = this._armedTargeting && this.target && (!this.target.isPlayer || this.target.isPeer === true);
    const flags = notLocal
      ? (this.target.concealment?.() ?? {})
      : {
          invisible: senses.playerInvisible ?? false,
          blending: senses.playerBlending ?? false,
          shade: senses.playerShade ?? false,
        };
    this._blocked = blockedByIllusionEffect(this.seesThroughInvisibility, flags, senses.rolls ?? Math.random);
  }

  _senses(playerFeet, senses = null, rays = true) {
    const dx = playerFeet[0] - this.feet[0], dz = playerFeet[2] - this.feet[2];
    this._dist = Math.hypot(dx, (playerFeet[1] + this._targetCentreOffset()) - (this.feet[1] + this.centreOffset), dz);
    if (!this._armedTargeting) { this._distLocal = this._dist; this.targetIsLocalPlayer = true; }
    if (senses?.playerUnseen && this.targetIsLocalPlayer) { this.inSight = false; this.detected = false; this.giveUpTimer = 0; return; }
    const _targetHeight = this._targetHeight();
    if (rays) {
      this._sightBlocker.key = null;
      this._raySeen = canSeeTarget(this.collider, this.feet, this.yaw, this.height, playerFeet, _targetHeight, this._sightBlocker, this._dist, this.sightRadius);
      this._rayDoor = this._sightBlocker.key;
      this._rayHeard = null;
      this._rayTarget = this._targetCandidate;
    }
    this._rayAt = this._steps;
    this.inSight = this._raySeen;
    this.doorKey = this._rayDoor;
    const foeTarget = this._armedTargeting && this._targetCandidate && !this._targetCandidate.isPlayer;
    if (!this.isHostile && !foeTarget) {
      this.inSight = false;
      this.detected = false;
      return;
    }
    if (!senses) {
      this.detected = this.inSight || this._dist < HEARING_RADIUS;
      if (this.detected) {
        this.lastKnownTargetPos = [playerFeet[0], playerFeet[1], playerFeet[2]];
        this.lastHadLOSTimer = LAST_HAD_LOS_TICKS;
        this._encounterEdge();
      }
      this._trackPredictedPos();
      return;
    }
    if (this.detected && !this.inSight && this._rayHeard === null) {
      this._rayHeard = canHearTarget(this.collider, this.feet, this.height, playerFeet, this._dist, this.centreOffset, this._targetCentreOffset());
    }
    const inEarshot = this.detected && !this.inSight && this._rayHeard === true;
    if (!this._blocked && (this.inSight || inEarshot)) {
      this.detected = true;
      this.lastKnownTargetPos = [playerFeet[0], playerFeet[1], playerFeet[2]];
      this.lastHadLOSTimer = LAST_HAD_LOS_TICKS;
    } else if (!this._blocked && this._stealthCheck(senses)) {
      this.detected = true;
      if (this.lastHadLOSTimer <= 0) this.lastKnownTargetPos = [playerFeet[0], playerFeet[1], playerFeet[2]];
    } else this.detected = false;
    if (this.detected) this._encounterEdge();

    this._trackPredictedPos();
  }

  _encounterEdge() {
    if (this._armedTargeting && this._targetCandidate && (!this._targetCandidate.isPlayer || this._targetCandidate.isPeer === true)) return;
    if (!this.hasEncounteredPlayer) { this.hasEncounteredPlayer = true; this.justEncountered = true; }
  }

  _trackPredictedPos() {
    if (this.lastKnownTargetPos === null) return;
    if (this.oldLastKnownTargetPos === null) this.oldLastKnownTargetPos = [...this.lastKnownTargetPos];
    this.predictedTargetPos = this.lastKnownTargetPos;
    if (this._targetPosPredict) {
      if (!this._blocked && this.inSight) {
        if (this.awareOfTargetForLastPrediction) {
          this.lastPositionDiff = [
            this.lastKnownTargetPos[0] - this.oldLastKnownTargetPos[0],
            this.lastKnownTargetPos[1] - this.oldLastKnownTargetPos[1],
            this.lastKnownTargetPos[2] - this.oldLastKnownTargetPos[2],
          ];
        }
        this.oldLastKnownTargetPos = [...this.lastKnownTargetPos];
        this.awareOfTargetForLastPrediction = true;
      } else {
        this.awareOfTargetForLastPrediction = false;
      }
    }
  }

  makeHostileToPlayer(ticks = GIVE_UP_TICKS, attackerFeet = null) {
    this.giveUpTimer = ticks;
    if (!attackerFeet) return;
    const at = [attackerFeet[0], attackerFeet[1], attackerFeet[2]];
    this.lastKnownTargetPos = at;
    this.oldLastKnownTargetPos = [...at];
    this.predictedTargetPos = at;
  }

  makeEnemyHostileToAttacker(attacker, attackerFeet = null, ticks = GIVE_UP_TICKS) {
    if (attacker && (this.target == null || !this.inSight || this._dist > 2)) {
      this.target = attacker;
      this.secondaryTarget = attacker;
      if (attackerFeet) {
        const at = [attackerFeet[0], attackerFeet[1], attackerFeet[2]];
        this.oldLastKnownTargetPos = [...at];
        this.lastKnownTargetPos = at;
        this.predictedTargetPos = at;
      }
      this.giveUpTimer = ticks;
    }
    if (attacker?.isPlayer) this.isHostile = true;
  }

  _stealthCheck(senses) {
    if (senses.insideDungeonCastle && !this.isHostile) return false;
    if (!this.wouldBeSpawned) return false;
    if (this._dist > STEALTH_MAX_DISTANCE) return false;
    const gameMinutes = senses.gameMinutes ?? 0;
    if (gameMinutes === this._lastStealthMinute) return this.detected;
    const foeTarget = this._armedTargeting && this._targetCandidate && (!this._targetCandidate.isPlayer || this._targetCandidate.isPeer === true);
    if (!foeTarget) {
      if (senses.movingLessThanHalfSpeed) {
        if ((gameMinutes & 1) === 1) return this.detected;
      } else if (this.hasEncounteredPlayer) {
        return true;
      }
      if (senses.sharedStealth && senses.sharedStealth.minute !== gameMinutes) {
        senses.tallyStealth?.();
        senses.sharedStealth.minute = gameMinutes;
      }
    }
    this._lastStealthMinute = gameMinutes;
    const liveStealth = foeTarget
      ? (this._targetCandidate.stealthOf?.()
        ?? (typeof this._targetCandidate.entity?.skills === 'number' ? this._targetCandidate.entity.skills : 0))
      : (senses.playerStealth ?? 0);
    const chance = stealthChance(this._dist, liveStealth);
    const rolls = senses.rolls ?? Math.random;
    return !dice100(chance, rolls());
  }

  _centre() { return [this.feet[0], this.feet[1] + this.centreOffset, this.feet[2]]; }

  predictNextTargetPos(interceptSpeed) {
    if (this.lastKnownTargetPos === null) return null;
    if (this._predictedTargetPosWithoutLead === null) {
      this._predictedTargetPosWithoutLead = [...this.lastKnownTargetPos];
    }
    const assumed = this.lastKnownTargetPos;
    let divisor = CLASSIC_UPDATE_INTERVAL;
    let diff = this.lastPositionDiff;
    if (this._targetPosPredictTimer !== 0) {
      divisor = this._targetPosPredictTimer;
      const old = this.oldLastKnownTargetPos ?? assumed;
      diff = [assumed[0] - old[0], assumed[1] - old[1], assumed[2] - old[2]];
      this.lastPositionDiff = diff;
    }
    const c = this._centre();
    const lift = this._targetCentreOffset();
    const d = [assumed[0] - c[0], assumed[1] + lift - c[1], assumed[2] - c[2]];
    const v = [diff[0] / divisor, diff[1] / divisor, diff[2] / divisor];
    const a = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) - interceptSpeed * interceptSpeed;
    const b = 2 * (d[0] * v[0] + d[1] * v[1] + d[2] * v[2]);
    const cc = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    const at = [assumed[0], assumed[1] + lift, assumed[2]];
    let prediction = [at[0], at[1], at[2]];
    let t = -1;
    if (Math.abs(a) >= 1e-5) {
      const disc = b * b - 4 * a * cc;
      if (disc >= 0) {
        const discSqrt = Math.sqrt(disc) * Math.sign(a);
        t = (-b - discSqrt) / (2 * a);
        if (t < 0) t = (-b + discSqrt) / (2 * a);
      }
    } else if (Math.abs(b) >= 1e-5) {
      t = -cc / b;
    }
    if (t >= 0) {
      prediction = [at[0] + v[0] * t, at[1] + v[1] * t, at[2] + v[2] * t];
      let px = prediction[0] - at[0], py = prediction[1] - at[1], pz = prediction[2] - at[2];
      const pl = Math.hypot(px, py, pz);
      if (pl > 1e-9) {
        px /= pl; py /= pl; pz /= pl;
        if (Number.isFinite(this.collider.raycast(at, [px, py, pz], pl))) prediction = at;
      }
    }
    this._predictedTargetPosWithoutLead = [assumed[0] + diff[0], assumed[1] + diff[1], assumed[2] + diff[2]];
    return prediction;
  }

  hasClearPathToShootProjectile(speed, originDistance, radius) {
    const target = this.predictNextTargetPos(speed);
    if (target === null) return false;
    const c = this._centre();
    let dx = target[0] - c[0], dy = target[1] - c[1], dz = target[2] - c[2];
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 1e-9) return true;
    dx /= dist; dy /= dist; dz /= dist;
    const origin = [c[0] + dx * originDistance, c[1] + dy * originDistance, c[2] + dz * originDistance];
    if (this.collider.sphereOverlaps(origin, radius)) return false;
    const hit = this.collider.sphereCast(origin, radius, [dx, dy, dz], dist);
    return !Number.isFinite(hit.dist) && !(coverDistance(this.collider, origin, [dx, dy, dz], dist - originDistance, true) < dist - originDistance - 1e-3)
      && !(groundHit(origin, [dx, dy, dz], dist - originDistance, this.collider) < dist - originDistance - 1e-3);
  }

  _obstacleCheck(dir) {
    this.obstacleDetected = false;
    this.foundUpwardSlope = false;
    this.foundDoor = false;
    const c = this._centre();
    const p1 = [c[0], c[1] - this.height * OBSTACLE_P1_BELOW_CENTRE, c[2]];
    const p2 = [p1[0], p1[1] + Math.min(this.height, DOOR_CROUCHING_HEIGHT) / 2, p1[2]];
    const hit = this.collider.capsuleCast(p1, p2, OBSTACLE_CAST_RADIUS, dir, OBSTACLE_CHECK_DISTANCE);
    if (!Number.isFinite(hit.dist)) return;
    this.obstacleDetected = true;
    if (this.isActionDoor(hit.key)) {
      this.obstacleDetected = false;
      this.foundDoor = true;
      if (withinYaw(this.yaw, dir[0], dir[2], STOP_YAW_GATE_DEG)) this.doorKey = hit.key;
      return;
    }
    if (this.swims || this.flies || this.levitating) return;
    const up = [c[0] + dir[0], c[1] + dir[1] + 1, c[2] + dir[2]];
    let ux = up[0] - c[0], uy = up[1] - c[1], uz = up[2] - c[2];
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    const q1 = [c[0], c[1] - this.height * OBSTACLE_SLOPE_P1_BELOW_CENTRE, c[2]];
    const q2 = [q1[0], q1[1] + this.height * OBSTACLE_SLOPE_P2_ABOVE_P1, q1[2]];
    if (!Number.isFinite(this.collider.capsuleCast(q1, q2, OBSTACLE_CAST_RADIUS, [ux, uy, uz], OBSTACLE_CHECK_DISTANCE).dist)) {
      this.obstacleDetected = false;
      this.foundUpwardSlope = true;
    }
  }

  _fallCheck(dir) {
    if (this.flies || this.levitating || this.swims
      || this.obstacleDetected || this.foundUpwardSlope || this.foundDoor) {
      this.fallDetected = false;
      return;
    }
    const c = this._centre();
    const origin = [c[0] + dir[0] * FALL_CHECK_AHEAD, c[1] + dir[1] * FALL_CHECK_AHEAD, c[2] + dir[2] * FALL_CHECK_AHEAD];
    const reach = this.height * 0.5 + FALL_CHECK_DROP;
    const tri = this.collider.raycast(origin, [0, -1, 0], reach);
    const analyticDrop = origin[1] - (this.collider.heightAt?.(origin[0], origin[2]) ?? -Infinity);
    this.fallDetected = !(Number.isFinite(tri) || analyticDrop <= reach);
  }

  static _rotY(dir, deg) {
    const r = (deg * Math.PI) / 180;
    const cs = Math.cos(r), sn = Math.sin(r);
    return [dir[0] * cs + dir[2] * sn, dir[1], -dir[0] * sn + dir[2] * cs];
  }

  _findDetour(dir2d, rolls = this.rolls) {
    if (this._clock < this._boxedUntil) {
      if (this.avoidObstaclesTimer <= 0) this.avoidObstaclesTimer = DETOUR_TIMER;
      this.lastTimeWasStuck = this._clock;
      return;
    }
    let testMove = [0, 0, 0];
    let foundUpDown = false;
    if (this.flies || this.swims || this.levitating) {
      let mult = rolls() < 0.5 ? DETOUR_VERTICAL_DODGE : -DETOUR_VERTICAL_DODGE;
      const tryDodge = (m) => {
        const v = [dir2d[0], dir2d[1] + m, dir2d[2]];
        const l = Math.hypot(v[0], v[1], v[2]) || 1;
        return [v[0] / l, v[1] / l, v[2] / l];
      };
      testMove = tryDodge(mult);
      this._obstacleCheck(testMove);
      if (this.obstacleDetected) {
        mult *= -1;
        testMove = tryDodge(mult);
        this._obstacleCheck(testMove);
      }
      if (!this.obstacleDetected) foundUpDown = true;
    }
    if (!foundUpDown && this._clock - this.lastTimeWasStuck > DETOUR_UNSTUCK_RESET) {
      this.checkingClockwiseTimer = 0;
      this.didClockwiseCheck = false;
    }
    if (!foundUpDown && this.checkingClockwiseTimer <= 0) {
      if (!this.didClockwiseCheck) {
        let angle = rolls() < 0.5 ? 45 : -45;
        testMove = EnemyAI._rotY(dir2d, angle);
        this._obstacleCheck(testMove);
        this._fallCheck(testMove);
        if (!this.obstacleDetected && !this.fallDetected) {
          this.checkingClockwise = angle === 45;
        } else {
          angle *= -1;
          testMove = EnemyAI._rotY(dir2d, angle);
          this._obstacleCheck(testMove);
          this._fallCheck(testMove);
          if (!this.obstacleDetected && !this.fallDetected) {
            this.checkingClockwise = angle === 45;
          } else {
            const t = this.destination;
            const c = this._centre();
            const tx = t[0] - c[0], tz = t[2] - c[2];
            const tl = Math.hypot(tx, tz) || 1;
            const signed = (Math.atan2(dir2d[0], dir2d[2]) - Math.atan2(tx / tl, tz / tl)) * (180 / Math.PI);
            const norm = ((signed + 180) % 360 + 360) % 360 - 180;
            this.checkingClockwise = norm > 0;
          }
        }
        this.checkingClockwiseTimer = DETOUR_CLOCKWISE_TIMER;
        this.didClockwiseCheck = true;
      } else {
        this.didClockwiseCheck = false;
        this.checkingClockwise = !this.checkingClockwise;
        this.checkingClockwiseTimer = DETOUR_CLOCKWISE_TIMER;
      }
    }
    if (!foundUpDown) {
      let angle = 0;
      let count = 0;
      do {
        angle += this.checkingClockwise ? DETOUR_SWEEP_STEP_DEG : -DETOUR_SWEEP_STEP_DEG;
        testMove = EnemyAI._rotY(dir2d, angle);
        this._obstacleCheck(testMove);
        this._fallCheck(testMove);
        count++;
        if (count > DETOUR_SWEEP_MAX_TRIES) break;
      } while (this.obstacleDetected || this.fallDetected);
      if (this.obstacleDetected || this.fallDetected) this._boxedUntil = this._clock + DETOUR_BOXED_WAIT;
    }
    this.detourDestination = [
      this.feet[0] + testMove[0] * DETOUR_REACH,
      this.feet[1] + testMove[1] * DETOUR_REACH,
      this.feet[2] + testMove[2] * DETOUR_REACH,
    ];
    if (this.avoidObstaclesTimer <= 0) this.avoidObstaclesTimer = DETOUR_TIMER;
    this.lastTimeWasStuck = this._clock;
  }

  _updateDetourTimers(dt, canAct) {
    if (this.avoidObstaclesTimer > 0) this.avoidObstaclesTimer -= dt;
    if (this.avoidObstaclesTimer > 0 && canAct) {
      const c = this._centre();
      const dx = this.detourDestination[0] - c[0];
      const dz = this.detourDestination[2] - c[2];
      if (Math.hypot(dx, dz) <= DETOUR_ARRIVAL) this.avoidObstaclesTimer = 0;
    }
    if (this.checkingClockwiseTimer > 0) this.checkingClockwiseTimer -= dt;
  }

  _clearPathToPosition(location, dist = CLEAR_PATH_DEFAULT_DIST) {
    const c = this._centre();
    let dx = location[0] - c[0], dy = location[1] - c[1], dz = location[2] - c[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    const flat = [dx, 0, dz];
    const fl = Math.hypot(flat[0], flat[2]);
    if (fl > 1e-9) { flat[0] /= fl; flat[2] /= fl; }
    this._obstacleCheck(flat);
    this._fallCheck(flat);
    if (this.obstacleDetected || this.fallDetected) return false;
    const hit = this.collider.capsuleCast(c, c, OBSTACLE_CAST_RADIUS, [dx, dy, dz], dist);
    return !Number.isFinite(hit.dist);
  }

  _targetHeight() {
    const t = this._armedTargeting ? this._targetCandidate : null;
    return (t && !t.isPlayer && t.ai?.height) || (t?.isPeer && t.height) || this._playerHeight;
  }

  _targetCentreOffset() {
    const t = this._armedTargeting ? this._targetCandidate : null;
    if (!t || t.isPlayer || !t.ai) return ((t?.isPeer && t.height) || this._playerHeight) / 2;
    return t.ai.centreOffset ?? (t.ai.height ?? CAPSULE_HEIGHT) / 2;
  }

  _aimY(predictedFeetY) {
    const tHeight = this._targetHeight();
    let y = predictedFeetY + this._targetCentreOffset();
    if (this.flies || this.levitating || this.isFaceAimingSwimmer) y += tHeight / 2;
    if (this.avoidObstaclesTimer <= 0 && !this.flies && !this.levitating && !this.swims) y -= (tHeight - this.height) / 2;
    return y - this.centreOffset;
  }

  _getDestination(playerFeet) {
    const c = this._centre();
    const tHeight = this._targetHeight();
    if (this.avoidObstaclesTimer > 0) {
      this.destination = this.detourDestination;
      return;
    }
    const prev = this.destination ?? playerFeet;
    const prevDist = Math.hypot(prev[0] - this.feet[0], prev[1] - this.feet[1], prev[2] - this.feet[2]);
    const predicted = this.predictedTargetPos ?? playerFeet;
    const tOff = this._targetCentreOffset();
    const predictedCentre = [predicted[0], predicted[1] + tOff, predicted[2]];
    if (this._clearPathToPosition(predictedCentre, prevDist)
      || (this.inSight && (this.hasBowAttack || this.hasMagickaToCast()))) {
      this.searchMult = 0;
      this.destination = [predicted[0], this._aimY(predicted[1]), predicted[2]];
      return;
    }
    const diff = this.lastPositionDiff;
    const dl = Math.hypot(diff[0], diff[1], diff[2]);
    const n = dl > 1e-9 ? [diff[0] / dl, diff[1] / dl, diff[2] / dl] : [0, 0, 0];
    const base = this.lastKnownTargetPos ?? playerFeet;
    const dest = [
      base[0] + n[0] * this.searchMult,
      base[1] + tOff + n[1] * this.searchMult,
      base[2] + n[2] * this.searchMult,
    ];
    const sd = Math.hypot(dest[0] - c[0], dest[1] - c[1], dest[2] - c[2]);
    if (this.searchMult <= SEARCH_MULT_MAX && sd <= this.stopDistance) this.searchMult++;
    if (this.avoidObstaclesTimer <= 0 && !this.flies && !this.levitating && !this.swims) dest[1] -= (tHeight - this.height) / 2;
    this.destination = [dest[0], dest[1] - this.centreOffset, dest[2]];
  }

  _doRangedAttack(dx, dz) {
    const inRange = this._dist > MIN_RANGED_DISTANCE && this._dist < MAX_RANGED_DISTANCE;
    if (!(inRange && this.inSight && this.detected && (this.hasBowAttack || this.canCastRangedSpell()))) return false;
    if (!withinYaw(this.yaw, dx, dz, STOP_YAW_GATE_DEG)) this.yaw = turnTowards(this.yaw, dx, dz);
    this.moving = false;
    return true;
  }

  _handleNoAction(foeTarget = false) {
    if ((!this.isHostile && !foeTarget) || this.giveUpTimer <= 0 || this.predictedTargetPos === null) {
      this.searchMult = 0;
    }
  }

  _classicTick(playerFeet, paused = false) {
    if (this.giveUpTimer <= 0) { this.moving = false; return; }
    if (this.predictedTargetPos === null) { this.moving = false; return; }
    this.stopDistance = (this._armedTargeting && this.target && !this.target.isPlayer)
      ? CLASSIC_MELEE_DISTANCE_VS_AI : MELEE_DISTANCE;
    const detouring = this.avoidObstaclesTimer > 0;
    this._getDestination(playerFeet);
    if (paused) { this.moving = false; return; }
    const dx = this.destination[0] - this.feet[0], dz = this.destination[2] - this.feet[2];
    const _took = tacticsStep(this, dx, dz);
    if (_took && (!detouring || this.fleeLeft > 0 || this._tac?.state === 'windup' || this._tac?.state === 'dash')) return;
    this._tacDir = null;
    if (this._doRangedAttack(dx, dz)) return;
    if (detouring) {
      if (!withinYaw(this.yaw, dx, dz, MOVE_YAW_GATE_DEG)) {
        this.yaw = turnTowards(this.yaw, dx, dz);
        this.moving = false;
        return;
      }
      this.moving = true;
      return;
    }
    const distance = (this.avoidObstaclesTimer <= 0 && this.inSight)
      ? this._dist
      : Math.hypot(dx, this.destination[1] - this.feet[1], dz);
    if (distance <= this.stopDistance) {
      this.moving = false;
      if (!withinYaw(this.yaw, dx, dz, STOP_YAW_GATE_DEG)) this.yaw = turnTowards(this.yaw, dx, dz);
      return;
    }
    if (!withinYaw(this.yaw, dx, dz, MOVE_YAW_GATE_DEG)) {
      this.yaw = turnTowards(this.yaw, dx, dz);
      this.moving = false;
      return;
    }
    this.moving = true;
  }

  update(dt, playerFeet, senses = null, paralyzed = false, paused = false) {
    const seat = this.seat?.();
    if (seat) {
      this.feet[0] = seat.feet[0]; this.feet[1] = seat.feet[1]; this.feet[2] = seat.feet[2];
      this.yaw = seat.yaw; this.velY = 0; this.moving = false; this.isGrounded = true; this._acc = 0;
      return;
    }
    this._acc = (this._acc ?? 0) + Math.min(dt, MAX_FRAME_DT);
    while (this._acc >= FIXED_DT) {
      this._acc -= FIXED_DT;
      this._step(FIXED_DT, playerFeet, senses, paralyzed, paused);
      this._heightAdjust(FIXED_DT);
    }
  }

  _heightAdjust(dt) {
    if (!this._resetHeight && this.collidedSides && this.height > DOOR_CROUCHING_HEIGHT) {
      this.controllerHeight = DOOR_CROUCHING_HEIGHT;
      this._resetHeight = true;
      this._heightChangeTimer = HEIGHT_CHANGE_SECONDS;
    } else if (this._resetHeight && this._heightChangeTimer <= 0) {
      this.controllerHeight = this.height;
      this._resetHeight = false;
    }
    if (this._resetHeight && this._heightChangeTimer > 0) this._heightChangeTimer -= dt;
  }

  _knockbackStep(dt, classicTicks) {
    if (this.knockbackSpeed > KB(KNOCKBACK_STORE_CAP)) this.knockbackSpeed = KB(KNOCKBACK_STORE_CAP);
    this.hurtKnock = this.knockbackSpeed > KB(KNOCKBACK_HURT_THRESHOLD);
    const sp = Math.min(this.knockbackSpeed, KB(KNOCKBACK_MOTION_CAP));
    const d = this.knockbackDir ?? [0, 0, 0];
    const mx = d[0] * sp * dt, myRaw = d[1] * sp * dt, mz = d[2] * sp * dt;
    if (this.swims) {
      const waterY = this.waterSurfaceY ? this.waterSurfaceY(this.feet[0], this.feet[2]) : null;
      const center = this.feet[1] + this.centreOffset;
      if (waterY !== null && center < waterY) {
        let my = myRaw;
        if (my > 0 && center + WATER_HEAD_MARGIN >= waterY) my = 0;
        const moveResult = this.collider.move(this.feet, mx, my, mz, this.controllerHeight, true, FOE_KEEPS_FLOOR);
        this.isGrounded = moveResult.grounded;
        this.collidedSides = !!moveResult.sides;
      }
    } else if (this.flies || this.levitating) {
      if (this.flies && !this.levitating) this.velY -= GRAVITY * dt;
      else this.velY = 0;
      const r = this.collider.move(this.feet, mx, myRaw + this.velY * dt, mz, this.controllerHeight, true, FOE_KEEPS_FLOOR);
      this.isGrounded = r.grounded;
      this.collidedSides = !!r.sides;
      if (r.grounded) this.velY = 0;
      this._trackFall(r.grounded);
    } else {
      this.velY -= GRAVITY * dt;
      const r = this.collider.move(this.feet, mx, this.velY * dt, mz, this.controllerHeight, true, FOE_KEEPS_FLOOR);
      this.isGrounded = r.grounded;
      this.collidedSides = !!r.sides;
      if (r.grounded) this.velY = 0;
      this._trackFall(r.grounded);
    }
    this.knockbackSpeed -= classicTicks * KB(KNOCKBACK_DECAY_PER_CLASSIC);
    if (this.knockbackSpeed < 0) this.knockbackSpeed = 0;
    this._restGrounded = false;
  }

  flee(fromFeet, seconds, pace = 1) {
    breakWindup(this);
    this.fleeFrom = [fromFeet[0], fromFeet[1], fromFeet[2]];
    this.fleeLeft = seconds;
    this.fleePace = pace > 0 ? pace : 1;
    this._tacDir = null;
    this._tacSpeed = 1;
    this.target = null;
    this.secondaryTarget = null;
    this.moving = false;
    this.avoidObstaclesTimer = 0;
    this.canAct = false;
    this.inSight = false;
    this.detected = false;
    this.justEncountered = false;
  }

  _followWanted() {
    const leader = this.follow.feet?.();
    if (!leader) return this.target == null;
    const leash = this.follow.leash ?? FOLLOW_LEASH;
    const home = Math.hypot(leader[0] - this.feet[0], leader[2] - this.feet[2]);
    if (this._returning) {
      if (home <= (this.follow.stop ?? FOLLOW_STOP) + FOLLOW_SLACK) this._returning = false;
      else { this._dropTargets(); return true; }
    }
    if (this.target == null) return true;
    const tf = this.target.ai?.feet ?? this.target.feet ?? null;
    if (home > leash || (tf && Math.hypot(tf[0] - leader[0], tf[2] - leader[2]) > leash)) {
      this._returning = home > leash;
      this._dropTargets();
      return true;
    }
    return this.predictedTargetPos == null || this.giveUpTimer <= 0;
  }

  _dropTargets() {
    this.target = null; this.secondaryTarget = null; this.targetSenses = null;
    this.lastKnownTargetPos = null; this.predictedTargetPos = null;
  }

  _followTicks(classicTicks, dt) {
    const leader = this.follow.feet?.();
    if (!leader) { this.moving = false; return; }
    const d = Math.hypot(leader[0] - this.feet[0], leader[2] - this.feet[2]);
    const stop = this.follow.stop ?? FOLLOW_STOP;
    if (d <= stop || (!this._followWalking && d <= stop + FOLLOW_SLACK)) {
      this._followWalking = false; this.moving = false; this._followPace = 1;
      this._crumb = null; this._trailMode = null; this._trailT = 0;
      return;
    }
    this._followWalking = true;
    this._followPace = d > FOLLOW_RUN_M ? FOLLOW_RUN_PACE : 1;
    const goal = this._followGoal(leader, dt);
    this.destination = [goal[0], leader[1], goal[2]];
    const aim = this.avoidObstaclesTimer > 0 ? this.detourDestination : this.destination;
    const dx = aim[0] - this.feet[0];
    const dz = aim[2] - this.feet[2];
    for (let i = 0; i < classicTicks; i++) {
      if (!withinYaw(this.yaw, dx, dz, MOVE_YAW_GATE_DEG)) this.yaw = turnTowards(this.yaw, dx, dz);
    }
    this.moving = withinYaw(this.yaw, dx, dz, FOLLOW_YAW_GATE_DEG);
  }

  _followGoal(leader, dt) { return this._trailGoal(leader, dt) ?? this._nearestCrumb() ?? leader; }

  _clearLine(to) {
    if (!(Math.abs(to[1] - this.feet[1]) <= FOLLOW_SIGHT_DY)) return false;
    const dx = to[0] - this.feet[0], dz = to[2] - this.feet[2], d = Math.hypot(dx, dz);
    if (d <= FOLLOW_CRUMB_REACH) return true;
    const c = this._centre();
    const p1 = [c[0], c[1] - this.height * OBSTACLE_P1_BELOW_CENTRE, c[2]];
    const p2 = [p1[0], p1[1] + Math.min(this.height, DOOR_CROUCHING_HEIGHT) / 2, p1[2]];
    return !(this.collider.capsuleCast(p1, p2, FOLLOW_SIGHT_RADIUS, [dx / d, 0, dz / d], d).dist < d - FOLLOW_CRUMB_REACH);
  }

  _trailGoal(leader, dt) {
    const trail = this.follow?.trail?.();
    if (!trail?.length) { this._trailMode = null; this._crumb = null; return null; }
    let i = this._crumb ? trail.indexOf(this._crumb) : -1;
    if (this._trailMode === 'crumb' && i < 0) { this._trailMode = null; this._crumb = null; this._trailT = 0; }
    this._trailT -= dt;
    if (this._trailT > 0) return this._trailMode === 'leader' ? leader : this._trailMode === 'crumb' ? this._crumbFrom(trail, i, leader) : null;
    this._trailT = FOLLOW_SIGHT_S;
    if (this._clearLine(leader)) { this._trailMode = 'leader'; this._crumb = null; return leader; }
    const stride = Math.max(1, Math.ceil((trail.length - 1 - Math.max(i, 0)) / FOLLOW_SIGHT_TRIES));
    for (let j = trail.length - 1, n = 0; j > i && n < FOLLOW_SIGHT_TRIES; j -= stride, n++) {
      const p = trail[j];
      if (Math.hypot(p[0] - this.feet[0], p[2] - this.feet[2]) > FOLLOW_CRUMB_FAR) continue;
      if (this._clearLine(p)) { this._trailMode = 'crumb'; this._crumb = p; return this._crumbFrom(trail, j, leader); }
    }
    if (i >= 0) return this._crumbFrom(trail, i, leader);
    this._trailMode = null; this._crumb = null;
    return null;
  }

  _crumbFrom(trail, i, leader) {
    while (i < trail.length && Math.hypot(trail[i][0] - this.feet[0], trail[i][2] - this.feet[2]) <= FOLLOW_CRUMB_REACH) i++;
    if (i >= trail.length) { this._trailMode = 'leader'; this._crumb = null; return leader; }
    this._trailMode = 'crumb'; this._crumb = trail[i];
    return this._crumb;
  }

  _nearestCrumb() {
    const trail = this.follow?.trail?.();
    if (!trail?.length) return null;
    let best = -1, bd = FOLLOW_CRUMB_FAR;
    for (let j = 0; j < trail.length; j++) {
      const d = Math.hypot(trail[j][0] - this.feet[0], trail[j][2] - this.feet[2]);
      if (d < bd) { bd = d; best = j; }
    }
    return best < 0 ? null : this._crumbFrom(trail, best, this.follow.feet?.() ?? trail[trail.length - 1]);
  }

  _fleeStep(dt, paralyzed) {
    this.fleeLeft -= dt;
    this._clock += dt;
    let classicTicks = 0;
    this._classicTimer += dt;
    while (this._classicTimer >= CLASSIC_UPDATE_INTERVAL) { this._classicTimer -= CLASSIC_UPDATE_INTERVAL; classicTicks++; }
    const knocked = this.knockbackSpeed > 0;
    this.canAct = false;
    this.inSight = false;
    this.detected = false;
    this._updateDetourTimers(dt, !paralyzed && !knocked);
    this.hurtKnock = false;
    if (knocked) { this._knockbackStep(dt, classicTicks); return; }
    let ax = this.feet[0] - this.fleeFrom[0];
    let az = this.feet[2] - this.fleeFrom[2];
    const al = Math.hypot(ax, az);
    if (al > 1e-6) { ax /= al; az /= al; } else { ax = Math.sin(this.yaw); az = Math.cos(this.yaw); }
    this.destination = [this.feet[0] + ax * FLEE_AIM, this.feet[1], this.feet[2] + az * FLEE_AIM];
    const aim = this.avoidObstaclesTimer > 0 ? this.detourDestination : this.destination;
    const dx = aim[0] - this.feet[0];
    const dz = aim[2] - this.feet[2];
    for (let i = 0; i < classicTicks; i++) {
      if (withinYaw(this.yaw, dx, dz, MOVE_YAW_GATE_DEG)) this.moving = true;
      else { this.yaw = turnTowards(this.yaw, dx, dz); this.moving = false; }
    }
    if (paralyzed) this.moving = false;
    this._walkStep(dt, this.fleePace);
  }

  walkTo(point, { pace = 1 } = {}) {
    this.walkGoal = [point[0], point[1], point[2]];
    this._pace = pace;
    this.walkArrived = false;
    this.moving = false;
  }
  _walkGoalStep(dt, paralyzed) {
    this._clock += dt;
    let classicTicks = 0;
    this._classicTimer += dt;
    while (this._classicTimer >= CLASSIC_UPDATE_INTERVAL) { this._classicTimer -= CLASSIC_UPDATE_INTERVAL; classicTicks++; }
    const knocked = this.knockbackSpeed > 0;
    this.canAct = false;
    this.inSight = false;
    this.detected = false;
    this._updateDetourTimers(dt, !paralyzed && !knocked);
    this.hurtKnock = false;
    if (knocked) { this._knockbackStep(dt, classicTicks); return; }
    const g = this.walkGoal;
    const left = Math.hypot(g[0] - this.feet[0], g[2] - this.feet[2]);
    if (left <= WALK_ARRIVE_M) {
      this.walkGoal = null; this.walkArrived = true; this.moving = false;
      this._walkStep(dt);
      return;
    }
    this.destination = [g[0], g[1], g[2]];
    const aim = this.avoidObstaclesTimer > 0 ? this.detourDestination : this.destination;
    const dx = aim[0] - this.feet[0];
    const dz = aim[2] - this.feet[2];
    for (let i = 0; i < classicTicks; i++) {
      const facing = withinYaw(this.yaw, dx, dz, MOVE_YAW_GATE_DEG);
      if (!facing) this.yaw = turnTowards(this.yaw, dx, dz);
      this.moving = facing;
    }
    if (paralyzed) this.moving = false;
    this._walkStep(dt, this._pace);
  }

  _step(dt, playerFeet, senses, paralyzed = false, paused = false) {
    this._steps++;
    if (this.fleeLeft > 0) { this._fleeStep(dt, paralyzed); return; }
    if (this.walkGoal) { this._walkGoalStep(dt, paralyzed); return; }
    const knocked = this.knockbackSpeed > 0 && !paused;
    const staggered = this.staggerUntil > 0 && tacticsNow() < this.staggerUntil;
    this.staggered = staggered;
    const overreached = this.overreachUntil > 0 && tacticsNow() < this.overreachUntil;
    this.overreached = overreached;
    const locked = staggered || overreached || (this.roarUntil > 0 && tacticsNow() < this.roarUntil);
    this._clock += dt;
    this._updateDetourTimers(dt, !paralyzed && !knocked && !locked);
    const targeting = senses?.targeting ?? null;
    this._armedTargeting = !!targeting;
    this._playerHeight = senses?.playerHeight ?? CAPSULE_HEIGHT;
    let classicTicks = 0;
    this._classicTimer += dt;
    while (this._classicTimer >= CLASSIC_UPDATE_INTERVAL) {
      this._classicTimer -= CLASSIC_UPDATE_INTERVAL;
      classicTicks++;
      this._classicSenses(playerFeet, senses);
      if (targeting) targeting(this, playerFeet, dt);
      // The LOS timer drains only on ticks that found a target, as in DFU.
      if (!targeting || this.target != null) this._classicPostTarget(senses);
    }
    this._targetPosPredict = classicTicks > 0;
    this._targetPosPredictTimer = classicTicks > 0 ? 0 : this._targetPosPredictTimer + dt;
    let targetFeet = playerFeet;
    if (targeting) {
      this._targetCandidate = this.target;
      targetFeet = this.target == null ? null
        : (this.target.isPlayer ? (this.target.feet ?? playerFeet) : this.target.ai.feet);
    } else this._targetCandidate = null;
    this.targetIsLocalPlayer = !this._armedTargeting || (this.target != null && this.target.isPlayer === true && this.target.isPeer !== true);
    const foeTarget = this._armedTargeting && this.target != null && !this.target.isPlayer;
    this.canAct = !paralyzed && !knocked && !locked && (this.isHostile || foeTarget);
    if (!this.canAct || paused) this._tacSkipped = true;
    if (!this.canAct && this._tac?.state && !locked) breakWindup(this);
    if (targeting && targetFeet == null) {
      this.inSight = false;
      this.detected = false;
    } else {
      this._senses(targetFeet, senses, classicTicks > 0 || this._rayAt !== this._steps - 1 || this._rayTarget !== this._targetCandidate);
    }
    this._handleNoAction(foeTarget);
    if (this.detected) this.giveUpTimer = GIVE_UP_TICKS;
    const follows = !!this.follow && !paralyzed && !paused && !knocked && !locked && this._followWanted();
    for (let i = 0; i < classicTicks; i++) {
      if (!this.detected && this.giveUpTimer > 0) this.giveUpTimer--;
      if (this.canAct && !follows) this._classicTick(targetFeet ?? playerFeet, paused);
    }
    if (paralyzed || paused || locked || !(this.isHostile || foeTarget)) this.moving = false;
    this._following = follows;
    if (this._following) this._followTicks(classicTicks, dt);

    this.hurtKnock = false;
    if (knocked) { this._knockbackStep(dt, classicTicks); return; }

    if (this.swims) {
      this._restGrounded = false;
      if (paralyzed || !this.moving) return;
      const waterY = this.waterSurfaceY ? this.waterSurfaceY(this.feet[0], this.feet[2]) : null;
      const center = this.feet[1] + this.centreOffset;
      if (waterY === null || center >= waterY) return;
      const d = this._dir3(this.destination);
      this._obstacleCheck(d);
      this._fallCheck(d);
      if (this.fallDetected || this.obstacleDetected) { this._findDetour(d); return; }
      let my = d[1] * this.speed * dt;
      if (my > 0 && center + WATER_HEAD_MARGIN >= waterY) my = 0;
      const moveResult = this.collider.move(this.feet, d[0] * this.speed * dt, my, d[2] * this.speed * dt, this.controllerHeight, true, FOE_KEEPS_FLOOR);
      this.isGrounded = moveResult.grounded;
      this.collidedSides = !!moveResult.sides;
      return;
    }

    if ((this.flies && !paralyzed) || this.levitating) {
      this.velY = 0;
      this._restGrounded = false;
      if (!this.moving) { this.lastGroundedY = this.feet[1]; return; }
      const d = this._dir3(this.destination);
      if (this.flies && !this._following && this.avoidObstaclesTimer <= 0 && d[1] < 0) {
        const hit = this.collider.raycast(
          this._centre(), [0, -1, 0],
          this.height / 2 + FLYER_FLOOR_CLEARANCE);
        if (Number.isFinite(hit)) d[1] = FLYER_FLOOR_LIFT;
      }
      this._obstacleCheck(d);
      this._fallCheck(d);
      if (this.fallDetected || this.obstacleDetected) { this._findDetour(d); this.lastGroundedY = this.feet[1]; return; }
      const moveResult = this.collider.move(this.feet, d[0] * this.speed * dt, d[1] * this.speed * dt, d[2] * this.speed * dt, this.controllerHeight, true, FOE_KEEPS_FLOOR);
      this.isGrounded = moveResult.grounded;
      this.collidedSides = !!moveResult.sides;
      this.lastGroundedY = this.feet[1];
      return;
    }

    this._walkStep(dt, this._following ? this._followPace : 1);
  }

  _walkStep(dt, pace = 1) {
    if (!this.moving && this._restGrounded) return;
    this.velY -= GRAVITY * dt;
    const dy = this.velY * dt;
    let dxm = 0;
    let dzm = 0;
    if (this.moving) {
      const dir2d = this._tacDir ? [this._tacDir[0], 0, this._tacDir[1]] : [Math.sin(this.yaw), 0, Math.cos(this.yaw)];
      this._obstacleCheck(dir2d);
      this._fallCheck(dir2d);
      if (this.fallDetected || this.obstacleDetected) {
        if (this._tacDir) { this._tacDir = null; this._tacBlocked = true; this.moving = false; }
        else this._findDetour(dir2d);
      } else {
        const sp = this.speed * (this._tacDir ? this._tacSpeed : 1) * pace;
        dxm = dir2d[0] * sp * dt;
        dzm = dir2d[2] * sp * dt;
      }
    }
    const r = this.collider.move(this.feet, dxm, dy, dzm, this.controllerHeight, true, FOE_KEEPS_FLOOR, false, this.isGrounded);
    this.isGrounded = r.grounded;
    this.collidedSides = !!r.sides;
    if (r.grounded) this.velY = 0;
    this._trackFall(r.grounded);
    this._restGrounded = !this.moving && r.grounded;
  }

  _trackFall(grounded) {
    if (grounded) {
      if (this._airborne) {
        const drop = this.lastGroundedY - this.feet[1];
        if (drop > FALL_DAMAGE_THRESHOLD) this.landedFall = drop;
        this._airborne = false;
      }
      this.lastGroundedY = this.feet[1];
    } else {
      this._airborne = true;
    }
  }

  _dir3(point) {
    const dx = point[0] - this.feet[0];
    const dy = point[1] - this.feet[1];
    const dz = point[2] - this.feet[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    return [dx / l, dy / l, dz / l];
  }

  resumeLive() {
    this.target = null; this.secondaryTarget = null; this.targetSenses = null;
    this.lastKnownTargetPos = null; this.oldLastKnownTargetPos = null; this.predictedTargetPos = null; this._predictedTargetPosWithoutLead = null;
    this.lastHadLOSTimer = 0; this.giveUpTimer = 0; this.classicTargetUpdateTimer = 0;
    this._standAfresh();
  }

  _standAfresh() {
    this.lastGroundedY = this.feet[1]; this._airborne = false; this.velY = 0; this.landedFall = 0;
    this.destination = [this.feet[0], this.feet[1], this.feet[2]]; this.detourDestination = [this.feet[0], this.feet[1], this.feet[2]];
    this.obstacleDetected = false; this.fallDetected = false; this.foundUpwardSlope = false; this.foundDoor = false;
    this.avoidObstaclesTimer = 0; this.checkingClockwiseTimer = 0; this.didClockwiseCheck = false; this.lastTimeWasStuck = -Infinity; this._boxedUntil = -Infinity;
    this._rayAt = -1;
    this._acc = 0; this.knockbackSpeed = 0; this.hurtKnock = false; this.moving = false;
    this._restGrounded = false;
    this._crumb = null; this._trailMode = null; this._trailT = 0;
    this.controllerHeight = this.height; this.collidedSides = false; this._resetHeight = false; this._heightChangeTimer = 0;
  }

  holdFrame() {
    this.inSight = false; this.detected = false; this.wouldBeSpawned = false; this._rayAt = -1;
  }

  offsetOrigin(offset) {
    const moved = new Set();
    for (const p of [this.feet, this.destination, this.detourDestination, this.lastKnownTargetPos, this.oldLastKnownTargetPos, this.predictedTargetPos, this._predictedTargetPosWithoutLead, this.fleeFrom]) {
      if (!p || moved.has(p)) continue;
      moved.add(p);
      p[0] += offset[0]; p[1] += offset[1]; p[2] += offset[2];
    }
    this.lastGroundedY += offset[1];
    const head = this._tac?.dash?.head;
    if (head) { head[0] += offset[0]; head[1] += offset[2]; }
    this._crumb = null; this._trailMode = null; this._trailT = 0;
  }
}
