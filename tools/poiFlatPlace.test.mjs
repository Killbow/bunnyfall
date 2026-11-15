// Tests the asset browser's flat placers (src/ui/poi/poiFlatUi.js, registered via src/poi/poiAssetPlace.js) for
// billboards, mounted weapons, and paperdoll items, and verifies that every picture and item in the catalog either can
// be placed or reports a reason.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPoiFlatUi } from '../src/ui/poi/poiFlatUi.js';
import { setPoiAssetPlacer, poiAssetWhyNot, placePoiAsset } from '../src/poi/poiAssetPlace.js';
import { hydratePoiAssets } from '../src/poi/poiAssetCatalogue.js';
import { createPoiEdit, newPoiDoc } from '../src/poi/poiEdit.js';
import { placeFlatAt } from '../src/poi/poiFlatRows.js';
import { poiDocProblems } from '../src/poi/poiLaw.js';

/** Builds a test harness whose editor places the armed flat on drop just as poiEditorHost.js `standAt` does. */
function rig() {
  const edit = createPoiEdit();
  const doc = newPoiDoc({ id: 'poi-f1a7d0000001', px: 600, py: 250, x: 10, z: 10, name: 'Placed' });
  doc.flats = [];
  edit.open(doc.id, { doc, state: 'new' });
  edit.select({ id: doc.id, items: [] });
  let armed = null;
  const said = [];
  const editor = {
    active: () => true,
    placing: () => armed,
    placeFlat: (flat, fallbackName) => { armed = { flat, fallbackName }; },
    standAt: () => {
      if (!armed) return false;
      placeFlatAt({ edit, originOf: () => [0, 0, 0], at: [1, 0, 2], spot: { px: 600, py: 250, x: 10, z: 10 }, lift: 0, ground: 0, want: armed.flat, fallbackName: armed.fallbackName });
      armed = null;
      return true;
    },
  };
  const ui = createPoiFlatUi({ edit, editor, dialogsClosed: () => {} });
  const offs = Object.entries(ui.placers()).map(([placing, p]) => setPoiAssetPlacer(placing, p));
  const ctx = { editor, edit, at: { x: 10, y: 10 }, say: (s) => said.push(s) };
  return { edit, doc, ctx, said, armedNow: () => armed, letGo: () => { armed = null; }, standNow: () => editor.standAt(), off: () => offs.forEach((f) => f()) };
}

test('places a picture, a weapon, and a robe from the asset browser as flat rows', async () => {
  const r = rig();
  try {
    const entries = [
      { id: 'flat:210.2', name: 'Candle', kind: 'flat', placing: 'billboard', flat: [210, 2], category: 'lights', tags: [], source: 'TEXTURE.210' },
      { id: 'item:113', name: 'Dagger', kind: 'item', placing: 'mount', template: 113, group: 3, flat: [207, 5], category: 'items', tags: [], source: 'items' },
      { id: 'item:200', name: 'Plain Robes', kind: 'item', placing: 'paperdoll', template: 200, group: -1, flat: [204, 0], category: 'items', tags: [], source: 'items' },
    ];
    for (const a of entries) {
      assert.equal(poiAssetWhyNot(/** @type {any} */ (a)), null, a.id);
      assert.equal(await placePoiAsset(/** @type {any} */ (a), r.ctx), true, a.id);
    }
    const flats = r.edit.docOf(r.doc.id).flats;
    assert.deepEqual(flats.map((f) => f.kind), ['billboard', 'mount', 'paperdoll']);
    assert.deepEqual(flats[0].flat, [210, 2]);
    assert.ok(flats[0].light, 'a light of TEXTURE.210 gives light');
    assert.deepEqual(flats[1].item, { t: 113, g: 3 });
    assert.deepEqual(flats[1].flat, [234, 5], 'a mount is written with its pack picture');
    assert.deepEqual(flats[2].item, { t: 200 });
    assert.deepEqual(flats[2].flat, [204, 0]);
    assert.deepEqual(poiDocProblems(r.edit.docOf(r.doc.id)), []);
    // clicking Place (without a drop point) arms placement, prompts the user to click the ground, and resolves once
    // placed
    const clicked = placePoiAsset(/** @type {any} */ (entries[0]), { ...r.ctx, at: null });
    await new Promise((res) => setTimeout(res, 20));
    assert.ok(r.armedNow());
    assert.match(r.said.at(-1), /Click the ground/);
    r.standNow();
    assert.equal(await clicked, true, 'placed by the click');
    // canceling placement with Esc before clicking resolves to false so the browser's Recent list does not record it
    const dropped = placePoiAsset(/** @type {any} */ (entries[1]), { ...r.ctx, at: null });
    await new Promise((res) => setTimeout(res, 20));
    r.letGo();
    assert.equal(await dropped, false, 'canceled placement returns false');
    assert.equal(r.edit.docOf(r.doc.id).flats.length, 4);
  } finally { r.off(); }
});

test('a seafloor plant below archive 172 is placed; an item with no picture or a trophy with no beast is not, with its reason', () => {
  const r = rig();
  try {
    assert.equal(poiAssetWhyNot(/** @type {any} */ ({ id: 'flat:105.0', kind: 'flat', placing: 'billboard', flat: [105, 0] })), null);
    assert.match(poiAssetWhyNot(/** @type {any} */ ({ id: 'flat:x', kind: 'flat', placing: 'billboard' })), /Missing image/);
    assert.match(poiAssetWhyNot(/** @type {any} */ ({ id: 'item:220', kind: 'item', placing: 'paperdoll', template: 220, group: 8 })), /no world sprite/);
    assert.match(poiAssetWhyNot(/** @type {any} */ ({ id: 'item:601', kind: 'item', placing: 'mount', template: 601, group: 25 })), /needs its beast/);
  } finally { r.off(); }
});

test('every picture and item of the game\'s catalog has a placer', () => {
  const r = rig();
  try {
    const all = hydratePoiAssets(JSON.parse(readFileSync(new URL('../public/poi/asset-catalogue.json', import.meta.url), 'utf8')));
    const flatsAndItems = all.filter((a) => ['billboard', 'mount', 'paperdoll'].includes(a.placing));
    assert.ok(flatsAndItems.length > 6000);
    const later = flatsAndItems.filter((a) => /cannot be placed in this editor yet/.test(poiAssetWhyNot(a) ?? ''));
    assert.equal(later.length, 0);
  } finally { r.off(); }
});

test('while the editor is closed (a Test runs), nothing from the asset browser is placed or armed', async () => {
  const r = rig();
  try {
    const candle = { id: 'flat:210.2', name: 'Candle', kind: 'flat', placing: 'billboard', flat: [210, 2], category: 'lights', tags: [], source: 'TEXTURE.210' };
    r.ctx.editor.active = () => false;
    assert.equal(await placePoiAsset(/** @type {any} */ (candle), { ...r.ctx, at: null }), false);
    assert.equal(r.armedNow(), null, 'no placement waits for the editor to open again');
    assert.equal(r.said.length, 0);
    assert.equal(r.edit.docOf(r.doc.id).flats?.length ?? 0, 0);
  } finally { r.off(); }
});
