// @ts-check
// Super dungeon difficulty: the tier values the dungeon host reads where it reads the Elite's.

import { sdPhase, SD_NO_RIFT, SD_NO_CLOSED, SD_NO_FALLEN, SD_COLLAPSE_MS } from '../net/sdLaw.js';
import { timerText } from '../worldEvents/eventTimers.js';
import { RDB_SIDE } from './rdbLayout.js';
import { riftCentreY } from './sdRiftModel.js';
import { GLOBAL_SCALE } from './meshReader.js';
import { t } from '../ui/textManager.js';

export const SUPER_HEALTH_SCALE = 4;
export const SUPER_DAMAGE_SCALE = 2.5;
export const SUPER_FOE_LEVEL_MIN = 24;
export const SUPER_ELITE_FOES = 6;
export const SUPER_LOOT_DROP_MULT = 1.5;
export const SUPER_LOOT_QUALITY_MULT = 1.5;

export const superFoeLevel = (level) => Math.max(SUPER_FOE_LEVEL_MIN, Number.isFinite(level) ? Math.floor(level) : 0);

/**
 * @template {object | null | undefined} T
 * @param {T} entity
 * @returns {T}
 */
export function scaleSuperFoe(entity) {
  if (!entity) return entity;
  const e = /** @type {any} */ (entity);
  e.maxHealth = Math.max(1, Math.round((e.maxHealth || 1) * SUPER_HEALTH_SCALE));
  e.health = e.maxHealth;
  e.healthMult = (e.healthMult ?? 1) * SUPER_HEALTH_SCALE;
  e.damageScale = SUPER_DAMAGE_SCALE;
  e.elite = true;
  return entity;
}

export const SUPER_LOOT_OPTS = Object.freeze({ lootDropMult: SUPER_LOOT_DROP_MULT, lootQualityMult: SUPER_LOOT_QUALITY_MULT });

export const SD_RIFT_SIZE_M = 7;
export const SD_RIFT_MIN_M = 2.6;
export const SD_RIFT_AIR_M = 0.3;
export const SD_RIFT_PROBE_M = 12;
export const SD_RIFT_SHIFT_M = 1.5;
export const SD_CHEST_M = 1.2;
export const SD_STEP_M = 0.6;
export const SD_RIFT_REACH_M = 1.2;
export const SD_RETURN_REACH_M = 0.7;
export const SD_RETURN_SIZE = Object.freeze({ w: 1.3, h: 2.3 });
export const SD_RETURN_GAP_M = 1.2;
export const SD_END_TEXT = Object.freeze({ rift: 'The Rift', riftTo: 'To the Shattered Hour', ret: 'The Return', retTo: 'To the way in' });
export const SD_NO_MARK = 'You cannot set a Mark in an Abyss Dungeon.';

export const SD_BORDER_BLOCK_RE = /^b/i;

/**
 * @param {Array<{ x: number, y: number, z: number, eliteCopy?: boolean }> | null | undefined} enemies
 * @param {Array<{ name?: string, originX?: number, originZ?: number, layout?: { startMarkers?: Array<{ x: number, y: number, z: number }>, waterLevel?: number } }> | null | undefined} blocks
 * @param {((m: { x: number, y: number, z: number }) => number) | null} [floorOf]
 */
export function sdEndMarks(enemies, blocks, floorOf = null) {
  const marks = [];
  for (const e of enemies ?? []) if (e && !e.eliteCopy && Number.isFinite(e.x) && Number.isFinite(e.z)) marks.push({ x: e.x, y: e.y, z: e.z });
  const blockOf = (m) => (blocks ?? []).find((b) => {
    const ox = b?.originX ?? 0, oz = b?.originZ ?? 0;
    return m.x >= ox && m.x < ox + RDB_SIDE && m.z >= oz && m.z < oz + RDB_SIDE;
  });
  const wet = (m) => { const level = blockOf(m)?.layout?.waterLevel; return level != null && (floorOf ? floorOf(m) : m.y) < -level * GLOBAL_SCALE; };
  const dryFirst = (list) => { const dry = list.filter((m) => !wet(m)); return dry.length ? dry : list; };
  const inner = marks.filter((m) => !SD_BORDER_BLOCK_RE.test(blockOf(m)?.name ?? ''));
  if (inner.length) return dryFirst(inner);
  if (marks.length) return dryFirst(marks);
  const out = [];
  for (const b of blocks ?? []) {
    for (const m of b?.layout?.startMarkers ?? []) {
      if (Number.isFinite(m?.x) && Number.isFinite(m?.z)) out.push({ x: m.x + (b.originX ?? 0), y: m.y, z: m.z + (b.originZ ?? 0) });
    }
  }
  return dryFirst(out);
}

export const SD_RIFT_TOP = riftCentreY(1) + 0.5;
export function sdRiftFit(headroom, clear) {
  const h = Number.isFinite(headroom) ? (headroom - SD_RIFT_AIR_M) / SD_RIFT_TOP : SD_RIFT_SIZE_M;
  const w = Number.isFinite(clear) ? 2 * (clear - SD_RIFT_AIR_M) : SD_RIFT_SIZE_M;
  return Math.max(SD_RIFT_MIN_M, Math.min(SD_RIFT_SIZE_M, h, w));
}

const BEARINGS = Object.freeze(Array.from({ length: 8 }, (_, k) => Object.freeze([Math.cos((k * Math.PI) / 4), 0, Math.sin((k * Math.PI) / 4)])));

/**
 * @typedef {{ floor: (at: number[]) => (number | null), ray: (from: number[], dir: number[], max: number) => (number | null) }} SdProbe
 */

function fitAt(at, probe) {
  const up = probe.ray([at[0], at[1] + 0.1, at[2]], [0, 1, 0], SD_RIFT_PROBE_M);
  let clear = Infinity;
  for (const dir of BEARINGS) {
    const d = probe.ray([at[0], at[1] + SD_CHEST_M, at[2]], dir, SD_RIFT_PROBE_M);
    if (d != null) clear = Math.min(clear, d);
  }
  return sdRiftFit(up == null ? Infinity : up + 0.1, clear);
}

function besideOn(from, dir, r, probe, lower = false) {
  if (probe.ray([from[0], from[1] + SD_CHEST_M, from[2]], dir, r + SD_RIFT_AIR_M) != null) return null;
  const x = from[0] + dir[0] * r, z = from[2] + dir[2] * r;
  const y = probe.floor([x, from[1], z]);
  return y != null && (lower ? y - from[1] : Math.abs(y - from[1])) <= SD_STEP_M ? [x, y, z] : null;
}

/**
 * @param {number[]} foot
 * @param {SdProbe} probe
 */
export function sdRiftPlace(foot, probe) {
  let best = ringAt([foot[0], foot[1], foot[2]], probe, -Infinity);
  for (const r of [SD_RIFT_SHIFT_M, 2 * SD_RIFT_SHIFT_M]) {
    for (const dir of BEARINGS) {
      if (best.size >= SD_RIFT_SIZE_M) return best;
      const at = besideOn(foot, dir, r, probe);
      if (!at) continue;
      const ring = ringAt(at, probe, best.size);
      if (ring && ring.size > best.size) best = ring;
    }
  }
  return best;
}
function ringAt(at, probe, floor) {
  const fit = fitAt(at, probe);
  if (fit <= floor) return null;
  const face = sdRiftFace(at, fit, probe);
  return { at, size: sdRiftSweep(at, fit, face, probe), face };
}

const SD_DISC_ANGLES = Object.freeze([0, 1, 2, 3, 5, 6, 7, 8].map((k) => (k * Math.PI) / 8));
function discClear(at, size, face, probe) {
  const R = size / 2, c = [at[0], at[1] + riftCentreY(size), at[2]];
  for (const a of SD_DISC_ANGLES) {
    const across = Math.cos(a), dir = [-face[2] * across, Math.sin(a), face[0] * across];
    if (probe.ray(c, dir, R + SD_RIFT_AIR_M) != null) return false;
  }
  return true;
}
/**
 * @param {number[]} at
 * @param {number} size
 * @param {number[]} face
 * @param {SdProbe} probe
 */
export function sdRiftSweep(at, size, face, probe) {
  if (discClear(at, size, face, probe)) return size;
  let lo = SD_RIFT_MIN_M, hi = size;
  for (let k = 0; k < SD_SWEEP_HALVINGS; k++) {
    const mid = (lo + hi) / 2;
    if (discClear(at, mid, face, probe)) lo = mid; else hi = mid;
  }
  return lo;
}
export const SD_SWEEP_HALVINGS = 8;

/**
 * @param {number[]} at
 * @param {number} size
 * @param {SdProbe} probe
 */
export const SD_RIFT_FACE_M = 2 * SD_RIFT_PROBE_M;
export function sdRiftFace(at, size, probe) {
  const reach = BEARINGS.map((dir) => probe.ray([at[0], at[1] + SD_CHEST_M, at[2]], dir, SD_RIFT_FACE_M) ?? SD_RIFT_FACE_M);
  const pairs = [0, 1, 2, 3].sort((a, b) => (reach[b] + reach[b + 4]) - (reach[a] + reach[a + 4]) || a - b);
  for (const k of pairs) {
    const along = BEARINGS[(k + 2) % 8], back = BEARINGS[(k + 6) % 8], half = [at[0], at[1] + size / 2, at[2]];
    const room = Math.min(probe.ray(half, along, size) ?? Infinity, probe.ray(half, back, size) ?? Infinity);
    if (room >= size / 2 + SD_RIFT_AIR_M) return [...BEARINGS[k]];
  }
  return [...BEARINGS[pairs[0]]];
}

export const SD_RIFT_OPEN_LOOK = Object.freeze({ state: 'open', aperture: 1, tickHz: 1, studs: 24, ember: 0, tone: 'gold', light: 1 });
export const SD_RIFT_NOT_YET = Object.freeze({ state: 'notyet', aperture: 0.07, tickHz: 0, studs: 0, ember: 0, tone: 'gold', light: 0.3 });
export const SD_RIFT_CLOSED = Object.freeze({ state: 'closed', aperture: 0, tickHz: 0, studs: 0, ember: 0, tone: 'cold', light: 0 });
export const SD_RIFT_REFUSED = Object.freeze({ state: 'refused', aperture: 0, tickHz: 0, studs: 0, ember: 0, tone: 'red', light: 0.3 });
const FOUND_LOOKS = Object.freeze(Array.from({ length: 25 }, (_, n) => Object.freeze({ ...SD_RIFT_OPEN_LOOK, studs: n })));
const COLLAPSE_LOOK = { state: 'collapse', aperture: 0, tickHz: 2, studs: 0, ember: 0, tone: 'ember', light: 0.3 };

/**
 * @param {import('../net/sdLaw.js').SdRecord | null | undefined} rec
 * @param {number} s
 * @param {number} now
 */
export function riftLook(rec, s, now, { entered = false, fallen = false } = {}) {
  if (!rec) return SD_RIFT_NOT_YET;
  if (rec.s !== s) return SD_RIFT_CLOSED;
  if (fallen) return SD_RIFT_REFUSED;
  const ph = sdPhase(rec, now);
  if (ph === 'found') return FOUND_LOOKS[Math.max(1, Math.min(24, Math.ceil((rec.until - now) / 3600000)))];
  if (ph === 'risen') return SD_RIFT_NOT_YET;
  if (ph === 'fell') {
    const left = Math.max(0, Math.min(1, (rec.fellAt + SD_COLLAPSE_MS - now) / SD_COLLAPSE_MS)), lit = Math.ceil(left * 24), c = COLLAPSE_LOOK;
    c.aperture = entered ? 1 / 3 + (2 / 3) * left : 0; c.studs = lit; c.ember = 24 - lit; c.tone = entered ? 'gold' : 'ember'; c.light = entered ? 0.5 + 0.5 * left : 0.3;
    return c;
  }
  return SD_RIFT_CLOSED;
}

/**
 * @param {{ at: number[], size: number }} rift
 * @param {SdProbe} probe
 */
export function sdReturnPlace(rift, probe) {
  for (const lower of [false, true]) {
    for (const r of [rift.size / 2 + SD_RETURN_GAP_M, 1.5]) {
      for (const dir of BEARINGS) {
        const at = besideOn(rift.at, dir, r, probe, lower);
        if (at) return at;
      }
    }
  }
  return [rift.at[0], rift.at[1], rift.at[2]];
}

export const SD_LANDING_PAST_M = 1.5;
export const SD_LANDING_CLEAR_M = 0.4;
export function sdLandingPlace(rift, ret, probe) {
  const dx = ret[0] - rift.at[0], dz = ret[2] - rift.at[2], len = Math.hypot(dx, dz);
  if (len > 1e-6) { const at = besideOn(ret, [dx / len, 0, dz / len], SD_LANDING_PAST_M, probe); if (at) return at; }
  for (const dir of BEARINGS) {
    const at = besideOn(ret, dir, SD_LANDING_PAST_M, probe);
    if (at && Math.hypot(at[0] - rift.at[0], at[2] - rift.at[2]) > len) return at;
  }
  const riftClear = Math.min(SD_RIFT_REACH_M, rift.size / 4) + SD_LANDING_CLEAR_M;
  for (const r of [SD_LANDING_PAST_M, SD_RETURN_REACH_M + SD_LANDING_CLEAR_M]) {
    for (const dir of BEARINGS) {
      const at = besideOn(ret, dir, r, probe);
      if (at && Math.hypot(at[0] - rift.at[0], at[2] - rift.at[2]) >= riftClear) return at;
    }
  }
  return [ret[0], ret[1], ret[2]];
}

export const SD_ENTERED_KEY = 'sd11.entered';
export const SD_ENTERED_MAX = 8;
export const SD_FALLEN_KEY = 'sd12.fallen';
/**
 * @param {import('../net/sdLaw.js').SdRecord | null | undefined} rec
 * @param {number} s
 * @param {number} now
 */
export function sdRiftWord(rec, s, now, { entered = false, fallen = false } = {}) {
  if (!rec) return SD_NO_RIFT;
  if (rec.s !== s) return SD_NO_CLOSED;
  if (fallen) return SD_NO_FALLEN;
  const ph = sdPhase(rec, now);
  if (ph === 'found' || (ph === 'fell' && entered)) return null;
  return ph === 'risen' ? SD_NO_RIFT : SD_NO_CLOSED;
}

export const SD_COUNT_TEXT = Object.freeze({
  fades: (t) => `Fades in ${t}`,
  collapses: (t) => `Collapses in ${t}`,
});
/**
 * @param {import('../net/sdLaw.js').SdRecord | null | undefined} rec
 * @param {number} s
 * @param {number} now
 */
export function sdRiftCount(rec, s, now) {
  if (!rec || rec.s !== s) return null;
  const ph = sdPhase(rec, now);
  if (ph === 'fell') return SD_COUNT_TEXT.collapses(timerText(rec.fellAt + SD_COLLAPSE_MS - now));
  if (ph !== 'risen' && ph !== 'found') return null;
  return SD_COUNT_TEXT.fades(timerText(rec.until - now));
}

export function sdReturnStands(rec, s, now) {
  if (!rec) return true;
  if (rec.s !== s) return false;
  const ph = sdPhase(rec, now);
  return ph === 'risen' || ph === 'found';
}

/**
 * @param {import('../net/sdLaw.js').SdRecord | null | undefined} rec
 * @param {number} s
 * @param {number} now
 */
export function sdThroughStands(rec, s, now) {
  return !!rec && rec.s === s && rec.inAt != null && sdPhase(rec, now) === 'found';
}
export const SD_THROUGH_TEXT = Object.freeze({
  get title() { return t('sd.through.title', 'The Way Through'); },
  get to() { return t('sd.through.to', 'To the Shattered Hour'); },
  get opens() { return t('sd.through.opens', 'The Rift stands open. The Way Through opens beside you.'); },
});
export const SD_THROUGH_SIZE_M = SD_RIFT_MIN_M;
export const SD_THROUGH_AHEAD_M = 3;
export const SD_THROUGH_NEAR_RIFT_M = 12;
export const SD_THROUGH_PASS_M = 0.8;
const BESIDE = Object.freeze([1, -1, 0, 2, -2, 3, -3, 4].map((k) => (k * Math.PI) / 4));
/**
 * @param {number[]} feet
 * @param {number} yaw
 * @param {SdProbe & { water?: (x: number, z: number) => (number | null) }} probe
 */
export function sdThroughPlace(feet, yaw, probe) {
  const size = SD_THROUGH_SIZE_M, a0 = Number.isFinite(yaw) ? yaw : 0;
  const ground = probe.floor(feet);
  if (ground == null || Math.abs(ground - feet[1]) > SD_STEP_M) return null;
  const foot = [feet[0], ground, feet[2]];
  for (const r of [SD_THROUGH_AHEAD_M, SD_THROUGH_AHEAD_M / 2]) {
    for (const da of BESIDE) {
      const dir = [Math.sin(a0 + da), 0, Math.cos(a0 + da)];
      const at = besideOn(foot, dir, r, probe);
      if (!at) continue;
      const face = [-dir[0], 0, -dir[2]];
      if (standsWhole(at, size, face, probe)) return { at, size, face };
    }
  }
  return null;
}
function standsWhole(at, size, face, probe) {
  if (!discClear(at, size, face, probe)) return false;
  const R = size / 2, cy = at[1] + riftCentreY(size);
  if (probe.ray([at[0], cy, at[2]], [0, 1, 0], R + SD_RIFT_AIR_M) != null) return false;
  const chest = [at[0], at[1] + SD_CHEST_M, at[2]], past = R + SD_RIFT_AIR_M + SD_THROUGH_PASS_M;
  if (probe.ray(chest, [-face[2], 0, face[0]], past) != null && probe.ray(chest, [face[2], 0, -face[0]], past) != null) return false;
  const water = probe.water?.(at[0], at[2]);
  return water == null || at[1] >= water;
}

export function inSdPortal(feet, at, reach, height) {
  if (!feet || !at) return false;
  const dx = feet[0] - at[0], dz = feet[2] - at[2];
  return dx * dx + dz * dz <= reach * reach && feet[1] >= at[1] - SD_STEP_M && feet[1] <= at[1] + height;
}
