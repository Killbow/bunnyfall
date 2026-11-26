import { createServer } from 'vite';
import { chromium } from 'playwright';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const server = await createServer({ server: { port: 5210, strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
// 1280x800 is an exact 4x of the 320x200 virtual screen, with no letterbox.
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
page.on('console', (m) => {
  // A missing resource such as CURSOR.IMG logs a 404 and falls back, so it is not a page error.
  if (m.type() === 'error' && !/status of 404/.test(m.text())) errors.push(`[console] ${m.text()}`);
});

await page.goto('http://localhost:5210/play/?world&nomenu&class=0&novideo&shot&play');
await page.waitForTimeout(Number(process.env.BOOT_WAIT ?? 14000));
await page.mouse.click(640, 400);
await page.waitForTimeout(800);

const frames = async (n, cap = 30000) => {
  const f0 = await page.evaluate(() => window.__frame ?? 0);
  const t0 = Date.now();
  while (Date.now() - t0 < cap) {
    await page.waitForTimeout(150);
    if (await page.evaluate(() => window.__frame ?? 0) >= f0 + n) break;
  }
};
const map = () => page.evaluate(() => JSON.parse(window.__travelMap()));
const until = async (pred, cap = 30000) => {
  const t0 = Date.now();
  for (;;) {
    const st = await map();
    if (pred(st)) return st;
    if (Date.now() - t0 > cap) return st;
    await frames(1, 5000);
  }
};
const clickNative = (x, y) => page.mouse.click(x * 4, y * 4);

const out = { steps: {} };
for (let i = 0, quiet = 0; i < 30 && quiet < 2; i++) {
  const up = await page.evaluate(() => JSON.parse(window.__talk()).overlay);
  if (up) { quiet = 0; await page.keyboard.press('Escape'); } else quiet++;
  await frames(2);
}
out.steps.overlayAfterDrain = await page.evaluate(() => JSON.parse(window.__talk()).overlay);
out.steps.before = await page.evaluate(() => JSON.parse(window.__travelProbe()));
const dest = await page.evaluate(() => JSON.parse(window.__travelNearest()));
out.steps.dest = { name: dest.name, region: dest.region, pixel: dest.pixel };

await page.keyboard.press('v');
await frames(2);
out.steps.opened = await map();

if (!out.steps.opened?.identifying) await clickNative(25, 191);
await page.keyboard.press('Enter');
await frames(1);
let st = await map();
if (!st?.regionSelected) { await clickNative(25, 191); await page.keyboard.press('Enter'); await frames(1); st = await map(); }
out.steps.regionPage = st;

await page.keyboard.press('f');
await frames(1);
for (const c of dest.name) {
  if (c === ' ') await page.keyboard.press('Space');
  else if (/[a-zA-Z0-9'-]/.test(c)) await page.keyboard.press(c);
  await page.waitForTimeout(30);
}
out.steps.typed = await map();
await page.keyboard.press('Enter');
await frames(1);
if ((await map())?.picker) { await page.keyboard.press('Enter'); await frames(1); }
out.steps.found = await map();

out.steps.confirm = await until((s) => s?.top === 'confirm' || s?.popUp, 40000);
if ((await map())?.top === 'confirm') await page.keyboard.press('y');
await frames(1);
out.steps.popUp = await map();
await page.keyboard.press('b');
await frames(8, 60000);
await until((s) => s === null, 60000);
out.steps.after = await page.evaluate(() => JSON.parse(window.__travelProbe()));

const b = out.steps.before, a = out.steps.after;
out.ok = !!(a.minutes > b.minutes
  && (a.pixel.x !== b.pixel.x || a.pixel.y !== b.pixel.y)
  && Math.abs(a.pixel.x - dest.pixel.x) <= 1 && Math.abs(a.pixel.y - dest.pixel.y) <= 1
  && a.gold <= b.gold
  && out.steps.regionPage?.regionSelected
  && out.steps.found?.locationSelected
  && errors.length === 0);
out.minutesAdvanced = a.minutes - b.minutes;
out.errors = errors.slice(0, 8);
console.log(JSON.stringify(out, null, 2));
await browser.close();
await server.close();
process.exit(out.ok ? 0 : 1);
