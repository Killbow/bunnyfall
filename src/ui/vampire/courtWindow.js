// @ts-check
// BUNNYFALL VAMPIRE EXPANSION, PHASE 3: A CLAN COURT'S BACK ROOM - the door of any tavern in a clan's seat city, by night
// (systems/vampire/courtDoor.js). The quest box's own chain (ServiceFlowWindow), as the Haven's:
//   who sits here, what the player owes it (strikes, tithe, a Blood Hunt), the clan's strength and bane, the Masquerade
//   in every region that has heard of the player; then the acts - pay the tithe in gold or in Vitae, ask for penance
//   (a Court that hunts the player), ask for the Court's work or the family's business (one's own Court, not hunted).
// The acts are the Courts' own (systems/vampire/masquerade.js).

import { t } from '../../systems/textManager.js';
import { ServiceFlowWindow } from '../guildServiceWindows.js';
import { awakenedVampirism } from '../../systems/vampire/vitae.js';
import { clanName, clanIdentityWords, CLAN_RIVAL } from '../../systems/vampire/clanLaw.js';
import { courtState, payTithe, askPenance, askCourtWork, heatList, tierName, regionName, titheInVitae, HUNT_STRIKES } from '../../systems/vampire/masquerade.js';
import { startClanQuest } from '../../systems/racialQuests.js';

/**
 * @param {{ entity: any, clan: number, seat: string, now: () => number, onClose?: () => void }} o
 */
export function openCourtWindow({ entity, clan, seat, now, onClose }) {
  const said = (lines, next) => (lines.length && lines.some(Boolean) ? [{ rows: lines.filter(Boolean), onClick: () => next() }] : next());
  const pick = (items) => ({ picker: items.map((i) => i.label), onPick: (i) => items[i]?.go() ?? [], onCancel: () => [] });

  const main = () => {
    const own = awakenedVampirism(entity)?.clan === clan;
    const c = courtState(clan);
    const rows = [
      own ? t('court.title.own', 'The {clan} Court, your own, meets in the back room in {seat}.', { clan: clanName(clan), seat })
        : t('court.title.rival', 'The {clan} Court meets in the back room in {seat}. They watch you, a stranger of another blood.', { clan: clanName(clan), seat }),
      c.hunt ? t('court.hunt', 'This Court holds a Blood Hunt on you.')
        : t('court.strikes', 'Strikes against you: {n} of {max}.', { n: c.strikes, max: HUNT_STRIKES }),
    ];
    if (c.owed > 0) rows.push(t('court.owed', 'You owe a blood-tithe of {gold} gold.', { gold: c.owed }));
    if (own) rows.push(...clanIdentityWords(clan), t('court.rival', 'Your sworn rivals: the {rival}.', { rival: clanName(CLAN_RIVAL[clan]) }));
    const heat = heatList(now());
    if (heat.length) rows.push(t('court.masq', 'The Masquerade: {list}.', { list: heat.slice(0, 4).map((h) => `${regionName(h.region)} ${tierName(h.tier)}`).join(', ') }));
    /** @type {Array<{ label: string, go: () => any[] }>} */
    const items = [];
    if (c.owed > 0) {
      items.push({ label: t('court.payGold', 'Pay the tithe ({gold} gold)', { gold: c.owed }), go: () => said(payTithe(entity, clan, 'gold', now()), main) });
      items.push({ label: t('court.payVitae', 'Pay the tithe in blood ({n} Vitae)', { n: titheInVitae(c.owed) }), go: () => said(payTithe(entity, clan, 'vitae', now()), main) });
    }
    if (c.hunt) items.push({ label: t('court.penance', 'Ask for penance'), go: () => said(askPenance(clan), main) });
    if (own && !c.hunt) {
      items.push({ label: t('court.work', 'Ask for the Court\'s work (a rogue of a rival blood)'), go: () => said(askCourtWork(entity, clan), main) });
      items.push({ label: t('court.family', 'Ask for the family\'s business'), go: () => said([startClanQuest(entity) ? t('court.family.given', 'An Elder nods. A letter will find you.') : t('court.family.none', 'There is no family business for you tonight.')], main) });
    }
    items.push({ label: t('court.leave', 'Leave the back room'), go: () => [] });
    return [{ rows, onClick: () => [pick(items)] }];
  };
  return new ServiceFlowWindow(main(), { onClose });
}
