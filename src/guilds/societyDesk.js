// @ts-check
// BUNNYFALL (2026-11-26, caverns): THE CARTOGRAPHERS' SOCIETY'S DESK - opened from its hall (guilds/bunnyServices.js),
// a choice box in the Favor shop's manner (scenes/tavernFavorShop.js). It reads the desk from the account service
// (server-account/src/society.js): the Survey Seals, the open contract and how much of its ore the Stores hold, or the
// day's offers; and it takes a contract, turns one in, or buys a ware from the shop's ladder (net/mine/societyLaw.js).
// Every number shown is the service's; nothing here decides.
import { SOCIETY_ORE_PACK, SOCIETY_WARES, societyBuyRefused, SOCIETY_KIT, SOCIETY_CONTRACT_REP } from '../net/mine/societyLaw.js';
import { t } from '../ui/textManager.js';

/** An ore's name for the desk: `metal:iron` -> `Iron Ore`, `ore:mithril` -> `Mithril Ore`. */
export const societyOreName = (/** @type {string} */ ore) => { const id = String(ore).split(':')[1] ?? ore; return t('society.ore', '{name} Ore', { name: `${id[0].toUpperCase()}${id.slice(1)}` }); };

/** The wares' and the kit's names, each its own literal key (the extractor reads them: tools/l10nExtract.mjs). */
const WARE_NAMES = Object.freeze({
  'title:prospector': () => t('society.ware.prospector', 'Prospector'), 'title:delver': () => t('society.ware.delver', 'Delver'),
  'title:deepwarden': () => t('society.ware.deepwarden', 'Deepwarden'), 'title:masteroftheseam': () => t('society.ware.masteroftheseam', 'Master of the Seam'),
  'aura:burningstair': () => t('society.ware.burningstair', 'The Burning Stair'),
});
const KIT_NAMES = Object.freeze({
  drill: () => t('society.kit.drill', 'Mining Drill'), fuel: () => t('society.kit.fuel', 'Drill Fuel'),
  lamp: () => t('society.kit.lamp', 'Mine Lamp'), rod: () => t('society.kit.rod', 'Survey Rod'),
});
const wareName = (/** @type {any} */ w) => WARE_NAMES[/** @type {keyof typeof WARE_NAMES} */ (w.id)]?.() ?? w.name;
const kitName = (/** @type {any} */ k) => KIT_NAMES[/** @type {keyof typeof KIT_NAMES} */ (k.id)]?.() ?? k.name;

const REFUSED = Object.freeze({
  'need-account': () => t('society.needAccount', 'The Society deals only with registered accounts.'),
  'has-contract': () => t('society.hasContract', 'Finish the contract you hold first.'),
  'not-offered': () => t('society.notOffered', 'That contract is no longer on offer.'),
  short: () => t('society.short', 'Your Stores do not hold enough of that ore yet. Only ore you gathered counts.'),
  'no-contract': () => t('society.noContract', 'You hold no contract.'),
  owned: () => t('society.owned', 'You already have that.'),
  ladder: () => t('society.ladder', 'The Society grants its titles in order. Earn the one before it first.'),
  'seals-short': () => t('society.sealsShort', 'You do not have enough Survey Seals.'),
  'gold-short': () => t('society.goldShort', 'You do not have enough gold.'),
  'marks-full': () => t('society.argentsFull', 'Your Imperial Argent balance is full.'),
  'kit-full': () => t('society.kitFull', 'You cannot carry more of that.'),
});

/**
 * @param {{ call: ((path: string, body?: any) => Promise<any>) | null, choose: (view: any) => void, stores?: (() => void) | null,
 *   kit?: ((body: any, gold: number) => Promise<any>) | null, gold?: (() => number) | null, gainRep?: ((n: number) => void) | null }} deps
 *   `kit` a mine kit bought for gold (a realm act), `gold` the purse, `gainRep` the Society's standing raised
 *   `call` the account service (`{ ok, data }` or `{ ok: false, error }`), null offline; `choose` the host's choice box;
 *   `stores` the Stores read again after a turn-in
 */
export function createSocietyDesk(deps) {
  let busy = false, shopping = false, kitting = false, selling = false, salePage = 0;
  const pendingSales = new Map();
  const words = (/** @type {any} */ r) => (REFUSED[/** @type {keyof typeof REFUSED} */ (r?.data?.error ?? r?.error)]?.() ?? t('society.failed', 'The Society could not do that just now.'));

  async function act(/** @type {string} */ path, /** @type {any} */ body, /** @type {(d: any) => string} */ done) {
    if (busy || !deps.call) return;
    busy = true;
    try {
      const r = await deps.call(path, body);
      if (path === '/v1/society/sell-ore' && (r?.ok || r?.data?.error)) pendingSales.delete(body.ore);
      if (r?.ok) {
        if (path === '/v1/society/turnin' || path === '/v1/society/sell-ore') deps.stores?.();
        if (path === '/v1/society/turnin') deps.gainRep?.(SOCIETY_CONTRACT_REP);
        await open(done(r.data));
      } else await open(words(r));
    } catch { await open(t('society.failed', 'The Society could not do that just now.')); } finally { busy = false; }
  }

  async function open(note = '') {
    if (!deps.call) { deps.choose({ lines: [t('society.heading', 'The Cartographers’ Society'), t('society.online', 'Load an online realm character to take the Society’s contracts.')], options: [{ code: 'Escape', label: t('society.close', 'Leave'), action: () => {} }] }); return; }
    const r = await deps.call('/v1/society', {});
    if (!r?.ok) { deps.choose({ lines: [t('society.heading', 'The Cartographers’ Society'), words(r)], options: [{ code: 'Escape', label: t('society.close', 'Leave'), action: () => {} }] }); return; }
    const d = r.data, lines = [t('society.heading', 'The Cartographers’ Society'), note, t('society.seals', 'Survey Seals: {n}', { n: d.seals })].filter(Boolean);
    const options = [];
    if (selling) {
      const sales = d.oreSales ?? [];
      const pageSize = 5;
      salePage = Math.min(salePage, Math.max(0, Math.ceil(sales.length / pageSize) - 1));
      lines.push(t('society.oreSaleRules', 'Sell {n} gathered ore at a time. Iron pays 1 Argent per pack. Rarer ores pay more.', { n: SOCIETY_ORE_PACK }));
      if (!sales.length) lines.push(t('society.noOrePacks', 'Your Stores have no full packs of gathered ore to sell.'));
      sales.slice(salePage * pageSize, (salePage + 1) * pageSize).forEach((/** @type {any} */ row, /** @type {number} */ i) => {
        options.push({
          code: `Digit${i + 1}`,
          label: t('society.sellOrePack', 'Sell {n} {ore} for {argents, plural, one {# Argent} other {# Argents}} ({held} held)', { n: SOCIETY_ORE_PACK, ore: societyOreName(row.ore), argents: row.argents, held: row.held }),
          action: () => {
            if (busy) return;
            const txn = pendingSales.get(row.ore) ?? globalThis.crypto.randomUUID();
            pendingSales.set(row.ore, txn);
            void act('/v1/society/sell-ore', { ore: row.ore, txn }, (x) => t('society.oreSold', 'Sold {n} {ore} for {argents, plural, one {# Argent} other {# Argents}}.', { n: x.n, ore: societyOreName(x.ore), argents: x.argents }));
          },
        });
      });
      if (salePage > 0) options.push({ code: 'KeyP', label: t('society.orePrevious', 'P - Previous ores'), action: () => { salePage--; void open(); } });
      if ((salePage + 1) * pageSize < sales.length) options.push({ code: 'KeyN', label: t('society.oreNext', 'N - Next ores'), action: () => { salePage++; void open(); } });
      options.push({ code: 'KeyC', label: t('society.backContracts', 'C - Contracts'), action: () => { selling = false; void open(); } });
    } else if (kitting) {
      // THE MINE KIT, for gold (the Society's tools: the spec's section 3)
      const k = d.kit ?? {};
      lines.push(t('society.kitHeld', 'You hold: drill {drill}, fuel {fuel}, lamps {lamp}, Survey Rod {rod}.', { drill: k.drill ?? 0, fuel: k.fuel ?? 0, lamp: k.lamp ?? 0, rod: k.rod ?? 0 }));
      lines.push(t('society.kitRules', 'A drill needs a Drill Fuel each shift. A Mine Lamp lights a chamber and keeps strays out. The Survey Rod tells sound rock from weak.'));
      SOCIETY_KIT.forEach((kit, i) => {
        const owned = kit.owned && (k[kit.id] ?? 0) > 0;
        options.push({ code: `Digit${i + 1}`, label: `${kitName(kit)}${kit.per > 1 ? ` x${kit.per}` : ''} - ${kit.gold} ${t('society.goldWord', 'gold')}${owned ? t('society.markOwned', ' (yours)') : ''}`, action: () => { void buyKit(kit); } });
      });
      options.push({ code: 'KeyC', label: t('society.backContracts', 'C - Contracts'), action: () => { kitting = false; void open(); } });
    } else if (shopping) {
      lines.push(t('society.shopRules', 'Titles are granted in order. The Burning Stair stands apart.'));
      SOCIETY_WARES.forEach((w, i) => {
        const why = societyBuyRefused(w.id, d.wares, d.seals);
        const mark = why === 'owned' ? t('society.markOwned', ' (yours)') : why === 'ladder' ? t('society.markLadder', ' (earn the one before)') : '';
        options.push({ code: `Digit${i + 1}`, label: `${wareName(w)} - ${w.seals} ${t('society.sealsWord', 'Seals')}${mark}`, action: () => { void act('/v1/society/buy', { ware: w.id }, () => t('society.bought', 'The Society grants you {name}.', { name: w.name })); } });
      });
      options.push({ code: 'KeyC', label: t('society.backContracts', 'C - Contracts'), action: () => { shopping = false; void open(); } });
    } else if (d.contract) {
      const c = d.contract;
      lines.push(t('society.contract', 'Your contract: deliver {n} {ore} for {seals} Survey Seals.', { n: c.n, ore: societyOreName(c.ore), seals: c.seals }));
      lines.push(t('society.held', 'Your Stores hold {held} of it.', { held: c.held }));
      options.push({ code: 'KeyT', label: t('society.turnIn', 'T - Turn in the contract'), action: () => { void act('/v1/society/turnin', {}, (x) => t('society.paid', 'The Society takes {n} {ore} and pays {paid} Survey Seals.', { n: x.n, ore: societyOreName(x.ore), paid: x.paid })); } });
    } else {
      lines.push(t('society.offersHead', 'Today the Society needs:'));
      d.offers.forEach((/** @type {any} */ o, /** @type {number} */ i) => options.push({
        code: `Digit${i + 1}`, label: t('society.offer', '{n} {ore} - {seals} Survey Seals', { n: o.n, ore: societyOreName(o.ore), seals: o.seals }),
        action: () => { void act('/v1/society/take', { ore: o.ore }, (x) => t('society.taken', 'Contract taken: deliver {n} {ore}. Any ore you gather counts, in the wilds or in a mine.', { n: x.contract.n, ore: societyOreName(x.contract.ore) })); },
      }));
    }
    if (!shopping && !kitting && !selling) {
      if (Array.isArray(d.oreSales)) options.push({ code: 'KeyO', label: t('society.oreShop', 'O - Sell ore packs for Argents'), action: () => { selling = true; salePage = 0; void open(); } });
      options.push({ code: 'KeyS', label: t('society.shop', 'S - Spend Survey Seals'), action: () => { shopping = true; void open(); } });
      options.push({ code: 'KeyG', label: t('society.kitShop', 'G - Buy mine kit for gold'), action: () => { kitting = true; void open(); } });
    }
    options.push({ code: 'Escape', label: t('society.close', 'Leave'), action: () => { shopping = false; kitting = false; selling = false; } });
    deps.choose({ lines, options });
  }
  /** A kit bought for gold: the purse checked here first, the realm act the service's word. */
  async function buyKit(/** @type {any} */ kit) {
    if (busy) return;
    if (!deps.kit) { await open(t('society.online', 'Load an online realm character to take the Society’s contracts.')); return; }
    if ((deps.gold?.() ?? 0) < kit.gold) { await open(REFUSED['gold-short']()); return; }
    busy = true;
    try {
      const r = await deps.kit({ kit: kit.id, txn: globalThis.crypto.randomUUID() }, kit.gold);
      busy = false;
      await open(r?.ok ? t('society.kitBought', 'Bought: {name}.', { name: kit.name }) : r?.unknown ? t('society.kitRetry', 'The answer was lost. Look at your kit before buying again.') : words(r));
    } catch { busy = false; await open(t('society.failed', 'The Society could not do that just now.')); }
  }
  return { open: () => { shopping = false; kitting = false; selling = false; return open(); } };
}
