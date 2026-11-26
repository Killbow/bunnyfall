// @ts-check
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
import { sawGrades } from '../../src/net/timberLaw.js';   // BUNNYFALL (2026-11-26, caverns): timber grades
import { CARRIED_MAX, DEPOSIT_MAX, DEPOSIT_ORDERS, heldOk, seenOk, depositOrderOk, looseOrder, LOOSE_ORIGIN } from '../../src/net/bagLaw.js';
import { asks, shut, trackView, trackRow, storeOf, silverSql, silverClothIn, silverClothOut, carriedOf } from './profShared.js';
import { spendOrigins, workStatements, workHeld } from './profSpend.js';
import { clampStatements, carriedSql, workableSql, PAID_FIRST_SQL } from './profToday.js';

export async function withdrawStores(ctx, player, env, { character, material: key, qty, rid, carry = false, held = null, seen = null } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const answer = async (row, extra = {}) => ({
    ok: true, ...extra, material: row.material, qty: Number(row.qty), store: await storeOf(db, player.id, row.char_id, row.material),
    ...(Number(row.carry) === 1 ? { carry: true, carried: await carriedOf(db, player.id, row.char_id, row.material) } : {}),
  });
  const prior = await db.prepare('SELECT * FROM prof_withdrawals WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (prior) return answer(prior, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  if (!material(key)) return { error: 'bad-material' };
  if (!withdrawable(key)) return { error: 'prof-no-pack-form' };
  if (!Number.isSafeInteger(qty) || qty < 1 || qty > WITHDRAW_MAX) return { error: 'bad-qty' };
  const carrying = carry === true;
  if (carrying && !heldOk(held)) return { error: 'bad-held' };
  if (await overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S)) return { error: 'prof-rate' };
  const nonce = mintId(rand);
  const originHeld = (o) => `COALESCE((SELECT qty FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND material = ?4 AND origin = '${o}'), 0)`;
  await db.batch([
    // The carried count is cut to `held` only while this request has made nothing, since a racing twin sends the
    // same `held`.
    ...(carrying ? clampStatements(db, { player: player.id, character, material: key, held, rid, seen: seenOk(seen) ? seen : null,
      twin: 'NOT EXISTS (SELECT 1 FROM prof_withdrawals WHERE player = ?1 AND rid = ?5)' }) : []),
    db.prepare(`INSERT OR IGNORE INTO prof_withdrawals (player, rid, char_id, material, qty, at, n, carry, own, bought, gold, loose)
      SELECT ?1, ?3, ?2, ?4, ?5, ?6, ?7, ?8, ?5 - g - l - b, b, g, l
      FROM (SELECT g, l, MIN(?5 - g - l, ${originHeld('bought')}) AS b
        FROM (SELECT g, MIN(?5 - g, ${originHeld(LOOSE_ORIGIN)}) AS l FROM (SELECT MIN(?5, ${originHeld('gold')}) AS g)))
      WHERE COALESCE((SELECT SUM(qty) FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND material = ?4), 0) >= ?5
        AND (?8 = 0 OR ${carriedSql('?1', '?2', '?4')} + ?5 <= ?9)`)
      .bind(player.id, character, rid, key, qty, nowS, nonce, carrying ? 1 : 0, CARRIED_MAX),
    // Units count as carried before the spend, whose unbruised clamp reads own units in the Stores and the carried
    // count together. Loose units are never counted as carried.
    ...(carrying ? ['own', 'bought', 'gold'].map((o) => db.prepare(`INSERT INTO prof_carried (player, char_id, material, origin, qty)
      SELECT player, char_id, material, '${o}', ${o} FROM prof_withdrawals WHERE player = ?1 AND rid = ?2 AND n = ?3 AND carry = 1 AND ${o} > 0
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = prof_carried.qty + excluded.qty`).bind(player.id, rid, nonce)) : []),
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

export async function depositStores(ctx, player, env, { character, material: key, qty, held, order = 'all', rid, seen = null } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const answer = async (row, extra = {}) => ({
    ok: true, ...extra, material: row.material, qty: Number(row.qty), own: Number(row.own), bought: Number(row.bought), gold: Number(row.gold),
    ...(Number(row.loose) > 0 ? { loose: Number(row.loose) } : {}),
    store: await storeOf(db, player.id, row.char_id, row.material), carried: await carriedOf(db, player.id, row.char_id, row.material),
  });
  const prior = await db.prepare('SELECT * FROM prof_deposits WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (prior) return answer(prior, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  if (!material(key) || !withdrawable(key)) return { error: 'bad-material' };
  if (!Number.isSafeInteger(qty) || qty < 1 || qty > DEPOSIT_MAX) return { error: 'bad-qty' };
  if (!heldOk(held)) return { error: 'bad-held' };
  if (!depositOrderOk(order)) return { error: 'bad-deposit-order' };
  if (await overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S)) return { error: 'prof-rate' };
  const nonce = mintId(rand);
  const seq = DEPOSIT_ORDERS[order];
  const cHeld = (o) => `COALESCE((SELECT qty FROM prof_carried WHERE player = ?1 AND char_id = ?2 AND material = ?4 AND origin = '${o}'), 0)`;
  const take = {};
  let before = '0';
  for (const o of seq) {
    take[o] = `MIN(MAX(0, ?5 - (${before})), ${cHeld(o)})`;
    before = `${before} + ${take[o]}`;
  }
  const of = (o) => take[o] ?? '0';
  const loose = looseOrder(order);
  const movable = `${seq.map(cHeld).join(' + ')}${loose ? ' + MAX(0, ?9 - COALESCE((SELECT SUM(qty) FROM prof_carried WHERE player = ?1 AND char_id = ?2 AND material = ?4), 0))' : ''}`;
  const loosePart = loose ? `?5 - (${of('own')}) - (${of('bought')}) - (${of('gold')})` : '0';
  const mine = 'EXISTS (SELECT 1 FROM prof_deposits WHERE player = ?1 AND rid = ?2 AND n = ?3)';
  await db.batch([
    // `held` is what the client held before it took the items out. The carried count is cut down to it, never
    // raised, and only while this request has made nothing.
    ...clampStatements(db, { player: player.id, character, material: key, held, rid, seen: seenOk(seen) ? seen : null,
      twin: 'NOT EXISTS (SELECT 1 FROM prof_deposits WHERE player = ?1 AND rid = ?5)' }),
    db.prepare(`INSERT OR IGNORE INTO prof_deposits (player, rid, char_id, material, qty, own, bought, gold, loose, at, n)
      SELECT ?1, ?3, ?2, ?4, ?5, ${of('own')}, ${of('bought')}, ${of('gold')}, ${loosePart}, ?6, ?7
      WHERE ${movable} >= ?5
        AND COALESCE((SELECT SUM(qty) FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND material = ?4), 0) + ?5 <= ?8`)
      .bind(player.id, character, rid, key, qty, nowS, nonce, STORES_MAX, ...(loose ? [held] : [])),
    ...['own', 'bought', 'gold'].flatMap((o) => [
      db.prepare(`UPDATE prof_carried SET qty = qty - (SELECT ${o} FROM prof_deposits WHERE player = ?1 AND rid = ?2 AND n = ?3)
        WHERE player = ?1 AND char_id = ?4 AND material = ?5 AND origin = '${o}' AND ${mine}`).bind(player.id, rid, nonce, character, key),
      db.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty)
        SELECT player, char_id, material, '${o}', ${o} FROM prof_deposits WHERE player = ?1 AND rid = ?2 AND n = ?3 AND ${o} > 0
        ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = prof_stores.qty + excluded.qty`).bind(player.id, rid, nonce),
    ]),
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

export async function smeltAtForge(ctx, player, env, { character, recipe: id, count, clean = false, rid } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const answer = async (row, extra = {}) => {
    const r = smeltRecipe(row.recipe);
    const prof = r.xp ?? r.more?.profession ?? null;
    return {
      ok: true, ...extra, recipe: row.recipe, count: Number(row.count), own: Number(row.own), bought: Number(row.bought), xp: Number(row.xp),
      ...(Number(row.loose) > 0 ? { loose: Number(row.loose) } : {}),
      ...(r.act ? { first: Number(row.first) === 1, clean: Number(row.clean) === 1 } : {}),
      ...(r.embers ? { embers: workEmbers(r, Number(row.count)), purse: await emberPurse(db, player.id) } : {}),
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
  const { results: tracks = [] } = await db.prepare('SELECT * FROM prof_tracks WHERE player = ?1 AND char_id = ?2').bind(player.id, character).all();
  const ranks = Object.fromEntries(tracks.map((t) => [t.profession, rankOfXp(Number(t.xp))]));
  const specsHere = r.more ? { [r.more.profession]: specsAt(tracks.find((t) => t.profession === trackOf(r.more.profession)), nowS)[workSpecRank(r)] } : {};
  const per = workPer(r, specsHere);
  const rank = ranks[trackOf(r.xp)] ?? 0;
  if (!workSpecOk(r, r.spec ? specsAt(tracks.find((t) => t.profession === trackOf(r.spec.profession)), nowS) : null)) return { error: 'prof-transmuter' };
  if (!workOpen(r, rank)) return { error: 'prof-rank' };
  const act = r.act ? clean === true : false;
  const cap = r.xp ? String(PROF_XP_MAX) : '0';
  const fx = (/** @type {string} */ full, /** @type {number} */ n) => focusXpSql('?1', '?2', r.xp ?? 'smithing', full, halfXp(n));
  const xp = scaleXp(r.act ? masonXp(count, rank, { clean: act }) : r.xp ? smeltXp(out.tier, count, rank) : 0,
    r.xp ? craftworkPct(xpPct(await firmStatsOf(db, player, env, character), trackOf(r.xp)), await inCraftwork(db, player.id, character, trackOf(r.xp))) : 0);
  const nonce = mintId(rand);
  const binds = [player.id, character, rid, r.id, count, r.out, STORES_MAX, xp, nowS, nonce, workFirstXp(r), act ? 1 : 0];
  const held = [], boughtOf = [], looseOf = [];
  r.inputs.forEach((inp, i) => {
    const k = `?${13 + 2 * i}`, need = `?${14 + 2 * i}`;
    binds.push(inp.key, inp.n * count);
    held.push(`${workableSql('?1', '?2', k)} >= ${need}`);
    // A catalyst gives the products no origin.
    if (inp.catalyst) return;
    const unitsOf = (o) => `COALESCE((SELECT qty FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND material = ${k} AND origin = '${o}'), 0)`;
    // Loose and bought units are spent first, so products are bought or loose as far as any input's units reach.
    boughtOf.push(`((MIN(${unitsOf(LOOSE_ORIGIN)} + ${unitsOf('bought')}, ${need}) + ${inp.n} - 1) / ${inp.n})`);
    looseOf.push(`((MIN(${unitsOf(LOOSE_ORIGIN)}, ${need}) + ${inp.n} - 1) / ${inp.n})`);
  });
  const most = (list) => (list.length > 1 ? `MAX(${list.join(', ')})` : list[0]);
  const bought = most(boughtOf), loose = most(looseOf);
  const embers = workEmbers(r, count);
  // Embers leave the account purse in this batch, so two smelts pressed at once never spend one ember twice.
  if (embers > 0) {
    binds.push(embers);
    held.push(`(SELECT ${EMBERS_EARNED_SQL} - insignia_spent FROM players WHERE id = ?1) >= ?${binds.length}`);
  }
  // BUNNYFALL (2026-11-26, caverns): TIMBER GRADES - a saw's own logs, the prime first and the knotty last, a plank more or
  // less each (src/net/timberLaw.js sawGrades); its planks own, and the counts spent with the decision's own row
  let graded = { prime: 0, knotty: 0, extra: 0 };
  if (r.id.startsWith('saw:')) {
    const log = r.inputs[0].key, st = await storeOf(db, player.id, character, log);
    const g = await db.prepare('SELECT prime, knotty FROM prof_log_grades WHERE player = ?1 AND char_id = ?2 AND material = ?3').bind(player.id, character, log).first();
    graded = sawGrades({ count, own: Number(st.own ?? 0), other: Number(st.bought ?? 0) + Number(st[LOOSE_ORIGIN] ?? 0), prime: Number(g?.prime ?? 0), knotty: Number(g?.knotty ?? 0) });
  }
  const extra = Math.trunc(graded.extra);
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO prof_smelts (player, rid, char_id, recipe, count, own, bought, loose, xp, at, n, first, clean)
      SELECT ?1, ?3, ?2, ?4, ?5, ${per} * (?5 - MIN(?5, ${bought})) + ${extra}, ${per} * (MIN(?5, ${bought}) - MIN(?5, ${loose})), ${per} * MIN(?5, ${loose}),
        MAX(0, MIN(${fx('?8', xp)} + f * ${fx('?11', workFirstXp(r))}, ${cap} - COALESCE((SELECT xp FROM prof_tracks WHERE player = ?1 AND char_id = ?2 AND profession = '${trackOf(r.xp ?? 'smithing')}'), 0))), ?9, ?10, f, ?12
      FROM (SELECT CASE WHEN ?11 > 0 AND NOT EXISTS (SELECT 1 FROM prof_smelts WHERE player = ?1 AND char_id = ?2 AND recipe = ?4) THEN 1 ELSE 0 END AS f)
      WHERE ${held.join(' AND ')}
        AND COALESCE((SELECT SUM(qty) FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND material = ?6), 0) + ${per} * ?5 + ${extra} <= ?7`).bind(...binds),
    // BUNNYFALL (caverns): the graded logs the saw spent, off their counts - only where its row was written
    ...(graded.prime + graded.knotty > 0 ? [db.prepare(`UPDATE prof_log_grades SET prime = MAX(0, prime - ?4), knotty = MAX(0, knotty - ?5)
      WHERE player = ?1 AND char_id = ?2 AND material = ?6 AND EXISTS (SELECT 1 FROM prof_smelts WHERE player = ?1 AND rid = ?3 AND n = ?7)`)
      .bind(player.id, character, rid, graded.prime, graded.knotty, r.inputs[0].key, nonce)] : []),
    ...r.inputs.flatMap((inp) => workStatements(db, {
      player: player.id, character, materialSql: '?3', qtySql: '?4', guard: 'EXISTS (SELECT 1 FROM prof_smelts WHERE player = ?1 AND rid = ?5 AND n = ?6)',
      binds: [inp.key, inp.n * count, rid, nonce],
    })),
    ...(embers > 0 ? [db.prepare(`UPDATE players SET insignia_spent = insignia_spent + ?4
      WHERE id = ?1 AND EXISTS (SELECT 1 FROM prof_smelts WHERE player = ?1 AND rid = ?2 AND n = ?3)`).bind(player.id, rid, nonce, embers)] : []),
    ...['own', 'bought', LOOSE_ORIGIN].map((origin) => db.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty)
      SELECT ?1, ?2, ?4, '${origin}', ${origin} FROM prof_smelts WHERE player = ?1 AND rid = ?3 AND n = ?5 AND ${origin} > 0
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = prof_stores.qty + excluded.qty`).bind(player.id, character, rid, r.out, nonce)),
    ...(r.xp ? [db.prepare(`INSERT INTO prof_tracks (player, char_id, profession, xp, updated_at)
      SELECT ?1, ?2, ?6, MIN(${cap}, xp), ?4 FROM prof_smelts WHERE player = ?1 AND rid = ?3 AND n = ?5
      ON CONFLICT (player, char_id, profession) DO UPDATE SET xp = MAX(prof_tracks.xp, MIN(${cap}, prof_tracks.xp + excluded.xp)), updated_at = excluded.updated_at`)
      .bind(player.id, character, rid, nowS, nonce, trackOf(r.xp))] : []),
  ]);
  const made = await db.prepare('SELECT * FROM prof_smelts WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (made?.n === nonce) return answer(made);
  if (made) return answer(made, { repeat: true });
  for (const inp of r.inputs) {
    const st = await storeOf(db, player.id, character, inp.key);
    if (workHeld(st) < inp.n * count) return { error: workHeld(st) + (st.gold ?? 0) >= inp.n * count ? 'stores-gold' : 'stores-short', material: inp.key };
  }
  if (embers > 0 && (await emberPurse(db, player.id)) < embers) return { error: 'prof-embers' };
  return { error: 'stores-full', material: r.out };
}
// Read from the row as it stands, since the player read at the request's start predates this smelt's spend.
export async function emberPurse(db, id) {
  const r = await db.prepare(`SELECT MAX(0, ${EMBERS_EARNED_SQL} - insignia_spent) AS n FROM players WHERE id = ?1`).bind(id).first();
  return Number(r?.n ?? 0);
}

export function provenanceId(rand) {
  const b = new Uint8Array(8);
  rand(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

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

export async function inCraftwork(db, player, character, track) {
  if (!CRAFTWORK_TRACKS.includes(track)) return false;
  return !!(await db.prepare('SELECT 1 FROM prof_craftwork WHERE player = ?1 AND char_id = ?2 AND profession = ?3').bind(player, character, track).first());
}
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
    // The rank and the Focus are read inside the insert, and the track resets only under this request's row.
    db.prepare(`INSERT OR IGNORE INTO prof_craftwork (player, char_id, profession, rid, at)
      SELECT ?1, ?2, ?3, ?4, ?5 WHERE (SELECT xp FROM prof_tracks WHERE player = ?1 AND char_id = ?2 AND profession = ?3) >= ?6
        AND EXISTS (SELECT 1 FROM prof_focus WHERE player = ?1 AND char_id = ?2 AND profession = ?3)`)
      .bind(player.id, character, profession, rid, nowS, PROF_XP_MAX),
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

export function picksView(/** @type {unknown} */ text) {
  if (typeof text !== 'string') return {};
  try { const j = JSON.parse(text); return j && typeof j.f === 'string' && j.p && typeof j.p === 'object' ? { form: j.f, picks: j.p } : {}; } catch { return {}; }
}
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
    // The Marks held and the pledges dropped are read inside the decision, so a change is paid once.
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO prof_focus_paid (player, rid, char_id, marks, at, n)
        SELECT ?1, ?3, ?2, ?4, ?5, ?6 WHERE COALESCE((SELECT balance FROM marks WHERE account = ?1), 0) >= ?4
          AND (SELECT COUNT(*) FROM prof_focus WHERE player = ?1 AND char_id = ?2 AND profession IN (${dropped.map((_, i) => `?${7 + i}`).join(', ')})) = ${dropped.length}`)
        .bind(player.id, character, rid, cost, nowS, nonce, ...dropped),
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

export async function craftAnswer(db, player, row, nowS, extra = {}) {
  const r = recipeById(row.recipe);
  const siege = r?.kind === 'siege';
  const ids = siege ? [] : [row.provenance, row.provenance2].filter(Boolean);
  const { results = [] } = await db.prepare(`SELECT provenance, record, maker, marked, hand, bought_with, picks FROM products WHERE provenance IN (${ids.map((_, i) => `?${i + 1}`).join(', ')})`).bind(...ids).all();
  const by = new Map(results.map((p) => [p.provenance, p]));
  const prof = r?.profession ?? 'smithing';
  const formPicks = picksView(by.get(row.provenance)?.picks);
  const picked = Object.values(formPicks.picks ?? {}).filter((k) => typeof k === 'string');
  const spent = r ? [...new Set([...r.inputs.map((i) => i.key), ...recipeInputs(r, { heartwood: Number(row.heartwood) === 1 }).map((i) => i.key), ...picked, ...(siege ? [RAM_KIT.key] : []), ...(takesCracked(r) ? [SIEGE_GEM.key] : [])])] : [];
  return {
    ok: true, ...extra, recipe: row.recipe, quality: Number(row.quality), count: Number(row.count), seed: Number(row.seed),
    maker: by.get(row.provenance)?.maker ?? null, marked: Number(by.get(row.provenance)?.marked ?? 0) === 1, xp: Number(row.xp), first: Number(row.first) === 1,
    // Rows from before first_paid read as the decision would have read them.
    firstPaid: row.first_paid == null ? Number(row.first) === 1 && (!counterMade(r) || Number(row.xp) >= FIRST_MAKE_FLOOR) : Number(row.first_paid) === 1,
    heartwood: Number(row.heartwood) === 1, dye: row.dye == null ? null : Number(row.dye),
    ...(r?.kind === 'dish' || r?.kind === 'jewel' ? { hand: by.get(row.provenance)?.hand == null ? null : Number(by.get(row.provenance).hand) } : {}),
    pieces: ids.map((p) => ({ provenance: p, record: by.get(p)?.record ?? null })),
    ...formPicks,
    track: trackView(await trackRow(db, player.id, row.char_id, prof), prof, nowS),
    stores: await Promise.all(spent.map((k) => storeOf(db, player.id, row.char_id, k))),
  };
}

export async function seatStepsFor(db, player, character, seat, profession, nowS) {
  if (!Number.isSafeInteger(seat) || seat < 0 || seat > 0xffffffff) return 0;
  // The client names the station town, and only members of the guild that holds that seat gain the hall steps.
  const held = await db.prepare(`SELECT 1 FROM guild_members m JOIN town_seat_holds h ON h.guild_id = m.guild_id
    WHERE m.player = ? AND m.char_id = ? AND h.key = ?`).bind(player, character, seat).first();
  return held ? stationSteps(profession, await fortTiersOf(db, seat, nowS)) : 0;
}

export const craftAtAnvil = (ctx, player, env, body = {}) => craftCore(ctx, player, env, body, null);

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
  if (!plan && r.kind !== 'dish') return { error: 'prof-bench' };
  if (r.later) return { error: 'prof-later' };
  if (!dyeOk(r, dye)) return { error: 'prof-dye' };
  if (await overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S)) return { error: 'prof-rate' };
  const { results: tracks = [] } = await db.prepare('SELECT * FROM prof_tracks WHERE player = ?1 AND char_id = ?2').bind(player.id, character).all();
  const ranks = Object.fromEntries(tracks.map((t) => [t.profession, rankOfXp(Number(t.xp))]));
  const prof = r.profession;
  const craft = trackOf(prof);
  const rank = ranks[craft] ?? 0;
  const specs = specsAt(tracks.find((t) => t.profession === craft), nowS);
  if (r.spec && specs[100] !== r.spec) return { error: 'prof-sculptor' };
  const crack = cracked === true;
  if (crack && !(takesCracked(r) && specs[100] === LAPIDARY)) return { error: 'prof-lapidary' };
  if (!recipeOpen(r, rank, specs)) return { error: 'prof-rank' };
  const focus = plan ? (await focusOf(db, player.id, character)).crafts.includes(craft) : true;
  const cap = String(PROF_XP_MAX);
  const wood = !plan && heartwood === true && takesHeartwood(r);
  const inputs = plan ? inputsOf(plan, { joiner: specs[50] === 'joiner', cracked: crack }) : recipeInputs(r, { heartwood: wood, joiner: specs[50] === 'joiner', cracked: crack });
  const halls = rollsQuality(r) || r.kind === 'dish' ? await seatStepsFor(db, player.id, character, seat, prof, nowS) : 0;
  const quality = !rollsQuality(r) ? -1
    : plan ? craftedQuality(plan, { u: dice(rand), rank, clean: clean === true, spec50: specs[50], spec100: specs[100], halls, focus })
      : craftQuality(rollQuality(dice(rand), qualityOdds(rank - r.rank, { masterwright: masterworkSpec(specs[100], r) })), qualitySteps(r, { clean: clean === true, spec50: specs[50], heartwood: wood }) + halls);
  const siege = r.kind === 'siege';
  const count = craftCount(r, specs[100], specs[50]);
  const maker = makerMark(name);
  const marked = carriesMark(r, quality, specs[100]) ? 1 : 0;
  const seed = Math.floor(dice(rand) * 4294967296);
  const provs = Array.from({ length: count }, () => provenanceId(rand));
  const key = await signingKey(env, subtle);
  const u = dye ?? null;
  const hand = dishHand(r, specs[100]) ?? jewelHand(r, specs[50]);
  const insp = Number.isSafeInteger(inspired) ? Math.max(0, Math.min(24, inspired)) : 0;
  const m4 = plan && MOD_KINDS.includes(r.kind) ? craftModsOf(plan, dice(rand), inspirationOf(insp, workPartsOf(plan)), (await inCraftwork(db, player.id, character, craft)) ? CRAFTWORK_SWING : CRAFT_SWING) : null;
  const mods = m4 ? [m4.h, m4.t, m4.l, m4.a] : null;
  const records = await Promise.all(provs.map((p) => mintProductRecord({ p, s: player.id, h: character, r: r.id, q: quality, m: maker, c: seed, a: marked === 1 && maker !== null, u, f: hand, v: craftMintVersion(mint), x: plan && lookOk(r, look) ? look : null, g: mods }, key, { subtle, nowS })));
  const nonce = mintId(rand);
  const pct = craftworkPct(xpPct(await firmStatsOf(db, player, env, character), craft), await inCraftwork(db, player.id, character, craft));
  const xp = scaleXp(r.kind === 'dish' ? cookXp(rank, { clean: clean === true, steps: halls }) : plan ? craftValueXp(plan, inputs, rank, true) : craftXp(r.tier, rank), pct);
  const half = plan ? scaleXp(halfXp(craftValueXp(plan, inputs, rank, true)), pct) : halfXp(xp);
  const focusOnly = quality > NON_FOCUS_QUALITY_MAX && FOCUS_TRACKS.includes(craft);
  const binds = [player.id, character, rid, r.id, quality, count, provs[0], provs[1] ?? null, seed, xp, nowS, nonce, plan ? 0 : firstCraftXp(r, true), craft, wood ? 1 : 0, u];
  const held = [];
  inputs.forEach((inp, i) => {
    binds.push(inp.key, inp.n);
    held.push(`${workableSql('?1', '?2', `?${17 + 2 * i}`)} >= ?${18 + 2 * i}`);
  });
  const kin = firstCraftKin(r);
  // The pattern's kin goes in as one JSON bind, since a jewel pattern can list more recipes than D1's 100 binds.
  const madeBefore = `recipe IN (SELECT value FROM json_each(?${binds.length + 1}))`;
  binds.push(JSON.stringify(kin));
  const patternMade = counterMade(r) ? `${madeBefore} AND ${PAID_FIRST_SQL}` : madeBefore;
  const decided = 'EXISTS (SELECT 1 FROM prof_crafts WHERE player = ?1 AND rid = ?5 AND n = ?6)';
  const anySql = (/** @type {number} */ at, /** @type {string} */ origin) => `${inputs.map((_, i) => `COALESCE((SELECT qty FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND material = ?${at + i} AND origin = '${origin}'), 0) > 0`).join(' OR ') || '0'}`;
  // Origins are read inside the batch before the spends: any loose input marks the piece as bought with gold,
  // otherwise any bought input marks it as bought with Marks.
  const boughtWith = `CASE WHEN ${anySql(13, LOOSE_ORIGIN)} THEN 'gold' WHEN ${anySql(13, 'bought')} THEN 'marks' END`;
  const looseWall = `CASE WHEN ${anySql(13, LOOSE_ORIGIN)} THEN 1 ELSE 0 END`;
  const silverHeld = inputs.map((_, i) => `${silverSql('?1', '?2', `?${17 + 2 * i}`)} > 0`).join(' OR ') || '0';
  // A counter-made recipe lays its first-make share on only when no bolt it uses counts as bought with silver.
  const pays = counterMade(r) ? `CASE WHEN ${silverHeld} THEN 0 ELSE 1 END` : '1';
  if (siege) held.push(`COALESCE((SELECT SUM(qty) FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND material = '${RAM_KIT.key}'), 0) + ?6 <= ${STORES_MAX}`);
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO prof_crafts (player, rid, char_id, recipe, quality, count, provenance, provenance2, seed, xp, first, at, n, heartwood, dye, first_paid)
      SELECT ?1, ?3, ?2, ?4, ?5, ?6, ?7, ?8, ?9,
        MAX(0, MIN(${focusXpSql('?1', '?2', craft, '?10', half)} + f * p * ${focusXpSql('?1', '?2', craft, '?13', halfXp(plan ? 0 : firstCraftXp(r, true)))}, ${cap} - COALESCE((SELECT xp FROM prof_tracks WHERE player = ?1 AND char_id = ?2 AND profession = ?14), 0))),
        f, ?11, ?12, ?15, ?16, f * p
      FROM (SELECT CASE WHEN EXISTS (SELECT 1 FROM prof_crafts WHERE player = ?1 AND char_id = ?2 AND ${patternMade}) THEN 0 ELSE 1 END AS f, ${pays} AS p)
      WHERE ${held.join(' AND ')}${focusOnly ? ' AND EXISTS (SELECT 1 FROM prof_focus WHERE player = ?1 AND char_id = ?2 AND profession = ?14)' : ''}`).bind(...binds),
    ...(siege ? [db.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty)
      SELECT ?1, ?2, ?4, CASE WHEN ${anySql(6, LOOSE_ORIGIN)} THEN '${LOOSE_ORIGIN}' WHEN ${anySql(6, 'bought')} THEN 'bought' ELSE 'own' END, count FROM prof_crafts WHERE player = ?1 AND rid = ?3 AND n = ?5
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = prof_stores.qty + excluded.qty`).bind(player.id, character, rid, RAM_KIT.key, nonce, ...inputs.map((inp) => inp.key))]
      : provs.map((p, i) => db.prepare(`INSERT INTO products (provenance, owner, char_id, maker, recipe, template, material, quality, seed, record, made_at, marked, dye, hand, bought_with, loose)
        SELECT ?4, ?1, ?2, ?6, ?7, ?8, ?9, quality, seed, ?10, at, ?11, dye, ?12, ${boughtWith}, ${looseWall} FROM prof_crafts WHERE player = ?1 AND rid = ?3 AND n = ?5`)
        .bind(player.id, character, rid, p, nonce, maker, r.id, r.templateIndex, r.material, records[i], marked, hand, ...inputs.map((inp) => inp.key)))),
    ...(plan && !siege ? provs.map((p) => db.prepare('UPDATE products SET picks = ?1 WHERE provenance = ?2 AND owner = ?3')
      .bind(JSON.stringify({ f: plan.form.id, p: plan.picks }), p, player.id)) : []),
    ...inputs.flatMap((inp) => workStatements(db, {
      player: player.id, character, materialSql: '?3', qtySql: '?4', guard: decided, binds: [inp.key, inp.n, rid, nonce],
    })),
    ...inputs.filter((inp) => JUDGED_CLOTH.includes(inp.key)).flatMap((inp) => silverClothOut(db, {
      player: player.id, character, materialSql: '?3', qtySql: '?4', guard: decided, binds: [inp.key, inp.n, rid, nonce],
    })),
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
    if (workHeld(st) < inp.n) return { error: workHeld(st) + (st.gold ?? 0) >= inp.n ? 'stores-gold' : 'stores-short', material: inp.key };
  }
  if (siege) return { error: 'stores-full', material: RAM_KIT.key };
  return { error: 'stores-short' };
}

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
  const craft = trackOf(r.profession);
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
    record = await mintProductRecord({ p: c.p, s: c.s, h: c.h, r: c.r, q: quality + 1, m: c.m, c: c.c, a: c.a === 1, u: c.u ?? null, f: c.f ?? null, v: c.v ?? null }, await signingKey(env, subtle), { subtle, nowS });
  }
  const cost = temperCost(r, quality);
  const cap = String(PROF_XP_MAX);
  const xp = scaleXp(temperXp(r, rank), craftworkPct(xpPct(await firmStatsOf(db, player, env, character), craft), await inCraftwork(db, player.id, character, craft)));
  const nonce = mintId(rand);
  const decided = 'EXISTS (SELECT 1 FROM prof_tempers WHERE player = ?1 AND rid = ?2 AND n = ?3)';
  const piece = provenance === null ? '1' : `EXISTS (SELECT 1 FROM products WHERE provenance = ?5 AND owner = ?1 AND recipe = ?4 AND quality = ?6 - 1 AND listed = 0)
      AND NOT EXISTS (SELECT 1 FROM market_deliveries WHERE provenance = ?5 AND collected = 0)
      AND NOT EXISTS (SELECT 1 FROM home_decor WHERE json_extract(item, '$.pv') = ?5)`;
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO prof_tempers (player, rid, char_id, recipe, provenance, quality, material, qty, xp, at, n)
      SELECT ?1, ?3, ?2, ?4, ?5, ?6, ?7, ?8,
        MAX(0, MIN(${focusXpSql('?1', '?2', craft, '?9', halfXp(xp))}, ${cap} - COALESCE((SELECT xp FROM prof_tracks WHERE player = ?1 AND char_id = ?2 AND profession = ?12), 0))), ?10, ?11
      WHERE ${workableSql('?1', '?2', '?7')} >= ?8 AND ${piece}${offFocusTop ? ' AND EXISTS (SELECT 1 FROM prof_focus WHERE player = ?1 AND char_id = ?2 AND profession = ?12)' : ''}`)
      .bind(player.id, character, rid, r.id, provenance, quality + 1, cost.key, cost.n, xp, nowS, nonce, craft),
    // Loose stock is checked before the spend: a piece tempered with loose goods can be listed only for gold.
    ...(provenance !== null ? [db.prepare(`UPDATE products SET quality = ?4, record = ?5,
        bought_with = CASE WHEN COALESCE((SELECT qty FROM prof_stores WHERE player = ?1 AND char_id = ?7 AND material = ?8 AND origin = '${LOOSE_ORIGIN}'), 0) > 0 THEN 'gold' ELSE bought_with END,
        loose = CASE WHEN COALESCE((SELECT qty FROM prof_stores WHERE player = ?1 AND char_id = ?7 AND material = ?8 AND origin = '${LOOSE_ORIGIN}'), 0) > 0 AND (bought_with IS NOT 'gold' OR loose = 1) THEN 1 ELSE loose END
      WHERE provenance = ?6 AND ${decided}`).bind(player.id, rid, nonce, quality + 1, record, provenance, character, cost.key)] : []),
    ...workStatements(db, { player: player.id, character, materialSql: '?3', qtySql: '?4', guard: 'EXISTS (SELECT 1 FROM prof_tempers WHERE player = ?1 AND rid = ?5 AND n = ?6)', binds: [cost.key, cost.n, rid, nonce] }),
    ...(JUDGED_CLOTH.includes(cost.key) ? silverClothOut(db, { player: player.id, character, materialSql: '?3', qtySql: '?4', guard: 'EXISTS (SELECT 1 FROM prof_tempers WHERE player = ?1 AND rid = ?5 AND n = ?6)', binds: [cost.key, cost.n, rid, nonce] }) : []),
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
    if (workHeld(st) >= cost.n) return { error: 'prof-piece-busy' };
  }
  const st = await storeOf(db, player.id, character, cost.key);
  return { error: workHeld(st) + (st.gold ?? 0) >= cost.n ? 'stores-gold' : 'stores-short', material: cost.key };
}

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
    db.prepare(`INSERT OR IGNORE INTO prof_stock (player, rid, char_id, material, qty, marks, at, n)
      SELECT ?1, ?3, ?2, ?4, ?5, ?6, ?7, ?8
      WHERE COALESCE((SELECT balance FROM marks WHERE account = ?1), 0) >= ?6
        AND COALESCE((SELECT SUM(qty) FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND material = ?4), 0) + ?5 <= ?9`)
      .bind(player.id, character, rid, key, qty, cost, nowS, nonce, STORES_MAX),
    // The line's rid takes a suffix that a client rid cannot hold, so it never clashes with another line.
    db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'account', ?1, 'burn', NULL, 'stock', marks, ?2, at, ?1, material, rid || ':stock' FROM prof_stock WHERE player = ?1 AND rid = ?3 AND n = ?4`)
      .bind(player.id, utcDay(nowS), rid, nonce),
    db.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty)
      SELECT player, char_id, material, 'bought', qty FROM prof_stock WHERE player = ?1 AND rid = ?2 AND n = ?3
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = prof_stores.qty + excluded.qty`).bind(player.id, rid, nonce),
    silverClothIn(db, 'SELECT player, char_id, material, qty FROM prof_stock WHERE player = ?1 AND rid = ?2 AND n = ?3', [player.id, rid, nonce]),
  ]);
  const made = await db.prepare('SELECT * FROM prof_stock WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (made?.n === nonce) return answer(made);
  if (made) return answer(made, { repeat: true });
  return { error: (await balanceOf(db, player.id)) < cost ? 'marks-short' : 'stores-full', material: key };
}
