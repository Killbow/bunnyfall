-- BUNNYFALL CRAFTING REWORK, PHASE 2 (2026-10-28) - UPGRADES.
--
-- A temper now reaches Masterwork (src/net/temperLaw.js TEMPER_TOP 4), so a
-- temper's row takes quality 4: the table is rebuilt with the wider check.
CREATE TABLE IF NOT EXISTS prof_tempers_new (
  player     TEXT NOT NULL,
  rid        TEXT NOT NULL,
  char_id    TEXT NOT NULL,
  recipe     TEXT NOT NULL,
  provenance TEXT,
  quality    INTEGER NOT NULL CHECK (quality BETWEEN 1 AND 4),
  material   TEXT NOT NULL,
  qty        INTEGER NOT NULL CHECK (qty > 0),
  xp         INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  at         INTEGER NOT NULL,
  n          TEXT NOT NULL,
  PRIMARY KEY (player, rid),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
INSERT INTO prof_tempers_new SELECT player, rid, char_id, recipe, provenance, quality, material, qty, xp, at, n FROM prof_tempers;
DROP TABLE prof_tempers;
ALTER TABLE prof_tempers_new RENAME TO prof_tempers;

-- A MATERIAL UPGRADE (`prof_upgrades`, upgrade.js upgradeMaterial): a found
-- piece one metal up, for part of the new metal's recipe from the Stores.
-- Its row decides and answers a request asked twice ((player, rid)).
CREATE TABLE IF NOT EXISTS prof_upgrades (
  player   TEXT NOT NULL,
  rid      TEXT NOT NULL,
  char_id  TEXT NOT NULL,
  recipe   TEXT NOT NULL,
  material TEXT NOT NULL,
  qty      INTEGER NOT NULL CHECK (qty > 0),
  xp       INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  at       INTEGER NOT NULL,
  n        TEXT NOT NULL,
  PRIMARY KEY (player, rid),
  FOREIGN KEY (player) REFERENCES players(id) ON DELETE CASCADE
);
