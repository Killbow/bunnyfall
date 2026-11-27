// @ts-check
let _traitTitle = (/** @type {string} */ word, /** @type {string} */ name) => `${word} ${name}`;
export function setTraitTitleFormat(fn) { if (typeof fn === 'function') _traitTitle = fn; }

/**
 * @param {any} entity
 * @param {string | null | undefined} base
 * @param {{ traits?: boolean }} [o]
 */
export function foeTitle(entity, base, { traits = true } = {}) {
  if (!base) return base;
  if (entity?.wildGiant) base = 'Greater Giant';
  const revenant = entity?.revenant?.name;
  if (typeof revenant === 'string' && revenant) return revenant;
  const band = entity?.bandName;
  if (typeof band === 'string' && band) return `${base} of ${band}`;
  const c = entity?.champion;
  const named = typeof c === 'string' && c ? `${c.charAt(0).toUpperCase()}${c.slice(1)} ${base}` : base;
  const lead = typeof entity?.raidLeader?.name === 'string' && entity.raidLeader.name ? entity.raidLeader.name : null;
  const special = entity?.staffBoss ? (entity.staffBoss.name || `Mighty ${named}`) : lead ?? (entity?.eliteFoe ? `Elite ${named}` : named);
  const traited = traits && typeof entity?.bossTitle === 'string' && entity.bossTitle ? _traitTitle(entity.bossTitle, special) : special;
  return entity?.unquiet === true && !entity.wildFoe && !entity.wildGiant && !entity.bout ? `Unquiet ${traited}` : traited;
}
