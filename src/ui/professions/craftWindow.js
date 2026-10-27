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
const FAMILY_WORDS = Object.freeze({ weapons: 'Weapons', armour: 'Armour', tools: 'Tools', kits: 'Repair kits', staves: 'Staves', bows: 'Bows',
  arrows: 'Arrows', furniture: 'Furniture', siege: 'Siege', clothing: 'Clothing', leather: 'Leather armour', jewellery: 'Jewellery', dishes: 'Dishes', stonework: 'Stonework',
  furnishings: 'Furnishings' });
const familyWord = (f) => FAMILY_WORDS[f] ?? `${String(f)[0].toUpperCase()}${String(f).slice(1)}`;
/** A garment's word where two patterns share a name (DFU's men's and women's boots). */
const groupWord = (r) => (r.group === 'MensClothing' ? "men's" : r.group === 'WomensClothing' ? "women's" : null);

/** The window's own memory: its tab, the pattern picked, its variant, a minigame under way, the last word said. */
const _cw = { station: null, tab: 'craft', family: null, pick: null, variant: null, heartwood: false, dye: null, act: null, busy: false, word: null, count: 1, query: '' };
export function resetCraftWindow() { Object.assign(_cw, { station: null, tab: 'craft', family: null, pick: null, variant: null, act: null, busy: false, word: null, count: 1, query: '' }); }

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
export function drawCraftWindow(detail, rerender, p, station, toOld) {
  ensureStyle();
  if (_cw.station !== station) { resetCraftWindow(); _cw.station = station; }
  const S = CW_STATIONS[station];
  const book = p.book;
  const prof = S.prof;
  const rank = rankOf(book, prof);
  const root = h('div', 'cw');
  const head = h('div', 'cw-head');
  const fee = feeOf(p, station);
  head.append(h('div', 'cw-title', S.name), h('div', 'cw-sub', `${prof[0].toUpperCase()}${prof.slice(1)} rank ${rank}${fee ? ` · fee ${fee} gold` : ''} · ${p.purse?.() ?? 0} gold carried`));
  root.append(head);
  const tabs = h('div', 'cw-tabs');
  const shown = TABS.filter(([id]) => id !== 'upgrade' || S.temper || S.upgrade).filter(([id]) => id !== 'refine' || S.refine().length);
  if (!shown.some(([id]) => id === _cw.tab)) _cw.tab = 'craft';
  for (const [id, word] of shown) tabs.append(button(`cw-tab${_cw.tab === id ? ' cw-on' : ''}`, word, () => { if (_cw.act) return; _cw.tab = id; _cw.word = null; rerender(); }));
  root.append(tabs);
  if (_cw.word) root.append(h('div', 'cw-word', _cw.word));
  const say = (text) => { _cw.word = text; _cw.busy = false; rerender(); };
  const run = async (fn) => { if (_cw.busy) return; _cw.busy = true; rerender(); try { const r = await fn(); say(r?.text ?? 'Done.'); } catch { say('That did not go through. Try again.'); } };

  if (_cw.tab === 'craft') drawCraft(root, rerender, p, station, run);
  else if (_cw.tab === 'upgrade') drawUpgrade(root, p, station, run);
  else if (_cw.tab === 'salvage') drawSalvage(root, p, run);
  else if (_cw.tab === 'refine') drawRefine(root, rerender, p, station, run);
  else drawStores(root, rerender, p, run);

  const foot = h('div', 'cw-foot');
  foot.append(button('cw-link', 'Open the classic station pages', () => toOld()));
  root.append(foot);
  detail.append(root);
}

function drawCraft(root, rerender, p, station, run) {
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
  if (pick) drawRecipeCard(card, rerender, p, station, pick, rank, specs, run);
  body.append(card);
  root.append(body);
}

function drawRecipeCard(card, rerender, p, station, pick, rank, specs, run) {
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
  const fee = feeOf(p, station);
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
    root.append(h('div', 'cw-label', 'Raise quality: Crude, Standard, Fine, Superior, Masterwork. Never fails; your rank sets the top.'));
    const pieces = p.temperable(S.temper);
    if (!pieces.length) root.append(h('div', 'cw-empty', 'Nothing in your pack to raise here.'));
    const rank = rankOf(book, S.temper === 'loom' ? 'outfitting' : 'smithing');
    for (const pc of pieces) {
      const r = RECIPES.find((x) => x.id === pc.recipe);
      if (!r) continue;
      const cost = temperCost(r, pc.quality), gold = temperGold(pc.quality) + fee;
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
      const have = workOf(book, o.cost.key), gold = o.gold + fee;
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
  root.append(h('p', 'cw-note', 'Found gear breaks into about 40% of the materials it is made of, straight into your Stores. Magic pieces also give Welkynd Shards.'));
  if (!pieces.length) { root.append(h('div', 'cw-empty', 'Nothing in your pack to salvage.')); return; }
  const plain = pieces.filter((x) => x.materials && (!x.item.rarity || x.item.rarity === 'common'));
  if (plain.length) {
    const all = h('div', 'cw-actions');
    all.append(button('cw-btn', `Salvage all plain gear (${plain.length}): ${materialsText(plain.map((x) => x.item))}`, () => run(() => p.salvage(plain.map((x) => x.item))), _cw.busy));
    root.append(all);
  }
  for (const x of pieces) {
    const line = h('div', 'cw-line');
    const main = h('div', 'cw-line-main');
    main.append(h('b', null, x.name), h('span', 'cw-state', x.materials ? materialsText([x.item]) : 'Welkynd Shards only'));
    line.append(main, button('cw-btn', 'Salvage', () => run(() => p.salvage([x.item])), _cw.busy));
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

function drawStores(root, rerender, p, run) {
  const book = p.book;
  const search = h('input', 'cw-search');
  search.placeholder = 'Search materials';
  search.value = _cw.query;
  search.oninput = () => { _cw.query = search.value; rerender(); };
  root.append(search);
  const q = _cw.query.trim().toLowerCase();
  const rows = [...(book?.state?.stores?.values?.() ?? [])]
    .map((s) => ({ key: s.material, name: p.name(s.material), total: (s.own | 0) + (s.bought | 0) + (s.gold | 0) + (s.loose | 0) }))
    .filter((s) => s.total > 0 && (!q || s.name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!rows.length) root.append(h('div', 'cw-empty', q ? 'No material matches.' : 'Your Stores are empty.'));
  for (const s of rows) {
    const line = h('div', 'cw-line');
    const main = h('div', 'cw-line-main');
    main.append(h('b', null, s.name), h('span', 'cw-state', `${s.total} stored`));
    const acts = h('div', 'cw-actions');
    for (const n of [1, 10]) acts.append(button('cw-btn', `Take ${n}`, () => run(() => p.withdraw(s.key, n)), _cw.busy || s.total < 1 || typeof p.withdraw !== 'function'));
    line.append(main, acts);
    root.append(line);
  }
}
