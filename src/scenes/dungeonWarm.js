// The modules a dungeon loads on demand. They are fetched once the world is up and the page is idle, so the first
// dungeon door does not wait for them one round trip after another. The list follows the imports that dungeonContext.js
// and enemyEntity.js make while a dungeon builds.

let warmed = null;

/** @returns {Promise<unknown>} */
export function warmDungeonModules() {
  warmed ??= Promise.all([
    import('../characters/enemyMotor.js'), import('../characters/enemyAttack.js'),
    import('../characters/enemyEntity.js'), import('../characters/enemyCasting.js'),
    import('../characters/enemyTargets.js'), import('../combat/formulas.js'), import('../characters/anims.js'),
    import('../formats/bsaFile.js'), import('../formats/classFile.js'), import('../render/characterSprite.js'),
  ]).catch((e) => { warmed = null; console.warn('[dungeon] warm', e?.message ?? e); });
  return warmed;
}

/** @param {number} [timeout] */
export function warmDungeonModulesWhenIdle(timeout = 4000) {
  if (typeof globalThis.requestIdleCallback === 'function') globalThis.requestIdleCallback(() => { warmDungeonModules(); }, { timeout });
  else setTimeout(() => { warmDungeonModules(); }, 1500);
}
