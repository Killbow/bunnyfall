// @ts-check
// BUNNYFALL PROVISIONING (docs/PROVISIONING.md): WHAT THE POT AND THE CAULDRON MAKE, AND WHAT IT DOES. The service decides
// a make (server-account/src/provisioning.js); this mints it into the pack and lays it on when eaten or drunk.
// A dish stands on one of the four dishes' templates (685-688), its name and effect its own (`prov`); a potion is the
// game's own bottle of its first trait's potion, every trait drunk as its classic potion at the make's strength.

import { createPotion } from './loot/loot.js';
import { potionById } from '../net/alchemyLaw.js';
import { setItemFields, mintCondition } from './item/itemTemplates.js';
import { PROF_ITEM_GROUP } from './professions/profTemplates.js';
import { FOOD_TRAITS, dishTemplateOf } from '../net/provision/provisionLaw.js';

/** The pieces a make's answer mints (`data.prov`, the service's): its potions or its dishes. */
export function provItems(data) {
  const p = data?.prov;
  if (!p || !Array.isArray(p.traits)) return [];
  const n = Number.isSafeInteger(p.count) ? Math.max(1, Math.min(4, p.count)) : 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    if (p.kind === 'cauldron') {
      const first = potionById(p.traits[0]);
      if (!first) continue;
      const it = /** @type {any} */ (createPotion(first.key));
      it.name = p.name;
      it.prov = { k: 'c', t: [...p.traits], p: Number(p.potent) || 0 };
      it.value = Math.round(((Number(it.value) || 0) * p.traits.length * (100 + Math.max(0, it.prov.p))) / 100);
      out.push(it);
    } else {
      const it = /** @type {any} */ (mintCondition(setItemFields({ group: PROF_ITEM_GROUP, templateIndex: dishTemplateOf(p), material: 0, flags: 0, variant: 0, message: 0, stackCount: 1 })));
      it.name = p.name;
      it.prov = { k: 'd', t: [...p.traits], m: Number(p.magnitude) || 1, r: Number(p.resist) || 0, min: Number(p.minutes) || 60, party: p.party === true, drink: p.drink === true };
      out.push(it);
    }
  }
  return out;
}
/** What a make says: "You cooked 2 Hearty Warming Stews." */
export function provText(data) {
  const p = data?.prov;
  if (!p) return 'You made nothing.';
  const n = Number(p.count) || 1;
  const verb = p.kind === 'cauldron' ? 'brewed' : p.drink ? 'made' : 'cooked';
  const many = p.kind === 'cauldron' ? String(p.name).replace(/^Potion /, 'Potions ') : `${p.name}s`;
  return `You ${verb} ${n === 1 ? 'a' : n} ${n === 1 ? p.name : many}`;
}

/** Whether an item is a pot's dish or drink. */
export const isProvDish = (/** @type {any} */ it) => it?.prov?.k === 'd' && Array.isArray(it.prov.t);
/** Whether an item is a cauldron's potion. */
export const isProvPotion = (/** @type {any} */ it) => it?.prov?.k === 'c' && Array.isArray(it.prov.t);

/**
 * A pot's dish as the dishes' frame lays it on (cookItems.js feedEffect): a dish definition of its own - its stats at its
 * magnitude, Restful the stamina, its minutes, a feast's party - and the resists it drinks as potions.
 */
export function provDishDef(/** @type {any} */ it) {
  const stats = {};
  for (const t of it.prov.t) { const s = /** @type {any} */ (FOOD_TRAITS)[t]?.stat; if (s) /** @type {any} */ (stats)[s] = it.prov.m; }
  return {
    id: 'prov', name: String(it.name ?? 'Dish'),
    effect: { ...(Object.keys(stats).length ? { stats } : {}), ...(it.prov.t.includes('restful') ? { stamina: 20 } : {}), minutes: it.prov.min, ...(it.prov.party ? { party: true } : {}) },
  };
}
/** The classic potions a pot's dish drinks as (Warming, Cooling), at its strength. */
export const provDishResists = (/** @type {any} */ it) => it.prov.t.map((t) => /** @type {any} */ (FOOD_TRAITS)[t]?.resist).filter(Boolean).map((id) => potionById(id)).filter(Boolean);
/** The classic potions a cauldron's potion drinks as, every trait, at its strength. */
export const provPotionParts = (/** @type {any} */ it) => it.prov.t.map((t) => potionById(t)).filter(Boolean);
