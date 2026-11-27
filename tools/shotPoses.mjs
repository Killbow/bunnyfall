// Takes one screenshot per camera pose in a single boot; poses.json holds [[x, y, z, yaw, pitch], ...].
// Usage: ARENA2_PATH=<dir> SHOT_QUERY=<query> node tools/shotPoses.mjs <poses.json> [out-prefix]

import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const [posesPath, prefix = '/tmp/pose'] = process.argv.slice(2);
if (!posesPath) { console.error('usage: node tools/shotPoses.mjs <poses.json> <out-prefix>'); process.exit(1); }
const poses = JSON.parse(readFileSync(posesPath, 'utf8'));
const query = process.env.SHOT_QUERY || 'shot&exterior';
const timeout = Number(process.env.SHOT_TIMEOUT || 240000);
const settleFrames = Number(process.env.SHOT_FRAMES || 4);

const server = await createServer({ server: { port: 5198, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ headless: true, args: ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--use-gl=angle', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: Number(process.env.SHOT_W || 1100), height: Number(process.env.SHOT_H || 700) } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://localhost:5198/play/?${query}`);
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout });
  for (let i = 0; i < poses.length; i++) {
    await page.evaluate((p) => window.__pose(...p), poses[i]);
    const start = await page.evaluate(() => window.__frame ?? null);
    if (start != null) await page.waitForFunction((n) => (window.__frame ?? 0) >= n, start + settleFrames, { timeout });
    else await page.waitForTimeout(1500);
    const out = `${prefix}${i}.png`;
    await page.screenshot({ path: out });
    console.log('pose', i, JSON.stringify(poses[i]), '->', out);
  }
} finally {
  await browser.close();
  await server.close();
}
