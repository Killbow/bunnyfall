// @ts-check
// BUNNYFALL (2026-11-27): THE TAVERN DOOR'S PAPERDOLL SECTION. The custom paperdoll worn online, on the front door's left: the
// worn one drawn large (its front, as ui/skinsPanel.js previews it), arrows through the account's approved skins and "the usual
// paperdoll", Wear this, and a link to the skins page (skins.html) to upload or manage. It asks the same account door the old
// Paperdoll button's panel asks (net/accountClient.js skinsMine, skinsGet, skinsWear) - no new route. Nobody signed in: no section
// (hostSection returns null), and the hall shows more of itself.
import { storedSession, serviceBase, skinsMine, skinsGet, skinsWear, accountRefusalText } from '../net/accountClient.js';
import { PIXEL_STACK } from './pixelifyFive.js';
import { t } from './textManager.js';
import { TAVERN_ART } from './tavernFrontDoor.js';
import { APP_ROOT } from '../platform/appRoot.js';

const STYLE_ID = 'bf-tavern-doll-style';
const CSS = `
.td-doll-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; border-bottom: 2px solid rgba(90,42,18,.5); padding-bottom: 8px; }
.td-doll-head h2 { margin: 0; font-family: 'Jacquard 12', ${PIXEL_STACK}; font-weight: 400; font-size: 40px; line-height: 1; color: var(--td-wax); }
.td-doll-head span { font-size: 14px; letter-spacing: .12em; text-transform: uppercase; color: var(--td-soft); }
.td-doll-stage { display: flex; align-items: center; gap: 8px; }
.td-arrow { position: relative; isolation: isolate; width: 44px; height: 44px; flex: none; padding: 0; border: 0; background: none; cursor: pointer; color: var(--td-ink); font: 22px/1 ${PIXEL_STACK}; }
.td-arrow::before { content: ''; position: absolute; inset: 0; z-index: -1; background: radial-gradient(ellipse at 40% 35%, #d8c28a, #b4945a); box-shadow: inset 0 0 8px rgba(80,35,12,.6), 2px 3px 0 rgba(20,8,2,.55); filter: url(#td-rough); }
.td-arrow:hover::before, .td-arrow:focus-visible::before { background: radial-gradient(ellipse at 40% 35%, #e6d3a0, #c6a66a); }
.td-arrow:focus-visible { outline: 3px solid var(--td-gold); outline-offset: 3px; }
.td-arrow[disabled] { opacity: .45; cursor: default; }
.td-well { flex: 1; height: 350px; display: flex; align-items: flex-end; justify-content: center; padding: 0 0 18px; overflow: hidden;
  background: radial-gradient(ellipse 150px 190px at 50% 75%, rgba(216,194,138,.6), rgba(216,194,138,0) 75%), rgba(70,34,14,.3);
  border: 2px solid rgba(90,42,18,.6); box-shadow: inset 0 0 18px rgba(40,16,5,.5); }
.td-well img { max-height: 300px; max-width: 100%; width: auto; height: auto; image-rendering: pixelated; }
.td-well .td-usual { align-self: center; padding: 0 16px; text-align: center; color: var(--td-soft); font-size: 16px; }
.td-doll-name { text-align: center; display: flex; flex-direction: column; }
.td-doll-name b { font-family: 'Jacquard 12', ${PIXEL_STACK}; font-weight: 400; font-size: 36px; line-height: 1.1; color: var(--td-ink); }
.td-doll-name span { font-size: 14px; letter-spacing: .06em; color: var(--td-soft); }
.td-doll-msg { min-height: 20px; margin: 0; text-align: center; font-size: 14px; color: var(--td-soft); }
.td-doll-msg.bad { color: var(--td-ruby); }
.td-doll-acts { display: flex; gap: 14px; margin-top: auto; }
.td-doll-acts .td-parch { flex: 1; align-items: center; justify-content: center; padding: 8px 14px; font-size: 14px; letter-spacing: .12em; text-transform: uppercase; min-height: 44px; }
.td-doll-acts .td-parch[disabled] { opacity: .6; cursor: default; }
`;

/**
 * @param {{ storage: any, doc?: Document, fetch?: typeof globalThis.fetch }} deps
 * @returns {HTMLElement | null} the section, or null when nobody is signed in
 */
export function tavernPaperdoll({ storage, doc = globalThis.document, fetch = (...a) => globalThis.fetch(.../** @type {[any, any]} */ (a)) }) {
  const session = storedSession(storage);
  if (!session) return null;
  if (!doc.getElementById(STYLE_ID)) { const s = doc.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; doc.head.append(s); }
  const io = () => ({ fetch, base: serviceBase(storage), secret: session.secret });
  const el = (/** @type {string} */ tag, /** @type {string} */ cls = '', /** @type {string} */ text = '') => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };

  const root = el('section', 'td-panel td-doll');
  root.setAttribute('aria-label', t('menu.tavern.dollAria', 'Your custom paperdoll'));
  const seal = /** @type {HTMLImageElement} */ (el('img', 'td-seal green'));
  seal.src = new URL(`art/${TAVERN_ART.sealGreen}`, APP_ROOT).href; seal.alt = ''; seal.setAttribute('aria-hidden', 'true');
  const head = el('div', 'td-doll-head');
  head.append(el('h2', '', t('menu.tavern.doll', 'Your Paperdoll')));
  const worn = el('span');
  head.append(worn);
  const prev = /** @type {HTMLButtonElement} */ (el('button', 'td-arrow', '‹')); prev.type = 'button'; prev.setAttribute('aria-label', t('menu.tavern.dollPrev', 'Previous paperdoll'));
  const next = /** @type {HTMLButtonElement} */ (el('button', 'td-arrow', '›')); next.type = 'button'; next.setAttribute('aria-label', t('menu.tavern.dollNext', 'Next paperdoll'));
  const well = el('div', 'td-well');
  const stage = el('div', 'td-doll-stage'); stage.append(prev, well, next);
  const nameBox = el('div', 'td-doll-name');
  const msg = el('p', 'td-doll-msg');
  msg.setAttribute('role', 'status');
  const wear = /** @type {HTMLButtonElement} */ (el('button', 'td-parch gold', t('menu.tavern.dollWear', 'Wear this'))); wear.type = 'button';
  const manage = /** @type {HTMLAnchorElement} */ (el('a', 'td-parch', t('menu.tavern.dollManage', 'Upload or manage')));
  manage.href = 'skins.html'; manage.target = '_blank'; manage.rel = 'noopener';
  const acts = el('div', 'td-doll-acts'); acts.append(wear, manage);
  root.append(seal, head, stage, nameBox, msg, acts);

  /** The usual paperdoll (null) first, then the account's approved skins. @type {Array<any>} */
  let list = [null];
  let wornId = /** @type {string | null} */ (null);
  let at = 0;
  /** @type {Map<string, string>} */ const fronts = new Map();

  const say = (/** @type {string} */ text, bad = false) => { msg.textContent = text; msg.className = `td-doll-msg${bad ? ' bad' : ''}`; };

  async function preview(/** @type {any} */ s) {
    if (!s) return null;
    if (fronts.has(s.id)) return fronts.get(s.id) ?? null;
    const r = await skinsGet(io(), s.id).catch(() => null);
    if (!r?.ok) return null;
    const src = `data:image/png;base64,${r.data.front}`;
    fronts.set(s.id, src);
    return src;
  }

  async function draw() {
    const s = list[at];
    const shown = at;
    well.replaceChildren();
    prev.disabled = next.disabled = list.length < 2;
    worn.textContent = (s?.id ?? null) === wornId ? t('menu.tavern.dollWorn', 'Worn online') : '';
    nameBox.replaceChildren(el('b', '', s ? s.name : t('menu.tavern.dollUsual', 'The usual paperdoll')),
      el('span', '', s ? `${Math.round(s.height * 100)}% ${t('menu.tavern.dollHeight', "of a player's height")}` : t('menu.tavern.dollUsualNote', 'Your character as the game draws it')));
    wear.disabled = (s?.id ?? null) === wornId;
    if (!s) { well.append(el('div', 'td-usual', t('menu.tavern.dollUsualNote', 'Your character as the game draws it'))); return; }
    const src = await preview(s);
    if (shown !== at) return;   // the player moved on while the picture came
    if (!src) { well.append(el('div', 'td-usual', accountRefusalText('server'))); return; }
    const img = /** @type {HTMLImageElement} */ (el('img')); img.src = src; img.alt = s.name;
    well.append(img);
  }

  const step = (/** @type {number} */ d) => { at = (at + d + list.length) % list.length; say(''); draw(); };
  prev.onclick = () => step(-1);
  next.onclick = () => step(1);
  wear.onclick = async () => {
    const s = list[at];
    wear.disabled = true; say(t('menu.tavern.dollSaving', 'Saving...'));
    const r = await skinsWear(io(), s?.id ?? null).catch(() => null);
    if (!r?.ok) { say(accountRefusalText(r?.error ?? 'server'), true); wear.disabled = false; return; }
    wornId = s?.id ?? null;
    say(wornId ? t('menu.tavern.dollDone', 'Done. Others see it the next time they meet you.') : t('menu.tavern.dollBack', 'Back to the usual paperdoll.'));
    draw();
  };

  skinsMine(io()).then((r) => {
    if (!r?.ok) { say(accountRefusalText(r?.error ?? 'server'), true); draw(); return; }
    const skins = (r.data.skins ?? []).filter((/** @type {any} */ s) => s.status === 'approved');
    list = [null, ...skins];
    wornId = r.data.worn ?? null;
    at = Math.max(0, list.findIndex((s) => (s?.id ?? null) === wornId));
    if (r.data.disabled) say(accountRefusalText('skin-disabled'), true);
    draw();
  }).catch(() => { say(accountRefusalText('server'), true); draw(); });
  draw();
  return root;
}
