// @ts-check
// Sworn revenants as a party for the crew companion layer (crewAshore.js). The party state lives in the revenant
// record, so it is saved with the character along with everything else about the revenant.
import { wildHere, WILD_TEXT, zoneWord } from '../world/wildZone.js';
import { WILD_REVENANTS_MAX, wildSwornAtSide } from '../world/wild/wildLeaf.js';
export { WILD_REVENANTS_MAX };
import { swornRevenants, revenantCompanionUpdate, revenantRecord, setSwornLeftListener, revenantBetrays, revenantPerson, revenantMomentEvent, revenantEvent, revenantSay } from './revenant.js';
import { registerCompanionCount, companionsWithYou, COMPANION_SLOTS } from '../characters/companionSlots.js';
import { addItem, addGoldPieces, isGoldPieces } from '../items/inventory.js';
import { LOYALTY, DEVOTED, movedLoyalty, isDevoted, sameKin, BETRAY, mayBetray } from './revenantFeud.js';
import { registerPlayerHurtListener } from '../characters/playerEntity.js';
import { MINUTES_PER_DAY } from '../world/gameDate.js';
import { ownMinutes, raisedMinutes, sharedClockOn, trustedWorldMinutes, sharedClockHeardMark } from '../world/worldTick.js';
import { applySwornGear, gearKeyOf, gearRefusal, gearItems, isGearKey } from './revenantGear.js';
import { ERRAND, errandPlace, newErrand, errandUntil, errandOnWorld, errandWorldMinute, errandStep, errandHaul, deliverHaul, errandHaulWords, errandWords, errandLeftWords } from './revenantErrands.js';
import { swornArtStep, swornMendStep, forgetSwornArt } from './revenantArts.js';
import { playerDoor } from '../player/playerDoor.js';
import { rvnStatsOf, rvnStatScale, rvnLoyaltyMove, rvnRestMinutes, rvnXpWon, rvnXpErrand, rvnStarsOf, rvnHeldStars, rvnXpOf, RVN_XP } from './revenantStars.js';
import { PAID_KEEP } from './revenant.js';
import { t } from '../ui/textManager.js';
import { popupMessage } from '../ui/notify.js';
import { equipTableOf } from '../characters/equip.js';
import { isStationBeast } from '../net/farm/stationLaw.js';

export const REVENANT_RETINUE_MAX = 6;
export const REVENANT_REST_MIN = 8 * 60;
export const SWORN_HEALTH_PER_RANK = 0.25;
export const SWORN_DAMAGE_PER_RANK = 0.1;
export const revenantCompanionKey = (id) => `rv:${id}`;
export const isRevenantCompanionKey = (k) => typeof k === 'string' && k.startsWith('rv:');
export const revenantIdOfKey = (k) => (isRevenantCompanionKey(k) ? k.slice(3) : null);

let _player = null;
/** @type {((kind: 'arrive'|'dismiss'|'release'|'betray', r: any, extra?: { items?: number } | null) => void) | null} */
let _listener = null;
export function setRetinueListener(fn) { _listener = typeof fn === 'function' ? fn : null; }
const tell = (kind, r, extra = null) => { try { _listener?.(kind, r, extra); } catch { } };
/** @type {((id: string) => any) | null} */
let _bodies = null;
export function setRetinueBodies(fn) { _bodies = typeof fn === 'function' ? fn : null; }
export const swornBodyOf = (id) => { try { return _bodies?.(id) ?? null; } catch { return null; } };
export function setRetinuePlayer(player) { _player = player ?? null; }

const stateOf = (r) => r?.companion?.state ?? 'with';
export const retinue = () => swornRevenants().slice().sort((a, b) => b.rank - a.rank || (a.swornAt ?? 0) - (b.swornAt ?? 0));
export const revenantsWithYou = () => swornRevenants().filter((r) => stateOf(r) === 'with');
export const revenantsAway = () => swornRevenants().filter((r) => stateOf(r) !== 'with');
export const swornAtYourSide = () => (wildHere() ? wildSwornAtSide(revenantsWithYou()) : revenantsWithYou());
export const leaveRefusal = (r) => (wildHere() && swornAtYourSide().includes(r) ? WILD_TEXT.companionStays(r.name) : null);
registerCompanionCount('revenant', () => revenantsWithYou().length);

export const retinueHasRoom = () => swornRevenants().length < REVENANT_RETINUE_MAX;
export const swornPlace = () => (companionsWithYou() < COMPANION_SLOTS ? 'with' : 'away');

// An older save's clock can read a rest as days. The clamp is written to the save and the device mirror, because
// clamping only the returned value moves the deadline forward every frame and the rest never ends.
export function restUntil(r, now) {
  let until = r?.companion?.until ?? 0;
  const most = rvnRestMinutes(r, REVENANT_REST_MIN);
  if (stateOf(r) === 'resting' && Number.isFinite(now) && until - now > most) {
    until = now + most;
    r.companion.until = until;
    if (_player && r.id && revenantRecord(_player, r.id) === r) {
      revenantCompanionUpdate(_player, r.id, (c) => { c.until = until; });
    }
  }
  return until;
}
const _heldUntil = new Map();
const _errandWords = [];
const _wonLevel = new Map();
const _levelLines = [];
let _errandClock = null;
let _errandOwed = 0;
let _monotonic = () => performance.now();
export function _setErrandMonotonicForTests(fn = null) { _monotonic = typeof fn === 'function' ? fn : () => performance.now(); }
export const errandWorldNow = () => errandWorldMinute(trustedWorldMinutes(), sharedClockHeardMark(), _monotonic());
export function holdSworn(id, ms) { if (id) _heldUntil.set(id, Date.now() + ms); }
const held = (id) => { const t = _heldUntil.get(id); if (t == null) return false; if (Date.now() < t) return true; _heldUntil.delete(id); return false; };
// A member lasts one spawn; a fall, a sending-away, a release, or a load ends it and its carried spells.
export function forgetSwornMember(id = null) { if (id == null) { _members.clear(); _heldUntil.clear(); _errandWords.length = 0; _levelLines.length = 0; _wonLevel.clear(); _errandClock = null; _errandOwed = 0; forgetSwornArt(); } else _members.delete(id); }
export function callRefusal(r, now) {
  if (!r?.sworn) return 'It is no longer sworn to you.';
  if (stateOf(r) === 'with') return null;
  if (stateOf(r) === 'station' && !stationLost(r)) return t('rvn.station.callAtPost', 'It stands at a farm\'s beast post. Call it back there, in Farming Mode.');
  if (stateOf(r) === 'resting' && now < restUntil(r, now)) return 'Still recovering.';
  if (stateOf(r) === 'errand') return t('rvn.errand.callAbroad', 'Abroad, {left}.', { left: errandLeftWords(errandUntil(r.companion.errand, now), now, sharedClockOn()) });
  if (wildHere() && revenantsWithYou().length >= WILD_REVENANTS_MAX) return zoneWord('revenantOne');
  if (companionsWithYou() >= COMPANION_SLOTS) return `Your companions are full (${COMPANION_SLOTS}).`;
  return null;
}
export function callRevenant(id, now) {
  const r = revenantRecord(_player, id);
  const why = callRefusal(r, now);
  if (why) return why;
  revenantCompanionUpdate(_player, id, (c) => {
    c.state = 'with'; c.until = null; c.station = null;
    if (c.rested) { c.rested = false; c.loyalty = movedLoyalty(c.loyalty, Math.round(LOYALTY.CALLED * (1 - rvnStatsOf(r).rest))); }
  });
  tell('arrive', r);
  return null;
}
export function sendRevenantAway(id, { now = Math.floor(ownMinutes()), byYou = true } = {}) {
  const r = revenantRecord(_player, id);
  if (!r?.sworn || stateOf(r) !== 'with') return false;
  if (leaveRefusal(r)) return false;
  revenantCompanionUpdate(_player, id, (c) => {
    c.state = 'away';
    if (!byYou) return;
    const day = Math.floor(now / MINUTES_PER_DAY);
    if (c.sentDay === day) c.loyalty = movedLoyalty(c.loyalty, rvnLoyaltyMove(r, LOYALTY.SENT_TWICE, c));
    c.sentDay = day;
  });
  forgetSwornMember(id);
  tell('dismiss', r);
  return true;
}
export function releaseRevenant(id) {
  const r = revenantRecord(_player, id);
  if (!r?.sworn) return null;
  if (stateOf(r) === 'errand') return null;
  if (stateOf(r) === 'station' && !stationLost(r)) return null;
  // The release closes the record, so its pack and kit go back to the player first.
  const items = [...(r.companion?.items ?? []), ...gearItems(r.companion?.gear)];
  const out = revenantCompanionUpdate(_player, id, () => 'release');
  forgetSwornMember(id);
  forgetSwornArt(id);
  if (out && items.length && _player) handBack(items);
  if (out) tell('release', out, { items: items.length });
  return out;
}
function handBack(items) {
  _player.items ??= [];
  for (const it of items) { if (isGoldPieces(it)) addGoldPieces(_player, it.stackCount ?? 1); else addItem(_player.items, it); }
}
// Carried off inside the open zone, it hands its pack and kit back, because a death there drops them with the player's.
function leftWithYou(r) {
  if (!_player || !wildHere() || !swornAtYourSide().includes(r)) return 0;
  const items = [...(r.companion?.items ?? []), ...gearItems(r.companion?.gear)];
  if (!items.length) return 0;
  revenantCompanionUpdate(_player, r.id, (c) => { c.items = []; c.gear = {}; });
  handBack(items);
  try { popupMessage(WILD_TEXT.companionLeft(r.name, items.length)); } catch { }
  return items.length;
}

const sayErrand = (ev) => { try { revenantSay(ev, popupMessage); } catch { } };
export const revenantsAbroad = () => swornRevenants().filter((r) => stateOf(r) === 'errand');
export function errandRefusal(r, now) {
  if (!r?.sworn) return t('rvn.sworn.gone', 'It is no longer sworn to you.');
  if (stateOf(r) === 'errand') return t('rvn.errand.no.abroad', 'It is already abroad.');
  if (stateOf(r) === 'station') return t('rvn.station.no.errand', 'It is stationed at a farm. Call it back from its post first.');
  if (stateOf(r) === 'resting' && now < restUntil(r, now)) return t('rvn.errand.no.resting', 'Still recovering.');
  if (revenantsAbroad().length >= ERRAND.MAX) return t('rvn.errand.no.most', '{n} of your sworn are abroad already, the most allowed at once.', { n: ERRAND.MAX });
  return leaveRefusal(r);
}
export function sendOnErrand(id, place, venture, { now = Math.floor(ownMinutes()), seed = Math.floor(Math.random() * 0x100000000), world = sharedClockOn() ? errandWorldNow() : NaN } = {}) {
  const r = revenantRecord(_player, id);
  const why = errandRefusal(r, now);
  if (why) return why;
  const e = newErrand(r, place, venture, now, seed, world);
  if (!e) return t('rvn.errand.no.such', 'It knows no such errand.');
  revenantCompanionUpdate(_player, id, (c) => { c.state = 'errand'; c.errand = e; c.until = null; c.rested = false; });
  _errandClock ??= { own: ownMinutes(), raised: raisedMinutes() };
  forgetSwornMember(id);
  const p = errandPlace(place);
  const where = e.city ? t('rvn.errand.cityIn', '{city}, in {province}', { city: e.city, province: p?.name }) : p?.name;
  _errandWords.push(revenantMomentEvent('dismiss', r, _player?.name, { as: 'errand', body: t('rvn.errand.setsOut', 'It sets out for {where}, {left}.', { where, left: errandLeftWords(e.until, now, sharedClockOn()) }) }));
  return null;
}
export function recallFromErrand(id, now = Math.floor(ownMinutes())) {
  const r = revenantRecord(_player, id);
  if (!r?.sworn || stateOf(r) !== 'errand') return false;
  revenantCompanionUpdate(_player, id, (c) => { c.state = 'resting'; c.errand = null; c.until = now + rvnRestMinutes(r, REVENANT_REST_MIN); c.worn = true; });
  return true;
}
export function returnFromErrand(id, now) {
  const r = revenantRecord(_player, id);
  const e = r?.companion?.errand;
  if (!_player || !r?.sworn || stateOf(r) !== 'errand' || !e) return null;
  const haul = errandHaul(r, e, { level: _player.level ?? 1 });
  const was = rvnStarsOf(r).level;
  revenantCompanionUpdate(_player, id, (c) => {
    c.errand = null;
    // paid keeps the last PAID_KEEP seeds, so a reload of a save made abroad brings the haul back but never pays the
    // loyalty or XP twice.
    const paid = Array.isArray(c.paid) && c.paid.includes(e.seed);
    if (haul.won) {
      c.state = 'away'; c.worn = false;
      if (!paid) c.loyalty = movedLoyalty(c.loyalty, ERRAND.WON_LOYALTY);
    } else { c.state = 'resting'; c.until = now + rvnRestMinutes(r, REVENANT_REST_MIN); c.health = null; c.worn = true; }
    if (!paid && was < RVN_XP.ERRAND_LEVEL_MOST) c.xp = rvnXpOf(rvnXpOf(c.xp) + rvnXpErrand(errandPlace(e.place), haul.won, e.sky?.road ?? 0));
    if (!paid) c.paid = [...(Array.isArray(c.paid) ? c.paid : []), e.seed].slice(-PAID_KEEP);
  });
  const lifted = levelWords(r, was);
  if (lifted) _levelLines.push(lifted);
  deliverHaul(_player, haul);
  const p = errandPlace(e.place);
  const body = haul.won
    ? t('rvn.errand.back', 'Back from {place} with {haul}.', { place: p?.name ?? '', haul: errandHaulWords(haul) })
    : t('rvn.errand.backHurt', 'Back, hurt, from {place} with {haul}. It must recover.', { place: p?.name ?? '', haul: errandHaulWords(haul) });
  _errandWords.push(revenantEvent('errand_back', r, { body, line: t('rvn.errand.backLine', '{name}: {body}', { name: r.name, body }) }));
  return haul;
}
export function chargeErrands(now, { own = ownMinutes(), raised = raisedMinutes(), online = sharedClockOn(), world = errandWorldNow() } = {}) {
  let push = 0;
  if (!_errandClock) _errandClock = { own, raised };
  else {
    if (Number.isFinite(own) && Number.isFinite(_errandClock.own)) {
      _errandOwed += errandStep(own - _errandClock.own, raised >= _errandClock.raised ? raised - _errandClock.raised : 0, online);
      push = Math.floor(_errandOwed);
      _errandOwed -= push;
    }
    _errandClock.own = own; _errandClock.raised = raised;
  }
  const onWorld = online && Number.isFinite(world);
  for (const r of swornRevenants()) {
    if (stateOf(r) !== 'errand' || !r.companion.errand) continue;
    const e = r.companion.errand;
    if (onWorld) {
      // An errand with no due takes the minutes the lived step left, so a raise across the first trusted wake is
      // never paid.
      const o = errandOnWorld(Number.isInteger(e.due) ? e : { ...e, until: errandUntil(e, now - push) + push }, now, world);
      e.due = o.due;
      if (o.until !== e.until) e.until = o.until;
      continue;
    }
    const until = errandUntil(e, now - push) + push;
    if (until !== e.until && Number.isInteger(until)) e.until = until;
  }
}
export const abroadWords = (r, now) => (stateOf(r) === 'errand' ? errandWords(r.companion.errand, now, sharedClockOn()) : null);

/** @type {((mapId: number) => boolean) | null} */
let _stationHome = null;
export function setStationHome(fn) { _stationHome = typeof fn === 'function' ? fn : null; }
const stationLost = (r) => { try { return _stationHome ? _stationHome(r.companion?.station?.mapId) === false : false; } catch { return false; } };
export const revenantsStationed = () => swornRevenants().filter((r) => stateOf(r) === 'station');
export function stationRefusal(r) {
  if (!r?.sworn) return t('rvn.sworn.gone', 'It is no longer sworn to you.');
  if (!isStationBeast(r.mobileType)) return t('rvn.station.no.kind', 'Only a beast will stand at a farm\'s post.');
  if (stateOf(r) !== 'with') return t('rvn.station.no.with', 'It must walk at your side to be stationed.');
  return leaveRefusal(r);
}
// A stationed beast frees a companion slot but still counts toward REVENANT_RETINUE_MAX, and it goes on no errand.
export function stationRevenant(id, mapId, sinceS = 0) {
  const r = revenantRecord(_player, id);
  const why = stationRefusal(r);
  if (why) return why;
  revenantCompanionUpdate(_player, id, (c) => { c.state = 'station'; c.station = { mapId, sinceS }; c.until = null; c.rested = false; });
  forgetSwornMember(id);
  tell('dismiss', r);
  return null;
}
export function recallStationed(id) {
  const r = revenantRecord(_player, id);
  if (!r?.sworn || stateOf(r) !== 'station') return null;
  const place = swornPlace();
  revenantCompanionUpdate(_player, id, (c) => { c.state = place; c.station = null; c.until = null; });
  if (place === 'with') tell('arrive', r);
  return place;
}
// The farm service decides where a beast is; the record revision decides everything else.
export function reconcileStations(mapId, ids) {
  const held = new Set(ids), home = [], marked = [];
  for (const r of swornRevenants()) {
    const here = stateOf(r) === 'station' && r.companion.station?.mapId === mapId;
    if (here && !held.has(r.id)) { if (recallStationed(r.id)) home.push(r.name); }
    else if (!here && held.has(r.id) && isStationBeast(r.mobileType) && stateOf(r) !== 'errand') {
      if (stateOf(r) === 'with') forgetSwornMember(r.id);
      revenantCompanionUpdate(_player, r.id, (c) => { c.state = 'station'; c.station = { mapId, sinceS: 0 }; c.until = null; c.rested = false; });
      marked.push(r.name);
    }
  }
  return { home, marked };
}

export function giftablePieces(player = _player) {
  const worn = new Set(player ? equipTableOf(player).filter(Boolean) : []);
  return (player?.items ?? []).filter((it) => it && !worn.has(it) && gearKeyOf(it) != null);
}
export function giveSwornGear(id, item, { kindName = null } = {}) {
  const r = revenantRecord(_player, id);
  if (!_player || !r) return t('rvn.sworn.gone', 'It is no longer sworn to you.');
  const key = gearKeyOf(item);
  const why = gearRefusal(r, item, { kindName });
  if (why) return why;
  if (wildHere() && !swornAtYourSide().includes(r)) return WILD_TEXT.companionAway(r.name);
  if (equipTableOf(_player).includes(item)) return t('rvn.gear.no.worn', 'You are wearing it.');
  const pack = _player.items ?? [];
  const at = pack.indexOf(item);
  if (at < 0) return t('rvn.gear.no.pack', 'It is not in your pack.');
  pack.splice(at, 1);
  let was = null;
  revenantCompanionUpdate(_player, id, (c) => { c.gear ??= {}; was = c.gear[key] ?? null; c.gear[key] = item; });
  if (was) addItem(pack, was);
  const body = swornBodyOf(id);
  if (body) applySwornGear(body, revenantRecord(_player, id), { taken: was ? [was] : [] });
  return null;
}
export function takeSwornGear(id, key) {
  const r = revenantRecord(_player, id);
  if (!_player || !r?.sworn || stateOf(r) === 'errand' || !isGearKey(key) || !r.companion?.gear?.[key]) return [];
  const keys = key === 'weapon' && r.companion.gear.shield ? ['shield', 'weapon'] : [key];
  const back = [];
  revenantCompanionUpdate(_player, id, (c) => { for (const k of keys) { if (c.gear?.[k]) back.push(c.gear[k]); delete c.gear[k]; } });
  _player.items ??= [];
  for (const it of back) addItem(_player.items, it);
  const body = swornBodyOf(id);
  if (body) applySwornGear(body, revenantRecord(_player, id), { taken: back });
  return back;
}

export function swornStarsRefusal(r) {
  if (!r?.sworn) return t('rvn.sworn.gone', 'It is no longer sworn to you.');
  if (stateOf(r) === 'errand') return t('rvn.stars.no.abroad', 'It\'s away on a mission. Set its stars when it returns.');
  return null;
}
export function setSwornStars(id, ids) {
  const r = revenantRecord(_player, id);
  const why = swornStarsRefusal(r);
  if (why) return why;
  const before = rvnStatScale(rvnStatsOf(r), 'health');
  let set = ['oath'], k = 1;
  revenantCompanionUpdate(_player, id, (c, rec) => {
    set = rvnHeldStars(ids, rvnStarsOf(r).points);
    c.stars = set;
    // crewAshore spawns every later body from the carried whole, so the carried whole and a spawned body rescale
    // together.
    k = rvnStatScale(rvnStatsOf(rec), 'health') / before;
    if (k !== 1 && c.maxHealth > 0) {
      c.maxHealth = Math.max(1, Math.round(c.maxHealth * k));
      if (c.health > 0) c.health = Math.min(c.maxHealth, Math.max(1, c.health * k));
    }
  });
  const body = swornBodyOf(id);
  if (body) {
    if (k !== 1) rescaleBody(body, k);
    applySwornStrength(body, revenantRecord(_player, id), { fresh: false });
  }
  return set.slice();
}
function rescaleBody(e, k) {
  const max = Math.max(1, Math.round((e.maxHealth || 1) * k));
  e.health = Math.min(max, Math.max(e.health > 0 ? 1 : 0, (e.health || 0) * k));
  e.maxHealth = max;
  if (Number.isFinite(e.healthMult)) e.healthMult *= k;
  if (Number.isFinite(e._swornWhole)) e._swornWhole *= k;
}
export function swornStarsBook(id) {
  const rec = () => revenantRecord(_player, id);
  return {
    record: rec,
    stars: () => rvnStarsOf(rec()),
    tree: () => (Array.isArray(rec()?.companion?.stars) ? rec().companion.stars.slice() : ['oath']),
    refusal: () => swornStarsRefusal(rec()),
    setTree: (ids) => setSwornStars(id, ids),
  };
}

export function applySwornStrength(entity, r, { fresh = true } = {}) {
  if (!entity || !r) return;
  const rank = Math.max(1, r.rank | 0), stars = rvnStatsOf(r);
  const starHealth = rvnStatScale(stars, 'health');
  if (fresh) {
    entity.maxHealth = Math.max(1, Math.round((entity.maxHealth || 1) * (1 + SWORN_HEALTH_PER_RANK * rank) * starHealth));
    entity.healthMult = (entity.healthMult ?? 1) * (1 + SWORN_HEALTH_PER_RANK * rank) * starHealth;
    entity.health = entity.maxHealth;
  } else if (!Number.isFinite(entity._swornWhole)) entity.healthMult = (entity.healthMult ?? 1) * (1 + SWORN_HEALTH_PER_RANK * rank) * starHealth;
  entity._swornWhole = (1 + SWORN_HEALTH_PER_RANK * rank) * starHealth;
  entity.damageScale = (1 + SWORN_DAMAGE_PER_RANK * rank) * (isDevoted(r.companion?.loyalty) ? DEVOTED.BLOWS : 1) * rvnStatScale(stars, 'blows');
  entity.revenant = { id: r.id, name: r.name, rank, sworn: true };
  applySwornGear(entity, r);
}

/** @type {Map<string, any>} */
const _members = new Map();
function memberOf(r) {
  let m = _members.get(r.id);
  if (!m) { m = { boat: 'rv', name: r.id, key: revenantCompanionKey(r.id) }; _members.set(r.id, m); }
  m.title = r.name;
  m.mobile = r.mobileType;
  m.gender = r.gender;
  m.health = r.companion?.health ?? null;
  m.maxHealth = r.companion?.maxHealth ?? null;
  m.items = r.companion?.items ?? [];
  m.rank = r.rank;
  m.personality = r.personality;
  m.person = revenantPerson(r);
  return m;
}
export function revenantParty({ onWake = null } = {}) {
  return {
    get party() { const list = revenantsWithYou().filter((r) => !held(r.id)); return swornAtYourSide().filter((r) => list.includes(r)).map(memberOf); },
    wake(now) {
      chargeErrands(now);
      for (const r of swornRevenants()) if (stateOf(r) === 'errand' && r.companion.errand && now >= r.companion.errand.until) returnFromErrand(r.id, now);
      while (_errandWords.length) sayErrand(_errandWords.shift());
      while (_levelLines.length) { try { popupMessage(_levelLines.shift()); } catch { } }
      for (const r of swornRevenants()) {
        if (stateOf(r) === 'resting' && now >= restUntil(r, now)) {
          revenantCompanionUpdate(_player, r.id, (c) => { c.state = 'away'; c.until = null; c.health = null; c.rested = !c.worn; c.worn = false; });
          onWake?.(r);
        }
      }
    },
    knock(boat, id, now) {
      const r = revenantRecord(_player, id);
      if (!r?.sworn || stateOf(r) !== 'with') return false;
      leftWithYou(r);
      revenantCompanionUpdate(_player, id, (c) => { c.state = 'resting'; c.until = now + rvnRestMinutes(r, REVENANT_REST_MIN); c.health = null; c.loyalty = movedLoyalty(c.loyalty, rvnLoyaltyMove(r, LOYALTY.KNOCKED, c)); });
      forgetSwornMember(id);
      return true;
    },
    hurt(boat, id, health, maxHealth) {
      const r = revenantRecord(_player, id);
      const c = r?.companion;
      if (!c || (c.health === health && c.maxHealth === maxHealth)) return;
      // Written without a revision each frame; the save and the next spawn read these numbers.
      c.health = Number.isFinite(health) && health > 0 ? Math.min(health, maxHealth || health) : null;
      c.maxHealth = Number.isFinite(maxHealth) && maxHealth > 0 ? maxHealth : null;
    },
    isAshore(boat, id) { const r = revenantRecord(_player, id); return !!r?.sworn && stateOf(r) === 'with'; },
    packOf(id) { const r = revenantRecord(_player, id); return r?.sworn ? (r.companion.items ??= []) : null; },
  };
}
export function swornFightStep(rec) {
  if (rec?.revenantCompanion) { try { const r = revenantRecord(_player, rec.revenantCompanion); if (r) swornArtStep(rec, r, playerDoor(), { say: popupMessage }); } catch { } }
  const t = rec?.ai?.target;
  const tgt = t?.entity && !t.dead && t.entity.health > 0 ? t : null;
  if (tgt) { rec._fightLast = tgt; return false; }
  const last = rec?._fightLast ?? null;
  if (!last) return false;
  rec._fightLast = null;
  const won = !(last.entity?.health > 0);
  if (won && rec.revenantCompanion) _wonLevel.set(rec.revenantCompanion, last.entity?.level ?? 1);
  return won;
}
export function swornFightWon(id) {
  const r = revenantRecord(_player, id);
  const was = rvnStarsOf(r).level, xp = rvnXpWon(_wonLevel.get(id) ?? 1);
  _wonLevel.delete(id);
  const out = revenantCompanionUpdate(_player, id, (c) => { c.loyalty = movedLoyalty(c.loyalty, LOYALTY.WON); c.xp = rvnXpOf(rvnXpOf(c.xp) + xp); });
  const lifted = out ? levelWords(out, was) : null;
  if (lifted) { try { popupMessage(lifted); } catch { } }
  return out;
}
function levelWords(r, was) {
  const s = r ? rvnStarsOf(revenantRecord(_player, r.id)) : null;
  if (!s || s.level <= was) return null;
  return t('rvn.stars.levelUp', '{given} reaches level {level}. Set its new {n, plural, one {star} other {# stars}} on the Companions page.', { given: r.given, level: s.level, n: Math.max(1, s.points - s.set) });
}

export function swornWitness(mobileType) {
  const out = [];
  for (const r of revenantsWithYou()) {
    if (!sameKin(r.mobileType, mobileType) || !(swornBodyOf(r.id)?.health > 0)) continue;
    if (revenantCompanionUpdate(_player, r.id, (c) => { c.loyalty = movedLoyalty(c.loyalty, rvnLoyaltyMove(r, LOYALTY.KIN_EXECUTED, c)); })) out.push(r);
  }
  return out;
}
export const devotedWithYou = () => revenantsWithYou().find((r) => isDevoted(r.companion?.loyalty) && swornBodyOf(r.id)?.health > 0) ?? null;
setSwornLeftListener((id) => forgetSwornMember(id));
export function betrayalStep(entity, after) {
  if (!entity?.isPlayer || entity.peer || !(after > 0) || after >= (entity.maxHealth || 1) * BETRAY.HEALTH) return null;
  const r = revenantsWithYou().find((x) => mayBetray(x) && swornBodyOf(x.id)?.health > 0);
  const t = r ? revenantBetrays(entity, r) : null;
  if (t) tell('betray', t);
  return t;
}
registerPlayerHurtListener('sworn-betrayal', (entity, { after } = /** @type {any} */ ({})) => { betrayalStep(entity, after); });
registerPlayerHurtListener('sworn-mending', (entity, { after } = /** @type {any} */ ({})) => { try { swornMendStep(entity, after, revenantsWithYou(), (id) => swornBodyOf(id)?.health > 0, { say: popupMessage }); } catch { } });
export function _resetRetinueForTests() { _members.clear(); _heldUntil.clear(); _errandWords.length = 0; _levelLines.length = 0; _errandClock = null; _errandOwed = 0; _player = null; _listener = null; _bodies = null; _wonLevel.clear(); }
