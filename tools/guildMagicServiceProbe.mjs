// Browser probe for the guild Buy Soulgems and Identify services through the real service flow.
// Run: ARENA2_PATH=... node tools/guildMagicServiceProbe.mjs.
import { createServer } from 'vite';
import { chromium } from 'playwright';

const PORT = 5220;
const server = await createServer({ root: '/home/user/project-dagger', server: { port: PORT, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`http://localhost:${PORT}/play/?shot&play&exterior&time=12:00`);
await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 240000 });

const out = { steps: {}, failures: [] };
const check = (name, ok, detail) => { out.steps[name] = { ok, ...detail }; if (!ok) out.failures.push(name); };
const waitFrames = async (n) => {
  const f = await page.evaluate(() => window.__frame ?? 0);
  await page.waitForFunction(([f0, k]) => (window.__frame ?? 0) > f0 + k, [f, n], { timeout: 60000 });
};
const trade = async () => JSON.parse(await page.evaluate(() => window.__tradeOverlay()) ?? 'null');

const doors = JSON.parse(await page.evaluate(() => JSON.stringify(window.__doors())));
let inside = null;
for (let i = 0; i < doors.length && !inside; i++) {
  const { pos, normal } = doors[i];
  await page.evaluate(([x, y, z, yaw]) => window.__pose(x, y, z, yaw, -0.05),
    [pos[0] + normal[0] * 1.5, pos[1] - 1.2, pos[2] + normal[2] * 1.5, Math.atan2(-normal[0], -normal[2])]);
  if (!await page.evaluate(() => window.__enter())) continue;
  await waitFrames(10);
  inside = JSON.parse(await page.evaluate(() => window.__building()) ?? 'null');
}
check('inside a building', !!inside, { building: inside });
if (!inside) { console.log(JSON.stringify(out, null, 2)); await browser.close(); await server.close(); process.exit(1); }

out.steps.membership = JSON.parse(await page.evaluate(() => window.__joinGuild(undefined, 8)));

{
  await page.evaluate(() => window.__openGuildService('guildServiceBuySoulgems'));
  await waitFrames(4);
  const t = await trade();
  const gems = (t?.remote ?? []).filter((i) => i.soul !== undefined);
  const empty = gems.filter((g) => g.soul === null);
  const filled = gems.filter((g) => g.soul !== null);
  check('X6 window opens in Buy mode', t?.trade === true && t.mode === 'Buy', { mode: t?.mode });
  check('X6 the shelf mints soul gems', gems.length >= 2 && gems.length === (t?.remote ?? []).length,
    { gems: gems.length, remote: t?.remote?.length });
  // The shelf holds trunc(quality / 2) + 2 gems (DFU's inclusive loop), from the quality the window priced with.
  const quality = t?.priceCtx?.quality;
  const expect = Math.trunc((quality ?? 0) / 2) + 2;
  check('X6 shelf size is the inclusive loop', quality != null && gems.length === expect,
    { got: gems.length, expect, quality });
  check('X6 empty gems are a flat 5000', empty.every((g) => g.value === 5000), { empty: empty.length, values: empty.map((g) => g.value).slice(0, 4) });
  check('X6 filled gems price above the empty floor or match a soulless one',
    filled.every((g) => g.value >= 5000), { filled: filled.length, sample: filled.slice(0, 3) });
  out.steps['X6 mix'] = { empty: empty.length, filled: filled.length };

  await page.evaluate(() => window.__closeOverlay?.());
  await waitFrames(2);
  await page.evaluate(() => window.__openGuildService('guildServiceBuySoulgems'));
  await waitFrames(4);
  const again = await trade();
  check('X6 the shelf is stable within one game day',
    JSON.stringify(again?.remote) === JSON.stringify(t?.remote), {});
  await page.evaluate(() => window.__closeOverlay?.());
  await waitFrames(2);
}

{
  await page.evaluate(() => {
    const e = window.__playerEntity;
    e.items = e.items ?? [];
    e.items.push({ group: 'Weapons', templateIndex: 118, value: 1000, stackCount: 1 });
    e.items.push({ group: 'Weapons', templateIndex: 118, value: 1000, stackCount: 1,
      enchantments: [{ type: 0, param: 1 }] });
  });
  await page.evaluate(() => window.__openGuildService('guildServiceIdentify'));
  await waitFrames(4);
  const t = await trade();
  check('X7 window opens in Identify mode', t?.trade === true && t.mode === 'Identify', { mode: t?.mode });
  check('X7 the shelf is empty - the pack is both lists', (t?.remote ?? []).length === 0, { remote: t?.remote?.length });
  out.steps['X7 pack'] = { local: t?.local, cost: t?.cost };
  const staged = await page.evaluate(async () => {
    const tm = await import('/src/trade/tradeModes.js');
    const e = window.__playerEntity;
    const pack = e.items.filter((i) => i.group === 'Weapons' && i.templateIndex === 118);
    return pack.map((it) => ({
      enchanted: !!it.enchantments,
      decision: tm.localClickDecision('Identify', it, {}).kind,
      identified: tm.itemIsIdentified(it),
      cost: tm.calculateItemIdentifyCost(it.value),
    }));
  });
  out.steps['X7 decisions'] = staged;
  const mundane = staged.find((s) => !s.enchanted);
  const magic = staged.find((s) => s.enchanted);
  check('X7 a mundane item is ALWAYS identified and never offered',
    mundane?.identified === true && mundane?.decision === 'refuse', mundane);
  check('X7 an enchanted item is unknown and IS offered',
    magic?.identified === false && magic?.decision === 'stage', magic);
  check('X7 the cost is the shifted formula', magic?.cost === ((25 * 1000) >> 8), { cost: magic?.cost, expect: (25 * 1000) >> 8 });
}

out.pageErrors = pageErrors.slice(0, 6);
console.log(JSON.stringify(out, null, 2));
await browser.close();
await server.close();
process.exit(out.failures.length ? 1 : 0);
