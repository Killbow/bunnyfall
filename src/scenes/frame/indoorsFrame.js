// The frame's indoors phase (the modal frame and the move inside) and its street phase (the
// quest machine's exterior tick).
import { audio } from '../../audio/audio.js';
import { betterAmbience } from '../../audio/betterAmbience.js';
import { bountyDoorOpen, closeBountyDoor } from '../../ui/bountyDoor.js';
import { capturePendingScreenshot } from '../../saves/saveSlots.js';
import { centreFromFeet } from '../../characters/enemyAnchor.js';
import { closeNoticeDoor, noticeDoorOpen } from '../../ui/noticeDoor.js';
import { cromwarkDesolateAt } from '../../world/wild/cromwarkTowns.js';
import { deliverOwedShots } from '../../ui/screenshot.js';
import { flushStateChange as dwFlushStateChange } from '../../underwater/deepWaterPlayer.js';
import { entityIsParalyzed } from '../../magic/effects.js';
import { frameEnd } from '../../platform/frameClock.js';
import { heardWeather } from '../../weather/weatherSim.js';
import { streetHeld } from '../streetHold.js';
import { hudFade } from '../../ui/fadeLayer.js';
import { isNight } from '../../world/worldClock.js';
import { livingWorldOn } from '../../systems/livingWorld/livingSwitch.js';
import { meterFor } from '../../render/perfMeter.js';
import { playerEntity, staffFrozen } from '../../characters/playerEntity.js';
import { presetForExterior } from '../../audio/ambientEffects.js';
import { raidFrame as raidingPartiesFrame } from '../../worldEvents/raidingParties.js';
import { SEASON } from '../../world/climateSwaps.js';
import { skyMinutes, worldMinutes } from '../../world/worldTick.js';
import { SWIM_SOUND_CLIP, SWIM_SOUND_VOLUME } from '../../world/deepWaterSwim.js';
import { frame as warmAshesFrame } from '../../systems/naval/warmAshesShips.js';
import { timeScale as worldTimeScale } from '../../world/timeScale.js';

/** @param {any} shared */
export function createIndoorsFrame(shared) {
  const {
    _bandChase, _dwSwimSound, _fr, _snowPixels, ambience, bandDrop, built, canvas, caravanStep, crewAshoreTick,
    crewFlatDrawn, csa, dwFish, dwFishFrame, dwLoot, dwLootLetGoVelocity, dwPlayer, dwPlaying,
    foragingWait, frame, gamePaused, gateVeil, hccTick, heatHaze, legacyStep, LIVING_CARRIED_SLICE_MS,
    livingCarriedStep, livingDiversStep, livingIndoorsStep, livingMemoFresh, livingRemainsStep, livingWays, maps,
    minuteNow, modes, player, playerTravelPixel, renderer, revenantAshoreTick, sky, snowBodies, snowCover, snowfall,
    soundscape, townTalk, windAudio, windfall, wodArrivalOf, worldAddons, worldMoveBusy,
  } = shared;
  function frameIndoorsPhase(now, dt) {
    if (modes.frame(dt, now)) {
      if (shared._wodInside) { shared._wodInside = false; shared._wodArrival = wodArrivalOf([]); }   // WOD6: inside - the arrival's markers meet Start on the way out, from the player
      if (!shared.skyInside) { shared.skyInside = true; sky.setInside(true); }   // DS1: InteriorTransitionEvent
      // WM4c: the exterior parent is inactive indoors in DFU and its
      // AudioSources stop with it; the mills fall silent and the
      // per-frame retry restarts them on the way out.
      for (const p of built.values()) for (const w of p.windmills) { w.hum?.stop(); w.hum = null; }
      windAudio.stop(); soundscape.stop();   // WIND3: the port's own wind falls silent indoors, as the mills do; SOUNDSCAPE: and the sea's, the shore's, the wild's and the town's air with it
      // DISC6: the street's ambience keeps its clock indoors - the HOUR is live (a night that falls while you are
      // inside brings its crickets), the rain and the crickets are heard through the walls, and underground the
      // crickets stop (CRICKET-DUNGEON, which only ever ran here). AUDIT DISC7 B1: the WORD and the rain's GAIN stay
      // the street's last - the weather front does not tick indoors (applyWeather is the outdoor frame's), so the
      // street's own rain is what you hear through the walls: a building at INDOOR_RAIN_GAIN of it, never louder
      // than the street, and underground at the street's own gain. Forcing gain 1 here made a light shower (the
      // front's 0.15) louder in a tavern than in the street - the Discord report itself - and a dungeon 6.7x.
      const _keepStreetRigs = !!modes.inBazaarBetwixt?.();
      if (_keepStreetRigs) ambience.stop?.();
      else {
        ambience.setPreset(presetForExterior(heardWeather(), isNight(minuteNow()), cromwarkDesolateAt(maps, playerTravelPixel().x, playerTravelPixel().y)));
        ambience.update(dt, { inside: true, underground: modes.mode === 'dungeon', indoorRainSource: betterAmbience.rainPlaying() });
        worldAddons.run('indoorFrame');
      }
      livingWays.frame(); livingMemoFresh();   // AUDIT-E2: the ways asked indoors too - a load made in a tavern or below asked once and never again
      try { livingDiversStep(now); } catch (e) { console.warn('[divers] step', e); }   // LW6: underground, the companies diving here met (AUDIT LW-II-2: wrapped as its neighbours are - a throw never kills the frame loop)
      try { livingRemainsStep(now); } catch (e) { console.warn('[remains] step', e); }   // LW6b: ...and the dead the deep kept there
      livingIndoorsStep(townTalk.overlayActive ? 0 : dt);   // LW8: in a building, the residents whose day has them inside (AUDIT-E3: held under a talk, as the street's)
      if (dwPlayer) {
        audio.setListenerLowPass(0);   // DW-D: UpdateAudioFilter's IsPlayerInside - RemoveAudioFilter
        // AUDIT DW-F: UpdateSwimSfxAndWeather asks IsPlayingGame and IsPlayerSwimming && !IsWaterWalking and nothing of
        // IsPlayerInside, and DFU's dungeon arm raises IsPlayerSwimming in dungeon water (PlayerEnterExit.cs:379-393) -
        // so a dungeon swimmer splashes every 2.5 m too; a building has no water and resets the track
        const sw = modes.mode === 'dungeon' ? modes.dungeonCtx?.swimmer?.() ?? null : null;
        if (sw && dwPlaying() && sw.swimming && !sw.waterWalking) { if (_dwSwimSound.step(centreFromFeet(sw.feet, sw.height))) audio.playOneShot(SWIM_SOUND_CLIP, SWIM_SOUND_VOLUME); }
        else _dwSwimSound.reset();
        dwPlayer.insideFrame(player, now / 1000); dwFlushStateChange();
      }
      if (dwFish) {
        shared._dwFishInside = true;
        const f = dwFishFrame(dt);
        dwFish.pulse.pump(f);   // DW-E3: indoors the exterior (and its fish) is inactive; the mod's pulse runs on - out of the water context, cleared two seconds on, the driver's inside arm
        dwLoot?.pump(f);   // DW-E5: and the loot's - out of the water context, its anchor let go
        dwLootLetGoVelocity();   // ...and its velocity track: the way out is a door's reposition, no move
      }
      // AUDIT OH-F A3: OceanHoles.Update's queue runs indoors too, every terrain inactive - a queued pixel waits toward its
      // 600-attempt timeout ("rejected:inactive-terrain-timeout"), as the mod's own Update does behind a door
      if (shared.oceanHoles) shared.oceanHoles.processOneTerrain();
      // BOUNTY1 (Mac, 2026-09-28: "one of my quests turned into a graveyard dungeon quest where i had to kill spiders,
      // sadly no spider where to be found"): the bounties tick INDOORS too. This modal arm returns before the
      // exterior frame's tick below, so underground the hunt was asleep - a dungeon bounty's pack never stood, and a
      // purse earned inside held its notice until the street. The farms come down here (their sync's mode test).
      try { shared.bountyHost?.tick(dt); } catch (e) { console.warn('[bounty] tick', e); }
      try { shared.gatherHost?.tick(dt); } catch (e) { console.warn('[prof] tick', e); }   // PROF1: indoors too - no prompt, but the answers come in
      try { legacyStep(dt); } catch (e) { console.warn('[legacy] tick', e); }   // LEGACY1: indoors and underground too
      shared._farmSyncT -= dt;
      if (shared._farmSyncT <= 0) { shared._farmSyncT = 0.5; try { shared.bountyFarms?.sync(shared.bountyHost?.farmsWanted() ?? []); } catch (e) { console.warn('[bounty] farms', e); } }
      foragingWait.tick();   // AUDIT 28 F2: Foraging's wait ticks in every mode - a wait left pending indoors held every quest's boxes until the street
      // AUDIT 28 H12: a death in the building's or the dungeon's own slot is never under a DOM window of the street's -
      // the board and the payday notice come down (an unread notice goes back in its queue)
      if (modes?.deathUp?.() && (bountyDoorOpen() || noticeDoorOpen())) { closeBountyDoor(); closeNoticeDoor(); }
      // AUDIT F2-I1: the modal frame RETURNS, so an overlay held in the
      // townTalk slot got neither its clock nor its draw while the
      // player was inside a building or a dungeon - chargen mounts
      // there from an un-awaited load, so a constellation started on
      // the way in would hang until its deadline. Ticked and drawn
      // ABOVE the modal render, which is where townTalk always draws.
      // U43-ii: UNCONDITIONAL. AUDIT F2-I1 added this line to tick a
      // window held in the townTalk slot while the player was inside a
      // building or a dungeon, and gated it on the window existing -
      // but townTalk.frame ticks and draws the HUD TEXT LAYER too
      // (townTalk.js:"NextInteractionMode", townTalk.js:"reads the four modes"). So every HUD line raised in a modal
      // mode had nowhere to land, which is why the interior weapon
      // rig's `say` was a console.warn and the interior ticker's was a
      // console.log. Drawn ABOVE the modal render, which is where
      // townTalk always draws.
      warmAshesFrame(gamePaused() ? 0 : dt * worldTimeScale());   // WA1: the mod's coroutine clock, in every mode (a MonoBehaviour's Time.deltaTime)
      raidingPartiesFrame(gamePaused() ? 0 : dt);   // RAID1: indoors too - the day's roll, the region's news, a raid running out; nothing is stood (FindCurrentRaid wants the street)
      if (_bandChase.size) bandDrop();   // AUDIT OW4 B5: a door ends every chase, spent - the band frame never runs indoors, and a chase froze there to take up again on the way out
      caravanStep(dt);   // AUDIT LW-II C5b: the reports carried in and the escort, indoors and below too
      if (livingWorldOn()) livingCarriedStep(LIVING_CARRIED_SLICE_MS);   // AUDIT LW-II-2 H7: the word carried worked indoors and below too - a town first asked from a room (a save loaded in its tavern, a day begun abed) told none all its stay
      try { shared.eliteDungeonFight?.frame(); } catch (e) { console.warn('[elite dungeon] frame', e?.message ?? e); }   // BUNNYFALL: the elite dungeon's series, Sifrit and the cleanse (systems/eliteDungeons/edFight.js)
      // Indoors, a boat's crew is drawn as flats again (extraBillboards).
      csa.people(crewFlatDrawn);
      heatHaze.suppress();   // HAZE1: inside is no exterior - the strength is 0 at once (HeatHazeMod.Update), and eases up again outside
      { const _wfPx = playerTravelPixel(); windfall.frame({ dt: gamePaused() ? 0 : dt * worldTimeScale(), outside: false, weather: shared.weather, minutes: skyMinutes(), climate: maps.getClimateIndex(_wfPx.x, _wfPx.y), mapPixel: _wfPx, feet: player.pos, height: player.height }); }   // WINDFALL1: WindMod.Update indoors - the gust eases out, the sources fade, the leaves stop (AUDIT ENVIRONS W1: on the game's seconds)
      { const _snPx = playerTravelPixel(); _snowPixels.clear(); snowfall.frame({ now: now / 1000, inside: true, player: null, weather: shared.weather, seconds: worldMinutes() * 60, winter: snowCover.winterNear(shared.season === SEASON.Winter), climate: maps.getClimateIndex(_snPx.x, _snPx.y), corpses: snowBodies }); }   // SNOWFALL1: DynamicSnowController.Update indoors - the surfaces hidden, the snowpack and the refill kept by the event clock
      crewAshoreTick();   // CREW-COMPANIONS: the party stood indoors and underground too
      revenantAshoreTick();   // REVENANT-COMPANION: and the sworn
      hccTick(dt, now);   // AUDIT HCC H1: the runtime's LateUpdate indoors too - the hotkeys' "outdoors only", the settings, the switch
      townTalk.frame(dt);
      renderer.resolveFrame();   // AUDIT RETRO1 E5/C8: a frame that drew no screen quad (the enhanced skin, a sheathed weapon) is shown NOW, not at the next beginFrame
      capturePendingScreenshot(canvas);   // SS1: a save armed from a modal mode still lands its shot
      deliverOwedShots();   // SHOT1: the PrintScreen shots owed to a drawn frame, read from this one (ui/screenshot.js)
      gateVeil?.frameDrawn();   // AUDIT WB D5: the step's fire holds shut on the frames the new place has drawn
      // DISC29-D (Skeptikali on Discord: a dungeon at 99.9% CPU, and a counter that could not say whose): the indoor
      // foot is a WHOLE frame - the interior or the dungeon, its foes, its draw - so it takes its sample, and the FPS
      // counter's script time reads indoors as it does outside. AUDIT-WH2 L1-F4 closed it unsampled, for the frame that
      // bails at its second statement (frameHeld, above), and this return is not that frame.
      frameEnd();
      requestAnimationFrame(frame);
      return;
    }
    if (streetHeld()) { meterFor(renderer.gl)?.stopCpu(); frameEnd(); requestAnimationFrame(frame); return; }
    return true;
  }
  function frameStreetPhase(now, dt) {

    // Q4-v: the quest machine's EXTERIOR tick (the modal arms tick
    // inside modes.frame). REAL seconds - QuestMachine.Update
    // accumulates Time.deltaTime, and DFU's TimeScale setting scales
    // the calendar, never Unity time, so ?timescale does not touch
    // this - held by the pause law (PauseGame -> timeScale 0 ->
    // deltaTime 0) through the same overlay gate as the clock, and by
    // the load gate (QuestMachine.cs:310-316 refuses to tick while
    // SaveLoadManager.LoadInProgress - no popups mid-restore).
    // WA1: and the FADE and world-move gate beside it - QuestMachine.Update's own (:310-316, "Do not tick while HUD
    // fading or load in progress ... to prevent quest popups or other actions while player/world unavailable"): a
    // quest started on the eve of a teleport (Warm Ashes' ambush, then the boarding) placed its first foes around a
    // player the world was still being built under. worldMoveBusy() is the port's "unavailable" (a travel, a
    // teleport, a recall, a respawn, a load - each awaited here where DFU's is one frame and a fade).
    if (!townTalk.overlayActive && !worldMoveBusy() && !hudFade.fadeInProgress) shared.questBridge.tick(dt);
    // AUDIT 63 F2: the STREET StaticNPCs' QuestResourceBehaviours, the
    // exterior half of the loop worldModes drives for interior people.
    // Unity Updates a MonoBehaviour whatever the timeScale, so this
    // sits OUTSIDE the pause gate above, as the modal hosts' behaviour
    // loops do. Two clauses of QuestResourceBehaviour.Update ride on
    // it: the back-link recouple (:132-141), which Quest.cs:522's
    // DropQuestor test reads, and the hidden/destroyed Person arm
    // (:143-152).
    for (const entry of built.values()) {
      for (const pn of entry.npcs ?? []) pn.questBehaviour?.update();
    }

    // AUDIT 39 (S19 host gap): PARALYSIS, above ground. Every DFU gate
    // reads PlayerEntity.IsParalyzed with no interior/exterior test -
    // FrictionMotor.GroundedMovement (:75-81) and
    // AcrobatMotor.CheckAirControl (:135-141) zero the movement input,
    // HandleJumpInput (:64-70) and LevitateMotor.Update (:67-69)
    // return, WeaponManager (:235-239) does ShowWeapons(false) and
    // takes no swing. Only the dungeon hosts carried it, and a spider
    // or scorpion out of the wilderness encounter tables casts Spider
    // Touch (exteriorFoes.js readySpell), so the landed paralysis
    // was inert here. Declared above `walkMode` because the motor and
    // the weapon rig are two sibling blocks.
    const paralyzed = entityIsParalyzed(playerEntity) || staffFrozen();   // STAFF-PANEL5-FREEZE: a staff freeze holds the motor as paralysis does
    // A6: FrictionMotor.GroundedMovement's head-dip guard reads
    // IsParalyzed itself (:90-93) - the zeroed input bag below is
    // the movement half of the same law, not this one.
    player.paralyzed = paralyzed;
    meterFor(renderer.gl)?.markCpu('motor');   // PERF-SIM1: the old 'sim' in parts (Dudey's readout in a live town: sim 9-16 ms of a 19-28 ms frame) - the player's motor, the activation, the walk's own hosts
    _fr.paralyzed = paralyzed;
  }
  return { frameIndoorsPhase, frameStreetPhase };
}
