// Keep this module import-free. combat/formulas.js imports it, and vampirism.js reaches formulas.js through
// loot.js, so moving the predicate into vampirism.js recreates an import cycle.
export const liveVampirism = (entity) =>
  (entity?.activeEffects ?? []).find((a) => a?.kind === 'racialOverride'
    && a.racial === 'vampirism' && !a.ended) ?? null;
