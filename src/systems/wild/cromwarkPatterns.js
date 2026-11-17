// @ts-check
// Deterministic patterns. Origins and yaw lock BEFORE the warning begins.
// Marks are both the renderer's shapes and the collision shapes, in metres/seconds.
import { cromwarkProfile } from './cromwarkRoster.js';
const TAU = Math.PI * 2;
export function cromwarkPattern(id, origin, yaw, serial = 0, elite = false, aimDistance = 6) {
  const p = cromwarkProfile(id), marks = [], shots = [];
  const point = (r, a) => [origin[0] + Math.sin(a) * r, origin[1], origin[2] + Math.cos(a) * r];
  const disc = (o, r, land, damage = .12, extra = {}) => marks.push({ kind: 'slam', origin: [...o], yaw: 0,
    dim: { r, ahead: 0 }, start: Math.max(0, land - 1.2), land, damage, ...extra });
  const lane = (o, a, len, halfW, land, damage, extra = {}) => marks.push({ kind: 'lunge', origin: [...o], yaw: a,
    dim: { len, halfW }, start: Math.max(0, land - 1), land, damage, ...extra });
  const ring = (rIn, rOut, land, damage = .12) => marks.push({ kind: 'ring', origin: [...origin], yaw: 0,
    dim: { rIn, rOut }, start: land - 1.3, land, damage });
  switch (p?.key) {
    case 'judge': {
      disc(origin, 1.6, 1.25, .06);
      const n = elite ? 18 : 14;
      for (let wave = 0; wave < 3; wave++) for (let i = 0; i < n; i++) {
        // Even spacing and a consistent gap between each pair, including at melee range.
        const a = yaw + i * TAU / n + wave * Math.PI / n;
        shots.push({ origin: point(1.8, a), yaw: a, start: 1.25 + wave * .75, speed: 3.2, life: 4.5, r: .22, damage: .045 });
      }
      break;
    }
    case 'horror-mite':
      if (serial % 3 === 0) { ring(0, 3.3, 1.15, .15); ring(3.8, 5.6, 2.5, .12); }
      else for (let i = 0; i < 3; i++) lane(point(i * 4, yaw), yaw, 4, .65, 1 + i * .95, .13, { dash: true });
      break;
    case 'gazadar':
      lane(origin, yaw, 25, .6, 1.25, .17);
      if (elite) { lane(origin, yaw - .32, 25, .5, 2.7, .13); lane(origin, yaw + .32, 25, .5, 2.7, .13); }
      break;
    case 'crystal-hulk':
      disc(point(2.5, yaw), 3.2, 1.4, .2, { push: 10 });
      if (elite || serial % 2 === 0) ring(3.8, 6.8, 2.9, .14);
      break;
    case 'bishop':
      { const center = point(aimDistance, yaw);
        disc(center, 2.5, 1.25);
        for (let i = 0; i < (elite ? 7 : 5); i++) {
          const a = yaw + i * TAU / (elite ? 7 : 5);
          disc([center[0] + Math.sin(a) * 5, center[1], center[2] + Math.cos(a) * 5], 2.1, 2.7 + (i % 2) * .65);
        }
      }
      break;
    case 'pain':
      ring(3, 5.5, 1.5);
      // Alternating spokes leave broad wedges safe; the delayed inner disc stops camping.
      for (let i = 0; i < 4; i++) lane(origin, yaw + serial * .31 + i * TAU / 4, 10, .65, 3, .13);
      ring(6, 9, 4.5);
      disc(origin, 2.4, 4.5);
      if (elite) for (let i = 0; i < 4; i++) disc(point(7, yaw + Math.PI / 4 + i * TAU / 4), 1.8, 5.9);
      break;
    case 'frozen':
      disc(point(aimDistance, yaw), 3.2, 1.5, .09, { slow: true });
      if (elite || serial % 2 === 0) disc(point(Math.max(2, aimDistance - 4), yaw), 2.8, 3, .09, { slow: true });
      break;
  }
  for (const m of marks) { m.color = p.color; m.duration = m.dash ? .3 : .24; }
  return { marks, shots, duration: Math.max(0, ...marks.map((m) => m.land + m.duration), ...shots.map((s) => s.start + s.life)) + .8 };
}

export function inCromwarkMark(m, feet, radius = .22) {
  if (Math.abs(feet[1] - m.origin[1]) > 2.5) return false;
  const x = feet[0] - m.origin[0], z = feet[2] - m.origin[2], d = Math.hypot(x, z);
  if (m.kind === 'ring') return d + radius >= m.dim.rIn && d - radius <= m.dim.rOut;
  if (m.kind === 'slam') return d <= m.dim.r + radius;
  const along = x * Math.sin(m.yaw) + z * Math.cos(m.yaw), across = -x * Math.cos(m.yaw) + z * Math.sin(m.yaw);
  return along >= -.3 - radius && along <= m.dim.len + radius && Math.abs(across) <= m.dim.halfW + radius;
}

export function shotPosition(s, age) {
  const d = Math.max(0, age - s.start) * s.speed;
  return [s.origin[0] + Math.sin(s.yaw) * d, s.origin[1] + .8, s.origin[2] + Math.cos(s.yaw) * d];
}
// Swept capsule vs slow projectile; a hitch cannot skip over the player.
export function shotHits(s, age0, age1, feet, height = 1.8) {
  const a = shotPosition(s, age0), b = shotPosition(s, age1);
  if (a[1] + s.r < feet[1] || a[1] - s.r > feet[1] + height) return false;
  const dx = b[0] - a[0], dz = b[2] - a[2], ll = dx * dx + dz * dz;
  const t = ll ? Math.max(0, Math.min(1, ((feet[0] - a[0]) * dx + (feet[2] - a[2]) * dz) / ll)) : 0;
  return Math.hypot(feet[0] - a[0] - dx * t, feet[2] - a[2] - dz * t) <= s.r + .22;
}
