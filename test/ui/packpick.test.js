// PACK-PICK (2026-10-26, #feature-feedback "SELLING ITEMS ON THE MARKET IS A PAIN!": "When selling items from backpack for
// GOLD, you get a dropdown with just the name of the item.. no description or icon"; the owner: "This needs a comprehensive
// detailed overhaul"): THE PACK, PICTURED, WHERE A PIECE IS CHOSEN TO SELL - ui/packPicker.js, the Market's List form
// (ui/marketTab.js) and a trader's stall (ui/vendor/vendorTab.js) over it, and the look it shows (systems/item/itemLook.js).
// The pieces are the producers' (systems/loot/loot.js generateRandomLoot, lootRarity.js applyRarity) and the pack side the
// host builds (systems/tradePack.js createMarketGoods). Mutants: tools/mutants/packpick.json.
import '../chargenDom.mjs';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { packPickerNode, packCardNode, freshPackSift, siftEntries, tierWord } from '../../src/ui/packPicker.js';
import { itemLook } from '../../src/systems/item/itemLook.js';
import { createMarketTab, LIST_KINDS } from '../../src/ui/marketTab.js';
import { createVendorTab } from '../../src/ui/vendor/vendorTab.js';
import { createMarketGoods } from '../../src/systems/tradePack.js';
import { generateRandomLoot, LOOT_MATRICES } from '../../src/systems/loot/loot.js';
import { applyRarity, LOOT_RARITY_KEY } from '../../src/systems/loot/lootRarity.js';
import { storeMaterialOf } from '../../src/ui/storeFilter.js';
import { pageOf } from '../../src/ui/packPages.js';
import { seededRng } from '../../src/systems/wind/wind.js';
import { setPref, _resetForTests as resetPrefs } from '../../src/systems/uiPrefs.js';
import { ARROW_TEMPLATE } from '../../src/systems/inventory.js';
import { PROF_CSS } from '../../src/ui/enhanced/enhancedPlusStyle.js';

afterEach(() => resetPrefs());
const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const byClass = (n, c) => n.querySelectorAll(`.${c}`);
const word = (n, c) => byClass(n, c)[0]?.textContent;
/** The pressable tiles of the picker `root` is, or of the first under it. */
const tilesOf = (root) => [...byClass(root.className.split(' ').includes('packpick') ? root : byClass(root, 'packpick')[0], 'packpick-tile')].filter((n) => n.tagName === 'BUTTON');

/** A pack the producers fill: a body's weapons and armour (none an arrow), its gold, and a quest's piece (quest/item.js
 *  writes `questItem`) - the gold and the quest's refused by the market's own law (net/marketLaw.js goodRefusal). */
function pack() {
  const loot = [21, 22, 23, 24].flatMap((s) => generateRandomLoot({ ...LOOT_MATRICES['-'], MinGold: 5, MaxGold: 5, WP: 100, AM: 100 }, { level: 10, gender: 'male' }, seededRng(s)));
  const gear = loot.filter((it) => (it.group === 'Weapons' && it.templateIndex !== ARROW_TEMPLATE) || it.group === 'Armor');
  const gold = loot.find((it) => it.group === 'Currency');
  assert.ok(gear.filter((it) => it.group === 'Weapons').length >= 2 && gear.some((it) => it.group === 'Armor') && gold, 'the drop holds each');
  const quest = { ...JSON.parse(JSON.stringify(gear.find((it) => it.group === 'Weapons'))), questItem: true };
  const owner = { items: [...gear, gold, quest] };
  return { owner, gear, gold, quest, goods: createMarketGoods(owner) };
}
const entriesOf = (goods) => goods.goods().map((g, i) => ({ key: `t|${i}`, item: g.item, name: g.name, sub: tierWord(g.item), why: g.why }));

test('PACK-PICK the sift: the pack\'s own pages, tiers and metals (ui/storeFilter.js) and a search of the names the tiles wear - every piece while nothing is asked; a shape the laws cannot read is left out, never thrown on (mutants: the search unread; the page unread)', () => {
  setPref(LOOT_RARITY_KEY, true);
  const { gear, goods } = pack();
  applyRarity(gear[0], 'rare', seededRng(4));
  const all = entriesOf(goods);
  assert.equal(siftEntries(all, freshPackSift()), all, 'nothing asked: the list as it stands');
  const name = all[0].name;
  const q = name.slice(1, 5).toUpperCase();
  assert.deepEqual(siftEntries(all, { ...freshPackSift(), query: `  ${q} ` }).map((e) => e.key), all.filter((e) => e.name.toLowerCase().includes(q.toLowerCase())).map((e) => e.key));
  assert.deepEqual(siftEntries(all, { ...freshPackSift(), query: 'no such piece anywhere' }), []);
  for (const cat of ['weapons', 'armor']) {
    const got = siftEntries(all, { ...freshPackSift(), cat });
    assert.ok(got.length > 0 && got.length < all.length, cat);
    assert.ok(got.every((e) => pageOf(e.item) === cat), `${cat}: the pack's own page`);
  }
  assert.deepEqual(siftEntries(all, { ...freshPackSift(), rarity: 'rare' }).map((e) => e.item), [gear[0]]);
  const metal = all.map((e) => storeMaterialOf(e.item)).find(Boolean);
  const byMetal = siftEntries(all, { ...freshPackSift(), material: metal });
  assert.ok(byMetal.length > 0 && byMetal.every((e) => storeMaterialOf(e.item) === metal), `the metal ${metal}`);
  assert.deepEqual(siftEntries([{ key: 'x', item: 'a word, no item', name: 'a word' }], { ...freshPackSift(), cat: 'weapons' }), []);
  assert.equal(tierWord(gear[0]), 'Rare');
  assert.equal(tierWord(gear[1]), null, 'Common says nothing');
});

test('PACK-PICK the picker: a pictured tile for each piece that may go, none pressed; what may not go folded under them with why and never pressable; the search refills the tiles in place (the field never redrawn) and the menus too; nothing matching offers "Show everything"; a tile pressed is handed back (mutants: typing redraws the window; the refused pressable; the why unsaid; the tier unmarked; the menus gone)', async () => {
  setPref(LOOT_RARITY_KEY, true);
  const { gear, goods, gold, quest } = pack();
  applyRarity(gear[0], 'rare', seededRng(4));
  const entries = entriesOf(goods);
  const ok = entries.filter((e) => !e.why);
  const sift = freshPackSift();
  const picked = [], redraws = [];
  const box = packPickerNode({ entries, chosen: null, sift, pick: (it) => picked.push(it), label: 'The pieces in your pack', focus: 'f', empty: 'none',
    refusedWhat: 'Not for the market', redraw: () => redraws.push(1) });
  assert.equal(box.getAttribute('aria-label'), 'The pieces in your pack');
  let tiles = tilesOf(box);
  assert.deepEqual(tiles.map((b) => word(b, 'packpick-name')), ok.map((e) => e.name));
  assert.ok(tiles.every((b) => b.getAttribute('aria-pressed') === 'false'), 'nothing chosen');
  assert.equal(new Set(tiles.map((b) => b.getAttribute('data-focus'))).size, tiles.length, 'each its own focus key');
  assert.equal(tiles.find((b) => word(b, 'packpick-name') === entries.find((e) => e.item === gear[0]).name).getAttribute('data-rarity'), 'rare', 'its tier on its frame');
  assert.equal(word(tiles[0], 'packpick-sub'), 'Rare');
  assert.equal(word(box, 'packpick-count'), `${ok.length} pieces`);
  // the refused: folded, each a picture and its why - never a press
  const fold = byClass(box, 'packpick-refused')[0];
  assert.equal(fold.tagName, 'DETAILS');
  const refused = entries.filter((e) => e.why);
  assert.ok(refused.some((e) => e.item === gold) && refused.some((e) => e.item === quest && e.why === 'a quest\'s'), 'the gold and the quest\'s piece among them');
  assert.equal(fold.children[0].textContent, `Not for the market (${refused.length})`, 'its name and how many');
  const off = [...byClass(fold, 'packpick-tile')];
  assert.deepEqual(off.map((n) => [n.tagName, word(n, 'packpick-name'), word(n, 'packpick-why')]), refused.map((e) => ['DIV', e.name, e.why]));
  // a press hands the piece back
  tiles[1].onclick();
  assert.deepEqual(picked, [ok[1].item]);
  // the search: in place - the same field, the tiles refilled, no redraw of the window
  const find = byClass(box, 'packpick-find')[0];
  find.value = 'no such piece anywhere';
  find.oninput();
  await tick(160);
  assert.ok(box.contains(find), 'the field typed in stands');
  assert.equal(tilesOf(box).length, 0);
  assert.equal(word(box, 'packpick-none'), 'Nothing in your pack matches. Show everything');
  assert.equal(word(box, 'packpick-count'), `0 of ${ok.length}`);
  assert.deepEqual(redraws, [], 'typing never redraws the window');
  [...box.querySelectorAll('button')].find((b) => b.textContent === 'Show everything').onclick();
  assert.deepEqual([sift.query, redraws.length], ['', 1], 'the sift let go, and the window drawn with it');
  // the page menu - the pages the pieces lie on, each its count
  const menus = [...byClass(box, 'packpick-menu')];
  const page = menus.find((s) => s.getAttribute('aria-label') === 'Kind of piece');
  assert.ok(page, 'a page to choose');
  assert.ok(menus.some((s) => s.getAttribute('aria-label') === 'Rarity'), 'the tiers, while the ladder is on');
  page.value = 'armor';
  page.onchange();
  tiles = tilesOf(box);
  assert.ok(tiles.length > 0 && tiles.length < ok.length);
  assert.equal(word(box, 'packpick-count'), `${tiles.length} of ${ok.length}`);
  // the chosen marked; nothing that may go is the empty words alone, the refused still said
  const again = packPickerNode({ entries, chosen: ok[2].item, sift: freshPackSift(), pick: () => {}, label: 'x', focus: 'f', empty: 'none', refusedWhat: 'r', redraw: () => {} });
  assert.deepEqual(tilesOf(again).map((b) => b.getAttribute('aria-pressed')).indexOf('true'), 2);
  assert.ok(tilesOf(again)[2].className.split(' ').includes('on'));
  const bare = packPickerNode({ entries: entries.filter((e) => e.why), chosen: null, sift: freshPackSift(), pick: () => {}, label: 'x', focus: 'f', empty: 'Nothing here.', refusedWhat: 'r', redraw: () => {} });
  assert.equal(word(bare, 'packpick-empty'), 'Nothing here.');
  assert.equal(byClass(bare, 'packpick-find').length, 0, 'no search over nothing');
  assert.equal(byClass(bare, 'packpick-refused').length, 1);
});

test('PACK-PICK the tiles keep their scroll: a press redraws the window, and the picker drawn again gives its tiles back where they were scrolled (once it stands in the window); a sift that changes what the tiles are lets it go (mutants: the scroll unkept; the scroll kept over a new sift)', async () => {
  const { goods } = pack();
  const entries = entriesOf(goods);
  const sift = freshPackSift();
  const draw = () => packPickerNode({ entries, chosen: null, sift, pick: () => {}, label: 'x', focus: 'f', empty: 'none', refusedWhat: 'r', redraw: () => {} });
  let grid = byClass(draw(), 'packpick-grid')[0];
  grid.scrollTop = 140;
  grid.dispatch('scroll', {});
  assert.equal(sift.top, 140, 'the scroll kept');
  grid = byClass(draw(), 'packpick-grid')[0];
  assert.equal(grid.scrollTop, 0, 'not before the window has drawn it');
  await tick();
  assert.equal(grid.scrollTop, 140, 'given back');
  const box = draw();
  await tick();
  const page = [...byClass(box, 'packpick-menu')].find((s) => s.getAttribute('aria-label') === 'Kind of piece');
  page.value = 'weapons';
  page.onchange();
  assert.deepEqual([sift.top, byClass(box, 'packpick-grid')[0].scrollTop], [0, 0], 'a new sift starts at the top');
});

test('PACK-PICK the piece looked at: its name and line, the look panel\'s rows and its magic (systems/item/itemLook.js) - the trader\'s look, moved, one presenter; the words that stand in while nothing is chosen (mutants: the look unread; the stall\'s look a second copy)', () => {
  setPref(LOOT_RARITY_KEY, true);
  const { gear } = pack();
  const weapon = gear.find((it) => it.group === 'Weapons');
  applyRarity(weapon, 'rare', seededRng(4));
  const none = packCardNode(null, { none: 'Press a piece.' });
  assert.deepEqual([none.className, none.textContent], ['notice-tip packpick-cardnone', 'Press a piece.']);
  const card = packCardNode({ key: 'k', item: weapon, name: 'My Blade', sub: 'Rare' }, { look: itemLook, none: '' });
  assert.equal(card.getAttribute('data-rarity'), 'rare');
  assert.deepEqual([word(card, 'packpick-name'), word(card, 'packpick-sub')], ['My Blade', 'Rare']);
  const look = itemLook(weapon);
  assert.deepEqual([...byClass(card, 'packpick-stat')].map((n) => n.textContent), look.rows);
  assert.ok(look.rows.some((r) => /^Damage: \d+ - \d+$/.test(r)) && look.rows.some((r) => /^Weight: /.test(r)), look.rows.join(' | '));
  assert.ok(look.magic.length > 0, 'a Rare piece says its tier and its lines');
  assert.deepEqual([...byClass(card, 'packpick-magic')[0].children].map((n) => n.textContent), look.magic);
  assert.equal(itemLook(null), null);
  assert.equal(itemLook('a word'), null);
  assert.match(src('src/scenes/vendorHost.js'), /const vendorItemStats = itemLook;/, 'the trader\'s look is this one');
});

/** A market book as the tab reads it - `goldOk` a realm character's - and the listings it is asked for. */
function bookOf(goldOk) {
  const listed = [];
  return {
    listed, state: { open: true, balance: 1000, road: [], counts: {}, goldHeld: 0 }, pending: 0, cached: () => null, goldOk, purse: () => 500,
    read: async (view) => ({ ok: true, data: view === 'mine' ? { rows: [], ways: {} } : { rows: [] } }), settle: async () => ({ ok: true, settled: 0 }),
    list: async (req) => { listed.push(req); return { ok: true, data: {} }; },
  };
}
function tabOf(book, goods) {
  let root = null;
  const said = [];
  const m = {
    book, stores: () => new Map(), region: 17, regionName: 'Daggerfall', regionNameOf: () => 'Daggerfall', hubs: { 17: [207, 212] }, name: (k) => k, countName: (k) => k,
    pieces: () => [], take: () => true, putBack: () => {}, mint: () => {}, pieceName: () => 'a piece', weavers: [], stock: async () => ({ ok: true }),
    goods: () => goods.goods(), good: (it) => goods.good(it), goodName: (r) => goods.goodName(r),
  };
  const tab = createMarketTab(m, { busy: () => false, run: async (start) => { const r = await start(); said.push(r?.text); }, rerender: () => draw(), nowS: () => 0, alive: () => true });
  function draw() { root = tab.body(); }
  return { tab, said, root: () => root, draw, press: (k) => [...root.querySelectorAll('button')].find((b) => b.getAttribute('data-kind') === k) };
}
const mine = async (t) => { t.tab.state.view = 'mine'; await t.tab.load(true); t.draw(); };

test('PACK-PICK the List form: its kinds presses, the pack\'s first - a realm character\'s form opens on it, the kind pressed kept for the market book\'s session and no other\'s; none chosen until a tile is pressed (a press again lets it go); the piece listed is the one pressed (mutants: the first by default; the kind unkept; the kind kept unread; the pack\'s form not first; a press that never lets go)', async () => {
  const { gear, goods } = pack();
  const book = bookOf(true);
  const a = tabOf(book, goods);
  await mine(a);
  assert.deepEqual([...a.root().querySelectorAll('button')].filter((b) => b.getAttribute('data-kind')).map((b) => b.getAttribute('data-kind')), LIST_KINDS.map(([k]) => k));
  assert.equal(a.press('item').getAttribute('aria-pressed'), 'true', 'a realm character\'s form opens on the pack');
  assert.equal(byClass(a.root(), 'market-kinds')[0].getAttribute('aria-label'), 'What to list');
  const listBtn = () => [...a.root().querySelectorAll('button')].find((b) => b.textContent === 'List');
  assert.equal(listBtn().disabled, true, 'nothing chosen: nothing to list');
  assert.equal(word(a.root(), 'packpick-cardnone'), 'Press a piece above to look at it and set its price.');
  const weapon = gear.find((it) => it.group === 'Weapons');
  const tile = () => tilesOf(a.root()).find((b) => word(b, 'packpick-name') === goods.goodName(weapon));
  tile().onclick();
  assert.equal(word(byClass(a.root(), 'packpick-card')[0], 'packpick-name'), goods.goodName(weapon));
  assert.equal(listBtn().disabled, false);
  tile().onclick();
  assert.equal(byClass(a.root(), 'packpick-card').length, 0, 'pressed again: let go');
  tile().onclick();
  await listBtn().onclick();
  assert.equal(book.listed.length, 1);
  assert.deepEqual([book.listed[0].kind, book.listed[0].item, book.listed[0].pick], ['item', goods.good(weapon).offered, goods.good(weapon).pick], 'the piece pressed, as the trade\'s wire writes it');
  // the kind kept: another board on the same book opens where this one was left; another book on its own default
  a.press('material').onclick();
  assert.equal(a.press('material').getAttribute('aria-pressed'), 'true');
  const b = tabOf(book, goods);
  await mine(b);
  assert.equal(b.press('material').getAttribute('aria-pressed'), 'true', 'kept for the session');
  const c = tabOf(bookOf(true), goods);
  await mine(c);
  assert.equal(c.press('item').getAttribute('aria-pressed'), 'true', 'another book\'s own');
  const d = tabOf(bookOf(false), goods);
  await mine(d);
  assert.equal(d.press('item'), undefined, 'gold is a realm character\'s');
  assert.equal(d.press('material').getAttribute('aria-pressed'), 'true');
});

test('PACK-PICK the Goods view: beside its filters, a realm character\'s "Sell from your pack" - My listings\' form opened on the pack, whatever kind was left; another character has none (mutants: the press for anyone; the press not on the pack)', async () => {
  const { goods } = pack();
  const t = tabOf(bookOf(true), goods);
  await mine(t);
  t.press('material').onclick();
  t.tab.state.view = 'goods';
  await t.tab.load(true);
  t.draw();
  const sell = byClass(t.root(), 'market-sellpack')[0];
  assert.equal(sell.textContent, 'Sell from your pack');
  assert.equal(sell.parentNode.className, 'market-filters', 'beside the filters');
  sell.onclick();
  await tick();
  t.draw();
  assert.deepEqual([t.tab.state.view, t.tab.state.list.kind], ['mine', 'item']);
  assert.equal(t.press('item').getAttribute('aria-pressed'), 'true');
  const other = tabOf(bookOf(false), goods);
  other.tab.state.view = 'goods';
  await other.tab.load(true);
  other.draw();
  assert.equal(byClass(other.root(), 'market-sellpack').length, 0);
});

test('PACK-PICK the stall: a trader\'s "Put up a piece from your pack" is the same picker - the stall\'s own pictures and look, the refused folded with why, none chosen until pressed, the piece put up the one pressed (mutants: the first by default; the stall\'s look unread)', async () => {
  const { gear, goods, quest } = pack();
  const put = [];
  const tab = createVendorTab({ mode: 'stall', own: true, read: async () => ({ ok: true, data: { rows: [] } }), nameOf: (it) => goods.goodName(it), purse: () => 100,
    stats: itemLook, goods: () => goods.goods(), put: async (it, p) => { put.push([it, p]); return { ok: true }; } },
  { busy: () => false, run: async (start) => start(), rerender: () => {}, nowS: () => 0, alive: () => true });
  await tab.open();
  let b = tab.body();
  const press = () => [...b.querySelectorAll('button')].find((x) => x.textContent === 'Put up for sale');
  assert.equal(press().disabled, true, 'nothing chosen');
  assert.ok([...byClass(byClass(b, 'packpick-refused')[0], 'packpick-tile')].some((n) => word(n, 'packpick-name') === goods.goodName(quest) && word(n, 'packpick-why') === 'a quest\'s'));
  const armour = gear.find((it) => it.group === 'Armor');
  tilesOf(b).find((x) => word(x, 'packpick-name') === goods.goodName(armour)).onclick();
  b = tab.body();
  assert.deepEqual([...byClass(b, 'packpick-stat')].map((n) => n.textContent), itemLook(armour).rows, 'the stall\'s own look');
  press().onclick();
  await tick();
  assert.deepEqual(put, [[armour, 100]]);
});

test('PACK-PICK the dress: the tiers\' colours laid inside the List form (the board is drawn on either skin), a tile framed by its tier, the kinds two by two on a phone (mutant: the tiers\' colours left to the Plus sheet)', () => {
  assert.match(PROF_CSS, /\.market-listform \[data-rarity="rare"\] \{ --rar: #e4c34f;/);
  assert.match(PROF_CSS, /\.packpick-tile\[data-rarity\] \{ border-color: var\(--rar-hi\) var\(--rar-lo\) var\(--rar-lo\) var\(--rar-hi\);/);
  assert.match(PROF_CSS, /\.market-kinds \{ display: grid; grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\); \}/);
});
