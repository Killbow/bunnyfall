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
    // THE OPEN GATE (DaggerfallUI.cs:651-687), which is scene-free -
    // this host had none of it, because rest was a dungeon feature.
    // Outdoors all three inputs are live: real foes, real water, and a
    // levitating or falling player who cannot lie down.
    // V2b: the vampire's own rest gate - CheckStartRest is LAST in
    // DFU's ladder and the override speaks for itself (TEXT.RSC 36)
    const rb = racialRestBlock(playerEntity, Math.floor(ownMinutes()));   // LIVED1: fed on the character's own clock   // XL-1: the refusal's swim term below is PlayerEnterExit.IsPlayerSwimming (DaggerfallUI.cs:661), not PlayerMotor.IsSwimming
    const d = restDecision({
      enemiesNearby: outdoorRestDeps.enemiesNearby(),
      swimming: !!player.isPlayerSwimming,   // DaggerfallUI.cs:661
      // StartRestGroundedCheck, not the raw flag: a levitating player
      // an inch off the floor reads grounded === false and DFU lets
      // them sleep anyway (PlayerMotor.cs:190-193's own comment) - and
      // up here it is also what lets a page whose motor is never
      // stepped rest at all, since `grounded` sits at its initialiser.
      grounded: startRestGroundedCheck(!!player.grounded, player.pos, collider),
      // ROAD-B B5: the gate's third arm has a producer now. ROAD
      // review-p: the PRODUCER, not a poll - :667-669 fetches it
      // inside the third `else`, after the other two arms have
      // returned.
      preventedMessage: getPreventedRestMessage,
      // AUDIT 58: DaggerfallUI.cs:680's `else if (!GiveOffer())` -
      // a pending `give pc ... notify` offer takes this press and
      // the rest window stays shut (ui/pendingOffer.js).
      giveOffer,
      ...(shared._restFromBed ? { giveOffer: null } : null),
      racialOverrideBlocks: !!rb,
    });
    if (d.kind !== 'rest') {
      // DFU raises the enemy alert on the enemies arm
      // (DaggerfallUI.cs:655 - NOT the rest window's :655, which is
      // DoRestForAWhile; a bare citation here resolves to the wrong
      // file, since every other number in this block is the window's).
      if (d.kind === 'enemies') setEnemyAlert(playerEntity, true, Math.floor(ownMinutes()));   // LIVED1: the alert's decay is the character's
      // AUDIT 58: the offer took the press - the item was handed
      // over inside GiveOffer() and there is nothing to say.
      if (d.kind === 'offer') return;
      if (d.kind === 'blocked') {
        // V2b: the override's OWN refusal - the unfed vampire's box
        const lines = plainLines(townTalk.lines(rb.textId));
        if (lines) townTalk.showOverlay(new ActionTextBox(lines));
        return;
      }
      // plainLines: TEXT.RSC answers { text, center } ROWS and
      // ActionTextBox iterates STRINGS (V5b's finding).
      const lines = d.message ? [d.message] : plainLines(townTalk.lines(d.textId));
      if (lines) townTalk.showOverlay(new ActionTextBox(lines));
      return;
    }
    // STRANGER-REST1 (2026-09-20, per-request: "players not in a party
    // together cant rest near each other in a 100m radius"): checked FIRST -
    // a stranger standing close by blocks resting regardless of party status
    // at all, even for a solo player with no party.
    const strangerRefusal = shared.modes ? shared.strangerRestGate() : null;   // AUDIT DROPS D5: same guard as the party gate below
    if (strangerRefusal) { townTalk.showOverlay(new ActionTextBox([strangerRefusal])); return; }
    // PARTY-REST2 (2026-09-20, per-request: "we need a party member
    // confirmation like 4/5 party member agree to rest... if not all
    // party members are ready the leader can't rest"): shared with
    // worldModes.js's interior and dungeonContext.js's dungeon - see
    // partyRestGate's own doc comment.
    const partyRefusal = shared.modes ? shared.partyRestGate() : null;   // AUDIT DROPS D5: `modes` is a var assigned after this handler is live - before it, no party can exist (audit24 wave37's law)
    if (partyRefusal) { townTalk.showOverlay(new ActionTextBox([partyRefusal])); return; }
    // REST-WARN: poisoned or diseased, the rest asks first (systems/rest/restWarning.js) - the window opens on its Yes, once
    // the box has left the slot
    // AUDIT RPT1026 L3: a ship's bed pressed is the press the window opens with (ui/restDoor.js - BedActivation's
    // `new DaggerfallRestWindow(uiManager, true)`), read now: a REST-WARN box opens the window on its Yes, after the press
    const bed = shared._restFromBed, restNow = () => { if (shared.modes) shared.markPartyRestSpent(); townTalk.showOverlay(createRestWindow(outdoorRestDeps, bed)); };   // PARTY-REST28: the shared reset every host runs on a granted rest
    const ail = restAilmentLines(playerEntity);
    if (ail) { let yes = false; townTalk.showOverlay(new DecisionBoxWindow({ rows: ail, onYes: () => { yes = true; } }), () => { if (yes) restNow(); }); return; }
    restNow();
  };
  return { toggleRest };
}
