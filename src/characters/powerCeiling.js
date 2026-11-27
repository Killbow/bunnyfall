// @ts-check
// The two composite power ceilings: each registry's own top first, then the product of every top.

export const BLOW_TOPS = Object.freeze({ sigil: 12, sets: 200, loot: 240, firmament: 50, mastery: 80, martial: 40 });
export const GUARD_TOPS = Object.freeze({ loot: 55, sets: 50, firmament: 15, martial: 30, arcane: 20 });
export const BLOW_MOST = Object.values(BLOW_TOPS).reduce((k, p) => k * (1 + p / 100), 1);
export const GUARD_LEAST = Object.values(GUARD_TOPS).reduce((k, p) => k * (1 - p / 100), 1);
const SLACK = 1e-6;

/** @typedef {{ k: number, per: Record<string, number> }} Held */
/** @type {Held|null} */
let _blow = null;
/** @type {Held|null} */
let _guard = null;
const held = () => ({ k: 1, per: {} });

export function openBlowCeiling() { const was = _blow; _blow = held(); return was; }
/** @param {Held|null} was */
export function closeBlowCeiling(was) { _blow = was; }
export function openGuardCeiling() { const was = _guard; _guard = held(); return was; }
/** @param {Held|null} was */
export function closeGuardCeiling(was) { _guard = was; }

/**
 * @param {number} pct
 * @param {string|null} [registry]
 */
export function blowRoom(pct, registry = null) {
  if (!Number.isFinite(pct)) return 0;
  const k = _blow?.k ?? 1, own = (registry != null ? _blow?.per[registry] : null) ?? 1;
  const top = registry == null ? BLOW_MOST : 1 + (BLOW_TOPS[registry] ?? 0) / 100;
  const room = Math.max(0, (Math.min(BLOW_MOST / k, top / own) - 1) * 100);
  const take = pct <= room + SLACK ? pct : room;
  if (_blow) { _blow.k = k * (1 + take / 100); if (registry != null) _blow.per[registry] = own * (1 + take / 100); }
  return take;
}
/**
 * @param {number} less
 * @param {string|null} [registry]
 */
export function guardRoom(less, registry = null) {
  if (!Number.isFinite(less)) return 0;
  const k = _guard?.k ?? 1, own = (registry != null ? _guard?.per[registry] : null) ?? 1;
  const least = registry == null ? GUARD_LEAST : 1 - (GUARD_TOPS[registry] ?? 0) / 100;
  const room = Math.max(0, (1 - Math.max(GUARD_LEAST / k, least / own)) * 100);
  const take = less <= room + SLACK ? less : room;
  if (_guard) { _guard.k = k * (1 - take / 100); if (registry != null) _guard.per[registry] = own * (1 - take / 100); }
  return take;
}

export const ceilingProducts = () => ({ blow: _blow?.k ?? null, guard: _guard?.k ?? null });
