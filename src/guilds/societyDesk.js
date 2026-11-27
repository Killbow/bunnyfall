// @ts-check
// The Society's hall and account services share one window.
import { SOCIETY_ORE_PACK, SOCIETY_WARES, societyBuyRefused, SOCIETY_KIT, SOCIETY_CONTRACT_REP } from '../net/mine/societyLaw.js';
import { t } from '../ui/textManager.js';
import { registerOverlay } from '../ui/enhancedOverlays.js';

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

const STYLE = `
.society-backdrop{position:fixed;inset:0;z-index:13;display:grid;place-items:center;padding:clamp(8px,3vw,36px);background:#080b0bd9;pointer-events:auto}
.society-modal{width:min(900px,100%);max-height:100%;display:flex;flex-direction:column;overflow:hidden;background:#1b2020;color:#f2e8d3;border:1px solid #817352;border-radius:12px;box-shadow:0 18px 70px #000b;font:15px/1.45 system-ui,sans-serif;color-scheme:dark}
.society-modal *{box-sizing:border-box}
.society-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:20px clamp(14px,4vw,30px) 14px;background:#232b29}
.society-modal h1,.society-modal h2,.society-modal h3,.society-modal p{margin:0}
.society-modal h1{font:600 clamp(22px,4vw,32px)/1.16 Georgia,serif}
.society-wallet{margin-top:7px;color:#e9ca86;font-variant-numeric:tabular-nums}
.society-nav{display:flex;flex-wrap:wrap;gap:5px;padding:8px clamp(14px,4vw,30px);border-block:1px solid #4c4c3f}
.society-modal button{cursor:pointer;padding:7px 11px;border:1px solid #807154;border-radius:5px;color:inherit;background:#33362e;font:inherit}
.society-nav button{border-color:transparent;background:none}
.society-nav button[aria-current=page]{background:#444b3a;border-color:#8f8c64}
.society-modal button:hover:not(:disabled){background:#4c4e3d}
.society-modal button:focus-visible{outline:2px solid #f1cf88;outline-offset:2px}
.society-modal button:disabled{opacity:.58;cursor:default}
.society-main{overflow:auto;overscroll-behavior:contain;min-height:min(360px,45vh);padding:18px clamp(14px,4vw,30px) 24px;display:grid;gap:10px;align-content:start}
.society-modal h2{font:600 24px/1.2 Georgia,serif}
.society-row{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:9px 16px;padding:12px 14px;background:#272c29;border:1px solid #41463a;border-radius:6px}
.society-row h3{font-size:16px}
.society-row p,.society-hint{color:#cfc5b2}
.society-status{padding:8px clamp(14px,4vw,30px);border-top:1px solid #4c4c3f;color:#f1cf88}
.society-status:empty{display:none}
`;

const TABS = /** @type {const} */ ([
  ['hall', () => t('society.tabHall', 'Guild hall')],
  ['contracts', () => t('society.tabContracts', 'Contracts')],
  ['kit', () => t('society.tabKit', 'Mine kit')],
  ['rewards', () => t('society.tabRewards', 'Rewards')],
  ['sales', () => t('society.tabSales', 'Ore sales')],
]);

/**
 * @param {{ call: ((path: string, body?: any) => Promise<any>) | null,
 *   kit?: ((body: any, gold: number) => Promise<any>) | null, gold: () => number, stores?: (() => void) | null,
 *   gainRep?: ((n: number) => void) | null }} deps
 */
export function createSocietyDesk(deps) {
  const pendingSales = new Map();
  let active = /** @type {{ dispose: () => void } | null} */ (null);
  const words = (/** @type {any} */ r) => REFUSED[/** @type {keyof typeof REFUSED} */ (r?.data?.error ?? r?.error)]?.() ?? t('society.failed', 'The Society could not do that just now.');

  /** @param {(show: (view: { lines: string[], options: any[] }) => void) => void} hall */
  function open(hall) {
    if (typeof document === 'undefined') return null;
    active?.dispose();
    let done = false, busy = false, loading = !!deps.call;
    let tab = /** @type {typeof TABS[number][0]} */ (deps.call ? 'contracts' : 'hall');
    let data = /** @type {any} */ (null), failure = '';
    let hallView = /** @type {{lines: string[], options: any[]}} */ ({ lines: [], options: [] });
    const previousFocus = document.activeElement;
    const el = (/** @type {string} */ tag, text = '', cls = '') => {
      const node = document.createElement(tag);
      if (text) node.textContent = text;
      if (cls) node.className = cls;
      return node;
    };
    const button = (/** @type {string} */ label, /** @type {() => void} */ action, disabled = false) => {
      const node = /** @type {HTMLButtonElement} */ (el('button', label));
      node.type = 'button';
      node.disabled = disabled;
      node.onclick = action;
      return node;
    };

    const root = el('div', '', 'society-backdrop');
    const modal = el('section', '', 'society-modal');
    const title = el('h1', t('society.heading', 'The Cartographers’ Society'));
    title.id = 'society-desk-title';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', title.id);
    const header = el('header', '', 'society-header');
    const heading = el('div'), wallet = el('p', '', 'society-wallet');
    heading.append(title, wallet);
    const closeButton = button(t('society.closeModal', 'Close'), close);
    header.append(heading, closeButton);
    const nav = el('nav', '', 'society-nav');
    nav.setAttribute('aria-label', title.textContent ?? '');
    const body = el('div', '', 'society-main');
    const status = el('div', '', 'society-status');
    status.setAttribute('role', 'status');
    modal.append(header, nav, body, status);
    root.append(el('style', STYLE), modal);

    function close() {
      if (done) return;
      done = true;
      unregister();
      globalThis.removeEventListener('keydown', onKey, true);
      root.remove();
      if (active === windowOverlay) active = null;
      if (previousFocus instanceof globalThis.HTMLElement && previousFocus.isConnected) previousFocus.focus();
    }

    function onKey(/** @type {KeyboardEvent} */ event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      else if (event.key === 'Tab') {
        const buttons = /** @type {HTMLButtonElement[]} */ ([...modal.querySelectorAll('button:not(:disabled)')]);
        const index = buttons.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
        buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus();
        event.preventDefault();
        event.stopImmediatePropagation();
      } else event.stopPropagation();
    }

    const windowOverlay = {
      isChoiceWindow: true,
      get done() { return done; },
      input() {}, click() {}, wheel() {}, hover() {}, tick() {}, draw() {},
      dispose: close,
    };
    globalThis.addEventListener('keydown', onKey, true);
    const unregister = registerOverlay(close);
    active = windowOverlay;
    document.body.append(root);
    const tabs = TABS.map(([id, label]) => {
      const node = button(label(), () => { tab = id; render(); });
      nav.append(node);
      return { id, node };
    });

    function hint(/** @type {string} */ text) { body.append(el('p', text, 'society-hint')); }
    function row(/** @type {string} */ name, /** @type {string} */ detail, /** @type {string} */ label, /** @type {() => void} */ action, disabled = false) {
      const item = el('div', '', 'society-row'), info = el('div');
      info.append(el('h3', name));
      if (detail) info.append(el('p', detail));
      item.append(info, button(label, action, busy || disabled));
      body.append(item);
    }

    async function load() {
      if (!deps.call) return;
      loading = true;
      try {
        const response = await deps.call('/v1/society', {});
        if (response?.ok) { data = response.data; failure = ''; }
        else failure = words(response);
      } catch { failure = words(null); }
      finally { loading = false; if (!done) render(); }
    }

    async function act(/** @type {string} */ path, /** @type {any} */ payload, /** @type {(d: any) => string} */ result, /** @type {number | null} */ gold = null) {
      if (done || busy || !deps.call) return;
      busy = true;
      status.textContent = t('society.working', 'Working…');
      render();
      try {
        const r = gold == null ? await deps.call(path, payload) : await deps.kit?.(payload, gold);
        if (path === '/v1/society/sell-ore' && (r?.ok || r?.data?.error)) pendingSales.delete(payload.ore);
        if (r?.ok) {
          if (path === '/v1/society/turnin' || path === '/v1/society/sell-ore') deps.stores?.();
          if (path === '/v1/society/turnin') { deps.gainRep?.(SOCIETY_CONTRACT_REP); if (!done) readHall(); }
          status.textContent = result(r.data);
          if (!done) await load();
        } else status.textContent = r?.unknown ? t('society.kitRetry', 'The answer was lost. Look at your kit before buying again.') : words(r);
      } catch { status.textContent = words(null); }
      finally { busy = false; if (!done) render(); }
    }

    function render() {
      const focused = document.activeElement;
      wallet.textContent = [data && t('society.seals', 'Survey Seals: {n}', { n: data.seals }), t('society.goldBalance', '{n} gold', { n: deps.gold() })].filter(Boolean).join(' · ');
      for (const { id, node } of tabs) {
        if (id === tab) node.setAttribute('aria-current', 'page');
        else node.removeAttribute('aria-current');
      }
      body.replaceChildren(el('h2', TABS.find(([id]) => id === tab)?.[1]?.() ?? title.textContent ?? ''));
      if (tab === 'hall') {
        for (const line of hallView.lines.filter(Boolean)) hint(line);
        const actions = el('div', '', 'society-row');
        for (const option of hallView.options) {
          if (!option.label || option.code === 'KeyG') continue;
          actions.append(button(option.label.replace(/^. - /, ''), () => { if (!done && !busy) option.action(); }, busy));
        }
        if (actions.childElementCount) body.append(actions);
      } else if (loading && !data) hint(t('society.loading', 'Loading the Society’s records…'));
      else if (failure) {
        hint(failure);
        body.append(button(t('society.retry', 'Try again'), () => { void load(); render(); }, loading));
      } else if (!data) hint(t('society.online', 'Load an online realm character to take the Society’s contracts.'));
      else if (tab === 'contracts') renderContracts();
      else if (tab === 'kit') renderKit();
      else if (tab === 'rewards') renderRewards();
      else renderSales();
      if (focused instanceof globalThis.HTMLElement && !focused.isConnected) tabs.find(({ id }) => id === tab)?.node.focus();
    }

    function renderContracts() {
      const c = data.contract;
      if (c) {
        row(t('society.contractTitle', 'Deliver {n} {ore}', { n: c.n, ore: societyOreName(c.ore) }),
          t('society.contractProgress', '{held} of {n} gathered · {seals} Survey Seals', { held: c.held, n: c.n, seals: c.seals }),
          t('society.deliver', 'Turn in'), () => { void act('/v1/society/turnin', {}, (x) => t('society.paid', 'The Society takes {n} {ore} and pays {paid} Survey Seals.', { n: x.n, ore: societyOreName(x.ore), paid: x.paid })); }, c.held < c.n);
      } else {
        for (const offer of data.offers ?? []) {
          row(t('society.contractTitle', 'Deliver {n} {ore}', { n: offer.n, ore: societyOreName(offer.ore) }),
            t('society.sealsReward', '{n} Survey Seals', { n: offer.seals }), t('society.accept', 'Accept contract'),
            () => { void act('/v1/society/take', { ore: offer.ore }, (x) => t('society.taken', 'Contract taken: deliver {n} {ore}. Any ore you gather counts, in the wilds or in a mine.', { n: x.contract.n, ore: societyOreName(x.contract.ore) })); });
        }
      }
    }

    function renderKit() {
      hint(t('society.kitRules', 'A drill needs a Drill Fuel each shift. A Mine Lamp lights a chamber and keeps strays out. The Survey Rod tells sound rock from weak.'));
      for (const kit of SOCIETY_KIT) {
        const held = data.kit?.[kit.id] ?? 0;
        const owned = kit.owned && held > 0;
        const label = owned ? t('society.ownedButton', 'Owned') : t('society.buyGold', 'Buy for {n} gold', { n: kit.gold });
        row(kitName(kit), t('society.kitStock', '{held} held · {n} per purchase', { held, n: kit.per }), label,
          () => { void act('/v1/society/kit', { kit: kit.id, txn: globalThis.crypto.randomUUID() }, () => t('society.kitBought', 'Bought: {name}.', { name: kitName(kit) }), kit.gold); },
          owned || !deps.kit || deps.gold() < kit.gold);
      }
    }

    function renderRewards() {
      for (const ware of SOCIETY_WARES) {
        const why = societyBuyRefused(ware.id, data.wares, data.seals);
        const label = why === 'owned' ? t('society.ownedButton', 'Owned') : t('society.redeem', 'Redeem');
        const price = t('society.sealsReward', '{n} Survey Seals', { n: ware.seals });
        const previous = SOCIETY_WARES.find((w) => w.id === ware.needs);
        const detail = why === 'ladder' && previous ? t('society.rewardRequires', '{price} · Requires {title}', { price, title: wareName(previous) }) : price;
        row(wareName(ware), detail, label, () => { void act('/v1/society/buy', { ware: ware.id }, () => t('society.bought', 'The Society grants you {name}.', { name: wareName(ware) })); }, !!why);
      }
    }

    function renderSales() {
      if (!Array.isArray(data.oreSales)) { hint(t('society.salesClosed', 'Ore sales are currently closed.')); return; }
      hint(t('society.oreSaleRules', 'Sell {n} gathered ore at a time. Each pack pays the ore market value, so rarer ores pay more.', { n: SOCIETY_ORE_PACK }));
      if (!data.oreSales.length) hint(t('society.noOrePacks', 'Your Stores have no full packs of gathered ore to sell.'));
      for (const sale of data.oreSales) {
        row(societyOreName(sale.ore), t('society.orePackStock', '{held} gathered in your Stores', { held: sale.held }),
          t('society.sellPack', 'Sell {n} for {argents, plural, one {# Argent} other {# Argents}}', { n: SOCIETY_ORE_PACK, argents: sale.argents }),
          () => {
            if (busy) return;
            const txn = pendingSales.get(sale.ore) ?? globalThis.crypto.randomUUID();
            pendingSales.set(sale.ore, txn);
            void act('/v1/society/sell-ore', { ore: sale.ore, txn }, (x) => t('society.oreSold', 'Sold {n} {ore} for {argents, plural, one {# Argent} other {# Argents}}.', { n: x.n, ore: societyOreName(x.ore), argents: x.argents }));
          });
      }
    }

    const readHall = () => hall((view) => { if (!done) { hallView = view; render(); } });
    readHall();
    closeButton.focus();
    void load();
    return windowOverlay;
  }
  return { open };
}
