// Compares the layout cost of moving name labels by left and top against transform, in Chromium.
// The page copies the name layer's DOM shape instead of importing it, so both ways of moving it can run.
// Usage: node tools/nameLayerBrowserProbe.mjs [names] [frames].
import { chromium } from 'playwright';

const NAMES = Number(process.argv[2] ?? 72);
const FRAMES = Number(process.argv[3] ?? 600);

const page = (mode, names, frames) => `<!doctype html><meta charset=utf-8>
<style>
  html,body { margin:0; height:100%; background:#101216; overflow:hidden; }
  .dfnames { position: fixed; inset: 0; z-index: 3; pointer-events: none; overflow: hidden;
    font-family: monospace; -webkit-font-smoothing: none; -webkit-user-select: none; user-select: none; }
  .dfname { position: absolute; left: 0; top: 0; display: flex; flex-direction: column; align-items: center;
    transform: translate(-50%, -100%); }
  .dfname-tag { white-space: nowrap; line-height: 1; color: #e9e4d9;
    text-shadow: 0 1px 0 #000, 0 0 3px #000, 0 0 3px #000; }
  .dfname-bubble { position: relative; max-width: 15em; margin-bottom: .45em; padding: .3em .55em;
    border-radius: .4em; background: rgba(14,16,19,.86); border: 1px solid #2b323b; color: #e9e4d9;
    font-size: .92em; line-height: 1.3; text-align: center; white-space: pre-wrap; }
  .dfname-bubble.off { display: none; }
  .dfname-inner { display: flex; flex-direction: column; align-items: center; transform-origin: 50% 100%; font-size: 16px; }
</style>
<div class="dfnames" id="root"></div>
<script>
const MODE = ${JSON.stringify(mode)}, N = ${names}, FRAMES = ${frames};
const root = document.getElementById('root');
const tags = [];
for (let i = 0; i < N; i++) {
  const node = document.createElement('div'); node.className = 'dfname';
  const inner = document.createElement('div'); inner.className = 'dfname-inner';
  const bubble = document.createElement('div'); bubble.className = 'dfname-bubble off';
  const name = document.createElement('div'); name.className = 'dfname-tag';
  name.textContent = 'Player' + i;
  inner.append(bubble, name); node.append(inner); root.append(node);
  tags.push({ node, name, inner });
}
// the same guard ui/nameLayer.js has: a property is only written when it changes
const setStyle = (n, k, v) => { if (n.style[k] !== v) n.style[k] = v; };
const W = innerWidth, H = innerHeight;
function place(f) {
  for (let i = 0; i < N; i++) {
    // a name's screen track as the eye walks and turns - x, y and depth
    // all moving, which is what the Node probe measured as 1.65 writes
    const a = (i / N) * Math.PI * 2 + f * 0.01;
    const d = 6 + (i % 7) * 2.5 + Math.sin(f * 0.02 + i) * 2;
    const x = W / 2 + Math.cos(a) * (W * 0.42) * (12 / d);
    const y = H / 2 + Math.sin(a * 0.7 + f * 0.013) * (H * 0.3);
    const s = Math.max(9, Math.min(28, 260 / d));
    const t = tags[i];
    // POSITION, by one of the two ways
    if (MODE.startsWith('lefttop')) {
      setStyle(t.node, 'left', Math.round(x) + 'px');
      setStyle(t.node, 'top', Math.round(y) + 'px');
    } else {
      setStyle(t.node, 'transform', 'translate3d(' + Math.round(x) + 'px,' + Math.round(y) + 'px,0) translate(-50%,-100%)');
    }
    // SIZE, by one of three: the live font-size the layer writes today,
    // none at all (the control), or a compositor scale
    if (MODE.endsWith('+font')) setStyle(t.node, 'fontSize', s.toFixed(1) + 'px');
    else if (MODE.endsWith('+scale')) setStyle(t.inner, 'transform', 'scale(' + (s / 16).toFixed(3) + ')');
  }
}
window.__done = new Promise((resolve) => {
  let f = 0; const marks = [];
  function step() {
    const t0 = performance.now();
    place(f);
    marks.push(performance.now() - t0);
    if (++f >= FRAMES) { resolve(marks); return; }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
});
</script>`;

async function run(mode) {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Performance.enable');
  await p.setContent(page(mode, NAMES, FRAMES));
  const before = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  await p.evaluate(() => window.__done);
  const after = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  await browser.close();
  const d = (k) => (after[k] ?? 0) - (before[k] ?? 0);
  return { layout: d('LayoutDuration') * 1000, style: d('RecalcStyleDuration') * 1000, script: d('ScriptDuration') * 1000,
    task: d('TaskDuration') * 1000, layoutCount: d('LayoutCount'), styleCount: d('RecalcStyleCount'), frames: d('Frames') };
}

console.log(`\n${NAMES} names, ${FRAMES} frames, Chromium 1600x900 - Performance.getMetrics, main-thread ms\n`);
console.log('mode             layout ms   style ms   script ms   layouts   recalcs   layout ms/frame   task ms/frame');
for (const mode of ['lefttop+font', 'transform+font', 'lefttop', 'transform', 'transform+scale']) {
  const r = await run(mode);
  console.log(`${mode.padEnd(16)} ${r.layout.toFixed(1).padStart(9)} ${r.style.toFixed(1).padStart(10)} ${r.script.toFixed(1).padStart(11)} ${String(r.layoutCount).padStart(9)} ${String(r.styleCount).padStart(9)} ${(r.layout / FRAMES).toFixed(3).padStart(17)} ${(r.task / FRAMES).toFixed(3).padStart(15)}`);
}
console.log('');
