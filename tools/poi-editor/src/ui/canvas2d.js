// @ts-check

// The 2D canvas: a flat picture or an item picture shown as it stands, on a grid, with zoom and pan.
// It shows the selected flat with its real palette picture over a transparency check, its pivot and a pixel grid.
// Layer, scale and turn are edited in the inspector; this view shows the result.

import { h } from './dom.js';
import { find } from '../scene.js';

/**
 * @param {{ host: HTMLElement, arena: any, getDoc: () => any, getSel: () => string[], catalogue: any }} o
 */
export function createCanvas2d({ host, arena, getDoc, getSel, catalogue }) {
  const canvas = /** @type {HTMLCanvasElement} */ (h('canvas', { style: { width: '100%', height: '100%' } }));
  host.append(canvas);
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const v = { zoom: 4, x: 0, y: 0, grid: true };
  let drag = null;
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); v.zoom = Math.max(0.5, Math.min(40, v.zoom * (e.deltaY > 0 ? 0.9 : 1.1))); draw(); }, { passive: false });
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!drag) return; v.x += e.clientX - drag.x; v.y += e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }; draw(); });
  canvas.addEventListener('pointerup', () => { drag = null; });

  function pairOf(row) {
    if (Array.isArray(row.flat)) return row.flat;
    if (row.item) { const a = catalogue.assets.find((x) => x.namespace === 'paperdoll-item' && x.template === row.item.t); if (a?.worldTexture) { const [ar, re] = a.worldTexture.replace('df-flat:', '').split('.').map(Number); return [ar, re]; } }
    return null;
  }

  async function draw() {
    const W = canvas.clientWidth, H = canvas.clientHeight, dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#101114'; ctx.fillRect(0, 0, W, H);
    const cx = W / 2 + v.x, cy = H / 2 + v.y;
    const doc = getDoc(), sel = getSel();
    const f = doc && sel.length === 1 ? find(doc, sel[0]) : null;
    ctx.fillStyle = '#9aa3b5'; ctx.font = '12px system-ui, sans-serif';
    if (!f || f.kind !== 'flat') { ctx.fillText('Select a flat picture to see it here.', 12, 20); return; }
    const pair = pairOf(f.row);
    const pic = pair ? await arena.picture(pair[0], pair[1]) : null;
    if (!pic) { ctx.fillText(arena.state() === 'loaded' ? 'This picture is not in the game files.' : 'Game files not found, so the picture cannot be drawn.', 12, 20); return; }
    const z = v.zoom, w = pic.width * z, hh = pic.height * z, left = cx - w / 2, top = cy - hh / 2;
    for (let y = 0; y < hh; y += 8) for (let x = 0; x < w; x += 8) { ctx.fillStyle = ((x + y) / 8) % 2 ? '#2a2d37' : '#1f2127'; ctx.fillRect(left + x, top + y, Math.min(8, w - x), Math.min(8, hh - y)); }
    const bmp = await createImageBitmap(new ImageData(new Uint8ClampedArray(pic.data), pic.width, pic.height));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bmp, left, top, w, hh);
    if (v.grid && z >= 6) { ctx.strokeStyle = 'rgba(255,255,255,0.08)'; for (let x = 0; x <= pic.width; x++) { ctx.beginPath(); ctx.moveTo(left + x * z, top); ctx.lineTo(left + x * z, top + hh); ctx.stroke(); } for (let y = 0; y <= pic.height; y++) { ctx.beginPath(); ctx.moveTo(left, top + y * z); ctx.lineTo(left + w, top + y * z); ctx.stroke(); } }
    ctx.strokeStyle = '#ffb347'; ctx.strokeRect(left, top, w, hh);
    const pv = f.row.pivot ?? [0.5, 1];
    ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(left + pv[0] * w, top + pv[1] * hh, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9aa3b5'; ctx.fillText(`${f.row.name}  |  ${pic.width} x ${pic.height} px  |  zoom ${z.toFixed(1)}x  |  layer ${f.row.layer ?? 0}`, 12, 20);
  }
  new ResizeObserver(() => draw()).observe(canvas);
  return { draw };
}
