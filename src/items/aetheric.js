// @ts-check
// Aetheric tier records: fixed set pieces minted whole for bosses, raids, and events, never rolled by rarity.
// Each set roll runs after every other roll from the same source, so earlier rolls for a seed stay the same.

import { setItemFields, mintCondition, itemBaseValue } from './itemTemplates.js';
import { ARMOR_MATERIAL } from './armorMaterials.js';
import { WEAPON_MATERIALS } from '../characters/weapons.js';
import { createWeapon } from '../combat/enemyEquipment.js';
import { affixesWorth, validAffix, AFFIX_RANGES, registerAethericLore } from './lootRarity.js';
import { SKILLS } from '../characters/skills.js';
import { SIGIL_POWER_MAX, SIGIL_BANDS } from './sigil.js';
import { setPieceKind, setById, raidSetOf } from './sigilSets.js';
import { EG_PANOPLY_IDS } from '../net/eliteGates/egPay.js';
import { WYRD_PIECE_IDS } from '../net/festivalLaw.js';

export const AETHERIC = 'aetheric';
export const AETHERIC_WORTH = 2500;
export const REGALIA_CHANCE = 1 / 6;
export const REGALIA_SET = 'ruhn';

const top = (id) => AFFIX_RANGES[id].legendary[1];
// Fire resistance stays low per piece so that only the set tier carries a full set past saving throw immunity.
export const REGALIA_FIRE_RESIST = 10;
const armor = () => ({ id: 'armor', value: top('armor') });
const fire = () => ({ id: 'resist', param: 'fire', value: REGALIA_FIRE_RESIST });
const stat = (param) => ({ id: 'stat', param, value: top('stat') });
const record = (id, name, group, templateIndex, set, make, power, affixes, lore) => Object.freeze({
  id, name, group, templateIndex, set, make, ...(group === 'Weapons' ? { power } : {}),
  affixes: Object.freeze(affixes.map((a) => Object.freeze(a))), lore,
});
const rec = (id, name, group, templateIndex, affixes, lore) => record(id, name, group, templateIndex, REGALIA_SET, 'Daedric', SIGIL_POWER_MAX, affixes, lore);

export const REGALIA = Object.freeze([
  rec('ruhn-horned-crown', "Ruhn's Horned Crown", 'Armor', 107, [armor(), fire(), stat('willpower')],
    'The horns are a Dremora lord\'s, who knelt too slowly.'),
  rec('ruhn-right-pauldron', "Ruhn's Right Pauldron", 'Armor', 106, [armor(), fire(), stat('strength')],
    'Blackened where the gate\'s fire licked it for an age.'),
  rec('ruhn-left-pauldron', "Ruhn's Left Pauldron", 'Armor', 105, [armor(), fire(), stat('agility')],
    'It turned a thousand blades meant for the Warden.'),
  rec('ruhn-warden-plate', "Ruhn's Warden-Plate", 'Armor', 102, [armor(), fire(), stat('endurance')],
    'Beaten in the gate\'s own heart. It is warm to the touch, always.'),
  rec('ruhn-brand-gauntlets', "Ruhn's Brand-Gauntlets", 'Armor', 103, [armor(), fire(), { id: 'skill', param: SKILLS.CriticalStrike, value: top('skill') }],
    'Mehrunes Dagon\'s brand is pressed into both palms.'),
  rec('ruhn-greaves', "Ruhn's Greaves", 'Armor', 104, [armor(), fire(), { id: 'weight', value: top('weight') }],
    'Their tread scorched the court\'s stones.'),
  rec('ruhn-cinder-boots', "Ruhn's Cinder-Boots", 'Armor', 108, [armor(), fire(), stat('speed')],
    'Ash rises where the wearer walks.'),
  rec('ruhn-gate-shield', "Ruhn's Gate-Shield", 'Armor', 112, [armor(), fire(), { id: 'resist', param: 'magic', value: top('resist') }],
    'A slab of the gate itself, hinges and all.'),
  rec('ruhn-gatecleaver', "Ruhn's Gatecleaver", 'Weapons', 127, [{ id: 'damage', value: top('damage') }, stat('strength'), { id: 'skill', param: SKILLS.Axe, value: top('skill') }],
    'The axe the Warden held the Burning Gate with. Its edge remembers the hinge.'),
]);

const floor = (id) => AFFIX_RANGES[id].legendary[0];
export const RAID_SET_POWER = SIGIL_BANDS.legendary[0];
const a = (id, param) => (param === undefined ? { id, value: floor(id) } : { id, param, value: floor(id) });
const raidRec = (set, make) => (key, name, group, templateIndex, affixes, lore) => record(`${set}-${key}`, name, group, templateIndex, set, make, RAID_SET_POWER, affixes, lore);
const oath = raidRec('oath', 'Mithril'), taker = raidRec('thieftaker', 'Elven'), orcs = raidRec('orcsbane', 'Orcish');
export const RAID_SET_PIECES = Object.freeze([
  oath('helm', "The Oathkeeper's Helm", 'Armor', 107, [a('armor'), a('stat', 'willpower'), a('resist', 'magic')],
    'Its visor was shut on a vow. The knight who broke it never lifted it again.'),
  oath('right-pauldron', 'Oathbound Right Pauldron', 'Armor', 106, [a('armor'), a('stat', 'strength'), a('resist', 'shock')],
    'The order\'s crest is filed away, all but one stubborn talon.'),
  oath('left-pauldron', 'Oathbound Left Pauldron', 'Armor', 105, [a('armor'), a('stat', 'endurance'), a('resist', 'frost')],
    'It still bears the dent of the blow that ended a knighthood.'),
  oath('cuirass', "The Watch-Captain's Cuirass", 'Armor', 102, [a('armor'), a('stat', 'willpower'), a('stat', 'endurance')],
    'Taken from a raider who swore to guard this town once, and came back to burn it.'),
  oath('gauntlets', 'Gauntlets of the Sworn', 'Armor', 103, [a('armor'), a('stat', 'strength'), a('skill', SKILLS.LongBlade)],
    'Clasped hands were pressed into them on the day of the oath.'),
  oath('greaves', 'Greaves of the Last Stand', 'Armor', 104, [a('armor'), a('stat', 'endurance'), a('weight')],
    'The town\'s smith hammered the mud of its square into them.'),
  oath('boots', 'Boots of the Long Watch', 'Armor', 108, [a('armor'), a('stat', 'speed'), a('resist', 'poison')],
    'They have walked every wall in the Bay, and never away from one.'),
  oath('kite-shield', 'The Last Oath', 'Armor', 111, [a('armor'), a('stat', 'willpower'), a('resist', 'magic')],
    'The words of the oath run round its rim. Someone has scratched out the last line.'),
  oath('longsword', 'Oathsunder', 'Weapons', 120, [a('damage'), a('stat', 'strength'), a('skill', SKILLS.LongBlade)],
    'The blade an oathbreaker carried into a town that trusted him. It serves the town now.'),
  taker('helm', "The Thief-Taker's Helm", 'Armor', 107, [a('armor'), a('stat', 'agility'), a('skill', SKILLS.Streetwise)],
    'Every fence in the Bay knows its shape, and leaves by the back door.'),
  taker('right-pauldron', "Warrant-Bearer's Right Pauldron", 'Armor', 106, [a('armor'), a('stat', 'speed'), a('skill', SKILLS.Archery)],
    'A reeve\'s seal is pressed into the leather beneath the plate.'),
  taker('left-pauldron', "Warrant-Bearer's Left Pauldron", 'Armor', 105, [a('armor'), a('stat', 'agility'), a('skill', SKILLS.Dodging)],
    'Light enough to run in, which is the whole of the trade.'),
  taker('cuirass', "The Thief-Taker's Cuirass", 'Armor', 102, [a('armor'), a('stat', 'speed'), a('resist', 'poison')],
    'Cut from the mail of a bandit captain who did not run fast enough.'),
  taker('gauntlets', 'Collaring Gauntlets', 'Armor', 103, [a('armor'), a('stat', 'agility'), a('skill', SKILLS.CriticalStrike)],
    'Made for a grip no cutpurse has ever twisted out of.'),
  taker('greaves', 'Chase-Greaves', 'Armor', 104, [a('armor'), a('stat', 'speed'), a('skill', SKILLS.Running)],
    'Elven work, and quiet. The quarry hears them only at the end.'),
  taker('boots', 'Boots of the Long Pursuit', 'Armor', 108, [a('armor'), a('stat', 'agility'), a('skill', SKILLS.Jumping)],
    'Their soles are worn smooth on the rooftops of three cities.'),
  taker('buckler', "The Reeve's Buckler", 'Armor', 109, [a('armor'), a('stat', 'agility'), a('resist', 'shock')],
    'Small enough to run with, stout enough to end the running.'),
  taker('saber', "The Reeve's Warrant", 'Weapons', 119, [a('damage'), a('stat', 'agility'), a('skill', SKILLS.LongBlade)],
    'Its edge is the only warrant a bandit in the Bay ever reads.'),
  orcs('helm', 'Tusk-Crest Helm', 'Armor', 107, [a('armor'), a('stat', 'endurance'), a('resist', 'poison')],
    'Crowned with the tusks of the warlord who led the raid.'),
  orcs('right-pauldron', 'Orcsbane Right Pauldron', 'Armor', 106, [a('armor'), a('stat', 'strength'), a('skill', SKILLS.BluntWeapon)],
    'Beaten from the horde\'s own blades, and heavier for it.'),
  orcs('left-pauldron', 'Orcsbane Left Pauldron', 'Armor', 105, [a('armor'), a('stat', 'endurance'), a('resist', 'frost')],
    'Its rivets are orc arrowheads, driven home.'),
  orcs('cuirass', "The Horde-Breaker's Cuirass", 'Armor', 102, [a('armor'), a('stat', 'endurance'), a('stat', 'strength')],
    'The horde broke against the one who wore it, and did not come back.'),
  orcs('gauntlets', 'Knuckle-Breaker Gauntlets', 'Armor', 103, [a('armor'), a('stat', 'strength'), a('skill', SKILLS.CriticalStrike)],
    'Orcish iron over the knuckles, and nothing gentle under it.'),
  orcs('greaves', 'Orcsbane Greaves', 'Armor', 104, [a('armor'), a('stat', 'endurance'), a('weight')],
    'Made to hold ground, not to give it.'),
  orcs('boots', 'Boots of the Held Gate', 'Armor', 108, [a('armor'), a('stat', 'willpower'), a('resist', 'fire')],
    'They stood in the town gate while it burned, and the gate held.'),
  orcs('round-shield', "The Warlord's Last Sight", 'Armor', 110, [a('armor'), a('stat', 'endurance'), a('resist', 'magic')],
    'Its boss is a warlord\'s helm, hammered flat.'),
  orcs('mace', 'The Tuskbreaker', 'Weapons', 124, [a('damage'), a('stat', 'strength'), a('skill', SKILLS.BluntWeapon)],
    'Flanged with Orcish steel. It has broken more tusks than any smith can count.'),
]);
const mid = (id) => Math.round((AFFIX_RANGES[id].legendary[0] + AFFIX_RANGES[id].legendary[1]) / 2);
export const SERPENT_SET_POWER = Math.round((SIGIL_BANDS.legendary[0] + SIGIL_BANDS.legendary[1]) / 2);
const m = (id, param) => (param === undefined ? { id, value: mid(id) } : { id, param, value: mid(id) });
const coil = (key, name, group, templateIndex, affixes, lore) => record(`coilscale-${key}`, name, group, templateIndex, 'coilscale', 'Ebony', SERPENT_SET_POWER, affixes, lore);
// From this set on, each element resistance is on one piece at most, never the element the 2-piece tier raises.
export const SERPENT_SET_PIECES = Object.freeze([
  coil('crest', "Sethrakul's Crest", 'Armor', 107, [m('armor'), m('stat', 'willpower'), m('resist', 'shock')],
    'Cut from the crest the Old Coil raised before it struck. It still rises in a storm.'),
  coil('right-pauldron', 'Coilscale Right Pauldron', 'Armor', 106, [m('armor'), m('stat', 'strength'), m('skill', SKILLS.Swimming)],
    'Each scale is the size of a hand, and no two lie the same way.'),
  coil('left-pauldron', 'Coilscale Left Pauldron', 'Armor', 105, [m('armor'), m('stat', 'endurance'), m('resist', 'poison')],
    'The venom that pooled under it dried to a green glaze.'),
  coil('hide', "The Old Coil's Hide", 'Armor', 102, [m('armor'), m('stat', 'endurance'), m('stat', 'willpower')],
    'A ring of the serpent\'s shed skin, turned to plate by the sea.'),
  coil('grip', "Constrictor's Grip", 'Armor', 103, [m('armor'), m('stat', 'strength'), m('skill', SKILLS.LongBlade)],
    'They close slowly, and they do not open again until it is over.'),
  coil('greaves', 'Undertow Greaves', 'Armor', 104, [m('armor'), m('stat', 'agility'), m('weight')],
    'Heavy as the deep, and they never drag.'),
  coil('boots', 'Tide-Walker Boots', 'Armor', 108, [m('armor'), m('stat', 'speed'), m('skill', SKILLS.Running)],
    'Sailors say the one who wears them walks out of any wreck.'),
  coil('shield', "The Maelstrom's Eye", 'Armor', 111, [m('armor'), m('stat', 'endurance'), m('resist', 'magic')],
    'A whorl of scales at its boss turns a blade as the maelstrom turns a ship.'),
  coil('fang', "Sethrakul's Fang", 'Weapons', 121, [m('damage'), m('stat', 'agility'), m('skill', SKILLS.LongBlade)],
    'A fang of the Old Coil, ground to an edge by a Hammerfell smith who would not say how.'),
]);
const t = (id, param) => (param === undefined ? { id, value: top(id) } : { id, param, value: top(id) });
const brass = (key, name, group, templateIndex, affixes, lore) => record(`numidium-${key}`, name, group, templateIndex, 'numidium', 'Dwarven', SIGIL_POWER_MAX, affixes, lore);
export const NUMIDIUM_SET_PIECES = Object.freeze([
  brass('visage', 'The Brass Visage', 'Armor', 107, [t('armor'), t('stat', 'intelligence'), t('resist', 'fire')],
    'The face the Walking Brass turned on the Bay. Its eyes are cold now, and they still look out.'),
  brass('right-pauldron', 'Right Pauldron of the Walking Brass', 'Armor', 106, [t('armor'), t('stat', 'strength'), t('skill', SKILLS.LongBlade)],
    'Every rivet is a Dwemer smith\'s mark, and no two smiths are the same.'),
  brass('left-pauldron', 'Left Pauldron of the Walking Brass', 'Armor', 105, [t('armor'), t('stat', 'endurance'), t('resist', 'frost')],
    'It kept the cold of a thousand years under the mountain, and gave none of it back.'),
  brass('heartcage', 'The Heartcage', 'Armor', 102, [t('armor'), t('stat', 'willpower'), t('skill', SKILLS.Mysticism)],
    'It caged a heart of shattered soul-gem light. It is warm, and it beats.'),
  brass('hands', "The Tonal Architect's Hands", 'Armor', 103, [t('armor'), t('stat', 'agility'), t('skill', SKILLS.CriticalStrike)],
    'Cut to the hands of the one who sang the Brass awake.'),
  brass('greaves', 'Greaves of the Unmade Stride', 'Armor', 104, [t('armor'), t('stat', 'speed'), t('resist', 'poison')],
    'They stepped across a Dragon Break and came out on the other side.'),
  brass('boots', 'Boots of the Unmoored Step', 'Armor', 108, [t('armor'), t('stat', 'luck'), t('skill', SKILLS.Jumping)],
    'Made for a road over nothing. They never miss a step.'),
  brass('gear-face', 'The Gear-Face', 'Armor', 110, [t('armor'), t('stat', 'endurance'), t('weight')],
    'A gear of the Walking Brass, its teeth filed round. It still turns when no one is looking.'),
  brass('hour-hand', 'The Hour-Hand', 'Weapons', 120, [t('damage'), t('stat', 'strength'), t('skill', SKILLS.LongBlade)],
    'Broken from the colossus\'s heart-clock. It points at what is about to end.'),
]);
// Record ids must match EG_PANOPLY_IDS, which the account service sells by.
const mithril = (key, name, group, templateIndex, affixes, lore) => record(`panoply-${key}`, name, group, templateIndex, 'panoply', 'Mithril', SIGIL_POWER_MAX, affixes, lore);
export const PANOPLY_SET_PIECES = Object.freeze([
  mithril('warhelm', "The Battlemage's Warhelm", 'Armor', 107, [t('armor'), t('stat', 'intelligence'), t('skill', SKILLS.Destruction)],
    'Its crest names a Battlemage who fell at the Weir Gate. A Kynreeve wore it to his Court after.'),
  mithril('right-pauldron', "The Battlemage's Right Pauldron", 'Armor', 106, [t('armor'), t('stat', 'strength'), t('skill', SKILLS.LongBlade)],
    'The Spire\'s eagle is struck through with a Dremora\'s mark. The Mithril under it held.'),
  mithril('left-pauldron', "The Battlemage's Left Pauldron", 'Armor', 105, [t('armor'), t('stat', 'willpower'), t('skill', SKILLS.Alteration)],
    'Worn on the casting arm, and cut so it never slows a spell.'),
  mithril('cuirass', "The Battlemage's Cuirass", 'Armor', 102, [t('armor'), t('stat', 'endurance'), t('stat', 'intelligence')],
    'Mithril over a Battlemage\'s heart. The Kyn hung it in a Court for a banner.'),
  mithril('gauntlets', "The Battlemage's Gauntlets", 'Armor', 103, [t('armor'), t('stat', 'agility'), t('skill', SKILLS.CriticalStrike)],
    'Thin at the fingers for the casting, thick at the knuckles for the blade.'),
  mithril('greaves', "The Battlemage's Greaves", 'Armor', 104, [t('armor'), t('stat', 'speed'), t('weight')],
    'They stood the Armsmaster\'s drills in the Spire\'s yards ten thousand times.'),
  mithril('boots', "The Battlemage's Boots", 'Armor', 108, [t('armor'), t('stat', 'luck'), t('skill', SKILLS.Dodging)],
    'The slipstream never moved them. The Kyn marched them across the void.'),
  mithril('shield', 'The Spire-Shield', 'Armor', 111, [t('armor'), t('stat', 'willpower'), t('skill', SKILLS.Restoration)],
    'The academy\'s eagle on a kite of Mithril. A Kynmarcher\'s claws scored it, and it held.'),
  mithril('saber', 'The Spire-Saber', 'Weapons', 119, [t('damage'), t('stat', 'intelligence'), t('skill', SKILLS.LongBlade)],
    'Every Battlemage carried one into the Spire in 3E 398. Few carried one out.'),
]);
// Record ids must match WYRD_PIECE_IDS, which the Wyrd Sisters sell by.
const wyrd = (key, name, group, templateIndex, affixes, lore) => record(`wyrd-${key}`, name, group, templateIndex, 'wyrd', group === 'Weapons' ? 'Elven' : 'Leather', RAID_SET_POWER, affixes, lore);
export const WYRD_SET_PIECES = Object.freeze([
  wyrd('hood', "The Wyrd Sister's Hood", 'Armor', 107, [a('armor'), a('stat', 'willpower'), a('skill', SKILLS.Mysticism)],
    'Woven on the Glenumbra Moors, under both moons.'),
  wyrd('right-mantle', 'Right Mantle of the Wyrd', 'Armor', 106, [a('armor'), a('stat', 'intelligence'), a('skill', SKILLS.Destruction)],
    'Black feathers sewn to tanned hide. No bird of the Bay grew them.'),
  wyrd('left-mantle', 'Left Mantle of the Wyrd', 'Armor', 105, [a('armor'), a('stat', 'willpower'), a('skill', SKILLS.Alteration)],
    'Cut to lift a cauldron\'s lid, never to turn a blade. It turns both.'),
  wyrd('robe', 'The Wyrdwoven Cuirass', 'Armor', 102, [a('armor'), a('stat', 'willpower'), a('stat', 'endurance')],
    'Stitched with the names of every sister who wore it. The last line is blank.'),
  wyrd('gloves', 'Gloves of the Gathering', 'Armor', 103, [a('armor'), a('stat', 'agility'), a('skill', SKILLS.Thaumaturgy)],
    'They have dug roots by moonlight and come back clean.'),
  wyrd('greaves', 'Greaves of the Moors', 'Armor', 104, [a('armor'), a('stat', 'speed'), a('resist', 'poison')],
    'The bog lets go of nothing. It let go of these.'),
  wyrd('boots', "Boots of the Witches' Road", 'Armor', 108, [a('armor'), a('stat', 'luck'), a('skill', SKILLS.Running)],
    'They know the way to the gathering in the wilderness. Follow them.'),
  wyrd('hearthward', 'The Hearth-Ward', 'Armor', 110, [a('armor'), a('stat', 'willpower'), a('resist', 'fire')],
    'A ward of tallow is painted on its face. The dead do not walk past it.'),
  wyrd('athame', 'The Witchmoon Athame', 'Weapons', 113, [a('damage'), a('stat', 'intelligence'), a('skill', SKILLS.ShortBlade)],
    'Quenched in the light of both moons on the 13th of Frostfall.'),
]);
const spun = raidRec('starspun', 'Elven');
export const STARSPUN_SET_PIECES = Object.freeze([
  spun('cowl', 'The Starspun Cowl', 'Armor', 107, [a('armor'), a('stat', 'personality'), a('skill', SKILLS.Illusion)],
    'The coven wound this thread about a fallen star. It still gives off a little of its light.'),
  spun('right-pauldron', 'Right Pauldron of the Weave', 'Armor', 106, [a('armor'), a('stat', 'strength'), a('skill', SKILLS.ShortBlade)],
    'Black thread laid over pale plate, eight strands to every knot.'),
  spun('left-pauldron', 'Left Pauldron of the Weave', 'Armor', 105, [a('armor'), a('stat', 'endurance'), a('resist', 'shock')],
    'The knots keep a count. No witch will tell you what it counts.'),
  spun('cuirass', 'The Starspun Cuirass', 'Armor', 102, [a('armor'), a('stat', 'agility'), a('stat', 'endurance')],
    'Over the heart the thread is bound with a shard of the star itself.'),
  spun('hands', "The Spinner's Hands", 'Armor', 103, [a('armor'), a('stat', 'agility'), a('skill', SKILLS.Backstabbing)],
    'Fine enough to feel one strand move at the far end of a web.'),
  spun('greaves', 'Greaves of the Silent Strand', 'Armor', 104, [a('armor'), a('stat', 'speed'), a('skill', SKILLS.Stealth)],
    'They make no sound at all, even on stone.'),
  spun('boots', 'Boots of the Long Fall', 'Armor', 108, [a('armor'), a('stat', 'speed'), a('skill', SKILLS.Jumping)],
    'The star came down from higher than anything should fall. The thread held.'),
  spun('buckler', 'The Web-Buckler', 'Armor', 109, [a('armor'), a('stat', 'willpower'), a('resist', 'magic')],
    'Strung across like a web. A blade that catches in it is slow to come free.'),
  spun('blade', 'The Spindle-Blade', 'Weapons', 116, [a('damage'), a('stat', 'agility'), a('skill', SKILLS.ShortBlade)],
    'Ground from the spindle a coven wound its thread on. It still turns in the hand.'),
]);
const tide = (key, name, group, templateIndex, affixes, lore) => record(`eltheric-${key}`, name, group, templateIndex, 'eltheric', 'Adamantium', SERPENT_SET_POWER, affixes, lore);
export const ELTHERIC_SET_PIECES = Object.freeze([
  tide('helm', "The Drowned Admiral's Helm", 'Armor', 107, [m('armor'), m('stat', 'willpower'), m('resist', 'frost')],
    'Dredged up from the Abyss with the admiral still inside. The aether had kept him.'),
  tide('right-pauldron', 'Right Pauldron of the Deep', 'Armor', 106, [m('armor'), m('stat', 'strength'), m('skill', SKILLS.Swimming)],
    'Barnacles of violet glass grow on it, and on nothing else.'),
  tide('left-pauldron', 'Left Pauldron of the Deep', 'Armor', 105, [m('armor'), m('stat', 'endurance'), m('resist', 'poison')],
    'The salt has eaten every crest off it but the Veil\'s.'),
  tide('cuirass', 'The Tidemail Cuirass', 'Armor', 102, [m('armor'), m('stat', 'endurance'), m('stat', 'strength')],
    'It rises and falls with the tide, a breath behind the one who wears it.'),
  tide('gauntlets', 'Gauntlets of the Wheel', 'Armor', 103, [m('armor'), m('stat', 'agility'), m('skill', SKILLS.CriticalStrike)],
    'They held a ship\'s wheel through a storm that broke the mast above them.'),
  tide('greaves', 'Greaves of the Sounding Line', 'Armor', 104, [m('armor'), m('stat', 'speed'), m('weight')],
    'Marked in fathoms down each shin, and the marks go deeper than any line has.'),
  tide('boots', "The Hooded Pilot's Boots", 'Armor', 108, [m('armor'), m('stat', 'speed'), m('resist', 'fire')],
    'Taken off the Lantern-Eater\'s deck. Nothing had ever walked out of the dark in them before.'),
  tide('shield', 'The Starless Shield', 'Armor', 110, [m('armor'), m('stat', 'willpower'), m('resist', 'magic')],
    'Cut from a hull as black as the night it sailed. A ship that sees it coming sees nothing.'),
  tide('saber', "Maraveth's Mercy", 'Weapons', 119, [m('damage'), m('stat', 'agility'), m('skill', SKILLS.LongBlade)],
    'The Drowned Queen\'s own blade. She shows no mercy; it is named for the mercy she once begged for.'),
]);
export const AETHERIC_RECORDS = Object.freeze([...REGALIA, ...RAID_SET_PIECES, ...SERPENT_SET_PIECES, ...NUMIDIUM_SET_PIECES, ...PANOPLY_SET_PIECES, ...WYRD_SET_PIECES, ...STARSPUN_SET_PIECES, ...ELTHERIC_SET_PIECES]);
export const aethericById = (id) => AETHERIC_RECORDS.find((r) => r.id === id) ?? null;
registerAethericLore((item) => aethericById(item?.aetheric)?.lore ?? null);
export const aethericMaterial = (r) => (r.group === 'Weapons' ? WEAPON_MATERIALS[r.make] : ARMOR_MATERIAL[r.make]);
export const isAetheric = (item) => item?.rarity === AETHERIC;

/**
 * @param {{ id: string, name: string, group: string, templateIndex: number, set: string, make: string, power?: number, affixes: readonly any[] }} r
 * @param {{ party?: number }} [opts]
 */
export function mintAetheric(r, { party = 1 } = {}) {
  const item = r.group === 'Weapons'
    ? createWeapon(r.templateIndex, aethericMaterial(r))
    : mintCondition(setItemFields({ group: 'Armor', templateIndex: r.templateIndex, material: aethericMaterial(r), flags: 0 }));
  const affixes = r.affixes.filter(validAffix).map((a) => ({ ...a }));
  item.name = r.name;
  item.rarity = AETHERIC;
  item.aetheric = r.id;
  item.affixes = affixes;
  item.isIdentified = true;
  item.sigil = r.group === 'Weapons' ? { power: r.power, set: r.set, party, xp: 0 } : { set: r.set, party, xp: 0 };
  item.value = itemBaseValue(item) + affixesWorth(affixes) + AETHERIC_WORTH;
  return item;
}

// Rejects set and Aetheric marks that no minted record could carry, for items off the wire.
/** @param {any} item */
export function validSetMarks(item) {
  if (!item || typeof item !== 'object') return null;
  const s = item.sigil;
  if (s != null) {
    const kind = setPieceKind(item);
    if (s.set !== undefined && !kind) return null;
    if (s.power !== undefined && kind !== 'weapon') return null;
    if (setById(s.set)?.aetheric && item.rarity !== AETHERIC) return null;
    item.sigil = { ...(s.power !== undefined ? { power: s.power } : {}), ...(s.set !== undefined ? { set: s.set } : {}), party: s.party, xp: s.xp };
  }
  if (item.rarity === AETHERIC || item.aetheric != null) {
    const r = aethericById(item.aetheric);
    if (!r || item.rarity !== AETHERIC || r.group !== item.group || r.templateIndex !== item.templateIndex) return null;
    if (item.material !== aethericMaterial(r)) return null;
    if (item.sigil?.set !== undefined && item.sigil.set !== r.set) return null;
    // Regalia values are not capped here, because pieces minted before the fire resistance cut carry higher values.
    const want = r.affixes.filter(validAffix), have = Array.isArray(item.affixes) ? item.affixes : [];
    if (have.length !== want.length) return null;
    for (let i = 0; i < want.length; i++) {
      const a = have[i];
      if (a?.id !== want[i].id || (a.param ?? null) !== (want[i].param ?? null)) return null;
      if (r.set !== REGALIA_SET && !(a.value <= want[i].value)) return null;
    }
    if (item.sigil?.power !== undefined && item.sigil.power !== r.power) return null;
  }
  return item;
}

// Each roll helper draws once when nothing drops and twice when a piece does.
export function rollRegalia(rolls = Math.random) {
  if (!(rolls() < REGALIA_CHANCE)) return null;
  return mintAetheric(REGALIA[Math.min(REGALIA.length - 1, Math.floor(rolls() * REGALIA.length))]);
}

export const RAID_SET_CHANCE = 1 / 4;
export const raidSetPieces = (party) => { const set = raidSetOf(party); return set ? RAID_SET_PIECES.filter((r) => r.set === set.id) : []; };
export function rollRaidSetPiece(party, rolls = Math.random) {
  const recs = raidSetPieces(party);
  if (!recs.length || !(rolls() < RAID_SET_CHANCE)) return null;
  return mintAetheric(recs[Math.min(recs.length - 1, Math.floor(rolls() * recs.length))]);
}

export const SERPENT_SET_CHANCE = RAID_SET_CHANCE;
export function rollSerpentSetPiece(rolls = Math.random) {
  if (!(rolls() < SERPENT_SET_CHANCE)) return null;
  return mintAetheric(SERPENT_SET_PIECES[Math.min(SERPENT_SET_PIECES.length - 1, Math.floor(rolls() * SERPENT_SET_PIECES.length))]);
}

export const NUMIDIUM_SET_CHANCE = 1 / 3;
export function rollNumidiumPiece(rolls = Math.random) {
  if (!(rolls() < NUMIDIUM_SET_CHANCE)) return null;
  return mintAetheric(NUMIDIUM_SET_PIECES[Math.min(NUMIDIUM_SET_PIECES.length - 1, Math.floor(rolls() * NUMIDIUM_SET_PIECES.length))]);
}

export const STARSPUN_SET_CHANCE = RAID_SET_CHANCE;
export function rollStarspunPiece(rolls = Math.random, always = false) {
  if (!always && !(rolls() < STARSPUN_SET_CHANCE)) return null;
  return mintAetheric(STARSPUN_SET_PIECES[Math.min(STARSPUN_SET_PIECES.length - 1, Math.floor(rolls() * STARSPUN_SET_PIECES.length))]);
}

export const ELTHERIC_CHANCE = Object.freeze({
  legend: Object.freeze({ deep: 1 / 4, abyss: 1 }),
  vault: Object.freeze({ deep: 1 / 4, abyss: 1 / 2 }),
  ruin: Object.freeze({ deep: 1 / 20, abyss: 1 / 10 }),
  fleet: Object.freeze({ deep: 1, abyss: 1 }),
  storm: Object.freeze({ deep: 1 / 40, abyss: 1 / 20 }),
});
// Salted so the Tidemail roll moves no other roll that shares the source's seed.
export const TIDEMAIL_SALT = 0x71de;
export const elthericChance = (source, band) => (Object.hasOwn(ELTHERIC_CHANCE, source) && Object.hasOwn(ELTHERIC_CHANCE[source], band) ? ELTHERIC_CHANCE[source][band] : 0);
export function rollElthericPiece(rolls = Math.random, chance = 0) {
  if (!(chance > 0) || (chance < 1 && !(rolls() < chance))) return null;
  return mintAetheric(ELTHERIC_SET_PIECES[Math.min(ELTHERIC_SET_PIECES.length - 1, Math.floor(rolls() * ELTHERIC_SET_PIECES.length))]);
}

// Picks which piece only. The caller decides whether one drops, so its odds and pity count stay the only rule.
export function mintPanoplyPiece(rolls = Math.random) {
  const n = PANOPLY_SET_PIECES.length;
  return mintAetheric(PANOPLY_SET_PIECES[Math.max(0, Math.min(n - 1, Math.floor(rolls() * n) || 0))]);
}
export function wyrdPieceById(id) {
  const r = WYRD_PIECE_IDS.includes(id) ? aethericById(id) : null;
  return r ? mintAetheric(r) : null;
}
export function panoplyPieceById(id) {
  const r = EG_PANOPLY_IDS.includes(id) ? aethericById(id) : null;
  return r ? mintAetheric(r) : null;
}
