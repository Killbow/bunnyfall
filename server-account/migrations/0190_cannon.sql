-- BUNNYFALL (2026-11-05): THE GREAT CANNON BY WAYREST (src/net/cannonLaw.js, server-account/src/cannon.js) - one build the
-- whole realm gives to. `round` counts the cannons built; each fires toward Cromwark when whole (`fired_at`) and the next
-- begins. `cannon_got` holds what the current round has been given; a player's worth toward the next Nyx coin is kept.
CREATE TABLE IF NOT EXISTS cannon (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  round INTEGER NOT NULL DEFAULT 1,
  fired_at INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO cannon (id, round, fired_at) VALUES (1, 1, 0);
CREATE TABLE IF NOT EXISTS cannon_got (
  round INTEGER NOT NULL,
  material TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (round, material)
);
ALTER TABLE players ADD COLUMN cannon_pts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN cannon_given INTEGER NOT NULL DEFAULT 0;
