// @ts-check
import { t } from '../../ui/textManager.js';
import { registerModSaveData } from '../../saves/modSaveData.js';
import { registerCompanionCount, registerCompanionRoster, companionSlotFree, COMPANION_SLOTS_FULL } from '../../characters/companionSlots.js';
import { registerCustomTemplates, registerTemplateLore, setItemFields, mintCondition, registerItemUseHandler, ITEM_TEMPLATES } from '../../items/itemTemplates.js';
import { addItem, addGoldPieces } from '../../items/inventory.js';
import { goldAmount, deductGoldPieces, lowerRepForCrime, CRIMES } from '../../justice/court.js';
import { equipTableOf } from '../../characters/equip.js';
import { MINUTES_PER_DAY, isDayFromMinutes } from '../../world/gameDate.js';
import { worldMinutes, skyMinutes, ownMinutes } from '../../world/worldTick.js';
import { awakenedVampirism, feedVampire, spendVitae } from './vitae.js';
import { archetypeName, STALE_QUALITY_CAP } from './bloodLaw.js';
import { noteBreach } from './masquerade.js';
import { clanExtraSlots, clanGentle, clanStaleCap, clanFortress, clanSocialUpkeep } from './clanLaw.js';
import { noteFirstUse } from '../../ui/tutorials.js';
import { skippedSpanAt } from '../../world/skippedTime.js';
import { gearRefusal, gearKeyOf, sanitizeGear, gearItems, wornGear, gearLabel } from '../../revenants/revenantGear.js';
import {
  bloodSlots, PRISONERS_MAX, SERVANT_UPKEEP, SOCIAL_UPKEEP, LOYALTY_START, LOYALTY_UNPAID, LOYALTY_PAID, BIND_COST,
  ENTHRALL_COST, PRISONER_DAY, TAP, BOTTLE, TEND, TEND_GOLD, deathChance, thrallRank, DUTIES, ERRANDS, MERCHANT,
} from './thrallLaw.js';

// Thralls are saved per character under this mod save key; renaming it orphans saves.
export const THRALL_SAVE_VENDOR = 'Bunnyfall Vampire Thralls';

/**
 * @typedef {{ id: string, name: string, gender: string, type: string, quality: number, health: number, misery: number,
 *   mobile: number, source: string }} Prisoner
 * @typedef {{ id: string, name: string, gender: string, type: string, quality: number, mobile: number, duty: string,
 *   loyalty: number, health: number|null, maxHealth: number|null, gear: Record<string, any>,
 *   errand: { kind: string, until: number, roll: number } | null }} Servant
 * @typedef {{ id: string, name: string, role: string, town: number, townName: string, region: number, loyalty: number }} Social
 */
const fresh = () => ({ prisoners: /** @type {Prisoner[]} */ ([]), servants: /** @type {Servant[]} */ ([]), socials: /** @type {Social[]} */ ([]), provisions: 0, scouted: 0, upkeepDay: /** @type {number|null} */ (null), hushDay: /** @type {number|null} */ (null) });
let _s = fresh();
let _seq = 0;
/** @type {any} */
let _player = null;
export function setThrallPlayer(entity) { _player = entity ?? null; }
const _lines = [];
export const takeThrallLines = () => _lines.splice(0);
const note = (s) => { if (s) _lines.push(s); };
const newId = () => `${Date.now().toString(36)}${(++_seq).toString(36)}`;
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));

export const thrallState = () => _s;
export const prisoners = () => _s.prisoners;
export const servants = () => _s.servants;
export const socials = () => _s.socials;
export const provisions = () => _s.provisions;

export function slotsUsed() { return _s.prisoners.length + _s.servants.length + _s.socials.length; }
export function slotsOf(entity) { return bloodSlots(entity?.level ?? 1) + clanExtraSlots(clanOf(entity)); }
/** @param {any} entity */
const clanOf = (entity) => awakenedVampirism(entity)?.clan ?? null;
/** @param {any} entity */
export function slotRefusal(entity) {
  if (!awakenedVampirism(entity)) return t('thrall.no.awake', 'Only an awakened vampire binds thralls.');
  if (slotsUsed() >= slotsOf(entity)) return t('thrall.no.slots', 'Your Blood Slots are full ({n}). Release a thrall first.', { n: slotsOf(entity) });
  return null;
}

/** @param {any} entity */
export function captureRefusal(entity) {
  return slotRefusal(entity) ?? (_s.prisoners.length >= PRISONERS_MAX ? t('thrall.no.cells', 'Your Haven holds no more prisoners.') : null);
}
/**
 * @param {any} entity
 * @param {{ name: string, gender?: string, type: string, quality: number, mobile: number, source: string, health?: number }} p
 */
export function takePrisoner(entity, p) {
  if (captureRefusal(entity)) return null;
  /** @type {Prisoner} */
  const pr = { id: newId(), name: String(p.name || t('thrall.captive', 'a captive')).slice(0, 40), gender: p.gender === 'female' ? 'female' : 'male',
    type: p.type, quality: clamp(p.quality, 1, 100), health: clamp(p.health ?? 40), misery: 30, mobile: p.mobile | 0, source: p.source };
  _s.prisoners.push(pr);
  noteFirstUse('vampire-thralls');
  return pr;
}

/**
 * @param {any} entity
 * @param {{ id: string, name: string, role: string, town: number, townName: string, region: number }} p
 * @param {number} now
 */
export function enthrallSocial(entity, p, now) {
  const no = slotRefusal(entity);
  if (no) return no;
  if (_s.socials.some((s) => s.id === p.id)) return t('thrall.no.already', 'They are already yours.');
  if (!spendVitae(entity, ENTHRALL_COST, now)) return t('thrall.no.vitae', 'You need {n} Vitae for that.', { n: ENTHRALL_COST });
  /** @type {Social} */
  const s = { id: String(p.id), name: String(p.name).slice(0, 40), role: p.role, town: p.town >>> 0, townName: String(p.townName ?? '').slice(0, 40), region: p.region | 0, loyalty: LOYALTY_START };
  _s.socials.push(s);
  noteFirstUse('vampire-thralls');
  return s;
}
/** @param {string} id */
export const isSocialThrall = (id) => _s.socials.some((s) => s.id === id);

const prisonerOf = (id) => _s.prisoners.find((p) => p.id === id) ?? null;
function underTheKnife(p, rolls) {
  if (Math.floor(rolls() * 100) >= deathChance(p.health, p.misery)) return null;
  _s.prisoners.splice(_s.prisoners.indexOf(p), 1);
  return t('thrall.prisoner.died', '{name} dies under your teeth, too weak and too wretched to go on.', { name: p.name });
}
/** @param {any} entity @param {string} id @param {number} now */
export function tapPrisoner(entity, id, now, rolls = Math.random) {
  const p = prisonerOf(id);
  if (!p || !awakenedVampirism(entity)) return [];
  const fed = feedVampire(entity, { kind: 'tap', type: p.type, quality: Math.min(p.quality, STALE_QUALITY_CAP), fresh: false, now });
  p.health = clamp(p.health - TAP.health);
  p.misery = clamp(p.misery + (clanGentle(clanOf(entity)) ? TAP.misery / 2 : TAP.misery));
  const died = underTheKnife(p, rolls);
  return [t('thrall.prisoner.tapped', 'You drink from {name}. Stale, but it holds the Beast back. Vitae {vitae}.', { name: p.name, vitae: Math.round(fed?.vitae ?? 0) }), ...(died ? [died] : [])];
}

export const VIAL_TEMPLATE = 6680;
const VIAL_GROUP = 'UselessItems2';
export const VIAL_ROW = Object.freeze({ ...ITEM_TEMPLATES[83], index: VIAL_TEMPLATE, name: 'Vial of Vitae', basePrice: 0, value: 0, stackable: false, rarity: 3 });
registerCustomTemplates([VIAL_ROW]);
registerTemplateLore(VIAL_TEMPLATE, 'Blood, bottled in a vampire\'s Haven. Stale, but it keeps the Beast quiet for a while.');
export function mintVial(type, quality, cap = STALE_QUALITY_CAP) {
  const q = Math.min(cap, clamp(quality, 1, 100));
  return { ...mintCondition(setItemFields({ group: VIAL_GROUP, templateIndex: VIAL_TEMPLATE, name: `Vial of Vitae (${archetypeName(type)}, ${q}%)` })), bloodType: type, bloodQuality: q };
}
export const isVial = (item) => item?.templateIndex === VIAL_TEMPLATE && item?.group === VIAL_GROUP;
registerItemUseHandler(VIAL_TEMPLATE, Object.assign((/** @type {any} */ item, /** @type {any} */ collection, /** @type {any} */ ctx) => {
  const entity = ctx?.entity ?? _player;
  if (!awakenedVampirism(entity)) return { kind: 'text', text: t('thrall.vial.cold', 'Cold, thick blood. You have no taste for it yet.') };
  const list = Array.isArray(collection) ? collection : entity?.items;
  const i = Array.isArray(list) ? list.indexOf(item) : -1;
  if (i >= 0) list.splice(i, 1);
  const fed = feedVampire(entity, { kind: 'vial', type: item.bloodType ?? 'worker', quality: item.bloodQuality ?? 30, fresh: false, now: Math.floor(ownMinutes()) });
  return { kind: 'text', text: t('thrall.vial.drunk', 'You drink the vial. Vitae {vitae}.', { vitae: Math.round(fed?.vitae ?? 0) }) };
}, { usable: () => true }));

/** @param {any} entity @param {string} id */
export function bottlePrisoner(entity, id, rolls = Math.random) {
  const p = prisonerOf(id);
  if (!p || !awakenedVampirism(entity)) return [];
  entity.items ??= [];
  addItem(entity.items, mintVial(p.type, p.quality, clanStaleCap(clanOf(entity), STALE_QUALITY_CAP)));
  p.health = clamp(p.health - BOTTLE.health);
  p.misery = clamp(p.misery + (clanGentle(clanOf(entity)) ? BOTTLE.misery / 2 : BOTTLE.misery));
  const died = underTheKnife(p, rolls);
  return [t('thrall.prisoner.bottled', 'You bleed {name} into a vial and stopper it.', { name: p.name }), ...(died ? [died] : [])];
}
/** @param {any} entity @param {string} id */
export function tendPrisoner(entity, id) {
  const p = prisonerOf(id);
  if (!p) return [];
  if (_s.provisions > 0) _s.provisions--;
  else if (goldAmount(entity) >= TEND_GOLD) deductGoldPieces(entity, TEND_GOLD);
  else return [t('thrall.tend.poor', 'You have no provisions and not {gold} gold to buy food.', { gold: TEND_GOLD })];
  const kind = clanGentle(clanOf(entity)) ? 1.5 : 1;
  p.health = clamp(p.health + TEND.health * kind);
  p.misery = clamp(p.misery - TEND.misery * kind);
  return [t('thrall.tend.done', '{name} eats, and some colour comes back. Health {health}, misery {misery}.', { name: p.name, health: p.health, misery: p.misery })];
}
/** @param {any} entity @param {string} id @param {number} now */
export function makeServant(entity, id, now) {
  const p = prisonerOf(id);
  if (!p) return [];
  if (!spendVitae(entity, BIND_COST, now)) return [t('thrall.no.vitae', 'You need {n} Vitae for that.', { n: BIND_COST })];
  _s.prisoners.splice(_s.prisoners.indexOf(p), 1);
  /** @type {Servant} */
  const sv = { id: p.id, name: p.name, gender: p.gender, type: p.type, quality: p.quality, mobile: p.mobile, duty: DUTIES.Idle, loyalty: LOYALTY_START, health: null, maxHealth: null, gear: {}, errand: null };
  _s.servants.push(sv);
  return [t('thrall.bound', '{name} drinks from your wrist, and is yours. A {type} thrall, rank {rank}.', { name: sv.name, type: archetypeName(sv.type), rank: thrallRank(sv.quality) })];
}
/** @param {string} id */
export function releasePrisoner(id) {
  const p = prisonerOf(id);
  if (!p) return [];
  _s.prisoners.splice(_s.prisoners.indexOf(p), 1);
  return [t('thrall.prisoner.released', 'You let {name} go. They will not remember the way back.', { name: p.name })];
}

const servantOf = (id) => _s.servants.find((s) => s.id === id) ?? null;
export const follower = () => _s.servants.find((s) => s.duty === DUTIES.Follow) ?? null;
export function gearRecord(sv) {
  return { sworn: true, rank: thrallRank(sv.quality), mobileType: sv.mobile, companion: { gear: sv.gear, state: sv.duty === DUTIES.Errand ? 'errand' : 'with' } };
}
/** @param {string} id @param {string} duty */
export function setDuty(id, duty) {
  const sv = servantOf(id);
  if (!sv) return [];
  if (sv.duty === DUTIES.Errand) return [t('thrall.busy', '{name} is away on an errand.', { name: sv.name })];
  if (duty === DUTIES.Follow) {
    const cur = follower();
    if (cur && cur !== sv) cur.duty = DUTIES.Idle;
    if (!cur && !companionSlotFree()) return [COMPANION_SLOTS_FULL];
  }
  sv.duty = duty;
  if (duty === DUTIES.Follow) return [t('thrall.follows', '{name} will walk at your side.', { name: sv.name })];
  if (duty === DUTIES.Guard) return [t('thrall.guards', '{name} will guard your Haven. Prisoners will not escape.', { name: sv.name })];
  return [t('thrall.idles', '{name} waits in your Haven.', { name: sv.name })];
}
export function errandRefusal(sv) {
  if (!sv) return t('thrall.gone', 'That thrall is gone.');
  if (sv.duty === DUTIES.Errand) return t('thrall.busy', '{name} is away on an errand.', { name: sv.name });
  if (!isDayFromMinutes(skyMinutes())) return t('thrall.errand.night', 'Errands are run by day, while you hide from the sun.');
  return null;
}
/** @param {string} id @param {string} kind */
export function sendErrand(id, kind, rolls = Math.random) {
  const sv = servantOf(id);
  const def = ERRANDS[/** @type {keyof typeof ERRANDS} */ (kind)];
  const no = errandRefusal(sv);
  if (no || !def || !sv) return [no ?? ''];
  sv.duty = DUTIES.Errand;
  sv.errand = { kind, until: Math.floor(worldMinutes()) + def.hours * 60, roll: rolls() };
  return [t('thrall.errand.sent', '{name} sets out, and will be back in {hours} hours.', { name: sv.name, hours: def.hours })];
}
function errandHome(entity, sv) {
  const e = sv.errand;
  sv.errand = null;
  sv.duty = DUTIES.Idle;
  const def = e ? ERRANDS[/** @type {keyof typeof ERRANDS} */ (e.kind)] : null;
  if (!def || !e) return;
  const h = def.haul(thrallRank(sv.quality), e.roll);
  if ('provisions' in h) { _s.provisions += h.provisions; note(t('thrall.errand.forage', '{name} is back from foraging with {n} provisions for your prisoners.', { name: sv.name, n: h.provisions })); }
  if ('gold' in h) { addGoldPieces(entity, h.gold); note(t('thrall.errand.market', '{name} is back from the market with {gold} gold.', { name: sv.name, gold: h.gold })); }
  if ('scouted' in h) { _s.scouted = Math.max(_s.scouted, h.scouted); note(t('thrall.errand.scout', '{name} is back: they marked fine blood for you. Your next feed is {n}% richer.', { name: sv.name, n: h.scouted })); }
}
export function takeScouted() { const n = _s.scouted; _s.scouted = 0; return n; }
/** @param {any} entity @param {string} id */
export function releaseServant(entity, id) {
  const sv = servantOf(id);
  if (!sv) return [];
  returnKit(entity, sv);
  _s.servants.splice(_s.servants.indexOf(sv), 1);
  return [t('thrall.servant.released', 'You release {name}. They stumble away into the night.', { name: sv.name })];
}
function returnKit(entity, sv) {
  for (const it of gearItems(sv.gear)) addItem(entity.items ??= [], it);
  sv.gear = {};
}
/** @param {any} entity */
export function returnAllServantKits(entity) {
  let n = 0;
  for (const sv of _s.servants) {
    for (const it of gearItems(sv.gear)) { addItem(entity.items ??= [], it); n++; }
    sv.gear = {};
  }
  return n;
}
/** @param {number} dtDays */
export function rebaseThrallDays(dtDays) {
  const d = Math.max(0, Math.trunc(Number(dtDays) || 0));
  if (!d) return;
  if (_s.upkeepDay != null && Number.isFinite(_s.upkeepDay)) _s.upkeepDay += d;
  if (_s.hushDay != null && Number.isFinite(_s.hushDay)) _s.hushDay += d;
}

export function giftable(entity, id) {
  const sv = servantOf(id);
  if (!sv) return [];
  const worn = new Set(equipTableOf(entity) ?? []);
  return (entity.items ?? []).filter((it) => it && !worn.has(it) && gearKeyOf(it)).map((it) => [it, gearRefusal(/** @type {any} */ (gearRecord(sv)), it, { kindName: archetypeName(sv.type) })]);
}
/** @param {any} entity @param {string} id @param {any} item */
export function giveGear(entity, id, item) {
  const sv = servantOf(id);
  if (!sv) return [];
  const no = gearRefusal(/** @type {any} */ (gearRecord(sv)), item, { kindName: archetypeName(sv.type) });
  if (no) return [no];
  const key = gearKeyOf(item);
  if (!key) return [];
  const i = (entity.items ?? []).indexOf(item);
  if (i < 0) return [];
  entity.items.splice(i, 1);
  if (sv.gear[key]) addItem(entity.items, sv.gear[key]);
  sv.gear[key] = item;
  return [t('thrall.gear.given', '{name} takes it: {slot}.', { name: sv.name, slot: gearLabel(key) })];
}
/** @param {any} entity @param {string} id @param {string} key */
export function takeGear(entity, id, key) {
  const sv = servantOf(id);
  const it = sv?.gear?.[key];
  if (!sv || !it) return [];
  delete sv.gear[key];
  addItem(entity.items ??= [], it);
  return [t('thrall.gear.taken', 'You take back the {slot}.', { slot: gearLabel(key) })];
}
export const servantKit = (sv) => wornGear(/** @type {any} */ (gearRecord(sv)));

export function socialPerk(role, mapId = null) {
  return _s.socials.some((s) => s.role === role && s.loyalty > 0 && (mapId == null || s.town === (mapId >>> 0)));
}
/** @param {number} mapId @param {number} now */
export function guardHushes(mapId, now) {
  const day = Math.floor(now / MINUTES_PER_DAY);
  if (!socialPerk('guard', mapId) || _s.hushDay === day) return false;
  _s.hushDay = day;
  return true;
}
/** @param {any} entity @param {'provision'|'vial'} what */
export function buyFromMerchant(entity, what) {
  if (!socialPerk('merchant')) return [t('thrall.merchant.none', 'You have no merchant among your thralls.')];
  const price = what === 'vial' ? MERCHANT.vial : MERCHANT.provision;
  if (goldAmount(entity) < price) return [t('thrall.merchant.poor', 'That costs {gold} gold.', { gold: price })];
  deductGoldPieces(entity, price);
  if (what === 'vial') { addItem(entity.items ??= [], mintVial('worker', MERCHANT.vialQuality)); return [t('thrall.merchant.vial', 'A vial of Vitae comes by courier, wrapped in cloth.')]; }
  _s.provisions++;
  return [t('thrall.merchant.provision', 'A sack of provisions comes by courier. You have {n}.', { n: _s.provisions })];
}
/** @param {string} id */
export function releaseSocial(id) {
  const i = _s.socials.findIndex((s) => s.id === id);
  if (i < 0) return [];
  const [s] = _s.socials.splice(i, 1);
  return [t('thrall.social.released', 'You loosen your hold on {name}. They wake from it as from a dream.', { name: s.name })];
}

function payDay(entity, th, cost, now) {
  if (spendVitae(entity, cost, now)) th.loyalty = clamp(th.loyalty + LOYALTY_PAID);
  else th.loyalty = clamp(th.loyalty - LOYALTY_UNPAID);
  return th.loyalty > 0;
}
/**
 * @param {any} entity
 * @param {number} now
 * @param {(line: string) => void} [say]
 * @param {() => number} [rolls]
 */
export function thrallRound(entity, now, say = () => {}, rolls = Math.random) {
  if (!awakenedVampirism(entity)) return;
  _player = entity;
  const w = Math.floor(worldMinutes());
  for (const sv of _s.servants) if (sv.errand && w >= sv.errand.until) errandHome(entity, sv);
  const day = Math.floor(now / MINUTES_PER_DAY);
  if (_s.upkeepDay == null) _s.upkeepDay = day;
  if (day > _s.upkeepDay) {
    // Each day played is charged, up to 7; a skipped span (such as a rest or a journey) is charged one day at most.
    let days = 0;
    for (let d = _s.upkeepDay + 1; d <= day && days < 7; d++) {
      const span = skippedSpanAt(d * MINUTES_PER_DAY);
      if (span?.charged) { d = Math.max(d, Math.floor(span.to / MINUTES_PER_DAY)); continue; }
      if (span) span.charged = true;
      days++;
    }
    _s.upkeepDay = day;
    for (let d = 0; d < days; d++) oneDay(entity, now, rolls);
  }
  for (const line of takeThrallLines()) say(line);
}
function oneDay(entity, now, rolls) {
  const fortress = clanFortress(clanOf(entity));
  const guarded = fortress || _s.servants.some((s) => s.duty === DUTIES.Guard);
  for (const p of [..._s.prisoners]) {
    p.misery = clamp(p.misery + (guarded ? PRISONER_DAY.miseryGuarded : PRISONER_DAY.misery) - (fortress ? 2 : 0));
    p.health = clamp(p.health + PRISONER_DAY.health);
    if (!guarded && p.misery >= 100 && Math.floor(rolls() * 100) < PRISONER_DAY.escapeChance) {
      _s.prisoners.splice(_s.prisoners.indexOf(p), 1);
      note(t('thrall.prisoner.escaped', '{name} has escaped your Haven. A guard would have stopped them.', { name: p.name }));
    }
  }
  for (const sv of [..._s.servants]) {
    if (payDay(entity, sv, SERVANT_UPKEEP, now)) continue;
    returnKit(entity, sv);
    _s.servants.splice(_s.servants.indexOf(sv), 1);
    note(t('thrall.servant.left', '{name} went too long without your blood, and has left you. Their kit is back in your pack.', { name: sv.name }));
  }
  for (const s of [..._s.socials]) {
    if (payDay(entity, s, clanSocialUpkeep(clanOf(entity), SOCIAL_UPKEEP), now)) continue;
    _s.socials.splice(_s.socials.indexOf(s), 1);
    try { lowerRepForCrime(entity, s.region, CRIMES.Assault); } catch { }
    noteBreach(entity, s.region, 'freed', now);
    note(t('thrall.social.free', '{name} of {town} has broken free of your hold, and talks of a pale stranger. Your name suffers in the region.', { name: s.name, town: s.townName || t('thrall.social.theirTown', 'their town') }));
  }
}

export const THRALL_KEY_PREFIX = 'th:';
export const isThrallKey = (k) => typeof k === 'string' && k.startsWith(THRALL_KEY_PREFIX);
const _members = new Map();
function memberOf(sv) {
  let c = _members.get(sv.id);
  if (!c) { c = { boat: 'th', name: sv.id, key: `${THRALL_KEY_PREFIX}${sv.id}` }; _members.set(sv.id, c); }
  c.title = sv.name;
  c.role = t('thrall.role', 'Thrall');
  c.mobile = sv.mobile;
  c.gender = sv.gender;
  c.health = sv.health;
  c.maxHealth = sv.maxHealth;
  c.thrall = sv;
  return c;
}
export function thrallParty() {
  return {
    get party() { const f = awakenedVampirism(_player) ? follower() : null; return f ? [memberOf(f)] : []; },
    wake() { },
    knock(boat, id) {
      const sv = servantOf(id);
      if (!sv) return false;
      sv.duty = DUTIES.Idle;
      sv.health = null;
      note(t('thrall.knocked', '{name} falls, and crawls back to your Haven to heal.', { name: sv.name }));
      return true;
    },
    hurt(boat, id, health, maxHealth) {
      const sv = servantOf(id);
      if (!sv) return;
      sv.health = Number.isFinite(health) && health > 0 ? Math.min(health, maxHealth || health) : null;
      sv.maxHealth = Number.isFinite(maxHealth) && maxHealth > 0 ? maxHealth : null;
    },
    isAshore(boat, id) { return follower()?.id === id; },
  };
}
registerCompanionCount('thralls', () => (follower() && awakenedVampirism(_player) ? 1 : 0));
registerCompanionRoster('thralls', () => { const f = awakenedVampirism(_player) ? follower() : null; return f ? [{ name: f.name, role: t('thrall.role', 'Thrall') }] : []; });

const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const str = (v, n = 40) => String(v ?? '').slice(0, n);
registerModSaveData(THRALL_SAVE_VENDOR, {
  newSaveData: () => fresh(),
  getSaveData: () => JSON.parse(JSON.stringify(_s)),
  restoreSaveData: (r) => {
    _members.clear();
    _lines.length = 0;
    const s = fresh();
    if (r && typeof r === 'object') {
      s.prisoners = (Array.isArray(r.prisoners) ? r.prisoners : []).filter((p) => p && typeof p.id === 'string').slice(0, PRISONERS_MAX)
        .map((p) => ({ id: str(p.id, 24), name: str(p.name), gender: p.gender === 'female' ? 'female' : 'male', type: str(p.type, 12), quality: clamp(num(p.quality, 30), 1, 100), health: clamp(num(p.health, 50)), misery: clamp(num(p.misery, 30)), mobile: num(p.mobile, 144) | 0, source: str(p.source, 8) }));
      s.servants = (Array.isArray(r.servants) ? r.servants : []).filter((v) => v && typeof v.id === 'string').slice(0, 8)
        .map((v) => ({ id: str(v.id, 24), name: str(v.name), gender: v.gender === 'female' ? 'female' : 'male', type: str(v.type, 12), quality: clamp(num(v.quality, 30), 1, 100), mobile: num(v.mobile, 144) | 0,
          duty: Object.values(DUTIES).includes(v.duty) ? v.duty : DUTIES.Idle, loyalty: clamp(num(v.loyalty, LOYALTY_START)), health: Number.isFinite(v.health) ? v.health : null, maxHealth: Number.isFinite(v.maxHealth) ? v.maxHealth : null,
          gear: sanitizeGear(v.gear), errand: v.errand && typeof v.errand.kind === 'string' && ERRANDS[/** @type {keyof typeof ERRANDS} */ (v.errand.kind)] ? { kind: v.errand.kind, until: num(v.errand.until), roll: Math.max(0, Math.min(1, num(v.errand.roll, 0.5))) } : null }))
        .map((v) => (v.duty === DUTIES.Errand && !v.errand ? { ...v, duty: DUTIES.Idle } : v));
      s.socials = (Array.isArray(r.socials) ? r.socials : []).filter((x) => x && typeof x.id === 'string').slice(0, 8)
        .map((x) => ({ id: str(x.id, 40), name: str(x.name), role: ['innkeeper', 'guard', 'merchant'].includes(x.role) ? x.role : 'merchant', town: num(x.town) >>> 0, townName: str(x.townName), region: num(x.region) | 0, loyalty: clamp(num(x.loyalty, LOYALTY_START)) }));
      s.provisions = Math.max(0, Math.min(99, num(r.provisions) | 0));
      s.scouted = Math.max(0, Math.min(30, num(r.scouted) | 0));
      s.upkeepDay = Number.isFinite(r.upkeepDay) ? r.upkeepDay : null;
      s.hushDay = Number.isFinite(r.hushDay) ? r.hushDay : null;
    }
    _s = s;
  },
  newGame: () => { _s = fresh(); _members.clear(); _lines.length = 0; },
});
