// @ts-check
// Whether an honest client could have minted an item, asked by the account service judge and by loot.js for peer
// items. A finding holds a trade, so a rule belongs here only when every honest producer keeps it.

import { validItemField, ITEM_FIELDS } from './itemFields.js';
import { ITEM_TEMPLATES, templateByIndex, itemBaseValue, isAmmunition } from './itemTemplates.js';
import { GROUP_TEMPLATE_INDICES } from './itemTemplatesData.js';
import { WAGON_KINDS, validWagonKind } from '../travel/wagonKinds.js';
import { TRANSPORT_SMALL_CART, TRANSPORT_HORSE } from './itemTemplates.js';
import {
  AFFIX_KINDS, AFFIX_RANGES, AFFIX_COUNTS, RARE_FLAVOURS, kindParams, validAffix, legendaryById, legendariesFor, isGarment,
  CLOTHING_GROUPS, validImprint, validCurse, validSocket, isCursed, affixesWorth, RARE_ENCHANT_WORTH, EXALTED_WORTH, rarityOf,
  GEM_GRADE_TEMPLATES,
} from './lootRarity.js';
import { ROLLED_TIERS } from './rarityTier.js';
import { validSetMarks, aethericById, AETHERIC_WORTH, REGALIA, RAID_SET_PIECES } from './aetheric.js';
import { validGildedMarks, GILDED_WORTH } from './gilded.js';
import { SIGIL_BANDS, sigilFloor, validSigil } from './sigil.js';
import { setPieceKind, setById, WORLD_SET_IDS } from './sigilSets.js';
import { BROKER_PRICES } from '../worldEvents/sigilBroker.js';
import { ENCHANTMENT_TYPES } from '../formats/magicDef.js';
import { enchantmentSettings, forcedEnchantments, hasItemMakerFlag, ITEM_MAKER_FLAGS, ENCHANTMENT_EXCLUSIONS, SOUL_COUNT } from '../magic/enchantmentCatalogue.js';
import { itemEnchantmentPower, craftedJewelRecipe, MAX_ENCHANTMENTS } from '../magic/enchanting.js';
import { isStackable, ARROW_TEMPLATE, GOLD_TEMPLATE, GLASS_BOTTLE_TEMPLATE, LETTER_OF_CREDIT_TEMPLATE } from './inventory.js';
import { setItemLaw, LOOT_STACK_MAX, ITEM_GROUP_NAME_BY_CLASS } from './loot.js';
import { CREATE_ITEM_ROWS, MENS_PLAIN_ROBES, WOMENS_PLAIN_ROBES } from './createItemRows.js';
import { cardById } from '../net/iliacCards.js';
import { PROVENANCE_RE, REPAIR_KIT_TEMPLATE, MASTERWORK } from '../net/recipeLaw.js';
import { isMasterWork, MASTER_LINES, MASTER_PROCS_MAX } from '../net/masterLaw.js';
import { ILIAC_CARD_TEMPLATE, CARD_BINDER_TEMPLATE, BINDER_DECKS_MAX } from '../cards/iliacItems.js';
import { POTENT } from '../net/alchemyLaw.js';
import { RRI_TEMPLATES } from '../mods/rriItems.js';
import { BANDAGE_TEMPLATE } from '../mods/rriRealism.js';
import { FORAGING_TEMPLATES } from '../professions/foragingLaw.js';
import { REST_ITEM_ROWS } from '../systems/survival/restItemRows.js';
import { DEEP_WATERS_FISH_TEMPLATES } from '../underwater/deepWatersFishRows.js';
// The account service loads none of the game. Templates whose homes pull in the UI come from leaf rows read beside
// the registry (LAW_ONLY), and the side-effect imports below register the rest headless.
import { WEIR_KEY_LAW_ROW } from '../systems/eliteGates/weirKeyRow.js';
import { SOUL_CAKE_LAW_ROW, HEARTH_OFFERING_LAW_ROW } from '../systems/festival/festivalRows.js';
import { STARGLASS_LAW_ROW } from '../systems/starfall/starglassRow.js';
import { LOCKPICK_LAW_ROW } from '../systems/lockpick/lockpickRow.js';
import { DEX_ENEMY_IDS } from '../mods/enemyExpansion/dexIds.js';
import '../professions/profTemplates.js';
import '../systems/survival/items.js';
import './crossbow.js';
import '../systems/heavyGear.js';
import '../systems/scrolls/spellScrolls.js';
import '../worldEvents/gateSpoils.js';
import './ayleidStones.js';
import './gems.js';
import './walletItem.js';
import '../systems/upkeep/upkeepItemRows.js';
import '../systems/livingWorld/keepsake.js';
import '../systems/legacy/heirloom.js';
import '../systems/naval/comeSailAwayItems.js';
import '../systems/naval/navalStores.js';
import '../systems/naval/tradeGoods.js';
import '../systems/naval/treasureCharts.js';

// A finding names the law version that made it. Bump this on any rule change, so older findings can be asked again.
export const ITEM_LAW_VERSION = 16;

const T = ENCHANTMENT_TYPES;
const TYPE_KEY = Object.freeze(Object.fromEntries(Object.entries(T).map(([k, v]) => [v, k])));
const LAW_ONLY = new Map(/** @type {any[]} */ ([...RRI_TEMPLATES, ...FORAGING_TEMPLATES, ...REST_ITEM_ROWS, ...DEEP_WATERS_FISH_TEMPLATES, WEIR_KEY_LAW_ROW, SOUL_CAKE_LAW_ROW, HEARTH_OFFERING_LAW_ROW, STARGLASS_LAW_ROW, LOCKPICK_LAW_ROW]).map((t) => [t.index, t]));
export const lawTemplate = (/** @type {unknown} */ i) => (Number.isInteger(i) ? templateByIndex(i) ?? LAW_ONLY.get(/** @type {number} */ (i)) ?? null : null);

const CLASSIC_GROUPS = (() => {
  /** @type {Map<number, string[]>} */
  const m = new Map();
  for (const [g, list] of Object.entries(GROUP_TEMPLATE_INDICES)) for (const i of list) m.set(i, [...(m.get(i) ?? []), g]);
  return m;
})();
export const CUSTOM_TEMPLATE_GROUPS = Object.freeze({
  Weapons: Object.freeze([513, 514, 563, 564, 565]),
  Armor: Object.freeze([515, 516, 517, 518, 519, 520, 521, 522, 523, 524, 525, 526]),
  Gems: Object.freeze([570, 571, ...GEM_GRADE_TEMPLATES]),
  Jewellery: Object.freeze([]),
  Furniture: Object.freeze([696, 697, 698, 699]),
});
const CUSTOM_GROUP_OF = new Map(Object.entries(CUSTOM_TEMPLATE_GROUPS).flatMap(([g, list]) => list.map((i) => /** @type {[number, string]} */ ([i, g]))));
export function templateGroups(/** @type {number} */ i) {
  if (i < ITEM_TEMPLATES.length) return CLASSIC_GROUPS.get(i) ?? [];
  return [CUSTOM_GROUP_OF.get(i) ?? 'UselessItems2'];
}

const ARMOR_MATERIALS = Object.freeze([0x0000, 0x0100, 0x0103, 0x0200, 0x0201, 0x0202, 0x0203, 0x0204, 0x0205, 0x0206, 0x0207, 0x0208, 0x0209]);
// Matches poisons.js POISON_START_VALUE and its eight poisons, which the account Worker does not bundle.
const LAW_POISON_FIRST = 128, LAW_POISON_LAST = 135;
const soulLawful = (/** @type {unknown} */ v) => isInt(v) && ((/** @type {number} */ (v) >= 0 && /** @type {number} */ (v) < SOUL_COUNT) || (/** @type {number} */ (v) >= HUMAN_SOUL_FIRST && /** @type {number} */ (v) <= HUMAN_SOUL_LAST) || MOD_SOULS.has(/** @type {number} */ (v)));
const MOD_SOULS = new Set(DEX_ENEMY_IDS);
const HUMAN_SOUL_FIRST = 128, HUMAN_SOUL_LAST = 146;
const SOUL_TRAP_TEMPLATE = 274, AZURAS_STAR = 9;
const SUMMONED = new Set(CREATE_ITEM_ROWS.flatMap((/** @type {any} */ r) => (r.kind === 'robes'
  ? [`MensClothing:${MENS_PLAIN_ROBES}`, `WomensClothing:${WOMENS_PLAIN_ROBES}`]
  : [`${r.kind === 'armor' ? 'Armor' : 'Weapons'}:${r.templateIndex}`])));
const POTENT_SHARES = Object.freeze([POTENT.pct, POTENT.masterPct]);
const SKELETON_KEY_TEXTURE = Object.freeze({ archive: 432, record: 20 });
const ARTIFACT_BITFIELD_MAX = 45;
export { PROVENANCE_RE };
export const ITEM_UID_RE = /^[0-9a-f]{16}$/;
const BROKER_STONES = new Set(Object.values(BROKER_PRICES));

const BANDAGE = Object.freeze({ group: 'UselessItems2', templateIndex: BANDAGE_TEMPLATE });
const stacks = (/** @type {any} */ item, /** @type {any} */ row) => isStackable({ ...item, equipSlot: undefined, questItem: undefined }) || row?.isIngredient === true || row?.stackable === true
  || (item.group === BANDAGE.group && item.templateIndex === BANDAGE.templateIndex);
export const GOLD_INT_MAX = 2_147_483_647;
export const CLASSIC_VALUE_MAX = 4_294_967_295;
const stackMax = (/** @type {any} */ item) => (item.group === 'Currency' && item.templateIndex === GOLD_TEMPLATE ? GOLD_INT_MAX : LOOT_STACK_MAX);
const isInt = (/** @type {unknown} */ v) => Number.isInteger(v);
const has = (/** @type {any} */ o, /** @type {string} */ k) => o[k] !== undefined && o[k] !== null;
const copyOf = (/** @type {any} */ v) => JSON.parse(JSON.stringify(v));

/** @param {unknown} v @param {{ receiver?: boolean }} [opts] @returns {string[]} */
export function itemFindings(v, opts = {}) {
  /** @type {Set<string>} */
  const out = new Set();
  if (!v || typeof v !== 'object' || Array.isArray(v)) return ['shape'];
  const item = /** @type {any} */ (v);
  for (const k of Object.keys(item)) {
    if (!Object.hasOwn(ITEM_FIELDS, k) || item[k] == null) continue;
    if (validItemField(k, item[k]) === undefined) out.add('shape');
  }
  if (!isInt(item.templateIndex)) return ['template'];
  const t = lawTemplate(item.templateIndex);
  if (!t) return ['template'];
  if (typeof item.group !== 'string' || !templateGroups(item.templateIndex).includes(item.group)) out.add('group');
  if (has(item, 'material')) {
    if (item.group === 'Weapons' && !(isInt(item.material) && item.material >= 0 && item.material <= 9)) out.add('material');
    if (item.group === 'Armor' && !ARMOR_MATERIALS.includes(item.material)) out.add('material');
  }
  if (has(item, 'currentCondition') && has(item, 'maxCondition') && item.currentCondition > item.maxCondition) out.add('condition');
  if (has(item, 'stackCount') && item.stackCount > 1) {
    if (item.stackCount > stackMax(item) || !stacks(item, t)) out.add('stack');
  }
  if (item.value !== undefined && !(typeof item.value === 'number' && Number.isFinite(item.value) && item.value >= 0 && item.value <= Number.MAX_SAFE_INTEGER)) out.add('value');
  const classic = has(item, 'typeDependentData');
  if (has(item, 'flags') && item.flags !== 0 && !classic) out.add('flags');
  if (item.templateIndex === LETTER_OF_CREDIT_TEMPLATE && typeof item.value === 'number' && item.value > (classic ? CLASSIC_VALUE_MAX : GOLD_INT_MAX)) out.add('value');
  if (has(item, 'timeForItemToDisappear') && item.timeForItemToDisappear > 0 && !SUMMONED.has(`${item.group}:${item.templateIndex}`)) out.add('summoned');
  if (has(item, 'poisonType') && item.poisonType !== -1 && !(item.group === 'Weapons' && item.poisonType >= LAW_POISON_FIRST && item.poisonType <= LAW_POISON_LAST)) out.add('poison');
  if (has(item, 'trappedSoulType') && item.trappedSoulType !== -1
    && !((item.templateIndex === SOUL_TRAP_TEMPLATE || (item.artifact === true && isInt(item.artifactIndexBitfield) && item.artifactIndexBitfield >> 1 === AZURAS_STAR)) && soulLawful(item.trappedSoulType))) out.add('soul');
  if (has(item, 'artifactIndexBitfield')) {
    const b = item.artifactIndexBitfield;
    if (item.artifact !== true || !isInt(b) || b < 1 || b > ARTIFACT_BITFIELD_MAX || (b & 1) !== 1) out.add('artifact');
  }
  if (item.worldTextureArchive === SKELETON_KEY_TEXTURE.archive && item.worldTextureRecord === SKELETON_KEY_TEXTURE.record && item.artifact !== true) out.add('artifact');
  if (has(item, 'provenance') && !PROVENANCE_RE.test(item.provenance)) out.add('provenance');
  if (has(item, 'uid') && !ITEM_UID_RE.test(item.uid)) out.add('uid');
  if (has(item, 'quality') && !has(item, 'provenance') && !(item.quality >= 2 && item.quality <= 4)) out.add('crafted');
  if ((has(item, 'kitMetal') || item.fieldKit === true) && item.templateIndex !== REPAIR_KIT_TEMPLATE) out.add('crafted');
  if (has(item, 'hand') && !(item.group === 'Jewellery' && has(item, 'provenance'))) out.add('crafted');
  if (has(item, 'potent') && !(item.templateIndex === GLASS_BOTTLE_TEMPLATE && POTENT_SHARES.includes(item.potent))) out.add('crafted');
  if (has(item, 'card') && !(item.templateIndex === ILIAC_CARD_TEMPLATE && cardById(item.card))) out.add('card');
  if (has(item, 'decks') && !(item.templateIndex === CARD_BINDER_TEMPLATE && Array.isArray(item.decks) && item.decks.length <= BINDER_DECKS_MAX
    && item.decks.every((/** @type {any} */ d) => Array.isArray(d?.cards) && d.cards.every((/** @type {string} */ c) => cardById(c))))) out.add('card');
  if ((has(item, 'wagonKind') || has(item, 'wagonLook') || has(item, 'wagonEntry')) && item.templateIndex !== TRANSPORT_SMALL_CART) out.add('wagon');
  if (has(item, 'wagonKind') && item.wagonKind !== 'cart' && !(item.value >= (WAGON_KINDS[item.wagonKind]?.floor ?? Infinity))) out.add('wagon');
  if (['horseCoat', 'horsePattern', 'horseLegs', 'horseSeed', 'horseBond', 'horseFed'].some((k) => has(item, k)) && item.templateIndex !== TRANSPORT_HORSE) out.add('horse');
  if (has(item, 'stonesPaid') && !(item.bound === true && BROKER_STONES.has(item.stonesPaid))) out.add('bound');
  for (const f of tierFindings(item)) out.add(f);
  for (const f of sigilFindings(item)) out.add(f);
  for (const f of enchantmentFindings(item)) out.add(f);
  if (!opts.receiver && has(item, 'equipSlot') && item.stackCount > 1) out.add('stack');
  return [...out].sort();
}

export const lawfulItem = (/** @type {unknown} */ v, /** @type {{ receiver?: boolean }} */ opts = {}) => itemFindings(v, opts).length === 0;

const isGemLine = (/** @type {any} */ a) => a?.gem != null;
const TIER_GROUPS = Object.freeze(['Weapons', 'Armor', 'Jewellery', ...CLOTHING_GROUPS]);
const TIER_MARKS = Object.freeze(['legendary', 'exalted', 'reforged', 'reforges', 'honed', 'imprint', 'socket', 'sockets', 'cursed']);

function tierFindings(/** @type {any} */ item) {
  /** @type {string[]} */
  const out = [];
  const tier = item.rarity;
  const lines = Array.isArray(item.affixes) ? item.affixes : [];
  if (tier === 'aetheric') return aethericFindings(item);
  if (tier === 'gilded' || has(item, 'gilded')) return validGildedMarks(copyOf(item)) ? [] : ['gilded'];
  if (has(item, 'aetheric')) return ['aetheric'];
  if (tier == null) {
    if (lines.length || TIER_MARKS.some((k) => has(item, k))) out.push('rarity');
    return out;
  }
  if (!ROLLED_TIERS.includes(tier)) return ['rarity'];
  if (!TIER_GROUPS.includes(item.group) || item.artifact === true || item.magic === true || item.questItem === true) return ['rarity'];
  if (item.group === 'Weapons' && isAmmunition(item) && tier !== 'magic') return ['rarity'];
  const own = lines.filter((a) => !isGemLine(a));
  const gems = lines.filter(isGemLine);
  if (gems.length && !isGemLine(lines[lines.length - 1])) out.push('affixes');
  for (const a of own) {
    if (!validAffix(a) || !AFFIX_KINDS[a.id].groups.includes(item.group)) { out.push('affixes'); continue; }
    const params = kindParams(a.id, item);
    if (params && !params.includes(a.param)) out.push('affixes');
  }
  const seen = new Set(own.map((a) => (AFFIX_KINDS[a?.id]?.params ? `${a.id}:${a.param}` : a?.id)));
  if (seen.size !== own.length) out.push('affixes');
  const techs = own.filter((a) => AFFIX_KINDS[a?.id]?.technique);
  if (techs.length > 1 || (techs.length === 1 && own[own.length - 1] !== techs[0])) out.push('affixes');
  const body = own.filter((a) => !AFFIX_KINDS[a?.id]?.technique);
  if (!validCurse(item)) out.push('curse');
  if (!validSocket(item)) out.push('socket');
  if (!validImprint(item)) out.push('imprint');
  if ((has(item, 'socket') || has(item, 'sockets')) && (has(item, 'provenance') || item.bound === true)) out.push('socket');
  const procs = body.filter((a) => AFFIX_KINDS[a?.id]?.proc);
  const numbers = body.filter((a) => !AFFIX_KINDS[a?.id]?.proc);
  if (tier === 'magic' || tier === 'rare') {
    const [lo, hi] = AFFIX_COUNTS[tier];
    // A curse line stays when the temple lifts the curse, so a Rare may carry one line past its count.
    const extra = tier === 'rare' ? 1 : 0;
    if (numbers.length < lo || numbers.length > hi + extra || procs.length > 1) out.push('affixes');
    for (const a of own) {
      const band = AFFIX_RANGES[a?.id]?.[tier];
      if (band && !(a.value >= band[0] && a.value <= band[1])) out.push('affixes');
    }
    if (has(item, 'legendary') || item.exalted === true) out.push('rarity');
    if (has(item, 'reforged') && !(item.reforged < own.length)) out.push('reforged');
    if (tier === 'rare') {
      const flavour = firstOwnRow(item);
      const flavours = RARE_FLAVOURS[item.group] ?? RARE_FLAVOURS.Jewellery;
      if (!flavour || !flavours.some((f) => f.type === flavour.type && f.param === flavour.param)) out.push('enchantments');
    }
    return out;
  }
  if (isMasterWork(item)) return [...out, ...masterFindings(item, body, procs, techs, gems)];
  const rec = legendaryById(item.legendary);
  if (!rec || !legendariesFor(item).some((l) => l.id === rec.id)) return [...out, 'legendary'];
  const sig = rec.affixes;
  if (body.length < sig.length) return [...out, 'legendary'];
  for (const a of techs) {
    const band = AFFIX_RANGES.technique.legendary;
    if (!(a.value >= band[0] && a.value <= band[1])) out.push('affixes');
  }
  for (let i = 0; i < sig.length; i++) {
    const a = body[i], w = sig[i];
    if (a?.id !== w.id || (a.param ?? null) !== (w.param ?? null) || !(a.value >= 1 && a.value <= w.value)) out.push('legendary');
  }
  const extra = body.slice(sig.length);
  if (extra.length > 1) out.push('affixes');
  if (extra.length === 1) {
    const a = extra[0];
    const band = AFFIX_RANGES[a?.id]?.legendary;
    const top = band ? Math.ceil((band[0] + band[1]) / 2) : Infinity;
    const onRecord = sig.some((w) => w.id === a?.id && (w.param ?? null) === (a?.param ?? null));
    if (!band || a.value < top || a.value > band[1] || onRecord) out.push('affixes');
    if (item.exalted !== true && AFFIX_KINDS[a?.id]?.proc) out.push(isCursed(item) ? 'curse' : 'affixes');
  } else if (item.exalted === true || isCursed(item)) out.push('affixes');
  if (item.exalted === true && isCursed(item)) out.push('curse');
  if (has(item, 'reforged') && !(item.exalted === true && item.reforged === sig.length)) out.push('reforged');
  if (has(item, 'reforges') && item.exalted !== true) out.push('reforged');
  if (has(item, 'honed') && item.exalted !== true) out.push('honed');
  const first = firstOwnRow(item);
  if (!first || first.type !== rec.enchantment?.type || first.param !== rec.enchantment?.param) out.push('enchantments');
  return out;
}

/** @param {any} item @param {any[]} body @param {any[]} procs @param {any[]} techs @param {any[]} gems */
function masterFindings(item, body, procs, techs, gems) {
  /** @type {string[]} */
  const out = [];
  if (item.quality !== MASTERWORK || body.length !== MASTER_LINES || procs.length > MASTER_PROCS_MAX || techs.length || gems.length) out.push('legendary');
  for (const a of body) {
    const band = AFFIX_RANGES[a?.id]?.legendary;
    if (!band || !(a.value >= band[0] && a.value <= band[1])) out.push('affixes');
  }
  if (item.exalted === true || isCursed(item) || has(item, 'reforged') || has(item, 'reforges') || has(item, 'honed')) out.push('legendary');
  if (Array.isArray(item.enchantments) && item.enchantments.length) out.push('enchantments');
  return out;
}

const firstOwnRow = (/** @type {any} */ item) => (Array.isArray(item.enchantments) ? item.enchantments : []).find((e) => !isMakerRow(e)) ?? null;

// Frozen: only the Aetheric records the item maker took before it refused them keep the rows laid on them then.
const MAKER_ERA_AETHERIC = new Set([...REGALIA, ...RAID_SET_PIECES].map((r) => r.id));
function aethericFindings(/** @type {any} */ item) {
  if (!validSetMarks(copyOf(item))) return ['aetheric'];
  const rows = Array.isArray(item.enchantments) ? item.enchantments : [];
  const kept = MAKER_ERA_AETHERIC.has(item.aetheric) && rows.every(isMakerRow);
  if (TIER_MARKS.some((k) => has(item, k)) || (rows.length && !kept)) return ['aetheric'];
  return [];
}

function sigilFindings(/** @type {any} */ item) {
  const s = item.sigil;
  if (s == null) return [];
  if (!validSigil(s)) return ['sigil'];
  if (item.rarity === 'aetheric') return [];
  const kind = setPieceKind(item);
  if (!kind || item.artifact === true || item.questItem === true || item.rarity === 'gilded' || has(item, 'provenance')) return ['sigil'];
  const tier = rarityOf(item);
  const band = SIGIL_BANDS[tier];
  if (!band) return ['sigil'];
  if (s.power !== undefined && (kind !== 'weapon' || s.power < sigilFloor(tier, s.party) || s.power > band[1])) return ['sigil'];
  if (s.set !== undefined && (!WORLD_SET_IDS.includes(s.set) || setById(s.set)?.aetheric)) return ['sigil'];
  return [];
}

const isMakerRow = (/** @type {any} */ e) => e != null && typeof e === 'object' && e.enchantCost !== undefined;
const MAKER_GROUPS = Object.freeze(['Weapons', 'Armor', 'Gems', 'Jewellery', ...CLOTHING_GROUPS]);
const classicSlots = (/** @type {any[]} */ rows) => rows.length === 10 && rows.some((e) => e?.type === T.None);

// The local MAGIC.DEF may differ from the fixed Daggerfall Unity table in row params, never in row kinds or counts.
// So the law checks kinds and counts and leaves params to the catalog range.
export const REGULAR_MAGIC_TYPES = Object.freeze([T.CastWhenUsed, T.CastWhenHeld, T.CastWhenStrikes, T.VampiricEffect, T.AbsorbsSpells, T.EnhancesSkill]);
export const ARTIFACT_RECORDS = Object.freeze([
  [25, 2, [T.SpecialArtifactEffect]], [3, 0, [T.SpecialArtifactEffect]], [3, 11, [T.SpecialArtifactEffect]], [25, 2, [T.SpecialArtifactEffect]],
  [15, 11, [T.SpecialArtifactEffect]], [7, 0, [T.SpecialArtifactEffect]], [3, 2, [T.SpecialArtifactEffect]], [25, 2, [T.SpecialArtifactEffect]],
  [25, 0, [T.SpecialArtifactEffect]], [25, 0, [T.SpecialArtifactEffect]],
  [3, 13, [T.CastWhenStrikes, T.CastWhenStrikes]],
  [25, 2, [T.CastWhenHeld, T.CastWhenUsed, T.CastWhenUsed]],
  [3, 17, [T.CastWhenStrikes, T.CastWhenStrikes, T.CastWhenStrikes]],
  [25, 0, [T.CastWhenHeld, T.CastWhenUsed, T.AbsorbsSpells]],
  [3, 9, [T.CastWhenUsed, T.CastWhenUsed, T.CastWhenUsed, T.EnhancesSkill]],
  [2, 0, [T.RegensHealth, T.CastWhenUsed, T.CastWhenUsed]],
  [3, 2, [T.CastWhenHeld, T.RegensHealth]],
  [25, 2, [T.CastWhenUsed, T.CastWhenHeld]],
  [2, 0, [T.StrengthensArmor, T.CastWhenUsed, T.CastWhenUsed, T.CastWhenUsed]],
  [2, 10, [T.CastWhenUsed, T.CastWhenHeld, T.CastWhenUsed, T.StrengthensArmor]],
  [2, 10, [T.CastWhenHeld, T.CastWhenUsed]],
  [25, 5, [T.CastWhenUsed, T.EnhancesSkill]],
  [3, 8, [T.CastWhenStrikes, T.CastWhenStrikes, T.CastWhenUsed, T.EnhancesSkill]],
].map((/** @type {any} */ [group, index, types]) => Object.freeze({ group: /** @type {number} */ (group), index: /** @type {number} */ (index), types: /** @type {number[]} */ (types) })));
const withinKinds = (/** @type {any[]} */ rows, /** @type {number[]} */ types) => {
  const left = [...types];
  for (const e of rows) {
    if (e.type === T.None) continue;
    const i = left.indexOf(e.type);
    if (i < 0) return false;
    left.splice(i, 1);
  }
  return true;
};
function regularMagicFindings(/** @type {any[]} */ found) {
  const live = found.filter((e) => e.type !== T.None);
  return live.length === 1 && REGULAR_MAGIC_TYPES.includes(live[0].type) ? [] : ['enchantments'];
}
function artifactFindings(/** @type {any} */ item, /** @type {any[]} */ found) {
  const b = item.artifactIndexBitfield;
  const rec = isInt(b) && (b & 1) === 1 ? ARTIFACT_RECORDS[b >> 1] : null;
  if (!rec) return ['artifact'];
  if (item.templateIndex !== GROUP_TEMPLATE_INDICES[ITEM_GROUP_NAME_BY_CLASS[rec.group]]?.[rec.index]) return ['artifact'];
  return withinKinds(found, rec.types) ? [] : ['artifact'];
}

export const classicPiece = (/** @type {any} */ item) => !!item && typeof item === 'object' && item.artifact !== true && item.magic !== true
  && Array.isArray(item.enchantments) && classicSlots(item.enchantments);

function enchantmentFindings(/** @type {any} */ item) {
  /** @type {string[]} */
  const out = [];
  if (Array.isArray(item.customEnchantments) && item.customEnchantments.length) out.push('enchantments');
  const rows = Array.isArray(item.enchantments) ? item.enchantments : [];
  if (!rows.length) return item.artifact === true ? [...out, 'artifact'] : item.magic === true ? [...out, 'enchantments'] : out;
  if (rows.length > MAX_ENCHANTMENTS + 1) return [...out, 'enchantments'];
  for (const e of rows) {
    if (!e || typeof e !== 'object') return [...out, 'enchantments'];
    if (!(e.type >= T.None && e.type <= T.SpecialArtifactEffect) || !(e.param >= -128 && e.param <= 127)) return [...out, 'enchantments'];
    if (e.type === T.SpecialArtifactEffect && item.artifact !== true) return [...out, 'artifact'];
  }
  const maker = rows.filter(isMakerRow);
  const found = rows.filter((e) => !isMakerRow(e));
  if (item.artifact === true) out.push(...artifactFindings(item, found));
  else if (item.magic === true) out.push(...regularMagicFindings(found));
  else if (!classicSlots(rows)) {
    const tier = item.rarity;
    const expected = (tier === 'rare' || tier === 'legendary' ? 1 : 0) + (isCursed(item) ? 1 : 0);
    if (found.length > expected) out.push('enchantments');
  }
  if (maker.length) out.push(...makerFindings(item, rows, maker));
  return out;
}

function makerFindings(/** @type {any} */ item, /** @type {any[]} */ rows, /** @type {any[]} */ maker) {
  if (!MAKER_GROUPS.includes(item.group) || (item.group === 'Weapons' && item.templateIndex === ARROW_TEMPLATE)) return ['enchantments'];
  if (item.rarity === 'gilded' || (item.rarity === 'aetheric' && !MAKER_ERA_AETHERIC.has(item.aetheric))) return ['enchantments'];
  /** @type {any[]} */
  const chosen = [];
  /** @type {Map<string, any[]>} */
  const forcedBy = new Map();
  for (const e of maker) {
    const key = TYPE_KEY[e.type];
    const parent = typeof e.parentEnchantment === 'string' ? e.parentEnchantment : 0;
    const row = key ? enchantmentSettings(key, e.param, { parent }) : null;
    if (!row) return ['enchantments'];
    if (parent) forcedBy.set(parent, [...(forcedBy.get(parent) ?? []), { key, param: e.param }]);
    else chosen.push({ key, param: e.param, cost: row.enchantCost });
  }
  for (const [parent, got] of forcedBy) {
    const m = /^SoulBound:(-?\d+)$/.exec(parent);
    if (!m) return ['enchantments'];
    const p = Number(m[1]);
    if (!chosen.some((c) => c.key === 'SoulBound' && c.param === p)) return ['enchantments'];
    const want = forcedEnchantments('SoulBound', p);
    const all = want ? [...want.powers, ...want.sideEffects].map((w) => `${w.type}:${w.param}`).sort() : [];
    if (all.join('|') !== got.map((g) => `${g.key}:${g.param}`).sort().join('|')) return ['enchantments'];
  }
  // Counting by kind is deliberate: a piece made before the side effect was limited to one pick keeps its copies.
  const counts = new Map();
  for (const c of chosen) {
    if (hasItemMakerFlag(c.key, ITEM_MAKER_FLAGS.WeaponOnly) && item.group !== 'Weapons') return ['enchantments'];
    const many = hasItemMakerFlag(c.key, ITEM_MAKER_FLAGS.AllowMultiplePrimaryInstances) || hasItemMakerFlag(c.key, ITEM_MAKER_FLAGS.AllowMultipleSecondaryInstances);
    counts.set(c.key, (counts.get(c.key) ?? 0) + 1);
    if (counts.get(c.key) > 1 && !many) return ['enchantments'];
    const ex = /** @type {any} */ (ENCHANTMENT_EXCLUSIONS)[c.key];
    if (ex?.pairs?.some((/** @type {string} */ o) => chosen.some((d) => d.key === o))) return ['enchantments'];
    if (ex?.sameParam?.some((/** @type {string} */ o) => chosen.some((d) => d.key === o && d.param === c.param))) return ['enchantments'];
  }
  const kept = craftedJewelRecipe(item) ? rows.filter((e) => !isMakerRow(e)) : [];
  let cost = chosen.reduce((s, c) => s + c.cost, 0);
  for (const e of kept) {
    const key = TYPE_KEY[e.type];
    const row = key ? enchantmentSettings(key, e.param) : null;
    if (!row) return ['enchantments'];
    cost += row.enchantCost;
  }
  if (cost > itemEnchantmentPower(item, lawTemplate)) return ['enchantments'];
  return [];
}

export const WORTH_MARGIN = 10_000;
const wagonPriceOf = (/** @type {any} */ item) => (item.templateIndex === TRANSPORT_SMALL_CART && validWagonKind(item.wagonKind) ? WAGON_KINDS[item.wagonKind].value : 0);
export function worthCeiling(/** @type {any} */ item) {
  if (!item || typeof item !== 'object' || !lawTemplate(item.templateIndex)) return 0;
  const base = Math.max(itemBaseValue(item, lawTemplate), wagonPriceOf(item)) * 4;
  const lines = affixesWorth(Array.isArray(item.affixes) ? item.affixes.filter(validAffix) : [], item);
  const legacy = item.magic === true || item.artifact === true ? WORTH_MARGIN * 10 : 0;
  return base + lines + RARE_ENCHANT_WORTH + EXALTED_WORTH + (aethericById(item.aetheric) ? AETHERIC_WORTH : 0) + (has(item, 'gilded') ? GILDED_WORTH : 0) + WORTH_MARGIN + legacy;
}
export function itemWorth(/** @type {any} */ item) {
  if (!item || typeof item !== 'object' || !lawTemplate(item.templateIndex)) return 0;
  const value = typeof item.value === 'number' && Number.isFinite(item.value) && item.value > 0 ? item.value : 0;
  const stack = isInt(item.stackCount) && item.stackCount > 1 ? item.stackCount : 1;
  const floor = itemBaseValue(item, lawTemplate) + affixesWorth(Array.isArray(item.affixes) ? item.affixes.filter(validAffix) : [], item);
  return Math.max(Math.min(value, worthCeiling(item)), floor) * stack;
}

// The law registers itself with loot.js, so loot.js needs no import of this module and no import cycle forms.
setItemLaw(itemFindings, worthCeiling);
