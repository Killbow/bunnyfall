// The world's save and load: the quick save and quick load, the boot load and classic load, and
// the pose and overworld reset on load. It also holds the exit autosave, the online and realm
// checkpoints, and a realm character's birth, legacy creation, and first save.
// The checkpoint time, the loaded game, the boot snapshot read, and realmLost stay in the world.
import { applyWeaponPose, mergeWeaponPose, weaponPoseOf } from '../combat/playerWeapon.js';
import { assignShipToPlayer, SHIP_INTERIOR_MAP_IDS } from '../trade/banking.js';
import { autoBuildArms } from '../combat/weaponRig.js';
import { bankCabinCandidates, readBankCabinLink } from '../systems/naval/boatCabinOwnership.js';
import { betterAmbience } from '../audio/betterAmbience.js';
import { BOOT_DOOR_KEYS, isOnlinePage } from '../platform/onlineLane.js';
import { cabinSceneName, savedCabinBoat } from '../systems/naval/sailingCabin.js';
import { CAMP_TEXT, packSavedFires } from '../systems/survival/camp.js';
import { CARAVAN_TEXT } from '../travel/caravanRoom.js';
import { checkpointAllowed } from '../saves/onlineCheckpoint.js';
import { classicSaveToSnapshot, peekPendingClassicSave, takePendingClassicSave } from '../saves/classicSave.js';
import { closeShipyard } from '../ui/navalPlunderDoor.js';
import { COME_SAIL_AWAY_VENDOR } from '../systems/naval/comeSailAway.js';
import {
  composeSessionState, dungeonPixelFor, restorePlayer, restoreSessionState, snapshotPlayer,
} from '../saves/save.js';
import { DeathScreen } from '../ui/deathScreen.js';
import { flushStateChange as dwFlushStateChange } from '../underwater/deepWaterPlayer.js';
import { loadFinished as dwLoadFinished, loadStarted as dwLoadStarted } from './deepWaterRuntime.js';
import {
  exitAutosaveNames, loadSlot, mostRecentRestorable, QUICK_SAVE_NAME, quickLoadSlot, requestScreenshot, saveSlot,
  slotLoaded,
} from '../saves/saveSlots.js';
import { fetchBytes, realmSaveSink } from '../scenes/shared.js';
import { floorLanding } from '../player/enterExit.js';
import { getInt } from '../platform/settings.js';
import { importClimateWeathers } from '../weather/weatherSim.js';
import { inEther } from './ethericSea.js';
import { layoutStampOfPixel, stampLayout } from './layoutPins.js';
import { legacyOn } from '../systems/legacy/settings.js';
import { loadSpellIndex } from '../characters/chargenSession.js';
import { localizedText, t } from '../ui/textManager.js';
import { longitudeLatitudeToMapPixel } from '../formats/mapsFile.js';
import { messageBox } from '../ui/notify.js';
import { modSaveRecords, restoreModSaveRecords } from '../saves/modSaveData.js';
import { mwViewLoadPose, mwViewSaveCamera } from '../player/mwView.js';
import { OCEAN_HOLES_VENDOR } from './oceanHoles.js';
import { offlineExitSave } from '../saves/exitSave.js';
import { ownWalkWaiting, setWorldMinutes, worldMinutes } from './worldTick.js';
import { parkedCaravanAt } from '../travel/caravanRoomHost.js';
import { playerEntity, surfacePlayer } from '../characters/playerEntity.js';
import { readTokens as readRscTokens, RSC } from '../formats/textRsc.js';
import { realmBootSearch, realmCreate, realmPut, realmSummaryOf, sayRealmSave } from '../saves/realmSaves.js';
import { releaseUnloadGuard } from '../platform/unloadGuard.js';
import { reportModCompatibilityIssues } from '../audio/immersiveFootsteps.js';
import { REPOSITION } from '../systems/naval/ship.js';
import { resetTimeScale, timeScale as worldTimeScale } from './timeScale.js';
import { resetVitalsDetector } from '../ui/hudVitals.js';
import { reviveQuestBehaviour } from '../systems/quest/questFoeHost.js';
import { stakedSaveRefusal } from '../ui/gambitTableWords.js';
import { stampItemIds } from '../items/itemIds.js';
import { STREAMING_TERRAIN_SCALE } from './terrainSampler.js';
import { successionOpen } from '../ui/legacyDoor.js';
import { undergroundWakeSpot, undergroundWakeText } from '../player/deathRespawn.js';
import { worldCoordToMapPixel } from './streamingWorld.js';
import { wrapAngle } from './mat4.js';

/** @param {any} shared */
export function createWorldSaveLoad(shared) {
  const {
    _teleportToPixel, closeWindowsForLoad, enterLinkedBankCabin, legacyRealmLine, params, playerTravelPixel,
    portFrame, realmBoot, realmIoNow, realmLost, realmSession, standSavedOuterCamps, worldMoveBusy,
  } = shared;
  // MW-EARLY: the save the load door at the end of this boot restores - its pick, and its ONE parse (AUDIT MW-EARLY F3,
  // below). AUDIT FINAL F9: declared here, first, so the Test Room's check below reads that same parse and that same
  // pick (the classic import's arm included) - it had parsed the save a second time, by a pick of its own.
  const bootLoadPick = !params.has('load') || (params.has('classicload') && peekPendingClassicSave()) ? null
    : realmBoot ? { realm: true }   // REALM P1.3: the service's save, never a slot
    : params.has('loadkey')
      ? { key: Number(params.get('loadkey')) }
      : { mostRecent: true };

  const bootSnap = () => (shared.bootSnapRead === undefined ? (shared.bootSnapRead = pickedSaveSnap(bootLoadPick ?? {})) : shared.bootSnapRead);

  /** Save(name, saveName) over the host's own envelope; F9 is the
   *  QuickSave name (QuickSave() = Save(Name, quickSaveName)) and the
   *  slot window's saveAs passes the typed one. */
  function worldQuickSave(saveName = QUICK_SAVE_NAME, { quiet = false, sink = null } = {}) {   // REALM P0.5: a quiet checkpoint takes no shot and says only a failure; P1.3: a realm character's goes to the service
    // AUDIT OH-F B4: never a save inside the descent (one frame in DFU): it would write the swimmer on the template's
    // land with the mod's record not yet Active. AUDIT REALM2 M5: said to a save pressed, never to the quiet checkpoint
    if (shared.ohAbyss?.entering) { if (!quiet) shared.townTalk.say('You cannot save now.'); return false; }   // cannotSaveNow (Internal_Strings)
    // AUDIT C&C (lens H): nor inside a journey. DFU's fast travel is one frame - TeleportToCoordinates, then RaiseTime
    // (DaggerfallTravelPopUp.cs :333, :344) - and here the teleport is awaited, frames running, before the clock moves:
    // a save between them (the online checkpoint, the page's exit save, a key) wrote the arrival's place with the
    // departure's clock and needs, and a load of it was there for nothing. The checkpoint tries again when next due.
    if (shared._traveling) { if (!quiet) shared.townTalk.say('You cannot save now.'); return false; }
    // the editor's Test: no save is written while it runs
    if (shared.poiTest?.active()) { if (!quiet) shared.townTalk.say(t('poi.test.noSave', 'You cannot save while testing a POI.')); return false; }
    // AUDIT NAV1 (B14): nor in a boarding or on a ship of the sea's deck - the sea is never a save's, and the load set the
    // player over open water, the ship and her prize gone
    if (shared.naval?.saveRefused?.()) { if (!quiet) shared.townTalk.say('You cannot save now.'); return false; }
    // AUDIT CARDS-2 H1: nor with chips on a card table - the purse is short the buy-in and the chips are in no save
    if (shared.modes?.cardTableLive?.()) { if (!quiet) shared.townTalk.say('You cannot save with chips on the table.'); return false; }
    // CARDS10: nor with a card staked on a game of Iliac Hand - the card it may cost is in no save
    if (shared.modes?.iliacStaked?.()) { if (!quiet) shared.townTalk.say('You cannot save with a card staked on the table.'); return false; }
    if (shared.modes?.gambitStaked?.()) { if (!quiet) shared.townTalk.say(stakedSaveRefusal()); return false; }   // KG3: gold staked on The King's Gambit (Kings-Gambit.md 5.7)
    const pf = shared.walkMode && shared.playerSpawned ? shared.player.pos : shared.cam.pos;
    const wc = shared.state.worldCoords(pf);
    // IS1 (AUDIT 26 F221): the inside-building half (SerializablePlayer
    // .cs:183-187) - resolved FIRST, because interiorSaveData writes
    // the live scene into the entity's P1 cache and snapshotPlayer is
    // about to read it. Null anywhere but interior mode. The world arm
    // below stays valid either way: the exterior pixel stands under
    // the building with its pools alive, and P8's unified frame makes
    // the inside position a plain world position.
    const interior = shared.modes?.interiorSaveData?.() ?? null;
    // WD3: the load re-enters this building by its door, which names a building only in its town's layout - the
    // layout rides with it, and the load keeps the town in it (applyLayoutPins); none for classic
    if (interior) { const at = playerTravelPixel(); stampLayout(interior, layoutStampOfPixel(at.x, at.y)); }
    // AUDIT 63 F24: ...and the interior host's LIVE ENEMIES with it.
    // SaveLoadManager.cs:865's enemyData is unconditional, and the
    // fourth host's two pools rode nothing. Natives through the same
    // converter the outdoor pools take, with the compensation shed per
    // record - the pile/foe/guard law three lines below.
    const interiorPools = shared.modes?.interiorPoolSnapshot?.((pos) => shared.state.worldCoords(pos)) ?? null;
    if (interior && interiorPools) {
      const shed = (rows) => (rows ?? []).map((r) => ({ ...r, y: shared.groundFrameNative(r.nativeX, r.nativeZ, r.y - shared.state.compensation[1]) }));   // AUDIT LANDFORMS C1: DFU's frame
      interior.foes = shed(interiorPools.foes);
      interior.guards = shed(interiorPools.guards);
    }
    // SL-2 (AUDIT 65): THE RIG IN THE PLAYER'S HANDS. DFU has ONE
    // WeaponManager for every WorldContext and SerializablePlayer
    // .cs:175-176 reads it wherever the save is taken; this host has
    // four rigs and was reading its own EXTERIOR one unconditionally,
    // so an F9 pressed inside a shop recorded the street's sheath and
    // hand. The mode host answers for the rig that is actually drawn
    // and null outside interior mode (the dungeon owns its own
    // composer, dungeonContext.js:"damage = trunc(5 * (distance - 5))"), so exterior mode and a
    // pre-seam mode host compose exactly as before, per field.
    const wp = shared.modes?.weaponPose?.() ?? null;
    const snap = snapshotPlayer(playerEntity, {
      interior,
      classicMinutes: Math.floor(shared.playerTicker.ownMinutes),   // LIVED1: the save's clock is the character's own (every marker it holds is on it); save.js adds the world's minute beside it online
      readiedSpellIndex: shared.magic.readiedIndex(),
      // B4: quest (Q4-v: machine + notebook + one-time list) and talk
      // (SaveDataConversation WHOLE, :368-375: the mill + questor-post
      // dict (TK-i), dictQuestInfo (TK-ii), npcsWithWork +
      // castleNPCsSpokenTo (TK-iv)) through the ONE composer both
      // hosts call - two inline copies of this envelope is exactly
      // how the dungeon half drifted to saving neither.
      ...composeSessionState({ questBridge: shared.questBridge, talk: { mill: shared.rumorMill, tree: shared.topicTree, session: shared.npcSession }, spawnLedger: shared._spawnLedger }),   // TTL1: the spawned-dungeon clocks ride every save
      // AUDIT 26 F222/F223/F101: the POSE - weaponDrawn
      // (SerializablePlayer :175, restored Sheathed = !weaponDrawn),
      // yaw/pitch/isCrouching (PlayerPositionData_v1 :212-214).
      // MW-D30: the camera's two persisted halves ride the pose - the
      // reference saves the first/third flag in its own REC_CAM_ record
      // (worldimp.cpp:425-427) and the zoom distance through the camera
      // script's onSave (camera.lua:350-352).
      // AUDIT 39: and the TRANSPORT MODE, SerializablePlayer.cs:179's
      // own line beside the weapon and the boarding memory the port
      // already took (:180 -> snap.boardShipPosition). The mode lives
      // on the motor, host-owned like the weapon, so it rides the pose
      // bag rather than the entity envelope.
      // AUDIT 63 F25: the SECOND line of that pair. DFU writes the
      // sheath and the HAND together - SerializablePlayer.cs:175-176
      // `data.weaponDrawn = !weaponManager.Sheathed;` /
      // `data.usingLeftHand = !weaponManager.UsingRightHand;` - and
      // restores them together at :420-421. The port carried only the
      // first line, so a player fighting with the left-hand weapon
      // loaded back on the right hand's item (or bare fists). The
      // port stores the POSITIVE sense because PlayerWeapon holds
      // `usingRightHand`; it is the same bit.
      // FALL-KEPT (FIELD BUGS 2026-09-30): and the FALL, which DFU never
      // keeps - a save a metre above the ground loaded from rest and
      // billed one metre. The motor's own record, null off a fall
      // (motor.js fallSnapshot); the load lands it with the position.
      pose: { yaw: shared.cam.yaw, pitch: shared.cam.pitch, crouching: !!shared.player.crouching, ...mergeWeaponPose(wp, weaponPoseOf(shared.weaponRig.playerWeapon)), camera: mwViewSaveCamera(), transport: shared.player.transportMode, fall: shared.player.fallSnapshot() },   // SL-2: the pair off the LIVE rig (the mode seam above), else this host's own - PER FIELD, which is mergeWeaponPose's whole job
      modData: { [shared.HCC_VENDOR]: shared.hccRuntime.getSaveData(), ...modSaveRecords() },   // WA1: every registered mod's record beside it (systems/modSaveData.js)   // AUDIT HCC H3: the mod's own record (WagonSaveData, GetSaveData [IL_9354]) in DFU's per-mod slot - written whatever the switch says, so a save taken with the mod off keeps the horse's name and the parked wagon for when it comes back on
      locationKey: 'world',
      world: {
        pixel: playerTravelPixel(), nativeX: wc.x, nativeZ: wc.z, y: shared.groundFrameHeight(pf[1] - shared.state.compensation[1], pf[0], pf[2]),   // AUDIT LANDFORMS C1: every height below in DFU's frame
        // P2-slice (items-2): loose piles ride the envelope in
        // NATIVES with the compensation-free height, the player
        // half's exact law.
        piles: shared.droppedLoot.snapshotWorld((pos) => shared.state.worldCoords(pos)).map((sp) => ({ ...sp, y: shared.groundFrameNative(sp.nativeX, sp.nativeZ, sp.y - shared.state.compensation[1]) })),
        droppedTorches: shared.droppedTorches.snapshot((pos) => { const wc = shared.state.worldCoords(pos); return [wc.x, shared.groundFrameHeight(pos[1] - shared.state.compensation[1], pos[0], pos[2]), wc.z]; }),
        camps: shared.camps.snapshot(shared.campToRecord),   // SURV3: my camps, in natives   // HT1: the mod's own save data rides the envelope
        // AUDIT 26 F216/F217: LIVE ENEMIES ride the envelope - DFU's
        // SaveData_v1 carries enemyData wherever the player stands
        // (:865, restored :1006). Saved nowhere, a quickload during a
        // wilderness ambush or a guard pursuit despawned every
        // attacker with the spawn catch-up suppressed: a free escape
        // from any outdoor fight. Natives, the pile law; the
        // compensation-free height rides per record.
        foes: shared.exteriorFoes.snapshotWorld((pos) => shared.state.worldCoords(pos)).map((sf) => ({ ...sf, y: shared.groundFrameNative(sf.nativeX, sf.nativeZ, sf.y - shared.state.compensation[1]) })),
        guards: shared.cityGuards.snapshotWorld((pos) => shared.state.worldCoords(pos)).map((sg) => ({ ...sg, y: shared.groundFrameNative(sg.nativeX, sg.nativeZ, sg.y - shared.state.compensation[1]) })),
      },
    });
    const into = sink ?? realmSaveSink();   // REALM P1.3: a realm character's save is the service's checkpoint, never a local slot
    if (into) { const said = into(snap); if (!quiet) sayRealmSave(said, (t) => shared.townTalk.say(t)); return true; }   // AUDIT REALM2 C2: the realm's answer, not a hope
    const r = saveSlot(playerEntity.name, saveName, snap);
    // SS1: the shot is DEFERRED to frame end (SaveGame's two
    // WaitForEndOfFrame yields) - the frame loop's
    // capturePendingScreenshot delivers it once the save window has
    // popped, HUD in shot exactly as the C# leaves it.
    if (r.ok && !quiet) requestScreenshot(r.key);
    if (!r.ok || !quiet) shared.townTalk.say(r.ok ? localizedText('gameSaved', 'Game saved.') : 'Save failed (storage full or disabled).');
    return r.ok;
  }
  /** AUDIT 63r F24, the EXTERIOR half of SerializableEnemy.cs
   *  :206-217 - questFoeHost.reviveQuestBehaviour is the shared law,
   *  this is only the machine this host owns. No stand list is needed
   *  here: the ActiveGameObjectDatabase walk (`questFoeInstances`)
   *  reads the pool itself, so a revived foe is reachable the moment
   *  spawnFoe lands it. */
  const _reviveQuestBehaviour = (data) => reviveQuestBehaviour(shared.questBridge?.machine ?? null, data);

  /** MW-EARLY: a PICKED save's snapshot - a slot by its key, else the most
   *  recent restorable one - in ONE home, so the boot's early arms build
   *  (above `status('loading data')`) reads exactly what the door's
   *  restore below reads. Null when there is none. */
  function pickedSaveSnap({ key = null, mostRecent = false } = {}) {
    return key != null ? loadSlot(key) : mostRecent ? (mostRecentRestorable()?.snap ?? null) : null;
  }

  async function worldQuickLoad({ mostRecent = false, key = null, snap: picked = null } = {}) {
    if (shared._loading) return;
    if (worldMoveBusy()) { shared.townTalk.say('Loading is disabled while traveling.'); return; }   // AUDIT 68 S22: never a second teleport beside one in flight
    // ONLINE-LOAD1 (world/exterior + building interior, which routes
    // straight to this same function - see worldModes.js's `quickLoad:
    // host.quickLoad`): guarded HERE, at the source, not only in the
    // enhanced pane (paneLoad's own loadingPrevented read) - F9/F11
    // reach this function directly through routeKey (ui/input.js),
    // with no pane in the way, exactly the gap dungeonContext.js's own
    // quickLoad closes for the dungeon half of the game. Loading a
    // save while a live online session is running would hand every
    // other peer a player whose room the loaded save knows nothing
    // about.
    //
    // Gated on `online` (the LIVE session, null until onlineStart's
    // first frame) rather than `onlineOn` (the URL flag, true from the
    // very start of boot): this same function is ALSO the boot-time
    // "Load Game" / "Play Online with an existing character" loader
    // (params.has('load') below), which runs before any session
    // exists - an earlier draft gated on `onlineOn` and silently
    // discarded that boot load whenever the URL carried ?online,
    // leaving the player on an empty default entity (no name, no
    // class, no gear) for the rest of the session: exactly a boot
    // load, not an in-play one, and `online` is what tells them apart.
    if (shared.online) { shared.townTalk.say('Loading is disabled during online play.'); return; }
    // AUDIT-TO1 G1: SaveLoadManager.OnLoad -> ClearTravelDestination
    // (TravelOptionsMod.cs:378), which closes the panel and so drops the
    // scale (OnClose -> InterruptTravel). Before the first await, so a
    // journey's autopilot can never drive the LOADED character toward the
    // old destination at the old acceleration. Departure 8 rested on
    // this hook and the hook was never wired.
    shared.travelOptions?.clearTravelDestination();
    if (worldTimeScale() !== 1) resetTimeScale();
    shared.crewAshore.clear();   // AUDIT CC-A8: the party out of every pool before the save lands - a dungeon's patches its foes by number, and a companion in the list took another's record
    shared.clearSworn();   // REVENANT-COMPANION: the sworn too
    // AUDIT-MACL F2: THE LATCH GOES UP BEFORE THE FIRST AWAIT, and MAC-L4
    // is why it has to be said out loud. This guard and the latch below
    // it used to be separated by straight-line code alone - one
    // synchronous run, so `if (_loading) return;` and `_loading = true`
    // were effectively atomic and two F9s in a frame could not both get
    // through. MAC-L4 put an `await` between them for the spell table,
    // and an await is a door: both calls read `_loading === false`, both
    // suspended, and both came back to run a whole load over the same
    // entity. The fix for a silent data loss must not open a re-entry.
    //
    // Everything below is inside the try/finally that clears it, so the
    // two early returns release the latch on their way out rather than
    // wedging quickload for the session.
    shared._loading = true;
    try {
      const snap = picked ?? (key != null || mostRecent ? pickedSaveSnap({ key, mostRecent })   // MW-EARLY: the pick the boot's early build read (AUDIT MW-EARLY F3: the boot hands its one parse in)
        : quickLoadSlot(playerEntity.name, undefined, playerEntity.characterId ?? null));   // CHARID1: my own QuickSave, never a namesake's
      if (!snap) { shared.townTalk.say('No saved game.'); return; }
      // DUPE-LOAD (2026-10-11): THE WINDOWS DOWN BEFORE THE SAVE IS READ (closeWindowsForLoad: the street's slot, and
      // what waits under any death screen) - and before the first await, where a window left up could still be played.
      // A window holds what it took off the old game (the pack's drops, a counter's staged goods, a loot window's pile);
      // its close hands that back, and a close AFTER the restore handed it to the loaded game - the pack the save
      // restored plus the pile the close minted. Closed here, its close lands on the old game the restore replaces (the
      // pack is the save's once restored; where the load teleports, a pile it mints is swept with every other -
      // droppedLoot.restoreWorld). The death screen stays: closeDeathScreen takes it down below, its view handed back.
      closeWindowsForLoad();
      // MAC-L4: the table this save is READ WITH, before it is read. The
      // boot fires `loadMagicRegistries` and does not await it (every
      // other consumer is a later frame), so a quickload in the first
      // seconds of a session arrived with `spellsByIndex` still null.
      // Awaiting here costs nothing once it has resolved and is the
      // difference between reading a save and destroying one.
      if (!shared.spellsByIndex) await shared._magicRegistries.catch(() => null);
      // AUDIT 68 X3-transition-build-race: a door build still in flight
      // belongs to the game being replaced - abandon it and WAIT for it
      // to unwind (its context freed, any seams it borrowed handed back)
      // before the save is read over the entity it was building for.
      shared.modes?.abortTransition?.();
      await shared.modes?.transitionSettled?.();
      closeWindowsForLoad();   // AUDIT DUPE-LOAD: and once more after the last await - a window opened while the load waited (a door's build, the spell table) goes too
      if (shared.csaRuntime) shared.csaCall(() => shared.csaRuntime.OnStartLoad());   // CSA-D: ComeSailAway.OnStartLoad - the riders dropped, the helm left; CSA-J (the audit): AHEAD of the save's player (SaveLoadManager.cs:1378, the restore at :1497) - its StopSailing hands a lent ship back, and after restorePlayer it took the loaded character's own
      const extras = restorePlayer(playerEntity, snap, shared.spellsByIndex);
      if (!extras) { shared.townTalk.say('Save version mismatch.'); return; }
      autoBuildArms(playerEntity);   // MWA1: the loaded character's arms (a boot into ?load has no chargenDone until here)
      shared.hccRuntime.handleStartLoad();   // AUDIT HCC H3: SaveLoadManager.OnStartLoad [IL_a714] - the old character's horse, name and parked wagon end HERE, before any await, on every branch below
      shared.wagonRiders?.clear();   // WAGONS2 (AUDIT): a load ends every ride - mine in another's wagon, and my riders' seats (the loaded character's wagon is the save's)
      shared.upkeep.reset();   // AUDIT STEED1: the old character's breaths and its keep's clock end with it - a load is no span skipped
      // CameraRecoiler's SaveLoadManager_OnStartLoad (:185-191): the
      // incoming character does not inherit the old one's reel.
      shared.cameraRecoiler.reset();
      resetVitalsDetector();   // BLOOD AUDIT 5: nor the difference between the two healths as a blow (VitalsChangeDetector.cs:139-158)
      shared.player.stopAutorun();   // AUDIT 27h S2: nor the old one's autorun latch - F11 off a death screen came back running at the sea
      shared.climbFeel.reset();   // AUDIT CLIMB-ARC F6: nor the old climb's turn and cues a load
      dwLoadStarted();   // DW-D: DeepWaterRuntime.OnStartLoad (SaveLoadManager raises it once a load is under way) - no swim hand until OnLoad
      if (shared.dwPlayer) { shared.dwPlayer.saveLoad(shared.player); dwFlushStateChange(); }   // AUDIT DW-F: OutdoorSwimDriver.OnSaveLoad on OnStartLoad
      shared.arrestFlow.abandon();   // AUDIT DISC28 AR-1: nor the old one's surrender question or trial - DaggerfallCourtWindow.OnPop's resets, never ReleaseFromPrison (arrestFlow.js abandon)
      shared.closeDeathScreen();   // DEATH-LOAD (issue #642): F11 off a street death loaded UNDER the screen - down before any await
      shared._deathWasOnline = null;
      // IS1: a load never runs UNDER a mounted mode - RespawnPlayer
      // destroys the standing interior first (PlayerEnterExit
      // .cs:453-459). The dying scene is NOT cached on the way out:
      // the entity's cache is already the SAVE's own (restorePlayer
      // above), and DFU's load path deregisters rather than
      // serializes it (:464).
      if ((shared.modes?.mode ?? 'exterior') !== 'exterior') shared.modes?.forceExitToExterior({ cacheScene: false, load: true });   // AUDIT REST II H1: a load, said - a Recall out of a dungeon passes cacheScene false too
      setWorldMinutes(extras.classicMinutes ?? worldMinutes());
      shared.magic.setReadiedByIndex(extras.readiedSpellIndex ?? null, shared.spellsByIndex);
      // Q4-v: the quest envelope rides the same slot; a pre-Q4-v save
      // has no quest key and the live machine stands (recorded). A
      // restored session is never a NEW game, whatever the chargen
      // flow later reports. B4: the restore half moved into
      // restoreSessionState (systems/save/save.js) so the dungeon host
      // runs the identical law; the TK-i/TK-ii/TK-iv null-arm
      // recordings moved with it.
      // AUDIT 63 F28: `entity` is the orphaned-quest-item sweep's
      // subject - RemoveAllOrphanedItems (SaveLoadManager.cs:1518)
      // runs inside the composer, after the quest machine is restored,
      // exactly where LoadGame runs it.
      if (restoreSessionState(extras, { questBridge: shared.questBridge, talk: { mill: shared.rumorMill, tree: shared.topicTree, session: shared.npcSession }, entity: playerEntity, spawnLedger: shared._spawnLedger })) shared._questStarted = true;
      await shared.applyLayoutPins(extras);   // WD3: the save's towns in the layouts its things were made in, before its place is built
      let csaElsewhere = false;   // CSA-J (the audit): the load did not land where its save stood
      if (extras.locationKey === 'world' && extras.world?.pixel) {
        const w = extras.world;
        shared._wodInside = !!extras.interior;   // WOD6: an inside save lands inside
        await _teleportToPixel(w.pixel.x, w.pixel.y, null, { modEvent: 'load' });   // SIB2: SaveLoadManager.OnLoad
        // TERRAIN-SCALE1: every height below stood on ground drawn at the
        // save's own scale; each is stood again on today's (restandHeight -
        // exact over the arrival pixel, which is built by now, and over the
        // building an inside save re-enters)
        const was = shared.scaleOf(extras.terrainScale);
        const today = was === STREAMING_TERRAIN_SCALE && !shared.landform;   // LANDFORM1: every height DFU's frame - the row's lift goes back on
        const restandNative = (nx, nz, y) => { const [x, z] = shared.state.localFromWorld(nx, nz); return shared.restandHeight(y, x, z, was); };
        // a list the envelope does not carry passes through as it came, and a record without its position is the restore's to refuse
        const restandRows = (rows) => (today || !Array.isArray(rows) ? rows : rows.map((r) => (r ? { ...r, y: restandNative(r.nativeX, r.nativeZ, r.y) } : r)));
        const restandAt = (key) => (rows) => (today || !Array.isArray(rows) ? rows : rows.map((r) => { const p = r?.[key]; return Array.isArray(p) ? { ...r, [key]: [p[0], restandNative(p[0], p[2], p[1]), p[2]] } : r; }));
        if (extras.interior) { extras.interior.foes = restandRows(extras.interior.foes); extras.interior.guards = restandRows(extras.interior.guards); }
        const [lx, lz] = shared.state.localFromWorld(w.nativeX, w.nativeZ);
        const ly = shared.restandHeight(w.y ?? 2, lx, lz, was) + shared.state.compensation[1];
        // IS1: an inside save re-enters its building BEFORE the player
        // lands - the Respawner's building arm (PlayerEnterExit
        // .cs:559-567) with RestorePosition landing the saved
        // transform raw. A door that cannot be found takes DFU's own
        // reposition arm (:615-621): say the line and keep the
        // teleport's default landing, never the inside position on the
        // outside collider.
        // AUDIT 63 F24: the interior host's ENEMY record travels with
        // the door identity now, so the re-entry takes the converters
        // too - it suppresses its own marker-foe walk while the record
        // is landing (GameObjectHelper.cs:1073-1076) and overlays the
        // saved pools once the fresh ones are minted.
        if (extras.interior?.caravanRoom) extras.interior = { ...extras.interior, caravanAt: parkedCaravanAt(extras.modData?.[shared.HCC_VENDOR] ?? null) };   // WAGONS2 (AUDIT): the save's caravan where it was parked (the runtime's is restored after)
        const inside = extras.interior
          ? await (shared.modes?.restoreInterior?.(extras.interior, [lx, ly, lz], {
            fromNative: (nx, nz) => shared.state.localFromWorld(nx, nz), yOffset: shared.state.compensation[1],
            sailingBoat: savedCabinBoat(extras.interior.sailingCabin, extras.modData?.[COME_SAIL_AWAY_VENDOR]),
          }) ?? false)
          : false;
        if (!inside) shared._wodInside = false;
        if (inside) {
          shared.playerSpawned = true;
          shared.cam.pos = [lx, ly, lz];
        } else if (extras.interior) {
          const out = shared.caravanDoorLanding(extras.interior);
          if (!out) shared.townTalk.say('Building has no exterior doors. Repositioning player.');
          else {   // WAGONS2 (FINAL AUDIT): a caravan's room that cannot come back stands its player behind its rear door
            shared.townTalk.say(CARAVAN_TEXT.outside);
            const [x, y, z] = out.position;
            if (shared.walkMode) { shared.player.spawn(x, y, z); shared.playerSpawned = true; }
            shared.cam.pos = [x, y + (shared.walkMode ? 0 : 40), z];
          }
        } else {
          if (shared.walkMode) { shared.player.spawn(lx, ly, lz); shared.playerSpawned = true; }
          shared.cam.pos = [lx, ly + (shared.walkMode ? 0 : 40), lz];
        }
        // FALL-KEPT (FIELD BUGS 2026-09-30): the saved fall lands with the saved position - the building re-entered
        // (its core's spawn) or the street (the spawn above). The door's reposition is no place the save stood, so it
        // carries none.
        if (shared.walkMode && (inside || !extras.interior)) shared.player.restoreFall(extras.pose?.fall);
        // P2-slice (items-2): the teleport's teardown collected every
        // live pile (the reference's sweep); the envelope re-mints the
        // saved ones at their native spots.
        shared.droppedLoot.restoreWorld(restandRows(w.piles), (nx, nz) => shared.state.localFromWorld(nx, nz), shared.state.compensation[1]);
        shared.droppedTorches.restore(restandAt('position')(w.droppedTorches), (p) => { const [lx, lz] = shared.state.localFromWorld(p[0], p[2]); return [lx, p[1] + shared.state.compensation[1], lz]; });   // HT1
        shared.bountyFarms?.destroyAll();   // BOUNTY-FARM: a load - the farms stand again from the loaded bounties
        shared.quays?.destroyAll();   // QUAYS: and the quays, off the harbours found again
        shared.lefay?.destroyAll();   // LEFAY1: and the monument - its collider down, stood again off the loaded world (a flower in the air lands nowhere: thrown before the restore - AUDIT LEFAY1 B1)
        shared.poiHost?.destroyAll();   // POI-2: and the POIs - their colliders down, stood again off the loaded world
        shared.merchantYards?.destroyAll();   // MERCHANT-YARDS: and the yards, their colliders down, stood again off the loaded world
        shared.portHost?.destroyAll(); closeShipyard();   // SHIPYARDS: and the shipyards and lighthouses, and the shipmaster's window over a world gone
        // SHIPYARDS: stood again at once off the loaded world, the player already where the save stood them - the frame
        // steps the player before its pools stand, so a save made on a lighthouse's gallery found no floor for a frame
        portFrame();
        shared.wardenShows?.destroyAll();   // WARDEN1: and a throw in flight
        shared.camps.dropOwn();   // AUDIT SURV-TIERS (the third pass): the save says which camps are mine - the pitch after it is undone, not kept beside the gear it gave back
        shared.camps.restore(restandAt('pos')(w.camps), shared.campFromNatives);   // SURV3
        // F216/F217: the pools re-mint through their one spawn chain,
        // then overlay the saved truth (SerializableEnemy's own
        // rebuild-then-set shape). Async behind the art; the teleport
        // above already tore the old pools down with the pixel.
        // AUDIT 63r F24: the exterior pool's quest link is RECORDED
        // (exteriorFoes.snapshotWorld's `questResource`) but was
        // restored nowhere - the option bag only reached the interior
        // caller, so a reloaded exterior quest foe stood and fought
        // while its task ticked forever. SerializableEnemy.cs:206-217
        // is one law for every context: re-add the behaviour, restore
        // it, and drop it again when the record names no quest.
        shared.exteriorFoes.restoreWorld(restandRows(w.foes), (nx, nz) => shared.state.localFromWorld(nx, nz), shared.state.compensation[1],
          { reviveQuestBehaviour: _reviveQuestBehaviour });
        shared.cityGuards.restoreWorld(restandRows(w.guards), (nx, nz) => shared.state.localFromWorld(nx, nz), shared.state.compensation[1]);
        // WOD6: SaveLoadManager.OnLoad, raised last - the markers hear it at the loaded player's centre
        { const s = shared.walkMode && shared.playerSpawned; const f = s ? shared.player.pos : shared.cam.pos; shared.wodOnLoad([f[0], f[1] + (s ? shared.player.height / 2 : 0), f[2]]); }
      } else if (String(extras.locationKey ?? '').startsWith('dungeon:')) {
        // MAC6 #1 (Mac, 2026-09-12: "When playing online it doesnt place
        // you where you last saved"): a save taken INSIDE a dungeon - the
        // world-hosted dungeon's own envelope, keyed dungeon:<id> with a
        // dungeon-local position - came home to "saved elsewhere" and
        // the start cell, from the Load door and the Online door alike.
        // DFU's load respawns at the save's own map pixel and re-enters
        // the dungeon BEFORE it restores the position: RespawnPlayer's
        // insideDungeon arm (PlayerEnterExit.cs:534-537 -
        // TeleportToCoordinates, GetLocation, StartDungeonInterior) and
        // RestorePosition after it (SerializablePlayer.cs:441-454). The
        // envelope names its pixel now (dungeonContext's composer); one
        // from before it did is found by its id across the index.
        // AUDIT REST II H6: the camps I left standing OUTSIDE ride a dungeon save too, and a load stands the save's
        // (standSavedOuterCamps - AUDIT REST III A1: the one home, the dungeon's own load's too)
        const standOuterCamps = () => standSavedOuterCamps(extras);
        // AUDIT REST II H5: a load that does not enter the dungeon carries my Campfires out of it (packSavedFires) - the
        // save stood them there, and the restored pack has none
        const carrySavedFires = () => {
          const items = packSavedFires(extras.world?.camps);
          if (!items.length) return;
          (playerEntity.items ??= []).push(...items);
          shared.townTalk.say(CAMP_TEXT.carriedOut);
        };
        const pixel = extras.dungeon?.pixel ?? dungeonPixelFor(extras.locationKey, shared.locationIndex.values(), (mt) => longitudeLatitudeToMapPixel(mt.longitude, mt.latitude));
        csaElsewhere = !pixel;   // CSA-J (the audit): a dungeon this world cannot find is no landing at the save's place
        if (!pixel) shared.townTalk.say('(the dungeon you saved in couldn’t be found. Your character is restored, so travel there yourself)');
        else if (shared.onlineOn && !(pixel.x === getInt('Startup', 'StartCellX') && pixel.y === getInt('Startup', 'StartCellY'))) {
          // ONLINE-UNDERGROUND-LOAD1 (Lost, 2026-09-19): an online page never puts a character back INSIDE a dungeon -
          // it wakes them at the nearest temple, town or graveyard to it (the death respawn's own search, over the
          // region the dungeon stands in), on that place's start marker. The tutorial dungeon is the exception
          // (D-ONLINE2's reading, off the configured start cell): a character saved in the Hold reloads into it.
          // AUDIT OH-F B5: a save in the drowned dungeon wakes nearest ITS door, the pit - not the borrowed template's
          const ohSaved = extras.modData?.[OCEAN_HOLES_VENDOR];
          const from = ohSaved?.Active && Number.isFinite(ohSaved.PitMapX) && Number.isFinite(ohSaved.PitMapY) ? { x: ohSaved.PitMapX, y: ohSaved.PitMapY } : pixel;
          const wake = inEther(from.x, from.y) ? { kind: 'dungeon', mapPixel: { x: from.x, y: from.y } } : undergroundWakeSpot(shared.maps.getRegion(shared.maps.getRegionIndexAt(from.x, from.y))?.mapTable ?? [], from);   // ETHER-PLACES: an isle's ruin wakes at its own door - the region's search would read the Alik'r's past the map
          await _teleportToPixel(wake.mapPixel.x, wake.mapPixel.y, null, { modEvent: 'load', reposition: REPOSITION.RandomStartMarker });
          // WOD6 (audit): a load all the same - SaveLoadManager.OnLoad, last, at the landed player
          { const s = shared.walkMode && shared.playerSpawned; const f = s ? shared.player.pos : shared.cam.pos; shared.wodOnLoad([f[0], f[1] + (s ? shared.player.height / 2 : 0), f[2]]); }
          shared.townTalk.say(undergroundWakeText(wake.kind));
          csaElsewhere = true;
          standOuterCamps(); carrySavedFires();   // AUDIT REST II H5 + H6: woken outside - my fires come with me
        } else {
          shared._wodInside = true;   // WOD6: a dungeon save lands inside - no marker hears this load
          await _teleportToPixel(pixel.x, pixel.y, null, { modEvent: 'load' });   // SIB2: SaveLoadManager.OnLoad
          const entered = await (shared.modes?.startInDungeon?.({ locationKey: extras.locationKey, fromLoad: true, recorded: extras.dungeon ?? {} }) ?? false);   // StartDungeonInterior: the enter marker first, the saved position over it; CASTLE1: the SAVED dungeon's door, not the first one loaded
          if (entered) { shared.playerSpawned = true; await shared.modes?.restoreDungeonSave?.(extras); }   // AUDIT OH-F B1: RestoreEnemyData whole before the mod loop below
          else { shared._wodInside = false; shared.townTalk.say('(the dungeon could not be entered. Your character is restored at its door)'); }   // WOD6: it landed outside after all
          if (!entered) csaElsewhere = true;   // CSA-J (the audit): outside at its door, not where the save stood
          if (!entered) carrySavedFires();   // AUDIT REST II H5: my fires with me
          standOuterCamps();   // AUDIT REST II H6: the save's camps outside, in or out
        }
        if (!pixel) { standOuterCamps(); carrySavedFires(); }   // AUDIT REST II H5 + H6: a dungeon this world cannot find - restored outside, my fires with me
      } else if (extras.locationKey && extras.locationKey !== 'world') {
        shared.townTalk.say('(saved somewhere else. Your character is restored, so travel there yourself)');
        csaElsewhere = true;
      }
      shared.ohAbyss?.onRespawnerComplete();   // OH-D: RestorePositionHelper's respawn completes (LoadInProgress) before the mod loop restores the save's record
      if (shared.csaRuntime) await shared.csa.preload();   // CSA-J (the audit): SpawnBoat is synchronous in the C# - the boats' models in before the mod loop, so a load's boats stand at once and no floating-origin shift can land while they are held (the hold stays for models that never come)
      if (csaElsewhere) extras.modData = shared.csaHelmLeft(extras.modData);   // CSA-J (the audit): landed elsewhere - the helm let go before the mod loop reads it
      // AUDIT HCC H3: RestoreSaveData [IL_93ac] once the save's place stands - a world save, a dungeon save, a wake
      // at a temple alike; a save without the record stays the fresh start OnStartLoad made above. HORSE-WAKE: a load
      // that landed away from its save (csaElsewhere) calls the waiting horse and team to the player, who could not
      // reach them where the save left them (horseCart.js callTeamToLanding)
      const hccRecord = extras.modData?.[shared.HCC_VENDOR] ?? null;
      if (hccRecord) shared.hccRuntime.restoreSaveData(hccRecord, { elsewhere: csaElsewhere });
      restoreModSaveRecords(extras.modData, shared.csaModLoadFailed);   // WA1: SaveLoadManager's mod loop (:1524-1535) - the save's record, else the mod's NewSaveData; its try per mod (:1536-1540)
      if (csaElsewhere && shared.csaRuntime && extras.modData?.[COME_SAIL_AWAY_VENDOR]?.TemporaryShip) shared.csaCall(() => shared.csaRuntime.ReturnTemporaryShip());   // AUDIT PRE-MERGE 0928 C1: the helm let go (above) - the ship it lent taken back, as StopSailing takes it (IL_b0e7-IL_b121); RestoreSaveData reads TemporaryShip only for a helm it takes, so the save's character kept a sellable ship
      // AUDIT 26 F222/F223/F101: the pose lands with the position -
      // RestorePosition sets yaw/pitch/isCrouching and
      // Sheathed = !weaponDrawn (:420-421). Presence-gated: an old
      // envelope leaves the live pose standing.
      applyPose(extras.pose);
      shared._lastEncMinutes = Math.floor(shared.playerTicker.ownMinutes);   // no spawn catch-up across a load (DFU LoadInProgress)
      surfacePlayer();
      if (shared.csaOn() && shared.csaRuntime && !shared.csaRuntime.state.TemporaryShip) {
        const oldBankType = SHIP_INTERIOR_MAP_IDS.indexOf(shared._questLoc()?.mapTableData?.mapId);
        if (shared.modes?.mode === 'interior' && oldBankType >= 0 && oldBankType === playerEntity.ownedShip && !shared.modes?.roomIdentity?.()?.privateRoom) {
          // The just-restored room is live, not in the cache. Cache it before
          // linking, and only leave it when there is one launched destination.
          const prior = readBankCabinLink(playerEntity.boatCabinLink);
          const choices = bankCabinCandidates(oldBankType, shared.csaRuntime.AllBoats, shared.legacyCabinItems());
          const choice = prior?.type === oldBankType ? prior : choices.length === 1 ? choices[0] : null;
          const launched = choice && shared.csaRuntime.AllBoats.some((b) => b.uid === choice.uid && b.hull === choice.hull && !b.inside && b.MapPixel);
          if (launched && !playerEntity.sceneCache?.scenes.has(cabinSceneName(choice.uid))) {
            shared.modes?.forceExitToExterior();
            await enterLinkedBankCabin({ loading: true });
          }
        } else if (shared.modes?.mode === 'exterior') shared.ensureBankCabinLink();
      }
      shared.townTalk.say(localizedText('gameLoaded', 'Game loaded.'));
      slotLoaded(playerEntity.characterId ?? null);   // AUDIT ONLINE2 F3: the pack is the save's - the spoils' crash door asks again
      // BA1: SaveLoadManager.OnLoad's listeners - Better Ambience's fog and rain source (four frames on), and
      // Immersive Footsteps' ModCompatibilityWarning_OnLoadSave.
      betterAmbience.onLoad();
      reportModCompatibilityIssues({ showText: (lines) => messageBox(lines) });   // ENH-NOTICE3: through the one door - still a PUSH over what is open, which is the seam's default and B5's law for every DaggerfallUI.MessageBox
      dwLoadFinished(performance.now() / 1000);   // DW-D: DeepWaterRuntime.OnLoad - 1.5 s more (a load that throws raises none, as DFU's does not)
      if (shared.dwPlayer) { shared.dwPlayer.saveLoad(shared.player); dwFlushStateChange(); }   // AUDIT DW-F: ...and OutdoorSwimDriver.OnSaveLoad on OnLoad - the save's crouch is back, so it stands
      shared.oceanHoles?.saveLoaded();   // OH-B: OceanHoles.OnSaveLoaded - the queue dropped, every loaded terrain promoted again
      if (shared.csaRuntime) shared.csaCall(() => shared.csaRuntime.OnLoad());   // CSA-C: ComeSailAway.OnLoad - the boats' visibility (a record still waiting on the models runs it when it lands)
    } finally {
      shared._loading = false;
    }
  }
  /** The ONE pose-apply (quickload + the classic import share it). */
  /** AUDIT OW5b D4: THE OVERWORLD FORGETS THE ABANDONED RUN ON EVERY LOAD - its chases, the crossing's hand on the helm,
   *  its lists, the view itself, the spawns it was told of. They sat in applyPose past `if (!pose) return;`, so a save
   *  without a pose (an older envelope) loaded with the last run's chases still running, its rudder held, its "?"s. */
  function overworldLoadReset() {
    shared.reachEvents.reset(); shared.sealHost.clearSafe();
    shared.tvRaid.chase.clear(); shared.tvRaid.spent.clear(); shared.tvRaid.list = []; shared.tvRaid.at = -Infinity; shared.tvRaid.peer.clear(); shared.tvRaid.spentAt.length = 0;   // OWS3: no chase across a load; OW6: nor what the peers said, nor what I was saying
    shared.csaJourneyHelm.held.clear(); shared.csaJourneyHelm.row = false; shared.tvSea.means = null; shared.tvSea.phase = null; shared.tvSea.boat = null; shared.tvSea.wasLive = shared.csaJourneyHelm.live = false;   // AUDIT OWS A1: nor a crossing's hand on the helm - a load into a dungeon's boat kept its rudder held
    shared.tvPlates = { at: null, list: [] };   // AUDIT DEEP T2-4: the loaded character's discoveries - never the plates the last one knew
    shared.tvFar = { at: null, near: -1, list: [] };   // TV5: nor the far places
    shared.tvDng = { at: null, dg: -1, list: [] };   // TV6: nor the dungeons
    shared.tvFind = { at: null, dg: -1, n: -1, list: [] };   // AUDIT OW5 D1: nor the find's
    shared.tvBandSeen = { at: null, life: -1, list: [] }; shared._bandChase.clear(); shared._bandSpent.clear(); shared._bandMake.clear(); shared._bandPos.clear(); shared._bandPeer.clear(); shared._bandSpentAt.length = 0; shared.wildBands.prune(() => false);   // TV7: nor the bands - AUDIT-F3: nor what they had noticed (a band that chased the abandoned run chased again on the first frame, from wherever it stood)
    shared.travelView?.exit('load', true);   // AUDIT DEEP X-3: a load under the travel view cuts it first - its release put the head back over the camera the save restores
    shared._owSay.sp.clear(); shared._owSay.dg.clear();   // OW6L: nor what the abandoned run still owed its cell (the loaded ledger is the save's)
    shared.tvDngModels = { at: null, dg: -1, n: -1, list: [] }; for (const e of shared._tvDngModel.values()) e.hold.release(); shared._tvDngModel.clear();   // OW-DUNGEONS: nor their models, once the view is cut
    // AUDIT OW4 D3: NOR THE SPAWNS THE ABANDONED RUN WAS TOLD OF - the Overworld marks a spawn once its pixel's line was
    // said (tvSpawnKnown), and that set outlived every load: another save's character saw "?"s where the last one had
    // walked. The loaded character's own are in the store its save restored (the same crossing files them, syncTopics).
    shared._announcedSpawnPixels.clear();
  }
  function applyPose(pose) {
    overworldLoadReset();   // AUDIT OW5b D4: a load without a pose is a load all the same
    if (!pose) return;
    // AUDIT ONCRASH1 B5d: A SAVE IS A DOOR TOO. ONCRASH1's commit said the angle defect was "not reachable offline";
    // it was, through this line. A quickload or a classic import carrying a non-numeric or absurd `yaw` wrote it
    // straight into `cam.yaw`, which feeds fpArm's turn wrap and some twenty `Math.sin(cam.yaw)` sites - so a
    // corrupted save hung the arm's loop with no socket in sight, and a string yaw NaN-poisons the forward vector
    // to this day. The wrap cannot hang any more; this is the bound the wire has and the save did not.
    if (Number.isFinite(pose.yaw)) shared.cam.yaw = wrapAngle(pose.yaw);
    shared.cam.pitch = pose.pitch ?? shared.cam.pitch;
    if (pose.crouching != null) shared.player.crouching = !!pose.crouching;
    // AUDIT 63 F25/F31: the sheath AND the hand, SerializablePlayer
    // .cs:420-421's two lines, as the one pair they are there. HARD2c:
    // they used to sit thirteen lines apart here - F25 is what that
    // cost - and the flag-only and presence-gated laws they each
    // restated now live once, with their citations, in
    // combat/playerWeapon.js's applyWeaponPose.
    applyWeaponPose(shared.weaponRig.playerWeapon, pose);
    // SL-2 (AUDIT 65): ...and the SAME pair into the interior rig, the
    // one the player's hands actually hold inside a building. DFU has
    // ONE WeaponManager for every WorldContext (SerializablePlayer
    // .cs:420-421 sets it once, whatever the context), so this is the
    // one bit landing in every rig rather than a second restore. NOT
    // mode-gated on purpose: worldQuickLoad runs forceExitToExterior
    // FIRST (:4184) and re-enters the building after (:4217), so an
    // OUTDOOR save loaded while the player was standing indoors would
    // otherwise leave the interior rig holding the outgoing session's
    // drawn weapon for the next door. Flag-only, like the two above.
    shared.modes?.applyWeaponPose?.(pose);
    // AUDIT 39 (SerializablePlayer.cs:423): the mount comes back
    // through the ONE builder, so the riding sprite, the hoof loop,
    // the ride bob and the no-climbing-from-a-saddle rule re-arm with
    // it. A pose without the field (an older save, the classic import)
    // leaves the live mode standing.
    if (pose.transport != null) shared.setTransportModeHere(pose.transport);
    // MW-D30: the saved camera is FORCED, exactly as the reference
    // applies its REC_CAM_ flag on load (statemanagerimp.cpp:617-618
    // togglePOV when the live view differs). A pose without one (an
    // older save, the classic import - a Daggerfall .SAV carries no
    // Morrowind camera) leaves the live camera standing.
    mwViewLoadPose(pose.camera, (shared.modes?.mode ?? 'exterior') !== 'exterior');   // AUDIT-EOTB2: both lanes - the Morrowind restore above, and the sprite camera's OnLoad (EOTB-IL: with PlayerEnterExit.IsPlayerInside)
  }
  /**
   * SAV3: the classic-save import arm - StartFromClassicSave's game
   * half over the SAV2 converter. The menu's flow stashed the opened
   * SaveGames; this host owns the live deps (SPELLS.STD, the faction
   * dict, MAPS.BSA) so the conversion runs HERE, then the import rides
   * the ONE restore seam like any load.
   *
   * THE FOUR HOSTS, named per the 17e rule: world.js (this host) is
   * WIRED - StartFromClassicSave always lands the import in the
   * EXTERIOR world at the position record's X/Z
   * (EnableExteriorParent + TeleportToWorldCoordinates, :529-534),
   * whatever the save's environment byte says, so worldModes.js
   * (interiors) and dungeonContext.js mount NO import arm by DFU's own
   * law, and exterior.js is the block-viewer probe host with no boot
   * params at all - all three deliberately unwired.
   */
  async function classicLoadBoot() {
    const saveGames = takePendingClassicSave();
    if (!saveGames) return false;
    // The deps the converter wants are async loads this host already
    // owns - await them so a fast boot cannot import a spell-less,
    // guild-less character.
    if (!shared.spellsByIndex) shared.spellsByIndex = await loadSpellIndex(fetchBytes);
    await shared.townTalk.ensureFactions?.();
    let bundle;
    try {
      bundle = classicSaveToSnapshot(saveGames, {
        spellsByIndex: shared.spellsByIndex, online: isOnlinePage(),   // LEVEL-ONLINE: an online import is a new online character (the law's system)
        factionStore: shared.townTalk.factionDict ? { dict: shared.townTalk.factionDict } : null,
        resolveLocation: (regionIndex, locationIndex) => {
          const region = shared.maps.getRegion(regionIndex);
          const row = region?.mapTable?.[locationIndex];
          if (!row) return null;
          return {
            mapId: row.mapId,
            regionName: shared.maps.getRegionName(regionIndex) ?? '',
            locationName: region.mapNames?.[locationIndex] ?? '',
          };
        },
        regionLocationCounts: Array.from({ length: 62 }, (_, i) => shared.maps.getRegion(i)?.locationCount ?? 0),
      });
    } catch (e) {
      console.warn('[world] classic save import failed:', e?.message ?? e);
      shared.townTalk.say('Could not import the classic save.');
      return false;
    }
    const extras = restorePlayer(playerEntity, bundle.snap, shared.spellsByIndex);
    if (!extras) return false;
    autoBuildArms(playerEntity);   // MWA1: the classic save's character too
    // AUDIT 58: StartFromClassicSave.cs:616 -
    // `Banking.DaggerfallBankManager.AssignShipToPlayer(saveVars
    // .PlayerOwnedShip)`, and AssignShipToPlayer is TWO statements
    // (DaggerfallBankManager.cs:488-497): the deed AND both of the
    // ship's scenes on the permanent list. The converter carries only
    // the deed (classicSave.js's `ownedShip`, with `sceneCache: null`),
    // and restorePlayer mints an EMPTY permanent set from that null -
    // so an imported ship's two scenes were ordinary, and the first
    // world move past its pixel threw away everything left aboard,
    // where a ship BOUGHT in the same session kept it. The ordering is
    // DFU's too: NewCharacterCleanup's ClearSceneCache(true) (:468)
    // runs first and the ship's scenes are added after (:616), which
    // here is after restorePlayer has minted the cache.
    assignShipToPlayer(playerEntity, playerEntity.ownedShip, { addPermanentScene: shared.shipPermanentScenes });
    setWorldMinutes(extras.classicMinutes ?? worldMinutes());
    // The quest machine's 64 classic globals, SET in place -
    // machine.hooks captured the Map reference at construction, so
    // the entries move, never the Map (ImportClassicGlobalVars).
    if (shared.questBridge?.machine?.globalVars) {
      for (const [i, v] of bundle.globalVars) shared.questBridge.machine.globalVars.set(i, v);
    }
    // The six-zone weather array, already masked and swapped by the
    // converter (:631-644); the first exterior frame wears it.
    importClimateWeathers(bundle.climateWeathers);
    // "Only import classic rumours when loading in game" (OpenSave
    // :256-260) - each RUMOR.DAT record through the mill's own
    // ImportClassicRumor, whose three skip gates do the filtering.
    for (const rumor of saveGames.rumorFile?.rumors ?? []) {
      shared.rumorMill.importClassicRumor(rumor, (bytes) => readRscTokens(bytes, 0, RSC.EndOfRecord));
    }
    // "Set player to world position": the import ALWAYS lands
    // exterior at the CharacterPositionRecord's world X/Z (:528-534).
    // Classic world units are the port's native units; the pixel
    // teleport rebuilds the streaming origin and the local spawn
    // lands inside it, the quickload arm's own shape.
    if (bundle.position) {
      const px = worldCoordToMapPixel(bundle.position.worldX, bundle.position.worldZ);
      await _teleportToPixel(px.x, px.y, null, { modEvent: 'load' });   // SIB2: a classic import is a load (StartFromClassicSave raises OnLoad)
      const [lx, lz] = shared.state.localFromWorld(bundle.position.worldX, bundle.position.worldZ);
      // The classic worldY does not translate (different vertical
      // frames); FixStanding's own answer - land on what is there -
      // is what PositionPlayerToLocation ends in anyway (:1597-1608).
      const raw = [lx, 2 + shared.state.compensation[1], lz];
      const ly = shared.walkMode ? floorLanding(shared.collider, raw)[1] : raw[1];
      if (shared.walkMode) { shared.player.spawn(lx, ly, lz); shared.playerSpawned = true; }
      shared.cam.pos = [lx, ly + (shared.walkMode ? 0 : 40), lz];
      shared.wodOnLoad(shared.walkMode ? [lx, ly + shared.player.height / 2, lz] : shared.cam.pos);   // WOD6: StartFromClassicSave raises OnLoad too
    }
    applyPose(bundle.snap.pose);
    shared._lastEncMinutes = Math.floor(shared.playerTicker.ownMinutes);   // no spawn catch-up across a load
    surfacePlayer();
    shared.townTalk.say(`Loaded classic save: ${bundle.saveName || bundle.snap.name}.`);
    return true;
  }

  // ONLINE-AUTOSAVE1 (Discord request, 2026-09-18: does the game save
  // when you leave online?): unloadGuard.js's own header explains why
  // it only ASKS and never saves, as a general rule - `beforeunload`
  // gives no time for async work, and a save begun there is as often
  // half-written as not. worldModes.quickSaveNow (and, in exterior
  // mode, worldQuickSave under it) is the one exception to that rule:
  // every composer it can reach is fully synchronous end to end
  // (saveSlot writes straight to localStorage, no await anywhere in
  // either chain), so it completes INSIDE this handler before the
  // page can actually go - none of the corruption risk the general
  // warning is about.
  //
  // Online only (`online`, the live session - see worldQuickLoad's own
  // header for why that is the correct signal and not `onlineOn`), and
  // only once there is a character worth saving (`playerSpawned`): an
  // abrupt close mid-session - the tab, Back, Ctrl-W, exactly what the
  // guard above exists to catch - no longer costs the whole session's
  // progress the way it could before. Playing offline is unchanged:
  // the browser's own unload prompt still asks either way, and a
  // player who saved five minutes ago and means to quit without saving
  // again keeps that choice offline; online, the choice of losing nothing
  // is made for them, the same way loading already is.
  //
  // EVERY SLOT THIS CHARACTER ALREADY HAS, by explicit request (Discord,
  // 2026-09-18) - QuickSave, AutoSave, and any save under a name the
  // player chose themselves - all brought to the state the player is
  // leaving in, not only the two the port itself manages. Nothing NEW is
  // created (saveKeysOfCharacter names only slots that already exist),
  // but a NAMED save is no longer a safe rollback point once this
  // character has played online: leaving online overwrites it too, same
  // as QuickSave/AutoSave always did.
  //
  // DISC19-C: AND NEVER A CORPSE. Closing the tab on the death screen
  // wrote the dead, still-poisoned player into every one of those slots
  // (Discord: "it overwrote all my saves"), and each of them loaded
  // straight back into the same death. exitAutosaveNames answers no
  // slot at all while the player is dead or any host's death screen is
  // up - DFU never saves during a death.
  // FIELD BUGS 29h (BOOT-HIDE): registered with the checkpoint's other doors, below the duel's (THE CHECKPOINT'S DOORS).
  const exitAutosave = () => {
    // AUDIT ONESEAT H4: and never from a tab another took the seat from (ONE-SEAT) - it is offline, and its every slot
    // of the character would be written over what the tab that has the seat saved (the same character, played on there)
    if (!shared.playerSpawned || shared.seatOut()) return;
    // the editor's Test ends first: the body back where it stood before it
    if (shared.poiTest?.active()) shared.poiEditorLeave?.('back');
    // BUNNYFALL SAVE-ON-EXIT: offline, the character's AutoSave slot only (systems/save/exitSave.js) - quiet, synchronous
    if (!shared.online) return void offlineExitSave(playerEntity, shared.townTalk.overlay instanceof DeathScreen || !!shared.modes?.deathUp?.() || successionOpen(), (n, o) => (shared.modes ? shared.modes?.quickSaveNow(n, o) : worldQuickSave(n, o)));   // `?.` inside the ternary: audit24 wave37's gate
    // AUDIT DUEL1 D5 + B4: a duel in play ends here as `left` (the opponent is told now, not after DUEL_GONE_MS) and its
    // heal runs now - the exit autosave below must not keep a duel's 1 health or its opponent's spells
    try { shared.duelLeaveNow(); } catch { /* no duel was built: nothing to end */ }
    // REALM P1.3: a realm character writes no local slot. AUDIT REALM2 C2: nor gives its lease up here - this comes before
    // the unload guard's "Leave site?" is answered, and a Stay played on in a session already left (every checkpoint
    // refused, F9 saying "saved"); the leave is the page's going (pagehide, whenPageGoes below)
    if (realmSession) return;   // the realm's: no slot
    const save = (saveName) => (shared.modes ? shared.modes?.quickSaveNow(saveName) : worldQuickSave(saveName));   // `?.` even inside the ternary: audit24 wave37's gate above the declaration is all-or-nothing
    for (const saveName of exitAutosaveNames(playerEntity, { deathUp: shared.townTalk.overlay instanceof DeathScreen || !!shared.modes?.deathUp?.() || successionOpen() })) save(saveName);   // AUDIT LEGACY B1: the Succession is a death up
  };

  /** The checkpoint gate as it stands now - its inputs built once, so the periodic checkpoint and the zone's death
   *  checkpoint below ask the same question and a new input reaches both (Home.md, THE ONE CONSTRUCTION SEAM). */
  const checkpointGateOpen = () => checkpointAllowed({ online: !!shared.online, spawned: shared.playerSpawned, seatOut: shared.seatOut(), duel: !!shared.duelMgr?.duel, walkWaiting: ownWalkWaiting(playerEntity), realm: !!realmSession });
  const onlineCheckpoint = ({ sink = null } = {}) => {   // AUDIT PRE-MERGE 1003 O10: `sink` a realm save's sink of the caller's (onlineCheckpointLanded)
    if (!checkpointGateOpen()) return false;   // AUDIT LIVED1b S1
    shared._checkpointAt = performance.now();
    try {
      // REALM P1.3: a realm character's checkpoint is ONE, the service's - the composer's sink sends it, no slot is written
      if (realmSession) return realmCheckpoint({ sink });
      // AUDIT LEGACY B1: the Succession is a death up
      const names = exitAutosaveNames(playerEntity, { deathUp: shared.townTalk.overlay instanceof DeathScreen || !!shared.modes?.deathUp?.() || successionOpen() });
      for (const saveName of names) {
        if (shared.modes) shared.modes?.quickSaveNow(saveName, { quiet: true });   // `?.` inside the test: audit24 wave37's gate above the declaration is all-or-nothing
        else worldQuickSave(saveName, { quiet: true });
      }
      return names.length > 0;
    } catch (e) { console.error('[online] checkpoint failed', e); return false; }   // never the frame's end: the next is due ONLINE_CHECKPOINT_MS on
  };
  /** REALM P1.3: THE REALM'S CHECKPOINT - the character composed by the standing host and handed to the session by the
   *  composer's sink. Refused as the exit save is on the death screen: a dead character is never the realm's save. */
  function realmCheckpoint({ sink = null } = {}) {
    if (!realmSession || realmSession.lost) return false;
    if (shared.townTalk.overlay instanceof DeathScreen || shared.modes?.deathUp?.() || !(playerEntity.health > 0)) return false;
    // AUDIT REALM2 M5: the composer's own answer - a save it refused (the court, the Ocean Holes descent) is no checkpoint,
    // and a trade's hold (realmTradeEscrow's `=== false`) must not begin over the older record the service holds
    stampItemIds(playerEntity);   // INT4: every valuable piece in the character's own lists carries its id into the realm's save
    const opts = sink ? { quiet: true, sink } : { quiet: true };   // AUDIT PRE-MERGE 1003 O10: a caller's sink, to hear the put's answer
    return !!(shared.modes ? shared.modes?.quickSaveNow(QUICK_SAVE_NAME, opts) : worldQuickSave(QUICK_SAVE_NAME, opts));   // `?.` even inside the ternary: audit24 wave37's gate above the declaration is all-or-nothing
  }
  /** AUDIT PRE-MERGE 1003 O10: A CHECKPOINT THAT LANDED - for a door that must not say a thing done before the save that
   *  holds it is the realm's (systems/online/onlineHomes.js moveArenaHomes: a displaced home's move said read). A realm
   *  character's checkpoint answers the realm's word on the PUT that carried it (the composer's sink - scenes/shared.js
   *  realmSaveSink, `{ ok }`), not the save handed over: `onlineCheckpoint` answers true the moment the save is handed to
   *  the session, the put still out - refused, or the page gone first, it left the record's old scene full and the move
   *  read, the case the ARENA4b record says the order prevents. False when refused outright; a slot's answer at once. */
  const onlineCheckpointLanded = () => {
    const into = realmSession ? realmSaveSink() : null;
    if (!into) return onlineCheckpoint();
    let put = null;
    if (!onlineCheckpoint({ sink: (snap) => { put = into(snap); return put; } })) return false;
    return put ?? false;
  };

  /** REALM P1.3: A CHARACTER BORN ONLINE - made at the service once chargen is done, its first save the service's
   *  checkpoint at sequence 1, and then the one online boot there is, from the service. Any refusal goes to the door. */
  async function realmBirth() {
    const io = realmIoNow();
    if (!io) { realmLost('signed-out'); return; }
    for (let i = 0; !shared.playerSpawned && i < 240; i++) await new Promise((r) => { setTimeout(r, 250); });   // the world stands before it is saved
    // LEGACY7: the founder of a house is born as its first member - the line the realm's before the character is
    const made = await realmCreateLegacy(io);
    if (!made.ok) { realmLost(made.error); return; }
    const put = await realmFirstSave(io, made);
    if (!put.ok) { realmLost(put.error); return; }
    releaseUnloadGuard();
    location.replace(`${location.pathname}${realmBootSearch(location.search, made.data.id, BOOT_DOOR_KEYS)}`);
  }
  /** LEGACY7: THE REALM'S CHARACTER MADE for the one in the world - as the person of Project Legacy's line they play,
   *  when they play one (server-account/src/legacy.js: a living member no realm character has played) - its id the
   *  realm's from here, in the entity and in the family's record (legacyHost.rebind). The line is written to the realm
   *  first: the service reads the person off it. A refusal the network made is asked again, twice. */
  async function realmCreateLegacy(io) {
    await legacyRealmLine?.flush();
    const fam = shared.legacyHost?.family ?? null;
    const me = shared.legacyHost?.current() ?? null;
    const born = fam && me && legacyOn() ? { lineage: fam.id, person: me.id } : null;
    // AUDIT LEGACY III O2/P1: THE LINE STANDS AT THE REALM FIRST - the service reads the person off it. One the network
    // kept is asked again, twice; one the realm refused is the reason the door says (its own word, never the birth's
    // "they cannot take up the line" for a person the realm was never shown)
    for (let i = 0; born && legacyRealmLine?.unwrittenOf(fam.id) && !legacyRealmLine.refusalOf(fam.id) && i < 2; i++) {
      await new Promise((r) => { setTimeout(r, 2000 * (i + 1)); });
      await legacyRealmLine.flush();
    }
    const unwritten = born ? legacyRealmLine?.unwrittenOf(fam.id) ?? null : null;
    if (unwritten) return { ok: false, error: unwritten };
    let made = null;
    for (let i = 0; i < 3; i++) {
      made = await realmCreate(io, playerEntity.name || 'Traveller', realmSummaryOf(playerEntity), born);
      if (made.ok || !['offline', 'server'].includes(made.error)) break;
      await new Promise((r) => { setTimeout(r, 2000 * (i + 1)); });
    }
    if (!made?.ok) return made ?? { ok: false, error: 'server' };
    const was = playerEntity.characterId;
    playerEntity.characterId = made.data.id;   // the realm's id, never the client's
    shared.legacyHost?.rebind(was, made.data.id);
    await legacyRealmLine?.flush();
    return made;
  }
  /** REALM P1.3: A CHARACTER'S FIRST SAVE, the realm's checkpoint at sequence 1 (REALM-GZIP: packed when it said so). */
  async function realmFirstSave(io, made) {
    let text = null;
    const sink = (snap) => { text = JSON.stringify(snap); };
    if (shared.modes) shared.modes?.quickSaveNow(QUICK_SAVE_NAME, { quiet: true, sink });
    else worldQuickSave(QUICK_SAVE_NAME, { quiet: true, sink });
    if (!text) return { ok: false, error: 'server' };
    return realmPut(io, made.data.id, { lease: made.data.lease, seq: 1, summary: realmSummaryOf(playerEntity) }, text, { gzip: made.data.gzip === true });
  }
  return {
    bootLoadPick, bootSnap, checkpointGateOpen, classicLoadBoot, exitAutosave, onlineCheckpoint,
    onlineCheckpointLanded, realmBirth, realmCreateLegacy, realmFirstSave, worldQuickLoad, worldQuickSave,
  };
}
