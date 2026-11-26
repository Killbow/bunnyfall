// @ts-check
// Meetings, stands, and lines derive only from the spot, the round, resident ids, and the clock, so every client
// sees the same pairs saying the same words.
import { CREW_LINE_S } from '../naval/crewLife.js';
import { lwSeed, textSeed } from './seed.js';
import { pickScript, fillLine, firstNameOf, newsScript } from './lines.js';

export const ROUND_S = 120;
export const GATHER_BEAT_S = 1.5;
export const OPEN_S = Object.freeze([0, 6]);
export const PAUSE_S = Object.freeze([5, 15]);
export const SLOT_LINES = 4;
export const CLOSE_S = 3;
export const TALK_SHARE = 0.75;
export const CIRCLE_APART = 1.25;
export const CIRCLE_OUT = 1.6;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** @typedef {{ id: string, name: string, job: string }} Talker */
/** @typedef {{ members: Talker[], seed: number, start: number, end: number, from?: number, index: number }} Circle */

/**
 * @param {string} spotKey
 * @param {number} t
 * @param {number} roundMin
 * @returns {{ round: number, start: number, end: number }}
 */
export function spotRound(spotKey, t, roundMin) {
  const phase = ((textSeed(spotKey) >>> 7) % 1000) / 1000 * roundMin;
  const round = Math.floor((t + phase) / roundMin);
  const start = round * roundMin - phase;
  return { round, start, end: start + roundMin };
}

/**
 * @template {Talker} T
 * @param {string} spotKey
 * @param {readonly { who: T, t0: number, t1: number }[]} present
 * @param {number} t
 * @param {number} roundMin
 * @returns {Circle[]}
 */
export function spotCircles(spotKey, present, t, roundMin) {
  if (!(roundMin > 0)) return [];
  const { round, start, end } = spotRound(spotKey, t, roundMin);
  return dealCircles(spotKey, present.filter((p) => p.t0 <= start && p.t1 >= end).map((p) => p.who), round, start, end, GATHER_BEAT_S * roundMin / ROUND_S);
}

/**
 * @template {Talker} T
 * @param {string} key
 * @param {readonly T[]} who
 * @param {number} round
 * @param {number} start
 * @param {number} end
 * @param {number} beatMin
 * @returns {Circle[]}
 */
export function dealCircles(key, who, round, start, end, beatMin) {
  const spot = textSeed(key);
  const here = who.map((w) => ({ w, k: lwSeed(spot, round, textSeed(w.id)) }))
    .sort((a, b) => a.k - b.k || (a.w.id < b.w.id ? -1 : 1))
    .map((e) => e.w);
  /** @type {Circle[]} */
  const out = [];
  let i = 0;
  while (here.length - i >= 2) {
    const n = here.length - i === 3 ? 3 : 2;
    const members = here.slice(i, i + n);
    i += n;
    const seed = lwSeed(spot, round, ...members.map((m) => textSeed(m.id)));
    out.push({ members, seed, start, end, from: start + beatMin, index: out.length });
  }
  return out;
}

/**
 * @param {number} seed
 * @param {readonly number[]} span
 * @param {...number} salt
 */
const drawIn = (seed, [lo, hi], ...salt) => lo + (lwSeed(seed, ...salt) % 1000) / 1000 * (hi - lo);
const slotsKept = new WeakMap();

/**
 * @param {Circle} circle
 * @param {number} lineMin
 * @returns {readonly number[]}
 */
export function circleSlots(circle, lineMin) {
  const kept = slotsKept.get(circle);
  if (kept && kept.lineMin === lineMin) return kept.slots;
  const perS = lineMin / CREW_LINE_S, slot = SLOT_LINES * lineMin, close = circle.end - CLOSE_S * perS;
  const slots = [];
  for (let s = (circle.from ?? circle.start) + drawIn(circle.seed, OPEN_S, 0x6f70656e) * perS; s + slot <= close; s += slot + drawIn(circle.seed, PAUSE_S, 0x70617573, slots.length) * perS) slots.push(s);
  slotsKept.set(circle, { lineMin, slots });
  return slots;
}

/**
 * @param {Circle} circle
 * @param {number} t
 * @param {number} lineMin
 * @returns {{ k: number, s: number } | null}
 */
export function exchangeAt(circle, t, lineMin) {
  if (!circle || !(lineMin > 0) || t < (circle.from ?? circle.start) || t >= circle.end) return null;
  const slots = circleSlots(circle, lineMin), slot = SLOT_LINES * lineMin;
  for (let k = 0; k < slots.length && slots[k] <= t; k++) if (t < slots[k] + slot) return { k, s: slots[k] };
  return null;
}

/**
 * @param {Circle} circle
 * @param {number} k
 */
export const slotSpoken = (circle, k) => (lwSeed(circle.seed, k, 0x73706b6e) % 1000) / 1000 < TALK_SHARE;

/**
 * @param {Circle} circle
 * @param {number} t
 * @param {number} lineMin
 * @param {{ town?: string, region?: string, place?: string, places?: readonly string[] | null, weather?: string|null, hour?: number, road?: 'walk'|'camp'|null, news?: readonly { kind: string, who: string, foe: string, place: string }[] | null, player?: string, room?: string|null }} [ctx]
 * @param {Map<string, any> | null} [memo]
 * @returns {{ who: Talker, text: string, index: number, k: number } | null}
 */
export function circleLine(circle, t, lineMin, ctx = {}, memo = null) {
  const at = exchangeAt(circle, t, lineMin);
  if (!at || !slotSpoken(circle, at.k)) return null;
  const index = Math.floor((t - at.s) / lineMin);
  const { script, told } = exchangeScript(circle, at.k, lineMin, ctx, memo);
  if (index >= script.length) return null;
  const n = circle.members.length;
  const who = circle.members[(at.k + (index % 2 ? 1 + ((index - 1) >> 1) % (n - 1) : 0)) % n];
  const text = fillLine(script[index], {
    town: ctx.town, region: ctx.region, place: told ? told.item.place : placeOf(circle, at.k, ctx),
    a: firstNameOf(circle.members[at.k % n].name), b: firstNameOf(circle.members[(at.k + 1) % n].name),
    who: told ? (told.item.kind === 'routed' ? told.item.who : firstNameOf(told.item.who)) : null, foe: told ? told.item.foe : null, player: ctx.player,
    house: told?.item.house ?? null,
    guild: told?.item.guild ?? null,
    from: told?.item.from ?? null,
  });
  return { who, text, index, k: at.k };
}

const placeOf = (/** @type {Circle} */ circle, /** @type {number} */ k, /** @type {any} */ ctx) => (ctx.places?.length ? ctx.places[lwSeed(circle.seed, k, 0x706c6163) % ctx.places.length] : ctx.place);

/**
 * The script is fixed when the exchange begins and cached in `memo`, so a weather change mid-exchange does not swap
 * it.
 * @param {Circle} circle
 * @param {number} k
 * @param {number} lineMin
 * @param {any} ctx
 * @param {Map<string, any> | null} memo
 * @returns {{ script: readonly string[], told: { item: any, script: readonly string[] } | null }}
 */
export function exchangeScript(circle, k, lineMin, ctx, memo) {
  const key = `${circle.seed}:${k}`;
  const kept = memo?.get(key);
  if (kept) return kept;
  const slots = circleSlots(circle, lineMin);
  const s = slots[k] ?? (circle.from ?? circle.start);
  const hour = Math.floor((((s % 1440) + 1440) % 1440) / 60);
  const n = circle.members.length;
  const jobs = circle.members.map((_, i) => circle.members[(k + i) % n].job);
  let j = k - 1;
  while (j >= 0 && !slotSpoken(circle, j)) j--;
  const last = j >= 0 ? exchangeScript(circle, j, lineMin, ctx, memo).script : null;
  /** @type {{ script: readonly string[], told: any }} */
  let got = { script: [], told: null };
  for (let i = 0; i < 4; i++) {
    const seed = lwSeed(circle.seed, k, i);
    const told = ctx.road ? null : newsScript(seed, ctx.news);
    got = { script: told ? told.script : pickScript(seed, { jobs, weather: ctx.weather ?? null, hour, road: ctx.road ?? null, room: ctx.room ?? null }), told };
    if (got.script !== last) break;
  }
  memo?.set(key, got);
  return got;
}

export const clockMinutes = (seconds, minutesPerSecond) => seconds * minutesPerSecond;
/** @param {number} minutesPerSecond */
export const lineMinutes = (minutesPerSecond) => clockMinutes(CREW_LINE_S, minutesPerSecond);

/**
 * @param {{ x: number, z: number, key?: string }} spot
 * @param {{ index: number, members: readonly any[] }} circle
 * @param {import('./places.js').Street|null} [street]
 * @returns {readonly { x: number, z: number, yaw: number }[]}
 */
export function circleStands(spot, circle, street = null) {
  const n = circle.members.length;
  const a = circle.index * GOLDEN;
  if (!street) {
    const c = circleMiddle(spot, circle);
    return circle.members.map((_, i) => {
      const b = a + (i / n) * Math.PI * 2;
      const x = c.x + Math.sin(b) * (CIRCLE_APART / 2), z = c.z + Math.cos(b) * (CIRCLE_APART / 2);
      return { x, z, yaw: Math.atan2(c.x - x, c.z - z) };
    });
  }
  const kept = keptOf(street).stands;
  const key = `${spotKeyOf(spot)}|c${circle.index}|${n}`;
  const known = kept.get(key);
  if (known) return known;
  const { b, rc, hold } = middleOf(spot, circle, street);
  const c = { x: spot.x + Math.sin(b) * rc, z: spot.z + Math.cos(b) * rc };
  /** @type {{ x: number, z: number, yaw: number }[] | null} */
  let got = null;
  for (let t = 0; t < 24 && !got; t++) {
    const turn = (t % 2 ? -1 : 1) * Math.ceil(t / 2) * (Math.PI / 12);
    const places = [];
    for (let i = 0; i < n; i++) {
      const bb = a + (b - a) + (i / n) * Math.PI * 2 + turn;
      const x = c.x + Math.sin(bb) * (CIRCLE_APART / 2), z = c.z + Math.cos(bb) * (CIRCLE_APART / 2);
      if (!street.clear(spot.x, spot.z, x, z)) break;
      places.push({ x, z, yaw: Math.atan2(c.x - x, c.z - z) });
    }
    if (places.length === n) got = places;
  }
  if (!got) {
    const far = Math.max(0, hold - STAND_MARGIN_M), span = (n - 1) * CIRCLE_APART;
    let d0 = Math.min(rc - span / 2, far - span), gap = CIRCLE_APART;
    if (d0 < 0) { d0 = 0; gap = n > 1 ? far / (n - 1) : 0; }
    got = circle.members.map((_, i) => {
      const d = d0 + i * gap;
      return { x: spot.x + Math.sin(b) * d, z: spot.z + Math.cos(b) * d, yaw: d < rc ? b : b + Math.PI };
    });
  }
  kept.set(key, got);
  return got;
}

/**
 * @param {{ x: number, z: number, key?: string }} spot
 * @param {{ index: number }} circle
 * @param {import('./places.js').Street|null} [street]
 * @returns {{ x: number, z: number }}
 */
export function circleMiddle(spot, circle, street = null) {
  const a = circle.index * GOLDEN;
  if (!street) { const r = CIRCLE_OUT + 0.9 * circle.index; return { x: spot.x + Math.sin(a) * r, z: spot.z + Math.cos(a) * r }; }
  const { b, rc } = middleOf(spot, circle, street);
  return { x: spot.x + Math.sin(b) * rc, z: spot.z + Math.cos(b) * rc };
}

function middleOf(/** @type {{ x: number, z: number, key?: string }} */ spot, /** @type {{ index: number }} */ circle, /** @type {import('./places.js').Street} */ street) {
  const a = circle.index * GOLDEN;
  const r = CIRCLE_OUT + 0.9 * circle.index;
  const { b, hold } = openBearing(spot, street, a, CIRCLE_OUT + CIRCLE_APART);
  const rc = hold >= r + CIRCLE_APART / 2 ? r : Math.max(0, hold - CIRCLE_APART / 2 - STAND_MARGIN_M);
  return { b, rc, hold };
}

/**
 * @param {{ x: number, z: number, key?: string }} spot
 * @param {string} id
 * @param {import('./places.js').Street|null} [street]
 * @returns {{ x: number, z: number, yaw: number }}
 */
export function aloneStand(spot, id, street = null) {
  const k = textSeed(id);
  const a = (k % 3600) / 3600 * Math.PI * 2, r = ALONE_NEED_M + ((k >>> 12) % 1000) / 1000 * (ALONE_FAR_M - ALONE_NEED_M);
  if (!street) return { x: spot.x + Math.sin(a) * r, z: spot.z + Math.cos(a) * r, yaw: a + Math.PI };
  const kept = keptOf(street).stands;
  const key = `${spotKeyOf(spot)}|${id}`;
  const known = kept.get(key);
  if (known) return /** @type {{ x: number, z: number, yaw: number }} */ (known);
  const { b, hold } = openBearing(spot, street, a, Math.ceil(r * 2) / 2);
  const rr = hold >= r ? r : Math.max(0, hold - STAND_MARGIN_M);
  const got = { x: spot.x + Math.sin(b) * rr, z: spot.z + Math.cos(b) * rr, yaw: b + Math.PI };
  kept.set(key, got);
  return got;
}

export const SPACE_M = 0.9;
export const SPACE_STEP_M = 0.45;
export const SPACE_FAR_M = 12;

/**
 * Places are laid in `ids` order, so earlier arrivals must come first to keep their place as others arrive.
 * @param {{ x: number, z: number, key?: string }} spot
 * @param {readonly string[]} ids
 * @param {readonly { x: number, z: number }[]} taken
 * @param {import('./places.js').Street} street
 * @param {ReadonlyMap<string, string> | null} [beside]
 * @returns {Map<string, { x: number, z: number, yaw: number }>}
 */
export function aloneStands(spot, ids, taken, street, beside = null) {
  /** @type {Map<string, { x: number, z: number, yaw: number }>} */
  const out = new Map();
  const placed = [...taken];
  const free = (/** @type {number} */ x, /** @type {number} */ z) => placed.every((p) => Math.hypot(p.x - x, p.z - z) >= SPACE_M - 1e-6);
  /** @type {Map<string, string[]>} */
  const waiting = new Map();
  /** @param {string} id */
  const lay = (id) => {
    const to = beside?.get(id);
    if (to != null && to !== id && ids.includes(to) && !out.has(to) && !waiting.get(id)?.includes(to)) { waiting.set(to, [...(waiting.get(to) ?? []), id]); return; }
    const by = to != null ? out.get(to) : null;
    const got = (by ? besideStand(spot, by, free, street) : null) ?? alone(id);
    out.set(id, got);
    placed.push(got);
    for (const w of waiting.get(id) ?? []) lay(w);
    waiting.delete(id);
  };
  /** @param {string} id */
  const alone = (id) => {
    const own = aloneStand(spot, id, street);
    let got = free(own.x, own.z) ? own : null;
    const r0 = Math.hypot(own.x - spot.x, own.z - spot.z), b0 = Math.atan2(own.x - spot.x, own.z - spot.z);
    for (let k = 0; !got && k <= 2 * SPACE_FAR_M / SPACE_STEP_M; k++) {
      const r = r0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * SPACE_STEP_M;
      if (r < ALONE_NEED_M || r > SPACE_FAR_M) continue;
      const turns = Math.floor(Math.PI * r / SPACE_STEP_M);
      for (let j = 0; !got && j <= 2 * turns; j++) {
        const b = b0 + (j % 2 ? 1 : -1) * Math.ceil(j / 2) * (SPACE_STEP_M / r);
        const x = spot.x + Math.sin(b) * r, z = spot.z + Math.cos(b) * r;
        if (free(x, z) && street.clear(spot.x, spot.z, x, z)) got = { x, z, yaw: b + Math.PI };
      }
    }
    return got ?? own;
  };
  for (const id of ids) lay(id);
  return out;
}

export const FACE_M = CIRCLE_APART;

/**
 * @param {{ x: number, z: number }} spot
 * @param {{ x: number, z: number, yaw: number }} by
 * @param {(x: number, z: number) => boolean} free
 * @param {import('./places.js').Street} street
 * @returns {{ x: number, z: number, yaw: number } | null}
 */
export function besideStand(spot, by, free, street) {
  const turns = Math.ceil(Math.PI * FACE_M / SPACE_STEP_M);
  for (let j = 0; j <= 2 * turns; j++) {
    const b = by.yaw + (j % 2 ? 1 : -1) * Math.ceil(j / 2) * (SPACE_STEP_M / FACE_M);
    const x = by.x + Math.sin(b) * FACE_M, z = by.z + Math.cos(b) * FACE_M;
    if (free(x, z) && street.holds(x, z) && street.clear(by.x, by.z, x, z) && street.clear(spot.x, spot.z, x, z)) return { x, z, yaw: b + Math.PI };
  }
  return null;
}

const SPACE_TURNS = Object.freeze([0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6].map((k) => k * Math.PI / 12));

/**
 * The result is cached per street, spot, and each circle's index and size, so placement must not depend on who the
 * members are.
 * @param {{ x: number, z: number, key?: string }} spot
 * @param {readonly { index: number, members: readonly any[] }[]} circles
 * @param {import('./places.js').Street} street
 * @returns {readonly (readonly { x: number, z: number, yaw: number }[])[]}
 */
export function circlesStands(spot, circles, street) {
  const kept = keptOf(street).stands;
  const key = `${spotKeyOf(spot)}|L${circles.map((c) => `${c.index}.${c.members.length}`).join(',')}`;
  const known = kept.get(key);
  if (known) return known;
  /** @type {{ x: number, z: number }[]} */
  const placed = [];
  const free = (/** @type {number} */ x, /** @type {number} */ z) => placed.every((p) => Math.hypot(p.x - x, p.z - z) >= SPACE_M - 1e-6);
  const out = circles.map((c) => {
    let got = /** @type {readonly { x: number, z: number, yaw: number }[] | null} */ (circleStands(spot, c, street));
    if (!got.every((p) => free(p.x, p.z))) {
      const own = got, mid = circleMiddle(spot, c, street), n = c.members.length, half = CIRCLE_APART / 2;
      const r0 = Math.hypot(mid.x - spot.x, mid.z - spot.z), b0 = Math.atan2(mid.x - spot.x, mid.z - spot.z);
      got = null;
      for (let k = 0; !got && k <= 2 * SPACE_FAR_M / SPACE_STEP_M; k++) {
        const r = r0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * SPACE_STEP_M;
        if (r < half + ALONE_NEED_M || r > SPACE_FAR_M) continue;
        const arcs = Math.floor(Math.PI * r / SPACE_STEP_M);
        for (let j = 0; !got && j <= 2 * arcs; j++) {
          const b = b0 + (j % 2 ? 1 : -1) * Math.ceil(j / 2) * (SPACE_STEP_M / r);
          const cx = spot.x + Math.sin(b) * r, cz = spot.z + Math.cos(b) * r;
          for (const turn of SPACE_TURNS) {
            const places = [];
            for (let i = 0; i < n; i++) {
              const bb = b + (i / n) * Math.PI * 2 + turn;
              const x = cx + Math.sin(bb) * half, z = cz + Math.cos(bb) * half;
              if (!free(x, z) || !street.clear(spot.x, spot.z, x, z)) break;
              places.push({ x, z, yaw: Math.atan2(cx - x, cz - z) });
            }
            if (places.length === n) { got = places; break; }
          }
        }
      }
      got ??= own;
    }
    placed.push(...got);
    return got;
  });
  kept.set(key, out);
  return out;
}

export const STAND_BEARINGS = 64;
export const STAND_SOUND_M = 16;
export const STAND_MARGIN_M = 0.05;
export const ALONE_NEED_M = 1;
export const ALONE_FAR_M = 3.5;

/** @type {WeakMap<object, { profiles: Map<string, { reach: Float64Array, open: Map<number, number[]> }>, stands: Map<string, any> }>} */
const keptBy = new WeakMap();
const keptOf = (/** @type {object} */ street) => { let k = keptBy.get(street); if (!k) keptBy.set(street, k = { profiles: new Map(), stands: new Map() }); return k; };
const spotKeyOf = (/** @type {{ x: number, z: number, key?: string }} */ spot) => spot.key ?? `${spot.x},${spot.z}`;

/**
 * @param {{ x: number, z: number, key?: string }} spot
 * @param {import('./places.js').Street} street
 * @param {number} a
 * @param {number} need
 * @returns {{ b: number, hold: number }}
 */
export function openBearing(spot, street, a, need) {
  const kept = keptOf(street).profiles;
  const sk = spotKeyOf(spot);
  let prof = kept.get(sk);
  if (!prof) {
    const reach = new Float64Array(STAND_BEARINGS);
    for (let i = 0; i < STAND_BEARINGS; i++) {
      const b = (i / STAND_BEARINGS) * Math.PI * 2;
      reach[i] = street.reach(spot.x, spot.z, spot.x + Math.sin(b) * STAND_SOUND_M, spot.z + Math.cos(b) * STAND_SOUND_M);
    }
    kept.set(sk, prof = { reach, open: new Map() });
  }
  let open = prof.open.get(need);
  if (!open) {
    open = [];
    for (let i = 0; i < STAND_BEARINGS; i++) if (prof.reach[i] >= need) open.push(i);
    if (!open.length) { let best = 0; for (let i = 1; i < STAND_BEARINGS; i++) if (prof.reach[i] > prof.reach[best]) best = i; open.push(best); }
    prof.open.set(need, open);
  }
  let b = a;
  if (open.length < STAND_BEARINGS) {
    const u = a / (Math.PI * 2) - Math.floor(a / (Math.PI * 2));
    const f = u * open.length, j = Math.min(open.length - 1, Math.floor(f));
    const i = open[j];
    const next = open[(j + 1) % open.length] === (i + 1) % STAND_BEARINGS;
    b = ((i + (f - j) * (next ? 1 : 0.5)) / STAND_BEARINGS) * Math.PI * 2;
  }
  const hold = street.reach(spot.x, spot.z, spot.x + Math.sin(b) * STAND_SOUND_M, spot.z + Math.cos(b) * STAND_SOUND_M);
  return { b, hold };
}
