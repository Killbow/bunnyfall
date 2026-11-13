// @ts-check
// THE CRAFTING TAB of the pause window (ui/enhanced/enhancedMenu.js PAUSE_TABS), after the Growth tab's pattern: one rail
// for the trades, shown while the professions are this account's.
//   Professions  the five crafts and the gathering trades, the Focus on top, their perks
//   Bench        every station's list of items, read anywhere and made at the station (ui/professions/craftWindow.js)
//   Stations     the old station pages: cooking, alchemy, enchanting, the forge's smelting and the rest, until each moves
//   Stores       what the character holds, and its withdrawals
// The sections keep the old pages' ids, so every door that named one (the Professions key, a shop's or a home's station)
// still lands on it.
import { t } from '../../systems/textManager.js';
import { drawOverviewPage, drawCraftingPage, drawStoresPage, stationHere, profPagesShown } from '../professions/profPages.js';
import { ensureGrowthStyle } from '../growth/growthTab.js';
import { openWorkstation } from '../workstation/workstationModal.js';

/** The rail's pages: id, then its words in the player's language. */
export const CRAFT_TAB_SECTIONS = Object.freeze([
  ['professions', () => t('craft.tab.professions', 'Professions')],
  ['bench', () => t('craft.tab.bench', 'Bench')],
  ['crafting', () => t('craft.tab.stations', 'Stations')],
  ['stores', () => t('craft.tab.stores', 'Stores')],
  ['provisioning', () => t('craft.tab.provisioning', 'Provisioning')],   // BUNNYFALL PROVISIONING: its own system
]);
const SUB = Object.freeze({
  professions: () => t('craft.tab.professionsSub', 'Ranks, perks, Focus'),
  bench: () => t('craft.tab.benchSub', 'Choose and make'),
  crafting: () => t('craft.tab.stationsSub', 'Cooking, brewing, smelting'),
  stores: () => t('craft.tab.storesSub', 'Materials you hold'),
  provisioning: () => t('craft.tab.provisioningSub', 'The pot and the cauldron'),
});
const ids = CRAFT_TAB_SECTIONS.map(([id]) => id);
/** Whether a landing names one of the tab's pages. */
export const craftPageAt = (/** @type {unknown} */ at) => typeof at === 'string' && ids.includes(at);
/** The tab is drawn while the professions are the account's. */
export const craftTabShown = () => profPagesShown();

let sec = 'professions';
/** A landing at a station opens its window once, as the press of the station's key always opened its page. */
let arrived = false;
/** A new visit: its landing's page. A landing on the Stations page while standing at a station reads as the Bench. */
export function resetCraftTab(at = null) {
  sec = craftPageAt(at) ? /** @type {string} */ (at) : 'professions';
  arrived = false;
  if (sec === 'crafting' && (stationHere() === 'fire' || stationHere() === 'alchemy')) { sec = 'provisioning'; arrived = true; }   // a fire or a cauldron opens the pot
  else if (sec === 'crafting' && stationHere()) { sec = 'bench'; arrived = true; }
}
export const craftSection = () => sec;
export function setCraftSection(/** @type {string} */ id) { if (ids.includes(id)) sec = id; }

/**
 * Draws the tab into the pause body: its rail, then the page. `kit` is the pause window's (`el`, `divider`, `meter`,
 * `keyName`), `render` redraws the window.
 * @param {HTMLElement} body @param {{ el: Function, divider: Function, meter?: Function, keyName?: Function, render: () => void }} kit
 */
export function drawCraftTab(body, kit) {
  const { el, render } = kit;
  ensureGrowthStyle();   // the Growth book's window and page rules: the Crafting tab is the same size and scrolls the same way
  const wrap = el('div', 'px-journal gr-book');
  const rail = el('div', 'px-qrail');
  for (const [id, label] of CRAFT_TAB_SECTIONS) {
    const b = el('button', `px-qrow${id === sec ? ' on' : ''}`);
    b.append(el('span', 'px-c', '◆'), globalThis.document.createTextNode(label()));
    b.title = SUB[id]();
    b.onclick = () => { sec = id; render(); };
    rail.append(b);
  }
  wrap.append(rail);
  const detail = el('div', 'px-qdetail px-sys prof-detail gr-pane gr-scrolls');
  const pageKit = { el, divider: kit.divider, meter: kit.meter, keyName: kit.keyName, go: (/** @type {string} */ id) => { setCraftSection(id); render(); } };
  ({
    professions: drawOverviewPage,
    bench: (d, r, k) => drawDoor(d, k, 'bench'),
    crafting: drawCraftingPage,
    stores: drawStoresPage,
    provisioning: (d, r, k) => drawDoor(d, k, 'prov'),
  })[sec]?.(detail, render, pageKit);
  if (arrived && (sec === 'bench' || sec === 'provisioning')) { arrived = false; openWorkstation(sec === 'bench' ? 'bench' : 'prov'); }
  wrap.append(detail);
  body.append(wrap);
}

const DOORS = Object.freeze({
  bench: ['The Bench', 'Every piece is made here: pick it from the list, choose its materials, see the odds and the price, then make it. You can read the lists anywhere and make at the matching station.', 'Open the Bench'],
  prov: ['Provisioning', 'The pot cooks dishes and the cauldron brews potions from ingredients you put together. Your recipe book fills as you discover what they make.', 'Open the pot and cauldron'],
});
/** The Bench and Provisioning are windows of their own (ui/workstation/workstationModal.js): their page is the door. */
function drawDoor(/** @type {HTMLElement} */ detail, /** @type {{ el: Function, divider: Function }} */ kit, /** @type {'bench'|'prov'} */ kind) {
  const [title, words, label] = DOORS[kind];
  detail.append(kit.divider(title));
  detail.append(kit.el('p', 'px-note', words));
  const go = kit.el('button', 'act', label);
  go.type = 'button';
  go.onclick = () => openWorkstation(kind);
  const row = kit.el('div', 'prof-doors');
  row.append(go);
  detail.append(row);
}
