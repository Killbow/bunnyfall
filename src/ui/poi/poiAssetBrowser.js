// @ts-check
// Asset browser for the in-game POI editor: displays `poi/poiAssetCatalogue.js` as a virtualized grid or list with
// search, kind/category/tag filters, saved favorites and recent picks, and a detail pane with a preview. Entries can be
// placed via the Place button or double-click (following the cursor until a ground click) or by dragging a card onto
// the world canvas, delegated through `poi/poiAssetPlace.js`. Card thumbnails load on demand with bounded concurrency
// and stay cached until `destroy()`. Model cards and the detail pane show a picture rendered in the page by
// `poi/poiModelThumbs.js`; a card shows the model number when nothing can be rendered.

import { t } from '../../systems/textManager.js';
import { createPoiAssetCatalogue, createPoiAssetPrefs, loadPoiAssetCatalogue, visibleRows, POI_ASSET_CATEGORIES } from '../../poi/poiAssetCatalogue.js';
import { poiAssetWhyNot } from '../../poi/poiAssetPlace.js';
import { dfTexturePng } from '../../poi/dfModelImport.js';
import { createPoiModelThumbs } from '../../poi/poiModelThumbs.js';
import { isNudeFlat, showNudity } from '../../characters/nudeFlats.js';

export const POI_ASSET_DRAG_TYPE = 'application/x-bunnyfall-poi-asset';
const CELL = Object.freeze({ grid: { w: 78, h: 86 }, list: { w: 0, h: 26 } });
/** How many pictures load at once. */
const THUMB_LOADS = 3;

const STYLE_ID = 'dfpoi-assets-style';
const CSS = `
.dfpoi-assets { top: 56px; left: 266px; width: min(440px, calc(100vw - 590px)); min-width: 300px; bottom: 40px; padding: 6px; display: flex; flex-direction: column; gap: 4px; overflow: hidden; }
.dfpoi-assets[hidden] { display: none; }
.dfpoi-assets-filters { display: flex; flex-wrap: wrap; gap: 4px; }
.dfpoi-assets-filters input[type="search"] { flex: 1 1 100%; }
.dfpoi-assets-filters select { flex: 1 1 30%; }
.dfpoi-assets-scroll { position: relative; flex: 1 1 auto; overflow-y: auto; min-height: 120px; border: 1px solid #3a2f20; border-radius: 4px; }
.dfpoi-assets-cards { position: absolute; left: 0; right: 0; display: grid; }
.dfpoi-asset { position: relative; overflow: hidden; cursor: pointer; border-radius: 3px; padding: 2px; }
.dfpoi-asset:hover { background: #2a2620; }
.dfpoi-asset[aria-selected="true"] { background: #4b3c27; }
.dfpoi-assets-cards.grid .dfpoi-asset { height: 84px; display: flex; flex-direction: column; align-items: center; }
.dfpoi-assets-cards.list .dfpoi-asset { height: 26px; display: flex; gap: 6px; align-items: center; }
.dfpoi-asset-pic { flex: 0 0 auto; display: flex; align-items: center; justify-content: center; background: #0003; border-radius: 3px; color: #b9b2a3; font-size: 11px; overflow: hidden; }
.dfpoi-assets-cards.grid .dfpoi-asset-pic { width: 56px; height: 56px; }
.dfpoi-assets-cards.list .dfpoi-asset-pic { width: 22px; height: 22px; font-size: 9px; }
.dfpoi-asset-pic img { max-width: 100%; max-height: 100%; image-rendering: pixelated; }
.dfpoi-asset-pic img.dfpoi-asset-3d { image-rendering: auto; }
.dfpoi-asset-nm { font-size: 11px; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.dfpoi-assets-cards.grid .dfpoi-asset-nm { text-align: center; }
.dfpoi-asset-mark { position: absolute; top: 1px; right: 3px; font-size: 10px; color: #e8cf8a; }
.dfpoi-asset-flag { color: #f2b7ae; }
.dfpoi-assets-info { flex: 0 0 auto; max-height: 42%; overflow-y: auto; border-top: 1px solid #3a2f20; padding-top: 4px; }
.dfpoi-assets-info img { width: 128px; height: 128px; object-fit: contain; image-rendering: pixelated; background: #0003; border-radius: 4px; float: right; margin-left: 6px; }
.dfpoi-assets-kv { color: #b9b2a3; }
`;

/**
 * Creates the asset browser dock inside `host`. `getTexture` loads classic and mod texture archives for thumbnails,
 * `dfModels` (with `arch`) supplies the models for model pictures, `storage` persists favorites and recent picks,
 * `place` places an entry (`at` is the drop position, or null when started from the Place button or double-click),
 * `load` fetches the catalog JSON, and `onToggle` runs when the browser opens or closes.
 * @param {{ doc?: Document, host: HTMLElement, getTexture?: ((archive: number) => Promise<any>) | null, dfModels?: any, storage?: any, load?: () => Promise<any>, onToggle?: () => void,
 *   place: (asset: import('../../poi/poiAssetCatalogue.js').PoiAsset, at: { x: number, y: number } | null) => Promise<boolean> | boolean }} o
 */
export function createPoiAssetBrowser({ doc = document, host, getTexture = null, dfModels = null, storage = null, place, load = () => loadPoiAssetCatalogue(), onToggle = () => {} }) {
  if (!doc.getElementById?.(STYLE_ID)) { const s = doc.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; (doc.head ?? doc.body).append(s); }
  const el = (/** @type {string} */ tag, cls = '', /** @type {string | null} */ text = null) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const btn = (/** @type {string} */ text, /** @type {() => void} */ onClick) => { const b = /** @type {HTMLButtonElement} */ (el('button', 'dfpoi-btn', text)); b.type = 'button'; b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); }); return b; };
  const opt = (/** @type {string} */ v, /** @type {string} */ text) => { const o = /** @type {HTMLOptionElement} */ (el('option', '', text)); o.value = v; return o; };
  const swallow = (/** @type {Event} */ e) => e.stopPropagation();

  const box = el('div', 'dfpoi-dock dfpoi-assets');
  box.hidden = true;
  for (const ty of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'wheel', 'contextmenu', 'touchstart', 'keydown']) box.addEventListener(ty, swallow);
  host.append(box);

  const prefs = createPoiAssetPrefs(storage);
  /** @type {(ReturnType<typeof createPoiAssetCatalogue> & { nudeOk: boolean }) | null} */
  let cat = null;
  const st = { q: '', kind: '', category: '', tag: '', source: 'all', view: /** @type {'grid' | 'list'} */ ('grid'), sel: /** @type {string | null} */ (null) };
  /** @type {import('../../poi/poiAssetCatalogue.js').PoiAsset[]} */
  let results = [];

  const KIND_NAMES = { model: t('poi.assets.kindModel', 'Models'), flat: t('poi.assets.kindFlat', 'Pictures'), item: t('poi.assets.kindItem', 'Items'), creature: t('poi.assets.kindCreature', 'Creatures') };
  /** @type {Record<string, string>} */
  const CATEGORY_NAMES = {
    'buildings': t('poi.assets.cat.buildings', 'Buildings'),
    'furniture': t('poi.assets.cat.furniture', 'Furniture'),
    'dungeon': t('poi.assets.cat.dungeon', 'Dungeon pieces'),
    'outdoor': t('poi.assets.cat.outdoor', 'Outdoors'),
    'ships': t('poi.assets.cat.ships', 'Ships'),
    'models': t('poi.assets.cat.models', 'Other models'),
    'nature': t('poi.assets.cat.nature', 'Trees and plants'),
    'lights': t('poi.assets.cat.lights', 'Lights'),
    'decor': t('poi.assets.cat.decor', 'Decorations'),
    'people': t('poi.assets.cat.people', 'People'),
    'textures': t('poi.assets.cat.textures', 'Wall and ground textures'),
    'underwater': t('poi.assets.cat.underwater', 'Underwater'),
    'festival': t('poi.assets.cat.festival', 'Witches\' Festival'),
    'mod-flats': t('poi.assets.cat.modFlats', 'Mod pictures'),
    'weapons': t('poi.assets.cat.weapons', 'Weapons'),
    'armor': t('poi.assets.cat.armor', 'Armor'),
    'clothing': t('poi.assets.cat.clothing', 'Clothing'),
    'items': t('poi.assets.cat.items', 'Other items'),
    'trophies': t('poi.assets.cat.trophies', 'Trophies'),
    'monsters': t('poi.assets.cat.monsters', 'Monsters'),
    'classes': t('poi.assets.cat.classes', 'Class enemies'),
  };
  const categoryName = (/** @type {string} */ k) => CATEGORY_NAMES[k] ?? POI_ASSET_CATEGORIES[k] ?? k;

  const head = el('div', 'dfpoi-row');
  const title = el('span', 'dfpoi-grow', t('poi.assets.title', 'Assets'));
  title.style.fontWeight = '600';
  const viewBtn = btn(t('poi.assets.list', 'List'), () => { st.view = st.view === 'grid' ? 'list' : 'grid'; viewBtn.textContent = st.view === 'grid' ? t('poi.assets.list', 'List') : t('poi.assets.grid', 'Grid'); scroller.scrollTop = 0; draw(); });
  head.append(title, viewBtn, btn(t('poi.assets.close', 'Close'), () => close()));
  const q = /** @type {HTMLInputElement} */ (el('input'));
  q.type = 'search';
  q.placeholder = t('poi.assets.search', 'Search by name or number');
  q.addEventListener('input', () => { st.q = q.value; refresh(); });
  const kindSel = /** @type {HTMLSelectElement} */ (el('select'));
  const catSel = /** @type {HTMLSelectElement} */ (el('select'));
  const tagSel = /** @type {HTMLSelectElement} */ (el('select'));
  const srcSel = /** @type {HTMLSelectElement} */ (el('select'));
  kindSel.title = t('poi.assets.kind', 'Kind');
  catSel.title = t('poi.assets.category', 'Category');
  tagSel.title = t('poi.assets.tag', 'Tag');
  srcSel.title = t('poi.assets.show', 'Show');
  kindSel.addEventListener('change', () => { st.kind = kindSel.value; st.category = ''; st.tag = ''; fillFilters(); refresh(); });
  catSel.addEventListener('change', () => { st.category = catSel.value; st.tag = ''; fillFilters(); refresh(); });
  tagSel.addEventListener('change', () => { st.tag = tagSel.value; refresh(); });
  srcSel.addEventListener('change', () => { st.source = srcSel.value; refresh(); });
  const filters = el('div', 'dfpoi-assets-filters');
  filters.append(q, kindSel, catSel, tagSel, srcSel);
  const count = el('div', 'dfpoi-sub');
  const spacer = el('div');
  const cards = el('div', 'dfpoi-assets-cards grid');
  const scroller = el('div', 'dfpoi-assets-scroll');
  scroller.append(spacer, cards);
  scroller.addEventListener('scroll', () => draw(), { passive: true });
  const info = el('div', 'dfpoi-assets-info');
  box.append(head, filters, count, scroller, info);

  // Each filter dropdown lists only options present in the entries matching the broader filters above it (categories
  // for the selected kind, tags for the selected kind and category).
  function fillFilters() {
    if (!cat) return;
    const tally = (/** @type {(a: any) => boolean} */ keep, /** @type {(a: any) => string[]} */ keys) => {
      const m = new Map();
      for (const a of /** @type {any} */ (cat).assets) if (keep(a)) for (const k of keys(a)) m.set(k, (m.get(k) ?? 0) + 1);
      return m;
    };
    const kinds = tally(() => true, (a) => [a.kind]);
    kindSel.replaceChildren(opt('', t('poi.assets.anyKind', 'All kinds')), ...['model', 'flat', 'item', 'creature'].filter((k) => kinds.has(k)).map((k) => opt(k, `${KIND_NAMES[k]} (${kinds.get(k)})`)));
    kindSel.value = st.kind;
    const cats = tally((a) => !st.kind || a.kind === st.kind, (a) => [a.category]);
    catSel.replaceChildren(opt('', t('poi.assets.anyCategory', 'Any category')), ...Object.keys(POI_ASSET_CATEGORIES).filter((k) => cats.has(k)).map((k) => opt(k, `${categoryName(k)} (${cats.get(k)})`)));
    catSel.value = st.category;
    const tags = tally((a) => (!st.kind || a.kind === st.kind) && (!st.category || a.category === st.category), (a) => a.tags);
    tagSel.replaceChildren(opt('', t('poi.assets.anyTag', 'Any tag')), ...[...tags.keys()].sort().map((k) => opt(k, `${k} (${tags.get(k)})`)));
    tagSel.value = st.tag;
    srcSel.replaceChildren(opt('all', t('poi.assets.everything', 'Everything')), opt('fav', t('poi.assets.favorites', 'Favorites ({n, number})', { n: prefs.favorites().size })), opt('recent', t('poi.assets.recent', 'Recent')));
    srcSel.value = st.source;
  }

  // under the editor's bar, which wraps to more rows on a narrow screen
  function fit() {
    const r = host.querySelector?.('.dfpoi-bar')?.getBoundingClientRect?.();
    box.style.top = `${Math.max(56, Math.round((r?.bottom ?? 48) + 8))}px`;
  }

  function refresh() {
    fit();
    if (!cat) return;
    const recent = st.source === 'recent' ? prefs.recent() : null;
    const ids = st.source === 'fav' ? prefs.favorites() : recent ? new Set(recent) : null;
    results = cat.search({ q: st.q, kind: st.kind || null, category: st.category || null, tag: st.tag || null, ids });
    if (recent) { const at = new Map(recent.map((id, i) => [id, i])); results.sort((a, b) => (at.get(a.id) ?? 0) - (at.get(b.id) ?? 0)); }
    count.textContent = t('poi.assets.count', '{n, number} of {of, number}', { n: results.length, of: cat.assets.length });
    draw();
  }

  // ── pictures: a flat's (or an item's or a creature's) record, loaded when its card is drawn ──
  /** @type {Map<string, string | null>} */
  const pics = new Map();
  /** @type {string[]} */
  const queue = [];
  let loadsRunning = 0;
  /** @type {Map<string, HTMLElement>} the picture boxes on screen, by entry */
  const onScreen = new Map();
  const picKey = (/** @type {any} */ a) => (a?.flat ? `${a.flat[0]}.${a.flat[1]}` : null);
  function wantPic(/** @type {any} */ a) {
    const k = picKey(a);
    if (!k || !getTexture || pics.has(k) || queue.includes(k)) return;
    queue.push(k);
    pump();
  }
  const wanted = (/** @type {string} */ k) => picKey(cat?.get(st.sel ?? '')) === k || [...onScreen.keys()].some((id) => picKey(cat?.get(id)) === k);
  function pump() {
    while (loadsRunning < THUMB_LOADS && queue.length) {
      const k = /** @type {string} */ (queue.shift());
      // skip a card that scrolled out of view before its thumbnail started loading (drawing it again queues it again)
      if (pics.has(k) || !wanted(k)) continue;
      loadsRunning++;
      const [a, r] = k.split('.').map(Number);
      Promise.resolve().then(() => dfTexturePng(/** @type {any} */ (getTexture), a, r)).then((p) => p ? URL.createObjectURL(new Blob([/** @type {any} */ (p.png)], { type: 'image/png' })) : null, () => null)
        .then((url) => {
          pics.set(k, url);
          for (const [id, box] of onScreen) { const e = cat?.get(id); if (e && picKey(e) === k) fillPic(box, e); }
          if (st.sel && picKey(cat?.get(st.sel)) === k) showInfo();
        })
        .finally(() => { loadsRunning--; pump(); });
    }
  }
  // ── a model's card picture, drawn in the page (poi/poiModelThumbs.js): wanted while its card is on screen ──
  const thumbs = dfModels?.arch ? createPoiModelThumbs({
    arch: dfModels.arch, palette: dfModels.palette ?? null, cpuModels: dfModels.cpuModels ?? null, textureFiles: dfModels.textureFiles ?? null, getTexture,
    wanted: (id) => onScreen.has(`model:${id}`),
    onReady: (id) => { const b = onScreen.get(`model:${id}`); const e = cat?.get(`model:${id}`); if (b && e) fillPic(b, e); },
  }) : null;
  // the detail pane's larger preview of the selected model, rendered the same way and cached only in page memory
  const previews = dfModels?.arch ? createPoiModelThumbs({
    arch: dfModels.arch, palette: dfModels.palette ?? null, cpuModels: dfModels.cpuModels ?? null, textureFiles: dfModels.textureFiles ?? null, getTexture,
    size: 128, store: null, keep: 32,
    wanted: (id) => st.sel === `model:${id}`,
    onReady: (id) => { if (st.sel === `model:${id}`) showInfo(); },
  }) : null;
  const glyph = (/** @type {any} */ a) => (a.kind === 'model' ? t('poi.assets.glyphModel', '3D') : a.kind === 'creature' ? t('poi.assets.glyphCreature', 'enemy') : a.kind === 'item' ? t('poi.assets.glyphItem', 'item') : '');
  function fillPic(/** @type {HTMLElement} */ box, /** @type {any} */ a) {
    const shot = a.kind === 'model' && thumbs ? thumbs.url(a.model) : null;
    const url = shot ?? pics.get(picKey(a) ?? '');
    if (url) { const img = /** @type {HTMLImageElement} */ (el('img', shot ? 'dfpoi-asset-3d' : '')); img.alt = ''; img.src = url; box.replaceChildren(img); } else box.textContent = a.kind === 'model' ? `${glyph(a)} ${a.model}` : glyph(a);
  }

  function draw() {
    if (box.hidden || !cat) return;
    const cell = CELL[st.view];
    const per = st.view === 'list' ? 1 : Math.max(1, Math.floor(Math.max(1, scroller.clientWidth) / cell.w));
    const v = visibleRows(results.length, per, cell.h, scroller.scrollTop, scroller.clientHeight || 400);
    spacer.style.height = `${v.height}px`;
    cards.style.top = `${v.first * cell.h}px`;
    cards.style.gridTemplateColumns = `repeat(${per}, minmax(0, 1fr))`;
    cards.className = `dfpoi-assets-cards ${st.view}`;
    onScreen.clear();
    const out = [];
    for (let i = v.from; i < v.to; i++) {
      const a = results[i];
      const card = el('div', 'dfpoi-asset');
      card.dataset.id = a.id;
      card.setAttribute('aria-selected', String(st.sel === a.id));
      card.title = `${a.name}\n${a.id}`;
      const why = poiAssetWhyNot(a);
      card.draggable = !why;
      const pic = el('div', 'dfpoi-asset-pic');
      fillPic(pic, a);
      onScreen.set(a.id, pic);
      if (a.kind === 'model') thumbs?.want(a.model);
      else wantPic(a);
      card.append(pic, el('div', 'dfpoi-asset-nm', a.name));
      const marks = `${prefs.isFavorite(a.id) ? '★' : ''}${a.duplicate || a.missing ? ' !' : ''}`;
      if (marks) card.append(el('span', `dfpoi-asset-mark${a.duplicate || a.missing ? ' dfpoi-asset-flag' : ''}`, marks));
      card.addEventListener('click', () => select(a.id));
      card.addEventListener('dblclick', () => { if (!poiAssetWhyNot(a)) void doPlace(a, null); });
      card.addEventListener('dragstart', (e) => { e.dataTransfer?.setData(POI_ASSET_DRAG_TYPE, a.id); e.dataTransfer?.setData('text/plain', a.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'; });
      out.push(card);
    }
    cards.replaceChildren(...out);
  }

  // ── the information pane ──
  function showInfo() {
    const a = st.sel ? cat?.get(st.sel) : null;
    if (!a) { info.replaceChildren(el('div', 'dfpoi-sub', t('poi.assets.pick', 'Select an asset to preview it.'))); return; }
    const kv = (/** @type {string} */ k, /** @type {string} */ v) => { const d = el('div'); d.append(el('span', 'dfpoi-assets-kv', `${k}: `), v); return d; };
    const nodes = [];
    const src = a.kind === 'model' ? previews?.url(a.model) ?? null : pics.get(picKey(a) ?? '') ?? null;
    if (src) { const img = /** @type {HTMLImageElement} */ (el('img')); img.alt = ''; img.src = src; nodes.push(img); }
    const nm = el('div', '', a.name);
    nm.style.fontWeight = '600';
    nodes.push(nm, kv(t('poi.assets.id', 'ID'), a.id), kv(t('poi.assets.kindIs', 'Kind'), KIND_NAMES[a.kind]), kv(t('poi.assets.category', 'Category'), categoryName(a.category)));
    if (a.tags.length) nodes.push(kv(t('poi.assets.tags', 'Tags'), a.tags.join(', ')));
    if (a.flat && a.kind !== 'flat') nodes.push(kv(t('poi.assets.picture', 'Picture'), `${a.flat[0]}.${a.flat[1]}`));
    nodes.push(kv(t('poi.assets.source', 'From'), a.source));
    if (a.figure) nodes.push(el('div', 'dfpoi-warn', t('poi.assets.figure', 'People are always shown at their default size.')));
    if (a.standIn) nodes.push(el('div', 'dfpoi-warn', t('poi.assets.standIn', 'Built-in fallback: {what}', { what: a.standIn })));
    if (a.duplicate) nodes.push(el('div', 'dfpoi-problem', t('poi.assets.duplicate', 'The game files repeat this number. The first one is used.')));
    if (a.missing) nodes.push(el('div', 'dfpoi-problem', t('poi.assets.missing', 'Missing from the game files: {why}', { why: a.missing })));
    const why = poiAssetWhyNot(a);
    if (why) nodes.push(el('div', 'dfpoi-warn', why));
    const placeBtn = btn(t('poi.assets.place', 'Place'), () => void doPlace(a, null));
    placeBtn.disabled = !!why;
    placeBtn.title = why ?? t('poi.assets.placeHint', 'Click Place, then click the ground. Or drag the card onto the world.');
    const fav = btn(prefs.isFavorite(a.id) ? t('poi.assets.unfavorite', 'Remove favorite') : t('poi.assets.favorite', 'Favorite'), () => { prefs.toggleFavorite(a.id); fillFilters(); if (st.source === 'fav') refresh(); else draw(); showInfo(); });
    const acts = el('div', 'dfpoi-row');
    acts.append(placeBtn, fav);
    nodes.push(acts);
    info.replaceChildren(...nodes);
    if (a.kind === 'model') previews?.want(a.model);
    else wantPic(a);
  }
  function select(/** @type {string} */ id) {
    st.sel = id;
    showInfo();
    draw();
  }

  async function doPlace(/** @type {any} */ a, /** @type {{ x: number, y: number } | null} */ at) {
    const ok = await place(a, at);
    if (ok) { prefs.noteUsed(a.id); if (st.source === 'recent') refresh(); }
    return ok;
  }

  // only accept drops directly on the world canvas, outside any editor dock
  const dragOk = (/** @type {DragEvent} */ e) => !box.hidden && !!e.dataTransfer?.types?.includes(POI_ASSET_DRAG_TYPE)
    && /** @type {any} */ (e.target)?.tagName === 'CANVAS' && !(/** @type {any} */ (e.target)?.closest?.('.dfpoi'));
  const onDragOver = (/** @type {DragEvent} */ e) => { if (dragOk(e)) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; } };
  const onDrop = (/** @type {DragEvent} */ e) => {
    if (!dragOk(e)) return;
    e.preventDefault();
    const a = cat?.get(e.dataTransfer?.getData(POI_ASSET_DRAG_TYPE) ?? '');
    if (a && !poiAssetWhyNot(a)) void doPlace(a, { x: e.clientX, y: e.clientY });
  };

  async function open() {
    if (box.hidden) { box.hidden = false; fit(); onToggle(); }
    doc.addEventListener('dragover', onDragOver);
    doc.addEventListener('drop', onDrop);
    // rebuild the in-memory catalog if the Show Nudity setting changed, since nude flats are included only when it is
    // enabled
    const nudeOk = showNudity();
    if (!cat || cat.nudeOk !== nudeOk) {
      if (!cat) info.replaceChildren(el('div', 'dfpoi-sub', t('poi.assets.loading', 'Loading the catalog...')));
      const json = await load();
      if (!json) { info.replaceChildren(el('div', 'dfpoi-problem', t('poi.assets.loadFailed', 'The catalog could not be loaded.'))); return; }
      cat = { ...createPoiAssetCatalogue(json, { hide: (a) => !nudeOk && !!a.flat && a.kind === 'flat' && isNudeFlat(a.flat[0], a.flat[1]) }), nudeOk };
      if (st.sel && !cat.get(st.sel)) st.sel = null;
      fillFilters();
      showInfo();
    }
    refresh();
    q.focus?.();
  }
  function close() {
    if (!box.hidden) { box.hidden = true; onToggle(); }
    doc.removeEventListener('dragover', onDragOver);
    doc.removeEventListener('drop', onDrop);
  }
  /** Closes the browser, revokes all cached thumbnail and preview object URLs, and removes the dock element. */
  function destroy() {
    close();
    for (const url of pics.values()) if (url) URL.revokeObjectURL(url);
    pics.clear();
    thumbs?.destroy();
    previews?.destroy();
    box.remove();
  }
  return {
    open, close, destroy,
    toggle: () => (box.hidden ? open() : close()),
    isOpen: () => !box.hidden,
    /** The catalog once loaded, else null. */
    catalog: () => cat,
    /** Show entry `id` in the information pane. */
    select,
    /** Re-renders the cards and detail pane when registered placers change. */
    redraw: () => { draw(); showInfo(); },
    element: box,
  };
}
