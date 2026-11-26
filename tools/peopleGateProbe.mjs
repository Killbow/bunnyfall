// Probe: the people gate in a live town, for a shop when open and shut and for a house the player owns.
// Usage: ARENA2_PATH=<dir> node tools/peopleGateProbe.mjs.
import { createServer } from 'vite';
import { chromium } from 'playwright';

const PORT = 5238;
const server = await createServer({
  root: '/home/user/project-dagger',
  server: { port: PORT, strictPort: true, hmr: false, watch: null },
});
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
// Only uncaught page errors set the exit code; a console error can be a handled 404.
const notes = [];
page.on('console', (m) => { if (m.type() === 'error') notes.push(m.text()); });

const out = { failures: [] };
const check = (name, ok, detail) => {
  if (!ok) out.failures.push(name);
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ''}`);
};
const waitFrames = async (n) => {
  const f = await page.evaluate(() => window.__frame);
  await page.waitForFunction(([f0, k]) => window.__frame > f0 + k, [f, n], { timeout: 60000 });
};

// class=16 skips the character creation wizard, which would hold the overlay slot.
await page.goto(`http://localhost:${PORT}/play/?shot&play&exterior&time=12:00&class=16`);
await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 240000 });

const gate = async () => JSON.parse(await page.evaluate(() => window.__peopleGate()) ?? 'null');
const setHour = (h) => page.evaluate((hh) => window.__setWorldMinutes(hh * 60), h);

const enterDoor = async (i, doors) => {
  const { pos, normal } = doors[i];
  await page.evaluate(([x, y, z, yaw]) => window.__pose(x, y, z, yaw, -0.05),
    [pos[0] + normal[0] * 1.5, pos[1] - 1.2, pos[2] + normal[2] * 1.5, Math.atan2(-normal[0], -normal[2])]);
  if (!await page.evaluate(() => window.__enter())) return null;
  await waitFrames(8);
  return gate();
};
const leave = async () => { await page.evaluate(() => window.__exit()); await waitFrames(4); };

const doors = JSON.parse(await page.evaluate(() => JSON.stringify(window.__doors())));
// An interior that declares no people would make every check below trivially true.
let shopIdx = -1, shopGate = null, shopBuilding = null;
for (let i = 0; i < doors.length && shopIdx < 0; i++) {
  const b = JSON.parse(await page.evaluate((j) => window.__buildingAt(j), i));
  if (!b || ![0, 2, 3, 5, 6, 7, 8, 9, 12, 13].includes(b.buildingType)) continue;
  const g = await enterDoor(i, doors);
  if (g && g.declared > 0) { shopIdx = i; shopGate = g; shopBuilding = b; }
  else if (g) await leave();
}
check('found a live shop whose block declares people', shopIdx >= 0,
  shopGate ? { name: shopBuilding?.name, type: shopBuilding?.buildingType, declared: shopGate.declared } : null);
if (shopIdx < 0) { console.log('\nP1 PROBE: no shop with people in this town'); await browser.close(); await server.close(); process.exit(1); }

check('entered at midday, the shop stands ALL of its people', shopGate.standing === shopGate.declared,
  { hour: shopGate.hour, declared: shopGate.declared, standing: shopGate.standing });
console.log(`  [note] questWired ${shopGate.questWired} of ${shopGate.standing} standing - no active quest has moved anyone here`);
await leave();

// The door refuses a closed shop, so the only way inside is to pick the lock.
await setHour(2);
await waitFrames(4);
await page.evaluate(() => window.__enter());
const refused = await gate();
check('R1 refuses the front door of a closed shop - the arm is only reachable by breaking in',
  refused === null, refused);

// Each failed pick records the skill it was tried at, so each retry raises the skill.
const inSteal = await page.evaluate(() => window.__setInteractionMode('steal'));
check('reached STEAL mode, which is the only mode that offers a pick', inSteal === true);
await waitFrames(2);
let shut = null;
const attempts = [];
for (let skill = 60; skill <= 100 && !shut; skill += 8) {
  await page.evaluate((v) => {
    const e = window.__playerEntity;
    // Skills are keyed by number (Lockpicking is 13), and skillOverrides is read ahead of the sheet.
    (e.skillOverrides ??= {})[13] = v;
  }, skill);
  shut = await enterDoor(shopIdx, doors);
  // __enter() returns true for a refused door and a failed pick too, so the mode says whether the player got in.
  attempts.push({ skill, mode: await page.evaluate(() => window.__mode?.() ?? null), inside: !!shut });
}
console.log(`  [note] pick attempts: ${JSON.stringify(attempts)}`);
check('the same shop, broken into at 02:00, stands NOBODY', shut && shut.standing === 0,
  shut ? { hour: shut.hour, declared: shut.declared, standing: shut.standing } : null);
check('the block still DECLARES the same people - they are hidden, not gone',
  shut && shut.declared === shopGate.declared, shut ? { declared: shut.declared } : null);
if (shut) await leave();

await setHour(12);
await waitFrames(2);
let houseIdx = -1, houseBefore = null, houseBuilding = null;
for (let i = 0; i < doors.length && houseIdx < 0; i++) {
  const b = JSON.parse(await page.evaluate((j) => window.__buildingAt(j), i));
  // Building types 17 to 20 are House1 to House4.
  if (!b || b.buildingType < 17 || b.buildingType > 20) continue;
  const g = await enterDoor(i, doors);
  if (g && g.standing > 0) { houseIdx = i; houseBefore = g; houseBuilding = b; }
  else if (g) await leave();
}
if (houseIdx < 0) {
  console.log('  [note] no enterable house with standing people at noon; the owned-house arm is unit-pinned only');
} else {
  check('a house the player does NOT own stands its people', houseBefore.standing > 0,
    { type: houseBuilding.buildingType, standing: houseBefore.standing, hour: houseBefore.hour });
  await leave();
  const bought = await page.evaluate(([key, region]) => window.__ownHouse?.(key, region) ?? false,
    [houseBuilding.buildingKey, houseBuilding.regionIndex ?? 0]);
  check('the deed is written through the banking seam', bought === true, { buildingKey: houseBuilding.buildingKey });
  const owned = await enterDoor(houseIdx, doors);
  check('and the house the player OWNS is empty - the inverted primitive',
    owned && owned.standing === 0,
    owned ? { declared: owned.declared, standing: owned.standing, hour: owned.hour } : null);
  if (owned) await leave();
}

if (notes.length) console.log(`  [note] ${notes.length} console line(s), handled: ${JSON.stringify(notes.slice(0, 2))}`);
check('zero UNCAUGHT page errors', pageErrors.length === 0, { errors: pageErrors.slice(0, 3) });
console.log(`\n${'='.repeat(49)}`);
console.log(out.failures.length ? `P1 PROBE: ${out.failures.length} FAILED` : 'P1 PROBE: all green');
await browser.close();
await server.close();
process.exit(out.failures.length ? 1 : 0);
