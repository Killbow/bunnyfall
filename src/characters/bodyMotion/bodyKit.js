// @ts-check

import { climbBones, rotFromTo, rotAxisAngle, rotationPart, restAxes } from '../../combat/climbRig.js';
import { mat33Mul } from '../../formats/mwNifMesh.js';
import { wrapAngle } from '../../world/mat4.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const clamp01 = (t) => Math.min(1, Math.max(0, t));
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const smooth = (t) => { const x = clamp01(t); return x * x * (3 - 2 * x); };
export const RAD = Math.PI / 180;
export { wrapAngle };
export const frac = (x) => x - Math.floor(x);
export const ease = (v, goal, tau, dt) => goal + (v - goal) * Math.exp(-Math.max(0, dt) / Math.max(1e-4, tau));
export const transpose = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
export const apply = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
export const mul = (a, b) => mat33Mul(a, b);
export const fromColumns = (x, y, z) => [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
const rotX = (a) => rotAxisAngle([1, 0, 0], a);
const rotY = (a) => rotAxisAngle([0, 1, 0], a);
const rotZ = (a) => rotAxisAngle([0, 0, 1], a);
export const bodyTurn = (yaw, roll, pitch) => mul(rotZ(yaw), mul(rotY(roll), rotX(-pitch)));
const inFrame = (R, v) => (R ? apply(R, v) : v);
export const mirrorX = (v) => [-v[0], v[1], v[2]];
export const reflect = (v, n) => sub(v, scale(n, 2 * dot(v, n)));
export const algebra = Object.freeze({ sub, add, scale, dot, cross, len, norm, lerp, lerp3, inFrame });

const _bodies = new WeakMap();
export const turnOf = (mats, ref) => { const m = ref == null ? null : mats.get(ref); return m ? rotationPart(m.a) : null; };
export const at = (mats, ref) => (ref == null ? null : mats.get(ref)?.t ?? null);

function isAncestor(skeleton, anc, ref) {
  for (let r = skeleton.nodes.get(ref)?.parent; r != null && r >= 0 && skeleton.nodes.has(r); r = skeleton.nodes.get(r).parent) {
    if (r === anc) return true;
  }
  return false;
}

export function bodyOf(skeleton, rootRef, skelMats) {
  if (!skeleton || !skeleton.byName) return null;
  const hit = _bodies.get(skeleton);
  if (hit !== undefined) return hit;
  const body = measure(skeleton, rootRef, skelMats);
  _bodies.set(skeleton, body);
  return body;
}

export const FOOT = Object.freeze({ ball: 0.14, heel: 0.055 });

function measure(skeleton, rootRef, skelMats) {
  const bones = climbBones(skeleton);
  if (!bones) return null;
  const { L, R } = bones;
  const need = [L.thigh, L.calf, L.foot, R.thigh, R.calf, R.foot, L.upper, L.fore, L.hand, R.upper, R.fore, R.hand];
  if (need.some((r) => r == null) || bones.spine.length === 0 || bones.root == null) return null;
  const rest = skelMats(skeleton, new Map(), rootRef);
  const p = (ref) => at(rest, ref);
  if (need.some((r) => !p(r))) return null;
  const legOf = (s) => len(sub(p(s.calf), p(s.thigh))) + len(sub(p(s.foot), p(s.calf)));
  const armOf = (s) => len(sub(p(s.fore), p(s.upper))) + len(sub(p(s.hand), p(s.fore)));
  const leg = (legOf(L) + legOf(R)) / 2, arm = (armOf(L) + armOf(R)) / 2;
  if (!(leg > 1e-3 && arm > 1e-3)) return null;
  const thighParentL = skeleton.nodes.get(L.thigh)?.parent, thighParentR = skeleton.nodes.get(R.thigh)?.parent;
  const hipBone = thighParentL === thighParentR && skeleton.nodes.has(thighParentL) ? thighParentL : (bones.pelvis ?? bones.spine[0]);
  const trunk = bones.spine.filter((r) => r !== hipBone && !isAncestor(skeleton, r, hipBone) && !isAncestor(skeleton, r, L.thigh));
  if (!trunk.length) return null;
  const chest = trunk[trunk.length - 1];
  const restRot = new Map();
  for (const r of [bones.pelvis, hipBone, ...trunk, bones.neck, bones.head]) if (r != null && rest.get(r)) restRot.set(r, rotationPart(rest.get(r).a));
  const hipRight = norm(sub(p(R.thigh), p(L.thigh)));
  const shoulderRight = norm(sub(p(R.upper), p(L.upper)));
  const flat = (v) => norm([v[0], v[1], 0]);
  const restHip = scale(add(p(L.thigh), p(R.thigh)), 0.5);
  const neckAt = p(bones.neck) ?? p(bones.head) ?? add(p(chest), [0, 0, leg * 0.15]);
  const footAxes = { L: restAxes(skeleton, L.foot), R: restAxes(skeleton, R.foot) };
  const ankleAt = (s, ax) => Math.acos(clamp(dot(norm(sub(p(s.calf), p(s.foot))), norm(apply(rotationPart(rest.get(s.foot).a), ax.fwd))), -1, 1));
  return Object.freeze({
    bones, leg, arm,
    legs: { L: legOf(L), R: legOf(R) },
    arms: { L: armOf(L), R: armOf(R) },
    hipWidth: len(sub(p(R.thigh), p(L.thigh))),
    shoulderWidth: len(sub(p(R.upper), p(L.upper))),
    ankle: Math.max(0, Math.min(p(L.foot)[2], p(R.foot)[2])),
    hipBone, trunk, chest,
    restRot,
    hipFix: rotFromTo(flat(hipRight)[0] > 0.5 ? hipRight : [1, 0, 0], [1, 0, 0]),
    chestFix: rotFromTo(flat(shoulderRight)[0] > 0.5 ? shoulderRight : [1, 0, 0], [1, 0, 0]),
    restHip,
    restChestUp: norm(sub(neckAt, p(chest))),
    footAxes,
    ankleRest: { L: footAxes.L ? ankleAt(L, footAxes.L) : Math.PI / 2, R: footAxes.R ? ankleAt(R, footAxes.R) : Math.PI / 2 },
    headAxes: bones.head != null ? restAxes(skeleton, bones.head) : null,
    wb: skeleton.byName.get('weapon bone') ?? null,
    wbL: skeleton.byName.get('weapon bone left') ?? null,
  });
}

export function bodyKindOf(path) {
  const s = String(path ?? '').toLowerCase();
  if (!s.includes('base_anim') || s.includes('wolf')) return null;
  if (s.includes('kna')) return 'beast';
  if (s.includes('female')) return 'female';
  return 'male';
}

