-- BUNNYFALL CRAFTING REWORK, PHASE 1 (2026-10-28) - SALVAGE ANYTHING.
--
-- A SALVAGE (`prof_salvages`, salvage.js salvagePieces): found gear broken
-- into the materials of the recipe that makes it (src/net/salvageLaw.js),
-- into the Stores as the character's own. Its row decides and answers a
-- request asked twice ((player, rid)); `yields` and `xp` are the roll's JSON.
CREATE TABLE IF NOT EXISTS prof_salvages (
  player   TEXT NOT NULL,
  rid      TEXT NOT NULL,
  char_id  TEXT NOT NULL,
  pieces   INTEGER NOT NULL CHECK (pieces > 0),
  yields   TEXT NOT NULL,
  xp       TEXT NOT NULL,
  at       INTEGER NOT NULL,
  n        TEXT NOT NULL,
  PRIMARY KEY (player, rid)
);
