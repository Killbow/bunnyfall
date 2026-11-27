// @ts-check

import {
  MATHF_EPSILON, V_FORWARD, V_ZERO, horizontalDistance, vsub, vadd, vscale, vdot, vlerp, vdist, vsqr, vnorm,
  pickGround, horizontalForward, WAGON_FOLLOW_DISTANCE, SAMPLE_DISTANCE, RETAINED_TRAIL_DISTANCE, TELEPORT_DISTANCE,
  MAXIMUM_VISUAL_DISTANCE, GROUND_RAY_HEIGHT, GROUND_RAY_DISTANCE, NORMAL_GROUND_OFFSET, POSITION_SMOOTHING_RATE,
  ROTATION_SMOOTHING_RATE,
} from './horseCartLaw.js';
import { quatLookRotation, quatSlerp, quatForward } from '../world/quat.js';

export const CATCH_UP_START_DISTANCE = 6.0, STRONG_CATCH_UP_DISTANCE = 12.0;
export const THREAT_CLEARANCE = 15.0;
export const COMBAT_CLEAR_DELAY = 3.0, COMBAT_SCAN_INTERVAL = 0.25, COMBAT_TARGET_REFRESH = 0.4;
export const STUCK_TIMEOUT = 4.5, RECOVERY_MIN_SEPARATION = 8.0, PROGRESS_DISTANCE = 0.5, RECOVERY_TRAIL_DISTANCE = 6.0;
export const STOP_TARGET_DISTANCE = 0.18;
export const GENTLE_SPEED = 1.25, NORMAL_SPEED = 2.8, CATCH_UP_SPEED = 5.0, STRONG_CATCH_UP_SPEED = 7.0, EVASION_SPEED = 6.0;
export const FOLLOW_GROUND_PROBE_HEIGHT = 8.0, FOLLOW_GROUND_PROBE_DISTANCE = 40.0;
export const MAXIMUM_STEP_HEIGHT_CHANGE = 1.5, BODY_PROBE_HEIGHT = 0.9, BODY_PROBE_RADIUS = 0.35;
export const EVADE_COMFORT_DISTANCE = 8.0;
export const ACCEL_MIN_CATCH_UP = 2.0, ACCEL_MAX_CATCH_UP = 12.0, ACCEL_CATCH_UP_GAIN = 0.75, ACCEL_MAX_SUBSTEP = 1.25, ACCEL_MAX_SUBSTEPS = 16;
export const DETOUR_ANGLES = Object.freeze([0, 30, -30, 60, -60, 90, -90]);
export const EVADE_RINGS = Object.freeze([6, 10, 15, 20, 25, 30]);
export const PATH_SAMPLE_DISTANCE = 0.08, PATH_RETAINED_DISTANCE = 45.0, PATH_DISCONTINUITY_DISTANCE = 20.0;
export const PATH_SEED_BEHIND = 4.0;

const normalizeHorizontal = (v) => { const p = [v[0], 0, v[2]]; return vsqr(p) <= MATHF_EPSILON ? [...V_FORWARD] : vnorm(p); };
const rotateY = (v, deg) => { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };

export class HorseFollowPath {
  constructor() { this.points = []; this.lastPlayerPosition = [...V_ZERO]; this.hasLastPlayerPosition = false; }
  get count() { return this.points.length; }
  // Hosts call `offset` whenever the floating origin moves the scene; nothing shifts these points on its own.
  offset(d) { for (const p of this.points) { p[0] += d[0]; p[1] += d[1]; p[2] += d[2]; } if (this.hasLastPlayerPosition) { this.lastPlayerPosition[0] += d[0]; this.lastPlayerPosition[1] += d[1]; this.lastPlayerPosition[2] += d[2]; } }
  clear() { this.points.length = 0; this.hasLastPlayerPosition = false; this.lastPlayerPosition = [...V_ZERO]; }
  seed(playerPosition, playerForward) {
    const f = normalizeHorizontal(playerForward);
    this.points.length = 0;
    this.points.push(vsub(playerPosition, vscale(f, PATH_SEED_BEHIND)));
    this.points.push([...playerPosition]);
    this.lastPlayerPosition = [...playerPosition]; this.hasLastPlayerPosition = true;
  }
  seedBehind(leaderPosition, leaderForward, trailingPosition) {
    normalizeHorizontal(leaderForward);
    this.points.length = 0;
    this.points.push([...trailingPosition]);
    this.points.push([...leaderPosition]);
    this.lastPlayerPosition = [...leaderPosition]; this.hasLastPlayerPosition = true;
  }
  record(playerPosition, playerForward) {
    if (this.hasLastPlayerPosition && horizontalDistance(playerPosition, this.lastPlayerPosition) > PATH_DISCONTINUITY_DISTANCE) { this.seed(playerPosition, playerForward); return false; }
    this.lastPlayerPosition = [...playerPosition];
    if (this.points.length === 0) { this.seed(playerPosition, playerForward); return false; }
    if (horizontalDistance(playerPosition, this.points[this.points.length - 1]) < PATH_SAMPLE_DISTANCE) return true;
    this.points.push([...playerPosition]);
    this.prune();
    return true;
  }
  tryGetPointBehind(currentPlayerPosition, desiredDistance) {
    if (this.points.length < 2) return null;
    if (desiredDistance < 0) return null;
    let accumulated = 0, cursor = [...currentPlayerPosition];
    for (let i = this.points.length; i > 0; i--) {
      const p = this.points[i - 1];
      const seg = [cursor[0] - p[0], 0, cursor[2] - p[2]];
      const len = Math.sqrt(vsqr(seg));
      if (len <= MATHF_EPSILON) { cursor = p; continue; }
      if (accumulated + len >= desiredDistance) {
        const remaining = desiredDistance - accumulated;
        return { target: vlerp(cursor, p, remaining / len), pathForward: vscale(seg, 1 / len) };
      }
      accumulated += len; cursor = p;
    }
    return { target: [...this.points[0]], pathForward: normalizeHorizontal(vsub(this.points[1], this.points[0])) };
  }
  prune() {
    let retained = 0, removeCount = this.points.length - 1;
    for (let i = this.points.length - 1; i > 0; i--) {
      retained += horizontalDistance(this.points[i], this.points[i - 1]);
      removeCount = i - 1;
      if (retained >= PATH_RETAINED_DISTANCE) break;
    }
    if (removeCount > 0) this.points.splice(0, removeCount);
  }
}

export function calculateFollowSpeed(targetDistance, playerDistance, evading, followDistance) {
  if (targetDistance <= STOP_TARGET_DISTANCE) return 0;
  if (evading) return EVASION_SPEED;
  if (playerDistance >= STRONG_CATCH_UP_DISTANCE) return STRONG_CATCH_UP_SPEED;
  if (playerDistance >= CATCH_UP_START_DISTANCE) {
    const t = Math.max(0, Math.min(1, (playerDistance - CATCH_UP_START_DISTANCE) / (STRONG_CATCH_UP_DISTANCE - CATCH_UP_START_DISTANCE)));
    return CATCH_UP_SPEED + (STRONG_CATCH_UP_SPEED - CATCH_UP_SPEED) * t;
  }
  const t = Math.max(0, Math.min(1, targetDistance / Math.max(0.01, followDistance)));
  return GENTLE_SPEED + (NORMAL_SPEED - GENTLE_SPEED) * t;
}
export const observedPlayerSpeed = (previous, current, dt, continuous) => (!continuous || dt <= MATHF_EPSILON ? 0 : horizontalDistance(previous, current) / dt);
export function acceleratedFollowSpeed(ordinarySpeed, playerSpeed, playerDistance, followDistance) {
  if (playerSpeed <= MATHF_EPSILON) return ordinarySpeed;
  const excess = Math.max(0, playerDistance - followDistance);
  const catchUp = Math.max(ACCEL_MIN_CATCH_UP, Math.min(ACCEL_MAX_CATCH_UP, ACCEL_MIN_CATCH_UP + excess * ACCEL_CATCH_UP_GAIN));
  return Math.max(ordinarySpeed, playerSpeed + catchUp);
}
export const shouldEnterCombatEvasion = (avoidanceEnabled, qualifyingThreatCount) => avoidanceEnabled && qualifyingThreatCount > 0;
export const isQualifyingThreatState = (isEnemy, hostile, playerAlly, targetsPlayer, detected) => isEnemy && hostile && !playerAlly && targetsPlayer && detected;

export function tryFindGround(phys, requested) {
  const hits = phys.raycastAll(vadd(requested, [0, FOLLOW_GROUND_PROBE_HEIGHT, 0]), [0, -1, 0], FOLLOW_GROUND_PROBE_DISTANCE);
  const best = pickGround(hits, requested[1]);
  return best ? [...best.point] : null;
}
export const isStepClear = (phys, start, direction, distance) => phys.sphereCastClear(vadd(start, [0, BODY_PROBE_HEIGHT, 0]), BODY_PROBE_RADIUS, direction, distance + 0.05);
export function isDirectPathClear(phys, start, end) {
  const d = [end[0] - start[0], 0, end[2] - start[2]];
  const len = Math.sqrt(vsqr(d));
  if (len <= MATHF_EPSILON) return true;
  return isStepClear(phys, start, vscale(d, 1 / len), len);
}
export function tryChooseGroundedStep(phys, start, intendedDirection, distance) {
  if (distance <= MATHF_EPSILON) return null;
  for (const deg of DETOUR_ANGLES) {
    const dir = rotateY(intendedDirection, deg);
    if (!isStepClear(phys, start, dir, distance)) continue;
    const g = tryFindGround(phys, vadd(start, vscale(dir, distance)));
    if (!g) continue;
    if (Math.abs(g[1] - start[1]) > MAXIMUM_STEP_HEIGHT_CHANGE) continue;
    return g;
  }
  return null;
}

export class HorseFollowController {
  constructor() {
    this.path = new HorseFollowPath();
    this.threats = [];
    this.position = [...V_ZERO]; this.heading = [...V_FORWARD];
    this.evadeTarget = [...V_ZERO]; this.progressReference = [...V_ZERO]; this.previousPlayerPosition = [...V_ZERO];
    this.nextCombatScanTime = 0; this.nextEvadeTargetTime = 0; this.lastThreatTime = -Infinity; this.progressReferenceTime = 0;
    this.initialized = false; this.combatEvading = false; this.hasEvadeTarget = false; this.hasPreviousPlayerPosition = false;
    this.actualHorizontalSpeed = 0;
  }
  get isInitialized() { return this.initialized; }
  get isCombatEvading() { return this.combatEvading; }
  begin(phys, horsePosition, horseHeading, playerPosition, playerForward) {
    this.position = [...horsePosition]; this.heading = normalizeHorizontal(horseHeading);
    this.path.seed(playerPosition, playerForward);
    this.threats.length = 0;
    this.combatEvading = false; this.hasEvadeTarget = false;
    this.nextCombatScanTime = 0; this.nextEvadeTargetTime = 0; this.lastThreatTime = -Infinity;
    this.progressReference = [...this.position]; this.progressReferenceTime = phys.now();
    this.previousPlayerPosition = [...playerPosition]; this.hasPreviousPlayerPosition = true;
    this.actualHorizontalSpeed = 0;
    this.initialized = true;
  }
  resetTransient() {
    this.path.clear(); this.threats.length = 0; this.initialized = false; this.combatEvading = false; this.hasEvadeTarget = false;
    this.actualHorizontalSpeed = 0; this.nextCombatScanTime = 0; this.nextEvadeTargetTime = 0; this.lastThreatTime = -Infinity;
    this.previousPlayerPosition = [...V_ZERO]; this.hasPreviousPlayerPosition = false;
  }
  offset(d) {
    for (const v of [this.position, this.evadeTarget, this.progressReference, this.previousPlayerPosition, ...this.threats]) { v[0] += d[0]; v[1] += d[1]; v[2] += d[2]; }
    this.path.offset(d);
  }
  clearCombatEvasion(phys) {
    const wasActive = this.combatEvading || this.hasEvadeTarget || this.threats.length > 0;
    this.threats.length = 0; this.combatEvading = false; this.hasEvadeTarget = false; this.evadeTarget = [...V_ZERO];
    this.nextCombatScanTime = 0; this.nextEvadeTargetTime = 0; this.lastThreatTime = -Infinity;
    if (this.initialized) this.resetProgress(phys);
    return wasActive;
  }
  resetProgress(phys) { this.progressReference = [...this.position]; this.progressReferenceTime = phys.now(); }

  tick(phys, playerMovement, visual, followDistance, avoidCombat, acceleratedTravel, dt) {
    this.recoveredThisTick = false;
    if (!this.initialized || !playerMovement || !visual || !visual.isInteractive) { this.actualHorizontalSpeed = 0; return false; }
    const grounded = visual.tryGetGroundedPose();
    if (grounded && horizontalDistance(grounded.position, this.position) > TELEPORT_DISTANCE) {
      this.position = [...grounded.position]; this.heading = [...grounded.forward];
      this.path.seed(playerMovement.position, playerMovement.forward);
      this.resetProgress(phys);
    }
    const recorded = this.path.record(playerMovement.position, playerMovement.forward);
    if (!recorded) this.resetProgress(phys);
    const step = Math.max(0, dt);
    const playerSpeed = observedPlayerSpeed(this.previousPlayerPosition, playerMovement.position, step, recorded && this.hasPreviousPlayerPosition);
    this.previousPlayerPosition = [...playerMovement.position]; this.hasPreviousPlayerPosition = true;
    if (avoidCombat && !acceleratedTravel) this.updateCombatState(phys, playerMovement);
    else this.clearCombatEvasion(phys);
    let target, targetForward;
    if (this.combatEvading) {
      target = this.selectOrRetainEvadeTarget(phys, playerMovement.position);
      targetForward = normalizeHorizontal(vsub(target, this.position));
    } else {
      const behind = this.path.tryGetPointBehind(playerMovement.position, followDistance);
      if (!behind) { this.actualHorizontalSpeed = 0; visual.applyFollowingPose(this.position, this.heading, 0); return true; }
      target = behind.target; targetForward = behind.pathForward;
    }
    const startPosition = [...this.position];
    const targetDistance = horizontalDistance(this.position, target);
    const playerDistance = horizontalDistance(this.position, playerMovement.position);
    let speed = calculateFollowSpeed(targetDistance, playerDistance, this.combatEvading, followDistance);
    if (acceleratedTravel && recorded && !this.combatEvading) speed = acceleratedFollowSpeed(speed, playerSpeed, playerDistance, followDistance);
    if (speed > 0 && step > MATHF_EPSILON) {
      const stepDistance = Math.min(targetDistance, speed * step);
      if (acceleratedTravel) this.moveGroundedInSubsteps(phys, target, stepDistance);
      else {
        const direction = normalizeHorizontal(vsub(target, this.position));
        const g = tryChooseGroundedStep(phys, this.position, direction, stepDistance);
        if (g) this.position = g;
      }
      const delta = [this.position[0] - startPosition[0], 0, this.position[2] - startPosition[2]];
      if (vsqr(delta) > 1e-6) this.heading = vnorm(delta);
    }
    this.actualHorizontalSpeed = step > MATHF_EPSILON ? horizontalDistance(startPosition, this.position) / step : 0;
    if (!this.combatEvading) {
      const recovered = this.updateStuckRecovery(phys, playerMovement, targetForward, speed);
      if (recovered) { this.position = recovered; this.recoveredThisTick = true; this.actualHorizontalSpeed = 0; }
    }
    visual.applyFollowingPose(this.position, this.heading, this.actualHorizontalSpeed);
    return true;
  }
  updateCombatState(phys, playerMovement) {
    const now = phys.now();
    if (now < this.nextCombatScanTime) return;
    this.nextCombatScanTime = now + COMBAT_SCAN_INTERVAL;
    this.threats = (phys.threats?.() ?? []).map((p) => [...p]);
    if (shouldEnterCombatEvasion(true, this.threats.length)) {
      this.lastThreatTime = now;
      if (this.combatEvading) return;
      this.combatEvading = true; this.hasEvadeTarget = false; this.nextEvadeTargetTime = 0; this.resetProgress(phys);
      return;
    }
    if (this.combatEvading && now - this.lastThreatTime >= COMBAT_CLEAR_DELAY) {
      this.combatEvading = false; this.hasEvadeTarget = false;
      this.path.seed(playerMovement.position, playerMovement.forward);
      this.resetProgress(phys);
    }
  }
  isThreatSafe(candidate) {
    for (const t of this.threats) { const dx = candidate[0] - t[0], dz = candidate[2] - t[2]; if (dx * dx + dz * dz < THREAT_CLEARANCE * THREAT_CLEARANCE) return false; }
    return true;
  }
  selectOrRetainEvadeTarget(phys, playerPosition) {
    const now = phys.now();
    if (this.isThreatSafe(this.position) && horizontalDistance(this.position, playerPosition) <= EVADE_COMFORT_DISTANCE) { this.evadeTarget = [...this.position]; this.hasEvadeTarget = true; return this.evadeTarget; }
    if (this.hasEvadeTarget && now < this.nextEvadeTargetTime && this.isThreatSafe(this.evadeTarget)) return this.evadeTarget;
    this.nextEvadeTargetTime = now + COMBAT_TARGET_REFRESH;
    let best = [...V_ZERO], found = false;
    for (let ring = 0; ring < EVADE_RINGS.length && !found; ring++) {
      const radius = EVADE_RINGS[ring];
      let bestDist = Infinity;
      for (let i = 0; i < 16; i++) {
        const angle = i * Math.PI * 2 / 16;
        const candidate = vadd(playerPosition, vscale([Math.cos(angle), 0, Math.sin(angle)], radius));
        const g = tryFindGround(phys, candidate);
        if (!g) continue;
        if (!this.isThreatSafe(g)) continue;
        if (!isDirectPathClear(phys, this.position, g)) continue;
        const d = horizontalDistance(this.position, g);
        if (d < bestDist) { bestDist = d; best = g; found = true; }
      }
    }
    if (!found) {
      let away = [...V_ZERO];
      for (const t of this.threats) away = vadd(away, normalizeHorizontal(vsub(this.position, t)));
      away = normalizeHorizontal(away);
      const g = tryFindGround(phys, vadd(this.position, vscale(away, EVADE_COMFORT_DISTANCE)));
      best = g ?? [...this.position];
    }
    this.evadeTarget = best; this.hasEvadeTarget = true;
    return this.evadeTarget;
  }
  updateStuckRecovery(phys, playerMovement, targetForward, desiredSpeed) {
    const now = phys.now();
    const playerDistance = horizontalDistance(this.position, playerMovement.position);
    if (desiredSpeed <= 0 || playerDistance < RECOVERY_MIN_SEPARATION) { this.resetProgress(phys); return null; }
    if (horizontalDistance(this.position, this.progressReference) >= PROGRESS_DISTANCE) { this.resetProgress(phys); return null; }
    if (now - this.progressReferenceTime < STUCK_TIMEOUT) return null;
    const behind = this.path.tryGetPointBehind(playerMovement.position, RECOVERY_TRAIL_DISTANCE);
    if (!behind) { this.resetProgress(phys); return null; }
    const g = tryFindGround(phys, behind.target);
    if (!g) { this.resetProgress(phys); return null; }
    this.heading = normalizeHorizontal(targetForward);
    this.path.seed(playerMovement.position, playerMovement.forward);
    this.resetProgress(phys);
    return g;
  }
  moveGroundedInSubsteps(phys, target, totalDistance) {
    let remaining = totalDistance, substeps = 0;
    while (remaining > MATHF_EPSILON) {
      const distanceBefore = horizontalDistance(this.position, target);
      const step = Math.min(remaining, ACCEL_MAX_SUBSTEP);
      const direction = normalizeHorizontal(vsub(target, this.position));
      const g = tryChooseGroundedStep(phys, this.position, direction, step);
      if (!g) return;
      const moved = horizontalDistance(this.position, g);
      this.position = g;
      if (moved <= MATHF_EPSILON) return;
      remaining -= moved;
      if (horizontalDistance(this.position, target) > distanceBefore + 0.01) return;
      substeps++;
      if (substeps >= ACCEL_MAX_SUBSTEPS) return;
    }
  }
}

export class WagonTrail {
  constructor() { this.points = []; this.lastObserved = null; }
  offset(d) { for (const p of this.points) { p[0] += d[0]; p[1] += d[1]; p[2] += d[2]; } if (this.lastObserved) { this.lastObserved[0] += d[0]; this.lastObserved[1] += d[1]; this.lastObserved[2] += d[2]; } }
  seed(playerPosition, playerForward) {
    const f = horizontalForward(playerForward);
    this.points = [vsub(playerPosition, vscale(f, RETAINED_TRAIL_DISTANCE)), [...playerPosition]];
    this.lastObserved = [...playerPosition];
  }
  isDiscontinuity(playerPosition, wagonPosition = null) {
    if (!this.lastObserved) return true;
    if (vdist(playerPosition, this.lastObserved) > TELEPORT_DISTANCE) return true;
    if (wagonPosition) return vdist(playerPosition, wagonPosition) > MAXIMUM_VISUAL_DISTANCE;
    return false;
  }
  record(playerPosition, playerForward) {
    this.lastObserved = [...playerPosition];
    if (this.points.length === 0) { this.seed(playerPosition, playerForward); return; }
    if (vdist(playerPosition, this.points[this.points.length - 1]) < SAMPLE_DISTANCE) return;
    this.points.push([...playerPosition]);
    this.prune();
  }
  prune() {
    let retained = 0, removeCount = this.points.length - 1;
    for (let i = this.points.length - 1; i > 0; i--) {
      retained += vdist(this.points[i], this.points[i - 1]);
      removeCount = i - 1;
      if (retained >= RETAINED_TRAIL_DISTANCE) break;
    }
    if (removeCount > 0) this.points.splice(0, removeCount);
  }
  trailingPoint(currentPlayerPosition) {
    if (this.points.length < 2) return null;
    let accumulated = 0, cursor = [...currentPlayerPosition];
    for (let i = this.points.length; i > 0; i--) {
      const p = this.points[i - 1];
      const seg = vsub(cursor, p);
      const len = Math.sqrt(vsqr(seg));
      if (len <= MATHF_EPSILON) { cursor = p; continue; }
      if (accumulated + len >= WAGON_FOLLOW_DISTANCE) {
        const remaining = WAGON_FOLLOW_DISTANCE - accumulated;
        return { target: vlerp(cursor, p, remaining / len), pathForward: vscale(seg, 1 / len) };
      }
      accumulated += len; cursor = p;
    }
    const pathForward = vnorm(vsub(this.points[1], this.points[0]));
    if (!(vsqr(pathForward) > MATHF_EPSILON)) return null;
    return { target: [...this.points[0]], pathForward };
  }
  clear() { this.points.length = 0; this.lastObserved = null; }
}

export function groundedPoseStep(phys, w, pathPosition, pathForward, dt) {
  const next = { ...w };
  const hits = phys.raycastAll(vadd(pathPosition, [0, GROUND_RAY_HEIGHT, 0]), [0, -1, 0], GROUND_RAY_DISTANCE);
  const best = pickGround(hits, pathPosition[1]);
  if (best) {
    const n = best.normal ?? [0, 1, 0];
    const normal = vsqr(n) <= MATHF_EPSILON ? [0, 1, 0] : vnorm(n);
    const project = (v) => vsub(v, vscale(normal, vdot(v, normal)));
    let fwd = project(pathForward);
    if (vsqr(fwd) <= MATHF_EPSILON) fwd = project(quatForward(w.rotation));
    if (vsqr(fwd) > MATHF_EPSILON) {
      next.lastValidPosition = vadd(best.point, vscale(normal, NORMAL_GROUND_OFFSET));
      next.lastValidRotation = quatLookRotation(vnorm(fwd), normal);
      next.hasLastValid = true;
    }
  }
  if (!next.hasLastValid) { next.active = false; return next; }
  if (!w.active) { next.position = [...next.lastValidPosition]; next.rotation = [...next.lastValidRotation]; next.active = true; return next; }
  const posT = 1 - Math.exp(-POSITION_SMOOTHING_RATE * dt), rotT = 1 - Math.exp(-ROTATION_SMOOTHING_RATE * dt);
  next.position = vlerp(w.position, next.lastValidPosition, posT);
  next.rotation = quatSlerp(w.rotation, next.lastValidRotation, rotT);
  return next;
}

// Jump threshold in meters per game second, above any team's top speed. A flat 20 m per frame misfires under
// accelerated travel, where one frame spans seconds of game time.
export const HITCH_JUMP_SPEED = 30;
export const hitchJumpReach = (dt) => TELEPORT_DISTANCE + HITCH_JUMP_SPEED * Math.max(0, Number.isFinite(dt) ? dt : 0);

export class WagonHitch {
  constructor() { this.last = null; }
  offset(d) { if (this.last) { this.last[0] += d[0]; this.last[1] += d[1]; this.last[2] += d[2]; } }
  observe(hitch, reach = TELEPORT_DISTANCE) {
    const jumped = !this.last || horizontalDistance(hitch, this.last) > reach;
    this.last = [...hitch];
    return jumped;
  }
  clear() { this.last = null; }
}

export function hitchAxle(from, hitch, length, fallbackForward) {
  const toHitch = [hitch[0] - from[0], 0, hitch[2] - from[2]];
  const dir = vsqr(toHitch) > 1e-8 ? vnorm(toHitch) : horizontalForward(fallbackForward);
  return { axle: [hitch[0] - dir[0] * length, hitch[1], hitch[2] - dir[2] * length], dir };
}

export const yawBetween = (from, to) => (Math.atan2(from[2] * to[0] - from[0] * to[2], from[0] * to[0] + from[2] * to[2]) * 180) / Math.PI;
export function yawed(v, deg) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}
export const clampSteer = (steer, limit) => Math.max(-limit, Math.min(limit, steer));

/**
 * @param {number[]} axleFrom
 * @param {number[] | null} kingpinFrom
 * @param {number[]} hitch
 * @param {number} length
 * @param {{ wheelbase: number, steerLimit: number }} bogie
 * @param {number[]} fallbackForward
 */
export function bogieAxle(axleFrom, kingpinFrom, hitch, length, bogie, fallbackForward) {
  const wb = bogie.wheelbase, pole = length - wb;
  if (!kingpinFrom) {
    const { axle, dir } = hitchAxle(axleFrom, hitch, length, fallbackForward);
    return { axle, kingpin: [hitch[0] - dir[0] * pole, hitch[1], hitch[2] - dir[2] * pole], dir, steer: 0 };
  }
  const k = hitchAxle(kingpinFrom, hitch, pole, fallbackForward);
  const a = hitchAxle(axleFrom, k.axle, wb, k.dir);
  const steer = yawBetween(a.dir, k.dir);
  const held = clampSteer(steer, bogie.steerLimit);
  if (held === steer) return { axle: a.axle, kingpin: k.axle, dir: a.dir, steer };
  const dir = yawed(k.dir, -held);
  return { axle: [k.axle[0] - dir[0] * wb, k.axle[1], k.axle[2] - dir[2] * wb], kingpin: k.axle, dir, steer: held };
}

export function steerToward(axle, forward, hitch, bogie) {
  const f = horizontalForward(forward);
  const to = [hitch[0] - (axle[0] + f[0] * bogie.wheelbase), 0, hitch[2] - (axle[2] + f[2] * bogie.wheelbase)];
  return vsqr(to) > 1e-8 ? clampSteer(yawBetween(f, to), bogie.steerLimit) : 0;
}

export function hitchedPoseStep(phys, w, hitch, hitchForward, length, dt, seed = null, bogie = null, seedForward = null) {
  const next = { ...w, hitch: [...hitch] };
  // Pull from where the wheels touch the ground (`axle`), not the drawn position: that sits up the ground normal,
  // and feeding it back swings the wagon downhill on a slope.
  const from = w.active ? (w.axle ?? w.position) : (seed ?? vsub(hitch, vscale(horizontalForward(hitchForward), length)));
  const two = bogie && length > bogie.wheelbase;
  const bodyFrom = w.active ? quatForward(w.rotation) : seed && seedForward ? seedForward : null;
  const kingpinFrom = two && bodyFrom ? vadd(from, vscale(horizontalForward(bodyFrom), bogie.wheelbase)) : null;
  const turn = two ? bogieAxle(from, kingpinFrom, hitch, length, bogie, hitchForward) : null;
  const { axle, dir } = turn ?? hitchAxle(from, hitch, length, hitchForward);
  next.steer = turn?.steer ?? 0;
  const best = pickGround(phys.raycastAll(vadd(axle, [0, GROUND_RAY_HEIGHT, 0]), [0, -1, 0], GROUND_RAY_DISTANCE), hitch[1]);
  let ground = null;
  if (best) {
    const n = best.normal ?? [0, 1, 0];
    ground = vsqr(n) <= MATHF_EPSILON ? [0, 1, 0] : vnorm(n);
    next.lastValidPosition = vadd(best.point, vscale(ground, NORMAL_GROUND_OFFSET));
    next.axle = [axle[0], best.point[1], axle[2]];
    next.hasLastValid = true;
  } else if (w.hasLastValid) {
    next.lastValidPosition = [axle[0], w.lastValidPosition[1], axle[2]];
    next.axle = [axle[0], w.axle?.[1] ?? w.lastValidPosition[1] - NORMAL_GROUND_OFFSET, axle[2]];
  } else next.axle = [...axle];
  if (!next.hasLastValid) { next.active = false; return next; }
  const wasUp = w.up ?? [0, 1, 0];
  const targetUp = ground ?? wasUp;
  let up, y;
  if (!w.active) { up = targetUp; y = next.lastValidPosition[1]; next.active = true; }
  else {
    const posT = 1 - Math.exp(-POSITION_SMOOTHING_RATE * dt), rotT = 1 - Math.exp(-ROTATION_SMOOTHING_RATE * dt);
    const u = vlerp(wasUp, targetUp, rotT);
    up = vsqr(u) > MATHF_EPSILON ? vnorm(u) : targetUp;
    y = w.position[1] + (next.lastValidPosition[1] - w.position[1]) * posT;
  }
  let fwd = vsub(dir, vscale(up, vdot(dir, up)));
  if (vsqr(fwd) <= MATHF_EPSILON) fwd = dir;
  next.up = up;
  next.position = [next.lastValidPosition[0], y, next.lastValidPosition[2]];
  next.rotation = quatLookRotation(vnorm(fwd), up);
  next.lastValidRotation = next.rotation;
  return next;
}
