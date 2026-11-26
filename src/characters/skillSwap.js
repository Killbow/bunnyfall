// @ts-check
// Skill swap: a class skill given up for one outside the class, for gold.

import { SKILLS, SKILL_NAMES, levelUpSkillSum } from './skills.js';
import { careerGroupOf, isMasteredSkill } from './masterSkills.js';
import { resetGold } from './specReset.js';
import { payUndoable } from '../justice/court.js';
import { accountOfSave, REALM_EMPIRE_ACCOUNT } from '../net/realmGoldLaw.js';
import { t } from '../ui/textManager.js';

export const SKILL_SWAP_GOLD = 100_000;
const LIST = Object.freeze({ primary: 'primarySkills', major: 'majorSkills', minor: 'minorSkills' });
const ALL = Object.freeze([...new Set(Object.values(SKILLS))].filter((id) => Number.isInteger(id) && id >= 0 && id < SKILL_NAMES.length).sort((a, b) => a - b));

export function swapOutChoices(entity) {
  const c = entity?.career;
  return [...(c?.primarySkills ?? []), ...(c?.majorSkills ?? []), ...(c?.minorSkills ?? [])].filter((id) => !isMasteredSkill(entity, id));
}
export const swapInChoices = (entity) => (entity?.career ? ALL.filter((id) => careerGroupOf(entity, id) == null) : []);

export function skillSwapRefusal(entity, out, inn) {
  if (!entity?.career) return t('skillswap.refuse.career', 'You have no class to change.');
  if (!careerGroupOf(entity, out)) return t('skillswap.refuse.out', 'Choose one of your class skills to give up.');
  if (isMasteredSkill(entity, out)) return t('skillswap.refuse.mastered', 'A mastered skill stays in your class.');
  if (!swapInChoices(entity).includes(inn)) return t('skillswap.refuse.in', 'Choose a skill outside your class to take its place.');
  const have = resetGold(entity);
  if (have >= SKILL_SWAP_GOLD) return null;
  const words = { gold: SKILL_SWAP_GOLD, have };
  return entity._online === true
    ? t('skillswap.refuse.gold', 'Changing a class skill costs {gold, number} gold. You have {have, number}.', words)
    : t('skillswap.refuse.goldOffline', 'Changing a class skill costs {gold, number} gold, paid in coins or letters of credit. You have {have, number}.', words);
}

export const swapGroupOf = (entity, out) => careerGroupOf(entity, out);
const groupWord = (g) => (g === 'primary' ? t('growth.spec.group.primary', 'primary') : g === 'major' ? t('growth.spec.group.major', 'major') : t('growth.spec.group.minor', 'minor'));

export function swappedCareer(entity, out, inn) {
  const group = careerGroupOf(entity, out);
  if (!group) return entity?.career ?? null;
  const key = LIST[group];
  return { ...entity.career, [key]: entity.career[key].map((id) => (id === out ? inn : id)), swapped: true };
}
export const swapOpens = (entity, out, inn, possible) => !!entity?.career && possible({ ...entity, career: swappedCareer(entity, out, inn) });

function heldSum(entity) {
  const sum = levelUpSkillSum(entity), held = entity.currentLevelUpSkillSum;
  return held >= sum ? held : sum;
}
export const swapShortfall = (entity, out, inn) => (entity?.career
  ? Math.max(0, heldSum(entity) - levelUpSkillSum({ ...entity, career: swappedCareer(entity, out, inn) })) : 0);

export function swapSkill(entity, out, inn) {
  const why = skillSwapRefusal(entity, out, inn);
  if (why) return { ok: false, text: why };
  const group = careerGroupOf(entity, out);
  const held = heldSum(entity);
  payUndoable(entity, SKILL_SWAP_GOLD, entity._online === true ? accountOfSave(entity, REALM_EMPIRE_ACCOUNT) : null);
  entity.career = swappedCareer(entity, out, inn);
  const rise = Math.max(0, levelUpSkillSum(entity) - held);
  entity.startingLevelUpSkillSum = (entity.startingLevelUpSkillSum ?? 0) + rise;
  entity.currentLevelUpSkillSum = held + rise;
  return { ok: true, text: t('skillswap.done', '{inn} is now one of your {group} skills, in place of {out}.', { inn: SKILL_NAMES[inn], out: SKILL_NAMES[out], group: groupWord(group) }) };
}
