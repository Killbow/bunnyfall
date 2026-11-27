// Walks character creation by keyboard in the exterior host and checks that the choices reach the player.
// Run: node tools/chargenProbe.mjs.

import { createServer } from 'vite';
import { chromium } from 'playwright';
const server = await createServer({ root: '/home/user/project-dagger', server: { port: 5199, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5199/play/?shot&play&exterior&time=12:00');
await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 180000 });
const waitFrames = async (n) => {
  const f = await page.evaluate(() => window.__frame);
  await page.waitForFunction(([f0, k]) => window.__frame > f0 + k, [f, n], { timeout: 60000 });
};
const key = async (k) => { await page.keyboard.press(k); await waitFrames(2); };
await page.waitForFunction(() => JSON.parse(window.__talk()).overlay === true, null, { timeout: 60000 });
console.log('chargen overlay on boot:', JSON.parse(await page.evaluate(() => window.__talk())).overlay);
await waitFrames(2);
// TAMRIEL2.IMG's palette index at the click point is the race id, so a click on Hammerfell picks Redguard.
const M = { s: 4, ox: 60, oy: 50 };
const clickNative = async (vx, vy) => { await page.mouse.click(M.ox + vx * M.s, M.oy + vy * M.s); await waitFrames(3); };
await clickNative(110, 95);
const clicked = await page.evaluate(() => window.__chargenRace?.() ?? null);
console.log('province click ->', clicked);
if (clicked !== 'Redguard') { console.log('PROVINCE CLICK DID NOT PICK A RACE', clicked); process.exit(1); }
await waitFrames(3);
const confirm = await page.evaluate(() => window.__chargenConfirm?.() ?? null);
console.log('race confirm box:', JSON.stringify(confirm?.slice(0, 2) ?? null));
if (!confirm?.length) { console.log('RACE DESCRIPTION BOX DID NOT OPEN'); process.exit(1); }
await page.screenshot({ path: '/home/claude/chargen-raceconfirm.png' });
await key('Escape');
if (await page.evaluate(() => window.__chargenConfirm?.() ?? null)) { console.log('NO DID NOT DISMISS'); process.exit(1); }
for (let i = 0; i < 5; i++) await key('ArrowDown');
await waitFrames(2);
await page.screenshot({ path: '/home/claude/chargen-race.png' });
await key('Enter');
const kbConfirm = await page.evaluate(() => window.__chargenConfirm?.() ?? null);
if (!kbConfirm?.length) { console.log('KEYBOARD CONFIRM SKIPPED THE RACE BOX'); process.exit(1); }
console.log('keyboard confirm opened the box:', kbConfirm.length, 'rows');
await key('Enter');
await waitFrames(2);
await page.screenshot({ path: '/home/claude/chargen-gender.png' });
await key('ArrowDown');
await key('Enter');
await waitFrames(2);
await page.screenshot({ path: '/home/claude/chargen-method.png' });
await key('Enter');
for (let i = 0; i < 3; i++) await key('ArrowDown');
await waitFrames(2);
await page.screenshot({ path: '/home/claude/chargen-class.png' });
await key('Enter');
await key('Enter');
await waitFrames(2);
const biog = async () => JSON.parse(await page.evaluate(() => {
  const f = window.__chargenFlow?.();
  return JSON.stringify(f ? { state: f.state, q: f.biogQuestionIndex, effects: f.biographyEffects.length } : null);
}));
let b = await biog();
console.log('bio-method opened:', JSON.stringify(b));
if (b?.state !== 'bioMethod') { console.log('BIO-METHOD SCREEN DID NOT OPEN', JSON.stringify(b)); process.exit(1); }
await page.screenshot({ path: '/home/claude/chargen-biomethod.png' });
await key('Enter');
await waitFrames(2);
const rep = JSON.parse(await page.evaluate(() => {
  const f = window.__chargenFlow?.();
  return JSON.stringify({ state: f?.state, box: f?.biogRepBox?.map((r) => r.text) ?? null, story: f?.backStory?.length ?? 0, changes: f?.repChanges ?? null });
}));
console.log('reputation box:', JSON.stringify(rep.box?.slice(0, 3)), 'changes', JSON.stringify(rep.changes), 'backstory rows', rep.story);
if (rep.state !== 'bioMethod') { console.log('THE REP BOX SHOULD SHOW OVER THE METHOD SCREEN', rep.state); process.exit(1); }
if (!rep.box?.length) { console.log('REPUTATION BOX DID NOT OPEN'); process.exit(1); }
if (!rep.story) { console.log('BACKSTORY NOT COMPOSED'); process.exit(1); }
await page.screenshot({ path: '/home/claude/chargen-repbox.png' });
await key('Enter');
const after = await biog();
console.log('after the generated biography:', JSON.stringify({ state: after.state, effects: after.effects }));
if (after.state !== 'name') { console.log('GENERATED BIOGRAPHY DID NOT COMPLETE', JSON.stringify(after)); process.exit(1); }
if (after.effects < 12) { console.log('GENERATED BIOGRAPHY COLLECTED NO EFFECTS', after.effects); process.exit(1); }
await waitFrames(2);
await page.screenshot({ path: '/home/claude/chargen-name.png' });
for (const c of 'MAC') await key(c);
await key('Enter');
for (let i = 0; i < 3; i++) await key('ArrowDown');
await waitFrames(10);
await page.screenshot({ path: '/home/claude/chargen-face.png' });
await key('Enter');
await waitFrames(2);
await page.screenshot({ path: '/home/claude/chargen-stats.png' });
const spend = async () => { for (let i = 0; i < 30; i++) await page.keyboard.press('='); await waitFrames(2); };
await spend();
await key('Enter');
await waitFrames(2);
await page.screenshot({ path: '/home/claude/chargen-skills.png' });
for (let row = 0; row < 9; row++) { await spend(); await page.keyboard.press('ArrowDown'); }
await waitFrames(2);
await key('Enter');
await waitFrames(2);
await page.screenshot({ path: '/home/claude/chargen-reflexes.png' });
const reflexBefore = await page.evaluate(() => window.__chargenFlow?.()?.reflexes ?? null);
await key('ArrowUp'); await key('ArrowUp');
const reflexAfter = await page.evaluate(() => window.__chargenFlow?.()?.reflexes ?? null);
console.log('reflexes:', reflexBefore, '->', reflexAfter);
if (reflexBefore !== 2 || reflexAfter !== 0) { console.log('REFLEX PICKER DID NOT MOVE'); process.exit(1); }
await key('Enter');
await waitFrames(2);
await page.screenshot({ path: '/home/claude/chargen-summary.png' });
await key('Enter');
await waitFrames(2);
await page.screenshot({ path: '/home/claude/chargen-leveling.png' });
await key('Enter');
await waitFrames(4);
const e = await page.evaluate(() => {
  const p = window.__playerEntity;
  return { name: p.name, race: p.race, raceId: p.raceId, gender: p.gender, face: p.faceIndex,
    chargenDone: !!p.chargenDone, maxHealth: p.maxHealth, career: p.career?.name,
    skillsIsArray: Array.isArray(p.skills), overlay: JSON.parse(window.__talk()).overlay,
    items: (p.items ?? []).map((i) => `${i.name}${i.stackCount > 1 ? 'x' + i.stackCount : ''}`),
    worn: (p.equip?.slots ?? []).filter(Boolean).map((i) => i.name),
    gold: (p.items ?? []).find((i) => i.group === 'Currency')?.stackCount ?? 0 };
});
console.log('entity after chargen:', JSON.stringify(e));
if (!e.chargenDone) { console.log('CHARGEN DID NOT COMPLETE'); process.exit(1); }
if (e.race !== 'Khajiit' || e.gender !== 'female') { console.log('IDENTITY NOT APPLIED'); process.exit(1); }
if (!e.skillsIsArray) { console.log('SKILLS STILL THE INTERIM FLAT NUMBER'); process.exit(1); }
if (e.gold < 100) { console.log('STARTING GOLD BELOW THE KIT', e.gold); process.exit(1); }
if (e.worn.length !== 2) { console.log('CLOTHES NOT WORN', JSON.stringify(e.worn)); process.exit(1); }
if (!e.items.includes('Spellbook')) { console.log('NO SPELLBOOK'); process.exit(1); }
if (e.items.includes('Dagger')) { console.log('THE INTERIM DAGGER SURVIVED CHARGEN'); process.exit(1); }
if (e.items[0] !== 'Spellbook') { console.log('SPELLBOOK NOT FIRST', JSON.stringify(e.items)); process.exit(1); }
if (e.items[1] !== 'Short Shirt' || e.items[2] !== 'Casual Pants') { console.log('TEMPLATE NAMES WRONG', JSON.stringify(e.items)); process.exit(1); }
const spells = await page.evaluate(() => (window.__playerEntity.spells ?? []).map((s) => s.name ?? s.index));
console.log('starting spells:', JSON.stringify(spells));
const icons = await page.evaluate(async () => {
  const m = await import('/src/items/itemTemplates.js');
  const p = window.__playerEntity;
  const shirt = (p.items ?? []).find((i) => i.name === 'Short Shirt');
  return { worn: m.inventoryItemImage(shirt, p), base: m.inventoryItemImage(shirt, { gender: 'female', race: 'Argonian' }) };
});
console.log('shirt icon archive:', JSON.stringify(icons));
if (icons.worn.archive !== icons.base.archive + 3) { console.log('ICON NOT ADDRESSED FOR THE WEARER', JSON.stringify(icons)); process.exit(1); }
await waitFrames(10);
await page.keyboard.press('F6');
await waitFrames(10);
await page.screenshot({ path: '/home/claude/chargen-paperdoll.png' });
const S = 4, OX = 60, OY = 50;
await page.mouse.click(OX + 205 * S, OY + 4 * S);
await waitFrames(12);
await page.screenshot({ path: '/home/claude/chargen-clothing-icons.png' });
const bio = await page.evaluate(() => {
  const p = window.__playerEntity;
  return { rep: [...(p.sGroupReputations ?? [])], reaction: p.biographyReactionMod ?? 0,
    poison: p.biographyResistPoisonMod ?? 0, skillSum: (p.skills ?? []).reduce((a, b) => a + b, 0) };
});
console.log('biography on the entity:', JSON.stringify(bio));
if (JSON.stringify(bio.rep.slice(0, 5)) !== JSON.stringify(rep.changes)) {
  console.log('BIOGRAPHY REPUTATION DID NOT LAND', JSON.stringify(bio.rep.slice(0, 5)), 'vs', JSON.stringify(rep.changes)); process.exit(1);
}
const reflexOnEntity = await page.evaluate(() => window.__playerEntity.reflexes);
console.log('reflexes on the entity:', reflexOnEntity);
if (reflexOnEntity !== 0) { console.log('REFLEX PICK NEVER LANDED', reflexOnEntity); process.exit(1); }
console.log('CHARGEN OK');
await browser.close(); await server.close();
