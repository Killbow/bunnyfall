// @ts-check
// A shot's wire code is its index in SHOT_ORDER, so the order is a wire contract.
export const SHOT_ORDER = Object.freeze(['round', 'grape', 'chain', 'heated']);
export const SHOT_CODES = Object.freeze(Object.fromEntries(SHOT_ORDER.map((id, i) => [id, i])));

export const SHOT = Object.freeze({
  round: Object.freeze({ speed: 1, spread: 1, sweep: 0, hull: 1, sail: 1, crew: 1, reload: 1, fire: null, rigFire: false }),
  grape: Object.freeze({ speed: 0.82, spread: 2.4, sweep: 0.45, hull: 0.2, sail: 0.6, crew: 4, reload: 0.9, fire: null, rigFire: false }),
  chain: Object.freeze({ speed: 0.9, spread: 1.6, sweep: 0.3, hull: 0.22, sail: 4, crew: 0.6, reload: 1.15, fire: null, rigFire: false }),
  heated: Object.freeze({ speed: 1, spread: 1.1, sweep: 0, hull: 0.85, sail: 0.8, crew: 1, reload: 1.6, fire: 0.45, rigFire: true }),
});
export const GRAPE_FULL_S = 1.2;
export const GRAPE_SPENT_S = 2.6;
export const SHOT_SWITCH = 0.5;

export const shotId = (s) => (SHOT_ORDER.includes(s) ? s : 'round');
// The chain gun's row in GUNS is already chain shot, so chain is its natural load.
export const naturalShot = (gunKind) => (gunKind === 'chain' ? 'chain' : 'round');

// Factors apply over the gun's natural load; a gun firing its own load returns the same row, so AI tuning holds.
/**
 * @param {string} gunKind
 * @param {any} gun
 * @param {string | null} [shot]
 */
export function shotGun(gunKind, gun, shot) {
  const own = naturalShot(gunKind);
  const s = shot == null ? own : shotId(shot);
  if (!gun || gunKind === 'barrel' || s === own) return gun;
  const a = SHOT[s], o = SHOT[own];
  const k = (key) => a[key] / o[key];
  return Object.freeze({
    ...gun, shot: s,
    speed: gun.speed * k('speed'), yawSpread: gun.yawSpread * k('spread'), pitchSpread: gun.pitchSpread * k('spread'),
    radius: gun.radius + Math.max(0, a.sweep - o.sweep), reload: gun.reload * k('reload'),
    hull: gun.hull * k('hull'), sail: gun.sail * k('sail'), crew: gun.crew * k('crew'),
  });
}

export const FIRE_MOST = 0.9;
export function shotFireChance(shot, fireChance, k = 1) {
  const c = shot == null ? fireChance : SHOT[shotId(shot)].fire ?? fireChance;
  return k === 1 ? c : Math.min(FIRE_MOST, c * k);
}
export const shotRigFire = (shot) => shot != null && SHOT[shotId(shot)].rigFire;
export function shotReach(shot, t) {
  if (shot == null || shotId(shot) !== 'grape' || !(t > GRAPE_FULL_S)) return 1;
  return 1 - 0.5 * Math.min(1, (t - GRAPE_FULL_S) / (GRAPE_SPENT_S - GRAPE_FULL_S));
}
export const nextShot = (shot, dir = 1) => SHOT_ORDER[(SHOT_ORDER.indexOf(shotId(shot)) + (dir < 0 ? SHOT_ORDER.length - 1 : 1)) % SHOT_ORDER.length];
