// @ts-check
// BUNNYFALL (2026-11-05, Phase 5): THE ACCOUNT VAULT'S WINDOW - opened from the bank (scenes/worldModes.js openBank), in the
// Sigil Broker's own dress (ui/brokerWindow.js's sheet) like Nyx's: the vault's purse and shelf on top, the pack's pieces
// under them, each row with its Put in or Take out. Everything it shows and does is handed in (`deps`).
import { registerOverlay, closeOnOutsideTap } from './enhanced/enhancedOverlays.js';
import { overlayAction } from './input.js';
import { injectEnhancedStyle, injectEnhancedFonts } from './enhanced/enhancedStyle.js';
import { injectBrokerSkinStyle } from './brokerWindow.js';
import { itemLongName } from '../systems/item/itemInfo.js';
import { vaultWords } from '../net/accountVaultBook.js';
import { t } from '../systems/textManager.js';

/** @param {string} tag @param {string|null} [cls] @param {string|null} [text] */
const el = (tag, cls = null, text = null) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const VAULT_CSS = `
#avault .broker-body { display: block !important; overflow-y: auto !important; overflow-x: hidden !important; max-height: 70vh; padding: 0 16px 16px; }
#avault .broker-offers { display: flex !important; flex-direction: column !important; gap: 6px; margin: 0; padding: 0; list-style: none; grid-template-columns: none !important; }
#avault .broker-offer { display: grid !important; grid-template-columns: 1fr auto auto !important; align-items: center; gap: 10px; padding: 6px 12px; min-height: 0 !important; width: auto !important; }
#avault .broker-frame { display: none !important; }
#avault .broker-name { display: block !important; font-size: 15px; white-space: normal; }
#avault .broker-set { display: block !important; font-size: 12px; opacity: 0.8; }
#avault .av-head { display: block; margin: 14px 0 4px; font-variant: small-caps; letter-spacing: 0.12em; font-size: 15px; }
#avault .av-gold { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 6px 0; }
#avault .av-gold input { width: 110px; padding: 4px 6px; }
#avault .broker-buy { min-width: 84px; }
`;

/**
 * @param {{
 *   book: ReturnType<typeof import('../net/accountVaultBook.js').createAccountVaultBook>,
 *   pack: () => any[], carried: () => number, refuses: (it: any) => boolean,
 *   onClose?: (() => void) | null,
 * }} deps
 */
export function createAccountVaultOverlay(deps) {
  if (typeof document === 'undefined') return null;
  injectEnhancedStyle(); injectEnhancedFonts(); injectBrokerSkinStyle();
  if (!document.getElementById('avault-style')) { const st = document.createElement('style'); st.id = 'avault-style'; st.textContent = VAULT_CSS; document.head.append(st); }
  let fired = false, note = '', amount = '';
  const host = el('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:13;background:transparent;overflow:hidden';
  document.body.append(host);
  const shell = el('div', 'broker-shell'); shell.id = 'avault';
  shell.setAttribute('role', 'dialog'); shell.setAttribute('aria-label', 'Account vault');
  const win = el('div', 'broker-win'); shell.append(win);
  const head = el('header', 'broker-head');
  const title = el('div', 'broker-title');
  const noteLine = el('p', 'broker-note'); noteLine.setAttribute('aria-live', 'polite');
  title.append(el('h2', null, t('avault.title', 'Account vault')), el('p', 'broker-sub', t('avault.sub', 'Shared by every character on this account. Bound items stay with their character.')), noteLine);
  const purse = el('span', 'broker-purse');
  const closeBtn = el('button', 'act broker-close', t('avault.close', 'Close')); closeBtn.setAttribute('type', 'button');
  head.append(title, purse, closeBtn);
  const body = el('div', 'broker-body');
  win.append(head, body); host.append(shell);

  const run = async (p) => {
    const r = await p;
    note = r?.ok ? '' : vaultWords(r?.error);
    render();
    return r;
  };
  const rowOf = (name, sub, buttons) => {
    const li = el('li', 'broker-offer');
    const text = el('div', 'broker-offer-body');
    text.append(el('span', 'broker-name', name));
    if (sub) text.append(el('span', 'broker-set', sub));
    li.append(el('span', 'broker-frame'), text, ...buttons);
    return li;
  };
  const button = (label, act, disabled) => {
    const b = el('button', 'act broker-buy', label); b.setAttribute('type', 'button');
    if (disabled) b.setAttribute('disabled', '');
    b.onclick = (e) => { e.stopPropagation(); if (!disabled) act(); };
    return b;
  };
  function render() {
    if (fired) return;
    const v = deps.book.view;
    const busy = deps.book.busy;
    purse.textContent = t('avault.purse', 'Vault: {gold} gold', { gold: (v?.gold ?? 0).toLocaleString() });
    noteLine.textContent = note;
    if (!note) noteLine.setAttribute('hidden', ''); else noteLine.removeAttribute('hidden');
    for (const c of [...body.children]) c.remove();
    if (!v) { body.append(el('p', 'broker-sub', deps.book.error ? vaultWords(deps.book.error) : t('avault.reading', 'Reading the vault...'))); return; }
    // the purse
    body.append(el('div', 'av-head', t('avault.goldHead', 'Gold')));
    const g = el('div', 'av-gold');
    const input = el('input'); input.type = 'number'; input.min = '1'; input.placeholder = t('avault.amount', 'Amount'); input.value = amount;
    input.oninput = () => { amount = input.value; };
    input.onkeydown = (e) => e.stopPropagation();
    const n = () => Math.trunc(Number(amount));
    g.append(input, button(t('avault.deposit', 'Put in'), () => run(deps.book.deposit(n())), busy), button(t('avault.withdraw', 'Take out'), () => run(deps.book.withdraw(n())), busy));
    body.append(g);
    // the shelf
    body.append(el('div', 'av-head', t('avault.shelfHead', 'In the vault ({n} of {max})', { n: v.items.length, max: v.max })));
    const shelf = el('ul', 'broker-offers');
    if (!v.items.length) shelf.append(el('li', 'broker-sub', t('avault.empty', 'Nothing here yet.')));
    for (const it of v.items) {
      const label = it.rec?.group ? itemLongName(it.rec) : it.name;
      const btns = [button(t('avault.takeOut', 'Take out'), () => run(deps.book.take(it.slot)), busy)];
      if (it.count > 1) btns.unshift(button(t('avault.takeOne', 'Take 1'), () => run(deps.book.take(it.slot, 1)), busy));
      shelf.append(rowOf(it.count > 1 ? `${label} x${it.count}` : label, t('avault.by', 'Put in by {name}', { name: it.by }), btns));
    }
    body.append(shelf);
    // the pack
    body.append(el('div', 'av-head', t('avault.packHead', 'In your pack')));
    const pack = el('ul', 'broker-offers');
    const full = v.items.length >= v.max;
    for (const it of deps.pack()) {
      if (!it || it.equipped || it.isEquipped) continue;
      const no = deps.refuses(it);
      if (no) continue;
      const stack = Number.isSafeInteger(it.stackCount) && it.stackCount > 1 ? it.stackCount : 1;
      const btns = [button(t('avault.putIn', 'Put in'), () => run(deps.book.put(it)), busy || full)];
      if (stack > 1) btns.unshift(button(t('avault.putOne', 'Put 1'), () => run(deps.book.put(it, 1)), busy || full));
      pack.append(rowOf(stack > 1 ? `${itemLongName(it)} x${stack}` : itemLongName(it), null, btns));
    }
    body.append(pack);
  }
  const close = () => {
    if (fired) return;
    fired = true;
    unregister();
    globalThis.removeEventListener('keydown', onKey, { capture: true });
    offOutside();
    clearInterval(tick);
    host.remove();
    deps.onClose?.();
  };
  closeBtn.onclick = (e) => { e.stopPropagation(); close(); };
  const onKey = (/** @type {KeyboardEvent} */ e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target?.tagName === 'INPUT') { if (e.key === 'Escape') close(); return; }
    if (overlayAction(e) === 'back') { e.preventDefault(); e.stopPropagation(); close(); }
  };
  globalThis.addEventListener('keydown', onKey, { capture: true });
  const offOutside = closeOnOutsideTap(shell, '.broker-win', close);
  const unregister = registerOverlay(close);
  // the pack and the shelf change under it: repainted a second, but never while a number is being typed
  const tick = setInterval(() => { if (document.activeElement?.tagName !== 'INPUT' || !body.contains(document.activeElement)) render(); }, 1000);
  render();
  deps.book.read().catch(() => null).then(() => render());
  return {
    isChoiceWindow: true,
    get done() { return fired; },
    input() { /* the window's own capture keydown owns the keyboard */ },
    click() { /* a fixed div over the canvas */ },
    wheel() { /* its list scrolls itself */ },
    hover() { /* its own :hover */ },
    tick() { /* its own clock repaints it */ },
    draw() { /* DOM, not canvas */ },
    dispose() { close(); },
    repaint() { render(); },
  };
}
