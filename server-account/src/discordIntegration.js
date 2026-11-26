import { egBoardOf } from './egHonours.js';
import { skinsGet } from './skins.js';
import { hiddenSince } from './staffHidden.js';

export const DISCORD_BOT_ROUTE = '/v1/integrations/discord';
export const DISCORD_GAME_ROUTE = '/v1/integrations/discord/game';

const snowflake = (value) => typeof value === 'string' && /^\d{17,20}$/.test(value);
const clean = (value, max) => typeof value === 'string'
  ? value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim().slice(0, max)
  : '';
const failure = (error, status = 400) => ({ error, status });
const config = (db) => db.prepare('SELECT channel, floor, delivered FROM discord_tavern_config WHERE id = 1').first();
const visible = 'c.dead_at IS NULL AND coalesce(p.banned_until, 0) <= ? AND p.vanish_on = 0';
const characters = 'FROM realm_characters c JOIN players p ON p.id = c.player';
const encoder = new TextEncoder();

async function hash(value, subtle) {
  const bytes = new Uint8Array(await subtle.digest('SHA-256', encoder.encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function discordBotAuthorized(request, env, subtle) {
  const expected = env.BUNNYFALL_DISCORD_KEY;
  const supplied = request.headers.get('authorization')?.match(/^Bearer (\S{32,256})$/)?.[1];
  if (typeof expected !== 'string' || expected.length < 32 || !supplied) return false;
  const [a, b] = await Promise.all([hash(expected, subtle), hash(supplied, subtle)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

function profile(row) {
  let summary;
  try { summary = JSON.parse(row.summary); } catch {}
  return {
    name: row.name, level: summary?.level ?? null, race: summary?.race ?? null,
    className: summary?.className ?? null, gender: summary?.gender ?? null, face: summary?.face ?? null,
  };
}

async function portrait(db, bucket, row) {
  const skin = await db.prepare(`SELECT s.id FROM skin_worn w JOIN skins s ON s.id = w.skin_id AND s.player = w.player
    WHERE w.player = ? AND s.status = 'approved'`).bind(row.player).first();
  if (!skin) return null;
  const art = await skinsGet({ db, bucket }, { id: null }, { id: skin.id });
  return art.front ?? null;
}

async function lines(db, state, after, gameOnly) {
  const cursor = Number.isSafeInteger(after) ? Math.max(state.floor, after) : state.floor;
  const query = gameOnly ? "AND source = 'game'" : '';
  const subject = gameOnly ? '' : ", CASE WHEN source = 'game' THEN substr(event, 1, instr(event, ':') - 1) END AS sub";
  const rows = await db.prepare(`SELECT id, source, name, text, at ${subject} FROM discord_tavern
    WHERE id > ? AND at >= unixepoch() - 86400 ${query} ORDER BY id LIMIT 50`).bind(cursor).all();
  return { lines: rows.results, cursor: rows.results.at(-1)?.id ?? cursor };
}

async function addLine(db, channel, source, event, name, text, nowS, slowDown = false, discordId = null) {
  const result = await db.prepare(`INSERT OR IGNORE INTO discord_tavern (source,event,name,text,at,discord_id)
    SELECT ?,?,?,?,?,? FROM discord_tavern_config WHERE id = 1 AND channel = ?
    AND NOT EXISTS (SELECT 1 FROM discord_tavern WHERE source = ? AND event LIKE ? AND at > ?)`)
    .bind(source, event, name, text, nowS, discordId, channel, source, slowDown ? event.split(':')[0] + ':%' : event, nowS - 2).run();
  return result.meta.changes > 0;
}

export async function discordBotAction(ctx, env, body) {
  const { primary: db, nowS, subtle } = ctx;
  switch (body.action) {
    case 'player':
    case 'me': {
      const byLink = body.action === 'me';
      const name = clean(body.name, 80);
      if (byLink ? !snowflake(body.discordId) : !name) return failure('input');
      const lookup = byLink
        ? 'c.id = (SELECT character FROM discord_links WHERE discord_id = ? AND player = c.player)'
        : 'c.name = ? COLLATE NOCASE';
      const { results } = await db.prepare(`SELECT c.name, c.summary, c.player ${characters}
        WHERE ${visible} AND ${lookup}`).bind(nowS, byLink ? body.discordId : name).all();
      const rows = [];
      for (const row of results) {
        if (!(await hiddenSince(db, env, row.player))) rows.push(row);
        if (rows.length === 2) break;
      }
      if (!rows.length) return failure(byLink ? 'unlinked' : 'not-found', 404);
      if (rows.length > 1) return failure('ambiguous', 409);
      return { profile: profile(rows[0]), png: body.art === false ? null : await portrait(db, env.SAVES, rows[0]) };
    }
    case 'board': {
      if (['depths', 'descent-alone', 'descent-few', 'descent-company'].includes(body.board)) {
        const result = await egBoardOf({ db, nowS }, null, env);
        const bracket = body.board.slice('descent-'.length);
        const rows = body.board === 'depths' ? result.depths.rows : result.descent[bracket].rows;
        const entries = [];
        for (const row of rows.slice(0, 10)) {
          const players = row.players ?? [row.player];
          const hidden = await Promise.all(players.map((id) => hiddenSince(db, env, id)));
          if (!hidden.some(Boolean)) entries.push({
            name: row.names?.join(', ') ?? row.name, score: row.h, rank: row.rank,
          });
        }
        return { entries, season: result.season };
      }
      const renown = body.board === 'renown';
      if (!renown && body.board !== 'level') return failure('board');
      const score = renown ? 'r.xp' : "CAST(CASE WHEN json_valid(c.summary) THEN json_extract(c.summary, '$.level') END AS INTEGER)";
      const join = renown ? 'JOIN renown_tracks r ON r.player = c.player AND r.char_id = c.id' : '';
      const { results } = await db.prepare(`SELECT c.name, c.player, ${score} AS score ${characters} ${join}
        WHERE ${visible} AND score IS NOT NULL ORDER BY score DESC, c.name COLLATE NOCASE, c.id LIMIT 50`).bind(nowS).all();
      const entries = [];
      for (const row of results) {
        if (!(await hiddenSince(db, env, row.player))) entries.push({ name: row.name, score: row.score });
        if (entries.length === 10) break;
      }
      return { entries };
    }
    case 'link': {
      if (!snowflake(body.discordId)) return failure('input');
      const code = crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase();
      await db.batch([
        db.prepare('DELETE FROM discord_link_codes WHERE expires <= ? OR discord_id = ?').bind(nowS, body.discordId),
        db.prepare('INSERT INTO discord_link_codes VALUES (?, ?, ?)').bind(await hash(code, subtle), body.discordId, nowS + 600),
      ]);
      return { code };
    }
    case 'unlink': {
      if (!snowflake(body.discordId)) return failure('input');
      await db.batch([
        db.prepare('DELETE FROM discord_links WHERE discord_id = ?').bind(body.discordId),
        db.prepare('DELETE FROM discord_link_codes WHERE discord_id = ?').bind(body.discordId),
      ]);
      return { ok: true };
    }
    case 'setup': {
      if (body.channel !== null && !snowflake(body.channel)) return failure('input');
      await db.prepare(`INSERT INTO discord_tavern_config (id,channel,floor,delivered)
        SELECT 1,?,coalesce(max(id),0),coalesce(max(id),0) FROM discord_tavern WHERE 1
        ON CONFLICT(id) DO UPDATE SET channel=excluded.channel,floor=excluded.floor,delivered=excluded.delivered`).bind(body.channel).run();
      return { ok: true };
    }
    case 'status':
      return { channel: (await config(db))?.channel ?? null };
    case 'poll': {
      const state = await config(db);
      if (!state?.channel) return { channel: null, lines: [] };
      if (nowS % 300 < 3) await db.prepare('DELETE FROM discord_tavern WHERE at < ?').bind(nowS - 86400).run();
      const { results: serves } = await db.prepare(`SELECT id, name, patron, drink FROM discord_tavern_serves
        WHERE channel = ? AND message IS NULL AND at >= ? ORDER BY id LIMIT 20`).bind(state.channel, nowS - 86400).all();
      return { channel: state.channel, floor: state.floor, serves, ...(await lines(db, state, state.delivered, true)) };
    }
    case 'ack': {
      if (!Number.isSafeInteger(body.id) || !Number.isSafeInteger(body.floor) || !snowflake(body.channel)) return failure('input');
      await db.prepare(`UPDATE discord_tavern_config SET delivered = max(delivered, ?)
        WHERE channel = ? AND floor = ? AND EXISTS (SELECT 1 FROM discord_tavern WHERE id = ? AND source = 'game')`)
        .bind(body.id, body.channel, body.floor, body.id).run();
      return { ok: true };
    }
    case 'served-message': {
      if (!Number.isSafeInteger(body.id) || !snowflake(body.channel) || !snowflake(body.message)) return failure('input');
      await db.prepare('UPDATE discord_tavern_serves SET message = ? WHERE id = ? AND channel = ? AND message IS NULL')
        .bind(body.message, body.id, body.channel).run();
      return { ok: true };
    }
    case 'tip': {
      if (!snowflake(body.discordId) || !snowflake(body.channel) || !snowflake(body.message)) return failure('input');
      const result = await db.prepare(`INSERT OR IGNORE INTO discord_tavern_tips(serve, discord_id)
        SELECT s.id, ? FROM discord_tavern_serves s JOIN discord_tavern_config c ON c.channel = s.channel
        JOIN realm_characters r ON r.id = s.character AND r.dead_at IS NULL
        WHERE s.channel = ? AND s.message = ? AND s.at >= ?`)
        .bind(body.discordId, body.channel, body.message, nowS - 86400).run();
      return { tipped: result.meta.changes > 0 };
    }
    case 'say': {
      const name = clean(body.name, 48), text = clean(body.text, 250);
      if (!snowflake(body.channel) || !snowflake(body.event) || !name || !text) return failure('input');
      await addLine(db, body.channel, 'discord', body.event, name, text, nowS, false, snowflake(body.discordId) ? body.discordId : null);
      return { ok: true };
    }
    default: return failure('action');
  }
}

export async function discordGameAction(ctx, env, player, body) {
  const { primary: db, nowS, subtle } = ctx;
  if (body.action === 'read') {
    const state = await config(db);
    return state?.channel ? { enabled: true, ...(await lines(db, state, body.after, false)) } : { enabled: false, lines: [] };
  }
  if (typeof body.character !== 'string') return failure('character');
  const row = await db.prepare('SELECT name FROM realm_characters WHERE player = ? AND id = ? AND dead_at IS NULL')
    .bind(player.id, body.character).first();
  if (!row) return failure('character');
  if (body.action === 'link') {
    const code = clean(body.code, 32).toUpperCase();
    if (!/^[0-9A-F]{16}$/.test(code)) return failure('code');
    const digest = await hash(code, subtle);
    const results = await db.batch([
      db.prepare(`INSERT INTO discord_links(discord_id,player,character)
        SELECT discord_id,?,? FROM discord_link_codes WHERE code_hash = ? AND expires > ?
        AND NOT EXISTS (SELECT 1 FROM discord_links WHERE player = ? AND discord_id != discord_link_codes.discord_id)
        ON CONFLICT(discord_id) DO UPDATE SET character = excluded.character WHERE player = excluded.player`)
        .bind(player.id, body.character, digest, nowS, player.id),
      db.prepare('DELETE FROM discord_link_codes WHERE code_hash = ?').bind(digest),
    ]);
    return results[0].meta.changes ? { ok: true } : failure('code-or-existing-link', 409);
  }
  if (body.action !== 'say') return failure('action');
  if (player.muted_until > nowS || player.vanish_on || await hiddenSince(db, env, player.id)) return failure('chat-unavailable', 403);
  const text = clean(body.text, 250);
  if (!text || !/^[0-9a-f-]{36}$/.test(body.event ?? '')) return failure('input');
  const state = await config(db);
  if (!state?.channel) return failure('disabled', 409);
  return await addLine(db, state.channel, 'game', player.id + ':' + body.event, row.name, text, nowS, true)
    ? { ok: true } : failure('slow-down', 429);
}
