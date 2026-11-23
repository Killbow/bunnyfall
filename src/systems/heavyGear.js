// @ts-check
// BUNNYFALL: THE ROYAL BALLISTA AND THE GRAPPLING HOOK - their rows, their words, how they are minted, where they are
// sold and found, and their pictures in a list. The numbers are characters/heavyGearIds.js's (a leaf).
//   - The Royal Ballista (564): a heavier crossbow on the bow's own machine. It spends arrows and is scored on Archery;
//     its bolt flies on an arc and bursts where it lands (combat/ballista/ballistaFlight.js); drawn, it slows its bearer.
//     A Weapons row copied from the Long Bow (so the paperdoll shows a bow, as the crossbow's does), in the metal ladder.
//   - The Grappling Hook (565): held in the hand like a dagger, never swung. A click throws it; what it catches the
//     bearer is pulled to (combat/grapple/grapple.js). Iron only.
//   - First-person art: combat/heavyGearArt.js. The owner's own art lives in public/art/bunnyfall-ballista/ and
//     public/art/bunnyfall-grapple/ (the originals under owner/).
//   - Where: the Royal Ballista on a good Weapon Smith's shelf, now and then, and rarely in a deep dungeon pile; the
//     hook on a General Store's and a Pawn Shop's shelf, and now and then in a dungeon pile.

import { ITEM_TEMPLATES, registerCustomTemplates, setItemFields, mintCondition, registerTemplateLore, registerOwnItemImage } from '../items/itemTemplates.js';
import { registerTabledLootHandler } from '../items/loot.js';
import { addVendorTextures } from '../render/textureReplacement.js';
import { APP_ROOT } from '../platform/appRoot.js';
import { BALLISTA_TEMPLATE, GRAPPLE_TEMPLATE, BALLISTA_ARCHIVE, GRAPPLE_ARCHIVE } from '../characters/heavyGearIds.js';

export { BALLISTA_TEMPLATE, GRAPPLE_TEMPLATE };
const LONG_BOW = 130;
const DAGGER = 113;

/** The Royal Ballista's row: the Long Bow's, far heavier and dearer. */
export const BALLISTA_ROW = Object.freeze({
  ...ITEM_TEMPLATES[LONG_BOW],
  index: BALLISTA_TEMPLATE,
  name: 'Royal Ballista',
  baseWeight: 9,
  basePrice: 160,
  hitPoints: 160,
  enchantmentPoints: 450,
  rarity: 1,
  isOneHanded: false,
});
/** The hook's row: the Dagger's place in the hand, an iron tool's weight and price. */
export const GRAPPLE_ROW = Object.freeze({
  ...ITEM_TEMPLATES[DAGGER],
  index: GRAPPLE_TEMPLATE,
  name: 'Grappling Hook',
  baseWeight: 2,
  basePrice: 45,
  hitPoints: 120,
  enchantmentPoints: 0,
  rarity: 1,
  isOneHanded: true,
});
registerCustomTemplates([BALLISTA_ROW, GRAPPLE_ROW]);
registerTemplateLore(BALLISTA_TEMPLATE, 'A siege engine cut down to a soldier\'s arms, crowned on the stock. It lobs its bolt high and the bolt bursts where it lands, striking all about it. It is a slow thing to carry and slower to wind.');
registerTemplateLore(GRAPPLE_TEMPLATE, 'Three iron prongs on a pole and a long rope. Throw it at a wall, a ledge or the ground ahead and it hauls you there. The rope needs a moment to be coiled again.');

/** Mint a Royal Ballista. Material rides the weapon metal ladder (0 Iron .. 9 Daedric). */
export function createBallista({ material = 0 } = {}) {
  return mintCondition(setItemFields({
    group: 'Weapons', templateIndex: BALLISTA_TEMPLATE, material, flags: 0, variant: 0, message: 0, stackCount: 1,
  }));
}
/** Mint a Grappling Hook (iron, always). */
export function createGrapplingHook() {
  return mintCondition(setItemFields({
    group: 'Weapons', templateIndex: GRAPPLE_TEMPLATE, material: 0, flags: 0, variant: 0, message: 0, stackCount: 1,
  }));
}

/** Better shops and richer finds reach for better metal: Iron..Dwarven at the best (the crossbow's ladder). */
const metalFor = (/** @type {number} */ quality, /** @type {() => number} */ rolls) => Math.min(4, Math.floor(rolls() * (1 + quality / 4)));
const clampQuality = (/** @type {any} */ quality) => Math.max(1, Math.min(20, Math.trunc(Number(quality)) || 1));

/** A shop's first shelf, after its other draws: what it adds. A Weapon Smith of quality 12 or more carries a Royal
 *  Ballista on half its days; a General Store or a Pawn Shop of quality 5 or more carries a Grappling Hook. */
export const BALLISTA_SHOP_QUALITY = 12;
export const BALLISTA_SHOP_CHANCE = 0.5;
export const GRAPPLE_SHOP_QUALITY = 5;
/** `kind` 'WeaponSmith', 'GeneralStore' or 'PawnShop' (any other answers nothing) - a name, not BUILDING_TYPES, so the
 *  account service reading this file headless (systems/item/itemLaw.js) does not pull the town's names in. */
export function heavyGearShelfStock(/** @type {string | null} */ kind, /** @type {number} */ shelfIndex, quality = 10, rolls = Math.random) {
  if (shelfIndex !== 0) return [];
  const q = clampQuality(quality);
  if (kind === 'WeaponSmith') {
    return q >= BALLISTA_SHOP_QUALITY && rolls() < BALLISTA_SHOP_CHANCE ? [createBallista({ material: metalFor(q, rolls) })] : [];
  }
  if (kind === 'GeneralStore' || kind === 'PawnShop') {
    return q >= GRAPPLE_SHOP_QUALITY ? [createGrapplingHook()] : [];
  }
  return [];
}

/** A dungeon pile's (keys J-O) chance of each, in percent. Neither comes off a foe: no one fights with them. */
export const BALLISTA_PILE_PERCENT = 1;
export const GRAPPLE_PILE_PERCENT = 2;
const isDungeonPileKey = (/** @type {any} */ key) => { const n = String(key ?? '').charCodeAt(0) - 64; return n >= 10 && n <= 15; };
export function rollHeavyGearLoot(/** @type {any[]} */ items, rolls = Math.random) {
  if (rolls() * 100 < BALLISTA_PILE_PERCENT) items.push(createBallista({ material: metalFor(10, rolls) }));
  if (rolls() * 100 < GRAPPLE_PILE_PERCENT) items.push(createGrapplingHook());
  return items;
}

// ── THEIR PICTURES IN A LIST ─────────────────────────────────────────
// The Thunderlock's door (systems/thunderlock.js installThunderlockIcons): our own PNGs as stand-ins for archives that
// exist only as this art. Record 0 is the list picture; on the paperdoll they keep their rows' own layers (the Long
// Bow's and the Dagger's) until there is body art, as the crossbow does.
export const HEAVY_GEAR_ICONS = Object.freeze([
  { archive: BALLISTA_ARCHIVE, record: 0, frame: 0, file: 'bunnyfall-ballista/ballista-icon.png' },
  { archive: GRAPPLE_ARCHIVE, record: 0, frame: 0, file: 'bunnyfall-grapple/grapple-icon.png' },
]);
registerOwnItemImage(BALLISTA_TEMPLATE, (_item, { forPaperDoll = false } = {}) => (forPaperDoll ? null : { archive: BALLISTA_ARCHIVE, record: 0 }));
registerOwnItemImage(GRAPPLE_TEMPLATE, (_item, { forPaperDoll = false } = {}) => (forPaperDoll ? null : { archive: GRAPPLE_ARCHIVE, record: 0 }));

/** The site's root, never the document's (AUDIT-THUNDERLOCK F7). */
export const heavyGearArtUrl = (/** @type {string} */ file) => new URL(`art/${file}`, APP_ROOT ?? globalThis.document?.baseURI ?? 'http://localhost/').href;

let _installed = false;
/** The loot roll and the pictures, once, in every host (scenes/shared.js, beside the crossbow's). */
export function installHeavyGear() {
  if (_installed) return;
  _installed = true;
  registerTabledLootHandler('HEAVY-GEAR', ({ key, items, rolls }) => { if (isDungeonPileKey(key)) rollHeavyGearLoot(items, rolls); });
  addVendorTextures(HEAVY_GEAR_ICONS.map(({ archive, record, frame, file }) => ({
    archive, record, frame, fileName: file.split('/').pop(), standIn: true,
    load: async () => {
      const r = await fetch(heavyGearArtUrl(file));
      if (!r.ok) throw new Error(`${file}: ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    },
  })));
}
