// @ts-check
// The bout rules for every arena fight. Pure: callers pass the clock and the dice, so the relay runs the same rules
// and two screens fed the same reports reach the same verdict.

import { DUEL_OUT_SLACK_M, DUEL_OUT_MS, DUEL_HEAL_HOLD_MS, DUEL_COUNTDOWN_MS } from '../net/duelSession.js';

export const BOUT_PHASES = Object.freeze(['call', 'walk', 'count', 'fight', 'end', 'verdict', 'heal', 'done']);
export const CALL_BEAT_MS = 1600;
export const WALK_MAX_MS = 9000;
export const COUNT_MS = DUEL_COUNTDOWN_MS;
export const BOUT_LIMIT_MS = 3 * 60_000;
export const END_HOLD_MS = 1500;
export const VERDICT_MS = 4500;
export const HEAL_HOLD_MS = DUEL_HEAL_HOLD_MS;
export const YIELD_SHARE = 0.15;
export const STALL_MS = 8000;
export const RING_SLACK_M = DUEL_OUT_SLACK_M;
export const RING_OUT_MS = DUEL_OUT_MS;
export const FLEE_MS = 1500;
export const KNOCKDOWN_SHARE = 0.25;
export const COMEBACK_LOW = 0.35;
export const TEMPER_EVERY_MS = 1000;
export const TEMPER_ROLL = 0.45;

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const share = (f) => (f.maxHealth > 0 ? clamp01(f.health / f.maxHealth) : 0);

/**
 * @typedef {{ id: string, name: string, side: number, maxHealth: number, health: number, temper: number, ai: boolean,
 *   home?: string, epithet?: string, out: null|'yield'|'fall'|'ringout', outAt: number, dealt: number, hits: number,
 *   misses: number, crits: number, low: boolean, comeback: boolean, outsideAt: number, fleeing: boolean, atMark: boolean,
 *   temperAt: number, pos: number[]|null }} BoutFighter
 * @typedef {{ k: string, at: number, a?: string, b?: string, dmg?: number, n?: number, side?: number|null, how?: string }} BoutEvent
 */

/**
 * @param {{ id: string, kind?: string, fighters: any[], ring: { centre: number[], radius: number }, now: number, limitMs?: number, tier?: number, label?: string, judgesFloor?: number }} o
 */
export function newBout({ id, kind = 'exhibition', fighters, ring, now, limitMs = BOUT_LIMIT_MS, tier = 0, label = '', judgesFloor = 0 }) {
  if (!Array.isArray(fighters) || fighters.length < 2) throw new Error('arenaBout: a bout needs two fighters');
  const sides = new Set(fighters.map((f) => f.side));
  if (sides.size < 2) throw new Error('arenaBout: a bout needs two sides');
  const b = {
    id: String(id), kind, tier, label, limitMs, phase: 'call', phaseAt: now, startAt: now, fightAt: NaN, endAt: NaN,
    judgesFloor: Number.isFinite(judgesFloor) && judgesFloor > 0 ? Math.min(1, judgesFloor) : 0,
    ring: { centre: [ring.centre[0], ring.centre[1]], radius: ring.radius },
    /** @type {BoutFighter[]} */
    fighters: fighters.map((f) => ({
      id: String(f.id), name: String(f.name ?? f.id), side: f.side | 0, maxHealth: Math.max(1, f.maxHealth | 0),
      health: Math.max(1, (f.health ?? f.maxHealth) | 0), temper: clamp01(f.temper ?? 0.5), ai: f.ai !== false,
      home: f.home ?? '', epithet: f.epithet ?? '', out: null, outAt: NaN, dealt: 0, hits: 0, misses: 0, crits: 0,
      low: false, comeback: false, outsideAt: NaN, fleeing: false, atMark: false, temperAt: now, pos: null,
    })),
    lastBlowAt: NaN, stallSaid: false, criers: 0, countN: 3,
    /** @type {null | { side: number|null, how: string, winners: string[], losers: string[], judges: any }} */
    result: null,
    /** @type {BoutEvent[]} */
    events: [],
  };
  emit(b, { k: 'call', at: now });
  return b;
}

/** @param {any} b @param {BoutEvent} e */
function emit(b, e) { b.events.push(e); }
export function takeBoutEvents(b) { const e = b.events; b.events = []; return e; }

const fighterOf = (b, id) => b.fighters.find((f) => f.id === String(id)) ?? null;
export const boutFighter = fighterOf;
export const standingSides = (b) => [...new Set(b.fighters.filter((f) => !f.out).map((f) => f.side))];
export const boutLive = (b) => b?.phase === 'fight';
export const boutBefore = (b) => b?.phase === 'call' || b?.phase === 'walk' || b?.phase === 'count';
export const boutOver = (b) => !!b && (b.phase === 'end' || b.phase === 'verdict' || b.phase === 'heal' || b.phase === 'done');
export function boutTimeLeft(b, now) {
  if (!b) return 0;
  if (b.phase === 'fight') return Math.max(0, b.fightAt + b.limitMs - now);
  if (boutBefore(b)) return b.limitMs;
  return Number.isFinite(b.fightAt) && Number.isFinite(b.endAt) ? Math.max(0, b.fightAt + b.limitMs - b.endAt) : 0;
}
export const callMs = (b) => CALL_BEAT_MS * (1 + b.fighters.length);

function enter(b, phase, now, extra = {}) {
  b.phase = phase; b.phaseAt = now;
  emit(b, { k: phase, at: now, ...extra });
}

export function boutAtMarks(b, id, now) {
  const f = fighterOf(b, id);
  if (!f || b.phase !== 'walk') return false;
  f.atMark = true;
  if (b.fighters.every((x) => x.atMark)) { b.countN = 3; enter(b, 'count', now, { n: 3 }); }
  return true;
}

export function boutTick(b, now, rng = Math.random) {
  if (!b) return b;
  const t = now - b.phaseAt;
  switch (b.phase) {
    case 'call': {
      const due = Math.min(b.fighters.length, Math.floor(t / CALL_BEAT_MS));
      while (b.criers < due) { const f = b.fighters[b.criers++]; emit(b, { k: 'crier', at: now, a: f.id }); }
      if (t >= callMs(b)) enter(b, 'walk', now);
      break;
    }
    case 'walk':
      if (t >= WALK_MAX_MS) { b.countN = 3; enter(b, 'count', now, { n: 3 }); }
      break;
    case 'count': {
      const n = 3 - Math.floor(t / (COUNT_MS / 3));
      if (n >= 1 && n < (b.countN ?? 3)) { b.countN = n; emit(b, { k: 'count', at: now, n }); }
      if (t >= COUNT_MS) { b.fightAt = now; b.lastBlowAt = now; for (const f of b.fighters) { f.temperAt = now; f.outsideAt = NaN; } enter(b, 'fight', now); }
      break;
    }
    case 'fight': fightTick(b, now, rng); break;
    case 'end': if (t >= END_HOLD_MS) enter(b, 'verdict', now, { side: b.result?.side ?? null, how: b.result?.how ?? '' }); break;
    case 'verdict': if (t >= VERDICT_MS) enter(b, 'heal', now); break;
    case 'heal': if (t >= HEAL_HOLD_MS) enter(b, 'done', now); break;
    default: break;
  }
  return b;
}

function fightTick(b, now, rng) {
  if (!b.stallSaid && now - b.lastBlowAt >= STALL_MS) { b.stallSaid = true; emit(b, { k: 'stall', at: now }); }
  for (const f of b.fighters) {
    if (f.out) continue;
    if (f.pos) {
      const d = Math.hypot(f.pos[0] - b.ring.centre[0], f.pos[1] - b.ring.centre[1]);
      if (d > b.ring.radius + RING_SLACK_M) {
        if (!Number.isFinite(f.outsideAt)) f.outsideAt = now;
        if (now - f.outsideAt >= RING_OUT_MS) { out(b, f, 'ringout', now); continue; }
      } else if (d > b.ring.radius) {
        if (!Number.isFinite(f.outsideAt)) f.outsideAt = now;
        if (!f.fleeing && now - f.outsideAt >= FLEE_MS) { f.fleeing = true; emit(b, { k: 'flee', at: now, a: f.id }); }
      } else { f.outsideAt = NaN; f.fleeing = false; }
    }
    if (f.ai && share(f) <= YIELD_SHARE && now - f.temperAt >= TEMPER_EVERY_MS) {
      f.temperAt = now;
      if (aiYields(f.temper, share(f), rng)) out(b, f, 'yield', now);
    }
  }
  if (b.phase === 'fight' && now - b.fightAt >= b.limitMs) timeUp(b, now);
}

export function aiYields(temper, healthShare, rng = Math.random) {
  if (!(healthShare <= YIELD_SHARE) || !(temper > 0)) return false;
  return rng() < clamp01(temper) * TEMPER_ROLL;
}

function out(b, f, how, now) {
  if (f.out) return;
  f.out = how; f.outAt = now;
  emit(b, { k: how, at: now, a: f.id });
  const left = standingSides(b);
  if (left.length <= 1) finish(b, left.length ? left[0] : null, how, now);
}

function finish(b, side, how, now, judges = null) {
  if (b.result) return;
  const winners = side === null ? [] : b.fighters.filter((f) => f.side === side).map((f) => f.id);
  const losers = b.fighters.filter((f) => f.side !== side).map((f) => f.id);
  b.result = { side, how, winners, losers, judges };
  b.endAt = now;
  enter(b, 'end', now, { side, how });
}

export function judgeBout(sides) {
  const ranked = [...sides].sort((x, y) => (y.dealt - x.dealt) || (y.hits - x.hits) || (x.misses - y.misses));
  if (!ranked.length) return null;
  const [a, c] = ranked;
  if (c && a.dealt === c.dealt && a.hits === c.hits && a.misses === c.misses) return null;
  return a.side;
}
export function boutTallies(b) {
  const by = new Map();
  for (const f of b.fighters) {
    const t = by.get(f.side) ?? { side: f.side, dealt: 0, hits: 0, misses: 0, standing: false };
    t.dealt += f.dealt; t.hits += f.hits; t.misses += f.misses; t.standing ||= !f.out;
    by.set(f.side, t);
  }
  return [...by.values()];
}
function timeUp(b, now) {
  emit(b, { k: 'timeout', at: now });
  const tallies = boutTallies(b).filter((t) => t.standing);
  let side = judgeBout(tallies);
  // A side with a player that dealt less than judgesFloor of its opponents' health cannot win on the card.
  if (b.judgesFloor > 0 && side !== null && b.fighters.some((f) => f.side === side && !f.ai)) {
    const theirs = b.fighters.filter((f) => f.side !== side).reduce((n, f) => n + f.maxHealth, 0);
    const dealt = tallies.find((t) => t.side === side)?.dealt ?? 0;
    if (dealt < b.judgesFloor * theirs) {
      const ai = tallies.filter((t) => !b.fighters.some((f) => f.side === t.side && !f.ai));
      side = ai.length ? judgeBout(ai) : null;
    }
  }
  finish(b, side, 'judges', now, tallies);
}

/**
 * @param {any} b
 * @param {{ from: string, to: string, dmg: number, health?: number, crit?: boolean, now: number }} blow
 */
export function boutHit(b, blow) {
  const { from, to, dmg, health, crit = false, now } = blow;
  if (!boutLive(b)) return false;
  const a = fighterOf(b, from), t = fighterOf(b, to);
  if (!a || !t || a === t || a.out || t.out || a.side === t.side) return false;
  const d = Math.max(0, Math.round(Number(dmg) || 0));
  if (!(d > 0)) return false;
  const was = share(t);
  t.health = Number.isFinite(health) ? Math.max(0, Math.min(t.maxHealth, Math.round(/** @type {number} */ (health)))) : Math.max(0, t.health - d);
  a.dealt += d; a.hits++;
  b.lastBlowAt = now; b.stallSaid = false;
  emit(b, { k: 'hit', at: now, a: a.id, b: t.id, dmg: d });
  if (crit) { a.crits++; emit(b, { k: 'crit', at: now, a: a.id, b: t.id, dmg: d }); }
  const now2 = share(t);
  if (d >= t.maxHealth * KNOCKDOWN_SHARE || (was > YIELD_SHARE && now2 <= YIELD_SHARE)) emit(b, { k: 'knockdown', at: now, a: a.id, b: t.id });
  if (now2 <= COMEBACK_LOW) t.low = true;
  if (a.low && !a.comeback && share(a) >= now2) { a.comeback = true; emit(b, { k: 'comeback', at: now, a: a.id }); }
  return true;
}

export function boutMiss(b, { from, now }) {
  if (!boutLive(b)) return false;
  const a = fighterOf(b, from);
  if (!a || a.out) return false;
  a.misses++;
  emit(b, { k: 'miss', at: now, a: a.id });
  return true;
}

export function boutFell(b, id, now) {
  if (!boutLive(b)) return false;
  const f = fighterOf(b, id);
  if (!f || f.out) return false;
  f.health = Math.min(f.health, 1);
  out(b, f, 'fall', now);
  return true;
}

export function boutYield(b, id, now) {
  const f = fighterOf(b, id);
  if (!boutLive(b) || !f || f.out) return 'not-live';
  if (share(f) > YIELD_SHARE) return 'early';
  out(b, f, 'yield', now);
  return null;
}

export function boutPos(b, id, xz) {
  const f = fighterOf(b, id);
  if (!f || !xz || !Number.isFinite(xz[0]) || !Number.isFinite(xz[1])) return false;
  f.pos = [xz[0], xz[1]];
  return true;
}

export function boutHealth(b, id, health) {
  const f = fighterOf(b, id);
  if (!f) return false;
  f.health = Math.max(0, Math.min(f.maxHealth, Math.round(Number(health) || 0)));
  return true;
}

export const fighterShare = share;

export const PURSE_FAVOUR_MAX = 0.5;
export const PURSE_FAVOUR_MIN = -0.25;
export function boutPurse(base, favour = 0) {
  const f = Math.max(-1, Math.min(1, Number(favour) || 0));
  const k = 1 + (f >= 0 ? f * PURSE_FAVOUR_MAX : -f * PURSE_FAVOUR_MIN);
  return Math.max(0, Math.round((Number(base) || 0) * k));
}

export function sideNames(b, side) {
  const names = b.fighters.filter((f) => f.side === side).map((f) => f.name);
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
export function otherNames(b, side) {
  const names = b.fighters.filter((f) => f.side !== side).map((f) => f.name);
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
