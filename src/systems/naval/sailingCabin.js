import { SHIP_TYPES } from '../../trade/banking.js';
import { WA_SHIP_BLOCKS } from './warmAshesShips.js';
import { t } from '../../ui/textManager.js';

export const cabinShipType = (hull) => hull === 2 ? SHIP_TYPES.Small : hull === 3 || hull === 4 ? SHIP_TYPES.Large : SHIP_TYPES.None;
export const cabinBlockName = (hull) => WA_SHIP_BLOCKS[cabinShipType(hull)] ?? null;
export { boatUid as cabinUid, readSailingCabin } from '../../net/boatIdentity.js';
import { boatUid as cabinUid, readSailingCabin } from '../../net/boatIdentity.js';
export const cabinSceneName = (uid) => cabinUid(uid) ? `SailingCabin [UID=${uid}]` : null;
export const hasSailingCabin = (boat) => !!boat && !boat.charter && cabinUid(boat.uid) && cabinBlockName(boat.hull) !== null && !boat.inside;

export const CABIN_REFUSAL = Object.freeze({
  helm: 'Leave the helm before entering the cabin.',
  aboard: 'Board your ship before entering the cabin.',
  unavailable: 'This ship\'s cabin is unavailable.',
  get enemies() { return t('cabin.refusal.enemies', 'You cannot enter the cabin with enemies nearby.'); },
});

export function cabinEntryRefusal(boat, { boats = [], sailing = false, disembarking = false, aboard = false, hostile = false } = {}) {
  if (!boats.includes(boat) || !hasSailingCabin(boat) || !boat.GameObject?.activeSelf) return CABIN_REFUSAL.unavailable;
  if (sailing || disembarking) return CABIN_REFUSAL.helm;
  if (!aboard) return CABIN_REFUSAL.aboard;
  // Entering an interior empties the sea, so the cabin refuses entry while a hostile ship is near.
  if (hostile) return CABIN_REFUSAL.enemies;
  return null;
}

// A restored cabin must match a boat in this save, not one from an earlier character.
export function savedCabinBoat(cabin, record) {
  const c = readSailingCabin(cabin);
  return c ? (record?.placedBoats ?? []).find((b) => b.UID === c.uid && b.Hull === c.hull && !b.inside) ?? null : null;
}
