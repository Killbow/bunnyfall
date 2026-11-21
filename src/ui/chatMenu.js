// BUNNYFALL CHAT-REWORK (2026-11-20, the owner: "its full of buttons when you click somebody"): THE PLAYER MENU - one
// small popover under a name, for a chat line's speaker and a roster row alike, in place of the stack of full-width
// buttons that used to open inside the line or the row.
//
// The rows are the host's, as before (`{ label, enabled, why, title, run, menu, group }` - net/social.js, the chat
// safety host): this file only lays them out. Rows with no `group` come first, in the order given (Whisper, Add friend,
// Invite to party, Follow, ...). Rows that share a `group` are folded behind ONE entry that opens them as a second
// level ('staff' - the staff tools, which only staff are ever handed; 'report' - the report reasons). A row with its
// own `menu` (a mute's lengths, a ban's and its confirm) opens that level too, and every second level has a Back row.
// A refused act stays a row, greyed, with its reason under the label (AUDIT SOC C11: a finger cannot hover a title).
//
// The popover is position: fixed, a child of the chat's own root (or of the popped-out chat window's wrapper,
// ui/chatPopout.js), never of the box: the box's backdrop-filter would make it the containing block. It closes on a
// choice, on Escape (the panel asks `close`), on a press anywhere outside it, and when what it hangs under scrolls.
import { t } from '../systems/textManager.js';

/** The words a folded group's entry wears. */
const GROUP_LABEL = Object.freeze({
  staff: () => t('chat.menu.staff', 'Staff tools'),
  report: () => t('chat.menu.report', 'Report'),
});
const groupLabel = (g) => (GROUP_LABEL[g] ? GROUP_LABEL[g]() : String(g));

export const CHAT_MENU_CSS = `
.dfchat-pmenu { position: fixed; z-index: 30; pointer-events: auto; display: flex; flex-direction: column; gap: 1px;
  min-width: 172px; max-width: 250px; max-height: min(420px, 70vh); overflow-y: auto; padding: 4px; box-sizing: border-box;
  background: rgba(17, 19, 24, .98); border: 1px solid rgba(233, 228, 217, .14); border-radius: 7px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, .55); scrollbar-width: thin; scrollbar-color: rgba(233, 228, 217, .25) transparent; }
.dfchat-pmenu-head { display: flex; align-items: center; gap: 6px; padding: 4px 8px 5px; font-size: calc(11px * var(--dfchat-scale, 1)); color: var(--brass, #c08a3e);
  letter-spacing: .03em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dfchat-pmenu-sep { height: 1px; margin: 3px 4px; background: rgba(233, 228, 217, .1); flex: none; }
.dfchat-mi { display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box; background: none; border: 0;
  border-radius: 4px; color: var(--bone, #e9e4d9); font: inherit; font-size: 12px; line-height: 1.25; text-align: left;
  padding: 5px 8px; cursor: pointer; flex: none; text-indent: 0; }
.dfchat-mi:hover, .dfchat-mi:focus-visible { background: rgba(233, 228, 217, .09); outline: none; }
.dfchat-mi[disabled] { cursor: default; opacity: .5; }
.dfchat-mi[disabled]:hover { background: none; }
.dfchat-mi-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
.dfchat-mi-why { font-size: 10px; font-style: italic; color: var(--dim, #9a9486); }
.dfchat-mi-more { margin-left: auto; color: var(--dim, #9a9486); flex: none; }
.dfchat-mi.back { color: var(--dim, #9a9486); }
.dfchat-mi.group { color: #d8b77a; }
.dfchat.touch .dfchat-mi { min-height: 40px; font-size: 13px; }
`;

/**
 * @param {object} o
 * @param {(tag: string, cls: string, text?: string|null) => any} o.el  the panel's element builder
 * @param {() => any} o.host  where the popover goes: the chat's root, or the popped-out window's wrapper
 */
export function createChatMenu({ el, host }) {
  let node = null;       // the popover while it stands
  let anchor = null;     // what it hangs under
  let onShut = null;     // the opener's word that it went
  let offPress = null;   // the outside-press listener's removal
  let offScroll = null;  // the scroller's listener's removal

  const close = () => {
    if (!node) return false;
    node.remove?.();
    node = null;
    anchor = null;
    offPress?.(); offPress = null;
    offScroll?.(); offScroll = null;
    const shut = onShut; onShut = null;
    shut?.();
    return true;
  };

  /** Under the anchor, or over it when the view has no room below; kept inside the view's width. */
  const place = () => {
    if (!node || !anchor) return;
    const view = anchor.ownerDocument?.defaultView ?? globalThis;
    const r = anchor.getBoundingClientRect?.();
    if (!r) return;
    const vw = Number(view.innerWidth) || 800, vh = Number(view.innerHeight) || 600;
    const w = node.offsetWidth || 180, h = node.offsetHeight || 120;
    const x = Math.max(6, Math.min(r.left, vw - w - 6));
    const below = r.bottom + 3;
    const y = below + h <= vh - 6 ? below : Math.max(6, r.top - h - 3);
    node.style.left = `${Math.round(x)}px`;
    node.style.top = `${Math.round(y)}px`;
  };

  /** One button. A press never takes the focus: the caret stays in the chat field, whose keys the panel owns. */
  const item = (cls, label, { why = null, title = null, more = false, disabled = false, run = null } = {}) => {
    const b = el('button', `dfchat-mi${cls ? ` ${cls}` : ''}`);
    b.type = 'button';
    const text = el('span', 'dfchat-mi-text');
    text.append(el('span', 'dfchat-mi-label', label));
    if (why) text.append(el('span', 'dfchat-mi-why', why));
    b.append(text);
    if (more) b.append(el('span', 'dfchat-mi-more', '›'));
    if (title) b.title = title;
    if (disabled) b.disabled = true;
    b.addEventListener('mousedown', (e) => e.preventDefault?.());
    if (!disabled && run) b.addEventListener('click', (e) => { e.stopPropagation?.(); run(); });
    return b;
  };

  /** A level of rows: the head, the rows with no group in their order, then one entry for each group. */
  const fill = (heading, rows, back) => {
    if (!node) return;
    const parts = [];
    if (heading) parts.push(el('div', 'dfchat-pmenu-head', heading));
    if (back) parts.push(item('back', `‹ ${t('chat.menu.back', 'Back')}`, { run: back }));
    const plain = [], groups = new Map();
    for (const a of rows) {
      if (!a) continue;
      const g = typeof a.group === 'string' && a.group ? a.group : null;
      if (!g) plain.push(a);
      else { if (!groups.has(g)) groups.set(g, []); groups.get(g).push(a); }
    }
    const here = () => fill(heading, rows, back);
    for (const a of plain) parts.push(rowItem(a, heading, here));
    if (groups.size && plain.length) parts.push(el('div', 'dfchat-pmenu-sep'));
    for (const [g, list] of groups) {
      parts.push(item('group', groupLabel(g), { more: true, run: () => fill(groupLabel(g), list.map((a) => ({ ...a, group: null })), here) }));
    }
    node.replaceChildren(...parts);
    place();
  };

  /** A host row as a button: refused with its reason, a door to its own level, or the act (which closes the menu). */
  const rowItem = (a, heading, here) => {
    const label = String(a.label ?? '');
    if (a.enabled === false) return item('', label, { why: a.why ? String(a.why) : null, title: a.why ? String(a.why) : null, disabled: true });
    if (Array.isArray(a.menu)) return item('', label, { title: a.title ?? null, more: true, run: () => fill(label, a.menu, here) });
    return item('', label, { title: a.title ?? null, run: () => { close(); a.run?.(); } });
  };

  return {
    /** Open under `at` with `rows` (the host's), headed by `heading` (the player's name). Pressing the same anchor again
     *  closes it. `onClose` is called once when it goes, whatever closed it. Answers whether it opened. */
    openFor(at, rows, { heading = '', onClose = null } = {}) {
      const same = node && anchor === at;
      close();
      if (same) return false;
      const list = (rows ?? []).filter(Boolean);
      if (!list.length || !at) return false;
      node = el('div', 'dfchat-pmenu');
      node.setAttribute('role', 'menu');
      if (heading) node.setAttribute('aria-label', heading);
      anchor = at;
      onShut = onClose;
      // a press inside the menu is the menu's: the host's mousedown would otherwise draw a weapon (the box's own rule)
      for (const ev of ['pointerdown', 'mousedown', 'click', 'touchstart', 'wheel', 'contextmenu']) node.addEventListener(ev, (e) => e.stopPropagation?.());
      host().append(node);
      fill(heading, list, null);
      // a press anywhere else closes it - on the window the anchor is in, in capture, after this press is done
      const view = at.ownerDocument?.defaultView ?? globalThis;
      const press = (e) => { if (!node) return; if (node.contains?.(e.target) || anchor?.contains?.(e.target)) return; close(); };
      view.setTimeout?.(() => { if (!node) return; view.addEventListener?.('pointerdown', press, true); offPress = () => view.removeEventListener?.('pointerdown', press, true); }, 0);
      // and so does a scroll of what it hangs under (the conversation, the roster): it would float off its name
      const scroller = at.closest?.('.dfchat-list, .dfchat-wholist');
      if (scroller) { const s = () => close(); scroller.addEventListener('scroll', s, { passive: true }); offScroll = () => scroller.removeEventListener('scroll', s); }
      return true;
    },
    close,
    isOpen: () => !!node,
    anchor: () => anchor,
  };
}
