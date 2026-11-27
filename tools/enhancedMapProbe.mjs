// Checks the Enhanced dungeon and town maps in a real browser on synthetic fixtures, on its own dev server.
// Run: node tools/enhancedMapProbe.mjs [--shots DIR]
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';
const PORT = 5231;
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : 'artifacts/maps';
mkdirSync(SHOTS, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: { port: PORT, strictPort: true, hmr: false },
});
await server.listen();
const BASE = `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch();

async function mount(page, kind) {
  await page.goto(`${BASE}/menu.html?skin=enhanced`, { waitUntil: 'networkidle' });
  await page.evaluate(async (kind2) => {
    document.getElementById('enhanced-menu')?.remove();
    const { HeldMapWindow } = await import('/src/ui/heldMap.js');

    const quad = (key, y, x0, z0, x1, z1) => ({
      key,
      positions: new Float32Array([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1]),
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
      matrix: null,
    });
    const ramp = (key, x0, x1, yLow, yHigh, z0, z1) => ({
      key,
      positions: new Float32Array([x0, yLow, z0, x1, yHigh, z0, x1, yHigh, z1, x0, yLow, z1]),
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
      matrix: null,
    });
    const rows = [
      quad('hall', 0, 100, 200, 130, 214),
      quad('west', 0, 86, 203, 100, 211),
      quad('cell', 0, 130, 205, 138, 209),
      quad('corr', 0, 112, 214, 118, 240),
      quad('north', 0, 104, 240, 132, 258),
      ramp('ramp', 138, 152, 0, 9, 204, 210),
      quad('upper', 9, 152, 198, 180, 220),
      quad('vault', 9, 180, 204, 192, 214),
    ];
    const model = { rows };
    const rec = {
      revealed: new Set(['hall', 'west', 'cell', 'corr', 'north', 'ramp', 'upper']),
      visitedThisRun: new Set(['hall', 'west', 'corr']),
      entranceDiscovered: true,
      notes: new Map([[0, { position: [134, 0.7, 207], note: 'lever behind the throne' }]]),
      teleporters: new Map([['t', { entrance: { pos: [116, 0, 236] }, exit: { pos: [186, 9, 209] } }]]),
    };

    const TOWN_BYTES = [1, 3, 4, 16, 12, 2, 5, 17, 18];
    const BLOCK = 64;
    const block = (seed) => {
      const g = new Uint8Array(BLOCK * BLOCK);
      let s = seed;
      const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      for (let i = 0; i < 14; i++) {
        const w = 5 + Math.floor(rnd() * 9), h = 5 + Math.floor(rnd() * 9);
        const x = 4 + Math.floor(rnd() * (BLOCK - w - 8));
        const y = 4 + Math.floor(rnd() * (BLOCK - h - 8));
        const byte = TOWN_BYTES[Math.floor(rnd() * TOWN_BYTES.length)];
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) g[yy * BLOCK + xx] = byte;
      }
      return g;
    };
    const blocks = [];
    for (let by = 0; by < 3; by++) for (let bx = 0; bx < 3; bx++) blocks.push({ x: bx, y: by, autoMap: block(7 + bx * 31 + by * 97) });

    const NAMES = ['The Rusty Nail', 'Odd Blades', 'The Sleeping Giant', 'Temple of Kynareth',
      'Ravenous Tailor', 'The Bent Coin', 'Hawk Armory', 'The Grey Mare', 'Coldharbour Books',
      'Merry Alchemist', 'The Salty Dog', 'Ser Kithlan'];
    const buildings = [];
    let k = 0;
    for (let by = 0; by < 3; by++) {
      for (let bx = 0; bx < 3; bx++) {
        for (let i = 0; i < 3 && k < NAMES.length; i++, k++) {
          buildings.push({
            buildingKey: k,
            blockX: bx, blockY: by,
            position: [12 + i * 30, 0, 14 + i * 28],
            name: NAMES[k],
            isResidence: k === NAMES.length - 1,
            questName: k === NAMES.length - 1 ? 'Ser Kithlan' : '',
            // The stored byte is the building type plus one, which quarterOfType undoes.
            buildingType: TOWN_BYTES[k % TOWN_BYTES.length] - 1,
          });
        }
      }
    }
    const discovered = buildings.map((b) => ({ buildingKey: b.buildingKey, displayName: b.name }));

    const where = kind2 === 'dungeon' ? { insideDungeon: true } : { inLocation: true };
    const deps = { where: () => where };
    if (kind2 === 'dungeon') {
      deps.automap = {
        record: () => rec,
        model: () => model,
        player: () => ({ feet: [116, 0, 230], yaw: Math.PI * 0.25 }),
        startMarker: { x: 92, y: 0, z: 207 },
        insideBuilding: false,
        title: 'Privateers Hold',
      };
    } else {
      deps.town = {
        gridW: 3, gridH: 3, blocks,
        buildings: () => buildings,
        discovered: () => discovered,
        player: () => ({ x: 96, y: 100, yaw: Math.PI * 0.75 }),
        title: 'Daggerfall',
      };
      if (kind2 === 'town+bay') {
        const W = 96, H = 64;
        const bytes = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const sea = x < 18 + 8 * Math.sin(y * 0.3);
            bytes[y * W + x] = sea ? 0 : 20 + Math.round(30 * Math.sin(x * 0.12) * Math.cos(y * 0.1));
          }
        }
        Object.assign(deps, {
          woods: { heightMapBuffer: bytes },
          mapSize: { width: W, height: H },
          getPlayerPixel: () => ({ x: 48, y: 30 }),
          getClimateIndex: () => 302,
          maps: { regionCount: 0, getPoliticIndex: () => 128 },
          mapDict: { values: () => [] },
        });
      }
    }
    const win = new HeldMapWindow(deps);
    globalThis.__win = win;
    for (let i = 0; i < 30; i++) win.tick(1 / 30);
  }, kind);
  await page.waitForTimeout(400);
}

const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

await mount(page, 'dungeon');
let live = await page.evaluate(() => globalThis.__win._slot.live);
check('the crypt opens on the automap tab', live === 'automap', live);
let strip = await page.evaluate(() => globalThis.__win._strip.tabs.map((t) => t.title));
check('the strip reads "Dungeon" alone', strip.length === 1 && strip[0] === 'Dungeon', strip.join(' | '));
let floors = await page.evaluate(() => globalThis.__win._sheet.floors().map((f) => f.label));
check('the ramp did not weld the two storeys', floors.length === 2, floors.join(', '));
await page.screenshot({ path: `${SHOTS}/1-dungeon-floor-1.png` });

await page.evaluate(() => globalThis.__win.input('PageUp', { preventDefault() {} }));
await page.evaluate(() => { for (let i = 0; i < 20; i++) globalThis.__win.tick(1 / 30); });
let floorNow = await page.evaluate(() => globalThis.__win._sheet.floor);
check('PageUp climbs a storey', floorNow === 1, `floor index ${floorNow}`);
await page.screenshot({ path: `${SHOTS}/2-dungeon-floor-2.png` });

// At the rest fit the view clamp centers any axis smaller than the paper, so the map zooms in before the pan test.
await page.evaluate(() => { globalThis.__win._zoomBy(6, globalThis.__win._paper.w / 2, globalThis.__win._paper.h / 2); for (let i = 0; i < 40; i++) globalThis.__win.tick(1 / 30); });
const before = await page.evaluate(() => ({ ...globalThis.__win._view, floor: globalThis.__win._sheet.floor }));
await page.evaluate(() => globalThis.__win.input('ArrowRight', { preventDefault() {} }));
await page.evaluate(() => { for (let i = 0; i < 20; i++) globalThis.__win.tick(1 / 30); });
const after = await page.evaluate(() => ({ ...globalThis.__win._view, floor: globalThis.__win._sheet.floor }));
check('THE ARROWS PAN, they do not change storey',
  after.floor === before.floor && Math.abs(after.ox - before.ox) > 1e-6,
  `floor ${before.floor}->${after.floor}, ox ${before.ox.toFixed(2)}->${after.ox.toFixed(2)}`);
await page.evaluate(() => globalThis.__win.dispose());

await mount(page, 'town');
strip = await page.evaluate(() => globalThis.__win._strip.tabs.map((t) => t.title));
check('the town strip reads "Town" alone while the bay is not handed over',
  strip.length === 1 && strip[0] === 'Town', strip.join(' | '));
let plates = await page.evaluate(() => globalThis.__win._sheet.platesAt(globalThis.__win._view, globalThis.__win._paper.w, globalThis.__win._paper.h, null).length);
check('the town lays nameplates at rest', plates > 0, `${plates} plates`);
const quarters = await page.evaluate(() => {
  const plan = globalThis.__win._sheet.plan;
  return Object.fromEntries(Object.entries(plan.quarters).map(([q, c]) => [q, c.length]));
});
check('all FOUR quarters are traced, houses included',
  Object.values(quarters).filter((n) => n > 0).length === 4, JSON.stringify(quarters));
const atRest = await page.evaluate(() => {
  const w = globalThis.__win;
  const rows = w._sheet.platesAt(w._view, w._paper.w, w._paper.h, null);
  const by = {};
  for (const r of rows) (by[r.quest ? 'quest' : r.quarter] ??= []).push(r.size);
  return { kinds: [...new Set(rows.map((r) => r.quarter))].sort(),
    size: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, Math.max(...v)])) };
});
check('and the plates carry their own quarters, so a name is lettered like its building',
  atRest.kinds.length >= 3 && !atRest.kinds.includes(null), atRest.kinds.join(', '));
check('a landmark is lettered proud of the run of shops',
  Math.max(atRest.size.tavern ?? 0, atRest.size.temple ?? 0) > (atRest.size.shop ?? Infinity),
  JSON.stringify(atRest.size));
check('...and a quest\'s name proud of the landmarks',
  (atRest.size.quest ?? 0) > Math.max(atRest.size.tavern ?? 0, atRest.size.temple ?? 0),
  JSON.stringify(atRest.size));
await page.screenshot({ path: `${SHOTS}/3-town.png` });

await page.evaluate(() => { globalThis.__win._zoomBy(3.2, globalThis.__win._paper.w / 2, globalThis.__win._paper.h / 2); for (let i = 0; i < 30; i++) globalThis.__win.tick(1 / 30); });
const zoomed = await page.evaluate(() => {
  const w = globalThis.__win;
  const rows = w._sheet.platesAt(w._view, w._paper.w, w._paper.h, null);
  return { n: rows.length, size: Math.max(0, ...rows.map((r) => r.size)) };
});
check('a zoom letters the names it still holds larger',
  zoomed.n > 0 && zoomed.size > Math.max(...Object.values(atRest.size)),
  `${zoomed.n} plates, largest ${zoomed.size.toFixed(1)} against ${Math.max(...Object.values(atRest.size)).toFixed(1)} at rest`);
await page.screenshot({ path: `${SHOTS}/4-town-zoomed.png` });
await page.evaluate(() => globalThis.__win.dispose());

await mount(page, 'town+bay');
strip = await page.evaluate(() => globalThis.__win._strip.tabs.map((t) => `${t.title}${t.live ? '*' : ''}`));
check('with the bay in hand the strip shows BOTH tabs, town first',
  strip.length === 2 && strip[0].startsWith('Town') && strip[1].startsWith('The Bay'), strip.join(' | '));
let search = await page.evaluate(() => globalThis.__win._chrome.search.style.display);
check('the town sheet does NOT stand under the bay\'s search box', search === 'none', `display=${search || '(shown)'}`);
await page.screenshot({ path: `${SHOTS}/5-tabs-town.png` });

await page.evaluate(() => { globalThis.__win._selectSheet('world'); for (let i = 0; i < 30; i++) globalThis.__win.tick(1 / 30); });
search = await page.evaluate(() => globalThis.__win._chrome.search.style.display);
check('...and the bay claims it on the way in', search !== 'none', `display=${search || '(shown)'}`);
live = await page.evaluate(() => globalThis.__win._slot.live);
check('the tab switched', live === 'world', live);
await page.screenshot({ path: `${SHOTS}/6-tabs-bay.png` });

await page.evaluate(() => { globalThis.__win._selectSheet('town'); for (let i = 0; i < 30; i++) globalThis.__win.tick(1 / 30); });
search = await page.evaluate(() => globalThis.__win._chrome.search.style.display);
check('AND GIVES IT BACK on the way out - no search box over a town plan', search === 'none', `display=${search || '(shown)'}`);
await page.evaluate(() => globalThis.__win.dispose());

await browser.close();
await server.close();

const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} checks passed; shots in ${SHOTS}/`);
if (bad.length) { console.log('FAILED:'); for (const b of bad) console.log(`  ${b.name} - ${b.detail}`); }
process.exit(bad.length ? 1 : 0);
