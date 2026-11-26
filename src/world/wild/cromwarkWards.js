import { MOBILE_TYPES } from '../../characters/mobileTypes.js';

export const CROMWARK_WARDKEEPER = MOBILE_TYPES.SkeletalWarrior;
export const CROMWARK_WARD_HP = 36;
export const CROMWARK_WARD_RANGE = 40;
export const CROMWARK_WARD_GLOW = Object.freeze([.28, 1, .73, .86]);
export const CROMWARK_WARDED_GLOW = Object.freeze([.28, 1, .73, .32]);

export function cromwarkWardRole(ring, slot, count, selected = true) {
  if (ring < 3 || !selected || count < 4) return 0;
  const split = ring >= 4 ? Math.ceil(count / 2) : count;
  const group = slot < split ? 1 : 2;
  return slot === split - 1 || slot === count - 1 ? group + 2 : group;
}

export function cromwarkWardSource(foe, foes) {
  const role = foe.wardRole;
  if (role !== 1 && role !== 2 || !foe.ai?.feet) return null;
  const [x, y, z] = foe.ai.feet;
  return foes.find(keeper => {
    if (keeper.wardRole !== role + 2 || keeper.dead || keeper.entity?.health <= 0 || !keeper.ai?.feet
      || keeper.puppet !== foe.puppet || keeper.entity?.team === 'PlayerAlly') return false;
    const same = foe.site ? foe.site === keeper.site
      : foe.puppet ? foe._pupCamp?.id != null && foe._pupCamp.id === keeper._pupCamp?.id
        : foe.campId != null && foe.campId === keeper.campId;
    const [kx, ky, kz] = keeper.ai.feet;
    return same && (x - kx) ** 2 + (y - ky) ** 2 + (z - kz) ** 2 <= CROMWARK_WARD_RANGE ** 2;
  }) ?? null;
}

export const cromwarkWardDamage = (damage) => damage > 0 ? Math.max(1, Math.round(damage * .1)) : damage;
