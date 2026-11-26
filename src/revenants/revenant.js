// @ts-check
// Revenants: special enemies that kill the player or get away return later, stronger and renamed. Records live in the
// save and in app storage under the character id, because an offline death ends the run with nothing saved. The two
// merge by revision, so a reload of an older save never forgets a newer revenant or raises a slain one.

import { lootRarityOn } from '../items/lootRarity.js';
import { renownOpens } from '../items/sigil.js';
import { wildHere } from '../world/wildZone.js';
import { registerPlayerBlowLanded } from '../items/sigilSetPowers.js';
import { registerPlayerHurtListener } from '../characters/playerEntity.js';
import { registerPlayerStruckListener, registerPlayerStrikeListener } from '../combat/formulas.js';
import { markPlayerHarm, playerHarmMark, clearPlayerHarm, HARM_MARK_STRUCK_MS, harmFightSince, markPlayerLow, playerLowSince, endPlayerFights } from '../combat/harmMark.js';
import { playerDoor } from '../player/playerDoor.js';
import { MAX_ANSWERS_TELL_ME_ABOUT_OR_RUMORS } from '../talk/rumorMill.js';
import { compassWord, distanceWord } from '../guilds/bountyBoard.js';
import { setHuntJournal, HUNT_QUEST_PREFIX } from './huntJournal.js';
import { MINUTES_PER_DAY } from '../world/gameDate.js';
import { registerModSaveData } from '../saves/modSaveData.js';
import { appStorage } from '../platform/appStorage.js';
import { characterIdOf, mintCharacterId } from '../characters/characterId.js';
import { ownMinutes, skyMinutes } from '../world/worldTick.js';
import { isNight } from '../world/worldClock.js';
import { tieredGear } from '../characters/eliteFoes.js';
import { legendaryGate, rollerLevel } from '../items/lootLevelGate.js';
import { foeSeed } from '../characters/foeBodies.js';
import { goldStack, isSummoned, isGoldPieces, addItem, addGoldPieces } from '../items/inventory.js';
import { unequipItem, equipTableOf, EQUIP_SLOTS } from '../characters/equip.js';
import { isLocked } from '../items/itemLock.js';
import { isBagItem } from '../net/bagLaw.js';
import { isPackOnly, isRealmLocked } from '../items/itemBound.js';
import { WILD_NEVER_GROUPS } from '../world/wild/wildLeaf.js';
import { BOAT_TEMPLATES } from '../net/realmTradeLaw.js';
import { DECOR_OWN_KEPT_BACK } from '../net/decorLaw.js';
import { hudTextWhenShown } from '../ui/notify.js';
import { isLetterOfCredit } from '../net/peerWord.js';
import { itemLongName } from '../items/itemInfo.js';
import { itemValueOf } from '../items/itemTemplates.js';
import { enemyDisplayName, ENEMY_BASICS, isClassEnemyId } from '../characters/enemyBasics.js';
import { KNIGHT_CITY_WATCH } from '../characters/mobileTypes.js';
import { firstName, monsterName, BANK_TYPES, GENDERS } from '../characters/nameHelper.js';
import { getSeed, setSeed, srand } from '../formats/dfRandom.js';
import { personalityFor, isPersonality, personalityLabel, voiceLine, beastBody, possessive, MUTE_KINDS } from './revenantPersonality.js';
import { ADAPT_HOW, DESERT, deserterSplit, LOYALTY, movedLoyalty, ROUT, FESTER, festersOn, WRATH_MAX, idStream, TOOK_MAX, LAIR_RING_R, RUMOR_CHANCE, RUMOR_PX, RUMOR_WEAK, RUMOR_NAMED, RUMOR_HINTS, weaknessKind, lairAfter, sameLair, feudFields, newFeudFields, feudScars, withScars, weaponFeudClass, drawSignature, sanitizeLoyalty, hashStr, SIG_RANK, lessonOf, withLesson, adaptEdge, adaptBlowClass, ADAPT, isWeakBlow, metalOf, willMatters, WEAK, WEAK_NAMES, FLINCH_LINES, FLINCH_HEALTH, WEAKNESS_ELEMENTS, signatureStamp } from './revenantFeud.js';
import { sanitizeGear, gearItems } from './revenantGear.js';
import { sanitizeErrand } from './revenantErrands.js';
import { rvnHeldStars, rvnLevelOf, rvnStarPoints, rvnLoyaltyMove, rvnXpOf } from './revenantStars.js';
import { setUnquietGate, isUnquiet } from './unquietMark.js';
import { BLOOD_DEEDS, deedRanks, sanitizeBlood, sanitizeTears, revenantCraft, craftPace, beginCraft, craftStep, endCraft, woundOf, withWound, sanitizeWounds, woundEffects, woundedEdge, ambitionOf, AMBITION, masteryFestersOn, plunderGold, hoardOf, DREAD, mayAscend, craftFleeWords, woundWords, ambitionRumor, HUNT, trailWarm, trailHours, sanitizeTrail, trailWords, omenWords, healsOn, trainLesson, trainedHow, trainedWords, nearestLair } from './revenantUnquiet.js';
import { t } from '../ui/textManager.js';
import { tagHit, HIT_TAGS } from '../ui/hitNumbers.js';
import { SOUND } from '../audio/soundClips.js';
import { revenantSay as sayRevenant } from './revenantVoice.js';
import { registerBlowTakenMod } from '../combat/blowTaken.js';
import { registerEntityFold, newMods, EMPTY_MODS, computeEntityMods } from '../characters/entityMods.js';
import { registerSilverDoubleVeto } from '../combat/formulas.js';
import { setFeudGate, setFeudClock, noteFeudHarm, noteFeudBackstab, takeFeud, setFeudWeakTest, feudWeakBlow, elementFeudClass, feudOf } from './feudLedger.js';

export const REVENANT_MIN_LEVEL = 3;
export const REVENANT_MIN_RENOWN = 10;
export const REVENANT_MAX = 3;
export const REVENANT_MAX_RANK = 5;
export const REVENANT_FLEE_HEALTH = 0.2;
export const REVENANT_FLEE_CHANCE = 0.5;
export const REVENANT_FLEE_CHANCE_REVENANT = 0.35;
export const REVENANT_FLEE_HEALTH_YOUNG = 0.35;
export const REVENANT_FLEE_CHANCE_YOUNG = 0.8;
export const REVENANT_FLEE_SECONDS = 8;
export const REVENANT_FLEE_PACE = 2;
export const REVENANT_FLEE_PACE_MARKED = 2.5;
export const REVENANT_ESCAPE_DISTANCE = 45;
export const REVENANT_ESCAPE_NEAR = 12;
export const REVENANT_FALLEN_MAX = 12;
export const REVENANT_TOMBS_MAX = 200;
export const REVENANT_RETURN_MIN_MINUTES = 2880;
export const REVENANT_RETURN_MAX_MINUTES = 5760;
export const REVENANT_RETURN_CHANCE = 0.4;
export const REVENANT_LOST_MINUTES = 360;
export const REVENANT_STAND_GRACE_MS = 15000;
export const REVENANT_HEALTH_PER_RANK = 0.4;
export const REVENANT_DAMAGE_PER_RANK = 0.15;
export const REVENANT_LEVEL_PER_RANK = 3;
export const REVENANT_TAUNT_DISTANCE = 25;
export const REVENANT_LOOT = Object.freeze({
  goldPerLevel: [15, 40],
  magicChance: 0.5,
  rareChance: 0.15, rarePerRank: 0.1,
  legendaryChance: 0.03, legendaryPerRank: 0.03,
  rareFromRank: 3,
});
export const REVENANT_SAVE = 'Revenant';
export const REVENANT_STORE_PREFIX = 'dagger.revenant.';
const HISTORY_MAX = 12;

export const revenantSpeaks = (mobileType) => !MUTE_KINDS.has(mobileType);

export const REVENANT_EPITHETS = Object.freeze({
  slew: Object.freeze(['the Butcher', 'the Gravedigger', 'the Widowmaker', 'Bloodhand', 'Bane of {p}', 'the Unbowed', 'Who Slew {p}', 'the Reaper']),
  fled: Object.freeze(['the Scarred', 'the Survivor', 'the Cunning', 'the Hunted', 'Half-Dead', 'the Lucky', 'Who Ran', 'the Unbroken']),
  felled: Object.freeze(['Bane of {a}', 'the Companion-Killer', 'Breaker of Oaths']),
  routed: Object.freeze(['Who Made {p} Run', 'the Pursuer']),
  deserted: Object.freeze(['the Oathbreaker']),
  betrayed: Object.freeze(['the Betrayer']),
  risen: Object.freeze(['the Thrice-Risen', 'the Undying', 'Revenant of {p}', 'the Relentless', '{p}\'s Shadow']),
  dread: Object.freeze(['the Dread']),
});

/** @typedef {{ deed: 'slew'|'fled'|'returned'|'fell'|'yielded'|'executed'|'spared'|'released'|'felled'|'routed'|'festered'|'deserted'|'betrayed'|'laststand'|'ascended', at: number }} RevenantDeed */
/** @typedef {{ state: 'with'|'away'|'resting'|'errand'|'station', station: { mapId: number, sinceS: number }|null, health: number|null, maxHealth: number|null, until: number|null, items: any[], loyalty: number, rested: boolean, sentDay: number|null, gear: Record<string, any>, errand: any, worn: boolean, paid: number[], xp: number, stars: string[], lossCarry: number }} RevenantCompanion */
// Epithets, the signature name, and the band name are derived from these fields, never stored.
/** @typedef {{ id: string, rev: number, mobileType: number, gender: 'male'|'female', given: string, epithet: string,
 *   name: string, rank: number, kills: number, escapes: number, returns: number, trait: string|null, elite: boolean,
 *   born: number, dueAt: number, out: boolean, outAt: number, defeated: boolean, defeatedAt: number|null,
 *   notice: string|null, history: RevenantDeed[], archive: number|null, personality: string, person: number,
 *   fate: 'executed'|'sworn'|'released'|null, sworn: boolean, swornAt: number|null, companion: RevenantCompanion|null,
 *   scars: {k: string, at: number}[], learned: string[], weak: string, weakKnown: 0|1|2, sig: string|null, kin: number[],
 *   lair: {px: number, py: number, name: string, region: number}|null, lairKnown: boolean, took: any[], wrath: number,
 *   fights: number, wounds: string[], blood: number, tears: number, dread: boolean, trail: number, omen: number, woundDay: number, gone?: boolean }} RevenantRecord */

/** @type {{ list: RevenantRecord[], mirrorId: string|null, lastDay: number|null }} */
const _state = { list: [], mirrorId: null, lastDay: null };
const sanitizeDay = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
const laterDay = (a, b) => (a == null ? b : b == null ? a : Math.max(a, b));

export const revenantOn = () => lootRarityOn();
/** @param {{ online?: boolean, renown?: number|null }} [o] */
export const revenantHeld = (o) => !renownOpens(REVENANT_MIN_RENOWN, o);
const nowMinutes = () => { try { return Math.floor(ownMinutes()); } catch { return 0; } };
const skyIsNight = () => { try { return isNight(skyMinutes()); } catch { return false; } };
const skyIsDay = () => { try { return !isNight(skyMinutes()); } catch { return false; } };
const firstWord = (s) => String(s ?? '').trim().split(/\s+/)[0] || 'stranger';
const pick = (list, rolls) => list[Math.min(list.length - 1, Math.floor(rolls() * list.length))];
// Function replacements, so a $ in a typed name stays a letter rather than a replacement pattern.
const fill = (s, { p = '', n = '', a = '' } = {}) => s.replace(/\{p\}'s/g, () => possessive(p)).replace(/\{p\}/g, () => p).replace(/\{n\}/g, () => n).replace(/\{a\}/g, () => a);
const joinName = (given, epithet) => (/^the /.test(epithet) ? `${given} ${epithet}` : `${given}, ${epithet}`);

const voiceIdOf = (entity) => entity?.revenant?.id ?? (entity._voiceId ??= mintCharacterId());
const isU32 = (v) => Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
// The body seed is minted once, at birth, and saved, so every spawn of a revenant is the same person.
export const revenantPerson = (r) => (isU32(r?.person) ? r.person : hashStr(`${r?.id}|person`));
const revenantStamp = (r) => ({ id: r.id, name: r.name, rank: r.rank, learned: [...(r.learned ?? [])], weak: r.weak ?? null, edge: woundedEdge(adaptEdge(r.learned, r.weak), r.wounds), sigBlow: signatureStamp(r), person: revenantPerson(r), dread: r.dread === true });

// Drawn on a stream seeded by the id, with the shared DFRandom seed restored after, so no one else's dice move.
export function revenantGivenName(id, mobileType, gender = 'male') {
  const saved = getSeed();
  try {
    const h = hashStr(String(id));
    srand(h);
    const g = gender === 'female' ? GENDERS.Female : GENDERS.Male;
    let name = '';
    if (isClassEnemyId(mobileType)) {
      const banks = [BANK_TYPES.Breton, BANK_TYPES.Redguard, BANK_TYPES.Nord, BANK_TYPES.DarkElf, BANK_TYPES.HighElf, BANK_TYPES.WoodElf, BANK_TYPES.Khajiit, BANK_TYPES.Imperial];
      name = firstName(banks[h % banks.length], g);
    } else {
      name = monsterName(/** @type {any} */ (g), () => ((h >>> 8) % 2) / 2);
    }
    name = String(name ?? '').trim();
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Nameless';
  } finally { setSeed(saved); }
}

export function revenantEpithet(deed, rank, playerName, rolls = Math.random, current = null, ally = '') {
  const named = (rank >= 3 ? REVENANT_EPITHETS.risen : (REVENANT_EPITHETS[deed] ?? REVENANT_EPITHETS.slew)).filter((e) => ally || !e.includes('{a}'));
  const p = capFirst(firstWord(playerName));
  const all = named.map((e) => fill(e, { p, a: ally }));
  const choices = all.filter((e) => e !== current);
  return pick(choices.length ? choices : all, rolls);
}

export const livingRevenants = () => _state.list.filter((r) => !r.defeated && !r.gone && !r.sworn);
export const huntingRevenants = () => livingRevenants().filter((r) => !r.dread);
export const swornRevenants = () => _state.list.filter((r) => r.sworn && !r.defeated && !r.gone);
export const allRevenants = () => _state.list.filter((r) => !r.gone);
export function revenantsFor(player) { ensureMirror(player); mendRevenantLairs(); return allRevenants(); }
export const revenantById = (id) => _state.list.find((r) => r.id === id && !r.gone) ?? null;

const isStr = (v) => typeof v === 'string';
const isNum = (v) => Number.isFinite(v);
const ALLY_MAX = 40;
const allyName = (v) => (isStr(v) && v.trim() ? v.trim().slice(0, ALLY_MAX) : null);
const historyOf = (d) => { const ally = allyName(d.ally); return { deed: d.deed, at: d.at, ...(ally ? { ally } : {}), ...(d.deed === 'fled' && d.unbroken === true ? { unbroken: true } : {}) }; };
const FATES = new Set(['executed', 'sworn', 'released']);
function sanitizeCompanion(c, personality = null, rank = 1) {
  const errand = c?.state === 'errand' ? sanitizeErrand(c?.errand) : null;
  const station = c?.state === 'station' && Number.isSafeInteger(c?.station?.mapId) && c.station.mapId >= 0 ? { mapId: c.station.mapId, sinceS: Number.isFinite(c.station.sinceS) ? Math.max(0, c.station.sinceS) : 0 } : null;
  const state = station ? 'station' : c?.state === 'away' || c?.state === 'resting' ? c.state : errand ? 'errand' : c?.state === 'errand' ? 'away' : 'with';
  const hp = Number(c?.health), max = Number(c?.maxHealth);
  return {
    state, health: c?.health != null && Number.isFinite(hp) && hp > 0 ? hp : null, maxHealth: c?.maxHealth != null && Number.isFinite(max) && max > 0 ? max : null,
    until: state === 'resting' && isNum(c?.until) ? c.until : null,
    items: Array.isArray(c?.items) ? c.items.filter((it) => it && typeof it === 'object') : [],
    loyalty: sanitizeLoyalty(c?.loyalty, personality),
    rested: state === 'away' && c?.rested === true,
    sentDay: Number.isInteger(c?.sentDay) && c.sentDay >= 0 ? c.sentDay : null,
    gear: sanitizeGear(c?.gear),
    errand,
    station,
    worn: state === 'resting' && c?.worn === true,
    paid: paidOf(c?.paid),
    xp: rvnXpOf(c?.xp),
    stars: rvnHeldStars(c?.stars, rvnStarPoints(rvnLevelOf(rvnXpOf(c?.xp)), rank)),
    lossCarry: Number.isFinite(c?.lossCarry) ? Math.max(-0.999999, Math.min(0, c.lossCarry)) : 0,
  };
}
export const PAID_KEEP = 16;
const paidOf = (v) => (Array.isArray(v) ? v : Number.isInteger(v) ? [v] : []).filter((x) => Number.isInteger(x) && x >= 0).map((x) => x >>> 0).slice(-PAID_KEEP);
function sanitize(r) {
  if (r && isStr(r.id) && r.id && r.gone === true) return { id: r.id, rev: isNum(r.rev) ? r.rev : 0, gone: true };
  if (!r || !isStr(r.id) || !r.id || !Number.isInteger(r.mobileType) || !isStr(r.given) || !isStr(r.epithet)) return null;
  const rank = Math.max(1, Math.min(REVENANT_MAX_RANK, Number.isInteger(r.rank) ? r.rank : 1));
  const personality = isPersonality(r.personality) ? r.personality : personalityFor(r.id, r.mobileType);
  const epithet = r.epithet === REVENANT_EPITHETS.dread[0] && r.dread !== true && !r.sworn && !r.defeated ? risenFor(r.id) : r.epithet;
  return {
    id: r.id, rev: isNum(r.rev) ? r.rev : 0, mobileType: r.mobileType, gender: r.gender === 'female' ? 'female' : 'male',
    given: r.given, epithet, name: epithet === r.epithet && isStr(r.name) && r.name ? r.name : joinName(r.given, epithet), rank,
    kills: isNum(r.kills) ? r.kills : 0, escapes: isNum(r.escapes) ? r.escapes : 0, returns: isNum(r.returns) ? r.returns : 0,
    trait: isStr(r.trait) && r.trait ? r.trait : null, elite: !!r.elite,
    born: isNum(r.born) ? r.born : 0, dueAt: isNum(r.dueAt) ? r.dueAt : 0,
    // Never out across a load, because the enemy spawned for it is not in a fresh world.
    out: false, outAt: 0,
    defeated: !!r.defeated, defeatedAt: isNum(r.defeatedAt) ? r.defeatedAt : null,
    notice: isStr(r.notice) ? r.notice : null,
    archive: Number.isInteger(r.archive) ? r.archive : null,
    personality,
    person: revenantPerson(r),
    fate: FATES.has(r.fate) ? r.fate : null, sworn: !!r.sworn && !r.defeated, swornAt: isNum(r.swornAt) ? r.swornAt : null,
    companion: r.sworn && !r.defeated ? sanitizeCompanion(r.companion, personality, rank) : null,
    history: Array.isArray(r.history) ? r.history.filter((d) => d && isStr(d.deed) && isNum(d.at)).slice(-HISTORY_MAX).map(historyOf) : [],
    ...feudFields(r, { id: r.id, mobileType: r.mobileType, rank }),
    wounds: sanitizeWounds(r.wounds), blood: sanitizeBlood(r.blood), tears: sanitizeTears(r.tears), dread: r.dread === true && !r.sworn && rank >= REVENANT_MAX_RANK,
    trail: sanitizeTrail(r.trail), omen: sanitizeTrail(r.omen === undefined ? r.dueAt : r.omen),
    woundDay: Number.isInteger(r.woundDay) && r.woundDay >= 0 ? r.woundDay : -1,
  };
}
function risenFor(id) {
  const plain = REVENANT_EPITHETS.risen.filter((e) => !e.includes('{p}'));
  return plain[hashStr(`${id}|risen`) % plain.length];
}
export function mergeRevenants(a, b) {
  const by = new Map();
  for (const r of [...(a ?? []), ...(b ?? [])]) {
    const s = sanitize(r);
    if (!s) continue;
    const had = by.get(s.id);
    if (!had || s.rev > had.rev) by.set(s.id, s);
  }
  return [...by.values()];
}

const storeKey = (id) => `${REVENANT_STORE_PREFIX}${id}`;
function ensureMirror(player) {
  const id = player ? characterIdOf(player) : null;
  if (!id || _state.mirrorId === id) return;
  let kept = [], keptDay = null;
  try { const raw = appStorage()?.getItem(storeKey(id)); if (raw) { const m = JSON.parse(raw); kept = m?.list ?? []; keptDay = sanitizeDay(m?.lastDay); } } catch { }
  const live = _state.list.map((r) => ({ id: r.id, out: r.out, outAt: r.outAt }));
  const saved = new Map(_state.list.filter((r) => !r.gone).map((r) => [r.id, r]));
  _state.list = mergeRevenants(_state.list, kept);
  _state.lastDay = laterDay(_state.lastDay, keptDay);
  for (const l of live) { const r = revenantById(l.id); if (r) { r.out = l.out; r.outAt = l.outAt; } }
  // A sworn pack, kit, errand, and anything taken are inventory, so the save's copy wins over the mirror's. The
  // mirror never hands back items the save already holds, nor brings back a piece the save never had.
  for (let i = 0; i < _state.list.length; i++) {
    const r = _state.list[i], s = saved.get(r.id);
    if (s?.sworn && s.companion?.items?.length && !r.sworn) { _state.list[i] = { ...s }; continue; }
    if (s?.sworn && gearItems(s.companion?.gear).length && !r.sworn) { _state.list[i] = { ...s }; continue; }
    if (s?.sworn && s.companion?.state === 'errand' && s.companion.errand && !r.sworn) { _state.list[i] = { ...s }; continue; }
    if (!r.gone && r.companion) r.companion.items = s?.companion?.items ? s.companion.items.slice() : [];
    if (!r.gone && r.companion) r.companion.gear = s?.companion?.gear ? { ...s.companion.gear } : {};
    if (!r.gone && r.companion) {
      const sc = s?.sworn ? s.companion : null;
      if (sc?.state === 'errand' && sc.errand) { r.companion.state = 'errand'; r.companion.errand = { ...sc.errand }; }
      else if (r.companion.state === 'errand') { r.companion.state = sc?.state === 'with' ? 'with' : 'away'; r.companion.errand = null; }
    }
    if (player && s?.took?.length && !s.defeated && !s.sworn && (r.gone || r.defeated || r.sworn)) { player.items ??= []; for (const it of s.took) addItem(player.items, it); if (!r.gone) r.took = []; continue; }
    if (r.gone) continue;
    r.took = s?.took ? s.took.slice() : [];
    const home = r.took.filter((it) => !revenantMayTake(it));
    if (home.length) { player.items ??= []; for (const it of home) { addItem(player.items, it); hudTextWhenShown(tookHomeLine(r, it)); } r.took = r.took.filter((it) => revenantMayTake(it)); }
  }
  _state.mirrorId = id;
}
function persist() {
  if (!_state.mirrorId) return;
  try { appStorage()?.setItem(storeKey(_state.mirrorId), JSON.stringify({ v: 1, list: _state.list, lastDay: _state.lastDay })); } catch { }
}
const touch = (r) => { r.rev = (r.rev | 0) + 1; };
function bury(r) {
  const i = _state.list.indexOf(r);
  if (i >= 0) _state.list[i] = /** @type {any} */ ({ id: r.id, rev: (r.rev | 0) + 1, gone: true });
}
function prune() {
  const fallen = _state.list.filter((r) => r.defeated && !r.gone).sort((a, b) => (b.defeatedAt ?? 0) - (a.defeatedAt ?? 0));
  for (const r of fallen.slice(REVENANT_FALLEN_MAX)) bury(r);
  const tombs = _state.list.filter((r) => r.gone);
  if (tombs.length > REVENANT_TOMBS_MAX) {
    const drop = new Set(tombs.slice(0, tombs.length - REVENANT_TOMBS_MAX));
    _state.list = _state.list.filter((r) => !drop.has(r));
  }
}
// Past the cap, the weakest and oldest hunter becomes a tombstone, never one now spawned or holding a piece.
function trimLiving(keep) {
  const living = huntingRevenants();
  if (living.length > REVENANT_MAX) {
    const drop = living.filter((x) => x !== keep && !x.out && !x.took?.length).sort((x, y) => x.rank - y.rank || x.born - y.born)[0];
    if (drop) bury(drop);
  }
}
const deed = (r, d, at, extra = null) => { r.history.push({ deed: d, at, ...(extra ?? {}) }); if (r.history.length > HISTORY_MAX) r.history.splice(0, r.history.length - HISTORY_MAX); };
const dueFrom = (now, rolls, r = null) => {
  const [lo, hi] = r && ambitionOf(r.personality) === 'vengeance' ? AMBITION.VENGEANCE_DUE : [REVENANT_RETURN_MIN_MINUTES, REVENANT_RETURN_MAX_MINUTES];
  return now + lo + Math.floor(rolls() * (hi - lo + 1));
};

export function revenantCandidate(entity, rec = null) {
  if (!entity || !revenantOn()) return false;
  if (revenantHeld()) return false;
  if (entity.retinueOf != null) return false;
  if (entity.wildFoe || entity.wildGiant) return false;
  if (entity.bout) return false;
  const special = !!entity.revenant || !!entity.eliteFoe || (typeof entity.champion === 'string' && !!entity.champion);
  if (!special) return false;
  if (!entity.revenant && (!isUnquiet(entity) || huntingRevenants().length >= REVENANT_MAX)) return false;
  if ((entity.level | 0) < REVENANT_MIN_LEVEL) return false;
  if (entity.mobileType === KNIGHT_CITY_WATCH || entity.team === 'PlayerAlly' || entity.mobileTeam === 'PlayerAlly') return false;
  if (rec && (rec.questBehaviour || rec.allied || rec.questMarker || rec.puppet || rec.riteRole)) return false;
  return true;
}
setUnquietGate((entity) => revenantOn() && !revenantHeld() && huntingRevenants().length < REVENANT_MAX
  && !!entity && !entity.revenant && entity.retinueOf == null && !entity.wildFoe && !entity.wildGiant && !entity.bout
  && (entity.level | 0) >= REVENANT_MIN_LEVEL && entity.mobileType !== KNIGHT_CITY_WATCH && entity.team !== 'PlayerAlly' && entity.mobileTeam !== 'PlayerAlly');

export function revenantDeed(player, entity, deedName, { mobileType = entity?.mobileType, gender = 'male', rec = null, archive = null, now = nowMinutes(), rolls = Math.random, ally = null, unbroken = false, slip = false } = {}) {
  if (revenantStale(entity)) return null;
  // A felling is no end: the enemy fights on, so it keeps its ledger for the deed that ends the fight.
  const ledger = deedName === 'felled' ? null : takeFeud(entity);
  ensureMirror(player);
  mendRevenantLairs();
  if (!revenantCandidate(entity, rec) || !Number.isInteger(mobileType)) return null;
  const pName = player?.name ?? '';
  let r = entity.revenant?.id ? revenantById(entity.revenant.id) : null;
  // A judged revenant does no deed, and a forgotten id is never worn again.
  if (r && (r.defeated || r.sworn)) return null;
  if (!r && entity.revenant?.id) entity.revenant = null;
  // A birth needs the mark and the cap, asked of the body itself, because a body wearing another's name passed the
  // candidate test as a revenant already.
  if (!r && (!isUnquiet(entity) || huntingRevenants().length >= REVENANT_MAX)) return null;
  let rankUp = false;
  const born = !r;
  if (r) {
    if (BLOOD_DEEDS.includes(deedName)) r.blood = (r.blood | 0) + 1;
    if (deedName === 'fled' && unbroken) r.tears = (r.tears | 0) + 1;
    rankUp = deedRanks(deedName, r.blood, { unbroken, tears: r.tears });
  } else {
    const id = voiceIdOf(entity);
    const given = revenantGivenName(id, mobileType, gender);
    r = {
      id, rev: 0, mobileType, gender: gender === 'female' ? 'female' : 'male', given,
      epithet: revenantEpithet(deedName, 1, pName, rolls, null, allyName(ally) ?? ''), name: '', rank: 1, kills: 0, escapes: 0, returns: 0,
      trait: typeof entity.champion === 'string' && entity.champion ? entity.champion : null, elite: !!entity.eliteFoe,
      born: now, dueAt: 0, out: false, outAt: 0, defeated: false, defeatedAt: null, notice: null, history: [],
      archive: Number.isInteger(archive) ? archive : null,
      personality: personalityFor(id, mobileType),
      fate: null, sworn: false, swornAt: null, companion: null,
      person: rec ? foeSeed(rec) : revenantPerson({ id }),
      ...newFeudFields(id, mobileType, 1, entity.career ?? null),
      wounds: [], blood: 0, tears: 0, dread: false, trail: 0, omen: 0, woundDay: -1,
    };
    _state.list.push(r);
  }
  // The lair is chosen before the rank, because the Dread goes to ground in it.
  const here = playerDoor()?.lairHere?.() ?? null;
  const den = deedName === 'fled' && !r.dread && here ? nearestLair(here.px, here.py, here.dungeons) : null;
  const lair = den ?? lairAfter(r, here);
  if (!sameLair(lair, r.lair)) { r.lair = lair; r.lairKnown = false; }
  let ascended = false;
  if (!born && rankUp) {
    r.blood = 0; r.tears = 0;
    if (r.rank < REVENANT_MAX_RANK) {
      r.rank += 1;
      r.epithet = revenantEpithet(deedName, r.rank, pName, rolls, r.epithet, allyName(ally) ?? '');
      if (r.rank >= SIG_RANK && !r.sig) r.sig = drawSignature(r.id, r.mobileType);
    } else if (deedName === 'fled' && !slip && mayAscend(r, REVENANT_MAX_RANK, livingRevenants().filter((x) => x.dread).length)) {
      r.dread = true; r.lairKnown = true; r.wrath = 0;
      r.epithet = REVENANT_EPITHETS.dread[0];
      ascended = true;
    }
  }
  r.name = joinName(r.given, r.epithet);
  if (deedName === 'slew') { r.kills++; r.notice = 'slew'; _lastSlew = { id: r.id, at: Date.now() }; } else if (deedName === 'fled') { r.escapes++; r.notice = null; }
  r.dueAt = dueFrom(now, rolls, r);
  deed(r, deedName, now, deedName === 'felled' && allyName(ally) ? { ally: allyName(ally) } : deedName === 'fled' && unbroken ? { unbroken: true } : null);
  if (ascended) deed(r, 'ascended', now);
  if (deedName === 'fled') { const w = woundOf(ledger?.last); if (w) { r.wounds = withWound(r.wounds, w); r.woundDay = Math.floor(now / MINUTES_PER_DAY); _newWounds.set(r.id, w); } else _newWounds.delete(r.id); }
  if (den && !r.dread) { r.trail = now + HUNT.MINUTES; r.lairKnown = true; }
  const kinds = feudScars(ledger, deedName);
  r.scars = withScars(r.scars, kinds, now);
  r.fights = (r.fights | 0) + 1;
  const lesson = lessonOf(kinds, r.learned, r.mobileType, entity.career ?? null);
  if (lesson) r.learned = withLesson(r.learned, lesson, r.rank);
  const p2 = entity.revenant?.p2 ?? null;
  const blows = entity.revenant?.blows ?? null;
  entity.revenant = revenantStamp(r);
  if (p2) entity.revenant.p2 = p2;
  if (blows) entity.revenant.blows = blows;
  computeEntityMods(entity);
  r.out = deedName === 'slew' || deedName === 'felled';
  r.outAt = r.out ? Date.now() : 0;
  bodyStood(r, r.out ? entity : null);
  touch(r);
  prune();
  persist();
  return r;
}

const _newWounds = new Map();
let _blowKiller = null;
let _deathCheck = false;
// The death is confirmed in a microtask after the hurt, so a death that Stendarr's mercy undoes makes no revenant.
function armDeathCheck(entity) {
  if (_deathCheck) return;
  _deathCheck = true;
  Promise.resolve().then(() => {
    _deathCheck = false;
    const killer = _blowKiller ?? playerHarmMark();
    _blowKiller = null;
    if (!(entity.health <= 0) || !killer || killer.isPlayer || !(killer.health > 0)) return;
    const rec = playerDoor()?.foes?.()?.find((x) => x?.entity === killer) ?? null;
    if (rec && (rec.yielded || rec.executing || rec.sparing)) return;
    clearPlayerHarm();
    revenantDeed(entity, killer, 'slew', { mobileType: rec?.mobileType ?? killer.mobileType, gender: rec?.gender ?? 'male', rec, archive: rec?.archive ?? rec?.mobileArchive ?? null });
  });
}
function onBlowLanded(entity, attacker) {
  if (!entity?.isPlayer || entity.peer || !(entity.health <= 0) || !attacker || attacker.isPlayer) return;
  _blowKiller = attacker;
  armDeathCheck(entity);
}
function onPlayerHurt(entity, { after } = /** @type {any} */ ({})) {
  if (!entity?.isPlayer || entity.peer) return;
  if (after <= 0) endPlayerFights(); else if (after < (entity.maxHealth || 1) * ROUT.LOW) markPlayerLow();
  if (!(after <= 0)) return;
  armDeathCheck(entity);
}
registerPlayerBlowLanded('revenant', onBlowLanded);
registerPlayerHurtListener('revenant', onPlayerHurt);
registerPlayerStruckListener('revenant', (attacker, target) => {
  if (target?.isPlayer && !target.peer && attacker && !attacker.isPlayer) markPlayerHarm(attacker, { ms: HARM_MARK_STRUCK_MS });
});
setFeudGate((entity) => revenantCandidate(entity));
setFeudClock(() => ({ now: nowMinutes(), night: skyIsNight() }));
registerPlayerStrikeListener('feud', (attacker, target, damage, weapon, info) => {
  const { cls, silver } = weaponFeudClass(weapon);
  noteFeudHarm(target, cls, damage, { silver, metal: metalOf(weapon) });
  if (info?.backstab) noteFeudBackstab(target);
});
setFeudWeakTest((entity, { cls = null, metal = null, kind = 'melee', weapon = null, element = null, attacker = null } = {}) => {
  const weak = entity?.revenant?.weak;
  if (!weak) return false;
  const c = cls ?? (kind === 'spell' ? (element != null ? elementFeudClass(element) : null) : adaptBlowClass(attacker, weapon, kind));
  return isWeakBlow(weak, c, metal ?? metalOf(weapon), skyIsDay());
}, revealWeakness);
function revealWeakness(entity, { peer = false } = {}) {
  if (!peer) Promise.resolve().then(() => { try { tagHit(entity, HIT_TAGS.weakness); } catch { } });
  if (entity._weakTold) return;
  entity._weakTold = true;
  const door = playerDoor();
  const at = door?.foes?.()?.find((f) => f?.entity === entity)?.ai?.feet ?? null;
  if (at) { try { door?.sfx?.(SOUND.Burning, at); } catch { } }
  const r = entity.revenant?.id ? revenantById(entity.revenant.id) : null;
  if (!r || r.weakKnown >= 2) return;
  r.weakKnown = 2;
  touch(r);
  persist();
  sayRevenant(revenantWeaknessEvent(r, { found: true }), (l) => door?.say?.(l));
}
registerBlowTakenMod('revenant', (attacker, target, weapon, info) => {
  const edge = target?.revenant?.edge;
  if (!edge) return 1;
  if (edge.weak === 'daylight') { if (skyIsDay()) return WEAK.DAYLIGHT; }
  // A blow of its weakness takes the weakness multiplier ahead of every adaptation.
  else if (info?.kind !== 'spell' && feudWeakBlow(target, { kind: info?.kind ?? 'melee', weapon, attacker })) return WEAK.STRUCK;
  if (info?.kind === 'spell') return 1;
  return edge.taken[adaptBlowClass(attacker, weapon, info?.kind)] ?? 1;
});
registerEntityFold('revenant', (entity) => {
  const edge = entity?.revenant?.edge;
  const weakEl = edge && WEAKNESS_ELEMENTS.includes(edge.weak) ? edge.weak : null;
  if (!edge || (!Object.keys(edge.resist).length && !weakEl)) return EMPTY_MODS;
  const m = newMods();
  Object.assign(m.resist, edge.resist);
  if (weakEl) m.resist[weakEl] = (m.resist[weakEl] ?? 0) + WEAK.RESIST;
  return m;
});
registerSilverDoubleVeto('revenant', (target) => target?.revenant?.edge?.silverScarred === true);

const youngRevenant = (entity) => !!entity?.revenant && !willMatters(entity.revenant.rank);
export function rollRevenantFlee(entity, rolls = Math.random) {
  if (!revenantCandidate(entity) || entity.revenant?.dread) return false;
  return rolls() < (!entity.revenant ? REVENANT_FLEE_CHANCE : youngRevenant(entity) ? REVENANT_FLEE_CHANCE_YOUNG : REVENANT_FLEE_CHANCE_REVENANT);
}
export const revenantFleeHealth = (entity) => !!entity && entity.health > 0 && entity.health < (entity.maxHealth || 1) * (!entity.revenant || youngRevenant(entity) ? REVENANT_FLEE_HEALTH_YOUNG : REVENANT_FLEE_HEALTH);

export function revenantFleeStep(f, feet, { onMe = () => true, mayRun = true, rolls = Math.random, now = Date.now(), dt = null } = {}) {
  if (f.fleeing) {
    // A flight that can no longer make a revenant turns and fights, because its escape would only take away a kill.
    if (!revenantCandidate(f.entity, f)) { f.fleeing = false; if (f.ai) f.ai.fleeLeft = 0; endCraft(f); return 'cornered'; }
    if (f._craft) {
      const v = craftStep(f, now, dt);
      if (v === 'gone') { if (f.ai) f.ai.fleeLeft = 0; return 'escape'; }
      if (v === 'broken') { f.fleeing = false; if (f.ai) f.ai.fleeLeft = 0; return 'cornered'; }
      if (f._craft.kind === 'run' && f.ai) f.ai.fleePace = REVENANT_FLEE_PACE;
      if (f._craft.kind === 'sink' || (f._craft.kind === 'blink' && f._craft.fired)) return 'run';
    }
    const d = Math.hypot(feet[0] - f.ai.feet[0], feet[2] - f.ai.feet[2]);
    if (d > REVENANT_ESCAPE_DISTANCE) return 'escape';
    if (f.ai.fleeLeft > 0) return 'run';
    if (d > REVENANT_ESCAPE_NEAR) return 'escape';
    f.fleeing = false;
    return 'cornered';
  }
  // mayRun is false for a shared room enemy: vanishing on one client would leave it standing on the rest.
  if (!mayRun || f._fleeRolled || !f.ai?.isHostile || !revenantFleeHealth(f.entity) || !onMe() || !revenantCandidate(f.entity, f)) return null;
  f._fleeRolled = true;
  if (!rollRevenantFlee(f.entity, rolls)) return null;
  f.fleeing = true;
  const craft = f.entity.revenant ? revenantCraft(f.entity.mobileType ?? f.mobileType, f.entity.revenant.rank) : null;
  f.ai.flee(feet, REVENANT_FLEE_SECONDS, f.entity.revenant ? craftPace(craft, REVENANT_FLEE_PACE) : REVENANT_FLEE_PACE_MARKED);
  if (craft) beginCraft(f, craft, { now });
  return 'start';
}

export function revenantSlain(player, entity, { now = nowMinutes(), deedName = 'fell' } = {}) {
  const id = entity?.revenant?.id;
  if (!id || revenantStale(entity)) return null;
  ensureMirror(player);
  const r = revenantById(id);
  if (!r || r.defeated || r.sworn) return null;
  r.defeated = true; r.defeatedAt = now; r.out = false; r.notice = null;
  _bodies.delete(r.id); _claims.delete(r.id);
  if (entity._tookCarried) r.took = [];
  deed(r, deedName, now);
  touch(r);
  prune();
  persist();
  return r;
}

export function revenantYielded(player, entity, { now = nowMinutes() } = {}) {
  const r = entity?.revenant?.id && !revenantStale(entity) ? (ensureMirror(player), revenantById(entity.revenant.id)) : null;
  if (!r || r.defeated || r.sworn) return null;
  deed(r, 'yielded', now);
  touch(r);
  persist();
  return r;
}
export function revenantExecuted(player, entity, { now = nowMinutes() } = {}) {
  const r = revenantSlain(player, entity, { now, deedName: 'executed' });
  if (r) { r.fate = 'executed'; touch(r); persist(); }
  return r;
}
export function revenantSpared(player, entity, { now = nowMinutes(), state = 'with', health = null, maxHealth = null } = {}) {
  const r = entity?.revenant?.id && !revenantStale(entity) ? (ensureMirror(player), revenantById(entity.revenant.id)) : null;
  if (!r || r.defeated || r.sworn) return null;
  r.sworn = true; r.fate = 'sworn'; r.swornAt = now; r.out = false; r.notice = null;
  r.dread = false;
  r.companion = sanitizeCompanion({ state, health, maxHealth }, r.personality, r.rank);
  deed(r, 'spared', now);
  touch(r);
  persist();
  return r;
}
export function revenantCompanionUpdate(player, id, change) {
  ensureMirror(player);
  const r = revenantById(id);
  if (!r || !r.sworn || r.defeated) return null;
  r.companion ??= sanitizeCompanion(null, r.personality, r.rank);
  const out = change(r.companion, r);
  if (out === 'release') {
    r.sworn = false; r.fate = 'released'; r.defeated = true; r.defeatedAt = nowMinutes(); r.companion = null;
    deed(r, 'released', nowMinutes());
  }
  touch(r);
  prune();
  persist();
  return r;
}
export const revenantRecord = (player, id) => { ensureMirror(player); return revenantById(id); };

// One revenant, one body: any body other than the latest one is stale, and its pool withdraws it. A body once
// left stays left. Bodies are this session's only; a load spawns none.
const _bodies = new Map();
let _left = new WeakSet();
const _claims = new Map();
function bodyStood(r, entity) {
  if (!r?.id) return;
  const was = _bodies.get(r.id);
  if (was && entity && was !== entity) _left.add(was);
  if (entity) { _bodies.set(r.id, entity); _left.delete(entity); } else _bodies.delete(r.id);
  _claims.delete(r.id);
}
function forgetBodies() { _bodies.clear(); _claims.clear(); _left = new WeakSet(); }
function claim(r, wall = Date.now()) {
  if (!_claims.has(r.id)) _claims.set(r.id, { out: !!r.out, outAt: r.outAt || 0 });
  r.out = true;
  r.outAt = wall;
}
export function revenantStale(entity) {
  const s = entity?.revenant;
  return !!s?.id && !s.sworn && _left.has(entity);
}
function goesHome(r, wall, foes) {
  const b = _bodies.get(r.id) ?? null;
  if (_claims.has(r.id) || !b) return wall - (r.outAt || 0) >= REVENANT_STAND_GRACE_MS;
  if ((foes ?? []).some((f) => f && !f.dead && f.entity === b)) return false;
  if (harmFightSince(b, wall) != null || feudOf(b, false)) return false;
  return r.history?.[r.history.length - 1]?.deed !== 'yielded';
}

export function revenantToReturn(player, { now = nowMinutes(), rolls = Math.random } = {}) {
  if (!revenantOn() || wildHere()) return null;
  if (revenantHeld()) return null;
  ensureMirror(player);
  const living = livingRevenants();
  if (living.some((r) => r.out)) return null;
  const night = skyIsNight();
  const due = living.filter((r) => !r.dread && r.dueAt <= now && (night || !(r.learned ?? []).includes('nightStalker'))).sort((a, b) => b.rank - a.rank || a.dueAt - b.dueAt);
  if (!due.length || rolls() >= (ambitionOf(due[0].personality) === 'vengeance' ? AMBITION.VENGEANCE_RETURN : REVENANT_RETURN_CHANCE)) return null;
  // Claimed now, so the next roll cannot spawn it twice while its body loads.
  claim(due[0]);
  return due[0];
}
let _lastSlew = null;
export function forgetLastSlew() { _lastSlew = null; }
// Never a letter of credit (its value is gold), a vehicle, a deed, ship parts, or a realm-locked copy. What it takes
// stays with its record, which the checkpoint ledger never reads.
export const revenantMayTake = (item) => !!item && typeof item === 'object' && Number.isInteger(item.templateIndex) && !isLetterOfCredit(item)
  && !WILD_NEVER_GROUPS.has(item.group) && !DECOR_OWN_KEPT_BACK.has(item.templateIndex) && !BOAT_TEMPLATES.includes(item.templateIndex)
  && !isRealmLocked(item)
  && !item.questItem && !isSummoned(item) && !isGoldPieces(item) && !isBagItem(item) && !isPackOnly(item) && !isLocked(item);
export const takenName = (item) => String(itemLongName(item) ?? '').replace(/^the\s+/i, '');
export const tookHomeLine = (r, item) => t('rvn.took.home', '{name} could not keep your {item}. It is back in your pack.', { name: r?.name ?? '', item: takenName(item) });
export function pickTaken(id, kills, weapon, items) {
  const pack = (Array.isArray(items) ? items : []).filter((it) => it !== weapon && revenantMayTake(it)).sort((a, b) => itemValueOf(b) - itemValueOf(a)).slice(0, 5);
  const pool = [...(revenantMayTake(weapon) ? [weapon] : []), ...pack];
  if (!pool.length) return null;
  return pool[Math.min(pool.length - 1, Math.floor(idStream(id, `took:${kills | 0}`)() * pool.length))];
}
export function revenantTakes(player, { online = false } = {}) {
  const s = _lastSlew;
  _lastSlew = null;
  // Online only: offline a death ends the run with nothing saved, and the mirror outlives the save, so a taken piece
  // would come back twice.
  if (!online || !s || !revenantOn() || !player) return null;
  const r = revenantById(s.id);
  if (!r || r.defeated || r.sworn) return null;
  if ((r.took?.length ?? 0) >= TOOK_MAX) return { r, item: null, line: null };
  const weapon = equipTableOf(player)[EQUIP_SLOTS.RightHand] ?? null;
  const item = pickTaken(r.id, r.kills, weapon, player.items);
  if (!item) return null;
  unequipItem(player, item);
  const i = (player.items ?? []).indexOf(item);
  if (i >= 0) player.items.splice(i, 1);
  r.took = [...(r.took ?? []), item];
  const body = playerDoor()?.foes?.()?.find((f) => !f?.dead && f?.entity?.revenant?.id === r.id)?.entity ?? null;
  if (body) carryTaken(body);
  touch(r);
  persist();
  return { r, item, line: `${r.name} took your ${takenName(item)}.` };
}
export function revenantHandBack(player, r, entity = null) {
  const back = r?.took?.length ? r.took.slice() : [];
  if (!back.length || !player) return [];
  player.items = player.items ?? [];
  for (const it of back) {
    if (entity?.items) { const i = entity.items.indexOf(it); if (i >= 0) entity.items.splice(i, 1); }
    player.items.push(it);
  }
  r.took = [];
  touch(r);
  persist();
  return back;
}
export function revenantForLair(player, here, { now = nowMinutes(), dueOnly = false, foes = [] } = {}) {
  if (revenantHeld()) return null;
  if (!revenantOn() || wildHere() || !here || !Number.isInteger(here.px) || !Number.isInteger(here.py)) return null;
  ensureMirror(player);
  const wall = Date.now();
  const r = livingRevenants().filter((x) => (!x.out || goesHome(x, wall, foes)) && x.lair && x.lair.px === here.px && x.lair.py === here.py && (x.dread || x.dueAt <= now || (!dueOnly && x.lairKnown)))
    .sort((a, b) => b.rank - a.rank || a.dueAt - b.dueAt)[0] ?? null;
  if (!r) return null;
  claim(r, wall);
  return r;
}
export function releaseRevenantStand(r) {
  if (!r || !r.out || r.defeated || r.gone) return;
  const was = _claims.get(r.id) ?? null;
  _claims.delete(r.id);
  if (was?.out) { r.outAt = was.outAt; return; }
  r.out = false; r.outAt = 0;
}
export function revenantSpawnOptions(r, playerLevel) {
  return { revenant: r, gender: isClassEnemyId(r.mobileType) ? r.gender : null, level: isClassEnemyId(r.mobileType) ? Math.max(1, (playerLevel | 0) + r.rank * REVENANT_LEVEL_PER_RANK) : null };
}
export function applyRevenant(entity, r, { now = nowMinutes(), turned = false } = {}) {
  if (!entity || !r) return false;
  entity.revenant = revenantStamp(r);
  entity.maxHealth = Math.max(1, Math.round((entity.maxHealth || 1) * (1 + REVENANT_HEALTH_PER_RANK * r.rank)));
  entity.health = entity.maxHealth;
  entity.healthMult = (entity.healthMult ?? 1) * (1 + REVENANT_HEALTH_PER_RANK * r.rank);
  const prior = Number.isFinite(entity.damageScale) && entity.damageScale > 0 ? entity.damageScale : 1;
  entity.damageScale = prior * (1 + REVENANT_DAMAGE_PER_RANK * r.rank);
  const wrath = Math.max(0, Math.min(WRATH_MAX, r.wrath | 0));
  if (wrath) {
    entity.maxHealth = Math.max(1, Math.round(entity.maxHealth * (1 + FESTER.HEALTH * wrath)));
    entity.health = entity.maxHealth;
    entity.healthMult *= 1 + FESTER.HEALTH * wrath;
    entity.damageScale *= 1 + FESTER.BLOWS * wrath;
  }
  r.wrath = 0;
  const wnd = woundEffects(r.wounds);
  const hm = wnd.health * (r.dread ? DREAD.HEALTH : 1);
  if (hm !== 1) {
    entity.maxHealth = Math.max(1, Math.round(entity.maxHealth * hm));
    entity.health = entity.maxHealth;
    entity.healthMult *= hm;
  }
  if (wnd.blows !== 1) entity.damageScale *= wnd.blows;
  if (wnd.speed && entity.stats) entity.stats.speed = Math.max(0, (entity.stats.speed ?? 0) + wnd.speed);
  const daysPast = Math.floor((now - (Number.isFinite(r.dueAt) ? r.dueAt : now)) / MINUTES_PER_DAY);
  entity.revenant.hoard = hoardOf(r.dread, ambitionOf(r.personality) === 'plunder' ? plunderGold(daysPast) : 1);
  const edge = entity.revenant.edge;
  if (edge.relentless && entity.stats) entity.stats.speed = (entity.stats.speed ?? 0) + ADAPT.RELENTLESS_SPEED;
  if (edge.nightStalker && skyIsNight()) entity.damageScale *= ADAPT.NIGHT_BLOWS;
  entity.revenant.blows = entity.damageScale / prior;
  computeEntityMods(entity);
  if (trailWarm(r, now)) entity.health = Math.max(1, Math.round(entity.maxHealth * HUNT.HEALTH));
  r.trail = 0;
  r.out = true; r.outAt = Date.now();
  bodyStood(r, entity);
  r.fights = (r.fights | 0) + 1;
  if (!turned) { r.returns++; deed(r, 'returned', now); }
  touch(r);
  persist();
  return true;
}
export function revenantPresence(foes, { now = nowMinutes(), wall = Date.now() } = {}) {
  let changed = false;
  let pools = null;
  for (const r of _state.list) {
    if (!r.out || r.defeated || r.gone || r.sworn || wall - r.outAt < REVENANT_STAND_GRACE_MS) continue;
    pools ??= [...(foes ?? []), ...(playerDoor()?.foes?.() ?? [])];
    const here = pools.some((f) => f && !f.dead && f.entity?.revenant?.id === r.id && !revenantStale(f.entity));
    if (here) continue;
    r.out = false;
    const foretold = r.omen === r.dueAt;
    r.dueAt = Math.max(r.dueAt, now + REVENANT_LOST_MINUTES);
    if (foretold) r.omen = r.dueAt;
    touch(r);
    changed = true;
  }
  if (changed) persist();
  return changed;
}

export function revenantLoot(level = 1, rank = 1, rolls = Math.random, goldMult = 1) {
  const lv = Math.max(1, level | 0), rk = Math.max(1, Math.min(REVENANT_MAX_RANK, rank | 0));
  const out = [];
  const L = REVENANT_LOOT;
  if (rolls() < L.magicChance) { const it = tieredGear(lv, 'magic', rolls); if (it) out.push(it); }
  if (rk >= L.rareFromRank || rolls() < L.rareChance + L.rarePerRank * rk) { const it = tieredGear(lv, 'rare', rolls); if (it) out.push(it); }
  const at = rollerLevel() ?? lv;
  if (rolls() < (L.legendaryChance + L.legendaryPerRank * rk) * (at == null ? 1 : legendaryGate(at))) { const it = tieredGear(lv, 'legendary', rolls); if (it) out.push(it); }
  const [lo, hi] = L.goldPerLevel;
  out.push(goldStack(Math.round(lv * rk * (lo + rolls() * (hi - lo)) * (goldMult > 0 ? goldMult : 1))));
  return out;
}
export function grantRevenantLoot(entity, level, rolls = Math.random, { goldMult = 1 } = {}) {
  if (!entity?.revenant || entity._revenantLoot) return;
  entity._revenantLoot = true;
  entity.items = entity.items ?? [];
  const hoard = Number.isFinite(entity.revenant.hoard) && entity.revenant.hoard > 0 ? entity.revenant.hoard : 1;
  entity.items.push(...revenantLoot(level ?? entity.level, entity.revenant.rank ?? 1, rolls, goldMult * hoard));
  carryTaken(entity);
}
function carryTaken(entity) {
  const r = entity?.revenant?.id ? revenantById(entity.revenant.id) : null;
  if (!r?.took?.length) return;
  entity.items = entity.items ?? [];
  for (const it of r.took) if (!entity.items.includes(it)) entity.items.push(it);
  entity._tookCarried = true;
}

const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const TAUNT_DEEDS = new Set(['slew', 'fled', 'felled', 'routed', 'festered']);
export function tauntMoment(r) {
  const hist = [...(r?.history ?? [])].reverse();
  const oath = hist.findIndex((d) => d.deed === 'spared');
  const since = oath >= 0 ? hist.slice(0, oath) : hist;
  const last = since.find((d) => TAUNT_DEEDS.has(d.deed));
  const left = oath >= 0 ? since.find((d) => d.deed === 'deserted' || d.deed === 'betrayed') : null;
  if (!last && left) return { event: left.deed, vars: {} };
  if (last?.deed === 'felled' && last.ally) return { event: 'felled_return', vars: { ally: last.ally } };
  if (last?.deed === 'routed') return { event: 'routed_return', vars: {} };
  if (last?.deed === 'festered') return { event: 'festered', vars: {} };
  if (last?.deed === 'slew' && r.took?.length) return { event: 'stole', vars: { item: takenName(r.took[r.took.length - 1]) } };
  const how = ADAPT_HOW[r?.learned?.[r.learned.length - 1]];
  if (how && (r.returns | 0) % 2 === 1) return { event: 'learned', vars: { how } };
  const lastSF = since.find((d) => d.deed === 'slew' || d.deed === 'fled')?.deed ?? 'slew';
  return { event: r.rank >= 3 && (r.kills | 0) >= 2 ? 'taunt_risen' : lastSF === 'fled' ? 'taunt_fled' : 'taunt_slew', vars: {} };
}
function tauntParts(r, playerName, rolls) {
  const m = tauntMoment(r);
  return { ...voiceParts(r, m.event, playerName, rolls, m.vars), moment: m.event };
}
function voiceParts(r, event, playerName, rolls = Math.random, vars = {}) {
  const personality = isPersonality(r.personality) ? r.personality : personalityFor(r.id, r.mobileType);
  if (!revenantSpeaks(r.mobileType)) {
    const body = beastBody(personality, event, r.mobileType);
    return { speech: null, body, line: `${r.name} ${body.charAt(0).toLowerCase()}${body.slice(1)}` };
  }
  const speech = voiceLine(personality, event, { p: firstWord(playerName), rolls, ...vars });
  return { speech, body: null, line: speech ? `${r.name}: "${speech}"` : r.name };
}
export function revenantTaunt(r, playerName, rolls = Math.random) {
  return r ? tauntParts(r, playerName, rolls).line : null;
}
export function revenantFleeLine(entity, base, rolls = Math.random) {
  const n = entity?.revenant?.name ?? base;
  if (!revenantSpeaks(entity?.mobileType)) return `${n} breaks and runs!`;
  return `${n} breaks and runs! "${voiceLine(personalityOfLive(entity), 'flee', { rolls })}"`;
}
const personalityOfLive = (entity) => {
  const r = entity?.revenant?.id ? revenantById(entity.revenant.id) : null;
  return r?.personality ?? personalityFor(voiceIdOf(entity), entity?.mobileType);
};
export const revenantEscapeLine = (r) => t('rvn.unq.escapeLine', '{given} got away. {name} will remember this.', { given: r.given, name: r.name });
export const revenantSlainLine = (r) => `${r.name} has fallen. Your revenant is no more.`;
export function revenantRiseLine(r) {
  const kind = enemyDisplayName(r.mobileType) ?? 'foe';
  return r.kills > 1
    ? `${r.name} has killed you ${r.kills} times. It grows stronger.`
    : `The ${kind} that killed you lives on as ${r.name}. It will come for you again.`;
}

const ROMAN = Object.freeze(['', 'I', 'II', 'III', 'IV', 'V']);
export const revenantRankNumeral = (rank) => ROMAN[Math.max(0, Math.min(REVENANT_MAX_RANK, rank | 0))];
export function revenantPortrait({ mobileType, gender = 'male', archive = null } = /** @type {any} */ ({})) {
  const b = ENEMY_BASICS[mobileType];
  const a = Number.isInteger(archive) ? archive : (b ? (gender === 'female' && b.femaleTexture ? b.femaleTexture : b.maleTexture) : null);
  if (!Number.isInteger(a)) return null;
  return { archive: a, record: b?.hasIdle ? 15 : 0 };
}
const KICKERS = Object.freeze({
  taunt: 'Revenant', flee: 'Fleeing', cornered: 'Cornered', escape: 'Escaped', slain: 'Revenant slain', rise: 'A revenant rises',
  yield: 'Yields', executed: 'Executed', spared: 'Sworn to you', slip: 'Slipped away',
  arrive: 'Companion', dismiss: 'Sent away', downed: 'Companion down', kill: 'Companion', battle: 'Companion', release: 'Released',
  weakness: 'Weakness', unbroken: 'Unbroken', laststand: 'Last stand',
  signature: 'Signature', lair: 'Its lair', festered: 'Grows bolder',
  felled: 'Felled', routed: 'Routed',
  warn: 'Companion', deserted: 'Oathbreaker',
  betrayed: 'Betrayed', stole: 'It took',
  get errand() { return t('rvn.kicker.errand', 'Mission'); }, get errand_back() { return t('rvn.kicker.errandBack', 'Returned'); }, get art() { return t('rvn.kicker.art', 'Art'); },
  get ascended() { return t('rvn.kicker.ascended', 'The Dread'); },
  get omen() { return t('rvn.kicker.omen', 'An omen'); },
  get trained() { return t('rvn.kicker.trained', 'Trained'); },
});
/** @typedef {{ kind: string, kicker: string, id: string|null, name: string, rank: number, sub: string, mood: string|null,
 *   portrait: { archive: number, record: number } | null, speech: string|null, body: string|null, line: string }} RevenantEvent */
/** @returns {RevenantEvent} */
export function revenantEvent(kind, src, { speech = null, body = null, line = '', archive = null } = /** @type {any} */ ({})) {
  const r = src ?? {};
  const kindName = enemyDisplayName(r.mobileType) ?? '';
  const trait = typeof r.trait === 'string' && r.trait ? capFirst(r.trait) : null;
  return {
    kind, kicker: KICKERS[kind] ?? 'Revenant', id: r.id ?? null, name: r.name || kindName, rank: r.rank | 0,
    sub: [kindName, trait, r.elite ? 'Elite' : null].filter(Boolean).join(' · '),
    mood: personalityLabel(r.personality) ?? (r.id || r.mobileType != null ? personalityLabel(personalityFor(r.id, r.mobileType)) : null),
    portrait: revenantPortrait({ mobileType: r.mobileType, gender: r.gender, archive: archive ?? r.archive }),
    speech, body, line,
  };
}
function liveSource(entity, base, gender) {
  const r = entity?.revenant?.id ? revenantById(entity.revenant.id) : null;
  if (r) return r;
  return { id: null, name: entity?.revenant?.name ?? base, rank: entity?.revenant?.rank ?? 0, mobileType: entity?.mobileType, gender,
    trait: typeof entity?.champion === 'string' ? entity.champion : null, elite: !!entity?.eliteFoe,
    personality: personalityOfLive(entity) };
}
export function revenantTauntEvent(r, playerName, { rolls = Math.random, archive = null } = {}) {
  const t = tauntParts(r, playerName, rolls);
  return revenantEvent(t.moment === 'stole' ? 'stole' : 'taunt', r, { speech: t.speech, body: t.body, line: t.line, archive });
}
export function revenantFleeEvent(entity, base, { gender = 'male', archive = null, rolls = Math.random, playerName = '' } = {}) {
  const src = liveSource(entity, base, gender);
  const v = voiceParts(src, 'flee', src.id ? playerName : '', rolls);
  const craft = entity?._craft ? craftFleeWords(entity._craft, /** @type {any} */ (src).given ?? src.name) : null;
  if (craft) return revenantEvent('flee', src, { speech: v.speech, body: craft, line: v.speech ? `${craft} "${v.speech}"` : craft, archive });
  return revenantEvent('flee', src, { speech: v.speech, body: v.speech ? null : v.body, line: v.speech ? `${src.name} breaks and runs! "${v.speech}"` : v.line, archive });
}
export function revenantCorneredEvent(entity, base, { gender = 'male', archive = null, rolls = Math.random, playerName = '' } = {}) {
  const src = liveSource(entity, base, gender);
  const v = voiceParts(src, 'cornered', src.id ? playerName : '', rolls);
  return revenantEvent('cornered', src, {
    speech: v.speech, body: v.speech ? 'Cornered, it turns to fight.' : v.body,
    line: v.speech ? `${src.name} is cornered and turns to fight! "${v.speech}"` : v.line, archive,
  });
}
export const revenantAscended = (r) => !!r?.dread && r.history?.at(-1)?.deed === 'ascended';
export function revenantEscapeTail(r) {
  const w = woundWords(_newWounds.get(r?.id));
  _newWounds.delete(r?.id);
  const marked = w ? ` ${t('rvn.unq.escapeWound', 'It bears the wound you left: {wound}.', { wound: w.name })}` : '';
  const trail = r?.history?.at(-1)?.deed === 'fled' && trailWarm(r, nowMinutes()) && r.lair ? ` ${trailWords(r.lair.name)}` : '';
  return `${marked}${trail}`;
}
export function revenantEscapeEvent(r, playerName, { rolls = Math.random, archive = null } = {}) {
  const speech = voiceParts(r, 'escape', playerName, rolls).speech;
  if (revenantAscended(r)) {
    const body = t('rvn.unq.ascended', '{given} will run no more. It is the Dread now, and waits for you in {lair}.', { given: r.given, lair: r.lair?.name ?? '' });
    _newWounds.delete(r.id);
    return revenantEvent('ascended', r, { speech, body, line: body, archive });
  }
  const tail = revenantEscapeTail(r);
  return revenantEvent('escape', r, {
    speech,
    body: `${r.rank > 1 ? t('rvn.unq.escapeRank', 'Got away and rose to rank {rank}. It will remember this.', { rank: revenantRankNumeral(r.rank) }) : t('rvn.unq.escape', 'Got away. It will remember this.')}${tail}`,
    line: `${revenantEscapeLine(r)}${tail}`, archive,
  });
}
export function revenantWeaknessEvent(r, { found = false, archive = null } = {}) {
  const name = WEAK_NAMES[r?.weak] ?? 'Something';
  const body = found ? `Its weakness laid bare: ${name}.` : (FLINCH_LINES[r?.weak] ?? 'It shies from something.');
  return revenantEvent('weakness', r, { body, line: `${r.name}: ${body}`, archive });
}
export function revenantUnbrokenEvent(r, playerName, { rolls = Math.random, archive = null } = {}) {
  if (revenantAscended(r)) return revenantEscapeEvent(r, playerName, { rolls, archive });
  const tail = revenantEscapeTail(r);
  const body = `${t('rvn.unq.unbroken', '{given} staggers into the smoke, unbroken.', { given: r.given })}${tail}`;
  return revenantEvent('unbroken', r, { speech: voiceParts(r, 'escape', playerName, rolls).speech, body, line: body, archive });
}
export function revenantSignatureEvent(r, noun, { archive = null, playerName = '', rolls = Math.random } = {}) {
  const body = `${r.given} readies ${noun ?? 'its signature'}!`;
  const v = voiceParts(r, 'signature', playerName, rolls, { move: noun ?? null });
  return revenantEvent('signature', r, { speech: v.speech, body, line: v.speech ? `${body} "${v.speech}"` : body, archive });
}
export function revenantRumor(here, session, { rolls = Math.random } = {}) {
  if (revenantHeld()) return null;
  if (!revenantOn() || !here || !session || !Number.isInteger(here.px) || !Number.isInteger(here.py)) return null;
  if (!((session.numAnswersGivenTellMeAboutOrRumors | 0) < MAX_ANSWERS_TELL_ME_ABOUT_OR_RUMORS || session.isSpyMaster)) return null;
  mendRevenantLairs();
  const inRegion = (r) => Number.isInteger(here.region) && here.region >= 0 && r.lair.region === here.region;
  const near = livingRevenants().filter((r) => r.lair && (r.dread || inRegion(r) || Math.hypot(r.lair.px - here.px, r.lair.py - here.py) <= RUMOR_PX));
  if (!near.length || !(rolls() < RUMOR_CHANCE)) return null;
  const r = near[Math.min(near.length - 1, Math.floor(rolls() * near.length))];
  const dx = r.lair.px - here.px, dy = r.lair.py - here.py, d = Math.max(Math.abs(dx), Math.abs(dy));
  const kind = String(enemyDisplayName(r.mobileType) ?? 'creature').toLowerCase();
  const what = r.scars?.length ? `a scarred ${kind}` : `${/^[aeiou]/.test(kind) ? 'an' : 'a'} ${kind}`;
  const where = d === 0 ? `in ${r.lair.name}, close by` : `near ${r.lair.name}, ${distanceWord(d)} to the ${compassWord(dx, dy)}`;
  let words = r.dread
    ? t('rvn.unq.rumor.dread', 'They say {name} has gone to ground in {lair}, and that nobody who goes in comes out.', { name: r.name, lair: r.lair.name })
    : `They say ${what} called ${r.name} has been seen ${where}. ${ambitionRumor(ambitionOf(r.personality))}`.trim();
  if (r.weak && rolls() < RUMOR_WEAK) {
    const named = rolls() < RUMOR_NAMED;
    r.weakKnown = /** @type {0|1|2} */ (Math.max(r.weakKnown | 0, named ? 2 : 1));
    words += named ? ` Folk say it can't abide ${String(WEAK_NAMES[r.weak] ?? r.weak).toLowerCase()}.` : ` Folk say ${RUMOR_HINTS[weaknessKind(r.weak)] ?? 'something hurts it more than the rest'}.`;
  }
  r.lairKnown = true;
  session.numAnswersGivenTellMeAboutOrRumors = (session.numAnswersGivenTellMeAboutOrRumors | 0) + 1;
  touch(r);
  persist();
  return words;
}
let _lairsAsked = new WeakMap();
// Never before the mirror is read in, because its newer copy would put the moved lair back for the session.
export function mendRevenantLairs(door = playerDoor()) {
  if (!_state.mirrorId) return 0;
  let moved = 0;
  for (const r of livingRevenants()) {
    if (!r.lair) continue;
    const key = `${r.lair.px},${r.lair.py}`;
    if (_lairsAsked.get(r) === key) continue;
    let at = null;
    try { at = door?.lairHere?.({ x: r.lair.px, y: r.lair.py }) ?? null; } catch { at = null; }
    if (typeof at?.enterable !== 'function') continue;
    _lairsAsked.set(r, key);
    if (at.enterable(r.lair.px, r.lair.py) !== false) continue;
    const next = typeof at.nearest === 'function' ? at.nearest(r.lair.px, r.lair.py) : nearestLair(r.lair.px, r.lair.py, at.dungeons);
    if (!next && r.dread) continue;
    r.lair = next;
    if (!r.lair) { r.lairKnown = false; r.trail = 0; }
    touch(r);
    moved++;
  }
  if (moved) persist();
  return moved;
}
export function revenantMapMarks() {
  if (revenantHeld()) return [];
  if (!revenantOn()) return [];
  mendRevenantLairs();
  return livingRevenants().filter((r) => r.lair && r.lairKnown).map((r) => ({ cx: r.lair.px + 0.5, cy: r.lair.py + 0.5, r: LAIR_RING_R, label: r.given ?? r.name, id: r.id }));
}
export function revenantHuntEntries(here = null, { now = nowMinutes() } = {}) {
  if (revenantHeld()) return [];
  if (!revenantOn()) return [];
  mendRevenantLairs();
  const line = (text) => ({ formatting: 'text', text });
  return livingRevenants().filter((r) => r.lair && r.lairKnown).map((r) => {
    const dx = Number.isInteger(here?.px) ? r.lair.px - here.px : 0, dy = Number.isInteger(here?.py) ? r.lair.py - here.py : 0;
    const way = dx || dy ? `, ${distanceWord(Math.max(Math.abs(dx), Math.abs(dy)))} to the ${compassWord(dx, dy)}` : '';
    const kind = enemyDisplayName(r.mobileType) ?? 'Revenant';
    const lines = [`${kind}, rank ${revenantRankNumeral(r.rank)}.`, `Its lair: ${r.lair.name}${way}, marked on your map with a red circle.`,
      r.dread ? t('rvn.unq.hunt.dread', 'The Dread will not come to you again. Go to it.') : 'Find it there before it finds you.'];
    if (trailWarm(r, now)) lines.push(t('rvn.unq.hunt.trail', 'Weakened, it went to ground here to recover. It will be whole again in {hours, plural, one {# hour} other {# hours}}.', { hours: trailHours(r, now) }));
    return { id: `${HUNT_QUEST_PREFIX}${r.id}`, name: `Hunt: ${r.name}`, questName: 'HUNT', hunt: true, clockSeconds: null, messages: [lines.map(line)] };
  });
}
export function forgetRevenantLair(id) {
  const r = revenantById(id);
  if (!r || !r.lairKnown) return false;
  r.lairKnown = false;
  r.trail = 0;
  touch(r);
  persist();
  return true;
}
setHuntJournal({ abandon: (id) => forgetRevenantLair(id) });
export function revenantFester(player, { now = nowMinutes(), rolls = Math.random } = {}) {
  if (!revenantOn()) return [];
  const day = Math.floor(now / MINUTES_PER_DAY);
  if (!Number.isInteger(day) || day < 0) return [];
  // No record clock may run ahead of the character's, as after a reload of an older save under a newer mirror.
  let clamped = false;
  for (const r of _state.list) {
    if (r.gone) continue;
    if (r.trail > now + HUNT.MINUTES) { r.trail = now + HUNT.MINUTES; touch(r); clamped = true; }
    if (r.woundDay > day) { r.woundDay = day; touch(r); clamped = true; }
  }
  if (_state.lastDay == null) { _state.lastDay = day; persist(); return []; }
  if (day <= _state.lastDay) { if (clamped) persist(); return []; }
  const up = [];
  const trained = new Set();
  // While held, lastDay still moves on below, so nothing catches up when the gate opens.
  const held = revenantHeld();
  for (let d = Math.max(_state.lastDay + 1, day - FESTER.CATCHUP + 1); d <= day; d++) {
    for (const r of held ? [] : livingRevenants()) {
      if (r.out || r.dread) continue;
      if (r.wounds?.length && healsOn(r.woundDay, d)) { r.wounds = r.wounds.slice(1); touch(r); }
      const dueDay = Math.floor((r.dueAt ?? 0) / MINUTES_PER_DAY);
      if (!(ambitionOf(r.personality) === 'mastery' ? masteryFestersOn(dueDay, d) : festersOn(dueDay, d))) continue;
      const lesson = trained.has(r.id) ? null : trainLesson(r);
      if (lesson) { r.learned = withLesson(r.learned, lesson, r.rank); if (!r.notice) r.notice = 'trained'; trained.add(r.id); touch(r); }
      if (r.rank >= REVENANT_MAX_RANK) { r.wrath = Math.min(WRATH_MAX, (r.wrath | 0) + 1); touch(r); continue; }
      r.wrath = (r.wrath | 0) + 1;
      if (r.wrath >= WRATH_MAX) {
        r.rank += 1;
        r.wrath = 0;
        r.blood = 0; r.tears = 0;
        r.epithet = revenantEpithet('festered', r.rank, player?.name ?? '', rolls, r.epithet);
        r.name = joinName(r.given, r.epithet);
        if (r.rank >= SIG_RANK && !r.sig) r.sig = drawSignature(r.id, r.mobileType);
        deed(r, 'festered', d * MINUTES_PER_DAY);
        r.notice = 'festered';
        up.push(r);
      }
      touch(r);
    }
    for (const r of swornRevenants()) {
      const st = r.companion?.state;
      if (st !== 'with' && st !== 'away') continue;
      r.companion.loyalty = movedLoyalty(r.companion.loyalty, st === 'with' ? LOYALTY.DAY_WITH : rvnLoyaltyMove(r, LOYALTY.DAY_AWAY));
      touch(r);
    }
    for (const r of swornRevenants()) {
      // An errand or a farm post is no way to lose a companion; the desertion roll waits for it.
      if (r.companion?.state === 'errand' || r.companion?.state === 'station') continue;
      if (r.companion?.loyalty < DESERT.AT && rolls() < DESERT.CHANCE) revenantDeserts(player, r, { now: d * MINUTES_PER_DAY, rolls });
    }
  }
  _state.lastDay = day;
  persist();
  return up;
}
let _swornLeft = null;
export function setSwornLeftListener(fn) { _swornLeft = typeof fn === 'function' ? fn : null; }
const _desertWords = new Map();
export function revenantDeserts(player, r, { now = nowMinutes(), rolls = Math.random } = {}) {
  if (!r?.sworn || r.defeated) return null;
  const { kept, back } = splitPack(player, r);
  r.sworn = false; r.fate = null; r.companion = null; r.out = false;
  if (r.wounds?.length) r.woundDay = Math.floor(now / MINUTES_PER_DAY);
  r.epithet = REVENANT_EPITHETS.deserted[0];
  r.name = joinName(r.given, r.epithet);
  r.dueAt = dueFrom(now, rolls, r);
  r.notice = 'deserted';
  deed(r, 'deserted', now);
  trimLiving(r);
  _desertWords.set(r.id, { kept: kept.map((it) => takenName(it)), back: back.length });
  touch(r);
  persist();
  try { _swornLeft?.(r.id); } catch { }
  return r;
}
function splitPack(player, r) {
  const { kept, back } = deserterSplit([...(r.companion?.items ?? []), ...gearItems(r.companion?.gear)], {
    value: itemValueOf, isGold: (it) => isGoldPieces(it) || !revenantMayTake(it), room: TOOK_MAX - (r.took?.length ?? 0) });
  if (player) {
    player.items ??= [];
    for (const it of back) { if (isGoldPieces(it)) addGoldPieces(player, it.stackCount ?? 1); else addItem(player.items, it); }
  }
  r.took = [...(r.took ?? []), ...kept];
  return { kept, back };
}
export function revenantBetrays(player, r, { now = nowMinutes(), rolls = Math.random } = {}) {
  if (revenantHeld()) return null;
  if (!r?.sworn || r.defeated) return null;
  splitPack(player, r);
  r.sworn = false; r.fate = null; r.companion = null;
  r.rank = Math.min(REVENANT_MAX_RANK, r.rank + 1);
  r.blood = 0; r.tears = 0;
  if (r.wounds?.length) r.woundDay = Math.floor(now / MINUTES_PER_DAY);
  if (r.rank >= SIG_RANK && !r.sig) r.sig = drawSignature(r.id, r.mobileType);
  r.epithet = REVENANT_EPITHETS.betrayed[0];
  r.name = joinName(r.given, r.epithet);
  r.dueAt = dueFrom(now, rolls, r);
  r.notice = null;
  deed(r, 'betrayed', now);
  trimLiving(r);
  touch(r);
  persist();
  try { _swornLeft?.(r.id); } catch { }
  return r;
}
export function revenantBetrayEvent(r, { archive = null, playerName = '', rolls = Math.random } = {}) {
  const body = `${r.given} turns on you!`;
  return revenantEvent('betrayed', r, { speech: voiceParts(r, 'betrayed', playerName, rolls).speech, body, line: `${r.name} turns on you!`, archive });
}
export function revenantDesertEvent(r, { archive = null, playerName = '' } = {}) {
  const w = _desertWords.get(r.id);
  _desertWords.delete(r.id);
  const kept = w?.kept?.length ? ` It kept your ${w.kept.length === 1 ? w.kept[0] : `${w.kept.slice(0, -1).join(', ')} and ${w.kept.at(-1)}`}.` : '';
  const back = w?.back ? ` It left the rest of its pack to you.` : '';
  const body = `${r.given} broke its oath and left you.${kept}${back}`;
  return revenantEvent('deserted', r, { speech: voiceParts(r, 'deserted', playerName, Math.random).speech, body, line: `${r.name}: ${body}`, archive });
}
export function revenantFesterEvent(r, { archive = null } = {}) {
  const body = ambitionOf(r.personality) === 'mastery' ? t('rvn.unq.fester.mastery', '{given} grows bolder. It has been training.', { given: r.given }) : `${r.given} grows bolder. It has waited too long.`;
  return revenantEvent('festered', r, { body, line: body, archive });
}
export function revenantTrainedEvent(r, { archive = null } = {}) {
  const how = trainedHow(r?.learned?.at(-1));
  if (!how) return null;
  const body = trainedWords(r.given, how);
  return revenantEvent('trained', r, { body, line: body, archive });
}
export function revenantOmenEvent(r, { archive = null } = {}) {
  const body = omenWords(ambitionOf(r.personality), r.given);
  return revenantEvent('omen', r, { body, line: body, archive });
}
export function revenantWakeEvent(r, { archive = null } = {}) {
  const body = `You wake to ${r.given} standing over you.`;
  return revenantEvent('lair', r, { body, line: body, archive });
}
export function revenantWarnEvent(r, playerName, { rolls = Math.random } = {}) {
  const v = voiceParts(r, 'devoted_warn', capFirst(firstWord(playerName)), rolls);
  return revenantEvent('warn', r, { speech: v.speech, body: v.body, line: v.line });
}

export function revenantFelled(player, striker, ally, { now = nowMinutes(), rolls = Math.random } = {}) {
  const name = allyName(ally);
  if (!striker?.entity || striker.dead || !(striker.entity.health > 0) || striker.yielded || striker.executing || striker.sparing || striker.leaving || !name) return null;
  return revenantDeed(player, striker.entity, 'felled', {
    mobileType: striker.mobileType ?? striker.entity.mobileType, gender: striker.gender ?? 'male', rec: striker,
    archive: striker.archive ?? striker.mobileArchive ?? null, now, rolls, ally: name,
  });
}
export function revenantFelledEvent(r, ally, { archive = null } = {}) {
  const who = allyName(ally) ?? 'your companion';
  const body = `${r.given} felled ${who}. ${r.rank > 1 ? `It is rank ${revenantRankNumeral(r.rank)} now, and` : 'It'} will remember this.`;
  return revenantEvent('felled', r, { body, line: `${r.name} felled ${who}.`, archive });
}
export function revenantRoutable(f, { now = Date.now() } = {}) {
  if (!f?.entity || f.dead || f._routed || !(f.entity.health > 0) || f.yielded || f.executing || f.sparing || f.leaving || f.fleeing) return false;
  if (!f.ai?.isHostile || !f.ai.detected || f.ai.targetIsLocalPlayer === false) return false;
  if (!revenantCandidate(f.entity, f)) return false;
  return playerLowSince(harmFightSince(f.entity, now));
}
export function revenantRouted(player, f, { now = nowMinutes(), rolls = Math.random } = {}) {
  if (!f?.entity) return null;
  f._routed = true;
  return revenantDeed(player, f.entity, 'routed', {
    mobileType: f.mobileType ?? f.entity.mobileType, gender: f.gender ?? 'male', rec: f,
    archive: f.archive ?? f.mobileArchive ?? null, now, rolls,
  });
}
export function revenantRoutSweep(player, foes = playerDoor()?.foes?.() ?? [], { now = nowMinutes(), rolls = Math.random, wall = Date.now() } = {}) {
  const out = [];
  const door = playerDoor();
  for (const f of foes ?? []) {
    if (door?.isPuppet?.(f) || !revenantRoutable(f, { now: wall })) continue;
    const r = revenantRouted(player, f, { now, rolls });
    if (r) out.push({ r, f });
  }
  return out;
}
export function revenantRoutedEvent(r, { archive = null } = {}) {
  const body = `You ran from ${r.given}. ${r.rank > 1 ? `It is rank ${revenantRankNumeral(r.rank)} now, and` : 'It'} will remember this.`;
  return revenantEvent('routed', r, { body, line: `You ran from ${r.name}. It will remember this.`, archive });
}
export function revenantLastStand(player, entity, { now = nowMinutes() } = {}) {
  const r = entity?.revenant?.id ? (ensureMirror(player), revenantById(entity.revenant.id)) : null;
  if (!r || r.defeated || r.sworn) return null;
  deed(r, 'laststand', now);
  touch(r);
  persist();
  return r;
}
export function revenantLastStandEvent(r, playerName, { rolls = Math.random, archive = null } = {}) {
  const body = `${r.given} rises again for its last stand.`;
  return revenantEvent('laststand', r, { speech: voiceParts(r, 'laststand', playerName, rolls).speech, body, line: body, archive });
}
export function revenantFlinch(f, { archive = null } = {}) {
  const e = f?.entity;
  if (!e?.revenant?.id || f._flinched || !(e.health > 0) || !(e.health < (e.maxHealth || 1) * FLINCH_HEALTH)) return null;
  f._flinched = true;
  const r = revenantById(e.revenant.id);
  if (!r || r.defeated || r.sworn || (r.weakKnown | 0) > 0) return null;
  r.weakKnown = 1;
  touch(r);
  persist();
  return revenantWeaknessEvent(r, { archive });
}
export function revenantSlainEvent(r, playerName, { rolls = Math.random, archive = null } = {}) {
  return revenantEvent('slain', r, {
    speech: voiceParts(r, 'slain', playerName, rolls).speech,
    body: 'Has fallen. Your revenant is no more.', line: revenantSlainLine(r), archive,
  });
}
export function revenantRiseEvent(r, playerName, { rolls = Math.random } = {}) {
  const kind = enemyDisplayName(r.mobileType) ?? 'foe';
  return revenantEvent('rise', r, {
    speech: voiceParts(r, 'rise', playerName, rolls).speech,
    body: r.kills > 1 ? `Has killed you ${r.kills} times. It grows stronger.` : `The ${kind} that killed you lives on. It will come for you again.`,
    line: revenantRiseLine(r),
  });
}

export function revenantMomentEvent(kind, r, playerName, { body = null, line = null, rolls = Math.random, archive = null, as = null } = {}) {
  const v = voiceParts(r, kind, playerName, rolls);
  return revenantEvent(as ?? kind, r, {
    speech: v.speech, body: v.speech ? body : [v.body, body].filter(Boolean).join(' '),
    line: line ?? [v.line, body].filter(Boolean).join(' '), archive,
  });
}

export { setRevenantPresenter, revenantSay } from './revenantVoice.js';

export function takeRevenantNotice(player, { now = nowMinutes(), rolls = Math.random } = {}) {
  if (!player || !(player.health > 0)) return null;
  ensureMirror(player);
  revenantFester(player, { now, rolls });
  const r = _state.list.find((x) => x.notice && !x.defeated);
  if (!r) return revenantOmen(now);
  const ev = r.notice === 'slew' ? revenantRiseEvent(r, player.name) : r.notice === 'festered' ? revenantFesterEvent(r) : r.notice === 'deserted' ? revenantDesertEvent(r, { playerName: player.name }) : r.notice === 'trained' ? revenantTrainedEvent(r) : null;
  r.notice = null;
  touch(r);
  persist();
  return ev;
}
function revenantOmen(now) {
  if (!revenantOn() || revenantHeld()) return null;
  const night = skyIsNight();
  const r = livingRevenants().find((x) => !x.out && !x.dread && x.dueAt <= now && x.omen !== x.dueAt && (night || !(x.learned ?? []).includes('nightStalker')));
  if (!r) return null;
  r.omen = r.dueAt;
  touch(r);
  persist();
  return revenantOmenEvent(r);
}

// One spawned when the save is made returns after REVENANT_LOST_MINUTES, because the street's save leaves it out.
registerModSaveData(REVENANT_SAVE, {
  newSaveData: () => ({ v: 1, list: [], lastDay: null }),
  getSaveData: () => ({ v: 1, list: _state.list.map((r) => (r.gone ? r : { ...r, out: false, outAt: 0, dueAt: r.out ? Math.max(r.dueAt, nowMinutes() + REVENANT_LOST_MINUTES) : r.dueAt })), lastDay: _state.lastDay }),
  restoreSaveData: (rec) => { _state.list = mergeRevenants(rec?.list ?? [], []); _state.lastDay = sanitizeDay(rec?.lastDay); _state.mirrorId = null; _lastSlew = null; clearPlayerHarm(); endPlayerFights(); forgetBodies(); },
  newGame: () => { _state.list = []; _state.lastDay = null; _state.mirrorId = null; _lastSlew = null; clearPlayerHarm(); endPlayerFights(); forgetBodies(); },
});

export const KILL_NEAR_MINUTES = 2;
export function killerOf(characterId, ownAt) {
  if (!characterId || !Number.isFinite(ownAt)) return null;
  let list = [];
  try { const raw = appStorage()?.getItem(storeKey(String(characterId))); if (raw) list = JSON.parse(raw)?.list ?? []; } catch { return null; }
  let best = null, bestAt = -Infinity;
  for (const raw of mergeRevenants(list, [])) {
    if (raw.gone || raw.defeated || raw.sworn) continue;
    for (const d of raw.history) if (d.deed === 'slew' && Math.abs(d.at - ownAt) <= KILL_NEAR_MINUTES && d.at > bestAt) { best = raw; bestAt = d.at; }
  }
  return best ? JSON.parse(JSON.stringify(best)) : null;
}
export function inheritRevenant(player, rec, { now = nowMinutes(), rolls = Math.random } = {}) {
  const r = /** @type {any} */ (sanitize(rec));
  const id = player ? characterIdOf(player) : null;
  if (!r || r.gone || r.defeated || r.sworn || !id) return false;
  Object.assign(r, { out: false, outAt: 0, took: [], companion: null, notice: null, dueAt: dueFrom(now, rolls, r),
    trail: 0, omen: 0, woundDay: r.wounds.length ? Math.floor(now / MINUTES_PER_DAY) : -1 });
  let kept = [], keptDay = null;
  try { const raw = appStorage()?.getItem(storeKey(id)); if (raw) { const m = JSON.parse(raw); kept = m?.list ?? []; keptDay = sanitizeDay(m?.lastDay); } } catch { }
  if (kept.some((x) => x?.id === r.id) || (_state.mirrorId === id && _state.list.some((x) => x.id === r.id))) return false;
  try { appStorage()?.setItem(storeKey(id), JSON.stringify({ v: 1, list: [...kept, r], lastDay: keptDay })); } catch { }
  if (_state.mirrorId === id) { _state.list.push(r); persist(); }
  return true;
}

export function _resetRevenantForTests() { _state.list = []; _state.mirrorId = null; _state.lastDay = null; forgetBodies(); _lairsAsked = new WeakMap(); }
