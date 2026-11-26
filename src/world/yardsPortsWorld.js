// Yards and ports for the world: the joinery bench and wagon yard mend, the lighthouse stair, and the port
// lights, people, glows, and cannon smoke for the frame. It also holds the town a warden watches, and the
// POI editor cursor and door. Mounting the POI editor stays in the world.

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

  const _yardT = [0, 0, 0], _yardSites = [];

  function openYardBench() {
    if (!forgeOffered()) { townTalk.say(stationColdLine('workbench')); return true; }
    hudCtx.togglePause({ at: stationDoorAt('workbench') });
    return true;
  }
  function mendAtYard() {
    if (!wagonUpkeepRules()) { setMidScreenText('The wright has no work for you.'); return true; }
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
  const _portT = [0, 0, 0], _portSites = [];

  function climbLighthouse(way, at) {
    const walking = walkMode && shared.playerSpawned && _mode() === 'exterior' && !!at?.feet;
    const no = stairRefusal(way, { walking, onFoot: walking && isOnFoot(player.transportMode), sailing: walking && !!csaRuntime?.isSailing?.(), foes: walking && way === 'up' && !!livingTravelEnemies() });
    if (no) return no;
    player.spawn(at.feet[0], stairFeetY(way, at.feet[1], way === 'down' ? surfaceAt(at.feet[0], at.feet[2]) : NaN), at.feet[2]);
    cam.yaw = at.yaw; cam.pitch = 0; lookFilter.settle();
    cam.pos = player.eyeAt();
    return true;
  }

  /** @param {any[]} out */
  function portLightsInto(out) { if (shared.portHost) for (const l of shared.portHost.lights()) { l.color = CITY_LIGHT_COLOR_F32; out.push(l); } }
  function portBodies(eye, dt) { if (shared.portHost && _mode() === 'exterior') shared.portHost.offerBodies(offerStreetPerson, eye, townTalk.overlayActive ? 0 : dt); }
  /** @param {any[]} out */
  function portBatchesInto(out) { if (shared.portHost && _mode() === 'exterior') for (const b of shared.portHost.batches()) out.push(b); }
  function portGlows() {
    if (!shared.portHost || _mode() !== 'exterior') return;
    const glows = shared.portHost.glows(cam.pos);
    if (glows.length) navalRender.draw({ particles: glows });
  }
  function cannonSmoke() {
    if (_mode() !== 'exterior') return;
    const p = cromwark?.particles?.();
    if (p?.length) navalRender.draw({ particles: p });
  }
  const _wardenT = [0, 0, 0];
  const wardenTownAt = (x, z) => wardenTownIn(built.values(), (px, py) => state.pixelTranslation(px, py, _wardenT), TERRAIN_SIZE, x, z);
  return {
    _portSites, _portT, _wardenT, _yardSites, _yardT, cannonSmoke, climbLighthouse, mendAtYard, openYardBench,
    poiDmCursor, portBatchesInto, portBodies, portGlows, portLightsInto, wardenTownAt,
  };
}
