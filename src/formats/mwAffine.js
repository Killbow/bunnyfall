// The shared affine shape for the skin, particles, and rig placement: `a` is a row-major 3x3 rotation times scale
// and `t` is the translation.

import { mat33Apply, mat33Mul } from './mwNifMesh.js';

export function affineOfTransform(tr) {
  const a = new Float32Array(9);
  for (let i = 0; i < 9; i++) a[i] = tr.rotation[i] * tr.scale;
  return { a, t: [tr.translation[0], tr.translation[1], tr.translation[2]] };
}
export const AFFINE_IDENTITY = Object.freeze({ a: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]), t: [0, 0, 0] });
// Returns p after q: q applies first, then p.
export function affineMul(p, q) {
  const a = mat33Mul(p.a, q.a);
  const [tx, ty, tz] = mat33Apply(p.a, q.t[0], q.t[1], q.t[2]);
  return { a, t: [p.t[0] + tx, p.t[1] + ty, p.t[2] + tz] };
}
export function affineApply(m, x, y, z) {
  const [px, py, pz] = mat33Apply(m.a, x, y, z);
  return [px + m.t[0], py + m.t[1], pz + m.t[2]];
}
export function affineRotate(m, x, y, z) {
  return mat33Apply(m.a, x, y, z);
}
