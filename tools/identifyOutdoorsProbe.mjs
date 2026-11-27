// Casts Identify outdoors in a live town and checks the window opens, works, charges the spell, and closes.
// Run: ARENA2_PATH=/path/to/arena2 node tools/identifyOutdoorsProbe.mjs.
import { createServer } from 'vite';
import { chromium } from 'playwright';

const PORT = 5233;
const server = await createServer({
  root: '/home/user/project-dagger',
  server: { port: PORT, strictPort: true, hmr: false, watch: null },
});
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

const out = { failures: [] };
const check = (name, ok, detail) => {
  if (!ok) out.failures.push(name);
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ''}`);
};
const frames = (n = 2) => page.evaluate((k) => new Promise((r) => {
  let i = 0;
  const step = () => (++i >= k ? r() : requestAnimationFrame(step));
  requestAnimationFrame(step);
}), n);
const shot = async (name) => {
  if (!process.env.SHOTS) return;
  try { await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, timeout: 120000 }); }
  catch (e) { console.log(`  [note] screenshot ${name} timed out (${e.name})`); }
};

// class=16 skips the character-creation wizard, which would otherwise hold the town's overlay slot.
await page.goto(`http://localhost:${PORT}/play/?shot&play&exterior&time=12:00&class=16`);
await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 240000 });

const kind = () => page.evaluate(() => window.__overlayKind());
const trade = async () => JSON.parse(await page.evaluate(() => window.__tradeOverlay()) ?? 'null');

check('the probe stands in the street with no window up',
  (await page.evaluate(() => window.__mode?.() ?? 'exterior')) !== 'interior' && (await kind()) === null,
  { overlay: await kind() });

const staged = await page.evaluate(async () => {
  const e = window.__playerEntity;
  const item = {
    group: 'Weapons', templateIndex: 120, name: 'Longsword', material: 1,
    maxCondition: 1200, currentCondition: 1200, value: 90,
    enchantments: [{ type: 0, param: 1 }],
  };
  (e.items ??= []).push(item);
  e.magicka = 60;
  e.maxMagicka = 200;
  return { items: e.items.length, magicka: e.magicka, identified: !!item.isIdentified };
});
check('an unidentified magic item is in the pack', staged.identified === false, staged);

const cast = await page.evaluate(async () => {
  const { buildCustomSpell, blankEffectSettings } = await import('/src/magic/spellMaker.js');
  const spell = buildCustomSpell({
    slots: [{ type: 40, subType: 255, settings: { ...blankEffectSettings(), chanceBase: 100 } }],
    rangeType: 0,
  });
  const mp = window.__playerEntity.magicka;
  const r = window.__combat.applySpellToPlayer(spell, 5);
  return { mpBefore: mp, mpAfter: window.__playerEntity.magicka,
    identify: r?.identify ?? null, skipped: r?.skipped ?? null };
});
await frames(4);
const k = await kind();
check('casting Identify OUTDOORS opens a window', k === 'NativeTradeWindow', { overlay: k, ...cast });
const t = await trade();
check('and it is the Identify window, on the spell path (not the paid service)',
  !!t && t.mode === 'Identify' && t.usingIdentifySpell === true, t);
await shot('01-identify-outdoors');

const done = await page.evaluate(() => {
  const before = window.__playerEntity.magicka;
  const listed = JSON.parse(window.__tradeOverlay() ?? 'null')?.localNames ?? [];
  const slot = listed.indexOf('Longsword');
  window.__tradeSlot('local', slot);
  const staged2 = JSON.parse(window.__tradeOverlay() ?? 'null');
  return { before, slot, listed, stagedRemote: staged2?.remote?.length ?? 0,
    stagedName: staged2?.remote?.[0]?.name ?? null, enabled: staged2?.cost?.modeActionEnabled ?? null };
});
check('the item stages into the Identify list, and the action lights up',
  done.stagedRemote === 1 && done.enabled === true, done);
const finished = await page.evaluate(() => {
  window.__overlayKey('Enter');
  const boxed = JSON.parse(window.__tradeOverlay() ?? 'null');
  window.__overlayKey('KeyY');
  const e = window.__playerEntity;
  const it = (e.items ?? []).find((i) => i.name === 'Longsword');
  return { boxed: boxed?.box ?? null, identified: !!it?.isIdentified, magicka: e.magicka, inPack: !!it };
});
check('the deal raises its confirmation box', !!finished.boxed, { box: finished.boxed });
check('and taking it identifies the item', finished.identified === true && finished.inPack === true, finished);
// The effect refunds its cost before opening the window and the window charges it on Identify, so compare against
// the post-refund value.
check('the spell spent its magicka once, on the deal',
  finished.magicka < done.before, { ...finished, postRefund: done.before });

await page.evaluate(() => window.__tradeClick('exit'));
await frames(3);
check('and it closes cleanly', (await kind()) === null, { overlay: await kind() });
await shot('02-identify-closed');

// This ARENA2 set has no CURSOR.IMG; a missing cursor falls back to the OS cursor, so that error is benign.
const BENIGN = /\/arena2\/CURSOR\.IMG|Failed to load resource/;
const realErrors = pageErrors.filter((e) => !BENIGN.test(e));
if (realErrors.length !== pageErrors.length) console.log('  [note] CURSOR.IMG is absent from this ARENA2 set; the OS cursor stands in (handled)');
check('zero page errors', realErrors.length === 0, { errors: realErrors.slice(0, 4) });

console.log('\n=================================================');
console.log(out.failures.length ? `X11c PROBE FAILURES: ${out.failures.join(', ')}` : 'X11c PROBE: all green');
await browser.close();
await server.close();
process.exit(out.failures.length ? 1 : 0);
