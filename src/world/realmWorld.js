// The world's Abyss realm: its frames, the Hour's fight and score, the rift, sky, beam, motes,
// halo, and omen passes, and the arena's reads. It also holds the ways in and out: the hollow's
// door, entering the realm, the way back, the cast back, and the beacon home.
// The realm's host and its fight link stay in the world.
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
      else if (!inFlight.has(k)) _sdLate.delete(k);   // not standing: it builds on the index as it is now
    }
    if (!again.length) return;
    const under = `${state.current.x},${state.current.y}`;
    if (walkMode && shared.playerSpawned && again.some((k) => `${k.px},${k.py}` === under)) shared._seasonHoldKey = under;
    for (const k of again) destroyPixel(k.px, k.py, { collectLoose: false });
    queue.push(...again.sort(nearestFirstFrom(state.current)));
  }

  /** SD5a: a Hollow's entrance doors in the scene's frame (SD-SKY: the list keeps each in its pixel's) - the way out of
   *  the Hour lands before them (the mode machine's `sdHollowDoors`), and AUDIT SD IV (F40) the step out to its pixel. */
  const sdHollowDoorsOf = (h) => buildingDoors.filter((d) => d.pixelKey === h?.key && d.door?.doorType === DOOR_TYPE.DUNGEON_ENTRANCE).map(shiftedDoor);

  /** SD13: THE SCORE OF THE HOUR (systems/superDungeon/sdScore.js) - while I stand in a Hollow or its Hour the music is theirs, not
   *  the director's: the Hollow's walk; in the Hour the hall's, the Steps', the arena's war by its phase and its last
   *  minute, the fall's song, then the collapse's - which the Hollow plays too while it collapses. The songs are made
   *  the first time either is stood in; let go (the song faded, the director's next frame plays its own) the frame I
   *  stand in neither. Answers whether the Hour holds the music this frame. AUDIT SD III: held through the veil while
   *  the world moves under it (A1 - a Rift's step played the street's song between the Hollow's and the hall's, cut
   *  both ways); let go by a fade, never a cut (A4); silent while I lie dead in it (A5 - the war played on over the
   *  death); where I stand held a few metres past each change (A10, sdScorePlace's `was`). */
  let _hourScoreHeld = false, _hourScoreMade = false, _hourPlace = null;

  const sdScoreWhere = () => {
    if ((shared.modes?.mode ?? 'exterior') !== 'dungeon') return (_hourPlace = null);
    if (shared.modes?.sdRealmSlot?.() != null) { const [x, , z] = sdDungeonToRealm(player.pos[0], player.pos[1], player.pos[2]); return (_hourPlace = sdScorePlace(x, z, _hourPlace)); }
    return (_hourPlace = shared.modes?.dungeonLocation?.superTier ? 'hollow' : null);
  };
  const hourScoreFrame = () => {
    if (shared._spireScore.frame(shared.egClient?.scoreView?.() ?? null)) return true;   // EG-G2: in an Elite Breach the Spire's score is the music
    const place = sdScoreWhere();
    if (place == null) {
      if (_hourScoreHeld && (shared.modes?.stepping || shared.modes?.transitioning)) return true;   // A1: the world moving under the veil
      if (_hourScoreHeld) { _hourScoreHeld = false; music.fadeOut(); }   // A4: an ending, not a cut
      return false;
    }
    if (!_hourScoreMade) { _hourScoreMade = true; for (const song of Object.values(sdScoreSongs())) music.registerSong(song.name, song); }
    _hourScoreHeld = true;
    const slot = shared.modes?.dungeonLocation?.sdSlot ?? shared.modes?.sdRealmSlot?.() ?? null;
    const now = shared.sdFightLink?.now?.() ?? Date.now() + shared._sharedOffsetMs, rec = shared.sdHost?.record?.() ?? null;
    const collapsing = rec != null && rec.s === slot && sdPhase(rec, now) === 'fell';
    const want = !(playerEntity.health > 0) ? SD_SCORE_SILENCE : shared._hourScore.want(place, place === 'hollow' ? null : shared.sdFightLink?.state?.() ?? null, now, collapsing);   // A5: no war over the dead
    if (want === SD_SCORE_SILENCE) { if (music.current !== null) music.fadeOut(); } else music.playSong(want);
    return true;
  };

  /** SD14b: THE HOUR'S AIR (scenes/superDungeon/sdAir.js) - its beds and its far events while I stand in the Shattered Hour, on the sky's
   *  clock; silent, nothing left looping, the frame I do not. */
  const sdAirFrame = () => { if (shared.modes?.sdRealmSlot?.() != null) shared.sdAir.frame(shared.deadlandsSeconds(), cam.pos); else shared.sdAir.stop(); };

  /** AUDIT SD IV (F39): the Hollow host's scan, a row an ask - the rest the idle warm's (`warmScan`, AUDIT WB C7's
   *  slices): unbudgeted, the first frame after the hub's word paid the whole scan's remainder, and the warm never ran. A
   *  row an ask still gets there on a page with no idle callback (warmGateScan asks for one). */
  const _sdScanRow = () => false;

  /** SD-LOOK: the Rift's pass and the halos (render/superDungeon/sdRiftPass.js, render/superDungeon/sdHalo.js) - made the first time a Super dungeon's
   *  end is drawn, null where a context cannot (its meshes stand regardless). */
  let _sdRiftPass, _sdHaloPass;
  const sdRiftPassOf = () => {
    if (_sdRiftPass === undefined) { try { _sdRiftPass = new SdRiftRenderer(renderer.gl); } catch (e) { console.warn('[sd] the Rift\'s window could not be built', e); _sdRiftPass = null; } }
    return _sdRiftPass;
  };
  const sdHaloPassOf = () => {
    if (_sdHaloPass === undefined) { try { _sdHaloPass = new SdHaloRenderer(renderer.gl); } catch (e) { console.warn('[sd] the halos could not be built', e); _sdHaloPass = null; } }
    return _sdHaloPass;
  };
  /** SD-LOOK: the Hour's sky's look - the pixel law's steps on this lane; in the Hour, its Hollow's own Ending burning in
   *  its light on the face (a Hollow's: its marks by its slot). */
  const sdSkyLookNow = () => {
    // AUDIT SD V (P4): one kept record, made again only as the slot or the lane changes (it was made, and the Ending
    // found, every frame)
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
  /** SD17: the Hour-Hand's beam (render/superDungeon/sdBeam.js) - made the first time one sweeps, null where a context cannot. */
  let _sdBeamPass;
  const sdBeamPassOf = () => {
    if (_sdBeamPass === undefined) { try { _sdBeamPass = new SdBeamRenderer(renderer.gl); } catch (e) { console.warn('[sd] the Hour-Hand\'s beam could not be built', e); _sdBeamPass = null; } }
    return _sdBeamPass;
  };
  /** SD14c: the Hour's motes (render/superDungeon/sdMotes.js) - made the first time the Hour is drawn, null where a context cannot. */
  let _sdMotesPass;
  const sdMotesPassOf = () => {
    if (_sdMotesPass === undefined) { try { _sdMotesPass = new SdMotesRenderer(renderer.gl); } catch (e) { console.warn('[sd] the Hour\'s motes could not be built', e); _sdMotesPass = null; } }
    return _sdMotesPass;
  };
  /** SD2b: the Hollow stood or taken down, its find, its lines. SD2d: called from the online frame, above the modal
   *  return, in every mode - a Hollow's end reaches a player standing inside it. It stood in the exterior's half of the
   *  frame, which the dungeon's frame never reaches: underground nothing moved the Hollow on. */
  const sdFrame = () => { try { shared.sdHost?.frame(); } catch (e) { console.warn('[sd] host', e?.message ?? e); } sdRealmFrame(); sdAloneFrame(); sdFightFrame(); sdBodyFrame(); shared.sdVoiceFrame(); };   // INT15: and my body, said
  /** SD5a: OUT OF AN HOUR THAT WILL NOT HAVE ME - its room's hello refused for good (the Rift's own words, SD3's
   *  _sdAdmit: the Hour full, or closed) or its socket replaced: cast out before the Hollow's door (the mode machine's own
   *  exit - the realm's way out lands there) with the relay's words, once, as the court casts out (ejectFromCourt) -
   *  never left standing in a room nobody else can reach. A player dead there is the death's. */
  let _sdOut = false;
  const sdRealmFrame = () => {
    if (shared.modes?.sdRealmSlot?.() == null) { _sdOut = false; return; }
    if (_sdOut || !shared.online?.terminal || !(playerEntity.health > 0) || shared.modes?.deathUp?.()) return;
    _sdOut = true;
    shared.gateVeil?.flash('hourCast');   // AUDIT SD II (L6 F8): out of the Hour in its own veil - SD-LOOK: forced, its face shattered
    if (shared.modes?.unstuck?.()) shared.sdSay(/^The Hour /.test(shared.online.error ?? '') ? shared.online.error : SD_REALM_TEXT.lost);
  };
  /** SD-ALONE (2026-10-08, Mac: "We need to make sure companions dont enter the rift"): no companion stands in the
   *  Shattered Hour (companionPlace answers none there, as in a gate's court - GATE-ALONE), and a player who steps
   *  through the Rift with any at their side is told so - once each time they step in, when the step's veil has opened
   *  over the Hour; owed again once they are out. */
  let _sdAloneSaid = false;
  const sdAloneFrame = () => {
    if (shared.modes?.sdRealmSlot?.() == null) { _sdAloneSaid = false; return; }
    if (_sdAloneSaid || shared.modes?.transitioning || shared.gateVeil?.busy || gamePaused()) return;
    _sdAloneSaid = true;
    if (companionsWithYou() > 0) shared.sdSay(SD_REALM_TEXT.noCompanions);
  };

  /** SD-REZ (EVENT-RULES): may a friend's Resurrect still raise me where I lie - always, but in the Hour I fell in past its realm's window. */
  const hourRezOpen = () => shared._sdFallen.mayRise(shared.modes?.sdRealmSlot?.());
  const sdRiftOf = (s) => {
    if (!shared.sdHost) return null;
    const rec = shared.sdHost.record(), now = Date.now() + shared._sharedOffsetMs;
    const seen = { entered: shared._sdEntered.has(s), fallen: shared._sdFallen.has(s) };
    return { word: sdRiftWord(rec, s, now, seen), returns: sdReturnStands(rec, s, now), through: sdThroughStands(rec, s, now), count: sdRiftCount(rec, s, now), look: riftLook(rec, s, now, seen), enter: () => sdEnterRealm(s) };   // AUDIT SD II (L6 F5): and its count; SD-LOOK: and its look - its state, read off the same record; SD-THROUGH: and whether one has gone through (the Way Through stands)
  };
  /** AUDIT SD V (P1): the Rift's look alone, every frame it is drawn - none of the word, the count or the step's door
   *  sdRiftOf makes (it was made four times a frame for the look, ~2.4 KB); its `seen` kept. */
  const _sdSeen = { entered: false, fallen: false };
  const sdRiftLookOf = (s) => {
    if (!shared.sdHost) return null;
    _sdSeen.entered = shared._sdEntered.has(s); _sdSeen.fallen = shared._sdFallen.has(s);
    return riftLook(shared.sdHost.record(), s, Date.now() + shared._sharedOffsetMs, _sdSeen);
  };
  /** SD-LOOK (Super-Dungeons-Look.md section 3): WHERE THE HOUR'S VEIL CLOSES - the Rift's window (or the Return's)
   *  on the screen each frame it is drawn, in screen radii (the corners at 1 - render/superDungeon/sdVeil.js uCentre), handed to the
   *  veil (ui/gate/gateVeil.js aim): its blades pivot on it. With no allocation (AUDIT SD II L2 F9): the model's place through
   *  the view and the projection, by hand. */
  function sdVeilAim(proj, view, m) {
    if (!m || !shared.gateVeil) return;
    const x = m[12], y = m[13], z = m[14];
    const vx = view[0] * x + view[4] * y + view[8] * z + view[12], vy = view[1] * x + view[5] * y + view[9] * z + view[13];
    const vz = view[2] * x + view[6] * y + view[10] * z + view[14], vw = view[3] * x + view[7] * y + view[11] * z + view[15];
    const cw = proj[3] * vx + proj[7] * vy + proj[11] * vz + proj[15] * vw;
    if (!(cw > 1e-3)) return;   // behind the eye: the veil closes on the screen's middle
    const W = renderer.gl.drawingBufferWidth, H = renderer.gl.drawingBufferHeight, d = Math.hypot(W, H) || 1;
    shared.gateVeil.aim?.(((proj[0] * vx + proj[4] * vy + proj[8] * vz + proj[12] * vw) / cw) * (W / d), ((proj[1] * vx + proj[5] * vy + proj[9] * vz + proj[13] * vw) / cw) * (H / d));
  }
  /** SD5a (Super-Dungeons.md section 7): THROUGH THE RIFT - out of the Hollow and into the Shattered Hour, under the veil
   *  (scenes/worldModes.js stepThroughFire): the Hollow left as a teleport leaves a dungeon, the player at its pixel
   *  outside (the staff teleport's way - the street streamed under them, so the way out of the Hour has a door to land
   *  before) and stood before that door (AUDIT SD IV F40), then the realm built and entered (enterSdRealm) - its room
   *  the relay's `sd:<s>`, whose hello asks the Rift's law again (SD3). The Rift's word is asked once more under the
   *  veil: the Hour can close while it does. Answers whether the step began - AUDIT SD III (H6): null while another step
   *  is under way (the way back's landing, still under its veil): not refused, not yet. The step refused it in silence,
   *  and its walk-in was spent. */
  function sdEnterRealm(s) {
    const h = shared.sdHost?.hollow();
    if (!h || h.s !== s || !h.site || !shared.modes?.stepThroughFire) return false;   // AUDIT SD II (L1): a Hollow known by another slot's memo carries no site
    if (shared.modes?.stepping) return null;   // audit24 wave37's law: guarded on the object (this runs above `var modes`)
    const hollow = { key: h.key, px: h.site.px, py: h.site.py, name: h.loc.name };
    const site = { climateBase: h.loc.climate?.climateType ?? 2, season: INTERIOR_SEASON, climate: h.loc.climate, regionIndex: h.loc.regionIndex ?? -1, regionName: h.loc.regionName ?? '' };
    shared.modes?.stepThroughFire(async () => {
      if ((shared.modes?.mode ?? 'exterior') !== 'dungeon' || !(playerEntity.health > 0)) return false;
      const word = sdRiftOf(s)?.word;
      if (word) { shared.sdSay(word); return false; }
      shared.modes?.forceExitToExterior();
      await _teleportToPixel(hollow.px, hollow.py);
      standBeforeHollowDoor(hollow.key);   // AUDIT SD IV (F40): before its door, never its pixel's middle
      // AUDIT SD II (L1 F3): its word asked again after the walk - the end may have overtaken the step (outside, before its door)
      const late = sdRiftOf(s)?.word;
      if (late) { shared.sdSay(late); return false; }
      if (await shared.modes?.enterSdRealm?.({ s, hollow, site })) { shared._sdEntered.add(s); return true; }   // AUDIT SD: through - its Rift admits me again in its collapse
      shared.sdSay(SD_REALM_TEXT.lost);   // the realm would not build: outside, before the Hollow's door
      return false;
    }, 'hourIn');   // AUDIT SD II (L6 F8): through the Hour's own veil - SD-LOOK: its blades closing on the Rift
    return true;
  }
  /** AUDIT SD IV (F40): BEFORE THE HOLLOW'S DOOR, outside - after a step out to its pixel (into the Hour, or back when its
   *  door would not open): the mode machine's own landing for it (exitDungeonNow's, off the same doors), so a step refused
   *  there, a realm that would not build and the way out's `from` stand on the street. The pixel's middle is where the
   *  Hollow stands (spawnedLocationCentreLocal) - its keep's roof, TL2's guard never asked. Answers whether it stood me. */
  function standBeforeHollowDoor(key) {
    const at = walkMode ? dungeonEntranceLanding(sdHollowDoorsOf({ key })) : null;
    if (!at) return false;
    player.spawn(at.pos[0], repositionFeetY(collider.heightAt(at.pos[0], at.pos[2]), at.pos[1]), at.pos[2]);
    shared.playerSpawned = true;
    cam.yaw = Math.atan2(at.normal[0], at.normal[2]); cam.pitch = 0;
    cam.pos = player.eyeAt();
    return true;
  }
  /** SD10 (Super-Dungeons.md section 11's collapse): WHERE THE WAY HOME STANDS - where the Remnant fell, once its body has
   *  sunk (scenes/superDungeon/sdRemnant.js SD_REM_SINK_MS), on the arena's floor, for as long as the fight this page holds says it
   *  fell - one place a fall; null otherwise (the dungeon host takes it down). */
  let _sdHome = null;
  const sdHomeAt = () => {
    const s = shared.sdFightLink?.state();
    if (!s?.fell || shared.sdFightLink.now() < s.fell.at + SD_REM_SINK_MS) return null;
    // AUDIT SD: one place a FALL (its instant - a fight's number begins again in every Hollow's Hour), clear of the pillars
    if (_sdHome?.fell !== s.fell.at) {
      const [x, z] = clearOfPillars(s.rem.x, s.rem.z);
      _sdHome = { fell: s.fell.at, at: sdRealmToDungeon(SD_ARENA.x + x, 0, SD_ARENA.z + z) };
      if (sdHomeAge() < SD_HOME_SAY_MS) shared.sdSay(SD_HOME_TEXT.rises);   // AUDIT SD II (L6 F16): said as it rises, never long after
    }
    return _sdHome.at;
  };
  /** AUDIT SD II (L6 F16): how long ago the way home began to rise (ms, the fight's clock) - its rise drawn from it
   *  (scenes/superDungeon/sdEnd.js standReturn); null while the fight this page holds has not fallen. */
  const sdHomeAge = () => {
    const s = shared.sdFightLink?.state();
    return s?.fell ? shared.sdFightLink.now() - (s.fell.at + SD_REM_SINK_MS) : null;
  };
  /** AUDIT SD III (F2): whether the arena holds me now - joined to its living fight and standing inside its rim. */
  const sdArenaHeld = () => {
    if (!shared.sdFightLink?.joined?.()) return false;
    const [x, , z] = sdDungeonToRealm(player.pos[0], player.pos[1], player.pos[2]);
    return arenaHolds(true, x, z);
  };

  /** SD5a: BACK THROUGH THE RIFT - out of the Hour and into its Hollow, beside its Rift, under the veil: the realm left,
   *  the player at the Hollow's pixel outside, the Hollow entered by its own door (startInDungeon - the door at this
   *  pixel) and stood beside its Rift (the Return's place - dungeonContext.js sdRiftLanding). A Hollow gone meanwhile:
   *  outside, at its pixel; a door that would not open: before it (AUDIT SD IV F40). AUDIT SD III (H6): null while
   *  another step is under way. */
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
      if (shared.sdHost?.hollow()?.key !== back.key) return true;   // its end overtook the step: outside, where it stood
      if (!(await shared.modes?.startInDungeon?.())) { standBeforeHollowDoor(back.key); return true; }   // AUDIT SD IV (F40): before its door
      const at = shared.modes?.dungeonCtx?.sdRiftLanding?.();
      if (at) shared.modes?.setPlayerLocalPosition?.(at);
      return true;
    }, 'hourBack');   // AUDIT SD II (L6 F8) - SD-LOOK: in silver, its face still cracked
    return true;
  }
  /** SD6c (Super-Dungeons.md section 8): THE ORRERY'S HALL, as its realm says it - the last word (the stones, the fray,
   *  the dial, the Concord), kept for the hall's set to read every frame (dungeonContext.js, through the mode machine).
   *  A word that says the Hour SNAPPED BACK lashes me if I stand in the hall - a quarter of my health, no save (no shield
   *  takes it) - and is said to everyone in the realm. AUDIT SD II (L7 H2): it lashes me only if the realm names me (`ls`
   *  - I turned this thread and brought the Concord no nearer: whoever mended a griefer's turns, or never touched a stone,
   *  stands); a word to me alone that the stones refused my turn (`w`) says why. */
  let _sdHall = null;
  function sdHallHeard(w) {
    _sdHall = sdHallNamed(w, shared.peerName, shared.online?.id ?? null);   // RPT1026-EVENTS ORRERY-HANDS: its turner and the lashed named off the roster, seen or not
    if (shared.modes?.sdRealmSlot?.() !== w.s) return;
    if (w.w === 1) { shared.sdSay(SD_TURN_WAIT_LINE); return; }
    if (w.x !== 1) return;
    const [x, , z] = sdDungeonToRealm(player.pos[0], player.pos[1], player.pos[2]);
    if (playerEntity.health > 0 && inOrreryHall(x, z) && !!shared.online?.id && (w.ls ?? []).includes(shared.online.id)) {
      const dmg = Math.max(1, Math.round((playerEntity.maxHealth ?? 0) * SD_FRAY_LASH));
      hurtPlayer(playerEntity, dmg, { bypassShield: true, spare: () => {} });   // AUDIT SD III (F10): it leaves me at one, never dead - one life a Hollow
      flashPlayerDamage(dmg);
    }
    shared.sdSay(sdSnapLine(_sdHall));   // RPT1026-EVENTS ORRERY-HANDS: the snap, and whom it lashes by name
  }
  /** SD7b: THE HOUR CASTS ME BACK (the mode machine has stood me on my span's checkpoint - scenes/superDungeon/sdSteps.js): what the
   *  void costs, a share of my health no shield takes, and the line. */
  function sdCastBack() {
    if (playerEntity.health > 0) {
      const dmg = Math.max(1, Math.round((playerEntity.maxHealth ?? 0) * SD_CAST_BACK_LOSS));
      hurtPlayer(playerEntity, dmg, { bypassShield: true, spare: () => {} });   // AUDIT SD III (F10): a setback, never a death - one life a Hollow
      flashPlayerDamage(dmg);
    }
    shared.sdSay(SD_STEPS_TEXT.cast);
  }

  let _sdFightHeld = false, _sdBarUp = false, _sdGroundUp = false, _sdCardUp = false;   // SD15: the ground's rim and the Hour's card up
  let _sdMarksSince = null, _sdMarksUp = false;   // SD18b: when I stepped into the Hour (its marks' card), and the card up

  /** SD-LOOK S7 (Super-Dungeons-Look.md section 9): THE ARENA'S READS, in the Hour's telegraph pass - its floor telling
   *  the clock's blows (render/superDungeon/sdArenaGlow.js), the Stomp's walls and, while it holds me, the hold's curtain
   *  (render/superDungeon/sdStompWall.js) - built once, lazily (a failure costs the reads, never the game), off the fight this page
   *  holds; and the sky's word for the same fight (`uClock`). Nothing made a frame. SD-LOOK S9: and the Steps' read - their
   *  ghosts where a Beat plate or my Crumble pin will return (scenes/superDungeon/sdSteps.js drawPass, the dungeon host's door).
   *  SD-LOOK S7: and the pillars' watch - their dials' hands on the Remnant, their lanterns, the Reset's dimming
   *  (render/superDungeon/sdPillarPass.js, scenes/superDungeon/sdArenaWatch.js). */
  let _sdGlowPass = null, _sdWallPass = null, _sdPillarPass = null, _sdReadsBroken = false;

  const _sdBeacon = [{ x: 0, z: 0, r: 0, k: 0, h: 0, color: null, beacon: true }];   // SD-LOOK S6: the way home's beacon, kept

  function drawSdArenaReads(proj, view, fog) {
    const ghosts = !!shared.modes?.dungeonCtx?.sdStepsDraw?.(proj, view, fog);   // SD-LOOK S9: the Steps' ghosts, the fight or none
    if (!shared.sdFightLink || _sdReadsBroken || shared.modes?.sdRealmSlot?.() == null) return ghosts;
    if (!_sdGlowPass) {
      try { _sdGlowPass = new SdArenaGlowRenderer(renderer.gl); _sdWallPass = new SdStompWallRenderer(renderer.gl); _sdPillarPass = new SdPillarPassRenderer(renderer.gl); } catch (e) { _sdReadsBroken = true; console.warn('[sd] the arena\'s reads would not build', e?.message ?? e); return ghosts; }
    }
    const s = shared.sdFightLink.state(), t = shared.sdFightLink.now();
    let drew = _sdGlowPass.draw(proj, view, shared._sdArenaModel, sdArenaGlowAt(s, t, shared._sdGlowMemo), fog, renderer.lightingLane ? SD_SKY_STEPS.lane : SD_SKY_STEPS.classic);
    if (_sdPillarPass.draw(proj, view, sdPillarLookAt(s, t, shared._sdPillarLook, shared._sdGlowMemo), fog, renderer.lightingLane ? SD_SKY_STEPS.lane : SD_SKY_STEPS.classic, renderer.lightingLane ? SD_HALO_GAIN.lane : SD_HALO_GAIN.classic)) drew = true;   // SD-LOOK S7: the pillars' watch
    const n = sdStompWalls(s, t, shared._sdWalls);
    if (n > 0 && _sdWallPass.draw(shared._sdWalls, n, proj, view, fog)) drew = true;
    if (sdArenaHeld() && _sdWallPass.draw(shared.SD_HELD_WALLS, 1, proj, view, fog)) drew = true;
    // SD-LOOK S6: the column the way home assembles in, then its beacon over it, tall at first, then settled (in the
    // arena's frame, as the walls are)
    const home = s.fell ? sdHomeAt() : null;
    if (home) {
      const b = sdHomeBeacon(sdHomeAge() - SD_HOME_RISE_MS, _sdBeacon[0], SD_RETURN_SIZE.h * SD_HOME_SCALE);
      b.x = home[0] - shared._sdArenaModel[12]; b.z = home[2] - shared._sdArenaModel[14];
      if (_sdWallPass.draw(_sdBeacon, 1, proj, view, fog)) drew = true;
    }
    return drew || ghosts;
  }
  /** The sky's word for the fight this page holds (render/superDungeon/sdSky.js uClock), or none. */
  const sdSkyClockNow = () => (shared.sdFightLink ? sdHourClockOf(shared.sdFightLink.state(), shared.sdFightLink.now(), shared._sdSkyClock) : null);

  /** SD9e: the floor a press, a plaque and the ray ask of - the Hour's pool in the Hour, the court's anywhere else (the two
   *  are never stood in at once). */
  const floorPool = () => (shared.modes?.ktShip?.() != null && shared.ketch ? shared.ketch.spoils : shared.modes?.sdRealmSlot?.() != null || shared.modes?.egHallBreach?.() != null ? shared.sdSpoilsPool : shared.spoilsPool);   // AUDIT KETCH L2-3: the Ketchmaster's hold its own pool   // EG-E: the Spire's Redoubts throw into the Hour's pool

  function sdFightHeard(w) {
    const slot = shared.modes?.sdRealmSlot?.();
    if (w?.k === 'bd') { bossCountFell(slot != null); return; }   // INT12: the relay's count's fall of me - the Hour's one life
    if (!shared.sdFightLink || slot == null || (w.k === 'st' && w.s !== slot)) return;
    _sdFightHeld = true;
    shared.sdFightLink.word(w);
  }

  /** INT15: MY BODY, in my own word, while I fight alive in the Hour's fight that answered me - to a relay that counts it
   *  (net/bossBody.js bodySayer's pace). A frame step of its own beside the fight's. */
  const sdBodyFrame = () => {
    if (!shared.sdFightLink || shared.modes?.sdRealmSlot?.() == null || !shared.online?.bossOk) return;
    if (playerEntity.health > 0 && playerEntity.maxHealth > 0 && shared.sdFightLink.joined()) shared._sdSayBody(playerEntity.health / playerEntity.maxHealth, performance.now());
  };
  /** One online frame of the fight: forgotten out of the realm; its bar (ui/superDungeon/sdRemnantBar.js - the gate's, in brass) over
   *  the screen while I stand near the arena and its fight is one to fight, put away otherwise. */
  let _sdPassesWarm = false;
  const sdFightFrame = () => {
    if (!shared.sdFightLink) return;
    const inRealm = shared.modes?.sdRealmSlot?.() != null;
    if (!inRealm && shared._sdReceipts.size) shared.sdReceiptsLeft();   // AUDIT SD: a receipt that never burst - its spoils into the pack
    // SD9e: whatever is still on the arena's floor into the pack - and AUDIT SD II (L5 F5): a checkpoint asked at once (the
    // Hour refuses every save, so what it gave stood on the device alone until the next periodic one)
    if (!inRealm && _sdFightHeld) { shared.sdSpoilsBurst?.leave(); saveSoon.changed(); }
    if (!inRealm && _sdFightHeld) { shared.sdFightLink.leave(); shared.sdBlows?.leave(); shared.sdRemVoice?.leave(); shared.sdFx?.leave(); _sdFightHeld = false; }
    if (!inRealm) shared.sdFx?.away();   // AUDIT SD V (L5): the next arrival exhales, whatever was heard
    if (!inRealm) _sdHall = null;   // AUDIT SD II (L2 F17): the hall's word forgotten out of the realm - kept, the next visit to the slot's Hour turned its stones from stale places and chimed a Concord reached meanwhile
    // AUDIT SD III (V13): the fight's passes built as the Hour is first stood in - the beam, the sparks and the floor's
    // telegraph each compiled on its first use, a stall in the frame its first blow landed in
    if (inRealm && !_sdPassesWarm) { _sdPassesWarm = true; sdBeamPassOf(); shared.sdFx?.warm?.(renderer.gl); shared.sdBlows?.warm?.(); }
    if (inRealm) { try { shared.sdBlows?.frame(); } catch (e) { console.warn('[sd] blows', e?.message ?? e); } }   // SD8d: its blows on me
    if (inRealm && playerEntity.health > 0) { try { shared.sdRemVoice?.frame(); } catch (e) { console.warn('[sd] voice', e?.message ?? e); } }   // SD14a: its body heard; AUDIT SD III (A5): never by the dead
    if (inRealm) { try { shared.sdFx?.frame(); } catch (e) { console.warn('[sd] fx', e?.message ?? e); } }   // SD16: its blows seen
    if (inRealm) { try { shared.sdSpoilsBurst?.frame(); } catch (e) { console.warn('[sd] spoils', e?.message ?? e); } }   // SD9e: its spoils, thrown and flying
    let bar = null, ground = null, card = null;
    if (inRealm) {
      const [x, , z] = sdDungeonToRealm(player.pos[0], player.pos[1], player.pos[2]);
      const s = shared.sdFightLink.state(), now = shared.sdFightLink.now();
      const near = sdBarNear(x, z);
      if (near) bar = remnantBarModel(s, now);
      // SD15: THE ARENA READ (scenes/superDungeon/sdArenaRead.js) - a blow still to land on my feet, and the burning brass under them,
      // on the gate's own rim and warning; the fight's turns on the Hour's own card
      const peril = playerEntity.health > 0 ? sdPerilAt(s, now, x - SD_ARENA.x, z - SD_ARENA.z, cam.yaw, !!shared.sdBlows?.over?.()) : null;   // AUDIT SD III (F8): over a pillar's top, the Hand's shade gone
      ground = sdGroundModel({ burning: !!shared.sdBlows?.burning?.(), el: shared.sdBlows?.burningEl?.() ?? null, now, peril });   // SD18b: in its element
      const beat = shared.sdBeats.frame(s, now);   // framed wherever I stand, so a turn passed far off is never shown late
      // AUDIT SD IV (T1): the fight's turns on the card where its bar stands (L6 F15, its voice's law) - the wake, the
      // Dragon Break and the Last Moment stood over the Steps' jumps; its last minute and its fall are the whole Hour's
      card = beat && (near || beat.kind === 'last' || beat.kind === 'fell') ? titleCardModel(beat, now) : null;
    } else shared.sdBeats.leave();
    // SD18b: THE HOUR'S MARKS (ui/superDungeon/sdMarksView.js) - its Ending and its omens on the gate's own card as I step into the Hour
    let marks = null;
    if (inRealm) {
      const nowMs = performance.now();
      if (_sdMarksSince === null && !shared.gateVeil?.busy) _sdMarksSince = nowMs;   // AUDIT SD III (T18): its nine seconds from the veil's opening - they ran out under it
      marks = _sdMarksSince === null ? null : sdMarksCardModel(shared.sdFightLink.state()?.mk ?? sdMarksOf(shared.modes?.sdRealmSlot?.() ?? null), { since: _sdMarksSince, now: nowMs });   // AUDIT SD III: guarded on the object - this runs above `var modes` (audit24 wave37's law)
    } else _sdMarksSince = null;
    const hidden = gamePaused() || !!townTalk.hudHidden || !!shared.gateVeil?.busy;   // AUDIT SD III (T18): the Hour's readouts under the veil as the court's are (scenes/gate/gateCourt.js)
    if (bar || _sdBarUp) { drawGateBossBar(bar, { hidden }); _sdBarUp = !!bar; }
    if (ground || _sdGroundUp) { drawGateGround(ground, { hidden }); _sdGroundUp = !!ground; }
    if (card || _sdCardUp) { drawSdTitleCard(card, { hidden }); _sdCardUp = !!card; }
    if (marks || _sdMarksUp) { drawGateMarksCard(marks, { hidden }); _sdMarksUp = !!marks; }   // SD18b
  };
  /** No online frame: the Remnant's bar put away. */
  const sdFightAway = () => {
    if (_sdBarUp) { drawGateBossBar(null); _sdBarUp = false; }
    if (_sdGroundUp) { drawGateGround(null); _sdGroundUp = false; }   // SD15
    if (_sdCardUp) { drawSdTitleCard(null); _sdCardUp = false; }
    if (_sdMarksUp) { drawGateMarksCard(null); _sdMarksUp = false; }   // SD18b
  };
  /** The hall's word for the realm I stand in, or null; and whether its Concord holds (the edge widens with it). */
  const sdHallWord = () => (_sdHall && _sdHall.s === shared.modes?.sdRealmSlot?.() ? _sdHall : null);
  const sdConcordHere = () => !!sdHallWord()?.ok && shared.modes?.dungeonCtx?.sdHallBridgeLaid?.() !== false;   // AUDIT SD V (L2): and its bridge drawn - the floor never stands under nothing
  /** SD2c: THE HOLLOW'S OMEN (render/superDungeon/sdOmenPass.js) - a column of brass-gold light over a Super dungeon's pixel from its
   *  rise to its end (sdHost omen: the record's own light), seen from SD_OMEN_PX map pixels round, outside alone. Its foot
   *  is the built ground under the Hollow's centre, or on a pixel not built yet the terrain sampler's own kernel there
   *  (GATE-SEEN's law, its own memo - a slot's pixel never moves). The pass is built the first time a column stands. */
  let _sdOmenPass;   // undefined until asked; null when it would not build
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
  /** SD19: a standing Hollow's centre in THIS scene - `[x, z]` - or null (the compass's and the air's). */
  const sdHollowAt = (h) => { const t = state.pixelTranslation(h.site.px, h.site.py), [lx, lz] = spawnedLocationCentreLocal(h.loc); return [t[0] + lx, t[2] + lz]; };
  /** SD19: THE BRASS AIR (systems/superDungeon/sdOmen.js sdAirWeight) - by its column's light, the eye's distance and the hour; 0 with no
   *  Hollow standing, or anywhere but outside. */
  const sdAirNow = (eye, minuteNow) => {
    const o = shared.sdHost?.omen();
    if (!o?.hollow?.site || (shared.modes?.mode ?? 'exterior') !== 'exterior' || !eye) return 0;
    const [x, z] = sdHollowAt(o.hollow);
    return sdAirWeight(o.light, Math.hypot(eye[0] - x, eye[2] - z), minuteNow);
  };
  /** SD19: THE BANNER AT ITS DOOR (systems/superDungeon/sdOmen.js sdBannerText) and its marks on the gate's own card ('gate' mode) -
   *  within SD_BANNER_M of its centre while it stands; `{ text, card }` or null. */
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
    drawGateBanner(shared._gateBannerWish ?? sb?.text ?? null, { hidden, look: shared._gateBannerWish == null && sb ? 'brass' : 'gate' });   // AUDIT SD III (T3): an Abyss Dungeon's door in the Hour's brass
    drawGateMarksCard(shared._gateMarksWish ?? sb?.card ?? null, { hidden });
  };
  /** SD2c: the compass's mark - a found Hollow's centre, in THIS scene, while the player stands outside within
   *  SD_COMPASS_M of it (section 4's kilometre); before it is found it is a find, and nothing points at it. */
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
