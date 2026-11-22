// @ts-check
// The professions' shared reads: the open check and its guards, the track view and row, a
// character's Stores and silver cloth, and what it carries. Every professions module reads these.
import { accountKind } from './accounts.js';
import { isDeveloper } from './titles.js';
import { CHAR_ID_RE } from './service.js';
import { rankOfXp, specsAt, SPEC_RANKS, trackOf, specTrialUntil, respecLockUntil, PROF_RID_RE, profSwitchOf } from '../../src/net/professionLaw.js';
import { JUDGED_CLOTH } from '../../src/net/recipeLaw.js';
import { LOOSE_ORIGIN } from '../../src/net/bagLaw.js';

export const DAY_S = 86_400;
/** The pixels one read may ask after - a streamed 5 x 5. */
export const PIXELS_READ_MAX = 25;
/** The dungeons one read may ask after - the one the player stands in, and a few it has walked out of today. */
export const DUNGEONS_READ_MAX = 4;

/** Whether the professions are open to this account: the switch, and at `dev` the developers alone. */
export function profOpenFor(player, env) {
  const s = profSwitchOf(env?.PROFESSIONS_OPEN);
  return s === 'on' || (s === 'dev' && isDeveloper(player, env));
}

export const charOk = (c) => typeof c === 'string' && CHAR_ID_RE.test(c);
/** The first door every professions request walks through: a registered account, its character, and (for an act) a
 *  request id. The switch is asked after the row an act's request may already have made. */
export function asks(player, { character, rid, needRid = true }) {   // PROF12: the alchemy station's door too (alchemy.js)
  if (accountKind(player) !== 'linked') return { error: 'prof-need-account' };
  if (!charOk(character)) return { error: 'prof-character' };
  if (needRid && (typeof rid !== 'string' || !PROF_RID_RE.test(rid))) return { error: 'prof-rid' };
  return null;
}
export const shut = (player, env) => (profOpenFor(player, env) ? null : { error: 'prof-closed' });

// ─── WHAT A CHARACTER HAS ────────────────────────────────────────────

/** A track as the tabs read it: its XP and rank, the specialisations it stands under now, a change on its way. CRAFT3: a
 *  discipline's is its craft's track (`profession` the craft's - 'jewelcrafting' answers 'smithing'), and `free` the
 *  ranks a change is free at, once - the merge's (0088's `free_respec`: 1 the choice at 50, 2 at 100), said only where
 *  there is one. PERK-TRIAL: `trial` each rank whose choice is still on trial and until when (`{ 50: at }`), and `lock`
 *  the second the track's next paid change opens - each said only where there is one. `respec`, a change on its way, is
 *  never one now (AUDIT PERK-TRIAL P8: a change written as waiting stands at once - specsAt) and is said empty for the
 *  clients that read it. */
export function trackView(row, profession, nowS) {
  const xp = Number(row?.xp ?? 0);
  const specs = specsAt(row, nowS);
  const free = SPEC_RANKS.filter((r) => (Number(row?.free_respec ?? 0) & freeBit(r)) !== 0);
  const trial = Object.fromEntries(SPEC_RANKS.map((r) => [r, specTrialUntil(row, r, nowS)]).filter(([, at]) => at !== null));
  const lock = respecLockUntil(row, nowS);
  return { profession: trackOf(profession), xp, rank: rankOfXp(xp), specs, respec: null, ...(free.length ? { free } : {}), ...(Object.keys(trial).length ? { trial } : {}), ...(lock ? { lock } : {}) };
}
/** CRAFT3: a rank's bit in a track's `free_respec` (0088) - 1 the choice at 50, 2 at 100. */
export const freeBit = (rank) => (rank === 50 ? 1 : rank === 100 ? 2 : 0);
/** GATHER-SPEED: a track's row as a statement, for a batch (trackRow asks it alone). */
export const trackStatement = (db, player, character, profession) =>
  db.prepare('SELECT * FROM prof_tracks WHERE player = ?1 AND char_id = ?2 AND profession = ?3').bind(player, character, trackOf(profession));
export const trackRow = (db, player, character, profession) => trackStatement(db, player, character, profession).first();
/** A Stores row's origin as a count's name - own, bought (with Drakes), GOLD-MARKET's gold (bought with gold) or AUDIT
 *  BAG-CRAFT's loose (a station's put-in the count did not hold - bagLaw.js LOOSE_ORIGIN). */
export const originOf = (o) => (o === 'bought' || o === 'gold' || o === LOOSE_ORIGIN ? o : 'own');
/** GOLD-MARKET: a Stores count's gold units said only where there are any - a Stores nothing bought with gold keeps the
 *  shape every client before it read ({ material, own, bought }). AUDIT BAG-CRAFT: and its loose units likewise. */
export const withGold = (s) => {
  if (!(s.gold > 0)) delete s.gold;
  if (!(s[LOOSE_ORIGIN] > 0)) delete s[LOOSE_ORIGIN];
  return s;
};
/** One material's count in a character's Stores, own, bought and (GOLD-MARKET) bought with gold, where held. PROF5: the
 *  market's answers read it too. */
export async function storeOf(db, player, character, key) {
  const out = countFrom(key, (await storeStatement(db, player, character, key).all()).results ?? []);
  // WOVEN-PAYS: a cloth's count says its silver count beside it, always (0 where none stands), so a client hearing any
  // answer of it reads the loom's first-time line afresh
  return JUDGED_CLOTH.includes(key) ? { ...out, silver: await silverOf(db, player, character, key) } : out;
}
/** WOVEN-PAYS (AUDIT WOVEN-PAYS; the owner: "Woven cloth pays"): A CLOTH'S SILVER COUNT in SQL - the bolts of it (recipeLaw
 *  JUDGED_CLOTH) the character bought with silver that its stations have not used since (`prof_silver_cloth`, migration
 *  0177). While it stands, the bolts a craft uses are those, and a piece made wholly of cloth lays no first on (AUDIT 32
 *  S1 - recipeLaw firstCraftPays). `p`, `c` and `m` the player's, the character's and the material's SQL. */
export const silverSql = (p, c, m) => `COALESCE((SELECT qty FROM prof_silver_cloth WHERE player = ${p} AND char_id = ${c} AND material = ${m}), 0)`;
export const silverOf = async (db, player, character, key) => Number((await db.prepare(`SELECT ${silverSql('?1', '?2', '?3')} AS n`).bind(player, character, key).first())?.n ?? 0);
export const CLOTH_SQL = JUDGED_CLOTH.map((k) => `'${k}'`).join(', ');
/** WOVEN-PAYS: THE CLOTH A PURCHASE HANDS A CHARACTER FOR SILVER, COUNTED - `select` the purchase's own rows as (player,
 *  char_id, material, qty), read in its batch; every material but JUDGED_CLOTH passes uncounted. The Weavers' and the
 *  furnisher's counters (buyStock) and the Drakes market (market.js: a buy, a courier's load, a buy order filled) - never
 *  the gold market's (a gold buy is no silver, and its units no station's), a guild's or a weave's. */
export const silverClothIn = (db, select, binds) => db.prepare(`INSERT INTO prof_silver_cloth (player, char_id, material, qty)
  SELECT player, char_id, material, qty FROM (${select}) WHERE material IN (${CLOTH_SQL}) AND qty > 0
  ON CONFLICT (player, char_id, material) DO UPDATE SET qty = prof_silver_cloth.qty + excluded.qty`).bind(...binds);
/** WOVEN-PAYS: A STATION'S USE OF A CLOTH TAKES ITS BOLTS OFF THE SILVER COUNT - `qtySql` units of `materialSql` where `guard`
 *  holds (the act's own row; ?1 the player, ?2 the character, `binds` from ?3), a row at nought deleted. A craft's and a
 *  temper's, whatever the recipe: a bolt used is a bolt used. */
export const silverClothOut = (db, { player, character, materialSql, qtySql, guard, binds }) => [
  db.prepare(`UPDATE prof_silver_cloth SET qty = qty - MIN(qty, ${qtySql}) WHERE player = ?1 AND char_id = ?2 AND material = ${materialSql} AND ${guard}`).bind(player, character, ...binds),
  db.prepare('DELETE FROM prof_silver_cloth WHERE player = ?1 AND char_id = ?2 AND qty = 0').bind(player, character),
];
/** GATHER-SPEED: a Stores count's (and BAG1: a carried count's) rows as a statement, for a batch - and its count off them. */
export const storeStatement = (db, player, character, key) =>
  db.prepare('SELECT origin, qty FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND material = ?3').bind(player, character, key);
export const carriedStatement = (db, player, character, key) =>
  db.prepare('SELECT origin, qty FROM prof_carried WHERE player = ?1 AND char_id = ?2 AND material = ?3').bind(player, character, key);
export function countFrom(key, /** @type {any[]} */ results) {
  const out = { material: key, own: 0, bought: 0, gold: 0 };
  for (const r of results) out[originOf(r.origin)] = Number(r.qty);
  return withGold(out);
}
/** BAG1: ONE MATERIAL'S CARRIED COUNT - every unit the service handed to the character's bag or pack and has not had back
 *  by a deposit (bagLaw.js), own, bought and gold - in the Stores' own shape. A bound, never an inventory: the items are
 *  the save's. */
export async function carriedOf(db, player, character, key) {
  return countFrom(key, (await carriedStatement(db, player, character, key).all()).results ?? []);
}
