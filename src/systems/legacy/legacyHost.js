// @ts-check
import {
  LEGACY_VENDOR, MODELS, foundFamily, readFamily, personOf, currentOf, writePlayer, recordDeath, successors,
  newbornAllowed, addChild, rollSiblings, setCurrent, endFamily, touch, estateOf, bornValues, fullNameOf, isCustomCareer,
  isAlive, memberLook, nameAtSeat, lineSurnameOf, isModel, NO_LINEAGE,
} from './family.js';
import { houseWord } from './houseName.js';
import { loadFamily, storeFamily, leaveBirth, readBirth, clearBirth, listFamilies, mergeFacts, noteSeen, seenRevOf } from './store.js';
import { takeRevived, stampRevived, dropRevived, revivedOf, REZ_HOLD_S } from './revived.js';
import { birthSearch } from './places.js';
import { payToll, tollLine, ageOf, isElder, isSpent } from './age.js';
import { liveVampirism } from '../../afflictions/racialLive.js';
import { liveLycanthropy } from '../../afflictions/lycanthropy.js';
import { legacySettings } from './settings.js';
import { registerModSaveData } from '../../saves/modSaveData.js';
import { REALM_ACT_TRANSIENT } from '../../saves/realmSaves.js';
import { adoptionOffers as adoptionOffersOf, adoptChild, adoptRefusal } from './adoption.js';
import { t } from '../../ui/textManager.js';
import { repairItemLists } from '../../saves/save.js';
import { rollStats, rollSkills, spendPoolLowest, STAT_KEYS_ORDER } from '../../characters/chargen.js';
import { LEVELING_CLASSIC } from '../../characters/oblivionLeveling.js';
import { contentOn } from '../../mods/contentOff.js';
import { pickHeirloom, markHeirloom, mintRemainsItem, isRemainsItem, isHeirloom, attuneHeirloom, blessingOf, blessedIn, remainsGoldOf, REMAINS_LIST, BLESSING_POINTS } from './heirloom.js';
import { SKILL_NAMES } from '../../characters/skills.js';
import { syncHouses, householdOf, residentOf, familyResOf, kinGreeting, setFamilyHome, familyHome, sameHouse, deedsDue, houseKeyOf } from './household.js';
import { goldStack } from '../../items/inventory.js';
import {
  topicsFor, topicLabel, topicQuestion, court, propose, betrothalOf, wed, childStep, childLine, spouseOf, childrenTogether,
  splitName, dayOf as courtDayOf, MARRIAGE_TEXT, TOPIC, wedPlayer, unionSpouse, playerSpouseLost, residentInHouse, forgetCourtship, warmCourtship, deedDoneOn,
} from './marriage.js';
import { deedsFor, deedLabel, deedQuestion, deedRefusal, deedRegard, deedAffection, deedTally, DEED_TEXT, GIFT_GOLD } from './courtDeeds.js';
import { deductGold, totalGoldAmount } from '../../justice/court.js';
import { memberStanding, inheritStanding, inheritRegards, noteNews, newsFor as houseNewsFor, hearNews } from './influence.js';

export const BORN_REFLEXES = 2;

export const LEGACY_TEXT = Object.freeze({
  founded: (sur, model) => `${houseWord(sur) ? `The house of ${houseWord(sur)}` : 'Your house'} is founded as ${model === MODELS.bloodline ? 'a Bloodline, where every death is final' : 'an Enduring line, where a death costs years'}.`,
  seat: (loc) => `${loc} is your family's seat.`,
  seatUnset: 'Your house has no seat yet. Open the House page in the town you choose to establish it there.',
  seatMoved: (loc) => `The house moves its seat: ${loc} is your family's seat.`,
  seatNowhere: 'To move the family seat, stand anywhere in another town, or at a home your family owns.',
  named: (sur) => `Your house takes its seat's name: the house of ${houseWord(sur)}.`,
  elder: (name, age) => `${name} is ${age} and now an elder of the house. The years ahead are fewer than those behind.`,
  born: (name, loc) => `${name} takes up the family's name in ${loc}.`,
  hunted: (foe, given) => `${foe}, who ended ${given}, will come for the house's heir.`,
  lore: (given, from, to) => `Lore surname change: ${given} chose ${to} instead of ${from}.`,
  noHeir: 'You died without a descendant.',
  heir: 'You died. Your descendant will take your place.',
  kin: 'You died. One of your house will take your place.',
  deadLoad: (name) => `${name} is dead. Their story is the past.`,
  retiredLoad: (name) => `${name} has passed the mantle on. Their story is the past.`,
  fight: 'Not while you are in a fight.',
  unTombed: 'The realm has not recorded this death yet. It will try again before anyone carries on.',
  pending: 'The house waits on its Succession.',
  notSaved: 'Your game could not be saved here right now.',
  estate: (n) => `The estate left you a letter of credit for ${n} gold.`,
  bequest: (item) => `Your elder's bequest is yours: ${item}.`,
  deed: (loc, given) => `${given}'s house${loc ? ` in ${loc}` : ''} passes to you. Its deed is yours now.`,
  deedWaits: (loc, given) => `${given}'s house${loc ? ` in ${loc}` : ''} is waiting for you, but you already own a house in that region and the bank allows one per region. Sell yours there to take it.`,
  remainsName: (name) => `The remains of ${name}`,
  remainsFound: (name) => `You have found the remains of ${name}.`,
  remainsTaken: (name) => `You carry the remains of ${name}. Lay them to rest at a temple, or at the family's seat.`,
  remainsReturned: (name) => `The remains of ${name} are no longer with you. They lie where ${name} fell.`,
  rested: (name, skill, gain = BLESSING_POINTS) => (gain > 0 ? `${name} is laid to rest. Their blessing stays with you: +${gain} ${skill}.`
    : `${name} is laid to rest. Your ${skill} is as blessed as the house's dead can make it.`),
  attuned: (item, gen) => `${item} remembers the hand that carried it home (generation ${gen}).`,
  ended: (sur) => `${houseWord(sur) ? `The house of ${houseWord(sur)}` : 'Your house'} goes on.`,
  kinSlain: (name) => `${name} is dead by your hand. The house will remember it.`,
  kinKilled: (name) => `${name} has been killed. The house mourns.`,
  playAs: (name) => `Play as ${name}`,
  notNow: 'Not now. The house has another matter to settle first.',
  notStored: 'Your family\'s record could not be saved because the browser\'s storage refused it. Delete some old saves to free space, and it will be tried again.',
  notBorn: (given) => `${given}'s first day could not be saved here. Reload to start it again. Nothing of the house is lost.`,
  claimed: (name, by) => `${by} has taken up the search for ${name}'s remains.`,
  retiredKin: (given) => `${given} has passed the mantle on, and keeps the house now.`,
  minor: (given) => `${given} is still a child. They come of age when the mantle passes to them.`,
  spouseKin: (given) => `${given} married into the house and cannot carry the line.`,
  wedElsewhere: (name) => `${name} is wed into the house already. Your betrothal is over.`,
  lineRefused: (why) => `The realm refused your family's record. ${why} It is kept on this device instead.`,
  raiseRefused: () => t('legacy.rez.refused', 'The realm will not let you rise. Your death stands.'),
  raiseUnheard: () => t('legacy.rez.unheard', 'The realm did not hear the call that would raise you. Another may yet reach you.'),
});

export const REZ_HOLD_MS = REZ_HOLD_S * 1000;

export const LEGACY_QUEST_PREFIX = 'legacy:';
export const LEGACY_RING_R = 1.5;

export const REMAINS_FLAT = Object.freeze({ archive: 254, record: 56 });

// The newer copy by `rev` is the base. The character's paid estate and bequest and the progress on remains they
// claimed come from the save, so a reload rewinds those grants.
export function mergeFamily(stored, saved, cid) {
  if (!saved) return stored ?? null;
  if (!stored || stored.id !== saved.id) return saved;
  const base = saved.rev > stored.rev ? saved : stored;
  const out = JSON.parse(JSON.stringify(base));
  out.rev = Math.max(stored.rev, saved.rev);
  if (base === saved) mergeFacts(out, stored);
  else if (saved.seat && (Number(saved.seat.at) || 0) > (Number(out.seat?.at) || 0)) out.seat = { ...saved.seat };
  if (base === stored) takeRevived(out, saved);
  const me = cid ? out.people.find((p) => p.characterId === cid) : null;
  if (!me) return out;
  // Match the saved person by `characterId` first, since the store may have reassigned ids when it resolved clashes
  // (store.js `rekeyClashes`).
  const was = saved.people.find((p) => p.characterId === cid) ?? saved.people.find((p) => p.id === me.id);
  me.estatePaid = Math.max(0, Math.floor(Number(was?.estatePaid) || 0));
  me.bequestPaid = Math.max(0, Math.floor(Number(was?.bequestPaid) || 0));
  me.deedsTaken = Array.isArray(was?.deedsTaken) ? was.deedsTaken.filter((k) => typeof k === 'string') : [];
  for (const r of out.remains ?? []) {
    if (r.by !== me.id) continue;
    const s = (saved.remains ?? []).find((x) => x.id === r.id);
    if (s) Object.assign(r, { items: JSON.parse(JSON.stringify(s.items ?? [])), state: s.state, restedAt: s.restedAt ?? null, found: !!s.found });
    else Object.assign(r, { items: JSON.parse(JSON.stringify(r.first ?? [])), state: 'lying', restedAt: null, found: false });
  }
  return out;
}

const ONLINE_HOUSE_AT_LOAD = true;

/** @param {{ entity:any, storage:() => any, tab:() => any, on:() => boolean, online:() => boolean, killer?:() => (string|null), atPlace?:(place:any) => boolean, openRemains?:(rec:any, items:any[]) => boolean, letGoRemains?:() => void, atRest?:() => boolean, askRest?:(name:string, yes:() => void) => boolean, takeItem?:(item:any) => void, carried?:() => any[], giveItems?:(items:any[]) => void, now:() => number, own:() => number, here:(o?:{height?:boolean}) => any, town:(here:any) => ({region:string, loc:string, mapId?:number}|null), nearestTown:(here:any) => ({region:string, loc:string}|null), gold:() => number, say:(line:string) => void, boot:(search:string) => void, search:() => string, loadCharacter:(characterId:string) => boolean, saveNow:() => boolean, inFight:() => boolean, payEstate?:(gold:number) => void, rng?:() => number, heldHouses?:() => any[], heldHousesWhole?:() => boolean, houseHere?:() => ({mapId:number, buildingKey:number}|null), inheritHouse?:(row:any, fallen:any) => ('given'|'waits'|'gone'|'asking'|null), hasSave?:(characterId:string) => boolean, livingWorld?:() => boolean, templeOf?:() => (number|null), askWed?:(name:string, house:string, done:(takeName:boolean) => void) => boolean, residentNow?:(id:string) => any, regards?:() => any, regardDay?:() => number, sky?:() => number, killerOf?:(characterId:string, ownAt:number) => any, inheritFoe?:(rec:any) => boolean, stored?:(family:any) => void, tombstone?:(why?:'fell'|'retired', o?:{keepalive?:boolean, hold?:boolean}) => (boolean|Promise<boolean>), raiseDeath?:(diedAt:number) => any, realmId?:() => (string|null), look?:() => any, wall?:() => number, whenGone?:(fn:() => void) => void, }} deps */
export function createLegacyHost(deps) {
  const rng = deps.rng ?? Math.random;
  /** @type {any} */ let family = null;
  /** @type {any} */ let born = null;
  // Saved so `seedRegards` can apply the share again when a new game resets relations after the birth.
  /** @type {{ personId:number, standing:any }|null} */ let bornShare = null;
  /** @type {any} */ let past = null;
  /** @type {any} */ let outcome = null;
  let deathSeen = false;
  /** @type {any} */ let held = null;
  const wallNow = () => Number(deps.wall?.() ?? Date.now());
  let elderSaid = false;
  let seatHinted = false;
  const openedThisVisit = new Set();
  const restAskedThisVisit = new Set();
  let remainsSig = '';

  let unstored = false;
  let unstoredSaid = false;
  let storedBody = /** @type {string|null} */ (null);
  const lineBody = () => {
    const p = current();
    return JSON.stringify(family, function (k, v) { return (this === family && k === 'rev') || (p && this === p && (k === 'savedAt' || k === 'lived')) ? undefined : v; });
  };
  const store = (f = family) => {
    if (!f) return true;
    const ok = storeFamily(deps.storage(), f);
    if (f === family) { unstored = !ok; storedBody = ok ? lineBody() : null; }
    if (!ok && !unstoredSaid) { unstoredSaid = true; deps.say(LEGACY_TEXT.notStored); }
    if (ok) unstoredSaid = false;
    // Online, the realm copy is pushed even when the device store refused the write, since the realm is the line's
    // authority.
    if (f === family && (ok || deps.online())) deps.stored?.(family);
    return ok;
  };
  const current = () => currentOf(family);
  const lived = () => {
    const p = current();
    return p ? Math.max(0, Math.floor((deps.own() ?? 0) - (p.bornOwn ?? 0))) : 0;
  };
  function writeCurrent({ saving = false } = {}) {
    const p = current();
    if (past || !p || !deps.entity?.chargenDone || !isAlive(p) || p.retired != null) return;
    if (!playedHere(p)) return;
    writePlayer(p, deps.entity);
    p.lived = lived();
    p.savedAt = Math.max((Number(p.savedAt) || 0) + 1, Math.floor(deps.wall?.() ?? Date.now()));
    p.standing = memberStanding(deps.entity, deps.regards?.() ?? null, deps.regardDay?.() ?? 0);
    const look = deps.look ? memberLook(deps.look()) : null;
    if (look) p.look = look;
    if (!saving) return;
    syncHousesNow(p);
    const here = deps.houseHere?.() ?? null;
    p.parked = here && (family.houses ?? []).some((h) => sameHouse(h, here)) ? { mapId: here.mapId, buildingKey: here.buildingKey } : null;
  }
  function syncHousesNow(p) {
    const held = deps.heldHouses?.() ?? null;
    if (held == null) return false;
    return syncHouses(family, p.id, held, p.deedsTaken ?? [], { whole: deps.heldHousesWhole?.() === true });
  }
  // After the line passes to another member, the page runs the old character until the boot lands, so per-member
  // writes check this first.
  const playedHere = (p) => {
    const cid = cidOf();
    return !cid || p.characterId === cid;
  };
  const cidOf = () => (deps.entity?.characterId ? String(deps.entity.characterId) : null);
  const familyOfCharacter = (cid) => (cid ? listFamilies(deps.storage()).find((f) => f.people.some((p) => p.characterId === cid)) ?? null : null);

  registerModSaveData(LEGACY_VENDOR, {
    newSaveData: () => null,
    getSaveData: () => {
      if (!family) return null;
      // A save that changes nothing but `rev`, `savedAt`, and `lived` skips the write, so idle checkpoints do not
      // resend the line. It compares against the last stored body.
      const was = current();
      const stamps = was ? { savedAt: was.savedAt, lived: was.lived } : null;
      writeCurrent({ saving: true });
      if (!past && current() && playedHere(current())) claimTouched();
      if (storedBody != null && lineBody() === storedBody && loadFamily(deps.storage(), family.id)?.rev === seenRevOf(family)) {
        if (was && stamps) for (const k of /** @type {const} */ (['savedAt', 'lived'])) { if (stamps[k] === undefined) delete was[k]; else was[k] = stamps[k]; }
        deps.stored?.(family);
        return JSON.parse(JSON.stringify(family));
      }
      touch(family);
      store();
      return JSON.parse(JSON.stringify(family));
    },
    restoreSaveData: (rec) => adopt(rec),
    newGame: () => {
      if (held) decideDeath();
      past = null; outcome = null; deathSeen = false;
      residentsKept.clear();
      if (born) { family = born.family; return; }
      const cid = cidOf();
      if (!(family && cid && currentOf(family)?.characterId === cid)) family = null;
    },
  });

  function adopt(rec) {
    // A held death's window closes before any load state resets; the death is already stored, so the loaded record
    // includes it.
    if (held) decideDeath();
    past = null; outcome = null; deathSeen = false; elderSaid = false; bornShare = null;
    openedThisVisit.clear(); restAskedThisVisit.clear(); remainsSig = ''; residentsKept.clear(); openedSig.clear(); deedsSaid.clear();
    deps.letGoRemains?.();
    const cid = cidOf();
    const saved = readFamily(rec);
    const stored = saved ? loadFamily(deps.storage(), saved.id) : familyOfCharacter(cid);
    family = mergeFamily(stored, saved, cid);
    if (!family) return;
    if (stored && family.id === stored.id) noteSeen(family, stored.rev);
    const me = cid ? family.people.find((p) => p.characterId === cid) : null;
    if (!me) { family = null; return; }
    if (!isAlive(me) || me.retired != null) { past = me; return; }
    if (family.pending && family.pending.fallenId !== me.id) settlePending(me);
    if (family.ended != null) { family.ended = null; deps.say?.(LEGACY_TEXT.ended(family.surname)); }
    setCurrent(family, me.id);
    syncHousesNow(me);
    const named = nameAtSeat(family);
    touch(family);
    store();
    if (named) deps.say(LEGACY_TEXT.named(family.surname));
  }

  function found(model = null, { atLoad = false } = {}) {
    if (family || past || !deps.on() || !deps.entity?.chargenDone) return family;
    const known = familyOfCharacter(cidOf());
    if (known) { adopt(known); return family; }
    const chose = model ?? deps.entity?.legacyChoice ?? null;
    if (chose === NO_LINEAGE) return null;
    if (atLoad && deps.online() && !ONLINE_HOUSE_AT_LOAD) return null;
    const s = legacySettings();
    const asked = isModel(chose) ? chose : deps.online() ? MODELS.enduring : s.model;
    family = foundFamily(deps.entity, { model: asked, seat: deps.town(deps.here()), at: deps.now(), rng, settings: s });
    const p = current();
    p.bornOwn = Math.floor(deps.own() ?? 0);
    rollSiblings(family, p.id, { rng, at: deps.now(), settings: s });
    store();
    deps.say(LEGACY_TEXT.founded(family.surname, family.model));
    if (family.seat) deps.say(LEGACY_TEXT.seat(family.seat.loc));
    return family;
  }

  function payEstateOf(p, { write = true } = {}) {
    if (!p) return;
    const due = Math.max(0, (p.estate | 0) - (p.estatePaid | 0));
    const pieces = (p.bequest ?? []).slice(p.bequestPaid | 0);
    if (!due && !pieces.length) return;
    p.estatePaid = p.estate | 0;
    p.bequestPaid = (p.bequest ?? []).length;
    touch(family);
    if (due) { deps.payEstate?.(due); deps.say(LEGACY_TEXT.estate(due)); }
    if (pieces.length) {
      // Pieces paid from the family record skip the item repairs a load runs, so `repairItemLists` runs on them
      // here as they are paid.
      const given = pieces.map((it) => JSON.parse(JSON.stringify(it)));
      repairItemLists([given]);
      deps.giveItems?.(given);
      for (const it of given) deps.say(LEGACY_TEXT.bequest(it.heirloom?.base ?? it.name ?? 'an heirloom'));
    }
    if (write) store();
  }

  const deedsSaid = new Set();
  function takeDeeds(p) {
    if (!deps.inheritHouse) return;
    let changed = false;
    for (const h of deedsDue(family, p)) {
      const fallen = personOf(family, h.by);
      const key = houseKeyOf(h);
      const r = deps.inheritHouse(h, fallen);
      if (r === 'given') {
        (p.deedsTaken ??= []).push(key);
        changed = true;
        deps.say(LEGACY_TEXT.deed(h.location, fallen.given));
      } else if (r === 'gone') {
        family.houses = (family.houses ?? []).filter((x) => !sameHouse(x, h));
        changed = true;
      } else if (r === 'waits' && !deedsSaid.has(key)) {
        deedsSaid.add(key);
        deps.say(LEGACY_TEXT.deedWaits(h.location, fallen.given));
      }
    }
    if (changed) { touch(family); store(); }
  }

  function settlePending(heir) {
    const pend = family.pending;
    if (!pend) return;
    heir.estate = (heir.estate | 0) + (pend.estate | 0);
    heir.bequest = [...(heir.bequest ?? []), ...(pend.bequest ?? [])];
    family.pending = null;
    touch(family);
    huntHeir(heir, personOf(family, pend.fallenId));
  }
  function huntHeir(heir, fallen) {
    if (!fallen?.characterId || !fallen.died) return;
    const foe = deps.killerOf?.(fallen.characterId, (fallen.bornOwn | 0) + (fallen.lived | 0)) ?? null;
    if (!foe?.name) return;
    fallen.died.by = foe.name;
    for (const r of family.remains ?? []) if (r.of === fallen.id) r.killer = foe.name;
    if (deps.inheritFoe?.(foe)) deps.say(LEGACY_TEXT.hunted(foe.name, fallen.given));
  }
  function tellNews(kind, who, mapId, at = deps.sky?.() ?? deps.now()) {
    if (noteNews(family, kind, who, at, mapId ?? null)) touch(family);
  }

  function fallOutcome() {
    const pend = family?.pending;
    const fallen = pend ? personOf(family, pend.fallenId) : null;
    if (!fallen) return null;
    return {
      kind: 'fall', fallen, estate: pend.estate | 0, choices: successors(family).filter((p) => p.id !== fallen.id),
      newborn: fallen.retired != null || newbornAllowed(family, fallen, legacySettings()),
    };
  }

  // The death is written to the record, the device store, and the realm here, before any screen, mode exit or
  // reload can run. Online, a Resurrect within `REZ_HOLD_MS` asks the realm to take it back.
  function onDeath() {
    if (deathSeen) return outcome;
    deathSeen = true;
    outcome = null;
    if (!contentOn('permadeath')) return null;
    const p = current();
    if (!family || !p || !deps.on() || past || family.pending || !isAlive(p) || p.retired != null || !deps.entity?.chargenDone) return null;
    writeCurrent();
    const d = { at: deps.now(), place: deps.here({ height: true }), gold: deps.gold(), by: deps.killer?.() ?? null, cause: 'fell' };
    // Revived deaths are identified by minute alone, so a new death is stamped at least one minute after any
    // revived one.
    d.at = Math.max(d.at, ...revivedOf(p).map((at) => at + 1));
    const h = { familyId: family.id, personId: p.id, d, until: wallNow() + REZ_HOLD_MS, rise: null, toll: null, tollWas: 0, tollPaid: 0, remains: null, sky: 0, kept: null, ask: null, granted: null, unheard: null };
    if (family.model === MODELS.enduring) {
      const cursed = !!(deps.entity && (liveVampirism(deps.entity) || liveLycanthropy(deps.entity)));
      const toll = { share: legacySettings().tollShare, lived: p.lived, ageless: cursed };
      const paid = payToll({ ...p }, toll.share, toll.lived, toll);
      if (!paid.final) { h.rise = { kind: 'rise', line: tollLine(p.given, paid) }; h.toll = toll; }
      else d.cause = 'years';
    }
    if (!h.rise) {
      syncHousesNow(p);
      h.remains = remainsOf(p, d);
      h.sky = deps.sky?.() ?? deps.now();
    }
    const online = deps.online();
    writeDeath(h, { hold: online });
    if (online) held = h;
    return outcome;
  }
  function writeDeath(h, { hold = false } = {}) {
    const p = personOf(family, h.personId);
    if (h.rise) {
      h.tollWas = p.toll | 0;
      payToll(p, h.toll.share, h.toll.lived, h.toll);
      h.tollPaid = p.toll | 0;
      touch(family);
      store();
      outcome = h.rise;
      return;
    }
    h.kept = { look: p.look ?? null, heard: p.heard ?? null };
    recordDeath(family, p.id, { at: h.d.at, cause: h.d.cause, place: h.d.place, by: h.d.by });
    if (!hold) tellNews('died', fullNameOf(p.given, p.surname), h.d.place?.mapId, h.sky);
    (family.remains ??= []).push(h.remains);
    family.pending = { fallenId: p.id, at: h.d.at, estate: estateOf(h.d.gold), bequest: [] };
    touch(family);
    store();
    entomb({ hold });
    outcome = fallOutcome();
  }
  function decideDeath({ keepalive = false } = {}) {
    const h = held;
    held = null;
    if (!h || h.rise || h.ask) return outcome;
    const p = family?.id === h.familyId ? personOf(family, h.personId) : null;
    if (p?.died && Number(p.died.at) === h.d.at) {
      tellNews('died', fullNameOf(p.given, p.surname), h.d.place?.mapId, h.sky);
      touch(family);
      store();
      entomb({ keepalive });
    }
    return outcome;
  }
  // Uses the wall clock, since a hidden tab stops frames but not real time.
  const heldOver = () => !!held && !held.ask && !held.granted && wallNow() >= held.until;
  function raisable() {
    if (held) return !heldOver();
    const pend = family?.pending;
    const fallen = pend ? personOf(family, pend.fallenId) : null;
    return !(fallen?.died && playedHere(fallen));
  }
  function raise(rez = null) {
    const h = held;
    if (!h) return raisable();
    if (h.granted) { held = null; deathSeen = false; outcome = null; return true; }
    if (h.ask) return false;
    if (heldOver()) { decideDeath(); return false; }
    if (h.rise) { giveTollBack(h); held = null; deathSeen = false; outcome = null; return true; }
    if (rez?.at != null && h.unheard === rez.at) return false;
    askRaise(h, rez);
    return false;
  }
  const raised = () => held?.granted ?? null;
  // The raise waits on the tombstone request so the realm never receives a raise before the death it undoes.
  function askRaise(h, rez) {
    const ask = Promise.resolve(tomb).catch(() => false)
      .then(() => (deps.raiseDeath ? deps.raiseDeath(h.d.at) : { ok: true }))
      .then((r) => r ?? { ok: false, error: 'offline' }, () => ({ ok: false, error: 'offline' }));
    h.ask = ask;
    ask.then((r) => raiseAnswered(h, rez, r));
  }
  function raiseAnswered(h, rez, r) {
    h.ask = null;
    if (r?.ok) {
      takeBack(h);
      if (held === h) h.granted = rez ?? { acct: null, name: null, at: null };
      return;
    }
    if (held !== h) return;
    if (REALM_ACT_TRANSIENT.includes(r?.error)) { h.unheard = rez?.at ?? null; deps.say(LEGACY_TEXT.raiseUnheard()); return; }
    deps.say(LEGACY_TEXT.raiseRefused());
    decideDeath();
  }
  function takeBack(h) {
    const p = family?.id === h.familyId ? personOf(family, h.personId) : null;
    if (!p) return;
    stampRevived(p, h.d.at);
    dropRevived(family);
    if (h.kept?.look && !p.look) p.look = h.kept.look;
    if (h.kept?.heard && !p.heard) p.heard = h.kept.heard;
    if (past?.id === p.id && isAlive(p)) past = null;
    touch(family);
    store();
  }
  function giveTollBack(h) {
    const p = family?.id === h.familyId ? personOf(family, h.personId) : null;
    if (!p || (p.toll | 0) !== h.tollPaid) return;
    p.toll = h.tollWas;
    touch(family);
    store();
  }
  function pageGone() { if (held) decideDeath({ keepalive: true }); }
  (deps.whenGone ?? ((fn) => globalThis.addEventListener?.('pagehide', fn)))(pageGone);
  // Online, the Succession waits on this request, since a death the realm never records lets an older save of that
  // character join again.
  let tomb = null;
  function entomb({ keepalive = false, hold = false } = {}) {
    if (!deps.online() || !deps.tombstone) return null;
    const fallen = personOf(family, family?.pending?.fallenId);
    const why = fallen && !fallen.died && fallen.retired != null ? 'retired' : 'fell';
    tomb = Promise.resolve(deps.tombstone(why, hold ? { keepalive, hold: true } : { keepalive })).then((ok) => { if (!ok) { tomb = null; deps.say(LEGACY_TEXT.unTombed); } return !!ok; }, () => { tomb = null; deps.say(LEGACY_TEXT.unTombed); return false; });
    return tomb;
  }

  function deathOutcome() {
    if (!deathSeen) onDeath();
    if (held?.ask || held?.granted) {
      deathSeen = false;
      outcome = null;
      return { kind: 'none' };
    }
    if (held) decideDeath();
    deathSeen = false;
    const out = outcome ?? (family?.pending && !past ? fallOutcome() : null) ?? { kind: 'none' };
    outcome = null;
    return out;
  }
  const willRise = () => outcome?.kind === 'rise';

  function remainsOf(p, d) {
    const chance = family.model === MODELS.bloodline ? legacySettings().heirloomChance : 1;
    const piece = rng() < chance ? pickHeirloom(deps.entity?.items) : null;
    const name = fullNameOf(p.given, p.surname);
    const gold = remainsGoldOf(d.gold);
    const items = [
      mintRemainsItem({ line: family.id, of: p.id, name }),
      ...(piece ? [markHeirloom(piece, { line: family.id, house: family.surname, of: p.id, from: name })] : []),
      ...(gold > 0 ? [goldStack(gold)] : []),
    ];
    return {
      id: `r${p.id}`, of: p.id, name, place: d.place ?? null, items, first: JSON.parse(JSON.stringify(items)),
      killer: d.by ?? null, at: d.at, state: 'lying', by: null, found: false,
    };
  }
  const openRemains = () => {
    const me = current();
    const rows = (family?.remains ?? []).filter((r) => r.state === 'lying' || r.state === 'taken');
    let lapsed = false;
    for (const r of rows) {
      const by = r.by != null ? personOf(family, r.by) : null;
      if (r.by != null && r.by !== me?.id && (!by || !isAlive(by) || by.retired != null)) {
        r.by = null; r.state = 'lying';
        // The bones are laid again in this step, before `readyList` can see the list as unclaimed and read their
        // return as a claim.
        if (!r.items.some(bonesOf(r)) && !carriedNow().some(bonesOf(r))) r.items.unshift(mintRemainsItem({ line: family.id, of: r.of, name: r.name }));
        r.first = JSON.parse(JSON.stringify(r.items)); lapsed = true;
      }
    }
    if (lapsed) { touch(family); store(); }
    return rows.filter((r) => r.by == null || r.by === me?.id);
  };
  const claimedByOthers = () => {
    const me = current();
    return (family?.remains ?? []).filter((r) => (r.state === 'lying' || r.state === 'taken') && r.by != null && r.by !== me?.id);
  };
  const openedSig = new Map();
  const itemsSig = (items) => JSON.stringify(items);
  function claimTouched() {
    const me = current();
    if (!me) return;
    for (const r of family?.remains ?? []) {
      if (r.by != null || !openedSig.has(r.id) || itemsSig(r.items) === openedSig.get(r.id)) continue;
      r.by = me.id;
      openedSig.delete(r.id);
      touch(family);
    }
  }
  const repairedLists = new WeakSet();
  function readyList(r) {
    Object.defineProperty(r.items, REMAINS_LIST, { value: r.of, configurable: true, writable: true, enumerable: false });
    if (!repairedLists.has(r.items)) { repairItemLists([r.items]); repairedLists.add(r.items); }
    if (r.by == null && !openedSig.has(r.id)) openedSig.set(r.id, itemsSig(r.items));
  }
  const bonesOf = (r) => (it) => isRemainsItem(it) && it.legacyRemains.line === family.id && it.legacyRemains.of === r.of;
  const carriedNow = () => deps.carried?.() ?? deps.entity?.items ?? [];

  function remainsStep() {
    const me = current();
    const carried = carriedNow();
    for (const r of openRemains()) {
      const inList = r.items.some(bonesOf(r));
      const kept = carried.some(bonesOf(r));
      if (r.state === 'lying' && !inList && kept) {
        r.state = 'taken'; r.by = me.id;
        touch(family); store();
        deps.say(LEGACY_TEXT.remainsTaken(r.name));
      } else if (!inList && !kept) {
        r.items.unshift(mintRemainsItem({ line: family.id, of: r.of, name: r.name }));
        const was = r.state;
        r.state = 'lying';
        touch(family); store();
        if (was === 'taken') deps.say(LEGACY_TEXT.remainsReturned(r.name));
      } else if (r.state === 'taken' && inList && !kept) {
        r.state = 'lying';
        touch(family); store();
        deps.say(LEGACY_TEXT.remainsReturned(r.name));
      }
      if (r.state === 'lying') {
        const here = deps.atPlace?.(r.place) ?? false;
        if (!here) { openedThisVisit.delete(r.id); continue; }
        if (openedThisVisit.has(r.id) || deps.inFight()) continue;
        readyList(r);
        if (deps.openRemains?.(r, r.items)) {
          openedThisVisit.add(r.id);
          if (!r.found) { r.found = true; deps.say(LEGACY_TEXT.remainsFound(r.name)); touch(family); store(); }
        }
      } else if (r.state === 'taken' && !restAskedThisVisit.has(r.id) && deps.atRest?.()) {
        if (deps.askRest?.(r.name, () => layToRest(r))) restAskedThisVisit.add(r.id);
      }
    }
    if (!deps.atRest?.()) restAskedThisVisit.clear();
    claimTouched();
    const sig = JSON.stringify((family.remains ?? []).map((r) => [r.id, r.items.length, r.state]));
    if (sig !== remainsSig) { if (remainsSig) { touch(family); store(); } remainsSig = sig; }
  }
  function layToRest(r) {
    const carried = carriedNow();
    const bones = carried.find(bonesOf(r));
    if (!bones || r.state !== 'taken') return false;
    deps.takeItem?.(bones);
    const fallen = personOf(family, r.of);
    if (fallen) {
      const b = blessingOf(fallen, r.name);
      const before = blessedIn(deps.entity, b.skill);
      (deps.entity.legacyBlessings ??= []).push(b);
      deps.say(LEGACY_TEXT.rested(r.name, SKILL_NAMES[b.skill] ?? 'skill', blessedIn(deps.entity, b.skill) - before));
    }
    const heirloom = carried.find((it) => isHeirloom(it) && it.heirloom.line === family.id && it.heirloom.of === r.of);
    if (heirloom) { attuneHeirloom(heirloom); deps.say(LEGACY_TEXT.attuned(heirloom.heirloom.base, heirloom.heirloom.gen)); }
    r.state = 'rested';
    r.restedAt = deps.now();
    r.items = [];
    delete r.first;
    tellNews('rested', r.name, deps.here()?.mapId);
    touch(family);
    store();
    return true;
  }
  function questLogEntries() {
    if (!family || !deps.on() || past) return [];
    return openRemains().map((r) => {
      const where = r.place?.loc ? `${r.place.loc}${r.place.region ? `, ${r.place.region}` : ''}` : (r.place?.region || 'the Bay');
      const lines = r.state === 'lying'
        ? [`${r.name} fell at ${where}${r.place?.mode === 'dungeon' ? ', deep inside' : ''}. Their remains still lie there, marked on your map.`,
          ...(r.killer ? [`It was ${r.killer} that struck them down.`] : []),
          ...(r.items.some((it) => isHeirloom(it)) ? ['Something of theirs lies with them, a piece the house will want back.'] : []),
          'Find them, and carry them home.']
        : [`You carry the remains of ${r.name}.`, 'Lay them to rest at any temple, or at the family’s seat, and their blessing will stay with you.'];
      return { id: `${LEGACY_QUEST_PREFIX}${r.id}`, name: `The Bones of ${r.name}`, questName: 'LEGACY', legacy: true, messages: [lines] };
    }).concat(claimedByOthers().map((r) => {
      const by = personOf(family, r.by);
      return { id: `${LEGACY_QUEST_PREFIX}${r.id}`, name: `The Bones of ${r.name}`, questName: 'LEGACY', legacy: true,
        messages: [[LEGACY_TEXT.claimed(r.name, by ? fullNameOf(by.given, by.surname) : 'Another of the house'), 'Play as them to carry it on.']] };
    }));
  }
  const mapMarks = () => (family && deps.on() && !past ? openRemains() : []).filter((r) => r.state === 'lying' && r.place?.pixel).map((r) => ({
    cx: r.place.pixel.x + 0.5, cy: r.place.pixel.y + 0.5, r: LEGACY_RING_R, label: LEGACY_TEXT.remainsName(r.name), id: `${LEGACY_QUEST_PREFIX}${r.id}`, place: r.place.mode === 'dungeon', farmKey: null,
  }));
  function remainsToStand() {
    return remainsLying().map((r) => { readyList(r); return r; });
  }
  function remainsLying() {
    if (!family || !deps.on() || past || family.pending || !deps.entity?.chargenDone) return [];
    const p = current();
    if (!p || !isAlive(p) || !playedHere(p)) return [];
    return openRemains().filter((r) => r.state === 'lying' && r.place);
  }
  const remainsWhere = () => remainsLying().map((r) => ({ line: family.id, id: r.id, place: r.place }));

  function succeed(choice) {
    if (!family) return false;
    if (deps.online() && family.pending && !tomb) entomb();
    const s = legacySettings();
    const fallenId = family.pending?.fallenId ?? family.currentId;
    let heir = null;
    let lore = null;
    if (choice?.newborn) {
      const made = addChild(family, fallenId, { rng, at: deps.now(), settings: s });
      heir = made.person;
      if (made.changed) lore = LEGACY_TEXT.lore(heir.given, made.from, heir.surname);
      rollSiblings(family, heir.id, { rng, at: deps.now(), settings: s });
    } else {
      heir = personOf(family, choice?.personId);
      if (!heir || !isAlive(heir) || heir.kind !== 'member' || heir.retired != null) return false;
    }
    heir.minor = false;
    // The waiting fall settles when the heir lands (`adopt` or `onBorn`), not here, so a boot that never lands
    // leaves the Succession open.
    setCurrent(family, heir.id);
    touch(family);
    store();
    if (lore) deps.say(lore);
    const newborn = !!choice?.newborn;
    if (tomb) { const t = tomb; tomb = null; t.then((ok) => { if (ok) play(heir, null, { newborn }); }); return true; }
    return play(heir, null, { newborn });
  }

  function play(p, at = null, { newborn = false } = {}) {
    if (p.characterId && deps.loadCharacter(p.characterId)) return true;
    if (p.characterId && deps.hasSave && !deps.hasSave(p.characterId)) { p.characterId = null; touch(family); store(); }
    const place = at ?? family.seat ?? deps.nearestTown(deps.here()) ?? { region: 'Daggerfall', loc: 'Daggerfall' };
    leaveBirth(deps.tab(), { familyId: family.id, personId: p.id, region: place.region, loc: place.loc, estate: 0, ...(newborn ? { newborn: true } : {}) });
    deps.boot(birthSearch(deps.search(), p.id, place));
    return true;
  }

  function endLine() {
    if (!family) return;
    endFamily(family, deps.now());
    store();
  }

  function switchRefusal(id) {
    const t = personOf(family, id);
    if (!family || past || !t || !isAlive(t) || t.kind !== 'member' || t.id === family.currentId || t.retired != null) return 'none';
    if (family.pending) return LEGACY_TEXT.pending;
    if (t.minor) return LEGACY_TEXT.minor(t.given);
    if (deps.inFight()) return LEGACY_TEXT.fight;
    return null;
  }
  function switchTo(id, { here = false } = {}) {
    const why = switchRefusal(id);
    if (why) return { ok: false, why };
    writeCurrent();
    if (!deps.saveNow()) return { ok: false, why: LEGACY_TEXT.notSaved };
    setCurrent(family, id);
    touch(family);
    store();
    return { ok: play(personOf(family, id), here ? placeHere() : null) };
  }

  function mantleRefusal() {
    const p = current();
    if (!family || past || !p || !deps.on() || family.model !== MODELS.enduring) return 'Only an Enduring house passes its mantle.';
    if (family.pending) return LEGACY_TEXT.pending;
    if (!isElder(p, lived())) return `${p.given} is not yet an elder of the house.`;
    if (deps.inFight()) return LEGACY_TEXT.fight;
    return null;
  }
  function passMantle() {
    const why = mantleRefusal();
    if (why) return { ok: false, why };
    const p = current();
    writeCurrent();
    const at = deps.now();
    const piece = pickHeirloom(deps.entity?.items);
    const name = fullNameOf(p.given, p.surname);
    p.retired = at;
    family.pending = { fallenId: p.id, at, estate: 0, bequest: piece ? [markHeirloom(piece, { line: family.id, house: family.surname, of: p.id, from: name })] : [] };
    touch(family);
    if (!deps.saveNow()) {
      p.retired = null;
      family.pending = null;
      touch(family);
      return { ok: false, why: LEGACY_TEXT.notSaved };
    }
    store();
    entomb();
    past = p;
    return { ok: true, outcome: fallOutcome() };
  }

  function takeBorn(personId) {
    const b = readBirth(deps.tab(), personId);
    if (!b) return null;
    const f = loadFamily(deps.storage(), b.familyId);
    const p = personOf(f, b.personId);
    if (!f || !p || !isAlive(p)) return null;
    if (p.characterId && (!deps.hasSave || deps.hasSave(p.characterId))) return null;
    p.characterId = null;
    setCurrent(f, p.id);
    born = { family: f, person: p, newborn: b.newborn === true };
    family = f;
    noteSeen(f, f.rev);
    return born;
  }

  function bornResult({ careers, factionDict }) {
    const p = born?.person;
    if (!p) return null;
    const custom = isCustomCareer(p);
    const career = custom ? p.career : careers?.[p.careerIndex]?.career;
    if (!career) return null;
    const { stats, bonusPool } = rollStats(career, rng);
    spendPoolLowest(stats, STAT_KEYS_ORDER, bonusPool);
    const { skills, groupPools } = rollSkills(career, rng);
    spendPoolLowest(skills, career.primarySkills, groupPools.primary);
    spendPoolLowest(skills, career.majorSkills, groupPools.major);
    spendPoolLowest(skills, career.minorSkills, groupPools.minor);
    const values = bornValues(p, { stats, skills });
    const parent = p.parents.length ? personOf(family, p.parents[0]) : null;
    return {
      name: fullNameOf(p.given, p.surname), gender: p.gender, race: p.race, raceId: p.raceId, faceIndex: p.face,
      careerIndex: p.careerIndex, career, stats: values.stats, skills: values.skills, isCustom: custom, customReps: null,
      biographyEffects: [], reflexes: BORN_REFLEXES, factionDict,
      backStory: [`${parent ? `Child of ${fullNameOf(parent.given, parent.surname)}, of` : 'Of'} the house${houseWord(family.surname) ? ` of ${houseWord(family.surname)}` : ''}.`],
      levelingSystem: p.leveling ?? LEVELING_CLASSIC,
    };
  }

  function onBorn() {
    const p = born?.person;
    if (!p) return;
    const newborn = born.newborn === true;
    born = null;
    const seen = seenRevOf(family);
    // The birth commits only with its first save; a failed save restores the family from `was`, and the reload
    // bears the member again.
    const was = JSON.parse(JSON.stringify(family));
    if (family.pending && family.pending.fallenId !== p.id) settlePending(p);
    writePlayer(p, deps.entity);
    p.bornOwn = Math.floor(deps.own() ?? 0);
    p.lived = 0;
    const parent = (p.parents ?? []).map((id) => personOf(family, id)).find((q) => q?.standing) ?? null;
    bornShare = parent?.standing ? { personId: p.id, standing: parent.standing } : null;
    inheritStanding(deps.entity, bornShare?.standing ?? null);
    inheritRegards(deps.regards?.() ?? null, bornShare?.standing ?? null, deps.regardDay?.() ?? 0);
    touch(family);
    const here = deps.here();
    if (newborn) tellNews('born', fullNameOf(p.given, p.surname), here?.mapId);
    const loc = placeHere()?.loc ?? family.seat?.loc ?? '';
    deps.say(LEGACY_TEXT.born(fullNameOf(p.given, p.surname), loc || 'the Bay'));
    payEstateOf(p, { write: false });
    const landed = (ok) => {
      if (ok) { store(); clearBirth(deps.tab()); return true; }
      family = readFamily(was);
      noteSeen(family, seen);
      deps.say(LEGACY_TEXT.notBorn(p.given));
      return false;
    };
    const saved = deps.saveNow();
    return saved && typeof /** @type {any} */ (saved).then === 'function' ? Promise.resolve(saved).then((ok) => landed(!!ok), () => landed(false)) : landed(!!saved);
  }
  // The realm assigns the character id, so the record is rebound to it; a record left on the client id founds a
  // second house at the next load.
  function rebind(was, now) {
    const p = family && was ? family.people.find((x) => x.characterId === String(was)) : null;
    if (!p || !now || p.characterId === String(now)) return false;
    p.characterId = String(now);
    touch(family);
    store();
    return true;
  }

  function tick() {
    if (held && !held.ask && (heldOver() || (deps.entity?.health ?? 0) > 0)) decideDeath();
    if (deathSeen && (deps.entity?.health ?? 0) > 0) { deathSeen = false; outcome = null; }
    if (!family || !deps.on()) return null;
    if (unstored) store();
    if (held) return null;
    if (past) return { past, fall: family.pending ? fallOutcome() : null };
    if (family.pending) return deps.entity?.chargenDone && !born ? { fall: fallOutcome() } : null;
    if (!deps.entity?.chargenDone) return null;
    const p = current();
    if (!p || !isAlive(p) || !playedHere(p)) return null;
    if (!family.seat) {
      if (!seatHinted && deps.town(deps.here())) { seatHinted = true; deps.say(LEGACY_TEXT.seatUnset); }
    } else if (nameAtSeat(family)) {
      touch(family); store(); deps.say(LEGACY_TEXT.named(family.surname));
    } else if (family.seat.mapId == null) {
      const t = deps.town(deps.here());
      if (t?.mapId != null && t.loc === family.seat.loc && t.region === family.seat.region) { family.seat.mapId = t.mapId; touch(family); store(); }
    }
    if (hearNews(family, p, deps.sky?.() ?? deps.now())) store();
    payEstateOf(p);
    takeDeeds(p);
    remainsStep();
    weddingStep(p);
    childrenStep(p);
    if (family.model === MODELS.enduring && !elderSaid && isElder(p, lived())) {
      elderSaid = true;
      deps.say(LEGACY_TEXT.elder(p.given, ageOf(p, lived())));
    }
    return null;
  }

  const ownDay = () => courtDayOf(deps.own() ?? 0);
  /**
   * @param {any} res
   * @param {{ regard:number, personality?:number, etiquette?:number, townName?:string }} ctx
   */
  function topicRows(res, ctx) {
    const me = current();
    if (!family || past || !me || !deps.on() || !playedHere(me) || !res?.id) return [];
    return [...topicsFor(family, me, res, ctx.regard | 0).map((t) => ({
      topic: t,
      label: topicLabel(t),
      legacy: { question: (tone) => topicQuestion(t, tone), answer: (tone, taste) => answerTopic(t, res, taste, ctx) },
    })),
    ...(deps.regards?.() ? deedsFor(family, me, res) : []).map((k) => ({
      topic: `deed:${k}`, label: deedLabel(k),
      legacy: { hearsTone: true, question: (tone) => deedQuestion(k, tone), answer: (_tone, taste, heard) => answerDeed(k, res, taste, heard) },
    }))];
  }
  function answerDeed(kind, res, taste, heard = null) {
    const me = current(), rel = deps.regards?.();
    const day = rel?.today?.() ?? deps.regardDay?.() ?? 0;
    if (!me || !rel) return '';
    const was = rel.regard(res.id, day);
    const first = splitName(res.name)[0];
    const spouse = spouseOf(family, me)?.residentId === res.id;
    const courtship = spouse ? null : me.courting?.[res.id] ?? null;
    const why = deedRefusal(kind, { regard: was, courtship, spouse });
    if (why) return why === 'friend' ? DEED_TEXT.notFriend(first) : DEED_TEXT.notCourting(first);
    if (rel.deedDay?.(res.id, kind) === day) return DEED_TEXT.again(first);
    if (kind === 'gift' && !(totalGoldAmount(deps.entity) >= GIFT_GOLD)) return DEED_TEXT.poor(first);
    heard?.();
    if (kind === 'gift') deductGold(deps.entity, GIFT_GOLD);
    const after = rel.note(res.id, kind, day, deedRegard(kind, taste));
    // Regard and courtship use separate day stamps: a load rewinds the relations stamp with the save, but not the
    // courtship stamp in the family record.
    const warmable = courtship && !courtship.betrothed && !deedDoneOn(courtship, kind, day);
    const warm = warmable ? warmCourtship(me, res.id, deedAffection(kind, taste), { deed: kind, day }) : null;
    if (warm?.warmed) { touch(family); store(); }
    const line = kind === 'compliment' && taste < 0 ? DEED_TEXT.flat(first) : DEED_TEXT[/** @type {'compliment'|'gift'|'embrace'|'kiss'} */ (kind)](first);
    return `${line} ${deedTally({ regard: after, gained: after - was, affection: warm ? warm.affection : null, warmed: warm?.warmed ?? 0 })}`;
  }
  function answerTopic(t, res, taste, ctx) {
    const me = current();
    const first = splitName(res.name)[0];
    if (!me) return '';
    if (t === TOPIC.court) {
      const r = court(me, res, { day: ownDay(), townName: ctx.townName, personality: ctx.personality, etiquette: ctx.etiquette, taste, roll: rng() });
      if (!r.again) { touch(family); store(); }
      return r.again ? MARRIAGE_TEXT.again(first) : r.cooled ? MARRIAGE_TEXT.cooled(first) : MARRIAGE_TEXT.courted(first, r.affection);
    }
    if (t === TOPIC.propose) {
      if (!propose(me, res.id)) return MARRIAGE_TEXT.again(first);
      touch(family); store();
      return MARRIAGE_TEXT.accepted(first, me.courting[res.id]?.town ?? '');
    }
    if (t === TOPIC.wedding) return MARRIAGE_TEXT.wedding(me.courting?.[res.id]?.town ?? '');
    const spouse = spouseOf(family, me);
    return MARRIAGE_TEXT.family(spouse ? childrenTogether(family, me, spouse) : 0);
  }
  let weddingAsked = false;
  function weddingStep(p) {
    const b = betrothalOf(p);
    const temple = deps.templeOf?.() ?? null;
    if (temple == null) { weddingAsked = false; return; }
    if (!b || weddingAsked || (temple >>> 0) !== (b[1].mapId >>> 0)) return;
    const [rid, c] = b;
    if (deps.askWed?.(c.name, family.surname, (takeName) => weddingNow(p, rid, c, takeName))) weddingAsked = true;
  }
  function weddingNow(p, rid, c, takeName) {
    if (!family || spouseOf(family, p) || !betrothalOf(p)) return null;
    if (residentInHouse(family, rid)) { forgetCourtship(p, rid); touch(family); store(); deps.say(LEGACY_TEXT.wedElsewhere(splitName(c.name)[0])); return null; }
    const now = deps.residentNow?.(rid) ?? null;
    const look = now?.race ? { race: now.race, face: now.face } : { race: c.race, face: c.face };
    const s = wed(family, p, { id: rid, name: c.name, sex: c.sex, ...look, mapId: c.mapId }, deps.now(), { takeName });
    if (!s) return null;
    p.childDay = ownDay();
    tellNews('wed', fullNameOf(s.given, s.surname), c.mapId);
    touch(family);
    store();
    deps.say(MARRIAGE_TEXT.wed(fullNameOf(s.given, s.surname), family.surname));
    return s;
  }
  function childrenStep(p) {
    const rev = family.rev;
    const kid = childStep(family, p, { day: ownDay(), rng, at: deps.now(), settings: legacySettings() });
    if (kid) {
      deps.say(childLine(kid, spouseOf(family, p)));
      const line = lineSurnameOf(family, p);
      if (line && kid.surname && kid.surname !== line) deps.say(LEGACY_TEXT.lore(kid.given, line, kid.surname));
      tellNews('born', fullNameOf(kid.given, kid.surname), spouseOf(family, p)?.mapId);
    }
    if (family.rev !== rev) store();
  }
  function residentDied(id) {
    let ended = false;
    for (const p of family?.people ?? []) {
      const c = p.courting?.[id];
      if (!c) continue;
      delete p.courting[id];
      ended = true;
      if (p.id === family.currentId) deps.say(MARRIAGE_TEXT.lost(c.name));
    }
    if (ended) { touch(family); store(); }
    return ended;
  }

  // Each refusal code must be listed in `WED_WHY` in net/wire.js, or the wire drops the frame.
  function wedRefusal() {
    const p = current();
    const rid = deps.realmId?.() ?? null;
    if (!family || past || !p || !deps.on() || !deps.online() || !rid || p.characterId !== String(rid)) return 'house';
    if (family.pending || !isAlive(p) || p.retired != null || p.kind !== 'member' || p.minor || deps.inFight()) return 'busy';
    if (spouseOf(family, p)) return 'wed';
    if (deps.templeOf?.() == null) return 'temple';
    return null;
  }
  /**
   * @param {any} union
   * @param {{ quiet?: boolean }} [o]
   */
  function wedPlayerHeard(union, { quiet = false } = {}) {
    if (!family || !deps.on() || past || !union || typeof union.sid !== 'string' || !union.partner) return null;
    const had = unionSpouse(family, union.sid);
    if (had) return had;
    const m = (family.people ?? []).find((x) => x.kind === 'member' && x.characterId != null && x.characterId === String(union.mine));
    if (!m || !isAlive(m) || spouseOf(family, m)) return null;
    const s = wedPlayer(family, m, union.partner, union.sid, deps.now());
    if (m.id === family.currentId) m.childDay = ownDay();
    tellNews('wed', fullNameOf(s.given, s.surname), deps.templeOf?.() ?? null);
    touch(family);
    store();
    if (!quiet) deps.say(MARRIAGE_TEXT.wedPlayer(fullNameOf(s.given, s.surname)));
    return s;
  }
  function unionsHeard(unions) {
    if (!family || !deps.on() || past || !Array.isArray(unions)) return 0;
    let n = 0;
    for (const u of unions) {
      if (!u || typeof u.sid !== 'string') continue;
      let s = unionSpouse(family, u.sid);
      if (!s && (s = wedPlayerHeard(u, { quiet: u.endedAt != null }))) n++;
      if (!s || u.endedAt == null || u.endedBy !== 'partner' || !playerSpouseLost(family, s, deps.now(), u.endedWhy)) continue;
      n++;
      if (s.spouse === family.currentId) deps.say((u.endedWhy === 'gone' ? MARRIAGE_TEXT.gone : MARRIAGE_TEXT.lost)(fullNameOf(s.given, s.surname)));
    }
    if (n) store();
    return n;
  }

  function newsFor(mapId, t) {
    const me = current();
    if (!family || !deps.on() || past || !me) return [];
    if (isAlive(me) && playedHere(me) && hearNews(family, me, t)) store();
    return houseNewsFor(family, mapId, t, me.heard ?? null);
  }
  function seedRegards(relations) {
    const p = current();
    if (!bornShare || !p || p.id !== bornShare.personId || !playedHere(p)) return 0;
    return inheritRegards(relations, bornShare.standing, deps.regardDay?.() ?? 0);
  }

  const holdsResident = (id) => !!family && deps.on() && (family.people ?? []).some((x) => x.kind === 'resident' && x.residentId === id);

  const NO_RESIDENTS = Object.freeze([]);
  const inWorld = () => !!family && deps.on() && !past && legacySettings().familyInWorld && (deps.livingWorld?.() ?? true);
  const residentsKept = new Map();
  /** @type {Map<string, { sig: string, res: any }>} */
  const residentOfKept = new Map();
  const residentSig = (p, key) => [p.id, key, p.given, p.surname, p.gender, p.race, p.face | 0, p.careerIndex, isCustomCareer(p), p.level | 0, p.look ? JSON.stringify(p.look) : ''].join('|');
  function residentsOf(mapId, lend = null, censusOf = null) {
    const id = mapId >>> 0;
    const spouses = spousesOf(id, censusOf);
    if (!inWorld()) {
      if (!spouses.length) { residentsKept.delete(id); return NO_RESIDENTS; }
      return keptList(id, `${family.id}#s#${spouses.map((x) => x.sig).join('#')}`, () => spouses.map((x) => x.res));
    }
    const rows = householdOf(family).filter(({ home }) => (home.mapId >>> 0) === id);
    const lent = rows.some(({ home }) => home.lent) ? (lend?.(family.id) | 0) : 0;
    const want = rows.map(({ person, home }) => ({ person, key: home.lent ? lent : home.buildingKey })).filter((x) => x.key > 0);
    const sigs = want.map(({ person, key }) => residentSig(person, `${id}:${key}`)).concat(spouses.map((x) => x.sig));
    const listKey = `${family.id}#${sigs.join('#')}`;
    const kept = residentsKept.get(id);
    if (kept?.key === listKey) return kept.list;
    const list = want.map(({ person, key }, i) => {
      const k = `${family.id}:${person.id}`;
      const was = residentOfKept.get(k);
      if (was?.sig === sigs[i]) return was.res;
      const res = residentOf(family, person, { mapId: id, buildingKey: key });
      residentOfKept.set(k, { sig: sigs[i], res });
      return res;
    }).concat(spouses.map((x) => x.res));
    residentsKept.set(id, { key: listKey, list });
    return list;
  }
  function keptList(id, key, make) {
    const kept = residentsKept.get(id);
    if (kept?.key === key) return kept.list;
    const list = make();
    residentsKept.set(id, { key, list });
    return list;
  }
  function spousesOf(mapId, censusOf) {
    if (!family || !deps.on() || !(deps.livingWorld?.() ?? true) || !censusOf) return [];
    const out = [];
    for (const s of family.people) {
      if (s.kind !== 'resident' || !isAlive(s) || (s.mapId >>> 0) !== mapId) continue;
      const census = censusOf(s.residentId);
      if (!census) continue;
      const house = (family.houses ?? []).find((h) => (h.mapId >>> 0) === mapId && sameHouse(h, familyHome(family)))
        ?? (family.houses ?? []).find((h) => (h.mapId >>> 0) === mapId) ?? null;
      const home = house ? house.buildingKey : census.home;
      const sig = `s${s.id}|${s.residentId}|${home}|${s.given}|${s.surname}`;
      const k = `${family.id}:${s.id}`;
      const was = residentOfKept.get(k);
      if (was?.sig === sig) { out.push({ res: was.res, sig }); continue; }
      const res = { ...census, name: fullNameOf(s.given, s.surname), home, household: `F${family.id}`, legacy: { familyId: family.id, personId: s.id } };
      residentOfKept.set(k, { sig, res });
      out.push({ res, sig });
    }
    return out;
  }
  function personOfResident(res) {
    const f = res?.legacy ?? familyResOf(res?.id);
    return f && family && f.familyId === family.id ? personOf(family, f.personId) : null;
  }
  function kinSlain(res) {
    const p = personOfResident(res);
    if (!p || !isAlive(p) || p.id === family.currentId) return false;
    const me = current();
    recordDeath(family, p.id, { at: deps.now(), cause: 'slain', place: deps.here(), by: me ? fullNameOf(me.given, me.surname) : null });
    tellNews('died', fullNameOf(p.given, p.surname), deps.here()?.mapId);
    store();
    deps.say(LEGACY_TEXT.kinSlain(fullNameOf(p.given, p.surname)));
    return true;
  }
  function kinKilled(res) {
    const p = personOfResident(res);
    if (!p || !isAlive(p) || p.id === family.currentId) return false;
    recordDeath(family, p.id, { at: deps.now(), cause: 'fell', place: deps.here(), by: null });
    tellNews('died', fullNameOf(p.given, p.surname), deps.here()?.mapId);
    store();
    deps.say(LEGACY_TEXT.kinKilled(fullNameOf(p.given, p.surname)));
    return true;
  }
  function kinOfResident(res) {
    const p = personOfResident(res);
    const me = current();
    if (!p || !me) return null;
    const { word, is, lines } = kinGreeting(family, me, p, { elder: family.model === MODELS.enduring && isElder(p, p.lived) });
    const why = p.kind === 'resident' ? LEGACY_TEXT.spouseKin(p.given) : p.retired != null ? LEGACY_TEXT.retiredKin(p.given) : switchRefusal(p.id);
    const refusal = why === 'none' ? LEGACY_TEXT.notNow : why;
    return { person: p, word, is, name: fullNameOf(p.given, p.surname), lines, refusal };
  }
  const isFamilyHouse = (house) => inWorld() && (family.houses ?? []).some((h) => sameHouse(h, house));
  function familySeatHere() {
    const p = current();
    if (!family || past || family.pending || !deps.on() || !p || !isAlive(p) || !playedHere(p)) return null;
    const t = placeHere();
    return t && !(t.loc === family.seat?.loc && t.region === family.seat?.region) ? t : null;
  }
  function placeHere() {
    const h = deps.here();
    const t = deps.town(h);
    if (t) return t;
    if (!h || h.mode === 'dungeon' || !h.region || !h.loc || h.mapId == null) return null;
    const id = h.mapId >>> 0;
    return (family?.houses ?? []).some((x) => (x.mapId >>> 0) === id) ? { region: String(h.region), loc: String(h.loc), mapId: id } : null;
  }
  function moveFamilySeat() {
    const t = familySeatHere();
    if (!t) return { ok: false, why: family?.pending ? LEGACY_TEXT.pending : LEGACY_TEXT.seatNowhere };
    // The stamp is at least one past the previous seat's, so this move wins merges even when this device's clock
    // runs behind.
    const firstSeat = !family.seat;
    family.seat = { ...t, at: Math.max((Number(family.seat?.at) || 0) + 1, Math.floor(deps.wall?.() ?? Date.now())) };
    const nameTaken = nameAtSeat(family);
    touch(family);
    store();
    deps.say(firstSeat ? LEGACY_TEXT.seat(t.loc) : LEGACY_TEXT.seatMoved(t.loc));
    if (nameTaken) deps.say(LEGACY_TEXT.named(family.surname));
    return { ok: true };
  }
  function adoptionOffers() { const p = current(); return family && p && !past ? adoptionOffersOf(family, p, rng) : []; }
  function adoptionRefusal() { const p = current(); return past ? 'Not while the past is played back.' : adoptRefusal(family, p); }
  function adopt(spec) {
    const p = current();
    const no = adoptionRefusal();
    if (no || !p) return { ok: false, why: no ?? 'Nobody is here to adopt.' };
    const r = adoptChild(family, p.id, spec, { rng, at: deps.now(), settings: legacySettings() });
    if (!r.ok) return r;
    store();
    deps.say(`${r.name} is taken into the house. They come of age when the mantle passes to them.`);
    return { ok: true, name: r.name };
  }
  function markHome(house) {
    if (!family || !setFamilyHome(family, house)) return false;
    touch(family);
    store();
    return true;
  }

  return {
    get family() { return family; },
    residentsOf,
    topicRows,
    holdsResident,
    residentDied,
    weddingNow: (rid) => { const p = current(); const c = p?.courting?.[rid]; return p && c ? weddingNow(p, rid, c, false) : null; },
    kinOfResident,
    kinSlain,
    kinKilled,
    isFamilyHouse,
    markHome,
    adoptionOffers, adoptionRefusal, adopt,
    familySeatHere,
    moveFamilySeat,
    familyHome: () => familyHome(family),
    get past() { return past; },
    current,
    lived,
    found,
    onCharacterMade: (model = null) => found(model),
    afterBoot: () => found(null, { atLoad: true }),
    onDeath,
    deathOutcome,
    willRise,
    raisable,
    raise,
    raised,
    pageGone,
    fallOutcome,
    succeed,
    endLine,
    switchRefusal,
    switchTo,
    mantleRefusal,
    passMantle,
    questLogEntries,
    mapMarks,
    remainsToStand,
    remainsWhere,
    layToRest,
    takeBorn,
    bornResult,
    onBorn,
    tick,
    newsFor,
    seedRegards,
    rebind,
    wedRefusal,
    wedPlayer: wedPlayerHeard,
    unionsHeard,
  };
}
