// The frame's input phases: the mouse look, the online step above the window gate, and the
// first simulation step with the party ping and the music.
import { bazaarScoreFrame } from '../../audio/bazaarAudio.js';
import { closeBrokerDoor } from '../../ui/brokerDoor.js';
import { COURT_TEXT, courtRing } from '../../world/gateArena.js';
import { DeathScreen } from '../../ui/deathScreen.js';
import { expandMessageBoxTokens } from '../../talk/talkMacros.js';
import { foeFrameDt } from '../../characters/enemyMotor.js';
import { glassLookScale } from '../../ui/spyglassView.js';
import { isNight } from '../../world/worldClock.js';
import { keyboardLook, pressed } from '../../ui/input.js';
import { keyboardLookRate, lookInvert } from '../../ui/lookSettings.js';
import { lastHealthLost, lastHealthLostPercent } from '../../ui/hudVitals.js';
import { madeRuleHere } from '../../characters/madeLevel.js';
import { messageBox } from '../../ui/notify.js';
import { meterFor } from '../../render/perfMeter.js';
import { noteLocalPlayer, tickTactics } from '../../ai/tactics.js';
import { plainLines } from '../shared.js';
import { playerEntity, presentPlayerDeath } from '../../characters/playerEntity.js';
import { PORTAL_TEXT } from '../../travel/portalStone.js';
import { rayDirFromScreen } from '../../player/tapRay.js';
import { resetTimeScale, timeScale as worldTimeScale } from '../../world/timeScale.js';
import { restoresSoFar } from '../../saves/save.js';
import { setCourtRules } from '../../worldEvents/courtRules.js';
import { setFlatLean } from '../../render/bounds.js';
import { setLoadingAside, syncLoading } from '../../ui/loadingScreen.js';
import { skyMinutes } from '../../world/worldTick.js';
import { successionOpen } from '../../ui/legacyDoor.js';
import { swingSuppressesLook } from '../../player/lookFilter.js';
import { syncInteriorLoad } from '../../ui/interiorLoadMark.js';
import { takePortalGiftNotice } from '../../worldEvents/gateSpoils.js';
import { tickAmbientText } from '../../mods/ambientText.js';
import { tokenRows } from '../../ui/messageBox.js';
import { windowHoldsDungeon } from '../../net/windowWorld.js';
import { worldViewportRect } from '../../ui/hudLarge.js';

/** @param {any} shared */
export function createInputFrame(shared) {
  const {
    _canvasSize, _fr, _holidayText, _livingRemainsPlace, _mode, _musicInLocationRect, _musicLocationIndex, _musicLocationType,
    _questBoxHoldsFoes, _questRegionIndex, arenaBouts, arenaFrame, arenaScoreFrame, cam, cameraRecoiler, canvas,
    cromwark, csaDrawHelmPanel, csaHoldsTimeScale, csaRuntime, deadlandsAirFrame, droppedTorches, egCourtFrame,
    ejectFromCourt, festivalStage, gameDaysNow, gamepad, gamePaused, gateCourt, gateScoreFrame, hccActionPressed,
    headBobber, helmTurnKeys, holdDoor, hourScoreFrame, keys, latch, loadingLineNow, loadingPlaceNow, lockOn,
    lookFilter, lookGate, minuteNow, modeNow, modes, musicDirector, navalOn, onlineFrame, onlineOn, onlineStart,
    peerCandlesFrame, player, portalGates, questSyncTick, renderer, saddleDrawPanel, sdAirFrame, sdFightAway, seatOut,
    serpentAway, shipFlags, sigilBroker, soundscape, spoilsRecoverFrame, spyglass, talkMcp, townTalk, travelControlUI,
    tvWalkHoldsTimeScale, walkMode, weaponRig, worldMoveBusy, yards,
  } = shared;
  function frameInputPhase(now, dt) {
    // AUDIT 28 W7 + F-C1/F-C2 (self-audit 3): PlayerMouseLook.Update's
    // three answers - paused (:241-244) returns before ApplyLook and the
    // owed look WAITS; a held swing (:248-253, WeaponSwingMode 0, not a
    // bow) is SetFacing(lookCurrent) - the owed look is DROPPED; else
    // ApplySmoothing pays it out at the setting's fraction. Before the
    // camera is read.
    gamepad?.tick(dt);   // GP1: the pad's frame - its keys, its stick, its look - before the paused gate, so a window still sees Back and a lifted thumb still releases
    const frameLook = () => {   // PERF-V8 (MWNPC19: the frame back under three quarters of the ceiling)
    if (!gamePaused()) {
      if (swingSuppressesLook({ swingHeld: shared.rightHeld || shared.swipeHeld || shared.swingKeyLatch, weaponIsBow: weaponRig.playerWeapon.machine?.isBow }) && walkMode && modeNow() === 'exterior' && !shared.naval?.atGuns) lookFilter.settle();   // MAC-O2: the law is lookFilter.js's one seam (:246-248, WeaponSwingMode included); `walkMode` and the mode are this host's own - the mode host owns another screen weapon; NAV-H: at a helm with guns the held attack is the aim, which is laid BY the look
      else lookFilter.tick(dt, cam);
      // FIX-F: the KEYBOARD look - TurnLeft/TurnRight/LookUp/LookDown
      // (InputManager.cs:1854-1865), one look unit a frame in DFU, paid
      // here per second at the live sensitivity (ui/lookSettings.js),
      // into the same filter the mouse feeds, owed to the NEXT tick as
      // a mouse delta is. Additive with the mouse rather than DFU's
      // override-for-the-frame (:1510-1511): a held turn key beside a
      // moving mouse is not a case a player reaches on purpose.
      const kb = keyboardLook(keys);
      if (helmTurnKeys()) kb.x = 0;   // HELM-KEYS: at a helm the turn keys turn the ship, never the view
      if (kb.x || kb.y) lookFilter.add(kb.x * keyboardLookRate() * dt * glassLookScale(spyglass.lens), kb.y * keyboardLookRate() * dt * lookInvert() * glassLookScale(spyglass.lens));   // AUDIT CAPTAIN'S SEA S13: slowed by the glass, as the mouse's
      if (pressed(latch.edge, keys, 'CenterView')) lookFilter.centerPitch(cam);   // KB1: Home levels the view (classic Daggerfall's centre key; DFU binds it and reads it nowhere)
      shared._lockChest = lockOn.tick(dt, cam, cam.pos, lookFilter);   // TI1: the lock pays its facing into the same filter, owed to the NEXT tick like a look
    }
    };
    frameLook();
    // DEATH-KEPT (FIELD BUGS 2026-09-30b, Niwy: "If you cure a disease and die at the same time you will became
    // immortal"): A PLAYER AT ZERO IS DYING, whatever took the screen. The damage door raises a death on the blow that
    // crosses to zero and never again (the TRANSITION, AUDIT 21), so the death lives in its screen - and a window written
    // over a host's slot took it: a temple priest's Talk closing into its service window over a building's death, a
    // replace over the stack's top (holdsTop is the push's alone). The player stood at 0% health with no screen; every
    // later blow found them already at zero, the stat-zero and exhaustion kills stand down at zero, and online read them
    // alive (the D12 gate reads the screen). DFU's deathInProgress is no window: nothing can close it. Asked again here,
    // above every mode gate - the presenters already refuse a second screen over their own - and never while the world
    // moves (a load restores the save's health under its latch; a respawn heals first).
    // AUDIT LEGACY B1: and never while the Succession stands - it IS the death's screen, the fallen at zero under it by
    // design; a death screen raised over it disposed it the next frame, and no Bloodline line could ever be carried on
    if (shared.playerSpawned && playerEntity.health <= 0 && !worldMoveBusy() && !(townTalk.overlay instanceof DeathScreen) && !modes?.deathUp?.() && !successionOpen()) presentPlayerDeath(playerEntity);
    // AUDIT DEEP X-1: A DOOR CUTS THE VIEW HERE - a door, a teleport, a load inside. Its own cut (`travelView.frame` reads
    // the host's mode) is in the exterior frame, below the mode's return, so indoors the view stood up until its heartbeat:
    // the readout over the room, the canvas's clicks picks, Escape its own, the traveller turned by the keys
    if (shared.travelView?.active && (modes?.mode ?? 'exterior') !== 'exterior') { shared.travelView.exit('door', true); setFlatLean(0); }   // AUDIT DEEP2 D8: the lean is the exterior frame's - set only there, a door taken under the view left every flat indoors culled as leaned
    shared.travelView?.steer(dt);   // TV1: under the travel view the keys are camera-relative and the look keys turn the view - before the motor reads the heading
    // AUDIT-TO1 G2: THE SCALE'S NET, ABOVE EVERY MODE GATE (below the video hold and the look filter's own tick, whose adjacency AUDIT 39 #160 and AUDIT 28 W7 pin). timeScale() is
    // module-global and the motor reads it in every host, but every
    // door that lowered it sat below `if (modes.frame(dt, now)) return`
    // inside the exterior block - so a building door clicked mid-journey
    // left the player running the shop at fifty times walking speed
    // with nothing left to set it back. A journey is an exterior thing
    // (the mod's own follow key refuses indoors, :1136-1137): an indoor
    // mode with the panel up ENDS it, as any other window on top would
    // (:1040-1047), and a scale with no panel behind it is reset here.
    if (travelControlUI?.isShowing && (modes?.mode ?? 'exterior') !== 'exterior') travelControlUI.closeWindow();
    if (!travelControlUI?.isShowing && worldTimeScale() !== 1 && !csaHoldsTimeScale() && !tvWalkHoldsTimeScale()) resetTimeScale();   // CSA-G: a scale the helm's time keys set has no panel behind it either; TV-WASD: nor the Overworld keys' travel
    // TI1: the tap's one-frame press. Armed 2 on the tap: this frame
    // counts to 1 and the gate sees the press (AUDIT 62 F8: `_tapArmed
    // > 0` IS the press - the arm no longer stuffs a literal 'Mouse0'
    // into the held set, which a rebind of ActivateCenterObject would
    // have made inert); next frame counts to 0, the press lifts, the
    // ray is built through the frame the finger saw, and the gate fires
    // the activation on that release. The frame after clears the ray.
    shared._tapClick = shared._tapArmed === 1 && !!shared._tapPoint && !shared._tapLockOnly;   // AUDIT PRE-MERGE 0928 U2: this frame lifts a finger's press (the gate's fire) - never the stick's lock-only tap (TS1) nor a quick-loot key's arm, which have no finger behind them
    if (shared._tapArmed > 0 && --shared._tapArmed === 0) {
      shared._tapDir = (shared._tapPoint && shared._lastProj) ? rayDirFromScreen(shared._tapPoint[0], shared._tapPoint[1], _canvasSize().w, _canvasSize().h, shared._lastProj, shared._lastView, cam.pos, worldViewportRect(_canvasSize().w, _canvasSize().h)) : null;
    } else if (shared._tapArmed === 0 && shared._tapPoint) { shared._tapPoint = null; shared._tapDir = null; shared._tapLockOnly = false; }
    // AUDIT 28 W9: CameraRecoiler.Update - the reel from a hit, on the
    // detector's loss from the vitals rig, same paused gate (:50-51).
    cameraRecoiler.update(dt, cam, { healthLost: lastHealthLost(), healthLostPercent: lastHealthLostPercent(), paused: gamePaused() });
    // AUDIT 28 W10: HeadBobber.Update - the walk bob and nod, the landing
    // dip; the position rides player.eye as a world offset, the nod is a
    // per-frame offset on the look (removed and re-applied each frame).
    {
      const bob = headBobber.update(dt, cam, {
        health: playerEntity.health, paused: gamePaused(), climbing: !!player.climb?.isClimbing, grounded: !!player.grounded,
        swimming: !!player.isPlayerSwimming, running: !!player.isRunning, crouching: !!player.crouching, riding: !!player.riding, levitating: !!player.levitating,   // TR1: the Horse bob style   // XL-1: HeadBobber.cs:101 and :215 both read playerEnterExit.IsPlayerSwimming, never the motor's flag
        velocity: player.moveSpeed || 0, moving: !!(player.moveForward || player.moveStrafe), out: player,   // TWO-HANDS (AUDIT): the bob's timer for the running hands' stride (player/motor.js motionBagOf)
      });
      const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);   // HANDEDNESS (mat4's law): right = (cos, 0, -sin)
      player.bobOffset = [cy * bob[0], bob[1], -sy * bob[0]];
    }
    shared.last = now;
  }
  function frameOnlinePhase(now, dt) {
    meterFor(renderer.gl)?.markCpu('online');   // PERF-CPU
    // OH-D: OceanHoles' clock (Time.time, held by a pause) and its Update's dungeon half - ABOVE THE MODAL GATE, as a
    // MonoBehaviour's Update is: the abyss is watched from inside the dungeon it made (the stale context, the Recall
    // binding, the name kept); the tile half runs with the streamed world (ohFrame).
    // AUDIT OH-F A1: and LoadSettings' callback, which DFU raises in any mode - the abyss's two sliders live inside it.
    // AUDIT OH-F B5: and BEFORE the online frame - a Recall's reactivation renames the dungeon, and its map id is the
    // relay room's key (online.js roomKeyFor): the drowned dungeon never joins its dry template's room for a frame.
    if (shared.oceanHoles) { shared._ohTime += gamePaused() ? 0 : dt * worldTimeScale(); shared.oceanHoles.checkSettings(); shared.ohAbyss?.update(); }
    holdDoor.frame();   // CARGO-ANYWHERE: the helm I hold, remembered - and the hold's key, in every mode (the cabin's too)
    if (csaRuntime && walkMode && shared.playerSpawned && !modes?.transitioning && !shared.travelView?.active && hccActionPressed('ShipHold')) holdDoor.press();
    if (navalOn() && hccActionPressed('ShotCycle')) shared.naval?.cycleShot?.(1);   // SHOT-KINDS: the guns' load, from its key (at a helm with guns - the host's own test)
    shipFlags.frame();   // SHIP-COLOURS: the flags flown this frame, and the pennants they replace
    saddleDrawPanel();   // STEED-UI: the saddle panel, as the helm's below - every mode, so a door takes it down
    csaDrawHelmPanel();   // CSA-L: the helm panel, once a frame in every mode
    spoilsRecoverFrame();   // WB5: a boss's spoils no save holds, back to their character as it stands up - before it can save, online or not
    if (onlineOn && shared.playerSpawned) { if (!shared.online) onlineStart(); onlineFrame(now, dt); } else { if (shared._peerCandleLights.length) peerCandlesFrame([], dt);   /* PEERLIGHT2: offline, no one's candle stays lit */ serpentAway(!onlineOn); /* SERPENT1: its bar put away - offline, my ship let go of its coil */ sdFightAway(); /* SD8c: and the Remnant's */ if (!onlineOn && modes?.gateArenaDay?.() != null) { ejectFromCourt(COURT_TEXT.collapse); gateCourt?.leave(); /* AUDIT SS: and its floor into the pack - online, the frame's own court does it */ } if (player.arena) player.arena = modes?.gateArenaDay?.() != null ? courtRing() : null; if (!player.arena) player.arena = arenaBouts.ring(); /* ARENA2: my bout's ring on the arena's sand */ shared.siegeHud?.hide(); /* AUDIT-SEATS C1: no online frame (a load, a spawn), no battle's tick - its HUD hidden, never frozen; the next tick draws it again */ }   // DUEL1: no online frame, no duel's law to hold the body - the ring is the live duel's alone; WB3b: the court's is its floor's, and offline there is no court   // ONLINE1: the pose out, the peers in - after the look is paid, before the camera is read and any mode draws
    if (!(onlineOn && shared.playerSpawned)) cromwark.cannonFrame();   // BUNNYFALL: the Great Cannon stands offline too (the online frame carries it otherwise)
    deadlandsAirFrame();   // WB6b: after the court's ways out have run, online or not - the frame it is gone is the frame its air falls silent
    sdAirFrame();   // SD14b: and the Hour's, the same way
    if (onlineOn && shared.playerSpawned && (seatOut() || townTalk.overlay instanceof DeathScreen || modes?.deathUp?.())) { shared.siegeHud?.hide(); shared.siegeNpcs?.leave(); }   // AUDIT SEATS-2 C4: the dead and a tab out of the seat draw no battle - the online frame returns before its tick
    arenaFrame(dt);   // ARENA2: the bout on the city's floor or the instance's - before the modal return, so the instance's runs too
    setCourtRules(madeRuleHere('regen') === 'held');   // WBX6: the Deadlands hold regeneration - set before any magic round of this frame, cleared the frame the court is gone; SD5a: and the Shattered Hour; EG-H2: and the Spire - one law, systems/madeLevel.js; EVENT-RULES: held, not off - half, and none for 5 s after a hurt (systems/courtRules.js)
    egCourtFrame();   // EG-PLAY: no online frame - the breach's fight and tracker put away; in an Elite Breach, the court's law (Elite-Gates.md section 16)
    // LOAD1: THE LOADING SCREEN STANDS WHILE THE WORLD IS MOVED - AUDIT 68 S22's one question (every mover's latch, the
    // teleport core's window, the abyss) and a door's build in this host's modes. Above the mode's return, so every
    // drawn frame asks; below the video's wait (AUDIT 39 #160's head, and AUDIT 28 W7's tick on the frame's dt) - a
    // film's hold takes the screen aside for its lifetime (scenes/shared.js holdFrame), and the first frame after asks.
    // AUDIT LOAD1 2: and a window up - a pause, a level-up box, the chargen - is the player's, never under the screen.
    syncInteriorLoad(!!modes?.transitioning);   // before the hold ends: a finished building's screen stays hidden through its fade
    const _moving = worldMoveBusy() || !!modes?.transitioning;
    setLoadingAside('window', townTalk.overlayActive || !!modes?.overlayHeld);
    syncLoading(_moving, { place: loadingPlaceNow, line: loadingLineNow });
    if (!_moving) { shared._loadingDest = null; shared._partyWaitLine = ''; }
  }
  function frameAbovePhase(now, dt) {
    meterFor(renderer.gl)?.markCpu('sim');   // PERF-CPU: everything between here and the next mark is the rest of the simulation
    lookGate(gamePaused());   // a window up frees the cursor; closing re-locks
    const fwd = [Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)];
    shared.partyPing?.frame({ eye: (shared.travelView?.active && shared.travelView.eye) || cam.pos, dir: (shared.travelView?.active && shared.travelView.fwd) || fwd });   // PARTY-PING: one look, every mode, before the modal return
    const right = [Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)];   // HANDEDNESS (mat4's law): screen-right = (cos, 0, -sin) under the mirrored projection - Unity's own right
    noteLocalPlayer(walkMode && shared.playerSpawned ? player.pos : cam.pos, fwd);   // TACT2: where I stand and face - a foe behind me sees my back (ai/tactics.js)
    tickTactics(foeFrameDt(_questBoxHoldsFoes() || (_mode() === 'dungeon' && windowHoldsDungeon(modes?.dungeonCtx?.uiOverlayActive, playerEntity.health > 0 && !modes?.deathUp?.())) ? 0 : dt));   // AUDIT TACT D10/A3: the brain's clock is the foes' own step - held when they are; AUDIT TELL H1: a dungeon's window holds its foes, and their wind-ups with them

    // Modal frame (worldModes.js): interior/dungeon consume the frame
    // entirely - the early return also freezes streaming (the
    // context-local player position must never feed the recenter logic).
    // AUDIT 21 F1: THE MUSIC CONTEXT IS FED BEFORE THE MODAL RETURN.
    // worldModes.frame() consumes the frame and returns TRUE for interior
    // and dungeon; musicContext() returns null ONLY for exterior. They are
    // the same predicate, so with the update below the early return it ran
    // exclusively on frames where the overlay was guaranteed to be null -
    // entering a tavern kept the street song, entering a dungeon kept the
    // sunny outdoor track, and when that song ended nothing fed `songEnded`
    // so it fell silent for the rest of the visit. The whole interior and
    // dungeon music path was dead code in this host.
    const frameMusic = () => {   // PERF-V8 (AUDIT SOUNDSCAPE: the sea's score in the chain put the host's frame past three quarters of the ceiling)
    if (!hourScoreFrame() && !gateScoreFrame() && !arenaScoreFrame() && !soundscape.scoreFrame() && !bazaarScoreFrame(!!modes?.inBazaarBetwixt?.())) musicDirector.update({
      inside: false,
      inLocationRect: _musicInLocationRect(),
      locationType: _musicLocationType(),
      locationIndex: _musicLocationIndex(),
      weather: shared.weather,
      night: isNight(minuteNow()),
      gameDays: gameDaysNow(),
      // UpdatePlayerMusicArrested (:568-571). Checked FIRST in
      // AssignPlaylist and overrides the environment entirely.
      arrested: Boolean(playerEntity.arrested),
      festival: festivalStage?.festive(shared._musicLoc?.mapTableData?.mapId) === true,   // FESTIVAL-STAGE: a Festival town's streets hear the tavern
    }, modes?.musicContext?.() ?? null);
    };
    frameMusic();

    // AUDIT 64 F10 - PlayerEnterExit.Update's holiday-text drain
    // (:355-368): the cancel when the current location object changed
    // (:355-359), the countdown (:362-363), and the fire once the timer
    // has run out while the player is on the HUD (:364-368). It sits
    // ABOVE the modal gate because DFU's runs in Update, which is not
    // suspended by walking indoors; IsPlayerOnHUD (:400-403) is the
    // port's `!gamePaused()` - a window on top DEFERS the box.
    _holidayText.update(dt, {
      currentLocation: () => shared._musicLoc,
      onHUD: () => !gamePaused(),
      gameMinutes: () => Math.floor(skyMinutes()),   // ToClassicDaggerfallTime (:569); TIME1: the sky's date
      regionIndex: () => _questRegionIndex(),   // PlayerGPS.CurrentRegionIndex (:570)
      // SetTextTokens(int) with ClickAnywhereToClose (:574-575) - the
      // host's own TEXT.RSC parchment door, the one the quest boxes use.
      // ENH-NOTICE3: the rows are AUDIT 64 F10's own (this host's
      // mcp, so the %-macros expand); the box is the seam's.
      // SetTextTokens(int) + ClickAnywhereToClose is
      // DaggerfallUI.MessageBox (PlayerEnterExit.cs:573-575), so a
      // PUSH - and :364's IsPlayerOnHUD gate above already defers the
      // fire while a window is up, which is why this one almost never
      // has anything to push over.
      showRecord: (id) => {
        const rows = plainLines(tokenRows(expandMessageBoxTokens(townTalk.recordTokens(id), talkMcp()))) ?? [];
        if (rows.length) messageBox(rows);
      },
    });


    // HOME-YARD: the yards in line, and the owner's decorator on their lot - above the modal gate, so a door walked
    // through stands it down (its own frame reads the mode)
    yards?.frame({ dt, cam, overlayUp: !!townTalk.overlayActive });
    // AT2: AmbientTextMod.Update. ABOVE THE MODAL GATE, for the same
    // reason the holiday text is: it is a MonoBehaviour Update and DFU
    // does not suspend those when you walk through a door. One tick
    // here covers all three of this host's modes - the mod's own
    // IsPlayerInsideBuilding arm is what silences it indoors, not a
    // missing call - which is why worldModes.js, the interior host, is
    // deliberately NOT wired: its frame is consumed BELOW this line.
    // It sits above the torch sweep's own note rather than below it
    // because AUDIT 66 F11 pins that sweep ADJACENT to the modal
    // return, and a line between them reads to that pin as a sweep
    // that has drifted back down the frame.
    tickAmbientText();
    // QUEST1: the live-sync watch, at most every QUEST_SYNC_CHECK_MS - see its own definition above. AUDIT DISC28 QS-2:
    // ABOVE THE MODAL GATE, as the ambient text above it is - ONE call covers exterior, interior and dungeon mode. It sat
    // below the exterior's quest tick, which the modal return never reaches, while the interior and the dungeon tick the
    // machine inside modes.frame: a shared quest finished in a house or a dungeon (The Courier's is in the residence)
    // told nobody until its player walked out, and a partner in the same house finished their own copy meanwhile. What
    // this frame's tick queues goes out on the next frame, in every mode.
    questSyncTick();
    // AUDIT 66 F11: the torch sweep runs HERE, above the modal
    // return, because that is where the transition is. It used to sit
    // with the tick at the foot of the exterior frame - which this
    // branch never reaches - so walking into a shop left the street's
    // dropped torches standing: their billboard batches held and,
    // worse, their 3D burning loops playing in the player's ear for
    // the whole indoor visit, swept only on the first frame back
    // outside. DestroyLightSources_OnTransition is an EVENT in the mod
    // (0x7d1), not a frame-tail chore.
    if (restoresSoFar() !== shared._portalRestores) { shared._portalRestores = restoresSoFar(); portalGates.clear(); shared.livingDivers?.clear(); shared.livingRemains?.clear(); _livingRemainsPlace.clear(); }   // PORTAL1: A LOAD ENDS EVERY PORTAL STANDING - asked at the one door every load passes (save.js restorePlayer: the world's, a classic import, a dungeon's own), so no branch of any load keeps one (AUDIT PORTAL1 U9); the save's pack is the truth. AUDIT LW-II-2 D2: and LETS THE DEEP'S LAYERS GO - a same-dungeon load keeps the pool, so the divers read the bodies its rewind cut as cut down beside the player (a death, a slaying, in the loaded game) and the remains a pile it wiped as taken (spent); met and laid again from the save's world
    if (shared._bootLoaded) { const gift = takePortalGiftNotice(); if (gift) townTalk.say(PORTAL_TEXT.gift(gift)); }   // PORTAL-GIFT: the stones a load gave, said once the world stands - every load's (the boot's, F9's, a dungeon's own), in every mode
    if (_mode() !== shared._torchesMode) { droppedTorches.destroyAll(); weaponRig.silenceTorch();   /* DISC6: the street's rig leaves (or retakes) the frame - its torch loop falls silent, and the rig that ticks starts its own */ if (shared._torchesMode === 'exterior') { closeBrokerDoor(); sigilBroker?.destroyAll(); }   /* AUDIT SET W2: the street left (the gate's court entered under the veil's 1.2 s, an interior, a travel) - her window shut and her post down, never carried in */ if (shared._torchesMode === 'exterior') shared.lefay?.destroyAll();   /* LEFAY1: the monument's collider down, never carried in */ if (shared._torchesMode === 'exterior') shared.poiHost?.standDown();   /* POI-2: the POIs' colliders down, never carried in - AUDIT POI R8: their models kept, placed again on the way out */ portalGates.forgetSteps(); shared._torchesMode = _mode(); }   // HT1; PORTAL1: the step forgotten at every change of place
    // the editor's Test, in every mode: when the world changes under it, it ends
    shared.poiTest?.frame();
    _fr.fwd = fwd;
    _fr.right = right;
  }
  return { frameAbovePhase, frameInputPhase, frameOnlinePhase };
}
