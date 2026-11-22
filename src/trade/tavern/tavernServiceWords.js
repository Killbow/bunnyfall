// @ts-check
import { t } from '../../ui/textManager.js';
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
const pick = (list, n) => list[Math.abs(Math.trunc(Number(n) || 0)) % list.length];
/** What a customer calls out for a new order. Named only; the recipe book holds the measures. */
export function tavernOrderLine(recipe, n = 0) {
  const drink = tavernRecipeName(recipe);
  return pick([
    t('tavern.service.order.1', 'A {drink}, please.', { drink }),
    t('tavern.service.order.2', "Barkeep! One {drink}, and don't be stingy.", { drink }),
    t('tavern.service.order.3', "I've walked all day for a {drink}. Be a friend?", { drink }),
    t('tavern.service.order.4', 'Is it too late for a {drink}? Never mind, bring it anyway.', { drink }),
    t('tavern.service.order.5', 'Whatever the bard is drinking. No, wait. A {drink}.', { drink }),
    t('tavern.service.order.6', 'My cup is empty and my heart is heavy. A {drink}, if you would.', { drink }),
  ], n);
}
/** A satisfied customer, as the cup is handed over. */
export function tavernThanksLine(n = 0) {
  return pick([
    t('tavern.service.thanks.1', 'Ahh. That hits the spot.'),
    t('tavern.service.thanks.2', 'Now that is a proper pour.'),
    t('tavern.service.thanks.3', 'The College trains you well, bard.'),
    t('tavern.service.thanks.4', 'Gods, I needed that.'),
    t('tavern.service.thanks.5', 'Better than my mother used to make. Do not tell her.'),
    t('tavern.service.thanks.6', 'To your health, and to mine!'),
  ], n);
}
/** A customer handed the wrong mixture. */
export function tavernRefusedLine(n = 0) {
  return pick([
    t('tavern.service.refused.1', 'That smells wrong. Are you trying to poison me?'),
    t('tavern.service.refused.2', "That's not what I asked for, friend."),
    t('tavern.service.refused.3', 'Bah! Take it back and try again.'),
  ], n);
}
/** One line of cellar lore per recipe, printed in the book under its measures. */
export function tavernRecipeNote(id) {
  return ({
    griffin: t('tavern.service.note.griffin', 'Strong enough to stand a griffin on its hind legs.'),
    vigil: t('tavern.service.note.vigil', 'For whoever stays up after the fire burns low.'),
    smuggler: t('tavern.service.note.smuggler', 'Dark, quiet, and nobody saw you buy it.'),
    midnight: t('tavern.service.note.midnight', 'Sign nothing. Drink everything.'),
    beggar: t('tavern.service.note.beggar', "A king's thirst on a beggar's coin."),
    dibella: t('tavern.service.note.dibella', 'Soft, sweet, and a little sinful.'),
    duchess: t('tavern.service.note.duchess', 'Smooth as silk and twice as dangerous.'),
    pilgrim: t('tavern.service.note.pilgrim', 'Something warm at the end of a long road.'),
    secret: t('tavern.service.note.secret', 'One of everything. Do not tell the other inns.'),
  })[id] ?? '';
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
