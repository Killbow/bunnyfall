// MASTER-ART (2026-10-27; bible/06-Systems/Professions-Arc.md section 57) - THE MASTER'S WORK AT THE STATION. In the
// craft box at Master: the three lines to choose (native selects, 40px), the catalysts held and asked, the day's bound,
// the press through the station's own craft door, and the result card. Built from the producers: the real Worker over
// node:sqlite, the client's door and book, the pages drawn for real, and the craft door world.js hands the page.
import '../../chargenDom.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { standService, T0, sessionStorageOf } from '../../accountDb.mjs';
import { accountProf, SESSION_KEY } from '../../../src/net/accountClient.js';
import { createProfBook } from '../../../src/net/profBook.js';
import { recipeById } from '../../../src/net/recipeLaw.js';
import { xpForRank, PEARL } from '../../../src/net/professionLaw.js';
import { MASTER_CATALYSTS, masterOptions, rollMasterLines } from '../../../src/net/masterLaw.js';
import { mintPieces } from '../../../src/systems/smithItems.js';
import { itemLongName } from '../../../src/systems/item/itemInfo.js';
import { affixLabel } from '../../../src/systems/loot/lootRarity.js';
import { setProfessionsPages, drawStoresPage, resetProfPages } from '../../../src/ui/professions/profPages.js';
import { masterOptionWords, masterNeeds, masterPicks, resetMasterBoxes, drawMasterBox } from '../../../src/ui/professions/masterBox.js';
import { PROF_CSS } from '../../../src/ui/enhanced/enhancedPlusStyle.js';
import { setPref } from '../../../src/systems/uiPrefs.js';
import { utcDay } from '../../../src/net/marksLaw.js';

const noWait = () => Promise.resolve();
const memStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
const NOON = utcDay(T0) * 86_400 + 12 * 3600;
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const kit = { el, divider: (w) => el('h3', null, w), meter: () => el('div', 'px-meter') };
const SWORD = 'longsword:daedric';

/** Mac on the real Worker at a Smithing rank, the sword's goods and the catalysts given, and the page's craft door as
 *  world.js builds it: the station's fee and the maker's name laid on, the page's other asks handed on (`...more`). */
async function standAnvil(rank, { catalysts = true } = {}) {
  const s = await standService({ PROFESSIONS_OPEN: 'on', MARKS_OPEN: 'on' });
  const raw = s.env.DB._raw;
  const mac = await s.seated('Mac');
  raw.prepare('INSERT INTO prof_tracks (player, char_id, profession, xp, updated_at) VALUES (?, ?, ?, ?, 1)').run(mac.id, mac.character, 'smithing', xpForRank(rank));
  const give = (key, qty, origin = 'own') => raw.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = excluded.qty`).run(mac.id, mac.character, key, origin, qty);
  for (const i of recipeById(SWORD).inputs) give(i.key, i.n);
  if (catalysts) for (const c of MASTER_CATALYSTS) give(c.key, c.n);
  const door = accountProf({ fetch: s.fetch, storage: sessionStorageOf(SESSION_KEY, mac) });
  const book = createProfBook({ door, storage: memStorage(), character: () => mac.character, now: () => NOON * 1000, sleep: noWait });
  assert.equal((await book.refresh()).ok, true);
  const pack = [];
  const asked = [];
  const craft = async (recipe, { clean, heartwood = false, dye = null, cracked = false, ...more }) => {
    asked.push([recipe, more]);
    const r = await book.craft(recipe, { clean, heartwood, dye, cracked, fee: 0, name: 'Mac', ...more }, (data) => pack.push(...mintPieces(data)));
    return r.ok ? { ok: true, text: 'made' } : { ok: false, text: r.error };
  };
  setProfessionsPages({ book, name: (k) => k, craft, smelt: craft, stock: craft, purse: () => 1e9, forge: () => ({ kind: 'home', fee: 0 }), heatBand: () => 1 });
  return { s, raw, mac, book, give, pack, asked };
}

/** The anvil drawn on the Stores page, the Daedric Longsword picked. */
function anvilAt() {
  let root;
  const draw = () => { root?.remove?.(); root = el('div'); document.body.append(root); drawStoresPage(root, draw, kit); };
  const anvil = () => [...root.querySelectorAll('.prof-station')].find((s) => s.querySelector('h3')?.textContent === 'The Anvil');
  draw();
  [...anvil().querySelectorAll('.prof-recipe')].find((c) => c.querySelector('b').textContent === 'Longsword').onclick();
  [...anvil().querySelector('.prof-made').querySelectorAll('.prof-family')].find((b) => b.textContent.startsWith('Daedric')).onclick();
  const box = () => anvil().querySelector('.prof-master');
  return { anvil, box, root: () => root };
}

test('MASTER-ART THE BOX at the anvil, Smithing at Master: three line pickers of the piece\'s own lines at their Legendary bands, an effect\'s offered once, the catalysts held of what is asked, one a day; the press waits for three lines; pressed, it asks the craft door with the lines, and the card names the piece and its rolled lines (mutants: the box below Master; the press ready with two lines; the lines not handed to the door)', async (t) => {
  t.mock.method(Date, 'now', () => NOON * 1000);
  resetProfPages();
  setPref('gentleActs', false);
  const m = await standAnvil(100);
  try {
    const a = anvilAt();
    const box = a.box();
    assert.ok(box, 'the box, at Master');
    assert.equal(box.querySelector('.prof-master-head').textContent, 'Master\'s work');
    const picks = () => [...a.box().querySelectorAll('select')];
    assert.equal(picks().length, 3);
    const opts = picks()[0].querySelectorAll('option');
    assert.equal(opts.length, 1 + masterOptions(recipeById(SWORD)).length, 'a blank, then every line the sword may carry');
    assert.equal([...opts].find((o) => o.value === 'damage').textContent, '+20 to 40% damage');
    assert.equal([...a.box().querySelectorAll('.prof-master-cat')].map((c) => c.textContent).join(' | '),
      'wood:heartwood 2 / 2 (Logging\'s rarest find) | gem:pearl 3 / 3 (nets hauled at sea) | essence:arcane 10 / 10 (Enchanting)');
    assert.match(a.box().textContent, /One Master's work a day\./);
    const go = () => a.box().querySelector('.prof-master-go');
    assert.equal(go().disabled, true, 'no lines chosen');
    const choose = (i, key) => { const sel = picks()[i]; sel.value = key; sel.onchange(); };
    choose(0, 'elemental:fire');
    choose(1, 'damage');
    assert.equal(go().disabled, true, 'two lines');
    const fire = [...picks()[2].querySelectorAll('option')];
    assert.equal(fire.find((o) => o.value === 'leech').disabled, true, 'one effect at most - the others greyed');
    assert.equal(fire.find((o) => o.value === 'damage').disabled, true, 'a line chosen once');
    choose(2, 'skill:29');
    assert.equal(go().disabled, false);
    await go().onclick();
    assert.deepEqual(m.asked, [[SWORD, { master: ['elemental:fire', 'damage', 'skill:29'] }]], 'the station\'s own craft door, the lines handed on');
    assert.equal(m.pack.length, 1);
    const sword = m.pack[0];
    const card = a.box().querySelector('.prof-master-card');
    assert.ok(card, 'the result card');
    assert.equal(card.querySelector('.prof-master-name').textContent, itemLongName(sword));
    assert.deepEqual([...card.querySelectorAll('li')].map((li) => li.textContent), sword.affixes.map(affixLabel));
    assert.deepEqual(sword.affixes, rollMasterLines(recipeById(SWORD), ['elemental:fire', 'damage', 'skill:29'], m.book.state.master.last.seed));
    assert.match(a.box().textContent, /Today's Master's work is made\. The next can be made after midnight UTC\./);
    assert.equal(go().disabled, true, 'the day\'s one is made');
  } finally {
    setProfessionsPages(null);
    resetProfPages();
  }
});

test('MASTER-ART NO BOX below Master, none for a piece no tier takes; a catalyst short is marked and holds the press; a Pearl jewel asks its own Pearl beside the three (mutants: the rank read at 99; the short catalyst let through)', async (t) => {
  t.mock.method(Date, 'now', () => NOON * 1000);
  resetProfPages();
  try {
    const low = await standAnvil(99);
    assert.equal(anvilAt().box(), null, 'Smithing 99: no Master\'s work');
    const short = await standAnvil(100, { catalysts: false });
    const a = anvilAt();
    assert.equal([...a.box().querySelectorAll('.prof-master-cat')].filter((c) => c.className.split(' ').includes('prof-short')).length, 3);
    for (const [i, key] of ['damage', 'stat:strength', 'skill:29'].entries()) { const sel = [...a.box().querySelectorAll('select')][i]; sel.value = key; sel.onchange(); }
    assert.equal(a.box().querySelector('.prof-master-go').disabled, true, 'held back by the catalysts');
    const kitBox = el('div');
    assert.equal(drawMasterBox(kitBox, kit, recipeById('kit:iron'), { station: 'anvil', book: short.book, state: {}, ready: true, rerender: () => {}, name: (k) => k, go: async () => null }), null, 'a Repair Kit wears no tier');
    assert.equal(kitBox.children.length, 0);
    assert.ok(low);
  } finally {
    setProfessionsPages(null);
    resetProfPages();
  }
  const ring = recipeById('ring:gold:pearl');
  assert.deepEqual(masterNeeds(ring, () => 3).find((c) => c.key === PEARL.key), { key: PEARL.key, need: 4, have: 3, pursuit: 'sea' });
  assert.equal(masterOptionWords({ id: 'focus' }), '-7 to 10% spell cost');
  resetMasterBoxes();
  const p1 = masterPicks('anvil', recipeById(SWORD));
  p1[0] = 'damage';
  assert.equal(masterPicks('anvil', recipeById(SWORD))[0], 'damage', 'kept for its recipe');
  assert.deepEqual(masterPicks('anvil', recipeById('dagger:iron')), ['', '', ''], 'a new recipe starts plain');
});

test('MASTER-ART THE WIRING: world.js\'s craft door hands the page\'s other asks to the book (no logical line in bootWorld); the four stations that make a tier draw the box, each through its own craft door, the loom in its dye; Enhanced Plus gives its pickers and its press 40px (mutants: the door\'s asks dropped; a station\'s box unwired)', () => {
  const w = readFileSync(new URL('../../../src/scenes/world.js', import.meta.url), 'utf8');
  assert.match(w, /craft: async \(recipe, \{ clean, heartwood = false, dye = null, cracked = false, \.\.\.more \}\) => \{/);
  assert.match(w, /const r = await profBook\.craft\(recipe, \{ clean, heartwood, dye, cracked, fee: f\.fee > 0 \? f\.fee : 0, name: [^\n]*, seat, \.\.\.more \}, profMintCraft\);/);
  const pages = readFileSync(new URL('../../../src/ui/professions/profPages.js', import.meta.url), 'utf8');
  for (const [station, state] of [['anvil', '_anvil'], ['workbench', '_bench'], ['loom', '_loom'], ['jeweller', '_jewel']]) {
    assert.match(pages, new RegExp(`drawMasterBox\\(box, kit, r, \\{ station: '${station}', book, state: ${state}, ready, rerender, name: p\\.name, go: \\(lines\\) => p\\.craft\\(r\\.id, \\{ clean: false, ${station === 'loom' ? 'dye, ' : ''}master: lines \\}\\) \\}\\);`), station);
  }
  assert.match(PROF_CSS, /\.prof-master-pick \{ min-height: 40px;/);
  assert.match(PROF_CSS, /\.prof-master-go \{ min-height: 40px;/);
});
