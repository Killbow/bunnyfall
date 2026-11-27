// @ts-check
import { t } from '../../ui/textManager.js';
import { BUILDING_TYPES } from '../../world/buildingNames.js';
import { isDayFromMinutes } from '../../world/gameDate.js';
import { skyMinutes } from '../../world/worldTick.js';
import { HOME_VERB } from '../../homes/onlineHomes.js';
import { awakenedVampirism } from './vitae.js';
import { clanName } from './clanLaw.js';
import { vampirismInfection, bloodlineChoiceOn } from './bloodlineLeaf.js';
import { clanRepickLeft } from '../../afflictions/vampirism.js';

/** @param {any} entity */
const courtCanSee = (entity) => !!awakenedVampirism(entity) || (bloodlineChoiceOn() && (!!vampirismInfection(entity) || clanRepickLeft(entity)));

export const COURT_VERB = 'vampire-court';

/**
 * @param {{ entity: any, seats: () => Map<number, { clan: number, name: string }>, open: (court: { clan: number, name: string }) => void }} deps
 */
export function createCourtDoor({ entity, seats, open }) {
  const courtAt = (/** @type {any} */ bd) => {
    if (!bd || bd.buildingType !== BUILDING_TYPES.Tavern || !bd.townMapId) return null;
    if (!courtCanSee(entity) || isDayFromMinutes(skyMinutes())) return null;
    return seats().get(Number(bd.townMapId) >>> 0) ?? null;
  };
  return {
    verb: COURT_VERB,
    sig: () => `${courtCanSee(entity) ? 1 : 0}${isDayFromMinutes(skyMinutes()) ? 'd' : 'n'}`,
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
