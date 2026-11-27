// @ts-check
import { RAID_CREW } from './navalBoarding.js';
import { WA_RAID_QUESTS } from './warmAshesShips.js';

export const questFoesOf = (quest, foes) => (quest ? (foes ?? []).filter((f) => f && !f.dead && f.questBehaviour?.questUID === quest.uid) : []);

/** @param {{ pools: () => ({ foes: () => any[], remove: (foe: any) => void } | null)[] }} deps */
export function createRaidAshore(deps) {
  const ending = new Set();
  function withdraw(quest) {
    let n = 0;
    for (const pool of deps.pools?.() ?? []) {
      if (!pool) continue;
      for (const f of questFoesOf(quest, [...pool.foes()])) { pool.remove(f); n++; }
    }
    return n;
  }
  return {
    over(quest) {
      if (!quest) return 0;
      // A wave in flight can land in the grace ticks after end quest, so enemies are withdrawn again when it ends.
      ending.add(quest.uid);
      return withdraw(quest);
    },
    questEnded(quest) {
      if (!quest || !ending.has(quest.uid)) return 0;
      ending.delete(quest.uid);
      return withdraw(quest);
    },
    won(quest) {
      if (!quest) return 0;
      if (quest.questTombstoned) return withdraw(quest);
      const n = this.over(quest);
      // End through endQuest's grace ticks, never a break: outside a tick, a break cuts the victory gong's tick.
      if (!quest.questComplete && !(quest.ticksToEnd > 0)) quest.endQuest();
      return n;
    },
    crew(quest) {
      let n = 0;
      for (const pool of deps.pools?.() ?? []) {
        if (!pool) continue;
        for (const f of questFoesOf(quest, [...pool.foes()])) if (f.questBehaviour?.targetSymbol?.name === RAID_CREW) { pool.remove(f); n++; }
      }
      return n;
    },
    late(quest, f) {
      // Only a raid withdraws a late enemy; another quest's late enemy stays, as Daggerfall Unity places it.
      if (!quest || !f || f.dead || !WA_RAID_QUESTS.includes(quest.questName) || !(ending.has(quest.uid) || quest.questTombstoned)) return false;
      for (const pool of deps.pools?.() ?? []) if (pool?.foes().includes(f)) { pool.remove(f); return true; }
      return false;
    },
    get ending() { return ending.size; },
  };
}
