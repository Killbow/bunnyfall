// Probe: spawns an Archer and a Mage in the exterior world and checks that the archer fires and the mage casts.
// Waits count frames, since a software renderer runs at a few frames per second.
// Run: node tools/x23Probe.mjs (BOOT_WAIT sets the boot wait in milliseconds).
import { createServer } from 'vite';
import { chromium } from 'playwright';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
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
page.on('response', (r) => { if (r.status() === 404) errors.push(`[404] ${r.url()}`); });

await page.goto('http://localhost:5213/play/?world&nomenu&class=0&novideo&shot&play');
await page.waitForTimeout(Number(process.env.BOOT_WAIT ?? 15000));

const frame = () => page.evaluate(() => window.__frame ?? 0);
const waitFrames = async (n, cond = null, capMs = 240000) => {
  const f0 = await frame();
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > capMs) return false;
    const f = await frame();
    if (cond) { const v = await cond(); if (v) return v; }
    else if (f - f0 >= n) return true;
    await page.waitForTimeout(400);
  }
};

await waitFrames(5, async () => page.evaluate(() => !!window.__x23 && !!window.__spawnEncounter));
const x23 = async () => JSON.parse(await page.evaluate(() => window.__x23()));

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) fails++; };

const archerType = await page.evaluate(() => window.__spawnEncounter(141, 15));
check(archerType === 141, `archer spawned (type ${archerType})`);
let s = await x23();
const archer = s.foes.find((f) => f.type === 141);
check(!!archer && archer.bow === true, `the archer ARMS as a bow foe (bow=${archer?.bow})`);

const sawArrow = await waitFrames(0, async () => {
  const st = await x23();
  return st.enemyArrows > 0 ? st : null;
});
check(!!sawArrow, `an enemy arrow FLEW (enemyArrows=${sawArrow ? sawArrow.enemyArrows : 0})`);

// The Mage's spells are all ranged, so it never casts in melee, and it notices the player only within hearing.
// It spawns at 20 units, inside hearing range, so the cast window is its approach.
const mageType = await page.evaluate(() => window.__spawnEncounter(128, 20));
check(mageType === 128, `mage spawned (type ${mageType})`);
s = await x23();
const mage = s.foes.find((f) => f.type === 128);
check(!!mage && mage.caster === true && mage.spells > 0,
  `the mage MINTS a caster with a spell list (caster=${mage?.caster}, spells=${mage?.spells})`);
const mp0 = mage?.mp ?? 0;

// A self or area release has no missile, so a drop in the mage's magicka also counts as a cast.
let retried = false;
const sawCast = await waitFrames(0, async () => {
  const st = await x23();
  const mages = st.foes.filter((f) => f.type === 128);
  if (!mages.length) return null;
  if (st.missiles > 0) return { via: 'missile', st };
  if (mages.some((m) => (m.mp ?? 0) < mp0)) return { via: 'magicka-spend', st };
  // A mage that reaches melee without casting never casts, so one more spawns once.
  if (!retried && mages.every((m) => m.dist < 7)) {
    retried = true;
    await page.evaluate(() => window.__spawnEncounter(128, 20));
  }
  return null;
});
if (!sawCast) {
  const st = await x23();
  console.log('  [diag] final state:', JSON.stringify(st.foes.find((f) => f.type === 128)), 'missiles:', st.missiles);
}
check(!!sawCast, `the mage RELEASED a cast (${sawCast ? sawCast.via : 'nothing in the window'})`);

// CURSOR.IMG may be missing from this ARENA2 set; the game handles that, so its 404 is not an error.
const realErrors = errors.filter((e) => !/CURSOR\.IMG|Failed to load resource/.test(e));
check(realErrors.length === 0, realErrors.length ? `page errors: ${realErrors.slice(0, 3).join(' | ')}` : 'zero page errors (the guarded CURSOR.IMG 404 filtered)');

await browser.close();
await server.close();
console.log(fails === 0 ? 'X2/X3 LIVE PROBE: ALL GREEN' : `X2/X3 LIVE PROBE: ${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
