import { equipTableOf, getEquipSlot, isBrokenItem, EQUIP_SLOTS } from '../characters/equip.js';
import { plateMetal } from '../items/armorMaterials.js';
import { rriNativeMaterialValue } from '../mods/rriItems.js';
import { weaponMaterialModifier, WEAPON_MATERIALS } from '../characters/weapons.js';

export const CLAW_METAL_MAX = weaponMaterialModifier(WEAPON_MATERIALS.Daedric);

// Classic Daggerfall claws ignore gear; here plate gauntlets add their metal modifier to every claw hit.
export function clawMetalDamage(entity) {
  if (Number.isInteger(entity?.clawMetal)) return entity.clawMetal;
  if (!entity?.isInBeastForm) return 0;
  const g = equipTableOf(entity)[EQUIP_SLOTS.Gloves];
  if (!g || isBrokenItem(g) || getEquipSlot(entity, g) !== EQUIP_SLOTS.Gloves) return 0;
  const metal = plateMetal(rriNativeMaterialValue(g));
  return metal === null ? 0 : Math.max(0, weaponMaterialModifier(metal));
}
