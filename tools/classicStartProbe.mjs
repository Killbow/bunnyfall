// Boots the classic start and leaves the dungeon through its real exit door.
// Run: ARENA2_PATH=... node tools/classicStartProbe.mjs.

import { createServer } from 'vite';
import { chromium } from 'playwright';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const server = await createServer({ server: { port: 5219, strictPort: true } });
await server.listen();
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));

let fails = 0;
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) fails++; };

await page.goto('http://localhost:5219/play/?world&shot&classic&class=1&novideo&nofoes');

const until = Date.now() + 240000;
let mode = null;
while (Date.now() < until) {
  mode = await page.evaluate(() => (window.__mode ? window.__mode() : null));
  if (mode) break;
  await page.waitForTimeout(1000);
}
check(mode === 'dungeon', `the classic start begins INSIDE the dungeon (mode: ${mode})`);

const dungeon = await page.evaluate(() => (window.__dungeon ? JSON.parse(window.__dungeon()) : null));
check(!!dungeon && dungeon.exits.length > 0, `the start location's dungeon has ${dungeon?.exits?.length ?? 0} exit door(s)`);

if (dungeon?.exits?.length) {
  const { pos, normal } = dungeon.exits[0];
  // The exit door's normal faces into the dungeon. Standing 0.5 below the door keeps the activation ray on its box.
  const stand = [pos[0] + normal[0] * 0.8, pos[1] - 0.5, pos[2] + normal[2] * 0.8];
  const yaw = Math.atan2(-normal[0], -normal[2]);
  await page.evaluate(([p, y]) => window.__warpTo(p, y), [stand, yaw]);
  await page.waitForTimeout(300);

  const left = await page.evaluate(() => window.__dungeonExit());
  check(left === true, 'the exit door answers the activation a player would make');
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => window.__mode());
  check(after === 'exterior', `and the player is OUT, standing in the world (mode: ${after})`);
  await page.waitForTimeout(4000);
  const st = JSON.parse(await page.evaluate(() => window.__standing()));
  check(st.spawned === true, `the player has SPAWNED (the boot gate fired, or the dungeon start counted) - ${JSON.stringify(st)}`);
  check(st.built === true && Number.isFinite(st.ground), `the pixel under the player is BUILT with terrain under the feet - ${JSON.stringify(st)}`);
  check(Number.isFinite(st.ground) && st.y >= st.ground - 1 && st.y <= st.ground + 6, `the player stands ON that terrain, not ${st.y - st.ground} above it - ${JSON.stringify(st)}`);
}

const real = errors.filter((e) => !/CURSOR\.IMG|Failed to load resource/.test(e));
check(real.length === 0, real.length ? `page errors: ${real.slice(0, 2).join(' | ')}` : 'zero page errors');

await browser.close();
await server.close();
console.log(fails === 0 ? 'CLASSIC START PROBE: ALL GREEN' : `CLASSIC START PROBE: ${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
