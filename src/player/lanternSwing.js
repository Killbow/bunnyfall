// Pendulum swing of a lantern hung at the waist, shared by both third-person bodies.
import { wrapAngle } from '../world/mat4.js';

export const LANTERN_SWING = Object.freeze({
  length: 0.25,
  gravity: 9.81,
  damping: 2.0,
  drive: 0.3,
  follow: 0.3,
  strideSide: 0.6,
  strideFore: 0.4,
  strideSpeed: 5,
  turnRadius: 0.2,
  maxYawRate: 8,
  maxAngle: 35 * Math.PI / 180,
  maxStep: 1 / 120,
  maxDt: 0.25,
});

export const HIP_LANTERN_HEIGHT = 0.3;

export function createLanternSwing() {
  return { fore: 0, side: 0, foreVel: 0, sideVel: 0, vFore: 0, vSide: 0 };
}

/**
 * @param s
 * @param dt
 * @param motion
 */
export function stepLanternSwing(s, dt, { forward = 0, side = 0, yawRate = 0, stride = null } = {}) {
  if (!s || !(dt > 0)) return s;
  const P = LANTERN_SWING;
  const h = Math.min(dt, P.maxDt);
  const n = Math.max(1, Math.ceil(h / P.maxStep));
  const step = h / n;
  const k = 1 - Math.exp(-step / P.follow);
  const w2 = P.gravity / P.length;
  const fw = Number.isFinite(forward) ? forward : 0;
  const sd = Number.isFinite(side) ? side : 0;
  const yr = Math.max(-P.maxYawRate, Math.min(P.maxYawRate, Number.isFinite(yawRate) ? yawRate : 0));
  const walking = stride != null && Number.isFinite(stride);
  const strength = walking ? Math.min(1, Math.hypot(fw, sd) / P.strideSpeed) : 0;
  const phase = walking ? stride * 2 * Math.PI : 0;
  const swayS = strength * P.strideSide * Math.sin(phase);
  const swayF = strength * P.strideFore * Math.sin(2 * phase);
  for (let i = 0; i < n; i++) {
    const pf = s.vFore, ps = s.vSide;
    s.vFore += (fw - s.vFore) * k;
    s.vSide += (sd - s.vSide) * k;
    const aF = P.drive * (s.vFore - pf) / step + swayF;
    const aS = P.drive * ((s.vSide - ps) / step - yr * yr * P.turnRadius) + swayS;
    s.foreVel += (-w2 * Math.sin(s.fore) - (aF / P.length) * Math.cos(s.fore) - P.damping * s.foreVel) * step;
    s.sideVel += (-w2 * Math.sin(s.side) - (aS / P.length) * Math.cos(s.side) - P.damping * s.sideVel) * step;
    s.fore += s.foreVel * step;
    s.side += s.sideVel * step;
    if (s.fore > P.maxAngle) { s.fore = P.maxAngle; if (s.foreVel > 0) s.foreVel = 0; }
    else if (s.fore < -P.maxAngle) { s.fore = -P.maxAngle; if (s.foreVel < 0) s.foreVel = 0; }
    if (s.side > P.maxAngle) { s.side = P.maxAngle; if (s.sideVel > 0) s.sideVel = 0; }
    else if (s.side < -P.maxAngle) { s.side = -P.maxAngle; if (s.sideVel < 0) s.sideVel = 0; }
  }
  return s;
}

export function lanternSwingDown(s, out = [0, 0, -1]) {
  const cf = Math.cos(s.fore), sf = Math.sin(s.fore), cs = Math.cos(s.side), ss = Math.sin(s.side);
  out[0] = ss; out[1] = sf * cs; out[2] = -cf * cs;
  return out;
}

export function lanternSwingMatrix(s, out = new Float32Array(9)) {
  const cf = Math.cos(s.fore), sf = Math.sin(s.fore), cs = Math.cos(s.side), ss = Math.sin(s.side);
  out[0] = cs; out[1] = 0; out[2] = -ss;
  out[3] = -sf * ss; out[4] = cf; out[5] = -sf * cs;
  out[6] = cf * ss; out[7] = sf; out[8] = cf * cs;
  return out;
}

export function createHipLantern() {
  const swing = createLanternSwing();
  let yaw = null;
  return {
    swing,
    reset() { Object.assign(swing, createLanternSwing()); yaw = null; },
    step(cam, dt, stride, rot, hipYaw = 0) {
      const mv = (cam && cam.move) || null;
      const f0 = mv ? (mv.forward || 0) : 0, s0 = mv ? (mv.strafe || 0) : 0;
      const ch = Math.cos(Number(hipYaw) || 0), sh = Math.sin(Number(hipYaw) || 0);
      const f = f0 * ch - s0 * sh, st = s0 * ch + f0 * sh;
      const len = Math.hypot(f, st);
      const speed = len > 0 && mv ? (mv.speed || 0) : 0;
      const y = cam ? (cam.yaw || 0) : 0;
      const yawRate = yaw != null && dt > 0 ? wrapAngle(y - yaw) / dt : 0;
      yaw = y;
      stepLanternSwing(swing, dt, {
        forward: len > 0 ? speed * f / len : 0,
        side: len > 0 ? speed * st / len : 0,
        yawRate,
        stride: speed > 0 && stride != null ? stride : null,
      });
      lanternSwingMatrix(swing, rot);
    },
  };
}
