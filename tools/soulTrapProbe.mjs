// Checks Soul Trap end to end in a live dungeon: arming, filling a real gem, and the tether with no empty gem.
// Usage: `ARENA2_PATH=<dir> node tools/soulTrapProbe.mjs`

import { createServer } from 'vite';
import { chromium } from 'playwright';

const PORT = 5221;
const server = await createServer({ root: '/home/user/project-dagger', server: { port: PORT, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`http://localhost:${PORT}/play/?shot&class=0`);
await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 240000 });

const out = { steps: {}, failures: [] };
const check = (name, ok, detail) => { out.steps[name] = { ok, ...detail }; if (!ok) out.failures.push(name); };

out.steps.gems = await page.evaluate(async () => {
  const { stockSoulGems } = await import('/src/trade/shopStock.js');
  const { ENEMY_BASICS } = await import('/src/characters/enemyBasics.js');
  const shelf = stockSoulGems({ quality: 20, gameMinutes: 0 },
    { soulPointsOf: (t) => ENEMY_BASICS[t]?.soulPts ?? 0 });
  const empty = shelf.filter((g) => g.trappedSoulType === null);
  const e = window.__playerEntity;
  e.items = e.items ?? [];
  e.items.push(empty[0]);
  return { minted: shelf.length, emptyOnShelf: empty.length,
    carried: 1, group: empty[0].group, templateIndex: empty[0].templateIndex };
});

const target = await page.evaluate(() => {
  const fs = JSON.parse(window.__foes());
  const i = fs.findIndex((f) => !f.dead && f.type < 128);
  return i < 0 ? null : { i, type: fs[i].type, health: fs[i].health };
});
check('a live monster to trap', !!target, target ?? {});
if (!target) { console.log(JSON.stringify(out, null, 2)); await browser.close(); await server.close(); process.exit(1); }
out.steps.target = target;

const trapSpell = () => page.evaluate(async () => {
  const { buildCustomSpell, blankEffectSettings } = await import('/src/magic/spellMaker.js');
  return buildCustomSpell({ slots: [{ type: 12, subType: 255,
    settings: { ...blankEffectSettings(), durationBase: 30, chanceBase: 100, chanceMod: 0 } }], rangeType: 1 });
});

{
  const sp = await trapSpell();
  const armed = await page.evaluate(async ([spell, i]) => {
    const { applySpell } = await import('/src/magic/effects.js');
    const f = window.__foeRecord(i);
    const r = applySpell(spell, 5, f.entity, {}, () => 0, null, {});
    return { alert: r.trapAlert, kinds: (f.entity.activeEffects ?? []).map((a) => a.kind),
      chance: f.entity.activeEffects?.[0]?.chance };
  }, [sp, target.i]);
  check('X5 the trap arms on a monster', armed.kinds.includes('soulTrap') && armed.alert === 'trapActive', armed);
}

{
  const res = JSON.parse(await page.evaluate(([i]) => window.__damageFoe(i, 9999), [target.i]));
  // The corpse waits on a texture load, so reading it at once would miss it.
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));
  const corpsed = JSON.parse(await page.evaluate(([i]) => JSON.stringify(
    { corpse: !!window.__foeRecord(i)?.corpseBatch }), [target.i]));
  const gem = await page.evaluate(() => {
    const g = window.__playerEntity.items.filter((i) => i.group === 'MiscItems' && i.templateIndex === 274);
    return g.map((x) => ({ soul: x.trappedSoulType, value: x.value }));
  });
  out.steps.afterKill = { foe: res, ...corpsed, gem };
  check('X5 the foe dies once the soul is taken', res.dead === true, res);
  check('X5 a trapped kill is a KILL - it leaves a corpse, unlike a dispel',
    corpsed.corpse === true, corpsed);
  check('X5 the gem holds THAT creature', gem.length === 1 && gem[0].soul === target.type,
    { soul: gem[0]?.soul, expected: target.type });
}

{
  const second = await page.evaluate(() => {
    const fs = JSON.parse(window.__foes());
    const i = fs.findIndex((f) => !f.dead && f.type < 128);
    return i < 0 ? null : { i, type: fs[i].type };
  });
  if (!second) {
    check('X5 the tether', false, { reason: 'no second live monster' });
  } else {
    const sp = await trapSpell();
    await page.evaluate(async ([spell, i]) => {
      const { applySpell } = await import('/src/magic/effects.js');
      applySpell(spell, 5, window.__foeRecord(i).entity, {}, () => 0, null, {});
    }, [sp, second.i]);
    const tethered = JSON.parse(await page.evaluate(([i]) => window.__damageFoe(i, 9999), [second.i]));
    check('X5 no empty gem REFUSES the death', tethered.dead === false && tethered.health === 1,
      { ...tethered, type: second.type });
    await page.evaluate(async () => {
      const { createEmptySoulTrap } = await import('/src/trade/shopStock.js');
      window.__playerEntity.items.push(createEmptySoulTrap());
    });
    const freed = JSON.parse(await page.evaluate(([i]) => window.__damageFoe(i, 9999), [second.i]));
    const gems = await page.evaluate(() => window.__playerEntity.items
      .filter((i) => i.group === 'MiscItems' && i.templateIndex === 274)
      .map((x) => x.trappedSoulType));
    check('X5 a freed gem lets the kill land', freed.dead === true, { ...freed, gems });
    out.steps.finalGems = gems;
  }
}

out.pageErrors = pageErrors.slice(0, 6);
console.log(JSON.stringify(out, null, 2));
await browser.close();
await server.close();
process.exit(out.failures.length ? 1 : 0);
