// Breaks normal-power concealment when an attack lands. A leaf with no imports on purpose: formulas.js cannot
// import effects.js without a cycle that reads EFFECT_FLAGS too early, so effects.js re-exports this instead.

// Only the Normal variants break. The True variants (23,1, 13,1, and 24,1) survive an attack, as in DFU.
export const NORMAL_POWER_CONCEALMENTS = Object.freeze(['chameleonNormal', 'invisNormal', 'shadeNormal']);

// An entry pinned to a worn item is ended in place and keeps its pin, so the reroll of that item recasts it later.
// Unlike DFU, which ends only the first effect of a type, every live entry ends.
/** @returns {boolean} */
export function breakNormalPowerConcealment(entity) {
  const list = entity?.activeEffects;
  if (!list || !list.length) return false;
  const broken = list.filter((a) => NORMAL_POWER_CONCEALMENTS.includes(a.kind) && !a.ended);
  if (!broken.length) return false;
  for (const a of broken) {
    if (a.heldItem) { a.roundsRemaining = 0; a.ended = true; }
  }
  entity.activeEffects = list.filter((a) => a.heldItem || !broken.includes(a));
  return true;
}

// Only the concealment half of DFU's HandleAttackFromSource is ported. A null source does nothing, as in DFU.
export function handleAttackFromSource(source) {
  return breakNormalPowerConcealment(source ?? null);
}
