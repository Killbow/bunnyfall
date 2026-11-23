// The world's travel aids: an act of upkeep's hour, the ride on the road, and the wagon's load.
// It also holds the ether crossing's question at the helm, the spyglass and the guns' shot wheel,
// the saddle panel, and the springs a player drinks at.
import { controllerLook } from '../player/lookFilter.js';
import {
  CROSS_CHECK_S, CROSS_REFUSED, CROSS_STALE, crossingRows, crossingWayAt,
} from '../systems/naval/etherCrossing.js';
import { CROSS_X, inEther } from '../world/ethericSea.js';
import { cursorActive } from '../player/pointerLock.js';
import { DeathScreen } from '../ui/deathScreen.js';
import { DEFAULT_ACTIVATION_DISTANCE, RAY_DISTANCE } from '../player/activate.js';
import {
  drawSpyglass, easeLens, GLASS_FIELD, GLASS_NEAR_MIN, glassClearDepth, glassEyeOverSea, glassFov, glassNear,
  nextGlassZoom, spyglassTaps,
} from '../ui/spyglassView.js';
import { drinkAtSource, DRY_SOURCE_TEXT } from '../systems/survival/items.js';
import { enhancedHudScale } from '../ui/enhancedHud.js';
import { fieldOfView } from '../ui/viewSettings.js';
import { GLASS_PAD_ZOOM } from '../ui/gamepadInput.js';
import { GLASS_ZOOM_MAX, GLASS_ZOOM_MIN } from '../systems/naval/shipKnowledge.js';
import { glassPadWords } from '../ui/glassPad.js';
import { hdGlyphName } from '../ui/padGlyphsHD.js';
import { hudRenderEnabled } from '../ui/hudShortcuts.js';
import { isEnhancedPlus } from '../ui/uiSkin.js';
import { largeHudWorldAspect, worldViewportRect } from '../ui/hudLarge.js';
import { mwViewHoldFirst } from '../player/mwView.js';
import { navalTouchGlass } from '../ui/navalHud.js';
import { ownMinutes } from '../world/worldTick.js';
import { padFamily } from '../ui/padGlyphs.js';
import { playerEntity } from '../characters/playerEntity.js';
import { plusDpadMap } from '../ui/plusPad.js';
import { survivalOn } from '../systems/survival/switch.js';
import { totalWeight } from '../items/inventory.js';
import { wagonKgFor } from './wagonKinds.js';
import { worldRectPx } from '../player/tapRay.js';
import { YesNoBoxWindow } from '../ui/yesNoBox.js';

/** @param {any} shared */
export function createTravelAidsWorld(shared) {
  const {
    _travelUIHolder, built, cam, canvas, climbFeel, etherOut, etherSea, gamePaused, hccActionPressed,
    heightAt, player, playerTicker, playerTravelPixel, runEncounterTick, state, townTalk, tvSeaY, walkMode,
    worldMoveBusy,
  } = shared;
  /** The clock passed by an act of upkeep (a kit's hour), as a camp meal's: the ticker, then the encounters it owes. */
  const upkeepPass = (n) => { playerTicker.advance(n); runEncounterTick(walkMode && shared.playerSpawned ? player.pos : cam.pos, true); };
  /** HORSE-WALK x THE OVERWORLD (2026-10-12, the owner: "Ensure the overworld speed isnt affected"): ON THE ROAD THE RIDE
   *  KEEPS ITS PACE. Under the Overworld's view (rising, up or falling) or while a Travel Options journey's autopilot
   *  drives the motor (walkJourneying's test - the view's journeys, First-Person Travel's, a party's), the horse rides at
   *  the ride's own pace as it always did: the travel clock and its governor, the steering's reach, a band's chase (5.2
   *  m/s at the world's scale) and a ride's time across the map are all set against it. Declared over the two bindings
   *  declared above it (BOOT-TDZ), never walkJourneying itself, which stands below. */
  const rideOnTheRoad = () => !!shared.travelView?.active || !!(shared.travelOptions?.isTravelActive && shared.travelOptions.state?.autopilot);

  /** WAGONS4/STEED1: the driven wagon's load, a share of its limit. */
  const wagonLoadShare = () => { const lim = wagonKgFor(playerEntity); return lim > 0 ? totalWeight(playerEntity.wagonItems ?? []) / lim : 0; };

  let _crossCheckT = 0;

  /** The way the helm's waters offer now: 'out' only where the crossing out is this game's (AUDIT CAPTAIN'S SEA G2), 'home'
   *  in the Veil under any skin. */
  const crossWayHere = () => {
    const p = playerTravelPixel();
    return crossingWayAt(p.x, p.y, etherOut && p.x < CROSS_X && !inEther(p.x, p.y) ? shared.crossLandPx(p.x, p.y) : 0);
  };
  /** Why the crossing may not be sailed now - CROSS_REFUSED's key (an enemy near, another player aboard) - or null. */
  const crossRefusal = () => (shared.navalHostileNear() ? 'hostile' : shared.csaPassengersOn(shared.csaRuntime?.state?.CurrentBoat, shared.veilParty.kin) > 0 ? 'passengers' : null);   // VEIL-PARTY: her party aboard crosses with her
  let _crossBox = null, _crossSaid = null;   // the question up; the waters a refusal was said in
  /** AUDIT CAPTAIN'S SEA X2: the question taken back unanswered - a load, a jump, a door (navalTransition). */
  function withdrawCrossing() {
    if (_crossBox && !_crossBox.done) _crossBox.withdraw();
    _crossBox = null;
  }
  /** The helm's waters asked every CROSS_CHECK_S: a way they offer, not asked since the ship came into them, asked - or
   *  said refused once in those waters (an enemy near, another player aboard), and asked as soon as the deck is clear.
   *  AUDIT CAPTAIN'S SEA X1: a refusal marked the way asked, and the question never came back while she stayed in those
   *  waters; X3: never while the world is being moved (a party member's helm through the arrival's wait). */
  function etherCrossStep(dt) {
    if (!etherSea || shared._etherCrossing || !shared.csaRuntime?.isSailing?.()) return;
    _crossCheckT -= dt;
    if (_crossCheckT > 0) return;
    _crossCheckT = CROSS_CHECK_S;
    if (gamePaused() || shared._loading || townTalk.overlayActive || shared.modes?.transitioning || worldMoveBusy() || shared._partyArrivalPending || shared._mode() !== 'exterior') return;
    const way = crossWayHere();
    if (way !== _crossSaid) _crossSaid = null;
    if (!shared.crossGate.offer(way)) return;
    const why = crossRefusal();
    if (why) { if (_crossSaid !== way) { _crossSaid = way; townTalk.say(CROSS_REFUSED[why], 4); } return; }
    shared.crossGate.asked(way);
    const boat = shared.csaRuntime.state.CurrentBoat;
    _crossBox = new YesNoBoxWindow({ rows: crossingRows(way, { pvp: shared._onlineWorldSession() && !!shared.online?.wildOk }), onYes: () => { _crossBox = null; crossYes(way, boat); }, onNo: () => { _crossBox = null; } });
    townTalk.showOverlay(_crossBox);
  }
  /** AUDIT CAPTAIN'S SEA X2: Yes is the question as it stands NOW - the same helm, the same waters, no enemy, no passenger,
   *  the world still (a Yes after a load sailed the loaded helm out from wherever it stood, and kept that as the way out). */
  function crossYes(way, boat) {
    if (shared._etherCrossing || worldMoveBusy() || shared._partyArrivalPending || !shared.csaRuntime?.isSailing?.() || shared.csaRuntime.state.CurrentBoat !== boat || crossWayHere() !== way) {
      shared.crossGate.asked(null);   // asked afresh in its own waters
      townTalk.say(CROSS_STALE, 4);
      return;
    }
    const why = crossRefusal();
    if (why) { shared.crossGate.asked(null); _crossSaid = way; townTalk.say(CROSS_REFUSED[why], 4); return; }
    shared.etherCross(way).catch((e) => console.warn('[ether] the crossing:', e?.message ?? e));
  }

  /** GLASS-CLEAR: whether a point projected (player/tapRay.js projectToScreen) stands nearer than the glass's focus - cut
   *  from its view, and the tag, bar, line or name over it with it (her own hands', on my deck). */
  const glassCuts = (at) => at.front && at.depth < shared.spyglass.near;

  /** Whether the glass may be up this frame. AUDIT CAPTAIN'S SEA S1: never while a door builds or the world is moved -
   *  the exterior's frame runs through a door's build, and the modal arms return before this step once it stands. */
  const spyglassAllowed = () => shared.navalOn() && !!shared.naval?.aboard?.() && shared._mode() === 'exterior' && walkMode && shared.playerSpawned && !shared._loading && !gamePaused()
    && !townTalk.overlayActive && !shared.travelView?.active && !shared.naval?.aiming && !(townTalk.overlay instanceof DeathScreen)
    && !shared.modes?.transitioning && !worldMoveBusy();
  /** AUDIT CAPTAIN'S SEA S1/S15: THE GLASS DOWN AT ONCE - every door, load and move of the world (navalClear's), and a
   *  video over the world: the arms that take those frames return before spyglassStep, so a glass up through a cabin's
   *  door stood frozen indoors (its window, its lens slowing the look, the wheel eaten, the head held). */
  function lowerGlass() {
    shared.spyglass.up = false;
    shared.spyglass.lens = 1;
    shared.spyglass.near = GLASS_NEAR_MIN;   // GLASS-CLEAR
    shared.glassDoorPress = false;
    mwViewHoldFirst(false);
    shared.naval?.glass?.(0, { up: false, zoom: shared.spyglass.zoom });
    drawSpyglass(null);
    spyglassTaps();
  }
  /** AUDIT CAPTAIN'S SEA S3: the d-pad presses the player gave the glass, for the helm's prompts ([{ dir, kind }]). */
  const glassDpad = () => (isEnhancedPlus() ? Object.entries(plusDpadMap()).flatMap(([dir, m]) => ['tap', 'hold'].filter((k) => m[k] === 'Spyglass').map((kind) => ({ dir, kind }))) : []);
  /** The glass's frame: its press read (the key's edge, the plate's tap, the host's door, a finger's Lower), lowered where
   *  it may not be up, the head held for it, its lens eased, the ship it holds made out and its window drawn. */
  function spyglassStep(dt) {
    const taps = spyglassTaps();
    const pressedNow = hccActionPressed('Spyglass') || navalTouchGlass() || shared.glassDoorPress || (taps.lower && shared.spyglass.up);
    shared.glassDoorPress = false;
    if (pressedNow && (shared.spyglass.up || spyglassAllowed())) shared.spyglass.up = !shared.spyglass.up;
    if (shared.spyglass.up && !spyglassAllowed()) shared.spyglass.up = false;
    if (taps.zoom && shared.spyglass.up) shared.spyglass.zoom = nextGlassZoom(shared.spyglass.zoom);   // AUDIT CAPTAIN'S SEA S3: a finger's Magnify
    mwViewHoldFirst(shared.spyglass.up);
    shared.spyglass.lens = easeLens(shared.spyglass.lens, shared.spyglass.up ? shared.spyglass.zoom : 1, dt);
    const fovY = glassFov(fieldOfView() + climbFeel.fovRad(), shared.spyglass.lens);
    // AUDIT CAPTAIN'S SEA S19: the glass holds no ship outside its own circle - the tube's radius, at the lens drawn
    const field = Math.atan(Math.tan(fovY / 2) * GLASS_FIELD * Math.min(1, largeHudWorldAspect(shared._canvasSize().w, shared._canvasSize().h) || 1));
    // GLASS-CLEAR (the owner: "the ship blocks your view most of the time when using your spyglass"): the glass's focus -
    // just past the ship I stand aboard as its lens comes on (the frame's lens below takes it: her own masts, sails and
    // hands out of the view, every ship beyond her in it), never so far that the sea at the view's foot is cut
    // (ui/spyglassView.js glassNear); last frame's eye
    const pitch = cam.pitch + climbFeel.pitch();
    shared.spyglass.near = shared.spyglass.lens > 1 && shared.navalOn() && shared.naval ? glassNear({ lens: shared.spyglass.lens, zoom: shared.spyglass.zoom, fovY, pitch,
      own: glassClearDepth({ box: shared.naval.ownExtent(), eye: cam.pos, yaw: cam.yaw, pitch, field }),
      eyeOverSea: glassEyeOverSea({ eyeX: cam.pos[0], eyeZ: cam.pos[2], yaw: cam.yaw, eyeY: cam.pos[1], seaY: tvSeaY(), fovY, pitch, groundAt: heightAt }) }) : GLASS_NEAR_MIN;
    const card = shared.navalOn() && shared.naval ? shared.naval.glass(dt, { up: shared.spyglass.up, zoom: shared.spyglass.zoom, field, near: shared.spyglass.near }) : null;   // GLASS-CLEAR: and none it is not focused on
    const padHand = controllerLook() ? padFamily() : null;   // the pad in hand: its button named, not the key
    const { w, h } = shared._canvasSize();
    drawSpyglass(shared.spyglass.up ? { card, zoom: shared.spyglass.zoom } : null, {
      keys: { glass: padHand ? glassPadWords(padHand) : shared.navalKeyName('Spyglass'), zoom: padHand ? hdGlyphName(padHand, GLASS_PAD_ZOOM) : null },
      scale: enhancedHudScale(), touch: !!shared.touch, pad: !!padHand, covered: !!townTalk.hudHidden,
      rect: w > 0 && h > 0 ? worldRectPx(worldViewportRect(w, h), w, h) : null,   // AUDIT CAPTAIN'S SEA S10: the world's strip
    });
  }
  /** SPYGLASS: the wheel turns the glass while it is up - a notch up doubles its magnification, a notch down halves it. */
  function spyglassWheel(deltaY) {
    if (!shared.spyglass.up || !deltaY) return false;
    shared.spyglass.zoom = Math.max(GLASS_ZOOM_MIN, Math.min(GLASS_ZOOM_MAX, deltaY < 0 ? shared.spyglass.zoom * 2 : shared.spyglass.zoom / 2));
    return true;
  }
  /** SHOT-KINDS: the wheel while the guns are laid steps their load (scenes/naval/navalLoads.js) - the camera's zoom waits. */
  const shotWheel = (deltaY) => !!shared.naval?.shotWheel?.(deltaY);

  /** STEED-UI: THE SADDLE PANEL (ui/enhanced/enhancedSaddle.js, scenes/saddleHost.js) - Enhanced Plus, outdoors, astride a horse
   *  or on a wagon's bench. Once a frame from the frame's own top, as the helm is (a door, a death, the skin turned take
   *  it down); hidden under the helm's own covers - a window over the HUD, the HUD toggled off, a pause, a journey. */
  function saddleDrawPanel() {
    const show = isEnhancedPlus() && typeof document !== 'undefined' && walkMode && shared.playerSpawned && shared._mode() === 'exterior' && !(townTalk.overlay instanceof DeathScreen);
    shared.saddleHost.frame({
      show, mode: player.transportMode,
      covered: townTalk.hudCovered || (shared.modes?.hudCovered ?? false) || gamePaused() || !hudRenderEnabled() || !!shared.travelView?.active || !!_travelUIHolder.ui?.isShowing,
      touch: !!shared.touch, mouseFree: show && (cursorActive() || shared.pointerSurfaces.size > 0 || !document.pointerLockElement),
      freeKey: shared.csaKeyLabel('FreeMouse'), keyOf: shared.csaKeyLabel,
      toggle: show && hccActionPressed('SaddlePanel'),   // UI-CALM: the panel's key (F2) - up and away
    });
  }

  /** SURV3: the water sources under the ray - every built pixel's, in scene coordinates, and the list the pick indexes. */
  let _springs = [];

  /**
   * THE WATER SOURCES, IN SCENE COORDINATES - and the list is ANSWERED,
   * not published as a side effect.
   *
   * AUDIT-WH P7. `springTargets()` used to clear and refill the
   * module-level `_springs` on its way to building the targets, and
   * `drinkAtSpring` indexed that array. Per PRESS that was one call
   * and one read, in that order. The hover made it three readers a
   * frame - the press's pick, the plaque's pick and the plaque's
   * NAMER, which reads the dry flag - and the take's correctness then
   * rested on the press's call happening earlier in the same frame
   * than anyone else's. Nothing stated that, and nothing could have
   * caught it: the list is identical between calls in the same frame,
   * so the ordering is load-bearing exactly until the day a pixel
   * streams in between two of them.
   *
   * One builder, three readers, no shared slot. `_springs` is still
   * written through (PERF-TOWN1: the same array, refilled) because it
   * is rebuilt every frame and nothing holds it across one.
   */
  const springList = () => {
    _springs.length = 0;
    if (!survivalOn()) return _springs;
    for (const p of built.values()) {
      if (!p.springs?.length) continue;
      const t = state.pixelTranslation(p.px, p.py);
      for (const s of p.springs) _springs.push({ pos: [s.pos[0] + t[0], s.pos[1] + t[1], s.pos[2] + t[2]], dry: s.dry });
    }
    return _springs;
  };
  const springTargets = () => springList().map((s, i) => ({ key: `water:${i}`, aabb: { min: [s.pos[0] - 0.8, s.pos[1], s.pos[2] - 0.8], max: [s.pos[0] + 0.8, s.pos[1] + 1.6, s.pos[2] + 0.8] }, distance: RAY_DISTANCE, reach: DEFAULT_ACTIVATION_DISTANCE }));
  const springAt = (key) => springList()[Number(key.split(':')[1])] ?? null;
  const drinkAtSpring = (key) => {
    const s = springAt(key);
    if (!s) return false;
    townTalk.say(s.dry ? DRY_SOURCE_TEXT : drinkAtSource(playerEntity, Math.floor(ownMinutes())).text);   // LIVED1: thirst is the body's own clock
    return true;
  };
  return {
    drinkAtSpring, etherCrossStep, glassCuts, glassDpad, lowerGlass, rideOnTheRoad, saddleDrawPanel, shotWheel,
    springAt, springTargets, spyglassStep, spyglassWheel, upkeepPass, wagonLoadShare, withdrawCrossing,
  };
}
