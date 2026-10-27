// @ts-check
// POWER-CEILING (2026-10-27, bible/05-Combat/Power-Ceiling.md; a player: "I would hate hate hate to see go down the path
// of Retail WoW ... keeping you on a tread mill"): THE TWO COMPOSITE CEILINGS. Every blow power and every guard already
// caps itself; nothing capped what they make together. A blow's powers multiply (the sigil, the sets, the loot, the sky,
// mastery, the paths) and a hurt's guards compose - so each registry asks this leaf for its room, and the product stays
// at what today's strongest kit reaches (tools/powerCeiling.mjs measures it). Nothing a player has is cut; a power added
// later that would stack past it is. A leaf: the runners (entityMods.js, playerEntity.js) and the registries import it.

/** THE BLOW POWERS' TOPS: each registry's most onto one blow (per cent), measured from today's records and laws. */
export const BLOW_TOPS = Object.freeze({ sigil: 12, sets: 200, loot: 240, firmament: 50, mastery: 80, martial: 40 });
/** THE GUARDS' TOPS: each registry's most off one hurt (per cent), its guards multiplied. */
export const GUARD_TOPS = Object.freeze({ loot: 55, sets: 50, firmament: 15, martial: 30, arcane: 20 });
/** A blow is at most this many times what its powers were handed (x43.18). */
export const BLOW_MOST = Object.values(BLOW_TOPS).reduce((k, p) => k * (1 + p / 100), 1);
/** A hurt keeps at least this share of what reached the guards (10.71%). Points (Bulwark, a ward, a Shield's pool), a
 *  hit capped by health (Unyielding) and a blow turned aside whole are no share, and stand outside it. */
export const GUARD_LEAST = Object.values(GUARD_TOPS).reduce((k, p) => k * (1 - p / 100), 1);
/** Rounding's slack: a product taken in another order differs in its last bits, and that is no stacking. */
const SLACK = 1e-6;

/** @type {number|null} the blow's running product while its runner holds it open; null outside */
let _blow = null;
/** @type {number|null} the hurt's running share kept while its runner holds it open */
let _guard = null;

/** The blow runner opens its product before the first power and closes it after the last (a nested blow keeps its own). */
export function openBlowCeiling() { const was = _blow; _blow = 1; return was; }
/** @param {number|null} was */
export function closeBlowCeiling(was) { _blow = was; }
/** The hurt runner's, the same way. */
export function openGuardCeiling() { const was = _guard; _guard = 1; return was; }
/** @param {number|null} was */
export function closeGuardCeiling(was) { _guard = was; }

/** THE ROOM A BLOW POWER HAS: the share of `pct` (onto the blow it was handed) that keeps the product under BLOW_MOST.
 *  A price (a negative per cent) is taken whole and makes room. Outside a runner a power stands alone. */
export function blowRoom(pct) {
  if (!Number.isFinite(pct)) return 0;
  const k = _blow ?? 1;
  const room = Math.max(0, (BLOW_MOST / k - 1) * 100);
  const take = pct <= room + SLACK ? pct : room;
  if (_blow != null) _blow = k * (1 + take / 100);
  return take;
}
/** THE ROOM A GUARD HAS: the share of `less` (per cent off the hurt it was handed) that keeps the hurt at GUARD_LEAST of
 *  what reached the guards. A price (more damage taken) is taken whole. */
export function guardRoom(less) {
  if (!Number.isFinite(less)) return 0;
  const k = _guard ?? 1;
  const room = Math.max(0, (1 - GUARD_LEAST / k) * 100);
  const take = less <= room + SLACK ? less : room;
  if (_guard != null) _guard = k * (1 - take / 100);
  return take;
}

/** Tests: the running products, or null where no runner holds one open. */
export const ceilingProducts = () => ({ blow: _blow, guard: _guard });
