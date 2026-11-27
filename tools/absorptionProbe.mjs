// Checks that a Sorcerer absorbs a real Destruction spell applied through `applySpellToPlayer`,
// and absorbs nothing with a full pool.
// Run with `node tools/absorptionProbe.mjs`.
import { createServer } from 'vite';
import { chromium } from 'playwright';
const server = await createServer({ root: '/home/user/project-dagger', server: { port: 5208, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => { console.log('[pageerror]', e.message); process.exitCode = 1; });
await page.goto('http://localhost:5208/play/?shot&class=3');
await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 240000 });
await page.waitForFunction(() => window.__combat?.applySpellToPlayer && window.__playerEntity, null, { timeout: 60000 });
const die = (m, x) => { console.log('FAIL:', m, x ?? ''); process.exit(1); };

const info = await page.evaluate(() => {
  const e = window.__playerEntity;
  return { career: e.career?.name, absorb: e.career?.spellAbsorptionFlags, maxMagicka: e.maxMagicka, magicka: e.magicka, health: e.health };
});
console.log('career:', info.career, '| spellAbsorptionFlags:', info.absorb, '| magicka', info.magicka + '/' + info.maxMagicka);
if (info.career !== 'Sorcerer') die('THE HEADLESS SKIP DID NOT MAKE A SORCERER', info.career);
if (info.absorb !== 4) die('THE SORCERER DOES NOT CARRY absorb=Always', info.absorb);

const result = await page.evaluate(() => {
  const e = window.__playerEntity;
  e.magicka = 0;
  const before = { health: e.health, magicka: e.magicka };
  const spell = window.__spells?.() ?? null;
  const rec = spell ?? { element: 0, rangeType: 2, effects: [{
    type: 4, subType: 0, magnitudeBaseLow: 20, magnitudeBaseHigh: 20,
    magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 1,
    durationBase: 0, durationMod: 0, durationPerLevel: 1,
    chanceBase: 0, chanceMod: 0, chancePerLevel: 1 }] };
  const r = window.__combat.applySpellToPlayer(rec, 5, { name: 'a foe' });
  return { before, after: { health: e.health, magicka: e.magicka }, r };
});
console.log('before:', JSON.stringify(result.before));
console.log('after :', JSON.stringify(result.after));
console.log('result:', JSON.stringify(result.r));
if (result.after.health !== result.before.health) die('THE SORCERER TOOK DAMAGE FROM AN ABSORBED BOLT', `${result.before.health} -> ${result.after.health}`);
if (!(result.after.magicka > result.before.magicka)) die('NO SPELL POINTS WERE CREDITED', JSON.stringify(result.after));
console.log(`absorbed ${result.after.magicka - result.before.magicka} spell points, took 0 damage`);

const full = await page.evaluate(() => {
  const e = window.__playerEntity;
  e.magicka = e.maxMagicka;
  const h0 = e.health;
  const rec = { element: 0, rangeType: 2, effects: [{
    type: 4, subType: 0, magnitudeBaseLow: 20, magnitudeBaseHigh: 20,
    magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 1,
    durationBase: 0, durationMod: 0, durationPerLevel: 1,
    chanceBase: 0, chanceMod: 0, chancePerLevel: 1 }] };
  const r = window.__combat.applySpellToPlayer(rec, 5, { name: 'a foe' });
  return { h0, h1: e.health, magicka: e.magicka, maxMagicka: e.maxMagicka, r };
});
console.log('full pool:', JSON.stringify(full));
// Assert only on absorption: whether the bolt then deals damage depends on the saving throw.
if (full.r.absorbed) die('A FULL-POOL SORCERER ABSORBED ANYWAY', JSON.stringify(full.r));
// maxMagicka is rolled from INT at character creation, so compare against the entity's own value.
if (full.magicka !== full.maxMagicka) die('THE POOL MOVED WITH NO ROOM TO ABSORB INTO', `${full.magicka}/${full.maxMagicka}`);
console.log('with a full pool nothing is absorbed - the spell goes to the saving throw instead');

console.log('\nS24 PROBE PASSED: the Sorcerer absorbs, and only while it has room.');
await browser.close();
await server.close();
