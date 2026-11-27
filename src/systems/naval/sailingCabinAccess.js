import { cabinBlockName, readSailingCabin, cabinEntryRefusal, hasSailingCabin, CABIN_REFUSAL } from './sailingCabin.js';
import { deckPose, localOf, worldOf } from './comeSailAwayAboard.js';
import { BUILDING_TYPES } from '../../world/buildingNames.js';
import { trs } from '../../world/mat4.js';
import { fleetShip } from './fleet.js';
import { cabinRestyle } from './cabinLook.js';

export function sailingCabinEntry(blocks, saved, fromNative, guest = false) {
  const cabin = readSailingCabin(saved);
  if (!cabin || typeof fromNative !== 'function') return null;
  const dfBlock = blocks.getBlockByName(cabinBlockName(cabin.hull));
  if (!dfBlock?.rmbBlock?.subRecords?.[0]?.interior) return null;
  const origin = fromNative(cabin.origin);
  if (!Array.isArray(origin) || origin.length !== 3 || !origin.every(Number.isFinite)) return null;
  const door = { matrix: trs(...origin, 0, 0, 0), blockIndex: dfBlock.index, recordIndex: 0, doorIndex: 0,
    centre: { x: 0, y: 0, z: 0 } };
  const hit = { dfBlock, recordIndex: 0, door, climateBase: 2, season: 0, sailingCabin: cabin, restyle: cabinRestyle(guest ? 0 : fleetShip(cabin.uid)?.cabin ?? 0) };
  const building = { buildingType: BUILDING_TYPES.Ship, buildingKey: -cabin.uid, regionIndex: -1,
    name: 'Ship cabin', factionId: 0, quality: 0, insideOpenShop: false };
  return { hit, entries: [hit], building, cabin };
}

export function createSailingCabinAccess(deps) {
  let entering = false;
  const boatFor = (c) => deps.boats().find((b) => b.uid === c.uid && b.hull === c.hull && hasSailingCabin(b) && deps.nearby(b));
  const reason = (boat) => !deps.available() ? CABIN_REFUSAL.unavailable : cabinEntryRefusal(boat, {
    boats: deps.boats(), sailing: !!deps.csa?.()?.isSailing?.(), disembarking: !!deps.csa?.()?.state?.disembarking,
    aboard: deps.aboard(boat), hostile: !!deps.hostile?.(),
  });
  return {
    reason,
    fromNative: deps.fromNative,
    canRestore(saved, savedBoat = undefined) {
      const c = readSailingCabin(saved);
      return deps.available() && !!c && (savedBoat === undefined ? !!boatFor(c)
        : !!savedBoat && savedBoat.UID === c.uid && savedBoat.Hull === c.hull && !savedBoat.inside);
    },
    async enter(boat) {
      if (entering || deps.mode() !== 'exterior' || deps.busy()) return false;
      const no = reason(boat);
      if (no) { deps.say(no); return false; }
      const cabin = readSailingCabin({ v: 1, uid: boat.uid, hull: boat.hull,
        origin: deps.toNative(boat.GameObject.position), deck: localOf(deckPose(boat), deps.feet()), yaw: deps.yaw() });
      if (!cabin) return false;
      entering = true;
      try {
        const entered = !!(await deps.enterInterior(cabin));
        if (!entered) deps.say(CABIN_REFUSAL.unavailable);
        return entered;
      }
      catch (e) { deps.log?.(e); deps.say(CABIN_REFUSAL.unavailable); return false; }
      finally { entering = false; }
    },
    returnToDeck(saved, owner = null) {
      const c = readSailingCabin(saved);
      const boat = c && (owner ? deps.peerBoat?.(owner, c.uid) : boatFor(c));
      if (boat && owner && !deps.boardPeer?.(boat)) return null;
      return boat ? { position: worldOf(deckPose(boat), c.deck), yaw: c.yaw } : null;
    },
  };
}
