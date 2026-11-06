// @ts-check
// BUNNYFALL (melee rework, combat/meleeRework.js): ARMOUR PIERCE - a leaf, so the rework registers and the overhaul core
// (combat/pcaao.js) reads with no cycle between them. `fn(attacker, target, weapon) -> share` (0..1) of what the struck
// piece's or the hide's reduction took that the blow gets back.
let _pierce = null;
export function registerArmorPierce(fn) { _pierce = typeof fn === 'function' ? fn : null; }
/** The share the blow takes back, 0 with none registered or on a throw. */
export function armorPierceShare(attacker, target, weapon) {
  if (!_pierce) return 0;
  try { const p = _pierce(attacker, target, weapon); return Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0; } catch { return 0; }
}
