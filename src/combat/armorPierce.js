// @ts-check
// A leaf module, so the melee rework registers the handler that the attack formula reads without an import cycle.
let _pierce = null;
export function registerArmorPierce(fn) { _pierce = typeof fn === 'function' ? fn : null; }
export function armorPierceShare(attacker, target, weapon) {
  if (!_pierce) return 0;
  try { const p = _pierce(attacker, target, weapon); return Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0; } catch { return 0; }
}
