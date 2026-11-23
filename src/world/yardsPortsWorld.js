// The world's yards and ports: the joinery bench and the wagon yard's mend, the lighthouse stair,
// and the port's lights, people, glows, and cannon smoke for the frame. It also holds the town a
// warden watches, and the POI editor's cursor and door. Mounting the POI editor stays in the world.
import { activeWagonItem } from '../travel/wagonKinds.js';
import { controllerLook } from '../player/lookFilter.js';
import { cursorActive, holdCursor, requestLook } from '../player/pointerLock.js';
import { deductGold, totalGoldAmount } from '../justice/court.js';
import { forgeOffered, stationColdLine, stationDoorAt } from '../ui/profPages.js';
import { isOnFoot } from '../travel/transport.js';
import { mendWagon, WAGON_UPKEEP_TEXT, wagonWord } from '../travel/wagonUpkeep.js';
import { overlayOpen } from '../ui/enhancedOverlays.js';
import { playerEntity } from '../characters/playerEntity.js';
import { setMidScreenText } from '../ui/midScreenText.js';
import { stairFeetY, stairRefusal } from '../travel/portHost.js';
import { TERRAIN_SIZE } from './terrainSampler.js';
import { wagonUpkeepRules } from '../systems/upkeep/upkeepSwitch.js';
import { wardenTownIn } from '../travel/wagon/wagonWardenHost.js';
import { YesNoBoxWindow } from '../ui/yesNoBox.js';

/** @param {any} shared */
export function createYardsPortsWorld(shared) {
  const {
    _mode, built, cam, canvas, CITY_LIGHT_COLOR_F32, cromwark, csaRuntime, gamePaused, hccRuntimeOn, hudCtx,
    livingTravelEnemies, lookFilter, navalRender, offerStreetPerson, player, pointerSurfaces, state,
    surfaceAt, townTalk, upkeep, walkMode,
  } = shared;
  const poiDmCursor = () => { if (controllerLook()) return null; const off = holdCursor(); return () => { if (off() && !cursorActive() && !gamePaused() && !pointerSurfaces.size && !(shared.modes?.modalWindowUp?.() ?? false) && !overlayOpen() && !shared.travelView?.active && !shared.poiEditor?.active()) requestLook(canvas); }; };



  // MERCHANT-YARDS: THE TOWNS' STABLES AND WAGON YARDS (scenes/merchantYardsHost.js) - each where its pixel's build
  // placed it (`p.merchantYards`, the location frame), carried by the live floating-origin translation; its horses Horse
  // Cart and Cargo's standing horse, its wagons on show the pool's own wagons; its trade the modes' counter
  const _yardT = [0, 0, 0], _yardSites = [];

  /** CARP-YARD (bible/03-World/Merchant-Yards.md CARP-YARD): THE JOINERY'S WORKBENCH PRESSED - the Crafting page (CRAFT-HALL;
   *  the Stores page until then), landed on the workbench's section, as a home's workbench opens it (worldModes
   *  useDecorStation: the page's own gate, forgeOffered); where the page is not (offline, the switch shut) the bench says
   *  so, as a home's does. Answers true (the press handled). */
  function openYardBench() {
    if (!forgeOffered()) { townTalk.say(stationColdLine('workbench')); return true; }   // L10N4: the bench's cold line, read in the player's language
    hudCtx.togglePause({ at: stationDoorAt('workbench') });
    return true;
  }
  /** WAGONS4 (bible/06-Systems/Wagon-Upkeep.md): THE WAGON YARD'S MEND - the wagon driven made whole for the wright's
   *  price (systems/wagon/wagonUpkeep.js mendPrice), MEND_FETCH more when it is not drawn up at the yard (Horse Cart and
   *  Cargo's wagon standing out of the counter's reach - the reach its load is taken at, horseCart.js
   *  canAccessWagonInventory): a wright goes out to it, so a wagon broken down far off is never stranded. Asked, then
   *  paid. Answers true (the press handled). */
  function mendAtYard() {
    if (!wagonUpkeepRules()) { setMidScreenText('The wright has no work for you.'); return true; }   // WAGON-TIERS: Off, DFU's plain wagon - nothing to mend; Boons and Hard mend alike
    const w = activeWagonItem(playerEntity.items ?? []);
    if (!w) { townTalk.say(WAGON_UPKEEP_TEXT.noWagon); return true; }
    const rt = hccRuntimeOn();
    const away = !!rt?.physicalPersistenceEnabled && !rt.canAccessWagonInventory?.()?.allowed;
    const price = upkeep.mendPrice(away);
    if (!price) { townTalk.say(WAGON_UPKEEP_TEXT.whole(wagonWord(w))); return true; }
    const rows = [`Mend your ${wagonWord(w)} for ${price} gold?`, ...(away ? ['It is not here. The wright goes out to where it lies.'] : [])];
    townTalk.showOverlay(new YesNoBoxWindow({ rows, onYes: () => {
      if (totalGoldAmount(playerEntity) < price) { townTalk.say(WAGON_UPKEEP_TEXT.poor(price)); return; }
      deductGold(playerEntity, price);
      mendWagon(w);
      shared._hccDirty = true;
      townTalk.say(WAGON_UPKEEP_TEXT.mended(wagonWord(w), price));
    } }));
    return true;
  }
  // SHIPYARDS (2026-10-11, Mac: "...a new highly detailed shipmaster vendor and crew recruitment station within it ...
  // introduce the new lighthouse building"): A PORT TOWN'S SHIPYARD AND LIGHTHOUSE (scenes/portHost.js) - each where its
  // pixel's build placed it on the town's seaward ground (`p.portSites`, the location frame), carried by the live
  // floating-origin translation as the yards are; the shipmaster's window opened on the page pressed (openShipyard), the
  // lighthouse's stair a placing of the player (climbLighthouse), its lamp lit in the lanterns' hours
  const _portT = [0, 0, 0], _portSites = [];

  /** SHIPYARDS: THE LIGHTHOUSE'S STAIR (Mac chose "Climbable, with keeper") - the lightkeeper lets me up: my feet set on
   *  the gallery's floor facing the sea, or coming down at the tower's foot facing the town (`at`, scenes/portHost.js), as
   *  a boarding places a body (the sea fight's `placePlayer`). Up on foot alone and never with a foe about; down always (a
   *  gallery is never a trap), onto the drawn ground at the door where it stands higher than the tower's middle (a slope).
   *  Answers true, or the refusal's words. */
  function climbLighthouse(way, at) {
    const walking = walkMode && shared.playerSpawned && _mode() === 'exterior' && !!at?.feet;
    const no = stairRefusal(way, { walking, onFoot: walking && isOnFoot(player.transportMode), sailing: walking && !!csaRuntime?.isSailing?.(), foes: walking && way === 'up' && !!livingTravelEnemies() });
    if (no) return no;
    player.spawn(at.feet[0], stairFeetY(way, at.feet[1], way === 'down' ? surfaceAt(at.feet[0], at.feet[2]) : NaN), at.feet[2]);
    cam.yaw = at.yaw; cam.pitch = 0; lookFilter.settle();
    cam.pos = player.eyeAt();
    return true;
  }

  /** The lighthouses' lamps and the shipyards' office lanterns into the frame's scene lights, in the town lanterns' colour
   *  - beside the quays', never the player's extras: the pool's own records, refilled in place (PERF-LIGHTS' law, AUDIT
   *  SHIPYARDS L4-2). @param {any[]} out */
  function portLightsInto(out) { if (shared.portHost) for (const l of shared.portHost.lights()) { l.color = CITY_LIGHT_COLOR_F32; out.push(l); } }
  /** The port's people offered their Morrowind bodies (`eye` the frame's, `dt` its step). */
  function portBodies(eye, dt) { if (shared.portHost && _mode() === 'exterior') shared.portHost.offerBodies(offerStreetPerson, eye, townTalk.overlayActive ? 0 : dt); }
  /** The port's people on the flats' axis. @param {any[]} out */
  function portBatchesInto(out) { if (shared.portHost && _mode() === 'exterior') for (const b of shared.portHost.batches()) out.push(b); }
  /** The lamps' glow and their turning beams, added light in the sea fight's particle pass (its lamps' own law). */
  function portGlows() {
    if (!shared.portHost || _mode() !== 'exterior') return;
    const glows = shared.portHost.glows(cam.pos);
    if (glows.length) navalRender.draw({ particles: glows });
  }
  /** BUNNYFALL: the Great Cannon's shot - its flash and its smoke - in the same pass (scenes/cannonHost.js particles). */
  function cannonSmoke() {
    if (_mode() !== 'exterior') return;
    const p = cromwark?.particles?.();
    if (p?.length) navalRender.draw({ particles: p });
  }
  // WARDEN1 (2026-10-10, Mac: "...I want a gaurd to navigate, lift the wagon/horse on top of their sprite and yeet it far
  // away"): THE TOWN WATCH (scenes/wagon/wagonWardenHost.js) - my parked wagon stamped off the town built under it, its park
  // word's fields, the cell's two words, the offline clock; its throws played (scenes/wagon/wagonWardenShow.js) by a guard of
  // the city guards' picture, the wagon drawn as the yards draw theirs, its horses on the flats' axis
  const _wardenT = [0, 0, 0];
  /** WARDEN1: the scene's x, z in a built town a watch keeps (wagonWardenHost.js wardenTownIn, over the built pixels). */
  const wardenTownAt = (x, z) => wardenTownIn(built.values(), (px, py) => state.pixelTranslation(px, py, _wardenT), TERRAIN_SIZE, x, z);
  return {
    _portSites, _portT, _wardenT, _yardSites, _yardT, cannonSmoke, climbLighthouse, mendAtYard, openYardBench,
    poiDmCursor, portBatchesInto, portBodies, portGlows, portLightsInto, wardenTownAt,
  };
}
