// @ts-check
// BUNNYFALL (2026-11-06, the owner: "we have two world events currently, the cannon for gatherers and nyx but no way to
// communicate that in game, an event board when they start the game would be nice, you can build it with in game
// assets", "the event board should also really push for our discord"; asked: once a session, on entering the world):
// THE WORLD EVENTS BOARD. A town crier's board of the realm's standing events - the Purple Haze over Cromwark (Nyx's
// coins and titles) and the Great Cannon by Wayrest (its build as it stands) - and the Discord, pinned largest. Dressed
// in the game's own wood and parchment (public/art) with its own item pictures (a Nyx coin, an ingot, a plank). It
// opens itself once a session (sessionStorage), and a notice tab at the screen's edge opens it again. A plain DOM layer:
// it takes no host slot, and Esc, its Close or a click outside put it away.
import { registerOverlay } from './enhanced/enhancedOverlays.js';
import { itemIconUrl } from './enhanced/enhancedArt.js';
import { nyxCoins } from '../systems/wild/nyxShop.js';
import { mintMaterialItem } from '../systems/professions/profItems.js';
import { dialFileUrl } from './grimoireArt.js';
import { pauseFlowShowing } from './pauseDoor.js';
import { loadingHeld } from './loadingScreen.js';   // the public art, addressed as the game's other windows address it

export const DISCORD_URL = 'https://discord.gg/eNGsgr8BZt';
const ID = 'bf-events-board', TAB_ID = 'bf-events-tab', SEEN_KEY = 'bunnyfall.eventsBoard.shown';
const WOOD = () => dialFileUrl('grimoire-wood.jpg'), PARCH = () => dialFileUrl('grimoire-loot-parchment.png');
const CSS = () => `
#${ID} { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center;
  background: rgba(8, 5, 2, 0.55); }
#${ID} .board { position: relative; width: min(900px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow-y: auto;
  padding: 26px 26px 22px; box-sizing: border-box; border-radius: 6px; border: 3px solid rgb(58, 38, 18);
  background: url(${WOOD()}) center / 301px 567px repeat, rgb(74, 48, 24);
  box-shadow: inset 0 0 0 2px rgb(120, 84, 40), inset 0 0 40px rgba(0,0,0,0.6), 0 18px 60px rgba(0,0,0,0.7);
  font-family: Georgia, 'Times New Roman', serif; color: rgb(48, 30, 12); }
#${ID} h1 { margin: 0 0 4px; text-align: center; color: rgb(243, 226, 150); font-size: 30px; letter-spacing: 0.12em;
  text-transform: uppercase; text-shadow: 2px 2px 0 rgb(40, 24, 8), 0 0 18px rgba(243, 200, 90, 0.35); }
#${ID} .sub { text-align: center; color: rgb(226, 206, 160); margin: 0 0 18px; font-style: italic; text-shadow: 1px 1px 0 #000; }
#${ID} .notes { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 18px; }
#${ID} .note { position: relative; padding: 22px 18px 16px; border-radius: 3px;
  background: url(${PARCH()}) center / cover, rgb(222, 200, 152);
  box-shadow: 0 6px 16px rgba(0,0,0,0.5); transform: rotate(var(--tilt, 0deg)); }
#${ID} .note::before { content: ''; position: absolute; top: 7px; left: 50%; width: 14px; height: 14px; margin-left: -7px;
  border-radius: 50%; background: radial-gradient(circle at 35% 35%, rgb(230, 90, 70), rgb(110, 20, 12));
  box-shadow: 0 2px 3px rgba(0,0,0,0.6); }
#${ID} .note h2 { margin: 4px 0 6px; font-size: 19px; color: rgb(92, 24, 14); letter-spacing: 0.04em; }
#${ID} .note p { margin: 6px 0; font-size: 14.5px; line-height: 1.4; }
#${ID} .note .where { font-size: 13px; color: rgb(84, 60, 30); font-style: italic; }
#${ID} .icons { display: flex; gap: 6px; float: right; margin: 0 0 4px 8px; }
#${ID} .icons img { width: 40px; height: 40px; image-rendering: pixelated; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.45)); }
#${ID} .bar { height: 10px; border-radius: 5px; background: rgba(60, 36, 12, 0.25); overflow: hidden; margin: 8px 0 2px; }
#${ID} .bar > i { display: block; height: 100%; background: linear-gradient(90deg, rgb(140, 60, 18), rgb(232, 160, 72)); }
#${ID} .discord { margin: 20px 0 0; padding: 16px 18px; border-radius: 6px; display: flex; align-items: center; gap: 16px;
  flex-wrap: wrap; background: linear-gradient(135deg, rgb(88, 101, 242), rgb(64, 72, 190)); color: #fff;
  border: 2px solid rgb(180, 190, 255); box-shadow: 0 6px 18px rgba(0,0,0,0.5); }
#${ID} .discord .t { flex: 1 1 280px; }
#${ID} .discord b { display: block; font-size: 20px; letter-spacing: 0.03em; }
#${ID} .discord span { font-size: 14.5px; opacity: 0.95; }
#${ID} .discord a { flex: 0 0 auto; padding: 12px 22px; border-radius: 6px; background: #fff; color: rgb(64, 72, 190);
  font: 700 16px system-ui, sans-serif; text-decoration: none; box-shadow: 0 3px 0 rgba(0,0,0,0.25); }
#${ID} .discord a:hover { transform: translateY(-1px); }
#${ID} .close { display: block; margin: 18px auto 0; padding: 9px 26px; border-radius: 4px; cursor: pointer;
  border: 2px solid rgb(201, 164, 74); background: rgb(48, 30, 12); color: rgb(243, 226, 150); font: 700 15px Georgia, serif; }
#${TAB_ID} { position: fixed; right: 14px; top: calc(38% - 56px); z-index: 40; width: 44px; height: 44px; padding: 0;
  border-radius: 6px; border: 2px solid rgb(201, 164, 74); cursor: pointer; font-size: 22px; line-height: 40px;
  background: url(${WOOD()}) center / 120px auto, rgb(74, 48, 24); color: rgb(243, 226, 150);
  box-shadow: 0 0 0 1px rgb(40,28,10), 0 4px 14px rgba(0,0,0,0.55); }
#${TAB_ID}:hover { transform: scale(1.08); }
@media (max-width: 560px) { #${ID} h1 { font-size: 22px; } #${ID} .board { padding: 18px 14px; display: flex; flex-direction: column; }
  #${ID} h1, #${ID} .sub { order: -2; } #${ID} .discord { order: -1; margin: 0 0 16px; } }
`;

const store = {
  get(k) { try { return globalThis.sessionStorage?.getItem(k) ?? null; } catch { return null; } },
  set(k, v) { try { globalThis.sessionStorage?.setItem(k, v); } catch { /* a private window keeps nothing */ } },
};
const el = (/** @type {string} */ tag, /** @type {string|null} */ cls = null, /** @type {string|null} */ text = null) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/**
 * @param {{
 *   cannon?: () => ({ round: number, share: number } | null),
 *   askCannon?: () => any,
 *   cromwark?: boolean,
 *   ready?: () => boolean,
 * }} deps `ready`: the world stands (not loading, not the menu) - the board waits for it
 */
export function createWorldEventsBoard(deps = {}) {
  if (typeof document === 'undefined') return { frame() {}, open() {}, close() {} };
  let root = null, offOverlay = null, tick = null;
  const pics = (() => {
    const mk = () => ({ coin: itemIconUrl(nyxCoins(1)), ingot: itemIconUrl(mintMaterialItem('ingot:iron')), plank: itemIconUrl(mintMaterialItem('plank:oak')) });
    let got = mk();
    return () => { if (!got.coin || !got.ingot || !got.plank) got = mk(); return got; };
  })();
  function style() {
    if (document.getElementById(`${ID}-style`)) return;
    const st = document.createElement('style'); st.id = `${ID}-style`; st.textContent = CSS(); document.head.append(st);
  }
  function icons(/** @type {Array<string|null>} */ urls) {
    const box = el('div', 'icons');
    for (const u of urls) if (u) { const i = /** @type {HTMLImageElement} */ (el('img')); i.src = u; i.alt = ''; box.append(i); }
    return box;
  }
  function render() {
    if (!root) return;
    const board = root.querySelector('.board');
    if (!board) return;
    const p = pics();
    board.replaceChildren();
    board.append(el('h1', null, 'Notices of the Realm'), el('p', 'sub', 'What stirs in the Iliac Bay. Read, then go and make your mark.'));
    const notes = el('div', 'notes');
    if (deps.cromwark !== false) {
      const n = el('section', 'note'); n.style.setProperty('--tilt', '-1.2deg');
      n.append(icons([p.coin]), el('h2', null, 'The Purple Haze over Cromwark'),
        el('p', null, 'A daedric haze has swallowed the Cromwark reach. Its foes come back stronger, and they drop Nyx coins, more of them the deeper you go.'),
        el('p', null, 'Spend the coins at Nyx\'s camp by the reach for titles and gear no shop sells. No teleporting in or out: walk, and mind the haze timer.'),
        el('p', 'where', 'Where: the Wrothgarian Mountains, east of Wrothgaria. For seasoned adventurers.'));
      notes.append(n);
    }
    {
      const n = el('section', 'note'); n.style.setProperty('--tilt', '1deg');
      const c = deps.cannon?.() ?? null;
      n.append(icons([p.ingot, p.plank]), el('h2', null, 'The Great Cannon of Wayrest'),
        el('p', null, 'The realm is building a cannon to fire on Cromwark, and every pair of hands counts. Bring ingots and planks, from iron and pine up to ebony and ironwood.'),
        el('p', null, 'Every gift pays Nyx coins, the rarer the material the more. When the cannon is whole it fires, and a new one is begun.'));
      if (c) {
        const bar = el('div', 'bar'); const fill = el('i'); fill.style.width = `${Math.round(c.share * 100)}%`; bar.append(fill);
        n.append(bar, el('p', 'where', `Cannon ${c.round}: ${Math.floor(c.share * 100)}% built.`));
      }
      n.append(el('p', 'where', 'Where: the open ground beside Wayrest, marked on your map. Any level.'));
      notes.append(n);
    }
    board.append(notes);
    const d = el('div', 'discord');
    const tx = el('div', 't');
    tx.append(el('b', null, 'Join us on Discord'), el('span', null, 'Event news first, groups for the Cromwark reach, trades, help, and the people you play with. Come say hello.'));
    const a = /** @type {HTMLAnchorElement} */ (el('a', null, 'Join the Discord'));
    a.href = DISCORD_URL; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.addEventListener('click', (e) => e.stopPropagation());
    d.append(tx, a);
    board.append(d);
    const close = /** @type {HTMLButtonElement} */ (el('button', 'close', 'To the road'));
    close.type = 'button';
    close.addEventListener('click', (e) => { e.stopPropagation(); closeBoard(); });
    board.append(close);
  }
  function openBoard() {
    if (root) return;
    style();
    root = el('div');
    root.id = ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Notices of the Realm');
    const board = el('div', 'board');
    root.append(board);
    for (const ty of ['pointerdown', 'mousedown', 'mouseup', 'wheel', 'contextmenu', 'touchstart', 'keydown']) root.addEventListener(ty, (e) => e.stopPropagation());
    root.addEventListener('click', (e) => { if (e.target === root) closeBoard(); else e.stopPropagation(); });
    document.body.append(root);
    offOverlay = registerOverlay(closeBoard);
    try { deps.askCannon?.(); } catch { /* the board stands without the build */ }
    render();
    tick = setInterval(render, 1500);
  }
  function closeBoard() {
    if (!root) return;
    clearInterval(tick); tick = null;
    try { offOverlay?.(); } catch { /* gone already */ }
    offOverlay = null;
    root.remove(); root = null;
  }
  function onKey(/** @type {KeyboardEvent} */ e) { if (root && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeBoard(); } }
  globalThis.addEventListener?.('keydown', onKey, { capture: true });
  function drawTab(show) {
    let b = document.getElementById(TAB_ID);
    if (!show) { if (b) b.style.display = 'none'; return; }
    if (!b) {
      style();
      b = el('button', null, '📜');
      b.id = TAB_ID; b.setAttribute('type', 'button');
      b.title = 'Notices of the Realm: events and our Discord';
      b.setAttribute('aria-label', 'Open the notices of the realm');
      for (const ty of ['pointerdown', 'mousedown', 'mouseup', 'touchstart']) b.addEventListener(ty, (e) => e.stopPropagation());
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openBoard(); });
      document.body.append(b);
    }
    b.style.display = root ? 'none' : '';
  }
  return {
    /** Each world frame: the board opens itself once a session, once the world stands; the tab stands beside play. */
    frame() {
      const ok = (deps.ready?.() ?? true) && !pauseFlowShowing() && !loadingHeld();
      drawTab(ok);
      if (ok && store.get(SEEN_KEY) !== '1') { store.set(SEEN_KEY, '1'); openBoard(); }
    },
    open: openBoard,
    close: closeBoard,
  };
}
