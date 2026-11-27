// Sails the ether crossing. A crossing that fails brings the ship and her captain back where they set out.
import { boatForward } from './boatHeading.js';
import { cargoModWords } from './comeSailAway.js';
import {
  createCrossingGate, createCrossLand, CROSS_DAYS, CROSS_FAILED, crossingTarget, crossingWords,
} from './etherCrossing.js';
import { createVeilParty } from './veilParty.js';
import { hudFade } from '../../ui/fadeLayer.js';
import { playerEntity } from '../../characters/playerEntity.js';
import { NATIVE_PIXEL as RAID_NATIVE_PIXEL } from './seaRaiders.js';
import { setMidScreenText } from '../../ui/midScreenText.js';
import { setSyntheticTimeIncrease } from '../../magic/effectBroker.js';
import { sharedClockOn, skyMinutes, worldMinutes } from '../../world/worldTick.js';
import { veilhaven } from '../../world/ethericSea.js';

/** @param {any} shared */
export function createEtherCrossWorld(shared) {
  const {
    _teleportToPixel, cam, captainLedger, captainSay, csaAboard, csaCall, csaPixelAt, csaRuntime, csaTerrainOf,
    playerTicker, playerTravelPixel, seaPixel, state, townTalk, tvSeaY, walkMode, worldMoveBusy,
  } = shared;
  const veilParty = createVeilParty({ social: () => shared.social, aboard: () => csaAboard.aboard, here: playerTravelPixel,
    ready: () => walkMode && playerEntity.health > 0 && shared._mode() === 'exterior' && !worldMoveBusy() && !shared._partyArrivalPending,
    travel: (pick, opts, computed) => shared.partyTravelJourney(pick, opts, computed), say: (l) => townTalk.say(l) });
  const crossGate = createCrossingGate();
  const crossLandPx = createCrossLand(seaPixel);
  async function etherCross(way) {
    const boat = csaRuntime?.state?.CurrentBoat ?? null;
    if (shared._etherCrossing || !boat || !csaRuntime.isSailing() || worldMoveBusy() || shared._partyArrivalPending) return false;
    shared._etherCrossing = true;
    const here = playerTravelPixel();
    const departure = { pixel: { x: here.x, y: here.y }, native: state.worldCoords(boat.GameObject.position), dir: boatForward(boat, cam.yaw), was: captainLedger.crossedFrom() };
    try {
      const to = crossingTarget(way, captainLedger.crossedFrom());
      if (way === 'out') captainLedger.setCrossedFrom({ px: here.x, py: here.y });
      const minutes = CROSS_DAYS * 1440;
      const dir = way === 'out' ? [-1, 0, 0] : [1, 0, 0];
      hudFade.smashHUDToBlack();
      csaCall(() => csaRuntime.StopSailing());
      try {
        await _teleportToPixel(to.px, to.py, null, {
          arriveMinutes: sharedClockOn() ? skyMinutes() : worldMinutes() + minutes,
          modEvent: 'travel',
          resolveArrival: () => {
            const [x, z] = state.localFromWorld((to.px + 0.5) * RAID_NATIVE_PIXEL, (499 - to.py + 0.5) * RAID_NATIVE_PIXEL);
            csaCall(() => csaRuntime.RepositionBoat(boat, [x, tvSeaY(), z], dir, csaTerrainOf(csaPixelAt(x, z))));
            return { pos: [x, tvSeaY() + 1, z], yaw: Math.atan2(dir[0], dir[2]) };
          },
        });
      } catch (error) {
        console.warn('[ether] the crossing failed:', error?.message ?? error);
        captainLedger.setCrossedFrom(departure.was);
        try {
          await _teleportToPixel(departure.pixel.x, departure.pixel.y, null, {
            resolveArrival: () => {
              const [x, z] = state.localFromWorld(departure.native.x, departure.native.z);
              csaCall(() => csaRuntime.RepositionBoat(boat, [x, tvSeaY(), z], departure.dir, csaTerrainOf(csaPixelAt(x, z))));
              return { pos: [x, tvSeaY() + 1, z], yaw: Math.atan2(departure.dir[0], departure.dir[2]) };
            },
          });
          csaCall(() => csaRuntime.StartSailing(boat));
        } catch (e) { console.warn('[ether] the way back:', e?.message ?? e); }
        townTalk.say(CROSS_FAILED, 5);
        return false;
      }
      setSyntheticTimeIncrease(true); playerTicker.advance(minutes);
      csaCall(() => csaRuntime.StartSailing(boat));
      captainLedger.crossed();
      if (way === 'out') captainLedger.chartIsle(veilhaven().key);
      // Home in the crossing waters, the way out is not offered again until she leaves them.
      else crossGate.asked('out');
      setMidScreenText(crossingWords(way), 7);
      // The crossing's message covers the helm's, so the cargo load warning is shown again beneath it.
      const heavy = cargoModWords(csaRuntime.state.boatCargoMod);
      if (heavy) townTalk.say(heavy, 7);
      captainSay();
      return true;
    } finally {
      shared._etherCrossing = false;
      hudFade.fadeHUDFromBlack();
    }
  }
  return { crossGate, crossLandPx, etherCross, veilParty };
}
