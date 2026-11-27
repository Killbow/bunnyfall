// Third-person camera machine ported from the OpenMW reference: mode, zoom law, focal point, and obstacle pull-in.
// Constants keep the reference's numbers in Morrowind units; the eye computation converts to meters.

import { MW_UNITS_PER_METER } from '../formats/mwFirstPerson.js';
import { seaZoomStep, SEA_ZOOM_RATIO } from './seaZoom.js';
export { MW_UNITS_PER_METER };

export const FOCAL_HEIGHT = 124;

export const BASE_DISTANCE = 192;

export const MIN_DISTANCE = 30;

export const MAX_DISTANCE = 800;

export const WHEEL_STEP = 10;

export const CAMERA_OBSTACLE_LIMIT = 5;

export const FOCAL_OBSTACLE_LIMIT = 10;

export const SHOULDER_OFFSET = Object.freeze([30, -10]);
export const COMBAT_OFFSET = Object.freeze([0, 15]);
export const FOCAL_TRANSITION_SPEED = Object.freeze({ combat: 5.0, normal: 1.0 });
export const SHOULDER_SIDES = Object.freeze(['off', 'right', 'left']);

export function createFocalOffset() {
  let current = [0, 0], target = [0, 0], coef = 1;
  let speed = [0, 0], prevSpeed = [0, 0], prevExtra = [0, 0], prevInfluence = 0, skip = true;
  return {
    current: () => current,
    target: () => target,
    setSpeed(v) { coef = v; },
    setTarget(v) { target = [v[0], v[1]]; prevSpeed = [speed[0], speed[1]]; prevInfluence = 1; },
    instant() { skip = true; },
    step(dt) {
      if (!(dt > 0)) return current;
      if (skip) { skip = false; prevExtra = [0, 0]; prevInfluence = 0; current = [target[0], target[1]]; }
      const old = [current[0], current[1]];
      if (prevInfluence > 0) {
        current = [current[0] - prevExtra[0], current[1] - prevExtra[1]];
        prevExtra = [prevExtra[0] / prevInfluence + prevSpeed[0] * dt, prevExtra[1] / prevInfluence + prevSpeed[1] * dt];
        prevInfluence = Math.max(0, prevInfluence - dt * coef);
        prevExtra = [prevExtra[0] * prevInfluence, prevExtra[1] * prevInfluence];
        current = [current[0] + prevExtra[0], current[1] + prevExtra[1]];
      }
      const delta = [target[0] - current[0], target[1] - current[1]], dl = Math.hypot(delta[0], delta[1]);
      if (dl > 0) {
        const k = Math.min(1, dt * (1 + 5 / dl) * coef * (1 - prevInfluence));
        current = [current[0] + delta[0] * k, current[1] + delta[1] * k];
      } else { prevExtra = [0, 0]; prevInfluence = 0; }
      speed = [(current[0] - old[0]) / dt, (current[1] - old[1]) / dt];
      return current;
    },
  };
}

export { PITCH_LIMIT } from './pitchLimit.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function createMwCamera() {
  let firstPerson = true;
  let baseDistance = BASE_DISTANCE;
  let seaFar = 0;
  let cameraDistance = 0;
  let queuedFirstPerson = null;
  let shoulder = 'off', shoulderState = null, noThirdLast = true;
  const focalShift = createFocalOffset();

  function setFirstPerson(next, ready) {
    if (next === firstPerson) { queuedFirstPerson = null; return; }
    if (!ready) { queuedFirstPerson = next; return; }
    firstPerson = next;
    queuedFirstPerson = null;
  }

  const preferredDistance = () => baseDistance;

  function zoom(delta, ready) {
    if (!firstPerson) {
      const obstacleDelta = preferredDistance() - cameraDistance;
      // At a helm one wheel call zooms by a fixed ratio step, not the reference's ten-unit ladder.
      if (seaFar > MAX_DISTANCE && !(delta > 0 && baseDistance === MIN_DISTANCE)) {
        const notch = Math.max(-1, Math.min(1, delta / WHEEL_STEP));
        const from = delta > 0 ? Math.max(MIN_DISTANCE, baseDistance - Math.max(0, obstacleDelta)) : baseDistance;
        if (delta > 0 || obstacleDelta < baseDistance * (SEA_ZOOM_RATIO - 1)) baseDistance = seaZoomStep(from, notch, MIN_DISTANCE, seaFar);
        return;
      }
      if (delta > 0 && baseDistance === MIN_DISTANCE) {
        setFirstPerson(true, ready);
      } else if (delta > 0 || obstacleDelta < -delta) {
        baseDistance = clamp(baseDistance - delta - obstacleDelta, MIN_DISTANCE, MAX_DISTANCE);
      }
    } else if (delta < 0) {
      setFirstPerson(false, ready);
      baseDistance = MIN_DISTANCE;
    }
  }

  return {
    mode() { return firstPerson ? 'first' : 'third'; },
    thirdPerson() { return !firstPerson; },
    queued() { return queuedFirstPerson; },
    baseDistance() { return baseDistance; },
    cameraDistance() { return cameraDistance; },

    wheel(clicks, { ready = true } = {}) {
      if (!clicks) return;
      zoom(clicks * WHEEL_STEP, ready);
    },

    setShoulder(side) {
      const next = SHOULDER_SIDES.includes(side) ? side : 'off';
      if (next !== shoulder) { shoulder = next; noThirdLast = true; }
    },
    shoulder: () => shoulder,
    shoulderState: () => shoulderState,
    focalOffset: () => focalShift.current(),

    stepShoulder(dt, stance = null) {
      if (firstPerson) { noThirdLast = true; focalShift.step(dt); return; }
      if (shoulder === 'off') {
        if (noThirdLast) { focalShift.setTarget([0, 0]); focalShift.instant(); noThirdLast = false; }
        shoulderState = null;
        focalShift.step(dt);
        return;
      }
      const own = shoulder === 'left' ? 'left' : 'right';
      const old = shoulderState;
      if (stance === 'combat') shoulderState = 'combat';
      else if (stance === 'swimming') shoulderState = 'swimming';
      else shoulderState = own;
      if (old !== shoulderState || noThirdLast) {
        focalShift.setSpeed(old === 'combat' || shoulderState === 'combat' ? FOCAL_TRANSITION_SPEED.combat : FOCAL_TRANSITION_SPEED.normal);
        focalShift.setTarget(shoulderState === 'right' ? SHOULDER_OFFSET : shoulderState === 'left' ? [-SHOULDER_OFFSET[0], SHOULDER_OFFSET[1]] : COMBAT_OFFSET);
      }
      if (noThirdLast) { focalShift.instant(); noThirdLast = false; }
      focalShift.step(dt);
    },

    update({ ready = true } = {}) {
      if (queuedFirstPerson !== null && ready) setFirstPerson(queuedFirstPerson, true);
    },

    setSeaReach(metres) {
      seaFar = Number.isFinite(metres) && metres * MW_UNITS_PER_METER > MAX_DISTANCE ? metres * MW_UNITS_PER_METER : 0;
      if (baseDistance > Math.max(MAX_DISTANCE, seaFar)) baseDistance = Math.max(MAX_DISTANCE, seaFar);
    },
    seaFar() { return seaFar; },

    state() { return { firstPerson, baseDistance: Math.min(baseDistance, MAX_DISTANCE) }; },
    restore(s) {
      if (!s) return;
      if (typeof s.firstPerson === 'boolean') firstPerson = s.firstPerson;
      if (Number.isFinite(s.baseDistance)) baseDistance = clamp(s.baseDistance, MIN_DISTANCE, MAX_DISTANCE);
      queuedFirstPerson = null;
    },

    eye({ fpEye, feet, yaw, pitch, heightScale = 1, raycast = null, spherecast = null, pivotFloor = null }) {
      if (firstPerson) {
        cameraDistance = 0;
        return { eye: fpEye, thirdPerson: false, distance: 0, focal: null };
      }
      const u = 1 / MW_UNITS_PER_METER;
      // The focal stays at or above the host's pivotFloor on a wagon bench.
      const focal = [feet[0], Math.max(feet[1] + FOCAL_HEIGHT * heightScale * u, pivotFloor ?? -Infinity), feet[2]];
      const cast = spherecast
        ? (o, d, m, r) => spherecast(o, r, d, m)
        : (raycast ? (o, d, m) => raycast(o, d, m) : null);
      const fo = focalShift.current();
      const shoulderOn = cast && (fo[0] !== 0 || fo[1] !== 0);
      if (fo[0] !== 0 || fo[1] !== 0) {
        focal[0] += Math.cos(yaw) * fo[0] * u; focal[1] += fo[1] * u; focal[2] -= Math.sin(yaw) * fo[0] * u;
        if (pivotFloor != null) focal[1] = Math.max(focal[1], pivotFloor);
      }
      if (shoulderOn) {
        const run = [Math.cos(yaw) * fo[0] * u, (fo[1] + FOCAL_OBSTACLE_LIMIT) * u, -Math.sin(yaw) * fo[0] * u];
        const len = Math.hypot(run[0], run[1], run[2]);
        const dir = [run[0] / len, run[1] / len, run[2] / len];
        const from = [focal[0] - run[0], focal[1] - run[1], focal[2] - run[2]];
        const hit = cast(from, dir, len, FOCAL_OBSTACLE_LIMIT * u);
        const k = hit != null && hit < len ? Math.max(0, spherecast ? hit : hit - FOCAL_OBSTACLE_LIMIT * u) : null;
        if (k != null) for (let i = 0; i < 3; i++) focal[i] = from[i] + dir[i] * k;
      } else if (cast) {
        const guard = FOCAL_OBSTACLE_LIMIT * u;
        const up = cast([focal[0], focal[1] - guard, focal[2]], [0, 1, 0], guard * 2, guard);
        if (up != null && up < guard * 2) {
          const ceilingY = focal[1] - guard + up;
          focal[1] = Math.max(focal[1] - guard, Math.min(focal[1], ceilingY - guard));
        }
      }
      const cp = Math.cos(pitch);
      const fwd = [Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp];
      let dist = preferredDistance() * u;
      if (cast) {
        // A sphere cast distance already includes the clearance radius, so only the ray fallback subtracts the limit.
        const limit = CAMERA_OBSTACLE_LIMIT * u;
        const hit = cast(focal, [-fwd[0], -fwd[1], -fwd[2]], dist, limit);
        if (hit != null && hit < dist) dist = Math.max(0, spherecast ? hit : hit - limit);
      }
      cameraDistance = dist * MW_UNITS_PER_METER;
      return {
        eye: [focal[0] - fwd[0] * dist, focal[1] - fwd[1] * dist, focal[2] - fwd[2] * dist],
        thirdPerson: true,
        distance: dist,
        focal,
      };
    },
  };
}

export const mwCamera = createMwCamera();
