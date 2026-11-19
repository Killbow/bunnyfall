// @ts-check
// BUNNYFALL FARM EXPANSION, PHASE 7 (docs/FARM-EXPANSION.md section 9): MARKET DAY ON THE FARM - what the stalls and the
// judging tables do when clicked, in the HUD's message line and DFU's own choice boxes (money and Company goods only move
// behind one). The law is net/farm/marketLaw.js; the service (server-account/src/farmMarkets.js) judges every act. This
// holds the last read of the farm's market and speaks it. Pure but for the doors it is handed.
import { t } from '../../systems/textManager.js';
import { farmCropName } from '../../ui/farmingHud.js';
import { MARKET_FIXTURES } from '../../world/farm/farmstead.js';
import { marketToday, marketTomorrow, marketWeekday, MARKET_STALLS, STALL_LOT, BUY_MAX, stallPrice, saleOf, CONTESTS, RIBBON_WORK } from '../../net/farm/marketLaw.js';
import { contentAt } from '../../net/farm/herdLaw.js';

const fmt = (n) => Number(n).toLocaleString('en-US');
/** A stall's material in words ('food:corn' is corn). */
export const materialName = (m) => { const id = String(m).replace(/^food:/, ''), crop = { sunseed: 'sunflower', root: 'root' }[id] ?? id; return farmCropName(crop) ?? id; };
const contestName = (c) => ({ sheaf: t('farm.market.sheaf', 'the heaviest sheaf'), show: t('farm.market.show', 'best in show') })[c] ?? c;
const ribbonName = (r) => ({ blue: t('farm.market.blue', 'blue'), red: t('farm.market.red', 'red'), white: t('farm.market.white', 'white') })[r] ?? r;
const WEEKDAYS = () => [t('farm.market.d0', 'Morndas'), t('farm.market.d1', 'Tirdas'), t('farm.market.d2', 'Middas'), t('farm.market.d3', 'Turdas'), t('farm.market.d4', 'Fredas'), t('farm.market.d5', 'Loredas'), t('farm.market.d6', 'Sundas')];

/** What a refusal of the market says. */
export const marketRefusal = (error) => ({
  'farm-market-closed': t('farm.market.closed', 'The market has closed.'),
  'farm-market-bad': t('farm.market.bad', 'That cannot be done at the market.'),
  'farm-market-rate': t('farm.market.rate', 'Slow down a little: the market is busy.'),
  'farm-market-stores': t('farm.market.noStores', 'The Company Stores do not hold that much to put out.'),
  'farm-market-full': t('farm.market.full', 'That stall holds as much as it can, or sells something else.'),
  'farm-market-sold': t('farm.market.sold', 'Someone was quicker: that is sold.'),
  'farm-market-stores-full': t('farm.market.storesFull', 'Your Stores are full of that.'),
  'farm-market-contest': t('farm.market.noContest', 'The market holds no such contest today.'),
  'farm-market-late': t('farm.market.late', 'The judge is already walking the tables. Too late to enter.'),
  'farm-market-entry': t('farm.market.noEntry', 'You have nothing to enter: a ripe crop, an animal, or a crop in your Stores.'),
  'farm-market-entered': t('farm.market.entered', 'That is already entered.'),
  'farm-market-members': t('farm.market.membersOnly', 'Only the Company\'s own may lead its animals into the ring.'),
  'farm-market-nothing': t('farm.market.nothing', 'The pot owes you nothing.'),
  'homes-need-account': t('farm.market.account', 'Only a linked account can trade at a market.'),
  'realm-needed': t('farm.market.realm', 'Buying needs a character on the realm\'s record.'),
  'realm-only': t('farm.market.realm', 'Buying needs a character on the realm\'s record.'),
  'realm-gold': t('farm.market.gold', 'You do not have the gold.'),
  gold: t('farm.market.gold', 'You do not have the gold.'),
  offline: t('farm.market.offline', 'The market could not be reached.'),
})[error];

/**
 * @param {{ mapId: () => number, now: () => number, garden: () => any, mine: () => boolean, say: (s: string) => void,
 *   ask: (lines: string[], options: { code: string, label: string, action: () => void }[]) => void, call: (body: any) => Promise<any>, busy: () => boolean }} d
 */
export function createMarketActs(d) {
  /** @type {any} */ let data = null;
  let nextAt = 0, lastRead = 0, reading = false, working = false, announced = '';
  const today = () => marketToday(d.mapId(), d.now());
  const stallOf = (slot) => data?.stalls?.find((s) => s.slot === slot) ?? null;

  async function read() {
    if (reading || working) return;
    reading = true;
    const id = d.mapId();
    try {
      const r = await d.call({ op: 'read' });
      if (id !== d.mapId()) return;
      if (r?.ok && r.data) {
        data = r.data;
        // a ribbon won at the last judging, said once
        const won = (data.results ?? []).filter((x) => x.mine);
        const key = won.map((x) => `${x.day}${x.contest}${x.ribbon}`).join();
        if (won.length && key !== announced) {
          announced = key;
          d.say(t('farm.market.won', 'The judge pins a {ribbon} ribbon on you for {contest}. That is {work} farm work.', { ribbon: ribbonName(won[0].ribbon), contest: contestName(won[0].contest), work: RIBBON_WORK[won[0].ribbon] }));
        }
      }
    } catch { /* read again */ } finally { reading = false; lastRead = Date.now(); nextAt = lastRead + (today() ? 4000 : 30000); }
  }
  async function act(body, done) {
    if (working || d.busy()) return;
    working = true;
    try {
      const r = await d.call(body);
      if (r?.ok) done?.(r.data ?? r);
      else d.say(marketRefusal(r?.error) ?? t('farm.market.failed', 'The market could not do that just now.'));
    } catch { d.say(t('farm.market.failed', 'The market could not do that just now.')); }
    finally { working = false; nextAt = 0; }
  }

  const stallLevel = (slot) => { const s = stallOf(slot); return !s || s.qty <= 0 ? 0 : s.qty >= STALL_LOT * 2 ? 2 : 1; };
  const tableIndex = (id) => Number(id.slice(5));
  const contestAt = (id) => (data?.contests ?? [])[tableIndex(id)] ?? null;

  return {
    isMarketId: (/** @type {string} */ id) => MARKET_FIXTURES.includes(id),
    /** A farm left: what was read of its market goes. */
    reset() { data = null; nextAt = 0; announced = ''; },
    /** Whether the farm holds its market today. */
    open: () => !!today(),
    /** Called each frame while the player is in Farming Mode: reads the market on its own beat. */
    poll() { if (!reading && !working && (Date.now() >= nextAt || (today() && !data?.market && Date.now() - lastRead >= 1500))) read(); },
    /** The parts the market green shows: the day, and each stall's stock. */
    flags() {
      if (!today()) return {};
      const out = { market: 1 };
      for (let i = 0; i < MARKET_STALLS; i++) out[`s${i}`] = stallLevel(i);
      return out;
    },
    /** The order post's extra notice: tomorrow's market, today's, the last judging. */
    postNote() {
      const day = WEEKDAYS()[marketWeekday(d.mapId())];
      if (today()) return t('farm.market.postToday', 'Market day on the green today! Stalls, and the judging at dusk.');
      if (marketTomorrow(d.mapId(), d.now())) return t('farm.market.postTomorrow', 'Market at this farm tomorrow. Members: stock the stalls.');
      const last = (data?.results ?? []).find((r) => r.ribbon === 'blue');
      return last
        ? t('farm.market.postLast', 'Market here is on {day}s. Last market, {contest}: the blue ribbon went to {name}.', { day, contest: contestName(last.contest), name: last.name })
        : t('farm.market.postDay', 'Market here is on {day}s.', { day });
    },
    label(/** @type {string} */ id) {
      if (id.startsWith('stall')) {
        const s = stallOf(Number(id.slice(5)));
        if (!s || s.qty <= 0) return d.mine() ? t('farm.market.stallEmpty', 'An empty stall · click to stock it from the Stores') : t('farm.market.stallBare', 'An empty stall');
        return t('farm.market.stallLine', '{n} {name} at {gold} gold · click to buy', { n: s.qty, name: materialName(s.material), gold: s.price });
      }
      const c = contestAt(id), n = (data?.entries ?? []).filter((e) => e.contest === c).length;
      return c ? t('farm.market.tableLine', 'Judging table · {contest} · {n} entered', { contest: contestName(c), n }) : t('farm.market.tableNone', 'A judging table, bare today');
    },
    use(/** @type {string} */ id) {
      if (!today()) return;
      if (!data?.market) { d.say(t('farm.market.reading', 'The stallholders are laying out their goods...')); nextAt = 0; return; }
      if (id.startsWith('stall')) { stall(Number(id.slice(5))); return; }
      table(id);
    },
  };

  /** A stall clicked: a member stocks it from the Stores, a visitor buys. */
  function stall(slot) {
    const s = stallOf(slot);
    if (s && s.qty > 0) {
      const price = stallPrice(s.material), name = materialName(s.material);
      /** @type {{ code: string, label: string, action: () => void }[]} */
      const options = [{ code: 'KeyY', label: t('farm.market.buyOne', 'Y: buy one ({gold} gold)', { gold: fmt(saleOf(s.material, 1).cost) }), action: () => buy(slot, s.material, 1) }];
      if (s.qty >= 5) options.push({ code: 'KeyF', label: t('farm.market.buyFive', 'F: buy five ({gold} gold)', { gold: fmt(saleOf(s.material, Math.min(5, BUY_MAX)).cost) }), action: () => buy(slot, s.material, Math.min(5, BUY_MAX)) });
      options.push({ code: 'KeyN', label: t('farm.stead.no', 'N: no'), action: () => {} });
      if (d.mine() && data.stores?.length) options.splice(options.length - 1, 0, { code: 'KeyS', label: t('farm.market.stockMore', 'S: stock more'), action: () => stockChoice(slot) });
      d.ask([t('farm.market.buyAsk', '{name}, {gold} gold each, {n} left. The gold goes to the Company that grew it.', { name, gold: price, n: s.qty })], options);
      return;
    }
    if (!d.mine()) { d.say(t('farm.market.stallBareSay', 'Nothing on this stall yet.')); return; }
    stockChoice(slot);
  }
  function stockChoice(slot) {
    const stores = (data.stores ?? []).slice(0, 4);
    if (!stores.length) { d.say(t('farm.market.noStock', 'The Company Stores hold nothing for the market: grow some food.')); return; }
    /** @type {{ code: string, label: string, action: () => void }[]} */
    const options = stores.map((m, i) => ({ code: `Digit${i + 1}`, label: t('farm.market.stockOption', '{k}: {n} {name} ({have} in the Stores, {gold} gold each)', { k: i + 1, n: Math.min(STALL_LOT, m.qty), name: materialName(m.material), have: fmt(m.qty), gold: stallPrice(m.material) }),
      action: () => act({ op: 'stock', slot, material: m.material, qty: Math.min(STALL_LOT, m.qty) }, () => d.say(t('farm.market.stocked', 'You set {name} out on the stall.', { name: materialName(m.material) }))) }));
    options.push({ code: 'KeyN', label: t('farm.stead.no', 'N: no'), action: () => {} });
    d.ask([t('farm.market.stockAsk', 'Put a lot out on this stall from the Company Stores?')], options);
  }
  function buy(slot, material, qty) {
    act({ op: 'buy', slot, material, qty }, (r) => d.say(t('farm.market.bought', 'You buy {n} {name} for {gold} gold. They wait in your Stores.', { n: qty, name: materialName(material), gold: fmt(r.bought?.cost ?? saleOf(material, qty).cost) })));
  }

  /** A judging table clicked: collect what the pot owes, or enter the contest. */
  function table(id) {
    if (data.prize > 0) {
      d.ask([t('farm.market.prizeAsk', 'The prize pot owes you {gold} gold. Take it?', { gold: fmt(data.prize) })], [
        { code: 'KeyY', label: t('farm.stead.yes', 'Y: yes'), action: () => act({ op: 'collect' }, (r) => d.say(t('farm.market.prizeTaken', 'The judge counts {gold} gold into your hand.', { gold: fmt(r.gold) }))) },
        { code: 'KeyN', label: t('farm.market.laterWord', 'N: later'), action: () => {} },
      ]);
      return;
    }
    const contest = contestAt(id);
    if (!contest || !CONTESTS.includes(contest)) { d.say(t('farm.market.noTable', 'The judge has no use for this table today.')); return; }
    if ((data.entries ?? []).some((e) => e.contest === contest && e.mine)) { d.say(t('farm.market.already', 'You have entered {contest}. The judge walks the tables at dusk.', { contest: contestName(contest) })); return; }
    if (contest === 'show') {
      if (!d.mine()) { d.say(marketRefusal('farm-market-members')); return; }
      const herd = [...(d.garden()?.herd ?? [])].sort((a, b) => contentAt(b, d.now()) - contentAt(a, d.now())).slice(0, 4);
      if (!herd.length) { d.say(t('farm.market.noAnimals', 'The farm has no animal to lead into the ring.')); return; }
      /** @type {{ code: string, label: string, action: () => void }[]} */
      const options = herd.map((a, i) => ({ code: `Digit${i + 1}`, label: t('farm.market.showOption', '{k}: {name} ({content} content)', { k: i + 1, name: a.name, content: Math.round(contentAt(a, d.now())) }),
        action: () => act({ op: 'enter', contest, animal: a.id }, () => d.say(t('farm.market.ledIn', 'You lead {name} into the ring.', { name: a.name }))) }));
      options.push({ code: 'KeyN', label: t('farm.stead.no', 'N: no'), action: () => {} });
      d.ask([t('farm.market.showAsk', 'Enter {contest}: which animal do you lead in? The happier, the better its chance.', { contest: contestName(contest) })], options);
      return;
    }
    d.ask([d.mine() ? t('farm.market.sheafAskMine', 'Enter {contest}: your best ripe bed\'s crop, judged on its care and strain?', { contest: contestName(contest) })
      : t('farm.market.sheafAskVisit', 'Enter {contest} with a crop from your Stores?', { contest: contestName(contest) })], [
      { code: 'KeyY', label: t('farm.stead.yes', 'Y: yes'), action: () => act({ op: 'enter', contest }, () => d.say(t('farm.market.sheafIn', 'Your sheaf is set on the table.'))) },
      { code: 'KeyN', label: t('farm.stead.no', 'N: no'), action: () => {} },
    ]);
  }
}
