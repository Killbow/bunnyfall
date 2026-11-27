// What an ability beat weighs on the rolled weapon damage, where a plain swing is 1. Weapon and combination
// abilities below rank 100 never weigh less than the floor; racial abilities and capstones keep their own weights.
export const ABILITY_DAMAGE = Object.freeze({
  potencyScale: 1,
  meleeBeatFloor: 1.4,
  shotFloor: 1.3,
});

export const tunedAbility = ability => !!ability && ability.rank < 100
  && (ability.category === 'weapon' || ability.category === 'combination');

export function meleeBeatMult(ability, potency, share, standBonus = 0) {
  const raw = (1 + potency + standBonus) * share;
  if (!tunedAbility(ability)) return raw;
  return Math.max(ABILITY_DAMAGE.meleeBeatFloor, (1 + (potency + standBonus) * ABILITY_DAMAGE.potencyScale) * share);
}

export function shotMult(ability, potency, count) {
  const raw = (1 + potency) / count;
  if (!tunedAbility(ability)) return raw;
  return Math.max(ABILITY_DAMAGE.shotFloor, (1 + potency * ABILITY_DAMAGE.potencyScale) / count);
}
