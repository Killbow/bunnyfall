// @ts-check
import { EG_STAIR_VEIL } from './egLights.js';
export * from './egUndersideModel.js';

export const EG_FALL = Object.freeze({ d0: 58, y0: 1.6, v: 44, tau: 0.7, drift: 0.8, pitch0: -0.2, pitch1: 0.42, fov: Math.PI / 3, near: 0.5, far: 3000 });
export const EG_FALL_SPAN = EG_STAIR_VEIL.close + EG_STAIR_VEIL.fallHold + EG_STAIR_VEIL.open;
export const egFallDepth = (t) => { const s = Math.max(0, t); return EG_FALL.v * (s - EG_FALL.tau * (1 - Math.exp(-s / EG_FALL.tau))); };
export const egFallPitch = (t) => { const u = Math.max(0, Math.min(1, t / EG_FALL_SPAN)); return EG_FALL.pitch0 + (EG_FALL.pitch1 - EG_FALL.pitch0) * u * u * (3 - 2 * u); };
/**
 * @template {number[] | Float32Array} T
 * @param {number} t
 * @param {T} [out]
 * @returns {T}
 */
export function egFallEye(t, out = /** @type {T} */ ([0, 0, 0])) {
  const d = egFallDepth(t);
  out[0] = EG_FALL.d0 + EG_FALL.drift * d; out[1] = EG_FALL.y0 - d; out[2] = 0;
  return out;
}
/**
 * @param {number} t
 * @param {number} aspect
 * @param {{ eye: Float32Array, view: Float32Array, proj: Float32Array }} cam
 */
export function egFallCamera(t, aspect, cam) {
  const e = egFallEye(t, cam.eye), p = egFallPitch(t), cp = Math.cos(p), sp = Math.sin(p), V = cam.view;
  V[0] = 0; V[1] = sp; V[2] = cp; V[3] = 0;
  V[4] = 0; V[5] = cp; V[6] = -sp; V[7] = 0;
  V[8] = -1; V[9] = 0; V[10] = 0; V[11] = 0;
  V[12] = e[2]; V[13] = -(sp * e[0] + cp * e[1]); V[14] = -(cp * e[0] - sp * e[1]); V[15] = 1;
  const f = 1 / Math.tan(EG_FALL.fov / 2), P = cam.proj, n = EG_FALL.near, fa = EG_FALL.far;
  P.fill(0);
  P[0] = f / (aspect > 0 ? aspect : 1); P[5] = f; P[10] = (fa + n) / (n - fa); P[11] = -1; P[14] = (2 * fa * n) / (n - fa);
  return cam;
}
