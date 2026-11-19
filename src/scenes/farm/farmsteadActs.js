// @ts-check
// BUNNYFALL FARM EXPANSION, PHASE 1 (docs/FARM-EXPANSION.md section 3): WHAT EACH FIXTURE DOES WHEN USED - the farm's
// own things in place of the old Progress & orders sidebar. A fixture SPEAKS a line into the HUD's message line; where
// Company money would move (shipping an order, buying an improvement) an officer is asked DFU's Y/N question first, and
// the service judges it as before (the garden route's `deliver` and `upgrade` ops: farmProgress.js). Pure but for the
// doors it is handed.
import { t } from '../../systems/textManager.js';
import { farmCropName } from '../../ui/farmingHud.js';
import { farmUpgradeName, farmUpgradeEffect } from '../../ui/farmWords.js';
import { FARM_CROP_TYPES, FARM_UPGRADES, FARM_ARGENTS_PER_WEEK, farmProgress, farmOrder, farmWeek } from '../../net/farmProgressLaw.js';
import { wagonCargo, cargoTotal } from '../../net/farm/haulLaw.js';
import { nextFarmTitle, FARM_WORK_DAY_CAP } from '../../net/farm/farmWorkLaw.js';
import { FARM_SEED_IDS, farmSeed, farmSeason, seasonPace, SEASON_OFF } from '../../net/farm/cropLaw.js';
import { strainOf } from '../../net/farm/strainLaw.js';
import { TITLE_TEXT } from '../../ui/playerBadge.js';

/** A strain trait in words. */
export const traitWord = (k) => ({ quick: t('farm.trait.quick', 'quick'), hardy: t('farm.trait.hardy', 'hardy'), heavy: t('farm.trait.heavy', 'heavy'), showy: t('farm.trait.showy', 'showy'), sweet: t('farm.trait.sweet', 'sweet') })[k] ?? k;
/** Which improvement each fixture shows and sells. */
export const FIXTURE_UPGRADE = Object.freeze({ toolRack: 'tools', well: 'irrigation', compost: 'soil' });
const fmt = (n) => Number(n).toLocaleString('en-US');

/**
 * @param {{ garden: () => any, now: () => number, mayManage: () => boolean, busy: () => boolean, economy: () => any,
 *   work: () => ({ total: number, today: number } | null), say: (s: string) => void, setSeed: (id: string) => void, ask: (lines: string[], yes: () => void) => void,
 *   act: (action: any) => any, wantFunds: () => void, held?: () => string }} d
 */
export function createFarmsteadActs(d) {
  let ledgerLine = 0, postLine = 0;
  const progress = () => farmProgress(d.garden());
  const grownOf = (p, crop) => Math.max(0, p.harvested[crop] - p.delivered[crop]);
  const total = (o) => Object.values(o).reduce((a, b) => a + b, 0);

  /** The order post's notice for one crop. */
  function notice(crop) {
    const p = progress(), order = farmOrder(p, crop), name = farmCropName(crop);
    if (p.weeks[crop] === farmWeek(d.now())) return t('farm.stead.postFilled', '{crop}: filled this week. The next notice goes up on Morndas.', { crop: name });
    return t('farm.stead.postOrder', 'Wanted: {quantity} {crop}, for {gold} gold and {argents} Argents. Grown here and not yet shipped: {grown}.',
      { quantity: fmt(order.quantity), crop: name, gold: fmt(order.gold), argents: order.argents, grown: fmt(grownOf(p, crop)) });
  }

  /** The estate ledger's lines, in turn. */
  function ledger() {
    d.wantFunds();   // and my farm work, read while I use it
    const p = progress(), week = farmWeek(d.now()), lines = [
      t('farm.stead.ledgerTotals', 'The ledger: {harvested} crops harvested here, {delivered} shipped.', { harvested: fmt(total(p.harvested)), delivered: fmt(total(p.delivered)) }),
      t('farm.stead.ledgerShipped', 'Shipped so far: {grain} grain, {mushroom} mushrooms, {herbs} herbs.', { grain: fmt(p.delivered.grain), mushroom: fmt(p.delivered.mushroom), herbs: fmt(p.delivered.herbs) }),
      t('farm.stead.ledgerWeek', 'This week\'s orders filled: {n} of {all}.', { n: FARM_CROP_TYPES.filter((c) => p.weeks[c] === week).length, all: FARM_CROP_TYPES.length }),
    ];
    const work = d.work?.();
    if (work) {
      const next = nextFarmTitle(work.total);
      lines.unshift(next
        ? t('farm.stead.ledgerWork', 'Your farm work: {total} ({today} of {cap} today). {left} more and they will call you {title}.', { total: fmt(work.total), today: work.today, cap: FARM_WORK_DAY_CAP, left: fmt(next.left), title: TITLE_TEXT[next.title] ?? next.title })
        : t('farm.stead.ledgerWorkDone', 'Your farm work: {total}. There is no higher name for a farmer than the one you have.', { total: fmt(work.total) }));
    }
    const cargo = wagonCargo(d.garden(), d.now());
    if (cargoTotal(cargo)) lines.push(t('farm.stead.ledgerCargo', 'Hauled to the wagon this week by hand: {n} crops.', { n: fmt(cargoTotal(cargo)) }));
    for (const key of Object.keys(FARM_UPGRADES)) {
      const tier = p.upgrades[key];
      if (tier >= 2) continue;
      const need = FARM_UPGRADES[key][tier].delivered, short = FARM_CROP_TYPES.filter((c) => p.delivered[c] < need);
      lines.push(short.length
        ? t('farm.stead.ledgerNeed', '{name} wants {needed} of every crop shipped. Still short: {crops}.', { name: farmUpgradeName(key, tier), needed: fmt(need), crops: short.map(farmCropName).join(', ') })
        : t('farm.stead.ledgerReady', '{name} can be ordered: every crop has shipped enough.', { name: farmUpgradeName(key, tier) }));
    }
    return lines[ledgerLine++ % lines.length];
  }

  /** The factor's wagon: load the first order that is ready. */
  function wagon() {
    if (!d.mayManage()) { d.say(t('farm.stead.wagonRank', 'The factor waits for the Captain or an Officer to send the wagon.')); return; }
    d.wantFunds();
    const p = progress(), week = farmWeek(d.now());
    const open = FARM_CROP_TYPES.filter((c) => p.weeks[c] !== week);
    if (!open.length) { d.say(t('farm.stead.wagonDone', 'Every order is filled this week. The factor will be back on Morndas.')); return; }
    const crop = open.find((c) => grownOf(p, c) >= farmOrder(p, c).quantity);
    if (!crop) {
      const c = open[0];
      d.say(t('farm.stead.wagonEmpty', 'Nothing is ready to load. The next order wants {quantity} {crop}; {grown} are grown and unshipped.', { quantity: fmt(farmOrder(p, c).quantity), crop: farmCropName(c), grown: fmt(grownOf(p, c)) }));
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
    if (tier >= 2) { d.say(t('farm.stead.upgradeBest', '{name}: the best there is.', { name: farmUpgradeName(key, 1) })); return; }
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
        return tier >= 2 ? farmUpgradeName(key, 1) : tier > 0 ? `${farmUpgradeName(key, tier - 1)} · ${t('farm.stead.next', 'next: {name}', { name: farmUpgradeName(key, tier) })}` : t('farm.stead.next', 'next: {name}', { name: farmUpgradeName(key, tier) });
      }
      return {
        orderPost: t('farm.stead.postLabel', 'Order post · this week\'s notices'),
        wagon: t('farm.stead.wagonLabel', 'The factor\'s wagon'),
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
      if (id === 'orderPost') { d.say(notice(FARM_CROP_TYPES[postLine++ % FARM_CROP_TYPES.length])); return; }
      if (id === 'ledger') { d.say(ledger()); return; }
      if (id === 'wagon') { wagon(); return; }
      if (id === 'haystack') { d.say(t('farm.stead.hay', 'Sweet-smelling hay, stacked for the winter.')); return; }
      if (id === 'scarecrow') d.say(t('farm.stead.scarecrow', 'The scarecrow keeps its watch over the rows.'));
    },
  };
}
