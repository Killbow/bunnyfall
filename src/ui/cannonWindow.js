// @ts-check
// BUNNYFALL (2026-11-05): THE GREAT CANNON'S WINDOW (scenes/cannonHost.js) - the build by Wayrest that the whole realm gives
// to. Nyx's dress (ui/nyxWindow.js, the Broker's sheet) in the colours of iron and fire: a row a material with what the
// build has of it and still needs, what the player carries of it, and a Give. Everything is handed in (`deps`).
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

const CANNON_CSS = `
#great-cannon .broker-win { border-color: #c0712f; box-shadow: 0 0 0 1px #4a2410, 0 12px 40px rgba(60, 25, 5, 0.6); }
#great-cannon .broker-title h2 { color: #f0b070; }
#great-cannon .broker-body { display: block !important; overflow-y: auto !important; overflow-x: hidden !important; max-height: 70vh; padding: 0 16px 16px; }
#great-cannon .gc-head { display: block; margin: 14px 0 4px; font-variant: small-caps; letter-spacing: 0.12em; color: #e9a35c; font-size: 15px; }
#great-cannon .gc-total { margin: 10px 0 2px; }
#great-cannon .gc-bar { height: 8px; border-radius: 4px; background: rgba(255,255,255,0.08); overflow: hidden; }
#great-cannon .gc-bar > i { display: block; height: 100%; background: linear-gradient(90deg, #8a3d12, #e9a35c); }
#great-cannon .broker-offers { display: flex !important; flex-direction: column !important; gap: 6px; margin: 0; padding: 0; list-style: none; grid-template-columns: none !important; }
#great-cannon .broker-offer { display: grid !important; grid-template-columns: 1fr auto !important; align-items: center; gap: 12px; padding: 8px 12px; min-height: 0 !important; width: auto !important; }
#great-cannon .broker-frame { display: none !important; }
#great-cannon .gc-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
#great-cannon .broker-name { display: block !important; color: #fbe9d6; font-size: 16px; white-space: normal; }
#great-cannon .broker-set { display: block !important; font-size: 13px; white-space: normal; opacity: 0.85; }
#great-cannon .broker-buy { min-width: 110px; }
`;

/**
 * @param {{
 *   build: () => { round: number, share: number, rows: Array<{ key: string, name: string, have: number, need: number, carried: number, worth: number }> } | null,
 *   purse: () => number,
 *   give: (key: string) => Promise<{ ok: boolean, text?: string | null }>,
 *   load?: (() => Promise<void>) | null, busy?: (() => boolean) | null, onClose?: (() => void) | null,
 * }} deps
 */
export function createCannonOverlay(deps) {
  if (typeof document === 'undefined') return null;
  injectEnhancedStyle(); injectEnhancedFonts(); injectBrokerSkinStyle();
  if (!document.getElementById('great-cannon-style')) { const st = document.createElement('style'); st.id = 'great-cannon-style'; st.textContent = CANNON_CSS; document.head.append(st); }
  let fired = false, note = null, pending = null;
  const host = el('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:13;background:transparent;overflow:hidden';
  document.body.append(host);
  const shell = el('div', 'broker-shell');
  shell.id = 'great-cannon';
  shell.setAttribute('role', 'dialog');
  shell.setAttribute('aria-label', t('cannon.name', 'The Great Cannon'));
  const win = el('div', 'broker-win');
  shell.append(win);
  const head = el('header', 'broker-head');
  const title = el('div', 'broker-title');
  const sub = el('p', 'broker-sub');
  const noteLine = el('p', 'broker-note');
  noteLine.setAttribute('aria-live', 'polite');
  title.append(el('h2', null, t('cannon.name', 'The Great Cannon')), sub, noteLine);
  const purse = el('span', 'broker-purse');
  const closeBtn = el('button', 'act broker-close', t('cannon.close', 'Close'));
  closeBtn.setAttribute('type', 'button');
  head.append(title, purse, closeBtn);
  const body = el('div', 'broker-body');
  win.append(head, body);
  host.append(shell);
  const coins = (/** @type {number} */ n) => t('nyx.coins', '{n, plural, one {# Nyx coin} other {# Nyx coins}}', { n });
  function render() {
    if (fired) return;
    purse.textContent = coins(deps.purse());
    noteLine.textContent = note?.text ?? '';
    noteLine.className = `broker-note${note?.ok ? ' ok' : ''}`;
    if (!note?.text) noteLine.setAttribute('hidden', ''); else noteLine.removeAttribute('hidden');
    for (const c of [...body.children]) c.remove();
    const b = deps.build();
    if (!b) {
      sub.textContent = t('cannon.sub', 'Built by the realm for the push on Cromwark');
      body.append(el('p', 'broker-set', t('cannon.loading', 'Asking the foreman how the build stands...')));
      return;
    }
    sub.textContent = t('cannon.subRound', 'Cannon {round} for the push on Cromwark · {pct}% built', { round: b.round, pct: Math.floor(b.share * 100) });
    body.append(el('p', 'broker-set gc-total', t('cannon.how', 'Give ingots and planks. Every gift pays Nyx coins, the rarer the metal or the wood the more. When the cannon is whole it fires on Cromwark and the next one is begun.')));
    const bar = el('div', 'gc-bar'); const fill = el('i'); fill.style.width = `${Math.round(b.share * 100)}%`; bar.append(fill); body.append(bar);
    const busy = !!pending || !!deps.busy?.();
    for (const [label, kind] of [[t('cannon.metals', 'Metals'), 'ingot'], [t('cannon.woods', 'Woods'), 'plank']]) {
      body.append(el('div', 'gc-head', label));
      const ul = el('ul', 'broker-offers');
      for (const r of b.rows.filter((x) => x.key.startsWith(kind))) {
        const li = el('li', 'broker-offer');
        const text = el('div', 'gc-body');
        text.append(el('span', 'broker-name', `${r.name}  ${r.have} / ${r.need}`));
        const rb = el('div', 'gc-bar'); const rf = el('i'); rf.style.width = `${Math.round((r.have / r.need) * 100)}%`; rb.append(rf); text.append(rb);
        const left = r.need - r.have;
        text.append(el('span', 'broker-set', left <= 0 ? t('cannon.full', 'The build has all it needs of these') : t('cannon.carry', 'You carry {n}. Worth {w} toward a coin each.', { n: r.carried, w: r.worth })));
        const n = Math.min(r.carried, left, 100);
        const btn = el('button', 'act broker-buy', pending === r.key ? t('cannon.giving', 'Giving...') : left <= 0 ? t('cannon.done', 'Done') : n > 0 ? t('cannon.give', 'Give {n}', { n }) : t('cannon.none', 'None carried'));
        btn.setAttribute('type', 'button');
        if (busy || n <= 0) btn.setAttribute('disabled', '');
        btn.onclick = (e) => {
          e.stopPropagation();
          if (busy || n <= 0) return;
          pending = r.key; render();
          deps.give(r.key).then((res) => { pending = null; note = { ok: !!res?.ok, text: res?.text ?? '' }; render(); }, () => { pending = null; render(); });
        };
        li.append(el('span', 'broker-frame'), text, btn);
        ul.append(li);
      }
      body.append(ul);
    }
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
