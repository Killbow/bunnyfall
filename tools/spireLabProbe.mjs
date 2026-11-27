// Shoots each view of each Spire band in the lab page and checks the lighting, edge line, sky, mist, and palettes.
// Usage: node tools/spireLabProbe.mjs [bands]
// Env: SPIRE_SHOTS, SPIRE_PORT, SPIRE_W, SPIRE_H, and SPIRE_ONLY (views, edge, sky, mist, or palettes).

import { createServer } from 'vite';
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { EG_EDGE_LINE } from '../src/world/eliteGates/egLook.js';
import { EG_DANGER_PALETTES } from '../src/ui/eliteGates/egAccess.js';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const shots = process.env.SPIRE_SHOTS ?? '/tmp';
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); };
const port = Number(process.env.SPIRE_PORT ?? 5243);
const server = await createServer({ server: { port, strictPort: true, watch: { ignored: ['**/.claude/**'] } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.SPIRE_W ?? 960), height: Number(process.env.SPIRE_H ?? 540) } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
function png(rgba, w, h) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, (h - 1 - y) * w * 4, (h - y) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
async function shot(name, query, probe = null) {
  errors.length = 0;
  await page.goto(`http://127.0.0.1:${port}/spire.html?still&nopanel&frames=4&${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => (window.__frame ?? 0) >= 4, null, { timeout: 600000, polling: 500 });
  const r = await page.evaluate((src) => {
    const c = document.getElementById('c'), gl = c.getContext('webgl2');
    const w = c.width, h = c.height, px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let lit = 0;
    for (let i = 0; i < px.length; i += 4) if ((px[i] + px[i + 1] + px[i + 2]) / 3 > 12) lit++;
    // eslint-disable-next-line no-new-func
    const extra = src ? new Function('px', 'w', 'h', src)(px, w, h) : null;
    let bin = ''; for (let i = 0; i < px.length; i += 0x8000) bin += String.fromCharCode(...px.subarray(i, i + 0x8000));
    return { lit: lit / (w * h), glError: gl.getError(), extra, batch: window.__lab.batch(), look: window.__lab.look(), lab: { circle: window.__lab.circle, band: window.__lab.band, hall: window.__lab.hall }, w, h, px: btoa(bin) };
  }, probe);
  const file = `${shots}/spire-${name}.png`;
  const rgba = Buffer.from(r.px, 'base64');
  writeFileSync(file, png(rgba, r.w, r.h));
  delete r.px;
  return { ...r, rgba, file, errors: [...errors] };
}
const SKY_SRC = `let dark = 0, n = 0, sum = 0; for (let y = Math.floor(h * 0.75); y < h; y++) for (let x = Math.floor(w * 0.3); x < Math.floor(w * 0.7); x++) { const i = (y * w + x) * 4, l = (px[i] + px[i + 1] + px[i + 2]) / 3; n++; sum += l; if (l < 8) dark++; } let lo = 0, m = 0; for (let y = Math.floor(h * 0.5); y < Math.floor(h * 0.62); y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; m++; lo += (px[i] + px[i + 1] + px[i + 2]) / 3; } let lit = 0; for (let i = 0; i < px.length; i += 4) if (Math.max(px[i], px[i + 1], px[i + 2]) > 12) lit++; return { dark: dark / n, top: sum / n, mid: lo / m, lit: lit / (w * h) };`;
const MIST_SRC = `let pale = 0, n = 0; for (let y = Math.floor(h * 0.2); y < Math.floor(h * 0.6); y++) for (let x = Math.floor(w * 0.3); x < Math.floor(w * 0.7); x++) { const i = (y * w + x) * 4, r = px[i], g = px[i + 1], b = px[i + 2]; n++; if (r > 40 && Math.abs(r - g) < 22 && b >= r - 6) pale++; } return pale / n;`;
const hueSat = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return [0, 0]; const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, d / mx]; };
const inHue = (a, b, hue) => { let n = 0; for (let i = 0; i < a.length; i += 4) { if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) <= 40) continue; const [h, s] = hueSat(a[i], a[i + 1], a[i + 2]), dh = Math.abs(((h - hue + 540) % 360) - 180); if (s > 0.3 && dh <= 24) n++; } return n; };
const LINE_HUE = hueSat(...EG_EDGE_LINE.color)[0];
const lineGold = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) { if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) <= 24) continue; const [h, sat] = hueSat(a[i], a[i + 1], a[i + 2]), dh = Math.abs(((h - LINE_HUE + 540) % 360) - 180); if (sat > 0.4 && dh <= 20 && a[i] > 30) n++; } return n; };
const LIT_MIN = [0.03, 0.03, 0.01, 0.03];
const bands = process.argv.slice(2).map(Number).filter((b) => b >= 0 && b <= 3);
const only = process.env.SPIRE_ONLY ?? '', part = (p) => !only || only === p;
try {
  for (const band of bands.length ? bands : [0, 1, 2, 3]) {
    for (const view of part('views') ? ['plate', 'course', 'court', 'over'] : []) {
      const s = await shot(`b${band}-${view}`, `band=${band}&view=${view}&t=40`);
      check(`band ${band} ${view}`, !s.errors.length && s.glError === 0 && s.lit > LIT_MIN[band], `${s.file} lit ${(s.lit * 100).toFixed(1)}% circle ${s.lab.circle}${s.errors.length ? ` errors: ${s.errors.slice(0, 3).join(' | ')}` : ''}`);
      if (view === 'plate') check(`band ${band}: the pieces in a handful of draws, the other halls culled from the plate`, s.batch && s.batch.kinds <= 16 && s.batch.culled > 0, JSON.stringify(s.batch));
    }
    if (part('edge')) {
      const e = await shot(`b${band}-lines`, `band=${band}&view=over&t=40&shape=off`), e0 = await shot(`b${band}-lines-bare`, `band=${band}&view=over&t=40&shape=off&lines=off`), gold = lineGold(e.rgba, e0.rgba);
      check(`band ${band}: THE EDGE LINE's gold round the circle's rims`, e.glError === 0 && gold > 40 && e.look.edges > 0, `${e.file} ${gold} gold pixels the line pass drew, ${e.look.edges} segments`);
    }
    if (part('sky')) {
      const k = await shot(`b${band}-sky`, `band=${band}&view=sky&t=40&shape=off`, SKY_SRC);
      check(`band ${band}: the band's void overhead, its realm drawn`, k.glError === 0 && k.extra.dark > 0.5 && k.extra.top <= 12 && k.extra.lit > 0.005, `${k.file} the zenith ${(k.extra.dark * 100).toFixed(1)}% dark, its mean ${k.extra.top.toFixed(1)}, the middle's ${k.extra.mid.toFixed(1)}, ${(k.extra.lit * 100).toFixed(1)}% of the frame lit`);
    }
  }
  if (part('mist')) {
    const m = await shot('mist', 'mist&shape=off', MIST_SRC);
    check('the mist drawn over its shaft', m.glError === 0 && m.extra > 0.08 && m.look.mists > 0, `${m.file} pale ${(m.extra * 100).toFixed(1)}% circle ${m.lab.circle} hall ${m.lab.hall}`);
  }
  if (part('palettes')) {
    const bare = await shot('court-bare', 'band=0&view=court&t=40.75&shape=off');
    for (const pal of Object.keys(EG_DANGER_PALETTES)) {
      const c = await shot(`court-${pal}`, `band=0&view=court&t=40.75&palette=${pal}`), e = EG_DANGER_PALETTES[pal].edge, n = inHue(c.rgba, bare.rgba, hueSat(e[0], e[1], e[2])[0]);
      check(`the danger disc in the ${pal} palette`, c.glError === 0 && n > 60, `${c.file} ${n} pixels in its edge's hue`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(results.every(Boolean) ? 0 : 1);
