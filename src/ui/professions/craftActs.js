// BUNNYFALL CRAFTING REWORK: THE MINIGAMES, drawn for the new crafting window. The engines are the game's own
// (systems/heatAct.js and the five beside it); this draws them, feeds them time and presses, and reports the result.
// Space (or Enter, or the big button) acts; Escape lets go; the chisel aims with the arrow keys or a click on a line.
import { createHeatAct } from '../../systems/heatAct.js';
import { createStitchAct } from '../../systems/stitchAct.js';
import { createPanAct } from '../../systems/panAct.js';
import { createFacetAct } from '../../systems/facetAct.js';
import { createChiselAct } from '../../systems/chiselAct.js';
import { createPlaneAct } from '../../systems/planeAct.js';
import { HEAT_ACT, STITCH_ACT, PLANE_ACT } from '../../net/recipeLaw.js';
import { capturePointer } from '../pointerCapture.js';

/** What each craft's minigame is called and what its button says. */
export const ACT_WORDS = Object.freeze({
  heat: { title: 'The heat', hint: 'Strike while the glow is inside the band.', press: 'Strike' },
  stitch: { title: 'The stitch', hint: 'Stitch when the needle is on the beat.', press: 'Stitch' },
  pan: { title: 'The pan', hint: 'Take the pan off while the heat is in the gold band.', press: 'Take off' },
  facet: { title: 'The facet', hint: 'Cut when the gem turns into the light.', press: 'Cut' },
  chisel: { title: 'The chisel', hint: 'Aim at the marked line, then strike.', press: 'Strike' },
  plane: { title: 'The plane', hint: 'Press at the left end and draw along the grain, steadily, to the right.', press: '' },
});

/** The engine for a kind, with the options the window hands in. */
function engineOf(kind, o) {
  if (kind === 'heat') return createHeatAct({ band: o.band ?? 1 });
  if (kind === 'stitch') return createStitchAct({ band: o.band ?? 1 });
  if (kind === 'pan') return createPanAct({ pans: o.pans, done: o.done });
  if (kind === 'facet') return createFacetAct({ facets: o.facets, windowDeg: o.windowDeg });
  if (kind === 'chisel') return createChiselAct({ strikes: o.strikes, markS: o.markS });
  if (kind === 'plane') return createPlaneAct({ rank: o.rank ?? 0, band: o.band ?? 1 });
  return null;
}

const SVG = 'http://www.w3.org/2000/svg';

/**
 * Mount a minigame. `onDone(report)` gets the engine's report (`clean` the one that matters), or null when let go.
 * Returns `{ el, stop }`; the act stops itself when its element leaves the page.
 * @param {string} kind @param {any} o @param {(report: any) => void} onDone
 */
export function mountAct(kind, o, onDone) {
  const doc = globalThis.document;
  const act = engineOf(kind, o);
  const words = ACT_WORDS[kind];
  const box = doc.createElement('div');
  box.className = 'cw-act';
  if (!act || !words) { onDone(null); return { el: box, stop() {} }; }
  const head = doc.createElement('div');
  head.className = 'cw-act-head';
  head.textContent = `${words.title}: ${words.hint}`;
  const stage = doc.createElement('div');
  stage.className = `cw-act-stage cw-act-${kind}`;
  const dots = doc.createElement('div');
  dots.className = 'cw-act-dots';
  const row = doc.createElement('div');
  row.className = 'cw-act-row';
  const press = doc.createElement('button');
  press.type = 'button';
  press.className = 'cw-btn cw-primary';
  press.textContent = `${words.press} (Space)`;
  const quit = doc.createElement('button');
  quit.type = 'button';
  quit.className = 'cw-btn';
  quit.textContent = 'Let go';
  if (words.press) row.append(press);
  row.append(quit);
  box.append(head, stage, dots, row);

  let finished = false, raf = 0, last = 0;
  const finish = (rep) => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame?.(raf);
    doc.removeEventListener('keydown', onKey, true);
    onDone(rep);
  };
  const results = () => (act.state.strikes ?? act.state.stitches ?? act.state.takes ?? act.state.cuts ?? []);
  const need = () => act.state.need ?? (kind === 'heat' ? HEAT_ACT.strikes : kind === 'stitch' ? STITCH_ACT.stitches : 1);

  // the stage, by kind
  let draw = () => {};
  if (kind === 'heat' || kind === 'pan') {
    const bar = doc.createElement('div'); bar.className = 'cw-meter';
    const band = doc.createElement('div'); band.className = 'cw-meter-band';
    const mark = doc.createElement('div'); mark.className = 'cw-meter-mark';
    const lo = act.state.lo, hi = act.state.hi;
    band.style.left = `${(lo * 100).toFixed(1)}%`; band.style.width = `${((hi - lo) * 100).toFixed(1)}%`;
    bar.append(band, mark); stage.append(bar);
    draw = () => {
      const v = kind === 'heat' ? act.glow : act.state.heat;
      mark.style.left = `${(Math.max(0, Math.min(1, v)) * 100).toFixed(1)}%`;
      bar.classList.toggle('cw-hot', kind === 'heat' ? act.inBand : act.inWindow);
    };
  } else if (kind === 'stitch') {
    const ring = doc.createElement('div'); ring.className = 'cw-beat';
    const pulse = doc.createElement('div'); pulse.className = 'cw-beat-pulse';
    ring.append(pulse); stage.append(ring);
    draw = () => {
      const b = act.beat;
      const d = Math.min(b, 1 - b);
      pulse.style.transform = `scale(${(0.35 + d * 1.3).toFixed(3)})`;
      ring.classList.toggle('cw-hot', act.onBeat);
    };
  } else if (kind === 'facet') {
    const svg = doc.createElementNS(SVG, 'svg'); svg.setAttribute('viewBox', '-50 -50 100 100'); svg.setAttribute('class', 'cw-facet');
    const rim = doc.createElementNS(SVG, 'circle'); rim.setAttribute('r', '44'); rim.setAttribute('class', 'cw-facet-rim');
    const light = doc.createElementNS(SVG, 'path'); light.setAttribute('class', 'cw-facet-light');
    const hand = doc.createElementNS(SVG, 'line'); hand.setAttribute('x1', '0'); hand.setAttribute('y1', '0'); hand.setAttribute('class', 'cw-facet-hand');
    svg.append(rim, light, hand); stage.append(svg);
    const at = (deg, r) => { const a = ((deg - 90) * Math.PI) / 180; return [Math.cos(a) * r, Math.sin(a) * r]; };
    draw = () => {
      const half = act.state.half, c = act.state.light;
      const [x1, y1] = at(c - half, 44), [x2, y2] = at(c + half, 44);
      light.setAttribute('d', `M0 0 L${x1.toFixed(1)} ${y1.toFixed(1)} A44 44 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`);
      const [hx, hy] = at(act.bearing, 40);
      hand.setAttribute('x2', hx.toFixed(1)); hand.setAttribute('y2', hy.toFixed(1));
      svg.classList.toggle('cw-hot', act.inWindow);
    };
  } else if (kind === 'chisel') {
    const lanes = [];
    for (let i = 0; i < act.state.lines; i++) {
      const lane = doc.createElement('button'); lane.type = 'button'; lane.className = 'cw-lane';
      lane.onclick = () => { act.aim(i); draw(); };
      lanes.push(lane); stage.append(lane);
    }
    draw = () => lanes.forEach((l, i) => { l.classList.toggle('cw-marked', i === act.mark); l.classList.toggle('cw-aimed', i === act.state.at); });
  } else if (kind === 'plane') {
    const board = doc.createElement('div'); board.className = 'cw-board';
    const svg = doc.createElementNS(SVG, 'svg'); svg.setAttribute('viewBox', '0 0 100 40'); svg.setAttribute('preserveAspectRatio', 'none');
    const start = doc.createElementNS(SVG, 'rect'); start.setAttribute('width', String(PLANE_ACT.headX * 100)); start.setAttribute('height', '40'); start.setAttribute('class', 'cw-board-head');
    const grain = doc.createElementNS(SVG, 'polyline'); grain.setAttribute('class', 'cw-grain');
    const g = []; for (let i = 0; i <= 40; i++) { const x = i / 40; g.push(`${(x * 100).toFixed(1)},${(20 - act.grain(x) * 20).toFixed(2)}`); }
    grain.setAttribute('points', g.join(' '));
    const trail = doc.createElementNS(SVG, 'polyline'); trail.setAttribute('class', 'cw-trail');
    svg.append(start, grain, trail); board.append(svg); stage.append(board);
    const pts = [];
    const pos = (e) => { const r = board.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / (r.width || 1))), -(((e.clientY - r.top) / (r.height || 1)) * 2 - 1)]; };
    const now = () => performance.now() / 1000;
    board.onpointerdown = (e) => { const [x, y] = pos(e); if (!act.press(x, y, now())) return; capturePointer(board, e.pointerId); pts.length = 0; pts.push(`${(x * 100).toFixed(1)},${(20 - y * 20).toFixed(2)}`); trail.setAttribute('points', pts.join(' ')); };
    board.onpointermove = (e) => {
      if (!act.state.planing) return;
      if (!((e.buttons ?? 1) & 1)) { act.release(); return; }
      const [x, y] = pos(e); act.move(x, y, now());
      pts.push(`${(x * 100).toFixed(1)},${(20 - y * 20).toFixed(2)}`); trail.setAttribute('points', pts.join(' '));
      if (act.state.done) finish(act.report());
    };
    board.onpointerup = () => { if (act.state.planing) act.release(); };
  }

  const drawDots = () => {
    const got = results();
    dots.textContent = '';
    for (let i = 0; i < need(); i++) {
      const d = doc.createElement('span');
      d.className = `cw-dot${i < got.length ? (got[i] ? ' cw-hit' : ' cw-miss') : ''}`;
      dots.append(d);
    }
  };
  const act1 = () => {
    if (finished) return;
    const r = kind === 'heat' || kind === 'chisel' ? act.strike() : kind === 'stitch' ? act.stitch() : kind === 'pan' ? act.take() : kind === 'facet' ? act.stop() : null;
    if (r === null && !act.state.done) return;
    drawDots();
    if (act.state.done) finish(act.report());
  };
  function onKey(e) {
    if (!box.isConnected) { finish(null); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); act.cancel(); finish(null); return; }
    if (kind === 'chisel' && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) { e.preventDefault(); act.move(-1); draw(); return; }
    if (kind === 'chisel' && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) { e.preventDefault(); act.move(1); draw(); return; }
    if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); act1(); }
  }
  press.onclick = () => act1();
  quit.onclick = () => { act.cancel(); finish(null); };
  doc.addEventListener('keydown', onKey, true);
  const frame = (t) => {
    if (finished) return;
    if (!box.isConnected && last) { act.cancel(); finish(null); return; }
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
    last = t;
    if (kind !== 'plane') act.tick(dt);
    draw();
    if (kind === 'pan' || kind === 'facet') drawDots();   // a pan left on burns, a facet let round is lost: both move on their own
    if (kind !== 'plane' && act.state.done) { finish(act.report()); return; }
    raf = requestAnimationFrame(frame);
  };
  drawDots();
  draw();
  raf = requestAnimationFrame(frame);
  return { el: box, stop() { act.cancel(); finish(null); } };
}
