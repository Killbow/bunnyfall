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
  const upkeepPass = (n) => { playerTicker.advance(n); runEncounterTick(walkMode && shared.playerSpawned ? player.pos : cam.pos, true); };
  // During the Overworld view or a journey autopilot the horse keeps the full ride pace, because the travel clock,
  // the governor, the steering reach, and band chases assume it.
  const rideOnTheRoad = () => !!shared.travelView?.active || !!(shared.travelOptions?.isTravelActive && shared.travelOptions.state?.autopilot);

  const wagonLoadShare = () => { const lim = wagonKgFor(playerEntity); return lim > 0 ? totalWeight(playerEntity.wagonItems ?? []) / lim : 0; };

  let _crossCheckT = 0;

  const crossWayHere = () => {
    const p = playerTravelPixel();
    return crossingWayAt(p.x, p.y, etherOut && p.x < CROSS_X && !inEther(p.x, p.y) ? shared.crossLandPx(p.x, p.y) : 0);
  };
  const crossRefusal = () => (shared.navalHostileNear() ? 'hostile' : shared.csaPassengersOn(shared.csaRuntime?.state?.CurrentBoat, shared.veilParty.kin) > 0 ? 'passengers' : null);
  let _crossBox = null, _crossSaid = null;
  function withdrawCrossing() {
    if (_crossBox && !_crossBox.done) _crossBox.withdraw();
    _crossBox = null;
  }
  // A refusal is said once per waters and does not mark the way asked, so the question comes back once the deck is
  // clear.
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
  // Yes rechecks the helm, the waters, and the world state, because a load or a move can happen while the question
  // is open.
  function crossYes(way, boat) {
    if (shared._etherCrossing || worldMoveBusy() || shared._partyArrivalPending || !shared.csaRuntime?.isSailing?.() || shared.csaRuntime.state.CurrentBoat !== boat || crossWayHere() !== way) {
      shared.crossGate.asked(null);
      townTalk.say(CROSS_STALE, 4);
      return;
    }
    const why = crossRefusal();
    if (why) { shared.crossGate.asked(null); _crossSaid = way; townTalk.say(CROSS_REFUSED[why], 4); return; }
    shared.etherCross(way).catch((e) => console.warn('[ether] the crossing:', e?.message ?? e));
  }

  const glassCuts = (at) => at.front && at.depth < shared.spyglass.near;

  const spyglassAllowed = () => shared.navalOn() && !!shared.naval?.aboard?.() && shared._mode() === 'exterior' && walkMode && shared.playerSpawned && !shared._loading && !gamePaused()
    && !townTalk.overlayActive && !shared.travelView?.active && !shared.naval?.aiming && !(townTalk.overlay instanceof DeathScreen)
    && !shared.modes?.transitioning && !worldMoveBusy();
  // Callers lower the glass at every door, load, and world move, because those frames return before `spyglassStep`
  // runs.
  function lowerGlass() {
    shared.spyglass.up = false;
    shared.spyglass.lens = 1;
    shared.spyglass.near = GLASS_NEAR_MIN;
    shared.glassDoorPress = false;
    mwViewHoldFirst(false);
    shared.naval?.glass?.(0, { up: false, zoom: shared.spyglass.zoom });
    drawSpyglass(null);
    spyglassTaps();
  }
  const glassDpad = () => (isEnhancedPlus() ? Object.entries(plusDpadMap()).flatMap(([dir, m]) => ['tap', 'hold'].filter((k) => m[k] === 'Spyglass').map((kind) => ({ dir, kind }))) : []);
  function spyglassStep(dt) {
    const taps = spyglassTaps();
    const pressedNow = hccActionPressed('Spyglass') || navalTouchGlass() || shared.glassDoorPress || (taps.lower && shared.spyglass.up);
    shared.glassDoorPress = false;
    if (pressedNow && (shared.spyglass.up || spyglassAllowed())) shared.spyglass.up = !shared.spyglass.up;
    if (shared.spyglass.up && !spyglassAllowed()) shared.spyglass.up = false;
    if (taps.zoom && shared.spyglass.up) shared.spyglass.zoom = nextGlassZoom(shared.spyglass.zoom);
    mwViewHoldFirst(shared.spyglass.up);
    shared.spyglass.lens = easeLens(shared.spyglass.lens, shared.spyglass.up ? shared.spyglass.zoom : 1, dt);
    const fovY = glassFov(fieldOfView() + climbFeel.fovRad(), shared.spyglass.lens);
    const field = Math.atan(Math.tan(fovY / 2) * GLASS_FIELD * Math.min(1, largeHudWorldAspect(shared._canvasSize().w, shared._canvasSize().h) || 1));
    const pitch = cam.pitch + climbFeel.pitch();
    shared.spyglass.near = shared.spyglass.lens > 1 && shared.navalOn() && shared.naval ? glassNear({ lens: shared.spyglass.lens, zoom: shared.spyglass.zoom, fovY, pitch,
      own: glassClearDepth({ box: shared.naval.ownExtent(), eye: cam.pos, yaw: cam.yaw, pitch, field }),
      eyeOverSea: glassEyeOverSea({ eyeX: cam.pos[0], eyeZ: cam.pos[2], yaw: cam.yaw, eyeY: cam.pos[1], seaY: tvSeaY(), fovY, pitch, groundAt: heightAt }) }) : GLASS_NEAR_MIN;
    const card = shared.navalOn() && shared.naval ? shared.naval.glass(dt, { up: shared.spyglass.up, zoom: shared.spyglass.zoom, field, near: shared.spyglass.near }) : null;
    const padHand = controllerLook() ? padFamily() : null;
    const { w, h } = shared._canvasSize();
    drawSpyglass(shared.spyglass.up ? { card, zoom: shared.spyglass.zoom } : null, {
      keys: { glass: padHand ? glassPadWords(padHand) : shared.navalKeyName('Spyglass'), zoom: padHand ? hdGlyphName(padHand, GLASS_PAD_ZOOM) : null },
      scale: enhancedHudScale(), touch: !!shared.touch, pad: !!padHand, covered: !!townTalk.hudHidden,
      rect: w > 0 && h > 0 ? worldRectPx(worldViewportRect(w, h), w, h) : null,
    });
  }
  function spyglassWheel(deltaY) {
    if (!shared.spyglass.up || !deltaY) return false;
    shared.spyglass.zoom = Math.max(GLASS_ZOOM_MIN, Math.min(GLASS_ZOOM_MAX, deltaY < 0 ? shared.spyglass.zoom * 2 : shared.spyglass.zoom / 2));
    return true;
  }
  const shotWheel = (deltaY) => !!shared.naval?.shotWheel?.(deltaY);

  function saddleDrawPanel() {
    const show = isEnhancedPlus() && typeof document !== 'undefined' && walkMode && shared.playerSpawned && shared._mode() === 'exterior' && !(townTalk.overlay instanceof DeathScreen);
    shared.saddleHost.frame({
      show, mode: player.transportMode,
      covered: townTalk.hudCovered || (shared.modes?.hudCovered ?? false) || gamePaused() || !hudRenderEnabled() || !!shared.travelView?.active || !!_travelUIHolder.ui?.isShowing,
      touch: !!shared.touch, mouseFree: show && (cursorActive() || shared.pointerSurfaces.size > 0 || !document.pointerLockElement),
      freeKey: shared.csaKeyLabel('FreeMouse'), keyOf: shared.csaKeyLabel,
      toggle: show && hccActionPressed('SaddlePanel'),
    });
  }

  let _springs = [];

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
    townTalk.say(s.dry ? DRY_SOURCE_TEXT : drinkAtSource(playerEntity, Math.floor(ownMinutes())).text);
    return true;
  };
  return {
    drinkAtSpring, etherCrossStep, glassCuts, glassDpad, lowerGlass, rideOnTheRoad, saddleDrawPanel, shotWheel,
    springAt, springTargets, spyglassStep, spyglassWheel, upkeepPass, wagonLoadShare, withdrawCrossing,
  };
}
