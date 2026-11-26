// Checks the rest key live in the ?town page and the world host: the town warning, guard refusal, and clock.

import { createServer } from 'vite';
import { chromium } from 'playwright';

const server = await createServer({ root: '/home/user/project-dagger', server: { port: 5223, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const fail = (m) => { console.log('FAIL:', m); process.exit(1); };

async function boot(query) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message); });
  await page.goto(`http://localhost:5223/play/${query}`);
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 180000 });
  const waitFrames = async (n) => {
    const f = await page.evaluate(() => window.__frame);
    await page.waitForFunction(([f0, k]) => window.__frame > f0 + k, [f, n], { timeout: 60000 });
  };
  // TEXT.RSC rows are { text, center } objects, not strings.
  const talk = async () => {
    const t = JSON.parse(await page.evaluate(() => window.__talk()));
    t.overlayText = typeof t.overlayText === 'string' ? t.overlayText : (t.overlayText?.text ?? null);
    return t;
  };
  // A rest press in mid-air is refused, so the player must land first.
  await waitFrames(40);
  await page.waitForFunction(() => typeof window.__talk === 'function', null, { timeout: 120000 });
  return { page, errors, waitFrames, talk };
}

console.log('== THE ?town PAGE: KeyR IN A CITY STREET ==');
{
  const { page, errors, waitFrames, talk } = await boot('?shot&play&exterior&time=12:00&class=1');
  let t = await talk();
  if (t.overlay) fail('something was already up before the key');

  await page.keyboard.press('r');
  await waitFrames(2);
  t = await talk();
  console.log('first press ->', JSON.stringify({ overlay: t.overlay, rest: t.overlayRest, text: t.overlayText }));
  if (!t.overlay) fail('KeyR did nothing at all - this page still has no rest arm');
  if (t.overlayRest) fail('a town rest must ask first');
  if (!/illegal|camp/i.test(t.overlayText ?? '')) fail(`expected the illegal-camping warning, got ${t.overlayText}`);
  if (await page.evaluate(() => window.__playerEntity.crimeCommitted)) {
    fail('the WARNING must not book the crime; CanRest does that');
  }

  await page.keyboard.press('y');
  await waitFrames(2);
  t = await talk();
  const crime = await page.evaluate(() => window.__playerEntity.crimeCommitted);
  console.log('after Y ->', JSON.stringify({ rest: t.overlayRest, crime }));
  if (!crime) fail('camping in a town is VAGRANCY, and the confirmed press commits it');
  if (!t.overlayRest) fail('and the confirmed press opens the rest window');

  await page.keyboard.press('Escape');
  await waitFrames(2);
  await page.waitForFunction(() => JSON.parse(window.__guards()).length > 0, null, { timeout: 60000 });
  await page.keyboard.press('r');
  await waitFrames(2);
  t = await talk();
  console.log('with the watch out ->', JSON.stringify({ rest: t.overlayRest, text: t.overlayText }));
  if (t.overlayRest) fail('the guards the vagrancy summoned must block this press');
  if (!/enemies/i.test(t.overlayText ?? '')) fail(`expected the enemies line, got ${t.overlayText}`);
  const alert = await page.evaluate(() => !!window.__playerEntity.enemyAlertActive);
  console.log('alert raised by the refusal:', alert);
  if (!alert) fail('the enemy arm must RAISE the alert before it refuses (DaggerfallUI:654-655)');

  await page.keyboard.press('Escape');
  await waitFrames(2);
  await page.evaluate(() => {
    const n = JSON.parse(window.__guards()).length;
    for (let i = 0; i < n; i++) window.__guardDamage(i, 999);
  });
  await waitFrames(4);
  await page.keyboard.press('r');
  await waitFrames(2);
  t = await talk();
  console.log('with the street clear ->', JSON.stringify({ rest: t.overlayRest, text: t.overlayText }));
  if (!/illegal|camp/i.test(t.overlayText ?? '')) fail(`the warning is asked again, got ${t.overlayText}`);
  await page.keyboard.press('y');
  await waitFrames(2);
  t = await talk();
  console.log('after Y ->', JSON.stringify({ overlay: t.overlay, rest: t.overlayRest }));
  if (!t.overlayRest) fail('a player on an empty street must get the rest window');

  if (errors.length) fail(`page errors: ${errors.join(' | ')}`);
  await page.close();
}

console.log('\n== THE WORLD HOST: THE SAME KEY, THE OTHER SCENE ==');
{
  const { page, errors, waitFrames, talk } = await boot('?shot&play&world&time=12:00&class=1');
  // ?class=1 runs the headless chargen; close any overlay it leaves before pressing keys.
  for (let i = 0; i < 6 && (await talk()).overlay; i++) {
    await page.keyboard.press('Escape');
    await waitFrames(2);
  }
  let t = await talk();
  if (t.overlay) fail('could not clear the boot box');
  console.log('standing at:', await page.evaluate(() => window.__travelProbe()));

  await page.keyboard.press('r');
  await waitFrames(2);
  t = await talk();
  console.log('press ->', JSON.stringify({ overlay: t.overlay, rest: t.overlayRest, text: t.overlayText }));
  if (!t.overlay) fail('KeyR did nothing in the world host either');
  if (!/illegal|camp/i.test(t.overlayText ?? '')) fail(`expected the illegal-camping warning, got ${t.overlayText}`);
  await page.keyboard.press('y');
  await waitFrames(2);
  t = await talk();
  if (!(await page.evaluate(() => window.__playerEntity.crimeCommitted))) fail('the world host must book the vagrancy too');
  console.log('after Y ->', JSON.stringify({ rest: t.overlayRest }));
  if (!t.overlayRest) fail('the confirmed press must open the rest window');

  const minutesOf = () => page.evaluate(() => JSON.parse(window.__travelProbe()).minutes);
  const t0 = await minutesOf();
  await page.keyboard.press('l');
  await waitFrames(2);
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  // Wait for a whole rested hour on the clock, so a rest that ticks once and stalls still fails.
  await page.waitForFunction((m0) => JSON.parse(window.__travelProbe()).minutes >= m0 + 60, t0, { timeout: 60000 })
    .catch(() => {});
  const t1 = await minutesOf();
  console.log('clock: %s -> %s (%s classic minutes)', t0, t1, t1 - t0);
  if (!(t1 >= t0 + 60)) fail(`a loitered HOUR moved the world clock ${t1 - t0} minutes`);

  if (errors.length) fail(`page errors: ${errors.join(' | ')}`);
  await page.close();
}

console.log('\nPASS');
await browser.close();
await server.close();
process.exit(0);
