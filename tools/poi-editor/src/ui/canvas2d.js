// @ts-check

// The 2D canvas: the selected flat picture shown as the game draws it, on a backdrop you choose, with zoom and pan, a
// pixel grid, and the tools that belong to a picture: set its pivot by clicking, mirror it, turn it, send it forward or
// back in the layer stack. Every change is one poiEdit step (one undo). The picture is the game's own palette picture.

import { h, clear } from './dom.js';
import { find } from '../scene.js';
import { isMirrored, setMirrored, turnFlat, pivotAt, setPivot, PIVOT_PRESETS, layerStack, shiftLayer, layerEnd } from '../flat2d.js';

const BACKDROPS = { checker: 'Checker', black: 'Black', grey: 'Grey', white: 'White' };

/**
 * @param {{ host: HTMLElement, arena: any, getDoc: () => any, getSel: () => string[], catalogue: any, edit: any, docId: () => string | null,
 *   select: (ids: string[], how: 'set' | 'add' | 'toggle') => void, changed?: () => void }} o
 */
export function createCanvas2d({ host, arena, getDoc, getSel, catalogue, edit, docId, select, changed = () => {} }) {
  const canvas = /** @type {HTMLCanvasElement} */ (h('canvas', { style: { width: '100%', height: '100%', display: 'block' } }));
  const bar = h('div', { class: 'c2d-bar' });
  const stack = h('div', { class: 'c2d-stack' });
  const area = h('div', { class: 'c2d-area' }, canvas);
  host.append(bar, h('div', { class: 'c2d-body' }, area, stack));
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const v = { zoom: 4, x: 0, y: 0, grid: true, backdrop: 'checker', snap: 'pixel', tool: /** @type {'pan' | 'pivot'} */ ('pan'), asPlaced: true };
  /** @type {{ x: number, y: number } | null} */ let drag = null;
  /** @type {{ x: number, y: number } | null} */ let cursor = null;
  /** The picture on screen right now, for hit tests: where it sits and its size. */
  let shown = /** @type {{ left: number, top: number, z: number, pic: any, id: string, mirrored: boolean } | null} */ (null);
  let readout = '';

  const selected = () => { const d = getDoc(), s = getSel(); return d && s.length === 1 ? find(d, s[0]) : null; };
  const run = (label, fn) => { const id = docId(); if (!id) return; edit.edit(id, label, fn); changed(); };

  function pairOf(row) {
    if (Array.isArray(row.flat)) return row.flat;
    if (row.item) { const a = catalogue.assets.find((x) => x.namespace === 'paperdoll-item' && x.template === row.item.t); if (a?.worldTexture) { const [ar, re] = a.worldTexture.replace('df-flat:', '').split('.').map(Number); return [ar, re]; } }
    return null;
  }

  // ── view input ──
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); v.zoom = Math.max(0.5, Math.min(40, v.zoom * (e.deltaY > 0 ? 0.9 : 1.1))); paint(); }, { passive: false });
  canvas.addEventListener('pointerdown', (e) => {
    if (v.tool === 'pivot' && e.button === 0 && !e.shiftKey && shown) { pickPivot(e); return; }
    drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect(); cursor = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (drag) { v.x += e.clientX - drag.x; v.y += e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }; }
    else if (v.tool === 'pivot' && e.buttons === 1 && shown) pickPivot(e);
    paint();
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('pointerleave', () => { cursor = null; paint(); });

  /** The picture pixel under a screen point (picture pixels from the top-left, as the picture stands unmirrored), or null. */
  function pixelAt(sx, sy) {
    if (!shown) return null;
    let px = (sx - shown.left) / shown.z; const py = (sy - shown.top) / shown.z;
    if (shown.mirrored) px = shown.pic.width - px;
    return { x: px, y: py };
  }
  function pickPivot(e) {
    const r = canvas.getBoundingClientRect();
    const p = pixelAt(e.clientX - r.left, e.clientY - r.top), f = selected();
    if (!p || !f || !shown || f.kind !== 'flat') return;
    const pv = pivotAt(shown.pic, p.x, p.y, v.snap);
    const cur = f.row.pivot ?? [0.5, 1];
    if (pv[0] === cur[0] && pv[1] === cur[1]) return;
    run('set pivot', (d) => { const g = find(d, shown?.id ?? ''); if (g) setPivot(g.row, pv); });
  }

  // ── tool bar ──
  function renderBar() {
    clear(bar);
    const f = selected(), flat = f?.kind === 'flat' ? f : null;
    const btn = (text, on, title, click, off = false) => h('button', { class: on ? 'on' : '', text, title, disabled: off, on: { click } });
    const mount = flat?.row.kind === 'mount';
    bar.append(
      btn('Pan', v.tool === 'pan', 'Drag to pan', () => { v.tool = 'pan'; renderBar(); }),
      btn('Pivot', v.tool === 'pivot', 'Click the picture to put its pivot there (shift-drag pans)', () => { v.tool = 'pivot'; renderBar(); }, !flat),
      h('select', { title: 'Pivot snapping', on: { change: (e) => { v.snap = e.target.value; } } }, ...[['pixel', 'Snap: pixel'], ['quarter', 'Snap: quarters'], ['centre', 'Snap: edges and middle'], ['off', 'Snap: off']].map(([k, t]) => h('option', { value: k, text: t, selected: v.snap === k }))),
      h('select', { title: 'Pivot presets', disabled: !flat, on: { change: (e) => { const k = e.target.value; e.target.value = ''; const pv = PIVOT_PRESETS[k]; if (pv) run('set pivot', (d) => { const g = find(d, getSel()[0]); if (g) setPivot(g.row, [...pv]); }); } } }, h('option', { value: '', text: 'Pivot preset...' }), ...Object.keys(PIVOT_PRESETS).map((k) => h('option', { value: k, text: k }))),
      h('span', { class: 'sep' }),
      btn(mount ? 'Mirror (not for mounts)' : 'Mirror', !!flat && isMirrored(flat.row, pairOf(flat.row)), 'Face the other way', () => run('mirror', (d) => { const g = find(d, getSel()[0]); if (g) setMirrored(g.row, !isMirrored(g.row, pairOf(g.row))); }), !flat || mount),
      btn(mount ? 'Spin -15' : 'Turn -15', false, mount ? 'Spin on the wall' : 'Turn about up', () => run('turn', (d) => { const g = find(d, getSel()[0]); if (g) turnFlat(g.row, -15); }), !flat),
      btn(mount ? 'Spin +15' : 'Turn +15', false, mount ? 'Spin on the wall' : 'Turn about up', () => run('turn', (d) => { const g = find(d, getSel()[0]); if (g) turnFlat(g.row, 15); }), !flat),
      btn('Turn 90', false, '', () => run('turn', (d) => { const g = find(d, getSel()[0]); if (g) turnFlat(g.row, 90); }), !flat),
      h('span', { class: 'sep' }),
      btn('Back', false, 'One step back in the layer stack', () => layer((d, id) => shiftLayer(d, id, -1), 'layer back'), !flat),
      btn('Forward', false, 'One step forward in the layer stack', () => layer((d, id) => shiftLayer(d, id, 1), 'layer forward'), !flat),
      btn('To back', false, '', () => layer((d, id) => layerEnd(d, id, false), 'layer to back'), !flat),
      btn('To front', false, '', () => layer((d, id) => layerEnd(d, id, true), 'layer to front'), !flat),
      h('span', { class: 'sep' }),
      h('select', { title: 'Backdrop', on: { change: (e) => { v.backdrop = e.target.value; paint(); } } }, ...Object.entries(BACKDROPS).map(([k, t]) => h('option', { value: k, text: t, selected: v.backdrop === k }))),
      h('label', { title: 'Show the picture as placed: mirrored or spun' }, h('input', { type: 'checkbox', checked: v.asPlaced, on: { change: (e) => { v.asPlaced = e.target.checked; paint(); } } }), ' As placed'),
      h('label', null, h('input', { type: 'checkbox', checked: v.grid, on: { change: (e) => { v.grid = e.target.checked; paint(); } } }), ' Pixels'),
      btn('Fit', false, 'Fit the picture to the view', () => { v.x = 0; v.y = 0; if (shown) v.zoom = Math.max(0.5, Math.min(40, Math.floor(Math.min(canvas.clientWidth / shown.pic.width, canvas.clientHeight / shown.pic.height) * 0.8))); paint(); }, !flat),
    );
  }
  function layer(fn, label) { const id = getSel()[0]; run(label, (d) => { fn(d, id); }); }

  function renderStack() {
    clear(stack);
    const d = getDoc();
    if (!d) return;
    const rows = layerStack(d).reverse();   // front first, as a layer list reads
    stack.append(h('div', { class: 'c2d-title', text: 'Layers (front first)' }));
    if (!rows.length) stack.append(h('div', { class: 'c2d-empty', text: 'No flat pictures yet.' }));
    for (const r of rows) stack.append(h('button', { class: `c2d-row ${getSel().includes(r.id) ? 'on' : ''}`, title: r.name, on: { click: () => select([r.id], 'set') } }, h('span', { text: String(r.layer), class: 'n' }), ` ${r.name}`));
  }

  function backdrop(left, top, w, hh) {
    if (v.backdrop === 'checker') { for (let y = 0; y < hh; y += 8) for (let x = 0; x < w; x += 8) { ctx.fillStyle = ((x + y) / 8) % 2 ? '#2a2d37' : '#1f2127'; ctx.fillRect(left + x, top + y, Math.min(8, w - x), Math.min(8, hh - y)); } return; }
    ctx.fillStyle = { black: '#000', grey: '#808080', white: '#fff' }[v.backdrop] ?? '#000'; ctx.fillRect(left, top, w, hh);
  }

  const draw = () => { renderBar(); renderStack(); return paint(); };
  async function paint() {
    const W = canvas.clientWidth, H = canvas.clientHeight, dpr = window.devicePixelRatio || 1;
    if (!W || !H) return;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#101114'; ctx.fillRect(0, 0, W, H);
    shown = null;
    const cx = W / 2 + v.x, cy = H / 2 + v.y;
    const f = selected();
    ctx.fillStyle = '#9aa3b5'; ctx.font = '12px system-ui, sans-serif'; ctx.textBaseline = 'alphabetic';
    if (!f || f.kind !== 'flat') { ctx.fillText('Select a flat picture to see it here.', 12, 20); return; }
    const pair = pairOf(f.row);
    const pic = pair ? await arena.picture(pair[0], pair[1]) : null;
    if (!pic) { ctx.fillText(arena.state() === 'loaded' ? 'This picture is not in the game files.' : 'Game files not found, so the picture cannot be drawn.', 12, 20); return; }
    const z = v.zoom, w = pic.width * z, hh = pic.height * z, left = cx - w / 2, top = cy - hh / 2;
    const mirrored = v.asPlaced && isMirrored(f.row, pair);
    const spin = v.asPlaced && f.row.kind === 'mount' ? ((f.row.rot?.[2] ?? 0) * Math.PI) / 180 : 0;
    shown = { left, top, z, pic, id: `flat:${f.row.key}`, mirrored };
    const bmp = await createImageBitmap(new ImageData(new Uint8ClampedArray(pic.data), pic.width, pic.height));
    ctx.save();
    ctx.translate(cx, cy); if (spin) ctx.rotate(spin); ctx.translate(-cx, -cy);
    backdrop(left, top, w, hh);
    ctx.imageSmoothingEnabled = false;
    if (mirrored) { ctx.save(); ctx.translate(left + w, top); ctx.scale(-1, 1); ctx.drawImage(bmp, 0, 0, w, hh); ctx.restore(); } else ctx.drawImage(bmp, left, top, w, hh);
    if (v.grid && z >= 6) { ctx.strokeStyle = 'rgba(255,255,255,0.08)'; for (let x = 0; x <= pic.width; x++) { ctx.beginPath(); ctx.moveTo(left + x * z, top); ctx.lineTo(left + x * z, top + hh); ctx.stroke(); } for (let y = 0; y <= pic.height; y++) { ctx.beginPath(); ctx.moveTo(left, top + y * z); ctx.lineTo(left + w, top + y * z); ctx.stroke(); } }
    ctx.strokeStyle = '#ffb347'; ctx.strokeRect(left, top, w, hh);
    // the pivot is a fraction of the picture as stored; a mirrored picture shows it mirrored too
    const pv = f.row.pivot ?? [0.5, 1], px = mirrored ? 1 - pv[0] : pv[0];
    const ax = left + px * w, ay = top + pv[1] * hh;
    ctx.strokeStyle = '#ffb347'; ctx.beginPath(); ctx.moveTo(ax - 10, ay); ctx.lineTo(ax + 10, ay); ctx.moveTo(ax, ay - 10); ctx.lineTo(ax, ay + 10); ctx.stroke();
    ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(ax, ay, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // the pixel under the pointer: where it is and the colour the game draws there
    readout = '';
    if (cursor) {
      const p = cursor ? pixelAt(cursor.x, cursor.y) : null;
      if (p && p.x >= 0 && p.y >= 0 && p.x < pic.width && p.y < pic.height && !spin) {
        const ix = Math.floor(p.x), iy = Math.floor(p.y), o = (iy * pic.width + ix) * 4, d = pic.data;
        readout = `  |  pixel ${ix}, ${iy}  ${d[o + 3] === 0 ? 'clear' : `rgb ${d[o]} ${d[o + 1]} ${d[o + 2]}${d[o + 3] < 255 ? ` a ${d[o + 3]}` : ''}`}`;
      }
    }
    ctx.fillStyle = '#9aa3b5';
    ctx.fillText(`${f.row.name}  |  ${pic.width} x ${pic.height} px  |  zoom ${z.toFixed(1)}x  |  layer ${f.row.layer ?? 0}  |  pivot ${pv[0]}, ${pv[1]}${mirrored ? '  |  mirrored' : ''}${readout}`, 12, 20);
  }
  new ResizeObserver(() => paint()).observe(canvas);
  return { draw, state: v };
}
