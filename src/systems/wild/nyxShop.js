// @ts-check
// BUNNYFALL (2026-11-04, the owner: "a 1% chance to drop a Dusk Token when killing enemies in there and the chance
// increases when going in the middle, a new event vendor Nyx should be added to the guild camp"): DUSK TOKENS AND WHAT
// NYX SELLS FOR THEM (systems/wild/cromwark.js says the reach's laws; scenes/cromwarkHost.js stands her camp).
//
//   THE COIN is its own template (NYX_COIN_TEMPLATE, past every other custom row), bound and stacking with its own kind
//   alone, as the Welkynd Shard (systems/gate/gateSpoils.js) - never traded, sold or listed. A gem's art.
//   THE GEAR is six Legendary records of the ladder's own (systems/loot/lootRarity.js registerLegendary), each `shopOnly`
//   - nothing rolls them (applyRarity's own pool leaves them out); the wire's law knows them as any Legendary. Their
//   powers are the ladder's own kinds, and three of the reach's (systems/loot/lootPowers.js 'cromwark'; 'hazewalk' and
//   'nyxluck' read here). Bought pieces are bound to the character.
//   THE COSMETICS are pieces of the pack (dyed garments) and of the ACCOUNT (two titles - net/insignia.js, paid in coins
//   the account service counted: server-account/src/nyx.js).
//
// Prices are the owner's: the gear tripled, Selantha's Ring 75; titles 15 and 30; a garment 20.
import { registerCustomTemplates, setItemFields, mintCondition, registerOwnItemImage } from '../item/itemTemplates.js';
import { installCurrencyArt, CURRENCY_ARCHIVE, DUSK_TOKEN_RECORD } from '../currencyArt.js';
import { registerLegendary, applyRarity, legendaryById } from '../loot/lootRarity.js';
import { createWeapon, WEAPONS_ENUM, ARMOR_ENUM } from '../../combat/enemyEquipment.js';
import { WEAPON_MATERIALS } from '../../characters/weapons.js';
import { ARMOR_MATERIAL } from '../armorMaterials.js';
import { DYE_COLORS } from '../../characters/dyes.js';
import { addItem } from '../inventory.js';
import { t } from '../textManager.js';

/** The coin's row: a gem's weight, a gem's art (TEXTURE.254 record 1), bound, stacking with its own kind. */
export const NYX_COIN_TEMPLATE = 2100;
export const NYX_COIN = Object.freeze({ name: 'Dusk Token', value: 100 });
registerCustomTemplates([{
  index: NYX_COIN_TEMPLATE, name: NYX_COIN.name, baseWeight: 0.05, hitPoints: 1000, basePrice: NYX_COIN.value, rarity: 20,
  worldTextureArchive: 254, worldTextureRecord: 1, stackable: true, bound: true,
}]);
// BUNNYFALL: the Dusk Token's own picture in every item list (the pack, the Stores, the shop), not the gem's it borrowed
installCurrencyArt();
registerOwnItemImage(NYX_COIN_TEMPLATE, () => ({ archive: CURRENCY_ARCHIVE, record: DUSK_TOKEN_RECORD }));
export const isNyxCoin = (/** @type {any} */ item) => item?.templateIndex === NYX_COIN_TEMPLATE;
/** `n` coins, one stack. */
export const nyxCoins = (n = 1) => Object.assign(mintCondition(setItemFields({ group: 'UselessItems2', templateIndex: NYX_COIN_TEMPLATE })), { stackCount: Math.max(1, Math.trunc(Number(n) || 1)) });
/** How many coins the pack holds. */
export const nyxCoinsHeld = (/** @type {any[]} */ items) => (items ?? []).reduce((n, it) => n + (isNyxCoin(it) ? Math.max(1, it.stackCount ?? 1) : 0), 0);
/** Take `n` coins out of the pack - false (nothing taken) when it holds fewer. */
export function spendNyxCoins(/** @type {any[]} */ items, /** @type {number} */ n) {
  if (!(n > 0)) return true;
  if (nyxCoinsHeld(items) < n) return false;
  let owed = n;
  for (let i = items.length - 1; i >= 0 && owed > 0; i--) {
    const it = items[i];
    if (!isNyxCoin(it)) continue;
    const have = Math.max(1, it.stackCount ?? 1);
    if (have <= owed) { items.splice(i, 1); owed -= have; } else { it.stackCount = have - owed; owed = 0; }
  }
  return true;
}
/** One coin (or more) into the pack, joined to its stack. */
export const giveNyxCoins = (/** @type {any[]} */ items, n = 1) => addItem(items, nyxCoins(n));
export const nyxCoinsText = (/** @type {number} */ n) => t('nyx.coins', '{n, plural, one {# Dusk Token} other {# Dusk Tokens}}', { n });

// ── THE GEAR: Legendary records nothing rolls ─────────────────────────────────────────────────────────────────────
const W = WEAPONS_ENUM, A = ARMOR_ENUM;
const NYX_HINT = 'Sold by Nyx at the Adventurers\' Guild camp, for Dusk Tokens';
/** The six, in the shop's order. `make` the piece before its tier: a template and a make. */
export const NYX_GEAR = Object.freeze([
  Object.freeze({ id: 'nyxaratahs-splinter', name: 'Nyxaratah\'s Splinter', group: 'Weapons', templates: [W.Staff], shopOnly: true, price: 240,
    make: { kind: 'weapon', templateIndex: W.Staff, material: WEAPON_MATERIALS.Daedric },
    enchantment: { type: 2, param: 54 },   // the same DFU line as the ladder's own record of the kind
    affixes: [{ id: 'damage', value: 25 }, { id: 'stat', param: 'intelligence', value: 15 }, { id: 'skill', param: 22, value: 25 }, { id: 'elemental', param: 'shock', value: 10 }],
    power: Object.freeze({ name: 'Splintered Barrier', kind: 'conduit', less: 20, mana: 3, brief: '-20% spell cost; hits give 3 MP', text: 'While you wield it, your spells cost 20% less magicka and each hit restores 3 magicka' }),
    lore: 'A sliver of the staff that raised Cromwark\'s barrier. It still hums with the ward it was torn from.', hint: NYX_HINT }),
  Object.freeze({ id: 'rodneys-folly', name: 'Rodney\'s Folly', group: 'Weapons', templates: [W.Dagger], shopOnly: true, price: 210,
    make: { kind: 'weapon', templateIndex: W.Dagger, material: WEAPON_MATERIALS.Daedric },
    enchantment: { type: 2, param: 67 },   // the same DFU line as the ladder's own record of the kind
    affixes: [{ id: 'damage', value: 30 }, { id: 'stat', param: 'luck', value: 15 }, { id: 'skill', param: 28, value: 25 }],
    power: Object.freeze({ name: 'Wabbajack\'s Whim', kind: 'echo', chance: 15, brief: '15% chance to strike twice', text: 'Each hit has a 15% chance to strike again for the same damage. Nobody knows why' }),
    lore: 'Rodney used it to open letters, before the Wabbajack opened him.', hint: NYX_HINT }),
  Object.freeze({ id: 'cromwark-blade', name: 'Cromwark Blade', group: 'Weapons', templates: [W.Longsword], shopOnly: true, price: 180,
    make: { kind: 'weapon', templateIndex: W.Longsword, material: WEAPON_MATERIALS.Daedric },
    enchantment: { type: 4, param: 2 },   // the same DFU line as the ladder's own record of the kind
    affixes: [{ id: 'damage', value: 35 }, { id: 'stat', param: 'strength', value: 12 }, { id: 'skill', param: 29, value: 25 }],
    power: Object.freeze({ name: 'Reachbane', kind: 'cromwark', pct: 50, brief: '+50% vs Cromwark\'s monsters', text: 'This weapon deals 50% more damage to the monsters of the reach of Cromwark' }),
    lore: 'The Guild forges one for every contract that comes back from the Heart.', hint: NYX_HINT }),
  Object.freeze({ id: 'haze-walker-boots', name: 'Haze-Walker Boots', group: 'Armor', templates: [A.Boots], shopOnly: true, price: 150,
    make: { kind: 'armor', templateIndex: A.Boots, material: ARMOR_MATERIAL.Daedric },
    enchantment: { type: 13, param: 1 },   // the same DFU line as the ladder's own record of the kind
    affixes: [{ id: 'armor', value: 15 }, { id: 'stat', param: 'speed', value: 12 }, { id: 'resist', param: 'magic', value: 40 }],
    power: Object.freeze({ name: 'Haze-Walker', kind: 'hazewalk', step: 80, brief: 'The haze climbs a third slower', text: 'While you wear them, the purple haze counter climbs one step every 80 seconds instead of every minute' }),
    lore: 'Stitched from the hide of something that lived in the haze, and liked it.', hint: NYX_HINT }),
  Object.freeze({ id: 'guild-wardens-shield', name: 'Guild Warden\'s Shield', group: 'Armor', templates: [A.Kite_Shield], shopOnly: true, price: 150,
    make: { kind: 'armor', templateIndex: A.Kite_Shield, material: ARMOR_MATERIAL.Daedric },
    enchantment: { type: 1, param: 39 },   // the same DFU line as the ladder's own record of the kind
    affixes: [{ id: 'armor', value: 18 }, { id: 'resist', param: 'magic', value: 45 }, { id: 'stat', param: 'endurance', value: 12 }],
    power: Object.freeze({ name: 'Bulwark', kind: 'bulwark', less: 5, brief: 'Blows on you: -5 damage', text: 'Each enemy hit on you deals 5 less damage, to a minimum of 1' }),
    lore: 'Selantha\'s wardens carry these at the barrier\'s edge, where the magic bites.', hint: NYX_HINT }),
  Object.freeze({ id: 'selanthas-ring', name: 'Selantha\'s Ring', group: 'Jewellery', templates: [135], shopOnly: true, price: 75,
    make: { kind: 'jewellery', templateIndex: 135 },
    enchantment: { type: 13, param: 1 },   // the same DFU line as the ladder's own record of the kind
    affixes: [{ id: 'stat', param: 'luck', value: 15 }, { id: 'stat', param: 'personality', value: 10 }, { id: 'resist', param: 'magic', value: 35 }],
    power: Object.freeze({ name: 'Guildmaster\'s Favour', kind: 'nyxluck', pct: 1, brief: '+1% Dusk Token chance', text: 'While you wear it, every kill in the reach of Cromwark is 1% more likely to drop a Dusk Token' }),
    lore: 'Selantha Virelith gives these to the adventurers she trusts. Nyx sells the rest.', hint: NYX_HINT }),
]);
for (const g of NYX_GEAR) registerLegendary({ id: g.id, name: g.name, group: g.group, templates: g.templates, shopOnly: true, affixes: g.affixes, enchantment: g.enchantment, power: g.power, lore: g.lore, hint: g.hint });

/** A piece of the gear, minted: the make, its Legendary tier from its own record alone, known and bound. */
export function mintNyxGear(/** @type {any} */ g) {
  const m = g.make;
  const base = m.kind === 'weapon' ? { group: 'Weapons', ...createWeapon(m.templateIndex, m.material) }
    : m.kind === 'armor' ? mintCondition(setItemFields({ group: 'Armor', templateIndex: m.templateIndex, material: m.material }))
      : mintCondition(setItemFields({ group: 'Jewellery', templateIndex: m.templateIndex }));
  const rec = legendaryById(g.id);
  const item = applyRarity(base, 'legendary', Math.random, rec ? [rec] : []);
  item.isIdentified = true;
  item.bound = true;
  return item;
}

// ── THE GARMENTS: dyed purple ────────────────────────────────────────────────────────────────────────────────────
/** `[men's template, women's template]`. */
export const NYX_GARMENTS = Object.freeze([
  Object.freeze({ id: 'nyx-cloak', name: 'Nyx-dyed Cloak', templates: [155, 192], price: 20 }),   // Formal Cloak
  Object.freeze({ id: 'nyx-robes', name: 'Nyx-dyed Robes', templates: [163, 200], price: 20 }),   // Plain Robes
]);
export function mintNyxGarment(/** @type {any} */ g, /** @type {string} */ gender) {
  const female = gender === 'female';
  const item = mintCondition(setItemFields({ group: female ? 'WomensClothing' : 'MensClothing', templateIndex: g.templates[female ? 1 : 0], dye: DYE_COLORS.Purple, variant: 0 }));
  item.bound = true;
  return item;
}

// ── THE TITLES: the account's (net/insignia.js) ─────────────────────────────────────────────────────────────────────
/** The Warden of the Heart is sold only to one who has stood this long on the haze's counter in the Heart (s). */
export const HEART_WARDEN_S = 600;

/** A gear or garment sale, made on the pack: the coins out, the piece in. `canCarry(item)` the pack's gate. */
export function nyxSale(/** @type {any} */ offer, { items, gender = 'male', canCarry = () => true }) {
  if (!offer) return { ok: false, text: t('nyx.gone', 'Nyx does not sell that.') };
  const piece = offer.make ? mintNyxGear(offer) : mintNyxGarment(offer, gender);
  if (nyxCoinsHeld(items) < offer.price) return { ok: false, text: t('nyx.short', 'You need {coins}.', { coins: nyxCoinsText(offer.price) }) };
  if (!canCarry(piece)) return { ok: false, reason: 'heavy' };
  spendNyxCoins(items, offer.price);
  addItem(items, piece);
  return { ok: true, item: piece, text: t('nyx.sold', 'Bought: {name}, for {coins}.', { name: offer.name, coins: nyxCoinsText(offer.price) }) };
}
