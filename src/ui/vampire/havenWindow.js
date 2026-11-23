// @ts-check
// BUNNYFALL VAMPIRE EXPANSION, PHASE 2: THE HAVEN - the vampire's thralls, managed at the door of any home they own (the
// door's own rows, scenes/worldModes.js homeDoorVerbs: "Your Haven").
// THE VISUAL PASS: a window in the vampire's kit (ui/vampire/vampKit.js), in the player's skin - the clan's crest over
// it; the Vitae, the Blood Slots as pips, the provisions and the vials in the pack; then a CARD a thrall:
//   A PRISONER   its blood's glyph and quality, HEALTH and MISERY meters; drink, bottle, tend, bind, let go (asked twice)
//   A SERVANT    its rank as pips, LOYALTY; its duty (Follow / Guard / Wait, the one it keeps lit); an errand by day (an
//                errand under way its progress), its KIT opened under the card (worn pieces to take back, the pack's to give)
//   A SOCIAL     its post, its town, its perk, LOYALTY; release (asked twice)
// Every act is the thralls' own (systems/vampire/thralls.js); what it says goes on the window's line.

import { t } from '../textManager.js';
import { itemLongName } from '../../items/itemInfo.js';
import { requestFittedIcon, fittedImg } from '../textureCanvas.js';
import { awakenedVampirism, vitaeNow } from '../../systems/vampire/vitae.js';
import { archetypeName, beastStageOf, beastStageName, VITAE_MAX } from '../../systems/vampire/bloodLaw.js';
import { clanName } from '../../systems/vampire/clanLaw.js';
import {
  prisoners, servants, socials, provisions, slotsUsed, slotsOf, tapPrisoner, bottlePrisoner, tendPrisoner, makeServant,
  releasePrisoner, setDuty, sendErrand, errandRefusal, releaseServant, giftable, giveGear, takeGear, servantKit,
  socialPerk, buyFromMerchant, releaseSocial, isVial,
} from '../../systems/vampire/thralls.js';
import { thrallRank, DUTIES, ERRANDS, ERRAND_KEYS, BIND_COST, TEND_GOLD, MERCHANT } from '../../systems/vampire/thrallLaw.js';
import { gearLabel } from '../../revenants/revenantGear.js';
import { worldMinutes } from '../../world/worldTick.js';
import { openVampWindow, el, art, clanCrest, bloodGlyph, disciplineGlyph, meter, button, chip, pips, section, CLAN_COLOUR, BLOOD_COLOUR, STAGE_COLOUR } from './vampKit.js';

export const HAVEN_VERB = 'home-vampire-haven';
export const isHavenVerb = (/** @type {unknown} */ v) => v === HAVEN_VERB;
/** The door's row at a home of the player's own, for an awakened vampire. @param {any} entity */
export function havenDoorRows(entity) {
  return awakenedVampirism(entity) ? [{ id: HAVEN_VERB, label: t('haven.row', 'Your Haven (thralls)') }] : [];
}

const dutyWord = (d) => (d === DUTIES.Follow ? t('haven.duty.follow', 'following you') : d === DUTIES.Guard ? t('haven.duty.guard', 'guarding the Haven')
  : d === DUTIES.Errand ? t('haven.duty.errand', 'on an errand') : t('haven.duty.idle', 'waiting'));
const roleWord = (r) => (r === 'innkeeper' ? t('thrall.role.innkeeper', 'innkeeper') : r === 'guard' ? t('thrall.role.guard', 'watchman') : t('thrall.role.merchant', 'merchant'));
const roleGlyph = (r) => (r === 'innkeeper' ? 'lure' : r === 'guard' ? 'bastion' : 'courtCommand');
const perkWord = (r) => (r === 'innkeeper' ? t('haven.perk.innkeeper', 'No one in their town sees you feed on a sleeper.')
  : r === 'guard' ? t('haven.perk.guard', 'Once a day in their town, they hush a bite someone saw.')
    : t('haven.perk.merchant', 'Sends provisions and vials of Vitae by courier, wherever you are.'));
const errandWord = (k) => (k === 'forage' ? t('haven.errand.forageShort', 'Forage') : k === 'market' ? t('haven.errand.marketShort', 'Market') : t('haven.errand.scoutShort', 'Scout'));
const errandTip = (k) => (k === 'forage' ? t('haven.errand.forage', 'Forage: food for your prisoners') : k === 'market' ? t('haven.errand.market', 'Market: sell and bring back gold') : t('haven.errand.scout', 'Scout: mark fine blood for your next feed'));
const errandGlyph = (k) => (k === 'forage' ? 'mendingBlood' : k === 'market' ? 'courtCommand' : 'huntersSense');
const HEALTH = '#4e9f72', MISERY = '#c9822e', LOYALTY = '#c08a3e';

/**
 * The Haven's window. `now()` the character's own clock.
 * @param {{ entity: any, now: () => number, onClose?: () => void }} o
 */
export function openHavenWindow({ entity, now, onClose }) {
  let confirm = null;   // the card whose letting-go is being asked
  let kitOpen = null;   // the servant whose kit is open
  const clan = () => awakenedVampirism(entity)?.clan ?? null;
  return openVampWindow({
    id: 'vamp-haven',
    title: () => t('haven.title', 'Your Haven'),
    sub: () => t('haven.sub', 'A {clan} lair - Blood Slots {used} of {max}', { clan: clanName(clan() ?? 153), used: slotsUsed(), max: slotsOf(entity) }),
    crest: () => clanCrest(clan() ?? 153, 52),
    accent: () => CLAN_COLOUR[clan() ?? 153] ?? '#b02a35',
    onClose,
    render(body, api) {
      const did = (lines, ok = true) => { api.note(lines.filter(Boolean).join(' '), ok); api.rerender(); };
      // THE STRIP: Vitae, slots, provisions, vials
      const v = Math.round(vitaeNow(entity, now()));
      const stage = beastStageOf(v);
      const strip = el('div', 'vk-hero');
      strip.append(art(clanCrest(clan() ?? 153, 72)));
      const info = el('div');
      info.append(meter(v, VITAE_MAX, STAGE_COLOUR[stage], t('haven.vitae', 'Vitae {v} - {stage}', { v, stage: beastStageName(stage) })));
      const row = el('div', 'vk-row');
      row.append(el('span', null, t('haven.slots', 'Blood Slots')), pips(slotsUsed(), slotsOf(entity)));
      const vials = (entity.items ?? []).filter(isVial).length;
      const vialChip = chip(t('haven.vials', '{n} vials of Vitae', { n: vials }));
      const pic = requestFittedIcon(205, 11, { box: 18, onReady: () => api.rerender() });
      if (pic) vialChip.prepend(fittedImg(pic));
      row.append(chip(t('haven.provisions', '{n} provisions', { n: provisions() })), vialChip);
      info.append(row);
      if (socialPerk('merchant')) {
        const buy = el('div', 'vk-acts');
        buy.append(button(t('haven.buyProvisionShort', 'Order provisions'), () => did(buyFromMerchant(entity, 'provision')), { cost: `${MERCHANT.provision}g` }),
          button(t('haven.buyVialShort', 'Order a vial'), () => did(buyFromMerchant(entity, 'vial')), { cost: `${MERCHANT.vial}g` }));
        info.append(buy);
      }
      strip.append(info);
      body.append(strip);

      const ps = prisoners(), sv = servants(), so = socials();
      if (!ps.length && !sv.length && !so.length) {
        body.append(el('div', 'vk-banner', t('haven.empty', 'No thralls yet. In Steal mode, beat a person down to take them alive, or take a townsperson after the Kiss.')));
        return;
      }
      // THE PRISONERS
      if (ps.length) {
        body.append(section(t('haven.prisoners', 'Prisoners')));
        const grid = el('div', 'vk-grid');
        for (const p of ps) {
          const card = el('div', 'vk-card');
          card.append(art(bloodGlyph(p.type, 44)));
          const text = el('div');
          text.append(el('h4', null, p.name));
          const c = chip(t('haven.bloodChip', '{type} {q}%', { type: archetypeName(p.type), q: p.quality }), null, BLOOD_COLOUR[p.type]);
          text.append(c, meter(p.health, 100, HEALTH, t('haven.health', 'Health {n}', { n: p.health })), meter(p.misery, 100, MISERY, t('haven.misery', 'Misery {n}', { n: p.misery })));
          card.append(text);
          const acts = el('div', 'vk-acts');
          if (confirm === p.id) {
            acts.append(el('span', null, t('haven.releaseAsk', 'Let them go?')), button(t('haven.yes', 'Let go'), () => { confirm = null; did(releasePrisoner(p.id)); }, { kind: 'warn' }), button(t('haven.no', 'Keep'), () => { confirm = null; api.rerender(); }));
          } else {
            acts.append(
              button(t('haven.tapShort', 'Drink'), () => did(tapPrisoner(entity, p.id, now())), { kind: 'primary' }),
              button(t('haven.bottleShort', 'Bottle'), () => did(bottlePrisoner(entity, p.id))),
              button(t('haven.tendShort', 'Tend'), () => did(tendPrisoner(entity, p.id)), { cost: provisions() > 0 ? t('haven.oneProvision', '1 prov.') : `${TEND_GOLD}g` }),
              button(t('haven.bindShort', 'Make servant'), () => did(makeServant(entity, p.id, now())), { cost: `${BIND_COST} Vitae` }),
              button(t('haven.release', 'Let them go'), () => { confirm = p.id; api.rerender(); }, { kind: 'warn' }),
            );
          }
          card.append(acts);
          grid.append(card);
        }
        body.append(grid);
      }
      // THE SERVANTS
      if (sv.length) {
        body.append(section(t('haven.servants', 'Servants')));
        const grid = el('div', 'vk-grid');
        for (const s of sv) {
          const card = el('div', `vk-card${s.duty === DUTIES.Follow ? ' lit' : ''}`);
          card.append(art(bloodGlyph(s.type, 44)));
          const text = el('div');
          const head = el('div', 'vk-row');
          head.append(el('h4', null, s.name), pips(thrallRank(s.quality), 5));
          text.append(head, el('p', null, t('haven.servantLine', '{type} thrall, now {duty}.', { type: archetypeName(s.type), duty: dutyWord(s.duty) })));
          text.append(meter(s.loyalty, 100, LOYALTY, t('haven.loyalty', 'Loyalty {n}', { n: s.loyalty })));
          if (s.errand) {
            const def = ERRANDS[/** @type {keyof typeof ERRANDS} */ (s.errand.kind)];
            const total = (def?.hours ?? 1) * 60, left = Math.max(0, s.errand.until - worldMinutes());
            text.append(meter(total - left, total, '#7f9bb3', t('haven.awayShort', '{what}: back in about {h} h', { what: errandWord(s.errand.kind), h: Math.max(1, Math.ceil(left / 60)) })));
          }
          card.append(text);
          const acts = el('div', 'vk-acts');
          if (confirm === s.id) {
            acts.append(el('span', null, t('haven.releaseServantAsk', 'Release them for good?')), button(t('haven.yesRelease', 'Release'), () => { confirm = null; did(releaseServant(entity, s.id)); }, { kind: 'warn' }), button(t('haven.no', 'Keep'), () => { confirm = null; api.rerender(); }));
          } else if (!s.errand) {
            for (const [duty, label] of [[DUTIES.Follow, t('haven.follow', 'Follow me')], [DUTIES.Guard, t('haven.guardShort', 'Guard')], [DUTIES.Idle, t('haven.wait', 'Wait here')]]) {
              acts.append(button(label, () => did(setDuty(s.id, duty)), { kind: s.duty === duty ? 'primary' : '' }));
            }
            const no = errandRefusal(s);
            for (const k of ERRAND_KEYS) {
              const b = button(errandWord(k), () => did(sendErrand(s.id, k)), { cost: `${ERRANDS[k].hours}h`, why: no });
              if (!no) b.title = errandTip(k);
              b.prepend(art(disciplineGlyph(errandGlyph(k), '#c9b2ac', 14)));
              acts.append(b);
            }
            acts.append(button(kitOpen === s.id ? t('haven.kitClose', 'Close kit') : t('haven.kit', 'Its kit'), () => { kitOpen = kitOpen === s.id ? null : s.id; api.rerender(); }));
            acts.append(button(t('haven.releaseServant', 'Release them'), () => { confirm = s.id; api.rerender(); }, { kind: 'warn' }));
          }
          card.append(acts);
          if (kitOpen === s.id && !s.errand) card.append(kitPanel(s, did));
          grid.append(card);
        }
        body.append(grid);
      }
      // THE SOCIAL THRALLS
      if (so.length) {
        body.append(section(t('haven.socials', 'Enthralled in town')));
        const grid = el('div', 'vk-grid');
        for (const s of so) {
          const card = el('div', 'vk-card');
          card.append(art(disciplineGlyph(roleGlyph(s.role), '#c9b26b', 40)));
          const text = el('div');
          text.append(el('h4', null, s.name), el('p', null, t('haven.socialLine', 'Your {role} in {town}.', { role: roleWord(s.role), town: s.townName || '?' })), el('p', null, perkWord(s.role)));
          text.append(meter(s.loyalty, 100, LOYALTY, t('haven.loyalty', 'Loyalty {n}', { n: s.loyalty })));
          card.append(text);
          const acts = el('div', 'vk-acts');
          if (confirm === s.id) acts.append(el('span', null, t('haven.socialAsk', 'Loosen your hold?')), button(t('haven.yesLoosen', 'Loosen it'), () => { confirm = null; did(releaseSocial(s.id)); }, { kind: 'warn' }), button(t('haven.no', 'Keep'), () => { confirm = null; api.rerender(); }));
          else acts.append(button(t('haven.releaseSocial', 'Loosen your hold on them'), () => { confirm = s.id; api.rerender(); }, { kind: 'warn' }));
          card.append(acts);
          grid.append(card);
        }
        body.append(grid);
      }

      /** A servant's kit, opened under its card: what it wears, and what of the pack it could. */
      function kitPanel(s, done) {
        const panel = el('div', 'vk-acts');
        panel.style.flexDirection = 'column';
        panel.style.alignItems = 'stretch';
        const worn = servantKit(s);
        panel.append(el('p', null, worn.length ? t('haven.kitWears', 'Wears:') : t('haven.kitNone', 'They wear nothing of yours.')));
        for (const [k, it] of worn) panel.append(button(t('haven.kitTake', 'Take back: {piece}', { piece: `${gearLabel(k)} - ${itemLongName(it)}` }), () => done(takeGear(entity, s.id, k))));
        const offer = giftable(entity, s.id);
        const fits = offer.filter(([, no]) => !no);
        if (fits.length) panel.append(el('p', null, t('haven.kitGiveHead', 'Give from your pack:')));
        for (const [it] of fits.slice(0, 12)) panel.append(button(t('haven.kitGive', 'Give: {piece}', { piece: itemLongName(it) }), () => done(giveGear(entity, s.id, it))));
        if (offer.length > fits.length) panel.append(el('p', null, t('haven.kitRefused', '{n} pieces in your pack are beyond their rank or kind.', { n: offer.length - fits.length })));
        return panel;
      }
    },
  });
}
