// The frame's people phase: the townspeople's motion and their draws.
import { clearDoorways, spaceAcross, spacingSkips } from '../../characters/foeSpacing.js';
import { foeFrameDt } from '../../characters/enemyMotor.js';
import { folkActor } from '../../characters/folkBodies.js';
import { isInvisible } from '../../magic/effects.js';
import { isNight } from '../../world/worldClock.js';
import { livingWorldOn } from '../../systems/livingWorld/livingSwitch.js';
import { markFoeReach } from '../../characters/foeReach.js';
import { meterFor } from '../../render/perfMeter.js';
import { mobileBillboardSize } from '../../world/rmbFlats.js';
import { playerEntity } from '../../characters/playerEntity.js';
import { raidFrame as raidingPartiesFrame } from '../../worldEvents/raidingParties.js';
import { residentWalkerActor } from '../../characters/rosterBodies.js';
import { UP_Y } from '../../world/mat4.js';

/** @param {any} shared */
export function createPeopleFrame(shared) {
  const {
    _deckBodies, _deepSuppressesSpawns, _foeSenses, _fr, _livePersons, _mode, _questBoxHoldsFoes, _tactDoorSpots,
    _townWatchFrame, bandFrame, billboardOutside, built, cam, camps, cannonSmoke, canvas, caravanStep, cityGuards,
    collider, cromwark, csa, csaDrawParticlesBlended, csaOn, cullOn, deepWaters, drawDeepWatersSurfaces,
    drawOceanHolesTransparent, droppedLoot, droppedTorches, dungeonFindFrame, dwFlagColumnFlats, exteriorFoes,
    folkStreet, foragingWait, gamePaused, handOverWalkedAway, hcc, hitEffects, LIVING_CARRIED_SLICE_MS,
    livingCarriedStep, livingHideoutsHostOf, livingMemoFresh, livingPatronsRegion, livingPatronsStep,
    livingPeerWatchStep, livingRoadsOf, livingTurnsFresh, livingWatchStep, livingWays, makeFamilyBodies, modes,
    navalCarry, navalCrew, navalCrewFrame, navalFlames, navalHud, navalLeash, navalRender, personTex,
    personTextureKey, player, playerAfloat, portalGates, portalHoldNow, portBatchesInto, portGlows, pushSeenShipFlats,
    renderer, riteHost, runEncounterTick, serpentRenderer, sifritFrame, sigilBroker, standingWatch, state, town,
    townTalk, tvSeaY, uploadRecordFrame, walkMode, weaponRig, wildFoesFrame,
  } = shared;
  function framePeoplePhase(now, dt) {
    const { tvf, mwv, proj, view, minute, castBatches, bbUp, camRight } = _fr;
    // MAC1 (Mac: "sprites jittery when slowing down to talk to you").
    // MobilePersonMotor's gate reads PlayerMotor.IsStandingStill -
    // grounded over a ZERO moveDirection (:113-125), the motor's own
    // `standing`. This host compared the CAMERA frame to frame, and the
    // camera carries the head bob and EV1's interpolation: for the
    // frames after the player stops the bob is still settling, so
    // "standing still" flickered and every walker inside idleDistance
    // flipped move/idle/move, its frame reset to 0 on each edge (F021).
    // The fly camera keeps the position test, having no motor to ask.
    shared._playerStill = walkMode && shared.playerSpawned ? !!player.standing : (shared._lastPlayerPos &&
      Math.hypot(cam.pos[0] - shared._lastPlayerPos[0], cam.pos[2] - shared._lastPlayerPos[2]) < 0.001);
    shared._lastPlayerPos = [cam.pos[0], cam.pos[1], cam.pos[2]];
    const isDay = !isNight(minute);
    const livePersonBatches = [];
    meterFor(renderer.gl)?.markCpu('people');   // PERF-CPU: the towns' own pools
    _livePersons.length = 0;   // T3b: rebuilt each frame in WORLD space   // PERF-TOWN1: the SAME array and the same entries, refilled
    shared.familyStreet?.begin();   // LEGACY7 part four: the line's own bodies, stood again this frame
    const _folkOn = folkStreet.frame();   // MWNPC7: and the walkers', when wanted
    const framePopulation = () => {   // PERF-V8
    for (const p of built.values()) {
      if (!p.population) continue;
      const t = state.pixelTranslation(p.px, p.py);
      const local = town.local;   // PERF-TOWN1: one scratch, rewritten per pixel - `update` reads it and keeps nothing
      local[0] = cam.pos[0] - t[0] - p.locOrigin[0];
      local[1] = cam.pos[1] - t[1];
      local[2] = cam.pos[2] - t[2] - p.locOrigin[2];
      town.gate(shared._playerStill, weaponRig.playerWeapon.sheathed, isInvisible(playerEntity), !!playerEntity.isInBeastForm);   // PERF-TOWN1: hoisted, but re-read every frame
      // audit 2026-08-17: the population freezes under the talk
      // overlay (DFU pauses the sim under UI windows)
      const live = p.population.update(townTalk.overlayActive ? 0 : dt, local, cam.yaw, local, isDay, town.stops);
      for (const { person, out } of live) {
        const batch = p.personBatches.get(person);
        batch.archive = person.archive;   // audit 2026-08-17: identity re-rolls per spawn - re-point the batch
        const pt = personTex.get(person.archive);
        const rkey = `${out.record}#${out.frame}`;   // MAC4: the record CARRIES its frame
        if (!renderer.textures.has(personTextureKey(person.archive, out.record, out.frame))) uploadRecordFrame(person.archive, out.record, out.frame);
        const sz = mobileBillboardSize(pt, out.record);   // AUDIT MM1: MobilePersonBillboard.cs:343 - the xml scale, on every record
        batch.record = rkey;
        // PERF-TOWN1: written through, not replaced - both are read by
        // value and nothing holds either across a frame.
        const bs = batch.size, bo = batch.origin;
        if (bs && bo) {
          bs.w = out.flip ? -sz.w : sz.w; bs.h = sz.h;
          bo[0] = person.pos[0] + p.locOrigin[0] + t[0];
          bo[1] = person.pos[1] + t[1];
          bo[2] = person.pos[2] + p.locOrigin[2] + t[2];
        } else {
          batch.size = { w: out.flip ? -sz.w : sz.w, h: sz.h };
          batch.origin = [
            person.pos[0] + p.locOrigin[0] + t[0],
            person.pos[1] + t[1],
            person.pos[2] + p.locOrigin[2] + t[2],
          ];
        }
        const seat = town.seat(_livePersons.length);   // T3b: world-space activation target
        seat.person = person; seat.pos = batch.origin;
        _livePersons.push(seat);
        // LEGACY7 part four: one of the line with a look stands in their own body - the walker stays their talk target
        const kin = person.living?.res;
        if (kin?.look && (shared.familyStreet ??= makeFamilyBodies()).stand(kin, batch.origin, person.yaw, person.state === 'move')) continue;
        livePersonBatches.push(batch);
        if (_folkOn) { const a = person.living?.res ? residentWalkerActor(person, batch.origin) : folkActor(person, batch.origin, p.population.race); if (a) folkStreet.offer(a, batch); else batch.castOnly = false; }   // MWNPC7: a walker offered their body; AUDIT MW-NPC C4: a living resident as themselves - the billboard casts alone where it stands   // AUDIT MW-NPC II K1: a beggar's picture keeps the street (null)
        else batch.castOnly = false;
      }
    }
    };
    framePopulation();
    // BUNNYFALL COMPANIES: the garrisons' patrols on their routes (scenes/garrisonPatrols.js)
    if (shared.garrisonPatrols) livePersonBatches.push(...shared.garrisonPatrols.frame(townTalk.overlayActive ? 0 : dt, (p) => { const t = state.pixelTranslation(p.px, p.py); return [cam.pos[0] - t[0] - p.locOrigin[0], cam.pos[1] - t[1], cam.pos[2] - t[2] - p.locOrigin[2]]; }));
    // AUDIT LEGACY III W4: held under a talk window, as the street is (the member met walked on the spot behind their card)
    if (shared.familyStreet) { shared.familyStreet.end(townTalk.overlayActive ? 0 : dt, cam.pos); livePersonBatches.push(...shared.familyStreet.batches()); }
    folkStreet.draw(canvas, proj, view, mwv.eye, townTalk.overlayActive ? 0 : dt);   // MWNPC7: the walkers' bodies - held under a talk, as the street is
    // LW3: THE ROADS - the living world's parties near, in file by day and about their fires by night (scenes/
    // livingRoads.js), on the ground and grown under the Overworld; the planner asked a few ways a frame
    livingWays.frame(); livingMemoFresh();   // LW3: a new network, new ways (AUDIT-B8: and the memo's bound)
    livingTurnsFresh();   // LW4: a turn of fate made, or a save loaded - the books made again
    if (livingWorldOn() && _mode() === 'exterior') {
      livingRoadsOf().frame(townTalk.overlayActive ? 0 : dt, cam.pos, { overworld: tvf ? { grow: tvf.grow, blend: tvf.blend } : null });
      livePersonBatches.push(...shared.livingRoads.batches());
      shared.livingRoads.drawBodies(canvas, proj, view, mwv.eye, townTalk.overlayActive ? 0 : dt);   // MWNPC10c: the road's people in their bodies - before the person billboards draw
    } else if (shared.livingRoads) shared.livingRoads.clear();
    caravanStep(dt);   // LW11: the hold-ups, the reports carried in, the escort - anywhere (a report lands, an escort ends, indoors too)
    if (livingWorldOn() && _mode() === 'exterior' && !tvf) { livingHideoutsHostOf().frame(dt); livePersonBatches.push(...livingHideoutsHostOf().batches()); }   // LW12: a band's hideout near, stood
    else shared._livingHideoutsHost?.clear();
    if (livingWorldOn() && _mode() === 'exterior') livingPatronsStep(Date.now() / 1000, livingPatronsRegion);   // LW15: the region's patrons, now and then (AUDIT LW-II-2 W11: while a living town stands)
    if (livingWorldOn()) livingCarriedStep(LIVING_CARRIED_SLICE_MS);   // LW16: the word carried, worked a slice a frame
    if (livingWorldOn()) { livingWatchStep(); livingPeerWatchStep(); }   // LW7 / WATCH-FIX: the turned watch followed, mine and a peer's
    if (shared.livingIndoors?.size || shared.livingIndoors?.spots().length) shared.livingIndoors.clear();   // LW8: the street again - the room's residents freed (LW-FIX1: and an empty room's sounding)
    if (shared.livingRemains) { shared.livingRemains.clear(); shared.livingRemains = null; }   // LW6b: ...and the deep's layer let go with its dungeon
    if (shared.livingDivers) { shared.livingDivers.clear(); shared.livingDivers = null; }   // AUDIT LW-II-2 D4 / H5: ...and the divers' - a company left holding below kept its door on the street's talk
    // G1: the guards drive + draw on the same flats' axis. WINFOE1
    // (2026-09-17, Mac: "enemies should still be able to do damage"): the
    // ENEMY pools no longer freeze under a window - a rest, the
    // inventory, a status box, a quest popup - only the civilians above
    // do (nobody walks away mid-talk); the player's own motor is what a
    // window holds. A rest can now be broken by a foe that walks up.
    // QUEST-POPUP-PAUSE: offline, a quest box on top holds them all.
    const foeDt = _questBoxHoldsFoes() ? 0 : dt;
    livePersonBatches.push(...cityGuards.update(foeDt,
      walkMode && shared.playerSpawned ? player.pos : cam.pos, cam.pos, _foeSenses()));
    standingWatch.frame();   // REP1: a guard who sees a known criminal stops them
    // X-slice: the encounter pool drives + draws beside the watch; this
    // is the EXTERIOR arm of the cadence loop (AUDIT 62 F11: the modal
    // modes ring the same function through the mode machine, above the
    // modal return, so no minute is ever banked for the door).
    // DW-D: SuppressVanillaWaterEncounters (DeepWaters.Update) - the deep has its own, so the vanilla roll stands down
    if (_deepSuppressesSpawns()) playerEntity.preventEnemySpawns = true;
    dungeonFindFrame(performance.now());   // TV6: an undiscovered dungeon within a kilometre is found
    bandFrame(performance.now(), dt);   // TV7: the bands - a chase, a contact (AUDIT OW5b B1: on the frame's own clock)
    handOverWalkedAway(performance.now());   // OW6: a foe I walk away from goes to the player beside it, never culled from under them
    const _pf = walkMode && shared.playerSpawned ? player.pos : cam.pos;
    if (!townTalk.overlayActive) runEncounterTick(_pf);
    wildFoesFrame(foeDt);   // WILD-ALERT: who in the wilderness has noticed a fast traveller - before the pools move
    const framePools = () => {   // PERF-V8
    if ((modes?.mode ?? 'exterior') === 'exterior') {
      if (_deckBodies.size) navalCarry();   // DECK-WALK: the bodies on a ship's deck carried by her - after the ships moved, before the foes do
      sifritFrame(foeDt, _pf);   // SIFRIT: her mummies and her bar (systems/sifrit/sifritFight.js) - before the foes move
      exteriorFoes.update(foeDt, _pf, cam.pos, _foeSenses());   // WINFOE1: a window no longer zeroes the foes' clock (QUEST-POPUP-PAUSE: offline, a quest box does)
      if (_deckBodies.size) navalLeash();   // DECK-WALK: the bodies on a ship's deck kept on it - after they moved, before they are drawn
      // TACT3 (bible/12-Enhanced-AI/Tactics-Arc.md; Mac's call: the classic lane too): the watch and the street's foes keep
      // apart from each other as each pool keeps its own, and none of them holds a building's doorway
      const _ownTact = (f) => spacingSkips(f) || f._ownFrom != null || _deckBodies.has(f);   // another player's foe is placed by its owner's frame; a deck's by her leash
      spaceAcross([cityGuards.guards, exteriorFoes.foes], collider, foeFrameDt(foeDt), _ownTact);
      if (cityGuards.guards.length || exteriorFoes.foes.length) clearDoorways([...cityGuards.guards, ...exteriorFoes.foes], _tactDoorSpots(_pf), collider, foeFrameDt(foeDt), _ownTact);   // AUDIT TACT C4: nobody to clear, no work
      navalCrewFrame(gamePaused() ? 0 : foeDt);   // LIVING CREW: the crews at their work on the decks near the eye - AUDIT NAV2 F53: held with the sea under a window
      livePersonBatches.push(...exteriorFoes.batches(), ...navalCrew.batches());
      if (shared.playerSpawned) _townWatchFrame(foeDt);   // DISC19-F: the town's answer to what the pools just did
      if (shared.playerSpawned) raidingPartiesFrame(gamePaused() ? 0 : foeDt);   // RAID1: the raids' Update - after the pools moved (a death counts on the frame it falls) and the watch answered, its clocks held by a pause (fix 7)
      markFoeReach([...cityGuards.guards, ...exteriorFoes.foes], { aboard: playerAfloat() && !(walkMode && shared.playerSpawned && player.isPlayerSwimming), seaY: tvSeaY() });   // WATER-FOES: aboard and dry, a foe in the water reaches no one - no enemy nearby (the pools, the watch and the raids done)
    }
    };
    framePools();
    droppedLoot.tickFlats(dt);   // FA1 slice 3
    livePersonBatches.push(...droppedLoot.batches());   // U8e: the ground piles
    // AUDIT 24 (wave 39): the blood splashes, on the same axis. Their
    try { shared.eliteDungeonFight?.frame(); } catch (e) { console.warn('[elite dungeon] frame', e?.message ?? e); }   // BUNNYFALL: outside, the elite dungeon's run let go
    // clock is REAL dt like every other one-shot, and it ENDS - a
    // finished splash frees its batch inside tick().
    hitEffects.tick(dt);
    hitEffects.bleedPlayer(townTalk.overlayActive ? 0 : dt, walkMode && shared.playerSpawned ? player.pos : cam.pos, playerEntity);   // BLOOD2e: the player's own blood, at the feet, on the same clock; BLOOD AUDIT 5: not under a window, and the host's own feet
    livePersonBatches.push(...hitEffects.batches());
    // HT1: the dropped torches burn, the thrown one flies, a burning foe's flame follows it (the transition sweep is at the mode branch above, AUDIT 66 F11)
    if (_mode() === 'exterior') { droppedTorches.tick(dt); livePersonBatches.push(...droppedTorches.batches()); camps.tick(dt); livePersonBatches.push(...camps.batches()); livePersonBatches.push(...navalFlames.batches()); }   // SURV3: the fires burn on the same axis; NAV-B: and a burning ship's
    portalGates.tick(_mode() === 'exterior' && walkMode && shared.playerSpawned ? player.feetAt() : null, { hold: portalHoldNow });   // PORTAL1: the portals run out, and a step in is an arrival - indoors nobody steps in
    if (_mode() === 'exterior') livePersonBatches.push(...portalGates.batches());   // PORTAL1: the vortexes on the flats' axis
    if (sigilBroker && _mode() === 'exterior') livePersonBatches.push(...sigilBroker.batches());
    if (_mode() === 'exterior') livePersonBatches.push(...cromwark.batches());   // BUNNYFALL: Nyx at the Guild camp   // SET7: the Broker on the flats' axis, as a foe stands
    if (shared.lefay && _mode() === 'exterior') livePersonBatches.push(...shared.lefay.batches());   // LEFAY1: the flowers laid at the monument, and the ones in flight
    if (shared.merchantYards && _mode() === 'exterior') livePersonBatches.push(...shared.merchantYards.batches());   // MERCHANT-YARDS: the keepers and the Stables' horses on the flats' axis
    portBatchesInto(livePersonBatches);   // SHIPYARDS: the port's people on the flats' axis
    if (shared.wardenShows && _mode() === 'exterior') livePersonBatches.push(...shared.wardenShows.batches());   // WARDEN1: the guard, and the horses it carries
    if (riteHost && _mode() === 'exterior') { riteHost.tick(dt); livePersonBatches.push(...riteHost.batches()); }   // WB12d: the braziers' flames and the faithful's fire
    // HCC: the horse billboards on the flats' axis (the runtime ticked above, hccTick - AUDIT HCC H1)
    if (hcc.enabled && _mode() === 'exterior') livePersonBatches.push(...hcc.batches());
    if (csaOn() && _mode() === 'exterior') pushSeenShipFlats(csa.batches(), livePersonBatches);   // CSA-B: the boats' crews and lanterns; SHIP-FLATS: none under a pixel
    foragingWait.tick();   // FORAGE4: online, a standing wait takes the slot when it is free, and writes its seconds left for the save
    // PERF-CROWD (2026-09-19): and the live crowd is culled too. This list
    // is the townspeople, the city watch, the exterior foes, the ground
    // piles, the blow effects, the dropped torches and the camps - every
    // one of them submitted whatever the camera was looking at, which in a
    // town is most of the frame's billboards. Filtered IN PLACE, so the
    // cull costs no array of its own.
    if (cullOn && livePersonBatches.length) {
      let keep = 0;
      for (let i = 0; i < livePersonBatches.length; i++) {
        const b = livePersonBatches[i];
        if (!billboardOutside(b)) livePersonBatches[keep++] = b;
        else if (renderer.shadowReachBatch(b)) castBatches.push(b);   // SHADOW-REACH: a townsman just off screen still throws his shadow into it
      }
      livePersonBatches.length = keep;
    }
    navalCrew.drawBodies(canvas, proj, view, mwv.eye, foeDt);   // MWNPC10: the crews' hands on their decks
    cityGuards.drawBodies(canvas, proj, view, mwv.eye, foeDt);   // MWNPC6: and the watch's, the same way
    exteriorFoes.drawBodies(canvas, proj, view, mwv.eye, foeDt);   // MWNPC5c: the foes in their bodies - what batches() offered this frame, before the billboards draw (cast-only where a body stands)
    if (deepWaters && livePersonBatches.length) dwFlagColumnFlats(livePersonBatches);   // DW-F: the foes, the corpses and the piles in a carved sea take the column's share
    renderer.holdBlended(livePersonBatches);   // GRASS-PORTAL (FIELD BUGS 2026-10-12b): the blended flats write no depth - drawn after the grass (drawHeld)
    if (livePersonBatches.length) renderer.drawBillboards(livePersonBatches, camRight, bbUp);
    // a POI's mounted weapons, armor, and trophies (scenes/poiFlats.js), drawn on the decal pass after billboards and
    // the live crowd: the decal pass writes no depth, so any billboard drawn after a mount would cover it even when
    // behind it
    shared.poiHost?.drawMounts(renderer);
    if (castBatches.length) renderer.recordShadowBillboards(castBatches, camRight, UP_Y);   // SHADOW-REACH: the flats the view cull rejected, for the maps alone (the wind is the frame's, set above)
    if (deepWaters) drawDeepWatersSurfaces(now);   // DW-C: the sea's surface - the mod's Transparent queue, after every opaque thing and every cut-out flat
    if (shared.oceanHoles) drawOceanHolesTransparent();   // OH-C: the blue hole's core over it (3001), then the miasma (3002)
    csaDrawParticlesBlended();   // CSA-F: the oars' and rudders' drops (the Transparent queue)
    if (shared.naval?.enabled) navalRender.draw(shared.naval.drawFrame());   // NAV-B: the smoke, the spray, the balls in flight and the aim's arcs and zone, over the sea's top
    if (shared._serpentDraw) { try { serpentRenderer()?.drawSea(shared._serpentDraw); } catch (e) { console.warn('[serpent] marks', e?.message ?? e); } }   // SERPENT1: its telegraphs, the maelstrom and the venom, over the sea's top
    portGlows();   // SHIPYARDS: the lighthouses' lamps and their turning beams, added light over the sea's top
    cannonSmoke();   // BUNNYFALL: the Great Cannon's flash and smoke
    navalHud(dt);   // NAV-F: the helm's readout
    _fr.foeDt = foeDt;
    _fr.castBatches = null;
  }
  return { framePeoplePhase };
}
