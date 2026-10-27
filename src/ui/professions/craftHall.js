// @ts-check
// CRAFT-HALL (2026-10-26): what a crafter needs to see while working - a track's progress bar, which first-time bonuses
// are spent or still owed, and what raises each track. Pure functions over the professions book's state; profPages.js
// draws them. bible/06-Systems/Professions-Arc.md section 56.
import {
  PROFESSIONS, xpForRank, PROF_RANK_MAX, trackOf, topTierOf, harvestXp, HARVEST_XP_PER_TIER, smeltXp, herbXpTier, haulTier,
  WORK_RECIPES, workOpen,
} from '../../net/professionLaw.js';
import {
  RECIPES, recipeOpen, craftXp, cookXp, masonXp, firstMakesOf, firstMakesSpent, firstCraftKey, FIRST_MAKE_SHARE, CRAFT_XP_PER_TIER,
} from '../../net/recipeLaw.js';
import { POTIONS, brewXp, DISENCHANT_XP } from '../../net/alchemyLaw.js';
import { t, intlLocale } from '../../systems/textManager.js';

/** The track each station raises, keyed as profPages.js STATION_TILES. */
export const STATION_TRACKS = Object.freeze({
  forge: trackOf('smithing'), anvil: trackOf('smithing'), 'temper-anvil': trackOf('smithing'), jeweller: trackOf('jewelcrafting'),
  workbench: trackOf('carpentry'), mason: trackOf('masonry'), loom: trackOf('outfitting'), 'temper-loom': trackOf('outfitting'),
  fire: trackOf('cooking'), alchemy: trackOf('alchemy'), enchant: trackOf('enchanting'),
});
/** The five crafts, in the Professions page's order. */
export const CRAFT_TRACKS = Object.freeze(PROFESSIONS.filter((p) => p.kind === 'crafting').map((p) => p.id));

/** Whether the bar is full: at Master, or held at its rank by the crafter's limit (the service pays nothing past it). */
const barFull = (track, limit) => track.rank >= PROF_RANK_MAX || !!(limit?.by?.length && track.rank >= limit.rank);

/** A track's bar, `{ now, max }`, from its rank's floor to the next rank. */
export function trackBar(track, limit = null) {
  if (barFull(track, limit)) return { now: 1, max: 1 };
  const floor = xpForRank(track.rank), next = xpForRank(track.rank + 1);
  return { now: Math.max(0, track.xp - floor), max: Math.max(1, next - floor) };
}
/** "350 XP to rank 35", or '' when the bar is full. */
export function toNextWords(track, limit = null) {
  if (barFull(track, limit)) return '';
  return t('prof.hall.toNext', '{xp, number} XP to rank {rank}', { xp: Math.max(0, xpForRank(track.rank + 1) - track.xp), rank: track.rank + 1 });
}

/** A track's first-time bonuses: `{ all, spent, share }`. Null when the service has not said what was made; `all` 0 for
 *  Enchanting, which has none. */
export function firstStanding(made, track) {
  const keys = firstMakesOf(track);
  if (!keys.length) return { all: 0, spent: 0, share: 0 };
  const spent = firstMakesSpent(made, track);
  if (!spent) return null;
  return { all: keys.length, spent: spent.size, share: /** @type {Record<string, number>} */ (FIRST_MAKE_SHARE)[trackOf(track)] ?? 0 };
}
/** Whether a first-time bonus is still owed: true, false, or null when unknown or not this track's. */
export function firstOwed(made, key, track) {
  if (!key || !firstMakesOf(track).includes(key)) return null;
  const spent = firstMakesSpent(made, track);
  return spent ? !spent.has(key) : null;
}
export const recipeFirstOwed = (made, r) => (!r ? null : firstOwed(made, firstCraftKey(r), r.profession));
export const workFirstOwed = (made, w) => (!w?.xp ? null : firstOwed(made, w.id, w.xp));
export const brewFirstOwed = (made, potion) => (!potion ? null : firstOwed(made, potion.id, 'alchemy'));

const KIN_OF = new Map();
for (const r of RECIPES) KIN_OF.set(firstCraftKey(r), [...(KIN_OF.get(firstCraftKey(r)) ?? []), r]);
/**
 * The owed first-time bonuses the rank can make now, highest grade first: `{ key, name, tier, kinds }`, `kinds` being
 * the materials it can be made of at that grade. Empty when what was made is unknown.
 * @param {any} made @param {string} track @param {number} rank @param {any} [specs] @param {(key: string) => string} [nameOf]
 */
export function owedOpenFirsts(made, track, rank, specs = null, nameOf = (k) => k) {
  const spent = firstMakesSpent(made, track);
  if (!spent) return [];
  /** @type {{ key: string, name: string, tier: number, kinds: string[] }[]} */
  const out = [];
  for (const key of firstMakesOf(track)) {
    if (spent.has(key)) continue;
    const kin = KIN_OF.get(key) ?? [];
    if (kin.length) {
      const open = kin.filter((r) => recipeOpen(r, rank, specs));
      if (open.length) out.push({ key, name: open[0].pattern, tier: open[0].tier, kinds: [...new Set(open.map((r) => r.madeOf).filter(Boolean))] });
      continue;
    }
    const w = WORK_RECIPES.find((x) => x.id === key);
    if (w) { if (workOpen(w, rank)) out.push({ key, name: nameOf(w.out), tier: /** @type {any} */ (w).tier ?? 1, kinds: [] }); continue; }
    const potion = POTIONS.find((x) => x.id === key);
    if (potion && rank >= potion.rank) out.push({ key, name: potion.name, tier: potion.tier, kinds: [] });
  }
  return out.sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name));
}

/**
 * What raises a track at a rank, as `[act, figure]` rows. Every figure comes from the law the service pays by, at the
 * best grade the rank works. `pct` is the Firmament's bonus, which never applies to first-time bonuses.
 * @param {string} track @param {number} rank @param {{ pct?: number }} [opts]
 * @returns {Array<[string, string]>}
 */
export function xpSources(track, rank, { pct = 0 } = {}) {
  const id = trackOf(track), top = topTierOf(rank);
  const at = (/** @type {number} */ xp, /** @type {number} */ tier) => t('prof.hall.src.atGrade', '{xp, number} XP at grade {tier}', { xp, tier });
  const clean = (/** @type {number} */ xp, /** @type {number} */ more, /** @type {number} */ tier) => t('prof.hall.src.atGradeClean', '{xp, number} XP at grade {tier}, {more, number} for clean work', { xp, more, tier });
  const harvest = (/** @type {number} */ tier) => clean(harvestXp(tier, rank, false), harvestXp(tier, rank, true), tier);
  const share = /** @type {Record<string, number>} */ (FIRST_MAKE_SHARE)[id] ?? 0;
  const first = () => t('prof.hall.src.firstShare', '+{xp, number} XP, once each', { xp: share });
  // Court writs (writXp) and guild crafting writs (craftWritXp) both pay twice their pay; the test holds them equal
  const twice = () => t('prof.hall.src.writ', 'Twice its pay');
  const none = () => t('prof.hall.src.none', 'No XP');
  /** @type {Array<[string, string]>} */
  const rows = [];
  switch (id) {
    case 'mining':
      rows.push([t('prof.hall.src.vein', 'Mining a vein or boulder'), harvest(top)]);
      rows.push([t('prof.hall.src.courtOre', 'Court writ for ore, stone or gems'), twice()]);
      break;
    case 'logging':
      rows.push([t('prof.hall.src.tree', 'Felling a tree'), harvest(top)]);
      rows.push([t('prof.hall.src.courtWood', 'Court writ for wood'), twice()]);
      break;
    case 'herbalism':
      rows.push([t('prof.hall.src.herb', 'Picking herbs'), harvest(herbXpTier(rank))]);
      rows.push([t('prof.hall.src.courtHerb', 'Court writ for herbs'), twice()]);
      break;
    case 'hunting':
      rows.push([t('prof.hall.src.skin', 'Skinning a kill'), harvest(top)]);
      break;
    case 'fishing':
      rows.push([t('prof.hall.src.haul', 'Hauling a net'), harvest(haulTier(rank))]);
      break;
    case 'smithing':
      rows.push([t('prof.hall.src.anvil', 'A piece at the anvil or jeweler\'s bench'), at(craftXp(top, rank), top)]);
      rows.push([t('prof.hall.src.firstPiece', 'Your first piece at each grade'), first()]);
      rows.push([t('prof.hall.src.smelt', 'Smelting an ingot'), at(smeltXp(top, 1, rank), top)]);
      rows.push([t('prof.hall.src.temperAnvil', 'Tempering at the anvil'), t('prof.hall.src.temper', 'The piece\'s craft XP')]);
      rows.push([t('prof.hall.src.kitWrit', 'Guild writ for Repair Kits'), twice()]);
      break;
    case 'building':
      rows.push([t('prof.hall.src.bench', 'A piece at the workbench'), at(craftXp(top, rank), top)]);
      rows.push([t('prof.hall.src.mason', 'A cut or mix at the mason\'s bench'), t('prof.hall.src.masonXp', '{xp, number} XP each, {more, number} for clean work', { xp: masonXp(1, rank), more: masonXp(1, rank, { clean: true }) })]);
      rows.push([t('prof.hall.src.firstBuild', 'Your first piece at each grade, first cut and first mix'), first()]);
      rows.push([t('prof.hall.src.saw', 'Sawing planks'), none()]);
      break;
    case 'outfitting':
      rows.push([t('prof.hall.src.loom', 'A piece at the loom'), at(craftXp(top, rank), top)]);
      rows.push([t('prof.hall.src.firstCloth', 'Your first piece at each grade (not of cloth bought with silver)'), first()]);
      rows.push([t('prof.hall.src.temperLoom', 'Tempering at the loom'), t('prof.hall.src.temper', 'The piece\'s craft XP')]);
      rows.push([t('prof.hall.src.cure', 'Curing, weaving and spinning'), none()]);
      break;
    case 'provisioning': {
      const potion = [...POTIONS].filter((p) => rank >= p.rank).sort((a, b) => b.tier - a.tier)[0] ?? null;
      rows.push([t('prof.hall.src.dish', 'Cooking a dish'), t('prof.hall.src.dishXp', '{xp, number} XP, {more, number} with every pan on time', { xp: cookXp(rank), more: cookXp(rank, { clean: true }) })]);
      if (potion) rows.push([t('prof.hall.src.brew', 'Brewing a potion'), at(brewXp(potion, rank), potion.tier)]);
      rows.push([t('prof.hall.src.firstDish', 'Your first of each dish and potion'), first()]);
      rows.push([t('prof.hall.src.potionWrit', 'Guild writ for potions or dishes'), twice()]);
      break;
    }
    case 'enchanting':
      rows.push([t('prof.hall.src.disenchant', 'Disenchanting a crafted piece'), t('prof.hall.src.disenchantXp', '{per, number} XP per Essence per grade ({xp, number} at grade {tier})', { per: DISENCHANT_XP, xp: DISENCHANT_XP * top, tier: top })]);
      rows.push([t('prof.hall.src.noFirst', 'First-time bonuses'), t('prof.hall.src.noFirstXp', 'None')]);
      break;
    default:
      break;
  }
  if (pct > 0) rows.push([t('prof.hall.src.stars', 'Your Firmament stars'), t('prof.hall.src.starsPct', '+{pct}%, not on first-time bonuses', { pct })]);
  return rows;
}
/** The line under the acts: what a grade pays, and the quarter for work more than two grades down. '' for tracks whose
 *  work is always at the rank's own grade. */
export function gradeNote(track, rank) {
  const id = trackOf(track), top = topTierOf(rank);
  const per = PROFESSIONS.find((p) => p.id === id)?.kind === 'gathering' ? HARVEST_XP_PER_TIER : CRAFT_XP_PER_TIER;
  if (id === 'herbalism' || id === 'fishing' || id === 'enchanting') return '';
  return t('prof.hall.src.gradeNote', 'Each grade is worth {per, number} experience. Work more than two grades below your best (grade {top}) earns a quarter.', { per, top });
}
/** "First-time bonuses: 12 of 221 made (+500 XP each)"; Enchanting's "No first-time bonuses"; '' when unknown. */
export function firstsLine(standing) {
  if (!standing) return '';
  if (!standing.all) return t('prof.hall.firsts.none', 'No first-time bonuses');
  return t('prof.hall.firsts.line', 'First-time bonuses: {spent, number} of {all, number} made (+{share, number} XP each)', standing);
}
/** A card's mark: "First-time bonus" when owed, "Made before" when spent, '' when unknown. */
export const firstBadge = (owed) => (owed === true ? t('prof.hall.badge.owed', 'First-time bonus') : owed === false ? t('prof.hall.badge.made', 'Made before') : '');
/** Past this many materials (a jewel's grade has 41 gems) a name gives the count instead of the list. */
export const OWED_KINDS_MAX = 4;
/** "Longsword, grade 6 (Adamantium, Ebony, Orcish, or Warforged)" or "Amulet, grade 3 (any of 41 kinds)". */
export function owedName(f) {
  if (f.kinds.length > OWED_KINDS_MAX) return t('prof.hall.owed.many', '{name}, grade {tier} (any of {n, number} kinds)', { name: f.name, tier: f.tier, n: f.kinds.length });
  let kinds = f.kinds.join(', ');
  try { kinds = f.kinds.length ? new Intl.ListFormat(intlLocale(), { type: 'disjunction' }).format(f.kinds) : ''; } catch { /* the plain list */ }
  return kinds ? t('prof.hall.owed.kinds', '{name}, grade {tier} ({kinds})', { name: f.name, tier: f.tier, kinds }) : t('prof.hall.owed.name', '{name}, grade {tier}', { name: f.name, tier: f.tier });
}
