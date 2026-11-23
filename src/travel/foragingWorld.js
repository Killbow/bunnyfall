// The world's foraging wait, the online wait on the wait page, and keptBox, the quest box a save
// can hold behind that wait.
import { areEnemiesNearby } from '../characters/encounters.js';
import { createForagingWait } from '../professions/foragingWait.js';
import { playerEntity } from '../characters/playerEntity.js';
import { sharedClockOn } from '../world/worldTick.js';

/** @param {any} shared */
export function createForagingWorld(shared) {
  const { duelEnemyNear, townTalk } = shared;
  // FORAGE4 (bible/06-Systems/Foraging.md 13.1): online, QAE's `raise time by` is a wait on the wait page, in
  // the same slot - opened only when the slot is free (the tool's box and the pack closed first), the quest's boxes
  // held behind it, a foe near (the rest test, a duel's foe with it) ending it with the rest forgiven
  const foragingWait = createForagingWait({
    entity: playerEntity,
    showOverlay: (w) => townTalk.showOverlay(w),
    overlayActive: () => townTalk.overlayActive || !!shared.modes?.overlayHeld,
    enemiesNear: () => duelEnemyNear() || areEnemiesNearby(shared.exteriorFoePool(), { resting: true }),
    online: () => sharedClockOn(),
    // AUDIT 28 F6: what a save kept behind the wait, given back - a quest's box of words, a quest's reward
    revive: (keep) => { if (keep?.box) shared.showQuestBox(keep.box); else if (keep?.reward) shared.giveReward(keep.reward); },
  });
  /** AUDIT 28 F6: a quest box the save can keep - its words alone (a prompt's answer is a closure, and stays this page's). */
  const keptBox = (box) => {
    if (!box || Object.values(box).some((v) => typeof v === 'function')) return null;
    try { return { box: JSON.parse(JSON.stringify(box)) }; } catch { return null; }
  };
  return { foragingWait, keptBox };
}
