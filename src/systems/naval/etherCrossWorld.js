// The ether crossing: the veil party, the crossing gate, and the crossing land pixel. etherCross
// takes the boat across and writes the captain's ledger. On a failure it brings the boat back.
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
  // VEIL-PARTY (scenes/naval/veilParty.js): a party member aboard a ship whose captain crosses the Veil follows her by the
  // party's own journey, and her party never holds her crossing back
  const veilParty = createVeilParty({ social: () => shared.social, aboard: () => csaAboard.aboard, here: playerTravelPixel,
    ready: () => walkMode && playerEntity.health > 0 && shared._mode() === 'exterior' && !worldMoveBusy() && !shared._partyArrivalPending,
    travel: (pick, opts, computed) => shared.partyTravelJourney(pick, opts, computed), say: (l) => townTalk.say(l) });
  // ETHER-CROSSING (systems/naval/etherCrossing.js; bible/03-World/Eltheric-Ocean.md): THE CROSSING - asked at a helm in the
  // crossing waters (out) and in the Veil (home), once each time the ship comes into them, and sailed: the helm let go,
  // the jump to the landfall, the ship at whose helm the captain stood brought round where she floats there (her crew and
  // her hold aboard her) and her helm taken again, the voyage's days on the clock.
  const crossGate = createCrossingGate();
  /** A map pixel's distance to the nearest land (systems/naval/etherCrossing.js createCrossLand - the map's one water law,
   *  seaPixel; HOST-SPLIT, SEA VENTURES: out of bootWorld). */
  const crossLandPx = createCrossLand(seaPixel);
  /** THE VOYAGE: the captain and the ship at whose helm they stand carried across (out to Veilhaven's waters; home to the
   *  Bay's the last crossing out set sail from), CROSS_DAYS on the clock. Answers whether she crossed. AUDIT CAPTAIN'S SEA
   *  X9: a voyage that could not be made brings her and her captain back where they set out, at her helm. */
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
      const dir = way === 'out' ? [-1, 0, 0] : [1, 0, 0];   // her bow on Veilhaven's quay, west - or on the Bay, east
      hudFade.smashHUDToBlack();
      csaCall(() => csaRuntime.StopSailing());   // the helm let go: she lies where she is until she is brought across
      try {
        await _teleportToPixel(to.px, to.py, null, {
          arriveMinutes: sharedClockOn() ? skyMinutes() : worldMinutes() + minutes,
          modEvent: 'travel',
          // the landfall's pixel built: the ship brought round onto its middle, where she floats, and the captain on her deck
          resolveArrival: () => {
            const [x, z] = state.localFromWorld((to.px + 0.5) * RAID_NATIVE_PIXEL, (499 - to.py + 0.5) * RAID_NATIVE_PIXEL);
            csaCall(() => csaRuntime.RepositionBoat(boat, [x, tvSeaY(), z], dir, csaTerrainOf(csaPixelAt(x, z))));
            return { pos: [x, tvSeaY() + 1, z], yaw: Math.atan2(dir[0], dir[2]) };
          },
        });
      } catch (error) {
        // AUDIT CAPTAIN'S SEA X9: back where she set out - the departure's pixel built, her hull where she lay, her helm
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
      if (way === 'out') captainLedger.chartIsle(veilhaven().key);   // the landfall's port, on the charts from the first
      else crossGate.asked('out');   // home in the crossing waters: not asked out again until she has left them
      setMidScreenText(crossingWords(way), 7);
      const heavy = cargoModWords(csaRuntime.state.boatCargoMod);   // FB1012d ETHER-STRAND (bible/01-Overview/bugs/Field-Bugs-2026-10-12d.md): the crossing's words cover the helm's - her load said again beneath them, or the boat that came home never says why she will not move
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
