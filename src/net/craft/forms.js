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
//   - an input that never changes (a flux, a resin, a herb) is a FIXED slot;
//   - an input only some recipes have (a gem set in a ring) is OPTIONAL.
// In Phase 5, when recipeLaw.js goes, this file is frozen into literal data.
//
// Each family reads the four material stats (materialStats.js) with its own weights, which add up to 1.
import { RECIPES } from '../recipeLaw.js';
import { trackOf } from '../professionLaw.js';

/** @typedef {import('./materialStats.js').StatWeights} StatWeights */

/**
 * What each family wants of its materials, h t l a (Hardness, Toughness, Lightness, Affinity). A dish has none: cooking
 * and alchemy are Phase 4.
 * @type {Readonly<Record<string, Readonly<StatWeights> | null>>}
 */
export const FAMILY_WEIGHTS = Object.freeze({
  weapons: Object.freeze({ h: 0.4, t: 0.3, l: 0.2, a: 0.1 }),
  armour: Object.freeze({ h: 0.3, t: 0.4, l: 0.2, a: 0.1 }),
  tools: Object.freeze({ h: 0.3, t: 0.5, l: 0.1, a: 0.1 }),
  kits: Object.freeze({ h: 0.1, t: 0.6, l: 0.1, a: 0.2 }),
  staves: Object.freeze({ h: 0.1, t: 0.3, l: 0.2, a: 0.4 }),
  bows: Object.freeze({ h: 0.2, t: 0.3, l: 0.3, a: 0.2 }),
  arrows: Object.freeze({ h: 0.4, t: 0.2, l: 0.4, a: 0 }),
  siege: Object.freeze({ h: 0.3, t: 0.5, l: 0, a: 0.2 }),
  furniture: Object.freeze({ h: 0.2, t: 0.5, l: 0, a: 0.3 }),
  furnishings: Object.freeze({ h: 0, t: 0.4, l: 0.2, a: 0.4 }),
  stonework: Object.freeze({ h: 0.3, t: 0.5, l: 0, a: 0.2 }),
  leather: Object.freeze({ h: 0.2, t: 0.4, l: 0.3, a: 0.1 }),
  clothing: Object.freeze({ h: 0, t: 0.3, l: 0.4, a: 0.3 }),
  jewellery: Object.freeze({ h: 0.1, t: 0.1, l: 0.1, a: 0.7 }),
  dishes: null,
});

/** The material key's family of material ('ingot:iron' 'ingot', 'p1:8' 'herb'). */
export function categoryOf(/** @type {string} */ key) {
  const head = String(key).split(':')[0];
  return head === 'p1' || head === 'p2' ? 'herb' : head;
}

/**
 * @typedef {{ id: string, role: 'primary'|'secondary'|'fixed', categories: string[], options: string[], n: number,
 *   nMax: number, optional: boolean }} Slot
 * @typedef {{ id: string, name: string, discipline: string, track: string, family: string, kind: string,
 *   templateIndex: number, tierMin: number, tierMax: number, rankMin: number, rankMax: number, recipes: number,
 *   slots: Slot[], weights: Readonly<StatWeights> | null }} Form
 */

/** @param {any[]} rs the old recipes of one product @returns {Slot[]} */
function slotsOf(rs) {
  const cheapest = [...rs].sort((a, b) => a.tier - b.tier || a.rank - b.rank)[0];
  const width = Math.max(...rs.map((r) => r.inputs.length));
  /** @type {Slot[]} */
  const slots = [];
  for (let i = 0; i < width; i++) {
    const have = rs.filter((r) => r.inputs[i]);
    const keys = [...new Set(have.map((r) => r.inputs[i].key))];
    const counts = have.map((r) => r.inputs[i].n);
    const first = cheapest.inputs[i]?.key ?? keys[0];
    slots.push({
      id: `${categoryOf(first)}${i}`,
      role: i === 0 ? 'primary' : keys.length > 1 ? 'secondary' : 'fixed',
      categories: [...new Set(keys.map(categoryOf))],
      options: keys,
      n: Math.min(...counts),
      nMax: Math.max(...counts),
      optional: have.length < rs.length,
    });
  }
  return slots;
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
      name: r.pattern ?? r.name,
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
