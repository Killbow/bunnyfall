// @ts-check
import { dungeonLocationFor, SMALLER_DUNGEON_THRESHOLD, MEDIUM_DUNGEON_THRESHOLD } from './smallerDungeons.js';
import { isArenaUndercroft } from './arenaCity.js';
import { isGateArena } from './gateArena.js';
import { isArenaFloor } from './arenaFloor.js';
import { isSdRealm } from './sdRealm.js';
import { isEgHall } from './eliteGates/egHall.js';
import { isKetchShip } from './ketch/ketchShip.js';
import { dungeonTier, DUNGEON_TIER_TEXT, DUNGEON_SIZE_TEXT } from './dungeonTier.js';

export const madeDungeon = (loc) => isGateArena(loc) || isArenaFloor(loc) || isArenaUndercroft(loc) || isSdRealm(loc) || isEgHall(loc) || isKetchShip(loc);

export function dungeonSizeClass(built) {
  const n = built?.dungeon?.blocks?.length ?? 0;
  if (!n) return null;
  if (n <= SMALLER_DUNGEON_THRESHOLD) return 'small';
  return n <= MEDIUM_DUNGEON_THRESHOLD ? 'medium' : 'large';
}

export function dungeonSizeOnline(loc) {
  if (!loc?.hasDungeon || !loc.dungeon?.blocks?.length) return null;
  return dungeonSizeClass(dungeonLocationFor(loc, { online: true }));
}

// Cached per location because location objects come from the maps cache and their tier and online size never
// change.
const _labels = new WeakMap();
export function dungeonTierLabel(loc) {
  const tier = dungeonTier(loc);
  if (!tier || madeDungeon(loc)) return null;
  const kept = _labels.get(loc);
  if (kept) return kept;
  const size = dungeonSizeOnline(loc);
  const label = Object.freeze({ tier, text: DUNGEON_TIER_TEXT[tier], size: size ? DUNGEON_SIZE_TEXT[size] : null });
  _labels.set(loc, label);
  return label;
}
