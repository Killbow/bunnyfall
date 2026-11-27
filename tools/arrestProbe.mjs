// Drives a crime through guard pursuit, surrender, and the court, and checks that the crime clears
// and legal reputation drops.
// Run with `node tools/arrestProbe.mjs`.
import { createServer } from 'vite';
import { chromium } from 'playwright';
const server = await createServer({ root: '/home/user/project-dagger', server: { port: 5199, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
// `class=16` skips character creation, whose overlay would otherwise take every key press below.
await page.goto('http://localhost:5199/play/?shot&play&exterior&time=12:00&class=16');
await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 180000 });
await new Promise((r) => setTimeout(r, 10000));
await page.evaluate(() => { window.__playerEntity.crimeCommitted = 'Pickpocketing'; window.__crime(); });
await page.waitForFunction(() => JSON.parse(window.__guards()).length > 0, null, { timeout: 60000 });
console.log('guards:', await page.evaluate(() => window.__guards()));
const g0 = JSON.parse(await page.evaluate(() => window.__guards()))[0];
await page.evaluate(([x, y, z]) => window.__pose(x, y, z, Math.PI, 0), [g0.pos[0], g0.pos[1] + 0.1, g0.pos[2] + 1.6]);
const opened = await page.waitForFunction(() => JSON.parse(window.__talk()).overlay === true, null, { timeout: 300000 })
  .then(() => true).catch(() => false);
console.log('surrender box opened:', opened, 'hp:', await page.evaluate(() => window.__playerEntity.health));
if (!opened) { console.log('NO SURRENDER BOX'); process.exit(1); }
await page.screenshot({ path: '/home/claude/arrest-surrender.png' });
const waitFrames = async (n) => {
  const f = await page.evaluate(() => window.__frame);
  await page.waitForFunction(([f0, k]) => window.__frame > f0 + k, [f, n], { timeout: 60000 });
};
const press = async (code) => { await page.keyboard.down(code); await waitFrames(3); await page.keyboard.up(code); await waitFrames(2); };
const die = (why, detail) => {
  console.log(`FAIL: ${why}${detail !== undefined ? ` - ${detail}` : ''}`);
  process.exitCode = 1;
};
const talk = async () => JSON.parse(await page.evaluate(() => window.__talk()));

await press('KeyY');
const court = await talk();
console.log('after Y (court):', JSON.stringify(court), 'hp:', await page.evaluate(() => window.__playerEntity.health));
await page.screenshot({ path: '/home/claude/arrest-court.png' });
if (!court.overlay) die('surrendering opened no court panel', JSON.stringify(court));
if (!/accused of the crime/i.test(court.overlayText ?? '')) {
  die('the panel is not the court - it never states the charge', JSON.stringify(court.overlayText));
}
const pleas = (court.overlayOptions ?? []).join(' ');
if (!/guilty/i.test(pleas)) die('the court offered no plea', JSON.stringify(court.overlayOptions));

await press('KeyG');
const sentence = await talk();
console.log('after G:', JSON.stringify(sentence));
if (!/prison|free to go|banish|execut/i.test(sentence.overlayText ?? '')) {
  die('pleading guilty produced no sentence', JSON.stringify(sentence.overlayText));
}

await press('KeyE');
const crime = await page.evaluate(() => window.__playerEntity.crimeCommitted);
const legalRep = JSON.parse(await page.evaluate(() => JSON.stringify(window.__playerEntity.legalRep ?? {})));
const guards = JSON.parse(await page.evaluate(() => window.__guards()));
console.log('final: crime =', crime, 'legalRep =', JSON.stringify(legalRep), 'guards =', JSON.stringify(guards));
if (crime) die('the crime survived the sentence', crime);
const reps = Object.values(legalRep);
if (!reps.length) die('the conviction moved no legal reputation', JSON.stringify(legalRep));
else if (!reps.some((v) => v < 0)) die('the conviction did not COST reputation', JSON.stringify(legalRep));

if (!process.exitCode) console.log('\nARREST OK: surrender opens the court, a guilty plea is sentenced, and the crime is discharged at a price');
await browser.close(); await server.close();
