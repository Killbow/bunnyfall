// @ts-check
import { LEGAL_REP_MIN, LEGAL_REP_MAX } from '../../justice/court.js';
import { changeReputation } from '../../guilds/factionRep.js';
import { houseWord } from './houseName.js';

export const STANDING_SHARE = 0.25;
export const REGARD_SHARE = 0.5;
export const FACTIONS_KEPT = 40;
export const REGARDS_KEPT = 60;
export const REGARD_FLOOR = 10;
export const HOUSE_NEWS_DAYS = 7;
export const NEWS_MAX = 24;
export const NEWS_KINDS = Object.freeze(['died', 'rested', 'wed', 'born']);
const DAY_MIN = 1440;
const NAME_MAX = 60;

/** @typedef {{ legal: Record<string, number>, factions: Record<string, number>, regard: Record<string, number> }} Standing */
/** @typedef {{ k: string, who: string, t: number, m: number|null }} News */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const top = (entries, n) => entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || (a[0] < b[0] ? -1 : 1)).slice(0, n);

/**
 * @param {any} entity
 * @param {{ entries?: () => { id: string }[], regard?: (id: string, day: number) => number } | null} regards
 * @param {number} day
 * @returns {Standing}
 */
export function memberStanding(entity, regards, day) {
  const legal = {};
  for (const [k, v] of Object.entries(entity?.legalRep ?? {})) {
    const n = Math.trunc(Number(v));
    if (Number.isFinite(n) && n !== 0 && /^\d+$/.test(k)) legal[k] = clamp(n, LEGAL_REP_MIN, LEGAL_REP_MAX);
  }
  const dict = entity?.factionRep?.dict;
  const facs = dict instanceof Map ? [...dict].map(([id, f]) => [String(id), Math.trunc(Number(f?.rep) || 0)]).filter(([, r]) => r !== 0) : [];
  const regs = regards?.entries && regards.regard
    ? regards.entries().map((e) => [e.id, Math.round(/** @type {any} */ (regards).regard(e.id, day))]).filter(([, r]) => Math.abs(Number(r)) >= REGARD_FLOOR)
    : [];
  return { legal, factions: Object.fromEntries(top(facs, FACTIONS_KEPT)), regard: Object.fromEntries(top(regs, REGARDS_KEPT)) };
}

export function readStanding(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const pick = (o, keyOk, lo, hi, n) => top(Object.entries(o && typeof o === 'object' ? o : {})
    .map(([k, v]) => [k, Math.trunc(Number(v))]).filter(([k, v]) => keyOk(k) && Number.isFinite(v) && v !== 0).map(([k, v]) => [k, clamp(v, lo, hi)]), n);
  return {
    legal: Object.fromEntries(pick(raw.legal, (k) => /^\d{1,3}$/.test(k), LEGAL_REP_MIN, LEGAL_REP_MAX, 200)),
    factions: Object.fromEntries(pick(raw.factions, (k) => /^\d{1,6}$/.test(k), -100, 100, FACTIONS_KEPT)),
    regard: Object.fromEntries(pick(raw.regard, (k) => k.length > 0 && k.length <= 40, -100, 100, REGARDS_KEPT)),
  };
}

/**
 * Faction shares pass `false` to `changeReputation` so allied factions do not move.
 * @param {any} entity
 * @param {Standing|null} parent
 */
export function inheritStanding(entity, parent) {
  if (!entity || !parent) return 0;
  let n = 0;
  for (const [k, v] of Object.entries(parent.legal ?? {})) {
    const own = Number(entity.legalRep?.[k]) || 0;
    const d = Math.trunc((v - own) * STANDING_SHARE);
    if (!d) continue;
    entity.legalRep ??= {};
    entity.legalRep[k] = clamp(own + d, LEGAL_REP_MIN, LEGAL_REP_MAX);
    n++;
  }
  const store = entity.factionRep;
  for (const [id, v] of Object.entries(parent.factions ?? {})) {
    const f = store?.dict?.get?.(Number(id));
    if (!f) continue;
    const d = Math.trunc((v - (Number(f.rep) || 0)) * STANDING_SHARE);
    if (d && changeReputation(store, Number(id), d, false)) n++;
  }
  return n;
}

/**
 * @param {{ inherit?: (id: string, amount: number, day: number) => number } | null} relations
 * @param {Standing|null} parent
 * @param {number} day
 */
export function inheritRegards(relations, parent, day) {
  if (!relations?.inherit || !parent) return 0;
  let n = 0;
  for (const [id, r] of Object.entries(parent.regard ?? {})) {
    const d = Math.trunc(r * REGARD_SHARE);
    if (d) { relations.inherit(id, d, day); n++; }
  }
  return n;
}

// A total order keeps the `NEWS_MAX` cap identical on two copies that merge the same news.
const newsOrder = (/** @type {News} */ a, /** @type {News} */ b) => a.t - b.t || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0)
  || (a.who < b.who ? -1 : a.who > b.who ? 1 : 0) || (a.m ?? -1) - (b.m ?? -1);
export const newsKey = (/** @type {News} */ n) => `${n.k}|${n.t}|${n.who}`;

/** @returns {News[]} */
export function readNews(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((n) => n && NEWS_KINDS.includes(n.k) && typeof n.who === 'string' && n.who && Number.isFinite(Number(n.t)))
    .map((n) => ({ k: n.k, who: n.who.slice(0, NAME_MAX), t: Number(n.t), m: Number.isInteger(n.m) ? n.m >>> 0 : null }))
    .sort(newsOrder).slice(-NEWS_MAX);
}

/**
 * @param {any} family
 * @param {string} kind
 * @param {string} who
 * @param {number} t
 * @param {number|null|undefined} mapId
 */
export function noteNews(family, kind, who, t, mapId) {
  if (!family || !NEWS_KINDS.includes(kind) || !who || !Number.isFinite(t)) return false;
  const list = (family.news ??= []);
  const n = { k: kind, who: String(who).slice(0, NAME_MAX), t: Math.floor(t), m: Number.isInteger(mapId) ? Number(mapId) >>> 0 : null };
  if (list.some((x) => x.k === n.k && x.who === n.who && x.t === n.t)) return false;
  list.push(n);
  if (list.length > NEWS_MAX) list.splice(0, list.length - NEWS_MAX);
  return true;
}

export function mergeNews(a, b) {
  const out = readNews(a);
  for (const n of readNews(b)) if (!out.some((x) => x.k === n.k && x.who === n.who && x.t === n.t)) out.push(n);
  return out.sort(newsOrder).slice(-NEWS_MAX);
}

/**
 * Offline, each member runs a separate world clock, so news stamped later than the reader minute `t` counts as
 * heard at `t`.
 * @param {any} family
 * @param {any} reader
 * @param {number} t
 */
export function hearNews(family, reader, t) {
  if (!reader || !Number.isFinite(t)) return false;
  const news = family?.news ?? [];
  const was = reader.heard && typeof reader.heard === 'object' ? reader.heard : {};
  /** @type {Record<string, number>} */
  const heard = {};
  let fresh = false;
  for (const n of news) {
    const k = newsKey(n);
    if (Number.isFinite(was[k])) heard[k] = was[k];
    else { heard[k] = Math.floor(Math.min(n.t, t)); fresh = true; }
  }
  const dropped = Object.keys(was).some((k) => !(k in heard));
  if (fresh || dropped || !reader.heard) reader.heard = heard;
  return fresh || dropped;
}
export function readHeard(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = Object.entries(raw).filter(([k, v]) => typeof k === 'string' && k.length <= NAME_MAX + 40 && Number.isFinite(v)).slice(-NEWS_MAX);
  return out.length ? Object.fromEntries(out.map(([k, v]) => [k, Math.floor(Number(v))])) : null;
}
export function mergeHeard(a, b) {
  const out = { ...(readHeard(a) ?? {}) };
  for (const [k, v] of Object.entries(readHeard(b) ?? {})) if (!(k in out) || v < out[k]) out[k] = v;
  return Object.keys(out).length ? out : null;
}

/**
 * @param {any} family
 * @param {number} mapId
 * @param {number} t
 * @param {Record<string, number>|null} [heard]
 * @returns {{ kind: string, kin: true, who: string, house: string, foe: string, place: string, t: number, seen: true }[]}
 */
export function newsFor(family, mapId, t, heard = null) {
  if (!family?.news?.length || !Number.isFinite(t)) return [];
  const here = Number(mapId) >>> 0;
  const seat = family.seat?.mapId != null && (family.seat.mapId >>> 0) === here;
  const at = (/** @type {News} */ n) => (heard && Number.isFinite(heard[newsKey(n)]) ? heard[newsKey(n)] : n.t);
  return family.news.filter((n) => at(n) <= t && t - at(n) < HOUSE_NEWS_DAYS * DAY_MIN && (seat || (n.m != null && n.m === here)))
    .map((n) => ({ kind: n.k, kin: /** @type {true} */ (true), who: n.who, house: houseWord(family.surname), foe: '', place: '', t: at(n), seen: /** @type {true} */ (true) }))
    .sort((a, b) => b.t - a.t);
}
