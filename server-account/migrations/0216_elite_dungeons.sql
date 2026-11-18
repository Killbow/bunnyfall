-- BUNNYFALL (2026-11-18): daily elite dungeons (src/net/eliteDungeonLaw.js, server-account/src/eliteDungeons.js).
-- Each day's picks, one row an instance (`day:slot`), kept until cleansed; who asked for its summon; the seed the picks
-- are hashed from.
CREATE TABLE IF NOT EXISTS elite_dungeons (
  key          TEXT PRIMARY KEY,
  day          INTEGER NOT NULL,
  slot         INTEGER NOT NULL,
  site         INTEGER NOT NULL,
  region       INTEGER NOT NULL,
  location     INTEGER NOT NULL,
  px           INTEGER NOT NULL,
  py           INTEGER NOT NULL,
  name         TEXT NOT NULL,
  summoned_at  INTEGER,
  summoner     TEXT,
  cleared_at   INTEGER,
  cleared_by   TEXT
);
CREATE INDEX IF NOT EXISTS elite_dungeons_open ON elite_dungeons (cleared_at, day);
CREATE TABLE IF NOT EXISTS elite_dungeon_presence (
  key      TEXT NOT NULL,
  account  TEXT NOT NULL,
  at       INTEGER NOT NULL,
  PRIMARY KEY (key, account)
);
CREATE TABLE IF NOT EXISTS elite_dungeon_seed (
  id    INTEGER PRIMARY KEY CHECK (id = 1),
  seed  INTEGER NOT NULL
);
