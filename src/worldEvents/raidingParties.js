
import { modSetting } from '../mods/modSettings.js';
import { registerModSaveData } from '../saves/modSaveData.js';
import { eventNotice } from './eventNotices.js';
import { sharedClockOn, worldMinutes } from '../world/worldTick.js';
import { MINUTES_PER_DAY } from '../world/gameDate.js';
import { LOCATION_TYPES, longitudeLatitudeToMapPixel } from '../formats/mapsFile.js';
import { FACTION_TYPES, GUILD_GROUPS } from '../formats/factionFile.js';
import { MOBILE_TYPES } from '../characters/mobileTypes.js';
import { findFactionByTypeAndRegion } from '../talk/talk.js';
import { changeReputation } from '../guilds/factionRep.js';
import { legalRepOf, changeLegalRep, LEGAL_REP_MIN, LEGAL_REP_MAX } from '../justice/court.js';
import { ORDERS } from '../guilds/guildVariants.js';
import { GUILDS } from '../guilds/guilds.js';
import { renownStruckAt } from '../net/renownTracker.js';
import { raidRunnerOf, validRaidWords, validRaidObjWords, RAID_WORD_STALE_MS, RAID_WORDS_MAX } from '../world/raidShared.js';
import { RAID_WORD_MS, RAID_WORD_KILLS_MAX, raidSig, rollRaidTowns, raidDayRandom, raidsPerDay, raidTownsCanon, raidTownsHash } from '../net/raidLaw.js';
import { readRaidReceipt } from '../net/raidReceipt.js';
import { worldRoom, isCellRoom } from '../net/wire.js';
import { isWildRegion } from '../world/wildZone.js';
import { noteAct } from '../systems/questlines/qlActs.js';
import { staffRaids, staffRaidsEnded, staffRaidHere, staffRaider, staffRaidRoom, staffBossWanted, staffMidWanted, staffBossLost, staffBossByHand, staffBossToSay, staffEventBook, staffEventEnd, staffEventLedger, staffRaidOfKey } from './staffEvents.js';
import { validStaffEventIn, staffEventKey } from '../net/staffEvent/staffEventLaw.js';
import { readStaffReceipt } from '../net/staffEvent/staffEventReceipt.js';
import { promoteStaffBoss, promoteRaidLeader } from '../characters/eliteFoes.js';
import { giveBossTraits, rollBossTraits } from '../characters/bossTraits.js';
import { RAID_KIND_ORDER, raidKindOf, raidKindAsk, raidKindName, raidWavePlan, raidWaveAt, raidWaveLine, raidLeaderLine, raidLeaderName, raidLeaderOf, raidLeaderNameOf,
  raidBearerFellLine, raidRefugeeSafeLine, raidRefugeeLostLine, raidHeldLine, raidObjectiveDetail, alongWay, wayLength,
  RAID_WAVE_BREATHER_S, RAID_WAVE_PACK_MIN, RAID_WAVE_PACK_MAX, RAID_WAVE_PACK_GAP_S, RAID_LEADER_TRAITS, RAID_LEADER_AGAIN_S,
  RAID_DEFEND_PACK_MAX, RAID_DEFEND_PACK_GAP_S, RAID_DEFEND_FROM_M, RAID_AIM_TICKS, RAID_REFUGEES, RAID_REFUGEES_HOLD, RAID_REFUGEE_PACE,
  RAID_REFUGEE_WAIT_M, RAID_REFUGEE_SAFE_M, RAID_ESCORT_PACK_MAX, RAID_ESCORT_PACK_GAP_S, RAID_ESCORT_AHEAD_M,
  RAID_WAVE_STALL_S, RAID_SITE_AGAIN_S, RAID_REFUGEE_GAP_M } from './raidKinds.js';
import { enemyDisplayName } from '../characters/enemyBasics.js';
import { t } from '../ui/textManager.js';
import { createRaidMuster, musterSides, MUSTER_GATHER_STEP_S } from './raidMuster.js';
import { RAID_STREETLESS } from './raidStreetless.js';
import { SIFRIT_ID } from '../systems/sifrit/sifritLaw.js';

export const RAIDING_PARTIES_VENDOR = 'world-events-raiding-parties';
export const raidingPartiesOn = () => modSetting(RAIDING_PARTIES_VENDOR, 'Enabled') === true;

export const RAID_DURATION_MINUTES = 120;
// Exclusive upper bound, as in the mod's `Random.Range(0, 1321)`, so a raid starts between 00:00 and 22:00.
export const RAID_START_SPAN = 1321;
export const MOD_DAILY_RAIDS = 23;
export const RAID_KILLS_MIN = 15;
export const RAID_KILLS_MAX_EXCLUSIVE = 26;
export const MAX_RAID_ENEMIES = 25;
export const MAX_RAID_DEFENDERS = 8;
export const SPAWN_INTERVAL_MIN_S = 1;
export const SPAWN_INTERVAL_MAX_S = 10;
export const ORC_SPAWN_INTERVAL_MAX_S = 8;
export const PENDING_TIMEOUT_S = 8;
export const PENDING_BACKOFF_S = 10;
export const ACTOR_SWEEP_S = 3;
export const RAID_SPAWN_MIN_DISTANCE = 10;
export const RAID_SPAWN_MAX_DISTANCE = 35;
/** @param {{ min?: number, max?: number, los?: boolean } | undefined} at */
export const raidSpawnRange = (at) => ({ minDistance: at?.min ?? RAID_SPAWN_MIN_DISTANCE, maxDistance: at?.max ?? RAID_SPAWN_MAX_DISTANCE, lineOfSightCheck: at?.los ?? true });
export const RAID_LEGAL_REP = 5;
export const RAID_PEOPLE_REP = 5;
export const RAID_ORDER_REP = 3;
export const RAID_GUILD_REP = 3;
export const RAID_TOWN_TYPES = Object.freeze([LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage, LOCATION_TYPES.TownHamlet]);
export const raidTypeName = (type) => (type === 1 ? 'bandits' : type === 0 ? 'knights' : 'orcs');
export const raidTypeAdjective = (type) => (type === 1 ? 'bandit' : type === 0 ? 'knight' : 'orc');

export const RAID_REGION_REAL_HOURS = 4;
export const GAME_DAY_REAL_HOURS = 24 / 12;
// Re-exported from `net/raidLaw.js`, which the relay also reads; do not declare a local copy.
export { raidsPerDay };

export const attackLine = (town, region, type) => `${town} in ${region} is under attack by ${raidTypeName(type)}!`;
export const withdrawnLine = (town, region) => `The attackers have withdrawn from ${town} in ${region}.`;
export const cleansedLine = (town, region, type) => `${town} in ${region} has been cleansed of the ${raidTypeAdjective(type)} attack!`;
export function defendedLine(top, n = 0) {
  const names = (Array.isArray(top) ? top : []).filter((x) => typeof x === 'string' && x);
  if (!names.length) return '';
  const more = Math.max(0, (n | 0) - names.length);
  const parts = more > 0 ? [...names, `${more} other${more === 1 ? '' : 's'}`] : names;
  return `Defended by ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]}.`;
}

const rangeInt = (min, maxExclusive, random) => (maxExclusive <= min ? min : min + Math.floor(random() * (maxExclusive - min)));
const rangeFloat = (min, max, random) => min + random() * (max - min);

// The roll is drawn before the party check, even for knights, so the random sequence matches the mod's
// `ChooseEnemy`.
export function chooseRaider(type, random = Math.random) {
  const roll = rangeInt(0, 100, random);
  if (type === 0) return MOBILE_TYPES.Knight;
  if (type === 1) return roll < 50 ? MOBILE_TYPES.Rogue : roll < 80 ? MOBILE_TYPES.Thief : MOBILE_TYPES.Burglar;
  return roll < 70 ? MOBILE_TYPES.Orc : roll < 95 ? MOBILE_TYPES.OrcSergeant : MOBILE_TYPES.OrcWarlord;
}

/**
 * Only the base game rows (`baseLocationCount`) count: a world-data mod can append rows on one client and break the
 * shared roll.
 * @param {{regionCount:number, getRegion:(r:number)=>any, baseLocationCount?:(r:number)=>number}|null} maps
 * @param {ArrayLike<number>|null} pickerData
 */
export function raidRegions(maps, pickerData, { all = false } = {}) {
  if (!maps || !pickerData) return null;
  const count = maps.regionCount ?? 0;
  const onMap = new Set();
  for (let i = 0; i < pickerData.length; i++) {
    const r = pickerData[i] - 128;
    if (r >= 0 && r < count) onMap.add(r);
  }
  const types = new Set(RAID_TOWN_TYPES);
  const out = [];
  for (let r = 0; r < count; r++) {
    if (!onMap.has(r)) continue;
    const region = maps.getRegion(r);
    const table = region?.mapTable;
    if (!table) continue;
    const base = typeof maps.baseLocationCount === 'function' ? Math.min(table.length, maps.baseLocationCount(r)) : table.length;
    const towns = [];
    for (let k = 0; k < base; k++) {
      const row = table[k];
      if (!row || !types.has(row.locationType)) continue;
      if (!all && RAID_STREETLESS.has(`${r}:${k}`)) continue;
      const px = longitudeLatitudeToMapPixel(row.longitude, row.latitude);
      towns.push(Object.freeze({ index: k, name: String(region.mapNames?.[k] ?? ''), px: px.x, py: px.y }));
    }
    if (towns.length) out.push(Object.freeze({ region: r, towns: Object.freeze(towns) }));
  }
  return Object.freeze(out);
}

export function rollRaids(day, regions, count, random) {
  return rollRaidTowns(day, regions, count, random).map(({ region, town, st, ty, tg }) => ({
    regionIndex: region, locationIndex: town.index, startDay: day, locationName: town.name,
    type: ty, startMinute: st, endMinute: st + RAID_DURATION_MINUTES,
    killed: 0, attackAmount: tg, cleansed: false,
    announced: false, struck: false,
    px: town.px, py: town.py,
    sacked: false, safe: 0, lost: 0,
  }));
}

export const raidsForDay = (day, regions) => rollRaids(day, regions, raidsPerDay(regions?.length ?? 0), raidDayRandom(day));

export const raidKey = (raid) => raid.key ?? `${raid.regionIndex}:${raid.locationIndex}:${raid.startDay}`;
export const raidActive = (raid, now) => !raid.cleansed && now >= raid.startMinute && now < raid.endMinute;

/**
 * The People faction must belong to the region itself; `findFactionByTypeAndRegion` can fall back to a faction with
 * no region, which the mod refuses.
 * @param {{player:any, store:{dict:Map<number, any>}}|null} ctx
 */
export function grantRaidReputation(ctx, region) {
  const player = ctx?.player, store = ctx?.store;
  if (!player || !store?.dict) return false;
  const rep = legalRepOf(player, region);
  changeLegalRep(player, region, Math.min(LEGAL_REP_MAX, Math.max(LEGAL_REP_MIN, rep + RAID_LEGAL_REP)) - rep, { kind: 'raid' });
  const people = findFactionByTypeAndRegion(store.dict, FACTION_TYPES.People, region);
  if (people && people.region === region) changeReputation(store, people.id, RAID_PEOPLE_REP, false);
  const orders = new Set(Object.values(ORDERS));
  for (const f of store.dict.values()) {
    if (f.region === region && f.ggroup === GUILD_GROUPS.KnightlyOrder && orders.has(f.id)) {
      changeReputation(store, f.id, RAID_ORDER_REP, false);
      break;
    }
  }
  changeReputation(store, GUILDS.FightersGuild.factionId, RAID_GUILD_REP, false);
  return true;
}

export const SIGHT_MARGIN_DEGREES = 10;
export function outOfSight(feet, eye, yawRad, fovDegrees, outdoors = true) {
  if (!outdoors || !feet || !eye) return true;
  const dx = feet[0] - eye[0], dz = feet[2] - eye[2];
  if (dx * dx + dz * dz < 1e-6) return false;
  const d = Math.atan2(dx, dz) - yawRad;
  const off = Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
  return off > ((fovDegrees / 2) + SIGHT_MARGIN_DEGREES) * Math.PI / 180;
}

export const newRaidSaveData = () => ({ lastSelectedDay: -1, raids: [] });
let state = newRaidSaveData();
let _dayFromSave = true;

const RAID_FIELDS_INT = ['regionIndex', 'locationIndex', 'startDay', 'type', 'startMinute', 'endMinute', 'killed', 'attackAmount', 'px', 'py'];
export const getRaidSaveData = () => ({
  lastSelectedDay: state.lastSelectedDay,
  raids: state.raids.map((r) => ({
    regionIndex: r.regionIndex, locationIndex: r.locationIndex, startDay: r.startDay, locationName: r.locationName,
    type: r.type, startMinute: r.startMinute, endMinute: r.endMinute, killed: r.killed, attackAmount: r.attackAmount,
    cleansed: r.cleansed, announced: r.announced, struck: r.struck, px: r.px, py: r.py,
    ...(r.sacked ? { sacked: true } : {}), ...(r.safe ? { safe: r.safe } : {}), ...(r.lost ? { lost: r.lost } : {}),
    ...(r.ld ? { ld: true } : {}), ...(r.wv >= 0 ? { wv: r.wv } : {}), ...(r.asked ? { asked: true } : {}), ...(r.ow ? { ow: r.ow.slice() } : {}),
  })),
  ...(_held.length ? { held: _held.slice() } : {}),
});
export function restoreRaidSaveData(data) {
  cancelPending();
  const day = Number.isInteger(data?.lastSelectedDay) ? data.lastSelectedDay : -1;
  const raids = [];
  for (const r of Array.isArray(data?.raids) ? data.raids : []) {
    if (!r || typeof r !== 'object' || !RAID_FIELDS_INT.every((k) => Number.isInteger(r[k]))) continue;
    if (r.endMinute <= r.startMinute || r.killed < 0) continue;
    raids.push({
      regionIndex: r.regionIndex, locationIndex: r.locationIndex, startDay: r.startDay, locationName: String(r.locationName ?? ''),
      type: r.type, startMinute: r.startMinute, endMinute: r.endMinute, killed: r.killed,
      attackAmount: r.attackAmount > 0 ? r.attackAmount : rangeInt(RAID_KILLS_MIN, RAID_KILLS_MAX_EXCLUSIVE, rnd()),
      cleansed: r.cleansed === true, announced: r.announced === true, struck: r.struck === true, px: r.px, py: r.py,
      sacked: r.sacked === true, safe: Number.isInteger(r.safe) && r.safe >= 0 ? r.safe : 0, lost: Number.isInteger(r.lost) && r.lost >= 0 ? r.lost : 0,
      ...(r.ld === true ? { ld: true } : {}), ...(Number.isInteger(r.wv) && r.wv >= 0 ? { wv: r.wv } : {}), ...(r.asked === true ? { asked: true } : {}),
      ...(Array.isArray(r.ow) && r.ow.length === 3 && r.ow.every((x) => Number.isInteger(x)) ? { ow: r.ow.slice() } : {}),
    });
  }
  state = { lastSelectedDay: day, raids };
  _held = Array.isArray(data?.held) ? data.held.filter((k) => typeof k === 'string').slice(-RAID_HELD_KEPT) : [];
  _dayFromSave = true;
  _peerWords = new Map();
  _myClaims = new Map();
  _live = [];
  _peerObj = new Map(); _pack = null;
  scheduleNextSpawn(-1);
  scheduleNextDefender();
  _lastRegion = -1;
}
export const raidState = () => state;
const allRaids = () => { const s = staffRaids(); return s.length ? [...state.raids, ...s] : state.raids; };

let _host = null;
export function setRaidingPartiesHost(host) { _host = host ?? null; }
const host = () => _host ?? {};
const rnd = () => host().random ?? Math.random;
const say = (line, raid = null) => { const id = raid ? `raid:${raidKey(raid)}` : null; (host().say ?? ((l, i) => eventNotice('raid', l, i)))(line, id); };
const regionName = (r) => host().regionName?.(r) ?? String(r);
const muster = createRaidMuster({
  camps: (raid) => {
    const s = host().sites?.();
    if (!s?.way) return null;
    const want = musterSides(raid, !!s.bigTown?.(raid));
    const c = [];
    for (const side of [...want, ...[0, 1, 2, 3].map((k) => (want[0] + k) % 4).filter((k) => !want.includes(k))]) {
      if (c.length >= want.length) break;
      const pts = s.way(side, raid);
      if (Array.isArray(pts) && pts.length >= 2) c.push({ pts });
    }
    return c.length ? c : null;
  },
  players: () => (host().peerFeetInTown?.() ?? []).map((x) => x[1]).filter(Array.isArray),
  release: (raid, foe) => aimRaider(raid, foe),
  random: () => rnd()(),
  keyOf: (raid) => raidKey(raid),
});
export const raidMusterWaves = () => muster.waves();
export const raidsBurning = () => {
  if (!raidingPartiesOn()) return [];
  const now = (host().now ?? worldMinutes)();
  return state.raids.filter((r) => raidActive(r, now));
};

let _live = [];
let _pending = null;
let _nextSpawnIn = 0;
let _nextDefenderIn = 0;
let _sweepIn = 0;
let _lastRegion = -1;
let _regions = null;
let _peerWords = new Map();
let _myClaims = new Map();
let _unclaimedSince = new Map();
export const RAID_CLAIM_GRACE_MS = 10000;
let _relay = new Map();
let _receipts = new Map();
export const RAID_RECEIPTS_KEPT = 32;
let _lastWord = null;

function scheduleNextSpawn(type) {
  _nextSpawnIn = type === STAFF_RAID_TYPE ? rangeFloat(STAFF_SPAWN_INTERVAL_MIN_S, STAFF_SPAWN_INTERVAL_MAX_S, rnd()) : rangeFloat(SPAWN_INTERVAL_MIN_S, type === 2 ? ORC_SPAWN_INTERVAL_MAX_S : SPAWN_INTERVAL_MAX_S, rnd());
}
function scheduleNextDefender() {
  _nextDefenderIn = rangeFloat(SPAWN_INTERVAL_MIN_S, SPAWN_INTERVAL_MAX_S, rnd());
}
function cancelPending() {
  if (_pending) _pending.cancelled = true;
  if (_pending?.boss) _pending.boss.bossFc = -1;
  _pending = null;
}

const regionsNow = () => {
  if (!_regions) _regions = raidRegions(host().maps?.() ?? null, host().picker?.() ?? null);
  return _regions;
};

function routRaid(raid) {
  const key = raidKey(raid);
  if (_pending?.key === key) cancelPending();
  _myClaims.delete(key);
  muster.end(key);
  for (const e of _live) if (e.key === key && (e.kind === 'raider' || e.kind === 'refugee')) e.routed = true;
}

const liveRaiders = (key) => _live.filter((e) => e.key === key && e.kind === 'raider' && !e.boss && !e.routed && !e.foe.dead && (e.foe.entity?.health ?? 1) > 0);
function raidOnMyPixel(now) {
  const px = host().playerPixel?.();
  if (!px) return null;
  return state.raids.find((r) => raidActive(r, now) && r.px === px.x && r.py === px.y && (r.killed > 0 || r.struck)) ?? null;
}
export function raidPoolCleared() {
  cancelPending();
  _live = _live.filter((e) => e.kind === 'raider' && e.foe.dead && !e.counted);
}
export function raidDefendingHere(now = (host().now ?? worldMinutes)()) {
  const town = host().townHere?.();
  if (!town) return false;
  return state.raids.some((r) => raidActive(r, now) && r.regionIndex === town.regionIndex && r.locationIndex === town.locationIndex);
}

function cleanse(raid, { said = true, top = [], n = 0 } = {}) {
  const held = !raid.staff && raidHeld(raid);
  raid.cleansed = true;
  routRaid(raid);
  if (held) _held = [..._held.filter((k) => k !== raidKey(raid)), raidKey(raid)].slice(-RAID_HELD_KEPT);
  const px = host().playerPixel?.();
  if (raid.struck && px && px.x === raid.px && px.y === raid.py) {
    grantRaidReputation(host().reputation?.() ?? null, raid.regionIndex);
    if (held) grantRaidHeldReputation(host().reputation?.() ?? null, raid.regionIndex);
    noteAct('raid-repelled');
  }
  if (!said) return;
  const who = defendedLine(top, n);
  say(who ? `${cleansedLine(raid.locationName, regionName(raid.regionIndex), raid.type)} ${who}` : cleansedLine(raid.locationName, regionName(raid.regionIndex), raid.type), raid);
  if (held) say(raidHeldLine(raid.locationName), raid);
}

function tallyDeaths(now) {
  for (const e of _live) {
    if (e.kind === 'bearer' && e.foe.dead && e.foe.corpse && !e.counted) {
      e.counted = true;
      const r = state.raids.find((x) => raidKey(x) === e.key);
      if (r && raidActive(r, now) && !r.cleansed) r.sacked = true;
    }
    if (e.kind !== 'raider') continue;
    if (!e.foe.raidTurned && !e.foe.dead && (e.foe.entity?.health ?? 1) < (e.foe.entity?.maxHealth ?? 1)) e.foe.raidTurned = true;
    const raid = allRaids().find((r) => raidKey(r) === e.key);
    if (raid && !raid.struck && renownStruckAt(e.foe) != null) raid.struck = true;
    if (!e.foe.dead || e.counted) continue;
    e.counted = true;
    // A dead enemy with no corpse was removed, not killed, and does not count.
    if (!e.foe.corpse || !raid || !raidActive(raid, now)) continue;
    if (e.boss) { raid.bossDown = 1; continue; }
    if (e.leader) { objOf(raid).leaderFell = objOf(raid).clock; raid.ld = true; }
    raid.killed++;
    if (raid.staff && renownStruckAt(e.foe) != null) raid.mine++;
    if (!raid.staff && !raidRelayOn() && raidKillTotal(raid) >= raid.attackAmount) cleanse(raid);
  }
}

function sweep() {
  const h = host();
  for (const e of _live) {
    if ((e.kind === 'raider' || e.kind === 'refugee') && e.routed && !e.foe.dead && (h.outOfSight?.(e.foe) ?? true)) h.removeFoe?.(e.foe);
    if (e.kind === 'raider' && !e.routed && !e.foe.dead && !e.foe.ai?.target) { const r = state.raids.find((x) => raidKey(x) === e.key); if (r) aimRaider(r, e.foe); }
  }
  _live = _live.filter((e) => !e.foe.dead || (e.kind === 'raider' && !e.counted) || (e.kind === 'refugee' && !e.done));
}

function spawn(raid, kind, mobileType, o = undefined, pack = null) {
  const h = host();
  if ((kind === 'raider' || kind === 'leader') && !raid.staff && !o?.wave) {
    const m = muster.place(raid, kind === 'leader' ? 1 : pack?.size ?? 0);
    if (!m) { if (kind === 'leader') _nextSpawnIn = 1; return; }
    o = m;
  }
  if (raid.staff && (kind === 'raider' || kind === 'boss' || kind === 'mid') && !o?.at) {
    const foot = h.eventFoot?.(raid);
    if (Array.isArray(foot)) o = { min: 8, max: 45, los: false, ...(o ?? {}), near: foot };
  }
  const p = { key: raidKey(raid), age: 0, cancelled: false, boss: kind === 'boss' ? raid : null };
  _pending = p;
  const threats = () => liveRaiders(p.key).map((e) => e.foe);
  const sites = h.sites?.() ?? null;
  const promise = kind === 'defender' ? h.standDefender?.(threats()) : kind === 'bearer' ? sites?.standBearer(o) : kind === 'refugee' ? sites?.standRefugee(o.at, o.follow) : h.standRaider?.(mobileType, o);
  const boss = kind === 'boss';
  const mid = kind === 'mid';
  Promise.resolve(promise).then((foe) => {
    if (_pending === p) _pending = null;
    if (!foe) { if (boss) raid.bossFc = -1; if (mid) raid.midStood = Math.max(0, (raid.midStood ?? 1) - 1); if (pack && !pack.at) { pack.left++; pack.far = false; } muster.adopt(o, null); return; }
    if (pack && !pack.at && Array.isArray(foe.ai?.feet)) pack.at = [...foe.ai.feet];
    if (p.cancelled && kind !== 'defender') { h.removeFoe?.(foe); if (boss) raid.bossFc = -1; if (mid) raid.midStood = Math.max(0, (raid.midStood ?? 1) - 1); muster.adopt(o, null); return; }
    if (boss) { promoteStaffBoss(foe.entity, { sizePct: raid.staff.bs, healthX: raid.staff.bh, hp: raid.staff.hp, name: raid.staff.bn }); raid.bossUp = 1; raid.bossDown = 0; if (raid.staff.wv > 0 && Array.isArray(foe.ai?.feet)) _wave = { key: p.key, left: raid.staff.wv, at: foe.ai.feet.slice() }; }
    if (mid) { promoteStaffBoss(foe.entity, { sizePct: Math.max(150, Math.round(raid.staff.bs * 0.6)), healthX: Math.max(2, Math.round(raid.staff.bh * 0.3)), hp: raid.staff.hp > 0 ? Math.max(1, Math.floor(raid.staff.hp * 0.25)) : 0 }); if (foe.entity?.staffBoss) foe.entity.staffBoss.mid = true; }
    if (kind === 'bearer' || kind === 'refugee') foe.raidGoal = p.key;
    if (kind === 'bearer' && foe.entity && objOf(raid).share < 1) foe.entity.health = Math.max(1, Math.round(foe.entity.maxHealth * objOf(raid).share));
    if (kind === 'leader') { promoteRaidLeader(foe.entity, { name: raidLeaderNameOf(foe.mobileType ?? mobileType) }); foe.entity.bossTraits = undefined; foe.entity.bossWard = undefined; giveBossTraits(foe.entity, rollBossTraits(RAID_LEADER_TRAITS, rnd())); }
    if (raid.staff && (kind === 'raider' || boss || mid)) {
      if ((boss || mid) && (foe.mobileType ?? mobileType) === SIFRIT_ID) h.cry?.('cackle', raid);
    }
    const fights = boss || mid || kind === 'leader' || kind === 'raider';
    if (!_live.some((e) => e.foe === foe)) _live.push({ foe, key: p.key, kind: fights ? 'raider' : kind, boss, leader: kind === 'leader', routed: false, counted: false });
    if (fights) { foe.raidKey = p.key; if (!muster.adopt(o, foe)) aimRaider(raid, foe); }
  }, () => { if (_pending === p) _pending = null; if (boss) raid.bossFc = -1; muster.adopt(o, null); });
}

export function raidFrame(dt = 0) {
  if (!raidingPartiesOn()) return null;
  const h = host();
  const now = (h.now ?? worldMinutes)();
  const day = Math.floor(now / MINUTES_PER_DAY);
  const region = h.regionIndex?.() ?? -1;
  _nextSpawnIn -= dt;
  _nextDefenderIn -= dt;
  _sweepIn -= dt;
  for (const f of h.ownRaidFoes?.() ?? []) if (!_live.some((e) => e.foe === f)) _live.push({ foe: f, key: f.raidKey, kind: 'raider', boss: tookStaffBoss(f), leader: !!f.entity?.raidLeader, routed: false, counted: false });
  const puppets = h.raidPuppets?.() ?? [];
  for (const pup of puppets) {
    if (pup.dead) continue;
    const r = allRaids().find((x) => raidKey(x) === pup._pupRaid);
    if (r && !r.struck && renownStruckAt(pup) != null) r.struck = true;
  }
  staffPuppetKills(puppets, now);
  tallyDeaths(now);
  muster.step(dt);
  const relay = raidRelayOn();
  for (const r of state.raids) if (!relay && raidActive(r, now) && raidKillTotal(r) >= r.attackAmount) cleanse(r);
  if (_sweepIn <= 0) { _sweepIn = ACTOR_SWEEP_S; sweep(); }
  for (const r of staffRaidsEnded()) { r.routed = true; routRaid(r); if (r.announced || r.staff.an) say(staffEndLine(r), r); }

  // Only a later day rolls. The first online check after a load also rerolls any other day, since a save can carry
  // a day the world has not reached.
  if (day > state.lastSelectedDay || (sharedClockOn() && _dayFromSave && day !== state.lastSelectedDay)) {
    const regions = regionsNow();
    if (!regions) return null;
    expire(now, region);
    for (const r of state.raids) routRaid(r);
    state.lastSelectedDay = day;
    state.raids = raidsForDay(day, regions).filter((r) => !isWildRegion(r.regionIndex));
    cancelPending();
    scheduleNextSpawn(-1);
    scheduleNextDefender();
    _lastRegion = region;
  }
  if (sharedClockOn()) _dayFromSave = false;
  expire(now, region);
  if (region !== _lastRegion) { _lastRegion = region; cancelPending(); }
  if (region >= 0) {
    for (const r of state.raids) {
      if (!raidActive(r, now) || r.regionIndex !== region || r.announced) continue;
      r.announced = true;
      say(attackLine(r.locationName, regionName(region), r.type), r);
    }
  }
  if (region >= 0) for (const r of staffRaids()) if (r.regionIndex === region && !r.announced) { r.announced = true; say(staffAttackLine(r), r); host().cry?.('scream', r); }
  const town = h.townHere?.() ?? null;
  const raid = staffRaidHere(town, h.playerPixel?.() ?? null, !!h.townHere?.(true)) ?? (town ? state.raids.find((r) => raidActive(r, now) && r.regionIndex === town.regionIndex && r.locationIndex === town.locationIndex) : null);
  if (raid?.staff && staffBossToSay(raid) >= 0) say(staffBossLine(raid), raid);
  // The relay credits words from anywhere on the town map pixel, which is wider than the town rect, so a fought
  // raid is still reported past the rect.
  const said = raid ?? (relay ? raidOnMyPixel(now) : null);
  if (said?.staff) sayToCell(said);
  else if (relay && said) sayToRelay(said);
  if (!raid) { cancelPending(); for (const key of _myClaims.keys()) letGoAllies(key); _myClaims.clear(); return 'idle'; }
  if (!raid.staff) sayObjective(raid, objNow(raid));
  if (sharedClockOn() && !runsRaid(raid)) { cancelPending(); letGoAllies(raidKey(raid)); muster.end(raidKey(raid)); return 'standing-by'; }
  if (_pending && _pending.key !== raidKey(raid)) cancelPending();
  if (_pending) {
    _pending.age += dt;
    if (_pending.age <= PENDING_TIMEOUT_S) return 'waiting';
    cancelPending();
    _nextSpawnIn = PENDING_BACKOFF_S;
    _nextDefenderIn = PENDING_BACKOFF_S;
    return 'waiting';
  }
  if (raid.staff) {
    const fc = staffBossWanted(raid);
    const waits = fc >= 0 && !staffBossByHand(raid) && !staffFieldClear(raid, h) && !staffClearLong(raid, localNow());
    if (fc >= 0 && !waits) { raid.bossFc = fc; raid.handSeen = raid.staff.fb ?? 0; raid.clearSince = undefined; raid.clearWait = undefined; spawn(raid, 'boss', raid.staff.b, staffBossPlace()); return 'boss'; }
    const lost = staffBossLost(raid, staffBossStanding(raid, h), localNow());
    if (lost >= 0) { raid.bossFc = lost; spawn(raid, 'boss', raid.staff.b, staffBossPlace()); return 'boss'; }
    const mid = staffMidWanted(raid);
    if (mid > 0) { raid.midStood = mid; spawn(raid, 'mid', staffRaider(raid, rnd()), staffBossPlace()); return 'boss'; }
    if (_wave && _wave.key === raidKey(raid) && _wave.left > 0) {
      _wave.left--;
      spawn(raid, 'raider', staffRaider(raid, rnd()), { at: _wave.at, min: 1.5, max: STAFF_PACK_NEAR, los: false });
      return 'raider';
    }
  }
  if (!raid.staff && _nextDefenderIn <= 0) {
    scheduleNextDefender();
    if (h.defendersAllowed?.() !== false && (h.defenderCount?.() ?? 0) < MAX_RAID_DEFENDERS) {
      spawn(raid, 'defender');
      return 'defender';
    }
  }
  if (!raid.staff && kindOf(raid) !== 'classic') {
    if (!(dt > 0)) return 'idle';
    adoptObjective(raid);
    const k = kindStep(raid, dt);
    if (k) return k;
  }
  if (_nextSpawnIn <= 0) {
    if (raid.staff) return staffPackStep(raid, liveRaiders(raidKey(raid)).length);
    scheduleNextSpawn(raid.type);
    const standing = liveRaiders(raidKey(raid)).length;
    if (standing < MAX_RAID_ENEMIES) {
      spawn(raid, 'raider', chooseRaider(raid.type, rnd()));
      if (muster.gathering(raid)) _nextSpawnIn = MUSTER_GATHER_STEP_S;
      return 'raider';
    }
  }
  return 'idle';
}

function expire(now, region) {
  for (let i = state.raids.length - 1; i >= 0; i--) {
    const r = state.raids[i];
    if (now < r.endMinute) continue;
    if (!r.cleansed && r.announced && region >= 0 && r.regionIndex === region) say(withdrawnLine(r.locationName, regionName(r.regionIndex)), r);
    routRaid(r);
    state.raids.splice(i, 1);
    _peerWords.delete(raidKey(r)); _unclaimedSince.delete(raidKey(r)); _relay.delete(raidKey(r));
    _peerObj.delete(raidKey(r));
  }
}

export const kindOf = (raid) => (raid.kind ??= raid.staff || host().sites ? raidKindOf(raid) : 'classic');
const townKills = (raid) => Math.max(raidKillTotal(raid), _relay.get(raidKey(raid))?.n ?? 0);
const objOf = (raid) => (raid.obj ??= { wave: -1, said: -1, breather: 0, leaderFell: -Infinity, post: undefined, way: undefined, len: 0, guide: 0, trail: null, trailAt: -1, clock: 0, stall: 0, stallK: -1, share: 1, siteAt: -Infinity });
let _peerObj = new Map();
let _held = [];
export const RAID_HELD_KEPT = 16;
export const raidWasHeld = (key) => _held.includes(key);
export const raidHeldFor = (key) => _held.includes(key) || (() => { const r = raidByKey(key); return !!r && !r.staff && raidHeld(r); })();

function objWordOf(raid) {
  const kind = kindOf(raid), k = RAID_KIND_ORDER.indexOf(kind), o = objOf(raid);
  if (kind === 'waves') return o.said >= 0 ? [k, o.said, raid.ld ? 1 : 0] : null;
  if (kind === 'defend') {
    const b = _live.find((e) => e.key === raidKey(raid) && e.kind === 'bearer' && !e.foe.dead);
    if (!b && !raid.sacked && !o.post) return null;
    const pct = b ? Math.round((100 * Math.max(0, b.foe.entity?.health ?? 0)) / Math.max(1, b.foe.entity?.maxHealth ?? 1)) : (raid.sacked ? 0 : Math.round(100 * o.share));
    return [k, Math.max(0, Math.min(100, pct)), raid.sacked ? 1 : 0];
  }
  if (kind === 'escort') return o.way || raid.safe || raid.lost ? [k, Math.min(raid.safe | 0, RAID_OBJ_WORD_MAX), Math.min(raid.lost | 0, RAID_OBJ_WORD_MAX)] : null;
  return null;
}
// Matches `RAID_OBJ_MAX` in `world/raidShared.js`; `validRaidObjWords` drops any entry with a larger count.
const RAID_OBJ_WORD_MAX = 100;
function kindStep(raid, dt) {
  const kind = kindOf(raid);
  objOf(raid).clock += dt;
  if (kind === 'waves') return wavesStep(raid, dt);
  if (kind === 'defend') return defendStep(raid);
  if (kind === 'escort') return escortStep(raid, dt);
  return null;
}
function objDetail(r) {
  const kind = kindOf(r);
  if (r.staff || kind === 'classic') return '';
  const w = objNow(r);
  if (!w) return '';
  if (kind === 'waves') return raidObjectiveDetail(kind, { wave: w[1], of: (r.plan ??= raidWavePlan(r.attackAmount)).sizes.length });
  if (kind === 'defend') return raidObjectiveDetail(kind, { pct: w[1], fallen: w[2] === 1 });
  return raidObjectiveDetail(kind, { safe: w[1], lost: w[2], of: RAID_REFUGEES });
}
export const RAID_HELD_REP = 3;
export function grantRaidHeldReputation(ctx, region) {
  const player = ctx?.player, store = ctx?.store;
  if (!player || !store?.dict) return false;
  const rep = legalRepOf(player, region);
  changeLegalRep(player, region, Math.min(LEGAL_REP_MAX, Math.max(LEGAL_REP_MIN, rep + RAID_HELD_REP)) - rep, { kind: 'raid' });
  const people = findFactionByTypeAndRegion(store.dict, FACTION_TYPES.People, region);
  if (people && people.region === region) changeReputation(store, people.id, RAID_HELD_REP, false);
  return true;
}
function objNow(raid) {
  const key = raidKey(raid);
  if (_myClaims.has(key) || !sharedClockOn()) return objWordOf(raid);
  const p = _peerObj.get(key);
  return p && localNow() - p.at <= RAID_WORD_STALE_MS ? [p.k, p.a, p.b] : null;
}
// Lines fire only past the saved high-water mark `raid.ow`, so crossing words from two runners never repeat a line.
function sayObjective(raid, w) {
  if (!w) return;
  if (!raid.asked) { raid.asked = true; const ask = raidKindAsk(RAID_KIND_ORDER[w[0]], raid.locationName); if (ask) say(ask, raid); }
  const was = raid.ow ?? [-1, -1, -1];
  const kind = RAID_KIND_ORDER[w[0]], town = raid.locationName;
  if (kind === 'waves' && w[1] > was[1]) {
    const plan = raid.plan ??= raidWavePlan(raid.attackAmount);
    say(w[1] < plan.sizes.length ? raidWaveLine(w[1] + 1, plan.sizes.length, town) : raidLeaderLine(raidLeaderName(raid.type), town), raid);
  }
  if (kind === 'defend' && w[2] === 1 && was[2] !== 1) say(raidBearerFellLine(town), raid);
  if (kind === 'escort') {
    for (let n = Math.max(0, was[1]) + 1; n <= w[1]; n++) say(raidRefugeeSafeLine(n, RAID_REFUGEES), raid);
    if (w[2] > Math.max(0, was[2])) say(raidRefugeeLostLine(), raid);
  }
  raid.ow = [w[0], Math.max(was[1], w[1]), Math.max(was[2], w[2])];
}
function adoptObjective(raid) {
  const at = _myClaims.get(raidKey(raid));
  if (raid.adoptedAt === at) return;
  raid.adoptedAt = at;
  const o = objOf(raid), p = _peerObj.get(raidKey(raid));
  if (raid.ld) o.leaderFell = o.clock;
  if (kindOf(raid) === 'defend' && p && p.b !== 1) o.share = Math.min(o.share, p.a / 100);
}
function foldObjective(raid, w, t) {
  const kind = kindOf(raid);
  if (kind === 'waves') { raid.wv = Math.max(raid.wv ?? -1, w.a); if (w.b === 1) raid.ld = true; }
  if (kind === 'defend') { if (w.b === 1) raid.sacked = true; else raid.stAt = t; }
  if (kind === 'escort') { raid.safe = Math.max(raid.safe | 0, w.a); raid.lost = Math.max(raid.lost | 0, w.b); }
}
export const RAID_STANDARD_FRESH_MS = 60000;
// Reads the folded raid state, not the latest message, because the runner's last message can race the relay cleanse.
export function raidHeld(raid) {
  const kind = kindOf(raid);
  if (kind === 'waves') return !!raid.ld || objOf(raid).leaderFell > -Infinity || (raid.wv ?? -1) >= (raid.plan ??= raidWavePlan(raid.attackAmount)).sizes.length;
  if (kind === 'defend') return !raid.sacked && raid.stAt != null && localNow() - raid.stAt <= RAID_STANDARD_FRESH_MS;
  if (kind === 'escort') return (raid.safe | 0) >= RAID_REFUGEES_HOLD;
  return false;
}
function letGoAllies(key) {
  if (!sharedClockOn()) return;
  const h = host(), sites = h.sites?.() ?? null;
  for (const e of _live) {
    if (e.key !== key || (e.kind !== 'bearer' && e.kind !== 'refugee') || e.foe.dead || e.done) continue;
    if (e.kind === 'bearer') sites?.releaseBearer?.(e.foe); else h.removeFoe?.(e.foe);
    e.gone = true;
  }
  _live = _live.filter((e) => !e.gone);
}

function kindPackStep(raid, room, min, max, gapS, near = undefined) {
  const key = raidKey(raid);
  if (_pack && (_pack.key !== key || _pack.left <= 0)) _pack = null;
  if (room <= 0) { _pack = null; _nextSpawnIn = 1; return 'idle'; }
  if (!_pack) { const size = Math.min(room, rangeInt(min, max + 1, rnd())); _pack = { key, left: size, size, at: null, far: true, near: near ?? staffPackPlayer()?.slice() ?? null, kind: true }; }
  const pack = _pack;
  const o = muster.place(raid, pack.size);
  if (!o) { _nextSpawnIn = 1; return 'idle'; }
  pack.left--;
  _nextSpawnIn = pack.left > 0 ? STAFF_PACK_STEP_S : gapS;
  spawn(raid, 'raider', chooseRaider(raid.type, rnd()), o, pack);
  return 'raider';
}

// With a raid relay, no wave spawns until its ledger count arrives, so a late arrival does not restart from the
// first wave.
function wavesStep(raid, dt) {
  const key = raidKey(raid), o = objOf(raid), plan = raid.plan ??= raidWavePlan(raid.attackAmount), t = o.clock;
  if (raidRelayOn() && !_relay.has(key)) return 'idle';
  const kills = townKills(raid), at = raidWaveAt(plan, kills);
  if (kills !== o.stallK) { o.stallK = kills; o.stall = 0; } else o.stall += dt;
  const stalled = o.stall >= RAID_WAVE_STALL_S;
  if (at.wave !== o.wave) { if (o.wave >= 0) o.breather = t + RAID_WAVE_BREATHER_S; o.wave = at.wave; _pack = null; }
  if (t < o.breather) return 'idle';
  o.said = o.wave;
  raid.wv = Math.max(raid.wv ?? -1, o.wave);
  const puppets = (host().raidPuppets?.() ?? []).filter((p) => p._pupRaid === key && !p.dead);
  if (at.wave >= plan.sizes.length) {
    if (at.left <= 0 || _nextSpawnIn > 0 || t - o.leaderFell < RAID_LEADER_AGAIN_S) return 'idle';
    if (_live.some((e) => e.key === key && e.leader && !e.foe.dead) || puppets.some((p) => p.entity?.raidLeader)) return 'idle';
    if (!stalled && (liveRaiders(key).length || puppets.length)) return 'idle';
    _nextSpawnIn = RAID_WAVE_PACK_GAP_S; o.stall = 0;
    spawn(raid, 'leader', raidLeaderOf(raid.type), { ...(staffBossPlace() ?? {}), min: RAID_SPAWN_MAX_DISTANCE / 2, max: RAID_SPAWN_MAX_DISTANCE, los: false });
    return 'leader';
  }
  if (_nextSpawnIn > 0) return 'idle';
  const standing = liveRaiders(key).length;
  const room = stalled ? Math.min(at.left, RAID_WAVE_PACK_MAX, MAX_RAID_ENEMIES - standing) : Math.min(at.left, MAX_RAID_ENEMIES) - standing - puppets.length;
  const k = kindPackStep(raid, room, RAID_WAVE_PACK_MIN, RAID_WAVE_PACK_MAX, RAID_WAVE_PACK_GAP_S);
  if (k === 'raider' && stalled) o.stall = 0;
  return k;
}

function siteOf(o, field, ask) {
  if (o[field] === undefined || (o[field] === null && o.clock >= o.siteAt)) {
    o[field] = ask() ?? null;
    if (!o[field]) o.siteAt = o.clock + RAID_SITE_AGAIN_S;
  }
  return o[field];
}
function defendStep(raid) {
  const key = raidKey(raid), o = objOf(raid), h = host();
  if (!siteOf(o, 'post', () => h.sites?.()?.square(raid))) return null;
  const b = _live.find((e) => e.key === key && e.kind === 'bearer');
  if (b && !b.foe.dead && b.foe.entity) { o.share = Math.max(0, b.foe.entity.health) / Math.max(1, b.foe.entity.maxHealth); raid.stAt = localNow(); }
  if (!raid.sacked && !b) { spawn(raid, 'bearer', null, o.post); return 'bearer'; }
  if (_nextSpawnIn > 0) return 'idle';
  return kindPackStep(raid, Math.min(RAID_DEFEND_PACK_MAX, MAX_RAID_ENEMIES - liveRaiders(key).length), 2, RAID_DEFEND_PACK_MAX, RAID_DEFEND_PACK_GAP_S, alongSquare(o.post));
}
const alongSquare = (post) => { const a = rnd()() * Math.PI * 2; return [post[0] + Math.sin(a) * RAID_DEFEND_FROM_M, post[1], post[2] + Math.cos(a) * RAID_DEFEND_FROM_M]; };

function escortStep(raid, dt) {
  const key = raidKey(raid), o = objOf(raid), h = host();
  if (!siteOf(o, 'way', () => h.sites?.()?.way(raidSideOf(raid), raid))) return null;
  if (!o.len) o.len = wayLength(o.way);
  if (o.way.length < 2) return null;
  const end = o.way[o.way.length - 1];
  const walkers = _live.filter((e) => e.key === key && e.kind === 'refugee' && !e.done);
  for (const e of walkers) {
    const f = e.foe.ai?.feet;
    if (e.foe.dead) { e.done = true; if (e.foe.corpse) raid.lost = (raid.lost | 0) + 1; }
    else if (f && Math.hypot(f[0] - end[0], f[2] - end[2]) <= RAID_REFUGEE_SAFE_M) { e.done = true; e.routed = true; raid.safe = (raid.safe | 0) + 1; }
  }
  const alive = walkers.filter((e) => !e.done);
  const still = RAID_REFUGEES - (raid.safe | 0) - (raid.lost | 0) - alive.length;
  if (alive.length && still <= 0) {
    const g = alongWay(o.way, o.guide);
    const lag = Math.min(...alive.map((e) => (e.foe.ai?.feet ? Math.hypot(e.foe.ai.feet[0] - g[0], e.foe.ai.feet[2] - g[2]) : Infinity)));
    if (lag <= RAID_REFUGEE_WAIT_M) o.guide = Math.min(o.len, o.guide + RAID_REFUGEE_PACE * dt);
  }
  if (still > 0 && !_pending) {
    const i = RAID_REFUGEES - still;
    o.guide = Math.max(o.guide, Math.min(o.len, 2 + (RAID_REFUGEES - 1) * RAID_REFUGEE_GAP_M));
    spawn(raid, 'refugee', null, { at: alongWay(o.way, Math.max(0, o.guide - 2 - i * RAID_REFUGEE_GAP_M)), follow: refugeeFollow(o, i) });
    return 'refugee';
  }
  if (!alive.length && still <= 0) return null;
  if (_nextSpawnIn > 0 || !alive.length) return 'idle';
  return kindPackStep(raid, Math.min(RAID_ESCORT_PACK_MAX, MAX_RAID_ENEMIES - liveRaiders(key).length), 2, RAID_ESCORT_PACK_MAX, RAID_ESCORT_PACK_GAP_S, alongWay(o.way, o.guide + RAID_ESCORT_AHEAD_M));
}
function refugeeFollow(o, i) {
  return {
    feet: () => alongWay(o.way, o.guide),
    stop: 1.2 + i * 0.9,
    leash: 3,
    trail: () => {
      if (o.trailAt !== o.guide) { o.trailAt = o.guide; o.trail = wayTo(o.way, o.guide); }
      return o.trail;
    },
  };
}
function wayTo(pts, s) {
  const out = [pts[0]];
  let left = s;
  for (let i = 1; i < pts.length && left > 0; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]);
    if (left >= d) { out.push(pts[i]); left -= d; } else { out.push(alongWay(pts, s)); left = 0; }
  }
  return out;
}
const raidSideOf = (raid) => (raid.startMinute + raid.attackAmount + raid.locationIndex) % 4;

export function raidOffsetAll(d) {
  const shift = (p) => { if (Array.isArray(p)) { p[0] += d[0]; p[1] += d[1]; p[2] += d[2]; } };
  for (const r of state.raids) {
    const o = r.obj;
    if (!o) continue;
    shift(o.post);
    if (Array.isArray(o.way)) for (const p of o.way) shift(p);
    o.trail = null; o.trailAt = -1;
  }
  if (_pack?.kind) { shift(_pack.at); shift(_pack.near); }
  muster.offsetAll(d);
}

function aimRaider(raid, foe) {
  const key = raidKey(raid), kind = kindOf(raid);
  const goal = kind === 'defend' ? _live.find((e) => e.key === key && e.kind === 'bearer' && !e.foe.dead)?.foe
    : kind === 'escort' ? (() => { const a = _live.filter((e) => e.key === key && e.kind === 'refugee' && !e.done && !e.foe.dead); return a.length ? a[Math.floor(rnd()() * a.length)].foe : null; })() : null;
  if (goal?.ai?.feet && foe?.ai?.makeEnemyHostileToAttacker) foe.ai.makeEnemyHostileToAttacker(goal, goal.ai.feet, RAID_AIM_TICKS);
}

export function raidObjWord() {
  const now = (host().now ?? worldMinutes)();
  const out = [];
  for (const r of state.raids) {
    if (out.length >= RAID_WORDS_MAX) break;
    if (!raidActive(r, now) || !_myClaims.has(raidKey(r))) continue;
    const w = objWordOf(r);
    if (w) out.push([raidKey(r), ...w]);
  }
  return out.length ? out : null;
}
export function raidObjPeerWord(from, raw, t = localNow()) {
  if (typeof from !== 'string' || !from) return 0;
  let n = 0;
  for (const w of validRaidObjWords(raw)) {
    const raid = raidByKey(w.key);
    if (!raid || raid.staff || RAID_KIND_ORDER[w.k] !== kindOf(raid)) continue;
    _peerObj.set(w.key, { from, k: w.k, a: w.a, b: w.b, at: t });
    foldObjective(raid, w, t);
    n++;
  }
  return n;
}

const localNow = () => (host().wallNow ?? (() => performance.now()))();
export function raidKillTotal(raid) {
  let n = raid.killed;
  for (const e of _peerWords.get(raidKey(raid))?.values() ?? []) n += e.n;
  return n;
}
function runsRaid(raid) {
  const h = host(), key = raidKey(raid), t = localNow();
  const me = h.selfId?.() ?? null;
  if (!me) return false;
  const claims = [];
  for (const [id, e] of _peerWords.get(key) ?? []) if (e.since != null && t - e.at <= RAID_WORD_STALE_MS) claims.push({ id, age: t - e.since });
  if (_myClaims.has(key)) claims.push({ id: me, age: t - _myClaims.get(key) });
  let runner = raidRunnerOf({ me, inTown: h.peersInTown?.() ?? [], claims });
  if (!claims.length && runner !== me) {
    if (!_unclaimedSince.has(key)) _unclaimedSince.set(key, t);
    if (t - _unclaimedSince.get(key) >= RAID_CLAIM_GRACE_MS) runner = me;
  } else _unclaimedSince.delete(key);
  if (runner !== me) { _myClaims.delete(key); return false; }
  if (!_myClaims.has(key)) _myClaims.set(key, t);
  return true;
}
export function raidPeerWord(from, raw, t = localNow(), ro = undefined) {
  if (typeof from !== 'string' || !from) return 0;
  if (ro !== undefined) raidObjPeerWord(from, ro, t);
  const words = validRaidWords(raw);
  for (const w of words) {
    let m = _peerWords.get(w.key);
    if (!m) { m = new Map(); _peerWords.set(w.key, m); }
    const e = m.get(from) ?? { n: 0, since: null, at: t };
    e.n = Math.max(e.n, w.n);
    e.since = w.age >= 0 ? t - w.age : null;
    e.at = t;
    m.set(from, e);
  }
  return words.length;
}
// Kills cap at 999 to match `RAID_KILLS_WIRE_MAX` in `world/raidShared.js`, which drops larger words.
export function raidWireWord(t = localNow()) {
  const now = (host().now ?? worldMinutes)();
  const out = [];
  for (const r of allRaids()) {
    if (out.length >= RAID_WORDS_MAX) break;
    const key = raidKey(r);
    if (!raidActive(r, now) || (!_myClaims.has(key) && r.killed === 0)) continue;
    out.push([key, Math.min(r.killed, 999), _myClaims.has(key) ? Math.max(0, Math.round(t - _myClaims.get(key))) : -1]);
  }
  return out.length ? out : null;
}

export const raidRelayOn = () => sharedClockOn() && !!host().relayRaids?.();
const raidByKey = (key) => state.raids.find((r) => raidKey(r) === key) ?? null;
const raidSigOf = (raid) => raidSig({ st: raid.startMinute, tg: raid.attackAmount, ty: raid.type, px: raid.px, py: raid.py });
// Match both key and signature: a forged word can name an honest key with its own tuple, and its cleanse must not
// close this raid.
const raidOfWord = (key, g) => { const r = raidByKey(key); return r && raidSigOf(r) === g ? r : null; };
function sayToRelay(raid, t = localNow()) {
  const key = raidKey(raid), n = Math.min(raid.killed, RAID_WORD_KILLS_MAX), s = raid.struck ? 1 : 0;
  if (_lastWord && _lastWord.key === key && _lastWord.n === n && _lastWord.s === s && t - _lastWord.at < RAID_WORD_MS) return false;
  const word = { k: 'w', key, st: raid.startMinute, tg: raid.attackAmount, ty: raid.type, px: raid.px, py: raid.py, n, s };
  if (!host().sendRaid?.(word, worldRoom(raid.px, raid.py))) return false;
  _lastWord = { key, n, s, at: t };
  return true;
}
export function raidRelayWord(f, room = null) {
  if (!f || typeof f !== 'object') return false;
  if (f.k === 'sev') return staffRelayWord(f.sev, room);
  if (f.k === 'rc') {
    const c = readRaidReceipt(f.r);
    if (!c || _receipts.get(c.w) === f.r) return false;
    _receipts.delete(c.w);
    _receipts.set(c.w, f.r);
    while (_receipts.size > RAID_RECEIPTS_KEPT) _receipts.delete(_receipts.keys().next().value);
    host().onRaidReceipt?.(f.r, c, raidHeldFor(c.w));
    return true;
  }
  if (f.k === 'cls') {
    for (const [key, , g] of Array.isArray(f.l) ? f.l : []) { const r = raidOfWord(key, g); if (r && !r.cleansed) cleanse(r, { said: false }); }
    return true;
  }
  const raid = raidOfWord(f.key, f.g);
  if (f.k === 'st') {
    if (!raid) return false;
    _relay.set(f.key, { n: f.n, tg: f.tg, c: f.c });
    if (f.c > 0 && !raid.cleansed) cleanse(raid);
    return true;
  }
  if (f.k === 'cl') {
    if (!raid || raid.cleansed) return false;
    const inRegion = raid.announced && (host().regionIndex?.() ?? -1) === raid.regionIndex;
    cleanse(raid, { said: (typeof room === 'string' && isCellRoom(room)) || inRegion, top: f.top, n: f.n });
    return true;
  }
  return false;
}
export const raidRelayState = (key) => _relay.get(key) ?? null;
export const raidReceipt = (key) => _receipts.get(key) ?? null;

// Outside the party range 0 to 2 and distinct from the -1 day-roll value that `scheduleNextSpawn` receives.
export const STAFF_RAID_TYPE = 9;
export const STAFF_SPAWN_INTERVAL_MIN_S = 0.5;
export const STAFF_SPAWN_INTERVAL_MAX_S = 2;
export const STAFF_PACK_MIN = 3;
export const STAFF_PACK_MAX = 5;
export const STAFF_PACK_FAR_MIN = 20;
export const STAFF_PACK_FAR_MAX = 60;
export const STAFF_PACK_NEAR = 6;
export const STAFF_PACK_STEP_S = 0.15;
export const STAFF_PACK_FILL_MIN_S = 20;
export const STAFF_PACK_FILL_MAX_S = 45;
/**
 * @param {number} paceS
 * @param {number} size
 */
export const staffPackGapS = (paceS, size) => paceS * size / (MAX_RAID_ENEMIES - 1);
/**
 * @param {number} paceS
 * @param {number} size
 */
const packWaitS = (paceS, size) => Math.max(STAFF_PACK_STEP_S, staffPackGapS(paceS, size) - STAFF_PACK_STEP_S * (size - 1));
/** @param {() => number} roll */
export const staffPackPaceS = (roll) => rangeFloat(STAFF_PACK_FILL_MIN_S * (MAX_RAID_ENEMIES - 1) / (MAX_RAID_ENEMIES - STAFF_PACK_MAX), STAFF_PACK_FILL_MAX_S, roll);
let _pack = null;
/**
 * @param {any} raid
 * @param {number} standing
 */
function staffPackStep(raid, standing) {
  const key = raidKey(raid);
  if (_pack && (_pack.key !== key || _pack.left <= 0)) _pack = null;
  const sc = staffPackScale(host().peerFeetInTown?.()?.length ?? 1);
  if (!staffRaidRoom(raid, standing, sc.cap)) { _pack = null; scheduleNextSpawn(raid.type); return 'idle'; }
  raid.fillS ??= staffPackPaceS(rnd());
  if (!_pack) { const size = rangeInt(STAFF_PACK_MIN, STAFF_PACK_MAX + 1, rnd()); _pack = { key, left: size, size, at: null, far: true, near: staffPackPlayer() }; }
  const pack = _pack;
  pack.left--;
  const o = pack.at ? { at: pack.at, min: 1.5, max: STAFF_PACK_NEAR, los: false }
    : pack.far ? { min: STAFF_PACK_FAR_MIN, max: STAFF_PACK_FAR_MAX, los: false, near: pack.near } : { min: RAID_SPAWN_MIN_DISTANCE, max: RAID_SPAWN_MAX_DISTANCE, los: false, near: pack.near };
  _nextSpawnIn = pack.left > 0 ? STAFF_PACK_STEP_S : packWaitS(raid.fillS / sc.speed, pack.size);
  spawn(raid, 'raider', staffRaider(raid, rnd()), o, pack);
  return 'raider';
}
/**
 * @param {number} players
 * @returns {{ cap: number, speed: number }}
 */
export function staffPackScale(players) {
  const more = Math.max(0, (Number.isFinite(players) ? Math.floor(players) : 1) - 1);
  return { cap: Math.min(STAFF_PACK_CAP_MAX, MAX_RAID_ENEMIES + STAFF_PACK_CAP_PER * more), speed: Math.min(2, 1 + 0.25 * more) };
}
// Keep at or below `RAID_PUPPETS_MAX` in `world/raidShared.js`, or other players cannot show every monster.
export const STAFF_PACK_CAP_MAX = 40;
export const STAFF_PACK_CAP_PER = 5;
function staffPackPlayer() {
  const me = host().selfId?.() ?? '';
  const all = [[me, null], ...(host().peerFeetInTown?.() ?? []).filter(([id, f]) => id !== me && Array.isArray(f))].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return all[_packTurn++ % all.length][1];
}
/**
 * @param {[string, number[], number][]} players
 * @returns {[string, number[], number]|null}
 */
export function staffBossSpot(players) {
  let best = null, bestN = -1, bestLv = -1;
  for (const p of players) {
    if (!Array.isArray(p?.[1])) continue;
    const near = players.filter((q) => Array.isArray(q?.[1]) && Math.hypot(q[1][0] - p[1][0], q[1][2] - p[1][2]) <= STAFF_BOSS_GROUP_M);
    const lv = Math.max(...near.map((q) => (Number.isFinite(q[2]) ? q[2] : 0)));
    if (near.length > bestN || (near.length === bestN && (lv > bestLv || (lv === bestLv && p[0] < best[0])))) { best = p; bestN = near.length; bestLv = lv; }
  }
  return best;
}
export const STAFF_BOSS_GROUP_M = 30;
function staffBossPlace() {
  const me = host().selfId?.() ?? '';
  const at = staffBossSpot(host().peerFeetInTown?.() ?? []);
  return at && at[0] !== me ? { near: at[1] } : undefined;
}
let _packTurn = 0;
/**
 * @param {any[]} puppets
 * @param {number} now
 */
function staffPuppetKills(puppets, now) {
  for (const pup of puppets) {
    if (!pup.dead || !pup.corpse || _pupKilled.has(pup) || renownStruckAt(pup) == null || pup.entity?.staffBoss) continue;
    const r = staffRaidOfKey(pup._pupRaid);
    if (!r || !raidActive(r, now)) continue;
    _pupKilled.add(pup);
    r.mine++;
  }
}
let _pupKilled = new WeakSet();
/**
 * @param {any} raid
 * @param {number} t
 */
function staffClearLong(raid, t) {
  raid.clearSince ??= t;
  return t - raid.clearSince >= STAFF_BOSS_CLEAR_MAX_MS;
}
export const STAFF_BOSS_CLEAR_MAX_MS = 120000;
/**
 * @param {any} raid
 * @param {any} h
 */
function staffFieldClear(raid, h) {
  const key = raidKey(raid);
  const pups = h.raidPuppets?.() ?? [];
  raid.clearWait ??= new Set([...liveRaiders(key).map((e) => e.foe), ...pups.filter((pup) => pup._pupRaid === key && !pup.dead && !pup.entity?.staffBoss)]);
  for (const f of raid.clearWait) if (!f.dead && (_live.some((e) => e.foe === f) || pups.includes(f))) return false;
  return true;
}
/**
 * @param {any} raid
 * @param {any} h
 */
function staffBossStanding(raid, h) {
  const key = raidKey(raid);
  if (_live.some((e) => e.key === key && e.boss && !e.foe.dead)) return true;
  return (h.raidPuppets?.() ?? []).some((pup) => pup._pupRaid === key && !pup.dead && pup.entity?.staffBoss);
}
function tookStaffBoss(f) {
  if (!f?.entity?.staffBoss || f.entity.staffBoss.mid) return !!f?.entity?.staffBoss;
  const r = staffRaids().find((x) => x.key === f.raidKey);
  if (r) { r.bossUp = 1; r.bossDown = 0; }
  return true;
}
function staffPlaceName(r) {
  if (r.locationIndex >= 0) {
    const town = regionsNow()?.find((x) => x.region === r.regionIndex)?.towns.find((t) => t.index === r.locationIndex);
    if (town?.name) return town.name;
  }
  return r.locationName || regionName(r.regionIndex);
}
const kindName = (t) => enemyDisplayName(t) ?? 'monster';
const staffCity = (r) => r.locationIndex >= 0 && (r.staff?.ct === 1 || !!regionsNow()?.find((x) => x.region === r.regionIndex)?.towns.some((t) => t.index === r.locationIndex));
export const staffAttackLine = (r) => r.staff?.tx || (staffCity(r)
  ? t('staffEvent.attackCity', 'The city of {place} is under attack.', { place: staffPlaceName(r) })
  : t('staffEvent.attackArea', 'The area of {place} is under attack.', { place: staffPlaceName(r) }));
export const staffBossLine = (r) => r.staff?.bl || (staffCity(r)
  ? t('staffEvent.bossCity', 'A mighty {kind} has come to the city of {place}.', { kind: kindName(r.staff.b), place: staffPlaceName(r) })
  : t('staffEvent.bossArea', 'A mighty {kind} has come to the area of {place}.', { kind: kindName(r.staff.b), place: staffPlaceName(r) }));
export function staffEndLine(r) {
  if (r.staff?.el) return r.staff.el;
  const city = staffCity(r), args = { kind: kindName(r.staff.b), place: staffPlaceName(r) };
  if (r.bossDown) return city ? t('staffEvent.bossFellCity', 'The {kind} has fallen. The city of {place} is safe.', args) : t('staffEvent.bossFellArea', 'The {kind} has fallen. The area of {place} is safe.', args);
  return city ? t('staffEvent.overCity', 'The attack on the city of {place} is over.', args) : t('staffEvent.overArea', 'The attack on the area of {place} is over.', args);
}
function sayToCell(raid, t = localNow()) {
  const w = validStaffEventIn({ k: 'w', id: raid.staff.id, px: raid.px, py: raid.py, n: Math.min(raid.killed, 9999), s: raid.struck ? 1 : 0, bu: raid.bossUp, bk: raid.bossDown, fb: Math.max(0, raid.bossFc), h: Math.min(raid.mine ?? 0, 9999), mu: raid.midStood ?? 0 });
  if (!w) return false;
  const sig = `${w.n}.${w.s}.${w.bu}.${w.bk}.${w.fb}.${w.h}.${w.mu}`;
  if (_lastStaffWord && _lastStaffWord.id === w.id && _lastStaffWord.sig === sig && t - _lastStaffWord.at < RAID_WORD_MS) return false;
  if (!host().sendRaid?.(w, worldRoom(raid.px, raid.py))) return false;
  _lastStaffWord = { id: w.id, sig, at: t };
  return true;
}
let _lastStaffWord = null;
/** @type {{ key: string, left: number, at: number[] }|null} */
let _wave = null;
function staffRelayWord(sev, room) {
  if (!sev) return false;
  if (sev.k === 'ev') { staffEventBook(sev.l); return true; }
  if (sev.k === 'an') {
    const r = staffRaidOfKey(staffEventKey(sev.id));
    if (!r || r.announced || !r.staff.an) return false;
    r.announced = true;
    say(staffAttackLine(r), r);
    host().cry?.('scream', r);
    return true;
  }
  if (sev.k === 'end') return staffEventEnd(sev.id, sev.why);
  if (sev.k === 'st') return typeof room === 'string' && isCellRoom(room) && staffEventLedger(sev);
  if (sev.k === 'bd') {
    const r = staffRaidOfKey(staffEventKey(sev.id));
    if (!r || _staffBoards.has(sev.id) || !sev.top.length) return false;
    _staffBoards.add(sev.id);
    say(staffBoardLine(sev.top), r);
    return true;
  }
  if (sev.k === 'rc') {
    const c = readStaffReceipt(sev.r);
    const key = c ? `sev:${c.v}` : null;
    if (!c || !key || _receipts.get(key) === sev.r) return false;
    _receipts.delete(key);
    _receipts.set(key, sev.r);
    while (_receipts.size > RAID_RECEIPTS_KEPT) _receipts.delete(_receipts.keys().next().value);
    host().onRaidReceipt?.(sev.r, c);
    return true;
  }
  return false;
}
const _staffBoards = new Set();
/** @param {[string, number, number][]} top */
export function staffBoardLine(top) {
  const who = t('staffEvent.boardWho', 'A fighter');
  const list = top.map(([name, n, k], i) => [name || who, n, k]).map(([nm, n, k], i) => (k ? t('staffEvent.boardRowKiller', '{rank}. {name} ({kills}, the killing blow)', { rank: i + 1, name: nm, kills: n }) : t('staffEvent.boardRow', '{rank}. {name} ({kills})', { rank: i + 1, name: nm, kills: n }))).join(', ');
  return t('staffEvent.board', 'The top fighters: {list}', { list });
}
/**
 * @param {(minute: number) => number} relayOf
 * @param {(region: number) => (string|undefined)} [regionName]
 * @param {number} [aheadMs]
 */
export function raidTimerList(relayOf, regionName = () => '', aheadMs = 0) {
  const row = (r) => {
    const led = raidRelayState(raidKey(r));
    return {
      name: r.locationName, region: regionName(r.regionIndex) ?? '', type: raidTypeName(r.type), startMs: relayOf(r.startMinute), endMs: relayOf(r.endMinute),
      done: !!r.cleansed, px: r.px, py: r.py, key: raidKey(r), n: Number.isFinite(led?.n) ? led.n : null, tg: Number.isFinite(led?.tg) ? led.tg : null,
      kind: raidKindName(kindOf(r)), obj: objDetail(r),
    };
  };
  const out = state.raids.map(row);
  const next = state.lastSelectedDay + 1, now = (host().now ?? worldMinutes)(), turn = next * MINUTES_PER_DAY;
  if (aheadMs > 0 && Number.isFinite(next) && turn > now && relayOf(turn) - relayOf(now) <= aheadMs) {
    if (_ahead.day !== next) { const regions = regionsNow(); if (regions) _ahead = { day: next, raids: raidsForDay(next, regions).filter((r) => !isWildRegion(r.regionIndex)) }; }
    if (_ahead.day === next) out.push(..._ahead.raids.map(row));
  }
  return out;
}
let _ahead = { day: NaN, raids: [] };
export const raidRegionNow = () => { try { return host().regionIndex?.() ?? -1; } catch { return -1; } };

let _installed = false;
export function installRaidingParties() {
  if (_installed) return false;
  _installed = true;
  registerModSaveData(RAIDING_PARTIES_VENDOR, { newSaveData: newRaidSaveData, getSaveData: getRaidSaveData, restoreSaveData: restoreRaidSaveData });
  return true;
}

/**
 * @param {string} h
 * @returns {Promise<string|null>}
 */
export async function raidTownsFor(h) {
  const regions = regionsNow();
  if (!regions?.length) return null;
  if (_townsText == null) {
    const text = raidTownsCanon(regions);
    const hash = await raidTownsHash(text);
    if (_townsText == null) { _townsText = text; _townsHash = hash; if (hash) console.info(`[raid] this world's towns table: ${hash}`); }
  }
  return _townsHash && _townsHash === h ? _townsText : null;
}
let _townsText = null, _townsHash = null;

export function _resetRaidingParties() {
  state = newRaidSaveData(); _live = []; _pending = null; _nextSpawnIn = 0; _nextDefenderIn = 0; _sweepIn = 0;
  _lastRegion = -1; _regions = null; _host = null; _installed = false; _townsText = null; _townsHash = null;
  _peerWords = new Map(); _myClaims = new Map(); _unclaimedSince = new Map();
  _relay = new Map(); _receipts = new Map(); _lastWord = null; _ahead = { day: NaN, raids: [] }; _staffBoards.clear(); _pupKilled = new WeakSet(); _pack = null; _packTurn = 0;
  _peerObj = new Map(); _held = [];
}
export const _raidRuntime = () => ({ live: _live.slice(), pending: _pending, nextSpawnIn: _nextSpawnIn, nextDefenderIn: _nextDefenderIn });
