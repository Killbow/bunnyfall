// The world's gates and arena: the arena's frame, door, rival, and score, and the Oblivion gate's
// frame, scan, veil, ground, seat word, score, and compass mark. It also holds the serpent's
// frames, the gate court's fog and its no-companions word, and the gate site report to the hub.
// The online hosts, the claim clients, and the spoils store stay in the world.
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
    for (const k of again) destroyPixel(k.px, k.py, { collectLoose: false });   // the carry keeps the markers, as the late sweep's
    queue.push(...again.sort(nearestFirstFrom(state.current)));
    console.log(`[gate] ${again.length} pixel(s) built again for the breach's clearing${clear ? ` (${clear.key})` : ''}`);
  }

  /** SERPENT4: a shaft of mine in its hide (arrowFlight.js boxTargets) - WeaponManager's own damage of it, to the host (AUDIT MARTIAL L2 F5: a technique's weighed and told, what the blow owes it carried - shaftOnRelayBody). */
  function serpentArrowOn(m, target) {
    const dmg = shaftOnRelayBody(m, serpentStandIn(), calculateAttackDamage(playerEntity, serpentStandIn(), { weapon: m.weapon ?? null, rolls: Math.random }));
    if (dmg > 0) shared.serpentHost?.handStruck?.(target, dmg);
  }

  function arenaFrame(dt) {
    shared._arenaFrames++;
    shared.arenaOnline?.tick(); arenaSessionBtn.frame(!!shared.arenaOnline?.inSession?.() && !arenaDoorOpen() && !townTalk.overlay && hudRenderEnabled());   // ARENA4: the receipts, the hall, my `in` on a relay's sand; HOTFIX 1003f: the session's button while a session holds me and no window stands
    const stg = arenaStageNow();
    arenaBouts.setStage(stg);
    if (stg === arenaCityStage && !arenaBouts.bout() && !arenaBouts.pending() && !gamePaused()) {
      const ex = exhibitionFor(worldMinutes());
      // ARENA4b: ONLINE THE HOUR'S BOUT IS THE RELAY'S - its room watched from the city's sand (scenes/arena/arenaOnline.js
      // watchCity), every screen the one bout; offline, or on a relay before it, this screen's own seeded bout as ever
      if (shared.arenaOnline?.exhibitions?.() || shared.arenaOnline?.waiting?.()) shared.arenaOnline.watchCity(ex);   // FIELD BUGS 2026-10-16b ARENA-WAIT: the online lane before the relay's word stands nothing of its own
      else if (ex?.open && ex.hour !== shared._arenaHourRun) { shared._arenaHourRun = ex.hour; arenaBouts.ask({ where: 'city', kind: 'exhibition', ex }); }
    }
    if (!stg) { arenaBouts.frame(dt, {}); if (!arenaBouts.bout()) arenaSound.stop(); return; }
    const inDungeon = (shared.modes?.mode ?? 'exterior') === 'dungeon';
    const rig = inDungeon ? shared.modes?.dungeonCtx?.weaponRig?.() : weaponRig;
    arenaBouts.frame(gamePaused() ? 0 : dt, {
      playerFeet: player.pos, playerYaw: cam.yaw, sheathed: rig?.playerWeapon ? !!rig.playerWeapon.sheathed : null,   // ARENA5: my facing, for the replay
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

  /** AUDIT WB C7: THE SITE'S SCAN (systems/gate/gateSite.js gateScanner) - begun in the browser's idle moments once the relay's
   *  clock is read, a few rows a slice, so no frame pays for the half-million pixels; a site asked before it is done
   *  finishes it there and then. A scan that throws is begun again from nothing, not resumed. */
  const gateScanOf = (more) => {
    if (shared._gateScan || !maps) return shared._gateScan;
    try {
      shared._gateScanner ??= gateScanner(maps, { spawnSalt: _spawnSalt, heightAt: (x, y) => shared.woods.getHeightMapValue(x, y) });   // AUDIT WB C1: the height bytes say where the sea is - the climate page has been spread into it
      return (shared._gateScan = shared._gateScanner.step(more));
    } catch (e) { shared._gateScanner = null; throw e; }
  };
  let _gateWarming = false;
  const warmGateScan = () => {
    if (shared._gateScan || _gateWarming || !maps || typeof globalThis.requestIdleCallback !== 'function') return;
    _gateWarming = true;
    globalThis.requestIdleCallback(function slice(deadline) {
      // a page that is never idle still gets there: a slice the timeout forced takes 4 ms of rows and asks again soon
      const until = performance.now() + (deadline.didTimeout ? 4 : 0);
      try { if (!gateScanOf(() => deadline.timeRemaining() > 2 || performance.now() < until)) { globalThis.requestIdleCallback(slice, { timeout: 250 }); return; } } catch (e) { console.warn('[gate] no site', e?.message ?? e); }
      _gateWarming = false;
    }, { timeout: 4000 });
  };
  const _gateTwo = (n) => String(n).padStart(2, '0');

  /** SEAT1b (Seats-Arc 4.2): a kill's REGION, as this client's own scan of the map puts the day's gate - the service counts
   *  the kill's influence where three claims agree on it - and the character claiming (its guild's war); null before the
   *  scan has finished, and the kill is claimed as before. */
  const gateSeatWord = (r) => {
    const c = readReceipt(r);
    let site = null;
    try { site = c && shared._gateScan ? findGateSite(c.d, shared._gateScan) : null; } catch { site = null; }
    const character = characterIdOf(playerEntity);
    // SILVER-WAYS: the claiming character always - its guild's deed asks it, where the scan has not found the region
    return site ? { region: site.region, character } : character ? { character } : null;
  };
  /** CHAP2b (Chapters-Arc 3.3, 4): a receipt the service credited to the character's chapters moved its Roll on the
   *  service - the tab asks the Roll's word at once (npcRollTracker.js refresh) and the guilds' memory is said. */
  /** EG-PLAY: a claim's answer that rolled for a Weir Key (`weir` - server-account/src/eg.js rollWeirKey): the pack restacked to
   *  the account's balance, a find said. */
  const weirHeard = (/** @type {any} */ a) => {
    const w = a?.ok ? a.data?.weir : null;
    if (w && Number.isSafeInteger(w.keys)) {
      egClient?.restack(w.keys);
      if (w.found) { shared.chatNotice("You find a Weir Key, one of the Spire's portal keys. Use it to open an Elite Breach."); egClient?.beat('key'); }   // EG-G1: the Rare chime (section 27.5)
    }
    return a;
  };
  const rollHeard = (/** @type {any} */ a) => {
    const c = a?.ok ? a.data?.chapters : null;
    if (c?.counted) {
      rollTracker?.refresh();
      // AUDIT CHAP3 C8: and the Merit its chapters counted it, as a member's own writ's line says its own
      const merit = (c.merit ?? []).reduce((n, /** @type {any} */ x) => n + (Number(x?.amount) || 0), 0);
      const line = hallRememberLine((c.credited ?? []).map((x) => x.f), merit);
      if (line) shared.chatNotice(line);
    }
    weirHeard(a);   // EG-PLAY: and the Weir Key a gate's claim rolled
    return a;
  };
  /** AUDIT CHAP3 C3: a kept receipt's claim, offered as the page comes up, waits for the gate's scan - its region is the
   *  seats' and the chapters' word, and a claim without one counts for neither - GATE_SCAN_WAIT_MS at most; past it the
   *  claim goes as before, with no region. */
  const GATE_SCAN_WAIT_MS = 90_000;

  const gateClaimReady = () => {
    if (shared._gateScan || Date.now() - _gateClaimsFrom >= GATE_SCAN_WAIT_MS) return true;
    warmGateScan();
    return false;
  };

  /** AUDIT 625 P2: A BOUT BETWEEN PLAYERS IS A DUEL. While I fight in one on a relay's sand (its call to its end), the
   *  duel's word stands (duelFrame: systems/sigil/sigil.js setSigilDueling) and every power that sleeps in a duel sleeps - the
   *  sets, the loot's powers, the weapon's sigil. My opponent is a Daedra Lord's stand-in for the formulas (below), no
   *  player, so the gates that refuse a blow at a player never saw one: a set's Constrict, a sigil's per cent, a
   *  Legendary's thorns all bit in the ring, and the sets' shields stood. */
  const arenaPvpLive = () => { const b = shared.arenaOnline?.bout(), r = arenaBouts.relay(); return !!b && b.kind === 'pvp' && !!r?.me; };
  /** ARENA4: MY OPPONENT on a relay's sand, as a body my blows meet (scenes/dungeonContext.js arenaRivalBody): the one
   *  body the bout's room draws (the stands have none), its stand-in for the formulas - unarmoured, every blow's number
   *  the referee's to judge. Null outside a bout between players. */
  let _arenaRivalEntity = null;
  function arenaRivalBody() {
    const b = shared.arenaOnline?.bout(), r = arenaBouts.relay();
    if (!b || b.kind !== 'pvp' || !r || !r.me) return null;
    const sand = shared.modes?.arenaFloorStage?.()?.centre?.() ?? null, me = player.feetAt(), vsName = b.vs?.n ?? null, onSand = (shared.peersNear() ?? []).filter((p) => p?.feet && (!sand || (Math.hypot(p.feet[0] - sand[0], p.feet[2] - sand[2]) <= SAND_R && Math.abs(p.feet[1] - sand[1]) < 2))).sort((x, y) => Math.hypot(x.feet[0] - me[0], x.feet[2] - me[2]) - Math.hypot(y.feet[0] - me[0], y.feet[2] - me[2])); const peer = onSand.find((p) => vsName && shared.online?.peers?.get?.(p.id)?.name === vsName) ?? onSand[0];   // HOTFIX 1003j (live: "PVP isn't working. Players arent taking damage now"): world156 draws the stands, so the room's first peer was often a watcher - my blows met a body standing where a spectator stood; my opponent is the one on the sand (by name, else the nearest) - HOTFIX 1003k: the floor's sand, never the bout driver's ring (a ladder bout's alone: null in every bout between players, so the filter fell through to the nearest peer, a watcher's whenever one stood nearer)
    if (!peer?.feet) return null;
    if (!_arenaRivalEntity) { _arenaRivalEntity = bossStandIn({ mobile: 0 }, b.vs?.n ?? 'Your opponent'); _arenaRivalEntity.armor = 100; _arenaRivalEntity.armorValues = new Array(7).fill(100); _arenaRivalEntity.skills = 0; _arenaRivalEntity.spareGear = true; }
    _arenaRivalEntity.name = b.vs?.n ?? _arenaRivalEntity.name;
    return { i: r.me === 'p0' ? 'p1' : 'p0', entity: _arenaRivalEntity, feet: peer.feet, height: peer.height ?? CAPSULE_HEIGHT, radius: 0.4, yaw: 0 };
  }

  const deadlandsSeconds = () => egClient?.spanSeconds() ?? deadlandsShared();

  const _courtFog = { mode: 0, density: 0, range: null, color: null, camPos: null };
  const courtFogNow = () => { _courtFog.mode = renderer._fogMode; _courtFog.density = renderer._fogDensity; _courtFog.range = renderer._fogRange; _courtFog.color = renderer._fogColor; _courtFog.camPos = renderer._camPos; return _courtFog; };

  /** DISCORD-GATES: THIS GAME'S WORD OF WHERE THE GATE STANDS, to the hub (net/online.js sendGateSite, once a socket and
   *  day): the clearing's own site - the gate the clock is about, from its scan's end on, ~85 real minutes before its
   *  omen. The hub names the place in its Discord posts once two accounts agree (net/gate/gateHerald.js). */
  const reportGateSite = () => {
    const s = shared._gateClearNow() ? shared._gateClearOf.site : null;
    if (s) socialLink()?.sendGateSite?.(s.day, s.px, s.py, s.place);
  };

  /** GATE-ALONE (2026-10-07, Mac: "We need to not allow followers inside the oblivion gates"): no companion stands in a
   *  gate's court (companionPlace answers none there), and a fighter who steps in with any at their side is told so -
   *  once each time they step in, when the step's fire has opened over the court (the veil covers the HUD); owed again
   *  once they are out. */
  let _courtAloneSaid = false;
  const courtAloneFrame = () => {
    if (shared.modes?.gateArenaDay?.() == null) { _courtAloneSaid = false; return; }
    if (_courtAloneSaid || shared.modes?.transitioning || gateVeil?.busy || gamePaused()) return;
    _courtAloneSaid = true;
    if (companionsWithYou() > 0) setMidScreenText(COURT_TEXT.noCompanions, courtSaySeconds(COURT_TEXT.noCompanions));
  };
  /** WB1: the gate's frame - its line when a new moment comes. Runs before the death return, as the chat's does. */
  const gateFrame = () => {
    try { gateOmen?.frame(); } catch (e) { console.warn('[gate] frame', e?.message ?? e); }
    gateClaims?.tick();   // WB5b: what the account service has not counted yet, offered again on its own clock
    if (gateOmen) reportGateSite();   // DISCORD-GATES: where the gate stands, to the hub
    resendSpentWords();   // AUDIT SD II (L5 F4): the spent words a pool still owes the hub
    raidClaims?.tick();   // RAID4: and the raids' receipts, on theirs
    if (profBook?.state.open === true) { try { motherlodeBook?.tick({ sense: profBook.track('mining').specs?.[100] === 'motherlode-sense' }); } catch (e) { console.warn('[motherlode] frame', e?.message ?? e); } }   // PROF2b: the day's Motherlodes read, warned of and stood
    if (seatBook?.claimWatchDue()) seatBook.claimWatch();   // SEAT1b: the Watch's kept ticks, claimed a claim's worth or ten minutes at a time   // AUDIT-SEATS C12: asked in sync first - no Promise a frame
    { const g = shared.guildBook?.guild?.id ?? null; if (g && seatBook?.towersDue(g)) seatBook.towers(g, (t) => townTalk.say(t, 6)).catch(() => {}); }   // SEAT2b part two (7.5): the Watchtowers' word to a holder's member, ten minutes apart
    seatBook?.redTick();   // CROWN2: the seats' list read again for the server's red lines
    if (shared.siegeClaims?.due()) shared.siegeClaims.offer();   // AUDIT-SEATS C5: a battle's receipt the service has not settled, offered again on its own clock (SIEGE_CLAIM_RETRY_MS)
    if (shared.royalClaims?.due()) shared.royalClaims.offer();   // AUDIT-SEATS C5: and a bout's - before its week is over and the service answers `royal-over`
    shared.siegeHerald?.tick();   // AUDIT-SEATS G1: the battles announced in red, at their marks
    if (townTalk.overlay instanceof DeathScreen || shared.modes?.deathUp?.()) { leaveBattle(); shared._watchedFrom = null; }   // AUDIT-SEATS C1: the dead fight in no battle - its HUD stood frozen over the death screen (the battle's tick is the living online frame's); G4: and a spectator's spot is the respawn's to replace
    if ((shared.gatePool || shared.sdHost) && (shared.modes?.mode ?? 'exterior') !== 'exterior') drawGateBanner(null);   // WB2: the countdown is the street's; the pool's own frame runs there alone (SD19: and a Hollow's door's)
    if ((shared.gatePool || shared.sdHost) && (shared.modes?.mode ?? 'exterior') !== 'exterior' && shared.modes?.gateArenaDay?.() == null && shared.modes?.sdRealmSlot?.() == null) drawGateMarksCard(null);   // WB9a: the gate's card is the street's, the court draws its own - anywhere else, none (SD18b: the Hour draws its own marks on it)
    // WB3b: the court stands until its gate's day is over - then it comes apart around whoever is in it, who land
    // before the gate; out of it, its state is forgotten (its falls and receipts are kept)
    const courtDay = shared.modes?.gateArenaDay?.() ?? null;
    if (courtDay != null && Date.now() + shared._sharedOffsetMs >= gateTimes(courtDay).wrathAt + GATE_COLLAPSE_MS) {
      // AUDIT WBX F10: a screen asleep through midnight and the collapse lands the Wrath first (the court's own frame,
      // once) - the collapse carried it out of the court alive; now it goes by the death's own door (ejectFromCourt)
      try { gateCourt?.frame(); } catch (e) { console.warn('[gate] court', e?.message ?? e); }
      ejectFromCourt(COURT_TEXT.collapse);
    }
    else if (courtDay != null && shared.online?.terminal) ejectFromCourt(GATE_NO_TEXT[shared.online.error] ?? COURT_TEXT.lost);   // AUDIT WB B5: a socket closed for good (a hello refused - its own words - or replaced) holds no fight: its boss would stand frozen
    else if (courtDay != null && gateCourt?.silent()) ejectFromCourt(COURT_TEXT.lost);   // AUDIT GATE-FBX C1: a court gone silent (a stalled relay, a room that never answered, a socket still retrying) - no door stands in it until he falls
    else if (courtDay == null && gateLink && gateLink.state().day != null) gateLink.leave();
    try { gateCourt?.frame(); } catch (e) { console.warn('[gate] court', e?.message ?? e); }   // WB4: the fight on this screen (out of the court it puts itself away)
    courtAloneFrame();   // GATE-ALONE: my companions wait outside - said as I step in
  };

  /** Its renderer, made the first time a fight is drawn - a pass that will not build costs the serpent its body, never
   *  the game. */
  let _serpentRender;
  const serpentRenderer = () => {
    if (_serpentRender !== undefined) return _serpentRender;
    try { _serpentRender = new SerpentRenderer(renderer); } catch (e) { console.warn('[serpent] the renderer would not build', e?.message ?? e); _serpentRender = null; }
    return _serpentRender;
  };

  let _serpentBarUp = false;

  /** The serpent's frame (the online frame's, after the gate's): its omen's line, its receipts offered, and - on the
   *  street, alive - the fight on this screen and its bar. */
  const serpentFrame = () => {
    try { serpentOmen?.frame(); } catch (e) { console.warn('[serpent] omen', e?.message ?? e); }
    // SERPENT2: where the serpent lies, to the hub (once a socket and day - net/online.js sendSerpentSite): its Discord
    // herald names the place from the bells on, and posts the kill at the site the most accounts agree on
    try { const a = serpentOmen?.ahead?.(); if (a) socialLink()?.sendSerpentSite?.(a.day, a.site.sx, a.site.sz, a.site.near); } catch (e) { console.warn('[serpent] site word', e?.message ?? e); }
    serpentClaims?.tick();
    sdClaims?.tick();   // SD9b: what the account service has not counted yet, offered again on its own clock
    iliacClaims?.tick();   // CARDS10: and the ranked Iliac games', on theirs
    gambitClaims?.tick();   // KG6: and The King's Gambit's rated games', on theirs
    shared._serpentFight = false;
    if (!shared.serpentHost) return;
    const street = (shared.modes?.mode ?? 'exterior') === 'exterior' && shared.playerSpawned && playerEntity.health > 0 && !shared.modes?.deathUp?.();
    let fight = false;
    try { fight = street && shared.serpentHost.frame(); } catch (e) { console.warn('[serpent] frame', e?.message ?? e); }
    shared._serpentFight = !!fight;
    serpentSpell.frame(fight);   // BOSS-DOT: its lasting harm's rounds - none past the fight, off the street or dead
    const bar = fight ? shared.serpentHost.bar() : null;
    if (bar || _serpentBarUp) {
      drawGateBossBar(bar ? serpentBarModel(bar) : null, { hidden: gamePaused() || !!townTalk.hudHidden });
      _serpentBarUp = !!bar;
    }
  };
  /** No online frame (offline, a load): the bar put away; offline, the fight forgotten - my ship let go of its coil. */
  const serpentAway = (offline) => {
    if (_serpentBarUp) { drawGateBossBar(null); _serpentBarUp = false; }
    if (offline) { shared.serpentHost?.leave(); serpentOmen?.reset(); }   // AUDIT SERPENT L4: offline, no ring and no compass mark stand
  };
  /** SERPENT1: the compass's mark - where it hunts, in THIS scene, while it swims and the player stands in its ring. */
  const serpentCompassMark = () => {
    const sw = serpentOmen?.swimming?.();
    const mark = sw ? serpentOmen.mapMark() : null;
    if (!sw || !mark || (shared.modes?.mode ?? 'exterior') !== 'exterior') return null;
    const p = playerTravelPixel();
    return insideSerpentRing(mark, p.x, p.y) ? state.localFromWorld(sw.site.sx, sw.site.sz) : null;
  };
  /** WB6b: the Deadlands' air while the court stands under me - silent, and nothing left looping, the frame it does
   *  not. Ticked on the main frame, online or not: the court's ways out include going offline, and the online frame
   *  does not run then. */
  /** WB7: THE WARDEN'S SCORE (systems/gate/gateScore.js) - while the court stands under me its music is the fight's, not the
   *  director's: the war song of his phase, his fall's fanfare, then quiet. The songs are made the first time a court
   *  is stood in; the music is let go the frame the court is gone (the song faded - AUDIT SD III, A4: it was cut - and
   *  the director's next frame plays its own, as the fade ends). Answers whether the court holds the music this frame. */
  let _scoreHeld = false, _scoreMade = false;

  const gateScoreFrame = () => {
    if (shared.modes?.gateArenaDay?.() == null) {
      if (_scoreHeld) { _scoreHeld = false; music.fadeOut(); }
      return false;
    }
    if (!_scoreMade) { _scoreMade = true; for (const song of Object.values(gateScoreSongs())) music.registerSong(song.name, song); }
    _scoreHeld = true;
    const want = _courtScore.want(gateLink?.state?.() ?? null, Date.now() + shared._sharedOffsetMs) ?? GATE_SONGS.war1;   // the court before its fight's first word: the fight is there all the same
    if (want === SCORE_SILENCE) { if (music.current !== null) music.fadeOut(); } else music.playSong(want);   // AUDIT WB D2: the quiet after the fanfare is its ending, faded - not a cut
    return true;
  };

  /** ARENA2: THE ARENA'S MUSIC (systems/arena/arenaScore.js) - while a bout is heard here, the march, then the fanfare, then
   *  quiet through the healers; let go (the song faded - AUDIT SD III, A4: it was cut - the director's next frame plays
   *  its own) the frame there is none. The songs are made the first time a bout is heard. Answers whether the arena
   *  holds the music this frame. */
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

  /** AUDIT WB D5: the veil built ahead - in the browser's idle time the first frame a gate stands - so the first step
   *  through it does not pay for its program as the fire begins to close. */
  let _veilWarmed = false;
  const warmGateVeil = () => {
    if (_veilWarmed || !gateVeil) return;
    _veilWarmed = true;
    const idle = globalThis.requestIdleCallback ? (f) => globalThis.requestIdleCallback(f, { timeout: 4000 }) : (f) => setTimeout(f, 1500);
    idle(() => { try { gateVeil.warm(); } catch { /* the step builds it then */ } });
  };
  /** GATE-SEEN: the ground under a spot on a pixel NOT built yet - the terrain sampler's own kernel over WOODS.WLD, the
   *  samples the pixel will be built from (a gate stands where no location is within a pixel, so no blending moves
   *  them). One kernel for the gate's pixel, kept while it stays the same. */
  let _gateKernel = null, _gateKernelAt = '';
  const gateGroundAt = (px, py, x, z) => {
    if (!shared.woods) return -Infinity;
    const key = `${px},${py},${landform && terrainGen.roads() ? 1 : 0}`;   // LANDFORM1-3: and kept again once the network lands - the pixel is cut along it
    if (key !== _gateKernelAt) { _gateKernelAt = key; _gateKernel = sampleKernel(shared.woods, px, py, HEIGHTMAP_DIMENSION, true, landformsHere()); }
    const t = state.pixelTranslation(px, py);
    const lx = x - t[0], lz = z - t[2];
    if (!(lx >= 0 && lz >= 0 && lx <= TERRAIN_SIZE && lz <= TERRAIN_SIZE)) return -Infinity;
    return _gateKernel(lx / heightCell, lz / heightCell) * worldHeight + t[1];
  };

  // LEFAY1: THE MONUMENT TO JULIAN LEFAY (scenes/lefayMonumentHost.js) - outside Privateer's Hold (HOLD-MONUMENT), where its
  // pixel's build found open ground (`p.lefay`, the location frame), carried by the live floating-origin translation;
  // the flowers a press throws there laid in the character's own pile (systems/save/save.js carries it)
  const _lefayT = [0, 0, 0], _lefaySite = [0, 0, 0];

  /** WB1: the compass's mark - the gate's spot in THIS scene, while the gate stands and the player is in its ring. */
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
