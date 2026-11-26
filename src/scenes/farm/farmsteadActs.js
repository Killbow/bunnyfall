// @ts-check
// BUNNYFALL FARM EXPANSION, PHASE 1 (docs/FARM-EXPANSION.md section 3): WHAT EACH FIXTURE DOES WHEN USED - the farm's
// own things in place of the old Progress & orders sidebar. A fixture SPEAKS a line into the HUD's message line; where
// Company money would move (shipping an order, buying an improvement) an officer is asked DFU's Y/N question first, and
// the service judges it as before (the garden route's `deliver` and `upgrade` ops: farmProgress.js). Pure but for the
// doors it is handed.
import { t } from '../../ui/textManager.js';
import { farmCropName } from '../../ui/farmingHud.js';
import { farmUpgradeName, farmUpgradeEffect } from '../../ui/farmWords.js';
import { FARM_CROP_TYPES, FARM_UPGRADES, FARM_ARGENTS_PER_WEEK, farmProgress, farmOrder, farmWeek } from '../../net/farmProgressLaw.js';
import { wagonCargo, cargoTotal } from '../../net/farm/haulLaw.js';
import { nextFarmTitle, FARM_WORK_DAY_CAP } from '../../net/farm/farmWorkLaw.js';
import { FARM_SEED_IDS, farmSeed, farmSeason, seasonPace, SEASON_OFF } from '../../net/farm/cropLaw.js';
import { strainOf } from '../../net/farm/strainLaw.js';
import { TITLE_TEXT } from '../../ui/playerBadge.js';
import { WORKSHOP_IDS, stageOf, batchState } from '../../net/farm/workshopLaw.js';   // the ledger's yard
import { contentAt, CONTENT_GOOD, droverVisit, droverWeekday } from '../../net/farm/herdLaw.js';
import { workshopName } from './workshopActs.js';
import { WEEKDAYS } from './marketActs.js';

/** A strain trait in words. */
export const traitWord = (k) => ({ quick: t('farm.trait.quick', 'quick'), hardy: t('farm.trait.hardy', 'hardy'), heavy: t('farm.trait.heavy', 'heavy'), showy: t('farm.trait.showy', 'showy'), sweet: t('farm.trait.sweet', 'sweet') })[k] ?? k;
/** Which improvement each fixture shows and sells. */
export const FIXTURE_UPGRADE = Object.freeze({ toolRack: 'tools', well: 'irrigation', compost: 'soil' });
const fmt = (n) => Number(n).toLocaleString('en-US');

/**
 * @param {{ garden: () => any, now: () => number, mapId: () => number, mayManage: () => boolean, busy: () => boolean, economy: () => any,
 *   work: () => ({ total: number, today: number } | null), say: (s: string) => void, setSeed: (id: string) => void, ask: (lines: string[], yes: () => void) => void,
 *   act: (action: any) => any, wantFunds: () => void, held?: () => string, postNote?: () => (string | null), ledger?: (model: any) => void }} d
 */
export function createFarmsteadActs(d) {
  let postLine = 0;
  const progress = () => farmProgress(d.garden());
  const grownOf = (p, crop) => Math.max(0, p.harvested[crop] - p.delivered[crop]);
  const total = (o) => Object.values(o).reduce((a, b) => a + b, 0);

  /** The order post's notice for one crop. */
  function notice(crop) {
    const p = progress(), order = farmOrder(p, crop), name = farmCropName(crop);
    if (p.weeks[crop] === farmWeek(d.now())) return t('farm.stead.postFilled', '{crop}: filled this week. The next notice goes up on Morndas.', { crop: name });
    return t('farm.stead.postOrder', 'Wanted: {quantity} {crop}, for {gold} gold and {argents} Argents. Harvested here and not yet shipped: {grown}. Any Company member ships it at the factor\'s wagon.',
      { quantity: fmt(order.quantity), crop: name, gold: fmt(order.gold), argents: order.argents, grown: fmt(grownOf(p, crop)) });
  }

  /**
   * THE ESTATE LEDGER'S PAGE (2026-11-20, a player: "annoying to click through it multiple times ... it would be better if it just
   * popped up a ui that gave a sort of overview of the farm"): everything the old ledger read out in turn, as one model for the
   * read-only page (ui/farmLedger.js) - your farm work, this week's orders and how to ship them, what has shipped, what each
   * improvement still wants, the herd and the workshops. Pure.
   */
  function overview() {
    const p = progress(), g = d.garden(), now = d.now(), week = farmWeek(now), work = d.work?.(), sections = [];
    if (work) {
      const next = nextFarmTitle(work.total);
      sections.push({ title: t('farm.ledger.work', 'Your farm work'), rows: [
        { label: t('farm.ledger.workTotal', 'So far'), text: t('farm.ledger.workText', '{total} ({today} of {cap} counted today)', { total: fmt(work.total), today: work.today, cap: FARM_WORK_DAY_CAP }) },
        { label: t('farm.ledger.workNext', 'Next name'), text: next ? t('farm.ledger.workNextText', '{title} at {needed}: {left} to go', { title: TITLE_TEXT[next.title] ?? next.title, needed: fmt(next.needed), left: fmt(next.left) }) : t('farm.ledger.workDone', 'You hold the highest name a farmer can.') },
      ] });
    }
    sections.push({ title: t('farm.ledger.orders', 'This week\'s orders: ship them at the factor\'s wagon'), rows: FARM_CROP_TYPES.map((c) => {
      const o = farmOrder(p, c), grown = grownOf(p, c), pays = { gold: fmt(o.gold), argents: o.argents };
      if (p.weeks[c] === week) return { label: farmCropName(c), text: t('farm.ledger.orderFilled', 'Filled this week. The next one goes up on Morndas.') };
      return grown >= o.quantity
        ? { label: farmCropName(c), ready: true, text: t('farm.ledger.orderReady', 'Ready to ship: {quantity} wanted, {grown} harvested here. Pays {gold} gold and {argents} Argents.', { quantity: fmt(o.quantity), grown: fmt(grown), ...pays }) }
        : { label: farmCropName(c), text: t('farm.ledger.orderNot', '{grown} of {quantity} harvested here and not yet shipped. Pays {gold} gold and {argents} Argents.', { quantity: fmt(o.quantity), grown: fmt(grown), ...pays }) };
    }) });
    const cargo = cargoTotal(wagonCargo(g, now)), shipped = [
      { label: t('farm.ledger.harvested', 'Harvested here'), text: t('farm.ledger.harvestedText', '{n} crops in all', { n: fmt(total(p.harvested)) }) },
      { label: t('farm.ledger.shipped', 'Shipped so far'), text: t('farm.ledger.shippedText', '{grain} grain, {mushroom} mushrooms, {herbs} herbs', { grain: fmt(p.delivered.grain), mushroom: fmt(p.delivered.mushroom), herbs: fmt(p.delivered.herbs) }) },
    ];
    if (cargo) shipped.push({ label: t('farm.ledger.cargo', 'On the wagon'), text: t('farm.ledger.cargoText', '{n} crops carried there by hand this week', { n: fmt(cargo) }) });
    sections.push({ title: t('farm.ledger.totals', 'The farm\'s books'), rows: shipped });
    const place = { tools: t('farm.ledger.atRack', 'the tool rack'), irrigation: t('farm.ledger.atWell', 'the well'), soil: t('farm.ledger.atHeap', 'the compost heap') };
    const family = { tools: t('farm.ledger.tools', 'Tools'), irrigation: t('farm.ledger.irrigation', 'Irrigation'), soil: t('farm.ledger.soil', 'Soil') };
    sections.push({ title: t('farm.ledger.improvements', 'Improvements'), rows: Object.keys(FARM_UPGRADES).map((key) => {
      const tier = p.upgrades[key], have = tier > 0 ? farmUpgradeName(key, tier - 1) : t('farm.ledger.none', 'none yet');
      if (tier >= FARM_UPGRADES[key].length) return { label: family[key], text: t('farm.ledger.best', '{name}: the best there is', { name: have }) };
      const price = FARM_UPGRADES[key][tier], short = FARM_CROP_TYPES.filter((c) => p.delivered[c] < price.delivered);
      return { label: family[key], text: short.length
        ? t('farm.ledger.nextShort', '{have}. Next: {name}, once {needed} of every crop has shipped (short: {crops})', { have, name: farmUpgradeName(key, tier), needed: fmt(price.delivered), crops: short.map((c) => `${farmCropName(c)} ${fmt(p.delivered[c])}/${fmt(price.delivered)}`).join(', ') })
        : t('farm.ledger.nextReady', '{have}. Next: {name}, for {gold} gold and {argents} Argents: a Captain or an Officer orders it at {place}', { have, name: farmUpgradeName(key, tier), gold: fmt(price.gold), argents: price.argents, place: place[key] }) };
    }) });
    const herd = g.herd ?? [], built = WORKSHOP_IDS.filter((id) => stageOf(g, id, now) === 2);
    sections.push({ title: t('farm.ledger.yard', 'The yard'), rows: [
      { label: t('farm.ledger.herd', 'Animals'), text: herd.length ? t('farm.ledger.herdText', '{n} ({m} content)', { n: herd.length, m: herd.filter((a) => contentAt(a, now) >= CONTENT_GOOD).length }) : t('farm.ledger.none', 'none yet') },
      { label: t('farm.ledger.drover', 'The drover'), text: droverVisit(d.mapId(), week).day === Math.floor(now / 86400) ? t('farm.ledger.droverHere', 'Here today with animals for sale') : t('farm.ledger.droverDay', 'Comes every {day} with animals for sale', { day: WEEKDAYS()[droverWeekday(d.mapId())] }) },
      { label: t('farm.ledger.workshops', 'Workshops'), text: built.length ? built.map((id) => workshopName(id) + (batchState(g, id, now) === 1 ? t('farm.ledger.working', ' (at work)') : batchState(g, id, now) === 2 ? t('farm.ledger.shelf', ' (goods on the shelf)') : '')).join(', ') : t('farm.ledger.noShops', 'none built: a Captain or an Officer orders them on the staked plots') },
    ] });
    return { title: t('farm.ledger.title', 'The estate ledger'), sections,
      note: t('farm.ledger.note', 'Harvests go into the Company Stores at once. "Harvested here" counts the crops harvested by hand at this farm; shipping an order takes that many out of the Stores.') };
  }

  /** The factor's wagon: load the first order that is ready. */
  function wagon() {
    d.wantFunds();
    const p = progress(), week = farmWeek(d.now());
    const open = FARM_CROP_TYPES.filter((c) => p.weeks[c] !== week);
    if (!open.length) { d.say(t('farm.stead.wagonDone', 'Every order is filled this week. The factor will be back on Morndas.')); return; }
    const crop = open.find((c) => grownOf(p, c) >= farmOrder(p, c).quantity);
    if (!crop) {
      const c = open[0];
      d.say(t('farm.stead.wagonEmpty', 'Nothing is ready to ship yet. The next order wants {quantity} {crop}; {grown} harvested here and not yet shipped.', { quantity: fmt(farmOrder(p, c).quantity), crop: farmCropName(c), grown: fmt(grownOf(p, c)) }));
      return;
    }
    const order = farmOrder(p, crop), economy = d.economy();
    if (economy && economy.earned + order.argents > FARM_ARGENTS_PER_WEEK) { d.say(t('farm.progress.cap', 'The Company has reached its weekly farm Argent limit.')); return; }
    d.ask([
      t('farm.stead.wagonAsk', 'Load {quantity} {crop} from the Company Stores onto the factor\'s wagon?', { quantity: fmt(order.quantity), crop: farmCropName(crop) }),
      t('farm.stead.wagonPays', 'The Company is paid {gold} gold and {argents} Argents.', { gold: fmt(order.gold), argents: order.argents }),
    ], () => d.act({ op: 'deliver', crop }));
  }

  /** The tool rack, the well and the compost heap: their improvement, and an officer's order for the next. */
  function improvement(key) {
    const p = progress(), tier = p.upgrades[key];
    if (tier >= FARM_UPGRADES[key].length) { d.say(t('farm.stead.upgradeBest', '{name}: the best there is.', { name: farmUpgradeName(key, tier - 1) })); return; }
    const price = FARM_UPGRADES[key][tier], name = farmUpgradeName(key, tier);
    const line = t('farm.stead.upgradeLine', '{name}: {effect} {gold} gold and {argents} Argents, once {needed} of every crop has shipped.',
      { name, effect: farmUpgradeEffect(key, tier), gold: fmt(price.gold), argents: price.argents, needed: fmt(price.delivered) });
    if (!d.mayManage()) { d.say(`${line} ${t('farm.stead.upgradeOfficer', 'An officer can order it.')}`); return; }
    d.wantFunds();
    if (!FARM_CROP_TYPES.every((c) => p.delivered[c] >= price.delivered)) { d.say(line); return; }
    const economy = d.economy();
    if (economy && (economy.gold < price.gold || economy.argents < price.argents)) { d.say(`${line} ${t('farm.progress.noFunds', 'The Company needs more gold or Argents for this improvement.')}`); return; }
    d.ask([
      t('farm.stead.upgradeAsk', 'Order {name} for the farm?', { name }),
      t('farm.stead.upgradeCost', '{effect} It costs the Company {gold} gold and {argents} Argents.', { effect: farmUpgradeEffect(key, tier), gold: fmt(price.gold), argents: price.argents }),
    ], () => d.act({ op: 'upgrade', upgrade: key }));
  }

  return {
    /** The estate ledger's page, as a model (the farm refreshes the open page from it each frame). */
    overview,
    /** The hover line over a fixture. */
    label(id) {
      if (id.startsWith('seed:')) {
        const [cropId, sid] = id.slice(5).split('#'), st = sid ? strainOf(d.garden(), Number(sid)) : null;
        const seed = farmSeed(cropId), pace = seasonPace(seed, farmSeason(d.now()));
        if (st) return `${t('farm.stead.strainLabel', '{name} ({crop}) · {traits}', { name: st.name, crop: farmCropName(cropId), traits: st.traits.map(traitWord).join(', ') })}`;
        const when = !seed?.seasons ? '' : pace >= 1 ? t('farm.stead.seedInSeason', ' · in season') : pace >= SEASON_OFF ? t('farm.stead.seedOffSeason', ' · slow this season') : t('farm.stead.seedWinter', ' · slow in winter');
        return t('farm.stead.seedLabel', '{crop} seed · take a handful', { crop: farmCropName(id.slice(5)) }) + when;
      }
      const p = progress();
      if (Object.hasOwn(FIXTURE_UPGRADE, id)) {
        const key = FIXTURE_UPGRADE[id], tier = p.upgrades[key];
        return tier >= FARM_UPGRADES[key].length ? farmUpgradeName(key, tier - 1) : tier > 0 ? `${farmUpgradeName(key, tier - 1)} · ${t('farm.stead.next', 'next: {name}', { name: farmUpgradeName(key, tier) })}` : t('farm.stead.next', 'next: {name}', { name: farmUpgradeName(key, tier) });
      }
      return {
        orderPost: t('farm.stead.postLabel', 'Order post · this week\'s notices'),
        wagon: t('farm.stead.wagonLabelOfficer', 'The factor\'s wagon · click to ship this week\'s orders'),
        ledger: t('farm.stead.ledgerLabel', 'The estate ledger'),
        haystack: t('farm.stead.hayLabel', 'The season\'s hay'),
        scarecrow: t('farm.stead.scarecrowLabel', 'The scarecrow'),
      }[id] ?? '';
    },
    /** A fixture used. */
    use(id) {
      if (d.busy()) return;
      if (id.startsWith('seed:')) {
        const seedId = id.slice(5), [crop, sid] = seedId.split('#'), st = sid ? strainOf(d.garden(), Number(sid)) : null;
        if (!FARM_SEED_IDS.includes(crop) || (sid && !st)) return;
        // PHASE 2c: an officer burns a strain by taking its sack twice - asked first
        if (st && d.held?.() === seedId && d.mayManage()) {
          d.ask([t('farm.stead.burnAsk', 'Burn the {name} seed? Its place on the shelf is freed for a new cross; beds already sown grow on.', { name: st.name })], () => d.act({ op: 'burn', strain: st.id }));
          return;
        }
        d.setSeed(seedId); d.say(st ? t('farm.stead.strainTaken', 'You take a handful of {name} seed.', { name: st.name }) : t('farm.stead.seedTaken', 'You take a handful of {crop} seed.', { crop: farmCropName(crop) }));
        return;
      }
      if (Object.hasOwn(FIXTURE_UPGRADE, id)) { improvement(FIXTURE_UPGRADE[id]); return; }
      if (id === 'orderPost') {   // PHASE 7: and the market's notice, last in the turn
        const note = d.postNote?.(), i = postLine++ % (FARM_CROP_TYPES.length + (note ? 1 : 0));
        d.say(i < FARM_CROP_TYPES.length ? notice(FARM_CROP_TYPES[i]) : note); return;
      }
      if (id === 'ledger') { d.wantFunds(); d.ledger ? d.ledger(overview()) : d.say(overview().sections[0].rows[0].text); return; }   // my farm work is read while I use it
      if (id === 'wagon') { wagon(); return; }
      if (id === 'haystack') { d.say(t('farm.stead.hay', 'Sweet-smelling hay, stacked for the winter.')); return; }
      if (id === 'scarecrow') d.say(t('farm.stead.scarecrow', 'The scarecrow keeps its watch over the rows.'));
    },
  };
}
