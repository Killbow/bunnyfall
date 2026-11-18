// BUNNYFALL: explicit mouse/touch pouring and the bound recipe book, on the normal overlay lifecycle.
import { TAVERN_DOSES, TAVERN_INGREDIENTS, TAVERN_RECIPES, tavernDoseCount } from '../net/tavernServiceLaw.js';
import { tavernIngredientName, tavernRecipeName, tavernRecipeNote } from '../systems/tavern/tavernServiceWords.js';
import { t } from '../systems/textManager.js';
import { releaseLook } from '../player/pointerLock.js';
import { registerOverlay } from './enhanced/enhancedOverlays.js';
import { TAVERN_SERVICE_STYLE } from './tavernServiceStyle.js';

const INKS = { wine: '#8e3545', cream: '#fff0cb', beer: '#d99734' };
export function el(tag, className, text, parent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  parent?.append(node);
  return node;
}
export function bottle(parent, ingredient) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 48 78'); svg.setAttribute('aria-hidden', 'true');
  for (const [d, fill, stroke] of [
    ['M17 3h14v7H17z', '#ad8650', '#553b25'],
    ['M18 10h12v16c0 6 10 8 10 18v25q0 6-6 6H14q-6 0-6-6V44c0-10 10-12 10-18z', '#4b6857', '#d3bc84'],
    ['M11 44h26v24q0 4-4 4H15q-4 0-4-4z', INKS[ingredient], 'none'],
    ['M13 49h22v14H13z', '#dfc592', '#a07b49'],
    ['M14 29v13', 'none', '#fff2c8'],
  ]) {
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', d); path.setAttribute('fill', fill); path.setAttribute('stroke', stroke); svg.append(path);
  }
  parent.append(svg);
}

/** Uses townTalk's overlay slot so movement, world clicks and mouse capture stay held. */
export function windowShell(kind, title, keys = ['Escape', 'Digit1', 'Digit2', 'Digit3', 'ArrowLeft', 'ArrowRight'], onClose = null) {
  if (!document.getElementById('tavern-service-style')) {
    const style = el('style'); style.id = 'tavern-service-style'; style.textContent = TAVERN_SERVICE_STYLE; document.head.append(style);
  }
  const previous = document.activeElement;
  const shell = el('div', 'ts-window');
  shell.setAttribute('role', 'dialog'); shell.setAttribute('aria-modal', 'true'); shell.setAttribute('aria-label', title);
  const body = el('section', kind, undefined, shell);
  let done = false, unregister = () => {};
  const close = () => {
    if (done) return;
    done = true; onClose?.(); unregister(); shell.remove(); window.removeEventListener('keydown', onKey, true);
    if (previous?.isConnected && typeof previous.focus === 'function') previous.focus({ preventScroll: true });
  };
  const overlay = { isChoiceWindow: true, get done() { return done; }, input: (code) => { if (code === 'Escape') close(); },
    draw() {}, click() {}, dispose: close };
  function onKey(e) {
    if (e.code === 'Tab') {
      // The game's QuickDial convention: Tab puts the current window away.
      e.preventDefault(); close();
    } else if (!e.repeat && !e.altKey && !e.ctrlKey && !e.metaKey) {
      if (keys.includes(e.code)) {
        e.preventDefault(); overlay.input(e.code);
      }
    }
    e.stopImmediatePropagation();
  }
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'contextmenu']) shell.addEventListener(type, (e) => {
    e.stopPropagation(); if (type === 'contextmenu') e.preventDefault();
  });
  window.addEventListener('keydown', onKey, true);
  unregister = registerOverlay(close); document.body.append(shell); releaseLook();
  const button = (parent, label, action, cls = '') => {
    const b = el('button', `ts-button ${cls}`, label, parent); b.type = 'button'; b.addEventListener('click', action); return b;
  };
  return { shell, body, overlay, close, button, focus: () => shell.querySelector('button:not(:disabled)')?.focus() };
}

/** Three floating pour points; every action still goes through the shared/server state machine. */
export function createTavernMixWindow({ state, busy, act, name, openBook }) {
  if (typeof document === 'undefined') return null;
  const w = windowShell('ts-counter', t('tavern.service.mixDrink', 'Mix a drink'));
  const header = el('header', '', undefined, w.body);
  el('p', 'ts-kicker', t('tavern.service.counter', 'Tavern service counter'), header);
  el('h1', '', name, header);
  el('p', 'ts-rule', t('tavern.service.clickPour', 'Choose a bottle. Each click pours one dose.'), header);
  const points = el('div', 'ts-points', undefined, w.body);
  const pourButtons = TAVERN_INGREDIENTS.map((ingredient, i) => {
    const b = el('button', 'ts-point', undefined, points); b.type = 'button';
    b.setAttribute('aria-label', t('tavern.service.pour', 'Pour one dose: {ingredient}', { ingredient: tavernIngredientName(ingredient) }));
    const orb = el('span', 'ts-orb', undefined, b); bottle(orb, ingredient); el('span', 'ts-key', String(i + 1), orb);
    el('span', '', tavernIngredientName(ingredient), b);
    const amount = el('small', '', '', b);
    b.addEventListener('click', () => run('pour', ingredient));
    return { b, amount, ingredient };
  });
  const tray = el('section', 'ts-tray', undefined, w.body);
  const count = el('p', '', '', tray);
  const slots = el('div', 'ts-dose-slots', undefined, tray); slots.setAttribute('aria-hidden', 'true');
  const status = el('p', 'ts-status', '', tray); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const actions = el('footer', '', undefined, tray);
  const carry = w.button(actions, t('tavern.service.carry', 'Take the prepared cup'), () => run('carry'), 'ts-primary');
  const discard = w.button(actions, t('tavern.service.discard', 'Discard the mixture'), () => run('discard'));
  const foot = el('footer', '', undefined, w.body);
  w.button(foot, t('tavern.service.readBook', 'Read the recipe book'), () => { w.close(); openBook(); });
  w.button(foot, t('tavern.service.leaveCounter', 'Leave counter'), w.close);
  let working = false, shown = -1, order = [];
  function paint() {
    if (w.overlay.done) return;
    const s = state();
    if (!s || !['mix', 'carry'].includes(s.phase)) { w.close(); return; }
    const n = tavernDoseCount(s.mix), locked = working || busy();
    count.textContent = t('tavern.service.cupDoses', '{n} / {total} doses in your cup', { n, total: TAVERN_DOSES });
    // Doses stay in the order they were poured, and only the newest one drops in.
    if (n < order.length || n === 0) order = [];
    for (const k of TAVERN_INGREDIENTS) for (let have = order.filter((x) => x === k).length; have < s.mix[k]; have++) order.push(k);
    slots.replaceChildren();
    for (let i = 0; i < TAVERN_DOSES; i++) el('span', `ts-dose${order[i] ? ` ts-${order[i]}` : ''}${order[i] && i >= shown && shown >= 0 ? ' ts-fresh' : ''}`, undefined, slots);
    shown = n;
    tray.classList.toggle('ts-full', n === TAVERN_DOSES);
    for (const { b, amount, ingredient } of pourButtons) {
      b.disabled = locked || s.phase !== 'mix' || n >= TAVERN_DOSES;
      amount.textContent = t('tavern.service.poured', '{n} in cup', { n: s.mix[ingredient] });
    }
    status.textContent = locked ? t('tavern.service.confirming', 'Confirming with the innkeeper...') :
      n === TAVERN_DOSES ? t('tavern.service.cupReady', 'Your cup is full. Take it to your customer, or discard it to start again.') :
        t('tavern.service.dosesLeft', '{n} doses left to pour.', { n: TAVERN_DOSES - n });
    // A full cup lifts into the server's hand by itself; the button stays for shifts saved before that.
    carry.hidden = !(s.phase === 'mix' && n === TAVERN_DOSES);
    carry.disabled = locked || carry.hidden;
    discard.disabled = locked || n === 0;
  }
  async function run(op, ingredient) {
    const s = state();
    if (!s || working || busy()) return;
    if (op === 'pour' && (s.phase !== 'mix' || tavernDoseCount(s.mix) >= TAVERN_DOSES)) return;
    working = true; paint();
    const point = op === 'pour' ? pourButtons.find((p) => p.ingredient === ingredient)?.b : null;
    point?.classList.add('ts-pouring');
    try { await act(op, ingredient); } finally { working = false; paint(); setTimeout(() => point?.classList.remove('ts-pouring'), 500); }
    // Let the last dose land before the counter steps aside for the carried cup.
    if (state()?.phase === 'carry') setTimeout(() => w.close(), op === 'pour' ? 650 : 0);
  }
  w.overlay.input = (code) => {
    if (code === 'Escape') w.close();
    const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(code);
    if (i >= 0 && !pourButtons[i].b.disabled) run('pour', TAVERN_INGREDIENTS[i]);
  };
  paint(); w.focus();
  return w.overlay;
}

export function createTavernRecipeWindow({ onBack } = {}) {
  if (typeof document === 'undefined') return null;
  const title = t('tavern.service.book', "The Innkeeper's Recipe Book");
  const w = windowShell('ts-book', title);
  const left = el('section', 'ts-book-leaf ts-book-intro', undefined, w.body);
  el('p', 'ts-kicker', t('tavern.service.houseRecipes', 'From the house cellar'), left);
  el('h1', '', title, left);
  el('div', 'ts-flourish', '— ❦ —', left).setAttribute('aria-hidden', 'true');
  bottle(el('div', 'ts-book-seal', undefined, left), 'wine');
  el('p', 'ts-rule', t('tavern.service.bookRule', 'Three doses per cup. Order does not matter. Discard a wrong mixture.'), left);
  const legend = el('div', 'ts-book-legend', undefined, left);
  TAVERN_INGREDIENTS.forEach((k) => { const item = el('span', '', undefined, legend); el('i', `ts-${k}`, undefined, item); el('span', '', tavernIngredientName(k), item); });
  const right = el('section', 'ts-book-leaf ts-book-recipes', undefined, w.body);
  el('p', 'ts-kicker', t('tavern.service.cellarNotes', 'Measures & mixtures'), right);
  const recipes = el('div', '', undefined, right); recipes.setAttribute('aria-live', 'polite');
  const footer = el('footer', '', undefined, right);
  let page = 0;
  const pages = Math.ceil(TAVERN_RECIPES.length / 3);
  const prev = w.button(footer, t('tavern.service.previousPage', 'Previous page'), () => turn(-1));
  const pagination = el('span', 'ts-pagination', '', footer);
  const next = w.button(footer, t('tavern.service.nextPage', 'Next page'), () => turn(1));
  w.button(right, onBack ? t('tavern.service.backToMix', 'Back to mixing') : t('tavern.service.closeBook', 'Close recipe book'), () => { w.close(); onBack?.(); }, 'ts-quiet');
  const close = w.button(w.body, '×', w.close, 'ts-book-close'); close.setAttribute('aria-label', t('tavern.service.closeBook', 'Close recipe book'));
  function paint() {
    recipes.replaceChildren();
    TAVERN_RECIPES.slice(page * 3, page * 3 + 3).forEach((recipe, i) => {
      const entry = el('article', 'ts-recipe', undefined, recipes);
      el('span', 'ts-recipe-number', String(page * 3 + i + 1).padStart(2, '0'), entry).setAttribute('aria-hidden', 'true');
      const details = el('div', '', undefined, entry);
      el('h2', '', tavernRecipeName(recipe.id), details);
      el('p', '', TAVERN_INGREDIENTS.filter((k) => recipe[k]).map((k) => `${recipe[k]} ${tavernIngredientName(k)}`).join(' + '), details);
      const doses = el('div', 'ts-recipe-doses', undefined, details); doses.setAttribute('aria-hidden', 'true');
      for (const k of TAVERN_INGREDIENTS) for (let n = 0; n < recipe[k]; n++) el('span', `ts-dose ts-${k}`, undefined, doses);
      el('p', 'ts-note', tavernRecipeNote(recipe.id), details);
    });
    prev.disabled = page === 0; next.disabled = page === pages - 1;
    pagination.textContent = t('tavern.service.bookPage', 'Page {n} of {total}', { n: page + 1, total: pages });
  }
  function turn(delta) { page = Math.max(0, Math.min(pages - 1, page + delta)); paint(); }
  w.overlay.input = (code) => { if (code === 'Escape') w.close(); if (code === 'ArrowLeft') turn(-1); if (code === 'ArrowRight') turn(1); };
  paint(); w.focus();
  return w.overlay;
}
