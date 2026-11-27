// @ts-check
// Each dead enemy and emptied container respawns on its own clock from the moment it fell or was emptied; visits to
// the dungeon do not reset it.
import { RESPAWN_MS } from '../net/wire.js';

export const DUNGEON_RESPAWN_MS = 20 * 60_000;
export const ELITE_DUNGEON_RESPAWN_MS = 40 * 60_000;

export const dungeonRespawnMs = ({ elite = false, wild = false, superTier = false } = {}) =>
  (wild || superTier ? RESPAWN_MS : elite ? ELITE_DUNGEON_RESPAWN_MS : DUNGEON_RESPAWN_MS);

export const dungeonRespawnDue = (stampMs, nowMs, ms) => Number.isFinite(stampMs) && Number.isFinite(nowMs) && nowMs - stampMs >= ms;
