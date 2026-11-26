// @ts-check
import { mintId, overRate } from './accounts.js';
import { gatherStrikeStatement, gatherStrikeRid, findLineStatements, findLineFrom } from './marks.js';
import { dice } from './unitRoll.js';
import { readAll } from './service.js';
import { utcDay, gatherFindOf } from '../../src/net/marksLaw.js';
import { timberGrade } from '../../src/net/timberLaw.js';   // BUNNYFALL (2026-11-26, caverns): timber grades
import { PROFESSIONS, rankOfXp, tierOpen, harvestXp, specsAt, STORES_MAX, WITHDRAW_MAX, PROF_OPS_MAX, PROF_OPS_WINDOW_S, HARVEST_LATE_S, HARVEST_EARLY_S, PROF_XP_MAX, basketStep, herbKey, COURT_WRITS_PER_DAY, glintsMax, DEEP_UNCONFIRMED_PER_DAY, cutsMax, hideOfFoe, HIGH_HIDES_PER_DAY, HIGH_HIDE_TIER, HAUL_YIELD, FISH_KEY, haulTier, herbXpTier, SCHOOL_HAULS_DAY } from '../../src/net/professionLaw.js';
import { parseNodeKey, nodeCount, herbPatch, herbSeasonMult, daySeason, HERB_TABLES, HERB_YIELD, FOOD_YIELD, herbYield, foodYield, basketFood, isMarch, regionOk, pixelOk, pixelKey, pixelReport, witnessedFact, factConfirmed, groundConfirmed, WITNESS, VEIN_TABLES, vein, boulder, dungeonVein, dungeonOk, veinYield, boulderYield, VEIN_YIELD, BOULDER_YIELD, veinGem, veinSlots, treeSlots, WOOD_TABLES, tree, TREE_YIELD, treeYield, treeFinds, hideYield, bodyFinds, haulYield, haulFinds, haulAtSea } from '../../src/net/nodeLaw.js';
import { mineVeinOf, MINE_VEINS_PER_DAY } from '../../src/net/mine/mineVeins.js';   // BUNNYFALL (2026-11-25, caverns)
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

export async function profState({ db, nowS }, player, env, { character } = {}) {
  const refused = asks(player, { character, needRid: false }) ?? shut(player, env);
  if (refused) return refused;
  const day = utcDay(nowS);
  const [rows, stores, taken, carriedRows, today, writs, hunt, hauls, silverRows, made, master, focusRows, craftworkRows] = await readAll(db, [
    db.prepare('SELECT * FROM prof_tracks WHERE player = ?1 AND char_id = ?2').bind(player.id, character),
    db.prepare('SELECT material, origin, qty FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND qty > 0 ORDER BY material').bind(player.id, character),
    db.prepare('SELECT node, kind FROM node_harvests WHERE player = ?1 AND char_id = ?2 AND day = ?3').bind(player.id, character, day),
    db.prepare('SELECT material, origin, qty FROM prof_carried WHERE player = ?1 AND char_id = ?2 AND qty > 0 ORDER BY material').bind(player.id, character),
    todayStatement(db, player.id, character, day),
    writsStatement(db, player.id, day),
    huntStatement(db, player.id, day),
    haulsStatement(db, player.id, day),
    db.prepare('SELECT material, qty FROM prof_silver_cloth WHERE player = ?1 AND char_id = ?2 AND qty > 0').bind(player.id, character),
    madeStatement(db, player.id, character),
    db.prepare('SELECT 1 FROM prof_masters WHERE player = ?1 AND char_id = ?2 AND day = ?3').bind(player.id, character, day),
    db.prepare('SELECT profession FROM prof_focus WHERE player = ?1 AND char_id = ?2 ORDER BY profession').bind(player.id, character),
    db.prepare('SELECT profession FROM prof_craftwork WHERE player = ?1 AND char_id = ?2 ORDER BY profession').bind(player.id, character),
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
    hunt: huntFrom(hunt[0]),
    hauls: Number(hauls[0]?.n ?? 0),
    caps: { stores: STORES_MAX, withdraw: WITHDRAW_MAX, highHides: HIGH_HIDES_PER_DAY },
    silver: Object.fromEntries(silverRows.map((r) => [r.material, Number(r.qty)])),
    made: madeFrom(made),
    master: { made: master.length > 0 },
    focus: focusFrom(focusRows),
    craftwork: craftworkRows.map((x) => x.profession),
  };
}

export async function factsOf(db, keys, kind = 'pixel') {
  if (!keys.length) return factsFrom(keys, []);
  return factsFrom(keys, (await factsStatement(db, keys, kind).all()).results ?? []);
}
export const factsStatement = (db, keys, kind) => db.prepare(`SELECT key, account, report, at FROM world_witness WHERE kind = ?1 AND key IN (${keys.map((_, i) => `?${i + 2}`).join(', ')})`)
  .bind(kind, ...keys);
export function factsFrom(keys, /** @type {any[]} */ results) {
  const out = new Map(keys.map((k) => [k, witnessedFact([])]));
  const rowsBy = new Map();
  for (const r of results) { const a = rowsBy.get(r.key) ?? []; a.push({ account: r.account, report: r.report, at: Number(r.at) }); rowsBy.set(r.key, a); }
  for (const [k, rows] of rowsBy) out.set(k, witnessedFact(rows));
  return out;
}
// Confirmed ground replaces the client's own derivation, so a node never shows a find its ground would not give.
export const factView = (f) => (factConfirmed(f) ? { state: f.state, climate: f.climate, region: f.region } : { state: f.state });
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
  const [prows = [], drows = []] = await readAll(db, [...(keys.length ? [factsStatement(db, keys, 'pixel')] : []), ...(dkeys.length ? [factsStatement(db, dkeys, 'dungeon')] : [])])
    .then((r) => (keys.length ? r : [[], ...r]));
  const facts = factsFrom(keys, prows);
  const dfacts = factsFrom(dkeys, drows);
  return {
    pixels: keys.map((k) => { const [x, y] = k.split(',').map(Number); return { x, y, ...factView(facts.get(k)) }; }),
    dungeons: dkeys.map((k) => ({ id: Number(k), ...factView(dfacts.get(k)) })),
  };
}

/**
 * @param {any} db
 * @param {any} player
 * @param {any} env
 * @param {{ player: string, char_id: string, day: number, profession: string, material: string, gem?: string|null,
 *   extra?: string|null, carry: boolean }} spec
 * @param {string} rid
 * @param {number} nowS
 */
export function answerReads(db, player, env, spec, rid, nowS, { marks = true } = {}) {
  /** @type {Array<[string, any]>} */
  const q = [];
  const { player: p, char_id: c, day } = spec;
  q.push(['track', trackStatement(db, p, c, spec.profession)], ['today', todayStatement(db, p, c, day)], ['store', storeStatement(db, p, c, spec.material)]);
  if (spec.gem) q.push(['gemStore', storeStatement(db, p, c, spec.gem)]);
  if (spec.extra) q.push(['extraStore', storeStatement(db, p, c, spec.extra)]);
  if (spec.carry) {
    q.push(['carried', carriedStatement(db, p, c, spec.material)]);
    if (spec.gem) q.push(['gemCarried', carriedStatement(db, p, c, spec.gem)]);
    if (spec.extra) q.push(['extraCarried', carriedStatement(db, p, c, spec.extra)]);
  }
  if (spec.profession === 'hunting') q.push(['hunt', huntStatement(db, p, day)]);
  if (spec.profession === 'fishing') q.push(['hauls', haulsStatement(db, p, day)]);
  if (marks) findLineStatements(db, player, env, gatherStrikeRid(rid), nowS).forEach((st, i) => q.push([`marks${i}`, st]));
  return q;
}
export const specOf = (row) => ({ player: row.player, char_id: row.char_id, day: Number(row.day), profession: row.profession, material: row.material,
  gem: row.gem ?? null, extra: row.extra ?? null, carry: Number(row.carry) === 1 });
export function readsBy(/** @type {Array<[string, any]>} */ q, /** @type {any[][]} */ rows, from = 0) {
  return new Map(q.map(([name], i) => [name, rows[from + i] ?? []]));
}

export async function harvestAnswer(db, player, env, row, nowS, extra, rankBefore = null) {
  const q = answerReads(db, player, env, specOf(row), row.rid, nowS);
  return answerOf(row, readsBy(q, await readAll(db, q.map(([, st]) => st))), nowS, extra, rankBefore);
}
export function answerOf(row, /** @type {Map<string, any[]>} */ r, nowS, extra, rankBefore = null) {
  const t = trackView(r.get('track')?.[0] ?? null, row.profession, nowS);
  const marks = r.has('marks0') ? findLineFrom([r.get('marks0'), r.get('marks1'), r.get('marks2')]) : null;
  return {
    ok: true, ...extra, ...(marks ? { marks } : {}), ...(rankBefore === null ? {} : { rose: t.rank > rankBefore }), node: row.node, kind: row.kind, material: row.material, qty: Number(row.qty), xp: Number(row.xp),
    track: t, today: todayFrom(r.get('today') ?? [])[row.profession] ?? 0,
    store: countFrom(row.material, r.get('store') ?? []),
    ...(row.gem ? { gem: row.gem, gemStore: countFrom(row.gem, r.get('gemStore') ?? []) } : {}),
    ...(row.extra ? { extra: row.extra, extraQty: Number(row.extra_qty ?? 1), extraStore: countFrom(row.extra, r.get('extraStore') ?? []) } : {}),
    ...(Number(row.carry) === 1 ? {
      carry: true, carried: countFrom(row.material, r.get('carried') ?? []),
      ...(row.gem ? { gemCarried: countFrom(row.gem, r.get('gemCarried') ?? []) } : {}),
      ...(row.extra ? { extraCarried: countFrom(row.extra, r.get('extraCarried') ?? []) } : {}),
    } : {}),
    ...(row.profession === 'hunting' ? { hunt: huntFrom(r.get('hunt')?.[0]) } : {}),
    ...(row.profession === 'fishing' ? { hauls: Number(r.get('hauls')?.[0]?.n ?? 0) } : {}),
    ...(Number(row.trophy) === 1 ? { trophy: true } : {}),
  };
}

export const NODE_HARVESTS = Object.freeze({
  body: Object.freeze({ kinds: Object.freeze(['hide']), profession: 'hunting' }),
  tree: Object.freeze({ kinds: Object.freeze(['logs']), profession: 'logging' }),
  herb: Object.freeze({ kinds: Object.freeze(['herbs', 'food']), profession: 'herbalism' }),
  vein: Object.freeze({ kinds: Object.freeze(['ore']), profession: 'mining' }),
  boulder: Object.freeze({ kinds: Object.freeze(['stone']), profession: 'mining' }),
  dvein: Object.freeze({ kinds: Object.freeze(['ore']), profession: 'mining' }),
  cvein: Object.freeze({ kinds: Object.freeze(['ore']), profession: 'mining' }),   // BUNNYFALL (2026-11-25, caverns): a mine's vein, the same for everyone
  haul: Object.freeze({ kinds: Object.freeze(['fish']), profession: 'fishing' }),
});
export function climateHolds(nodeKind, climate) {
  if (!Number.isSafeInteger(climate)) return false;
  if (nodeKind === 'herb') return !!HERB_TABLES[climate];
  if (nodeKind === 'vein') return !!VEIN_TABLES[climate];
  if (nodeKind === 'boulder') return nodeCount(climate, 'boulder') > 0;
  if (nodeKind === 'tree') return !!WOOD_TABLES[climate] && nodeCount(climate, 'tree') > 0;
  return Object.values(CLIMATES).includes(climate);
}
export function strikesOf(act, tier) {
  const most = glintsMax(tier);
  const glints = Number.isSafeInteger(act?.glints) ? Math.max(0, Math.min(most, act.glints)) : 0;
  return { glints, clean: act?.clean === true && glints === most };
}

export function traceOf(act) {
  const clean = act?.clean === true, torn = act?.torn === true;
  return { clean: clean && !torn, torn: torn && !clean };
}
export async function huntToday(db, player, day) {
  return huntFrom(await huntStatement(db, player, day).first());
}
export const huntStatement = (db, player, day) => db.prepare(`SELECT COALESCE(SUM(qty), 0) AS n, COALESCE(SUM(CASE WHEN tier >= ?3 THEN qty ELSE 0 END), 0) AS high
    FROM node_harvests WHERE player = ?1 AND profession = 'hunting' AND day = ?2`).bind(player, day, HIGH_HIDE_TIER);
export const huntFrom = (r) => ({ hides: Number(r?.n ?? 0), high: Number(r?.high ?? 0) });
export const haulsStatement = (db, player, day) => db.prepare("SELECT COUNT(*) AS n FROM node_harvests WHERE player = ?1 AND profession = 'fishing' AND day = ?2").bind(player, day);
export const schoolsStatement = (db, player, day) => db.prepare("SELECT COUNT(*) AS n FROM node_harvests WHERE player = ?1 AND profession = 'fishing' AND day = ?2 AND school = 1").bind(player, day);

export function netOf(act) {
  return { clean: act?.clean === true, school: act?.school === 0 || act?.school === 1 };
}

export function cutsOf(act, tier, lumberjack) {
  const most = cutsMax(tier, lumberjack);
  const cuts = Number.isSafeInteger(act?.cuts) ? Math.max(0, Math.min(most, act.cuts)) : 0;
  return { cuts, clean: act?.clean === true && cuts === most };
}

export async function harvestNode(ctx, player, env, body = {}) {
  const { db, nowS, rand } = ctx;
  const { character, node, kind, climate, region, act, at, rid, foe } = body ?? {};
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const carry = body?.carry === true;
  const heldNow = carry && heldOk(body?.held) ? body.held : null;
  const seen = seenOk(body?.seen) ? body.seen : null;
  // A harvest from a carrying client lands in the carried count, and one from an older client lands in the Stores.
  const T = carry ? 'prof_carried' : 'prof_stores';
  const ROOM = carry ? CARRIED_MAX : STORES_MAX;
  const prior = await db.prepare('SELECT * FROM node_harvests WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  // A harvest already made is answered before the switch check, so a repeat always returns its harvest.
  if (prior) return harvestAnswer(db, player, env, prior, nowS, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  const n = parseNodeKey(node);
  const law = n ? NODE_HARVESTS[n.kind] : null;
  if (!law) return { error: 'bad-node' };
  if (!law.kinds.includes(kind)) return { error: 'prof-kind' };
  const isBody = n.kind === 'body';
  const isHaul = n.kind === 'haul';
  const isCave = n.kind === 'cvein';   // BUNNYFALL (2026-11-25, caverns): a mine's vein names no pixel and no UTC day
  const noGround = isBody || isCave;
  const cave = isCave ? mineVeinOf(n.mine, n.reset, n.slot) : null;
  if (isCave && !cave) return { error: 'no-node' };
  if (!noGround && (!climateHolds(n.kind, climate) || !regionOk(region))) return { error: 'prof-pixel' };
  const day = utcDay(nowS);
  // BUNNYFALL (2026-11-25, caverns): a day's cave veins, per account
  if (isCave && Number((await db.prepare("SELECT COUNT(*) AS n FROM node_harvests WHERE player = ?1 AND day = ?2 AND node LIKE 'cvein:%'").bind(player.id, day).first())?.n ?? 0) >= MINE_VEINS_PER_DAY) return { error: 'day-full' };
  if (!isCave && n.day !== day) return { error: 'prof-day' };
  if (!Number.isSafeInteger(at) || at < nowS - HARVEST_LATE_S || at > nowS + HARVEST_EARLY_S || utcDay(at) !== day) return { error: 'prof-late' };
  const deep = n.kind === 'dvein';
  const hide = isBody ? hideOfFoe(foe) : null;
  if (isBody && !hide) return { error: 'prof-foe' };
  const wkind = deep ? 'dungeon' : 'pixel';
  const key = deep ? String(n.dungeon) : noGround ? null : pixelKey(n.x, n.y);
  const profession = law.profession;
  const [over, [factRows, trackRows, firmRows], levyKey] = await Promise.all([
    overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S),
    readAll(db, [...(key === null ? [] : [factsStatement(db, [key], wkind)]), trackStatement(db, player.id, character, profession), firmStatement(db, player.id, character)])
      .then((rows) => (key === null ? [[], ...rows] : rows)),
    !deep && !noGround && seatsOpenFor(player, env) ? levyAt(db, nowS, region, [n.x, n.y]) : null,
  ]);
  if (over) return { error: 'prof-rate' };
  const fact = key === null ? null : factsFrom([key], factRows).get(key);
  const confirmed = groundConfirmed(fact);
  const witness = !noGround && Number.isSafeInteger(player.registered_at) && player.registered_at <= nowS - WITNESS.ageS ? 1 : 0;
  if (factConfirmed(fact) && (fact.climate !== climate || fact.region !== region)) {
    // A refused report is still written as a witness, since a dispute needs the dissenting reports.
    if (witness) {
      await db.prepare('INSERT OR IGNORE INTO world_witness (kind, key, account, report, region, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
        .bind(wkind, key, player.id, pixelReport(climate, region), region, nowS).run();
    }
    return { error: 'prof-pixel' };
  }
  if (!deep && !noGround && !isHaul && n.slot >= (n.kind === 'vein' ? veinSlots({ climate, region, confirmed }) : n.kind === 'tree' ? treeSlots({ x: n.x, y: n.y, climate }) : nodeCount(climate, n.kind))) return { error: 'bad-node' };

  const row = trackRows[0] ?? null;
  const rank = rankOfXp(Number(row?.xp ?? 0));
  const specs = specsAt(row, nowS);
  // The March and the Tide apply on confirmed ground alone, so a falsely named region earns no bonus.
  const march = !deep && !noGround && confirmed && isMarch(region);
  const tide = !deep && !noGround && confirmed ? tideNow(env, nowS, region) : 'calm';
  const roll = (lo, hi) => lo + Math.floor(dice(rand) * (hi - lo + 1));
  let tier, key2, qty, clean, gem = null, extra = null, extraQty = 1, trophy = 0, schooled = 0;
  let grade = 'sound';   // BUNNYFALL (2026-11-26, caverns): a felling's timber grade (timberLaw.js), its logs' all
  let xpTier = /** @type {number|null} */ (null);
  if (isHaul) {
    tier = haulTier(rank);
    const net = netOf(act);
    clean = net.clean;
    key2 = FISH_KEY;
    const finds = haulFinds({ sea: haulAtSea(climate, region), confirmed, pearlDiver: specs[100] === 'pearl-diver', deepSea: specs[100] === 'deep-sea' }, () => dice(rand));
    gem = finds.pearl;
    extra = finds.scales;
    trophy = finds.trophy ? 1 : 0;
    // The day's school bonus counts school hauls, not all hauls.
    const school = net.school && Number((await schoolsStatement(db, player.id, day).first())?.n ?? 0) < SCHOOL_HAULS_DAY;
    schooled = school ? 1 : 0;
    qty = haulYield({ roll: roll(HAUL_YIELD[0], HAUL_YIELD[1]), clean, march, school, netter: specs[50] === 'netter', slaughterfish: !!finds.scales, tideMult: tideYield(tide, 'haul') }, dice(rand));
  } else if (isBody) {
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
    trophy = trophyHunted({ spec100: specs[100], tier, clean }) ? 1 : 0;
  } else if (n.kind === 'tree') {
    const found = tree({ x: n.x, y: n.y, day, slot: n.slot, climate, confirmed });
    if (!found) return { error: 'bad-node' };
    tier = found.tier;
    if (!tierOpen(rank, tier)) return { error: 'prof-rank' };
    const c = cutsOf(act, tier, specs[50] === 'lumberjack');
    clean = c.clean;
    grade = timberGrade(c.cuts, cutsMax(tier, specs[50] === 'lumberjack'), c.clean);
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
      xpTier = herbXpTier(rank);
      key2 = herbKey(patch.herb, region);
      const common = tier === 1;
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
    const surveyed = n.kind === 'vein' && !confirmed && specs[100] === SURVEYOR;
    const found = isCave ? cave : n.kind === 'vein' ? vein({ x: n.x, y: n.y, day, slot: n.slot, climate, region, confirmed, surveyed })
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
      gem = isCave ? null : veinGem({ kind: n.kind, climate, glints: s.glints, confirmed: confirmed || surveyed, prospector: specs[50] === 'prospector' }, () => dice(rand));
    }
  }
  if (!key2) return { error: 'bad-node' };
  // The Firmament, territory, levy, and silver dice are drawn after every roll above, so those rolls stay
  // unchanged.
  const firm = firmStatsFrom(firmRows?.[0], player, env);
  const firmYield = yieldPct(firm, profession);
  if (firmYield) qty = scaleQty(qty, firmYield, dice(rand));
  if (body?.territory === true) qty = scaleQty(qty, TERRITORY_YIELD_PCT, dice(rand));
  const xp = scaleXp(harvestXp(xpTier ?? tier, rank, clean), xpPct(firm, profession));
  const nonce = mintId(rand);
  const levy = levyKey == null ? 0 : Math.max(0, Math.min(levyOf(qty, dice(rand)), qty - 1));
  const kept = qty - levy;
  const silver = gatherFindOf(dice(rand), dice(rand));
  const find = silver > 0 ? gatherStrikeStatement(ctx, player, env, { rid, nonce, amount: silver }) : null;
  const deepUnconfirmed = deep && !confirmed ? 1 : 0;
  const mine = 'player = ?1 AND rid = ?2 AND n = ?3';
  const stored = `COALESCE((SELECT SUM(qty) FROM ${T} WHERE player = ?1 AND char_id = ?4 AND material = ?5), 0)`;
  const storedExtra = `COALESCE((SELECT SUM(qty) FROM ${T} WHERE player = ?1 AND char_id = ?4 AND material = ?18), 0)`;
  const huntedHigh = "COALESCE((SELECT SUM(qty) FROM node_harvests WHERE player = ?1 AND profession = 'hunting' AND day = ?6 AND tier >= ?20), 0)";
  const answer = answerReads(db, player, env, { player: player.id, char_id: character, day, profession, material: key2, gem, extra, carry }, rid, nowS, { marks: !!find });
  // One batch decides the harvest and writes every credit off its row and nonce, with the answer's reads behind it.
  const decided = [
    ...(heldNow != null && body?.heldKey === key2 ? clampStatements(db, { player: player.id, character, material: key2, held: heldNow, rid, seen,
      twin: 'NOT EXISTS (SELECT 1 FROM node_harvests WHERE player = ?1 AND rid = ?5)' }) : []),
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
    ...(kind === 'herbs' && clean === true ? [db.prepare(`INSERT INTO prof_unbruised (player, char_id, material, qty)
      SELECT player, char_id, material, qty FROM node_harvests WHERE ${mine}
      ON CONFLICT (player, char_id, material) DO UPDATE SET qty = MIN(?4, prof_unbruised.qty + excluded.qty)`).bind(player.id, rid, nonce, ROOM)] : []),
    // BUNNYFALL (2026-11-26, caverns): TIMBER GRADES - a prime or a knotty felling's logs counted beside the Stores
    // (prof_log_grades, migration 0223; timberLaw.js), the workbench's saw reading them. A carried felling keeps none: the saw
    // reads the Stores' logs, and a carried log is sound when it gets there
    ...(n.kind === 'tree' && grade !== 'sound' && !carry ? [db.prepare(`INSERT INTO prof_log_grades (player, char_id, material, prime, knotty)
      SELECT player, char_id, material, ?4 * qty, ?5 * qty FROM node_harvests WHERE ${mine}
      ON CONFLICT (player, char_id, material) DO UPDATE SET prime = prof_log_grades.prime + excluded.prime, knotty = prof_log_grades.knotty + excluded.knotty`)
      .bind(player.id, rid, nonce, grade === 'prime' ? 1 : 0, grade === 'knotty' ? 1 : 0)] : []),
    db.prepare(`INSERT INTO ${T} (player, char_id, material, origin, qty)
      SELECT player, char_id, gem, 'own', 1 FROM node_harvests WHERE ${mine} AND gem IS NOT NULL
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = ${T}.qty + excluded.qty`).bind(player.id, rid, nonce),
    db.prepare(`INSERT INTO ${T} (player, char_id, material, origin, qty)
      SELECT player, char_id, extra, 'own', extra_qty FROM node_harvests WHERE ${mine} AND extra IS NOT NULL
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = ${T}.qty + excluded.qty`).bind(player.id, rid, nonce),
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
    ...(noGround ? [] : [db.prepare(`INSERT OR IGNORE INTO world_witness (kind, key, account, report, region, at)
      SELECT ?9, ?4, ?1, ?5, ?6, ?7 WHERE ?8 = 1 AND EXISTS (SELECT 1 FROM node_harvests WHERE ${mine})`)
      .bind(player.id, rid, nonce, key, pixelReport(climate, region), region, nowS, witness, wkind)]),
    ...(find ? [find] : []),
    db.prepare('SELECT * FROM node_harvests WHERE player = ?1 AND rid = ?2').bind(player.id, rid),
  ];
  const rows = await readAll(db, [...decided, ...answer.map(([, st]) => st)]);
  const made = rows[decided.length - 1][0] ?? null;
  if (made?.n === nonce) return answerOf(made, readsBy(answer, rows, decided.length), nowS, { ...(levy > 0 ? { levy: { qty: levy, key: levyKey } } : {}), ...(n.kind === 'tree' && !carry ? { grade } : {}) }, rank);   // BUNNYFALL (caverns): a felling's timber grade said
  if (made) return harvestAnswer(db, player, env, made, nowS, { repeat: true });
  if (await db.prepare('SELECT 1 FROM node_harvests WHERE day = ?1 AND node = ?2 AND kind = ?3 AND player = ?4 AND char_id = ?5')
    .bind(day, node, kind, player.id, character).first()) return { error: 'node-taken' };
  if (isBody) {
    const hunt = await huntToday(db, player.id, day);
    if (tier >= HIGH_HIDE_TIER && hunt.high >= HIGH_HIDES_PER_DAY) return { error: 'prof-hunt-high' };
  }
  if (deepUnconfirmed) {
    const d = await db.prepare('SELECT COUNT(*) AS n FROM node_harvests WHERE player = ?1 AND day = ?2 AND deep_unconfirmed = 1').bind(player.id, day).first();
    if (Number(d?.n ?? 0) >= DEEP_UNCONFIRMED_PER_DAY) return { error: 'prof-deep-cap' };
  }
  return { error: carry ? 'carried-full' : 'stores-full', material: key2 };
}
