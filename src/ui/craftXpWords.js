// CRAFT-FIRST-SHOWN (FIELD BUGS 2026-10-15f; the Discord, 2026-10-13: "The first time craft bonus is not applying to
// the outfitting. I got somehow it once from...Fishing net? Then never after"): WHAT A CRAFT PAYS, SAID WHERE IT IS
// EARNED. AUDIT 32 S1 (net/recipeLaw.js firstCraftPays) withholds the first-make's XP (then 500) from a pattern
// made wholly of goods only a counter sells - the Weavers' Linen and Wool: 152 of the loom's patterns, the Fishing-Net
// among them - and the owner keeps it. Nothing in the game said so: the anvil, the workbench, the loom and the mason's
// bench showed no XP, the jeweller's and the fire's showed theirs without the first, and the craft's word left the
// answer's `first` unread. These are the words both say it with: the station pages' boxes (ui/professions/profPages.js) and the
// craft's word (scenes/world.js's `craft`, one call).
//
// CRAFT-HALL (2026-10-26): the client now knows what was made (profState's `made`), so the lines below take `owed`:
// true says the bonus is still to earn, false that it is spent, null (an older service) says the rule as before.
//
// CLOTH-GEMS (2026-10-25; the player SaberGGaming's "Profession oversights", the owner: "No band aids"): S1 JUDGES THE
// UNITS. The loom weaves Linen and spins Wool of the world's goods now (net/professionLaw.js WEAVE_RECIPES, SPIN_RECIPES),
// and a piece made wholly of cloth pays its first where its cloth is the character's own (recipeLaw firstCraftPays's
// `own`); the Weavers' - bought - never does. So a box says which way its units stand, and the craft's word says what
// the service decided (its answer's `firstPaid`). bible/06-Systems/Professions-Arc.md 50.
//
// WOVEN-PAYS (FIELD BUGS 2026-10-26b; fogs, #feature-feedback: "First time XP bonus from the Loom still isn't working";
// the owner: "Woven cloth pays"): THE WALL IS SILVER. fogs wove Linen of Root Tendrils the service never counted (looted,
// or bought at a shop): loose cloth, which S1 withheld from. The box read the Stores and the carried count, saw none of
// the bolts the loom had carried out to the bag, and promised the 511; the craft put one back in loose and paid none,
// and its word said "only cloth you wove or spun yourself", of cloth fogs had woven. Now a cloth piece's first pays
// unless a bolt it uses counts as bought with silver - AUDIT WOVEN-PAYS: by the cloth's SILVER COUNT, the bolts bought
// with silver (the Weavers', the furnisher's, the Drakes market's) that the character's stations have not used since,
// whatever the units' origins (recipeLaw firstCraftPays). The box reads that count (`silver`: profPages.js silverOf),
// and every line names the wall as silver.
//
// FIRST-BUDGET (SaberGGaming's report, 2026-10-25: Provisioning is slow; the owner, asked: "Match Smithing's pace"): A
// FIRST-MAKE'S XP IS ITS TRACK'S SHARE (net/recipeLaw.js FIRST_MAKE_SHARE - firstCraftXp, workFirstXp), no longer a flat
// 500 every track: Smithing's 500, Outfitting's 511, Building's 1,823, Provisioning's 3,155 - each the least that brings
// its track to Master in Smithing's crafts - and every line below says the recipe's own. The share says how much a first
// pays, CLOTH-GEMS whether. bible/06-Systems/Professions-Arc.md 52.
import { t } from '../systems/textManager.js';
import { craftXp, firstCraftPays, counterMade, firstCraftXp, workFirstXp, masonXp } from '../net/recipeLaw.js';
import { creditedXp, MASON_RECIPES } from '../net/professionLaw.js';   // FIRST-BUDGET: the bench's two works, each its first's share
import { scaleXp } from '../net/firmament/firmamentLaw.js';
import { focusXp, FOCUS_HALF_RANK } from '../net/craft/craftLaw.js';

/** @typedef {{ limit?: { cap: number, room: number }|null, pct?: number, focus?: boolean, rank?: number }} CraftPay */

const onFocus = (/** @type {number} */ xp, /** @type {CraftPay} */ pay) => focusXp(xp, pay?.focus ?? true, pay?.rank ?? 0);

/**
 * The XP an act at a station is credited: `xp` (cookXp, brewXp, temperXp, disenchantXp) with the Firmament's percent,
 * halved off Focus from rank 50, never past the room `pay.limit` leaves. The lines below add any first-make share,
 * halved the same way but never scaled by the Firmament.
 * @param {number} xp @param {CraftPay} [pay]
 */
export const paidXp = (xp, pay = {}) => creditedXp(onFocus(scaleXp(xp, pay.pct ?? 0), pay), pay.limit?.room ?? Infinity);

/** Said once when a craft outside the Focus reaches FOCUS_HALF_RANK. */
export const focusHalfLine = (/** @type {string} */ profession, rank = FOCUS_HALF_RANK) => t('prof.focusHalf', '{profession} is now rank {rank}. This profession isn’t your Focus; you can continue to raise it to the cap, but your experience gain will be reduced.', { profession, rank });

/**
 * @param {string} profession the track's name @param {CraftPay|null|undefined} pay @param {number} most
 */
export function capLine(profession, pay, most) {
  const limit = pay?.limit;
  if (!limit || limit.room >= most) return '';
  return t('prof.page.craft.xpTop', '{room, plural, =0 {No {profession} experience: {profession} is at Master} other {At most # {profession} experience: {profession} stops at Master}}.', { room: limit.room, profession });
}

/**
 * A station box's XP line for its picked recipe at `rank` (the craft's track's rank): its craft's XP (craftXp - a quarter
 * more than two tiers below the rank's top), and what its first time lays on - the first of its PATTERN AT ITS TIER
 * (firstCraftKey). Every recipe of RECIPES that S1 judges is made wholly of cloth (FACT, pinned), so the line names it:
 * CLOTH-GEMS - its first pays where no bolt it uses counts as bought with silver, and the line says that condition; AUDIT
 * WOVEN-PAYS: where the cloth's silver count stands (`silver`, the bolts bought with silver not yet used), it says the
 * count and that no piece of the cloth earns its first until that many are used.
 * @param {any} r a recipe of net/recipeLaw.js RECIPES @param {number} rank @param {string} profession the track's name
 * @param {CraftPay} [pay] @param {number} [silver] the cloth's silver count (net/profBook.js silver), 0 where none stands
 * @param {boolean|null} [owed] whether its first-time bonus is still owed (null unknown)
 */
export function craftXpLine(r, rank, profession, pay = {}, silver = 0, owed = null) {
  // The XP is what the service credits: ?10 with the Firmament's percent and ?13 unscaled, both halved off Focus from
  // rank 50.
  const xp = onFocus(scaleXp(craftXp(r.tier, rank), pay.pct ?? 0), pay);
  if (owed === false) return capLine(profession, pay, xp) || t('prof.page.craft.xpMade', '{xp} {profession} experience. You have made this before, so no first-time bonus.', { xp, profession });   // CRAFT-HALL
  const walled = counterMade(r) && silver > 0;   // WOVEN-PAYS: a cloth piece's first, while its cloth's silver count stands
  const more = walled ? 0 : onFocus(firstCraftXp(r, true), pay);   // FIRST-BUDGET: its track's first-make share
  if (!counterMade(r)) {
    return capLine(profession, pay, xp + more) || (owed === true
      ? t('prof.page.craft.xpOwed', '{xp} {profession} experience, plus a {more, number} first-time bonus.', { xp, profession, more })
      : t('prof.page.craft.xpFirst', '{xp} {profession} experience, and {more, number} more the first time you make this piece at this grade.', { xp, profession, more }));
  }
  return capLine(profession, pay, xp + more) || (walled
    ? t('prof.page.craft.xpBought', '{xp} {profession} experience. Bolts of this cloth bought with Imperial Argents and not yet used: {silver, number}. Until you have used that many, no piece of it earns a first-time bonus.', { xp, profession, silver })
    : t('prof.page.craft.xpFirstOwn', '{xp} {profession} experience, and {more} more the first time you make this piece at this grade from cloth not bought with Imperial Argents.', { xp, profession, more }));
}

/**
 * The fire's first-time line for a dish (its XP is the pans line's - cookXp, XP follows the rank; the first's XP - FIRST-BUDGET:
 * Provisioning's first-make share, firstCraftXp - the service lays on beside it, professions.js craftAtAnvil):
 * empty for a dish whose first pays none. CRAFT-LIMIT-SAID: the
 * limit's line in its place where the track cannot take `clean` (a clean pan's XP, the Firmament's percent on it) and the
 * first's.
 * @param {any} r a recipe of net/recipeLaw.js COOKING_RECIPES @param {string} profession @param {CraftPay} [pay] @param {number} [clean] @param {boolean|null} [owed]
 */
export const dishFirstLine = (r, profession, pay = {}, clean = 0, owed = null) => (owed === false
  ? capLine(profession, pay, clean) || t('prof.page.fire.firstMade', 'You have cooked this before, so no first-time bonus.')
  : capLine(profession, pay, clean + firstCraftXp(r))
    || (firstCraftXp(r) > 0 ? (owed === true
      ? t('prof.page.fire.firstOwed', 'First time cooking this: {more, number} more {profession} experience.', { more: firstCraftXp(r), profession })
      : t('prof.page.fire.first', 'The first time you cook this dish: {more, number} more {profession} experience.', { more: firstCraftXp(r), profession })) : ''));

/**
 * The mason's bench's works' first-time line: the first cut and the first mix each lay on their first's XP (FIRST-BUDGET:
 * Building's first-make share, each work's, workFirstXp - the service's, keyed by the work, professions.js smeltAtForge;
 * both works pay it, and pay the same, FACT, pinned). CRAFT-LIMIT-SAID: the limit's line in its place where the track
 * cannot take a first clean work of one unit.
 * @param {number} rank @param {string} profession @param {CraftPay} [pay] @param {{ cut: boolean|null, mix: boolean|null }|null} [owed]
 */
export const masonWorksFirstLine = (rank, profession, pay = {}, owed = null) => capLine(profession, pay, onFocus(scaleXp(masonXp(1, rank, { clean: true }), pay.pct ?? 0), pay) + (owed && owed.cut === false && owed.mix === false ? 0 : onFocus(workFirstXp(MASON_RECIPES[0]), pay)))
  || (owed && owed.cut !== null && owed.mix !== null
    ? t('prof.page.mason.worksOwed', 'First-time bonus, {more, number} {profession} experience each: first cut {cut, select, owed {still to earn} other {made}}, first mix {mix, select, owed {still to earn} other {made}}.',
      { more: onFocus(workFirstXp(MASON_RECIPES[0]), pay), profession, cut: owed.cut ? 'owed' : 'made', mix: owed.mix ? 'owed' : 'made' })
    : t('prof.page.mason.worksFirst', 'Your first cut and your first mix each earn {more, number} more {profession} experience.',
      { more: onFocus(workFirstXp(MASON_RECIPES[0]), pay), profession }));

/**
 * The craft's word's XP, from the service's answer (professions.js craftAnswer - `xp` as credited, `first` whether this
 * craft was the character's first of its pattern at its tier, CLOTH-GEMS `firstPaid` whether its 500 was laid on): "(+620
 * Smithing XP, with the first-time bonus)"; a first of bought cloth says why none came - WOVEN-PAYS: cloth bought with
 * silver, and the pattern's first still owed (a craft that lays none on makes no pattern); any other craft its XP alone. An
 * answer without `firstPaid` (a service before CLOTH-GEMS) is read by the recipe, as it was.
 * @param {any} r the recipe asked @param {{ xp?: number, first?: boolean, firstPaid?: boolean }|null|undefined} data the answer @param {string} profession
 * @param {{ room: number }|null} [limit]
 */
export function craftXpText(r, data, profession, limit = null) {
  if (data?.master === true) return t('prof.craft.master', '(a Master\'s work)');   // MASTER-ART: no experience past Master to say
  const xp = Number(data?.xp) || 0;
  if (limit?.room === 0) return t('prof.craft.xpTop', '(+{xp} {profession} experience. {profession} is at Master)', { xp, profession });
  if (!r || data?.first !== true) return t('prof.craft.xp', '(+{xp} {profession} experience)', { xp, profession });
  return (typeof data.firstPaid === 'boolean' ? data.firstPaid : firstCraftPays(r))
    ? t('prof.craft.xpFirst', '(+{xp} {profession} experience, with the first-time bonus)', { xp, profession })
    : t('prof.craft.xpFirstBought', '(+{xp} {profession} experience. Cloth bought with Imperial Argents earns no first-time bonus, so this piece\'s is still yours to earn)', { xp, profession });
}
