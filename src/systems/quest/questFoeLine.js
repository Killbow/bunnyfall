// @ts-check
import { questTitleOf } from '../../ui/questRail.js';

export const QUEST_FOE_PREFIX = 'Quest: ';

/**
 * @param {any} behaviour
 * @returns {string | null}
 */
export function questFoeLine(behaviour) {
  if (!behaviour) return null;
  const quest = behaviour.machine?.getQuest?.(behaviour.questUID) ?? null;
  if (!quest?.getResource?.(behaviour.targetSymbol)?.isFoe) return null;
  if (!quest.getLogMessages?.()?.length) return null;
  const title = questTitleOf(quest.displayName);
  return title ? `${QUEST_FOE_PREFIX}${title}` : null;
}

/**
 * @param {any} f
 * @returns {string[]}
 */
export function questFoeSubs(f) {
  const line = questFoeLine(f?.questBehaviour);
  return line ? [line] : [];
}
