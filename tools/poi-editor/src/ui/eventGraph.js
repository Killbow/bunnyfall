// @ts-check

// The event graph as an SVG picture: sources on the left (a zone, a person, a route, an encounter, a trade, an answer),
// events to their right, an arrow for each thing that starts another. Columns come from dm.js eventGraph. Click an event
// to open it. This draws what the document says; it has no state of its own.

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, text) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); if (text !== undefined) e.textContent = text; return e; };
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}...` : s);

/**
 * @param {ReturnType<typeof import('../dm.js').eventGraph>} graph
 * @param {string | null} selected a node id
 * @param {(id: string) => void} onPick
 */
export function eventGraphSvg(graph, selected, onPick) {
  const W = 230, GAP_X = 70, GAP_Y = 16, LINE = 14, PAD = 10;
  const box = new Map();
  const colY = new Map();
  for (const n of [...graph.nodes].sort((a, b) => a.col - b.col || a.row - b.row)) {
    const lines = Math.min(n.sub.length, 7) + (n.sub.length > 7 ? 1 : 0);
    const hgt = PAD * 2 + LINE * (1 + lines);
    const y = colY.get(n.col) ?? PAD;
    box.set(n.id, { x: PAD + n.col * (W + GAP_X), y, h: hgt });
    colY.set(n.col, y + hgt + GAP_Y);
  }
  const width = PAD * 2 + (Math.max(0, ...graph.nodes.map((n) => n.col)) + 1) * (W + GAP_X) - GAP_X;
  const height = Math.max(60, ...[...colY.values()].map((v) => v + PAD));
  const svg = el('svg', { width, height, viewBox: `0 0 ${width} ${height}`, class: 'evgraph', role: 'img', 'aria-label': 'Event graph' });
  const defs = el('defs'); const mk = el('marker', { id: 'arr', viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: 'auto' }); mk.append(el('path', { d: 'M0,0 L8,4 L0,8 z', fill: '#8a93a8' })); defs.append(mk); svg.append(defs);
  if (!graph.nodes.length) svg.append(el('text', { x: PAD, y: 24, fill: '#9aa3b5' }, 'No events yet.'));
  for (const e of graph.edges) {
    const a = box.get(e.from), b = box.get(e.to);
    if (!a || !b) continue;
    const forward = a.x < b.x;
    const x1 = forward ? a.x + W : a.x, y1 = a.y + a.h / 2, x2 = forward ? b.x : b.x + W, y2 = b.y + b.h / 2, mx = (x1 + x2) / 2;
    svg.append(el('path', { d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, fill: 'none', stroke: '#8a93a8', 'stroke-width': 1.4, 'marker-end': 'url(#arr)' }));
    svg.append(el('text', { x: mx, y: (y1 + y2) / 2 - 4, fill: '#9aa3b5', 'font-size': 10, 'text-anchor': 'middle' }, e.label));
  }
  for (const n of graph.nodes) {
    const b = box.get(n.id);
    if (!b) continue;
    const g = el('g', { class: n.kind === 'event' ? 'evnode' : 'evsrc', style: n.kind === 'event' ? 'cursor:pointer' : '' });
    g.append(el('rect', { x: b.x, y: b.y, width: W, height: b.h, rx: 6, fill: n.kind === 'event' ? '#23262e' : '#1b2a24', stroke: selected === n.id ? '#ffb347' : n.kind === 'event' ? '#3a3f4b' : '#2f5a46', 'stroke-width': selected === n.id ? 2 : 1 }));
    g.append(el('text', { x: b.x + PAD, y: b.y + PAD + 10, fill: '#e6e8ee', 'font-size': 12, 'font-weight': 600 }, clip(n.label, 32)));
    n.sub.slice(0, 7).forEach((t, i) => g.append(el('text', { x: b.x + PAD, y: b.y + PAD + 10 + LINE * (i + 1), fill: '#aab1c2', 'font-size': 11 }, clip(t, 38))));
    if (n.sub.length > 7) g.append(el('text', { x: b.x + PAD, y: b.y + PAD + 10 + LINE * 8, fill: '#7d8496', 'font-size': 11 }, `and ${n.sub.length - 7} more`));
    if (n.kind === 'event') g.addEventListener('click', () => onPick(n.id));
    svg.append(g);
  }
  const wrap = document.createElement('div'); wrap.className = 'evwrap'; wrap.append(svg);
  return wrap;
}
