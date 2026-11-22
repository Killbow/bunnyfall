// @ts-check
// BUNNYFALL (2026-11-20, the owner: "a shop for donators to get unique items with special imprints on them and maybe some
// welkynd shards using this temporary currency ... some of the new imprints should also be for the crossbow"): WHAT THE
// SENTINEL ENVOY SELLS FOR GARRISON TOKENS. The tokens are a balance the account service keeps (server-account/src/sentinel.js,
// net/sentinelLaw.js has the offers and their prices); here are the pieces themselves, made on the pack once the service has
// taken the price.
//
//   THE GEAR is eleven Legendary records nothing rolls (`shopOnly`, as Nyx's are - systems/wild/nyxShop.js): a ring and a shield,
//   and nine arms - two swords, an axe, a hammer, a dagger, a staff, a longbow and two crossbows. Each carries an IMPRINT - a
//   named power of the ladder's own kinds (systems/loot/lootRarity.js, lootPowers.js), so every power here is one the combat
//   code already runs: Echo, Rage, Flow, Venom, Conduit, Hunter's Moon, an Earthshaker's splash, a Chain Lightning's arc, the
//   Bulwark. Bought pieces are known and bound to the character.
//   THE SHARDS are Welkynd Shards (systems/gate/gateSpoils.js), bound as they always are.
import { setItemFields, mintCondition } from './item/itemTemplates.js';
import { registerLegendary, applyRarity, legendaryById } from './loot/lootRarity.js';
import { createWeapon, WEAPONS_ENUM, ARMOR_ENUM } from '../combat/enemyEquipment.js';
import { WEAPON_MATERIALS } from '../characters/weapons.js';
import { ARMOR_MATERIAL } from './armorMaterials.js';
import { createCrossbow, CROSSBOW_TEMPLATE } from './crossbow.js';
import { welkyndShards } from './gate/gateSpoils.js';
import { SKILLS } from './skills.js';
import { sentinelOfferById } from '../net/sentinelLaw.js';

const W = WEAPONS_ENUM, A = ARMOR_ENUM;
const HINT = "Sold by Sentinel's envoy, for Garrison Tokens";

/** The eleven (a ring, a shield, and nine arms: swords, an axe, a hammer, a dagger, a staff, a bow and two crossbows), by their offer id (net/sentinelLaw.js SENTINEL_OFFERS holds the prices). */
export const SENTINEL_GEAR = Object.freeze([
  Object.freeze({ id: 'envoys-signet', name: "Envoy's Signet", group: 'Jewellery', templates: [135], shopOnly: true,
    make: { kind: 'jewellery', templateIndex: 135 },
    enchantment: { type: 13, param: 1 },
    affixes: [{ id: 'stat', param: 'luck', value: 12 }, { id: 'stat', param: 'personality', value: 12 }, { id: 'resist', param: 'magic', value: 30 }],
    power: Object.freeze({ name: 'Open Hand', kind: 'conduit', less: 10, mana: 2, brief: '-10% spell cost; hits give 2 MP', text: 'While you wear it, your spells cost 10% less magicka and each hit restores 2 magicka' }),
    lore: "Sentinel's envoys carry these to prove whose word they speak. It is warm, as if just taken off.", hint: HINT }),
  Object.freeze({ id: 'garrison-wall', name: 'Garrison Wall', group: 'Armor', templates: [A.Kite_Shield], shopOnly: true,
    make: { kind: 'armor', templateIndex: A.Kite_Shield, material: ARMOR_MATERIAL.Daedric },
    enchantment: { type: 1, param: 39 },
    affixes: [{ id: 'armor', value: 16 }, { id: 'resist', param: 'magic', value: 40 }, { id: 'stat', param: 'endurance', value: 12 }],
    power: Object.freeze({ name: 'Hold the Line', kind: 'bulwark', less: 6, brief: 'Blows on you: -6 damage', text: 'Each enemy hit on you deals 6 less damage, to a minimum of 1' }),
    lore: 'The garrison stood behind these for two winters on half rations. Every dent is a name.', hint: HINT }),
  Object.freeze({ id: 'banners-edge', name: "Banner's Edge", group: 'Weapons', templates: [W.Longsword], shopOnly: true,
    make: { kind: 'weapon', templateIndex: W.Longsword, material: WEAPON_MATERIALS.Daedric },
    enchantment: { type: 4, param: 2 },
    affixes: [{ id: 'damage', value: 30 }, { id: 'stat', param: 'strength', value: 12 }, { id: 'skill', param: 29, value: 25 }],
    power: Object.freeze({ name: 'Standard Raised', kind: 'echo', chance: 12, brief: '12% chance to strike twice', text: 'Each hit has a 12% chance to strike again for the same damage' }),
    lore: 'Struck for the warrior who carried the garrison\'s banner and would not set it down.', hint: HINT }),
  Object.freeze({ id: 'garrison-ballista', name: 'Garrison Ballista', group: 'Weapons', templates: [CROSSBOW_TEMPLATE], shopOnly: true,
    make: { kind: 'crossbow', templateIndex: CROSSBOW_TEMPLATE, material: WEAPON_MATERIALS.Daedric },
    enchantment: { type: 4, param: 2 },
    affixes: [{ id: 'damage', value: 30 }, { id: 'stat', param: 'agility', value: 12 }, { id: 'skill', param: SKILLS.Archery, value: 25 }],
    power: Object.freeze({ name: 'Crossfire', kind: 'chain', metres: 6, share: 60, brief: 'Bolts jump 60% to a nearby foe', text: 'Each bolt that hits jumps to the nearest other enemy within 6 m, dealing 60% of its damage as shock' }),
    lore: 'Wound by the garrison\'s crossbowmen at the edge of the reach, where the air still smells of storm.', hint: HINT }),
  Object.freeze({ id: 'sunderers-bolt', name: "Sunderer's Bolt", group: 'Weapons', templates: [CROSSBOW_TEMPLATE], shopOnly: true,
    make: { kind: 'crossbow', templateIndex: CROSSBOW_TEMPLATE, material: WEAPON_MATERIALS.Daedric },
    enchantment: { type: 4, param: 2 },
    affixes: [{ id: 'damage', value: 35 }, { id: 'stat', param: 'strength', value: 10 }, { id: 'skill', param: SKILLS.Archery, value: 25 }],
    power: Object.freeze({ name: 'Rampart Breaker', kind: 'quake', metres: 3, share: 30, brief: 'Hits splash 30% within 3 m', text: 'Each hit also deals 30% of its damage to every other enemy within 3 m' }),
    lore: 'Made to take a wall down. The garrison has one to spare, and no wall left to break.', hint: HINT }),
  Object.freeze({ id: 'wardens-claymore', name: "Warden's Claymore", group: 'Weapons', templates: [W.Claymore], shopOnly: true,
    make: { kind: 'weapon', templateIndex: W.Claymore, material: WEAPON_MATERIALS.Daedric },
    enchantment: { type: 4, param: 2 },
    affixes: [{ id: 'damage', value: 35 }, { id: 'stat', param: 'strength', value: 14 }, { id: 'skill', param: SKILLS.LongBlade, value: 25 }],
    power: Object.freeze({ name: 'Last Rampart', kind: 'rage', heal: 10, below: 33, pct: 30, brief: 'Kills heal 10%; +30% when low', text: 'While you wield it, each kill heals you for 10% of your health, and below 33% health its hits deal 30% more damage' }),
    lore: 'Two hands to lift it, and the garrison\'s wardens never needed a third.', hint: HINT }),
  Object.freeze({ id: 'oathkeepers-axe', name: "Oathkeeper's Axe", group: 'Weapons', templates: [W['War Axe']], shopOnly: true,
    make: { kind: 'weapon', templateIndex: W['War Axe'], material: WEAPON_MATERIALS.Daedric },
    enchantment: { type: 4, param: 2 },
    affixes: [{ id: 'damage', value: 32 }, { id: 'stat', param: 'strength', value: 12 }, { id: 'skill', param: SKILLS.Axe, value: 25 }],
    power: Object.freeze({ name: 'Cleave the Line', kind: 'quake', metres: 3, share: 25, brief: 'Hits splash 25% within 3 m', text: 'Each hit also deals 25% of its damage to every other enemy within 3 m' }),
    lore: 'Sworn on at the edge of the reach, and kept after the oath was forgotten.', hint: HINT }),
  Object.freeze({ id: 'garrison-maul', name: 'Garrison Maul', group: 'Weapons', templates: [W.Warhammer], shopOnly: true,
    make: { kind: 'weapon', templateIndex: W.Warhammer, material: WEAPON_MATERIALS.Daedric },
    enchantment: { type: 4, param: 2 },
    affixes: [{ id: 'damage', value: 34 }, { id: 'stat', param: 'strength', value: 12 }, { id: 'skill', param: SKILLS.BluntWeapon, value: 25 }],
    power: Object.freeze({ name: 'Momentum', kind: 'flow', pct: 6, max: 5, seconds: 6, brief: '+6% per hit, up to 5 (6s)', text: 'Each hit gives you Flow for 6 s, up to 5 times: +6% weapon damage each time' }),
    lore: 'Slow to swing and slower to stop. The garrison used it to drive the stakes of their palisade.', hint: HINT }),
  Object.freeze({ id: 'quiet-oath', name: 'Quiet Oath', group: 'Weapons', templates: [W.Dagger], shopOnly: true,
    make: { kind: 'weapon', templateIndex: W.Dagger, material: WEAPON_MATERIALS.Daedric },
    enchantment: { type: 2, param: 67 },
    affixes: [{ id: 'damage', value: 30 }, { id: 'stat', param: 'agility', value: 12 }, { id: 'skill', param: SKILLS.ShortBlade, value: 25 }],
    power: Object.freeze({ name: "Envoy's Kiss", kind: 'venom', flat: 8, brief: '+8 poison, x2 under half', text: 'Each hit adds 8 poison damage, doubled against enemies below half health. Enemies that resist poison take half, and immune ones take none' }),
    lore: 'What an envoy keeps in his sleeve for the conversation that goes badly.', hint: HINT }),
  Object.freeze({ id: 'tallow-staff', name: 'Tallow Staff', group: 'Weapons', templates: [W.Staff], shopOnly: true,
    make: { kind: 'weapon', templateIndex: W.Staff, material: WEAPON_MATERIALS.Daedric },
    enchantment: { type: 2, param: 54 },
    affixes: [{ id: 'damage', value: 22 }, { id: 'stat', param: 'intelligence', value: 14 }, { id: 'skill', param: SKILLS.Destruction, value: 25 }],
    power: Object.freeze({ name: 'Banked Embers', kind: 'conduit', less: 15, mana: 3, brief: '-15% spell cost; hits give 3 MP', text: 'While you wield it, your spells cost 15% less magicka and each hit restores 3 magicka' }),
    lore: 'The garrison\'s hedge-mage burned tallow in its head through the long winter, for light and for luck.', hint: HINT }),
  Object.freeze({ id: 'banners-bow', name: "Banner's Bow", group: 'Weapons', templates: [W['Long Bow']], shopOnly: true,
    make: { kind: 'weapon', templateIndex: W['Long Bow'], material: WEAPON_MATERIALS.Daedric },
    enchantment: { type: 4, param: 2 },
    affixes: [{ id: 'damage', value: 30 }, { id: 'stat', param: 'agility', value: 12 }, { id: 'skill', param: SKILLS.Archery, value: 25 }],
    power: Object.freeze({ name: "Hunter's Standard", kind: 'moon', pct: 35, beast: 35, brief: 'At night: +35%, +70% vs animals', text: 'At night this weapon deals 35% more damage, or 70% more to animals' }),
    lore: 'Strung with the cord that once held the garrison\'s banner to its pole.', hint: HINT }),
]);
for (const g of SENTINEL_GEAR) registerLegendary({ id: g.id, name: g.name, group: g.group, templates: g.templates, shopOnly: true, affixes: g.affixes, enchantment: g.enchantment, power: g.power, lore: g.lore, hint: g.hint });

/** A piece of the gear, minted: the make, its Legendary tier from its own record alone, known and bound. */
function mintGear(/** @type {any} */ g) {
  const m = g.make;
  const base = m.kind === 'weapon' ? { group: 'Weapons', ...createWeapon(m.templateIndex, m.material) }
    : m.kind === 'crossbow' ? createCrossbow({ material: m.material })
      : m.kind === 'armor' ? mintCondition(setItemFields({ group: 'Armor', templateIndex: m.templateIndex, material: m.material }))
        : mintCondition(setItemFields({ group: 'Jewellery', templateIndex: m.templateIndex }));
  const rec = legendaryById(g.id);
  const item = applyRarity(base, 'legendary', Math.random, rec ? [rec] : []);
  item.isIdentified = true;
  item.bound = true;
  return item;
}

/** The pack's piece for an offer id (net/sentinelLaw.js): the shards' stack or the gear, minted - or null for an id with none.
 *  Nothing is taken or added here: the host makes it, asks the pack's gate, has the service take the price, then adds it. */
export function sentinelPiece(/** @type {string} */ id) {
  const offer = sentinelOfferById(id);
  if (!offer) return null;
  if (offer.shards) return welkyndShards(offer.shards);
  const g = SENTINEL_GEAR.find((x) => x.id === id);
  return g ? mintGear(g) : null;
}
