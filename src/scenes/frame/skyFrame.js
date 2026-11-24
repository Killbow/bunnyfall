// The frame's view, weather, and sky phases: the projection and cameras, the clock, season,
// weather, and wind, then the animals, the lightning, the sky, and the light settings.
import { audio } from '../../audio/audio.js';
import { betterAmbience } from '../../audio/betterAmbience.js';
import { blendTerms, fallTerms, soundWeather } from '../../weather/weatherFront.js';
import { cromwarkDesolateAt } from '../../world/wild/cromwarkTowns.js';
import { centreFromFeet } from '../../characters/enemyAnchor.js';
import {
  currentCloudBase, currentMapSystems, currentWeatherIntensity, currentWeatherRaw, currentWindApproach,
  sampleWeatherField, setHeardWeather, tickWeather, weatherArrivalStamp, weatherCrossingStamp, weatherJumpStamp,
} from '../../weather/weatherSim.js';
import { dateFromClassicMinutes, seasonValue } from '../../world/gameDate.js';
import { daylightFactor } from '../../world/deepWaterLook.js';
import {
  daylightScale, exteriorAmbient, INDIRECT_LIGHT_COLOR, INDIRECT_LIGHT_RANGE, indirectLightScale, isNight,
  SUN_RIG_COLOR, sunScale, windowStyleForTime,
} from '../../world/worldClock.js';
import { DeathScreen } from '../../ui/deathScreen.js';
import { DREAD_FLASH_COLOR, DREAD_KEY_DIM, dreadCloudGlow, dreadLight } from '../../world/dreadSky.js';
import { ETHER_KEY_TINT, etherLight, inEther } from '../../world/ethericSea.js';
import { fieldOfView } from '../../ui/viewSettings.js';
import { fogFactor } from '../../world/weather.js';
import { getFloat } from '../../platform/settings.js';
import { glassFov } from '../../ui/spyglassView.js';
import { gustClock, windDrive } from '../../weather/windDrive.js';
import { holdNpcBodies } from '../../characters/npcBodies.js';
import { horizonFog, horizonProj } from '../../travel/travelHorizon.js';
import { iilSyncLane } from '../../render/improvedInteriorLighting.js';
import { isEnhanced } from '../../ui/uiSkin.js';
import { largeHudWorldAspect, worldViewportRect } from '../../ui/hudLarge.js';
import { lookAt } from '../../world/mat4.js';
import { meterFor } from '../../render/perfMeter.js';
import { mwViewFrame, mwViewHoldChanged, mwViewTogglePerspective } from '../../player/mwView.js';
import { nativeFromField } from '../../weather/weatherField.js';
import { playerEntity } from '../../characters/playerEntity.js';
import { presetForExterior } from '../../audio/ambientEffects.js';
import { projectToScreen } from '../../player/tapRay.js';
import { riddenHorseLook } from '../../travel/horseCoats.js';
import { sdBrassLight } from '../../worldEvents/sdOmen.js';
import { SEASON } from '../../world/climateSwaps.js';
import { seaStormShown } from '../../systems/naval/seaVenturesHost.js';
import { SEATED_EYE_HEIGHT } from '../../player/seatPose.js';
import { setFlatLean } from '../../render/bounds.js';
import { skyMinutes, worldMinutes } from '../../world/worldTick.js';
import { sunbabyKey, sunbabyLight } from '../../world/sunbabySky.js';
import { THUNDER_SOURCE_M, thunderSourceAt } from '../../weather/distantStorms.js';
import { TRANSPORT_MODES } from '../../travel/transport.js';
import { windowEmissionRGB } from '../../render/windowEmission.js';
import { windSoundOn } from '../../weather/windAudio.js';
import { withMoonAmbient } from '../../render/enhancedSky.js';
import { timeScale as worldTimeScale } from '../../world/timeScale.js';

/** @param {any} shared */
export function createSkyFrame(shared) {
  const {
    _canvasSize, _dwEyeOffset, _fr, _gateStormC, _mode, _sdLate, _snowPixels, _wodLate, ambience, animalAmbience, applyWeather,
    atmosphere, built, cam, canvas, climateAt, climbFeel, collider, cromwark, csaCameraFilter, csaOn, csaRuntime,
    csaSeaReach, distantStorms, dread, dreadStorm, dwPlayer, dwPlaying, egWitnessEye, etherSea, eventPillar,
    FALL_LIGHT, fieldCellsHere, fieldXZ, gamePaused, gateOmen, gateSkyTranslate, gateStorm, hcc, hccActionPressed,
    hccTick, jungle, magic, mapGroundHere, maps, minuteNow, modes, params, peerGrow, player, playerTicker,
    playerTravelPixel, refreshHomeLooks, renderer, roadSweep, sdAirNow, sdHost, seasons, seaVentures, shownWeather, sky,
    snowBodies, snowCover, snowfall, snowNpcs, snowPlayer, soundscape, spyglass, spyglassStep, state, stormLights,
    sunbaby, sunbabyGround, sunbabyRain, sweepGateClear, sweepSdLate, sweepWodLate, tickCityGates,
    tickSeason, tickWodSpawners, touch, townTalk, tvBandSpritesStep, tvJourneyUp, walkMode, weatherFront,
    weatherOverride, weatherStale, weatherTerms, windAudio, windfall, yards,
  } = shared;
  function frameViewPhase(now, dt) {
    const { fwd } = _fr;

    meterFor(renderer.gl)?.markCpu('view');   // PERF-SIM1: the projection, the cameras (the Morrowind camera machine, the travel view, the helm)
    // ROAD-E E5: the DOCKED large HUD shrinks the world pass rather
    // than covering it (ViewportChanger.cs:56-62), and Unity derives a
    // camera's aspect from its viewport - so the lens takes the bar's
    // height out of its denominator here, and the sky, which draws
    // into the same rect, takes the same number.
    const worldAspect = largeHudWorldAspect(_canvasSize().w, _canvasSize().h);
    spyglassStep(dt);   // SPYGLASS: the glass raised or lowered, its lens eased - before the lens is taken
    // MW-D25: the eye goes through the Morrowind camera machine - in
    // first person it comes back untouched (camera.cpp:165-169), in
    // third it is the reference's focal-and-pull-back with this host's
    // collider standing in for the sphere cast.
    // TV1: under the travel view the sprite turns to the view's eye (`eyeOverride`: last frame's - a lag nobody sees)
    // VIEW-TOGGLE (Mac: "a force first person/third person toggle"): the other view, on the press edge of its action (the
    // mouse's forward side button by default) - under no window, and never mid-load (hccActionPressed's gate)
    // AUDIT HCC H1: LateUpdate - after the motor and the recentre, before the world pass draws the wagon. WAGONS3: and
    // before the camera, which sits on the bench of the wagon it just stood (`_driverSeat`)
    // WARDEN1: my wagon's stamp, the cell's throws of it, the offline clock, and the throws in flight - AUDIT WARDEN1 C11:
    // before the pool's step, so a team set down this frame is posed by it this frame (a landing's frame drew it horseless)
    try { if (!shared._loading) shared.wagonWarden?.tick(); if (_mode() === 'exterior') shared.wardenShows?.frame(cam.pos); } catch (e) { console.warn('[warden] the watch', e?.message ?? e); }
    hccTick(dt, now);
    // WAGONS3 (Mac: "sit on the wagon itself, the ledge its built for"): DRIVING FROM A BENCH - my seat where my wagon
    // is drawn this frame (scenes/horseCartPool.js driverSeat): the eye on it in first person, the body on it in third
    // (the capsule stays at the puller, where the mod's horse is - the team stands round it); never over a death's sink
    shared._driverSeat = walkMode && shared.playerSpawned && player.transportMode === TRANSPORT_MODES.Cart && !(townTalk.overlay instanceof DeathScreen) ? hcc.driverSeat() : null;
    if (shared._driverSeat) cam.pos = [shared._driverSeat.feet[0], shared._driverSeat.feet[1] + SEATED_EYE_HEIGHT, shared._driverSeat.feet[2]];
    if (hccActionPressed('TogglePerspective')) mwViewTogglePerspective();
    // FIELD BUGS 2026-09-29 (the sea) #3: AT A HELM the wheel zooms out to frame the hull sailed (player/seaZoom.js) and
    // the camera's casts pass her own buckets by - her masts, rails and deckhouses pinned it at the wheel and held the
    // zoom (camera.lua:153's no-op while pinned); the world and every other boat still pull it in
    const csaHelm = csaOn() && csaRuntime?.isSailing() ? csaRuntime.state.CurrentBoat : null;
    const camFilter = csaHelm ? csaCameraFilter(csaHelm) : null;
    const mwv0 = mwViewFrame({
      eyeOverride: shared.travelView?.eye ?? shared.farmingMode?.eye ?? null,
      fpEye: cam.pos, feet: player.feetAt(), yaw: cam.yaw, pitch: cam.pitch,
      dt, riding: !!player.riding && !shared._driverSeat && !(player.transportMode === TRANSPORT_MODES.Cart && hcc.benchKind()),   // AUDIT-EOTB F3/F4: the host's own clock, and the one state only it has; WAGONS3: the bench is no saddle (AUDIT WAGONS3 B2: on a frame with no seat either)
      horse: player.transportMode === TRANSPORT_MODES.Horse ? { look: riddenHorseLook(playerEntity.items ?? []), slow: player.slowRide } : null,   // COATS3D: on a horse (never the cart), the Morrowind body sits a 3D horse in this look; HORSE-WALK: held under the gallop on a slow ride
      ...(shared._driverSeat ? { seated: true, stopped: true, feet: shared._driverSeat.feet } : {}),   // WAGONS3: seated on it, still on it (the sprite plays no stride), the camera's feet the seat's (after `feet`: it wins)
      pivotFloor: shared._driverSeat ? hcc.cameraFloor() : null,   // BENCH-CAM: the third-person camera turns about a pivot over my wagon's roof, never in my head
      cart: player.transportMode === TRANSPORT_MODES.Cart, onExteriorPath: shared._surfPath,   // EOTB-IL: UpdateWagon's two host facts
      raycast: (o, d, m) => Math.min(collider.raycast(o, d, m, camFilter), hcc.cameraHit(o, d, m)),   // WAGONS3: my driven wagon's body a wall to the camera on its bench
      spherecast: (o, r, d, m) => { const h = Math.min(collider.sphereCast(o, r, d, m, camFilter).dist, hcc.cameraHit(o, d, m, r)); return Number.isFinite(h) ? h : null; },   // MAC-A: castSphere's seam beside the ray - the camera's two obstacle guards are sphere casts (camera.cpp:186, :200)
      seaReach: csaHelm ? csaSeaReach(csaHelm) : 0,   // #3
    });
    if (yards?.flying()) { const c = { pos: mwv0.eye }; yards.cameraOverride(c); mwv0.eye = c.pos; }
    if (shared.poiEditor?.active()) mwv0.eye = [cam.pos[0], cam.pos[1], cam.pos[2]];   // POI-3: the editor's eye is the frame's, never the body's   // HOME-YARD: the decorator's free eye, while a piece is placed outside (no travel view is up then)
    egWitnessEye(mwv0);   // EG-FULL: the witness's eye, behind a living companion
    // TV1: THE TRAVEL VIEW'S EYE, when it is up - risen out of the body's own camera (`ownEye`, the one the frame would
    // draw) and blended back into it on the way down. Every reader below that asks where the picture is taken from
    // reads `mwv.eye`; the fog and the sun's cascades measure from the traveller's head (renderer.setFocus - a frame's:
    // set every frame before beginFrame, which clears one no host set - AUDIT TV B1).
    // AUDIT DEEP T1-10: from the HEAD's eye when the hold took the body out of it (first person) - the rise began a few
    // metres off at the third-person camera, and the fall landed there before the head snapped back
    tvJourneyUp();   // OW-ONLY: a journey runs under the Overworld - the view rises once no window holds the screen
    const tvHeadEye = mwViewHoldChanged() ? cam.pos : (mwv0.ownEye ?? mwv0.eye);
    const tvf = shared.travelView?.frame(dt, { eye: tvHeadEye, fwd }) ?? null;
    const mwv = tvf ? { ...mwv0, eye: tvf.eye } : mwv0.ownEye ? { ...mwv0, eye: tvHeadEye } : mwv0;   // AUDIT TV B6: the frame the view came down in draws from the head, never from last frame's sky
    shared.farmingMode?.camera(mwv, dt, fwd);
    const viewFwd = tvf ? tvf.fwd : shared.farmingMode?.look ?? fwd;
    const proj = horizonProj(glassFov(fieldOfView() + climbFeel.fovRad(), spyglass.lens), worldAspect, spyglass.near, tvf);   // HANDEDNESS (mat4's law)   // CLIMB4: a leap's kick   // SPYGLASS: the glass's lens   // GLASS-CLEAR: and its focus (GLASS_NEAR_MIN, the eye's own 0.2, while it is down)   // OW-HORIZON: under the travel view the planes hold the whole grid from the raised eye (scenes/travelHorizon.js) - after the view's frame, which says how far up it stands
    // WAGONS3: MY BODY ON MY BENCH - drawn on it as the wagon is drawn (grown with the rig under the Overworld), facing the
    // way it is driven, at the rig's grow (player/motor.js drawFeet / drawYaw / drawGrow - WAGONS2's seat in another's
    // wagon is drawn the same way, its drawAt); the fixed-city host's twin is exterior.js's
    shared._driverBodySeat = shared._driverSeat ? (tvf ? hcc.driverDrawn('', { selfGrow: tvf.grow, grow: peerGrow }) ?? shared._driverSeat : shared._driverSeat) : null;
    if (shared._driverBodySeat) { player.drawFeet = shared._driverBodySeat.feet; player.drawYaw = shared._driverBodySeat.yaw; player.drawGrow = shared._driverBodySeat.g > 1 ? shared._driverBodySeat.g : null; }
    else player.drawYaw = null;
    const tvFace = tvf ? { yaw: tvf.yaw, up: tvf.up, grow: player.drawGrow ?? tvf.grow } : null;   // AUDIT DEEP R-2: the traveller's own sprite turns its quad to the travel view's eye; WAGONS3: seated in a rig, the rig's grow
    setFlatLean(tvf ? Math.hypot(tvf.up[0], tvf.up[2]) : 0);   // AUDIT DEEP R-7: the flats' cull spheres grown by the lean, before any cull
    renderer.setFocus(tvf ? cam.pos : null, !!tvf && tvf.blend >= 0.5);   // AUDIT DEEP2 D7: the cascades grow half way up, where the picture has
    // AUDIT NAV1 (the helm): THE BROADSIDE CAMERA - while a broadside is laid the eye eases out over that side, her ports,
    // the zone and the enemy on one screen, and home on the release (navalHost.js aimEye): the view, the look's ray
    // (_dwEyeOffset below) and every reader of `mwv.eye` from it - the frame's own object, the decor tool's precedent
    // (worldModes.js); never the travel view's
    if (shared.naval && !tvf) mwv.eye = shared.naval.aimEye(mwv.eye, dt);
    tvBandSpritesStep(dt, tvf, mwv.eye);   // OW-FOES: the bands near, as their monsters
    const view = betterAmbience.view(lookAt(mwv.eye, [mwv.eye[0] + viewFwd[0], mwv.eye[1] + viewFwd[1], mwv.eye[2] + viewFwd[2]], [0, 1, 0]));   // BA1: the shaker sits between the follower and the camera
    climbFeel.view(view, !tvf && !mwv.thirdPerson);   // CLIMB4: the climb's pitch, roll and eye - first person, never the travel view's
    // DW-E5 x TV1: under the travel view `mwv.eye` is the raised eye - the view never opens in the sea (travelViewAllowed)
    for (let i = 0; i < 3; i++) _dwEyeOffset[i] = mwv.eye[i] - cam.pos[i];   // DW-E5: the spawners' camera, as this frame placed it
    shared._lastProj = proj; shared._lastView = view;   // TI1: the tap ray unprojects through the frame the finger saw
    hcc.faceTeams(mwv.eye);   // WAGONS3: the team's billboards turned to the eye that draws them (the bench's, the third person's, the travel view's)
    shared.travelView?.drawHud();   // TV1: the readout over the view, through this frame's own matrices
    if (touch) {   // TI1: the lock-on dot over the foe's chest, hidden behind the camera
      const _dp = shared._lockChest ? projectToScreen(shared._lockChest, _canvasSize().w, _canvasSize().h, proj, view, worldViewportRect(_canvasSize().w, _canvasSize().h)) : null;
      touch.setLockDot(_dp && _dp.front ? _dp.x : null, _dp?.y);
    }
    holdNpcBodies(!!tvf);   // AUDIT MW-NPC II H2: UNDER THE OVERWORLD NO NPC BODY STANDS (C3's law, every lane's) - a figure a few pixels tall, drawn upright under the flats' lean
    _fr.worldAspect = worldAspect;
    _fr.tvf = tvf;
    _fr.mwv = mwv;
    _fr.viewFwd = viewFwd;
    _fr.proj = proj;
    _fr.tvFace = tvFace;
    _fr.view = view;
  }
  function frameWeatherPhase(now, dt) {
    const { fwd, tvf, viewFwd } = _fr;
    meterFor(renderer.gl)?.markCpu('weather');   // PERF-SIM1: the clock, the season, the sweeps, the weather front, the wind, the ambience
    // World clock (R5): sun, ambient, window style, sky frame by time.
    const minute = minuteNow();
    // A1: DaggerfallLocation.Update's season poll (:118-130), on the
    // exterior frame with the weather drain - the reference runs it in
    // the location's own Update, which is the same place.
    tickSeason();
    roadSweep.frame(shared.building);
    // A late region's pixels, also on a frame between builds.
    if (_wodLate.size && !shared.building) sweepWodLate();
    if (!shared.building) sweepGateClear();   // GATE-CLEAR: the gate the clock is about turned - its clearing in, the last one's rock back
    if (_sdLate.size && !shared.building) sweepSdLate();   // SD2b: the Hollow's pixel, the same way
    if (shared.seasonsActive) seasons.tick();   // SIB1: RefreshSeasonAfterLoad's second half, the frame after a load
    refreshHomeLooks();   // HOME-LOOK: a look landed or changed repaints the home where it stands
    // W1/S41: the DRAIN ticks on the exterior frame, which is
    // WeatherManager.Update's own shape - it returns while the player
    // is inside, so a sky rolled by a day spent indoors or underground
    // lands on the first frame back out. The ROLL is the entity tick's
    // day block, and runs wherever the player is. A pinned ?weather
    // never ticks.
    if (!weatherOverride) {
      const _pp = playerTravelPixel();
      const drained = tickWeather(Math.floor(playerTicker.classicMinutes), maps.getClimateIndex(_pp.x, _pp.y));
      // WEATHER2b: the field at the player, after the drain - a change on a live frame is a crossing
      sampleWeatherField(Math.floor(playerTicker.classicMinutes), maps.getClimateIndex(_pp.x, _pp.y), fieldXZ(), climateAt, drained ? 'drain' : 'live');
      // drift-aware: a dungeon-side quickload restores the SIM but not
      // this host's derived lets - re-derive whenever they disagree
      if (weatherStale()) applyWeather(shownWeather());
    }
    const frameSnowCover = () => {   // PERF-V8 (at the merge of main into SEA VENTURES: the frame back under three quarters of the ceiling)
    { const _sp = playerTravelPixel(); snowCover.tick({ px: _sp.x, py: _sp.y, dt, arriving: !shared.playerSpawned }); renderer.setSnowFrame(snowCover.frame()); }   // PRECIP4: the snow the ground keeps, about the player - its window integrated, its lines eased, the standing pixels swept
    };
    frameSnowCover();
    // WX2: the front's word for this frame. Under the enhanced sky the
    // arrival is WIND1's front, read off the controller; under the
    // classic sky it is 1 and the terms are the weather's own.
    // ?front=off is the slice's kill switch (the arc's rule: every slice
    // has one) - the row's numbers whole and DFU's cap on the cut, under
    // the enhanced sky, for gates and shots that want WX1's volume.
    const enhancedFront = !!sky?.cloudShadow && params.get('front') !== 'off';
    // WX2a (AUDIT 57): a change the player was not PRESENT for - a load,
    // a travel landing, a respawn roll, a day rolled while underground -
    // is a jump, not a front. The sim stamps it; the sky drops its eased
    // row and the wind its front, and the ground takes the word whole.
    const jump = weatherJumpStamp() !== shared.seenJump;
    shared.seenJump = weatherJumpStamp();
    if (jump) sky.weatherJump();
    // WEATHER2b: a CROSSING - the player walked into a cell of the field, or it drifted over them: a short front
    const crossing = weatherCrossingStamp() !== shared.seenCrossing || seaVentures.stormTurned();   // SEA-EVENTS: into the Aether Storm or out of it - a short front, as a cell's edge
    shared.seenCrossing = weatherCrossingStamp();
    if (crossing && !jump) sky.weatherArrive();
    const fx = weatherFront.tick({ dt, weather: shared.weather, arrival: enhancedFront ? sky.frontArrival() : 1, nowMinutes: playerTicker.classicMinutes, tsec: now / 1000, jump, peak: weatherOverride ? null : seaStormShown() ? 1 : currentWeatherIntensity() });   // WEATHER3b: the map's intensity at the player is the peak
    if (fx.changed) shared.wxFrom = shared.wxNow;
    shared.wxNow = enhancedFront ? blendTerms(shared.wxFrom, fallTerms(weatherTerms(fx.snow), fx.intensity, shared.weather, FALL_LIGHT), fx.t) : weatherTerms();   // RAIN-SPRINKLE: a sprinkle looks like one
    const wd = windDrive(sky, now / 1000, dt);   // WIND3: the frame's wind in every consumer's units, read once
    shared.gustWind = wd.windV;
    const windClock = gustClock(now / 1000, shared.gustPhase);   // AUDIT MEADOW1: the gust wave's clock, carried across the crossings - the flats' and the grass's one
    // A3: the exterior ambience (WeatherAmbientEffects 5/25) - the
    // weather/time preset per WeatherManager.SetAmbientEffects.
    audio.setListener(cam.pos, tvf ? [viewFwd[0], 0, viewFwd[2]] : fwd);   // TV1: the traveller's ears, the screen's left and right
    // WX2: under the front the ear follows what is FALLING - the loop
    // fades with the drops and holds off with them; a rain word with
    // nothing down yet is a cloudy day. Classic: the word, verbatim.
    shared.ambientWord = enhancedFront ? soundWeather(fx, shared.weather) : shared.weather;
    setHeardWeather(shared.ambientWord, enhancedFront ? fx.rain ?? fx.intensity : 1, enhancedFront ? fx : null);   // DISC9/DISC11: what the street hears - word AND level - is what every indoor ear hears through the walls; AUDIT PRECIP FALL-4: the drops' level, and the whole fall at its share for the skin
    const _wfPx = playerTravelPixel();
    const _desolateAir = cromwarkDesolateAt(maps, _wfPx.x, _wfPx.y);
    ambience.setPreset(presetForExterior(shared.ambientWord, isNight(minute), _desolateAir));
    ambience.rainGain = enhancedFront ? fx.rain ?? fx.intensity : 1;   // AUDIT PRECIP FALL-4: the drops' own level on the law's lane
    // DW-D: the water arm reads the sea's forged blockWaterLevel and isPlayerSubmerged - WaterGentle at the line, the bubbles under it
    ambience.update(dt, { playerPos: cam.pos, inside: false, underground: modes?.mode === 'dungeon', waterSurfaceY: dwPlayer?.waterLevelY ?? null, submerged: !!dwPlayer?.submerged });   // CRICKET-DUNGEON: no crickets under the ground   // AUDIT 58: `!playerEnterExit.IsPlayerInside` (:154-162), stated rather than left undefined - this tick is the exterior's
    windAudio.update(wd, dt, windSoundOn());   // WIND3: the wind loop, beside DFU's ambience and never inside it
    const windfallLaw = windfall.frame({ dt: gamePaused() ? 0 : dt * worldTimeScale(), outside: true, weather: shared.weather, minutes: skyMinutes(), climate: maps.getClimateIndex(_wfPx.x, _wfPx.y), mapPixel: _wfPx,
      heading: wd.on ? wd.dir : null, feet: walkMode && shared.playerSpawned ? player.pos : cam.pos, height: player.height });   // WINDFALL1: the mod's frame - its sounds and leaves, and the law the flora lean by (one wind: WIND1's heading); AUDIT ENVIRONS W1: WindMod.Update's Time.deltaTime, held by a pause and scaled with the world
    atmosphere.frame({ dt: gamePaused() ? 0 : dt * worldTimeScale(), outside: true, desolate: _desolateAir, weather: shared.weather, minutes: skyMinutes(), dayMinute: minute, windV: [wd.windV[0] * wd.gust, wd.windV[1] * wd.gust], gust: Math.max(0, wd.gust - 0.8), feet: walkMode && shared.playerSpawned ? player.pos : cam.pos });   // ATMO1: the air's small life, off the same wind
    soundscape.frame(dt, { desolate: _desolateAir, wd, weather: shared.ambientWord, minute, climate: maps.getClimateIndex(_wfPx.x, _wfPx.y), winter: shared.season === SEASON.Winter, paused: gamePaused() });   // SOUNDSCAPE: beside the wind and DFU's ambience, never inside it - its ear the listener's, set above
    meterFor(renderer.gl)?.markCpu('snow');   // PERF-SIM1: the snow layer's frame
    _snowPixels.clear();
    snowfall.frame({ now: now / 1000, inside: false, player: snowPlayer(), weather: shared.weather, seconds: worldMinutes() * 60, winter: snowCover.winterNear(shared.season === SEASON.Winter), climate: maps.getClimateIndex(_wfPx.x, _wfPx.y), overworld: !!tvf, npcs: snowNpcs, corpses: snowBodies });   // SNOWFALL1: DynamicSnowController.Update - its tiers round the player, the tracks, the snowpack by the event clock; TV-SNOW: under the Overworld, which draws no snow, the clocks alone (snowfallHost.js)
    _fr.minute = minute;
    _fr.enhancedFront = enhancedFront;
    _fr.jump = jump;
    _fr.fx = fx;
    _fr.wd = wd;
    _fr.windClock = windClock;
    _fr.windfallLaw = windfallLaw;
  }
  function frameSkyPhase(now, dt) {
    const { tvf, mwv, minute, enhancedFront, jump, fx, wd } = _fr;
    meterFor(renderer.gl)?.markCpu('storms');   // PERF-SIM1: the animals, the lightning, the dread and the sun baby, the sky and the light settings
    animalAmbience.update(dt, cam.pos);   // A4: town animal barks (PlayRandomlyIfPlayerNear)
    // Storm lightning strobe. AUDIT 39 (#14): ENHANCED-SKIN ONLY -
    // shipped DFU renders no flash (PlayLightningEffect is 0 on both
    // AmbientEffectsPlayer instances and LightForEffects is unassigned,
    // so the storm is sound-only, and the line this models sets an
    // absolute intensity on that separate light, not the sun). The
    // player ticks on both skins: the clip schedule is the Audio arc's.
    const strobeNow = shared.lightning ? shared.lightning.tick(dt) : 1;   // the player keeps ticking on both skins - the schedule is its own
    // EVENT1: the live event's weight this frame (0 offline, and with no event) - the sky, the fog, the key light and
    // the red storm below all read this one number
    const dreadW = dread.tick(dt);
    const sunbabyW = sunbaby.tick(dt);   // SUNBABY1: the sun baby's - the flower sky, the land's haze and its light
    // SUNBABY2: and the face it wears on the shared clock - the baby, the wrath, Todd - said when it changes under me
    const sunbabyFace = sunbaby.frame(Date.now() + shared._sharedOffsetMs);
    if (sunbabyFace.line) townTalk.say(sunbabyFace.line);
    // WBX8 (Mac: "Improve the sky effect to be more like the /event dread command" - the overworld's, "not the inside"):
    // THE SKY OVER A GATE BURNS, as the omen has always said it does - its weight by the gate's life and this eye's
    // distance from it (systems/gate/gateOmen.js gateSkyWeight); the sky, its fog and the land's light take the greater of it
    // and the event's, and its storm gathers over the gate (below)
    const tvStand = tvf ? cam.pos : mwv.eye;   // AUDIT DEEP R-11: the storms round the TRAVELLER under the travel view (TV4's strike law), never round a camera that orbits
    const gateSky = gateOmen?.sky(tvStand, gateSkyTranslate) ?? null;
    const skyDreadW = Math.max(dreadW, gateSky?.weight ?? 0);
    // WX2a (AUDIT 57): under the front the FLASH waits for the storm to be
    // HERE. The player was built at the sim's cut, so the strobe lit a
    // sky that was still mostly clear for the whole three-hour lead, and
    // went on after the storm had cleared while the last drops drained.
    // The thunder one-shots already follow the shown mode through the
    // ambience preset; the flash now follows the same word.
    const lightningShown = !enhancedFront || fx.shown === 'storm' ? shared.lightning : null;
    const strobe = lightningShown ? strobeNow : 1;
    // DS1 (AUDIT 61): under the mod the storm's light is the mod's own
    // point flash; the port's sun strobe (DFU's PlayLightningEffect,
    // unreachable there) stands down so there is ONE lightning, as in DFU
    // with the mod. LightningPlayer keeps ticking for the audio schedule.
    const flash = params.has('flashtest') ? 2 : (isEnhanced() && !sky.dynamic ? strobe : 1);
    // WEATHER3d: THE STORMS AT A DISTANCE - each thunderstorm the world weather map stands near strikes on its own
    // seeded schedule: its own cloud lights (the clouds' composite, in its direction) and its thunder arrives its
    // distance over the speed of sound later, quieter the further, from its side. The storm overhead stays DFU's
    // strobe and ambience above. Enhanced only; nothing off the map's lane (no systems); a jump forgets the old place.
    if (jump || weatherArrivalStamp() !== shared.seenArrival) { distantStorms.reset(); stormLights.reset(); }   // AUDIT WEATHER3 R5: any landing, the word moved or not; BOLT: the strikes burning were the old place's
    shared.seenArrival = weatherArrivalStamp();
    const struckFar = [];   // BOLT: the distant strikes fired this frame, in host metres
    const frameDistantStorm = () => {   // PERF-V8
    if (isEnhanced() && !weatherOverride && !sunbaby.on) {   // SUNBABY1: no storm anywhere under the sun baby
      const ds = distantStorms.tick({ systems: currentMapSystems(), at: fieldXZ(), minutes: playerTicker.classicMinutes, seconds: now / 1000, ground: mapGroundHere });
      const hostOf = (x, z) => { const n = nativeFromField(x, z); return state.localFromWorld(n[0], n[1]); };
      const bh = ds.bolt && hostOf(ds.bolt.x, ds.bolt.z);
      sky.distantBolt?.(bh ? { x: bh[0], z: bh[1], r: ds.bolt.r, strength: ds.bolt.strength } : null);
      for (const s of ds.sounds) { const h = hostOf(s.x, s.z); audio.play3d(s.clip, thunderSourceAt(cam.pos, h[0], h[1]), s.volume, { refDistance: THUNDER_SOURCE_M, maxDistance: THUNDER_SOURCE_M * 8, far: true }); }   // DISC17-B: held at its bearing from the ear, so walking or a recentre never cuts it off
      for (const s of ds.strikes) { const h = hostOf(s.x, s.z); struckFar.push({ x: h[0], z: h[1], seed: s.seed, kind: s.kind, strength: s.strength }); }
    }
    };
    frameDistantStorm();
    // EVENT1: THE RED STORM - the dread's strikes on the shared clock (every player online sees one in the same
    // second, each around themselves), their channels and light through the same field as the weather's, in the
    // event's colours; the thunder on both skins, its distance over the speed of sound later, from its side
    if (jump) { dreadStorm.reset(); gateStorm.reset(); }
    const frameDreadStorm = () => {   // PERF-V8
    {
      const ds = dreadStorm.tick({ sharedMs: Date.now() + shared._sharedOffsetMs, eye: tvStand, weight: dreadW });
      if (isEnhanced()) for (const s of ds.strikes) struckFar.push({ ...s, flashColor: DREAD_FLASH_COLOR });
      for (const s of ds.sounds) audio.play3d(s.clip, thunderSourceAt(cam.pos, s.x, s.z), s.volume, { refDistance: THUNDER_SOURCE_M, maxDistance: THUNDER_SOURCE_M * 8, far: true });
    }
    };
    frameDreadStorm();
    // SUNBABY2: THE FIRE - under the wrath the sun baby's fireballs fall round the traveller on the shared clock (every
    // player online sees one drop in the same second, each round themselves), drawn by the spell engine, burning no one
    if (jump) sunbabyRain.reset();
    for (const fb of sunbabyRain.tick({ sharedMs: Date.now() + shared._sharedOffsetMs, eye: tvStand, fire: sunbaby.on && sunbabyFace.fire, ground: sunbabyGround })) magic.skyFire(fb);
    // WBX8: THE GATE'S RED STORM - the same strikes' law on a schedule of its own, round the gate's site (so its
    // lightning shows where the gate stands), its thunder from each strike's distance to the ear; ticked every frame,
    // at nothing when no gate burns, so a gate coming into reach fires no backlog
    const frameGateStorm = () => {   // PERF-V8
    {
      if (gateSky) { _gateStormC[0] = gateSky.x; _gateStormC[2] = gateSky.z; }
      const gs = gateStorm.tick({ sharedMs: Date.now() + shared._sharedOffsetMs, eye: tvStand, weight: gateSky?.weight ?? 0, centre: gateSky ? _gateStormC : null });
      if (isEnhanced()) for (const s of gs.strikes) struckFar.push({ ...s, flashColor: DREAD_FLASH_COLOR });
      for (const s of gs.sounds) audio.play3d(s.clip, thunderSourceAt(cam.pos, s.x, s.z), s.volume, { refDistance: THUNDER_SOURCE_M, maxDistance: THUNDER_SOURCE_M * 8, far: true });
    }
    };
    frameGateStorm();
    // BOLT: THE STRIKES THEMSELVES - a ground strike's channel from its cloud's base to the land, far or overhead, and
    // the light a near one throws on it (systems/lightning.js). Enhanced only. Under Dynamic Skies too: the mod draws no
    // channel, and its own flash keeps the light (setFlashLight below takes the mod's first).
    shared.boltFrame = isEnhanced()
      ? stormLights.frame({ seconds: now / 1000, eye: tvf ? cam.pos : mwv.eye, distant: struckFar, player: shared.lightning, shown: !!lightningShown, test: Number(params.get('bolttest')) || 0 })   // TV4: a strike's column stands on the traveller's ground, not 448 m under the raised eye
      : { bolts: [], flash: null };
    sky.setSunbaby(sunbabyW, sunbaby.on);   // SUNBABY1: its flower sky, and the clear day the sky wears while it is staged
    sky.setSunbabyFace(sunbabyFace.evil, sunbabyFace.todd);   // SUNBABY2: the face it wears, and the wrath's burning sky
    sky.setDread(skyDreadW, dreadCloudGlow(shared.boltFrame.bolts));   // EVENT1: the sky's grade, and the red strikes' glow in its deck; WBX8: the gate's, where it is the greater
    const sdAirW = sdHost ? sdAirNow(tvStand, minute) : 0;   // SD19: the brass air near a standing Hollow - its haze and its light
    sky.setBrass?.(sdAirW);
    // EV5: the moons light the night - the masser as a second key, the
    // secunda folded into the ambient. null by day and under classic.
    const moonNow = sky.moonlight();
    // SD19: the land's light leaning to brass near a standing Hollow (sdBrassLight, both lights)
    // ETHER-LIGHT (world/ethericSea.js etherLight): and cold and violet past the Veil, both lights
    const etherPx = etherSea ? playerTravelPixel() : null;
    const etherAirW = etherPx && inEther(etherPx.x, etherPx.y) ? 1 : 0;
    // AUDIT CAPTAIN'S SEA G14: and the third, Masser's key, leaned as the sun's (it lit land, sea and hulls past the Veil in
    // the Bay's colour) - the moon as it is under no lean, nothing made
    renderer.setMoonlight(moonNow && etherAirW ? { scale: moonNow.scale, dir: moonNow.dir, color: etherLight(moonNow.color, etherAirW, ETHER_KEY_TINT) } : moonNow);
    const frameLighting = () => {   // PERF-V8
    renderer.setLighting(
      etherLight(sdBrassLight(sunbabyLight(dreadLight(withMoonAmbient(exteriorAmbient(minute, getFloat('Enhancements', 'NightAmbientLightScale', 0, 1), shared.wxNow.sun), moonNow), skyDreadW), sunbabyW, sunbabyFace.evil), sdAirW), etherAirW), sunScale(minute) * shared.wxNow.sun * flash * sky.sunFactor() * (1 - DREAD_KEY_DIM * skyDreadW),   // EVENT1: the land under the dread's light; SUNBABY1: lifted toward noon's under the sun baby (SUNBABY2: reddened under its wrath)   // ES1d: the cloud in front of the sun takes the KEY light (never the ambient - the sky still lights the ground); WX2: the scale is the front's
      etherLight(sdBrassLight(sunbabyKey(dreadLight(SUN_RIG_COLOR, skyDreadW), sunbabyW, sunbabyFace.evil), sdAirW), etherAirW, ETHER_KEY_TINT));   // SUNBABY2: the key reddened under the wrath; SD19: brass near a Hollow
    };
    frameLighting();
    // DW-C: the distance fog's own "under" (UnderwaterDistanceFog.TryGetUnderwaterPresentation) - the surfaces'
    // _DeepWatersUnderwater and UnderwaterPresentationEffects' light suppression read it too, so it is taken
    // here, before the lights, from this frame's camera and capsule
    if (dwPlayer) {
      const _centre = walkMode ? centreFromFeet(player.pos, player.height) : cam.pos;
      shared._dwFogP = dwPlayer.fogPresentation({ camera: cam.pos, centre: _centre, swimming: walkMode && (!!player.isPlayerSwimming || !!player.swimming || !!player.onExteriorWater), playing: dwPlaying() });
    }
    // R12: the player-following indirect light rides the camera in
    // the streaming world (walk mode keeps cam at the player's eye).
    {
      // DW-D: UnderwaterPresentationEffects.SuppressPlayerIndirectLight - its intensity 0 under the fog, back after
      const iScale = shared._dwFogP?.under ? 0 : indirectLightScale(minute) * shared.wxNow.sun;   // WX2: the front's scale
      renderer.setIndirectLight(cam.pos, INDIRECT_LIGHT_RANGE, new Float32Array([
        INDIRECT_LIGHT_COLOR[0] * iScale, INDIRECT_LIGHT_COLOR[1] * iScale, INDIRECT_LIGHT_COLOR[2] * iScale,
      ]));
    }
    // AUDIT 64 F9 - DaggerfallLocation.cs:141-145 is the only window-style
    // rule a town runs (its WindowTextureStyle feeds SetClimate at :218/:221)
    // and it reads the clock alone; WeatherManager never touches a window
    // style, so no weather term may sit between the ?window= dev override
    // and the clock's answer.
    renderer.setWindowEmission(windowEmissionRGB(
      params.has('window') ? params.get('window') : windowStyleForTime(minute)));
    meterFor(renderer.gl)?.markCpu('scene');   // PERF-SIM1: the spawners, the city gates, the sky and fog, the pools, the lights chosen, the boats
    tickWodSpawners();   // WOD3: LocationEnemySpawner.Update, every exterior frame
    meterFor(renderer.gl)?.markCpu('gates');   // PERF-SIM2: the old 'scene' in parts (Dudey's second readout: scene 6-10 ms in the town at night) - the city gates, the interior lane's sync
    tickCityGates(minute);   // AUDIT 64 F14: DaggerfallCityGate.Update, every frame as DFU's is - and on the first frame after a pixel builds, which is what closes a gate streamed in at 20:00
    iilSyncLane(renderer, false);   // IIL2: outdoors the mod's shadow lane comes off - the streets are the classic set's, day or night
    meterFor(renderer.gl)?.markCpu('skyset');   // PERF-SIM2: the sky handed its frame, the fog
    const currentEntry = built.get(`${state.current.x},${state.current.y}`);
    // DaggerfallSky.cs:363-367 - a non-Normal WeatherStyle (every rain,
    // thunder and snow) disables the clear night sky, so the DAY sky at
    // frame 0 is drawn instead. weatherSkyOffset IS the WeatherStyle
    // (Rain1 4 / Rain2 5 / Snow1 6 / Snow2 7; Normal is 0).
    // AUDIT 23 (wts-1): the Normal-weather sky adds the CALENDAR season
    // (DaggerfallSky.cs:354-357); rain/snow keep their boot variant.
    if (shared.skyInside) { shared.skyInside = false; sky.setInside(false); }   // DS1: ExteriorTransitionEvent
    sky.use((currentEntry ? currentEntry.skyBase : 16) + (shared.weatherSkyOffset === 0
      ? seasonValue(dateFromClassicMinutes(skyMinutes())) : shared.weatherSkyOffset), minute, shared.weatherSkyOffset === 0,   // TIME1: the sky's season
    { weather: shared.weather, violence: weatherOverride ?? seaStormShown() ?? currentWeatherRaw(), classicMinutes: playerTicker.classicMinutes, skyMinutes: skyMinutes(), sun: shared.wxNow.sun, flash: flash - 1, pos: walkMode ? player.pos : cam.pos, cells: fieldCellsHere(), cloudBase: weatherOverride || seaStormShown() ? null : currentCloudBase(), approach: weatherOverride ? 0 : currentWindApproach() });   // WEATHER2a: the wind blows by the table's word; WEATHER2b/c: the field's cells are the clouds' cells   // ES1: the sky's clock and weather; VC4: the camera's world position, the clouds' and their shadow's origin; the enhanced sky's clouds and moons; VC3: the strobe lights the clouds; DS1 (AUDIT 61): the ONE sunlight scale the ground takes (the front's blend of the host's SetSunlightScale - pin and latch included; the raw row under ?front=off)
    // Verbatim: fog is never disabled (SetFog keeps RenderSettings.fog on);
    // Sunny/Overcast ARE linear fog to 2400 - the classic distance haze.
    // DaggerfallSky.SetSkyFogColor (:318-325): anything denser than
    // heavy rain fogs to Color.gray, not to the sky tint.
    const fogNow = horizonFog(shared.wxNow.fog, tvf);   // WX2: the row on the front (the table's own row, classic and settled); OW-HORIZON: under the travel view a linear row's haze runs on to the horizon (scenes/travelHorizon.js) - the same row on the ground
    const fogColor0 = jungle ? jungle.haze({ fogColor: sky.fogColorFor(fogNow), fogRow: fogNow, eye: mwv.eye, dt, minute, weather: shared.weather, wind: wd.on ? wd.windV : null, sky }) : sky.fogColorFor(fogNow);   // DS1: the mod's own RenderSettings.fogColor while it is the sky; SetSkyFogColor over the horizon otherwise, as before; BANTHA1: and the jungle's haze over it - its uniforms, the sky's, the colour weighed with it, measured from the view's own eye (AUDIT BANTHA1 HOST-7: the fog's uCamPos)
    const eventSkyW = eventPillar.showing() ? eventPillar.skyWeight(mwv.eye) : 0;   // BUNNYFALL: the sky goes dark purple about a staff event's pillar (scenes/eventPillarHost.js)
    const fogColor = eventSkyW > 0 ? eventPillar.tint(fogColor0, eventSkyW) : fogColor0;
    renderer.setFog(fogNow.mode,
      fogNow.density, fogNow.start, fogNow.end, fogColor);
    cromwark.fog(renderer, fogNow, fogColor);   // BUNNYFALL (Cromwark): the deep rings' purple haze
    if (dwPlayer) {   // DW-D: ApplyUnderwaterPresentation - DFU's own UnderwaterFog, the mod's range and colour, over the sky's
      const _uw = dwPlayer.fog({ mode: fogNow.mode, density: fogNow.density, start: fogNow.start, end: fogNow.end, color: [...fogColor] }, cam.pos[1], daylightFactor({ night: isNight(minute), daylightScale: daylightScale(minute), weatherScale: shared.wxNow.sun }));
      if (_uw) { renderer.setFog(_uw.mode, _uw.density, _uw.start, _uw.end, new Float32Array(_uw.color)); jungle?.under(sky); }   // AUDIT BANTHA1 HAZE-7: under the sea the sea's fog alone - the jungle's air off with the air's
      shared._dwUnderFog = _uw;
    }
    sky.renderer.fogColor = fogColor;
    sky.renderer.fogMix = fogNow.excludeSky ? 0 : 1 - fogFactor(fogNow, 800);
    if (eventSkyW > 0) sky.renderer.fogMix = Math.max(sky.renderer.fogMix, eventSkyW * 0.88);   // BUNNYFALL: the sky itself takes the purple
    _fr.fogNow = fogNow;
    _fr.fogColor = fogColor;
  }
  return { frameSkyPhase, frameViewPhase, frameWeatherPhase };
}
