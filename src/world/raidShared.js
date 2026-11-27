// @ts-check
// A town's raid shared across clients: one player runs it, chosen by claim window and then smallest id.

import { FOE_SEQ_MAX } from '../net/wire.js';
import { RAID_KEY_RE } from '../net/raidLaw.js';
import { STAFF_EVENT_KEY_RE, STAFF_BOSS_SIZE_MIN, STAFF_BOSS_SIZE_MAX } from '../net/staffEvent/staffEventLaw.js';
/**
 * @param {unknown} key
 */
const raidLikeKey = (key) => typeof key === 'string' && (RAID_KEY_RE.test(key) || STAFF_EVENT_KEY_RE.test(key));
export const RAID_CLAIM_WINDOW_MS = 5000;
export const RAID_WORD_STALE_MS = 6000;
export const RAID_WORDS_MAX = 4;
export const RAID_PUPPETS_MAX = 40;
export const RAID_TAGS_MAX = 64;
export const RAID_KILLS_WIRE_MAX = 999;
export const RAID_CLAIM_AGE_MAX = 7_200_000;

const recordNumber = (i) => Number.isInteger(i) && i >= 0 && i <= FOE_SEQ_MAX;

export function validRaidWords(raw) {
  /** @type {Array<{key: string, n: number, age: number}>} */
  const out = [];
  if (!Array.isArray(raw)) return out;
  const seen = new Set();
  for (const e of raw) {
    if (out.length >= RAID_WORDS_MAX) break;
    if (!Array.isArray(e) || e.length !== 3) continue;
    const [key, n, age] = e;
    if (!raidLikeKey(key) || seen.has(key)) continue;
    if (!Number.isInteger(n) || n < 0 || n > RAID_KILLS_WIRE_MAX) continue;
    if (!Number.isInteger(age) || age < -1 || age > RAID_CLAIM_AGE_MAX) continue;
    seen.add(key);
    out.push({ key, n, age });
  }
  return out;
}

export const RAID_OBJ_KINDS = 4;
export const RAID_OBJ_MAX = 100;
export function validRaidObjWords(raw) {
  /** @type {Array<{key: string, k: number, a: number, b: number}>} */
  const out = [];
  if (!Array.isArray(raw)) return out;
  const seen = new Set();
  for (const e of raw) {
    if (out.length >= RAID_WORDS_MAX) break;
    if (!Array.isArray(e) || e.length !== 4) continue;
    const [key, k, a, b] = e;
    if (!raidLikeKey(key) || seen.has(key)) continue;
    if (!Number.isInteger(k) || k < 1 || k >= RAID_OBJ_KINDS) continue;
    if (!Number.isInteger(a) || a < 0 || a > RAID_OBJ_MAX || !Number.isInteger(b) || b < 0 || b > RAID_OBJ_MAX) continue;
    seen.add(key);
    out.push({ key, k, a, b });
  }
  return out;
}

export function validRaidTags(raw) {
  /** @type {Map<number, string>} */
  const out = new Map();
  if (!Array.isArray(raw)) return out;
  for (const e of raw) {
    if (out.size >= RAID_TAGS_MAX) break;
    if (!Array.isArray(e) || e.length !== 2) continue;
    const [i, key] = e;
    if (recordNumber(i) && raidLikeKey(key)) out.set(i, key);
  }
  return out;
}

export function validStaffBossTags(raw) {
  /** @type {Map<number, number>} */
  const out = new Map();
  if (!Array.isArray(raw)) return out;
  for (const e of raw) {
    if (out.size >= 1) break;
    if (!Array.isArray(e) || e.length !== 2) continue;
    const [i, sz] = e;
    if (recordNumber(i) && Number.isSafeInteger(sz) && sz >= STAFF_BOSS_SIZE_MIN && sz <= STAFF_BOSS_SIZE_MAX) out.set(i, sz);
  }
  return out;
}

export function validAlliedIds(raw) {
  /** @type {Set<number>} */
  const out = new Set();
  if (!Array.isArray(raw)) return out;
  for (const i of raw) {
    if (out.size >= RAID_TAGS_MAX) break;
    if (recordNumber(i)) out.add(i);
  }
  return out;
}

/**
 * @param {{ me: string|null, inTown?: string[], claims?: Array<{id: string, age: number}> }} o
 * @returns {string|null}
 */
export function raidRunnerOf({ me, inTown = [], claims = [] }) {
  const live = claims.filter((c) => c && typeof c.id === 'string' && c.id && Number.isFinite(c.age));
  if (live.length) {
    const oldest = [...live].sort((a, b) => b.age - a.age || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    let win = oldest[0];
    for (const c of oldest.slice(1)) {
      if (Math.abs(win.age - c.age) <= RAID_CLAIM_WINDOW_MS && c.id < win.id) win = c;
    }
    return win.id;
  }
  const ids = [me, ...inTown].filter((id) => typeof id === 'string' && id).sort();
  return ids[0] ?? null;
}
