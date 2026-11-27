// The Abyss realm in the world: frames, the Hour fight and score, the rift, sky, beam, motes,
// halo, and omen passes, and the arena reads. It also holds the ways in and out: the hollow door,
// entering the realm, the way back, the cast back, and the beacon home.
// The realm host and its fight link stay in the world.
import { arenaHolds, isSdRealm, SD_REALM_TEXT } from './sdRealm.js';
import { clearOfPillars } from '../worldEvents/sdSpoils.js';
import { companionsWithYou } from '../characters/companionSlots.js';
import { DOOR_TYPE } from './meshReader.js';
import { drawGateBanner } from '../ui/gateBanner.js';
import { drawGateBossBar } from '../ui/gateBossBar.js';
import { drawGateGround } from '../ui/gateGroundView.js';
import { drawGateMarksCard } from '../ui/gateMarksView.js';
import { drawSdTitleCard } from '../ui/sdTitleCard.js';
import { dungeonEntranceLanding, repositionFeetY } from '../player/enterExit.js';
import { flashPlayerDamage } from '../ui/damageFlash.js';
import { hurtPlayer, playerEntity } from '../characters/playerEntity.js';
import {
  inOrreryHall, SD_ARENA, SD_FRAY_LASH, SD_TURN_WAIT_LINE, dungeonToRealm as sdDungeonToRealm,
  realmToDungeon as sdRealmToDungeon,
} from '../net/sdBrain.js';
import { INTERIOR_SEASON } from './climateSwaps.js';
import { music } from '../audio/music.js';
import { nearestFirstFrom } from './streamingWorld.js';
import { remnantBarModel, sdBarNear } from '../ui/sdRemnantBar.js';
import { riftLook, SD_RETURN_SIZE, sdReturnStands, sdRiftCount, sdRiftWord, sdThroughStands } from './sdDungeon.js';
import { sampleKernel } from './terrainSampler.js';
import { SD_BANNER_M, SD_COMPASS_M, sdAirWeight, sdBannerText, sdOmenSeen } from '../worldEvents/sdOmen.js';
import { SD_CAST_BACK_LOSS } from './sdSteps.js';
import { SD_ENDINGS, sdEndingOf, sdMarksOf } from '../net/sdMarks.js';
import { SD_HALO_GAIN, SdHaloRenderer } from '../render/sdHalo.js';
import { SD_HOME_RISE_MS, SD_HOME_SAY_MS, SD_HOME_SCALE, SD_HOME_TEXT } from '../worldEvents/sdEnd.js';
import { SD_REM_SINK_MS } from '../worldEvents/sdRemnant.js';
import { SD_SCORE_SILENCE, sdScorePlace, sdScoreSongs } from '../worldEvents/sdScore.js';
import { SD_SKY_STEPS } from '../render/sdSky.js';
import { SD_STEPS_TEXT } from '../worldEvents/sdSteps.js';
import { sdArenaGlowAt, SdArenaGlowRenderer, sdHourClockOf } from '../render/sdArenaGlow.js';
import { SdBeamRenderer } from '../render/sdBeam.js';
import { sdGroundModel, sdPerilAt } from '../worldEvents/sdArenaRead.js';
import { sdHallNamed, sdSnapLine } from '../worldEvents/sdHall.js';
import { sdHomeBeacon, SdStompWallRenderer, sdStompWalls } from '../render/sdStompWall.js';
import { sdMarksCardModel } from '../ui/sdMarksView.js';
import { SdMotesRenderer } from '../render/sdMotes.js';
import { SdOmenPassRenderer } from '../render/sdOmenPass.js';
import { sdPhase } from '../net/sdLaw.js';
import { sdPillarLookAt } from '../worldEvents/sdArenaWatch.js';
import { SdPillarPassRenderer } from '../render/sdPillarPass.js';
import { SdRiftRenderer } from '../render/sdRiftPass.js';
import { spawnedLocationCentreLocal } from './spawnedDungeons.js';
import { titleCardModel } from '../ui/gateTitleCard.js';

/** @param {any} shared */
export function createRealmWorld(shared) {
  const {
    _sdLate, _teleportToPixel, bossCountFell, buildingDoors, built, cam, collider, destroyPixel, gamePaused, heightAt,
    heightCell, inFlight, player, playerTravelPixel, queue, renderer, saveSoon, shiftedDoor, state, townTalk,
    walkMode, worldHeight,
  } = shared;
  function sweepSdLate() {
    const again = [];
    for (const k of _sdLate) {
      const p = built.get(k);
      if (p) { again.push({ px: p.px, py: p.py }); _sdLate.delete(k); }
      else if (!inFlight.has(k)) _sdLate.delete(k);
    }
    if (!again.length) return;
    const under = `${state.current.x},${state.current.y}`;
    if (walkMode && shared.playerSpawned && again.some((k) => `${k.px},${k.py}` === under)) shared._seasonHoldKey = under;
    for (const k of again) destroyPixel(k.px, k.py, { collectLoose: false });
    queue.push(...again.sort(nearestFirstFrom(state.current)));
  }

  const sdHollowDoorsOf = (h) => buildingDoors.filter((d) => d.pixelKey === h?.key && d.door?.doorType === DOOR_TYPE.DUNGEON_ENTRANCE).map(shiftedDoor);

  let _hourScoreHeld = false, _hourScoreMade = false, _hourPlace = null;

  const sdScoreWhere = () => {
    if ((shared.modes?.mode ?? 'exterior') !== 'dungeon') return (_hourPlace = null);
    if (shared.modes?.sdRealmSlot?.() != null) { const [x, , z] = sdDungeonToRealm(player.pos[0], player.pos[1], player.pos[2]); return (_hourPlace = sdScorePlace(x, z, _hourPlace)); }
    return (_hourPlace = shared.modes?.dungeonLocation?.superTier ? 'hollow' : null);
  };
  const hourScoreFrame = () => {
    if (shared._spireScore.frame(shared.egClient?.scoreView?.() ?? null)) return true;
    const place = sdScoreWhere();
    if (place == null) {
      if (_hourScoreHeld && (shared.modes?.stepping || shared.modes?.transitioning)) return true;
      if (_hourScoreHeld) { _hourScoreHeld = false; music.fadeOut(); }
      return false;
    }
    if (!_hourScoreMade) { _hourScoreMade = true; for (const song of Object.values(sdScoreSongs())) music.registerSong(song.name, song); }
    _hourScoreHeld = true;
    const slot = shared.modes?.dungeonLocation?.sdSlot ?? shared.modes?.sdRealmSlot?.() ?? null;
    const now = shared.sdFightLink?.now?.() ?? Date.now() + shared._sharedOffsetMs, rec = shared.sdHost?.record?.() ?? null;
    const collapsing = rec != null && rec.s === slot && sdPhase(rec, now) === 'fell';
    const want = !(playerEntity.health > 0) ? SD_SCORE_SILENCE : shared._hourScore.want(place, place === 'hollow' ? null : shared.sdFightLink?.state?.() ?? null, now, collapsing);
    if (want === SD_SCORE_SILENCE) { if (music.current !== null) music.fadeOut(); } else music.playSong(want);
    return true;
  };

  const sdAirFrame = () => { if (shared.modes?.sdRealmSlot?.() != null) shared.sdAir.frame(shared.deadlandsSeconds(), cam.pos); else shared.sdAir.stop(); };

  const _sdScanRow = () => false;

  let _sdRiftPass, _sdHaloPass;
  const sdRiftPassOf = () => {
    if (_sdRiftPass === undefined) { try { _sdRiftPass = new SdRiftRenderer(renderer.gl); } catch (e) { console.warn('[sd] the Rift\'s window could not be built', e); _sdRiftPass = null; } }
    return _sdRiftPass;
  };
  const sdHaloPassOf = () => {
    if (_sdHaloPass === undefined) { try { _sdHaloPass = new SdHaloRenderer(renderer.gl); } catch (e) { console.warn('[sd] the halos could not be built', e); _sdHaloPass = null; } }
    return _sdHaloPass;
  };
  const sdSkyLookNow = () => {
    const s = shared.modes?.sdRealmSlot?.() ?? shared.modes?.dungeonLocation?.sdSlot ?? null, lane = !!renderer.lightingLane;
    if (s !== _sdSkyLookFor || lane !== _sdSkyLookLane) {
      _sdSkyLookFor = s; _sdSkyLookLane = lane;
      const E = s == null ? null : sdEndingOf(sdMarksOf(s));
      _sdSkyLook.steps = lane ? SD_SKY_STEPS.lane : SD_SKY_STEPS.classic; _sdSkyLook.ending = E?.light ?? null; _sdSkyLook.endingIdx = E ? SD_ENDINGS.indexOf(E) : -1;
    }
    return _sdSkyLook;
  };
  const _sdSkyLook = { steps: 0, ending: null, endingIdx: -1 };
  let _sdSkyLookFor, _sdSkyLookLane = null;

  const _sdRiftSky = { map: null, seconds: 0, gain: 1, clock: null };
  let _sdBeamPass;
  const sdBeamPassOf = () => {
    if (_sdBeamPass === undefined) { try { _sdBeamPass = new SdBeamRenderer(renderer.gl); } catch (e) { console.warn('[sd] the Hour-Hand\'s beam could not be built', e); _sdBeamPass = null; } }
    return _sdBeamPass;
  };
  let _sdMotesPass;
  const sdMotesPassOf = () => {
    if (_sdMotesPass === undefined) { try { _sdMotesPass = new SdMotesRenderer(renderer.gl); } catch (e) { console.warn('[sd] the Hour\'s motes could not be built', e); _sdMotesPass = null; } }
    return _sdMotesPass;
  };
  const sdFrame = () => { try { shared.sdHost?.frame(); } catch (e) { console.warn('[sd] host', e?.message ?? e); } sdRealmFrame(); sdAloneFrame(); sdFightFrame(); sdBodyFrame(); shared.sdVoiceFrame(); };
  let _sdOut = false;
  const sdRealmFrame = () => {
    if (shared.modes?.sdRealmSlot?.() == null) { _sdOut = false; return; }
    if (_sdOut || !shared.online?.terminal || !(playerEntity.health > 0) || shared.modes?.deathUp?.()) return;
    _sdOut = true;
    shared.gateVeil?.flash('hourCast');
    if (shared.modes?.unstuck?.()) shared.sdSay(/^The Hour /.test(shared.online.error ?? '') ? shared.online.error : SD_REALM_TEXT.lost);
  };
  let _sdAloneSaid = false;
  const sdAloneFrame = () => {
    if (shared.modes?.sdRealmSlot?.() == null) { _sdAloneSaid = false; return; }
    if (_sdAloneSaid || shared.modes?.transitioning || shared.gateVeil?.busy || gamePaused()) return;
    _sdAloneSaid = true;
    if (companionsWithYou() > 0) shared.sdSay(SD_REALM_TEXT.noCompanions);
  };

  const hourRezOpen = () => shared._sdFallen.mayRise(shared.modes?.sdRealmSlot?.());
  const sdRiftOf = (s) => {
    if (!shared.sdHost) return null;
    const rec = shared.sdHost.record(), now = Date.now() + shared._sharedOffsetMs;
    const seen = { entered: shared._sdEntered.has(s), fallen: shared._sdFallen.has(s) };
    return { word: sdRiftWord(rec, s, now, seen), returns: sdReturnStands(rec, s, now), through: sdThroughStands(rec, s, now), count: sdRiftCount(rec, s, now), look: riftLook(rec, s, now, seen), enter: () => sdEnterRealm(s) };
  };
  const _sdSeen = { entered: false, fallen: false };
  const sdRiftLookOf = (s) => {
    if (!shared.sdHost) return null;
    _sdSeen.entered = shared._sdEntered.has(s); _sdSeen.fallen = shared._sdFallen.has(s);
    return riftLook(shared.sdHost.record(), s, Date.now() + shared._sharedOffsetMs, _sdSeen);
  };
  function sdVeilAim(proj, view, m) {
    if (!m || !shared.gateVeil) return;
    const x = m[12], y = m[13], z = m[14];
    const vx = view[0] * x + view[4] * y + view[8] * z + view[12], vy = view[1] * x + view[5] * y + view[9] * z + view[13];
    const vz = view[2] * x + view[6] * y + view[10] * z + view[14], vw = view[3] * x + view[7] * y + view[11] * z + view[15];
    const cw = proj[3] * vx + proj[7] * vy + proj[11] * vz + proj[15] * vw;
    if (!(cw > 1e-3)) return;
    const W = renderer.gl.drawingBufferWidth, H = renderer.gl.drawingBufferHeight, d = Math.hypot(W, H) || 1;
    shared.gateVeil.aim?.(((proj[0] * vx + proj[4] * vy + proj[8] * vz + proj[12] * vw) / cw) * (W / d), ((proj[1] * vx + proj[5] * vy + proj[9] * vz + proj[13] * vw) / cw) * (H / d));
  }
  function sdEnterRealm(s) {
    const h = shared.sdHost?.hollow();
    if (!h || h.s !== s || !h.site || !shared.modes?.stepThroughFire) return false;
    if (shared.modes?.stepping) return null;
    const hollow = { key: h.key, px: h.site.px, py: h.site.py, name: h.loc.name };
    const site = { climateBase: h.loc.climate?.climateType ?? 2, season: INTERIOR_SEASON, climate: h.loc.climate, regionIndex: h.loc.regionIndex ?? -1, regionName: h.loc.regionName ?? '' };
    shared.modes?.stepThroughFire(async () => {
      if ((shared.modes?.mode ?? 'exterior') !== 'dungeon' || !(playerEntity.health > 0)) return false;
      const word = sdRiftOf(s)?.word;
      if (word) { shared.sdSay(word); return false; }
      shared.modes?.forceExitToExterior();
      await _teleportToPixel(hollow.px, hollow.py);
      standBeforeHollowDoor(hollow.key);
      const late = sdRiftOf(s)?.word;
      if (late) { shared.sdSay(late); return false; }
      if (await shared.modes?.enterSdRealm?.({ s, hollow, site })) { shared._sdEntered.add(s); return true; }
      shared.sdSay(SD_REALM_TEXT.lost);
      return false;
    }, 'hourIn');
    return true;
  }
  function standBeforeHollowDoor(key) {
    const at = walkMode ? dungeonEntranceLanding(sdHollowDoorsOf({ key })) : null;
    if (!at) return false;
    player.spawn(at.pos[0], repositionFeetY(collider.heightAt(at.pos[0], at.pos[2]), at.pos[1]), at.pos[2]);
    shared.playerSpawned = true;
    cam.yaw = Math.atan2(at.normal[0], at.normal[2]); cam.pitch = 0;
    cam.pos = player.eyeAt();
    return true;
  }
  let _sdHome = null;
  const sdHomeAt = () => {
    const s = shared.sdFightLink?.state();
    if (!s?.fell || shared.sdFightLink.now() < s.fell.at + SD_REM_SINK_MS) return null;
    if (_sdHome?.fell !== s.fell.at) {
      const [x, z] = clearOfPillars(s.rem.x, s.rem.z);
      _sdHome = { fell: s.fell.at, at: sdRealmToDungeon(SD_ARENA.x + x, 0, SD_ARENA.z + z) };
      if (sdHomeAge() < SD_HOME_SAY_MS) shared.sdSay(SD_HOME_TEXT.rises);
    }
    return _sdHome.at;
  };
  const sdHomeAge = () => {
    const s = shared.sdFightLink?.state();
    return s?.fell ? shared.sdFightLink.now() - (s.fell.at + SD_REM_SINK_MS) : null;
  };
  const sdArenaHeld = () => {
    if (!shared.sdFightLink?.joined?.()) return false;
    const [x, , z] = sdDungeonToRealm(player.pos[0], player.pos[1], player.pos[2]);
    return arenaHolds(true, x, z);
  };

  function sdWayBack() {
    const loc = shared.modes?.dungeonLocation;
    if (!isSdRealm(loc) || !shared.modes?.stepThroughFire) return false;
    if (shared.modes?.stepping) return null;
    const back = loc.sdHollow;
    shared.modes?.stepThroughFire(async () => {
      if (!isSdRealm(shared.modes?.dungeonLocation) || !(playerEntity.health > 0)) return false;
      shared.modes?.forceExitToExterior();
      if (!back) return true;
      await _teleportToPixel(back.px, back.py);
      if (shared.sdHost?.hollow()?.key !== back.key) return true;
      if (!(await shared.modes?.startInDungeon?.())) { standBeforeHollowDoor(back.key); return true; }
      const at = shared.modes?.dungeonCtx?.sdRiftLanding?.();
      if (at) shared.modes?.setPlayerLocalPosition?.(at);
      return true;
    }, 'hourBack');
    return true;
  }
  let _sdHall = null;
  function sdHallHeard(w) {
    _sdHall = sdHallNamed(w, shared.peerName, shared.online?.id ?? null);
    if (shared.modes?.sdRealmSlot?.() !== w.s) return;
    if (w.w === 1) { shared.sdSay(SD_TURN_WAIT_LINE); return; }
    if (w.x !== 1) return;
    const [x, , z] = sdDungeonToRealm(player.pos[0], player.pos[1], player.pos[2]);
    if (playerEntity.health > 0 && inOrreryHall(x, z) && !!shared.online?.id && (w.ls ?? []).includes(shared.online.id)) {
      const dmg = Math.max(1, Math.round((playerEntity.maxHealth ?? 0) * SD_FRAY_LASH));
      hurtPlayer(playerEntity, dmg, { bypassShield: true, spare: () => {} });
      flashPlayerDamage(dmg);
    }
    shared.sdSay(sdSnapLine(_sdHall));
  }
  function sdCastBack() {
    if (playerEntity.health > 0) {
      const dmg = Math.max(1, Math.round((playerEntity.maxHealth ?? 0) * SD_CAST_BACK_LOSS));
      hurtPlayer(playerEntity, dmg, { bypassShield: true, spare: () => {} });
      flashPlayerDamage(dmg);
    }
    shared.sdSay(SD_STEPS_TEXT.cast);
  }

  let _sdFightHeld = false, _sdBarUp = false, _sdGroundUp = false, _sdCardUp = false;
  let _sdMarksSince = null, _sdMarksUp = false;

  let _sdGlowPass = null, _sdWallPass = null, _sdPillarPass = null, _sdReadsBroken = false;

  const _sdBeacon = [{ x: 0, z: 0, r: 0, k: 0, h: 0, color: null, beacon: true }];

  function drawSdArenaReads(proj, view, fog) {
    const ghosts = !!shared.modes?.dungeonCtx?.sdStepsDraw?.(proj, view, fog);
    if (!shared.sdFightLink || _sdReadsBroken || shared.modes?.sdRealmSlot?.() == null) return ghosts;
    if (!_sdGlowPass) {
      try { _sdGlowPass = new SdArenaGlowRenderer(renderer.gl); _sdWallPass = new SdStompWallRenderer(renderer.gl); _sdPillarPass = new SdPillarPassRenderer(renderer.gl); } catch (e) { _sdReadsBroken = true; console.warn('[sd] the arena\'s reads would not build', e?.message ?? e); return ghosts; }
    }
    const s = shared.sdFightLink.state(), t = shared.sdFightLink.now();
    let drew = _sdGlowPass.draw(proj, view, shared._sdArenaModel, sdArenaGlowAt(s, t, shared._sdGlowMemo), fog, renderer.lightingLane ? SD_SKY_STEPS.lane : SD_SKY_STEPS.classic);
    if (_sdPillarPass.draw(proj, view, sdPillarLookAt(s, t, shared._sdPillarLook, shared._sdGlowMemo), fog, renderer.lightingLane ? SD_SKY_STEPS.lane : SD_SKY_STEPS.classic, renderer.lightingLane ? SD_HALO_GAIN.lane : SD_HALO_GAIN.classic)) drew = true;
    const n = sdStompWalls(s, t, shared._sdWalls);
    if (n > 0 && _sdWallPass.draw(shared._sdWalls, n, proj, view, fog)) drew = true;
    if (sdArenaHeld() && _sdWallPass.draw(shared.SD_HELD_WALLS, 1, proj, view, fog)) drew = true;
    const home = s.fell ? sdHomeAt() : null;
    if (home) {
      const b = sdHomeBeacon(sdHomeAge() - SD_HOME_RISE_MS, _sdBeacon[0], SD_RETURN_SIZE.h * SD_HOME_SCALE);
      b.x = home[0] - shared._sdArenaModel[12]; b.z = home[2] - shared._sdArenaModel[14];
      if (_sdWallPass.draw(_sdBeacon, 1, proj, view, fog)) drew = true;
    }
    return drew || ghosts;
  }
  const sdSkyClockNow = () => (shared.sdFightLink ? sdHourClockOf(shared.sdFightLink.state(), shared.sdFightLink.now(), shared._sdSkyClock) : null);

  const floorPool = () => (shared.modes?.ktShip?.() != null && shared.ketch ? shared.ketch.spoils : shared.modes?.sdRealmSlot?.() != null || shared.modes?.egHallBreach?.() != null ? shared.sdSpoilsPool : shared.spoilsPool);

  function sdFightHeard(w) {
    const slot = shared.modes?.sdRealmSlot?.();
    if (w?.k === 'bd') { bossCountFell(slot != null); return; }
    if (!shared.sdFightLink || slot == null || (w.k === 'st' && w.s !== slot)) return;
    _sdFightHeld = true;
    shared.sdFightLink.word(w);
  }

  const sdBodyFrame = () => {
    if (!shared.sdFightLink || shared.modes?.sdRealmSlot?.() == null || !shared.online?.bossOk) return;
    if (playerEntity.health > 0 && playerEntity.maxHealth > 0 && shared.sdFightLink.joined()) shared._sdSayBody(playerEntity.health / playerEntity.maxHealth, performance.now());
  };
  let _sdPassesWarm = false;
  const sdFightFrame = () => {
    if (!shared.sdFightLink) return;
    const inRealm = shared.modes?.sdRealmSlot?.() != null;
    if (!inRealm && shared._sdReceipts.size) shared.sdReceiptsLeft();
    if (!inRealm && _sdFightHeld) { shared.sdSpoilsBurst?.leave(); saveSoon.changed(); }
    if (!inRealm && _sdFightHeld) { shared.sdFightLink.leave(); shared.sdBlows?.leave(); shared.sdRemVoice?.leave(); shared.sdFx?.leave(); _sdFightHeld = false; }
    if (!inRealm) shared.sdFx?.away();
    if (!inRealm) _sdHall = null;
    if (inRealm && !_sdPassesWarm) { _sdPassesWarm = true; sdBeamPassOf(); shared.sdFx?.warm?.(renderer.gl); shared.sdBlows?.warm?.(); }
    if (inRealm) { try { shared.sdBlows?.frame(); } catch (e) { console.warn('[sd] blows', e?.message ?? e); } }
    if (inRealm && playerEntity.health > 0) { try { shared.sdRemVoice?.frame(); } catch (e) { console.warn('[sd] voice', e?.message ?? e); } }
    if (inRealm) { try { shared.sdFx?.frame(); } catch (e) { console.warn('[sd] fx', e?.message ?? e); } }
    if (inRealm) { try { shared.sdSpoilsBurst?.frame(); } catch (e) { console.warn('[sd] spoils', e?.message ?? e); } }
    let bar = null, ground = null, card = null;
    if (inRealm) {
      const [x, , z] = sdDungeonToRealm(player.pos[0], player.pos[1], player.pos[2]);
      const s = shared.sdFightLink.state(), now = shared.sdFightLink.now();
      const near = sdBarNear(x, z);
      if (near) bar = remnantBarModel(s, now);
      const peril = playerEntity.health > 0 ? sdPerilAt(s, now, x - SD_ARENA.x, z - SD_ARENA.z, cam.yaw, !!shared.sdBlows?.over?.()) : null;
      ground = sdGroundModel({ burning: !!shared.sdBlows?.burning?.(), el: shared.sdBlows?.burningEl?.() ?? null, now, peril });
      const beat = shared.sdBeats.frame(s, now);
      card = beat && (near || beat.kind === 'last' || beat.kind === 'fell') ? titleCardModel(beat, now) : null;
    } else shared.sdBeats.leave();
    let marks = null;
    if (inRealm) {
      const nowMs = performance.now();
      if (_sdMarksSince === null && !shared.gateVeil?.busy) _sdMarksSince = nowMs;
      marks = _sdMarksSince === null ? null : sdMarksCardModel(shared.sdFightLink.state()?.mk ?? sdMarksOf(shared.modes?.sdRealmSlot?.() ?? null), { since: _sdMarksSince, now: nowMs });
    } else _sdMarksSince = null;
    const hidden = gamePaused() || !!townTalk.hudHidden || !!shared.gateVeil?.busy;
    if (bar || _sdBarUp) { drawGateBossBar(bar, { hidden }); _sdBarUp = !!bar; }
    if (ground || _sdGroundUp) { drawGateGround(ground, { hidden }); _sdGroundUp = !!ground; }
    if (card || _sdCardUp) { drawSdTitleCard(card, { hidden }); _sdCardUp = !!card; }
    if (marks || _sdMarksUp) { drawGateMarksCard(marks, { hidden }); _sdMarksUp = !!marks; }
  };
  const sdFightAway = () => {
    if (_sdBarUp) { drawGateBossBar(null); _sdBarUp = false; }
    if (_sdGroundUp) { drawGateGround(null); _sdGroundUp = false; }
    if (_sdCardUp) { drawSdTitleCard(null); _sdCardUp = false; }
    if (_sdMarksUp) { drawGateMarksCard(null); _sdMarksUp = false; }
  };
  const sdHallWord = () => (_sdHall && _sdHall.s === shared.modes?.sdRealmSlot?.() ? _sdHall : null);
  const sdConcordHere = () => !!sdHallWord()?.ok && shared.modes?.dungeonCtx?.sdHallBridgeLaid?.() !== false;
  let _sdOmenPass;
  const sdOmenPassOf = () => {
    if (_sdOmenPass === undefined) { try { _sdOmenPass = new SdOmenPassRenderer(renderer.gl); } catch (e) { console.warn('[sd] the omen could not be built', e); _sdOmenPass = null; } }
    return _sdOmenPass;
  };
  let _sdFoot = { key: '', local: 0 };
  const sdOmenNow = () => {
    const o = shared.sdHost?.omen();
    if (!o || (shared.modes?.mode ?? 'exterior') !== 'exterior') return null;
    const p = playerTravelPixel();
    const { site, loc, key } = o.hollow;
    if (!sdOmenSeen(site, p.x, p.y)) return null;
    const t = state.pixelTranslation(site.px, site.py);
    const [lx, lz] = spawnedLocationCentreLocal(loc);
    let y = heightAt(t[0] + lx, t[2] + lz);
    if (!Number.isFinite(y)) {
      if (_sdFoot.key !== key) { const k = shared.woods ? sampleKernel(shared.woods, site.px, site.py) : null; _sdFoot = { key, local: k ? k(lx / heightCell, lz / heightCell) * worldHeight : 0 }; }
      y = _sdFoot.local + t[1];
    }
    return { origin: [t[0] + lx, y, t[2] + lz], fade: o.light };
  };
  const sdHollowAt = (h) => { const t = state.pixelTranslation(h.site.px, h.site.py), [lx, lz] = spawnedLocationCentreLocal(h.loc); return [t[0] + lx, t[2] + lz]; };
  const sdAirNow = (eye, minuteNow) => {
    const o = shared.sdHost?.omen();
    if (!o?.hollow?.site || (shared.modes?.mode ?? 'exterior') !== 'exterior' || !eye) return 0;
    const [x, z] = sdHollowAt(o.hollow);
    return sdAirWeight(o.light, Math.hypot(eye[0] - x, eye[2] - z), minuteNow);
  };
  const sdBannerNow = () => {
    const h = shared.sdHost?.hollow(), rec = shared.sdHost?.record();
    if (!h?.site || !rec || rec.s !== h.s || !walkMode || !shared.playerSpawned || (shared.modes?.mode ?? 'exterior') !== 'exterior') return null;
    if (!['risen', 'found', 'fell'].includes(shared.sdHost.phase())) return null;
    const [x, z] = sdHollowAt(h), f = player.feetAt();
    if (Math.hypot(f[0] - x, f[2] - z) > SD_BANNER_M) return null;
    const t = Date.now() + shared._sharedOffsetMs;
    return { text: sdBannerText(h.loc?.name, rec, t), card: shared.sdHost.phase() === 'fell' ? null : sdMarksCardModel(sdMarksOf(h.s), { mode: 'gate' }) };
  };

  const presenceFrame = () => {
    const sb = shared.sdHost ? sdBannerNow() : null, hidden = gamePaused() || !!townTalk.hudHidden || !!shared.gateVeil?.busy;
    drawGateBanner(shared._gateBannerWish ?? sb?.text ?? null, { hidden, look: shared._gateBannerWish == null && sb ? 'brass' : 'gate' });
    drawGateMarksCard(shared._gateMarksWish ?? sb?.card ?? null, { hidden });
  };
  const sdCompassMark = () => {
    const h = shared.sdHost?.mapMark() ? shared.sdHost.hollow() : null;
    if (!h?.site || (shared.modes?.mode ?? 'exterior') !== 'exterior') return null;
    const t = state.pixelTranslation(h.site.px, h.site.py);
    const [lx, lz] = spawnedLocationCentreLocal(h.loc);
    const at = [t[0] + lx, t[2] + lz];
    const f = player.feetAt();
    return Math.hypot(at[0] - f[0], at[1] - f[2]) <= SD_COMPASS_M ? at : null;
  };
  return {
    _sdRiftSky, _sdScanRow, drawSdArenaReads, floorPool, hourRezOpen, hourScoreFrame, presenceFrame, sdAirFrame,
    sdAirNow, sdArenaHeld, sdBeamPassOf, sdCastBack, sdCompassMark, sdConcordHere, sdFightAway, sdFightHeard, sdFrame,
    sdHallHeard, sdHallWord, sdHaloPassOf, sdHollowDoorsOf, sdHomeAge, sdHomeAt, sdMotesPassOf, sdOmenNow,
    sdOmenPassOf, sdRiftLookOf, sdRiftOf, sdRiftPassOf, sdSkyClockNow, sdSkyLookNow, sdVeilAim, sdWayBack,
    sweepSdLate,
  };
}
