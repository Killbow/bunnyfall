// Drives the classic spellbook window in a real browser: open, select, swap, sort, rename, delete, and ready.
// Every wait counts frames through window.__frame, since SwiftShader runs at a few fps.
// Usage: node tools/spellbookProbe.mjs [world|exterior]

import { createServer } from 'vite';
import { chromium } from 'playwright';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const which = process.argv[2] || 'world';
// &shot installs the probe hooks but turns off walk mode on exterior pages, and &play turns it back on.
const QUERIES = {
  world: 'world&nomenu&class=1&novideo&shot&play',
  exterior: 'exterior&nomenu&class=1&novideo&shot&play',
};
const server = await createServer({ server: { port: 5213, strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });

await page.goto(`http://localhost:5213/play/?${QUERIES[which]}`);
await page.waitForTimeout(Number(process.env.BOOT_WAIT ?? 12000));
await page.mouse.click(640, 400);
await page.waitForTimeout(800);

const out = { which, steps: {} };
const book = () => page.evaluate(() => (window.__spellbook ? JSON.parse(window.__spellbook()) : null));
const spells = () => page.evaluate(() => (window.__playerEntity?.spells ?? []).map((s) => s.name));
const magic = () => page.evaluate(() => (window.__magic ? JSON.parse(window.__magic()) : null));
const frames = async (n, cap = 20000) => {
  const f0 = await page.evaluate(() => window.__frame ?? 0);
  const t0 = Date.now();
  while (Date.now() - t0 < cap) {
    await page.waitForTimeout(150);
    if (await page.evaluate(() => window.__frame ?? 0) >= f0 + n) break;
  }
};
const until = async (pred, n = 40) => {
  for (let i = 0; i < n; i++) {
    const b = await book();
    if (pred(b)) return b;
    await frames(1);
  }
  return book();
};

const metrics = await page.evaluate(() => {
  const s = Math.max(1, Math.floor(Math.min(window.innerWidth / 320, window.innerHeight / 200)));
  return { s, ox: Math.floor((window.innerWidth - 320 * s) / 2), oy: Math.floor((window.innerHeight - 200 * s) / 2) };
});
const RECTS = {
  deleteOrBuy: [3, 152, 38, 9], up: [48, 152, 38, 9], sort: [90, 152, 38, 9], down: [132, 152, 38, 9],
  upArrow: [121, 11, 9, 16], downArrow: [121, 132, 9, 16], exit: [216, 149, 43, 15],
  name: [123, 2, 110, 10],
};
const clickRect = async (key) => {
  const [rx, ry, rw, rh] = RECTS[key];
  await page.mouse.click(metrics.ox + Math.round((30.5 + rx + rw / 2) * metrics.s),
    metrics.oy + Math.round((18 + ry + rh / 2) * metrics.s));
  await frames(1);
};

// The quest boot boxes take the keyboard until they are dismissed.
for (let i = 0, quiet = 0; i < 30 && quiet < 2; i++) {
  const up = await page.evaluate(() => JSON.parse(window.__talk()).overlay);
  if (up) { quiet = 0; await page.keyboard.press('Escape'); } else quiet++;
  await frames(2);
}

await page.keyboard.press('Backspace');
const opened = await until((b) => b && b.rows.length > 0);
out.steps.opened = opened && {
  rows: opened.rows.length, selected: opened.selected, name: opened.name,
  effects: opened.effects[0], buyMode: opened.buyMode,
};

const before = await spells();
await clickRect('downArrow');
const stepped = await until((b) => b && b.selected === 1);
out.steps.arrowSelects = stepped && {
  selected: stepped.selected, name: stepped.name, orderUnchanged: (await spells()).join('|') === before.join('|'),
};

await clickRect('up');
out.steps.swapped = { before: before.slice(0, 3), after: (await spells()).slice(0, 3), selected: (await book())?.selected };

await clickRect('sort');
const prompted = await until((b) => b && b.top === 'sort');
out.steps.sortPrompt = prompted?.top ?? null;
// Yes on Sort closes the book, as in classic Daggerfall.
await page.keyboard.press('y');
await frames(2);
out.steps.sortedClosedTheBook = (await book()) === null;
out.steps.sortedOrder = (await spells()).slice(0, 4);

await page.keyboard.press('Backspace');
await until((b) => b && b.rows.length > 0);
await clickRect('name');
const renaming = await until((b) => b && b.top === 'rename');
out.steps.renamePrompt = renaming?.top ?? null;
if (renaming?.top === 'rename') {
  await page.keyboard.type('Probe Spell');
  await page.keyboard.press('Enter');
  await frames(2);
  out.steps.renamed = (await spells())[0];
  await page.keyboard.press('Escape');
  await frames(2);
  await page.keyboard.press('F9');
  await frames(3);
  await page.keyboard.press('F11');
  await frames(6);
  out.steps.renameSurvivedSave = (await spells())[0];
}

await page.keyboard.press('Backspace');
await until((b) => b && b.rows.length > 0);
const preDelete = await spells();
await clickRect('deleteOrBuy');
out.steps.deletePrompt = (await until((b) => b && b.top === 'delete'))?.top ?? null;
await page.keyboard.press('y');
await frames(2);
out.steps.deleted = { before: preDelete.length, after: (await spells()).length, closed: (await book()) === null };

await page.keyboard.press('Backspace');
await until((b) => b && b.rows.length > 0);
await page.keyboard.press('Enter');
await frames(2);
out.steps.readied = (await magic())?.readied ?? null;
out.steps.bookClosedOnReady = (await book()) === null;

out.errors = errors;
out.ok = !!(out.steps.opened?.rows
  && out.steps.arrowSelects?.orderUnchanged
  && out.steps.sortPrompt === 'sort'
  && out.steps.sortedClosedTheBook
  && out.steps.deleted?.after === out.steps.deleted?.before - 1
  && out.steps.deleted?.closed
  && out.steps.readied
  && out.steps.bookClosedOnReady
  && errors.length === 0);
console.log(JSON.stringify(out, null, 2));

await browser.close();
await server.close();
process.exit(out.ok ? 0 : 1);
