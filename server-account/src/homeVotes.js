// @ts-check
import { accountKind, overRate } from './accounts.js';
import { homeMapIdOk, homeBuildingKeyOk } from '../../src/net/homeLaw.js';
import { homeVoteOk, homeVoteOwnerOk, homeShunned, HOME_VOTES_MAX, HOME_VOTES_WINDOW_S, HOME_VOTE_AGE_S } from '../../src/net/homeVoteLaw.js';

export const INSIDER = `((h.guild_id IS NULL AND h.player = ?)
    OR (h.guild_id IS NOT NULL AND EXISTS (SELECT 1 FROM guild_members g WHERE g.guild_id = h.guild_id AND g.player = ?)))`;
const OWNER = `(CASE WHEN h.guild_id IS NULL THEN h.owner_name ELSE COALESCE((SELECT g.name FROM guilds g WHERE g.id = h.guild_id), h.owner_name) END)`;
const VOTABLE = `EXISTS (SELECT 1 FROM homes h WHERE h.map_id = ? AND h.building_key = ? AND h.deed = 0 AND ${OWNER} = ? AND NOT ${INSIDER})`;

export async function homeScore(db, mapId, buildingKey) {
  const r = await db.prepare('SELECT score FROM homes WHERE map_id = ? AND building_key = ?').bind(mapId, buildingKey).first();
  return Number(r?.score ?? 0);
}

export async function homeShownTo(db, mapId, buildingKey, playerId) {
  return homeShownOf(await homeShownRead(db, mapId, buildingKey, playerId).first());
}
export const homeShownRead = (db, mapId, buildingKey, playerId) => db.prepare(`SELECT h.score AS score, (${INSIDER}
    OR EXISTS (SELECT 1 FROM home_decorators d WHERE d.map_id = h.map_id AND d.building_key = h.building_key AND d.player = ?)) AS insider
  FROM homes h WHERE h.map_id = ? AND h.building_key = ?`)
  .bind(playerId ?? '', playerId ?? '', playerId ?? '', mapId, buildingKey);
export const homeShownOf = (r) => !r || r.insider === 1 || !homeShunned(Number(r.score));

/** @param {{db: any, nowS: number}} ctx @param {any} player
 * @param {{mapId?: unknown, buildingKey?: unknown, vote?: unknown, owner?: unknown}} body */
export async function voteHome({ db, nowS }, player, { mapId, buildingKey, vote, owner } = {}) {
  if (accountKind(player) !== 'linked') return { error: 'homes-need-account' };
  if (!homeMapIdOk(mapId) || !homeBuildingKeyOk(buildingKey) || !homeVoteOk(vote) || (vote !== 0 && !homeVoteOwnerOk(owner))) return { error: 'bad-vote' };
  if (vote !== 0 && !(Number.isSafeInteger(player.registered_at) && player.registered_at <= nowS - HOME_VOTE_AGE_S)) return { error: 'vote-young' };
  if (vote !== 0 && await overRate({ db, nowS }, `vote:${player.id}`, HOME_VOTES_MAX, HOME_VOTES_WINDOW_S)) return { error: 'vote-rate' };
  // A vote lands in one statement only while the home stands with the named owner and the voter is no insider.
  // A sale or a guild join between the read and the write takes no vote.
  const write = vote === 0
    ? db.prepare('DELETE FROM home_votes WHERE map_id = ? AND building_key = ? AND player = ?').bind(mapId, buildingKey, player.id)
    : db.prepare(`INSERT INTO home_votes (map_id, building_key, player, vote, voted_at) SELECT ?, ?, ?, ?, ? WHERE ${VOTABLE}
      ON CONFLICT (map_id, building_key, player) DO UPDATE SET vote = excluded.vote, voted_at = excluded.voted_at`)
      .bind(mapId, buildingKey, player.id, vote, nowS, mapId, buildingKey, owner, player.id, player.id);
  const r = await write.run();
  if (!r?.meta?.changes && vote !== 0) {
    const stands = await db.prepare(`SELECT 1 AS one FROM homes h WHERE h.map_id = ? AND h.building_key = ? AND h.deed = 0 AND ${OWNER} = ?`).bind(mapId, buildingKey, owner).first();
    return { error: stands ? 'vote-own' : 'no-home' };
  }
  return { ok: true, mapId, buildingKey, vote, score: await homeScore(db, mapId, buildingKey) };
}
