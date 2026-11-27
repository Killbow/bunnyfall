// @ts-check
import { composeLook } from '../net/remotePlayers.js';
import { LOOK_GROUPS } from '../net/wire.js';
import { EQUIP_SLOTS, equipTableOf } from './equip.js';
import { creatureLook } from './creatureBodies.js';
import { ARMOR_ENUM, WEAPONS_ENUM, equipmentVariantFor } from '../combat/enemyEquipment.js'; import { ARMOR_MATERIAL } from '../items/armorMaterials.js'; import { MOBILE_TYPES } from './mobileTypes.js';
import { npcHint } from './wardrobe.js';
import { isClassEnemyId, isClassicEnemyId } from './enemyBasics.js';

/** @type {ReadonlyArray<[string, number]>} */
export const FOE_RACES = Object.freeze([
  ['Breton', 30], ['Redguard', 25], ['Nord', 10], ['WoodElf', 9], ['DarkElf', 8], ['HighElf', 8], ['Khajiit', 5], ['Argonian', 5],
]);
const RACE_TOTAL = FOE_RACES.reduce((a, [, w]) => a + w, 0);

export const FOE_WARDROBE = Object.freeze({
  male: Object.freeze({ group: 'MensClothing', shirts: [165, 166, 167, 168, 169, 170, 171, 172, 158], legs: [151, 152], feet: [147, 149, 148] }),
  female: Object.freeze({ group: 'WomensClothing', shirts: [202, 203, 204, 205, 206, 207, 208, 209, 184], legs: [190, 212], feet: [186, 188, 187] }),
});
export const FOE_DYES = Object.freeze([1, 3, 5, 0, 2, 9, 4, 6]);

function mix(h) {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
/**
 * @param {any} f
 */
export function foeSeed(f) {
  if (f._mwSeedWire != null) return f._mwSeedWire;
  const own = ownPerson(f);
  if (own != null) return own;
  if (f._mwSeed != null) return f._mwSeed;
  const at = f.marker ?? null;
  let h = mix((f.mobileType | 0) + 0x9e3779b9);
  if (at) for (const v of [at[0], at[2]]) h = mix(h ^ (Math.round((v || 0) * 10) | 0));
  else {
    h = mix(h ^ ((f.seq ?? f.id ?? 0) | 0));
    const p = f.ai?.feet;
    if (p) for (const v of [p[0], p[2]]) h = mix(h ^ (Math.round((v || 0) * 10) | 0));
  }
  return (f._mwSeed = h);
}
/** @param {any} f */
export function ownPerson(f) {
  const p = f?.person ?? f?.entity?.revenant?.person;
  return Number.isInteger(p) && p >= 0 && p <= 0xffffffff ? p : null;
}
const pick = (list, h) => list[h % list.length];

function bayPerson(h) {
  let r = mix(h ^ 0x51ed27) % RACE_TOTAL, race = FOE_RACES[0][0];
  for (const [name, w] of FOE_RACES) { if (r < w) { race = name; break; } r -= w; }
  return { race, faceIndex: mix(h ^ 0xfa) % 10 };
}
function clothesUnder(items, W, h) {
  const has = new Set(items.map((it) => it.equipSlot));
  const dye = (k) => pick(FOE_DYES, mix(h ^ k));
  if (!has.has(EQUIP_SLOTS.ChestClothes)) items.push({ templateIndex: pick(W.shirts, mix(h ^ 0xc1)), group: W.group, equipSlot: EQUIP_SLOTS.ChestClothes, dye: dye(0xd1) });
  if (!has.has(EQUIP_SLOTS.LegsClothes)) items.push({ templateIndex: pick(W.legs, mix(h ^ 0xc2)), group: W.group, equipSlot: EQUIP_SLOTS.LegsClothes, dye: dye(0xd2) });
  if (!has.has(EQUIP_SLOTS.Feet)) items.push({ templateIndex: pick(W.feet, mix(h ^ 0xc3)), group: W.group, equipSlot: EQUIP_SLOTS.Feet, dye: dye(0xd3) });
  return items;
}

export const isClassFoe = (f) => !!f?.entity?.isClass;
/** @type {Set<number>} */
export const ORC_MOBILES = new Set([MOBILE_TYPES.Orc, MOBILE_TYPES.OrcSergeant, MOBILE_TYPES.OrcShaman, MOBILE_TYPES.OrcWarlord]);
/** @type {Set<number>} */
export const VAMPIRE_MOBILES = new Set([MOBILE_TYPES.Vampire, MOBILE_TYPES.VampireAncient]);
export const WOLF_MOBILE = MOBILE_TYPES.Werewolf;
/**
 * @type {Map<number, Readonly<{ race?: string, sprite?: string }>>}
 */
const _modPeople = new Map();
export function registerPersonFoes(rows) {
  for (const [t, p] of rows) {
    if (!Number.isInteger(t) || isClassicEnemyId(t) || _modPeople.has(t)) throw new Error(`registerPersonFoes: mobile ${t} is classic or already named`);
    if (!!p.race === !!p.sprite) throw new Error(`registerPersonFoes: mobile ${t} is a person or a sprite, never both`);
    if (p.race && !FOE_RACES.some(([r]) => r === p.race)) throw new Error(`registerPersonFoes: mobile ${t}'s race ${p.race} is none of the Bay's`);
    if (p.sprite && !(String(p.sprite).length > 4)) throw new Error(`registerPersonFoes: mobile ${t}'s sprite says why`);
    _modPeople.set(t, Object.freeze({ ...p }));
  }
}
export function _resetPersonFoes() { _modPeople.clear(); }
const modRace = (t) => _modPeople.get(t)?.race;

export const isPersonFoe = (f) => {
  const p = _modPeople.get(f?.mobileType);
  if (p) return !!p.race;
  return isClassFoe(f) || ORC_MOBILES.has(f?.mobileType) || VAMPIRE_MOBILES.has(f?.mobileType) || f?.mobileType === WOLF_MOBILE;
};
export const isBodyFoe = (f) => isPersonFoe(f) || !!creatureLook(f);

export function foeLook(f) {
  const e = f.entity;
  if (f._mwWire && (f._mwSeedWire == null || (f._mwWire === 'kit' && f._mwWornWire == null))) return null;
  const slots = f._mwWire === 'kit' ? f._mwWornWireSlots : equipTableOf(e);
  const held = f._mwLookSlots;
  const h = foeSeed(f);
  if (f._mwLook && held && held.length === slots.length && f._mwLookSeed === h) {
    let same = true;
    for (let i = 0; i < slots.length; i++) if (slots[i] !== held[i]) { same = false; break; }
    if (same) return f._mwLook;
  }
  f._mwLookSlots = slots.slice();
  const worn = f._mwWire === 'kit' ? f._mwWornWire : composeLook(e, { eotbSet: null }).items;
  const wornKey = worn.map((it) => `${it.equipSlot}:${it.templateIndex}:${it.material ?? ''}:${it.dye ?? ''}:${it.variant ?? ''}:${it.ap ?? ''}`).join('|');
  if (f._mwLook && f._mwLookKey === wornKey && f._mwLookSeed === h) return f._mwLook;
  f._mwLookSeed = h;
  const bay = bayPerson(h), faceIndex = bay.faceIndex;
  const race = ORC_MOBILES.has(f.mobileType) ? 'Orc' : modRace(f.mobileType) ?? bay.race;
  const gender = f.gender === 'female' ? 'female' : 'male';
  f._mwLookKey = wornKey;
  return (f._mwLook = { race, gender, faceIndex, items: clothesUnder([...worn], FOE_WARDROBE[gender], h), npc: npcHint(h, 0), ...(VAMPIRE_MOBILES.has(f.mobileType) ? { vampire: true } : {}), ...(f.mobileType === WOLF_MOBILE ? { wolf: true } : {}) });
}

const WORN_FIELDS = Object.freeze(['material', 'dye', 'variant']);
/**
 * @param {any[]} items
 * @returns {{ lw: number[][], la: number[][] | null }}
 */
function encodeKit(items) {
  const lw = [], la = [];
  for (const it of items) {
    const g = LOOK_GROUPS.indexOf(it.group);
    if (g < 0 || !Number.isInteger(it.templateIndex) || !Number.isInteger(it.equipSlot)) continue;
    if (Array.isArray(it.ap)) la.push([lw.length, ...it.ap]);
    lw.push([it.equipSlot, g, it.templateIndex, ...WORN_FIELDS.map((k) => (Number.isInteger(it[k]) ? it[k] : -1))]);
  }
  return { lw, la: la.length ? la : null };
}
/**
 * @param {number[][]} lw
 * @param {number[][]|null} [la]
 */
export function decodeWorn(lw, la = null) {
  const items = lw.map(([equipSlot, g, templateIndex, ...rest]) => {
    const it = /** @type {any} */ ({ templateIndex, group: LOOK_GROUPS[g], equipSlot });
    WORN_FIELDS.forEach((k, i) => { if (rest[i] >= 0) it[k] = rest[i]; });
    return it;
  });
  for (const [i, t, m, v] of la ?? []) if (items[i]) items[i].ap = [t, m, v];
  return items;
}
export const kitWire = (/** @type {{ lw?: number[][], la?: number[][] | null }} */ r) => (Array.isArray(r?.lw) ? (r.la ? { lw: r.lw, la: r.la } : { lw: r.lw }) : null);
const kitKey = (/** @type {number[][]} */ lw, /** @type {number[][]|null|undefined} */ la) => `${lw.map((w) => w.join(',')).join(';')}${la ? `|${la.map((w) => w.join(',')).join(';')}` : ''}`;
/**
 * @param {any} f
 * @returns {{ seed: number, worn: number[][]|null, looks: number[][]|null, kit: { lw: number[][], la?: number[][] }|null, key: string }}
 */
export function foeWireLook(f) {
  const seed = foeSeed(f);
  let worn = null, looks = null;
  if (isPersonFoe(f)) {
    if (f._mwWornWireRaw) { worn = f._mwWornWireRaw; looks = f._mwWornWireLooks ?? null; }
    else {
      const slots = equipTableOf(f.entity), held = f._mwWireSlots;
      let same = !!held && held.length === slots.length;
      if (same) for (let i = 0; i < slots.length; i++) if (slots[i] !== held[i]) { same = false; break; }
      if (!same) { const kit = encodeKit(composeLook(f.entity, { eotbSet: null }).items); f._mwWireSlots = slots.slice(); f._mwWireWorn = kit.lw; f._mwWireLooks = kit.la; f._mwWireKey = null; }
      worn = f._mwWireWorn; looks = f._mwWireLooks ?? null;
    }
  }
  if (f._mwWireKey == null || f._mwWireKeySeed !== seed || f._mwWireKeyWorn !== worn || f._mwWireKeyLooks !== looks) {
    f._mwWireKeySeed = seed; f._mwWireKeyWorn = worn; f._mwWireKeyLooks = looks;
    f._mwWireKey = `${seed}|${worn ? kitKey(worn, looks) : ''}`;
    f._mwWireKit = kitWire({ lw: worn ?? undefined, la: looks });
  }
  return { seed, worn, looks, kit: f._mwWireKit, key: f._mwWireKey };
}
/**
 * @param {any} f
 * @param {{ ls?: number, lw?: number[][], la?: number[][] }} r
 */
export function applyWireLook(f, r) {
  if (Number.isInteger(r.ls)) f._mwSeedWire = r.ls;
  if (Array.isArray(r.lw)) {
    const la = Array.isArray(r.la) ? r.la : null;
    const k = kitKey(r.lw, la);
    if (k !== f._mwWornWireKey) { f._mwWornWireKey = k; f._mwWornWireRaw = r.lw; f._mwWornWireLooks = la; f._mwWornWire = decodeWorn(r.lw, la); f._mwWornWireSlots = [f._mwWornWire]; }
  }
}

let _ids = 0;
export const foeId = (f) => f.seq ?? (f._mwId ??= ++_ids);

/**
 * @param {any} f
 */
export function foeActor(f, id = foeId(f), { scale = 1 } = {}) {
  if (f._hfAt != null && f._hfAt !== f._mwHitAt) { f._mwHitAt = f._hfAt; f._mwHits = ((f._mwHits | 0) + 1) & 0xffff; }
  const swings = (f._atkA | 0) >> 1;
  return {
    id,
    look: isPersonFoe(f) ? foeLook(f) : creatureLook(f),
    feet: f.dead ? (f.corpsePos ?? f.corpseMarker?.pos ?? f.ai.feet) : f.ai.feet,
    yaw: f.ai.yaw,
    scale: scale > 0 ? scale : 1,
    moving: !!f.ai.moving,
    running: !!f.ai.moving && f.ai.giveUpTimer > 0,
    drawn: true,
    swings,
    strike: 1 + (swings % 6),
    casts: f._castN | 0,
    castRange: 2,
    hits: f._mwHits | 0,
    dead: f.dead ? 1 + (mix(foeSeed(f) ^ 0xdead) % 5) : 0,
  };
}

/** @type {Set<number>} */
const STEEL_CLASSES = new Set([MOBILE_TYPES.Knight, MOBILE_TYPES.Warrior, MOBILE_TYPES.Spellsword, MOBILE_TYPES.Knight_CityWatch]);
const STEEL_PLATE = Object.freeze([['ChestArmor', 'Cuirass'], ['LegsArmor', 'Greaves'], ['Feet', 'Boots'], ['LeftArm', 'Left_Pauldron'], ['RightArm', 'Right_Pauldron'], ['Gloves', 'Gauntlets']]);

function rosterBlade(h, two = mix(h ^ 0xb1) & 1) {
  const lo = two ? WEAPONS_ENUM.Claymore : WEAPONS_ENUM.Broadsword, hi = two ? WEAPONS_ENUM['Battle Axe'] : WEAPONS_ENUM.Longsword;
  return { templateIndex: lo + (mix(h ^ 0xb2) % (hi + 1 - lo)), group: 'Weapons', equipSlot: EQUIP_SLOTS.RightHand, material: mix(h ^ 0xb3) & 1 };
}

const ORC_PIECES = Object.freeze([['Head', 'Helm'], ['RightArm', 'Right_Pauldron'], ['LeftArm', 'Left_Pauldron'], ['ChestArmor', 'Cuirass'], ['LegsArmor', 'Greaves'], ['Feet', 'Boots']]);
function orcMaterial(h) {
  const roll = 1 + (mix(h) % 100);
  return roll >= 90 ? (mix(h ^ 0x1e) & 1 ? ARMOR_MATERIAL.Steel : ARMOR_MATERIAL.Iron) : roll >= 70 ? ARMOR_MATERIAL.Chain : ARMOR_MATERIAL.Leather;
}
function orcKit(mobileType, h) {
  const variant = equipmentVariantFor(mobileType, false) ?? 0;
  const items = /** @type {any[]} */ ([rosterBlade(h, variant > 0 ? 1 : 0)]);
  const chance = variant === 0 ? 50 : variant === 1 ? 75 : 90;
  if (variant === 0 && mix(h ^ 0x5d) % 100 < 50) items.push({ templateIndex: ARMOR_ENUM.Buckler + (mix(h ^ 0x5e) % (ARMOR_ENUM.Round_Shield + 1 - ARMOR_ENUM.Buckler)), group: 'Armor', equipSlot: EQUIP_SLOTS.LeftHand, material: orcMaterial(h ^ 0x5f) });
  ORC_PIECES.forEach(([slot, piece], k) => { if (mix(h ^ (0xa0 + k)) % 100 < chance) items.push({ templateIndex: ARMOR_ENUM[piece], group: 'Armor', equipSlot: EQUIP_SLOTS[slot], material: orcMaterial(h ^ (0xe0 + k)) }); });
  return items;
}

/**
 * @param {any} rec
 * @param {{ mobileType: number, gender?: string, seed?: number, race?: string }} o
 */
export function rosterLook(rec, { mobileType, gender = 'male', seed = 0, race = undefined }) {
  if (rec._mwRosterMob === mobileType && rec._mwRosterG === gender && rec._mwRosterSeed === seed && rec._mwRosterRace === race) return rec._mwRosterLook;
  rec._mwRosterMob = mobileType; rec._mwRosterG = gender; rec._mwRosterSeed = seed; rec._mwRosterRace = race;
  const orc = ORC_MOBILES.has(mobileType);
  const vampire = VAMPIRE_MOBILES.has(mobileType);
  const wolf = mobileType === WOLF_MOBILE;
  const mod = _modPeople.get(mobileType);
  if (mod?.sprite) return (rec._mwRosterLook = null);
  if (!orc && !vampire && !wolf && !mod && !isClassEnemyId(mobileType)) return (rec._mwRosterLook = creatureLook({ mobileType }));
  const h = mix((seed >>> 0) ^ mix((mobileType | 0) + 0x9e3779b9));
  const bay = bayPerson(h);
  const g = gender === 'female' ? 'female' : 'male';
  const items = /** @type {any[]} */ (orc ? orcKit(mobileType, h) : vampire || wolf || (mod && !isClassEnemyId(mobileType)) ? [] : [rosterBlade(h)]);
  if (STEEL_CLASSES.has(mobileType)) {
    for (const [slot, piece] of STEEL_PLATE) items.push({ templateIndex: ARMOR_ENUM[piece], group: 'Armor', equipSlot: EQUIP_SLOTS[slot], material: ARMOR_MATERIAL.Steel });
    if (mobileType === MOBILE_TYPES.Knight_CityWatch) items.push({ templateIndex: ARMOR_ENUM.Helm, group: 'Armor', equipSlot: EQUIP_SLOTS.Head, material: ARMOR_MATERIAL.Steel });
  }
  return (rec._mwRosterLook = { race: orc ? 'Orc' : mod?.race ?? race ?? bay.race, gender: g, faceIndex: bay.faceIndex, items: clothesUnder(items, FOE_WARDROBE[g], h), npc: npcHint(h, 0), ...(vampire ? { vampire: true } : {}), ...(wolf ? { wolf: true } : {}) });
}

export function foeFx(f, batch = f?.batch) {
  if (!batch) return null;
  const glint = batch.glint && batch.glint[3] > 0 ? batch.glint : null;
  const elite = batch.eliteGlow || 0;
  const dissolve = batch.dissolve && batch.dissolve[0] > 0 ? batch.dissolve : null;
  const noShadow = batch.noShadow === true;
  if (!glint && !elite && !dissolve && !noShadow) return null;
  const fx = f._mwFx ?? (f._mwFx = { glint: null, elite: 0, time: 0, dissolve: null, noShadow: false });
  fx.glint = glint; fx.elite = elite; fx.time = batch.eliteTime || 0; fx.dissolve = dissolve; fx.noShadow = noShadow;
  return fx;
}

/**
 * @param {any} lane
 * @param {any[]} foes
 * @param {any[]} stood
 * @param {{ idOf: (f: any) => any, corpseFlat: (f: any) => any, renderer: any, canvas: any, proj: any, view: any, eye: number[] }} o
 */
export function drawBodiesUnderWindow(lane, foes, stood, { idOf, corpseFlat, renderer, canvas, proj, view, eye }) {
  for (const f of foes) { const b = corpseFlat(f); if (b) b.castOnly = false; }
  if (!lane || !(lane.offered > 0)) return false;
  for (const f of stood) { const b = f.dead ? corpseFlat(f) : null; if (b) b.castOnly = lane.has('foe', idOf(f)); }
  renderer.beginCharacterSpriteBatch?.();
  try { lane.draw(canvas, { proj, view, eye }); } finally { renderer.flushCharacterSpriteBatch?.(); }
  return true;
}
