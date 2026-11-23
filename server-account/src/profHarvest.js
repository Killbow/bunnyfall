// @ts-check
// Harvesting: a character's professions state, the facts of the pixels it reads, a harvest's
// answers and reads, the hunt and haul counts, and a node's harvest.
import { mintId, overRate } from './accounts.js';
import { gatherStrikeStatement, gatherStrikeRid, findLineStatements, findLineFrom } from './marks.js';
import { dice } from './unitRoll.js';
import { readAll } from './service.js';
import { utcDay, gatherFindOf } from '../../src/net/marksLaw.js';
import { PROFESSIONS, rankOfXp, tierOpen, harvestXp, specsAt, STORES_MAX, WITHDRAW_MAX, PROF_OPS_MAX, PROF_OPS_WINDOW_S, HARVEST_LATE_S, HARVEST_EARLY_S, PROF_XP_MAX, basketStep, herbKey, COURT_WRITS_PER_DAY, glintsMax, DEEP_UNCONFIRMED_PER_DAY, cutsMax, hideOfFoe, HIGH_HIDES_PER_DAY, HIGH_HIDE_TIER, HAUL_YIELD, FISH_KEY, haulTier, herbXpTier, SCHOOL_HAULS_DAY } from '../../src/net/professionLaw.js';
import { parseNodeKey, nodeCount, herbPatch, herbSeasonMult, daySeason, HERB_TABLES, HERB_YIELD, FOOD_YIELD, herbYield, foodYield, basketFood, isMarch, regionOk, pixelOk, pixelKey, pixelReport, witnessedFact, factConfirmed, groundConfirmed, WITNESS, VEIN_TABLES, vein, boulder, dungeonVein, dungeonOk, veinYield, boulderYield, VEIN_YIELD, BOULDER_YIELD, veinGem, veinSlots, treeSlots, WOOD_TABLES, tree, TREE_YIELD, treeYield, treeFinds, hideYield, bodyFinds, haulYield, haulFinds, haulAtSea } from '../../src/net/nodeLaw.js';
import { CLIMATES } from '../../src/formats/mapsTables.js';
import { seatsOpenFor } from './townSeats.js';
import { levyAt } from './seatHolding.js';
import { levyOf, seatWeekOf } from '../../src/net/townSeatLaw.js';
import { tideNow } from './tides.js';
import { tideYield } from '../../src/net/tideLaw.js';
import { firmStatement, firmStatsFrom } from './firmament.js';
import { yieldPct, xpPct, scaleQty, scaleXp } from '../../src/net/firmament/firmamentLaw.js';
import { TERRITORY_YIELD_PCT } from '../../src/net/territoryLaw.js';
import { SURVEYOR } from '../../src/net/professionLaw.js';
import { trophyHunted } from '../../src/net/professionLaw.js';
import { CARRIED_MAX, heldOk, seenOk } from '../../src/net/bagLaw.js';
import { PIXELS_READ_MAX, DUNGEONS_READ_MAX, asks, shut, trackView, trackStatement, originOf, withGold, storeStatement, carriedStatement, countFrom } from './profShared.js';
import { clampStatements, todayStatement, todayFrom, writsStatement, madeStatement, madeFrom } from './profToday.js';
import { focusFrom } from './profCraft.js';

/**
 * A CHARACTER'S PROFESSIONS, as the Professions and Stores tabs and the nodes read them: every track, today's harvests
 * and the nodes taken, the Stores, today's writs filled (the Court's and the halls', CHAP2a), the bounds, and (CRAFT-HALL)
 * what it has made.
 */
export async function profState({ db, nowS }, player, env, { character } = {}) {
  const refused = asks(player, { character, needRid: false }) ?? shut(player, env);
  if (refused) return refused;
  const day = utcDay(nowS);
  // GATHER-SPEED: the state's reads in ONE round trip - the tracks, the Stores, the day's nodes, the carried count,
  // the day's harvests, the Court's writs and the hides and hauls - where they were eight trips in a row (WOVEN-PAYS adds
  // the cloth's silver counts, CRAFT-HALL `made`; MASTER-ART today's Master's work)
  const [rows, stores, taken, carriedRows, today, writs, hunt, hauls, silverRows, made, master, focusRows, craftworkRows] = await readAll(db, [
    db.prepare('SELECT * FROM prof_tracks WHERE player = ?1 AND char_id = ?2').bind(player.id, character),
    db.prepare('SELECT material, origin, qty FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND qty > 0 ORDER BY material').bind(player.id, character),
    db.prepare('SELECT node, kind FROM node_harvests WHERE player = ?1 AND char_id = ?2 AND day = ?3').bind(player.id, character, day),
    // BAG1: what the service counts the character as carrying, in the Stores' shape
    db.prepare('SELECT material, origin, qty FROM prof_carried WHERE player = ?1 AND char_id = ?2 AND qty > 0 ORDER BY material').bind(player.id, character),
    todayStatement(db, player.id, character, day),
    writsStatement(db, player.id, day),
    huntStatement(db, player.id, day),
    haulsStatement(db, player.id, day),
    // WOVEN-PAYS: the silver counts of its cloth (the loom's first-time line reads them)
    db.prepare('SELECT material, qty FROM prof_silver_cloth WHERE player = ?1 AND char_id = ?2 AND qty > 0').bind(player.id, character),
    madeStatement(db, player.id, character),   // CRAFT-HALL
    db.prepare('SELECT 1 FROM prof_masters WHERE player = ?1 AND char_id = ?2 AND day = ?3').bind(player.id, character, day),   // MASTER-ART: one a day
    db.prepare('SELECT profession FROM prof_focus WHERE player = ?1 AND char_id = ?2 ORDER BY profession').bind(player.id, character),   // BUNNYFALL: the Focus
    db.prepare('SELECT profession FROM prof_craftwork WHERE player = ?1 AND char_id = ?2 ORDER BY profession').bind(player.id, character),   // CRAFTWORK
  ]);
  const byProf = new Map(rows.map((r) => [r.profession, r]));
  const held = new Map();
  for (const r of stores) {
    const s = held.get(r.material) ?? { material: r.material, own: 0, bought: 0, gold: 0 };
    s[originOf(r.origin)] = Number(r.qty);
    held.set(r.material, s);
  }
  const carried = new Map();
  for (const r of carriedRows) {
    const c = carried.get(r.material) ?? { material: r.material, own: 0, bought: 0, gold: 0 };
    c[originOf(r.origin)] = Number(r.qty);
    carried.set(r.material, c);
  }
  return {
    character, day,
    tracks: PROFESSIONS.map((p) => trackView(byProf.get(p.id), p.id, nowS)),
    today: todayFrom(today),
    taken: taken.map((t) => `${t.node}|${t.kind}`),
    stores: [...held.values()].map(withGold),
    carried: [...carried.values()].map(withGold),
    writs: { today: Number(writs[0]?.n ?? 0), max: COURT_WRITS_PER_DAY },
    hunt: huntFrom(hunt[0]),   // PROF7: the account's hides today (PROF0 6)
    hauls: Number(hauls[0]?.n ?? 0),   // PROF8: the account's hauls today (PROF0 6)
    caps: { stores: STORES_MAX, withdraw: WITHDRAW_MAX, highHides: HIGH_HIDES_PER_DAY },   // CAP-OFF: no day's harvests, hides or hauls
    silver: Object.fromEntries(silverRows.map((r) => [r.material, Number(r.qty)])),   // WOVEN-PAYS: the cloth's silver counts standing
    made: madeFrom(made),   // CRAFT-HALL
    master: { made: master.length > 0 },   // MASTER-ART (Professions-Arc 57): whether today's Master's work is made
    focus: focusFrom(focusRows),
    craftwork: craftworkRows.map((x) => x.profession),   // CRAFTWORK: the skills gone into it   // BUNNYFALL CRAFTING REWORK: the crafts pledged as Focus
  };
}

// ─── THE WITNESSED WORLD: PIXELS AND DUNGEONS ────────────────────────

/** What the witnesses say of each thing of `kind` in `keys` (a pixel "x,y", a dungeon its id): a Map of key to nodeLaw
 *  witnessedFact. */
export async function factsOf(db, keys, kind = 'pixel') {
  if (!keys.length) return factsFrom(keys, []);
  return factsFrom(keys, (await factsStatement(db, keys, kind).all()).results ?? []);
}
/** GATHER-SPEED: factsOf's read as a statement, for a batch - and its Map off the rows. */
export const factsStatement = (db, keys, kind) => db.prepare(`SELECT key, account, report, at FROM world_witness WHERE kind = ?1 AND key IN (${keys.map((_, i) => `?${i + 2}`).join(', ')})`)
  .bind(kind, ...keys);
export function factsFrom(keys, /** @type {any[]} */ results) {
  const out = new Map(keys.map((k) => [k, witnessedFact([])]));
  const rowsBy = new Map();
  for (const r of results) { const a = rowsBy.get(r.key) ?? []; a.push({ account: r.account, report: r.report, at: Number(r.at) }); rowsBy.set(r.key, a); }
  for (const [k, rows] of rowsBy) out.set(k, witnessedFact(rows));
  return out;
}
export const factView = (f) => (factConfirmed(f) ? { state: f.state, climate: f.climate, region: f.region } : { state: f.state });
/**
 * THE STATES OF WHAT A CLIENT HAS STREAMED: `{ pixels: [{ x, y, state, climate?, region? }], dungeons: [{ id, ... }] }`
 * - the confirmed answer where there is one (a client whose own derivation disagrees stands no node it could not
 * harvest), the state alone where there is not. So a node never shows a rare find its ground would not give. PROF2: a
 * dungeon the player stands in, asked beside the pixels.
 */
export async function profPixels({ db }, player, env, { character, pixels, dungeons = [] } = {}) {
  const refused = asks(player, { character, needRid: false }) ?? shut(player, env);
  if (refused) return refused;
  if (!Array.isArray(pixels) || pixels.length > PIXELS_READ_MAX) return { error: 'bad-pixels' };
  if (!Array.isArray(dungeons) || dungeons.length > DUNGEONS_READ_MAX || !dungeons.every(dungeonOk)) return { error: 'bad-pixels' };
  const want = [];
  for (const p of pixels) {
    if (!Array.isArray(p) || !pixelOk(p[0], p[1])) return { error: 'bad-pixels' };
    want.push(pixelKey(p[0], p[1]));
  }
  const keys = [...new Set(want)];
  const dkeys = [...new Set(dungeons.map(String))];
  // GATHER-SPEED: the pixels' and the dungeons' witnesses in one round trip
  const [prows = [], drows = []] = await readAll(db, [...(keys.length ? [factsStatement(db, keys, 'pixel')] : []), ...(dkeys.length ? [factsStatement(db, dkeys, 'dungeon')] : [])])
    .then((r) => (keys.length ? r : [[], ...r]));
  const facts = factsFrom(keys, prows);
  const dfacts = factsFrom(dkeys, drows);
  return {
    pixels: keys.map((k) => { const [x, y] = k.split(',').map(Number); return { x, y, ...factView(facts.get(k)) }; }),
    dungeons: dkeys.map((k) => ({ id: Number(k), ...factView(dfacts.get(k)) })),
  };
}

// ─── A HARVEST ───────────────────────────────────────────────────────

/**
 * GATHER-SPEED (2026-10-11, Mac: "look at gathering minigame performance and how the server affects it/slows down"):
 * WHAT A HARVEST'S ANSWER READS, AS STATEMENTS - its track, the character's day, each Stores (or BAG1: carried) count it
 * moved, the account's hides or hauls today and (SILVER-FINDS) its find's line, the day's finds and the balance. They
 * were read one round trip each, after the harvest's own batch and its read-back: nine to fifteen trips to the
 * database's primary before the player saw a thing. Now they ride ONE batch - the decision's own, behind its writes
 * (`spec` the row the decision would write: a gem or a second find read where the roll found one, said where the row
 * kept it), or harvestAnswer's for a request asked twice. Each entry `[name, statement]`; answerOf reads them by name.
 * @param {any} db @param {any} player the account asking (its find's line, where it is linked) @param {any} env
 * @param {{ player: string, char_id: string, day: number, profession: string, material: string, gem?: string|null,
 *   extra?: string|null, carry: boolean }} spec @param {string} rid the harvest's request id @param {number} nowS
 */
export function answerReads(db, player, env, spec, rid, nowS, { marks = true } = {}) {
  /** @type {Array<[string, any]>} */
  const q = [];
  const { player: p, char_id: c, day } = spec;
  q.push(['track', trackStatement(db, p, c, spec.profession)], ['today', todayStatement(db, p, c, day)], ['store', storeStatement(db, p, c, spec.material)]);
  if (spec.gem) q.push(['gemStore', storeStatement(db, p, c, spec.gem)]);
  if (spec.extra) q.push(['extraStore', storeStatement(db, p, c, spec.extra)]);   // PROF4: a tree's Resin; PROF7: a body's butchery
  if (spec.carry) {
    q.push(['carried', carriedStatement(db, p, c, spec.material)]);
    if (spec.gem) q.push(['gemCarried', carriedStatement(db, p, c, spec.gem)]);
    if (spec.extra) q.push(['extraCarried', carriedStatement(db, p, c, spec.extra)]);
  }
  if (spec.profession === 'hunting') q.push(['hunt', huntStatement(db, p, day)]);   // PROF7: the account's hides today
  if (spec.profession === 'fishing') q.push(['hauls', haulsStatement(db, p, day)]);   // PROF8: the account's hauls today
  // SILVER-FINDS - AUDIT GATHER-SPEED G5: asked only where a line may stand (a fresh harvest's find rolled none: none)
  if (marks) findLineStatements(db, player, env, gatherStrikeRid(rid), nowS).forEach((st, i) => q.push([`marks${i}`, st]));
  return q;
}
/** GATHER-SPEED: a harvest row's own spec for answerReads - what it wrote. */
export const specOf = (row) => ({ player: row.player, char_id: row.char_id, day: Number(row.day), profession: row.profession, material: row.material,
  gem: row.gem ?? null, extra: row.extra ?? null, carry: Number(row.carry) === 1 });
/** GATHER-SPEED: answerReads' rows by name, off a batch's answers that hold them at `from`. */
export function readsBy(/** @type {Array<[string, any]>} */ q, /** @type {any[][]} */ rows, from = 0) {
  return new Map(q.map(([name], i) => [name, rows[from + i] ?? []]));
}

/** The answer a harvest's row gives - the first time (`rankBefore` the track's rank before it, so a rise is said), or
 *  again to a request asked twice. PROF2: a gem the strikes found, and its Stores. GATHER-SPEED: its reads one round trip
 *  (answerReads), its find's beside them. */
export async function harvestAnswer(db, player, env, row, nowS, extra, rankBefore = null) {
  const q = answerReads(db, player, env, specOf(row), row.rid, nowS);
  return answerOf(row, readsBy(q, await readAll(db, q.map(([, st]) => st))), nowS, extra, rankBefore);
}
/** GATHER-SPEED: a harvest's answer off its reads (answerReads, by name) - the shape it always had. SILVER-FINDS:
 *  `{ marks: { struck, balance, today } }` where the harvest's line was struck (marks.js findLineFrom), else nothing. */
export function answerOf(row, /** @type {Map<string, any[]>} */ r, nowS, extra, rankBefore = null) {
  const t = trackView(r.get('track')?.[0] ?? null, row.profession, nowS);
  const marks = r.has('marks0') ? findLineFrom([r.get('marks0'), r.get('marks1'), r.get('marks2')]) : null;
  return {
    ok: true, ...extra, ...(marks ? { marks } : {}), ...(rankBefore === null ? {} : { rose: t.rank > rankBefore }), node: row.node, kind: row.kind, material: row.material, qty: Number(row.qty), xp: Number(row.xp),
    track: t, today: todayFrom(r.get('today') ?? [])[row.profession] ?? 0,
    store: countFrom(row.material, r.get('store') ?? []),
    ...(row.gem ? { gem: row.gem, gemStore: countFrom(row.gem, r.get('gemStore') ?? []) } : {}),
    ...(row.extra ? { extra: row.extra, extraQty: Number(row.extra_qty ?? 1), extraStore: countFrom(row.extra, r.get('extraStore') ?? []) } : {}),   // PROF4: a tree's Resin; PROF7: a body's butchery
    // BAG1: a carried harvest says so, and what the service now counts the character carrying of each thing it gave - the
    // client mints the items into the bag or the pack, once, as the answer that lets the kept harvest go
    ...(Number(row.carry) === 1 ? {
      carry: true, carried: countFrom(row.material, r.get('carried') ?? []),
      ...(row.gem ? { gemCarried: countFrom(row.gem, r.get('gemCarried') ?? []) } : {}),
      ...(row.extra ? { extraCarried: countFrom(row.extra, r.get('extraCarried') ?? []) } : {}),
    } : {}),
    ...(row.profession === 'hunting' ? { hunt: huntFrom(r.get('hunt')?.[0]) } : {}),   // PROF7: the account's hides today
    ...(row.profession === 'fishing' ? { hauls: Number(r.get('hauls')?.[0]?.n ?? 0) } : {}),   // PROF8: the account's hauls today
    ...(Number(row.trophy) === 1 ? { trophy: true } : {}),   // PROF8: a trophy the client puts in the pack
  };
}

/** Each node kind's harvests and the profession it is worked under (PROF0 5.2): a patch's herbs and food, a vein's and a
 *  dungeon vein's ore, a boulder's stone; PROF4: a tree's logs; PROF7: a body's hide. */
export const NODE_HARVESTS = Object.freeze({
  body: Object.freeze({ kinds: Object.freeze(['hide']), profession: 'hunting' }),
  tree: Object.freeze({ kinds: Object.freeze(['logs']), profession: 'logging' }),
  herb: Object.freeze({ kinds: Object.freeze(['herbs', 'food']), profession: 'herbalism' }),
  vein: Object.freeze({ kinds: Object.freeze(['ore']), profession: 'mining' }),
  boulder: Object.freeze({ kinds: Object.freeze(['stone']), profession: 'mining' }),
  dvein: Object.freeze({ kinds: Object.freeze(['ore']), profession: 'mining' }),
  haul: Object.freeze({ kinds: Object.freeze(['fish']), profession: 'fishing' }),   // PROF8: a haul's Raw Fish
});
/** Whether a climate may hold the node kind: a patch where herbs grow, a vein where veins run, a boulder where the
 *  climate has boulders, a dungeon vein in any climate a location has. */
export function climateHolds(nodeKind, climate) {
  if (!Number.isSafeInteger(climate)) return false;
  if (nodeKind === 'herb') return !!HERB_TABLES[climate];
  if (nodeKind === 'vein') return !!VEIN_TABLES[climate];
  if (nodeKind === 'boulder') return nodeCount(climate, 'boulder') > 0;
  if (nodeKind === 'tree') return !!WOOD_TABLES[climate] && nodeCount(climate, 'tree') > 0;
  return Object.values(CLIMATES).includes(climate);
}
/** A Pick-Axe's report, bounded (PROF0 23): the strikes on the glint, at most the finish's; a clean finish only with
 *  every strike on it. */
export function strikesOf(act, tier) {
  const most = glintsMax(tier);
  const glints = Number.isSafeInteger(act?.glints) ? Math.max(0, Math.min(most, act.glints)) : 0;
  return { glints, clean: act?.clean === true && glints === most };
}

/** PROF7 - a Skinning Knife's report, bounded (PROF0 29): a clean pelt or a torn one, never both - a report claiming both
 *  is neither. The score behind them is the client's; the act's bound is the step it can buy (5.1). */
export function traceOf(act) {
  const clean = act?.clean === true, torn = act?.torn === true;
  return { clean: clean && !torn, torn: torn && !clean };
}
/** PROF7 - the account's hides today, and of them those of tiers 5-6 (PROF0 6: 3 a day - CAP-OFF: the day's thirty of any
 *  tier are said, not bounded), every character's together. AUDIT 32 L2: the hides - the rows' units, a clean pelt's
 *  second among them - where it counted the bodies. */
export async function huntToday(db, player, day) {
  return huntFrom(await huntStatement(db, player, day).first());
}
export const huntStatement = (db, player, day) => db.prepare(`SELECT COALESCE(SUM(qty), 0) AS n, COALESCE(SUM(CASE WHEN tier >= ?3 THEN qty ELSE 0 END), 0) AS high
    FROM node_harvests WHERE player = ?1 AND profession = 'hunting' AND day = ?2`).bind(player, day, HIGH_HIDE_TIER);
export const huntFrom = (r) => ({ hides: Number(r?.n ?? 0), high: Number(r?.high ?? 0) });
/** PROF8 - the account's hauls today (CAP-OFF: said, no longer bounded), every character's together - the rows, a haul each. */
export const haulsStatement = (db, player, day) => db.prepare("SELECT COUNT(*) AS n FROM node_harvests WHERE player = ?1 AND profession = 'fishing' AND day = ?2").bind(player, day);
/** AUDIT LOCKPICK D2: an account's hauls a day whose school counted (migration 0176's `school`). */
export const schoolsStatement = (db, player, day) => db.prepare("SELECT COUNT(*) AS n FROM node_harvests WHERE player = ?1 AND profession = 'fishing' AND day = ?2 AND school = 1").bind(player, day);

/** PROF8 - a net's report, bounded (PROF0 5.1): a full net is the clean act; a school, the cast's landing within one of
 *  the day's two (nodeLaw schoolSpots) - the client's word, its one or none. */
export function netOf(act) {
  return { clean: act?.clean === true, school: act?.school === 0 || act?.school === 1 };
}

/** A Wood-Axe's report, bounded (PROF0 25): the Clean Cuts at most the finish's (every chop clean); a clean act only with
 *  every chop clean. */
export function cutsOf(act, tier, lumberjack) {
  const most = cutsMax(tier, lumberjack);
  const cuts = Number.isSafeInteger(act?.cuts) ? Math.max(0, Math.min(most, act.cuts)) : 0;
  return { cuts, clean: act?.clean === true && cuts === most };
}

/**
 * A NODE HARVESTED (PROF0 6): `{ character, node, kind, climate, region, act, at, rid }` - the node's id, what of it is
 * taken (`herbs` or `food` at a patch, `ore` at a vein, `stone` at a boulder), its ground as the client derived it (a
 * pixel's climate and region; a dungeon's, for a dungeon vein), the act's report (`{ clean, bruised }` for an herb,
 * `{ finds }` for the Basket, `{ glints, clean }` for the Pick-Axe, `{ cuts, clean }` for the Wood-Axe - PROF4's `logs`
 * at a tree), the act's end on the shared clock (epoch seconds)
 * and the request's id. The id must be today's and real by the law; `at` at most ten minutes past, at any hour (ANY-HOUR,
 * 2026-10-01, Mac: "Remove the time limit for professions. Should be available at any time"); the ground as the witnesses confirmed it, or taken at the claim's word at the least it is worth (a
 * pixel's tiers 1-2 - its veins' 1-3, UNWITNESSED-ORE (nodeLaw UNCONFIRMED_VEIN_TIER) - and no march or signature; a
 * dungeon's tier 3 and no gem); the tier inside the rank; the Stores'
 * room decided in the harvest's own INSERT - CAP-OFF (2026-10-07, Mac: "Remove the cap on life skills"): no day's cap.
 * The yield, and a gem, are the service's dice.
 *
 * PROF7: A BODY (`body:<day>:<id>`, kind `hide`, `foe` the DFU MobileTypes of the body the client says its own blow
 * felled; the act `{ clean, torn }` - the Skinning Knife's trace). Hunting is bounded, not witnessed (PROF0 6): a body
 * names no ground, keeps no hours and writes no witness, the tier is the foe's the client claims - and the account's rare
 * hides are its defence, 3 of tiers 5-6 a day, decided in the same INSERT (CAP-OFF: the day's thirty of any tier are gone).
 */
export async function harvestNode(ctx, player, env, body = {}) {
  const { db, nowS, rand } = ctx;
  const { character, node, kind, climate, region, act, at, rid, foe } = body ?? {};
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  // BAG1: A CARRYING CLIENT's harvest lands in its bag or pack - the carried count (bagLaw.js) - never the Stores; `held`
  // what it holds of the material now, the count first cut to it. An older client's lands in the Stores, as before.
  const carry = body?.carry === true;
  const heldNow = carry && heldOk(body?.held) ? body.held : null;
  const seen = seenOk(body?.seen) ? body.seen : null;   // AUDIT BAG1 B2: the count the client last heard
  const T = carry ? 'prof_carried' : 'prof_stores';
  const ROOM = carry ? CARRIED_MAX : STORES_MAX;
  const prior = await db.prepare('SELECT * FROM node_harvests WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (prior) return harvestAnswer(db, player, env, prior, nowS, { repeat: true });   // before the switch: a harvest made is a harvest answered
  const closed = shut(player, env);
  if (closed) return closed;
  const n = parseNodeKey(node);
  const law = n ? NODE_HARVESTS[n.kind] : null;
  if (!law) return { error: 'bad-node' };
  if (!law.kinds.includes(kind)) return { error: 'prof-kind' };
  const isBody = n.kind === 'body';   // PROF7: a body names no ground (PROF0 6)
  const isHaul = n.kind === 'haul';   // PROF8: a haul names its pixel, and no slot
  if (!isBody && (!climateHolds(n.kind, climate) || !regionOk(region))) return { error: 'prof-pixel' };
  const day = utcDay(nowS);
  if (n.day !== day) return { error: 'prof-day' };   // PROF0 19: a node whose UTC day has ended lapses
  if (!Number.isSafeInteger(at) || at < nowS - HARVEST_LATE_S || at > nowS + HARVEST_EARLY_S || utcDay(at) !== day) return { error: 'prof-late' };
  const deep = n.kind === 'dvein';
  // ANY-HOUR (2026-10-01, Mac: "Remove the time limit for professions. Should be available at any time"): no node keeps
  // hours - the wilderness kept Foraging's day (FORAGE0 14.3) and refused the night with `prof-night`; a dungeon vein and
  // Hunting never kept any
  // AUDIT 32 S4: a body's foe is the request's shape, refused before the hour's acts are spent (as a craft's dye is)
  const hide = isBody ? hideOfFoe(foe) : null;
  if (isBody && !hide) return { error: 'prof-foe' };
  // THE GROUND, as the witnesses say it is - a pixel's, or a dungeon's; a body's none
  const wkind = deep ? 'dungeon' : 'pixel';
  const key = deep ? String(n.dungeon) : isBody ? null : pixelKey(n.x, n.y);
  const profession = law.profession;
  // GATHER-SPEED: the hour's acts counted, the ground and the track read, and (SEAT1d) the Levy's seat asked - AT ONCE,
  // three asks in flight together where they were four trips in a row. None reads what another writes; the hour's
  // refusal still comes first, and a refused harvest's reads are only read
  // FIRM1: and the character's Firmament beside its track (firmament.js firmStatement) - its yield and XP the service's
  const [over, [factRows, trackRows, firmRows], levyKey] = await Promise.all([
    overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S),
    readAll(db, [...(key === null ? [] : [factsStatement(db, [key], wkind)]), trackStatement(db, player.id, character, profession), firmStatement(db, player.id, character)])
      .then((rows) => (key === null ? [[], ...rows] : rows)),
    // A dungeon's vein and a body name no ground of a town
    !deep && !isBody && seatsOpenFor(player, env) ? levyAt(db, nowS, region, [n.x, n.y]) : null,
  ]);
  if (over) return { error: 'prof-rate' };
  const fact = key === null ? null : factsFrom([key], factRows).get(key);
  const confirmed = groundConfirmed(fact);   // BUNNYFALL WITNESSED-GROUND: off, the harvester's own ground counts
  const witness = !isBody && Number.isSafeInteger(player.registered_at) && player.registered_at <= nowS - WITNESS.ageS ? 1 : 0;
  if (factConfirmed(fact) && (fact.climate !== climate || fact.region !== region)) {
    // AUDIT 29 A4: refused - and, from an account that may witness, written down: a dissent is what a dispute is made
    // of (SEAT0 3.2), and a refusal that kept no report let the first three words stand for good
    if (witness) {
      await db.prepare('INSERT OR IGNORE INTO world_witness (kind, key, account, report, region, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
        .bind(wkind, key, player.id, pixelReport(climate, region), region, nowS).run();
    }
    return { error: 'prof-pixel' };
  }
  // a vein's slots are its climate's and, on confirmed ground, its region's signature beside them (AUDIT 29 A6); a tree's
  // its climate's, and the jungle's in the owner's area (JUNGLE-WOODS); a body has none (AUDIT 32 S2: its unchecked
  // ground is never read)
  if (!deep && !isBody && !isHaul && n.slot >= (n.kind === 'vein' ? veinSlots({ climate, region, confirmed }) : n.kind === 'tree' ? treeSlots({ x: n.x, y: n.y, climate }) : nodeCount(climate, n.kind))) return { error: 'bad-node' };

  // THE TRACK it is worked under
  const row = trackRows[0] ?? null;
  const rank = rankOfXp(Number(row?.xp ?? 0));
  const specs = specsAt(row, nowS);
  const march = !deep && !isBody && confirmed && isMarch(region);
  // SEASON1 part two (9.3): the land's Tide this week, on confirmed ground alone - as the March's, so a region named
  // falsely earns no Harvest and dodges no Blight
  const tide = !deep && !isBody && confirmed ? tideNow(env, nowS, region) : 'calm';
  const roll = (lo, hi) => lo + Math.floor(dice(rand) * (hi - lo + 1));
  let tier, key2, qty, clean, gem = null, extra = null, extraQty = 1, trophy = 0, schooled = 0;
  let xpTier = /** @type {number|null} */ (null);   // HERB-XP: the tier the XP is reckoned at, where it is not the node's
  if (isHaul) {
    // PROF8: THE NET - a haul's Raw Fish, worked at the rank's own tier (Mac: "XP follows your rank"); a full net x1.5
    // (the act's bound); a school's fish; at sea on confirmed ground a Pearl and a Slaughterfish; a trophy anywhere
    tier = haulTier(rank);
    const net = netOf(act);
    clean = net.clean;
    key2 = FISH_KEY;
    const finds = haulFinds({ sea: haulAtSea(climate, region), confirmed, pearlDiver: specs[100] === 'pearl-diver', deepSea: specs[100] === 'deep-sea' }, () => dice(rand));
    gem = finds.pearl;
    extra = finds.scales;
    trophy = finds.trophy ? 1 : 0;
    // AUDIT GATHER F3: a school's fish on the account's first SCHOOL_HAULS_DAY SCHOOLS of the day - the client's word,
    // bounded as section 30 bound it (the day's forty), never on every haul. AUDIT LOCKPICK D2: the schools counted, never
    // the hauls - an honest angler's first school after forty plain hauls earned nothing (migration 0176: its row says so)
    const school = net.school && Number((await schoolsStatement(db, player.id, day).first())?.n ?? 0) < SCHOOL_HAULS_DAY;
    schooled = school ? 1 : 0;
    qty = haulYield({ roll: roll(HAUL_YIELD[0], HAUL_YIELD[1]), clean, march, school, netter: specs[50] === 'netter', slaughterfish: !!finds.scales, tideMult: tideYield(tide, 'haul') }, dice(rand));
  } else if (isBody) {
    // PROF7: THE SKINNING KNIFE - the hide of the foe the client names; a clean pelt x1.5 (the act's bound), a torn one's
    // DFU part lost; the part one body in four; the butchery beside it, a Butcher's two (PROF0 4.4, 29)
    const h = /** @type {NonNullable<typeof hide>} */ (hide);
    tier = h.tier;
    if (!tierOpen(rank, tier)) return { error: 'prof-rank' };
    const t = traceOf(act);
    clean = t.clean;
    key2 = h.key;
    qty = hideYield({ clean }, dice(rand));
    const finds = bodyFinds({ hide: h, torn: t.torn, butcher: specs[100] === 'butcher' }, () => dice(rand));
    gem = finds.part;
    extra = finds.meat;
    extraQty = finds.meatQty || 1;
    // HUNTERS-MARK (Professions-Arc 58): a Trophy Hunter's clean pelt of a tier 5+ body mounts its beast - written on the
    // row the rare hides' day decides, so it is bounded by their three
    trophy = trophyHunted({ spec100: specs[100], tier, clean }) ? 1 : 0;
  } else if (n.kind === 'tree') {
    // PROF4: THE WOOD-AXE - a tree's logs; Resin one in four, Heartwood a Clean Cut's find on confirmed ground (PROF0 25)
    const found = tree({ x: n.x, y: n.y, day, slot: n.slot, climate, confirmed });
    if (!found) return { error: 'bad-node' };
    tier = found.tier;
    if (!tierOpen(rank, tier)) return { error: 'prof-rank' };
    const c = cutsOf(act, tier, specs[50] === 'lumberjack');
    clean = c.clean;
    key2 = found.material;
    qty = treeYield({ roll: roll(TREE_YIELD[0], TREE_YIELD[1]), march, tideMult: tideYield(tide, 'tree') }, dice(rand));
    const finds = treeFinds({ cuts: c.cuts, confirmed, forester: specs[50] === 'forester' }, () => dice(rand));
    gem = finds.heartwood;
    extra = finds.resin;
  } else if (n.kind === 'herb') {
    const patch = herbPatch({ x: n.x, y: n.y, day, slot: n.slot, climate, confirmed, seasonalEye: specs[100] === 'seasonal-eye' });
    if (!patch) return { error: 'bad-node' };
    if (kind === 'herbs') {
      tier = patch.tier;
      if (!tierOpen(rank, tier)) return { error: 'prof-rank' };
      xpTier = herbXpTier(rank);   // HERB-XP (Mac: "XP follows your rank"): picked at the rank's own tier, as a haul is worked
      key2 = herbKey(patch.herb, region);
      const common = tier === 1;
      // the steady hand's report, bounded: an uncommon or rare herb unbruised is the clean act; a bruised one yields one
      // less. A common herb has no moment. Apothecary's Friend: every herb picked counts as unbruised (PROF0 3.3).
      let bruised = !common && act?.bruised === true;
      clean = !common && act?.clean === true && !bruised;
      if (!common && specs[100] === 'apothecarys-friend') { bruised = false; clean = true; }
      qty = herbYield({
        roll: roll(HERB_YIELD[0], HERB_YIELD[1]), common, gardener: specs[50] === 'gardener',
        seasonMult: herbSeasonMult(patch.herb, daySeason(day)), offSeason: patch.offSeason, bruised, march, tideMult: tideYield(tide, 'herb'),
      }, dice(rand));
    } else {
      tier = 1;
      const food = basketFood(climate, day, dice(rand));
      key2 = food.material;
      const finds = Number.isSafeInteger(act?.finds) ? Math.max(0, Math.min(3, act.finds)) : 0;
      clean = finds >= 3;
      const [lo, hi] = FOOD_YIELD[food.block];
      qty = foodYield({ roll: roll(lo, hi), step: basketStep(finds), march, tideMult: tideYield(tide, 'food') }, dice(rand));
    }
  } else {
    // PROF2: THE PICK-AXE - a vein's ore, a boulder's stone, a dungeon vein's deep ore (PROF0 23)
    // MINE-PERKS (Professions-Arc 43): a Surveyor's surface vein on ground the witnesses have not confirmed is its
    // climate's whole table - their word its witness, for their own veins alone; never a signature (veinSlots above
    // counted none), never the March's or a Tide's (named by the region, on confirmed ground alone)
    const surveyed = n.kind === 'vein' && !confirmed && specs[100] === SURVEYOR;
    const found = n.kind === 'vein' ? vein({ x: n.x, y: n.y, day, slot: n.slot, climate, region, confirmed, surveyed })
      : n.kind === 'boulder' ? boulder({ x: n.x, y: n.y, day, slot: n.slot, climate })
        : dungeonVein({ dungeon: n.dungeon, day, slot: n.slot, climate, confirmed });
    if (!found) return { error: 'bad-node' };
    tier = found.tier;
    if (!tierOpen(rank, tier)) return { error: 'prof-rank' };
    const s = strikesOf(act, tier);
    clean = s.clean;
    if (n.kind === 'boulder') {
      const y = boulderYield({ roll: roll(BOULDER_YIELD[0], BOULDER_YIELD[1]), march, cut: clean || specs[100] === SURVEYOR, tideMult: tideYield(tide, 'boulder') }, dice(rand));
      key2 = y.material;
      qty = y.qty;
    } else {
      key2 = found.material;
      qty = veinYield({ roll: roll(VEIN_YIELD[0], VEIN_YIELD[1]), deep, deepDelver: specs[50] === 'deep-delver', march, tideMult: tideYield(tide, 'vein') }, dice(rand));
      // a gem: each strike on the glint a chance (a Prospector's x1.1), on ground the witnesses confirmed - one at most
      // (MINE-PERKS: or a Surveyor's own)
      gem = veinGem({ kind: n.kind, climate, glints: s.glints, confirmed: confirmed || surveyed, prospector: specs[50] === 'prospector' }, () => dice(rand));
    }
  }
  if (!key2) return { error: 'bad-node' };
  // FIRM1 (bible/06-Systems/Firmament.md): THE FIRMAMENT'S HAND - the character's tree, as this service keeps it, on the
  // yield (the service's own die for the fraction) and the XP of the profession worked; after every draw above, so each
  // of them is what it was
  const firm = firmStatsFrom(firmRows?.[0], player, env);
  const firmYield = yieldPct(firm, profession);
  if (firmYield) qty = scaleQty(qty, firmYield, dice(rand));   // a die drawn only for a tree that moves the yield
  // BUNNYFALL COMPANIES (territory): inside the gatherer's own Company's territory, TERRITORY_YIELD_PCT more - the client's
  // word (it alone places the hall on the map), as a friends' server takes it; a die drawn only when it is said
  if (body?.territory === true) qty = scaleQty(qty, TERRITORY_YIELD_PCT, dice(rand));
  const xp = scaleXp(harvestXp(xpTier ?? tier, rank, clean), xpPct(firm, profession));
  const nonce = mintId(rand);
  // SEAT1d (SEAT0 7.6): THE LEVY - a tenth of a harvest on ground in the bailiwick of a seat whose Levy rules this week
  // goes to the seat's stockpile; the gatherer keeps at least one (its seat asked above, beside the ground).
  const levy = levyKey == null ? 0 : Math.max(0, Math.min(levyOf(qty, dice(rand)), qty - 1));
  const kept = qty - levy;
  // SILVER-FINDS (2026-10-05, Mac: "Silver should be more accessible in more forms of interactions like foraging"): A
  // HARVEST'S FIND - the service's dice, after every draw above so each of them is what it was; struck in this batch, by
  // THIS harvest's row alone, under the day's `gather` silver (marks.js gatherStrikeStatement). Bounded, not witnessed:
  // a harvest is the client's word on its node, as a hide is, so the day is the bound (marksLaw.js SILVER-FINDS).
  const silver = gatherFindOf(dice(rand), dice(rand));
  const find = silver > 0 ? gatherStrikeStatement(ctx, player, env, { rid, nonce, amount: silver }) : null;
  const deepUnconfirmed = deep && !confirmed ? 1 : 0;
  const mine = 'player = ?1 AND rid = ?2 AND n = ?3';
  const stored = `COALESCE((SELECT SUM(qty) FROM ${T} WHERE player = ?1 AND char_id = ?4 AND material = ?5), 0)`;   // BAG1: the count it lands in
  const storedExtra = `COALESCE((SELECT SUM(qty) FROM ${T} WHERE player = ?1 AND char_id = ?4 AND material = ?18), 0)`;
  // PROF7: Hunting's rare hides today, in hides (AUDIT 32 L2) - the account's, of tiers 5-6. CAP-OFF: its day of thirty
  // hides of any tier, and Fishing's of forty hauls, are counted no more
  const huntedHigh = "COALESCE((SELECT SUM(qty) FROM node_harvests WHERE player = ?1 AND profession = 'hunting' AND day = ?6 AND tier >= ?20), 0)";
  // GATHER-SPEED: the answer's reads (answerReads), behind the decision in its own batch - and the row read back first
  const answer = answerReads(db, player, env, { player: player.id, char_id: character, day, profession, material: key2, gem, extra, carry }, rid, nowS, { marks: !!find });
  const decided = [
    // BAG1: the carried count cut to what the pack and the bag hold of it, before the decision reads its room
    // AUDIT BAG1 B2/B3: and only the material the held count is of (`heldKey` - a herb, a log, a hide: the client names
    // the node's own; the Basket's roll is the service's, named nowhere), while the client's view is current, before a twin
    ...(heldNow != null && body?.heldKey === key2 ? clampStatements(db, { player: player.id, character, material: key2, held: heldNow, rid, seen,
      twin: 'NOT EXISTS (SELECT 1 FROM node_harvests WHERE player = ?1 AND rid = ?5)' }) : []),
    // THE DECISION: a dungeon nobody vouched for within its four (AUDIT 29 A5), PROF7: Hunting's rare hides for the
    // account - 3 of tiers 5-6 (PROF0 6), a rare hide cut to their day's room as to the Stores' (AUDIT 32 L2) - the node not
    // yet taken (the key), room in the Stores - the yield cut to it, the XP to what the track can take (A14: the answer
    // says what was credited); the second find kept where one of it fits, its count cut to its room (AUDIT 32 S3: a
    // Butcher's two at 4,999 were both lost). CAP-OFF: no day's cap - a character's sixty in a profession, an account's
    // 120 (A3), Hunting's thirty hides and Fishing's forty hauls are asked no more
    db.prepare(`INSERT OR IGNORE INTO node_harvests (day, node, kind, player, char_id, profession, material, qty, xp, gem, at, rid, n, deep_unconfirmed, extra, tier, extra_qty, trophy, carry, school)
      SELECT ?6, ?7, ?8, ?1, ?4, ?9, ?5, MIN(?10, ?11 - ${stored},
          CASE WHEN ?9 = 'hunting' AND ?19 >= ?20 THEN ?21 - ${huntedHigh} ELSE ?10 END),
        MAX(0, MIN(?12, ?17 - COALESCE((SELECT xp FROM prof_tracks WHERE player = ?1 AND char_id = ?4 AND profession = ?9), 0))),
        CASE WHEN COALESCE((SELECT SUM(qty) FROM ${T} WHERE player = ?1 AND char_id = ?4 AND material = ?14), 0) < ?11 THEN ?14 END, ?13, ?2, ?3, ?15,
        CASE WHEN ${storedExtra} < ?11 THEN ?18 END, ?19, CASE WHEN ${storedExtra} < ?11 THEN MIN(?22, ?11 - ${storedExtra}) ELSE 1 END, ?23, ?24, ?25
      WHERE (?15 = 0 OR (SELECT COUNT(*) FROM node_harvests WHERE player = ?1 AND day = ?6 AND deep_unconfirmed = 1) < ?16)
        AND (?9 <> 'hunting' OR ?19 < ?20 OR ${huntedHigh} < ?21)
        AND ?11 - ${stored} >= 1`)
      .bind(player.id, rid, nonce, character, key2, day, node, kind, profession, kept, ROOM, xp, at, gem,
        deepUnconfirmed, DEEP_UNCONFIRMED_PER_DAY, PROF_XP_MAX, extra,
        tier, HIGH_HIDE_TIER, HIGH_HIDES_PER_DAY, extraQty, trophy, carry ? 1 : 0, schooled),
    db.prepare(`INSERT INTO ${T} (player, char_id, material, origin, qty)
      SELECT player, char_id, material, 'own', qty FROM node_harvests WHERE ${mine}
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = ${T}.qty + excluded.qty`).bind(player.id, rid, nonce),
    // PROF12 (PROF0 4.3, 5.2, 9.3: "an unbruised herb (+5% Alchemy Potent chance each)"): an herb picked UNBRUISED - an
    // uncommon or rare herb's steady hand clean, every one an Apothecary's Friend's - counted beside the Stores (which keep
    // no unit's bruise), its units the brewing act's (alchemy.js brewAtStation), at most the Stores' bound
    ...(kind === 'herbs' && clean === true ? [db.prepare(`INSERT INTO prof_unbruised (player, char_id, material, qty)
      SELECT player, char_id, material, qty FROM node_harvests WHERE ${mine}
      ON CONFLICT (player, char_id, material) DO UPDATE SET qty = MIN(?4, prof_unbruised.qty + excluded.qty)`).bind(player.id, rid, nonce, ROOM)] : []),
    // the gem beside it - the decision kept it only where its own material had room
    db.prepare(`INSERT INTO ${T} (player, char_id, material, origin, qty)
      SELECT player, char_id, gem, 'own', 1 FROM node_harvests WHERE ${mine} AND gem IS NOT NULL
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = ${T}.qty + excluded.qty`).bind(player.id, rid, nonce),
    // PROF4: a tree's Resin beside the logs, kept the same way; PROF7: a body's butchery, its count (a Butcher's two)
    db.prepare(`INSERT INTO ${T} (player, char_id, material, origin, qty)
      SELECT player, char_id, extra, 'own', extra_qty FROM node_harvests WHERE ${mine} AND extra IS NOT NULL
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = ${T}.qty + excluded.qty`).bind(player.id, rid, nonce),
    // SEAT1d: the Levy's units to the seat's stockpile, beside the harvest that paid them - once (the request's own row)
    ...(levy > 0 ? [
      db.prepare(`INSERT OR IGNORE INTO town_seat_levies (player, rid, key, week, material, qty, at)
        SELECT ?1, ?2, ?4, ?5, material, ?6, ?7 FROM node_harvests WHERE ${mine}`).bind(player.id, rid, nonce, levyKey, seatWeekOf(nowS * 1000), levy, nowS),
      db.prepare(`INSERT INTO town_seat_stockpile (key, material, qty) SELECT ?4, material, ?5 FROM node_harvests WHERE ${mine}
        ON CONFLICT (key, material) DO UPDATE SET qty = town_seat_stockpile.qty + excluded.qty`).bind(player.id, rid, nonce, levyKey, levy),
    ] : []),
    db.prepare(`INSERT INTO prof_tracks (player, char_id, profession, xp, updated_at)
      SELECT player, char_id, profession, MIN(?4, xp), ?5 FROM node_harvests WHERE ${mine}
      ON CONFLICT (player, char_id, profession) DO UPDATE SET xp = MIN(?4, prof_tracks.xp + excluded.xp), updated_at = excluded.updated_at`)
      .bind(player.id, rid, nonce, PROF_XP_MAX, nowS),
    // THE WITNESS: the ground as this client derived it, once an account - an account a week registered; a body none
    // (AUDIT 32 S2: its ground is never checked, and a hand-built one was bound here - a 500 and an hour's act spent)
    ...(isBody ? [] : [db.prepare(`INSERT OR IGNORE INTO world_witness (kind, key, account, report, region, at)
      SELECT ?9, ?4, ?1, ?5, ?6, ?7 WHERE ?8 = 1 AND EXISTS (SELECT 1 FROM node_harvests WHERE ${mine})`)
      .bind(player.id, rid, nonce, key, pixelReport(climate, region), region, nowS, witness, wkind)]),
    ...(find ? [find] : []),   // SILVER-FINDS: the find, last
    db.prepare('SELECT * FROM node_harvests WHERE player = ?1 AND rid = ?2').bind(player.id, rid),
  ];
  const rows = await readAll(db, [...decided, ...answer.map(([, st]) => st)]);
  const made = rows[decided.length - 1][0] ?? null;
  if (made?.n === nonce) return answerOf(made, readsBy(answer, rows, decided.length), nowS, levy > 0 ? { levy: { qty: levy, key: levyKey } } : {}, rank);
  if (made) return harvestAnswer(db, player, env, made, nowS, { repeat: true });   // the same request, racing itself
  if (await db.prepare('SELECT 1 FROM node_harvests WHERE day = ?1 AND node = ?2 AND kind = ?3 AND player = ?4 AND char_id = ?5')
    .bind(day, node, kind, player.id, character).first()) return { error: 'node-taken' };
  // CAP-OFF: no day's cap to say - `prof-cap`, `prof-account-cap`, `prof-hunt-cap` and `prof-fish-cap` are said no more
  if (isBody) {   // PROF7: Hunting's rare hides (PROF0 6)
    const hunt = await huntToday(db, player.id, day);
    if (tier >= HIGH_HIDE_TIER && hunt.high >= HIGH_HIDES_PER_DAY) return { error: 'prof-hunt-high' };
  }
  if (deepUnconfirmed) {
    const d = await db.prepare('SELECT COUNT(*) AS n FROM node_harvests WHERE player = ?1 AND day = ?2 AND deep_unconfirmed = 1').bind(player.id, day).first();
    if (Number(d?.n ?? 0) >= DEEP_UNCONFIRMED_PER_DAY) return { error: 'prof-deep-cap' };
  }
  return { error: carry ? 'carried-full' : 'stores-full', material: key2 };   // BAG1: a carried count at its bound says so
}
