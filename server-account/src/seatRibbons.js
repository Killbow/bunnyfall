// @ts-check
import { ribbonSeasonOf } from '../../src/net/townSeatLaw.js';
import { ribbonClaimOf } from '../../src/net/heraldryLaw.js';

/** @param {any} db */
export async function ribbonOf(db, playerId, character, season, member = undefined) {
  const n = ribbonSeasonOf(season);
  if (n == null || typeof character !== 'string') return null;
  const r = member !== undefined
    ? (member && member.gid != null && await db.prepare('SELECT 1 FROM town_seat_ribbons WHERE guild_id = ? AND season = ? AND at >= ? LIMIT 1').bind(member.guild_id, n, member.joined_at).first() ? { heraldry: member.heraldry } : null)
    : await db.prepare(`SELECT g.heraldry AS heraldry FROM town_seat_ribbons r
    JOIN guild_members m ON m.guild_id = r.guild_id AND m.player = ? AND m.char_id = ? AND m.joined_at <= r.at
    JOIN guilds g ON g.id = r.guild_id WHERE r.season = ?`).bind(playerId, character, n).first();
  if (!r) return null;
  let h = null;
  try { h = r.heraldry ? JSON.parse(r.heraldry) : null; } catch { h = null; }
  return ribbonClaimOf(h);
}
