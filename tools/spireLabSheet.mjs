// Shoots Spire lab views as PNG sheets with no checks. Usage: node tools/spireLabSheet.mjs [bands] [-- views]
// Env: SPIRE_SHOTS, SPIRE_TAG, SPIRE_W, SPIRE_H, SPIRE_PORT, SPIRE_Q, SPIRE_PAGE, SPIRE_FRAMES, SPIRE_TIMEOUT.

import { createServer } from 'vite';
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const shots = process.env.SPIRE_SHOTS ?? '/tmp';
const tag = process.env.SPIRE_TAG ? `-${process.env.SPIRE_TAG}` : '';
const port = Number(process.env.SPIRE_PORT ?? 5251);
const extra = process.env.SPIRE_Q ?? '';
const frames = Number(process.env.SPIRE_FRAMES ?? 2);
const args = process.argv.slice(2), cut = args.indexOf('--');
const bands = (cut < 0 ? args : args.slice(0, cut)).map(Number).filter((b) => b >= 0 && b <= 3);
const views = cut < 0 ? ['plate', 'course', 'court', 'over'] : args.slice(cut + 1);
mkdirSync(shots, { recursive: true });
function png(rgba, w, h) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, (h - 1 - y) * w * 4, (h - y) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const server = await createServer({ server: { port, strictPort: true, watch: { ignored: ['**/.claude/**', '**/node_modules/**'] } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.SPIRE_W ?? 960), height: Number(process.env.SPIRE_H ?? 540) }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !m.text().includes('GL Driver Message')) errors.push(m.text()); });
let failed = 0;
try {
  for (const band of bands.length ? bands : [0, 1, 2, 3]) for (const view of views) {
    errors.length = 0;
    const t0 = Date.now();
    await page.goto(`http://127.0.0.1:${port}/spire.html?still&nopanel&frames=${frames}&band=${band}&view=${view}&t=40${extra}`, { waitUntil: 'load' });
    await page.waitForFunction((n) => (window.__frame ?? 0) >= n || !!window.__labError, frames, { timeout: Number(process.env.SPIRE_TIMEOUT ?? 900000), polling: 250 });
    const r = await page.evaluate(() => {
      const c = document.getElementById('c'), gl = c.getContext('webgl2');
      const w = c.width, h = c.height, px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let bin = ''; for (let i = 0; i < px.length; i += 0x8000) bin += String.fromCharCode(...px.subarray(i, i + 0x8000));
      return { w, h, px: btoa(bin), ms: window.__labMs ?? null, stats: window.__lab?.stats?.() ?? null, err: window.__labError ?? null };
    });
    const file = `${shots}/spire-b${band}-${view}${tag}.png`;
    // The route draws on a canvas over the frame, so those views take a page screenshot, not the frame pixels.
    if (process.env.SPIRE_PAGE === '1' || view === 'map' || extra.includes('route')) await page.screenshot({ path: file });
    else writeFileSync(file, png(Buffer.from(r.px, 'base64'), r.w, r.h));
    if (r.err || errors.length) failed++;
    console.log(`${r.err || errors.length ? 'ERR ' : 'shot'} b${band} ${view} ${((Date.now() - t0) / 1000).toFixed(1)}s ${file}${r.ms ? ` frame ${JSON.stringify(r.ms)}` : ''}${r.stats ? ` ${JSON.stringify(r.stats)}` : ''}${r.err ? ` ${r.err}` : ''}${errors.length ? ` ${errors.slice(0, 3).join(' | ')}` : ''}`);
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
