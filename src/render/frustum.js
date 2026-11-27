// @ts-check

import { pageParam } from '../platform/pageQuery.js';

// Gribb/Hartmann planes (left, right, bottom, top, near, far), unnormalized: the outside test needs only the sign.
export function frustumPlanes(m, out = new Float32Array(24)) {
  for (let i = 0; i < 3; i++) {
    const o = i * 8;
    out[o] = m[3] + m[i];
    out[o + 1] = m[7] + m[4 + i];
    out[o + 2] = m[11] + m[8 + i];
    out[o + 3] = m[15] + m[12 + i];
    out[o + 4] = m[3] - m[i];
    out[o + 5] = m[7] - m[4 + i];
    out[o + 6] = m[11] - m[8 + i];
    out[o + 7] = m[15] - m[12 + i];
  }
  return out;
}

// Conservative: a box that straddles or surrounds the frustum is never outside, so hosts may pad their bounds.
export function aabbOutside(planes, box, ox = 0, oy = 0, oz = 0) {
  const minX = box[0] + ox, minY = box[1] + oy, minZ = box[2] + oz;
  const maxX = box[3] + ox, maxY = box[4] + oy, maxZ = box[5] + oz;
  for (let p = 0; p < 24; p += 4) {
    const a = planes[p], b = planes[p + 1], c = planes[p + 2], d = planes[p + 3];
    const px = a >= 0 ? maxX : minX;
    const py = b >= 0 ? maxY : minY;
    const pz = c >= 0 ? maxZ : minZ;
    if (a * px + b * py + c * pz + d < 0) return true;
  }
  return false;
}

export function localAabb(positions) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return [minX, minY, minZ, maxX, maxY, maxZ];
}

export function transformedAabb(box, m, out = [0, 0, 0, 0, 0, 0]) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < 8; i++) {
    const x = (i & 1) ? box[3] : box[0];
    const y = (i & 2) ? box[4] : box[1];
    const z = (i & 4) ? box[5] : box[2];
    const tx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const ty = m[1] * x + m[5] * y + m[9] * z + m[13];
    const tz = m[2] * x + m[6] * y + m[10] * z + m[14];
    if (tx < minX) minX = tx; if (tx > maxX) maxX = tx;
    if (ty < minY) minY = ty; if (ty > maxY) maxY = ty;
    if (tz < minZ) minZ = tz; if (tz > maxZ) maxZ = tz;
  }
  out[0] = minX; out[1] = minY; out[2] = minZ;
  out[3] = maxX; out[4] = maxY; out[5] = maxZ;
  return out;
}

export function sphereAabb(s, m, out = [0, 0, 0, 0, 0, 0]) {
  if (!s || !(s.length >= 4) || !m) return null;
  const x = m[0] * s[0] + m[4] * s[1] + m[8] * s[2] + m[12];
  const y = m[1] * s[0] + m[5] * s[1] + m[9] * s[2] + m[13];
  const z = m[2] * s[0] + m[6] * s[1] + m[10] * s[2] + m[14];
  const r = s[3] * Math.sqrt(Math.max(m[0] * m[0] + m[1] * m[1] + m[2] * m[2], m[4] * m[4] + m[5] * m[5] + m[6] * m[6], m[8] * m[8] + m[9] * m[9] + m[10] * m[10]));
  out[0] = x - r; out[1] = y - r; out[2] = z - r;
  out[3] = x + r; out[4] = y + r; out[5] = z + r;
  return out;
}

// Centers are the flat bases and the quad yaws to face the camera, so the box rises a full height and spreads
// half a width on both horizontal axes.
export function flatBatchAabb(centers, size) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const c of centers) {
    if (c[0] < minX) minX = c[0]; if (c[0] > maxX) maxX = c[0];
    if (c[1] < minY) minY = c[1]; if (c[1] > maxY) maxY = c[1];
    if (c[2] < minZ) minZ = c[2]; if (c[2] > maxZ) maxZ = c[2];
  }
  const hw = size.w / 2;
  return [minX - hw, minY, minZ - hw, maxX + hw, maxY + size.h, maxZ + hw];
}

export function cullDisabled() {
  return pageParam('cull') === 'off';
}
