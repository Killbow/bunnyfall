// The Wayfarer's Anchor lantern, drawn from impact engine sparks, a floor glow, and a soft light. The caller
// emits a beat every LANTERN_BEAT_S while the player is near, so the lantern looks steady without a mesh.
export const LANTERN_BEAT_S = 0.42;
// About two and a half beats overlap, so the glow holds steady.
const LIFE = 1.05;
// The engine adds light, so the cage is drawn as brass catching the candle rather than as dark iron.
const brass = Object.freeze({ hot: [0.85, 0.6, 0.3], main: [0.55, 0.34, 0.13], end: [0.3, 0.16, 0.05], light: [0, 0, 0], range: 1, lightS: 0.3 });
const glass = Object.freeze({ hot: [1, 0.92, 0.66], main: [1, 0.68, 0.3], end: [0.55, 0.28, 0.08], light: [1.5, 0.95, 0.45], range: 6, lightS: 0.5 });

function cagePoints() {
  const points = [];
  const half = 0.11, base = 0.06, top = 0.42;
  const corners = [[-half, -half], [half, -half], [half, half], [-half, half]];
  for (const [x, z] of corners) for (let i = 0; i <= 4; i++) points.push([x, base + (top - base) * i / 4, z, 0.022]);
  for (const y of [base, top]) {
    for (let c = 0; c < 4; c++) {
      const [ax, az] = corners[c], [bx, bz] = corners[(c + 1) % 4];
      points.push([(ax + bx) / 2, y, (az + bz) / 2, 0.02]);
    }
  }
  points.push([0, top + 0.05, 0, 0.05]);
  for (let i = 1; i < 6; i++) {
    const a = Math.PI * i / 6;
    points.push([Math.cos(a) * 0.09, top + 0.08 + Math.sin(a) * 0.1, 0, 0.016]);
  }
  return points;
}
const CAGE = cagePoints();

export function drawWayfarerLantern(fx, at, gy) {
  const y = Number.isFinite(gy) ? gy : at[1];
  const keep = { life: LIFE, g: 0, drag: 0, streak: 0, fadeIn: 0.12, sway: 0 };
  for (const [x, h, z, w] of CAGE) {
    fx._part(brass, [at[0] + x, y + h, at[2] + z], [0, 0, 0], { ...keep, w, I: 0.32 });
  }
  const breath = 0.9 + 0.2 * fx.rng();
  fx._part(glass, [at[0], y + 0.22, at[2]], [0, 0.02, 0], { ...keep, w: 0.07 * breath, w1: 1.1, shape: 3, I: 0.5 });
  fx._part(glass, [at[0], y + 0.24, at[2]], [0, 0, 0], { ...keep, w: 0.2, w1: 1, shape: 3, I: 0.12 });
  fx._decal(glass, [at[0], y + 0.03, at[2]], { shape: 5, r0: 0.55, r1: 0.55, life: LIFE, fadeIn: 0.12, I: 0.09 });
  fx._light(glass, [at[0], y - 0.15, at[2]], 0.3, { life: LIFE, fadeIn: 0.12, flick: 0.25 });
  return true;
}
