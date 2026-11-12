-- BUNNYFALL COMPANIES (City Charters): up to three Companies holding a regional capital together
-- (src/net/charterLaw.js, server-account/src/charters.js). One Charter a capital (`region` unique); a Company in one
-- Charter at most (`guild_id` the member table's key). A Charter goes with its last Company.
CREATE TABLE IF NOT EXISTS city_charters (
  map_id      INTEGER PRIMARY KEY,
  region      INTEGER NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  founded_by  TEXT NOT NULL,
  founded_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS city_charter_members (
  guild_id    TEXT PRIMARY KEY,
  map_id      INTEGER NOT NULL,
  joined_at   INTEGER NOT NULL,
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
  FOREIGN KEY (map_id) REFERENCES city_charters(map_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_city_charter_members_map ON city_charter_members (map_id);
CREATE TABLE IF NOT EXISTS city_charter_invites (
  map_id      INTEGER NOT NULL,
  guild_id    TEXT NOT NULL,
  by_name     TEXT NOT NULL,
  at          INTEGER NOT NULL,
  PRIMARY KEY (map_id, guild_id),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
  FOREIGN KEY (map_id) REFERENCES city_charters(map_id) ON DELETE CASCADE
);
