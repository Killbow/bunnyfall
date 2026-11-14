// @ts-check
// Crafting: withdrawing and depositing Stores, smelting at the forge, the craftwork focus and
// its picks, crafting at the anvil and the bench, tempering a piece, and buying stock.
import { mintId, overRate, EMBERS_EARNED_SQL } from './accounts.js';
import { marksOpenFor, balanceOf } from './marks.js';
import { dice } from './unitRoll.js';
import { utcDay } from '../../src/net/marksLaw.js';
import { rankOfXp, xpForRank, specsAt, trackOf, STORES_MAX, WITHDRAW_MAX, PROF_OPS_MAX, PROF_OPS_WINDOW_S, PROF_XP_MAX, smeltRecipe, SMELT_MAX, smeltXp, stockOf, STOCK_MAX, withdrawable, workPer, workSpecRank, workOpen, workSpecOk, workEmbers } from '../../src/net/professionLaw.js';
import { recipeById, recipeOpen, qualityOdds, rollQuality, qualitySteps, craftQuality, rollsQuality, craftXp, craftCount, makerMark, counterMade, firstCraftKin, recipeInputs, takesHeartwood, carriesMark, dyeOk, JUDGED_CLOTH, firstCraftXp, workFirstXp, FIRST_MAKE_FLOOR, masonXp, cookXp, dishHand, jewelHand, takesCracked, masterworkSpec, LAPIDARY, PROVENANCE_RE } from '../../src/net/recipeLaw.js';
import { mintProductRecord, readProductRecord, craftMintVersion } from '../../src/net/productRecord.js';
import { temperableRecipe, temperFrom, temperCost, temperXp, temperCap } from '../../src/net/temperLaw.js';
import { signingKey } from './signing.js';
import { lookOk } from '../../src/net/productRecord.js';
import { craftModsOf, inspirationOf, workPartsOf, MOD_KINDS, CRAFTWORK_SWING, CRAFTWORK_TRACKS, CRAFT_SWING, craftworkPct } from '../../src/net/craft/craftLaw.js';
import { planOf, inputsOf, craftedQuality, craftValueXp, focusOk, FOCUS_CHANGE_MARKS, FOCUS_TRACKS, FOCUS_HALF_RANK, halfXp, NON_FOCUS_QUALITY_MAX } from '../../src/net/craft/craftLaw.js';
import { material } from '../../src/net/nodeLaw.js';
import { firmStatsOf } from './firmament.js';
import { xpPct, scaleXp } from '../../src/net/firmament/firmamentLaw.js';
import { stationSteps } from '../../src/net/fortLaw.js';
import { fortTiersOf } from './seatForts.js';
import { RAM_KIT } from '../../src/net/professionLaw.js';
import { SIEGE_GEM } from '../../src/net/professionLaw.js';
import { CARRIED_MAX, DEPOSIT_MAX, DEPOSIT_ORDERS, heldOk, seenOk, depositOrderOk, looseOrder, LOOSE_ORIGIN } from '../../src/net/bagLaw.js';
import { asks, shut, trackView, trackRow, storeOf, silverSql, silverClothIn, silverClothOut, carriedOf } from './profShared.js';
import { spendOrigins, workStatements, workHeld } from './profSpend.js';
import { clampStatements, carriedSql, workableSql, PAID_FIRST_SQL } from './profToday.js';

/**
 * WITHDRAW TO PACK: `{ character, material, qty, rid }` - `qty` units out of the Stores, bought first, for the client to
 * mint as the items the law names (professionLaw materialOf). On the old door they never come back (law 3, as it stood).
 * BAG1: `carry` true (and `held`, what the bag and the pack hold of it now) - THE UNITS ARE COUNTED AS CARRIED, each under
 * the origin it left the Stores as (gold's first, bought, own: the spend order), so a deposit can bring them back and
 * nothing else can. The count is cut to `held` first; a count at its bound refuses (`carried-full`).
 */
export async function withdrawStores(ctx, player, env, { character, material: key, qty, rid, carry = false, held = null, seen = null } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const answer = async (row, extra = {}) => ({
    ok: true, ...extra, material: row.material, qty: Number(row.qty), store: await storeOf(db, player.id, row.char_id, row.material),
    ...(Number(row.carry) === 1 ? { carry: true, carried: await carriedOf(db, player.id, row.char_id, row.material) } : {}),   // BAG1
  });
  const prior = await db.prepare('SELECT * FROM prof_withdrawals WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (prior) return answer(prior, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  if (!material(key)) return { error: 'bad-material' };
  if (!withdrawable(key)) return { error: 'prof-no-pack-form' };   // PROF3: the smith's stock waits for its professions' templates
  if (!Number.isSafeInteger(qty) || qty < 1 || qty > WITHDRAW_MAX) return { error: 'bad-qty' };
  const carrying = carry === true;
  if (carrying && !heldOk(held)) return { error: 'bad-held' };   // BAG1: a carrying client says what it holds
  if (await overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S)) return { error: 'prof-rate' };
  const nonce = mintId(rand);
  const originHeld = (o) => `COALESCE((SELECT qty FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND material = ?4 AND origin = '${o}'), 0)`;
  await db.batch([
    // BAG1: the carried count cut to what the client holds - only while this request has made nothing (a racing twin of a
    // landed withdrawal holds the same `held`, and would cut away the units the first one counted)
    ...(carrying ? clampStatements(db, { player: player.id, character, material: key, held, rid, seen: seenOk(seen) ? seen : null,
      twin: 'NOT EXISTS (SELECT 1 FROM prof_withdrawals WHERE player = ?1 AND rid = ?5)' }) : []),
    // THE DECISION: the Stores hold the units; BAG1: what it takes of each origin, read in the spend order (gold's, then
    // AUDIT BAG-CRAFT A1's loose, then bought, then own); and, carrying, room in the carried count
    db.prepare(`INSERT OR IGNORE INTO prof_withdrawals (player, rid, char_id, material, qty, at, n, carry, own, bought, gold, loose)
      SELECT ?1, ?3, ?2, ?4, ?5, ?6, ?7, ?8, ?5 - g - l - b, b, g, l
      FROM (SELECT g, l, MIN(?5 - g - l, ${originHeld('bought')}) AS b
        FROM (SELECT g, MIN(?5 - g, ${originHeld(LOOSE_ORIGIN)}) AS l FROM (SELECT MIN(?5, ${originHeld('gold')}) AS g)))
      WHERE COALESCE((SELECT SUM(qty) FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND material = ?4), 0) >= ?5
        AND (?8 = 0 OR ${carriedSql('?1', '?2', '?4')} + ?5 <= ?9)`)
      .bind(player.id, character, rid, key, qty, nowS, nonce, carrying ? 1 : 0, CARRIED_MAX),
    // BAG1: counted as carried, each origin as it left - BEFORE the spend, whose unbruised clamp reads the own units the
    // Stores and the count hold together: counted after it, a withdrawn unbruised herb lost its count at the spend. AUDIT
    // BAG-CRAFT A1: never the loose units - the service never handed them out, and back in the pack they are as they were
    ...(carrying ? ['own', 'bought', 'gold'].map((o) => db.prepare(`INSERT INTO prof_carried (player, char_id, material, origin, qty)
      SELECT player, char_id, material, '${o}', ${o} FROM prof_withdrawals WHERE player = ?1 AND rid = ?2 AND n = ?3 AND carry = 1 AND ${o} > 0
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = prof_carried.qty + excluded.qty`).bind(player.id, rid, nonce)) : []),
    // GOLD-MARKET: every origin goes to the pack - gold's first (the goods the wall keeps out of everything else); AUDIT
    // BAG-CRAFT A1: the loose units next, walled the other way
    ...spendOrigins(db, {
      player: player.id, character, materialSql: '?3', qtySql: '?4',
      guard: 'EXISTS (SELECT 1 FROM prof_withdrawals WHERE player = ?1 AND rid = ?5 AND n = ?6)', binds: [key, qty, rid, nonce],
      order: ['gold', LOOSE_ORIGIN, 'bought', 'own'],
    }),
  ]);
  const made = await db.prepare('SELECT * FROM prof_withdrawals WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (made?.n === nonce) return answer(made);
  if (made) return answer(made, { repeat: true });
  if (carrying) {
    const s = await storeOf(db, player.id, character, key);
    if ((s.own + s.bought + (s.gold ?? 0) + (s[LOOSE_ORIGIN] ?? 0)) >= qty) return { error: 'carried-full', material: key };
  }
  return { error: 'stores-short' };
}

// ─── BAG1: A DEPOSIT - WHAT IS CARRIED, INTO THE STORES ─────────────

/**
 * PUT IN: `{ character, material, qty, held, order, rid }` - `qty` carried units of a material into the Stores, each
 * origin as it was (bagLaw.js). The client takes the items out of its bag and pack before it asks, and gives them back
 * on a refusal. `held` is what it held of them BEFORE it took them out: the carried count is first cut to it (never
 * raised), so a pack that holds fewer than the count says - an herb brewed, a log sold to a shop - is believed at
 * once, and a pack that holds more than the count adds nothing: law 3's guarantee, the door open this one way.
 * `order` which origins move first: `all` (the Stores page - gold's, bought, own) or `spend` (a writ's or the market's
 * shortfall, put in just before it spends - bought, own, never gold's). Refused `carried-short` past what the count holds after
 * the cut, `stores-full` past the Stores' 5,000.
 * BAG-CRAFT (FIELD BUGS 2026-10-09d, Mac: "I just want players to also be able to craft from their inventory, not just
 * the store"): `work` - a station's shortfall - moves `spend`'s counted units and then units the count does not hold, as
 * many as `held` names past the count once cut (bagLaw.js looseOrder), into the Stores as loose (LOOSE_ORIGIN - AUDIT
 * BAG-CRAFT A1: a station's alone); the count is not touched for them. Its row's `loose` says them.
 */
export async function depositStores(ctx, player, env, { character, material: key, qty, held, order = 'all', rid, seen = null } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const answer = async (row, extra = {}) => ({
    ok: true, ...extra, material: row.material, qty: Number(row.qty), own: Number(row.own), bought: Number(row.bought), gold: Number(row.gold),
    ...(Number(row.loose) > 0 ? { loose: Number(row.loose) } : {}),   // BAG-CRAFT: what the count did not hold - said where some moved
    store: await storeOf(db, player.id, row.char_id, row.material), carried: await carriedOf(db, player.id, row.char_id, row.material),
  });
  const prior = await db.prepare('SELECT * FROM prof_deposits WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (prior) return answer(prior, { repeat: true });   // before the switch: a deposit made is a deposit answered
  const closed = shut(player, env);
  if (closed) return closed;
  if (!material(key) || !withdrawable(key)) return { error: 'bad-material' };   // a thing with no pack form is never carried
  if (!Number.isSafeInteger(qty) || qty < 1 || qty > DEPOSIT_MAX) return { error: 'bad-qty' };
  if (!heldOk(held)) return { error: 'bad-held' };
  if (!depositOrderOk(order)) return { error: 'bad-deposit-order' };   // the market's `bad-order` is an order's id
  if (await overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S)) return { error: 'prof-rate' };
  const nonce = mintId(rand);
  const seq = DEPOSIT_ORDERS[order];
  const cHeld = (o) => `COALESCE((SELECT qty FROM prof_carried WHERE player = ?1 AND char_id = ?2 AND material = ?4 AND origin = '${o}'), 0)`;
  // what moves of each origin, first to last: each takes what the ones before it left of the deposit
  const take = {};
  let before = '0';
  for (const o of seq) {
    take[o] = `MIN(MAX(0, ?5 - (${before})), ${cHeld(o)})`;
    before = `${before} + ${take[o]}`;
  }
  const of = (o) => take[o] ?? '0';
  // BAG-CRAFT: a station's deposit may move what the client holds past the count (read after the cut, in this batch) too
  const loose = looseOrder(order);
  const movable = `${seq.map(cHeld).join(' + ')}${loose ? ' + MAX(0, ?9 - COALESCE((SELECT SUM(qty) FROM prof_carried WHERE player = ?1 AND char_id = ?2 AND material = ?4), 0))' : ''}`;
  // BAG-CRAFT: the loose part - what the counted origins do not cover of the deposit (none but for `work`)
  const loosePart = loose ? `?5 - (${of('own')}) - (${of('bought')}) - (${of('gold')})` : '0';
  const mine = 'EXISTS (SELECT 1 FROM prof_deposits WHERE player = ?1 AND rid = ?2 AND n = ?3)';
  await db.batch([
    // the count cut to what the client held - only while this request has made nothing (a racing twin of a landed deposit
    // holds the same `held`, and would cut what the first one left)
    ...clampStatements(db, { player: player.id, character, material: key, held, rid, seen: seenOk(seen) ? seen : null,
      twin: 'NOT EXISTS (SELECT 1 FROM prof_deposits WHERE player = ?1 AND rid = ?5)' }),
    // THE DECISION: the count holds the units in the order's origins; the Stores have room; what moves of each, read now
    db.prepare(`INSERT OR IGNORE INTO prof_deposits (player, rid, char_id, material, qty, own, bought, gold, loose, at, n)
      SELECT ?1, ?3, ?2, ?4, ?5, ${of('own')}, ${of('bought')}, ${of('gold')}, ${loosePart}, ?6, ?7
      WHERE ${movable} >= ?5
        AND COALESCE((SELECT SUM(qty) FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND material = ?4), 0) + ?5 <= ?8`)
      .bind(player.id, character, rid, key, qty, nowS, nonce, STORES_MAX, ...(loose ? [held] : [])),   // ?9 bound only where read
    // the units out of the count and into the Stores, each origin as the decision read it
    ...['own', 'bought', 'gold'].flatMap((o) => [
      db.prepare(`UPDATE prof_carried SET qty = qty - (SELECT ${o} FROM prof_deposits WHERE player = ?1 AND rid = ?2 AND n = ?3)
        WHERE player = ?1 AND char_id = ?4 AND material = ?5 AND origin = '${o}' AND ${mine}`).bind(player.id, rid, nonce, character, key),
      db.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty)
        SELECT player, char_id, material, '${o}', ${o} FROM prof_deposits WHERE player = ?1 AND rid = ?2 AND n = ?3 AND ${o} > 0
        ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = prof_stores.qty + excluded.qty`).bind(player.id, rid, nonce),
    ]),
    // AUDIT BAG-CRAFT A1: the loose part into the Stores as loose - a station's alone, never bought
    db.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty)
      SELECT player, char_id, material, '${LOOSE_ORIGIN}', loose FROM prof_deposits WHERE player = ?1 AND rid = ?2 AND n = ?3 AND loose > 0
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = prof_stores.qty + excluded.qty`).bind(player.id, rid, nonce),
    db.prepare('DELETE FROM prof_carried WHERE player = ?1 AND char_id = ?2 AND qty = 0').bind(player.id, character),
  ]);
  const made = await db.prepare('SELECT * FROM prof_deposits WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (made?.n === nonce) return answer(made);
  if (made) return answer(made, { repeat: true });
  const c = await carriedOf(db, player.id, character, key);
  const could = seq.reduce((n, o) => n + (c[o] ?? 0), 0) + (loose ? Math.max(0, held - ((c.own ?? 0) + (c.bought ?? 0) + (c.gold ?? 0))) : 0);
  return could < qty ? { error: 'carried-short', material: key, carried: c } : { error: 'stores-full', material: key };
}

// ─── A SMELT AT A FORGE (PROF0 4.1, 23) ──────────────────────────────

/**
 * A SMELT: `{ character, recipe, count, rid }` - one of the forge's recipes (professionLaw SMELT_RECIPES) `count` times,
 * up to SMELT_MAX; PROF4: or a log burnt at the forge or sawn at the workbench (BURN_RECIPES, SAW_RECIPES - one route,
 * one table, each recipe naming its station, its yield a unit and the choice that raises it). The service cannot see
 * the forge or the workbench (as it cannot see the board): the inputs are the Stores' and their units are the bound.
 * Decided by the smelt's own INSERT: every input held, room in the Stores for the product, the products' origin read in
 * the same statement (an ingot is own only when every unit that made it was - bought units are spent first). Then the
 * inputs out, the products in, and the recipe's XP - Smithing's 10 x the product's tier a unit for a smelt, under the
 * crafter's limit (PROF0 3.2); none for a log's (PROF0 25).
 *
 * PROF11 (PROF0 3.2, 4.5, 9.3, 9.4): AND THE MASON'S BENCH's - Rough Stone cut to Cut Stone (a Quarryman's 1 : 1, a
 * choice at 50) and Mortar mixed ten at a time (professionLaw MASON_RECIPES): a work with a CRAFT's law. Its rank is
 * asked (`prof-rank` - workOpen); `clean` the chisel's report, read only for a work that has the act; its XP Masonry's,
 * 20 x the rank's tier a unit (recipeLaw masonXp - XP follows the rank), half again for a clean chisel, and the first
 * time the character does it Building's first-make share (FIRST-BUDGET, recipeLaw workFirstXp) - read in the
 * decision, as a craft's is, and kept with the row (`first`, `clean`: 0060).
 *
 * DAEDRIC-SMELT (bible/06-Systems/Professions-Arc.md section 53; PROF0 4.1): THE DAEDRIC INGOT - an Ebony Ingot, a Daedra's
 * Heart and a Deadlands Ember a unit (professionLaw SMELT_RECIPES, DAEDRIC_EMBERS). The ember is spent out of the ACCOUNT'S
 * PURSE, as the Sigil Broker spends it (accounts.js buyInsignia, insigniaPurse; egEconomy.js egSink): the decision asks
 * that the account's gates, serpents and Redoubts earned the embers its insignia, the Panoply and the forge have not yet
 * taken, and the same batch adds them to `insignia_spent` - so two smelts pressed at once never spend one ember twice;
 * refused `prof-embers` where the inputs are held and the purse is short (the answer of a smelt made says the purse
 * left, `purse`; a refusal is its word alone, as every route's - index.js). The heart is a CATALYST:
 * it enters only loose (bagLaw.js looseOrder), and its origin never reaches the ingot - an ingot is own, bought or loose
 * as its Ebony Ingot was, its bound the ember the service counts.
 */
export async function smeltAtForge(ctx, player, env, { character, recipe: id, count, clean = false, rid } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const answer = async (row, extra = {}) => {
    const r = smeltRecipe(row.recipe);
    // the track the work is the profession of - AUDIT 32 S5: the weave names none (no XP, no raising choice), and was
    // answered Smithing's
    const prof = r.xp ?? r.more?.profession ?? null;
    return {
      ok: true, ...extra, recipe: row.recipe, count: Number(row.count), own: Number(row.own), bought: Number(row.bought), xp: Number(row.xp),
      ...(Number(row.loose) > 0 ? { loose: Number(row.loose) } : {}),   // AUDIT BAG-CRAFT A1: products made of loose goods, loose
      ...(r.act ? { first: Number(row.first) === 1, clean: Number(row.clean) === 1 } : {}),   // PROF11: a mason's work's first and its chisel
      ...(r.embers ? { embers: workEmbers(r, Number(row.count)), purse: await emberPurse(db, player.id) } : {}),   // DAEDRIC-SMELT: the embers it spent, the purse left
      track: prof ? trackView(await trackRow(db, player.id, row.char_id, prof), prof, nowS) : null,
      stores: await Promise.all([r.out, ...r.inputs.map((inp) => inp.key)].map((k) => storeOf(db, player.id, row.char_id, k))),
    };
  };
  const prior = await db.prepare('SELECT * FROM prof_smelts WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (prior) return answer(prior, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  const r = smeltRecipe(id);
  if (!r) return { error: 'bad-recipe' };
  if (!Number.isSafeInteger(count) || count < 1 || count > SMELT_MAX) return { error: 'bad-qty' };
  if (await overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S)) return { error: 'prof-rate' };
  const out = material(r.out);
  // the crafter's limit, read from the character's crafts as they stand
  const { results: tracks = [] } = await db.prepare('SELECT * FROM prof_tracks WHERE player = ?1 AND char_id = ?2').bind(player.id, character).all();
  const ranks = Object.fromEntries(tracks.map((t) => [t.profession, rankOfXp(Number(t.xp))]));
  // PROF3 (FOUND): a Quartermaster's ingots are two a unit (PROF0 3.3) - the choice was offered and the doubling unbuilt;
  // PROF4: the recipe names its yield a unit and the choice that raises it (a Charcoal Burner's, a Timberwright's too);
  // PROF7: at the rank the choice is made at - a Tanner's at 50
  // CRAFT3: each read on its discipline's craft's track (a Quarryman's Building, a Transmuter's Provisioning)
  const specsHere = r.more ? { [r.more.profession]: specsAt(tracks.find((t) => t.profession === trackOf(r.more.profession)), nowS)[workSpecRank(r)] } : {};
  const per = workPer(r, specsHere);
  const rank = ranks[trackOf(r.xp)] ?? 0;
  // PROF12: a transmutation is a Transmuter's (3.3: Alchemy's choice at 100) - asked before anything moves
  if (!workSpecOk(r, r.spec ? specsAt(tracks.find((t) => t.profession === trackOf(r.spec.profession)), nowS) : null)) return { error: 'prof-transmuter' };
  if (!workOpen(r, rank)) return { error: 'prof-rank' };   // PROF11: a mason's work asks its tier's rank (Mortar's 10)
  // PROF11: a mason's work's XP is a craft's (recipeLaw masonXp: the rank's tier a unit, a clean chisel's half again) and
  // its first time's - Building's first-make share (?11, recipeLaw workFirstXp) laid on in the decision; every other work's the smelt's
  const act = r.act ? clean === true : false;
  const cap = r.xp ? String(PROF_XP_MAX) : '0';
  const fx = (/** @type {string} */ full, /** @type {number} */ n) => focusXpSql('?1', '?2', r.xp ?? 'smithing', full, halfXp(n));
  const xp = scaleXp(r.act ? masonXp(count, rank, { clean: act }) : r.xp ? smeltXp(out.tier, count, rank) : 0,   // AUDIT 29 A7: the record's quarter, at the smith's rank
    r.xp ? craftworkPct(xpPct(await firmStatsOf(db, player, env, character), trackOf(r.xp)), await inCraftwork(db, player.id, character, trackOf(r.xp))) : 0);   // FIRM1: the Firmament's hand on the craft's XP; CRAFTWORK: half
  const nonce = mintId(rand);
  // ?1 player ?2 character ?3 rid ?4 recipe ?5 count ?6 out ?7 STORES_MAX ?8 xp ?9 now ?10 nonce ?11 the first time's XP
  // (PROF11: a mason's work's; 0 for every other) ?12 the chisel clean; the inputs ?13 on, two a one; DAEDRIC-SMELT: then
  // the embers, where the work spends any
  const binds = [player.id, character, rid, r.id, count, r.out, STORES_MAX, xp, nowS, nonce, workFirstXp(r), act ? 1 : 0];   // FIRST-BUDGET: a work's first Building's first-make share (recipeLaw workFirstXp - none for a smelt's)
  const held = [], boughtOf = [], looseOf = [];
  r.inputs.forEach((inp, i) => {
    const k = `?${13 + 2 * i}`, need = `?${14 + 2 * i}`;
    binds.push(inp.key, inp.n * count);
    held.push(`${workableSql('?1', '?2', k)} >= ${need}`);   // GOLD-MARKET: never gold's units; AUDIT BAG-CRAFT A1: a station's loose ones too
    if (inp.catalyst) return;   // DAEDRIC-SMELT: a catalyst's units give the products no origin (professionLaw smeltOrigin)
    const unitsOf = (o) => `COALESCE((SELECT qty FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND material = ${k} AND origin = '${o}'), 0)`;
    // the products bought: the most any input's bought units reach, product by product (professionLaw smeltOrigin) - AUDIT
    // BAG-CRAFT A1: past its loose ones, which go first; and the products loose, the most any input's loose units reach
    boughtOf.push(`((MIN(${unitsOf(LOOSE_ORIGIN)} + ${unitsOf('bought')}, ${need}) + ${inp.n} - 1) / ${inp.n})`);
    looseOf.push(`((MIN(${unitsOf(LOOSE_ORIGIN)}, ${need}) + ${inp.n} - 1) / ${inp.n})`);
  });
  const most = (list) => (list.length > 1 ? `MAX(${list.join(', ')})` : list[0]);
  const bought = most(boughtOf), loose = most(looseOf);   // `bought` the products loose or bought, `loose` the loose ones
  // DAEDRIC-SMELT: the embers the work spends, and the purse that must hold them - the Broker's own reading (accounts.js
  // buyInsignia: what the account's kills earned less what its insignia, the Panoply and the forge already took)
  const embers = workEmbers(r, count);
  if (embers > 0) {
    binds.push(embers);
    held.push(`(SELECT ${EMBERS_EARNED_SQL} - insignia_spent FROM players WHERE id = ?1) >= ?${binds.length}`);
  }
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO prof_smelts (player, rid, char_id, recipe, count, own, bought, loose, xp, at, n, first, clean)
      SELECT ?1, ?3, ?2, ?4, ?5, ${per} * (?5 - MIN(?5, ${bought})), ${per} * (MIN(?5, ${bought}) - MIN(?5, ${loose})), ${per} * MIN(?5, ${loose}),
        MAX(0, MIN(${fx('?8', xp)} + f * ${fx('?11', workFirstXp(r))}, ${cap} - COALESCE((SELECT xp FROM prof_tracks WHERE player = ?1 AND char_id = ?2 AND profession = '${trackOf(r.xp ?? 'smithing')}'), 0))), ?9, ?10, f, ?12
      FROM (SELECT CASE WHEN ?11 > 0 AND NOT EXISTS (SELECT 1 FROM prof_smelts WHERE player = ?1 AND char_id = ?2 AND recipe = ?4) THEN 1 ELSE 0 END AS f)
      WHERE ${held.join(' AND ')}
        AND COALESCE((SELECT SUM(qty) FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND material = ?6), 0) + ${per} * ?5 <= ?7`).bind(...binds),
    // the inputs out, each bought first - AUDIT BAG-CRAFT A1: its loose units before them
    ...r.inputs.flatMap((inp) => workStatements(db, {
      player: player.id, character, materialSql: '?3', qtySql: '?4', guard: 'EXISTS (SELECT 1 FROM prof_smelts WHERE player = ?1 AND rid = ?5 AND n = ?6)',
      binds: [inp.key, inp.n * count, rid, nonce],
    })),
    // DAEDRIC-SMELT: the embers out of the account's purse, by the decision's own row - the Broker's spend (insignia_spent)
    ...(embers > 0 ? [db.prepare(`UPDATE players SET insignia_spent = insignia_spent + ?4
      WHERE id = ?1 AND EXISTS (SELECT 1 FROM prof_smelts WHERE player = ?1 AND rid = ?2 AND n = ?3)`).bind(player.id, rid, nonce, embers)] : []),
    // the products in, own, bought and (AUDIT BAG-CRAFT A1) loose as the decision read them
    ...['own', 'bought', LOOSE_ORIGIN].map((origin) => db.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty)
      SELECT ?1, ?2, ?4, '${origin}', ${origin} FROM prof_smelts WHERE player = ?1 AND rid = ?3 AND n = ?5 AND ${origin} > 0
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = prof_stores.qty + excluded.qty`).bind(player.id, character, rid, r.out, nonce)),
    // the XP the decision credited - a smelt's Smithing; a log's none (PROF0 25)
    ...(r.xp ? [db.prepare(`INSERT INTO prof_tracks (player, char_id, profession, xp, updated_at)
      SELECT ?1, ?2, ?6, MIN(${cap}, xp), ?4 FROM prof_smelts WHERE player = ?1 AND rid = ?3 AND n = ?5
      ON CONFLICT (player, char_id, profession) DO UPDATE SET xp = MAX(prof_tracks.xp, MIN(${cap}, prof_tracks.xp + excluded.xp)), updated_at = excluded.updated_at`)
      .bind(player.id, character, rid, nowS, nonce, trackOf(r.xp))] : []),   // CRAFT3: its craft's track
  ]);
  const made = await db.prepare('SELECT * FROM prof_smelts WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (made?.n === nonce) return answer(made);
  if (made) return answer(made, { repeat: true });
  for (const inp of r.inputs) {
    const st = await storeOf(db, player.id, character, inp.key);
    if (workHeld(st) < inp.n * count) return { error: workHeld(st) + (st.gold ?? 0) >= inp.n * count ? 'stores-gold' : 'stores-short', material: inp.key };   // GOLD-MARKET: short only of what gold bought
  }
  if (embers > 0 && (await emberPurse(db, player.id)) < embers) return { error: 'prof-embers' };   // DAEDRIC-SMELT: the purse short of the embers
  return { error: 'stores-full', material: r.out };
}
/** DAEDRIC-SMELT: the Deadlands Embers account `id`'s purse holds now - accounts.js insigniaPurse's reading, off the row as
 *  it stands (the player read at the request's start predates the smelt's own spend). */
export async function emberPurse(db, id) {
  const r = await db.prepare(`SELECT MAX(0, ${EMBERS_EARNED_SQL} - insignia_spent) AS n FROM players WHERE id = ?1`).bind(id).first();
  return Number(r?.n ?? 0);
}

// ─── A CRAFT AT THE ANVIL (PROF0 9, 24) ──────────────────────────────

/** A provenance id: 16 hex digits from the service's CSPRNG (PROF0 9.1). MASTER-ART: a Master's work's too (masterWork.js). */
export function provenanceId(rand) {
  const b = new Uint8Array(8);
  rand(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
// ─── BUNNYFALL CRAFTING REWORK: THE FOCUS ────────────────────────────

export const CRAFT_TRACKS = FOCUS_TRACKS;
export const focusFrom = (/** @type {any[]} */ rows) => ({ crafts: (rows ?? []).map((r) => r.profession), cost: FOCUS_CHANGE_MARKS });
export async function focusOf(db, player, character) {
  const { results = [] } = await db.prepare('SELECT profession FROM prof_focus WHERE player = ?1 AND char_id = ?2 ORDER BY profession').bind(player, character).all();
  return focusFrom(results);
}
export function focusXpSql(p, c, track, full, half) {
  const own = trackOf(track);
  if (!CRAFT_TRACKS.includes(own)) return full;
  return `(CASE WHEN EXISTS (SELECT 1 FROM prof_focus WHERE player = ${p} AND char_id = ${c} AND profession = '${own}')
    OR COALESCE((SELECT xp FROM prof_tracks WHERE player = ${p} AND char_id = ${c} AND profession = '${own}'), 0) < ${xpForRank(FOCUS_HALF_RANK)}
    THEN ${full} ELSE ${Math.trunc(half)} END)`;
}
// ─── CRAFTWORK ──────────────────────────────────────────────────────

/** Whether a character's skill is in Craftwork. */
export async function inCraftwork(db, player, character, track) {
  if (!CRAFTWORK_TRACKS.includes(track)) return false;
  return !!(await db.prepare('SELECT 1 FROM prof_craftwork WHERE player = ?1 AND char_id = ?2 AND profession = ?3').bind(player, character, track).first());
}
/**
 * ENTER CRAFTWORK: `{ character, profession, rid }` - a Focus craft at rank 100 (CRAFTWORK_TRACKS), once a skill. Its rank
 * and XP go back to 0 and its perks stay; from then on it earns half its XP and its pieces' material effects reach 40%.
 * The rank, the Focus and the once are read in the decision itself; the same `rid` asked again answers what it did.
 */
export async function enterCraftwork(ctx, player, env, { character, profession: asked, rid } = {}) {
  const { db, nowS } = ctx;
  const refused = asks(player, { character, rid }) ?? shut(player, env);
  if (refused) return refused;
  const profession = trackOf(asked);
  if (!CRAFTWORK_TRACKS.includes(profession)) return { error: 'prof-craftwork' };
  const answer = async (extra = {}) => ({ ok: true, ...extra, track: trackView(await trackRow(db, player.id, character, profession), profession, nowS), craftwork: (await db.prepare('SELECT profession FROM prof_craftwork WHERE player = ?1 AND char_id = ?2 ORDER BY profession').bind(player.id, character).all()).results.map((x) => x.profession) });
  const prior = await db.prepare('SELECT char_id, profession FROM prof_craftwork WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (prior) return prior.char_id === character && prior.profession === profession ? answer({ repeat: true }) : { error: 'prof-rid' };
  if (await overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S)) return { error: 'prof-rate' };
  await db.batch([
    // THE DECISION: Master, a Focus craft, never in Craftwork before
    db.prepare(`INSERT OR IGNORE INTO prof_craftwork (player, char_id, profession, rid, at)
      SELECT ?1, ?2, ?3, ?4, ?5 WHERE (SELECT xp FROM prof_tracks WHERE player = ?1 AND char_id = ?2 AND profession = ?3) >= ?6
        AND EXISTS (SELECT 1 FROM prof_focus WHERE player = ?1 AND char_id = ?2 AND profession = ?3)`)
      .bind(player.id, character, profession, rid, nowS, PROF_XP_MAX),
    // the climb again, the perks kept
    db.prepare(`UPDATE prof_tracks SET xp = 0, updated_at = ?5 WHERE player = ?1 AND char_id = ?2 AND profession = ?3
      AND EXISTS (SELECT 1 FROM prof_craftwork WHERE player = ?1 AND char_id = ?2 AND profession = ?3 AND rid = ?4)`)
      .bind(player.id, character, profession, rid, nowS),
  ]);
  const made = await db.prepare('SELECT rid FROM prof_craftwork WHERE player = ?1 AND char_id = ?2 AND profession = ?3').bind(player.id, character, profession).first();
  if (made?.rid !== rid) {
    if (made) return { error: 'prof-craftwork-done' };
    const row = await trackRow(db, player.id, character, profession);
    if (Number(row?.xp ?? 0) < PROF_XP_MAX) return { error: 'prof-rank' };
    return { error: 'prof-focus' };
  }
  return answer();
}

/** The form and picks a piece was made of, as the answer says them, or nothing for a piece made the old way. */
export function picksView(/** @type {unknown} */ text) {
  if (typeof text !== 'string') return {};
  try { const j = JSON.parse(text); return j && typeof j.f === 'string' && j.p && typeof j.p === 'object' ? { form: j.f, picks: j.p } : {}; } catch { return {}; }
}
/**
 * Choose the Focus: `{ character, crafts, rid }` - the crafts to pledge, at most two of the four (craftLaw focusOk).
 * Pledging into a free place costs nothing; dropping a pledged craft costs FOCUS_CHANGE_MARKS silver, once for the whole
 * change. The Marks held and the pledges dropped are read in the decision itself, so a change is paid once. Asking for
 * the Focus already held answers as it stands; the same `rid` asked again answers the change made.
 */
export async function chooseFocus(ctx, player, env, { character, crafts, rid } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = asks(player, { character, rid }) ?? shut(player, env);
  if (refused) return refused;
  if (!focusOk(crafts, CRAFT_TRACKS)) return { error: 'prof-focus' };
  const prior = await db.prepare('SELECT 1 FROM prof_focus_paid WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (prior) return { ok: true, repeat: true, focus: await focusOf(db, player.id, character), balance: await balanceOf(db, player.id) };
  if (await overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S)) return { error: 'prof-rate' };
  const now = await focusOf(db, player.id, character);
  const dropped = now.crafts.filter((c) => !crafts.includes(c));
  const added = crafts.filter((c) => !now.crafts.includes(c));
  if (!dropped.length && !added.length) return { ok: true, focus: now, balance: await balanceOf(db, player.id) };
  const putIn = (/** @type {string} */ c, /** @type {string} */ guard, /** @type {any[]} */ binds) => db.prepare(`INSERT OR IGNORE INTO prof_focus (player, char_id, profession, set_at)
    SELECT ?1, ?2, ?3, ?4 WHERE (SELECT COUNT(*) FROM prof_focus WHERE player = ?1 AND char_id = ?2) < ?5${guard}`).bind(player.id, character, c, nowS, 2, ...binds);
  if (!dropped.length) {
    await db.batch(added.map((c) => putIn(c, '', [])));
  } else {
    if (!marksOpenFor(player, env)) return { error: 'marks-closed' };
    const nonce = mintId(rand);
    const cost = FOCUS_CHANGE_MARKS;
    await db.batch([
      // THE DECISION: the Marks held, and every craft to drop still pledged
      db.prepare(`INSERT OR IGNORE INTO prof_focus_paid (player, rid, char_id, marks, at, n)
        SELECT ?1, ?3, ?2, ?4, ?5, ?6 WHERE COALESCE((SELECT balance FROM marks WHERE account = ?1), 0) >= ?4
          AND (SELECT COUNT(*) FROM prof_focus WHERE player = ?1 AND char_id = ?2 AND profession IN (${dropped.map((_, i) => `?${7 + i}`).join(', ')})) = ${dropped.length}`)
        .bind(player.id, character, rid, cost, nowS, nonce, ...dropped),
      // the Marks burnt, one line named for the change
      db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
        SELECT 'account', ?1, 'burn', NULL, 'focus', marks, ?2, at, ?1, 'focus', rid || ':focus' FROM prof_focus_paid WHERE player = ?1 AND rid = ?3 AND n = ?4`)
        .bind(player.id, utcDay(nowS), rid, nonce),
      ...dropped.map((c) => db.prepare(`DELETE FROM prof_focus WHERE player = ?1 AND char_id = ?2 AND profession = ?3
        AND EXISTS (SELECT 1 FROM prof_focus_paid WHERE player = ?1 AND rid = ?4 AND n = ?5)`).bind(player.id, character, c, rid, nonce)),
      ...added.map((c) => putIn(c, ' AND EXISTS (SELECT 1 FROM prof_focus_paid WHERE player = ?6 AND rid = ?7 AND n = ?8)', [player.id, rid, nonce])),
    ]);
    const made = await db.prepare('SELECT n FROM prof_focus_paid WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
    if (made?.n !== nonce) return { error: (await balanceOf(db, player.id)) < cost ? 'marks-short' : 'prof-focus' };
  }
  return { ok: true, focus: await focusOf(db, player.id, character), balance: await balanceOf(db, player.id) };
}

/** A craft's answer, read back from its row: the pieces it made, each its provenance and its signed record; PROF4:
 *  whether their names carry the maker's mark, and the Stores of what it spent (a Heartwood among them). */
export async function craftAnswer(db, player, row, nowS, extra = {}) {
  const r = recipeById(row.recipe);
  const siege = r?.kind === 'siege';   // SEAT2b part two: a siege work is the Stores' (craftAtAnvil) - no piece, its kit beside the inputs
  const ids = siege ? [] : [row.provenance, row.provenance2].filter(Boolean);
  const { results = [] } = await db.prepare(`SELECT provenance, record, maker, marked, hand, bought_with, picks FROM products WHERE provenance IN (${ids.map((_, i) => `?${i + 1}`).join(', ')})`).bind(...ids).all();
  const by = new Map(results.map((p) => [p.provenance, p]));
  const prof = r?.profession ?? 'smithing';
  const formPicks = picksView(by.get(row.provenance)?.picks);
  // Picked parts can differ from the recipe's inputs; the client needs their Stores counts to plan the next craft.
  const picked = Object.values(formPicks.picks ?? {}).filter((k) => typeof k === 'string');
  // PROF10: and a gemmed piece's Siege-cracked Gems - a Lapidary's may have stood in for its gem (the row keeps no word of it)
  const spent = r ? [...new Set([...r.inputs.map((i) => i.key), ...recipeInputs(r, { heartwood: Number(row.heartwood) === 1 }).map((i) => i.key), ...picked, ...(siege ? [RAM_KIT.key] : []), ...(takesCracked(r) ? [SIEGE_GEM.key] : [])])] : [];
  return {
    ok: true, ...extra, recipe: row.recipe, quality: Number(row.quality), count: Number(row.count), seed: Number(row.seed),
    maker: by.get(row.provenance)?.maker ?? null, marked: Number(by.get(row.provenance)?.marked ?? 0) === 1, xp: Number(row.xp), first: Number(row.first) === 1,
    // CLOTH-GEMS: whether that first laid its share on (AUDIT 32 S1) - WOVEN-PAYS: the decision's own word (`first_paid`,
    // migration 0177); AUDIT WOVEN-PAYS A4: a row from before it read as the decision reads it (`patternMade`) - a judged
    // first laid its share on where its XP holds it, every other first did
    firstPaid: row.first_paid == null ? Number(row.first) === 1 && (!counterMade(r) || Number(row.xp) >= FIRST_MAKE_FLOOR) : Number(row.first_paid) === 1,
    heartwood: Number(row.heartwood) === 1, dye: row.dye == null ? null : Number(row.dye),   // PROF7: a garment's dye
    ...(r?.kind === 'dish' || r?.kind === 'jewel' ? { hand: by.get(row.provenance)?.hand == null ? null : Number(by.get(row.provenance).hand) } : {}),   // PROF9: a dish's cook's hand; PROF10: a piece's jeweller's
    pieces: ids.map((p) => ({ provenance: p, record: by.get(p)?.record ?? null })),
    ...formPicks,
    track: trackView(await trackRow(db, player.id, row.char_id, prof), prof, nowS),
    stores: await Promise.all(spent.map((k) => storeOf(db, player.id, row.char_id, k))),
  };
}

/**
 * A CRAFT: `{ character, recipe, clean, name, heartwood, dye, rid }` - one of the anvil's recipes or, PROF4, the
 * workbench's, or, PROF7, the loom's (net/recipeLaw.js RECIPES; the recipe names its profession). PROF7: `dye` a
 * garment's colour (recipeLaw GARMENT_DYES) - signed into the record, kept on the piece; asked of anything else,
 * refused (`prof-dye`). The service cannot see the anvil, the workbench or the loom (as it cannot see the forge,
 * PROF0 23): the inputs are the Stores' and their units are the bound. The recipe's rank is the
 * character's rank in its profession to reach; a recipe whose slice is to come is refused (`prof-later` - none since SEAT2b
 * part two made the Ram Kit: a siege work, into the Stores, PROF0 4.8). SEAT2b part two: `seat` the town the station stands
 * in - its holder's members craft there a step a tier of its crafting halls better (seatStepsFor).
 * The quality is the service's roll on the margin (9.2), then a step each for the act the client reports clean (the
 * honest bound: one step, 5.1), the family's specialisation, and a Warforged ingot or a Heartwood (one step between
 * them); a Masterwright's points; nothing past Masterwork - a Repair Kit and arrows take none, and a Quartermaster's kit
 * is two. A Heartwood asked stands in for one plank (PROF0 25); a Joiner's furniture takes half the planks. Decided by
 * the craft's own INSERT: every input held. Then the inputs out, bought first; the pieces written, each its provenance
 * id, its signed record (net/productRecord.js) and whether its name carries the maker's mark (a Masterwork's, a Master
 * Joiner's furniture); and the XP - 20 x the recipe's tier, and the character's first of its pattern at its tier its
 * track's first-make share (FIRST-BUDGET, recipeLaw firstCraftXp - none for a recipe made wholly of goods only a
 * counter sells, AUDIT 32 S1), under the crafter's limit (3.2), answered as credited.
 * PROF11: or the mason's bench's carvings - the Sculptor's stone decor (recipeLaw MASONRY_RECIPES), the chisel its act,
 * furniture among the home's things; a character not standing as a Sculptor at 100 is refused (`prof-sculptor`).
 * PROF9: or the fire's dishes (recipeLaw COOKING_RECIPES) - no quality (-1), each serving its own piece (a Cook's two:
 * craftCount), its XP the rank's tier's (cookXp - XP follows the rank), half again for a clean pan, and the cook's hand
 * at 100 (dishHand: a Chef's feast, a Provisioner's dish) signed into the record (`f`) and kept on the piece (`hand`,
 * 0069). The service cannot see the fire (as it cannot see the anvil): the inputs are the Stores' and their units the bound.
 * PROF10: or the jeweller's bench's pieces (recipeLaw JEWELCRAFTING_RECIPES) - DFU's jewellery at a quality, a Master
 * Jeweller's Masterwork points (masterworkSpec), the jeweller's hand at 50 (jewelHand: a Goldsmith's Silver, a Gemcutter's
 * gem) signed into the record (`f`) and kept on the piece (`hand`, 0069's column - no migration); `cracked` a Siege-cracked
 * Gem for the piece's gem, a Lapidary's alone (`prof-lapidary`, 403) and only in a piece that sets one.
 */
/**
 * SEAT2b part two (Seats-Arc 7.5: "members smithing here: quality +1 step" a tier - the Forge's, and the Workshop's and
 * the Apothecary's for theirs): THE STEPS A SEAT'S CRAFTING HALLS GIVE a craft in `profession` at `seat` (a map id - the
 * town the client says its station stands in), where the crafting character's guild holds that seat; nought anywhere
 * else. The service cannot see the anvil (PROF0 23): the place is the client's word, bounded as the clean act's is - the
 * holder's own members alone, its own seat's tiers, nothing past Masterwork (craftQuality).
 */
export async function seatStepsFor(db, player, character, seat, profession, nowS) {
  if (!Number.isSafeInteger(seat) || seat < 0 || seat > 0xffffffff) return 0;
  const held = await db.prepare(`SELECT 1 FROM guild_members m JOIN town_seat_holds h ON h.guild_id = m.guild_id
    WHERE m.player = ? AND m.char_id = ? AND h.key = ?`).bind(player, character, seat).first();
  return held ? stationSteps(profession, await fortTiersOf(db, seat, nowS)) : 0;
}

export const craftAtAnvil = (ctx, player, env, body = {}) => craftCore(ctx, player, env, body, null);

/**
 * BUNNYFALL CRAFTING REWORK, PHASE 2: A CRAFT BY FORM AND PICKS - `{ character, form, picks, clean, name, dye, rid, seat,
 * cracked, mint }` (net/craft/craftLaw.js planOf). It is the craft above with a PLAN: the form and picks resolve to the old
 * recipe the piece is made, signed and sold under; the opened slots charge the Stores what was picked; Potential caps the
 * quality and a craft that is not a Focus cannot reach Masterwork; the XP is the value spent (halved off Focus); no
 * first-make bonus and no crafter's limit. A refusal is `{ error, slot? }`.
 */
export async function makeAtBench(ctx, player, env, body = {}) {
  const plan = planOf(body?.form, body?.picks);
  if (!plan.ok) return plan.slot ? { error: plan.error, slot: plan.slot } : { error: plan.error };
  return craftCore(ctx, player, env, body, plan);
}

export async function craftCore(ctx, player, env, { character, recipe: id, clean, name, heartwood = false, dye = null, rid, seat = null, cracked = false, mint = null, look = null, inspired = 0 } = {}, /** @type {any} */ plan = null) {
  const { db, nowS, rand, subtle } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const prior = await db.prepare('SELECT * FROM prof_crafts WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (prior) return craftAnswer(db, player, prior, nowS, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  const r = plan ? plan.legacy : recipeById(id);
  if (!r) return { error: 'bad-recipe' };
  // BUNNYFALL CRAFTING REWORK: the old station menus are gone - every piece is made at the Bench (by form and picks, its
  // Potential the cap); a recipe asked plainly is the classic cook's dish alone (a kept old craft is answered above by its row)
  if (!plan && r.kind !== 'dish') return { error: 'prof-bench' };
  if (r.later) return { error: 'prof-later' };   // PROF4: a recipe named before its slice (the Ram Kit until SEAT2b part two - none now)
  if (!dyeOk(r, dye)) return { error: 'prof-dye' };   // PROF7: a garment's dye, of its ten - nothing else is dyed
  if (await overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S)) return { error: 'prof-rate' };
  const { results: tracks = [] } = await db.prepare('SELECT * FROM prof_tracks WHERE player = ?1 AND char_id = ?2').bind(player.id, character).all();
  const ranks = Object.fromEntries(tracks.map((t) => [t.profession, rankOfXp(Number(t.xp))]));
  const prof = r.profession;   // the discipline - a hall's steps are its (seatStepsFor)
  const craft = trackOf(prof);   // CRAFT3: the track it is read and raised on - a Ring's Smithing
  const rank = ranks[craft] ?? 0;
  const specs = specsAt(tracks.find((t) => t.profession === craft), nowS);
  if (r.spec && specs[100] !== r.spec) return { error: 'prof-sculptor' };   // PROF11: the stone decor is a Sculptor's (3.3)
  const crack = cracked === true;   // PROF10: a Siege-cracked Gem set as the piece's gem - a Lapidary's (3.3), in a piece that sets one
  if (crack && !(takesCracked(r) && specs[100] === LAPIDARY)) return { error: 'prof-lapidary' };
  if (!recipeOpen(r, rank, specs)) return { error: 'prof-rank' };
  const focus = plan ? (await focusOf(db, player.id, character)).crafts.includes(craft) : true;
  const cap = String(PROF_XP_MAX);
  const wood = !plan && heartwood === true && takesHeartwood(r);
  const inputs = plan ? inputsOf(plan, { joiner: specs[50] === 'joiner', cracked: crack }) : recipeInputs(r, { heartwood: wood, joiner: specs[50] === 'joiner', cracked: crack });
  // SEAT2b part two: the seat's crafting halls' steps, where the crafter's guild holds the town it crafts in (seatStepsFor)
  // PROF12: and a dish's - the Apothecary's step a dish's XP (recipeLaw cookXp: a clean pan's half again, a step each)
  const halls = rollsQuality(r) || r.kind === 'dish' ? await seatStepsFor(db, player.id, character, seat, prof, nowS) : 0;
  const quality = !rollsQuality(r) ? -1   // CRAFT5: a Repair Kit's too - its quality its reach
    : plan ? craftedQuality(plan, { u: dice(rand), rank, clean: clean === true, spec50: specs[50], spec100: specs[100], halls, focus })
      : craftQuality(rollQuality(dice(rand), qualityOdds(rank - r.rank, { masterwright: masterworkSpec(specs[100], r) })), qualitySteps(r, { clean: clean === true, spec50: specs[50], heartwood: wood }) + halls);
  // SEAT2b part two (PROF0 4.8: "690 | Ram Kit | Stores (a siege work)"): A SIEGE WORK goes into the crafter's Stores, never
  // the pack - own or bought as its inputs were spent (bought first, as every spend - so bought where any input held a
  // bought unit: the smelt's rule, professionLaw smeltOrigin, read before the spend), within the Stores' room. AUDIT
  // PROF-541 R2-S5: read INSIDE the kit's own INSERT (boughtAnySql, as B7's bought_with), never before the batch - a
  // bought unit spent or laid in between no longer misnames the kit
  const siege = r.kind === 'siege';
  const count = craftCount(r, specs[100], specs[50]);   // PROF9: a Cook's dish two
  const maker = makerMark(name);   // TEXT-F1: a mark the filter lets stand, or the piece unmarked
  const marked = carriesMark(r, quality, specs[100]) ? 1 : 0;
  const seed = Math.floor(dice(rand) * 4294967296);
  const provs = Array.from({ length: count }, () => provenanceId(rand));
  const key = await signingKey(env, subtle);
  const u = dye ?? null;
  const hand = dishHand(r, specs[100]) ?? jewelHand(r, specs[50]);   // PROF9: a Chef's feast, a Provisioner's dish - the dish's wherever it goes; PROF10: a Goldsmith's Silver, a Gemcutter's gem
  // BUNNYFALL CRAFTING REWORK: the materials' effects, rolled here; The Work's true strikes (inspiration) push the roll up
  const insp = Number.isSafeInteger(inspired) ? Math.max(0, Math.min(24, inspired)) : 0;
  const m4 = plan && MOD_KINDS.includes(r.kind) ? craftModsOf(plan, dice(rand), inspirationOf(insp, workPartsOf(plan)), (await inCraftwork(db, player.id, character, craft)) ? CRAFTWORK_SWING : CRAFT_SWING) : null;   // CRAFTWORK: to 40%
  const mods = m4 ? [m4.h, m4.t, m4.l, m4.a] : null;
  const records = await Promise.all(provs.map((p) => mintProductRecord({ p, s: player.id, h: character, r: r.id, q: quality, m: maker, c: seed, a: marked === 1 && maker !== null, u, f: hand, v: craftMintVersion(mint), x: plan && lookOk(r, look) ? look : null, g: mods }, key, { subtle, nowS })));   // AUDIT 30 L4: the mark signed; PROF7: the dye; PROF9: the hand; CRAFT-PROCS: the law it mints under (its last pass) - AUDIT FB1026d C3: the one its client mints
  const nonce = mintId(rand);
  // ?1 player ?2 character ?3 rid ?4 recipe ?5 quality ?6 count ?7 provenance ?8 provenance2 ?9 seed ?10 the XP before the
  // first craft's ?13 (AUDIT 32 S1: CLOTH-GEMS - laid on a recipe wholly of the counter's goods only where its units are
  // own, `p` in the decision) ?11 now ?12 nonce ?14 the profession ?15 heartwood ?16 the dye; the inputs ?17 on, two a one
  // PROF9: a dish's XP follows the rank, a clean pan's half again (cookXp); every other craft's its tier's (craftXp)
  const pct = craftworkPct(xpPct(await firmStatsOf(db, player, env, character), craft), await inCraftwork(db, player.id, character, craft));
  const xp = scaleXp(r.kind === 'dish' ? cookXp(rank, { clean: clean === true, steps: halls }) : plan ? craftValueXp(plan, inputs, rank, true) : craftXp(r.tier, rank), pct);
  const half = plan ? scaleXp(halfXp(craftValueXp(plan, inputs, rank, true)), pct) : halfXp(xp);
  const focusOnly = quality > NON_FOCUS_QUALITY_MAX && FOCUS_TRACKS.includes(craft);
  const binds = [player.id, character, rid, r.id, quality, count, provs[0], provs[1] ?? null, seed, xp, nowS, nonce, plan ? 0 : firstCraftXp(r, true), craft, wood ? 1 : 0, u];   // FIRST-BUDGET: ?13 its track's first-make share (recipeLaw firstCraftXp, asked as own) - CLOTH-GEMS' `p` says whether the units pay it
  const held = [];
  inputs.forEach((inp, i) => {
    binds.push(inp.key, inp.n);
    held.push(`${workableSql('?1', '?2', `?${17 + 2 * i}`)} >= ?${18 + 2 * i}`);   // GOLD-MARKET: never gold's units; AUDIT BAG-CRAFT A1: a station's loose ones too
  });
  // CRAFT2 (Professions-Arc 41.2): a first craft is its PATTERN AT ITS TIER's (recipeLaw firstCraftKin) - any recipe of it
  // made before (the first Ebony Longsword's after an Adamantium one, a Gold Ruby Ring's after a Gold Ring) and this is
  // none; ?{after the inputs}, the kin's list. It holds AUDIT PROF-541 J7 (a jewel's piece and base) and R2-S7 (a dish
  // either herb's way): both are one pattern at one tier
  // CLOTH-GEMS: the kin ONE bind, a JSON list json_each reads (craftWrits.js's way) - a jewel's pattern at its tier holds
  // every grade of every gem now (a Wand's at tier 6: two woods, 41 gems - 82), past D1's hundred binds one a recipe
  const kin = firstCraftKin(r);
  const madeBefore = `recipe IN (SELECT value FROM json_each(?${binds.length + 1}))`;
  binds.push(JSON.stringify(kin));
  // WOVEN-PAYS (FIELD BUGS 2026-10-26b): A PATTERN S1 JUDGES IS MADE BY THE CRAFT THAT LAID ITS FIRST ON (`first_paid`,
  // migration 0177) - a craft of silver-bought cloth before it lays none on and takes nothing, so the first is still owed
  // to the next craft of it that can pay. A row from before the column (`first_paid` NULL) laid it on where it was the
  // first and its XP holds the share (FIRST_MAKE_FLOOR: no share is under it, and no judged craft's own XP reaches it -
  // tiers 1-2, pinned). Every other recipe's pattern is made by any craft of it, as before (FACT, pinned: no pattern at a
  // tier holds both)
  const patternMade = counterMade(r) ? `${madeBefore} AND ${PAID_FIRST_SQL}` : madeBefore;
  const decided = 'EXISTS (SELECT 1 FROM prof_crafts WHERE player = ?1 AND rid = ?5 AND n = ?6)';
  // AUDIT PROF-541 B7: A PIECE MADE OF BOUGHT GOODS IS BOUGHT - 'marks' (GOLD-MARKET's Drakes, products.bought_with) where
  // any input held a bought unit as the pieces are minted, BEFORE the spends (bought first - the smelt's rule, professionLaw
  // smeltOrigin; a craft spends no gold's units): a piece of the counter's Linen was 'own', and its disenchant's Essence
  // own too - listed for gold over the wall. Read inside the batch, as the decision's own (?13 on: the inputs' keys)
  // (AUDIT PROF-541 R2-S5: `at` the first input key's bind - the kit's statement binds them from ?6)
  // AUDIT BAG-CRAFT A1: AND A PIECE MADE OF LOOSE GOODS IS WALLED TO GOLD - 'gold' where any input held a loose unit (spent
  // first): the service never saw those goods, and a piece made of them lists as a pack's piece does (MARKET-ANY: for
  // gold alone, never Drakes, no Drakes commission or auction - law 3); a Ram Kit of them is loose, a station's alone
  const anySql = (/** @type {number} */ at, /** @type {string} */ origin) => `${inputs.map((_, i) => `COALESCE((SELECT qty FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND material = ?${at + i} AND origin = '${origin}'), 0) > 0`).join(' OR ') || '0'}`;
  const boughtWith = `CASE WHEN ${anySql(13, LOOSE_ORIGIN)} THEN 'gold' WHEN ${anySql(13, 'bought')} THEN 'marks' END`;
  // FB1020h ESSENCE-LOOSE: and the piece says that its gold wall is its goods', never a purchase (products.loose,
  // migration 0142) - so its disenchant's Essence is loose, a station's, as a smelt's products of loose goods are, and
  // never "bought with gold"
  const looseWall = `CASE WHEN ${anySql(13, LOOSE_ORIGIN)} THEN 1 ELSE 0 END`;
  // AUDIT 32 S1 (CLOTH-GEMS, Professions-Arc 50): a recipe wholly of the goods a counter sells without end (recipeLaw
  // counterMade - Linen and Wool) lays its first's share on (FIRST-BUDGET) only where no bolt it uses counts as bought with
  // silver - WOVEN-PAYS (FIELD BUGS 2026-10-26b, the owner: "Woven cloth pays"; AUDIT WOVEN-PAYS): the cloth's silver count
  // nought (`silverSql`, the inputs' keys at ?17 on), whatever its units' origins - the loom's own cloth of looted, shop-
  // or market-bought goods pays, a guildmate's pays, and a Weavers' bolt set down and picked up again still counts. Every
  // other recipe's first pays (firstCraftPays)
  const silverHeld = inputs.map((_, i) => `${silverSql('?1', '?2', `?${17 + 2 * i}`)} > 0`).join(' OR ') || '0';
  const pays = counterMade(r) ? `CASE WHEN ${silverHeld} THEN 0 ELSE 1 END` : '1';
  if (siege) held.push(`COALESCE((SELECT SUM(qty) FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND material = '${RAM_KIT.key}'), 0) + ?6 <= ${STORES_MAX}`);   // SEAT2b part two: the kit's room
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO prof_crafts (player, rid, char_id, recipe, quality, count, provenance, provenance2, seed, xp, first, at, n, heartwood, dye, first_paid)
      SELECT ?1, ?3, ?2, ?4, ?5, ?6, ?7, ?8, ?9,
        MAX(0, MIN(${focusXpSql('?1', '?2', craft, '?10', half)} + f * p * ${focusXpSql('?1', '?2', craft, '?13', halfXp(plan ? 0 : firstCraftXp(r, true)))}, ${cap} - COALESCE((SELECT xp FROM prof_tracks WHERE player = ?1 AND char_id = ?2 AND profession = ?14), 0))),
        f, ?11, ?12, ?15, ?16, f * p
      FROM (SELECT CASE WHEN EXISTS (SELECT 1 FROM prof_crafts WHERE player = ?1 AND char_id = ?2 AND ${patternMade}) THEN 0 ELSE 1 END AS f, ${pays} AS p)
      WHERE ${held.join(' AND ')}${focusOnly ? ' AND EXISTS (SELECT 1 FROM prof_focus WHERE player = ?1 AND char_id = ?2 AND profession = ?14)' : ''}`).bind(...binds),
    // the pieces, each its provenance id, its owner (this account), its signed record, its mark and (PROF7) its dye -
    // AUDIT PROF-541 B7: and bought where its inputs were, minted BEFORE the inputs go (their bought units read as they stand) -
    // SEAT2b part two: a siege work's kits into the Stores instead
    ...(siege ? [db.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty)
      SELECT ?1, ?2, ?4, CASE WHEN ${anySql(6, LOOSE_ORIGIN)} THEN '${LOOSE_ORIGIN}' WHEN ${anySql(6, 'bought')} THEN 'bought' ELSE 'own' END, count FROM prof_crafts WHERE player = ?1 AND rid = ?3 AND n = ?5
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = prof_stores.qty + excluded.qty`).bind(player.id, character, rid, RAM_KIT.key, nonce, ...inputs.map((inp) => inp.key))]
      : provs.map((p, i) => db.prepare(`INSERT INTO products (provenance, owner, char_id, maker, recipe, template, material, quality, seed, record, made_at, marked, dye, hand, bought_with, loose)
        SELECT ?4, ?1, ?2, ?6, ?7, ?8, ?9, quality, seed, ?10, at, ?11, dye, ?12, ${boughtWith}, ${looseWall} FROM prof_crafts WHERE player = ?1 AND rid = ?3 AND n = ?5`)
        .bind(player.id, character, rid, p, nonce, maker, r.id, r.templateIndex, r.material, records[i], marked, hand, ...inputs.map((inp) => inp.key)))),   // PROF9: a dish's hand (0069)
    // BUNNYFALL CRAFTING REWORK: what the piece was made of, kept beside it (a no-op where the decision refused: no piece)
    ...(plan && !siege ? provs.map((p) => db.prepare('UPDATE products SET picks = ?1 WHERE provenance = ?2 AND owner = ?3')
      .bind(JSON.stringify({ f: plan.form.id, p: plan.picks }), p, player.id)) : []),
    // the inputs out, each bought first - AUDIT BAG-CRAFT A1: its loose units before them
    ...inputs.flatMap((inp) => workStatements(db, {
      player: player.id, character, materialSql: '?3', qtySql: '?4', guard: decided, binds: [inp.key, inp.n, rid, nonce],
    })),
    // WOVEN-PAYS: a cloth's bolts used, off its silver count - after the decision read it
    ...inputs.filter((inp) => JUDGED_CLOTH.includes(inp.key)).flatMap((inp) => silverClothOut(db, {
      player: player.id, character, materialSql: '?3', qtySql: '?4', guard: decided, binds: [inp.key, inp.n, rid, nonce],
    })),
    // the XP the decision credited, to the recipe's track
    db.prepare(`INSERT INTO prof_tracks (player, char_id, profession, xp, updated_at)
      SELECT ?1, ?2, ?6, MIN(${cap}, xp), ?4 FROM prof_crafts WHERE player = ?1 AND rid = ?3 AND n = ?5
      ON CONFLICT (player, char_id, profession) DO UPDATE SET xp = MAX(prof_tracks.xp, MIN(${cap}, prof_tracks.xp + excluded.xp)), updated_at = excluded.updated_at`)
      .bind(player.id, character, rid, nowS, nonce, craft),
  ]);
  const made = await db.prepare('SELECT * FROM prof_crafts WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (made?.n === nonce) return craftAnswer(db, player, made, nowS);
  if (made) return craftAnswer(db, player, made, nowS, { repeat: true });
  if (focusOnly && !(await focusOf(db, player.id, character)).crafts.includes(craft)) return { error: 'prof-focus' };
  for (const inp of inputs) {
    const st = await storeOf(db, player.id, character, inp.key);
    if (workHeld(st) < inp.n) return { error: workHeld(st) + (st.gold ?? 0) >= inp.n ? 'stores-gold' : 'stores-short', material: inp.key };   // GOLD-MARKET
  }
  if (siege) return { error: 'stores-full', material: RAM_KIT.key };   // SEAT2b part two: every input held - the kit's room is what failed
  return { error: 'stores-short' };
}

// ─── CRAFT4: THE TEMPER (Professions-Arc 41.7) ───────────────────────

/** A temper's answer, read back from its row. */
export async function temperAnswer(db, player, row, nowS, extra = {}) {
  const r = recipeById(row.recipe);
  const piece = row.provenance ? await db.prepare('SELECT record FROM products WHERE provenance = ?1').bind(row.provenance).first() : null;
  return {
    ok: true, ...extra, recipe: row.recipe, quality: Number(row.quality), provenance: row.provenance ?? null,
    ...(row.provenance ? { record: piece?.record ?? null } : {}), xp: Number(row.xp),
    track: trackView(await trackRow(db, player.id, row.char_id, r?.profession ?? 'smithing'), r?.profession ?? 'smithing', nowS),
    stores: [await storeOf(db, player.id, row.char_id, row.material)],
  };
}

/**
 * Raises a smithing or outfitting piece by one quality step up to temperCap, spending half the main input.
 * Re-signs crafted provenance records at the new quality.
 */
export async function temperPiece(ctx, player, env, { character, recipe: id, quality, provenance = null, rid } = {}) {
  const { db, nowS, rand, subtle } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const prior = await db.prepare('SELECT * FROM prof_tempers WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (prior) return temperAnswer(db, player, prior, nowS, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  const r = recipeById(id);
  if (!temperableRecipe(r)) return { error: 'prof-temper' };
  if (!temperFrom(quality)) return { error: 'prof-temper-top' };
  if (provenance !== null && (typeof provenance !== 'string' || !PROVENANCE_RE.test(provenance))) return { error: 'bad-piece' };
  if (await overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S)) return { error: 'prof-rate' };
  const { results: tracks = [] } = await db.prepare('SELECT * FROM prof_tracks WHERE player = ?1 AND char_id = ?2').bind(player.id, character).all();
  const ranks = Object.fromEntries(tracks.map((t) => [t.profession, rankOfXp(Number(t.xp))]));
  const craft = trackOf(r.profession);   // Smithing's or Outfitting's
  const rank = ranks[craft] ?? 0;
  if (rank < r.rank) return { error: 'prof-rank' };
  const spec100 = specsAt(tracks.find((t) => t.profession === craft), nowS)[100];
  if (quality + 1 > temperCap(r, rank, spec100)) return { error: 'prof-temper-rank' };
  const offFocusTop = quality + 1 > temperCap(r, rank, spec100, false);
  if (offFocusTop && !(await focusOf(db, player.id, character)).crafts.includes(craft)) return { error: 'prof-focus' };
  let record = null;
  if (provenance !== null) {
    const p = await db.prepare('SELECT * FROM products WHERE provenance = ?1').bind(provenance).first();
    if (!p) return { error: 'prof-no-piece' };
    if (p.owner !== player.id) return { error: 'prof-not-yours' };
    if (p.recipe !== r.id) return { error: 'prof-temper' };
    if (Number(p.quality) !== quality) return { error: 'prof-temper-stale' };
    const c = readProductRecord(p.record);
    if (!c) return { error: 'prof-temper' };
    record = await mintProductRecord({ p: c.p, s: c.s, h: c.h, r: c.r, q: quality + 1, m: c.m, c: c.c, a: c.a === 1, u: c.u ?? null, f: c.f ?? null, v: c.v ?? null }, await signingKey(env, subtle), { subtle, nowS });   // CRAFT-PROCS: the craft's mint version kept - a piece made before mints as it was
  }
  const cost = temperCost(r, quality);   // BUNNYFALL: by the quality reached
  const cap = String(PROF_XP_MAX);
  const xp = scaleXp(temperXp(r, rank), craftworkPct(xpPct(await firmStatsOf(db, player, env, character), craft), await inCraftwork(db, player.id, character, craft)));   // CRAFTWORK: half   // AUDIT UICALM-FIRM1 L2 L3: the Firmament's hand on a temper's XP, as on the anvil's
  const nonce = mintId(rand);
  const decided = 'EXISTS (SELECT 1 FROM prof_tempers WHERE player = ?1 AND rid = ?2 AND n = ?3)';
  // ?1 player ?2 character ?3 rid ?4 recipe ?5 provenance ?6 the quality made ?7 the input ?8 its units ?9 the XP ?10 now
  // ?11 nonce ?12 the craft
  const piece = provenance === null ? '1' : `EXISTS (SELECT 1 FROM products WHERE provenance = ?5 AND owner = ?1 AND recipe = ?4 AND quality = ?6 - 1 AND listed = 0)
      AND NOT EXISTS (SELECT 1 FROM market_deliveries WHERE provenance = ?5 AND collected = 0)
      AND NOT EXISTS (SELECT 1 FROM home_decor WHERE json_extract(item, '$.pv') = ?5)`;
  await db.batch([
    // THE DECISION: the input held (never gold's units), a made piece as asked - and the XP what the track can take
    db.prepare(`INSERT OR IGNORE INTO prof_tempers (player, rid, char_id, recipe, provenance, quality, material, qty, xp, at, n)
      SELECT ?1, ?3, ?2, ?4, ?5, ?6, ?7, ?8,
        MAX(0, MIN(${focusXpSql('?1', '?2', craft, '?9', halfXp(xp))}, ${cap} - COALESCE((SELECT xp FROM prof_tracks WHERE player = ?1 AND char_id = ?2 AND profession = ?12), 0))), ?10, ?11
      WHERE ${workableSql('?1', '?2', '?7')} >= ?8 AND ${piece}${offFocusTop ? ' AND EXISTS (SELECT 1 FROM prof_focus WHERE player = ?1 AND char_id = ?2 AND profession = ?12)' : ''}`)
      .bind(player.id, character, rid, r.id, provenance, quality + 1, cost.key, cost.n, xp, nowS, nonce, craft),
    // a made piece's row at its new quality, its record re-signed - AUDIT BAG-CRAFT A1: walled to gold where the input held a
    // loose unit (spent first), read before the spend - a piece raised with goods the service never handed out lists as a
    // pack's piece does (for gold alone). FB1020h ESSENCE-LOOSE: and the wall named its goods' (products.loose) - unless a
    // gold purchase walled it first, which it stays (both read as the row stood)
    ...(provenance !== null ? [db.prepare(`UPDATE products SET quality = ?4, record = ?5,
        bought_with = CASE WHEN COALESCE((SELECT qty FROM prof_stores WHERE player = ?1 AND char_id = ?7 AND material = ?8 AND origin = '${LOOSE_ORIGIN}'), 0) > 0 THEN 'gold' ELSE bought_with END,
        loose = CASE WHEN COALESCE((SELECT qty FROM prof_stores WHERE player = ?1 AND char_id = ?7 AND material = ?8 AND origin = '${LOOSE_ORIGIN}'), 0) > 0 AND (bought_with IS NOT 'gold' OR loose = 1) THEN 1 ELSE loose END
      WHERE provenance = ?6 AND ${decided}`).bind(player.id, rid, nonce, quality + 1, record, provenance, character, cost.key)] : []),
    // the input out, bought first - AUDIT BAG-CRAFT A1: its loose units before them
    ...workStatements(db, { player: player.id, character, materialSql: '?3', qtySql: '?4', guard: 'EXISTS (SELECT 1 FROM prof_tempers WHERE player = ?1 AND rid = ?5 AND n = ?6)', binds: [cost.key, cost.n, rid, nonce] }),
    // WOVEN-PAYS: a garment's cloth used, off its silver count
    ...(JUDGED_CLOTH.includes(cost.key) ? silverClothOut(db, { player: player.id, character, materialSql: '?3', qtySql: '?4', guard: 'EXISTS (SELECT 1 FROM prof_tempers WHERE player = ?1 AND rid = ?5 AND n = ?6)', binds: [cost.key, cost.n, rid, nonce] }) : []),
    // the XP the decision credited - the craft's
    db.prepare(`INSERT INTO prof_tracks (player, char_id, profession, xp, updated_at)
      SELECT ?1, ?2, ?6, MIN(${cap}, xp), ?4 FROM prof_tempers WHERE player = ?1 AND rid = ?3 AND n = ?5
      ON CONFLICT (player, char_id, profession) DO UPDATE SET xp = MAX(prof_tracks.xp, MIN(${cap}, prof_tracks.xp + excluded.xp)), updated_at = excluded.updated_at`)
      .bind(player.id, character, rid, nowS, nonce, craft),
  ]);
  const made = await db.prepare('SELECT * FROM prof_tempers WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (made?.n === nonce) return temperAnswer(db, player, made, nowS);
  if (made) return temperAnswer(db, player, made, nowS, { repeat: true });
  if (offFocusTop && !(await focusOf(db, player.id, character)).crafts.includes(craft)) return { error: 'prof-focus' };
  if (provenance !== null) {
    const p = await db.prepare('SELECT quality, listed FROM products WHERE provenance = ?1 AND owner = ?2').bind(provenance, player.id).first();
    if (!p) return { error: 'prof-no-piece' };
    if (Number(p.quality) !== quality) return { error: 'prof-temper-stale' };
    const st = await storeOf(db, player.id, character, cost.key);
    if (workHeld(st) >= cost.n) return { error: 'prof-piece-busy' };   // listed, on the road or standing in a home
  }
  const st = await storeOf(db, player.id, character, cost.key);
  return { error: workHeld(st) + (st.gold ?? 0) >= cost.n ? 'stores-gold' : 'stores-short', material: cost.key };
}

// ─── THE SMITH'S STOCK (PROF0 24) ────────────────────────────────────

/**
 * A PURCHASE FROM THE SMITH'S STOCK: `{ character, material, qty, rid }` - `qty` of one of the fittings no profession
 * yields yet (professionLaw SMITH_STOCK), into the Stores as BOUGHT units (a counter's goods, PROF0 4.5 and 7), for
 * Marks burnt - never purse gold (law 3). The service cannot see the forge: it sells wherever it is asked, and the client
 * asks at a smith's; a lie buys the same goods at the same price. Decided by the purchase's own INSERT: the Marks held,
 * the Stores' room; then the Marks line (kind `stock`) and the units, both keyed on its nonce.
 */
export async function buyStock(ctx, player, env, { character, material: key, qty, rid } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const answer = async (row, extra = {}) => ({
    ok: true, ...extra, material: row.material, qty: Number(row.qty), marks: Number(row.marks),
    balance: await balanceOf(db, player.id), store: await storeOf(db, player.id, row.char_id, row.material),
  });
  const prior = await db.prepare('SELECT * FROM prof_stock WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (prior) return answer(prior, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  const s = stockOf(key);
  if (!s) return { error: 'bad-material' };
  if (!Number.isSafeInteger(qty) || qty < 1 || qty > STOCK_MAX) return { error: 'bad-qty' };
  if (!marksOpenFor(player, env)) return { error: 'marks-closed' };
  if (await overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S)) return { error: 'prof-rate' };
  const cost = s.marks * qty;
  const nonce = mintId(rand);
  await db.batch([
    // THE DECISION: the Marks held and the Stores' room
    db.prepare(`INSERT OR IGNORE INTO prof_stock (player, rid, char_id, material, qty, marks, at, n)
      SELECT ?1, ?3, ?2, ?4, ?5, ?6, ?7, ?8
      WHERE COALESCE((SELECT balance FROM marks WHERE account = ?1), 0) >= ?6
        AND COALESCE((SELECT SUM(qty) FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND material = ?4), 0) + ?5 <= ?9`)
      .bind(player.id, character, rid, key, qty, cost, nowS, nonce, STORES_MAX),
    // the Marks burnt - one line, naming the material - and the units in, bought
    // AUDIT 30 S1: the line its own name (a client id cannot hold `:`) and a plain INSERT - under the bare id it clashed
    // with an exchange's or a guild move's line, was dropped, and the stock came free
    db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'account', ?1, 'burn', NULL, 'stock', marks, ?2, at, ?1, material, rid || ':stock' FROM prof_stock WHERE player = ?1 AND rid = ?3 AND n = ?4`)
      .bind(player.id, utcDay(nowS), rid, nonce),
    db.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty)
      SELECT player, char_id, material, 'bought', qty FROM prof_stock WHERE player = ?1 AND rid = ?2 AND n = ?3
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = prof_stores.qty + excluded.qty`).bind(player.id, rid, nonce),
    // WOVEN-PAYS: the Weavers' and the furnisher's cloth, counted bought with silver
    silverClothIn(db, 'SELECT player, char_id, material, qty FROM prof_stock WHERE player = ?1 AND rid = ?2 AND n = ?3', [player.id, rid, nonce]),
  ]);
  const made = await db.prepare('SELECT * FROM prof_stock WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (made?.n === nonce) return answer(made);
  if (made) return answer(made, { repeat: true });
  return { error: (await balanceOf(db, player.id)) < cost ? 'marks-short' : 'stores-full', material: key };
}
