// @ts-check
// BUNNYFALL FARM EXPANSION, PHASE 4 (docs/FARM-EXPANSION.md section 7): THE WORKSHOP YARD - the Company's mill, press,
// churn, smokehouse, loom and brewery, kept in the garden like the beds and the herd. A workshop is a FIXTURE on the
// farmstead: an officer orders it built on its staked plot (paying Company gold), it RISES over real time, and then any
// member may start a BATCH - the inputs come out of the communal Company Stores, the work runs on the service's clock,
// and the output waits on the shelf until someone collects it into the Stores. A finished batch is never lost: starting
// the next one collects it first. Nothing here ever fails or spoils; a batch only takes the time it takes.
//
//   garden.built   { windmill: readyAtS, ... }   ordered at `built[id] - buildS`, ready from `built[id]`
//   garden.batches { windmill: { r, t0, t1, out, qty } }   one batch a workshop: recipe id, started, ready, product
//   garden.prodWeek  the farm week whose product order is filled (the order post, once a week)
//
// Pure: no clock, no network. The service turns its answers into the treasury's and the Stores' statements
// (server-account/src/farmGardens.js). Every number is balance, tunable here.
import { farmWeek } from '../farmProgressLaw.js';

const HOUR = 3600;
/** A recipe: `n` of `in` from the Stores make `qty` of `out`, `s` seconds. */
const r = (id, input, n, out, qty, hours) => Object.freeze({ id, in: input, n, out, qty, s: hours * HOUR });

/** The workshops: the gold an officer pays, the hours it takes to rise, and what each makes. */
export const WORKSHOPS = Object.freeze({
  windmill: Object.freeze({ gold: 12000, buildS: 24 * HOUR, recipes: Object.freeze([r('flour', 'food:grain', 8, 'food:flour', 8, 2), r('cornmeal', 'food:corn', 8, 'food:cornmeal', 8, 2)]) }),
  press: Object.freeze({ gold: 8000, buildS: 12 * HOUR, recipes: Object.freeze([r('wine', 'food:grapes', 8, 'food:wine', 4, 6), r('oil', 'food:sunseed', 8, 'food:oil', 4, 6), r('berrywine', 'food:berries', 8, 'food:berrywine', 4, 6)]) }),
  churn: Object.freeze({ gold: 3000, buildS: 4 * HOUR, recipes: Object.freeze([r('butter', 'food:milk', 6, 'food:butter', 3, 4), r('cheesewheel', 'food:milk', 8, 'food:cheesewheel', 2, 6)]) }),
  smokehouse: Object.freeze({ gold: 5000, buildS: 8 * HOUR, recipes: Object.freeze([r('smokedmeat', 'food:meat', 4, 'food:smokedmeat', 4, 8), r('smokedboar', 'food:boar', 4, 'food:smokedmeat', 4, 8),
    r('smokedbear', 'food:bear', 4, 'food:smokedmeat', 4, 8), r('smokedfish', 'food:fish', 4, 'food:smokedfish', 4, 8)]) }),
  loom: Object.freeze({ gold: 6000, buildS: 6 * HOUR, recipes: Object.freeze([r('linen', 'food:flax', 6, 'cloth:linen', 2, 3)]) }),   // wool is already cloth in the Stores (cloth:wool): the loom has nothing to do to it
  brewery: Object.freeze({ gold: 9000, buildS: 12 * HOUR, recipes: Object.freeze([r('ale', 'food:grain', 10, 'food:ale', 5, 12), r('mead', 'food:honey', 6, 'food:mead', 3, 12)]) }),
});
export const WORKSHOP_IDS = Object.freeze(Object.keys(WORKSHOPS));
export const recipeOf = (workshop, id) => WORKSHOPS[workshop]?.recipes.find((x) => x.id === id) ?? null;
/** The farm work a started batch earns (farmWorkLaw.js FARM_WORK.batch). */
export const BATCH_WORK = 10;

/** A workshop's stage: 0 unbuilt (staked), 1 rising (scaffold), 2 ready. */
export function stageOf(garden, id, nowS) {
  const at = garden?.built?.[id];
  return at === undefined ? 0 : at > nowS ? 1 : 2;
}
/** A batch's state: 0 none, 1 working, 2 done (on the shelf). */
export function batchState(garden, id, nowS) {
  const b = garden?.batches?.[id];
  return !b ? 0 : b.t1 > nowS ? 1 : 2;
}
/** What the farmstead draws by: `wk_<id>` 1 staked, 2 rising, 3 built; `wo_<id>` 0 idle, 1 working, 2 shelf full. */
export function workshopStages(garden, nowS) {
  const out = {};
  for (const id of WORKSHOP_IDS) { out[`wk_${id}`] = stageOf(garden, id, nowS) + 1; out[`wo_${id}`] = batchState(garden, id, nowS); }
  return out;
}

// ─── THE WEEKLY PRODUCT ORDER ──────────────────────────────────────────
/** What a farm's order post may ask of the Stores: `qty` of `key` for `gold`. Modest: no Argents, never a faucet. */
export const PRODUCT_ORDERS = Object.freeze([
  Object.freeze({ key: 'food:flour', qty: 40, gold: 600 }), Object.freeze({ key: 'food:cornmeal', qty: 40, gold: 600 }),
  Object.freeze({ key: 'food:butter', qty: 24, gold: 600 }), Object.freeze({ key: 'food:cheesewheel', qty: 20, gold: 900 }),
  Object.freeze({ key: 'food:wine', qty: 12, gold: 800 }), Object.freeze({ key: 'food:oil', qty: 12, gold: 700 }),
  Object.freeze({ key: 'food:ale', qty: 20, gold: 700 }), Object.freeze({ key: 'food:mead', qty: 12, gold: 800 }),
  Object.freeze({ key: 'food:smokedmeat', qty: 24, gold: 800 }), Object.freeze({ key: 'cloth:linen', qty: 12, gold: 700 }),
]);
const hash = (...xs) => { let h = 0x811c9dc5; for (const x of xs) { h = Math.imul(h ^ (x | 0), 0x01000193) >>> 0; h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0; } return (h ^ (h >>> 15)) >>> 0; };
/** This farm's product order in `week` (farmWeek). */
export const productOrder = (mapId, week) => PRODUCT_ORDERS[hash(mapId >>> 0, week, 4) % PRODUCT_ORDERS.length];
/** Whether this week's product order is still open. */
export const productOpen = (garden, nowS) => garden?.prodWeek !== farmWeek(nowS);

// ─── VALIDATION ────────────────────────────────────────────────────────
export function validWorkshops(garden) {
  const int = (n, max) => Number.isSafeInteger(n) && n >= 0 && n <= max;
  if (garden.prodWeek !== undefined && !int(garden.prodWeek, 2 ** 31)) return false;
  if (garden.built !== undefined && !(garden.built && typeof garden.built === 'object' && !Array.isArray(garden.built)
    && Object.entries(garden.built).every(([k, v]) => WORKSHOP_IDS.includes(k) && int(v, 2 ** 40)))) return false;
  return garden.batches === undefined || !!(garden.batches && typeof garden.batches === 'object' && !Array.isArray(garden.batches)
    && Object.entries(garden.batches).every(([k, b]) => WORKSHOP_IDS.includes(k) && b && typeof b.out === 'string' && b.out.length <= 32 && int(b.qty, 1000) && int(b.t0, 2 ** 40) && int(b.t1, 2 ** 40) && !!recipeOf(k, b.r)));
}

// ─── THE ACTS ──────────────────────────────────────────────────────────
/** The shelf's finished batch collected on `next` (mutated): its deposit, or null. */
function collectDone(next, id, nowS) {
  const b = next.batches?.[id];
  if (!b || b.t1 > nowS) return null;
  delete next.batches[id];
  if (!Object.keys(next.batches).length) delete next.batches;
  return { material: b.out, qty: b.qty };
}

/**
 * ONE ACT ON A WORKSHOP: `build` (an officer's - the service checks rank and gold), `start` (a recipe by id), `collect`,
 * `order` (this week's product order; an officer's). Answers { garden, gold?: price, consume?: { key, units },
 * deposit?: [{ material, qty }], earn?: gold, started?: 1, worked: [] } or an error.
 */
export function stepFarmWorkshop(garden, { act, workshop, recipe, mapId = 0 }, nowS) {
  const next = structuredClone(garden);
  if (act === 'order') {
    if (!productOpen(garden, nowS)) return { error: 'farm-order-week' };
    const o = productOrder(mapId, farmWeek(nowS));
    next.prodWeek = farmWeek(nowS);
    return { garden: next, consume: { key: o.key, units: o.qty }, earn: o.gold, worked: [], order: o };
  }
  const W = WORKSHOPS[workshop];
  if (!W) return { error: 'farm-workshop-bad' };
  const stage = stageOf(garden, workshop, nowS);
  if (act === 'build') {
    if (stage > 0) return { error: 'farm-workshop-built' };
    next.built = { ...(garden.built ?? {}), [workshop]: nowS + W.buildS };
    return { garden: next, gold: W.gold, worked: [], built: workshop };
  }
  if (stage < 2) return { error: 'farm-workshop-rising' };
  if (act === 'collect') {
    const dep = collectDone(next, workshop, nowS);
    return dep ? { garden: next, deposit: [dep], worked: [], collected: dep } : { error: 'farm-workshop-nothing' };
  }
  if (act === 'start') {
    const rec = recipeOf(workshop, recipe);
    if (!rec) return { error: 'farm-workshop-bad' };
    if (batchState(garden, workshop, nowS) === 1) return { error: 'farm-workshop-busy' };
    const dep = collectDone(next, workshop, nowS);   // a finished batch on the shelf goes to the Stores first
    next.batches = { ...(next.batches ?? {}), [workshop]: { r: rec.id, t0: nowS, t1: nowS + rec.s, out: rec.out, qty: rec.qty } };
    return { garden: next, consume: { key: rec.in, units: rec.n }, deposit: dep ? [dep] : [], started: 1, worked: [] };
  }
  return { error: 'farm-workshop-bad' };
}
