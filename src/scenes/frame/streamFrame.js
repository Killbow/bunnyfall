// The frame's streaming phase (the recentre, pixels in and out, and the terrain passes) and its
// hosts phase (the bounties, the legacy, the patches, the notices, and the farms).
import { adjustFallStart, offsetArrows } from '../shared.js';
import { amGroupRollOwner, rollCampEncountersOnChunkLoad } from '../../characters/campEncounters.js';
import { betterAmbience } from '../../audio/betterAmbience.js';
import { clearSceneCache } from '../../world/sceneCache.js';
import {
  terrainUpdateBegan as dwTerrainUpdateBegan, terrainUpdateEnded as dwTerrainUpdateEnded, pumpDeepWaterRuntime,
} from '../../world/deepWaterRuntime.js';
import { fieldOfView } from '../../ui/viewSettings.js';
import { getPref } from '../../ui/uiPrefs.js';
import { gustPhaseAfterShift } from '../../weather/windDrive.js';
import { isNight } from '../../world/worldClock.js';
import { meterFor } from '../../render/perfMeter.js';
import { mwViewRebase } from '../../player/mwView.js';
import { offsetTactics } from '../../ai/tactics.js';
import { offsetTechniques } from '../../combat/techniques.js';
import { playerEntity } from '../../characters/playerEntity.js';
import { raidOffsetAll } from '../../worldEvents/raidingParties.js';
import { shipCoords } from '../../trade/banking.js';
import { skyMinutes } from '../../world/worldTick.js';
import { StreamingWorldState } from '../../world/streamingWorld.js';
import { wildEncounterLevel } from '../../characters/wildLevel.js';

/** @param {any} shared */
export function createStreamFrame(shared) {
  const {
    _deepSuppressesSpawns, _dwLootVel, _dwSwimSound, _inAnyLocationRect, _standCampEncounter, announceNearbySpawns,
    arrows, atmosphere, built, cam, campMembers, camps, cityGuards, csa, csaCall, csaPeers, csaRuntime,
    csaSyncColliders, deepWaters, destroyPixel, droppedLoot, droppedTorches, dwDecor, dwFish, dwFishFrame, dwLoot,
    dwPlaying, exteriorFoes, folkStreet, footsteps, harbourBook, hazeGl, hcc, heatHaze, hitEffects, inFlight,
    legacyStep, magic, maps, minuteNow, modes, navalCrew, navalFlames, noticeBook, noticeTownHere, ohFrame, peersNear,
    player, playerTicker, pump, pumpDeepWatersLoot, queue, reachBlight, renderer, restridePending, restrideTerrain, sky, snowfall,
    spendRestrides, state, streetPeople, strideFor, terrainGen, walkMode, windfall, wod, wodCarry, wodOpened,
    wodSlots, yards,
  } = shared;
  function frameStreamPhase(now, dt) {

    // Streaming step: recentre, enqueue new pixels, drop far ones.
    meterFor(renderer.gl)?.markCpu('stream');   // PERF-SIM1: the streaming step - the recentre, the pixels in and out
    spendRestrides();   // STREAM1: a promoted pixel's grid, one a frame, off the crossing's own frame
    const frameDwTerrainPass = () => {   // PERF-V8
    if (deepWaters) {
      // DW-E1: StreamingWorld's terrain pass (OnUpdateTerrainsStart / End) is the stream's own busy spell here
      const _dwPass = !!(shared.building || queue.length || inFlight.size);
      if (_dwPass !== shared._dwTerrainPass) { shared._dwTerrainPass = _dwPass; if (_dwPass) dwTerrainUpdateBegan(); else dwTerrainUpdateEnded(); }
      if (deepWaters.pump() && dwDecor) dwDecor.refreshPlayerArea();   // DW-B: PumpDeferredBuilds - one deferred promote out at a time, the nearest first; DW-E2: LoadSettings' RefreshPlayerArea
      pumpDeepWaterRuntime(performance.now() / 1000, dwPlaying());   // DW-E1: DeepWaterRuntime.Pump - the post-transition refresh
      if (dwDecor) { dwDecor.process(); deepWaters.flushPromoteTiming(); }   // DW-E2: UnderwaterDecorations.ProcessWorkQueue, then DeepWaterPromoteTiming.Flush
      if (dwFish) {
        shared._dwFishInside = false;
        const f = dwFishFrame(dt);
        dwFish.pump(f);   // DW-E3: UnderwaterEncounterPulse.Pump, then PassiveFishBehaviour.PumpAll
        if (dwLoot) pumpDeepWatersLoot(f, dt);   // DW-E5: then UnderwaterLootSpawner.Pump, the Update's last
      }
      if (shared.oceanHoles) ohFrame(dt);   // OH-B: OceanHoles.Update - its DefaultExecutionOrder(32002) puts it after every Update of the sea's own
    }
    };
    frameDwTerrainPass();
    const wasMapPixel = { x: state.current.x, y: state.current.y };   // state.update overwrites it; PlayerGPS's lastMapPixelX/Y
    const r = state.update(cam.pos);
    const frameOriginShift = () => {   // PERF-V8
    if (r.offset) {
      // FloatingOrigin.OffsetPlayerController (:176-181) adjusts the
      // fall start BEFORE it moves the controller - without it a
      // vertical recenter mid-air bills the whole 500-unit shift as a
      // fall (trunc(5 * 495) = 2475 HP from a two-metre hop), or bills
      // a killing fall as nothing when it crosses downward.
      adjustFallStart(player, r.offset[1]);
      cam.pos[0] += r.offset[0]; cam.pos[1] += r.offset[1]; cam.pos[2] += r.offset[2];
      player.offsetOrigin(r.offset);   // EV1: shifts BOTH ends of the interpolation span - no 819-unit lerp frame
      sky.offsetOrigin(r.offset);   // VC4: the clouds and their shadow keep their place over the land
      renderer.shadowOriginShift?.(r.offset);   // AUDIT SC1: the shadow cache's remembered placements follow the origin too, or every still caster reads as moved for a second
      // AUDIT FLICKER R2: AND THE FLATS THE NEXT REPLAY READS. The frame's records are replayed at the next beginFrame,
      // before the pixel loop writes a pixel's translation and a townsman's place again - a pixel's flats stand at its
      // translation (p._t, the very array their batches' origin is) and a townsman's batch at his place over it, both
      // the old origin's on the crossing frame: every tree, bush, sign and passer-by cast nothing there, and the far
      // cascade (every other frame) kept the hole a frame more
      for (const p of built.values()) {
        if (p._t) state.pixelTranslation(p.px, p.py, p._t);
        if (p.personBatches) for (const b of p.personBatches.values()) { const o = b.origin; if (o) { o[0] += r.offset[0]; o[1] += r.offset[1]; o[2] += r.offset[2]; } }
      }
      // AUDIT 17e F23: everything else holding a WORLD position must
      // follow the origin too, or it strands 819.2 units behind.
      shared.doorGeneration += 1;   // WORLD-HOVER: the floating origin moved, so every door's WORLD matrix did
      cityGuards.offsetAll(r.offset);
      exteriorFoes.offsetAll(r.offset); reachBlight.offset(r.offset); raidOffsetAll(r.offset);   // X-slice; AUDIT WORLD-EVENTS L4-7: and a raid's square, its refugees' way and its pack's place, on the land
      shared.labGrassField?.shiftOrigin(r.offset);   // PERF-EXT21: the field keeps its own origin and follows this one - every cell stays where it grew (AUDIT 49 F2 / GR5 threw it away here and regrew it for three seconds)
      offsetTactics(r.offset);   // AUDIT TACT D3: the noted player and every live wind-up move with the world
      offsetTechniques(r.offset);   // TECH1: and the player's own - an aim, a leap's landing, a Volley's falling shafts
      hazeGl?.offsetOrigin(r.offset);   // HAZE1: the shimmer's noise stands on the land, not the scene
      heatHaze.offsetOrigin(r.offset);   // HAZE1 (AUDIT ENVIRONS I7): and the ring's layer, held while airborne, with it
      atmosphere.offsetOrigin(r.offset);   // ATMO1
      windfall.offsetOrigin(r.offset);   // WINDFALL1: the trees' places in the mod's wind, and its leaves, stand on the land
      snowfall.offsetOrigin(r.offset);   // SNOWFALL1: FloatingOrigin.OnPositionUpdate - the tiers' centres, their tracks and their pending stamps stand on the land
      droppedLoot.offsetAll(r.offset);
      dwFish?.offsetAll(r.offset);   // DW-E3: the fish and their schools' centres (Port-Ledger A, the Iliac Puddle row)
      droppedTorches.offsetAll(r.offset);   // HT1: the torches too
      shared._livingHideoutsHost?.offsetAll(r.offset);   // AUDIT LW-II-2 H2: a band's hideout stood - its tents and its fire stood 819.2 behind every crossing
      camps.offsetAll(r.offset);   // SURV3: and the camps
      hcc.offsetAll(r.offset);   // HCC: FloatingOrigin.OnPositionUpdate - every scene point the runtime holds, the peers' teams, the parked wagon's collider
      if (csaRuntime) csaCall(() => csaRuntime.OnPositionUpdate(r.offset)); else csa.offsetAll(r.offset);
      csaPeers.rebase(r.offset);   // CSA-J: the peers' eased places with the world
      harbourBook.offsetAll(r.offset);   // HARBOUR-BOOK: the harbours' berths and mouths - before the sea and the quays read them
      shared.naval?.offsetAll(r.offset); navalFlames.offsetAll(r.offset);   // NAV-H: the sea's ships, their shots, smoke and fires - before their buckets stand again below
      shared.quays?.offsetAll();   // AUDIT HOLDINGS Q7: the quays' still colliders stood again where the berths (moved just above) lie
      csaSyncColliders(); yards?.rebase();   // CSA-D: the boats' buckets stand where the shift put them before any motor step meets them   // CSA-C: the mod's own FloatingOrigin.OnPositionUpdate (its kept bug: a boat out of sight stays behind)   // FB1001 YARD-RECENTRE: and the yards' pieces with their buckets, in place - their frame ran above the shift, and the draw is below (one line, so no line cite moves)
      hitEffects.offsetAll(r.offset);   // AUDIT 24 (wave 39): a splash mid-animation follows the origin too
      for (const q of [shared._wodArrival.origin, shared._wodArrival.loadAt]) if (q) { q[0] += r.offset[0]; q[1] += r.offset[1]; q[2] += r.offset[2]; }   // WOD6
      // AUDIT 18: this line used to be an optional call to a method
      // ArrowFlight has never had, so it was swallowed every time and
      // every in-flight arrow was stranded 819.2 units behind.
      offsetArrows(arrows, r.offset);
      // AUDIT 24 (the seven-slice sweep): and the SPELL missiles, the
      // one world-position pool this block never reached. The comment
      // three lines up says "everything else holding a WORLD position
      // must follow the origin too" and then listed four of five.
      magic.offsetAll(r.offset);
      shared.gustPhase = gustPhaseAfterShift(shared.gustPhase, r.offset, shared.gustWind);   // AUDIT MEADOW1: the grass's and the trees' gust wave stands still under the crossing
      // EV1: the two recenter misses the jitter lane found - the
      // stride anchor (a spurious footstep per crossing) and the
      // stillness gate's last-position (one false "moving" frame).
      footsteps.rebase();
      betterAmbience.rebase();   // BA1: the same anchor, the mod's own machine
      shared.remotePlayers?.rebaseFootsteps?.();   // PEER-BUZZ: and every peer's - their strides are measured in scene units now, so they recentre with the rest
      shared.remotePlayers?.rebaseSounds?.(r.offset);   // AUDIT DISC7 B6: and the riders' loops, in the frame the listener moves in
      shared.gatherHost?.rebase(r.offset);   // AUDIT GATHER-FEEL: and the gathering's ear - a net's place, a blow in the air - with the land
      _dwSwimSound.rebase(r.offset);   // DW-D: the swim's odometer too - a recentre is not a stroke
      if (shared._partyRestVoteOrigin) { shared._partyRestVoteOrigin[0] += r.offset[0]; shared._partyRestVoteOrigin[1] += r.offset[1]; shared._partyRestVoteOrigin[2] += r.offset[2]; }   // AUDIT PARTY-REST: PARTY-REST16's origin is a scene point too - unshifted, a crossing read as a 819-unit walk and cancelled the vote
      mwViewRebase(r.offset);   // EOTB-IL: FloatingOrigin.OnPositionUpdate - the sprite camera's smoothing follows the origin
      shared.farmingMode?.rebase(r.offset);
      shared.travelView?.rebase(r.offset);   // AUDIT DEEP2 D2: the Overworld's camera and its eye follow the origin - no lurch at a crossing
      if (shared._lastPlayerPos) { shared._lastPlayerPos[0] += r.offset[0]; shared._lastPlayerPos[1] += r.offset[1]; shared._lastPlayerPos[2] += r.offset[2]; }
      if (_dwLootVel.last) for (let i = 0; i < 3; i++) _dwLootVel.last[i] += r.offset[i];   // DW-E5: FloatingOrigin moves the player by transform - no velocity
      // ONLINE1 (AUDIT ONLINE D5): the others' billboards were placed before this step from the old origin - they follow it, or every peer jumps a tile for one frame at each crossing
      if (shared.remotePlayers) for (const b of shared.remotePlayers.batches()) { b.origin[0] += r.offset[0]; b.origin[1] += r.offset[1]; b.origin[2] += r.offset[2]; }
      shared.peerRiders?.offsetAll(r.offset);   // RIDE: the riders' sprites follow the origin as the dolls do
      shared.peerWalkers?.offsetAll(r.offset);   // DISC23-B: and the walkers'
      if (shared._onlineLast) { shared._onlineLast[0] += r.offset[0]; shared._onlineLast[1] += r.offset[1]; shared._onlineLast[2] += r.offset[2]; }
      if (shared.peerBodies) shared.peerBodies.offsetAll(r.offset);   // MWBODY1 (AUDIT MWBODY B2): the bodies' feet follow the origin as the dolls do
      shared.familyStreet?.offsetAll(r.offset);   // LEGACY7 part four: and the line's in the street
      folkStreet.offsetAll(r.offset);   // MWNPC7: and the walkers'
      streetPeople.offsetAll(r.offset);   // MWNPC8b: and the standing people's
      shared.livingRoads?.offsetBodies(r.offset);   // MWNPC10c: and the road's people's
      navalCrew.offsetBodies(r.offset); shared.siegeNpcs?.offsetBodies(r.offset);   // MWNPC10: and the crews' and the siege's
    }
    };
    frameOriginShift();
    const framePixelChanged = () => {   // PERF-V8
    if (r.pixelChanged) {
      // P1: PlayerGPS.Update (:329-339). The map pixel changed, so
      // the world has moved on - "Clear non-permanent scenes from
      // cache, unless going to/from owned ship". Everything the
      // player rearranged in an ordinary interior (emptied shelves,
      // dropped loot, opened doors) is forgotten here; a PERMANENT
      // scene - a rented room, a bought house, the ship - keeps its
      // loot across the clear, minus its corpse markers. The ship
      // exception is the one place a non-permanent scene survives:
      // DFU skips the clear entirely when either end of the move is
      // the ship's own pixel (GetShipCoords answers null with no
      // ship, and the whole test collapses to "always clear").
      const ship = shipCoords(playerEntity);
      const toOrFromShip = !!ship && ((r.current.x === ship.x && r.current.y === ship.y)
        || (wasMapPixel.x === ship.x && wasMapPixel.y === ship.y));
      if (!toOrFromShip && playerEntity.sceneCache) {
        clearSceneCache(playerEntity.sceneCache, { start: false });
      }
      queue.push(...r.load);
      announceNearbySpawns(r.current.x, r.current.y, walkMode ? player.pos : cam.pos);   // SPAWNED-DUNGEONS2: said on ENTERING the pixel, not when it is rolled (that is three pixels ahead); SPAWNED-DUNGEONS3: from where the player stands, in metres
      if (dwDecor) dwDecor.onMapPixelChanged(r.current);   // DW-E2: PlayerGPS.OnMapPixelChanged -> HandleMapPixelChanged
      shared.ohAbyss?.onMapPixelChanged();   // OH-D: PlayerGPS.OnMapPixelChanged -> OceanHoles.OnMapPixelChanged (the rename held for its own pixel)
      // WOD5: PlayerGPS raises OnRegionIndexChanged on the frame the
      // region changes, and it changes only on a crossing - so the loader
      // hears it here as well as at a build: a visit shorter than a build
      // would otherwise go unheard, and the list's order with it. After
      // Awake, so region 17 stays first.
      if (wod) { const region = maps.getRegionIndexAt(r.current.x, r.current.y); wodOpened.then((ok) => { if (ok) wod.noteRegion(region); }); }
      // AUDIT BRANCH (WoD) L1-3: DFU's UpdateWorld then CollectTerrains - a
      // pooled site whose slot a new tile takes is gone for good; the ones
      // leaving range now are pooled by the teardown below
      if (wod) for (const k of wodSlots.step(r.current.x, r.current.y, state.terrainDistance, StreamingWorldState.onMap).recycled) wodCarry.delete(k);
      for (const u of r.unload) {
        destroyPixel(u.px, u.py);
        state.release(u.px, u.py);
        shared._wodArrival.keys.delete(`${u.px},${u.py}`);   // WOD6: promoted again, it is no longer the arrival's
      }
      // EV4: surviving pixels whose ring class changed with the walk
      // swap their terrain surface (full-res core <-> strided far ring).
      //
      // STREAM1 (2026-09-19): A PROMOTION IS QUEUED, NOT PAID HERE.
      // Measured, `buildTerrainGrid` at stride 1 is 3.12 ms of main
      // thread - 16,641 vertices, each with a central-difference normal
      // - and a crossing promotes FIVE pixels at once, whatever the land
      // view distance is (the ring boundary is Chebyshev 3, not the
      // radius). Paying all five inline is 15.6 ms in a single frame, a
      // dropped frame every 819 units walked. Demotions are 0.11 ms and
      // stay inline; promotions go on a queue the frame loop spends a
      // budget of, nearest first, exactly as GR5 fills grass cells. A
      // pixel waiting its turn keeps the coarser surface it already had,
      // which is the same heightfield at a tessellation nobody can
      // resolve 1,600 units out.
      for (const p of built.values()) {
        const want = strideFor(p.px, p.py);
        if (want === p._stride) continue;
        if (want === 1) restridePending.set(`${p.px},${p.py}`, p);   // the dear way round
        else { restridePending.delete(`${p.px},${p.py}`); restrideTerrain(p, want); }
      }
      if (terrainGen.threaded) spendRestrides();   // PERF-EXT26: the promotions reach the worker on the crossing frame, ahead of the new pixels' jobs
      console.log(`stream: entered ${r.current.x},${r.current.y} (load ${r.load.length}, unload ${r.unload.length})`);
      // CAMP1 - GROUP ENCOUNTERS ON CHUNK LOAD (Mac, 2026-09-17: "this
      // should always happen when loading world chunks if it works like
      // that" - it does, this IS that event): a second trigger for the
      // roll `runEncounterTick` takes every 15 real minutes - ON TOP OF
      // that timer, not instead of it, so standing still still gets
      // checked and covering ground gets checked more. Same town gate,
      // same online group-ownership guard; and only with the player
      // actually OUTDOORS - a pixel crossed by a dungeon's own streaming
      // is not a chunk the player walked into.
      if ((modes?.mode ?? 'exterior') === 'exterior' && !playerEntity.isResting && !shared.travelOptions?.isTravelActive && getPref('wildernessCamps') !== false && amGroupRollOwner(shared.online?.id ?? null, player.feetAt(), peersNear())) {   // CAMP-REST: never while the player is resting or waiting; CAMP-TRAVEL (2026-09-25, Mac: "it would stop players too often"): nor while a Travel Options journey runs - the pixels a ride crosses roll no camps
        const chunkCampHits = rollCampEncountersOnChunkLoad({
          inside: false, inLocationRect: _inAnyLocationRect(walkMode ? player.pos : cam.pos),   // DISC19-F: the pixel just entered, not the one syncTopics last resolved
          climateIndex: maps.getClimateIndex(r.current.x, r.current.y),
          playerLevel: wildEncounterLevel(playerEntity, { night: isNight(minuteNow()) }),   // ENCOUNTER-LEVEL
          // CAMP-SEA (2026-09-26, SquidKamer: "I jumped in last night and it summoned an army of everything"): the deep's
          // own suppression and the lone roll's swim gate, asked HERE - the frame's flag is written after this crossing and
          // cleared before the next, so this read `false` at sea every time and stood land camps on the carved seabed
          preventEnemySpawns: playerEntity.preventEnemySpawns || _deepSuppressesSpawns() || !!(walkMode && shared.playerSpawned && player.isPlayerSwimming),
          gameMinutes: Math.floor(playerTicker.classicMinutes),
          skyMinutes: Math.floor(skyMinutes()),   // TIME1: the camp's day and night are the sky's
        }, Math.random, { fovDegrees: fieldOfView() * 180 / Math.PI });   // CAMP-RING: 50%, three groups round the player
        // DROPS-AUDIT CAMP-CAP: the encounter cap is eight (and the wire carries eight puppets an owner, wire.js
        // CELL_PUPPETS_MAX), and three groups ask ~10 - so a group stands WHOLE or not at all, never a one-foe remnant
        if (chunkCampHits) {
          let room = exteriorFoes.encounterRoom?.() ?? Infinity;
          for (const h of chunkCampHits) {
            // PSCALE1 x CAMP-CAP: the group as it will STAND - _standCampEncounter grows it by the party it meets
            // (campMembers, OW6: the one home), so the room is asked for the grown count, or a party's third group was cut short
            const size = campMembers(h.mobileTypes, h.kind).length;
            if (size > room) continue;
            room -= size;
            _standCampEncounter(h, player.feetAt());
          }
        }
      }
    }
    };
    framePixelChanged();
  }
  function frameHostsPhase(now, dt) {
    meterFor(renderer.gl)?.markCpu('hosts');   // PERF-SIM1: the bounties, the legacy, the patches, the notice book, the farms, the pump
    try { shared.bountyHost?.tick(dt); } catch (e) { console.warn('[bounty] tick', e); }   // BOUNTY1: the hunts - packs stood and counted, a purse paid, a notice raised
    try { legacyStep(dt); } catch (e) { console.warn('[legacy] tick', e); }   // LEGACY1: the seat, the elder, the estate, a dead load
    try { shared.gatherHost?.tick(dt); } catch (e) { console.warn('[prof] tick', e); }   // PROF1: the patches, the prompt, the act, the answers
    // NOTICE1: the town the player stands in is read on arrival (a minute's cache, net/noticeBook.js) - so its boards'
    // count floats over them and its board opens as the Notice Board at the first press, not the second
    // AUDIT SCALE B7: once a second by the wall clock, not by the frame's dt - the dt is clamped at 0.1 s, so at four
    // frames a second or fewer that "second" outran FRAME_LIVE_MS and the board's part dropped out between stamps
    const stampAt = performance.now();
    if (noticeBook && (!shared._noticeTown || stampAt - shared._noticeTown.at >= 1000)) { const town = noticeTownHere(); shared._noticeTown = { mapId: town ? town.mapId : null, at: stampAt }; }   // SCALE4c: the heartbeat's board part reads it (above)
    shared._farmSyncT -= dt;
    if (shared._farmSyncT <= 0) { shared._farmSyncT = 0.5; try { shared.bountyFarms?.sync(shared.bountyHost?.farmsWanted() ?? []); } catch (e) { console.warn('[bounty] farms', e); } }   // BOUNTY-FARM: the farms brought in line with the bounties held
    if (state.failed.size) queue.push(...state.retryDue(performance.now()));   // BUILD-RETRY: a failed pixel's wait over, the stream asks for it again
    pump();
  }
  return { frameHostsPhase, frameStreamPhase };
}
