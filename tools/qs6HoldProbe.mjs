// Drives the quickslot hold with real key presses in Chromium over the real modules, without ARENA2.
// The key listeners here copy the ones in src/scenes/world.js. Run: node tools/qs6HoldProbe.mjs.

import { writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const PAGE_NAME = 'qs6-hold-probe.tmp.html';
const PAGE_REL = `tools/${PAGE_NAME}`;
const PAGE_PATH = join(ROOT, PAGE_REL);

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>QS6 hold probe</title></head>
<body><script type="module">
import { held, actionOf, routeAction, POLLED_ACTIONS, QUICKSLOT_ACTIONS, setBindings, isTextEntryTarget } from '/src/ui/input.js';
import { createBindings, resetDefaults, setBinding } from '/src/ui/inputActions.js';
import * as QS from '/src/items/quickslots.js';

const store = createBindings();
resetDefaults(store);
setBindings(store);

const HEAL = 1, CURE = 2, TONIC = 3;
const potion = (key, n) => ({ group: 'UselessItems1', templateIndex: 83, name: 'Glass Bottle', potionRecipeKey: key, stackCount: n, currentCondition: 1, maxCondition: 1 });
const spell = (index, name) => ({ index, name, rangeType: 2, element: 0, cost: 1,
  effects: [{ type: 4, subType: 0, magnitudeBaseLow: 1, magnitudeBaseHigh: 1, magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 1, durationBase: 0, durationMod: 0, durationPerLevel: 1, chanceBase: 0, chanceMod: 0, chancePerLevel: 1 }] });

const entity = { items: [potion(HEAL, 9), potion(CURE, 9), potion(TONIC, 9)], spells: [spell(5, 'Spark'), spell(9, 'Shock'), spell(-1, 'Mine')] };

// The engine's two arms this slice actually asks for. The real one is pinned
// in node (test/systems/qs6_spellslot.test.js drives createPlayerMagic); what is under
// test HERE is that the KEY reaches it at all, and how many times.
let readied = null;
const magic = {
  readiedIndex: () => readied?.index ?? null,
  readySpell: (sp) => { readied = sp; log.push('ready:' + sp.name); },
  abortReadySpell: () => { if (!readied) return false; log.push('abort:' + readied.name); readied = null; return true; },
};

const log = [];
const used = [];
// THE HOST'S PERFORMERS, in the hosts' own shape.
const quickUse = (n) => { const r = QS.resolveConsumable(entity, n === 1 ? 'c1' : 'c2'); used.push(r ? r.key : 'empty'); return true; };
const quickSpell = () => { QS.spellQuickslotPress({ entity, magic, say: (l) => log.push('say:' + l) }); return true; };

// ── THE HOST, as scenes/world.js writes it ────────────────────────────
let overlayActive = false;          // a window is up
const keys = new Set();
const routed = [];                  // every action the DISPATCH ladder performed
addEventListener('keydown', (e) => {
  if (isTextEntryTarget(e.target)) return;
  if (overlayActive) return;        // the Set is filled BELOW the overlay gate
  keys.add(e.code);
  const act = actionOf(e, keys);
  // world.js's own arm, verbatim in shape: the quickslot actions answer above
  // the mode gate, and the POLLED ones are DECLINED here.
  if (!overlayActive && QUICKSLOT_ACTIONS.has(act) && !POLLED_ACTIONS.has(act)) {
    if (routeAction(act, { quickUse, quickSpell, quickSwap: () => { routed.push('swap'); return true; }, quickOffHand: () => { routed.push('off'); return true; } })) {
      routed.push(act); e.preventDefault(); return;
    }
  }
});
addEventListener('keyup', (e) => { keys.delete(e.code); });

// ── THE FRAME, as every host runs it ──────────────────────────────────
let last = performance.now();
let frames = 0;
const cycles = [];
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now; frames++;
  QS.tickQuickslotHold(dt, {
    isHeld: (a) => held(keys, a),
    blocked: overlayActive,
    entity,
    onTap: (slot) => (slot === 'spell' ? quickSpell() : quickUse(slot === 'c1' ? 1 : 2)),
    onCycle: (slot, r) => cycles.push(slot + ':' + (r?.key ?? r?.name ?? '-')),
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__qs = {
  reset(opts = {}) {
    QS.clearQuickslots(); QS.resetQuickslotHolds();
    if (opts.c1) QS.assignQuickslot('c1', potion(HEAL, 9));
    if (opts.spell) QS.setSpellQuickslot(entity.spells[0]);
    readied = null;
    log.length = 0; used.length = 0; cycles.length = 0; routed.length = 0;
    frames = 0;
    return true;
  },
  overlay(on) { overlayActive = !!on; return overlayActive; },
  rebind(code, action) { setBinding(store, code, action); setBindings(store); return true; },
  read: () => ({
    used: [...used], cycles: [...cycles], routed: [...routed], log: [...log], frames,
    readied: readied?.name ?? null,
    c1: QS.quickslotEntry('c1')?.key ?? null,
    spell: QS.spellQuickslot()?.name ?? null,
    lamp: QS.quickslotCycling(),
  }),
  consts: { HOLD: QS.QUICK_HOLD_MS, STEP: QS.QUICK_STEP_MS, GAP: QS.QUICK_GAP_MS },
};
document.title = 'ready';
<\/script></body></html>`;

const vite = await createServer({ root: ROOT, server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await vite.listen();
const port = vite.httpServer.address().port;
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const fails = [];
const ok = (cond, what, got) => { console.log(`   ${cond ? 'ok  ' : 'FAIL'}  ${what}${got !== undefined ? `   (${JSON.stringify(got)})` : ''}`); if (!cond) fails.push(what); };

try {
  // The page is written inside the try so the finally that unlinks it always runs.
  await writeFile(PAGE_PATH, PAGE);
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/tools/${PAGE_NAME}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!window.__qs, null, { timeout: 30000 });
  const C = await page.evaluate(() => window.__qs.consts);
  console.log(`hold ${C.HOLD}ms, step ${C.STEP}ms, gap ${C.GAP}ms\n`);
  const reset = (o = {}) => page.evaluate((x) => window.__qs.reset(x), o);
  const read = () => page.evaluate(() => window.__qs.read());

  console.log('1. a TAP of 1 - one potion, no cycle, and NOT on the down edge');
  await reset({ c1: true });
  await page.keyboard.down('1');
  await page.waitForTimeout(60);
  let mid = await read();
  ok(mid.used.length === 0, 'nothing has happened yet - the DOWN edge performs nothing', mid.used);
  ok(mid.routed.length === 0, 'and the dispatch ladder declined it (POLLED_ACTIONS)', mid.routed);
  await page.keyboard.up('1');
  await page.waitForTimeout(80);
  let r = await read();
  ok(r.used.length === 1, 'the RELEASE performed the slot, exactly once', r.used);
  ok(r.cycles.length === 0, 'and nothing was cycled', r.cycles);

  console.log('\n2. a HOLD of 1 - the pack cycles, and not one potion is drunk');
  await reset({ c1: true });
  await page.keyboard.down('1');
  await page.waitForTimeout(C.HOLD + C.STEP * 2 + 120);
  await page.keyboard.up('1');
  await page.waitForTimeout(80);
  r = await read();
  ok(new Set(r.cycles).size >= 3, 'the hold stepped through the pack, a distinct KIND a step', r.cycles);
  ok(r.used.length === 0, 'AND NOT ONE POTION WAS DRUNK - the release of a hold performs nothing', r.used);
  ok(r.c1 !== null, 'the slot holds what the cycle landed on', r.c1);
  ok(r.lamp === 'c1', 'the lamp is up for the HUD to draw', r.lamp);

  await page.keyboard.down('1');
  await page.waitForTimeout(60);
  await page.keyboard.up('1');
  await page.waitForTimeout(80);
  const after = await read();
  ok(after.used.length === 1 && after.used[0] === after.c1, 'the next tap uses the kind the hold chose', after.used);

  console.log('\n3. a TAP of 3 - the spell readies; again, and it is put away');
  await reset({ spell: true });
  await page.keyboard.down('3'); await page.waitForTimeout(50); await page.keyboard.up('3');
  await page.waitForTimeout(80);
  r = await read();
  ok(r.readied === 'Spark', "the slot's spell is in hand", r.readied);
  ok(r.log.some((l) => l.startsWith('ready:')), "through the engine's own readySpell", r.log);
  await page.keyboard.down('3'); await page.waitForTimeout(50); await page.keyboard.up('3');
  await page.waitForTimeout(80);
  r = await read();
  ok(r.readied === null, 'the same key put it away', r.readied);
  ok(r.log.some((l) => l.startsWith('abort:')), 'through AbortReadySpell, not by clearing a field', r.log);

  console.log('\n4. a HOLD of 3 - the book cycles, and nothing is readied');
  await reset({ spell: true });
  await page.keyboard.down('3');
  await page.waitForTimeout(C.HOLD + C.STEP * 2 + 120);
  await page.keyboard.up('3');
  await page.waitForTimeout(80);
  r = await read();
  ok(r.cycles.length >= 3, 'the hold walked the book', r.cycles);
  ok(r.readied === null, 'and readied NOTHING - choosing is not equipping', r.readied);
  ok(new Set(r.cycles).size === 3, 'and it visited every spell in the book, wrapping at the end', r.cycles);

  console.log('\n5. a window opens over a HELD key and closes with it still down');
  await reset({ c1: true });
  await page.keyboard.down('1');
  await page.waitForTimeout(80);
  await page.evaluate(() => window.__qs.overlay(true));
  await page.waitForTimeout(250);
  await page.evaluate(() => window.__qs.overlay(false));
  await page.waitForTimeout(60);
  await page.keyboard.up('1');
  await page.waitForTimeout(80);
  r = await read();
  ok(r.used.length === 0, 'NOT ONE POTION - a hold that spanned a window performs nothing on the way out', r.used);
  ok(r.cycles.length === 0, 'and it did not walk the pack under the window either', r.cycles);
  await page.keyboard.down('1'); await page.waitForTimeout(50); await page.keyboard.up('1');
  await page.waitForTimeout(80);
  r = await read();
  ok(r.used.length === 1, 'the next real press is a real press', r.used);

  console.log('\n6. the OS auto-repeat storm a held key really produces');
  await reset({ c1: true });
  await page.keyboard.down('1');
  await page.waitForTimeout(1200);
  const repeats = await page.evaluate(() => window.__qs.read().routed.length);
  await page.keyboard.up('1');
  await page.waitForTimeout(80);
  r = await read();
  ok(repeats === 0, 'every repeated keydown was declined by the dispatch ladder', repeats);
  ok(r.used.length === 0, 'and the repeat storm drank nothing', r.used);

  console.log('\n7. the hold follows a REBIND - it is an action, not a key literal');
  await page.evaluate(() => window.__qs.rebind('KeyQ', 'QuickSpell'));
  await reset({ spell: true });
  await page.keyboard.down('q');
  await page.waitForTimeout(C.HOLD + C.STEP + 120);
  await page.keyboard.up('q');
  await page.waitForTimeout(80);
  r = await read();
  ok(r.cycles.length >= 2, 'Q holds the spell slot now', r.cycles);
  ok(r.readied === null, 'and still readies nothing', r.readied);
  await page.keyboard.down('3'); await page.waitForTimeout(50); await page.keyboard.up('3');
  await page.waitForTimeout(80);
  r = await read();
  ok(r.readied === null && r.cycles.length >= 2, "...and 3 is nobody's key any more", r.readied);

  if (errors.length) { console.log('\nPAGE ERRORS:'); for (const e of errors) console.log('  - ' + e); fails.push('the page threw'); }
  await page.close();
} finally {
  await browser.close();
  await vite.close();
  await unlink(PAGE_PATH).catch(() => {});
}
if (fails.length) { console.log(`\nFAILED (${fails.length}):`); for (const f of fails) console.log('  - ' + f); process.exit(1); }
console.log('\nall clear');
