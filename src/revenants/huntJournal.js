// @ts-check
// A known revenant lair shows in the quest log as a side quest with the id hunt:<revenant id>. The journal faces are
// lazy chunks, so the revenant store registers its handler here once; this module imports nothing.

/** @type {{ abandon: (id: string) => boolean } | null} */
let _journal = null;
export function setHuntJournal(j) { _journal = j && typeof j === 'object' ? j : null; }
export const HUNT_QUEST_PREFIX = 'hunt:';
export const isHuntQuestId = (id) => typeof id === 'string' && id.startsWith(HUNT_QUEST_PREFIX);
export function abandonHuntQuest(id) {
  if (!isHuntQuestId(id) || !_journal) return false;
  try { return !!_journal.abandon(id.slice(HUNT_QUEST_PREFIX.length)); } catch { return false; }
}
