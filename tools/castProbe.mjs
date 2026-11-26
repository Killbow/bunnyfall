// Casts spells in each host in a real browser: the spellbook, ready-casts, click casts, and missiles.
// Run: node tools/castProbe.mjs [exterior|world|dungeon].

import { createServer } from 'vite';
import { chromium } from 'playwright';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const which = process.argv[2] || 'exterior';
// shot installs the probe hooks but turns off walk mode; play turns it back on.
const QUERIES = {
  exterior: 'exterior&nomenu&class=0&novideo&shot&play',
  world: 'world&nomenu&class=0&novideo&shot&play',
  dungeon: 'nomenu&class=0&novideo&spell=7&shot&play',
};
const server = await createServer({ server: { port: 5209, strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });

await page.goto(`http://localhost:5209/play/?${QUERIES[which]}`);
await page.waitForTimeout(Number(process.env.BOOT_WAIT ?? 12000));
await page.mouse.click(640, 400);
await page.waitForTimeout(800);

const out = { which, steps: {} };
const magic = () => page.evaluate(() => window.__magic ? JSON.parse(window.__magic()) : null);
// SwiftShader runs at a few frames a second with dt clamped at 0.1, so every wait counts rendered frames.
const frames = async (n, cap = 20000) => {
  const f0 = await page.evaluate(() => window.__frame ?? 0);
  const t0 = Date.now();
  while (Date.now() - t0 < cap) {
    await page.waitForTimeout(150);
    if (await page.evaluate(() => window.__frame ?? 0) >= f0 + n) break;
  }
};

if (which === 'dungeon') {
  out.steps.before = { mp: await page.evaluate(() => window.__playerEntity?.magicka ?? null) };
  await page.mouse.move(480, 300);
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(50);
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(120);
  out.steps.after = { mp: await page.evaluate(() => window.__playerEntity?.magicka ?? null) };
  out.ok = out.steps.after.mp != null && out.steps.after.mp < out.steps.before.mp;
} else {
  // The boot message boxes take the keyboard until dismissed; Escape advances a plain box and declines a Yes/No.
  for (let i = 0, quiet = 0; i < 30 && quiet < 2; i++) {
    const up = await page.evaluate(() => JSON.parse(window.__talk()).overlay);
    if (up) { quiet = 0; await page.keyboard.press('Escape'); } else quiet++;
    await frames(2);
  }
  out.steps.boot = await magic();
  await page.keyboard.press('Backspace');
  await frames(2);
  await page.keyboard.press('s');
  await frames(1);
  await page.keyboard.press('y');
  await frames(2);
  out.steps.sortedBook = (await magic())?.book ?? null;
  // The sort's Yes/No closes the spellbook on either answer, so it is opened again.
  await page.keyboard.press('Backspace');
  await frames(2);
  await page.keyboard.press('Enter');
  await frames(2);
  out.steps.readied = await magic();
  const touchRow = ((await magic())?.book ?? []).findIndex((r) => r.range === 1);
  if (touchRow >= 0) {
    await page.keyboard.press('Backspace');
    await frames(2);
    for (let i = 0; i < touchRow; i++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(60); }
    await page.keyboard.press('Enter');
    await frames(2);
    out.steps.touchReadied = await magic();
    await page.mouse.click(640, 400, { button: 'right' });
    await frames(3);
    out.steps.clickWhiff = await magic();
  }
  out.steps.rangedName = await page.evaluate(() => window.__readyRanged());
  await page.evaluate(() => { const [x, y, z] = window.__player.pos; window.__pose(x, y, z, Math.PI, 1.2); });
  await page.mouse.move(480, 300);
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(50);
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(60);
  out.steps.missile = await magic();
  await frames(90, 120000);
  out.steps.retired = await magic();
  await page.evaluate(() => { const [x, y, z] = window.__player.pos; window.__pose(x, y, z, Math.PI, 0); });

  const door = await page.evaluate(async () => {
    const doors = window.__doors?.() ?? [];
    for (const d of doors.slice(0, 6)) {
      window.__pose(d.pos[0] + d.normal[0] * 1.6, d.pos[1] - 1.2, d.pos[2] + d.normal[2] * 1.6,
        Math.atan2(-d.normal[0], -d.normal[2]), -0.1);
      if (await window.__enter()) return { block: d.block, entered: true };
    }
    return doors.length ? { entered: false, tried: Math.min(doors.length, 6) } : null;
  });
  await frames(3);
  out.steps.door = door;
  out.steps.interiorMode = await page.evaluate(() => window.__mode?.() ?? null);
  if (out.steps.interiorMode === 'interior') {
    const pre = await magic();
    await page.keyboard.press('Backspace');
    await frames(2);
    await page.keyboard.press('Enter');
    await frames(2);
    out.steps.interiorCast = await magic();
    out.steps.interiorPreMp = pre.mp;
  }

  const b = out.steps.boot, r = out.steps.readied, m = out.steps.missile;
  const tr = out.steps.touchReadied, cw = out.steps.clickWhiff;
  out.ok = !!(r && r.mp < b.mp
    && tr && tr.armed && tr.mp === r.mp
    && cw && cw.mp === tr.mp && cw.armed
    && m && m.missiles > 0 && m.mp < r.mp
    && out.steps.retired.missiles === 0);
  out.interiorOk = out.steps.interiorMode !== 'interior' ? 'no-door'
    : !!(out.steps.interiorCast && out.steps.interiorCast.mp < out.steps.interiorPreMp
      && out.steps.interiorCast.mode === 'interior');
}

out.errors = errors.slice(0, 8);
console.log(JSON.stringify(out, null, 2));
await browser.close();
await server.close();
process.exit(out.ok ? 0 : 1);
