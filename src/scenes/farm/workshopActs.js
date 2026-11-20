// @ts-check
// BUNNYFALL FARM EXPANSION, PHASE 4 (docs/FARM-EXPANSION.md section 7): WHAT THE WORKSHOPS DO WHEN USED. A workshop's three
// clickable parts: its BODY (staked: an officer orders it built, Y/N, Company gold; rising: how long; built: which recipe is
// set, the batch's state), its INPUT CRATE (starts a batch of the set recipe from the Company Stores) and its OUTPUT SHELF
// (collects a finished batch into the Stores). The order post's weekly PRODUCT ORDER is read here too. Words go to the HUD's
// message line; Company gold moves only after DFU's Y/N. Pure but for the doors it is handed.
import { t } from '../../systems/textManager.js';
import { pantryOf, CLOTHS } from '../../net/professionLaw.js';
import { WORKSHOPS, WORKSHOP_IDS, stageOf, batchState, recipeOf, productOrder, productOpen } from '../../net/farm/workshopLaw.js';
import { farmWeek } from '../../net/farmProgressLaw.js';

const fmt = (n) => Number(n).toLocaleString('en-US');
/** A product or input in words. */
export const goodName = (key) => pantryOf(key)?.name ?? CLOTHS.find((c) => c.key === key)?.name ?? key.replace(/^\w+:/, '');
export const workshopName = (id) => ({ windmill: t('farm.shop.windmill', 'windmill'), press: t('farm.shop.press', 'press'), churn: t('farm.shop.churn', 'dairy churn'),
  smokehouse: t('farm.shop.smokehouse', 'smokehouse'), loom: t('farm.shop.loom', 'loom'), brewery: t('farm.shop.brewery', 'brewery'), apiary: t('farm.shop.apiary', 'apiary') })[id] ?? id;
/** Seconds as a plain wait. */
const wait = (s) => (s >= 5400 ? t('farm.shop.hours', '{n} hours', { n: Math.ceil(s / 3600) }) : t('farm.shop.minutes', '{n} minutes', { n: Math.max(1, Math.ceil(s / 60)) }));
/** A target id's workshop and part, or null: `loom` (body), `loom:in`, `loom:out`. */
export function workshopTarget(id) {
  const [workshop, part = 'body'] = String(id).split(':');
  return WORKSHOP_IDS.includes(workshop) && ['body', 'in', 'out'].includes(part) ? { workshop, part } : null;
}
/** The workshops' refusals in words, for the host's error table. */
export const workshopErrors = () => ({
  'farm-workshop-nostock': t('farm.shop.noStock', 'The Company Stores do not hold enough of that.'),
  'farm-workshop-busy': t('farm.shop.busy', 'It is still at work.'),
  'farm-workshop-rising': t('farm.shop.rising', 'It is not built yet.'),
  'farm-workshop-built': t('farm.shop.alreadyBuilt', 'That is already built.'),
  'farm-workshop-nothing': t('farm.shop.nothing', 'There is nothing on the shelf yet.'),
  'farm-workshop-bad': t('farm.shop.bad', 'That cannot be done here.'),
});

/**
 * @param {{ garden: () => any, now: () => number, mapId: () => number, mayManage: () => boolean, busy: () => boolean, say: (s: string) => void,
 *   ask: (lines: string[], yes: () => void) => void, act: (action: any) => any, wantFunds: () => void }} d
 */
export function createWorkshopActs(d) {
  /** @type {Record<string, number>} */ const pick = {};
  let postClicks = 0;
  const recipe = (id) => WORKSHOPS[id].recipes[(pick[id] ?? 0) % WORKSHOPS[id].recipes.length];
  const batch = (id) => d.garden().batches?.[id];
  const recipeLine = (id) => {
    const r = recipe(id);
    return r.in ? t('farm.shop.recipe', '{n} {input} make {qty} {out}, in {time}.', { n: r.n, input: goodName(r.in), qty: r.qty, out: goodName(r.out), time: wait(r.s) })
      : t('farm.shop.recipeFree', 'The bees make {qty} {out}, in {time}. It costs nothing from the Stores.', { qty: r.qty, out: goodName(r.out), time: wait(r.s) });
  };

  /** The product order, read aloud; an officer is asked whether to ship it. */
  function orderLine() {
    const o = productOrder(d.mapId(), farmWeek(d.now())), name = goodName(o.key);
    if (!productOpen(d.garden(), d.now())) { d.say(t('farm.shop.orderDone', 'The {name} order is filled this week. A new one goes up on Morndas.', { name })); return; }
    const line = t('farm.shop.orderLine', 'Wanted: {qty} {name}, for {gold} gold. Take it from the Company Stores.', { qty: o.qty, name, gold: fmt(o.gold) });
    if (!d.mayManage()) { d.say(`${line} ${t('farm.shop.orderOfficer', 'A Captain or an Officer can ship it.')}`); return; }
    d.wantFunds();
    d.ask([t('farm.shop.orderAsk', 'Ship {qty} {name} from the Company Stores for this week\'s order?', { qty: o.qty, name }), t('farm.shop.orderPays', 'The Company treasury is paid {gold} gold.', { gold: fmt(o.gold) })], () => d.act({ op: 'workshop', act: 'order' }));
  }

  return {
    /** The order post's every fourth click: this week's product order. True when it took the click. */
    post() { postClicks++; if (postClicks % 4 !== 0) return false; orderLine(); return true; },
    /** The hover line over a workshop's part. */
    label(id) {
      const w = workshopTarget(id); if (!w) return '';
      const stage = stageOf(d.garden(), w.workshop, d.now()), name = workshopName(w.workshop), st = batchState(d.garden(), w.workshop, d.now());
      if (stage === 0) return t('farm.shop.stakedLabel', 'Staked plot · a {name} could be built here', { name });
      if (stage === 1) return t('farm.shop.risingLabel', 'The {name} is going up · {time} to go', { name, time: wait(d.garden().built[w.workshop] - d.now()) });
      if (w.part === 'in') return st === 1 ? t('farm.shop.inBusy', 'Input crate · the {name} is at work', { name }) : (recipe(w.workshop).in ? t('farm.shop.inLabel', 'Input crate · click to start: {recipe}', { recipe: recipeLine(w.workshop) }) : t('farm.shop.inLabelFree', 'Bee boxes · click to set the bees to work: {recipe}', { recipe: recipeLine(w.workshop) }));
      if (w.part === 'out') return st === 2 ? t('farm.shop.outReady', 'Output shelf · {qty} {out} ready · click to collect', { qty: batch(w.workshop).qty, out: goodName(batch(w.workshop).out) })
        : st === 1 ? t('farm.shop.outBusy', 'Output shelf · ready in {time}', { time: wait(batch(w.workshop).t1 - d.now()) }) : t('farm.shop.outEmpty', 'Output shelf · empty');
      return t('farm.shop.bodyLabel', 'The {name} · click to change what it makes', { name });
    },
    /** A workshop's part used. */
    use(id) {
      const w = workshopTarget(id); if (!w || d.busy()) return;
      const g = d.garden(), now = d.now(), stage = stageOf(g, w.workshop, now), W = WORKSHOPS[w.workshop], name = workshopName(w.workshop), st = batchState(g, w.workshop, now);
      if (stage === 0) {
        const line = t('farm.shop.stakedLine', 'Stakes and rope: a {name} could stand here. It costs the Company {gold} gold and {time} to build.', { name, gold: fmt(W.gold), time: wait(W.buildS) });
        if (!d.mayManage()) { d.say(`${line} ${t('farm.shop.buildOfficer', 'A Captain or an Officer can order it.')}`); return; }
        d.wantFunds();
        d.ask([t('farm.shop.buildAsk', 'Order a {name} built here?', { name }), t('farm.shop.buildCost', 'It costs the Company treasury {gold} gold, and takes {time}.', { gold: fmt(W.gold), time: wait(W.buildS) })], () => d.act({ op: 'workshop', act: 'build', workshop: w.workshop }));
        return;
      }
      if (stage === 1) { d.say(t('farm.shop.risingLine', 'Carpenters are raising the {name}: {time} to go.', { name, time: wait(g.built[w.workshop] - now) })); return; }
      if (w.part === 'in') {
        if (st === 1) { d.say(t('farm.shop.inBusyLine', 'The {name} is at work: {time} to go.', { name, time: wait(batch(w.workshop).t1 - now) })); return; }
        d.act({ op: 'workshop', act: 'start', workshop: w.workshop, recipe: recipe(w.workshop).id });
        return;
      }
      if (w.part === 'out') {
        if (st === 2) d.act({ op: 'workshop', act: 'collect', workshop: w.workshop });
        else d.say(st === 1 ? t('farm.shop.outBusyLine', 'Not done yet: {time} to go.', { time: wait(batch(w.workshop).t1 - now) }) : t('farm.shop.outEmptyLine', 'The shelf is empty. Fill the crate to start a batch.'));
        return;
      }
      // the body: the next recipe, said aloud
      pick[w.workshop] = (pick[w.workshop] ?? 0) + 1;
      d.say(`${t('farm.shop.set', 'The {name} is set to:', { name })} ${recipeLine(w.workshop)}`);
    },
    /** The words after a workshop act the service accepted. */
    done(action, data) {
      const w = data.workshop ?? {}, id = action.workshop;
      if (action.act === 'build') return t('farm.shop.built', 'The carpenters set to work. The {name} will be ready in {time}.', { name: workshopName(id), time: wait(WORKSHOPS[id].buildS) });
      if (action.act === 'order') return t('farm.shop.orderPaid', 'The order is shipped. Company treasury: +{gold} gold.', { gold: fmt(w.order?.gold ?? 0) });
      if (action.act === 'collect') return t('farm.shop.collected', '{qty} {out} go to the Company Stores.', { qty: w.collected?.qty ?? 0, out: goodName(w.collected?.material ?? '') });
      const r = recipeOf(id, action.recipe);
      if (r && !r.in) return t('farm.shop.startedFree', 'You open the bee boxes. The {name} is at work: {time}.', { name: workshopName(id), time: wait(r.s) });
      return t('farm.shop.started', 'You fill the crate from the Company Stores. The {name} is at work: {time}.', { name: workshopName(id), time: wait(r?.s ?? 0) });
    },
  };
}
