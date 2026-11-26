// @ts-check
import { t } from '../../ui/textManager.js';
import { residentOfId } from './people.js';

const FRIEND_TEXT = '{name} now considers you a friend.';
const FRIEND_COURT_TEXT = '{name} now considers you a friend. You can court them by asking about Courtship under Tell me about.';

/** @param {{ name: string, court: boolean }} who */
export function friendLine({ name, court }) {
  return court ? t('livingWorld.friend.court', FRIEND_COURT_TEXT, { name }) : t('livingWorld.friend.made', FRIEND_TEXT, { name });
}

/**
 * @param {string[]} ids
 * @param {(mapId: number) => any} townOf
 * @param {(person: any) => { topic?: string }[]} topicsOf
 * @returns {{ name: string, court: boolean }[]}
 */
export function friendCards(ids, townOf, topicsOf) {
  return ids.map((id) => residentOfId(id, townOf)).filter(Boolean)
    .map((res) => ({ name: res.name, court: (topicsOf({ living: { res } }) ?? []).some((r) => r.topic === 'court') }));
}
