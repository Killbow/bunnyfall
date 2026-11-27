// @ts-check
// Quaternions in Unity's [x, y, z, w] order.

import { quatToMat4 } from './mat4.js';

export const UNITY_QUAT_IDENTITY = Object.freeze([0, 0, 0, 1]);

const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return l > 0 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 0]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function quatMultiply(a, b) {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3], bx = b[0], by = b[1], bz = b[2], bw = b[3];
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function quatAngleAxis(deg, axis) {
  const a = norm3(axis);
  const h = (deg * Math.PI / 180) / 2;
  const s = Math.sin(h);
  return [a[0] * s, a[1] * s, a[2] * s, Math.cos(h)];
}

export function quatRotate(q, v) {
  const [x, y, z, w] = q;
  const u = [x, y, z];
  const uv = cross(u, v);
  const uuv = cross(u, uv);
  return [v[0] + 2 * (w * uv[0] + uuv[0]), v[1] + 2 * (w * uv[1] + uuv[1]), v[2] + 2 * (w * uv[2] + uuv[2])];
}

export function quatRotateInto(q, vx, vy, vz, out) {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const uv0 = y * vz - z * vy, uv1 = z * vx - x * vz, uv2 = x * vy - y * vx;
  const uuv0 = y * uv2 - z * uv1, uuv1 = z * uv0 - x * uv2, uuv2 = x * uv1 - y * uv0;
  out[0] = vx + 2 * (w * uv0 + uuv0); out[1] = vy + 2 * (w * uv1 + uuv1); out[2] = vz + 2 * (w * uv2 + uuv2);
  return out;
}

export function quatFromBasis(right, up, forward) {
  const m00 = right[0], m01 = up[0], m02 = forward[0];
  const m10 = right[1], m11 = up[1], m12 = forward[1];
  const m20 = right[2], m21 = up[2], m22 = forward[2];
  const trace = m00 + m11 + m22;
  let x, y, z, w;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    w = 0.25 * s; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s;
  }
  const len = Math.sqrt(x * x + y * y + z * z + w * w);
  if (!(len > 0)) return [...UNITY_QUAT_IDENTITY];
  return [x / len, y / len, z / len, w / len];
}

export function quatLookRotation(forward, up = [0, 1, 0]) {
  const f = norm3(forward);
  if (!(Math.hypot(f[0], f[1], f[2]) > 0)) return [...UNITY_QUAT_IDENTITY];
  let r = cross(up, f);
  if (!(Math.hypot(r[0], r[1], r[2]) > 1e-12)) r = cross([0, 0, 1], f);
  r = norm3(r);
  const u = cross(f, r);
  return quatFromBasis(r, u, f);
}

export function quatSlerp(a, b, t) {
  const k = Math.max(0, Math.min(1, t));
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (d < 0) { d = -d; bb = [-b[0], -b[1], -b[2], -b[3]]; }
  let s0, s1;
  if (d > 0.9995) { s0 = 1 - k; s1 = k; }
  else {
    const th = Math.acos(Math.min(1, d)), sn = Math.sin(th);
    s0 = Math.sin((1 - k) * th) / sn; s1 = Math.sin(k * th) / sn;
  }
  const out = [a[0] * s0 + bb[0] * s1, a[1] * s0 + bb[1] * s1, a[2] * s0 + bb[2] * s1, a[3] * s0 + bb[3] * s1];
  const l = Math.hypot(out[0], out[1], out[2], out[3]) || 1;
  return [out[0] / l, out[1] / l, out[2] / l, out[3] / l];
}

export const quatForward = (q) => quatRotate(q, [0, 0, 1]);
export function mat4FromQuatPos(q, p) {
  const m = quatToMat4(q);
  m[12] = p[0]; m[13] = p[1]; m[14] = p[2];
  return m;
}
function quatToMat4Into(q, out) {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const xx = x * x, yy = y * y, zz = z * z;
  const xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  out[0] = 1 - 2 * (yy + zz); out[1] = 2 * (xy + wz);     out[2] = 2 * (xz - wy);      out[3] = 0;
  out[4] = 2 * (xy - wz);     out[5] = 1 - 2 * (xx + zz); out[6] = 2 * (yz + wx);      out[7] = 0;
  out[8] = 2 * (xz + wy);     out[9] = 2 * (yz - wx);     out[10] = 1 - 2 * (xx + yy); out[11] = 0;
  out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
  return out;
}
export function mat4FromQuatPosScale(q, p, s, out = undefined) {
  const m = out ? quatToMat4Into(q, out) : quatToMat4(q);
  for (let c = 0; c < 3; c++) { m[c * 4] *= s[c]; m[c * 4 + 1] *= s[c]; m[c * 4 + 2] *= s[c]; }
  m[12] = p[0]; m[13] = p[1]; m[14] = p[2];
  return m;
}
export { dot as dot3, cross as cross3, norm3 };
