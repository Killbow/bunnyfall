// @ts-check
// CRAFTING REWORK, PHASE 2 (docs/CRAFTING.md): THE CRAFT LAW. PURE; BOTH ENDS READ IT.
//
// A craft now names a FORM and a PICK for each slot (forms.js). This module turns that into what the old law already
// understands, so the rest of the game keeps working:
//   - the primary pick (and the picks of the slots that varied in the old recipes, a ring's gem) select ONE OLD RECIPE, the
//     LEGACY RECIPE. Pieces are minted, signed and salvaged under its id, so old and new pieces are the same kind of thing;
//   - the opened slots (grip, lining, flux, haft, binder, arrowhead) replace the legacy recipe's fixed input with the
//     player's pick, so the Stores are charged what the player chose;
//   - POTENTIAL (suitability of the picks) caps the quality, and a craft that is not a FOCUS cannot reach Masterwork;
//   - the XP is the VALUE of what was spent, halved off Focus.
//
// All numbers here are drafts to tune (docs/CRAFTING.md). No clock, no DOM, no network.
import { RECIPES, recipeInputs, rollQuality, qualityOdds, qualitySteps, craftQuality, masterworkSpec } from '../recipeLaw.js';
import { materialOf, topTierOf } from '../professionLaw.js';
import { formById, buildSuitability, potentialOf } from './forms.js';

/** @typedef {import('./forms.js').Form} Form */
/** @typedef {{ ok: true, form: Form, legacy: any, picks: Record<string, string> }} Plan */

// ─── THE FOCUS ───────────────────────────────────────────────────────

/** How many crafts a character can pledge as Focus. */
export const FOCUS_MAX = 2;
/** A character may change its Focus once in this long (a week), and the first pledge is free of it. */
export const FOCUS_COOLDOWN_S = 7 * 86_400;
/** What a Focus craft's XP is multiplied by, and what any other craft's is. */
export const FOCUS_XP = Object.freeze({ focus: 1, other: 0.5 });
/** The highest quality a craft that is not a Focus can reach (Superior; Masterwork is Focus alone). */
export const NON_FOCUS_QUALITY_MAX = 3;

/** Whether a list of crafts is a lawful Focus: crafting tracks only, none twice, at most FOCUS_MAX. */
export function focusOk(/** @type {unknown} */ list, /** @type {readonly string[]} */ crafts) {
  return Array.isArray(list) && list.length <= FOCUS_MAX && new Set(list).size === list.length
    && list.every((c) => typeof c === 'string' && crafts.includes(c));
}

// ─── FORM AND PICKS TO THE LEGACY RECIPE ─────────────────────────────

/** The key an old recipe is found by: its product and the inputs of the slots that were not opened. */
const legacyKey = (/** @type {Form} */ form, /** @type {(i: number) => string} */ at) => `${form.id}|${form.slots.map((s, i) => (s.group ? '' : at(i))).join('|')}`;

/** @type {Map<string, any>} */
const LEGACY = new Map();
for (const r of RECIPES) {
  const form = formById(r.product ?? r.id);
  if (form) LEGACY.set(legacyKey(form, (i) => r.inputs[i]?.key ?? ''), r);
}

/**
 * RESOLVE A CRAFT ASKED BY FORM AND PICKS. `picks` maps a slot id to a material key. Every slot that takes a choice
 * must be picked, an opened slot may be left to its old default, an optional slot (a ring's gem) may be left out, and a
 * pick must be one of the slot's options. Refusals are short codes: `craft-form`, `craft-picks`, `craft-pick` (a slot or
 * material that is not one), `craft-missing` (a required slot unpicked), `craft-recipe` (no old recipe makes it) and
 * `craft-later` (a dish: Phase 4).
 * @returns {Plan | { ok: false, error: string, slot?: string }}
 */
export function planOf(/** @type {unknown} */ formId, /** @type {unknown} */ asked) {
  const form = formById(formId);
  if (!form) return { ok: false, error: 'craft-form' };
  if (form.kind === 'dish') return { ok: false, error: 'craft-later' };
  if (asked == null || typeof asked !== 'object' || Array.isArray(asked)) return { ok: false, error: 'craft-picks' };
  const given = /** @type {Record<string, unknown>} */ (asked);
  const known = new Set(form.slots.map((s) => s.id));
  for (const id of Object.keys(given)) if (!known.has(id)) return { ok: false, error: 'craft-pick', slot: id };
  /** @type {Record<string, string>} */
  const picks = {};
  for (const slot of form.slots) {
    const pick = given[slot.id];
    if (pick == null) {
      if (slot.group) picks[slot.id] = slot.defaultKey;   // an opened slot left alone is the old recipe's
      else if (slot.role === 'fixed') picks[slot.id] = slot.defaultKey;
      else if (!slot.optional) return { ok: false, error: 'craft-missing', slot: slot.id };
      continue;
    }
    if (typeof pick !== 'string' || !slot.options.includes(pick)) return { ok: false, error: 'craft-pick', slot: slot.id };
    picks[slot.id] = pick;
  }
  const legacy = LEGACY.get(legacyKey(form, (i) => picks[form.slots[i].id] ?? ''));
  if (!legacy) return { ok: false, error: 'craft-recipe' };
  return { ok: true, form, legacy, picks };
}

/**
 * What the Stores are charged: the legacy recipe's inputs (with a joiner's half planks and a Lapidary's cracked gem as
 * the old law has them), the opened slots' inputs replaced by the player's picks, the same material added together.
 * @returns {{ key: string, n: number }[]}
 */
export function inputsOf(/** @type {Plan} */ plan, { joiner = false, cracked = false } = {}) {
  const { form, legacy, picks } = plan;
  let inputs = recipeInputs(legacy, { joiner, cracked });
  form.slots.forEach((slot, i) => {
    const old = legacy.inputs[i]?.key;
    const pick = picks[slot.id];
    if (!slot.group || !old || !pick || pick === old) return;
    inputs = inputs.map((inp) => (inp.key === old ? { key: pick, n: inp.n } : inp));
  });
  /** @type {Map<string, number>} */
  const sum = new Map();
  for (const inp of inputs) sum.set(inp.key, (sum.get(inp.key) ?? 0) + inp.n);
  return [...sum].map(([key, n]) => ({ key, n }));
}

// ─── POTENTIAL AND QUALITY ───────────────────────────────────────────

/** The Potential a plan's picks allow: `{ suitability, quality, name }`, or null where the form has no stats (it is capped by nothing). */
export function potentialOfPlan(/** @type {Plan} */ plan) {
  const s = buildSuitability(plan.form, plan.picks);
  if (s == null) return null;
  const band = potentialOf(s);
  return { suitability: s, quality: band.quality, name: band.name };
}

/** The most a craft may be made at: its Potential, and Superior where the craft is not a Focus. */
export function qualityCap(/** @type {Plan} */ plan, /** @type {boolean} */ focus) {
  const potential = potentialOfPlan(plan)?.quality ?? 4;
  return focus ? potential : Math.min(potential, NON_FOCUS_QUALITY_MAX);
}

/**
 * THE QUALITY A CRAFT IS MADE AT: the Execution (the old roll on the rank's margin over the legacy recipe, then a step
 * each for a clean act, the craft's perk and a seat's halls) held under the cap. The old Warforged and Hardened Leather
 * steps are gone: those materials earn their place in Potential instead. `u` a die in [0, 1).
 */
export function craftedQuality(/** @type {Plan} */ plan, { u, rank, clean = false, spec50 = null, spec100 = null, halls = 0, focus = false }) {
  const r = { ...plan.legacy, metal: null, leather: null };   // no ingot's or leather's own step (qualitySteps)
  const rolled = rollQuality(u, qualityOdds(rank - r.rank, { masterwright: masterworkSpec(spec100, r) }));
  const execution = craftQuality(rolled, qualitySteps(r, { clean, spec50, heartwood: false }) + halls);
  return Math.min(execution, qualityCap(plan, focus));
}

// ─── XP ──────────────────────────────────────────────────────────────

/** A craft's XP is this per tier of its material plus the gold-value of what was spent (DRAFT numbers). */
export const XP_PER_TIER = 10;
export const XP_PER_VALUE = 1;

/** The value of a list of inputs, from the materials' own worth. */
export const inputsValue = (/** @type {{ key: string, n: number }[]} */ inputs) =>
  inputs.reduce((a, i) => a + (materialOf(i.key, () => 1)?.value ?? 0) * i.n, 0);

/**
 * A CRAFT'S XP: XP_PER_TIER x the material's tier plus the value spent, a quarter for work more than two tiers under
 * the rank's top (the old rule), halved off Focus. No first-make bonus: progress comes from what is made.
 */
export function craftValueXp(/** @type {Plan} */ plan, /** @type {{ key: string, n: number }[]} */ inputs, /** @type {number} */ rank, /** @type {boolean} */ focus) {
  const tier = plan.legacy.tier;
  let xp = XP_PER_TIER * tier + Math.round(inputsValue(inputs) * XP_PER_VALUE);
  if (tier < topTierOf(rank) - 2) xp = Math.floor(xp / 4);
  return focus ? xp : Math.ceil(xp * FOCUS_XP.other);
}

