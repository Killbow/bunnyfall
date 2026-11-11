// Headless proof of the World Builder foundation (Milestone 2): boots the editor's own Vite server,
// drives it in Chromium, and fails on any console error or page error.
//   ARENA2_PATH=... node tools/poiEditorProbe.mjs [screenshot.png]
// Without ARENA2_PATH the checks that need the game's models are skipped and said so.

import { createServer } from 'vite';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const HERE = dirname(fileURLToPath(import.meta.url));
const shot = process.argv[2] || '/tmp/poi-editor.png';
const haveGame = !!process.env.ARENA2_PATH;
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? `  (${extra})` : ''}`); };

const server = await createServer({ configFile: join(HERE, 'poi-editor', 'vite.config.js'), server: { port: 5181, strictPort: true }, logLevel: 'error' });
await server.listen();
const exe = process.env.CHROME_PATH || undefined;
const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
page.on('response', (r) => { if (r.status() >= 400 && (haveGame || !r.url().includes('/arena2/'))) errors.push(`http ${r.status()}: ${r.url()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

try {
  await page.goto('http://localhost:5181/editor.html');
  await page.waitForFunction(() => window.__builder?.catalogue, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const total = await page.evaluate(() => window.__builder.catalogue.assets.length);
  check('catalogue loads', total > 10000, `${total} assets`);
  check('asset cards are drawn (virtual grid)', (await page.locator('.card').count()) > 5 && (await page.locator('.card').count()) < 200);

  // search and filter
  await page.fill('.filters input[type=search]', 'orc');
  await page.waitForTimeout(200);
  const orcs = await page.evaluate(() => document.querySelectorAll('.card').length);
  check('search narrows the grid', orcs > 0 && orcs < 100, `${orcs} cards`);
  await page.fill('.filters input[type=search]', '');

  // new POI through the dialog
  await page.click('.menu >> text=File');
  await page.click('.items >> text=New POI...');
  await page.fill('.dialog input[type=text]', 'Probe POI');
  await page.click('.dialog button.on');
  await page.waitForFunction(() => window.__builder.getDoc() !== null);
  check('new POI opens as v2 draft', await page.evaluate(() => window.__builder.getDoc().v === 2 && window.__builder.edit.entryOf(window.__builder.S.docId).state === 'new'));
  await page.waitForTimeout(200);
  check('badge says draft, not saved', (await page.locator('.badge').innerText()).includes('NOT SAVED'));

  if (haveGame) {
    // place a model by double-clicking its card
    await page.fill('.filters input[type=search]', 'model 44010');
    await page.waitForTimeout(300);
    await page.dblclick('.card >> nth=0');
    await page.waitForFunction(() => window.__builder.getDoc().parts.length === 1);
    check('double-click places a model', true);
    await page.waitForTimeout(1500);
    const lit = await page.evaluate(() => { const c = document.querySelector('#viewport-gl'); const g = document.createElement('canvas'); g.width = c.width; g.height = c.height; const x = g.getContext('2d'); x.drawImage(c, 0, 0); const d = x.getImageData(0, 0, g.width, g.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 33) + Math.abs(d[i + 1] - 36) + Math.abs(d[i + 2] - 43) > 40) n++; return n; });
    check('viewport draws the model', lit > 2000, `${lit} non-background pixels`);
    // pick it by clicking the middle of the viewport
    await page.evaluate(() => { window.__builder.S.sel.length = 0; window.__builder.viewport.frameSelection(); });
    const box = await page.locator('#viewport-gl').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(300);
    check('clicking the model selects it', (await page.evaluate(() => window.__builder.S.sel)).length === 1);
    await page.screenshot({ path: shot.replace('.png', '-model.png') });
    await page.evaluate(() => window.__builder.A.camera('top')); await page.waitForTimeout(300);
    await page.screenshot({ path: shot.replace('.png', '-top.png') });
    await page.evaluate(() => window.__builder.A.camera('persp'));
  } else {
    await page.evaluate(() => { const b = window.__builder; b.edit.edit(b.S.docId, 'probe part', (d) => { d.parts.push({ key: 'box', name: 'Box', arch3d: 44010, t: [0, 0, 0], r: [0, 0, 0, 1], s: [1, 1, 1], collide: 'mesh', shadow: true }); }); b.S.sel = ['part:box']; });
    console.log('skip: the game files are not set, so the model is added to the document without drawing it');
  }

  // inspector numeric entry, undo, redo
  await page.evaluate(() => { const b = window.__builder; b.S.sel = [`part:${b.getDoc().parts[0].key}`]; });
  await page.waitForTimeout(300);
  const posInput = page.locator('.vec input').first();
  await posInput.fill('3.5'); await posInput.press('Enter'); await posInput.blur();
  await page.waitForTimeout(200);
  check('inspector sets position', (await page.evaluate(() => window.__builder.getDoc().parts[0].t[0])) === 3.5);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
  check('undo restores it', (await page.evaluate(() => window.__builder.getDoc().parts[0].t[0])) === 0);
  await page.keyboard.press('Control+Shift+z'); await page.waitForTimeout(150);
  check('redo reapplies it', (await page.evaluate(() => window.__builder.getDoc().parts[0].t[0])) === 3.5);

  // clipboard, duplicate, group, delete
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Control+d'); await page.waitForTimeout(200);
  check('Ctrl+D duplicates', (await page.evaluate(() => window.__builder.getDoc().parts.length)) === 2);
  await page.keyboard.press('Control+c'); await page.waitForTimeout(150);
  await page.keyboard.press('Control+v'); await page.waitForTimeout(300);
  check('copy and paste add a third', (await page.evaluate(() => window.__builder.getDoc().parts.length)) === 3);
  await page.evaluate(() => window.__builder.A.selectAll());
  await page.keyboard.press('Control+g'); await page.waitForTimeout(200);
  check('Ctrl+G groups the selection', await page.evaluate(() => { const d = window.__builder.getDoc(); return d.groups.length === 1 && d.parts.every((p) => p.group === d.groups[0].key); }));
  check('hierarchy shows the group and three rows', (await page.locator('.tree .row').count()) === 4);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
  check('undo ungroups', (await page.evaluate(() => window.__builder.getDoc().groups.length)) === 0);
  await page.evaluate(() => window.__builder.A.selectAll());
  await page.keyboard.press('Delete'); await page.waitForTimeout(200);
  check('Delete removes the selection', (await page.evaluate(() => window.__builder.getDoc().parts.length)) === 0);
  for (let i = 0; i < 12; i++) await page.keyboard.press('Control+z');
  check('undo history reaches back', (await page.evaluate(() => window.__builder.getDoc())) !== null);

  // problems panel and environment
  check('problems tab lists the law', (await page.locator('.tabs .tab.on').innerText()).startsWith('Problems'));
  await page.selectOption('.toolbar select[title=Server]', 'production');
  check('environment selector switches server', (await page.evaluate(() => window.__builder.api.environment().base)) === 'https://dagg.campfirerp.com');
  await page.selectOption('.toolbar select[title=Server]', 'local');

  await page.screenshot({ path: shot });
  console.log(`screenshot: ${shot}`);
} catch (e) {
  check(`probe ran to the end: ${e.message.split('\n')[0]}`, false);
  await page.screenshot({ path: shot }).catch(() => {});
}
check('no console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close(); await server.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed} of ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
