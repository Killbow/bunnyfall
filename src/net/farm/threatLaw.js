// @ts-check
// BUNNYFALL FARM EXPANSION, PHASE 6 (docs/FARM-EXPANSION.md section 8): THREATS - blight in the beds, prowlers at the pens.
// Both are ONE small simulation that every end runs the same way (`settleThreats`): a garden carries a cursor
// (`garden.threat`) and the simulation walks from the cursor to now, in fixed steps, stamping what happened. The service
// settles before every action that writes the garden; the client settles a copy to draw what the next action will find.
// Nothing here ever kills a crop, takes a bed or hurts an animal: a blighted crop is harvested Common at half yield, a
// fright only lowers an animal's contentment (rule 4).
//
// BLIGHT. The server has no bed positions, so spread is COUNT-BASED and says so: in each half-day step a planted, unripe
// bed of a crop catches blight by its own chance (BLIGHT_BASE; x BLIGHT_STREAK when the same crop has stood in that bed
// three times running; halved when the crop differs from the bed's last), plus SPREAD_EACH for every OTHER bed of that
// crop on the farm already blighted when the step began (at most SPREAD_MAX): it travels through a crop, not through
// space. The dice are the hash of (farm, bed, step), the same for every end. `bed.blight` is the step it was caught in.
// A bed's last crops (`garden.rot[bed]`, three at most) are written when it is harvested or pulled.
// PROWLERS. At night (classic hours 21-5 of the shared calendar) a wild wolf now and then comes toward the pens. If it
// is not chased off (clicking the pen while it is there), the herd loses PROWL_FRIGHT contentment, unless a content dog
// keeps the yard; applied the next time the garden is written. The wolf has no sprite: it is told in words.
// Pure: no clock, no network.
import { sharedClassicMinutes, wallMsForClassicMinutes } from '../wire.js';
import { MINUTES_PER_DAY } from '../../systems/gameDate.js';
import { contentAt, kindContent } from './herdLaw.js';

export const BLIGHT_STEP_S = 12 * 3600, BLIGHT_BASE = .012, BLIGHT_STREAK = 3, BLIGHT_ROTATED = .5, SPREAD_EACH = .012, SPREAD_MAX = .1;
/** The most steps walked at once (a farm left alone longer is not simulated further back: blight pauses with the crops). */
export const BLIGHT_STEPS_MAX = 16, ROT_KEEP = 3;
export const PROWL_CHANCE = .12, PROWL_STAY_S = 15 * 60, PROWL_FRIGHT = 15, PROWL_NIGHT_FROM = 21, PROWL_NIGHT_TO = 5;
export const PROWL_DAYS_MAX = 120, PROWL_HITS_MAX = 3, PROWL_KEEP = 16;

function hash01(...xs) {
  let h = 0x811c9dc5;
  for (const x of xs) { h = Math.imul(h ^ (x | 0), 0x01000193) >>> 0; h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0; }
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ─── BLIGHT ───────────────────────────────────────────────────────────
/** A bed's blight chance in one step, before any spread: from the crops that stood in it before. */
export function blightChance(rot, crop) {
  const last = rot ?? [];
  let p = BLIGHT_BASE;
  if (last.length >= ROT_KEEP && last.every((c) => c === crop)) p *= BLIGHT_STREAK;
  else if (last.length && last[last.length - 1] !== crop) p *= BLIGHT_ROTATED;
  return p;
}
/** What a bed's crops will be remembered as after one more: the last ROT_KEEP. */
export const rotAfter = (rot, crop) => [...(rot ?? []), crop].slice(-ROT_KEEP);
export const bedBlighted = (bed) => !!bed?.crop && Number.isSafeInteger(bed.blight);
/** A blighted crop's harvest: Common grade, half the yield (at least one). */
export const blightYield = (qty) => Math.max(1, Math.round(qty / 2));

function settleBlight(garden, mapId, nowS, ripeAt) {
  const step = Math.floor(nowS / BLIGHT_STEP_S), cursor = garden.threat?.at;
  /** @type {Map<number, number>} bed -> the step it caught blight in, this run */
  const caught = new Map();
  if (!Number.isSafeInteger(cursor)) return { at: step, caught };
  const stamp = (id, b) => caught.get(Number(id)) ?? (Number.isSafeInteger(b.blight) ? b.blight : null);
  for (let s = Math.max(cursor, step - BLIGHT_STEPS_MAX) + 1; s <= step; s++) {
    const at = Math.min(nowS, s * BLIGHT_STEP_S), sick = new Map();   // crop -> blighted beds as the step began
    const entries = Object.entries(garden.beds).filter(([, b]) => b?.crop);
    for (const [id, b] of entries) { const k = stamp(id, b); if (k !== null && k < s) sick.set(b.crop, (sick.get(b.crop) ?? 0) + 1); }
    for (const [id, b] of entries) {
      if (stamp(id, b) !== null || (b.sown ?? b.tick ?? 0) >= at || ripeAt?.(b, at)) continue;   // sick already, not sown yet, or ripe (a ripe crop stands past it)
      const spread = Math.min(SPREAD_MAX, (sick.get(b.crop) ?? 0) * SPREAD_EACH);
      if (hash01(mapId, Number(id), s) < blightChance(garden.rot?.[id], b.crop) + spread) caught.set(Number(id), s);
    }
  }
  return { at: step, caught };
}

// ─── PROWLERS ─────────────────────────────────────────────────────────
const NIGHT_MIN = ((24 - PROWL_NIGHT_FROM) + PROWL_NIGHT_TO) * 60, STAY_CLASSIC = PROWL_STAY_S / 60 * 12;
/** The prowler of classic day `day`'s night at a farm, or null: { id: the day, from, to } in real seconds. */
export function prowlWindow(mapId, day) {
  if (hash01(mapId, day, 0x70) >= PROWL_CHANCE) return null;
  const start = day * MINUTES_PER_DAY + PROWL_NIGHT_FROM * 60 + Math.floor(hash01(mapId, day, 0x71) * (NIGHT_MIN - STAY_CLASSIC));
  return { id: day, from: wallMsForClassicMinutes(start) / 1000, to: wallMsForClassicMinutes(start + STAY_CLASSIC) / 1000 };
}
const classicDay = (nowS) => Math.floor(sharedClassicMinutes(nowS * 1000) / MINUTES_PER_DAY);
/** The prowler at the pens now, or null. */
export function prowlNow(mapId, nowS) {
  for (const d of [classicDay(nowS), classicDay(nowS) - 1]) {
    const w = prowlWindow(mapId, d);
    if (w && nowS >= w.from && nowS < w.to) return w;
  }
  return null;
}
/** Whether a prowler is at the pens now and nobody has chased it. */
export const prowlHere = (garden, mapId, nowS) => { const w = prowlNow(mapId, nowS); return w && !(garden?.threat?.chased ?? []).includes(w.id) ? w : null; };

function settleProwl(garden, mapId, nowS) {
  const day = classicDay(nowS), cursor = garden.threat?.prowl;
  if (!Number.isSafeInteger(cursor)) return { prowl: day - 1, hits: [] };
  const hits = []; let d = Math.max(cursor, day - PROWL_DAYS_MAX);
  for (d += 1; d <= day; d++) {
    const w = prowlWindow(mapId, d);
    if (w && w.to > nowS) break;   // still to come, or at the pens now: settled once it has gone
    if (w && !(garden.threat?.chased ?? []).includes(w.id)) hits.push(w);
  }
  return { prowl: d - 1, hits };
}

// ─── THE SETTLEMENT ───────────────────────────────────────────────────
/**
 * The garden with its threats settled to `nowS`: blight stamped, unchased prowlers' fright dealt to the herd, the cursor
 * moved. Returns the same object when nothing changed (a garden with no cursor yet just gets one: no history is invented).
 */
export function settleThreats(garden, mapId, nowS, ripeAt) {
  if (!garden || !Number.isFinite(nowS) || nowS < 0) return garden;
  const b = settleBlight(garden, mapId >>> 0, nowS, ripeAt), p = settleProwl(garden, mapId >>> 0, nowS);
  const t = garden.threat;
  if (t && t.at === b.at && t.prowl === p.prowl && !b.caught.size && !p.hits.length) return garden;
  const next = structuredClone(garden);
  for (const [id, step] of b.caught) next.beds[id].blight = step;
  let hits = p.hits.filter((w) => !kindContent(garden, 'dog', w.from)).slice(-PROWL_HITS_MAX);
  if (hits.length && next.herd?.length) {
    next.herd = next.herd.map((a) => ({ ...a, content: Math.max(0, Math.round((contentAt(a, nowS) - hits.length * PROWL_FRIGHT) * 10) / 10), tick: nowS }));
  } else hits = [];
  next.threat = { ...(garden.threat ?? {}), at: b.at, prowl: p.prowl, ...(hits.length ? { fright: nowS } : {}) };
  if (next.threat.chased) next.threat.chased = next.threat.chased.filter((id) => id > p.prowl - PROWL_KEEP);
  return next;
}

/** The prowler chased off by a click on the pens, while it is there (any member at the farm; the service checks the Company). */
export function stepFarmProwl(garden, { mapId = 0 }, nowS, ripeAt) {
  const base = settleThreats(garden, mapId, nowS, ripeAt), w = prowlNow(mapId >>> 0, nowS);
  if (!w) return { error: 'farm-prowl-none' };
  if ((base.threat?.chased ?? []).includes(w.id)) return { error: 'farm-prowl-gone' };
  const next = structuredClone(base);
  next.threat = { ...(next.threat ?? {}), chased: [...(next.threat?.chased ?? []), w.id].slice(-PROWL_KEEP) };
  return { garden: next, harvests: [], worked: [], prowlChased: true };
}

/** Validation of the threats' share of a garden. */
export function validThreats(garden) {
  const int = (n, max = 2 ** 40) => Number.isSafeInteger(n) && n >= 0 && n <= max;
  const t = garden.threat;
  if (t !== undefined && !(t && typeof t === 'object' && (t.at === undefined || int(t.at)) && (t.prowl === undefined || Number.isSafeInteger(t.prowl))
    && (t.fright === undefined || int(t.fright)) && (t.chased === undefined || (Array.isArray(t.chased) && t.chased.length <= PROWL_KEEP && t.chased.every((n) => Number.isSafeInteger(n)))))) return false;
  const r = garden.rot;
  if (r !== undefined && !(r && typeof r === 'object' && Object.entries(r).every(([k, v]) => /^(0|[1-9]\d*)$/.test(k) && Array.isArray(v) && v.length <= ROT_KEEP && v.every((c) => typeof c === 'string' && c.length <= 16)))) return false;
  return Object.values(garden.beds ?? {}).every((b) => !b || b.blight === undefined || int(b.blight));
}
