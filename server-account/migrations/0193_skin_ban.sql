-- BUNNYFALL (2026-11-07): custom paperdolls switched off for one player by staff (server-account/src/skins.js). A disabled
-- account cannot upload or wear a skin, and nobody is shown the ones it owns.
CREATE TABLE IF NOT EXISTS skin_ban (
  player TEXT PRIMARY KEY,
  note   TEXT NOT NULL DEFAULT '',
  by     TEXT,
  at     INTEGER NOT NULL
);
