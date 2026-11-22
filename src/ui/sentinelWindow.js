// @ts-check
// BUNNYFALL (2026-11-20): THE SENTINEL NOBLE'S WINDOW (scenes/sentinelHost.js). The cannon's dress (ui/cannonWindow.js) in the
// colours of Sentinel's banner: the bar with its two percentages (or, in the month's last days, none), and a row for every
// piece of arms and armor in the pack with a button for each side. A piece is given one at a time, so a good blade is never
// taken by a stray press. Everything is handed in (`deps`).
import { registerOverlay, closeOnOutsideTap } from './enhanced/enhancedOverlays.js';
import { overlayAction } from './input.js';
import { injectEnhancedStyle, injectEnhancedFonts } from './enhanced/enhancedStyle.js';
import { injectBrokerSkinStyle } from './brokerWindow.js';
import { t } from '../systems/textManager.js';

const el = (/** @type {string} */ tag, /** @type {string|null} */ cls = null, /** @type {string|null} */ text = null) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const CSS = `
#sentinel-noble .broker-win { border-color: #c0432f; box-shadow: 0 0 0 1px #4a1810, 0 12px 40px rgba(60, 12, 5, 0.6); }
#sentinel-noble .broker-title h2 { color: #f08a70; }
#sentinel-noble .broker-body { display: block !important; overflow-y: auto !important; overflow-x: hidden !important; max-height: 70vh; padding: 0 16px 16px; }
#sentinel-noble .sn-head { display: block; margin: 14px 0 4px; font-variant: small-caps; letter-spacing: 0.12em; color: #e9876a; font-size: 15px; }
#sentinel-noble .sn-bar { display: flex; height: 14px; border-radius: 7px; overflow: hidden; background: rgba(255,255,255,0.08); margin: 8px 0 2px; }
#sentinel-noble .sn-bar > i { display: block; height: 100%; }
#sentinel-noble .sn-stay { background: #d9573a; }
#sentinel-noble .sn-go { background: #5b86b8; }
#sentinel-noble .sn-legend { display: flex; justify-content: space-between; font-size: 14px; color: #fbe9d6; }
#sentinel-noble .broker-offers { display: flex !important; flex-direction: column !important; gap: 6px; margin: 0; padding: 0; list-style: none; grid-template-columns: none !important; }
#sentinel-noble .broker-offer { display: grid !important; grid-template-columns: 1fr auto auto !important; align-items: center; gap: 8px; padding: 8px 12px; min-height: 0 !important; width: auto !important; }
#sentinel-noble .broker-frame { display: none !important; }
#sentinel-noble .broker-name { display: block !important; color: #fbe9d6; font-size: 15px; white-space: normal; }
#sentinel-noble .broker-set { display: block !important; font-size: 13px; white-space: normal; opacity: 0.85; }
#sentinel-noble .broker-buy { min-width: 90px; }
#sentinel-noble .sn-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
`;

/**
 * @param {{
 *   name: string, title: string,
 *   status: () => ({ pct: { stay: number, leave: number } | null, dark: boolean, over: boolean, outcome: string | null, daysLeft: number, today: number, cap: number, given: number, tokens: number, donorAt: number } | null),
 *   pieces: () => Array<{ key: string, name: string }>,
 *   give: (key: string, side: 'stay' | 'leave') => Promise<{ ok: boolean, text?: string | null }>,
 *   shop: () => Array<{ id: string, name: string, price: number, note: string }>,
 *   buy: (id: string) => Promise<{ ok: boolean, text?: string | null }>,
 *   load?: (() => Promise<void>) | null, busy?: (() => boolean) | null, onClose?: (() => void) | null, why?: (() => string | null) | null,
 * }} deps
 */
export function createSentinelOverlay(deps) {
  if (typeof document === 'undefined') return null;
  injectEnhancedStyle(); injectEnhancedFonts(); injectBrokerSkinStyle();
  if (!document.getElementById('sentinel-noble-style')) { const st = document.createElement('style'); st.id = 'sentinel-noble-style'; st.textContent = CSS; document.head.append(st); }
  let closed = false, note = null, pending = null, lastAsk = Date.now();
  const host = el('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:13;background:transparent;overflow:hidden';
  document.body.append(host);
  const shell = el('div', 'broker-shell');
  shell.id = 'sentinel-noble';
  shell.setAttribute('role', 'dialog');
  shell.setAttribute('aria-label', deps.name);
  const win = el('div', 'broker-win');
  shell.append(win);
  const head = el('header', 'broker-head');
  const title = el('div', 'broker-title');
  const sub = el('p', 'broker-sub', deps.title);
  const noteLine = el('p', 'broker-note');
  noteLine.setAttribute('aria-live', 'polite');
  title.append(el('h2', null, deps.name), sub, noteLine);
  const closeBtn = el('button', 'act broker-close', t('sentinel.close', 'Close'));
  closeBtn.setAttribute('type', 'button');
  head.append(title, closeBtn);
  const body = el('div', 'broker-body');
  win.append(head, body);
  host.append(shell);

  function render() {
    if (closed) return;
    noteLine.textContent = note?.text ?? '';
    noteLine.className = `broker-note${note?.ok ? ' ok' : ''}`;
    if (!note?.text) noteLine.setAttribute('hidden', ''); else noteLine.removeAttribute('hidden');
    for (const c of [...body.children]) c.remove();
    const s = deps.status();
    if (!s) {
      body.append(el('p', 'broker-set', deps.why?.() ?? t('sentinel.loading', 'The envoy is counting the garrison...')));
      if (Date.now() - lastAsk > 5000) { lastAsk = Date.now(); Promise.resolve().then(() => deps.load?.()).catch(() => null); }
      return;
    }
    body.append(el('p', 'broker-set', t('sentinel.how',
      'The warriors of Sentinel have held this edge for years on no pay and thin rations. Give arms and armor, and choose: arm them to stay and press the war, or fit them for the road home. Every gift moves the bar. No one is told who gave what.')));
    if (s.over) {
      body.append(el('p', 'broker-set', s.outcome === 'stay' ? t('sentinel.overStay', 'The garrison has chosen to stay.') : s.outcome === 'leave' ? t('sentinel.overLeave', 'The garrison has gone home.') : t('sentinel.overDivided', 'The garrison has divided: some stay, some go.')));
    } else if (s.pct) {
      const bar = el('div', 'sn-bar'); const a = el('i', 'sn-stay'), b = el('i', 'sn-go'); a.style.width = `${s.pct.stay}%`; b.style.width = `${s.pct.leave}%`; bar.append(a, b);
      const lg = el('div', 'sn-legend');
      lg.append(el('span', null, t('sentinel.stayPct', 'Stay {pct}%', { pct: s.pct.stay })), el('span', null, t('sentinel.leavePct', 'Go home {pct}%', { pct: s.pct.leave })));
      body.append(bar, lg);
    } else {
      body.append(el('p', 'broker-set', t('sentinel.dark', 'The count is kept secret in the last days. The garrison decides in {n, plural, one {# day} other {# days}}.', { n: s.daysLeft })));
    }
    // THE COUNTER: pieces given of the hundred that earn the title and the aura, and the tokens they paid
    body.append(el('p', 'broker-set', s.given >= s.donorAt
      ? t('sentinel.counterDone', 'You have given {n} pieces: you are Sentinel’s Bannerbearer. Garrison Tokens: {tokens}.', { n: s.given, tokens: s.tokens })
      : t('sentinel.counter', 'You have given {n} of {at} pieces toward the title Sentinel’s Bannerbearer and its aura. Garrison Tokens: {tokens}.', { n: s.given, at: s.donorAt, tokens: s.tokens })));
    const busy = !!pending || !!deps.busy?.();
    if (!s.over) {
      body.append(el('p', 'broker-set', t('sentinel.left', 'You may give {n} more today.', { n: Math.max(0, s.cap - s.today) })));
      body.append(el('div', 'sn-head', t('sentinel.pieces', 'Your arms and armor')));
      const list = deps.pieces();
      if (!list.length) body.append(el('p', 'broker-set', t('sentinel.none', 'You carry no arms or armor to give. Gear you wear is kept back.')));
      else body.append(pieceList(list, s, busy));
    }
    body.append(el('div', 'sn-head', t('sentinel.shop', 'The garrison’s stores')));
    const shop = el('ul', 'broker-offers');
    for (const o of deps.shop()) {
      const li = el('li', 'broker-offer');
      const text = el('div', 'sn-body');
      text.append(el('span', 'broker-name', o.name), el('span', 'broker-set', o.note));
      const can = s.tokens >= o.price;
      const btn = el('button', 'act broker-buy', pending === `shop:${o.id}` ? t('sentinel.buying', 'Buying...') : t('sentinel.price', '{n} tokens', { n: o.price }));
      btn.setAttribute('type', 'button');
      if (busy || !can) btn.setAttribute('disabled', '');
      btn.onclick = (e) => {
        e.stopPropagation();
        if (busy || !can) return;
        pending = `shop:${o.id}`; render();
        deps.buy(o.id).then((res) => { pending = null; note = { ok: !!res?.ok, text: res?.text ?? '' }; render(); }, () => { pending = null; render(); });
      };
      li.append(el('span', 'broker-frame'), text, btn);
      shop.append(li);
    }
    body.append(shop);
  }
  /** The pack's arms and armor, a row each with a button for each side. */
  function pieceList(/** @type {Array<{ key: string, name: string }>} */ list, /** @type {any} */ s, /** @type {boolean} */ busy) {
    const ul = el('ul', 'broker-offers');
    for (const p of list) {
      const li = el('li', 'broker-offer');
      li.append(el('span', 'broker-frame'), el('span', 'broker-name', p.name));
      for (const [side, label] of /** @type {const} */ ([['stay', t('sentinel.giveStay', 'Stay')], ['leave', t('sentinel.giveLeave', 'Go home')]])) {
        const btn = el('button', 'act broker-buy', pending === `${p.key}:${side}` ? t('sentinel.giving', 'Giving...') : label);
        btn.setAttribute('type', 'button');
        if (busy || s.today >= s.cap) btn.setAttribute('disabled', '');
        btn.onclick = (e) => {
          e.stopPropagation();
          if (busy || s.today >= s.cap) return;
          pending = `${p.key}:${side}`; render();
          deps.give(p.key, side).then((res) => { pending = null; note = { ok: !!res?.ok, text: res?.text ?? '' }; render(); }, () => { pending = null; render(); });
        };
        li.append(btn);
      }
      ul.append(li);
    }
    return ul;
  }
  const close = () => {
    if (closed) return;
    closed = true;
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
    get done() { return closed; },
    input() { /* its own capture keydown */ },
    click() { /* a fixed div over the canvas */ },
    wheel() { /* its list scrolls itself */ },
    hover() { /* its own :hover */ },
    tick() { /* its own clock repaints it */ },
    draw() { /* DOM */ },
    dispose() { close(); },
    repaint() { render(); },
  };
}
