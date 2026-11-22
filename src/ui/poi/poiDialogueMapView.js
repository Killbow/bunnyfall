// @ts-check
// The DM panel's dialogue map (Map view): the layout of poi/poiDialogueMap.js drawn as SVG. It has Fit, zoom, pan, and
// keyboard focus over the lines, and a click picks a line for the card beside it. The panel rebuilds it on every
// render, so pan, zoom, and the picked line live in the state it is given. Below 60 percent zoom, boxes show only keys
// and answer counts.

import { t } from '../textManager.js';
import { dialogueMap, MAP_HEAD, MAP_PAD, MAP_W, MAP_GAP_X, MAP_COMPACT_W, MAP_COMPACT_GAP_X } from '../../poi/poiDialogueMap.js';
import { conditionText } from '../../poi/poiDmEdit.js';
import { poiDocProblems } from '../../poi/poiLaw.js';
import { problemText } from '../../poi/poiText.js';

export const DIALOGUE_MAP_CSS = `
.dfpoi-map { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 4px; min-height: 0; }
.dfpoi-map-view { flex: 1 1 auto; min-height: 200px; position: relative; overflow: hidden; border: 1px solid #3a2f20; border-radius: 4px; background: #15171a; cursor: grab; }
.dfpoi-map-view.dfpoi-panning { cursor: grabbing; }
.dfpoi-map-view > svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; user-select: none; }
.dfpoi-map-box, .dfpoi-map-stub, .dfpoi-map-src { cursor: pointer; }
.dfpoi-map-box:focus { outline: none; }
.dfpoi-map-box:focus > .dfpoi-map-frame { stroke: #ffd27a; stroke-width: 3; }
.dfpoi-dm .dfpoi-row > label.dfpoi-map-check { flex: 0 0 auto; color: inherit; }
.dfpoi-map-split { display: flex; gap: 8px; flex: 1 1 auto; min-height: 0; }
.dfpoi-map-side { flex: 0 0 330px; overflow: auto; min-width: 0; }
.dfpoi-dm .dfpoi-map-side .dfpoi-row > label { flex: 0 0 96px; }
.dfpoi-dm-form.dfpoi-map-form { display: flex; flex-direction: column; overflow: hidden; }
`;

const FAR = 0.6, READ = 0.75, MIN_ZOOM = 0.08, MAX_ZOOM = 2;
const NS = 'http://www.w3.org/2000/svg';
const C = { box: '#2a2620', src: '#1d2a22', edge: '#6b5230', sel: '#ffb347', bad: '#d0655a', warn: '#d8b04a', text: '#e9e4d9', dim: '#b9b2a3', faint: '#8a8373', ok: '#8fc27f' };
const clip = (/** @type {string} */ s, /** @type {number} */ n) => (s.length > n ? `${s.slice(0, Math.max(1, n - 3))}...` : s);
const CHAR = 6.2;

/**
 * @typedef {{ view: 'list' | 'map', sel: string | null, zoom: number | null, px: number, py: number, all: boolean,
 *   sources: boolean, shown: string | null, scrollTo: string | null }} MapState
 */
/** @returns {MapState} */
export const mapState = () => ({ view: 'list', sel: null, zoom: null, px: 0, py: 0, all: false, sources: true, shown: null, scrollTo: null });

/** @param {string} s @param {number} n */
function twoLines(s, n) {
  const words = s.split(/\s+/).filter(Boolean);
  let first = '';
  while (words.length && (first ? first.length + 1 : 0) + words[0].length <= n) first = first ? `${first} ${words.shift()}` : /** @type {string} */ (words.shift());
  if (!first && words.length) first = clip(/** @type {string} */ (words.shift()), n);
  return [first, clip(words.join(' '), n)].filter(Boolean);
}

/**
 * @param {{ doc: Document, poi: any, key: string, state: MapState, optionWord: (k: string) => string,
 *   onPick: (key: string) => void, onSource: (kind: 'npc' | 'event', key: string) => void, onOpen: () => void }} o
 * @returns {HTMLElement}
 */
export function dialogueMapView({ doc, poi, key, state, optionWord, onPick, onSource, onOpen }) {
  const el = (/** @type {string} */ tag, cls = '', /** @type {string | null} */ text = null) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const mk = (/** @type {string} */ tag, /** @type {Record<string, any>} */ attrs = {}, /** @type {string | undefined} */ text = undefined) => { const e = doc.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); if (text !== undefined) e.textContent = text; return e; };
  const tip = (/** @type {Element} */ e, /** @type {string} */ s) => { e.append(mk('title', {}, s)); return e; };
  const btn = (/** @type {string} */ text, /** @type {() => void} */ fn, title = '') => { const b = /** @type {HTMLButtonElement} */ (el('button', 'dfpoi-btn', text)); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); return b; };
  const check = (/** @type {string} */ label, /** @type {boolean} */ on, /** @type {(v: boolean) => void} */ fn) => {
    const l = el('label', 'dfpoi-map-check'), c = /** @type {HTMLInputElement} */ (el('input'));
    c.type = 'checkbox'; c.checked = on; c.addEventListener('change', () => fn(c.checked));
    l.append(c, doc.createTextNode(` ${label}`));
    return l;
  };

  const dlgIndex = (poi?.dialogues ?? []).findIndex((/** @type {any} */ d) => d?.key === key);
  const problems = new Map();
  for (const p of poiDocProblems(poi)) {
    const m = new RegExp(`^dialogues\\[${dlgIndex}\\]\\.nodes\\[(\\d+)\\]`).exec(p.path);
    if (m) (problems.get(Number(m[1])) ?? problems.set(Number(m[1]), []).get(Number(m[1]))).push(problemText(p));
  }

  const root = el('div', 'dfpoi-map');
  const vp = el('div', 'dfpoi-map-view');
  const svg = mk('svg', { role: 'group', 'aria-label': t('poi.dm.map.label', 'Dialogue map') });
  const defs = mk('defs');
  for (const [id, fill] of [['dfpoi-map-arr', C.dim], ['dfpoi-map-arr-back', C.faint], ['dfpoi-map-arr-src', C.ok]]) {
    const m = mk('marker', { id, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: 'auto' });
    m.append(mk('path', { d: 'M0,0 L8,4 L0,8 z', fill })); defs.append(m);
  }
  const world = mk('g');
  svg.append(defs, world);
  vp.append(svg);

  let compact = state.zoom != null && state.zoom < FAR;
  /** @type {ReturnType<typeof dialogueMap>} */
  let map = dialogueMap(poi, key, { sources: state.sources, compact });
  /** @type {Map<string, any>} */
  let boxOf = new Map();
  const pickable = () => map.boxes.find((b) => b.key === state.sel) ?? map.boxes.find((b) => b.start) ?? map.boxes[0] ?? null;

  function draw() {
    map = dialogueMap(poi, key, { sources: state.sources, compact });
    boxOf = new Map(map.boxes.map((b) => [b.key, b]));
    const sel = pickable()?.key ?? null;
    const parts = [];
    if (map.unreachableCol != null) {
      const lost = map.boxes.filter((b) => b.unreachable);
      if (lost.length) {
        const x = lost[0].x, w = lost[0].w;
        parts.push(mk('rect', { x: x - 8, y: 2, width: w + 16, height: map.height - 4, rx: 6, fill: 'rgba(208, 101, 90, 0.08)', stroke: 'rgba(208, 101, 90, 0.4)' }));
        parts.push(mk('text', { x: x, y: 12, fill: C.bad, 'font-size': 11, 'font-weight': 600 }, t('poi.dm.map.lost', 'Not reachable from the start')));
      }
    }
    const top = (/** @type {any} */ b) => b.y + (compact ? b.h / 2 : 16);
    const curve = (/** @type {number} */ x1, /** @type {number} */ y1, /** @type {number} */ x2, /** @type {number} */ y2, /** @type {number} */ bend) => `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`;
    const start = map.boxes.find((b) => b.start);
    for (const s of map.sources) if (start) parts.push(mk('path', { d: curve(s.x + s.w, s.y + s.h / 2, start.x, top(start), 40), fill: 'none', stroke: C.ok, 'stroke-width': 1.4, 'marker-end': 'url(#dfpoi-map-arr-src)' }));
    const pills = [];
    const seen = new Set();
    for (const l of map.links) {
      const a = boxOf.get(l.from), b = boxOf.get(l.to), r = a?.rows[l.i];
      if (!a || !r) continue;
      const x1 = a.x + a.w, y1 = r.y;
      if (compact && seen.has(`${l.from}>${l.to}`)) continue;
      seen.add(`${l.from}>${l.to}`);
      if (l.kind === 'arrow' && b) parts.push(mk('path', { d: curve(x1, y1, b.x, top(b), 45), fill: 'none', stroke: C.dim, 'stroke-width': 1.4, 'marker-end': 'url(#dfpoi-map-arr)' }));
      else if (l.kind === 'back' && b && state.all) {
        const x2 = b.x + b.w * 0.75, y2 = b.y;
        pills.push(mk('path', { d: `M${x1},${y1} C${x1 + 50},${y1} ${x2},${y2 - 70} ${x2},${y2}`, fill: 'none', stroke: C.dim, opacity: 0.75, 'stroke-width': 1.2, 'stroke-dasharray': '5 4', 'marker-end': 'url(#dfpoi-map-arr-back)' }));
      }
      else if (!compact && (l.kind === 'back' || l.kind === 'missing')) {
        const bad = l.kind === 'missing';
        const label = bad ? t('poi.dm.map.missing', 'Missing line {key}', { key: l.to }) : t('poi.dm.map.backTo', 'to {key}', { key: l.to });
        const shown = clip(label, 13), w = Math.ceil(shown.length * CHAR) + 12;
        const g = mk('g', { class: 'dfpoi-map-stub', 'data-to': l.to });
        g.append(mk('line', { x1, y1, x2: x1 + 8, y2: y1, stroke: bad ? C.bad : C.faint, 'stroke-width': 1.2 }),
          mk('rect', { x: x1 + 8, y: y1 - 8, width: w, height: 16, rx: 8, fill: '#15171a', stroke: bad ? C.bad : C.faint }),
          mk('text', { x: x1 + 14, y: y1 + 4, fill: bad ? C.bad : C.dim, 'font-size': 10 }, shown));
        tip(g, label);
        if (!bad) g.addEventListener('click', (e) => { e.stopPropagation(); onPick(l.to); });
        pills.push(g);
      }
    }
    for (const s of map.sources) {
      const g = mk('g', { class: 'dfpoi-map-src' });
      g.append(mk('rect', { x: s.x, y: s.y, width: s.w, height: s.h, rx: 6, fill: C.src, stroke: C.edge }),
        mk('text', { x: s.x + 10, y: s.y + 15, fill: C.ok, 'font-size': 10 }, s.kind === 'npc' ? t('poi.dm.map.person', 'Person') : t('poi.dm.map.event', 'Event')),
        mk('text', { x: s.x + 10, y: s.y + 31, fill: C.text, 'font-size': 12, 'font-weight': 600 }, clip(s.name, Math.floor((s.w - 20) / 7))));
      tip(g, s.name);
      g.addEventListener('click', (e) => { e.stopPropagation(); onSource(s.kind, s.key); });
      parts.push(g);
    }
    for (const b of map.boxes) parts.push(boxEl(b, b.key === sel));
    const focused = world.contains(doc.activeElement);
    world.replaceChildren(...parts, ...pills);
    if (focused) /** @type {any} */ (world.querySelector('[data-focus="dfpoi-map-picked"]'))?.focus({ preventScroll: true });
    place();
  }

  /** @param {any} b @param {boolean} picked */
  function boxEl(b, picked) {
    const probs = problems.get(b.index) ?? [];
    const stroke = picked ? C.sel : probs.length || b.unreachable ? C.bad : b.allConditional ? C.warn : C.edge;
    // the panel's redraw gives the focus back to the control with the same data-focus, so only the picked line has one
    const g = mk('g', { class: 'dfpoi-map-box', 'data-key': b.key, tabindex: picked ? 0 : -1, ...(picked ? { 'data-focus': 'dfpoi-map-picked' } : {}), role: 'button', 'aria-label': t('poi.dm.map.boxLabel', '{key}: {say}', { key: b.key, say: b.say }) });
    g.append(mk('rect', { class: 'dfpoi-map-frame', x: b.x, y: b.y, width: b.w, height: b.h, rx: 6, fill: C.box, stroke, 'stroke-width': picked || probs.length ? 2 : 1, 'stroke-dasharray': b.allConditional && !picked && !probs.length && !b.unreachable ? '6 3' : 'none' }));
    const notes = [b.say, ...probs];
    if (b.allConditional) notes.push(t('poi.dm.map.allCond', 'Every answer here has a condition, so a player may see only Leave.'));
    if (b.ends) notes.push(t('poi.dm.map.endsHint', 'Every answer here ends the talk or opens a trade.'));
    tip(g, `${b.key}\n${notes.join('\n')}`);
    if (compact) {
      g.append(mk('text', { x: b.x + 10, y: b.y + 19, fill: C.text, 'font-size': 16, 'font-weight': 600 }, clip(b.key, 15)),
        mk('text', { x: b.x + 10, y: b.y + 34, fill: C.dim, 'font-size': 11 }, t('poi.dm.map.answers', '{n, plural, one {# answer} other {# answers}}', { n: b.rows.length })));
    } else {
      let right = b.x + b.w - 8;
      const chip = (/** @type {string} */ s, /** @type {string} */ color, /** @type {number} */ cy, /** @type {Element} */ into) => {
        const w = Math.ceil(s.length * CHAR) + 10;
        right -= w;
        into.append(mk('rect', { x: right, y: cy - 7, width: w, height: 14, rx: 7, fill: 'none', stroke: color }), mk('text', { x: right + 5, y: cy + 4, fill: color, 'font-size': 10 }, s));
        right -= 4;
      };
      if (b.ends) chip(t('poi.dm.map.ends', 'Ends here'), C.faint, b.y + 12, g);
      if (b.start) chip(t('poi.dm.map.start', 'Start'), C.ok, b.y + 12, g);
      if (b.allConditional) chip(t('poi.dm.map.conditional', 'Conditional'), C.warn, b.y + 12, g);
      g.append(mk('text', { x: b.x + 10, y: b.y + 16, fill: C.text, 'font-size': 12, 'font-weight': 600 }, clip(b.key, Math.max(4, Math.floor((right - b.x - 14) / 7)))));
      twoLines(b.say, 36).forEach((l, i) => g.append(mk('text', { x: b.x + 10, y: b.y + 30 + i * 13, fill: C.dim, 'font-size': 11 }, l)));
      for (const r of b.rows) {
        const rg = mk('g');
        right = b.x + b.w - 6;
        rg.append(mk('line', { x1: b.x + 6, y1: r.y - 10, x2: b.x + b.w - 6, y2: r.y - 10, stroke: '#3a2f20' }));
        const th = r.then?.k;
        if (th && th !== 'goto') chip(SHORT[th]?.() ?? th, C.dim, r.y, rg);
        if (r.cooldownS) chip(t('poi.dm.map.cooldown', '{s, number} s', { s: r.cooldownS }), C.dim, r.y, rg);
        if (r.when) chip(clip(t('poi.dm.map.if', 'if {cond}', { cond: conditionText(poi, r.when) }), 16), C.warn, r.y, rg);
        rg.append(mk('text', { x: b.x + 10, y: r.y + 4, fill: C.text, 'font-size': 11 }, clip(`${r.i + 1}. ${r.text}`, Math.max(6, Math.floor((right - b.x - 12) / CHAR)))));
        if (th === 'goto') rg.append(mk('circle', { cx: b.x + b.w, cy: r.y, r: 3, fill: C.dim }));
        const lines = [`${t('poi.dm.answer', 'Answer {n}', { n: r.i + 1 })}: ${r.text}`, `${t('poi.dm.then', 'Then')}: ${th === 'goto' ? `${optionWord(th)} (${r.then.node})` : optionWord(th ?? '')}`];
        if (r.when) lines.push(`${t('poi.dm.shownWhenAnswer', 'Offered only when')}: ${conditionText(poi, r.when)}`);
        if (r.cooldownS) lines.push(`${t('poi.dm.cooldown', 'Cooldown (s)')}: ${r.cooldownS}`);
        tip(rg, lines.join('\n'));
        g.append(rg);
      }
    }
    g.addEventListener('click', (e) => { e.stopPropagation(); onPick(b.key); });
    return g;
  }

  // ── pan and zoom: screen = layout * zoom + (px, py) ──
  const size = () => ({ w: vp.clientWidth, h: vp.clientHeight });
  function place() {
    const z = state.zoom ?? 1;
    world.setAttribute('transform', `translate(${state.px},${state.py}) scale(${z})`);
  }
  /** Keeps the point under (sx, sy) in place; crossing 60 percent switches between short and full boxes. */
  function zoomTo(/** @type {number} */ z, /** @type {number} */ sx, /** @type {number} */ sy) {
    const z0 = state.zoom ?? 1;
    z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
    const lx = (sx - state.px) / z0, ly = (sy - state.py) / z0;
    if ((z < FAR) !== compact) {
      const near = [...map.boxes].sort((a, b) => Math.hypot(a.x + a.w / 2 - lx, a.y + a.h / 2 - ly) - Math.hypot(b.x + b.w / 2 - lx, b.y + b.h / 2 - ly))[0];
      const u = near ? (lx - near.x) / near.w : 0, v = near ? (ly - near.y) / near.h : 0;
      compact = z < FAR;
      state.zoom = z;
      draw();
      const now = near ? boxOf.get(near.key) : null;
      if (now) { state.px = sx - (now.x + u * now.w) * z; state.py = sy - (now.y + v * now.h) * z; }
    } else {
      state.zoom = z; state.px = sx - lx * z; state.py = sy - ly * z;
    }
    place();
  }
  /**
   * Keeps the lines in place when the column of people and events is shown or hidden.
   * @param {boolean} had @param {boolean} has
   */
  const shiftCols = (had, has) => { if (had === has) return; state.px -= (Number(has) - Number(had)) * (compact ? MAP_COMPACT_W + MAP_COMPACT_GAP_X : MAP_W + MAP_GAP_X) * (state.zoom ?? 1); place(); };
  /** Zooms about the picked line when it is in view, else about the middle. @param {number} f */
  const zoomBy = (f) => {
    const { w, h } = size(), z = state.zoom ?? 1, b = pickable();
    const x = b ? (b.x + b.w / 2) * z + state.px : -1, y = b ? (b.y + Math.min(b.h, MAP_HEAD) / 2) * z + state.py : -1;
    zoomTo(z * f, x >= 0 && x <= w && y >= 0 && y <= h ? x : w / 2, x >= 0 && x <= w && y >= 0 && y <= h ? y : h / 2);
  };
  function fit() {
    const { w, h } = size();
    if (!w || !h) return;
    const fitOf = (/** @type {any} */ m) => Math.min(MAX_ZOOM, 1, (w - 16) / m.width, (h - 16) / m.height);
    let z = fitOf(dialogueMap(poi, key, { sources: state.sources }));
    const small = z < FAR;
    if (small) z = Math.max(MIN_ZOOM, Math.min(FAR - 0.01, fitOf(dialogueMap(poi, key, { sources: state.sources, compact: true }))));
    if (small !== compact) { compact = small; state.zoom = z; draw(); }
    state.zoom = z;
    state.px = Math.round((w - map.width * z) / 2); state.py = Math.round(Math.max(0, (h - map.height * z) / 2));
    place();
  }
  /**
   * Opens on the whole dialogue when it fits at a readable size, else on its left end at that size, level with the
   * picked line.
   */
  function home() {
    const { w, h } = size();
    if (!w || !h) return;
    fit();
    if ((state.zoom ?? 1) >= READ) return;
    if (compact) { compact = false; state.zoom = READ; draw(); }
    const z = state.zoom = READ, b = pickable();
    state.px = 8 - (MAP_PAD - 8) * z;
    state.py = b ? Math.max(Math.min(8, h - map.height * z - 8), Math.min(8, Math.round(h / 2 - (b.y + Math.min(b.h, h / z) / 2) * z))) : 8;
    place();
  }
  /** Pans as little as needed to bring the picked line into view. */
  function showPicked() {
    const b = pickable();
    if (!b) return;
    const { w, h } = size(), z = state.zoom ?? 1, m = 12;
    const into = (/** @type {number} */ lo, /** @type {number} */ len, /** @type {number} */ span) => (lo < m ? m - lo : lo + len > span - m ? Math.max(m - lo, span - m - lo - len) : 0);
    const dx = into(b.x * z + state.px, b.w * z, w), dy = into(b.y * z + state.py, Math.min(b.h * z, h - 2 * m), h);
    if (!dx && !dy) return;
    state.px += Math.round(dx); state.py += Math.round(dy);
    place();
  }

  let pan = /** @type {{ x: number, y: number, px: number, py: number, id: number } | null} */ (null);
  vp.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || /** @type {Element} */ (e.target).closest?.('.dfpoi-map-box, .dfpoi-map-stub, .dfpoi-map-src')) return;
    pan = { x: e.clientX, y: e.clientY, px: state.px, py: state.py, id: e.pointerId };
    vp.setPointerCapture?.(e.pointerId); vp.classList.add('dfpoi-panning');
  });
  vp.addEventListener('pointermove', (e) => { if (!pan || e.pointerId !== pan.id) return; state.px = pan.px + e.clientX - pan.x; state.py = pan.py + e.clientY - pan.y; place(); });
  const endPan = () => { pan = null; vp.classList.remove('dfpoi-panning'); };
  vp.addEventListener('pointerup', endPan); vp.addEventListener('pointercancel', endPan);
  vp.addEventListener('wheel', (e) => { e.preventDefault(); const r = vp.getBoundingClientRect(); zoomTo((state.zoom ?? 1) * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); }, { passive: false });

  // ── keys: the picked line is the one tab stop; plain keys stop here so the editor's shortcuts do not fire ──
  const neighbors = (/** @type {any} */ b, /** @type {number} */ dir) => { const col = map.boxes.filter((x) => x.col === b.col).sort((p, q) => p.y - q.y); return col[col.indexOf(b) + dir] ?? null; };
  const rightOf = (/** @type {any} */ b) => { const out = map.links.filter((l) => l.from === b.key && boxOf.has(l.to)); return (out.find((l) => l.kind === 'arrow') ?? out[0])?.to ?? null; };
  const leftOf = (/** @type {any} */ b) => b.from ?? map.links.find((l) => l.to === b.key && l.from !== b.key)?.from ?? null;
  svg.addEventListener('keydown', (e) => {
    const k = /** @type {KeyboardEvent} */ (e);
    if (k.ctrlKey || k.metaKey || k.altKey || k.key === 'Tab') return;
    k.stopPropagation();
    const b = pickable();
    /** @type {string | null | undefined} */
    let to;
    switch (k.key) {
      case 'ArrowRight': to = b && rightOf(b); break;
      case 'ArrowLeft': to = b && leftOf(b); break;
      case 'ArrowUp': to = b && neighbors(b, -1)?.key; break;
      case 'ArrowDown': to = b && neighbors(b, 1)?.key; break;
      case 'Home': to = map.boxes.find((x) => x.start)?.key; break;
      case 'Enter': case ' ': onOpen(); break;
      case '+': case '=': zoomBy(1.25); break;
      case '-': case '_': zoomBy(0.8); break;
      case '0': fit(); break;
      default: return;
    }
    k.preventDefault();
    if (to && to !== b?.key) onPick(to);
  });
  svg.addEventListener('keyup', (e) => { const k = /** @type {KeyboardEvent} */ (e); if (!(k.ctrlKey || k.metaKey || k.altKey || k.key === 'Tab')) k.stopPropagation(); });

  const bar = el('div', 'dfpoi-row dfpoi-wrap');
  bar.append(btn(t('poi.dm.map.fit', 'Fit'), fit, t('poi.dm.map.fitHint', 'Show the whole dialogue (0)')),
    btn('+', () => zoomBy(1.25), t('poi.dm.map.zoomIn', 'Zoom in (+)')), btn('-', () => zoomBy(0.8), t('poi.dm.map.zoomOut', 'Zoom out (-)')),
    check(t('poi.dm.map.allLinks', 'Show all links'), state.all, (v) => { state.all = v; draw(); }),
    check(t('poi.dm.map.sources', 'Show what opens it'), state.sources, (v) => { const had = map.sources.length > 0; state.sources = v; draw(); shiftCols(had, map.sources.length > 0); }));
  vp.title = t('poi.dm.map.keys', 'Drag to pan and use the wheel to zoom. Arrow keys move between lines, and Enter edits the line.');
  root.append(bar, vp);

  draw();
  // the panel puts this into the page after it returns
  Promise.resolve().then(() => {
    if (!vp.isConnected) return;
    if (state.zoom == null) home();
    if (state.shown !== state.sel) { showPicked(); state.shown = state.sel; }
  });
  return root;
}

/** @type {Record<string, () => string>} */
const SHORT = {
  close: () => t('poi.dm.map.oClose', 'Ends'), open_trade: () => t('poi.dm.map.oTrade', 'Trade'),
  run_trade_recipe: () => t('poi.dm.map.oRecipe', 'Recipe'), trigger_event: () => t('poi.dm.map.oEvent', 'Event'),
};
