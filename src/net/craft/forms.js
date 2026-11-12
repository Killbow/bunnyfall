// @ts-check
// CRAFTING REWORK, PHASE 1 (docs/CRAFTING.md): THE FORMS. DRAFT DATA FOR REVIEW; NOTHING READS IT YET.
//
// A FORM is one DFU item a player can make (a dagger, a cuirass, a ring), with the SLOTS its materials go into. The old
// law has one recipe for every item x material (1,202 of them); a form is the item once, and the material is a choice
// made at the bench.
//
// WHILE THE OLD RECIPES EXIST the forms are derived from them (recipeLaw.js RECIPES, grouped by product), so the table
// is one form for every item the old law can make and no more. Slot by slot:
//   - the first input is the PRIMARY slot: its material picks the DFU material of the piece (so combat numbers stay DFU's
//     and old items stay valid);
//   - an input that takes more than one material across the old recipes is a SECONDARY slot with those options;
//   - an input that never changed in the old recipes (a flux, a grip, a haft, a resin) is OPENED into a secondary slot
//     with the choices of its GROUP (below) wherever the materials have stats;
//   - what has no stats (a herb, a food, a mortar, a hide) stays FIXED;
//   - an input only some recipes have (a gem set in a ring) is OPTIONAL.
// In Phase 5, when recipeLaw.js goes, this file is frozen into literal data.
//
// Each family reads the four material stats (materialStats.js) with its own weights, which add up to 1.
import { RECIPES, takesHeartwood } from '../recipeLaw.js';
import { trackOf, HEARTWOOD } from '../professionLaw.js';
import { MATERIAL_STATS, statsOf, suitabilityOf } from './materialStats.js';

/** @typedef {import('./materialStats.js').StatWeights} StatWeights */

/**
 * What each family wants of its materials, h t l a (Hardness, Toughness, Lightness, Arcanism: how readily a material takes and holds magic). A dish has none: cooking
 * and alchemy are Phase 4.
 * @type {Readonly<Record<string, Readonly<StatWeights> | null>>}
 */
export const FAMILY_WEIGHTS = Object.freeze({
  weapons: Object.freeze({ h: 0.5, t: 0.3, l: 0.15, a: 0.05 }),
  armour: Object.freeze({ h: 0.25, t: 0.5, l: 0.2, a: 0.05 }),
  tools: Object.freeze({ h: 0.3, t: 0.6, l: 0.1, a: 0 }),
  kits: Object.freeze({ h: 0.1, t: 0.7, l: 0.1, a: 0.1 }),
  staves: Object.freeze({ h: 0, t: 0.2, l: 0.2, a: 0.6 }),
  bows: Object.freeze({ h: 0.1, t: 0.25, l: 0.5, a: 0.15 }),
  arrows: Object.freeze({ h: 0.4, t: 0.1, l: 0.5, a: 0 }),
  siege: Object.freeze({ h: 0.3, t: 0.5, l: 0, a: 0.2 }),
  furniture: Object.freeze({ h: 0.2, t: 0.5, l: 0, a: 0.3 }),
  furnishings: Object.freeze({ h: 0, t: 0.4, l: 0.2, a: 0.4 }),
  stonework: Object.freeze({ h: 0.3, t: 0.5, l: 0, a: 0.2 }),
  leather: Object.freeze({ h: 0.2, t: 0.5, l: 0.3, a: 0 }),
  clothing: Object.freeze({ h: 0, t: 0.25, l: 0.35, a: 0.4 }),
  jewellery: Object.freeze({ h: 0.05, t: 0.15, l: 0.1, a: 0.7 }),
  dishes: null,
});

/**
 * THE GROUPS an opened slot chooses from. An input the old recipes always made of one material (tin, copper, a cured
 * leather grip, an oak haft, a resin) becomes a choice among its group's materials.
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const GROUPS = Object.freeze({
  flux: Object.freeze(MATERIAL_STATS.filter((s) => s.kind === 'flux').map((s) => s.key)),
  wrap: Object.freeze(MATERIAL_STATS.filter((s) => s.kind === 'leather' || s.kind === 'cloth').map((s) => s.key)),
  haft: Object.freeze(MATERIAL_STATS.filter((s) => s.kind === 'plank').map((s) => s.key)),
  binder: Object.freeze(['wood:resin', 'cloth:linen', 'leather:cured']),
  head: Object.freeze(MATERIAL_STATS.filter((s) => s.kind === 'ingot').map((s) => s.key)),
});

/** The group each input the old recipes always made of one material belongs to. */
const FIXED_KEY_GROUP = Object.freeze({
  'metal:tin': 'flux', 'metal:copper': 'flux',
  'leather:cured': 'wrap', 'cloth:linen': 'wrap',
  'plank:oak': 'haft', 'plank:pine': 'haft',
  'wood:resin': 'binder',
  'ingot:iron': 'head',
});

/** What a player calls an opened slot, by its group and the family it is in. */
function labelOf(group, family) {
  if (group === 'flux') return 'Flux';
  if (group === 'haft') return 'Haft';
  if (group === 'binder') return 'Binder';
  if (group === 'head') return family === 'arrows' ? 'Arrowhead' : 'Fittings';
  if (family === 'weapons') return 'Grip';
  if (family === 'armour' || family === 'leather') return 'Lining';
  if (family === 'clothing') return 'Straps';
  return 'Wrap';
}

/** The material key's family of material ('ingot:iron' 'ingot', 'p1:8' 'herb'). */
export function categoryOf(/** @type {string} */ key) {
  const head = String(key).split(':')[0];
  return head === 'p1' || head === 'p2' ? 'herb' : head;
}

/**
 * The share of the SUITABILITY a secondary slot has; the primary slot has the rest. A sword with a grip and a flux is
 * 80% blade, 10% grip and 10% flux.
 */
export const SECONDARY_SHARE = 0.1;

/**
 * @typedef {{ id: string, label: string, role: 'primary'|'secondary'|'fixed', group: string|null, categories: string[],
 *   options: string[], defaultKey: string, n: number, nMax: number, optional: boolean, share: number }} Slot
 * @typedef {{ id: string, name: string, discipline: string, track: string, family: string, kind: string,
 *   templateIndex: number, tierMin: number, tierMax: number, rankMin: number, rankMax: number, recipes: number,
 *   slots: Slot[], weights: Readonly<StatWeights> | null }} Form
 */

/** @param {any[]} rs the old recipes of one product @returns {Slot[]} */
function slotsOf(rs) {
  const cheapest = [...rs].sort((a, b) => a.tier - b.tier || a.rank - b.rank)[0];
  const width = Math.max(...rs.map((r) => r.inputs.length));
  const family = rs[0].family;
  /** @type {Slot[]} */
  const slots = [];
  for (let i = 0; i < width; i++) {
    const have = rs.filter((r) => r.inputs[i]);
    const keys = [...new Set(have.map((r) => r.inputs[i].key))];
    const counts = have.map((r) => r.inputs[i].n);
    const first = cheapest.inputs[i]?.key ?? keys[0];
    const group = i > 0 && keys.length === 1 ? FIXED_KEY_GROUP[keys[0]] ?? null : null;
    const options = group ? [...GROUPS[group]] : keys;
    slots.push({
      id: `${categoryOf(first)}${i}`,
      label: group ? labelOf(group, family) : i === 0 ? 'Main' : categoryOf(first),
      role: i === 0 ? 'primary' : group || keys.length > 1 ? 'secondary' : 'fixed',
      group,
      categories: [...new Set(options.map(categoryOf))],
      options,
      defaultKey: group ? keys[0] : options[0],   // what the old recipes always used there (a fixed or an opened slot's)
      n: Math.min(...counts),
      nMax: Math.max(...counts),
      optional: have.length < rs.length,
      share: 0,
    });
  }
  // The suitability shares: every slot whose materials all have stats counts, a gem (Arcanism only) does not.
  const counts = (/** @type {Slot} */ s) => !s.optional && s.categories.every((c) => c !== 'gem') && s.options.every((k) => statsOf(k));
  const secondaries = slots.filter((s, i) => i > 0 && counts(s));
  if (counts(slots[0])) {
    for (const s of secondaries) s.share = SECONDARY_SHARE;
    slots[0].share = 1 - SECONDARY_SHARE * secondaries.length;
  }
  // BUNNYFALL CRAFTING REWORK: HEARTWOOD - where a piece takes planks (recipeLaw takesHeartwood), a Heartwood may stand in
  // for one of them. It is an extra pick, never a recipe of its own: it counts through its stats alone, blended into the
  // wood part it stands in for (one plank in that part's count), and spends one plank fewer.
  const woodSlot = slots.find((s) => s.options.some((k) => k.startsWith('plank:')));
  if (woodSlot && rs.some((r) => takesHeartwood(r))) {
    slots.push({
      id: 'heartwood', label: `Heartwood (for one ${woodSlot.label === 'Main' ? 'plank' : woodSlot.label.toLowerCase()})`, role: 'extra', group: null,
      categories: ['wood'], options: [HEARTWOOD.key], defaultKey: HEARTWOOD.key, n: 1, nMax: 1, optional: true, share: 0, extra: true, standsIn: woodSlot.id,
    });
  }
  return slots;
}

/**
 * The materials a slot is made of, each with its part of the slot: one material, or (HEARTWOOD) the planks and the one
 * Heartwood standing in among them.
 * @returns {[any, number][]}
 */
export function slotMix(/** @type {Form} */ form, /** @type {Record<string, string>} */ picks, /** @type {Slot} */ slot) {
  const s = statsOf(picks[slot.id]);
  if (!s) return [];
  const heart = picks.heartwood ? form.slots.find((x) => x.id === 'heartwood') : null;
  if (!heart || heart.standsIn !== slot.id) return [[s, 1]];
  const n = Math.max(1, slot.n);
  return n === 1 ? [[statsOf(HEARTWOOD.key), 1]] : [[s, (n - 1) / n], [statsOf(HEARTWOOD.key), 1 / n]];
}

/** @returns {Form[]} */
function build() {
  /** @type {Map<string, any[]>} */
  const byProduct = new Map();
  for (const r of RECIPES) {
    const id = r.product ?? r.id;
    const list = byProduct.get(id);
    if (list) list.push(r); else byProduct.set(id, [r]);
  }
  return [...byProduct.entries()].map(([id, rs]) => {
    const r = rs[0];
    return {
      id,
      name: r.kind === 'garment' ? `${r.pattern ?? r.name} (${r.group === 'WomensClothing' ? "women's" : "men's"})` : r.pattern ?? r.name,   // BUNNYFALL: DFU's two clothing sets, told apart
      discipline: r.profession,
      track: trackOf(r.profession),
      family: r.family,
      kind: r.kind,
      templateIndex: r.templateIndex,
      tierMin: Math.min(...rs.map((x) => x.tier)),
      tierMax: Math.max(...rs.map((x) => x.tier)),
      rankMin: Math.min(...rs.map((x) => x.rank)),
      rankMax: Math.max(...rs.map((x) => x.rank)),
      recipes: rs.length,
      slots: slotsOf(rs),
      weights: FAMILY_WEIGHTS[r.family] ?? null,
    };
  });
}

/** Every form, in the old recipes' order. */
export const FORMS = Object.freeze(build());

/** @type {ReadonlyMap<string, Form>} */
const BY_ID = new Map(FORMS.map((f) => [f.id, f]));

/** A form by its id (the old product id: 'dagger', 'cuirass', 'ring'), or null. */
export const formById = (id) => (typeof id === 'string' ? BY_ID.get(id) ?? null : null);

/**
 * HOW WELL A BUILD SUITS ITS FORM, 0 to 1, or null where the form has no stats yet (a dish) or a pick is not one of the
 * slot's options. `picks` maps a slot id to a material key. Each slot's suitability counts by its share; the primary
 * slot's material also picks the DFU material.
 */
export function buildSuitability(/** @type {Form} */ form, /** @type {Record<string, string>} */ picks) {
  if (!form.weights) return null;
  let sum = 0, share = 0;
  for (const slot of form.slots) {
    if (!slot.share) continue;
    const key = picks[slot.id];
    const s = statsOf(key);
    if (!s || !slot.options.includes(key)) return null;
    sum += slot.share * slotMix(form, picks, slot).reduce((a, [m, part]) => a + part * suitabilityOf(m, form.weights), 0);   // HEARTWOOD: blended in
    share += slot.share;
  }
  return share > 0 ? sum / share : null;
}

/**
 * POTENTIAL: the quality ceiling a suitability allows, as the five quality names' indexes (0 Crude to 4 Masterwork,
 * recipeLaw.js QUALITY_NAMES). The bands are a DRAFT, set so a well-suited build of any tier reaches the top and a badly
 * suited one does not; they are the thing to tune after the stats.
 */
export const POTENTIAL_BANDS = Object.freeze([
  Object.freeze({ from: 0.88, quality: 4, name: 'Masterwork' }),
  Object.freeze({ from: 0.78, quality: 3, name: 'Superior' }),
  Object.freeze({ from: 0.64, quality: 2, name: 'Fine' }),
  Object.freeze({ from: 0.48, quality: 1, name: 'Standard' }),
  Object.freeze({ from: 0, quality: 0, name: 'Crude' }),
]);

/** The Potential band a suitability falls in. */
export const potentialOf = (/** @type {number} */ suitability) => POTENTIAL_BANDS.find((b) => suitability >= b.from) ?? POTENTIAL_BANDS[POTENTIAL_BANDS.length - 1];
