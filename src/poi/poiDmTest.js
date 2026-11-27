// @ts-check

import { giveGoods, goldOf } from './poiSettle.js';
import { t } from '../ui/textManager.js';

/** @param {any} doc */
export const testable = (doc) => doc?.v === 2 && (['events', 'dialogues', 'trades', 'routes', 'encounters', 'interactives'].some((k) => doc[k]?.length)
  || !!doc.npcs?.some((/** @type {any} */ n) => n?.showWhen));

/** @param {any} v */
const copy = (v) => { try { return structuredClone(v); } catch { return JSON.parse(JSON.stringify(v)); } };

/** @param {any} p */
export const purseOf = (p) => ({ items: copy(Array.isArray(p?.items) ? p.items : []), goldPieces: goldOf(p), wagonItems: copy(Array.isArray(p?.wagonItems) ? p.wagonItems : []) });

/**
 * @param {number[]} p
 * @param {(p: number[]) => { px: number, py: number, x: number, z: number }} sceneToPixel
 * @param {(px: number, py: number, out: number[]) => number[]} translation
 */
export function keepSpot(p, sceneToPixel, translation) {
  const at = sceneToPixel(p);
  const t = translation(at.px, at.py, [0, 0, 0]);
  return { px: at.px, py: at.py, x: at.x, y: p[1] - t[1], z: at.z };
}
/**
 * @param {{ px: number, py: number, x: number, y: number, z: number }} k
 * @param {(px: number, py: number, out: number[]) => number[]}
 */
export function spotScene(k, translation) {
  const t = translation(k.px, k.py, [0, 0, 0]);
  return [t[0] + k.x, t[1] + k.y, t[2] + k.z];
}

/** @param {{ pack: () => any, say: (line: string) => void, feet: () => (number[] | null), pool?: any, gone?: () => (string | null), save?: any, minutes?: () => number, spells?: () => any, seal?: () => any,
 *   unseal?: (snap: any) => void, deathHook?: ((fn: any) => any) | null, onSpared?: () => void, onEnd?: (why: string) => void, onChange?: () => void, load?: () => Promise<any>, panel?: any, cursor?: any, now?: () => number }} deps */
export function createPoiTest({ pack, say, feet, pool = null, gone = () => null, save = null, minutes = () => 0, spells = () => null, seal: sealGiven = null, unseal: unsealGiven = null,
  deathHook = null, onSpared = () => {}, onEnd = () => {}, onChange = () => {}, load = () => import('./poiDmRuntime.js'), panel, cursor, now }) {
  const seal = sealGiven ?? (() => (save ? save.snapshotPlayer(pack(), { classicMinutes: minutes() }) : null));
  const unseal = unsealGiven ?? ((/** @type {any} */ snap) => { save?.restorePlayer(pack(), { ...snap, classicMinutes: minutes() }, spells(), { load: false }); });
  /** @type {any} */
  let hookWas = null;
  const guard = (/** @type {any} */ e) => { if (!on) return !!hookWas?.(e); Promise.resolve().then(() => onSpared()); return true; };
  const holdDeath = () => { if (!deathHook) return; const cur = deathHook(guard); if (cur !== guard) hookWas = cur; };
  const freeDeath = () => { if (!deathHook) return; const cur = deathHook(hookWas); if (cur !== guard) deathHook(cur); hookWas = null; };
  /** @type {null | { id: string, name: string, doc: any, sealed: any }} */
  let on = null;
  /** @type {any} */
  let rt = null, mod = null;
  /** @type {any} */
  let purse = null, first = null;
  const stood = new Set();
  /** @param {any} f */
  const takeAway = (f) => { if (f?.dead) pool?.removeCorpse?.(f); else if (pool?.foes?.includes(f)) pool.removeFoe(f); };
  let shownSig = '';

  function stop({ restore = true } = {}) {
    if (!on) return;
    const was = on;
    if (rt) rt.drop(was.id);
    for (const f of stood) takeAway(f);
    stood.clear();
    on = null; rt = null; purse = null; first = null; shownSig = '';
    freeDeath();
    if (restore && was.sealed) unseal(was.sealed);
    onChange();
  }

  /**
   * @param {string} id
   * @param {any} doc
   * @param {any} [sealed]
   * @returns {any}
   */
  function start(id, doc, sealed = null) {
    if (!mod) return load().then((m) => { mod ??= m; return start(id, doc, sealed); });
    if (on) stop();
    const foes = pool ? mod.poolFoes(pool) : null;
    const snap = sealed ?? seal();
    purse = purseOf(pack());
    first = purseOf(purse);
    rt = mod.createPoiDm({
      preview: true, say, feet, now, panel, cursor,
      pack: () => purse,
      give: (/** @type {any[]} */ records, /** @type {number} */ gold) => { if (purse) giveGoods(purse, records, gold); },
      character: () => 'test',
      ...(foes ? {
        spawnFoe: (/** @type {number} */ foe, /** @type {number[]} */ at, /** @type {any} */ o) => foes.spawnFoe(foe, at, o).then((/** @type {any} */ f) => { if (f) stood.add(f); return f; }),
        isDown: foes.isDown,
        removeFoe: (/** @type {any} */ f) => { if (!f?.dead) stood.delete(f); foes.removeFoe(f); },
      } : {}),
    });
    on = { id, name: doc?.name || id, doc, sealed: snap };
    holdDeath();
    onChange();
    return true;
  }

  const model = () => (rt && on ? rt.modelOf(on.id) : null);

  return {
    async prepare() { mod ??= await load(); return true; },
    ready: () => !!mod,
    start,
    stop,
    /** @param {string} why */
    end(why) { if (!on) return; const load = gone() === 'load'; stop({ restore: !load }); onEnd(load ? 'load' : why); },
    dropRefusal: () => (on ? t('poi.test.noDrop', 'You cannot drop items while testing a POI.') : null),
    storeRefusal: () => (on ? t('poi.test.noStore', 'You cannot put items in a container while testing a POI.') : null),
    active: () => !!on,
    testing: () => (on ? { id: on.id, name: on.name } : null),
    /** @param {string} id */
    runtimeFor: (id) => (on && rt && on.id === id ? rt : null),
    purse: () => (purse ? { now: purse, first } : null),
    model,
    enemies: () => [...stood].filter((f) => (!pool || pool.foes?.includes(f)) && !f?.corpse).length,
    reset() { const was = on; if (!was) return false; stop(); return start(was.id, was.doc, was.sealed); },
    /** @param {{ template: number, recipe?: string, count: number }} s */
    addStack(s) { const it = purse && mod?.mintStack(s); if (it) { giveGoods(purse, [it], 0); onChange(); } return !!it; },
    /** @param {number} n */
    setGold(n) { if (purse) { purse.goldPieces = Math.max(0, Math.floor(n) || 0); onChange(); } },
    frame() {
      if (!on) return;
      holdDeath();
      const why = gone();
      if (why) { stop({ restore: why !== 'load' }); onEnd(why); return; }
      const m = model();
      const sig = `${m?.log.length ?? 0}|${goldOf(purse)}|${purse?.items.length ?? 0}|${stood.size}|${m ? JSON.stringify(m.encounters) : ''}`;
      if (sig !== shownSig) { shownSig = sig; onChange(); }
    },
  };
}
