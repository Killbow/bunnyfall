export const TAVERN_DISCORD_TIP = 5;
const recent = 3600;

export async function tavernDiscordNames(db, nowS, patrons) {
  const state = await db.prepare('SELECT channel, floor FROM discord_tavern_config WHERE id = 1').first();
  if (!state?.channel || !patrons.length) return null;
  const { results } = await db.prepare(`SELECT name, skin FROM (
    SELECT t.name, t.id, row_number() OVER (PARTITION BY t.discord_id ORDER BY t.id DESC) AS latest,
      (SELECT w.skin_id FROM discord_links l JOIN skin_worn w ON w.player = l.player
        JOIN skins s ON s.id = w.skin_id AND s.player = l.player AND s.status = 'approved'
        WHERE l.discord_id = t.discord_id) AS skin
    FROM discord_tavern t WHERE t.source = 'discord' AND t.discord_id IS NOT NULL AND t.id > ? AND t.at >= ?
  ) WHERE latest = 1 ORDER BY id DESC LIMIT 24`).bind(state.floor, nowS - recent).all();
  const chosen = [...new Set(patrons)].sort().slice(0, results.length);
  return { channel: state.channel, floor: state.floor,
    names: Object.fromEntries(chosen.map((patron, index) => [patron, results[index].name])),
    skins: Object.fromEntries(chosen.flatMap((patron, index) => (results[index].skin ? [[patron, results[index].skin]] : []))) };
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
