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
import { formById, buildSuitability, potentialOf, slotMix } from './forms.js';
import { statsOf, statBudget, STAT_IDS } from './materialStats.js';   // the materials' effects on the piece

/** @typedef {import('./forms.js').Form} Form */
/** @typedef {{ ok: true, form: Form, legacy: any, picks: Record<string, string> }} Plan */

// ─── THE FOCUS ───────────────────────────────────────────────────────

/** How many crafts a character can pledge as Focus. */
export const FOCUS_MAX = 2;
/** What dropping a Focus craft costs, in silver (Marks). Pledging into a free place costs nothing. */
export const FOCUS_CHANGE_MARKS = 100;
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
const legacyKey = (/** @type {Form} */ form, /** @type {(i: number) => string} */ at) => `${form.id}|${form.slots.map((s, i) => (s.group || s.extra ? '' : at(i))).join('|')}`;   // HEARTWOOD: an extra pick names no recipe

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
      if (slot.extra) continue;   // HEARTWOOD: an extra left alone is none
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
  let inputs = recipeInputs(legacy, { joiner, cracked, heartwood: !!picks.heartwood });   // HEARTWOOD: one plank fewer, the Heartwood spent
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
/**
 * The odds of each quality (Crude to Masterwork, percent) a craft by plan is made at - the same roll, steps and cap
 * craftedQuality takes, so the card shows what the server rolls. `halls` the Company halls' steps where they are known.
 */
export function craftOdds(/** @type {Plan} */ plan, { rank, clean = false, spec50 = null, spec100 = null, halls = 0, focus = false }) {
  const r = { ...plan.legacy, metal: null, leather: null };
  const base = qualityOdds(rank - r.rank, { masterwright: masterworkSpec(spec100, r) });
  const steps = qualitySteps(r, { clean, spec50, heartwood: false }) + halls;
  const cap = qualityCap(plan, focus);
  const out = [0, 0, 0, 0, 0];
  base.forEach((o, q) => { out[Math.min(craftQuality(q, steps), cap)] += o; });
  return out;
}
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


// ─── BUNNYFALL CRAFTING REWORK: WHAT THE MATERIALS DO TO THE PIECE ─────────────────────────────
//
// Each of the four stats moves one thing on the finished piece, by at most CRAFT_SWING percent either way:
//   Hardness  a weapon's damage, a piece of armour's armour
//   Toughness its condition
//   Lightness its weight (a light material makes it lighter)
//   Arcanism  its enchantment power
// A material is measured against the average of its own tier (statBudget / 4), so a strongly skewed material is good at
// one thing and poor at another whatever its tier. The slots count by their suitability shares. The service rolls where
// in the range a piece lands; INSPIRATION - the true strikes of The Work - pushes that roll to the top of its range.

/** The most a stat moves the piece, in percent. */
export const CRAFT_SWING = 20;
/** The kinds a piece's material effects are made for: what has damage, armour, condition, weight or power to move. */
export const MOD_KINDS = Object.freeze(['weapon', 'staff', 'bow', 'plate', 'chain', 'shield', 'leather', 'garment', 'jewel']);

/** A plan's lean, stat by stat, -1 to 1: the chosen materials against their tiers' average, by their slots' shares. */
export function leanOfPlan(/** @type {Plan} */ plan) {
  const out = { h: 0, t: 0, l: 0, a: 0 };
  let total = 0;
  for (const slot of plan.form.slots) {
    const key = plan.picks[slot.id];
    const s = statsOf(key);
    if (!s || !(slot.share > 0)) continue;
    for (const [m, part] of slotMix(plan.form, plan.picks, slot)) {   // HEARTWOOD: blended into its part
      const avg = statBudget(m.tier) / 4;
      for (const k of STAT_IDS) out[k] += slot.share * part * Math.max(-1, Math.min(1, (m[k] - avg) / avg));
    }
    total += slot.share;
  }
  if (total > 0) for (const k of STAT_IDS) out[k] /= total;
  return out;
}
/** How inspired a work was, 0 to 1: its true strikes over the strikes it took (two a part). */
export const inspirationOf = (/** @type {number} */ trues, /** @type {number} */ parts) => (parts > 0 && Number.isFinite(trues) ? Math.max(0, Math.min(1, trues / (parts * 2))) : 0);
/** The parts The Work has for a plan: its chosen, non-fixed slots (ui/professions/craftWindow.js workOptions). */
export const workPartsOf = (/** @type {Plan} */ plan) => Math.max(1, plan.form.slots.filter((s) => s.role !== 'fixed' && plan.picks[s.id]).length);
/**
 * The piece's material effects, percent by stat (-CRAFT_SWING to CRAFT_SWING): `u` the service's roll (0 to 1),
 * `inspired` 0 to 1. A good lean lands between half and all of its swing, a poor one between all and half of its cost:
 * the roll and inspiration both push toward the better end.
 */
export function craftModsOf(/** @type {Plan} */ plan, /** @type {number} */ u, /** @type {number} */ inspired = 0) {
  const lean = leanOfPlan(plan);
  const roll = Math.max(0, Math.min(1, u)) + (1 - Math.max(0, Math.min(1, u))) * Math.max(0, Math.min(1, inspired));
  const out = { h: 0, t: 0, l: 0, a: 0 };
  for (const k of STAT_IDS) {
    const d = lean[k];
    out[k] = Math.round(CRAFT_SWING * d * (d >= 0 ? 0.5 + 0.5 * roll : 1 - 0.5 * roll));
  }
  return out;
}
/** The range each effect can land in for a plan, worst roll to best: what the card shows before the craft. */
export function craftModRange(/** @type {Plan} */ plan) {
  const lo = craftModsOf(plan, 0, 0), hi = craftModsOf(plan, 1, 0);
  return Object.fromEntries(STAT_IDS.map((k) => [k, [Math.min(lo[k], hi[k]), Math.max(lo[k], hi[k])]]));
}
