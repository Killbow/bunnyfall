// The world's rest key: toggleRest checks the enemies, the ground, and the racial block, then
// the stranger and party gates and the ailments, and opens the rest window.
import { ActionTextBox } from '../ui/actionText.js';
import { createRestWindow } from '../ui/restDoor.js';
import { DecisionBoxWindow } from '../ui/decisionBox.js';
import { getPreventedRestMessage, restDecision } from '../player/restSession.js';
import { giveOffer } from '../ui/pendingOffer.js';
import { ownMinutes } from './worldTick.js';
import { plainLines } from '../scenes/shared.js';
import { playerEntity } from '../characters/playerEntity.js';
import { racialRestBlock } from '../afflictions/vampirism.js';
import { restAilmentLines } from '../player/restWarning.js';
import { setEnemyAlert } from '../characters/encounters.js';
import { startRestGroundedCheck } from '../player/motor.js';

/** @param {any} shared */
export function createRestToggleWorld(shared) {
  const { collider, outdoorRestDeps, player, townTalk } = shared;
  const toggleRest = () => {
    if (townTalk.overlayActive) return;
    const rb = racialRestBlock(playerEntity, Math.floor(ownMinutes()));
    const d = restDecision({
      enemiesNearby: outdoorRestDeps.enemiesNearby(),
      swimming: !!player.isPlayerSwimming,
      grounded: startRestGroundedCheck(!!player.grounded, player.pos, collider),
      preventedMessage: getPreventedRestMessage,
      giveOffer,
      ...(shared._restFromBed ? { giveOffer: null } : null),
      racialOverrideBlocks: !!rb,
    });
    if (d.kind !== 'rest') {
      if (d.kind === 'enemies') setEnemyAlert(playerEntity, true, Math.floor(ownMinutes()));
      if (d.kind === 'offer') return;
      if (d.kind === 'blocked') {
        const lines = plainLines(townTalk.lines(rb.textId));
        if (lines) townTalk.showOverlay(new ActionTextBox(lines));
        return;
      }
      const lines = d.message ? [d.message] : plainLines(townTalk.lines(d.textId));
      if (lines) townTalk.showOverlay(new ActionTextBox(lines));
      return;
    }
    const strangerRefusal = shared.modes ? shared.strangerRestGate() : null;
    if (strangerRefusal) { townTalk.showOverlay(new ActionTextBox([strangerRefusal])); return; }
    const partyRefusal = shared.modes ? shared.partyRestGate() : null;
    if (partyRefusal) { townTalk.showOverlay(new ActionTextBox([partyRefusal])); return; }
    const bed = shared._restFromBed, restNow = () => { if (shared.modes) shared.markPartyRestSpent(); townTalk.showOverlay(createRestWindow(outdoorRestDeps, bed)); };
    const ail = restAilmentLines(playerEntity);
    if (ail) { let yes = false; townTalk.showOverlay(new DecisionBoxWindow({ rows: ail, onYes: () => { yes = true; } }), () => { if (yes) restNow(); }); return; }
    restNow();
  };
  return { toggleRest };
}
