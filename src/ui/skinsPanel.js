// @ts-check
/* global btoa */
// BUNNYFALL (2026-11-07): CUSTOM PAPERDOLLS, THE PLAYER'S SCREENS (net/skinLaw.js is the law; systems/online/customSkins.js
// is what the game reads). One panel, two shapes:
//   `mountSkinsPanel(box, { io, manage: false })`  the main menu's picker: the account's approved skins and "none", press one to wear it online.
//   `mountSkinsPanel(box, { io, manage: true })`   the skins page (skins.html): the same list with every status and a Delete, and the upload form.
// `io` is the account door `{ fetch, base, secret }` (net/accountClient.js `call`); the panel asks, shows the service's word.
import { skinsMine, skinsUpload, skinsDelete, skinsWear, skinsGet, accountRefusalText } from '../net/accountClient.js';
import {
  SKIN_HEIGHT_MIN, SKIN_HEIGHT_MAX, SKIN_HEIGHT_STEP, SKIN_NAME_MAX, SKIN_MAX_PER_ACCOUNT, SKIN_PNG_MAX_BYTES, skinHeight, skinName, skinPngSize,
} from '../net/skinLaw.js';

const STYLE_ID = 'bf-skins-style';
const CSS = `
.bf-sk { color: #e8e2d0; font: 14px/1.45 system-ui, sans-serif; }
.bf-sk h3 { margin: 14px 0 6px; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: #d9b45a; }
.bf-sk .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 8px 0; }
.bf-sk .card { display: flex; gap: 12px; align-items: center; padding: 8px; border: 2px solid #4a4638; background: rgba(10,12,17,.7); margin: 6px 0; }
.bf-sk .card.worn { border-color: #d9b45a; }
.bf-sk .card img { height: 84px; image-rendering: pixelated; background: #222; }
.bf-sk .meta { flex: 1; min-width: 0; }
.bf-sk .dim { color: #9a9482; } .bf-sk .bad { color: #d4614f; } .bf-sk .ok { color: #6fae6a; }
.bf-sk button, .bf-sk input, .bf-sk select { font: inherit; color: #e8e2d0; background: #0a0d11; border: 2px solid #5a5444; padding: 5px 10px; }
.bf-sk button { cursor: pointer; } .bf-sk button:hover { border-color: #d9b45a; }
.bf-sk input[type=range] { padding: 0; width: 180px; }
`;
const ensureStyle = (/** @type {Document} */ doc) => { if (doc.getElementById(STYLE_ID)) return; const s = doc.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; doc.head.append(s); };
const el = (/** @type {string} */ tag, /** @type {string} */ text = '', /** @type {string} */ cls = '') => { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; };
const words = (/** @type {any} */ r) => accountRefusalText(r?.error ?? 'server');
const STATUS_TEXT = { pending: 'Waiting for staff', approved: 'Approved', rejected: 'Not approved' };

const fileBytes = async (/** @type {File} */ f) => new Uint8Array(await f.arrayBuffer());
const toB64 = (/** @type {Uint8Array} */ b) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

/**
 * @param {HTMLElement} box
 * @param {{ io: () => any, manage?: boolean, onWorn?: (id: string|null) => void, doc?: Document }} deps
 */
export function mountSkinsPanel(box, { io, manage = false, onWorn = () => {}, doc = document }) {
  ensureStyle(doc);
  box.classList.add('bf-sk');
  const msg = el('div', '', 'dim');
  const list = el('div');
  const form = manage ? el('div') : null;
  box.replaceChildren(...(form ? [form, msg, list] : [msg, list]));
  /** @type {any} */ let state = { skins: [], worn: null };
  const door = () => io();

  async function preview(/** @type {any} */ s, /** @type {HTMLImageElement} */ img) {
    const r = await skinsGet(door(), s.id).catch(() => null);
    if (r?.ok) img.src = `data:image/png;base64,${r.data.front}`;
  }

  function draw() {
    list.replaceChildren();
    const rows = manage ? state.skins : state.skins.filter((/** @type {any} */ s) => s.status === 'approved');
    if (!manage) {
      const none = el('div', '', `card${state.worn == null ? ' worn' : ''}`);
      const m = el('div', '', 'meta'); m.append(el('b', 'The usual paperdoll'), el('div', 'Your character as the game draws it.', 'dim'));
      const b = el('button', state.worn == null ? 'Worn' : 'Wear'); b.disabled = state.worn == null; b.onclick = () => wear(null);
      none.append(m, b); list.append(none);
    }
    for (const s of rows) {
      const card = el('div', '', `card${state.worn === s.id ? ' worn' : ''}`);
      const img = /** @type {HTMLImageElement} */ (el('img')); img.alt = s.name; if (s.status !== 'rejected') preview(s, img);
      const m = el('div', '', 'meta');
      m.append(el('b', s.name), el('div', `${Math.round(s.height * 100)}% of a player's height - ${s.w} x ${s.h}`, 'dim'));
      if (manage) m.append(el('div', STATUS_TEXT[/** @type {keyof typeof STATUS_TEXT} */ (s.status)] ?? s.status, s.status === 'approved' ? 'ok' : s.status === 'rejected' ? 'bad' : 'dim'));
      if (s.note) m.append(el('div', `Staff: ${s.note}`, 'dim'));
      card.append(img, m);
      if (s.status === 'approved') { const b = el('button', state.worn === s.id ? 'Worn' : 'Wear online'); b.disabled = state.worn === s.id; b.onclick = () => wear(s.id); card.append(b); }
      if (manage) { const d = el('button', 'Delete'); d.onclick = () => del(s); card.append(d); }
      list.append(card);
    }
    if (!rows.length && manage) list.append(el('div', 'No skins yet. Upload one above.', 'dim'));
    if (!manage && !rows.length) list.append(el('div', 'You have no approved skins yet. Upload one on the skins page and wait for staff.', 'dim'));
  }

  async function refresh() {
    const d = door();
    if (!d) { msg.textContent = 'Sign in to the game first, then come back.'; msg.className = 'bad'; return; }
    const r = await skinsMine(d).catch(() => null);
    if (!r?.ok) { msg.textContent = words(r); msg.className = 'bad'; return; }
    state = r.data; msg.textContent = r.data.disabled ? `${accountRefusalText('skin-disabled')}${r.data.note ? ` (${r.data.note})` : ''}` : ''; msg.className = r.data.disabled ? 'bad' : 'dim'; if (form) form.hidden = !!r.data.disabled; draw();
  }
  async function wear(/** @type {string|null} */ id) {
    msg.textContent = 'Saving...'; msg.className = 'dim';
    const r = await skinsWear(door(), id).catch(() => null);
    if (!r?.ok) { msg.textContent = words(r); msg.className = 'bad'; return; }
    state.worn = id; msg.textContent = id ? 'Done. Others see it the next time they meet you; you see it in your inventory.' : 'Back to the usual paperdoll.'; msg.className = 'ok';
    onWorn(id); draw();
  }
  async function del(/** @type {any} */ s) {
    if (!globalThis.confirm?.(`Delete "${s.name}"?`)) return;
    const r = await skinsDelete(door(), s.id).catch(() => null);
    if (!r?.ok) { msg.textContent = words(r); msg.className = 'bad'; return; }
    if (state.worn === s.id) onWorn(null);
    await refresh();
  }

  if (form) {
    form.append(el('h3', 'Upload a paperdoll'));
    const name = /** @type {HTMLInputElement} */ (el('input')); name.maxLength = SKIN_NAME_MAX; name.placeholder = 'Name';
    const height = /** @type {HTMLInputElement} */ (el('input')); height.type = 'range'; height.min = String(SKIN_HEIGHT_MIN); height.max = String(SKIN_HEIGHT_MAX); height.step = String(SKIN_HEIGHT_STEP); height.value = '1';
    const hl = el('span', '100%');
    height.oninput = () => { hl.textContent = `${Math.round(Number(height.value) * 100)}%`; };
    const mkFile = (/** @type {string} */ label) => { const i = /** @type {HTMLInputElement} */ (el('input')); i.type = 'file'; i.accept = 'image/png'; const w = el('label', `${label} `); w.append(i); return { i, w }; };
    const front = mkFile('Front'), back = mkFile('Back');
    const r1 = el('div', '', 'row'); r1.append(name, el('span', 'Height'), height, hl);
    const r2 = el('div', '', 'row'); r2.append(front.w, back.w);
    const go = el('button', 'Send for review');
    const note = el('div', `PNG, 24 x 48 up to 256 x 512 pixels, under ${Math.round(SKIN_PNG_MAX_BYTES / 1024)} KB each, front and back the same size. Staff look at every skin and approve the ones that fit the world of Tamriel. You may keep ${SKIN_MAX_PER_ACCOUNT}.`, 'dim');
    go.onclick = async () => {
      const n = skinName(name.value), h = skinHeight(Number(height.value));
      const ff = front.i.files?.[0], bf = back.i.files?.[0];
      if (!n || h == null || !ff || !bf) { msg.textContent = 'Give it a name (2 to 24 letters), a height, and both pictures.'; msg.className = 'bad'; return; }
      const [fb, bb] = await Promise.all([fileBytes(ff), fileBytes(bf)]);
      const fs = skinPngSize(fb), bs = skinPngSize(bb);
      if (!fs || !bs) { msg.textContent = accountRefusalText('skin-png'); msg.className = 'bad'; return; }
      if (fs.w !== bs.w || fs.h !== bs.h) { msg.textContent = accountRefusalText('skin-same-size'); msg.className = 'bad'; return; }
      go.disabled = true; msg.textContent = 'Sending...'; msg.className = 'dim';
      const r = await skinsUpload(door(), { name: n, height: h, front: toB64(fb), back: toB64(bb) }).catch(() => null);
      go.disabled = false;
      if (!r?.ok) { msg.textContent = words(r); msg.className = 'bad'; return; }
      msg.textContent = 'Sent. Staff will look at it.'; msg.className = 'ok';
      name.value = ''; front.i.value = ''; back.i.value = '';
      await refresh();
    };
    form.append(r1, r2, go, note);
  }
  refresh();
  return { refresh };
}
