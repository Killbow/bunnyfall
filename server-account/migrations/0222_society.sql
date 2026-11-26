-- BUNNYFALL (2026-11-26, caverns): the Cartographers' Society (server-account/src/society.js, src/net/mine/societyLaw.js).
-- An account's Survey Seals and the wares bought with them (space-separated ids, as fest_wares), the contracts it has
-- turned in, and each character's one open contract.
ALTER TABLE players ADD COLUMN society_seals INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN society_wares TEXT NOT NULL DEFAULT '';
ALTER TABLE players ADD COLUMN society_done INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS society_contracts (
  player   TEXT NOT NULL,
  char_id  TEXT NOT NULL,
  ore      TEXT NOT NULL,
  n        INTEGER NOT NULL,
  seals    INTEGER NOT NULL,
  taken_at INTEGER NOT NULL,
  PRIMARY KEY (player, char_id)
);
