// @ts-check
// BUNNYFALL VAMPIRE EXPANSION, PHASE 2: THE HAVEN - the vampire's thralls, managed at the door of any home they own (the
// door's own rows, scenes/worldModes.js homeDoorVerbs: "Your Haven"). A chain of the game's own boxes (the quest box's
// ServiceFlowWindow: a box of words, then a list to pick from), so it reads the same on both skins and on a phone:
//   THE HAVEN    slots, provisions and Vitae; every prisoner, servant and social thrall; a merchant thrall's goods
//   A PRISONER   drink from them, bleed them into a vial, tend them, make them a servant, let them go
//   A SERVANT    follow me, guard the Haven, wait here, an errand (by day), its kit, release
//   ITS KIT      what it wears (take back), and what of the pack it could wear (give)
//   A SOCIAL     their perk, release
// Every act is the thralls' own (systems/vampire/thralls.js); this file only lays out the boxes.

import { t } from '../../systems/textManager.js';
import { ServiceFlowWindow } from '../guildServiceWindows.js';
import { itemLongName } from '../../systems/item/itemInfo.js';
import { awakenedVampirism, vitaeNow } from '../../systems/vampire/vitae.js';
import { archetypeName } from '../../systems/vampire/bloodLaw.js';
import {
  prisoners, servants, socials, provisions, slotsUsed, slotsOf, tapPrisoner, bottlePrisoner, tendPrisoner, makeServant,
  releasePrisoner, setDuty, sendErrand, errandRefusal, releaseServant, giftable, giveGear, takeGear, servantKit,
  socialPerk, buyFromMerchant, releaseSocial,
} from '../../systems/vampire/thralls.js';
import { thrallRank, DUTIES, ERRANDS, ERRAND_KEYS, BIND_COST, TEND_GOLD, MERCHANT } from '../../systems/vampire/thrallLaw.js';
import { gearLabel } from '../../systems/revenant/revenantGear.js';
import { worldMinutes } from '../../systems/worldTick.js';

export const HAVEN_VERB = 'home-vampire-haven';
export const isHavenVerb = (/** @type {unknown} */ v) => v === HAVEN_VERB;
/** The door's row at a home of the player's own, for an awakened vampire. @param {any} entity */
export function havenDoorRows(entity) {
  return awakenedVampirism(entity) ? [{ id: HAVEN_VERB, label: t('haven.row', 'Your Haven (thralls)') }] : [];
}

const dutyWord = (d) => (d === DUTIES.Follow ? t('haven.duty.follow', 'following you') : d === DUTIES.Guard ? t('haven.duty.guard', 'guarding the Haven')
  : d === DUTIES.Errand ? t('haven.duty.errand', 'on an errand') : t('haven.duty.idle', 'waiting'));
const roleWord = (r) => (r === 'innkeeper' ? t('thrall.role.innkeeper', 'innkeeper') : r === 'guard' ? t('thrall.role.guard', 'watchman') : t('thrall.role.merchant', 'merchant'));
const perkWord = (r) => (r === 'innkeeper' ? t('haven.perk.innkeeper', 'No one in their town sees you feed on a sleeper.')
  : r === 'guard' ? t('haven.perk.guard', 'Once a day in their town, they hush a bite someone saw.')
    : t('haven.perk.merchant', 'Sends provisions and vials of Vitae by courier, wherever you are.'));
const errandWord = (k) => (k === 'forage' ? t('haven.errand.forage', 'Forage: food for your prisoners') : k === 'market' ? t('haven.errand.market', 'Market: sell and bring back gold') : t('haven.errand.scout', 'Scout: mark fine blood for your next feed'));

/**
 * The window, its first boxes the Haven's. `now()` the character's own clock.
 * @param {{ entity: any, now: () => number, onClose?: () => void }} o
 */
export function openHavenWindow({ entity, now, onClose }) {
  /** @param {string[]} lines @param {() => any[]} next */
  const said = (lines, next) => (lines.length && lines.some(Boolean) ? [{ rows: lines.filter(Boolean), onClick: () => next() }] : next());

  const main = () => {
    const ps = prisoners(), sv = servants(), so = socials();
    const rows = [
      t('haven.title', 'Your Haven'),
      t('haven.status', 'Blood Slots {used} of {max}. Provisions {prov}. Vitae {vitae}.', { used: slotsUsed(), max: slotsOf(entity), prov: provisions(), vitae: Math.round(vitaeNow(entity, now())) }),
    ];
    if (!ps.length && !sv.length && !so.length) rows.push(t('haven.empty', 'No thralls yet. In Steal mode, beat a person down to take them alive, or take a townsperson after the Kiss.'));
    /** @type {Array<{ label: string, go: () => any[] }>} */
    const items = [
      ...ps.map((p) => ({ label: t('haven.prisonerRow', 'Prisoner: {name}, {type} {q}%, health {h}, misery {m}', { name: p.name, type: archetypeName(p.type), q: p.quality, h: p.health, m: p.misery }), go: () => prisonerMenu(p.id) })),
      ...sv.map((s) => ({ label: t('haven.servantRow', 'Servant: {name}, {type} rank {rank}, {duty}', { name: s.name, type: archetypeName(s.type), rank: thrallRank(s.quality), duty: dutyWord(s.duty) }), go: () => servantMenu(s.id) })),
      ...so.map((s) => ({ label: t('haven.socialRow', 'Thrall: {name}, {role} of {town}, loyalty {l}', { name: s.name, role: roleWord(s.role), town: s.townName || '?', l: s.loyalty }), go: () => socialMenu(s.id) })),
    ];
    if (socialPerk('merchant')) {
      items.push({ label: t('haven.buyProvision', 'Buy provisions from your merchant ({gold} gold)', { gold: MERCHANT.provision }), go: () => said(buyFromMerchant(entity, 'provision'), main) });
      items.push({ label: t('haven.buyVial', 'Buy a vial of Vitae from your merchant ({gold} gold)', { gold: MERCHANT.vial }), go: () => said(buyFromMerchant(entity, 'vial'), main) });
    }
    items.push({ label: t('haven.close', 'Leave the Haven'), go: () => [] });
    return [{ rows, onClick: () => [pick(items)] }];
  };

  /** A list box over `items`, Escape back to the Haven. */
  const pick = (items) => ({ picker: items.map((i) => i.label), onPick: (i) => items[i]?.go() ?? [], onCancel: () => [] });

  const prisonerMenu = (id) => {
    const p = prisoners().find((x) => x.id === id);
    if (!p) return main();
    const back = () => (prisoners().some((x) => x.id === id) ? prisonerMenu(id) : main());
    return [{
      rows: [p.name, t('haven.prisoner', '{type} blood, {q}%. Health {h}, misery {m}.', { type: archetypeName(p.type), q: p.quality, h: p.health, m: p.misery })],
      onClick: () => [pick([
        { label: t('haven.tap', 'Drink from them'), go: () => said(tapPrisoner(entity, id, now()), back) },
        { label: t('haven.bottle', 'Bleed them into a vial'), go: () => said(bottlePrisoner(entity, id), back) },
        { label: t('haven.tend', 'Feed and tend them (a provision, or {gold} gold)', { gold: TEND_GOLD }), go: () => said(tendPrisoner(entity, id), back) },
        { label: t('haven.bind', 'Make them your servant (-{n} Vitae)', { n: BIND_COST }), go: () => said(makeServant(entity, id, now()), main) },
        { label: t('haven.release', 'Let them go'), go: () => said(releasePrisoner(id), main) },
        { label: t('haven.back', 'Back'), go: main },
      ])],
    }];
  };

  const servantMenu = (id) => {
    const s = servants().find((x) => x.id === id);
    if (!s) return main();
    const back = () => (servants().some((x) => x.id === id) ? servantMenu(id) : main());
    const rows = [s.name, t('haven.servant', '{type} thrall, rank {rank}. Loyalty {l}. Now {duty}.', { type: archetypeName(s.type), rank: thrallRank(s.quality), l: s.loyalty, duty: dutyWord(s.duty) })];
    if (s.errand) rows.push(t('haven.away', 'Back in about {h} hours.', { h: Math.max(1, Math.ceil((s.errand.until - worldMinutes()) / 60)) }));
    const items = s.errand ? [] : [
      { label: t('haven.follow', 'Follow me'), go: () => said(setDuty(id, DUTIES.Follow), back) },
      { label: t('haven.guard', 'Guard the Haven'), go: () => said(setDuty(id, DUTIES.Guard), back) },
      { label: t('haven.wait', 'Wait here'), go: () => said(setDuty(id, DUTIES.Idle), back) },
      ...ERRAND_KEYS.map((k) => ({ label: t('haven.errandRow', '{what} ({h} hours)', { what: errandWord(k), h: ERRANDS[k].hours }), go: () => said(errandRefusal(s) ? [errandRefusal(s) ?? ''] : sendErrand(id, k), back) })),
      { label: t('haven.kit', 'Its kit'), go: () => kitMenu(id) },
      { label: t('haven.releaseServant', 'Release them'), go: () => said(releaseServant(entity, id), main) },
    ];
    items.push({ label: t('haven.back', 'Back'), go: main });
    return [{ rows, onClick: () => [pick(items)] }];
  };

  const kitMenu = (id) => {
    const s = servants().find((x) => x.id === id);
    if (!s) return main();
    const back = () => kitMenu(id);
    const worn = servantKit(s);
    const rows = [t('haven.kitTitle', '{name}\'s kit', { name: s.name }), ...(worn.length ? worn.map(([k, it]) => `${gearLabel(k)}: ${itemLongName(it)}`) : [t('haven.kitNone', 'They wear nothing of yours.')])];
    const offer = giftable(entity, id);
    const fits = offer.filter(([, no]) => !no);
    if (offer.length > fits.length) rows.push(t('haven.kitRefused', '{n} pieces in your pack are beyond their rank or kind.', { n: offer.length - fits.length }));
    const items = [
      ...worn.map(([k, it]) => ({ label: t('haven.kitTake', 'Take back: {piece}', { piece: itemLongName(it) }), go: () => said(takeGear(entity, id, k), back) })),
      ...fits.slice(0, 20).map(([it]) => ({ label: t('haven.kitGive', 'Give: {piece}', { piece: itemLongName(it) }), go: () => said(giveGear(entity, id, it), back) })),
      { label: t('haven.back', 'Back'), go: () => servantMenu(id) },
    ];
    return [{ rows, onClick: () => [pick(items)] }];
  };

  const socialMenu = (id) => {
    const s = socials().find((x) => x.id === id);
    if (!s) return main();
    return [{
      rows: [s.name, t('haven.social', 'Your {role} in {town}. Loyalty {l}.', { role: roleWord(s.role), town: s.townName || '?', l: s.loyalty }), perkWord(s.role)],
      onClick: () => [pick([
        { label: t('haven.releaseSocial', 'Loosen your hold on them'), go: () => said(releaseSocial(id), main) },
        { label: t('haven.back', 'Back'), go: main },
      ])],
    }];
  };

  return new ServiceFlowWindow(main(), { onClose });
}
