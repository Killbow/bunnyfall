// @ts-check
// The weapon a destroyed revenant drops: the one it carried or one its kind wields, named for it, and never Common.
// It is rolled when the revenant yields, so the choice shows exactly what killing it gives.
import { createWeapon, randomMaterial, WEAPONS_ENUM } from '../combat/enemyEquipment.js';
import { mintCondition, setItemFields, templateByIndex } from '../items/itemTemplates.js';
import { applyRarity } from '../items/lootRarity.js';
import { MOBILE_TYPES as M } from '../characters/mobileTypes.js';
import { possessive } from './revenantPersonality.js';

const W = WEAPONS_ENUM;
export const TROPHY_KIND_WEAPONS = Object.freeze({
  [M.Rat]: [W.Dagger], [M.Imp]: [W.Dagger, W.Tanto], [M.Spriggan]: [W.Staff], [M.GiantBat]: [W.Dagger],
  [M.GrizzlyBear]: [W['War Axe']], [M.SabertoothTiger]: [W.Tanto, W.Katana], [M.Spider]: [W.Dagger],
  [M.Orc]: [W['War Axe'], W['Battle Axe']], [M.Centaur]: [W['Long Bow'], W.Longsword], [M.Werewolf]: [W.Dagger, W.Tanto],
  [M.Nymph]: [W['Short Bow'], W.Staff], [M.Slaughterfish]: [W.Tanto], [M.OrcSergeant]: [W['Battle Axe'], W.Broadsword],
  [M.Harpy]: [W.Saber, W.Dagger], [M.Wereboar]: [W.Mace, W.Flail], [M.SkeletalWarrior]: [W.Broadsword, W.Claymore],
  [M.Giant]: [W.Warhammer, W.Mace], [M.Zombie]: [W.Mace, W.Flail], [M.Ghost]: [W['Dai-Katana'], W.Katana],
  [M.Mummy]: [W.Saber, W.Wakazashi], [M.GiantScorpion]: [W.Shortsword], [M.OrcShaman]: [W.Staff],
  [M.Gargoyle]: [W.Warhammer, W.Mace], [M.Wraith]: [W['Dai-Katana'], W.Katana], [M.OrcWarlord]: [W.Claymore, W['Battle Axe']],
  [M.FrostDaedra]: [W.Claymore, W.Longsword], [M.FireDaedra]: [W.Saber, W.Broadsword], [M.Daedroth]: [W['War Axe'], W.Flail],
  [M.Vampire]: [W.Saber, W.Katana], [M.DaedraSeducer]: [W.Saber, W.Katana], [M.VampireAncient]: [W.Katana, W['Dai-Katana']],
  [M.DaedraLord]: [W['Dai-Katana'], W.Claymore], [M.Lich]: [W.Staff], [M.AncientLich]: [W.Staff],
  [M.Dragonling]: [W.Saber], [M.Dragonling_Alternate]: [W.Saber], [M.FireAtronach]: [W.Saber], [M.IronAtronach]: [W.Warhammer],
  [M.FleshAtronach]: [W.Mace], [M.IceAtronach]: [W.Claymore], [M.Dreugh]: [W.Flail, W.Tanto], [M.Lamia]: [W.Wakazashi, W['Short Bow']],
  [M.Mage]: [W.Staff], [M.Spellsword]: [W.Longsword], [M.Battlemage]: [W['War Axe']], [M.Sorcerer]: [W.Staff], [M.Healer]: [W.Mace],
  [M.Nightblade]: [W.Wakazashi], [M.Bard]: [W.Saber], [M.Burglar]: [W.Dagger], [M.Rogue]: [W.Shortsword], [M.Acrobat]: [W.Tanto],
  [M.Thief]: [W.Dagger], [M.Assassin]: [W.Tanto], [M.Monk]: [W.Staff], [M.Archer]: [W['Long Bow']], [M.Ranger]: [W['Short Bow']],
  [M.Barbarian]: [W.Claymore], [M.Warrior]: [W.Longsword], [M.Knight]: [W.Broadsword],
});
export const TROPHY_NOUNS = Object.freeze({
  [W.Dagger]: ['Fang', 'Shiv', 'Sting'], [W.Tanto]: ['Kiss', 'Whisper'], [W.Staff]: ['Rod', 'Crook', 'Stave'],
  [W.Shortsword]: ['Bite', 'Edge'], [W.Wakazashi]: ['Edge', 'Whisper'], [W.Broadsword]: ['Blade', 'Reaver'],
  [W.Saber]: ['Wing', 'Slash'], [W.Longsword]: ['Oath', 'Blade'], [W.Katana]: ['Edge', 'Song'],
  [W.Claymore]: ['Greatblade', 'Ruin'], [W['Dai-Katana']]: ['Edge', 'Requiem'], [W.Mace]: ['Maul', 'Cudgel'],
  [W.Flail]: ['Scourge', 'Flail'], [W.Warhammer]: ['Hammer', 'Maul'], [W['Battle Axe']]: ['Cleaver', 'Axe'],
  [W['War Axe']]: ['Reaver', 'Axe'], [W['Short Bow']]: ['Bow', 'Sting'], [W['Long Bow']]: ['Longbow', 'Reach'],
});
export const TROPHY_RARITY = Object.freeze({ legendary: 0.12, rare: 0.33, legendaryPerRank: 0.05, rarePerRank: 0.04 });

const MELEE_AND_BOWS = new Set(Object.values(W));
function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export function carriedWeaponTemplate(entity) {
  let best = null;
  for (const it of Array.isArray(entity?.items) ? entity.items : []) {
    if (!it || it.group !== 'Weapons' || !MELEE_AND_BOWS.has(it.templateIndex)) continue;
    if (!best || (Number(it.value) || 0) > (Number(best.value) || 0)) best = it;
  }
  return best ? best.templateIndex : null;
}
export function trophyTemplate(r, entity = null) {
  const carried = carriedWeaponTemplate(entity);
  if (carried != null) return carried;
  const pool = TROPHY_KIND_WEAPONS[r?.mobileType] ?? [W.Longsword];
  return pool[hashStr(`trophy:${r?.id ?? ''}`) % pool.length];
}
export function trophyName(r, templateIndex) {
  const nouns = TROPHY_NOUNS[templateIndex] ?? [templateByIndex(templateIndex)?.name ?? 'Blade'];
  const noun = nouns[hashStr(`noun:${r?.id ?? ''}`) % nouns.length];
  const given = String(r?.given ?? r?.name ?? 'Nameless').trim() || 'Nameless';
  return `${possessive(given)} ${noun}`;
}
export function trophyRarity(rank = 1, rolls = Math.random) {
  const k = Math.max(0, Math.min(4, (rank | 0) - 1));
  const leg = TROPHY_RARITY.legendary + TROPHY_RARITY.legendaryPerRank * k;
  const rare = TROPHY_RARITY.rare + TROPHY_RARITY.rarePerRank * k;
  const x = rolls();
  return x < leg ? 'legendary' : x < leg + rare ? 'rare' : 'magic';
}

export function revenantTrophy(r, { entity = null, level = 1, rolls = Math.random } = {}) {
  const templateIndex = trophyTemplate(r, entity);
  const lv = Math.max(1, level | 0);
  const material = Math.max(randomMaterial(lv, rolls), randomMaterial(lv, rolls));
  const item = mintCondition(setItemFields({ group: 'Weapons', ...createWeapon(templateIndex, material, rolls) }));
  if (!item) return null;
  // The tier roll runs even for the Dread, which is always Legendary, so the roll order stays the same.
  const tier = trophyRarity(r?.rank ?? 1, rolls);
  applyRarity(item, r?.dread ? 'legendary' : tier, rolls);
  // The trophy name replaces the rarity name, while a Legendary keeps its powers.
  item.name = trophyName(r, templateIndex);
  return item;
}
export function trophyKindWords(item) {
  const tier = item?.rarity ? item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1) : '';
  const base = templateByIndex(item?.templateIndex)?.name ?? 'weapon';
  return [tier, base].filter(Boolean).join(' ');
}
