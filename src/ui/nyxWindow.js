// @ts-check
// BUNNYFALL (2026-11-04, Cromwark): NYX'S WINDOW - the event vendor at the Adventurers' Guild camp (scenes/cromwarkHost.js),
// in the Sigil Broker's own dress (ui/brokerWindow.js's sheet, its classes): her gear, her dyed garments and her two titles,
// each a row with its price in Nyx coins and a Buy that says why it cannot. The purse in the header, the last sale's word
// under it. Everything it shows and does is handed in (`deps`), so this file draws and asks, and never touches a pack.
import { registerOverlay, closeOnOutsideTap } from './enhanced/enhancedOverlays.js';
import { overlayAction } from './input.js';
import { injectEnhancedStyle, injectEnhancedFonts } from './enhanced/enhancedStyle.js';
import { injectBrokerSkinStyle } from './brokerWindow.js';
import { paintTitle, titleBadge } from './playerBadge.js';
import { t } from '../systems/textManager.js';

/** @param {string} tag @param {string|null} [cls] @param {string|null} [text] */
const el = (tag, cls = null, text = null) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** Nyx's own touch on the Broker's dress: the haze's purple. */
const NYX_CSS = `
#nyx-vendor .broker-win { border-color: #8a4dd6; box-shadow: 0 0 0 1px #3b1a66, 0 12px 40px rgba(40, 10, 70, 0.6); }
#nyx-vendor .broker-title h2 { color: #d4a8ff; }
#nyx-vendor .nyx-head { margin: 14px 0 4px; font-variant: small-caps; letter-spacing: 0.12em; color: #c79cff; }
#nyx-vendor .broker-price { color: #d4a8ff; }
#nyx-vendor .nyx-brief { opacity: 0.85; }
`;

/**
 * Open her window as an overlay for the host's slot (townTalk.showOverlay).
 * @param {{
 *   purse: () => number,
 *   gear: () => Array<{ id: string, name: string, brief: string, price: number }>,
 *   garments: () => Array<{ id: string, name: string, price: number }>,
 *   titles: () => Array<{ id: string, key: string, kind?: string, name: string, price: number, owned: boolean, worn: boolean, locked?: string | null }>,
 *   buy: (id: string) => { ok: boolean, text?: string | null },
 *   buyTitle: (id: string) => Promise<{ ok: boolean, text?: string | null }>,
 *   wearTitle: (id: string) => Promise<{ ok: boolean, text?: string | null }>,
 *   load?: (() => Promise<void>) | null, busy?: (() => boolean) | null, onClose?: (() => void) | null,
 * }} deps
 */
export function createNyxOverlay(deps) {
  if (typeof document === 'undefined') return null;
  injectEnhancedStyle(); injectEnhancedFonts(); injectBrokerSkinStyle();
  if (!document.getElementById('nyx-vendor-style')) { const st = document.createElement('style'); st.id = 'nyx-vendor-style'; st.textContent = NYX_CSS; document.head.append(st); }
  let fired = false;
  const host = el('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:13;background:transparent;overflow:hidden';
  document.body.append(host);
  const shell = el('div', 'broker-shell');
  shell.id = 'nyx-vendor';
  shell.setAttribute('role', 'dialog');
  shell.setAttribute('aria-label', 'Nyx');
  const win = el('div', 'broker-win');
  shell.append(win);
  const head = el('header', 'broker-head');
  const title = el('div', 'broker-title');
  const noteLine = el('p', 'broker-note');
  noteLine.setAttribute('aria-live', 'polite');
  title.append(el('h2', null, 'Nyx'), el('p', 'broker-sub', t('nyx.sub', 'Adventurers\' Guild camp · Trades in Nyx coins')), noteLine);
  const purse = el('span', 'broker-purse');
  const closeBtn = el('button', 'act broker-close', t('nyx.close', 'Close'));
  closeBtn.setAttribute('type', 'button');
  head.append(title, purse, closeBtn);
  const body = el('div', 'broker-body');
  win.append(head, body);
  host.append(shell);
  let note = null, pending = null;
  const coins = (n) => t('nyx.coins', '{n, plural, one {# Nyx coin} other {# Nyx coins}}', { n });
  const say = (r) => { note = { ok: !!r?.ok, text: r?.text ?? '' }; render(); };
  const row = (name, sub, price, label, act, disabled = false, sign = null) => {
    const li = el('li', 'broker-offer');
    const text = el('div', 'broker-offer-body');
    const nm = el('span', 'broker-name', name);
    if (sign) paintTitle(nm, titleBadge({ title: sign }));
    text.append(nm);
    if (sub) text.append(el('span', 'broker-set nyx-brief', sub));
    const b = el('button', 'act broker-buy', label);
    b.setAttribute('type', 'button');
    if (disabled) b.setAttribute('disabled', '');
    b.onclick = (e) => { e.stopPropagation(); if (!disabled) act(); };
    li.append(el('span', 'broker-frame'), text, el('span', 'broker-price', price), b);
    return li;
  };
  function render() {
    if (fired) return;
    const have = deps.purse();
    purse.textContent = coins(have);
    noteLine.textContent = note?.text ?? '';
    noteLine.className = `broker-note${note?.ok ? ' ok' : ''}`;
    if (!note?.text) noteLine.setAttribute('hidden', ''); else noteLine.removeAttribute('hidden');
    for (const c of [...body.children]) c.remove();
    const busy = !!pending || !!deps.busy?.();
    body.append(el('div', 'nyx-head', t('nyx.gearHead', 'Gear of the reach')));
    const g = el('ul', 'broker-offers');
    for (const o of deps.gear()) g.append(row(o.name, o.brief, coins(o.price), have >= o.price ? t('nyx.buy', 'Buy') : t('nyx.need', 'Need {n} more', { n: o.price - have }), () => say(deps.buy(o.id)), busy || have < o.price));
    body.append(g);
    body.append(el('div', 'nyx-head', t('nyx.garmentHead', 'Nyx-dyed garments')));
    const w = el('ul', 'broker-offers');
    for (const o of deps.garments()) w.append(row(o.name, t('nyx.garmentSub', 'Purple, bound to you'), coins(o.price), have >= o.price ? t('nyx.buy', 'Buy') : t('nyx.need', 'Need {n} more', { n: o.price - have }), () => say(deps.buy(o.id)), busy || have < o.price));
    body.append(w);
    body.append(el('div', 'nyx-head', t('nyx.titleHead2', 'Titles and aura (kept by your account)')));
    const ti = el('ul', 'broker-offers');
    for (const o of deps.titles()) {
      const label = pending === o.id ? t('nyx.buying', 'Buying...') : o.owned ? (o.worn ? t('nyx.takeOff', 'Take off') : t('nyx.wear', 'Wear')) : o.locked ? t('nyx.locked', 'Locked') : have >= o.price ? t('nyx.buy', 'Buy') : t('nyx.need', 'Need {n} more', { n: o.price - have });
      const act = () => {
        pending = o.id; render();
        (o.owned ? deps.wearTitle(o.id) : deps.buyTitle(o.id)).then((r) => { pending = null; say(r); }, () => { pending = null; render(); });
      };
      ti.append(row(o.name, o.locked ?? (o.kind === 'aura' ? t('nyx.auraSub', 'An aura: the purple haze drifting about you') : null), o.owned ? (o.worn ? t('nyx.worn', 'Worn') : t('nyx.owned', 'Owned')) : coins(o.price), label, act, busy || (!o.owned && (!!o.locked || have < o.price)), o.kind === 'aura' ? null : o.key));
    }
    body.append(ti);
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
    if (overlayAction(e) === 'back') { e.preventDefault(); e.stopPropagation(); close(); }
  };
  globalThis.addEventListener('keydown', onKey, { capture: true });
  const offOutside = closeOnOutsideTap(shell, '.broker-win', close);
  const unregister = registerOverlay(close);
  const tick = setInterval(render, 1000);
  render();
  if (deps.load) Promise.resolve().then(() => deps.load?.()).catch(() => null).then(() => render());
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
