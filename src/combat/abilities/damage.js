// BUNNYFALL: what one ability beat weighs on the weapon's own rolled damage. A plain swing is 1.
// Normal weapon and combination abilities cost fatigue that comes back slowly, so each of their beats lands clearly
// harder than a plain swing, however many beats the ability splits into: a beat never weighs less than the floor.
// milestones.js already gives normal melee abilities a third of the cost and +0.35 potency, so potencyScale stays at 1
// and the floor does the work. Racial abilities and rank-100 capstones keep their own tuning (capstones add
// capstonePower on top).
export const ABILITY_DAMAGE = Object.freeze({
  potencyScale: 1,    // how much of a normal ability's potency reaches the blow
  meleeBeatFloor: 1.4, // the least one melee beat of a normal ability weighs
  shotFloor: 1.3,     // the least one arrow of a normal ability weighs
});

export const tunedAbility = ability => !!ability && ability.rank < 100
  && (ability.category === 'weapon' || ability.category === 'combination');

/** One melee beat: `share` of the ability's whole weight (1 + potency). */
export function meleeBeatMult(ability, potency, share, standBonus = 0) {
  const raw = (1 + potency + standBonus) * share;
  if (!tunedAbility(ability)) return raw;
  return Math.max(ABILITY_DAMAGE.meleeBeatFloor, (1 + (potency + standBonus) * ABILITY_DAMAGE.potencyScale) * share);
}

/** One arrow of `count`, with any rhythm bonus already added to potency. */
export function shotMult(ability, potency, count) {
  const raw = (1 + potency) / count;
  if (!tunedAbility(ability)) return raw;
  return Math.max(ABILITY_DAMAGE.shotFloor, (1 + potency * ABILITY_DAMAGE.potencyScale) / count);
}
