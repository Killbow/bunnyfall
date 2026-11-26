// @ts-check

import { ARENA_TEXT } from './arenaText.js';

export const MOOD_SETTLE_S = 7;
export const MOOD_PUSH = Object.freeze({
  call: 0.15, fight: 0.25, hit: 0.05, crit: 0.22, knockdown: 0.28, comeback: 0.4, fall: 0.35, ringout: 0.22,
  stall: -0.32, flee: -0.3, yieldEarly: -0.45, yield: -0.12, timeout: -0.25, miss: -0.01, hitHated: -0.08,
});
export const FAVOUR_PUSH = Object.freeze({
  hit: 0.02, crit: 0.08, knockdown: 0.06, comeback: 0.35, flee: -0.28, yieldEarly: -0.4, yield: -0.1, fall: 0.05,
  ringout: -0.15, stall: -0.06,
});
export const YIELD_EARLY_SHARE = 0.1;
export const HOME_FAVOUR = 0.3;
export const BEAST_BASE = -0.15;
export const BARK_GAP_MS = 2600;
export const HATED_AT = -0.3;
export const FLIP_FPS = 5;
export const FLIP_ROAR_X = 2.4;
export const HOP_M = 0.22;
export const HOP_MS = 650;

const clamp = (x, lo = -1, hi = 1) => (x < lo ? lo : x > hi ? hi : x);

export function newCrowd({ fighters = [], beasts = false, base = 0 } = {}) {
  /** @type {Record<string, number>} */
  const favour = {};
  for (const f of fighters) favour[f.id] = f.home === 'Daggerfall' ? HOME_FAVOUR : 0;
  if (beasts) for (const f of fighters) if (f.ai === false) favour[f.id] = (favour[f.id] ?? 0) + 0.2;
  const b0 = clamp(base + (beasts ? BEAST_BASE : 0));
  return { mood: b0, base: b0, favour, homes: Object.fromEntries(fighters.map((f) => [f.id, f.home ?? ''])), peak: b0, lastBarkAt: -Infinity, lastBark: '', hopAt: -Infinity, hopAmp: 0, beasts };
}

export function moodBand(mood) {
  if (mood <= -0.5) return 'boo';
  if (mood < -0.15) return 'jeer';
  if (mood <= 0.15) return 'murmur';
  if (mood < 0.6) return 'cheer';
  return 'roar';
}

export const SHOUT_PUSH = 0.05;
export const SHOUT_MAX = 0.3;
export function crowdShout(c, dir, n = 1, now = 0) {
  if (!c || (dir !== 1 && dir !== -1)) return [];
  const k = Math.min(SHOUT_MAX, SHOUT_PUSH * Math.max(1, n));
  push(c, dir * k);
  if (dir > 0 && n >= 5) { c.hopAt = now; c.hopAmp = HOP_M * 0.6; }
  return [{ s: dir > 0 ? 'cheer' : 'boo', v: Math.min(1, 0.35 + 0.08 * n) }];
}

export function crowdTick(c, dt) {
  if (!c || !(dt > 0)) return c;
  const k = 1 - Math.exp(-dt / MOOD_SETTLE_S);
  c.mood += (c.base - c.mood) * k;
  return c;
}

const push = (c, d) => { c.mood = clamp(c.mood + d); if (c.mood > c.peak) c.peak = c.mood; };
const fav = (c, id, d) => { if (id != null && id in c.favour) c.favour[id] = clamp(c.favour[id] + d); };

/**
 * @param {any} c
 * @param {{ k: string, a?: string, b?: string, dmg?: number }} e
 * @param {{ share?: (id: string) => number, title?: boolean, now?: number }} [o]
 */
export function crowdHear(c, e, { share = () => 1, title = false, now = 0 } = {}) {
  /** @type {{ s: string, v: number }[]} */
  const cues = [];
  if (!c || !e) return cues;
  switch (e.k) {
    case 'call': push(c, MOOD_PUSH.call); cues.push({ s: 'drumsCall', v: 0.9 }, { s: 'cheer', v: 0.5 }); break;
    case 'crier': cues.push({ s: 'cheer', v: 0.35 + 0.3 * Math.max(0, c.favour[e.a] ?? 0) }); break;
    case 'walk': cues.push({ s: 'drums', v: 0.8 }); break;
    case 'fight': push(c, MOOD_PUSH.fight); cues.push({ s: 'bell', v: 1 }, { s: 'roar', v: 0.7 }); break;
    case 'hit': {
      const hated = (c.favour[e.a] ?? 0) <= HATED_AT;
      if (hated) { push(c, MOOD_PUSH.hitHated); cues.push({ s: 'boo', v: 0.45 }); }
      else { push(c, MOOD_PUSH.hit); if (c.mood > 0.15) cues.push({ s: 'cheer', v: 0.25 + 0.3 * c.mood }); }
      fav(c, e.a, FAVOUR_PUSH.hit);
      break;
    }
    case 'crit': push(c, MOOD_PUSH.crit); fav(c, e.a, FAVOUR_PUSH.crit); c.hopAt = now; c.hopAmp = HOP_M; cues.push({ s: 'gasp', v: 0.9 }, { s: 'roar', v: 0.6 }); break;
    case 'knockdown': push(c, MOOD_PUSH.knockdown); fav(c, e.a, FAVOUR_PUSH.knockdown); cues.push({ s: 'groan', v: 0.9 }, { s: 'roar', v: 0.55 }); break;
    case 'comeback': push(c, MOOD_PUSH.comeback); fav(c, e.a, FAVOUR_PUSH.comeback); cues.push({ s: 'roar', v: 1 }); break;
    case 'stall': push(c, MOOD_PUSH.stall); for (const id of Object.keys(c.favour)) fav(c, id, FAVOUR_PUSH.stall); cues.push({ s: 'boo', v: 0.8 }); break;
    case 'flee': push(c, MOOD_PUSH.flee); fav(c, e.a, FAVOUR_PUSH.flee); cues.push({ s: 'boo', v: 0.85 }); break;
    case 'yield': {
      const early = share(e.a ?? '') > YIELD_EARLY_SHARE;
      push(c, early ? MOOD_PUSH.yieldEarly : MOOD_PUSH.yield); fav(c, e.a, early ? FAVOUR_PUSH.yieldEarly : FAVOUR_PUSH.yield);
      cues.push({ s: 'boo', v: early ? 1 : 0.6 });
      break;
    }
    case 'fall': push(c, MOOD_PUSH.fall); fav(c, e.a, FAVOUR_PUSH.fall); c.hopAt = now; c.hopAmp = HOP_M * 1.4; cues.push({ s: 'groan', v: 0.7 }, { s: 'roar', v: 1 }); break;
    case 'ringout': push(c, MOOD_PUSH.ringout); fav(c, e.a, FAVOUR_PUSH.ringout); cues.push({ s: 'roar', v: 0.8 }); break;
    case 'timeout': push(c, MOOD_PUSH.timeout); cues.push({ s: 'bell', v: 1 }, { s: 'boo', v: 0.5 }); break;
    case 'verdict': cues.push({ s: 'roar', v: 0.9 }, { s: title ? 'title' : 'fanfare', v: 1 }); break;
    case 'miss': push(c, MOOD_PUSH.miss); break;
    default: break;
  }
  return cues;
}

export function darlingOf(c) {
  let best = null, v = 0.25;
  for (const [id, f] of Object.entries(c?.favour ?? {})) if (f >= v) { v = f; best = id; }
  return best;
}
export function villainOf(c) {
  let worst = null, v = -0.25;
  for (const [id, f] of Object.entries(c?.favour ?? {})) if (f <= v) { v = f; worst = id; }
  return worst;
}

export function crowdBark(c, e, now, rng = Math.random) {
  if (!c || !e || now - c.lastBarkAt < BARK_GAP_MS) return null;
  /** @type {readonly string[] | null} */
  let lines = null;
  const B = ARENA_TEXT.barks;
  switch (e.k) {
    case 'hit': lines = (c.favour[e.a] ?? 0) <= HATED_AT ? B.hitHated : (rng() < 0.35 ? B.hit : null); break;
    case 'crit': lines = B.crit; break;
    case 'knockdown': lines = B.knockdown; break;
    case 'stall': lines = B.stall; break;
    case 'flee': lines = B.flee; break;
    case 'comeback': lines = B.comeback; break;
    case 'yield': lines = B.yield; break;
    case 'fall': lines = B.fall; break;
    case 'ringout': lines = B.ringout; break;
    case 'timeout': lines = B.timeout; break;
    case 'fight': lines = c.beasts ? B.beast : B.roar; break;
    default: lines = null;
  }
  if (!lines?.length) return null;
  let line;
  const darling = darlingOf(c);
  if ((e.k === 'crit' || e.k === 'comeback') && darling && c.homes[darling] && rng() < 0.4) line = ARENA_TEXT.chant(c.homes[darling]);
  else {
    const pool = lines.length > 1 ? lines.filter((l) => l !== c.lastBark) : lines;
    line = pool[Math.floor(rng() * pool.length) % pool.length];
  }
  c.lastBark = line; c.lastBarkAt = now;
  return line;
}

export const CROWD_MAX = 420;
export function crowdCount({ kind = 'exhibition', tier = 0, champion = false, grand = false } = {}) {
  if (grand) return CROWD_MAX;
  const base = kind === 'exhibition' ? 140 : 90 + Math.max(0, Math.min(9, tier | 0)) * 26;
  return Math.min(CROWD_MAX, base + (champion ? 90 : 0));
}

export const crowdFlipFps = (mood) => FLIP_FPS * (1 + Math.max(0, mood) * (FLIP_ROAR_X - 1));
export function crowdHop(c, now) {
  const t = now - (c?.hopAt ?? -Infinity);
  if (!(t >= 0 && t < HOP_MS)) return 0;
  return c.hopAmp * Math.sin(Math.PI * (t / HOP_MS));
}
export function verdictThrows(c, winnerIds = [], loserIds = []) {
  const loud = 0.5 + Math.max(0, c?.mood ?? 0);
  const fw = winnerIds.reduce((s, id) => s + (c?.favour?.[id] ?? 0), 0) / Math.max(1, winnerIds.length);
  const fl = loserIds.reduce((s, id) => s + (c?.favour?.[id] ?? 0), 0) / Math.max(1, loserIds.length);
  const flowers = winnerIds.length ? Math.round(Math.max(0, 0.4 + fw) * 10 * loud) : 0;
  const refuse = Math.round(Math.max(0, -fw) * 10 * loud + Math.max(0, -fl) * 6 * loud);
  return { flowers: Math.min(16, flowers), refuse: Math.min(16, refuse) };
}
export const THROWN_FLOWERS = Object.freeze([[254, 26], [254, 27], [254, 11], [254, 12], [254, 29]]);
export const THROWN_REFUSE = Object.freeze([[254, 57], [254, 58], [254, 59]]);

export const CROWD_PEOPLE = Object.freeze({
  gesturer: Object.freeze([[182, 0]]),
  entertainers: Object.freeze([[182, 47], [182, 48], [182, 49], [182, 50], [182, 51], [182, 52], [182, 53]]),
  courtiers: Object.freeze([[180, 1], [180, 2], [180, 3]]),
  nobles: Object.freeze([[183, 0], [183, 1], [183, 4], [185, 0], [185, 1], [185, 5], [185, 6], [185, 7], [185, 8]]),
  commoners: Object.freeze([[182, 1], [182, 2], [182, 3], [182, 4], [182, 5], [182, 6], [182, 7], [182, 8], [182, 9], [182, 10], [182, 11], [182, 12], [182, 13], [182, 14], [182, 15], [182, 16], [182, 17], [182, 18], [182, 19], [182, 20], [184, 0], [184, 1], [184, 2], [184, 3], [184, 4], [184, 5], [184, 6], [184, 7]]),
});

// The west half (x < 0) seats side 0, as in boutMarks. Washes stay near white because the shader multiplies them.
export const CROWD_WASH = Object.freeze({ red: Object.freeze([1, 0.8, 0.74]), blue: Object.freeze([0.78, 0.86, 1]) });
export const crowdHalfOf = (x) => (x < 0 ? 0 : 1);
export const crowdWash = (banner) => (banner === 'red' || banner === 'blue' ? CROWD_WASH[banner] : null);
export function crowdHalves(fighters, teams) {
  const out = /** @type {[string|null, string|null]} */ ([null, null]);
  for (const f of fighters ?? []) {
    const b = teams?.[f.id];
    if ((f.side === 0 || f.side === 1) && out[f.side] == null && (b === 'red' || b === 'blue')) out[f.side] = b;
  }
  return out;
}

export function seatPeople(seats, rng) {
  return seats.map((s) => {
    const r = rng();
    const list = s.best && r < 0.55 ? (r < 0.25 ? CROWD_PEOPLE.courtiers : CROWD_PEOPLE.nobles)
      : r < 0.34 ? CROWD_PEOPLE.gesturer : r < 0.42 ? CROWD_PEOPLE.entertainers : CROWD_PEOPLE.commoners;
    const [archive, record] = list[Math.floor(rng() * list.length) % list.length];
    return { ...s, archive, record, phase: rng() };
  });
}
