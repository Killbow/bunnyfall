-- BUNNYFALL COMPANIES (territory): the Renown XP each Company's members earned in each region, per seat week. A
-- Company's territory around its hall grows from its hall region's rows (src/net/territoryLaw.js,
-- server-account/src/territory.js). Kept when nothing reads it any more: the rows are small, one a Company a region a week.
CREATE TABLE IF NOT EXISTS company_territory (
  week      INTEGER NOT NULL,
  guild_id  TEXT NOT NULL,
  region    INTEGER NOT NULL,
  xp        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (week, guild_id, region),
  FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_company_territory_guild ON company_territory (guild_id, week);
