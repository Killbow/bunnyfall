-- BUNNYFALL COMPANIES (farms): the map's farm locations a Company has bought (src/net/farmLaw.js,
-- server-account/src/farms.js) - one owner a farm, its crop, its climate and region (for its herbs), and the last UTC
-- day its yield went into the Company Stores; and each day's chores, one a member account a farm a day.
CREATE TABLE IF NOT EXISTS company_farms (
  map_id    INTEGER PRIMARY KEY,
  guild_id  TEXT NOT NULL,
  name      TEXT NOT NULL,
  crop      TEXT NOT NULL,
  climate   INTEGER NOT NULL,
  region    INTEGER NOT NULL,
  day       INTEGER NOT NULL,
  bought_at INTEGER NOT NULL,
  last      TEXT,
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_company_farms_guild ON company_farms (guild_id);
CREATE TABLE IF NOT EXISTS company_farm_chores (
  map_id    INTEGER NOT NULL,
  day       INTEGER NOT NULL,
  account   TEXT NOT NULL,
  name      TEXT NOT NULL,
  PRIMARY KEY (map_id, day, account)
);
