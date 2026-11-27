// @ts-check
// Records the highest stage each sigil set has reached for this character, so a fresh piece earns catch-up XP.

import { SIGIL_STAGES, SIGIL_SET_IDS } from './sigil.js';
import { registerModSaveData } from '../saves/modSaveData.js';

export const CATCH_UP_MULT = 3;
// Matches the first tier's piece count in SET_TIERS (sigilSets.js).
export const REACH_PIECES = 2;
const STAGE_MAX = SIGIL_STAGES.length - 1;

/** @type {Record<string, number>} */
let _reach = {};

export function reachOfRanks(ranks) {
  const sorted = [...ranks].filter(Number.isInteger).sort((a, b) => b - a);
  return sorted.length >= REACH_PIECES ? sorted[REACH_PIECES - 1] : -1;
}
export const recordedReach = (id) => _reach[id] ?? -1;
// The recorded reach is never lowered, so selling a piece later does not take it away.
export function noteReach(worn) {
  /** @type {Map<string, number>} */
  const out = new Map();
  for (const id of SIGIL_SET_IDS) {
    const now = Math.max(recordedReach(id), reachOfRanks(worn.get(id) ?? []));
    if (now > recordedReach(id)) _reach[id] = now;
    if (now >= 0) out.set(id, now);
  }
  return out;
}

export function catchUpXp(xp, have, reach) {
  const gain = Math.max(0, Math.floor(Number(xp) || 0));
  if (!(reach > 0) || !gain) return gain;
  const to = SIGIL_STAGES[Math.min(reach, STAGE_MAX)].xp;
  const was = Math.max(0, Number(have) || 0);
  if (was >= to) return gain;
  const fast = gain * CATCH_UP_MULT;
  if (was + fast <= to) return fast;
  return (to - was) + Math.max(0, gain - Math.ceil((to - was) / CATCH_UP_MULT));
}

export const SET_REACH_SAVE_VENDOR = 'SigilSetReach';
export function validReachRecord(r) {
  const m = r && typeof r === 'object' && r.reach && typeof r.reach === 'object' && !Array.isArray(r.reach) ? r.reach : {};
  /** @type {Record<string, number>} */
  const out = {};
  for (const id of SIGIL_SET_IDS) if (Number.isInteger(m[id]) && m[id] >= 0 && m[id] <= STAGE_MAX) out[id] = m[id];
  return out;
}
registerModSaveData(SET_REACH_SAVE_VENDOR, {
  newSaveData: () => ({ reach: {} }),
  getSaveData: () => ({ reach: { ..._reach } }),
  restoreSaveData: (r) => { _reach = validReachRecord(r); },
});

export function _resetSetReachForTests() { _reach = {}; }
