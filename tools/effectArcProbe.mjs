// Browser probe: casts Detect Enemy, Pacify Undead, and Dispel Undead in the real dungeon host on real game data.
// Run: ARENA2_PATH=/path/to/arena2 node tools/effectArcProbe.mjs.
import { createServer } from 'vite';
import { chromium } from 'playwright';

const PORT = 5219;
const server = await createServer({ root: '/home/user/project-dagger', server: { port: PORT, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

await page.goto(`http://localhost:${PORT}/play/?shot&class=0`);
await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 240000 });

const out = { steps: {}, failures: [] };
const check = (name, ok, detail) => {
  out.steps[name] = { ok, ...detail };
  if (!ok) out.failures.push(name);
};

const mkSpell = (slots, rangeType) => page.evaluate(async ([s, rt]) => {
  const { buildCustomSpell, blankEffectSettings } = await import('/src/magic/spellMaker.js');
  return buildCustomSpell({
    slots: s.map((x) => ({ type: x.type, subType: x.subType,
      settings: { ...blankEffectSettings(), ...x.settings } })),
    rangeType: rt,
  });
}, [slots, rangeType]);

const foes = async () => JSON.parse(await page.evaluate(() => window.__foes()));
const liveFoes = async () => (await foes()).filter((f) => !f.dead);

const dists = async () => page.evaluate(() => {
  const p = window.__player.pos;
  return (window.__liveFoeRecords() ?? [])
    .map((r) => ({ t: r.mobileType, d: Math.hypot(r.pos[0] - p[0], r.pos[1] - p[1], r.pos[2] - p[2]) }))
    .sort((a, b) => a.d - b.d).slice(0, 5).map((x) => ({ t: x.t, d: Number(x.d.toFixed(1)) }));
});
out.steps.scene = { foes: (await foes()).length, live: (await liveFoes()).length, nearest: await dists() };

const parked = await page.evaluate(async () => {
  const nb = await import('/src/world/nearbyObjects.js');
  const live = window.__liveFoeRecords() ?? [];
  const undead = live.filter((r) => nb.enemyGroupOf(r.mobileType) === nb.NEARBY.Undead);
  if (!undead.length) return null;
  const t = undead[0];
  // Nearby scans measure from the motor, not the camera, so the player is warped next to an undead.
  window.__player.warp(t.pos[0] + 2, t.pos[1] + 1, t.pos[2]);
  return { type: t.mobileType, at: t.pos.map((v) => Number(v.toFixed(1))) };
});
out.steps.parked = parked;
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
out.steps.afterPark = { nearest: await dists() };

{
  const spell = await mkSpell([{ type: 39, subType: 1, settings: { durationBase: 20 } }], 0);
  await page.evaluate((sp) => window.__combat.applySpellToPlayer(sp, 5), spell);
  const kinds = await page.evaluate(() =>
    (window.__playerEntity.activeEffects ?? []).map((a) => a.kind));
  const markers = await page.evaluate(async () => {
    const nb = await import('/src/world/nearbyObjects.js');
    const feet = window.__player.pos;
    const live = window.__liveFoeRecords ? window.__liveFoeRecords() : null;
    if (!live) return { unavailable: true };
    const list = nb.updateNearbyObjects(feet, { entities: live });
    return { n: nb.detectedMarkers(window.__playerEntity, list).length, scanned: list.length };
  });
  check('X4 detect lands', kinds.includes('detectEnemy'), { kinds });
  check('X4 markers resolve in range', markers.n >= 1 && markers.n < markers.scanned,
    markers);
}

{
  const before = await liveFoes();
  const undeadIdx = await page.evaluate(async () => {
    const nb = await import('/src/world/nearbyObjects.js');
    const fs = JSON.parse(window.__foes());
    return fs.findIndex((f) => !f.dead && nb.enemyGroupOf(f.type) === nb.NEARBY.Undead);
  });
  if (undeadIdx < 0) {
    check('X8 pacify', false, { reason: 'no live undead in this dungeon to pacify', liveTypes: before.map((f) => f.type) });
  } else {
    const spell = await mkSpell([{ type: 33, subType: 1, settings: { chanceBase: 100, chanceMod: 0 } }], 1);
    const res = await page.evaluate(async ([sp, idx]) => {
      const { applySpell } = await import('/src/magic/effects.js');
      const f = window.__foeRecord(idx);
      const wasHostile = f.ai?.isHostile;
      const r = applySpell(sp, 5, f.entity, {}, () => 0, null, {});
      if (r.pacify && f.ai) f.ai.isHostile = false;
      return { wasHostile, pacify: !!r.pacify, nowHostile: f.ai?.isHostile, type: f.mobileType };
    }, [spell, undeadIdx]);
    check('X8 pacify undead', res.pacify === true && res.nowHostile === false, res);
  }
}

{
  const beforeLive = (await liveFoes()).length;
  const beforeUndead = await page.evaluate(async () => {
    const nb = await import('/src/world/nearbyObjects.js');
    return JSON.parse(window.__foes()).filter((f) => !f.dead && nb.enemyGroupOf(f.type) === nb.NEARBY.Undead).length;
  });
  const pilesBefore = JSON.parse(await page.evaluate(() => window.__piles()));
  const spell = await mkSpell([{ type: 6, subType: 1, settings: { chanceBase: 100, chanceMod: 0 } }], 0);
  await page.evaluate((sp) => window.__combat.applySpellToPlayer(sp, 5), spell);
  // A kill's corpse appears a frame or two late because it waits for a texture, so the check waits first.
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));
  const afterAll = await foes();
  const afterLive = afterAll.filter((f) => !f.dead).length;
  // A destroyed target and a killed one differ only by the corpse a kill spawns.
  const corpses = afterAll.filter((f) => f.corpse).length;
  const pilesAfter = JSON.parse(await page.evaluate(() => window.__piles()));
  const destroyed = beforeLive - afterLive;
  const detail = { beforeLive, beforeUndead, afterLive, destroyed, corpses,
    pilesBefore: pilesBefore.length, pilesAfter: pilesAfter.length };
  check('X9 dispel destroys in range', destroyed >= 1, detail);
  check('X9 dispel leaves NO corpse', corpses === 0, detail);
}

out.pageErrors = pageErrors.slice(0, 8);
console.log(JSON.stringify(out, null, 2));
await browser.close();
await server.close();
process.exit(out.failures.length ? 1 : 0);
