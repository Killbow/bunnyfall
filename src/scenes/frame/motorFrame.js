// The frame's motor phase: the editor camera, walking, and the player's motion each frame.
import { ActionTextBox } from '../../ui/actionText.js';
import { activateFrame, createActivateGate } from '../../player/activateGate.js';
import { activeMouseOverLargeHUD } from '../../ui/hudLarge.js';
import { afloatMessageStep, CANNOT_FLOAT_HUD_SECONDS, MAX_FRAME_DT } from '../../player/motor.js';
import { applyFallLanding, applyMotorEffectFlags } from '../shared.js';
import { audio } from '../../audio/audio.js';
import { autorunCancel } from '../../player/autorunCancel.js';
import { axesToward, keysHeading } from '../../player/travelCamera.js';
import { betterAmbience, classicFootstepAllowed } from '../../audio/betterAmbience.js';
import { breathStep } from '../../underwater/breath.js';
import { CAST_PRESS } from '../../magic/hostMagic.js';
import { centreFromFeet } from '../../characters/enemyAnchor.js';
import { CLASSIC_MINUTES_PER_SECOND, sharedClockOn } from '../../world/worldTick.js';
import { CLASSIC_UPDATE_INTERVAL } from '../../characters/weaponStates.js';
import { DeathScreen } from '../../ui/deathScreen.js';
import { droppedLootHooks } from '../../items/droppedLoot.js';
import { flushStateChange as dwFlushStateChange } from '../../underwater/deepWaterPlayer.js';
import { teleported as dwTeleported, loadGraceActive } from '../../world/deepWaterRuntime.js';
import { exteriorSwimming, ON_EXTERIOR_WATER } from '../../player/exteriorSurface.js';
import { flashPlayerDamage } from '../../ui/damageFlash.js';
import { floorLanding } from '../../player/enterExit.js';
import { FOUND_NOTHING_VALUABLE_TEXT_ID } from '../../talk/talk.js';
import { getInteractionMode } from '../../player/interactionMode.js';
import { held, moveHeld, pressed, released, swingKeyHeld } from '../../ui/input.js';
import { hurtPlayer, playerEntity, surfacePlayer } from '../../characters/playerEntity.js';
import { immersiveFootsteps } from '../../audio/immersiveFootsteps.js';
import { inventoryDoorReady } from '../../ui/inventoryDoor.js';
import {
  isBoatEffectBundle, SWIM_SOUND_CLIP, SWIM_SOUND_VOLUME, UNDERWATER_CUTOFF_HZ,
} from '../../world/deepWaterSwim.js';
import { isOnFoot, TRANSPORT_MODES } from '../../travel/transport.js';
import { isOutdoorWaterTile } from '../../world/terrainSurface.js';
import { lateSolidsOf } from '../../player/lateSolid.js';
import { LOCATION_TYPES } from '../../formats/mapsFile.js';
import { LOCK_PICK_DISTANCE } from '../../player/lockOn.js';
import { mwViewFootstep, mwViewWagonActivate, mwViewWagonTargets } from '../../player/mwView.js';
import { pickActivatableHit, pickFoe, pickQuestFoe, RAY_DISTANCE, tooFarAwayText } from '../../player/activate.js';
import { pickFootstepKind, pickFootstepSet } from '../../audio/footsteps.js';
import { plaqueActionFor, quickLootTake } from '../../items/quickLoot.js';
import { playerBlowFrame } from '../../combat/hostCombat.js';
import { raceActivation } from '../../player/activationRace.js';
import { randomEpitaph } from '../../world/gravestoneLore.js';
import { rayPersonDistance } from '../../talk/townTalk.js';
import { resetTimeScale, timeScale as worldTimeScale } from '../../world/timeScale.js';
import { SEASON } from '../../world/climateSwaps.js';
import { SEATED_EYE_HEIGHT } from '../../player/seatPose.js';
import { setMidScreenText } from '../../ui/midScreenText.js';
import { showPickups } from '../../ui/pickupFeed.js';
import { silverFindAt } from '../../items/silverFinds.js';
import { travelDriveForward } from '../../travel/travelAutopilot.js';
import { tryMobileEnemyActivate } from '../../player/mobileEnemyActivate.js';
import { walkModeOn } from '../../player/walkMode.js';

/** @param {any} shared */
export function createMotorFrame(shared) {
  const {
    _dwBreathState, _dwSwimSound, _fr, _makeEnemiesHostile, _musicLocationType, _talkPersons, built, cam, camps,
    cityGuards, climbFeel, collider, cromwark, csaActivate, csaActivationPick, csaHoldsTimeScale, csaOnTeleport,
    csaRuntime, csaUpdate, drinkAtSpring, droppedLoot, droppedTorches, dwFish, dwFishLootHooks, dwLootTargets,
    dwPlayer, dwPlaying, dwSwimmableSeafloorY, dwSwimMove, dwVanillaGroundY, EOTB_WAGON_PACK, exteriorFoes,
    exteriorSurfaceNow, footsteps, gamepad, gamePaused, gatePool, hcc, hccRuntimeOn, heightAt, hitEffects, inFlight,
    keys, latch, lockOn, magic, makeInventoryWindow, maps, modeNow, modes, moveAxes, navalFrame, navalOn,
    navalRelease, openBodyLoot, openCompanionPack, openRevenantFate, openWildBody, plaquePeerAct, player,
    playerGroundTile, playerTicker, playerTravelPixel, profClickPress, queue, raidFrame, refreshTravelOptionsSettings,
    reachEvents, rideOut, riteHost, saddleHost, seaTest, sigilBroker, snowCover, springTargets, staffFollow, startKey,
    tickQuickHold, timeScaleMult, touch, townTalk, travelControlUI, travelFollowPressed, travelLookahead,
    travelNavFrame, travelViewGovern, tvSeaFrame, tvWalkHoldsTimeScale, upkeep, wagonLoadShare, walkMode, weaponRig,
    worldAddons, worldMoveBusy, yards,
  } = shared;
  function frameMotorPhase(now, dt) {
    const { fwd, right, paralyzed } = _fr;

    const frameMotor = () => {   // PERF-V8: each `// PERF-V8` statement runs as a closure of its own, so the frame stays under V8's optimizing ceiling (bible/07-Rendering/Performance-Priority.md)
    if (shared.poiEditor?.active()) shared.poiEditor.cameraFrame(dt, cam);   // POI-3: the editor open - its eye flies, the body stands held (the closure's one statement still: the walk and the fly-cam its else)
    else if (walkMode) {
      // ROAD-Ar (R0): the season re-skin's hold, released the moment
      // the player's own pixel is BUILT again - the same shape as the
      // boot gate right below, which holds the motor until the start
      // pixel stands. The `!building && !queue.length` arm is the
      // dead-man's release: a pixel that never comes back must not
      // freeze the game for ever, and re-anchoring there is what keeps
      // the outage off the fall ledger. player.spawn IS the re-anchor
      // (fallStart = y, falling cleared) - _teleportToPixel's own tail.
      // FALL-KEPT (FIELD BUGS 2026-09-30): ...and a fall under way when
      // the hold began is put back after it. The held motor moved not at
      // all through the outage, so the whole fall is the player's own.
      // A rebuild in the frames after a load (the roads' network landing
      // at boot, a late region) would otherwise wipe the fall the save
      // carried.
      if (shared._seasonHoldKey !== null && (built.has(shared._seasonHoldKey) || (!shared.building && !queue.length))) {
        const fall = player.fallSnapshot();
        player.spawn(player.pos[0], player.pos[1], player.pos[2]);
        player.restoreFall(fall);
        shared._seasonHoldKey = null;
      }
      // RESPAWN-HELD (FIELD BUGS 2026-09-30b, BrixBlox: "One time I died in a dungeon, and for some reason I respawned
      // high enough in the air to kill me with fall damage"): AN ARRIVAL HOLDS THE MOTOR WHILE ITS DESTINATION BUILDS.
      // _teleportToPixel's straightening latch is up from its first statement until the build resolves (a `finally`),
      // and nothing is awaited between that and its landing's player.spawn - so the latch is exactly the build's frames.
      // They stepped the motor: an outdoor death's screen held it (townTalk's slot outlives the await), but a dungeon's
      // or a building's went with the exit, and the body - stood over the new pixel at the INTERIOR's height - fell
      // through the half-built world onto a model collider or the terrain as each went in, and the frame billed it.
      // The landing re-anchors the fall (player.spawn), so a held body arrives with none.
      const _seasonHeld = shared._partyArrivalPending || shared._seasonHoldKey !== null || shared._seasonStraightening;
      const _rideHeld = !!shared.wagonRiders?.seated();   // WAGONS1: a rider in another's wagon goes where it goes (pinned to their seat each frame, scenes/wagon/wagonRiders.js)
      if (!shared.playerSpawned && built.has(startKey)) {
        // FIX-C: THE FIRST STAND IS DFU'S. StartNewCharacter
        // (StartGameBehaviour.cs:404-409) puts an exterior start through
        // `TeleportToCoordinates` + `SetAutoReposition(RepositionMethods
        // .Origin, Vector3.zero)`, and Update applies it once the terrain
        // stands (StreamingWorld.cs:290-292): `RepositionPlayer(MapPixelX,
        // MapPixelY, Vector3.zero)` - the terrain's ORIGIN corner, at the
        // terrain's sampled height plus the controller's half height and
        // 0.15 (:1330-1349). Not the pixel's centre, which this gate stood
        // on: a location is centred in its pixel (terrainTiles
        // getLocationTerrainTileOrigin), so the centre is the middle of
        // the town, and for many a building. The port's FixStanding is
        // floorLanding from two units up; the corner is the local origin.
        const stand = floorLanding(collider, [0, heightAt(0, 0) + 2, 0]);
        player.spawn(stand[0], stand[1], stand[2]);
        shared.playerSpawned = true;
        dwTeleported(performance.now() / 1000);   // DW-E1: StartNewCharacter's TeleportToCoordinates raises OnTeleportToCoordinates - the grace, and the start area's refresh
        csaOnTeleport();   // CSA-F: and Come Sail Away's waves
      }
      if (shared.rideOutWanted && shared.playerSpawned) rideOut();   // TSR4: after the first stand, whichever of the two came second
      if (shared.seaTestWanted && shared.playerSpawned) seaTest();   // FIELD BUGS 2026-09-29 (the sea) #5: the same gate, a stage a frame
      if (shared.playerSpawned) {
        const jumpHeld = held(keys, 'Jump');
        const swingKey = swingKeyHeld(keys);   // MAC-SWING1: a swing bound to a KEY or pad code has no mousedown - the latch is polled here, and fed to the rig on the change
        if (swingKey !== shared.swingKeyLatch) {
          shared.swingKeyLatch = swingKey;
          if (!swingKey) { weaponRig.attackInput(0, 0, false); navalRelease(); }   // the release is never gated; NAV-H: nor the broadside's
          else if (!townTalk.overlayActive && walkMode && modeNow() === 'exterior' && !shared.gatherHost?.acting() && !magic.interceptAttack(true) && !shared.naval?.attackInput(true)) weaponRig.attackInput(0, 0, true);   // PROF1: an act's press is the act's
        }
        // AUDIT NAV1 (the helm): at the helm the Crouch action is the BRACE (navalFrame) and nothing else - it had toggled
        // the motor's crouch too, under the helm's freeze: a brace left the player crouched (the eye 0.9 m lower, the lay
        // 6 m shorter at 150 m) and the next one stood them up
        const helmBrace = navalOn() && csaRuntime.isSailing();
        const crouchHeld = !helmBrace && held(keys, 'Crouch');   // P12 host parity (audit F4); I2: DFU's default C
        const crouchPress = !helmBrace && pressed(latch.edge, keys, 'Crouch');   // MWCROUCH: GetKeyDown, not a held-ring derivation - the levitate descent below still reads the HELD key
        // TO1: THE JOURNEY'S CLOCK. Travel Options runs an accelerated
        // journey on Unity's `Time.timeScale` (TravelOptionsMod.cs:382-390),
        // which scales EVERYTHING - the calendar, the player, the physics,
        // every animation in the world. The port scales TWO of them, named
        // here and recorded in bible/06-Systems/Travel-Options.md as the
        // slice's one deliberate departure:
        //
        //   - the TRAVELLER: `player.update` takes `dt * travelScale`, and
        //     the motor scales its own fixed step with the same number
        //     (player/motor.js), so a x50 journey is one physics step a
        //     frame covering fifty times the ground rather than fifty steps
        //     - which is exactly what `Time.fixedDeltaTime = timeScale *
        //     baseFixedDeltaTime` buys in the mod's own SetTimeScale.
        //   - the CALENDAR: the player's ticker below, so the days really
        //     pass while the miles do.
        //
        // WHAT IS NOT SCALED, and why it is the better answer here: the
        // encounter pump, the foe pools, the weather front and every
        // animation keep real time. At x50 a scaled encounter pump would
        // roll fifty times the ambushes a real second, and the terrain
        // build queue would be asked for fifty pixels in the time it can
        // raise one - the mod's own readme warns about exactly that
        // ("raising this can cause players to fall off the terrain and into
        // the void"). The journey the player sees is the same: the ground
        // goes past at the acceleration, the clock keeps up with it, and
        // what interrupts a journey interrupts it on its own honest clock.
        tvSeaFrame(dt);   // OWS2: the crossing - a launch, the helm, a landfall - before the mod's own stops see the frame
        raidFrame(dt);   // OWS3: Warm Ashes' raiders - a sail sighted under the view gives chase; alongside, the mod's raid
        travelViewGovern(dt);   // TV2: under the travel view the clock runs no faster than the land loads
        const travelScale = worldTimeScale();
        const _overlayHeld = shared.staffTeleportHeld || shared._partyArrivalPending || (modes?.dungeonCtx?.uiOverlayActive ?? false) || townTalk.overlayActive;   // chargen/windows/talk hold the motor - typing must not walk the player
        // TO1: THE MOD'S OWN FRAME - TravelOptionsMod.Update, in its
        // own order, given what this host knows this frame. It answers
        // the autopilot's drive for the motor below, and everything
        // else it does (stopping for a foe, for the sea, for a town, a
        // path leg arriving, the junction map's upkeep) it does itself.
        shared._travelDrive = null;
        if (shared.travelOptions) {
          const followDown = travelFollowPressed();
          travelNavFrame.dt = dt;   // TRAVEL-NAV1: the frame the steering's reach is measured over
          refreshTravelOptionsSettings();   // TO-LIVE: a dial turned mid-journey reaches it
          const report = shared.travelOptions.update({
            topWindowIsTravelUI: !!travelControlUI?.isShowing && !townTalk.overlayActive,
            topWindowAllowsTravel: townTalk.overlay === shared._travelMap,   // the mod's `DfTravelMapWindow` exception (:1351)
            // AUDIT-TO1 A1: GameManager.IsPlayerOnHUD is "the HUD is the top
            // window" (IsHUDTopWindow), and in DFU the travel panel IS a
            // pushed window (InitTravelUI -> PushWindow, :533), so the
            // property is FALSE for the whole of a journey and the :1040
            // arm fires only when another window really is on top. The
            // port's panel is a HUD readout, deliberately not an overlay -
            // so this read `!overlayActive`, which is exactly `!gamePaused()`
            // one line below, and the two guards partitioned every frame:
            // every accelerated journey interrupted itself on its first
            // unpaused frame and the mod's whole Update past that line was
            // dead. The panel standing in for DFU's pushed window is the term.
            isPlayerOnHUD: !townTalk.overlayActive && !(modes?.overlayHeld ?? false) && !travelControlUI?.isShowing,
            gamePaused: gamePaused(),
            inputPaused: _overlayHeld,
            followKeyDown: followDown,
            helpKeyDown: false,   // H over the travel UI is routed by the key ladder, not polled
            isPlayerInside: (modes?.mode ?? 'exterior') !== 'exterior',
          });
          shared._travelDrive = report?.drive?.arrived === false ? report.drive : null;
          if (report?.stopped) shared._walkStopWhy = report.stopped;   // AUDIT OW4 P4: a journey that cannot run as I am (systems/party/partyWalk.js WALK_BALKS) is not the party's to set out again
          if (!travelControlUI?.isShowing && worldTimeScale() !== 1 && !csaHoldsTimeScale() && !tvWalkHoldsTimeScale()) resetTimeScale();   // the panel gone is the journey over (CSA-G: the helm's scale is no journey's; TV-WASD: nor the keys')
        }
      // AUDIT 18 F9: the player's world clock, HELD by the same gate.
      // It ran only inside a dungeon before F8 moved it here; F8 then
      // ran it unconditionally, which is the U7 bug shape inverted -
      // DFU stops the clock outright under a paused window. PauseGame
      // (GameManager.cs:600-610) sets Time.timeScale = 0, and
      // WorldTime.Update (:60-69) advances the calendar by
      // `Time.deltaTime * TimeScale`, so a PauseWhileOpen window
      // freezes game time entirely: no magic round, no disease day, no
      // fatigue, no skill advancement. Open the char sheet and the
      // motor already held here - the clock did not, so a disease
      // aged while the game was paused.
      // FIELD BUGS 29h (WALK-CLOCK; ThetaDecay: "I tried traveling back and forth between towns, which took 32 total days.
      // I met all the reqs for a guild rank bump and wasn't able to get one"; Mac: "Dont worry abour DFU"): ONLINE A
      // JOURNEY'S HOURS ARE THE TRAVELLER'S. The shared clock is the world's and moves for nobody (WORLD5), and the tick
      // reads it alone online - so an accelerated walk (Travel Options', the Overworld's) charged the character's own
      // clock its REAL minutes: 32 days on the map, hours lived, and a guild's 28 days, an infection's turn and every
      // need stood still behind it. Its minutes past the world's are raised on the character's own clock now, as a
      // rest's are (AUDIT LIVED1 For Mac 2, AUDIT LIVED1b For Mac 5); offline the scaled dt charges the one calendar.
      const walkRaise = sharedClockOn() && travelScale > 1 ? dt * CLASSIC_MINUTES_PER_SECOND * (travelScale - 1) : 0;
      if (!_overlayHeld) playerTicker.tick(dt * timeScaleMult * travelScale, {   // TO1: ...and the calendar keeps up with the miles
        running: player.isRunning && !player.standing && upkeep.riderPaysGallop(player.transportMode),   // AUDIT 23 (entity-2): PlayerEntity.cs:408; STEED1: a gallop is the horse's breath, not the rider's fatigue
        standing: !!player.standing,   // FATIGUE-IDLE: standing still on the ground pays no minute's band (worldTick.js)
        // AUDIT 64 F7 - PlayerEntity.cs:311, the TALLY's own gate:
        // `playerMotor.IsRunning && !playerMotor.IsRiding`, with NO
        // standing test. The fatigue arm at :408 is the one that
        // reads !IsStandingStill; the port drove both off one flag,
        // so the Running skill did not advance while the run key was
        // held standing still.
        runningTally: player.isRunning && !player.riding,
        swimming: player.isPlayerSwimming,   // XL-1: PlayerEntity.cs:410 reads PlayerEnterExit.IsPlayerSwimming - the flag the surface model below writes
        climbing: !!player.climb?.isClimbing,   // AUDIT 26 F083: the band's first arm (:405-408)
        jumped: player.jumped,   // C6: the per-jump drain+tally ride the tick
        parkoured: player.parkoured,   // CLIMB1: a mantle or a vault's, beside the jump's
        odometer: player.odometer,   // MOVE-REAL: the ground the body covered - the movement skills past 100 count it
      }, dt * timeScaleMult * travelScale, walkRaise);   // WALK-CLOCK: the real seconds as ever (the scaled dt, the default), and the walk's minutes past the world's
        // AUDIT 18 HOST GAP: levitate/waterWalking/slowFall were
        // written ONLY inside the dungeon branch of worldModes and
        // never cleared, so leaving a dungeon while levitating
        // stranded the player in the motor's no-gravity branch
        // forever. The EFFECT owns the flag (Levitate.cs:131/:136),
        // so it is recomputed per frame in every host; swimming is
        // false outdoors (no blockWaterLevel - PlayerEnterExit) until
        // the surface model below re-derives it (OT1).
        // DW-D: OutdoorSwimDriver.Update, ahead of the motor as its execution order puts it - the carved sea's swim
        // decision, and its forge ridden on the ONE motor flag write below (a clear and a forge after it would change
        // LevitateMotor.IsSwimming twice a frame, and each change cancels a step). A boat's live effect bundle
        // suppresses it (IsPlayerOnBoat), and so does any subscriber (systems/deepWater/deepWaterPlayer.js). The forward axis is
        // last frame's - InputManager.Update against the driver's Update is DFU's own script-order toss (AUDIT 64 F3).
        const _dwForge = dwPlayer && shared.playerSpawned ? dwPlayer.beforeMove({
          now: now / 1000, player, cameraY: cam.pos[1], yaw: cam.yaw, pitch: cam.pitch,
          descend: crouchHeld || held(keys, 'FloatDown'), ascend: jumpHeld || held(keys, 'FloatUp'),
          onBoat: (playerEntity.activeEffects ?? []).some((e) => isBoatEffectBundle(e?.bundleName)), loadGrace: loadGraceActive(performance.now() / 1000), input: { forward: shared._dwLastForward },
          frameDelta: dt * worldTimeScale(),   // Time.deltaTime: the frame's clamped seconds (the mod's own 0.1 s maximumDeltaTime) x Time.timeScale
        }) : null;
        // Peer water boarding: Deep Waters may restore dry flags before the motor runs. Keep that result;
        // a latch captured before its restore resurrected swimming over tile 0 and dropped the passenger after grace.
        const _wasSwimming = !!player.isPlayerSwimming;   // OT1: still before applyMotorEffectFlags' per-frame clear
        applyMotorEffectFlags(player, playerEntity, _dwForge ?? undefined);
        // DW-D: the forge holds PlayerEnterExit's dungeon arm open for the frame, and the arm's afloat line with it
        if (_dwForge) { const afloat = afloatMessageStep(player, player.waterWalking); if (afloat) townTalk.say(afloat, CANNOT_FLOAT_HUD_SECONDS); }
        const mv = moveHeld(keys);
        mv.analog = touch?.axes() ?? gamepad?.axes() ?? null;   // TI2: the stick's throw, when the layer has one - MoveAxes' joystick arm takes it over the key impulse; GP1: the pad's stick when no finger
        if (yards?.flying()) mv.analog = null;   // HOME-YARD: the stick flies the decorator's eye - the body stands
        // AUDIT 28 W8: the axes advance only on frames the motor runs (a
        // held overlay is DFU's timeScale 0 - no climb, no friction).
        // AUDIT 64 F3: InputManager.cs:542-545 - `if (ToggleAutorun)
        // ApplyVerticalForce(1);` runs in Update ahead of
        // FindKeyboardActions, so the latch drives the vertical axis
        // forward with no key held. The latch itself lives in the motor
        // (PlayerSpeedChanger's half), so this reads last step's value -
        // DFU's own script-order indeterminacy between InputManager.Update
        // and PlayerMotor.Update.
        if (!_overlayHeld) autorunCancel(mv, player);   // BUNNYFALL: a fresh W press drops the autorun latch
        const axes = _overlayHeld ? { forward: moveAxes.vertical, strafe: moveAxes.horizontal } : moveAxes.update(dt, { ...mv, autorun: player.toggleAutorun });
        // TO1: THE AUTOPILOT DRIVES. Its Update answers two numbers -
        // the yaw the body should face and the forward force - and the
        // mod applies them straight to the player controller
        // (PlayerAutoPilot.cs:96-104: `mouseLook.Yaw = yawVector.y` and
        // `InputManager.ApplyVerticalForce(travelSpeedMultiplier)`).
        // Here that is `cam.yaw` and the forward AXIS, which is the
        // same two things by the port's own names. The player's own
        // keys are overridden for the frame, exactly as the mod
        // overrides them: a journey is not steerable by hand, it is
        // stopped (the camp button, the exit button, the follow key).
        // `axes` is a fresh literal every frame (MoveAxes.update returns
        // one), so writing the autopilot's force into it overrides the
        // player's own for this frame and nothing else - which is what
        // ApplyVerticalForce does to InputManager's axis.
        if (shared._travelDrive) {
          cam.yaw = (shared._travelDrive.yaw * Math.PI) / 180;
          cam.pitch = shared._travelDrive.pitch ?? 0;
          // TO-FIELD (2026-09-18, Mac: "Using travel options spawns you
          // under the maps"): THE WALK WAITS FOR THE GROUND. An
          // accelerated journey is the one player-moving path in this
          // host with no readiness gate - the boot stand has one
          // (playerSpawned && built.has), the ride-out has one (TSR4a,
          // "it just spawns me straight into the ground"), the season
          // re-skin holds the motor, and a teleport awaits its pixel.
          // This one drove the motor at up to sixty times walking pace
          // across a streamer that builds ONE pixel per call, and
          // `heightAt` answers -Infinity over a pixel that is not built
          // yet - which the collider's ground clamp can never catch. So
          // the player walked off the built world and fell.
          //
          // The wait is the ride-out's own sentence: hold while the
          // ground is missing AND the streamer is still bringing it. If
          // nothing is queued the ground is not coming and holding for
          // ever would be its own bug, so the drive goes through.
          // AUDIT-FIELD F9: `walkMode && playerSpawned`, this file's own
          // idiom at :1876, :2430, :2840 and a dozen more - under ?fly
          // the gate was probing the camera while the motor moved the
          // player, so it guarded a position nobody was standing on.
          const _feet = walkMode && shared.playerSpawned ? player.pos : cam.pos;
          axes.forward = travelDriveForward({
            feet: _feet, yaw: cam.yaw, heightAt,
            lookahead: travelLookahead(dt, travelScale),
            streaming: !!(shared.building || queue.length || inFlight.size),
            forward: shared._travelDrive.forward,
          });
          // AUDIT-TO1 K2: and NOT the strafe. ApplyVerticalForce writes the
          // vertical axis alone (PlayerAutoPilot.cs:104) and the panel's
          // `pauseWhileOpened = false` keeps InputManager collecting the
          // strafe key, so DFU sidesteps a held strafe at walk speed with
          // limitDiagonalSpeed cutting the forward share - the port
          // zeroed it and ran 41% faster along the bearing while it was held.
        }
        // OW-FACE (FIELD BUGS 2026-10-01 #10): under the Overworld the keys move the body the way they point from the VIEW
        // (TV1's camera-relative law, unchanged) and the body FACES that way - travelView.steer turns it to the keys'
        // heading, and here the keys' vector is turned onto the body, so the walk is the keys' way while it turns and
        // straight ahead once it has (the sprite's eight views and the Morrowind body's walk follow the heading)
        if (shared.travelView?.active && shared.travelView.camera && !shared._travelDrive && !_overlayHeld && !shared.travelOptions?.state?.autopilot && (axes.forward || axes.strafe)) {
          const turned = axesToward(cam.yaw, keysHeading(shared.travelView.camera.yaw, axes.forward, axes.strafe), axes.forward, axes.strafe);
          axes.forward = turned.forward; axes.strafe = turned.strafe;
        }
        // TV-WASD: THE KEYS' TRAVEL WAITS FOR THE GROUND as a journey's walk does (TO-FIELD's sentence), looking the way
        // the keys move the body - its heading turned by the axes (the motor's right is (cos, 0, -sin))
        if (shared.tvWalking && !shared._travelDrive && (axes.forward || axes.strafe)) {
          const _feet = walkMode && shared.playerSpawned ? player.pos : cam.pos;
          const way = cam.yaw + Math.atan2(axes.strafe, axes.forward);
          if (travelDriveForward({ feet: _feet, yaw: way, heightAt, lookahead: travelLookahead(dt, travelScale), streaming: !!(shared.building || queue.length || inFlight.size), forward: 1 }) === 0) { axes.forward = 0; axes.strafe = 0; }
          shared._tvWalkYaw = way;   // OW6: the way the keys go, for the enemies' cap (travelViewGovern reads it next frame)
        }
        // Audit F3: the crouch toggle stays LIVE while paralyzed - DFU
        // gates movement and the jump only (DecideHeightAction has no check).
        // AUDIT 39r: and so does the SPEED-ADJUSTMENT capture. DFU zeroes the
        // movement VECTOR (FrictionMotor :75-81, AcrobatMotor :135-141);
        // CaptureInputSpeedAdjustment runs in Update behind a levitate gate
        // and nothing else. Dropping run/sneak/autoRun/back from this bag read
        // as a RELEASE to the motor's press-edge latches, so a key held
        // through the paralysis fired a synthetic press on the frame it lifted.
        // ROAD-Ar (R0): ...and the season hold stops the motor dead,
        // because there is no floor under it while the re-skin runs.
        shared._dwLastForward = paralyzed ? 0 : axes.forward;   // DW-D: the shore exit's InputManager.Vertical, for the next frame's driver
        shared._csaAxes = { h: axes.strafe, v: axes.forward };   // CSA-D: InputManager.Horizontal / Vertical for the helm's inputTarget - CSA-J (the audit): InputManager has no paralysis gate, only the motors do
        player.rideSpeedScale = upkeep.rideScale(player.transportMode, wagonLoadShare());   // STEED1/WAGONS4: the horse's Speed, the wagon's soundness and its team's Strength
        playerBlowFrame({ motor: player, entity: playerEntity, shake: (k) => betterAmbience.weaponKick(k), hurt: (n) => { hurtPlayer(playerEntity, n); flashPlayerDamage(n); surfacePlayer(); } });   // TELL6e: a landing's push, rattle, knockdown and bleed
        if (_overlayHeld || _seasonHeld || _rideHeld) player.holdFrame();   // DISC8-G: a held motor reports no landing and no jump
        if (!_overlayHeld && !_seasonHeld && !_rideHeld) player.update(dt, paralyzed ? { forward: 0, strafe: 0, run: held(keys, 'Run'), autoRun: held(keys, 'AutoRun'), back: mv.backwards, sneak: held(keys, 'Sneak') || walkModeOn(), jump: false, up: false, down: false, crouch: crouchPress } : {
          forward: axes.forward,   // TO1: the autopilot's force while a journey runs, else the player's own   // AUDIT 28 W8: InputManager's axes - accelerated under MovementAcceleration, the held difference without
          strafe: axes.strafe,
          run: held(keys, 'Run'),
          // AUDIT 39: PlayerSpeedChanger's AutoRun latch (:82-99) - the
          // press flips ToggleRun; MoveBackwards is its cancel key.
          autoRun: held(keys, 'AutoRun'),
          back: mv.backwards,
          sneak: held(keys, 'Sneak') || walkModeOn(),   // P15: DFU's default Sneak binding (LeftAlt), held
          jump: jumpHeld,   // P14: HELD, verbatim (the 0.1 s grounded gate owns re-fire)
          // LevitateMotor.Update (:71-91) reads Jump/FloatUp for up and
          // Crouch/FloatDown for down, and moves along the camera LOOK
          // (pitch included) - everywhere, not just underground.
          up: jumpHeld || held(keys, 'FloatUp'),
          // AUDIT 26 F031: LevitateMotor's descent arm is Crouch OR
          // FloatDown (:88-89), the mirror of the rise arm above; the
          // port's own motor contract said so and every host passed
          // FloatDown alone, so C did nothing but toggle the stance.
          down: crouchHeld || held(keys, 'FloatDown'),
          crouch: crouchPress,
        }, cam.yaw, cam.pitch);
        worldAddons.run('postMotor');
        // TRAVEL-NAV1: the travel the motor was really asked for this frame - after the ground gate, and
        // nothing on a held or paralysed frame - which the steering's grinding check weighs next frame.
        travelNavFrame.asked = shared._travelDrive && !_overlayHeld && !_seasonHeld && !paralyzed
          ? axes.forward * player.speed * worldTimeScale() * Math.min(dt, MAX_FRAME_DT) : 0;
        // TRAVEL-STRAFE: and the strafe it was given - a sidestep the steering keeps rather than pursues back
        travelNavFrame.strafe = shared._travelDrive && !_overlayHeld && !_seasonHeld && !paralyzed ? axes.strafe : 0;
        lateSolidsOf(collider)?.settle(() => (walkMode && shared.playerSpawned && !worldMoveBusy() ? player : null));   // ROCK-CLEAR: the world's late solids clear of the body stand - its body none while a jump's landing builds (the landing's own law reads that pixel whole)
        // C9: ReadyWeapon (Z) - the sheathe toggle, host parity.
        if (pressed(latch.edge, keys, 'ReadyWeapon')) weaponRig.readyWeapon();   // MAC-O1: the KEY takes WeaponManager.Update's arm (:229-269), not HUDLarge's raw ToggleSheath
        // a12: SwitchHand (H) - WeaponManager.cs:272 reads it through
        // ActionComplete, the RELEASE edge, so it reads the UP ring
        // where Z reads the down one. The rig owns the isAttacking gate.
        if (released(latch.edge, keys, 'SwitchHand')) weaponRig.switchHand();
        tickQuickHold(dt);   // QS6: the quickslot holds, beside the two latches they are modelled on
        // P14 fall damage (host parity - CheckFallingDamage +
        // PlayerHealth verbatim; sounds 91/92). FD1 took the
        // outdoor-water exemption off the board: playerGroundTile is
        // FS1's probe and isOutdoorWaterTile is DFU's
        // PlayerTileMapIndex == 0, so a landing in a lake now costs
        // neither HP nor the hard-fall grunt. A null tile - the
        // player over a pixel still streaming - is DFU's -1 and takes
        // the damage, which is the safe direction: a missed exemption
        // costs HP, an over-eager one makes every fall free. Death at
        // 0 rides the shared entity; the exterior death screen pends
        // with the world-mode UI arc.
        // ROAD-Ar (R0): a held motor reports no landing - landedFallDistance
        // is only cleared by update(), so billing it on a frame the motor
        // never ran would charge the same fall once per held frame.
        // DISC8-G: the season gate alone missed the pausing windows (the
        // death screen above all); holdFrame() above now clears the report
        // on EVERY held frame, whatever held it.
        if (!_seasonHeld) applyFallLanding(playerEntity, player.landedFallDistance, {
          sound: immersiveFootsteps.fallSoundSink((id, vol) => audio.playOneShot(id, vol)),   // AUDIT 58: the caller's FootstepVolumeScale rides through; IF1: the mod's own landing when it owns the stride
          inOutdoorWater: isOutdoorWaterTile(playerGroundTile()),
        });
        // ROAD-B (b3): the exterior surface model, recomputed every
        // frame exactly where PlayerMotor.Update recomputes it
        // (:367-369) and BEFORE the consumers below read it.
        const _surf = exteriorSurfaceNow();
        shared._surfPath = !!_surf.path;
        // STEED1/WAGONS4: the frame's upkeep - a gallop on the horse's breath, the wagon worn by the metres it rolled (the
        // odometer's: a placement, a carry and an origin shift never counted), on the road or off it
        {
          const odo = player.odometer?.h ?? 0, metres = shared._upkeepOdo == null ? 0 : Math.max(0, odo - shared._upkeepOdo);
          shared._upkeepOdo = odo;
          const mode = player.transportMode;
          const galloping = !_overlayHeld && mode === TRANSPORT_MODES.Horse && !!player.isRunning && !player.standing;
          upkeep.tick(gamePaused() ? 0 : dt, {
            mode, galloping, moving: !player.standing,
            metres, road: shared._surfPath, load: wagonLoadShare(),
            wagonGoes: mode === TRANSPORT_MODES.Cart || !!hccRuntimeOn()?.view?.()?.teamFollowing,
          });
          saddleHost.motion(gamePaused() ? 0 : dt, metres, galloping, player.rideWalking);   // STEED-UI: the saddle panel's pace and gait; HORSE-TIERS: the walk the motor took
        }
        // PlayerHeightChanger reads `OnExteriorWater == Swimming` and
        // only that (:127, :294, :326, :550) - WaterWalking never sinks
        // the capsule. A6 declared the flag and left it false with
        // "Wave B's exterior-water slice owns the model that raises
        // it"; this is that raise.
        player.onExteriorWater = _surf.water === ON_EXTERIOR_WATER.Swimming;
        player.onExteriorWaterMethod = _surf.water;   // FORAGE2: all three values - Foraging's net reads WaterWalking (a shallow shore tile) too
        // OT1 (AUDIT 64 F0's residue): PlayerEnterExit.IsPlayerSwimming above ground - the sink/unsink
        // edge (DoUnsinking's write is the motor's 'unsink' heightAction) and the tile-0 clearing rule,
        // one helper. Before this the flag was the clear alone: a sea swim never suppressed the encounter
        // roll (:488-491) or refused a rest (355), and a dungeon exit onto open water lost the carry.
        player.isPlayerSwimming = exteriorSwimming({ wasSwimming: _wasSwimming, sunk: !!player.sunk, unsunk: player.heightAction === 'unsink', tileIndex: _surf.tileIndex });
        // DW-D: the forged flags over the tile model's, the ascent clamp, the shore exit, the stroke - and the breath,
        // the dungeon's law on the head-under test (PlayerEntity reads IsPlayerSubmerged, which the mod forges)
        if (dwPlayer && shared.playerSpawned) {
          const _dwUp = jumpHeld || held(keys, 'FloatUp'), _dwDown = crouchHeld || held(keys, 'FloatDown');
          const _dwNowPlaying = dwPlaying();   // GameManager.IsPlayingGame: no pausing window up
          // AUDIT DW-F: the mod's execution order (the DLL's DefaultExecutionOrder attributes) - OutdoorSwimMovementController
          // at 0 beside the motor, the driver's after phase at 32000, UnderwaterPresentationEffects at 32001 - and each reads
          // the camera as this frame's move left it (the camera rides the player's transform): the motor's own eye
          // OutdoorSwimMovementController: the multiplier, the stroke, the floor - on the carved sea (IsOutdoorSwimming) or
          // any water the motor swims (IsAnySwimming), never a water walker's, never in the load grace, and neither while the
          // game is not playing (both ask IsPlayingGame: a window up resets the stroke and lifts the multiplier)
          const _dwOutdoor = _dwNowPlaying && !player.waterWalking && ((dwPlayer.waterMethod ?? _surf.water) === ON_EXTERIOR_WATER.Swimming || !!player.isPlayerSwimming || dwPlayer.swim.presentationUnderwater(dwPlayer.seaY(), player.eye[1], player.pos[1] + player.height / 2));
          dwSwimMove.update({
            now: now / 1000, dt, player, entity: playerEntity, loadGrace: loadGraceActive(performance.now() / 1000, _dwNowPlaying),
            outdoorSwimming: _dwOutdoor, anySwimming: _dwOutdoor || (_dwNowPlaying && !player.waterWalking && !!player.swimming),
            input: { forward: paralyzed ? 0 : axes.forward, strafe: paralyzed ? 0 : axes.strafe, up: _dwUp, down: _dwDown, run: held(keys, 'Run') },
            yaw: cam.yaw, pitch: cam.pitch, lookDir: fwd, cameraY: player.eye[1], oceanY: dwPlayer.seaY(),
            seafloorY: dwSwimmableSeafloorY, vanillaGroundY: dwVanillaGroundY,
          });
          dwPlayer.afterMove({ now: now / 1000, player, cameraY: player.eye[1], descend: _dwDown, ascend: _dwUp, onBoat: (playerEntity.activeEffects ?? []).some((e) => isBoatEffectBundle(e?.bundleName)) });
          dwFlushStateChange();   // OutdoorSwimDriverAfter: PostPhaseRestore, then FlushStateChange
          // PlayerEntity.FixedUpdate's breath - AUDIT DW-F: a pausing window's Time.timeScale 0 runs no FixedUpdate, so none
          // drains behind one (the dungeon's breathTick holds under its overlay the same way). SEA-RISE (main, the same law
          // from the field): under an open pack the sea drowned a player dropping the loot that sank them.
          if (!_overlayHeld) shared._dwBreathTimer += dt;
          while (shared._dwBreathTimer >= CLASSIC_UPDATE_INTERVAL) {
            shared._dwBreathTimer -= CLASSIC_UPDATE_INTERVAL;
            if (breathStep(playerEntity, dwPlayer.submerged, _dwBreathState) === 'drowned') hurtPlayer(playerEntity, playerEntity.health, { bypassShield: true });   // SetHealth(0): drowned
          }
          // UnderwaterPresentationEffects: the listener's low-pass while the presentation is under the sea
          // (UpdateAudioFilter - the swimmer's own IsPresentationUnderwater), and the swim's splash every 2.5 m a
          // swimmer travels, never a water walker (UpdateSwimSfx - the player object, the capsule's centre); both
          // only while the game is playing (UpdateAudioFilter and UpdateSwimSfxAndWeather ask IsPlayingGame first)
          const _dwCentre = centreFromFeet(player.pos, player.height);
          audio.setListenerLowPass(_dwNowPlaying && dwPlayer.swim.presentationUnderwater(dwPlayer.seaY(), player.eye[1], _dwCentre[1]) ? UNDERWATER_CUTOFF_HZ : 0);
          if (_dwNowPlaying && player.isPlayerSwimming && !player.waterWalking) { if (_dwSwimSound.step(_dwCentre)) audio.playOneShot(SWIM_SOUND_CLIP, SWIM_SOUND_VOLUME); }
          else _dwSwimSound.reset();
        }   // XL-1: PlayerEnterExit.isPlayerSwimming, NOT levitateMotor.IsSwimming - :421 clears the motor's flag outdoors with no tile test and applyMotorEffectFlags above IS that clear, so writing this into `player.swimming` armed PlayerMotor.CancelMovement on both edges of every frame and the fixed step spent it: the exterior swimmer travelled 0 at 60 Hz
        // FS-slice: PlayerFootsteps - the exterior stride (snow by
        // season + CLIMATE.PAK; the path/water/static-geometry arms
        // ride the surface model above).
        {
          const _p = playerTravelPixel();
          // PlayerFootsteps.cs:116 - "Play splash footsteps whether
          // player is walking on or swimming in exterior water", so
          // BOTH non-None methods feed this one boolean.
          // DW-D: the value PlayerFootsteps' FixedUpdate reads is the one the sea's forge left after the motor
          // (OutdoorSwimDriverAfter re-applies it), PlayerMotor.Update's own only on a frame the driver wrote none
          const _onWater = (dwPlayer?.waterMethod ?? _surf.water) !== ON_EXTERIOR_WATER.None;
          shared._rippleOnWater = _onWater;   // WATER-NEXT 4: the ripple field's stir reads the same answer
          // AUDIT-TO1 J1: `PlayerFootsteps.enabled = false` for the journey
          // (:1225) - the component does not RUN, which is what a disabled
          // MonoBehaviour is; the one-gate line below stays the hosts' literal.
          const _step = shared._travelSoundsOff || shared._csaFootstepsOff ? null : footsteps.update(player.pos, {   // CSA-D: at the helm PlayerFootsteps is disabled too
            grounded: player.grounded, swimming: player.swimming, levitating: player.levitating,
            spriteStep: mwViewFootstep(),   // AUDIT-EOTB2: SyncFootsteps - the sprite's stride while it is on screen
            // AUDIT 64 F3 (review): PlayerFootsteps gates on
            // `playerMotor.IsStandingStill` (PlayerFootsteps.cs:264-265), which
            // is `Vector2(moveDirection.x, moveDirection.z).magnitude == 0`
            // inside `if (grounded)` (PlayerMotor.cs:113-125) - NOT a HasAction
            // read. Under AutoRun, InputManager.cs:542-545's ApplyVerticalForce
            // writes a non-zero moveDirection with no move key down, so DFU
            // plays the stride; `!anyMove(keys)` silenced it. `player.standing`
            // IS that getter (grounded && no forward/strafe axis), so it also
            // keeps the paralysed player silent - the hosts zero both axes.
            standingStill: player.standing,
            halfSpeed: player.movingLessThanHalfSpeed,
            // :221-227 - a mount silences the stride UNLESS the player
            // is in exterior water, which is the one arm that needs
            // the method rather than the boolean.
            onFoot: isOnFoot(player.transportMode),
            onExteriorWater: _onWater,
          }, pickFootstepSet({
            inside: false,
            winter: snowCover.winterAt(player.pos, shared.season === SEASON.Winter),   // PRECIP4: the snow under the feet, on the snow lane
            climateIndex: maps.getClimateIndex(_p.x, _p.y),
            onExteriorWater: _onWater,
            // PlayerMotor.OnPathTile (:568-574) is tile records 46, 47
            // and 55 - real terrain data, read through the same
            // tilemap byte the water arm reads. The old note here
            // ("the road system it was wired to is gone") was about a
            // separate roads mod; the CLASSIC path tiles were always
            // in the tilemap and are what DFU actually consults.
            onExteriorPath: _surf.path,
            onStaticGeometry: _surf.staticGeometry,
          }));
          // PEER-FS1: the SAME ctx, cached as a kind for the pose composer -
          // see _lastFootstepKind's own header, above `footsteps`'s declaration.
          shared._lastFootstepKind = pickFootstepKind({
            inside: false, winter: snowCover.winterAt(player.pos, shared.season === SEASON.Winter), climateIndex: maps.getClimateIndex(_p.x, _p.y),
            onExteriorWater: _onWater, onExteriorPath: _surf.path, onStaticGeometry: _surf.staticGeometry,
          });
          if (_step) hitEffects?.footfall?.(player.pos, [Math.sin(cam.yaw), 0, Math.cos(cam.yaw)]);   // BLOOD2d: a foot came down - treading in blood tracks it
          if (_step && classicFootstepAllowed(_step.clip)) audio.playOneShot(_step.clip, _step.volume);   // IF1: DisableVanillaFootsteps - every classic clip is None while the mod owns the stride; BA1: Better Ambience nulls all but Dungeon2 and Outside2 (DisableBuiltInFootsteps' slip)   // IF1: DisableVanillaFootsteps - every classic clip is None while the mod owns the stride; BA1: Better Ambience nulls all but Dungeon2 and Outside2 (DisableBuiltInFootsteps' slip)
          // IF1: ImmersiveFootstepsObject.FixedUpdate - the exterior arm reads the season, the climate and the tile the classic set above reads.
          immersiveFootsteps.update(dt, {
            paused: _overlayHeld || _seasonHeld || shared._travelSoundsOff || shared._csaFootstepsOff, entity: playerEntity,   // AUDIT-TO1 J1: the mod's stride stands down with the classic one - SHIP-DECK: at the helm too (CSA-D's)
            grounded: player.grounded, standingStill: player.standing, isRunning: player.isRunning, movingLessThanHalfSpeed: player.movingLessThanHalfSpeed,
            transportMode: player.transportMode, swimming: !!player.isPlayerSwimming, pos: player.pos,
            inside: false, inDungeon: false,
            season: snowCover.footSeason(player.pos, shared.season), climateIndex: maps.getClimateIndex(_p.x, _p.y), tileMapIndex: _surf.tileIndex ?? -1,   // AUDIT-IF F2: StreamingWorld.PlayerTileMapIndex is -1 off terrain, and (byte)-1 sits in no table - never 0, which is water
            waterWalking: _surf.water === ON_EXTERIOR_WATER.WaterWalking,
            deck: !!_surf.deck, onStaticGeometry: !!_surf.staticGeometry,   // SHIP-DECK: the floor under the feet decides before the tile under it
          });
          // BA1: BetterFootstepsComponentPlayer.Update, CameraShaker.Update, ReverbMod.Update and the rain source's Update, one call.
          betterAmbience.frame(dt, {
            entity: playerEntity, inside: false, inBuilding: false, inDungeon: false,
            grounded: player.grounded, standingStill: player.standing, isRunning: player.isRunning, movingLessThanHalfSpeed: player.movingLessThanHalfSpeed,
            levitating: player.levitating, swimming: !!player.isPlayerSwimming, motorSwimming: !!player.swimming, pos: player.pos, centreY: player.pos[1] + player.height / 2,
            waterSurfaceY: null, onExteriorWater: _onWater, onExteriorWaterAny: _onWater, onExteriorPath: !!_surf.path, onStaticGeometry: !!_surf.staticGeometry, onFoot: isOnFoot(player.transportMode),
            winter: snowCover.winterAt(player.pos, shared.season === SEASON.Winter), climateIndex: maps.getClimateIndex(_p.x, _p.y), loadInProgress: false, paused: _overlayHeld || _seasonHeld,   // AUDIT-BA F2/F3: the reposition rides rebase(); a held frame is a paused one
          });
        }
        csaUpdate(dt);   // CSA-D: Come Sail Away's Update and LateUpdate after the motor - the helm's pin and the boat's move carry the body before the eye is taken from it
        // EV1: the interpolated render eye. AUDIT EV F-SIM5: rays and
        // the audio listener read cam.pos too - DELIBERATE (a pick
        // hits what is on screen; divergence from player.eye is under
        // one physics step). `eye` stays the simulation's truth.
        cam.pos = player.eyeAt();
        navalFrame(dt);   // NAV-H: the sea fight - after the helm moved the boat and the eye was taken, before the pool walks the hulls it posed
        // DC1: PlayerDeath.Update's camera sink - while the death
        // overlay runs, the eye rides down the sequence's drop (the
        // fresh array from player.eye makes this per-frame, never
        // cumulative). The player does not move; only the camera dies.
        if (townTalk.overlay instanceof DeathScreen) cam.pos[1] -= townTalk.overlay.drop;
        if (townTalk.overlay instanceof DeathScreen) townTalk.overlay.tiltView(cam);   // DEATH3: the enhanced fall looks up at the sky
        if (shared._driverSeat && player.transportMode === TRANSPORT_MODES.Cart && !(townTalk.overlay instanceof DeathScreen)) cam.pos = [shared._driverSeat.feet[0], shared._driverSeat.feet[1] + SEATED_EYE_HEIGHT, shared._driverSeat.feet[2]];   // WAGONS3: on my bench (last frame's seat until the wagon steps) - the picks below aim from the eye on the screen
        staffFollow.eye(player, cam);   // STAFF-PANEL5-FOLLOW: a follow's camera - the target's eyes and their facing
        climbFeel.frame(dt, _overlayHeld || _seasonHeld);   // CLIMB4: the climb's camera, off the frame's motor - AUDIT CLIMB-ARC F2/F4: held while the motor is
        // A8 - POINTER PARITY, THE FLAG AT THIS LINE RETIRED. Mouse0 is
        // DFU's ActivateCenterObject: the readied spell fires on its
        // PRESS (EntityEffectManager.cs:250) and the world activation
        // runs on its RELEASE (PlayerActivate.cs:279), with a readied
        // non-touch spell blocking the activation outright. The whole
        // of that law - castPending included - is in
        // systems/activateGate.js so all four hosts read one copy.
        // The port's E stays live BESIDE it (DFU binds E to
        // AbortSpell; a recorded departure, not a gap this slice closes).
        // ROAD-Ar: the gate's last three inputs, which A8 declared and
        // no host passed. `paused` is InputManager's own return under
        // an open window (:486-503, "GUI actions do not fall-through
        // to main world") and carries RemoveWindow's 0.3 s click
        // delay with it; `hudBlocked` is PlayerActivate.cs:230-236;
        // `touchSpell` is its stated exception at :250-258.
        // AbortSpell; a recorded departure). ROAD-Ar R10: the swing
        // is the raw right button - DFU's own 'Mouse1' (:1010) - but
        // never read through held(), so a SwingWeapon rebind is inert.

        const _activateDown = held(keys, 'ActivateCenterObject') || shared._tapArmed > 0;   // AUDIT 62 F8: the touch tap is the ACTION, not a synthesized 'Mouse0' - a rebind off Mouse0 must not kill the finger, and no key code can honestly stand for a mouse binding
        const _act = activateFrame((latch.activate ??= createActivateGate()), {
          down: _activateDown,
          hasReadySpell: magic.spellArmed() && !shared._tapLockOnly,   // AUDIT SPELL-HAND L4-9: the stick-half tap is the lock pick and nothing below it (TS1) - never a cast, a spell readied or not
          touchSpell: magic.readied()?.rangeType === 1,   // rangeType 1 is ByTouch (spellcast.js:"ClassicTargetIndexToTargetType")
          hudBlocked: activeMouseOverLargeHUD(),
          paused: _overlayHeld,
        });
        // GUN-HOLD: Activate while the guns are laid holds fire (navalHost.js holdFire, the bow's own cancel) - before the
        // click casts a readied spell or the helm's ladder boards or opens the yard
        const useEdge = !shared.travelView?.active && pressed(latch.edge, keys, 'Interact');   // AUDIT OW5 V2: never from under the travel view - its ray is the hidden head's (a door took the traveller inside, a townsperson opened talk); KB1: the Interact ACTION (E by default, Mac's call) - it was a raw `KeyE` beside DFU's E-AbortSpell, and one press did both
        // AUDIT NAV2 F31: and Interact - the readout's own "E: hold fire" - holds it too, spent before a patch or the ladder:
        // E went to the ladder, whose naval arm grappled a struck ship in reach with the guns still laid, and the release
        // then fired the broadside into the ship being hauled alongside
        const _holdFire = (_act.activate || _act.cast || useEdge) && !!shared.naval?.aiming && shared.naval.holdFire();
        if (_act.cast && !_holdFire && !shared.gatherHost?.acting()) magic.interceptAttack(true, CAST_PRESS);   // SPELL-HAND: the cast's own press; the frame's firePending sends it down the live look; AUDIT 29 D2: never a readied spell mid-act (the dungeon held it off already)
        // PROF1: E at an herb patch is the patch's - an act started, or what it needs said - spent before the ladder
        const nodeTook = useEdge && !_holdFire && !modes.transitioning && !shared.naval?.takesActivate?.() && (shared.gatherHost?.press() ?? false);
        // AUDIT 32 H5: a click mid-act is the act's too (AUDIT 29 D3's law for E) - it opened the body's loot under the
        // knife and ended the trace. CLICK-LIFT (AUDIT 2026-10-01 part four): to its release - the click that struck the
        // act's last blow lifts after the act has ended; AUDIT HERB-CURSOR B2: asked before the node's click, as the dungeon's ladder asks it
        const _actClick = shared.gatherHost?.clickTaken(_activateDown) ?? false;
        // PROF-MENU: and the click on a node's lit row is the node's, as a loot row's click takes it (never mid-act, nor
        // an act's click lifting: that click is the act's - the last glint's release pressed the patch's "Pick" row)
        const nodeClicked = !useEdge && _act.activate && !_holdFire && !modes.transitioning && !shared.gatherHost?.acting() && !_actClick && !shared.naval?.takesActivate?.() && profClickPress();   // PROF2: a patch's, a vein's or a boulder's; NAVAL-E (AUDIT 2026-10-01 part four): never a press the sea takes - the net's cast stood in the look while the readout said "E: board her"
        if (((_act.activate && !shared.gatherHost?.acting() && !_actClick && !nodeClicked) || (useEdge && !nodeTook)) && !modes.transitioning && !_holdFire) {
          // T3b: a townsperson under the ray wins the activation (the
          // PlayerActivate nearest-hit order); G3: a guard corpse next
          // (loot pickup on the dungeon's S2 shape); doors otherwise.
          const useFwd = shared._tapDir ?? [Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)];   // TI1: the tap's ray, else the centre
          // QG1: the quest-resource click arm runs FIRST and does not
          // consume the activation (PlayerActivate.cs:325-339 - the
          // Hit Checks region's opening arm, no return, skipped in
          // Info mode). A live foe carrying a QuestResourceBehaviour
          // takes the click through its own DoClick, and the ladder
          // below still runs - exactly the C# fall-through.
          if (getInteractionMode() !== 'info' && !shared._tapLockOnly) {   // TS1: the stick's tap is no click
            const qf = pickQuestFoe(cam.pos, useFwd, [...exteriorFoes.foes, ...cityGuards.guards], collider);
            if (qf) qf.questBehaviour.doClick();
          }
          // TI1: a tap on a live foe is the LOCK (player/lockOn.js),
          // toggled, and the activation ends there - the ladder has no
          // arm for a living enemy but the quest one above, which ran.
          const _lockFoe = shared._tapDir ? pickFoe(cam.pos, useFwd, [...exteriorFoes.foes, ...cityGuards.guards].filter((f) => f.companion == null), collider, LOCK_PICK_DISTANCE) : null;   // COMPANION-KIT: a tap on my companion opens his pack, never a lock-on
          // AUDIT 63 F33: ActivateMobileEnemy (PlayerActivate.cs
          // :800-841) - the LIVING-foe arm the ladder never had.
          // AUDIT 63 F33 (review round): the NEAR call is decided
          // against the REST OF THE LADDER by distance, not run ahead
          // of it. DFU casts ONE ray (:314) and reaches the enemy
          // check (:419) only for the thing that ray actually hit, so
          // a townsperson, a corpse, a dropped pile, a street NPC, a
          // bulletin board or a door standing nearer than the foe takes
          // the click - `_rivalDist` below is those picks' own winning
          // distance. AUDIT 65 MC-2 made it ONE call at RayDistance:
          // the un-gated Info line (:806-826) and the pickpocket's
          // too-far refusal (:832-836) ride the same comparison, and a
          // second call at the bottom of the ladder could not see
          // `_rivalDist` at all.
          const _enemyArm = (reach, nearerThan = Infinity) => tryMobileEnemyActivate(cam.pos, useFwd,
            [...exteriorFoes.foes, ...cityGuards.guards], collider, reach,
            getInteractionMode(), playerEntity, {
              nearerThan,
              doorBehind: _race.doorDistance,   // TACT3d: a peaceful guard is no door (the race below, read when the arm runs)
              behind: _race.next,   // FB1012d ALLY-YIELDS: what the press takes past him - my companion yields to it where it answers
              hud: (t) => townTalk.say(t),
              modal: (t) => townTalk.showOverlay(new ActionTextBox(String(t).split('\n'))),
              makeEnemiesHostile: _makeEnemiesHostile,
              openCompanion: (rec) => openCompanionPack(rec),   // COMPANION-KIT: my companion's pack
              openFate: (rec) => openRevenantFate(rec),   // REVENANT-FATE: a beaten revenant's choice
              playerFeet: walkMode ? player.pos : cam.pos,
              nothingText: () => townTalk.randomText(FOUND_NOTHING_VALUABLE_TEXT_ID) || 'You found nothing valuable.',
            });
          // AUDIT 24 (wave 38): BOTH corpse pools go into ONE pick.
          // The watch and the encounter foes leave the same container
          // type, so which body you open is PlayerActivate's nearest
          // hit, not which pool the host happens to ask first - and
          // until this wave the host never asked the encounter pool
          // at all, so its corpses could not be opened by anyone.
          const corpseTargets = [...cityGuards.lootTargets(), ...exteriorFoes.lootTargets()];
          const _corpsePick = pickActivatableHit(cam.pos, useFwd, corpseTargets, collider), _pilePick = pickActivatableHit(cam.pos, useFwd, dwLootTargets(), collider);   // AUDIT 65 MC-2: BOTH picks run now, because DFU fires ONE ray (:314) and the nearest hit is THE hit.
          const _torchPick = pickActivatableHit(cam.pos, useFwd, droppedTorches.targets(), collider);   // HT1: the mod's RegisterCustomActivation over its six records, the same one ray
          const _wagonPick = pickActivatableHit(cam.pos, useFwd, mwViewWagonTargets(RAY_DISTANCE), collider);   // EOTB-IL: Eye Of The Beholder's cart, RegisterCustomActivation(41239, 3.2), the same one ray
          const _campPick = pickActivatableHit(cam.pos, useFwd, [...camps.targets(), ...reachEvents.fireTargets()], collider);   // SURV3: a camp's fire or tent, the same one ray
          const _hccPick = pickActivatableHit(cam.pos, useFwd, hcc.targets(), collider);   // HCC: the parked wagon's box, the following team's, the standing horse's (RegisterCustomActivation at 3.2), the same one ray
          const _springPick = pickActivatableHit(cam.pos, useFwd, springTargets(), collider);   // SURV3: a fountain, a well, a trough
          const _gatePick = gatePool ? pickActivatableHit(cam.pos, useFwd, [...gatePool.targets(), ...(riteHost?.targets() ?? [])], collider) : null;   // WB2: an Oblivion Gate's fire; WB12d: and the faithful's casket, on its ray
          const _brokerPick = pickActivatableHit(cam.pos, useFwd, [...(sigilBroker?.targets() ?? []), ...cromwark.targets()], collider);   // BUNNYFALL: and Nyx at the Guild camp, on the Broker's arm   // SET7: the Sigil Broker (BROKER-CAGE: in her cage, its whole her box)
          const _csaBoatPick = csaActivationPick(cam.pos, useFwd);   // CSA-D: a boat's box or hull (RegisterCustomActivation 112400-112406 at 3.2), the same one ray
          // HARD2: the race is ONE law now (player/activationRace.js) - the
          // body against the pile, the torch against both and the door,
          // and the two rivals MC-2 split. It was written out by hand in
          // this host and in exterior.js, character for character, which
          // is how AUDIT 66 F7 shipped a torch that had to beat the pile
          // but not the door. The ARMS below are still this host's own.
          // LW3: the people under the ray are the town's and the road's (`_talkPersons`) - the person arm's distances and
          // its talk ray alike
          const _race = raceActivation({
            corpse: _corpsePick,
            pile: _pilePick,
            torch: _torchPick,
            wagon: _wagonPick,
            horseCart: _hccPick,   // HCC
            camp: _campPick,   // SURV3
            water: _springPick,   // SURV3
            gate: _gatePick,   // WB2
            broker: _brokerPick,   // SET7
            boat: _csaBoatPick,   // CSA-D
            door: modes.exteriorActivationHit(cam.pos, useFwd),   // FB1012d ALLY-YIELDS: the door set's pick, its reach with it (`doorDistance` is its distance)
            personDistances: _talkPersons().map((p) => rayPersonDistance(cam.pos, useFwd, p.pos)),
          });
          const _lootPick = _race.loot, _dropPick = _race.drop;
          // Every OTHER thing this ray can strike, at its own distance:
          // the street's townsfolk (townTalk's own cylinder pick), the
          // corpse and pile picks above, and the door/NPC/board set the
          // interior transition picks from.
          // AUDIT 65 MC-2: split in two, because the PERSON arm needs a
          // rival that does not include the persons themselves - see
          // townTalk.tryActivate. The foe arm still measures against
          // everything, the townsfolk included.
          const _nonPersonRival = _race.nonPersonRival;
          const _rivalDist = _race.rival;
          if (yards?.press(cam.pos, useFwd)) { /* HOME-YARD: the plaque's lit row on the piece under the crosshair */ }
          else if (_lockFoe) lockOn.toggle(_lockFoe);
          else if (shared._tapLockOnly) { /* TS1: the stick-half tap found no foe - it opens nothing */ }
          else if (!_act.pressCast && plaquePeerAct(cam.pos, useFwd)) { /* ACT-MENU: a player the plaque named nearest, and the verb it lit - never on a press that cast (AUDIT DISC7 A1) */ }
          else if (!_race.loot && !_race.drop && shared.naval?.activate({ boatTrigger: !!_race.boatWins })) { /* NAV-D: grapples thrown on a struck ship, a rail gone over, a prize's hold opened - a body or a pile under the ray still takes the click first; AUDIT HOLDINGS Q4: her own helm, hold or door under the ray before the gangway */ }
          // AUDIT 65 MC-2: ONE enemy arm, at the RAY's reach, still
          // decided against every rival above - DFU's one raycast
          // (:314) reaches MobileEnemyCheck (:419) only for the thing
          // it hit, and that is the whole of the arm. F33's second,
          // bottom-of-the-ladder call ran with `nearerThan` Infinity,
          // so a foe 20 units off ate a click DFU gives a door at 5.
          else if (_enemyArm(RAY_DISTANCE, _rivalDist)) { /* the enemy was the nearest hit */ }
          else if (!townTalk.tryActivate(cam.pos, useFwd, _talkPersons(), _nonPersonRival)) {   // LW3: the road's people beside the town's
            const lootKey = _lootPick?.key ?? null;
            const dropKey = _dropPick?.key ?? null;
            // HT1: a dropped torch under the ray, nearer than the corpse and the pile: picked up (Grab, Steal) or named (Info, Talk)
            // AUDIT 66 F7: the torch must lose to the DOOR too. This
            // arm compared the pick against the corpse and the pile
            // alone, and stands above `modes.tryEnter()` - so a torch
            // anywhere under the ray (the pick publishes the RAY's
            // 76.8, reach 3.2, as every handler family does) ate the
            // click a shop door, a bulletin board or a static NPC was
            // owed and answered "You are too far away". The rival the
            // enemy arm above already uses carries that distance:
            // AUDIT 65 MC-2's law is that the NEAREST thing under the
            // one ray takes the click, and this arm was the one that
            // did not read it.
            const _torchNearest = _race.torchWins;
            // EOTB-IL: the mod's cart under the same ray (RegisterCustomActivation(41239, CheckWagon, 3.2)) - Info names it, any other mode opens the pack with the wagon
            // SURV3: a camp under the ray - Info and Talk name it, any other mode opens its menu; a water source fills the skins
            if (_race.gateWins) { if (_gatePick.distance > _gatePick.reach) setMidScreenText(tooFarAwayText()); else if (!riteHost?.activate(_gatePick.key)) gatePool.activate(_gatePick.key); }   // WB2: the gate's own door; WB12d: the casket's its own
            else if (_race.brokerWins) { if (_brokerPick.distance > _brokerPick.reach) setMidScreenText(tooFarAwayText()); else if (!cromwark.activate(_brokerPick.key, getInteractionMode())) sigilBroker?.activate(_brokerPick.key, getInteractionMode()); }   // SET7 (BUNNYFALL: Nyx's press first): Info names her, Steal is watched, anything else opens her window
            else if (_race.campWins) { if (_campPick.distance > _campPick.reach) setMidScreenText(tooFarAwayText()); else if (!reachEvents.activateFire(_campPick.key, getInteractionMode())) camps.activate(_campPick.key, getInteractionMode(), plaqueActionFor(_campPick.key)); }   // REST2: the plaque's lit row
            else if (_race.waterWins) { if (_springPick.distance > _springPick.reach) setMidScreenText(tooFarAwayText()); else drinkAtSpring(_springPick.key); }
            else if (_race.wagonWins) { if (_wagonPick.distance > _wagonPick.reach) setMidScreenText(tooFarAwayText()); else mwViewWagonActivate(getInteractionMode(), { say: (l) => townTalk.say(l), openInventoryWithWagon: () => { const w = makeInventoryWindow(EOTB_WAGON_PACK); if (w) townTalk.showOverlay(w); } }); }   // DISC10-E L3: a refused pack is null
            else if (_race.horseCartWins) { hcc.activate(_hccPick.key, _hccPick.distance, (l) => townTalk.say(l), () => setMidScreenText(tooFarAwayText()), plaqueActionFor(_hccPick.key)); }
            else if (_race.boatWins) csaActivate(_csaBoatPick);   // CSA-D: Come Sail Away's seven activations - the helm, the board, the status (the rest are their slices')   // ACT-MENU: the verb the plaque lit, where it stands   // HCC: DeployedWagonActivator / FollowingWagonActivator / StationaryHorseActivator - the runtime's own reach test and refusals
            else if (_torchNearest) { if (_torchPick.distance > _torchPick.reach) setMidScreenText(tooFarAwayText()); else droppedTorches.activate(_torchPick.key, getInteractionMode()); }   // the mod's own activation, ahead of DFU's ladder
            else {
            // AUDIT 65 MC-2: the corpse's own refusal
            // (PlayerActivate.cs:936-941) - the body reaches for the
            // ray now (scenes/corpseMarker.js) so the handler can
            // speak, where the old pick dropped it in silence and let
            // the click fall through to the door behind it.
            if (lootKey && _lootPick.distance > _lootPick.reach) setMidScreenText(tooFarAwayText());
              // MAC-E: a body under the ray opens the inventory WITH the body
              // as the remote target (PlayerActivate.cs:957), exactly as the
              // pile arm below does and as the dungeon host has since U26.
              // The pool still owns the empty-body refusal and the arrows
              // pickup; this hands it the door and nothing else.
            else if (lootKey) {
              // QUICK-LOOT B4: the take goes THROUGH THE WINDOW'S OWN
              // DOOR. `loot` here is the container's loot hooks - the
              // very object this arm would hand the inventory window as
              // its remote target, and whose `items()` that window
              // mutates when the player drags something out. Quick loot
              // takes from the same handle, so there is one mutable way
              // into a container and not two; reaching for
              // `hoverContents` instead would have spliced what the
              // slice documents as a READ-ONLY accessor.
              //
              // The pool still owns everything that is the pool's - the
              // empty-body refusal, the arrows-taken-whole case, a
              // puppet's ask over the wire - because this sits INSIDE
              // its `openWindow` callback rather than ahead of it. A
              // null answer (switch off, no highlight, the crosshair
              // moved) opens the window exactly as before.
              openBodyLoot(lootKey);
              surfacePlayer();
            }
            // U58: THE DOOR AGAIN. U53 pinned this arm to the ART
          // because the door handed every LOOT call the classic window,
          // which cannot draw without INVE00I0. The enhanced pane runs
          // the pile itself now, so the gate is the skin question every
          // other pack arm asks - and on the classic skin it still comes
          // down to the same art.
          // AUDIT 65 MC-2: ActivateLootContainer's own refusal (:868-873)
          else if (dropKey && _dropPick.distance > _dropPick.reach) setMidScreenText(tooFarAwayText());
          // PI1: an item standing as itself is taken on the press (Physical Items' TryPickup) - no window
          else if (dropKey && droppedLoot.physical.owns(dropKey)) droppedLoot.physical.pick(dropKey, playerEntity);
          else if (dropKey && inventoryDoorReady()) {
              // U8e: a pile under the ray opens the inventory WITH the
              // pile as the remote target (Remove defaults - the OnPush law)
              const _fish = dwFish?.fishFor(dropKey) ?? null;   // DW-E3: a fish is a DaggerfallLoot the one ray meets as it meets a pile
              const pile = _fish ? null : droppedLoot.pileFor(dropKey);
              // LOOT-GONE1 (2026-09-24, the contributor's report): pileFor answers null for a pile that went between the
              // hover and the press (a peer took it, a rebuild emptied it), and droppedLootHooks(null) threw inside this
              // frame - an uncaught throw in a rAF callback ends the loop as surely as a return. A pile that is gone
              // opens nothing: worldModes' own twin's shape (its `if (pile)`).
              // QL-FRAME1 (the soft-lock report): the quick-loot take below ended in `return`, and this arm runs INSIDE
              // frame() - the return left before requestAnimationFrame(frame) at its foot, so a take or its refusal ("You
              // cannot carry any more stuff.") stopped the game loop: no look, no walk, no foes. A handled press opens no
              // window and the frame runs on (worldModes' own negated take). test/scenes/ql_frame.test.js holds every return.
              if (pile?.wildBody) openWildBody(pile);   // WILD1: a body I felled in the open zone - choose one of its worn pieces
              else if (pile || _fish) {
                const _hooks = _fish ? dwFishLootHooks(_fish) : droppedLootHooks(pile);
                // SILVER-FINDS (AUDIT 625 S2): a scene's own TREASURE container out here - World of Daggerfall's piles and
                // casket, Deep Waters' chests (`container: true`) - rolls its find as an interior's and a dungeon's pile does,
                // with something in it, once it OPENED (D6); each is unsaved (LoadID 0), minted afresh with its contents, so
                // its object is its name. The player's own drops and a fish never
                const _find = pile?.container === true && pile.items.length ? pile : null;
                // QUICK-LOOT B4: the same door, on the player's own pile -
                // the hooks this arm was already building for the window.
                if (!quickLootTake(dropKey, _hooks, playerEntity, (l) => townTalk.say(l), { getQuest: (uid) => shared.questBridge?.machine.getQuest(uid) ?? null, took: showPickups })) {   // AUDIT QL-WEIGHT1; PICKUP-FEED: the cards
                  const w = makeInventoryWindow({
                    // U53: THE HOST'S OWN FACTORY, not a twelfth copy of it.
                    // This arm hand-rolled the window with the SAME eleven hooks
                    // makeInventoryWindow already passes, plus the two below -
                    // which is precisely what its `extra` parameter is for.
                    onClose: () => droppedLoot.releaseEmptied(),   // AUDIT 17e F28: DFU frees the container on window close
                    loot: _hooks,   // G5: DaggerfallLoot's own identity
                  });
                  if (w) townTalk.showOverlay(w);   // DISC10-E L3: a refused pack is null
                  if (w && _find) silverFindAt('pile', _find);
                } else {
                  if (_find) silverFindAt('pile', _find);
                  droppedLoot.releaseEmptied();   // AUDIT 68 S20: a take is its own window close - an emptied pile is freed
                }
              }
            }
            else modes.tryEnter().then((opened) => {
              // VEIN-NEED (FIELD BUGS 2026-09-29h): E passed on by a node that cannot be worked (AUDIT 29 C1), and no
              // door took it either - the node says what it needs, where the press said nothing at all
              if (!opened && useEdge && shared.gatherHost?.sayNeed()) return;
              // GRAVE1: an activation that hit NOTHING - no door either -
              // while Info mode is selected and the player stands inside
              // a Graveyard-type location reads as "read the nearest
              // stone", through the ordinary popup line (townTalk.say),
              // which is already the enhanced skin's own small text
              // (ui/enhanced/enhancedHudText.js), not a new window. See
              // systems/gravestoneLore.js for why this is location-gated
              // rather than a specific clicked headstone.
              if (!opened && getInteractionMode() === 'info' && _musicLocationType() === LOCATION_TYPES.Graveyard) {
                townTalk.say(randomEpitaph());
              }
            }).catch((e) => console.error(e));
            }   // HT1: the torch arm's else
          }
        }
      }
    } else {
      const speed = (keys.has('ShiftLeft') ? 400 : 40) * dt;   // fly-cam (dev): raw keys, not an action
      if (keys.has('KeyW')) for (let a = 0; a < 3; a++) cam.pos[a] += fwd[a] * speed;   // fly-cam (dev)
      if (keys.has('KeyS')) for (let a = 0; a < 3; a++) cam.pos[a] -= fwd[a] * speed;   // fly-cam (dev)
      if (keys.has('KeyA')) for (let a = 0; a < 3; a++) cam.pos[a] -= right[a] * speed;   // fly-cam (dev)
      if (keys.has('KeyD')) for (let a = 0; a < 3; a++) cam.pos[a] += right[a] * speed;   // fly-cam (dev)
    }
    };
    frameMotor();
  }
  return { frameMotorPhase };
}
