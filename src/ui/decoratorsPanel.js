// @ts-check
// The owner's Decorators window (who may decorate a home or caravan, and the templates sent) and the
// bar shown while a template is previewed. The surfaces decide nothing; the host's controller acts on each press
// (systems/decor/decoratorHome.js).
import { PIXEL_FONT_CSS } from './pixelifyFive.js';
import { registerOverlay } from './enhancedOverlays.js';
import { t } from './textManager.js';

export const DECORATORS_STYLE_ID = 'dagger-decorators-style';
const CSS = `
.dfdeco { position: fixed; inset: 0; z-index: 14; display: none; align-items: center; justify-content: center; pointer-events: none;
  ${PIXEL_FONT_CSS} color: var(--bone, #e9e4d9); }
.dfdeco[data-state="open"] { display: flex; }
.dfdeco-card { pointer-events: auto; width: min(460px, calc(100vw - 24px)); max-height: calc(100vh - 24px); overflow: auto; box-sizing: border-box;
  display: flex; flex-direction: column; gap: 8px; padding: 14px; background: rgba(14, 16, 19, .97); border: 1px solid #b8943f; border-radius: 6px; }
.dfdeco-title { font-size: 16px; color: #f2c46b; }
.dfdeco-head { font-size: 14px; color: #f2c46b; margin-top: 6px; }
.dfdeco-row { display: flex; align-items: center; gap: 8px; }
.dfdeco-row > span { flex: 1; }
.dfdeco-empty, .dfdeco-note { color: var(--dim, #9a9486); font-size: 13px; }
.dfdeco button, .dfdeco input { font: inherit; color: inherit; background: #1a1e24; border: 1px solid #2b323b; padding: 6px 8px; cursor: pointer; }
.dfdeco button:hover { border-color: #b8943f; color: #f2c46b; }
.dfdeco button[disabled] { opacity: .5; cursor: default; }
.dfdeco input { flex: 1; cursor: text; }
.dfdeco-bar { position: fixed; left: 50%; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); z-index: 12;
  display: none; gap: 8px; align-items: center; padding: 10px 12px; background: rgba(14, 16, 19, .95); border: 1px solid #b8943f;
  border-radius: 6px; ${PIXEL_FONT_CSS} color: var(--bone, #e9e4d9); pointer-events: auto; max-width: calc(100vw - 24px); flex-wrap: wrap; }
.dfdeco-bar[data-up="1"] { display: flex; }
.dfdeco-bar button { font: inherit; color: inherit; background: #1a1e24; border: 1px solid #2b323b; padding: 6px 10px; cursor: pointer; }
.dfdeco-bar button:hover { border-color: #b8943f; color: #f2c46b; }
.dfdeco-bar button[disabled] { opacity: .5; cursor: default; }
`;

function injectStyle(doc) {
  if (!doc?.getElementById || doc.getElementById(DECORATORS_STYLE_ID)) return;
  const s = doc.createElement('style');
  s.id = DECORATORS_STYLE_ID;
  s.textContent = CSS;
  (doc.head ?? doc.body)?.append(s);
}
const maker = (doc) => (tag, cls, text) => {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const swallowPresses = (node) => {
  const swallow = (e) => e.stopPropagation();
  for (const k of ['pointerdown', 'mousedown', 'click', 'touchstart', 'wheel', 'contextmenu']) node.addEventListener(k, swallow);
};

export const DECORATORS_TEXT = Object.freeze({
  get title() { return t('decor.decorators.title', 'Decorators'); },
  get empty() { return t('decor.decorators.empty', 'No one else can decorate this home yet.'); },
  get emptyCaravan() { return t('caravan.decorators.empty', 'No one else is allowed to send templates for your caravan.'); },
  get add() { return t('decor.decorators.add', 'Add decorator'); },
  get nameAsk() { return t('decor.decorators.nameAsk', 'Who may decorate this home? Enter their username.'); },
  get nameAskCaravan() { return t('caravan.decorators.nameAsk', 'Who may send you templates for your caravan? Enter their username.'); },
  get remove() { return t('decor.decorators.remove', 'Remove'); },
  removeAsk: (name) => t('decor.decorators.removeAsk', 'Remove {name}? Their unaccepted template will be discarded.', { name }),
  line: (name, pieces) => t('decor.decorators.line', '{name}: {pieces, plural, one {# template piece} other {# template pieces}}', { name, pieces }),
  lineSent: (name, pieces) => t('decor.decorators.lineSent', '{name}: template sent, {pieces, plural, one {# piece} other {# pieces}}', { name, pieces }),
  get list() { return t('decor.template.list', 'Templates sent to you'); },
  get none() { return t('decor.template.none', 'No templates are waiting.'); },
  get preview() { return t('decor.template.preview', 'Preview'); },
  get inside() { return t('decor.template.inside', 'Go inside to preview templates.'); },
  get close() { return t('decor.decorators.close', 'Close'); },
  get yes() { return t('decor.decorators.yes', 'Yes'); },
  get no() { return t('decor.decorators.no', 'No'); },
});

/**
 * THE WINDOW. `open(model)` shows it and answers the object the host's overlay slot holds; `update(model)` redraws.
 * A model: `{ caravan, rows: [{ name, line }], templates: [{ name, line, preview }], inside, note, busy }`.
 * @param {{ doc?: any, onAdd: (name: string) => void, onRemove: (name: string) => void, onPreview: (name: string) => void, onClose?: () => void }} opts
 */
export function createDecoratorsPanel({ doc = document, onAdd, onRemove, onPreview, onClose = () => {} }) {
  injectStyle(doc);
  const el = maker(doc);
  const root = el('div', 'dfdeco');
  root.dataset.state = 'closed';
  const card = el('div', 'dfdeco-card');
  root.append(card);
  swallowPresses(card);
  doc.body?.append(root);
  let model = null;
  let open = false;
  let asking = null;
  let unregister = null;
  const btn = (label, fn, disabled = false) => {
    const b = el('button', '', label);
    b.type = 'button';
    b.disabled = !!disabled;
    b.addEventListener('click', () => { if (!b.disabled) fn(); });
    return b;
  };
  function hide() {
    if (!open) return;
    open = false;
    asking = null;
    root.dataset.state = 'closed';
    unregister?.();
    unregister = null;
    onClose();
  }
  function draw() {
    const m = model ?? {};
    const kids = [el('div', 'dfdeco-title', DECORATORS_TEXT.title)];
    const rows = m.rows ?? [];
    if (!rows.length) kids.push(el('div', 'dfdeco-empty', m.caravan ? DECORATORS_TEXT.emptyCaravan : DECORATORS_TEXT.empty));
    for (const r of rows) {
      const row = el('div', 'dfdeco-row');
      row.dataset.name = r.name;
      if (asking === `remove:${r.name}`) {
        row.append(el('span', '', DECORATORS_TEXT.removeAsk(r.name)), btn(DECORATORS_TEXT.yes, () => { asking = null; onRemove(r.name); }, m.busy), btn(DECORATORS_TEXT.no, () => { asking = null; draw(); }));
      } else {
        row.append(el('span', '', r.line ?? r.name), btn(DECORATORS_TEXT.remove, () => { asking = `remove:${r.name}`; draw(); }, m.busy));
      }
      kids.push(row);
    }
    if (asking === 'add') {
      const row = el('div', 'dfdeco-row');
      const input = el('input', '');
      input.type = 'text';
      input.maxLength = 16;
      input.autocomplete = 'off';
      input.placeholder = m.caravan ? DECORATORS_TEXT.nameAskCaravan : DECORATORS_TEXT.nameAsk;
      const go = () => { const v = String(input.value ?? '').trim(); if (v) { asking = null; onAdd(v); } };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); e.stopPropagation(); });
      row.append(input, btn(DECORATORS_TEXT.add, go, m.busy));
      kids.push(el('div', 'dfdeco-note', m.caravan ? DECORATORS_TEXT.nameAskCaravan : DECORATORS_TEXT.nameAsk), row);
      setTimeout(() => input.focus?.(), 0);
    } else if (m.canAdd !== false) {
      kids.push(btn(DECORATORS_TEXT.add, () => { asking = 'add'; draw(); }, m.busy));
    }
    kids.push(el('div', 'dfdeco-head', DECORATORS_TEXT.list));
    const sent = m.templates ?? [];
    if (!sent.length) kids.push(el('div', 'dfdeco-empty', DECORATORS_TEXT.none));
    for (const s of sent) {
      const row = el('div', 'dfdeco-row');
      row.dataset.template = s.name;
      row.append(el('span', '', s.line ?? s.name), btn(DECORATORS_TEXT.preview, () => onPreview(s.name), m.busy || !m.inside));
      kids.push(row);
    }
    if (sent.length && !m.inside) kids.push(el('div', 'dfdeco-note', DECORATORS_TEXT.inside));
    if (m.note) kids.push(el('div', 'dfdeco-note', m.note));
    kids.push(btn(DECORATORS_TEXT.close, () => hide()));
    card.replaceChildren(...kids);
  }
  const slot = () => ({
    isChoiceWindow: true,
    get done() { return !open; },
    input(code) { if (code === 'Escape') hide(); },
    click() {}, wheel() {}, hover() {}, tick() {}, draw() {},
    dispose() { hide(); },
  });
  return {
    root,
    open(m) {
      model = m;
      asking = null;
      open = true;
      root.dataset.state = 'open';
      unregister = registerOverlay(() => hide());
      draw();
      return slot();
    },
    update(m) { model = m; if (open) draw(); },
    close: hide,
    isOpen: () => open,
  };
}

export const TEMPLATE_TEXT = Object.freeze({
  accept: (gold) => t('decor.template.accept', 'Accept for {gold} gold', { gold: Number(gold).toLocaleString('en-US') }),
  get pricing() { return t('decor.template.pricing', 'Pricing the template...'); },
  get decline() { return t('decor.template.decline', 'Decline'); },
  get close() { return t('decor.template.close', 'Close preview'); },
  title: (name) => t('decor.template.of', 'Template from {name}', { name }),
});

/**
 * The preview bar: whose template it is, Accept for its price, Decline, and Close preview.
 * @param {{ doc?: any, onAccept: () => void, onDecline: () => void, onClose: () => void }} opts
 */
export function createTemplateBar({ doc = document, onAccept, onDecline, onClose }) {
  injectStyle(doc);
  const el = maker(doc);
  const root = el('div', 'dfdeco-bar');
  root.dataset.up = '0';
  const what = el('span', 'dfdeco-what');
  const b = (fn) => { const n = el('button', ''); n.type = 'button'; n.addEventListener('click', () => { if (!n.disabled) fn(); }); return n; };
  const accept = b(onAccept), decline = b(onDecline), close = b(onClose);
  accept.dataset.act = 'accept';
  decline.dataset.act = 'decline';
  close.dataset.act = 'close';
  root.append(what, accept, decline, close);
  swallowPresses(root);
  doc.body?.append(root);
  return {
    root,
    /** @param {{ name: string, gold: number | null, busy?: boolean }} s */
    show({ name, gold, busy = false }) {
      what.textContent = TEMPLATE_TEXT.title(name);
      accept.textContent = gold == null ? TEMPLATE_TEXT.pricing : TEMPLATE_TEXT.accept(gold);
      accept.disabled = gold == null || busy;
      decline.textContent = TEMPLATE_TEXT.decline;
      decline.disabled = busy;
      close.textContent = TEMPLATE_TEXT.close;
      close.disabled = busy;
      root.dataset.up = '1';
    },
    hide() { root.dataset.up = '0'; },
    isUp: () => root.dataset.up === '1',
  };
}
