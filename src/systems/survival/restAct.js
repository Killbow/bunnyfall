// Online rest act: a night runs the timed rest session to its end in one call, so it matches an eight-hour rest.
import { RestSession, REST_TEXT, REST_WAIT_PER_HOUR, MINUTES_PER_TICK } from '../../player/restSession.js';
import { restCost, REST_KIND } from './rest.js';
import { paySleep } from './needs.js';
import { liveVampirism } from '../../afflictions/racialLive.js';
import { roomRemainingHours } from '../../trade/tavern.js';
import { BY_FIRE_REACH } from './camp.js';

export const NIGHT_HOURS = 8;
export const NIGHT_MINUTES = NIGHT_HOURS * 60;
export const NIGHT_INTERVAL_MINUTES = 0;
export const OWN_MINUTES_PER_REAL_MINUTE = 12;
export const REST_CHANNEL_SECONDS = 6;

export const REST_ACT_TEXT = Object.freeze({
  noPoint: 'Find a fire or a bed to rest.',
  inTown: 'It is illegal to camp in town.',
  shortRest: 'You rest a while.',
  choose: 'How would you like to rest?',
  longChoice: 'Long Rest',
  shortChoice: 'Short Rest',
  interrupted: 'Your rest is interrupted.',
  channel: (where) => `Resting by the ${where}...`,
  channelBed: 'Resting...',
  meditating: 'Meditating by the candle...',
  noVote: 'Online there is no vote. Each player rests for themselves at a fire, tent or bed.',
  nextNight: (minutes) => `A night can pass again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
  rested: 'Next night',
  carried: (name) => `${name} rests here, and you rest with them through the night.`,
  carriedShort: (name) => `${name} rests here, and you rest a while with them.`,
  carriedSkipped: (name) => `${name} rests here, but you are too busy to rest with them.`,
  carriedFar: (name) => `${name} rested a night without you. Come within 15 m of them to rest with the party.`,
  carriedTown: (name) => `${name} rests here, but it is illegal to camp in town.`,
  campWait: (name) => `Resting with ${name}...`,
});

export const BED_STOREY_M = 1.5;
export function bedInReach(beds, pos, reach = BY_FIRE_REACH) {
  if (!pos || !beds?.length) return false;
  for (const { aabb } of beds) {
    // Dungeon floors sit about 3.2 m apart, so a bed counts only from its own floor.
    if (Math.abs(pos[1] - aabb.min[1]) > BED_STOREY_M) continue;
    const d = [0, 1, 2].map((k) => Math.max(aabb.min[k] - pos[k], 0, pos[k] - aabb.max[k]));
    if (Math.hypot(d[0], d[1], d[2]) <= reach) return true;
  }
  return false;
}

export function nightDue(entity, ownNow) {
  const at = entity?.restNightAt;
  if (!Number.isFinite(at) || !Number.isFinite(ownNow)) return true;
  return ownNow < at || ownNow - at >= NIGHT_INTERVAL_MINUTES;
}

export function nightRealMinutesLeft(entity, ownNow) {
  if (nightDue(entity, ownNow)) return 0;
  return Math.max(1, Math.ceil((NIGHT_INTERVAL_MINUTES - (ownNow - entity.restNightAt)) / OWN_MINUTES_PER_REAL_MINUTE));
}

export function stampNight(entity, ownNow) {
  if (entity && Number.isFinite(ownNow)) entity.restNightAt = Math.floor(ownNow);
}

let _night = null;
export function runRestNight(deps, { rentedHours = -1, hours = NIGHT_HOURS } = {}) {
  const s = new RestSession('timed', hours, deps, rentedHours, null);
  const step = REST_WAIT_PER_HOUR / MINUTES_PER_TICK;
  const outer = _night;
  _night = s;
  let r = null;
  // One sub-tick per call, so the latch ambushNight sets for a spawning encounter breaks the night in time.
  try { for (let i = 0; r === null && i < hours * 12 + 8; i++) r = s.tick(step); } finally { _night = outer; }
  r = r ?? s._finish(REST_TEXT.wakeUp);
  // An enemy spawned in the last sub-tick latches after the final check, so the night still ends as an enemy break.
  if (s._abortEnemySpawn && !r.died && !r.enemyBroke) {
    deps.onEnemyBreak?.();
    r = { textId: REST_TEXT.enemiesNearby, enemyBroke: true, died: false };
  }
  return { result: r, hours: s.totalHours };
}
export function ambushNight() {
  if (!_night) return false;
  _night.abortForEnemySpawn();
  return true;
}

export function actAtChannelEnd(opened, now, hpAtOpen, hpNow) {
  if (opened?.meditate) return opened;
  if (opened?.point?.where && !now?.point) return null;
  if (Number.isFinite(hpAtOpen) && Number.isFinite(hpNow) && hpNow < hpAtOpen) return null;
  return { ...opened, night: now ? !!now.night : !!opened?.night };
}

export function channelBroken(opened, pending, enemiesNearby, hpAtOpen, hpNow, restActNow = null) {
  if (pending || enemiesNearby?.()) return true;
  if (opened?.meditate) return false;
  if (Number.isFinite(hpAtOpen) && Number.isFinite(hpNow) && hpNow < hpAtOpen) return true;
  return !!opened?.point?.where && typeof restActNow === 'function' && !restActNow()?.point;
}

export const restPricedWhole = (kind, rules) => !rules || (restCost(kind, rules)?.recovery ?? 1) >= 1;

export function topUpRest(entity, kind, rules, { night = true, maxFatigueOf = (e) => e.maxFatigue ?? 0 } = {}) {
  if (!entity) return;
  const fill = (cur, max, frac) => Math.min(max, Math.round((cur ?? 0) + Math.max(0, max - (cur ?? 0)) * frac));
  const frac = restPricedWhole(kind, rules) ? 1 : night ? 0 : 0.5;
  if (frac <= 0) return;
  entity.health = fill(entity.health, entity.maxHealth ?? 0, frac);
  entity.fatigue = fill(entity.fatigue, maxFatigueOf(entity), frac);
  if (Number.isFinite(entity.maxMagicka)) entity.magicka = fill(entity.magicka, entity.maxMagicka, frac);
}

export function openChannelHeal(entity, kind, rules, { maxFatigueOf = (e) => e.maxFatigue ?? 0 } = {}) {
  if (!entity) return null;
  const frac = restPricedWhole(kind, rules) ? 1 : 0.5;
  const field = (cur, max) => {
    const from = Number.isFinite(cur) ? cur : 0;
    return { from, to: Math.min(max, Math.round(from + Math.max(0, max - from) * frac)) };
  };
  return {
    health: field(entity.health, entity.maxHealth ?? 0),
    fatigue: field(entity.fatigue, maxFatigueOf(entity)),
    magicka: Number.isFinite(entity.maxMagicka) ? field(entity.magicka, entity.maxMagicka) : null,
  };
}
export function stepChannelHeal(entity, plan, frac) {
  if (!entity || !plan) return entity?.health;
  const f = Number.isFinite(frac) ? Math.max(0, Math.min(1, frac)) : 0;
  for (const key of ['health', 'fatigue', 'magicka']) {
    const p = plan[key];
    if (!p || p.to <= p.from) continue;
    const want = Math.round(p.from + (p.to - p.from) * f);
    if (!((entity[key] ?? 0) >= want)) entity[key] = want;
  }
  return entity.health;
}
// The returned health is the new mark for a blow; without it a healing bar would hide any smaller hit.
export function channelHealTick(opened, deps, t, mark) {
  if (!opened || opened.meditate || typeof deps?.restChannelHeal !== 'function') return mark;
  const hp = deps.restChannelHeal(Math.max(0, Math.min(1, t / (opened.channelSeconds || 1))));
  return Number.isFinite(hp) ? hp : mark;
}

export function sleepShortRest(entity, kind, rules, now) {
  const s = entity?.survival;
  if (!rules || !s || typeof s !== 'object' || liveVampirism(entity)) return false;
  paySleep(s, kind, NIGHT_MINUTES, now, rules);
  return true;
}

// Rooms count nights. A room from an old save has no count, so it is read once from the hours left, before the
// night itself runs.
export function roomNightsLeft(room, nowMinutes) {
  if (!room) return 0;
  if (!Number.isFinite(room.nights)) {
    const h = roomRemainingHours(room, nowMinutes);
    room.nights = Number.isFinite(h) ? Math.max(0, Math.ceil(h / 24)) : 0;
  }
  return room.nights;
}
export function spendRoomNight(room, nowMinutes) {
  if (!room || !Number.isFinite(room.expiryMinutes)) return;
  room.nights = Math.max(0, roomNightsLeft(room, nowMinutes) - 1);
  if (room.nights === 0 && Number.isFinite(nowMinutes)) room.expiryMinutes = Math.min(room.expiryMinutes, Math.floor(nowMinutes));
}

let _nightListener = null;
export function setNightListener(fn) { const prev = _nightListener; _nightListener = typeof fn === 'function' ? fn : null; return prev; }
export const heardNight = (kind = null) => { _nightListener?.(kind); };

export const nightWhole = (r) => !!r && !r.died && !r.enemyBroke && !r.prevented;

// Every closed rest raises, as the classic rest window advances on every close; a rest that never ran does not.
export function carriedNightEnd(name, night, r, endLines = null) {
  const raise = !!r;
  if (!night) return { raise, text: REST_ACT_TEXT.carriedShort(name) };
  if (nightWhole(r)) return { raise, text: REST_ACT_TEXT.carried(name) };
  if (!r || r.died) return { raise, text: null };
  const own = r.text ?? (endLines?.(r.textId) ?? []).join(' ');
  return { raise, text: own || null };
}

// A night stamp marks the milliseconds of the pose's restStartedAt, since older builds stamp that
// field when the rest window opens. The field and its bounds stay as the wire has them.
export const PARTY_NIGHT_MARKS = Object.freeze({ [REST_KIND.Rough]: 775, [REST_KIND.Camp]: 776, [REST_KIND.Bed]: 777 });
const NIGHT_KINDS = Object.freeze(Object.keys(PARTY_NIGHT_MARKS));
const markOf = (kind) => (typeof kind === 'string' && Object.hasOwn(PARTY_NIGHT_MARKS, kind) ? PARTY_NIGHT_MARKS[kind] : PARTY_NIGHT_MARKS[REST_KIND.Camp]);
export const nightStamp = (t, kind = REST_KIND.Camp) => Math.floor(t / 1000) * 1000 + markOf(kind);
export const nightKindOf = (t) => {
  if (!Number.isFinite(t)) return null;
  const ms = ((t % 1000) + 1000) % 1000;
  for (const kind of NIGHT_KINDS) if (PARTY_NIGHT_MARKS[kind] === ms) return kind;
  return null;
};
export const isNightStamp = (t) => nightKindOf(t) !== null;

export const CAMP_MARKS = Object.freeze({ open: 774, done: 773 });
export const campStamp = (t, which) => Math.floor(t / 1000) * 1000 + (which === 'open' ? CAMP_MARKS.open : CAMP_MARKS.done);
export const campMarkOf = (t) => {
  if (!Number.isFinite(t)) return null;
  const ms = ((t % 1000) + 1000) % 1000;
  return ms === CAMP_MARKS.open ? 'open' : ms === CAMP_MARKS.done ? 'done' : null;
};

export function campNightStep(deps, act, rentedHours = -1) {
  const v = act?.night && !act.meditate ? deps.camp?.verdict?.() ?? null : null;
  if (v?.act === 'wait') return { wait: v.name || 'A party member' };
  if (v?.act === 'enemy') { deps.onEnemyBreak?.(); return { r: { textId: REST_TEXT.enemiesNearby, enemyBroke: true, died: false } }; }
  if (v?.act === 'night') {
    const r = deps.restCampNight?.(v.kind, true) ?? null;
    const end = carriedNightEnd(v.name || 'A party member', true, r, deps.endLines);
    return { r: r && end.text ? { ...r, textId: null, text: end.text } : r };
  }
  return { r: act?.night ? deps.restNight?.({ rentedHours }) : deps.restShort?.() };
}
