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
import { vampirismInfection, claimBloodline } from '../../systems/vampire/bloodlineLeaf.js';   // the bloodline chosen before the turn
import { clanRepickLeft, changeVampireClan } from '../../systems/vampirism.js';
import { liveVampirism } from '../../systems/racialLive.js';
import { DISCIPLINES } from '../../systems/vampire/disciplineLaw.js';
import { CLAN_TERRITORY } from '../../systems/vampire/clanLaw.js';
import { regionName as regionWord } from '../../systems/vampire/masquerade.js';

/** What a clan offers, for one choosing it: its land, its strength and bane, its two Disciplines. @param {number} clan */
function offerRows(clan) {
  const own = DISCIPLINES.filter((d) => d.clan === clan).map((d) => d.name()).join(t('court.and', ' and '));
  const land = (CLAN_TERRITORY[clan] ?? []).slice(0, 4).map(regionWord).join(', ');
  return [t('court.offer.land', 'Their land: {land}.', { land }), ...clanIdentityWords(clan), t('court.offer.disciplines', 'Their Disciplines: {list}.', { list: own })];
}

/**
 * @param {{ entity: any, clan: number, seat: string, now: () => number, onClose?: () => void }} o
 */
export function openCourtWindow({ entity, clan, seat, now, onClose }) {
  const said = (lines, next) => (lines.length && lines.some(Boolean) ? [{ rows: lines.filter(Boolean), onClick: () => next() }] : next());
  const pick = (items) => ({ picker: items.map((i) => i.label), onPick: (i) => items[i]?.go() ?? [], onCancel: () => [] });

  const main = () => {
    // THE BITTEN: not yet turned, they ask to be claimed (the turn waits for it - bloodlineLeaf.js)
    const fever = vampirismInfection(entity);
    if (fever && !liveVampirism(entity)) {
      const promised = fever.chosenClan;
      const rows = [
        t('court.fever', 'The {clan} Court meets in the back room in {seat}. Pale faces turn to you: they smell the fever in your blood.', { clan: clanName(clan), seat }),
        ...offerRows(clan),
        promised === clan ? t('court.fever.ours', 'The {clan} have claimed you. When the fever ends you will wake as one of them.', { clan: clanName(clan) })
          : promised ? t('court.fever.promised', 'You have promised your blood to the {other}.', { other: clanName(promised) })
            : t('court.fever.none', 'No bloodline has claimed you yet. Until one does, the turning cannot end.'),
      ];
      const items = [];
      if (promised !== clan) items.push({ label: t('court.claim', 'Ask the {clan} to claim you', { clan: clanName(clan) }), go: () => said([claimBloodline(entity, clan) ? t('court.claimed', 'An Elder of the {clan} takes your wrist and drinks a single drop. "You are ours now. Sleep, and wake as one of us."', { clan: clanName(clan) }) : ''], main) });
      items.push({ label: t('court.leave', 'Leave the back room'), go: () => [] });
      return [{ rows, onClick: () => [pick(items)] }];
    }
    // A VAMPIRE'S ONE CHANGE OF BLOOD, sworn at another Court
    const curse = liveVampirism(entity);
    const repick = curse && curse.clan !== clan && clanRepickLeft(entity);
    const swear = () => ({
      rows: [t('court.swear.ask', 'Swear yourself to the {clan}? You may change your blood only once. The {old} will not take you back.', { clan: clanName(clan), old: clanName(curse.clan) })],
      buttons: 'YesNo',
      onYes: () => said([changeVampireClan(entity, clan) ? t('court.swore', 'You kneel, and drink from the Elder\'s wrist. You are of the {clan} now: their spells and Disciplines are yours.', { clan: clanName(clan) }) : ''], main),
      onNo: () => main(),
    });
    if (curse && !awakenedVampirism(entity)) {
      return [{ rows: [t('court.title.rival', 'The {clan} Court meets in the back room in {seat}. They watch you, a stranger of another blood.', { clan: clanName(clan), seat }), ...offerRows(clan)],
        onClick: () => [pick([...(repick ? [{ label: t('court.swear', 'Swear yourself to the {clan} (your one change of blood)', { clan: clanName(clan) }), go: () => [swear()] }] : []), { label: t('court.leave', 'Leave the back room'), go: () => [] }])] }];
    }
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
    if (repick) { rows.push(...offerRows(clan)); items.push({ label: t('court.swear', 'Swear yourself to the {clan} (your one change of blood)', { clan: clanName(clan) }), go: () => [swear()] }); }
    if (own && !c.hunt) {
      items.push({ label: t('court.work', 'Ask for the Court\'s work (a rogue of a rival blood)'), go: () => said(askCourtWork(entity, clan), main) });
      items.push({ label: t('court.family', 'Ask for the family\'s business'), go: () => said([startClanQuest(entity) ? t('court.family.given', 'An Elder nods. A letter will find you.') : t('court.family.none', 'There is no family business for you tonight.')], main) });
    }
    items.push({ label: t('court.leave', 'Leave the back room'), go: () => [] });
    return [{ rows, onClick: () => [pick(items)] }];
  };
  return new ServiceFlowWindow(main(), { onClose });
}
