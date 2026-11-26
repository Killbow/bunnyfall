// Browser probe that mounts the FPS counter with long GPU names and fails if its box leaves the window.
// Run: npx vite --port 5199 & node tools/fpsCounterProbe.mjs.
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:5199';

const CASES = [
  ['RTX 4060 Ti (the report)', 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Ti (0x00002803) Direct3D11 vs_5_0 ps_5_0, D3D11)', { world: [1440, 810], canvas: [1920, 1080], dpr: 1.25, scale: 0.75 }],
  ['RX 6600 (the report)', 'ANGLE (AMD, AMD Radeon RX 6600 (0x000073FF) Direct3D11 vs_5_0 ps_5_0, D3D11)', { world: [1920, 1080], canvas: [1920, 1080], dpr: 1, scale: 1 }],
  ['a phone\'s GPU', 'ANGLE (Qualcomm, Adreno (TM) 740, OpenGL ES 3.2)', { world: [293, 633], canvas: [390, 844], dpr: 3, scale: 0.75 }],
  ['a short name', 'Apple GPU', { world: [390, 844], canvas: [390, 844], dpr: 3, scale: 1 }],
];
const VIEWPORTS = [{ width: 1920, height: 1080 }, { width: 800, height: 600 }, { width: 390, height: 844 }];

const bad = [];
const check = (name, ok, detail = '') => {
  if (!ok) bad.push(`${name}${detail ? ` - ${detail}` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
try {
  for (const vp of VIEWPORTS) {
    const page = await (await browser.newContext({ viewport: vp })).newPage();
    await page.goto(`${BASE}/tools/`, { waitUntil: 'load' });
    await page.evaluate(() => { document.documentElement.innerHTML = '<head></head><body></body>'; });
    for (const [name, gpu, size] of CASES) {
      const r = await page.evaluate(async ([gpu, size]) => {
        const { mountFpsCounter } = await import('/src/ui/fpsCounter.js');
        const c = mountFpsCounter({ enabled: () => true, raf: null, stats: () => ({ draws: 812, texBinds: 240 }), info: () => ({ gpu, ...size, retro: false }) });
        for (let t = 0; t <= 1100; t += 16) c.tick(1000 + t);
        const b = c.el.getBoundingClientRect();
        const out = { left: b.left, right: b.right, width: b.width, scroll: c.el.scrollWidth, client: c.el.clientWidth, text: c.el.textContent, inner: innerWidth };
        c.dispose();
        return out;
      }, [gpu, size]);
      check(`${vp.width}x${vp.height} ${name}: the box inside the window`, r.left >= 0 && r.right <= r.inner,
        `left ${Math.round(r.left)} right ${Math.round(r.right)} width ${Math.round(r.width)} of ${r.inner}`);
      check(`${vp.width}x${vp.height} ${name}: no line overflows the box`, r.scroll <= r.client, `scroll ${r.scroll} client ${r.client}`);
      check(`${vp.width}x${vp.height} ${name}: the GPU line is there whole`, r.text.includes(`gpu ${gpu}`));
    }
  }
} finally {
  await browser.close();
}
if (bad.length) { console.log(`\n${bad.length} failing`); process.exit(1); }
console.log('\nall inside');
