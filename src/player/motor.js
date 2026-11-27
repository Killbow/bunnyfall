// First-person player motor. Speed formulas, gravity, jump, and capsule dimensions follow Daggerfall Unity's
// PlayerSpeedChanger, AcrobatMotor, and PlayerAdvanced. Collision resolution is engine-side (collider.js).

export const CLASSIC_TO_UNITY_RATIO = 39.5;
// enemyMotor.js imports the capsule and gravity constants from here, so this file must not import from it.
export const DF_WALK_BASE = 150;
export const DF_CROUCH_BASE = 50;
export const JUMP_SPEED = 4.5;
export const SYSTEM_TIMER_UPDATES_DIVISOR = 0.0549254;
export const GROUNDED_JUMP_GATE_S = 0.1;
let _jfBufferOf = null, _jfLateOf = null;
export function registerJumpForgiveness(buffer, late) {
  _jfBufferOf = typeof buffer === 'function' ? buffer : null;
  _jfLateOf = typeof late === 'function' ? late : null;
}
const jumpForgiven = (fn) => { if (!fn) return 0; try { const v = Number(fn()); return Number.isFinite(v) ? Math.max(0, Math.min(0.5, v)) : 0; } catch { return 0; } };
const _runMods = new Map();
export function registerRunSpeedMod(name, fn) { if (typeof fn === 'function') _runMods.set(name, fn); else _runMods.delete(name); }
export function runSpeedMult() {
  let k = 1;
  for (const fn of _runMods.values()) { try { const v = Number(fn()); if (Number.isFinite(v) && v > 0) k *= v; } catch {  } }
  return k;
}
const _footMods = new Map();
export function registerFootSpeedMod(name, fn) { if (typeof fn === 'function') _footMods.set(name, fn); else _footMods.delete(name); }
export function footSpeedMult() {
  let k = 1;
  for (const fn of _footMods.values()) { try { const v = Number(fn()); if (Number.isFinite(v) && v > 0) k *= v; } catch {  } }
  return k;
}
export const FIXED_DT = 1 / 60;
export const ODOMETER_MAX_SPEED = 60;
export const MAX_FRAME_DT = 0.25;

export function motionBagOf(player) {
  return {
    forward: player.moveForward || 0, strafe: player.moveStrafe || 0, running: !!player.isRunning, speed: player.moveSpeed || 0,
    grounded: player.grounded !== false, jumping: !!player.jumping, swimming: !!player.swimming, levitating: !!player.levitating,
    crouching: !!player.crouching, riding: !!player.riding, standing: !!player.standing, speedField: player.speed || 0,
    climbing: !!(player.climb?.isClimbing || player.mantling || player.onWall),
    bobTimer: Number.isFinite(player.bobTimer) ? player.bobTimer : null,
    sneaking: !!player.isSneaking, freeze: player.freezeMotor || 0, onExteriorWater: !!player.onExteriorWater,
    height: Number.isFinite(player.height) ? player.height : 0,
    yaw: Number.isFinite(player.moveYaw) ? player.moveYaw : NaN,
    travel: typeof player.travelAt === 'function' ? player.travelAt() : null,
    bodyYaw: player.drawYaw ?? player._bodyYaw ?? null, bodyYawOff: Number.isFinite(player._bodyYawOff) ? player._bodyYawOff : 0,
    carriedYaw: Number.isFinite(player.carriedYaw) ? player.carriedYaw : 0,
  };
}
export function climbPoseOf(player) {
  const cl = player.mantling ? 3 : player.hanging ? 1 : player.onWall || player.climb?.isClimbing ? 2 : 0;
  if (!cl) return {};
  const cw = player.climbFacing;
  // `|| 0` keeps negative zero off the wire.
  const out = Number.isFinite(cw) ? { cl, cw: Math.round(cw * 1000) / 1000 || 0 } : { cl };
  if (cl === 3) Object.assign(out, climbMoveOf(player.climbMove));
  return out;
}
export function climbMoveOf(m) {
  if (!m || !m.from) return {};
  const k = CLIMB_MOVE_KINDS.indexOf(m.kind) + 1;
  if (!k) return {};
  const lip = m.hang?.lipY ?? (m.up ? m.up[1] - PARKOUR_UP_GAP : null);
  const out = { ck: k };
  if (Number.isFinite(lip)) out.cy = Math.max(-CLIMB_MOVE_RISE_MAX, Math.min(CLIMB_MOVE_RISE_MAX, Math.round((lip - m.from[1]) * 100)));
  if (Number.isFinite(m.dur) && m.dur > 0) out.cd = Math.max(1, Math.min(CLIMB_MOVE_TIME_MAX, Math.round(m.dur * 100)));
  return out;
}
export const BODY_TURN_TAU = 0.08;
export const CROUCH_JUMP_DELTA = 0.8;
export const JUMP_FWD_BOOST = 0.05;
export const HORSE_JUMP_MULTIPLIER = 1.75;
export const SLOWFALL_SPEED = 105;
// Unity's fixed step, not FIXED_DT: DFU's slow fall is a flat 2.1 m/s.
export const UNITY_FIXED_DT = 0.02;
export const SLOWFALL_VELOCITY = SLOWFALL_SPEED * UNITY_FIXED_DT;
export const FALL_DAMAGE_THRESHOLD = 5.0;
export const FALL_HP_PER_METRE = 5;
export const GRAVITY = 20.0;
export const BLOW_PUSH_DECAY = 12;
export const BLOW_PUSH_EDGE = 2;
const PUSH_DOWN = Object.freeze([0, -1, 0]);
export const FALL_CARRY_MAX = MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE;
export const FALL_CARRY_MAX_SPEED = Math.sqrt(2 * GRAVITY * FALL_CARRY_MAX);
export const OVER_ENCUMBERED_LIMIT = 250;
export const HOLD_CARRY_MAX = 4;
export const CANNOT_FLOAT_TEXT = 'You are carrying too much to stay afloat.';
export const CANNOT_FLOAT_HUD_SECONDS = 1.75;
export function afloatMessageStep(player, waterWalking) {
  const overEncumbered = (player.carriedWeight?.() ?? 0) * 4 > OVER_ENCUMBERED_LIMIT;
  if (overEncumbered && player.swimming && !player.displayAfloatMessage && !waterWalking) {
    player.displayAfloatMessage = true;
    return localizedText('cannotFloat', CANNOT_FLOAT_TEXT);
  }
  if ((!overEncumbered || !player.swimming) && player.displayAfloatMessage) player.displayAfloatMessage = false;
  return null;
}
export const CAPSULE_HEIGHT = 1.8;
export const CAPSULE_RADIUS = 0.35;
export const STEP_OFFSET = 0.5;
export const CLIMB_SIDE_REACH = CAPSULE_RADIUS + 0.1;
export const CLIMB_CAP_LOW = CAPSULE_RADIUS - Math.sqrt(CLIMB_SIDE_REACH ** 2 - CAPSULE_RADIUS ** 2);
export const CLIMB_GROUND_NEAR = 0.12;
export const STEP_SMOOTH_TAU = 0.06;
export const SLOPE_LIMIT_DEG = 70;
export const EYE_HEIGHT = 1.7;
export const CROUCH_HEIGHT = 0.9;
export const CROUCH_EYE_HEIGHT = 0.8;
export const CROUCH_TO_STAND_DIST = (CAPSULE_HEIGHT - CROUCH_HEIGHT) / 2;
// Refuses standing up when the rising head crosses a face, so a low ceiling never lifts the body above it.
/**
 * @param {any} collider
 * @param {ArrayLike<number>} feet
 * @param {number} height
 */
export function standHeadClear(collider, feet, height) {
  const rise = CAPSULE_HEIGHT - height;
  if (!(rise > 0)) return true;
  return !Number.isFinite(collider.raycast?.([feet[0], feet[1] + height - CAPSULE_RADIUS, feet[2]], [0, 1, 0], rise));
}
export const RIDE_HEIGHT = 2.6;
export const RIDE_EYE_HEIGHT = 2.51;
export const HEIGHT_TIMER_FAST = 0.10;
export const HEIGHT_TIMER_MEDIUM = 0.25;
export const HEIGHT_TIMER_SLOW = 0.4;

export const HEAD_DIP_RAY_DISTANCE = 0.5;
export const HEAD_DIP_CLEARANCE = -0.28;
export const HEAD_DIP_TOP_MARGIN = 0.25;

export const SWIM_HEIGHT = 0.30;
export const SWIM_HORSE_DISPLACEMENT = 0.30;
export const SWIM_EYE_HEIGHT = CAPSULE_RADIUS + SWIM_HEIGHT / 2;
export const SWIM_RIDE_EYE_HEIGHT = CAPSULE_RADIUS + (SWIM_HEIGHT + SWIM_HORSE_DISPLACEMENT) / 2;

export const TELEPORT_FREEZE_S = 0.5;

export const ANTI_BUMP_FACTOR = 20.75;

export function isStaticGeometryKey(key) {
  if (key == null) return false;
  const k = String(key);
  return !k.startsWith('act:') && !k.startsWith('door:');
}

// Runtime-only import cycle with climbing.js; ESM live bindings resolve it.
import { ClimbingState, climbingSpeed, CONTINUE_CLIMBING_SKILL_CHECK_FREQUENCY, START_CLIMB_HORIZONTAL_TOLERANCE } from './climbing.js';
import {
  senseLedge, senseVault, senseOver, planMantle, planClamber, planVault, movePoint, offsetMove, carryMove,
  parkourSkill, jumpingSkill, parkourReach, parkourCatchHold, parkourRefusal,
  PARKOUR_AIR_REACH, PARKOUR_AIR_LOW, PARKOUR_OVER_DROP, PARKOUR_QUIET_STEPS,
  senseGrip, senseEaveAhead, senseEaveLedge, catchClear, planCatch, planCorner, moveClear, wallContact, carryHold, gripSeconds, shimmySpeed, freeClimbSpeed, freeStartSeconds,
  bandsClear, capsuleFits, PARKOUR_LEAN, PARKOUR_SIDESTEP_MAX, PARKOUR_SIDESTEP_PROBE, PARKOUR_SIDESTEP_RISE, PARKOUR_SIDESTEP_CLEAR, PARKOUR_HUG_PRESS, PARKOUR_STEP_SCAN, PARKOUR_CORNER_LOOK, PARKOUR_TURN_HOLDS,
  PARKOUR_HANG_DROP, PARKOUR_HANG_GAP, PARKOUR_HANG_LOW, PARKOUR_HAND_SPAN, PARKOUR_GRIP_MIN, PARKOUR_GRIP_LOW,
  PARKOUR_GRIP_LOW_TEXT, PARKOUR_GRIP_REST, PARKOUR_GRIP_REGEN_S,
  PARKOUR_CORNER_PROBE, PARKOUR_FACE_FOLLOW, PARKOUR_ARM_GRACE_S, PARKOUR_CORNER_OFF, PARKOUR_CORNER_IN, PARKOUR_CORNER_CLEAR, PARKOUR_WALL_REACH, PARKOUR_CONTACT,
  senseEdge, planLower, senseOverHang, planOverHang,
  senseLeapHold, planLeap, senseWallRun, planWallRun, senseDrop, ejectLaunch, runLeapLaunch, wallRunHeight,
  leapSideReach, leapUpReach, PARKOUR_LEAP_GRIP, PARKOUR_LEAP_REACH, PARKOUR_COYOTE_S, PARKOUR_RUNLEAP_EDGE, PARKOUR_LIP_FOLLOW, PARKOUR_UP_GAP,
  PARKOUR_RUN_SHARE,
  PARKOUR_VAULT_MAX, PARKOUR_VAULT_CLEAR,
} from './parkour.js';
import { PlayerMoveScanner } from './moveScanner.js';
import { getBool } from '../platform/settings.js';
import { localizedText } from '../ui/textManager.js';
import { TRANSPORT_MODES, isRiding, rideBaseFor, canRunUnlessRiding, rideWalks } from '../travel/transport.js';
import { timeScale } from '../world/timeScale.js';
import { CLIMB_MOVE_KINDS, CLIMB_MOVE_RISE_MAX, CLIMB_MOVE_TIME_MAX } from '../net/wire.js';
import { clampToRing } from '../net/duelSession.js';
import { keepOffBodies } from './bodyClamp.js';
import { MAX_TERRAIN_HEIGHT, STREAMING_TERRAIN_SCALE } from '../world/terrainSampler.js';
import { grappleStep } from '../combat/grapple/grapple.js';

export function walkSpeed(liveSpeed) {
  const drag = 0.5 * (100 - (liveSpeed >= 30 ? liveSpeed : 30));
  return (liveSpeed + DF_WALK_BASE - drag) / CLASSIC_TO_UNITY_RATIO;
}

export function runSpeed(liveSpeed, runningSkill, crouching = false, rideBase = null) {
  const base = rideBase != null
    ? (liveSpeed + rideBase) / CLASSIC_TO_UNITY_RATIO
    : (liveSpeed + (crouching ? DF_CROUCH_BASE : DF_WALK_BASE)) / CLASSIC_TO_UNITY_RATIO;
  return base * (1.35 + runningSkill / 200);
}

export function rideSpeed(liveSpeed, rideBase) {
  return (liveSpeed + rideBase) / CLASSIC_TO_UNITY_RATIO;
}

export function crouchSpeed(liveSpeed) {
  return (liveSpeed + DF_CROUCH_BASE) / CLASSIC_TO_UNITY_RATIO;
}

export function sneakSpeed(speed) {
  return speed / 2 - 1 / CLASSIC_TO_UNITY_RATIO;
}

export const LEVITATE_MOVE_SPEED = 4.0;
export const DIAGONAL_FACTOR = 0.7071;

export function swimSpeed(baseSpeed, swimmingSkill) {
  return baseSpeed * (swimmingSkill / 200) + baseSpeed / 4;
}

/**
 * @param {boolean} grounded
 * @param {ArrayLike<number>|null} feet
 * @param {{raycast:(o:number[],d:number[],max:number)=>number}} collider
 */
export function startRestGroundedCheck(grounded, feet, collider) {
  if (grounded) return true;
  if (!feet || !collider?.raycast) return false;
  return Number.isFinite(collider.raycast(
    [feet[0], feet[1] + CAPSULE_HEIGHT / 2, feet[2]], [0, -1, 0], CAPSULE_HEIGHT / 2 + 0.2));
}

export class PlayerMotor {
  static SNAP_SPAN = 2;

  constructor(collider, stats = { speed: 50, running: 30, swimming: 30 }, { jumpBoost = null, enhancedJumping = null, climbing = null, carriedWeight = null, parkour = null, travelling = null } = {}) {
    this.collider = collider;
    this.stats = stats;
    /** @type {number[]|null} */
    this.drawFeet = null;
    /** @type {number|null} */
    this.drawYaw = null;
    /** @type {number|null} */
    this.drawGrow = null;
    this.jumpBoost = jumpBoost;
    this.enhancedJumping = enhancedJumping;
    this.carriedWeight = carriedWeight;
    this.climb = climbing ? new ClimbingState({
      ...climbing,
      waterForgiven: () => this.waterSurfaceY != null && this.pos[1] - 0.25 < this.waterSurfaceY,
    }) : null;
    this._climbWallDir = null;
    this.parkour = parkour;
    this.travelling = travelling;
    this._pkMove = null;
    this.parkoured = null;
    this.climbEvents = [];
    this._bodyYaw = null;
    this._bodyYawOff = null;
    this._pkJumpLatch = false;
    this._pkArm = null;
    this._pkJumpWas = false;
    this._pkSaid = false;
    this._pkEdgeSaid = false;
    this._pkLeap = null;
    this._climbCarried = [0, 0, 0];
    this._pkOffEdge = null;
    this._pkQuiet = 0;
    this._wall = null;
    this.grip = 1;
    this._pkDropReq = false;
    this._fcStart = null;
    this._wallTally = 0;
    this._pkOn = false;
    this._pkLeftWall = false;
    this._pkSide = null;
    this._pkRestore = null;
    this.scanner = new PlayerMoveScanner(collider);
    this.pos = new Float32Array(3);
    this._prevPos = new Float32Array(3);
    this.odometer = { h: 0, v: 0 };
    this.travel = [0, 0, 0];
    this._travelPrev = [0, 0, 0];
    this.carriedYaw = 0;
    this._alpha = 1;
    this._eyeFeetY = null;
    this._eyeSmoothing = true;
    this.velY = 0;
    this.grounded = false;
    this.groundedTime = 0;
    this._jfBuf = Infinity;
    this._jfAir = Infinity;
    this._jfWas = false;
    this.jumping = false;
    this.falling = false;
    this.cancelMovement = false;
    this.fallStart = 0;
    this.landedFallDistance = 0;
    this.slowFalling = false;
    this._airVelX = 0;
    this._airVelZ = 0;
    this.arena = null;
    this._swimming = false;
    this._levitating = false;
    this.waterWalking = false;
    this.waterSurfaceY = null;
    this.swimSpeedScale = 1;
    this.rideSpeedScale = 1;
    this.rideWalking = false;
    this.jumped = false;
    this.crouching = false;
    this._pkCrouchRestore = false;
    this.heightAction = null;
    this.heightTimer = 0;
    this.standingHeightAdjustment = 0;
    this.sunk = false;
    this.toggleSink = false;
    this.onExteriorWater = false;   this.isPlayerSwimming = false;
    this.displayAfloatMessage = false;
    this.levitateMotorEnabled = true;
    this._camFrom = EYE_HEIGHT;
    this._camTo = EYE_HEIGHT;
    this.paralyzed = false;
    this.freezeMotor = 0;
    this.techFlight = false;
    this._pushX = 0; this._pushZ = 0;
    this._rattleLeft = 0; this._rattleShare = 1;
    this._downLeft = 0; this._downFor = 0; this._downDrop = 0;
    this.isRunning = false;
    this.moveForward = 0;
    this.moveStrafe = 0; this.moveYaw = NaN;
    this.moveSpeed = 0;
    this.isSneaking = false;
    this.bobOffset = [0, 0, 0];
    this.transportMode = TRANSPORT_MODES.Foot;
    this._sneakMode = false;
    this._prevSneakHeld = false;
    this._runMode = false;
    this._prevRunHeld = false;
    this._toggleRun = false;
    this._autorun = false;
    this._prevAutoRunHeld = false;
    this._prevBackHeld = false;
    this._autoRunStarted = false;
    this._backStarted = false;
    this._runStarted = false;
    this._sneakStarted = false;
    this.movingLessThanHalfSpeed = true;
    this.standing = true;
    this.antiBumpInRange = false;
    this.speed = walkSpeed(this.stats.speed);
  }

  get riding() { return isRiding(this.transportMode); }
  get slowRide() { return !!(this.movingLessThanHalfSpeed || this.rideWalking); }

  get toggleAutorun() { return this._autorun; }
  set toggleAutorun(v) { this._autorun = !!v; }

  blowPush(vx, vz) { this._pushX = vx; this._pushZ = vz; }
  blowRattle(seconds, share) { this._rattleLeft = Math.max(this._rattleLeft, seconds); this._rattleShare = share; }
  blowKnockDown(seconds, drop) {
    if (this.climb?.isClimbing || this._wall || this._pkMove || this.swimming || this.levitating) return false;
    this._downLeft = seconds; this._downFor = seconds; this._downDrop = drop; this._pushX = 0; this._pushZ = 0;
    return true;
  }
  isDown() { return this._downLeft > 0; }
  techniqueLaunch(dir, along, up) {
    if (this.swimming || this.levitating || (this.slowFalling && !this.grounded) || this.climb?.isClimbing || this._wall || this._pkMove) return false;
    if (this.riding || this.isDown() || this.freezeMotor > 0 || this.paralyzed) return false;
    if (!Array.isArray(dir) || !(Number.isFinite(along) && Number.isFinite(up))) return false;
    this.velY = up;
    this._airVelX = dir[0] * along;
    this._airVelZ = dir[2] * along;
    this.grounded = false;
    this.groundedTime = 0;
    this.groundKey = null;
    this.jumping = true;
    if (!(this.falling && this.fallStart > this.pos[1])) { this.falling = false; this.fallStart = this.pos[1]; }
    this.techFlight = true;
    return true;
  }
  _downEye() {
    if (!(this._downLeft > 0)) return 0;
    const into = this._downFor - this._downLeft;
    return this._downDrop * Math.min(1, into / 0.15, this._downLeft / 0.3);
  }
  _pushStep(dt) {
    const v = Math.hypot(this._pushX, this._pushZ);
    if (!(v > 0)) return;
    if (this.freezeMotor > 0 || this.climb?.isClimbing || this._wall || this._pkMove) { this._pushX = 0; this._pushZ = 0; return; }
    const dx = this._pushX * dt, dz = this._pushZ * dt;
    const o = [this.pos[0] + dx * 4, this.pos[1] + 0.5, this.pos[2] + dz * 4];
    const below = this.collider.surfaceHit ? this.collider.surfaceHit(o, PUSH_DOWN, BLOW_PUSH_EDGE + 0.5)?.dist : this.collider.raycast?.(o, PUSH_DOWN, BLOW_PUSH_EDGE + 0.5);
    if (!Number.isFinite(below)) { this._pushX = 0; this._pushZ = 0; return; }
    this.collider.move(this.pos, dx, 0, dz, this.height, this.grounded && !this.jumping && !this.swimming && !this.levitating);
    const nv = Math.max(0, v - BLOW_PUSH_DECAY * dt);
    this._pushX *= nv / v; this._pushZ *= nv / v;
  }

  stopAutorun() {
    this._autorun = false;
    this._toggleRun = false;
  }

  get swimming() { return this._swimming; }
  set swimming(v) {
    const b = !!v;
    if (b === this._swimming) return;
    this._swimming = b;
    this.cancelMovement = true;
  }

  _refreshWalkSpeed() {
    return walkSpeed(this.stats.speed) * (this.swimSpeedScale > 0 ? this.swimSpeedScale : 1);
  }
  _halfSpeedBase() {
    if (this.crouching) return walkSpeed(this.stats.speed);
    return isRiding(this.transportMode) ? rideSpeed(this.stats.speed, this._rideBaseNow()) * this._rideScale() : this._refreshWalkSpeed();
  }
  _rideBaseNow() { return rideWalks(this.transportMode, this._runMode) ? DF_WALK_BASE : rideBaseFor(this.transportMode); }
  _rideScale() { const k = this.rideSpeedScale; return Number.isFinite(k) && k > 0 ? k : 1; }
  swimSpeedNow() {
    return swimSpeed(this._refreshWalkSpeed(), this.stats.swimming ?? 0);
  }

  get levitating() { return this._levitating; }
  set levitating(v) {
    const b = !!v;
    if (b === this._levitating) return;
    this._levitating = b;
    this.cancelMovement = true;
  }

  get eye() {
    const b = this.bobOffset;
    return [this.pos[0] + b[0], this.pos[1] + this._eyeLevel() + b[1], this.pos[2] + b[2]];
  }

  _snapSpan2() {
    const s = Math.max(PlayerMotor.SNAP_SPAN, ODOMETER_MAX_SPEED * (this._spanStep ?? FIXED_DT));
    return s * s;
  }

  eyeAt(alpha = this._alpha) {
    const p = this.pos, q = this._prevPos;
    const dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2];
    if (dx * dx + dy * dy + dz * dz > this._snapSpan2()) { this._eyeFeetY = null; return this.eye; }
    const a = Math.max(0, Math.min(1, alpha));
    const b = this.bobOffset;
    const feetY = (this._eyeFeetY != null && alpha === this._alpha) ? this._eyeFeetY : q[1] + dy * a;
    return [
      q[0] + dx * a + b[0],
      feetY + this._eyeLevel() + b[1] - this._downEye(),
      q[2] + dz * a + b[2],
    ];
  }

  feetAt(alpha = this._alpha) {
    const p = this.pos, q = this._prevPos;
    const dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2];
    if (dx * dx + dy * dy + dz * dz > this._snapSpan2()) { this._eyeFeetY = null; return [p[0], p[1], p[2]]; }
    const a = Math.max(0, Math.min(1, alpha));
    const feetY = (this._eyeFeetY != null && alpha === this._alpha) ? this._eyeFeetY : q[1] + dy * a;
    return [q[0] + dx * a, feetY, q[2] + dz * a];
  }

  bodyFeetAt(alpha = this._alpha) {
    if (this.drawFeet) return [this.drawFeet[0], this.drawFeet[1], this.drawFeet[2]];
    const p = this.pos, q = this._prevPos;
    const dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2];
    if (dx * dx + dy * dy + dz * dz > this._snapSpan2()) return [p[0], p[1], p[2]];
    const a = Math.max(0, Math.min(1, alpha));
    return [q[0] + dx * a, q[1] + dy * a, q[2] + dz * a];
  }

  _countOdometer(step) {
    const p = this.pos, q = this._prevPos;
    const h = Math.hypot(p[0] - q[0], p[2] - q[2]), v = Math.abs(p[1] - q[1]);
    if (!(h + v <= ODOMETER_MAX_SPEED * step)) return;
    this.odometer.h += h;
    this.odometer.v += v;
    this.travel[0] += p[0] - q[0]; this.travel[1] += p[1] - q[1]; this.travel[2] += p[2] - q[2];
  }

  travelAt(alpha = this._alpha) {
    const a = Math.max(0, Math.min(1, alpha)), p = this.travel, q = this._travelPrev;
    return [q[0] + (p[0] - q[0]) * a, q[1] + (p[1] - q[1]) * a, q[2] + (p[2] - q[2]) * a];
  }

  carryTurn(rad) {
    if (Number.isFinite(rad)) this.carriedYaw += rad;
  }

  pinFeet(x, y, z) {
    this._pkMove = null;
    if (this._wall) this._wallEnd();
    this._pkOffEdge = null; this._pkLeap = null;
    this._pkRestore = null;
    this.pos[0] = x; this.pos[1] = y; this.pos[2] = z;
    this._prevPos[0] = x; this._prevPos[1] = y; this._prevPos[2] = z;
    this._eyeFeetY = null;
  }

  carryBy(dx, dy, dz) {
    this._climbCarried[0] += dx; this._climbCarried[1] += dy; this._climbCarried[2] += dz;
    if (this._pkMove) offsetMove(this._pkMove, [dx, dy, dz]);
    if (this._wall?.lipY != null) this._wall.lipY += dy;
    this._reanchor();
    this.pos[0] += dx; this.pos[1] += dy; this.pos[2] += dz;
    this._prevPos[0] += dx; this._prevPos[1] += dy; this._prevPos[2] += dz;
    if (this._eyeFeetY != null) this._eyeFeetY += dy;
    if (this.falling) this.fallStart += dy;
  }

  offsetOrigin(offset) {
    for (let i = 0; i < 3; i++) {
      this.pos[i] += offset[i];
      this._prevPos[i] += offset[i];
    }
    if (this.arena) this.arena = { ...this.arena, centre: [this.arena.centre[0] + offset[0], this.arena.centre[1] + offset[1], this.arena.centre[2] + offset[2]] };
    if (this._eyeFeetY != null) this._eyeFeetY += offset[1];
    if (this._pkMove) offsetMove(this._pkMove, offset);
    if (this._wall?.lipY != null) this._wall.lipY += offset[1];
    for (const c of [this._pkMove?.carrier, this._wall?.carrier]) {
      if (c) { c.t[0] += offset[0]; c.t[1] += offset[1]; c.t[2] += offset[2]; }
    }
  }

  _reanchor() {
    if (this._pkMove?.carrier) this._pkMove.carrier = this.collider.bucketPose?.(this._pkMove.key) ?? this._pkMove.carrier;
    if (this._wall?.carrier) this._wall.carrier = this.collider.bucketPose?.(this._wall.key) ?? this._wall.carrier;
  }

  _eyeLevel() {
    const t = Math.min(this.heightTimer / (this.heightTimerMax ?? HEIGHT_TIMER_FAST), 1);
    if (this.heightAction === 'sink' || this.heightAction === 'unsink') {
      return this._camFrom + (this._camTo - this._camFrom) * t;
    }
    if (this.sunk) return this.riding ? SWIM_RIDE_EYE_HEIGHT : SWIM_EYE_HEIGHT;
    if (this.heightAction === 'mount') return EYE_HEIGHT + (RIDE_EYE_HEIGHT - EYE_HEIGHT) * t;
    if (this.heightAction === 'dismount') return RIDE_EYE_HEIGHT + (EYE_HEIGHT - RIDE_EYE_HEIGHT) * t;
    if (this.riding) return RIDE_EYE_HEIGHT;
    if (this.heightAction === 'crouch') return EYE_HEIGHT + (CROUCH_EYE_HEIGHT - EYE_HEIGHT) * t;
    if (this.heightAction === 'stand' && !this.crouching) return CROUCH_EYE_HEIGHT + (EYE_HEIGHT - CROUCH_EYE_HEIGHT) * t;
    if (this.crouching) return CROUCH_EYE_HEIGHT;
    return EYE_HEIGHT + this.standingHeightAdjustment / 2;
  }

  get height() {
    if (this.sunk) return SWIM_HEIGHT + (this.riding ? SWIM_HORSE_DISPLACEMENT : 0);
    if (this.riding) return RIDE_HEIGHT;
    return this.crouching ? CROUCH_HEIGHT : CAPSULE_HEIGHT + this.standingHeightAdjustment;
  }

  setTransportMode(mode) {
    const was = this.riding;
    this.transportMode = mode;
    this.rideWalking = false;
    if (this.riding === was) return;
    this.heightAction = this.riding ? 'mount' : 'dismount';
    this.heightTimerMax = this.riding ? HEIGHT_TIMER_MEDIUM : HEIGHT_TIMER_FAST;
    this.heightTimer = 0;
    if (this.riding) this.crouching = false;
  }

  spawn(x, y, z) {
    this.pos[0] = x;
    this.pos[1] = y;
    this.pos[2] = z;
    this.velY = 0;
    this.grounded = false;
    this.groundedTime = 0;
    this.jumping = false;
    this.falling = false;
    this.fallStart = y;
    this._airVelX = 0;
    this._airVelZ = 0;
    this._acc = 0;
    this.arena = null;
    this._pkMove = null;
    this._pkCrouchRestore = false;
    if (this._wall) this._wallEnd();
    this._pkOffEdge = null;
    this._pkLeap = null;
    this._pkRestore = null;
    this._pushX = 0; this._pushZ = 0; this._downLeft = 0; this._rattleLeft = 0;
    this._heightReset();
    this.holdFrame();
  }

  fallSnapshot() {
    let m = this._pkMove;
    while (m?.next) m = m.next;
    const w = this._wall;
    if (m || w) {
      const end = m ? m.to : this.pos;
      const hold = m ? (m.hang ? { mode: 'hang', normal: m.hang.normal, lipY: m.hang.lipY }
        : m.wall ? { mode: 'climb', normal: m.wall.normal, lipY: null } : null) : w;
      return {
        to: [end[0] - this.pos[0], end[1] - this.pos[1], end[2] - this.pos[2]],
        hold: hold ? { mode: hold.mode, normal: [hold.normal[0], 0, hold.normal[2]], lipAbove: hold.lipY != null ? hold.lipY - end[1] : null } : null,
        grip: this.grip,
      };
    }
    return this.falling ? { above: this.fallStart - this.pos[1], velY: this.velY } : null;
  }

  restoreFall(fall) {
    if (fall && (fall.hold !== undefined || fall.to !== undefined)) {
      const to = fall.to;
      if (Array.isArray(to) && to.length === 3 && to.every(Number.isFinite)) {
        for (let i = 0; i < 3; i++) {
          const d = Math.min(HOLD_CARRY_MAX, Math.max(-HOLD_CARRY_MAX, to[i]));
          this.pos[i] += d; this._prevPos[i] += d;
        }
        this._eyeFeetY = null;
      }
      if (Number.isFinite(fall.grip)) this.grip = Math.min(1, Math.max(0, fall.grip));
      const h = fall.hold, n = h?.normal, l = Array.isArray(n) ? Math.hypot(n[0], n[2]) : 0;
      if ((h?.mode === 'hang' || h?.mode === 'climb') && l > 1e-6 && Number.isFinite(l)) {
        this._pkRestore = { mode: h.mode, normal: [n[0] / l, 0, n[2] / l], lipAbove: Number.isFinite(h.lipAbove) ? h.lipAbove : null };
      }
      return;
    }
    if (!Number.isFinite(fall?.above)) return;
    this.falling = true;
    this.fallStart = this.pos[1] + Math.min(FALL_CARRY_MAX, Math.max(-FALL_CARRY_MAX, fall.above));
    if (Number.isFinite(fall.velY)) this.velY = Math.min(FALL_CARRY_MAX_SPEED, Math.max(-FALL_CARRY_MAX_SPEED, fall.velY));
  }

  _keepInArena() {
    const a = this.arena;
    const c = a?.centre;
    if (!c || !(a.radius > 0)) return;
    if (Number.isFinite(a.ceilAbove) && this.pos[1] > c[1] + a.ceilAbove) { this.pos[1] = c[1] + a.ceilAbove; if (this.velY > 0) this.velY = 0; }
    if (typeof a.clamp === 'function') { this._putBack(a.clamp(this.pos, CAPSULE_RADIUS)); return; }
    const to = clampToRing(this.pos, c, a.radius, CAPSULE_RADIUS);
    this._putBack(to);
  }

  _putBack(to) {
    if (!to) return;
    const dx = this.pos[0] - to[0], dz = this.pos[2] - to[1];
    const d = Math.hypot(dx, dz);
    const nx = d > 1e-9 ? dx / d : 1, nz = d > 1e-9 ? dz / d : 0;
    this.pos[0] = to[0];
    this.pos[2] = to[1];
    const out = this._airVelX * nx + this._airVelZ * nz;
    if (out > 0) { this._airVelX -= out * nx; this._airVelZ -= out * nz; }
  }

  holdFrame() {
    this.jumped = false;
    this.parkoured = null;
    this.landedFallDistance = 0;
    if (this.climbEvents.length) this.climbEvents = [];
  }

  _trackHalfSpeed(input, appliedSpeed) {
    const standing = this.grounded && !input.forward && !input.strafe;
    this.standing = standing;
    if (standing) { this.movingLessThanHalfSpeed = true; return; }
    const half = this._halfSpeedBase();
    this.movingLessThanHalfSpeed = half / 2 >= appliedSpeed;
  }

  _heightAction(dt, input) {
    if (!this.crouching) this._pkCrouchRestore = false;
    const onWater = !!this.onExteriorWater && !this.levitating && !this._wall && !this._pkMove;
    if (this.levitating && this.crouching) {
      this.heightAction = 'stand';
    } else if (onWater && !this.toggleSink) {
      this.toggleSink = true;
      if (!this.sunk) this._beginSink();
      else { this.heightAction = 'sink'; this.heightTimerMax = HEIGHT_TIMER_SLOW; }
    } else if (!onWater && this.toggleSink) {
      this.toggleSink = false;
      if (this.sunk) this._beginUnsink();
      else { this.heightAction = 'unsink'; this.heightTimerMax = HEIGHT_TIMER_SLOW; }
    } else if (this.levitating || onWater) {
    } else if (this.riding) {
    } else if (this._pkMove) {
    } else if (this._wall) {
      if (input.crouch) this._pkDropReq = true;
      this.heightTimerMax = HEIGHT_TIMER_MEDIUM;
      if (this.crouching) this.heightAction = 'stand';
    } else if (input.crouch && (!this.swimming || this.grounded)) {
      this._pkCrouchRestore = false;
      this.heightAction = this.crouching ? 'stand' : 'crouch';
      this.heightTimerMax = HEIGHT_TIMER_FAST;
      this.forcedSwimCrouch = false;
    } else if (this._pkCrouchRestore && !this.swimming && capsuleFits(this.collider, this.pos, CAPSULE_HEIGHT)) {
      this._pkCrouchRestore = false;
      this.heightAction = 'stand';
      this.heightTimer = 0;
      this.heightTimerMax = HEIGHT_TIMER_FAST;
    } else if (this.climb?.isClimbing) {
      this.heightTimerMax = HEIGHT_TIMER_MEDIUM;
      if (this.crouching) this.heightAction = 'stand';
      this.forcedSwimCrouch = false;
    } else if (this.swimming && !this.forcedSwimCrouch && !this.grounded) {
      if (!this.crouching) { this.heightAction = 'crouch'; this.heightTimerMax = HEIGHT_TIMER_MEDIUM; }
      this.forcedSwimCrouch = true;
    } else if (!this.swimming && this.forcedSwimCrouch) {
      if (this.crouching) { this.heightAction = 'stand'; this.heightTimerMax = HEIGHT_TIMER_MEDIUM; }
      this.forcedSwimCrouch = false;
    }
    if (!this.heightAction) return;
    this.heightTimer += dt;
    const max = this.heightTimerMax ?? HEIGHT_TIMER_FAST;
    if (this.heightAction === 'sink' || this.heightAction === 'unsink') {
      if (this.heightTimer >= max) this._heightReset();
    } else if (this.heightAction === 'crouch') {
      if (this.heightTimer >= max) {
        this.standingHeightAdjustment = 0;
        this.crouching = true;
        this._heightReset();
      }
    } else if (!Number.isFinite(this.collider.sphereCast(
      [this.pos[0], this.pos[1] + this.height / 2, this.pos[2]],
      CAPSULE_RADIUS, [0, 1, 0], CROUCH_TO_STAND_DIST).dist) && standHeadClear(this.collider, this.pos, this.height)) {
      if (this.crouching) this.standingHeightAdjustment = 0;
      this.crouching = false;
      if (this.heightTimer >= max) this._heightReset();
    } else if (this.heightTimer >= max) {
      this._heightReset();
    }
  }

  _beginSink() {
    this._camFrom = this.crouching ? CROUCH_EYE_HEIGHT : (this.riding ? RIDE_EYE_HEIGHT : EYE_HEIGHT);
    this.crouching = false;
    this.sunk = true;
    this._camTo = this.riding ? SWIM_RIDE_EYE_HEIGHT : SWIM_EYE_HEIGHT;
    this.heightAction = 'sink';
    this.heightTimerMax = HEIGHT_TIMER_SLOW;
  }

  _beginUnsink() {
    this._camFrom = this.riding ? SWIM_RIDE_EYE_HEIGHT : SWIM_EYE_HEIGHT;
    this.sunk = false;
    this.crouching = false;
    this._camTo = this.riding ? RIDE_EYE_HEIGHT : EYE_HEIGHT + this.standingHeightAdjustment / 2;
    this.heightAction = 'unsink';
    this.heightTimerMax = HEIGHT_TIMER_SLOW;
  }

  forceUnsink() {
    if (this.heightAction === 'unsink') return;
    if (this.sunk) this._beginUnsink();
  }
  forceStand() { this.heightAction = 'stand'; }
  get isInWaterTile() { return this.sunk; }

  _heightReset() {
    this.heightAction = null;
    this.heightTimer = 0;
    this.heightTimerMax = HEIGHT_TIMER_FAST;
  }

  _captureSpeedAdjustment(input) {
    if (!this._toggleRun) this._runMode = !!input.run;
    else if (this._runStarted) this._runMode = !this._runMode;
    if (getBool('Controls', 'ToggleSneak')) {
      if (this._sneakStarted) this._sneakMode = !this._sneakMode;
    } else {
      this._sneakMode = !!input.sneak;
    }
    const autoRunStarted = this._autoRunStarted;
    const backHeld = !!input.back;
    if (autoRunStarted && !backHeld) {
      this._autorun = !this._autorun;
      this._toggleRun = this._autorun;
      if (this._toggleRun && !this.isRunning) this._runMode = !this._runMode;
    }
    if (this._backStarted) this._toggleRun = false;
  }

  _captureInputActions(input) {
    this._autoRunStarted = !!input.autoRun && !this._prevAutoRunHeld;
    this._prevAutoRunHeld = !!input.autoRun;
    this._runStarted = !!input.run && !this._prevRunHeld;
    this._prevRunHeld = !!input.run;
    this._sneakStarted = !!input.sneak && !this._prevSneakHeld;
    this._prevSneakHeld = !!input.sneak;
    const backHeld = !!input.back;
    this._backStarted = backHeld && !this._prevBackHeld;
    this._prevBackHeld = backHeld;
    if (backHeld) this._autorun = false;
  }

  update(dt, input, yaw, pitch = 0) {
    this.jumped = false;
    this.parkoured = null;
    if (this.climbEvents.length) this.climbEvents = [];
    this.landedFallDistance = 0;
    // MAX_FRAME_DT bounds the real frame before the time scale applies, as Unity's maximumDeltaTime does.
    const scale = timeScale();
    const frameDt = Math.min(dt, MAX_FRAME_DT) * scale;
    this._captureInputActions(input);
    this._heightAction(frameDt, input);
    if (!this.levitating) this._captureSpeedAdjustment(input);
    // The step scales with the clock, so an accelerated journey runs longer steps rather than more of them.
    const step = FIXED_DT * scale;
    this._acc = (this._acc ?? 0) + frameDt;
    if (this._acc >= step) this._spanStep = step;
    const moveInput = this._downLeft > 0 ? { ...input, forward: 0, strafe: 0, back: false, jump: false, autoRun: false, up: false, down: false } : input;
    while (this._acc >= step) {
      this._acc -= step;
      if (this._rattleLeft > 0) this._rattleLeft = Math.max(0, this._rattleLeft - step);
      if (this._downLeft > 0) this._downLeft = Math.max(0, this._downLeft - step);
      this._prevPos[0] = this.pos[0]; this._prevPos[1] = this.pos[1]; this._prevPos[2] = this.pos[2];
      this._travelPrev[0] = this.travel[0]; this._travelPrev[1] = this.travel[1]; this._travelPrev[2] = this.travel[2];
      this._step(step, moveInput, yaw, pitch);
      this._pushStep(step);
      if (this.arena) this._keepInArena();
      keepOffBodies(this, CAPSULE_RADIUS);
      this._countOdometer(step);
    }
    this._alpha = Math.min(1, this._acc / step);
    this._smoothEyeFeet(frameDt);
    this._stepBodyYaw(frameDt, yaw);
  }

  _stepBodyYaw(dt, viewYaw) {
    const face = this.climbFacing;
    if (face == null && this._bodyYaw == null && this._bodyYawOff == null) return;
    const k = 1 - Math.exp(-Math.max(0, dt) / BODY_TURN_TAU);
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    if (face != null) {
      const from = this._bodyYaw ?? viewYaw + (this._bodyYawOff ?? 0);
      this._bodyYaw = from + wrap(face - from) * k;
      this._bodyYawOff = null;
      return;
    }
    if (this._bodyYaw != null) { this._bodyYawOff = wrap(this._bodyYaw - viewYaw); this._bodyYaw = null; }
    const off = this._bodyYawOff * (1 - k);
    this._bodyYawOff = Math.abs(off) < 1e-3 ? null : off;
  }

  _smoothEyeFeet(frameDt) {
    const raw = this._prevPos[1] + (this.pos[1] - this._prevPos[1]) * this._alpha;
    if (!this._eyeSmoothing || this.jumping || this.falling || this._pkMove || this._wall || this._eyeFeetY == null) { this._eyeFeetY = raw; return; }
    const k = 1 - Math.exp(-frameDt / STEP_SMOOTH_TAU);
    let y = this._eyeFeetY + (raw - this._eyeFeetY) * k;
    if (y - raw > STEP_OFFSET) y = raw + STEP_OFFSET;
    else if (raw - y > STEP_OFFSET) y = raw - STEP_OFFSET;
    this._eyeFeetY = y;
  }

  _climbWallProbe(yaw) {
    if (!this.collider.raycastHit) return { touching: false, wallDir: null };
    const dir = this._climbWallDir ?? [Math.sin(yaw), 0, Math.cos(yaw)];
    const reach = CLIMB_SIDE_REACH;
    for (const y of [this.height * 0.4, this.height * 0.8, CAPSULE_RADIUS, CLIMB_CAP_LOW]) {
      const o = [this.pos[0], this.pos[1] + y, this.pos[2]];
      const h = this.collider.raycastHit(o, dir, reach);
      if (Number.isFinite(h.dist)) {
        if (h.normal) {
          const nx = -h.normal[0], nz = -h.normal[2];
          const l = Math.hypot(nx, nz);
          if (l > 1e-4) this._climbWallDir = [nx / l, 0, nz / l];
        }
        return { touching: true, wallDir: this._climbWallDir ?? dir };
      }
    }
    if (!this.climb.isClimbing) this._climbWallDir = null;
    return { touching: false, wallDir: null };
  }

  _groundNear() {
    const o = [this.pos[0], this.pos[1] + this.height / 2, this.pos[2]], down = [0, -1, 0], d = this.height / 2 + CLIMB_GROUND_NEAR;
    return Number.isFinite(this.collider.surfaceHit ? this.collider.surfaceHit(o, down, d).dist : this.collider.raycast(o, down, d));
  }

  _climbStep(dt, input, yaw) {
    const climb = this.climb;
    if (!climb) return false;
    const forward = input.forward > 0;
    const probe = (climb.isClimbing || forward || this.falling)
      ? this._climbWallProbe(yaw) : { touching: false, wallDir: null };
    const climbing = climb.step(dt, {
      forward,
      back: input.forward < 0,
      anyMove: input.forward !== 0 || input.strafe !== 0,
      falling: this.falling,
      slowFalling: this.slowFalling,
      grounded: this.grounded,
      levitating: this.levitating,
      riding: isRiding(this.transportMode),
      travelling: !!this.travelling?.(),
      touchingSides: probe.touching,
      horizontalPos: [this.pos[0], this.pos[2]],
      tooCloseToGround: () => this._groundNear(),
    });
    if (!climbing) return false;
    this._airVelX = 0;
    this._airVelZ = 0;
    this.jumping = false;
    if (!climb.isSlipping) {
      this.falling = false;
      this.fallStart = this.pos[1];
      this.velY = 0;
      const wd = probe.wallDir ?? [Math.sin(yaw), 0, Math.cos(yaw)];
      const ci = climb.deps?.inputs?.() ?? {};
      const r = this.collider.move(this.pos,
        wd[0] * this.speed * dt, climbingSpeed(this.speed, !!ci.enhanced, ci.climbing ?? 0) * (this.stats.racialPace?.('climb', this) ?? 1) * dt, wd[2] * this.speed * dt,
        this.height, false);
      this.grounded = r.grounded;
    } else {
      if (!this.falling) { this.falling = true; this.fallStart = this.pos[1]; this.velY = 0; }
      if (this.slowFalling) { this.fallStart = this.pos[1]; this.velY = -SLOWFALL_VELOCITY; }
      else this.velY -= GRAVITY * dt;
      const r = this.collider.move(this.pos, 0, this.velY * dt, 0, this.height);
      this.grounded = r.grounded;
      if (r.grounded) this.velY = 0;
    }
    this.standing = this.grounded;
    this.movingLessThanHalfSpeed = this.grounded
      ? true
      : this._halfSpeedBase() / 2 >= this.speed;
    return true;
  }

  get mantling() { return !!this._pkMove; }

  get onWall() { return !!this._wall; }
  get holdPending() { return !!this._pkRestore; }
  get climbMove() { return this._pkMove; }
  climbTrackPos() {
    const f = this.bodyFeetAt();
    return [f[0] - this._climbCarried[0], f[1] - this._climbCarried[1], f[2] - this._climbCarried[2]];
  }
  get wallNormal() { return this._wall?.normal ?? null; }
  get climbHold() { return this._wall ? { mode: this._wall.mode, lipY: this._wall.lipY } : null; }
  get climbFlight() { return this._pkLeap; }
  get climbFacing() {
    const m = this._pkMove;
    const n = this._wall?.normal ?? m?.hang?.normal ?? m?.wall?.normal ?? null;
    if (n) return Math.atan2(-n[0], -n[2]);
    if (!m) {
      const d = this.climb?.isClimbing ? this._climbWallDir : null;
      return d ? Math.atan2(d[0], d[2]) : null;
    }
    const dx = m.to[0] - m.from[0], dz = m.to[2] - m.from[2];
    return dx * dx + dz * dz > 1e-6 ? Math.atan2(dx, dz) : null;
  }
  bodyYawFor(viewYaw) { return this.drawYaw ?? this._bodyYaw ?? (this._bodyYawOff == null ? viewYaw : viewYaw + this._bodyYawOff); }
  get hanging() { return this._wall?.mode === 'hang'; }
  get gripShown() { return this._wall || this.grip < 1 ? { amount: this.grip, low: this.grip <= PARKOUR_GRIP_LOW } : null; }

  _parkourStep(dt, input, yaw) {
    const pk = this.parkour;
    this._pkOn = false;
    this._pkLookNow = [Math.sin(yaw), 0, Math.cos(yaw)];
    const was = this._pkLastPos;
    this._pkPace = was && dt > 0 ? Math.hypot(this.pos[0] - was[0], this.pos[2] - was[2]) / dt : 0;
    this._pkLastPos = [this.pos[0], this.pos[1], this.pos[2]];
    if (!pk) return false;
    const pressed = !!input.jump && !this._pkJumpWas;
    this._pkJumpWas = !!input.jump;
    if (pressed) this._pkArm = { t: 0, air: !this.grounded };
    else if (this._pkArm) {
      const a = this._pkArm;
      a.t += dt;
      if (!this.grounded) a.air = true;
      else if (a.air || a.t > PARKOUR_ARM_GRACE_S) this._pkArm = null;
    }
    if (!input.jump) { this._pkJumpLatch = false; if (!this._pkArm) this._pkSaid = false; }
    if (this._pkMove) { this._pkOn = true; this._parkourAdvance(dt); return true; }
    if (this.grounded) {
      this._pkOffEdge = this.isRunning && input.forward > 0 && !this.crouching && this._pkAtPace()
        ? { t: 0, dir: [Math.sin(yaw), 0, Math.cos(yaw)], at: [this.pos[0], this.pos[1], this.pos[2]], ok: null } : null;
    } else if (this._pkOffEdge != null) {
      const o = this._pkOffEdge;
      if (o.ok == null) o.ok = !this.jumping && senseDrop(this.collider, o.at, o.dir, CAPSULE_RADIUS, PARKOUR_RUNLEAP_EDGE);
      if (!o.ok || this.jumping || (o.t += dt) > PARKOUR_COYOTE_S) this._pkOffEdge = null;
    }
    if (this.grounded || this.swimming || this.sunk || this._wall) this._pkLeap = null;
    const on = this._pkOn = !!pk.enabled?.();
    const unheld = this.levitating || this.riding || this.paralyzed || !!this.travelling?.();
    if (this._pkRestore) {
      const r = this._pkRestore;
      this._pkRestore = null;
      if (on && !unheld && !this._wall) this._pkRetake(r);
    }
    if (this._wall) {
      if (!on || unheld) { this._wallEnd(); return false; }
      return this._wallStep(dt, input, yaw, pk);
    }
    this._pkDropReq = false;
    if ((this.grounded || this.swimming || this.sunk) && this.grip < 1) this.grip = Math.min(1, this.grip + dt / PARKOUR_GRIP_REGEN_S);
    if (on && this.climb) this.climb.wasClimbing = !!this._pkLeftWall;
    this._pkLeftWall = false;
    if (!on) return false;
    if (this.climb?.isClimbing) this.climb.stop();
    if (unheld) { this._fcStart = null; return false; }
    let mode = null;
    if (!this.swimming && !this.sunk && (input.jump || this._pkArm) && !this._pkJumpLatch) {
      if (!this.grounded) mode = 'air';
      else if (input.jump && (this.climb?.wasClimbing || this.groundedTime >= GROUNDED_JUMP_GATE_S)) mode = 'ground';
    }
    if (!mode) return this._pkLowerStart(dt, input, yaw, pk) || this._freeStart(dt, input, yaw, pk);
    this._fcStart = null;
    const air = mode === 'air';
    if (air && pressed && this._pkOffEdge != null && this._pkMayLeap()) {
      const dir = this._pkOffEdge.dir;
      this._pkLaunch(dir, ...this._pkRunLeapSpeeds(pk, dir));
      return false;
    }
    if (air && this._pkQuiet > 0) { this._pkQuiet--; return false; }
    const inputs = pk.inputs?.() ?? {};
    const skill = parkourSkill(inputs);
    if (air && ((this.falling && this.fallStart - this.pos[1] > parkourCatchHold(skill)) || this.grip < PARKOUR_GRIP_MIN)) return false;
    const leap = air ? this._pkLeap : null;
    const geo = this._pkGeo(air ? PARKOUR_AIR_LOW : STEP_OFFSET, parkourReach(skill, inputs.load ?? 0) + (air ? PARKOUR_AIR_REACH : 0) + (leap ? PARKOUR_LEAP_REACH : 0), !air);
    const look = leap ? [...leap.dir] : [Math.sin(yaw), 0, Math.cos(yaw)];
    const fwd = input.forward > 0;
    const ledge = senseLedge(this.collider, this.pos, look, geo);
    const tapOnly = air && !input.jump;
    let move = null;
    if (ledge.ok && !(tapOnly && ledge.rise < PARKOUR_HANG_LOW)) {
      if (!air && fwd) {
        const vault = senseVault(this.collider, this.pos, ledge, geo);
        if (vault) move = planVault(this.pos, ledge, vault, jumpingSkill(inputs), this.speed);
      }
      const high = air && ledge.rise >= PARKOUR_HANG_LOW;
      if (!move && !(high && !fwd)) move = this._pkOnto(ledge, geo, skill);
      if (!move && high) move = this._pkCatch(ledge);
      if (!move && high && !fwd) move = this._pkOnto(ledge, geo, skill);
      if (!move && !air) {
        const oh = senseOverHang(this.collider, this.pos, ledge, geo);
        if (oh) move = planOverHang(this.pos, ledge, oh, skill);
        if (!move && fwd && ledge.rise > PARKOUR_VAULT_MAX) {
          const over = senseOver(this.collider, this.pos, ledge, geo, PARKOUR_HANG_DROP + PARKOUR_VAULT_CLEAR);
          if (over && over.floorY < ledge.lipY - PARKOUR_OVER_DROP) move = planClamber(this.pos, ledge, over, skill);
        }
      }
    }
    if (!move && air && !ledge.ok && !this.crouching) {
      const g = senseEaveAhead(this.collider, this.pos, look, geo);
      if (g && g.lipY - this.pos[1] >= PARKOUR_HANG_LOW && catchClear(this.collider, this.pos, g, CAPSULE_HEIGHT)) move = planCatch(this.pos, g);
    }
    if (!move && air && fwd && !tapOnly && this._pkGrab(look, pk)) return true;
    if (!move && !air && fwd && this.isRunning && !this.crouching && this._pkAtPace()) {
      const run = senseWallRun(this.collider, this.pos, look, wallRunHeight(skill, inputs.jumping ?? 0), geo.high + PARKOUR_AIR_REACH, geo);
      if (run) move = planWallRun(this.pos, run);
      else if (this._pkMayLeap() && senseDrop(this.collider, this.pos, look, CAPSULE_RADIUS, PARKOUR_RUNLEAP_EDGE)) {
        this._pkLaunch(look, ...this._pkRunLeapSpeeds(pk, look));
        return false;
      }
    }
    if (!move) {
      if (ledge.ok && air) this._pkQuiet = PARKOUR_QUIET_STEPS;
      return false;
    }
    const refusal = move.kind === 'vault' ? null : parkourRefusal();
    if (refusal) {
      if (!this._pkSaid) { pk.say?.(refusal); this._pkSaid = true; }
      if (air) this._pkQuiet = PARKOUR_QUIET_STEPS;
      return false;
    }
    this._parkourBegin(move);
    this._parkourAdvance(dt);
    return true;
  }

  _pkRetake(r) {
    if (r.mode === 'hang' && r.lipAbove != null) {
      const g = senseGrip(this.collider, this._pkFaceOf(r.normal), r.normal, this.pos[1] + r.lipAbove, this._pkGeo());
      if (g) { this._wallBegin('hang', g.normal, g.lipY, g.key); this._pkHangAt(g); }
      return;
    }
    const c = wallContact(this.collider, this.pos, [-r.normal[0], 0, -r.normal[2]], this.height, CAPSULE_RADIUS, PARKOUR_WALL_REACH);
    if (!c) return;
    this._wallBegin('climb', c.normal, null, c.key);
    this._wall.seek = true;
  }

  _pkGeo(low = 0, high = 0, footing = false) {
    return { low, high, radius: CAPSULE_RADIUS, stand: CAPSULE_HEIGHT, crouch: CROUCH_HEIGHT, height: this.height, footing };
  }

  _pkUnsink() {
    if (!this.sunk) return;
    this._beginUnsink();
    this.toggleSink = false;
  }

  _pkOnto(ledge, geo, skill) {
    if (ledge.mantle) return planMantle(this.pos, ledge, skill);
    const over = senseOver(this.collider, this.pos, ledge, geo, PARKOUR_OVER_DROP);
    return over ? planClamber(this.pos, ledge, over, skill) : null;
  }

  _pkCatch(ledge) {
    if (this.crouching) return null;
    const grip = senseGrip(this.collider, ledge.face, ledge.normal, ledge.lipY, this._pkGeo());
    if (!grip || !catchClear(this.collider, this.pos, grip, CAPSULE_HEIGHT)) return null;
    return planCatch(this.pos, grip);
  }

  _pkGrab(look, pk) {
    if (this.crouching) return false;
    const c = wallContact(this.collider, this.pos, look, this.height, CAPSULE_RADIUS);
    if (!c) return false;
    const refusal = parkourRefusal();
    if (refusal) {
      if (!this._pkSaid) { pk.say?.(refusal); this._pkSaid = true; }
      this._pkQuiet = PARKOUR_QUIET_STEPS;
      return false;
    }
    this._pkJumpLatch = true;
    this.parkoured = this.parkoured ? [].concat(this.parkoured, 'catch') : 'catch';
    this._wallBegin('climb', c.normal, null, c.key);
    return true;
  }

  _pkLowerStart(dt, input, yaw, pk) {
    const f = input.forward || 0, st = input.strafe || 0;
    if (!this.grounded || !(this.crouching || this.heightAction === 'crouch') || this.swimming || this.sunk || this.grip < PARKOUR_GRIP_MIN || (!f && !st)) {
      this._pkEdgeSaid = false;
      return false;
    }
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    const dx = sin * f + cos * st, dz = cos * f - sin * st, l = Math.hypot(dx, dz);
    const edge = senseEdge(this.collider, this.pos, [dx / l, 0, dz / l], this._pkGeo());
    if (!edge) { this._pkEdgeSaid = false; return false; }
    const refusal = parkourRefusal();
    if (refusal) {
      if (!this._pkEdgeSaid) { pk.say?.(refusal); this._pkEdgeSaid = true; }
      this.moveForward = 0;
      this.moveStrafe = 0;
      this.moveSpeed = 0;
      this.standing = true;
      this.movingLessThanHalfSpeed = true;
      return true;
    }
    this._parkourBegin(planLower(this.pos, edge.grip, parkourSkill(pk.inputs?.() ?? {})));
    this._parkourAdvance(dt);
    return true;
  }

  _freeStart(dt, input, yaw, pk) {
    if (!(input.forward > 0) || !(this.grounded || this.swimming || this.sunk)) { this._fcStart = null; return false; }
    if (pk.hold?.()) { this._fcStart = null; return false; }
    const s = this._fcStart;
    if (!s || Math.hypot(this.pos[0] - s.x, this.pos[2] - s.z) >= START_CLIMB_HORIZONTAL_TOLERANCE) {
      this._fcStart = { x: this.pos[0], z: this.pos[2], t: 0 };
      return false;
    }
    s.t += dt;
    if (s.t < freeStartSeconds(parkourSkill(pk.inputs?.() ?? {})) || this.grip < PARKOUR_GRIP_MIN) return false;
    const c = wallContact(this.collider, this.pos, [Math.sin(yaw), 0, Math.cos(yaw)], this.height, CAPSULE_RADIUS);
    if (!c) return false;
    if (this.crouching ? !capsuleFits(this.collider, this.pos, CAPSULE_HEIGHT) : !bandsClear(this.collider, this.pos, this.height)) return false;
    const refusal = parkourRefusal();
    if (refusal) {
      pk.say?.(refusal);
      s.t = -Infinity;
      return false;
    }
    this._wallBegin('climb', c.normal, null, c.key);
    if (input.jump) this._pkJumpLatch = true;
    return true;
  }

  _wallBegin(mode, normal, lipY, key) {
    this._pkUnsink();
    this._wall = { mode, normal: [normal[0], 0, normal[2]], lipY, key: key ?? null, carrier: null, warned: false, upRefused: false, look: this._pkLookNow ?? null };
    this.techFlight = false;
    this._pkSide = null;
    if (key != null) this._wall.carrier = this.collider.bucketPose?.(key) ?? null;
    this._wallTally = 0;
    this._fcStart = null;
    this._pkOffEdge = null;
    this.climb?.hold();
    this._pkHold();
    this._pkEmit('hold', { mode, normal: [normal[0], 0, normal[2]] });
  }

  _pkHold() {
    this.isRunning = false;
    this.velY = 0;
    this._airVelX = 0;
    this._airVelZ = 0;
    this.jumping = false;
    this.falling = false;
    this.fallStart = this.pos[1];
    this.grounded = false;
    this.groundKey = null;
    this.moveForward = 0;
    this.moveStrafe = 0;
    this.moveSpeed = 0;
  }

  _wallEnd() {
    if (this._wall) this._pkEmit('release', { mode: this._wall.mode, normal: [...this._wall.normal] });
    this._wall = null;
    this._pkArm = null;
    this._pkDropReq = false;
    this._pkLeftWall = true;
    this._pkJumpLatch = true;
    this.climb?.stop();
  }

  _wallStep(dt, input, yaw, pk) {
    const w = this._wall;
    if (this.climb) this.climb.wasClimbing = true;
    if (w.carrier) {
      const now = this.collider.bucketPose(w.key);
      if (now) {
        const x0 = this.pos[0], y0 = this.pos[1], z0 = this.pos[2];
        carryHold(this.pos, w, w.carrier, now); w.carrier = now;
        this._climbCarried[0] += this.pos[0] - x0; this._climbCarried[1] += this.pos[1] - y0; this._climbCarried[2] += this.pos[2] - z0;
      }
    }
    const refusal = parkourRefusal();
    if (refusal || this._pkDropReq) {
      if (refusal && !this._pkSaid) { pk.say?.(refusal); this._pkSaid = true; }
      this._wallEnd();
      return false;
    }
    const inputs = pk.inputs?.() ?? {};
    const skill = parkourSkill(inputs);
    const n = w.normal;
    const key = Math.sign(input.strafe || 0);
    if (!key) this._pkSide = null;
    else if (this._pkSide?.key !== key) {
      const along = Math.cos(yaw) * -n[2] - Math.sin(yaw) * n[0];
      this._pkSide = { key, s: Math.abs(along) < 0.2 ? 1 : Math.sign(along) };
    }
    const side = key ? (input.strafe || 0) * this._pkSide.s : 0;
    const vert = input.forward || 0;
    const rate = w.mode === 'climb' && !side && !vert ? PARKOUR_GRIP_REST : 1;
    this.grip -= (rate * dt) / gripSeconds(skill, inputs.fatigue ?? 1);
    if (this.grip <= 0) { this.grip = 0; this._wallEnd(); return false; }
    if (!w.warned && this.grip <= PARKOUR_GRIP_LOW) { w.warned = true; pk.say?.(PARKOUR_GRIP_LOW_TEXT); this._pkEmit('gripLow'); }
    this._wallTick(dt);
    const owned = w.mode === 'hang' ? this._hangStep(dt, input, side, vert, skill, inputs.climbing ?? 0)
      : this._freeClimbStep(dt, side, vert, skill, { ...inputs, jumpPressed: !!input.jump && !this._pkJumpLatch });
    if (this._wall) this._pkHold();
    this.standing = this.grounded;
    this.movingLessThanHalfSpeed = this.grounded ? true : this._halfSpeedBase() / 2 >= this.speed;
    return owned;
  }

  _wallTick(dt) {
    this._wallTally += dt;
    if (this._wallTally > SYSTEM_TIMER_UPDATES_DIVISOR * CONTINUE_CLIMBING_SKILL_CHECK_FREQUENCY) { this._wallTally = 0; this.parkour?.tally?.(); }
  }

  _pkTurned(hit, n, t, sign) {
    if (!Number.isFinite(hit.dist) || !hit.normal) return null;
    const l = Math.hypot(hit.normal[0], hit.normal[2]);
    if (l < 1e-4) return null;
    const n2 = [hit.normal[0] / l, 0, hit.normal[2] / l];
    if (n2[0] * n[0] + n2[2] * n[2] >= PARKOUR_FACE_FOLLOW) return null;
    return sign * (n2[0] * t[0] + n2[2] * t[2]) > 0 ? n2 : null;
  }

  _pkFaceOf(n) {
    const back = CAPSULE_RADIUS + PARKOUR_HANG_GAP;
    return [this.pos[0] - n[0] * back, 0, this.pos[2] - n[2] * back];
  }

  _pkHangAt(g) {
    const w = this._wall;
    this.pos[0] = g.feet[0]; this.pos[1] = g.feet[1]; this.pos[2] = g.feet[2];
    w.normal = g.normal;
    w.lipY = g.lipY;
    if (g.key !== w.key) { w.key = g.key; w.carrier = g.key != null ? (this.collider.bucketPose?.(g.key) ?? null) : null; }
  }

  _hangStep(dt, input, side, vert, skill, live = 0) {
    const w = this._wall;
    const geo = this._pkGeo();
    const hold = senseGrip(this.collider, this._pkFaceOf(w.normal), w.normal, w.lipY, geo);
    if (!hold) { this._wallEnd(); return false; }
    const jump = input.jump && !this._pkJumpLatch;
    if (jump && (vert < 0 || side)) {
      this._pkJumpLatch = true;
      return this._pkLeapFrom(dt, vert < 0 ? 'back' : 'side', Math.sign(side)) || this._pkLeapFrom(dt, 'back', 0) || true;
    }
    if (vert <= 0) w.upRefused = false;
    if (jump || (vert > 0 && !w.upRefused)) {
      if (jump) this._pkJumpLatch = true;
      const dir = [-w.normal[0], 0, -w.normal[2]];
      const ledge = senseLedge(this.collider, this.pos, dir, this._pkGeo(PARKOUR_HANG_DROP - 0.3, PARKOUR_HANG_DROP + 0.2));
      let move = ledge.ok ? this._pkOnto(ledge, geo, skill) : null;
      if (!move && hold.eave) {
        const el = senseEaveLedge(this.collider, this.pos, hold, geo);
        if (el.mantle) move = planMantle(this.pos, el, skill);
      }
      if (move) {
        this._wallEnd();
        this._parkourBegin(move);
        this._parkourAdvance(dt);
        return true;
      }
      if (jump && this._pkLeapFrom(dt, 'up', 0)) return true;
      if (vert > 0 && this._pkWallAbove(w)) {
        w.mode = 'climb';
        w.past = w.lipY;
        w.lipY = null;
        w.seek = true;
        return true;
      }
      if (jump && this._pkLeapFrom(dt, 'back', 0)) return true;
      w.upRefused = vert > 0;
    } else if (vert < 0) {
      w.mode = 'climb';
      w.lipY = null;
      w.seek = true;
      return true;
    }
    if (!side) w.cornerRefused = 0;
    else if (this._pkShimmy(dt, side, skill, geo, live)) { if (this._wall) w.upRefused = false; }
    return true;
  }

  _pkWallAbove(w) {
    const n = w.normal, at = [this.pos[0], w.lipY + PARKOUR_LIP_FOLLOW, this.pos[2]];
    return !!wallContact(this.collider, at, [-n[0], 0, -n[2]], CAPSULE_HEIGHT, CAPSULE_RADIUS, PARKOUR_WALL_REACH);
  }

  _pkHeld() {
    const w = this._wall, face = this._pkFaceOf(w.normal);
    const lipY = w.mode === 'hang' && w.lipY != null ? w.lipY : this.pos[1] + PARKOUR_HANG_DROP;
    return { face: [face[0], lipY, face[2]], normal: w.normal, lipY, feet: [this.pos[0], this.pos[1], this.pos[2]] };
  }

  _pkLeapFrom(dt, way, side) {
    if (this.grip < PARKOUR_GRIP_MIN + PARKOUR_LEAP_GRIP) return false;
    const j = jumpingSkill(this.parkour?.inputs?.() ?? {});
    if (way === 'back') return this._pkEject(j);
    const g = senseLeapHold(this.collider, this.pos, this._pkHeld(), way, way === 'up' ? leapUpReach(j) : leapSideReach(j), this._pkGeo(), side);
    if (!g) return false;
    this.grip -= PARKOUR_LEAP_GRIP;
    this._parkourBegin(planLeap(this.pos, g, j));
    this._parkourAdvance(dt, true);
    return true;
  }

  _pkEmit(type, data = null) {
    this.climbEvents.push(data ? { type, ...data } : { type });
  }
  _pkMoveEvent(move, speed) {
    this._pkEmit('move', {
      kind: move.kind, dur: move.dur, rise: move.to[1] - move.from[1], split: move.split ?? 0.5, speed, turn: move.turn ?? 0,
      way: [move.to[0] - move.from[0], move.to[2] - move.from[2]], normal: move.hang ? [...move.hang.normal] : move.wall ? [...move.wall.normal] : null,
    });
  }

  _pkRunLeapSpeeds(pk, dir) {
    const { along, up } = runLeapLaunch(jumpingSkill(pk.inputs?.() ?? {}), GRAVITY);
    const run = dir ? this._airVelX * dir[0] + this._airVelZ * dir[2] : 0;
    const boost = this.jumpBoost ? this.jumpBoost() : 1;
    return [Math.max(along, run + JUMP_SPEED * JUMP_FWD_BOOST), Math.max(up, JUMP_SPEED * boost)];
  }

  _pkAtPace() { return (this._pkPace ?? 0) > 1e-3 && this._pkPace >= PARKOUR_RUN_SHARE * this.speed - 1e-6; }

  _pkMayLeap() { return !this.slowFalling && !this.onExteriorWater && this.parkour?.leap?.() !== false; }

  _pkEject(jumping) {
    const n = this._wall.normal, { out, up } = ejectLaunch(jumping);
    this.grip = Math.max(0, this.grip - PARKOUR_LEAP_GRIP);
    this._wallEnd();
    this._pkLaunch([n[0], 0, n[2]], out, up);
    this._pkQuiet = PARKOUR_QUIET_STEPS;
    return true;
  }

  _pkLaunch(dir, along, up) {
    this._pkEmit('launch', { dir: [dir[0], 0, dir[2]], along, up });
    this.velY = up;
    this._airVelX = dir[0] * along;
    this._airVelZ = dir[2] * along;
    this.grounded = false;
    this.groundedTime = 0;
    this.groundKey = null;
    this.jumping = true;
    this.falling = false;
    this.fallStart = this.pos[1];
    this.parkoured = this.parkoured ? [].concat(this.parkoured, 'leap') : 'leap';
    this._pkLeap = { dir: [dir[0], 0, dir[2]] };
    this._pkArm = { t: 0, air: true };
    this._pkJumpLatch = false;
    this._pkOffEdge = null;
  }

  _pkShimmy(dt, side, skill, geo, live = 0) {
    const w = this._wall, n = w.normal;
    const s = Math.sign(side);
    if (w.cornerRefused === s) return false;
    const tx = -n[2] * s, tz = n[0] * s;
    const d = shimmySpeed(skill, live) * dt * Math.min(1, Math.abs(side));
    const face = this._pkFaceOf(n);
    const reach = d + PARKOUR_HAND_SPAN;
    const at = senseGrip(this.collider, [face[0] + tx * d, 0, face[2] + tz * d], n, w.lipY, geo);
    let lead = at;
    for (let k = 0; k < 2 && lead; k++) {
      const ln = lead.normal, h = PARKOUR_HAND_SPAN / 2;
      lead = senseGrip(this.collider, [lead.face[0] - ln[2] * s * h, 0, lead.face[2] + ln[0] * s * h], ln, lead.lipY, geo, false);
    }
    const g = lead ? at : null;
    if (g) { this._pkHangAt(g); w.cornerRefused = 0; return true; }
    const move = this._pkCorner(s, reach, skill, geo, live);
    if (!move) { w.cornerRefused = s; return false; }
    this._parkourBegin(move);
    return true;
  }

  _pkCorner(s, reach, skill, geo, live = 0) {
    const w = this._wall, n = w.normal;
    const t = [-n[2] * s, 0, n[0] * s];
    const back = CAPSULE_RADIUS + PARKOUR_HANG_GAP;
    const y = w.lipY - 0.3;
    const face = this._pkFaceOf(n);
    let grip = null, mid = null;
    const ahead = this.collider.raycastHit([this.pos[0], y, this.pos[2]], t, back + PARKOUR_HAND_SPAN + back / Math.tan(Math.acos(PARKOUR_FACE_FOLLOW)));
    const across = this._pkTurned(ahead, n, t, -1);
    const apex = across ? ahead.dist - (back * (across[0] * n[0] + across[2] * n[2])) / -(across[0] * t[0] + across[2] * t[2]) : Infinity;
    if (across && apex <= back + PARKOUR_HAND_SPAN) {
      const n2 = across;
      const hx = this.pos[0] + t[0] * ahead.dist, hz = this.pos[2] + t[2] * ahead.dist;
      grip = senseGrip(this.collider, [hx + n[0] * PARKOUR_CORNER_OFF, 0, hz + n[2] * PARKOUR_CORNER_OFF], n2, w.lipY, geo);
      if (grip) mid = [(this.pos[0] + grip.feet[0]) / 2, (this.pos[1] + grip.feet[1]) / 2, (this.pos[2] + grip.feet[2]) / 2];
    } else {
      let a = 0, b = reach;
      for (let i = 0; i < 5; i++) {
        const m = (a + b) / 2;
        if (senseGrip(this.collider, [face[0] + t[0] * m, 0, face[2] + t[2] * m], n, w.lipY, geo, false)) a = m; else b = m;
      }
      const c = (a + b) / 2;
      const ex = face[0] + t[0] * c, ez = face[2] + t[2] * c;
      const px = ex + t[0] * PARKOUR_CORNER_PROBE + n[0] * back, pz = ez + t[2] * PARKOUR_CORNER_PROBE + n[2] * back;
      const n2 = this._pkTurned(this.collider.raycastHit([px, y, pz], [-n[0], 0, -n[2]], back + PARKOUR_HAND_SPAN), n, t, 1) ?? t;
      const along = n2[0] * n[0] + n2[2] * n[2], out = n2[0] * t[0] + n2[2] * t[2];
      const dx = t[0] * along - n[0] * out, dz = t[2] * along - n[2] * out;
      grip = senseGrip(this.collider, [ex + dx * PARKOUR_CORNER_IN, 0, ez + dz * PARKOUR_CORNER_IN], n2, w.lipY, geo);
      const bx = n[0] + n2[0], bz = n[2] + n2[2], bl = Math.hypot(bx, bz) || 1, r = back + PARKOUR_CORNER_CLEAR;
      if (grip) mid = [ex + (bx / bl) * r, (this.pos[1] + grip.feet[1]) / 2, ez + (bz / bl) * r];
    }
    if (!grip) return null;
    const move = planCorner(this.pos, mid, grip, skill, live);
    move.turn = Math.atan2(n[2] * grip.normal[0] - n[0] * grip.normal[2], n[0] * grip.normal[0] + n[2] * grip.normal[2]);
    return moveClear(this.collider, move, CAPSULE_HEIGHT) ? move : null;
  }

  _freeClimbStep(dt, side, vert, skill, inputs) {
    const w = this._wall;
    w.down = vert < 0;
    const reach = w.seek || w.past != null || w.down ? PARKOUR_WALL_REACH : PARKOUR_CONTACT;
    const c = wallContact(this.collider, this.pos, [-w.normal[0], 0, -w.normal[2]], this.height, CAPSULE_RADIUS, reach);
    if (!c) { this._wallEnd(); return false; }
    if (w.seek && c.dist <= CAPSULE_RADIUS + PARKOUR_CONTACT) w.seek = false;
    if (vert <= 0 && this._groundNear()) {
      this._wallEnd();
      return false;
    }
    const into = [-w.normal[0], 0, -w.normal[2]];
    const turnsTo = c.normal[0] * w.normal[0] + c.normal[2] * w.normal[2] < PARKOUR_TURN_HOLDS
      && !wallContact(this.collider, this.pos, [-c.normal[0], 0, -c.normal[2]], this.height, CAPSULE_RADIUS, reach) ? null : c.normal;
    w.normal = turnsTo ?? w.normal;
    w.gap = c.dist - CAPSULE_RADIUS;
    if (c.key !== w.key) { w.key = c.key; w.carrier = c.key != null ? (this.collider.bucketPose?.(c.key) ?? null) : null; }
    if (inputs.jumpPressed) {
      this._pkJumpLatch = true;
      if (vert >= 0 && !side && this._fcTopOut(dt, skill, inputs, into, true)) return true;
      if (this._pkLeapFrom(dt, vert < 0 ? 'back' : side ? 'side' : 'up', Math.sign(side))) return true;
      if (vert >= 0 && this._pkLeapFrom(dt, 'back', 0)) return true;
    }
    if (vert > 0) {
      if (this._fcTopOut(dt, skill, inputs, into, false)) return true;
      w.corner ??= this._fcCornerSide(into, w.look);
      const turned = this._fcCornerWall(into, w.corner);
      if (turned && this._fcTopOut(dt, skill, inputs, turned, false)) return true;
      const face = [this.pos[0] + into[0] * c.dist, 0, this.pos[2] + into[2] * c.dist];
      const g0 = senseGrip(this.collider, face, c.normal, this.pos[1] + PARKOUR_HANG_DROP, this._pkGeo());
      const g = g0 && w.past != null && g0.lipY <= w.past + PARKOUR_LIP_FOLLOW ? null : g0;
      const level = !!g && g.lipY - this.pos[1] <= PARKOUR_HANG_DROP + 0.04;
      if (level && !g.eave) {
        w.mode = 'hang';
        w.upRefused = false;
        this._pkHangAt(g);
        return this._hangStep(dt, { jump: false }, 0, vert, skill);
      }
      if (g && (w.stuck || (level && g.eave)) && catchClear(this.collider, this.pos, g, CAPSULE_HEIGHT)) {
        const move = planCatch(this.pos, g);
        move.kind = 'reach';
        move.bill = false;
        this._parkourBegin(move);
        return true;
      }
    }
    w.stuck = false;
    if (vert < 0 || (w.past != null && this.pos[1] >= w.past + PARKOUR_UP_GAP)) w.past = null;
    if (!side && !vert) return true;
    const v = freeClimbSpeed(this.speed, skill, !!inputs.enhanced, inputs.climbing ?? 0) * (this.stats.racialPace?.('climb', this) ?? 1) * (side && vert ? DIAGONAL_FACTOR : 1);
    const n = c.normal;
    const was = [this.pos[0], this.pos[1], this.pos[2]];
    this._fcMove(was, side, vert, v, n, dt);
    const held = () => this._fcHeld(n, w);
    for (const out of PARKOUR_LEAN) if (!held()) this._fcMove(was, side, vert, v, n, dt, out);
    if (!held() && side && vert) this._fcMove(was, 0, vert, v, n, dt);
    if (!held() && vert > 0 && !w.seek && w.past == null) {
      this._fcMove(was, 0, vert, v, n, dt);
      const s = this.pos[1] - was[1] > 1e-4 && bandsClear(this.collider, this.pos, this.height)
        ? wallContact(this.collider, this.pos, [-n[0], 0, -n[2]], this.height, CAPSULE_RADIUS, PARKOUR_WALL_REACH) : null;
      if (s && s.normal[0] * n[0] + s.normal[2] * n[2] >= PARKOUR_FACE_FOLLOW) {
        w.past = this._fcFaceTop(was, into);
        w.seek = true;
        this._fcMove(was, 0, vert, v, n, dt);
      }
    }
    if (!held()) { this.pos[0] = was[0]; this.pos[1] = was[1]; this.pos[2] = was[2]; }
    w.stuck = vert > 0 && this.pos[1] - was[1] < 1e-4;
    if (vert <= 0 || side || (w.sidestep && this.pos[1] - w.sidestep.y0 >= PARKOUR_SIDESTEP_CLEAR)) w.sidestep = null;
    if (!side && vert > 0 && (w.stuck || (w.sidestep && w.sidestep.gone < w.sidestep.want))) this._fcSidestep(v, n, dt, held);
    return true;
  }

  _fcSidestep(v, n, dt, held) {
    const w = this._wall;
    const t = [-n[2], 0, n[0]];
    const from = [this.pos[0], this.pos[1], this.pos[2]];
    const into = [-n[0], 0, -n[2]];
    const rises = (s) => {
      const q = [from[0] + t[0] * s, from[1] + PARKOUR_SIDESTEP_RISE, from[2] + t[2] * s];
      return capsuleFits(this.collider, q, this.height) && !!wallContact(this.collider, q, into, this.height, CAPSULE_RADIUS, PARKOUR_CONTACT);
    };
    const search = (dirs, room) => {
      for (let k = 1; k * PARKOUR_SIDESTEP_PROBE <= room + 1e-9; k++) for (const s of dirs) if (rises(s * k * PARKOUR_SIDESTEP_PROBE)) return { s, k };
      return null;
    };
    if (w.sidestep == null) {
      const f = search([1, -1], PARKOUR_SIDESTEP_MAX);
      w.sidestep = f ? { dir: f.s, want: f.k * PARKOUR_SIDESTEP_PROBE, gone: 0, y0: from[1] } : { dir: 0, want: 0, gone: 0, y0: from[1] };
      if (!f) return false;
    }
    const st = w.sidestep;
    if (st.gone >= st.want) {
      if (!st.dir || st.gone >= PARKOUR_SIDESTEP_MAX) return false;
      const f = search([st.dir], PARKOUR_SIDESTEP_MAX - st.gone);
      if (!f) { st.want = st.gone = PARKOUR_SIDESTEP_MAX; return false; }
      st.want = st.gone + f.k * PARKOUR_SIDESTEP_PROBE;
    }
    const d = v * DIAGONAL_FACTOR;
    this._fcMove(from, st.dir, 0, Math.min(d, (st.want - st.gone) / dt), n, dt);
    const gone = Math.abs(t[0] * (this.pos[0] - from[0]) + t[2] * (this.pos[2] - from[2]));
    if (gone < 1e-4 || !held()) { this.pos[0] = from[0]; this.pos[1] = from[1]; this.pos[2] = from[2]; st.gone = st.want = PARKOUR_SIDESTEP_MAX; return false; }
    st.gone += gone;
    if (w.stuck) {
      const along = [this.pos[0], this.pos[1], this.pos[2]];
      this._fcMove(along, 0, 1, d, n, dt);
      if (!held()) { this.pos[0] = along[0]; this.pos[1] = along[1]; this.pos[2] = along[2]; }
    }
    return true;
  }

  _fcCornerSide(into, look) {
    if (!look) return 0;
    const a = look[0] * -into[2] + look[2] * into[0];
    return Math.abs(a) < PARKOUR_CORNER_LOOK ? 0 : Math.sign(a);
  }

  _fcCornerWall(into, side) {
    if (!side) return null;
    const dir = [-into[2] * side, 0, into[0] * side];
    return wallContact(this.collider, this.pos, dir, this.height, CAPSULE_RADIUS, PARKOUR_CONTACT) ? dir : null;
  }

  _fcFaceTop(at, into) {
    const reach = CAPSULE_RADIUS + PARKOUR_CONTACT;
    for (let h = 0; h <= this.height; h += PARKOUR_STEP_SCAN) {
      if (!Number.isFinite(this.collider.raycast([at[0], at[1] + h, at[2]], into, reach))) return at[1] + h;
    }
    return at[1] + this.height;
  }

  _fcTopOut(dt, skill, inputs, into, pressed) {
    const reach = parkourReach(skill, inputs.load ?? 0) + PARKOUR_AIR_REACH;
    if (Number.isFinite(this.collider.raycast([this.pos[0], this.pos[1] + reach, this.pos[2]], into, CAPSULE_RADIUS + PARKOUR_WALL_REACH))) return false;
    if (!pressed && this._pkQuiet > 0) { this._pkQuiet--; return false; }
    const geo = this._pkGeo(PARKOUR_AIR_LOW, reach);
    const ledge = senseLedge(this.collider, this.pos, into, geo);
    const move = ledge.ok ? this._pkOnto(ledge, geo, skill) : null;
    if (move) {
      this._wallEnd();
      this._parkourBegin(move);
      this._parkourAdvance(dt);
      return true;
    }
    if (ledge.ok) this._pkQuiet = PARKOUR_QUIET_STEPS;
    return false;
  }

  _fcMove(was, side, vert, v, n, dt, out = null) {
    const press = Math.min(this.speed * dt, Math.max(0, this._wall?.gap ?? Infinity) + PARKOUR_HUG_PRESS);
    const nx = n[0], nz = n[2], hug = out == null ? (this._wall?.past != null ? 0 : -press) : out;
    this.pos[0] = was[0]; this.pos[1] = was[1]; this.pos[2] = was[2];
    this.collider.move(this.pos,
      -nz * side * v * dt + nx * hug, vert * v * dt, nx * side * v * dt + nz * hug,
      this.height, false, false, true);
    const want = side * v * dt, got = -nz * (this.pos[0] - was[0]) + nx * (this.pos[2] - was[2]);
    const keep = want && Math.sign(got) === Math.sign(want) ? Math.sign(want) * Math.min(Math.abs(got), Math.abs(want)) : 0;
    if (Math.abs(got - keep) > 1e-6) {
      const fx = this.pos[0] - nz * (keep - got), fz = this.pos[2] + nx * (keep - got);
      if (this.collider.penetrationAt([fx, this.pos[1], fz], this.height) < 0.03) { this.pos[0] = fx; this.pos[2] = fz; }
    }
  }

  _fcHeld(n, w) {
    return !!wallContact(this.collider, this.pos, [-n[0], 0, -n[2]], this.height, CAPSULE_RADIUS, w.seek || w.past != null || w.down ? PARKOUR_WALL_REACH : PARKOUR_CONTACT)
      && bandsClear(this.collider, this.pos, this.height);
  }

  _parkourBegin(move) {
    move.speed = Math.hypot(this.velY, this._airVelX, this._airVelZ);
    this._pkMoveEvent(move, move.speed);
    this._pkUnsink();
    this._pkArm = null;
    this._pkLeap = null;
    this.techFlight = false;
    this._pkOffEdge = null;
    this._pkMove = move;
    if (move.bill !== false) this.parkoured = this.parkoured ? [].concat(this.parkoured, move.kind) : move.kind;
    this._pkJumpLatch = true;
    this.moveForward = 0;
    this.moveStrafe = 0;
    this.moveSpeed = 0;
    if (move.crouch && !this.crouching) {
      this._pkCrouchRestore = this.heightAction !== 'crouch';
      this.standingHeightAdjustment = 0;
      this.crouching = true;
      this.heightAction = 'crouch';
      this.heightTimer = 0;
      this.heightTimerMax = move.dur * move.split;
    }
    move.carrier = move.key != null ? (this.collider.bucketPose?.(move.key) ?? null) : null;
  }

  _parkourAdvance(dt, spent = false) {
    const m = this._pkMove;
    if (m.hang && this.parkour && !spent) {
      const i = this.parkour.inputs?.() ?? {};
      this.grip = Math.max(0, this.grip - dt / gripSeconds(parkourSkill(i), i.fatigue ?? 1));
    }
    if (this._wall && !spent) this._wallTick(dt);
    if (m.carrier) {
      const now = this.collider.bucketPose(m.key);
      if (now) { carryMove(m, m.carrier, now); m.carrier = now; }
    }
    m.t = Math.min(1, m.t + dt / m.dur);
    if (m.stand && this.crouching && m.t >= m.split) {
      this.standingHeightAdjustment = 0;
      this.crouching = false;
      this.heightAction = 'stand';
      this.heightTimer = 0;
      this.heightTimerMax = m.dur * (1 - m.split);
    }
    movePoint(m, m.t, this.pos);
    this.velY = 0;
    this._airVelX = 0;
    this._airVelZ = 0;
    this.jumping = false;
    this.falling = false;
    this.fallStart = this.pos[1];
    this.grounded = false;
    this.groundKey = null;
    if (m.t >= 1 && m.next) {
      const nx = m.next;
      nx.carrier = nx.key != null ? (this.collider.bucketPose?.(nx.key) ?? null) : null;
      this._pkMove = nx;
      this._pkMoveEvent(nx, 0);
    } else if (m.t >= 1) {
      this._pkMove = null;
      if (m.hang && this._wall) {
        const w = this._wall;
        w.mode = 'hang';
        w.normal = [m.hang.normal[0], 0, m.hang.normal[2]];
        w.lipY = m.hang.lipY;
        w.key = m.key ?? null;
        w.carrier = w.key != null ? (this.collider.bucketPose?.(w.key) ?? null) : null;
        w.upRefused = false;
        w.cornerRefused = 0;
        this._pkHold();
        this._pkEmit('hold', { mode: 'hang', normal: [w.normal[0], 0, w.normal[2]] });
      } else if (m.hang) {
        this._wallBegin('hang', m.hang.normal, m.hang.lipY, m.key);
        if (m.kind === 'lower' && this._wall) this._wall.upRefused = true;
      } else if (m.wall) {
        this._wallBegin('climb', m.wall.normal, null, m.key);
      } else if (m.exit) {
        this.jumping = true;
        this.velY = m.exitVy ?? 0;
        this._airVelX = m.exit[0];
        this._airVelZ = m.exit[1];
      } else {
        const r = this.collider.move(this.pos, 0, -0.05, 0, this.height, true);
        this.grounded = r.grounded;
        this.groundKey = r.grounded ? (r.groundKey ?? null) : null;
      }
    }
    this.standing = this.grounded;
    this.movingLessThanHalfSpeed = this.grounded ? true : this._halfSpeedBase() / 2 >= this.speed;
  }

  _headDipHandling(sin, cos) {
    if (this.crouching || !this.collider?.raycastHit) return;
    const dir = [sin, 0, cos];
    const centreY = this.pos[1] + this.height / 2;
    const head = this.collider.raycastHit(
      [this.pos[0], centreY + CAPSULE_HEIGHT / 2 + HEAD_DIP_TOP_MARGIN, this.pos[2]],
      dir, HEAD_DIP_RAY_DISTANCE);
    const eyeRayHit = Number.isFinite(this.collider.raycast(this.eye, dir, HEAD_DIP_RAY_DISTANCE));
    const headRayHit = Number.isFinite(head.dist);
    this.standingHeightAdjustment =
      (headRayHit && !eyeRayHit && isStaticGeometryKey(head.key)) ? HEAD_DIP_CLEARANCE : 0;
  }

  _step(dt, input, yaw, pitch = 0) {
    this.groundedTime = this.grounded ? this.groundedTime + dt : 0;
    if (this.cancelMovement) {
      this.cancelMovement = false;
      this._airVelX = 0;
      this._airVelZ = 0;
      this.standing = this.grounded;
      this.groundKey = null;
      this.falling = false;
      this.fallStart = this.pos[1];
      return;
    }
    if (this.freezeMotor > 0) {
      this._pkMove = null;
      if (this._wall) this._wallEnd();
      this._pkOffEdge = null; this._pkLeap = null;
      this.freezeMotor -= dt;
      if (this.freezeMotor <= 0) {
        this.freezeMotor = 0;
        this.cancelMovement = true;
      }
      return;
    }
    if (grappleStep(this, dt, input, yaw, pitch)) return;
    if (this._parkourStep(dt, input, yaw)) return;
    if (!this._pkOn && this._climbStep(dt, input, yaw)) return;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const factor = input.forward !== 0 && input.strafe !== 0 ? DIAGONAL_FACTOR : 1;

    if (this.levitating || this.swimming) {
      this.velY = 0;
      this._airVelX = 0;
      this._airVelZ = 0;
      this.techFlight = false;
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      let mx = (sin * cp * input.forward + cos * input.strafe) * factor;
      let my = sp * input.forward * factor;
      let mz = (cos * cp * input.forward - sin * input.strafe) * factor;
      if (this.swimming && !this.levitating) my = 0;
      const overEncumbered = (this.carriedWeight?.() ?? 0) * 4 > OVER_ENCUMBERED_LIMIT && !this.levitating;
      if (this.swimming && overEncumbered && !this.climb?.isClimbing && !this.waterWalking) my -= 1;
      else if (input.up) my += 1;
      else if (input.down) my -= 1;
      let speed;
      if (this.swimming && this.waterWalking) {
        speed = this.speed;
      } else if (this.swimming && !this.levitating) {
        if (my > 0 && this.waterSurfaceY != null
            && this.pos[1] + this.height / 2 + 50 * 0.025 - 0.93 >= this.waterSurfaceY) {
          my = 0;
        }
        speed = this.swimSpeedNow() * (this.stats.racialPace?.('swim', this) ?? 1);
      } else {
        speed = LEVITATE_MOVE_SPEED;
      }
      this.movingLessThanHalfSpeed = this.grounded
        ? true
        : this._halfSpeedBase() / 2 >= this.speed;
      this.standing = this.grounded;
      if (this.paralyzed) return;
      if (!this.levitateMotorEnabled) return;
      const r = this.collider.move(this.pos, mx * speed * dt, my * speed * dt, mz * speed * dt, this.height, false);
      this.groundKey = r.grounded ? (r.groundKey ?? null) : null;
      this.grounded = r.grounded;
      return;
    }

    if (this.grounded) {
      this.jumping = false;
      if (this.falling) {
        this.falling = false;
        this.landedFallDistance = this.fallStart - this.pos[1];
      }
    } else if (!this.falling) {
      this.falling = true;
      this.fallStart = this.pos[1];
      if (!this.jumping) this.velY = 0;
    }

    if (this.grounded) {
      this.isRunning = this._runMode && canRunUnlessRiding(this.transportMode);
      this.isSneaking = !this.isRunning && (this._sneakMode || this.crouching);
    }
    if (this.isRunning) this._sneakMode = false;
    let speed;
    const rideBase = (!this.crouching && isRiding(this.transportMode)) ? rideBaseFor(this.transportMode) : null;
    this.rideWalking = rideBase != null && !this.isRunning && rideWalks(this.transportMode, this._runMode);
    if (this.isRunning) {
      speed = runSpeed(this.stats.speed, this.stats.running, this.crouching, rideBase);
      if (rideBase != null) speed *= this._rideScale();
      else if (_runMods.size) speed *= runSpeedMult();
    } else {
      speed = rideBase != null
        ? rideSpeed(this.stats.speed, this._rideBaseNow()) * this._rideScale()
        : (this.crouching ? crouchSpeed(this.stats.speed) : this._refreshWalkSpeed());
      if (this.isSneaking) speed = sneakSpeed(speed);
    }
    if (rideBase == null && _footMods.size) speed *= footSpeedMult();
    if (this.isPlayerSwimming && !this.waterWalking) speed = swimSpeed(speed, this.stats.swimming ?? 0);
    const pace = this.isPlayerSwimming && !this.waterWalking ? 'swim'
      : this.isRunning ? 'run' : this.isSneaking ? 'sneak' : 'walk';
    if (!isRiding(this.transportMode)) speed *= this.stats.racialPace?.(pace, this) ?? 1;
    if (this._rattleLeft > 0) speed *= this._rattleShare;
    this.speed = speed;
    this._trackHalfSpeed(input, speed);
    this.moveForward = input.forward || 0;
    this.moveStrafe = input.strafe || 0; this.moveYaw = yaw;

    let vx, vz;
    if (this.grounded) {
      this.techFlight = false;
      vx = (sin * input.forward + cos * input.strafe) * factor * speed;
      vz = (cos * input.forward - sin * input.strafe) * factor * speed;
      if (!this.paralyzed) this._headDipHandling(sin, cos);
    } else if (this.enhancedJumping?.() && !this._pkLeap && !this.techFlight) {
      vx = (sin * input.forward + cos * input.strafe) * factor * speed;
      vz = (cos * input.forward - sin * input.strafe) * factor * speed;
      const n = this.slowFalling ? this._slowPress : null;
      if (n) { const d = vx * n[0] + vz * n[1]; if (d > 0) { vx -= d * n[0]; vz -= d * n[1]; } }
    } else {
      vx = this._airVelX;
      vz = this._airVelZ;
    }
    this.moveSpeed = Math.hypot(vx, vz);

    const fBuf = jumpForgiven(_jfBufferOf), fLate = jumpForgiven(_jfLateOf);
    const jFresh = !!input.jump && !this._jfWas;
    this._jfWas = !!input.jump;
    if (jFresh && !this.grounded) this._jfBuf = 0; else if (this._jfBuf !== Infinity) this._jfBuf += dt;
    if (this.grounded) this._jfAir = 0; else if (this._jfAir !== Infinity) this._jfAir += dt;
    const jBuffered = fBuf > 0 && this.grounded && this._jfBuf <= fBuf;
    const jLate = fLate > 0 && !this.grounded && !this.jumping && jFresh && this._jfAir <= fLate;
    if (((this.grounded && input.jump && (this.climb?.wasClimbing || this.groundedTime >= GROUNDED_JUMP_GATE_S)) || jBuffered || jLate)
        && !this._pkJumpLatch
        && !this.onExteriorWater
        && this.transportMode !== TRANSPORT_MODES.Cart) {
      const boost = this.transportMode === TRANSPORT_MODES.Horse
        ? HORSE_JUMP_MULTIPLIER
        : (this.jumpBoost ? this.jumpBoost() : 1) * (this.stats.racialPace?.('jump', this) ?? 1);
      this.velY = JUMP_SPEED * boost;
      if (this.crouching) this.velY *= CROUCH_JUMP_DELTA;
      if (input.forward !== 0 || input.strafe !== 0) {
        vx += sin * JUMP_SPEED * JUMP_FWD_BOOST;
        vz += cos * JUMP_SPEED * JUMP_FWD_BOOST;
      }
      this.grounded = false;
      this.groundedTime = 0;
      this.jumping = true;
      this.jumped = true;
      this._jfBuf = Infinity;
    }
    this._airVelX = vx;
    this._airVelZ = vz;

    this.scanner?.findStep(
      [this.pos[0], this.pos[1] + this.height / 2, this.pos[2]], [vx, 0, vz], this.height, this.jumping);

    if (!this.grounded) {
      if (this.slowFalling && this.falling && !(this.jumping && this.velY > 0)) {
        this.fallStart = this.pos[1];
        if (this.techFlight && this.jumping) this.velY -= GRAVITY * dt;
        else this.velY = -SLOWFALL_VELOCITY;
      } else {
        this.velY -= GRAVITY * dt;
      }
    } else this.velY = Math.min(this.velY, 0);
    this.antiBumpInRange = false;
    if (!this.climb?.isClimbing && this.scanner) {
      const minRange = this.height / 2 - 0.15;
      this.antiBumpInRange = this.scanner.stepHitDistance > minRange
        && this.scanner.stepHitDistance < minRange + 1.10;
    }
    const dy = this.velY * dt;

    // Ground snap is off while jumping so the ballistic descent is not pulled onto the floor probe.
    const x0 = this.pos[0], y0 = this.pos[1], z0 = this.pos[2];
    const r = this.collider.move(this.pos, vx * dt, dy, vz * dt, this.height, !this.jumping);
    if (this.slowFalling && this.falling && !r.grounded) {
      const lift = this.pos[1] - (y0 + dy);
      if (lift > 1e-6) this._slowHeld = (this._slowHeld ?? 0) + lift;
      else { this._slowHeld = 0; this._slowPress = null; }
      if (this._slowHeld > STEP_OFFSET) {
        const ax = (this.pos[0] - x0) / dt, az = (this.pos[2] - z0) / dt;
        const lx = vx - ax, lz = vz - az, l = Math.hypot(lx, lz);
        if (l > 1e-3) this._slowPress = [lx / l, lz / l];
        if (ax * ax + az * az < vx * vx + vz * vz - 1e-6) { this._airVelX = ax; this._airVelZ = az; }
      }
    } else { this._slowHeld = 0; this._slowPress = null; }
    this.groundKey = r.grounded ? (r.groundKey ?? null) : null;
    this.grounded = r.grounded;
    if (r.grounded && this.velY < 0) this.velY = 0;
    // Rising into a ceiling reverses the vertical velocity, as DFU does, instead of stopping at zero.
    if (r.hitCeiling && this.velY > 0) this.velY = -this.velY;
  }
}


