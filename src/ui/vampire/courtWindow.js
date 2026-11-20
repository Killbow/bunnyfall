// @ts-check
// BUNNYFALL VAMPIRE EXPANSION, PHASE 3: A CLAN COURT'S BACK ROOM - the door of any tavern in a clan's seat city, by night
// (systems/vampire/courtDoor.js).
// THE VISUAL PASS: a window in the vampire's kit (ui/vampire/vampKit.js), in the player's skin and the Court's colour -
//   THE BITTEN (not yet turned): the clan presented - its crest, land, strength and bane, its two Disciplines with their
//     glyphs - and "Ask to be claimed"; below, THE NINE BLOODLINES side by side (this one lit, the promised one marked,
//     each with where its Court sits), so the choice is one the player can see;
//   A VAMPIRE: the Court's standing with them - a BLOOD HUNT banner, the strikes as pips, the tithe owed; the acts (the
//     tithe in gold or in blood, penance, the Court's work, the family's business); the Masquerade as a heat bar a region;
//     their one change of blood, asked twice.
// The acts are the Courts' own (systems/vampire/masquerade.js, bloodlineLeaf.js, vampirism.js).

import { t } from '../../systems/textManager.js';
import { awakenedVampirism } from '../../systems/vampire/vitae.js';
import { clanName, clanIdentityWords, CLAN_RIVAL, CLAN_TERRITORY, CLANS } from '../../systems/vampire/clanLaw.js';
import { courtState, payTithe, askPenance, askCourtWork, heatList, tierName, regionName, titheInVitae, HUNT_STRIKES, TIER_FLOOR } from '../../systems/vampire/masquerade.js';
import { startClanQuest } from '../../systems/racialQuests.js';
import { vampirismInfection, claimBloodline } from '../../systems/vampire/bloodlineLeaf.js';
import { clanRepickLeft, changeVampireClan } from '../../systems/vampirism.js';
import { liveVampirism } from '../../systems/racialLive.js';
import { DISCIPLINES } from '../../systems/vampire/disciplineLaw.js';
import { openVampWindow, el, art, clanCrest, disciplineGlyph, chip, meter, button, pips, section, CLAN_COLOUR } from './vampKit.js';

const TIER_COLOUR = Object.freeze(['#4e7f72', '#c9a23e', '#d0662e', '#d10f2f']);

/**
 * @param {{ entity: any, clan: number, seat: string, now: () => number, seats?: () => Map<number, { clan: number, name: string }>,
 *   onClose?: () => void }} o
 */
export function openCourtWindow({ entity, clan, seat, now, seats = () => new Map(), onClose }) {
  const colour = CLAN_COLOUR[clan] ?? '#b02a35';
  let asking = false;   // the one change of blood, asked twice
  const seatOf = (c) => [...seats().values()].find((s) => s.clan === c)?.name ?? '';

  /** The clan presented: its crest, land, strength and bane, Disciplines. */
  function presentation(c, big = true) {
    const hero = el('div', 'vk-hero');
    hero.append(art(clanCrest(c, big ? 88 : 56)));
    const info = el('div');
    info.append(el('p', 'vk-big', t('court.clanTitle', 'The {clan}', { clan: clanName(c) })));
    const land = (CLAN_TERRITORY[c] ?? []).slice(0, 5).map(regionName).join(', ');
    info.append(el('p', null, t('court.offer.land', 'Their land: {land}.', { land })));
    const [strength, bane] = clanIdentityWords(c);
    const chips = el('div', 'vk-chips');
    const s1 = chip(strength ?? '', null, '#4e9f72'); s1.style.color = '#b5e6c8';
    const s2 = chip(bane ?? '', null, '#b23a3a'); s2.style.color = '#f2b3a8';
    chips.append(s1, s2);
    info.append(chips);
    const disc = el('div', 'vk-chips');
    disc.style.marginTop = '6px';
    for (const d of DISCIPLINES.filter((x) => x.clan === c)) disc.append(chip(d.name(), disciplineGlyph(d.id, CLAN_COLOUR[c], 16), CLAN_COLOUR[c]));
    info.append(disc);
    hero.append(info);
    return hero;
  }

  return openVampWindow({
    id: 'vamp-court',
    title: () => t('court.head', 'The {clan} Court', { clan: clanName(clan) }),
    sub: () => t('court.headSub', 'The back room, {seat} - by night', { seat }),
    crest: () => clanCrest(clan, 52),
    accent: () => colour,
    onClose,
    render(body, api) {
      const did = (lines, ok = true) => { api.note(lines.filter(Boolean).join(' '), ok); api.rerender(); };
      const fever = vampirismInfection(entity);
      const curse = liveVampirism(entity);
      // ── THE BITTEN: to be claimed ──
      if (fever && !curse) {
        body.append(presentation(clan));
        const promised = fever.chosenClan;
        body.append(el('div', 'vk-banner', promised === clan
          ? t('court.fever.ours', 'The {clan} have claimed you. When the fever ends you will wake as one of them.', { clan: clanName(clan) })
          : promised ? t('court.fever.promised', 'You have promised your blood to the {other}.', { other: clanName(promised) })
            : t('court.fever.none', 'No bloodline has claimed you yet. Until one does, the turning cannot end.')));
        const acts = el('div', 'vk-acts');
        acts.append(button(promised === clan ? t('court.claimedShort', 'Claimed') : t('court.claim', 'Ask the {clan} to claim you', { clan: clanName(clan) }),
          () => did([claimBloodline(entity, clan) ? t('court.claimed', 'An Elder of the {clan} takes your wrist and drinks a single drop. "You are ours now. Sleep, and wake as one of us."', { clan: clanName(clan) }) : '']),
          { kind: 'primary', why: promised === clan ? t('court.claimedWhy', 'They have claimed you already.') : null }));
        body.append(acts);
        body.append(section(t('court.nine', 'The nine bloodlines')));
        const grid = el('div', 'vk-grid');
        for (const c of CLANS) {
          const card = el('div', `vk-card${c === clan ? ' lit' : ''}`);
          card.style.setProperty('--accent', CLAN_COLOUR[c]);
          card.append(art(clanCrest(c, 44)));
          const text = el('div');
          const head = el('div', 'vk-row');
          head.append(el('h4', null, clanName(c)));
          if (promised === c) head.append(chip(t('court.promisedChip', 'Promised'), null, CLAN_COLOUR[c]));
          text.append(head);
          const [s, b] = clanIdentityWords(c);
          text.append(el('p', null, s ?? ''), el('p', null, b ?? ''));
          const where = seatOf(c);
          text.append(el('p', null, c === clan ? t('court.here', 'Their Court is here.') : where ? t('court.seatAt', 'Their Court: {seat}.', { seat: where }) : t('court.seatNone', 'Their Court has no seat you can reach.')));
          card.append(text);
          grid.append(card);
        }
        body.append(grid);
        return;
      }
      // ── A VAMPIRE ──
      const own = curse?.clan === clan;
      const awake = !!awakenedVampirism(entity);
      const repick = !!curse && !own && clanRepickLeft(entity);
      const c = courtState(clan);
      if (c.hunt) body.append(el('div', 'vk-banner', t('court.huntBanner', 'BLOOD HUNT - this Court has marked you')));
      if (!own) body.append(presentation(clan, false));
      if (own) {
        const hero = el('div', 'vk-hero');
        hero.append(art(clanCrest(clan, 72)));
        const info = el('div');
        info.append(el('p', 'vk-big', t('court.yours', 'Your own Court')));
        for (const line of clanIdentityWords(clan)) info.append(el('p', null, line));
        info.append(el('p', null, t('court.rival', 'Your sworn rivals: the {rival}.', { rival: clanName(CLAN_RIVAL[clan]) })));
        hero.append(info);
        body.append(hero);
      }
      if (awake) {
        body.append(section(t('court.standing', 'Your standing')));
        const st = el('div', 'vk-row');
        st.append(el('span', null, t('court.strikesShort', 'Strikes')), pips(Math.min(c.strikes, HUNT_STRIKES), HUNT_STRIKES));
        if (c.strikes > HUNT_STRIKES) st.append(chip(`+${c.strikes - HUNT_STRIKES}`, null, colour));
        if (c.owed > 0) st.append(chip(t('court.owedChip', 'Tithe owed: {gold} gold', { gold: c.owed }), null, '#c9a23e'));
        body.append(st);
        const acts = el('div', 'vk-acts');
        if (c.owed > 0) {
          acts.append(button(t('court.payGoldShort', 'Pay in gold'), () => did(payTithe(entity, clan, 'gold', now())), { cost: `${c.owed}g` }));
          acts.append(button(t('court.payVitaeShort', 'Pay in blood'), () => did(payTithe(entity, clan, 'vitae', now())), { cost: `${titheInVitae(c.owed)} Vitae` }));
        }
        if (c.hunt) acts.append(button(t('court.penance', 'Ask for penance'), () => did(askPenance(clan)), { kind: 'primary' }));
        if (own && !c.hunt) {
          acts.append(button(t('court.workShort', 'Hunt a rogue of a rival blood'), () => did(askCourtWork(entity, clan)), { kind: 'primary' }));
          acts.append(button(t('court.family', 'Ask for the family\'s business'), () => did([startClanQuest(entity) ? t('court.family.given', 'An Elder nods. A letter will find you.') : t('court.family.none', 'There is no family business for you tonight.')])));
        }
        if (acts.childElementCount) body.append(acts);
        // THE MASQUERADE
        const heat = heatList(now());
        body.append(section(t('court.masqHead', 'The Masquerade')));
        if (!heat.length) body.append(el('p', null, t('court.masqQuiet', 'No region speaks of you. The Court approves.')));
        for (const h of heat.slice(0, 6)) {
          const r = el('div', 'vk-heat');
          r.append(el('span', null, regionName(h.region)), meter(h.heat, 100, TIER_COLOUR[h.tier], ''), el('span', null, tierName(h.tier)));
          body.append(r);
        }
        if (heat.length) body.append(el('p', null, t('court.masqHint', 'Witch hunters walk at night where the bar passes {n}.', { n: TIER_FLOOR[1] })));
      }
      if (repick) {
        body.append(section(t('court.swearHead', 'Your one change of blood')));
        const acts = el('div', 'vk-acts');
        if (asking) {
          acts.append(el('span', null, t('court.swear.ask', 'Swear yourself to the {clan}? You may change your blood only once. The {old} will not take you back.', { clan: clanName(clan), old: clanName(curse.clan) })));
          acts.append(button(t('court.swearYes', 'Swear it'), () => { asking = false; did([changeVampireClan(entity, clan) ? t('court.swore', 'You kneel, and drink from the Elder\'s wrist. You are of the {clan} now: their spells and Disciplines are yours.', { clan: clanName(clan) }) : '']); }, { kind: 'primary' }));
          acts.append(button(t('haven.no', 'Keep'), () => { asking = false; api.rerender(); }));
        } else {
          acts.append(button(t('court.swear', 'Swear yourself to the {clan} (your one change of blood)', { clan: clanName(clan) }), () => { asking = true; api.rerender(); }, { kind: 'warn' }));
        }
        body.append(acts);
      }
    },
  });
}
