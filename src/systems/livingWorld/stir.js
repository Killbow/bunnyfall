// @ts-check
import { lwSeed, textSeed } from './seed.js';
import { ROUND_S, spotRound, lineMinutes } from './meetups.js';
import { TAVERN_DRINK } from './dayPlan.js';
import {
  GATE_SCRIPTS, CHALLENGE_SCRIPTS, QUARREL_SCRIPTS, BREAK_UP_LINES, HAGGLE_SCRIPTS, PLEA_SCRIPTS,
  WATCH_HOURS, WATCH_CALLS, STALL_CRIES, BEGGAR_CRIES, DRINKING_SONGS, fillLine, firstNameOf,
} from './lines.js';

export const STIR_GATHER_S = 4;
export const STIR_AFTER_S = 3;
export const GATE_SHARE = 0.6;
export const CHALLENGE_SHARE = 0.5;
export const QUARREL_SHARE = 0.03;
export const QUARREL_EVENING = 4;
export const HAGGLE_SHARE = 0.2;
export const PLEA_SHARE = 0.1;
export const GATE_LINES = Math.max(...Object.values(GATE_SCRIPTS).flat().map((x) => x.length));
export const DRINKER = TAVERN_DRINK;
export const SONG_DRINK = 0.8;
/** @type {Readonly<Record<'stranger'|'rough', readonly (readonly ['civil'|'curt'|'hostile', number])[]>>} */
export const HUMOURS = Object.freeze({
  stranger: Object.freeze([/** @type {const} */ (['civil', 0.5]), /** @type {const} */ (['curt', 0.3]), /** @type {const} */ (['hostile', 0.2])]),
  rough: Object.freeze([/** @type {const} */ (['civil', 0.3]), /** @type {const} */ (['curt', 0.35]), /** @type {const} */ (['hostile', 0.35])]),
});
const ROUGH = new Set(['mercenary', 'sailor']);
export const PLEA_UNNAMED = Object.freeze(PLEA_SCRIPTS.filter((s) => s.every((l) => !l.text.includes('{b}'))));
export const VOICE_S = 3.4;
export const CALL_SHARE = 0.6;
export const CALL_SPREAD_MIN = 6;
export const CRY_EVERY_MIN = 6;
export const CRY_SHARE = 0.3;
export const BEG_EVERY_MIN = 8;
export const BEG_SHARE = 0.3;
export const SONG_EVERY_MIN = 3;
export const SONG_SHARE = 0.35;

/** @typedef {{ id: string, name: string, job: string, town?: number, guard?: boolean, drink?: number }} StirWho */
/** @typedef {{ who: StirWho, kind: string, t0: number, t1: number, duty?: boolean, pair?: number | null }} SpotStay */
/** @typedef {{ by: 'a'|'b'|'g', text: string, loud: boolean }} StirLine */
/** @typedef {{ kind: 'gate'|'challenge'|'quarrel'|'haggle'|'plea', spot: string, members: StirWho[], anchor: 0|1, guard: StirWho | null, mood: string | null, script: readonly StirLine[], seed: number, round: number, t0: number, from: number, end: number, loudFrom: number }} Incident */

/** @param {...number} parts */
const draw = (...parts) => (lwSeed(...parts) % 100000) / 100000;

/**
 * Scales with the value because the online clock passes 2^24 minutes, where one float bit is larger than a fixed
 * 1e-9.
 * @param {number} v
 */
const slack = (v) => Math.max(1e-9, Math.abs(v) * 8 * Number.EPSILON);

/**
 * @param {StirWho} who
 * @param {number} mapId
 */
export function strangerOf(who, mapId) {
  return !who.guard && who.town != null && who.town !== mapId;
}

/**
 * @param {StirWho} who
 * @param {number} day
 * @returns {'civil'|'curt'|'hostile'}
 */
export function humourOf(who, day) {
  const table = ROUGH.has(who.job) ? HUMOURS.rough : HUMOURS.stranger;
  let r = draw(textSeed(who.id), day, 0x68756d72);
  for (const [mood, w] of table) { if (r < w) return mood; r -= w; }
  return table[table.length - 1][0];
}

/**
 * @template T
 * @param {readonly T[]} pool
 * @param {number} seed
 * @returns {T}
 */
const pick = (pool, seed) => pool[lwSeed(seed, 0x70696b) % pool.length];

/**
 * @param {string} spotKey
 * @param {number} day
 * @param {number} inT
 * @param {number} perS
 * @returns {number}
 */
export function gateHalt(spotKey, day, inT, perS) {
  return gateWord(spotKey, day, inT, perS)?.halt ?? 0;
}

/**
 * Returns the round so livingTown.js can wave through a second party whose word falls in a round another party
 * already holds.
 * @param {string} spotKey
 * @param {number} day
 * @param {number} inT
 * @param {number} perS
 * @returns {{ halt: number, round: number } | null}
 */
export function gateWord(spotKey, day, inT, perS) {
  if (!(perS > 0) || draw(textSeed(spotKey), day, Math.round(inT * 60), 0x67617465) >= GATE_SHARE) return null;
  const len = (STIR_GATHER_S + STIR_AFTER_S) * perS + GATE_LINES * lineMinutes(perS);
  const r = spotRound(spotKey, inT, ROUND_S * perS);
  const start = inT + len <= r.end ? inT : r.end + 1e-6;
  return { halt: start - inT + len, round: spotRound(spotKey, start, ROUND_S * perS).round };
}

/**
 * @param {string} spotKey
 * @param {readonly SpotStay[]} given
 * @param {number} day
 * @param {number} mapId
 * @param {number} lineMin
 * @param {number} perS
 * @returns {Incident[]}
 */
export function spotIncidents(spotKey, given, day, mapId, lineMin, perS) {
  if (!(lineMin > 0) || !(perS > 0) || given.length < 2) return [];
  const spot = textSeed(spotKey);
  // Sorted by time then id so every client lays the same incidents whatever order the stays arrive in.
  const stays = [...given].sort((x, y) => x.t0 - y.t0 || (x.who.id < y.who.id ? -1 : x.who.id > y.who.id ? 1 : 0) || x.t1 - y.t1);
  const gather = STIR_GATHER_S * perS, after = STIR_AFTER_S * perS, roundMin = ROUND_S * perS;
  /** @type {Incident[]} */
  const laid = [];
  const lay = (/** @type {Incident['kind']} */ kind, /** @type {StirWho} */ a, /** @type {StirWho} */ b, /** @type {0|1} */ anchor, /** @type {readonly StirLine[]} */ script, /** @type {number} */ seed, /** @type {number} */ o0, /** @type {number} */ o1, mood = /** @type {string|null} */ (null), guards = /** @type {readonly SpotStay[]|null} */ (null)) => {
    const soon = o0 + draw(seed, 0x77616974) * Math.min(5, Math.max(0, o1 - o0 - gather - script.length * lineMin - after));
    const steps = pick(BREAK_UP_LINES, lwSeed(seed, 0x6272656b));
    for (const t0 of [soon, spotRound(spotKey, soon, roundMin).end + 1e-6]) {
      const r = spotRound(spotKey, t0, roundMin);
      const from = t0 + gather;
      const g = guards?.find((w) => w.t0 <= from && w.t1 >= from + (script.length + steps.length) * lineMin + after)?.who ?? null;
      const lines = g ? Object.freeze([...script, ...steps]) : script;
      const end = from + lines.length * lineMin + after;
      if (end > o1 + slack(o1) || end > r.end + slack(r.end)) continue;
      const loud = lines.findIndex((l) => l.loud);
      laid.push({ kind, spot: spotKey, members: [a, b], anchor, guard: g, mood, script: lines, seed, round: r.round, t0, from, end, loudFrom: loud < 0 ? Infinity : from + loud * lineMin });
      return;
    }
  };
  const overlap = (/** @type {SpotStay} */ x, /** @type {SpotStay} */ y) => [Math.max(x.t0, y.t0), Math.min(x.t1, y.t1)];
  const byId = (/** @type {SpotStay} */ x, /** @type {SpotStay} */ y) => (x.who.id < y.who.id ? -1 : x.who.id > y.who.id ? 1 : 0);
  const first = (/** @type {SpotStay} */ x, /** @type {SpotStay} */ y) => /** @type {0|1} */ (y.t0 < x.t0 || (y.t0 === x.t0 && byId(y, x) < 0) ? 1 : 0);
  const stopped = new Set();
  /** @type {Map<number, SpotStay[]>} */
  const halted = new Map();
  for (const s of stays) if (s.kind === 'gate' && strangerOf(s.who, mapId)) { const l = halted.get(s.t0) ?? []; l.push(s); halted.set(s.t0, l); }
  for (const [t0, them] of halted) {
    const t1 = Math.min(...them.map((s) => s.t1));
    const post = stays.filter((g) => g.duty && g.kind === 'post' && g.t0 <= t0 && g.t1 >= t1).sort(byId)[0];
    if (!post) continue;
    const seed = lwSeed(spot, day, Math.round(t0 * 60), 0x67617465);
    const s = them.map((x) => ({ x, k: lwSeed(seed, textSeed(x.who.id)) })).sort((a, b) => a.k - b.k || byId(a.x, b.x))[0].x;
    const mood = humourOf(s.who, day);
    const script = pick(GATE_SCRIPTS[mood], lwSeed(seed, textSeed(s.who.id)));
    lay('gate', post.who, s.who, 0, script, lwSeed(seed, textSeed(s.who.id), 1), t1 - (gather + script.length * lineMin + after), t1, mood);
    stopped.add(s.who.id);
  }
  for (const g of stays) {
    if (!g.duty || g.kind !== 'watch' || g.pair === 1) continue;
    const seed = lwSeed(spot, day, textSeed(g.who.id), Math.round(g.t0), 0x68616c74);
    if (draw(seed) >= CHALLENGE_SHARE) continue;
    const them = stays.filter((s) => !s.duty && s.kind !== 'gate' && strangerOf(s.who, mapId) && !stopped.has(s.who.id))
      .map((s) => ({ s, k: lwSeed(seed, textSeed(s.who.id), Math.round(s.t0)) })).sort((x, y) => x.k - y.k || (x.s.who.id < y.s.who.id ? -1 : 1));
    for (const { s } of them) {
      const mood = humourOf(s.who, day);
      const script = pick(CHALLENGE_SCRIPTS[mood], lwSeed(seed, textSeed(s.who.id)));
      const [o0, o1] = overlap(g, s);
      const n = laid.length;
      lay('challenge', g.who, s.who, first(g, s), script, lwSeed(seed, textSeed(s.who.id), 1), o0, o1, mood);
      if (laid.length > n) { stopped.add(s.who.id); break; }
    }
  }
  const watch = stays.filter((s) => s.duty && s.pair !== 1);
  const met = new Set();
  const pairOf = (/** @type {StirWho} */ a, /** @type {StirWho} */ b) => (a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`);
  const meets = (/** @type {SpotStay} */ x, /** @type {SpotStay} */ y) => { const [o0, o1] = overlap(x, y); return o1 > o0; };
  for (const x of stays) {
    if (x.duty) continue;
    const seed = lwSeed(spot, day, textSeed(x.who.id), Math.round(x.t0));
    if (x.kind === 'beg') {
      for (const y of stays) {
        if (y.duty || y.kind === 'beg' || y.who.id === x.who.id || !meets(x, y)) continue;
        const pair = pairOf(x.who, y.who), ps = lwSeed(spot, day, textSeed(pair));
        if (met.has(pair) || draw(ps, 0x706c6561) >= PLEA_SHARE) continue;
        met.add(pair);
        const [o0, o1] = overlap(x, y);
        lay('plea', x.who, y.who, y.kind === 'stall' ? 1 : 0, pick(strangerOf(y.who, mapId) ? PLEA_UNNAMED : PLEA_SCRIPTS, ps), ps, o0, o1);
      }
      continue;
    }
    if (x.kind === 'stall') continue;
    const stalls = stays.filter((y) => y.kind === 'stall' && !y.duty && y.who.id !== x.who.id && meets(x, y));
    if (stalls.length && draw(seed, 0x68616767) < HAGGLE_SHARE) {
      const y = stalls[lwSeed(seed, 0x61742020) % stalls.length];
      const pair = pairOf(x.who, y.who), ps = lwSeed(spot, day, textSeed(pair));
      if (met.has(pair)) continue;
      met.add(pair);
      const [o0, o1] = overlap(x, y);
      lay('haggle', x.who, y.who, 1, pick(HAGGLE_SCRIPTS, ps), ps, o0, o1);
      continue;
    }
    // Each person draws one partner, so quarrels at a busy spot grow with its people rather than with its pairs.
    if (x.who.town !== mapId || x.who.guard) continue;
    const others = stays.filter((y) => !y.duty && y.kind !== 'stall' && y.kind !== 'beg' && y.who.id !== x.who.id && y.who.town === mapId && !y.who.guard && meets(x, y));
    if (!others.length) continue;
    const y = others[lwSeed(seed, 0x77697468) % others.length];
    const [o0, o1] = overlap(x, y);
    const evening = ((((o0 % 1440) + 1440) % 1440) >= 18 * 60) && (x.who.drink ?? 0) > DRINKER && (y.who.drink ?? 0) > DRINKER;
    if (draw(seed, 0x71727265) >= QUARREL_SHARE * (evening ? QUARREL_EVENING : 1)) continue;
    const pair = pairOf(x.who, y.who), ps = lwSeed(spot, day, textSeed(pair));
    if (met.has(pair)) continue;
    met.add(pair);
    lay('quarrel', x.who, y.who, first(x, y), pick(QUARREL_SCRIPTS, ps), ps, o0, o1, null, watch);
  }
  laid.sort((p, q) => (p.kind === 'gate' ? 0 : 1) - (q.kind === 'gate' ? 0 : 1) || p.t0 - q.t0 || p.seed - q.seed);
  /** @type {Incident[]} */
  const out = [];
  for (const inc of laid) if (!out.some((o) => o.round === inc.round)) out.push(inc);
  return out.sort((p, q) => p.t0 - q.t0 || p.seed - q.seed);
}

/**
 * @param {Incident} inc
 * @param {Set<string>} ids
 */
export const stirHas = (inc, ids) => inc.members.some((m) => ids.has(m.id)) || (!!inc.guard && ids.has(inc.guard.id));

/**
 * @param {Incident} inc
 * @param {number} t
 * @param {number} lineMin
 * @param {{ town?: string, region?: string, places?: readonly string[] | null, home?: string | null }} [ctx]
 * @returns {{ who: StirWho, text: string, loud: boolean, index: number } | null}
 */
export function stirLine(inc, t, lineMin, ctx = {}) {
  if (!(lineMin > 0) || t < inc.from) return null;
  const index = Math.floor((t - inc.from) / lineMin);
  const line = inc.script[index];
  if (!line) return null;
  const who = line.by === 'g' ? inc.guard : inc.members[line.by === 'a' ? 0 : 1];
  if (!who) return null;
  const place = (inc.kind === 'gate' || inc.kind === 'challenge') && ctx.home ? ctx.home
    : ctx.places?.length ? ctx.places[lwSeed(inc.seed, 0x706c6163) % ctx.places.length] : null;
  const text = fillLine(line.text, { town: ctx.town, region: ctx.region, place, a: firstNameOf(inc.members[0].name), b: firstNameOf(inc.members[1].name) });
  return { who, text, loud: line.loud, index };
}

/**
 * @param {Incident} inc
 * @param {number} t
 */
export const stirLoud = (inc, t) => t >= inc.loudFrom && t < inc.end;

/**
 * @param {StirWho} who
 * @param {{ kind: string, duty?: boolean, pair?: number | null, from?: any } | null} e
 * @param {number} t
 * @param {number} perS
 * @param {{ town?: string, weather?: string | null, places?: readonly string[] | null }} [ctx]
 * @param {(e: any) => boolean} [fromTavern]
 * @returns {{ text: string, kind: 'shout'|'sing' } | null}
 */
export function smallVoice(who, e, t, perS, ctx = {}, fromTavern = () => false) {
  if (!e || !(perS > 0)) return null;
  const up = VOICE_S * perS;
  const id = textSeed(who.id);
  const tod = ((t % 1440) + 1440) % 1440, hour = Math.floor(tod / 60), dayHour = Math.floor(t / 60);
  const fill = (/** @type {string} */ text, /** @type {number} */ seed) => fillLine(text, { town: ctx.town, hour: WATCH_HOURS[/** @type {keyof typeof WATCH_HOURS} */ (hour)], place: ctx.places?.length ? ctx.places[lwSeed(seed, 0x706c6163) % ctx.places.length] : null });
  const now = (/** @type {number} */ every, /** @type {number} */ share, /** @type {number} */ salt) => {
    const k = Math.floor(t / every), seed = lwSeed(id, k, salt);
    if (draw(seed) >= share) return null;
    const at = k * every + draw(seed, 1) * Math.max(0, every - up);
    return t >= at && t < at + up ? seed : null;
  };
  if (e.duty && (e.kind === 'watch' || e.kind === 'post') && e.pair !== 1 && hour in WATCH_HOURS) {
    const seed = lwSeed(id, dayHour, 0x63616c6c);
    if (draw(seed) >= CALL_SHARE) return null;
    const at = dayHour * 60 + draw(seed, 1) * CALL_SPREAD_MIN;
    if (!(t >= at && t < at + up)) return null;
    const w = ctx.weather === 'rain' || ctx.weather === 'thunder' || ctx.weather === 'snow' || ctx.weather === 'fog' ? ctx.weather : 'fair';
    return { text: fill(pick(WATCH_CALLS[w], seed), seed), kind: 'shout' };
  }
  if (e.kind === 'stall' && hour >= 8 && hour < 18) {
    const seed = now(CRY_EVERY_MIN, CRY_SHARE, 0x63727920);
    return seed == null ? null : { text: fill(pick(STALL_CRIES, seed), seed), kind: 'shout' };
  }
  if (e.kind === 'beg') {
    const seed = now(BEG_EVERY_MIN, BEG_SHARE, 0x62656720);
    return seed == null ? null : { text: fill(pick(BEGGAR_CRIES, seed), seed), kind: 'shout' };
  }
  if (e.kind === 'walk' && (who.drink ?? 0) > SONG_DRINK && (hour >= 21 || hour < 3) && fromTavern(e)) {
    const seed = now(SONG_EVERY_MIN, SONG_SHARE, 0x736f6e67);
    return seed == null ? null : { text: fill(pick(DRINKING_SONGS, seed), seed), kind: 'sing' };
  }
  return null;
}
