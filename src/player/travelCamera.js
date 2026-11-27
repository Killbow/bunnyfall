// @ts-check

export const TV_HEIGHT_MIN = 150;
export const TV_HEIGHT_MAX = 450;
export const TV_HEIGHT_DEFAULT = 260;
export const TV_TILT_MIN = (15 * Math.PI) / 180;
export const TV_TILT_MAX = (75 * Math.PI) / 180;
export const TV_TILT_DEFAULT = (52 * Math.PI) / 180;
export const TV_CLOUD_MARGIN = 60;
export const TV_HEIGHT_FLOOR = 40;
export const TV_GROUND_CLEAR = 25;
export const TV_OWN_GROW_M = 32;
export const TV_OWN_GROW_MAX = 12;
export const tvOwnGrow = (dist) => Math.max(1, Math.min(TV_OWN_GROW_MAX, Math.round((Number.isFinite(dist) ? dist : 0) / TV_OWN_GROW_M)));
export const TV_RISE_S = 1.2;
export const TV_FALL_S = 0.8;
export const TV_ZOOM_STEP = 1.18;
export const TV_ORBIT_PER_PX = 0.005;
export const TV_TILT_PER_PX = 0.004;
export const TV_HEIGHT_RATE = 6;
export const TV_FOCUS_RATE = 10;
export const TV_FOCUS_SNAP = 60;
export const TV_BILLBOARD_LEAN = 0.5;
export const TV_TURN_RATE = 6;
export const TV_CLEAR_PASSES = 8;
export const TV_CLEAR_TILT_STEP = (5 * Math.PI) / 180;
export const TV_CLEAR_SPAN = 100;
export const clearSteps = (len) => Math.max(1, Math.ceil((Number.isFinite(len) ? len : 0) / (2 * TV_CLEAR_SPAN)));

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export function angleDelta(a, b) {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  else if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}
export const easeShare = (dt, rate) => 1 - Math.exp(-Math.max(0, dt) * rate);
export const smooth01 = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };

export function ceilingFor(cloudBase) {
  if (cloudBase == null || !Number.isFinite(cloudBase)) return TV_HEIGHT_MAX;
  return clamp(cloudBase - TV_CLOUD_MARGIN, TV_HEIGHT_FLOOR, TV_HEIGHT_MAX);
}

export function heightBand(ceiling) {
  const hi = clamp(ceiling, TV_HEIGHT_FLOOR, TV_HEIGHT_MAX);
  return [Math.min(TV_HEIGHT_MIN, hi), hi];
}

export function forwardOf(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp];
}
export const rightOf = (yaw) => [Math.cos(yaw), 0, -Math.sin(yaw)];

/**
 * @param {number[]} focus
 * @returns {{ eye: number[], fwd: number[], back: number }}
 */
export function eyeFor(focus, yaw, tilt, height) {
  const back = height / Math.tan(tilt);
  return {
    eye: [focus[0] - Math.sin(yaw) * back, focus[1] + height, focus[2] - Math.cos(yaw) * back],
    fwd: forwardOf(yaw, -tilt),
    back,
  };
}

/** @returns {number} */
export function clearHeight(focus, yaw, tilt, height, heightAt) { return clearing(focus, yaw, tilt, height, heightAt).h; }

function clearing(focus, yaw, tilt, height, heightAt) {
  if (typeof heightAt !== 'function') return { h: height, clear: true };
  let h = height;
  for (let pass = 0; pass < TV_CLEAR_PASSES; pass++) {
    const { eye } = eyeFor(focus, yaw, tilt, h);
    const need = (x, z, y, share) => {
      const g = heightAt(x, z);
      if (!Number.isFinite(g)) return 0;
      return share > 0 ? (g + TV_GROUND_CLEAR - y) / share : 0;
    };
    let lift = 0;
    const n = clearSteps(Math.hypot(eye[0] - focus[0], eye[1] - focus[1], eye[2] - focus[2]));
    for (let k = 0; k <= n; k++) {
      const s = 0.5 + k / (2 * n);
      lift = Math.max(lift, need(focus[0] + (eye[0] - focus[0]) * s, focus[2] + (eye[2] - focus[2]) * s, focus[1] + (eye[1] - focus[1]) * s, s));
    }
    if (!(lift > 0)) return { h, clear: true };
    h += lift;
  }
  return { h, clear: false };
}

/** @returns {{ height: number, tilt: number }} */
export function clearView(focus, yaw, tilt, height, heightAt) {
  for (let t = tilt; ; t = Math.min(TV_TILT_MAX, t + TV_CLEAR_TILT_STEP)) {
    const r = clearing(focus, yaw, t, height, heightAt);
    if (r.clear || t >= TV_TILT_MAX) return { height: r.h, tilt: t };
  }
}

export function leanedUp(yaw, tilt, lean = TV_BILLBOARD_LEAN) {
  const a = clamp(tilt, 0, Math.PI / 2) * lean;
  const s = Math.sin(a);
  return [Math.sin(yaw) * s, Math.cos(a), Math.cos(yaw) * s];
}

export function turnHeading(yaw, target, dt) {
  const d = angleDelta(yaw, target);
  const step = TV_TURN_RATE * Math.max(0, dt);
  return Math.abs(d) <= step ? target : yaw + Math.sign(d) * step;
}

export function keysHeading(cameraYaw, forward, strafe) {
  return forward || strafe ? cameraYaw + Math.atan2(strafe, forward) : null;
}

export function axesToward(yaw, way, forward, strafe) {
  const m = Math.hypot(forward, strafe), d = way - yaw;
  return { forward: m * Math.cos(d), strafe: m * Math.sin(d) };
}

export function initialCamera(focus, yaw) {
  return {
    focus: [focus[0], focus[1], focus[2]],
    yaw,
    tilt: TV_TILT_DEFAULT,
    height: TV_HEIGHT_DEFAULT,
    heightTarget: TV_HEIGHT_DEFAULT,
    feet: [focus[0], focus[1], focus[2]],
  };
}

export function zoomTarget(target, notches, ceiling) {
  const [lo, hi] = heightBand(ceiling);
  return clamp(target * Math.pow(TV_ZOOM_STEP, -notches), lo, hi);
}

export function turnCamera(c, dYaw, dTilt) {
  return { ...c, yaw: c.yaw + dYaw, tilt: clamp(c.tilt + dTilt, TV_TILT_MIN, TV_TILT_MAX) };
}

export const orbitBy = (c, dx, dy) => turnCamera(c, dx * TV_ORBIT_PER_PX, dy * TV_TILT_PER_PX);

/**
 * @param {{focus:number[], yaw:number, tilt:number, height:number, heightTarget:number, feet?:number[]}} c
 * @param {{ feet:number[], dt:number, ceiling:number, heightAt?:(x:number,z:number)=>number }} env
 */
export function stepCamera(c, { feet, dt, ceiling, heightAt = null }) {
  const dx = feet[0] - c.focus[0], dy = feet[1] - c.focus[1], dz = feet[2] - c.focus[2];
  const pf = c.feet ?? c.focus;
  const jump = Math.hypot(feet[0] - pf[0], feet[1] - pf[1], feet[2] - pf[2]) > TV_FOCUS_SNAP;
  const k = jump ? 1 : easeShare(dt, TV_FOCUS_RATE);
  const focus = [c.focus[0] + dx * k, c.focus[1] + dy * k, c.focus[2] + dz * k];
  const lag = Math.hypot(feet[0] - focus[0], feet[1] - focus[1], feet[2] - focus[2]);
  if (lag > TV_FOCUS_SNAP) { const s = 1 - TV_FOCUS_SNAP / lag; for (let i = 0; i < 3; i++) focus[i] += (feet[i] - focus[i]) * s; }
  const [lo, hi] = heightBand(ceiling);
  const heightTarget = c.heightTarget;
  const want = clamp(heightTarget, lo, hi);
  let height = jump ? want : c.height + (want - c.height) * easeShare(dt, TV_HEIGHT_RATE);
  height = clamp(height, lo, hi);
  const v = clearView(focus, c.yaw, c.tilt, height, heightAt);
  const next = { focus, yaw: c.yaw, tilt: c.tilt, height, heightTarget, feet: [feet[0], feet[1], feet[2]] };
  const { eye, fwd } = eyeFor(focus, c.yaw, v.tilt, v.height);
  return { camera: next, eye, fwd, shownHeight: v.height, shownTilt: v.tilt };
}

export function blendView(from, to, t) {
  const s = smooth01(t);
  const eye = [0, 1, 2].map((i) => from.eye[i] + (to.eye[i] - from.eye[i]) * s);
  const a = anglesOf(from.fwd), b = anglesOf(to.fwd);
  return { eye, fwd: forwardOf(a.yaw + angleDelta(a.yaw, b.yaw) * s, a.pitch + (b.pitch - a.pitch) * s) };
}

export function anglesOf(fwd) {
  return { yaw: Math.atan2(fwd[0], fwd[2]), pitch: Math.asin(clamp(fwd[1], -1, 1)) };
}
