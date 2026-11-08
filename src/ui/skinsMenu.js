// @ts-check
// BUNNYFALL (2026-11-07): the main menu's PAPERDOLL button - a small mark under the owner's corner that opens the picker for
// the custom paperdoll worn online (ui/skinsPanel.js), with a link to the skins page (skins.html) to upload one.
import { storedSession, serviceBase } from '../net/accountClient.js';
import { mountSkinsPanel } from './skinsPanel.js';

const STYLE_ID = 'bf-skin-mark-style';
const CSS = `
.bf-skinmark { position: absolute; top: 72px; left: 18px; z-index: 5; }
.bf-skinmark > button { cursor: pointer; background: rgba(10,12,17,0.55); border: 2px solid #7d7460; color: #d9b45a; font: 13px/1 monospace; padding: 10px 12px; }
.bf-skinmark > button:hover, .bf-skinmark > button:focus-visible { border-color: #d9b45a; outline: none; }
.bf-skinwin { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.6); }
.bf-skinwin > div { width: min(560px, 92vw); max-height: 86vh; overflow: auto; background: #12161c; border: 2px solid #7d7460; padding: 14px 16px; color: #e8e2d0; font: 14px/1.45 system-ui, sans-serif; }
.bf-skinwin h2 { margin: 0 0 8px; font-size: 16px; letter-spacing: .08em; text-transform: uppercase; color: #d9b45a; }
.bf-skinwin .foot { display: flex; justify-content: space-between; gap: 10px; margin-top: 10px; }
.bf-skinwin .foot a, .bf-skinwin .foot button { color: #d9b45a; font: inherit; background: none; border: 2px solid #5a5444; padding: 5px 12px; cursor: pointer; text-decoration: none; }
@media (max-width: 700px) { .bf-skinmark { top: 64px; left: 10px; } }
`;

/**
 * @param {{ storage: any, doc?: Document }} deps
 */
export function skinMark({ storage, doc = globalThis.document }) {
  if (!doc.getElementById(STYLE_ID)) { const s = doc.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; doc.head.append(s); }
  const box = doc.createElement('div');
  box.className = 'bf-skinmark';
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Paperdoll';
  btn.title = 'Choose the custom paperdoll you wear online';
  box.append(btn);
  const io = () => { const s = storedSession(storage); return s ? { fetch: (/** @type {any[]} */ ...a) => globalThis.fetch(.../** @type {[any, any]} */ (a)), base: serviceBase(storage), secret: s.secret } : null; };
  btn.addEventListener('click', () => {
    const win = doc.createElement('div'); win.className = 'bf-skinwin';
    const card = doc.createElement('div');
    const h = doc.createElement('h2'); h.textContent = 'Paperdoll online';
    const body = doc.createElement('div');
    const foot = doc.createElement('div'); foot.className = 'foot';
    const up = doc.createElement('a'); up.href = '/skins.html'; up.target = '_blank'; up.rel = 'noopener'; up.textContent = 'Upload or manage skins';
    const close = doc.createElement('button'); close.type = 'button'; close.textContent = 'Close';
    const shut = () => win.remove();
    close.onclick = shut; win.addEventListener('click', (e) => { if (e.target === win) shut(); });
    foot.append(up, close); card.append(h, body, foot); win.append(card); doc.body.append(win);
    mountSkinsPanel(body, { io, manage: false });
  });
  return box;
}
