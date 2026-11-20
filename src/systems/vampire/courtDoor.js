// @ts-check
// BUNNYFALL VAMPIRE EXPANSION, PHASE 3: THE COURT'S DOOR. Every tavern of a clan's seat city (clanLaw.js courtSeats - the
// hub city of the clan's first seat region) keeps that clan's Court in its back room, and by night an awakened vampire
// sees it on the door: "The <clan> Court (back room)". The door's host (scenes/worldModes.js, beside the farm door's rows
// and press) asks here; the window is ui/vampire/courtWindow.js.
import { t } from '../textManager.js';
import { BUILDING_TYPES } from '../../world/buildingNames.js';
import { isDayFromMinutes } from '../gameDate.js';
import { skyMinutes } from '../worldTick.js';
import { HOME_VERB } from '../online/onlineHomes.js';
import { awakenedVampirism } from './vitae.js';
import { clanName } from './clanLaw.js';

export const COURT_VERB = 'vampire-court';

/**
 * @param {{ entity: any, seats: () => Map<number, { clan: number, name: string }>, open: (court: { clan: number, name: string }) => void }} deps
 */
export function createCourtDoor({ entity, seats, open }) {
  const courtAt = (/** @type {any} */ bd) => {
    if (!bd || bd.buildingType !== BUILDING_TYPES.Tavern || !bd.townMapId) return null;
    if (!awakenedVampirism(entity) || isDayFromMinutes(skyMinutes())) return null;
    return seats().get(Number(bd.townMapId) >>> 0) ?? null;
  };
  return {
    verb: COURT_VERB,
    /** The door's cached words depend on the night and the awakening. */
    sig: () => `${awakenedVampirism(entity) ? 1 : 0}${isDayFromMinutes(skyMinutes()) ? 'd' : 'n'}`,
    rows(/** @type {any} */ bd, /** @type {any[]|null} */ verbs) {
      const c = courtAt(bd);
      if (!c) return verbs;
      return [...(verbs ?? [{ id: HOME_VERB.enter, label: t('court.door.goIn', 'Go in') }]), { id: COURT_VERB, label: t('court.door.row', 'The {clan} Court (back room)', { clan: clanName(c.clan) }) }];
    },
    press(/** @type {any} */ bd, /** @type {string|null} */ verb) {
      if (verb !== COURT_VERB) return false;
      const c = courtAt(bd);
      if (c) open(c);
      return true;
    },
  };
}
