// @ts-check

import { ITEM_TEMPLATES, registerCustomTemplates, setItemFields, mintCondition, registerTemplateLore, registerOwnItemImage } from '../items/itemTemplates.js';
import { registerTabledLootHandler } from '../items/loot.js';
import { addVendorTextures } from '../render/textureReplacement.js';
import { APP_ROOT } from '../platform/appRoot.js';
import { BALLISTA_TEMPLATE, GRAPPLE_TEMPLATE, BALLISTA_ARCHIVE, GRAPPLE_ARCHIVE } from '../characters/heavyGearIds.js';

export { BALLISTA_TEMPLATE, GRAPPLE_TEMPLATE };
const LONG_BOW = 130;
const DAGGER = 113;

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
registerTemplateLore(GRAPPLE_TEMPLATE, 'Three iron prongs and a long rope. Press its key to throw it from your pack at a wall, a ledge, or the ground, and it pulls you there. The rope takes a moment to coil again.');

export function createBallista({ material = 0 } = {}) {
  return mintCondition(setItemFields({
    group: 'Weapons', templateIndex: BALLISTA_TEMPLATE, material, flags: 0, variant: 0, message: 0, stackCount: 1,
  }));
}
export function createGrapplingHook() {
  return mintCondition(setItemFields({
    group: 'Weapons', templateIndex: GRAPPLE_TEMPLATE, material: 0, flags: 0, variant: 0, message: 0, stackCount: 1,
  }));
}

const metalFor = (/** @type {number} */ quality, /** @type {() => number} */ rolls) => Math.min(4, Math.floor(rolls() * (1 + quality / 4)));
const clampQuality = (/** @type {any} */ quality) => Math.max(1, Math.min(20, Math.trunc(Number(quality)) || 1));

export const BALLISTA_SHOP_QUALITY = 12;
export const BALLISTA_SHOP_CHANCE = 0.5;
export const GRAPPLE_SHOP_QUALITY = 5;
// `kind` is a plain name rather than a `BUILDING_TYPES` value so the headless item law on the account service can
// import this file.
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

// Percent chance in a dungeon pile; classic loot table keys J to O are the dungeon piles.
export const BALLISTA_PILE_PERCENT = 1;
export const GRAPPLE_PILE_PERCENT = 2;
const isDungeonPileKey = (/** @type {any} */ key) => { const n = String(key ?? '').charCodeAt(0) - 64; return n >= 10 && n <= 15; };
export function rollHeavyGearLoot(/** @type {any[]} */ items, rolls = Math.random) {
  if (rolls() * 100 < BALLISTA_PILE_PERCENT) items.push(createBallista({ material: metalFor(10, rolls) }));
  if (rolls() * 100 < GRAPPLE_PILE_PERCENT) items.push(createGrapplingHook());
  return items;
}

export const HEAVY_GEAR_ICONS = Object.freeze([
  { archive: BALLISTA_ARCHIVE, record: 0, frame: 0, file: 'bunnyfall-ballista/ballista-icon.png' },
  { archive: GRAPPLE_ARCHIVE, record: 0, frame: 0, file: 'bunnyfall-grapple/grapple-icon.png' },
]);
registerOwnItemImage(BALLISTA_TEMPLATE, (_item, { forPaperDoll = false } = {}) => (forPaperDoll ? null : { archive: BALLISTA_ARCHIVE, record: 0 }));
registerOwnItemImage(GRAPPLE_TEMPLATE, (_item, { forPaperDoll = false } = {}) => (forPaperDoll ? null : { archive: GRAPPLE_ARCHIVE, record: 0 }));

// Resolves against the app root rather than the document URL, so the art loads under any page path.
export const heavyGearArtUrl = (/** @type {string} */ file) => new URL(`art/${file}`, APP_ROOT ?? globalThis.document?.baseURI ?? 'http://localhost/').href;

let _installed = false;
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
