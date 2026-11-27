// @ts-check
// Specialization reset: a chosen arcane or martial path given up for gold.

import { pathOf, SPEC_RESET_GOLD } from './arcanePaths.js';
import { martialPathOf } from './martialPaths.js';
import { totalGoldAmount, payUndoable } from '../justice/court.js';
import { accountOfSave, REALM_EMPIRE_ACCOUNT } from '../net/realmGoldLaw.js';
import { computeEntityMods } from './entityMods.js';
import { t } from '../ui/textManager.js';

const LAW = Object.freeze({
  arcane: { held: pathOf, field: 'arcanePath', prompted: 'pathPrompted' },
  martial: { held: martialPathOf, field: 'martialPath', prompted: 'martialPrompted' },
});

export const resetHeld = (entity, family) => (Object.hasOwn(LAW, family) ? LAW[family].held(entity) : null);
export const resetField = (family) => (Object.hasOwn(LAW, family) ? LAW[family].field : null);

const resetAccount = (entity) => (entity?._online === true ? accountOfSave(entity, REALM_EMPIRE_ACCOUNT) : null);

export function resetGold(entity) {
  const account = resetAccount(entity);
  return totalGoldAmount(entity) + Math.max(0, Number(account?.accountGold) || 0);
}

export function specResetRefusal(entity, family) {
  if (!Object.hasOwn(LAW, family)) return t('schools.refuse.none', 'No such specialization.');
  const held = resetHeld(entity, family);
  if (!held) return t('growth.spec.reset.refuse.nothing', 'You have no specialization of this kind to reset.');
  const have = resetGold(entity);
  if (have >= SPEC_RESET_GOLD) return null;
  const words = { gold: SPEC_RESET_GOLD, have };
  return entity?._online === true
    ? t('growth.spec.reset.refuse.gold', 'Resetting costs {gold, number} gold. You have {have, number}.', words)
    : t('growth.spec.reset.refuse.goldOffline', 'Resetting costs {gold, number} gold, paid in coins or letters of credit. You have {have, number}.', words);
}

export function resetSpec(entity, family) {
  const why = specResetRefusal(entity, family);
  if (why) return { ok: false, text: why };
  const held = resetHeld(entity, family);
  payUndoable(entity, SPEC_RESET_GOLD, resetAccount(entity));
  entity[LAW[family].field] = null;
  entity[LAW[family].prompted] = true;
  computeEntityMods(entity);
  return { ok: true, text: t('growth.spec.reset.done', '{name} has been reset.', { name: held.name }) };
}
