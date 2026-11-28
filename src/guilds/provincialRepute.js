import { FACTION_TYPES } from '../formats/factionFile.js';
import { getLocalizedFactionName, t } from '../ui/textManager.js';
import { changeReputation } from './factionRep.js';

export const PROVINCIAL_QUEST_REP = 3;
export const PROVINCIAL_BOUNTY_REP = 2;

export function rewardProvincialReputation(entity, region, amount, say) {
  const store = entity?.factionRep;
  if (!store || !Number.isInteger(region) || region < 0) return;

  for (const faction of store.dict.values()) {
    if (faction.type !== FACTION_TYPES.Province || faction.region !== region) continue;
    const before = faction.rep;
    changeReputation(store, faction.id, amount);
    const gained = faction.rep - before;
    if (gained > 0) say?.(t('standing.province.gain', 'Reputation with {province} increased by {points}.', {
      province: getLocalizedFactionName(faction.id, faction.name),
      points: gained,
    }));
    return;
  }
}
