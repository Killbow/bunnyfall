// @ts-check
// Runs the in-game POI editor's Test (offline, like the editor): plays one open draft with its DM content in the game's
// runtime in preview mode (poi/poiDmRuntime.js `preview`), with routes, zones, objects, dialogues, trades, events, and
// encounters using enemies from the outdoor pool. Every trade, gift, take, and settlement lands on a throwaway copy of
// the character's purse and pack. The character is sealed: an in-memory snapshot taken when the test starts (writing
// nothing) is restored on every exit except a load, undoing any changes to loot, skills, wear, or health before
// anything can save. During a test the character cannot die (the avoid-death hook ends it) or drop items, and live POIs
// run nothing (poiHost.js `dmHeld`). Persistent variables and claims live in memory; nothing goes to the service.

import { giveGoods, goldOf } from './poiSettle.js';
import { t } from '../systems/textManager.js';

/** Whether a document has DM content a test can run (the POI host's own rule). @param {any} doc */
export const testable = (doc) => doc?.v === 2 && (['events', 'dialogues', 'trades', 'routes', 'encounters', 'interactives'].some((k) => doc[k]?.length)
  || !!doc.npcs?.some((/** @type {any} */ n) => n?.showWhen));

/** A deep copy of plain data. @param {any} v */
const copy = (v) => { try { return structuredClone(v); } catch { return JSON.parse(JSON.stringify(v)); } };

/** Copies wagonItems too, so a loaded wagon still cannot leave in Test. @param {any} p */
export const purseOf = (p) => ({ items: copy(Array.isArray(p?.items) ? p.items : []), goldPieces: goldOf(p), wagonItems: copy(Array.isArray(p?.wagonItems) ? p.wagonItems : []) });

/**
 * Converts a scene position to its map pixel's local coordinates, so a floating-origin shift does not invalidate it.
 * @param {number[]} p @param {(p: number[]) => { px: number, py: number, x: number, z: number }} sceneToPixel
 * @param {(px: number, py: number, out: number[]) => number[]} translation
 */
export function keepSpot(p, sceneToPixel, translation) {
  const at = sceneToPixel(p);
  const t = translation(at.px, at.py, [0, 0, 0]);
  return { px: at.px, py: at.py, x: at.x, y: p[1] - t[1], z: at.z };
}
/** Converts a pixel-local position from `keepSpot` back into current scene coordinates. @param {{ px: number, py:
 *  number, x: number, y: number, z: number }} k @param {(px: number, py: number, out: number[]) => number[]}
 *  translation */
export function spotScene(k, translation) {
  const t = translation(k.px, k.py, [0, 0, 0]);
  return [t[0] + k.x, t[1] + k.y, t[2] + k.z];
}

/**
 * @param {{ pack: () => any, say: (line: string) => void, feet: () => (number[] | null), pool?: any, gone?: () => (string | null), save?: any, minutes?: () => number, spells?: () => any, seal?: () => any,
 *   unseal?: (snap: any) => void, deathHook?: ((fn: any) => any) | null, onSpared?: () => void, onEnd?: (why: string) => void, onChange?: () => void, load?: () => Promise<any>, panel?: any, cursor?: any, now?: () => number }} deps
 */
export function createPoiTest({ pack, say, feet, pool = null, gone = () => null, save = null, minutes = () => 0, spells = () => null, seal: sealGiven = null, unseal: unsealGiven = null,
  deathHook = null, onSpared = () => {}, onEnd = () => {}, onChange = () => {}, load = () => import('./poiDmRuntime.js'), panel, cursor, now }) {
  // the save's own in-memory snapshot of the character, put back on the clock that stands, counted as no load
  const seal = sealGiven ?? (() => (save ? save.snapshotPlayer(pack(), { classicMinutes: minutes() }) : null));
  const unseal = unsealGiven ?? ((/** @type {any} */ snap) => { save?.restorePlayer(pack(), { ...snap, classicMinutes: minutes() }, spells(), { load: false }); });
  // a body about to die in a test (drowning, a collapse: the SetHealth(0) doors no damage modifier hears) lives: the test
  // ends as Stop test ends it once the door has run, so the character put back is the one from before the test. Held at
  // the start and every frame (an interior's frame sets the hook its own way), let go at the end.
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
  /** Tracks enemies spawned by the test, keeping dead ones until the test ends so their bodies are cleared. */
  const stood = new Set();
  /** Removes an enemy spawned by the test, or clears its corpse and loot if it died.
   *  @param {any} f */
  const takeAway = (f) => { if (f?.dead) pool?.removeCorpse?.(f); else if (pool?.foes?.includes(f)) pool.removeFoe(f); };
  let shownSig = '';

  /** Ends the test: its run and enemies go, and the character is put back unless `restore` is false (a load). */
  function stop({ restore = true } = {}) {
    if (!on) return;
    const was = on;
    if (rt) rt.drop(was.id);
    // Also remove any late-spawning enemy no longer held by the run, along with every corpse and its loot.
    for (const f of stood) takeAway(f);
    stood.clear();
    on = null; rt = null; purse = null; first = null; shownSig = '';
    freeDeath();
    if (restore && was.sealed) unseal(was.sealed);
    onChange();
  }

  /** Starts a test of `doc`. With the runtime's module loaded (`prepare`) it answers at once; before, it answers a promise
   *  of the start (the world asks `ready()` first). @param {string} id @param {any} doc @param {any} [sealed] @returns {any} */
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
        // The run lets an enemy go when its encounter resets or the run ends; a dead one stays until the test ends.
        removeFoe: (/** @type {any} */ f) => { if (!f?.dead) stood.delete(f); foes.removeFoe(f); },
      } : {}),
    });
    on = { id, name: doc?.name || id, doc, sealed: snap };
    holdDeath();
    onChange();
    return true;
  }

  /** The run's model (poiDmCore.js createDm) of the draft under test, or null. */
  const model = () => (rt && on ? rt.modelOf(on.id) : null);

  return {
    /** Loads the runtime's module (once); a test starts only after it. */
    async prepare() { mod ??= await load(); return true; },
    ready: () => !!mod,
    start,
    stop,
    /** Ends the test for `why` (a door) as the world's change does: put back, unless a load came first, then `onEnd`. @param {string} why */
    end(why) { if (!on) return; const load = gone() === 'load'; stop({ restore: !load }); onEnd(load ? 'load' : why); },
    /** Why a drop is refused while a test runs (the inventory's and the torch's), or null. */
    dropRefusal: () => (on ? t('poi.test.noDrop', 'You cannot drop items while testing a POI.') : null),
    /** Why putting an item in a container that is not the player's (a chest, a body) is refused while a test runs, or null. */
    storeRefusal: () => (on ? t('poi.test.noStore', 'You cannot put items in a container while testing a POI.') : null),
    /** Whether a test runs. */
    active: () => !!on,
    /** The draft under test: `{ id, name }`, or null. */
    testing: () => (on ? { id: on.id, name: on.name } : null),
    /** The preview runtime for the POI host, for the draft under test alone. @param {string} id */
    runtimeFor: (id) => (on && rt && on.id === id ? rt : null),
    /** The throwaway purse and pack now, and as they were at the start (or the last reset). */
    purse: () => (purse ? { now: purse, first } : null),
    /** The run's model: its log, variables, object states, and encounters. */
    model,
    /** The enemies the test stood that still stand. */
    enemies: () => [...stood].filter((f) => (!pool || pool.foes?.includes(f)) && !f?.corpse).length,
    /** Starts the same test again: the character put back, a new copy of its purse and pack, and the draft as authored. */
    reset() { const was = on; if (!was) return false; stop(); return start(was.id, was.doc, was.sealed); },
    /** @param {{ template: number, recipe?: string, count: number }} s */
    addStack(s) { const it = purse && mod?.mintStack(s); if (it) { giveGoods(purse, [it], 0); onChange(); } return !!it; },
    /** Sets the throwaway purse's gold. @param {number} n */
    setGold(n) { if (purse) { purse.goldPieces = Math.max(0, Math.floor(n) || 0); onChange(); } },
    /** Once a frame, in every mode: the test ends when the world changes under it; the panel is told when what it
     *  shows changes. */
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
