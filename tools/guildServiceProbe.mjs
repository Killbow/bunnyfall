// Browser probe that walks into a guild hall, clicks its service NPC, joins, and pays for training.
// Run: ARENA2_PATH=... node tools/guildServiceProbe.mjs (starts its own dev server).
import { createServer } from 'vite';
import { chromium } from 'playwright';

const GUILDISH = new Set([11, 14]);
const BUILT_SERVICES = new Set(['Training', 'Donate', 'CureDisease']);
const server = await createServer({ root: '/home/user/project-dagger', server: { port: 5201, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (/guild|interior|static/i.test(m.text())) console.log('[page]', m.text()); });
// class=0 skips character creation with a Mage: the Mages Guild turns a Warrior (class=16) away at the door.
await page.goto('http://localhost:5201/play/?shot&play&exterior&time=12:00&class=0');
await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 180000 });

const waitFrames = async (n) => {
  const f = await page.evaluate(() => window.__frame);
  await page.waitForFunction(([f0, k]) => window.__frame > f0 + k, [f, n], { timeout: 60000 });
};

const doors = JSON.parse(await page.evaluate(() => JSON.stringify(window.__doors())));
const picks = [];
for (let i = 0; i < doors.length; i++) {
  const b = JSON.parse(await page.evaluate((j) => window.__buildingAt(j), i));
  if (b && GUILDISH.has(b.buildingType)) picks.push({ i, b, door: doors[i] });
}
console.log(`guild/temple doors: ${picks.length} of ${doors.length}`);
if (!picks.length) { console.log('NO GUILD DOOR IN THIS CITY'); process.exit(1); }

let opened = null;
for (const pick of picks) {
  const { pos, normal } = pick.door;
  await page.evaluate(([x, y, z, yaw]) => window.__pose(x, y, z, yaw, -0.05),
    [pos[0] + normal[0] * 1.5, pos[1] - 1.2, pos[2] + normal[2] * 1.5, Math.atan2(-normal[0], -normal[2])]);
  if (!await page.evaluate(() => window.__enter())) continue;
  await waitFrames(8);
  const building = JSON.parse(await page.evaluate(() => window.__building()));
  const npcs = JSON.parse(await page.evaluate(() => window.__staticNpcs()) ?? 'null') ?? [];
  console.log(`door ${pick.i}: ${JSON.stringify(building)} people=${npcs.length}`,
    JSON.stringify(npcs.filter((n) => n.service)));
  const BUILT = new Set(['Training', 'Donate', 'CureDisease']);
  const servicer = npcs.find((n) => BUILT.has(n.service)) ?? npcs.find((n) => n.service);
  if (servicer) {
    if (!servicer.w) { console.log('NPC HAS NO BILLBOARD EXTENT - it would not be an activation target'); process.exit(1); }
    await page.evaluate((i) => window.__activateNpc(i), servicer.i);
    await waitFrames(10);
    const overlay = JSON.parse(await page.evaluate(() => window.__guildOverlay()) ?? 'null');
    console.log('popup:', JSON.stringify(overlay));
    if (overlay) { opened = { building, servicer, overlay }; break; }
    console.log('  (no popup - route fell through to talk)');
  }
  await page.evaluate(() => window.__exit());
  await waitFrames(4);
}
if (!opened) { console.log('NO GUILD SERVICE POPUP OPENED'); process.exit(1); }
await page.screenshot({ path: '/home/claude/guild-popup.png' });

await page.evaluate(() => {
  const e = window.__playerEntity;
  e.items = e.items ?? [];
  const g = e.items.find((i) => i.group === 'Currency');
  if (g) g.stackCount = 20000; else e.items.push({ group: 'Currency', name: 'Gold pieces', stackCount: 20000 });
});

const die = (why, detail) => {
  console.log(`FAIL: ${why}${detail !== undefined ? ` - ${detail}` : ''}`);
  process.exitCode = 1;
};
const guild = async () => JSON.parse(await page.evaluate(() => window.__guildOverlay()) ?? 'null');
const flow = async () => JSON.parse(await page.evaluate(() => window.__serviceFlow()) ?? 'null');
const boxText = (o) => (o?.boxes ?? []).join(' ');

await page.keyboard.press('KeyJ');
await waitFrames(6);
const joinBox = await guild();
console.log('join box:', JSON.stringify(joinBox));
if (/ineligible|sad to say/i.test(boxText(joinBox))) {
  die('the character was refused at the door, so no service was tested', boxText(joinBox));
}
await page.keyboard.press('KeyY');
await waitFrames(6);
console.log('welcome:', JSON.stringify(await guild()));
await page.keyboard.press('Enter');
await waitFrames(4);
const memberships = JSON.parse(await page.evaluate(() => JSON.stringify(window.__playerEntity.guildMemberships ?? {})));
console.log('memberships:', JSON.stringify(memberships));
if (!Object.keys(memberships).length) die('the join left no membership on the entity', JSON.stringify(memberships));
await page.screenshot({ path: '/home/claude/guild-welcome.png' });

await page.evaluate((i) => window.__activateNpc(i), opened.servicer.i);
await waitFrames(8);
const asMember = await guild();
console.log('popup as member:', JSON.stringify(asMember));
if (!asMember?.member) die('the popup still thinks the player is not a member', JSON.stringify(asMember));
await page.screenshot({ path: '/home/claude/guild-member.png' });

await page.keyboard.press('KeyS');
await waitFrames(6);
const popupAfter = await guild();
const flowOpened = await flow();
console.log('after service click: popup=', JSON.stringify(popupAfter), 'flow=', JSON.stringify(flowOpened));
await page.screenshot({ path: '/home/claude/guild-service.png' });
if (/members only/i.test(boxText(popupAfter))) die('the service refused a MEMBER', boxText(popupAfter));
if (!flowOpened) die('the service button opened no flow', JSON.stringify(popupAfter));
if (!/cost|training/i.test(flowOpened?.box ?? '')) die('the flow does not quote a price', JSON.stringify(flowOpened?.box));

const gold0 = await page.evaluate(() => window.__playerEntity.items.find((i) => i.group === 'Currency').stackCount);
await page.keyboard.press('KeyY');
await waitFrames(6);
const picker = await flow();
console.log('after Y:', JSON.stringify(picker));
await page.screenshot({ path: '/home/claude/guild-flow.png' });
if (!picker?.picker?.length) die('agreeing to the price raised no skill picker', JSON.stringify(picker));
await page.keyboard.press('Enter');
await waitFrames(8);
const gold1 = await page.evaluate(() => window.__playerEntity.items.find((i) => i.group === 'Currency').stackCount);
const skillUses = JSON.parse(await page.evaluate(() => JSON.stringify(Object.entries(window.__playerEntity.skillUses ?? {}).filter(([, v]) => v > 0))));
console.log('after picking a skill:', JSON.stringify(await flow()));
console.log('gold', gold0, '->', gold1, 'skillUses', JSON.stringify(skillUses));
await page.screenshot({ path: '/home/claude/guild-flow2.png' });
if (!(gold1 < gold0)) die('the training was free', `${gold0} -> ${gold1}`);
if (!skillUses.length) die('the training taught nothing - no skill use was banked', JSON.stringify(skillUses));
await page.keyboard.press('Enter');
await waitFrames(4);
const closed = await flow();
console.log('flow closed:', JSON.stringify(closed));
if (closed) die('the service flow would not close', JSON.stringify(closed));

if (!process.exitCode) console.log('\nGUILD SERVICE OK: joined, trained, paid, and taught - each step checked');
await browser.close();
await server.close();
process.exit(process.exitCode ?? 0);
