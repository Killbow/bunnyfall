// The drawer at the side of the chat window, opened by the Social button: Online (the chat's own roster), Friends, and
// Party. Also the Letters view, which takes the message area. The friends panel (ui/socialPanel.js) draws Friends,
// Party, and Letters into the slots made here, finding the live chat's dock through `chatDock()` below.
import { getPref, setPref } from '../systems/uiPrefs.js';
import { t } from '../systems/textManager.js';

export const DRAWER_TABS = Object.freeze(['online', 'friends', 'party']);

/** The live chat's dock. A friends panel created without its own `dock` draws into it. */
let liveDock = null;
export const chatDock = () => liveDock;
export const setChatDock = (dock) => { liveDock = dock; };
export const clearChatDock = (dock) => { if (liveDock === dock) liveDock = null; };
export const drawerTabOf = (v) => (DRAWER_TABS.includes(v) ? v : 'online');
/** The drawer's default width in CSS px for a text scale. */
export const drawerWidth = (scale = 1) => Math.round(Math.min(340, 250 * scale));
/** The narrowest the messages may be dragged by the split. */
export const DRAWER_SPLIT_MIN = 220;
/** The narrowest the drawer may be, unless its own tabs need more. */
export const DRAWER_MIN = 220;

/** Where the drawer opens for a chat at `x` with a message area `w` wide: right, left, or over the messages. */
export function drawerSide({ x, w, dw, vw }) {
  if (x + w + dw <= vw - 14) return 'right';
  if (x - dw >= 0) return 'left';
  return 'over';
}

const S = 'var(--dfchat-scale, 1)';
/** The drawer sheet. Inside the chat, the friends panel text follows the chat text size. */
export const CHAT_DRAWER_CSS = `
.dfchat-cols { position: relative; }
.dfchat-main { position: relative; }
.dfchat-drawer { display: none; flex: none; width: var(--dfchat-dw, 250px); flex-direction: column; min-height: 0; position: relative;
  border-left: 1px solid rgba(233, 228, 217, .08); background: rgba(0, 0, 0, .12); }
.dfchat[data-drawer="right"], .dfchat[data-drawer="left"] { width: min(calc(min(var(--dfchat-w, 440px), calc(100vw - 28px)) + var(--dfchat-dw, 250px)), calc(100vw - 28px)); }
.dfchat-popwin[data-drawer] { width: auto; }
.dfchat:is([data-drawer="right"], [data-drawer="left"], [data-drawer="over"]) .dfchat-drawer { display: flex; }
.dfchat[data-drawer="left"] .dfchat-drawer { order: -1; border-left: 0; border-right: 1px solid rgba(233, 228, 217, .08); }
.dfchat[data-drawer="over"] .dfchat-drawer { position: absolute; inset: 0; z-index: 3; width: auto; border: 0; background: #0e1013; }
.dfchat-dtabs { flex: none; display: flex; gap: 2px; padding: 3px 4px; border-bottom: 1px solid rgba(233, 228, 217, .08); }
.dfchat-dtab { flex: none; position: relative; background: none; border: 0; border-radius: 4px; color: var(--dim, #9a9486); font: inherit; font-size: 11px;
  letter-spacing: .06em; text-transform: uppercase; padding: 5px 9px; cursor: pointer; white-space: nowrap; }
.dfchat-dtab:hover { color: var(--bone, #e9e4d9); background: rgba(233, 228, 217, .05); }
.dfchat-dtab.active { color: var(--bone, #e9e4d9); background: rgba(192, 138, 62, .18); box-shadow: inset 0 -2px 0 var(--brass, #c08a3e); }
.dfchat-dtab .dfchat-badge:not(:empty) { display: block; position: absolute; top: 3px; right: 2px; width: 7px; height: 7px; padding: 0; margin: 0; border-radius: 50%;
  font-size: 0; line-height: 0; vertical-align: middle; background: #c8503c; }
.dfchat-dbody { flex: 1 1 0; min-height: 0; position: relative; }
.dfchat-split { display: none; position: absolute; top: 0; bottom: 0; left: -4px; width: 7px; z-index: 4; cursor: ew-resize; touch-action: none; }
.dfchat:is([data-drawer="right"], [data-drawer="left"]):not(.touch) .dfchat-split { display: block; }
.dfchat[data-drawer="left"] .dfchat-split { left: auto; right: -4px; }
.dfchat-split:hover, .dfchat-split:focus-visible { background: rgba(192, 138, 62, .35); outline: none; }
.dfsocial-docked { display: flex; flex-direction: column; }
.dfchat-dsocial .dfsocial-row { flex-wrap: wrap; }
.dfchat-dsocial .dfsocial-who { flex: 1 1 120px; min-width: 0; }
.dfchat-dsocial .dfsocial-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; overflow-wrap: normal; }
.dfchat-dsocial .dfsocial-rowacts { margin-left: auto; }
.dfchat .dfchat-drawer .dfchat-who { display: none; position: absolute; inset: 0; width: auto; border: 0; background: none; }
.dfchat-drawer[data-tab="online"] .dfchat-who { display: block; }
.dfchat-dsocial { display: none; position: absolute; inset: 0; overflow-y: auto; overscroll-behavior: contain; padding: 2px 8px 10px;
  flex-direction: column; scrollbar-width: thin; scrollbar-color: rgba(233, 228, 217, .22) transparent; }
.dfchat-drawer[data-tab="friends"] .dfchat-dsocial, .dfchat-drawer[data-tab="party"] .dfchat-dsocial { display: flex; }
.dfchat-letters { display: none; position: absolute; inset: 0; z-index: 2; overflow-y: auto; overscroll-behavior: contain; padding: 4px 10px 10px;
  flex-direction: column; background: #0e1013; scrollbar-width: thin; scrollbar-color: rgba(233, 228, 217, .22) transparent; }
.dfchat-box[data-view="letters"] .dfchat-letters { display: flex; }
.dfchat-box[data-view="letters"] .dfchat-main > :not(.dfchat-letters) { visibility: hidden; }
.dfchat-letters-tab { display: none; }
.dfchat-letters-tab.on { display: inline-block; }
/* the friends panel's words at the chat's text size; its buttons keep theirs */
.dfchat :is(.dfchat-dsocial, .dfchat-letters) .dfsocial-name { font-size: calc(14px * ${S}); }
.dfchat :is(.dfchat-dsocial, .dfchat-letters) :is(.dfsocial-sub, .dfsocial-sec, .dfsocial-lead, .dfsocial-left, .dfsocial-age, .dfsocial-label, .dfsocial-count) { font-size: calc(11px * ${S}); }
.dfchat :is(.dfchat-dsocial, .dfchat-letters) :is(.dfsocial-err, .dfsocial-note) { font-size: calc(12px * ${S}); }
.dfchat :is(.dfchat-dsocial, .dfchat-letters) :is(.dfsocial-empty, .dfsocial-lettertext, .dfsocial-field) { font-size: calc(13px * ${S}); }
.dfchat :is(.dfchat-dsocial, .dfchat-letters) .dfsocial-subject { font-size: calc(15px * ${S}); }
.dfchat :is(.dfchat-dsocial, .dfchat-letters) .dfsocial-glyph { width: calc(12px * ${S}); height: calc(12px * ${S}); }
.dfchat :is(.dfchat-dsocial, .dfchat-letters) :is(.dfsocial-btn, .dfsocial-why) { font-size: 12px; }
.dfchat :is(.dfchat-dsocial, .dfchat-letters) .dfsocial-why { font-size: 11px; }
.dfchat.touch :is(.dfchat-dtab) { min-height: 44px; padding: 10px 12px; }
.dfchat.touch :is(.dfchat-dsocial, .dfchat-letters) .dfsocial-btn { min-height: 44px; padding: 8px 12px; font-size: 13px; }
.dfchat.touch :is(.dfchat-dsocial, .dfchat-letters) .dfsocial-letter { min-height: 44px; }
.dfchat.touch :is(.dfchat-dsocial, .dfchat-letters) .dfsocial-field { min-height: 44px; font-size: max(16px, calc(13px * ${S})); }
`;

/**
 * The drawer's nodes and state. `who` is the chat's roster column, moved in as the Online tab.
 * @param {{ el: (tag: string, cls: string, text?: string|null) => any, who: any }} o
 */
export function createChatDrawer({ el, who }) {
  const node = el('div', 'dfchat-drawer');
  const tabs = el('div', 'dfchat-dtabs');
  tabs.setAttribute('role', 'tablist');
  const body = el('div', 'dfchat-dbody');
  const social = el('div', 'dfchat-dsocial');
  const letters = el('div', 'dfchat-letters');
  body.append(who, social);
  node.append(tabs, body);
  let open = getPref('chatDrawer') === true;
  let tab = drawerTabOf(getPref('chatDrawerTab'));
  let attached = false;
  let badge = () => '';
  const btns = new Map();
  for (const [id, label] of [['online', t('chat.drawer.online', 'Online')], ['friends', t('chat.drawer.friends', 'Friends')], ['party', t('chat.drawer.party', 'Party')]]) {
    const b = el('button', 'dfchat-dtab', label);
    b.type = 'button'; b.dataset.tab = id;
    b.setAttribute('role', 'tab');
    const bd = el('span', 'dfchat-badge');
    bd.setAttribute('aria-hidden', 'true');
    b.append(bd);
    b.addEventListener('click', () => setTab(id));
    tabs.append(b);
    btns.set(id, { b, bd });
  }
  const shownTab = () => (attached || tab === 'online' ? tab : 'online');
  // The tab strip's own width at its fixed size, measured while it is drawn (the chat font can change it).
  let tabsNatural = 0;
  const measure = () => {
    const shown = [...tabs.children].filter((b) => b.style.display !== 'none');
    const last = shown.at(-1)?.getBoundingClientRect?.(), box = tabs.getBoundingClientRect?.();
    if (!last || !box || !last.width) return false;
    const pad = parseFloat(tabs.ownerDocument?.defaultView?.getComputedStyle?.(tabs)?.paddingRight) || 0;
    const w = Math.ceil(last.right - box.left + pad);
    if (w === tabsNatural) return false;
    tabsNatural = w;
    return true;
  };
  const paint = () => {
    const at = shownTab();
    if (node.dataset.tab !== at) node.dataset.tab = at;
    for (const [id, { b, bd }] of btns) {
      const cls = `dfchat-dtab${id === at ? ' active' : ''}`;
      if (b.className !== cls) { b.className = cls; b.setAttribute('aria-selected', String(id === at)); }
      const display = id === 'online' || attached ? '' : 'none';
      if (b.style.display !== display) b.style.display = display;
      const n = id === 'online' ? '' : String(badge(id) ?? '');
      if (bd.textContent !== n) bd.textContent = n;
    }
  };
  const setTab = (id) => { tab = drawerTabOf(id); setPref('chatDrawerTab', tab); paint(); };
  const setOpen = (on) => { open = !!on; setPref('chatDrawer', open); paint(); };
  paint();
  return {
    node, social, letters,
    isOpen: () => open, setOpen,
    tab: shownTab, setTab, paint,
    /** DRAWER_MIN, or wider when the tab strip needs more room. */
    minWidth: () => Math.max(DRAWER_MIN, tabsNatural + 2),
    /** Measure the tab strip again; true when its width changed. */
    measure,
    attached: () => attached,
    attach: (b) => { attached = true; if (typeof b === 'function') badge = b; paint(); },
  };
}
