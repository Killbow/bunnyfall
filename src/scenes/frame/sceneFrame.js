// The frame's scene phases: the gate and harbor pools, the renderer's frame open, the pixel walk
// that fills the batches, the far ring and the water, and the billboard draws.
import { aabbOutside } from '../../render/frustum.js';
import { adoptLight } from '../../render/lightId.js';
import { advanceRotor, MILL_SOUND, millSoundPosition, mountRotor, ROTOR_HUB } from '../../world/windmills.js';
import { audio } from '../../audio/audio.js';
import { capFadeColors, fillLanternPool, nearestLights } from '../../world/cityLights.js';
import { CROMWARK_ON } from '../../world/wild/cromwark.js';
import { clearCrimeOnLocationExit } from '../../justice/court.js';
import { discoverBuilding } from '../../maps/discovery.js';
import { drawableBlows } from '../../ai/foeBlows.js';
import { farFlatVisibleAt } from '../../world/flatDistance.js';
import { fieldOfView } from '../../ui/viewSettings.js';
import { figureLook, personActor } from '../../characters/peopleBodies.js';
import { floraSwayOn } from '../../weather/windDrive.js';
import { getBazaarGothwayHost } from '../bazaarBetwixtRoom.js';
import { getBuildingVariant } from '../../world/worldDataVariants.js';
import { glassFov } from '../../ui/spyglassView.js';
import { holidayTextPrimesFor } from '../../world/holidays.js';
import { hubArrivalLine, hubAtMapId } from '../../world/regionHubs.js';
import { identity, multiply, UP_Y } from '../../world/mat4.js';
import { inEtherLaw } from '../../world/ethericSea.js';
import { livingWorldOn } from '../../systems/livingWorld/livingSwitch.js';
import { LOCATION_TYPES } from '../../formats/mapsFile.js';
import { MAP_HEIGHT, MAP_WIDTH } from '../../formats/woodsFile.js';
import { meterFor } from '../../render/perfMeter.js';
import { mwViewDrawBody, mwViewDrawWagon, mwViewHorseRig } from '../../player/mwView.js';
import { offerDecorFigures } from '../../homes/decorRoom.js';
import { playerEntity } from '../../characters/playerEntity.js';
import { playerTorchLight } from '../../player/playerTorch.js';
import { realWindowsMode } from '../../render/realWindows.js';
import { RING_HAZE_HOLD } from '../../render/farRing.js';
import { rrEnabled } from '../../mods/rrInstall.js';
import { rrMasterArmorerDiscovery } from '../../mods/rrQuestLine.js';
import { seatArrivalLine } from '../../net/townSeatLaw.js';
import { SKY_CLEAR, WORLD_FRAME } from '../../render/renderer.js';
import { spherePlanes } from '../../render/bounds.js';
import { sunDirection } from '../../world/worldClock.js';
import { tacticsNow } from '../../ai/tactics.js';
import { techniqueMarksNow } from '../../combat/techniques.js';
import { frame as warmAshesFrame } from '../../systems/naval/warmAshesShips.js';
import { waterUniforms } from '../../render/waterSurface.js';
import { wildZoneKind } from '../../world/wildZone.js';
import { withPlayerLights } from '../../magic/magicCandle.js';
import { timeScale as worldTimeScale } from '../../world/timeScale.js';
import { worldViewportRect } from '../../ui/hudLarge.js';
import { yardLampRows } from '../../homes/homeYards.js';

/** @param {any} shared */
export function createSceneFrame(shared) {
  const {
    _camRight, _canvasSize, _csaFill, _fr, _holidayText, _lightT, _mode, _musicInLocationRect, _musicLocationType, _pixelOrder,
    _planes, _pv, _ringOrigin, _sceneLights, _tvDngModel, _waterRows, _wodFill, _wodLitCount, _wodSelect,
    _wodSetLights, _yardRows, ambience, arenaBouts, beginDeepWatersFrame, billboardOutside, bloodMarks, built, cam,
    camps, canvas, CITY_LIGHT_COLOR_F32, climbFeel, crewAshoreTick, cromwark, csa, csaDrawParticlesOpaque,
    csaDrawWaves, csaOn, csaPoolFrame, cullOn, deepWaters, drawDeepWatersDecorations, drawDeepWatersFish,
    drawDeepWatersFloors, drawDeepWatersLoot, drawOceanHolesOpaque, drawPeerBodies, drawReachFires, drawTvDungeonModels,
    droppedTorches, dropTvDungeonModels, dwClipLast, dwDecor, dwFish, dwLoot, dwRender, ecoDraw, etherSea, exteriorFoes, farRing,
    festivalStage, gamePaused, gatePool, harbourBook, hcc, jungle, ketch, landform, lightsOnAt, magic, maps, modes,
    npcMarks, offerCrews, offerStreetPerson, onlineHomes, onlineOn, params, peerGrow, peerTorchLights, player, portBodies,
    portFrame, portLightsInto, presenceFrame, reachBlight, reachEvents, regionHubs, renderer, revealMemberGuildHalls, revenantAshoreTick,
    riteHost, sdHost, seaGroundArchive, seatBook, seatEdicts, seatHere, serpentRenderer, sigilBroker, sky, snowCover,
    snowfall, snowOutside, spyglass, standingHorses, standingHorsesFrame, starfall, state, stillAt, stirRipples,
    streetLook, streetMarkCtx, streetPeople, syncTopics, tamrielLand, topicTree, townEcon, townTalk, trees, tvSeaY,
    walkMode, warmGateVeil, waterOn, wod, worldLightAnimator, yardCull, yardFigureCtx, yards,
  } = shared;
  function framePoolsPhase(now, dt) {
    const { minute } = _fr;

    meterFor(renderer.gl)?.markCpu('pools');   // PERF-SIM2: the gates, the Broker, the rite, the harbours, the camps, the quays, the monument
    // WB2: the gate stood for this frame - before the lights (its fire lights the ground) and the world pass (its stone)
    try { if (gatePool?.frame(dt)) warmGateVeil(); } catch (e) { console.warn('[gate] pool', e?.message ?? e); }   // AUDIT WB D5: a gate stands - the step's veil is built ahead
    if (gatePool || sdHost) presenceFrame();   // SD19: the banner and the card - the gate's, else a Hollow's door's
    try { sigilBroker?.frame(dt); } catch (e) { console.warn('[broker] pool', e?.message ?? e); }   // SET7: the Broker stands where the clock stands her - BROKER-CAGE: in her cage at the faithful's circle
    try { riteHost?.frame(); } catch (e) { console.warn('[rite] host', e?.message ?? e); }   // WB12d: the faithful's circle, before the lights (its braziers light the ground)
    const inReach = CROMWARK_ON && wildZoneKind() === 'wroth';
    reachBlight.frame(dt, shared.playerSpawned ? player.feetAt() : null, inReach,
      !params.has('nofoes') && !shared._loading && !shared._teleporting && _mode() === 'exterior' && !gamePaused() && playerEntity.health > 0);
    reachEvents.frame();
    if (_mode() === 'exterior') starfall?.frame();   // STAR4-STAR6: the night's stars, before the lights (a stone's glow, a landing's flash) - its own catch
    try { if (_mode() === 'exterior' && !shared._loading) harbourBook.step(now / 1000); } catch (e) { console.warn('[harbours] book', e?.message ?? e); }   // HARBOUR-BOOK: the port near the player sounded, before its quays stand
    if (_mode() === 'exterior') camps.ride(dt);   // DECK-CAMP: the camps on a boat's deck posed off her - after she moved, before the lights (a fire's) and the world pass
    try { shared.quays?.frame(); } catch (e) { console.warn('[quays] pool', e?.message ?? e); }   // QUAYS: the harbours' quays stood or taken down, before the lights (their lanterns) and the world pass
    try { shared.lefay?.frame(); } catch (e) { console.warn('[lefay] monument', e?.message ?? e); }   // LEFAY1: the monument stood where Privateer's Hold is built, its flowers in flight and laid
    try { shared.poiEditor?.frame(); shared.poiHost?.frame(); } catch (e) { console.warn('[poi] host', e?.message ?? e); }   // POI-3: the editor's drafts laid over the feed first   // POI-2: the approved POIs on the built pixels - stood, placed, collided; the feed asked each minute
    try { shared.merchantYards?.frame(); } catch (e) { console.warn('[yards] the yards', e?.message ?? e); }   // MERCHANT-YARDS: each town's Stable and Wagon Yard stood where it is built
    portFrame();   // SHIPYARDS: each port town's shipyard and lighthouse stood where it is built, before the lights (its lamp)
    shared.witches?.frame();   // WITCH1: the town underfoot's Hearth Offerings stood, before the lights (their lanterns)
    // Lanterns on 17:00-08:00, flickering verbatim; pixel-local lights
    // placed under the current compensation, nearest 16 to the camera.
    // WOD2: the mod's lights burn at every hour and each carries its own
    // colour, so a frame while any built pixel holds one takes the per-light colour
    // channel: the lanterns and the player's own lights keep the shared
    // colour they always had, the mod's take theirs. With none built
    // both branches below make the calls they always made.
    meterFor(renderer.gl)?.markCpu('lamps');   // PERF-SIM2: the lanterns pooled and the nearest picked
    const wodLit = wod ? _wodLitCount() : 0;   // AUDIT BRANCH (WoD) n: with the mod off, no walk of the built pixels at all
    const csaLit = csaOn() ? csa.lights(cam.pos) : [];   // AUDIT PRE-MERGE 0928 R2: the boats' lit lanterns are scene lights - in the selection below with the street's, never the player's extras
    // QUAYS: the quays' lanterns, in the lanterns' hours, scene lights beside the boats' in the town lanterns' colour -
    // AUDIT HOLDINGS Q3: never the player's extras, which are never cut and pushed the street's nearest out of the cap
    if (lightsOnAt(minute)) for (const l of shared.quays?.lights() ?? []) csaLit.push(adoptLight({ x: l.x, y: l.y, z: l.z, range: l.range, color: CITY_LIGHT_COLOR_F32 }, l));   // LIGHT-ID: the quay's lantern's own
    shared.poiHost?.lights(csaLit);   // POI-2: a POI's own lights, its colour each, ranked with the street's (a flickering one stepped)
    // SHIPYARDS: the lighthouses' lamps and the shipyards' office lanterns, in the lanterns' hours (the pool's own `lit`) -
    // scene lights beside the quays', in the town lanterns' colour
    if (shared.portHost && lightsOnAt(minute)) portLightsInto(csaLit);
    try { getBazaarGothwayHost(shared)?.poolsFrame(now, csaLit); } catch (e) { console.warn('[bazaar] pool', e?.message ?? e); }
    const frameLanterns = () => {   // PERF-V8
    if (lightsOnAt(minute)) {
      worldLightAnimator.tick(dt);
      // YARD-LIGHT: the yards' lamps - the town's own (homeYards.js yardLampOf: an outdoor lamp is the town's) - scene lights beside
      // the quays', never the player's extras; in the lanterns' hours and colour, each on the town's flicker at its slot (AUDIT
      // YARD-LIGHT L3: after the tick, as the street reads it) at its own reach, rows refilled in place (L4: PERF-LIGHTS' law)
      if (yards) yardLampRows(yards.lamps(), _yardRows, worldLightAnimator.ranges, CITY_LIGHT_COLOR_F32, csaLit);
      // PERF-LIGHTS (2026-09-19): THE LANTERNS ARE A POOL, NOT A FRESH
      // LIST. This built an array and an object PER LANTERN every frame -
      // a town at night is hundreds of them, and the pixel translation
      // minted a triple per pixel beside them - all of it thrown away the
      // moment nearestLights had picked its sixteen. The objects are
      // refilled in place now and the count rides into the selector, so a
      // night frame allocates nothing here at all. The selection, its
      // order and its ties are untouched.
      // LA-LIGHTS1 (2026-09-27, Mac: "look for flickering issues"): EACH LANTERN FLICKERS ON ITS OWN ANIMATOR SLOT,
      // named by its pixel and its place in the pixel's list - not by its place in the pool. The pool is refilled in
      // `built`'s order, and a pixel streamed out shifted every lantern after it onto another lantern's range: each
      // jumped up to 1.8 of its 18 at once (the animator's whole band, four of its 0.4 steps) - a pulse through half
      // the town's lamps at every stream-out of a walk.
      // LA-AUDIT F2: the fill is cityLights.js's fillLanternPool, where its pin runs it
      const _pool = fillLanternPool(built.values(), (p) => state.pixelTranslation(p.px, p.py, _lightT), _sceneLights, shared._litRanges, worldLightAnimator.ranges, festivalStage ? festivalStage.lanterns : null);   // FESTIVAL-STAGE: and a Festival town's lanterns
      const n = _pool.n;
      shared._litRanges = _pool.ranges;
      const wodSel = wodLit || csaLit.length ? _wodSelect(n, _csaFill(wodLit ? _wodFill(n) : n, csaLit)) : null;   // WOD2: the lanterns and the mod's lights, one selection; AUDIT PRE-MERGE 0928 R2: and the boats' lanterns
      // LA-LIGHTS2: on the lane, one lantern past the cap - the first one it leaves out is where the others' fade ends
      const _lanterns = wodSel ? null : nearestLights(_sceneLights, cam.pos, renderer.maxPointLights + (renderer.lightingLane ? 1 : 0), shared._litRanges, null, 0, n);
      // DW-D: UnderwaterPresentationEffects.SuppressPlayerTorch - EnablePlayerTorch's light dark under the fog (the fuel burns on, the light is the only thing it takes)
      meterFor(renderer.gl)?.markCpu('lightset');   // PERF-SIM3: the hand lights, the peers' torches, the camps' fires added, the set handed to the renderer
      const lit = withPlayerLights(wodSel ? wodSel.data : _lanterns,   // EL1: the installed set's cap (16 classic, 48 on the lane); PERF-LIGHTS: `n` is how much of the pool is live
        magic?.candleLight(), shared._dwFogP?.under ? null : playerTorchLight(playerEntity, player.feetAt(), cam.yaw), ...(shared.naval?.enabled ? shared.naval.lights() : []), ...peerTorchLights(), ...(gatePool?.lights() ?? []), ...(riteHost?.lights() ?? []), ...(starfall?.lights() ?? []), ...camps.lights(), ...droppedTorches.lights(), ...(shared.farmingMode?.lights() ?? []));   // PEERLIGHT1: the others' torches, right after my own hand lights   // X11 candle; T1 torch; HT1 the dropped lights; FIELD-GUN13 the muzzle flash; DISC13-A the hand lights ride the render feet (feetAt), as the camera does; NAV-B the broadsides' flashes and the burning decks beside the Thunderlock's own flash - the brightest things for a frame, cut last by the cap
      if (wodSel) _wodSetLights(lit, wodSel);
      else renderer.setPointLights(lit, CITY_LIGHT_COLOR_F32, renderer.lightingLane ? capFadeColors(lit, lit.length / 4 - _lanterns.length / 4, cam.pos, renderer.maxPointLights, CITY_LIGHT_COLOR_F32) : null);   // LA-LIGHTS2
    } else {
      // X11: the candle burns by day too - StartLight has no time gate
      // (the lantern one is DaggerfallLight's, not the effect's), and
      // this branch used to send the renderer an empty array, so a
      // daylight Light cast would have lit nothing at all.
      // WOD2: ...and the mod's lights, which burn at every hour.
      const wodSel = wodLit || csaLit.length ? _wodSelect(0, _csaFill(wodLit ? _wodFill(0) : 0, csaLit)) : null;   // AUDIT PRE-MERGE 0928 R2: the boats' lanterns by day too (DungeonLightHandler lights them near)
      const lit = withPlayerLights(wodSel ? wodSel.data : new Float32Array(0),
        magic?.candleLight(), shared._dwFogP?.under ? null : playerTorchLight(playerEntity, player.feetAt(), cam.yaw), ...(shared.naval?.enabled ? shared.naval.lights() : []), ...peerTorchLights(), ...(gatePool?.lights() ?? []), ...(riteHost?.lights() ?? []), ...(starfall?.lights() ?? []), ...camps.lights(), ...droppedTorches.lights());   // PEERLIGHT1: the others' torches, right after my own hand lights   // HT1; FIELD-GUN13 the muzzle flash; DISC13-A the hand lights ride the render feet (feetAt), as the camera does; NAV-B the flashes by day too
      if (wodSel) _wodSetLights(lit, wodSel);
      else renderer.setPointLights(lit, CITY_LIGHT_COLOR_F32);
    }
    };
    frameLanterns();
    meterFor(renderer.gl)?.markCpu('sails');   // PERF-SIM3: Come Sail Away's boats - the sails, the lanterns, the peers' boats
    csaPoolFrame(dt);   // CSA-B/C: the sails' FixDeformations (LateUpdate) and the lanterns' two behaviours, on Time.deltaTime; the lights they decide reach the next frame's list (the mod's own Update and LateUpdate ran after the motor: csaUpdate)
    meterFor(renderer.gl)?.markCpu('boats');   // PERF-SIM2: the ashes, the crews, the wagon, the viewport
    warmAshesFrame(gamePaused() ? 0 : dt * worldTimeScale());   // WA1: TransportToShipWithDelay's WaitForSeconds, held by a pause, scaled with the world
    crewAshoreTick();   // CREW-COMPANIONS: the party stood on the street
    revenantAshoreTick();   // REVENANT-COMPANION: and the sworn
    renderer.setClearColor(SKY_CLEAR);   // INCIDENT 2026-09-04 / REVIEW 2026-09-05: this frame is the EXTERIOR's (the mode frames returned above and clear black in worldModes) - CameraClearManager.cs:51-57
    renderer.setFlashLight(sky.lightningLight() ?? shared.boltFrame.flash ?? starfall?.flash() ?? null);   // STAR4: else a star's landing   // DS1: Dynamic Skies' LightningFlash, composed first on the point-light channel just stored; BOLT: else a near ground strike's own light, from where it struck
    renderer.setWorldViewport(worldViewportRect(_canvasSize().w, _canvasSize().h));   // E5: ViewportChanger.Update, every frame
  }
  function frameOpenPhase(now, dt) {
    const { tvf, mwv, proj, tvFace, view, minute } = _fr;
    meterFor(renderer.gl)?.markCpu('begin');   // PERF-SIM1: the renderer's frame open
    renderer.beginFrame(proj, view, sunDirection(minute), WORLD_FRAME);   // AUDIT-EL F5: a WORLD frame - the lane replays its records for this one
    meterFor(renderer.gl)?.markCpu('bodies');   // PERF-ZONE2: the Morrowind bodies - the player's, every peer's - the wagon and the camps, which the renderer's own 'world' mark used to swallow
    if (deepWaters) { shared._dwNowMs = now; beginDeepWatersFrame(minute); }   // DW-C: the look and the distance fog - a frame's, so after the clear of both
    renderer.beginCharacterSpriteBatch?.();
    const frameBodies = () => {   // PERF-V8
    try {
      renderer.setCloudShadow(sky?.cloudShadow ?? null);   // VC4: the frame's deck, for the body and everything before the pixel loop
      mwViewDrawBody(canvas, { proj, view, eye: mwv.eye, feet: player.bodyFeetAt(), yaw: player.bodyYawFor(cam.yaw), viewYaw: cam.yaw, face: tvFace ?? shared.farmingMode?.face });   // DISC18: the body at the capsule's own feet, not the camera's smoothed ones
      drawPeerBodies(proj, view, mwv.eye, tvf ? tvFace : null);   // MWBODY1: the others' bodies, the same pass; OW-PEERS: grown under the Overworld
      // COATS3D: the 3D horses (the Morrowind lane's) - Horse Cart and Cargo's, mine and the peers', and the road's teams
      hcc.draw3d(canvas, { eye: mwv.eye, proj, view, up: tvFace?.up ?? null });
      if (shared.livingRoads && livingWorldOn() && _mode() === 'exterior') shared.livingRoads.drawTeams3d(canvas, { eye: mwv.eye, proj, view, up: tvFace?.up ?? null });
    } finally { renderer.flushCharacterSpriteBatch?.(); }   // MWNPC2: every body's picture in one bind of the sprite target
    };
    frameBodies();   // MW-D24: the player's own body, in third person only - and the others', and the 3D horses (COATS3D); PERF-V8: its try a closure's own
    mwViewDrawWagon(renderer, null, yardCull);   // EOTB-IL: the cart, when the transport is the cart; PERF-WAGON: by the street's view test
    riteHost?.draw(renderer, null, mwv.eye);   // WB12d: the faithful's circle and their tents - AUDIT WB12d (G6): its sigil from near the eye alone
    sigilBroker?.draw(renderer);   // BROKER-CAGE: the Sigil Broker's cage beside it, and its door
    cromwark.draw(renderer);   // BUNNYFALL: the Adventurers' Guild's tent at the reach's edge
    shared.mines?.draw(renderer);   // BUNNYFALL (2026-11-26, caverns): the mines' entrances, the owner's model
    getBazaarGothwayHost(shared)?.drawOpaque(now);
    starfall?.draw(renderer);   // STAR4: the craters and their stones
    gatePool?.draw(renderer);   // WB2: the Oblivion Gate's stone
    ketch?.drawSky(renderer);   // KETCH: the Sky-Ketch over Daggerfall, and her anchor-lift let down to the fields
    camps.draw(renderer, null, yardCull);   // SURV3: the tents, the cart's own pass; PERF-WAGON: by the street's view test
    hcc.draw(renderer, null, tvf ? { selfGrow: tvf.grow, grow: peerGrow } : undefined, yardCull);   // PERF-TEAMS: each wagon culled as the town's own models are; HCC: the trailing / parked / following wagon and its cargo, mine and the peers' (the horses ride the flats' pass); WAGON-HITCH x OW-BIG: a cart's wagon grown with its rider under the Overworld
    if (tvf) drawTvDungeonModels(shared.travelView?.eye ?? null, tvf.fullyUp, tvf.blend);   // OW-DUNGEONS: each dungeon's own model, grown under the Overworld; TV-BURST: loaded once the view is up, one a frame; OW-DUNGEON-SIZE: to its one height as the view rises
    else if (_tvDngModel.size) dropTvDungeonModels();   // TV-BURST: the view down, its models let go (kept warm on their shelf)
    if (shared.livingRoads && livingWorldOn() && _mode() === 'exterior') shared.livingRoads.drawTeams(renderer, yardCull);   // LW10: the living world's wagons, in the cart's own pass; PERF-WAGON: by the street's view test
    shared._livingHideoutsHost?.draw(renderer, null, yardCull);   // LW12: a band's tents; PERF-WAGON: by the street's view test
    shared.bountyFarms?.draw(renderer);   // BOUNTY-FARM: a held farm bounty's farmstead
    shared.quays?.draw(renderer);   // QUAYS: the harbours' quays and the gangways to my ships made fast
    yards?.draw(renderer);   // HOME-YARD: the pieces outside the town's homes, and the one being placed
    shared.lefay?.draw(renderer);   // LEFAY1: the monument to Julian LeFay
    shared.merchantYards?.draw(renderer, yardCull);   // MERCHANT-YARDS: the yards' timber and the Wagon Yards' wagons on show; PERF-YARD (AUDIT 15): the street's view test
    shared.poiHost?.draw(renderer, yardCull);   // POI-2: the approved POIs' opaque parts, by the street's view test
    shared.portHost?.draw(renderer, yardCull);   // SHIPYARDS: the shipyards' timber and the lighthouses' stone, by the street's view test as the yards are
    if (_mode() === 'exterior') shared.wardenShows?.draw(renderer);   // WARDEN1: a wagon on a guard's shoulders, or in the air
    if (csaOn()) csa.draw(renderer);   // CSA-B: the boats - the hulls, the classic models their helpers stand, the baked sails
    // SERPENT1: the sea serpent's body with the opaque world, before the sea's top (its humps break it, the rest shows
    // dark through it); its frame made once here, its sea's marks drawn from it after the sea
    shared._serpentDraw = null;
    if (shared.serpentHost && (modes?.mode ?? 'exterior') === 'exterior') { try { shared._serpentDraw = shared.serpentHost.drawFrame(); if (shared._serpentDraw) serpentRenderer()?.drawBody(shared._serpentDraw); } catch (e) { console.warn('[serpent] draw', e?.message ?? e); shared._serpentDraw = null; } }   // the renderer marks its own foreign pass

    // WM2b: read the eased wind ONCE a frame, not once a mill.
    const windNow = sky.wind();
    renderer.setWindowRooms(realWindowsMode());   // RW1 (render/realWindows.js): this frame's rooms behind the town's glass - a frame's, asked after its beginFrame; and the street as it stands, kept for a building's view out
    // GHOST1 (2026-09-19): NORMALISED, because `_planes` now serves TWO
    // tests. EV3's `aabbOutside` only reads the sign of `a*px+b*py+c*pz+d`
    // and dividing all four coefficients by a positive length cannot
    // change a sign, so every box test below is bit-for-bit the decision
    // it was. `billboardOutside` is the one that needs it: `sphereInPlanes`
    // compares that dot product against `-r`, and that is only a distance
    // against a radius when the normal is a unit vector. Unnormalised, the
    // radius counted for 1/|n| of what it should and a flat still on
    // screen was culled - the sprites popping as the camera turned, and
    // the campfires that left only their bloom behind. Six square roots a
    // frame.
    if (cullOn) spherePlanes(multiply(proj, view, _pv), _planes);   // EV3 (GHOST1: normalised - the sphere test shares these)
    _fr.windNow = windNow;
  }
  function frameBatchesPhase(now, dt) {
    const { worldAspect, tvf, mwv, proj, view, windNow } = _fr;
    meterFor(renderer.gl)?.markCpu('batches');   // PERF-CPU: the pixel walk that fills allBatches, culling as it goes
    const allBatches = [];
    if (_mode() === 'exterior') drawReachFires(allBatches);
    // SHADOW-REACH (2026-09-23, Mac: "Can you tackle the 2 limitations"): THE CASTERS THE VIEW CULL REJECTS. Every
    // gate below (the pixel's, a model's, a flat batch's, a townsman's) asks the renderer whether what it just
    // rejected would cast into this frame's shadow maps - a sun cascade's frustum, which reaches 600 units
    // toward the light, or a lantern's range - and RECORDS it for the maps without drawing it. Before this a tree
    // behind the camera cast no sun shadow into the view, a wall just off screen cast none from the lantern beside
    // it, and SC1's caches churned as the camera turned. The flats collect here and are recorded after the
    // crowd's draw, on the same wind.
    const castBatches = [];
    const groundQueue = [];   // GROUND-LAST: the visible pixels whose ground is drawn AFTER every opaque mesh of every pixel (near first, by the walk's order)
    // PERF-ON2 (2026-09-19, Mac: "Online mode needs further performance
    // improvements", with a readout showing 51 fps, script 23.3 ms and
    // 1365 draws): THE OTHERS ARE CULLED LIKE EVERYTHING ELSE IS.
    //
    // Every world flat two lines below gets a frustum test against its
    // own box before it is submitted (EV3). The peers did not: a peer
    // behind the camera, or one at the far edge of the relay's range -
    // RANGE_PIXELS is 3 map pixels, which is nearly 2,500 units - was a
    // draw, two texture binds and its uniforms, every frame, whatever
    // the camera was looking at. Measured with PERF-ON's own recording
    // Proxy (tools/onlinePerfProbe.mjs): 6.3 GL calls a peer a frame,
    // 1 draw and 2 texture binds of it, and nothing capped it but the
    // number of people in the room. PERF-ON passed over this in a line
    // - "a peer's doll is one billboard batch created once, with only
    // its `origin` written afterwards" - which is true of the batch's
    // CREATION and says nothing about its per-frame DRAW.
    //
    // THE BOX IS THE SHADER'S OWN. The billboard VS places a quad at
    // `uOrigin + uRight * (aCorner.x * uSize.x) + uUp * ((aCorner.y +
    // 0.5) * uSize.y)`: bottom-anchored, so it stands from the origin
    // up by its height, and it turns to face the eye, so it can reach
    // half its WIDTH in any horizontal direction. A peer's batch is one
    // placement at [0,0,0] with the position on `origin`, so the box is
    // that, in world space, with no pixel translation to add.
    //
    // A culled peer casts no shadow while it is off screen - which is
    // exactly what the world's own flats have done since EV3, since the
    // shadow pass reads the list this builds. AUDIT REACH: unless a shadow
    // reaches him - then he goes to the casters' list, as every other flat.
    if (shared.remotePlayers) for (const b of shared.remotePlayers.batches()) {   // ONLINE1: the others, at their feet
      if (cullOn && billboardOutside(b)) { if (renderer.shadowReachBatch(b)) castBatches.push(b); continue; }   // AUDIT REACH
      allBatches.push(b);
    }
    if (shared.peerRiders) for (const b of shared.peerRiders.batches()) { if (cullOn && billboardOutside(b)) { if (renderer.shadowReachBatch(b)) castBatches.push(b); continue; } allBatches.push(b); }   // RIDE: the others in the saddle; AUDIT FLICKER R3: off screen, a shadow still in reach
    if (shared.peerWalkers) for (const b of shared.peerWalkers.batches()) { if (cullOn && billboardOutside(b)) { if (renderer.shadowReachBatch(b)) castBatches.push(b); continue; } allBatches.push(b); }   // DISC23-B: and on foot, as they chose; AUDIT FLICKER R3: off screen, a shadow still in reach
    if (shared.bandSprites) for (const b of shared.bandSprites.batches()) { if (cullOn && billboardOutside(b)) { if (renderer.shadowReachBatch(b)) castBatches.push(b); continue; } allBatches.push(b); }   // OW-FOES: the bands near, as their monsters; AUDIT FLICKER R3: off screen, a shadow still in reach
    if (shared.siegeNpcs) for (const b of shared.siegeNpcs.batches()) allBatches.push(b);   // SEAT2b part two (c): the guards, the rebels
    for (const b of arenaBouts.batches()) { if (cullOn && billboardOutside(b)) continue; allBatches.push(b); }   // ARENA2: the crowd in the colosseum's tiers, and what it throws (no shadow: a crowd of hundreds would fill the casters)
    if (yards) for (const b of yards.batches()) { if (cullOn && billboardOutside(b)) { if (renderer.shadowReachBatch(b)) castBatches.push(b); continue; } allBatches.push(b); }   // HOME-YARD: the yards' flats, and the one being placed; AUDIT FLICKER R3: off screen, a shadow still in reach
    // a POI's flat pictures (scenes/poiFlats.js), culled as the yards' flats are (off screen, a batch still casts its
    // shadow when in reach)
    if (shared.poiHost) for (const b of shared.poiHost.batches()) { if (cullOn && billboardOutside(b)) { if (renderer.shadowReachBatch(b)) castBatches.push(b); continue; } allBatches.push(b); }
    // NEAR-FIRST (2026-09-21): THE PIXELS ARE WALKED NEAREST FIRST. The
    // map's insertion order is the order the pixels streamed in, which
    // is nothing to do with where the eye is - so a far town's walls
    // were shaded in full and then hidden behind the near street's. With
    // the ground already drawn last (GROUND-LAST), walking the meshes
    // near to far is the rest of the same law: whatever is nearest goes
    // into the depth buffer first, and everything behind it fails the
    // test before its shader runs. The order is the pixel's grid
    // distance from the player's own pixel - a hundred-odd integers,
    // sorted into a scratch array kept across frames, no allocation.
    const _peopleOn = streetPeople.frame();   // MWNPC8b
    npcMarks.begin();   // NPC-MARKS: the street's candidates, gathered as its people are offered
    standingHorses.begin(tvf ? null : mwViewHorseRig(), mwv.eye);   // STAND-HORSE: the standing horses' frame - the lane's rig (none under the travel view)
    _pixelOrder.length = 0;
    for (const p of built.values()) { p._dist2 = (p.px - state.current.x) ** 2 + (p.py - state.current.y) ** 2; _pixelOrder.push(p); }
    _pixelOrder.sort((a, b) => a._dist2 - b._dist2);
    const framePixelWalk = () => {   // PERF-V8
    for (const p of _pixelOrder) {
      // EV2: the pixel's frame matrix caches on the built entry and
      // refreshes only when its translation actually changes (a
      // recenter - not per frame), and each model's world matrix
      // caches beside it: `trs` + `multiply` here minted two fresh
      // Float32Array(16)s PER MODEL PER FRAME, the render loop's
      // second-largest GC source after drawMesh's string keys.
      const t = state.pixelTranslation(p.px, p.py, p._t || (p._t = [0, 0, 0]));
      let pixelMatrix = p._pixelMatrix;
      if (!pixelMatrix) pixelMatrix = p._pixelMatrix = identity();
      if (pixelMatrix[12] !== t[0] || pixelMatrix[13] !== t[1] || pixelMatrix[14] !== t[2]) {
        pixelMatrix[12] = t[0]; pixelMatrix[13] = t[1]; pixelMatrix[14] = t[2];
        p._worldGen = (p._worldGen | 0) + 1;   // every cached model matrix refreshes
      }
      // EV3: the pixel gate - one p-vertex test against the build-time
      // bounds skips the terrain draw, every model and every flat batch
      // of a pixel wholly off-screen; a visible pixel then tests each
      // model and batch against its own build-time box. SIMULATION never
      // gates: the rotor's angle, the mill's hum and the flats' clocks
      // all run for a pixel behind the camera.
      const pixelVisible = !cullOn || !(aabbOutside(_planes, p._box, t[0], t[1], t[2]) || jungle?.hides(p._box, t));   // BANTHA1: and a pixel the jungle's haze hides whole
      p._visible = pixelVisible;   // WATER1: the water pass below walks the same verdict
      const pixelCasts = !pixelVisible && renderer.shadowReach(p._box, t[0], t[1], t[2]);   // SHADOW-REACH: off screen, but in a shadow's reach
      if (pixelVisible) {
        // EE5: the ground shadows under the SKY'S OWN deck - one field for the
        // cloud and for the shadow it casts. Null when there is no enhanced
        // sky, which is the classic skin and every interior.
        renderer.setCloudShadow(sky?.cloudShadow ?? null);
        // GROUND-LAST (2026-09-21): THE GROUND IS DRAWN AFTER THE MESHES,
        // not before them. It was the first thing in every pixel, so every
        // ground fragment under every building, tree and wall was shaded
        // in full - the tile fetch, the filter, the lights, the cloud
        // shadow, the lane's terms - and then painted over. Drawn last, a
        // fragment under a mesh fails the depth test before its shader
        // runs, on every GPU made this century. The ground covers more of
        // an outdoor screen than any other pass and in a town a large
        // share of it is under something; that share costs nothing now.
        // Queued here, drawn once the pixel walk is done, so a pixel's
        // ground also sits under the NEXT pixel's buildings - and the
        // terrain program is bound once a frame instead of twice a pixel
        // (FAR-CLIP1: and its clip variant once more, after it).
        groundQueue.push(p);
        if (p.staticBatch) renderer.drawMesh(p.staticBatch, pixelMatrix, null);   // PERF4: every static model of the pixel, one call per texture (the keys are resolved in the merge)
        for (const m of p.models) {
          if (m._batched) continue;   // PERF4: drawn above
          const off = cullOn && aabbOutside(_planes, m._box, t[0], t[1], t[2]);
          if (off && !renderer.shadowReach(m._box, t[0], t[1], t[2])) continue;   // SHADOW-REACH: off screen AND out of every shadow's reach
          if (m._worldGen !== p._worldGen || !m._world) {
            m._world = multiply(pixelMatrix, m.local, m._world || new Float32Array(16));
            m._worldGen = p._worldGen | 0;
          }
          if (off) renderer.recordShadowMesh(m.gpu, m._world, m.texRemap ?? p.texRemap);   // SHADOW-REACH: for the maps alone; HOME-LOOK: a painted home's own table
          else renderer.drawMesh(m.gpu, m._world, m.texRemap ?? p.texRemap);
        }
      } else if (pixelCasts) {
        // SHADOW-REACH: the whole pixel is off screen but inside a shadow's reach - its ground, its merged statics
        // and its odd models go to the maps and nowhere else
        if (!p.deepWaters?.hide) renderer.recordShadowTerrain(p.dwTerrain ?? p.terrain, pixelMatrix, snowCover.arrayOf(p.groundArchive), p.tilemapTex, 6.4);   // DW-C: a pure-ocean pixel's ground is not drawn; a clipped one casts its index set (FAR-CLIP1: the clip whole at stride 1 - the depth program reads no tilemap)
        if (p.staticBatch) renderer.recordShadowMesh(p.staticBatch, pixelMatrix, null);
        for (const m of p.models) {
          if (m._batched || !renderer.shadowReach(m._box, t[0], t[1], t[2])) continue;
          if (m._worldGen !== p._worldGen || !m._world) {
            m._world = multiply(pixelMatrix, m.local, m._world || new Float32Array(16));
            m._worldGen = p._worldGen | 0;
          }
          renderer.recordShadowMesh(m.gpu, m._world, m.texRemap ?? p.texRemap);   // HOME-LOOK
        }
      }
      // WM2b: THE SAILS, on the same eased wind vector the cloud deck
      // overhead is drawn with - so a storm picks the mills up on the
      // same ease curve (WEATHER_EASE_MINUTES) it picks the sky up on. A null row is
      // "no wind is known" (the classic sky eases nothing), and a mill
      // then stands still rather than guessing at one.
      if (shared.millParts && windNow) {
        for (const w of p.windmills) {
          advanceRotor(w.state, dt, windNow);
          if (pixelVisible) renderer.drawMesh(shared.millParts.rotor, mountRotor(multiply(pixelMatrix, w.local), ROTOR_HUB, w.state.angle), p.texRemap);
          else if (pixelCasts) renderer.recordShadowMesh(shared.millParts.rotor, mountRotor(multiply(pixelMatrix, w.local), ROTOR_HUB, w.state.angle), p.texRemap);   // SHADOW-REACH: the sail's shadow sweeps in from off screen
        }
      }
      // WM4c: THE HUM - see exterior.js. Here the source MOVES every
      // frame, because the floating origin shifts the pixel under it
      // and the listener is set in the shifted frame (audio.setListener
      // above takes cam.pos): a source left at the numbers it started
      // with would drift away from its mill on every origin shift.
      if (shared.millParts) {
        for (const w of p.windmills) {
          const at = millSoundPosition(multiply(pixelMatrix, w.local));
          if (!w.hum) w.hum = audio.loop3d(MILL_SOUND.clip, at, MILL_SOUND.volume, MILL_SOUND);
          else w.hum.move(at);
        }
      }
      // FA1: the flats that move. The animator is PER PIXEL because
      // the batches are - a pixel evicted takes its clocks with it -
      // so the tick rides the same walk that collects the batches.
      p.flatAnims.tick(dt);
      // MAC1 (Mac: "fps outside ... all the billboards in the distance
      // ESPECIALLY ALL THE SMALL ONES not being culled out"). Every
      // (archive, record) of every streamed pixel was a draw call
      // however far the pixel stood - the small plants of 49 pixels
      // most of all. The rule is world/flatDistance.js's: the two
      // nearest rings draw everything, the far rings the trees and the
      // flats that move, and nothing else. Facing costs nothing here (a
      // uniform per pass), so a far flat that draws still turns.
      const ring = Math.max(Math.abs(p.px - state.current.x), Math.abs(p.py - state.current.y));
      // AUDIT REACH: a pixel neither seen nor reached has nothing to walk (the first cut asked the far-flat rule, an
      // object a batch, of every batch of every streamed pixel); the rule runs inside the pixel's gate, asked of every batch of
      // a pixel seen or in a shadow's reach (PERF-ORDER: ahead of each batch's own box, the cheaper test first)
      if (pixelVisible || pixelCasts) for (const b of p.batches) {
        if (!farFlatVisibleAt(ring, b.farH ?? b.size?.h ?? 0, b.frame != null)) continue;   // MAC1 (a far flat the rule drops casts nothing either); PERF-EXT12: positional, no object a batch a frame (flatDistance.js); PERF-ORDER (2026-10-11): asked FIRST - three compares, where the box and the reach were asked of every batch it then dropped (Knightstale by night: 655 of the 1,361 a frame); each test only skips, so the batches kept are the same
        const off = !pixelVisible || (cullOn && aabbOutside(_planes, b._box, t[0], t[1], t[2]));   // EV3
        if (off && !renderer.shadowReach(b._box, t[0], t[1], t[2])) continue;   // SHADOW-REACH: off screen and out of every shadow's reach
        b.origin = t;
        (off ? castBatches : allBatches).push(b);   // SHADOW-REACH: the maps alone, or the frame
      }
      // MWNPC8b: the street's standing people offered their bodies - the near rings' alone (a billboard's cast-only is
      // read at the draw, so after the walk does as well as before it)
      if (p.npcs) for (const pn of p.npcs) {
        if (!pn.standBatch) continue;
        const look = _peopleOn && ring <= 1 ? streetLook(pn) : null;
        if (!look) { pn.standBatch.castOnly = false; continue; }
        const f = pn._mwFeet ??= [0, 0, 0];
        f[0] = pn.x + t[0]; f[1] = pn.y + t[1]; f[2] = pn.z + t[2];
        streetPeople.offer(personActor(pn, look, f, mwv.eye, dt), pn.standBatch);
        npcMarks.consider(pn, streetMarkCtx);   // NPC-MARKS
      }
      // STAND-FLAT / STAND-HORSE (Morrowind-NPCs.md section 28): the near rings' town horses offered their 3D horse, and
      // the people no StaticNPC holds their bodies, read as a placed figure is (MWNPC18's figureLook) - every other
      // ring's keep their billboards (a horse let go draws its own again)
      if (p.standFlats && ring <= 1) for (const sf of p.standFlats) {
        if (sf.kind === 'horse') {
          sf.feet[0] = sf.x + t[0]; sf.feet[1] = sf.y + t[1]; sf.feet[2] = sf.z + t[2];
          standingHorses.offer(sf, sf.feet, sf.yaw, sf.look, sf.batch, sf.seed);
          continue;
        }
        const look = _peopleOn ? figureLook(sf, yardFigureCtx) : null;
        if (!look) { sf.batch.castOnly = false; continue; }
        const f = sf._mwFeet ??= [0, 0, 0];
        f[0] = sf.x + t[0]; f[1] = sf.y + t[1]; f[2] = sf.z + t[2];
        streetPeople.offer(personActor(sf, look, f, mwv.eye, dt), sf.batch);
      }
      else if (p.standFlats) for (const sf of p.standFlats) if (sf.kind === 'person') sf.batch.castOnly = false;
    }
    };
    framePixelWalk();
    if (yards && _mode() === 'exterior') offerDecorFigures(yards.figures(), streetPeople, _peopleOn, yardFigureCtx, mwv.eye, townTalk.overlayActive ? 0 : dt);   // MWNPC18: the figures an owner set down in a yard, standing people too (their flats ride the yards' batches)
    portBodies(mwv.eye, dt);   // SHIPYARDS: the shipmasters, crewmasters, sailors, shipwrights and lightkeepers, standing people as the yards' keepers are
    offerCrews(mwv.eye, townTalk.overlayActive ? 0 : dt, _peopleOn);   // STAND-FLAT: the boats' crews, standing people (their flats ride livePersonBatches)
    if (shared.merchantYards && _mode() === 'exterior') shared.merchantYards.offerBodies(offerStreetPerson, mwv.eye, townTalk.overlayActive ? 0 : dt);   // AUDIT MW-NPC II P1: the Stables' and the Wagon Yards' keepers, standing people (their flats ride livePersonBatches)
    streetPeople.draw(canvas, proj, view, mwv.eye, townTalk.overlayActive ? 0 : dt);   // MWNPC8b: the standing people's bodies - before the flats draw
    standingHorsesFrame(canvas, proj, view, mwv.eye, dt);   // STAND-HORSE: the standing horses in 3D, their billboards drawing nothing - before the flats draw
    shared.siegeNpcs?.drawBodies(canvas, proj, view, mwv.eye, dt);   // MWNPC10: and the siege's fighters' (their batches ride the flats)
    // SNOWFALL1 (AUDIT ENVIRONS G7): THE SNOW BEFORE THE GROUND UNDER IT - GROUND-LAST's own law a layer up: an opaque
    // surface over the ground (SNOW_LAYER keeps it over whichever is drawn first), so a ground fragment under the snow
    // fails the depth test before its shader runs, and the picture is the same. By the ground's own program, the
    // frame's lights and its deck; its blanket's tiles culled to the frustum (G6: each a renderer of its own in the
    // mod, culled by its bounds); never under the travel view (its eye is the traveller's, its tiers the walker's).
    renderer.setCloudShadow(sky?.cloudShadow ?? null);
    if (!tvf) snowfall.draw(cullOn ? snowOutside : null);
    // GROUND-LAST: the ground of every visible pixel, after every opaque
    // mesh of every pixel (see the queue above). Before the sky, the ring,
    // the water and the flats, as it always was: the water reads its depth
    // and the flats are cut-outs blended over it.
    renderer.setCloudShadow(sky?.cloudShadow ?? null);
    if (deepWaters) groundQueue.sort(dwClipLast);   // FAR-CLIP1: the cap's pixels last - one swap to the clip program a frame
    for (const p of groundQueue) {
      if (p.deepWaters?.hide) continue;   // DW-C: DeepWaterTerrainCapRenderer.Apply - a pure-ocean pixel's drawHeightmap = false
      const pixelMatrix = p._pixelMatrix;
      renderer.drawTerrain(p.dwTerrain ?? p.terrain, pixelMatrix,   // DW-C: what the cap clipped whole is out of the index set (the cull)
        snowCover.arrayOf(p.groundArchive), p.tilemapTex, 6.4, !!p._dwBytes, ecoDraw(p), snowCover.drawOf(p));   // FAR-CLIP1: and the rest of its clip is the clip program's - DeepWaterTerrainCapRenderer.ApplyWaterTexelClip's material, per terrain it patched; ECOTONE1: a border pixel's neighbours' sets
    }
    if (deepWaters) drawDeepWatersFloors(groundQueue);   // DW-C: the seafloor, opaque, under the ground's holes (the sky's foreign span, below, covers it)
    if (shared.oceanHoles) drawOceanHolesOpaque(groundQueue);   // OH-C: the pit's black and the surface's underside, with the floors
    if (dwDecor) drawDeepWatersDecorations(groundQueue);   // DW-E2: the decorations, cut-out (the AlphaTest queue), on the floors they stand on
    if (dwFish) drawDeepWatersFish();   // DW-E3: the fish - the same material, their own facing (FaceY) and cut-out (0.1)
    if (dwLoot) drawDeepWatersLoot();   // DW-E5: the sunken piles - the same material, a DaggerfallBillboard's facing, the billboard's cut-out (0.5)
    // CSA-F: Come Sail Away's waves along the coasts - opaque, cut out and dithered. FIELD BUGS 2026-09-30b (TV-SURF):
    // never under the travel view - from 150-450 m up a breaker strip is its whole plan, a pixel-aligned half-tone sheet
    // on open water and low shore (the screenshot's light-blue rectangles); the surf waits for the traveller's eye, as
    // the grass does
    if (!tvf) csaDrawWaves();
    csaDrawParticlesOpaque();   // CSA-F: its wakes, splashes and flags
    const _bbYaw = tvf ? tvf.yaw : cam.yaw;   // TV1: the flats face the view's eye
    _camRight[0] = Math.cos(_bbYaw); _camRight[1] = 0; _camRight[2] = -Math.sin(_bbYaw);
    const bbUp = tvf ? tvf.up : UP_Y;   // TV1: leaned back toward the raised eye (player/travelCamera.js leanedUp); the shadows keep UP_Y
    const camRight = _camRight;   // EV2: one scratch, refilled - not three allocations a frame
    // PERF2 (2026-09-11, RookieG via Mac: "its like 45fps on the outside"):
    // THE SKY IS DRAWN AFTER THE GROUND. It used to open the frame -
    // every pixel shaded by the dome's stars, moons, decks and the
    // clouds' composite, then most of them painted over by the terrain.
    // The three sky passes and the ring now sit AT the far plane and
    // depth-test LEQUAL with the mask off: they shade only the pixels
    // nothing nearer has claimed, and write no depth, so everything
    // blended after them (the water, the flats, the rain, the grass)
    // composes exactly as it did. The ring keeps its "the streamed
    // world repaints everything nearer" law by depth instead of by order
    // (AUDIT FAR-SEA1 P1: the pass's depthRange(1, 1), not a written
    // gl_FragDepth, which ran its shader before the test for every pixel
    // the streamed world covered). Same picture, a third to a half fewer
    // sky fragments on an open road.
    sky.draw(tvf ? tvf.yaw : cam.yaw, tvf ? tvf.pitch : (shared.farmingMode?.pitch ?? cam.pitch) + climbFeel.pitch(), glassFov(fieldOfView() + climbFeel.fovRad(), spyglass.lens), worldAspect, renderer.worldViewportPx ?? [0, 0, renderer.gl.drawingBufferWidth, renderer.gl.drawingBufferHeight]);   // VC3: the clouds' map restores this rect
    _fr.allBatches = allBatches;
    _fr.castBatches = castBatches;
    _fr.bbUp = bbUp;
    _fr.camRight = camRight;
  }
  function frameRingPhase(now, dt) {
    const { worldAspect, view, fx, fogNow, fogColor, windNow } = _fr;
    meterFor(renderer.gl)?.markCpu('ring');   // PERF-ZONE2: the far province ring (its rebuild and its hole) and the water, after the sky hands the frame back
    // EV8: the far province ring - the horizon's actual mountains,
    // drawn while the depth buffer is still the sky's (the streamed
    // world repaints everything nearer). Skipped when exp fog owns
    // the air (rain, snow, heavy fog); its light state is the frame's
    // own, already installed by setLighting/beginFrame above. It
    // shares the EV6 seam mark below - one foreign span, two passes.
    const waterSkyNow = waterOn ? sky.waterSky() : null;   // FAR-SEA1: the sky the water reflects, once a frame - the ring's sea and the water's (AUDIT FAR-SEA1 H2: none with the Enhanced water off - the sea is Daggerfall's tile, and the ring's sea keeps the ground's look beside it)
    const seaYNow = farRing ? tvSeaY() : 0;   // FAR-SEA1: the sea's surface in the scene this frame
    const frameRing = () => {   // PERF-V8
    if (farRing && fogNow.mode === 'linear') {
      if (farRing.needsRebuild(state.current.x, state.current.y)) {
        farRing.build({
          heightBytes: shared.woods.heightMapBuffer, mapWidth: MAP_WIDTH, mapHeight: MAP_HEIGHT,
          climateAt: (x, y) => maps.getClimateIndex(x, y),
          baseX: state.current.x, baseY: state.current.y,
          relief: !!landform,   // LANDFORM1: the ring stands the massifs the streamed ground raises
          byteAt: tamrielLand || etherSea ? (x, y) => shared.woods.getHeightMapValue(x, y) : null,   // TAMRIEL2: the continent past the map's edge, as the stream grows it (ETHER-SEA: and the Eltheric Ocean's isles)
          pastOwn: tamrielLand ? null : inEtherLaw,   // AUDIT CAPTAIN'S SEA G6: the ground the reader answers past the map - its cliffs faded at their own pixels (the clamp's at the clamped)
          // ETHER-SEA: the isles' own climates past the map - AUDIT CAPTAIN'S SEA G4/G9: the continent's wherever it stands (its
          // tint never the sea's switch's), the sea's in its law, and else the Bay edge's clamped climate as ever (the read
          // past the map answers -1 there, and the clamped mountains and deserts past the edge turned woodland green)
          climatePast: tamrielLand ? (x, y) => maps.getClimateIndex(x, y)
            : etherSea ? (x, y) => maps.getClimateIndex(...(inEtherLaw(x, y) ? [x, y] : [Math.max(0, Math.min(MAP_WIDTH - 1, x)), Math.max(0, Math.min(MAP_HEIGHT - 1, y))])) : null,
        }, state.current.x, state.current.y, state.terrainDistance, built);   // OW-HORIZON: a pixel not yet built is the ring's
      } else {
        farRing.punchHole(state.current.x, state.current.y, state.terrainDistance, built);
      }
      farRing.draw(view, {
        origin: state.pixelTranslation(farRing.baseX, farRing.baseY, _ringOrigin),
        lightDir: renderer._lightDir, ambient: renderer._ambient,
        sunScale: renderer._sunScale * sky.farSunFactor(), sunColor: renderer._sunColor,   // VC4: the ring stands outside the shadow map - a cover-derived dim
        // AUDIT EV F-R4: the same moon the streamed terrain takes -
        // without it a full-Masser night stepped in brightness at the
        // exact boundary the hole machinery works to hide
        moonDir: renderer._moonDir, moonScale: renderer._moonScale, moonColor: renderer._moonColor,
        fogColor, fogStart: fogNow.start ?? 0, fogEnd: fogNow.end, exposure: renderer.exposure, adaptTex: renderer.adaptTexture, haze: renderer._haze, hazeEye: jungle?.eye,   // EL1; EL4: the eye; BANTHA1: the jungle's haze over the ring
        // E5: the ring draws INTO the world pass's rect, so it takes
        // that pass's aspect - a horizon built on the full-canvas ratio
        // would step against the terrain in front of it under a docked bar.
        fovY: glassFov(fieldOfView() + climbFeel.fovRad(), spyglass.lens), aspect: worldAspect,   // CLIMB4: the lens the world took (SPYGLASS: the glass's)
        // FAR-SEA1: the ring's sea under the water's sky; AUDIT FAR-SEA1: the eye and the world's lens it counts the sea
        // inside the hole from (P1: only the cells that can be past the far plane, none with the eye under the sea),
        // and the water's own body - the camera climate's tiles and Iliac Puddle No More's tint over its open sea (L1)
        skyZenith: waterSkyNow?.zenith, skyHorizon: waterSkyNow?.horizon, eye: renderer._camPos, worldProj: renderer._proj,
        seaTiles: waterSkyNow ? snowCover.arrayOf(seaGroundArchive()) : null, seaTint: shared._dwFrame && !shared._dwFrame.underwater ? shared._dwFrame.look.topColor : null,
      });
      // FAR-SEA1: and the streamed sea meets it at the ring's haze - with a sky to reflect: under the classic panorama
      // the water reflects WATER1's default day, which the fog had hidden past its end and the hold would show at night
      if (waterSkyNow) renderer.setSeaHaze(RING_HAZE_HOLD, seaYNow);
    }
    };
    frameRing();
    if (deepWaters) dwRender.drawSkyFog();   // DW-C: the distance fog over the sky's pixels (and the ring's), before anything blends over them - a no-op while it is off
    renderer.markForeignPass();   // EV6: the sky (and EV8's ring) changed programs behind the shadows' back
    // WATER1: THE WATER, after every pixel's opaque ground and models and
    // before the first flat - so the surface blends over the land it lies
    // on and every sprite, missile, drop and the arms draw over it. One
    // uniform set a frame: the clock, the eased wind (the same vector the
    // cloud deck and the mills take; null = calm), the front's rain, and
    // the dome's own two colours to reflect.
    const frameWater = () => {   // PERF-V8
    if (waterOn) {
      stirRipples(dt, now);   // WATER-NEXT 4
      const wu = shared._waterU = waterUniforms({ seconds: now / 1000, wind: windNow, rain: fx.rain ?? (shared.precipMode === 'rain' || shared.precipMode === 'storm' ? fx.intensity : 0), sky: waterSkyNow });   // WATER-NEXT 2: the sea's draw takes the frame's too; FAR-SEA1: the sky read once
      let n = 0;   // PERF-EXT13: collected, then ONE call - the frame's block once, not once a pixel (renderer.js)
      for (const p of built.values()) {
        if (!p._visible || !p.water || p.deepWaters?.hide) continue;   // DW-C: a hidden cap takes its water with it
        const row = _waterRows[n++] ??= [null, null, null, null, null];
        row[0] = p.water; row[1] = p._pixelMatrix; row[2] = snowCover.arrayOf(p.groundArchive); row[3] = p.tilemapTex; row[4] = snowCover.drawOf(p);
      }
      renderer.drawWaterSurfaces(_waterRows, n, 6.4, wu);
      for (let i = 0; i < n; i++) _waterRows[i].fill(null);   // a scratch keeps no evicted pixel's surface alive
    }
    };
    frameWater();
  }
  function frameFlatsPhase(now, dt) {
    const { wd, windClock, windfallLaw, allBatches, bbUp, camRight, proj, view } = _fr;
    meterFor(renderer.gl)?.markCpu('flats');   // PERF-CPU: submitting the billboards - the draws themselves, from JS. ABOVE setFlatWind, not between it and the draw: WIND3 pins the two as ADJACENT, and the wind is part of this phase anyway.
    yards?.drawDecals(renderer);   // HOME-YARD: the lot's marked edge while a piece is placed
    shared.farmingMode?.draw(proj, view, camRight, bbUp);
    renderer.drawFoeTelegraphs?.(drawableBlows(tacticsNow(), walkMode && shared.playerSpawned ? player.pos : cam.pos));
    renderer.drawFoeTelegraphs?.(exteriorFoes.cromwarkMarks());
    if (_mode() === 'exterior') renderer.drawFoeTelegraphs?.(reachBlight.marks());   // TACT4: a foe's wind-up on the ground, under the bodies
    renderer.drawFoeTelegraphs?.(techniqueMarksNow());   // TECH1: and the player's own marks, after the foes' (bible/05-Combat/Weapon-Techniques.md)
    bloodMarks.draw(camRight, UP_Y);   // BLOOD1a: the marks go down BEFORE the billboards, so a body standing in its own blood is over it and not under it. ABOVE setFlatWind for the reason its own neighbour gives: WIND3 pins the wind and the draw as ADJACENT.
    trees.frame(_pixelOrder, cam.pos, cullOn ? _planes : null);   // LPT1 / BANTHA1: the near 3D trees, both doors', for the flats' call below (AFTER the gibs' call above, which would spend them)
    renderer.setFlatWind(floraSwayOn() && wd.on ? [wd.windV[0], wd.windV[1], windClock, wd.gust] : null, floraSwayOn() && wd.on ? windfallLaw : null);   // WIND3: the flats lean with the one wind; the flora batches carry their share (sway); WINDFALL1: by the mod's law while it is on
    renderer.drawBillboards(allBatches, camRight, bbUp);
    if (magic.batches().length) renderer.drawBillboards(magic.batches(), camRight, bbUp);   // M2: spell missiles
    magic.drawFx?.();   // IMPACTFX: the spells' landings in light, over their flashes
    // T2 towns: every built populated pixel runs its own pool
    // (PopulationManager is per-location); the pool sees the player in
    // the pixel's LOCATION frame, and live persons draw through the
    // current translation on the flats' axis (the billboard-axis
    // doctrine). The politeness gate is the law both exterior hosts
    // share (mobilePerson.personWantsToStop); this host hands its
    // AreEnemiesNearby() term BOTH live pools, the city watch and the
    // encounter foes.
    syncTopics();   // T3d: the Where-is directory follows the location pixel
    // F062: PlayerGPS.PlayerLocationRectCheck's transition pair
    // (:674-716), played by the host frame loop AFTER syncTopics so
    // _musicLoc is current - the no-location bail branch (:674-685)
    // reads as the thunk answering false. Edge-triggered: the exit
    // event fires ONCE, and PlayerEntity's handler clears the crime
    // (PlayerEntity.cs:2449-2453).
    const frameLocationRect = () => {   // PERF-V8
    {
      const _inRect = _musicInLocationRect();
      if (shared._wasInLocationRect && !_inRect) clearCrimeOnLocationExit(playerEntity);
      // AUDIT 26 F089: the SAME two events arm the graveyard ambient
      // layer - OnEnterLocationRect sets IsCemeteryNearby when the
      // location is a Graveyard and the player is outside (:518-529),
      // OnExitLocationRect clears it (:531-534). The layer then ticks
      // its own 1-80s counter beside the ordinary wilderness one.
      if (_inRect && !shared._wasInLocationRect) {
        // AUDIT-TO1 B3: PlayerGPS.OnEnterLocationRect (TravelOptionsMod.cs
        // :381, handler :431-436) - LocationPause "entered"
        shared.travelOptions?.onEnterLocationRect(shared._musicLoc ? { name: shared._musicLoc.name, mapId: shared._musicLoc.mapTableData?.mapId, locationType: shared._musicLoc.mapTableData?.locationType } : null);
        ambience.setCemeteryNearby(_musicLocationType() === LOCATION_TYPES.Graveyard);
        // AUDIT 63 F9: and the SAME entry event is what a Thieves Guild
        // or Dark Brotherhood member's RegisterEvents subscribes to
        // (ThievesGuild.cs:197-206, handler :227-229), so the hall
        // reveal follows the member into every town.
        revealMemberGuildHalls({ witness: onlineOn });   // CHAP2a: and the town's halls witnessed, online
        townEcon.witness(shared._musicLoc?.mapTableData?.mapId);   // TOWN-ECON TE2: and the town itself, for the registry (online alone - the host builds no book offline)
        // HUB1: walking into a region's hub says so, online - "Daggerfall, capital of the Kingdom of Daggerfall."
        // SEAT1a (Seats-Arc 3.3): a seat town says its Charter instead - "Anticlere. Its Charter is unheld." - and this
        // client, standing in it, reports the seat it derived (once a day; net/townSeatBook.js witness)
        if (onlineOn) {
          const mapId = shared._musicLoc?.mapTableData?.mapId;
          const arrive = () => {
            if (!stillAt(mapId)) return;
            const seat = seatHere(mapId);
            const hub = hubAtMapId(regionHubs, mapId);
            if (seat) { townTalk.say(seatArrivalLine(seat), 5); seatBook.witness(seat); }
            else if (hub) townTalk.say(hubArrivalLine(hub), 5);
            if (seat) seatEdicts.arrived(seat);   // SEAT1d: the town's news after its line (Unrest, the Edict), a Festival's buff
          };
          // AUDIT-SEATS C4: the arrival waits on the seats' read - asked here un-awaited, the first seat town of a session
          // (a save loaded inside one) read a book not yet open and was no seat: no Charter, no witness, no Edict's news,
          // no Festival. Said once the read answers, while the player still stands in that same town (stillAt).
          if (seatBook) seatBook.read().then(arrive, arrive); else Promise.resolve().then(arrive);
        }
        onlineHomes?.ensure(shared._musicLoc?.mapTableData?.mapId);   // HOME1: the town's homes asked for as I walk in - its doors' names and prices are ready before I reach one
        // RR3: RoleplayRealism.PlayerGPS_OnEnterLocationRect (:259-267) - the master armorer's shop discovered under its own name
        if (rrEnabled()) {
          const arm = rrMasterArmorerDiscovery(shared._musicLoc, getBuildingVariant);
          const armRec = arm ? (topicTree.listBuildings ?? []).find((b) => b.buildingKey === arm.buildingKey) : null;
          if (arm && armRec) discoverBuilding(`${shared._musicLoc.regionIndex}:${shared._musicLoc.name}`, armRec, arm.name);   // AUDIT-RR F36: DiscoverBuilding returns when GetBaseBuildingDiscoveryData fails (PlayerGPS.cs:932-933) - no phantom record
        }
        // AUDIT 64 F10: the THIRD law on this edge - PlayerEnterExit
        // .PlayerGPS_OnEnterLocationRect primes the holiday text
        // (:1404-1409), but only on its TOWN arm (:1382-1383), so a
        // dungeon, a graveyard, a coven or a mooring primes nothing;
        // the whole handler is under `!isPlayerInside` (:1362), which
        // is this branch of the frame loop.
        if (holidayTextPrimesFor(_musicLocationType())) _holidayText.enterLocationRect(shared._musicLoc);
      } else if (!_inRect) {
        ambience.setCemeteryNearby(false);
      }
      shared._wasInLocationRect = _inRect;
    }
    };
    frameLocationRect();
    _fr.allBatches = null;
  }
  return { frameBatchesPhase, frameFlatsPhase, frameOpenPhase, framePoolsPhase, frameRingPhase };
}
