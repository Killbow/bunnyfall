// @ts-check
// sigilSetPowers.js imports this module, so no host loads it directly.
import { registerPlayerStrikeListener } from './formulas.js';
import { getItemHands, ITEM_HANDS } from '../characters/equipTable.js';
import { weaponSkillUsed } from '../characters/weapons.js';
import { SKILLS } from '../characters/skills.js';
import { cleaveNear } from '../items/sigilSetPowers.js';
// This import registers the whole melee rework; formulas.js cannot import it while entityMods.js is mid-load.
import { MELEE_REWORK, cleaveOf } from './meleeRework.js';

export function cleaves(weapon) {
  if (!MELEE_REWORK.on || !weapon || !Number.isInteger(weapon.templateIndex)) return false;
  if (weaponSkillUsed(weapon.templateIndex) === SKILLS.Archery) return false;
  try { return getItemHands(weapon) === ITEM_HANDS.Both; } catch { return false; }
}

registerPlayerStrikeListener('melee-cleave', (attacker, target, damage, weapon) => {
  if (!(damage > 0) || !cleaves(weapon) || target?.warded || target?.isPlayer) return;
  const c = cleaveOf(weapon);
  cleaveNear(target, (damage * c.share) / 100, weapon, { count: c.count, metres: c.metres });
});
