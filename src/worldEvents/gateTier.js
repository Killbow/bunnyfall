// @ts-check

export const GATE_TIERS = Object.freeze(['regular', 'elite', 'super']);
export const GATE_TIER_TEXT = Object.freeze({ regular: "Dagon's Breach", elite: 'Elite Breach', super: 'Abyss Breach' });
export const GATE_TIER_SUB = Object.freeze({ elite: 'The Battlespire' });
// Mirrors `EG_ROOM` in `net/eliteGates/egLaw.js` without importing it; keep the two patterns in sync.
const EG_ROOM_RE = /^eg:[0-9a-f]{16}$/;

/**
 * @param {any} x
 * @returns {'regular'|'elite'|null}
 */
export function gateTier(x) {
  if (x == null) return null;
  if (typeof x === 'string') return EG_ROOM_RE.test(x) ? 'elite' : null;
  if (x.kind === 'eg' || (typeof x.b === 'string' && x.b.length > 0)) return 'elite';
  if (x.kind === 'gate' || Number.isSafeInteger(x.day)) return 'regular';
  return null;
}

export const gateTierText = (x) => { const t = gateTier(x); return t ? GATE_TIER_TEXT[t] : null; };

/** @param {{ opener?: string, mine?: boolean }} o */
export function eliteBreachPlaque({ opener = '', mine = false } = {}) {
  /** @type {string[]} */
  const subs = [GATE_TIER_SUB.elite];
  if (!mine && opener) subs.push(`${opener}'s company`);
  return { title: GATE_TIER_TEXT.elite, subs };
}

// Uses the same rounding as `sightLineOf` in `world/spawnedDungeons.js` (nearest 10 m, minimum 10); keep them in
// sync.
export function gateSightLine(metres, direction, tier = 'elite') {
  const m = Math.max(10, Math.round(metres / 10) * 10);
  const what = tier === 'regular' ? GATE_TIER_TEXT.regular : tier === 'super' ? `an ${GATE_TIER_TEXT.super}` : `an ${GATE_TIER_TEXT.elite}`;
  return `You see ${what} ${m} meters to the ${direction}!`;
}

export const eliteTimerText = ({ h = 0, clock = '' } = {}) => (h > 0 ? `Hall ${h} - ${clock} left` : `${GATE_TIER_TEXT.elite} opens ${clock}`);
