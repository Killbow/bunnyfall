// @ts-check
// Client-enforced limit of two restoring potions a hall: `useItem` checks `spirePotionRefusal` before drinking, so
// a refused bottle is not used up, and calls `spirePotionDrunk` after.
import { POTION_RECIPES, potionRecipeKey } from '../../items/potionRecipes.js';
import { madeRuleHere } from '../../characters/madeLevel.js';

// Classic Daggerfall Heal Health effect key (group 10, subgroup 8).
export const SPIRE_RESTORING_EFFECT = '10,8';
export const SPIRE_POTION_TEXT = 'You can drink 2 restoring potions a hall. They refill when the next hall wakes or at a Redoubt.';

const RESTORING_KEYS = new Set(/** @type {any[]} */ (POTION_RECIPES).filter((r) => r.effect === SPIRE_RESTORING_EFFECT || (r.secondary ?? []).includes(SPIRE_RESTORING_EFFECT)).map((r) => potionRecipeKey(r.ingredients)));
export const isRestoringPotion = (item) => RESTORING_KEYS.has(item?.potionRecipeKey ?? 0);

/** @type {{ allowed: () => boolean, used: () => void } | null} */
let _law = null;
export function registerSpirePotionLaw(law) { _law = law && typeof law.allowed === 'function' ? law : null; }
export function spirePotionRefusal(item) {
  if (madeRuleHere('potions') !== 'counted' || !_law || !isRestoringPotion(item)) return null;
  try { return _law.allowed() ? null : SPIRE_POTION_TEXT; } catch { return null; }
}
export function spirePotionDrunk(item) {
  if (madeRuleHere('potions') !== 'counted' || !_law || !isRestoringPotion(item)) return;
  try { _law.used(); } catch { }
}

let _footing = null;
export function registerSpireFooting(fn) { _footing = typeof fn === 'function' ? fn : null; }
export function spireFooting() {
  try { const v = Number(_footing?.() ?? 0); return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0; } catch { return 0; }
}

// `hw` and `tm` are relay-clock milliseconds; 0 means the hall has not woken or the tube is not reached yet.
let _wake = null;
export function registerSpireWake(fn) { _wake = typeof fn === 'function' ? fn : null; }
export function spireWake() {
  try {
    const w = _wake?.();
    return w && Number.isFinite(w.h) && Number.isFinite(w.hw) ? { h: w.h, hw: w.hw, tm: Number.isFinite(w.tm) && w.tm > 0 ? w.tm : 0 } : { h: 0, hw: 0, tm: 0 };
  } catch { return { h: 0, hw: 0, tm: 0 }; }
}

/** @type {(() => { h: number, objs: { t: string, i: number, x: number, z: number, st: number, stAt: number, pt: number }[], lit?: { s: any[], from: number, until: number }[], br?: { g: number, from: number, until: number }[], orr?: number[] | null }) | null} */
let _objs = null;
export function registerSpireObjs(fn) { _objs = typeof fn === 'function' ? fn : null; }
export function spireObjs() {
  if (!_objs) return { h: 0, objs: [] };
  try { const r = _objs(); return r && Array.isArray(r.objs) ? r : { h: 0, objs: [] }; } catch { return { h: 0, objs: [] }; }
}
/** @type {((key: string) => boolean) | null} */
let _act = null;
// Keys are `egstone:<h>:<i>:<f|b>` and `egengine:<h>:<i>`, matching the parsers in `egSpan.js`.
export function registerSpireAct(fn) { _act = typeof fn === 'function' ? fn : null; }
export function spireAct(key) {
  if (!_act) return false;
  try { return !!_act(key); } catch { return false; }
}
