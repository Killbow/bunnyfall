// @ts-check
// BUNNYFALL (2026-11-27, the owner: "a new main menu ... more tavern like, the logo on the upper left, the options on the
// right in a list with a minor set of options at the bottom"): THE TAVERN FRONT DOOR, the boot main menu's face (not ui/tavernDoor.js, which is the innkeeper panel's door). It draws the
// hall behind the doors (public/art/bunnyfall-tavern), the wood rail of the launcher and the site with the real logo and
// its line, the player's custom paperdoll on the left (ui/tavernPaperdoll.js), and on the right the doors on parchment:
// ONLINE first and large, Settings, Overhauls and Tutorials under it, and the minor ones (Play Offline, Screenshots, About)
// in a row at the foot. Pure drawing: enhancedMenu.js renderHome owns what each door does and hands it in, so Continue's,
// New Game's and Online's laws stay where they live. The colours are the launcher's and the site's (app/launcher/launcher.css,
// landing.css): ink #2e160b on parchment, sealing-wax red, gold.
import { PIXEL_STACK } from './pixelifyFive.js';
import { BRAND_LOGO_URL, brandLogoAlt } from './brandMark.js';
import { APP_ROOT } from '../platform/appRoot.js';
import { t } from './textManager.js';

const STYLE_ID = 'bf-tavern-door-style';
const art = (/** @type {string} */ file) => new URL(`art/${file}`, APP_ROOT).href;
export const TAVERN_ART = Object.freeze({
  hall: 'bunnyfall-tavern/tavern.webp',
  wood: 'bunnyfall-decor/wood.png',
  sealRed: 'bunnyfall-decor/seal-red.png',
  sealGreen: 'bunnyfall-decor/seal-green.png',
  book: 'bunnyfall-decor/spellbook.png',
  coin: 'bunnyfall-decor/argent.png',
  token: 'bunnyfall-decor/dusk-token.png',
  quill: 'bunnyfall-decor/feather.png',
  bunny: 'bunnyfall-decor/bunny-cheer.png',
});

const HEAD = `'Jacquard 12', ${PIXEL_STACK}`;
const CSS = `
.td-home { --td-ink:#2e160b; --td-soft:#43250f; --td-wax:#7a1d12; --td-ruby:#a3281c; --td-gold:#e8b030; --td-cream:#f0e0b4; --td-edge:#5a2a12;
  position: fixed; inset: 0; overflow: hidden auto; background: #140b06 !important; color: var(--td-ink); font-family: ${PIXEL_STACK}; font-size: 17px; line-height: 1.45; }
.td-home *, .td-home *::before, .td-home *::after { box-sizing: border-box; }
.td-home img { image-rendering: pixelated; }
.td-bg { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 38% 50%; z-index: 0; pointer-events: none; }
.td-shade { position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background: radial-gradient(ellipse at 50% 52%, rgba(0,0,0,0) 45%, rgba(0,0,0,.78) 100%), rgba(13,6,3,.42); }
.td-rail { position: relative; z-index: 2; height: 116px; background: #5f381d var(--td-wood) 0 0 / auto 116px repeat-x; image-rendering: pixelated; box-shadow: 0 4px 0 rgba(0,0,0,.45); }
.td-rail::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 3px; background: rgba(255,214,150,.38); }
.td-rail::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 11px; background: linear-gradient(rgba(20,10,4,0), rgba(20,10,4,.75) 66%, #1c1108 66%); }
.td-logo { position: absolute; left: clamp(16px, 4vw, 56px); top: 8px; margin: 0; z-index: 2; }
.td-logo img { display: block; width: 300px; max-width: 52vw; height: auto; image-rendering: auto; filter: drop-shadow(2px 3px 0 rgba(20,10,4,.6)); }
.td-sub { position: absolute; left: clamp(20px, 4vw, 60px); top: 82px; margin: 0; z-index: 2; font-size: 15px; letter-spacing: .1em; text-transform: uppercase; color: var(--td-cream); text-shadow: 2px 2px 0 rgba(20,10,4,.8); max-width: 60vw; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.td-shelf { position: absolute; left: 50%; top: 0; width: 0; height: 116px; z-index: 1; pointer-events: none; }
.td-shelf img { position: absolute; filter: drop-shadow(2px 3px 0 rgba(20,10,4,.55)); image-rendering: auto; }
.td-shelf .token { left: -80px; top: 50px; width: 26px; transform: rotate(-12deg); }
.td-shelf .coin { left: -50px; top: 62px; width: 34px; }
.td-shelf .book { left: 0; top: 12px; width: 132px; transform: rotate(-4deg); }
.td-shelf .quill { left: 142px; top: 42px; width: 40px; transform: rotate(24deg); image-rendering: pixelated; }
.td-marks { position: absolute; right: clamp(12px, 3vw, 56px); top: 30px; z-index: 3; display: flex; align-items: center; gap: 8px; }
.td-marks > * { position: static !important; inset: auto !important; margin: 0; }
.td-marks .px-support { padding: 0; gap: 8px; background: none; border: 0; }
.td-main { position: relative; z-index: 1; display: flex; align-items: flex-start; justify-content: space-between; gap: 32px; padding: 36px clamp(16px, 5vw, 96px) 40px clamp(16px, 5vw, 72px); min-height: calc(100dvh - 116px); }
.td-doll { position: relative; flex: 0 0 400px; width: 400px; min-height: 620px; display: flex; flex-direction: column; gap: 14px; }
.td-right { margin-left: auto; width: 560px; max-width: 100%; display: flex; flex-direction: column; gap: 14px; }
.td-panel { position: relative; background: rgba(184,158,100,.95); border: 3px solid var(--td-edge); box-shadow: 0 0 0 2px rgba(200,170,110,.35), 5px 5px 0 rgba(10,4,1,.6); padding: 18px 20px 22px; }
.td-menu { display: flex; flex-direction: column; gap: 20px; padding: 26px 26px 28px; }
.td-seal { position: absolute; width: 56px; height: auto; pointer-events: none; filter: drop-shadow(2px 2px 0 rgba(10,4,1,.5)); z-index: 3; image-rendering: auto; }
.td-seal.red { right: -22px; top: -22px; transform: rotate(12deg); }
.td-seal.green { right: -18px; bottom: -18px; transform: rotate(-8deg); }
.td-parch { position: relative; isolation: isolate; display: flex; flex-direction: column; text-align: left; text-decoration: none; color: var(--td-ink); background: none; border: 0; cursor: pointer; font: inherit; padding: 14px 28px 16px; min-height: 44px; }
.td-parch::before { content: ''; position: absolute; inset: 0; z-index: -1; background: radial-gradient(ellipse at 40% 35%, #d8c28a 0%, #c8ac72 55%, #b4945a 100%);
  box-shadow: inset 0 0 16px rgba(80,35,12,.6), inset 0 0 3px rgba(60,25,8,.7), 3px 4px 0 rgba(20,8,2,.55); filter: url(#td-rough); transition: background .15s; }
.td-parch:hover::before, .td-parch:focus-visible::before { background: radial-gradient(ellipse at 40% 35%, #e6d3a0 0%, #d9c088 55%, #c6a66a 100%); }
.td-parch:focus-visible { outline: 3px solid var(--td-gold); outline-offset: 4px; }
.td-parch:active { transform: translate(2px, 2px); }
.td-parch.gold::before { background: radial-gradient(ellipse at 40% 35%, #ecbc3c 0%, #d9a226 55%, #b9801f 100%); }
.td-parch.gold:hover::before, .td-parch.gold:focus-visible::before { background: radial-gradient(ellipse at 40% 35%, #f6cf5a 0%, #e5ae30 55%, #c98d26 100%); }
.td-nm { font-family: ${HEAD}; font-size: 42px; line-height: 1; color: var(--td-ink); transition: color .15s; }
.td-parch:hover .td-nm, .td-parch:focus-visible .td-nm { color: var(--td-wax); }
.td-parch.gold:hover .td-nm, .td-parch.gold:focus-visible .td-nm { color: var(--td-ink); }
.td-sub2 { font-size: 15px; color: var(--td-soft); }
.td-hero { padding: 30px 32px; }
.td-hero .td-nm { font-size: 76px; line-height: .95; }
.td-hero .td-sub2 { font-size: 19px; letter-spacing: .04em; color: var(--td-ink); }
.td-head { margin: 0; font-family: ${HEAD}; font-weight: 400; font-size: 40px; line-height: 1; color: var(--td-wax); }
.td-note { margin: 0; font-size: 15px; color: var(--td-soft); }
.td-minor { display: flex; flex-wrap: wrap; justify-content: space-between; border-top: 2px dashed rgba(240,224,180,.3); padding: 10px 26px 0; }
.td-minor button { font-family: ${PIXEL_STACK}; font-size: 15px; letter-spacing: .14em; text-transform: uppercase; color: var(--td-cream); text-shadow: 2px 2px 0 rgba(10,4,1,.85); background: none; border: 0; cursor: pointer;
  text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 5px; text-decoration-color: rgba(240,224,180,.35); padding: 12px 6px; min-height: 44px; }
.td-minor button:hover, .td-minor button:focus-visible { color: var(--td-gold); text-decoration-color: var(--td-gold); outline: none; }
.td-minor button:focus-visible { outline: 2px solid var(--td-gold); outline-offset: 2px; }
.td-bunny { position: fixed; bottom: 0; left: 43.7vw; width: clamp(150px, 15vw, 240px); height: auto; transform: translateX(-50%); z-index: 1; pointer-events: none; filter: drop-shadow(3px 4px 0 rgba(10,4,1,.55)); }
.td-build { position: absolute; left: clamp(16px, 5vw, 72px); bottom: 20px; margin: 0; z-index: 1; font-size: 14px; letter-spacing: .12em; text-transform: uppercase; color: var(--td-cream); text-shadow: 2px 2px 0 rgba(10,4,1,.85); }
@media (max-width: 1000px) {
  .td-main { flex-direction: column-reverse; align-items: stretch; }
  .td-right, .td-doll { width: 100%; flex-basis: auto; margin-left: 0; }
  .td-shelf, .td-bunny { display: none; }
  .td-hero .td-nm { font-size: 56px; }
  .td-build { position: static; padding: 0 16px 16px; }
}
@media (max-width: 560px) { .td-nm { font-size: 34px; } .td-hero .td-nm { font-size: 44px; } .td-menu { padding: 20px 14px; } }
`;

function ensureStyle(/** @type {Document} */ doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const s = doc.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  doc.head.append(s);
}

/** @param {Document} doc @param {string} tag @param {string} [cls] @param {string} [text] */
function el(doc, tag, cls, text) {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/**
 * @typedef {{ id: string, label: string, sub?: string, onClick: () => void }} TavernDoor
 * @typedef {{ level: 'top' | 'offline', online: TavernDoor, main: TavernDoor[], offline: { head: string, note: string, doors: TavernDoor[], back: TavernDoor },
 *   minor: TavernDoor[], marks: Node[], paperdoll: Node | null, build: string }} TavernHome
 * @param {Document} doc
 * @param {TavernHome} o
 * @returns {HTMLElement}
 */
export function buildTavernHome(doc, o) {
  ensureStyle(doc);
  const root = el(doc, 'div', 'px-home td-home');
  root.style.setProperty('--td-wood', `url("${art(TAVERN_ART.wood)}")`);

  // the roughening the parchment pieces share: torn edges (one filter, defined once in the face)
  const defs = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  defs.setAttribute('width', '0'); defs.setAttribute('height', '0');
  defs.setAttribute('style', 'position:absolute'); defs.setAttribute('aria-hidden', 'true');
  defs.innerHTML = '<defs><filter id="td-rough" x="-5%" y="-10%" width="110%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.05 0.07" numOctaves="3" seed="11" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G"/></filter></defs>';
  root.append(defs);

  const bg = /** @type {HTMLImageElement} */ (el(doc, 'img', 'td-bg'));
  bg.src = art(TAVERN_ART.hall); bg.alt = ''; bg.setAttribute('aria-hidden', 'true'); bg.draggable = false;
  root.append(bg, el(doc, 'div', 'td-shade'));

  // THE RAIL
  const rail = el(doc, 'header', 'td-rail');
  const h1 = el(doc, 'h1', 'td-logo');
  const logo = /** @type {HTMLImageElement} */ (el(doc, 'img'));
  logo.src = BRAND_LOGO_URL; logo.alt = brandLogoAlt(); logo.width = 1600; logo.height = 382; logo.draggable = false;
  h1.append(logo);
  rail.append(h1, el(doc, 'p', 'td-sub', t('menu.tavern.sub', 'A Daggerfall tavern tale of the Iliac Bay')));
  const shelf = el(doc, 'div', 'td-shelf');
  shelf.setAttribute('aria-hidden', 'true');
  for (const [cls, file] of /** @type {const} */ ([['token', TAVERN_ART.token], ['coin', TAVERN_ART.coin], ['book', TAVERN_ART.book], ['quill', TAVERN_ART.quill]])) {
    const i = /** @type {HTMLImageElement} */ (el(doc, 'img', cls));
    i.src = art(file); i.alt = ''; i.draggable = false;
    shelf.append(i);
  }
  rail.append(shelf);
  const marks = el(doc, 'div', 'td-marks');
  for (const m of o.marks) marks.append(m);
  rail.append(marks);
  root.append(rail);

  // THE HALL: the paperdoll (signed in only) on the left, the doors on the right
  const main = el(doc, 'main', 'td-main');
  if (o.paperdoll) main.append(o.paperdoll);
  const right = el(doc, 'div', 'td-right');
  const menu = /** @type {HTMLElement} */ (el(doc, 'nav', 'td-panel td-menu'));
  menu.setAttribute('aria-label', t('menu.home.aria', 'Main menu'));
  menu.dataset.level = o.level;
  const seal = /** @type {HTMLImageElement} */ (el(doc, 'img', 'td-seal red'));
  seal.src = art(TAVERN_ART.sealRed); seal.alt = ''; seal.setAttribute('aria-hidden', 'true');
  menu.append(seal);

  /** @param {TavernDoor} d @param {string} [extra] */
  const door = (d, extra = '') => {
    const b = /** @type {HTMLButtonElement} */ (el(doc, 'button', `td-parch td-door door-${d.id} ${extra}`.trim()));
    b.type = 'button';
    b.append(el(doc, 'span', 'td-nm', d.label));
    if (d.sub) b.append(el(doc, 'span', 'td-sub2', d.sub));
    // a double click's second click is no door's - a door drawn under the pointer by the first took it
    b.onclick = (e) => { if (e?.detail > 1) return; d.onClick(); };
    return b;
  };
  if (o.level === 'offline') {
    menu.append(el(doc, 'h2', 'td-head', o.offline.head), el(doc, 'p', 'td-note', o.offline.note));
    for (const d of o.offline.doors) menu.append(door(d));
    menu.append(door(o.offline.back));
  } else {
    menu.append(door(o.online, 'gold td-hero'));
    for (const d of o.main) menu.append(door(d));
  }
  const minor = el(doc, 'div', 'td-minor');
  for (const d of o.minor) {
    const b = /** @type {HTMLButtonElement} */ (el(doc, 'button', `td-minorbtn door-${d.id}`, d.label));
    b.type = 'button';
    b.onclick = () => d.onClick();
    minor.append(b);
  }
  right.append(menu, minor);
  main.append(right);
  root.append(main);
  // the Bunnyfall rabbit, standing on the hall's floor in the gap between the paperdoll and the doors (the launcher's and the site's rabbit)
  const bunny = /** @type {HTMLImageElement} */ (el(doc, 'img', 'td-bunny'));
  bunny.src = art(TAVERN_ART.bunny); bunny.alt = ''; bunny.setAttribute('aria-hidden', 'true'); bunny.draggable = false;
  root.append(bunny);
  root.append(el(doc, 'p', 'td-build', o.build));
  return root;
}
