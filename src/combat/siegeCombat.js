// @ts-check
import { SIEGE_HIT, SIEGE_CASTS } from '../net/siegeRef.js';
import { duelSpellOf } from './duelCombat.js';
import { applySpell } from '../magic/effects.js';

export const siegeBlowKind = (by) => (by === 'arrow' ? SIEGE_HIT.Shaft : SIEGE_HIT.Melee);
// Clamps to the referee's caps so the wire never refuses the frame.
export const siegeCastClamp = (n, heal = false) => Math.min(Math.max(0, Math.round(Number(n) || 0)), heal ? SIEGE_CASTS.healMax : SIEGE_CASTS.damageMax);
// Classic effect types: 43 is Teleport (Recall is its second half) and 14 is Levitate.
export const SIEGE_BARRED_EFFECTS = Object.freeze([43, 14]);
export const siegeSpellBarred = (sp) => (Array.isArray(sp?.effects) ? sp.effects : []).some((e) => e && SIEGE_BARRED_EFFECTS.includes(e.type));
export const SIEGE_SPELL_BARRED_TEXT = 'Teleport, Recall and Levitate do nothing on a battlefield.';
export const SIEGE_DISMOUNT_TEXT = "You can't ride a horse on a battlefield.";

/**
 * @param {any} sp
 * @param {number} level
 * @param {any} standIn
 * @param {any} [caster]
 * @param {{ apply?: Function, rolls?: () => number }} [o]
 */
export function siegeSpellNumbers(sp, level, standIn, caster = null, { apply = applySpell, rolls = Math.random } = {}) {
  let harm = 0, heal = 0;
  const none = () => {};
  const count = (into) => (n) => { const v = Number(n); if (v > 0) { if (into === 'harm') harm += v; else heal += v; } };
  const run = (spell, sinks) => {
    try { apply(spell, level, standIn, sinks, rolls, caster ? { entity: caster } : null); } catch { return false; } finally { if (standIn) standIn.activeEffects = []; }
    return true;
  };
  const harmful = duelSpellOf(sp);
  if (harmful && !run(harmful, { hurt: count('harm'), heal: none, drainFatigue: none, restoreFatigue: none, drainMagicka: none, restoreMagicka: none })) harm = 0;
  // Heal Health lands as a self-cast (rangeType 0), so no save is rolled.
  const healing = (Array.isArray(sp?.effects) ? sp.effects : []).filter((e) => e && e.type === 10 && e.subType === 8);
  if (healing.length && !run({ ...sp, rangeType: 0, effects: healing }, { hurt: none, heal: count('heal'), drainFatigue: none, restoreFatigue: none, drainMagicka: none, restoreMagicka: none })) heal = 0;
  return { harm: Math.round(harm), heal: Math.round(heal) };
}
