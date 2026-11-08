-- BUNNYFALL (2026-11-07): custom paperdolls (src/net/skinLaw.js, server-account/src/skins.js). A skin is two PNGs kept in the
-- saves bucket (`skins/<id>/front`, `skins/<id>/back`) and a row here; staff approve it, and the owner wears one.
CREATE TABLE IF NOT EXISTS skins (
  id          TEXT PRIMARY KEY,
  player      TEXT NOT NULL,
  name        TEXT NOT NULL,
  height      REAL NOT NULL,
  w           INTEGER NOT NULL,
  h           INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  note        TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  reviewed_at INTEGER,
  reviewed_by TEXT
);
CREATE INDEX IF NOT EXISTS skins_player ON skins (player);
CREATE INDEX IF NOT EXISTS skins_status ON skins (status, created_at);
-- the skin an account wears online (none when absent)
CREATE TABLE IF NOT EXISTS skin_worn (
  player  TEXT PRIMARY KEY,
  skin_id TEXT NOT NULL
);
