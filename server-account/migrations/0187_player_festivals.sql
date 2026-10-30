-- PLAYER-FESTIVALS (2026-10-30): the festivals players host at an innkeeper (src/net/playerFestivalLaw.js).
CREATE TABLE IF NOT EXISTS player_festivals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player TEXT NOT NULL,
  host_name TEXT NOT NULL,
  map_id INTEGER NOT NULL,
  town TEXT NOT NULL,
  name TEXT NOT NULL,
  text TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS player_festivals_ends ON player_festivals (ends_at);
CREATE INDEX IF NOT EXISTS player_festivals_player ON player_festivals (player, ends_at);
CREATE INDEX IF NOT EXISTS player_festivals_town ON player_festivals (map_id, ends_at);
