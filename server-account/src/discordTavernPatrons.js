export const TAVERN_DISCORD_TIP = 5;
const recent = 3600;

export async function tavernDiscordNames(db, nowS, patrons) {
  const state = await db.prepare('SELECT channel, floor FROM discord_tavern_config WHERE id = 1').first();
  if (!state?.channel || !patrons.length) return null;
  const { results } = await db.prepare(`SELECT name FROM (
    SELECT name, id, row_number() OVER (PARTITION BY discord_id ORDER BY id DESC) AS latest
    FROM discord_tavern WHERE source = 'discord' AND discord_id IS NOT NULL AND id > ? AND at >= ?
  ) WHERE latest = 1 ORDER BY id DESC LIMIT 24`).bind(state.floor, nowS - recent).all();
  return { channel: state.channel, floor: state.floor,
    names: Object.fromEntries([...new Set(patrons)].sort().slice(0, results.length)
      .map((patron, index) => [patron, results[index].name])) };
}

export function discordServeStatement(db, audience, character, name, patron, drink, nowS) {
  return db.prepare(`INSERT INTO discord_tavern_serves(channel, character, name, patron, drink, at)
    SELECT channel, ?, ?, ?, ?, ? FROM discord_tavern_config WHERE id = 1 AND channel = ? AND floor = ?`)
    .bind(character, name, patron, drink, nowS, audience.channel, audience.floor);
}

export async function pendingDiscordTips(db, character) {
  return db.prepare(`SELECT count(*) AS n, max(t.id) AS last FROM discord_tavern_tips t
    JOIN discord_tavern_serves s ON s.id = t.serve WHERE s.character = ? AND t.claimed = 0`).bind(character).first();
}

export function collectDiscordTips(db, character, last) {
  return db.prepare(`UPDATE discord_tavern_tips SET claimed = 1 WHERE claimed = 0 AND id <= ?
    AND serve IN (SELECT id FROM discord_tavern_serves WHERE character = ?)`).bind(last, character);
}
