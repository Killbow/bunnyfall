// @ts-check
// The city's seal is separate from the expanding blight and cannot be dispelled
// by a reach encounter. Horizontal exclusion also covers flight and underground saves.
export const CROMWARK_CITY = Object.freeze({ px: 823, py: 35, mapId: 505449455, region: 16, location: 482 });
export const BARRIER_MARGIN = 12;
export function cromwarkSeal(data) {
  const w = data?.width, h = data?.height;
  if (!(w > 0 && h > 0)) return null;
  return { x: Math.trunc((128 - w * 16) / 2) * 6.4 + w * 51.2,
    z: Math.trunc((128 - h * 16) / 2) * 6.4 + h * 51.2,
    radius: Math.hypot(w * 51.2, h * 51.2) + 28, height: 380 };
}
/** Stop swept movement too: a fast dash cannot cross the entire seal in a frame. */
export function sealCrossed(seal, from, to) {
  if (!seal || !to?.every(Number.isFinite)) return false;
  const x = to[0] - seal.x, z = to[2] - seal.z;
  if (Math.hypot(x, z) < seal.radius + 1) return true;
  if (!from?.every(Number.isFinite)) return false;
  const dx = to[0] - from[0], dz = to[2] - from[2], d2 = dx * dx + dz * dz;
  const t = d2 ? Math.max(0, Math.min(1, ((seal.x - from[0]) * dx + (seal.z - from[2]) * dz) / d2)) : 0;
  return Math.hypot(from[0] + t * dx - seal.x, from[2] + t * dz - seal.z) < seal.radius;
}
export function sealOutside(seal, point) {
  const dx = point[0] - seal.x, dz = point[2] - seal.z, d = Math.hypot(dx, dz);
  const r = seal.radius + BARRIER_MARGIN;
  return [seal.x + (d > .001 ? dx / d : 0) * r, point[1], seal.z + (d > .001 ? dz / d : -1) * r];
}
