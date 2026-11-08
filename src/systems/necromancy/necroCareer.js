// @ts-check
// BUNNYFALL (2026-11-06): CHEB'S NECROMANCY - THE NECROMANCER (GenerateNecromancerCareer, the mod's config defaults:
// systems/necromancy/necroLaw.js NECROMANCER). A chargen pick of its own, after the eighteen and before Custom
// (ui/chargen.js), and made as a custom class is - the builder's career and its specials through the builder's own
// parser - so every place a custom career goes (the save keeps it whole, the custom spell rule, the custom kit) takes it
// with nothing new. `necromancer: true` marks it for the kit (systems/necromancy/necromancy.js giveNecromancerKit).
import { buildCustomCareer } from '../customClass.js';
import { parseCareerData } from '../specialAdvantages.js';
import { NECROMANCER, NECROMANCER_NAME } from './necroLaw.js';

/** A fresh Necromancer career. */
export function necromancerCareer() {
  const career = buildCustomCareer({ name: NECROMANCER_NAME, hp: NECROMANCER.hp, skills: [...NECROMANCER.skills], stats: { ...NECROMANCER.stats } });
  parseCareerData(career, NECROMANCER.specials.map((s) => ({ ...s })));
  career.advancementMultiplier = NECROMANCER.advancementMultiplier;
  career.necromancer = true;
  return career;
}
/** Its page in the class list (GetCustomClasses), as the box's rows. */
export const necromancerDescription = () => NECROMANCER.description.map((text) => ({ text, center: true }));
export { NECROMANCER_NAME };
