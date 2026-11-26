// @ts-check
// Sigil set rules: the sets, their pieces, their awake tiers, the set rolls, and the XP drink.
// The stage of a set is that of its lowest worn piece. The tier effects run in sigilSetPowers.js.

import {
  SIGIL_STAGES, SIGIL_SET_IDS, SIGIL_BANDS, sigilSetId, sigilRank, sigilStageIn, renownSigilStage, sigilRenown, sigilChance,
  sigilParty, drinkSigil, sigilRiseLine, sigilOnline, sigilLines, sigilHasBlow, setSigilDueling, sigilDueling,
} from './sigil.js';
import { equipTableOf } from '../characters/equip.js';
import { isShieldTemplate } from './armorMaterials.js';
import { isAmmunition } from './itemTemplates.js';
import { EQUIP_SLOTS } from '../characters/paperdoll.js';
import { ETHER_WORD } from '../world/ethericSea.js';
import { noteReach, catchUpXp, recordedReach, reachOfRanks, CATCH_UP_MULT, _resetSetReachForTests } from './setReach.js';

export const SET_TIERS = Object.freeze([2, 4, 6]);
export const SET_STAGE_MAX = SIGIL_STAGES.length - 1;

export const SET_BODY_SLOTS = Object.freeze([
  EQUIP_SLOTS.Head, EQUIP_SLOTS.RightArm, EQUIP_SLOTS.LeftArm, EQUIP_SLOTS.ChestArmor,
  EQUIP_SLOTS.Gloves, EQUIP_SLOTS.LegsArmor, EQUIP_SLOTS.Feet,
]);
export const SET_PLACES = Object.freeze(['head', 'right arm', 'left arm', 'chest', 'hands', 'legs', 'feet', 'shield', 'weapon']);

export const RAMPAGE_SECONDS = 12;
export const RAMPAGE_STACKS = 3;
export const UNBROKEN_LESS = 50;
// Online a magic round is a classic minute, which the shared clock runs every five real seconds.
export const ROUND_SECONDS = 5;
export const CLEAVE_METRES = 3;
export const WRATH_BELOW = 0.3;
export const NOVA_METRES = 6;
export const WRATH_SECONDS = 10;
export const RIPOSTE_SECONDS = 4;
export const MARK_METRES = 12;
export const MARK_SECONDS = 10;
export const BLOOD_SECONDS = 8;
export const BLOOD_STACKS = 5;
export const COIL_STACKS = 5;
export const COIL_SECONDS = 6;
export const SHED_BELOW = 0.35;
export const STRAND_HITS = 4;
export const STRAND_SECONDS = 8;
export const VEIL_BELOW = 0.3;
export const REPRIEVE_BELOW = 0.2;
export const REPRIEVE_SECONDS = 6;
export const REPRIEVE_METRES = 8;
export const REPRIEVE_ALLY_SHARE = 0.5;

export const BRIEF_MAX = 32;
const tier = (at, key, name, values, text, brief) => Object.freeze({ at, key, name, values: Object.freeze(values), text, brief });

// A raid set's `raid` matches the raid receipt's `y`: 0 knights, 1 bandits, and 2 orcs.
export const SIGIL_SETS = Object.freeze({
  malacath: Object.freeze({
    id: 'malacath', name: "Malacath's Bulwark", prince: 'Malacath', colour: '#a4b84e', aetheric: false,
    role: 'The one who will not fall',
    tiers: Object.freeze([
      tier(2, 'orc-hide', 'Orc-Hide', { armor: [2, 5], endurance: [2, 6] },
        (v) => `+${v.armor} armor on every part, +${v.endurance} Endurance`,
        (v) => `+${v.armor} armour, +${v.endurance} Endurance`),
      tier(4, 'spite', 'Spite of the Spurned', { back: [10, 30] },
        (v) => `Enemies that hit you take ${v.back}% of the damage back. This never kills them`,
        (v) => `Return ${v.back}% of hits taken`),
      tier(6, 'unbroken', 'Unbroken', { halved: [4, 8], recover: [300, 150] },
        (v) => `A hit that would kill you leaves you at 1 health, and you take half damage for ${v.halved} s. Recovers in ${v.recover} s`,
        (v) => `Cheat death, then half damage ${v.halved}s`),
    ]),
  }),
  dagon: Object.freeze({
    id: 'dagon', name: "Dagon's Brand", prince: 'Mehrunes Dagon', colour: '#ec5a3c', aetheric: false,
    role: 'The one who does not stop',
    tiers: Object.freeze([
      tier(2, 'ravager', 'Ravager', { strength: [2, 6], critical: [4, 12] },
        (v) => `+${v.strength} Strength, +${v.critical} Critical Strike`,
        (v) => `+${v.strength} Strength, +${v.critical} Critical Strike`),
      tier(4, 'bloodfury', 'Bloodfury', { more: [4, 12] },
        (v) => `Your weapon deals ${v.more}% more damage, or ${v.more * 2}% more while you are below half health`,
        (v) => `+${v.more}% damage, +${v.more * 2}% below half HP`),
      tier(6, 'rampage', 'Rampage', { stack: [4, 10] },
        (v) => `Each kill adds ${v.stack}% weapon damage for ${RAMPAGE_SECONDS} s, up to ${RAMPAGE_STACKS} times`,
        (v) => `+${v.stack}% per kill, up to ${RAMPAGE_STACKS} (${RAMPAGE_SECONDS}s)`),
    ]),
  }),
  nocturnal: Object.freeze({
    id: 'nocturnal', name: "Nocturnal's Shroud", prince: 'Nocturnal', colour: '#9384f2', aetheric: false,
    role: 'The one who is not seen',
    tiers: Object.freeze([
      tier(2, 'shadows-grace', "Shadow's Grace", { stealth: [4, 12], agility: [2, 6] },
        (v) => `+${v.stealth} Stealth, +${v.agility} Agility`,
        (v) => `+${v.stealth} Stealth, +${v.agility} Agility`),
      tier(4, 'nightfall', 'Nightfall Strike', { more: [25, 60] },
        (v) => `Your weapon and arrows deal ${v.more}% more damage to enemies that have not noticed you`,
        (v) => `+${v.more}% vs unaware foes`),
      tier(6, 'eventide', 'Eventide', { rounds: [1, 3], recover: [30, 15] },
        (v) => `A kill gives you Chameleon for ${v.rounds * ROUND_SECONDS} s. Recovers in ${v.recover} s`,
        (v) => `A kill: Chameleon ${v.rounds * ROUND_SECONDS}s`),
    ]),
  }),
  mora: Object.freeze({
    id: 'mora', name: "Mora's Mantle", prince: 'Hermaeus Mora', colour: '#43c49b', aetheric: false,
    role: 'The one who knows',
    tiers: Object.freeze([
      tier(2, 'forbidden-lore', 'Forbidden Lore', { intelligence: [2, 6], schools: [2, 6] },
        (v) => `+${v.intelligence} Intelligence, +${v.schools} to every school of magic`,
        (v) => `+${v.intelligence} Intelligence, +${v.schools} every school`),
      tier(4, 'waters', 'Waters of Oblivion', { less: [5, 15] },
        (v) => `Your spells cost ${v.less}% less magicka`,
        (v) => `Spells cost ${v.less}% less`),
      tier(6, 'eye', 'Eye of Mora', { absorb: [10, 30] },
        (v) => `Destruction spells that hit you have a ${v.absorb}% chance to be absorbed, giving you their magicka if you have room`,
        (v) => `Absorb ${v.absorb}% of Destruction spells`),
    ]),
  }),
  ruhn: Object.freeze({
    id: 'ruhn', name: "Ruhn's Regalia", prince: 'Mehrunes Dagon', colour: '#ffae45', aetheric: true,
    role: 'The Warden of the Burning Gate, worn',
    tiers: Object.freeze([
      tier(2, 'burning-gate', 'The Burning Gate', { fire: [15, 45], sear: [2, 6] },
        (v) => `+${v.fire} fire resistance, and your weapon hits deal ${v.sear} extra fire damage`,
        (v) => `+${v.fire} fire resist, +${v.sear} fire a blow`),
      tier(4, 'cleave', 'Cleave', { share: [25, 60] },
        (v) => `Your melee hits also strike the nearest other enemy within ${CLEAVE_METRES} m of your target for ${v.share}% of the damage`,
        (v) => `Melee splashes ${v.share}% to a 2nd foe`),
      tier(6, 'wrath', 'Wrath of the Warden', { nova: [10, 40], more: [10, 25], recover: [180, 90] },
        (v) => `When a hit drops you below ${Math.round(WRATH_BELOW * 100)}% health, a Flame Nova deals ${v.nova} damage to every enemy within ${NOVA_METRES} m, and your weapon deals ${v.more}% more damage for ${WRATH_SECONDS} s. Recovers in ${v.recover} s`,
        (v) => `Under ${Math.round(WRATH_BELOW * 100)}%: Nova ${v.nova}, +${v.more}% damage`),
    ]),
  }),
  oath: Object.freeze({
    id: 'oath', name: 'The Broken Oath', prince: 'The towns of the Bay', colour: '#a9bfd6', aetheric: true, raid: 0,
    role: 'The shield the town stands behind',
    tiers: Object.freeze([
      tier(2, 'watch-oath', 'Oath of the Watch', { armor: [1, 4], willpower: [2, 6] },
        (v) => `+${v.armor} armor on every part, +${v.willpower} Willpower`,
        (v) => `+${v.armor} armour, +${v.willpower} Willpower`),
      tier(4, 'riposte', 'Riposte', { more: [15, 40] },
        (v) => `When an enemy hits you, your next weapon hit within ${RIPOSTE_SECONDS} s deals ${v.more}% more damage`,
        (v) => `When hit: next hit +${v.more}% (${RIPOSTE_SECONDS}s)`),
      tier(6, 'hold-the-line', 'Hold the Line', { less: [10, 25] },
        (v) => `While you are below half health, you take ${v.less}% less damage`,
        (v) => `${v.less}% less damage below half HP`),
    ]),
  }),
  thieftaker: Object.freeze({
    id: 'thieftaker', name: "The Thief-Taker's Garb", prince: 'The towns of the Bay', colour: '#d2a45e', aetheric: true, raid: 1,
    role: 'The one who runs them down',
    tiers: Object.freeze([
      tier(2, 'keen-eyed', 'Keen-Eyed', { agility: [2, 6], archery: [4, 12] },
        (v) => `+${v.agility} Agility, +${v.archery} Archery`,
        (v) => `+${v.agility} Agility, +${v.archery} Archery`),
      tier(4, 'run-them-down', 'Run Them Down', { more: [8, 20] },
        (v) => `Your weapon and arrows deal ${v.more}% more damage to enemies below half health`,
        (v) => `+${v.more}% on foes below half HP`),
      tier(6, 'no-escape', 'No Escape', { more: [15, 40] },
        (v) => `A kill marks the nearest other enemy within ${MARK_METRES} m for ${MARK_SECONDS} s. Your weapon deals ${v.more}% more damage to it`,
        (v) => `Kill marks next foe: +${v.more}% (${MARK_SECONDS}s)`),
    ]),
  }),
  orcsbane: Object.freeze({
    id: 'orcsbane', name: 'Orcsbane Harness', prince: 'The towns of the Bay', colour: '#8aac5c', aetheric: true, raid: 2,
    role: 'The one the horde breaks against',
    tiers: Object.freeze([
      tier(2, 'thick-skinned', 'Thick-Skinned', { endurance: [2, 6], blunt: [4, 12] },
        (v) => `+${v.endurance} Endurance, +${v.blunt} Blunt Weapon`,
        (v) => `+${v.endurance} Endurance, +${v.blunt} Blunt Weapon`),
      tier(4, 'blood-for-blood', 'Blood for Blood', { stack: [3, 8] },
        (v) => `Each enemy hit on you adds ${v.stack}% weapon damage for ${BLOOD_SECONDS} s, up to ${BLOOD_STACKS} times`,
        (v) => `+${v.stack}% per hit taken, up to ${BLOOD_STACKS} (${BLOOD_SECONDS}s)`),
      tier(6, 'iron-hide', 'Iron Hide', { ward: [10, 40], recover: [60, 30] },
        (v) => `A kill gives you a ward that blocks the next ${v.ward} damage you take. Recovers in ${v.recover} s`,
        (v) => `A kill: a ${v.ward}-point ward`),
    ]),
  }),
  coilscale: Object.freeze({
    id: 'coilscale', name: "Sethrakul's Coilscale", prince: 'Satakal', colour: '#3a9ad9', aetheric: true,
    role: 'The Old Coil, shed and worn',
    tiers: Object.freeze([
      tier(2, 'sea-scale', 'Sea-Scale', { frost: [10, 30], endurance: [2, 6] },
        (v) => `+${v.frost} frost resistance, +${v.endurance} Endurance`,
        (v) => `+${v.frost} frost resist, +${v.endurance} Endurance`),
      tier(4, 'constrict', 'Constrict', { stack: [3, 8] },
        (v) => `Each weapon hit on an enemy adds ${v.stack}% weapon damage against it, up to ${COIL_STACKS} times, lasting ${COIL_SECONDS} s after your last hit. Each enemy keeps its own count`,
        (v) => `+${v.stack}% per hit on a foe, up to ${COIL_STACKS}`),
      tier(6, 'shed-skin', 'Shed Skin', { heal: [10, 30], recover: [240, 120] },
        (v) => `When a hit drops you below ${Math.round(SHED_BELOW * 100)}% health, you shed your skin and heal ${v.heal}% of your health. Recovers in ${v.recover} s`,
        (v) => `Under ${Math.round(SHED_BELOW * 100)}%: shed skin, heal ${v.heal}%`),
    ]),
  }),
  numidium: Object.freeze({
    id: 'numidium', name: 'The Brass of Numidium', prince: 'Kagrenac', colour: '#b5862f', aetheric: true,
    role: 'What the Warp kept of the Walking Brass',
    tiers: Object.freeze([
      tier(2, 'dwemer-brass', 'Dwemer Brass', { magic: [4, 10], shock: [4, 10] },
        (v) => `+${v.magic} magic resistance, +${v.shock} shock resistance`,
        (v) => `+${v.magic} magic, +${v.shock} shock resist`),
      tier(4, 'gearward', 'Gearward', { lighter: [15, 30], recover: [18, 12] },
        (v) => `The next enemy hit on you deals ${v.lighter}% less damage. Recovers in ${v.recover} s`,
        (v) => `A foe's blow ${v.lighter}% lighter`),
      tier(6, 'hour-turns', 'The Hour Turns', { heal: [15, 25], recover: [90, 60] },
        (v) => `A hit that would kill you leaves you alive and heals ${v.heal}% of your health. Recovers in ${v.recover} s`,
        (v) => `Death turned back, heal ${v.heal}%`),
    ]),
  }),
  panoply: Object.freeze({
    id: 'panoply', name: "The Battlemage's Panoply", prince: 'The Imperial Battlemages', colour: '#5c7cc4', aetheric: true,
    role: 'What the Kyn took from the Battlemages',
    tiers: Object.freeze([
      tier(2, 'battlemages-bearing', "Battlemage's Bearing", { resist: [5, 15], magicka: [10, 30] },
        (v) => `+${v.resist} to every resistance, +${v.magicka} magicka`,
        (v) => `+${v.resist} all resists, +${v.magicka} magicka`),
      tier(4, 'battlemages-discipline', "Battlemage's Discipline", { armed: [20, 50], refund: [5, 15] },
        (v) => `Casting a spell adds its element to your next weapon hit for ${v.armed}% more damage. Each weapon hit restores ${v.refund}% of your last spell's cost as magicka`,
        (v) => `Cast arms blow +${v.armed}%, ${v.refund}% MP back`),
      tier(6, 'battlemages-reprieve', "Battlemage's Reprieve", { shield: [15, 40], recover: [240, 120] },
        (v) => `When a hit drops you below ${Math.round(REPRIEVE_BELOW * 100)}% health, you gain a shield worth ${v.shield}% of your max health for ${REPRIEVE_SECONDS} s, and allies within ${REPRIEVE_METRES} m get half of it. Recovers in ${v.recover} s`,
        (v) => `Under ${Math.round(REPRIEVE_BELOW * 100)}%: shield ${v.shield}% of HP`),
    ]),
  }),
  wyrd: Object.freeze({
    id: 'wyrd', name: "The Wyrd's Raiment", prince: 'The Glenmoril Wyrd', colour: '#8fd16a', aetheric: true,
    role: 'What the Wyrd wear to the Witches\' Festival',
    tiers: Object.freeze([
      tier(2, 'wyrd-sight', 'Wyrd-Sight', { willpower: [2, 6], magic: [5, 15] },
        (v) => `+${v.willpower} Willpower, +${v.magic} magic resistance`,
        (v) => `+${v.willpower} Willpower, +${v.magic} magic resist`),
      tier(4, 'tallow-ward', 'Tallow-Ward', { more: [10, 30] },
        (v) => `Your weapon deals ${v.more}% more damage to the undead, the Daedra and the atronachs`,
        (v) => `+${v.more}% vs undead and summoned`),
      tier(6, 'soul-harvest', 'Soul Harvest', { heal: [8, 20], recover: [40, 20] },
        (v) => `A kill restores ${v.heal}% of your health and magicka. Recovers in ${v.recover} s`,
        (v) => `A kill: +${v.heal}% health, magicka`),
    ]),
  }),
  starspun: Object.freeze({
    id: 'starspun', name: 'The Starspun Weave', prince: 'Mephala', colour: '#b9a2ff', aetheric: true,
    role: 'The coven\'s thread, turned on the coven',
    tiers: Object.freeze([
      tier(2, 'spinners-thread', "Spinner's Thread", { poison: [10, 30], agility: [2, 6] },
        (v) => `+${v.poison} poison resistance, +${v.agility} Agility`,
        (v) => `+${v.poison} poison resist, +${v.agility} Agility`),
      tier(4, 'bound-in-silk', 'Bound in Silk', { more: [60, 140] },
        (v) => `Every ${STRAND_HITS}th weapon hit on the same enemy deals ${v.more}% more damage. The count falls away ${STRAND_SECONDS} s after your last hit on it`,
        (v) => `Every ${STRAND_HITS}th hit on a foe +${v.more}%`),
      tier(6, 'mephalas-veil', "Mephala's Veil", { rounds: [2, 4], recover: [240, 120] },
        (v) => `When a hit drops you below ${Math.round(VEIL_BELOW * 100)}% health, the web hides you. Chameleon for ${v.rounds * ROUND_SECONDS} s. Recovers in ${v.recover} s`,
        (v) => `Under ${Math.round(VEIL_BELOW * 100)}%: Chameleon ${v.rounds * ROUND_SECONDS}s`),
    ]),
  }),
  eltheric: Object.freeze({
    id: 'eltheric', name: `The ${ETHER_WORD} Tidemail`, prince: 'The Drowned Queen', colour: '#6fcfe6', aetheric: true,
    role: 'What the deep gives back to those who sail it',
    tiers: Object.freeze([
      tier(2, 'stormwrack', 'Stormwrack', { shock: [10, 30], speed: [2, 6] },
        (v) => `+${v.shock} shock resistance, +${v.speed} Speed`,
        (v) => `+${v.shock} shock resist, +${v.speed} Speed`),
      tier(4, 'undertow', 'Undertow', { more: [15, 40] },
        (v) => `Your weapon deals ${v.more}% more damage in the open ${ETHER_WORD} Ocean, and half of that anywhere else`,
        (v) => `+${v.more}% at sea, half ashore`),
      tier(6, 'captains-due', "The Captain's Due", { guns: [10, 30], hull: [10, 25] },
        (v) => `Your ship's guns deal ${v.guns}% more damage, and your ship takes ${v.hull}% less from guns and rams`,
        (v) => `Guns +${v.guns}%, hull hits -${v.hull}%`),
    ]),
  }),
});
export const WORLD_SET_IDS = Object.freeze(Object.values(SIGIL_SETS).filter((s) => !s.aetheric).map((s) => s.id));
export const setById = (id) => (typeof id === 'string' && Object.hasOwn(SIGIL_SETS, id) ? SIGIL_SETS[id] : null);
// World sets have no `raid` field, so the `in` check keeps an undefined party from matching them.
export const raidSetOf = (party) => Object.values(SIGIL_SETS).find((s) => 'raid' in s && s.raid === party) ?? null;

export function stageValue(pair, stage) {
  const [faint, asc] = pair;
  const s = Math.max(0, Math.min(SET_STAGE_MAX, Math.trunc(Number(stage) || 0)));
  return Math.round(faint + ((asc - faint) * s) / SET_STAGE_MAX);
}
export function tierValues(t, stage) {
  const out = {};
  for (const [k, pair] of Object.entries(t.values)) out[k] = stageValue(pair, stage);
  return out;
}

export function setPieceKind(item) {
  if (!item) return null;
  if (item.group === 'Armor') return isShieldTemplate(item.templateIndex) ? 'shield' : 'armor';
  if (item.group === 'Weapons') return isAmmunition(item) ? null : 'weapon';
  return null;
}
export const setIdOf = (item) => (setPieceKind(item) ? sigilSetId(item?.sigil) : null);
export const isSetPiece = (item) => setIdOf(item) != null;

export function wornSetPieces(entity) {
  /** @type {Map<string, any[]>} */
  const out = new Map();
  const slots = entity?.equip ? equipTableOf(entity) : null;
  if (!slots) return out;
  const add = (it) => { const id = setIdOf(it); if (!id) return; if (!out.has(id)) out.set(id, []); out.get(id).push(it); };
  for (const slot of SET_BODY_SLOTS) { const it = slots[slot]; if (it && setPieceKind(it) === 'armor') add(it); }
  const left = slots[EQUIP_SLOTS.LeftHand], right = slots[EQUIP_SLOTS.RightHand];
  if (left && setPieceKind(left) === 'shield') add(left);
  // One weapon counts per set, right hand first, because Daggerfall swings one hand at a time.
  const weaponOf = new Set();
  for (const hand of [right, left]) {
    if (!hand || setPieceKind(hand) !== 'weapon') continue;
    const id = setIdOf(hand);
    if (!id || weaponOf.has(id)) continue;
    weaponOf.add(id);
    add(hand);
  }
  return new Map([...out.entries()].sort((a, b) => SIGIL_SET_IDS.indexOf(a[0]) - SIGIL_SET_IDS.indexOf(b[0])));
}

export function setSetsDueling(on) { setSigilDueling(on); }
export const setsDueling = () => sigilDueling();
export const setsAwake = () => sigilRenown() != null && !sigilDueling();

/**
 * @param {string} id
 * @param {Array<{ sigil?: any }>} pieces
 * @param {number|null} renown
 * @param {boolean} [awake]
 * @param {{ text?: boolean }} [opts]
 */
export function setState(id, pieces, renown, awake = true, { text = true } = {}) {
  const set = setById(id);
  if (!set) return null;
  const count = pieces.length;
  const cap = awake ? renownSigilStage(renown) : -1;
  let low = null, lowXp = Infinity;
  for (const p of pieces) { const x = Number(p.sigil?.xp) || 0; if (x < lowXp) { lowXp = x; low = p; } }
  const lowRank = low ? sigilRank(low.sigil) : SET_STAGE_MAX + 1;
  const stage = cap < 0 || !count ? -1 : Math.min(lowRank, cap);
  let heldPiece = null, heldRenown = false;
  if (stage >= 0 && stage < SET_STAGE_MAX) { heldPiece = lowRank <= cap ? low : null; heldRenown = cap <= lowRank; }
  const at = Math.max(0, stage);
  return {
    id, set, count, stage, heldPiece, heldRenown,
    renownNext: heldRenown ? SIGIL_STAGES[stage + 1].renown : null,
    stageName: stage < 0 ? 'Dormant' : SIGIL_STAGES[stage].name,
    tiers: set.tiers.map((t) => {
      const values = tierValues(t, at);
      return { at: t.at, key: t.key, name: t.name, awake: stage >= 0 && count >= t.at, values, text: text ? t.text(values) : '',
        full: text ? t.text(tierValues(t, SET_STAGE_MAX)) : '', brief: text ? t.brief(values) : '',
        recover: Number.isFinite(values.recover) ? values.recover : null };
    }),
  };
}
export function wornSets(entity, renown = sigilRenown(), awake = setsAwake(), opts = undefined) {
  const out = [];
  for (const [id, pieces] of wornSetPieces(entity)) { const st = setState(id, pieces, renown, awake, opts); if (st) out.push(st); }
  return out;
}
export function awakeTier(entity, id, index) {
  if (!entity?.isPlayer || entity.peer || !setsAwake()) return null;
  const pieces = wornSetPieces(entity).get(id);
  if (!pieces) return null;
  const st = setState(id, pieces, sigilRenown(), true);
  const t = st?.tiers[index];
  return t && t.awake ? t.values : null;
}

export const SET_WEAPON_JOIN_IN = 3;
export const rollWorldSet = (rolls = Math.random) => WORLD_SET_IDS[Math.min(WORLD_SET_IDS.length - 1, Math.floor(rolls() * WORLD_SET_IDS.length))];
export function rollSetSigil(tier, party, rolls = Math.random) {
  if (!SIGIL_BANDS[tier]) return null;
  if (rolls() * 1000 >= sigilChance(party)) return null;
  return { set: rollWorldSet(rolls), party: sigilParty(party), xp: 0 };
}
export const rollSetJoin = (rolls = Math.random) => (rolls() * SET_WEAPON_JOIN_IN < 1 ? rollWorldSet(rolls) : null);

const lowestRank = (pieces) => pieces.reduce((low, p) => Math.min(low, sigilRank(p.sigil)), SET_STAGE_MAX);
export function wornSetRanks(entity) {
  return new Map([...wornSetPieces(entity)].map(([id, pieces]) => [id, pieces.map((p) => sigilRank(p.sigil))]));
}
export const setReachOf = (entity, id) => Math.max(recordedReach(id), reachOfRanks(wornSetRanks(entity).get(id) ?? []));
export function setRiseLine(id, rank) {
  const set = setById(id), stage = SIGIL_STAGES[rank];
  if (!set || !stage) return null;
  const line = `${/^The /.test(set.name) ? set.name : `Your ${set.name}`} brightens: ${stage.name}.`;
  const cap = renownSigilStage(sigilRenown());
  if (cap < 0 || cap >= rank) return line;
  return `${line} Your Renown limits it to ${SIGIL_STAGES[cap].name} until Renown ${SIGIL_STAGES[cap + 1].renown}.`;
}
/** @returns {{ lines: string[], rose: boolean }} */
export function drinkWorn(entity, held, xp, nameOf = (it) => String(it?.name ?? 'weapon')) {
  const awake = setsAwake();
  const worn = awake ? wornSetPieces(entity) : new Map();
  const was = new Map([...worn].map(([id, pieces]) => [id, lowestRank(pieces)]));
  // Reach is noted before the drink for the catch-up rate and again after, so a rise from this drink counts.
  const reach = awake ? noteReach(wornSetRanks(entity)) : new Map();
  const drink = (p) => { const id = setIdOf(p); return id ? catchUpXp(xp, p.sigil?.xp, reach.get(id) ?? -1) : xp; };
  // A set weapon sleeps with its set in a duel, while a plain sigil weapon still drinks.
  const rank = setIdOf(held) && sigilDueling() ? null : drinkSigil(held, drink(held));
  for (const pieces of worn.values()) for (const p of pieces) if (p !== held) drinkSigil(p, drink(p));
  if (awake) noteReach(wornSetRanks(entity));
  const risen = [];
  for (const [id, pieces] of worn) { const now = lowestRank(pieces); if (now > was.get(id)) risen.push([id, now]); }
  const lines = [];
  const heldSet = setIdOf(held);
  if (rank != null && !risen.some(([id]) => id === heldSet)) lines.push(sigilRiseLine(nameOf(held), rank));
  for (const [id, now] of risen) lines.push(setRiseLine(id, now));
  return { lines: lines.filter(Boolean), rose: risen.length > 0 };
}

let _wearer = () => null;
export function setSetsWearer(fn) { _wearer = typeof fn === 'function' ? fn : () => null; }
export const setsWearer = () => { try { return _wearer() ?? null; } catch { return null; } };

export function setPlacesWorn(entity, id) {
  const out = new Array(SET_PLACES.length).fill(false);
  const slots = entity?.equip ? equipTableOf(entity) : null;
  if (!slots || !id) return out;
  SET_BODY_SLOTS.forEach((slot, i) => { const it = slots[slot]; if (it && setPieceKind(it) === 'armor' && setIdOf(it) === id) out[i] = true; });
  const left = slots[EQUIP_SLOTS.LeftHand], right = slots[EQUIP_SLOTS.RightHand];
  if (left && setPieceKind(left) === 'shield' && setIdOf(left) === id) out[SET_BODY_SLOTS.length] = true;
  if ([right, left].some((h) => h && setPieceKind(h) === 'weapon' && setIdOf(h) === id)) out[SET_BODY_SLOTS.length + 1] = true;
  return out;
}
export const setsSleep = () => (!sigilOnline() ? 'offline' : sigilRenown() == null ? 'renown' : sigilDueling() ? 'duel' : null);

export function setCardView(item, wearer = setsWearer()) {
  const id = setIdOf(item);
  const set = setById(id);
  if (!set) return null;
  const pieces = wornSetPieces(wearer).get(id) ?? [];
  const sleep = setsSleep();
  const st = setState(id, pieces, sigilRenown(), sleep == null);
  const reach = st.heldPiece ? setReachOf(wearer, id) : -1;
  const catchUp = st.heldPiece && sigilRank(st.heldPiece.sigil) < reach ? { stage: reach, name: SIGIL_STAGES[reach].name, mult: CATCH_UP_MULT } : null;
  return {
    id, name: set.name, prince: set.prince, role: set.role, colour: set.colour, aetheric: set.aetheric,
    count: st.count, of: SET_PLACES.length, places: setPlacesWorn(wearer, id), worn: pieces.includes(item),
    stage: st.stage, stageName: st.stage < 0 ? null : st.stageName, heldPiece: st.heldPiece, renownNext: st.renownNext,
    sleep, tiers: st.tiers, catchUp,
  };
}
// English on purpose: set lines are not localized yet, and a translated pace inside an English line reads badly.
export const catchUpText = (c, next = null) => (!c ? '' : c.name === next ? `${c.mult}x XP` : `${c.mult}x XP to ${c.name}`);
const SLEEP_WORDS = Object.freeze({ offline: 'sets only work online', renown: 'waiting for your Renown', duel: "sets don't work in duels" });
export const setSleepText = (sleep) => SLEEP_WORDS[sleep] ?? null;
export function setSigilLines(item) {
  const lines = sigilLines(item);
  return lines.length && sigilDueling() && setIdOf(item) && !sigilHasBlow(item.sigil) ? ['Sigil (inactive in a duel)'] : lines;
}
export function setLines(item, wearer = setsWearer()) {
  const v = setCardView(item, wearer);
  if (!v) return [];
  const why = setSleepText(v.sleep);
  const head = `${v.name}: ${v.count} of ${v.of} worn${v.stageName ? `, ${v.stageName}` : ''}${why ? ` (${why})` : ''}${v.catchUp ? `, ${catchUpText(v.catchUp)}` : ''}`;
  return [head, ...v.tiers.map((t) => `${t.at} pieces - ${t.name}: ${t.brief}${t.recover != null ? `, every ${t.recover}s` : ''}${t.awake ? '' : v.count < t.at ? ` (${t.at - v.count} more)` : ' (inactive)'}`)];
}

export function _resetSigilSetsForTests() { setSigilDueling(false); _wearer = () => null; _resetSetReachForTests(); }
