// @ts-check
export const SLEEP_FROM_HOUR = 22;
export const SLEEP_TO_HOUR = 5;
export const asleepHour = (hour) => Number.isFinite(hour) && (hour >= SLEEP_FROM_HOUR || hour < SLEEP_TO_HOUR);
export const watchCount = (n) => (n > 0 ? Math.max(1, Math.ceil(n / 3)) : 0);

export const NIGHT_LIT_SIGHT = 650;
export const NIGHT_DARK_SIGHT = 220;
/**
 * @param {number} range
 * @param {{ night?: boolean, lit?: boolean }} o
 */
export function nightSight(range, { night = false, lit = false } = {}) {
  if (!night) return range;
  return Math.min(range, lit ? NIGHT_LIT_SIGHT : NIGHT_DARK_SIGHT);
}

/** @param {{ faction?: string | null, mode?: string | null, afloat?: boolean }} o */
export function runsDark({ faction = null, mode = null, afloat = true } = {}) {
  if (!afloat) return false;
  if (faction === 'pirate') return true;
  return faction === 'merchant' && mode === 'flee';
}

// Past LAMP_NEAR_M a ship's own lantern flats shrink to a pixel, so its lamps are drawn as points from there.
export const LAMP_NEAR_M = 45;
export const LAMP_FADE_M = 45;
export const LAMP_MIN_M = 0.5;
export const LAMP_ANGLE = 0.004;
export const LAMP_MAX = 4;
export const LAMP_COLOR = Object.freeze([1, 0.62, 0.22]);
export const lampSize = (dist) => Math.max(LAMP_MIN_M, dist * LAMP_ANGLE);
export const lampAlpha = (dist) => Math.min(1, Math.max(0, (dist - LAMP_NEAR_M) / LAMP_FADE_M));
/**
 * @template T
 * @param {T[]} points
 * @returns {T[]}
 */
export function lampPoints(points) {
  if (points.length <= LAMP_MAX) return points.slice();
  const out = [];
  for (let k = 0; k < LAMP_MAX; k++) out.push(points[Math.round(k * (points.length - 1) / (LAMP_MAX - 1))]);
  return out;
}

export const LAMP_STREAK = 0.06;
export const STREAK_NEAR_M = 20;

export function createLampStreaks() {
  /** @type {any[]} */
  const recs = [];
  let n = 0, seaY = 0, t = 0;
  /** @type {ArrayLike<number>} */
  let eye = [0, 0, 0];
  return {
    /** @param {ArrayLike<number>} eyeAt @param {number} sea @param {number} clock */
    begin(eyeAt, sea, clock) { n = 0; eye = eyeAt; seaY = sea; t = clock; },
    /** @param {any[]} out @param {ArrayLike<number>} p @param {number} d */
    into(out, p, d) {
      const he = eye[1] - seaY;
      if (he <= 0.5) return;
      const m = Math.min(12, (LAMP_STREAK * d) / he), k = 1 / (1 + m), tall = he * m * k * 1.15, wide = LAMP_ANGLE * 2.2 * d * k;
      const flick = 0.75 + 0.25 * Math.sin(t * 3.1 + p[0] * 0.7 + p[2] * 0.3);
      const r = (recs[n++] ??= { pos: [0, 0, 0], size: 0, rot: 0, color: [LAMP_COLOR[0], LAMP_COLOR[1] * 0.9, LAMP_COLOR[2] * 0.8, 0],
        blend: 'add', flat: false, solid: false, kind: 'lamp', aspect: 1 });
      r.pos[0] = eye[0] + (p[0] - eye[0]) * k;
      r.pos[1] = seaY + tall * 0.47;
      r.pos[2] = eye[2] + (p[2] - eye[2]) * k;
      r.size = tall;
      r.aspect = Math.min(1, wide / tall);
      r.color[3] = Math.min(1, (d - STREAK_NEAR_M) / STREAK_NEAR_M) * 0.9 * flick;
      out.push(r);
    },
  };
}
