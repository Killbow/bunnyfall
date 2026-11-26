import { ARENA_SCORE_SILENCE, arenaScoreSongs } from '../arena/arenaScore.js';
import { arenaDoorOpen } from '../ui/arenaDoor.js';
import { bossStandIn } from './gateBoss.js';
import { calculateAttackDamage } from '../combat/formulas.js';
import { CAPSULE_HEIGHT } from '../player/motor.js';
import { characterIdOf } from '../characters/characterId.js';
import { companionsWithYou } from '../characters/companionSlots.js';
import { COURT_TEXT } from './gateArena.js';
import { courtSaySeconds } from '../worldEvents/gateCourt.js';
import { DeathScreen } from '../ui/deathScreen.js';
import { DOOR_TYPE } from './meshReader.js';
import { drawGateBanner } from '../ui/gateBanner.js';
import { drawGateBossBar } from '../ui/gateBossBar.js';
import { drawGateMarksCard } from '../ui/gateMarksView.js';
import { exhibitionFor } from '../arena/arenaLadder.js';
import { findGateSite, gateScanner } from '../worldEvents/gateSite.js';
import { GATE_COLLAPSE_MS, gateTimes } from '../net/gateLaw.js';
import { GATE_NO_TEXT } from '../net/gateLink.js';
import { GATE_SONGS, gateScoreSongs, SCORE_SILENCE } from '../worldEvents/gateScore.js';
import { gateSceneXZ, insideGateRing } from '../worldEvents/gateOmen.js';
import { hallRememberLine } from '../net/npcChapterLaw.js';
import { HEIGHTMAP_DIMENSION, sampleKernel, TERRAIN_SIZE } from './terrainSampler.js';
import { hudRenderEnabled } from '../ui/hudShortcuts.js';
import { insideSerpentRing } from '../worldEvents/serpentOmen.js';
import { isArenaCity, isUndercroftDoor, undercroftLocation } from './arenaCity.js';
import { isTouchDevice } from '../ui/touchDevice.js';
import { maxFatigue } from '../characters/statMods.js';
import { music } from '../audio/music.js';
import { nearestFirstFrom } from './streamingWorld.js';
import { playerEntity } from '../characters/playerEntity.js';
import { readReceipt } from '../net/gateReceipt.js';
import { SAND_R } from './arenaFloor.js';
import { serpentBarModel } from '../ui/serpentBar.js';
import { SerpentRenderer } from '../render/serpentRender.js';
import { setMidScreenText } from '../ui/midScreenText.js';
import { shaftOnRelayBody } from '../combat/arrowFlight.js';
import { worldMinutes } from './worldTick.js';

/** @param {any} shared */
export function createGatesWorld(shared) {
  const {
    _courtScore, _gateClaimsFrom, _spawnSalt, _undercrofts, arenaBouts, arenaCityStage, arenaSessionBtn, arenaSound,
    arenaStageNow, built, cam, courtFireBeds, deadlandsAir, deadlandsShared, destroyPixel, egClient, ejectFromCourt,
    gambitClaims, gamePaused, gateClaims, gateClearSweep, gateCourt, gateLink, gateOmen, gateVeil, heightCell,
    iliacClaims, landform, landformsHere, leaveBattle, locationIndex, maps, motherlodeBook, player, playerTravelPixel,
    profBook, queue, raidClaims, renderer, resendSpentWords, rollTracker, sdClaims, seatBook, serpentClaims,
    serpentOmen, serpentSpell, serpentStandIn, socialLink, state, terrainGen, townTalk, walkMode, weaponRig,
    worldHeight,
  } = shared;
  function sweepGateClear() {
    const clear = shared._gateClearNow();
    const again = gateClearSweep.step(clear, built).map((p) => ({ px: p.px, py: p.py }));
    if (!again.length) return;
    const under = `${state.current.x},${state.current.y}`;
    if (walkMode && shared.playerSpawned && again.some((k) => `${k.px},${k.py}` === under)) shared._seasonHoldKey = under;
    for (const k of again) destroyPixel(k.px, k.py, { collectLoose: false });
    queue.push(...again.sort(nearestFirstFrom(state.current)));
    console.log(`[gate] ${again.length} pixel(s) built again for the breach's clearing${clear ? ` (${clear.key})` : ''}`);
  }

  function serpentArrowOn(m, target) {
    const dmg = shaftOnRelayBody(m, serpentStandIn(), calculateAttackDamage(playerEntity, serpentStandIn(), { weapon: m.weapon ?? null, rolls: Math.random }));
    if (dmg > 0) shared.serpentHost?.handStruck?.(target, dmg);
  }

  function arenaFrame(dt) {
    shared._arenaFrames++;
    shared.arenaOnline?.tick(); arenaSessionBtn.frame(!!shared.arenaOnline?.inSession?.() && !arenaDoorOpen() && !townTalk.overlay && hudRenderEnabled());
    const stg = arenaStageNow();
    arenaBouts.setStage(stg);
    if (stg === arenaCityStage && !arenaBouts.bout() && !arenaBouts.pending() && !gamePaused()) {
      const ex = exhibitionFor(worldMinutes());
      if (shared.arenaOnline?.exhibitions?.() || shared.arenaOnline?.waiting?.()) shared.arenaOnline.watchCity(ex);
      else if (ex?.open && ex.hour !== shared._arenaHourRun) { shared._arenaHourRun = ex.hour; arenaBouts.ask({ where: 'city', kind: 'exhibition', ex }); }
    }
    if (!stg) { arenaBouts.frame(dt, {}); if (!arenaBouts.bout()) arenaSound.stop(); return; }
    const inDungeon = (shared.modes?.mode ?? 'exterior') === 'dungeon';
    const rig = inDungeon ? shared.modes?.dungeonCtx?.weaponRig?.() : weaponRig;
    arenaBouts.frame(gamePaused() ? 0 : dt, {
      playerFeet: player.pos, playerYaw: cam.yaw, sheathed: rig?.playerWeapon ? !!rig.playerWeapon.sheathed : null,
      stamina: (playerEntity.fatigue ?? 0) / Math.max(1, maxFatigue(playerEntity)),
      hidden: gamePaused() || !!townTalk.hudHidden, touch: isTouchDevice(),
    });
  }

  function arenaDoorTarget(e) {
    const city = locationIndex.get(e.pixelKey);
    if (!isUndercroftDoor(e, DOOR_TYPE.DUNGEON_ENTRANCE) || !isArenaCity(city)) return { dfLocation: city, group: e.pixelKey };
    let u = _undercrofts.get(city);
    if (!u) { u = undercroftLocation(city); _undercrofts.set(city, u); }
    return { dfLocation: u, group: `${e.pixelKey}:undercroft` };
  }

  // A scanner that throws is dropped, so the next call starts a fresh scan instead of resuming a broken one.
  const gateScanOf = (more) => {
    if (shared._gateScan || !maps) return shared._gateScan;
    try {
      shared._gateScanner ??= gateScanner(maps, { spawnSalt: _spawnSalt, heightAt: (x, y) => shared.woods.getHeightMapValue(x, y) });
      return (shared._gateScan = shared._gateScanner.step(more));
    } catch (e) { shared._gateScanner = null; throw e; }
  };
  let _gateWarming = false;
  const warmGateScan = () => {
    if (shared._gateScan || _gateWarming || !maps || typeof globalThis.requestIdleCallback !== 'function') return;
    _gateWarming = true;
    globalThis.requestIdleCallback(function slice(deadline) {
      const until = performance.now() + (deadline.didTimeout ? 4 : 0);
      try { if (!gateScanOf(() => deadline.timeRemaining() > 2 || performance.now() < until)) { globalThis.requestIdleCallback(slice, { timeout: 250 }); return; } } catch (e) { console.warn('[gate] no site', e?.message ?? e); }
      _gateWarming = false;
    }, { timeout: 4000 });
  };
  const _gateTwo = (n) => String(n).padStart(2, '0');

  const gateSeatWord = (r) => {
    const c = readReceipt(r);
    let site = null;
    try { site = c && shared._gateScan ? findGateSite(c.d, shared._gateScan) : null; } catch { site = null; }
    const character = characterIdOf(playerEntity);
    return site ? { region: site.region, character } : character ? { character } : null;
  };
  const weirHeard = (/** @type {any} */ a) => {
    const w = a?.ok ? a.data?.weir : null;
    if (w && Number.isSafeInteger(w.keys)) {
      egClient?.restack(w.keys);
      if (w.found) { shared.chatNotice("You find a Weir Key, one of the Spire's portal keys. Use it to open an Elite Breach."); egClient?.beat('key'); }
    }
    return a;
  };
  const rollHeard = (/** @type {any} */ a) => {
    const c = a?.ok ? a.data?.chapters : null;
    if (c?.counted) {
      rollTracker?.refresh();
      const merit = (c.merit ?? []).reduce((n, /** @type {any} */ x) => n + (Number(x?.amount) || 0), 0);
      const line = hallRememberLine((c.credited ?? []).map((x) => x.f), merit);
      if (line) shared.chatNotice(line);
    }
    weirHeard(a);
    return a;
  };
  // A stored receipt claim waits up to `GATE_SCAN_WAIT_MS` for the gate scan, because the service counts seats and
  // chapters only for a claim that names a region.
  const GATE_SCAN_WAIT_MS = 90_000;

  const gateClaimReady = () => {
    if (shared._gateScan || Date.now() - _gateClaimsFrom >= GATE_SCAN_WAIT_MS) return true;
    warmGateScan();
    return false;
  };

  // The bout opponent is a stand-in entity, not a player, so powers that refuse to hit a player must read this duel
  // flag instead.
  const arenaPvpLive = () => { const b = shared.arenaOnline?.bout(), r = arenaBouts.relay(); return !!b && b.kind === 'pvp' && !!r?.me; };
  let _arenaRivalEntity = null;
  function arenaRivalBody() {
    const b = shared.arenaOnline?.bout(), r = arenaBouts.relay();
    if (!b || b.kind !== 'pvp' || !r || !r.me) return null;
    // The room also holds spectators, so the opponent is the peer on the sand with the bout's name, else the
    // nearest peer on the sand.
    const sand = shared.modes?.arenaFloorStage?.()?.centre?.() ?? null, me = player.feetAt(), vsName = b.vs?.n ?? null, onSand = (shared.peersNear() ?? []).filter((p) => p?.feet && (!sand || (Math.hypot(p.feet[0] - sand[0], p.feet[2] - sand[2]) <= SAND_R && Math.abs(p.feet[1] - sand[1]) < 2))).sort((x, y) => Math.hypot(x.feet[0] - me[0], x.feet[2] - me[2]) - Math.hypot(y.feet[0] - me[0], y.feet[2] - me[2])); const peer = onSand.find((p) => vsName && shared.online?.peers?.get?.(p.id)?.name === vsName) ?? onSand[0];
    if (!peer?.feet) return null;
    if (!_arenaRivalEntity) { _arenaRivalEntity = bossStandIn({ mobile: 0 }, b.vs?.n ?? 'Your opponent'); _arenaRivalEntity.armor = 100; _arenaRivalEntity.armorValues = new Array(7).fill(100); _arenaRivalEntity.skills = 0; _arenaRivalEntity.spareGear = true; }
    _arenaRivalEntity.name = b.vs?.n ?? _arenaRivalEntity.name;
    return { i: r.me === 'p0' ? 'p1' : 'p0', entity: _arenaRivalEntity, feet: peer.feet, height: peer.height ?? CAPSULE_HEIGHT, radius: 0.4, yaw: 0 };
  }

  const deadlandsSeconds = () => egClient?.spanSeconds() ?? deadlandsShared();

  const _courtFog = { mode: 0, density: 0, range: null, color: null, camPos: null };
  const courtFogNow = () => { _courtFog.mode = renderer._fogMode; _courtFog.density = renderer._fogDensity; _courtFog.range = renderer._fogRange; _courtFog.color = renderer._fogColor; _courtFog.camPos = renderer._camPos; return _courtFog; };

  const reportGateSite = () => {
    const s = shared._gateClearNow() ? shared._gateClearOf.site : null;
    if (s) socialLink()?.sendGateSite?.(s.day, s.px, s.py, s.place);
  };

  let _courtAloneSaid = false;
  const courtAloneFrame = () => {
    if (shared.modes?.gateArenaDay?.() == null) { _courtAloneSaid = false; return; }
    if (_courtAloneSaid || shared.modes?.transitioning || gateVeil?.busy || gamePaused()) return;
    _courtAloneSaid = true;
    if (companionsWithYou() > 0) setMidScreenText(COURT_TEXT.noCompanions, courtSaySeconds(COURT_TEXT.noCompanions));
  };
  const gateFrame = () => {
    try { gateOmen?.frame(); } catch (e) { console.warn('[gate] frame', e?.message ?? e); }
    gateClaims?.tick();
    if (gateOmen) reportGateSite();
    resendSpentWords();
    raidClaims?.tick();
    if (profBook?.state.open === true) { try { motherlodeBook?.tick({ sense: profBook.track('mining').specs?.[100] === 'motherlode-sense' }); } catch (e) { console.warn('[motherlode] frame', e?.message ?? e); } }
    if (seatBook?.claimWatchDue()) seatBook.claimWatch();
    { const g = shared.guildBook?.guild?.id ?? null; if (g && seatBook?.towersDue(g)) seatBook.towers(g, (t) => townTalk.say(t, 6)).catch(() => {}); }
    seatBook?.redTick();
    if (shared.siegeClaims?.due()) shared.siegeClaims.offer();
    if (shared.royalClaims?.due()) shared.royalClaims.offer();
    shared.siegeHerald?.tick();
    if (townTalk.overlay instanceof DeathScreen || shared.modes?.deathUp?.()) { leaveBattle(); shared._watchedFrom = null; }
    if ((shared.gatePool || shared.sdHost) && (shared.modes?.mode ?? 'exterior') !== 'exterior') drawGateBanner(null);
    if ((shared.gatePool || shared.sdHost) && (shared.modes?.mode ?? 'exterior') !== 'exterior' && shared.modes?.gateArenaDay?.() == null && shared.modes?.sdRealmSlot?.() == null) drawGateMarksCard(null);
    const courtDay = shared.modes?.gateArenaDay?.() ?? null;
    if (courtDay != null && Date.now() + shared._sharedOffsetMs >= gateTimes(courtDay).wrathAt + GATE_COLLAPSE_MS) {
      try { gateCourt?.frame(); } catch (e) { console.warn('[gate] court', e?.message ?? e); }
      ejectFromCourt(COURT_TEXT.collapse);
    }
    else if (courtDay != null && shared.online?.terminal) ejectFromCourt(GATE_NO_TEXT[shared.online.error] ?? COURT_TEXT.lost);
    else if (courtDay != null && gateCourt?.silent()) ejectFromCourt(COURT_TEXT.lost);
    else if (courtDay == null && gateLink && gateLink.state().day != null) gateLink.leave();
    try { gateCourt?.frame(); } catch (e) { console.warn('[gate] court', e?.message ?? e); }
    courtAloneFrame();
  };

  let _serpentRender;
  const serpentRenderer = () => {
    if (_serpentRender !== undefined) return _serpentRender;
    try { _serpentRender = new SerpentRenderer(renderer); } catch (e) { console.warn('[serpent] the renderer would not build', e?.message ?? e); _serpentRender = null; }
    return _serpentRender;
  };

  let _serpentBarUp = false;

  const serpentFrame = () => {
    try { serpentOmen?.frame(); } catch (e) { console.warn('[serpent] omen', e?.message ?? e); }
    try { const a = serpentOmen?.ahead?.(); if (a) socialLink()?.sendSerpentSite?.(a.day, a.site.sx, a.site.sz, a.site.near); } catch (e) { console.warn('[serpent] site word', e?.message ?? e); }
    serpentClaims?.tick();
    sdClaims?.tick();
    iliacClaims?.tick();
    gambitClaims?.tick();
    shared._serpentFight = false;
    if (!shared.serpentHost) return;
    const street = (shared.modes?.mode ?? 'exterior') === 'exterior' && shared.playerSpawned && playerEntity.health > 0 && !shared.modes?.deathUp?.();
    let fight = false;
    try { fight = street && shared.serpentHost.frame(); } catch (e) { console.warn('[serpent] frame', e?.message ?? e); }
    shared._serpentFight = !!fight;
    serpentSpell.frame(fight);
    const bar = fight ? shared.serpentHost.bar() : null;
    if (bar || _serpentBarUp) {
      drawGateBossBar(bar ? serpentBarModel(bar) : null, { hidden: gamePaused() || !!townTalk.hudHidden });
      _serpentBarUp = !!bar;
    }
  };
  const serpentAway = (offline) => {
    if (_serpentBarUp) { drawGateBossBar(null); _serpentBarUp = false; }
    if (offline) { shared.serpentHost?.leave(); serpentOmen?.reset(); }
  };
  const serpentCompassMark = () => {
    const sw = serpentOmen?.swimming?.();
    const mark = sw ? serpentOmen.mapMark() : null;
    if (!sw || !mark || (shared.modes?.mode ?? 'exterior') !== 'exterior') return null;
    const p = playerTravelPixel();
    return insideSerpentRing(mark, p.x, p.y) ? state.localFromWorld(sw.site.sx, sw.site.sz) : null;
  };
  // Ticked on the main frame, online or not: leaving the court includes going offline, and the online frame does
  // not run then.
  let _scoreHeld = false, _scoreMade = false;

  const gateScoreFrame = () => {
    if (shared.modes?.gateArenaDay?.() == null) {
      if (_scoreHeld) { _scoreHeld = false; music.fadeOut(); }
      return false;
    }
    if (!_scoreMade) { _scoreMade = true; for (const song of Object.values(gateScoreSongs())) music.registerSong(song.name, song); }
    _scoreHeld = true;
    const want = _courtScore.want(gateLink?.state?.() ?? null, Date.now() + shared._sharedOffsetMs) ?? GATE_SONGS.war1;
    if (want === SCORE_SILENCE) { if (music.current !== null) music.fadeOut(); } else music.playSong(want);
    return true;
  };

  let _arenaScoreHeld = false, _arenaScoreMade = false;
  const arenaScoreFrame = () => {
    const want = arenaBouts.scoreWant();
    if (want == null) {
      if (_arenaScoreHeld) { _arenaScoreHeld = false; music.fadeOut(); }
      return false;
    }
    if (!_arenaScoreMade) { _arenaScoreMade = true; for (const song of Object.values(arenaScoreSongs())) music.registerSong(song.name, song); }
    _arenaScoreHeld = true;
    if (want === ARENA_SCORE_SILENCE) { if (music.current !== null) music.fadeOut(); } else music.playSong(want);
    return true;
  };
  const deadlandsAirFrame = () => { if (shared.modes?.gateArenaDay?.() != null) deadlandsAir.frame(deadlandsSeconds(), cam.pos, courtFireBeds); else deadlandsAir.stop(); };

  let _veilWarmed = false;
  const warmGateVeil = () => {
    if (_veilWarmed || !gateVeil) return;
    _veilWarmed = true;
    const idle = globalThis.requestIdleCallback ? (f) => globalThis.requestIdleCallback(f, { timeout: 4000 }) : (f) => setTimeout(f, 1500);
    idle(() => { try { gateVeil.warm(); } catch { } });
  };
  // Samples the terrain kernel over WOODS.WLD, which matches the later build because no location lies within a
  // pixel of a gate, so no blending moves the samples.
  let _gateKernel = null, _gateKernelAt = '';
  const gateGroundAt = (px, py, x, z) => {
    if (!shared.woods) return -Infinity;
    const key = `${px},${py},${landform && terrainGen.roads() ? 1 : 0}`;
    if (key !== _gateKernelAt) { _gateKernelAt = key; _gateKernel = sampleKernel(shared.woods, px, py, HEIGHTMAP_DIMENSION, true, landformsHere()); }
    const t = state.pixelTranslation(px, py);
    const lx = x - t[0], lz = z - t[2];
    if (!(lx >= 0 && lz >= 0 && lx <= TERRAIN_SIZE && lz <= TERRAIN_SIZE)) return -Infinity;
    return _gateKernel(lx / heightCell, lz / heightCell) * worldHeight + t[1];
  };

  const _lefayT = [0, 0, 0], _lefaySite = [0, 0, 0];

  const gateCompassMark = () => {
    const g = gateOmen?.standing();
    const mark = g ? gateOmen.mapMark() : null;
    if (!g || !mark || (shared.modes?.mode ?? 'exterior') !== 'exterior') return null;
    const p = playerTravelPixel();
    return insideGateRing(mark, p.x, p.y) ? gateSceneXZ(g, state.pixelTranslation(g.px, g.py)) : null;
  };
  return {
    _gateTwo, _lefaySite, _lefayT, arenaDoorTarget, arenaFrame, arenaPvpLive, arenaRivalBody, arenaScoreFrame,
    courtFogNow, deadlandsAirFrame, deadlandsSeconds, gateClaimReady, gateCompassMark, gateFrame, gateGroundAt,
    gateScanOf, gateScoreFrame, gateSeatWord, rollHeard, serpentArrowOn, serpentAway, serpentCompassMark,
    serpentFrame, serpentRenderer, sweepGateClear, warmGateScan, warmGateVeil, weirHeard,
  };
}
