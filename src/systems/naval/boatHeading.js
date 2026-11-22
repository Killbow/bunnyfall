// A boat's heading in the scene's XZ plane, from her root's rotation (her bow is +Z in her own
// frame). A boat with no rotation takes the given yaw.

export const boatForward = (boat, yaw) => {
  const q = boat?.GameObject?.rotation;
  if (!q) return [Math.sin(yaw), 0, Math.cos(yaw)];
  const fx = 2 * (q[0] * q[2] + q[3] * q[1]), fz = 1 - 2 * (q[0] * q[0] + q[1] * q[1]);
  const l = Math.hypot(fx, fz) || 1;
  return [fx / l, 0, fz / l];
};
