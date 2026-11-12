// @ts-check
// BUNNYFALL PROVISIONING (docs/PROVISIONING.md): the service's pot and cauldron. A make is decided by the shared law
// (src/net/provision/provisionLaw.js provPlan) at the character's Provisioning rank, its ingredients spent from the Stores
// in one batch with the decision, its XP credited to Provisioning, the traits it shows learnt for each ingredient that
// carries them, and the make kept in the character's book. The client mints what it made (systems/provItems.js).

import { mintId, overRate } from './accounts.js';
import { asks, shut, trackView, trackRow, storeOf, workableSql, workStatements, workHeld } from './professions.js';
import { rankOfXp, PROF_XP_MAX, PROF_OPS_MAX, PROF_OPS_WINDOW_S, STORES_MAX } from '../../src/net/professionLaw.js';
import { provPlan, provXp, provSig, traitsOf, PREPARES } from '../../src/net/provision/provisionLaw.js';
import { firmStatsOf } from './firmament.js';
import { xpPct, scaleXp } from '../../src/net/firmament/firmamentLaw.js';

const TRACK = 'provisioning';

/** Whether `seat` is a town seat the character's Company holds - its hall's table, where a feast is laid. */
async function atHall(db, player, character, seat) {
  if (!Number.isSafeInteger(seat) || seat < 0 || seat > 0xffffffff) return false;
  return !!(await db.prepare(`SELECT 1 FROM guild_members m JOIN town_seat_holds h ON h.guild_id = m.guild_id
    WHERE m.player = ? AND m.char_id = ? AND h.key = ?`).bind(player, character, seat).first());
}

/** A character's Provisioning: its track, the traits it has learnt and its book. */
export async function provState(ctx, player, env, { character } = {}) {
  const { db, nowS } = ctx;
  const refused = asks(player, { character, needRid: false }) ?? shut(player, env);
  if (refused) return refused;
  const [learnt, book] = await Promise.all([
    db.prepare('SELECT kind, key, trait FROM prov_learnt WHERE player = ?1 AND char_id = ?2').bind(player.id, character).all(),
    db.prepare('SELECT sig, kind, base, keys, name, traits, made, at FROM prov_book WHERE player = ?1 AND char_id = ?2 ORDER BY at DESC LIMIT 400').bind(player.id, character).all(),
  ]);
  const parse = (/** @type {string} */ s) => { try { return JSON.parse(s); } catch { return []; } };
  return {
    ok: true,
    track: trackView(await trackRow(db, player.id, character, TRACK), TRACK, nowS),
    learnt: (learnt.results ?? []).map((r) => `${r.kind}|${r.key}|${r.trait}`),
    book: (book.results ?? []).map((r) => ({ sig: r.sig, kind: r.kind, base: r.base, keys: parse(r.keys), name: r.name, traits: parse(r.traits), made: Number(r.made) })),
  };
}

async function makeAnswer(db, player, row, nowS, extra = {}) {
  const parse = (/** @type {string} */ s) => { try { return JSON.parse(s); } catch { return []; } };
  const keys = parse(row.keys);
  return {
    ok: true, ...extra,
    prov: {
      kind: row.kind, keys, base: row.base, traits: parse(row.traits), name: row.name, potent: Number(row.potent), magnitude: Number(row.magnitude),
      resist: Number(row.resist), minutes: Number(row.minutes), count: Number(row.count), party: Number(row.party) === 1, drink: Number(row.drink) === 1, n: row.n,
    },
    xp: Number(row.xp),
    track: trackView(await trackRow(db, player.id, row.char_id, TRACK), TRACK, nowS),
    stores: await Promise.all([...keys, ...(row.base ? [row.base] : [])].map((k) => storeOf(db, player.id, row.char_id, k))),
  };
}

/**
 * A MAKE: `{ character, kind: 'pot'|'cauldron', keys, base?, simmer?, seat?, rid }`. The ingredients (and the base) one
 * of each, spent from the Stores; refused whole where one is short. `simmer` 0..1, The Simmer's share (the client's word,
 * as a minigame's clean has always been). A feast is a four-ingredient pot at the Company's own hall from rank 75.
 */
export async function provMake(ctx, player, env, { character, kind, keys, base = null, simmer = 0, seat = null, rid } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = asks(player, { character, rid });
  if (refused) return refused;
  const prior = await db.prepare('SELECT * FROM prov_makes WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (prior) return makeAnswer(db, player, prior, nowS, { repeat: true });
  const closed = shut(player, env);
  if (closed) return closed;
  const row = await trackRow(db, player.id, character, TRACK);
  const rank = rankOfXp(Number(row?.xp ?? 0));
  const feast = await atHall(db, player.id, character, seat);
  const plan = /** @type {any} */ (provPlan({ kind, keys, base }, rank, simmer, feast));
  if (!plan.ok) return { error: plan.error };
  if (await overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S)) return { error: 'prof-rate' };
  const inputs = [...plan.keys, ...(plan.base ? [plan.base] : [])].map((key) => ({ key, n: 1 }));
  const xp = scaleXp(provXp(plan), xpPct(await firmStatsOf(db, player, env, character), TRACK));
  const nonce = mintId(rand);
  const held = inputs.map((_, i) => `${workableSql('?1', '?2', `?${21 + i}`)} >= 1`);
  const decided = 'EXISTS (SELECT 1 FROM prov_makes WHERE player = ?1 AND rid = ?3 AND n = ?4)';
  const learnt = plan.keys.flatMap((/** @type {string} */ k) => plan.traits.filter((/** @type {string} */ t) => traitsOf(k, plan.kind).includes(t)).map((/** @type {string} */ t) => [k, t]));
  await db.batch([
    // THE DECISION: every ingredient held
    db.prepare(`INSERT OR IGNORE INTO prov_makes (player, rid, char_id, kind, keys, base, traits, name, potent, magnitude, resist, minutes, count, party, drink, xp, at, n)
      SELECT ?1, ?3, ?2, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16,
        MAX(0, MIN(?17, ${PROF_XP_MAX} - COALESCE((SELECT xp FROM prof_tracks WHERE player = ?1 AND char_id = ?2 AND profession = '${TRACK}'), 0))), ?18, ?4
      WHERE ${held.join(' AND ')}`)
      .bind(player.id, character, rid, nonce, plan.kind, JSON.stringify(plan.keys), plan.base, JSON.stringify(plan.traits), plan.name,
        plan.potent ?? 0, plan.magnitude ?? 0, plan.resistPct ?? 0, plan.minutes ?? 0, plan.count, plan.party ? 1 : 0, plan.drink ? 1 : 0, xp, nowS,
        null, null, ...inputs.map((i) => i.key)),
    // the ingredients out
    ...inputs.flatMap((inp) => workStatements(db, { player: player.id, character, materialSql: '?3', qtySql: '?4', guard: decided.replace('?3', '?5').replace('?4', '?6'), binds: [inp.key, inp.n, rid, nonce] })),
    // the XP
    db.prepare(`INSERT INTO prof_tracks (player, char_id, profession, xp, updated_at)
      SELECT ?1, ?2, '${TRACK}', xp, ?4 FROM prov_makes WHERE player = ?1 AND rid = ?3 AND n = ?5
      ON CONFLICT (player, char_id, profession) DO UPDATE SET xp = MAX(prof_tracks.xp, MIN(${PROF_XP_MAX}, prof_tracks.xp + excluded.xp)), updated_at = excluded.updated_at`)
      .bind(player.id, character, rid, nowS, nonce),
    // what it showed, learnt
    ...learnt.map(([k, t]) => db.prepare(`INSERT OR IGNORE INTO prov_learnt (player, char_id, kind, key, trait)
      SELECT ?1, ?2, ?3, ?4, ?5 WHERE EXISTS (SELECT 1 FROM prov_makes WHERE player = ?1 AND rid = ?6 AND n = ?7)`).bind(player.id, character, plan.kind, k, t, rid, nonce)),
    // and kept in the book
    db.prepare(`INSERT INTO prov_book (player, char_id, sig, kind, base, keys, name, traits, made, at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9 WHERE EXISTS (SELECT 1 FROM prov_makes WHERE player = ?1 AND rid = ?10 AND n = ?11)
      ON CONFLICT (player, char_id, sig) DO UPDATE SET made = prov_book.made + 1, at = excluded.at, name = excluded.name, traits = excluded.traits`)
      .bind(player.id, character, provSig(plan), plan.kind, plan.base, JSON.stringify(plan.keys), plan.name, JSON.stringify(plan.traits), nowS, rid, nonce),
  ]);
  const made = await db.prepare('SELECT * FROM prov_makes WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (made?.n === nonce) return makeAnswer(db, player, made, nowS);
  if (made) return makeAnswer(db, player, made, nowS, { repeat: true });
  for (const inp of inputs) {
    const st = await storeOf(db, player.id, character, inp.key);
    if (workHeld(st) < inp.n) return { error: 'stores-short', material: inp.key };
  }
  return { error: 'stores-short' };
}

/** PREPARING: `{ character, prep: 'flour'|'cheese', count, rid }` - Grain milled to Flour, Milk set to Cheese, in the Stores. */
export async function provPrepare(ctx, player, env, { character, prep, count = 1, rid } = {}) {
  const { db, nowS, rand } = ctx;
  const refused = asks(player, { character, rid }) ?? shut(player, env);
  if (refused) return refused;
  const p = PREPARES.find((x) => x.id === prep);
  if (!p) return { error: 'prov-prep' };
  const n = Number.isSafeInteger(count) ? Math.max(1, Math.min(50, count)) : 1;
  const prior = await db.prepare('SELECT * FROM prov_prepares WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (prior) return { ok: true, repeat: true, prep: prior.prep, count: Number(prior.count), stores: await Promise.all([p.out, ...p.inputs.map((i) => i.key)].map((k) => storeOf(db, player.id, character, k))) };
  if (await overRate(ctx, `prof:${player.id}`, PROF_OPS_MAX, PROF_OPS_WINDOW_S)) return { error: 'prof-rate' };
  const nonce = mintId(rand);
  const held = p.inputs.map((inp, i) => `${workableSql('?1', '?2', `?${7 + i}`)} >= ${inp.n * n}`);
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO prov_prepares (player, rid, char_id, prep, count, at, n)
      SELECT ?1, ?3, ?2, ?4, ?5, ?6, ?10 WHERE ${held.join(' AND ')}
        AND COALESCE((SELECT SUM(qty) FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND material = ?9), 0) + ?5 <= ${STORES_MAX}`)
      .bind(player.id, character, rid, p.id, n, nowS, ...p.inputs.map((i) => i.key), ...Array(Math.max(0, 2 - p.inputs.length)).fill(null), p.out, nonce),
    ...p.inputs.flatMap((inp) => workStatements(db, { player: player.id, character, materialSql: '?3', qtySql: '?4', guard: 'EXISTS (SELECT 1 FROM prov_prepares WHERE player = ?1 AND rid = ?5 AND n = ?6)', binds: [inp.key, inp.n * n, rid, nonce] })),
    db.prepare(`INSERT INTO prof_stores (player, char_id, material, origin, qty)
      SELECT ?1, ?2, ?3, 'own', count FROM prov_prepares WHERE player = ?1 AND rid = ?4 AND n = ?5
      ON CONFLICT (player, char_id, material, origin) DO UPDATE SET qty = prof_stores.qty + excluded.qty`).bind(player.id, character, p.out, rid, nonce),
  ]);
  const made = await db.prepare('SELECT * FROM prov_prepares WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (made?.n !== nonce) return { error: 'stores-short' };
  return { ok: true, prep: p.id, count: n, stores: await Promise.all([p.out, ...p.inputs.map((i) => i.key)].map((k) => storeOf(db, player.id, character, k))) };
}
