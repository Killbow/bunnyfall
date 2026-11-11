// BUNNYFALL CRAFTING REWORK, PHASE 3: THE CRAFTING WINDOW.
// One window for every crafting station, drawn in the pause window's Crafting page while the player stands at one.
// Five tabs, the same everywhere: Craft, Upgrade, Salvage, Refine, Stores. The list sorts by what can be done now, and
// the card shows the whole price (inputs held, quality odds, fee) before the press. The minigames are kept
// (ui/professions/craftActs.js). Alchemy and Enchanting keep their own pages (Daggerfall's potion and item makers).
import {
  RECIPES, recipeInputs, recipeOpen, qualityOdds, rollsQuality, takesHeartwood, QUALITY_NAMES, craftXp, GARMENT_DYES, dyeOk,
  panCount, panWindow, facetCount, facetWindow, chiselStrikes, chiselMarkS,
} from '../../net/recipeLaw.js';
import { SMELT_RECIPES, BURN_RECIPES, SAW_RECIPES, CURE_RECIPES, WEAVE_RECIPES, SPIN_RECIPES, MASON_RECIPES, workOpen, SMELT_MAX, trackOf } from '../../net/professionLaw.js';
import { temperCost, temperGold, temperCap } from '../../net/temperLaw.js';
import { DYE_NAMES } from '../../characters/dyes.js';
import { getPref } from '../../systems/uiPrefs.js';
import { materialsText } from '../salvageMaterials.js';
import { mountAct } from './craftActs.js';
import { workWidth } from '../../systems/workAct.js';   // the Bench's work: an arc's width
import { FORMS } from '../../net/craft/forms.js';   // BUNNYFALL CRAFTING REWORK: the item once, its materials a choice
import { statsOf } from '../../net/craft/materialStats.js';
import { planOf, inputsOf, potentialOfPlan, qualityCap, craftValueXp, craftOdds, FOCUS_MAX } from '../../net/craft/craftLaw.js';
import { mintPiece } from '../../systems/smithItems.js';   // the card's "You will make": the name the mint gives
import { rriEnabled } from '../../systems/roleplayRealismItems/rriItems.js';   // the mod's pieces only while the mod is on
import { itemLongName } from '../../systems/item/itemInfo.js';
import { itemArmorValue } from '../../systems/armorMaterials.js';
import { unitWeightInKg } from '../../systems/inventory.js';
import { paperdollItemImage } from '../paperDoll.js';   // the look's preview, as the doll draws it
import { requestIcon } from '../textureCanvas.js';
import { LOOK_KINDS } from '../../net/productRecord.js';   // the stats table: the armour a piece gives
import { valueFee, recipeValue, itemFeeValue } from '../../systems/craftFees.js';   // BUNNYFALL CRAFT FEES: a tenth of the piece, the station's fee its ceiling


/** The stations this window draws, each its name, its craft, its minigame, its fee's door and its refine works. */
export const CW_STATIONS = Object.freeze({
  anvil: { name: 'Forge and anvil', prof: 'smithing', act: 'heat', fee: 'forge', temper: 'anvil', upgrade: true, refine: () => [...SMELT_RECIPES, ...BURN_RECIPES] },
  workbench: { name: 'Workbench', prof: 'carpentry', act: 'plane', fee: 'workbench', refine: () => [...SAW_RECIPES] },
  loom: { name: 'Loom', prof: 'outfitting', act: 'stitch', fee: 'loom', temper: 'loom', refine: () => [...CURE_RECIPES, ...WEAVE_RECIPES, ...SPIN_RECIPES] },
  mason: { name: 'Mason\'s bench', prof: 'masonry', act: 'chisel', fee: 'mason', refine: () => [...MASON_RECIPES] },
  fire: { name: 'Fire', prof: 'cooking', act: 'pan', fee: 'fire', refine: () => [] },
  jeweller: { name: 'Jeweller\'s bench', prof: 'jewelcrafting', act: 'facet', fee: 'jeweller', refine: () => [] },
});
const TABS = Object.freeze([['craft', 'Craft'], ['upgrade', 'Upgrade'], ['salvage', 'Salvage'], ['refine', 'Refine'], ['stores', 'Stores']]);
const FAMILY_WORDS = Object.freeze({ weapons: 'Weapons', armour: 'Armor', tools: 'Tools', kits: 'Repair kits', staves: 'Staves', bows: 'Bows',
  arrows: 'Arrows', furniture: 'Furniture', siege: 'Siege', clothing: 'Clothing', leather: 'Leather armor', jewellery: 'Jewelry', dishes: 'Dishes', stonework: 'Stonework',
  furnishings: 'Furnishings' });
const familyWord = (f) => FAMILY_WORDS[f] ?? `${String(f)[0].toUpperCase()}${String(f).slice(1)}`;
/** A garment's word where two patterns share a name (DFU's men's and women's boots). */
const groupWord = (r) => (r.group === 'MensClothing' ? "men's" : r.group === 'WomensClothing' ? "women's" : null);

/** The window's own memory: its tab, the pattern picked, its variant, a minigame under way, the last word said. */
const _cw = { station: null, form: null, focusAsk: null, look: null, q: '', qFocus: false, tab: 'craft', family: null, pick: null, variant: null, picks: {}, heartwood: false, dye: null, act: null, busy: false, word: null, count: 1, query: '', commit: null };
export function resetCraftWindow() { Object.assign(_cw, { station: null, tab: 'craft', family: null, pick: null, variant: null, picks: {}, act: null, busy: false, word: null, count: 1, query: '' }); }

const STYLE_ID = 'bf-craft-window-style';
const CSS = `
.cw { display: flex; flex-direction: column; gap: 12px; color: #e8e2d0; font-size: 14px; }
.cw-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.cw-title { font-size: 18px; font-weight: 600; color: #f0d58a; }
.cw-sub { color: #b8b09a; font-size: 13px; }
.cw-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.cw-tab, .cw-btn, .cw-chip { background: rgba(10,12,17,0.55); border: 2px solid #7d7460; color: #e8e2d0; padding: 6px 14px; font: inherit; cursor: pointer; }
.cw-tab:hover, .cw-btn:hover:not([disabled]), .cw-chip:hover { border-color: #d9b45a; }
.cw-tab.cw-on, .cw-chip.cw-on { border-color: #d9b45a; background: rgba(217,180,90,0.16); color: #f0d58a; }
.cw-btn[disabled] { opacity: 0.45; cursor: default; }
.cw-primary { border-color: #d9b45a; background: rgba(217,180,90,0.18); font-weight: 600; }
.cw-chip { padding: 3px 10px; font-size: 13px; }
.cw-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.cw-body { display: grid; grid-template-columns: minmax(220px, 1fr) minmax(280px, 1.4fr); gap: 14px; align-items: start; }
@media (max-width: 760px) { .cw-body { grid-template-columns: 1fr; } }
.cw-list { display: flex; flex-direction: column; gap: 6px; max-height: 60vh; overflow-y: auto; padding-right: 4px; }
.cw-row { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; background: rgba(10,12,17,0.45); border: 2px solid #3d3a30; color: #e8e2d0; padding: 8px 12px; font: inherit; cursor: pointer; }
.cw-row:hover { border-color: #7d7460; }
.cw-row.cw-on { border-color: #d9b45a; }
.cw-row b { font-weight: 600; }
.cw-state { font-size: 12.5px; color: #b8b09a; }
.cw-ready .cw-state { color: #9cc98a; }
.cw-missing .cw-state { color: #e0b050; }
.cw-locked { opacity: 0.6; }
.cw-card { background: rgba(10,12,17,0.6); border: 2px solid #7d7460; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.cw-card h3 { margin: 0; font-size: 17px; color: #f0d58a; }
.cw-label { font-size: 12.5px; color: #b8b09a; text-transform: uppercase; letter-spacing: 0.06em; }
.cw-inputs { display: flex; flex-direction: column; gap: 4px; }
.cw-input { display: flex; justify-content: space-between; gap: 10px; }
.cw-input .cw-have { color: #9cc98a; }
.cw-input.cw-short .cw-have { color: #e0b050; }
.cw-odds { display: flex; height: 16px; border: 1px solid #7d7460; }
.cw-odds span { display: block; height: 100%; }
.cw-odds-key { display: flex; gap: 10px; flex-wrap: wrap; font-size: 12.5px; color: #b8b09a; }
.cw-q0 { background: #6b5d4a; } .cw-q1 { background: #8a8a80; } .cw-q2 { background: #6aa0c8; } .cw-q3 { background: #9b7ad0; } .cw-q4 { background: #e0b050; }
.cw-sw { display: inline-block; width: 10px; height: 10px; margin-right: 4px; vertical-align: -1px; }
.cw-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.cw-word { padding: 8px 12px; border-left: 3px solid #d9b45a; background: rgba(217,180,90,0.08); }
.cw-note { color: #b8b09a; font-size: 13px; margin: 0; }
.cw-stats { width: 100%; border-collapse: collapse; font-size: 13px; margin: 4px 0 8px; }
.cw-stats th { text-align: left; color: #d9b45a; font-weight: 600; border-bottom: 1px solid #6b5228; padding: 3px 6px; }
.cw-stats td { padding: 3px 6px; border-bottom: 1px solid rgba(107,82,40,.35); color: #e8e2d0; }
.cw-card.cw-ws { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); grid-template-areas: "piece mats" "sum sum"; gap: 12px 16px; background: #1c150e; border: 2px solid #6b5228; box-shadow: inset 0 0 0 1px #2a1f14; }
.cw-ws-piece { grid-area: piece; display: flex; flex-direction: column; gap: 8px; background: #e6d6b0; color: #2b2116; border: 2px solid #8a6a32; box-shadow: inset 0 0 0 3px #e6d6b0, inset 0 0 0 4px #a8844a; padding: 14px 16px; min-width: 0; }
.cw-ws-piece h3 { color: #6a4e26; font-size: 14px; letter-spacing: 2px; text-transform: uppercase; }
.cw-ws-piece .cw-make { color: #2b2116; font-size: 21px; }
.cw-ws-piece .cw-note, .cw-ws-piece .cw-label { color: #4a3a26; }
.cw-ws-piece .cw-stats th { color: #6a4e26; border-bottom-color: #a8844a; }
.cw-ws-piece .cw-stats td { color: #2b2116; border-bottom-color: rgba(168,132,74,.4); }
.cw-ws-piece .cw-look { background: rgba(60,40,20,.1); border-color: #a8844a; color: #4a3a26; }
.cw-ws-piece .cw-look.cw-on { border-color: #6a4e26; background: rgba(106,78,38,.18); color: #2b2116; }
.cw-ws-piece .cw-act { background: #1c150e; padding: 8px; border: 1px solid #6b5228; color: #e8e2d0; }
.cw-ws-mats { grid-area: mats; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.cw-ws-title { font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: #d9b45a; border-bottom: 1px solid #6b5228; padding-bottom: 3px; }
.cw-ws-sum { grid-area: sum; display: flex; flex-direction: column; gap: 6px; border-top: 2px solid #6b5228; padding-top: 10px; background: rgba(0,0,0,.25); padding: 10px 12px; }
.cw-ws-sum .cw-actions { justify-content: flex-end; }
@media (max-width: 900px) { .cw-card.cw-ws { grid-template-columns: 1fr; grid-template-areas: "piece" "mats" "sum"; } }
.cw-looks { display: flex; flex-wrap: wrap; gap: 6px; margin: 2px 0 8px; }
.cw-look { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 64px; min-height: 84px; padding: 4px; background: rgba(0,0,0,.25); border: 1px solid #4a3820; color: #b8b09a; cursor: pointer; transition: border-color .15s, transform .15s; }
.cw-look img { max-width: 72px; max-height: 72px; image-rendering: pixelated; }
.cw-look:hover { border-color: #b08a3e; transform: translateY(-1px); }
.cw-look.cw-on { border: 2px solid #d9b45a; color: #f0d58a; background: rgba(217,180,90,.12); }
.cw-make { color: #f0d58a; font-size: 17px; font-weight: 700; margin: 2px 0 4px; }
.cw-empty { color: #b8b09a; padding: 12px 0; }
.cw-line { display: flex; justify-content: space-between; align-items: center; gap: 10px; background: rgba(10,12,17,0.45); border: 2px solid #3d3a30; padding: 8px 12px; flex-wrap: wrap; }
.cw-line-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cw-search { background: rgba(10,12,17,0.55); border: 2px solid #7d7460; color: #e8e2d0; padding: 6px 10px; font: inherit; min-width: 180px; }
.cw-foot { display: flex; justify-content: flex-end; }
.cw-link { background: none; border: 0; color: #b8b09a; text-decoration: underline; cursor: pointer; font: inherit; font-size: 12.5px; }
.cw-act { display: flex; flex-direction: column; gap: 10px; padding: 12px; border: 2px solid #d9b45a; background: rgba(10,12,17,0.7); color: #e8e2d0; }
.cw-act-head { font-weight: 600; }
.cw-act-row { display: flex; gap: 8px; }
.cw-meter { position: relative; height: 26px; border: 2px solid #7d7460; background: linear-gradient(90deg, #2a1a10, #c0501c, #f0d070); }
.cw-meter-band { position: absolute; top: 0; bottom: 0; border: 2px solid #f0f0f0; box-sizing: border-box; }
.cw-meter-mark { position: absolute; top: -4px; bottom: -4px; width: 4px; margin-left: -2px; background: #fff; }
.cw-meter.cw-hot { box-shadow: 0 0 0 2px #f0d58a; }
.cw-beat { width: 90px; height: 90px; border-radius: 50%; border: 3px solid #7d7460; display: flex; align-items: center; justify-content: center; margin: 0 auto; }
.cw-beat-pulse { width: 60px; height: 60px; border-radius: 50%; background: #d9b45a; }
.cw-beat.cw-hot { border-color: #9cc98a; }
.cw-act-stage.cw-work-anvil { --wk: #f0a040; --wk2: #ffd890; }
.cw-act-stage.cw-work-workbench { --wk: #c8a070; --wk2: #f0dcb0; }
.cw-act-stage.cw-work-loom { --wk: #8fb0e0; --wk2: #dbe8ff; }
.cw-act-stage.cw-work-mason { --wk: #b8b09a; --wk2: #f0ece0; }
.cw-act-stage.cw-work-jeweller { --wk: #c9a0f0; --wk2: #f4e8ff; }
.cw-work { width: 240px; height: 240px; display: block; margin: 4px auto; overflow: visible; }
.cw-work-track { fill: #15100b; stroke: #6b5228; stroke-width: 3; }
.cw-work-ticks line { stroke: #6b5228; stroke-width: 0.8; }
.cw-work-arc { fill: none; stroke: var(--wk, #d9b45a); stroke-width: 8; stroke-linecap: butt; opacity: .85; animation: cw-arcpulse 1.1s ease-in-out infinite; }
.cw-work-true { fill: none; stroke: var(--wk2, #f0d58a); stroke-width: 8; }
.cw-work.cw-hot .cw-work-arc { opacity: 1; filter: drop-shadow(0 0 3px var(--wk, #d9b45a)); }
.cw-work-pip { fill: none; stroke: #3d3a30; stroke-width: 3.5; transition: stroke .3s; }
.cw-work-pip.cw-now { stroke: #b08a3e; }
.cw-work-pip.cw-done { stroke: var(--wk, #d9b45a); }
.cw-work-needle line { stroke: #e8e2d0; stroke-width: 1.6; stroke-linecap: round; }
.cw-work-tip { fill: var(--wk2, #f0d58a); filter: drop-shadow(0 0 2px var(--wk, #d9b45a)); }
.cw-work-hub { fill: #241a12; stroke: #b08a3e; stroke-width: 1.2; }
.cw-work-label { fill: #f0d58a; font: 700 7px Georgia, serif; text-anchor: middle; }
.cw-work-sub { fill: #b8b09a; font: 4.2px Georgia, serif; text-anchor: middle; }
.cw-spark { fill: var(--wk2, #f0d58a); animation: cw-spark .6s ease-out forwards; }
.cw-spark-true { fill: #fff6d8; }
.cw-spark-part { fill: var(--wk, #d9b45a); }
.cw-act-stage.cw-shake .cw-work { animation: cw-shake .36s ease-in-out; }
.cw-act-stage.cw-shake .cw-work-track { stroke: #c0503a; }
.cw-act-stage.cw-flash .cw-work-hub { animation: cw-flash .52s ease-out; }
@keyframes cw-spark { from { transform: translate(0,0); opacity: 1; } to { transform: translate(var(--dx), var(--dy)); opacity: 0; } }
@keyframes cw-shake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-5px) rotate(-1deg); } 50% { transform: translateX(4px) rotate(1deg); } 80% { transform: translateX(-2px); } }
@keyframes cw-flash { 0% { fill: var(--wk2, #f0d58a); } 100% { fill: #241a12; } }
@keyframes cw-arcpulse { 0%,100% { stroke-width: 7; } 50% { stroke-width: 9; } }
@media (prefers-reduced-motion: reduce) { .cw-work-arc, .cw-spark, .cw-act-stage.cw-shake .cw-work, .cw-act-stage.cw-flash .cw-work-hub { animation: none; } }
.cw-facet { width: 140px; height: 140px; display: block; margin: 0 auto; }
.cw-facet-rim { fill: rgba(10,12,17,0.6); stroke: #7d7460; stroke-width: 2; }
.cw-facet-light { fill: rgba(240,213,138,0.45); }
.cw-facet-hand { stroke: #fff; stroke-width: 3; stroke-linecap: round; }
.cw-facet.cw-hot .cw-facet-rim { stroke: #9cc98a; }
.cw-act-chisel { display: flex; gap: 6px; }
.cw-lane { flex: 1; height: 70px; background: rgba(10,12,17,0.55); border: 2px solid #3d3a30; cursor: pointer; }
.cw-lane.cw-marked { background: rgba(217,180,90,0.35); }
.cw-lane.cw-aimed { border-color: #fff; }
.cw-board { border: 2px solid #7d7460; background: #3b2a1a; height: 120px; touch-action: none; cursor: crosshair; }
.cw-board svg { width: 100%; height: 100%; display: block; }
.cw-board-head { fill: rgba(217,180,90,0.25); }
.cw-grain { fill: none; stroke: #c8a070; stroke-width: 1.2; vector-effect: non-scaling-stroke; }
.cw-trail { fill: none; stroke: #fff; stroke-width: 2; vector-effect: non-scaling-stroke; }
.cw-act-dots { display: flex; gap: 6px; }
.cw-dot { width: 12px; height: 12px; border-radius: 50%; border: 2px solid #7d7460; }
.cw-dot.cw-hit { background: #9cc98a; border-color: #9cc98a; }
.cw-dot.cw-miss { background: #c0503a; border-color: #c0503a; }
`;

export function ensureStyle() {
  const doc = globalThis.document;
  if (!doc || doc.getElementById(STYLE_ID)) return;
  const s = doc.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  doc.head.append(s);
}
const h = (tag, cls = null, text = null) => {
  const e = globalThis.document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = String(text);
  return e;
};
const button = (cls, text, onclick, disabled = false) => {
  const b = h('button', cls, text);
  b.type = 'button';
  b.disabled = !!disabled;
  b.onclick = onclick;
  return b;
};

/** What the Stores, the bag and the pack can work of a material. */
const workOf = (book, k) => (typeof book?.workable === 'function' ? book.workable(k) : book?.held?.(k) ?? 0);
const rankOf = (book, prof) => book?.track?.(trackOf(prof))?.rank ?? book?.track?.(prof)?.rank ?? 0;
const specsOf = (book, prof) => book?.track?.(trackOf(prof))?.specs ?? null;
const feeOf = (p, station) => {
  const f = p?.[CW_STATIONS[station].fee]?.();
  return f && f.fee > 0 ? f.fee : 0;
};

/** A recipe's standing: 'ready', 'missing' (with what is short) or 'locked'. */
function standing(r, book, rank, specs, opts = {}) {
  if (r.later || !recipeOpen(r, rank, specs)) return { s: 'locked', short: [] };
  const short = recipeInputs(r, opts).filter((i) => !i.catalyst && workOf(book, i.key) < i.n).map((i) => ({ key: i.key, n: i.n - workOf(book, i.key) }));
  return short.length ? { s: 'missing', short } : { s: 'ready', short: [] };
}
const ORDER = { ready: 0, missing: 1, locked: 2 };

/** The station's recipes as patterns: each its variants, its best standing. */
function patterns(station, book) {
  const prof = CW_STATIONS[station].prof;
  const rank = rankOf(book, prof), specs = specsOf(book, prof);
  const by = new Map();
  for (const r of RECIPES) {
    if (r.profession !== prof) continue;
    const key = r.product ?? r.id;
    if (!by.has(key)) by.set(key, { key, name: r.pattern ?? r.name, family: r.family ?? 'other', variants: [] });
    by.get(key).variants.push({ r, st: standing(r, book, rank, specs) });
  }
  const list = [...by.values()];
  // two patterns of one name told apart by their family, or a garment's cut
  const seen = new Map();
  for (const x of list) seen.set(x.name, (seen.get(x.name) ?? 0) + 1);
  for (const x of list) if (seen.get(x.name) > 1) x.name = `${x.name} (${groupWord(x.variants[0].r) ?? familyWord(x.family).toLowerCase()})`;
  for (const p of list) {
    p.variants.sort((a, b) => (a.r.tier ?? 0) - (b.r.tier ?? 0));
    const ready = p.variants.filter((v) => v.st.s === 'ready');
    const open = p.variants.filter((v) => v.st.s !== 'locked');
    p.best = (ready.at(-1) ?? open.at(-1) ?? p.variants[0]);
  }
  return list;
}

/**
 * THE WINDOW. `p` the professions provider (profPages.js ProfPagesProvider and craftHost.js), `station` where the player
 * stands, `toOld` the way back to the classic pages.
 */
export function drawCraftWindow(detail, rerender, p, station, toOld, away = false) {
  ensureStyle();
  if (_cw.station !== station) { resetCraftWindow(); _cw.station = station; }
  const S = CW_STATIONS[station];
  const book = p.book;
  const prof = S.prof;
  const rank = rankOf(book, prof);
  const root = h('div', 'cw');
  const head = h('div', 'cw-head');
  const fee = feeOf(p, station);
  head.append(h('div', 'cw-title', S.name), h('div', 'cw-sub', `${prof[0].toUpperCase()}${prof.slice(1)} rank ${rank}${fee ? ` · fee 10% of the piece, up to ${fee} gold` : ''} · ${p.purse?.() ?? 0} gold carried`));
  root.append(head);
  const tabs = h('div', 'cw-tabs');
  // the Stores have a page of their own; away from the station only the list is read (its other acts need the station)
  const shown = TABS.filter(([id]) => id !== 'stores' && (!away || id === 'craft')).filter(([id]) => id !== 'upgrade' || S.temper || S.upgrade).filter(([id]) => id !== 'refine' || S.refine().length);
  if (!shown.some(([id]) => id === _cw.tab)) _cw.tab = 'craft';
  for (const [id, word] of shown) tabs.append(button(`cw-tab${_cw.tab === id ? ' cw-on' : ''}`, word, () => { if (_cw.act) return; _cw.tab = id; _cw.word = null; rerender(); }));
  root.append(tabs);
  if (_cw.word) root.append(h('div', 'cw-word', _cw.word));
  const say = (text) => { _cw.word = text; _cw.busy = false; rerender(); };
  const run = async (fn) => { if (_cw.busy) return; _cw.busy = true; rerender(); try { const r = await fn(); say(r?.text ?? 'Done.'); } catch { say('That did not go through. Try again.'); } };

  if (_cw.tab === 'craft') (S.prof === 'cooking' ? drawCraftOld : drawCraft)(root, rerender, p, station, run, away);   // Cooking keeps its recipes until its own rework
  else if (_cw.tab === 'upgrade') drawUpgrade(root, p, station, run);
  else if (_cw.tab === 'salvage') drawSalvage(root, p, run);
  else if (_cw.tab === 'refine') drawRefine(root, rerender, p, station, run);

  const foot = h('div', 'cw-foot');
  foot.append(button('cw-link', 'Open the classic station pages', () => toOld()));
  root.append(foot);
  detail.append(root);
}

function drawCraftOld(root, rerender, p, station, run) {
  const S = CW_STATIONS[station];
  const book = p.book;
  const prof = S.prof;
  const rank = rankOf(book, prof), specs = specsOf(book, prof);
  const all = patterns(station, book);
  const families = [...new Set(all.map((x) => x.family))];
  if (families.length > 1) {
    const chips = h('div', 'cw-chips');
    chips.append(button(`cw-chip${_cw.family == null ? ' cw-on' : ''}`, 'All', () => { _cw.family = null; rerender(); }));
    for (const f of families) chips.append(button(`cw-chip${_cw.family === f ? ' cw-on' : ''}`, familyWord(f), () => { _cw.family = f; rerender(); }));
    root.append(chips);
  }
  const list = all.filter((x) => _cw.family == null || x.family === _cw.family)
    .sort((a, b) => ORDER[a.best.st.s] - ORDER[b.best.st.s] || String(a.name).localeCompare(String(b.name)));
  const body = h('div', 'cw-body');
  const col = h('div', 'cw-list');
  if (!list.length) col.append(h('div', 'cw-empty', 'Nothing to make here yet.'));
  const pick = list.find((x) => x.key === _cw.pick) ?? list[0] ?? null;
  for (const x of list) {
    const row = button(`cw-row cw-${x.best.st.s}${pick === x ? ' cw-on' : ''}`, '', () => { if (_cw.act) return; _cw.pick = x.key; _cw.variant = null; rerender(); });
    row.append(h('b', null, x.name));
    const st = x.best.st;
    row.append(h('span', 'cw-state', st.s === 'ready' ? `Ready: ${x.best.r.madeOf || x.best.r.name}` : st.s === 'missing'
      ? `Missing ${st.short.map((s) => `${s.n} ${p.name(s.key)}`).join(', ')}` : `Needs ${prof} rank ${x.variants[0].r.rank}`));
    col.append(row);
  }
  body.append(col);
  const card = h('div', 'cw-card');
  if (pick) drawRecipeCardOld(card, rerender, p, station, pick, rank, specs, run);
  body.append(card);
  root.append(body);
}

function drawRecipeCardOld(card, rerender, p, station, pick, rank, specs, run) {
  const S = CW_STATIONS[station];
  const book = p.book;
  const v = pick.variants.find((x) => x.r.id === _cw.variant) ?? pick.best;
  const r = v.r;
  card.append(h('h3', null, r.name));
  if (pick.variants.length > 12) {
    // many variants (a jewel's metal and gem): one list to choose from, ready ones first
    card.append(h('div', 'cw-label', 'Made of'));
    const sel = h('select', 'cw-search');
    const sorted = [...pick.variants].sort((a, b) => ORDER[a.st.s] - ORDER[b.st.s]);
    for (const x of sorted) { const o = h('option', null, `${x.r.madeOf || x.r.name}${x.st.s === 'ready' ? ' (ready)' : x.st.s === 'locked' ? ' (locked)' : ''}`); o.value = x.r.id; sel.append(o); }
    sel.value = v.r.id;
    sel.disabled = !!_cw.act;
    sel.onchange = () => { _cw.variant = sel.value; rerender(); };
    card.append(sel);
  } else if (pick.variants.length > 1) {
    card.append(h('div', 'cw-label', 'Made of'));
    const chips = h('div', 'cw-chips');
    for (const x of pick.variants) chips.append(button(`cw-chip${x === v ? ' cw-on' : ''}${x.st.s === 'locked' ? ' cw-locked' : ''}`, `${x.r.madeOf || x.r.name}${x.st.s === 'ready' ? ' ✓' : ''}`, () => { if (_cw.act) return; _cw.variant = x.r.id; rerender(); }));
    card.append(chips);
  }
  const heartwood = _cw.heartwood && takesHeartwood(r) && workOf(book, 'wood:heartwood') > 0;
  const inputs = recipeInputs(r, { heartwood });
  card.append(h('div', 'cw-label', 'Needs, from your Stores, bag and pack'));
  const box = h('div', 'cw-inputs');
  for (const i of inputs) {
    const have = workOf(book, i.key);
    const line = h('div', `cw-input${have < i.n && !i.catalyst ? ' cw-short' : ''}`);
    line.append(h('span', null, `${i.n} ${p.name(i.key)}${i.catalyst ? ' (kept)' : ''}`), h('span', 'cw-have', `have ${have}`));
    box.append(line);
  }
  card.append(box);
  if (takesHeartwood(r) && workOf(book, 'wood:heartwood') > 0) {
    const lab = h('label', 'cw-note');
    const cb = h('input'); cb.type = 'checkbox'; cb.checked = _cw.heartwood; cb.onchange = () => { _cw.heartwood = cb.checked; rerender(); };
    lab.append(cb, globalThis.document.createTextNode(' Use a Heartwood for one quality step'));
    card.append(lab);
  }
  if (r.dyes === true) {
    const sel = h('select', 'cw-search');
    const opt = (text, value) => { const o = h('option', null, text); o.value = value; return o; };
    sel.append(opt('Undyed', ''));
    for (const d of GARMENT_DYES) sel.append(opt(DYE_NAMES[d] ?? String(d), String(d)));
    sel.value = _cw.dye == null ? '' : String(_cw.dye);
    sel.onchange = () => { _cw.dye = sel.value === '' ? null : Number(sel.value); };
    const lab = h('label', 'cw-note', 'Dye ');
    lab.append(sel);
    card.append(lab);
  }
  if (rollsQuality(r)) {
    const odds = qualityOdds(rank - r.rank);
    card.append(h('div', 'cw-label', 'Quality odds at your rank (a clean minigame adds a step)'));
    const bar = h('div', 'cw-odds');
    const key = h('div', 'cw-odds-key');
    odds.forEach((o, q) => {
      if (!(o > 0)) return;
      const seg = h('span', `cw-q${q}`); seg.style.width = `${o}%`; bar.append(seg);
      const k = h('span'); k.append(h('span', `cw-sw cw-q${q}`), globalThis.document.createTextNode(`${QUALITY_NAMES[q]} ${o}%`)); key.append(k);
    });
    card.append(bar, key);
  }
  const fee = valueFee(recipeValue(r.id), feeOf(p, station));
  card.append(h('p', 'cw-note', `${r.tier ? `+${craftXp(r.tier, rank)} ${S.prof} experience` : ''}${fee ? ` · fee ${fee} gold` : ''}`));
  if (v.st.s === 'locked') card.append(h('p', 'cw-note', r.later ? 'Not made yet.' : `Needs ${S.prof} rank ${r.rank}.`));
  const purseOk = !fee || (p.purse?.() ?? Infinity) >= fee;
  if (!purseOk) card.append(h('p', 'cw-note', `You need ${fee} gold for the fee.`));
  const dye = dyeOk(r, _cw.dye) ? _cw.dye : null;
  const ready = v.st.s === 'ready' && purseOk && !_cw.busy && !_cw.act && typeof p.craft === 'function';
  const craft = (clean) => run(() => p.craft(r.id, { clean, heartwood, ...(r.dyes ? { dye } : {}) }));
  if (_cw.act) { card.append(_cw.act.el); return; }
  const actions = h('div', 'cw-actions');
  const gentle = getPref('gentleActs') === true;
  actions.append(button('cw-btn cw-primary', _cw.busy ? 'Working...' : gentle ? 'Craft' : 'Craft (minigame)', () => {
    if (gentle) { craft(false); return; }
    _cw.act = mountAct(S.act, actOptions(S.act, r, rank, p), (rep) => { _cw.act = null; if (rep) craft(rep.clean === true); else { _cw.word = 'You let it go. Nothing was spent.'; rerender(); } });
    rerender();
  }, !ready));
  if (!gentle) actions.append(button('cw-btn', 'Craft, skip the game', () => craft(false), !ready));
  card.append(actions);
}

// ─── THE CRAFT TAB BY FORM AND PICKS (BUNNYFALL CRAFTING REWORK) ─────────────────────────────

const STAT_WORDS = Object.freeze({ h: 'Hardness', t: 'Toughness', l: 'Lightness', a: 'Arcanism' });
const statLine = (s) => (s ? `H ${s.h} · T ${s.t} · L ${s.l} · A ${s.a}` : '');
// HTLA: the four always in one order - Hardness, Toughness, Lightness, Affinity (STAT_WORDS' own)
const weightLine = (w) => Object.entries(STAT_WORDS).filter(([k]) => w?.[k] > 0).map(([k, n]) => `${n} (${k.toUpperCase()}) ${Math.round(w[k] * 100)}%`).join(', ');

/** A plan's standing at the player's rank and Stores: 'ready', 'missing' (what is short) or 'locked'. */
function planStanding(plan, book, rank, specs) {
  const r = plan.legacy;
  if (r.later || !recipeOpen(r, rank, specs)) return { s: 'locked', short: [] };
  const short = inputsOf(plan, { joiner: specs?.[50] === 'joiner' }).filter((i) => workOf(book, i.key) < i.n).map((i) => ({ key: i.key, n: i.n - workOf(book, i.key) }));
  return short.length ? { s: 'missing', short } : { s: 'ready', short: [] };
}

/** The picks the card starts from: an opened slot its old default, the primary the best material the player can make it of. */
function startPicks(form, book, rank, specs) {
  const picks = {};
  for (const slot of form.slots) {
    if (slot.optional) continue;
    picks[slot.id] = slot.defaultKey;
  }
  const primary = form.slots[0];
  const ok = [...primary.options].reverse().find((o) => { const pl = planOf(form.id, { ...picks, [primary.id]: o }); return pl.ok && planStanding(pl, book, rank, specs).s === 'ready'; });
  if (ok) picks[primary.id] = ok;
  return picks;
}

export function drawFocus(root, rerender, p, showWord = false) {
  const book = p.book;
  if (typeof book?.focus !== 'function' || typeof book.chooseFocus !== 'function') return;
  const f = book.focus();
  const word = (c) => `${c[0].toUpperCase()}${c.slice(1)}`;
  const box = h('div', 'cw-focus');
  box.append(h('div', 'cw-label', `Focus (${f.crafts.length} of ${FOCUS_MAX}): a Focus craft levels at full speed and can reach Masterwork. Other crafts earn half experience and top out at Superior. Dropping one costs ${f.cost} silver.`));
  const ask = _cw.focusAsk;
  const chips = h('div', 'cw-chips');
  for (const c of ['smithing', 'building', 'outfitting', 'provisioning', 'enchanting']) {
    const on = f.crafts.includes(c);
    const full = !on && f.crafts.length >= FOCUS_MAX;
    chips.append(button(`cw-chip${on ? ' cw-on' : ''}${ask?.craft === c ? ' cw-asked' : ''}`, `${word(c)}${on ? ' ✓' : ''}`, () => {
      if (_cw.busy || full) return;
      _cw.focusAsk = ask?.craft === c ? null : { craft: c, drop: on };   // a press asks; Confirm does it
      rerender();
    }, full));
  }
  box.append(chips);
  if (ask) {
    const line = h('div', 'cw-word', ask.drop
      ? `Drop ${word(ask.craft)} from your Focus? It costs ${f.cost} silver.`
      : `Make ${word(ask.craft)} a Focus craft? You pick up to ${FOCUS_MAX}, and dropping one later costs ${f.cost} silver.`);
    const row = h('div', 'cw-actions');
    row.append(
      button('cw-btn cw-primary', ask.drop ? `Drop for ${f.cost} silver` : 'Make it my Focus', async () => {
        if (_cw.busy) return;
        const next = ask.drop ? f.crafts.filter((x) => x !== ask.craft) : [...f.crafts, ask.craft];
        _cw.focusAsk = null; _cw.busy = true; rerender();
        const r = await book.chooseFocus(next).catch(() => null);
        _cw.busy = false;
        _cw.word = r?.ok ? (ask.drop ? `${word(ask.craft)} is no longer a Focus craft.` : `${word(ask.craft)} is a Focus craft.`)
          : r?.error === 'marks-short' ? `You need ${f.cost} silver to drop a Focus craft.` : 'That did not go through. Try again.';
        rerender();
      }, !!_cw.busy),
      button('cw-btn', 'Cancel', () => { _cw.focusAsk = null; rerender(); }));
    box.append(line, row);
  }
  if (showWord && _cw.word && !ask) box.append(h('div', 'cw-word', _cw.word));
  root.append(box);
}

function drawCraft(root, rerender, p, station, run, away = false) {
  const S = CW_STATIONS[station];
  const book = p.book;
  const prof = S.prof;
  const rank = rankOf(book, prof), specs = specsOf(book, prof);
  drawFocus(root, rerender, p);
  const forms = FORMS.filter((f) => f.discipline === prof && f.kind !== 'dish' && (!RRI_FORMS.has(f.id) || rriEnabled()));
  const standingOf = (f) => {
    const top = [...f.slots[0].options].map((o) => planOf(f.id, { ...startPicks(f, book, rank, specs), [f.slots[0].id]: o })).filter((x) => x.ok).map((x) => ({ x, st: planStanding(x, book, rank, specs) }));
    const best = top.filter((t) => t.st.s === 'ready').at(-1) ?? top.filter((t) => t.st.s !== 'locked').at(-1) ?? top[0];
    return best?.st ?? { s: 'locked', short: [] };
  };
  const rows = forms.map((f) => ({ f, st: standingOf(f) }));
  const families = [...new Set(forms.map((f) => f.family))];
  if (families.length > 1) {
    const chips = h('div', 'cw-chips');
    chips.append(button(`cw-chip${_cw.family == null ? ' cw-on' : ''}`, 'All', () => { _cw.family = null; rerender(); }));
    for (const f of families) chips.append(button(`cw-chip${_cw.family === f ? ' cw-on' : ''}`, familyWord(f), () => { _cw.family = f; rerender(); }));
    root.append(chips);
  }
  const search = h('input', 'cw-search');
  search.type = 'search'; search.placeholder = 'Search: bow, boots, ring'; search.value = _cw.q ?? '';
  search.setAttribute('aria-label', 'Search the items');
  search.oninput = () => { _cw.q = search.value; _cw.qFocus = true; rerender(); };
  root.append(search);
  if (_cw.qFocus) { _cw.qFocus = false; globalThis.queueMicrotask?.(() => { search.focus?.(); search.setSelectionRange?.(search.value.length, search.value.length); }); }
  const q = String(_cw.q ?? '').trim().toLowerCase();
  const list = rows.filter((x) => (_cw.family == null || x.f.family === _cw.family) && (!q || x.f.name.toLowerCase().includes(q)))
    .sort((a, b) => ORDER[a.st.s] - ORDER[b.st.s] || String(a.f.name).localeCompare(String(b.f.name)));
  const body = h('div', 'cw-body');
  const col = h('div', 'cw-list');
  if (!list.length) col.append(h('div', 'cw-empty', 'Nothing to make here yet.'));
  const pick = list.find((x) => x.f.id === _cw.pick) ?? list[0] ?? null;
  for (const x of list) {
    const row = button(`cw-row cw-${x.st.s}${pick === x ? ' cw-on' : ''}`, '', () => { if (_cw.act) return; _cw.pick = x.f.id; _cw.picks = {}; rerender(); });
    row.append(h('b', null, x.f.name), h('span', 'cw-state', x.st.s === 'ready' ? 'Ready' : x.st.s === 'missing' ? `Missing ${x.st.short.map((s) => `${s.n} ${p.name(s.key)}`).join(', ')}` : `Needs ${prof} rank ${x.f.rankMin}`));
    col.append(row);
  }
  body.append(col);
  const card = h('div', 'cw-card');
  if (pick) drawFormCard(card, rerender, p, station, pick.f, rank, specs, run, away);
  body.append(card);
  root.append(body);
}

/**
 * THE FINISHED PIECE, BY QUALITY: what each quality the craft can roll mints (the mint's own numbers - smithItems.js
 * mintPiece), with its odds skipping the game and playing it clean. Damage and armour are the item's and its grade's; a
 * quality changes its condition and weight, and Superior and Masterwork roll an enchantment at the craft.
 */
function drawStatsTable(card, r, odds, clean) {
  const rows = [];
  for (let q = 0; q < 5; q++) {
    if (!(odds[q] > 0) && !(clean[q] > 0)) continue;
    let it = null;
    try { it = mintPiece({ recipe: r.id, quality: q, seed: 1 }, '0000000000000000'); } catch { it = null; }
    if (it) rows.push({ q, it });
  }
  if (!rows.length) return;
  const weapon = rows[0].it.group === 'Weapons';
  const armour = rows[0].it.group === 'Armor';
  const table = h('table', 'cw-stats');
  const head = h('tr');
  for (const t of ['Quality', 'Odds', 'Clean', weapon ? 'Damage' : armour ? 'Armour' : null, 'Weight', 'Condition', 'Extra']) if (t) head.append(h('th', null, t));
  table.append(head);
  for (const { q, it } of rows) {
    const tr = h('tr', `cw-q${q}-row`);
    tr.append(h('td', null, QUALITY_NAMES[q]), h('td', null, `${odds[q]}%`), h('td', null, `${clean[q]}%`));
    if (weapon) tr.append(h('td', null, `${it.minDamage ?? 0}-${it.maxDamage ?? 0}`));
    else if (armour) { let a = null; try { a = itemArmorValue(it); } catch { a = null; } tr.append(h('td', null, a == null ? '-' : String(a))); }
    let kg = NaN;
    try { kg = Number(unitWeightInKg(it)); } catch { kg = NaN; }
    tr.append(h('td', null, Number.isFinite(kg) ? `${kg.toFixed(2)} kg` : '-'), h('td', null, String(it.maxCondition ?? '-')),
      h('td', null, q === 4 ? 'Rare enchantment, your mark' : q === 3 ? 'Magic enchantment' : ''));
    table.append(tr);
  }
  card.append(h('div', 'cw-label', 'The finished piece by quality (enchantments are rolled when it is made)'), table);
}

/** Roleplay Realism Items' forms (templates 513-526): drawn only while the mod is on, as its art and its numbers are. */
const RRI_FORMS = new Set(RECIPES.filter((r) => r.templateIndex >= 513 && r.templateIndex <= 526).map((r) => r.product));

/** The name the mint gives a piece of `r`, at Standard (a Rare's own name aside), or null. */
function previewName(r, look = null) {
  try { const it = mintPiece({ recipe: r.id, quality: 1, seed: 1, look }, '0000000000000000'); return it ? itemLongName(it) : null; } catch { return null; }
}

/**
 * THE LOOKS a piece of clothing or armour can be made in: the template's own variants (DFU's), each as the mint makes
 * it - armour's held to what its material allows (armorMaterials.js clampArmorVariant), so two asks that mint the same
 * variant are one look. Every crafter chooses from the same list; the wearer's body only draws the preview.
 */
function looksOf(r) {
  const out = [];
  const seen = new Set();
  for (let look = 0; look < 16; look++) {
    let it = null;
    try { it = mintPiece({ recipe: r.id, quality: 1, seed: 0, look }, '0000000000000000'); } catch { it = null; }
    if (!it) break;
    const v = it.variant ?? 0;
    if (seen.has(v)) { if (look >= 8) break; continue; }
    seen.add(v);
    out.push({ look, variant: v, item: it });
  }
  return out.length > 1 ? out : [];
}
/** The look picker: a picture of each, drawn on the wearer's body as the paper doll would, its dye the chosen one. */
function drawLooks(card, rerender, p, r, looks, chosen) {
  const who = p.wearer?.() ?? { gender: 'male', race: 'Breton' };
  card.append(h('div', 'cw-label', `Look (${looks.length} to choose from)`));
  const row = h('div', 'cw-looks');
  looks.forEach((l, i) => {
    const b = button(`cw-look${l.look === chosen ? ' cw-on' : ''}`, '', () => { if (_cw.act) return; _cw.look = l.look; rerender(); });
    b.setAttribute('aria-label', `Look ${i + 1}`);
    const it = r.dyes && Number.isInteger(_cw.dye) ? { ...l.item, dye: _cw.dye } : l.item;
    let url = null;
    try { const img = paperdollItemImage(it, who); url = img ? requestIcon(img.archive, img.record, { scale: 1, dye: img.dye, dyeTarget: img.target, onReady: rerender }) : null; } catch { url = null; }
    if (url) { const pic = h('img'); pic.src = url; pic.alt = ''; b.append(pic); }
    b.append(h('span', null, String(i + 1)));
    row.append(b);
  });
  card.append(row);
}

function drawFormCard(card, rerender, p, station, form, rank, specs, run, away = false) {
  const S = CW_STATIONS[station];
  const book = p.book;
  if (_cw.form !== form.id) { _cw.form = form.id; _cw.picks = {}; _cw.look = null; }
  const base = startPicks(form, book, rank, specs);
  const chosen = { ...base, ..._cw.picks };
  for (const slot of form.slots) if (slot.optional && _cw.picks[slot.id] == null) delete chosen[slot.id];
  // THE WORKSTATION: the piece (its name, looks, what it wants, what it will be) beside the materials, the summary below
  card.classList.add('cw-ws');
  const piece = h('div', 'cw-ws-piece'), mats = h('div', 'cw-ws-mats'), sum = h('div', 'cw-ws-sum');
  const pHead = h('div'), pLooks = h('div'), pWants = h('div'), pStats = h('div');
  piece.append(pHead, pLooks, pWants, pStats);
  card.append(piece, mats, sum);
  pHead.append(h('h3', null, form.name));
  const wl = weightLine(form.weights);
  if (wl) pWants.append(h('p', 'cw-note', `This item wants: ${wl}. Better-suited materials raise the best quality it can reach; they do not change its damage, armour or weight.`));
  mats.append(h('div', 'cw-ws-title', 'Materials'));
  for (const slot of form.slots) {
    if (slot.role === 'fixed') continue;
    mats.append(h('div', 'cw-label', `${slot.label}${slot.optional ? ' (optional)' : ''}`));
    const options = slot.options;
    const cur = chosen[slot.id] ?? null;
    const nameOf = (o) => `${p.name(o)}${workOf(book, o) >= slot.n ? ' ✓' : ` (${workOf(book, o)})`}`;
    if (options.length > 12) {
      const sel = h('select', 'cw-search');
      if (slot.optional) { const o = h('option', null, 'None'); o.value = ''; sel.append(o); }
      for (const o of options) { const e = h('option', null, nameOf(o)); e.value = o; sel.append(e); }
      sel.value = cur ?? '';
      sel.disabled = !!_cw.act;
      sel.onchange = () => { _cw.picks = { ..._cw.picks, [slot.id]: sel.value || null }; rerender(); };
      mats.append(sel);
    } else {
      const chips = h('div', 'cw-chips');
      if (slot.optional) chips.append(button(`cw-chip${cur == null ? ' cw-on' : ''}`, 'None', () => { if (_cw.act) return; _cw.picks = { ..._cw.picks, [slot.id]: null }; rerender(); }));
      for (const o of options) {
        const c = button(`cw-chip${o === cur ? ' cw-on' : ''}${workOf(book, o) < slot.n ? ' cw-locked' : ''}`, nameOf(o), () => { if (_cw.act) return; _cw.picks = { ..._cw.picks, [slot.id]: o }; rerender(); });
        c.title = statLine(statsOf(o));
        chips.append(c);
      }
      mats.append(chips);
    }
    if (cur && statsOf(cur)) mats.append(h('p', 'cw-note', statLine(statsOf(cur))));
  }
  const asked = Object.fromEntries(Object.entries(chosen).filter(([, v]) => v != null));
  const plan = planOf(form.id, asked);
  if (!plan.ok) { mats.append(h('p', 'cw-note', plan.error === 'craft-recipe' ? 'No one makes it of that.' : 'Pick the materials.')); return; }
  const r = plan.legacy;
  const st = planStanding(plan, book, rank, specs);
  const focus = typeof book.isFocus === 'function' ? book.isFocus(S.prof) : true;
  const pot = potentialOfPlan(plan);
  const cap = qualityCap(plan, focus);
  const inputs = inputsOf(plan, { joiner: specs?.[50] === 'joiner' });
  mats.append(h('div', 'cw-label', 'Needs, from your Stores, bag and pack'));
  const box = h('div', 'cw-inputs');
  for (const i of inputs) {
    const have = workOf(book, i.key);
    const line = h('div', `cw-input${have < i.n ? ' cw-short' : ''}`);
    line.append(h('span', null, `${i.n} ${p.name(i.key)}`), h('span', 'cw-have', `have ${have}`));
    box.append(line);
  }
  mats.append(box);
  if (r.dyes === true) {
    const sel = h('select', 'cw-search');
    const opt = (text, value) => { const o = h('option', null, text); o.value = value; return o; };
    sel.append(opt('Undyed', ''));
    for (const d of GARMENT_DYES) sel.append(opt(DYE_NAMES[d] ?? String(d), String(d)));
    sel.value = _cw.dye == null ? '' : String(_cw.dye);
    sel.onchange = () => { _cw.dye = sel.value === '' ? null : Number(sel.value); };
    const lab = h('label', 'cw-note', 'Dye ');
    lab.append(sel);
    mats.append(lab);
  }
  const looks = LOOK_KINDS.includes(r.kind) ? looksOf(r) : [];
  if (looks.length && !looks.some((l) => l.look === _cw.look)) _cw.look = looks[0].look;
  const look = looks.length ? _cw.look : null;
  const preview = previewName(r, look);
  if (preview) pHead.append(h('p', 'cw-make', `You will make: ${preview}`));
  if (looks.length) drawLooks(pLooks, rerender, p, r, looks, look);
  if (pot) sum.append(h('p', 'cw-note', `Potential: ${pot.name} (${Math.round(pot.suitability * 100)}% suited). Your skill rolls the quality; Potential is the most this material can give.`));
  if (cap < (pot?.quality ?? 4)) sum.append(h('p', 'cw-note', `Not a Focus craft: quality tops out at ${QUALITY_NAMES[cap]}.`));
  if (rollsQuality(r)) {
    const odds = craftOdds(plan, { rank, clean: false, spec50: specs?.[50], spec100: specs?.[100], focus });   // the server's roll, steps and cap
    const clean = craftOdds(plan, { rank, clean: true, spec50: specs?.[50], spec100: specs?.[100], focus });
    const best = clean.findLastIndex((o) => o > 0);
    sum.append(h('div', 'cw-label', `Quality odds at your rank, held at ${QUALITY_NAMES[cap]}. A clean minigame raises them (up to ${QUALITY_NAMES[best]} ${clean[best]}%); a Company hall where your guild holds the town adds more.`));
    const bar = h('div', 'cw-odds');
    const key = h('div', 'cw-odds-key');
    odds.forEach((o, q) => {
      if (!(o > 0)) return;
      const seg = h('span', `cw-q${q}`); seg.style.width = `${o}%`; bar.append(seg);
      const k = h('span'); k.append(h('span', `cw-sw cw-q${q}`), globalThis.document.createTextNode(`${QUALITY_NAMES[q]} ${o}%`)); key.append(k);
    });
    sum.append(bar, key);
    drawStatsTable(pStats, r, odds, clean);
  }
  const fee = valueFee(recipeValue(r.id), feeOf(p, station));
  sum.append(h('p', 'cw-note', `+${craftValueXp(plan, inputs, rank, focus)} ${S.prof} experience${focus ? '' : ' (half, off Focus)'}${fee ? ` · fee ${fee} gold` : ''}`));
  if (st.s === 'locked') sum.append(h('p', 'cw-note', `Needs ${S.prof} rank ${r.rank}.`));
  const purseOk = !fee || (p.purse?.() ?? Infinity) >= fee;
  if (!purseOk) sum.append(h('p', 'cw-note', `You need ${fee} gold for the fee.`));
  const dye = dyeOk(r, _cw.dye) ? _cw.dye : null;
  if (away) sum.append(h('p', 'cw-note', `Stand at the ${S.name} to craft this.`));
  const ready = !away && st.s === 'ready' && purseOk && !_cw.busy && !_cw.act && typeof p.craft === 'function';
  const craft = (clean) => run(() => p.craft(r.id, { clean, form: form.id, picks: plan.picks, ...(Number.isInteger(look) ? { look } : {}), ...(r.dyes ? { dye } : {}) }));
  if (_cw.act) { piece.replaceChildren(pHead, _cw.act.el); return; }   // the work takes the piece's place while it runs
  const actions = h('div', 'cw-actions');
  const gentle = getPref('gentleActs') === true;
  actions.append(button('cw-btn cw-primary', _cw.busy ? 'Working...' : gentle ? 'Craft' : 'Craft (minigame)', () => {
    if (gentle) { craft(false); return; }
    _cw.act = mountAct('work', workOptions(plan, rank, p, station), (rep) => { _cw.act = null; if (rep) craft(rep.clean === true); else { _cw.word = 'You let it go. Nothing was spent.'; rerender(); } });
    rerender();
  }, !ready));
  if (!gentle) actions.append(button('cw-btn', 'Craft, skip the game', () => craft(false), !ready));
  sum.append(actions);
}

/** THE WORK's options for a plan: a part a chosen slot, its arc wider for a better-suited material and a higher rank. */
const STATION_BAND = Object.freeze({ anvil: 'heatBand', loom: 'stitchBand', workbench: 'planeBand', mason: 'chiselBand', jeweller: 'facetBand', fire: 'panBand' });
function workOptions(plan, rank, p, station) {
  const band = p[STATION_BAND[station]]?.() ?? 1;
  const suit = potentialOfPlan(plan)?.suitability ?? 0.6;
  const margin = rank - plan.legacy.rank;
  const parts = plan.form.slots.filter((sl) => sl.role !== 'fixed' && plan.picks[sl.id]).map((sl) => ({
    label: sl.label, material: p.name(plan.picks[sl.id]), width: workWidth(margin, band, sl.role === 'primary' ? suit : Math.min(1, suit + 0.15)),
  }));
  return { parts: parts.length ? parts : [{ label: plan.form.name, material: '', width: workWidth(margin, band, suit) }], theme: station };
}

/** The minigame's options for a recipe, at the player's rank and attributes (the provider's bands). */
function actOptions(kind, r, rank, p) {
  if (kind === 'heat') return { band: p.heatBand?.() ?? 1 };
  if (kind === 'stitch') return { band: p.stitchBand?.() ?? 1 };
  if (kind === 'plane') return { rank, band: p.planeBand?.() ?? 1 };
  if (kind === 'pan') return { pans: panCount(r), done: panWindow(rank, p.panBand?.() ?? 1, p.skillet?.() === true) };
  if (kind === 'facet') return { facets: facetCount(r), windowDeg: facetWindow(rank, p.facetBand?.() ?? 1) };
  if (kind === 'chisel') return { strikes: chiselStrikes(r), markS: chiselMarkS(rank, p.chiselBand?.() ?? 1) };
  return {};
}

function drawUpgrade(root, p, station, run) {
  const S = CW_STATIONS[station];
  const book = p.book;
  const fee = feeOf(p, station);
  const purse = p.purse?.() ?? 0;
  if (S.temper && typeof p.temperable === 'function') {
    root.append(h('div', 'cw-label', 'Raise quality: Crude, Standard, Fine, Superior, Masterwork. It never fails, and your rank sets the top.'));
    const pieces = p.temperable(S.temper);
    if (!pieces.length) root.append(h('div', 'cw-empty', 'Nothing in your pack to raise here.'));
    const rank = rankOf(book, S.temper === 'loom' ? 'outfitting' : 'smithing');
    for (const pc of pieces) {
      const r = RECIPES.find((x) => x.id === pc.recipe);
      if (!r) continue;
      const cost = temperCost(r, pc.quality), gold = temperGold(pc.quality) + valueFee(itemFeeValue(pc.item), fee);
      const cap = temperCap(r, rank);
      const have = workOf(book, cost.key);
      const line = h('div', 'cw-line');
      const main = h('div', 'cw-line-main');
      main.append(h('b', null, pc.name), h('span', 'cw-state', `${QUALITY_NAMES[pc.quality]} to ${QUALITY_NAMES[pc.quality + 1]}: ${cost.n} ${p.name(cost.key)} (have ${have}) and ${gold} gold`));
      if (pc.quality + 1 > cap) main.append(h('span', 'cw-state', `Your rank reaches ${QUALITY_NAMES[cap]} on this piece.`));
      line.append(main, button('cw-btn cw-primary', 'Raise', () => run(() => p.temper(pc)), _cw.busy || have < cost.n || purse < gold || pc.quality + 1 > cap || rank < r.rank));
      root.append(line);
    }
  }
  if (S.upgrade && typeof p.upgradable === 'function') {
    root.append(h('div', 'cw-label', 'Change metal: one step up the ladder, keeping its magic, sockets and quality.'));
    const offers = p.upgradable();
    if (!offers.length) root.append(h('div', 'cw-empty', 'No found metal pieces in your pack to rework.'));
    const rank = rankOf(book, 'smithing');
    for (const o of offers) {
      const have = workOf(book, o.cost.key), gold = o.gold + valueFee(itemFeeValue(o.item), fee);
      const line = h('div', 'cw-line');
      const main = h('div', 'cw-line-main');
      main.append(h('b', null, o.name), h('span', 'cw-state', `To ${o.next.madeOf}: ${o.cost.n} ${p.name(o.cost.key)} (have ${have}) and ${gold} gold${rank < o.next.rank ? `. Needs Smithing rank ${o.next.rank}` : ''}`));
      line.append(main, button('cw-btn cw-primary', 'Rework', () => run(() => p.upgrade(o)), _cw.busy || have < o.cost.n || purse < gold || rank < o.next.rank));
      root.append(line);
    }
  }
}

function drawSalvage(root, p, run) {
  if (typeof p.salvageable !== 'function') { root.append(h('div', 'cw-empty', 'Salvage is not open here.')); return; }
  const pieces = p.salvageable();
  // BUNNYFALL SPEC-SAFE: a salvage that would carry a craft past Journeyman (one of the two a character may raise) is asked
  // about first, and nothing is broken until the player says yes
  const salvage = (items) => run(async () => {
    _cw.commit = null;
    const r = await p.salvage(items);
    if (r?.needsCommit) _cw.commit = { items, needs: r.needsCommit };
    return r;
  });
  if (_cw.commit) {
    const box = h('div', 'cw-line');
    const names = _cw.commit.needs.map((n) => n.name).join(' and ');
    const main = h('div', 'cw-line-main');
    main.append(h('b', null, `Raise ${names} past Journeyman?`), h('span', 'cw-state', 'You can raise only two crafts past rank 50. The others stay at 50 for good. Nothing has been broken yet.'));
    const { items, needs } = _cw.commit;
    box.append(main,
      button('cw-btn', 'Yes, salvage', () => { _cw.commit = null; run(() => p.salvage(items, { commit: needs.map((n) => n.track) })); }, _cw.busy),
      button('cw-btn', 'No', () => { _cw.commit = null; run(async () => ({ text: 'Nothing was salvaged.' })); }, _cw.busy));
    root.append(box);
  }
  root.append(h('p', 'cw-note', 'Found gear breaks into about 40% of the materials it is made of, straight into your Stores. Magic pieces also give Welkynd Shards.'));
  if (!pieces.length) { root.append(h('div', 'cw-empty', 'Nothing in your pack to salvage.')); return; }
  const plain = pieces.filter((x) => x.materials && (!x.item.rarity || x.item.rarity === 'common'));
  if (plain.length) {
    const all = h('div', 'cw-actions');
    all.append(button('cw-btn', `Salvage all plain gear (${plain.length}): ${materialsText(plain.map((x) => x.item))}`, () => salvage(plain.map((x) => x.item)), _cw.busy));
    root.append(all);
  }
  for (const x of pieces) {
    const line = h('div', 'cw-line');
    const main = h('div', 'cw-line-main');
    main.append(h('b', null, x.name), h('span', 'cw-state', x.materials ? materialsText([x.item]) : 'Welkynd Shards only'));
    line.append(main, button('cw-btn', 'Salvage', () => salvage([x.item]), _cw.busy));
    root.append(line);
  }
}

function drawRefine(root, rerender, p, station, run) {
  const S = CW_STATIONS[station];
  const book = p.book;
  const works = S.refine();
  root.append(h('p', 'cw-note', 'Turn raw goods into what recipes ask for. Pick how many, then press.'));
  const counts = h('div', 'cw-chips');
  for (const n of [1, 5, 10, 25]) counts.append(button(`cw-chip${_cw.count === n ? ' cw-on' : ''}`, `x${n}`, () => { _cw.count = n; rerender(); }));
  root.append(counts);
  const rows = works.map((r) => {
    const rank = rankOf(book, r.xp ?? S.prof);
    const most = Math.min(SMELT_MAX, ...r.inputs.filter((i) => !i.catalyst).map((i) => Math.floor(workOf(book, i.key) / i.n)));
    return { r, rank, most, open: workOpen(r, rank) };
  }).sort((a, b) => Number(b.most > 0 && b.open) - Number(a.most > 0 && a.open));
  for (const x of rows) {
    const n = Math.max(1, Math.min(_cw.count, x.most));
    const line = h('div', 'cw-line');
    const main = h('div', 'cw-line-main');
    main.append(h('b', null, `${p.name(x.r.out)}${x.r.per > 1 ? ` (x${x.r.per})` : ''}`),
      h('span', 'cw-state', `${x.r.inputs.map((i) => `${i.n} ${p.name(i.key)}${i.catalyst ? ' (kept)' : ''}`).join(' + ')} · can make ${x.most}${x.open ? '' : ` · needs rank ${x.r.rank}`}`));
    line.append(main, button('cw-btn cw-primary', `Make ${n}`, () => run(() => p.smelt(x.r.id, n)), _cw.busy || !x.open || x.most < 1 || typeof p.smelt !== 'function'));
    root.append(line);
  }
}


// ─── THE BENCH PAGE (the Crafting tab): every station's list, read anywhere, made at the station ─────────

const _bench = { station: null, followed: null };
const BENCH_STATIONS = Object.freeze(['anvil', 'workbench', 'loom', 'mason', 'jeweller']);
/** `here` the station the player stands at (profPages stationHere), or null. Away, the lists are read and nothing is made. */
export function drawBench(detail, rerender, p, here, toOld) {
  ensureStyle();
  const stand = here && CW_STATIONS[here] ? here : null;
  const list = stand === 'fire' ? [...BENCH_STATIONS, 'fire'] : BENCH_STATIONS;
  if (stand && _bench.followed !== stand) { _bench.station = stand; _bench.followed = stand; }   // arriving shows that station
  if (!stand) _bench.followed = null;
  if (!list.includes(_bench.station)) _bench.station = list[0];
  const chips = h('div', 'cw-chips');
  for (const s of list) chips.append(button(`cw-chip${_bench.station === s ? ' cw-on' : ''}`, `${CW_STATIONS[s].name}${s === stand ? ' (here)' : ''}`, () => { if (_cw.act) return; _bench.station = s; rerender(); }));
  detail.append(chips);
  drawCraftWindow(detail, rerender, p, _bench.station, toOld, _bench.station !== stand);
}
