// @ts-check
// BUNNYFALL (2026-11-18, the living territory map): THE COMPANIES' LAND, THE BLIGHT AND THE MARCHES, REWORKED.
//
// Asked: the old map "is confusing, flat and useless": influence was a big circle (over the sea and over ground nobody can
// reach), the march arrows were static, nothing moved. So:
//
//   - INFLUENCE IS LAND. Each territory still has the law's radius (net/territoryLaw.js) but is only ever laid on LAND: the
//     pixels nearer to it than to a stronger rival, clipped to the coast. Neighbours share a border instead of overlapping
//     into soup. The wash is soft (strong near the hall, fading to the rim); the border is a real line that follows the
//     land and breathes. Mine is gold-lit with marching dashes. The sea is never washed.
//   - THE BLIGHT MOVES. Drifting miasma through the purple, a creeping edge, and where a territory holds it the front is a
//     glowing red line with embers running along it. All of it clipped to land.
//   - THE MARCHES MARCH. Each garrison's route is a curved road with arrows streaming along it from the town to the front,
//     more of them the more soldiers march, and a ripple where they strike.
//   - THE LAND ANSWERS. Hover a territory and it names its Company and reach; hover the blight and it says so.
//
// Two halves, like the rest of the sheet (AUDIT-MAP): `paintInfluenceFill` goes on the KEPT layer under the marks (rebuilt
// only when the territories change or the view moves); `paintLive` is the overlay's, run at a modest rate while any of it
// stands. `buildInfluence` is pure data in, arrays out (canvases only through `makeCanvas`).
import { linkSegments, inkChain } from './inkMap.js';
import { blightDepth } from '../net/blightLaw.js';
import { territoryReachText } from '../net/territoryLaw.js';
import { t } from './textManager.js';

/** The raster is laid at this many pixels per map pixel: a soft edge that does not stair-step when zoomed. */
export const INFLUENCE_SS = 2;
/** The blight's colour (Cromwark's purple) and its front's ink - the same as before, so the legend still matches. */
export const BLIGHT_CSS = '#9b4dff';
export const BLIGHT_FRONT_CSS = '#d3281c';
/** How often the live half repaints while it has something to move (Hz). */
export const LIVE_HZ = 16;

const INK = 'rgb(46, 32, 18)';
const PARCHMENT_HALO = 'rgba(238, 222, 190, 0.88)';
const GOLD = '#f3c969';
const TAU = Math.PI * 2;
const smooth = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
const rgbOf = (css) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(css ?? '').trim());
  if (!m) return [138, 138, 138];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const defaultCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const paperOf = (view, x, y) => [(x - view.ox) * view.scale, (y - view.oy) * view.scale];

/**
 * @typedef {{ x: number, y: number, r: number, fill: string, ring: string, tag?: string, name?: string, strength?: number, mine?: boolean }} TerritoryMark
 * @typedef {{ x: number, y: number, r: number, name: string, mine?: boolean }} CharterMark
 */

/**
 * Lay every territory on the land. Pure but for the two canvases it returns.
 * @param {{ width: number, height: number, isLand: (x: number, y: number) => boolean, marks: TerritoryMark[], charters?: CharterMark[],
 *           makeCanvas?: (w: number, h: number) => any }} a
 */
export function buildInfluence({ width, height, isLand, marks, charters = [], makeCanvas = defaultCanvas }) {
  const S = INFLUENCE_SS, W = width * S, H = height * S;
  // land at one pixel per map pixel, then smoothed up (bilinear) for the clip and the fade at the coast
  const land = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) land[y * width + x] = isLand(x, y) ? 1 : 0;
  const landAt = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : land[y * width + x]);
  const landSmooth = (px, py) => {
    const fx = (px + 0.5) / S - 0.5, fy = (py + 0.5) / S - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const a = landAt(x0, y0) * (1 - tx) + landAt(x0 + 1, y0) * tx;
    const b = landAt(x0, y0 + 1) * (1 - tx) + landAt(x0 + 1, y0 + 1) * tx;
    return smooth(0.3, 0.7, a * (1 - ty) + b * ty);
  };

  // who holds each supersampled pixel: the territory it lies deepest inside (radius minus distance - a bigger
  // patch holds against a nearer small one, and a pixel past every radius is nobody's)
  const score = new Float32Array(W * H);
  const owner = new Int16Array(W * H).fill(-1);
  marks.forEach((m, i) => {
    const x0 = Math.max(0, Math.floor((m.x - m.r - 1) * S)), x1 = Math.min(W - 1, Math.ceil((m.x + m.r + 1) * S));
    const y0 = Math.max(0, Math.floor((m.y - m.r - 1) * S)), y1 = Math.min(H - 1, Math.ceil((m.y + m.r + 1) * S));
    for (let py = y0; py <= y1; py++) {
      const dy = (py + 0.5) / S - m.y;
      for (let px = x0; px <= x1; px++) {
        const dx = (px + 0.5) / S - m.x;
        const s = m.r - Math.hypot(dx, dy);
        if (s > 0 && s > score[py * W + px]) { score[py * W + px] = s; owner[py * W + px] = i; }
      }
    }
  });

  // the wash and the coast clip: one RGBA bitmap each
  const fill = makeCanvas(W, H), mask = makeCanvas(W, H);
  const fctx = fill.getContext('2d'), mctx = mask.getContext('2d');
  const fimg = fctx.createImageData(W, H), mimg = mctx.createImageData(W, H);
  const rgbs = marks.map((m) => rgbOf(m.fill));
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const k = py * W + px, lm = landSmooth(px, py);
      mimg.data[k * 4] = mimg.data[k * 4 + 1] = mimg.data[k * 4 + 2] = 255;
      mimg.data[k * 4 + 3] = Math.round(lm * 255);
      const o = owner[k];
      if (o < 0 || lm <= 0) continue;
      const m = marks[o], depth = score[k] / m.r;
      // strong at the hall, thinning to the rim; the rim itself is the border line's
      const a = (0.1 + 0.3 * smooth(0, 0.85, depth)) * (m.mine ? 1.2 : 1) * lm;
      const c = rgbs[o];
      fimg.data[k * 4] = c[0]; fimg.data[k * 4 + 1] = c[1]; fimg.data[k * 4 + 2] = c[2];
      fimg.data[k * 4 + 3] = Math.round(Math.min(1, a) * 255);
    }
  }
  fctx.putImageData(fimg, 0, 0);
  mctx.putImageData(mimg, 0, 0);

  // the borders: the edge of each patch where it meets LAND it does not hold (the coast is inked already)
  const ownerAt1 = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? -1 : owner[(y * S + 1) * W + (x * S + 1)]);
  const chainsOf = (inside, bx0, by0, bx1, by1) => {
    const segs = [];
    const edge = (x, y) => landAt(x, y) === 1 && !inside(x, y);
    for (let y = by0; y <= by1; y++) {
      for (let x = bx0; x <= bx1; x++) {
        if (!inside(x, y)) continue;
        if (edge(x + 1, y)) segs.push([x + 1, y, x + 1, y + 1]);
        if (edge(x - 1, y)) segs.push([x, y, x, y + 1]);
        if (edge(x, y + 1)) segs.push([x, y + 1, x + 1, y + 1]);
        if (edge(x, y - 1)) segs.push([x, y, x + 1, y]);
      }
    }
    return linkSegments(segs).map((c) => inkChain(c, 0.7));
  };
  const owners = marks.map((m, i) => {
    const x0 = Math.max(0, Math.floor(m.x - m.r - 1)), x1 = Math.min(width - 1, Math.ceil(m.x + m.r + 1));
    const y0 = Math.max(0, Math.floor(m.y - m.r - 1)), y1 = Math.min(height - 1, Math.ceil(m.y + m.r + 1));
    return { mark: m, chains: chainsOf((x, y) => landAt(x, y) === 1 && ownerAt1(x, y) === i, x0, y0, x1, y1) };
  });
  const charterRings = charters.map((c) => {
    const x0 = Math.max(0, Math.floor(c.x - c.r - 1)), x1 = Math.min(width - 1, Math.ceil(c.x + c.r + 1));
    const y0 = Math.max(0, Math.floor(c.y - c.r - 1)), y1 = Math.min(height - 1, Math.ceil(c.y + c.r + 1));
    return { charter: c, chains: chainsOf((x, y) => landAt(x, y) === 1 && Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) <= c.r, x0, y0, x1, y1) };
  });
  return { width, height, fill, mask, owners, charterRings, marks, charters, ownerAt: (x, y) => { const o = ownerAt1(Math.floor(x), Math.floor(y)); return o >= 0 ? marks[o] : null; } };
}

/** Draw a map-sized bitmap (laid at INFLUENCE_SS) onto the paper under `view`, only the part that shows. */
function drawMapImage(ctx, img, view, { paperW, paperH, width, height }) {
  const S = INFLUENCE_SS;
  const mx0 = Math.max(0, view.ox), my0 = Math.max(0, view.oy);
  const mx1 = Math.min(width, view.ox + paperW / view.scale), my1 = Math.min(height, view.oy + paperH / view.scale);
  if (mx1 <= mx0 || my1 <= my0) return;
  const [dx, dy] = paperOf(view, mx0, my0);
  ctx.drawImage(img, mx0 * S, my0 * S, (mx1 - mx0) * S, (my1 - my0) * S, dx, dy, (mx1 - mx0) * view.scale, (my1 - my0) * view.scale);
}

/** THE KEPT LAYER'S HALF: the soft wash of every territory, on land only, under the marks. */
export function paintInfluenceFill(ctx, view, infl, { paperW, paperH }) {
  if (!infl || !view) return;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  drawMapImage(ctx, infl.fill, view, { paperW, paperH, width: infl.width, height: infl.height });
  ctx.restore();
}

// ═══ the live half ═══════════════════════════════════════════════════════════════════════════════════════════════════

/** A tileable swirl of miasma, made once: sums of whole-number sine waves, so it repeats without a seam. */
function makeNoise(makeCanvas) {
  const N = 128, c = makeCanvas(N, N), x = c.getContext('2d'), img = x.createImageData(N, N);
  const waves = [[1, 2, 0.4, 1], [3, 1, 2.1, 0.8], [2, 4, 4.4, 0.7], [5, 3, 1.3, 0.5], [4, 6, 5.2, 0.4]];
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      let v = 0, w = 0;
      for (const [fx, fy, ph, a] of waves) { v += a * Math.sin(TAU * ((fx * px + fy * py) / N) + ph); w += a; }
      const n = smooth(-0.15, 0.85, v / w * 0.5 + 0.5);
      const k = (py * N + px) * 4;
      img.data[k] = 168; img.data[k + 1] = 96; img.data[k + 2] = 255; img.data[k + 3] = Math.round(n * 255);
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

/** The layer the blight is composed on before the coast clips it. Made lazily by the host's window, one per sheet. */
export function createLiveLayer(makeCanvas = defaultCanvas) {
  return { makeCanvas, canvas: null, noise: null };
}

/** The smooth closed outline of the blight's edge as a path on `c`. */
function blightOutline(c, view, shape) {
  const n = shape.edge.length, step = TAU / n;
  const pts = shape.edge.map((e, i) => paperOf(view, shape.centre.x + Math.cos((i + 0.5) * step) * e.r, shape.centre.y + Math.sin((i + 0.5) * step) * e.r));
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  c.beginPath();
  const m0 = mid(pts[n - 1], pts[0]);
  c.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) { const m = mid(pts[i], pts[(i + 1) % n]); c.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
  c.closePath();
  return pts;
}

function paintBlightLive(ctx, view, shape, infl, layer, { paperW, paperH, dpr, time }) {
  const n = shape.edge.length, step = TAU / n;
  const [cx, cy] = paperOf(view, shape.centre.x, shape.centre.y);
  const reach = Math.max(...shape.edge.map((e) => e.r)) * view.scale;
  if (cx + reach < 0 || cy + reach < 0 || cx - reach > paperW || cy - reach > paperH) return;
  const cv = layer.canvas && layer.canvas.width === Math.round(paperW * dpr) && layer.canvas.height === Math.round(paperH * dpr)
    ? layer.canvas : (layer.canvas = layer.makeCanvas(Math.round(paperW * dpr), Math.round(paperH * dpr)));
  const c = cv.getContext('2d');
  layer.noise ??= makeNoise(layer.makeCanvas);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, cv.width, cv.height);
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  // the body: a wash, with two slow clouds drifting through it in opposite directions
  blightOutline(c, view, shape);
  c.globalAlpha = 0.2; c.fillStyle = BLIGHT_CSS; c.fill();
  c.save();
  blightOutline(c, view, shape); c.clip();
  const pat = c.createPattern(layer.noise, 'repeat');
  if (pat) {
    const px = -view.ox * view.scale, py = -view.oy * view.scale;
    for (const [alpha, sc, vx, vy] of [[0.3, 2.6, 7, 3], [0.22, 1.5, -5, 6]]) {
      pat.setTransform?.(new globalThis.DOMMatrix().translate(px + time * vx, py + time * vy).scale(sc));
      c.globalAlpha = alpha * (0.85 + 0.15 * Math.sin(time * 0.9 + sc));
      c.fillStyle = pat;
      c.fillRect(0, 0, paperW, paperH);
    }
  }
  c.restore();
  // the rim: a creeping dashed edge, and a held slice's front on top of it
  c.globalAlpha = 0.9; c.strokeStyle = BLIGHT_CSS; c.lineWidth = 1.8;
  c.setLineDash([7, 6]); c.lineDashOffset = -time * 9;
  blightOutline(c, view, shape); c.stroke();
  c.setLineDash([]);
  c.lineCap = 'round';
  const pulse = 0.5 + 0.5 * Math.sin(time * 3.2);
  shape.edge.forEach((e, i) => {
    if (!e.held) return;
    const r = e.r * view.scale, a0 = i * step + step * 0.06, a1 = (i + 1) * step - step * 0.06;
    c.shadowColor = BLIGHT_FRONT_CSS; c.shadowBlur = 7 + 6 * pulse;
    c.globalAlpha = 0.95; c.strokeStyle = BLIGHT_FRONT_CSS; c.lineWidth = 2.6 + pulse * 1.2;
    c.beginPath(); c.arc(cx, cy, r, a0, a1); c.stroke();
    c.shadowBlur = 0;
    // embers running along the front
    for (let k = 0; k < 3; k++) {
      const u = (time * 0.32 + k / 3 + i * 0.13) % 1, a = a0 + (a1 - a0) * u;
      c.globalAlpha = 0.9 * Math.sin(u * Math.PI); c.fillStyle = '#ffd37a';
      c.beginPath(); c.arc(cx + Math.cos(a) * (r + Math.sin(time * 5 + k) * 1.2), cy + Math.sin(a) * (r + Math.sin(time * 5 + k) * 1.2), 1.8, 0, TAU); c.fill();
    }
  });
  c.globalAlpha = 1;
  // only land is ever blighted
  if (infl?.mask) {
    c.globalCompositeOperation = 'destination-in';
    c.imageSmoothingEnabled = true;
    drawMapImage(c, infl.mask, view, { paperW, paperH, width: infl.width, height: infl.height });
    c.globalCompositeOperation = 'source-over';
  }
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.drawImage(cv, 0, 0, paperW, paperH);
  ctx.restore();
}

function strokeChains(ctx, view, chains) {
  ctx.beginPath();
  for (const ch of chains) {
    ch.forEach((p, i) => { const [x, y] = paperOf(view, p.x, p.y); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  }
  ctx.stroke();
}

function paintBorders(ctx, view, infl, { paperW, paperH, far, time }) {
  const onPaper = (m) => { const [x, y] = paperOf(view, m.x, m.y), r = m.r * view.scale; return !(x + r < 0 || y + r < 0 || x - r > paperW || y - r > paperH); };
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // the Charters: a long dashed pen line, crawling slowly, with its name past the far band
  for (const { charter: c, chains } of infl.charterRings) {
    if (!onPaper(c) || !chains.length) continue;
    ctx.setLineDash([9, 6]); ctx.lineDashOffset = -time * 5;
    ctx.globalAlpha = 0.9; ctx.strokeStyle = INK; ctx.lineWidth = c.mine ? 2.6 : 2;
    strokeChains(ctx, view, chains);
    ctx.setLineDash([]);
  }
  const pulse = 0.5 + 0.5 * Math.sin(time * 2.2);
  for (const { mark: m, chains } of infl.owners) {
    if (!onPaper(m) || !chains.length) continue;
    // a dark under-line so a pale colour still reads on parchment, a soft breathing glow, then the colour
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.34; ctx.strokeStyle = INK; ctx.lineWidth = (m.mine ? 4.2 : 3.4);
    strokeChains(ctx, view, chains);
    ctx.globalAlpha = (m.mine ? 0.26 : 0.14) + 0.12 * pulse; ctx.strokeStyle = m.mine ? GOLD : m.ring; ctx.lineWidth = m.mine ? 8 : 6;
    strokeChains(ctx, view, chains);
    ctx.globalAlpha = 0.97; ctx.strokeStyle = m.ring; ctx.lineWidth = m.mine ? 2.6 : 1.7;
    if (m.mine) { ctx.setLineDash([11, 6]); ctx.lineDashOffset = -time * 16; }
    strokeChains(ctx, view, chains);
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = 1;
  // each hall: a pip in the Company's arms, a ring that swells for mine, the tag over it past the far band
  for (const { mark: m } of infl.owners) {
    const [x, y] = paperOf(view, m.x, m.y);
    if (x < -40 || y < -30 || x > paperW + 40 || y > paperH + 30) continue;
    const pr = Math.max(3.5, Math.min(6.5, view.scale * 0.9));
    if (m.mine) {
      const sw = (time * 0.7) % 1;
      ctx.globalAlpha = 0.6 * (1 - sw); ctx.strokeStyle = GOLD; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, pr + 3 + sw * 14, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = m.fill; ctx.strokeStyle = m.ring; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, pr, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, pr + 1.2, 0, TAU); ctx.stroke();
  }
  if (far) return;
  ctx.textAlign = 'center';
  ctx.font = "600 13px 'Cormorant', Georgia, serif";
  ctx.textBaseline = 'bottom';
  for (const { mark: m } of infl.owners) {
    if (!m.tag) continue;
    const [x, y] = paperOf(view, m.x, m.y);
    if (x < -60 || y < -20 || x > paperW + 60 || y > paperH + 20) continue;
    const ty = y - Math.max(3.5, Math.min(6.5, view.scale * 0.9)) - 5;
    ctx.lineWidth = 3; ctx.strokeStyle = PARCHMENT_HALO; ctx.strokeText(`<${m.tag}>`, x, ty);
    ctx.fillStyle = INK; ctx.fillText(`<${m.tag}>`, x, ty);
  }
  ctx.font = "italic 700 14px 'Cormorant', Georgia, serif";
  ctx.textBaseline = 'top';
  for (const { charter: c } of infl.charterRings) {
    const [x, y] = paperOf(view, c.x, c.y), r = c.r * view.scale;
    if (x < -120 || y < -40 || x > paperW + 120 || y > paperH + 40) continue;
    ctx.lineWidth = 3; ctx.strokeStyle = PARCHMENT_HALO; ctx.strokeText(c.name, x, y + r + 3);
    ctx.fillStyle = INK; ctx.fillText(c.name, x, y + r + 3);
  }
}

/** A point on the quadratic curve p0 -> p1 bowed by `bow` (perpendicular), at u, and its heading. */
function arcAt(p0, p1, bow, u) {
  const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2, dx = p1[0] - p0[0], dy = p1[1] - p0[1];
  const cx = mx - dy * bow, cy = my + dx * bow, v = 1 - u;
  const x = v * v * p0[0] + 2 * v * u * cx + u * u * p1[0], y = v * v * p0[1] + 2 * v * u * cy + u * u * p1[1];
  const tx = 2 * v * (cx - p0[0]) + 2 * u * (p1[0] - cx), ty = 2 * v * (cy - p0[1]) + 2 * u * (p1[1] - cy);
  return { x, y, a: Math.atan2(ty, tx), cx, cy };
}

function paintMarchesLive(ctx, view, arrows, { paperW, paperH, time }) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  arrows.forEach((a, k) => {
    const p0 = paperOf(view, a.x0, a.y0), p1 = paperOf(view, a.x1, a.y1);
    if (Math.max(p0[0], p1[0]) < 0 || Math.max(p0[1], p1[1]) < 0 || Math.min(p0[0], p1[0]) > paperW || Math.min(p0[1], p1[1]) > paperH) return;
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    if (len < 6) return;
    const bow = (k % 2 ? -1 : 1) * 0.16, w = 1.6 + Math.min(2.6, a.n / 12);
    const fill = a.fill ?? '#d9b45a', ring = a.ring ?? '#1b0f08';
    const mid = arcAt(p0, p1, bow, 0.5);
    // the road: a dark bed and a faint line in the owner's colour
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.quadraticCurveTo(mid.cx, mid.cy, p1[0], p1[1]);
    ctx.globalAlpha = 0.38; ctx.strokeStyle = '#1b0f08'; ctx.lineWidth = w + 2.4; ctx.stroke();
    ctx.globalAlpha = 0.55; ctx.strokeStyle = fill; ctx.lineWidth = w; ctx.setLineDash([2, w * 3]); ctx.lineDashOffset = -time * 14; ctx.stroke();
    ctx.setLineDash([]);
    // the column: arrows streaming from the town to the front, more of them for more soldiers
    const count = Math.max(2, Math.min(7, 2 + Math.floor(a.n / 12)));
    const size = 4.2 + w * 1.5;
    for (let i = 0; i < count; i++) {
      const u = (time * 0.2 + i / count) % 1, q = arcAt(p0, p1, bow, u);
      const fade = Math.min(1, u * 8) * Math.min(1, (1 - u) * 8);
      // a short tail behind each one
      const tail = arcAt(p0, p1, bow, Math.max(0, u - 0.07));
      ctx.globalAlpha = 0.5 * fade; ctx.strokeStyle = fill; ctx.lineWidth = w * 1.5;
      ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      ctx.save();
      ctx.translate(q.x, q.y); ctx.rotate(q.a);
      ctx.globalAlpha = 0.98 * fade; ctx.fillStyle = fill; ctx.strokeStyle = ring; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(-size * 0.7, -size * 0.62); ctx.lineTo(-size * 0.25, 0); ctx.lineTo(-size * 0.7, size * 0.62); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // the strike: a ripple spreading where the column meets the front
    for (let i = 0; i < 2; i++) {
      const r = ((time * 0.8 + i * 0.5) % 1);
      ctx.globalAlpha = 0.7 * (1 - r); ctx.strokeStyle = fill; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(p1[0], p1[1], 3 + r * (9 + w * 2), 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
}

/**
 * THE OVERLAY'S HALF: borders and halls, the blight and its front, the marches - all moving with `time` (seconds).
 * Painted under the marks the overlay draws (party, rings, flags).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ ox: number, oy: number, scale: number }} view
 * @param {{ infl: any, blight: any, marches: any[], layer: any }} state
 * @param {{ paperW: number, paperH: number, dpr: number, time: number, far: boolean }} o
 */
export function paintLive(ctx, view, { infl, blight, marches, layer }, o) {
  if (!view) return;
  ctx.save();
  ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
  if (blight?.edge?.length) paintBlightLive(ctx, view, blight, infl, layer, o);
  if (marches?.length) paintMarchesLive(ctx, view, marches, o);
  if (infl) paintBorders(ctx, view, infl, o);
  ctx.restore();
}

/** Whether anything here moves - the window repaints at LIVE_HZ only while this is true. */
export const liveStands = ({ infl, blight, marches }) => !!(infl?.owners?.length || infl?.charterRings?.length || blight?.edge?.length || marches?.length);

/**
 * WHAT THE LAND SAYS under the pointer (map pixels): a hover card `{ title, lines }`, or null.
 * @param {any} infl @param {any} blight @param {number} mx @param {number} my
 */
export function territoryTipAt(infl, blight, mx, my) {
  const lines = [];
  let title = '';
  const m = infl?.ownerAt?.(mx, my) ?? null;
  if (m) {
    title = `<${m.tag ?? '?'}> ${m.name ?? ''}`.trim();
    lines.push(territoryReachText(m.strength));
    lines.push(m.mine ? t('terrmap.mine', 'Your Company holds this ground. Gathering and loot here pay more.') : t('terrmap.theirs', 'This Company holds this ground.'));
  }
  const c = infl?.charterRings?.find((r) => Math.hypot(mx - r.charter.x, my - r.charter.y) <= r.charter.r)?.charter ?? null;
  if (c) { if (!title) title = c.name; lines.push(t('terrmap.charter', 'Within the Charter of {0}.').replace('{0}', c.name)); }
  if (blight?.edge?.length && blightDepth(blight.centre, blight.edge, mx, my) > 0) {
    if (!title) title = t('terrmap.blight', "Rodney's blight");
    lines.push(t('terrmap.blightHere', 'Rodney\'s blight covers this ground. Enemies here are tougher.'));
  }
  return title ? { title, lines } : null;
}
