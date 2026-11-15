// @ts-check
// UI for flat pictures in the in-game POI editor: a dialog for choosing a game picture (by archive and record) or an
// item (by template number) to place with a click on the ground, inspector fields for a selected flat row, and a 2D
// viewer that shows the picture pixel for pixel, mirrored or rotated as placed, over a backdrop that shows its
// transparent pixels, with zoom, pan, a pixel grid, and its palette. The panel passes its helpers in, so this file adds
// no weight to the panel. The game draws flat pictures through the house-decor code (scenes/poiFlats.js), and the
// schema is poi/poiLawV2.js.

import { t } from '../../systems/textManager.js';
import { find, marksOf } from '../../poi/poiScene.js';
import { POI_V2_LIMITS, POI_V2_PINS as P } from '../../poi/poiLawV2.js';
import { flatMirrored, setFlatMirrored, flatRoom, isFigureRow, itemHangs, wrapDeg } from '../../poi/poiFlatRows.js';
import { poiFlatPicture } from '../../scenes/poiFlats.js';
import { decorFlatLight } from '../../systems/decor/decorCatalogue.js';
import { templateByIndex, GROUP_TEMPLATE_INDICES } from '../../systems/item/itemTemplates.js';
import { ITEM_GROUP_NAME_BY_CLASS } from '../../systems/loot/loot.js';
import { billboardSize } from '../../world/rmbFlats.js';

/** Archives numbered below this one hold mostly wall and model textures, though some show as pictures in the game
 *  (105 and 106 are seafloor plants); all are valid in the schema, so the picker allows them and says so. */
export const FLAT_TEXTURE_ARCHIVES_END = 172;
/** Default texture archives in the dropdown (from systems/decor/decorCatalogue.js: lights, misc, boxes, books,
 *  treasure, clothing, and three NPC archives); any other archive number can be entered manually. */
export const FLAT_ARCHIVES = Object.freeze([210, 211, 205, 209, 216, 204, 182, 183, 184]);
const THUMB_PX = 56;
const DEFAULT_LIGHT = Object.freeze({ color: [1, 0.85, 0.6], radius: 6, intensity: 1, flicker: false });

/** Returns the Daggerfall ItemGroups group number for an item template, or null. @param {number} t */
export function templateGroup(t) {
  for (const [name, list] of Object.entries(GROUP_TEMPLATE_INDICES)) if (Array.isArray(list) && list.includes(t)) { const g = ITEM_GROUP_NAME_BY_CLASS.indexOf(name); return g >= 0 ? g : null; }
  return null;
}
/** Builds the `{ t, g? }` item reference for template number `t`, or returns null if the template does not exist.
 *  @param {number} t */
export function itemOfTemplate(t) {
  if (!Number.isInteger(t) || !templateByIndex(t)) return null;
  const g = templateGroup(t);
  return { t, ...(g != null ? { g } : {}) };
}

/** Decodes frame `f` of record `r` from a texture archive as `{ width, height, rgba, index }` in top-down row order
 *  (`index` holds each pixel's palette index), or null on failure. Palette index 0 is transparent. */
export function flatPixels(tex, r, f = 0) {
  try {
    const bmp = tex.getDFBitmap(r, f);
    if (!bmp?.width || !bmp?.height) return null;
    const img = tex.getColor32(bmp, 0);
    const rgba = new Uint8ClampedArray(img.colors.length), row = img.width * 4;
    // its rows are bottom-up
    for (let y = 0; y < img.height; y++) rgba.set(img.colors.subarray((img.height - 1 - y) * row, (img.height - y) * row), y * row);
    return { width: img.width, height: img.height, rgba, index: bmp.data };
  } catch { return null; }
}
/** Returns a texture file's palette as 256 `[r, g, b]` tuples, or null. */
export function paletteOf(tex) {
  const p = tex?.palette, buf = p?.paletteBuffer;
  if (!buf) return null;
  const h = p.headerLength ?? 0, out = [];
  for (let i = 0; i < 256; i++) out.push([buf[h + i * 3] ?? 0, buf[h + i * 3 + 1] ?? 0, buf[h + i * 3 + 2] ?? 0]);
  return out;
}

/**
 * @param {any} c the panel's helpers: `{ doc, el, btn, field, numberInput, text, select, check, swallow, root, say, edit,
 *   editor, getTexture, dialogsClosed, closeDialog, setDialog, dialogIs }`
 */
export function createPoiFlatUi(c) {
  const { el, btn, field, numberInput, text, check, swallow } = c;
  const swallowAll = (box) => { for (const ty of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'wheel', 'contextmenu', 'touchstart']) box.addEventListener(ty, swallow); };
  const texOf = async (a) => { try { return (await c.getTexture?.(a)) ?? null; } catch { return null; } };
  const canvasOf = (px) => {
    const cv = c.doc.createElement('canvas');
    cv.width = px.width; cv.height = px.height;
    cv.getContext('2d')?.putImageData(new ImageData(px.rgba, px.width, px.height), 0, 0);
    return cv;
  };

  /** @returns {string | null} */
  const full = () => {
    const s = c.editor.placeInto?.() ?? c.edit.selection();
    return s && !flatRoom(c.edit.docOf(s.id)) ? t('poi.flat.full', 'This POI already holds {max} flat pictures.', { max: POI_V2_LIMITS.flats }) : null;
  };

  /**
   * Opens the flat-picture picker dialog. When `change` (`{ id, key }`) is given, replaces that billboard row's
   * picture; otherwise arms placement for the next click on the ground.
   * @param {{ change?: { id: string, key: string } | null }} [o]
   */
  function openFlat({ change = null } = {}) {
    c.dialogsClosed();
    const why = change ? null : full();
    if (why) { c.say(why, 'bad'); return; }
    const box = el('div', 'dfpoi-dialog');
    swallowAll(box);
    const mine = () => c.dialogIs(box);
    let mode = 'picture', archive = 210, record = null, itemT = 200, name = '';
    let lit = false, lightTouched = false;
    const status = el('div', 'dfpoi-sub');
    const grid = el('div');
    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;max-height:220px;overflow:auto;background:#0003;padding:4px;border-radius:4px';
    const cells = new Map();
    const chosen = el('div', 'dfpoi-sub');
    const litBox = check(false, (v) => { lit = v; lightTouched = true; });
    const showChosen = () => {
      if (mode === 'picture') chosen.textContent = record == null ? t('poi.flat.noneYet', 'No picture chosen yet.') : t('poi.flat.chosen', 'Archive {a}, record {r}', { a: archive, r: record });
      for (const [r, cell] of cells) cell.style.outline = mode === 'picture' && record === r ? '2px solid #e8c24a' : 'none';
    };
    let drawn = 0;
    async function loadArchive() {
      const token = ++drawn;
      cells.clear(); grid.replaceChildren();
      status.textContent = t('poi.flat.loading', 'Loading pictures...');
      const f = await texOf(archive);
      if (token !== drawn || !mine()) return;
      const n = Math.min(f?.recordCount ?? 0, P.decorRecordMax + 1);
      if (!f || !n) { status.textContent = t('poi.flat.noArchive', 'Nothing in that archive.'); return; }
      status.textContent = t('poi.flat.count', '{n, plural, one {# picture} other {# pictures}}. Click one.', { n });
      if (archive < FLAT_TEXTURE_ARCHIVES_END) status.textContent += ` ${t('poi.flat.textureArchive', 'Archives below {end} hold mostly wall and model textures. Some, such as 105 and 106, hold seafloor plants.', { end: FLAT_TEXTURE_ARCHIVES_END })}`;
      let r = 0;
      const batch = () => {
        if (token !== drawn || !mine()) return;
        for (let k = 0; k < 24 && r < n; k++, r++) {
          const px = flatPixels(f, r);
          if (!px) continue;
          const cv = canvasOf(px);
          const cell = el('div');
          cell.style.cssText = `width:${THUMB_PX}px;height:${THUMB_PX}px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:3px`;
          cv.style.cssText = `max-width:${THUMB_PX}px;max-height:${THUMB_PX}px;image-rendering:pixelated`;
          cell.title = `${archive} / ${r}`;
          const rec = r;
          cell.addEventListener('click', () => {
            record = rec;
            if (!lightTouched) { lit = !!decorFlatLight([archive, rec]); litBox.checked = lit; }
            showChosen();
          });
          cell.append(cv);
          cells.set(rec, cell); grid.append(cell);
        }
        showChosen();
        if (r < n) setTimeout(batch, 0);
      };
      batch();
    }
    const archSel = c.select(String(archive), [...FLAT_ARCHIVES.map((a) => [String(a), `${a}`]), ['other', t('poi.flat.otherArchive', 'Other...')]], (v) => {
      if (v === 'other') { otherIn.style.display = ''; return; }
      otherIn.style.display = 'none'; archive = Number(v); record = null; loadArchive();
    });
    const otherIn = numberInput(archive, (v) => { archive = Math.round(v); record = null; loadArchive(); }, { step: 1, min: 0, max: P.decorArchiveMax });
    otherIn.style.display = 'none';
    const pictureBox = el('div');
    pictureBox.append(field(t('poi.flat.archive', 'Archive'), archSel, otherIn), status, grid, chosen);

    // the item fields: its template number, its name, whether it hangs as a mount or faces the player, and its picture
    const itemInfo = el('div', 'dfpoi-sub');
    const itemPic = el('div');
    async function showItem() {
      const it = itemOfTemplate(itemT);
      itemPic.replaceChildren();
      if (!it) { itemInfo.textContent = t('poi.flat.noItem', 'No item has that number.'); return; }
      const pair = poiFlatPicture({ kind: itemHangs(it) ? 'mount' : 'paperdoll', item: it });
      const hangs = itemHangs(it);
      const none = it.t === P.trophyTemplate ? t('poi.flat.trophyNoBeast', 'a trophy needs its beast, which this editor cannot choose yet') : t('poi.flat.noItemPicture', 'it has no world sprite');
      itemInfo.textContent = `${templateByIndex(itemT)?.name ?? itemT}: ${pair ? (hangs ? t('poi.flat.hangs', 'it hangs flat at its own angle, like mounted weapons and armor') : t('poi.flat.stands', 'it shows as its world sprite and faces the player')) : none}`;
      if (!pair) return;
      const f = await texOf(pair[0]);
      const px = f ? flatPixels(f, pair[1]) : null;
      if (!px || !mine() || mode !== 'item') return;
      const cv = canvasOf(px);
      cv.style.cssText = 'max-width:96px;max-height:96px;image-rendering:pixelated;background:#0003;border-radius:4px';
      itemPic.replaceChildren(cv);
    }
    const itemIn = numberInput(itemT, (v) => { itemT = Math.round(v); showItem(); }, { step: 1, min: 0, max: P.decorTemplateMax });
    const itemBox = el('div');
    itemBox.append(field(t('poi.flat.template', 'Item number'), itemIn), itemInfo, itemPic);
    itemBox.style.display = 'none';

    const modeSel = c.select(mode, [['picture', t('poi.flat.modePicture', 'Game picture')], ['item', t('poi.flat.modeItem', 'Item')]], (v) => {
      mode = v; pictureBox.style.display = v === 'picture' ? '' : 'none'; itemBox.style.display = v === 'item' ? '' : 'none';
      if (v === 'item') showItem();
      showChosen();
    });
    const nameIn = text(name, (v) => { name = v; }, 64);

    const go = btn(change ? t('poi.flat.keep', 'Use this picture') : t('poi.flat.place', 'Place'), () => {
      name = nameIn.value;
      if (mode === 'picture') {
        if (record == null) { c.say(t('poi.flat.needPicture', 'Pick a picture first.'), 'bad'); return; }
        if (change) {
          c.closeDialog();
          c.edit.edit(change.id, 'flat', (x) => { const r = find(x, `flat:${change.key}`)?.row; if (r) { r.flat = [archive, record]; if (isFigureRow(r)) r.scale = 1; } });
          return;
        }
        const light = lit ? decorFlatLight([archive, record]) : null;
        c.closeDialog();
        c.editor.placeFlat({ kind: 'billboard', flat: [archive, record], name, light: lit ? (light ? { color: light.color, radius: light.range, intensity: light.intensity, flicker: true } : { ...DEFAULT_LIGHT }) : null }, name || t('poi.flat.defaultPoi', 'New place'));
      } else {
        const it = itemOfTemplate(itemT);
        const pair = it ? poiFlatPicture({ kind: itemHangs(it) ? 'mount' : 'paperdoll', item: it }) : null;
        if (it?.t === P.trophyTemplate && !pair) { c.say(t('poi.flat.trophyNeedsBeast', 'A trophy needs its beast, which this editor cannot choose yet.'), 'bad'); return; }
        if (!it || !pair) { c.say(t('poi.flat.needItem', 'Choose an item that has a picture.'), 'bad'); return; }
        c.closeDialog();
        // stores the resolved `[archive, record]` alongside the item so every client renders the same sprite
        c.editor.placeFlat({ kind: 'item', item: it, flat: pair, name: name || templateByIndex(itemT)?.name || '', light: lit ? { ...DEFAULT_LIGHT } : null }, name || templateByIndex(itemT)?.name || t('poi.flat.defaultPoi', 'New place'));
      }
      c.say(t('poi.flat.placeHint', 'Click the ground to place it. Press Esc to cancel.'));
    });
    const cancel = btn(t('poi.editor.cancel', 'Cancel'), () => c.closeDialog());
    const acts = el('div', 'dfpoi-row'); acts.append(go, cancel);
    box.append(el('div', 'dfpoi-h', change ? t('poi.flat.titleChange', 'Change picture') : t('poi.flat.title', 'Flat picture')),
      ...(change ? [] : [field(t('poi.flat.what', 'What'), modeSel), field(t('poi.editor.name', 'Name'), nameIn)]),
      pictureBox, itemBox,
      ...(change ? [] : [field(t('poi.flat.lit', 'Gives light'), litBox)]),
      acts);
    c.setDialog(box);
    c.root.append(box);
    showChosen();
    loadArchive();
  }

  /** Builds the inspector fields for a selected flat row `one` (from poiScene.js `find`) in document `d`. */
  function fields(d, sel, one) {
    const row = one.row, id = `flat:${row.key}`;
    const change = (label, fn) => c.edit.edit(sel.id, label, (x) => { const r = find(x, id)?.row; if (r) fn(r, x); });
    const frozen = !!marksOf(d).get(id)?.frozen;
    const out = [el('div', 'dfpoi-h', t('poi.flat.inspector', 'Flat picture'))];
    out.push(field(t('poi.editor.name', 'Name'), text(row.name ?? '', (v) => change('rename', (r) => { const n = String(v).replace(/\s+/g, ' ').trim().slice(0, 64); if (n) r.name = n; else delete r.name; }), 64)));
    out.push(field(t('poi.editor.key', 'Key'), el('span', '', row.key)));
    const kindText = row.kind === 'mount' ? t('poi.flat.kindMount', 'Mounted item: hangs flat at its own angle')
      : row.kind === 'paperdoll' ? t('poi.flat.kindItem', 'Item: shows as its world sprite and faces the player')
        : t('poi.flat.kindBillboard', 'Picture: sits on its base and faces the player');
    out.push(field(t('poi.flat.kind', 'Kind'), el('span', 'dfpoi-grow', kindText)));
    const pair = poiFlatPicture(row);
    const what = row.item ? `${templateByIndex(row.item.t)?.name ?? t('poi.flat.unknownItem', 'Item {t}', { t: row.item.t })}` : '';
    const picText = pair ? t('poi.flat.chosen', 'Archive {a}, record {r}', { a: pair[0], r: pair[1] }) : t('poi.flat.noPicture', 'Missing image');
    out.push(field(t('poi.flat.picture', 'Picture'), el('span', 'dfpoi-grow', what ? `${what} (${picText})` : picText),
      ...(row.kind === 'billboard' && !frozen ? [btn(t('poi.flat.change', 'Change...'), () => openFlat({ change: { id: sel.id, key: row.key } }))] : [])));
    const placed = [];
    placed.push(field(t('poi.editor.offset', 'Offset (m)'), ...row.t.map((v, k) => numberInput(v, (x) => change('move', (r) => { r.t = r.t.map((o, j) => (j === k ? x : o)); }), { step: 0.05, min: -2000, max: 2000 }))));
    if (row.kind === 'mount') {
      placed.push(field(t('poi.flat.mountTurn', 'Heading, tilt, spin'), ...(row.rot ?? [0, 0, 0]).map((v, k) => numberInput(v, (x) => change('turn', (r) => { r.rot = (r.rot ?? [0, 0, 0]).map((o, j) => (j === k ? wrapDeg(x) : o)); }), { step: 5, min: -720, max: 720 }))));
    } else {
      placed.push(field(t('poi.flat.facing', 'Facing (degrees)'), numberInput(row.rot?.[0] ?? 0, (x) => change('turn', (r) => { r.rot = [wrapDeg(x), r.rot?.[1] ?? 0, r.rot?.[2] ?? 0]; }), { step: 15, min: -720, max: 720 })));
      placed.push(field(t('poi.flat.mirrored', 'Mirrored'), check(flatMirrored(row, d.place), (v) => change('turn', (r, x) => { setFlatMirrored(x.place, r, v); }))));
    }
    const sizeIn = numberInput(row.scale ?? 1, (x) => change('size', (r) => { if (!isFigureRow(r)) r.scale = Math.min(P.decorScaleMax, Math.max(P.decorScaleMin, x)); }), { step: 0.05, min: P.decorScaleMin, max: P.decorScaleMax });
    if (isFigureRow(row)) sizeIn.disabled = true;
    placed.push(field(t('poi.editor.scale', 'Scale'), sizeIn));
    if (frozen) { for (const r of placed) for (const i of r.querySelectorAll?.('input') ?? []) i.disabled = true; out.push(el('div', 'dfpoi-sub', t('poi.scene.lockedNote', 'Locked: unlock it in the list to move it.'))); }
    out.push(...placed);
    if (isFigureRow(row)) out.push(el('div', 'dfpoi-sub', t('poi.flat.figureSize', 'A person\'s picture keeps its own size.')));
    // its light
    const l = row.light;
    out.push(field(t('poi.flat.lit', 'Gives light'), check(!!l, (v) => change('light', (r) => { if (v) r.light = { ...DEFAULT_LIGHT, color: [...DEFAULT_LIGHT.color] }; else delete r.light; }))));
    if (l) {
      const colour = el('input');
      colour.type = 'color';
      colour.value = `#${l.color.map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`;
      colour.addEventListener('change', () => change('light', (r) => { const v = colour.value; if (r.light) r.light.color = [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16) / 255); }));
      out.push(field(t('poi.editor.colour', 'Color'), colour));
      out.push(field(t('poi.editor.reach', 'Reach (m)'), numberInput(l.radius, (x) => change('light', (r) => { if (r.light) r.light.radius = x; }), { step: 0.5, min: P.decorLightRangeMin, max: P.decorLightRangeMax })));
      out.push(field(t('poi.editor.strength', 'Strength'), numberInput(l.intensity, (x) => change('light', (r) => { if (r.light) r.light.intensity = x; }), { step: 0.1, min: 0, max: P.decorLightIntensityMax })));
      out.push(field(t('poi.editor.flicker', 'Flickers'), check(l.flicker, (v) => change('light', (r) => { if (r.light) r.light.flicker = v; }))));
    }
    out.push(el('div', 'dfpoi-sub', t('poi.flat.unused', 'In the game, a flat picture sits on its base (a mounted item hangs from its center) and has no collision. Its layer, pivot, and collision settings are saved but not used.')));
    out.push(btn(t('poi.flat.view2d', '2D view...'), () => open2d(sel.id, row.key)));
    return out;
  }

  /**
   * Opens the 2D sprite viewer for flat `key` in POI `id`, drawing the sprite at native pixel resolution over a
   * checkered or solid backdrop for transparent pixels, with zoom, pan, a pixel grid, in-game mirroring or rotation,
   * frame stepping, palette view, and cursor pixel readout.
   */
  async function open2d(id, key) {
    c.dialogsClosed();
    const doc0 = c.edit.docOf(id), row0 = doc0 ? find(doc0, `flat:${key}`)?.row : null;
    const pair = row0 ? poiFlatPicture(row0) : null;
    if (!row0 || !pair) { c.say(t('poi.flat.noPicture', 'Missing image'), 'bad'); return; }
    const box = el('div', 'dfpoi-dialog');
    box.style.width = 'min(760px, calc(100vw - 16px))';
    swallowAll(box);
    const mine = () => c.dialogIs(box);
    const v = { zoom: 4, x: 0, y: 0, grid: true, backdrop: 'checker', asPlaced: true, frame: 0 };
    const cv = /** @type {HTMLCanvasElement} */ (c.doc.createElement('canvas'));
    cv.style.cssText = 'width:100%;height:360px;display:block;background:#101114;border-radius:4px;touch-action:none';
    const pal = /** @type {HTMLCanvasElement} */ (c.doc.createElement('canvas'));
    pal.width = 128; pal.height = 128;
    pal.style.cssText = 'width:128px;height:128px;image-rendering:pixelated;border-radius:4px';
    const info = el('div', 'dfpoi-sub'), readout = el('div', 'dfpoi-sub');
    box.append(el('div', 'dfpoi-h', t('poi.flat.view2dTitle', '2D view: {name}', { name: row0.name || row0.key })));
    c.setDialog(box);
    c.root.append(box);
    const tex = await texOf(pair[0]);
    if (!mine()) return;
    const frames = Math.max(1, tex?.getFrameCount?.(pair[1]) ?? 1);
    let px = tex ? flatPixels(tex, pair[1], 0) : null;
    if (!tex || !px) { box.append(el('div', 'dfpoi-warn', t('poi.flat.noFiles', 'This picture is not in the game files.')), btn(t('poi.editor.close', 'Close'), () => c.closeDialog())); return; }
    const palette = paletteOf(tex);
    let img = canvasOf(px);
    let hover = -1, shown = null;
    const rowNow = () => { const d = c.edit.docOf(id); return d ? { d, r: find(d, `flat:${key}`)?.row ?? null } : { d: null, r: null }; };
    function paintPalette() {
      const g = pal.getContext('2d');
      if (!g) return;
      g.clearRect(0, 0, 128, 128);
      if (!palette) return;
      palette.forEach((p, i) => { g.fillStyle = `rgb(${p[0]},${p[1]},${p[2]})`; g.fillRect((i % 16) * 8, Math.floor(i / 16) * 8, 8, 8); });
      g.strokeStyle = '#fff'; g.lineWidth = 1;
      // palette index 0 is transparent in the game
      g.strokeRect(0.5, 0.5, 7, 7);
      if (hover >= 0) { g.strokeStyle = '#e8c24a'; g.lineWidth = 2; g.strokeRect((hover % 16) * 8 + 1, Math.floor(hover / 16) * 8 + 1, 6, 6); }
    }
    function paint() {
      const W = cv.clientWidth || 720, H = cv.clientHeight || 360, dpr = globalThis.devicePixelRatio || 1;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      const g = cv.getContext('2d');
      if (!g || !px) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#101114'; g.fillRect(0, 0, W, H);
      const { d, r } = rowNow();
      const mirrored = v.asPlaced && !!r && !!d && flatMirrored(r, d.place);
      const spin = v.asPlaced && r?.kind === 'mount' ? ((r.rot?.[2] ?? 0) * Math.PI) / 180 : 0;
      const z = v.zoom, w = px.width * z, h = px.height * z, cx = W / 2 + v.x, cy = H / 2 + v.y, left = cx - w / 2, top = cy - h / 2;
      shown = { left, top, z, mirrored, spin };
      g.save();
      g.translate(cx, cy); if (spin) g.rotate(spin); g.translate(-cx, -cy);
      if (v.backdrop === 'checker') { const k = Math.max(4, z); for (let y = 0; y < h; y += k) for (let x = 0; x < w; x += k) { g.fillStyle = (Math.floor(x / k) + Math.floor(y / k)) % 2 ? '#2a2d37' : '#1f2127'; g.fillRect(left + x, top + y, Math.min(k, w - x), Math.min(k, h - y)); } }
      else { g.fillStyle = { black: '#000', grey: '#808080', white: '#fff' }[v.backdrop] ?? '#000'; g.fillRect(left, top, w, h); }
      g.imageSmoothingEnabled = false;
      if (mirrored) { g.save(); g.translate(left + w, top); g.scale(-1, 1); g.drawImage(img, 0, 0, w, h); g.restore(); } else g.drawImage(img, left, top, w, h);
      if (v.grid && z >= 6) {
        g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1;
        for (let x = 0; x <= px.width; x++) { g.beginPath(); g.moveTo(left + x * z, top); g.lineTo(left + x * z, top + h); g.stroke(); }
        for (let y = 0; y <= px.height; y++) { g.beginPath(); g.moveTo(left, top + y * z); g.lineTo(left + w, top + y * z); g.stroke(); }
      }
      g.strokeStyle = '#ffb347'; g.strokeRect(left, top, w, h);
      // draws the anchor crosshair at the center of the base (or the center of the sprite for a mount)
      const ax = left + w / 2, ay = r?.kind === 'mount' ? top + h / 2 : top + h;
      g.beginPath(); g.moveTo(ax - 10, ay); g.lineTo(ax + 10, ay); g.moveTo(ax, ay - 10); g.lineTo(ax, ay + 10); g.stroke();
      g.restore();
      let m = null;
      try { m = billboardSize(tex, pair[1]); } catch { m = null; }
      const k = r && !isFigureRow(r) ? (r.scale ?? 1) * (d?.place?.s ?? 1) : 1;
      info.textContent = [
        t('poi.flat.meta', 'Archive {a}, record {r}: {w} x {h} pixels', { a: pair[0], r: pair[1], w: px.width, h: px.height }),
        m ? t('poi.flat.metaSize', 'about {w} x {h} m in the game', { w: Math.round(m.w * k * 100) / 100, h: Math.round(m.h * k * 100) / 100 }) : '',
        frames > 1 ? t('poi.flat.metaFrame', 'frame {f} of {n}', { f: v.frame + 1, n: frames }) : '',
        t('poi.flat.metaZoom', 'zoom {z}x', { z: Math.round(z * 10) / 10 }),
        mirrored ? t('poi.flat.metaMirrored', 'mirrored') : '',
      ].filter(Boolean).join(' | ');
      paintPalette();
    }
    /** Returns the unmirrored image pixel coordinates under a client point, or null. */
    function pixelAt(e) {
      if (!shown || !px || shown.spin) return null;
      const b = cv.getBoundingClientRect();
      let x = (e.clientX - b.left - shown.left) / shown.z;
      const y = (e.clientY - b.top - shown.top) / shown.z;
      if (shown.mirrored) x = px.width - x;
      const ix = Math.floor(x), iy = Math.floor(y);
      return ix >= 0 && iy >= 0 && ix < px.width && iy < px.height ? { ix, iy } : null;
    }
    let drag = null;
    cv.addEventListener('wheel', (e) => { e.preventDefault?.(); v.zoom = Math.max(0.5, Math.min(40, v.zoom * (e.deltaY > 0 ? 0.9 : 1.1))); paint(); }, { passive: false });
    cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; try { cv.setPointerCapture(e.pointerId); } catch { /* synthetic pointer event */ } });
    cv.addEventListener('pointerup', () => { drag = null; });
    cv.addEventListener('pointermove', (e) => {
      if (drag) { v.x += e.clientX - drag.x; v.y += e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }; paint(); return; }
      const p = pixelAt(e);
      if (!p || !px) { hover = -1; readout.textContent = ''; paintPalette(); return; }
      const i = px.index[p.iy * px.width + p.ix] ?? 0, o = (p.iy * px.width + p.ix) * 4;
      hover = i;
      readout.textContent = i === 0 ? t('poi.flat.pixelClear', 'Pixel {x}, {y}: transparent', { x: p.ix, y: p.iy })
        : t('poi.flat.pixel', 'Pixel {x}, {y}: palette {i}, rgb {r} {g} {b}', { x: p.ix, y: p.iy, i, r: px.rgba[o], g: px.rgba[o + 1], b: px.rgba[o + 2] });
      paintPalette();
    });
    const zoomBy = (k) => { v.zoom = Math.max(0.5, Math.min(40, v.zoom * k)); paint(); };
    const fit = () => { v.x = 0; v.y = 0; if (px) v.zoom = Math.max(0.5, Math.min(40, Math.floor(Math.min((cv.clientWidth || 720) / px.width, (cv.clientHeight || 360) / px.height) * 0.8))); paint(); };
    const bar = el('div', 'dfpoi-row');
    bar.style.flexWrap = 'wrap';
    const back = c.select(v.backdrop, [['checker', t('poi.flat.backChecker', 'Checkered')], ['black', t('poi.flat.backBlack', 'Black')], ['grey', t('poi.flat.backGrey', 'Gray')], ['white', t('poi.flat.backWhite', 'White')]], (x) => { v.backdrop = x; paint(); });
    const gridBox = check(v.grid, (x) => { v.grid = x; paint(); });
    const placedBox = check(v.asPlaced, (x) => { v.asPlaced = x; paint(); });
    const lab = (text2, ctl) => { const s = el('label', ''); s.append(ctl, ` ${text2}`); return s; };
    bar.append(btn('-', () => zoomBy(1 / 1.25)), btn('+', () => zoomBy(1.25)), btn(t('poi.flat.fit', 'Fit'), fit), back,
      lab(t('poi.flat.grid', 'Pixel grid'), gridBox), lab(t('poi.flat.asPlaced', 'As placed'), placedBox));
    if (row0.kind !== 'mount') bar.append(btn(t('poi.flat.mirror', 'Mirror'), () => { const { d, r } = rowNow(); if (!d || !r || marksOf(d).get(`flat:${key}`)?.frozen) return; c.edit.edit(id, 'turn', (x) => { const q = find(x, `flat:${key}`)?.row; if (q) setFlatMirrored(x.place, q, !flatMirrored(r, d.place)); }); paint(); }));
    if (frames > 1) {
      const step = (k) => { v.frame = (v.frame + k + frames) % frames; px = flatPixels(tex, pair[1], v.frame) ?? px; img = canvasOf(px); paint(); };
      bar.append(btn(t('poi.flat.prevFrame', 'Previous frame'), () => step(-1)), btn(t('poi.flat.nextFrame', 'Next frame'), () => step(1)));
    }
    const body = el('div', 'dfpoi-row');
    body.style.alignItems = 'flex-start';
    const right = el('div', '');
    right.append(el('div', 'dfpoi-sub', t('poi.flat.palette', 'Palette (index 0 is transparent)')), pal);
    const left = el('div', 'dfpoi-grow');
    left.append(cv);
    body.append(left, right);
    box.append(bar, body, info, readout,
      el('div', 'dfpoi-sub', row0.kind === 'mount' ? t('poi.flat.view2dMount', 'Mounted items are shown without their in-game material tint.') : t('poi.flat.view2dNote', 'In the game it turns to face the player.')),
      btn(t('poi.editor.close', 'Close'), () => c.closeDialog()));
    fit();
  }

  /**
   * Returns the asset browser placers (poi/poiAssetPlace.js) for `'billboard'`, `'mount'`, and `'paperdoll'` entries.
   * Drag-and-drop places the flat immediately at the drop point, while the Place button arms placement for the next
   * ground click. Each `place()` call resolves to true once the row is placed, or false if placement is canceled (via
   * Esc, starting another placement, or closing the editor).
   */
  function placers() {
    const itemOf = (a) => (Number.isInteger(a?.template) ? { t: a.template, ...(Number.isInteger(a.group) && a.group >= 0 ? { g: a.group } : {}) } : null);
    const stand = (want, ctx) => new Promise((resolve) => {
      let placed = false;
      const armed = { ...want, onPlaced: () => { placed = true; } };
      c.dialogsClosed();
      c.editor.placeFlat(armed, want.name || t('poi.flat.defaultPoi', 'New place'));
      if (ctx.at && c.editor.standAt?.(ctx.at.x, ctx.at.y) && placed) { resolve(true); return; }
      if (!(ctx.at && c.editor.refusedLast?.())) ctx.say(t('poi.flat.placeHint', 'Click the ground to place it. Press Esc to cancel.'));
      // polls until this placement finishes, either because a ground click placed it or because placement was canceled
      const wait = () => { if (c.editor.active?.() !== false && c.editor.placing?.()?.flat === armed) setTimeout(wait, 100); else resolve(placed); };
      setTimeout(wait, 100);
    });
    const billboard = {
      whyNot: (a) => (!Array.isArray(a?.flat) ? t('poi.flat.noPicture', 'Missing image') : full()),
      place: (a, ctx) => {
        const l = decorFlatLight(a.flat);
        return stand({ kind: 'billboard', flat: [a.flat[0], a.flat[1]], name: a.name ?? '', light: l ? { color: l.color, radius: l.range, intensity: l.intensity, flicker: true } : null }, ctx);
      },
    };
    const item = (kind) => ({
      whyNot: (a) => {
        const it = itemOf(a);
        if (it && poiFlatPicture({ kind, item: it })) return full();
        return it?.t === P.trophyTemplate ? t('poi.flat.trophyNeedsBeast', 'A trophy needs its beast, which this editor cannot choose yet.') : t('poi.flat.itemNoPicture', 'This item has no world sprite.');
      },
      place: (a, ctx) => { const it = itemOf(a); return stand({ kind: 'item', item: it, flat: poiFlatPicture({ kind, item: it }), name: a.name ?? '' }, ctx); },
    });
    return { billboard, mount: item('mount'), paperdoll: item('paperdoll') };
  }

  return { openFlat, fields, open2d, placers };
}
