// @ts-check
// BUNNYFALL (2026-11-26, caverns): THE CARTOGRAPHERS' SOCIETY'S DESK - opened from its hall (guilds/bunnyServices.js),
// a choice box in the Favor shop's manner (scenes/tavernFavorShop.js). It reads the desk from the account service
// (server-account/src/society.js): the Survey Seals, the open contract and how much of its ore the Stores hold, or the
// day's offers; and it takes a contract, turns one in, or buys a ware from the shop's ladder (net/mine/societyLaw.js).
// Every number shown is the service's; nothing here decides.
import { SOCIETY_WARES, societyBuyRefused } from '../net/mine/societyLaw.js';
import { t } from '../ui/textManager.js';

/** An ore's name for the desk: `metal:iron` -> `Iron Ore`, `ore:mithril` -> `Mithril Ore`. */
export const societyOreName = (/** @type {string} */ ore) => { const id = String(ore).split(':')[1] ?? ore; return t('society.ore', '{name} Ore', { name: `${id[0].toUpperCase()}${id.slice(1)}` }); };

const REFUSED = Object.freeze({
  'need-account': () => t('society.needAccount', 'The Society deals only with registered accounts.'),
  'has-contract': () => t('society.hasContract', 'Finish the contract you hold first.'),
  'not-offered': () => t('society.notOffered', 'That contract is no longer on offer.'),
  short: () => t('society.short', 'Your Stores do not hold enough of that ore yet. Only ore you gathered counts.'),
  'no-contract': () => t('society.noContract', 'You hold no contract.'),
  owned: () => t('society.owned', 'You already have that.'),
  ladder: () => t('society.ladder', 'The Society grants its titles in order. Earn the one before it first.'),
  'seals-short': () => t('society.sealsShort', 'You do not have enough Survey Seals.'),
});

/**
 * @param {{ call: ((path: string, body?: any) => Promise<any>) | null, choose: (view: any) => void, stores?: (() => void) | null }} deps
 *   `call` the account service (`{ ok, data }` or `{ ok: false, error }`), null offline; `choose` the host's choice box;
 *   `stores` the Stores read again after a turn-in
 */
export function createSocietyDesk(deps) {
  let busy = false, shopping = false;
  const words = (/** @type {any} */ r) => (REFUSED[/** @type {keyof typeof REFUSED} */ (r?.data?.error ?? r?.error)]?.() ?? t('society.failed', 'The Society could not do that just now.'));

  async function act(/** @type {string} */ path, /** @type {any} */ body, /** @type {(d: any) => string} */ done) {
    if (busy || !deps.call) return;
    busy = true;
    try {
      const r = await deps.call(path, body);
      if (r?.ok) { if (path === '/v1/society/turnin') deps.stores?.(); await open(done(r.data)); } else await open(words(r));
    } catch { await open(t('society.failed', 'The Society could not do that just now.')); } finally { busy = false; }
  }

  async function open(note = '') {
    if (!deps.call) { deps.choose({ lines: [t('society.heading', 'The Cartographers’ Society'), t('society.online', 'Load an online realm character to take the Society’s contracts.')], options: [{ code: 'Escape', label: t('society.close', 'Leave'), action: () => {} }] }); return; }
    const r = await deps.call('/v1/society', {});
    if (!r?.ok) { deps.choose({ lines: [t('society.heading', 'The Cartographers’ Society'), words(r)], options: [{ code: 'Escape', label: t('society.close', 'Leave'), action: () => {} }] }); return; }
    const d = r.data, lines = [t('society.heading', 'The Cartographers’ Society'), note, t('society.seals', 'Survey Seals: {n}', { n: d.seals })].filter(Boolean);
    const options = [];
    if (shopping) {
      lines.push(t('society.shopRules', 'Titles are granted in order. The Burning Stair stands apart.'));
      SOCIETY_WARES.forEach((w, i) => {
        const why = societyBuyRefused(w.id, d.wares, d.seals);
        const mark = why === 'owned' ? t('society.markOwned', ' (yours)') : why === 'ladder' ? t('society.markLadder', ' (earn the one before)') : '';
        options.push({ code: `Digit${i + 1}`, label: `${t(`society.ware.${w.id.replace(':', '.')}`, w.name)} - ${w.seals} ${t('society.sealsWord', 'Seals')}${mark}`, action: () => { void act('/v1/society/buy', { ware: w.id }, () => t('society.bought', 'The Society grants you {name}.', { name: w.name })); } });
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
    if (!shopping) options.push({ code: 'KeyS', label: t('society.shop', 'S - Spend Survey Seals'), action: () => { shopping = true; void open(); } });
    options.push({ code: 'Escape', label: t('society.close', 'Leave'), action: () => { shopping = false; } });
    deps.choose({ lines, options });
  }
  return { open: () => { shopping = false; return open(); } };
}
