// @ts-check
// SHIP-WATCH (2026-10-01, Mac: "Do #3" - life aboard between fights: "crew sleep below at night, and a lookout up the
// mast calls 'Sail ho!'. The crew swab decks, haul lines and patch damage after a fight"; "If not already, ships at
// night should use their lanterns (AI)"; "I also want to keep improving the AI") - THE SEA BY NIGHT AND THE WATCH
// KEPT. The port's own; pure - the hour, the ships about and their lanterns in, the laws out.
//
// THE WATCH. From SLEEP_FROM_HOUR to SLEEP_TO_HOUR a crew sleeps below but its watch (`watchCount`, a third of them,
// one at least): the helmsman at his wheel, the lookout at the bow, and the first of the rest by the roster's order.
// The guns, a muster or her colours struck call every hand up at once (crewLife.js).
//
// THE LANTERNS BY NIGHT. A ship lights her lanterns at the city lights' hour (DaggerfallLight's, as Come Sail Away's
// boats do) - but not every ship: `runsDark` - a pirate prowls with hers out, and a merchantman running from a threat
// douses hers. A lit ship is seen far across the water; a dark one only close (`nightSight`): every captain's lookout
// (navalAI.js), and the player's own. Past LAMP_NEAR_M a lit ship's lanterns are drawn as points
// of light (`lampSize`, `lampAlpha`) - her own lantern flats are a pixel at that range and the light list holds the
// nearest eight, so the sea at night showed nothing of a ship but her black hull against the black water.
//
// THE LOOKOUT. AUDIT NAV1's SAIL HO! (navalHost.js hailSails) is cried by my crew's lookout at the bow now (crewLife.js
// `ctx.call`), and by night only as far as he can see her (`nightSight`): a pirate running dark is hailed close aboard.

/** The crew's sleeping hours (the world's hour, 0-23): from SLEEP_FROM_HOUR to before SLEEP_TO_HOUR. */
export const SLEEP_FROM_HOUR = 22;
export const SLEEP_TO_HOUR = 5;
/** Whether a crew sleeps at `hour` (but its watch). */
export const asleepHour = (hour) => Number.isFinite(hour) && (hour >= SLEEP_FROM_HOUR || hour < SLEEP_TO_HOUR);
/** How many of `n` keep the night watch: a third, one at least. */
export const watchCount = (n) => (n > 0 ? Math.max(1, Math.ceil(n / 3)) : 0);

/** By night a lit ship is seen no farther than NIGHT_LIT_SIGHT (m), a dark one than NIGHT_DARK_SIGHT. */
export const NIGHT_LIT_SIGHT = 650;
export const NIGHT_DARK_SIGHT = 220;
/**
 * How far `range` (a lookout's reach by day) sees a contact by night: a lit one to NIGHT_LIT_SIGHT, a dark one to
 * NIGHT_DARK_SIGHT - never farther than by day. By day, `range` itself.
 * @param {number} range @param {{ night?: boolean, lit?: boolean }} o
 */
export function nightSight(range, { night = false, lit = false } = {}) {
  if (!night) return range;
  return Math.min(range, lit ? NIGHT_LIT_SIGHT : NIGHT_DARK_SIGHT);
}

/**
 * Whether a ship sails with her lanterns out tonight: a pirate prowling (afloat - a struck one has nothing left to
 * hide), or a merchantman running from a threat ('flee'). A navy's are always lit.
 * @param {{ faction?: string | null, mode?: string | null, afloat?: boolean }} o
 */
export function runsDark({ faction = null, mode = null, afloat = true } = {}) {
  if (!afloat) return false;
  if (faction === 'pirate') return true;
  return faction === 'merchant' && mode === 'flee';
}

/** A far ship's lanterns: drawn from LAMP_NEAR_M, whole by LAMP_NEAR_M + LAMP_FADE_M; never under LAMP_MIN_M across,
 *  and LAMP_ANGLE of the eye's view (radians) - a few pixels at any range; LAMP_MAX of her lanterns a ship. */
export const LAMP_NEAR_M = 45;
export const LAMP_FADE_M = 45;
export const LAMP_MIN_M = 0.5;
export const LAMP_ANGLE = 0.004;
export const LAMP_MAX = 4;
export const LAMP_COLOR = Object.freeze([1, 0.62, 0.22]);
/** A lamp's size (m) at `dist` (m) from the eye. */
export const lampSize = (dist) => Math.max(LAMP_MIN_M, dist * LAMP_ANGLE);
/** A lamp's strength (0..1) at `dist` - nought within LAMP_NEAR_M, where her own lantern flats are seen. */
export const lampAlpha = (dist) => Math.min(1, Math.max(0, (dist - LAMP_NEAR_M) / LAMP_FADE_M));
/**
 * Up to LAMP_MAX of `points`, spread along the list (a galleon's eighteen lanterns hang stem to stern in the model's
 * order): the first, the last and between.
 * @template T @param {T[]} points @returns {T[]}
 */
export function lampPoints(points) {
  if (points.length <= LAMP_MAX) return points.slice();
  const out = [];
  for (let k = 0; k < LAMP_MAX; k++) out.push(points[Math.round(k * (points.length - 1) / (LAMP_MAX - 1))]);
  return out;
}

/** A far lamp's reflection runs LAMP_STREAK (radians of the view) below it; it shows from STREAK_NEAR_M (m) of the
 *  eye and is whole at twice that. Nearer, the water's own lights draw it. */
export const LAMP_STREAK = 0.06;
export const STREAK_NEAR_M = 20;

/**
 * Far lamps' reflections on the sea, one reused particle record each (render/navalRender.js). Each streak is an upright
 * quad part of the way from the eye to its lamp, rising from the sea. It covers the band of the screen a streak on the
 * water would, and it never sinks below the sea's surface. It flickers on the swell.
 */
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
