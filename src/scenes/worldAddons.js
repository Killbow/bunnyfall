// @ts-check
// Ordered hooks the world host runs at fixed points of its frame, so a feature registers here instead of growing it.
// Hooks run in registration order; a throw is logged and the next hook still runs. dispose() runs when the loop ends.
// The host calls preModal, postMotor, indoorFrame, translucentDraw, and dispose. Registering any other listed hook
// throws until its call site is wired into world.js or scenes/frame/, and the hook taken off UNWIRED, in one change.

export const WORLD_ADDON_HOOKS = Object.freeze(['preModal', 'postMotor', 'exteriorSim', 'exteriorDraw', 'translucentDraw',
  'indoorFrame', 'originRebase', 'modeChange', 'dispose']);

/** Listed, but not yet called by the host. */
const UNWIRED = new Set(['exteriorSim', 'exteriorDraw', 'originRebase', 'modeChange']);

export function createWorldAddons() {
  /** @type {Record<string, Function[]>} */
  const hooks = Object.fromEntries(WORLD_ADDON_HOOKS.map((k) => [k, []]));
  /** @param {string} kind @param {any} [a] @param {any} [b] @param {any} [c] @param {any} [d] */
  function run(kind, a, b, c, d) {
    const list = hooks[kind];
    for (let i = 0; i < list.length; i++) {
      try { list[i](a, b, c, d); } catch (e) { console.error(`[worldAddons] ${kind} hook failed`, e); }
    }
  }
  return {
    /** @param {Record<string, any>} addon */
    register(addon) {
      for (const k of WORLD_ADDON_HOOKS) {
        if (typeof addon[k] !== 'function') continue;
        if (UNWIRED.has(k)) throw new Error(`worldAddons: the world host does not call the ${k} hook yet; wire its call site in world.js or scenes/frame/ in the same change`);
        hooks[k].push(addon[k]);
      }
    },
    run,
    /** @returns {boolean} */
    preModal() {
      const list = hooks.preModal;
      for (let i = 0; i < list.length; i++) {
        try { if (list[i]() === true) return true; } catch (e) { console.error('[worldAddons] preModal hook failed', e); }
      }
      return false;
    },
    dispose() {
      run('dispose');
      for (const k of WORLD_ADDON_HOOKS) hooks[k].length = 0;
    },
  };
}
