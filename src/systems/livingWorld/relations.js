// @ts-check

import { CRIMES } from '../../justice/crimes.js';
import { REGION_COUNT } from '../../world/regionConditions.js';

// Save vendor key for every character's regards; renaming it orphans existing saves.
export const LIVING_WORLD_VENDOR = 'LivingWorld';

export const FRIEND_AT = 40;
export const ENEMY_AT = -40;
export const HOSTILE_AT = -70;
export const REGARD_MIN = -100;
export const REGARD_MAX = 100;
export const EASE_PER_DAY = 0.5;
export const RELATIONS_MAX = 600;

export const TURN_KINDS = Object.freeze(['spared', 'fallen', 'won', 'lost']);
export const TURNS_MAX = 200;
export const HAND_KINDS = Object.freeze(['slain', 'died', 'killed']);
export const HAND_NAME_MAX = 60;
export const MARK_KINDS = Object.freeze(['laid', 'heard', 'looted']);
export const TALE_KINDS = Object.freeze(['home', 'routed', 'held']);

export const WARES_MAX = 40;
export const REPORTS_MAX = 40;
// Reports from a save or the host are validated here because an unknown crime or region index makes the charged
// `legalRep` entry NaN.
const CRIME_KINDS = new Set(Object.values(CRIMES).filter((c) => c !== CRIMES.None));
const reportOk = (crime, region) => CRIME_KINDS.has(crime) && Number.isSafeInteger(region) && region >= 0 && region < REGION_COUNT;
const placeOk = (i) => Number.isSafeInteger(i) && i >= 0 && i < 1000;
/**
 * Partly taken stacks are saved as `[place, count]` pairs after the whole places, so an older reader that keeps
 * only numeric places still loads the record.
 * @param {any[]} list
 */
const leftOf = (list) => new Map(list.filter((e) => Array.isArray(e) && placeOk(e[0]) && Number.isSafeInteger(e[1]) && e[1] >= 1 && e[1] < 1e6).map((e) => [e[0], e[1]]));
/** @param {{ gone: Set<number>, left: Map<number, number> }} w */
const goneOut = (w) => [...[...w.gone].sort((a, b) => a - b), ...[...w.left].sort((a, b) => a[0] - b[0])];

// `polite` and `insulted` mean a tone the resident likes or dislikes (talkTopics.js `toneTaste`), not the Polite or
// Blunt option itself.
export const EVENTS = Object.freeze({
  talk: 3,
  polite: 1,
  gift: 8,
  helped: 20,
  saved: 35,
  struck: -45,
  crime: -15,
  slain: -75,
  insulted: -6,
  poached: -4,
  compliment: 2,
  embrace: 3,
  kiss: 4,
});
// Values are the field names saved on each regard record; renaming one loses the saved once-a-day stamps.
export const DEED_STAMPS = Object.freeze({ compliment: 'compl', gift: 'gift', embrace: 'hug', kiss: 'kiss' });
const STAMPED = Object.freeze(['polite', 'blunt', 'poach', ...Object.values(DEED_STAMPS)]);

/** @typedef {{ r: number, met: number, seen: number, talked: number, polite?: number, blunt?: number, poach?: number, compl?: number, gift?: number, hug?: number, kiss?: number }} Regard */

/** @param {number} r */
export const regardStanding = (r) => (r >= FRIEND_AT ? 'friend' : r <= HOSTILE_AT ? 'hostile' : r <= ENEMY_AT ? 'enemy' : 'neutral');

/** @param {any} [record] */
export function createRelations(record = null) {
  /** @type {Map<string, Regard>} */
  const map = new Map();
  const clamp = (v) => Math.max(REGARD_MIN, Math.min(REGARD_MAX, v));
  const ok = (id) => typeof id === 'string' && id.length > 0 && id.length <= 40;
  /** @type {Record<string, Set<string>>} */
  const turns = Object.fromEntries(TURN_KINDS.map((k) => [k, new Set()]));
  /** @typedef {{ t: number, seen: boolean, who: string }} Hand */
  /** @type {Record<string, Map<string, Hand>>} */
  const hands = Object.fromEntries(HAND_KINDS.map((k) => [k, new Map()]));
  /** @type {Record<string, Set<string>>} */
  const marks = Object.fromEntries(MARK_KINDS.map((k) => [k, new Set()]));
  /** @type {Record<string, Map<string, { t: number, seen: boolean, who: string }>>} */
  const tales = Object.fromEntries(TALE_KINDS.map((k) => [k, new Map()]));
  const nameOk = (who) => (typeof who === 'string' ? who.slice(0, HAND_NAME_MAX) : '');
  const allTurns = /** @type {{ spared: Set<string>, fallen: Set<string>, won: Set<string>, lost: Set<string>, slain: Map<string, Hand>, died: Map<string, Hand>, killed: Map<string, Hand>, laid: Set<string>, heard: Set<string>, looted: Set<string>, home: Map<string, Hand>, routed: Map<string, Hand>, held: Map<string, Hand> }} */ (/** @type {any} */ ({ ...turns, ...hands, ...marks, ...tales }));
  let turnsVersion = 0;
  const turnOk = (key) => typeof key === 'string' && key.length > 0 && key.length <= 80;
  /** @type {Map<string, { gone: Set<number>, left: Map<number, number>, coin: number, robbed: number | null }>} */
  const wares = new Map();
  /** @type {{ crime: number, region: number, at: number, who: string, witnesses: string[], trip?: string }[]} */
  const reports = [];
  /** @type {{ trip: string, t: number, pay: number, fights: number, leader: string, to: number, near: number | null } | null} */
  let escort = null;
  const road = record && typeof record === 'object' && record.v === 1 && record.road && typeof record.road === 'object' ? record.road : null;
  if (road) {
    if (Array.isArray(road.wares)) {
      for (const e of road.wares.slice(-WARES_MAX)) {
        const [id, gone, coin, robbed] = Array.isArray(e) ? e : [];
        if (turnOk(id) && Array.isArray(gone)) wares.set(id, { gone: new Set(gone.filter(placeOk)), left: leftOf(gone), coin: Number.isFinite(Number(coin)) ? Math.max(0, Number(coin)) : 0, robbed: robbed != null && Number.isFinite(Number(robbed)) ? Number(robbed) : null });
      }
    }
    if (Array.isArray(road.reports)) {
      for (const e of road.reports.slice(-REPORTS_MAX)) {
        const [crime, region, at, who, witnesses, trip] = Array.isArray(e) ? e : [];
        if (reportOk(crime, region) && Number.isFinite(Number(at)) && typeof witnesses === 'string') {
          reports.push({ crime, region, at: Number(at), who: nameOk(who), witnesses: witnesses.split(',').filter(ok), ...(turnOk(trip) ? { trip } : {}) });
        }
      }
    }
    if (Array.isArray(road.escort)) {
      const [trip, t, pay, fights, leader, to, near] = road.escort;
      if (turnOk(trip) && Number.isFinite(Number(t)) && Number.isFinite(Number(pay)) && ok(leader)) escort = { trip, t: Number(t), pay: Math.max(0, Number(pay)), fights: Math.max(0, Number(fights) | 0), leader, to: Number(to) | 0, near: near != null && Number.isFinite(Number(near)) ? Number(near) : null };
    }
  }
  if (record && typeof record === 'object' && record.v === 1 && record.turns && typeof record.turns === 'object') {
    for (const k of TURN_KINDS) {
      const list = /** @type {any} */ (record.turns)[k];
      if (Array.isArray(list)) for (const key of list.slice(-TURNS_MAX)) if (turnOk(key)) turns[k].add(key);
    }
    for (const k of MARK_KINDS) {
      const list = /** @type {any} */ (record.turns)[k];
      if (Array.isArray(list)) for (const key of list.slice(-TURNS_MAX)) if (turnOk(key)) marks[k].add(key);
    }
    for (const k of TALE_KINDS) {
      const list = /** @type {any} */ (record.turns)[k];
      if (!Array.isArray(list)) continue;
      for (const e of list.slice(-TURNS_MAX)) {
        const [key, t, who] = Array.isArray(e) ? e : [];
        if (turnOk(key) && Number.isFinite(Number(t))) tales[k].set(key, { t: Number(t), seen: true, who: nameOk(who) });
      }
    }
    for (const k of HAND_KINDS) {
      const list = /** @type {any} */ (record.turns)[k];
      if (!Array.isArray(list)) continue;
      for (const e of list.slice(-TURNS_MAX)) {
        const [key, t, seen, who] = Array.isArray(e) ? e : [];
        if (turnOk(key) && Number.isFinite(Number(t))) hands[k].set(key, { t: Number(t), seen: !!seen, who: nameOk(who) });
      }
    }
  }
  if (record && typeof record === 'object' && record.v === 1 && record.people && typeof record.people === 'object') {
    for (const [id, e] of Object.entries(record.people)) {
      if (!ok(id) || !e || typeof e !== 'object') continue;
      const r = Number(/** @type {any} */ (e).r), met = Number(/** @type {any} */ (e).met), seen = Number(/** @type {any} */ (e).seen), talked = Number(/** @type {any} */ (e).talked);
      if (!Number.isFinite(r)) continue;
      /** @type {Regard} */
      const got = { r: clamp(r), met: Number.isFinite(met) ? met : 0, seen: Number.isFinite(seen) ? seen : 0, talked: Number.isFinite(talked) ? talked : -1 };
      for (const tone of STAMPED) { const d = Number(/** @type {any} */ (e)[tone]); if (Number.isFinite(d)) /** @type {any} */ (got)[tone] = d; }
      map.set(id, got);
    }
  }
  const eased = (e, day) => {
    const apart = Math.max(0, day - e.seen);
    const ease = apart * EASE_PER_DAY;
    return e.r > 0 ? Math.max(0, e.r - ease) : Math.min(0, e.r + ease);
  };
  // Ranks by regard eased to `day`, not as last noted, and never drops `keep`, the entry just written.
  const trim = (day, keep) => {
    if (map.size <= RELATIONS_MAX) return;
    const order = [...map.entries()].filter(([id]) => id !== keep).sort((a, b) => (Math.abs(eased(a[1], day)) - Math.abs(eased(b[1], day))) || (a[1].seen - b[1].seen));
    for (let i = 0; map.size > RELATIONS_MAX && i < order.length; i++) map.delete(order[i][0]);
  };
  return {
    /**
     * @param {string} id
     * @param {number} day
     */
    regard: (id, day) => { const e = map.get(id); return e ? eased(e, day) : 0; },
    /**
     * @param {string} id
     * @param {number} day
     */
    standing(id, day) { return regardStanding(this.regard(id, day)); },
    /** @param {string} id */
    known: (id) => map.has(id),
    /**
     * @param {string} id
     * @param {string} kind
     */
    deedDay: (id, kind) => { const k = DEED_STAMPS[/** @type {keyof typeof DEED_STAMPS} */ (kind)]; const d = k ? /** @type {any} */ (map.get(id))?.[k] : null; return Number.isFinite(d) ? d : null; },
    /**
     * @param {string} id
     * @param {keyof typeof EVENTS} kind
     * @param {number} day
     * @param {number} [amount]
     */
    note(id, kind, day, amount) {
      if (!ok(id)) return 0;
      /** @type {Regard} */
      const e = map.get(id) ?? { r: 0, met: day, seen: day, talked: -1 };
      const now = eased(e, day);
      let delta = Number.isFinite(amount) ? Number(amount) : (EVENTS[kind] ?? 0);
      if (kind === 'talk') { if (e.talked === day) delta = 0; else e.talked = day; }
      const tone = kind === 'polite' ? 'polite' : kind === 'insulted' ? 'blunt' : kind === 'poached' ? 'poach' : DEED_STAMPS[/** @type {keyof typeof DEED_STAMPS} */ (kind)] ?? null;
      if (tone) { if (/** @type {any} */ (e)[tone] === day) delta = 0; else /** @type {any} */ (e)[tone] = day; }
      e.r = clamp(now + delta);
      e.seen = day;
      map.set(id, e);
      trim(day, id);
      return e.r;
    },
    /**
     * @param {string} id
     * @param {number} amount
     * @param {number} day
     */
    inherit(id, amount, day) {
      if (!ok(id) || !Number.isFinite(amount) || !amount) return 0;
      /** @type {Regard} */
      const e = map.get(id) ?? { r: 0, met: day, seen: day, talked: -1 };
      e.r = clamp(eased(e, day) + amount);
      e.seen = day;
      map.set(id, e);
      trim(day, id);
      return e.r;
    },
    /**
     * @param {string} id
     * @param {number} day
     */
    seen(id, day) { const e = map.get(id); if (e) { e.r = eased(e, day); e.seen = day; } },
    /**
     * @param {'spared'|'fallen'|'won'|'lost'|'slain'|'died'|'killed'|'laid'|'heard'|'looted'|'home'|'routed'|'held'} kind
     * @param {string} key
     * @param {{ t: number, seen?: boolean, who?: string }} [at]
     */
    turn(kind, key, at) {
      const tale = tales[kind];
      if (tale) {
        if (!turnOk(key) || tale.has(key) || !Number.isFinite(at?.t)) return false;
        tale.set(key, { t: Number(at?.t), seen: true, who: nameOk(at?.who) });
        if (tale.size > TURNS_MAX) tale.delete(/** @type {string} */ (tale.keys().next().value));
        turnsVersion++;
        return true;
      }
      const hand = hands[kind];
      if (hand) {
        if (!turnOk(key) || hand.has(key) || !Number.isFinite(at?.t)) return false;
        hand.set(key, { t: Number(at?.t), seen: !!at?.seen, who: nameOk(at?.who) });
        if (hand.size > TURNS_MAX) hand.delete(/** @type {string} */ (hand.keys().next().value));
        turnsVersion++;
        return true;
      }
      const set = turns[kind] ?? marks[kind];
      if (!set || !turnOk(key) || set.has(key)) return false;
      set.add(key);
      if (set.size > TURNS_MAX) set.delete(/** @type {string} */ (set.values().next().value));
      turnsVersion++;
      return true;
    },
    turns: () => allTurns,
    turnsVersion: () => turnsVersion,
    /** @param {string} tripId */
    wares: (tripId) => wares.get(tripId) ?? null,
    /**
     * @param {string} tripId
     * @param {Iterable<number | [number, number]>} gone
     * @param {number} coin
     * @param {number|null} [robbed]
     */
    setWares(tripId, gone, coin, robbed = null) {
      if (!turnOk(tripId)) return;
      wares.delete(tripId);
      const list = [...gone];
      wares.set(tripId, { gone: new Set(/** @type {number[]} */ (list.filter(placeOk))), left: leftOf(list), coin: Math.max(0, Number(coin) || 0), robbed: robbed != null && Number.isFinite(robbed) ? robbed : null });
      // Unrobbed counters leave first while robbed ones are at most half the book, so a robbed caravan is not
      // forgotten and robbed again.
      while (wares.size > WARES_MAX) {
        const robbedIds = [...wares].filter(([, w]) => w.robbed != null).map(([id]) => id);
        const out = robbedIds.length > WARES_MAX / 2 ? robbedIds[0] : [...wares].find(([, w]) => w.robbed == null)?.[0];
        wares.delete(out ?? /** @type {string} */ (wares.keys().next().value));
      }
    },
    reports: () => reports,
    /**
     * @param {{ crime: number, region: number, at: number, who?: string, witnesses: string[], trip?: string }} r
     * @param {((r: any) => boolean) | null} [isVoid]
     */
    report(r, isVoid = null) {
      if (!reportOk(r?.crime, r?.region) || !Number.isFinite(r?.at) || !Array.isArray(r?.witnesses)) return false;
      reports.push({ crime: r.crime, region: r.region, at: r.at, who: nameOk(r.who), witnesses: r.witnesses.filter(ok), ...(turnOk(r.trip) ? { trip: /** @type {string} */ (r.trip) } : {}) });
      // When full, the first void report leaves first, so void reports never push out a witnessed crime still being
      // carried.
      while (reports.length > REPORTS_MAX) { const i = isVoid ? reports.findIndex(isVoid) : -1; reports.splice(Math.max(0, i), 1); }
      return true;
    },
    /** @param {any} r */
    dropReport(r) { const i = reports.indexOf(r); if (i >= 0) reports.splice(i, 1); },
    escort: () => escort,
    /** @param {{ trip: string, t: number, pay: number, fights: number, leader: string, to: number, near?: number | null } | null} c */
    setEscort(c) { escort = c && turnOk(c.trip) && ok(c.leader) ? { trip: c.trip, t: Number(c.t) || 0, pay: Math.max(0, Number(c.pay) || 0), fights: Math.max(0, c.fights | 0), leader: c.leader, to: c.to | 0, near: c.near != null && Number.isFinite(c.near) ? Number(c.near) : null } : null; },
    entries: () => [...map.entries()].map(([id, e]) => ({ id, ...e })),
    size: () => map.size,
    snapshot() {
      /** @type {Record<string, Regard>} */
      const people = {};
      for (const [id, e] of map) {
        people[id] = { r: Math.round(e.r * 10) / 10, met: e.met, seen: e.seen, talked: e.talked };
        if (e.polite != null) people[id].polite = e.polite;
        if (e.blunt != null) people[id].blunt = e.blunt;
        if (e.poach != null) people[id].poach = e.poach;
        for (const k of Object.values(DEED_STAMPS)) if (/** @type {any} */ (e)[k] != null) /** @type {any} */ (people[id])[k] = /** @type {any} */ (e)[k];
      }
      // Optional keys are written only when non-empty, so a record without them saves back unchanged.
      const handsOut = Object.fromEntries(HAND_KINDS.filter((k) => hands[k].size).map((k) => [k, [...hands[k]].map(([key, h]) => [key, h.t, h.seen ? 1 : 0, h.who])]));
      const marksOut = Object.fromEntries(MARK_KINDS.filter((k) => marks[k].size).map((k) => [k, [...marks[k]]]));
      const talesOut = Object.fromEntries(TALE_KINDS.filter((k) => tales[k].size).map((k) => [k, [...tales[k]].map(([key, h]) => [key, h.t, h.who])]));
      const any = TURN_KINDS.some((k) => turns[k].size) || Object.keys(handsOut).length > 0 || Object.keys(marksOut).length > 0 || Object.keys(talesOut).length > 0;
      const t = any ? { turns: { ...Object.fromEntries(TURN_KINDS.map((k) => [k, [...turns[k]]])), ...handsOut, ...marksOut, ...talesOut } } : {};
      const roadOut = {
        ...(wares.size ? { wares: [...wares].map(([id, w]) => (w.robbed != null ? [id, goneOut(w), w.coin, w.robbed] : [id, goneOut(w), w.coin])) } : {}),
        ...(reports.length ? { reports: reports.map((r) => (r.trip ? [r.crime, r.region, r.at, r.who, r.witnesses.join(','), r.trip] : [r.crime, r.region, r.at, r.who, r.witnesses.join(',')])) } : {}),
        ...(escort ? { escort: escort.near != null ? [escort.trip, escort.t, escort.pay, escort.fights, escort.leader, escort.to, escort.near] : [escort.trip, escort.t, escort.pay, escort.fights, escort.leader, escort.to] } : {}),
      };
      return { v: 1, people, ...t, ...(Object.keys(roadOut).length ? { road: roadOut } : {}) };
    },
  };
}
