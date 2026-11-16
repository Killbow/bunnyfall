// @ts-check
import { t } from '../textManager.js';
/** Recipe names deliberately do not disclose their ingredients. */
export function tavernRecipeName(id) {
  const names = {
    griffin: t('tavern.service.recipe.griffin', "Griffin's Oath"), vigil: t('tavern.service.recipe.vigil', 'Last Vigil'),
    smuggler: t('tavern.service.recipe.smuggler', "Smuggler's Step"), midnight: t('tavern.service.recipe.midnight', 'Midnight Pact'),
    beggar: t('tavern.service.recipe.beggar', "Beggar's Crown"), dibella: t('tavern.service.recipe.dibella', "Dibella's Veil"),
    duchess: t('tavern.service.recipe.duchess', "Duchess's Kiss"), pilgrim: t('tavern.service.recipe.pilgrim', "Pilgrim's Rest"),
    secret: t('tavern.service.recipe.secret', "Innkeeper's Secret"),
  };
  return names[id] ?? id;
}
export function tavernIngredientName(id) {
  return ({ wine: t('tavern.service.wine', 'Wine'), cream: t('tavern.service.cream', 'Cream'), beer: t('tavern.service.beer', 'Beer') })[id] ?? id;
}
export function tavernServiceError(error) {
  if (error === 'tavern-too-soon') return t('tavern.service.tooSoon', 'Give the customer a moment before serving.');
  if (error === 'tavern-other-shift') return t('tavern.service.otherShift', 'You still have a shift at another tavern. Return there or wait for it to expire.');
  if (error === 'tavern-expired') return t('tavern.service.expired', 'This shift has expired. Ask the innkeeper to start another.');
  if (error === 'tavern-place') return t('tavern.service.place', 'Service is only available inside the tavern where your shift began.');
  return t('tavern.service.failed', 'The innkeeper could not confirm that action. Try again.');
}
