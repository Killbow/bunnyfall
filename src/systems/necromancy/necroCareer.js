// @ts-check
import { buildCustomCareer } from '../../characters/customClass.js';
import { parseCareerData } from '../../characters/specialAdvantages.js';
import { NECROMANCER, NECROMANCER_NAME } from './necroLaw.js';

export function necromancerCareer() {
  const career = buildCustomCareer({ name: NECROMANCER_NAME, hp: NECROMANCER.hp, skills: [...NECROMANCER.skills], stats: { ...NECROMANCER.stats } });
  parseCareerData(career, NECROMANCER.specials.map((s) => ({ ...s })));
  career.advancementMultiplier = NECROMANCER.advancementMultiplier;
  // The flag marks the career for isNecromancerCareer and the starting kit.
  career.necromancer = true;
  return career;
}
export const necromancerDescription = () => NECROMANCER.description.map((text) => ({ text, center: true }));
export { NECROMANCER_NAME };
