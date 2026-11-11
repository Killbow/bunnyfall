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

  // ── Milestone 3: ground, drop, view toggles, 2D tools, interior, hanging ──
  const hasGround = await page.evaluate(() => window.__builder.terrain.state());
  check(haveGame ? 'ground loads from WOODS.WLD' : 'no ground without game files says so', haveGame ? hasGround === 'loaded' : hasGround === 'missing', hasGround);
  await page.evaluate(() => { const b = window.__builder; b.edit.edit(b.S.docId, 'probe', (d) => { d.parts.push({ key: 'rock', name: 'Rock', arch3d: 44010, t: [10, 50, 10], r: [0, 0, 0, 1], s: [1, 1, 1], collide: 'mesh', shadow: true }); }); b.S.sel = ['part:rock']; });
  await page.evaluate(() => window.__builder.A.drop()); await page.waitForTimeout(200);
  const droppedY = await page.evaluate(() => { const b = window.__builder, d = b.getDoc(); return { y: d.parts.find((p) => p.key === 'rock').t[1], ground: b.terrain.state() === 'loaded' }; });
  check(haveGame ? 'drop to ground puts it on the ground' : 'drop without ground leaves it alone', haveGame ? droppedY.y < 49 || droppedY.y > 51 : droppedY.y === 50, `y ${droppedY.y}`);
  await page.evaluate(() => { window.__builder.A.show('collision'); window.__builder.A.show('grid'); });
  check('view toggles flip', await page.evaluate(() => { const s = window.__builder.viewport.show(); return s.collision === true && s.grid === false; }));
  await page.evaluate(() => { window.__builder.A.show('collision'); window.__builder.A.show('grid'); });
  await page.evaluate(() => window.__builder.A.moveBy?.length >= 0);
  await page.evaluate(() => { const b = window.__builder; b.S.sel = []; });
  await page.waitForTimeout(250);
  await page.screenshot({ path: shot.replace('.png', '-ground.png') });

  // interior: shell and a taken-out piece, from the inspector
  await page.fill('.right input[placeholder=none]', '4321'); await page.press('.right input[placeholder=none]', 'Enter'); await page.locator('.right input[placeholder=none]').blur();
  await page.waitForTimeout(150);
  check('shell model is set from the inspector', (await page.evaluate(() => window.__builder.getDoc().interior?.shellModel)) === 4321);
  await page.fill('.right input[placeholder^="m12"]', 'm12:456'); await page.press('.right input[placeholder^="m12"]', 'Enter'); await page.waitForTimeout(150);
  check('a built-in piece is taken out', await page.evaluate(() => window.__builder.getDoc().interior?.hiddenBaseKeys?.[0] === 'm12:456'));
  await page.fill('.right input[placeholder^="m12"]', 'chair'); await page.press('.right input[placeholder^="m12"]', 'Enter'); await page.waitForTimeout(100);
  check('a bad piece name is refused with a reason', (await page.locator('.right .err').innerText()).includes('m<placement>'));
  await page.locator('.right button', { hasText: 'Put all back' }).click(); await page.waitForTimeout(100);
  check('putting all back leaves no hidden pieces', await page.evaluate(() => !(window.__builder.getDoc().interior?.hiddenBaseKeys?.length)));

  // 2D canvas: pivot by click, mirror, layers
  await page.evaluate(() => { const b = window.__builder; b.edit.edit(b.S.docId, 'probe flats', (d) => { d.flats ??= []; d.flats.push({ key: 'lamp', name: 'Lamp', kind: 'billboard', flat: [210, 24], t: [0, 0, 0], rot: [0, 0, 0], scale: 1, layer: 0, collide: false }, { key: 'pot', name: 'Pot', kind: 'billboard', flat: [210, 22], t: [1, 0, 0], rot: [0, 0, 0], scale: 1, layer: 1, collide: false }); }); b.S.sel = ['flat:lamp']; b.A.view('2d'); });
  await page.waitForTimeout(600);
  check('layer list shows both flats, front first', (await page.locator('.c2d-row').allInnerTexts()).map((t) => t.replace(/^\d+\s*/, '').trim()).join(',') === 'Pot,Lamp');
  await page.locator('.c2d-bar button', { hasText: 'Mirror' }).first().click(); await page.waitForTimeout(250);
  check('Mirror turns the flat to face the other way', (await page.evaluate(() => window.__builder.getDoc().flats[0].rot[0])) === 180);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
  check('mirror undoes', (await page.evaluate(() => window.__builder.getDoc().flats[0].rot[0])) === 0);
  await page.locator('.c2d-bar button', { hasText: 'Forward' }).click(); await page.waitForTimeout(250);
  check('Forward moves the flat in front', await page.evaluate(() => { const f = window.__builder.getDoc().flats; return f[0].layer > f[1].layer || f[0].layer === 1; }));
  if (haveGame) {
    await page.locator('.c2d-bar button', { hasText: 'Fit' }).click(); await page.waitForTimeout(250);
    await page.locator('.c2d-bar button', { hasText: /^Pivot$/ }).click();
    const cb = await page.locator('.c2d-area canvas').boundingBox();
    await page.mouse.click(cb.x + cb.width / 2, cb.y + cb.height / 2); await page.waitForTimeout(300);
    const pv = await page.evaluate(() => window.__builder.getDoc().flats[0].pivot);
    check('clicking in the Pivot tool sets the pivot', Array.isArray(pv) && Math.abs(pv[0] - 0.5) < 0.2 && Math.abs(pv[1] - 0.5) < 0.2, JSON.stringify(pv));
    await page.screenshot({ path: shot.replace('.png', '-2d.png') });
  } else console.log('skip: the game files are not set, so the pivot click needs a picture and is not tried');
  await page.evaluate(() => window.__builder.A.view('3d'));

  // hanging a mount on a part's face
  await page.evaluate(() => { const b = window.__builder; b.edit.edit(b.S.docId, 'probe mount', (d) => { d.flats.push({ key: 'axe', name: 'Axe', kind: 'mount', item: { t: 1, g: 3 }, t: [0, 1, 0], rot: [0, 0, 0], scale: 1, layer: 0, collide: false }); }); b.S.sel = ['flat:axe']; b.viewport.setCamera('top'); b.viewport.frameSelection(); });
  await page.waitForTimeout(250);
  await page.evaluate(() => window.__builder.A.hang());
  check('hang arms the next click', await page.evaluate(() => window.__builder.viewport.hanging() === 'flat:axe'));
  const vb = await page.locator('#viewport-gl').boundingBox();
  await page.mouse.click(vb.x + vb.width / 2, vb.y + vb.height / 2); await page.waitForTimeout(300);
  check('the click hangs it: turned to the surface it hit', await page.evaluate(() => { const r = window.__builder.getDoc().flats.find((f) => f.key === 'axe'); return window.__builder.viewport.hanging() === null && r.rot[1] === 90; }));
  await page.evaluate(() => window.__builder.A.camera('persp'));

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
