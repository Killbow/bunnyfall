// @ts-check
// Ordered hooks the world host runs at fixed points of its frame, so a feature registers here instead of growing it.
// Hooks run in registration order; a throw is logged and the next hook still runs. dispose() runs when the loop ends.
// Wired so far: preModal (before the modal arm), postMotor (after the player's motor), translucentDraw, and dispose.

export const WORLD_ADDON_HOOKS = Object.freeze(['preModal', 'postMotor', 'exteriorSim', 'exteriorDraw', 'translucentDraw',
  'indoorFrame', 'originRebase', 'modeChange', 'dispose']);

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
      for (const k of WORLD_ADDON_HOOKS) if (typeof addon[k] === 'function') hooks[k].push(addon[k]);
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
