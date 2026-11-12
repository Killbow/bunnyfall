// @ts-check
// BUNNYFALL PROVISIONING (docs/PROVISIONING.md): THE POT AND THE CAULDRON - the law the service decides by and every page
// shows by. Pure: no DOM, no service. A make is a set of ingredients (and, in the cauldron, one base); every ingredient
// carries two or three traits; the result keeps each trait at least two of them share. Strength grows with the rank.
//
// Cooking traits are buffs the game already lays on (the dishes' frame, systems/cookItems.js); alchemy traits ARE the
// twenty classic potions (systems/potionRecipes.js), so a trait drinks as its classic potion at the make's strength.

import { FOOD_KEYS, INGREDIENT_KEYS, keyTemplate, PLANT_GROUP_TEMPLATES, PANTRY_KEYS } from '../professionLaw.js';
import { POTION_RECIPES } from '../../systems/potionRecipes.js';

// ─── THE PANTRY: the new foods live in the material law (professionLaw.js PANTRY), so the Stores know them ───
export { PANTRY, PANTRY_KEYS, pantryOf, GROCER_STOCK } from '../professionLaw.js';

/** What the pot can prepare without a fire's craft: Flour of Grain, Cheese of Milk. */
export const PREPARES = Object.freeze([
  Object.freeze({ id: 'flour', out: 'food:flour', inputs: Object.freeze([Object.freeze({ key: 'food:grain', n: 1 })]) }),
  Object.freeze({ id: 'cheese', out: 'food:cheese', inputs: Object.freeze([Object.freeze({ key: 'food:milk', n: 2 })]) }),
]);

// ─── THE TRAITS ──────────────────────────────────────────────────────

/** Cooking's traits, each what a dish of it does. `stat` an attribute it raises; `resist` the classic potion it drinks as. */
export const FOOD_TRAITS = Object.freeze({
  hearty: Object.freeze({ name: 'Hearty', does: 'the dish lasts half again as long' }),
  refreshing: Object.freeze({ name: 'Refreshing', does: 'quenches thirst' }),
  fortifying: Object.freeze({ name: 'Fortifying', does: '+ Endurance', stat: 'endurance' }),
  mighty: Object.freeze({ name: 'Mighty', does: '+ Strength', stat: 'strength' }),
  swift: Object.freeze({ name: 'Swift', does: '+ Agility', stat: 'agility' }),
  clear: Object.freeze({ name: 'Clear', does: '+ Willpower', stat: 'willpower' }),
  keen: Object.freeze({ name: 'Keen', does: '+ Intelligence', stat: 'intelligence' }),
  charming: Object.freeze({ name: 'Charming', does: '+ Personality', stat: 'personality' }),
  lucky: Object.freeze({ name: 'Lucky', does: '+ Luck', stat: 'luck' }),
  restful: Object.freeze({ name: 'Restful', does: 'stamina lasts longer' }),
  warming: Object.freeze({ name: 'Warming', does: 'resist frost', resist: 'resistFrost' }),
  cooling: Object.freeze({ name: 'Cooling', does: 'resist fire', resist: 'resistFire' }),
});
/** Alchemy's traits: the twenty classic potions, by their id, named as the game names them. */
export const ALCHEMY_TRAITS = Object.freeze(Object.fromEntries(POTION_RECIPES.map((p) => [p.name, Object.freeze({ name: p.displayName ?? p.name, recipe: p })])));
export const traitName = (/** @type {string} */ t) => /** @type {any} */ (FOOD_TRAITS)[t]?.name ?? /** @type {any} */ (ALCHEMY_TRAITS)[t]?.name ?? t;

// ─── THE INGREDIENTS' TRAITS ─────────────────────────────────────────

/** The foods' traits, first the one everyone knows. */
const FOOD_OF = Object.freeze({
  'food:apple': ['refreshing', 'swift'], 'food:orange': ['refreshing', 'keen'], 'food:mushroom': ['hearty', 'keen'],
  'food:egg': ['fortifying', 'restful'], 'food:meat': ['hearty', 'mighty'], 'food:fish': ['swift', 'clear'],
  'food:grain': ['hearty', 'restful'], 'food:flour': ['hearty', 'fortifying'], 'food:milk': ['refreshing', 'restful', 'fortifying'],
  'food:cheese': ['hearty', 'fortifying', 'clear'], 'food:honey': ['restful', 'charming', 'clear'], 'food:salt': ['warming', 'lucky'],
  'food:boar': ['hearty', 'mighty', 'warming'], 'food:bear': ['mighty', 'fortifying', 'warming'], 'food:crab': ['swift', 'cooling'],
  'reagent:pure-water': ['refreshing'], 'reagent:rain-water': ['refreshing'],
});
/** A plant in the pot is a herb or a spice: one kitchen trait, by its DFU template. */
const HERB_OF = Object.freeze({
  8: 'warming', 9: 'refreshing', 10: 'mighty', 11: 'clear', 12: 'fortifying', 13: 'hearty', 14: 'warming', 15: 'swift',
  16: 'mighty', 17: 'restful', 18: 'restful', 19: 'charming', 20: 'clear', 21: 'keen', 22: 'cooling', 23: 'fortifying',
  24: 'restful', 25: 'lucky', 26: 'keen', 27: 'keen', 28: 'swift', 29: 'cooling', 30: 'cooling', 31: 'hearty', 32: 'refreshing',
});
const PLANT_RE = /^p[12]:\d+$/;

/** The cauldron's bases, each its key, words and the share it adds to the strength. */
export const BASES = Object.freeze([
  Object.freeze({ key: 'reagent:rain-water', name: 'Rain Water', words: 'weak', pct: 0 }),
  Object.freeze({ key: 'reagent:pure-water', name: 'Pure Water', words: 'steady', pct: 5 }),
  Object.freeze({ key: 'reagent:nectar', name: 'Nectar', words: 'good', pct: 10 }),
  Object.freeze({ key: 'reagent:ichor', name: 'Ichor', words: 'strong', pct: 20 }),
  Object.freeze({ key: 'reagent:elixir-vitae', name: 'Elixir Vitae', words: 'the strongest', pct: 30 }),
]);
export const baseOf = (/** @type {unknown} */ key) => BASES.find((b) => b.key === key) ?? null;
const BASE_TEMPLATES = new Set(BASES.map((b) => keyTemplate(b.key)));

// Alchemy: an ingredient carries the potions it is in (up to three); a potion with fewer than two such ingredients gives
// its trait to the ingredients with the fewest, so every classic potion can be found; a one-trait ingredient takes a
// second by a fixed turn of the list. Derived once, the same everywhere.
const hash = (/** @type {string} */ s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const ALCH_OF = (() => {
  /** @type {Map<string, string[]>} */
  const out = new Map();
  const keys = INGREDIENT_KEYS.filter((k) => !BASE_TEMPLATES.has(keyTemplate(k)));
  for (const k of keys) out.set(k, []);
  const byTemplate = (/** @type {number} */ t) => keys.filter((k) => keyTemplate(k) === t);
  for (const p of POTION_RECIPES) {
    const holders = [...new Set(p.ingredients.filter((t) => !BASE_TEMPLATES.has(t)).flatMap(byTemplate))];
    for (const k of holders) { const l = /** @type {string[]} */ (out.get(k)); if (l.length < 3 && !l.includes(p.name)) l.push(p.name); }
    // counted by plant, not by land: a northern and a southern Red Flowers are one holder
    const holderOf = (/** @type {string} */ k) => (PLANT_RE.test(k) ? `plant:${keyTemplate(k)}` : k);
    const have = new Set([...out.entries()].filter(([, l]) => l.includes(p.name)).map(([k]) => holderOf(k))).size;
    if (have < 2) {
      const taken = new Set([...out.entries()].filter(([, l]) => l.includes(p.name)).map(([k]) => holderOf(k)));
      const spare = [...out.entries()].filter(([k, l]) => !l.includes(p.name) && l.length < 3 && !taken.has(holderOf(k)))
        .sort((a, b) => a[1].length - b[1].length || hash(a[0] + p.name) - hash(b[0] + p.name));
      for (const [k] of spare) {
        if (taken.size >= 2) break;
        const h = holderOf(k);
        if (taken.has(h)) continue;
        taken.add(h);
        for (const [k2, l2] of out) if (holderOf(k2) === h && !l2.includes(p.name)) l2.push(p.name);   // both lands' plant alike
      }
    }
  }
  const names = POTION_RECIPES.map((p) => p.name);
  for (const [k, l] of out) {
    while (l.length < 2) { const t = names[hash(k + l.length) % names.length]; if (!l.includes(t)) l.push(t); else l.push(names[(names.indexOf(t) + 1) % names.length]); }
  }
  // a plant is one plant in either land: its northern and southern rows carry the same traits (the northern's first)
  for (const [k, l] of out) {
    if (!k.startsWith('p1:')) continue;
    const twin = out.get(`p2:${k.slice(3)}`);
    if (!twin) continue;
    const both = [...new Set([...l, ...twin])].slice(0, 3);
    l.splice(0, l.length, ...both);
    twin.splice(0, twin.length, ...both);
  }
  return out;
})();

/** Whether a key may go in the pot (food, a herb, a water) or the cauldron (an ingredient that is no base). */
export const potOk = (/** @type {unknown} */ k) => typeof k === 'string' && (k in FOOD_OF || (PLANT_RE.test(k) && HERB_OF[/** @type {any} */ (keyTemplate(k))] != null));
export const cauldronOk = (/** @type {unknown} */ k) => typeof k === 'string' && ALCH_OF.has(k);
/** An ingredient's traits in the pot or the cauldron, the first the one everyone knows. */
export function traitsOf(/** @type {string} */ key, /** @type {'pot'|'cauldron'} */ kind) {
  if (kind === 'cauldron') return ALCH_OF.get(key) ?? [];
  if (key in FOOD_OF) return /** @type {any} */ (FOOD_OF)[key];
  if (PLANT_RE.test(key)) { const t = /** @type {any} */ (HERB_OF)[/** @type {any} */ (keyTemplate(key))]; return t ? [t] : []; }
  return [];
}
/** Every key the pot and the cauldron take - the pages' lists. */
export const POT_KEYS = Object.freeze([...FOOD_KEYS, ...PANTRY_KEYS, 'reagent:pure-water', 'reagent:rain-water', ...['p1', 'p2'].flatMap((g) => /** @type {any} */ (PLANT_GROUP_TEMPLATES)[g].map((t) => `${g}:${t}`))].filter(potOk));
export const CAULDRON_KEYS = Object.freeze([...ALCH_OF.keys()]);
/** A trait a character knows of a key: the first always; the rest once learnt (`learnt` a Set of `key|trait`). */
export const traitKnown = (/** @type {string} */ key, /** @type {string} */ trait, /** @type {'pot'|'cauldron'} */ kind, /** @type {Set<string>} */ learnt) => traitsOf(key, kind)[0] === trait || learnt.has(`${kind}|${key}|${trait}`);

// ─── A MAKE ──────────────────────────────────────────────────────────

/** How many ingredients a pot or cauldron takes at a rank: 2, 3 from 40, 4 from 75. */
export const slotsAt = (/** @type {number} */ rank) => (rank >= 75 ? 4 : rank >= 40 ? 3 : 2);
export const PROV_RANK_FEAST = 75;
/** How the strength is shared between traits: two at full, three at 80%, four or more at 65%. */
export const shareOf = (/** @type {number} */ n) => (n <= 2 ? 1 : n === 3 ? 0.8 : 0.65);

/**
 * A MAKE, decided: `{ kind: 'pot'|'cauldron', keys, base? }` at `rank`, `simmer` 0..1 (The Simmer's share), `feast` true
 * where it is laid on a Company hall's table. Answers `{ ok, traits, name, ... }` or `{ ok: false, error }`.
 */
export function provPlan(/** @type {any} */ ask, /** @type {number} */ rank, /** @type {number} */ simmer = 0, /** @type {boolean} */ feast = false) {
  const kind = ask?.kind === 'cauldron' ? 'cauldron' : ask?.kind === 'pot' ? 'pot' : null;
  if (!kind) return { ok: false, error: 'prov-kind' };
  const keys = Array.isArray(ask.keys) ? ask.keys : [];
  if (keys.length < 2 || keys.length > slotsAt(rank)) return { ok: false, error: 'prov-count' };
  // one of each: a plant is one ingredient whichever land it grew in (northern and southern Red Flowers are Red Flowers)
  if (new Set(keys.map((/** @type {unknown} */ k) => (typeof k === 'string' && PLANT_RE.test(k) ? `plant:${keyTemplate(k)}` : k))).size !== keys.length) return { ok: false, error: 'prov-twice' };
  if (!keys.every(kind === 'pot' ? potOk : cauldronOk)) return { ok: false, error: 'prov-key' };
  const base = kind === 'cauldron' ? baseOf(ask.base) : null;
  if (kind === 'cauldron' && !base) return { ok: false, error: 'prov-base' };
  /** @type {Map<string, number>} */
  const count = new Map();
  for (const k of keys) for (const t of traitsOf(k, kind)) count.set(t, (count.get(t) ?? 0) + 1);
  const traits = [...count].filter(([, n]) => n >= 2).map(([t]) => t).sort();
  if (kind === 'cauldron' && !traits.length) return { ok: false, error: 'prov-nothing' };
  const s = Math.max(0, Math.min(1, Number(simmer) || 0));
  const share = shareOf(traits.length);
  const drink = kind === 'pot' && keys.some((k) => k === 'reagent:pure-water' || k === 'reagent:rain-water');
  const party = kind === 'pot' && feast === true && keys.length >= 4 && rank >= PROV_RANK_FEAST;
  const out = { ok: true, kind, keys: [...keys].sort(), base: base?.key ?? null, traits, share, drink, party, rank, simmer: s };
  if (kind === 'cauldron') {
    // a classic potion's strength grows past the shop's with the rank: the shop's at rank 0, +60% at 100, the base's and
    // The Simmer's on top - shared between the traits
    const potent = Math.round((100 + 0.6 * rank + /** @type {any} */ (base).pct + 25 * s) * share - 100);
    return { ...out, potent, count: rank >= 50 ? 2 : 1, name: potionName(traits) };
  }
  // a dish's strength grows with the rank: +4 to a stat at rank 0, +15 at 100, The Simmer a quarter on top
  const strength = (0.4 + 0.011 * rank) * (1 + 0.25 * s) * share;
  const minutes = Math.round((90 + 1.5 * rank) * (traits.includes('hearty') ? 1.5 : 1) * (party ? 4 : 1));
  return { ...out, strength, magnitude: Math.max(1, Math.round(10 * strength)), resistPct: Math.round(100 * strength) - 100, minutes, count: rank >= 50 ? 3 : 2, name: dishName(keys, traits, drink, party) };
}

/** A potion's name from its traits: "Potion of Resist Fire and Healing". */
export function potionName(/** @type {string[]} */ traits) {
  const n = traits.map(traitName);
  return `Potion of ${n.length <= 1 ? n[0] ?? 'Nothing' : `${n.slice(0, -1).join(', ')} and ${n.at(-1)}`}`;
}
/** A dish's name: its traits' words before what it is - "Warming Hearty Stew", "Clear Mead", "Feast". */
export function dishName(/** @type {string[]} */ keys, /** @type {string[]} */ traits, drink = false, party = false) {
  const has = (/** @type {string} */ k) => keys.includes(k);
  const noun = party ? 'Feast'
    : drink ? (has('food:grain') ? 'Ale' : has('food:honey') ? 'Mead' : keys.some((k) => k === 'food:apple' || k === 'food:orange') ? 'Cider' : keys.some((k) => PLANT_RE.test(k)) ? 'Tea' : 'Broth')
      : keys.some((k) => ['food:meat', 'food:boar', 'food:bear'].includes(k)) ? 'Stew'
        : keys.some((k) => ['food:fish', 'food:crab'].includes(k)) ? 'Supper'
          : has('food:flour') ? (has('food:honey') || has('food:apple') ? 'Tart' : 'Bread')
            : has('food:cheese') || has('food:egg') ? 'Pie' : 'Pottage';
  const words = traits.slice(0, 2).map(traitName);
  return [...words, noun].join(' ');
}
/** The dish template a make borrows its picture from: a stew's, a supper's, a tart's, a feast's (recipeLaw DISHES). */
export const dishTemplateOf = (/** @type {any} */ plan) => (plan.party ? 688 : plan.name.endsWith('Supper') ? 686 : /Tart|Bread|Pie|Mead|Ale|Cider|Tea/.test(plan.name) ? 687 : 685);

/** A make's XP, before the pace (professionLaw CRAFT_PACE's Provisioning) and the stars: its ingredients, its traits, the rank. */
export const provXp = (/** @type {any} */ plan) => Math.round((20 + 15 * plan.keys.length + 20 * plan.traits.length) * (1 + plan.rank / 100));
/** A make's signature in the book: its kind, its base, its ingredients in order. */
export const provSig = (/** @type {any} */ plan) => `${plan.kind}|${plan.base ?? ''}|${plan.keys.join(',')}`;
