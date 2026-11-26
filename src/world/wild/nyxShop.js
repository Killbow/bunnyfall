// @ts-check
import { registerCustomTemplates, setItemFields, mintCondition, registerOwnItemImage } from '../../items/itemTemplates.js';
import { installCurrencyArt, CURRENCY_ARCHIVE, DUSK_TOKEN_RECORD } from '../../trade/currencyArt.js';
import { registerLegendary, applyRarity, legendaryById } from '../../items/lootRarity.js';
import { createWeapon, WEAPONS_ENUM, ARMOR_ENUM } from '../../combat/enemyEquipment.js';
import { WEAPON_MATERIALS } from '../../characters/weapons.js';
import { ARMOR_MATERIAL } from '../../items/armorMaterials.js';
import { DYE_COLORS } from '../../characters/dyes.js';
import { addItem } from '../../items/inventory.js';
import { t } from '../../ui/textManager.js';

export const NYX_COIN_TEMPLATE = 2100;
export const NYX_COIN = Object.freeze({ name: 'Dusk Token', value: 100 });
registerCustomTemplates([{
  index: NYX_COIN_TEMPLATE, name: NYX_COIN.name, baseWeight: 0.05, hitPoints: 1000, basePrice: NYX_COIN.value, rarity: 20,
  worldTextureArchive: CURRENCY_ARCHIVE, worldTextureRecord: DUSK_TOKEN_RECORD, stackable: true, bound: true,
}]);
installCurrencyArt();
registerOwnItemImage(NYX_COIN_TEMPLATE, () => ({ archive: CURRENCY_ARCHIVE, record: DUSK_TOKEN_RECORD }));
export const isNyxCoin = (/** @type {any} */ item) => item?.templateIndex === NYX_COIN_TEMPLATE;
export const nyxCoins = (n = 1) => Object.assign(mintCondition(setItemFields({ group: 'UselessItems2', templateIndex: NYX_COIN_TEMPLATE })), { stackCount: Math.max(1, Math.trunc(Number(n) || 1)) });
export const nyxCoinsHeld = (/** @type {any[]} */ items) => (items ?? []).reduce((n, it) => n + (isNyxCoin(it) ? Math.max(1, it.stackCount ?? 1) : 0), 0);
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
export const giveNyxCoins = (/** @type {any[]} */ items, n = 1) => addItem(items, nyxCoins(n));
export const nyxCoinsText = (/** @type {number} */ n) => t('nyx.coins', '{n, plural, one {# Dusk Token} other {# Dusk Tokens}}', { n });

const W = WEAPONS_ENUM, A = ARMOR_ENUM;
const NYX_HINT = 'Sold by Nyx at the Adventurers\' Guild camp, for Dusk Tokens';
export const NYX_GEAR = Object.freeze([
  Object.freeze({ id: 'nyxaratahs-splinter', name: 'Nyxaratah\'s Splinter', group: 'Weapons', templates: [W.Staff], shopOnly: true, price: 240,
    make: { kind: 'weapon', templateIndex: W.Staff, material: WEAPON_MATERIALS.Daedric },
    enchantment: { type: 2, param: 54 },
    affixes: [{ id: 'damage', value: 25 }, { id: 'stat', param: 'intelligence', value: 15 }, { id: 'skill', param: 22, value: 25 }, { id: 'elemental', param: 'shock', value: 10 }],
    power: Object.freeze({ name: 'Splintered Barrier', kind: 'conduit', less: 20, mana: 3, brief: '-20% spell cost; hits give 3 MP', text: 'While you wield it, your spells cost 20% less magicka and each hit restores 3 magicka' }),
    lore: 'A sliver of the staff that raised Cromwark\'s barrier. It still hums with the ward it was torn from.', hint: NYX_HINT }),
  Object.freeze({ id: 'rodneys-folly', name: 'Rodney\'s Folly', group: 'Weapons', templates: [W.Dagger], shopOnly: true, price: 210,
    make: { kind: 'weapon', templateIndex: W.Dagger, material: WEAPON_MATERIALS.Daedric },
    enchantment: { type: 2, param: 67 },
    affixes: [{ id: 'damage', value: 30 }, { id: 'stat', param: 'luck', value: 15 }, { id: 'skill', param: 28, value: 25 }],
    power: Object.freeze({ name: 'Wabbajack\'s Whim', kind: 'echo', chance: 15, brief: '15% chance to strike twice', text: 'Each hit has a 15% chance to strike again for the same damage. Nobody knows why' }),
    lore: 'Rodney used it to open letters, before the Wabbajack opened him.', hint: NYX_HINT }),
  Object.freeze({ id: 'cromwark-blade', name: 'Cromwark Blade', group: 'Weapons', templates: [W.Longsword], shopOnly: true, price: 180,
    make: { kind: 'weapon', templateIndex: W.Longsword, material: WEAPON_MATERIALS.Daedric },
    enchantment: { type: 4, param: 2 },
    affixes: [{ id: 'damage', value: 35 }, { id: 'stat', param: 'strength', value: 12 }, { id: 'skill', param: 29, value: 25 }],
    power: Object.freeze({ name: 'Reachbane', kind: 'cromwark', pct: 50, brief: '+50% vs Cromwark\'s monsters', text: 'This weapon deals 50% more damage to the monsters of the reach of Cromwark' }),
    lore: 'The Guild forges one for every contract that comes back from the Heart.', hint: NYX_HINT }),
  Object.freeze({ id: 'haze-walker-boots', name: 'Haze-Walker Boots', group: 'Armor', templates: [A.Boots], shopOnly: true, price: 150,
    make: { kind: 'armor', templateIndex: A.Boots, material: ARMOR_MATERIAL.Daedric },
    enchantment: { type: 13, param: 1 },
    affixes: [{ id: 'armor', value: 15 }, { id: 'stat', param: 'speed', value: 12 }, { id: 'resist', param: 'magic', value: 40 }],
    power: Object.freeze({ name: 'Haze-Walker', kind: 'hazewalk', step: 80, brief: 'Frozen slows last half as long', text: 'While you wear them, slowing blasts from Frozen last two seconds instead of four' }),
    lore: 'Stitched from the hide of something that lived in the haze, and liked it.', hint: NYX_HINT }),
  Object.freeze({ id: 'guild-wardens-shield', name: 'Guild Warden\'s Shield', group: 'Armor', templates: [A.Kite_Shield], shopOnly: true, price: 150,
    make: { kind: 'armor', templateIndex: A.Kite_Shield, material: ARMOR_MATERIAL.Daedric },
    enchantment: { type: 1, param: 39 },
    affixes: [{ id: 'armor', value: 18 }, { id: 'resist', param: 'magic', value: 45 }, { id: 'stat', param: 'endurance', value: 12 }],
    power: Object.freeze({ name: 'Bulwark', kind: 'bulwark', less: 5, brief: 'Blows on you: -5 damage', text: 'Each enemy hit on you deals 5 less damage, to a minimum of 1' }),
    lore: 'Selantha\'s wardens carry these at the barrier\'s edge, where the magic bites.', hint: NYX_HINT }),
  Object.freeze({ id: 'selanthas-ring', name: 'Selantha\'s Ring', group: 'Jewellery', templates: [135], shopOnly: true, price: 75,
    make: { kind: 'jewellery', templateIndex: 135 },
    enchantment: { type: 13, param: 1 },
    affixes: [{ id: 'stat', param: 'luck', value: 15 }, { id: 'stat', param: 'personality', value: 10 }, { id: 'resist', param: 'magic', value: 35 }],
    power: Object.freeze({ name: 'Guildmaster\'s Favour', kind: 'nyxluck', pct: 1, brief: '+1% Dusk Token chance', text: 'While you wear it, every kill in the reach of Cromwark is 1% more likely to drop a Dusk Token' }),
    lore: 'Selantha Virelith gives these to the adventurers she trusts. Nyx sells the rest.', hint: NYX_HINT }),
]);
for (const g of NYX_GEAR) registerLegendary({ id: g.id, name: g.name, group: g.group, templates: g.templates, shopOnly: true, affixes: g.affixes, enchantment: g.enchantment, power: g.power, lore: g.lore, hint: g.hint });

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

export const NYX_GARMENTS = Object.freeze([
  Object.freeze({ id: 'nyx-cloak', name: 'Nyx-dyed Cloak', templates: [155, 192], price: 20 }),
  Object.freeze({ id: 'nyx-robes', name: 'Nyx-dyed Robes', templates: [163, 200], price: 20 }),
]);
export function mintNyxGarment(/** @type {any} */ g, /** @type {string} */ gender) {
  const female = gender === 'female';
  const item = mintCondition(setItemFields({ group: female ? 'WomensClothing' : 'MensClothing', templateIndex: g.templates[female ? 1 : 0], dye: DYE_COLORS.Purple, variant: 0 }));
  item.bound = true;
  return item;
}

export const HEART_WARDEN_S = 600;

export function nyxSale(/** @type {any} */ offer, /** @type {{ items: any[], gender?: string, canCarry?: (item: any) => boolean }} */ { items, gender = 'male', canCarry = () => true }) {
  if (!offer) return { ok: false, text: t('nyx.gone', 'Nyx does not sell that.') };
  const piece = offer.make ? mintNyxGear(offer) : mintNyxGarment(offer, gender);
  if (nyxCoinsHeld(items) < offer.price) return { ok: false, text: t('nyx.short', 'You need {coins}.', { coins: nyxCoinsText(offer.price) }) };
  if (!canCarry(piece)) return { ok: false, reason: 'heavy' };
  spendNyxCoins(items, offer.price);
  addItem(items, piece);
  return { ok: true, item: piece, text: t('nyx.sold', 'Bought: {name}, for {coins}.', { name: offer.name, coins: nyxCoinsText(offer.price) }) };
}
