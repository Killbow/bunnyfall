// The frame's HUD and UI phases: the status bar and compass, then the travel panel, the talk
// layer, and the rest drawn over the HUD.
import { boatCompassPoints } from '../../ui/boatMarks.js';
import { capturePendingScreenshot } from '../../saves/saveSlots.js';
import { deliverOwedShots } from '../../ui/screenshot.js';
import { drawEnhancedTravelControl, hideEnhancedTravelControl } from '../../ui/enhancedTravelControl.js';
import { drawHud } from '../../ui/hud.js';
import { duelVitality } from '../../net/duelBar.js';
import { fetchBytes } from '../shared.js';
import { frameEnd } from '../../platform/frameClock.js';
import { getBazaarGothwayHost } from '../bazaarBetwixtRoom.js';
import { getInteractionMode } from '../../player/interactionMode.js';
import { hidePaceBox, showPaceBox } from '../../ui/travelPaceControls.js';
import { isEnhanced } from '../../ui/uiSkin.js';
import { largeHudOptions } from '../../ui/hudLarge.js';
import { meterFor } from '../../render/perfMeter.js';
import { mwViewWagonTargets } from '../../player/mwView.js';
import { peacefulFoePass, pickActivatableHit, RAY_DISTANCE } from '../../player/activate.js';
import { playerEntity } from '../../characters/playerEntity.js';
import { raceActivation } from '../../player/activationRace.js';
import { rrRidingOn } from '../../mods/rrRealism.js';
import { SD_COMPASS_M } from '../../worldEvents/sdOmen.js';
import { setPaceGround } from '../../travel/travelPace.js';
import { syncWaypointGroups } from '../../maps/mapWaypoints.js';
import { TERRAIN_SIZE } from '../../world/terrainSampler.js';
import { worldHoverFrame } from '../../ui/worldPlaque.js';

/** @param {any} shared */
export function createHudFrame(shared) {
  const {
    _fr, _hoverContents, _hoverModNamers, _hoverNamers, _hoverPeerPick, _hoverPersonPick, _mode, cam, camps, canvas,
    cityGuards, collider, cromwark, csaActivationPick, csaBoatUnderMe, csaDrawWindWidget, csaRuntime, detectFeed,
    drawPeerNames, droppedTorches, duelMgr, dwLootTargets, egClient, enchantFeet, exteriorFoes, frame, gamePaused,
    gateCompassMark, gatePool, gateVeil, hcc, hoverPicks, magic, modes, mountRig, myGuildTag, navalCrewBars, navalCrewLines,
    navalOn, navalTags, palette, partyCompass, player, playerTravelPixel, pointerSurfaces, professionMarks,
    profHoverOver, questCompassMark, queue, quickOffHand, quickSpell, quickSwap, quickSwitchHand, quickUse, renderer,
    rideOnTheRoad, riteHost, rrRidingContacts, sdCompassMark, serpentCompassMark, shipPortraits, shotMode,
    sigilBroker, socialLink, springTargets, starfall, state, toggleTravelMap, townQuestCompassMark, townTalk,
    travelControlUI, travelJunctionMap, travellerOnRoad, upkeep, vendorCompassMark, walkMode, weaponRig,
    wildMarksFrame, yards,
  } = shared;
  function frameHudPhase(now, dt) {
    const { paralyzed, tvf, mwv, proj, view } = _fr;
    // AUDIT 21 (hosts lane, F7): THE HUD, which this host did not have.
    //
    // ?world and ?exterior drew no status bar at all - no health, no fatigue,
    // no magicka, no compass. Guards can hurt you here, falls can hurt you,
    // fatigue drains every classic minute and diseases drain attributes, and
    // you could see none of it. Walk into the dungeon and the whole classic
    // HUD appears; walk out and it vanishes.
    //
    // ui/hud/hud.js was already host-agnostic - drawHud(renderer, canvas, art,
    // vitals, heading01) - so this is the art loaded once and drawn last,
    // over the viewmodel, exactly as dungeonContext draws it. Under the talk
    // layer, because a talk window is a modal above the vitals.
    // AUDIT 39: THE CALL IS UNCONDITIONAL. drawHud runs the damage
    // flash and the enhanced DOM HUD ABOVE its own `!art` return
    // (hud.js:"HUDCompass.DrawCompass") because neither reads ARENA2 - "a player whose
    // HUD art failed to load still has vitals". Wrapping the whole
    // call in `if (hudArt)` inverted that: hudArt starts null and is
    // filled by a fire-and-forget load whose failure leaves it null
    // forever, so the enhanced skin had no vitals for the first
    // frames and none at all when MAIN/HUD could not be read.
    meterFor(renderer.gl)?.markCpu('hud');   // PERF-ZONE2: the HUD's preparation and its draw; PERF-READ1: it ends at the next mark below, not at the next frame's first
    const frameHud = () => {   // PERF-V8
    {
      const _hfw = [-view[2], -view[10]];
      // X4: the Detect markers. Exterior mode's nearby pool is the
      // guards plus the encounter foes - the same list the spell
      // engine already targets - and, since FX1 (F207), the world
      // piles and corpse containers too: Detect Treasure marks your
      // own dropped pile out here, as DFU's ungated loot walk does.
      const _detected = detectFeed.tick(dt);
      // TR2/TR3: the mount's own frame and audio, then its sprite -
      // OnGUI draws at depth 2, under the HUD's own elements, so it
      // goes in before drawHud.
      // The classic-art guard stays HERE, where it stood before AUDIT
      // 39 hoisted drawHud out of it: the mount is the classic skin's
      // business and this fix owns the HUD call, nothing else.
      if (shared.hudArt) {
        // MAC-K3: the animator, the audio and the sprite, all one
        // call into `player/mountRig.js` - the same rig the fixed-city
        // host now mounts, so the mount cannot behave differently in a
        // town than it does on the road.
        mountRig.frame(dt);
        // RR2: EnhancedRiding.OnTriggerEnter / OnControllerColliderHit (:157-215)
        // - a galloping rider tramples the townsperson under the hooves and
        // charges down the foe in the way, once each
        // RPT1026-MISC JOURNEY-TRAMPLE (a private report: charged with Assault for an Overworld journey on horseback that
        // passed through a town): never while a journey drives the ride (rideOnTheRoad: the Overworld's view, or
        // a Travel Options autopilot - a held Run or AutoRun gallops it). DFU's mods run EnhancedRiding's OnTriggerEnter
        // under TravelOptions' journey too, the clip muted (RidingVolumeScale 0, AUDIT-TO1 J1); here a journey at sixty
        // times the pace charged an Assault for townsfolk under hooves the player never steered. Ledger A.
        if (rrRidingOn() && player.riding && player.isRunning && !rideOnTheRoad()) rrRidingContacts();
      }
      // DISC14 (Starempire42 on Discord: "is there a way to make it so I can see my weapon above my horse?"): the
      // weapons draw OVER the mount. OnGUI puts the horse at GUI.depth 2, "behind other HUD elements & weapons"
      // (TransportManager's own comment, and EnhancedRiding.cs:234-235's), and the rig drew first, so the horse's
      // head covered the hand and the blade's root. Drawn here, after the mount and before drawHud.
      if (!shared.poiEditor?.active()) { if (walkMode && shared.playerSpawned && !tvf && !shared.farmingMode?.active) weaponRig.draw({ paralyzed }); }   // TV1: no hand on a camera 450 m up; POI-3: nor on the editor's eye
      drawPeerNames(proj, view, mwv.eye);   // ONLINE1: the names over the heads
      navalTags(proj, view, mwv.eye);   // AUDIT NAV1 (#14): the ships' tags
      navalCrewBars(proj, view, mwv.eye);   // SHIPMATES: the crew's green bars
      navalCrewLines(proj, view, mwv.eye, dt);   // LIVING CREW: the lines over their heads
      wildMarksFrame(proj, view, mwv.eye);   // WILD-ALERT: the "!" over an alerted foe
      // WORLD-HOVER: the plaque, where this host already draws its HUD.
      // It races EXACTLY what the press races - the same six live picks
      // against the same door/person/board set, settled by the same
      // `raceWinner` - so it can never name what the button ignores.
      // The port's own world objects name themselves, each from the
      // module that STANDS the target, through World Tooltips' own
      // extension API. `gamePaused()` is this arm's `cursorActive`.
      {
        const _hd = [Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)];
        worldHoverFrame({
          eye: cam.pos,
          dir: _hd,
          collider,
          canvas,
          // AUDIT-WH2 L3-F3: ...AND THE POINTER SURFACES, which
          // `gamePaused` does not count. This host frees the mouse for
          // three of its own surfaces (AUDIT SOC B6, the Set at the key
          // ladder's head): the chat, the friends panel and the peer
          // F-menu. None of them is an overlay in `gamePaused`'s sense,
          // so the plaque went on naming a shopfront through them.
          //
          // It parts from the crosshair here, and only here, for a
          // reason the crosshair does not have: the plaque is a DOM
          // node at `z-index: 6` (enhancedStyle.js .wplaque) and
          // `.dfpeer` is a DOM node at `z-index: 6` (socialMenu.js),
          // both `position: fixed` within three percent of the same
          // centre - so the plaque PAINTS OVER the menu the player just
          // opened. The reticle is drawn into the canvas underneath and
          // can never do that. `pointer-events: none` keeps the clicks
          // working; it does not keep the panel readable.
          cursorActive: gamePaused() || pointerSurfaces.size > 0 || !!tvf,   // TV1: the travel view frees the cursor - no crosshair, nothing named under it
          // PROF-MENU: the profession node the press would take, over the race's own winner (gatherHost.hoverHit)
          pick: () => {
            const _hp = hoverPicks(cam.pos, _hd);
            const _bz = pickActivatableHit(cam.pos, _hd, getBazaarGothwayHost(shared)?.targets() ?? [], collider);
            if (_bz && (!_hp.broker || _bz.distance < _hp.broker.distance)) _hp.broker = _bz;
            return profHoverOver(modes.exteriorHoverPick(cam.pos, _hd, _hp));
          },
          name: (key) => getBazaarGothwayHost(shared)?.hoverName(key) ?? modes.exteriorHoverName(key, { eye: cam.pos, dir: _hd, names: _hoverNamers, modNames: _hoverModNamers }),
          contents: _hoverContents,
        });
      }
      drawHud(renderer, canvas, shared.hudArt, playerEntity,
        ((Math.atan2(_hfw[0], _hfw[1]) / (Math.PI * 2)) % 1 + 1) % 1, dt,
        { font: townTalk.font, cursorActive: gamePaused(), reticleHidden: !!tvf,   // AUDIT DEEP T1-9
          // AUDIT 64 F35 (review round): the PAINT's gate is not the
          // pause. DFU paints the whole small HUD under every
          // `DaggerfallUI.MessageBox` box, whose previousWindow is the
          // then-top HUD (DaggerfallUI.cs:1330 over
          // DaggerfallPopupWindow.cs:76-84), and blanks it only for the
          // null-previous windows it pushes from :512-530. Same union
          // `gamePaused` takes, asked of the two stacks' chains.
          windowCoversHud: townTalk.hudCovered || (modes?.hudCovered ?? false),
          hudHidden: townTalk.hudHidden,   // MAP-FIELD2: the held map takes the vitals and the status icons with it, on both skins
          detected: _detected, playerXZ: [enchantFeet()[0], enchantFeet()[2]],
          gate: gateCompassMark(),   // WB1: the Oblivion Gate on the compass, while the player stands in its ring
          arch: egClient?.archCompass() ?? null,   // EG-F: my company's Elite arch on the compass, while it stands
          serpent: serpentCompassMark(),   // SERPENT1: the sea serpent on the compass, while the player sails in its ring
          star: starfall?.compassMark() ?? null,   // STAR6: the nearest of the night's stars in the player's region
          sd: sdCompassMark(),   // SD2c: a found Super dungeon on the compass, while the player stands within SD_COMPASS_M of it
          quest: vendorCompassMark() ?? townQuestCompassMark() ?? questCompassMark(),   // GUIDE5: the tracker's quest's place on the compass, on the street; HOME-VENDOR: a trader's waypoint first, while it is set; GUIDE8: the Town tier's building, in its town
          party: partyCompass(),   // COMPASS-PARTY: the party's marks - the bodies drawn here, the rest where their poses say
          ships: navalOn() && _mode() === 'exterior' ? shared.naval?.compassShips() ?? null : null, boats: csaRuntime && _mode() === 'exterior' ? boatCompassPoints(csaRuntime.AllBoats, csaBoatUnderMe(), enchantFeet(), state, TERRAIN_SIZE) : null,   // AUDIT NAV1 (the helm): the sea's ships on the compass; BOAT-MARK: my own boats, from anywhere on the street (under the travel view too), the one at my helm left out
          nodes: professionMarks(),   // NODE-MARKS: every profession's nodes near (PROF2: a Prospector's veins within 500 m since MINE-PERKS, PROF0 3.3); PROF7: a Tracker's animals within 100 m
          largeHud: largeHudOptions({ renderer, fetchBytes, palette }, playerEntity),
          // AUDIT 39: the enhanced HUD's two hand plaques. Both values
          // are already this host's - the rig one argument over, the
          // readied spell its own magic - and a host that hands
          // neither draws neither, which is what made the seam dead.
          readied: magic?.readied?.() ?? null,
          weapon: weaponRig.playerWeapon.restingWeapon ?? null,   // TWO-HANDS (AUDIT): the lead's, never the off hand's mid-blow
          // QS4: THE PHONE'S OWN DOORS. The diamond's cells take a finger
          // on a touch-first device (ui/enhanced/enhancedHud.js's second departure),
          // and a door the host never handed over is a control that
          // platform does not have - which is the whole of AUDIT SOC C9.
          quickUse: (n) => quickUse(n), quickSwap: () => quickSwap(), quickOffHand: () => quickOffHand(), quickSpell: () => quickSpell(), quickSwitchHand: () => quickSwitchHand(),   // QS6   // MAC-R3: the main cell's hand switch
          grip: player.gripShown,   // CLIMB2: the enhanced climb's grip - both HUDs draw it
          steed: _mode() === 'exterior' ? upkeep.bar(player.transportMode) : null,   // STEED1: the ridden horse's breath, in the grip's place
          healthBar: duelVitality(duelMgr.live, shared.online?.id ?? ''),   // DUEL-BAR (FIELD BUGS 2026-10-19f, the owner: "Bar shows duel vitality"): the referee's vitality on both skins' bar while my duel is live, the save's at its end - display only
          weaponSheathed: !!weaponRig.playerWeapon.sheathed });   // AUDIT 28 W2: the arrow counter's drawn-bow gate   // U38 + X4 + U43
      csaDrawWindWidget();   // CSA-E: over the HUD
    }
    };
    frameHud();
  }
  function frameUiPhase(now, dt) {
    meterFor(renderer.gl)?.markCpu('ui');   // PERF-READ1: the travel panel, the talk layer and everything else the frame draws over the HUD, to the frame's end
    // TO1: THE TRAVEL PANEL, on the HUD layer and after it - a journey's
    // controls sit over the vitals and under the talk layer, so a
    // message box still covers them. It is here rather than in the
    // overlay slot because an overlay HOLDS the motor and the clock
    // (`_overlayHeld` above), and a journey is the one window that must
    // not (TravelControlUI.cs:83, `pauseWhileOpened = false`).
    // AUDIT-TO1 F1: THE JUNCTION MAP IS THE HUD'S, NOT THE PANEL'S. In the
    // mod it is a child of the HUD's native panel (TravelOptionsMod.cs:358)
    // drawn whenever `Enabled`, and the two moments it exists for are
    // both moments the travel window is DOWN - the stop at a junction
    // (SelectNextPath enables it and then closes the window, :735-748)
    // and the follow key's off-path toggle (:646-652). Both draws sat
    // inside `if (travelControlUI?.isShowing)`, so the map was painted
    // only while a leg ran and vanished the instant the leg ended: the
    // player was told to pick a direction with no map to pick it from.
    const _junctionUp = !!(travelJunctionMap && shared.travelOptions?.junctionMapOn);
    const _junctionState = _junctionUp ? {
      on: true, buf: travelJunctionMap.buf, settings: shared.travelOptionsSettings,
      mapPixel: travelJunctionMap.lastDrawn ?? playerTravelPixel(),
      direction: travelJunctionMap.lastDrawn?.direction ?? 0,
      deps: travelJunctionMap.deps,
    } : { on: false };
    if (travelControlUI?.isShowing) travelControlUI.tick(dt);   // :165-179 - the message's clock is Time.unscaledTime, which this dt is
    // PACE-DIALS (2026-10-06, the player: "100x should be only setable when on a road and it has to go to 60 instantly
    // again when leaving the road"): THE ROAD RULE'S GROUND, every frame a journey or the Overworld runs - the journey's
    // own word (its leg, its lane), or the feet's under the view; leaving a road takes a dial at x100 to x60 at once
    // (systems/travel/travelPace.js), whichever skin is worn, online or off
    // GROUP-LEAVE (2026-10-06): the party and guild I stand in, told to the waypoints while the hub is open - leaving one
    // (or being removed, or joining another) takes its waypoints off both maps; a dropped link removes nothing
    if (socialLink()?.status === 'open' && shared.social) syncWaypointGroups({ party: shared.social.party?.id ?? null, guild: myGuildTag() });
    if (travelControlUI?.isShowing) setPaceGround(!!travelControlUI.onRoad);
    else if (shared.travelView?.state === 'up') setPaceGround(travellerOnRoad());
    const framePace = () => {   // PERF-V8
    if (isEnhanced() && typeof document !== 'undefined') {
      hidePaceBox();   // PACE-DIALS: the enhanced skins carry their own dials (the journey bar, the Overworld's block)
      if (travelControlUI?.isShowing || _junctionUp) {
        drawEnhancedTravelControl({
          showing: !!travelControlUI?.isShowing,
          // AUDIT-TO1 L7: the HUD's own word - a window over the HUD hides
          // this too (the enhanced overworld is a GL picture under
          // transparent chrome, and the bar painted over the bay)
          covered: townTalk.hudCovered || (modes?.hudCovered ?? false) || gamePaused(),
          destination: travelControlUI?.destinationName ?? '',
          following: !shared.travelOptions?.destinationName,
          accel: travelControlUI?.timeAcceleration ?? 1,   // RATE-LAW: the rate the journey's ground runs at
          onRoad: !!travelControlUI?.onRoad,   // RATE-LAW: and which ground it is
          held: shared.tvHeld,   // TV2: the travel view's cap, while it holds the clock under the ground's rate
          heldWhy: shared.tvHeldWhy,   // AUDIT OW5 G1: and why; OW6: the land loading, an enemy near, or the view down (its ground)
          stranger: shared._strangerRateNow,   // PVPNEAR
          message: travelControlUI?.message ?? '',
          minutesLeft: shared.travelOptions?.minutesLeft ?? null,   // AUDIT-TO1 L5: the popup's estimate, run down on the world clock
          from: playerTravelPixel(),
          to: shared.travelOptions?.route?.summary?.pixel ?? shared.travelOptions?.route?.point?.pixel ?? shared.travelOptions?.state?.autopilot?.destinationMapPixel ?? null,   // AUDIT DEEP T2-6: a road journey's distance is to the place, never to the next bend
          junction: _junctionState,
        }, {
          map: () => toggleTravelMap(),
          camp: () => travelControlUI?.closeWindow(),
          exit: () => travelControlUI?.cancelWindow(),
        });
      } else hideEnhancedTravelControl();
    } else {
      // PACE-DIALS: every other skin - the dials' own box while a journey runs, under the same rule
      if (travelControlUI?.isShowing && typeof document !== 'undefined') showPaceBox(); else hidePaceBox();
      if (travelControlUI?.isShowing) travelControlUI.draw(renderer, canvas, townTalk.font);
      if (travelJunctionMap) {
        travelJunctionMap.enabled = _junctionUp;
        travelJunctionMap.drawPanel(renderer, canvas);   // over the strip when it is up - TravelControlUI.Draw's own extra call (:185-186)
      }
    }
    };
    framePace();
    townTalk.frame(dt);   // T3b: HUD lines + the talk overlay, above everything
    renderer.resolveFrame();   // AUDIT RETRO1 E5/C8: a frame that drew no screen quad (the enhanced skin, a sheathed weapon) is shown NOW, not at the next beginFrame
    // SS1: the frame's LAST draw is behind us - deliver a pending save
    // screenshot while the buffer is still this task's to read
    // (preserveDrawingBuffer false clears it after compositing).
    capturePendingScreenshot(canvas);
    deliverOwedShots();   // SHOT1: the PrintScreen shots owed to a drawn frame, read from this one (ui/screenshot.js)
    // AUDIT MENU-ORDER R2: THE PANEL PASSES LAST - after the frame is shown and its shots are taken. A panel pass is its own
    // beginFrame: drawn amid the world pass, it left its camera and light in the mesh program for every world draw after
    // it (beginFrame alone uploads them) and resolved the lighting lane's image early, so the rest of the world drew with
    // no depth; and a shot taken after it held the picture. Each pass copies its rect out at once, so here costs nothing.
    yards?.drawPreview();   // HOME-YARD: the decorator's panel, its pointed model turning in the preview box (and its tiles' models)
    shipPortraits.draw();   // MENU-ORDER: the shipmaster's cards' pictures, under his window

    if (shotMode) {
      window.__frame++;
      if (queue.length === 0 && !shared.building && !window.__shotReady) {
        window.__shotReady = true;
      }
    }
    gateVeil?.frameDrawn();   // AUDIT WB D5: the step's fire holds shut on the frames the new place has drawn
    meterFor(renderer.gl)?.stopCpu();   // PERF-READ1: the last span closes HERE, not at the next frame's first mark - the rAF wait is nobody's
    frameEnd();   // PERF1
    requestAnimationFrame(frame);
  }
  return { frameHudPhase, frameUiPhase };
}
