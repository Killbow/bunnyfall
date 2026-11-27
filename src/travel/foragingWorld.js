import { areEnemiesNearby } from '../characters/encounters.js';
import { createForagingWait } from '../professions/foragingWait.js';
import { playerEntity } from '../characters/playerEntity.js';
import { sharedClockOn } from '../world/worldTick.js';

/** @param {any} shared */
export function createForagingWorld(shared) {
  const { duelEnemyNear, townTalk } = shared;
  const foragingWait = createForagingWait({
    entity: playerEntity,
    showOverlay: (w) => townTalk.showOverlay(w),
    overlayActive: () => townTalk.overlayActive || !!shared.modes?.overlayHeld,
    enemiesNear: () => duelEnemyNear() || areEnemiesNearby(shared.exteriorFoePool(), { resting: true }),
    online: () => sharedClockOn(),
    revive: (keep) => { if (keep?.box) shared.showQuestBox(keep.box); else if (keep?.reward) shared.giveReward(keep.reward); },
  });
  const keptBox = (box) => {
    if (!box || Object.values(box).some((v) => typeof v === 'function')) return null;
    try { return { box: JSON.parse(JSON.stringify(box)) }; } catch { return null; }
  };
  return { foragingWait, keptBox };
}
