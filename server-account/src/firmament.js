// @ts-check

import { mintId, overRate } from './accounts.js';
import { prepareRealmRecord, realmActFirst, recordMovedOf, mustChange, dropObjects, dropIfUnnamed } from './realm.js';
import { payFromSave } from '../../src/net/realmGoldLaw.js';
import { isDeveloper } from './titles.js';
import { marksOpenFor, balanceOf } from './marks.js';
import { renownTrackOf, renownCharacterOk } from './renownTracks.js';
import { utcDay } from '../../src/net/marksLaw.js';
import { rankOfXp, PROFESSIONS, PROF_RANK_MAX } from '../../src/net/professionLaw.js';
import {
  starsFor, craftPointsFor, treeFault, unpackTree, packTree, treeDiff, refundSilver, treeStats, pointsLeft, cleanKeys,
  FIRM_RID_RE, REFUND_FREE_BELOW_RENOWN, REFUND_SILVER_PER_STAR, FIRM_RESPEC_GOLD,
} from '../../src/net/firmament/firmamentLaw.js';

export const FIRM_SWITCH = Object.freeze(['off', 'dev', 'on']);
export const firmSwitchOf = (v) => (FIRM_SWITCH.includes(v) ? v : 'off');
export function firmamentOpenFor(player, env) {
  const s = firmSwitchOf(env?.FIRMAMENT_OPEN);
  return s === 'on' || (s === 'dev' && isDeveloper(player, env));
}
export const FIRM_OPS_MAX = 120;
export const FIRM_OPS_WINDOW_S = 3600;
export const FIRM_PACKED_MAX = 16_384;

export const firmStatement = (db, playerId, charId) => db.prepare('SELECT tree FROM firmament WHERE player = ?1 AND char_id = ?2').bind(playerId, charId);
export const firmStatsFrom = (row, player, env) => (firmamentOpenFor(player, env) ? treeStats(unpackTree(row?.tree ?? '')) : {});
export async function firmStatsOf(db, player, env, charId) {
  return firmStatsFrom(await firmStatement(db, player.id, charId).first(), player, env);
}

async function pursesOf(ctx, playerId, charId) {
  const [track, profs, free, craftwork] = await Promise.all([
    renownTrackOf(ctx, playerId, charId),
    ctx.db.prepare('SELECT profession, xp FROM prof_tracks WHERE player = ?1 AND char_id = ?2').bind(playerId, charId).all(),
    ctx.db.prepare('SELECT 1 AS held FROM firmament_free_respec WHERE player = ?1 AND char_id = ?2').bind(playerId, charId).first(),
    ctx.db.prepare('SELECT profession FROM prof_craftwork WHERE player = ?1 AND char_id = ?2').bind(playerId, charId).all(),
  ]);
  const known = new Set(PROFESSIONS.map((p) => p.id));
  /** @type {Record<string, number>} */
  const ranks = {};
  for (const r of profs?.results ?? []) if (known.has(r.profession)) ranks[r.profession] = rankOfXp(Number(r.xp ?? 0));
  const renown = track?.level ?? 1;
  const counted = { ...ranks };
  // A profession in Craftwork restarted at rank 0 after reaching the top rank, so it still counts at the top rank.
  for (const r of craftwork?.results ?? []) if (known.has(r.profession)) counted[r.profession] = PROF_RANK_MAX;
  return { renown, stars: starsFor(renown), craft: craftPointsFor(Object.values(counted)), ranks, freeRespec: !!free };
}

function view(tree, purses, extra = {}) {
  return {
    tree: packTree(tree), renown: purses.renown, stars: purses.stars, craft: purses.craft, ranks: purses.ranks,
    left: pointsLeft(tree.keys, purses.stars, purses.craft), freeRespec: purses.freeRespec === true,
    refund: { freeBelow: REFUND_FREE_BELOW_RENOWN, perStar: REFUND_SILVER_PER_STAR, respecGold: FIRM_RESPEC_GOLD },
    ...extra,
  };
}

const shut = (player, env) => (firmamentOpenFor(player, env) ? null : { error: 'firm-closed' });

export async function firmamentState(ctx, player, env, body = {}) {
  const character = body?.character;
  if (!renownCharacterOk(character)) return { error: 'firm-character' };
  const closed = shut(player, env);
  if (closed) return closed;
  const [row, purses] = await Promise.all([firmStatement(ctx.db, player.id, character).first(), pursesOf(ctx, player.id, character)]);
  return view(unpackTree(row?.tree ?? ''), purses);
}

export async function setFirmament(ctx, player, env, body = {}) {
  const { db, nowS, rand } = ctx;
  if (!Number.isSafeInteger(nowS)) throw new TypeError('setFirmament needs an integer epoch-seconds clock');
  const { character, rid } = body ?? {};
  if (!renownCharacterOk(character)) return { error: 'firm-character' };
  if (typeof rid !== 'string' || !FIRM_RID_RE.test(rid)) return { error: 'firm-rid' };
  const prior = await db.prepare('SELECT char_id, tree, silver FROM firmament_sets WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (prior) {
    if (prior.char_id !== character) return { error: 'firm-rid' };
    // A different tree under a used id is refused, so a newer tree is never told that it landed.
    if (typeof body.tree !== 'string' || packTree(unpackTree(body.tree)) !== String(prior.tree ?? '')) return { error: 'firm-rid' };
    const purses = await pursesOf(ctx, player.id, character);
    const now = await firmStatement(db, player.id, character).first();
    return view(unpackTree(now?.tree ?? ''), purses, { repeat: true, silver: Number(prior.silver) });
  }
  const closed = shut(player, env);
  if (closed) return closed;
  if (typeof body.tree !== 'string' || body.tree.length > FIRM_PACKED_MAX) return { error: 'firm-key' };
  const bar = body.tree.indexOf('|');
  const want = body.tree === '' ? { start: null, keys: [] }
    : { start: bar < 0 ? body.tree : body.tree.slice(0, bar), keys: bar < 0 || bar === body.tree.length - 1 ? [] : body.tree.slice(bar + 1).split(',') };
  if (await overRate(ctx, `firm:${player.id}`, FIRM_OPS_MAX, FIRM_OPS_WINDOW_S)) return { error: 'firm-rate' };
  const [row, purses] = await Promise.all([firmStatement(db, player.id, character).first(), pursesOf(ctx, player.id, character)]);
  const fault = treeFault(want, purses.stars, purses.craft);
  if (fault) return { error: fault };
  const next = { start: want.start ?? null, keys: cleanKeys(want.keys) };
  const prevPacked = String(row?.tree ?? '');
  const prev = unpackTree(prevPacked);
  const nextPacked = packTree(next);
  if (nextPacked === packTree(prev)) return view(prev, purses);
  const { removed } = treeDiff(prev, next);
  const silver = refundSilver(prev.start ? removed.length : 0, purses.renown);
  if (silver > 0 && !marksOpenFor(player, env)) return { error: 'marks-closed' };
  const nonce = mintId(rand);
  const stillPrev = 'COALESCE((SELECT tree FROM firmament WHERE player = ?1 AND char_id = ?2), \'\') = ?3';
  await db.batch([
    // A plain INSERT on purpose: OR IGNORE would swallow the CHECK from the balance trigger.
    ...(silver > 0 ? [db.prepare(`INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
      SELECT 'account', ?1, 'burn', NULL, 'firmament', ?4, ?5, ?6, ?1, ?2, ?7
      WHERE COALESCE((SELECT balance FROM marks WHERE account = ?1), 0) >= ?4
        AND ${stillPrev}
        AND NOT EXISTS (SELECT 1 FROM marks_ledger WHERE actor = ?1 AND rid = ?7)
        AND NOT EXISTS (SELECT 1 FROM firmament_sets WHERE player = ?1 AND rid = ?8)`)
      .bind(player.id, character, prevPacked, silver, utcDay(nowS), nowS, `firm:${rid}`, rid)] : []),
    db.prepare(`INSERT OR IGNORE INTO firmament_sets (player, rid, char_id, prev, tree, silver, at, n)
      SELECT ?1, ?4, ?2, ?3, ?5, ?6, ?7, ?8
      WHERE ${stillPrev}
        AND (?6 = 0 OR EXISTS (SELECT 1 FROM marks_ledger WHERE actor = ?1 AND rid = ?9 AND kind = 'firmament'))`)
      .bind(player.id, character, prevPacked, rid, nextPacked, silver, nowS, nonce, `firm:${rid}`),
    db.prepare(`INSERT INTO firmament (player, char_id, tree, updated_at)
      SELECT ?1, ?2, ?3, ?4 FROM firmament_sets WHERE player = ?1 AND rid = ?5 AND n = ?6
      ON CONFLICT (player, char_id) DO UPDATE SET tree = excluded.tree, updated_at = excluded.updated_at`)
      .bind(player.id, character, nextPacked, nowS, rid, nonce),
  ]);
  const made = await db.prepare('SELECT n, char_id, silver FROM firmament_sets WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (made?.n === nonce) {
    return view(next, purses, { silver, ...(silver > 0 ? { balance: await balanceOf(db, player.id) } : {}) });
  }
  if (made) return made.char_id === character ? setFirmament(ctx, player, env, body) : { error: 'firm-rid' };
  if (silver > 0 && (await balanceOf(db, player.id)) < silver) return { error: 'marks-short', silver };
  return { error: 'firm-stale' };
}

export async function respecFirmament(ctx, player, env, body = {}) {
  const { db, nowS, rand } = ctx;
  if (!Number.isSafeInteger(nowS)) throw new TypeError('respecFirmament needs an integer epoch-seconds clock');
  const { character, rid, realm, region } = body ?? {};
  if (!renownCharacterOk(character)) return { error: 'firm-character' };
  if (typeof rid !== 'string' || !FIRM_RID_RE.test(rid)) return { error: 'firm-rid' };
  // The realm record is asked before the repeat, switch, and rate checks.
  // A retry whose answer was lost then sees that its act landed.
  const side = await realmActFirst(db, player.id, character, realm);
  if (side.error) return side;
  const prior = await db.prepare('SELECT char_id, silver FROM firmament_sets WHERE player = ?1 AND rid = ?2').bind(player.id, rid).first();
  if (prior) {
    if (prior.char_id !== character) return { error: 'firm-rid' };
    const now = await firmStatement(db, player.id, character).first();
    return view(unpackTree(now?.tree ?? ''), await pursesOf(ctx, player.id, character), { repeat: true, respec: true });
  }
  const closed = shut(player, env);
  if (closed) return closed;
  if (!side.at) return { error: 'realm-needed' };
  if (await overRate(ctx, `firm:${player.id}`, FIRM_OPS_MAX, FIRM_OPS_WINDOW_S)) return { error: 'firm-rate' };
  const [row, purses] = await Promise.all([firmStatement(db, player.id, character).first(), pursesOf(ctx, player.id, character)]);
  const prevPacked = String(row?.tree ?? '');
  if (!unpackTree(prevPacked).start) return { error: 'firm-respec-empty' };
  const free = purses.freeRespec;
  // The client reserves the gold it expects to pay, so a price that differs from the service price is refused.
  if ((body.free === true) !== free) return { error: 'firm-respec-price' };
  const prep = free ? null : await prepareRealmRecord(ctx, player.id, side.at, (save) => (payFromSave(save, FIRM_RESPEC_GOLD, region ?? null) ? null : 'realm-gold'));
  if (prep?.error) return prep;
  const nonce = mintId(rand);
  try {
    await db.batch([
      ...(prep ? prep.steps : []),
      db.prepare(`INSERT INTO firmament_sets (player, rid, char_id, prev, tree, silver, at, n)
        SELECT ?1, ?4, ?2, ?3, '', 0, ?5, ?6
        WHERE COALESCE((SELECT tree FROM firmament WHERE player = ?1 AND char_id = ?2), '') = ?3`)
        .bind(player.id, character, prevPacked, rid, nowS, nonce),
      mustChange(db),
      ...(free ? [db.prepare('DELETE FROM firmament_free_respec WHERE player = ?1 AND char_id = ?2').bind(player.id, character), mustChange(db)] : []),
      db.prepare("UPDATE firmament SET tree = '', updated_at = ?3 WHERE player = ?1 AND char_id = ?2").bind(player.id, character, nowS),
    ]);
  } catch {
    if (prep) await dropIfUnnamed(db, ctx.bucket, player.id, character, prep.key);
    const moved = await recordMovedOf(db, player.id, side.at);
    if (moved) return moved;
    return { error: 'firm-stale' };
  }
  if (!prep) return view({ start: null, keys: [] }, purses, { respec: true, gold: 0, freeRespec: false });
  await dropObjects(ctx.bucket, [prep.prev]);
  return view({ start: null, keys: [] }, purses, { respec: true, gold: FIRM_RESPEC_GOLD, realm: { seq: prep.seq } });
}

export const FIRM_STATUS = Object.freeze({
  'firm-character': 400, 'firm-rid': 400, 'firm-key': 400, 'firm-start': 400, 'firm-path': 400, 'firm-points': 409,
  'firm-closed': 403, 'firm-rate': 429, 'firm-stale': 409, 'marks-closed': 403, 'marks-short': 409,
  'firm-respec-empty': 409, 'firm-respec-price': 409, 'realm-needed': 400, 'realm-gold': 409, lease: 409, seq: 409, 'no-realm-character': 404, 'no-data': 404, 'no-storage': 503, body: 400,
});
