// @ts-check
// Keeps the player out of prop bodies after each motor step.

/**
 * @param {any} m
 * @param {number} radius
 */
export function keepOffBodies(m, radius) {
  const cover = m.collider?.cover;
  if (!cover?.near || m.freezeMotor > 0 || m.climb?.isClimbing || m._wall || m._pkMove || m.travelling?.()) return;
  const prev = m._prevPos, feet = m.pos[1], top = feet + m.height;
  cover.near(m.pos, radius, (it, cx, cy, cz) => {
    if (cy >= top || cy + it.h <= feet) return;
    const R = it.r + radius, dx = m.pos[0] - cx, dz = m.pos[2] - cz, d = Math.hypot(dx, dz);
    if (d >= R) return;
    const pd = Math.hypot(prev[0] - cx, prev[2] - cz);
    const to = pd >= R ? R : Math.max(d, pd);
    if (d >= to) return;
    const nx = d > 1e-6 ? dx / d : (pd > 1e-6 ? (prev[0] - cx) / pd : 1), nz = d > 1e-6 ? dz / d : (pd > 1e-6 ? (prev[2] - cz) / pd : 0);
    const push = to - d;
    m.collider.move(m.pos, nx * push, 0, nz * push, m.height, m.grounded && !m.jumping && !m.swimming && !m.levitating);
    const into = m._airVelX * nx + m._airVelZ * nz;
    if (into < 0) { m._airVelX -= into * nx; m._airVelZ -= into * nz; }
  });
}
