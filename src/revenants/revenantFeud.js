// @ts-check
// Feud numbers and rules for revenant records: field validators, fight scars, and the traits a revenant is born with.
// Trait draws use idStream, never the shared DFRandom.
import { MOBILE_TYPES as M } from '../characters/mobileTypes.js';
import { factionOf } from '../characters/mobileFactions.js';
import { weaponSkillUsed, WEAPON_MATERIALS } from '../characters/weapons.js';
import { SKILLS } from '../characters/skills.js';
import { setItemFields } from '../items/itemTemplates.js';
import { FEUD_CLASSES } from './feudLedger.js';
import { possessive } from './revenantPersonality.js';
import { isClassEnemyId } from '../characters/enemyBasics.js';

export const SCAR_SHARE = 0.4;
export const SCAR_MAX = 6;
export const SCAR_STAGGERS = 2;
export const SCAR_DODGED = 3;
export const SCAR_BACK = 3;
export const ADAPT_MAX = 3;
export const ADAPT = Object.freeze({
  TAKEN: Object.freeze({ mailed: Object.freeze(['blade', 0.7]), braced: Object.freeze(['blunt', 0.75]), hewnHard: Object.freeze(['axe', 0.7]), unflinching: Object.freeze(['h2h', 0.6]), arrowWise: Object.freeze(['arrow', 0.7]) }),
  TAKEN_FLOOR: 0.6,
  RESIST_OF: Object.freeze({ fireproof: 'fire', rimebound: 'frost', grounded: 'shock', venomBlooded: 'poison', spellScarred: 'magic' }),
  // Daggerfall Unity's Resistant; +50 would be immunity, because the save reaches 0 damage at 100 before its cap.
  RESIST: 25,
  BRACED_POISE: 1.4,
  STEADFAST_POISE: 1.5,
  STEADFAST_IRON: 0.5,
  PATIENT_TRACK: 0.7,
  PATIENT_FEINT: 1 / 3,
  PATIENT_WIND: Object.freeze([0.85, 1.35]),
  ARROW_SPEED: 20,
  ARROW_FAR: 8,
  RELENTLESS_SPEED: 25,
  NIGHT_BLOWS: 1.15,
});
export const WILL_RANK = 2;
export const WILL_STAGGERS = 1;
export const WEAK = Object.freeze({ STRUCK: 1.5, DAYLIGHT: 1.25, RESIST: -50 });
export const FLINCH_HEALTH = 0.5;
export const LAST_STAND_RANK = 3;
export const LAST_STAND_HEALTH = Object.freeze({ 3: 0.3, 4: 0.35, 5: 0.4 });
export const LAST_STAND_ROAR = 1.2;
export const PHASE_TWO = Object.freeze({
  BLOWS: 1.2,
  SPEED: 20,
  WINDUP: 0.85,
  COOLDOWN: 0.7,
  CHAIN_MAX: 2,
  IRON: 0.5,
  SIZE: 1.1,
  GLINT: Object.freeze([1.0, 0.36, 0.12, 0.5]),
});
export const SIG_RANK = 2;
export const SIG = Object.freeze({
  MULT: 2.0,
  COOLDOWN: Object.freeze([12, 18]),
  IRON_RANK: 3,
  COLOR: Object.freeze([0.95, 0.25, 0.04]),
  WIND_PITCH: 0.7,
  PYRE_BASE: Object.freeze([3, 6]),
  PYRE_PER: 1,
});
export const RETINUE = Object.freeze([0, 0, 1, 2, 3, 3]);
export const TOOK_MAX = 3;
export const WRATH_MAX = 3;
export const FESTER = Object.freeze({ DAYS: 3, EVERY: 3, CATCHUP: 7, HEALTH: 0.10, BLOWS: 0.05 });
export const festersOn = (dueDay, day) => { const past = day - dueDay - FESTER.DAYS; return past >= 0 && past % FESTER.EVERY === 0; };
export const ROUT = Object.freeze({ DISTANCE: 70, LOW: 0.5 });

export const SCAR_KINDS = Object.freeze([
  ...FEUD_CLASSES, 'silver', 'mixed', 'staggered', 'dodged', 'back', 'night',
  'slew', 'fled', 'felled', 'routed', 'festered', 'deserted', 'betrayed', 'laststand',
]);
const SCAR_SET = new Set(SCAR_KINDS);
export function feudScars(ledger, deedName = null) {
  const out = [];
  if (ledger) {
    const dmg = ledger.dmg ?? {};
    let total = 0, lead = null, leadN = 0;
    for (const k of FEUD_CLASSES) {
      const n = Number(dmg[k]) || 0;
      total += n;
      if (n > leadN) { lead = k; leadN = n; }
    }
    if (total > 0) out.push(leadN / total >= SCAR_SHARE ? lead : 'mixed');
    if (total > 0 && (Number(ledger.silver) || 0) / total >= SCAR_SHARE) out.push('silver');
    if ((ledger.staggers | 0) >= SCAR_STAGGERS) out.push('staggered');
    if ((ledger.dodged | 0) >= SCAR_DODGED) out.push('dodged');
    if ((ledger.backHits | 0) >= SCAR_BACK || ledger.backstab === true) out.push('back');
    if (ledger.night === true) out.push('night');
  }
  if (deedName && SCAR_SET.has(deedName)) out.push(deedName);
  return out;
}
export function withScars(scars, kinds, at) {
  const out = [...(scars ?? []), ...kinds.map((k) => ({ k, at }))];
  return out.slice(-SCAR_MAX);
}
const sanitizeScars = (v) => (Array.isArray(v) ? v.filter((s) => s && SCAR_SET.has(s.k) && Number.isFinite(s.at)).map((s) => ({ k: s.k, at: s.at })).slice(-SCAR_MAX) : []);

export function weaponFeudClass(weapon) {
  if (!weapon) return { cls: 'h2h', silver: false };
  let skill = null;
  try { skill = Number.isInteger(weapon.templateIndex) ? weaponSkillUsed(weapon.templateIndex) : null; } catch { skill = null; }
  const cls = skill === SKILLS.ShortBlade || skill === SKILLS.LongBlade ? 'blade'
    : skill === SKILLS.BluntWeapon ? 'blunt' : skill === SKILLS.Axe ? 'axe'
      : skill === SKILLS.Archery ? 'arrow' : skill === SKILLS.HandToHand ? 'h2h' : 'other';
  return { cls, silver: weapon.material === WEAPON_MATERIALS.Silver };
}

export function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
export function idStream(id, salt) {
  let a = hashStr(`${id}|${salt}`) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function weighted(pool, rolls) {
  const total = pool.reduce((a, [, w]) => a + w, 0);
  if (!(total > 0)) return null;
  let x = rolls() * total;
  for (const [v, w] of pool) { if ((x -= w) < 0) return v; }
  return pool[pool.length - 1][0];
}

export const WEAKNESS_ELEMENTS = Object.freeze(['fire', 'frost', 'shock', 'poison', 'magic']);
export const WEAKNESS_METALS = Object.freeze(['silver', 'dwarven', 'elven']);
export const WEAKNESS_WEAPONS = Object.freeze(['blunt', 'axe', 'blade', 'arrow', 'h2h']);
// The order is the wire index, up to FOE_WEAK_MAX in wire.js, so new weaknesses go only at the end.
export const WEAKNESSES = Object.freeze([...WEAKNESS_ELEMENTS, ...WEAKNESS_METALS, ...WEAKNESS_WEAPONS, 'daylight']);
const WEAKNESS_SET = new Set(WEAKNESSES);
export const isWeakness = (v) => typeof v === 'string' && WEAKNESS_SET.has(v);
export const weaknessKind = (w) => (WEAKNESS_ELEMENTS.includes(w) ? 'element' : WEAKNESS_METALS.includes(w) ? 'metal' : w === 'daylight' ? 'sun' : WEAKNESS_WEAPONS.includes(w) ? 'weapon' : null);
// The element bits of EFFECT_FLAGS in spellcast.js, as a career's tolerance flags carry them.
const ELEMENT_FLAG = Object.freeze({ fire: 8, frost: 16, poison: 4, shock: 32, magic: 2 });

const UNDEAD = new Set([M.SkeletalWarrior, M.Zombie, M.Ghost, M.Wraith, M.Mummy, M.Lich, M.AncientLich]);
const DAEDRA = new Set([M.FrostDaedra, M.FireDaedra, M.Daedroth, M.DaedraSeducer, M.DaedraLord]);
const ATRONACHS = new Set([M.FireAtronach, M.IronAtronach, M.FleshAtronach, M.IceAtronach]);
const WEREBEASTS = new Set([M.Werewolf, M.Wereboar]);
const VAMPIRES = new Set([M.Vampire, M.VampireAncient]);
const ORCS_GIANTS = new Set([M.Orc, M.OrcSergeant, M.OrcShaman, M.OrcWarlord, M.Giant]);
const OPPOSITE = new Map([[M.FireDaedra, 'frost'], [M.FrostDaedra, 'fire'], [M.FireAtronach, 'frost'], [M.IceAtronach, 'fire']]);

export function weaknessPool(mobileType) {
  const t = mobileType;
  const opp = OPPOSITE.get(t);
  if (UNDEAD.has(t)) return [['fire', 3], ['magic', 1], ['silver', 2], ['blunt', 2], ['daylight', 2]];
  if (DAEDRA.has(t)) return [...(opp ? [[opp, 3]] : []), ['shock', 1], ['magic', 1]];
  if (ATRONACHS.has(t)) return [...(opp ? [[opp, 3]] : []), ['shock', 1], ['blunt', 1]];
  if (VAMPIRES.has(t)) return [['fire', 1], ['dwarven', 2], ['daylight', 2]];
  if (WEREBEASTS.has(t)) return [['fire', 1], ['dwarven', 2]];
  if (ORCS_GIANTS.has(t)) return [['fire', 1], ['shock', 1], ['elven', 1], ['arrow', 1], ['blade', 1]];
  if (isClassEnemyId(t)) return [...WEAKNESS_ELEMENTS.map((e) => [e, 1]), ['silver', 1], ['dwarven', 1], ['blunt', 1], ['axe', 1], ['blade', 1], ['arrow', 1], ['h2h', 1]];
  return [['fire', 2], ['frost', 1], ['axe', 1], ['arrow', 1]];
}
export function drawWeakness(id, mobileType, career = null) {
  const shut = ((career?.resistanceFlags | 0) | (career?.immunityFlags | 0)) >>> 0;
  const pool = weaknessPool(mobileType).filter(([w]) => !(ELEMENT_FLAG[w] && (shut & ELEMENT_FLAG[w])));
  return weighted(pool.length ? pool : [['blunt', 1]], idStream(id, 'weak')) ?? 'blunt';
}
export const lastStandHealth = (rank) => LAST_STAND_HEALTH[Math.min(5, rank | 0)] ?? 0;
export const phaseTwo = () => Object.freeze({ windup: PHASE_TWO.WINDUP, cooldown: PHASE_TWO.COOLDOWN, chainMax: PHASE_TWO.CHAIN_MAX, iron: PHASE_TWO.IRON, size: PHASE_TWO.SIZE });
export const lastStandGlint = (entity) => (entity?.revenant?.p2 ? PHASE_TWO.GLINT : null);
export const lastStandSize = (entity) => entity?.revenant?.p2?.size ?? 1;
const METAL_OF = Object.freeze({ 2: 'silver', 3: 'elven', 4: 'dwarven' });
export const metalOf = (weapon) => (weapon && Number.isInteger(weapon.material) ? METAL_OF[weapon.material] ?? null : null);
export function isWeakBlow(weak, cls, metal = null, day = false) {
  if (!isWeakness(weak)) return false;
  if (weak === 'daylight') return !!day;
  return weak === cls || (metal != null && weak === metal);
}
export const willBroken = (ledger) => !!ledger && ((ledger.weak | 0) > 0 || (ledger.staggers | 0) + (ledger.perfect | 0) >= WILL_STAGGERS);
export const willMatters = (rank) => (rank | 0) >= WILL_RANK;
export const FLINCH_LINES = Object.freeze({
  fire: 'It keeps its eyes on your torch.',
  frost: 'It shrinks from the chill on your breath.',
  shock: 'It flinches at the crackle of a storm.',
  poison: 'It covers its mouth at the reek of venom.',
  magic: 'It flinches from the light gathering in your hands.',
  silver: 'It flinches from the glint of silver.',
  dwarven: 'Its eyes keep straying to your Dwarven steel.',
  elven: 'It shrinks from the shimmer of elven steel.',
  blunt: 'It guards its skull from every swing.',
  axe: 'It twists away from the bite of an axe.',
  blade: 'It turns its throat from every point.',
  arrow: 'It keeps to cover from your arrows.',
  h2h: 'It fears your bare hands more than any steel.',
  daylight: 'It squints and shrinks from the daylight.',
});
export const WEAK_NAMES = Object.freeze({
  fire: 'Fire', frost: 'Frost', shock: 'Shock', poison: 'Poison', magic: 'Magic', silver: 'Silver', dwarven: 'Dwarven steel',
  elven: 'Elven steel', blunt: 'Blunt weapons', axe: 'Axes', blade: 'Blades', arrow: 'Arrows', h2h: 'Bare hands', daylight: 'Daylight',
});
export const WEAK_HINTS = Object.freeze({ element: 'An element', metal: 'A metal', weapon: 'A weapon', sun: 'The sun' });
export const weaknessShut = (weak, career) => !!(ELEMENT_FLAG[weak] && ((((career?.resistanceFlags | 0) | (career?.immunityFlags | 0)) >>> 0) & ELEMENT_FLAG[weak]));

export const SIGNATURES = Object.freeze(['slam', 'charge', 'leap', 'ring', 'pyre']);
const SIG_SET = new Set(SIGNATURES);
export const isSignature = (v) => typeof v === 'string' && SIG_SET.has(v);
const BEASTS = new Set([M.GrizzlyBear, M.SabertoothTiger, M.Spider, M.Werewolf, M.Wereboar, M.GiantScorpion, M.Dragonling, M.Dragonling_Alternate]);
const BRUTES = new Set([M.Giant, M.OrcWarlord, M.Daedroth, M.DaedraLord, M.IronAtronach, M.FleshAtronach, M.Gargoyle, M.Dreugh]);
const BLADES = new Set([M.Centaur, M.Orc, M.OrcSergeant, M.SkeletalWarrior, M.Mummy, M.Vampire, M.VampireAncient, M.FrostDaedra, M.FireDaedra, M.DaedraSeducer, M.Lamia]);
const CASTER_CLASSES = new Set([M.Mage, M.Sorcerer, M.Healer]);
export function signatureFamily(mobileType) {
  if (BEASTS.has(mobileType)) return 'beast';
  if (BRUTES.has(mobileType)) return 'brute';
  if (BLADES.has(mobileType)) return 'blade';
  if (isClassEnemyId(mobileType) && mobileType !== M.None) return CASTER_CLASSES.has(mobileType) ? null : 'blade';
  return null;
}
const SIG_POOL = Object.freeze({ blade: ['slam', 'charge'], beast: ['charge', 'leap'], brute: ['ring', 'charge'] });
export const SIG_NOUNS = Object.freeze({
  slam: Object.freeze(['Skullsplitter', 'Gravefall', 'Anvil', 'Hammerfall', 'Bonebreaker', 'Mountainfall']),
  sweep: Object.freeze(['Widowmaker', 'Red Harvest', 'Reaping', 'Crescent', 'Scythe-Wind']),
  lunge: Object.freeze(['Heartseeker', "Viper's Kiss", 'Spite', 'Last Word']),
  charge: Object.freeze(['Bloodrush', 'Stampede', "Bull's Folly", 'Avalanche']),
  leap: Object.freeze(['Skyfall', "Raptor's Drop", 'Pounce of Ruin']),
  ring: Object.freeze(['Earthbreaker', 'Quake', 'Ruin-Circle']),
});
export const PYRE_NOUNS = Object.freeze(['Pyre', 'Rimefall', 'Blight', 'Stormcall', 'Unmaking']);
// Elements run 0 fire, 1 frost, 2 poison, 3 shock, and 4 magic. The pick goes by kind, not career spells, because
// the page shows the signature name with no body spawned, and it must match the name the spawned body calls out.
const PYRE_ELEMENT = new Map([
  [M.FireAtronach, 0], [M.Imp, 0],
  [M.IceAtronach, 1], [M.Lich, 1], [M.AncientLich, 1],
  [M.Rat, 2], [M.GiantBat, 2], [M.Spriggan, 2], [M.Zombie, 2], [M.Slaughterfish, 2],
  [M.Harpy, 3],
]);
export const pyreElement = (mobileType) => PYRE_ELEMENT.get(mobileType) ?? 4;
export function signatureNoun(r) {
  if (!r?.sig) return null;
  const bank = r.sig === 'pyre' ? [PYRE_NOUNS[pyreElement(r.mobileType)]] : SIG_NOUNS[r.sig];
  if (!bank?.length) return null;
  return bank[Math.min(bank.length - 1, Math.floor(idStream(r.id, 'signame')() * bank.length))];
}
export function signatureName(r) {
  const noun = signatureNoun(r);
  if (!noun) return null;
  return r.given ? `${possessive(r.given)} ${noun}` : noun;
}
export function signatureStamp(r) {
  if (!r || (r.rank | 0) < SIG_RANK || !isSignature(r.sig)) return null;
  return Object.freeze({ kind: r.sig, iron: (r.rank | 0) >= SIG.IRON_RANK, mult: SIG.MULT, cooldown: SIG.COOLDOWN, color: SIG.COLOR, windPitch: SIG.WIND_PITCH, name: signatureName(r), noun: signatureNoun(r), element: pyreElement(r.mobileType) });
}
export function pyreSpell(name, element, mult = SIG.MULT) {
  const e = (type, subType, o = {}) => ({ type, subType, magnitudeBaseLow: 0, magnitudeBaseHigh: 0, magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 1, durationBase: 0, durationMod: 0, durationPerLevel: 1, chanceBase: 100, chanceMod: 0, chancePerLevel: 1, ...o });
  const m = mult > 0 ? mult : 1;
  return Object.freeze({
    name: name ?? 'Pyre', index: -1, element: Number.isInteger(element) ? element : 4, rangeType: 2, icon: 0,
    effects: [e(4, 0, { magnitudeBaseLow: Math.round(SIG.PYRE_BASE[0] * m), magnitudeBaseHigh: Math.round(SIG.PYRE_BASE[1] * m), magnitudeLevelBase: Math.round(SIG.PYRE_PER * m), magnitudeLevelHigh: Math.round(SIG.PYRE_PER * m) }), { type: -1, subType: -1 }, { type: -1, subType: -1 }],
  });
}
export function drawSignature(id, mobileType) {
  const fam = signatureFamily(mobileType);
  const pool = fam ? SIG_POOL[fam] : null;
  if (!pool) return 'pyre';
  return pool[Math.min(pool.length - 1, Math.floor(idStream(id, 'sig')() * pool.length))];
}

/** @type {readonly number[][]} */
const CLASS_FAMILIES = Object.freeze([
  [M.Warrior, M.Barbarian, M.Knight],
  [M.Thief, M.Rogue, M.Burglar, M.Acrobat, M.Assassin],
  [M.Mage, M.Sorcerer, M.Battlemage, M.Spellsword, M.Healer, M.Nightblade],
  [M.Archer, M.Ranger, M.Monk, M.Bard],
]);
export function kinPool(mobileType) {
  if (isClassEnemyId(mobileType)) return CLASS_FAMILIES.find((f) => f.includes(mobileType)) ?? [];
  const fac = factionOf(mobileType);
  if (!fac) return [];
  const members = {
    ORC: [M.Orc, M.OrcSergeant, M.OrcShaman],
    UNDEAD: [M.SkeletalWarrior, M.Zombie, M.Ghost, M.Wraith],
    WEREBEAST: [M.Werewolf, M.Wereboar],
    FAE: [M.Centaur, M.Harpy, M.Gargoyle],
  }[fac];
  return members ?? [mobileType];
}
export function drawKin(id, mobileType) {
  const pool = kinPool(mobileType);
  if (!pool.length) return [];
  const rolls = idStream(id, 'kin');
  const n = Math.max(...RETINUE);
  return Array.from({ length: n }, () => pool[Math.min(pool.length - 1, Math.floor(rolls() * pool.length))]);
}
export const retinueCount = (rank) => RETINUE[Math.max(0, Math.min(5, rank | 0))];
export const BAND_SCATTER_S = 8;
export const BAND_SPACING = 6;
export const RALLY_KIN = 2;
const BAND_WORDS = Object.freeze({ ORC: 'Warband', BEASTPACK: 'Pack', WEREBEAST: 'Pack', UNDEAD: 'Host', FAE: 'Host', VERMIN: 'Brood', AQUATIC: 'Brood' });
const CLASS_BAND_WORDS = Object.freeze(['Warband', 'Crew', 'Coven', 'Crew']);
export function bandWord(mobileType) {
  if (isClassEnemyId(mobileType)) { const i = CLASS_FAMILIES.findIndex((f) => f.includes(mobileType)); return i >= 0 ? CLASS_BAND_WORDS[i] : null; }
  const fac = factionOf(mobileType);
  return fac ? BAND_WORDS[fac] ?? null : null;
}
export function bandName(r) {
  if (!r || retinueCount(r.rank) < 1 || !r.kin?.length) return null;
  const w = bandWord(r.mobileType);
  if (!w) return null;
  return r.given ? `${possessive(r.given)} ${w}` : w;
}
export function bandMembers(r, playerLevel, n = retinueCount(r?.rank)) {
  const kin = Array.isArray(r?.kin) ? r.kin : [];
  return kin.slice(0, Math.max(0, n)).map((t) => ({ mobileType: t, level: isClassEnemyId(t) ? Math.max(1, (playerLevel | 0) - 2) : null }));
}
const sanitizeKin = (v) => (Array.isArray(v) ? v.filter((t) => Number.isInteger(t) && ((t >= 0 && t < 128) || (t >= 128 && t < M.Knight_CityWatch))).slice(0, Math.max(...RETINUE)) : null);

export const LOYALTY_START = Object.freeze({ honourable: 80, weary: 70, humorous: 65, cold: 65, witty: 60, zealous: 60, arrogant: 55, brutal: 55, craven: 45, unhinged: 40 });
export const loyaltyStart = (personality) => LOYALTY_START[personality] ?? 60;
export const sanitizeLoyalty = (v, personality) => (Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : loyaltyStart(personality));
export const LOYALTY = Object.freeze({ WON: 3, DAY_WITH: 2, CALLED: 10, DAY_AWAY: -1, KNOCKED: -8, SENT_TWICE: -10, KIN_EXECUTED: -15 });
export const DEVOTED = Object.freeze({ AT: 90, BLOWS: 1.1, WARN_S: 15 });
/** @type {ReadonlyArray<readonly [number, string]>} */
export const LOYALTY_LABELS = Object.freeze([[DEVOTED.AT, 'Devoted'], [50, 'Loyal'], [20, 'Wavering'], [0, 'Restless']]);
/** @returns {string} */
export const loyaltyLabel = (v) => (LOYALTY_LABELS.find(([at]) => (Number(v) || 0) >= at) ?? LOYALTY_LABELS[LOYALTY_LABELS.length - 1])[1];
export const movedLoyalty = (v, d) => Math.max(0, Math.min(100, Math.round((Number.isFinite(v) ? v : 0) + d)));
export const isDevoted = (v) => Number.isFinite(v) && v >= DEVOTED.AT;
export const BETRAY = Object.freeze({ AT: 10, HEALTH: 0.25, KINDS: Object.freeze(['unhinged', 'craven', 'brutal']) });
export const mayBetray = (r) => !!r?.sworn && r.companion?.loyalty < BETRAY.AT && BETRAY.KINDS.includes(r.personality);
export const DESERT = Object.freeze({ AT: 20, CHANCE: 0.15 });
export function deserterSplit(items, { value, isGold, room }) {
  const list = Array.isArray(items) ? items.filter((it) => it && typeof it === 'object') : [];
  const goods = list.filter((it) => !isGold(it)).sort((a, b) => value(b) - value(a));
  const kept = goods.slice(0, Math.max(0, Math.min(Math.ceil(goods.length / 2), room | 0)));
  return { kept, back: [...goods.slice(kept.length), ...list.filter((it) => isGold(it))] };
}
export const sameKin = (a, b) => Number.isInteger(a) && Number.isInteger(b) && (a === b || (factionOf(a) != null && factionOf(a) === factionOf(b)));

const sanitizeLair = (v) => (v && typeof v === 'object' && Number.isInteger(v.px) && Number.isInteger(v.py) && typeof v.name === 'string' && v.name
  ? { px: v.px, py: v.py, name: v.name.slice(0, 80), region: Number.isInteger(v.region) ? v.region : -1 } : null);
export const RUMOR_CHANCE = 0.35;
export const RUMOR_PX = 20;
export const RUMOR_WEAK = 0.5;
export const RUMOR_NAMED = 1 / 3;
export const RUMOR_HINTS = Object.freeze({ element: 'some element is its bane', metal: 'a metal bites it deep', weapon: 'one kind of weapon hurts it more than the rest', sun: 'it shuns the sun' });
export const LAIR_RING_R = 1.5;
export const LAIR_GOLD = 1.25;
export function pickLair(id, px, py, dungeons) {
  const list = (Array.isArray(dungeons) ? dungeons : []).filter((d) => sanitizeLair(d));
  if (!list.length || !Number.isInteger(px) || !Number.isInteger(py)) return null;
  const bearing = idStream(id, 'lair')() * Math.PI * 2;
  let best = null, bestA = Infinity, bestR = Infinity;
  for (const d of list) {
    const dx = d.px - px, dy = d.py - py;
    let a = Math.abs(Math.atan2(-dy, dx) - bearing) % (Math.PI * 2);
    if (a > Math.PI) a = Math.PI * 2 - a;
    const r = Math.hypot(dx, dy);
    if (a < bestA - 1e-9 || (Math.abs(a - bestA) <= 1e-9 && r < bestR)) { best = d; bestA = a; bestR = r; }
  }
  return sanitizeLair(best);
}
// A lair once chosen is kept after a deed in the open world, unless the player cannot go down into it.
export function lairAfter(r, here) {
  const kept = sanitizeLair(r?.lair);
  if (!here || typeof here !== 'object') return kept;
  if (here.underground) return sanitizeLair(here.underground) ?? kept;
  return (kept && lairEnterable(kept, here) ? kept : null) ?? pickLair(r?.id, here.px, here.py, here.dungeons);
}
export const lairEnterable = (lair, here) => typeof here?.enterable !== 'function' || here.enterable(lair.px, lair.py) !== false;
export const sameLair = (a, b) => (!a && !b) || (!!a && !!b && a.px === b.px && a.py === b.py);

export const ADAPTATIONS = Object.freeze(['mailed', 'braced', 'hewnHard', 'unflinching', 'arrowWise', 'fireproof', 'rimebound', 'grounded', 'venomBlooded', 'spellScarred', 'silverScarred', 'steadfast', 'patient', 'watchful', 'relentless', 'nightStalker']);
const ADAPT_SET = new Set(ADAPTATIONS);
export const isAdaptation = (v) => typeof v === 'string' && ADAPT_SET.has(v);
const TEACHES = Object.freeze({
  blade: 'mailed', blunt: 'braced', axe: 'hewnHard', h2h: 'unflinching', arrow: 'arrowWise',
  fire: 'fireproof', frost: 'rimebound', shock: 'grounded', poison: 'venomBlooded', magic: 'spellScarred',
  silver: 'silverScarred', staggered: 'steadfast', dodged: 'patient', back: 'watchful', routed: 'relentless',
});
// Daggerfall Unity's Skeletal Warrior plus the six of SILVER_DOUBLED_CAREERS in pcaao.js; keep the two in step.
export const SILVER_DOUBLED_KINDS = Object.freeze(new Set([M.SkeletalWarrior, M.Werewolf, M.Ghost, M.Wraith, M.Vampire, M.Mummy, M.Wereboar]));
// Being run from teaches first, and a scar whose lesson is held passes to the next. An element the career already
// resists teaches nothing, because stacked it would be immunity.
export function lessonOf(kinds, learned, mobileType, career = null) {
  const held = new Set(learned ?? []);
  const slew = kinds.includes('slew');
  for (const k of kinds.includes('routed') ? ['routed', ...kinds] : kinds) {
    const a = k === 'night' ? (slew ? 'nightStalker' : null) : TEACHES[k] ?? null;
    if (!a || held.has(a)) continue;
    if (a === 'silverScarred' && !SILVER_DOUBLED_KINDS.has(mobileType)) continue;
    if (ADAPT.RESIST_OF[a] && weaknessShut(ADAPT.RESIST_OF[a], career)) continue;
    return a;
  }
  return null;
}
export const withLesson = (learned, a, rank) => [...(learned ?? []).filter((x) => x !== a), a].slice(-Math.max(1, Math.min(rank | 0, ADAPT_MAX)));
// Bit i is ADAPTATIONS[i], within FOE_ADAPT_MASK_MAX in wire.js, so new adaptations go only at the end.
export const adaptMask = (learned) => (Array.isArray(learned) ? learned : []).reduce((m, a) => { const i = ADAPTATIONS.indexOf(a); return i >= 0 ? (m | (1 << i)) >>> 0 : m; }, 0);
export const maskAdapt = (mask) => ADAPTATIONS.filter((_, i) => ((Number(mask) >>> i) & 1) === 1).slice(0, ADAPT_MAX);
export const weakIndex = (weak) => WEAKNESSES.indexOf(weak);
export const weakAt = (i) => (Number.isInteger(i) && i >= 0 && i < WEAKNESSES.length ? WEAKNESSES[i] : null);
// MIN and MAX match FOE_BLOWS_MIN and FOE_BLOWS_MAX in wire.js.
export const BLOWS_WIRE = Object.freeze({ PER: 1000, MIN: 1000, MAX: 4000 });
export function feudWire(rev) {
  if (!rev) return {};
  const ad = adaptMask(rev.learned), wq = weakIndex(rev.weak);
  const rb = Number.isFinite(rev.blows) && rev.blows > 1 ? Math.max(BLOWS_WIRE.MIN, Math.min(BLOWS_WIRE.MAX, Math.round(rev.blows * BLOWS_WIRE.PER))) : 0;
  return { ...(ad ? { ad } : {}), ...(wq >= 0 ? { wq } : {}), ...(rev.p2 ? { p2: 1 } : {}), ...(rb ? { rb } : {}) };
}
export function feudFromWire(rev, r) {
  const learned = r?.ad != null ? maskAdapt(r.ad) : [];
  const weak = r?.wq != null ? weakAt(r.wq) : null;
  const blows = Number.isInteger(r?.rb) ? r.rb / BLOWS_WIRE.PER : null;
  return { ...(rev ?? {}), learned, weak, edge: adaptEdge(learned, weak), p2: r?.p2 === 1 ? (rev?.p2 ?? phaseTwo()) : null, blows };
}
export function puppetRevenantBlows(entity, r) {
  if (!entity) return 1;
  const factor = (Number.isInteger(r?.rb) ? r.rb / BLOWS_WIRE.PER : 1) * (r?.p2 === 1 ? PHASE_TWO.BLOWS : 1);
  const was = Number.isFinite(entity._revBlows) && entity._revBlows > 0 ? entity._revBlows : 1;
  if (factor === was) return factor;
  // The last factor is divided out first, so a record sent again never doubles it.
  const own = (Number.isFinite(entity.damageScale) && entity.damageScale > 0 ? entity.damageScale : 1) / was;
  entity.damageScale = own * factor;
  entity._revBlows = factor;
  return factor;
}
export function puppetBandName(masterName, masterType) {
  const given = typeof masterName === 'string' ? masterName.split(/[, ]/)[0] : '';
  const w = bandWord(masterType);
  return given && w ? `${possessive(given)} ${w}` : null;
}
export const ADAPT_HOW = Object.freeze({
  mailed: 'blade', braced: 'hammer', hewnHard: 'axe', unflinching: 'fists', arrowWise: 'arrows', fireproof: 'fire',
  rimebound: 'frost', grounded: 'lightning', venomBlooded: 'poison', spellScarred: 'magic', silverScarred: 'silver',
  steadfast: 'heavy blows', patient: 'footwork', watchful: 'tricks from behind', relentless: 'running', nightStalker: 'night raids',
});
// Nothing touches the weakness: no class or element of it is taken less, and a silver weakness keeps the silver double.
export function adaptEdge(learned, weak = null) {
  const has = (a) => (learned ?? []).includes(a);
  /** @type {Record<string, number>} */
  const taken = {};
  for (const [a, [cls, m]] of Object.entries(ADAPT.TAKEN)) if (has(a) && cls !== weak) taken[cls] = Math.max(ADAPT.TAKEN_FLOOR, Number(m));
  /** @type {Record<string, number>} */
  const resist = {};
  for (const [a, el] of Object.entries(ADAPT.RESIST_OF)) if (has(a) && el !== weak) resist[el] = ADAPT.RESIST;
  return Object.freeze({
    taken: Object.freeze(taken), resist: Object.freeze(resist),
    poise: (has('braced') ? ADAPT.BRACED_POISE : 1) * (has('steadfast') ? ADAPT.STEADFAST_POISE : 1),
    iron: has('steadfast') ? ADAPT.STEADFAST_IRON : 0,
    track: has('patient') ? ADAPT.PATIENT_TRACK : null,
    feint: has('patient') ? ADAPT.PATIENT_FEINT : null,
    wind: has('patient') ? ADAPT.PATIENT_WIND : null,
    farSpeed: has('arrowWise') ? ADAPT.ARROW_SPEED : 0, farAt: ADAPT.ARROW_FAR, closes: has('arrowWise'),
    watchful: has('watchful'), silverScarred: has('silverScarred') && weak !== 'silver', relentless: has('relentless'), nightStalker: has('nightStalker'),
    weak: isWeakness(weak) ? weak : null,
  });
}
export function adaptBlowClass(attacker, weapon, kind) {
  if (kind === 'arrow') return 'arrow';
  if (weapon) return weaponFeudClass(weapon).cls;
  return attacker?.isPlayer || isClassEnemyId(attacker?.mobileType ?? 0) ? 'h2h' : 'other';
}

// An older record derives each missing trait from its id.
export function feudFields(r, { id, mobileType, rank }) {
  const fights = Number.isInteger(r.fights) && r.fights >= 0 ? r.fights : (r.kills | 0) + (r.escapes | 0) + (r.returns | 0);
  return {
    scars: sanitizeScars(r.scars),
    learned: Array.isArray(r.learned) ? [...new Set(r.learned.filter(isAdaptation))].slice(-Math.min(rank, ADAPT_MAX)) : [],
    weak: isWeakness(r.weak) ? r.weak : drawWeakness(id, mobileType),
    weakKnown: /** @type {0|1|2} */ (r.weakKnown === 1 || r.weakKnown === 2 ? r.weakKnown : 0),
    sig: rank >= SIG_RANK ? (isSignature(r.sig) ? r.sig : drawSignature(id, mobileType)) : null,
    kin: sanitizeKin(r.kin) ?? drawKin(id, mobileType),
    lair: sanitizeLair(r.lair),
    lairKnown: r.lairKnown === true && !!sanitizeLair(r.lair),
    took: Array.isArray(r.took) ? r.took.filter((it) => it && typeof it === 'object' && Number.isInteger(it.templateIndex)).slice(0, TOOK_MAX).map((it) => setItemFields(it)) : [],
    wrath: Number.isInteger(r.wrath) ? Math.max(0, Math.min(WRATH_MAX, r.wrath)) : 0,
    fights,
  };
}
export function newFeudFields(id, mobileType, rank, career = null) {
  return {
    scars: [], learned: [], weak: drawWeakness(id, mobileType, career), weakKnown: /** @type {0} */ (0),
    sig: rank >= SIG_RANK ? drawSignature(id, mobileType) : null, kin: drawKin(id, mobileType),
    lair: null, lairKnown: false, took: [], wrath: 0, fights: 0,
  };
}
